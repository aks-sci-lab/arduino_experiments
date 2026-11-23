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
    /* 📱 응답 물음의 고를 답·모인 답 (③). answers: 교사 화면이 받은 답 목록 [{ jo, num, seat, choice, text }] 또는 null(아직)
       프로젝터에는 수·글만, 어느 조가 무엇을 골랐는지는 '🔧 선생님용' 접기. 정답 ✅ 는 풀이를 연 뒤에만. 받은 글은 모두 esc */
    var ABC = 'ABCDEF';
    function respHtml(slide, answers, revealed) {
        var r = slide && slide.resp; if (!r) return '';
        var list = Array.isArray(answers) ? answers : [], n = list.length, h = '<div class="ls-resp" data-type="' + r.type + '">';
        if (r.type === 'pick') {
            var cnt = r.choices.map(function () { return 0; });
            list.forEach(function (a) { if (a.choice >= 0 && a.choice < cnt.length) cnt[a.choice]++; });
            var max = Math.max.apply(null, cnt.concat([1]));
            h += '<ol class="ls-choices">' + r.choices.map(function (c, i) {
                var ok = revealed && r.answer === i;
                return '<li' + (ok ? ' class="ok"' : '') + '><span class="ls-abc">' + ABC[i] + '</span><span class="ls-ctext">' + esc(c) + (ok ? ' ✅' : '') + '</span>' +
                    (answers ? '<span class="ls-bar" style="--w:' + Math.round(cnt[i] / max * 100) + '%"></span><b class="ls-cnt">' + cnt[i] + '</b>' : '') + '</li>';
            }).join('') + '</ol>';
        } else if (answers) {
            h += n ? '<ul class="ls-texts">' + list.slice(-30).map(function (a) { return '<li>' + esc(a.text) + '</li>'; }).join('') + '</ul>' : '';
        }
        h += '<p class="ls-rnote">📱 폰·노트북에서 답해요' + (answers ? ' · 답한 기기 <b>' + n + '</b>' : '') + '</p>';
        if (answers && n) {
            h += '<details class="ct-teach ls-who"><summary>🔧 선생님용: 조별 답</summary><div>' + list.map(function (a) {
                return '<span>' + a.jo + '조 ' + a.num + '번' + (/-p$/.test(a.seat || '') ? '📱' : '') + ': ' + (r.type === 'pick' ? (ABC[a.choice] || '?') : esc(a.text)) + '</span>';
            }).join(' · ') + '</div></details>';
        }
        return h + '</div>';
    }
    /* 장 하나 그리기. revealed: 풀이까지 보임. pos: { i, n, stageName } */
    function render(slide, revealed, pos) {
        pos = pos || {};
        var k = KINDS[slide.kind] ? slide.kind : 'concept';
        var hasReveal = !!slide.reveal;
        var text = (slide.body ? '<div class="ls-body">' + slide.body + '</div>' : '') +
            (k === 'vars' ? varsHtml(slide.vars) : '') +
            (slide.ask ? '<p class="ls-ask">❓ ' + slide.ask + '</p>' : '') +
            (slide.resp ? respHtml(slide, pos.answers || null, revealed) : '') +
            // 풀이는 열기 전에는 화면(문서)에 넣지 않음 — 답이 먼저 보이지 않게
            (hasReveal ? (revealed ? '<div class="ls-reveal">' + slide.reveal + '</div>' : '<p class="ls-wait">→ 이야기를 나눈 뒤 넘기면 풀이가 나와요</p>') : '');
        var dots = '';
        for (var i = 0; i < (pos.n || 0); i++) dots += '<i' + (i === pos.i ? ' class="on"' : '') + '></i>';
        return '<article class="ls-slide ls-k-' + k + (slide.img || (revealed && slide.revealImg) ? ' has-img' : '') + '" data-kind="' + k + '"' + (hasReveal ? ' data-revealed="' + (revealed ? '1' : '0') + '"' : '') + '>' +
            '<p class="ls-kicker">' + KINDS[k] + (pos.stageName ? ' <span>· ' + esc(pos.stageName) + '</span>' : '') + '</p>' +
            '<h2 class="ls-title">' + (slide.title || '') + '</h2>' +
            // revealImg: 답을 보여 주는 그림은 풀이를 연 뒤에만 (없으면 img)
            '<div class="ls-main"><div class="ls-text">' + text + '</div>' + imgHtml(revealed && slide.revealImg ? slide.revealImg : slide.img) + '</div>' +
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
        var seenKey = {};
        Object.keys(def.stages).forEach(function (sk) {
            var list = def.stages[sk];
            if (!Array.isArray(list) || !list.length) { bad.push(exp + '.' + sk + ': 장 목록이 비었어요'); return; }
            list.forEach(function (s, i) {
                var at = exp + '.' + sk + '[' + i + ']';
                if (!s || !KINDS[s.kind]) bad.push(at + ': kind 는 ' + Object.keys(KINDS).join('·'));
                if (!s || typeof s.title !== 'string' || !s.title.trim()) bad.push(at + ': title 없음');
                if (s && !s.body && !s.ask && !s.vars) bad.push(at + ': body·ask·vars 중 하나는 있어야 해요');
                if (s && s.reveal && !s.ask) bad.push(at + ': reveal 은 ask 와 함께');
                // key: 그 장의 풀이가 학생 화면 어느 답([data-lesson-answer])과 짝인지 (영어 소문자·숫자·-, 한 실험 안에서 하나씩)
                if (s && s.key != null) {
                    if (typeof s.key !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(s.key)) bad.push(at + ': key 는 영어 소문자·숫자·- (40자까지)');
                    else if (seenKey[s.key]) bad.push(at + ': key ' + s.key + ' 가 ' + seenKey[s.key] + ' 와 겹쳐요');
                    else seenKey[s.key] = at;
                }
                if (s && s.kind === 'vars' && !(s.vars && s.vars.change && s.vars.measure && Array.isArray(s.vars.keep) && s.vars.keep.length)) bad.push(at + ': vars 는 change·keep[]·measure');
                                if (s && s.revealImg && !s.reveal) bad.push(at + ': revealImg 는 reveal 과 함께');
                // mode: 이 장을 띄울 때 학생 폰 띠 ('look' 👀 앞 화면을 봐요 · 'phone' ✍️ 내 화면에서 해요)
                if (s && s.mode != null && s.mode !== 'look' && s.mode !== 'phone') bad.push(at + ": mode 는 'look' 또는 'phone'");
                ['title', 'body', 'ask', 'reveal', 'note', 'img', 'revealImg'].forEach(function (f) {
                    if (s && s[f] != null && typeof s[f] !== 'string') bad.push(at + ': ' + f + ' 는 글');
                    if (s && typeof s[f] === 'string' && /<script|\son\w+\s*=|javascript:/i.test(s[f])) bad.push(at + ': ' + f + ' 에 스크립트');
                });
            });
        });
        return bad;
    }
    /* ---------- 📖 선생님이 고친 수업 자료 (2026-11-23 선생님 "수업 자료는 내가 편집할 수 있게 편집모드도", 편집 화면 projects/lesson-editor.html) ----------
       교사 구글 계정에 실험마다 하나 (Firestore lessonEdits/{uid}/exps/{exp}, js/lab-store.js lessonEdit…). 모양:
         { v: 1, exp, stages: { 단계 키: [항목, …] } }
         항목 = 기본 장 { ref: 'k:<key>' | 's:<단계>:<순서>', of: 원래 제목(글만), hide: true(숨김), set: { title, body, ask, reveal, note, vars } }
              | 새 장   { add: 'my-…'(새 key), kind, title, body, ask, reveal, note, vars }
       · 기본 장의 key 는 그대로 (학생 화면 답 가리기·로켓 응답이 key 에 묶임), 새 장은 'my-' 로 시작하는 새 key
       · 고친 목록에 없는 기본 장(나중에 내용 파일에 더해진 장)은 그 단계 끝에 붙임 — 새 내용을 조용히 잃지 않게
       · 받은 글은 허용 태그만 남김(sanitize): 굵게·기울임·밑줄·목록·문단·줄바꿈·작은 글씨·첨자·표·class(영어 소문자·숫자·-)만, 나머지 태그·속성은 버림 */
    var EDIT_FIELDS = { title: 200, body: 6000, ask: 1500, reveal: 6000, note: 3000 };
    var VAR_MAX = 300, KEEP_MAX = 8;
    var ALLOW_TAGS = { p: 1, br: 1, b: 1, strong: 1, i: 1, em: 1, u: 1, ul: 1, ol: 1, li: 1, small: 1, sub: 1, sup: 1, span: 1, mark: 1, table: 1, thead: 1, tbody: 1, tr: 1, th: 1, td: 1 };
    var VOID_TAGS = { br: 1 };
    function sanitize(html, max) {
        var s = String(html == null ? '' : html);
        // 내용까지 버릴 것: 스크립트·스타일·주석 등
        s = s.replace(/<!--[\s\S]*?(-->|$)/g, '').replace(/<(script|style|iframe|object|embed|svg|math|template|textarea|select|noscript)\b[\s\S]*?(<\/\1\s*>|$)/gi, '');
        var out = '', re = /<\/?[a-zA-Z][^>]*>?/g, last = 0, m;
        function textPart(t) { return t.replace(/&(?!(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,30});)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
        while ((m = re.exec(s))) {
            out += textPart(s.slice(last, m.index));
            last = re.lastIndex;
            var t = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>?$/.exec(m[0]);
            if (!t) continue;
            var close = t[1] === '/', name = t[2].toLowerCase();
            if (name === 'div') name = 'p';   // 글 고치기 칸(contenteditable)이 줄마다 div 를 만듦
            if (!ALLOW_TAGS[name]) continue;
            if (close) { if (!VOID_TAGS[name]) out += '</' + name + '>'; continue; }
            var cls = /\sclass\s*=\s*("([^"]*)"|'([^']*)')/i.exec(t[3]), cv = cls ? (cls[2] != null ? cls[2] : cls[3]) : '';
            out += '<' + name + (cv && /^[a-z0-9 _-]{1,60}$/.test(cv) ? ' class="' + cv + '"' : '') + '>';
        }
        out += textPart(s.slice(last));
        out = out.replace(/<p>\s*(<br>)?\s*<\/p>/g, '').trim();
        if (max && out.length > max) out = out.slice(0, max).replace(/<[^>]*$/, '');
        return out;
    }
    function plain(html) { return String(html == null ? '' : html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
    function cleanResp(r) {
        if (!r || typeof r !== 'object' || (r.type !== 'pick' && r.type !== 'text')) return null;
        var o = { type: r.type };
        if (r.type === 'pick') {
            o.choices = (Array.isArray(r.choices) ? r.choices : []).map(function (c) { return plain(c).slice(0, 60); }).filter(Boolean).slice(0, 6);
            if (o.choices.length < 2) return null;
            var a = Math.round(Number(r.answer));
            o.answer = r.answer != null && r.answer !== '' && a >= 0 && a < o.choices.length ? a : -1;
        }
        return o;
    }
    // 띄울 때 학생에게 보내는 물음 (정답 빼고). 응답 장이 아니면 null
    function respQ(slide) {
        if (!slide || !slide.resp || !NEW_KEY_RE.test(String(slide.key || ''))) return null;
        var q = { type: slide.resp.type, text: (plain(slide.ask) || plain(slide.title)).slice(0, 300) };
        if (slide.resp.type === 'pick') q.choices = slide.resp.choices.slice();
        return q;
    }
    function cleanVars(v) {
        if (!v || typeof v !== 'object') return null;
        var keep = (Array.isArray(v.keep) ? v.keep : []).map(function (x) { return sanitize(x, VAR_MAX); }).filter(Boolean).slice(0, KEEP_MAX);
        return { change: sanitize(v.change, VAR_MAX), keep: keep, measure: sanitize(v.measure, VAR_MAX), predict: sanitize(v.predict, VAR_MAX) };
    }
    // 장 하나의 자리 이름 (key 가 있으면 key, 없으면 단계·순서)
    function refOf(stage, slide, i) { return slide && slide.key ? 'k:' + slide.key : 's:' + stage + ':' + i; }
    var NEW_KEY_RE = /^my-[a-z0-9-]{1,36}$/;
    /* 내가 바꾼 그림 (② 2026-11-23): 장에는 'my-img:<그림 id>' 만, 그림은 내 계정 문서 lessonEdits/{uid}/imgs/{id} 에 data URL 로
       (선생님 기기에서 긴 변 1280px·WebP/JPEG·300KB 아래로 줄여 캔버스로 다시 그린 것 — SVG·다른 주소는 받지 않음).
       그릴 때는 resolveImgs 가 data URL 로 바꿔 넣음 (못 읽은 그림은 뺌) */
    var IMG_REF_RE = /^my-img:i[a-z0-9]{15}$/, IMG_DATA_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+\/=]+$/;
    function imgIds(def) {
        var out = [];
        if (def && def.stages) Object.keys(def.stages).forEach(function (k) { def.stages[k].forEach(function (s) {
            ['img', 'revealImg'].forEach(function (f) { if (IMG_REF_RE.test(String(s[f] || ''))) { var id = s[f].slice(7); if (out.indexOf(id) < 0) out.push(id); } });
        }); });
        return out;
    }
    // map: { 그림 id: data URL } → 장의 'my-img:' 를 data URL 로 (모양이 틀리거나 없는 그림은 뺌). 장 하나에도 씀
    function imgSlide(s, map) {
        var o = s;
        ['img', 'revealImg'].forEach(function (f) {
            if (!IMG_REF_RE.test(String(s[f] || ''))) return;
            if (o === s) { o = {}; Object.keys(s).forEach(function (k) { o[k] = s[k]; }); }
            var d = map && map[s[f].slice(7)];
            if (typeof d === 'string' && IMG_DATA_RE.test(d)) o[f] = d; else delete o[f];
        });
        return o;
    }
    function resolveImgs(def, map) {
        if (!def || !def.stages) return def;
        var out = {}; Object.keys(def).forEach(function (k) { out[k] = def[k]; });
        out.stages = {};
        Object.keys(def.stages).forEach(function (k) { out.stages[k] = def.stages[k].map(function (s) { return imgSlide(s, map); }); });
        return out;
    }
    function newSlide(e) {
        if (!e || !NEW_KEY_RE.test(String(e.add || '')) || !KINDS[e.kind]) return null;
        var s = { kind: e.kind, key: e.add, title: sanitize(e.title, EDIT_FIELDS.title) || '(제목 없음)', mine: true };
        ['body', 'ask', 'reveal', 'note'].forEach(function (f) { var v = sanitize(e[f], EDIT_FIELDS[f]); if (v) s[f] = v; });
        if (!s.ask) delete s.reveal;
        ['img', 'revealImg'].forEach(function (f) { if (IMG_REF_RE.test(String(e[f] || ''))) s[f] = e[f]; });
        if (!s.reveal) delete s.revealImg;
        // 📱 응답 물음 (③): 학생 폰·노트북이 답함 → mode 'phone' (띄우면 수업 문서 lesson.q 로 물음이 감, 정답은 교사 화면에만)
        var r = cleanResp(e.resp);
        if (r) { s.resp = r; s.mode = 'phone'; if (!s.ask) s.ask = s.title; }
        if (e.kind === 'vars') { s.vars = cleanVars(e.vars); if (!s.vars || !s.vars.change) { s.kind = 'concept'; delete s.vars; } }
        if (!s.body && !s.ask && !s.vars) s.body = '';
        return s;
    }
    function mergeSlide(base, set) {
        var s = {}; Object.keys(base).forEach(function (k) { s[k] = base[k]; });
        if (!set || typeof set !== 'object') return s;
        Object.keys(EDIT_FIELDS).forEach(function (f) {
            if (typeof set[f] !== 'string') return;
            var v = sanitize(set[f], EDIT_FIELDS[f]);
            if (v) s[f] = v; else if (f !== 'title') delete s[f];
        });
        // 그림: 'my-img:<id>' (내 계정 그림 문서) 또는 '' (그림 빼기). 다른 주소는 받지 않음
        ['img', 'revealImg'].forEach(function (f) {
            if (typeof set[f] !== 'string') return;
            if (set[f] === '') delete s[f]; else if (IMG_REF_RE.test(set[f])) s[f] = set[f];
        });
        if (!s.ask) { delete s.reveal; delete s.revealImg; }
        if (set.vars && base.kind === 'vars') { var cv = cleanVars(set.vars); if (cv && cv.change) s.vars = cv; }
        s.edited = true;
        return s;
    }
    /* 기본 내용 + 고친 자료 → 단계마다 항목 목록 (편집 화면이 그대로 씀)
       항목 = { ref, base(기본 장), hide, set } | { add, kind, title, … }(새 장). stageKeys: 기본 단계 다음에 고친 자료에만 있는 단계 */
    function resolveEdit(def, edit) {
        var st = (def && def.stages) || {}, es = edit && edit.stages && typeof edit.stages === 'object' ? edit.stages : {};
        var keys = Object.keys(st), out = {};
        Object.keys(es).forEach(function (k) { if (keys.indexOf(k) < 0 && /^[a-z0-9_-]{1,20}$/.test(k)) keys.push(k); });
        keys.forEach(function (sk) {
            var base = (st[sk] || []).map(function (s, i) { return { s: s, ref: refOf(sk, s, i), t: plain(s.title), used: false }; });
            var list = es[sk], res = [];
            if (Array.isArray(list)) list.forEach(function (e) {
                if (!e || typeof e !== 'object') return;
                if (e.add) { if (NEW_KEY_RE.test(String(e.add)) && KINDS[e.kind]) res.push(copy(e)); return; }
                var of = e.of == null ? null : plain(e.of), free = base.filter(function (b) { return !b.used; });
                // 같은 자리 + 같은 제목 → 같은 제목 → (key 자리면) 같은 key — 내용 파일이 나중에 바뀌어도 되도록
                var b = free.filter(function (x) { return x.ref === e.ref && (of == null || x.t === of); })[0] ||
                        (of ? free.filter(function (x) { return x.t === of; })[0] : null) ||
                        (/^k:/.test(String(e.ref)) ? free.filter(function (x) { return x.ref === e.ref; })[0] : null);
                if (!b) return;
                b.used = true;
                res.push({ ref: b.ref, base: b.s, hide: e.hide === true, set: e.set && typeof e.set === 'object' ? copy(e.set) : {} });
            });
            base.forEach(function (b) { if (!b.used) res.push({ ref: b.ref, base: b.s, hide: false, set: {} }); });
            out[sk] = res;
        });
        return { stageKeys: keys, stages: out };
    }
    function copy(o) { return JSON.parse(JSON.stringify(o)); }
    // 항목 하나 → 그릴 장 (숨긴 장은 null)
    function entrySlide(e) { return e.base ? (e.hide ? null : mergeSlide(e.base, e.set)) : newSlide(e); }
    function applyEdit(def, edit) {
        if (!edit || !edit.stages || typeof edit.stages !== 'object') return def;
        var R = resolveEdit(def, edit), out = { title: (def && def.title) || '', stages: {}, edited: true };
        var hidden = [];
        R.stageKeys.forEach(function (sk) {
            var list = R.stages[sk].map(entrySlide).filter(Boolean);
            if (list.length) out.stages[sk] = list;
            R.stages[sk].forEach(function (e) { if (e.base && e.hide && e.base.key) hidden.push(e.base); });
        });
        // 숨긴 장 중 key 가 있는 장 (학생 화면 답과 묶임): 띄우지는 않지만 교사 화면 '🔓 모든 풀이 열기'가 그 key 도 열게 (단계 키 '_hidden' 은 어느 단계도 아님)
        if (hidden.length) out.stages._hidden = hidden;
        return out;
    }
    // 편집 화면의 항목 목록 → 저장할 고친 자료 (기본 장은 바꾼 칸만, 원래 제목을 함께 — 자리가 바뀌어도 찾게)
    function toEdit(exp, stages) {
        var out = { v: 1, exp: exp, stages: {} };
        Object.keys(stages).forEach(function (sk) {
            out.stages[sk] = stages[sk].map(function (e) {
                if (!e.base) {
                    var n = { add: e.add, kind: e.kind };
                    ['title', 'body', 'ask', 'reveal', 'note'].forEach(function (f) { var v = sanitize(e[f], EDIT_FIELDS[f]); if (v) n[f] = v; });
                    if (e.kind === 'vars' && e.vars) n.vars = cleanVars(e.vars);
                    ['img', 'revealImg'].forEach(function (f) { if (IMG_REF_RE.test(String(e[f] || ''))) n[f] = e[f]; });
                    var rp = cleanResp(e.resp); if (rp) n.resp = rp;
                    return n;
                }
                var o = { ref: e.ref, of: plain(e.base.title) };
                if (e.hide) o.hide = true;
                var set = {};
                Object.keys(EDIT_FIELDS).forEach(function (f) {
                    if (typeof e.set[f] !== 'string') return;
                    var v = sanitize(e.set[f], EDIT_FIELDS[f]);
                    if (v !== sanitize(e.base[f] || '', EDIT_FIELDS[f])) set[f] = v;
                });
                ['img', 'revealImg'].forEach(function (f) {
                    if (typeof e.set[f] === 'string' && (e.set[f] === '' || IMG_REF_RE.test(e.set[f])) && e.set[f] !== (e.base[f] || '')) set[f] = e.set[f];
                });
                if (e.set.vars && e.base.vars) { var cv = cleanVars(e.set.vars); if (JSON.stringify(cv) !== JSON.stringify(cleanVars(e.base.vars))) set.vars = cv; }
                if (Object.keys(set).length) o.set = set;
                return o;
            });
        });
        return out;
    }

    // 내용 파일 불러오기 (없으면 null, 아무것도 깨지지 않게)
    var loading = {};
    /* 발표 보기가 부르는 곳: 기본 내용 + (구글 로그인한 선생님이면) 내 고친 자료를 덮어 씀.
       LessonSlides.noEdits = true 면 기본만 (편집 화면이 기본을 따로 볼 때) */
    function load(exp, base) {
        return loadBase(exp, base).then(function (def) {
            var LS = root && root.LabStore;
            if (!LS || LessonSlides.noEdits || !/^[a-z0-9]+$/.test(String(exp || ''))) return def;
            return Promise.resolve(LS.currentUser()).then(function (u) {
                return u && u.google ? LS.call('lab:', { action: 'lessonEditGet', exp: exp }, 8000) : null;
            }).then(function (r) {
                if (!(r && r.ok && r.edit)) return def;
                var m = applyEdit(def, r.edit), ids = imgIds(m);
                if (!ids.length) return m;
                // 내가 바꾼 그림: 그림마다 문서 하나 (발표 보기를 열 때 한 번씩)
                return Promise.all(ids.map(function (id) {
                    return LS.call('lab:', { action: 'lessonImgGet', id: id }, 15000).then(function (x) { return x && x.ok ? x.data : ''; }, function () { return ''; });
                })).then(function (datas) { var map = {}; ids.forEach(function (id, i) { map[id] = datas[i]; }); return resolveImgs(m, map); });
            }, function () { return def; });
        });
    }
    function loadBase(exp, base) {
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
    var LessonSlides = { KINDS: KINDS, slidesFor: slidesFor, gateOf: gateOf, firstPanel: firstPanel, render: render, fit: fit, check: check, load: load, loadBase: loadBase,
        sanitize: sanitize, plain: plain, applyEdit: applyEdit, resolveEdit: resolveEdit, entrySlide: entrySlide, toEdit: toEdit, refOf: refOf, imgIds: imgIds, cleanResp: cleanResp, respQ: respQ, respHtml: respHtml, imgSlide: imgSlide, resolveImgs: resolveImgs, IMG_REF_RE: IMG_REF_RE, IMG_DATA_RE: IMG_DATA_RE, EDIT_FIELDS: EDIT_FIELDS, NEW_KEY_RE: NEW_KEY_RE };
    return { LessonContent: LessonContent, LessonSlides: LessonSlides };
});
