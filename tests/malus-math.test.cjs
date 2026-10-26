const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/malus-math.js');

// 가우스 모양 빛 번짐 (중심 cx, cy, 폭 sig, 바닥 base)
function spot(w, h, cx, cy, sig, base = 0.02, amp = 0.6) {
    const v = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
        v[y * w + x] = base + amp * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sig * sig));
    return v;
}

test('fitMalus recovers amplitude, offset and axis', () => {
    const pts = [];
    for (let t = 0; t <= 180; t += 15) pts.push({ theta: t, y: 0.7 * Math.cos((t - 20) * M.RAD) ** 2 + 0.05 });
    const f = M.fitMalus(pts);
    assert.ok(Math.abs(f.A - 0.7) < 1e-9);
    assert.ok(Math.abs(f.B - 0.05) < 1e-9);
    assert.ok(Math.abs(f.theta0 - 20) < 1e-6);
    assert.ok(f.r2 > 0.999999);
});

test('fitMalus needs at least three points', () => {
    assert.equal(M.fitMalus([{ theta: 0, y: 1 }, { theta: 90, y: 0 }]), null);
});

test('spotCentroid finds an off-center spot', () => {
    const c = M.spotCentroid(spot(120, 120, 70, 45, 10), 120, 120);
    assert.ok(Math.abs(c.x - 70) < 0.5 && Math.abs(c.y - 45) < 0.5, JSON.stringify(c));
    assert.ok(c.contrast > 0.5);
});

test('spotCentroid returns null for a uniform field', () => {
    assert.equal(M.spotCentroid(new Float32Array(50 * 50).fill(0.3), 50, 50), null);
});

test('edgeRatio is small when the spot fits and large when it overflows', () => {
    const fits = M.edgeRatio(spot(100, 100, 50, 50, 10), 100);
    const overflows = M.edgeRatio(spot(100, 100, 50, 50, 40), 100);
    assert.ok(fits < 0.35, 'fits ' + fits);
    assert.ok(overflows > 0.35 && overflows < 0.9, 'overflows ' + overflows);
});

test('mean over a ROI that contains the whole spot barely changes when the spot moves', () => {
    const roiMean = (cx, cy) => { const v = spot(100, 100, cx, cy, 8); return v.reduce((a, b) => a + b, 0) / v.length; };
    const a = roiMean(50, 50), b = roiMean(58, 44);
    assert.ok(Math.abs(a - b) / a < 0.01, a + ' vs ' + b);
});

test('analyzeRuns normalizes each run by its own fit', () => {
    const pts = [];
    // 1회차: 밝기 0.7, 2회차: 카메라를 다시 맞춰 밝기가 0.4 로 바뀐 상황
    for (let t = 0; t <= 180; t += 20) pts.push({ run: 1, theta: t, y: 0.7 * Math.cos((t - 10) * M.RAD) ** 2 + 0.03, sd: 0 });
    for (let t = 0; t <= 180; t += 20) pts.push({ run: 2, theta: t, y: 0.4 * Math.cos((t - 10) * M.RAD) ** 2 + 0.06, sd: 0 });
    const an = M.analyzeRuns(pts);
    assert.equal(an.runs.length, 2);
    assert.ok(Math.abs(an.runs[0].fit.A - 0.7) < 1e-9 && Math.abs(an.runs[1].fit.A - 0.4) < 1e-9);
    for (const q of an.norm) assert.ok(Math.abs(q.n - q.x) < 1e-9);
    assert.ok(an.r2 > 0.999999);
    assert.ok(Math.abs(an.pooled.slope - 1) < 1e-9);
});

test('analyzeRuns treats excluded points as missing and does not let them bend the fit', () => {
    const pts = [];
    for (let t = 0; t <= 180; t += 20) pts.push({ run: 1, theta: t, y: 0.5 * Math.cos(t * M.RAD) ** 2 + 0.02, sd: 0 });
    pts[3].y *= 0.6; pts[3].excluded = true;   // 카메라가 밀려 어두워진 점
    const an = M.analyzeRuns(pts);
    assert.equal(an.norm[3], null);
    assert.equal(an.used, pts.length - 1);
    assert.ok(Math.abs(an.runs[0].fit.A - 0.5) < 1e-9);
    assert.ok(an.r2 > 0.999999);
});

test('analyzeRuns leaves runs with fewer than three valid points unfitted', () => {
    const pts = [{ run: 1, theta: 0, y: 1 }, { run: 1, theta: 90, y: 0 }, { run: 1, theta: 45, y: 0.5, excluded: true }];
    const an = M.analyzeRuns(pts);
    assert.equal(an.runs[0].fit, null);
    assert.ok(an.norm.every(q => q === null));
    assert.equal(an.r2, null);
});
