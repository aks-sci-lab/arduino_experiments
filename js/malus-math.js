// 말루스 법칙 실험용 계산 함수 (브라우저/Node 공용)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MalusMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    const RAD = Math.PI / 180;

    // 8비트 픽셀값(0~255) -> 선형 밝기(0~1) 변환표
    // mode: 'srgb' | '2.2' | 'none'
    function linearTable(mode) {
        const t = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const v = i / 255;
            if (mode === 'srgb') t[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            else if (mode === '2.2') t[i] = Math.pow(v, 2.2);
            else t[i] = v;
        }
        return t;
    }

    function mean(a) { return a.reduce((s, v) => s + v, 0) / a.length; }
    function std(a) {
        if (a.length < 2) return 0;
        const m = mean(a);
        return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
    }

    // 3x3 연립방정식 (가우스 소거법, 부분 피벗)
    function solve3(M, v) {
        const a = M.map((row, i) => row.concat(v[i]));
        for (let c = 0; c < 3; c++) {
            let p = c;
            for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
            if (Math.abs(a[p][c]) < 1e-12) return null;
            [a[c], a[p]] = [a[p], a[c]];
            for (let r = 0; r < 3; r++) {
                if (r === c) continue;
                const f = a[r][c] / a[c][c];
                for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
            }
        }
        return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
    }

    // I(θ) = A·cos²(θ-θ0) + B 를 선형 최소제곱으로 적합
    //   I = a + b·cos2θ + c·sin2θ  →  A = 2√(b²+c²), B = a-√(b²+c²), θ0 = ½·atan2(c,b)
    // points: [{theta(도), y}]
    function fitMalus(points) {
        if (points.length < 3) return null;
        const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], T = [0, 0, 0];
        for (const p of points) {
            const r = [1, Math.cos(2 * p.theta * RAD), Math.sin(2 * p.theta * RAD)];
            for (let i = 0; i < 3; i++) {
                T[i] += r[i] * p.y;
                for (let j = 0; j < 3; j++) S[i][j] += r[i] * r[j];
            }
        }
        const sol = solve3(S, T);
        if (!sol) return null;
        const [a, b, c] = sol;
        const m = Math.hypot(b, c);
        const A = 2 * m, B = a - m;
        let theta0 = (0.5 * Math.atan2(c, b)) / RAD;
        theta0 = ((theta0 % 180) + 180) % 180;
        const model = th => A * Math.pow(Math.cos((th - theta0) * RAD), 2) + B;
        const ym = mean(points.map(p => p.y));
        let ssRes = 0, ssTot = 0;
        for (const p of points) {
            ssRes += Math.pow(p.y - model(p.theta), 2);
            ssTot += Math.pow(p.y - ym, 2);
        }
        const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
        const imax = A + B, imin = B;
        return {
            A, B, theta0, r2, model,
            imax, imin,
            visibility: imax + imin !== 0 ? (imax - imin) / (imax + imin) : 0,
            extinction: imax !== 0 ? imin / imax : 0
        };
    }

    // 단순 선형 회귀 y = slope·x + intercept
    function linearRegression(xs, ys) {
        const n = xs.length;
        if (n < 2) return null;
        const mx = mean(xs), my = mean(ys);
        let sxx = 0, sxy = 0, syy = 0;
        for (let i = 0; i < n; i++) {
            sxx += (xs[i] - mx) * (xs[i] - mx);
            sxy += (xs[i] - mx) * (ys[i] - my);
            syy += (ys[i] - my) * (ys[i] - my);
        }
        if (sxx === 0) return null;
        const slope = sxy / sxx;
        const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
        return { slope, intercept: my - slope * mx, r2 };
    }

    // 밝기 배열(w×h)에서 빛 번짐의 중심을 찾는다.
    // 가장자리 한 줄의 평균을 바닥값으로 빼고, 남은 밝기로 가중 평균 위치를 구한다.
    // 반환: { x, y, contrast } (x, y 는 픽셀 좌표, contrast = 최댓값 − 바닥값). 빛이 없으면 null.
    function spotCentroid(v, w, h) {
        if (w < 3 || h < 3) return null;
        let edge = 0, ne = 0;
        for (let x = 0; x < w; x++) { edge += v[x] + v[(h - 1) * w + x]; ne += 2; }
        for (let y = 1; y < h - 1; y++) { edge += v[y * w] + v[y * w + w - 1]; ne += 2; }
        const base = edge / ne;
        let peak = 0;
        for (let i = 0; i < v.length; i++) if (v[i] > peak) peak = v[i];
        const contrast = peak - base;
        if (!(contrast > 0)) return null;
        // 바닥 잡음을 피하려고 (최댓값−바닥값)의 20% 이상인 픽셀만 사용
        const cut = base + 0.2 * contrast;
        let sw = 0, sx = 0, sy = 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const wt = v[y * w + x] - cut;
                if (wt > 0) { sw += wt; sx += wt * x; sy += wt * y; }
            }
        }
        if (sw === 0) return null;
        return { x: sx / sw, y: sy / sw, contrast };
    }

    // 정사각 영역(s×s)의 가장자리 띠(두께 = s의 10%) 평균이 전체 평균에서 차지하는 비율.
    // 빛 번짐이 영역 안에 다 들어 있으면 작고(≈ 0), 영역 밖으로 넘치면 1에 가까워진다.
    function edgeRatio(v, s) {
        const t = Math.max(1, Math.round(s * 0.1));
        let all = 0, edge = 0, ne = 0;
        for (let y = 0; y < s; y++) {
            for (let x = 0; x < s; x++) {
                const val = v[y * s + x];
                all += val;
                if (x < t || y < t || x >= s - t || y >= s - t) { edge += val; ne++; }
            }
        }
        const m = all / (s * s);
        return m > 0 ? (edge / ne) / m : 0;
    }

    // ---------- 모델 비교 ----------
    // 학생이 비교해 볼 후보 모델. f(φ) 는 φ = θ − θ₀ 일 때의 모양(최댓값 1, 최솟값 0).
    const MODELS = {
        cos2: { label: 'cos²θ', f: phi => Math.pow(Math.cos(phi * RAD), 2) },
        cos: { label: '|cos θ|', f: phi => Math.abs(Math.cos(phi * RAD)) },
        linear: {
            label: '직선 (각도에 비례해 감소)',
            f: phi => { const r = ((phi % 180) + 180) % 180; return 1 - Math.min(r, 180 - r) / 90; }
        }
    };

    // θ₀ 를 정해 두면 I = A·x + B 는 직선 회귀로 바로 풀린다.
    function fitLinearAB(points, f, theta0) {
        const xs = points.map(p => f(p.theta - theta0));
        const mx = mean(xs), my = mean(points.map(p => p.y));
        let sxx = 0, sxy = 0;
        for (let i = 0; i < xs.length; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (points[i].y - my); }
        if (sxx === 0) return null;
        const A = sxy / sxx, B = my - A * mx;
        let sse = 0;
        for (let i = 0; i < xs.length; i++) sse += (points[i].y - (A * xs[i] + B)) ** 2;
        return { A, B, sse };
    }

    // 모델 key 로 I(θ) = A·f(θ − θ₀) + B 를 적합한다. points: [{theta, y}]
    // cos² 는 정확한 선형 풀이(fitMalus), 나머지는 θ₀ 를 0.5° 간격으로 찾은 뒤 0.01° 로 다듬는다.
    function fitModel(points, key) {
        if (points.length < 3) return null;
        const model = MODELS[key];
        if (!model) return null;
        let A, B, theta0;
        if (key === 'cos2') {
            const f = fitMalus(points);
            if (!f) return null;
            ({ A, B, theta0 } = f);
        } else {
            let best = null;
            const tryAt = t => {
                const r = fitLinearAB(points, model.f, t);
                if (r && r.A > 0 && (!best || r.sse < best.sse)) best = Object.assign({ theta0: t }, r);
            };
            for (let t = 0; t < 180; t += 0.5) tryAt(t);
            if (!best) return null;
            const c = best.theta0;
            for (let t = c - 0.5; t <= c + 0.5; t += 0.01) tryAt(t);
            ({ A, B } = best);
            theta0 = ((best.theta0 % 180) + 180) % 180;
        }
        if (!(A > 0)) return null;
        const fn = th => A * model.f(th - theta0) + B;
        const ym = mean(points.map(p => p.y));
        let ssRes = 0, ssTot = 0;
        for (const p of points) { ssRes += (p.y - fn(p.theta)) ** 2; ssTot += (p.y - ym) ** 2; }
        return {
            key, A, B, theta0, model: fn,
            r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
            rmse: Math.sqrt(ssRes / points.length),
            imax: A + B, imin: B,
            extinction: A + B !== 0 ? B / (A + B) : 0
        };
    }

    // ---------- 회차별 정규화 분석 ----------
    // points: [{ run, theta, y, sd, excluded }]  (excluded = 결측치로 처리할 점)
    // 회차마다 따로 I = A·f(θ−θ₀) + B 를 적합하고, 그 회차의 A, B, θ₀ 로 정규화한다:
    //   x = f(θ − θ₀),  n = (I − B) / A   (모델이 맞으면 n = x)
    // 결측치와 적합할 수 없는 회차(유효한 점 3개 미만)의 점은 n = null.
    // raw: 정규화하지 않고 모든 회차의 점을 곡선 하나로 적합한 결과 (정규화 전후 비교용)
    function analyzeRuns(points, key) {
        key = key || 'cos2';
        const f = MODELS[key].f;
        const ids = [...new Set(points.map(p => p.run))].sort((a, b) => a - b);
        const runs = ids.map(run => {
            const valid = points.filter(p => p.run === run && !p.excluded);
            return { run, n: valid.length, total: points.filter(p => p.run === run).length, fit: fitModel(valid, key) };
        });
        const byRun = new Map(runs.map(r => [r.run, r]));
        const norm = points.map(p => {
            const fit = byRun.get(p.run).fit;
            if (!fit || p.excluded) return null;
            const phi = p.theta - fit.theta0;
            return { x: f(phi), n: (p.y - fit.B) / fit.A, e: (p.sd || 0) / fit.A, phi: ((phi % 180) + 180) % 180 };
        });
        const ok = norm.filter(Boolean);
        const pooled = ok.length >= 2 ? linearRegression(ok.map(q => q.x), ok.map(q => q.n)) : null;
        // 모든 회차를 합친 R²: 정규화한 값이 이론값 n = x 에서 얼마나 벗어나는지
        let r2 = null, rms = null;
        if (ok.length >= 3) {
            const m = mean(ok.map(q => q.n));
            let res = 0, tot = 0;
            for (const q of ok) { res += (q.n - q.x) ** 2; tot += (q.n - m) ** 2; }
            r2 = tot > 0 ? 1 - res / tot : null;
            rms = Math.sqrt(res / ok.length);
        }
        const valid = points.filter(p => !p.excluded && byRun.get(p.run).fit);
        const raw = fitModel(valid, key);
        return { key, runs, norm, pooled, r2, rms, used: ok.length, raw };
    }

    // ---------- 측정 계획 ----------
    // plan: { start, end, step, repeats, custom }  custom = "0, 10, 45" 처럼 직접 적은 각도 목록
    function planAngles(plan) {
        const out = [];
        const custom = String(plan.custom || '').split(/[\s,;]+/).filter(t => t !== '').map(Number).filter(v => isFinite(v));
        if (String(plan.custom || '').trim() && custom.length) {
            for (const v of custom) if (!out.includes(v)) out.push(v);
            return out;
        }
        const start = Number(plan.start), end = Number(plan.end), step = Math.abs(Number(plan.step));
        if (!isFinite(start) || !isFinite(end) || !(step > 0)) return out;
        const dir = end >= start ? 1 : -1;
        for (let i = 0; i <= 360; i++) {
            const v = +(start + dir * step * i).toFixed(6);
            if (dir > 0 ? v > end + 1e-9 : v < end - 1e-9) break;
            out.push(v);
        }
        return out;
    }

    // 계획한 각도마다 이번 회차에 몇 번 쟀는지
    function planProgress(angles, points, run) {
        return angles.map(a => ({ angle: a, count: points.filter(p => p.run === run && Math.abs(p.theta - a) < 1e-6).length }));
    }

    // 다음에 잴 각도: 지금 각도에서 반복 횟수를 다 채우지 않았으면 그대로, 채웠으면 다음 미완료 각도
    function nextPlannedAngle(progress, repeats, current) {
        if (!progress.length) return null;
        let i = progress.findIndex(p => Math.abs(p.angle - current) < 1e-6);
        if (i >= 0 && progress[i].count < repeats) return progress[i].angle;
        for (let k = 1; k <= progress.length; k++) {
            const j = ((i < 0 ? -1 : i) + k) % progress.length;
            if (progress[j].count < repeats) return progress[j].angle;
        }
        return null;
    }

    // ---------- 이상한 값(의심) 판단 ----------
    // criteria: { move, sat, repeat, repeatPct }  학생이 측정 전에 정한 기준
    // points: [{ run, theta, y, moved, sat }]  반환: 점마다 이유 목록 (예: ['이동', '반복 차이'])
    function flagSuspicious(points, criteria) {
        const c = criteria || {};
        const runMax = new Map();
        for (const p of points) runMax.set(p.run, Math.max(runMax.get(p.run) || 0, p.y));
        return points.map(p => {
            const why = [];
            if (c.move && p.moved) why.push('이동');
            if (c.sat && p.sat > 0.01) why.push('포화');
            if (c.repeat) {
                // 비교 기준: 반복이 2번이면 다른 한 값, 3번 이상이면 중앙값 (어느 값이 틀렸는지는 학생이 판단)
                const same = points.filter(q => q !== p && q.run === p.run && Math.abs(q.theta - p.theta) < 1e-6).map(q => q.y);
                if (same.length >= 1) {
                    const all = same.length === 1 ? same : same.concat(p.y);
                    const sorted = all.slice().sort((a, b) => a - b);
                    const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
                    const lim = (Number(c.repeatPct) || 10) / 100 * (runMax.get(p.run) || 0);
                    if (Math.abs(p.y - mid) > lim) why.push('반복 차이');
                }
            }
            return why;
        });
    }

    return {
        RAD, linearTable, mean, std, fitMalus, linearRegression, spotCentroid, edgeRatio,
        MODELS, fitModel, analyzeRuns, planAngles, planProgress, nextPlannedAngle, flagSuspicious
    };
});
