/* 🎬 발표 보기의 '수업 설명 화면' 공통 부품 (2026-11-21 선생님 "교사가 프로젝트에 띄우게 될 화면에 내용이 있어야 수업할 때 설명하면서 할 수 있을거 같아")
   - 실험별 내용 파일 js/lesson-content/<exp>.js 가 LessonContent.add(exp, { title, stages: { 단계 키: [장, …] } }) 로 넣는다
   - 장 = { kind: 'why'|'concept'|'vars'|'how'|'ask'|'safety', title, body(HTML, 저장소 글만), ask, reveal, img, note, vars }
     · ask(물음)를 먼저 보이고, 다음 키를 눌러야 reveal(풀이)이 열림 (답이 먼저 보이지 않게)
     · note(선생님 말할 거리)는 '🔧 선생님용' 접기
     · kind 'vars' 는 vars: { change, keep: [], measure, predict } 를 표로
   - 화면에 붙이는 곳은 js/class-teacher.js 의 발표 보기. 학생 폰·노트북 화면에는 쓰지 않는다.
   - 브라우저·Node 공용 (Node 시험은 LessonSlides.check 로 내용 파일 모양을 검사) */
(function (root, factory) {
    var o = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = o;
    else { root.LessonContent = o.LessonContent; root.LessonSlides = o.LessonSlides; }
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';
    var KINDS = {
        why: '🤔 왜 할까요?',
        concept: '💡 개념 풀이',
        vars: '⚖️ 한 가지만 바꾸기 (변인 통제)',
        how: '🛠 이렇게 해요',
        ask: '❓ 생각해 봐요',
        safety: '🦺 안전 약속'
    };
    var prev = root && root.LessonContent, DB = (prev && prev._db) || {};
    // 내용 파일이 이 부품보다 먼저 불렸으면 window.LessonContent = { _wait: {}, add } 대기열에 있음 → 가져옴
    if (prev && prev._wait) Object.keys(prev._wait).forEach(function (k) { DB[k] = prev._wait[k]; });
    var LessonContent = {
        _db: DB,
        add: function (exp, def) { DB[exp] = def; return def; },
        get: function (exp) { return DB[exp] || null; }
    };
    // 가설연역(flow 'hd') 단계 키 → 그 단계로 묶이는 7단계 패널 키 (js/class-cloud.js HD_OF 와 같음)
    var HD_OF = { purpose: 'problem', theory: 'hypothesis', materials: 'design', procedure: 'design', data: 'perform', result: 'interpret', conclusion: 'conclude' };
    var PANELS = ['purpose', 'theory', 'materials', 'procedure', 'data', 'result', 'conclusion'];
    /* 교사가 여는 단계(gate 키) 하나의 장 목록. 가설연역은 같은 패널 키 장을 단계 순서대로 이어 붙임 */
    function slidesFor(def, gateKey, flow) {
        if (!def || !def.stages || !gateKey) return [];
        var st = def.stages;
        if (st[gateKey] && !(flow === 'hd' && PANELS.indexOf(gateKey) >= 0)) return st[gateKey].slice();
        if (flow === 'hd') {
            var out = [];
            PANELS.forEach(function (p) { if (HD_OF[p] === gateKey && st[p]) out = out.concat(st[p]); });
            return out;
        }
        return [];
    }
    // 7단계 패널 키 → 교사가 여는 단계 키 (가설연역이면 묶인 단계)
    function gateOf(panel, flow) { return flow === 'hd' && HD_OF[panel] ? HD_OF[panel] : panel; }
    // 그 단계의 첫 패널 키 (발표 화면의 iframe 에서 누를 단계 단추)
    function firstPanel(gateKey, flow) {
        if (flow !== 'hd') return gateKey;
        for (var i = 0; i < PANELS.length; i++) if (HD_OF[PANELS[i]] === gateKey) return PANELS[i];
        return gateKey;
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function imgHtml(img) {
        if (!img) return '';
        var s = String(img).trim();
        if (/^<svg[\s>]/i.test(s)) return '<figure class="ls-fig">' + s + '</figure>';
        return '<figure class="ls-fig"><img src="' + esc(s) + '" alt=""></figure>';
    }
    function varsHtml(v) {
        if (!v) return '';
        var row = function (ic, k, val) { return '<tr><th scope="row">' + ic + ' ' + k + '</th><td>' + val + '</td></tr>'; };
        return '<table class="ls-vars"><tbody>' +
            (v.change ? row('🔧', '바꿀 것 <small>(하나만)</small>', v.change) : '') +
            (v.keep && v.keep.length ? row('🔒', '같게 할 것', v.keep.join(' · ')) : '') +
            (v.measure ? row('📏', '잴 것', v.measure) : '') +
            '</tbody></table>' +
            (v.predict ? '<p class="ls-ask">🔮 ' + v.predict + '</p>' : '');
    }
    /* 장 하나 그리기. revealed: 풀이까지 보임. pos: { i, n, stageName } */
    function render(slide, revealed, pos) {
        pos = pos || {};
        var k = KINDS[slide.kind] ? slide.kind : 'concept';
        var hasReveal = !!slide.reveal;
        var text = (slide.body ? '<div class="ls-body">' + slide.body + '</div>' : '') +
            (k === 'vars' ? varsHtml(slide.vars) : '') +
            (slide.ask ? '<p class="ls-ask">❓ ' + slide.ask + '</p>' : '') +
            // 풀이는 열기 전에는 화면(문서)에 넣지 않음 — 답이 먼저 보이지 않게
            (hasReveal ? (revealed ? '<div class="ls-reveal">' + slide.reveal + '</div>' : '<p class="ls-wait">→ 이야기를 나눈 뒤 넘기면 풀이가 나와요</p>') : '');
        var dots = '';
        for (var i = 0; i < (pos.n || 0); i++) dots += '<i' + (i === pos.i ? ' class="on"' : '') + '></i>';
        return '<article class="ls-slide ls-k-' + k + (slide.img ? ' has-img' : '') + '" data-kind="' + k + '"' + (hasReveal ? ' data-revealed="' + (revealed ? '1' : '0') + '"' : '') + '>' +
            '<p class="ls-kicker">' + KINDS[k] + (pos.stageName ? ' <span>· ' + esc(pos.stageName) + '</span>' : '') + '</p>' +
            '<h2 class="ls-title">' + (slide.title || '') + '</h2>' +
            '<div class="ls-main"><div class="ls-text">' + text + '</div>' + imgHtml(slide.img) + '</div>' +
            '<footer class="ls-foot"><span class="ls-dots" aria-label="' + ((pos.i || 0) + 1) + ' / ' + (pos.n || 1) + '">' + dots + '</span>' +
            (slide.note ? '<details class="ct-teach ls-note"><summary>🔧 선생님용</summary><div>' + slide.note + '</div></details>' : '') + '</footer>' +
            '</article>';
    }
    /* 넘치면 글자를 조금씩 줄여 한 화면에 (4K·작은 노트북 모두). box 의 --ls-scale 을 바꿈 */
    function fit(box) {
        if (!box || !box.style) return 1;
        var s = 1, el = box.querySelector('.ls-slide');
        box.style.setProperty('--ls-scale', '1');
        for (var k = 0; k < 14 && el && el.scrollHeight > el.clientHeight + 1; k++) {
            s = Math.round(s * 0.92 * 1000) / 1000;
            box.style.setProperty('--ls-scale', String(s));
        }
        return s;
    }
    /* 내용 파일 검사 (시험용): 문제 목록을 돌려줌 */
    function check(exp, def) {
        var bad = [];
        if (!/^[a-z0-9]+$/.test(String(exp || ''))) bad.push(exp + ': 실험 키는 영어 소문자·숫자');
        if (!def || typeof def.title !== 'string' || !def.title) bad.push(exp + ': title 없음');
        if (!def || !def.stages || typeof def.stages !== 'object') { bad.push(exp + ': stages 없음'); return bad; }
        Object.keys(def.stages).forEach(function (sk) {
            var list = def.stages[sk];
            if (!Array.isArray(list) || !list.length) { bad.push(exp + '.' + sk + ': 장 목록이 비었어요'); return; }
            list.forEach(function (s, i) {
                var at = exp + '.' + sk + '[' + i + ']';
                if (!s || !KINDS[s.kind]) bad.push(at + ': kind 는 ' + Object.keys(KINDS).join('·'));
                if (!s || typeof s.title !== 'string' || !s.title.trim()) bad.push(at + ': title 없음');
                if (s && !s.body && !s.ask && !s.vars) bad.push(at + ': body·ask·vars 중 하나는 있어야 해요');
                if (s && s.reveal && !s.ask) bad.push(at + ': reveal 은 ask 와 함께');
                if (s && s.kind === 'vars' && !(s.vars && s.vars.change && s.vars.measure && Array.isArray(s.vars.keep) && s.vars.keep.length)) bad.push(at + ': vars 는 change·keep[]·measure');
                ['title', 'body', 'ask', 'reveal', 'note', 'img'].forEach(function (f) {
                    if (s && s[f] != null && typeof s[f] !== 'string') bad.push(at + ': ' + f + ' 는 글');
                    if (s && typeof s[f] === 'string' && /<script|\son\w+\s*=|javascript:/i.test(s[f])) bad.push(at + ': ' + f + ' 에 스크립트');
                });
            });
        });
        return bad;
    }
    // 내용 파일 불러오기 (없으면 null, 아무것도 깨지지 않게)
    var loading = {};
    function load(exp, base) {
        if (!/^[a-z0-9]+$/.test(String(exp || '')) || typeof document === 'undefined') return Promise.resolve(null);
        if (DB[exp]) return Promise.resolve(DB[exp]);
        if (loading[exp]) return loading[exp];
        loading[exp] = new Promise(function (res) {
            var sc = document.createElement('script');
            sc.src = (base || '../js/lesson-content/') + exp + '.js';
            sc.onload = function () { res(DB[exp] || null); };
            sc.onerror = function () { delete loading[exp]; res(null); };
            document.head.appendChild(sc);
        });
        return loading[exp];
    }
    var LessonSlides = { KINDS: KINDS, slidesFor: slidesFor, gateOf: gateOf, firstPanel: firstPanel, render: render, fit: fit, check: check, load: load };
    return { LessonContent: LessonContent, LessonSlides: LessonSlides };
});
