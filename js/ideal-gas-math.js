// 이상기체 상태 방정식 실험용 계산 함수 (브라우저/Node 공용)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.IdealGasMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    // 물리 상수 (SI 정의값)
    const R_GAS = 8.314462618;    // 기체 상수 R (J/(mol·K))
    const N_A = 6.02214076e23;    // 아보가드로 수 (1/mol)
    const ZERO_C = 273.15;        // 0 °C = 273.15 K → 절대 영도는 −273.15 °C
    const P_ATM = 101.325;        // 표준 대기압 (kPa)
    // BME280 기압 측정 범위 (kPa). 이 밖으로 나가면 펌웨어가 오류를 보내고 측정을 멈춘다.
    const P_MIN = 30, P_MAX = 110;

    const finite = v => typeof v === 'number' && isFinite(v);

    function mean(a) { return a.reduce((s, v) => s + v, 0) / a.length; }
    function std(a) {
        if (a.length < 2) return 0;
        const m = mean(a);
        return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
    }
    // 평균에 대한 표준편차의 비율 (%) — 값이 얼마나 일정한지 나타낸다
    function cvPct(a) { const m = mean(a); return a.length > 1 && m !== 0 ? std(a) / Math.abs(m) * 100 : 0; }

    // °C → K
    function kelvin(tC) { return tC + ZERO_C; }

    // 최소제곱법 직선 적합 y = slope·x + intercept
    // 반환: { n, slope, intercept, sSlope, sIntercept, cov, r2, sums } (표준오차·공분산은 점이 3개 이상일 때만)
    function leastSquares(xs, ys) {
        const n = xs.length;
        if (n < 2) return null;
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
        const D = n * sxx - sx * sx;
        if (!(Math.abs(D) > 1e-12 * Math.max(1, n * sxx))) return null;   // x 가 모두 같으면 기울기를 정할 수 없음
        const slope = (n * sxy - sx * sy) / D;
        const intercept = (sy - slope * sx) / n;
        const my = sy / n;
        let ssRes = 0, ssTot = 0;
        for (let i = 0; i < n; i++) {
            ssRes += Math.pow(ys[i] - (slope * xs[i] + intercept), 2);
            ssTot += Math.pow(ys[i] - my, 2);
        }
        let sSlope = null, sIntercept = null, cov = null;
        if (n > 2) {
            const s2 = ssRes / (n - 2);
            sSlope = Math.sqrt(s2 * n / D);
            sIntercept = Math.sqrt(s2 * sxx / D);
            cov = -s2 * sx / D;
        }
        return {
            n, slope, intercept, sSlope, sIntercept, cov,
            r2: ssTot > 0 ? 1 - ssRes / ssTot : null,
            sums: { n, sx, sy, sxx, sxy, D }
        };
    }

    // [실험 1] 보일 법칙: 감압 용기 속 주사기 공기의 부피·압력
    // points: [{ v (주사기 눈금, mL), p (kPa), t (°C) }]
    // opts.dead: 주사기 끝처럼 눈금에 나타나지 않는 부피 (mL). 공기 부피 = 눈금 + dead
    function boyleAnalysis(points, opts) {
        const dead = opts && finite(opts.dead) && opts.dead >= 0 ? opts.dead : 0;
        const pts = (points || []).filter(q => q && finite(q.v) && q.v > 0 && finite(q.p) && q.p > 0 && finite(q.t));
        if (!pts.length) return null;
        const rows = pts.map(q => {
            const vol = q.v + dead, T = kelvin(q.t), pv = q.p * vol;
            // kPa × mL = 10³ Pa × 10⁻⁶ m³ = 10⁻³ J
            return { v: q.v, p: q.p, t: q.t, dir: q.dir, vol, T, pv, pvt: pv / T, mol: pv * 1e-3 / (R_GAS * T) };
        });
        const pv = rows.map(r => r.pv), pvt = rows.map(r => r.pvt), ts = rows.map(r => r.t);
        const res = {
            rows, dead,
            pvMean: mean(pv), pvSd: std(pv), pvCv: cvPct(pv),
            pvtMean: mean(pvt), pvtCv: cvPct(pvt),
            molMean: mean(rows.map(r => r.mol)),
            tMean: mean(ts), tSpan: Math.max(...ts) - Math.min(...ts),
            pMin: Math.min(...rows.map(r => r.p)), pMax: Math.max(...rows.map(r => r.p)),
            fit: null, k: null, extra: null, power: null
        };
        // V = k·(1/P) + b 직선: 기울기 k = PV, 절편 b 는 0 이어야 한다 (b < 0 이면 눈금에 안 보이는 부피가 −b 만큼 더 있다는 뜻)
        const fit = leastSquares(rows.map(r => 1 / r.p), rows.map(r => r.vol));
        if (fit) { res.fit = fit; res.k = fit.slope; res.extra = -fit.intercept; }
        // ln P = m·ln V + c 의 기울기 m: P ∝ 1/V 이면 −1
        const lf = leastSquares(rows.map(r => Math.log(r.vol)), rows.map(r => Math.log(r.p)));
        if (lf) res.power = lf.slope;
        return res;
    }

    // [실험 2] 샤를·게이뤼삭 법칙: 밀폐한 용기 속 공기의 온도·압력 (부피 일정)
    // points: [{ t (°C), p (kPa) }]   opts.volume: 용기 부피 (L, 선택) — 있으면 기체의 양 n 도 계산
    // P = a·t + b 를 적합하고, P = 0 이 되는 온도 t₀ = −b/a 를 절대 영도의 추정값으로 본다.
    function gayLussacAnalysis(points, opts) {
        const vol = opts && finite(opts.volume) && opts.volume > 0 ? opts.volume : null;
        const pts = (points || []).filter(q => q && finite(q.t) && finite(q.p) && q.p > 0);
        if (!pts.length) return null;
        const rows = pts.map(q => {
            const T = kelvin(q.t);
            // kPa × L = 10³ Pa × 10⁻³ m³ = 1 J
            return { t: q.t, p: q.p, s: q.s, T, pt: q.p / T, mol: vol ? q.p * vol / (R_GAS * T) : null };
        });
        const ts = rows.map(r => r.t), pt = rows.map(r => r.pt);
        const res = {
            rows, volume: vol,
            ptMean: mean(pt), ptCv: cvPct(pt),
            molMean: vol ? mean(rows.map(r => r.mol)) : null,
            tMin: Math.min(...ts), tMax: Math.max(...ts),
            pMin: Math.min(...rows.map(r => r.p)), pMax: Math.max(...rows.map(r => r.p)),
            fit: null, t0: null, sT0: null, errK: null, errPct: null
        };
        const fit = leastSquares(ts, rows.map(r => r.p));
        if (fit && fit.slope > 0) {
            res.fit = fit;
            res.t0 = -fit.intercept / fit.slope;
            // 오차 전파: t₀ = −b/a → σ² = (σ_b² + t₀²σ_a² + 2t₀·cov(a,b)) / a²
            if (fit.sSlope != null) {
                const v = (fit.sIntercept * fit.sIntercept + res.t0 * res.t0 * fit.sSlope * fit.sSlope + 2 * res.t0 * fit.cov) / (fit.slope * fit.slope);
                res.sT0 = Math.sqrt(Math.max(0, v));
            }
            res.errK = res.t0 + ZERO_C;
            res.errPct = Math.abs(res.errK) / ZERO_C * 100;
        } else if (fit) {
            res.fit = fit;   // 기울기가 0 이하: 온도가 오를 때 압력이 오르지 않았다 (공기가 새는지 확인)
        }
        return res;
    }

    // 실시간 센서 값 다루기. samples: [{ at (ms), p (kPa), t (°C), h (%) }], 시간 순서
    // 마지막 값으로부터 ms 동안 받은 값의 평균
    function recentAverage(samples, ms) {
        if (!samples || !samples.length) return null;
        const end = samples[samples.length - 1].at;
        const use = samples.filter(s => s.at >= end - ms);
        return { p: mean(use.map(s => s.p)), t: mean(use.map(s => s.t)), h: mean(use.map(s => s.h)), n: use.length, at: end };
    }
    // 최근 ms 동안 압력·온도가 변한 폭 (최댓값 − 최솟값). 받은 시간이 ms 의 절반보다 짧으면 판단하지 않는다(null).
    function recentSpan(samples, ms) {
        if (!samples || samples.length < 2) return null;
        const end = samples[samples.length - 1].at;
        const use = samples.filter(s => s.at >= end - ms);
        if (end - use[0].at < ms / 2) return null;
        const ps = use.map(s => s.p), ts = use.map(s => s.t);
        return { p: Math.max(...ps) - Math.min(...ps), t: Math.max(...ts) - Math.min(...ts), n: use.length };
    }

    // 주사기 계획: 처음 부피 vStart (압력 pStart) 의 공기가 최대 눈금 vMax 까지 늘어나는 압력 (보일 법칙)
    function syringeLimit(vStart, vMax, pStart) {
        if (!(vStart > 0 && vMax > 0 && pStart > 0)) return null;
        return pStart * vStart / vMax;
    }

    return {
        R_GAS, N_A, ZERO_C, P_ATM, P_MIN, P_MAX,
        mean, std, cvPct, kelvin, leastSquares,
        boyleAnalysis, gayLussacAnalysis, recentAverage, recentSpan, syringeLimit
    };
});
