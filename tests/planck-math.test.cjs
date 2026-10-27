const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/planck-math.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` ${a} vs ${b}`);

// 문턱 전압 vt 위에서 직선으로 늘어나는 I–V (mA), 그 아래는 아주 작은 지수 전류
function ledIV(vt, slope, vs) {
    return vs.map(v => ({ v, i: v > vt ? slope * (v - vt) : 0.001 * Math.exp((v - vt) / 0.05) }));
}

test('leastSquares recovers slope, intercept and gives zero error for exact data', () => {
    const xs = [1, 2, 3, 4, 5], ys = xs.map(x => 2.5 * x - 1);
    const f = P.leastSquares(xs, ys);
    near(f.slope, 2.5, 1e-12); near(f.intercept, -1, 1e-12);
    near(f.sSlope, 0, 1e-12); near(f.r2, 1, 1e-12);
});

test('leastSquares standard error matches the textbook formula', () => {
    const xs = [1, 2, 3, 4], ys = [1.1, 1.9, 3.2, 3.8];
    const f = P.leastSquares(xs, ys);
    // 손으로 계산: Sxy = 4.7, Sxx = 5 → slope = 0.94, intercept = 0.15, SSR = 0.082, s² = 0.041
    near(f.slope, 0.94, 1e-12); near(f.intercept, 0.15, 1e-12);
    near(f.sSlope, Math.sqrt(0.041 / 5), 1e-12);
});

test('leastSquares through the origin', () => {
    const f = P.leastSquares([1, 2, 3], [2, 4, 6], { origin: true });
    near(f.slope, 2, 1e-12); assert.equal(f.intercept, 0);
    assert.equal(P.leastSquares([2, 2], [1, 3]), null);
});

test('extrapolation finds where the straight part of the I–V curve meets I = 0', () => {
    const vs = []; for (let v = 1.5; v <= 2.21; v += 0.05) vs.push(+v.toFixed(2));
    const r = P.thresholdByExtrapolation(ledIV(1.8, 40, vs), 1);
    near(r.v0, 1.8, 1e-9);
    assert.ok(r.used >= 2);
    assert.ok(P.thresholdByExtrapolation(ledIV(1.8, 40, [1.5, 1.6]), 1).error);
});

test('reference current threshold interpolates on a log scale', () => {
    const pts = [{ v: 1.6, i: 0.01 }, { v: 1.7, i: 1 }, { v: 1.5, i: 0 }];
    // ln 보간: 0.1 mA 는 0.01 과 1 의 로그 중간 → 1.65 V
    near(P.thresholdAtCurrent(pts, 0.1).v0, 1.65, 1e-12);
    // 0 mA 와 이웃하면 직선 보간
    near(P.thresholdAtCurrent([{ v: 1, i: 0 }, { v: 2, i: 0.2 }], 0.1).v0, 1.5, 1e-12);
    assert.ok(P.thresholdAtCurrent(pts, 5).error);
    assert.ok(P.thresholdAtCurrent([{ v: 2, i: 3 }], 0.1).error);
});

test('glow threshold averages trials', () => {
    const r = P.thresholdByGlow([1.7, 1.8, 1.9]);
    near(r.v0, 1.8, 1e-12); near(r.sd, 0.1, 1e-12); assert.equal(r.n, 3);
    assert.ok(P.thresholdByGlow([]).error);
});

test('planckFit recovers h from ideal LEDs, with or without an offset', () => {
    const lams = [625, 590, 525, 470];
    const ideal = lams.map(l => ({ lambda: l, v0: P.photonVolt(l) }));
    const a = P.planckFit(ideal, { origin: true });
    near(a.h / P.H_TRUE, 1, 1e-9); near(a.errorPct, 0, 1e-6);
    // 모든 LED 문턱 전압이 0.2 V 낮게 나와도 기울기(h)는 그대로, 절편이 0.2 eV
    const shifted = lams.map(l => ({ lambda: l, v0: P.photonVolt(l) - 0.2 }));
    const b = P.planckFit(shifted);
    near(b.h / P.H_TRUE, 1, 1e-9); near(b.workEv, 0.2, 1e-9);
    assert.equal(P.planckFit([{ lambda: 600, v0: 2 }]), null);
});

test('potentiometer divider: safe knob limit for 10 kΩ and 1 kΩ', () => {
    // 4.5 V, 10 mA, 빨강 2.0 V: 10 kΩ 는 약 97.5 %, 1 kΩ 는 80 % 까지 안전
    near(P.safeLimit(4.5, 10000, 10, 2.0), 0.9755, 1e-3);
    near(P.safeLimit(4.5, 1000, 10, 2.0), 0.80, 1e-9);
    for (const R of [1000, 10000]) {
        const x = P.safeLimit(4.5, R, 10, 2.0);
        near(P.currentAt(4.5, R, x, 2.0), 10, 1e-9, 'I at limit');
        assert.ok(P.currentAt(4.5, R, x - 0.02, 2.0) < 10);
    }
    assert.equal(P.currentAt(4.5, 10000, 0.3, 2.0), 0);
    assert.equal(P.currentAt(4.5, 10000, 1, 2.0), Infinity);
    const g = P.potGuide(4.5, 10000, 10, [2.0, 3.1]);
    near(g.drainMa, 0.45, 1e-12);
    near(g.rLower, g.xMax * 10000, 1e-9);
    assert.ok(g.iHighAtLimit > 2 && g.iHighAtLimit < 10, String(g.iHighAtLimit));
    assert.equal(g.seriesR, 250);
    assert.equal(g.safeToEnd, false);
    // 3 V 건전지로는 파랑 LED 에 전류가 흐르지 않는다
    assert.equal(P.potGuide(3, 10000, 10, [2.0, 3.1]).iHighAtLimit, 0);
});

test('every preset has a wavelength and a display color', () => {
    for (const p of P.LED_PRESETS) {
        assert.ok(p.lambda > 300 && p.lambda < 1100, p.key);
        assert.match(P.wavelengthColor(p.lambda), /^#[0-9a-f]{6}$/);
    }
});

test('메인 화면에 플랑크 상수 실험 링크가 있고 페이지의 로컬 파일이 모두 존재한다', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('href="projects/planck-led.html"'));
    const html = fs.readFileSync(path.join(root, 'projects', 'planck-led.html'), 'utf8');
    for (const m of html.matchAll(/\b(?:src|href)="([^"#:]+)"/g)) {
        assert.ok(fs.existsSync(path.resolve(root, 'projects', m[1])), m[1]);
    }
});

test('a series resistor makes the full knob turn safe', () => {
    // 330 Ω 를 넣으면 끝까지 돌려도 (4.5 − 2.0) / 330 ≈ 7.6 mA
    const g = P.potGuide(4.5, 10000, 10, [2.0, 3.1], 330);
    assert.equal(g.safeToEnd, true); assert.equal(g.xMax, 1);
    near(g.endLow, 2.5 / 330 * 1000, 1e-9);
    near(g.iHighAtLimit, 1.4 / 330 * 1000, 1e-9);
    // 너무 작은 저항이면 끝 근처에 여전히 한계가 있고, 그 위치에서 전류가 정확히 최대 전류
    const x = P.safeLimit(4.5, 10000, 10, 2.0, 100);
    assert.ok(x < 1);
    near(P.currentAt(4.5, 10000, x, 2.0, 100), 10, 1e-9);
});
