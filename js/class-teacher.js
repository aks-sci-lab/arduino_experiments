/* 수업 연결 (교사) — projects/class-teacher.html (2026-11-18 Firestore 로 바꿈)
   구글 로그인(사이트 Firebase, js/lab-store.js) → 수업 주인 = 이 계정. 다른 컴퓨터에서 로그인해도 '내 수업'이 그대로 보인다.
   ① 수업 만들기: 반·학생 수·조별 인원 → 조 나누기 미리보기 → 수업 코드·QR(…?c=수업코드&s=수업 공간) → 내 수업 목록
   ② 진행 보기: 조별 카드(조원의 단계·마지막 활동·측정 점 수·제출) — 학생 신호가 오면 바로 바뀜 + 5초마다 다시 그림(읽기 비용 없음)
      📥 자료 내려받기: 수업 전체·조별 CSV(UTF-8 BOM, 한 줄 = 한 회차), 전체 자료 JSON
   학생 자료는 만든 날부터 183일 뒤 저절로 지워진다(expireAt). 이름·학번은 받지 않는다. */
(function () {
    'use strict';
    var CC = window.ClassCloud, LS = window.LabStore, CONFIG = window.PENDULUM_CONFIG || {};
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var POLL_MS = 5000;
    var state = { user: null, classes: [], watching: null, timer: null, last: null, detail: null, busy: false, liveOff: null, liveSpace: '' };
    function siteRoot() { return new URL('../', location.href).href; }
    var tabs = LabUI.initTabs('#ctTabs', { key: 'class-teacher', onShow: function (t) { if (t === 'watch') startWatch(); else stopWatch(); window.dispatchEvent(new CustomEvent('lab-teacher-tab', { detail: t })); } });

    // ---------- 구글 로그인 ----------
    function renderLogin() {
        var u = state.user, el = $('loginNow');
        var ok = !!(u && u.google);
        el.className = 'ct-status' + (ok ? ' ok' : ' warn');
        el.innerHTML = ok ? '✅ 로그인됨: <b>' + esc(u.name || u.email || '선생님') + '</b>' + (u.email ? ' <span class="note">(' + esc(u.email) + ')</span>' : '')
            : '🔐 수업을 만들고 보려면 선생님 구글 계정으로 로그인하세요. (학생은 로그인하지 않아요)';
        $('btnLogin').hidden = ok; $('btnLogout').hidden = !ok;
        $('btnCreate').title = ok ? '' : '먼저 구글 로그인';
        renderPreview();
        renderDev();
    }
    $('btnLogin').addEventListener('click', async function () {
        $('loginMsg').className = 'note'; $('loginMsg').textContent = '⏳ 구글 로그인 창에서 계정을 고르세요…';
        try { state.user = await LS.signInGoogle(); $('loginMsg').textContent = ''; }
        catch (e) {
            $('loginMsg').className = 'note err';
            $('loginMsg').textContent = '⚠️ 로그인하지 못했어요: ' + (/popup-blocked/.test(String(e && e.code)) ? '팝업이 막혔어요. 주소창 오른쪽의 팝업 허용을 눌러 주세요.' : /popup-closed|cancelled/.test(String(e && e.code)) ? '창을 닫았어요.' : String(e && e.message || e));
        }
        renderLogin(); loadClasses();
    });
    $('btnLogout').addEventListener('click', async function () {
        if (!confirm('로그아웃할까요? (만든 수업과 학생 자료는 그대로예요)')) return;
        await LS.signOut(); state.user = null; state.classes = []; renderLogin(); renderList(); renderWatchSel();
    });
    // 개발 데이터 수집: 선생님 폰으로 이 화면을 열어 같은 계정으로 로그인 (js/dev-collect.js)
    function renderDev() {
        var on = CONFIG.devCollect === true && state.user && state.user.google;
        $('devBox').hidden = !on;
        if (on) $('devQr').innerHTML = qrSvg(location.href.split('#')[0].split('?')[0]) || '';
    }

    // ---------- ① 수업 만들기 ----------
    // 실험 고르기: js/class-cloud.js 의 EXPS 전체 + 선생님이 만든 실험(번호 넣기)
    $('inExp').innerHTML = Object.keys(CC.EXPS).map(function (k) {
        var e = CC.EXPS[k];
        return '<option value="' + k + '">' + e.icon + ' ' + esc(e.name) + (e.ready ? '' : ' (페이지 연결 준비 중)') + '</option>';
    }).join('') + '<option value="custom">👩‍🏫 선생님이 만든 실험…</option>';
    function chosenExp() {
        var v = $('inExp').value;
        if (v !== 'custom') return v;
        var id = $('inCustom').value.trim().replace(/^.*[?&]id=/, '').replace(/[&#].*$/, '');
        return /^[A-Za-z0-9_-]{1,40}$/.test(id) ? 'custom:' + id : '';
    }
    // ----- 가족 행사 (팀 이름으로 입장): 예비 실험 값 -----
    var SETUP_FIELDS = [
        ['h', '💧 물의 양 (mL)'], ['waterMin', '최소', 5], ['waterMax', '최대', 20], ['waterStep', '간격', 5], ['waterBase', '기본(같게 할 값)', 10],
        ['h', '💊 발포비타민 양 (¼ 알 단위: 2 = ½ 알)'], ['tabletMin', '최소', 1], ['tabletMax', '최대', 4], ['tabletBase', '기본', 2],
        ['h', '🌡 물의 온도 (°C)'], ['tempMin', '최소', 10], ['tempMax', '최대', 40], ['tempStep', '간격', 10], ['tempBase', '기본', 20],
        ['pieces'],
        ['h', '🎯 1차시 (열리는 시간)'], ['targetTime', '목표 시간 (초)', 15], ['tolTime', '‘맞췄다’ 허용 오차 (초)', 2], ['repeats', '같은 조건 반복 횟수', 3],
        ['h', '🚀 2차시 (아이 키만큼)'], ['targetPct', '목표 (아이 키의 %)', 100], ['tolPct', '‘맞췄다’ 허용 오차 (%)', 10]
    ];
    var PIECE_NAMES = { whole: '한 덩어리', half: '2조각', quarter: '4조각', powder: '가루' };
    function teamSetupHtml(prefix, v) {
        v = v || {};
        var pieces = String(v.pieces || 'whole,half,quarter,powder').split(','), base = v.pieceBase || 'whole';
        return '<div class="ct-setup">' + SETUP_FIELDS.map(function (f) {
            if (f[0] === 'h') return '<h4>' + esc(f[1]) + '</h4>';
            if (f[0] === 'pieces') return '<h4>🔪 조각 크기 (고를 수 있는 것 · 기본)</h4><div class="ct-pieces">' + Object.keys(PIECE_NAMES).map(function (k) {
                return '<label><input type="checkbox" data-piece="' + k + '"' + (pieces.indexOf(k) >= 0 ? ' checked' : '') + '> ' + PIECE_NAMES[k] + '</label>';
            }).join('') + '<label>기본 <select data-piecebase>' + Object.keys(PIECE_NAMES).map(function (k) { return '<option value="' + k + '"' + (k === base ? ' selected' : '') + '>' + PIECE_NAMES[k] + '</option>'; }).join('') + '</select></label></div>';
            return '<label class="ct-field">' + esc(f[1]) + ' <input type="number" step="any" inputmode="decimal" data-setup="' + f[0] + '" id="' + prefix + f[0] + '" value="' + esc(v[f[0]] != null ? v[f[0]] : f[2]) + '"></label>';
        }).join('') + '</div>';
    }
    function readSetup(box) {
        var o = {};
        box.querySelectorAll('[data-setup]').forEach(function (i) { if (i.value !== '') o[i.dataset.setup] = Number(i.value); });
        var ps = []; box.querySelectorAll('[data-piece]').forEach(function (c) { if (c.checked) ps.push(c.dataset.piece); });
        o.pieces = (ps.length ? ps : ['whole']).join(',');
        var pb = box.querySelector('[data-piecebase]'); o.pieceBase = pb && ps.indexOf(pb.value) >= 0 ? pb.value : ps[0] || 'whole';
        return o;
    }
    $('teamSetup').innerHTML = teamSetupHtml('ts-', null);
    function isTeamExp(exp) { var e = CC.expInfo(exp); return !!(e && e.team); }
    function inputs() {
        var team = isTeamExp(chosenExp());
        var o = { ban: Number($('inBan').value), nStudents: Number($('inN').value), groupSize: Number($('inSize').value), exp: chosenExp(), aiLimit: $('inAiLimit').value === '' ? 20 : Number($('inAiLimit').value) };
        if (team) { o.mode = 'team'; o.nTeams = Number($('inTeams').value); o.nStudents = o.nTeams; o.groupSize = 1; o.aiLimit = 0; o.setup = readSetup($('teamSetup')); }
        return o;
    }
    function renderPreview() {
        var o = inputs(), team = o.mode === 'team', g = team ? (o.nTeams >= 1 && o.nTeams <= 40 && o.nTeams % 1 === 0 ? [o.nTeams] : []) : CC.splitGroups(o.nStudents, o.groupSize);
        var ok = g.length && o.ban >= 1 && o.ban <= 99 && o.ban % 1 === 0 && !!o.exp && o.aiLimit >= 0 && o.aiLimit <= 200 && o.aiLimit % 1 === 0;
        $('btnCreate').disabled = !ok;
        $('customRow').hidden = $('inExp').value !== 'custom';
        $('rowN').hidden = $('rowSize').hidden = $('rowAi').hidden = team; $('rowTeams').hidden = $('teamBox').hidden = !team;
        if (team) {
            $('expNote').innerHTML = '';
            $('preview').innerHTML = ok ? '👨‍👩‍👧 <b>팀 이름으로 입장</b> · 최대 ' + o.nTeams + '팀 · 1차시 목표 ' + esc(o.setup.targetTime) + '초(±' + esc(o.setup.tolTime) + '초) · 2차시 아이 키의 ' + esc(o.setup.targetPct) + '%(±' + esc(o.setup.tolPct) + '%)'
                : '반(1~99)과 팀 수(1~40)를 정수로 넣어 주세요.';
            return;
        }
        var e = o.exp && CC.expInfo(o.exp);
        $('expNote').innerHTML = $('inExp').value === 'custom' && !o.exp ? '선생님이 만든 실험의 번호(또는 학생 화면 주소)를 넣어 주세요.'
            : e && !e.ready ? '⚠️ 이 실험 페이지는 아직 수업 참여 띠를 붙이는 중이에요. 수업은 만들 수 있지만, 학생 화면에 조·번호 고르기가 아직 안 나올 수 있어요.' : '';
        $('preview').innerHTML = ok
            ? '👥 ' + o.nStudents + '명 → <b>' + g.length + '개 조</b>: ' + g.map(function (k, i) { return (i + 1) + '조 ' + k + '명'; }).join(', ')
            + ' · 🤖 AI 질문 조마다 ' + o.aiLimit + '번' : '반(1~99), 학생 수(1~60), 조별 인원(1~10), AI 질문 한도(0~200)를 정수로 넣어 주세요.';
    }
    ['inBan', 'inN', 'inSize', 'inExp', 'inCustom', 'inAiLimit', 'inTeams'].forEach(function (id) { $(id).addEventListener('input', renderPreview); });
    $('teamSetup').addEventListener('input', renderPreview); $('teamSetup').addEventListener('change', renderPreview);
    $('inExp').addEventListener('change', renderPreview);
    // 선생님이 만든 실험은 '공개'여야 학생이 열 수 있다 → 번호를 넣으면 확인해 알려 줌
    var customState = { id: '', state: '', timer: null };
    function checkCustomNow() {
        var o = inputs(), el = $('customCheck');
        var id = $('inExp').value === 'custom' && /^custom:/.test(o.exp) ? o.exp.slice(7) : '';
        el.hidden = !id;
        if (!id || id === customState.id) return;
        customState.id = id; customState.state = 'checking';
        el.className = 'note'; el.textContent = '⏳ 학생에게 공개된 실험인지 확인하는 중…';
        CC.checkCustom(id).then(function (r) {
            if (customState.id !== id) return;
            customState.state = r.state;
            if (r.state === 'public') { el.className = 'note'; el.textContent = '✅ 공개된 실험이에요' + (r.title ? ': ' + r.title : '') + '. 학생이 열 수 있어요.'; }
            else if (r.state === 'hidden') { el.className = 'note err'; el.innerHTML = '⚠️ 학생이 열 수 없는 실험이에요 (비공개이거나 번호가 틀림). <b>메인 페이지 → 🔐 사이트 관리</b>에서 로그인해 그 실험을 고치고 <b>학생에게 공개</b>를 켜야 학생이 열 수 있어요.'; }
            else { el.className = 'note'; el.textContent = 'ℹ️ 공개 여부를 확인하지 못했어요 (' + r.error + '). 공개된 실험만 학생이 열 수 있어요.'; }
        });
    }
    ['inExp', 'inCustom'].forEach(function (id) { $(id).addEventListener('input', function () { clearTimeout(customState.timer); customState.timer = setTimeout(checkCustomNow, 400); }); });
    $('inExp').addEventListener('change', checkCustomNow);
    $('btnCreate').addEventListener('click', async function () {
        if (state.busy) return;
        var o = inputs(), msg = $('createMsg');
        if (!state.user || !state.user.google) { msg.className = 'note err'; msg.textContent = '⚠️ 먼저 맨 위에서 구글 로그인을 해 주세요.'; return; }
        if (/^custom:/.test(o.exp) && customState.state === 'hidden' && !confirm('이 실험은 아직 학생에게 공개되지 않았어요. 공개하기 전에는 학생이 열 수 없어요.\n그래도 수업을 만들까요? (나중에 공개로 바꾸면 돼요)')) return;
        state.busy = true; $('btnCreate').disabled = true;
        msg.className = 'note'; msg.textContent = '⏳ 수업을 만드는 중…';
        var r = await CC.createClass('lab:', o);
        state.busy = false; renderPreview();
        if (!r.ok) { msg.className = 'note err'; msg.textContent = '⚠️ ' + r.error; return; }
        msg.className = 'note'; msg.textContent = '✅ 수업 ' + r.classCode + ' 을 만들었어요.';
        state.classes = [r].concat(state.classes.filter(function (c) { return c.space !== r.space; }));
        state.watching = r.space;
        showClass(r); renderList(); renderWatchSel();
    });
    function studentLink(c) { return CC.studentUrl(siteRoot(), c.exp, c.classCode, c.space); }
    function qrSvg(text) {
        if (typeof window.qrcode !== 'function') return null;
        var qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
        return qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
    }
    function expireNote(c) { var t = CC.expireText(c.expireAt); return t ? '🗓 이 수업의 학생 자료는 ' + t + '에 저절로 지워져요. 그 전에 ② 에서 내려받아 두세요.' : ''; }
    function showClass(c) {
        var link = studentLink(c), e = CC.expInfo(c.exp);
        $('classOut').hidden = false;
        $('outTitle').textContent = '— ' + c.ban + '반 · ' + (e ? e.name : c.exp) + ' · ' + (c.mode === 'team' ? '팀 이름으로 입장 (최대 ' + c.groups.length + '팀)' : c.nStudents + '명, ' + c.groups.length + '개 조 · AI 질문 조마다 ' + (c.aiLimit == null ? 20 : c.aiLimit) + '번');
        $('outCode').textContent = c.classCode;
        $('outLink').href = link; $('outLink').textContent = link;
        $('outExpire').textContent = expireNote(c);
        $('qr').innerHTML = qrSvg(link) || '<p class="note">QR 을 만드는 도구를 불러오지 못했어요(인터넷 확인). 학생은 메인 페이지 → 학생으로 시작에서 수업 코드를 넣어도 돼요.</p>';
        state.shown = c;
    }
    $('btnCopy').addEventListener('click', async function () {
        try { await navigator.clipboard.writeText($('outLink').href); $('copyMsg').textContent = '복사했어요.'; }
        catch (e) { $('copyMsg').textContent = '복사하지 못했어요. 주소를 길게 눌러 복사하세요.'; }
    });
    $('btnBig').addEventListener('click', function () {
        var c = state.shown; if (!c) return;
        $('bigQrImg').innerHTML = qrSvg(studentLink(c)) || '';
        $('bigQrCode').textContent = '수업 코드 ' + c.classCode;
        $('bigQr').hidden = false; $('btnBigClose').focus();
    });
    $('btnBigClose').addEventListener('click', function () { $('bigQr').hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('bigQr').hidden = true; });

    // 내 수업 목록 (Firestore: 주인 = 이 계정)
    async function loadClasses() {
        if (!state.user || !state.user.google) { renderList(); renderWatchSel(); return; }
        $('listMsg').className = 'note'; $('listMsg').textContent = '⏳ 내 수업을 불러오는 중…';
        var r = await CC.myClasses();
        if (!r.ok) { $('listMsg').className = 'note err'; $('listMsg').textContent = '⚠️ ' + r.error; return; }
        $('listMsg').textContent = '';
        state.classes = r.classes;
        if (!state.watching || !byId(state.watching)) state.watching = state.classes[0] ? state.classes[0].space : null;
        renderList(); renderWatchSel();
        if (!state.shown && state.classes[0]) showClass(state.classes[0]);
        if (tabs.current() === 'watch') refresh();
    }
    function byId(space) { return state.classes.filter(function (c) { return c.space === space; })[0] || null; }
    function renderList() {
        window.dispatchEvent(new CustomEvent('lab-classes', { detail: state.user && state.user.google ? state.classes : [] }));   // ③ 보고서 AI (js/class-teacher-ai.js)
        var el = $('classList');
        if (!state.user || !state.user.google) { el.innerHTML = '<p class="note">구글 로그인하면 이 계정으로 만든 수업이 여기에 보여요.</p>'; return; }
        if (!state.classes.length) { el.innerHTML = '<p class="note">아직 만든 수업이 없어요.</p>'; return; }
        el.innerHTML = state.classes.map(function (c) {
            var e = CC.expInfo(c.exp);
            return '<div class="ct-item"><span><b>' + esc(c.classCode) + '</b> ' + esc(c.ban) + '반 · ' + esc(e ? e.name : c.exp) + ' · ' + (c.mode === 'team' ? '최대 ' + esc(c.groups.length) + '팀' : esc(c.nStudents) + '명/' + esc(c.groups.length) + '조') +
                '<br><span class="note">' + esc(new Date(c.created).toLocaleString('ko-KR')) + ' 만듦 · ' + esc(CC.expireText(c.expireAt)) + ' 지워짐</span></span>' +
                '<span class="ct-row" style="margin:0"><button class="secondary" data-show="' + esc(c.space) + '">QR 보기</button><button data-watch="' + esc(c.space) + '">진행·내려받기</button>' +
                '<button class="secondary" data-reopen="' + esc(c.space) + '">🔓 코드 다시 열기</button><button class="danger" data-del="' + esc(c.space) + '">🗑 지우기</button></span></div>';
        }).join('');
    }
    $('classList').addEventListener('click', async function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var c = byId(b.dataset.show || b.dataset.watch || b.dataset.del || b.dataset.reopen);
        if (!c) return;
        if (b.dataset.reopen) {
            $('listMsg').className = 'note'; $('listMsg').textContent = '⏳ 수업 코드를 다시 여는 중…';
            var ro = await CC.reopenCode(c.space);
            if (!ro.ok) { $('listMsg').className = 'note err'; $('listMsg').textContent = '⚠️ ' + ro.error; return; }
            $('listMsg').textContent = '🔓 수업 코드 ' + c.classCode + ' 로 ' + new Date(ro.joinUntil).toLocaleString('ko-KR') + ' 까지 찾을 수 있어요.';
            return;
        }
        if (b.dataset.show) { showClass(c); $('classOut').scrollIntoView({ behavior: 'smooth' }); }
        else if (b.dataset.watch) { state.watching = c.space; state.last = null; renderWatchSel(); tabs.show('watch', true); }
        else if (confirm('수업 ' + c.classCode + ' 과 학생들이 보낸 자료를 지금 모두 지울까요? 되돌릴 수 없어요. 필요하면 먼저 ② 에서 내려받으세요.')) {
            $('listMsg').className = 'note'; $('listMsg').textContent = '⏳ 지우는 중…';
            var r = await CC.deleteClass(c.space);
            if (!r.ok) { $('listMsg').className = 'note err'; $('listMsg').textContent = '⚠️ ' + r.error; return; }
            $('listMsg').textContent = '🗑 수업 ' + c.classCode + ' 을 지웠어요.';
            state.classes = state.classes.filter(function (x) { return x !== c; });
            if (state.shown === c) { state.shown = null; $('classOut').hidden = true; }
            if (state.watching === c.space) state.watching = state.classes[0] ? state.classes[0].space : null;
            renderList(); renderWatchSel();
        }
    });

    // ---------- ② 진행 보기 ----------
    function renderWatchSel() {
        var sel = $('watchSel');
        sel.innerHTML = state.classes.length ? state.classes.map(function (c) {
            return '<option value="' + esc(c.space) + '"' + (c.space === state.watching ? ' selected' : '') + '>' + esc(c.classCode) + ' (' + esc(c.ban) + '반)</option>';
        }).join('') : '<option value="">만든 수업 없음</option>';
        var c = watched();
        $('dlGroup').innerHTML = '<option value="">전체 조</option>' + (c ? c.groups.map(function (g) { return '<option value="' + esc(g.code) + '">' + g.jo + '조 (' + esc(g.code) + ')</option>'; }).join('') : '');
        $('watchExpire').textContent = c ? expireNote(c) : '';
        $('dlCard').hidden = !c;
        var team = !!(c && c.mode === 'team');
        $('boardCard').hidden = !team;
        if (team && state.setupFor !== c.space) { state.setupFor = c.space; $('teamSetupEdit').innerHTML = teamSetupHtml('te-', c.setup); $('setupMsg').textContent = ''; }
    }
    $('btnSetupSave').addEventListener('click', async function () {
        var c = watched(); if (!c) return;
        var setup = readSetup($('teamSetupEdit'));
        $('setupMsg').className = 'note'; $('setupMsg').textContent = '⏳ 저장하는 중…';
        var r = await CC.classSetup(c.space, setup);
        if (!r.ok) { $('setupMsg').className = 'note err'; $('setupMsg').textContent = '⚠️ ' + r.error; return; }
        c.setup = r.setup; $('setupMsg').textContent = '✅ 저장했어요. 1차시 목표 ' + r.setup.targetTime + '초 · 2차시 ' + r.setup.targetPct + '%';
    });
    // ----- 팀 결과판 (가족 행사) -----
    function boardRows(st) {
        var subs = {}; (st.submissions || []).forEach(function (x) { subs[x.jo] = x; });
        var prog = {}; (st.students || []).forEach(function (x) { prog[x.jo] = x; });
        return (st.teams || []).map(function (t) {
            var sub = subs[t.jo], sm = (sub && sub.summary) || {}, pg = prog[t.jo] || null;
            return { jo: t.jo, name: t.name, score: Number(sm['팀 점수']) || 0, quiz: sm['퀴즈 맞힘'], tDiff: sm['시간 도전 차이(초)'], tOk: sm['시간 도전 성공'] === 1,
                hMax: sm['높이 최고(%)'], hDiff: sm['높이 도전 차이(%)'], hOk: sm['높이 도전 성공'] === 1, spark: sm['생각 바뀜 ✨'],
                step: pg ? CC.stepName(st.exp, pg.step) : '–', state: CC.studentState(pg, st.now) };
        }).sort(function (a, b) { return b.score - a.score || a.jo - b.jo; });
    }
    function boardTable(rows, big) {
        if (!rows.length) return '<p class="note">아직 들어온 팀이 없어요. 가족이 QR 로 들어와 팀 이름을 정하면 여기에 나와요.</p>';
        var n = function (v, unit) { return v == null || v === '' ? '–' : esc(Math.abs(Number(v))) + unit; };
        return '<div class="ct-board-wrap"><table class="ct-board"><thead><tr><th>팀</th><th>⭐ 점수</th><th>⏱ 시간 도전</th><th>🚀 최고 높이</th><th>🎯 높이 도전</th>' + (big ? '' : '<th>지금</th>') + '</tr></thead><tbody>' +
            rows.map(function (r, i) {
                return '<tr><td>' + (i < 3 && r.score ? ['🥇', '🥈', '🥉'][i] + ' ' : '') + '<b>' + esc(r.name) + '</b></td><td><b>' + r.score + '</b></td>' +
                    '<td class="' + (r.tOk ? 'ok' : '') + '">' + (r.tDiff == null ? '–' : (r.tOk ? '🎉 ' : '') + n(r.tDiff, '초 차이')) + '</td>' +
                    '<td>' + (r.hMax == null ? '–' : esc(r.hMax) + '%') + '</td>' +
                    '<td class="' + (r.hOk ? 'ok' : '') + '">' + (r.hDiff == null ? '–' : (r.hOk ? '🎉 ' : '') + n(r.hDiff, '% 차이')) + '</td>' +
                    (big ? '' : '<td class="note">' + esc(r.step) + (r.state.idle ? ' 💤' : '') + '</td>') + '</tr>';
            }).join('') + '</tbody></table></div>';
    }
    function renderBoard(st) {
        var rows = boardRows(st);
        $('watchSum').innerHTML = '<div>들어온 팀<b>' + rows.length + ' / ' + (st.groups || []).length + '</b></div>' +
            '<div>활동 중<b>' + rows.filter(function (r) { return r.state.joined && !r.state.idle; }).length + '</b></div>' +
            '<div>시간 도전 성공<b>' + rows.filter(function (r) { return r.tOk; }).length + '</b></div>' +
            '<div>높이 도전 성공<b>' + rows.filter(function (r) { return r.hOk; }).length + '</b></div>';
        $('board').innerHTML = boardTable(rows, false);
        $('boardBigBody').innerHTML = boardTable(rows, true);
        var c = watched(); $('boardBigTitle').textContent = '🏆 팀 결과판' + (c && c.setup ? ' · 목표 ' + c.setup.targetTime + '초 · 아이 키 ' + (c.setup.targetPct || 100) + '%' : '');
        $('groups').innerHTML = '';
    }
    $('btnBoardBig').addEventListener('click', function () { $('boardBig').hidden = false; $('btnBoardClose').focus(); });
    $('btnBoardClose').addEventListener('click', function () { $('boardBig').hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('boardBig').hidden = true; });
    $('watchSel').addEventListener('change', function (e) { state.watching = e.target.value; state.last = null; state.detail = null; $('detail').hidden = true; renderWatchSel(); refresh(); });
    $('btnRefresh').addEventListener('click', function () { refresh(); });
    function watched() { return byId(state.watching); }
    function startWatch() { stopWatch(); refresh(); }
    function stopWatch() { clearTimeout(state.timer); state.timer = null; }
    // 학생 신호가 오면 바로 다시 그림 (Firestore 실시간)
    function liveFor(c) {
        if (!c || state.liveSpace === c.space) return;
        if (state.liveOff) { try { state.liveOff(); } catch (e) { /* 무시 */ } state.liveOff = null; }
        state.liveSpace = c.space;
        LS.watchClass('lab:' + c.space, c.classCode, function () { if (tabs.current() === 'watch' && !document.hidden) refresh(); })
            .then(function (off) { if (state.liveSpace === c.space) state.liveOff = off; else if (off) off(); });
    }
    async function refresh() {
        clearTimeout(state.timer);
        var c = watched(), msg = $('watchMsg');
        if (!state.user || !state.user.google) { msg.textContent = '맨 위에서 구글 로그인을 해 주세요.'; $('groups').innerHTML = ''; $('watchSum').innerHTML = ''; return; }
        if (!c) { msg.textContent = '① 수업 만들기에서 수업을 먼저 만들어 주세요.'; $('groups').innerHTML = ''; $('watchSum').innerHTML = ''; return; }
        if (document.hidden) { state.timer = setTimeout(refresh, POLL_MS); return; }
        if (state.refreshing) { state.again = true; return; }
        state.refreshing = true;
        var r = await CC.classStatus('lab:' + c.space, c.classCode);
        state.refreshing = false;
        if (c !== watched()) return;
        if (!r.ok) msg.innerHTML = '<span class="err">⚠️ ' + esc(r.error) + '</span>' + (state.last ? ' (마지막으로 받은 내용을 보여 줘요)' : '');
        else {
            state.last = r;
            msg.textContent = '🟢 ' + new Date().toLocaleTimeString('ko-KR') + ' · 학생이 움직이면 바로 바뀌어요';
            render(r);
            liveFor(c);
            // 실험별 결과 부품(플랑크 js/class-teacher-planck.js 등)에 지금 보는 수업을 알림
            try { window.dispatchEvent(new CustomEvent('ct-watch', { detail: { cls: c } })); } catch (e) { /* 무시 */ }
        }
        if (state.again) { state.again = false; return refresh(); }
        if (tabs.current() === 'watch') state.timer = setTimeout(refresh, POLL_MS);
    }
    // ---------- 📥 자료 내려받기 ----------
    function download(name, text, type) {
        var blob = new Blob([text], { type: type }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }
    async function exportRows() {
        var c = watched(), msg = $('dlMsg');
        if (!c) return null;
        msg.className = 'note'; msg.textContent = '⏳ 자료를 모으는 중…';
        var r = await CC.classExport(c.space);
        if (!r.ok) { msg.className = 'note err'; msg.textContent = '⚠️ ' + r.error; return null; }
        var g = $('dlGroup').value;
        r.items = r.items.filter(function (d) { return !g || d.group === g; });
        return { c: c, r: r, g: g };
    }
    function fileBase(x) {
        var e = CC.expInfo(x.c.exp), d = new Date(), pad = function (n) { return String(n).padStart(2, '0'); };
        return '수업' + x.c.classCode + '_' + (e ? e.name.replace(/[\\/:*?"<>|()·]/g, '').replace(/\s+/g, '') : x.c.exp.replace(/[^A-Za-z0-9_-]/g, '')) + (x.g ? '_' + x.g + '조' : '') + '_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    }
    $('btnCsv').addEventListener('click', async function () {
        var x = await exportRows(); if (!x) return;
        var names = {}; (x.r.teams || []).forEach(function (t) { names[t.jo] = t.name; });
        var out = LS.toCsv(x.c.exp, x.r.items, x.c.groups.map(function (g) { return names[g.jo] ? Object.assign({}, g, { team: names[g.jo] }) : g; }));
        download(fileBase(x) + '.csv', out.csv, 'text/csv;charset=utf-8');
        $('dlMsg').textContent = '✅ ' + out.rows + '줄을 내려받았어요' + (out.rows ? '.' : ' (아직 보낸 자료가 없어요).');
    });
    $('btnJson').addEventListener('click', async function () {
        var x = await exportRows(); if (!x) return;
        var o = { classCode: x.c.classCode, exp: x.c.exp, ban: x.c.ban, groups: x.c.groups, teams: x.r.teams || undefined, setup: x.c.setup || undefined, exportedAt: new Date().toISOString(), items: x.r.items };
        download(fileBase(x) + '.json', JSON.stringify(o, null, 1), 'application/json');
        $('dlMsg').textContent = '✅ ' + x.r.items.length + '개 회차를 JSON 으로 내려받았어요 (자료 원본 포함).';
    });
    function render(st) {
        if (st.mode === 'team') return renderBoard(st);
        var s = CC.summarize(st);
        $('watchSum').innerHTML =
            '<div>들어온 학생<b>' + s.joined + ' / ' + s.total + '</b></div>' +
            '<div>활동 중<b>' + s.active + '</b></div>' +
            '<div>쉬는 중 (5분+)<b>' + s.idle + '</b></div>' +
            '<div>제출한 조<b>' + s.submittedGroups + ' / ' + s.groups.length + '</b></div>';
        $('groups').innerHTML = s.groups.map(function (g) {
            var sub = g.sub, subTxt = sub && sub.rows ? '📤 ' + esc(CC.submissionText(st.exp, sub)) : '아직 제출 없음';
            return '<section class="ct-group"><h3><span>' + esc(g.jo) + '조</span><span class="note">' + esc(g.code) + '</span></h3>' +
                '<p class="ct-sub' + (sub && sub.rows ? ' done' : '') + '">' + subTxt + '</p>' +
                g.members.map(function (m) {
                    var x = m.st, stt = m.state;
                    var right = stt.joined ? esc(CC.stepName(st.exp, x.step)) + ' · 점 ' + (x.points == null ? '–' : x.points) + (x.submitted ? ' · ✅' : '') + '<br><span class="note">' + (stt.idle ? '💤 ' : '') + esc(CC.agoText(stt.ago)) + '</span>' : '아직 안 들어옴';
                    return '<button class="ct-mem ' + stt.cls + '" data-jo="' + esc(g.jo) + '" data-num="' + m.num + '"><b>' + m.num + '번</b><span class="ct-mem-r">' + right + '</span></button>';
                }).join('') + '</section>';
        }).join('');
        if (state.detail) showDetail(state.detail.jo, state.detail.num);
    }
    function showDetail(jo, num) {
        var st = state.last; if (!st) return;
        state.detail = { jo: jo, num: num };
        var s = CC.summarize(st), g = s.groups.filter(function (x) { return Number(x.jo) === Number(jo); })[0];
        var m = g && g.members.filter(function (x) { return x.num === Number(num); })[0];
        if (!m) return;
        $('detail').hidden = false;
        $('detailTitle').textContent = jo + '조 ' + num + '번';
        var x = m.st;
        $('detailBody').innerHTML = !x ? '<p class="note">아직 이 자리로 들어온 학생이 없어요. 학생이 QR 로 들어와 ' + esc(jo) + '조 ' + esc(num) + '번을 고르면 나타나요.</p>' :
            '<table class="ct-detail-table"><tbody>' +
            '<tr><th>상태</th><td>' + (m.state.idle ? '💤 쉬는 중 (5분 넘게 신호 없음)' : '🟢 활동 중') + '</td></tr>' +
            '<tr><th>보고 있는 단계</th><td>' + esc(CC.stepName(st.exp, x.step)) + '</td></tr>' +
            '<tr><th>마지막 활동</th><td>' + esc(new Date(x.lastSeen).toLocaleTimeString('ko-KR')) + ' (' + esc(CC.agoText(m.state.ago)) + ')</td></tr>' +
            '<tr><th>이 학생이 잰 점</th><td>' + (x.points == null ? '–' : esc(x.points) + '개') + '</td></tr>' +
            '<tr><th>선생님께 보냄</th><td>' + (x.submitted ? '✅ 보냄' : '아직') + '</td></tr>' +
            '<tr><th>조 전체 제출</th><td>' + (g.sub && g.sub.rows ? esc(CC.submissionText(st.exp, g.sub)) + ', 기기 ' + g.sub.devices + '대' + (g.sub.lastSent ? ', 마지막 ' + esc(new Date(g.sub.lastSent).toLocaleTimeString('ko-KR')) : '') : '아직') + '</td></tr>' +
            '</tbody></table>';
    }
    $('groups').addEventListener('click', function (e) {
        var b = e.target.closest('button.ct-mem'); if (!b) return;
        showDetail(+b.dataset.jo, +b.dataset.num);
        $('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('btnCloseDetail').addEventListener('click', function () { state.detail = null; $('detail').hidden = true; });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && tabs.current() === 'watch') refresh(); });
    renderPreview(); renderList(); renderWatchSel();
    LS.onUser(function (u) { state.user = u && u.google ? u : null; renderLogin(); loadClasses(); });
})();
