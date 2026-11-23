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
        var v = /view=(run|present)/.exec(location.hash || '');
        return m ? { space: m[1], sub: v ? v[1] : 'qr' } : { space: '', sub: 'list' };
    }
    function go(space, sub) {
        var h = space ? '#class=' + space + (sub === 'run' || sub === 'present' ? '&view=' + sub : '') : '';
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
        var live = sub === 'run' || sub === 'present';
        $('runPane').hidden = sub !== 'run';
        $('presentPane').hidden = sub !== 'present';
        // 오른쪽 위 QR 은 진행 화면에만 — 🎬 발표 보기에서는 아래 띠의 '📱 QR' 로 (2026-11-23 '교사 조작은 한곳')
        $('cornerQr').hidden = !(main && sub === 'run');
        document.body.classList.toggle('ct-has-corner', main && sub === 'run');
        document.body.classList.toggle('ct-presenting', main && sub === 'present');
        if (c && sub !== 'list') {
            var e = CC.expInfo(c.exp);
            $('classTitle').innerHTML = (e ? e.icon + ' ' : '') + '<b>' + esc(e ? e.name : c.exp) + '</b> <span class="note">' + esc(c.ban) + '반 · 수업 코드 ' + esc(c.classCode) + (c.done ? ' · ✅ 마침' : '') + '</span>';
            $('btnDone').textContent = c.done ? '↩ 다시 진행 중으로' : '✅ 수업 마치기';
            $('btnShowQr').hidden = sub === 'qr';
            $('btnRefresh').hidden = sub !== 'run';
            $('btnPresent').hidden = !CC.gateSteps(c.exp);
            $('btnToRun').textContent = firstSub(c) === 'present' ? '다음 → 🎬 발표 보기' : '다음 → 진행 보기';
            // 설명 화면 내용이 있는 실험이면 '🔓 모든 풀이 열기'
            $('lessonTeach').hidden = true;
            if (window.LessonSlides && !/:/.test(c.exp)) window.LessonSlides.load(c.exp).then(function (d) { if (d && watched() === c) $('lessonTeach').hidden = false; });
            if (!state.shown || state.shown.space !== c.space) showClass(c);
            renderWatchSel();
        }
        if (main && live) startWatch(); else stopWatch();
        if (main && sub === 'present' && c) openPresent(c); else closePresent();
    }
    function isLive() { return state.sub === 'run' || state.sub === 'present'; }
    $('btnToList').addEventListener('click', function () { $('doneMsg').textContent = ''; go('', 'list'); });
    $('btnShowQr').addEventListener('click', function () { var c = watched(); if (c) go(c.space, 'qr'); });
    // 큰 QR → '다음 →' (2026-11-23 선생님 '발표 보기를 첫 화면으로'): 단계 열기가 있는 실험은 🎬 발표 보기(그 단계 설명 장부터), 없으면 진행 화면
    function firstSub(c) { return c && CC.gateSteps(c.exp) ? 'present' : 'run'; }
    $('btnToRun').addEventListener('click', function () { var c = watched(); if (c) go(c.space, firstSub(c)); });
    $('btnPresent').addEventListener('click', function () { var c = watched(); if (c) go(c.space, 'present'); });
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
        var fl = document.querySelector('input[name=inFlow]:checked');
        if (!team && CC.canFlow(o.exp) && fl && fl.value === 'hd') o.flow = 'hd';
        return o;
    }
    function renderPreview() {
        var o = inputs(), team = o.mode === 'team', g = team ? (o.nTeams >= 1 && o.nTeams <= 40 && o.nTeams % 1 === 0 ? [o.nTeams] : []) : CC.splitGroups(o.nStudents, o.groupSize);
        var ok = g.length && o.ban >= 1 && o.ban <= 99 && o.ban % 1 === 0 && !!o.exp && o.aiLimit >= 0 && o.aiLimit <= 200 && o.aiLimit % 1 === 0;
        $('btnCreate').disabled = !ok;
        $('customRow').hidden = $('inExp').value !== 'custom';
        $('rowN').hidden = $('rowSize').hidden = $('rowAi').hidden = team; $('rowTeams').hidden = $('teamBox').hidden = !team;
        $('rowFlow').hidden = team || !CC.canFlow(o.exp);
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
            + ' · 🤖 AI 질문 조마다 ' + o.aiLimit + '번' + (CC.canFlow(o.exp) ? ' · ' + CC.FLOW_NAMES[CC.flowOf(o.flow)] : '') : '반(1~99), 학생 수(1~60), 조별 인원(1~10), AI 질문 한도(0~200)를 정수로 넣어 주세요.';
    }
    ['inBan', 'inN', 'inSize', 'inExp', 'inCustom', 'inAiLimit', 'inTeams'].forEach(function (id) { $(id).addEventListener('input', renderPreview); });
    $('teamSetup').addEventListener('input', renderPreview); $('teamSetup').addEventListener('change', renderPreview);
    document.querySelectorAll('input[name=inFlow]').forEach(function (r) { r.addEventListener('change', renderPreview); });
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
        $('outTitle').textContent = c.ban + '반 · ' + (e ? e.name : c.exp) + ' · ' + (c.mode === 'team' ? '팀 이름으로 입장 (최대 ' + c.groups.length + '팀)' : c.nStudents + '명, ' + c.groups.length + '개 조 · AI 질문 조마다 ' + (c.aiLimit == null ? 20 : c.aiLimit) + '번' + (CC.canFlow(c.exp) || c.flow === 'hd' ? ' · ' + CC.FLOW_NAMES[CC.flowOf(c.flow)] : ''));
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
        var e = CC.expInfo(c.exp), si = CC.stageInfo(c.exp, c.stage, c.flow), en = si ? CC.stepName(c.exp, si.cur, c.flow) : '';
        var who = c.mode === 'team' ? '최대 ' + c.groups.length + '팀' : c.nStudents + '명 · ' + c.groups.length + '개 조';
        var st = c.done ? '<b class="ok">✅ 마침</b>' + (c.doneAt ? '<br><span class="note">' + esc(whenText(c.doneAt)) + '</span>' : '') : '<b>⏳ 진행 중</b>' + (si ? '<br><span class="note">' + (si.all ? '모든 단계 열림' : '단계 ' + si.n + ' / ' + si.gate.length + (en ? ' · ' + esc(en) : '')) + '</span>' : '');
        return '<div class="ct-cls' + (c.done ? ' done' : '') + '"><button type="button" class="ct-cls-main" data-open="' + esc(c.space) + '">' +
            '<span class="ct-cls-ic" aria-hidden="true">' + esc(e ? e.icon : '🧪') + '</span>' +
            '<span class="ct-cls-body"><b>' + esc(e ? e.name : c.exp) + '</b><span class="note">' + esc(c.ban) + '반 · ' + esc(who) + ' · 코드 ' + esc(c.classCode) + (c.flow === 'hd' ? ' · 🔍 가설연역' : '') + '</span>' +
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
        var c = watched(), si = c && CC.stageInfo(c.exp, c.stage, c.flow), e = c && CC.expInfo(c.exp);
        $('stageCard').hidden = !si;
        if (!si) return;
        var name = function (k) { return CC.stepName(c.exp, k, c.flow); };
        $('stageNow').innerHTML = si.all ? '✅ 모든 단계 열림' + (c.stage == null ? ' <span class="note">(예전 수업)</span>' : '') : '🔓 ' + esc(name(si.cur)) + ' <span class="note">까지 열림 (' + si.n + ' / ' + si.gate.length + ')</span>';
        $('stageSteps').innerHTML = si.gate.map(function (k, i) { return '<li class="' + (i < si.n ? 'open' : 'lock') + (i === si.n - 1 && !si.all ? ' cur' : '') + '">' + (i < si.n ? '' : '🔒 ') + esc(name(k)) + '</li>'; }).join('');
        $('btnStageNext').disabled = si.all || state.stageBusy;
        $('btnStageNext').textContent = si.all ? '▶ 다음 단계 열기' : '▶ 다음 단계 열기: ' + name(si.gate[si.n]);
        $('btnStagePrev').disabled = si.n <= 1 || state.stageBusy;
        $('btnStageAll').disabled = si.all || state.stageBusy;
        renderPresentBar();
        renderWait(state.last && state.last.mode === 'team' ? state.boardRows : null);
    }
    async function setStage(to) {
        var c = watched(); if (!c) return;
        var si = CC.stageInfo(c.exp, c.stage, c.flow); if (!si) return;
        state.stageBusy = true; renderStage();
        $('stageMsg').className = 'note'; $('stageMsg').textContent = '⏳ 학생 화면에 알리는 중…';
        var r = await CC.classStage(c.space, to >= si.gate.length ? CC.STAGE_ALL : to);
        state.stageBusy = false;
        if (!r.ok) { $('stageMsg').className = 'note err'; $('stageMsg').textContent = '⚠️ ' + r.error; renderStage(); return false; }
        c.stage = r.stage;
        var n = CC.stageInfo(c.exp, c.stage, c.flow);
        $('stageMsg').textContent = '✅ ' + (n.all ? '모든 단계를 열었어요' : '‘' + CC.stepName(c.exp, n.cur, c.flow) + '’ 까지 열었어요') + '. 학생 화면이 저절로 바뀌어요.';
        renderStage();
        return true;
    }
    /* 단계를 열면 설명부터 (2026-11-23 선생님 '열면 설명부터'): 진행 화면에서 '▶ 다음 단계 열기' 로 열었고 그 단계 설명 장이 있으면
       🎬 발표 보기로 넘어가 그 단계 첫 장 (발표 보기를 열면 가장 뒤에 연 단계 설명부터 — lessonLoad). '◀ 하나 되돌리기'·'모두 열기' 는 진행 화면 그대로 */
    function hasSlides(c, gate) {
        if (!LSx || /:/.test(c.exp)) return Promise.resolve(false);
        return LSx.load(c.exp).then(function (def) { return !!(def && LSx.slidesFor(def, gate, c.flow).length); }).catch(function () { return false; });
    }
    $('btnStageNext').addEventListener('click', function () {
        var c = watched(), si = c && CC.stageInfo(c.exp, c.stage, c.flow); if (!si || si.all) return;
        var nx = si.gate[si.n], from = state.sub;
        setStage(si.n + 1).then(function (ok) {
            if (!ok || from !== 'run' || state.sub !== 'run' || watched() !== c) return;
            hasSlides(c, nx).then(function (yes) { if (yes && state.sub === 'run' && watched() === c) go(c.space, 'present'); });
        });
    });
    $('btnStagePrev').addEventListener('click', function () {
        var c = watched(), si = c && CC.stageInfo(c.exp, c.stage, c.flow); if (!si || si.n <= 1) return;
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
    // 행사(팀 수업): 팀 폰은 화면이 켜져 있는 동안 1분마다 신호(js/film-rocket.js beatEvery) → 2분 넘게 없으면 🔌 끊김(와이파이·화면 꺼짐)
    var OFF_MS = 2 * 60 * 1000;
    function boardRows(st) {
        var subs = {}; (st.submissions || []).forEach(function (x) { subs[x.jo] = x; });
        var prog = {}; (st.students || []).forEach(function (x) { prog[x.jo] = x; });
        return (st.teams || []).map(function (t) {
            var sub = subs[t.jo], sm = (sub && sub.summary) || {}, pg = prog[t.jo] || null;
            // 팀 폰은 앞 단계를 끝내고 잠김 화면에서 기다리면 '앞단계-done', 끝낸 단계에서 결과를 보거나 더 재면 '단계-more' (js/film-rocket.js stepNow)
            var done = pg && /^([a-z0-9_]+)-(done|more)$/.exec(String(pg.step || '')), ss = CC.studentState(pg, st.now);
            return { jo: t.jo, name: t.name, score: Number(sm['팀 점수']) || 0, quiz: sm['퀴즈 맞힘'], tDiff: sm['시간 도전 차이(초)'], tOk: sm['시간 도전 성공'] === 1,
                hMax: sm['높이 최고(%)'], hDiff: sm['높이 도전 차이(%)'], hOk: sm['높이 도전 성공'] === 1, spark: sm['생각 바뀜 ✨'],
                kinds: { t1: Number(sm['1차시 값 가짓수']) || 0, t2: Number(sm['2차시 값 가짓수']) || 0 },
                // 💬 예측·정리 문장 (팀 폰 js/film-rocket.js 의 🔮 예측·✍️ 정리 문장)
                // 2026-11-21 비계 4: 무엇을 바꿨는지·우리 숫자(증거) → 예측(까닭) → 결과 · 왜냐하면
                talk: ['1차시', '2차시'].map(function (n) {
                    var e = sm[n + ' 증거'], g = sm[n + ' 예측'], r = sm[n + ' 결과'], w = sm[n + ' 까닭'];
                    return e || g || r || w ? n + ': ' + (e ? '🔧 ' + e + ' · ' : '') + (g ? '예측 ' + g : '') + (g && r ? ' → ' : '') + (r ? '결과 ' + r : '') + (w ? ' · 왜냐하면 ' + w : '') : '';
                }).filter(Boolean),
                step: !pg ? '–' : done ? CC.stepName(st.exp, done[1], st.flow) + (done[2] === 'more' ? ' ✓ 끝냄 · 더 재는 중' : ' ✓ 기다림') : CC.stepName(st.exp, pg.step, st.flow),
                doneStage: done ? done[1] : '', at: done ? done[1] : pg ? String(pg.step || '') : '', joined: !!pg,
                off: !!(ss.joined && ss.ago != null && ss.ago > OFF_MS), state: ss };
        }).sort(function (a, b) { return b.score - a.score || a.jo - b.jo; });
    }
    // 열린 단계 카드·결과판 크게 보기: '⏳ 기다리는 팀 N / 들어온 팀 M' (기다림 = 지금 열린 마지막 단계를 끝내고 잠김 화면)
    function renderWait(rows) {
        var c = watched(), si = c && c.mode === 'team' && CC.stageInfo(c.exp, c.stage);
        var els = [$('stageWait'), $('boardBigWait')];
        if (!si || !rows) { els.forEach(function (e) { e.hidden = true; }); return; }
        // 앞 단계에 남은 팀: 지금 열린 마지막 단계보다 앞 단계에 있는 팀 (끝낸 앞 단계에서 더 하는 중이어도)
        var curI = si.gate.indexOf(si.cur);
        rows.forEach(function (r) { var k = si.gate.indexOf(r.at); r.behind = !!(r.joined && r.doneStage !== si.cur && (k < 0 || k < curI)); });
        var behind = rows.filter(function (r) { return r.behind; });
        var w = rows.filter(function (r) { return r.doneStage === si.cur; }).length, m = rows.length, off = rows.filter(function (r) { return r.off; }).length;
        if (si.all) {   // 모두 열림: 기다림은 없음 — 끊긴 팀만 알림
            els.forEach(function (e) { e.innerHTML = off ? '<span class="ct-off">🔌 연결 끊김 ' + off + '팀</span> · 결과판에서 마지막 신호를 봐요' : ''; e.hidden = !off; e.classList.remove('all'); });
            return;
        }
        var all = m > 0 && w === m;
        var html = all ? '✅ <b>모든 팀이 기다려요</b> (' + w + ' / ' + m + ') · 다음 단계를 열어도 돼요'
            : '⏳ 기다리는 팀 <b>' + w + '</b> / 들어온 팀 <b>' + m + '</b>' + (m ? '' : ' · 아직 들어온 팀이 없어요');
        if (off) html += ' <span class="ct-off">· 🔌 연결 끊김 ' + off + '팀</span>';
        if (behind.length) html += '<details class="ct-behind"><summary>↩ 앞 단계에 남은 팀 <b>' + behind.length + '</b></summary>' +
            behind.map(function (r) { return '<span class="ct-behind-team">' + esc(r.name) + ' · ' + esc(r.step) + '</span>'; }).join('') + '</details>';
        els.forEach(function (e) { e.innerHTML = html; e.hidden = false; e.classList.toggle('all', all); });
    }
    function boardTable(rows, big) {
        if (!rows.length) return '<p class="note">아직 들어온 팀이 없어요. 가족이 QR 로 들어와 팀 이름을 정하면 여기에 나와요.</p>';
        var n = function (v, unit) { return v == null || v === '' ? '–' : esc(Math.abs(Number(v))) + unit; };
        return '<div class="ct-board-wrap"><table class="ct-board"><thead><tr><th>팀</th><th>⭐ 점수</th><th>⏱ 시간 도전</th><th>🚀 최고 높이</th><th>🎯 높이 도전</th><th>💬 생각</th>' + (big ? '' : '<th>지금</th>') + '</tr></thead><tbody>' +
            rows.map(function (r, i) {
                return '<tr><td>' + (i < 3 && r.score ? ['🥇', '🥈', '🥉'][i] + ' ' : '') + '<b>' + esc(r.name) + '</b>' +
                    (r.off ? ' <span class="ct-off" title="마지막 신호 ' + esc(CC.agoText(r.state.ago)) + '">🔌 ' + esc(CC.agoText(r.state.ago)) + '</span>' : '') +
                    (big && r.doneStage ? ' <span class="ct-waitmark">✓ 기다림</span>' : '') + '</td><td><b>' + r.score + '</b></td>' +
                    '<td class="' + (r.tOk ? 'ok' : '') + '">' + (r.tDiff == null ? '–' : (r.tOk ? '🎉 ' : '') + n(r.tDiff, '초 차이')) + '</td>' +
                    '<td>' + (r.hMax == null ? '–' : esc(r.hMax) + '%') + '</td>' +
                    '<td class="' + (r.hOk ? 'ok' : '') + '">' + (r.hDiff == null ? '–' : (r.hOk ? '🎉 ' : '') + n(r.hDiff, '% 차이')) + '</td>' +
                    // 💬 은 크게 보기(프로젝터)에도 — 팀 이름은 지금처럼
                    '<td class="note ct-talk">' + (r.talk && r.talk.length ? r.talk.map(function (t) { return '<div>' + esc(t) + '</div>'; }).join('') : '–') + '</td>' +
                    (big ? '' : '<td class="note' + (r.doneStage ? ' ct-waitcell' : '') + (r.behind ? ' ct-behindcell' : '') + '">' + (r.behind ? '↩ ' : '') + esc(r.step) + (r.behind ? ' (앞 단계)' : '') + '</td>') + '</tr>';
            }).join('') + '</tbody></table></div>';
    }
    function renderBoard(st) {
        var rows = boardRows(st);
        $('watchSum').innerHTML = '<div>들어온 팀<b>' + rows.length + ' / ' + (st.groups || []).length + '</b></div>' +
            '<div>활동 중<b>' + rows.filter(function (r) { return r.state.joined && !r.state.idle; }).length + '</b></div>' +
            '<div>시간 도전 성공<b>' + rows.filter(function (r) { return r.tOk; }).length + '</b></div>' +
            '<div>높이 도전 성공<b>' + rows.filter(function (r) { return r.hOk; }).length + '</b></div>';
        state.boardRows = rows; renderWait(rows);
        $('board').innerHTML = boardTable(rows, false);
        $('boardBigBody').innerHTML = boardTable(rows, true);
        renderPresentBar();
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
        LS.watchClass('lab:' + c.space, c.classCode, function () { if (state.view === 'main' && isLive() && !document.hidden) refresh(); })
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
            // 실험별 결과 부품(플랑크 js/class-teacher-planck.js, 🧩 모아 보기 js/class-teacher-gather.js 등)에 지금 보는 수업·받은 진행 자료를 알림
            try { window.dispatchEvent(new CustomEvent('ct-watch', { detail: { cls: c, status: r } })); } catch (e) { /* 무시 */ }
            presentLive();   // 발표 화면: 🏆·🧩 모아 보기·응답 장의 팀 답
        }
        if (state.again) { state.again = false; return refresh(); }
        if (state.view === 'main' && isLive()) state.timer = setTimeout(refresh, POLL_MS);
    }
    // ---------- 🎬 발표 보기 (2026-11-20 선생님 "수업 진행하기에서는 학생의 화면이 보이도록", "웹앱만으로 프레젠테이션을 대신") ----------
    // 그 수업의 실험 페이지를 발표용(?present=1)으로 iframe 에 띄움: 학생으로 참여하지 않고(자리·하트비트·조 공유 없음) 단계 잠금은 학생과 같게.
    // 선생님은 → · PageDown · Space 로 그 단계 안의 작은 탭을 넘기고(학생 폰은 그대로), 단계 끝에서 한 번 더 누르면 '다음 단계를 열까요?'
    var pres = { space: '', ask: false, layout: 'side', frameGate: '' };
    // ⇔ 나란히(설명 + 학생 화면) / ⬜ 설명만 — 이 브라우저에 기억 (기본 나란히)
    try { if (localStorage.getItem('ct-present-layout') === 'deck') pres.layout = 'deck'; } catch (e) { /* 무시 */ }
    function applyLayout() {
        $('presentPane').classList.toggle('lay-side', pres.layout === 'side');
        if (typeof lesson !== 'undefined' && lesson.on && LSx) LSx.fit($('pSlides'));
    }
    applyLayout();
    /* 학생 화면 칸 비율 (2026-11-23 선생님 "이부분 비율 조절해서 최적화해"): 칸 높이에 맞춘 실제 기기 비율, 남는 폭은 설명 장으로
       · 행사형(로켓) = 폰 9 : 19.5 (틀 테두리까지), 안쪽은 틀을 채우게 키움 (js/lab-ui.js presentFit, iframe data-fit="phone")
       · 7단계 = 칸 높이를 다 쓰는 세로 칸(폭의 26 %, 1600 폭 아래는 34 %)에 노트북 화면을 좁은 배치로 — 16 : 10 노트북 틀은 위아래가 비고 글자가 너무 작아 쓰지 않음 */
    var PHONE_AR = 9 / 19.5, STEP_W = 0.26, STEP_W_SMALL = 0.34;
    function sizeFrame() {
        var pane = $('presentPane'), box = pane.querySelector('.ct-pframe'), f = $('presentFrame');
        if (!box || pane.hidden) return;
        var r = box.getBoundingClientRect(); if (!r.height) return;
        var phone = pane.classList.contains('phone'), fw;
        if (phone) fw = Math.round(r.height * PHONE_AR);
        else fw = Math.round(r.width * (window.innerWidth < 1600 ? STEP_W_SMALL : STEP_W));   // 작은 노트북 화면은 학생 화면이 너무 좁지 않게 조금 더
        var v = fw + 'px';
        if (box.style.getPropertyValue('--fw') !== v) box.style.setProperty('--fw', v);
        var fit = phone ? 'phone' : '';
        if ((f.getAttribute('data-fit') || '') !== fit) {
            if (fit) f.setAttribute('data-fit', fit); else f.removeAttribute('data-fit');
            try { f.contentWindow.dispatchEvent(new Event('resize')); } catch (e) { /* 무시 */ }
        }
    }
    if (window.ResizeObserver) new ResizeObserver(sizeFrame).observe(document.querySelector('#presentPane .ct-pframe'));
    if (window.MutationObserver) new MutationObserver(sizeFrame).observe($('presentPane'), { attributes: true, attributeFilter: ['class', 'hidden'] });
    window.addEventListener('resize', sizeFrame);
    // 왼쪽 위 작은 QR (늦게 온 팀·조가 찍음) — 누르면 크게
    $('pQr').addEventListener('click', function () { $('btnBig').click(); });
    function frameDoc() { try { var f = $('presentFrame'); return f && f.contentDocument && f.contentDocument.body ? f.contentDocument : null; } catch (e) { return null; } }
    function shown(el) { return !!(el && el.getClientRects().length); }
    // 발표 틀 주소 바꾸기: src 를 바꾸면 브라우저 뒤로 가기 기록에 쌓여 '뒤로' 가 틀 안에서만 돎 → replace 로 (2026-11-23 발표 보기가 첫 화면)
    function setFrame(url) {
        var f = $('presentFrame');
        try { if (f.contentWindow) { f.contentWindow.location.replace(url); return; } } catch (e) { /* 아래로 */ }
        f.src = url;
    }
    function isPhoneFrame(c) { return c.mode === 'team' || c.exp === 'rocket'; }
    function openPresent(c) {
        $('presentPane').classList.toggle('phone', isPhoneFrame(c));
        if (pres.space !== c.space) {
            pres.space = c.space; pres.ask = false; pres.open = Array.isArray(c.lessonOpen) ? c.lessonOpen.slice() : [];
            var u = new URL(studentLink(c));
            u.searchParams.set('present', '1');
            setFrame(u.href);
            lessonLoad(c);
            $('pQrImg').innerHTML = qrSvg(studentLink(c), 'H') || '';
            $('pQrCode').textContent = c.classCode;
        }
        sizeFrame();
        renderPresentBar();
    }
    function closePresent() {
        if (!pres.space) return;
        lessonOff();   // 학생 화면의 👀 띠를 내림 (수업 문서 lesson.on = false)
        setPanel('');
        pres.space = ''; pres.ask = false; setFrame('about:blank'); $('pAsk').hidden = true;
        lesson.def = null;
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () { /* 무시 */ });
    }
    function stepNames(c) { return function (k) { return CC.stepName(c.exp, k, c.flow); }; }
    function renderPresentBar() {
        var c = watched(); if (!c || !pres.space) return;
        var si = CC.stageInfo(c.exp, c.stage, c.flow), name = stepNames(c);
        // 띠는 얇게 (2026-11-23): 짧은 말, 뜻은 title 에
        $('pStage').innerHTML = si ? (si.all ? '✅ 모두 열림' : '🔓 <b>' + esc(name(si.cur)) + '</b> (' + si.n + ' / ' + si.gate.length + ')') : '';
        $('pStage').title = si ? (si.all ? '학생 화면: 모든 단계 열림' : '학생 화면: ‘' + name(si.cur) + '’ 까지 열림') : '';
        var j = '';
        try { j = presentStatus(c, si); } catch (e) { j = ''; }
        if ($('pJoined').getAttribute('data-sig') !== j) { var wasOpen = !!$('pJoined').querySelector('details[open]'); $('pJoined').innerHTML = j; $('pJoined').setAttribute('data-sig', j); if (wasOpen && $('pJoined').querySelector('details')) $('pJoined').querySelector('details').open = true; }
        $('btnPOpen').disabled = !si || si.all || state.stageBusy;
        $('btnPOpen').textContent = si && !si.all ? '▶ 다음 단계: ' + name(si.gate[si.n]) : '▶ 다음 단계';
        $('btnPOpen').title = si && !si.all ? '다음 단계 열기: ' + name(si.gate[si.n]) : '모든 단계가 열려 있어요';
        if (pres.ask && (!si || si.all)) askOpen(false);
        // 나란히 ↔ 크게(하나만) (2026-11-23): 왼쪽(설명 장·🧩·🏆)이 떠 있으면 ⇔ 나란히 / ⬜ 설명만, 📱 학생 크게 = 설명을 닫고 학생 화면만
        var left = lesson.on || !!pres.panel, pm = $('btnPMode'), pl = $('btnPLayout');
        pm.hidden = !lesson.def && !pres.panel;
        pm.textContent = left ? '📱 학생 크게' : '📖 설명';
        pm.title = left ? '설명을 닫고 학생 화면만 크게' : '이 단계 설명 장 보기 (학생 화면은 옆에)';
        pm.setAttribute('aria-pressed', left ? 'false' : 'true');
        pl.hidden = !left;
        pl.textContent = pres.layout === 'side' ? '⬜ 설명만' : '⇔ 나란히';
        pl.title = pres.layout === 'side' ? '학생 화면을 접고 ' + (pres.panel ? '이것만' : '설명만') + ' 크게' : '학생 화면을 옆에 함께';
        // 🔓 풀이: 지금 장에 풀이가 있고 아직 안 열었을 때 (→ 와 같음)
        var sl = lesson.on && lesson.list[lesson.i];
        $('btnPReveal').hidden = !(sl && sl.reveal && !pres.panel);
        $('btnPReveal').disabled = !!(sl && lesson.rev);
        $('btnPReveal').textContent = sl && lesson.rev ? '✅ 풀이 열림' : '🔓 풀이';
        $('btnPBack').disabled = !si || si.n <= 1 || state.stageBusy;
        // 🧩 모아 보기 · 🏆 결과판: 프로젝터에 띄울 것을 바꿈 (팀 수업 = 결과판·💬 팀 생각, 조 수업 = 🧩 모아 보기 카드)
        $('btnPBoard').hidden = c.mode !== 'team';
        $('btnPGather').hidden = !(c.mode === 'team' || window.ClassTeacherGather);
        $('btnPBoard').classList.toggle('on', pres.panel === 'board');
        $('btnPGather').classList.toggle('on', pres.panel === 'gather');
        $('btnPBoard').setAttribute('aria-pressed', pres.panel === 'board' ? 'true' : 'false');
        $('btnPGather').setAttribute('aria-pressed', pres.panel === 'gather' ? 'true' : 'false');
    }
    /* ---------- 프로젝터에 띄울 것 바꾸기 (2026-11-23 '프로젝터 = 정보의 중심'): '' = 설명 장·학생 화면, 'board' = 🏆 결과판, 'gather' = 🧩 모아 보기 ---------- */
    var gatherHome = null;
    function setPanel(v) {
        var was = pres.panel;
        pres.panel = v || '';
        $('presentPane').classList.toggle('pp-panel', !!pres.panel);
        $('pPanel').hidden = !pres.panel;
        // 조 수업의 🧩 모아 보기는 진행 화면의 카드를 그대로 옮겨 씀 (단추·그래프가 살아 있게), 닫으면 제자리로
        var card = $('gatherCard');
        if (pres.panel === 'gather' && watched() && watched().mode !== 'team') {
            if (!gatherHome) gatherHome = { parent: card.parentNode, next: card.nextSibling };
            $('pPanel').innerHTML = ''; $('pPanel').appendChild(card);
        } else if (gatherHome && card.parentNode === $('pPanel')) {
            gatherHome.parent.insertBefore(card, gatherHome.next); gatherHome = null;
        }
        if (was !== pres.panel) renderPanel();
        renderPresentBar();
    }
    function renderPanel() {
        var c = watched(), box = $('pPanel');
        if (!pres.panel || !c) { if (!box.querySelector('#gatherCard')) box.innerHTML = ''; return; }
        if (pres.panel === 'board') {
            box.innerHTML = '<h2 class="ct-ppanel-h">🏆 팀 결과판' + (c.setup ? ' <span class="note">목표 ' + esc(c.setup.targetTime) + '초 · 아이 키 ' + esc(c.setup.targetPct || 100) + '%</span>' : '') + '</h2>' + boardTable(state.boardRows || [], true);
        } else if (pres.panel === 'gather' && c.mode === 'team') {
            // 가족 행사: 팀마다 💬 예측 → 결과 → 우리 숫자 (결과판 💬 열과 같은 말)
            var rows = (state.boardRows || []).filter(function (r) { return r.talk && r.talk.length; });
            box.innerHTML = '<h2 class="ct-ppanel-h">🧩 팀 생각 모아 보기</h2>' + (rows.length ? '<div class="ct-ptalk">' + rows.map(function (r) {
                return '<div class="ct-ptalk-card"><b>' + esc(r.name) + '</b>' + r.talk.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</div>';
            }).join('') + '</div>' : '<p class="note">아직 예측·정리 문장을 보낸 팀이 없어요.</p>');
        }
    }
    $('btnPBoard').addEventListener('click', function () { setPanel(pres.panel === 'board' ? '' : 'board'); });
    $('btnPGather').addEventListener('click', function () { setPanel(pres.panel === 'gather' ? '' : 'gather'); });
    // 진행 자료가 새로 오면: 띄운 결과판·모아 보기·응답 장 다시 그리기
    function presentLive() {
        if (state.sub !== 'present' || !pres.space) return;
        if (pres.panel) renderPanel();
        if (answerSlide()) answersPaint();
    }
    /* 발표 화면 띠의 팀(조) 상태 — 설명 장을 보는 동안에도 (하트비트·제출 요약만, 규칙·색인 그대로)
       팀 수업: 들어온 팀 · ⏳ 기다리는 팀 · 하는 중(펼치면 이름) · 🔧 값을 한 번도 안 바꾼 팀(1·2차시)
       조 수업: 들어온 학생 · 보낸 조 · 아직 안 보낸 조(펼치면 조 번호) */
    function presentStatus(c, si) {
        var st = state.last; if (!st) return '';
        var names = function (list) { return list.map(function (x) { return '<span class="ct-pname">' + esc(x) + '</span>'; }).join(''); };
        if (c.mode === 'team') {
            var rows = state.boardRows || boardRows(st), joined = rows.filter(function (r) { return r.joined; });
            var cur = si && !si.all ? si.cur : '', part = si && (si.cur === 't1' || si.cur === 't2') ? si.cur : '';
            var wait = cur ? joined.filter(function (r) { return r.doneStage === cur; }) : [];
            var doing = joined.filter(function (r) { return wait.indexOf(r) < 0; });
            var still = part ? joined.filter(function (r) { return (r.kinds && r.kinds[part] || 0) < 2; }) : [];
            // 띠에는 작은 숫자만, 팀 이름은 펼친 안에만 (2026-11-23)
            var offN = joined.filter(function (r) { return r.off; }).length;
            var h = '<span title="들어온 팀 · ⏳ 기다리는 팀 · 🔌 연결 끊김">👨‍👩‍👧 <b>' + joined.length + '</b>팀' + (rows.length > joined.length ? '/' + rows.length : '') +
                (cur ? ' · ⏳ <b>' + wait.length + '</b>' : '') + (offN ? ' · 🔌 <b>' + offN + '</b>' : '') + '</span>';
            var more = (cur && doing.length ? '<p>▶ 하는 중 ' + doing.length + ': ' + names(doing.map(function (r) { return r.name + ' · ' + r.step; })) + '</p>' : '') +
                (still.length ? '<p>🔧 아직 한 가지 값으로만 잰 팀 ' + still.length + ': ' + names(still.map(function (r) { return r.name; })) + '</p>' : '') +
                (joined.filter(function (r) { return r.off; }).length ? '<p>🔌 연결 끊김: ' + names(joined.filter(function (r) { return r.off; }).map(function (r) { return r.name; })) + '</p>' : '');
            var sumTxt = [cur && doing.length ? '하는 중 ' + doing.length : '', still.length ? '🔧 값 안 바꾼 팀 ' + still.length : ''].filter(Boolean).join(' · ');
            return h + (more ? ' <details class="ct-pmore"><summary>' + (sumTxt || '자세히') + '</summary><div>' + more + '</div></details>' : '');
        }
        var s = CC.summarize(st), notSent = s.groups.filter(function (g) { return !(g.sub && g.sub.rows); });
        var joinedG = s.groups.filter(function (g) { return g.members.some(function (m) { return m.state && m.state.joined; }); });
        // 짧게 (띠가 두 줄이 되면 발표 화면이 작아짐): 보낸 조는 누르면 아직 안 보낸 조 번호
        return '<span title="들어온 학생">🧑‍🎓 ' + s.joined + ' / ' + s.total + '명</span>' +
            (joinedG.length ? ' <details class="ct-pmore"><summary>📤 ' + s.submittedGroups + '/' + s.groups.length + '조</summary><div><p>' + (notSent.length ? '아직 안 보낸 조: ' + names(notSent.map(function (g) { return g.jo + '조'; })) : '모든 조가 보냈어요') + '</p></div></details>' : '');
    }
    function askOpen(on) {
        var c = watched(), si = c && CC.stageInfo(c.exp, c.stage, c.flow);
        pres.ask = !!(on && si && !si.all);
        $('pAsk').hidden = !pres.ask;
        if (pres.ask) { $('pAskText').innerHTML = '▶ <b>' + esc(stepNames(c)(si.gate[si.n])) + '</b> 단계를 열까요? 학생 폰도 함께 넘어가요.'; $('btnPAskYes').focus(); }
    }
    function openNext() {
        var c = watched(), si = c && CC.stageInfo(c.exp, c.stage, c.flow), nx = si && !si.all ? si.gate[si.n] : '';
        askOpen(false); $('btnStageNext').click();
        if (nx) lessonStart(nx, 0);   // 새로 연 단계는 설명 화면부터
    }
    // ---------- 📖 수업 설명 화면 (2026-11-21 선생님 "교사가 프로젝트에 띄우게 될 화면에 내용이 있어야", 내용은 js/lesson-content/<exp>.js, 부품은 js/lesson-slides.js) ----------
    // 단계를 열면 그 단계 설명부터 → 한 장씩(물음 ❓ 다음 키에 풀이) → 마지막 장 다음은 학생 화면(iframe) → 작은 탭 → 단계 끝이면 '열까요?'
    var LSx = window.LessonSlides;
    var lesson = { def: null, on: false, gate: '', list: [], i: 0, rev: false };
    function lessonLoad(c) {
        lesson.def = null; lessonOff();
        if (!LSx) return;
        var space = c.space;
        LSx.load(c.exp).then(function (def) {
            if (pres.space !== space || !def) return;
            lesson.def = def;
            // 발표를 열면 가장 뒤에 연 단계의 설명부터 (설명이 끝나면 학생 화면도 그 단계로)
            var si = CC.stageInfo(c.exp, c.stage, c.flow);
            if (!lessonStart(si ? si.cur : frameGate(c), 0)) renderPresentBar();
        });
    }
    // 발표 화면이 지금 보이는 단계 (iframe 의 단계 단추 키 = 교사가 여는 단계 키, 가설연역도 같음). 행사형은 가장 뒤 열린 단계
    function frameGate(c) {
        var d = frameDoc(), b = d && d.querySelector('nav.steps button[data-step][aria-selected="true"]');
        if (b) return b.dataset.step;
        var si = CC.stageInfo(c.exp, c.stage, c.flow);
        return si ? si.cur : '';
    }
    function lessonStart(gate, i, rev) {
        var c = watched();
        if (!lesson.def || !c || !LSx) return false;
        var list = LSx.slidesFor(lesson.def, gate, c.flow);
        if (!list.length) return false;
        lesson.on = true; lesson.gate = gate; lesson.list = list;
        lesson.i = Math.max(0, Math.min(list.length - 1, i < 0 ? list.length + i : i));
        lesson.rev = !!(rev && list[lesson.i].reveal);
        lessonRender();
        return true;
    }
    // 학생 화면에 알림(수업 문서 lesson·lessonOpen): 장을 넘길 때마다 한 번 (빠르게 여러 장을 넘기면 마지막 것만)
    var lsync = { t: 0, last: '' };
    function lessonSync(now) {
        var c = watched(); if (!c || !c.space) return;
        framePush();
        var s = lesson.on ? lesson.list[lesson.i] : null;
        // 'phone' 장은 풀이를 열기 전까지 학생 띠가 '✍️ 내 화면에서 해요' (풀이를 열면 '👀 앞 화면을 봐요')
        var L = { on: !!lesson.on, stage: lesson.on ? lesson.gate : '', i: lesson.on ? lesson.i : 0, key: s && s.key ? s.key : '', reveal: !!(lesson.on && lesson.rev),
            mode: s && s.mode === 'phone' && !(lesson.rev && s.reveal) ? 'phone' : 'look' };
        var open = s && s.key && lesson.rev ? [s.key] : [];
        var sig = JSON.stringify([c.space, L, open]);
        if (sig === lsync.last) return;
        clearTimeout(lsync.t);
        var go = function () { lsync.last = sig; CC.classLesson(c.space, L, open).then(function (r) {
            if (!r || !r.ok) { lsync.last = ''; return; }
            if (Array.isArray(r.lessonOpen) && watched() === c) { pres.open = r.lessonOpen.slice(); framePush(); }
        }); };
        if (now || open.length) go(); else lsync.t = setTimeout(go, 400);
    }
    /* 옆의 학생 화면이 지금 띄운 장을 따라가게 (2026-11-23 나란히 보기): 같은 사이트 iframe 에 바로 알림 (저장소를 거치지 않아 바로 바뀜)
       · js/class-share.js (발표용) 가 학생과 같게 '👀 앞 화면을 봐요' 띠·답 가리기, 행사형(로켓)은 폰이 보는 화면(대기·답 칸·측정)
       · 단계형은 그 단계 탭으로 (작은 탭은 첫 탭) */
    function framePush() {
        if (!pres.space) return;
        var s = lesson.on ? lesson.list[lesson.i] : null;
        var L = { on: !!lesson.on, stage: lesson.on ? lesson.gate : '', i: lesson.on ? lesson.i : 0, key: s && s.key ? s.key : '', reveal: !!(lesson.on && lesson.rev),
            mode: s && s.mode === 'phone' && !(lesson.rev && s.reveal) ? 'phone' : 'look' };
        var open = (pres.open || []).slice();
        if (s && s.key && lesson.rev && open.indexOf(s.key) < 0) open.push(s.key);
        try {
            var w = $('presentFrame').contentWindow;
            if (w && w.document && w.document.body) w.dispatchEvent(new w.CustomEvent('lab-present-lesson', { detail: JSON.parse(JSON.stringify({ lesson: L, lessonOpen: open })) }));
        } catch (e) { /* 다른 주소면 건너뜀 */ }
        if (lesson.on) frameToGate(lesson.gate);
    }
    // 단계형 학생 화면을 그 단계로 (같은 단계면 그대로 — 학생 화면에서 선생님이 넘긴 작은 탭을 지우지 않게)
    function frameToGate(gate) {
        var d = frameDoc(); if (!d || !gate) return;
        var bs = stepBtns(d), b = bs.filter(function (x) { return x.dataset.step === gate; })[0];
        if (!b || b.classList.contains('cs-locked') || b.getAttribute('aria-selected') === 'true') return;
        b.click();
        var sb = subBtns(d); if (sb.length) sb[0].click();
        try { d.defaultView.scrollTo(0, 0); } catch (e) { /* 무시 */ }
    }
    function lessonRender() {
        var c = watched(), box = $('pSlides');
        $('presentPane').classList.add('ls-on');
        box.innerHTML = LSx.render(lesson.list[lesson.i], lesson.rev, { i: lesson.i, n: lesson.list.length, stageName: c ? CC.stepName(c.exp, lesson.gate, c.flow) : '' });
        // 📱 응답 장(mode 'phone' + key): 팀 답이 실시간으로 모이는 칸 (정답 ✅ 는 풀이를 연 뒤)
        if (answerSlide()) {
            var tx = box.querySelector('.ls-text');
            if (tx) tx.insertAdjacentHTML('beforeend', '<div class="ls-answers" aria-live="polite">' + answersHtml() + '</div>');
            answersFetch();
        }
        LSx.fit(box);
        renderPresentBar();
        lessonSync();
    }
    function lessonOff() {
        var was = lesson.on;
        lesson.on = false;
        $('presentPane').classList.remove('ls-on');
        $('pSlides').innerHTML = '';
        renderPresentBar();
        if (was) lessonSync(true);
    }
    // ---------- 📱 응답 장의 팀 답 모으기 (js/class-teacher-answers.js, 읽기는 교사만 읽는 classExport — 응답 장을 띄운 동안만 몇 초마다) ----------
    var CTA = window.ClassTeacherAnswers;
    var ans = { space: '', data: {}, busy: false, t: 0, at: 0 };
    function answerSlide() {
        var c = watched(), sl = lesson.on && lesson.list[lesson.i];
        return c && sl && sl.mode === 'phone' && sl.key && !/^do-/.test(sl.key) && CTA && CTA.supports(c.exp) && state.sub === 'present' ? sl : null;   // 측정 장(do-t1·do-t2)은 모을 답이 없음
    }
    function answersHtml() {
        var c = watched(), sl = answerSlide(); if (!sl) return '';
        var teams = (state.last && state.last.teams) || [];
        return CTA.render(CTA.tally(c.exp, sl.key, teams, ans.space === c.space ? ans.data : {}, window.FilmRocketMath), lesson.rev);
    }
    function answersPaint() {
        var box = $('pSlides').querySelector('.ls-answers'); if (!box) return;
        var h = answersHtml();
        if (box.innerHTML !== h) { box.innerHTML = h; LSx.fit($('pSlides')); }
    }
    async function answersFetch() {
        clearTimeout(ans.t);
        var c = watched(); if (!answerSlide() || ans.busy) return;
        if (Date.now() - ans.at < 1500) { ans.t = setTimeout(answersFetch, 1500); return; }
        ans.busy = true; ans.at = Date.now();
        var r = null; try { r = await CC.classExport(c.space); } catch (e) { r = null; }
        ans.busy = false;
        if (r && r.ok && watched() === c) { ans.space = c.space; ans.data = CTA.payloads(r.items, c.groups); }
        answersPaint();
        if (answerSlide()) ans.t = setTimeout(answersFetch, 4000);
    }
    // 진행 화면 '🔧 선생님용': 설명 없이 진행할 때 학생 화면의 가린 답을 한꺼번에 열기
    $('btnLessonOpenAll').addEventListener('click', async function () {
        var c = watched(); if (!c || !LSx) return;
        var def = await LSx.load(c.exp), keys = [];
        if (def) Object.keys(def.stages).forEach(function (k) { def.stages[k].forEach(function (sl) { if (sl.key && keys.indexOf(sl.key) < 0) keys.push(sl.key); }); });
        var r = await CC.classLesson(c.space, { on: false }, keys);
        $('lessonMsg').textContent = r && r.ok ? '✅ 풀이 ' + keys.length + '개를 열었어요' : '⚠ ' + ((r && r.error) || '열지 못했어요');
    });
    // 한 장 넘기기: 처리했으면 true, 처음·끝을 넘어가면 false
    function lessonMove(dir) {
        var s = lesson.list[lesson.i];
        if (dir > 0) {
            if (s.reveal && !lesson.rev) { lesson.rev = true; lessonRender(); return true; }
            if (lesson.i + 1 < lesson.list.length) { lesson.i++; lesson.rev = false; lessonRender(); return true; }
            return false;
        }
        if (s.reveal && lesson.rev) { lesson.rev = false; lessonRender(); return true; }
        if (lesson.i > 0) { lesson.i--; lesson.rev = !!lesson.list[lesson.i].reveal; lessonRender(); return true; }
        return false;
    }
    function stepBtns(d) { return d ? Array.prototype.slice.call(d.querySelectorAll('nav.steps button[data-step]')) : []; }
    function subBtns(d) {
        var sub = d && Array.prototype.filter.call(d.querySelectorAll('nav.subtabs'), shown)[0];
        return sub ? Array.prototype.filter.call(sub.querySelectorAll('button[data-tab]'), shown) : [];
    }
    // 설명을 닫고 학생 화면으로: 앞으로 가면 그 단계 첫 작은 탭 맨 위, 뒤로 가면 앞 단계의 마지막 작은 탭
    function lessonToFrame(dir) {
        var gate = lesson.gate, d = frameDoc();
        lessonOff();
        var bs = stepBtns(d), k = bs.findIndex(function (b) { return b.dataset.step === gate; });
        if (k < 0) return;
        var b = dir < 0 ? bs[k - 1] : bs[k];
        if (!b || b.classList.contains('cs-locked')) return;
        if (b.getAttribute('aria-selected') !== 'true' || dir < 0) b.click();
        var sb = subBtns(d);
        if (sb.length) sb[dir < 0 ? sb.length - 1 : 0].click();
        try { d.defaultView.scrollTo(0, 0); } catch (e) { /* 무시 */ }
    }
    window.addEventListener('resize', function () { if (lesson.on && LSx) LSx.fit($('pSlides')); });
    $('btnPMode').addEventListener('click', function () {
        var c = watched(); if (!c) return;
        if (pres.panel) { setPanel(''); if (lesson.on) lessonToFrame(1); return; }
        if (lesson.on) lessonToFrame(1);
        else if (!lessonStart(frameGate(c), 0)) $('pHint').textContent = '이 단계에는 설명 화면이 없어요.';
    });
    $('btnPLayout').addEventListener('click', function () {
        pres.layout = pres.layout === 'side' ? 'deck' : 'side';
        try { localStorage.setItem('ct-present-layout', pres.layout); } catch (e) { /* 무시 */ }
        applyLayout(); renderPresentBar();
    });
    $('btnPReveal').addEventListener('click', function () {
        var s = lesson.on && lesson.list[lesson.i];
        if (s && s.reveal && !lesson.rev) { lesson.rev = true; lessonRender(); }
    });
    // ↩ 단계 하나 되돌리기 (진행 화면의 '◀ 하나 되돌리기' 와 같음, 확인을 거침)
    $('btnPBack').addEventListener('click', function () { $('btnStagePrev').click(); });
    $('btnPQr').addEventListener('click', function () { $('btnBig').click(); });
    // 그 단계 안의 작은 탭 → 다음 단계(열려 있으면) → 잠겨 있으면 열기 확인
    function presentMove(dir) {
        // '다음 단계를 열까요?' 가 떠 있는 동안 → 는 무시 (빨리 두 번 눌러 잘못 열리지 않게): 열기는 Enter·단추로만, ← 는 닫기
        if (pres.ask) { if (dir < 0) askOpen(false); return; }
        if (pres.panel) { setPanel(''); return; }   // 🏆·🧩 를 띄운 동안 → ← 는 하던 설명·학생 화면으로 돌아감
        // 설명 장: ← 는 앞 장, 첫 장이면 그대로 머묾 · → 는 다음 장, 마지막 장 다음은 학생 화면
        if (lesson.on) { if (!lessonMove(dir) && dir > 0) lessonToFrame(1); return; }
        var d = frameDoc(), c = watched();
        if (!d || !c) return;
        // 글자를 크게 키우면 한 화면에 다 안 들어옴 → 먼저 남은 내용을 한 화면씩 내리고(←는 올리고), 끝에 닿은 뒤에 다음(이전) 탭
        var win = d.defaultView;
        if (win && !d.getElementById('ev-app')) {
            var before = win.scrollY;
            win.scrollTo({ top: before + dir * Math.round(win.innerHeight * 0.8), behavior: 'instant' });
            if (Math.abs(win.scrollY - before) > 2) return;
        }
        var sub = Array.prototype.filter.call(d.querySelectorAll('nav.subtabs'), shown)[0];
        if (sub) {
            var bs = Array.prototype.filter.call(sub.querySelectorAll('button[data-tab]'), shown);
            var i = bs.findIndex(function (b) { return b.getAttribute('aria-selected') === 'true'; });
            if (i >= 0 && bs[i + dir]) { bs[i + dir].click(); try { win.scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { /* 무시 */ } return; }
        }
        var steps = Array.prototype.slice.call(d.querySelectorAll('nav.steps button[data-step], nav.tabs button[data-tab]'));
        var k = steps.findIndex(function (b) { return b.getAttribute('aria-selected') === 'true'; });
        var nb = k >= 0 ? steps[k + dir] : null;
        // 설명 화면: 다음 단계로 넘어가기 전에 그 단계 설명부터, 단계 첫 화면에서 ← 는 이 단계 설명의 마지막 장
        var curKey = k >= 0 ? steps[k].dataset.step : '';
        if (dir > 0 && nb && !nb.classList.contains('cs-locked') && nb.dataset.step && lessonStart(nb.dataset.step, 0)) return;
        if (dir < 0 && curKey && lessonStart(curKey, -1, true)) return;
        if (nb && !nb.classList.contains('cs-locked')) {
            nb.click();
            if (dir < 0) {   // 앞 단계로 가면 그 단계의 마지막 작은 탭부터
                var s2 = Array.prototype.filter.call(d.querySelectorAll('nav.subtabs'), shown)[0];
                var b2 = s2 ? Array.prototype.filter.call(s2.querySelectorAll('button[data-tab]'), shown) : [];
                if (b2.length) b2[b2.length - 1].click();
            }
            try { d.defaultView.scrollTo(0, 0); } catch (e) { /* 무시 */ }
            return;
        }
        // 행사형(로켓, 단계 단추 없음): 학생 화면에서 ← 는 지금 단계 설명의 마지막 장으로
        if (dir < 0 && !steps.length && lessonStart(frameGate(c), -1, true)) return;
        if (dir > 0 && (nb || !steps.length)) askOpen(true);   // 잠긴 다음 단계 (또는 단계 단추가 없는 행사형)
    }
    function presentKey(e) {
        if (state.sub !== 'present' || e.altKey || e.ctrlKey || e.metaKey) return;
        var t = e.target, tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
        var dir = { ArrowRight: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, PageUp: -1 }[e.key];
        if (e.key === 'Escape' && pres.ask) { e.preventDefault(); askOpen(false); return; }
        if (e.key === 'Enter' && pres.ask) { e.preventDefault(); openNext(); return; }
        if (!dir) return;
        if (tag === 'BUTTON' && e.key === ' ' && !(t.closest && t.closest('nav'))) return;   // 단추 누르기는 그대로
        e.preventDefault(); e.stopImmediatePropagation();
        presentMove(dir);
    }
    document.addEventListener('keydown', presentKey, true);
    $('presentFrame').addEventListener('load', function () {
        var d = frameDoc(); if (!d) return;
        d.addEventListener('keydown', presentKey, true);   // iframe 안을 누른 뒤에도 같은 키로
        setTimeout(framePush, 0);   // 새로 연 학생 화면도 지금 장에 맞춤
    });
    $('btnPNext').addEventListener('click', function () { presentMove(1); });
    $('btnPPrev').addEventListener('click', function () { presentMove(-1); });
    $('btnPOpen').addEventListener('click', function () { askOpen(true); });
    $('btnPAskYes').addEventListener('click', openNext);
    $('btnPAskNo').addEventListener('click', function () { askOpen(false); });
    $('btnPExit').addEventListener('click', function () { var c = watched(); if (c) go(c.space, 'run'); });
    $('btnPFull').addEventListener('click', function () {
        if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); return; }
        var r = document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen() : null;
        if (r && r.catch) r.catch(function () { $('pHint').textContent = '⚠️ 이 브라우저는 전체 화면을 막았어요. F11 키로도 돼요.'; });
    });
    document.addEventListener('fullscreenchange', function () { $('btnPFull').textContent = document.fullscreenElement ? '⛶ 전체 화면 끄기 (Esc)' : '⛶ 전체 화면'; });

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
        renderPresentBar();
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
                    // 그 자리의 📱 폰 측정 화면은 따로 보냄 → '5 데이터 · 📱 폰으로 측정 중' (js/lab-store.js mergeSeats)
                    var right = stt.joined ? esc(CC.stepName(st.exp, x.step, st.flow)) + (x.phone ? ' · ' + esc(CC.stepName(st.exp, x.phone.step, st.flow)) : '') + ' · 점 ' + (x.points == null ? '–' : x.points) + (x.submitted ? ' · ✅' : '') + '<br><span class="note">' + (stt.idle ? '💤 ' : '') + esc(CC.agoText(stt.ago)) + '</span>' : '아직 안 들어옴';
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
            '<tr><th>보고 있는 단계</th><td>' + esc(CC.stepName(st.exp, x.step, st.flow)) + '</td></tr>' +
            (x.phone ? '<tr><th>📱 이 자리의 폰</th><td>' + esc(CC.stepName(st.exp, x.phone.step, st.flow)) + ' · 점 ' + (x.phone.points == null ? '–' : esc(x.phone.points)) + (x.phone.submitted ? ' · ✅ 보냄' : '') +
                ' · ' + esc(new Date(x.phone.lastSeen).toLocaleTimeString('ko-KR')) + '</td></tr>' : '') +
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
    document.addEventListener('visibilitychange', function () { if (!document.hidden && state.view === 'main' && isLive()) refresh(); });
    renderPreview(); renderList();
    LS.onUser(function (u) { state.user = u && u.google ? u : null; renderLogin(); loadClasses(); });
})();
