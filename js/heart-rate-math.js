// 스마트폰 카메라 심박수: 계산 (브라우저·Node 공용, 화면 없음). 시험 tests/heart-rate-math.test.cjs
//  손가락으로 덮은 카메라의 밝기(빨강 R·초록 G·밝기 Y)가 심장이 뛸 때마다 조금 어두워졌다 밝아지는 것(광용적맥파, PPG)으로 심박수를 구한다.
//  1) 고르지 않은 시각 → 고른 간격(30 Hz)으로 보간  2) 느린 흐름 빼기(2초 이동평균)  3) 0.6~3.5 Hz(분당 36~210회)만 남기기(FFT)
//  4) 세 가지로 주기 찾기: 주파수 분석(FFT) 최대 · 자기상관 · 봉우리 간격(최소 간격 = 0.6 × 주기, 중복맥파 작은 봉우리 중복 세기 막기)
//  5) 셋이 맞으면 신뢰도 높음. 노출 값(exposureTime·ISO)이 심박 범위에서 출렁이면 경고 (자동 노출이 만든 가짜 맥박일 수 있음)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.HeartRateMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const BAND = [0.6, 3.5];          // Hz (분당 36~210회). 0.7 Hz 로 자르면 분당 40회가 잘린다
    const FS = 30;                    // 보간 간격 (Hz)

    const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
    const median = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
    const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
    const round = (x, d) => Number.isFinite(x) ? +x.toFixed(d) : null;

    // ---------- 1) 고른 간격으로 보간 ----------
    // t: 초 (오름차순이 아니어도 정렬), y: 값 → { t0, fs, y: [] }
    function resample(t, y, fs) {
        fs = fs || FS;
        const idx = t.map((_, i) => i).filter(i => Number.isFinite(t[i]) && Number.isFinite(y[i])).sort((a, b) => t[a] - t[b]);
        const tt = [], yy = [];
        idx.forEach(i => { if (!tt.length || t[i] > tt[tt.length - 1]) { tt.push(t[i]); yy.push(y[i]); } });
        if (tt.length < 2) return { t0: tt[0] || 0, fs, y: yy.slice() };
        const n = Math.floor((tt[tt.length - 1] - tt[0]) * fs) + 1, out = new Array(n);
        let j = 0;
        for (let k = 0; k < n; k++) {
            const tk = tt[0] + k / fs;
            while (j < tt.length - 2 && tt[j + 1] < tk) j++;
            const a = tt[j], b = tt[j + 1], f = b > a ? (tk - a) / (b - a) : 0;
            out[k] = yy[j] + (yy[j + 1] - yy[j]) * Math.min(1, Math.max(0, f));
        }
        return { t0: tt[0], fs, y: out };
    }

    // ---------- 2) 느린 흐름 빼기 (이동평균) ----------
    function detrend(y, win) {
        const n = y.length, h = Math.max(1, Math.round(win / 2)), out = new Array(n), cs = [0];
        for (let i = 0; i < n; i++) cs.push(cs[i] + y[i]);
        for (let i = 0; i < n; i++) {
            const a = Math.max(0, i - h), b = Math.min(n, i + h + 1);
            out[i] = y[i] - (cs[b] - cs[a]) / (b - a);
        }
        return out;
    }

    // ---------- FFT (2의 거듭제곱 길이, 제자리) ----------
    function fft(re, im, inverse) {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
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

    // ---------- 3) 대역 거르기: band 안은 그대로, 바깥 0.1 Hz 는 부드럽게 줄임 (안쪽은 깎지 않음) ----------
    function bandpass(y, fs, band) {
        band = band || BAND;
        const n = y.length, N = pow2(n * 2), m = mean(y);
        const re = new Array(N).fill(0), im = new Array(N).fill(0);
        // 앞뒤를 거울처럼 이어 붙여 끝에서 튀는 것을 줄임
        for (let i = 0; i < N; i++) {
            const k = i % (2 * n), v = k < n ? y[k] : y[2 * n - 1 - k];
            re[i] = (v === undefined ? m : v) - m;
        }
        fft(re, im, false);
        const edge = 0.1;
        for (let k = 0; k < N; k++) {
            const f = Math.min(k, N - k) * fs / N;
            let g = 1;
            if (f < band[0]) g = f < band[0] - edge ? 0 : 0.5 - 0.5 * Math.cos(Math.PI * (f - band[0] + edge) / edge);
            else if (f > band[1]) g = f > band[1] + edge ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (f - band[1]) / edge);
            re[k] *= g; im[k] *= g;
        }
        fft(re, im, true);
        return re.slice(0, n);
    }

    // ---------- 주파수 분석: band 안 최대 (포물선 보간) ----------
    function spectrum(y, fs, band) {
        band = band || BAND;
        const n = y.length, N = pow2(Math.max(n * 8, 1024)), re = new Array(N).fill(0), im = new Array(N).fill(0), m = mean(y);
        for (let i = 0; i < n; i++) re[i] = (y[i] - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Math.max(1, n - 1)));
        fft(re, im, false);
        const f = [], p = [];
        for (let k = 1; k < N / 2; k++) { const fk = k * fs / N; if (fk > 5) break; f.push(fk); p.push(re[k] * re[k] + im[k] * im[k]); }
        let best = -1;
        for (let i = 1; i < f.length - 1; i++) if (f[i] >= band[0] && f[i] <= band[1] && p[i] >= p[i - 1] && p[i] >= p[i + 1] && (best < 0 || p[i] > p[best])) best = i;
        if (best < 0) return { f, p, peak: NaN, ratio: 0 };
        const a = p[best - 1], b = p[best], c = p[best + 1], d = (a - 2 * b + c) ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
        const peak = f[best] + d * (f[1] - f[0]);
        // 최대 둘레 ±0.12 Hz 의 몫 (뚜렷할수록 1 에 가까움)
        let inPk = 0, tot = 0;
        for (let i = 0; i < f.length; i++) if (f[i] >= band[0] && f[i] <= band[1]) { tot += p[i]; if (Math.abs(f[i] - peak) <= 0.12) inPk += p[i]; }
        return { f, p, peak, ratio: tot ? inPk / tot : 0 };
    }

    // ---------- 자기상관: 36~210 회/분 범위의 주기 ----------
    function autocorr(y, fs, band) {
        band = band || BAND;
        const n = y.length, m = mean(y), z = y.map(v => v - m), e0 = z.reduce((s, v) => s + v * v, 0);
        const lo = Math.max(1, Math.floor(fs / band[1])), hi = Math.min(n - 2, Math.ceil(fs / band[0]));
        if (!e0 || hi <= lo + 1) return { period: NaN, value: 0 };
        const r = [];
        for (let L = 0; L <= hi + 1; L++) { let s = 0; for (let i = 0; i + L < n; i++) s += z[i] * z[i + L]; r.push(s / e0 * n / (n - L)); }
        let best = -1;
        for (let L = lo; L <= hi; L++) if (r[L] >= r[L - 1] && r[L] >= r[L + 1] && (best < 0 || r[L] > r[best])) best = L;
        if (best < 0) return { period: NaN, value: 0 };
        // 더 짧은 주기에 거의 같은 높이(0.85 배 이상)의 봉우리가 있으면 그쪽 (두 박동 = 한 주기로 잘못 보지 않게)
        // 잡음 때문에 2·3 주기 쪽이 조금 더 높게 나올 때가 있어, 주기의 1/2·1/3 근처(±12%)는 0.6 배 이상이면 짧은 쪽으로 본다
        // (중복맥파가 있는 진짜 주기에서는 반 주기의 자기상관이 0 보다 작아 여기에 걸리지 않음)
        const near = L => [2, 3].some(k => Math.abs(L - best / k) <= 0.12 * best / k);
        for (let L = lo; L < best; L++) if (r[L] >= r[L - 1] && r[L] >= r[L + 1] && r[L] > 0 && (r[L] >= 0.85 * r[best] || (near(L) && r[L] >= 0.6 * r[best]))) { best = L; break; }
        const a = r[best - 1], b = r[best], c = r[best + 1], d = (a - 2 * b + c) ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
        return { period: (best + d) / fs, value: Math.max(0, Math.min(1, b)) };
    }

    // 한 지연(L 표본)에서의 자기상관 (−1~1)
    function acAt(y, L) {
        const n = y.length, m = mean(y);
        let s = 0, e = 0;
        for (let i = 0; i < n; i++) { e += (y[i] - m) ** 2; if (i + L < n) s += (y[i] - m) * (y[i + L] - m); }
        return e && L < n ? s / e * n / (n - L) : 0;
    }

    // 스펙트럼에서 주파수 f 둘레(±0.05 Hz) 가장 큰 값
    function powAt(sp, f) {
        let m = 0;
        for (let i = 0; i < sp.f.length; i++) if (Math.abs(sp.f[i] - f) <= 0.05 && sp.p[i] > m) m = sp.p[i];
        return m;
    }

    // ---------- 봉우리: 최소 간격 = 0.6 × 주기, 높은 것부터 고름 ----------
    function findPeaks(y, fs, period) {
        const n = y.length, minGap = Math.max(1, 0.6 * period * fs), sd = std(y), cand = [];
        for (let i = 1; i < n - 1; i++) if (y[i] > y[i - 1] && y[i] >= y[i + 1] && y[i] > 0.15 * sd) cand.push(i);
        cand.sort((a, b) => y[b] - y[a]);
        const kept = [];
        cand.forEach(i => { if (kept.every(k => Math.abs(k - i) >= minGap)) kept.push(i); });
        kept.sort((a, b) => a - b);
        return kept.map(i => {
            const a = y[i - 1], b = y[i], c = y[i + 1], d = (a - 2 * b + c) ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
            return (i + d) / fs;
        });
    }

    // ---------- 신호 품질 (손가락 덮임·포화·움직임) ----------
    // frames: [{ r, g, b?, y, s? }] (s: 빨강이 꽉 찬(255) 화소의 몫 0~1)
    function quality(frames) {
        if (!frames || frames.length < 5) return { level: 'bad', text: '신호를 기다리는 중', covered: false };
        const R = mean(frames.map(f => f.r)), G = mean(frames.map(f => f.g)), Y = frames.map(f => f.y);
        const S = mean(frames.map(f => Number(f.s) || 0));
        const jumps = [];
        for (let i = 1; i < Y.length; i++) jumps.push(Math.abs(Y[i] - Y[i - 1]) / Math.max(1, Y[i - 1]));
        const jump = jumps.length ? Math.max(...jumps) : 0;
        const covered = R > 25 && R > 1.6 * G;
        if (R < 8) return { level: 'bad', text: '너무 어두워요 — 밝은 곳에서 하거나 플래시를 켜세요', covered, R, G, S, jump };
        if (!covered) return { level: 'bad', text: '손가락으로 카메라를 완전히 덮어 주세요', covered, R, G, S, jump };
        if (S > 0.6) return { level: 'fair', text: '너무 밝아 빨강이 꽉 찼어요 — 손가락을 조금 더 세게 누르거나 플래시를 끄세요', covered, R, G, S, jump };
        if (jump > 0.12) return { level: 'fair', text: '움직임이 커요 — 폰과 손가락을 가만히', covered, R, G, S, jump };
        return { level: 'good', text: '좋아요 — 그대로 가만히', covered, R, G, S, jump };
    }

    // ---------- 노출 출렁임 점검 ----------
    // e: 프레임별 노출(exposureTime × iso 등, 없으면 null). fHR: 찾은 심박 주파수(Hz), sig: 거른 맥파(같은 고른 간격)
    function exposureCheck(t, e, fHR, sig, fs) {
        const ok = e.map((v, i) => Number.isFinite(v) && v > 0 ? i : -1).filter(i => i >= 0);
        if (ok.length < Math.max(10, 0.5 * e.length)) return { available: false, warn: false, text: '노출 값을 읽을 수 없어요 (이 폰·브라우저가 알려 주지 않음)' };
        const tt = ok.map(i => t[i]), ee = ok.map(i => Math.log(e[i]));
        const rs = resample(tt, ee, fs);
        const ev = ok.map(i => e[i]), m = mean(ev), varPct = (Math.max(...ev) - Math.min(...ev)) / m * 100;
        if (varPct < 1) return { available: true, warn: false, varPct: round(varPct, 2), text: '노출이 바뀌지 않았어요 (좋음)' };
        const filt = bandpass(detrend(rs.y, 2 * fs), fs);
        const sp = spectrum(filt, fs);
        let corr = NaN;
        if (sig && sig.length) {
            const n = Math.min(sig.length, filt.length), a = sig.slice(0, n), b = filt.slice(0, n), ma = mean(a), mb = mean(b);
            let sab = 0, saa = 0, sbb = 0;
            for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
            corr = saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN;
        }
        const fE = sp.peak, same = Number.isFinite(fE) && Number.isFinite(fHR) && Math.abs(fE - fHR) < 0.08;
        const strong = sp.ratio > 0.25;
        const warn = (same && strong) || Math.abs(corr) > 0.3;
        const bpmE = Number.isFinite(fE) ? Math.round(fE * 60) : null;
        return {
            available: true, warn, varPct: round(varPct, 1), bpm: bpmE, corr: round(corr, 2), same,
            text: warn ? `⚠ 노출이 분당 약 ${bpmE}회로 출렁였어요 (변화 ${round(varPct, 0)}%${Number.isFinite(corr) ? ', 맥파와 상관 ' + round(corr, 2) : ''}). 찾은 심박수가 자동 노출이 만든 가짜일 수 있어요.`
                : `노출이 ${round(varPct, 0)}% 바뀌었지만 심박과 같은 빠르기로 출렁이지는 않았어요`
        };
    }

    // ---------- 채널 신호: 밝기 I → -ln(I) (피가 많을수록 어두워지므로 뒤집어 봉우리 = 수축기) ----------
    function channelSeries(frames, ch) {
        return frames.map(f => -Math.log(Math.max(0.5, Number(f[ch]))));
    }

    // ---------- 노출 보정 (노출을 고정하지 못했을 때) ----------
    // 화면 밝기(0~255)는 감마가 걸린 값(sRGB)이라 먼저 빛의 세기에 비례하는 값(선형)으로 바꾼 뒤 노출(exposureTime × iso)로 나눈다.
    //  보정 밝기 = 선형 밝기 × (기준 노출 ÷ 이 프레임 노출) × 255   (기준 = 노출 값의 중앙값, 크기를 0~255 근처로 맞추려고)
    //  phyphox 의 Luminance(노출 보정 밝기)와 같은 생각
    const toLinear = v => { const c = Math.min(1, Math.max(0, v / 255)); return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const toSrgb = l => { const c = Math.min(1, Math.max(0, l)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); };
    function exposureShare(frames) {
        const fr = frames || [];
        return fr.length ? fr.filter(f => Number.isFinite(Number(f.e)) && Number(f.e) > 0).length / fr.length : 0;
    }
    function correctExposure(frames) {
        const es = frames.map(f => Number(f.e)).filter(e => Number.isFinite(e) && e > 0);
        if (!es.length) return null;
        const ref = median(es);
        return frames.map(f => {
            const e = Number(f.e), k = Number.isFinite(e) && e > 0 ? ref / e : 1;
            return Object.assign({}, f, { r: 255 * toLinear(f.r) * k, g: 255 * toLinear(f.g) * k, y: 255 * toLinear(f.y) * k });
        });
    }
    // 노출 값이 측정 동안 바뀌었는지 (최대−최소)/평균 %
    function exposureVariation(frames) {
        const es = (frames || []).map(f => Number(f.e)).filter(e => Number.isFinite(e) && e > 0);
        return es.length ? (Math.max(...es) - Math.min(...es)) / mean(es) * 100 : null;
    }
    // 어떻게 계산할지: lock 'locked'(잠금 확인됨) 이면서 실제로 노출이 1% 넘게 바뀌지 않았으면 그대로,
    //  아니면 노출 값을 프레임마다 읽었을 때(절반 이상) 노출 보정, 못 읽었으면 보정 불가(원래 밝기 + 경고)
    function exposureMode(lock, frames) {
        const share = exposureShare(frames), v = exposureVariation(frames);
        if (lock === 'locked' && !(v > 1)) return { mode: 'locked', correct: false, text: '🔒 노출 고정됨' };
        if (share >= 0.5) return { mode: 'corrected', correct: true, text: lock === 'locked' ? '⚠ 잠갔지만 노출이 바뀜 → 노출 보정으로 계산' : '⚠ 고정 안 됨 → 노출 보정으로 계산' };
        return { mode: 'nocorrect', correct: false, text: '⚠ 고정 안 됨 · 노출 값을 읽을 수 없어 보정 못 함 (노출 출렁임 가능성)' };
    }

    // ---------- 한 번에 분석 ----------
    // frames: [{ t(초), r, g, y, e?(노출: exposureTime×iso), s? }], opts: { channel: 'auto'|'r'|'g'|'y', fs }
    function analyze(frames, opts) {
        opts = opts || {};
        const fs = opts.fs || FS;
        const fr = (frames || []).filter(f => f && Number.isFinite(f.t));
        const out = { ok: false, n: fr.length, bpm: null, level: 'bad', reasons: [] };
        if (fr.length < 20) { out.reasons.push('자료가 너무 적어요'); return out; }
        const t = fr.map(f => f.t), dur = t[t.length - 1] - t[0];
        out.dur = round(dur, 2);
        out.fpsMean = round((fr.length - 1) / Math.max(1e-6, dur), 1);
        const gaps = []; for (let i = 1; i < t.length; i++) gaps.push(t[i] - t[i - 1]);
        out.gapMax = round(Math.max(...gaps), 3);
        if (dur < 5) { out.reasons.push('5초보다 짧아요'); return out; }
        // 채널 고르기: 셋 다 계산해 주파수 최대가 가장 뚜렷한 것 (포화된 채널은 뺌)
        // opts.correct: 노출 보정한 밝기로 계산 (포화·품질은 원래 밝기로 판단)
        const cor = opts.correct ? correctExposure(fr) : null;
        out.corrected = !!cor;
        const chans = opts.channel && opts.channel !== 'auto' ? [opts.channel] : ['r', 'g', 'y'];
        let best = null;
        chans.forEach(ch => {
            const vals = fr.map(f => Number(f[ch]));
            if (!vals.every(Number.isFinite)) return;
            const satFrac = vals.filter(v => v >= 250).length / vals.length;
            if (chans.length > 1 && satFrac > 0.5) return;
            const rs = resample(t, channelSeries(cor || fr, ch), fs);
            const filt = bandpass(detrend(rs.y, 2 * fs), fs);
            const sp = spectrum(filt, fs);
            const score = sp.ratio * (1 - satFrac);
            if (!best || score > best.score) best = { ch, rs, filt, sp, score };
        });
        if (!best) { out.reasons.push('쓸 수 있는 색 채널이 없어요 (모두 꽉 참)'); return out; }
        const { filt, sp } = best;
        const ac = autocorr(filt, fs);
        const bpmFFT = sp.peak * 60, bpmAC = ac.period > 0 ? 60 / ac.period : NaN;
        // 기본 주파수 f0 정하기: FFT 와 자기상관이 맞으면 그대로.
        //  FFT 가 자기상관의 2·3 배면 둘 중 하나가 틀림 → FFT 주기에서의 자기상관이 0.3 보다 크면 자기상관이 두세 박동을 한 주기로 본 것(잡음),
        //  아니면 FFT 가 중복맥파 때문에 배음을 잡은 것
        let f0 = NaN;
        const fA = 1 / ac.period, fF = sp.peak;
        if (Number.isFinite(fA) && Number.isFinite(fF)) {
            const k = Math.round(fF / fA);
            if (Math.abs(fF - fA) / fA < 0.08) f0 = fA;
            else if ((k === 2 || k === 3) && Math.abs(fF / k - fA) / fA < 0.1) f0 = acAt(filt, Math.round(fs / fF)) > 0.3 || powAt(sp, fA) < 0.25 * powAt(sp, fF) ? fF : fA;
            else f0 = ac.value >= 0.5 ? fA : fF;
        } else f0 = Number.isFinite(fA) ? fA : fF;
        const P = 1 / f0;
        // 봉우리: 기본 주파수의 2.2 배 위를 한 번 더 걸러 잡음 봉우리를 줄이고, 최소 간격 0.6 × 주기
        const smooth = Number.isFinite(P) ? bandpass(filt, fs, [BAND[0], Math.min(BAND[1], Math.max(1.2, 2.2 * f0))]) : filt;
        const peaks = Number.isFinite(P) ? findPeaks(smooth, fs, P) : [];
        const ibi = []; for (let i = 1; i < peaks.length; i++) ibi.push(peaks[i] - peaks[i - 1]);
        const ibiOk = ibi.filter(x => x > 0.6 * P && x < 1.6 * P);
        const bpmPeaks = ibiOk.length >= 2 ? 60 / mean(ibiOk) : NaN;   // 평균 간격 (중앙값은 30 Hz 칸에 걸려 치우침)
        const cv = ibiOk.length >= 2 ? std(ibiOk) / mean(ibiOk) : NaN;
        // 최종: 봉우리 평균 간격이 기준(fRef)과 3% 안에서 맞으면 봉우리(박동 하나하나), 아니면 기준(주파수 분석 또는 자기상관)
        const cands = [bpmPeaks, bpmAC, bpmFFT].filter(Number.isFinite);
        let bpm = NaN, method = '';
        //  기준 fRef: FFT 가 f0 와 8% 안에서 맞으면 FFT(창 전체의 평균 빠르기, 자기상관보다 덜 흔들림), 아니면 f0
        const fRef = Number.isFinite(fF) && Math.abs(fF - f0) / f0 < 0.08 ? fF : f0;
        if (Number.isFinite(bpmPeaks) && Number.isFinite(fRef) && Math.abs(bpmPeaks - fRef * 60) / (fRef * 60) < 0.03) { bpm = bpmPeaks; method = '봉우리 간격'; }
        else if (Number.isFinite(fRef)) { bpm = fRef * 60; method = fRef === fF ? '주파수 분석' : '자기상관'; }
        if (!Number.isFinite(bpm)) { out.reasons.push('주기를 찾지 못했어요'); return out; }
        // FFT 가 심박의 2배(중복맥파 때문에 두 번째 배음)를 잡았으면 맞는 것으로 봄
        const fftAgree = Number.isFinite(bpmFFT) && [1, 2, 3].some(k => Math.abs(bpmFFT / k - bpm) / bpm < 0.08);
        const spread = cands.length > 1 ? (Math.max(...cands) - Math.min(...cands)) / bpm : 0;
        // 신뢰도 0~1: 자기상관 높이 · 주파수 최대 뚜렷함 · 세 방법이 맞는 정도 · 박동 간격 고름
        let conf = 0.35 * ac.value + 0.25 * Math.min(1, sp.ratio * 1.5) + 0.25 * (fftAgree && spread < 0.08 ? 1 : fftAgree ? 0.6 : 0.2) +
            0.15 * (Number.isFinite(cv) ? Math.max(0, 1 - cv / 0.25) : 0);
        conf = Math.max(0, Math.min(1, conf));
        // 품질 (전체를 2초 조각으로)
        const qs = [];
        for (let a = t[0]; a + 2 <= t[t.length - 1] + 1e-9; a += 2) qs.push(quality(fr.filter(f => f.t >= a && f.t < a + 2)).level);
        const badShare = qs.length ? qs.filter(q => q === 'bad').length / qs.length : 1;
        const q = quality(fr);
        const exp = exposureCheck(t, fr.map(f => (f.e == null ? NaN : Number(f.e))), bpm / 60, filt, fs);
        let level = conf >= 0.65 ? 'good' : conf >= 0.45 ? 'fair' : 'bad';
        if (badShare > 0.3 || !q.covered) level = 'bad';
        else if (badShare > 0.1 && level === 'good') level = 'fair';
        // 보정해서 계산했으면 출렁임은 알려 주되 경고로 치지 않음
        exp.wobble = exp.warn;
        if (cor && exp.warn) { exp.warn = false; exp.text = exp.text.replace(/^⚠ /, '').replace(/ 찾은 심박수가.*$/, ' → 노출 보정으로 계산했어요.'); }
        if (exp.warn && level === 'good') level = 'fair';
        if (!q.covered) out.reasons.push('손가락이 카메라를 덮지 않은 것 같아요');
        if (badShare > 0.1) out.reasons.push(`품질 나쁜 구간 ${Math.round(badShare * 100)}%`);
        if (exp.warn) out.reasons.push('노출이 심박 빠르기로 출렁임');
        if (!fftAgree) out.reasons.push('주파수 분석과 다른 값');
        Object.assign(out, {
            ok: true, bpm: round(bpm, 1), method, channel: best.ch, bpmFFT: round(bpmFFT, 1), bpmAC: round(bpmAC, 1), bpmPeaks: round(bpmPeaks, 1),
            acValue: round(ac.value, 3), peakRatio: round(sp.ratio, 3), conf: round(conf, 2), level, cv: round(cv, 3),
            ibi: ibiOk.map(x => Math.round(x * 1000)), peaks: peaks.map(x => round(x, 3)),
            fs, t0: best.rs.t0, wave: smooth, spec: { f: sp.f, p: sp.p }, quality: q, exposure: exp, badShare: round(badShare, 2)
        });
        return out;
    }

    // ---------- 손목 맥박 ----------
    const palpBpm = count15 => Number.isFinite(Number(count15)) && Number(count15) > 0 ? Number(count15) * 4 : null;
    const errorPct = (cam, ref) => Number.isFinite(cam) && Number.isFinite(ref) && ref > 0 ? round((cam - ref) / ref * 100, 1) : null;

    // ---------- 시뮬레이션: 가짜 맥파 + (선택) 가짜 노출 출렁임 ----------
    function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    // opts: { bpm, dur(초), fps, jitter(0~1: 간격이 1/fps 의 몇 배까지 흔들림), noise(밝기 비율), amp(맥파 크기 비율), dicrotic(0~1),
    //         expBpm(노출 출렁임 회/분, 0 이면 없음), expAmp(노출 변화 비율), expFollow(노출이 밝기에 남기는 몫), seed, hrv(박동 간격 흔들림 비율),
    //         physical(true: 선형 빛 × 노출 → 감마, 노출 보정 시험용) }
    function simulate(opts) {
        const o = Object.assign({ bpm: 72, dur: 30, fps: 30, jitter: 0.3, noise: 0.002, amp: 0.02, dicrotic: 0.35, expBpm: 0, expAmp: 0.3, expFollow: 0.15, seed: 1, hrv: 0.03, drift: 0.03 }, opts || {});
        const rand = rng(o.seed), frames = [];
        // 박동 시각 (간격이 조금씩 흔들림)
        const beats = [];
        let tb = -rand() * 60 / o.bpm;
        while (tb < o.dur + 2) { beats.push(tb); tb += 60 / o.bpm * (1 + o.hrv * (rand() * 2 - 1)); }
        const pulse = t => {
            let s = 0;
            for (let k = 0; k < beats.length; k++) {
                const T = (beats[k + 1] || beats[k] + 60 / o.bpm) - beats[k], ph = (t - beats[k]) / T;
                if (ph < -0.5 || ph > 1.5) continue;
                s += Math.exp(-(((ph - 0.15) / 0.09) ** 2)) + o.dicrotic * Math.exp(-(((ph - 0.5) / 0.08) ** 2));
            }
            return s;
        };
        let t = 0;
        const dt = 1 / o.fps;
        while (t <= o.dur) {
            const p = pulse(t);
            const expo = o.expBpm ? 1 + o.expAmp * Math.sin(2 * Math.PI * o.expBpm / 60 * t) : 1;
            const light = (1 + o.drift * Math.sin(2 * Math.PI * t / 23)) * (1 - o.amp * p) * (1 + o.expFollow * (expo - 1)) * (1 + o.noise * (rand() * 2 - 1));
            let r, g, b;
            if (o.physical) {
                // 실제 카메라처럼: 센서에 닿는 빛(선형) × 노출 → 감마(sRGB) 를 걸어 0~255. 자동 노출이 출렁이면 밝기도 그만큼 바뀜
                const L = light / (1 + o.expFollow * (expo - 1)) * expo;
                r = toSrgb(0.45 * L); g = toSrgb(0.012 * L); b = toSrgb(0.006 * L);
            } else { r = Math.min(255, 180 * light); g = Math.min(255, 30 * light); b = 20 * light; }
            const exposureTime = 333 * expo, iso = 800;
            frames.push({ t: round(t, 4), r: round(r, 3), g: round(g, 3), b: round(b, 3), y: round(0.299 * r + 0.587 * g + 0.114 * b, 3), exposureTime: round(exposureTime, 2), iso, e: round(exposureTime * iso, 1), s: r >= 250 ? 1 : 0 });
            t += dt * (1 + o.jitter * (rand() * 2 - 1));
        }
        return frames;
    }

    // ---------- CSV (원본: t, R, G, Y, Y_corr, exposureTime, iso, locked) ----------
    function toCsv(frames, meta) {
        const lines = [];
        Object.keys(meta || {}).forEach(k => { if (meta[k] != null && meta[k] !== '') lines.push('# ' + k + ': ' + String(meta[k]).replace(/[\r\n]/g, ' ')); });
        // Y_corr: 노출 보정 밝기 (선형 밝기 × 기준 노출 ÷ 노출), 노출 값이 없으면 빈칸. locked: 노출 고정 여부(1/0)
        const cor = correctExposure(frames || []) || [];
        const locked = meta && meta.locked != null ? (meta.locked ? 1 : 0) : '';
        lines.push('t_s,R,G,Y,Y_corr,exposureTime,iso,locked');
        (frames || []).forEach((f, i) => lines.push([round(f.t, 4), round(f.r, 3), round(f.g, 3), round(f.y, 3),
            cor[i] && Number(f.e) > 0 ? round(cor[i].y, 4) : '', f.exposureTime == null ? '' : f.exposureTime, f.iso == null ? '' : f.iso, locked].join(',')));
        return lines.join('\n') + '\n';
    }
    // 이 페이지의 CSV 와 phyphox 같은 다른 앱의 CSV(열 이름에 Time·Luma·Shutter·ISO)를 읽음 → { frames, meta, from }
    function parseCsv(text) {
        const raw = String(text || '').replace(/^﻿/, '').split(/\r?\n/), meta = {};
        const rows = [];
        raw.forEach(l => {
            const m = /^#\s*([^:]+):\s*(.*)$/.exec(l);
            if (m) { meta[m[1].trim()] = m[2].trim(); return; }
            if (l.trim()) rows.push(l);
        });
        if (!rows.length) return { frames: [], meta, error: '빈 파일' };
        const sep = rows[0].includes('\t') ? '\t' : (rows[0].split(';').length > rows[0].split(',').length ? ';' : ',');
        const cells = l => l.split(sep).map(s => s.trim().replace(/^"|"$/g, ''));
        const head = cells(rows[0]).map(h => h.toLowerCase());
        const find = (...re) => head.findIndex(h => re.some(r => r.test(h)));
        const iT = find(/^t(_s)?$/, /time/, /시간/), iR = find(/^r$/, /^red/), iG = find(/^g$/, /^green/), iY = find(/^y$/, /^luma/, /luminance/, /밝기/);
        const iE = find(/exposuretime/, /shutter/, /exposure/), iI = find(/^iso/);
        if (iT < 0 || (iY < 0 && iR < 0)) return { frames: [], meta, error: '시각(t)과 밝기(Y 또는 Luma, R) 열을 찾지 못했어요' };
        const num = s => { const x = Number(String(s == null ? '' : s).replace(',', '.')); return Number.isFinite(x) ? x : null; };
        const phyphox = head.some(h => /luma/.test(h)) && iR < 0;
        const frames = [];
        rows.slice(1).forEach(l => {
            const c = cells(l), t = num(c[iT]);
            if (t == null) return;
            let y = iY >= 0 ? num(c[iY]) : null, r = iR >= 0 ? num(c[iR]) : null, g = iG >= 0 ? num(c[iG]) : null;
            // phyphox 의 Luma 는 0~1 이면 0~255 로
            if (y != null && phyphox && y <= 1.5) y *= 255;
            if (y == null && r != null) y = r;
            if (r == null) r = y;
            if (g == null) g = phyphox ? null : y;
            const et = iE >= 0 ? num(c[iE]) : null, iso = iI >= 0 ? num(c[iI]) : null;
            const f = { t, r, g, y, exposureTime: et, iso, e: et != null ? et * (iso || 1) : null };
            frames.push(f);
        });
        return { frames, meta, from: phyphox ? 'phyphox' : 'heart-rate' };
    }

    // 저장 모양 프레임 [t(ms), R, G, Y, exposureTime, iso, s] ↔ 계산 모양 { t(초), r, g, y, exposureTime, iso, e, s }
    function unpack(raw) {
        return (Array.isArray(raw) ? raw : []).filter(a => Array.isArray(a) && Number.isFinite(Number(a[0]))).map(a => {
            const et = a[4] == null || a[4] === '' ? null : Number(a[4]), iso = a[5] == null || a[5] === '' ? null : Number(a[5]);
            return { t: Number(a[0]) / 1000, r: Number(a[1]), g: Number(a[2]), y: Number(a[3]), exposureTime: et, iso,
                e: Number.isFinite(et) && et > 0 ? et * (Number.isFinite(iso) && iso > 0 ? iso : 1) : null, s: Number(a[6]) || 0 };
        });
    }
    function pack(frames) {
        const t0 = frames.length ? frames[0].t : 0;
        return frames.map(f => [Math.round((f.t - t0) * 1000), round(f.r, 2), round(f.g, 2), round(f.y, 2),
            f.exposureTime == null ? null : round(f.exposureTime, 3), f.iso == null ? null : round(f.iso, 0), round(f.s, 2) || 0]);
    }

    return { toLinear, toSrgb, correctExposure, exposureVariation, exposureShare, exposureMode, pack, unpack, BAND, FS, resample, detrend, bandpass, spectrum, autocorr, findPeaks, quality, exposureCheck, analyze, palpBpm, errorPct, simulate, toCsv, parseCsv, fft, mean, median, std, round };
});
