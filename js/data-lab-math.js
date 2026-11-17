// 데이터 가공 실험실: 계산 (브라우저·Node 공용, 화면 없음). 시험 tests/data-lab-math.test.cjs
//  스마트폰 카메라 심박수 원본(손가락으로 덮은 카메라의 빨강·초록·밝기 평균과 노출 값)을
//  단계마다 나눠 다시 계산한다: 0 원천 · 1 수집 · 2 점검·정제 · 3 변환 · 4 걸러 내기 · 5 특징 뽑기 · 6 결과·검증
//  단계마다 '전'과 '후'를 돌려줘 화면이 그래프로 비교하게 하고, 학생이 바꾼 설정(settings)이 아래 단계로 이어진다.
//  기본 설정이면 js/heart-rate-math.js 의 analyzeRun 과 거의 같은 심박수가 나오도록 그 함수들을 그대로 쓴다
//  (heart-rate-math.js 는 고치지 않음 — 이 파일은 단계별로 나눠 '보여 주는' 판).
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./heart-rate-math.js'));
    else root.DataLabMath = factory(root.HeartRateMath);
})(typeof self !== 'undefined' ? self : this, function (H) {
    'use strict';

    const { mean, median, std, round } = H;

    // ---------- 기본 설정 ----------
    // roi: 0단계 평균 낼 영역(가로·세로의 %) — 0단계 설명 그림에만 씀 (원본 CSV 는 이미 평균값이라)
    // view: 1단계 보는 구간 [시작, 끝] 초 (null = 끝까지) — 보기만 바꿈, 계산에는 영향 없음
    // autoCut: 2단계 자동 제안대로 자르기, keep: 손으로 정한 남길 구간 [시작, 끝] 초
    // channel: 'r'|'g'|'y'|'auto', exposure: 'auto'|'on'|'off'
    // trendSec: 4단계 느린 흐름(이동평균) 길이 초 (0 이면 빼지 않음), band: 남길 심박 범위 [최소, 최대] 회/분
    // minGap: 5단계 봉우리 최소 간격 초 (null = 자동: 주파수 분석 주기의 0.6 배), method: 'peaks'|'fft' 최종 값으로 쓸 방법
    function defaults() {
        return { roi: 50, view: [0, null], autoCut: true, keep: [0, null], channel: 'auto', exposure: 'auto', trendSec: 2, band: [36, 210], minGap: null, method: 'peaks' };
    }
    const FS = H.FS;

    // ================= 0 원천: 카메라 한 장 → 평균 3개 =================
    // 실제 카메라 없이 보여 주려고 '손가락으로 덮은 카메라 사진'을 흉내 낸다 (가운데가 밝은 붉은 빛 + 화소마다 잡음)
    //  W×H 화소, 한 화소에 빨강·초록·파랑 3개 숫자
    function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function fakeFrame(W, Hh, pulse, rand) {
        const px = new Float32Array(W * Hh * 3);
        for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
            const dx = (i - W / 2) / (W / 2), dy = (j - Hh / 2) / (Hh / 2), v = Math.max(0, 1 - 0.55 * (dx * dx + dy * dy));
            const k = (j * W + i) * 3, light = v * (1 - 0.03 * pulse);
            px[k] = Math.min(255, Math.max(0, 40 + 190 * light + 14 * (rand() * 2 - 1)));
            px[k + 1] = Math.min(255, Math.max(0, 8 + 30 * light + 6 * (rand() * 2 - 1)));
            px[k + 2] = Math.min(255, Math.max(0, 6 + 18 * light + 5 * (rand() * 2 - 1)));
        }
        return px;
    }
    // roi(%): 가운데 영역의 가로·세로 비율 → 그 안의 평균 { r, g, b, y, n(화소 수) }
    function roiAverage(px, W, Hh, roi) {
        const fw = Math.max(1, Math.round(W * roi / 100)), fh = Math.max(1, Math.round(Hh * roi / 100));
        const i0 = Math.floor((W - fw) / 2), j0 = Math.floor((Hh - fh) / 2);
        let r = 0, g = 0, b = 0;
        for (let j = j0; j < j0 + fh; j++) for (let i = i0; i < i0 + fw; i++) { const k = (j * W + i) * 3; r += px[k]; g += px[k + 1]; b += px[k + 2]; }
        const n = fw * fh;
        r /= n; g /= n; b /= n;
        return { r, g, b, y: 0.299 * r + 0.587 * g + 0.114 * b, n, box: { x: i0, y: j0, w: fw, h: fh } };
    }
    // 0단계 보여 주기: 3초 동안(30장/초) 흉내 사진을 만들어, 영역 크기에 따라 평균 빨강이 얼마나 흔들리는지
    //  돌려줌: { W, H, pixels(실제 폰 사진 화소 수 예), numbers, first(첫 사진 화소), avg: 첫 사진 평균, series: [{t, r}], noise(잡음 크기), pulseAmp(맥파 크기), snr }
    function sourceDemo(roi, opts) {
        opts = opts || {};
        const W = opts.W || 64, Hh = opts.H || 48, fps = 30, dur = opts.dur || 3, bpm = 75, rand = rng(opts.seed || 7);
        const series = [];
        let first = null, avg = null;
        for (let k = 0; k < dur * fps; k++) {
            const t = k / fps, ph = (t * bpm / 60) % 1, pulse = Math.exp(-(((ph - 0.15) / 0.09) ** 2)) + 0.35 * Math.exp(-(((ph - 0.5) / 0.08) ** 2));
            const px = fakeFrame(W, Hh, pulse, rand), a = roiAverage(px, W, Hh, roi);
            if (!first) { first = px; avg = a; }
            series.push({ t: round(t, 3), r: a.r, pulse });
        }
        // 맥파 크기(흉내 낸 진짜 변화)와 잡음(평균에 남은 화소 잡음) 나누기: 평균 빨강 = 기준 + 맥파 + 잡음
        //  맥파 부분은 pulse 에 맞춘 직선으로, 나머지가 잡음
        const xs = series.map(s => s.pulse), ys = series.map(s => s.r), mx = mean(xs), my = mean(ys);
        let sxy = 0, sxx = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
        const slope = sxx ? sxy / sxx : 0, res = ys.map((y, i) => y - my - slope * (xs[i] - mx));
        const noise = std(res), pulseAmp = Math.abs(slope) * (Math.max(...xs) - Math.min(...xs));
        // 실제 폰: 1920×1080 사진 한 장 = 약 207만 화소 × 3색. 이 페이지의 심박 측정은 가운데를 40×30 으로 줄여 평균
        const phone = { w: 1920, h: 1080 };
        return {
            W, H: Hh, roi, first, avg, box: avg.box, series: series.map(s => ({ t: s.t, r: round(s.r, 3) })),
            noise: round(noise, 3), pulseAmp: round(pulseAmp, 3), snr: round(noise > 0 ? pulseAmp / noise : Infinity, 1),
            phonePixels: phone.w * phone.h, phoneNumbers: phone.w * phone.h * 3,
            roiPixelsPhone: Math.round(phone.w * roi / 100) * Math.round(phone.h * roi / 100)
        };
    }

    // ================= 1 수집: 원본 표 =================
    // 시각이 고르지 않음(사진 사이 간격이 조금씩 다름), 초당 장 수
    function collect(frames, view) {
        const fr = frames || [];
        const t0 = fr.length ? fr[0].t : 0;
        const t = fr.map(f => f.t - t0);
        const gaps = []; for (let i = 1; i < t.length; i++) gaps.push({ t: round(t[i], 3), dt: round((t[i] - t[i - 1]) * 1000, 1) });
        const dts = gaps.map(g => g.dt).filter(Number.isFinite);
        const dur = t.length ? t[t.length - 1] : 0;
        const medDt = median(dts);
        const v0 = view && Number.isFinite(view[0]) ? view[0] : 0, v1 = view && Number.isFinite(view[1]) ? view[1] : dur;
        return {
            n: fr.length, dur: round(dur, 2), fps: round(dur > 0 ? (fr.length - 1) / dur : 0, 1),
            dtMed: round(medDt, 1), dtMin: dts.length ? round(Math.min(...dts), 1) : null, dtMax: dts.length ? round(Math.max(...dts), 1) : null,
            irregular: dts.filter(d => Math.abs(d - medDt) > 0.25 * medDt).length,
            view: [round(Math.max(0, v0), 2), round(Math.min(dur, Math.max(v0, v1)), 2)],
            gaps, t0
        };
    }

    // ================= 2 점검·정제 =================
    // 문제 찾기: 빠진 값(숫자가 아님) · 사진이 끊긴 곳(간격이 0.2초 넘음) · 손가락이 떨어진 곳(HeartRateMath.liftCut) · 아주 어두운 구간(빨강 1 아래)
    //  자동 제안: 빠진 값은 빼고, 손가락이 떨어진 뒤는 자름
    function inspect(frames) {
        const fr = frames || [];
        const t0 = fr.length ? fr[0].t : 0, dur = fr.length ? fr[fr.length - 1].t - t0 : 0;
        const problems = [];
        const bad = fr.filter(f => !['r', 'g', 'y'].every(c => Number.isFinite(Number(f[c]))));
        if (bad.length) problems.push({ kind: 'missing', count: bad.length, text: `빠진 값(숫자가 아닌 칸)이 있는 줄 ${bad.length}개 → 빼고 계산`, at: bad.slice(0, 20).map(f => round(f.t - t0, 2)) });
        const ok = fr.filter(f => !bad.includes(f));
        const holes = [];
        for (let i = 1; i < ok.length; i++) if (ok[i].t - ok[i - 1].t > 0.2) holes.push({ from: round(ok[i - 1].t - t0, 2), to: round(ok[i].t - t0, 2) });
        if (holes.length) problems.push({ kind: 'hole', count: holes.length, text: `사진이 0.2초 넘게 끊긴 곳 ${holes.length}군데 (가장 긴 곳 ${Math.max(...holes.map(h => round(h.to - h.from, 2)))}초) → 3단계 보간이 직선으로 메움`, holes });
        const lift = H.liftCut(ok);
        if (lift) problems.push({ kind: 'lift', text: `${round(lift.at - t0, 1)}초쯤 밝기가 갑자기 바뀜(처음 ${lift.base} → ${lift.after}) → 손가락이 떨어진 것 같아 그 뒤를 자르기 제안`, at: round(lift.at - t0, 2) });
        // 아주 어두운 구간: 0.5초마다 빨강 평균이 1 아래인 곳
        const dark = [];
        for (let a = 0; a < dur; a += 0.5) {
            const seg = ok.filter(f => f.t - t0 >= a && f.t - t0 < a + 0.5);
            if (seg.length && mean(seg.map(f => Number(f.r))) < 1) dark.push(round(a, 1));
        }
        if (dark.length) problems.push({ kind: 'dark', count: dark.length, text: `빨강이 1 아래로 아주 어두운 0.5초 조각 ${dark.length}개 — 맥파가 잡음에 묻힐 수 있음`, at: dark });
        const R = ok.length ? mean(ok.map(f => Number(f.r))) : NaN;
        if (Number.isFinite(R) && R < 20 && !dark.length) problems.push({ kind: 'dim', text: `전체가 어두운 편(빨강 평균 ${round(R, 1)} / 255) — 밝기 단계가 계단처럼 보일 수 있음` });
        if (!problems.length) problems.push({ kind: 'none', text: '눈에 띄는 문제 없음' });
        const suggest = [0, round(lift ? lift.at - t0 : dur, 2)];
        return { problems, suggest, dur: round(dur, 2), missing: bad.length, t0 };
    }
    // 남길 구간으로 자르고 빠진 값을 뺌 → { kept(원래 프레임 모양), keep: [a, b] }
    function clean(frames, info, settings) {
        const fr = frames || [], t0 = info.t0;
        let a = 0, b = info.dur;
        if (settings.autoCut) { a = info.suggest[0]; b = info.suggest[1]; }
        else {
            const k = settings.keep || [];
            if (Number.isFinite(k[0])) a = Math.max(0, k[0]);
            if (Number.isFinite(k[1])) b = Math.min(info.dur, k[1]);
        }
        if (b < a) b = a;
        const kept = fr.filter(f => f.t - t0 >= a - 1e-9 && f.t - t0 <= b + 1e-9 && ['r', 'g', 'y'].every(c => Number.isFinite(Number(f[c]))));
        return { kept, keep: [round(a, 2), round(b, 2)], removed: fr.length - kept.length };
    }

    // ================= 3 변환 =================
    // 고른 간격(30 Hz)으로 맞추기(보간) · 채널 고르기 · 노출 보정
    //  신호 = −ln(밝기): 피가 많을수록 어두워지므로 뒤집어 봉우리 = 심장이 뛴 때
    const series = (frames, ch) => frames.map(f => -Math.log(Math.max(1e-3, Number(f[ch]))));
    // 자동 채널: heart-rate-math 와 같은 규칙 — 가장 밝은 채널의 0.2 배보다 어둡거나 밝기 단계가 4가지도 안 되는 채널은 빼고,
    //  주파수 분석의 봉우리가 가장 뚜렷한 채널
    function autoChannel(src, t) {
        const chans = ['r', 'g', 'y'], m = {};
        chans.forEach(ch => { m[ch] = mean(src.map(f => Number(f[ch]))); });
        const mx = Math.max(...chans.map(c => m[c]));
        const scores = {};
        const pick = strict => {
            let best = null;
            chans.forEach(ch => {
                const vals = src.map(f => Number(f[ch]));
                const sat = vals.filter(v => v >= 250).length / vals.length;
                if (sat > 0.5) { scores[ch] = { skip: '꽉 참(255)' }; return; }
                const levels = new Set(vals.map(v => Math.round(v * 100))).size;
                if (strict && (m[ch] < 0.2 * mx || levels < 4)) { scores[ch] = { skip: '너무 어두움' }; return; }
                const rs = H.resample(t, series(src, ch), FS), filt = H.bandpass(H.detrend(rs.y, 2 * FS), FS);
                if (!(std(filt) > 1e-6)) { scores[ch] = { skip: '평평함' }; return; }
                const sp = H.spectrum(filt, FS), score = sp.ratio * (1 - sat);
                scores[ch] = { score: round(score, 3) };
                if (!best || score > best.score) best = { ch, score };
            });
            return best;
        };
        const best = pick(true) || pick(false);
        return { ch: best ? best.ch : 'r', scores, means: { r: round(m.r, 2), g: round(m.g, 2), y: round(m.y, 2) } };
    }
    function transform(kept, settings, lock) {
        const out = { ok: false };
        if (kept.length < 20) { out.error = '남은 자료가 너무 적어요 (2단계에서 남길 구간을 넓혀 보세요)'; return out; }
        const t = kept.map(f => f.t);
        const mode = H.exposureMode(lock === 'locked' || lock === 'csv-locked' ? 'locked' : 'unlocked', kept);
        const share = H.exposureShare(kept);
        let correct = settings.exposure === 'on' ? share > 0 : settings.exposure === 'off' ? false : mode.correct;
        const cor = correct ? H.correctExposure(kept) : null;
        if (correct && !cor) correct = false;
        const src = cor || kept;
        const auto = settings.channel === 'auto' ? autoChannel(src, t) : null;
        const ch = auto ? auto.ch : (['r', 'g', 'y'].includes(settings.channel) ? settings.channel : 'r');
        const rs = H.resample(t, series(src, ch), FS);
        const t0 = kept[0].t;
        return {
            ok: true, ch, auto, corrected: !!cor, lag: cor ? cor.lag : null, mode, expVar: round(H.exposureVariation(kept), 1), expShare: round(share, 2),
            before: kept.map(f => ({ x: round(f.t - t0, 3), y: Number(f[ch]) })),
            after: rs.y.map((v, i) => ({ x: round(rs.t0 - t0 + i / FS, 4), y: v })),
            rs, nBefore: kept.length, nAfter: rs.y.length, t0
        };
    }

    // ================= 4 걸러 내기 =================
    // 느린 흐름(숨쉬기·누르는 힘) 빼기: trendSec 초 이동평균을 뺌 → 심박 범위(band 회/분)만 남기기(주파수 분석으로 거르기)
    function filter(tr, settings) {
        const y = tr.rs.y, n = y.length;
        const win = Math.max(0, Number(settings.trendSec) || 0) * FS;
        const detr = win >= 2 ? H.detrend(y, win) : y.map(v => v - mean(y));
        const trend = y.map((v, i) => v - detr[i]);
        const lo = Math.max(6, Math.min(Number(settings.band[0]) || 36, 300)), hi = Math.max(lo + 6, Math.min(Number(settings.band[1]) || 210, 300));
        const band = [lo / 60, hi / 60];
        const filt = H.bandpass(detr, FS, band);
        const x = i => round(tr.rs.t0 - tr.t0 + i / FS, 4);
        return {
            band, bandBpm: [lo, hi], win: win >= 2 ? round(win / FS, 2) : 0,
            before: y.map((v, i) => ({ x: x(i), y: v })), trend: trend.map((v, i) => ({ x: x(i), y: v })),
            after: filt.map((v, i) => ({ x: x(i), y: v })), filt, n,
            // 거른 신호에 남은 크기 / 거르기 전 흔들림 크기
            keepPct: round(std(filt) / Math.max(1e-12, std(detr)) * 100, 0)
        };
    }

    // ================= 5 특징 뽑기 =================
    // 봉우리 찾기: 이웃보다 높고, 서로 minGap 초보다 가까우면 높은 것만 남김 → 박동 간격
    //  주파수 분석(FFT): 거른 신호에서 가장 센 빠르기
    function findPeaks(y, fs, minGapSec) {
        const n = y.length, minGap = Math.max(1, minGapSec * fs), sd = std(y), cand = [];
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
    function features(fl, tr, settings) {
        const sp = H.spectrum(fl.filt, FS, fl.band);
        const fF = sp.peak, bpmFFT = fF * 60;
        const auto = !(Number(settings.minGap) > 0);
        const minGap = auto ? (Number.isFinite(fF) ? 0.6 / fF : 0.4) : Number(settings.minGap);
        // 봉우리는 '찾은 빠르기의 2.2 배'보다 빠른 잔물결을 한 번 더 걸러 낸 신호에서 찾음 (자동일 때만, heart-rate-math 와 같음)
        const smooth = auto && Number.isFinite(fF) ? H.bandpass(fl.filt, FS, [fl.band[0], Math.min(fl.band[1], Math.max(1.2, 2.2 * fF))]) : fl.filt;
        const pk = findPeaks(smooth, FS, minGap);
        const off = tr.rs.t0 - tr.t0;
        const ibi = []; for (let i = 1; i < pk.length; i++) ibi.push(pk[i] - pk[i - 1]);
        // 튀는 간격 빼기: 간격의 중앙값보다 0.6 배 짧거나 1.6 배 긴 것 (봉우리를 놓쳤거나 잡음을 하나 더 셈)
        const med = median(ibi);
        const ibiOk = ibi.filter(x => x > 0.6 * med && x < 1.6 * med);
        const bpmPeaks = ibiOk.length >= 2 ? 60 / mean(ibiOk) : NaN;
        const cv = ibiOk.length >= 2 ? std(ibiOk) / mean(ibiOk) : NaN;
        const wave = smooth.map((v, i) => ({ x: round(off + i / FS, 4), y: v }));
        const dots = pk.map(p => { const i = Math.min(smooth.length - 1, Math.max(0, Math.round(p * FS))); return { x: round(off + p, 3), y: smooth[i] }; });
        const spec = sp.f.map((f, i) => ({ x: f * 60, y: sp.p[i] })).filter(p => p.x <= 240);
        const pmax = Math.max(...spec.map(p => p.y), 1e-30);
        return {
            minGap: round(minGap, 3), minGapAuto: auto, peaks: pk.map(p => round(off + p, 3)), nPeaks: pk.length,
            ibi: ibi.map(x => Math.round(x * 1000)), ibiOk: ibiOk.map(x => Math.round(x * 1000)), ibiDropped: ibi.length - ibiOk.length,
            bpmPeaks: round(bpmPeaks, 1), bpmFFT: round(bpmFFT, 1), cv: round(cv, 3), peakRatio: round(sp.ratio, 3),
            wave, dots, spec: spec.map(p => ({ x: round(p.x, 2), y: p.y / pmax })), smoothed: smooth !== fl.filt
        };
    }

    // ================= 6 결과·검증 =================
    // wrist: 손목 맥박 15초 센 수 4번 [a, b, c, d] → 평균 × 4 = 회/분
    function wristBpm(counts) {
        const v = (counts || []).map(Number).filter(x => Number.isFinite(x) && x > 0);
        return v.length ? { bpm: round(mean(v) * 4, 1), n: v.length, each: v.map(x => x * 4) } : null;
    }
    function result(ft, settings, wristCounts) {
        const pick = settings.method === 'fft' ? 'fft' : 'peaks';
        let bpm = pick === 'fft' ? ft.bpmFFT : ft.bpmPeaks, used = pick;
        if (!Number.isFinite(bpm)) { bpm = pick === 'fft' ? ft.bpmPeaks : ft.bpmFFT; used = pick === 'fft' ? 'peaks' : 'fft'; }
        const agree = Number.isFinite(ft.bpmPeaks) && Number.isFinite(ft.bpmFFT) ? round(Math.abs(ft.bpmPeaks - ft.bpmFFT) / ft.bpmFFT * 100, 1) : null;
        const w = wristBpm(wristCounts);
        return {
            bpm: Number.isFinite(bpm) ? round(bpm, 1) : null, used, agreePct: agree,
            wrist: w, error: w && Number.isFinite(bpm) ? round(bpm - w.bpm, 1) : null,
            errorPct: w && Number.isFinite(bpm) ? H.errorPct(bpm, w.bpm) : null
        };
    }

    // ================= 한 번에: 모든 단계 =================
    // frames: HeartRateMath.parseCsv 의 frames, settings: defaults() 를 고친 것, opts: { lock, wrist }
    function run(frames, settings, opts) {
        settings = Object.assign(defaults(), settings || {});
        opts = opts || {};
        const fr = (frames || []).filter(f => f && Number.isFinite(f.t)).slice().sort((a, b) => a.t - b.t);
        const out = { settings, s1: collect(fr, settings.view) };
        out.s2 = inspect(fr);
        const cl = clean(fr, out.s2, settings);
        Object.assign(out.s2, { kept: cl.kept, keep: cl.keep, removed: cl.removed });
        out.s3 = transform(cl.kept, settings, opts.lock);
        if (!out.s3.ok) { out.error = out.s3.error; out.final = { bpm: null }; return out; }
        out.s4 = filter(out.s3, settings);
        out.s5 = features(out.s4, out.s3, settings);
        out.s6 = result(out.s5, settings, opts.wrist);
        out.final = out.s6;
        return out;
    }

    // ---------- 예시 묶음 (문제 있는 예시는 HeartRateMath.simulate 로 만든 가짜 자료) ----------
    //  실측 4회차 파일은 사이트의 data/heart-rate/ 에 (tests/fixtures/heart-rate/ 와 같은 파일)
    const EXAMPLES = [
        { id: 'r3', file: 'zflip6-2026-11-17-r3.csv', title: '선생님 실측 1 (30초)', note: '갤럭시 Z 플립6 · 어두운 실내 · 노출 고정 안 됨(값은 그대로)', src: '실측' },
        { id: 'r5', file: 'zflip6-2026-11-17-r5.csv', title: '선생님 실측 2 — 손가락 떨어짐', note: '15초쯤 손가락이 떨어져 밝기가 뜀', src: '실측' },
        { id: 'r6', file: 'zflip6-2026-11-17-r6.csv', title: '선생님 실측 3 (10초)', note: '아주 어두움 · 빨강 평균 2~10', src: '실측' },
        { id: 'r7', file: 'zflip6-2026-11-17-r7.csv', title: '선생님 실측 4 (13초)', note: '아주 어두움 · 앱이 한때 절반(37회)으로 잘못 계산', src: '실측' },
        { id: 'dark', sim: { bpm: 68, dur: 30, amp: 0.004, noise: 0.012, lfNoise: 0.02, seed: 11, dim: 0.06 }, title: '가짜 자료 — 아주 어두움', note: '맥파가 잡음에 묻힘 (분당 68회로 만듦)', src: '시뮬레이션', truth: 68,
          garbage: '어떤 설정으로도 맞지 않는 자료예요. 맥파가 잡음에 묻혀 가공으로는 고칠 수 없으니 다시 재야 해요 (수집 단계가 중요: 밝은 곳·플래시·손가락 꼭 덮기).' },
        { id: 'lift', sim: { bpm: 84, dur: 30, seed: 5, lift: 19, holes: true }, title: '가짜 자료 — 손가락 떨어짐·빈칸', note: '19초에 손가락을 뗌 + 빠진 값·끊긴 곳 (분당 84회로 만듦)', src: '시뮬레이션', truth: 84 },
        { id: 'expo', sim: { bpm: 72, dur: 30, seed: 3, physical: true, expBpm: 42, expAmp: 0.3, expFollow: 1 }, title: '가짜 자료 — 노출 출렁임', note: '자동 노출이 분당 42회로 출렁임 (진짜는 72회로 만듦)', src: '시뮬레이션', truth: 72 }
    ];
    // 예시의 가짜 자료 만들기 (항상 같은 결과가 나오게 seed 고정)
    function makeExample(id) {
        const ex = EXAMPLES.find(e => e.id === id);
        if (!ex || !ex.sim) return null;
        const o = Object.assign({}, ex.sim);
        let fr = H.simulate(o);
        if (o.dim) fr = fr.map(f => Object.assign({}, f, { r: round(f.r * o.dim, 2), g: round(f.g * o.dim, 2), b: round(f.b * o.dim, 2), y: round(f.y * o.dim, 2) }));
        if (o.lift) fr = fr.map(f => f.t >= o.lift ? Object.assign({}, f, { r: Math.min(255, f.r * 1.35 + 60), g: Math.min(255, f.g * 4 + 70), b: Math.min(255, f.b * 4 + 60), y: Math.min(255, f.y * 2.4 + 50) }) : f);
        if (o.holes) {
            // 9.0~9.6초 사진이 끊김, 몇 줄은 빈칸
            fr = fr.filter(f => !(f.t > 9 && f.t < 9.6));
            [40, 41, 150, 300].forEach(i => { if (fr[i]) fr[i] = Object.assign({}, fr[i], { r: NaN, g: NaN, y: NaN }); });
        }
        if (o.physical && o.expBpm) {
            // 노출 출렁임 예시: 폰이 알려 준 노출 값을 그대로 CSV 에 (노출 보정을 켜면 고칠 수 있음)
            fr = fr.map(f => Object.assign({}, f));
        }
        return fr.map(f => Object.assign({}, f, { t: round(f.t, 4) }));
    }

    // ---------- 기록 모음 글 ----------
    // notes: { s0: '…', … }, summary: 단계별 설정 한 줄 (화면이 만듦)
    function notesText(title, rows) {
        const lines = ['데이터 가공 실험실 — 단계별 기록', '자료: ' + title, ''];
        rows.forEach(r => { lines.push(`[${r.step}] ${r.name}`); lines.push('  고른 것: ' + r.setting); lines.push('  이유: ' + (r.note || '(적지 않음)')); });
        return lines.join('\n') + '\n';
    }

    return { defaults, FS, sourceDemo, roiAverage, fakeFrame, collect, inspect, clean, transform, filter, findPeaks, features, wristBpm, result, run, EXAMPLES, makeExample, notesText, autoChannel };
});
