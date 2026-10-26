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
