// 얼굴 심박(rPPG) 개발용 계산 (브라우저·Node 공용, 화면 없음). 시험 tests/face-hr-math.test.cjs
//  페이지: projects/face-hr-lab.html (선생님 전용 개발 페이지)
//  얼굴 피부(이마·양 볼)의 빨강·초록·파랑 평균이 심장이 뛸 때마다 아주 조금(0.1~0.5 %) 바뀌는 것으로 심박수를 구한다 (원격 광용적맥파, rPPG)
//  세 방법을 함께 계산해 비교한다
//   - GREEN : 초록 평균만 쓴다 (Verkruysse 2008). 가장 단순, 조명 출렁임에 약함
//   - CHROM : 색차 두 신호 X = 3R−2G, Y = 1.5R+G−1.5B 를 섞어 흰빛(밝기·반사) 변화를 지운다 (de Haan & Jeanne 2013)
//   - POS   : 피부색에 수직인 평면에 투영해 밝기 변화를 지운다 (Wang 외 2017, 창 1.6초)
//  그다음 0.6~3.5 Hz(분당 36~210회)만 남기고, 10초 창을 1초씩 옮기며 주파수 분석(FFT) 최댓값 = 그 시각의 심박수
//  손가락 측정(js/heart-rate-math.js)과 따로 두었다 — 나중에 합칠 때 resample·bandpass·fft 가 같은 일을 한다
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.FaceHrMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const BAND = [0.6, 3.5];      // Hz
    const FS = 30;                // 고른 간격 (Hz)
    const WIN = 10, STEP = 1;     // 심박수 창 (초)
    const ROIS = ['fh', 'lc', 'rc'];
    const ROI_NAMES = { all: '합침', fh: '이마', lc: '왼볼', rc: '오른볼' };
    const METHODS = ['green', 'chrom', 'pos'];
    const METHOD_NAMES = { green: 'GREEN', chrom: 'CHROM', pos: 'POS' };
    const MOTION_HIGH = 0.004;    // 프레임당 얼굴 너비의 0.4 % 넘게 움직인 프레임 = 크게 움직임

    const mean = a => { let s = 0, n = 0; for (const x of a) if (Number.isFinite(x)) { s += x; n++; } return n ? s / n : NaN; };
    const std = a => { const m = mean(a); let s = 0, n = 0; for (const x of a) if (Number.isFinite(x)) { s += (x - m) * (x - m); n++; } return n ? Math.sqrt(s / n) : NaN; };
    const median = a => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); if (!b.length) return NaN; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
    const round = (x, d) => Number.isFinite(x) ? +x.toFixed(d) : null;

    // ---------- 고른 간격으로 보간 ----------
    function resample(t, y, fs, t0, t1) {
        fs = fs || FS;
        const idx = [];
        for (let i = 0; i < t.length; i++) if (Number.isFinite(t[i]) && Number.isFinite(y[i])) idx.push(i);
        idx.sort((a, b) => t[a] - t[b]);
        const tt = [], yy = [];
        idx.forEach(i => { if (!tt.length || t[i] > tt[tt.length - 1]) { tt.push(t[i]); yy.push(y[i]); } });
        if (t0 == null) t0 = tt[0];
        if (t1 == null) t1 = tt[tt.length - 1];
        if (tt.length < 2 || !(t1 > t0)) return { t0: t0 || 0, fs, y: [] };
        const n = Math.floor((t1 - t0) * fs) + 1, out = new Array(n);
        let j = 0;
        for (let k = 0; k < n; k++) {
            const tk = t0 + k / fs;
            while (j < tt.length - 2 && tt[j + 1] < tk) j++;
            const a = tt[j], b = tt[j + 1], f = b > a ? (tk - a) / (b - a) : 0;
            out[k] = yy[j] + (yy[j + 1] - yy[j]) * Math.min(1, Math.max(0, f));
        }
        return { t0, fs, y: out };
    }

    function movingMean(y, win) {
        const n = y.length, h = Math.max(1, Math.round(win / 2)), out = new Array(n), cs = [0];
        for (let i = 0; i < n; i++) cs.push(cs[i] + y[i]);
        for (let i = 0; i < n; i++) { const a = Math.max(0, i - h), b = Math.min(n, i + h + 1); out[i] = (cs[b] - cs[a]) / (b - a); }
        return out;
    }

    // ---------- FFT (2의 거듭제곱 길이, 제자리) ----------
    function fft(re, im, inverse) {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; }
        }
        for (let len = 2; len <= n; len <<= 1) {
            const ang = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
            for (let i = 0; i < n; i += len) {
                let cr = 1, ci = 0;
                for (let k = 0; k < len / 2; k++) {
                    const a = i + k, b = a + len / 2;
                    const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
                    re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
                    const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
                }
            }
        }
        if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
    }
    const pow2 = n => { let p = 1; while (p < n) p <<= 1; return p; };

    // ---------- 대역 거르기 (위상 지연 없음): 띠 안은 그대로, 바깥 0.15 Hz 는 부드럽게 ----------
    function bandpass(y, fs, band) {
        band = band || BAND;
        const n = y.length;
        if (n < 4) return y.map(() => 0);
        const N = pow2(n * 2), m = mean(y);
        const re = new Float64Array(N), im = new Float64Array(N);
        // 끝을 거울처럼 이어 붙여 가장자리 튐을 줄임
        for (let i = 0; i < N; i++) { let k = i < n ? i : (i < 2 * n ? 2 * n - 1 - i : 0); if (i >= 2 * n) { re[i] = 0; continue; } re[i] = y[k] - m; }
        fft(re, im, false);
        const tw = 0.15;
        for (let k = 0; k < N; k++) {
            const f = Math.min(k, N - k) * fs / N;
            let g = 0;
            if (f >= band[0] && f <= band[1]) g = 1;
            else if (f < band[0] && f > band[0] - tw) g = 0.5 - 0.5 * Math.cos(Math.PI * (f - (band[0] - tw)) / tw);
            else if (f > band[1] && f < band[1] + tw) g = 0.5 + 0.5 * Math.cos(Math.PI * (f - band[1]) / tw);
            re[k] *= g; im[k] *= g;
        }
        fft(re, im, true);
        return Array.from(re.subarray(0, n));
    }

    // ---------- 프레임 → 고른 간격 R·G·B ----------
    // frame: { t(초), rois: { fh:[r,g,b,n], lc:[…], rc:[…] }, m(움직임), y(밝기), et, iso }
    // roi: 'fh' | 'lc' | 'rc' | 'all'(화소 수로 가중 평균)
    function roiRgb(f, roi) {
        if (!f || !f.rois) return null;
        if (roi !== 'all') { const v = f.rois[roi]; return v && v[3] > 0 && Number.isFinite(v[1]) ? v : null; }
        let r = 0, g = 0, b = 0, n = 0;
        ROIS.forEach(k => { const v = f.rois[k]; if (v && v[3] > 0 && Number.isFinite(v[1])) { r += v[0] * v[3]; g += v[1] * v[3]; b += v[2] * v[3]; n += v[3]; } });
        return n ? [r / n, g / n, b / n, n] : null;
    }
    function rgbSeries(frames, roi, opts) {
        opts = opts || {};
        const fs = opts.fs || FS;
        const t = [], R = [], G = [], B = [];
        let eRef = NaN;
        if (opts.expNorm) eRef = median(frames.map(f => f.et != null ? f.et * (f.iso || 1) : NaN));
        frames.forEach(f => {
            const v = roiRgb(f, roi);
            if (!v) return;
            let k = 1;
            if (opts.expNorm && Number.isFinite(eRef) && f.et != null) { const e = f.et * (f.iso || 1); if (e > 0) k = eRef / e; }
            t.push(f.t); R.push(v[0] * k); G.push(v[1] * k); B.push(v[2] * k);
        });
        const t0 = opts.t0 != null ? opts.t0 : t[0], t1 = opts.t1 != null ? opts.t1 : t[t.length - 1];
        const r = resample(t, R, fs, t0, t1), g = resample(t, G, fs, t0, t1), b = resample(t, B, fs, t0, t1);
        return { t0: r.t0, fs, R: r.y, G: g.y, B: b.y, used: t.length };
    }

    // ---------- 세 방법: R·G·B (고른 간격) → 맥파 신호 ----------
    function green(R, G, B, fs) {
        const mm = movingMean(G, Math.round(fs * 1.6));
        return bandpass(G.map((x, i) => mm[i] ? x / mm[i] - 1 : 0), fs);
    }
    function hann(n) { const w = new Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1 || 1)); return w; }
    function chrom(R, G, B, fs) {
        const n = G.length, L = Math.max(8, 2 * Math.round(fs * 0.8)), w = hann(L);
        const mr = movingMean(R, L), mg = movingMean(G, L), mb = movingMean(B, L);
        const X = new Array(n), Y = new Array(n);
        for (let i = 0; i < n; i++) {
            const rn = R[i] / mr[i], gn = G[i] / mg[i], bn = B[i] / mb[i];
            X[i] = 3 * rn - 2 * gn; Y[i] = 1.5 * rn + gn - 1.5 * bn;
        }
        const Xf = bandpass(X, fs), Yf = bandpass(Y, fs), S = new Array(n).fill(0);
        if (n < L) { const a = std(Xf) / (std(Yf) || 1); return Xf.map((x, i) => x - a * Yf[i]); }
        for (let s = 0; s + L <= n; s += L / 2) {
            const xs = Xf.slice(s, s + L), ys = Yf.slice(s, s + L), a = std(xs) / (std(ys) || 1);
            for (let i = 0; i < L; i++) S[s + i] += (xs[i] - a * ys[i]) * w[i];
        }
        return S;
    }
    function pos(R, G, B, fs) {
        const n = G.length, l = Math.max(4, Math.round(fs * 1.6)), H = new Array(n).fill(0);
        for (let e = l; e <= n; e++) {
            const s = e - l;
            let mr = 0, mg = 0, mb = 0;
            for (let i = s; i < e; i++) { mr += R[i]; mg += G[i]; mb += B[i]; }
            mr /= l; mg /= l; mb /= l;
            if (!(mr > 0 && mg > 0 && mb > 0)) continue;
            const s1 = new Array(l), s2 = new Array(l);
            for (let i = 0; i < l; i++) { const rn = R[s + i] / mr, gn = G[s + i] / mg, bn = B[s + i] / mb; s1[i] = gn - bn; s2[i] = -2 * rn + gn + bn; }
            const a = std(s1) / (std(s2) || 1);
            const h = s1.map((x, i) => x + a * s2[i]), hm = mean(h);
            for (let i = 0; i < l; i++) H[s + i] += h[i] - hm;
        }
        return bandpass(H, fs);
    }
    const METHOD_FN = { green, chrom, pos };

    // ---------- 한 창의 심박수: 한 창(Hann) → 0을 채워 FFT → 띠 안 최댓값(포물선 보간) ----------
    function peakBpm(seg, fs, band) {
        band = band || BAND;
        const n = seg.length, N = Math.max(4096, pow2(n * 4)), m = mean(seg), w = hann(n);
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < n; i++) re[i] = (seg[i] - m) * w[i];
        fft(re, im, false);
        const p = new Float64Array(N / 2);
        for (let k = 0; k < N / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
        const lo = Math.ceil(band[0] * N / fs), hi = Math.floor(band[1] * N / fs);
        let best = -1, bv = -1, tot = 0;
        for (let k = lo; k <= hi; k++) { tot += p[k]; if (p[k] > bv) { bv = p[k]; best = k; } }
        if (best < 0 || !(bv > 0)) return { bpm: NaN, snr: -Infinity };
        let d = 0;
        if (best > lo && best < hi) { const a = p[best - 1], b = p[best], c = p[best + 1], den = a - 2 * b + c; if (den) d = Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)); }
        const f = (best + d) * fs / N;
        // 신호 대 잡음비 (de Haan): 기본·2배 주파수 ±0.1 Hz 안의 힘 ÷ 나머지 (dB)
        let sig = 0, all = 0;
        const bw = Math.round(0.1 * N / fs);
        for (let k = lo; k <= Math.min(hi * 2, N / 2 - 1); k++) {
            all += p[k];
            if (Math.abs(k - (best + d)) <= bw || Math.abs(k - 2 * (best + d)) <= bw * 2) sig += p[k];
        }
        const snr = all - sig > 0 ? 10 * Math.log10(sig / (all - sig)) : 30;
        return { bpm: f * 60, snr };
    }

    // 신호 → [{ t(창 가운데, 초), bpm, snr }]
    function windows(sig, fs, t0, opts) {
        opts = opts || {};
        const win = opts.win || WIN, step = opts.step || STEP, L = Math.round(win * fs), S = Math.max(1, Math.round(step * fs));
        const out = [];
        for (let s = 0; s + L <= sig.length; s += S) {
            const pk = peakBpm(sig.slice(s, s + L), fs, opts.band);
            out.push({ t: round(t0 + (s + L / 2) / fs, 3), bpm: round(pk.bpm, 2), snr: round(pk.snr, 2) });
        }
        return out;
    }

    // 움직임: 창별 평균
    function motionWindows(frames, t0, t1, opts) {
        opts = opts || {};
        const win = opts.win || WIN, step = opts.step || STEP, out = [];
        for (let a = t0; a + win <= t1 + 1e-9; a += step) {
            const ms = frames.filter(f => f.t >= a && f.t < a + win && Number.isFinite(f.m)).map(f => f.m);
            const m = mean(ms), th = opts.motionHigh || MOTION_HIGH;
            // 창 안 프레임의 15 % 넘게(10초 창이면 1.5초 넘게) 크게 움직이면 '움직임 많음'
            const frac = ms.length ? ms.filter(x => x > th).length / ms.length : 0;
            out.push({ t: round(a + win / 2, 3), m: round(m, 5), frac: round(frac, 3), high: frac > 0.15 });
        }
        return out;
    }

    // ---------- 얼굴 프레임 분석 ----------
    // → { ok, fps, dur, t0, t1, faceRate, series: { green: { all:[…], fh, lc, rc }, chrom, pos }, signal: { pos: […] (합친 맥파, 그림용) }, motion: […] }
    function analyze(frames, opts) {
        opts = opts || {};
        const fr = (frames || []).filter(f => f && Number.isFinite(f.t)).sort((a, b) => a.t - b.t);
        const withFace = fr.filter(f => roiRgb(f, 'all'));
        const win = opts.win || WIN;
        if (withFace.length < 10) return { ok: false, error: '얼굴 색 자료가 거의 없어요' };
        const t0 = withFace[0].t, t1 = withFace[withFace.length - 1].t, dur = t1 - t0;
        if (dur < win + 1) return { ok: false, error: '측정이 너무 짧아요 (' + (win + 1) + '초 이상 필요, 지금 ' + dur.toFixed(1) + '초)' };
        const fps = (withFace.length - 1) / dur;
        const series = {}, signal = {};
        const rois = ['all'].concat(ROIS);
        METHODS.forEach(m => { series[m] = {}; });
        rois.forEach(roi => {
            const rgb = rgbSeries(fr, roi, { fs: FS, t0, t1, expNorm: opts.expNorm });
            if (rgb.used < 10 || rgb.G.length < win * FS) return;
            METHODS.forEach(m => {
                const s = METHOD_FN[m](rgb.R, rgb.G, rgb.B, FS);
                series[m][roi] = windows(s, FS, t0, opts);
                if (roi === 'all') signal[m] = s;
            });
        });
        return {
            ok: true, fps: round(fps, 2), dur: round(dur, 2), t0, t1, faceRate: round(withFace.length / fr.length, 3),
            series, signal, fs: FS, motion: motionWindows(fr, t0, t1, opts), expNorm: !!opts.expNorm
        };
    }

    // ---------- 정답 ----------
    // 손가락 프레임 { t, r, g, b } → [{ t, bpm }]  (피가 많을수록 어두워짐 → −log 빨강, 창마다 FFT)
    function fingerTruth(frames, opts) {
        opts = opts || {};
        const fr = (frames || []).filter(f => f && Number.isFinite(f.t) && Number.isFinite(f.r)).sort((a, b) => a.t - b.t);
        if (fr.length < 20) return [];
        // 빨강이 꽉 찼으면(250 넘음) 초록이 더 낫다
        const satR = mean(fr.map(f => f.r)) > 245 && fr.every(f => Number.isFinite(f.g));
        const y = fr.map(f => -Math.log(Math.max(0.5, satR ? f.g : f.r)));
        const rs = resample(fr.map(f => f.t), y, FS);
        if (rs.y.length < (opts.win || WIN) * FS) return [];
        const s = bandpass(rs.y, FS);
        return windows(s, FS, rs.t0, opts).map(w => ({ t: w.t, bpm: w.bpm, snr: w.snr }));
    }
    // 손목 15초 세기 [{ t0, t1, count }] → [{ t(가운데), bpm }]
    function wristTruth(counts) {
        return (counts || []).filter(c => c && Number.isFinite(+c.count) && +c.count > 0 && Number.isFinite(+c.t0) && Number.isFinite(+c.t1) && c.t1 > c.t0)
            .map(c => ({ t: round((+c.t0 + +c.t1) / 2, 3), bpm: round(+c.count * 60 / (c.t1 - c.t0), 2) }));
    }
    // 블루투스 심박계 값 [{ t, bpm }] → 창 가운데 시각에 맞춘 평균 (창 안 평균)
    function smoothTruth(pts, opts) {
        opts = opts || {};
        const p = (pts || []).filter(x => Number.isFinite(x.t) && Number.isFinite(x.bpm) && x.bpm > 0).sort((a, b) => a.t - b.t);
        if (!p.length) return [];
        const win = opts.win || WIN, step = opts.step || STEP, out = [];
        for (let a = p[0].t; a + win <= p[p.length - 1].t + 1e-9; a += step) {
            const v = p.filter(x => x.t >= a && x.t < a + win).map(x => x.bpm);
            if (v.length) out.push({ t: round(a + win / 2, 3), bpm: round(mean(v), 2) });
        }
        return out.length ? out : p.map(x => ({ t: x.t, bpm: x.bpm }));
    }

    // 정답을 시각 t 에서 읽기 (선형 보간, 범위 밖은 maxGap 초 안의 가장 가까운 점)
    function truthAt(truth, t, maxGap) {
        const p = truth;
        if (!p || !p.length) return NaN;
        maxGap = maxGap == null ? 8 : maxGap;
        if (t <= p[0].t) return p[0].t - t <= maxGap ? p[0].bpm : NaN;
        if (t >= p[p.length - 1].t) return t - p[p.length - 1].t <= maxGap ? p[p.length - 1].bpm : NaN;
        let lo = 0, hi = p.length - 1;
        while (hi - lo > 1) { const md = (lo + hi) >> 1; if (p[md].t <= t) lo = md; else hi = md; }
        const a = p[lo], b = p[hi];
        if (b.t - a.t > Math.max(maxGap * 2, 40)) return NaN;
        return a.bpm + (b.bpm - a.bpm) * (t - a.t) / (b.t - a.t);
    }

    // ---------- 비교 ----------
    // est: [{ t, bpm }], truth: [{ t, bpm }] (오름차순), motion: [{ t, high }] (같은 창)
    function compare(est, truth, motion, opts) {
        opts = opts || {};
        const lag = opts.lag || 0, mx = {};
        (motion || []).forEach(m => { mx[m.t] = m.high; });
        const pairs = [];
        (est || []).forEach(w => {
            if (!Number.isFinite(w.bpm)) return;
            const g = truthAt(truth, w.t + lag, opts.maxGap);
            if (Number.isFinite(g)) pairs.push({ t: w.t, est: w.bpm, gt: g, moving: !!mx[w.t] });
        });
        if (!pairs.length) return { n: 0, mae: null, rmse: null, within5: null, r: null, maeStill: null, nMoving: 0, pairs };
        const err = pairs.map(p => p.est - p.gt), still = pairs.filter(p => !p.moving);
        const mae = mean(err.map(Math.abs)), rmse = Math.sqrt(mean(err.map(e => e * e)));
        const within5 = pairs.filter(p => Math.abs(p.est - p.gt) <= 5).length / pairs.length;
        const xs = pairs.map(p => p.est), ys = pairs.map(p => p.gt), mxv = mean(xs), myv = mean(ys);
        let sxy = 0, sxx = 0, syy = 0;
        pairs.forEach(p => { sxy += (p.est - mxv) * (p.gt - myv); sxx += (p.est - mxv) ** 2; syy += (p.gt - myv) ** 2; });
        const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
        return {
            n: pairs.length, mae: round(mae, 2), rmse: round(rmse, 2), within5: round(within5, 3), r: round(r, 3), bias: round(mean(err), 2),
            maeStill: still.length ? round(mean(still.map(p => Math.abs(p.est - p.gt))), 2) : null, nMoving: pairs.length - still.length, pairs
        };
    }
    // 두 기기 시각이 조금 어긋났을 때: ±range 초에서 평균 절대 오차가 가장 작은 지연 (정답 = 얼굴 시각 + lag)
    function bestLag(est, truth, range, step) {
        range = range == null ? 15 : range; step = step || 0.5;
        let best = { lag: 0, mae: Infinity, n: 0 };
        const need = Math.max(5, 0.5 * (est || []).length);
        for (let lag = -range; lag <= range + 1e-9; lag += step) {
            const c = compare(est, truth, null, { lag, maxGap: 0 });
            if (c.n >= need && c.mae < best.mae - 1e-9) best = { lag: round(lag, 2), mae: c.mae, n: c.n };
        }
        // 심박이 거의 일정하면 어느 지연이나 비슷함 → 0초보다 확실히(10 % 이상, 0.3회/분 이상) 나을 때만 옮김
        const z = compare(est, truth, null, { lag: 0, maxGap: 0 });
        if (z.n >= need && !(best.mae < z.mae * 0.9 && z.mae - best.mae >= 0.3)) best = { lag: 0, mae: z.mae, n: z.n, kept: true };
        return best;
    }
    // 방법 × 영역 성능표 (오차가 작은 순)
    function table(res, truth, opts) {
        opts = opts || {};
        const rows = [];
        if (!res || !res.ok) return rows;
        METHODS.forEach(m => Object.keys(res.series[m] || {}).forEach(roi => {
            const c = compare(res.series[m][roi], truth, res.motion, opts);
            rows.push({ method: m, roi, name: METHOD_NAMES[m] + ' · ' + ROI_NAMES[roi], n: c.n, mae: c.mae, rmse: c.rmse, within5: c.within5, r: c.r, bias: c.bias, maeStill: c.maeStill, nMoving: c.nMoving, snr: round(median(res.series[m][roi].map(w => w.snr)), 1) });
        }));
        return rows.sort((a, b) => (a.mae == null ? 1e9 : a.mae) - (b.mae == null ? 1e9 : b.mae));
    }

    // ---------- 블루투스 심박계 (Heart Rate Measurement 0x2A37) ----------
    // bytes: Uint8Array 또는 DataView → { bpm, contact(true|false|null), energy, rr:[초] }
    function parseHrMeasurement(v) {
        const u8 = v instanceof DataView ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : (v instanceof Uint8Array ? v : new Uint8Array(v));
        if (u8.length < 2) return null;
        const flags = u8[0];
        let i = 1, bpm;
        if (flags & 1) { if (u8.length < 3) return null; bpm = u8[1] | (u8[2] << 8); i = 3; } else { bpm = u8[1]; i = 2; }
        const contact = (flags & 4) ? !!(flags & 2) : null;
        let energy = null;
        if (flags & 8) { if (u8.length >= i + 2) energy = u8[i] | (u8[i + 1] << 8); i += 2; }
        const rr = [];
        if (flags & 16) for (; i + 1 < u8.length; i += 2) rr.push(round((u8[i] | (u8[i + 1] << 8)) / 1024, 4));
        return { bpm, contact, energy, rr };
    }

    // ---------- 정답 경로 고르기 ----------
    // 순서: ① 같은 폰 후면 동시 ② 두 번째 폰 ③ 블루투스 심박계 ④ 손목 15초×4
    // cap: { dual: 'ok'|'fail'|'untried', dualError, server(true: 선생님 시트 있음), bluetooth(true: Web Bluetooth 있음) }
    const PATHS = ['dual', 'phone2', 'ble', 'wrist'];
    const PATH_NAMES = { dual: '① 같은 폰 후면 카메라 (손가락)', phone2: '② 두 번째 폰 후면 카메라 (손가락)', ble: '③ 블루투스 심박계', wrist: '④ 손목 맥박 15초 × 4번' };
    function choosePath(cap) {
        cap = cap || {};
        const why = [];
        if (cap.dual === 'ok') return { path: 'dual', why: ['같은 폰에서 앞·뒤 카메라를 함께 열 수 있어요'] };
        if (cap.dual === 'fail') why.push('같은 폰 동시 열기 실패: ' + (cap.dualError || '이유 모름'));
        else why.push('같은 폰 동시 열기는 아직 시험하지 않았어요');
        if (cap.server) return { path: 'phone2', why: why.concat(['선생님 시트가 있어 두 번째 폰으로 손가락을 잴 수 있어요']) };
        why.push('선생님 시트가 없어 두 번째 폰을 이을 수 없어요');
        if (cap.bluetooth) return { path: 'ble', why: why.concat(['이 브라우저는 블루투스 심박계를 쓸 수 있어요']) };
        why.push('이 브라우저는 블루투스(Web Bluetooth)를 쓸 수 없어요');
        return { path: 'wrist', why: why.concat(['손목 맥박을 15초씩 4번 세어 넣어요']) };
    }

    // ---------- 시계 맞추기 (서버 왕복) ----------
    // probe: { sendMs, recvMs (이 기기 시계), serverIso } → 이 기기 시계 − 서버 시계 (ms), 오차 범위 ± rtt/2
    function clockOffset(probe) {
        const s = Date.parse(probe.serverIso);
        if (!Number.isFinite(s) || !Number.isFinite(probe.sendMs) || !Number.isFinite(probe.recvMs)) return null;
        const mid = (probe.sendMs + probe.recvMs) / 2;
        return { offset: Math.round(mid - s), err: Math.round((probe.recvMs - probe.sendMs) / 2) };
    }

    // ---------- 시뮬레이션: 얼굴 색 평균 + 손가락 정답 ----------
    function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    // opts: { dur(초), fps, bpm, drift(분당 몇 회 오르내림), amp(맥동 세기, 초록 기준 비율), illum(조명 출렁임 세기, 비율), illumHz([Hz…] 조명 출렁임 주파수),
    //         motion(움직임 세기 0~1), noise(화소 평균 잡음, 0~255 눈금), jitter(프레임 간격 흔들림, 초), seed }
    // 피부 맥동 방향(정규화 RGB): PBV ≈ [0.33, 0.77, 0.53] (de Haan 2014) — 초록이 가장 큼
    function simulate(opts) {
        opts = Object.assign({ dur: 40, fps: 30, bpm: 72, drift: 6, amp: 0.0025, illum: 0.006, illumHz: [1.55, 0.9], motion: 0.3, noise: 0.15, jitter: 0.004, seed: 7 }, opts || {});
        const r = rng(opts.seed), PBV = [0.33, 0.77, 0.53];
        const base = { fh: [182, 132, 108], lc: [190, 128, 106], rc: [186, 126, 104] }, npx = { fh: 900, lc: 600, rc: 600 };
        const ph0 = opts.illumHz.map(() => r() * 2 * Math.PI);
        const bpmAt = t => opts.bpm + opts.drift * Math.sin(2 * Math.PI * t / 25);
        // 움직임 구간: 매 15초 중 2초 동안 고개를 돌림
        const moveAt = t => opts.motion > 0 && (t % 15) > 9 && (t % 15) < 11 ? opts.motion : opts.motion * 0.05;
        const frames = [], finger = [];
        let phase = 0, t = 0, prev = 0, x = 0;
        while (t <= opts.dur) {
            const dt = t - prev; prev = t;
            phase += 2 * Math.PI * bpmAt(t) / 60 * dt;
            const p = Math.sin(phase) + 0.35 * Math.sin(2 * phase - 0.6);                     // 맥동 (기본 + 2배 성분)
            let ill = 0; opts.illumHz.forEach((f, k) => { ill += Math.sin(2 * Math.PI * f * t + ph0[k]) / opts.illumHz.length; });
            const mv = moveAt(t);
            x += mv * (r() - 0.5) * 0.02;
            const I = 1 + opts.illum * ill + mv * 0.02 * Math.sin(2 * Math.PI * 0.7 * t);    // 흰빛 밝기 변화 (조명·그림자)
            const spec = 3 + mv * 6 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.45 * t));          // 번들거림 (흰빛 더하기)
            const rois = {};
            ROIS.forEach(k => {
                const c = base[k].map((b, ch) => b * I * (1 + opts.amp * (PBV[ch] / PBV[1]) * p) + spec + gauss(r) * opts.noise);
                rois[k] = [round(c[0], 3), round(c[1], 3), round(c[2], 3), npx[k]];
            });
            frames.push({ t: round(t, 4), rois, m: round(mv * 0.01 * (0.5 + r()), 5), y: round(0.299 * rois.fh[0] + 0.587 * rois.fh[1] + 0.114 * rois.fh[2], 2), et: null, iso: null });
            // 손가락(정답): 빨강 평균이 맥박마다 어두워짐
            const fq = ((phase / (2 * Math.PI)) % 1 - 0.15) / 0.09, fp = Math.exp(-fq * fq);
            finger.push({ t: round(t, 4), r: round(200 * (1 - 0.03 * fp) + gauss(r) * 0.2, 3), g: round(30 * (1 - 0.03 * fp), 3), b: 20 });
            t += 1 / opts.fps + (r() - 0.5) * 2 * opts.jitter;
        }
        const truth = [];
        for (let s = 0; s <= opts.dur; s += 1) truth.push({ t: s, bpm: round(bpmAt(s), 2) });
        return { frames, finger, truth, opts };
    }

    // ---------- 내보내기 ----------
    // 한 회 측정(session): { v:1, kind:'face-hr', meta:{…}, frames:[…], truth:{ source, finger:[…], points:[{t,bpm}], counts:[…], log:[…] } }
    function toCsv(session) {
        const L = ['# face-hr-lab v1', '# meta,' + JSON.stringify(session.meta || {}).replace(/\n/g, ' ')];
        L.push('kind,t,fh_r,fh_g,fh_b,fh_n,lc_r,lc_g,lc_b,lc_n,rc_r,rc_g,rc_b,rc_n,motion,y,exposureTime,iso');
        const v = x => x == null || !Number.isFinite(+x) ? '' : String(x);
        (session.frames || []).forEach(f => {
            const c = [];
            ROIS.forEach(k => { const a = f.rois && f.rois[k]; c.push(v(a && a[0]), v(a && a[1]), v(a && a[2]), v(a && a[3])); });
            L.push(['face', v(f.t)].concat(c, [v(f.m), v(f.y), v(f.et), v(f.iso)]).join(','));
        });
        const tr = session.truth || {};
        if (tr.source) L.push('# truth,' + JSON.stringify({ source: tr.source, lag: tr.lag || 0, note: tr.note || '' }));
        L.push('kind,t,r,g,b');
        (tr.finger || []).forEach(f => L.push(['finger', v(f.t), v(f.r), v(f.g), v(f.b)].join(',')));
        L.push('kind,t,bpm');
        (tr.points || []).forEach(p => L.push(['hr', v(p.t), v(p.bpm)].join(',')));
        L.push('kind,t0,t1,count');
        (tr.counts || []).forEach(c => L.push(['wrist', v(c.t0), v(c.t1), v(c.count)].join(',')));
        return L.join('\n') + '\n';
    }
    function parseCsv(text) {
        const s = { v: 1, kind: 'face-hr', meta: {}, frames: [], truth: { source: '', finger: [], points: [], counts: [] } };
        const n = x => x === '' || x == null ? null : (Number.isFinite(+x) ? +x : null);
        String(text || '').replace(/^﻿/, '').split(/\r?\n/).forEach(line => {
            if (!line.trim()) return;
            if (line.startsWith('# meta,')) { try { s.meta = JSON.parse(line.slice(7)); } catch (e) { /* 무시 */ } return; }
            if (line.startsWith('# truth,')) { try { const o = JSON.parse(line.slice(8)); s.truth.source = o.source || ''; s.truth.lag = o.lag || 0; s.truth.note = o.note || ''; } catch (e) { /* 무시 */ } return; }
            const c = line.split(',');
            if (c[0] === 'face') {
                const rois = {};
                ROIS.forEach((k, i) => { const a = c.slice(2 + i * 4, 6 + i * 4).map(n); if (a[1] != null) rois[k] = a; });
                s.frames.push({ t: n(c[1]), rois, m: n(c[14]), y: n(c[15]), et: n(c[16]), iso: n(c[17]) });
            } else if (c[0] === 'finger') s.truth.finger.push({ t: n(c[1]), r: n(c[2]), g: n(c[3]), b: n(c[4]) });
            else if (c[0] === 'hr') s.truth.points.push({ t: n(c[1]), bpm: n(c[2]) });
            else if (c[0] === 'wrist') s.truth.counts.push({ t0: n(c[1]), t1: n(c[2]), count: n(c[3]) });
        });
        if (!s.frames.length) return { error: '얼굴 프레임(face 줄)을 찾지 못했어요' };
        return s;
    }
    function parseJson(text) {
        let o;
        try { o = JSON.parse(String(text || '')); } catch (e) { return { error: 'JSON 을 읽지 못했어요' }; }
        if (!o || o.kind !== 'face-hr' || !Array.isArray(o.frames)) return { error: '얼굴 심박 개발 페이지에서 내보낸 파일이 아니에요' };
        o.truth = Object.assign({ source: '', finger: [], points: [], counts: [] }, o.truth || {});
        return o;
    }
    // 정답 종류에 따라 [{t,bpm}] 만들기
    function truthSeries(tr, opts) {
        tr = tr || {};
        if (tr.source === 'wrist') return wristTruth(tr.counts);
        if (tr.source === 'ble') return smoothTruth(tr.points, opts);
        if (tr.finger && tr.finger.length) return fingerTruth(tr.finger, opts);
        if (tr.points && tr.points.length) return smoothTruth(tr.points, opts);
        return [];
    }

    return {
        BAND, FS, WIN, STEP, ROIS, ROI_NAMES, METHODS, METHOD_NAMES, MOTION_HIGH, PATHS, PATH_NAMES,
        resample, movingMean, fft, bandpass, roiRgb, rgbSeries, green, chrom, pos, peakBpm, windows, motionWindows, analyze,
        fingerTruth, wristTruth, smoothTruth, truthAt, truthSeries, compare, bestLag, table, parseHrMeasurement, choosePath, clockOffset,
        simulate, toCsv, parseCsv, parseJson, mean, std, median, round
    };
});
