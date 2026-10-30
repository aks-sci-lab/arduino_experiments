const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/ideal-gas-math.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` ${a} vs ${b}`);

test('leastSquares recovers a line and its covariance sign', () => {
    const xs = [1, 2, 3, 4], ys = [1.1, 1.9, 3.2, 3.8];
    const f = G.leastSquares(xs, ys);
    // 손으로 계산: Sxy = 4.7, Sxx = 5 → slope = 0.94, intercept = 0.15, SSR = 0.082, s² = 0.041
    near(f.slope, 0.94, 1e-12); near(f.intercept, 0.15, 1e-12);
    near(f.sSlope, Math.sqrt(0.041 / 5), 1e-12);
    near(f.cov, -0.041 * 10 / (4 * 30 - 100), 1e-12);   // −s²·Σx / D
    assert.equal(G.leastSquares([2, 2], [1, 3]), null);
    assert.equal(G.leastSquares([1], [1]), null);
});

test('Boyle: ideal syringe data gives constant PV, zero intercept and power −1', () => {
    const k = 2026;   // 101.3 kPa × 20 mL
    const pts = [101.3, 85, 70, 60, 50, 45].map((p, i) => ({ v: k / p, p, t: 20 + (i % 2) * 0.1, dir: 'down' }));
    const b = G.boyleAnalysis(pts);
    near(b.pvMean, k, 1e-9); near(b.pvCv, 0, 1e-9);
    near(b.k, k, 1e-6); near(b.fit.intercept, 0, 1e-9); near(b.fit.r2, 1, 1e-12);
    near(b.power, -1, 1e-12);
    near(b.tSpan, 0.1, 1e-9);
    // n = PV/RT: 2026 kPa·mL = 2.026 J, 20 °C → 약 8.31 × 10⁻⁴ mol
    near(b.molMean, 2.026 / (G.R_GAS * 293.2), 2e-6);
});

test('Boyle: hidden tip volume shows up as a negative intercept and can be corrected', () => {
    const k = 2000, hidden = 1.5;
    // 실제 공기 부피 = 눈금 + 1.5 mL
    const pts = [100, 80, 64, 50].map(p => ({ v: k / p - hidden, p, t: 21 }));
    const raw = G.boyleAnalysis(pts);
    near(raw.fit.intercept, -hidden, 1e-9); near(raw.extra, hidden, 1e-9);
    assert.ok(raw.pvCv > 0.5, String(raw.pvCv));
    const fixed = G.boyleAnalysis(pts, { dead: hidden });
    near(fixed.pvCv, 0, 1e-9); near(fixed.extra, 0, 1e-9);
    assert.equal(G.boyleAnalysis([]), null);
    assert.equal(G.boyleAnalysis([{ v: 0, p: 100, t: 20 }]), null);
});

test('Gay-Lussac: pressure proportional to absolute temperature extrapolates to −273.15 °C', () => {
    const c = 70 / 293.15;   // kPa/K
    const pts = [];
    for (let t = 15; t <= 40; t += 2.5) pts.push({ t, p: c * (t + G.ZERO_C), s: t });
    const g = G.gayLussacAnalysis(pts, { volume: 2.5 });
    near(g.t0, -273.15, 1e-6); near(g.errK, 0, 1e-6); near(g.errPct, 0, 1e-6);
    near(g.ptMean, c, 1e-12); near(g.ptCv, 0, 1e-9);
    near(g.sT0, 0, 1e-6);
    // n = PV/RT (kPa × L = J)
    near(g.molMean, c * 2.5 / G.R_GAS, 1e-12);
    near(g.tMax - g.tMin, 25, 1e-9);
});

test('Gay-Lussac: offset temperature shifts the absolute zero estimate and gives an error', () => {
    // 센서가 실제 기체보다 2 °C 높게 읽으면 t₀ 도 2 °C 높게 나온다
    const pts = [10, 20, 30, 40].map(t => ({ t: t + 2, p: 0.25 * (t + G.ZERO_C) }));
    const g = G.gayLussacAnalysis(pts);
    near(g.t0, -271.15, 1e-6); near(g.errK, 2, 1e-6);
    assert.equal(g.molMean, null);
    // 노이즈가 있으면 표준오차가 0 보다 크다
    const noisy = G.gayLussacAnalysis([{ t: 20, p: 70.1 }, { t: 25, p: 71.1 }, { t: 30, p: 72.5 }, { t: 35, p: 73.6 }]);
    assert.ok(noisy.sT0 > 0);
    // 온도가 올라도 압력이 그대로이면 (공기가 샘) t₀ 를 계산하지 않는다
    const leak = G.gayLussacAnalysis([{ t: 20, p: 70 }, { t: 30, p: 69.9 }]);
    assert.equal(leak.t0, null); assert.ok(leak.fit);
});

test('recentAverage and recentSpan look only at the latest window', () => {
    const s = [];
    for (let i = 0; i <= 20; i++) s.push({ at: i * 1000, p: i < 15 ? 90 : 80, t: 20, h: 40 });
    const a = G.recentAverage(s, 3000);
    assert.equal(a.n, 4); near(a.p, 80, 1e-12);
    near(G.recentSpan(s, 4000).p, 0, 1e-12);
    near(G.recentSpan(s, 10000).p, 10, 1e-12);
    assert.equal(G.recentSpan(s.slice(0, 3), 10000), null);   // 받은 시간이 너무 짧음
    assert.equal(G.recentAverage([], 3000), null);
});

test('syringe plan: Boyle law predicts the pressure at the last mark', () => {
    near(G.syringeLimit(20, 60, 101.325), 33.775, 1e-9);
    assert.equal(G.syringeLimit(0, 60, 100), null);
});

test('메인 화면에 이상기체 실험 링크가 있고 페이지의 로컬 파일이 모두 존재한다', () => {
    const root = path.join(__dirname, '..');
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(index.includes('href="projects/ideal-gas.html"'));
    assert.ok(index.includes('projects/ideal-gas.html?report='));
    const html = fs.readFileSync(path.join(root, 'projects', 'ideal-gas.html'), 'utf8');
    for (const m of html.matchAll(/\b(?:src|href)="([^"#:]+?)(?:\?[^"]*)?"/g)) {
        assert.ok(fs.existsSync(path.resolve(root, 'projects', m[1])), m[1]);
    }
    // 보고서 순서 탭 7개
    for (const t of ['purpose', 'theory', 'materials', 'procedure', 'data', 'result', 'conclusion']) {
        assert.ok(html.includes(`data-tab="${t}"`), t);
    }
    // 다른 센서 페이지처럼 화면에 보드 모델명을 쓰지 않는다
    assert.doesNotMatch(html, /Pico 2 W/i);
});

test('제출 문서는 현재 Firestore 규칙이 요구하는 칸을 모두 채운다', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'ideal-gas.js'), 'utf8');
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    const m = rules.match(/match \/experiments\/\{docId\}[\s\S]*?hasAll\(\[([^\]]+)\]\)/);
    const keys = m[1].split(',').map(s => s.trim().replace(/'/g, ''));
    const add = js.slice(js.indexOf(".collection('experiments').add({"));
    const body = add.slice(0, add.indexOf('});'));
    for (const k of keys) assert.match(body, new RegExp('\\b' + k + ':'), k);
    assert.match(body, /stargazingSample: \[\]/);
});
