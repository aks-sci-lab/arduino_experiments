// 이상기체 상태 방정식 실험: 감압 용기 속 피코 환경 센서(BME280)의 압력·온도로 보일 법칙과 샤를·게이뤼삭 법칙을 확인하고 보고서를 제출한다.
(function () {
    'use strict';
    const G = window.IdealGasMath;
    const $ = id => document.getElementById(id);
    const STORE_KEY = 'ideal-gas-v1';
    const MAX_GAY = 1500;            // 실험 2 자동 기록 최대 개수 (제출 문서 크기 제한)
    const LIVE_KEEP_MS = 10 * 60 * 1000;
    const STABLE_P = 0.05, STABLE_T = 0.15;   // 10초 동안 이만큼 이하로 변하면 '안정' (kPa, °C)

    const state = {
        tab: 'purpose',
        method: 'boyle',         // 'boyle' (실험 1) | 'gay' (실험 2)
        dir: 'down',             // 실험 1 과정: 'down' (감압) | 'up' (복귀)
        setup: { vMax: '60', vStart: '20', dead: '0', vol: '' },
        boyle: [],               // [{ v (mL), p (kPa), t (°C), dir, src: 'sensor' | 'hand' }]
        gay: [],                 // [{ at (ms), t (°C), p (kPa), src }]
        gInt: '5',               // 실험 2 자동 기록 간격 (초)
        extend: false,           // 결과 그래프를 절대 영도까지 연장
        draft: { v: '', p: '', t: '', gp: '', gt: '' },
        text: { hypo: '', result: '', concl: '', a1: '', a2: '', a3: '', a4: '', a5: '' },
        student: { id: '', name: '', members: '' },
        submitted: ''            // 마지막 제출 시각 (표시용)
    };

    // ---------- 저장 ----------
    // 사생활 보호 모드 등으로 저장할 수 없으면 알림을 띄운다 (실험은 계속 할 수 있음)
    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); $('store-warn').hidden = true; }
        catch (e) { $('store-warn').hidden = false; }
    }
    function load() {
        let d = null;
        try { d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { d = null; }
        if (!d || typeof d !== 'object') return;
        for (const k of ['tab', 'method', 'dir', 'gInt', 'submitted']) if (typeof d[k] === 'string') state[k] = d[k];
        state.extend = !!d.extend;
        for (const k of ['setup', 'draft', 'text', 'student']) Object.assign(state[k], d[k] || {});
        state.boyle = Array.isArray(d.boyle) ? d.boyle : [];
        state.gay = Array.isArray(d.gay) ? d.gay : [];
        if (state.method !== 'gay') state.method = 'boyle';
        if (state.dir !== 'up') state.dir = 'down';
    }

    // ---------- 도우미 ----------
    const num = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : null; };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fx = (v, d) => v == null || !isFinite(v) ? '–' : v.toFixed(d);
    const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    function sci(v, d) {
        if (v == null || !isFinite(v) || v === 0) return fx(v, d);
        const e = Math.floor(Math.log10(Math.abs(v)));
        return (v / Math.pow(10, e)).toFixed(d) + ' × 10' + String(e).split('').map(c => SUP[c]).join('');
    }
    const decimalsFor = span => span < 0.05 ? 4 : span < 0.5 ? 3 : span < 5 ? 2 : span < 50 ? 1 : 0;
    const dirName = d => d === 'up' ? '복귀' : '감압';

    // 장치 값 (숫자)
    function setupNums(s) {
        const v = num(s.vMax), st = num(s.vStart), dead = num(s.dead), vol = num(s.vol);
        return {
            vMax: v > 0 ? v : null, vStart: st > 0 ? st : null,
            dead: dead != null && dead >= 0 ? dead : 0, vol: vol > 0 ? vol : null
        };
    }
    // 실험 2 기록 → 시간(s) 붙인 점
    function gayPoints(list) {
        const t0 = list.length ? list[0].at : 0;
        return list.map(q => ({ s: (q.at - t0) / 1000, t: q.t, p: q.p }));
    }
    function analyses(d) {
        const su = setupNums(d.setup);
        return {
            su,
            ba: G.boyleAnalysis(d.boyle, { dead: su.dead }),
            ga: G.gayLussacAnalysis(d.gayPts, { volume: su.vol })
        };
    }
    const current = () => analyses({ setup: state.setup, boyle: state.boyle, gayPts: gayPoints(state.gay) });

    // ---------- 그래프 (Canvas) ----------
    // o.pts: [{x, y, color, hollow, r}], o.lines: [{pts, color, dash, width, y2}], o.vlines: [{x, color}]
    // o.y2: { min, max, label, color } 오른쪽 눈금 (o.lines 의 y2: true 인 선이 사용)
    function drawChart(cv, o) {
        const dpr = window.devicePixelRatio || 1;
        const W = cv.clientWidth || 600, H = cv.clientHeight || 240;
        cv.width = W * dpr; cv.height = H * dpr;
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        const L = 58, R = o.y2 ? 52 : 12, T = 12, B = 40;
        const { xmin, xmax, ymin, ymax } = o;
        const X = x => L + (x - xmin) / (xmax - xmin) * (W - L - R);
        const Y = y => H - B - (y - ymin) / (ymax - ymin) * (H - T - B);
        const Y2 = o.y2 ? (y => H - B - (y - o.y2.min) / (o.y2.max - o.y2.min) * (H - T - B)) : Y;
        g.font = '12px sans-serif'; g.fillStyle = '#555'; g.strokeStyle = '#e5e5e5'; g.lineWidth = 1;
        const ticks = (a, b) => { const out = []; for (let i = 0; i <= 5; i++) out.push(a + (b - a) * i / 5); return out; };
        const xd = o.xd != null ? o.xd : decimalsFor((xmax - xmin) / 5);
        const yd = o.yd != null ? o.yd : decimalsFor((ymax - ymin) / 5);
        g.textAlign = 'center';
        for (const t of ticks(xmin, xmax)) {
            g.beginPath(); g.moveTo(X(t), T); g.lineTo(X(t), H - B); g.stroke();
            g.fillText(t.toFixed(xd), X(t), H - B + 15);
        }
        g.textAlign = 'right';
        for (const t of ticks(ymin, ymax)) {
            g.beginPath(); g.moveTo(L, Y(t)); g.lineTo(W - R, Y(t)); g.stroke();
            g.fillText(t.toFixed(yd), L - 6, Y(t) + 4);
        }
        if (o.y2) {
            g.textAlign = 'left'; g.fillStyle = o.y2.color;
            const d2 = decimalsFor((o.y2.max - o.y2.min) / 5);
            for (const t of ticks(o.y2.min, o.y2.max)) g.fillText(t.toFixed(d2), W - R + 6, Y2(t) + 4);
            g.save(); g.translate(W - 8, T + (H - T - B) / 2); g.rotate(Math.PI / 2); g.textAlign = 'center'; g.fillText(o.y2.label, 0, 0); g.restore();
        }
        g.strokeStyle = '#999'; g.strokeRect(L, T, W - L - R, H - T - B);
        g.fillStyle = '#333'; g.textAlign = 'center';
        g.fillText(o.xl || '', L + (W - L - R) / 2, H - 6);
        g.save(); g.translate(13, T + (H - T - B) / 2); g.rotate(-Math.PI / 2); g.fillStyle = o.ylColor || '#333'; g.fillText(o.yl || '', 0, 0); g.restore();
        g.save(); g.beginPath(); g.rect(L, T, W - L - R, H - T - B); g.clip();
        for (const v of o.vlines || []) {
            g.setLineDash([4, 4]); g.strokeStyle = v.color || '#999'; g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(X(v.x), T); g.lineTo(X(v.x), H - B); g.stroke(); g.setLineDash([]);
        }
        for (const ln of o.lines || []) {
            const YY = ln.y2 ? Y2 : Y;
            g.setLineDash(ln.dash || []); g.strokeStyle = ln.color; g.lineWidth = ln.width || 2; g.beginPath();
            ln.pts.forEach((p, i) => i ? g.lineTo(X(p.x), YY(p.y)) : g.moveTo(X(p.x), YY(p.y))); g.stroke(); g.setLineDash([]);
        }
        for (const p of o.pts || []) {
            g.beginPath(); g.arc(X(p.x), Y(p.y), p.r || 5, 0, 2 * Math.PI);
            if (p.hollow) { g.strokeStyle = p.color; g.lineWidth = 1.5; g.stroke(); }
            else { g.fillStyle = p.color; g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke(); }
        }
        g.restore();
        if (o.empty) { g.fillStyle = '#999'; g.textAlign = 'center'; g.fillText(o.empty, L + (W - L - R) / 2, T + (H - T - B) / 2); }
    }
    // 값 목록의 범위에 여백을 둔다 (범위가 너무 좁으면 minSpan 으로 넓힘)
    function padRange(vals, minSpan, frac) {
        let lo = Math.min(...vals), hi = Math.max(...vals);
        if (hi - lo < minSpan) { const m = (lo + hi) / 2; lo = m - minSpan / 2; hi = m + minSpan / 2; }
        const pad = (hi - lo) * (frac == null ? 0.08 : frac);
        return [lo - pad, hi + pad];
    }
    // 그래프 함수 (화면과 보고서가 함께 쓴다)
    const DIR_COLOR = { down: '#007bff', up: '#e67e22' };
    function curve(f, a, b, n) { const out = []; for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; out.push({ x, y: f(x) }); } return out; }
    function drawPV(cv, ba, mode) {
        if (!ba) { drawChart(cv, { xmin: 0, xmax: 60, ymin: 0, ymax: 110, xl: 'V (mL)', yl: 'P (kPa)', empty: '실험 1 기록이 없습니다' }); return; }
        const xmax = Math.max(...ba.rows.map(r => r.vol)) * 1.15, ymax = Math.max(...ba.rows.map(r => r.p)) * 1.1;
        const xmin = Math.min(...ba.rows.map(r => r.vol)) * 0.7;
        const lines = [];
        if (mode === 'fit' && ba.fit) {
            const b = ba.fit.intercept;
            lines.push({ pts: curve(v => ba.k / (v - b), xmin, xmax, 60), color: '#007bff', width: 2 });
        } else {
            const pv0 = ba.rows[0].pv;
            lines.push({ pts: curve(v => pv0 / v, xmin, xmax, 60), color: '#aaa', dash: [6, 4], width: 1.5 });
        }
        drawChart(cv, {
            xmin, xmax, ymin: 0, ymax,
            xl: ba.dead ? 'V (mL, 눈금 + 숨은 부피)' : 'V (mL)', yl: 'P (kPa)', lines,
            pts: ba.rows.map(r => ({ x: r.vol, y: r.p, color: DIR_COLOR[r.dir] || DIR_COLOR.down }))
        });
    }
    function drawVinv(cv, ba) {
        if (!ba) { drawChart(cv, { xmin: 0, xmax: 0.03, ymin: 0, ymax: 60, xl: '1/P (1/kPa)', yl: 'V (mL)', empty: '실험 1 기록이 없습니다' }); return; }
        const xmax = Math.max(...ba.rows.map(r => 1 / r.p)) * 1.1;
        const ys = ba.rows.map(r => r.vol);
        const lines = [{ pts: [{ x: 0, y: 0 }, { x: xmax, y: 0 }], color: '#ccc', width: 1 }];
        let ymin = 0;
        if (ba.fit) {
            const f = x => ba.fit.slope * x + ba.fit.intercept;
            lines.push({ pts: [{ x: 0, y: f(0) }, { x: xmax, y: f(xmax) }], color: '#007bff', width: 2 });
            lines.push({ pts: [{ x: 0, y: 0 }, { x: xmax, y: ba.fit.slope * xmax }], color: '#999', dash: [4, 4], width: 1 });
            ymin = Math.min(0, f(0) * 1.3);
        }
        drawChart(cv, {
            xmin: 0, xmax, ymin, ymax: Math.max(...ys) * 1.12, xd: 4,
            xl: '1/P (1/kPa)', yl: 'V (mL)', lines,
            pts: ba.rows.map(r => ({ x: 1 / r.p, y: r.vol, color: DIR_COLOR[r.dir] || DIR_COLOR.down }))
        });
    }
    function drawPT(cv, ga, extend) {
        if (!ga) { drawChart(cv, { xmin: 10, xmax: 50, ymin: 60, ymax: 80, xl: '온도 t (°C)', yl: 'P (kPa)', empty: '실험 2 기록이 없습니다' }); return; }
        const r = ga.rows.length > 400 ? 2.5 : ga.rows.length > 100 ? 3.5 : 5;
        const pts = ga.rows.map(q => ({ x: q.t, y: q.p, color: '#dc3545', r }));
        const lines = [], vlines = [];
        let xmin, xmax, ymin, ymax;
        const fitOk = ga.fit && ga.fit.slope > 0;
        if (extend && fitOk) {
            xmin = Math.min(-300, ga.t0 - 20); xmax = ga.tMax + 15; ymin = 0; ymax = ga.pMax * 1.1;
            lines.push({ pts: [{ x: ga.t0, y: 0 }, { x: xmax, y: ga.fit.slope * xmax + ga.fit.intercept }], color: '#007bff', width: 2, dash: [6, 4] });
            vlines.push({ x: -G.ZERO_C, color: '#888' });
            pts.push({ x: ga.t0, y: 0, color: '#007bff', r: 6 });
        } else {
            [xmin, xmax] = padRange(ga.rows.map(q => q.t), 2);
            [ymin, ymax] = padRange(ga.rows.map(q => q.p), 0.5);
            if (ga.fit) lines.push({ pts: [{ x: xmin, y: ga.fit.slope * xmin + ga.fit.intercept }, { x: xmax, y: ga.fit.slope * xmax + ga.fit.intercept }], color: '#007bff', width: 2 });
        }
        drawChart(cv, { xmin, xmax, ymin, ymax, xd: extend && fitOk ? 0 : undefined, xl: '온도 t (°C)' + (extend && fitOk ? ' — 회색 점선: −273.15 °C' : ''), yl: 'P (kPa)', pts, lines, vlines });
    }

    // ---------- 결과 HTML (화면과 보고서가 함께 쓴다) ----------
    const box = (label, value, note) => '<div>' + label + '<b>' + value + '</b>' + (note ? '<span class="note">' + note + '</span>' : '') + '</div>';
    function boyleTable(ba) {
        if (!ba) return '<p class="note">실험 1 기록이 없습니다.</p>';
        return '<div class="tbl-wrap" style="max-height:none"><table class="sum-table"><thead><tr><th>#</th><th>과정</th><th>눈금 (mL)</th>' +
            (ba.dead ? '<th>V (mL)</th>' : '') + '<th>P (kPa)</th><th>t (°C)</th><th>PV (kPa·mL)</th><th>PV/T (kPa·mL/K)</th></tr></thead><tbody>' +
            ba.rows.map((r, i) => '<tr><td>' + (i + 1) + '</td><td class="dir-' + (r.dir || 'down') + '">' + dirName(r.dir) + '</td><td>' + fx(r.v, 1) + '</td>' +
                (ba.dead ? '<td>' + fx(r.vol, 1) + '</td>' : '') + '<td>' + fx(r.p, 2) + '</td><td>' + fx(r.t, 1) + '</td><td>' + fx(r.pv, 0) + '</td><td>' + fx(r.pvt, 3) + '</td></tr>').join('') +
            '<tr><td colspan="' + (ba.dead ? 6 : 5) + '"><b>평균 ± 표준편차</b></td><td><b>' + fx(ba.pvMean, 0) + ' ± ' + fx(ba.pvSd, 0) + '</b></td><td><b>' + fx(ba.pvtMean, 3) + '</b></td></tr>' +
            '</tbody></table></div>';
    }
    // 실험 2 표: 점이 많으면 고르게 골라 maxRows 줄만 보인다
    function gayTable(ga, maxRows) {
        if (!ga) return '<p class="note">실험 2 기록이 없습니다.</p>';
        const n = ga.rows.length;
        const idx = [];
        if (n <= maxRows) for (let i = 0; i < n; i++) idx.push(i);
        else for (let k = 0; k < maxRows; k++) idx.push(Math.round(k * (n - 1) / (maxRows - 1)));
        return '<div class="tbl-wrap" style="max-height:none"><table class="sum-table"><thead><tr><th>#</th><th>시간 (s)</th><th>t (°C)</th><th>T (K)</th><th>P (kPa)</th><th>P/T (kPa/K)</th></tr></thead><tbody>' +
            idx.map(i => { const r = ga.rows[i]; return '<tr><td>' + (i + 1) + '</td><td>' + fx(r.s, 0) + '</td><td>' + fx(r.t, 2) + '</td><td>' + fx(r.T, 2) + '</td><td>' + fx(r.p, 3) + '</td><td>' + fx(r.pt, 4) + '</td></tr>'; }).join('') +
            '</tbody></table></div>' + (n > maxRows ? '<p class="note">전체 ' + n + '개 중 ' + maxRows + '개를 고르게 골라 보였습니다. 계산에는 모두 씁니다.</p>' : '');
    }
    function boyleResults(ba) {
        if (!ba) return '';
        const out = [
            box('PV 평균', fx(ba.pvMean, 0) + ' kPa·mL', '± ' + fx(ba.pvSd, 0)),
            box('PV 변동 (표준편차 ÷ 평균)', fx(ba.pvCv, 2) + ' %', '작을수록 PV 가 일정'),
            box('측정 압력 범위', fx(ba.pMin, 1) + ' ~ ' + fx(ba.pMax, 1) + ' kPa'),
            box('온도 변화 폭', fx(ba.tSpan, 1) + ' °C', '평균 ' + fx(ba.tMean, 1) + ' °C')
        ];
        if (ba.fit) {
            out.push(box('V–1/P 기울기 k', fx(ba.k, 0) + ' kPa·mL', 'R² = ' + fx(ba.fit.r2, 4)));
            out.push(box('V–1/P 절편 b', fx(ba.fit.intercept, 2) + ' mL', ba.extra > 0 ? '눈금에 안 보이는 부피 약 ' + fx(ba.extra, 1) + ' mL' : '0 이면 이상적'));
            out.push(box('ln P–ln V 기울기', fx(ba.power, 3), 'P ∝ 1/V 이면 −1'));
        }
        out.push(box('주사기 속 공기의 양 n', sci(ba.molMean, 2) + ' mol', '분자 약 ' + sci(ba.molMean * G.N_A, 1) + ' 개'));
        return out.join('');
    }
    function gayResults(ga) {
        if (!ga) return '';
        const out = [
            box('측정 온도 범위', fx(ga.tMin, 1) + ' ~ ' + fx(ga.tMax, 1) + ' °C', '폭 ' + fx(ga.tMax - ga.tMin, 1) + ' °C (15 °C 이상 추천)'),
            box('측정 압력 범위', fx(ga.pMin, 2) + ' ~ ' + fx(ga.pMax, 2) + ' kPa', ga.rows.length + '개 점')
        ];
        if (ga.fit) {
            out.push(box('기울기 a', fx(ga.fit.slope, 4) + ' kPa/°C', 'R² = ' + fx(ga.fit.r2, 4)));
            out.push(box('절편 b (0 °C 의 압력)', fx(ga.fit.intercept, 2) + ' kPa'));
        }
        if (ga.t0 != null) {
            out.push(box('절대 영도 추정 t₀ = −b/a', fx(ga.t0, 0) + ' °C', ga.sT0 != null ? '표준오차 ± ' + fx(ga.sT0, 0) + ' °C' : ''));
            out.push(box('참값(−273.15 °C)과 차이', (ga.errK >= 0 ? '+' : '') + fx(ga.errK, 0) + ' °C', '오차율 ' + fx(ga.errPct, 1) + ' %'));
        } else if (ga.fit) {
            out.push(box('절대 영도 추정', '계산 불가', '온도가 오를 때 압력이 오르지 않았습니다. 공기가 새는지 확인하세요'));
        }
        out.push(box('P/T 평균', fx(ga.ptMean, 4) + ' kPa/K', '변동 ' + fx(ga.ptCv, 2) + ' %'));
        if (ga.molMean != null) out.push(box('용기 속 공기의 양 n', sci(ga.molMean, 2) + ' mol', '용기 부피 ' + ga.volume + ' L 로 계산'));
        return out.join('');
    }
    function combHtml(ba, ga, su) {
        if (!ba && !ga) return '<p class="note">5. 데이터 수집에서 측정하면 여기에 종합 결과가 나옵니다.</p>';
        const rows = [];
        if (ba) rows.push('<tr><td>실험 1 (주사기, n·T 일정)</td><td>PV/T = ' + fx(ba.pvtMean, 3) + ' kPa·mL/K</td><td>' + fx(ba.pvtCv, 2) + ' %</td><td>' + sci(ba.molMean, 2) + ' mol</td></tr>');
        if (ga) rows.push('<tr><td>실험 2 (용기, n·V 일정)</td><td>P/T = ' + fx(ga.ptMean, 4) + ' kPa/K' + (su.vol ? '<br>PV/T = ' + fx(ga.ptMean * su.vol * 1000, 1) + ' kPa·mL/K' : '') + '</td><td>' + fx(ga.ptCv, 2) + ' %</td><td>' + (ga.molMean != null ? sci(ga.molMean, 2) + ' mol' : '<span class="note">용기 부피를 넣으면 계산</span>') + '</td></tr>');
        return '<div class="tbl-wrap" style="max-height:none"><table class="sum-table"><thead><tr><th>실험</th><th>일정해야 하는 값</th><th>변동</th><th>n = PV/RT</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' +
            '<p class="note">두 실험 모두에서 PV/T (= nR) 가 거의 일정하면, P·V·T 를 함께 묶은 PV = nRT 가 성립한다고 볼 수 있습니다. 변동이 몇 % 안쪽이면 측정 오차 범위로 봅니다. n 은 R = 8.314 J/(mol·K) 로 계산한 값입니다 (kPa·mL = 10⁻³ J).</p>';
    }
    function calcHtml(ba, ga) {
        const part = (title, f, xn, yn, xd, yd, tail) => {
            const s = f.sums;
            return '<p><b>' + title + '</b> (x = ' + xn + ', y = ' + yn + ')<br>' +
                'n = ' + s.n + ', Σx = <code>' + s.sx.toFixed(xd) + '</code>, Σy = <code>' + s.sy.toFixed(yd) + '</code>, Σx² = <code>' + s.sxx.toPrecision(6) + '</code>, Σxy = <code>' + s.sxy.toPrecision(6) + '</code><br>' +
                'a = (nΣxy − ΣxΣy) / (nΣx² − (Σx)²) = <b>' + f.slope.toPrecision(5) + '</b><br>' +
                'b = (Σy − aΣx) / n = <b>' + f.intercept.toPrecision(5) + '</b>' + (f.sSlope != null ? '<br>표준오차: a ± ' + f.sSlope.toPrecision(2) + ', b ± ' + f.sIntercept.toPrecision(2) : '') + tail + '</p>';
        };
        const out = [];
        if (ba && ba.fit) out.push(part('실험 1: V = a·(1/P) + b', ba.fit, '1/P (1/kPa)', 'V (mL)', 5, 1, '<br>→ PV 상수 k = a = ' + fx(ba.k, 0) + ' kPa·mL'));
        if (ga && ga.fit) out.push(part('실험 2: P = a·t + b', ga.fit, 't (°C)', 'P (kPa)', 1, 2, ga.t0 != null ? '<br>→ t₀ = −b / a = ' + fx(ga.t0, 1) + ' °C' : ''));
        return out.join('') || '<p class="note">점이 2개 이상 (온도·압력이 서로 다른 값) 있어야 계산할 수 있습니다.</p>';
    }
    function conclSummary(ba, ga) {
        const rows = [];
        if (ba) rows.push(['실험 1: PV 평균 (변동)', fx(ba.pvMean, 0) + ' kPa·mL (' + fx(ba.pvCv, 1) + ' %)']);
        if (ba && ba.fit) rows.push(['실험 1: V–1/P 직선 R² / 절편', fx(ba.fit.r2, 4) + ' / ' + fx(ba.fit.intercept, 2) + ' mL']);
        if (ba && ba.power != null) rows.push(['실험 1: ln P–ln V 기울기 (이론 −1)', fx(ba.power, 3)]);
        if (ga && ga.t0 != null) rows.push(['실험 2: 절대 영도 추정 (오차율)', fx(ga.t0, 0) + ' °C (' + fx(ga.errPct, 1) + ' %)']);
        if (ga && ga.fit) rows.push(['실험 2: P–t 직선 R²', fx(ga.fit.r2, 4)]);
        if (ga) rows.push(['실험 2: P/T 변동', fx(ga.ptCv, 2) + ' %']);
        if (!rows.length) return '<p class="note">5. 데이터 수집에서 측정하면 결과가 여기에 요약됩니다.</p>';
        return '<div class="tbl-wrap" style="max-height:none"><table class="sum-table"><tbody>' +
            rows.map(r => '<tr><td>' + r[0] + '</td><td><b>' + r[1] + '</b></td></tr>').join('') + '</tbody></table></div>';
    }

    // ---------- 3. 준비물: 주사기 계획 ----------
    function pNow() { const a = G.recentAverage(live, 3000); return connected() && a ? a.p : G.P_ATM; }
    function stopPressure(su) {
        const lim = su.vStart && su.vMax ? G.syringeLimit(su.vStart, su.vMax, pNow()) : null;
        return { lim, stop: Math.max(40, lim ? Math.ceil(lim * 1.1) : 40) };
    }
    function renderPlan() {
        const su = setupNums(state.setup);
        const { lim, stop } = stopPressure(su);
        document.querySelectorAll('.stop-p').forEach(e => { e.textContent = '약 ' + stop + ' kPa'; });
        if (!lim) { $('plan-out').innerHTML = '주사기 최대 눈금과 처음 부피를 넣으면, 펌프질을 어디까지 해도 되는지 계산합니다.'; return; }
        const lines = [];
        if (su.vStart >= su.vMax) lines.push('⚠️ 처음 부피가 최대 눈금보다 작아야 합니다.');
        else {
            lines.push('처음 ' + su.vStart + ' mL 의 공기는 압력이 <b>약 ' + lim.toFixed(0) + ' kPa</b> 가 되면 ' + su.vMax + ' mL 눈금(끝)에 닿습니다.');
            lines.push('🛑 실험 1 은 압력이 <b class="big">' + stop + ' kPa</b> 가 될 때까지만 펌프질하세요' + (stop === 40 ? ' (센서 측정 한계 30 kPa 보다 여유를 둠).' : ' (피스톤이 빠지지 않게 여유를 둠).'));
            const vEnd = (su.vStart + su.dead) * pNow() / stop - su.dead;
            lines.push('그때 주사기 눈금은 약 <b>' + vEnd.toFixed(0) + ' mL</b> 가 됩니다.');
            if (stop > 65) lines.push('⚠️ 압력 범위가 좁아 점을 많이 얻기 어렵습니다. 처음 부피를 <b>' + Math.round(su.vMax * 0.35) + ' mL</b> 정도로 줄이세요.');
        }
        $('plan-out').innerHTML = lines.join('<br>');
    }

    // ---------- 5. 센서 (블루투스) ----------
    const SERVICE = '19b10000-e8f2-537e-4f6c-d104768a1214';
    const TX_CHAR = '19b10001-e8f2-537e-4f6c-d104768a1214';
    const CMD_CHAR = '19b10002-e8f2-537e-4f6c-d104768a1214';
    let device = null, dataChar = null, cmdChar = null, connecting = false, setupFailure = null, pageLeaving = false;
    let live = [];              // [{ at, p, t, h }] 최근 10분
    let lastSampleAt = null;
    const connected = () => !!(device && device.gatt.connected && dataChar);
    const fresh = () => connected() && live.length && Date.now() - live[live.length - 1].at < 3000;
    const receiver = new EnvironmentProtocol.Receiver(onSample, onSensorError, EnvironmentProtocol.validateSample);
    const onNotify = e => receiver.push(e.target.value);

    function setStatus(text) { $('ble-status').textContent = text; }
    async function connect() {
        if (connecting) return;
        connecting = true; setupFailure = null;
        $('btn-connect').disabled = true;
        if (device) { const prev = device; prev.removeEventListener('gattserverdisconnected', onDisconnected); onDisconnected(); if (prev.gatt.connected) prev.gatt.disconnect(); }
        try {
            const dev = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'PicoEnv-' }], optionalServices: [SERVICE] });
            if (pageLeaving) throw new Error('페이지 이동으로 연결을 취소했습니다.');
            device = dev;
            setStatus('연결 중: ' + dev.name);
            await PicoBLE.discover(dev, SERVICE, [TX_CHAR, CMD_CHAR],
                attempt => setStatus('연결 재시도 ' + attempt + '/2: ' + dev.name),
                {
                    isCancelled: () => pageLeaving || device !== dev || setupFailure !== null,
                    cleanup: () => {
                        if (dataChar) dataChar.removeEventListener('characteristicvaluechanged', onNotify);
                        dataChar = null; cmdChar = null; receiver.reset();
                    },
                    prepare: async ([d, c]) => {
                        dataChar = d; cmdChar = c;
                        d.addEventListener('characteristicvaluechanged', onNotify);
                        await d.startNotifications();
                        // VOC 센서(히터)는 켜지 않고 온도·습도·기압만 1초마다 받는다
                        for (const command of ['STOP', 'SET_ENV_RATE:1000', 'START:ENV']) {
                            if (setupFailure) throw setupFailure;
                            await c.writeValueWithResponse(new TextEncoder().encode(command));
                        }
                    }
                });
            if (pageLeaving) { dev.gatt.disconnect(); throw new Error('페이지 이동으로 연결을 취소했습니다.'); }
            dev.addEventListener('gattserverdisconnected', onDisconnected);
            lastSampleAt = Date.now();
            setStatus('연결됨: ' + dev.name + ' — 센서 값 기다리는 중');
            $('btn-connect').hidden = true; $('btn-disconnect').hidden = false;
        } catch (error) {
            if (device && device.gatt.connected) device.gatt.disconnect();
            onDisconnected();
            if (error.name !== 'NotFoundError') setStatus('연결 실패: ' + (setupFailure || error).message);
            else setStatus('연결 안 됨 (장치를 고르지 않았습니다)');
        } finally {
            connecting = false;
            $('btn-connect').disabled = false;
        }
    }
    function disconnect() {
        if (device && device.gatt.connected) device.gatt.disconnect();
        onDisconnected();
    }
    function onDisconnected() {
        stopAuto();
        if (dataChar) dataChar.removeEventListener('characteristicvaluechanged', onNotify);
        if (device) device.removeEventListener('gattserverdisconnected', onDisconnected);
        device = null; dataChar = null; cmdChar = null; lastSampleAt = null;
        receiver.reset();
        setStatus('연결 해제됨');
        $('btn-connect').hidden = false; $('btn-disconnect').hidden = true;
        renderLive();
    }
    function onSensorError(error) {
        if (connecting) setupFailure = error;
        disconnect();
        const low = /outside its specified range/.test(error.message) || (live.length && live[live.length - 1].p < 35);
        setStatus('센서 오류: ' + error.message + (low ? ' — 압력이 30 kPa 아래로 내려가 측정이 멈췄습니다. 밸브로 공기를 조금 넣은 뒤 다시 연결하세요.' : ''));
    }
    function onSample(packet) {
        const d = packet.data;
        const now = Date.now();
        lastSampleAt = now;
        live.push({ at: now, p: d.pressure, t: d.temp, h: d.humidity });
        while (live.length && live[0].at < now - LIVE_KEEP_MS) live.shift();
        if (device) setStatus('연결됨: ' + device.name);
        renderLive();
    }
    // 15초 동안 값이 없으면 연결을 정리한다
    setInterval(() => {
        if (connected() && lastSampleAt && Date.now() - lastSampleAt > 15000) onSensorError(new Error('15초 동안 센서 값이 없습니다. 센서 전원과 거리를 확인하고 다시 연결하세요.'));
    }, 1000);

    function renderLive() {
        const ok = fresh();
        const a = ok ? G.recentAverage(live, 3000) : null;
        const last = live[live.length - 1];
        $('live-p').textContent = ok ? last.p.toFixed(2) : '–';
        $('live-t').textContent = ok ? last.t.toFixed(1) : '–';
        $('live-h').textContent = ok ? last.h.toFixed(0) : '–';
        const badge = $('live-stable');
        const span = ok ? G.recentSpan(live, 10000) : null;
        if (!ok) { badge.className = 'badge'; badge.textContent = connected() ? '센서 값 기다리는 중' : '센서 연결 안 됨 (직접 입력)'; }
        else if (!span) { badge.className = 'badge wait'; badge.textContent = '⏳ 확인 중'; }
        else if (span.p <= STABLE_P && span.t <= STABLE_T) { badge.className = 'badge ok'; badge.textContent = '✅ 안정'; }
        else { badge.className = 'badge wait'; badge.textContent = '⏳ 변하는 중 (10초 동안 ' + span.p.toFixed(2) + ' kPa, ' + span.t.toFixed(1) + ' °C)'; }
        $('live-warn').textContent = ok && last.p < 40 ? '⚠️ 40 kPa 아래입니다. 30 kPa 아래로 내려가면 측정이 멈추니 펌프질을 멈추세요.' : '';
        // 센서가 연결되어 있으면 입력 칸에 최근 3초 평균을 넣고 고칠 수 없게 한다
        for (const [id, key, d] of [['in-p', 'p', 2], ['in-t', 't', 1], ['in-gp', 'p', 3], ['in-gt', 't', 2]]) {
            const el = $(id);
            el.readOnly = !!a;
            if (a) el.value = a[key].toFixed(d);
        }
        if (state.tab === 'data') drawLive();
    }
    function drawLive() {
        const cv = $('chart-live');
        const now = Date.now();
        const use = live.filter(s => s.at >= now - 300000);
        if (use.length < 2) { drawChart(cv, { xmin: -300, xmax: 0, ymin: 0, ymax: 110, xd: 0, xl: '시간 (초 전)', yl: '압력 (kPa)', empty: connected() ? '센서 값 기다리는 중' : '센서를 연결하면 실시간 그래프가 나옵니다' }); return; }
        const [pmin, pmax] = padRange(use.map(s => s.p), 0.2);
        const [tmin, tmax] = padRange(use.map(s => s.t), 0.5);
        drawChart(cv, {
            xmin: -300, xmax: 0, xd: 0, ymin: pmin, ymax: pmax, xl: '시간 (초 전)', yl: '압력 (kPa)', ylColor: '#007bff',
            y2: { min: tmin, max: tmax, label: '온도 (°C)', color: '#dc3545' },
            lines: [
                { pts: use.map(s => ({ x: (s.at - now) / 1000, y: s.p })), color: '#007bff', width: 2 },
                { pts: use.map(s => ({ x: (s.at - now) / 1000, y: s.t })), color: '#dc3545', width: 1.5, y2: true }
            ]
        });
    }

    // ---------- 5. 실험 1 기록 ----------
    function addBoyle() {
        const v = num($('in-v').value);
        const a = fresh() ? G.recentAverage(live, 3000) : null;
        const p = a ? a.p : num($('in-p').value), t = a ? a.t : num($('in-t').value);
        const msg = $('boyle-msg');
        if (!(v > 0)) { msg.textContent = '⚠️ 주사기 눈금 V 를 넣으세요.'; $('in-v').focus(); return; }
        if (!(p > 0 && p < 200)) { msg.textContent = '⚠️ 압력 P (kPa) 를 넣으세요. 센서를 연결하면 자동으로 들어갑니다.'; return; }
        if (t == null || t < -30 || t > 80) { msg.textContent = '⚠️ 온도 t (°C) 를 넣으세요.'; return; }
        state.boyle.push({ v, p: +p.toFixed(3), t: +t.toFixed(2), dir: state.dir, src: a ? 'sensor' : 'hand' });
        const span = a ? G.recentSpan(live, 10000) : null;
        msg.textContent = '기록했습니다: V = ' + v + ' mL, P = ' + p.toFixed(2) + ' kPa, t = ' + t.toFixed(1) + ' °C' +
            (span && (span.p > STABLE_P || span.t > STABLE_T) ? ' — ⚠️ 아직 값이 변하는 중이었습니다. 이상하면 지우고 안정된 뒤 다시 기록하세요.' : '');
        $('in-v').value = ''; state.draft.v = '';
        save(); renderData(); renderResults();
        $('in-v').focus();
    }

    // ---------- 5. 실험 2 기록 ----------
    let autoTimer = null;
    function addGayPoint(fromTimer) {
        const msg = $('gay-msg');
        if (state.gay.length >= MAX_GAY) { stopAuto(); msg.textContent = '⚠️ 최대 ' + MAX_GAY + '개까지 기록할 수 있습니다. 기록 간격을 늘려 다시 하세요.'; return; }
        let p, t, src;
        if (fresh()) {
            const a = G.recentAverage(live, Math.min(3000, parseFloat(state.gInt) * 1000));
            p = a.p; t = a.t; src = 'sensor';
        } else if (fromTimer) {
            msg.textContent = '⚠️ 센서 값이 들어오지 않아 이번 기록을 건너뛰었습니다.';
            return;
        } else {
            p = num($('in-gp').value); t = num($('in-gt').value); src = 'hand';
            if (!(p > 0 && p < 200) || t == null || t < -30 || t > 80) { msg.textContent = '⚠️ 압력 P (kPa) 와 온도 t (°C) 를 넣으세요.'; return; }
            $('in-gp').value = ''; $('in-gt').value = ''; state.draft.gp = ''; state.draft.gt = '';
        }
        state.gay.push({ at: Date.now(), p: +p.toFixed(3), t: +t.toFixed(2), src });
        save(); renderData();
        if (state.tab === 'result') renderResults();
    }
    function startAuto() {
        if (!fresh()) { $('gay-msg').textContent = '⚠️ 자동 기록은 센서를 연결해야 쓸 수 있습니다. 센서가 없으면 \'지금 값 한 번 기록\'으로 직접 입력하세요.'; return; }
        stopAuto();
        addGayPoint(true);
        autoTimer = setInterval(() => addGayPoint(true), parseFloat(state.gInt) * 1000);
        renderAutoBtn();
    }
    function stopAuto() {
        if (!autoTimer) return;
        clearInterval(autoTimer); autoTimer = null;
        renderAutoBtn(); renderData();
    }
    function renderAutoBtn() {
        const b = $('btn-auto');
        b.textContent = autoTimer ? '⏹ 정지' : '▶ 자동 기록 시작';
        b.className = autoTimer ? 'danger' : 'good';
    }

    function renderData() {
        $('box-boyle').hidden = state.method !== 'boyle';
        $('box-gay').hidden = state.method !== 'gay';
        document.querySelectorAll('input[name=method]').forEach(r => { r.checked = r.value === state.method; });
        const { ba, ga } = current();
        $('boyle-body').innerHTML = state.boyle.map((q, i) =>
            '<tr><td>' + (i + 1) + '</td><td class="dir-' + q.dir + '">' + dirName(q.dir) + '</td><td>' + fx(q.v, 1) + '</td><td>' + fx(q.p, 2) + '</td><td>' + fx(q.t, 1) + '</td><td>' + fx(q.p * (q.v + setupNums(state.setup).dead), 0) +
            '</td><td class="acts"><button class="danger" data-del-b="' + i + '">삭제</button></td></tr>').join('') ||
            '<tr><td colspan="7" class="note">아직 기록이 없습니다.</td></tr>';
        const gp = gayPoints(state.gay);
        $('gay-body').innerHTML = gp.map((q, i) => ({ q, i })).reverse().map(({ q, i }) =>
            '<tr><td>' + (i + 1) + '</td><td>' + fx(q.s, 0) + '</td><td>' + fx(q.t, 2) + '</td><td>' + fx(q.p, 3) + '</td><td>' + fx(q.p / G.kelvin(q.t), 4) +
            '</td><td class="acts"><button class="danger" data-del-g="' + i + '">삭제</button></td></tr>').join('') ||
            '<tr><td colspan="6" class="note">아직 기록이 없습니다.</td></tr>';
        if (ga) {
            $('gay-msg').textContent = (autoTimer ? '⏺ 자동 기록 중 · ' : '') + ga.rows.length + '개 기록, 온도 ' + fx(ga.tMin, 1) + ' ~ ' + fx(ga.tMax, 1) + ' °C (폭 ' + fx(ga.tMax - ga.tMin, 1) + ' °C)' +
                (ga.tMax - ga.tMin < 15 ? ' — 15 °C 이상이 되도록 더 데우거나 식혀 보세요.' : ' ✅');
        }
        $('sel-dir').value = state.dir;
        $('sel-gint').value = state.gInt;
        if (state.tab === 'data') { drawPV($('chart-pv'), ba, 'first'); drawPT($('chart-pt'), ga, false); drawLive(); }
    }

    // ---------- 6. 결과 ----------
    function renderResults() {
        const { su, ba, ga } = current();
        $('res-boyle-table').innerHTML = boyleTable(ba);
        $('res-boyle').innerHTML = boyleResults(ba);
        $('res-gay-table').innerHTML = gayTable(ga, 15);
        $('res-gay').innerHTML = gayResults(ga);
        $('res-comb').innerHTML = combHtml(ba, ga, su);
        $('calc').innerHTML = calcHtml(ba, ga);
        $('chk-extend').checked = state.extend;
        if (state.tab === 'result') {
            drawPV($('chart-pv2'), ba, 'fit');
            drawVinv($('chart-vinv'), ba);
            drawPT($('chart-pt2'), ga, state.extend);
        }
        $('concl-sum').innerHTML = conclSummary(ba, ga);
    }

    // ---------- 6. 내보내기 ----------
    function download(name, text, type) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + text], { type }));
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
    }
    $('btn-csv').addEventListener('click', () => {
        const { ba, ga } = current();
        const rows = ['experiment,no,process,time_s,scale_volume_mL,air_volume_mL,pressure_kPa,temp_C,PV_kPa_mL,P_over_T_kPa_per_K,source'];
        if (ba) ba.rows.forEach((r, i) => rows.push(['boyle', i + 1, r.dir || 'down', '', r.v, r.vol, r.p, r.t, r.pv.toFixed(2), '', state.boyle[i] ? state.boyle[i].src : ''].join(',')));
        if (ga) ga.rows.forEach((r, i) => rows.push(['gay-lussac', i + 1, '', r.s.toFixed(1), '', '', r.p, r.t, '', r.pt.toFixed(5), state.gay[i] ? state.gay[i].src : ''].join(',')));
        download('ideal-gas.csv', rows.join('\n'), 'text/csv');
    });
    $('btn-copy').addEventListener('click', async () => {
        const { ba, ga } = current();
        const lines = [];
        if (ba) {
            lines.push(['실험 1', '과정', '눈금 V (mL)', '공기 부피 (mL)', 'P (kPa)', 't (°C)', 'PV (kPa·mL)'].join('\t'));
            ba.rows.forEach((r, i) => lines.push([i + 1, dirName(r.dir), r.v, r.vol, r.p, r.t, r.pv.toFixed(1)].join('\t')));
            lines.push(['PV 평균', ba.pvMean.toFixed(1), '변동(%)', ba.pvCv.toFixed(2)].join('\t'), '');
        }
        if (ga) {
            lines.push(['실험 2', '시간 (s)', 't (°C)', 'P (kPa)', 'P/T (kPa/K)'].join('\t'));
            ga.rows.forEach((r, i) => lines.push([i + 1, r.s.toFixed(0), r.t, r.p, r.pt.toFixed(5)].join('\t')));
            if (ga.fit) lines.push(['기울기 a', ga.fit.slope.toFixed(5), '절편 b', ga.fit.intercept.toFixed(3), '절대 영도 추정 (°C)', ga.t0 != null ? ga.t0.toFixed(1) : ''].join('\t'));
        }
        try {
            await navigator.clipboard.writeText(lines.join('\n'));
            $('copy-status').textContent = lines.length ? '복사했습니다. 시트에서 A1 을 선택하고 붙여넣기(Ctrl+V) 하세요.' : '복사할 측정값이 없습니다.';
        } catch (e) {
            $('copy-status').textContent = '복사하지 못했습니다. CSV 다운로드를 이용하세요.';
        }
    });
    $('btn-clear-all').addEventListener('click', () => {
        if (!confirm('실험 1·2 의 모든 측정값을 지울까요? (쓴 글은 남습니다)')) return;
        stopAuto(); state.boyle = []; state.gay = []; save(); renderAll();
    });
    $('btn-clear-boyle').addEventListener('click', () => {
        if (!state.boyle.length || !confirm('실험 1 기록을 모두 지울까요?')) return;
        state.boyle = []; save(); renderAll();
    });
    $('btn-clear-gay').addEventListener('click', () => {
        if (!state.gay.length || !confirm('실험 2 기록을 모두 지울까요?')) return;
        stopAuto(); state.gay = []; save(); renderAll();
    });

    // ---------- 보고서 (미리보기·인쇄·제출한 보고서 보기) ----------
    function snapshot() {
        return {
            v: 1,
            student: Object.assign({}, state.student),
            setup: Object.assign({}, state.setup),
            boyle: state.boyle.map(q => ({ v: q.v, p: q.p, t: q.t, dir: q.dir, src: q.src })),
            gay: gayPoints(state.gay).map((q, i) => ({ s: +q.s.toFixed(1), t: q.t, p: q.p, src: state.gay[i].src })),
            text: Object.assign({}, state.text)
        };
    }
    const answer = s => '<div class="answer' + (String(s || '').trim() ? '' : ' empty') + '">' + (String(s || '').trim() ? esc(s) : '(쓰지 않음)') + '</div>';
    const qText = id => { const b = document.querySelector('#' + id + ' > b'), n = document.querySelector('#' + id + ' > .note'); return (b ? b.textContent : '') + (n ? ' ' + n.textContent : ''); };
    function reportHtml(r, meta) {
        const d = { setup: r.setup || {}, boyle: r.boyle || [], gayPts: r.gay || [] };
        const { su, ba, ga } = analyses(d);
        const st = r.student || {}, tx = r.text || {};
        const goals = $('goal-list').innerHTML;
        const mats = $('mat-table').outerHTML.replace(' id="mat-table"', '');
        return '<div class="card">' +
            '<h1>이상기체 상태 방정식 검증 실험 보고서</h1>' +
            '<div class="meta">학번 <b>' + esc(st.id || '–') + '</b> · 이름 <b>' + esc(st.name || '–') + '</b>' + (st.members ? ' · 모둠원 ' + esc(st.members) : '') +
            (meta.email ? '<br>계정 ' + esc(meta.email) : '') + '<br>' + esc(meta.when) + '</div>' +
            '<h2>1. 실험 목표</h2><ol class="big-list">' + goals + '</ol><h3>가설</h3>' + answer(tx.hypo) +
            '<h2>2. 실험 이론</h2><ul>' +
            '<li>보일 법칙 (n, T 일정): <b>PV = 일정</b></li>' +
            '<li>샤를·게이뤼삭 법칙 (n, V 일정): <b>P / T = 일정</b>, T(K) = t(°C) + 273.15 → P–t 직선을 연장하면 −273.15 °C (절대 영도) 에서 P = 0</li>' +
            '<li>이상기체 상태 방정식: <b>PV = nRT</b> (R = 8.314 J/(mol·K), kPa·mL = 10⁻³ J)</li>' +
            '<li>최소제곱법: 실험 1 은 V = k·(1/P) + b, 실험 2 는 P = a·t + b 로 직선 적합</li></ul>' +
            '<h2>3. 실험 준비물</h2>' + mats +
            '<p class="note">주사기 최대 눈금 ' + esc(d.setup.vMax || '–') + ' mL, 처음 부피 ' + esc(d.setup.vStart || '–') + ' mL, 숨은 부피 ' + su.dead + ' mL' + (su.vol ? ', 감압 용기 부피 ' + su.vol + ' L' : '') + '</p>' +
            '<h2>4. 실험 과정</h2><ol>' +
            '<li>피코 환경 센서 모듈(압력·온도)과 끝을 막은 주사기를 감압 용기에 넣고, 블루투스로 실시간 값을 받는다.</li>' +
            '<li>실험 1: 손 펌프로 공기를 조금씩 빼면서, 온도·압력이 안정될 때마다 주사기 눈금 V 와 압력 P, 온도 t 를 기록한다.</li>' +
            '<li>실험 2: 용기를 약 70 kPa 로 감압해 밀폐하고, 따뜻한 물에 담갔다가 식히는 동안 압력과 온도를 자동으로 기록한다.</li></ol>' +
            '<h2>5. 데이터</h2><h3>표 1. 실험 1 (압력과 부피)</h3>' + boyleTable(ba) +
            '<h3>표 2. 실험 2 (온도와 압력)</h3>' + gayTable(ga, 30) +
            '<h2>6. 결과</h2>' +
            '<canvas class="chart" data-rv="pv"></canvas><p class="note">그래프 1. P–V (파란 곡선: PV = k)</p>' +
            '<canvas class="chart" data-rv="vinv"></canvas><p class="note">그래프 2. V–1/P (파란 선: 최소제곱 직선)</p>' +
            '<div class="results">' + boyleResults(ba) + '</div>' +
            '<canvas class="chart" data-rv="pt"></canvas><p class="note">그래프 3. P–t (압력 0 까지 연장)</p>' +
            '<div class="results">' + gayResults(ga) + '</div>' +
            '<h3>종합</h3>' + combHtml(ba, ga, su) +
            '<h3>결과 정리</h3>' + answer(tx.result) +
            '<h2>7. 결론 및 검토</h2><h3>결론</h3>' + answer(tx.concl) +
            [1, 2, 3, 4, 5].map(k => '<h3>' + esc(qText('q' + k)) + '</h3>' + answer(tx['a' + k])).join('') +
            '</div>';
    }
    function showReport(r, meta) {
        $('rv-body').innerHTML = reportHtml(r, meta);
        document.body.classList.add('report-mode');
        window.scrollTo(0, 0);
        const { ba, ga } = analyses({ setup: r.setup || {}, boyle: r.boyle || [], gayPts: r.gay || [] });
        requestAnimationFrame(() => {
            drawPV(document.querySelector('[data-rv=pv]'), ba, 'fit');
            drawVinv(document.querySelector('[data-rv=vinv]'), ba);
            drawPT(document.querySelector('[data-rv=pt]'), ga, true);
        });
    }
    $('btn-print').addEventListener('click', () => {
        showReport(snapshot(), { when: '작성 중 (미리보기) · ' + new Date().toLocaleString('ko-KR') });
    });
    $('rv-print').addEventListener('click', () => window.print());
    $('rv-back').addEventListener('click', () => {
        if (reportId) { location.href = '../index.html'; return; }
        document.body.classList.remove('report-mode');
        showTab(state.tab);
    });

    // ---------- 7. 제출 (Firebase: 메인 페이지와 같은 프로젝트·로그인) ----------
    const firebaseConfig = {
        projectId: "web-experiment-f9b24",
        appId: "1:718758606428:web:e11ed8d0b64a471ee65899",
        storageBucket: "web-experiment-f9b24.firebasestorage.app",
        apiKey: "AIzaSyCYVme6ZP-iyspRmHTtuUSsKXe7K_D0vJQ",
        authDomain: "web-experiment-f9b24.firebaseapp.com",
        messagingSenderId: "718758606428"
    };
    const reportId = new URLSearchParams(location.search).get('report');
    let auth = null, db = null, user = null;
    try {
        if (typeof firebase !== 'undefined') {
            firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
            db = firebase.firestore();
            auth.onAuthStateChanged(u => { user = u; renderLogin(); if (reportId) loadReport(); });
        }
    } catch (e) { console.error('Firebase init error', e); }

    function renderLogin() {
        if (!auth) { $('login-status').textContent = '⚠️ 인터넷 연결 또는 로그인 도구를 불러오지 못해 제출할 수 없습니다. 인쇄(PDF 저장)를 이용하세요.'; $('btn-login').hidden = true; return; }
        $('login-status').textContent = user ? '👤 ' + (user.displayName || user.email) + ' 로 제출합니다.' : '🔒 제출하려면 구글 로그인이 필요합니다.';
        $('btn-login').hidden = !!user;
        if (user && !state.student.name && user.displayName) { state.student.name = user.displayName; $('st-name').value = user.displayName; save(); }
        if (state.submitted) $('submit-status').textContent = '✅ 마지막 제출: ' + state.submitted;
    }
    function signIn() {
        if (!auth) return;
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err => alert('로그인 실패: ' + err.message));
    }
    $('btn-login').addEventListener('click', signIn);

    function summaryText(ba, ga) {
        const parts = [(state.student.id || '') + ' ' + (state.student.name || '')];
        parts.push(ba ? '실험1 ' + ba.rows.length + '점, PV 변동 ' + ba.pvCv.toFixed(1) + '%' : '실험1 없음');
        parts.push(ga ? '실험2 ' + ga.rows.length + '점' + (ga.t0 != null ? ', 절대 영도 ' + ga.t0.toFixed(0) + '°C' : '') : '실험2 없음');
        return parts.join(' · ');
    }
    $('btn-submit').addEventListener('click', async () => {
        if (!auth) { alert('제출 기능을 불러오지 못했습니다. 인터넷 연결을 확인하거나 인쇄(PDF 저장)를 이용하세요.'); return; }
        if (!user) { alert('먼저 구글 로그인을 하세요.'); signIn(); return; }
        if (!state.student.id.trim() || !state.student.name.trim()) { alert('학번과 이름을 넣으세요.'); $(state.student.id.trim() ? 'st-name' : 'st-id').focus(); return; }
        const { ba, ga } = current();
        const missing = [];
        if (!ba) missing.push('실험 1 측정값');
        if (!ga) missing.push('실험 2 측정값');
        if (!state.text.concl.trim()) missing.push('결론');
        if (missing.length && !confirm(missing.join(', ') + ' 이(가) 비어 있습니다. 그래도 제출할까요?')) return;
        const btn = $('btn-submit');
        try {
            btn.disabled = true; btn.textContent = '제출 중...';
            await db.collection('experiments').add({
                userId: user.uid,
                userEmail: user.email,
                userName: user.displayName || '',
                experimentName: '이상기체 상태 방정식 검증 (감압 용기)',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                tab: 'ideal-gas-law',
                dataSummary: summaryText(ba, ga),
                report: snapshot(),
                // 현재 firestore.rules 가 요구하는 칸 (이 실험에서는 쓰지 않음)
                weatherSample: {},
                stargazingSample: []
            });
            state.submitted = new Date().toLocaleString('ko-KR');
            save();
            $('submit-status').textContent = '✅ 제출했습니다 (' + state.submitted + '). 메인 페이지의 기록 목록에서 확인할 수 있습니다.';
        } catch (e) {
            $('submit-status').textContent = '❌ 제출 실패: ' + e.message;
        } finally {
            btn.disabled = false; btn.textContent = '📤 보고서 제출';
        }
    });

    // 메인 페이지 기록 목록의 '보고서 보기' 링크 (?report=문서 id): 본인 또는 선생님만 읽을 수 있다
    async function loadReport() {
        document.body.classList.add('report-mode');
        if (!user) {
            $('rv-body').innerHTML = '<div class="card"><p>🔒 보고서를 보려면 구글 로그인이 필요합니다.</p><button id="rv-login">구글 로그인</button></div>';
            $('rv-login').addEventListener('click', signIn);
            return;
        }
        $('rv-body').innerHTML = '<div class="card"><p class="note">보고서를 불러오는 중…</p></div>';
        try {
            const doc = await db.collection('experiments').doc(reportId).get();
            const data = doc.exists ? doc.data() : null;
            if (!data || !data.report) throw new Error('보고서를 찾을 수 없습니다.');
            const when = data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().toLocaleString('ko-KR') : '';
            showReport(data.report, { when: '제출 ' + when, email: data.userEmail });
        } catch (e) {
            $('rv-body').innerHTML = '<div class="card"><p>❌ 보고서를 열 수 없습니다: ' + esc(e.message) + '</p><p class="note">본인이 제출한 보고서이거나 선생님 계정이어야 볼 수 있습니다.</p></div>';
        }
    }

    // ---------- 입력 칸 ----------
    document.querySelectorAll('[data-text]').forEach(el => el.addEventListener('input', () => { state.text[el.dataset.text] = el.value; save(); }));
    document.querySelectorAll('[data-student]').forEach(el => el.addEventListener('input', () => { state.student[el.dataset.student] = el.value; save(); }));
    for (const [id, key] of [['in-vmax', 'vMax'], ['in-vstart', 'vStart'], ['in-dead', 'dead'], ['in-vol', 'vol']]) {
        $(id).addEventListener('input', e => { state.setup[key] = e.target.value; save(); renderPlan(); renderData(); renderResults(); });
    }
    for (const [id, key] of [['in-v', 'v'], ['in-p', 'p'], ['in-t', 't'], ['in-gp', 'gp'], ['in-gt', 'gt']]) {
        $(id).addEventListener('input', e => { if (!e.target.readOnly) { state.draft[key] = e.target.value; save(); } });
    }
    $('in-v').addEventListener('keydown', e => { if (e.key === 'Enter') addBoyle(); });
    $('btn-add-boyle').addEventListener('click', addBoyle);
    $('btn-add-gay').addEventListener('click', () => addGayPoint(false));
    $('btn-auto').addEventListener('click', () => (autoTimer ? stopAuto() : startAuto()));
    $('sel-dir').addEventListener('change', e => { state.dir = e.target.value; save(); });
    $('sel-gint').addEventListener('change', e => { state.gInt = e.target.value; save(); if (autoTimer) startAuto(); });
    document.querySelectorAll('input[name=method]').forEach(r => r.addEventListener('change', () => { state.method = r.value; save(); renderData(); }));
    $('chk-extend').addEventListener('change', e => { state.extend = e.target.checked; save(); renderResults(); });
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-del-b], [data-del-g]');
        if (!b) return;
        if (b.dataset.delB != null) state.boyle.splice(+b.dataset.delB, 1);
        else state.gay.splice(+b.dataset.delG, 1);
        save(); renderData(); renderResults();
    });
    $('btn-connect').addEventListener('click', connect);
    $('btn-disconnect').addEventListener('click', disconnect);
    if (!window.isSecureContext || !navigator.bluetooth) {
        $('btn-connect').disabled = true;
        setStatus('이 브라우저는 블루투스 연결을 지원하지 않습니다 (Android·PC 의 Chrome·Edge, https 필요). 센서 값을 보고 직접 입력하세요.');
    }
    window.addEventListener('pagehide', () => { pageLeaving = true; disconnect(); });
    window.addEventListener('pageshow', () => { pageLeaving = false; });

    // ---------- 탭 ----------
    const TABS = ['purpose', 'theory', 'materials', 'procedure', 'data', 'result', 'conclusion'];
    function renderAll() {
        renderPlan();
        renderData();
        renderResults();
        renderLive();
    }
    function showTab(t, scroll) {
        if (!TABS.includes(t)) t = 'purpose';
        state.tab = t;
        document.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.tab !== t; });
        document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'));
        save();
        renderAll();   // 숨겨져 있던 그래프는 보일 때 크기에 맞춰 다시 그린다
        if (scroll) window.scrollTo(0, 0);
    }
    document.querySelectorAll('.tabs button, [data-go]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab || b.dataset.go, true)));

    // 저장된 값을 화면 입력 칸에 넣기
    function applyControls() {
        document.querySelectorAll('[data-text]').forEach(el => { el.value = state.text[el.dataset.text] || ''; });
        document.querySelectorAll('[data-student]').forEach(el => { el.value = state.student[el.dataset.student] || ''; });
        $('in-vmax').value = state.setup.vMax; $('in-vstart').value = state.setup.vStart;
        $('in-dead').value = state.setup.dead; $('in-vol').value = state.setup.vol;
        $('in-v').value = state.draft.v;
        $('in-gp').value = state.draft.gp; $('in-gt').value = state.draft.gt;
        if (!fresh()) { $('in-p').value = state.draft.p; $('in-t').value = state.draft.t; }
    }

    load();
    applyControls();
    renderLogin();
    if (reportId) {
        document.body.classList.add('report-mode');
        $('rv-body').innerHTML = '<div class="card"><p class="note">보고서를 불러오는 중…</p></div>';
    } else {
        showTab(state.tab);
    }
    // 같은 브라우저의 다른 창(탭)에서 바꾼 내용을 따라간다. 그렇지 않으면 이 창이 저장할 때 다른 창의 기록을 덮어쓴다.
    window.addEventListener('storage', e => {
        if (e.key !== STORE_KEY || reportId) return;
        load();
        applyControls();
        showTab(state.tab);
    });
    let resizeTimer = null;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!document.body.classList.contains('report-mode')) renderAll(); }, 150); });
})();
