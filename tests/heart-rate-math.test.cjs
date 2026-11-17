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
    // 손가락 없이 잰 것: 맥파가 뚜렷해도 'good' 이 아니고 까닭을 적음, 맥파가 없으면 🔴
    const empty = H.simulate({ bpm: 70, dur: 20 }).map(f => Object.assign({}, f, { r: 120, g: 118, b: 117 }));
    const ea = H.analyze(empty);
    assert.notEqual(ea.level, 'good'); assert.ok(ea.reasons.some(r => /덮지 않은/.test(r)));
    const flat = H.simulate({ bpm: 70, dur: 20, amp: 0 }).map(f => Object.assign({}, f, { r: 120, g: 118, b: 117, y: 118 + Math.sin(f.t * 40) }));
    assert.equal(H.analyze(flat).level, 'bad');
    // 갤럭시 Z 플립6 실내처럼 빨강이 초록의 1.3 배뿐이어도 덮임으로 봄, 1.15 배는 '확인하세요'(🟡), 근거 숫자를 돌려줌
    const flip = H.quality(base.map(f => Object.assign({}, f, { r: 65, g: 50, b: 40 })));
    assert.equal(flip.covered, true); assert.equal(flip.level, 'good'); assert.equal(flip.rg, 1.3);
    const maybe = H.quality(base.map(f => Object.assign({}, f, { r: 57.5, g: 50, b: 40 })));
    assert.equal(maybe.level, 'fair'); assert.match(maybe.text, /덮었는지 확인/);
    assert.ok('R' in flip && 'G' in flip && 'B' in flip);
});

test('손목 맥박 ×4 · 오차 %', () => {
    assert.equal(H.palpBpm(18), 72);
    assert.equal(H.palpBpm(''), null);
    assert.equal(H.errorPct(75, 72), 4.2);
});

test('CSV: 내보내기 → 다시 읽기, phyphox 열 이름', () => {
    const fr = H.simulate({ bpm: 66, dur: 12, seed: 4 });
    const csv = H.toCsv(fr, { '회차': '안정 시' });
    assert.match(csv.split('\n')[1], /^t_s,R,G,Y,Y_corr,exposureTime,iso,locked,light$/);
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
    // 잠금 확인은 못 했어도 노출 값이 안 바뀌었으면 보정할 것이 없음 (선생님 자료)
    assert.equal(H.exposureMode('unlocked', still).mode, 'steady'); assert.equal(H.exposureMode('unlocked', still).correct, false);
    assert.equal(H.exposureMode('unlocked', wob).mode, 'corrected');
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
    assert.equal(row.length, 9);
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

// ---------- 어두울 때 반(1/2) 배수로 잡히던 문제 (선생님 실측: 갤럭시 Z 플립6, 어두우면 심박의 절반) ----------
// 가짜 신호: 약한 맥파(amp 0.004) + 그 절반 빠르기의 더 센 흔들림(subharm 0.01) → 고치기 전에는 X/2 로 잡혔음
const weakHalf = (bpm, seed) => H.simulate({ bpm, dur: 30, seed, amp: 0.004, noise: 0.004, subharm: 0.01, fps: 24, jitter: 0.4, dicrotic: 0.4, hrv: 0.04 });

test('약한 맥파 + 절반 빠르기 흔들림: 80~120 회/분이 절반으로 나오지 않음 (두 배 후보 검사)', () => {
    for (const bpm of [80, 90, 100, 120]) for (let seed = 1; seed <= 4; seed++) {
        const a = H.analyze(weakHalf(bpm, seed));
        near(a.bpm, bpm, 3, `${bpm} seed ${seed}`);
        assert.equal(a.doubled, true, '두 배로 바꿈 표시');
        assert.match(a.method, /두 배 후보 검사로 바꿈/);
        assert.ok(a.reasons.some(r => /두 배인/.test(r)));
        assert.equal(a.doubleCheck.sineLike, true, '절반 쪽이 사인파 같음');
    }
});

test('두 배 후보 검사가 멀쩡한 값을 망가뜨리지 않음: 밝은 맥파, 중복맥파 60회, 진짜 40회, 노출 출렁임', () => {
    for (let seed = 1; seed <= 4; seed++) {
        const a = H.analyze(H.simulate({ bpm: 70, dur: 30, seed }));
        near(a.bpm, 70, 3, '밝은 70'); assert.notEqual(a.doubled, true);
    }
    for (const d of [0.5, 0.8, 1.0]) for (let seed = 1; seed <= 4; seed++) {
        const a = H.analyze(H.simulate({ bpm: 60, dur: 30, seed, dicrotic: d, noise: 0.004 }));
        near(a.bpm, 60, 3, `중복맥파 ${d} seed ${seed} → 120 으로 바뀌면 안 됨`);
        assert.notEqual(a.doubled, true);
        assert.ok(a.doubleCheck.lock >= 0.9, '배음은 박자가 묶여 있음 ' + a.doubleCheck.lock);
    }
    let wrong = 0;
    for (const bpm of [36, 40, 45, 50, 55, 60, 70, 80, 90, 100]) for (const d of [0, 0.35, 0.6, 0.8, 1]) for (let seed = 1; seed <= 2; seed++) {
        const a = H.analyze(H.simulate({ bpm, dur: 30, seed, dicrotic: d, noise: 0.004 }));
        if (Math.abs(a.bpm - bpm) > 3) wrong++;
    }
    assert.equal(wrong, 0, '깨끗한 신호 100개');
    // 보정 안 한 노출 출렁임(40)은 두 배(80)로 바꾸지 않고 노출 경고로 둠
    const wob = H.analyze(H.simulate({ bpm: 67, dur: 30, seed: 1, physical: true, expBpm: 40, expFollow: 0 }));
    near(wob.bpm, 40, 3); assert.notEqual(wob.doubled, true); assert.equal(wob.exposure.warn, true);
    assert.equal(wob.doubleCheck.skipped, '노출 출렁임과 같은 빠르기');
});

test('밝기 판정: 밝음 / 맥파 약함(어두움) / 방이 어두움 / 아주 어두움', () => {
    const ok = H.analyze(H.simulate({ bpm: 70, dur: 30, seed: 1 }));
    assert.equal(ok.light.level, 'ok'); assert.equal(ok.level, 'good');
    assert.ok(!ok.reasons.some(r => /어두워/.test(r)));
    const weak = H.analyze(weakHalf(90, 1));
    assert.equal(weak.light.level, 'dim');
    assert.match(weak.light.text, /플래시/);
    assert.notEqual(weak.level, 'good');
    assert.ok(weak.reasons.some(r => /어두워서 신뢰도 낮음/.test(r)));
    const room = H.analyze(H.simulate({ bpm: 70, dur: 30, seed: 1 }), { scene: { y: 20, exposureTime: 500, iso: 3200 } });
    assert.equal(room.light.level, 'dim'); assert.match(room.light.text, /방이 어두웠/);
    // 노출을 길게(50 ms, ISO 3200) 잡은 카메라
    const longE = H.analyze(H.simulate({ bpm: 70, dur: 30, seed: 1 }).map(f => Object.assign({}, f, { exposureTime: 500, iso: 3200, e: 500 * 3200 })));
    assert.equal(longE.light.level, 'dim'); assert.match(longE.light.text, /노출을 길게/);
    // 손가락 밝기(빨강)가 아주 낮음
    const dark = H.analyze(H.simulate({ bpm: 70, dur: 30, seed: 1 }).map(f => Object.assign({}, f, { r: f.r / 6, g: f.g / 6, y: f.y / 6 })));
    // 아주 어두워도 맥파가 뚜렷하면 🟡, 약하면 🔴
    assert.equal(dark.light.level, 'dark'); assert.notEqual(dark.level, 'good');
    const darkWeak = H.analyze(H.simulate({ bpm: 70, dur: 30, seed: 1, amp: 0.003, noise: 0.01 }).map(f => Object.assign({}, f, { r: f.r / 6, g: f.g / 6, y: f.y / 6 })));
    assert.equal(darkWeak.light.level, 'dark'); assert.equal(darkWeak.level, 'bad');
    // CSV 에 밝기 판정 열
    const csv = H.toCsv(H.simulate({ bpm: 70, dur: 6, seed: 1 }), { locked: true, light: 'dim' }).trim().split('\n');
    assert.match(csv.find(l => l.startsWith('t_s')), /,light$/);
    assert.match(csv[csv.length - 1], /,1,dim$/);
});

test('어두워서 초록이 한 값(7)으로 굳고 빨강도 몇 단계뿐일 때: 초록을 쓰지 않아 절반으로 잡지 않음', () => {
    for (const bpm of [60, 72, 90]) for (let seed = 1; seed <= 3; seed++) {
        // 가짜 카메라 시험에서 실제로 나온 모양: 빨강 72·73 두 단계, 초록 늘 7
        const fr = H.simulate({ bpm, dur: 15, seed, amp: 0.02, noise: 0.002 }).map(f => {
            const r = Math.round(f.r / 180 * 72.5 * 4) / 4;
            return Object.assign({}, f, { r, g: 7, y: 0.299 * r + 0.587 * 7 });
        });
        const a = H.analyze(fr);
        assert.notEqual(a.channel, 'g', '평평한 초록은 쓰지 않음');
        near(a.bpm, bpm, 3, `${bpm} seed ${seed}`);
        assert.notEqual(a.light.level, 'ok', '어두움 표시');
    }
});

// ---------- 선생님 실측(갤럭시 Z 플립6): 그래프는 80회로 깨끗한데 '노출 보정으로 계산' 결과 39회 ----------
// 흉내: 화면 밝기에는 영향이 없는데 폰이 알려 주는 노출 값만 분당 40회로 출렁임(자동 노출 중 옛 값·딴 값) →
//  그 값으로 나누면 오히려 40회 가짜 흔들림이 생김 (main 의 계산은 40.2회·신뢰도 98% 로 잘못 냄)
test('노출 값이 엉터리여도(그림과 무관하게 40회로 출렁임) 보정 경로에서 80회가 39로 떨어지지 않음', () => {
    for (const amp of [0.02, 0.006]) for (let seed = 1; seed <= 4; seed++) {
        const fr = H.simulate({ bpm: 80, dur: 30, seed, amp, noise: 0.004, expBpm: 40, expAmp: 0.3, expFollow: 0, fps: 24, jitter: 0.4 });
        const a = H.analyzeRun('unlocked', fr);
        near(a.bpm, 80, 3, `amp ${amp} seed ${seed}`);
        assert.ok(a.alt && a.alt.raw && a.alt.corrected, '보정 전·후 결과를 둘 다 남김');
        assert.ok(['raw', 'corrected'].includes(a.alt.chosen));
    }
});

test('analyzeRun: 노출이 진짜로 밝기를 바꾸면(실제 67, 노출 40) 보정 쪽을 고름 · 고정됨이면 보정 안 함', () => {
    for (let seed = 1; seed <= 3; seed++) {
        const fr = H.simulate({ bpm: 67, dur: 30, seed, physical: true, expBpm: 40, expAmp: 0.3, expFollow: 0, fps: 24, jitter: 0.4, noise: 0.004 });
        const a = H.analyzeRun('unlocked', fr);
        near(a.bpm, 67, 3); assert.equal(a.alt.chosen, 'corrected'); assert.equal(a.mode.mode, 'corrected');
        near(a.alt.raw.bpm, 40, 3, '보정 전은 40');
    }
    const still = H.analyzeRun('locked', H.simulate({ bpm: 72, dur: 20, seed: 1, physical: true }));
    assert.equal(still.mode.mode, 'locked'); assert.equal(still.alt, undefined); near(still.bpm, 72, 3);
    const none = H.analyzeRun('unlocked', H.simulate({ bpm: 72, dur: 20, seed: 1 }).map(f => Object.assign({}, f, { e: null, exposureTime: null, iso: null })));
    assert.equal(none.mode.mode, 'nocorrect'); near(none.bpm, 72, 3);
});

test('그래프에 보이는 봉우리 간격이 고르면 두 배로 (넓은 대역 봉우리 검사)', () => {
    // 약한 80회 맥파 + 더 센 40회 흔들림, 중복맥파 없음 → 눈에 보이는 봉우리는 0.75초 간격
    for (let seed = 1; seed <= 4; seed++) {
        const a = H.analyze(H.simulate({ bpm: 80, dur: 30, seed, amp: 0.006, noise: 0.002, subharm: 0.008, dicrotic: 0, fps: 30, jitter: 0.3, hrv: 0.03 }));
        near(a.bpm, 80, 3, 'seed ' + seed);
    }
    // 중복맥파가 같은 높이(1.0)여도 간격이 0.35·0.65 로 번갈아 넓은 대역 검사에 안 걸림
    for (let seed = 1; seed <= 4; seed++) {
        const a = H.analyze(H.simulate({ bpm: 55, dur: 30, seed, dicrotic: 1.0, noise: 0.004 }));
        near(a.bpm, 55, 3, '중복맥파 55 seed ' + seed);
        assert.ok(!(a.doubleCheck.cvBroad < 0.12), '번갈아 간격 ' + a.doubleCheck.cvBroad);
    }
});

// ---------- 선생님 실측 원본 4회차 (갤럭시 Z 플립6, 어두움·ISO 27 잠금, tests/fixtures/heart-rate/README.md) ----------
// 정답에 가까운 값: 네 회차 모두 약 77~79 회/분 (통합 관리 세션 분석, 빨강 채널 봉우리·FFT). 앱은 r5·r6 을 37 로 절반 계산했었음
test('선생님 실측 4회차: 모두 77~79 ± 3, 절반으로 떨어지지 않음', () => {
    const fs = require('node:fs'), path = require('node:path');
    const dir = path.join(__dirname, 'fixtures', 'heart-rate');
    const want = { r3: 77, r5: 77, r6: 78, r7: 79 };
    for (const r of Object.keys(want)) {
        const p = H.parseCsv(fs.readFileSync(path.join(dir, 'zflip6-2026-11-17-' + r + '.csv'), 'utf8'));
        const a = H.analyzeRun('csv', p.frames);
        near(a.bpm, want[r], 3, r);
        assert.equal(a.channel !== 'g', true, r + ' 초록(가장 어두움)은 쓰지 않음');
        assert.equal(a.mode.mode, 'steady', r + ' 노출 값이 그대로라 보정 안 함');
        assert.equal(a.quality.covered, true, r + ' 덮임');
        assert.notEqual(a.level, 'bad', r + ' 맥파가 뚜렷하니 🔴 아님');
        assert.equal(a.light.level, 'dark', r + ' 아주 어두움 알림');
        if (r === 'r5') { assert.ok(a.cutAt > 12 && a.cutAt < 19, 'r5 손가락 떨어진 곳 ' + a.cutAt); assert.ok(a.reasons.some(x => /손가락이 떨어진/.test(x))); }
        else assert.equal(a.cutAt, undefined, r + ' 자르지 않음');
        // 예전처럼 억지로 보정 경로로 계산해도 절반이 되지 않음
        const c = H.analyze(p.frames, { correct: true });
        near(c.bpm, want[r], 3, r + ' 보정 경로');
    }
});
