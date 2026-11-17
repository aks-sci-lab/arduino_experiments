// 스마트폰 카메라 심박수 계산 (js/heart-rate-math.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/heart-rate-math.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≈ ${b} ± ${tol}`);

test('가짜 맥파 60·90·120 회/분 복원 (±3), 잡음·고르지 않은 간격·중복맥파 포함', () => {
    for (const bpm of [60, 90, 120]) for (let seed = 1; seed <= 6; seed++) {
        const a = H.analyze(H.simulate({ bpm, dur: 30, seed, fps: 24, jitter: 0.5, noise: 0.006, dicrotic: 0.5 }));
        assert.ok(a.ok, 'ok');
        near(a.bpm, bpm, 3, `${bpm} seed ${seed}`);
        assert.notEqual(a.level, 'bad', `${bpm} seed ${seed} 신뢰도`);
    }
});

test('분당 40회도 잘리지 않음 (0.6 Hz 대역, 0.7 로 자르면 잘림)', () => {
    for (let seed = 1; seed <= 5; seed++) {
        const a = H.analyze(H.simulate({ bpm: 40, dur: 30, seed }));
        near(a.bpm, 40, 3, 'seed ' + seed);
        near(a.bpmFFT, 40, 3, 'FFT seed ' + seed);
    }
    assert.equal(H.BAND[0], 0.6);
    // 대역 거르기가 0.667 Hz 사인파를 거의 그대로 둠
    const fs = 30, y = Array.from({ length: 900 }, (_, i) => Math.sin(2 * Math.PI * (40 / 60) * i / fs));
    const f = H.bandpass(y, fs);
    const rms = a => Math.sqrt(H.mean(a.slice(150, 750).map(v => v * v)));
    assert.ok(rms(f) / rms(y) > 0.95, '40 회/분 통과 ' + rms(f) / rms(y));
    // 0.3 Hz (분당 18) 는 거의 없앰
    const y2 = Array.from({ length: 900 }, (_, i) => Math.sin(2 * Math.PI * 0.3 * i / fs));
    assert.ok(rms(H.bandpass(y2, fs)) / rms(y2) < 0.05, '느린 변화 제거');
});

test('잡음이 큰 경우에도 두 박동을 한 주기로 보지 않음 (45~150 회/분, 84개)', () => {
    let bad = 0;
    for (const bpm of [45, 60, 75, 90, 120, 150]) for (let seed = 1; seed <= 14; seed++) {
        const a = H.analyze(H.simulate({ bpm, dur: 20, seed, noise: 0.012, dicrotic: 0.6, jitter: 0.5, fps: 24, hrv: 0.06 }));
        if (!(Math.abs(a.bpm - bpm) <= 4)) bad++;
    }
    assert.ok(bad <= 2, '틀린 개수 ' + bad);
});

test('중복맥파(작은 두 번째 봉우리)를 두 번 세지 않음', () => {
    for (const d of [0.5, 0.8, 1.0]) {
        const a = H.analyze(H.simulate({ bpm: 70, dur: 30, seed: 3, dicrotic: d, noise: 0.004 }));
        near(a.bpm, 70, 3, 'dicrotic ' + d);
        // 봉우리 수 ≈ 30초 × 70/60 = 35
        assert.ok(a.peaks.length >= 30 && a.peaks.length <= 37, '봉우리 ' + a.peaks.length);
        assert.ok(a.ibi.every(x => x > 0.6 * 60000 / 70), '최소 간격');
    }
});

test('고르지 않은 간격(33~67 ms, 약 24장/초)을 고른 간격으로 보간', () => {
    const fr = H.simulate({ bpm: 80, dur: 20, fps: 20, jitter: 0.33, seed: 9 });
    const gaps = fr.slice(1).map((f, i) => f.t - fr[i].t);
    assert.ok(Math.min(...gaps) < 0.036 && Math.max(...gaps) > 0.064, '간격이 들쭉날쭉');
    const rs = H.resample(fr.map(f => f.t), fr.map(f => f.y), 30);
    assert.equal(rs.fs, 30);
    near(rs.y.length, Math.floor(20 * 30) + 1, 3);
    near(H.analyze(fr).bpm, 80, 3);
    // 직선은 보간해도 직선
    const lin = H.resample([0, 0.04, 0.1, 0.15], [0, 4, 10, 15], 100);
    lin.y.forEach((v, i) => near(v, i, 1e-9));
});

test('노출이 심박 범위에서 출렁이면 경고, 고정이면 경고 없음', () => {
    // 선생님 자료처럼: 노출(셔터)이 분당 40회로 출렁이고 밝기에 그 흔적이 남음
    const wob = H.analyze(H.simulate({ bpm: 75, dur: 30, expBpm: 40, expAmp: 0.33, expFollow: 0.5, amp: 0.01, seed: 2 }));
    assert.equal(wob.exposure.available, true);
    assert.equal(wob.exposure.warn, true);
    near(wob.exposure.bpm, 40, 3);
    assert.match(wob.exposure.text, /40회/);
    assert.notEqual(wob.level, 'good');
    assert.ok(wob.reasons.some(r => /노출/.test(r)));
    const fixed = H.analyze(H.simulate({ bpm: 75, dur: 30, seed: 2 }));
    assert.equal(fixed.exposure.warn, false);
    assert.match(fixed.exposure.text, /바뀌지 않았/);
    // 노출 값이 없으면 (아이폰 등) '읽을 수 없음'
    const noe = H.analyze(H.simulate({ bpm: 75, dur: 30, seed: 2 }).map(f => Object.assign({}, f, { e: null })));
    assert.equal(noe.exposure.available, false);
});

test('신호 품질: 덮지 않음·어두움·포화·움직임', () => {
    const base = Array.from({ length: 30 }, (_, i) => ({ t: i / 30, r: 180, g: 30, y: 72, s: 0 }));
    assert.equal(H.quality(base).level, 'good');
    assert.equal(H.quality(base.map(f => Object.assign({}, f, { r: 120, g: 110 }))).level, 'bad');         // 손가락 없음 (흰 화면)
    assert.match(H.quality(base.map(f => Object.assign({}, f, { r: 120, g: 110 }))).text, /덮어/);
    assert.match(H.quality(base.map(f => Object.assign({}, f, { r: 3, g: 1 }))).text, /어두워/);
    assert.equal(H.quality(base.map(f => Object.assign({}, f, { s: 0.9 }))).level, 'fair');
    const moved = base.map((f, i) => Object.assign({}, f, { y: i === 15 ? 110 : 72 }));
    assert.match(H.quality(moved).text, /움직임/);
    // 손가락 없이 잰 것은 신뢰도 나쁨
    const empty = H.simulate({ bpm: 70, dur: 20 }).map(f => Object.assign({}, f, { r: 120, g: 118, b: 117 }));
    assert.equal(H.analyze(empty).level, 'bad');
});

test('손목 맥박 ×4 · 오차 %', () => {
    assert.equal(H.palpBpm(18), 72);
    assert.equal(H.palpBpm(''), null);
    assert.equal(H.errorPct(75, 72), 4.2);
});

test('CSV: 내보내기 → 다시 읽기, phyphox 열 이름', () => {
    const fr = H.simulate({ bpm: 66, dur: 12, seed: 4 });
    const csv = H.toCsv(fr, { '회차': '안정 시' });
    assert.match(csv.split('\n')[1], /^t_s,R,G,Y,Y_corr,exposureTime,iso,locked$/);
    const back = H.parseCsv(csv);
    assert.equal(back.meta['회차'], '안정 시');
    assert.equal(back.frames.length, fr.length);
    near(H.analyze(back.frames).bpm, 66, 3);
    // phyphox: "Time (s)","Luma","Luminance","Shutter Speed (s)","Aperture","ISO" (Luma 0~1)
    const ph = ['"Time (s)","Luma","Luminance","Shutter Speed (s)","Aperture","ISO"'];
    fr.forEach(f => ph.push([f.t, (f.y / 255).toFixed(5), 1, (f.exposureTime / 10000).toFixed(5), 1.8, 1600].join(',')));
    const p = H.parseCsv(ph.join('\n'));
    assert.equal(p.from, 'phyphox');
    assert.ok(p.frames[0].y > 1, 'Luma 0~1 → 0~255');
    near(H.analyze(p.frames).bpm, 66, 3);
    assert.ok(p.frames[0].e > 0, '셔터 × ISO');
    assert.match(H.parseCsv('a,b\n1,2').error, /열을 찾지/);
});

test('노출 보정: 실제 67회 + 노출 출렁임 40회 → 보정 전 40회, 보정 뒤 67회 (±3)', () => {
    for (let seed = 1; seed <= 6; seed++) {
        const fr = H.simulate({ bpm: 67, dur: 30, seed, physical: true, expBpm: 40, expAmp: 0.3, expFollow: 0, fps: 24, jitter: 0.4, noise: 0.004 });
        const raw = H.analyze(fr);
        near(raw.bpm, 40, 3, '보정 전 seed ' + seed);
        assert.equal(raw.exposure.warn, true, '보정 전 경고');
        const m = H.exposureMode('unlocked', fr);
        assert.equal(m.mode, 'corrected'); assert.equal(m.correct, true);
        const cor = H.analyze(fr, { correct: m.correct });
        assert.equal(cor.corrected, true);
        near(cor.bpm, 67, 3, '보정 뒤 seed ' + seed);
        assert.equal(cor.exposure.warn, false); assert.equal(cor.exposure.wobble !== undefined, true);
        assert.notEqual(cor.level, 'bad');
    }
});

test('노출 처리 방식: 고정됨 / 잠갔는데 바뀜 / 고정 안 됨 / 노출 값 없음', () => {
    const still = H.simulate({ bpm: 67, dur: 20, seed: 1, physical: true });
    const wob = H.simulate({ bpm: 67, dur: 20, seed: 1, physical: true, expBpm: 40, expFollow: 0 });
    assert.equal(H.exposureMode('locked', still).mode, 'locked');
    assert.equal(H.exposureMode('locked', still).correct, false);
    near(H.analyze(still).bpm, 67, 3, '고정됨: 그대로');
    assert.equal(H.exposureMode('locked', wob).mode, 'corrected', '잠갔다는데 노출이 바뀌면 보정');
    assert.match(H.exposureMode('locked', wob).text, /바뀜/);
    assert.equal(H.exposureMode('unlocked', still).mode, 'corrected');
    const none = still.map(f => Object.assign({}, f, { e: null, exposureTime: null, iso: null }));
    const m = H.exposureMode('unlocked', none);
    assert.equal(m.mode, 'nocorrect'); assert.equal(m.correct, false);
    assert.match(m.text, /보정 못 함/);
    assert.equal(H.analyze(none, { correct: true }).corrected, false, '노출 값이 없으면 보정 안 함');
});

test('감마: sRGB ↔ 선형, 보정 밝기 = 선형 × 기준 노출 ÷ 노출', () => {
    [0, 10, 50, 128, 200, 255].forEach(v => near(H.toSrgb(H.toLinear(v)), v, 1e-6));
    near(H.toLinear(255), 1, 1e-12); near(H.toLinear(128), 0.2158, 1e-3);
    const fr = [{ t: 0, r: 128, g: 128, y: 128, e: 100 }, { t: 0.1, r: 128, g: 128, y: 128, e: 200 }, { t: 0.2, r: 128, g: 128, y: 128, e: 200 }];
    const c = H.correctExposure(fr);
    near(c[0].y / c[1].y, 2, 1e-9, '노출이 두 배면 보정 밝기는 반');
    assert.equal(H.correctExposure([{ t: 0, r: 1, g: 1, y: 1 }]), null);
    near(H.exposureVariation(fr), 100 / (500 / 3) * 100, 1e-9);
    // 저장 모양 왕복
    const sim = H.simulate({ bpm: 70, dur: 10, seed: 2 });
    const back = H.unpack(H.pack(sim));
    assert.equal(back.length, sim.length);
    near(back[10].t, sim[10].t - sim[0].t, 0.001); near(back[10].e, sim[10].e, 1);
});

test('CSV: 보정 밝기·고정 여부 열', () => {
    const fr = H.simulate({ bpm: 67, dur: 10, seed: 1, physical: true, expBpm: 40, expFollow: 0 });
    const lines = H.toCsv(fr, { locked: false }).trim().split('\n').filter(l => !l.startsWith('#'));
    const row = lines[1].split(',');
    assert.equal(row.length, 8);
    assert.ok(Number(row[4]) > 0, 'Y_corr');
    assert.equal(row[7], '0');
    assert.equal(H.toCsv(fr, { locked: true }).trim().split('\n').pop().split(',')[7], '1');
    const nf = H.toCsv(fr.map(f => Object.assign({}, f, { e: null, exposureTime: null, iso: null })), {}).trim().split('\n').pop().split(',');
    assert.equal(nf[4], '', '노출 값이 없으면 보정 밝기 빈칸');
});

test('노출 값이 사진보다 늦게 기록돼도(0.05~0.3초) 어긋남을 찾아 보정 → 67회', () => {
    for (const lag of [0.05, 0.1, 0.2, 0.3, -0.1]) {
        const fr = H.simulate({ bpm: 67, dur: 30, seed: 1, physical: true, expBpm: 40, expAmp: 0.3, expFollow: 0, fps: 24, jitter: 0.4, noise: 0.004, expLag: lag });
        const a = H.analyze(fr, { correct: true });
        near(a.expLag, lag, 0.04, '찾은 어긋남');
        near(a.bpm, 67, 3, 'lag ' + lag);
        // 어긋남을 무시하면(0 으로 고정) 노출 출렁임이 남음
        if (lag >= 0.2) assert.ok(Math.abs(H.analyze(H.correctExposure(fr, { lag: 0 }).map(f => Object.assign({}, f, { e: null }))).bpm - 67) > 3, '어긋남 무시하면 틀림 ' + lag);
    }
});
