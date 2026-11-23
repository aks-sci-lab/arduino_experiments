/* 📖 수업 자료 편집 화면 (projects/lesson-editor.html, 2026-11-23 선생님 "수업 자료는 내가 편집할 수 있게 편집모드도 만들어줘")
   - 실험 고르기 → 단계(작은 탭) → 장 목록(↑↓·👁 숨기기·➕ 새 장) → 장 고치기(제목·본문·물음·풀이·선생님용) → 미리보기(1280×720·4K, 발표 보기와 같은 그리기·한 화면 맞춤)
   - 저장: 선생님 구글 계정 (js/lab-store.js lessonEditSave → Firestore lessonEdits/{uid}/exps/{exp}), ↩ 기본 자료로 되돌리기 = 지우기
   - 고친 자료 모양·덮어 그리기·허용 태그는 js/lesson-slides.js (resolveEdit·toEdit·applyEdit·sanitize). 기본 장 key 는 그대로, 새 장은 'my-…' */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var LS = window.LessonSlides, CC = window.ClassCloud, Store = window.LabStore;
    var KINDS = LS.KINDS;
    var FIELDS = [
        { f: 'title', name: '제목', line: true },
        { f: 'body', name: '본문' },
        { f: 'ask', name: '❓ 물음 (먼저 보임)' },
        { f: 'reveal', name: '💡 풀이 (한 번 더 넘기면 보임)', needs: 'ask' },
        { f: 'note', name: '🔧 선생님용 (발표 화면에서 접혀 있음)' }
    ];
    var st = { user: null, exp: '', def: null, keys: [], stages: {}, stage: '', sel: 0, dirty: false, edits: {}, size: '1280', imgs: {} };

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function call(body) { return Store.call('lab:', body); }
    // 고칠 수 있는 실험: 단계를 여는 실험(7단계 보고서 실험·행사형)
    function expList() {
        return Object.keys(CC.EXPS).filter(function (k) { return /^[a-z0-9]+$/.test(k) && CC.gateSteps(k, ''); });
    }
    function stageName(k) { return CC.stepName(st.exp, k, '') || k; }

    // ---------- 로그인 ----------
    function showLogin(msg) {
        $('loginCard').hidden = false; $('viewPick').hidden = true; $('viewEdit').hidden = true;
        $('loginNow').textContent = msg || '선생님 구글 로그인이 필요해요.';
        $('btnLogin').hidden = false;
    }
    $('btnLogin').addEventListener('click', function () {
        $('loginMsg').textContent = '⏳ 로그인 창을 여는 중…';
        Store.signInGoogle().then(function () { $('loginMsg').textContent = ''; }, function (e) { $('loginMsg').textContent = '⚠ 로그인하지 못했어요: ' + (e && e.message || e); });
    });
    function onUser(u) {
        if (st.user && u && u.google && st.user.uid === u.uid) return;   // 같은 선생님 알림이 두 번 오면 한 번만
        st.user = u;
        if (!u || !u.google) { showLogin(); return; }
        $('loginCard').hidden = true;
        var want = (/[#&]exp=([a-z0-9]+)/.exec(location.hash) || [])[1];
        if (want && expList().indexOf(want) >= 0) openExp(want); else showPick();
    }
    Store.onUser(onUser);

    // ---------- 1) 실험 고르기 ----------
    function showPick() {
        if (st.dirty && !confirm('저장하지 않은 고친 내용이 있어요. 버리고 나갈까요?')) return;
        st.dirty = false; st.exp = '';
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
        $('viewEdit').hidden = true; $('viewPick').hidden = false;
        drawPick();
        $('pickMsg').textContent = '⏳ 내가 고친 자료를 확인하는 중…';
        call({ action: 'lessonEditList' }).then(function (r) {
            st.edits = {};
            if (r && r.ok) { r.edits.forEach(function (e) { st.edits[e.exp] = e.updatedAt || true; }); $('pickMsg').textContent = ''; }
            else $('pickMsg').textContent = '⚠ ' + ((r && r.error) || '확인하지 못했어요');
            drawPick();
        });
    }
    function drawPick() {
        $('pickGrid').innerHTML = expList().map(function (k) {
            var e = CC.EXPS[k];
            return '<button type="button" class="pick-card le-pick" data-exp="' + k + '"><span class="ic">' + esc(e.icon || '🧪') + '</span><b>' + esc(e.name) + '</b>' +
                '<small>' + (st.edits[k] ? '✏️ 내가 고친 자료 있음' : '기본 자료') + '</small></button>';
        }).join('');
    }
    $('pickGrid').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-exp]'); if (b) openExp(b.dataset.exp);
    });

    // ---------- 2) 고치기 ----------
    function openExp(exp, doneMsg) {
        $('viewPick').hidden = true; $('viewEdit').hidden = false;
        $('expTitle').textContent = (CC.EXPS[exp].icon || '') + ' ' + CC.EXPS[exp].name;
        $('saveMsg').textContent = '⏳ 불러오는 중…';
        st.exp = exp; st.dirty = false; setDirty(false);
        history.replaceState(null, '', '#exp=' + exp);
        Promise.all([LS.loadBase(exp), call({ action: 'lessonEditGet', exp: exp })]).then(function (res) {
            if (st.exp !== exp) return;
            var def = res[0], r = res[1];
            if (!r || !r.ok) { $('saveMsg').textContent = '⚠ 내가 고친 자료를 읽지 못했어요: ' + ((r && r.error) || '') + ' (기본 자료로 보여요. 저장하면 덮어써요)'; }
            else $('saveMsg').textContent = r.edit ? '✏️ 내가 고친 자료를 불러왔어요' + (r.edit.updatedAt ? ' (' + new Date(r.edit.updatedAt).toLocaleString('ko-KR') + ')' : '') : '기본 자료예요. 고친 뒤 💾 저장하면 내 계정에 남아요.';
            if (doneMsg) $('saveMsg').textContent = doneMsg;
            st.def = def;
            var R = LS.resolveEdit(def, r && r.ok ? r.edit : null);
            // 단계: 그 실험이 여는 단계 순서대로 (설명 장이 없는 단계도 장을 더할 수 있게) + 고친 자료에만 있는 단계
            var keys = CC.gateSteps(exp, '').slice();
            R.stageKeys.forEach(function (k) { if (keys.indexOf(k) < 0 && k !== '_hidden') keys.push(k); });
            st.keys = keys; st.stages = {};
            keys.forEach(function (k) { st.stages[k] = R.stages[k] || []; });
            var first = keys.filter(function (k) { return st.stages[k].length; })[0] || keys[0];
            drawStages(); pickStage(first, 0);
            // 내가 바꾼 그림 불러오기 (미리보기·고치기 칸 작은 그림)
            st.imgs = {};
            var ids = [];
            keys.forEach(function (k) { st.stages[k].forEach(function (e) { ['img', 'revealImg'].forEach(function (f) { var v = String(val(e, f) || ''); if (LS.IMG_REF_RE.test(v) && ids.indexOf(v.slice(7)) < 0) ids.push(v.slice(7)); }); }); });
            ids.forEach(function (id) {
                call({ action: 'lessonImgGet', id: id }).then(function (x) { if (x && x.ok && st.exp === exp) { st.imgs[id] = x.data; drawForm(); preview(); } });
            });
        });
    }
    $('btnBack').addEventListener('click', showPick);
    function setDirty(on) {
        st.dirty = on;
        $('dirtyMsg').textContent = on ? '● 저장하지 않은 고친 내용이 있어요' : '';
    }
    window.addEventListener('beforeunload', function (e) { if (st.dirty) { e.preventDefault(); e.returnValue = ''; } });

    function drawStages() {
        $('stageTabs').innerHTML = st.keys.map(function (k) {
            var n = st.stages[k].filter(function (e) { return !e.hide; }).length;
            return '<button type="button" data-stage="' + esc(k) + '" aria-selected="' + (k === st.stage) + '">' + esc(stageName(k)) + ' <small>' + n + '장</small></button>';
        }).join('');
    }
    $('stageTabs').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-stage]'); if (b) pickStage(b.dataset.stage, 0);
    });
    function pickStage(k, i) {
        st.stage = k; st.sel = Math.max(0, Math.min(i, st.stages[k].length - 1));
        drawStages(); drawList(); drawForm(); preview();
    }
    function cur() { return st.stages[st.stage][st.sel] || null; }
    function val(e, f) {
        if (!e.base) return e[f] == null ? '' : e[f];
        return typeof e.set[f] === 'string' ? e.set[f] : (e.base[f] || '');
    }
    function isEdited(e) {
        if (!e.base) return false;
        return Object.keys(e.set).some(function (f) {
            if (f === 'vars') return JSON.stringify(e.set.vars) !== JSON.stringify(e.base.vars);
            if (f === 'img' || f === 'revealImg') return e.set[f] !== (e.base[f] || '');
            return LS.sanitize(e.set[f]) !== LS.sanitize(e.base[f] || '');
        });
    }
    function kindOf(e) { return e.base ? e.base.kind : e.kind; }
    function drawList() {
        var list = st.stages[st.stage];
        if (!list.length) { $('slideList').innerHTML = '<li class="le-empty">이 단계에는 설명 장이 없어요. <b>➕ 새 장 더하기</b>로 만들어 보세요.</li>'; return; }
        $('slideList').innerHTML = list.map(function (e, i) {
            var tags = (e.base ? '' : '<span class="le-tag new">➕ 새 장</span>') + (isEdited(e) ? '<span class="le-tag ed">✏️ 고침</span>' : '') + (e.hide ? '<span class="le-tag hid">숨김</span>' : '') +
                (e.base && e.base.key ? '<span class="le-tag key" title="학생 화면 답과 묶인 장">🔗</span>' : '');
            return '<li class="le-item' + (i === st.sel ? ' on' : '') + (e.hide ? ' hid' : '') + '">' +
                '<button type="button" class="le-pickslide" data-i="' + i + '" aria-current="' + (i === st.sel) + '"><span class="le-no">' + (i + 1) + '</span> <span class="le-kind">' + esc((KINDS[kindOf(e)] || '').split(' ')[0]) + '</span> <span class="le-ttl">' + esc(LS.plain(val(e, 'title')) || '(제목 없음)') + '</span> ' + tags + '</button>' +
                '<span class="le-ops"><button type="button" data-op="up" data-i="' + i + '" aria-label="' + (i + 1) + '번 장 위로"' + (i ? '' : ' disabled') + '>↑</button>' +
                '<button type="button" data-op="down" data-i="' + i + '" aria-label="' + (i + 1) + '번 장 아래로"' + (i < list.length - 1 ? '' : ' disabled') + '>↓</button>' +
                '<button type="button" data-op="hide" data-i="' + i + '" aria-label="' + (i + 1) + '번 장 ' + (e.hide ? '보이기' : '숨기기') + '" aria-pressed="' + !!e.hide + '">' + (e.hide ? '🙈' : '👁') + '</button></span></li>';
        }).join('');
    }
    $('slideList').addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-i]'); if (!b) return;
        var i = Number(b.dataset.i), list = st.stages[st.stage], op = b.dataset.op;
        if (!op) { st.sel = i; drawList(); drawForm(); preview(); return; }
        if (op === 'up' && i > 0) { list.splice(i - 1, 0, list.splice(i, 1)[0]); st.sel = i - 1; }
        else if (op === 'down' && i < list.length - 1) { list.splice(i + 1, 0, list.splice(i, 1)[0]); st.sel = i + 1; }
        else if (op === 'hide') {
            var e = list[i];
            if (!e.base) { if (!confirm('새로 더한 장은 숨기지 않고 지워요. 지울까요?')) return; list.splice(i, 1); st.sel = Math.max(0, Math.min(i, list.length - 1)); }
            else { e.hide = !e.hide; st.sel = i; }
        } else return;
        setDirty(true); drawStages(); drawList(); drawForm(); preview();
        var again = $('slideList').querySelector('button[data-op="' + op + '"][data-i="' + st.sel + '"]');
        if (again && !again.disabled) again.focus();
    });
    $('btnAdd').addEventListener('click', function () {
        var list = st.stages[st.stage], at = list.length ? st.sel + 1 : 0;
        list.splice(at, 0, { add: 'my-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: 'concept', title: '새 장', body: '' });
        st.sel = at; setDirty(true); drawStages(); drawList(); drawForm(); preview();
        var t = $('slideForm').querySelector('[data-f="title"]'); if (t) { t.focus(); t.select && t.select(); }
    });

    // ---------- 장 고치기 칸 ----------
    function drawForm() {
        var e = cur(), box = $('slideForm');
        if (!e) { box.innerHTML = '<p class="note">고칠 장을 왼쪽 목록에서 골라요.</p>'; return; }
        var k = kindOf(e), h = '';
        if (e.base) h += '<p class="note">종류: <b>' + esc(KINDS[k]) + '</b>' + (e.base.key ? ' · 🔗 학생 화면의 답과 묶인 장이에요 (풀이를 열면 학생 화면에도 열려요)' : '') + '</p>';
        else h += '<label class="le-field">종류 <select data-f="kind">' + Object.keys(KINDS).map(function (x) { return '<option value="' + x + '"' + (x === k ? ' selected' : '') + '>' + esc(KINDS[x]) + '</option>'; }).join('') + '</select></label>';
        FIELDS.forEach(function (F) {
            var v = val(e, F.f);
            if (F.line) h += '<label class="le-field">' + F.name + ' <input type="text" data-f="title" maxlength="120" value="' + esc(LS.plain(v)) + '"></label>';
            else h += '<div class="le-field"><span class="le-fname" id="lbl-' + F.f + '">' + F.name + '</span>' +
                '<span class="le-tools" role="toolbar" aria-label="' + F.name + ' 꾸미기"><button type="button" data-cmd="bold" data-for="' + F.f + '" aria-label="굵게"><b>굵게</b></button><button type="button" data-cmd="insertUnorderedList" data-for="' + F.f + '" aria-label="점 목록">• 목록</button><button type="button" data-cmd="insertOrderedList" data-for="' + F.f + '" aria-label="번호 목록">1. 목록</button></span>' +
                '<div class="le-rich" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="lbl-' + F.f + '" data-f="' + F.f + '"' + (F.needs && !LS.plain(val(e, F.needs)) ? ' data-off="1"' : '') + '>' + LS.sanitize(v) + '</div>' +
                (F.needs ? '<small class="note">물음이 있어야 풀이가 나와요.</small>' : '') + '</div>';
        });
        h += imgField(e, 'img', '🖼 그림');
        if (LS.plain(val(e, 'ask'))) h += imgField(e, 'revealImg', '🖼 풀이를 연 뒤 그림 (없으면 위 그림)');
        if (k === 'vars') {
            var vv = (e.base ? (e.set.vars || e.base.vars) : e.vars) || { change: '', keep: [], measure: '', predict: '' };
            h += '<fieldset class="le-vars"><legend>⚖️ 변인 표</legend>' +
                '<label class="le-field">🔧 바꿀 것 <input type="text" data-v="change" value="' + esc(LS.plain(vv.change)) + '"></label>' +
                '<label class="le-field">🔒 같게 할 것 <small>(한 줄에 하나)</small><textarea data-v="keep" rows="3">' + esc((vv.keep || []).map(LS.plain).join('\n')) + '</textarea></label>' +
                '<label class="le-field">📏 잴 것 <input type="text" data-v="measure" value="' + esc(LS.plain(vv.measure)) + '"></label>' +
                '<label class="le-field">🔮 예상 물음 <input type="text" data-v="predict" value="' + esc(LS.plain(vv.predict)) + '"></label></fieldset>';
        }
        h += '<div class="le-row">' + (e.base ? '<button type="button" class="le-btn secondary" id="btnUndoSlide"' + (isEdited(e) ? '' : ' disabled') + '>↩ 이 장 원래대로</button>' : '<button type="button" class="le-btn danger" id="btnDelSlide">🗑 이 장 지우기</button>') + '</div>';
        box.innerHTML = h;
    }
    // ---------- 그림 바꾸기 (② 선생님 기기에서 긴 변 1280px·WebP(안 되면 JPEG)·300KB 아래로 줄여 내 계정에) ----------
    function imgSrc(v) {
        v = String(v || '');
        if (LS.IMG_REF_RE.test(v)) return st.imgs[v.slice(7)] || '';
        return v;
    }
    function thumb(v) {
        var s = imgSrc(v);
        if (!s) return String(v || '') && LS.IMG_REF_RE.test(v) ? '<span class="note">⏳ 그림을 불러오는 중…</span>' : '<span class="note">그림 없음</span>';
        if (/^<svg[\s>]/i.test(s)) return '<span class="le-thumb">' + s + '</span>';   // 기본 내용 파일의 그림 (저장소 글)
        return '<span class="le-thumb"><img src="' + esc(s) + '" alt=""></span>';
    }
    function imgField(e, f, name) {
        var v = val(e, f), changed = e.base ? typeof e.set[f] === 'string' : !!e[f];
        return '<div class="le-field le-imgfield"><span class="le-fname">' + name + '</span>' + thumb(v) +
            '<span class="le-row"><label class="le-btn secondary le-file">📷 그림 바꾸기<input type="file" accept="image/png,image/jpeg,image/webp" data-img="' + f + '"></label>' +
            (v ? '<button type="button" class="le-btn secondary" data-imgop="none" data-for="' + f + '">그림 빼기</button>' : '') +
            (e.base && changed ? '<button type="button" class="le-btn secondary" data-imgop="undo" data-for="' + f + '">↩ 원래 그림</button>' : '') + '</span>' +
            '<small class="note" data-imgmsg="' + f + '" role="status"></small></div>';
    }
    // 그림 줄이기: 캔버스로 다시 그려(SVG·글자 속 스크립트가 따라오지 않게) 긴 변 1280px, WebP → JPEG, 품질을 낮추며 300KB 아래로
    var IMG_MAX_CHARS = 400000;
    function shrink(file) {
        return new Promise(function (res, rej) {
            if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { rej(new Error('사진·PNG·JPEG·WebP 그림만 올릴 수 있어요.')); return; }
            var url = URL.createObjectURL(file), im = new Image();
            im.onload = function () {
                URL.revokeObjectURL(url);
                var side = 1280, out = null;
                for (var round = 0; round < 4 && !out; round++, side = Math.round(side * 0.75)) {
                    var sc = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.max(1, Math.round(im.naturalWidth * sc)), h = Math.max(1, Math.round(im.naturalHeight * sc));
                    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
                    var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
                    var types = ['image/webp', 'image/jpeg'];
                    for (var t = 0; t < types.length && !out; t++) for (var q = 0.85; q >= 0.4 && !out; q -= 0.15) {
                        var d = cv.toDataURL(types[t], q);
                        if (d.indexOf('data:' + types[t]) === 0 && d.length <= IMG_MAX_CHARS) out = { data: d, w: w, h: h };
                    }
                }
                if (out) res(out); else rej(new Error('그림을 300KB 아래로 줄이지 못했어요.'));
            };
            im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('그림을 읽지 못했어요.')); };
            im.src = url;
        });
    }
    function setImg(e, f, v) { if (e.base) e.set[f] = v; else if (v) e[f] = v; else delete e[f]; }
    $('slideForm').addEventListener('change', function (ev) {
        var inp = ev.target.closest('input[data-img]'); if (!inp || !inp.files || !inp.files[0]) return;
        var e = cur(), f = inp.dataset.img, msg = $('slideForm').querySelector('[data-imgmsg="' + f + '"]'), exp = st.exp;
        msg.textContent = '⏳ 그림을 줄여 올리는 중…';
        shrink(inp.files[0]).then(function (o) {
            return call({ action: 'lessonImgSave', exp: exp, data: o.data, w: o.w, h: o.h }).then(function (r) {
                if (!r || !r.ok) throw new Error((r && r.error) || '올리지 못했어요');
                st.imgs[r.id] = o.data;
                if (cur() === e) { setImg(e, f, r.ref); setDirty(true); drawForm(); preview(); var m2 = $('slideForm').querySelector('[data-imgmsg="' + f + '"]'); if (m2) m2.textContent = '✅ 그림을 바꿨어요 (' + o.w + '×' + o.h + ', ' + Math.round(o.data.length * 0.75 / 1024) + 'KB) — 💾 저장해야 남아요'; }
            });
        }).catch(function (err) { if (msg.isConnected) msg.textContent = '⚠ ' + (err && err.message || err); });
    });
    function textOf(el) { return el.tagName === 'DIV' ? el.innerHTML : el.value; }
    function onField(el) {
        var e = cur(); if (!e) return;
        var f = el.dataset.f, v = el.dataset.v;
        if (f === 'kind') { e.kind = el.value; if (e.kind === 'vars' && !e.vars) e.vars = { change: '', keep: [], measure: '', predict: '' }; drawForm(); }
        else if (f) {
            var t = f === 'title' ? esc(el.value) : textOf(el);
            if (e.base) e.set[f] = t; else e[f] = t;
            if (f === 'ask') { var rv = $('slideForm').querySelector('[data-f="reveal"]'); if (rv) rv.toggleAttribute('data-off', !LS.plain(t)); }
        } else if (v) {
            var target = e.base ? (e.set.vars = e.set.vars || JSON.parse(JSON.stringify(e.base.vars || {}))) : (e.vars = e.vars || {});
            target[v] = v === 'keep' ? el.value.split('\n').map(function (x) { return esc(x.trim()); }).filter(Boolean) : esc(el.value);
        } else return;
        setDirty(true);
        var undo = $('btnUndoSlide'); if (undo) undo.disabled = !isEdited(e);
        if (f === 'title') drawList();
        drawStagesSoon(); preview();
    }
    var stT = 0;
    function drawStagesSoon() { clearTimeout(stT); stT = setTimeout(drawStages, 300); }
    $('slideForm').addEventListener('input', function (ev) { onField(ev.target.closest('[data-f],[data-v]') || ev.target); });
    $('slideForm').addEventListener('change', function (ev) { if (ev.target.dataset.f === 'kind') onField(ev.target); });
    // 붙여 넣기는 글자만 (다른 곳의 글꼴·색·그림이 따라오지 않게)
    $('slideForm').addEventListener('paste', function (ev) {
        if (!ev.target.closest('.le-rich')) return;
        ev.preventDefault();
        var t = (ev.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, t);
    });
    // 끌어다 놓기도 글자만 (다른 페이지의 그림·태그가 들어오지 않게)
    $('slideForm').addEventListener('drop', function (ev) {
        if (!ev.target.closest('.le-rich')) return;
        ev.preventDefault();
        var t = ev.dataTransfer && ev.dataTransfer.getData('text/plain');
        if (t) document.execCommand('insertText', false, t);
    });
    $('slideForm').addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.cmd) {
            var ed = $('slideForm').querySelector('.le-rich[data-f="' + b.dataset.for + '"]');
            if (ed) { ed.focus(); document.execCommand(b.dataset.cmd, false, null); onField(ed); }
            return;
        }
        if (b.dataset.imgop) {
            var ei = cur(), fi = b.dataset.for;
            if (b.dataset.imgop === 'none') setImg(ei, fi, '');
            else delete ei.set[fi];
            setDirty(true); drawList(); drawForm(); preview();
            return;
        }
        if (b.id === 'btnUndoSlide') { var e = cur(); e.set = {}; setDirty(true); drawList(); drawForm(); preview(); }
        if (b.id === 'btnDelSlide' && confirm('이 장을 지울까요?')) {
            var list = st.stages[st.stage]; list.splice(st.sel, 1); st.sel = Math.max(0, Math.min(st.sel, list.length - 1));
            setDirty(true); drawStages(); drawList(); drawForm(); preview();
        }
    });

    // ---------- 미리보기 (발표 보기와 같은 그리기: iframe 을 1280×720 또는 3840×2160 으로 두고 줄여 보임) ----------
    var SIZES = { '1280': [1280, 720], '4k': [3840, 2160] };
    var frameReady = null;
    function frameDoc() {
        var fr = $('prevFrame');
        if (!frameReady) frameReady = new Promise(function (res) {
            fr.addEventListener('load', function () { res(fr.contentDocument); }, { once: true });
            fr.srcdoc = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><link rel="stylesheet" href="../css/lab-base.css"><link rel="stylesheet" href="../css/lesson-slides.css">' +
                '<style>html,body{margin:0;height:100%;background:var(--c-bg)}body{padding:2vh;box-sizing:border-box}#deck{height:100%}</style></head><body><div id="deck" class="ls-deck"></div></body></html>';
        });
        return frameReady;
    }
    function sizeFrame() {
        var wh = SIZES[st.size], box = $('prevBox'), fr = $('prevFrame');
        var w = box.clientWidth || 600, sc = w / wh[0];
        fr.style.width = wh[0] + 'px'; fr.style.height = wh[1] + 'px'; fr.style.transform = 'scale(' + sc + ')';
        box.style.height = Math.round(wh[1] * sc) + 'px';
    }
    var pvT = 0;
    function preview() { clearTimeout(pvT); pvT = setTimeout(previewNow, 120); }
    function previewNow() {
        sizeFrame();
        var e = cur();
        frameDoc().then(function (d) {
            var deck = d.getElementById('deck');
            if (!e) { deck.innerHTML = ''; return; }
            var visible = st.stages[st.stage].filter(function (x) { return !x.hide; });
            var slide = LS.entrySlide(e.hide ? Object.assign({}, e, { hide: false }) : e);
            if (!slide) { deck.innerHTML = ''; return; }
            slide = LS.imgSlide(slide, st.imgs);
            var rev = $('prevReveal').checked && !!slide.reveal;
            deck.innerHTML = LS.render(slide, rev, { i: Math.max(0, visible.indexOf(e)), n: visible.length || 1, stageName: stageName(st.stage) });
            if (e.hide) deck.firstChild.insertAdjacentHTML('afterbegin', '<p class="ls-wait">🙈 숨긴 장 — 발표 보기에는 나오지 않아요</p>');
            // 설명 장 그림 주소(../img/…)는 이 페이지와 같은 폴더 기준이라 그대로 보임
            LS.fit(deck);
        });
    }
    $('prevReveal').addEventListener('change', preview);
    document.querySelector('.le-seg').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-size]'); if (!b) return;
        st.size = b.dataset.size;
        Array.prototype.forEach.call(this.querySelectorAll('[data-size]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        preview();
    });
    window.addEventListener('resize', preview);

    // ---------- 저장·되돌리기 ----------
    $('btnSave').addEventListener('click', function () {
        if (!st.exp) return;
        var edit = LS.toEdit(st.exp, st.stages);
        $('saveMsg').textContent = '⏳ 저장하는 중…';
        $('btnSave').disabled = true;
        call({ action: 'lessonEditSave', exp: st.exp, edit: edit }).then(function (r) {
            $('btnSave').disabled = false;
            if (r && r.ok) { setDirty(false); st.edits[st.exp] = true; $('saveMsg').textContent = '✅ 내 계정에 저장했어요. 이 실험으로 만든 내 수업의 🎬 발표 보기에 바로 쓰여요 (열려 있으면 발표 보기를 다시 열어 주세요).'; }
            else $('saveMsg').textContent = '⚠ 저장하지 못했어요: ' + ((r && r.error) || '');
        });
    });
    $('btnReset').addEventListener('click', function () {
        if (!st.exp || !confirm('이 실험의 고친 자료를 모두 지우고 기본 자료로 되돌릴까요? (되돌린 뒤에는 다시 살릴 수 없어요)')) return;
        $('saveMsg').textContent = '⏳ 되돌리는 중…';
        call({ action: 'lessonEditReset', exp: st.exp }).then(function (r) {
            if (r && r.ok) { delete st.edits[st.exp]; st.dirty = false; openExp(st.exp, '↩ 기본 자료로 되돌렸어요.'); }
            else $('saveMsg').textContent = '⚠ 되돌리지 못했어요: ' + ((r && r.error) || '');
        });
    });
})();
