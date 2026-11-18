// 탄소 양자점 형광 실험 계산 (브라우저·Node 공용, 화면 없음)
//  - 형광 사진: 측정 영역 R·G·B 평균 → 밝기·색상(hue) → 대표 파장 '추정'
//  - 간이 분광기: 사진 속 스펙트럼 띠를 따라 고른 선 → 화소별 밝기 곡선 → 알려진 선으로 화소→파장 직선 맞춤 → 봉우리 파장·반치폭
//  - 카메라 설정값: 노출 시간·ISO 로 EV₁₀₀·조도(lux) 추정, 시료끼리 비교할 '보정 밝기'
//  - E = hc/λ, 시료 CSV, 조 공유(js/class-share.js)에 넘길 자료
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.QDotMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const HC_EV_NM = 1239.84;          // h·c (eV·nm)
    const GRID0 = 380, GRID1 = 750, GRID_STEP = 2;   // 분광 곡선을 담는 파장 눈금 (nm)
    // 알려진 선 (nm): 형광등(수은) 436·546·611(형광체), 레이저 포인터 532·650
    const KNOWN_LINES = [
        { nm: 404.7, label: '형광등 보라 405' },
        { nm: 435.8, label: '형광등 파랑 436' },
        { nm: 546.1, label: '형광등 초록 546' },
        { nm: 611.6, label: '형광등 빨강 611' },
        { nm: 532, label: '초록 레이저 532' },
        { nm: 650, label: '빨간 레이저 650' }
    ];

    const fin = v => typeof v === 'number' && Number.isFinite(v);
    const round = (v, d) => (fin(v) ? +v.toFixed(d) : null);

    // sRGB 8비트 → 선형 밝기 (0~1)
    const LIN = new Float64Array(256);
    for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    function linear(v8) { return LIN[Math.max(0, Math.min(255, Math.round(v8)))]; }

    /* ---------- 형광 색 ---------- */
    // HSV 색상(0~360)·채도(0~1)
    function rgbToHue(r, g, b) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d > 0) {
            if (mx === r) h = 60 * (((g - b) / d) % 6);
            else if (mx === g) h = 60 * ((b - r) / d + 2);
            else h = 60 * ((r - g) / d + 4);
        }
        if (h < 0) h += 360;
        return { hue: h, sat: mx > 0 ? d / mx : 0 };
    }
    // 색상 → 대략적인 파장 (사람 눈·카메라 색 기준의 '추정'. 무지개 색 순서를 꺾은선으로 이음)
    const HUE_TABLE = [[0, 640], [30, 600], [60, 578], [90, 560], [120, 530], [150, 505], [180, 490], [210, 475], [240, 455], [270, 420]];
    function hueToWavelength(hue) {
        if (!fin(hue)) return null;
        let h = ((hue % 360) + 360) % 360;
        if (h >= 340) h = 0;                 // 거의 빨강
        if (h > 275) return null;            // 자홍·보라빛 분홍: 무지개(한 파장)에 없는 색
        if (h > 270) h = 270;
        for (let i = 1; i < HUE_TABLE.length; i++) {
            const [h0, l0] = HUE_TABLE[i - 1], [h1, l1] = HUE_TABLE[i];
            if (h <= h1) return l0 + (l1 - l0) * (h - h0) / (h1 - h0);
        }
        return 420;
    }
    // 영역 화소들(RGBA 배열) → 평균 색과 밝기
    function regionStats(data) {
        let r = 0, g = 0, b = 0, y = 0, sat = 0, n = 0;
        for (let i = 0; i + 3 < data.length; i += 4) {
            const R = data[i], G = data[i + 1], B = data[i + 2];
            r += R; g += G; b += B;
            y += 0.2126 * LIN[R] + 0.7152 * LIN[G] + 0.0722 * LIN[B];
            if (R >= 250 || G >= 250 || B >= 250) sat++;
            n++;
        }
        if (!n) return null;
        return colorInfo(r / n, g / n, b / n, y / n, sat / n);
    }
    function colorInfo(r, g, b, y, satFrac) {
        if (!fin(y)) y = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
        const hs = rgbToHue(r, g, b);
        return { r: round(r, 2), g: round(g, 2), b: round(b, 2), Y: round(y, 6), hue: round(hs.hue, 1), chroma: round(hs.sat, 3),
            lambda: round(hueToWavelength(hs.hue), 1), clip: round(satFrac || 0, 4) };
    }

    /* ---------- 간이 분광기 ---------- */
    // img: { data, width, height } (ImageData 모양), 선 (x0,y0)→(x1,y1) 화소 좌표, 두께(화소) 만큼 옆으로 평균
    function lineProfile(img, x0, y0, x1, y1, thick) {
        const W = img.width, H = img.height, D = img.data;
        const len = Math.hypot(x1 - x0, y1 - y0);
        const n = Math.max(2, Math.floor(len) + 1);
        const t = Math.max(1, Math.round(thick || 1));
        const ux = (x1 - x0) / Math.max(len, 1e-9), uy = (y1 - y0) / Math.max(len, 1e-9);
        const nx = -uy, ny = ux;
        const I = new Array(n), R = new Array(n), G = new Array(n), B = new Array(n);
        let clip = 0, cnt = 0;
        for (let i = 0; i < n; i++) {
            const px = x0 + (x1 - x0) * i / (n - 1), py = y0 + (y1 - y0) * i / (n - 1);
            let s = 0, sr = 0, sg = 0, sb = 0, k = 0;
            for (let j = 0; j < t; j++) {
                const off = j - (t - 1) / 2;
                const xx = Math.round(px + nx * off), yy = Math.round(py + ny * off);
                if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                const o = (yy * W + xx) * 4, r = D[o], g = D[o + 1], b = D[o + 2];
                s += (LIN[r] + LIN[g] + LIN[b]) / 3; sr += r; sg += g; sb += b; k++;
                if (r >= 250 || g >= 250 || b >= 250) clip++;
                cnt++;
            }
            I[i] = k ? s / k : 0; R[i] = k ? sr / k : 0; G[i] = k ? sg / k : 0; B[i] = k ? sb / k : 0;
        }
        return { y: I, r: R, g: G, b: B, clip: cnt ? clip / cnt : 0 };
    }
    function smooth(y, w) {
        const h = Math.max(0, Math.floor((w || 3) / 2)), out = new Array(y.length);
        for (let i = 0; i < y.length; i++) {
            let s = 0, k = 0;
            for (let j = i - h; j <= i + h; j++) if (j >= 0 && j < y.length) { s += y[j]; k++; }
            out[i] = s / k;
        }
        return out;
    }
    // 포물선 맞춤으로 봉우리 위치를 화소보다 잘게
    function subPixel(y, i) {
        if (i <= 0 || i >= y.length - 1) return i;
        const a = y[i - 1], b = y[i], c = y[i + 1], den = a - 2 * b + c;
        return den < 0 ? i + 0.5 * (a - c) / den : i;
    }
    // 봉우리 찾기: 높이 순서. minRel: (최대−바닥)에 대한 최소 높이, minDist: 봉우리 사이 최소 화소
    function findPeaks(y, opt) {
        const o = opt || {};
        const s = smooth(y, o.smooth || 3);
        let mn = Infinity, mx = -Infinity;
        s.forEach(v => { if (v < mn) mn = v; if (v > mx) mx = v; });
        if (!(mx > mn)) return [];
        const thr = mn + (o.minRel != null ? o.minRel : 0.15) * (mx - mn);
        const dist = Math.max(1, o.minDist || Math.round(y.length / 60));
        const cand = [];
        for (let i = 1; i < s.length - 1; i++) {
            if (s[i] < thr || s[i] < s[i - 1] || s[i] < s[i + 1]) continue;
            if (s[i] === s[i - 1] && i > 1 && s[i - 2] === s[i]) continue;
            cand.push(i);
        }
        cand.sort((a, b) => s[b] - s[a]);
        const out = [];
        for (const i of cand) {
            if (out.some(p => Math.abs(p.i - i) < dist)) continue;
            out.push({ i, px: subPixel(s, i), height: s[i] - mn });
            if (out.length >= (o.max || 8)) break;
        }
        return out;
    }
    // 가장 높은 봉우리의 위치와 반치폭(화소)
    function mainPeak(y) {
        const s = smooth(y, 3);
        let mi = 0, mn = Infinity;
        s.forEach((v, i) => { if (v > s[mi]) mi = i; if (v < mn) mn = v; });
        const top = s[mi];
        if (!(top > mn)) return null;
        const half = mn + (top - mn) / 2;
        let L = mi, Rr = mi;
        while (L > 0 && s[L] > half) L--;
        while (Rr < s.length - 1 && s[Rr] > half) Rr++;
        const xl = s[L] <= half && L < mi ? L + (half - s[L]) / (s[L + 1] - s[L]) : L;
        const xr = s[Rr] <= half && Rr > mi ? Rr - (half - s[Rr]) / (s[Rr - 1] - s[Rr]) : Rr;
        return { px: subPixel(s, mi), fwhmPx: xr - xl, height: top - mn, top, base: mn, edge: L === 0 || Rr === s.length - 1 };
    }

    // 직선 최소제곱 y = a + b x
    function linFit(xs, ys) {
        const pts = [];
        for (let i = 0; i < xs.length; i++) if (fin(xs[i]) && fin(ys[i])) pts.push([xs[i], ys[i]]);
        const n = pts.length;
        if (n < 2) return null;
        let sx = 0, sy = 0;
        pts.forEach(p => { sx += p[0]; sy += p[1]; });
        const mx = sx / n, my = sy / n;
        let sxx = 0, sxy = 0, syy = 0;
        pts.forEach(p => { sxx += (p[0] - mx) ** 2; sxy += (p[0] - mx) * (p[1] - my); syy += (p[1] - my) ** 2; });
        if (!(sxx > 0)) return null;
        const b = sxy / sxx, a = my - b * mx;
        let sse = 0;
        pts.forEach(p => { sse += (p[1] - a - b * p[0]) ** 2; });
        return { a, b, n, r2: syy > 0 ? 1 - sse / syy : 1, rmse: Math.sqrt(sse / n) };
    }
    // 분광기 맞춤: pairs [{ px, nm }] (알려진 선 2개 이상) → nm = a + b·px
    function fitCalibration(pairs) {
        const ok = (pairs || []).filter(p => p && fin(p.px) && fin(p.nm));
        const f = linFit(ok.map(p => p.px), ok.map(p => p.nm));
        if (!f || !fin(f.b) || f.b === 0) return null;
        return { a: f.a, b: f.b, n: f.n, r2: f.r2, rmse: f.rmse };
    }
    const pxToNm = (cal, px) => (cal && fin(px) ? cal.a + cal.b * px : null);
    const nmToPx = (cal, nm) => (cal && cal.b ? (nm - cal.a) / cal.b : null);

    // 형광등 사진에서 자동으로 짝짓기: 높은 봉우리 3개를 위치 순으로 436·546·611 (빨간 쪽이 앞이면 거꾸로)
    function suggestLamp(profile, peaks) {
        const top = (peaks || []).slice(0, 3).sort((a, b) => a.px - b.px);
        if (top.length < 2) return [];
        const warm = i => { const k = Math.round(i); return (profile.r[k] || 0) - (profile.b[k] || 0); };
        const reversed = warm(top[0].px) > warm(top[top.length - 1].px);
        const lines = top.length === 3 ? [435.8, 546.1, 611.6] : [435.8, 546.1];
        if (reversed) lines.reverse();
        return top.map((p, i) => ({ px: p.px, nm: lines[i] }));
    }

    // 시료 스펙트럼 분석: 봉우리 파장·반치폭·파장 눈금 위 곡선(최대 1)
    function analyzeSpectrum(profile, cal) {
        const pk = mainPeak(profile.y);
        if (!pk) return null;
        const out = { peakPx: round(pk.px, 2), fwhmPx: round(pk.fwhmPx, 2), edge: pk.edge, clip: round(profile.clip || 0, 4) };
        if (cal) {
            out.peakNm = round(pxToNm(cal, pk.px), 1);
            out.fwhmNm = round(Math.abs(cal.b) * pk.fwhmPx, 1);
            out.grid = toGrid(profile.y, cal);
        }
        return out;
    }
    function toGrid(y, cal) {
        const s = smooth(y, 3), vals = [];
        let mn = Infinity;
        s.forEach(v => { if (v < mn) mn = v; });
        for (let nm = GRID0; nm <= GRID1; nm += GRID_STEP) {
            const px = nmToPx(cal, nm);
            if (!fin(px) || px < 0 || px > s.length - 1) { vals.push(null); continue; }
            const i = Math.floor(px), f = px - i;
            vals.push((i + 1 < s.length ? s[i] * (1 - f) + s[i + 1] * f : s[i]) - mn);
        }
        const mx = Math.max(0, ...vals.filter(fin));
        return vals.map(v => (fin(v) && mx > 0 ? round(v / mx, 3) : null));
    }
    const gridNm = i => GRID0 + i * GRID_STEP;

    /* ---------- 카메라 설정값 ---------- */
    // exposureTime 은 브라우저 값(100 µs 단위, MediaTrackSettings) → ms
    const exposureMs = et => (fin(Number(et)) && Number(et) > 0 ? Number(et) / 10 : null);
    // EV₁₀₀ = log₂(N²/t) − log₂(ISO/100), t 초
    function ev100(tSec, iso, N) {
        if (!(tSec > 0) || !(iso > 0) || !(N > 0)) return null;
        return Math.log2(N * N / tSec) - Math.log2(iso / 100);
    }
    const luxFromEv = ev => (fin(ev) ? 2.5 * Math.pow(2, ev) : null);
    // 보정 밝기: 선형 밝기 ÷ (노출 시간(초) × ISO/100) → '1초·ISO 100 으로 찍었다면'의 밝기. 노출 값이 없으면 null
    function correctedBrightness(Y, tSec, iso) {
        if (!fin(Y) || !(tSec > 0) || !(iso > 0)) return null;
        return Y / (tSec * iso / 100);
    }
    function cameraInfo(settings, N) {
        const s = settings || {};
        const ms = exposureMs(s.exposureTime), iso = fin(Number(s.iso)) && Number(s.iso) > 0 ? Number(s.iso) : null;
        const ct = fin(Number(s.colorTemperature)) && Number(s.colorTemperature) > 0 ? Number(s.colorTemperature) : null;
        const ev = ms && iso ? ev100(ms / 1000, iso, N || 1.8) : null;
        return { exposureMs: round(ms, 3), iso: round(iso, 0), colorTemp: round(ct, 0), N: N || 1.8, ev: round(ev, 2), lux: round(luxFromEv(ev), 1) };
    }
    const photonEv = nm => (fin(nm) && nm > 0 ? HC_EV_NM / nm : null);

    /* ---------- 시료 ---------- */
    // 요소/구연산 질량비
    function ratioOf(s) { return s && s.citric > 0 && fin(s.urea) ? s.urea / s.citric : null; }
    function ratioLabel(s) {
        if (!s || !(s.citric > 0) || !fin(s.urea)) return '';
        const k = s.urea / s.citric;
        return '1:' + (Math.abs(k - Math.round(k)) < 1e-9 ? Math.round(k) : +k.toFixed(2));
    }
    // 시료 한 개의 '대표' 값 (그래프·표에서 같이 씀)
    function metrics(s) {
        const cam = s.cam || {};
        const Y = s.photo ? s.photo.Y : null;
        const corr = correctedBrightness(Y, cam.exposureMs / 1000, cam.iso);
        const peak = s.spec && fin(s.spec.peakNm) ? s.spec.peakNm : null;
        const lam = peak != null ? peak : s.photo ? s.photo.lambda : null;
        return {
            heat: fin(s.heatS) ? s.heatS : null, ratio: ratioOf(s), peak, hueNm: s.photo ? s.photo.lambda : null,
            lambda: lam, lambdaFrom: peak != null ? 'spec' : lam != null ? 'hue' : '', energy: round(photonEv(lam), 3),
            fwhm: s.spec ? s.spec.fwhmNm : null, Y, corr: round(corr, 5), ev: cam.ev, lux: cam.lux
        };
    }
    function sampleTitle(s) {
        const bits = ['시료 ' + s.no];
        if (fin(s.heatS)) bits.push(s.heatS + '초');
        const r = ratioLabel(s); if (r) bits.push(r);
        return bits.join(' · ');
    }
    // 서버 요약 이름 규칙(1~30자, '|' 없음)
    function summaryOf(s) {
        const m = metrics(s), o = {};
        if (m.heat != null) o['가열(s)'] = m.heat;
        if (m.ratio != null) o['요소/구연산'] = round(m.ratio, 3);
        if (m.peak != null) o['봉우리(nm)'] = m.peak; else if (m.hueNm != null) o['색 추정(nm)'] = m.hueNm;
        if (m.corr != null) o['보정 밝기'] = round(m.corr, 4);
        if (m.energy != null) o['E(eV)'] = m.energy;
        return o;
    }
    // 보낼 것: 시료 하나 = 한 줄 (사진·영상은 없음, 숫자만)
    function buildItems(samples) {
        return (samples || []).map(s => ({
            id: 's' + s.no, title: sampleTitle(s), n: (s.photo ? 1 : 0) + (s.spec ? 1 : 0) || 1, at: s.at,
            summary: summaryOf(s), data: Object.assign({ v: 1 }, cleanSample(s))
        }));
    }
    const str = (v, n) => String(v == null ? '' : v).slice(0, n);
    const numOr = v => (v === '' || v == null ? null : fin(Number(v)) ? Number(v) : null);
    // 받은 자료·CSV 줄 → 형식이 맞는 시료 (모르는 칸은 버림)
    function cleanSample(d) {
        if (!d || typeof d !== 'object') return null;
        const s = {
            no: Math.max(1, Math.round(numOr(d.no) || 1)), at: str(d.at, 40), heatS: numOr(d.heatS),
            citric: numOr(d.citric), urea: numOr(d.urea), water: numOr(d.water), dilution: str(d.dilution, 20),
            light: str(d.light, 20), memo: str(d.memo, 80)
        };
        if (d.photo && typeof d.photo === 'object') {
            const p = d.photo;
            s.photo = colorInfo(numOr(p.r) || 0, numOr(p.g) || 0, numOr(p.b) || 0, numOr(p.Y), numOr(p.clip) || 0);
        }
        if (d.spec && typeof d.spec === 'object') {
            const p = d.spec;
            s.spec = { peakNm: numOr(p.peakNm), fwhmNm: numOr(p.fwhmNm), peakPx: numOr(p.peakPx), fwhmPx: numOr(p.fwhmPx), clip: numOr(p.clip) || 0, edge: !!p.edge };
            if (Array.isArray(p.grid)) s.spec.grid = p.grid.slice(0, gridLen()).map(v => (v == null || !fin(Number(v)) ? null : round(Number(v), 3)));
            if (p.cal && fin(Number(p.cal.a)) && fin(Number(p.cal.b))) s.spec.cal = { a: Number(p.cal.a), b: Number(p.cal.b), n: numOr(p.cal.n), r2: numOr(p.cal.r2) };
        }
        const c = d.cam && typeof d.cam === 'object' ? d.cam : {};
        s.cam = { exposureMs: numOr(c.exposureMs), iso: numOr(c.iso), colorTemp: numOr(c.colorTemp), N: numOr(c.N) || 1.8, locked: c.locked === true ? true : c.locked === false ? false : null };
        const ev = s.cam.exposureMs && s.cam.iso ? ev100(s.cam.exposureMs / 1000, s.cam.iso, s.cam.N) : null;
        s.cam.ev = round(ev, 2); s.cam.lux = round(luxFromEv(ev), 1);
        return s;
    }
    const gridLen = () => Math.floor((GRID1 - GRID0) / GRID_STEP) + 1;

    /* 받은 것: 기기별·시료별로 따로 (ClassShare onIncoming). { ext, changed } */
    function applyIncoming(oldExt, items) {
        const ext = {};
        (items || []).forEach(it => {
            if (!it || !it.device) return;
            const s = cleanSample(it.data);
            if (!s) return;
            const d = ext[it.device] || (ext[it.device] = { from: String(it.from || ''), samples: {} });
            d.samples[String(it.id)] = s;
        });
        return { ext, changed: JSON.stringify(ext) !== JSON.stringify(oldExt || {}) };
    }
    // 모든 시료를 한 목록으로: 내 것 + 불러온 것(기기·시료 번호 순). 각 줄에 source 이름
    function allSamples(mine, ext, mineLabel) {
        const out = (mine || []).map(s => Object.assign({}, s, { source: mineLabel || '이 기기', ext: false }));
        Object.keys(ext || {}).sort().forEach(dev => {
            const d = ext[dev];
            Object.keys(d.samples).sort((a, b) => d.samples[a].no - d.samples[b].no || (a < b ? -1 : 1))
                .forEach(id => out.push(Object.assign({}, d.samples[id], { source: d.from, ext: true, key: dev + '/' + id })));
        });
        return out;
    }

    /* ---------- CSV ---------- */
    const COLS = ['source', 'no', 'at', 'heat_s', 'citric_g', 'urea_g', 'urea_per_citric', 'water_mL', 'dilution', 'light', 'memo',
        'R', 'G', 'B', 'Y', 'hue', 'lambda_hue_nm', 'peak_nm', 'fwhm_nm', 'E_eV', 'exposure_ms', 'iso', 'color_temp_K', 'locked',
        'aperture_N', 'EV100', 'lux', 'corrected', 'cal_a', 'cal_b', 'spectrum_380_750_step2'];
    const q = v => { const t = v == null ? '' : String(v); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    function toCsv(samples) {
        const lines = ['# 탄소 양자점 형광 실험 (센서 기반 실험실) · 시료 한 줄 · 사진·영상 없음', COLS.join(',')];
        (samples || []).forEach(s => {
            const m = metrics(s), p = s.photo || {}, sp = s.spec || {}, c = s.cam || {};
            const row = [s.source || '', s.no, s.at, s.heatS, s.citric, s.urea, round(m.ratio, 4), s.water, s.dilution, s.light, s.memo,
                p.r, p.g, p.b, p.Y, p.hue, p.lambda, sp.peakNm, sp.fwhmNm, m.energy, c.exposureMs, c.iso, c.colorTemp,
                c.locked == null ? '' : c.locked ? 1 : 0, c.N, c.ev, c.lux, m.corr, sp.cal ? round(sp.cal.a, 5) : '', sp.cal ? round(sp.cal.b, 6) : '',
                sp.grid ? sp.grid.map(v => (v == null ? '' : v)).join(';') : ''];
            lines.push(row.map(v => q(v == null ? '' : v)).join(','));
        });
        return lines.join('\n') + '\n';
    }
    function splitCsvLine(line) {
        const out = [];
        let cur = '', inq = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inq) {
                if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inq = false; else cur += ch;
            } else if (ch === '"') inq = true;
            else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
        }
        out.push(cur);
        return out;
    }
    function parseCsv(text) {
        const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
        if (!lines.length) return { error: '빈 파일입니다.', samples: [] };
        const head = splitCsvLine(lines[0]).map(h => h.trim());
        const at = k => head.indexOf(k);
        if (at('no') < 0 || at('heat_s') < 0) return { error: '이 실험의 CSV 가 아닙니다 (no·heat_s 열이 없음).', samples: [] };
        const samples = [];
        lines.slice(1).forEach(l => {
            const c = splitCsvLine(l), g = k => (at(k) >= 0 ? c[at(k)] : '');
            const n = k => numOr(g(k));
            const d = { no: n('no'), at: g('at'), heatS: n('heat_s'), citric: n('citric_g'), urea: n('urea_g'), water: n('water_mL'),
                dilution: g('dilution'), light: g('light'), memo: g('memo'),
                cam: { exposureMs: n('exposure_ms'), iso: n('iso'), colorTemp: n('color_temp_K'), N: n('aperture_N'), locked: g('locked') === '1' ? true : g('locked') === '0' ? false : null } };
            if (g('R') !== '') d.photo = { r: n('R'), g: n('G'), b: n('B'), Y: n('Y'), clip: 0 };
            if (g('peak_nm') !== '' || g('spectrum_380_750_step2') !== '') {
                d.spec = { peakNm: n('peak_nm'), fwhmNm: n('fwhm_nm') };
                const sp = g('spectrum_380_750_step2');
                if (sp) d.spec.grid = sp.split(';').map(v => (v === '' ? null : Number(v)));
                if (g('cal_a') !== '' && g('cal_b') !== '') d.spec.cal = { a: n('cal_a'), b: n('cal_b') };
            }
            const s = cleanSample(d);
            if (s) samples.push(s);
        });
        if (!samples.length) return { error: '시료 줄이 없습니다.', samples: [] };
        return { samples };
    }

    return {
        HC_EV_NM, KNOWN_LINES, GRID0, GRID1, GRID_STEP, gridNm, gridLen,
        linear, rgbToHue, hueToWavelength, regionStats, colorInfo,
        lineProfile, smooth, findPeaks, mainPeak, linFit, fitCalibration, pxToNm, nmToPx, suggestLamp, analyzeSpectrum, toGrid,
        exposureMs, ev100, luxFromEv, correctedBrightness, cameraInfo, photonEv,
        ratioOf, ratioLabel, metrics, sampleTitle, summaryOf, buildItems, cleanSample, applyIncoming, allSamples,
        toCsv, parseCsv
    };
});
