/* 교사 화면 — LED 플랑크 상수 수업 결과 (2026-11-20, 예전 apps-script/planck-led 웹앱의 선생님 화면을 사이트로 옮김)
   조별 표(LED 수·조 h·오차·빛 기준 h·기기 수·마지막 보냄) → 조를 누르면 LED 표 + V₀–f 그래프(최소제곱 직선·이론선) → CSV.
   자료는 수업 공간의 플랑크 줄(js/lab-store.js classExport, LED 하나 = 한 줄). 문턱 전압은 보낸 측정점으로 다시 계산한다.
   교사 화면(js/class-teacher.js)이 지켜보는 수업을 바꿀 때 window 에 'ct-watch' 이벤트({ detail: { cls } })를 보내면,
   플랑크 수업일 때만 #planckCard 를 보이고 한 번 불러온다(🔄 로 다시). 계산은 브라우저·Node 공용(시험 tests/class-teacher-planck.test.cjs). */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./planck-math.js'), require('./planck-cloud.js'));
    else root.ClassTeacherPlanck = factory(root.PlanckMath, root.PlanckCloud);
})(typeof self !== 'undefined' ? self : this, function (P, PCL) {
    'use strict';
    var num = function (v) { return v === '' || v == null || !isFinite(Number(v)) ? null : Number(v); };

    // 줄 하나 → LED: 보낸 측정점으로 문턱 전압을 다시 계산 (보낸 값과 0.005 V 넘게 다르면 표시)
    function ledOf(d) {
        var iv = PCL.decodeIv(d.ivData), glow = PCL.decodeGlow(d.glowData);
        var iMin = num(d.iMin) != null ? num(d.iMin) : 1;
        var t = iv.length ? (d.curMode === 'current' ? P.thresholdAtCurrent(iv, iMin || 0.1) : P.thresholdByExtrapolation(iv, iMin)) : null;
        var sent = num(d.V0_current);
        var v0 = t && !t.error ? t.v0 : sent;
        var g = glow.length ? P.thresholdByGlow(glow) : null;
        return {
            group: String(d.group || ''), device: String(d.device || ''), led: String(d.led || 'LED'), lambda: num(d.lambda_nm),
            nIV: iv.length, nGlow: glow.length, v0: v0, v0sent: sent, v0note: t && t.error ? t.error : '',
            differs: !!(t && !t.error && sent != null && Math.abs(t.v0 - sent) > 0.005),
            v0glow: g && !g.error ? g.v0 : num(d.V0_glow), hStudent: num(d['h_current_e-34']), at: String(d.sentAt || d.timestamp || ''),
            iv: iv, glow: glow
        };
    }
    /* classExport 의 items(플랑크 줄) + 수업 조 목록 → 조별 요약 [{ jo, code, leds, fit, fitGlow, devices, last }] */
    function summarize(items, groups) {
        var by = {};
        (groups || []).forEach(function (g) { by[g.code] = { jo: g.jo, code: g.code, leds: [] }; });
        (items || []).forEach(function (d) {
            if (!(Number(d.nIV) + Number(d.nGlow) > 0) && !(d.ivData || d.glowData)) return;
            var L = ledOf(d);
            if (!by[L.group]) by[L.group] = { jo: Number(String(L.group).split('-')[1]) || 0, code: L.group, leds: [] };
            by[L.group].leds.push(L);
        });
        return Object.keys(by).map(function (k) {
            var g = by[k];
            g.leds.sort(function (a, b) { return (b.lambda || 0) - (a.lambda || 0); });
            g.fit = P.planckFit(g.leds.filter(function (l) { return l.v0 != null; }).map(function (l) { return { lambda: l.lambda, v0: l.v0 }; }));
            g.fitGlow = P.planckFit(g.leds.filter(function (l) { return l.v0glow != null; }).map(function (l) { return { lambda: l.lambda, v0: l.v0glow }; }));
            var devs = {}; g.leds.forEach(function (l) { devs[l.device] = 1; });
            g.devices = Object.keys(devs).filter(Boolean).length;
            g.last = g.leds.map(function (l) { return l.at; }).sort().pop() || '';
            return g;
        }).sort(function (a, b) { return a.jo - b.jo; });
    }
    function escXml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    var h34 = function (fit) { return fit ? (fit.h / 1e-34) : null; };
    function csvCell(v) { var s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    /* CSV: LED 한 줄씩 + 아래에 조별 요약 (엑셀에서 한글이 안 깨지게 BOM) */
    function toCsv(sum, onlyCode) {
        var list = sum.filter(function (g) { return !onlyCode || g.code === onlyCode; });
        var out = [['조', '조 코드', '보낸 기기', 'LED', '파장 λ (nm)', '진동수 f (10^14 Hz)', '문턱 전압 V₀ 전류 기준 (V, 다시 계산)', '보낸 V₀ (V)', 'V₀ 빛 기준 (V)', 'I–V 점 수', '빛 기준 점 수', '학생 h (10^-34 J·s)', '보낸 시각', '측정값 V:I(mA)']];
        list.forEach(function (g) { g.leds.forEach(function (l) {
            out.push([g.jo, g.code, l.device, l.led, l.lambda, l.lambda ? (P.freqOf(l.lambda) / 1e14).toFixed(4) : '', l.v0 != null ? l.v0.toFixed(4) : '', l.v0sent != null ? l.v0sent : '',
                l.v0glow != null ? l.v0glow.toFixed(4) : '', l.nIV, l.nGlow, l.hStudent != null ? l.hStudent : '', l.at, l.iv.map(function (p) { return p.v + ':' + p.i; }).join(' ')]);
        }); });
        out.push([]);
        out.push(['조', '조 코드', 'LED 수', '조 h 전류 기준 (10^-34 J·s)', '표준오차', '오차 (%)', '조 h 빛 기준 (10^-34 J·s)', '빛 기준 오차 (%)', '기기 수']);
        list.forEach(function (g) {
            out.push([g.jo, g.code, g.leds.length, g.fit ? h34(g.fit).toFixed(4) : '', g.fit && g.fit.sH != null ? (g.fit.sH / 1e-34).toFixed(4) : '', g.fit ? g.fit.errorPct.toFixed(2) : '',
                g.fitGlow ? h34(g.fitGlow).toFixed(4) : '', g.fitGlow ? g.fitGlow.errorPct.toFixed(2) : '', g.devices]);
        });
        return '﻿' + out.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
    }
    /* V₀–f 그래프 (SVG 글자): 점은 LED 색, 파란 선 = 조 최소제곱, 회색 점선 = 이론 (h 참값, W = 0) */
    function chartSvg(g) {
        var W = 560, H = 320, L = 56, R = 16, T = 16, B = 44;
        var pts = g.leds.filter(function (l) { return l.v0 != null && l.lambda; }).map(function (l) { return { x: P.freqOf(l.lambda) / 1e14, y: l.v0, c: P.wavelengthColor(l.lambda), n: l.led }; });
        var xmin = 3, xmax = 8;
        if (pts.length) { xmin = Math.min.apply(null, pts.map(function (p) { return p.x; })) - 0.3; xmax = Math.max.apply(null, pts.map(function (p) { return p.x; })) + 0.3; }
        var th = function (x) { return P.H_TRUE * x * 1e14 / P.E_CHARGE; };
        var ys = pts.map(function (p) { return p.y; }).concat([th(xmin), th(xmax)]);
        var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys), pad = (ymax - ymin) * 0.08 || 0.5;
        ymin -= pad; ymax += pad;
        var sx = function (x) { return L + (x - xmin) / (xmax - xmin) * (W - L - R); }, sy = function (y) { return T + (ymax - y) / (ymax - ymin) * (H - T - B); };
        var line = function (f, attrs) { return '<line x1="' + sx(xmin).toFixed(1) + '" y1="' + sy(f(xmin)).toFixed(1) + '" x2="' + sx(xmax).toFixed(1) + '" y2="' + sy(f(xmax)).toFixed(1) + '" ' + attrs + '/>'; };
        var ticks = '';
        for (var x = Math.ceil(xmin); x <= xmax; x++) ticks += '<text x="' + sx(x).toFixed(1) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + x + '</text>';
        var step = (ymax - ymin) > 3 ? 1 : 0.5;
        for (var y = Math.ceil(ymin / step) * step; y <= ymax; y += step) ticks += '<text x="' + (L - 6) + '" y="' + (sy(y) + 4).toFixed(1) + '" text-anchor="end">' + y.toFixed(1) + '</text>';
        var fit = g.fit ? line(function (x) { return g.fit.fit.slope * x * 1e14 + g.fit.fit.intercept; }, 'stroke="#1565c0" stroke-width="2"') : '';
        return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ctp-chart" role="img" aria-label="' + g.code + ' 조 V₀–f 그래프" font-size="12" fill="currentColor">' +
            '<rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" fill="none" stroke="#c5ccd3"/>' + ticks +
            line(th, 'stroke="#999" stroke-width="1.5" stroke-dasharray="6 4"') + fit +
            pts.map(function (p) { return '<circle cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="6" fill="' + escXml(p.c) + '" stroke="#333"><title>' + escXml(p.n) + '</title></circle>'; }).join('') +
            '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">진동수 f (10¹⁴ Hz)</text>' +
            '<text transform="translate(14 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">문턱 전압 V₀ (V)</text></svg>';
    }

    // ---------- 화면 (브라우저) ----------
    function mount() {
        if (typeof document === 'undefined') return;
        var card = document.getElementById('planckCard');
        if (!card) return;
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var st = { cls: null, sum: null, pick: '' };
        card.innerHTML = '<div class="ct-row"><h2 style="margin:0">💡 플랑크 상수 결과 (조별 V₀–f)</h2><button id="ctpReload" class="secondary">🔄 다시 불러오기</button></div>' +
            '<p class="note">조원이 보낸 LED 측정점으로 문턱 전압을 다시 계산하고, 조마다 V₀–f 최소제곱 직선의 기울기 × e 로 h 를 구해요. 조를 누르면 LED 표와 그래프가 나와요.</p>' +
            '<p id="ctpMsg" class="note" role="status" aria-live="polite"></p><div class="ctp-scroll"><table class="ct-detail-table" id="ctpTable"></table></div>' +
            '<div id="ctpDetail" hidden><h3 id="ctpTitle"></h3><div id="ctpStats" class="ct-sum"></div><div id="ctpChart"></div><div class="ctp-scroll"><table class="ct-detail-table" id="ctpLeds"></table></div></div>' +
            '<div class="ct-row"><button id="ctpCsv" class="good">📥 플랑크 결과 CSV</button><button id="ctpCsvGroup" class="secondary" hidden>📥 이 조만 CSV</button></div>';
        var pct = function (x) { return (x > 0 ? '+' : '') + x.toFixed(1) + ' %'; };
        var when = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
        function render() {
            var s = st.sum || [];
            $('ctpTable').innerHTML = '<tr><th>조</th><th>LED</th><th>조 h 전류 기준 (×10⁻³⁴)</th><th>오차</th><th>빛 기준 h</th><th>기기</th><th>마지막</th></tr>' +
                (s.length ? s.map(function (g) {
                    return '<tr class="ctp-row" tabindex="0" data-code="' + esc(g.code) + '"><td><b>' + esc(g.jo) + '조</b></td><td>' + g.leds.length + '</td>' +
                        '<td>' + (g.fit ? h34(g.fit).toFixed(2) : '–') + '</td><td>' + (g.fit ? pct(g.fit.errorPct) : '–') + '</td>' +
                        '<td>' + (g.fitGlow ? h34(g.fitGlow).toFixed(2) : '–') + '</td><td>' + g.devices + '</td><td>' + esc(when(g.last)) + '</td></tr>';
                }).join('') : '<tr><td colspan="7">아직 보낸 LED 가 없어요.</td></tr>');
            var g = s.filter(function (x) { return x.code === st.pick; })[0];
            $('ctpDetail').hidden = !g; $('ctpCsvGroup').hidden = !g;
            if (!g) return;
            $('ctpTitle').textContent = g.jo + '조 (' + g.code + ')';
            var stat = function (k, v) { return '<div>' + k + '<b>' + v + '</b></div>'; };
            $('ctpStats').innerHTML = stat('LED (문턱 전압 있음)', g.leds.length + ' (' + g.leds.filter(function (l) { return l.v0 != null; }).length + ')') +
                stat('조 h 전류 기준', g.fit ? h34(g.fit).toFixed(2) + ' ×10⁻³⁴' : '파장이 다른 LED 2개 이상 필요') +
                stat('오차', g.fit ? pct(g.fit.errorPct) + (g.fit.sH != null ? ' (± ' + (g.fit.sH / 1e-34).toFixed(2) + ')' : '') : '–') +
                stat('조 h 빛 기준', g.fitGlow ? h34(g.fitGlow).toFixed(2) + ' (' + pct(g.fitGlow.errorPct) + ')' : '–');
            $('ctpChart').innerHTML = chartSvg(g);
            $('ctpLeds').innerHTML = '<tr><th>LED</th><th>λ (nm)</th><th>V₀ 전류 (V)</th><th>V₀ 빛 (V)</th><th>점</th><th>학생 h</th><th>보낸 기기</th></tr>' + g.leds.map(function (l) {
                return '<tr><td><span class="ctp-dot" style="background:' + P.wavelengthColor(l.lambda) + '"></span> ' + esc(l.led) + '</td><td>' + esc(l.lambda) + '</td>' +
                    '<td' + (l.v0note ? ' title="' + esc(l.v0note) + '"' : '') + '>' + (l.v0 != null ? l.v0.toFixed(3) : '–') + (l.differs ? ' ⚠' : '') + '</td>' +
                    '<td>' + (l.v0glow != null ? l.v0glow.toFixed(3) : '–') + '</td><td>' + l.nIV + (l.nGlow ? ' + ' + l.nGlow : '') + '</td>' +
                    '<td>' + (l.hStudent != null ? l.hStudent.toFixed(2) : '–') + '</td><td>' + esc(l.device.slice(-4).toUpperCase()) + '</td></tr>';
            }).join('');
        }
        async function load() {
            if (!st.cls) return;
            $('ctpMsg').className = 'note'; $('ctpMsg').textContent = '⏳ 불러오는 중…';
            var r = await window.ClassCloud.classExport(st.cls.space);
            if (!r.ok) { $('ctpMsg').className = 'note err'; $('ctpMsg').textContent = '⚠️ ' + r.error; return; }
            st.sum = summarize(r.items, st.cls.groups);
            $('ctpMsg').textContent = 'LED ' + st.sum.reduce(function (n, g) { return n + g.leds.length; }, 0) + '줄 · ' + new Date().toLocaleTimeString('ko-KR') + ' 에 불러옴';
            render();
        }
        function download(name, text) {
            var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name;
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        }
        $('ctpReload').addEventListener('click', load);
        $('ctpTable').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-code]'); if (tr) { st.pick = tr.dataset.code === st.pick ? '' : tr.dataset.code; render(); } });
        $('ctpTable').addEventListener('keydown', function (e) { var tr = e.target.closest('tr[data-code]'); if (tr && e.key === 'Enter') { st.pick = tr.dataset.code; render(); } });
        $('ctpCsv').addEventListener('click', function () { if (st.sum) download('플랑크상수_수업' + st.cls.classCode + '.csv', toCsv(st.sum)); });
        $('ctpCsvGroup').addEventListener('click', function () { if (st.sum && st.pick) download('플랑크상수_' + st.pick + '조.csv', toCsv(st.sum, st.pick)); });
        window.addEventListener('ct-watch', function (e) {
            var c = e.detail && e.detail.cls;
            var on = !!(c && c.exp === 'planck');
            card.hidden = !on;
            if (!on) { st.cls = null; return; }
            if (!st.cls || st.cls.space !== c.space) { st.cls = c; st.sum = null; st.pick = ''; render(); load(); }
        });
    }
    if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }

    return { ledOf: ledOf, summarize: summarize, toCsv: toCsv, chartSvg: chartSvg };
});
