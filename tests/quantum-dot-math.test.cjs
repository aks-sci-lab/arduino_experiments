// 탄소 양자점 형광 실험 계산 시험 (js/quantum-dot-math.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../js/quantum-dot-math.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` ${a} ≈ ${b} ± ${tol}`);

// 가짜 스펙트럼 그림: 가로 x 화소가 nm = 380 + 0.6·x (오른쪽이 빨강). lines: [{ nm, w(σ, nm), amp(0~1) }]
function spectrumImage(lines, opt) {
    const o = opt || {}, W = o.width || 600, H = 40, data = new Uint8ClampedArray(W * H * 4);
    const nmAt = x => (o.reverse ? 739.4 - 0.6 * x : 380 + 0.6 * x);
    for (let x = 0; x < W; x++) {
        const nm = nmAt(x);
        let I = 0;
        lines.forEach(l => { I += l.amp * Math.exp(-0.5 * ((nm - l.nm) / l.w) ** 2); });
        I = Math.min(1, I);
        // 파장에 따른 대략의 색 (선형 밝기 → sRGB 8비트)
        const col = nm < 490 ? [0.2, 0.3, 1] : nm < 575 ? [0.3, 1, 0.2] : [1, 0.35, 0.1];
        const to8 = v => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
        for (let y = 0; y < H; y++) {
            const k = (y * W + x) * 4, band = y >= 12 && y <= 28 ? 1 : 0.02;
            for (let c = 0; c < 3; c++) data[k + c] = to8(I * band * col[c] * 0.9 + 0.004);
            data[k + 3] = 255;
        }
    }
    return { data, width: W, height: H };
}
const LAMP = [{ nm: 435.8, w: 1.5, amp: 0.7 }, { nm: 546.1, w: 1.5, amp: 1 }, { nm: 611.6, w: 2, amp: 0.8 }, { nm: 487, w: 2, amp: 0.15 }];

test('색상 → 파장 추정: 무지개 순서, 자홍은 없음', () => {
    assert.equal(Math.round(Q.hueToWavelength(0)), 640);
    assert.equal(Math.round(Q.hueToWavelength(120)), 530);
    assert.equal(Math.round(Q.hueToWavelength(240)), 455);
    assert.equal(Q.hueToWavelength(300), null, '자홍은 한 파장 색이 아님');
    assert.equal(Math.round(Q.hueToWavelength(350)), 640, '거의 빨강');
    // 파란 형광(R 40, G 90, B 230) → 약 460~480 nm
    const blue = Q.colorInfo(40, 90, 230);
    assert.ok(blue.lambda > 455 && blue.lambda < 485, String(blue.lambda));
    const green = Q.colorInfo(60, 220, 90);
    assert.ok(green.lambda > 515 && green.lambda < 545, String(green.lambda));
    // 영역 평균
    const px = new Uint8ClampedArray([40, 90, 230, 255, 40, 90, 230, 255]);
    const st = Q.regionStats(px);
    assert.equal(st.r, 40); assert.equal(st.b, 230);
    assert.ok(st.Y > 0 && st.Y < 1);
});

test('간이 분광기: 형광등 사진으로 화소→파장 직선 맞춤, 시료 봉우리 450 nm 를 ±5 nm', () => {
    const lamp = spectrumImage(LAMP);
    const prof = Q.lineProfile(lamp, 0, 20, 599, 20, 9);
    assert.equal(prof.y.length, 600);
    const peaks = Q.findPeaks(prof.y);
    assert.ok(peaks.length >= 3, '봉우리 3개 이상');
    const pairs = Q.suggestLamp(prof, peaks);
    assert.deepEqual(pairs.map(p => p.nm), [435.8, 546.1, 611.6]);
    const cal = Q.fitCalibration(pairs);
    near(cal.b, 0.6, 0.01, '기울기');
    near(cal.a, 380, 2, '절편');
    assert.ok(cal.r2 > 0.9999);
    // 시료: 450 nm 중심, 폭 넓은 형광
    const sample = spectrumImage([{ nm: 450, w: 25, amp: 0.8 }]);
    const sp = Q.analyzeSpectrum(Q.lineProfile(sample, 0, 20, 599, 20, 9), cal);
    near(sp.peakNm, 450, 5, '봉우리 파장');
    near(sp.fwhmNm, 2.355 * 25, 8, '반치폭');
    assert.equal(sp.grid.length, Q.gridLen());
    const gi = sp.grid.indexOf(1);
    near(Q.gridNm(gi), 450, 6, '파장 눈금 곡선의 최대');
    // 직선 두 점만으로도 맞춤
    const two = Q.fitCalibration([{ px: 100, nm: 436 }, { px: 300, nm: 546 }]);
    near(Q.pxToNm(two, 200), 491, 1e-9);
    assert.equal(Q.fitCalibration([{ px: 100, nm: 436 }]), null);
});

test('간이 분광기: 빨강이 왼쪽인 사진도 자동 짝짓기가 방향을 맞춤, 비스듬한 선', () => {
    const lamp = spectrumImage(LAMP, { reverse: true });
    const prof = Q.lineProfile(lamp, 0, 20, 599, 20, 9);
    const pairs = Q.suggestLamp(prof, Q.findPeaks(prof.y));
    assert.deepEqual(pairs.map(p => p.nm), [611.6, 546.1, 435.8]);
    const cal = Q.fitCalibration(pairs);
    near(cal.b, -0.6, 0.01);
    const sample = spectrumImage([{ nm: 520, w: 20, amp: 0.7 }], { reverse: true });
    near(Q.analyzeSpectrum(Q.lineProfile(sample, 0, 20, 599, 20, 9), cal).peakNm, 520, 5);
    // 약간 기울어진 선(띠 안)이어도 길이에 맞게 화소를 고름
    const tilted = Q.lineProfile(sample, 0, 16, 599, 24, 5);
    assert.equal(tilted.y.length, 600);
});

test('카메라 설정값: EV₁₀₀·조도, 보정 밝기, 노출 값이 없으면 없음', () => {
    // N=1.8, t=1/50 s, ISO 100 → EV = log2(3.24·50) = 7.34
    near(Q.ev100(1 / 50, 100, 1.8), Math.log2(1.8 * 1.8 * 50), 1e-12);
    near(Q.ev100(1 / 50, 400, 1.8), Math.log2(1.8 * 1.8 * 50) - 2, 1e-12, 'ISO 4배 → EV 2 작음');
    near(Q.luxFromEv(10), 2.5 * 1024, 1e-9);
    assert.equal(Q.ev100(0, 100, 1.8), null);
    // 브라우저 exposureTime 은 100 µs 단위: 200 → 20 ms
    const cam = Q.cameraInfo({ exposureTime: 200, iso: 200, colorTemperature: 5000 }, 1.8);
    assert.equal(cam.exposureMs, 20);
    near(cam.ev, Math.log2(3.24 / 0.02) - 1, 0.01);
    near(cam.lux, 2.5 * Math.pow(2, cam.ev), 0.5);
    assert.equal(cam.colorTemp, 5000);
    const none = Q.cameraInfo({}, 1.8);
    assert.equal(none.exposureMs, null); assert.equal(none.ev, null); assert.equal(none.colorTemp, null);
    // 보정 밝기: 노출 2배·ISO 반이면 같은 값
    near(Q.correctedBrightness(0.2, 0.02, 200), Q.correctedBrightness(0.2, 0.04, 100), 1e-12);
    near(Q.correctedBrightness(0.2, 0.01, 100), 20, 1e-12);
    assert.equal(Q.correctedBrightness(0.2, null, 100), null);
});

test('E = hc/λ', () => {
    near(Q.photonEv(450), 2.755, 0.001);
    near(Q.photonEv(620), 2.0, 0.001);
    assert.equal(Q.photonEv(0), null);
});

const S1 = { no: 1, at: '2026-11-18T01:02:03.000Z', heatS: 120, citric: 1, urea: 2, water: 10, dilution: '1:10', light: '365 nm', memo: '첫 시료, "파랑"',
    photo: Q.colorInfo(40, 90, 230), spec: { peakNm: 452.3, fwhmNm: 60.1, grid: [0, 0.5, 1, null], cal: { a: 380, b: 0.6 } },
    cam: { exposureMs: 20, iso: 200, colorTemp: 5000, N: 1.8, locked: true, ev: 6.02, lux: 162 } };
const S2 = { no: 2, heatS: 300, citric: 1, urea: 1, photo: Q.colorInfo(60, 220, 90), cam: { exposureMs: null, iso: null, N: 1.8, locked: false } };

test('시료 대표 값·요약(서버 이름 규칙)·보낼 묶음', () => {
    const m = Q.metrics(S1);
    assert.equal(m.lambda, 452.3); assert.equal(m.lambdaFrom, 'spec');
    near(m.energy, 1239.84 / 452.3, 0.001);
    near(m.corr, S1.photo.Y / (0.02 * 2), 1e-4);
    assert.equal(Q.metrics(S2).lambdaFrom, 'hue');
    assert.equal(Q.metrics(S2).corr, null, '노출 값 없으면 보정 밝기 없음');
    assert.equal(Q.ratioLabel(S1), '1:2');
    const items = Q.buildItems([S1, S2]);
    assert.deepEqual(items.map(i => i.id), ['s1', 's2']);
    assert.equal(items[0].title, '시료 1 · 120초 · 1:2');
    items.forEach(it => Object.keys(it.summary).forEach(k => assert.match(k, /^[^|\u0000-\u001f]{1,30}$/)));
    assert.equal(items[0].summary['봉우리(nm)'], 452.3);
    assert.equal(items[1].summary['색 추정(nm)'], S2.photo.lambda);
    // 받은 쪽: 기기별로, 같은 목록이면 바뀐 것 없음
    const inc = items.map(i => Object.assign({ device: 'pab12', from: '📱 폰 AB12' }, i));
    const r = Q.applyIncoming({}, inc);
    assert.equal(r.changed, true);
    assert.equal(Q.applyIncoming(r.ext, inc).changed, false);
    const all = Q.allSamples([], r.ext);
    assert.equal(all.length, 2); assert.equal(all[0].source, '📱 폰 AB12'); assert.equal(all[0].spec.peakNm, 452.3);
    assert.equal(Q.applyIncoming(r.ext, [{ device: 'x', id: 'bad', data: 'nope' }]).changed, true);
});

test('CSV: 쓰고 다시 읽으면 같은 값 (쉼표·따옴표 메모, 분광 곡선, 노출 값 없음)', () => {
    const csv = Q.toCsv([S1, S2]);
    assert.match(csv.split('\n')[1], /^source,no,at,heat_s/);
    const r = Q.parseCsv(csv);
    assert.equal(r.error, undefined);
    assert.equal(r.samples.length, 2);
    const a = r.samples[0];
    assert.equal(a.memo, '첫 시료, "파랑"');
    assert.equal(a.heatS, 120); assert.equal(a.urea, 2);
    assert.equal(a.spec.peakNm, 452.3);
    assert.deepEqual(a.spec.grid, [0, 0.5, 1, null]);
    assert.equal(a.cam.exposureMs, 20); assert.equal(a.cam.locked, true);
    near(a.cam.ev, Q.ev100(0.02, 200, 1.8), 0.01);
    assert.equal(a.photo.b, 230);
    assert.equal(r.samples[1].cam.exposureMs, null);
    assert.equal(r.samples[1].cam.locked, false);
    assert.match(Q.parseCsv('a,b\n1,2').error, /CSV/);
});
