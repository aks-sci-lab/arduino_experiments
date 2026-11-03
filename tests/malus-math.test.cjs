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

test('fitModel recovers each candidate model and cos² data favors cos²', () => {
    for (const key of Object.keys(M.MODELS)) {
        const pts = [];
        for (let t = 0; t <= 180; t += 10) pts.push({ theta: t, y: 0.5 * M.MODELS[key].f(t - 25) + 0.04 });
        const f = M.fitModel(pts, key);
        assert.ok(Math.abs(f.A - 0.5) < 1e-3 && Math.abs(f.B - 0.04) < 1e-3 && Math.abs(f.theta0 - 25) < 0.05, key + ' ' + JSON.stringify(f));
        assert.ok(f.r2 > 0.9999, key);
    }
    const pts = [];
    for (let t = 0; t <= 180; t += 10) pts.push({ theta: t, y: 0.5 * Math.cos((t - 25) * M.RAD) ** 2 + 0.04 });
    const r = k => M.fitModel(pts, k).rmse;
    assert.ok(r('cos2') < r('cos') && r('cos2') < r('linear'));
});

test('analyzeRuns compares pooled raw fit with per-run normalization', () => {
    const pts = [];
    for (let t = 0; t <= 180; t += 20) pts.push({ run: 1, theta: t, y: 0.7 * Math.cos(t * M.RAD) ** 2 + 0.03 });
    for (let t = 0; t <= 180; t += 20) pts.push({ run: 2, theta: t, y: 0.3 * Math.cos(t * M.RAD) ** 2 + 0.03 });
    const an = M.analyzeRuns(pts, 'cos2');
    assert.ok(an.r2 > 0.999999);
    assert.ok(an.raw.r2 < 0.9, 'raw ' + an.raw.r2);
    assert.ok(an.rms < 1e-9);
});

test('planAngles builds ranges and accepts a custom list', () => {
    assert.deepEqual(M.planAngles({ start: 0, end: 90, step: 30 }), [0, 30, 60, 90]);
    assert.deepEqual(M.planAngles({ start: 0, end: 50, step: 20 }), [0, 20, 40]);
    assert.deepEqual(M.planAngles({ start: 90, end: 0, step: 45 }), [90, 45, 0]);
    assert.deepEqual(M.planAngles({ custom: '0, 10 45;45, 90', start: 0, end: 180, step: 15 }), [0, 10, 45, 90]);
    assert.deepEqual(M.planAngles({ start: 0, end: 90, step: 0 }), []);
    assert.deepEqual(M.planAngles({ custom: ', 30, 60, ', start: 0, end: 180, step: 15 }), [30, 60]);
});

test('nextPlannedAngle stays until repeats are done, then moves to the next unfinished angle', () => {
    const angles = [0, 30, 60];
    const pts = [{ run: 1, theta: 0 }, { run: 1, theta: 0 }, { run: 1, theta: 60 }, { run: 2, theta: 30 }];
    const prog = M.planProgress(angles, pts, 1);
    assert.deepEqual(prog.map(p => p.count), [2, 0, 1]);
    assert.equal(M.nextPlannedAngle(prog, 2, 0), 30);
    assert.equal(M.nextPlannedAngle(prog, 2, 60), 60);
    assert.equal(M.nextPlannedAngle(M.planProgress(angles, pts, 1), 1, 60), 30);
    assert.equal(M.nextPlannedAngle([{ angle: 0, count: 2 }], 2, 0), null);
});

test('flagSuspicious follows only the criteria the student chose', () => {
    const pts = [
        { run: 1, theta: 0, y: 0.60, moved: false, sat: 0 },
        { run: 1, theta: 0, y: 0.61, moved: false, sat: 0 },
        { run: 1, theta: 0, y: 0.40, moved: false, sat: 0 },
        { run: 1, theta: 30, y: 0.45, moved: true, sat: 0.05 }
    ];
    assert.deepEqual(M.flagSuspicious(pts, {}), [[], [], [], []]);
    const f = M.flagSuspicious(pts, { move: true, sat: true, repeat: true, repeatPct: 10 });
    assert.deepEqual(f[0], []);
    assert.deepEqual(f[2], ['반복 차이']);
    assert.deepEqual(f[3], ['이동', '포화']);
    // 두 번만 잰 경우: 서로 기준보다 많이 다르면 둘 다 의심
    const two = [{ run: 1, theta: 60, y: 0.28 }, { run: 1, theta: 60, y: 0.18 }, { run: 1, theta: 0, y: 0.63 }];
    assert.deepEqual(M.flagSuspicious(two, { repeat: true, repeatPct: 10 }).map(w => w.length), [1, 1, 0]);
    assert.deepEqual(M.flagSuspicious(two, { repeat: true, repeatPct: 20 }).map(w => w.length), [0, 0, 0]);
});

test('a correct prediction lines up with normalized data even when θ₀ is not 0', () => {
    // 학생은 "가장 밝은 위치에서 돌린 각도" φ 로 cos²φ 를 예측했다
    const sketch = Array.from({ length: 37 }, (_, i) => Math.cos(i * 5 * M.RAD) ** 2);
    const curve = M.sketchCurve(sketch);
    assert.equal(curve[0].phi, 0);
    assert.equal(curve[36].phi, 180);
    // 회차마다 가장 밝은 각도 θ₀ 가 30°, 75° 로 다른 측정
    const pts = [];
    for (let t = 0; t <= 180; t += 10) pts.push({ run: 1, theta: t, y: 0.6 * Math.cos((t - 30) * M.RAD) ** 2 + 0.05 });
    for (let t = 0; t <= 180; t += 10) pts.push({ run: 2, theta: t, y: 0.3 * Math.cos((t - 75) * M.RAD) ** 2 + 0.02 });
    const an = M.analyzeRuns(pts, 'cos2');
    assert.ok(Math.abs(an.runs[0].fit.theta0 - 30) < 1e-6 && Math.abs(an.runs[1].fit.theta0 - 75) < 1e-6);
    for (const q of an.norm) {
        const pred = M.sketchAt(sketch, q.phi);
        assert.ok(Math.abs(pred - q.n) < 0.01, 'φ=' + q.phi + ' 예측 ' + pred + ' 측정 ' + q.n);
    }
    // 원래 각도 θ 를 그대로 가로축으로 쓰면 어긋난다 (θ = 30° 에서 예측 0.75, 측정 1)
    assert.ok(Math.abs(M.sketchAt(sketch, 30) - 1) > 0.2);
});

test('sketchAt returns null where nothing was drawn', () => {
    const sketch = new Array(37).fill(null);
    sketch[0] = 1; sketch[1] = 0.9;
    assert.ok(Math.abs(M.sketchAt(sketch, 2.5) - 0.95) < 1e-9);
    assert.equal(M.sketchAt(sketch, 90), null);
});
