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
    // 첫 화면 = 진행 화면(학생과 함께 보는 화면). 수업 만들기·내려받기·보고서 AI·계정은 ⚙ 설정 안 (2026-11-20 선생님 결정)
    state.view = 'main';
    var tabs = LabUI.initTabs('#ctTabs', { key: 'class-teacher-settings', onShow: function (t) { if (state.view === 'settings') window.dispatchEvent(new CustomEvent('lab-teacher-tab', { detail: t })); } });
    function setView(v, tab) {
        state.view = v;
        var ok = !!(state.user && state.user.google);
        $('viewMain').hidden = !ok || v !== 'main';
        $('viewSettings').hidden = !ok || v !== 'settings';
        $('btnSettings').hidden = !ok || v !== 'main';
        $('btnMain').hidden = !ok || v !== 'settings';
        if (v === 'settings') { if (tab) tabs.show(tab); window.dispatchEvent(new CustomEvent('lab-teacher-tab', { detail: tabs.current() })); stopWatch(); renderDlFor(); }
        renderSub();
        window.scrollTo(0, 0);
    }
    // ----- 첫 화면 = 내 수업 목록 → 수업(#class=공간): 큰 QR → 진행 보기(#class=공간&view=run). 뒤로 가기로 앞 화면 (2026-11-20 선생님 의견) -----
    state.sub = 'list';
    function parseHash() {
        var m = /class=([a-z0-9]{24})/.exec(location.hash || '');
        return m ? { space: m[1], sub: /view=run/.test(location.hash) ? 'run' : 'qr' } : { space: '', sub: 'list' };
    }
    function go(space, sub) {
        var h = space ? '#class=' + space + (sub === 'run' ? '&view=run' : '') : '';
        if ((location.hash || '') !== h) {
            if (h) location.hash = h;   // hashchange → route
            else { history.pushState(null, '', location.pathname + location.search); route(); }
        } else route();
    }
    function route() {
        var h = parseHash();
        if (h.space && state.view === 'settings') state.view = 'main';
        if (h.space && !state.loaded) { state.pendingRoute = true; return; }   // 수업 목록을 받은 뒤 다시
        var c = h.space ? byId(h.space) : null;
        if (h.space && !c) { state.sub = 'list'; $('listMsg').className = 'note err'; $('listMsg').textContent = '⚠️ 그 수업을 찾지 못했어요 (지웠거나 다른 계정의 수업).'; }
        else state.sub = h.sub;
        if (c && state.watching !== c.space) { state.watching = c.space; state.last = null; state.detail = null; $('detail').hidden = true; }
        setView(state.view);
    }
    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);
    function renderSub() {
        var ok = !!(state.user && state.user.google), main = ok && state.view === 'main', sub = state.sub, c = watched();
        if (sub !== 'list' && !c) sub = 'list';
        $('viewList').hidden = sub !== 'list';
        $('viewClass').hidden = sub === 'list';
        $('classOut').hidden = sub !== 'qr';
        $('runPane').hidden = sub !== 'run';
        $('cornerQr').hidden = !(main && sub === 'run');
        document.body.classList.toggle('ct-has-corner', main && sub === 'run');
        if (c && sub !== 'list') {
            var e = CC.expInfo(c.exp);
            $('classTitle').innerHTML = (e ? e.icon + ' ' : '') + '<b>' + esc(e ? e.name : c.exp) + '</b> <span class="note">' + esc(c.ban) + '반 · 수업 코드 ' + esc(c.classCode) + (c.done ? ' · ✅ 마침' : '') + '</span>';
            $('btnDone').textContent = c.done ? '↩ 다시 진행 중으로' : '✅ 수업 마치기';
            $('btnShowQr').hidden = sub === 'qr';
            $('btnRefresh').hidden = sub !== 'run';
            if (!state.shown || state.shown.space !== c.space) showClass(c);
            renderWatchSel();
        }
        if (main && sub === 'run') startWatch(); else stopWatch();
    }
    $('btnToList').addEventListener('click', function () { $('doneMsg').textContent = ''; go('', 'list'); });
    $('btnShowQr').addEventListener('click', function () { var c = watched(); if (c) go(c.space, 'qr'); });
    $('btnToRun').addEventListener('click', function () { var c = watched(); if (c) go(c.space, 'run'); });
    $('btnDone').addEventListener('click', async function () {
        var c = watched(); if (!c) return;
        var to = !c.done;
        if (to && !confirm('수업 ' + c.classCode + ' 을 ‘마친 수업’으로 표시할까요?\n학생 화면과 자료는 그대로예요. 다시 눌러 되돌릴 수 있어요.')) return;
        $('doneMsg').className = 'note'; $('doneMsg').textContent = '⏳ 저장하는 중…';
        var r = await CC.classDone(c.space, to);
        if (!r.ok) { $('doneMsg').className = 'note err'; $('doneMsg').textContent = '⚠️ ' + r.error; return; }
        c.done = r.done; c.doneAt = r.done ? new Date().toISOString() : '';
        $('doneMsg').textContent = r.done ? '✅ 마친 수업으로 표시했어요. 목록 아래 ‘마친 수업’에 있어요.' : '⏳ 다시 진행 중인 수업이에요.';
        renderList(); renderSub();
    });
    $('cornerQr').addEventListener('click', function () { $('btnBig').click(); });
    $('btnSettings').addEventListener('click', function () { setView('settings'); });
    $('btnMain').addEventListener('click', function () { setView('main'); });
    $('btnGoMake').addEventListener('click', function () { setView('settings', 'make'); });
    function renderDlFor() { var c = watched(); $('dlFor').textContent = c ? '수업 ' + c.classCode + ' (' + c.ban + '반) 의 자료 — 다른 수업은 수업 목록에서 그 수업을 누른 뒤 오세요.' : '수업 목록에서 수업을 먼저 고르세요.'; }

    // ---------- 구글 로그인 ----------
    function renderLogin() {
        var u = state.user, el = $('loginNow');
        var ok = !!(u && u.google);
        el.className = 'ct-status warn';
        el.innerHTML = '🔐 수업을 만들고 보려면 선생님 구글 계정으로 로그인하세요. (학생은 로그인하지 않아요)';
        $('loginCard').hidden = ok;
        // 계정 정보(이메일)는 ⚙ 설정 → 계정 안에만
        $('acctNow').className = 'ct-status' + (ok ? ' ok' : '');
        $('acctNow').innerHTML = ok ? '✅ 로그인됨: <b>' + esc(u.name || '선생님') + '</b>' + (u.email ? ' <span class="note">(' + esc(u.email) + ')</span>' : '') : '로그인하지 않았어요.';
        $('btnLogin').hidden = ok; $('btnLogout').hidden = !ok;
        setView(ok ? state.view : 'main');
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
        await LS.signOut(); state.user = null; state.classes = []; state.watching = null; state.sub = 'list'; renderLogin(); renderList();
    });
    // 개발 데이터 수집: 선생님 폰으로 이 화면을 열어 같은 계정으로 로그인 (js/dev-collect.js)
    // 개발 메뉴는 사이트 관리 교사 계정(firestore.rules 의 isTeacher 와 같은 기준 — LabStore.isTeacher)으로 로그인했을 때만 (2026-11-20 선생님 결정)
    function renderDev() {
        var u = state.user;
        $('devBox').hidden = true;
        if (CONFIG.devCollect !== true || !u || !u.google) return;
        LS.isTeacher().then(function (yes) {
            if (!yes || state.user !== u) return;
            $('devBox').hidden = false;
            $('devQr').innerHTML = qrSvg(location.href.split('#')[0].split('?')[0]) || '';
        }, function () { /* 확인 못 하면 숨김 */ });
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
        state.watching = r.space; state.shown = null;
        renderList();
        state.view = 'main'; go(r.space, 'qr');   // 만든 수업의 첫 화면(큰 QR)으로
    });
    function studentLink(c) { return CC.studentUrl(siteRoot(), c.exp, c.classCode, c.space); }
    // level 'H': 오류 정정 높게 (멀리서 확대해 찍는 오른쪽 위 QR)
    function qrSvg(text, level) {
        if (typeof window.qrcode !== 'function') return null;
        var qr = window.qrcode(0, level || 'M'); qr.addData(text); qr.make();
        return qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
    }
    function expireNote(c) { var t = CC.expireText(c.expireAt); return t ? '🗓 이 수업의 학생 자료는 ' + t + '에 저절로 지워져요. 그 전에 ⚙ 설정 → 📥 자료 내려받기에서 받아 두세요.' : ''; }
    function showClass(c) {
        var link = studentLink(c), e = CC.expInfo(c.exp);
        $('classOut').hidden = false;
        $('outTitle').textContent = c.ban + '반 · ' + (e ? e.name : c.exp) + ' · ' + (c.mode === 'team' ? '팀 이름으로 입장 (최대 ' + c.groups.length + '팀)' : c.nStudents + '명, ' + c.groups.length + '개 조 · AI 질문 조마다 ' + (c.aiLimit == null ? 20 : c.aiLimit) + '번');
        $('outCode').textContent = c.classCode;
        $('outLink').href = link; $('outLink').textContent = link;
        $('outExpire').textContent = expireNote(c);
        $('qr').innerHTML = qrSvg(link) || '<p class="note">QR 을 만드는 도구를 불러오지 못했어요(인터넷 확인). 학생은 메인 페이지 → 학생으로 시작에서 수업 코드를 넣어도 돼요.</p>';
        $('cornerQrImg').innerHTML = qrSvg(link, 'H') || '';
        $('cornerCode').textContent = c.classCode;
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
        state.loaded = true;
        renderList(); route();
    }
    function byId(space) { return state.classes.filter(function (c) { return c.space === space; })[0] || null; }
    function whenText(iso) {
        var d = new Date(iso); if (isNaN(d)) return '';
        return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
    }
    function classCard(c) {
        var e = CC.expInfo(c.exp), si = CC.stageInfo(c.exp, c.stage), en = e && e.steps && si ? e.steps[si.cur] : '';
        var who = c.mode === 'team' ? '최대 ' + c.groups.length + '팀' : c.nStudents + '명 · ' + c.groups.length + '개 조';
        var st = c.done ? '<b class="ok">✅ 마침</b>' + (c.doneAt ? '<br><span class="note">' + esc(whenText(c.doneAt)) + '</span>' : '') : '<b>⏳ 진행 중</b>' + (si ? '<br><span class="note">' + (si.all ? '모든 단계 열림' : '단계 ' + si.n + ' / ' + si.gate.length + (en ? ' · ' + esc(en) : '')) + '</span>' : '');
        return '<div class="ct-cls' + (c.done ? ' done' : '') + '"><button type="button" class="ct-cls-main" data-open="' + esc(c.space) + '">' +
            '<span class="ct-cls-ic" aria-hidden="true">' + esc(e ? e.icon : '🧪') + '</span>' +
            '<span class="ct-cls-body"><b>' + esc(e ? e.name : c.exp) + '</b><span class="note">' + esc(c.ban) + '반 · ' + esc(who) + ' · 코드 ' + esc(c.classCode) + '</span>' +
            '<span class="note">📅 ' + esc(whenText(c.created)) + ' 만듦</span></span>' +
            '<span class="ct-cls-st">' + st + '</span></button>' +
            '<span class="ct-cls-act"><button type="button" class="secondary" data-reopen="' + esc(c.space) + '" title="수업 코드로 찾기 다시 열기 (2일)">🔓 코드 다시 열기</button><button type="button" class="danger" data-del="' + esc(c.space) + '">🗑 지우기</button></span></div>';
    }
    function renderList() {
        window.dispatchEvent(new CustomEvent('lab-classes', { detail: state.user && state.user.google ? state.classes : [] }));   // ③ 보고서 AI (js/class-teacher-ai.js)
        var el = $('classList'), ok = !!(state.user && state.user.google);
        var sorted = state.classes.slice().sort(function (a, b) { return String(b.created).localeCompare(String(a.created)); });
        var live = sorted.filter(function (c) { return !c.done; }), done = sorted.filter(function (c) { return c.done; });
        $('noClass').hidden = !ok || !!state.classes.length || !state.loaded;
        el.innerHTML = !ok ? '' : live.length ? live.map(classCard).join('') : state.classes.length ? '<p class="note">진행 중인 수업이 없어요. 아래 ‘마친 수업’을 열거나 새 수업을 만드세요.</p>' : '';
        $('doneBox').hidden = !done.length;
        $('doneSum').textContent = '✅ 마친 수업 (' + done.length + ')';
        $('doneList').innerHTML = done.map(classCard).join('');
    }
    $('viewList').addEventListener('click', async function (e) {
        var b = e.target.closest('button[data-open], button[data-reopen], button[data-del]'); if (!b) return;
        var c = byId(b.dataset.open || b.dataset.del || b.dataset.reopen);
        if (!c) return;
        if (b.dataset.open) { go(c.space, 'qr'); return; }
        if (b.dataset.reopen) {
            $('listMsg').className = 'note'; $('listMsg').textContent = '⏳ 수업 코드를 다시 여는 중…';
            var ro = await CC.reopenCode(c.space);
            if (!ro.ok) { $('listMsg').className = 'note err'; $('listMsg').textContent = '⚠️ ' + ro.error; return; }
            $('listMsg').textContent = '🔓 수업 코드 ' + c.classCode + ' 로 ' + new Date(ro.joinUntil).toLocaleString('ko-KR') + ' 까지 찾을 수 있어요.';
            return;
        }
        if (confirm('수업 ' + c.classCode + ' 과 학생들이 보낸 자료를 지금 모두 지울까요? 되돌릴 수 없어요. 필요하면 먼저 ② 에서 내려받으세요.')) {
            $('listMsg').className = 'note'; $('listMsg').textContent = '⏳ 지우는 중…';
            var r = await CC.deleteClass(c.space);
            if (!r.ok) { $('listMsg').className = 'note err'; $('listMsg').textContent = '⚠️ ' + r.error; return; }
            $('listMsg').textContent = '🗑 수업 ' + c.classCode + ' 을 지웠어요.';
            state.classes = state.classes.filter(function (x) { return x !== c; });
            if (state.shown === c) state.shown = null;
            if (state.watching === c.space) state.watching = null;
            renderList();
        }
    });

    // ---------- ② 진행 보기 ----------
    function renderWatchSel() {
        var c = watched();
        $('dlGroup').innerHTML = '<option value="">전체 조</option>' + (c ? c.groups.map(function (g) { return '<option value="' + esc(g.code) + '">' + g.jo + '조 (' + esc(g.code) + ')</option>'; }).join('') : '');
        $('watchExpire').textContent = c ? expireNote(c) : '';
        $('dlCard').hidden = !c;
        renderStage(); renderDlFor();
        var team = !!(c && c.mode === 'team');
        $('boardCard').hidden = !team;
        if (team && state.setupFor !== c.space) { state.setupFor = c.space; $('teamSetupEdit').innerHTML = teamSetupHtml('te-', c.setup); $('setupMsg').textContent = ''; }
    }
    // ----- 학생에게 여는 단계 (▶ 다음 단계 열기) -----
    function renderStage() {
        var c = watched(), si = c && CC.stageInfo(c.exp, c.stage), e = c && CC.expInfo(c.exp);
        $('stageCard').hidden = !si;
        if (!si) return;
        var name = function (k) { return (e && e.steps && e.steps[k]) || k; };
        $('stageNow').innerHTML = si.all ? '✅ 모든 단계 열림' + (c.stage == null ? ' <span class="note">(예전 수업)</span>' : '') : '🔓 ' + esc(name(si.cur)) + ' <span class="note">까지 열림 (' + si.n + ' / ' + si.gate.length + ')</span>';
        $('stageSteps').innerHTML = si.gate.map(function (k, i) { return '<li class="' + (i < si.n ? 'open' : 'lock') + (i === si.n - 1 && !si.all ? ' cur' : '') + '">' + (i < si.n ? '' : '🔒 ') + esc(name(k)) + '</li>'; }).join('');
        $('btnStageNext').disabled = si.all || state.stageBusy;
        $('btnStageNext').textContent = si.all ? '▶ 다음 단계 열기' : '▶ 다음 단계 열기: ' + name(si.gate[si.n]);
        $('btnStagePrev').disabled = si.n <= 1 || state.stageBusy;
        $('btnStageAll').disabled = si.all || state.stageBusy;
    }
    async function setStage(to) {
        var c = watched(); if (!c) return;
        var si = CC.stageInfo(c.exp, c.stage); if (!si) return;
        state.stageBusy = true; renderStage();
        $('stageMsg').className = 'note'; $('stageMsg').textContent = '⏳ 학생 화면에 알리는 중…';
        var r = await CC.classStage(c.space, to >= si.gate.length ? CC.STAGE_ALL : to);
        state.stageBusy = false;
        if (!r.ok) { $('stageMsg').className = 'note err'; $('stageMsg').textContent = '⚠️ ' + r.error; renderStage(); return; }
        c.stage = r.stage;
        var n = CC.stageInfo(c.exp, c.stage);
        $('stageMsg').textContent = '✅ ' + (n.all ? '모든 단계를 열었어요' : '‘' + ((CC.expInfo(c.exp).steps || {})[n.cur] || n.cur) + '’ 까지 열었어요') + '. 학생 화면이 저절로 바뀌어요.';
        renderStage();
    }
    $('btnStageNext').addEventListener('click', function () { var c = watched(), si = c && CC.stageInfo(c.exp, c.stage); if (si && !si.all) setStage(si.n + 1); });
    $('btnStagePrev').addEventListener('click', function () {
        var c = watched(), si = c && CC.stageInfo(c.exp, c.stage); if (!si || si.n <= 1) return;
        if (!confirm('학생 화면에서 마지막 단계를 다시 잠글까요? (그 단계에 있던 학생은 앞 단계로 돌아가요)')) return;
        setStage(si.n - 1);
    });
    $('btnStageAll').addEventListener('click', function () { setStage(CC.STAGE_ALL); });
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
    $('btnBoardBig').addEventListener('click', function () {
        var c = watched(); $('boardBigQr').innerHTML = c ? (qrSvg(studentLink(c), 'H') || '') + '<b>' + esc(c.classCode) + '</b>' : '';
        $('boardBig').hidden = false; $('btnBoardClose').focus();
    });
    $('btnBoardClose').addEventListener('click', function () { $('boardBig').hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('boardBig').hidden = true; });
    $('btnRefresh').addEventListener('click', function () { refresh(); });
    function watched() { return byId(state.watching); }
    function startWatch() { stopWatch(); refresh(); }
    function stopWatch() { clearTimeout(state.timer); state.timer = null; }
    // 학생 신호가 오면 바로 다시 그림 (Firestore 실시간)
    function liveFor(c) {
        if (!c || state.liveSpace === c.space) return;
        if (state.liveOff) { try { state.liveOff(); } catch (e) { /* 무시 */ } state.liveOff = null; }
        state.liveSpace = c.space;
        LS.watchClass('lab:' + c.space, c.classCode, function () { if (state.view === 'main' && state.sub === 'run' && !document.hidden) refresh(); })
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
        }
        if (state.again) { state.again = false; return refresh(); }
        if (state.view === 'main' && state.sub === 'run') state.timer = setTimeout(refresh, POLL_MS);
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
    document.addEventListener('visibilitychange', function () { if (!document.hidden && state.view === 'main' && state.sub === 'run') refresh(); });
    renderPreview(); renderList();
    LS.onUser(function (u) { state.user = u && u.google ? u : null; renderLogin(); loadClasses(); });
})();
