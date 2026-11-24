/* 교사 화면 — 🧩 모아 보기 (2026-11-22, 선생님이 고른 "교사 화면 '모아 보기'", 과학교육학 교수 세션 공통 원칙 6)
   조별 🔮 예상 방향·까닭, 💭 우리 생각, ✍️ 결론 주장(보고서 항목) + 실험이 보내는 요약 숫자(summary)를 한 화면에 모아 프로젝터로 띄운다.
   - 같은 예상끼리 묶어 '예상과 다른 조'를 고르기 쉽게, 결과 방향([결과])을 고른 조는 ✅/🤔
   - 숫자 하나를 고르면 조별 점 그래프(평균선)
   - 프로젝터 화면에는 아직 못 한 조의 번호를 띄우지 않음(수만 '아직 3조'). 어느 조인지는 교사 노트북의 '🔧 선생님용' 접기에만. 학생 이름·번호는 없음
   - 읽기: 교사 진행 화면이 이미 받은 classStatus(요약 숫자)를 'ct-watch' 이벤트로 받아 다시 쓰고, 보고서(reportList)는 모아 보기를 열 때·🔄 누를 때만 읽음
   - 받은 글은 학생이 쓴 것 → 모두 esc()
   계산은 브라우저·Node 공용(시험 tests/class-teacher-gather.test.cjs). */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ClassTeacherGather = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
    // 변인 카드 글(js/report-ai.js serializeVars 와 같은 모양: 줄마다 '[바꿀 것] …')
    function parseTags(text) {
        var o = { change: '', predict: '', reason: '', observed: '', rest: '' }, rest = [];
        var map = { '바꿀 것': 'change', '예상': 'predict', '까닭': 'reason', '결과': 'observed' };
        String(text || '').split('\n').forEach(function (line) {
            var m = /^\[([^\]]+)\] ?(.*)$/.exec(line);
            if (m && map[m[1].trim()]) o[map[m[1].trim()]] = m[2].trim();
            else if (m && m[1].trim() === '바꿀 값' && m[2].trim()) o.plan = m[2].trim();
            else if (!m) rest.push(line);
        });
        o.rest = rest.join(' ').trim();
        return o;
    }
    // 결론 주장: 7단계 '결론 및 검토'(conclusion) 또는 가설연역 '결론·가설 판정'(verdict). 판정 줄은 따로
    function claimOf(sections) {
        var v = String(sections.verdict || ''), c = String(sections.conclusion || '');
        var m = /^\[판정\] ?([^\n]*)\n?/.exec(v), verdict = m ? m[1].trim() : '';
        var body = (m ? v.slice(m[0].length) : v).trim() || c.trim();
        var first = body.split(/\n|(?<=[.!?。])\s/)[0] || '';
        return { verdict: verdict, text: clip(first, 140) };
    }
    // 요약 숫자: 공용 summary, 진자 {L, T}, 플랑크 조 h
    function numsOf(sub, exp) {
        var out = {};
        if (!sub) return out;
        if (exp === 'planck') { if (sub.hCurrent !== '' && sub.hCurrent != null && isFinite(Number(sub.hCurrent))) out['h (×10⁻³⁴ J·s)'] = Number(sub.hCurrent); return out; }
        var s = sub.summary || {};
        Object.keys(s).forEach(function (k) { var v = Number(s[k]); if (s[k] !== '' && s[k] != null && isFinite(v)) out[k] = v; });
        return out;
    }
    function sameDir(a, b) { return !!(a && b && a === b); }
    /* status = classStatus 응답({ groups, submissions }), reports = reportList 의 reports → 조별 모음
       { rows: [{ jo, code, think, change, plan, predict, reason, observed, match, claim, verdict, nums, joined }], keys, predicts: [{ label, jos }], missing: { think, predict, claim }, total } */
    function gather(status, reports, exp) {
        var groups = (status && status.groups) || [], subs = {};
        ((status && status.submissions) || []).forEach(function (s) { if (s) subs[s.code] = s; });
        var by = {};
        groups.forEach(function (g) { by[g.code] = { jo: Number(g.jo) || 0, code: g.code, think: '', change: '', plan: '', predict: '', reason: '', observed: '', claim: '', verdict: '', at: {}, nums: numsOf(subs[g.code], exp) }; });
        // 같은 조의 노트북 여러 대: 항목마다 가장 나중에 고친 빈칸 아닌 것
        (reports || []).slice().sort(function (a, b) { return String(a.updatedAt).localeCompare(String(b.updatedAt)); }).forEach(function (r) {
            var g = by[r.group]; if (!g) return;
            var sec = r.sections || {}, t = parseTags(sec.design), cl = claimOf(sec);
            if (String(sec.problem || '').trim()) g.think = clip(sec.problem, 140);
            if (t.change) g.change = t.change;
            if (t.plan) g.plan = clip(t.plan, 60);
            if (t.predict) g.predict = t.predict;
            if (t.reason) g.reason = clip(t.reason, 100);
            if (t.observed) g.observed = t.observed;
            if (cl.text) g.claim = cl.text;
            if (cl.verdict) g.verdict = cl.verdict;
        });
        var rows = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.jo - b.jo; });
        rows.forEach(function (g) { delete g.at; g.match = g.predict && g.observed && !/모르|어려/.test(g.predict + g.observed) ? (sameDir(g.predict, g.observed) ? 'same' : 'diff') : ''; });
        var keys = [];
        rows.forEach(function (g) { Object.keys(g.nums).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
        var plist = [];
        rows.forEach(function (g) {
            if (!g.predict) return;
            var label = (g.change ? g.change + ' ↑ → ' : '') + g.predict, p = plist.filter(function (x) { return x.label === label; })[0];
            if (!p) plist.push(p = { label: label, predict: g.predict, jos: [] });
            p.jos.push(g.jo);
        });
        plist.sort(function (a, b) { return b.jos.length - a.jos.length; });
        return {
            rows: rows, keys: keys, predicts: plist, total: rows.length,
            missing: { think: rows.filter(function (g) { return !g.think; }).map(function (g) { return g.jo; }), predict: rows.filter(function (g) { return !g.predict; }).map(function (g) { return g.jo; }), claim: rows.filter(function (g) { return !g.claim; }).map(function (g) { return g.jo; }) }
        };
    }
    // 조별 점 그래프 (가로 = 값, 세로 = 조), 평균선 하나. 점이 없으면 빈 글
    function dotSvg(rows, key) {
        var pts = rows.filter(function (g) { return g.nums[key] != null; }).map(function (g) { return { jo: g.jo, v: g.nums[key] }; });
        if (!pts.length) return '';
        var lo = Math.min.apply(null, pts.map(function (p) { return p.v; })), hi = Math.max.apply(null, pts.map(function (p) { return p.v; }));
        if (hi === lo) { var d = Math.abs(hi) * 0.1 || 1; lo -= d; hi += d; } else { var pad = (hi - lo) * 0.12; lo -= pad; hi += pad; }
        var W = 800, rowH = 34, top = 20, H = top + pts.length * rowH + 40, L = 70, R = 30;
        var x = function (v) { return L + (v - lo) / (hi - lo) * (W - L - R); };
        var mean = pts.reduce(function (s, p) { return s + p.v; }, 0) / pts.length;
        var fmt = function (v) { var a = Math.abs(v); return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toPrecision(2); };
        var s = '<svg class="ctg-dots" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(key) + ' 조별 점 그래프">';
        s += '<line x1="' + L + '" y1="' + (H - 30) + '" x2="' + (W - R) + '" y2="' + (H - 30) + '" stroke="#888"/>';
        [lo, hi].forEach(function (t) { s += '<text x="' + x(t) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="16" fill="#555">' + esc(fmt(t)) + '</text>'; });
        s += '<line x1="' + x(mean) + '" y1="' + (top - 8) + '" x2="' + x(mean) + '" y2="' + (H - 30) + '" stroke="#1565c0" stroke-dasharray="6 5"/>' +
            '<text x="' + x(mean) + '" y="' + (top - 10 < 12 ? 12 : top - 10) + '" text-anchor="middle" font-size="15" fill="#1565c0">평균 ' + esc(fmt(mean)) + '</text>';
        pts.forEach(function (p, i) {
            var y = top + 10 + i * rowH;
            s += '<text x="' + (L - 12) + '" y="' + (y + 6) + '" text-anchor="end" font-size="17" fill="#222">' + esc(p.jo) + '조</text>' +
                '<circle cx="' + x(p.v) + '" cy="' + y + '" r="9" fill="#c2185b"/>' +
                '<text x="' + (x(p.v) + 14) + '" y="' + (y + 6) + '" font-size="16" fill="#222">' + esc(fmt(p.v)) + '</text>';
        });
        return s + '</svg>';
    }
    var TABS = [['predict', '🔮 예상'], ['think', '💭 우리 생각'], ['claim', '✍️ 결론 주장'], ['nums', '📊 숫자']];
    // 프로젝터 화면 한 판 (탭 하나) — 못 한 조는 수만
    function boardHtml(G, tab, key) {
        var waitLine = function (n, what) { return n ? '<p class="ctg-wait">아직 ' + n + '개 조가 ' + what + '</p>' : ''; };   // 어느 조인지는 쓰지 않음(교사 노트북 접기에만)
        if (tab === 'think') {
            var t = G.rows.filter(function (g) { return g.think; });
            return (t.length ? '<ul class="ctg-list">' + t.map(function (g) { return '<li><b>' + esc(g.jo) + '조</b> ' + esc(g.think) + '</li>'; }).join('') + '</ul>' : '<p class="ctg-empty">아직 우리 생각을 쓴 조가 없어요.</p>') + waitLine(G.missing.think.length, '쓰는 중이에요');
        }
        if (tab === 'claim') {
            var c = G.rows.filter(function (g) { return g.claim; });
            return (c.length ? '<ul class="ctg-list">' + c.map(function (g) { return '<li><b>' + esc(g.jo) + '조</b> ' + (g.verdict ? '<span class="ctg-tag">' + esc(g.verdict) + '</span> ' : '') + esc(g.claim) + '</li>'; }).join('') + '</ul>' : '<p class="ctg-empty">아직 결론 주장을 쓴 조가 없어요.</p>') + waitLine(G.missing.claim.length, '쓰는 중이에요');
        }
        if (tab === 'nums') {
            if (!G.keys.length) return '<p class="ctg-empty">아직 보낸 측정 요약이 없어요.</p>';
            var k = G.keys.indexOf(key) >= 0 ? key : G.keys[0];
            var n = G.rows.filter(function (g) { return g.nums[k] != null; }).length;
            return '<div class="ctg-keys" role="group" aria-label="볼 숫자">' + G.keys.map(function (x) { return '<button type="button" data-key="' + esc(x) + '" aria-pressed="' + (x === k) + '">' + esc(x) + '</button>'; }).join('') + '</div>' +
                dotSvg(G.rows, k) + waitLine(G.total - n, '보내는 중이에요');
        }
        // 🔮 예상: 같은 예상끼리 묶음, 결과 방향을 고른 조는 ✅/🤔
        if (!G.predicts.length) return '<p class="ctg-empty">아직 예상을 고른 조가 없어요.</p>' + waitLine(G.missing.predict.length, '고르는 중이에요');
        var byJo = {}; G.rows.forEach(function (g) { byJo[g.jo] = g; });
        return '<div class="ctg-groups">' + G.predicts.map(function (p) {
            return '<section class="ctg-pred"><h3>🔮 ' + esc(p.label) + ' <span class="ctg-n">· ' + p.jos.length + '개 조</span></h3><ul>' + p.jos.map(function (jo) {
                var g = byJo[jo];
                return '<li><b>' + esc(jo) + '조</b>' + (g.plan ? ' <span class="ctg-tag">' + esc(g.plan) + '</span>' : '') + (g.match === 'same' ? ' <span class="ctg-ok" title="결과도 같은 방향">✅ 결과 ' + esc(g.observed) + '</span>' : g.match === 'diff' ? ' <span class="ctg-diff" title="결과가 예상과 다름">🤔 결과 ' + esc(g.observed) + '</span>' : '') +
                    (g.reason ? '<br><span class="ctg-why">까닭: ' + esc(g.reason) + '</span>' : '') + '</li>';
            }).join('') + '</ul></section>';
        }).join('') + '</div>' + waitLine(G.missing.predict.length, '고르는 중이에요');
    }
    // 교사 노트북 전용: 어느 조가 아직인지 (프로젝터 화면에는 넣지 않음)
    function teacherHtml(G) {
        var line = function (label, a) { return '<li>' + label + ': ' + (a.length ? a.map(function (j) { return esc(j) + '조'; }).join(', ') : '모두 했어요') + '</li>'; };
        return '<ul class="ctg-teach">' + line('🔮 예상 안 고른 조', G.missing.predict) + line('💭 우리 생각 안 쓴 조', G.missing.think) + line('✍️ 결론 주장 안 쓴 조', G.missing.claim) + '</ul>';
    }

    function mount() {
        var card = document.getElementById('gatherCard'), big = document.getElementById('gatherBig');
        if (!card || !big) return;
        var $ = function (id) { return document.getElementById(id); };
        var st = { cls: null, status: null, reports: null, tab: 'predict', key: '', loadedAt: '' };
        card.innerHTML = '<div class="ct-row"><h2 style="margin:0">🧩 모아 보기</h2><button id="btnGather" class="good">🖥 모아 보기 (프로젝터)</button></div>' +
            '<p class="note">조별 예상·까닭, 우리 생각, 결론 주장, 보낸 숫자를 한 화면에 모아요. 같은 예상끼리 묶여 있어 "예상과 다른 조"를 골라 물어보기 좋아요.</p>' +
            '<details class="ct-teach" id="gatherTeach"><summary>🔧 선생님용: 아직 못 한 조 (프로젝터에는 수만 나와요)</summary><div id="gatherTeachBody" class="note">모아 보기를 한 번 열면 보여요.</div></details>';
        big.innerHTML = '<div class="ct-row ctg-head"><h2>🧩 모아 보기</h2><div class="subtabs ctg-tabs" role="tablist">' +
            TABS.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
            '<button id="btnGatherReload" class="secondary">🔄</button><button id="btnGatherClose">닫기</button></div>' +
            '<p id="gatherMsg" class="note" role="status" aria-live="polite"></p><div id="gatherBody" class="ctg-body"></div>';
        function G() { return gather(st.status, st.reports || [], st.cls ? st.cls.exp : ''); }
        function render() {
            var g = G();
            big.querySelectorAll('.ctg-tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === st.tab ? 'true' : 'false'); });
            $('gatherBody').innerHTML = boardHtml(g, st.tab, st.key);
            $('gatherTeachBody').innerHTML = teacherHtml(g);
        }
        async function load() {
            if (!st.cls || !window.LabStore) return;
            $('gatherMsg').textContent = '⏳ 불러오는 중…';
            var r = await window.LabStore.call('lab:' + st.cls.space, { action: 'reportList' });
            if (!r || !r.ok) { $('gatherMsg').textContent = '⚠️ ' + ((r && r.error) || '불러오지 못했어요'); return; }
            st.reports = r.reports || [];
            $('gatherMsg').textContent = '🕘 ' + new Date().toLocaleTimeString('ko-KR') + ' 에 모음 · 🔄 로 다시';
            render();
        }
        $('btnGather').addEventListener('click', function () { big.hidden = false; render(); load(); $('btnGatherClose').focus(); });
        $('btnGatherClose').addEventListener('click', function () { big.hidden = true; });
        $('btnGatherReload').addEventListener('click', load);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !big.hidden) big.hidden = true; });
        big.addEventListener('click', function (e) {
            var t = e.target.closest('.ctg-tabs button[data-tab]'); if (t) { st.tab = t.dataset.tab; render(); return; }
            var k = e.target.closest('.ctg-keys button[data-key]'); if (k) { st.key = k.dataset.key; render(); }
        });
        // 교사 화면(js/class-teacher.js)이 진행 자료를 받을 때마다: 지금 수업·classStatus 를 그대로 받아 씀(따로 읽지 않음)
        window.addEventListener('ct-watch', function (e) {
            var c = e.detail && e.detail.cls;
            card.hidden = !c || c.mode === 'team';   // 가족 행사(팀)는 🏆 결과판·💬 이 맡음
            if (!c) return;
            if (!st.cls || st.cls.space !== c.space) { st.cls = c; st.reports = null; st.key = ''; big.hidden = true; }
            if (e.detail.status) st.status = e.detail.status;
            if (!big.hidden) render();
        });
    }
    if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }

    return { parseTags: parseTags, claimOf: claimOf, numsOf: numsOf, gather: gather, dotSvg: dotSvg, boardHtml: boardHtml, teacherHtml: teacherHtml, esc: esc };
});
