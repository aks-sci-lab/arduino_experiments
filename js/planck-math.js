// LED 플랑크 상수 실험용 계산 함수 (브라우저/Node 공용)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PlanckMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    // 물리 상수 (SI 정의값)
    const E_CHARGE = 1.602176634e-19;  // 기본 전하 e (C)
    const C_LIGHT = 299792458;         // 빛의 속력 c (m/s)
    const H_TRUE = 6.62607015e-34;     // 플랑크 상수 h (J·s)

    // 많이 쓰는 5mm LED 의 대표 파장 (nm). 실제 값은 제품 설명서(데이터시트)마다 다르므로 화면에서 고칠 수 있다.
    // vf: 10 mA 근처에서의 대략적인 순방향 전압 (V) — 가변저항 안전 한계 계산에만 쓴다.
    const LED_PRESETS = [
        { key: 'ir', name: '적외선', lambda: 940, vf: 1.3, on: false },
        { key: 'red', name: '빨강', lambda: 625, vf: 2.0, on: true },
        { key: 'orange', name: '주황', lambda: 605, vf: 2.0, on: true },
        { key: 'yellow', name: '노랑', lambda: 590, vf: 2.1, on: true },
        { key: 'green', name: '초록', lambda: 525, vf: 3.1, on: true },
        { key: 'blue', name: '파랑', lambda: 470, vf: 3.1, on: true },
        { key: 'violet', name: '보라(UV)', lambda: 405, vf: 3.3, on: false }
    ];

    const finite = v => typeof v === 'number' && isFinite(v);

    function mean(a) { return a.reduce((s, v) => s + v, 0) / a.length; }
    function std(a) {
        if (a.length < 2) return 0;
        const m = mean(a);
        return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
    }

    // 파장(nm) → 진동수(Hz)
    function freqOf(lambdaNm) { return C_LIGHT / (lambdaNm * 1e-9); }
    // 파장(nm) → 광자 에너지를 전압으로 나타낸 값 hc/(eλ) (V)
    function photonVolt(lambdaNm) { return H_TRUE * freqOf(lambdaNm) / E_CHARGE; }

    // 최소제곱법 직선 적합 y = slope·x + intercept
    // opts.origin = true 이면 원점을 지나는 직선 y = slope·x 로 적합한다.
    // 반환: { n, slope, intercept, sSlope, sIntercept, r2, sums } (sSlope·sIntercept = 표준오차, 점이 모자라면 null)
    function leastSquares(xs, ys, opts) {
        const origin = !!(opts && opts.origin);
        const n = xs.length;
        if (n < (origin ? 1 : 2)) return null;
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
        let slope, intercept;
        const D = n * sxx - sx * sx;
        if (origin) {
            if (sxx === 0) return null;
            slope = sxy / sxx; intercept = 0;
        } else {
            if (!(Math.abs(D) > 1e-12 * Math.max(1, n * sxx))) return null;  // x 가 모두 같으면 기울기를 정할 수 없음
            slope = (n * sxy - sx * sy) / D;
            intercept = (sy - slope * sx) / n;
        }
        const my = sy / n;
        let ssRes = 0, ssTot = 0;
        for (let i = 0; i < n; i++) {
            ssRes += Math.pow(ys[i] - (slope * xs[i] + intercept), 2);
            ssTot += Math.pow(ys[i] - my, 2);
        }
        const dof = n - (origin ? 1 : 2);
        let sSlope = null, sIntercept = null;
        if (dof > 0) {
            const s2 = ssRes / dof;
            if (origin) sSlope = Math.sqrt(s2 / sxx);
            else { sSlope = Math.sqrt(s2 * n / D); sIntercept = Math.sqrt(s2 * sxx / D); }
        }
        return {
            n, slope, intercept, sSlope, sIntercept,
            r2: ssTot > 0 ? 1 - ssRes / ssTot : null,
            sums: { n, sx, sy, sxx, sxy, D }
        };
    }

    // 전압 순으로 정리한 유효한 (V, I) 점
    function cleanIV(points) {
        return (points || [])
            .filter(p => p && finite(p.v) && finite(p.i))
            .slice()
            .sort((a, b) => a.v - b.v);
    }

    // [전류 기준 ①] 직선 외삽: 전류가 iMin(mA) 이상인 점들로 I = a·V + b 직선을 구하고 I = 0 이 되는 전압을 문턱 전압으로 본다.
    // points: [{ v (V), i (mA) }]  반환: { v0, slope, intercept, used, r2 } 또는 { error }
    function thresholdByExtrapolation(points, iMin) {
        const used = cleanIV(points).filter(p => p.i >= iMin);
        if (used.length < 2) return { error: '직선 구간(' + iMin + ' mA 이상) 점이 2개 이상 필요합니다.' };
        const fit = leastSquares(used.map(p => p.v), used.map(p => p.i));
        if (!fit) return { error: '직선 구간 점들의 전압이 모두 같습니다.' };
        if (!(fit.slope > 0)) return { error: '직선 구간에서 전압이 커질수록 전류도 커져야 합니다. 값을 확인하세요.' };
        return { v0: -fit.intercept / fit.slope, slope: fit.slope, intercept: fit.intercept, used: used.length, r2: fit.r2 };
    }

    // [전류 기준 ②] 기준 전류: 전압을 올릴 때 전류가 처음으로 iRef(mA) 에 이르는 전압.
    // 두 측정점 사이는 LED 전류가 지수적으로 늘어나는 것을 고려해 ln I 로 보간한다 (0 mA 가 끼면 직선 보간).
    function thresholdAtCurrent(points, iRef) {
        const pts = cleanIV(points);
        if (!(iRef > 0)) return { error: '기준 전류는 0보다 커야 합니다.' };
        if (!pts.length) return { error: '측정값이 없습니다.' };
        const k = pts.findIndex(p => p.i >= iRef);
        if (k < 0) return { error: '아직 전류가 기준 전류(' + iRef + ' mA)에 이르지 않았습니다. 전압을 더 올려 측정하세요.' };
        if (k === 0) return { error: '첫 측정점부터 기준 전류보다 큽니다. 더 낮은 전압부터 측정하세요.' };
        const a = pts[k - 1], b = pts[k];
        let t;
        if (a.i > 0 && b.i > a.i) t = (Math.log(iRef) - Math.log(a.i)) / (Math.log(b.i) - Math.log(a.i));
        else t = b.i > a.i ? (iRef - a.i) / (b.i - a.i) : 1;
        return { v0: a.v + t * (b.v - a.v), lower: a, upper: b };
    }

    // [빛 기준] 빛이 보이기 시작한 전압 여러 번 측정 → 평균과 표준편차
    function thresholdByGlow(trials) {
        const v = (trials || []).filter(finite);
        if (!v.length) return { error: '빛이 나기 시작한 전압을 기록하세요.' };
        return { v0: mean(v), sd: std(v), n: v.length };
    }

    // LED 한 개의 문턱 전압.  method: 'extrapolate' | 'current' | 'glow'
    // opts: { iMin (mA), iRef (mA) }
    function thresholdOf(led, method, opts) {
        const o = opts || {};
        if (method === 'glow') return thresholdByGlow(led.glow);
        if (method === 'current') return thresholdAtCurrent(led.iv, o.iRef != null ? o.iRef : 0.1);
        return thresholdByExtrapolation(led.iv, o.iMin != null ? o.iMin : 1);
    }

    // 여러 LED 의 (진동수 f, 문턱 전압 V₀) 로 eV₀ = hf − W 를 적합해 플랑크 상수를 구한다.
    // items: [{ lambda (nm), v0 (V) }]   opts.origin: 원점 통과 직선 (W = 0) 으로 적합
    // 기울기 = h/e  →  h = e × 기울기,  절편 = −W/e
    function planckFit(items, opts) {
        const pts = (items || []).filter(p => finite(p.lambda) && p.lambda > 0 && finite(p.v0));
        const xs = pts.map(p => freqOf(p.lambda));
        const ys = pts.map(p => p.v0);
        const need = opts && opts.origin ? 1 : 2;
        if (new Set(xs).size < need) return null;
        const fit = leastSquares(xs, ys, opts);
        if (!fit) return null;
        const h = fit.slope * E_CHARGE;
        return {
            fit, h,
            sH: fit.sSlope != null ? fit.sSlope * E_CHARGE : null,
            errorPct: (h - H_TRUE) / H_TRUE * 100,
            workEv: -fit.intercept,   // 절편을 eV 단위의 에너지로 나타낸 값 (W/e)
            points: pts.map((p, i) => ({ lambda: p.lambda, f: xs[i], v0: p.v0, hEach: p.v0 * E_CHARGE / xs[i] }))
        };
    }

    // 가변저항 하나를 전압 분배기로 쓸 때의 설정값 안내.
    // 양 끝 다리를 건전지에, 가운데 다리를 LED 에 연결한다. 손잡이 위치 x (0 = − 쪽 끝, 1 = + 쪽 끝) 에서
    //   열린 전압 = V·x,  가운데 다리에서 본 내부 저항 = R·x(1−x)
    // 이므로 LED 전류는 I(x) = (V·x − Vf) / (R·x(1−x)). + 쪽 끝 (x → 1) 에서는 내부 저항이 0 이 되어 전류가 지나치게 커진다.
    function currentAt(vBat, rPot, x, vf) {
        const rIn = rPot * x * (1 - x);
        const top = vBat * x - vf;
        if (top <= 0) return 0;
        return rIn > 0 ? top / rIn * 1000 : Infinity;   // mA
    }
    // 전류가 iMaxmA 가 되는 손잡이 위치: R·I·x² + (V − R·I)·x − Vf = 0 의 양의 근
    function safeLimit(vBat, rPot, iMaxmA, vf) {
        const ri = rPot * iMaxmA / 1000;
        const b = vBat - ri;
        const x = (-b + Math.sqrt(b * b + 4 * ri * vf)) / (2 * ri);
        return Math.min(1, x);
    }
    // 화면 안내용 묶음.  vfs: 쓰는 LED 들의 순방향 전압 (V)
    function potGuide(vBat, rPot, iMaxmA, vfs) {
        const vfLow = Math.min(...vfs), vfHigh = Math.max(...vfs);
        const xMax = safeLimit(vBat, rPot, iMaxmA, vfLow);   // 순방향 전압이 가장 낮은 LED 기준 (가장 엄격)
        return {
            drainMa: vBat / rPot * 1000,                     // 가변저항에 늘 흐르는 전류 (mA)
            xMax,                                            // 손잡이를 이 위치 넘게 돌리지 않는다
            rLower: xMax * rPot,                             // 그 위치에서 가운데 다리 ~ − 쪽 다리 저항 (Ω)
            xOnLow: vfLow / vBat, xOnHigh: Math.min(1, vfHigh / vBat), // LED 가 켜지기 시작하는 대략적인 위치
            iHighAtLimit: currentAt(vBat, rPot, xMax, vfHigh), // 안전 한계에서 순방향 전압이 높은 LED 의 전류 (mA)
            seriesR: Math.ceil((vBat - vfLow) / (iMaxmA / 1000) / 10) * 10  // 고정 저항을 따로 넣을 때 권장값 (Ω)
        };
    }

    // 파장(nm) → 화면 표시용 색 (가시광선 근사)
    function wavelengthColor(nm) {
        if (!(nm > 0)) return '#888';
        if (nm < 380) return '#7a3db8';
        if (nm > 750) return '#8b1a1a';
        let r = 0, g = 0, b = 0;
        if (nm < 440) { r = (440 - nm) / 60; b = 1; }
        else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
        else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
        else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
        else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
        else r = 1;
        // 노랑·초록이 흰 바탕에서 잘 보이도록 조금 어둡게
        const k = nm >= 500 && nm < 600 ? 0.8 : 0.95;
        const h2 = v => Math.round(255 * k * v).toString(16).padStart(2, '0');
        return '#' + h2(r) + h2(g) + h2(b);
    }

    return {
        E_CHARGE, C_LIGHT, H_TRUE, LED_PRESETS,
        mean, std, freqOf, photonVolt, leastSquares,
        thresholdByExtrapolation, thresholdAtCurrent, thresholdByGlow, thresholdOf,
        planckFit, currentAt, safeLimit, potGuide, wavelengthColor
    };
});
