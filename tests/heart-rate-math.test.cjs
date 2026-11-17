// 스마트폰 카메라 심박수 계산 (js/heart-rate-math.js) · 조 공유 자료 (js/heart-rate-share.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/heart-rate-math.js');
const HS = require('../js/heart-rate-share.js');

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
    assert.match(csv.split('\n')[1], /^t_s,R,G,Y,exposureTime,iso$/);
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

test('회복 그래프: 운동 직후 기준 분', () => {
    const t0 = Date.parse('2026-11-17T01:00:00Z');
    const at = m => new Date(t0 + m * 60000).toISOString();
    const pts = H.recovery([{ at: at(-5), label: '안정 시', bpm: 72 }, { at: at(0), label: '운동 직후', bpm: 140 }, { at: at(1), label: '1분 뒤', bpm: 110 }, { at: at(3), label: '3분 뒤', bpm: 90 }]);
    assert.deepEqual(pts.map(p => p.x), [-5, 0, 1, 3]);
    assert.deepEqual(pts.map(p => p.y), [72, 140, 110, 90]);
    // 운동 직후가 없으면 첫 회차 기준
    assert.equal(H.recovery([{ at: at(2), label: '기타', bpm: 80 }, { at: at(4), label: '기타', bpm: 75 }])[1].x, 2);
});

test('조 공유 자료: 보내기 → 받기 (원본 포함, 서버 한도 안)', () => {
    const fr = H.simulate({ bpm: 88, dur: 60, fps: 30, seed: 7 });
    const raw = HS.fromFrames(fr);
    const res = H.analyze(HS.toFrames(raw));
    near(res.bpm, 88, 3);
    const runs = [{ id: 'r1', at: '2026-11-17T01:00:00.000Z', label: '운동 직후', lock: 'locked', palp: 22, raw, res: { bpm: res.bpm, conf: res.conf, level: res.level, ibi: res.ibi, exposure: res.exposure } },
        { id: 'r2', at: '2026-11-17T01:01:00.000Z', label: '1분 뒤', lock: 'sim', sim: true, raw: raw.slice(0, 300), res: { bpm: 70 } }];
    const items = HS.buildItems(runs);
    assert.equal(items.length, 2);
    assert.equal(items[0].title, '운동 직후');
    assert.equal(items[1].title, '1분 뒤 (시뮬레이션)');
    assert.equal(items[0].summary['손목(회/분)'], 88);
    assert.equal(items[0].summary['노출 고정'], '됨');
    assert.equal('손목(회/분)' in items[1].summary, false, '빈 값은 뺌');
    assert.equal(items[0].at, runs[0].at);
    Object.keys(items[0].summary).forEach(k => assert.ok(k.length <= 30 && !k.includes('|'), k));
    assert.ok(JSON.stringify(items[0].data).length < 270000, '자료 크기');
    assert.equal(items[0].data.raw.length, raw.length, '60초 30장/초는 줄이지 않음');
    // 받는 쪽 (ClassShare.incomingFrom 모양)
    const inc = items.map(it => Object.assign({}, it, { device: 'pAB12', from: '📱 폰 AB12' }));
    const r1 = HS.applyIncoming({}, inc);
    assert.equal(r1.changed, true);
    const e = r1.ext['pAB12/r1'];
    assert.equal(e.label, '운동 직후'); assert.equal(e.palp, 22); assert.equal(e.bpm, res.bpm);
    near(H.analyze(HS.toFrames(e.raw)).bpm, 88, 3);
    assert.equal(HS.applyIncoming(r1.ext, inc).changed, false);
    // 지운 회차(n=0)는 빠짐
    const r2 = HS.applyIncoming(r1.ext, [Object.assign({}, inc[0], { n: 0 }), inc[1]]);
    assert.deepEqual(Object.keys(r2.ext), ['pAB12/r2']);
    // 회복 그래프 묶음: 시뮬레이션은 빼고, 출처별
    const g = HS.recoveryGroups(runs, r1.ext);
    assert.deepEqual(g.map(x => x.name), ['내 기록', '📱 폰 AB12']);
    assert.equal(g[0].points.length, 1);
    // 아주 긴 원본은 고르게 솎아 한도 안
    const big = Array.from({ length: 12000 }, (_, i) => [i * 33, 180.12, 30.45, 72.33, 333.333, 800, 0]);
    assert.ok(JSON.stringify(HS.fitRaw(big)).length <= HS.MAX_CHARS);
});
