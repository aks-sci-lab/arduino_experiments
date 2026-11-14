/* 스마트폰 진자 — 계산 모음 (브라우저·Node 공용, 화면 코드 없음)
   - 가상 진자 데이터 만들기(시뮬레이션)
   - 이동평균 → 평균 빼기 → 같은 방향 0 통과(선형 보간) → 주기 T
   - 가속도 축은 한 주기에 최대가 두 번(최대점 간격 = T/2) → 통과 두 번을 한 주기로 셈
   - FFT 로 구한 진동수 비교, 3초 '가만히 두기' 보정, CSV 만들기·읽기
   - (2단계 분석용) T²–L 최소제곱 직선 → g = 4π²/기울기, d = 절편/기울기
   시험: tests/pendulum-math.test.cjs */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PendulumMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var G_STD = 9.80665;          // 시뮬레이션에 쓰는 중력가속도
    var G_REF = 9.80;             // 화면의 비교 기준값 (명세서)
    var DEG = Math.PI / 180;

    var ACC_AXES = ['ax', 'ay', 'az'];
    var GYRO_AXES = ['alpha', 'beta', 'gamma'];
    var AXIS_LABEL = {
        ax: '가속도 x', ay: '가속도 y', az: '가속도 z', amag: '가속도 크기 |a|',
        alpha: '회전 속도 α (z축 둘레)', beta: '회전 속도 β (x축 둘레)', gamma: '회전 속도 γ (y축 둘레)'
    };

    // ---------- 기초 통계 ----------
    function mean(a) {
        if (!a.length) return NaN;
        var s = 0; for (var i = 0; i < a.length; i++) s += a[i];
        return s / a.length;
    }
    function std(a) {   // 표본 표준편차 (n−1)
        if (a.length < 2) return 0;
        var m = mean(a), s = 0;
        for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
        return Math.sqrt(s / (a.length - 1));
    }
    function median(a) {
        if (!a.length) return NaN;
        var b = a.slice().sort(function (x, y) { return x - y; }), h = b.length >> 1;
        return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2;
    }

    // 같은 씨앗이면 같은 값이 나오는 난수 (시험에서 결과가 매번 같도록)
    function rng(seed) {
        var s = (seed >>> 0) || 1;
        return function () {
            s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
            return s / 4294967296;
        };
    }
    function gauss(r) {
        var u = Math.max(r(), 1e-12), v = r();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    // 이론 주기: 작은 진폭 2π√(L/g), 진폭 보정 (1 + θ₀²/16)
    function theoryPeriod(L, g, ampDeg) {
        g = g || G_REF;
        var t = 2 * Math.PI * Math.sqrt(L / g);
        if (ampDeg) { var th = ampDeg * DEG; t *= 1 + th * th / 16; }
        return t;
    }

    // ---------- 시뮬레이션 ----------
    /* 휴대폰을 세워(y축이 줄 방향, 위쪽) 화면 평면 안에서 흔드는 진자.
       회전 속도 α(z축 둘레) = dθ/dt (°/s), 가속도 y = 줄 방향 힘 = g·cosθ + r·(dθ/dt)²
       (가속도계는 중력과 운동 가속도의 차이를 재므로 접선 방향 x 는 거의 0, 줄 방향 y 는 한 주기에 두 번 최대)
       opts: L(m), offset d(m, 줄 끝~폰 무게중심), ampDeg, duration(s), rate(Hz),
             jitter(0~0.5, 샘플 간격 흔들림 비율), noise(0~3 단계 또는 {gyro, acc}), damping(1/s), seed, rest(s, 앞의 가만히 둔 시간) */
    var NOISE_LEVELS = [
        { gyro: 0, acc: 0 },
        { gyro: 0.5, acc: 0.02 },
        { gyro: 2, acc: 0.06 },
        { gyro: 6, acc: 0.15 }
    ];
    function simulate(opts) {
        opts = opts || {};
        var L = num(opts.L, 1), d = num(opts.offset, 0), r = L + d;
        var g = num(opts.g, G_STD);
        var amp = num(opts.ampDeg, 5) * DEG;
        var duration = num(opts.duration, 30), rate = num(opts.rate, 60);
        var jitter = Math.min(0.5, Math.max(0, num(opts.jitter, 0.1)));
        var damping = num(opts.damping, 0.01);
        var rest = num(opts.rest, 0);
        var nz = typeof opts.noise === 'object' && opts.noise ? opts.noise
            : NOISE_LEVELS[Math.max(0, Math.min(3, Math.round(num(opts.noise, 1))))];
        var R = rng(opts.seed == null ? 12345 : opts.seed);
        // 진폭 보정을 넣은 각진동수
        var w = 2 * Math.PI / theoryPeriod(r, g, amp / DEG);
        var phase0 = num(opts.phase, 0.3);
        var dt0 = 1 / rate, t = 0, out = [];
        var t0ms = 1000 + R() * 500;   // 실제 센서처럼 0 이 아닌 시각에서 시작
        while (t <= duration) {
            var tm = t - rest, th = 0, om = 0;
            if (tm >= 0) {
                var e = Math.exp(-damping * tm), ph = w * tm + phase0;
                th = amp * e * Math.cos(ph);
                om = -amp * e * (w * Math.sin(ph) + damping * Math.cos(ph));
            }
            var fy = g * Math.cos(th) + r * om * om;   // 줄 방향
            out.push({
                t: +(t0ms + t * 1000).toFixed(3),
                ax: 0.03 + nz.acc * gauss(R),
                ay: fy + nz.acc * gauss(R),
                az: -0.05 + nz.acc * gauss(R),
                alpha: om / DEG + nz.gyro * gauss(R),
                beta: 0.2 + nz.gyro * gauss(R),
                gamma: -0.1 + nz.gyro * gauss(R)
            });
            t += dt0 * (1 + jitter * (2 * R() - 1));
        }
        return out;
    }
    function num(v, def) { v = Number(v); return Number.isFinite(v) ? v : def; }

    // ---------- 신호 다루기 ----------
    function column(samples, key) {
        return samples.map(function (s) {
            if (key === 'amag') return Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az);
            return Number(s[key]);
        });
    }
    // 가운데 맞춘 이동평균 (창 크기 = 점 개수, 시간이 밀리지 않음)
    function movingAverage(a, win) {
        win = Math.max(1, Math.round(win || 1));
        if (win === 1) return a.slice();
        var h = Math.floor(win / 2), out = new Array(a.length), pre = [0];
        for (var i = 0; i < a.length; i++) pre.push(pre[i] + a[i]);
        for (var j = 0; j < a.length; j++) {
            var lo = Math.max(0, j - h), hi = Math.min(a.length, j - h + win);
            out[j] = (pre[hi] - pre[lo]) / (hi - lo);
        }
        return out;
    }

    /* 아래에서 위로 0 을 지나는 시각 (선형 보간)
       잡음 때문에 0 근처에서 여러 번 오르내리는 것을 막으려고, 한 번 -h 아래로 내려갔다가
       +h 위로 올라간 경우만 인정하고 그 사이 마지막으로 0 을 지난 시각을 쓴다 (h = 신호 크기의 일부). */
    function risingCrossings(times, y, hyst) {
        var h = hyst == null ? 0.25 * rms(y) : hyst;
        var out = [], armed = false, cand = null;
        for (var i = 1; i < y.length; i++) {
            if (y[i] < -h) { armed = true; cand = null; }
            if (!armed) continue;
            if (y[i - 1] < 0 && y[i] >= 0) {
                var f = y[i - 1] / (y[i - 1] - y[i]);
                cand = times[i - 1] + f * (times[i] - times[i - 1]);
            }
            if (y[i] > h && cand != null) { out.push(cand); armed = false; cand = null; }
        }
        return out;
    }
    function rms(a) {
        if (!a.length) return 0;
        var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * a[i];
        return Math.sqrt(s / a.length);
    }

    // 표준편차가 가장 큰 축 (가장 크게 흔들린 축)
    function pickAxis(samples, keys) {
        var best = keys[0], bs = -1;
        keys.forEach(function (k) {
            var s = std(column(samples, k));
            if (s > bs) { bs = s; best = k; }
        });
        return best;
    }

    /* 주기 계산
       samples: [{t(ms), ax, ay, az, alpha, beta, gamma}]
       opts: kind 'gyro'(기본)|'acc', axis 'auto'|'ax'…, smooth(이동평균 점 개수, 'auto'·0·생략이면 자동),
             nPeriods(기본 10, 0 이면 모두), skip(처음 건너뛸 초, 기본 0), fft(true 면 FFT 비교) */
    function analyze(samples, opts) {
        opts = opts || {};
        var kind = opts.kind === 'acc' ? 'acc' : 'gyro';
        var res = { kind: kind, warnings: [], periods: [], crossings: [], used: [] };
        if (!samples || samples.length < 10) { res.error = '데이터가 너무 적습니다. 측정을 더 길게 하세요.'; return res; }
        var axis = opts.axis && opts.axis !== 'auto' ? opts.axis : pickAxis(samples, kind === 'acc' ? ACC_AXES : GYRO_AXES);
        res.axis = axis; res.axisLabel = AXIS_LABEL[axis] || axis;
        var tAll = samples.map(function (s) { return (s.t - samples[0].t) / 1000; });
        var skip = Math.max(0, num(opts.skip, 0));
        var start = 0; while (start < tAll.length && tAll[start] < skip) start++;
        var times = tAll.slice(start), raw = column(samples, axis).slice(start);
        if (times.length < 10) { res.error = '건너뛴 시간이 너무 깁니다.'; return res; }
        var dts = [];
        for (var j = 1; j < times.length; j++) dts.push(times[j] - times[j - 1]);
        res.rate = 1 / mean(dts);
        res.dtStd = std(dts);
        // 가장 센 진동수(FFT): '자동' 이동평균 창을 정하고, 0 통과로 구한 값과 맞는지 확인하는 데 씀
        var rm = mean(raw);
        var fDom = dominantFrequency(times, raw.map(function (v) { return v - rm; }));
        var smooth = opts.smooth === 'auto' || opts.smooth == null || Number(opts.smooth) === 0
            ? autoSmooth(res.rate, fDom) : Math.max(1, Math.round(num(opts.smooth, 5)));
        res.smooth = smooth;
        var sm = movingAverage(raw, smooth);
        var m = mean(sm);
        var y = sm.map(function (v) { return v - m; });
        res.times = times; res.signal = y; res.offset = m; res.t0 = samples[0].t;

        var cr = risingCrossings(times, y);
        res.allCrossings = cr;
        // 가속도: 한 주기에 최대가 두 번 → 통과 두 번이 한 주기
        var step = kind === 'acc' ? 2 : 1;
        var full = [];
        for (var i = 0; i + step < cr.length; i += step) full.push({ t0: cr[i], t1: cr[i + step], T: cr[i + step] - cr[i] });
        if (!full.length) { res.error = '흔들림이 감지되지 않았습니다. 진자가 충분히 흔들렸는지, 고른 축이 맞는지 확인하세요.'; return res; }
        // 손으로 놓는 순간 등 튀는 값 빼기: 중앙값에서 25% 넘게 벗어난 주기
        var md = median(full.map(function (p) { return p.T; }));
        var good = full.filter(function (p) { return Math.abs(p.T - md) <= 0.25 * md; });
        var dropped = full.length - good.length;
        if (dropped) res.warnings.push('중앙값과 25% 넘게 다른 주기 ' + dropped + '개는 계산에서 뺐습니다.');
        var n = Math.round(num(opts.nPeriods, 10));
        var use = n > 0 ? good.slice(0, n) : good;
        if (n > 0 && good.length < n) res.warnings.push('주기가 ' + good.length + '개만 찾아졌습니다 (정한 수: ' + n + '개). 더 오래 측정하세요.');
        res.periods = use.map(function (p, k) { return { index: k + 1, t0: p.t0, t1: p.t1, T: p.T }; });
        res.crossings = [];
        use.forEach(function (p) {
            // 그래프에 표시할 통과 시점 (가속도는 가운데 통과도 함께)
            if (!res.crossings.length || res.crossings[res.crossings.length - 1] !== p.t0) res.crossings.push(p.t0);
            if (step === 2) {
                cr.forEach(function (c) { if (c > p.t0 && c < p.t1) res.crossings.push(c); });
            }
            res.crossings.push(p.t1);
        });
        var Ts = use.map(function (p) { return p.T; });
        res.n = Ts.length;
        res.T = mean(Ts);
        res.Tstd = std(Ts);
        res.Tsem = Ts.length > 1 ? res.Tstd / Math.sqrt(Ts.length) : 0;
        res.freq = 1 / res.T;
        if (fDom && Math.abs(fDom * res.T / step - 1) > 0.1) {
            res.warnings.push('0 통과로 구한 주기와 FFT 로 본 진동이 서로 맞지 않습니다. 잡음이 많을 수 있으니 회전 속도로 계산하거나 "잡음 줄이기"를 크게 해 보세요.');
        }
        if (res.rate < 20) res.warnings.push('1초에 ' + res.rate.toFixed(0) + '번만 기록되었습니다. 다른 앱을 닫고 다시 측정해 보세요.');
        if (kind === 'acc') {
            var a = rms(y);
            if (a < 0.03) res.warnings.push('가속도 변화가 아주 작습니다(' + a.toFixed(3) + ' m/s²). 회전 속도로 계산하는 편이 정확합니다.');
        }
        if (opts.fft) {
            var f = dominantFrequency(times, y);
            if (f) {
                res.fftFreq = kind === 'acc' ? f / 2 : f;
                res.fftT = 1 / res.fftFreq;
            }
        }
        return res;
    }

    /* '자동' 이동평균 창: 신호 한 번 오르내리는 시간의 약 0.4배 (사인파 크기는 약 3/4 로 줄고, 잡음은 크게 줄어듦).
       가운데 맞춘 평균이라 0 통과 시각은 밀리지 않는다. */
    function autoSmooth(rate, f) {
        if (!(rate > 0) || !(f > 0)) return 5;
        return Math.max(1, Math.min(101, Math.round(rate * 0.4 / f)));
    }

    // ---------- FFT ----------
    function fft(re, im) {   // 제자리 기수-2 FFT (길이는 2의 거듭제곱)
        var n = re.length;
        for (var i = 1, j = 0; i < n; i++) {
            var bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) { var tr = re[i]; re[i] = re[j]; re[j] = tr; var ti = im[i]; im[i] = im[j]; im[j] = ti; }
        }
        for (var len = 2; len <= n; len <<= 1) {
            var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
            for (var s = 0; s < n; s += len) {
                var cr = 1, ci = 0;
                for (var k = 0; k < len / 2; k++) {
                    var a = s + k, b = a + len / 2;
                    var xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
                    re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
                    var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
                }
            }
        }
    }
    // 시각이 고르지 않으므로 먼저 일정한 간격으로 다시 뽑고(선형 보간), 한 창(Hann)을 씌워 가장 센 진동수를 찾는다
    function dominantFrequency(times, y) {
        var n = times.length;
        if (n < 16) return null;
        var span = times[n - 1] - times[0];
        var fs = (n - 1) / span;
        var m = Math.floor(span * fs) + 1, N = 1;
        while (N < m * 4) N <<= 1;   // 0 을 붙여 진동수 눈금을 촘촘하게
        var re = new Array(N).fill(0), im = new Array(N).fill(0), k = 0;
        for (var i = 0; i < m; i++) {
            var t = times[0] + i / fs;
            while (k < n - 2 && times[k + 1] < t) k++;
            var f = (t - times[k]) / (times[k + 1] - times[k]);
            var v = y[k] + Math.max(0, Math.min(1, f)) * (y[k + 1] - y[k]);
            re[i] = v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (m - 1)));
        }
        fft(re, im);
        var best = 1, bm = -1, mags = [];
        for (var j = 0; j <= N / 2; j++) {
            mags[j] = Math.hypot(re[j], im[j]);
            if (j > 0 && mags[j] > bm) { bm = mags[j]; best = j; }
        }
        // 이웃 세 점으로 꼭대기 위치를 더 정확하게 (포물선)
        var shift = 0;
        if (best > 0 && best < N / 2) {
            var a = mags[best - 1], b = mags[best], c = mags[best + 1], den = a - 2 * b + c;
            if (den) shift = 0.5 * (a - c) / den;
        }
        return (best + shift) * fs / N;
    }

    // ---------- 3초 가만히 두기 보정 ----------
    /* 중력 방향 축과 부호, 흔들림 정도를 본다.
       안드로이드 크롬은 세운 폰의 가속도 y 가 약 +9.8, 아이폰 사파리는 약 −9.8 로 부호가 반대일 수 있다. */
    function calibrate(samples) {
        if (!samples || samples.length < 5) return { ok: false, error: '센서 값이 들어오지 않았습니다.' };
        var g = {}, sd = {}, gy = {};
        ACC_AXES.forEach(function (k) { var c = column(samples, k); g[k] = mean(c); sd[k] = std(c); });
        GYRO_AXES.forEach(function (k) { gy[k] = mean(column(samples, k)); });
        var mag = Math.sqrt(g.ax * g.ax + g.ay * g.ay + g.az * g.az);
        var axis = 'ax';
        ACC_AXES.forEach(function (k) { if (Math.abs(g[k]) > Math.abs(g[axis])) axis = k; });
        var shake = Math.max(sd.ax, sd.ay, sd.az);
        var res = {
            ok: true, gravity: g, magnitude: mag, axis: axis, sign: g[axis] >= 0 ? 1 : -1,
            shake: shake, gyroBias: gy, still: shake < 0.3, n: samples.length, warnings: []
        };
        if (!(mag > 7 && mag < 12.5)) res.warnings.push('중력 크기가 ' + mag.toFixed(2) + ' m/s² 로 9.8 과 많이 다릅니다. 이 기기는 중력을 포함한 가속도를 주지 않을 수 있습니다.');
        if (!res.still) res.warnings.push('보정하는 동안 폰이 움직였습니다. 가만히 매단 채로 다시 시작해 보세요.');
        return res;
    }

    /* 적은 줄 길이 L 과 잰 주기 T 가 서로 맞는지 (보내기 전 확인용)
       T 로 거꾸로 구한 길이 L_T = g·T²/4π² 는 폰 무게중심까지 더해져 L 보다 조금 긴 게 보통이다.
       L_T/L 이 0.85~1.35 를 벗어나면 L 을 잘못 적었을 가능성이 크다. */
    function lengthCheck(L, T, g) {
        g = g || G_REF;
        if (!(L > 0) || !(T > 0)) return { ok: false, impliedL: NaN, ratio: NaN };
        var impliedL = g * T * T / (4 * Math.PI * Math.PI), ratio = impliedL / L;
        return { ok: ratio >= 0.85 && ratio <= 1.35, impliedL: impliedL, ratio: ratio };
    }

    // ---------- 2단계용: T²–L 직선 ----------
    function leastSquares(xs, ys) {
        var n = xs.length;
        if (n < 2) return null;
        var mx = mean(xs), my = mean(ys), sxx = 0, sxy = 0;
        for (var i = 0; i < n; i++) { sxx += (xs[i] - mx) * (xs[i] - mx); sxy += (xs[i] - mx) * (ys[i] - my); }
        if (!sxx) return null;
        var slope = sxy / sxx, intercept = my - slope * mx, ssr = 0, sst = 0;
        for (var j = 0; j < n; j++) { var e = ys[j] - (slope * xs[j] + intercept); ssr += e * e; sst += (ys[j] - my) * (ys[j] - my); }
        var s2 = n > 2 ? ssr / (n - 2) : 0;
        return {
            slope: slope, intercept: intercept, r2: sst ? 1 - ssr / sst : 1,
            sSlope: Math.sqrt(s2 / sxx), sIntercept: Math.sqrt(s2 * (1 / n + mx * mx / sxx))
        };
    }
    // T² = (4π²/g)(L + d) → 기울기 = 4π²/g, 절편 = 4π²d/g → d = 절편/기울기
    function fitT2L(points, gRef) {
        var ok = (points || []).filter(function (p) { return p.L > 0 && p.T > 0; });
        var fit = leastSquares(ok.map(function (p) { return p.L; }), ok.map(function (p) { return p.T * p.T; }));
        if (!fit) return null;
        var k = 4 * Math.PI * Math.PI;
        fit.g = k / fit.slope;
        fit.sg = k * fit.sSlope / (fit.slope * fit.slope);
        fit.d = fit.intercept / fit.slope;
        gRef = gRef || G_REF;
        fit.gError = (fit.g - gRef) / gRef * 100;
        return fit;
    }

    // ---------- CSV ----------
    var META_KEYS = [
        ['group', '조 번호'], ['L', '줄 길이 L (m)'], ['amplitude', '진폭 (°)'], ['note', '비고'],
        ['source', '자료 (sensor=폰 센서, simulation=시뮬레이션)'], ['measuredAt', '측정 시각'], ['device', '기기'],
        ['sensorAxis', '계산에 쓴 축'], ['kind', '신호 (gyro=회전 속도, acc=가속도)'], ['smooth', '이동평균 점 수'],
        ['skip', '처음 건너뛴 시간 (s)'], ['nPeriods', '주기 수'], ['T_mean', 'T 평균 (s)'], ['T_std', 'T 표준편차 (s)'],
        ['T_sem', 'T 평균의 표준오차 (s)'], ['T_fft', 'FFT 로 구한 T (s)'], ['rate', '샘플 빈도 (Hz)'],
        ['gravityAxis', '보정: 중력 방향 축'], ['gravity', '보정: 중력 크기 (m/s²)']
    ];
    function csvCell(v) {
        if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
        var s = String(v);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function round(v, d) { return Number.isFinite(v) ? +v.toFixed(d) : ''; }
    /* 세 부분: [조건·결과] key,value,설명 → 빈 줄 → [주기] → 빈 줄 → [원본 데이터]
       2단계 분석 화면이 parseCsv 로 다시 읽는다. */
    function toCsv(meta, result, samples) {
        var lines = ['# 스마트폰 진자 측정 (pendulum-measure v1)', 'key,value,설명'];
        META_KEYS.forEach(function (k) { lines.push([k[0], csvCell(meta[k[0]]), csvCell(k[1])].join(',')); });
        lines.push('', 'period,T (s),시작 시각 (s),끝 시각 (s)');
        ((result && result.periods) || []).forEach(function (p) {
            lines.push([p.index, round(p.T, 5), round(p.t0, 4), round(p.t1, 4)].join(','));
        });
        lines.push('', 'time (s),ax (m/s²),ay (m/s²),az (m/s²),alpha (°/s),beta (°/s),gamma (°/s)');
        var t0 = samples && samples.length ? samples[0].t : 0;
        (samples || []).forEach(function (s) {
            lines.push([round((s.t - t0) / 1000, 4), round(s.ax, 4), round(s.ay, 4), round(s.az, 4),
                round(s.alpha, 3), round(s.beta, 3), round(s.gamma, 3)].join(','));
        });
        return lines.join('\r\n') + '\r\n';
    }
    function splitCsvLine(line) {
        var out = [], cur = '', q = false;
        for (var i = 0; i < line.length; i++) {
            var c = line[i];
            if (q) {
                if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
                else cur += c;
            } else if (c === '"') q = true;
            else if (c === ',') { out.push(cur); cur = ''; }
            else cur += c;
        }
        out.push(cur);
        return out;
    }
    function parseCsv(text) {
        var lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
        var meta = {}, periods = [], samples = [], part = '';
        lines.forEach(function (line) {
            if (!line.trim()) { return; }
            if (line[0] === '#') return;
            var c = splitCsvLine(line);
            if (c[0] === 'key') { part = 'meta'; return; }
            if (c[0] === 'period') { part = 'period'; return; }
            if (/^time/.test(c[0])) { part = 'data'; return; }
            if (part === 'meta') {
                var v = c[1], n = Number(v);
                meta[c[0]] = v !== '' && Number.isFinite(n) && c[0] !== 'group' && c[0] !== 'note' ? n : v;
            } else if (part === 'period') {
                periods.push({ index: +c[0], T: +c[1], t0: +c[2], t1: +c[3] });
            } else if (part === 'data') {
                samples.push({ t: +c[0] * 1000, ax: +c[1], ay: +c[2], az: +c[3], alpha: +c[4], beta: +c[5], gamma: +c[6] });
            }
        });
        return { meta: meta, periods: periods, samples: samples };
    }

    return {
        G_STD: G_STD, G_REF: G_REF, ACC_AXES: ACC_AXES, GYRO_AXES: GYRO_AXES, AXIS_LABEL: AXIS_LABEL, NOISE_LEVELS: NOISE_LEVELS,
        mean: mean, std: std, median: median, rms: rms, theoryPeriod: theoryPeriod,
        simulate: simulate, column: column, movingAverage: movingAverage, risingCrossings: risingCrossings,
        pickAxis: pickAxis, autoSmooth: autoSmooth, analyze: analyze, fft: fft, dominantFrequency: dominantFrequency, calibrate: calibrate,
        lengthCheck: lengthCheck, leastSquares: leastSquares, fitT2L: fitT2L, toCsv: toCsv, parseCsv: parseCsv
    };
});
