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

    return { RAD, linearTable, mean, std, fitMalus, linearRegression };
});
