/* 발포비타민 필름통 로켓 — 가족 행사 '행사형' 화면 (projects/film-rocket.html)
   한 화면에 한 가지 일 + 큰 '다음' 단추. 폰 한 대가 측정과 결과를 다 한다(이원화 없음).
   0 입장(팀 이름) → 1 생각 열기(힘·가속도·압력, 처음 생각 저장) → 2 1차시 열리는 시간(안전·한 가지만 바꾸기·예측·측정·반복·그래프·왜·도전)
   → 3 2차시 아이 키만큼 로켓(설계·안전·촬영·세 점 → %·그래프·도전) → 4 정리(다시 풀기·처음 생각과 나란히·결과 카드 이미지)
   중간 정의 퀴즈 = 팀 점수. 모든 것은 이 폰(localStorage)에 먼저 저장 → 선생님 QR(?c=)로 들어왔으면 ClassShare 로 보냄(끊기면 다시).
   아이 키(cm)·영상은 이 폰에만, 보내는 것은 %·숫자·고른 것뿐. 계산 js/film-rocket-math.js, 녹화 js/film-rocket-video.js */
(function () {
    'use strict';
    var M = window.FilmRocketMath, V = window.FilmRocketVideo, CC = window.ClassCloud;
    var $ = function (s, el) { return (el || document).querySelector(s); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var CLASS = CC ? CC.readClassParam(location.search) : '';
    // 🎬 발표용 (교사 화면 '발표 보기', ?present=1): 팀으로 입장하지 않고 선생님이 연 단계의 첫 화면을 보여 줌. 이 브라우저에 저장 안 함
    var PRESENT = !!(window.LabUI && window.LabUI.present);
    // 📂 지난 기록 (?past=수업코드): 수업 주소 없이 열었을 때 이 폰에 남은 우리 팀 기록을 보기만 (선생님께 보내지 않음)
    var PAST = '';
    if (!CLASS && !PRESENT && CC) { var pm = /[?&]past=([^&#]*)/.exec(location.search); var pc = pm ? CC.normalizeClass(decodeURIComponent(pm[1])) : ''; if (CC.isClassCode(pc)) PAST = pc; }
    var KEY = 'film-rocket:v1:' + (CLASS || PAST || 'solo');
    var LS = null; try { LS = window.localStorage; } catch (e) { LS = null; }

    // ---------- 저장 (이 폰) ----------
    function fresh() {
        return { v: 1, screen: 'enter', stage: 'enter', team: null, setup: null, think: { first: {}, last: {} }, quiz: {},
            t1: { changed: '', base: null, value: null, trials: [], why: '', challenge: [] },
            t2: { changed: '', base: null, value: null, trials: [], challenge: [] },
            cur: null, childCm: null, dirty: false, sentAt: '', history: [], done: {} };
    }
    function load() {
        var d = null;
        if (!PRESENT) { try { d = JSON.parse((LS && LS.getItem(KEY)) || 'null'); } catch (e) { d = null; } }
        var f = fresh();
        if (!d || d.v !== 1) return f;
        Object.keys(f).forEach(function (k) { if (d[k] === undefined) d[k] = f[k]; });
        ['t1', 't2'].forEach(function (p) { Object.keys(f[p]).forEach(function (k) { if (d[p][k] === undefined) d[p][k] = f[p][k]; }); });
        return d;
    }
    var st = load();
    var saveOk = true;
    function save() {
        if (PRESENT) return;
        st.savedAt = new Date().toISOString();
        try { LS.setItem(KEY, JSON.stringify(st)); saveOk = true; } catch (e) { saveOk = false; }
    }
    function changed() { st.dirty = true; st.rev = (st.rev || 0) + 1; save(); renderTop(); queueSend(); }
    function setup() { return M.mergeSetup(st.setup); }

    // ---------- 수업 연결 (ClassShare 팀 이름 방식) ----------
    var share = null, net = { joining: false, timer: null, sendTimer: null, lastErr: '', classErr: '' };
    function initShare() {
        if (!CLASS || !window.ClassShare) return;
        share = window.ClassShare.init({
            exp: 'rocket', barMount: '#class-bar', teamPicker: false, beatEvery: 60000,   // 1분마다 신호 → 교사 화면 2분 넘게 없으면 🔌
            getItems: function () {
                if (!st.team) return [];
                // n 이 0 이면 공용 저장에서 '지운 줄'로 보므로, 팀 줄은 늘 1 이상 (1 + 잰 횟수)
                return [{ id: 'team', title: st.team.name, n: 1 + st.t1.trials.length + st.t1.challenge.length + st.t2.trials.length + st.t2.challenge.length,
                    summary: M.summary(st, st.setup), data: M.payload(st) }];
            },
            getStep: function () { return stepNow(); },
            getPoints: function () { return st.t1.trials.length + st.t1.challenge.length + st.t2.trials.length + st.t2.challenge.length; },
            getSubmitted: function () { return !!st.sentAt; },
            pull: function () { return Promise.resolve({ ok: true }); },   // 다른 팀 것은 불러오지 않음
            // 선생님이 여는 단계 (교사 화면 '▶ 다음 단계 열기'): 열리지 않은 단계는 🔒, 새로 열리면 그 단계 첫 화면으로
            gateDom: false,
            // 설명 화면 풀이가 열리면(2026-11-21 '점수 퀴즈 정답 표시도 풀이 뒤로') 퀴즈 화면의 ⭕·📘·점수를 다시 그림
            onLesson: function () {
                if (followApply()) return;   // 발표용(나란히 보기)도 폰이 보는 화면을 그대로 보임   // 폰은 응답만 (선생님이 띄운 장에 맞춤)
                if (/^(q-|end-(force|accel|pressure)$)/.test(st.screen) && app.getAttribute('data-screen') === st.screen) show(st.screen, { back: true }); else renderTop();
            },
            onStage: function (open, o) {
                stageOpen = open;
                if (PRESENT && following()) { followApply(); return; }   // 나란히 보기: 띄운 장에 맞춤 (단계가 열리면 다시)
                if (PRESENT) {   // 발표용: 새로 열린 단계(처음엔 열린 마지막 단계)의 첫 화면
                    var to = o && o.moved && o.moved.to ? o.moved.to : open && open.length ? open[open.length - 1] : null;
                    if (to && STAGE_START[to] && stageOf(st.screen) !== to) show(STAGE_START[to]); else renderTop();
                    return;
                }
                // 2026-11-20 선생님 결정 "기다리는 팀만 옮기기": 앞 단계를 끝내고 잠김 화면에서 기다리던 팀만 저절로 옮김.
                //  하는 중인 팀은 그대로 두고 위 띠 '선생님이 ○○ 단계를 열었어요 · 끝나면 넘어가요'(renderTop) → 그 단계를 마치면 잠김 화면 없이 바로.
                //  되돌리기(◀): 그 단계에 들어가 있던 팀은 잠김 안내(측정 중이면 측정을 마칠 때까지 그대로), '돌아가기'는 마지막으로 하던 화면으로
                st.gate = { open: open ? open.slice() : null }; save();
                // 📱 폰은 응답만: 띄운 장에 맞춤 (기다리던 팀의 '하던 곳'은 새로 열린 단계 첫 화면)
                if (following()) {
                    if (app.getAttribute('data-screen') === 'locked' && !stageLocked(stageOf(st.lastReal || st.screen))) st.lastReal = resumeId(st.lastReal || st.screen);
                    lastOpenN = open ? open.length : STAGES.length;
                    followApply(); beatIfChanged(); return;
                }
                var n = open ? open.length : STAGES.length, shrank = lastOpenN != null && n < lastOpenN;
                lastOpenN = n;
                if (shrank) { var fl = $('#ev-flash'); if (fl) fl.hidden = true; }
                var cur = stageOf(st.screen), onLock = app.getAttribute('data-screen') === 'locked';
                if (st.team && onLock && !stageLocked(cur)) {
                    show(resumeId(st.screen), { back: true });
                    flash('▶ 선생님이 ‘' + stageName(cur) + '’ 단계를 열었어요');
                } else if (st.team && !onLock && stageLocked(cur) && !busy()) show(st.screen, { back: true });
                else renderTop();
                beatIfChanged();
            },
            onClass: function (info, me) {
                if (info && info.setup) { st.setup = info.setup; }
                if (me && me.team) {
                    var was = st.team;
                    st.team = { name: me.team, jo: me.jo, joined: true };
                    if (!was || was.pending) { st.dirty = true; queueSend(); }
                }
                net.classErr = info ? '' : ((share.classFailed() || {}).error || '');
                save(); renderTop();
                // 마친 수업: 장에 맞춰 띄웠던 화면(👀·✅·답 칸)이면 하던 곳(결과 카드)으로 (5b 하 6)
                if (info && info.done && st.team && (st.screen === 'wait' || st.screen === 'sent' || st.forced)) followApply();
                else if (info && info.done && st.screen === 'end-card' && !$('.ev-done-band')) show('end-card', { back: true });
                if (st.screen === 'enter') {   // 입장 화면을 새로 그리되, 쓰던 팀 이름은 남김
                    var typed = $('#ev-name') ? $('#ev-name').value : '';
                    show('enter', { back: true });
                    if (typed && $('#ev-name')) $('#ev-name').value = typed;
                }
            }
        });
    }
    // 진짜 인터넷 문제만 (js/lab-store.js 가 network: true 를 붙임). 익명 로그인 꺼짐·권한·한도 같은 오류는 그 문구를 그대로 보여 줌
    function isNetErr(r) { return !!(r && r.network); }
    function queueSend() {
        if (!share) return;
        clearTimeout(net.sendTimer);
        net.sendTimer = setTimeout(sendNow, 1500);
    }
    async function sendNow() {
        if (!share || !st.team || !st.dirty) return;
        if (!share.me()) {   // 팀 자리를 아직 못 잡음 (입장할 때 인터넷이 끊겼음)
            if (!share.classInfo()) await share.reconnect();
            if (st.team.pending && share.classInfo() && !net.joining) await tryJoin(st.team.name, true);
            if (!share.me()) { renderTop(); return; }
        }
        var rev = st.rev || 0;
        var r = await share.send();
        if (r && r.ok) {
            st.sentAt = new Date().toISOString(); net.lastErr = ''; net.lastNet = false;
            st.dirty = (st.rev || 0) !== rev;   // 보내는 동안 또 바뀌었으면 한 번 더
            if (st.dirty) queueSend();
        } else if (r && r.busy) queueSend();
        else if (r) { net.lastErr = String(r.error || ''); net.lastNet = isNetErr(r); }
        save(); renderTop();
    }
    function retryLoop() {
        clearInterval(net.timer);
        net.timer = setInterval(function () { if (st.dirty || (st.team && st.team.pending)) sendNow(); }, 20000);
        window.addEventListener('online', function () { sendNow(); });
    }
    async function tryJoin(name, quiet) {
        net.joining = true;
        var r = await share.joinTeam(name);
        net.joining = false;
        if (r.ok) { st.team = { name: r.name, jo: r.jo, joined: true }; st.dirty = true; save(); renderTop(); queueSend(); }
        else if (!isNetErr(r) && quiet && st.team) { st.team.problem = r.error; save(); renderTop(); }
        return r;
    }

    // ---------- 맨 위 띠: 단계·팀·점수·보냄 ----------
    var STAGES = [['think', '들어가기'], ['t1', '1차시'], ['t2', '2차시'], ['end', '정리']];
    var STAGE_KEYS = STAGES.map(function (x) { return x[0]; }), lastOpenN = null;
    // 교사 화면에 보내는 지금 단계: 잠긴 단계(앞 단계를 끝내고 기다림)면 '앞단계-done' (예 think-done → '들어가기 ✓ 기다림')
    function stepNow() {
        var i = STAGE_KEYS.indexOf(st.stage);
        if (i > 0 && stageLocked(st.stage)) return STAGE_KEYS[i - 1] + '-done';
        if (i >= 0 && st.done && st.done[st.stage]) return st.stage + '-more';   // 끝낸 단계에서 결과를 다시 보거나 더 재는 중 ('✓ 끝냄 · 더 재는 중')
        return st.stage;
    }
    var lastStep = null;
    function beatIfChanged() { var s = stepNow(); if (share && st.team && s !== lastStep) { lastStep = s; share.stepChanged(); } }
    // 측정 중(🎥 녹화·⏱ 초시계·장면 고르기·세 곳 누르기, 👀 눈으로 고르기 전)이면 화면을 바꾸지 않음
    // (촬영 안내 t2-film 은 아직 발사 전이라 막지 않음. 눈으로 고르기 화면은 고르면 바로 결과로 넘어가고 ← 뒤로도 있음)
    var BUSY_RE = /measure$|^t2-hand$|-ch-check$/;
    function busy() { return (BUSY_RE.test(st.screen) || (st.screen === 't2-build' && st.build && !st.build.done && Object.keys(st.build.steps || {}).some(function (x) { return st.build.steps[x]; }) && following() && lessonNow().key !== 'build')) && app.getAttribute('data-screen') === st.screen; }
    // 측정 화면은 처음부터 다시 (조건 화면으로), 나머지는 그 화면 그대로
    function resumeId(id) { return /measure$/.test(id) ? id.replace(/measure$/, 'cond') : id; }
    // 선생님이 내 단계보다 뒤 단계를 열었을 때 위에 늘 보이는 띠
    function openNotice() {
        if (!st.team || app.getAttribute('data-screen') === 'locked') return null;
        // 모두 열림(stageOpen null)은 선생님이 단계를 여는 수업(수업 문서에 stage 가 있음)일 때만 '정리까지'로 봄 (수업 없이·예전 수업은 띠 없음)
        var ci = share && share.classInfo && share.classInfo();
        if (!stageOpen && !(ci && ci.stage != null)) return null;
        var i = STAGE_KEYS.indexOf(st.stage), last = stageOpen ? stageOpen[stageOpen.length - 1] : STAGE_KEYS[STAGE_KEYS.length - 1], j = STAGE_KEYS.indexOf(last);
        if (i < 0 || j <= i) return null;
        // 한 단계 넘게 뒤처졌으면 바로 다음 단계(차례로) + 마지막 연 단계로 바로 가기
        return { text: '▶ 선생님이 ‘' + stageName(last) + '’ 단계' + (j > i + 1 ? '까지' : '를') + ' 열었어요', next: STAGE_KEYS[i + 1], jump: j > i + 1 ? last : null };
    }
    var STAGE_START = { think: 'think-intro', t1: 't1-intro', t2: 't2-intro', end: 'end-intro' };
    function syncText() {
        if (PAST) return { cls: 'solo', t: '📂 지난 기록 · 이 폰에만 있어요' };
        if (!CLASS) return { cls: 'solo', t: '📱 이 폰에만 저장' };
        if (!st.team) return { cls: 'wait', t: '' };
        if (st.team.problem) return { cls: 'warn', t: '⚠ 팀 이름 확인' };
        var cf = share && share.classFailed();
        if (cf && !isNetErr(cf)) return { cls: 'warn', t: '⚠ ' + String(cf.error || '').slice(0, 80) + ' (이 폰에는 저장돼요)' };
        if (!share || !share.me()) return { cls: 'warn', t: '📶 폰에 저장됨 · 연결되면 보내요' };
        if (st.dirty && net.lastErr && !net.lastNet) return { cls: 'warn', t: '⚠ ' + net.lastErr.slice(0, 80) + ' (이 폰에는 저장돼요)' };
        if (st.dirty) return { cls: net.lastErr ? 'warn' : 'wait', t: net.lastErr ? '📶 폰에 저장됨 · 다시 보낼게요' : '⏳ 보내는 중' };
        return { cls: 'ok', t: '✅ 선생님께 보냄' };
    }
    function renderTop() {
        var sc = M.score(shownQuiz()), sy = syncText();   // 풀이 전 퀴즈 점수는 아직 보이지 않음
        $('#ev-team').innerHTML = st.team ? '👨‍👩‍👧 <b>' + esc(st.team.name) + '</b>' : '';
        $('#ev-score').innerHTML = '⭐ <b>' + sc.points + '</b>점';
        // 설명 화면을 쓰는 반(수업)에서는 측정·결과 화면에도 ⭐ 점수를 숨김 — 점수는 프로젝터·결과 카드에서 (가상 수업 5차 중 7, 계산은 그대로)
        $('#ev-score').hidden = !!(CLASS && !PAST && share && share.lessonUsed && share.lessonUsed());
        var s = $('#ev-sync'); s.textContent = sy.t; s.className = 'ev-sync ' + sy.cls; s.hidden = !sy.t;
        $('#ev-stages').innerHTML = STAGES.map(function (x) {
            var lock = stageLocked(x[0]);
            return '<button type="button" class="ev-stage' + (st.stage === x[0] ? ' on' : '') + (lock ? ' locked' : '') + '" data-stage="' + x[0] + '"' + (st.team ? '' : ' disabled') + (lock ? ' aria-disabled="true" title="선생님이 열면 넘어가요"' : '') + '>' + (lock ? '🔒 ' : '') + x[1] + '</button>';
        }).join('');
        var nt = $('#ev-notice'), nx = openNotice();
        if (nt) {
            nt.hidden = !nx;
            if (nx) {
                var b = busy();
                var op = b ? '' : oneValuePart(nx.next);
                nt.innerHTML = '<span>' + esc(nx.text) + '</span>' + (op ? '<span class="ev-notice-more">🔧 넘어가기 전에 값을 하나 바꿔 한 번 더 ' + (op === 't1' ? '재' : '쏘아') + ' 볼까요? (지금은 한 가지 값)</span>' : '') + '<button type="button" class="ev-next good ev-notice-go" id="ev-notice-go" data-next="' + nx.next + '"' + (b ? ' disabled' : '') + '>' +
                    (b ? '⏳ 이 측정을 끝내고 가요' : '‘' + esc(stageName(nx.next)) + '’ 로 가기 →') + '</button>' +
                    (nx.jump && !b ? '<button type="button" class="ev-link ev-notice-jump" id="ev-notice-jump" data-next="' + nx.jump + '">‘' + esc(stageName(nx.next)) + '’ 건너뛰고 ‘' + esc(stageName(nx.jump)) + '’ 로 바로 가기</button>' : '');
            }
        }
        $('#ev-top').hidden = st.screen === 'enter';
        offlineCard();
        if (!saveOk) { s.hidden = false; s.className = 'ev-sync warn'; s.textContent = '⚠ 이 브라우저는 저장이 안 돼요 (사생활 보호 모드?)'; }
    }
    /* 📶 연결이 끊겼을 때만 큰 안내 (2026-11-23 선생님 '연결이 끊기면 어떻게 다시 접속하는지 안내는 포함'): 이미 있는 다시 보내기 상태로 판단, 다시 연결되면 저절로 사라짐 */
    function isOffline() {
        if (!CLASS || PRESENT || PAST || !st.team) return false;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
        if (st.dirty && net.lastNet) return true;
        var cf = share && share.classFailed && share.classFailed();
        return !!(share && !share.me() && cf && isNetErr(cf));
    }
    function offlineCard() {
        var el = $('#ev-offline'); if (!el) return;
        var off = isOffline();
        el.hidden = !off;
        if (!off) return;
        el.innerHTML = '<h2>📶 연결이 끊겼어요</h2><ol><li>📶 <b>와이파이</b>를 확인해요</li><li>🔄 이 화면을 <b>새로고침</b>해요</li><li>📷 그래도 안 되면 선생님 화면의 <b>QR 을 다시 찍어요</b> (팀 이름은 그대로 들어가요)</li></ol>' +
            '<p class="ev-small">QR 이 안 되면 메인 화면 → <b>학생</b> → 수업 코드 <b class="ev-code">' + esc(CLASS) + '</b> 넣기</p>' +
            '<p class="ev-small">💾 이 폰에 먼저 저장해 둔 답은 다시 연결되면 저절로 보내요.</p>';
    }
    window.addEventListener('offline', function () { renderTop(); });
    window.addEventListener('online', function () { renderTop(); });
    // 응답 장 가운데 놓기용 창 높이 (css/film-rocket.css --ev-vh): 발표용 틀의 zoom 을 나눠 실제 창 높이에 맞춤
    function setVh() {
        var z = parseFloat(document.documentElement.style.zoom || getComputedStyle(document.documentElement).zoom) || 1;
        var v = Math.floor(window.innerHeight / z) + 'px';
        if (document.documentElement.style.getPropertyValue('--ev-vh') !== v) document.documentElement.style.setProperty('--ev-vh', v);   // 같으면 안 씀 (지켜보기가 다시 부르지 않게)
    }
    window.addEventListener('resize', setVh); setVh();
    if (window.MutationObserver) new MutationObserver(setVh).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    $('#ev-notice').addEventListener('click', function (e) {
        var b = e.target.closest('#ev-notice-go, #ev-notice-jump'); if (!b || b.disabled || busy() || !st.team) return;
        show(entryFor(b.dataset.next));
    });
    $('#ev-stages').addEventListener('click', function (e) {
        var b = e.target.closest('[data-stage]'); if (!b || !st.team) return;
        show(entryFor(b.dataset.stage));
    });

    // ---------- 화면 틀 ----------
    var app = $('#ev-app'), cleanup = [];
    function stageOf(id) { if (id === 'wait' || id === 'sent') return st.stage && st.stage !== 'enter' ? st.stage : 'think'; return /^t1|^q-pressure|^q-control|^q-gas/.test(id) ? 't1' : /^t2|^q-action|^q-mass/.test(id) ? 't2' : /^end/.test(id) ? 'end' : /^think/.test(id) ? 'think' : 'enter'; }
    // ----- 선생님이 연 단계 -----
    // null = 모두 열림 (수업 없이·예전 수업). 수업이면 마지막으로 받은 값을 폰에 기억해 두고 처음부터 씀 (인터넷이 끊긴 채 새로고침해도 잠금 유지)
    var stageOpen = CLASS && !PRESENT && st.gate && Array.isArray(st.gate.open) ? st.gate.open.slice() : null;
    function stageLocked(stage) { return !!(stageOpen && STAGE_START[stage] && stageOpen.indexOf(stage) < 0); }
    // 위 탭으로 단계에 들어갈 때: 이미 해 본 단계면 소개·안전·퀴즈를 다시 지나지 않고 '이어서 하기' (안전은 한 화면으로 짧게)
    function entryFor(stage) {
        if (stage === 't1' && st.t1.changed && st.t1.safe && st.t1.safe.goggle && st.t1.safe.face && st.t1.safe.away && st.t1.safe.wait) return 't1-again';
        if (stage === 't2' && st.t2.changed) return 't2-again';
        return STAGE_START[stage];
    }
    function stageName(k) { var x = STAGES.filter(function (y) { return y[0] === k; })[0]; return x ? x[1] : k; }
    var flashT = null;
    function flash(t) {
        var el = $('#ev-flash'); if (!el) return;
        el.textContent = t; el.hidden = false; clearTimeout(flashT); flashT = setTimeout(function () { el.hidden = true; }, 3500);
    }
    // 잠김 화면 '돌아가기': 열린 단계에서 마지막으로 하던 화면 (되돌리기 뒤에도 하던 곳으로), 없으면 열린 마지막 단계 첫 화면
    function backTarget() {
        for (var k = st.history.length - 1; k >= 0; k--) {
            var h = st.history[k];
            if (SCREENS[h] && h !== 'enter' && !stageLocked(stageOf(h))) return resumeId(h);
        }
        var last = stageOpen && stageOpen.length ? stageOpen[stageOpen.length - 1] : 'think';
        return STAGE_START[last];
    }
    // 한 가지 값으로만 잰 차시(1·2차시)가 있으면 그 차시 키 (안내만, 막지 않음)
    function oneValuePart(stage) { var k = stage === 't2' ? 't1' : stage === 'end' ? 't2' : stage; return (k === 't1' || k === 't2') && st[k] && st[k].changed && M.valueKinds(st[k].trials) < 2 ? k : ''; }
    function lockScreen(stage) {
        var to = backTarget(), op = oneValuePart(stage);
        return { html: '<div class="ev-hero"><div class="ev-hero-ic" aria-hidden="true">⏳</div><h2>‘' + esc(stageName(stage)) + '’ 은 아직 잠겨 있어요</h2>' +
            '<p>선생님이 다음 단계를 열면 <b>저절로 넘어가요</b>. 그동안 앞 단계를 다시 보거나 기다려요.</p></div>' +
            (op ? '<div class="ev-def ev-more-hint"><p>🔧 기다리는 동안 <b>값을 하나 바꿔</b> 한 번 더 ' + (op === 't1' ? '재' : '쏘아') + ' 볼까요? 지금은 한 가지 값으로만 ' + (op === 't1' ? '쟀어요' : '쐈어요') + '.</p>' +
                '<div class="ev-nav col"><button type="button" class="ev-next good" data-go="' + op + '-more">🔧 값 바꿔서 한 번 더</button></div></div>' : '') +
            '<div class="ev-nav col"><button type="button" class="ev-next secondary" data-go="' + to + '">← ‘' + esc(stageName(stageOf(to))) + '’ 으로 돌아가기</button></div>' };
    }
    var LAST_SCREEN = { 't1-ch-result': 't1', 't2-ch-result': 't2', 'end-card': 'end' };
    function markDone(id) {
        if (PRESENT || !st.team) return;
        st.done = st.done || {};
        var from = STAGE_KEYS.indexOf(st.stage), to = STAGE_KEYS.indexOf(stageOf(id));
        if (from >= 0 && to > from) st.done[st.stage] = true;   // 다음 단계로 나아감 = 이 단계를 끝냄
        if (LAST_SCREEN[id]) st.done[LAST_SCREEN[id]] = true;
    }
    function show(id, opt) {
        cleanup.forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } }); cleanup = [];
        var wasBusy = BUSY_RE.test(String(st.screen || ''));
        if (/challenge|-ch-|^t2-(film|safe|measure)$/.test(String(id)) && mediaOn()) FACE.load();   // 도전 전에 얼굴 찾기를 미리 받아 둠
        if (!SCREENS[id]) id = 'enter';
        // 흐름에서 뺀 화면 (2026-11-23 가상 수업 4차): 예전에 저장된 화면 주소로 와도 그다음 화면으로
        if (GONE[id]) id = GONE[id];
        // 2차시 안전 체크는 한 번만 (이어서 화면의 요약과 두 번 묻지 않게, 가상 수업 5차 중 5)
        if (id === 't2-safe' && ['goggle', 'face', 'away', 'wait'].every(function (k) { return st.t2.safe && st.t2.safe[k]; })) id = 't2-film';
        // 측정 장(선생님이 띄운 📱 측정 장) 안에서는 정의 퀴즈를 되풀이하지 않음 — 퀴즈는 그 퀴즈 장에서만 (점수도)
        if (SKIP_IN_DO[id] && following() && followTarget().free) id = SKIP_IN_DO[id];
        // 계획 장(plan-t1·plan-t2)에서 이미 계획·🔮 예측을 정했으면 측정 장에서 다시 묻지 않음 (2026-11-27 '같은 것을 두 번 묻지 않기')
        if ((id === 't1-var' || id === 't2-var') && following() && followTarget().free === id.slice(0, 2) && hasGuess(id.slice(0, 2))) id = id.slice(0, 2) + '-cond';
        markDone(id);
        if (id !== 'wait' && id !== 'sent' && stageLocked(stageOf(id))) {   // 잠긴 단계: 화면 자리는 기억하고 잠금 안내만
            if (!(opt && opt.follow)) st.lastReal = id;   // 팀이 가려던 곳 (열리면·설명을 닫으면 그리로)
            if (!(opt && opt.back) && st.screen !== id && st.screen !== 'enter') { st.history.push(st.screen); if (st.history.length > 40) st.history.shift(); }
            st.screen = id; st.stage = stageOf(id); save();
            app.innerHTML = '<section class="ev-screen" data-screen="locked">' + lockScreen(stageOf(id)).html + '</section>';
            app.setAttribute('data-screen', 'locked'); renderTop(); window.scrollTo(0, 0);
            beatIfChanged();
            return;
        }
        // 한 가지 바꿔 한 번 더 (2026-11-21 선생님): 바꾼 조건을 한 가지 값으로만 쟀으면 그래프·도전으로 가지 않고 '하나만 바꿔 한 번 더' 안내
        var need = NEED_KINDS[id];
        if (need && !PAST && M.valueKinds(st[need].trials) < 2) id = need + '-more';
        // 📱 폰은 응답만 (2026-11-23): 선생님이 띄운 장의 답 칸·측정만, 그 밖에는 👀 대기
        // 하던 곳은 팀이 스스로 간 화면으로 기억 (선생님이 장을 닫으면 그리로): 장에 맞춰 띄운 화면은 기억하지 않음
        var ft = following() ? followTarget() : null;
        if (!(opt && opt.follow) && id !== 'wait' && id !== 'sent' && !(st.forced && id === st.screen) && !(ft && !ft.free && ft !== 'end-card' && id !== 't2-build')) st.lastReal = id;
        if (ft === 'end-card') st.lastReal = 'end-card';
        var asked = id;
        id = followRedirect(id, opt);
        var fr = following() && followTarget().free;
        if (fr && id !== 'wait' && id !== 'sent') st.lastReal = id;
        // 장에 맞춰 띄운 화면(👀·✅·답 칸) = forced → 선생님이 장을 닫으면 하던 곳으로 돌아감
        st.forced = !!(following() && !fr && (id !== asked || (opt && opt.follow) || (st.forced && id === st.screen)));
        followClass();
        if (!(opt && opt.back) && st.screen !== id) { st.history.push(st.screen); if (st.history.length > 40) st.history.shift(); }
        var stage = stageOf(id), stageMoved = stage !== st.stage;
        st.screen = id; st.stage = stage; save();
        app.innerHTML = '';
        var view = SCREENS[id]();
        app.innerHTML = '<section class="ev-screen" data-screen="' + id + '">' + teamQ(id) + view.html + '</section>';
        app.setAttribute('data-screen', id);
        if (view.mount) view.mount(app.firstChild);
        renderTop();
        // 측정(녹화·초시계·눈으로 고르기)을 마쳤는데 그동안 선생님이 🎯 도전 장을 띄웠으면 그리로 (5b 하 1, 도전 화면에 우리 결과 표가 있음)
        if (wasBusy && !BUSY_RE.test(id) && following()) {
            var ct = followTarget();
            if (ct && ct.ch && !/-ch-|-challenge$/.test(id)) { setTimeout(function () { if (st.screen === id && following()) followApply(); }, 0); }
        }
        window.scrollTo(0, 0);
        var h = app.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
        if (stageMoved && share) { lastStep = stepNow(); share.stepChanged(); } else beatIfChanged();
    }
    /* ---------- 📱 폰은 응답만 (2026-11-23 선생님 "학생용 화면은 응답을 수집하기 위함이지 정보를 제공하기 위함이 아니야",
       "최대한 화면을 보고 수업에 참여하고 응답할 때만 스마트폰") ----------
       수업(?c=)이고 선생님이 🎬 발표 보기 설명 화면을 쓰는 동안(수업 문서 lesson.on)만:
       · 응답 장(key: 처음 생각 force·accel·pressure / 퀴즈 gas·control·action·mass / 다시 풀기 end-think / 정리 문장 end-cause) → 그 답 칸만, 답하면 '✅ 보냈어요'
       · 측정 장(key do-t1·do-t2) → 그 차시 측정 화면들(바꿀 것·예측·재기·결과·그래프·도전)
       · 그 밖의 장 → '👀 앞 화면을 봐요' + 팀 이름
       · 측정 중(busy)에는 장이 바뀌어도 그대로, 끝나면 띄운 장에 맞춤
       수업 없이 연 화면·지난 기록·설명 화면을 안 쓰는 반·선생님이 설명을 닫은 동안(📱 학생 화면)은 지금처럼 폰 혼자 */
    var DO_PART = { 'do-t1': 't1', 'do-t2': 't2' };
    // 🎯 도전 장 (2026-11-23 가상 수업 4차): 이 장을 띄우면 폰이 그 차시 도전 화면
    var CH_PART = { 'ch-t1': 't1', 'ch-t2': 't2' };
    var GONE = { 't1-predict': 't1-measure', 't1-ch-predict': 't1-ch-measure', 't2-base': 'q-mass' };
    // 응답 장 하나가 맡는 폰 화면 차례 (퀴즈 key 또는 화면 id) — 2026-11-27 분량 조절로 두 장을 합친 장
    var SEQ = { 'plan-t1': ['control', 't1-var'], 'plan-t2': ['t2-var'], action: ['action', 'mass'], build: ['t2-build'] };
    function sentKey(k) { return !!(st.sentKeys && st.sentKeys[k]); }
    var SKIP_IN_DO = { 'q-pressure': 't1-var', 'q-control': 't1-cond', 'q-mass': 't2-var', 'q-action': 't2-var' };
    function lessonNow() { return share && share.lessonNow ? share.lessonNow() : { on: false }; }
    // 발표용(교사 🎬 발표 보기의 옆 학생 화면, 2026-11-23 나란히 보기)도 같은 규칙으로 '폰이 지금 보는 화면'을 보임 (팀 없이, 저장·보내기 없음)
    // ✅ 선생님이 수업을 마쳤으면(수업 문서 done) 장을 따라가지 않음 — 결과 카드 그대로 (5b 하 6)
    function classDone() { var ci = share && share.classInfo && share.classInfo(); return !!(ci && ci.done); }
    function following() { return !!(CLASS && !PAST && share && lessonNow().on && !classDone() && (PRESENT || (st.team && !st.team.pending))); }
    function conceptOf(k) { return M.CONCEPTS.filter(function (c) { return c.key === k; })[0] || null; }
    // 띄운 장 → 폰 화면 (측정 장이면 { free: 't1' })
    // 놓친 점수 퀴즈 (가상 수업 5차 중 3, 5b 중 1): 아직 안 고른 점수 퀴즈 가운데 이미 지나간 것(풀이가 열렸거나 그 차시가 지남)을
    // 다음 응답 장 앞에 하나씩 — 차시를 넘어도 사라지지 않음. 한 장에서는 하나만 (고를 때까지 그대로), 남은 것은 다음 응답 장에서
    var MISSABLE = ['gas', 'control', 'action', 'mass'];
    var QUIZ_STAGE = { gas: 't1', control: 't1', action: 't2', mass: 't2' }, STAGE_ORD = { think: 0, t1: 1, t2: 2, end: 3 };
    function quizTried(k) { return !!(st.quiz[k] && st.quiz[k].tries); }
    function quizPassed(k) {
        var L = lessonNow();
        return !held(k) || (STAGE_ORD[L.stage] || 0) > STAGE_ORD[QUIZ_STAGE[k]];
    }
    function missedQuiz() {
        if (PRESENT || !(share && share.lessonUsed && share.lessonUsed())) return '';   // 발표용 옆 화면은 팀이 아님
        var at = lessonNow().key || '', inSeq = SEQ[at] || [];
        if (st.miss && st.miss.at === at) return quizTried(st.miss.k) ? '' : 'q-' + st.miss.k;
        for (var i = 0; i < MISSABLE.length; i++) {
            var k = MISSABLE[i];
            if (SCREENS['q-' + k] && !quizTried(k) && k !== at && inSeq.indexOf(k) < 0 && quizPassed(k)) { st.miss = { k: k, at: at }; save(); return 'q-' + k; }
        }
        return '';
    }
    function missingNow(k) { return !!(st.miss && st.miss.k === k && st.miss.at === (lessonNow().key || '')); }
    function followTarget() {
        var t = followTarget0();
        if (typeof t === 'string' && t !== 'wait' && t !== 'sent' && t !== 'end-card') { var miss = missedQuiz(); if (miss) return miss; }
        return t;
    }
    function followTarget0() {
        var k = lessonNow().key || '';
        if (DO_PART[k]) return { free: DO_PART[k] };
        if (CH_PART[k]) return { free: CH_PART[k], ch: true };
        if (conceptOf(k)) return st.think.first[k] ? 'sent' : 'think-' + k;
        if (SEQ[k]) return seqTarget(k);
        if (M.QUIZ[k] && SCREENS['q-' + k]) return st.quiz[k] && st.quiz[k].tries ? 'sent' : 'q-' + k;   // 고르면 바로 ✅ 보냈어요 (점수 계산은 그대로)
        if (k === 'end-think') {
            for (var i = 0; i < M.CONCEPTS.length; i++) { var z = st.quiz['end_' + M.CONCEPTS[i].key]; if (!(z && z.tries)) return 'end-' + M.CONCEPTS[i].key; }
            return lessonNow().reveal || !held('end-think') ? 'end-compare' : 'sent';
        }
        if (k === 'end-cause') return st.sentKeys && st.sentKeys['end-cause'] ? 'sent' : 'end-sentence';
        if (k === 'card') return 'end-card';   // 🖼 결과 카드 장: 폰 = 결과 카드 (모을 답은 없음)
        // 합친 장 (2026-11-27 분량 조절): 그 장 하나에서 퀴즈 → 계획·예측, 퀴즈 둘을 차례로 → ✅ 보냈어요
        return 'wait';
    }
    function seqTarget(k) {
        var seq = SEQ[k];
        for (var j = 0; j < seq.length; j++) {
            var x = seq[j];
            if (M.QUIZ[x]) { if (!(st.quiz[x] && st.quiz[x].tries)) return 'q-' + x; }
            else if (x === 't1-var' || x === 't2-var') { if (!sentKey(k)) return x; }
            else if (x === 't2-build') { if (!(st.build && st.build.done)) return x; }
        }
        return 'sent';
    }
    // 측정 장: 그 차시에서 하던 화면, 처음이면 안전 확인부터 (소개·설명 글은 앞 화면에서)
    function doEntry(part) {
        var last = st.lastReal;
        // 🛠 만들기는 측정이 아님 — 다 만든 팀이 측정 장에서 만들기 화면으로 돌아가지 않게
        if (last && stageOf(last) === part && !/-intro$/.test(last) && !(last === 't2-build' && st.build && st.build.done) && SCREENS[last]) return resumeId(last);
        if (part === 't1') { var sf = st.t1.safe || {}; return sf.goggle && sf.face && sf.away && sf.wait ? (st.t1.changed ? (st.t1.trials.length ? 't1-again' : 't1-cond') : 't1-var') : 't1-safe'; }
        return st.t2.changed ? (st.t2.trials.length ? 't2-again' : 't2-cond') : 't2-var';   // 처음(0번)이면 '이어서' 없이 조건으로 (가상 수업 5차 중 5)
    }
    // 도전 장: 그 차시 도전 화면에서 하던 것, 처음이면 도전 첫 화면 (값을 두 가지 넘게 안 쟀으면 '한 번 더')
    function chEntry(part) {
        var last = st.lastReal;
        if (last && stageOf(last) === part && /-ch-|-challenge$/.test(last) && SCREENS[last]) return resumeId(last);
        return part + '-challenge';
    }
    function followRedirect(id, opt) {
        if (!following() || id === 'enter' || id === 'locked') return id;
        if (id === 't2-build' && !(st.build && st.build.done)) return id;   // 마저 만들기 (상 1)
        if (busy() && /measure$|^t2-hand$/.test(id) && !(opt && opt.follow)) return id;   // 측정 화면을 다시 그리는 것은 그대로 (측정을 마치고 결과로 가면 띄운 장에 맞춤)
        var t = followTarget();
        if (t.free) return stageOf(id) === t.free && id !== t.free + '-intro' && id !== 't2-build' ? id : t.ch ? chEntry(t.free) : doEntry(t.free);
        return t;
    }
    // 선생님이 장을 넘기면: 측정 중이 아니면 그 장에 맞춤, 설명을 닫으면 하던 화면으로 → 처리했으면 true
    function followApply() {
        if (PAST || !CLASS || (!PRESENT && !st.team)) return false;
        if (!following()) {
            followClass();
            if (st.screen === 'wait' || st.screen === 'sent' || st.forced) { st.forced = false; show(st.lastReal && SCREENS[st.lastReal] ? resumeId(st.lastReal) : backTarget(), { back: true }); return true; }
            return false;
        }
        if (busy()) { renderTop(); return true; }
        var stay = function (rx) { return stageOf(st.screen) === t.free && !st.forced && st.screen !== t.free + '-intro' && st.screen !== 'wait' && st.screen !== 'sent' && (!rx || rx.test(st.screen)); };
        var t = followTarget(), to = t.free ? (t.ch ? (stay(/-ch-|-challenge$/) ? st.screen : chEntry(t.free)) : (stay() ? st.screen : doEntry(t.free))) : t;
        if (to !== 'wait' && to !== 'sent' && stageLocked(stageOf(to))) to = 'wait';   // 아직 안 연 단계의 장이면 대기 (단계가 열리면 onStage 가 다시 맞춤)
        show(to, { back: true, follow: true });
        return true;
    }
    function followClass() {
        var f = following(), t = f ? followTarget() : null;
        document.documentElement.classList.toggle('ev-following', f);
        document.documentElement.classList.toggle('ev-answering', !!(f && t && !t.free && t !== 'end-card'));
    }
    /* 🔎 우리 팀 물음 (2026-11-21 비계 4): 바꿀 것을 고른 뒤 측정·결과 화면 위에 이어서 (정리 문장은 카드 안에) */
    var NO_TEAMQ = { 't2-build': 1, 't1-intro': 1, 't1-again': 1, 't1-safe': 1, 't1-var': 1, 't2-intro': 1, 't2-again': 1, 't2-base': 1, 't2-var': 1 };
    function teamQ(id) {
        var part = /^t1-/.test(id) ? 't1' : /^t2-/.test(id) ? 't2' : '';
        if (!part || NO_TEAMQ[id] || !st[part] || !st[part].changed) return '';
        var q = M.teamQuestion(part, st[part].changed);
        return q ? '<p class="ev-teamq" data-teamq="' + part + '">🔎 <b>우리 팀 물음</b> · ' + esc(q) + '</p>' : '';
    }
    function back() { var p = st.history.pop(); show(p || 'enter', { back: true }); }
    app.addEventListener('click', function (e) {
        var b = e.target.closest('[data-go]');
        if (b && !b.disabled) { e.preventDefault(); show(b.dataset.go); return; }
        if (e.target.closest('[data-back]')) { e.preventDefault(); back(); }
    });
    function nav(next, label, extra) {
        return '<div class="ev-nav">' + (st.history.length ? '<button type="button" class="ev-back secondary" data-back>← 뒤로</button>' : '') +
            (next ? '<button type="button" class="ev-next good" data-go="' + next + '"' + (extra || '') + '>' + (label || '다음 →') + '</button>' : '') + '</div>';
    }
    function stepper(id, name, valueText, opt) {
        opt = opt || {};
        return '<div class="ev-stepper' + (opt.locked ? ' locked' : '') + '" data-var="' + id + '"><span class="ev-sname">' + (opt.locked ? '🔒 ' : '') + esc(name) + '</span>' +
            (opt.locked ? '<b class="ev-sval">' + esc(valueText) + '</b>' :
                '<button type="button" class="ev-pm" data-pm="-1" aria-label="' + esc(name) + ' 줄이기">−</button><b class="ev-sval" aria-live="polite">' + esc(valueText) + '</b>' +
                '<button type="button" class="ev-pm" data-pm="1" aria-label="' + esc(name) + ' 늘리기">+</button>') + '</div>';
    }
    function choiceList(opts, picked, attr) {
        return '<div class="ev-choices">' + opts.map(function (o) {
            return '<button type="button" class="ev-choice' + (picked === o.k ? ' on' : '') + '" ' + (attr || 'data-k') + '="' + esc(o.k) + '">' + esc(o.t) + '</button>';
        }).join('') + '</div>';
    }
    function fmtS(v) { return isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1) + '초' : '–'; }
    function card(t) { return '<div class="ev-card">' + t + '</div>'; }
    // 📘 정의 상자. key 가 있으면 발표 보기 설명 장의 풀이(같은 key)를 열 때까지 가림 (js/class-share.js, 설명 화면을 쓴 수업만) + 초3 쉬운 말 한 줄
    function defBox(t, word, key) {
        var easy = key && M.KEY_WORDS[key] ? M.easyLine(M.KEY_WORDS[key]) : '';
        return '<div class="ev-def"' + (key ? ' data-lesson-answer="' + esc(key) + '"' : '') + '><span class="ev-def-w">📘 ' + esc(word || '과학적 정의') + '</span><p>' + esc(t) + '</p>' +
            (easy ? '<p class="ev-easy">🧒 쉬운 말 · ' + esc(easy) + '</p>' : '') + '</div>';
    }
    function easySpan(w) { return M.EASY[w] ? ' <span class="ev-easy">(' + esc(M.EASY[w]) + ')</span>' : ''; }

    // 설명 화면을 쓴 수업에서 그 장의 풀이(key)를 아직 안 열었으면 정답 표시(⭕·📘·점수)를 미룸 — 고른 답·점수는 바로 저장
    function quizLessonKey(k) { return /^end_/.test(k) ? 'end-think' : k; }
    function held(k) { return !!(share && share.lessonHidden && share.lessonHidden(quizLessonKey(k))); }
    function shownQuiz() { var o = {}; Object.keys(st.quiz || {}).forEach(function (k) { if (!(held(k) && st.quiz[k] && st.quiz[k].tries)) o[k] = st.quiz[k]; }); return o; }
    // 설명 화면을 쓴 반에서 그 장 풀이가 이미 열렸으면 → 지금 처음 고르면 '늦게 고름'(맞혀도 5점)
    function lateNow(k) { return !!(share && share.lessonUsed && share.lessonUsed() && !held(k)); }
    // 늦게 고른 퀴즈 안내는 답 칸만 보이는 화면(ev-answering)에서도 보이게 ev-keep (5b 중 2)
    var LATE_TXT = '<p class="ev-small ev-late ev-keep">풀이를 본 뒤 골라서 5점이에요</p>';
    function quizHint(k, q) {
        if (q && q.tries) return q.late ? LATE_TXT : '';
        var miss = missingNow(k) ? '⏪ 지나간 문제예요 · ' : '';
        if (lateNow(k)) return '<p class="ev-small ev-late ev-keep">' + miss + '풀이를 본 뒤 골라서 5점이에요</p>';
        return miss ? '<p class="ev-small ev-late ev-keep">' + miss + '지금 골라요</p>' : '<p class="ev-small">처음에 맞히면 10점, 두 번째에 맞히면 5점!</p>';
    }
    var HOLD_TXT = '<p class="ev-hold" role="status">골랐어요 ✓ — <b>앞 화면을 봐요</b>. 선생님이 풀이를 보여 주면 맞았는지 나와요.</p>';
    function heldChoices(opts, picks) {
        return '<div class="ev-choices">' + opts.map(function (o) { return '<button type="button" class="ev-choice' + (picks.indexOf(o.k) >= 0 ? ' on' : '') + '" data-k="' + o.k + '" disabled>' + esc(o.t) + '</button>'; }).join('') + '</div>';
    }

    var SCREENS = {};
    // 수업 중 팀 폰 대기 화면 (2026-11-23 선생님 '응답한 답과 화면을 보세요만'): 👀 앞 화면을 봐요 · 팀 이름 · 우리가 낸 답(이 차시, 최근 3줄)
    SCREENS['wait'] = function () {
        return { html: '<div class="ev-hero ev-wait"><div class="ev-hero-ic" aria-hidden="true">👀</div><h2>앞 화면을 봐요</h2>' +
            '<p class="ev-wait-team">👨‍👩‍👧 <b>' + esc(st.team ? st.team.name : PRESENT ? '팀 이름' : '') + '</b></p></div>' + buildLine() + sentList(), mount: mountBuildLine };
    };
    /* 🛠 만들기를 못 끝낸 팀 (가상 수업 5차 상 1): 만들기 장을 넘긴 뒤에도 대기·보냄 화면에 '마저 만들기' → 만들기 화면 (다 만들면 지금 장으로) */
    function buildLeft() { return !!(following() && !PRESENT && !(st.build && st.build.done) && (lessonNow().stage === 't2' || stageOf(st.screen) === 't2') && lessonNow().key !== 'build'); }
    function buildLine() { return buildLeft() ? '<div class="ev-follow-only ev-nav col"><button type="button" class="ev-next warn" id="ev-build-back">🛠 마저 만들기 →</button></div>' : ''; }
    function mountBuildLine(el) { var b = el.querySelector('#ev-build-back'); if (b) b.addEventListener('click', function () { show('t2-build', { back: true }); }); }
    // 선생님이 앞 화면에서 풀이를 열었을 때: 지금 장의 핵심 개념 정의(힘·가속도·압력 등)를 폰에도 함께 보여 줌
    function revealedDef() {
        var L = lessonNow(), k = L && L.key;
        if (!k || !(L.reveal || !held(k))) return '';
        var c = conceptOf(k);
        if (c) {
            var easy = M.KEY_WORDS[k] ? M.easyLine(M.KEY_WORDS[k]) : '';
            return '<div class="ev-sent-def"><div class="ev-def ev-keep"><span class="ev-def-w">📘 ' + esc(c.word) + '의 과학적 정의</span><p>' + esc(c.def) + '</p>' +
                (easy ? '<p class="ev-easy ev-keep">🧒 쉬운 말 · ' + esc(easy) + '</p>' : '') + '</div>' +
                (c.ex ? '<p class="ev-ex ev-keep">💡 ' + esc(c.ex) + '</p>' : '') + '</div>';
        }
        var Q = M.QUIZ[k];
        if (Q && Q.def) {
            var easy2 = M.KEY_WORDS[k] ? M.easyLine(M.KEY_WORDS[k]) : '';
            return '<div class="ev-sent-def"><div class="ev-def ev-keep"><span class="ev-def-w">📘 ' + esc(Q.word) + '</span><p>' + esc(Q.def) + '</p>' +
                (easy2 ? '<p class="ev-easy ev-keep">🧒 쉬운 말 · ' + esc(easy2) + '</p>' : '') + '</div></div>';
        }
        return '';
    }
    SCREENS['sent'] = function () {
        var L = lessonNow(), def = revealedDef();
        var sub = L && L.key === 'end-think' && !L.reveal ? '앞 화면에서 풀이를 열면 처음 생각 → 지금 생각 비교가 나와요' : '앞 화면을 봐요';
        return { html: '<div class="ev-hero ev-wait"><div class="ev-hero-ic" aria-hidden="true">✅</div><h2>보냈어요</h2><p class="ev-wait-sub">' + sub + '</p>' +
            '<p class="ev-wait-team">👨‍👩‍👧 <b>' + esc(st.team ? st.team.name : '') + '</b></p></div>' + def + buildLine() + sentList(), mount: mountBuildLine };
    };
    // 우리가 낸 답: 선생님이 띄운 응답 장에서 고른(보낸) 답을 폰에만 적어 둠 (선생님께 보내는 자료는 그대로)
    function logAnswer(word, text) {
        if (!following() || PRESENT) return;
        st.sentLog = (st.sentLog || []).concat([{ s: lessonNow().stage || st.stage, w: String(word || ''), t: String(text || '') }]).slice(-20);
    }
    function sentList() {
        var stg = lessonNow().stage || st.stage, list = (st.sentLog || []).filter(function (x) { return x.s === stg; }).slice(-3).reverse();
        if (!list.length) return '';
        return '<ul class="ev-sentlist" aria-label="우리가 낸 답">' + list.map(function (x) { return '<li>✅ 보냈어요: ' + (x.w ? '<b>' + esc(x.w) + '</b> · ' : '') + esc(x.t) + '</li>'; }).join('') + '</ul>';
    }

    // ===== 🎯 도전 장면 사진·영상 (2026-11-23 선생님 결정: 도전하면 저절로 모음, 얼굴은 캐릭터로 가림, 수업을 마치면 지움) =====
    // 수업(팀 이름 입장) 팀 폰만. 녹화 캔버스에서 얼굴을 찾아 덮고(js/film-rocket-face.js), 그 녹화에서 사진 한 장·앞뒤 3초 영상을 만들어 보냄.
    // 얼굴 찾기를 못 불러왔거나 녹화 중 멈춘 영상은 보내지 않음(st.media 에 'x' → 결과판 '📷 없음(얼굴 가리기 못 함)'). 아이 키 cm 는 여전히 안 보냄
    var FACE = window.FilmRocketFace, media = { msg: {}, busy: {}, pending: {} };
    function mediaOn() { return !!(CLASS && !PAST && !PRESENT && share && FACE && V && V.photo && V.cut && CC && CC.mediaSave); }
    function camOpts() {
        var o = { clock: true };
        if (mediaOn()) { FACE.load(); var me = share.me(); o.mask = FACE.masker(FACE.emojiFor(me && me.jo)); }
        return o;
    }
    // 카메라 화면 아래 한 줄: 얼굴 가리기 켜짐/준비 중/못 씀 (도전이면 보내는지도)
    function faceTip(challenge) { return mediaOn() ? '<p class="ev-small ev-face" id="ev-face" data-ch="' + (challenge ? 1 : 0) + '" role="status"></p>' : ''; }
    function watchFace() {
        var el = document.getElementById('ev-face'); if (!el) return;
        var ch = el.dataset.ch === '1';
        var tick = function () {
            var s = FACE.state();
            el.textContent = s === 'ok' ? '🙂 얼굴은 캐릭터로 가려져요' + (ch ? ' · 도전 장면은 확인한 뒤 선생님께 보내요' : '')
                : s === 'fail' ? '📷 얼굴 가리기를 쓸 수 없어요' + (ch ? ' · 도전 장면은 보내지 않아요 (이 폰에만)' : '')
                : '⏳ 얼굴 가리기 준비 중… (준비되기 전에 찍으면 도전 장면은 보내지 않아요)';
            el.className = 'ev-small ev-face ' + (s === 'ok' ? 'on' : s === 'fail' ? 'off' : 'wait');
        };
        tick(); var t = setInterval(tick, 500); cleanup.push(function () { clearInterval(t); });
    }
    function mediaSet(part, text) {
        media.msg[part] = text;
        var el = document.getElementById('ev-media-' + part); if (el) { el.textContent = text; el.hidden = !text; }
    }
    function mediaLine(part) { return mediaOn() ? '<p class="ev-small ev-media-msg" id="ev-media-' + part + '" role="status"' + (media.msg[part] ? '' : ' hidden') + '>' + esc(media.msg[part] || '') + '</p>' : ''; }
    // 도전을 기록한 뒤: 얼굴을 가린 녹화면 사진·영상을 만들고 '🎯 도전 장면 확인' 화면으로 (2026-11-23 선생님 결정 '보내기 전 팀이 확인')
    // → 팀이 '✅ 얼굴이 다 가려졌어요' 를 누를 때만 보냄. 못 가린 녹화는 만들지도 않음. 이 폰에만 있는 동안(media.pending)은 새로고침하면 사라짐 = 안 보냄
    function sendScene(part, clip, at) {
        if (!mediaOn() || !clip) return;
        st.media = st.media || {};
        if (!clip.masked) {   // 얼굴을 가리지 못한 녹화 → 사진·영상을 만들지도 보내지도 않음
            st.media[part] = 'x'; changed();
            mediaSet(part, '📷 얼굴을 가리는 기능을 쓸 수 없어 도전 장면은 보내지 않았어요 (영상은 이 폰에만)');
            return;
        }
        if (media.busy[part]) return;
        var pend = media.pending[part] = { ready: false, ph: null, vd: null, err: '' };
        pend.made = (async function () {
            try {
                pend.ph = await V.photo(clip, at, { side: 640, maxChars: 210000 });
                pend.vd = await V.cut(clip, at - 3, at + 3, { side: 360, maxChars: 820000 });
                if (!pend.ph) pend.err = '사진을 만들지 못했어요';
            } catch (e) { pend.err = (e && e.message) || String(e); }
            pend.ready = true;
        })();
        show(part + '-ch-check');
    }
    function checkScreen(part) {
        return function () {
            var pend = media.pending[part];
            if (!pend) return { html: '<p class="ev-kicker">🎯 도전 장면 확인</p><p>확인할 장면이 없어요. 도전 장면은 보내지 않았어요.</p>' + nav(part + '-ch-result', '도전 결과 보기 →') };
            var html = '<p class="ev-kicker">🎯 도전 장면 확인</p><h2>얼굴이 다 가려졌나요?</h2>' +
                '<p>선생님께 보낼 장면이에요. 얼굴이 모두 캐릭터로 가려졌는지 함께 봐요.</p>' +
                '<div id="ev-chk" class="ev-chk"><p class="ev-msg" role="status">⏳ 장면을 만드는 중…</p></div>' +
                '<div class="ev-nav col"><button type="button" class="ev-next good" id="ev-chk-send" disabled>✅ 얼굴이 다 가려졌어요 — 선생님께 보내기</button>' +
                '<button type="button" class="ev-next danger" id="ev-chk-skip">🙈 가려지지 않은 얼굴이 있어요 — 보내지 않기</button></div>';
            return { html: html, mount: function () {
                var box = $('#ev-chk'), send = $('#ev-chk-send'), alive = true;
                cleanup.push(function () { alive = false; });
                pend.made.then(function () {
                    if (!alive) return;
                    if (!pend.ph) { box.innerHTML = '<p class="ev-no">⚠ 도전 장면을 만들지 못했어요 (' + esc(pend.err) + '). 보내지 않아요.</p>'; return; }
                    // 사진 | 영상 두 칸 (한 화면에 단추까지 보이게)
                    box.innerHTML = '<figure><img id="ev-chk-img" class="ev-chk-img" alt="보낼 사진 (얼굴은 캐릭터로 가림)"><figcaption>📷 사진</figcaption></figure>' +
                        (pend.vd ? '<figure><video id="ev-chk-vid" class="ev-chk-img" controls muted playsinline preload="auto"></video><figcaption id="ev-chk-vcap">▶ 영상 (앞뒤 3초 — 꼭 재생해 끝까지 봐요)</figcaption></figure>' : '');
                    box.classList.toggle('two', !!pend.vd);
                    $('#ev-chk-img').src = pend.ph.data;
                    if (pend.vd) {
                        var vEl = $('#ev-chk-vid'), vCap = $('#ev-chk-vcap');
                        vEl.src = pend.vd.data;
                        vEl.addEventListener('ended', function () { if (vCap) { vCap.textContent = '✅ 영상 끝까지 확인했어요 (앞뒤 3초)'; vCap.style.color = 'var(--c-ok-text)'; } });
                    }
                    send.disabled = false;
                });
                send.addEventListener('click', function () {
                    if (!pend.ph) return;
                    delete media.pending[part];
                    uploadScene(part, pend.ph, pend.vd);
                    show(part + '-ch-result');
                });
                $('#ev-chk-skip').addEventListener('click', function () {
                    delete media.pending[part];
                    st.media[part] = 'n'; changed();
                    mediaSet(part, '🙈 도전 장면은 보내지 않았어요 (도전 결과 숫자는 보냈어요)');
                    show(part + '-ch-result');
                });
            } };
        };
    }
    SCREENS['t1-ch-check'] = checkScreen('t1');
    SCREENS['t2-ch-check'] = checkScreen('t2');
    async function uploadScene(part, ph, vd) {
        var info = share.classInfo(), me = share.me();
        if (!info || !info.space || !me) { mediaSet(part, '📷 선생님 수업에 연결되지 않아 도전 장면은 보내지 않았어요'); return; }
        media.busy[part] = true;
        mediaSet(part, '📤 도전 장면(얼굴은 캐릭터로 가림)을 선생님께 보내는 중…');
        var url = 'lab:' + info.space, sent = 0, err = '';
        try {
            var put = async function (kind, x) {
                for (var i = 0; i < 2; i++) {
                    var r = await CC.mediaSave(url, { classCode: CLASS, jo: me.jo, part: part, kind: kind, data: x.data });
                    if (r && r.ok) return true;
                    err = (r && r.error) || '알 수 없는 문제';
                    if (!(r && r.network)) return false;
                    await new Promise(function (res) { setTimeout(res, 3000); });
                }
                return false;
            };
            if (await put('photo', ph)) sent = 1;
            if (sent && vd && await put('video', vd)) sent = 2;
        } catch (e) { err = (e && e.message) || String(e); }
        media.busy[part] = false;
        if (sent) { st.media[part] = sent === 2 ? 'v' : 'p'; changed(); }
        mediaSet(part, sent ? '✅ 도전 장면(얼굴은 캐릭터로 가림)을 선생님께 보냈어요' + (sent === 1 ? ' · 사진만' : '') : '⚠ 도전 장면을 보내지 못했어요 (' + err + ')');
    }

    // ===== 0 입장 =====
    SCREENS.enter = function () {
        var me = share && share.me(), info = share && share.classInfo();
        var waiting = CLASS && !info && !(share && share.classFailed());
        var already = st.team && (me || st.team.pending || !CLASS);
        var html = '<div class="ev-hero"><div class="ev-hero-ic" aria-hidden="true">🚀</div><h1>발포비타민 필름통 로켓</h1><p class="ev-lead">가족과 함께하는 과학실험교실</p></div>';
        if (already && !st.team.problem) {
            html += card('<p>👨‍👩‍👧 우리 팀: <b>' + esc(st.team.name) + '</b></p><p class="ev-small">' + (PAST ? '📂 수업이 끝난 뒤 이 폰에 남은 기록이에요. 선생님께는 보내지 않아요.' : '이 폰에 저장된 곳부터 이어서 해요.') + '</p>') +
                '<div class="ev-nav col"><button type="button" class="ev-next good" id="ev-continue">' + (PAST ? '📋 기록 보기 →' : '이어서 하기 →') + '</button>' +
                (PAST ? '<button type="button" class="ev-next secondary" data-go="end-card">🖼 결과 카드</button><button type="button" class="ev-next secondary" data-go="t1-graph">📊 1차시 결과 비교</button>' : '') + '</div>' + (PAST ? '' : pastBox());
            return { html: html, mount: function () { $('#ev-continue').addEventListener('click', function () { show(st.lastScreen && st.lastScreen !== 'enter' ? st.lastScreen : 'think-intro'); }); } };
        }
        html += '<h2>팀 이름을 정해요</h2>' +
            '<p>가족이 함께 정한 <b>별명</b>이나 <b>가족 이름</b>으로 해요. <span class="ev-small">(실명·학번은 쓰지 않아요)</span></p>' +
            '<label class="ev-field">팀 이름 (12글자까지)<input type="text" id="ev-name" maxlength="12" autocomplete="off" placeholder="예: 별빛 가족" value="' + esc(st.team ? st.team.name : '') + '"></label>' +
            (CLASS ? '<p class="ev-small ev-media-note">📷 도전 장면은 얼굴을 캐릭터로 가리고, 팀이 확인한 뒤에만 선생님께 보내요. 수업이 끝나면 지워져요.</p>' +
                '<p class="ev-small">💡 크롬·사파리 <b>일반 탭</b>으로 열어야 팀 자리와 기록이 유지돼요 (카카오톡·QR 앱 안 창이나 사생활 보호 모드는 닫으면 기록이 지워질 수 있어요).</p>' : '') +
            '<div class="ev-chips">' + ['별빛 가족', '로켓 탐험대', '무지개 팀', '번개 가족'].map(function (n) { return '<button type="button" class="ev-chip" data-name="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div>' +
            '<p id="ev-enter-msg" class="ev-msg" role="status" aria-live="polite">' + (st.team && st.team.problem ? '⚠ ' + esc(st.team.problem) : share && share.classFailed() && !isNetErr(share.classFailed()) ? '⚠ ' + esc(share.classFailed().error) : waiting ? '⏳ 선생님 수업에 연결하는 중…' : !CLASS ? 'ℹ️ 선생님 QR 로 들어오지 않았어요. 결과는 이 폰에만 저장돼요.' : '') + '</p>' +
            '<div class="ev-nav"><button type="button" class="ev-next good" id="ev-start">시작하기 →</button></div>' + pastBox();
        return { html: html, mount: function () {
            var inp = $('#ev-name'), msg = $('#ev-enter-msg');
            app.querySelectorAll('[data-name]').forEach(function (b) { b.addEventListener('click', function () { inp.value = b.dataset.name; inp.focus(); }); });
            $('#ev-start').addEventListener('click', async function () {
                var name = window.LabStore ? window.LabStore.cleanTeamName(inp.value) : String(inp.value || '').trim().slice(0, 12);
                if (!name) { msg.textContent = '⚠ 팀 이름을 넣어 주세요.'; inp.focus(); return; }
                var btn = this; btn.disabled = true;
                if (!CLASS) { st.team = { name: name, local: true }; save(); show('think-intro'); return; }
                msg.textContent = '⏳ 입장하는 중…';
                var r = await tryJoin(name, false);
                btn.disabled = false;
                if (r.ok) { if (r.again) alert('이 폰은 이미 ‘' + r.name + '’ 팀이에요. 그 팀으로 이어서 해요.'); show('think-intro'); return; }
                if (isNetErr(r)) {   // 인터넷이 끊김 → 폰에 저장하고 진행, 연결되면 다시 입장
                    st.team = { name: name, pending: true }; st.dirty = true; save();
                    alert('인터넷이 연결되지 않았어요. 이 폰에 저장하고 계속해요. 연결되면 저절로 선생님께 보내요.');
                    show('think-intro'); retryLoop(); return;
                }
                // 인터넷 문제가 아님 (예: 익명 로그인 꺼짐·권한) → 진짜 이유를 그대로. 선생님이 고친 뒤 다시 누르면 됨
                msg.textContent = '⚠ ' + r.error;
                if (!/같은 이름|자리가 다 찼|팀 이름을 넣어/.test(String(r.error || ''))) alert('입장하지 못했어요: ' + r.error + '\n선생님께 이 화면을 보여 주세요.');
            });
        } };
    };

    // 이 폰에 남은 지난 수업 기록 (팀 이름이 있는 것만, 최근 것 먼저)
    function pastRecords() {
        var out = [];
        try {
            for (var i = 0; LS && i < LS.length; i++) {
                var k = LS.key(i), m = /^film-rocket:v1:(\d{1,2}-\d{4})$/.exec(k || '');
                if (!m || m[1] === PAST) continue;
                var d = null; try { d = JSON.parse(LS.getItem(k)); } catch (e) { d = null; }
                if (!d || !d.team || !d.team.name) continue;
                var n = (d.t1 && d.t1.trials ? d.t1.trials.length : 0) + (d.t2 && d.t2.trials ? d.t2.trials.length : 0);
                out.push({ code: m[1], name: String(d.team.name), at: String(d.savedAt || d.sentAt || ''), n: n });
            }
        } catch (e) { /* 저장소를 못 읽음 */ }
        return out.sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 5);
    }
    function pastBox() {
        if (CLASS || PRESENT) return '';
        var list = pastRecords();
        if (!list.length) return '';
        return '<h3>📂 이 폰의 지난 기록</h3><div class="ev-nav col">' + list.map(function (r) {
            var d = r.at ? new Date(r.at) : null, day = d && !isNaN(d) ? ' (' + (d.getMonth() + 1) + '/' + d.getDate() + ')' : '';
            return '<button type="button" class="ev-next secondary" data-past="' + esc(r.code) + '">👨‍👩‍👧 ' + esc(r.name) + day + ' · 잰 값 ' + r.n + '개 보기</button>';
        }).join('') + '</div>';
    }
    app.addEventListener('click', function (e) {
        var b = e.target.closest('[data-past]'); if (!b) return;
        location.href = location.pathname + '?past=' + encodeURIComponent(b.dataset.past);
    });

    // ===== 1 들어가기 =====
    SCREENS['think-intro'] = function () {
        return { html: '<h2>💭 들어가기</h2>' + card('<p>먼저 <b>내 생각</b>을 골라요. 정답이 아니어도 괜찮아요!</p><p>고르면 <b>과학에서는 어떻게 말하는지(힘·가속도·압력)</b> 짧게 알려 줘요.</p><p class="ev-small">처음 고른 생각은 저장해 두었다가, 마지막에 다시 풀고 나란히 비교해요.</p>') + nav('think-force', '시작 →') };
    };
    function conceptScreen(c, next, final) {
        return function () {
            if (!final) {
                var picked = st.think.first[c.key];
                var html = '<p class="ev-kicker">내 생각</p><h2>' + esc(c.q) + '</h2>' + choiceList(c.opts, picked) +
                    (picked ? '<div data-lesson-answer="' + c.key + '">' + defBox(c.def, c.word + '의 과학적 정의', c.key).replace(' data-lesson-answer="' + c.key + '"', '') + '<p class="ev-ex">💡 ' + esc(c.ex) + '</p></div>' : '<p class="ev-small">정답이 아니어도 괜찮아요. 지금 생각을 골라요.</p>') +
                    nav(next, '다음 →', picked ? '' : ' disabled');
                return { html: html, mount: function (el) {
                    el.querySelector('.ev-choices').addEventListener('click', function (e) {
                        var b = e.target.closest('[data-k]'); if (!b || st.think.first[c.key]) return;   // 처음 생각은 한 번만
                        st.think.first[c.key] = b.dataset.k; logAnswer(c.word, M.optText(c.opts, b.dataset.k)); changed(); show(st.screen, { back: true });
                    });
                } };
            }
            // 정리: 다시 풀기 = 정의 퀴즈 (처음 고른 것 = 지금 생각)
            var qk = 'end_' + c.key, q = st.quiz[qk] || { tries: 0, correct: false, picks: [] }, done = q.correct || q.tries >= 3;
            if (q.tries && held(qk)) return { html: '<p class="ev-kicker">⭐ 다시 풀기 · 정의 퀴즈</p><h2>' + esc(c.q) + '</h2>' + heldChoices(c.opts, q.picks) + HOLD_TXT + nav(next, '다음 →') };
            var html2 = '<p class="ev-kicker">⭐ 다시 풀기 · 정의 퀴즈</p><h2>' + esc(c.q) + '</h2>' +
                '<div class="ev-choices">' + c.opts.map(function (o) {
                    var cls = q.picks.indexOf(o.k) >= 0 ? (o.k === 'ok' ? ' right' : ' wrong') : '';
                    return '<button type="button" class="ev-choice' + cls + '" data-k="' + o.k + '"' + (done ? ' disabled' : '') + '>' + esc(o.t) + '</button>';
                }).join('') + '</div>' + quizFeedback(q, qk) + (done ? defBox(c.def, c.word + '의 과학적 정의', c.key) : '') + nav(next, '다음 →', done ? '' : ' disabled');
            return { html: html2, mount: function (el) {
                el.querySelector('.ev-choices').addEventListener('click', function (e) {
                    var b = e.target.closest('[data-k]'); if (!b || b.disabled) return;
                    var cur = st.quiz[qk] || (st.quiz[qk] = { tries: 0, correct: false, picks: [] });
                    if (cur.correct || cur.picks.indexOf(b.dataset.k) >= 0) return;
                    if (!cur.tries && lateNow(qk)) cur.late = true;
                    cur.tries++; cur.picks.push(b.dataset.k); if (b.dataset.k === 'ok') cur.correct = true;
                    if (!st.think.last[c.key]) st.think.last[c.key] = b.dataset.k;
                    if (cur.tries === 1) logAnswer(c.word, M.optText(c.opts, b.dataset.k));
                    changed(); show(st.screen, { back: true });
                });
            } };
        };
    }
    function quizFeedback(q, k) {
        if (!q || !q.tries) return quizHint(k, q);
        return q.correct ? '<p class="ev-ok">⭕ 맞았어요! +' + M.quizPoints(q.tries, true, q.late) + '점</p>' + quizHint(k, q) :
            '<p class="ev-no">❌ 아니에요. 한 번 더 골라 보세요! (맞히면 5점)</p>';
    }
    SCREENS['think-force'] = conceptScreen(M.CONCEPTS[0], 'think-accel');
    SCREENS['think-accel'] = conceptScreen(M.CONCEPTS[1], 'think-pressure');
    SCREENS['think-pressure'] = conceptScreen(M.CONCEPTS[2], 't1-intro');

    // 정의 퀴즈 (점수): 고르면 맞음/틀림, 틀리면 다시 (두 번째 5점)
    function quizScreen(key, next, kicker) {
        return function () {
            var Q = M.QUIZ[key], q = st.quiz[key] || { tries: 0, correct: false, picks: [] };
            if (q.tries && held(key)) return { html: '<p class="ev-kicker">⭐ 정의 퀴즈' + (kicker ? ' · ' + esc(kicker) : '') + '</p><h2>' + esc(Q.q) + '</h2>' + heldChoices(Q.opts, q.picks) + HOLD_TXT + nav(next, '다음 →') };
            var last = q.picks[q.picks.length - 1];
            var done = q.correct || q.tries >= 3;
            var html = '<p class="ev-kicker">⭐ 정의 퀴즈' + (kicker ? ' · ' + esc(kicker) : '') + '</p><h2>' + esc(Q.q) + '</h2>' +
                '<div class="ev-choices">' + Q.opts.map(function (o) {
                    var cls = q.picks.indexOf(o.k) >= 0 ? (o.k === 'ok' ? ' right' : ' wrong') : '';
                    return '<button type="button" class="ev-choice' + cls + '" data-k="' + o.k + '"' + (done ? ' disabled' : '') + '>' + esc(o.t) + '</button>';
                }).join('') + '</div>' +
                (q.tries ? (q.correct ? '<p class="ev-ok">⭕ 맞았어요! +' + M.quizPoints(q.tries, true, q.late) + '점</p>' + quizHint(key, q) : last ? '<p class="ev-no">❌ 아니에요. ' + (done ? '정답을 확인해요.' : '한 번 더 골라 보세요! (맞히면 5점)') + '</p>' : '') : quizHint(key, q)) +
                (done ? defBox(Q.def, Q.word, key) : '') + nav(next, '다음 →', done ? '' : ' disabled');
            return { html: html, mount: function (el) {
                el.querySelector('.ev-choices').addEventListener('click', function (e) {
                    var b = e.target.closest('[data-k]'); if (!b || b.disabled) return;
                    var cur = st.quiz[key] || (st.quiz[key] = { tries: 0, correct: false, picks: [] });
                    if (cur.correct || cur.picks.indexOf(b.dataset.k) >= 0) return;
                    if (!cur.tries && lateNow(key)) cur.late = true;
                    cur.tries++; cur.picks.push(b.dataset.k); if (b.dataset.k === 'ok') cur.correct = true;
                    if (cur.tries === 1) logAnswer(Q.word, M.optText(Q.opts, b.dataset.k));
                    changed(); show(st.screen, { back: true });
                });
            } };
        };
    }

    // ===== 2 1차시: 필름통이 열리는 시간 맞추기 =====
    SCREENS['t1-intro'] = function () {
        var s = setup();
        return { html: '<p class="ev-kicker">1차시' + easySpan('1차시') + '</p><h2>⏱ 필름통이 ‘펑’ 열리는 시간 맞추기</h2>' +
            card('<p>필름통에 물과 발포비타민을 넣고 뚜껑을 닫으면, 잠시 뒤 <b>‘펑’</b> 하고 뚜껑이 열려요.</p><p>조건을 바꾸면 열리는 시간이 어떻게 달라질까요? 마지막에는 선생님이 낸 <b>목표 시간(' + esc(s.targetTime) + '초)</b>에 맞춰 보는 도전을 해요!</p>') +
            '<details class="ev-more"><summary>🧰 준비물</summary><p>필름통(뚜껑이 안쪽으로 끼워지는 것) · 발포비타민 · 물 · 계량스푼 · 스포이트 · 초시계 · 온도계 · 보안경 · 쟁반 · 걸레</p></details>' +
            nav('q-gas', '다음 →') };
    };
    function safetyScreen(part, items, next) {
        return function () {
            var done = st[part].safe || {};
            var all = items.every(function (x) { return done[x.k]; });
            var html = '<h2>🦺 안전 확인</h2><p>모두 체크해야 다음으로 갈 수 있어요.</p><div class="ev-checks">' + items.map(function (x) {
                return '<label class="ev-check' + (done[x.k] ? ' on' : '') + '"><input type="checkbox" data-safe="' + x.k + '"' + (done[x.k] ? ' checked' : '') + '><span>' + x.t + '</span></label>';
            }).join('') + '</div>' + nav(next, '다음 →', all ? '' : ' disabled');
            return { html: html, mount: function (el) {
                el.querySelector('.ev-checks').addEventListener('change', function (e) {
                    var k = e.target.dataset.safe; if (!k) return;
                    st[part].safe = st[part].safe || {}; st[part].safe[k] = e.target.checked;
                    e.target.closest('.ev-check').classList.toggle('on', e.target.checked);
                    save();
                    el.querySelector('.ev-next').disabled = !items.every(function (x) { return st[part].safe[x.k]; });
                });
            } };
        };
    }
    // 다시 들어온 팀: 안전 수칙은 한 화면으로 다시 확인 → 바로 조건 고르기·측정 (처음 하는 팀은 소개부터 전부)
    function againScreen(part) {
        return function () {
            var p = st[part], defs = ensureBase(part), d = defs[p.changed], n = p.trials.length;
            var t1 = part === 't1';
            var html = '<p class="ev-kicker">' + (t1 ? '1차시' : '2차시') + ' · 이어서</p><h2>🔁 이어서 해요</h2>' +
                card('<p>바꾸는 조건: <b>' + esc(d ? d.short || d.name : '–') + '</b> · 지금까지 <b>' + n + '번</b> 쟀어요.</p>') +
                '<div class="ev-def"><p class="ev-def-w">🦺 안전 다시 확인</p><p>' + (t1 ? '🥽 보안경 · 🙅 얼굴 멀리 · 🏃 닫고 바로 물러나기 · ✋ 안 열리면 들여다보지 않고 선생님 부르기'
                    : '🥽 보안경 · 🏃 발사대에서 물러나기 · 🙅 로켓 위로 얼굴 내밀지 않기 · ✋ 안 날아가면 선생님 부르기') + '</p></div>' +
                '<div class="ev-nav col"><button type="button" class="ev-next good" data-go="' + part + '-cond">✅ 안전 확인 · 조건 고르고 ' + (t1 ? '재기' : '발사하기') + ' →</button>' +
                (n ? '<button type="button" class="ev-next secondary" data-go="' + part + '-graph">📊 결과 비교 보기</button><button type="button" class="ev-next secondary" data-go="' + part + '-challenge">🎯 목표 도전</button>' : '') +
                '<button type="button" class="ev-next secondary" data-go="' + part + '-intro">처음부터 보기</button></div>';
            return { html: html };
        };
    }
    SCREENS['t1-again'] = againScreen('t1');
    SCREENS['t2-again'] = againScreen('t2');
    SCREENS['t1-safe'] = safetyScreen('t1', [
        { k: 'goggle', t: '🥽 <b>보안경</b>을 썼어요' },
        { k: 'face', t: '🙅 필름통에서 <b>얼굴을 멀리</b> 해요' },
        { k: 'away', t: '🏃 뚜껑을 <b>닫고 바로 물러나요</b>' },
        { k: 'wait', t: '✋ 열리지 않으면 <b>들여다보거나 흔들지 않고</b> 선생님을 불러요' }
    ], 'q-pressure');
    SCREENS['q-pressure'] = quizScreen('pressure', 't1-var', '측정 전');

    // 한 가지만 바꾸기 (변인 통제): 바꿀 조건 하나 + 바꿀 값 ① → ② 를 미리 정함 → 나머지는 잠김
    function ensureBase(part) {
        var defs = part === 't1' ? M.vars1(st.setup) : M.vars2(st.setup);
        var p = st[part];
        if (!p.base) { p.base = {}; Object.keys(defs).forEach(function (k) { p.base[k] = defs[k].base; }); }
        Object.keys(defs).forEach(function (k) { if (defs[k].values.indexOf(p.base[k]) < 0) p.base[k] = defs[k].base; });
        if (p.value == null && p.changed) p.value = p.base[p.changed];
        return defs;
    }
    function ensurePlan(part) {
        var defs = ensureBase(part), p = st[part], d = defs[p.changed];
        if (!d) return null;
        var vals = d.values || [];
        if (!Array.isArray(p.plan) || p.plan.length < 2 || vals.indexOf(p.plan[0]) < 0 || vals.indexOf(p.plan[1]) < 0) {
            var v1 = vals.indexOf(p.base[p.changed]) >= 0 ? p.base[p.changed] : vals[0];
            var i1 = vals.indexOf(v1);
            var v2 = vals.length > 1 ? vals[i1 + 1 < vals.length ? i1 + 1 : i1 - 1] : v1;
            p.plan = [v1, v2];
        }
        return p.plan;
    }
    function planOk(part) {
        var defs = ensureBase(part), p = st[part], d = defs[p.changed];
        if (!d) return false;
        var plan = ensurePlan(part);
        return d.values.length <= 1 || !!(plan && plan[0] !== plan[1]);
    }
    // 정해 둔 ① → ② 중 아직 다 안 잰 다른 값 (현재 값 curVal 과 다를 때만)
    function nextPlanned(part, curVal) {
        var defs = ensureBase(part), p = st[part], d = defs[p.changed];
        if (!d || d.values.length <= 1) return null;
        var plan = ensurePlan(part), reps = setup().repeats;
        if (!plan || plan[0] === plan[1]) return null;
        var idx = curVal === plan[0] ? 1 : curVal === plan[1] ? 0 : -1;
        if (idx < 0) return null;
        var target = plan[idx];
        var cnt = p.trials.filter(function (t) { return t.value === target; }).length;
        return cnt < reps ? { idx: idx, val: target } : null;
    }
    function planBar(part, opt) {
        opt = opt || {};
        var defs = ensureBase(part), p = st[part], d = defs[p.changed];
        if (!d || d.values.length <= 1) return '';
        var plan = ensurePlan(part), reps = setup().repeats;
        if (!plan) return '';
        var item = function (idx) {
            var v = plan[idx], cnt = p.trials.filter(function (t) { return t.value === v; }).length;
            var tag = idx === 0 ? '①' : '②', on = p.value === v ? ' on' : '', done = cnt >= reps ? ' done' : '';
            var txt = tag + ' <b>' + esc(d.label(v)) + '</b> <small>(' + cnt + '/' + reps + (cnt >= reps ? ' ✅' : '') + ')</small>';
            return opt.pickable
                ? '<button type="button" class="ev-plan-chip' + on + done + '" data-pick-plan="' + idx + '">' + txt + '</button>'
                : '<span class="ev-plan-chip' + on + done + '">' + txt + '</span>';
        };
        return '<div class="ev-plan-bar" aria-label="정해 둔 비교 계획">' + item(0) + '<span class="ev-plan-arr" aria-hidden="true">→</span>' + item(1) + '</div>';
    }
    function guessHeading(part, d) {
        var G = M.GUESS[part], plan = ensurePlan(part);
        var changeTxt = plan && d.values.length > 1
            ? '<b>' + esc(d.label(plan[0])) + ' → ' + esc(d.label(plan[1])) + '</b> 로 바꾸면 '
            : (d.cat ? '바꾸면 ' : '늘리면 ');
        return '🔮 ' + esc(M.josa(d.short || d.name, '을를')) + ' ' + changeTxt + G.what + '?';
    }
    function varScreen(part, title, next) {
        return function () {
            var defs = ensureBase(part), p = st[part], d = p.changed ? defs[p.changed] : null;
            var plan = d ? ensurePlan(part) : null, okP = planOk(part), okG = hasGuess(part);
            var keys = part === 't1' ? ['water', 'temp', 'tablet', 'piece'] : ['mass', 'water', 'tablet', 'fins'];
            var planHtml = d && plan && d.values.length > 1
                ? '<div class="ev-plan" data-plan="' + part + '"><h3>🎯 어떻게 바꿔서 비교할까요? <small>(① → ②)</small></h3>' +
                    '<div class="ev-plan-row">' +
                    '<div class="ev-stepper ev-plan-step" data-plan-slot="0"><span class="ev-sname">① 첫 번째</span><button type="button" class="ev-pm" data-pm="-1" aria-label="첫 번째 값 줄이기">−</button><b class="ev-sval">' + esc(d.label(plan[0])) + '</b><button type="button" class="ev-pm" data-pm="1" aria-label="첫 번째 값 늘리기">+</button></div>' +
                    '<div class="ev-stepper ev-plan-step" data-plan-slot="1"><span class="ev-sname">② 바꿔 볼 값</span><button type="button" class="ev-pm" data-pm="-1" aria-label="바꿔 볼 값 줄이기">−</button><b class="ev-sval">' + esc(d.label(plan[1])) + '</b><button type="button" class="ev-pm" data-pm="1" aria-label="바꿔 볼 값 늘리기">+</button></div>' +
                    '</div><p class="ev-no" role="alert" id="ev-plan-same"' + (okP ? ' hidden' : '') + '>✋ ①과 ②는 <b>서로 다른 값</b>으로 정해요. + 나 − 를 눌러 바꿔요.</p></div>'
                : '';
            var html = '<h2>🔒 ' + esc(title) + '</h2>' + (p.changed ? '<p class="ev-small"><b>한 가지만 바꾸기(변인 통제)</b> · 나머지는 같게 🔒</p>' : '<p><b>한 가지만 바꾸기(변인 통제)</b>: 바꿀 조건을 <b>하나</b> 고르고 ① → ② 를 정해요. 나머지는 같게 🔒 잠가요.</p>') +
                '<div class="ev-choices' + (p.changed ? ' ev-var-compact' : '') + '">' + keys.map(function (k) {
                    return '<button type="button" class="ev-choice' + (p.changed === k ? ' on' : '') + '" data-k="' + k + '">' + (p.changed === k ? '🔓 ' : '') + esc(defs[k].short || defs[k].name) + ' 바꾸기</button>';
                }).join('') + '</div>' +
                planHtml +
                // 🔮 예측은 ① → ② 바로 아래, ①≠② 와 방향을 골라야 [다음 →]
                (p.changed ? guessBlock(part, d) : '') +
                (p.changed ? '<h3>같게 할 조건 🔒 <small>(①·② 둘 다 똑같이)</small></h3>' + Object.keys(defs).filter(function (k) { return k !== p.changed; }).map(function (k) {
                    return stepper(k, defs[k].short || defs[k].name, defs[k].label(p.base[k]), { locked: true });
                }).join('') : '') +
                (p.trials.length && p.changed ? '<p class="ev-small">바꿀 조건을 바꾸면 지금까지 잰 값은 그대로 두고, 결과 비교 표는 새 조건으로 보여 줘요.</p>' : '') +
                (p.changed && !okG ? '<p class="ev-small ev-need-guess">' + (okP ? '🔮 예측을 골라야 다음으로 가요' : '✋ ①과 ②를 서로 다른 값으로 정해야 다음으로 가요') + '</p>' : '') +
                // 계획 장(plan-t1·plan-t2)을 띄운 동안: 다 정하면 '다음 →' → ✅ 보냈어요 (다음 단추 흐름은 숨김, 2026-11-27)
                (following() && lessonNow().key === 'plan-' + part ? '<div class="ev-follow-only ev-nav col"><button type="button" class="ev-next good" id="ev-plan-send"' + (okG ? '' : ' disabled') + '>✅ 다 정했어요 · 다음 →</button></div>' : '') +
                nav(next, '다음 →', okG ? '' : ' disabled');
            return { html: html, mount: function (el) {
                var syncNext = function () {
                    var ok1 = planOk(part), ok2 = hasGuess(part);
                    var same = el.querySelector('#ev-plan-same'); if (same) same.hidden = ok1;
                    var nx = el.querySelector('.ev-next[data-go]'); if (nx) nx.disabled = !ok2;
                    var ps = el.querySelector('#ev-plan-send'); if (ps) ps.disabled = !ok2;
                    var need = el.querySelector('.ev-need-guess');
                    if (ok2 && need) need.remove();
                    else if (!ok2 && need) need.textContent = ok1 ? '🔮 예측을 골라야 다음으로 가요' : '✋ ①과 ②를 서로 다른 값으로 정해야 다음으로 가요';
                };
                el.querySelector('.ev-choices').addEventListener('click', function (e) {
                    var b = e.target.closest('[data-k]'); if (!b) return;
                    if (p.changed !== b.dataset.k) { p.changed = b.dataset.k; p.plan = null; var pl = ensurePlan(part); p.value = pl ? pl[0] : p.base[p.changed]; p.guess = null; changed(); }
                    show(st.screen, { back: true });
                });
                var pbox = el.querySelector('[data-plan]');
                if (pbox && d) pbox.addEventListener('click', function (e) {
                    var b = e.target.closest('[data-pm]'); if (!b) return;
                    var row = b.closest('[data-plan-slot]'), slot = Number(row.dataset.planSlot);
                    var pl = ensurePlan(part);
                    pl[slot] = M.stepIn(d.values, pl[slot], Number(b.dataset.pm));
                    if (slot === 0 && !p.trials.length) p.value = pl[0];
                    row.querySelector('.ev-sval').textContent = d.label(pl[slot]);
                    var gh = el.querySelector('[data-guess] h3'); if (gh) gh.innerHTML = guessHeading(part, d);
                    changed(); syncNext();
                });
                mountGuess(el, part, syncNext);
                var ps = el.querySelector('#ev-plan-send');
                if (ps) ps.addEventListener('click', function () {
                    if (!hasGuess(part)) return;
                    var dd = ensureBase(part)[p.changed], pl = ensurePlan(part), G = M.GUESS[part];
                    st.sentKeys = st.sentKeys || {}; st.sentKeys['plan-' + part] = true;
                    logAnswer('계획', (dd.short || dd.name) + (pl && dd.values.length > 1 ? ' ' + dd.label(pl[0]) + ' → ' + dd.label(pl[1]) : '') + ' · 🔮 ' + (G[p.guess.dir] || ''));
                    changed(); show('sent', { follow: true });
                });
            } };
        };
    }
    /* 🔮 예측 (2026-11-21 '예측·정리 문장 적는 칸'): 고른 조건의 ① → ② 로 바꾸면 어떻게 될까? — 큰 고르기 + 까닭 짧은 칸(안 써도 됨) */
    function guessBlock(part, d) {
        var G = M.GUESS[part], g = st[part].guess || {};
        return '<div class="ev-guess" data-guess="' + part + '"><h3>' + guessHeading(part, d) + '</h3>' +
            '<div class="ev-choices">' + ['down', 'up', 'same'].map(function (k) {
                return '<button type="button" class="ev-choice' + (g.dir === k ? ' on' : '') + '" data-dir="' + k + '">' + esc(G[k]) + '</button>';
            }).join('') + '</div>' +
            '<label class="ev-field">왜 그렇게 생각해요? <small>(짧게, 안 써도 돼요)</small><input type="text" class="ev-why-in" maxlength="40" autocomplete="off" placeholder="' + esc(M.whyExample(part, st[part].changed)) + '" value="' + esc(g.why || '') + '"></label></div>';
    }
    function hasGuess(part) { var p = st[part]; return !!(p.changed && planOk(part) && p.guess && p.guess.dir); }
    // 🔮 우리 예측 한 줄 (측정·결과 화면 위, 맞았는지는 그래프·정리에서)
    function guessLine(part) { var g = st[part].guess, G = M.GUESS[part]; return g && G[g.dir] ? '🔮 우리 예측: <b>' + esc(G[g.dir]) + '</b> · ' : ''; }
    function mountGuess(el, part, onSync) {
        var box = el.querySelector('[data-guess]'); if (!box) return;
        box.querySelector('.ev-choices').addEventListener('click', function (e) {
            var b = e.target.closest('[data-dir]'); if (!b) return;
            st[part].guess = Object.assign({}, st[part].guess, { dir: b.dataset.dir }); changed();
            Array.prototype.forEach.call(box.querySelectorAll('[data-dir]'), function (x) { x.classList.toggle('on', x === b); });
            if (onSync) onSync();
            else {
                var nx = el.querySelector('.ev-next[data-go]'); if (nx) nx.disabled = !hasGuess(part);
                var need = el.querySelector('.ev-need-guess'); if (need && hasGuess(part)) need.remove();
            }
        });
        box.querySelector('.ev-why-in').addEventListener('change', function () { st[part].guess = Object.assign({}, st[part].guess, { why: M.cleanShort(this.value) }); changed(); });
    }
    SCREENS['t1-var'] = varScreen('t1', '무엇을 바꿔 볼까요?', 'q-control');
    SCREENS['q-control'] = quizScreen('control', 't1-cond');

    // 이번 조건 정하기 (+/− 또는 정해 둔 ①·② 바로 고르기): 바뀌는 것은 하나뿐
    function condScreen(part, next, challenge) {
        return function () {
            var defs = ensureBase(part), p = st[part], d = defs[p.changed];
            if (!d) return { html: '<p>먼저 바꿀 조건을 골라요.</p>' + nav(part + '-var', '고르러 가기 →') };
            if (!challenge) ensurePlan(part);
            if (part === 't2' && p.ch !== !!challenge) { p.ch = !!challenge; save(); }
            var s = setup();
            p.quick = false;
            var countOf = function () { return p.trials.filter(function (t) { return t.value === p.value; }).length; }, count = countOf();
            var html = '<p class="ev-kicker">' + (challenge ? '🎯 도전' : (part === 't1' ? '1차시' : '2차시') + ' · 이번 조건') + '</p>' +
                '<h2>' + esc(M.josa(d.short || d.name, '을를')) + ' 얼마로 할까요?</h2>' +
                (challenge ? '<p class="ev-target">목표: <b>' + (part === 't1' ? esc(s.targetTime) + '초' : '아이 키만큼 (' + esc(s.targetPct) + '%)') + '</b> · 우리 결과 표를 보고 정해요</p>' : planBar(part, { pickable: true })) +
                stepper(p.changed, d.short || d.name, d.label(p.value), {}) +
                '<h3>같게 할 조건 🔒</h3>' + Object.keys(defs).filter(function (k) { return k !== p.changed; }).map(function (k) { return stepper(k, defs[k].short || defs[k].name, defs[k].label(p.base[k]), { locked: true }); }).join('') +
                (!challenge && part === 't1' ? '<p class="ev-small">같은 조건으로 <b>' + s.repeats + '번</b> 재서 평균' + easySpan('평균') + '을 내요. 이 조건은 지금까지 <b id="ev-count">' + count + '</b>번 쟀어요.</p>' : '') +
                (challenge ? '<div id="ev-mini"></div>' : '') +
                (!challenge && p.mustChange != null ? '<p class="ev-small" id="ev-must">🔧 지난번(<b>' + esc(d.label(p.mustChange)) + '</b>)과 <b>다른 값</b>으로 비교해요.' + (p.value === p.mustChange ? ' + 나 − 또는 위 계획에서 골라요.' : ' 지금 <b>' + esc(d.label(p.value)) + '</b>로 준비됐어요!') + '</p>' : '') +
                nav(next, '이 조건으로 →');
            return { html: html, mount: function (el) {
                var syncVal = function () {
                    el.querySelector('.ev-stepper:not(.locked) .ev-sval').textContent = d.label(p.value);
                    var ce = el.querySelector('#ev-count'); if (ce) ce.textContent = String(countOf());
                    var pl = p.plan;
                    Array.prototype.forEach.call(el.querySelectorAll('[data-pick-plan]'), function (b) {
                        var v = pl && pl[Number(b.dataset.pickPlan)];
                        b.classList.toggle('on', v === p.value);
                    });
                };
                el.querySelector('.ev-stepper:not(.locked)').addEventListener('click', function (e) {
                    var b = e.target.closest('[data-pm]'); if (!b) return;
                    p.value = M.stepIn(d.values, p.value, Number(b.dataset.pm)); save();
                    syncVal();
                });
                var bar = el.querySelector('.ev-plan-bar');
                if (bar) bar.addEventListener('click', function (e) {
                    var b = e.target.closest('[data-pick-plan]'); if (!b || !p.plan) return;
                    var v = p.plan[Number(b.dataset.pickPlan)];
                    if (v != null) { p.value = v; save(); syncVal(); }
                });
                if (challenge) miniTable(el.querySelector('#ev-mini'), part);
                // '바꿔서 다시'로 왔는데 값을 안 바꾸면 받지 않음
                var go = el.querySelector('.ev-next[data-go]');
                if (go && !challenge) go.addEventListener('click', function (e) {
                    if (p.mustChange == null) return;
                    if (p.value === p.mustChange) {
                        e.preventDefault(); e.stopPropagation();
                        var m = $('#ev-must'); if (m) { m.className = 'ev-no'; m.setAttribute('role', 'alert'); m.innerHTML = '✋ <b>값을 하나 바꿔요</b> — 지금은 지난번과 같은 ' + esc(d.label(p.value)) + '이에요. + 나 − 를 눌러요.'; }
                        return;
                    }
                    p.mustChange = null; save();
                });
            } };
        };
    }
    function miniTable(box, part) {
        var defs = ensureBase(part), p = st[part], d = defs[p.changed];
        // 계획한 ① → ② 차례로 (줄인 팀도), 흔들림은 ① · ② 끼리 견줌 (가상 수업 5차 중 1·2)
        var plan = M.planOf(p), rows = M.byValue(p.trials.map(function (t) { return { value: t.value, y: part === 't1' ? t.y : t.pct }; }), d, plan);
        var f = function (v) { return part === 't1' ? fmtS(v) : Math.round(v) + '%'; }, sp = M.spread(rows, plan);
        var pairTxt = sp.pair ? esc(M.josa(d.label(sp.pair[0]), '과와')) + ' ' + esc(d.label(sp.pair[1])) : '처음 값과 끝 값';
        box.innerHTML = rows.length ? '<table class="ev-table"><thead><tr><th>' + esc(d.short || d.name) + '</th><th>평균</th><th>↕ 범위</th><th>횟수</th></tr></thead><tbody>' + rows.map(function (r) {
            var lo = Math.min.apply(null, r.ys), hi = Math.max.apply(null, r.ys);
            return '<tr><td>' + esc(d.label(r.value)) + '</td><td>' + f(r.mean) + '</td><td>' + (r.n > 1 ? f(lo) + '~' + f(hi) : '–') + '</td><td>' + r.n + '</td></tr>';
        }).join('') + '</tbody></table>' +
            // 차이가 흔들림보다 큰가요? (같은 조건 반복이 있을 때만)
            (sp.verdict ? '<div class="ev-def ev-spread" data-spread="' + sp.verdict + '"><p>↕ <b>차이가 흔들림보다 큰가요?</b></p><p>' +
                (sp.verdict === 'clear' ? '✅ ' + pairTxt + '의 범위가 겹치지 않아요. 바꾼 조건 때문에 달라졌다고 말할 수 있어요.'
                    : '🤔 ' + pairTxt + '의 범위가 겹쳐요. 같은 조건에서도 이만큼 흔들려서, 차이가 있다고 말하기 어려워요. 값을 더 크게 바꿔 볼까요?') + '</p></div>' : '')
            : '<p class="ev-small">아직 잰 값이 없어요.</p>';
    }
    // 2026-11-23 가상 수업 4차 '필요 없는 기능': '몇 초?' 예측은 빼고 🔮 방향 예측만 (예전 화면 주소 t1-predict 는 show() 가 측정으로 넘김)
    SCREENS['t1-cond'] = condScreen('t1', 't1-measure');
    SCREENS['t1-ch-cond'] = condScreen('t1', 't1-ch-measure', true);

    // 예측: 몇 초? (+/−)
    function predictScreen(next, challenge) {
        return function () {
            var p = st.t1, K = challenge ? 'chPredict' : 'predict';   // 도전 예측은 따로 (처음엔 목표 시간)
            if (p[K] == null) p[K] = challenge ? setup().targetTime : 10;
            p.quick = false;
            var html = '<p class="ev-kicker">예측' + (challenge ? ' · 🎯 도전' : '') + '</p><h2>몇 초 뒤에 ‘펑’ 할까요?</h2><p>가족과 이야기해서 정해요.</p>' +
                '<div class="ev-big-step"><button type="button" class="ev-pm big" data-pm="-1" aria-label="1초 줄이기">−</button><b id="ev-pv" aria-live="polite">' + p[K] + '초</b><button type="button" class="ev-pm big" data-pm="1" aria-label="1초 늘리기">+</button></div>' +
                nav(next, '예측했어요! 재러 가기 →');
            return { html: html, mount: function (el) {
                el.querySelector('.ev-big-step').addEventListener('click', function (e) {
                    var b = e.target.closest('[data-pm]'); if (!b) return;
                    p[K] = Math.max(1, Math.min(120, p[K] + Number(b.dataset.pm))); save();
                    $('#ev-pv').textContent = p[K] + '초';
                });
            } };
        };
    }
    SCREENS['t1-predict'] = predictScreen('t1-measure');
    SCREENS['t1-ch-predict'] = predictScreen('t1-ch-measure', true);

    // 측정: 🎥 녹화(시계 겹침) → 장면 고르기 / ⏱ 초시계
    function measureTimeScreen(challenge) {
        return function () {
            var canRec = V && V.supported(), p = st.t1;
            var quick = !challenge && p.quick && (p.lastMethod === 'stopwatch' || (p.lastMethod === 'video' && canRec));
            if (quick) {   // 같은 조건 2·3번째: 예측·방법은 지난 것 그대로 (바꾸기 단추)
                var nth = p.trials.filter(function (t) { return t.value === p.value; }).length + 1;
                return { html: '<p class="ev-kicker">측정 · 같은 조건 ' + nth + '번째</p><h2>‘펑’까지 시간 재기</h2>' +
                    '<p class="ev-small">' + guessLine('t1') + '<button type="button" class="ev-link" id="ev-m-other">다른 방법으로</button></p>' +
                    '<div id="ev-m-box"></div><p id="ev-m-msg" class="ev-msg" role="status" aria-live="polite"></p>' + nav(null),
                    mount: function (el) {
                        var box = el.querySelector('#ev-m-box');
                        el.querySelector('#ev-m-other').addEventListener('click', function () { p.quick = false; save(); show(st.screen, { back: true }); });
                        if (p.lastMethod === 'video') recordTime(box, challenge); else stopwatch(box, challenge);
                    } };
            }
            var html = '<p class="ev-kicker">측정' + (challenge ? ' · 🎯 도전' : '') + '</p><h2>‘펑’까지 시간 재기</h2>' +
                '<div class="ev-choices two">' + (canRec ? '<button type="button" class="ev-choice big" id="ev-m-rec">🎥 녹화로 재기<small>큰 시계가 영상에 찍혀요 · 더 정확</small></button>' : '') +
                '<button type="button" class="ev-choice big" id="ev-m-sw">⏱ 초시계로 재기<small>단추를 눌러 재요</small></button></div>' +
                (canRec ? '' : '<p class="ev-small">이 폰은 녹화로 재기가 안 돼요. 초시계로 재요.</p>') +
                '<div id="ev-m-box"></div><p id="ev-m-msg" class="ev-msg" role="status" aria-live="polite"></p>' + nav(null);
            return { html: html, mount: function (el) {
                var box = el.querySelector('#ev-m-box');
                if (canRec) el.querySelector('#ev-m-rec').addEventListener('click', function () { el.querySelector('.ev-choices').hidden = true; recordTime(box, challenge); });
                el.querySelector('#ev-m-sw').addEventListener('click', function () { el.querySelector('.ev-choices').hidden = true; stopwatch(box, challenge); });
            } };
        };
    }
    function recordTime(box, challenge) {
        var msg = $('#ev-m-msg');
        box.innerHTML = '<canvas id="ev-cam" class="ev-cam" aria-label="카메라 화면"></canvas>' +
            '<p class="ev-small">필름통과 뚜껑이 화면에 잘 보이게 폰을 세워 두세요.</p>' + faceTip(challenge) +
            '<div class="ev-nav col"><button type="button" class="ev-next good" id="ev-r1">● 녹화 시작</button>' +
            '<button type="button" class="ev-next warn" id="ev-r2" hidden>▶ 뚜껑 닫는 순간 누르기 (시계 시작)</button>' +
            '<button type="button" class="ev-next danger" id="ev-r3" hidden>■ ‘펑’ 뒤에 녹화 끝</button></div>';
        var cam = V.camera($('#ev-cam'), camOpts());
        cleanup.push(function () { cam.close(); }); watchFace();
        msg.textContent = '⏳ 카메라를 켜는 중…';
        cam.open().then(function () { msg.textContent = ''; }, function (e) {
            msg.textContent = '⚠ 카메라를 쓸 수 없어요 (' + (e && e.name || e) + '). 초시계로 재요.';
            cam.close(); stopwatch(box, challenge);
        });
        $('#ev-r1').addEventListener('click', function () {
            try { cam.record(); } catch (e) { msg.textContent = '⚠ 녹화가 안 돼요. 초시계로 재요.'; cam.close(); stopwatch(box, challenge); return; }
            this.hidden = true; $('#ev-r2').hidden = false; $('#ev-r3').hidden = false;
            msg.textContent = '🔴 녹화 중 · 뚜껑을 닫는 순간 노란 단추를 눌러요';
        });
        $('#ev-r2').addEventListener('click', function () { cam.startClock(); this.hidden = true; msg.textContent = '🔴 시계가 가요 · ‘펑’ 열리면 빨간 단추로 녹화를 끝내요'; });
        $('#ev-r3').addEventListener('click', async function () {
            this.disabled = true;
            var clip = await cam.stop(); cam.close();
            if (!clip || !clip.blob.size) { msg.textContent = '⚠ 녹화가 비었어요. 초시계로 재요.'; stopwatch(box, challenge); return; }
            pickScene(box, clip, 'time', function (sec, pl) {
                var at = pl.time();
                saveTime(sec, 'video', challenge);
                if (challenge) sendScene('t1', clip, at);   // 🎯 도전이면 그 장면 사진·앞뒤 3초 영상을 선생님께 (얼굴을 가린 녹화만)
            });
        });
    }
    /* 영상 장면 고르기: mode 'time'(‘펑’ 장면 → 시계 값), 'top'(가장 높이 오른 장면 → 세 점 누르기) */
    function pickScene(box, clip, mode, done) {
        var msg = $('#ev-m-msg');
        var needStart = mode === 'time' && clip.clockOffset == null;   // 시계 단추를 안 눌렀으면 '뚜껑 닫은 장면'도 고름
        var startAt = null;
        box.innerHTML = '<video id="ev-vid" class="ev-cam" playsinline muted></video>' +
            '<div class="ev-clock" id="ev-clock" aria-live="polite"></div>' +
            '<input type="range" id="ev-scrub" class="ev-scrub" min="0" max="1000" value="0" aria-label="영상 위치">' +
            '<div class="ev-frames"><button type="button" class="ev-pm" data-f="-60" aria-label="2초 앞으로">⏪</button><button type="button" class="ev-pm" data-f="-1" aria-label="한 장면 앞으로">◀</button>' +
            '<button type="button" class="ev-pm" data-f="1" aria-label="한 장면 뒤로">▶</button><button type="button" class="ev-pm" data-f="60" aria-label="2초 뒤로">⏩</button></div>' +
            '<p class="ev-small">⏪ ⏩ 2초씩 · ◀ ▶ 한 장면씩</p>' +
            '<div class="ev-nav col"><button type="button" class="ev-next good" id="ev-pick"></button></div>';
        var vid = $('#ev-vid'), pl = V.player(vid, clip), scrub = $('#ev-scrub'), pick = $('#ev-pick');
        cleanup.push(function () { try { URL.revokeObjectURL(clip.url); } catch (e) { /* 무시 */ } });
        function label() {
            pick.textContent = mode === 'top' ? '🚀 이 장면이 가장 높아요' : needStart && startAt == null ? '🫙 이 장면에서 뚜껑을 닫았어요' : '💥 이 장면이 ‘펑’!';
            msg.textContent = mode === 'top' ? '로켓이 가장 높이 오른 장면을 찾아요 (◀ ▶ 로 한 장면씩)' : needStart && startAt == null ? '먼저 뚜껑을 닫은 장면을 찾아요' : '뚜껑이 ‘펑’ 열린 장면을 찾아요 (◀ ▶ 로 한 장면씩)';
        }
        function show2() {
            var t = mode === 'time' ? (needStart ? (startAt == null ? 0 : pl.time() - startAt) : pl.clockAt()) : pl.time();
            $('#ev-clock').textContent = mode === 'time' ? (needStart && startAt == null ? '영상 ' + pl.time().toFixed(2) + '초' : '⏱ ' + Math.max(0, t).toFixed(2) + '초') : '영상 ' + pl.time().toFixed(2) + '초';
            scrub.value = String(Math.round(pl.time() / Math.max(0.01, pl.duration()) * 1000));
        }
        // ‘펑’ 은 녹화를 멈추기 바로 앞이라, 시계를 켠 녹화는 끝에서 2초 앞에서 열어요 (0초부터 30번 넘기지 않게)
        pl.ready.then(function () {
            label();
            if (mode === 'time' && !needStart && pl.duration() > 2.5) return pl.seek(Math.max(clip.clockOffset || 0, pl.duration() - 2)).then(show2);
            // 2차시 발사: 로켓을 세우고 물러나는 동안도 찍히고, 가장 높은 때는 발사 0.5~1초 뒤 → 떨어진 뒤 녹화를 멈추니 끝에서 2.5초 앞에서 열기
            if (mode === 'top' && pl.duration() > 3) return pl.seek(pl.duration() - 2.5).then(show2);
            show2();
        });
        vid.addEventListener('timeupdate', show2); vid.addEventListener('seeked', show2);
        scrub.addEventListener('input', function () { pl.seek(Number(scrub.value) / 1000 * pl.duration()).then(show2); });
        box.querySelector('.ev-frames').addEventListener('click', function (e) { var b = e.target.closest('[data-f]'); if (b) pl.step(Number(b.dataset.f)).then(show2); });
        pick.addEventListener('click', function () {
            if (mode === 'top') { done(pl); return; }
            if (needStart && startAt == null) { startAt = pl.time(); label(); show2(); return; }
            var sec = needStart ? pl.time() - startAt : pl.clockAt();
            if (!(sec > 0)) { msg.textContent = '⚠ 시간이 0 초예요. ‘펑’ 장면을 더 뒤에서 찾아요.'; return; }
            done(Math.round(sec * 100) / 100, pl);
        });
    }
    function stopwatch(box, challenge) {
        var msg = $('#ev-m-msg'), t0 = 0, raf = 0, val = null;
        box.innerHTML = '<div class="ev-watch" id="ev-watch" aria-live="off">0.0초</div>' +
            '<div class="ev-nav col"><button type="button" class="ev-next good" id="ev-sw1">▶ 시작 (뚜껑 닫는 순간)</button>' +
            '<button type="button" class="ev-next danger" id="ev-sw2" hidden>💥 펑! (멈춤)</button></div>' +
            '<div id="ev-sw-adj" hidden><p class="ev-small">손이 늦었으면 고쳐요</p><div class="ev-big-step"><button type="button" class="ev-pm big" data-pm="-1" aria-label="0.1초 줄이기">−</button><b id="ev-swv"></b><button type="button" class="ev-pm big" data-pm="1" aria-label="0.1초 늘리기">+</button></div>' +
            '<div class="ev-nav col"><button type="button" class="ev-next good" id="ev-sw3">이 시간으로 기록</button><button type="button" class="ev-next secondary" id="ev-sw4">다시 재기</button></div></div>';
        msg.textContent = '';
        cleanup.push(function () { cancelAnimationFrame(raf); });
        function tick() { $('#ev-watch').textContent = ((performance.now() - t0) / 1000).toFixed(1) + '초'; raf = requestAnimationFrame(tick); }
        $('#ev-sw1').addEventListener('click', function () { t0 = performance.now(); this.hidden = true; $('#ev-sw2').hidden = false; tick(); });
        $('#ev-sw2').addEventListener('click', function () {
            cancelAnimationFrame(raf); val = Math.round((performance.now() - t0) / 100) / 10;
            this.hidden = true; $('#ev-watch').textContent = val.toFixed(1) + '초'; $('#ev-swv').textContent = val.toFixed(1) + '초'; $('#ev-sw-adj').hidden = false;
        });
        box.querySelector('#ev-sw-adj .ev-big-step').addEventListener('click', function (e) {
            var b = e.target.closest('[data-pm]'); if (!b || val == null) return;
            val = Math.max(0.1, Math.round((val + Number(b.dataset.pm) * 0.1) * 10) / 10); $('#ev-swv').textContent = val.toFixed(1) + '초';
        });
        $('#ev-sw3').addEventListener('click', function () { if (val > 0) saveTime(val, 'stopwatch', challenge); });
        $('#ev-sw4').addEventListener('click', function () { stopwatch(box, challenge); });
    }
    function saveTime(sec, method, challenge) {
        var p = st.t1, s = setup(), rec = { value: p.value, y: sec, method: method, at: new Date().toISOString() };
        if (challenge) { var d = M.targetDiff(sec, s.targetTime, s.tolTime); rec.diff = M.round(d.diff, 2); rec.ok = d.ok; p.challenge.push(rec); }
        else p.trials.push(rec);
        p.lastMethod = method; p.quick = false;
        st.last = rec; changed();
        show(challenge ? 't1-ch-result' : 't1-result');
    }
    SCREENS['t1-measure'] = measureTimeScreen(false);
    SCREENS['t1-ch-measure'] = measureTimeScreen(true);

    SCREENS['t1-result'] = function () {
        var p = st.t1, s = setup(), r = st.last || p.trials[p.trials.length - 1], defs = ensureBase('t1'), d = defs[p.changed];
        if (!r) return { html: '<p>아직 잰 값이 없어요.</p>' + nav('t1-cond', '재러 가기 →') };
        var same = p.trials.filter(function (t) { return t.value === r.value; }), avg = M.mean(same.map(function (t) { return t.y; }));
        var oneKind = M.valueKinds(p.trials) < 2 && same.length >= s.repeats;   // 한 값으로 다 쟀음 → 바로 '정해 둔 ②로'
        var np = nextPlanned('t1', r.value);
        var changeBtn = np && d
            ? '▶ 정해 둔 ' + (np.idx === 0 ? '① ' : '② ') + esc(d.label(np.val)) + ' 로 재러 가기'
            : '🔧 ' + esc(M.josa(d ? d.short || d.name : '조건', '을를')) + ' 바꿔서 재기';
        var html = '<p class="ev-kicker">결과 · ' + esc(d ? d.label(r.value) : '') + '</p><h2>💥 ' + fmtS(r.y) + ' 만에 ‘펑’!</h2>' +
            card('<p>이 조건: <b>' + same.length + '번째</b> · 평균 <b>' + fmtS(avg) + '</b></p>' + planBar('t1') + (guessLine('t1') ? '<p class="ev-small">' + guessLine('t1') + '</p>' : '')) +
            '<div class="ev-nav col">' + (same.length < s.repeats ? '<button type="button" class="ev-next good" id="ev-again">🔁 같은 조건으로 한 번 더 (' + same.length + '/' + s.repeats + ')</button>' : '<p class="ev-ok">✅ 같은 조건으로 ' + s.repeats + '번 쟀어요!</p>') +
            (oneKind ? moreHint('t1', r.value) : '') +
            '<button type="button" class="ev-next ' + (same.length < s.repeats ? 'secondary' : 'good') + '" id="ev-change">' + changeBtn + '</button>' +
            (oneKind ? '' : '<button type="button" class="ev-next secondary" data-go="t1-graph">📊 결과 비교 보기</button>') + '</div>' +
            '<p class="ev-small">잘못 잰 값이면 <button type="button" class="ev-link" id="ev-undo">이 기록 지우기</button></p>';
        return { html: html, mount: function () {
            var ag = $('#ev-again');
            if (ag) ag.addEventListener('click', function () { p.value = r.value; p.quick = true; save(); show('t1-measure'); });
            $('#ev-change').addEventListener('click', function () { mustChange('t1', r.value, np ? np.val : null); });
            $('#ev-undo').addEventListener('click', function () {
                if (!confirm('방금 잰 값을 지울까요?')) return;
                var i = p.trials.indexOf(r); if (i < 0) i = p.trials.length - 1;
                p.trials.splice(i, 1); st.last = null; changed(); show('t1-cond');
            });
        } };
    };

    // ---------- 결과 비교 (가족 체험형: 그래프 대신 ① vs ② 평균 비교 표 + 핵심 개념 연결) ----------
    function conceptLinkBox(part) {
        if (part === 't1') {
            return '<div class="ev-def ev-concept-link"><span class="ev-def-w">📘 오늘의 핵심 개념 · 압력</span>' +
                '<p>' + esc(M.DEF.pressure) + '</p>' +
                '<p class="ev-easy">🧒 쉬운 말 · ' + esc(M.easyLine(M.KEY_WORDS.pressure)) + '</p>' +
                '<p class="ev-small">기체가 빨리·많이 쌓일수록 뚜껑 안쪽의 같은 넓이를 더 세게 밀어 <b>압력</b>이 커지고, 뚜껑이 더 빨리 ‘펑’ 열려요.</p></div>';
        }
        return '<div class="ev-def ev-concept-link"><span class="ev-def-w">📘 오늘의 핵심 개념 · 힘과 가속도</span>' +
            '<p><b>힘</b>: ' + esc(M.DEF.force) + '</p>' +
            '<p><b>가속도</b>: ' + esc(M.DEF.accel) + '</p>' +
            '<p class="ev-easy">🧒 쉬운 말 · ' + esc(M.easyLine(['가속도', '반작용', '질량'])) + '</p>' +
            '<p class="ev-small">물과 기체를 아래로 밀어내는 <b>반작용(힘)</b>으로 로켓이 위로 솟고, 같은 힘이라도 무거울수록 <b>가속도</b>가 작아 덜 높이 올라요.</p></div>';
    }
    function compareScreen(part, next, nextLabel) {
        return function () {
            var defs = ensureBase(part), p = st[part], d = defs[p.changed];
            var html = '<h2>📊 ' + (part === 't1' ? '바꾼 조건 → 열리는 시간 비교' : '바꾼 조건 → 오른 높이 비교') + '</h2>' +
                (d ? '<p>' + esc(M.josa(d.short || d.name, '을를')) + ' 바꾸면 ' + (part === 't1' ? '열리는 시간이' : '높이가') + ' 어떻게 달라졌나요?</p>' : '') +
                planBar(part) +
                (guessLine(part) ? '<p class="ev-small">' + guessLine(part).replace(/ · $/, '') + '</p>' : '') +
                '<div id="ev-mini"></div>' +
                conceptLinkBox(part) +
                '<div class="ev-nav col"><button type="button" class="ev-next secondary" data-go="' + part + '-cond">➕ 더 재기</button></div>' + nav(next, nextLabel);
            return { html: html, mount: function (el) { miniTable(el.querySelector('#ev-mini'), part); } };
        };
    }
    SCREENS['t1-graph'] = compareScreen('t1', 't1-why', '다음: 왜 달랐을까? →');
    // 결과 비교·도전 앞에서: 값을 두 가지 넘게 재야 넘어감
    var NEED_KINDS = { 't1-graph': 't1', 't1-why': 't1', 't1-challenge': 't1', 't1-ch-cond': 't1', 't2-graph': 't2', 't2-challenge': 't2', 't2-ch-cond': 't2' };
    function moreScreen(part) {
        return function () {
            var p = st[part], defs = ensureBase(part), d = defs[p.changed], n = p.trials.length, one = p.trials[n - 1], t1 = part === 't1';
            var name = d ? d.short || d.name : '바꿀 조건';
            var np = one ? nextPlanned(part, one.value) : null;
            var btnTxt = np && d
                ? '▶ 정해 둔 ' + (np.idx === 0 ? '① ' : '② ') + esc(d.label(np.val)) + ' 로 ' + (t1 ? '재러 가기 →' : '발사하러 가기 →')
                : '🔧 ' + esc(name) + ' 바꿔서 다시 ' + (t1 ? '재기' : '발사하기') + ' →';
            var html = '<p class="ev-kicker">' + (t1 ? '1차시' : '2차시') + ' · 한 번 더</p><h2>🔧 ' + (np && d ? '정해 둔 ' + (np.idx === 0 ? '① ' : '② ') + esc(d.label(np.val)) + ' 로 재요' : '하나만 바꿔 한 번 더 재요') + '</h2>' +
                card((n && d ? '<p>지금은 <b>' + esc(name) + '</b>' + M.josa(name, '을를').slice(name.length) + ' <b>' + esc(d.label(one.value)) + '</b> 하나로만 ' + n + '번 쟀어요.</p>' : '<p>아직 잰 값이 없어요.</p>') +
                    planBar(part) +
                    '<p class="ev-why">💡 값을 바꿔서 한 번 더 재야 무엇 때문에 ' + (t1 ? '열리는 시간이' : '높이가') + ' 달라지는지 결과 표로 비교할 수 있어요.</p>') +
                '<div class="ev-nav col"><button type="button" class="ev-next good" id="ev-change">' + btnTxt + '</button>' +
                // 다음 단계가 아직 잠겨 있으면 그리로 가는 단추는 두지 않음
                (stageLocked(t1 ? 't2' : 'end') ? '' : '<button type="button" class="ev-next secondary" data-go="' + (t1 ? 't2-intro' : 'end-intro') + '">' + (t1 ? '2차시로 가기 →' : '정리로 가기 →') + '</button>') + '</div>';
            return { html: html, mount: function () { $('#ev-change').addEventListener('click', function () { mustChange(part, one ? one.value : null, np ? np.val : null); }); } };
        };
    }
    // 결과 화면에서 바로: 한 값으로만 쟀으면 '정해 둔 ② 로' (결과 비교를 안 눌러도)
    function moreHint(part, curVal) {
        var p = st[part], d = ensureBase(part)[p.changed], np = curVal != null ? nextPlanned(part, curVal) : null;
        var lead = np && d
            ? '🔧 이제 정해 둔 ' + (np.idx === 0 ? '① ' : '② ') + '<b>' + esc(d.short || d.name) + ' ' + esc(d.label(np.val)) + '</b> 로 바꿔 한 번 더 ' + (part === 't1' ? '재요' : '쏘아요') + '!'
            : '🔧 이제 <b>' + esc(d ? d.short || d.name : '바꿀 조건') + '</b> 값을 하나 바꿔 한 번 더 ' + (part === 't1' ? '재요' : '쏘아요') + '!';
        return '<div class="ev-def ev-more-hint"><p>' + lead + '</p>' +
            '<p class="ev-small">값이 두 가지 넘어야 무엇 때문에 ' + (part === 't1' ? '열리는 시간이' : '높이가') + ' 달라지는지 알 수 있어요.</p></div>';
    }
    // '바꿔서 다시' → 조건 화면: 정해 둔 다음 값(toVal)이 있으면 바로 맞춰 주고, 지난 값 그대로는 받지 않음 ('값을 하나 바꿔요')
    function mustChange(part, from, toVal) {
        st[part].mustChange = from;
        if (toVal != null) st[part].value = toVal;
        save();
        show(part + '-cond');
    }
    // 2차시 결과 안내 (2026-11-21 비계 4): 지금 바꾸는 조건 안에서만 권함 — 잠긴 조건은 권하지 않음
    function t2Hint(high) {
        var p = st.t2, d = ensureBase('t2')[p.changed], name = d ? d.short || d.name : '바꿀 조건';
        if (p.changed === 'mass') return high ? '점토·클립을 하나 더 붙여 볼까요?' : massNow() > 0 ? '점토·클립을 하나 떼어 볼까요?' : '점토를 다 뗀 가장 가벼운 로켓이에요. 이 높이도 좋은 결과예요!';
        return esc(name) + ' 값을 바꿔서 다시 쏘아 볼까요?';
    }
    function massNow() { var p = st.t2; return Number(p.changed === 'mass' ? p.value : p.base && p.base.mass) || 0; }
    SCREENS['t1-more'] = moreScreen('t1');
    SCREENS['t2-more'] = moreScreen('t2');
    SCREENS['t1-why'] = function () {
        var p = st.t1, w = M.WHY.filter(function (x) { return x.k === p.why; })[0];
        var html = '<h2>🤔 예측과 왜 달랐을까?</h2><p>가장 그럴듯한 까닭을 하나 골라요.</p>' + choiceList(M.WHY, p.why) +
            (w ? '<div class="ev-def"><p>💡 ' + esc(w.fb) + '</p></div>' + defBox(M.DEF.gas, '기체 발생과 압력', 'gas') : '') + nav('t1-challenge', '다음 →', w ? '' : ' disabled');
        return { html: html, mount: function (el) {
            el.querySelector('.ev-choices').addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (!b) return; p.why = b.dataset.k; changed(); show(st.screen, { back: true }); });
        } };
    };
    // 1차시 첫 퀴즈 (발표 보기 1차시 첫 장 '뚜껑은 왜 열릴까요?' 와 같은 때에 풀고, 선생님이 풀이를 열면 📘 정의가 보임)
    SCREENS['q-gas'] = quizScreen('gas', 't1-safe', '시작 전');
    SCREENS['t1-challenge'] = function () {
        var s = setup();
        var html = '<p class="ev-kicker">🎯 도전</p><h2>' + esc(s.targetTime) + '초에 ‘펑’ 하게 만들어요!</h2>' +
            card('<p>선생님이 낸 목표 시간: <b class="ev-big">' + esc(s.targetTime) + '초</b></p><p>우리 결과 표를 보고 조건을 정한 뒤 재요. 목표와 <b>' + esc(s.tolTime) + '초</b> 안으로 맞으면 성공!</p>') +
            '<h3>📊 우리 결과 표</h3><div id="ev-mini-ch"></div>' +   // '결과 표를 보고' 할 표 (가상 수업 5차 중 4)
            challengeList('t1') + '<p class="ev-small" id="ev-ch-msg" role="status"></p>' + nav('t1-ch-cond', '도전하기 →') +
            '<div class="ev-nav col"><button type="button" class="ev-next secondary" data-go="t2-intro">2차시로 가기 →</button></div>';
        return { html: html, mount: function (el) {
            if (st.t1.changed) miniTable(el.querySelector('#ev-mini-ch'), 't1');
            if (!share) return;
            share.refreshClass().then(function (r) {   // 선생님이 목표를 바꿨을 수 있음
                if (r && r.ok && r.setup && JSON.stringify(r.setup) !== JSON.stringify(st.setup)) { st.setup = r.setup; save(); if (st.screen === 't1-challenge') show('t1-challenge', { back: true }); }
            });
        } };
    };
    function challengeList(part) {
        var list = st[part].challenge, defs = ensureBase(part), d = defs[st[part].changed];
        if (!list.length) return '';
        return '<h3>지난 도전</h3><table class="ev-table"><thead><tr><th>조건</th><th>결과</th><th>목표와 차이</th></tr></thead><tbody>' + list.map(function (c) {
            return '<tr><td>' + esc(d ? d.label(c.value) : c.value) + '</td><td>' + (part === 't1' ? fmtS(c.y) : c.pct + '%') + '</td><td>' + (c.ok ? '🎉 ' : '') + diffText(part, c.diff) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    function diffText(part, d) { return part === 't1' ? (Math.abs(d) < 0.05 ? '딱 맞음' : (Math.round(Math.abs(d) * 10) / 10) + '초 ' + (d > 0 ? '늦음' : '빠름')) : (Math.abs(d) < 0.5 ? '딱 맞음' : Math.round(Math.abs(d)) + '% ' + (d > 0 ? '높음' : '낮음')); }
    SCREENS['t1-ch-result'] = function () {
        var r = st.t1.challenge[st.t1.challenge.length - 1], s = setup();
        if (!r) return { html: nav('t1-challenge', '도전하러 가기 →') };
        var html = '<p class="ev-kicker">🎯 도전 결과</p><h2>' + (r.ok ? '🎉 성공!' : '❌ 목표와 ' + diffText('t1', r.diff)) + '</h2>' +
            card('<p>목표 <b>' + esc(s.targetTime) + '초</b> → 실제 <b>' + fmtS(r.y) + '</b></p><p class="ev-big">목표와 ' + (Math.round(Math.abs(r.diff) * 10) / 10) + '초 차이</p>') + mediaLine('t1') +
            '<div class="ev-nav col"><button type="button" class="ev-next ' + (r.ok ? 'secondary' : 'good') + '" data-go="t1-ch-cond">🔁 다시 도전</button>' +
            '<button type="button" class="ev-next ' + (r.ok ? 'good' : 'secondary') + '" data-go="t2-intro">2차시로 →</button></div>';
        return { html: html };
    };

    // ===== 3 2차시: 아이 키만큼 오르는 로켓 =====
    /* 🛠 로켓 만들기 (2026-11-27 선생님 '학생이 로켓을 만드는 과정도 있어야해'): 네 단계를 하나씩 체크 → '다 만들었어요'.
       설명 장 'build' 를 띄운 동안 이 화면(응답 장), 다 만들면 ✅ 보냈어요 → 프로젝터 '다 만든 팀 N / M'. 수업 없이는 2차시 첫 화면 다음 */
    var BUILD_STEPS = [['body', '📜 색지를 말아 필름통에 붙여 <b>몸통</b> (뚜껑이 아래로)'], ['fins', '🪽 <b>날개 3장</b>을 아래쪽에 붙여요'], ['nose', '🔺 <b>뾰족한 앞코</b>를 씌워요'], ['clay', '⚖️ <b>점토</b>는 처음엔 0개 (무게는 나중에 바꿔요)']];
    SCREENS['t2-build'] = function () {
        var b = st.build = st.build || { steps: {} }, all = BUILD_STEPS.every(function (x) { return b.steps[x[0]]; });
        var html = '<p class="ev-kicker">2차시 · 🛠 만들기</p><h2>로켓을 만들어요</h2>' +
            // 선생님이 다음 장으로 넘어간 뒤에도 만드는 팀 (5b 하 4)
            (following() && lessonNow().key !== 'build' && !b.done ? '<p class="ev-small ev-late ev-keep" role="status">🛠 다 만들면 지금 문제로 가요</p>' : '') +
            '<div class="ev-choices ev-build">' + BUILD_STEPS.map(function (x, i) {
                return '<button type="button" class="ev-choice' + (b.steps[x[0]] ? ' on' : '') + '" data-build="' + x[0] + '" aria-pressed="' + !!b.steps[x[0]] + '">' + (b.steps[x[0]] ? '✅ ' : (i + 1) + '. ') + x[1] + '</button>';
            }).join('') + '</div>' +
            '<p class="ev-small">🧰 필름통 · 색지 · 가위 · 투명테이프 · 점토·클립</p>' +
            // 응답 장을 띄운 동안은 네 단계를 다 체크해야 보냄, 혼자 하는 화면은 언제든 다음으로
            '<div class="ev-follow-only ev-nav col"><button type="button" class="ev-next good" id="ev-build-done"' + (all || !following() ? '' : ' disabled') + '>✅ 다 만들었어요</button></div>';
        return { html: html, mount: function (el) {
            el.querySelector('.ev-build').addEventListener('click', function (e) {
                var t = e.target.closest('[data-build]'); if (!t) return;
                b.steps[t.dataset.build] = !b.steps[t.dataset.build]; changed();
                show(st.screen, { back: true });
            });
            $('#ev-build-done').addEventListener('click', function () {
                b.done = true; logAnswer('만들기', '다 만들었어요'); changed();
                if (following()) { if (!followApply()) show('sent', { follow: true }); }   // 지금 띄운 장으로 (마저 만들었으면 그 장의 답 칸)
                else show('q-action');
            });
        } };
    };
    SCREENS['t2-intro'] = function () {
        return { html: '<p class="ev-kicker">2차시</p><h2>🚀 아이 키만큼 오르는 로켓</h2>' +
            card('<p>필름통을 <b>뒤집어 세우면</b> 로켓이 돼요. 목표는 <b>아이 키만큼</b> 올리기!</p><p>천장까지 날아가지 않게, 몸체 무게·물·발포비타민 양을 조절해서 딱 맞춰 봐요.</p>') +
            '<details class="ev-more"><summary>🧰 준비물</summary><p>필름통 · 발포비타민 · 물 · 계량스푼 · 스포이트 · 보안경 · 색지 · 가위 · 투명테이프 · 줄자 · 점토·클립 · 쟁반 · 걸레</p></details>' +
            nav('t2-build', '다음 →') };
    };
    // 2026-11-23 가상 수업 4차: '✏️ 로켓 설계 기록' 은 바꿀 것 고르기와 겹쳐 흐름에서 뺌 (예전 주소 t2-base 는 show() 가 다음 화면 q-mass 로)
    SCREENS['q-action'] = quizScreen('action', 'q-mass', '발사 전');
    SCREENS['t2-base'] = function () {
        var defs = ensureBase('t2'), p = st.t2;
        var keys = ['water', 'tablet', 'mass', 'fins', 'nose'];
        var html = '<h2>✏️ 로켓 설계 기록</h2><p>처음 로켓을 어떻게 만들었는지 적어요 (+/−, 고르기).</p>' +
            keys.map(function (k) { return stepper(k, defs[k].short || defs[k].name, defs[k].label(p.base[k]), {}); }).join('') +
            nav('q-mass', '설계 끝 →');
        return { html: html, mount: function (el) {
            el.addEventListener('click', function (e) {
                var b = e.target.closest('[data-pm]'); if (!b) return;
                var box = b.closest('[data-var]'), k = box.dataset.var, d = defs[k];
                p.base[k] = M.stepIn(d.values, p.base[k], Number(b.dataset.pm));
                if (k === p.changed) p.value = p.base[k];
                box.querySelector('.ev-sval').textContent = d.label(p.base[k]); changed();
            });
        } };
    };
    SCREENS['q-mass'] = quizScreen('mass', 't2-var');
    SCREENS['t2-var'] = varScreen('t2', '무엇을 바꿔서 높이를 맞출까요?', 't2-cond');
    SCREENS['t2-cond'] = condScreen('t2', 't2-safe');
    SCREENS['t2-ch-cond'] = condScreen('t2', 't2-safe', true);
    SCREENS['t2-safe'] = safetyScreen('t2', [
        { k: 'goggle', t: '🥽 모두 <b>보안경</b>을 썼어요' },
        { k: 'face', t: '🙅 로켓 <b>위로 얼굴을 대지 않아요</b>' },
        { k: 'away', t: '🏃 세우고 <b>바로 물러나요</b>' },
        { k: 'wait', t: '✋ 안 날아가면 <b>다가가지 말고</b> 선생님을 불러요' }
    ], 't2-film');
    SCREENS['t2-film'] = function () {
        var html = '<p class="ev-kicker">' + (st.t2.ch ? '🎯 도전 · ' : '') + '촬영 안내</p><h2>📹 이렇게 찍어요</h2>' +
            '<figure class="ev-fig">' + FILM_SVG + '<figcaption>아이는 발사대 바로 옆에 같은 줄로 서요. 부모님은 2~3 m 떨어져 폰을 <b>세로</b>로 들고, <b>아이 발끝~머리끝과 발사대</b>가 한 화면에 들어오게 찍어요.</figcaption></figure>' +
            '<div class="ev-choices two"><button type="button" class="ev-choice big" data-go="t2-measure">' + (V && V.supported() ? '🎥 영상으로 재기<small>가장 높은 장면에서 세 곳 누르기</small>' : '🎥 영상으로 재기<small>이 폰은 녹화가 안 될 수 있어요</small>') + '</button>' +
            '<button type="button" class="ev-choice big" data-go="t2-hand">👀 눈으로 보고 고르기<small>아이 키보다 높다/비슷/낮다</small></button></div>' + nav(null);
        return { html: html };
    };
    var FILM_SVG = '<svg viewBox="0 0 320 170" role="img" aria-label="촬영 위치 그림"><rect x="0" y="150" width="320" height="4" fill="#90a4ae"/>' +
        '<rect x="60" y="138" width="22" height="12" fill="#607d8b"/><rect x="66" y="96" width="10" height="42" rx="3" fill="#ef6c00"/><path d="M66 96 L71 84 L76 96 Z" fill="#c62828"/>' +
        '<circle cx="108" cy="72" r="10" fill="#ffcc80"/><rect x="99" y="82" width="18" height="38" rx="6" fill="#42a5f5"/><rect x="101" y="120" width="6" height="30" fill="#1e88e5"/><rect x="109" y="120" width="6" height="30" fill="#1e88e5"/>' +
        '<line x1="128" y1="62" x2="128" y2="150" stroke="#2e7d32" stroke-width="2" stroke-dasharray="4 3"/><text x="132" y="110" font-size="11" fill="#2e7d32">아이 키</text>' +
        '<circle cx="262" cy="58" r="11" fill="#ffcc80"/><rect x="252" y="69" width="20" height="50" rx="6" fill="#7e57c2"/><rect x="254" y="119" width="7" height="31" fill="#5e35b1"/><rect x="263" y="119" width="7" height="31" fill="#5e35b1"/>' +
        '<rect x="236" y="70" width="10" height="17" rx="2" fill="#263238"/><path d="M236 78 L96 50 M236 78 L96 150" stroke="#b0bec5" stroke-dasharray="3 3"/>' +
        '<path d="M150 160 L240 160" stroke="#455a64" marker-end="url(#a)" marker-start="url(#a)"/><text x="170" y="168" font-size="11" fill="#455a64">2~3 m</text>' +
        '<defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#455a64"/></marker></defs></svg>';

    SCREENS['t2-measure'] = function () {
        var html = '<p class="ev-kicker">측정' + (st.t2.ch ? ' · 🎯 도전' : '') + '</p><h2>🎥 발사 장면 찍기</h2>' +
            '<div id="ev-m-box"></div><p id="ev-m-msg" class="ev-msg" role="status" aria-live="polite"></p>' + nav(null);
        return { html: html, mount: function (el) {
            var box = el.querySelector('#ev-m-box'), msg = $('#ev-m-msg');
            if (!(V && V.supported())) { box.innerHTML = '<p>이 폰은 녹화가 안 돼요.</p><div class="ev-nav col"><button type="button" class="ev-next good" data-go="t2-hand">👀 눈으로 보고 고르기</button></div>'; return; }
            box.innerHTML = '<canvas id="ev-cam" class="ev-cam tall" aria-label="카메라 화면"></canvas><p class="ev-small">아이 발끝~머리끝과 발사대가 다 보이게, 폰을 세로로!</p>' + faceTip(st.t2.ch) +
                '<div class="ev-nav col"><button type="button" class="ev-next good" id="ev-r1">● 녹화 시작</button><button type="button" class="ev-next danger" id="ev-r3" hidden>■ 로켓이 떨어지면 녹화 끝</button></div>';
            var cam = V.camera($('#ev-cam'), camOpts());
            cleanup.push(function () { cam.close(); }); watchFace();
            msg.textContent = '⏳ 카메라를 켜는 중…';
            cam.open().then(function () { msg.textContent = ''; }, function (e) {
                msg.textContent = '⚠ 카메라를 쓸 수 없어요 (' + (e && e.name || e) + ').';
                box.innerHTML = '<div class="ev-nav col"><button type="button" class="ev-next good" data-go="t2-hand">👀 눈으로 보고 고르기</button></div>';
            });
            $('#ev-r1').addEventListener('click', function () {
                try { cam.record(); cam.startClock(); } catch (e) { msg.textContent = '⚠ 녹화가 안 돼요.'; return; }
                this.hidden = true; $('#ev-r3').hidden = false; msg.textContent = '🔴 녹화 중 · 로켓을 세우고 물러나요';
            });
            $('#ev-r3').addEventListener('click', async function () {
                this.disabled = true;
                var clip = await cam.stop(); cam.close();
                if (!clip || !clip.blob.size) { msg.textContent = '⚠ 녹화가 비었어요. 다시 찍거나 눈으로 골라요.'; return; }
                pickScene(box, clip, 'top', function (pl) { scene2 = { clip: clip, at: pl.time() }; markHeight(box, pl); });
            });
        } };
    };
    var scene2 = null;   // 2차시 고른 장면 (도전이면 기록할 때 선생님께 보냄)
    // 세 곳 누르기: ① 아이 발끝 ② 아이 정수리 ③ 로켓 꼭대기
    function markHeight(box, pl) {
        var msg = $('#ev-m-msg'), pts = [];
        var STEPS = ['① 아이 <b>발끝</b>을 눌러요', '② 아이 <b>정수리</b>(머리 꼭대기)를 눌러요', '③ <b>로켓 꼭대기</b>를 눌러요'];
        box.innerHTML = '<p class="ev-step-tip" id="ev-tip"></p><canvas id="ev-mark" class="ev-cam mark" aria-label="가장 높은 장면. 세 곳을 눌러요"></canvas>' +
            '<div class="ev-nav"><button type="button" class="ev-back secondary" id="ev-mk-undo">↶ 하나 지우기</button></div><div id="ev-mk-out"></div>';
        var cv = $('#ev-mark'), frame = document.createElement('canvas');
        pl.grab(frame);
        cv.width = frame.width; cv.height = frame.height;
        function draw() {
            var g = cv.getContext('2d'), r = Math.max(6, cv.width / 60);
            g.drawImage(frame, 0, 0);
            var col = ['#43a047', '#1e88e5', '#e53935'];
            pts.forEach(function (p, i) {
                g.strokeStyle = col[i]; g.lineWidth = r / 2; g.beginPath(); g.moveTo(0, p.y); g.lineTo(cv.width, p.y); g.setLineDash([r, r]); g.stroke(); g.setLineDash([]);
                g.fillStyle = col[i]; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
                g.font = 'bold ' + (r * 2.4) + 'px system-ui'; g.fillText('①②③'[i], p.x + r * 1.5, p.y - r);
            });
            $('#ev-tip').innerHTML = pts.length < 3 ? STEPS[pts.length] : '✅ 세 곳을 다 눌렀어요';
            var out = $('#ev-mk-out');
            if (pts.length < 3) { out.innerHTML = ''; return; }
            var h = M.heightPct(pts[0], pts[1], pts[2]);
            if (h.error) { out.innerHTML = '<p class="ev-no">⚠ ' + esc(h.error) + '</p>'; return; }
            var cm = M.cmFrom(h.pct, st.childCm);
            out.innerHTML = '<p class="ev-result">🚀 아이 키의 <b>' + h.pct + '%</b>' + (cm ? ' <span class="ev-small">(약 ' + cm + ' cm — 이 폰에만)</span>' : '') + '</p>' +
                '<div class="ev-nav col"><button type="button" class="ev-next good" id="ev-mk-ok">이 결과 기록</button></div>';
            $('#ev-mk-ok').addEventListener('click', function () { saveHeight({ pct: h.pct, method: 'video' }); });
        }
        cv.addEventListener('click', function (e) {
            if (pts.length >= 3) return;
            var rc = cv.getBoundingClientRect();
            pts.push({ x: (e.clientX - rc.left) * cv.width / rc.width, y: (e.clientY - rc.top) * cv.height / rc.height });
            draw();
        });
        $('#ev-mk-undo').addEventListener('click', function () { pts.pop(); draw(); });
        msg.textContent = '';
        draw();
    }
    SCREENS['t2-hand'] = function () {
        var html = '<p class="ev-kicker">눈으로 보고 고르기' + (st.t2.ch ? ' · 🎯 도전' : '') + '</p><h2>로켓이 얼마나 올랐나요?</h2>' +
            '<div class="ev-choices">' + Object.keys(M.HAND).map(function (k) { return '<button type="button" class="ev-choice big" data-k="' + k + '">' + ({ high: '⬆️ ', same: '↔️ ', low: '⬇️ ' })[k] + esc(M.HAND[k].label) + '</button>'; }).join('') + '</div>' +
            '<p class="ev-small">눈으로 본 값은 결과 표에 대략(높다 120%, 비슷 100%, 낮다 70%)으로 적어요.</p>' + nav(null);
        return { html: html, mount: function (el) {
            el.querySelector('.ev-choices').addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (b) saveHeight({ pct: M.handPct(b.dataset.k), method: 'hand', hand: b.dataset.k }); });
        } };
    };
    function saveHeight(o) {
        var p = st.t2, s = setup(), rec = { value: p.value, pct: o.pct, method: o.method, at: new Date().toISOString() };
        if (o.hand) rec.hand = o.hand;
        if (p.ch) { var d = M.targetDiff(o.pct, s.targetPct, s.tolPct); rec.diff = Math.round(d.diff); rec.ok = o.hand ? o.hand === 'same' : d.ok; p.challenge.push(rec); }
        else p.trials.push(rec);
        st.last2 = rec; changed();
        var sc = o.method === 'video' ? scene2 : null; scene2 = null;
        if (p.ch && sc) sendScene('t2', sc.clip, sc.at);
        show(p.ch ? 't2-ch-result' : 't2-result');
    }
    SCREENS['t2-result'] = function () {
        var p = st.t2, r = st.last2 || p.trials[p.trials.length - 1], defs = ensureBase('t2'), d = defs[p.changed];
        if (!r) return { html: nav('t2-cond', '발사하러 가기 →') };
        // 같은 조건 반복 (2026-11-23 가상 수업 4차 '없어서 불편한 기능 상'): 1차시처럼 예측·방법을 다시 묻지 않고 바로 발사 → 반복 범위·흔들림 판정
        var same = p.trials.filter(function (t) { return t.value === r.value; }), reps = setup().repeats;
        var np = nextPlanned('t2', r.value);
        var changeBtn = np && d
            ? '▶ 정해 둔 ' + (np.idx === 0 ? '① ' : '② ') + esc(d.label(np.val)) + ' 로 발사하기'
            : '🔧 바꿔서 다시 발사';
        var html = '<p class="ev-kicker">결과 · ' + esc(d ? d.label(r.value) : '') + '</p><h2>🚀 아이 키의 ' + r.pct + '%' + (r.method === 'hand' ? ' <small>(눈으로)</small>' : '') + '</h2>' + '<p class="ev-small ev-easy">🧒 % = ' + esc(M.EASY['%']) + '</p>' +
            '<p class="ev-small">이 조건: <b>' + same.length + '번째</b>' + (same.length > 1 ? ' · 평균 <b>' + Math.round(M.mean(same.map(function (t) { return t.pct; }))) + '%</b>' : '') + '</p>' +
            planBar('t2') +
            card('<p>' + (r.pct >= 90 && r.pct <= 110 ? '🎉 아이 키와 거의 같아요!' : (r.pct > 110 ? '아이 키보다 높아요. 천장 조심! ' : '아이 키보다 낮아요. ') + t2Hint(r.pct > 110)) + '</p>' +
                '<p class="ev-small">' + esc(M.DEF.design) + '</p>') +
            '<details class="ev-more"><summary>📏 아이 키(cm)로도 보기 (선택, 이 폰에만)</summary>' + stepper('child', '아이 키', st.childCm ? st.childCm + ' cm' : '넣지 않음', {}) +
            '<p class="ev-small" id="ev-cm">' + (st.childCm ? '로켓 높이 약 ' + M.cmFrom(r.pct, st.childCm) + ' cm' : '+ 를 누르면 넣어요. 선생님께는 %만 보내요.') + '</p></details>' +
            '<div class="ev-nav col">' + (same.length < reps ? '<button type="button" class="ev-next good" id="ev-again2">🔁 같은 조건으로 한 번 더 (' + same.length + '/' + reps + ')</button>' : '<p class="ev-ok">✅ 같은 조건으로 ' + reps + '번 쐈어요!</p>') +
            (M.valueKinds(p.trials) < 2 && same.length >= reps ? moreHint('t2', r.value) : '') + '<button type="button" class="ev-next ' + (same.length < reps ? 'secondary' : 'good') + '" id="ev-change">' + changeBtn + '</button>' +
            (M.valueKinds(p.trials) < 2 ? '' : '<button type="button" class="ev-next secondary" data-go="t2-graph">📊 결과 비교 보기</button>') + '</div>' +
            '<p class="ev-small">잘못 잰 값이면 <button type="button" class="ev-link" id="ev-undo">이 기록 지우기</button></p>';
        return { html: html, mount: function (el) {
            $('#ev-change').addEventListener('click', function () { mustChange('t2', r.value, np ? np.val : null); });
            var ag2 = $('#ev-again2');
            if (ag2) ag2.addEventListener('click', function () { p.value = r.value; p.ch = false; p.quick = true; save(); show(r.method === 'hand' ? 't2-hand' : 't2-measure'); });
            el.querySelector('[data-var="child"]').addEventListener('click', function (e) {
                var b = e.target.closest('[data-pm]'); if (!b) return;
                st.childCm = Math.max(80, Math.min(190, (st.childCm || 129) + Number(b.dataset.pm))); save();
                el.querySelector('[data-var="child"] .ev-sval').textContent = st.childCm + ' cm';
                $('#ev-cm').textContent = '로켓 높이 약 ' + M.cmFrom(r.pct, st.childCm) + ' cm';
            });
            $('#ev-undo').addEventListener('click', function () {
                if (!confirm('방금 잰 값을 지울까요?')) return;
                var i = p.trials.indexOf(r); if (i < 0) i = p.trials.length - 1;
                p.trials.splice(i, 1); st.last2 = null; changed(); show('t2-cond');
            });
        } };
    };
    SCREENS['t2-graph'] = compareScreen('t2', 't2-challenge', '🎯 도전: 딱 아이 키만큼! →');
    SCREENS['t2-challenge'] = function () {
        var s = setup();
        var html = '<p class="ev-kicker">🎯 도전</p><h2>딱 아이 키만큼 (' + esc(s.targetPct) + '%) 올려요!</h2>' +
            card('<p>우리 결과 표를 보고 조건을 정한 뒤 발사해요. 목표와 <b>' + esc(s.tolPct) + '%</b> 안으로 맞으면 성공!</p>') +
            '<h3>📊 우리 결과 표</h3><div id="ev-mini-ch"></div>' + challengeList('t2') +
            '<div class="ev-nav col"><button type="button" class="ev-next good" id="ev-ch2">도전하기 →</button><button type="button" class="ev-next secondary" id="ev-end">정리로 가기 →</button></div>';
        return { html: html, mount: function () {
            if (st.t2.changed) miniTable($('#ev-mini-ch'), 't2');
            $('#ev-ch2').addEventListener('click', function () { st.t2.ch = true; save(); show('t2-ch-cond'); });
            $('#ev-end').addEventListener('click', function () { st.t2.ch = false; save(); show('end-intro'); });
        } };
    };
    SCREENS['t2-ch-result'] = function () {
        var r = st.t2.challenge[st.t2.challenge.length - 1], s = setup();
        if (!r) return { html: nav('t2-challenge', '도전하러 가기 →') };
        var html = '<p class="ev-kicker">🎯 도전 결과</p><h2>' + (r.ok ? '🎉 성공!' : '❌ 목표와 ' + diffText('t2', r.diff)) + '</h2>' +
            card('<p>목표 <b>' + esc(s.targetPct) + '%</b> → 실제 <b>' + r.pct + '%</b>' + (r.method === 'hand' ? ' (눈으로)' : '') + '</p><p class="ev-big">목표와 ' + Math.round(Math.abs(r.diff)) + '% 차이</p>') + mediaLine('t2') +
            '<div class="ev-nav col"><button type="button" class="ev-next ' + (r.ok ? 'secondary' : 'good') + '" data-go="t2-ch-cond">🔁 다시 도전</button>' +
            '<button type="button" class="ev-next ' + (r.ok ? 'good' : 'secondary') + '" id="ev-end">정리로 →</button></div>';
        return { html: html, mount: function () { $('#ev-end').addEventListener('click', function () { st.t2.ch = false; save(); show('end-intro'); }); } };
    };

    // ===== 4 정리 =====
    SCREENS['end-intro'] = function () {
        return { html: '<h2>📝 정리</h2>' + card('<p>처음에 풀었던 <b>힘·가속도·압력</b> 문제를 다시 풀어요.</p><p>이번에는 <b>정의 퀴즈</b>라서 맞히면 점수가 올라요! 마지막에 처음 생각과 나란히 비교해요.</p>') + nav('end-force', '다시 풀기 →') };
    };
    SCREENS['end-force'] = conceptScreen(M.CONCEPTS[0], 'end-accel', true);
    SCREENS['end-accel'] = conceptScreen(M.CONCEPTS[1], 'end-pressure', true);
    SCREENS['end-pressure'] = conceptScreen(M.CONCEPTS[2], 'end-compare', true);
    SCREENS['end-compare'] = function () {
        var ch = M.conceptChanges(st.think.first, st.think.last);
        var html = '<h2>✨ 처음 생각 → 지금 생각</h2><div class="ev-compare">' + ch.map(function (c, i) {
            var opts = M.CONCEPTS[i].opts, k = M.CONCEPTS[i].key;
            var easy = M.KEY_WORDS[k] ? M.easyLine(M.KEY_WORDS[k]) : '';
            return '<div class="ev-cmp' + (c.sparkle ? ' spark' : '') + '"><h3>' + esc(c.word) + (c.sparkle ? ' ✨' : '') + '</h3>' +
                '<p><span class="ev-tag">처음</span> ' + esc(M.optText(opts, c.first) || '–') + '</p><p><span class="ev-tag now">지금</span> ' + esc(M.optText(opts, c.last) || '–') + (c.lastOk ? ' ⭕' : '') + '</p>' +
                '<p class="ev-small ev-keep" data-lesson-answer="' + k + '">📘 <b>' + esc(c.word) + '</b> = ' + esc(M.CONCEPTS[i].def) + '</p>' +
                (easy ? '<p class="ev-easy ev-keep">🧒 쉬운 말 · ' + esc(easy) + '</p>' : '') + '</div>';
        }).join('') + '</div>' + nav('end-sentence', '다음: 우리 팀 정리 문장 →');
        return { html: html };
    };
    /* 정리 문장 (2026-11-21): '○○을(를) 늘렸더니 □□가 ___. 왜냐하면 ___' — 고르기 먼저, 까닭은 고르거나 짧게 쓰기 */
    function numClash(pick, dir) { return (pick === 'up' && dir === 'down') || (pick === 'down' && dir === 'up'); }
    SCREENS['end-sentence'] = function () {
        st.concl = st.concl || {};
        var parts = ['t1', 't2'].filter(function (k) { return st[k].changed && st[k].trials.length; });
        var html = '<h2>✍️ 우리 팀 정리 문장</h2><p>잰 것을 보고 한 문장으로 말해 봐요. <b>원인(바꾼 것) → 결과(잰 것) → 까닭</b></p>' +
            (parts.length ? parts.map(function (k) {
                var d = ensureBase(k)[st[k].changed], G = M.GUESS[k], c = st.concl[k] || {}, g = st[k].guess;
                var ev = M.evidence(k, st[k], st.setup), q = M.teamQuestion(k, st[k].changed), bec = M.becauseFor(k, st[k].changed);
                var head = '<div class="ev-card ev-concl" data-concl="' + k + '"><p class="ev-kicker">' + (k === 't1' ? '1차시' : '2차시') + (g && G[g.dir] ? ' · 내 예측: ' + esc(G[g.dir]) : '') + '</p>' +
                    (q ? '<p class="ev-teamq">🔎 <b>우리 팀 물음</b> · ' + esc(q) + '</p>' : '') +
                    // 📏 우리 숫자 (증거, 저절로 — 아이는 고치지 않음)
                    (ev ? '<p class="ev-evidence">📏 <b>우리 숫자</b> · ' + esc(ev.text) + '</p>' : '');
                // 한 가지 값만 잰 차시: 결과·까닭을 고르지 않음 (결과 없는 결론 막기)
                if (!ev || ev.one) return head + '<p class="ev-notyet">🤔 <b>아직 말할 수 없어요</b> — 값을 하나 바꿔 재야 알 수 있어요.</p>' +
                    (stageLocked(k) ? '' : '<div class="ev-nav col"><button type="button" class="ev-next secondary" data-go="' + k + '-again">🔧 ' + esc(d.short || d.name) + ' 바꿔서 재러 가기</button></div>') + '</div>';
                // 같은 조건 반복이 없으면 흔들림을 몰라 결과를 말할 수 없음
                if (ev.norep) return head + '<p class="ev-notyet">🤔 <b>아직 말할 수 없어요</b> — 같은 조건으로 한 번 더 ' + (k === 't1' ? '재야' : '쏘아야') + ' 차이가 흔들림보다 큰지 알 수 있어요.</p>' +
                    (stageLocked(k) ? '' : '<div class="ev-nav col"><button type="button" class="ev-next secondary" data-go="' + k + '-again">🔁 같은 조건으로 한 번 더 ' + (k === 't1' ? '재러' : '쏘러') + ' 가기</button></div>') + '</div>';
                // 계획한 ① → ② 차례·방향 그대로 ('줄였더니'·'늘렸더니'·'바꿨더니', 가상 수업 5차 중 1)
                var pl = M.planOf(st[k]);
                return head + '<p><b>' + esc(d.short || d.name) + '</b>' + M.josa(d.short || d.name, '을를').slice((d.short || d.name).length) + ' ' + (pl ? '<b>' + esc(d.label(pl[0])) + ' → ' + esc(d.label(pl[1])) + '</b> 로 ' : '') + M.planVerb(d, pl) + ' ' + G.what + '</p>' +
                    '<div class="ev-choices" data-evdir="' + (ev.dir || '') + '">' + ['down', 'up', 'same'].map(function (x) { return '<button type="button" class="ev-choice' + (c.dir === x ? ' on' : '') + '" data-dir="' + x + '">' + esc(G[x + 'Done']) + '</button>'; }).join('') + '</div>' +
                    // 고른 결과가 📏 우리 숫자와 반대면 한 줄 (막지는 않음, 5b 중 3)
                    '<p class="ev-numcheck ev-keep" role="status"' + (numClash(c.dir, ev.dir) ? '' : ' hidden') + '>📏 <b>숫자를 다시 봐요</b> — 우리 숫자는 <b>' + esc(G.word[ev.dir] || '') + '</b> 쪽이에요</p>' +
                    '<p>왜냐하면…</p><div class="ev-choices">' + bec.map(function (t) { return '<button type="button" class="ev-choice' + (c.why === t ? ' on' : '') + '" data-why="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' +
                    '<label class="ev-field">직접 쓰기 <small>(짧게, 안 써도 돼요)</small><input type="text" class="ev-why-in" maxlength="40" autocomplete="off" value="' + esc(c.why && bec.indexOf(c.why) < 0 ? c.why : '') + '"></label></div>';
            }).join('') : card('<p>아직 바꿔서 잰 조건이 없어요. 결과 카드로 가요.</p>')) +
            // 응답 장(정리 문장)을 띄운 동안: '다 했어요' → ✅ 보냈어요 (다음 단추 흐름은 숨김)
            (following() ? '<div class="ev-follow-only ev-nav col"><button type="button" class="ev-next good" id="ev-concl-send">✅ 다 했어요 · 보내기</button></div>' : '') +
            nav('end-card', '결과 카드 만들기 →');
        return { html: html, mount: function (el) {
            var snd = el.querySelector('#ev-concl-send');
            if (snd) snd.addEventListener('click', function () { st.sentKeys = st.sentKeys || {}; st.sentKeys['end-cause'] = true; logAnswer('정리 문장', '우리 팀 정리 문장'); changed(); show('sent', { follow: true }); });
            Array.prototype.forEach.call(el.querySelectorAll('[data-concl]'), function (box) {
                var k = box.dataset.concl;
                box.addEventListener('click', function (e) {
                    var b = e.target.closest('[data-dir], [data-why]'); if (!b) return;
                    var c = st.concl[k] = st.concl[k] || {};
                    if (b.dataset.dir) {
                        c.dir = b.dataset.dir;
                        var nc = box.querySelector('.ev-numcheck'), evd = (box.querySelector('[data-evdir]') || {}).dataset;
                        if (nc) nc.hidden = !numClash(c.dir, evd && evd.evdir);
                    } else { c.why = b.dataset.why; box.querySelector('.ev-why-in').value = ''; }
                    Array.prototype.forEach.call(box.querySelectorAll(b.dataset.dir ? '[data-dir]' : '[data-why]'), function (x) { x.classList.toggle('on', x === b); });
                    changed();
                });
                var whyIn = box.querySelector('.ev-why-in'); if (!whyIn) return;   // 아직 말할 수 없는 차시
                whyIn.addEventListener('change', function () {
                    var v = M.cleanShort(this.value), c = st.concl[k] = st.concl[k] || {};
                    if (v) { c.why = v; Array.prototype.forEach.call(box.querySelectorAll('[data-why]'), function (x) { x.classList.remove('on'); }); }
                    changed();
                });
            });
        } };
    };
    SCREENS['end-card'] = function () {
        var html = (CLASS && !PAST && classDone() ? '<p class="ev-done-band ev-keep" role="status">🏁 <b>수업이 끝났어요</b> · 결과 카드를 저장해 두세요</p>' : '') + '<h2>🏅 우리 팀 결과 카드</h2><canvas id="ev-card" class="ev-cardimg" width="1080" height="1660" aria-label="팀 결과 카드"></canvas>' +
            '<div class="ev-nav col"><button type="button" class="ev-next good" id="ev-save">📥 이미지로 저장</button>' + (navigator.share ? '<button type="button" class="ev-next secondary" id="ev-share">📤 공유하기</button>' : '') + '</div>' +
            '<p id="ev-card-msg" class="ev-msg" role="status"></p><p class="ev-small">수고했어요! 이 카드는 이 폰에서 만들었어요. 선생님 화면에는 팀 점수·시간 차이·높이 %만 가요.</p>';
        return { html: html, mount: function () {
            var cv = $('#ev-card'); drawCard(cv);
            $('#ev-save').addEventListener('click', function () {
                var a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = '필름통로켓_' + (st.team ? st.team.name : '팀').replace(/[\\/:*?"<>|\s]/g, '') + '.png';
                document.body.appendChild(a); a.click(); a.remove(); $('#ev-card-msg').textContent = '✅ 저장했어요 (사진 또는 다운로드 폴더).';
            });
            var sh = $('#ev-share');
            if (sh) sh.addEventListener('click', function () {
                cv.toBlob(function (b) {
                    var f = new File([b], 'film-rocket.png', { type: 'image/png' });
                    var data = { files: [f], title: '필름통 로켓 결과 카드' };
                    if (navigator.canShare && !navigator.canShare(data)) { $('#ev-card-msg').textContent = '이 폰은 그림 공유가 안 돼요. 이미지로 저장해 주세요.'; return; }
                    navigator.share(data).catch(function () { /* 닫음 */ });
                });
            });
        } };
    };
    function foundLine(k) {
        var p = st[k] || {}, defs = k === 't2' ? M.vars2(st.setup) : M.vars1(st.setup), d = defs[p.changed];
        if (!d) return '바꾼 것 없음';
        var name = d.short || d.name, ev = p.trials && p.trials.length ? M.evidence(k, p, st.setup) : null, c = (st.concl || {})[k] || {}, pl = M.planOf(p);
        var what = name + (pl ? ' ' + d.label(pl[0]) + '→' + d.label(pl[1]) : '');
        if (!ev || ev.one || ev.norep) return what + ' · 아직 말할 수 없음';
        return what + ' → ' + (c.dir ? M.GUESS[k].word[c.dir] : '?') + ' (' + String(ev.short).split(': ').pop() + ')';
    }
    function drawCard(cv) {
        var g = cv.getContext('2d'), W = cv.width, s = setup(), sc = M.score(st.quiz), sum = M.summary(st, st.setup);
        var grd = g.createLinearGradient(0, 0, 0, cv.height); grd.addColorStop(0, '#0d47a1'); grd.addColorStop(1, '#1565c0');
        g.fillStyle = grd; g.fillRect(0, 0, W, cv.height);
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'top';
        g.font = 'bold 64px system-ui, sans-serif'; g.fillText('🚀 필름통 로켓 결과 카드', W / 2, 70);
        g.font = '40px system-ui, sans-serif'; g.fillText(new Date().toLocaleDateString('ko-KR') + ' · 가족과 함께하는 과학실험교실', W / 2, 160);
        g.font = 'bold 76px system-ui, sans-serif'; g.fillStyle = '#ffeb3b'; g.fillText(st.team ? st.team.name : '우리 팀', W / 2, 240);
        // 가장 높이 오른 % (결과 카드는 이 폰에서 셈 — 선생님 결과판에서는 2026-11-23 뺌)
        var maxPct = (st.t2.trials || []).concat(st.t2.challenge || []).reduce(function (m, t) { return isFinite(t.pct) && t.pct > m ? t.pct : m; }, -1);
        var rows = [
            ['⭐ 팀 점수', sc.points + '점 (퀴즈 ' + sc.correct + '개 맞힘)'],
            ['⏱ 열리는 시간 도전', sum['시간 도전 차이(초)'] != null ? '목표 ' + s.targetTime + '초와 ' + Math.abs(sum['시간 도전 차이(초)']) + '초 차이' + (sum['시간 도전 성공'] ? ' 🎉' : '') : '도전 기록 없음'],
            ['🚀 가장 높이', maxPct >= 0 ? '아이 키의 ' + Math.round(maxPct) + '%' : '기록 없음'],
            ['🎯 높이 도전', sum['높이 도전 차이(%)'] != null ? '목표와 ' + Math.abs(sum['높이 도전 차이(%)']) + '% 차이' + (sum['높이 도전 성공'] ? ' 🎉' : '') : '도전 기록 없음'],
            ['✨ 바뀐 생각', sum['생각 바뀜 ✨'] + '개'],
            // 우리가 알아낸 것 (5b 하 5): 바꾼 것 ① → ② → 정리 문장 결과, 한 가지만 쟀으면 '아직 말할 수 없음'
            ['🔧 1차시 알아낸 것', foundLine('t1')],
            ['🔧 2차시 알아낸 것', foundLine('t2')]
        ];
        var y = 400;
        rows.forEach(function (r) {
            g.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(g, 80, y, W - 160, 130, 28); g.fill();
            g.textAlign = 'left'; g.fillStyle = '#bbdefb'; g.font = 'bold 40px system-ui, sans-serif'; g.fillText(r[0], 120, y + 20);
            g.fillStyle = '#fff'; var fs = 46; g.font = fs + 'px system-ui, sans-serif';
            while (fs > 26 && g.measureText(r[1]).width > W - 240) { fs -= 2; g.font = fs + 'px system-ui, sans-serif'; }
            g.fillText(r[1], 120, y + 70);
            y += 150;
        });
        g.textAlign = 'center'; g.fillStyle = '#e3f2fd'; g.font = '34px system-ui, sans-serif';
        g.fillText('힘 = 물체의 모양이나 운동 상태를 바꾸는 원인', W / 2, y + 30);
        g.fillText('압력 = 일정한 넓이에 작용하는 힘 · 가속도 = 속도가 변하는 정도', W / 2, y + 80);
    }
    function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

    // ---------- 화면 켜짐 유지 (수업 중 폰이 잠겨 🔌 끊김으로 뜨는 것 방지) ----------
    var wakeLock = null;
    function keepAwake() {
        if (PRESENT || PAST || !navigator.wakeLock || !navigator.wakeLock.request) return;
        navigator.wakeLock.request('screen').then(function (l) {
            wakeLock = l;
            l.addEventListener('release', function () { wakeLock = null; });
        }).catch(function () { /* 배터리 절약 모드 등에서는 무시 */ });
    }
    if (!PRESENT && !PAST) {
        keepAwake();
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !wakeLock) keepAwake(); });
    }

    // ---------- 시작 ----------
    initShare();
    var startScreen = PRESENT ? 'think-intro' : PAST ? 'enter' : st.team ? (st.screen === 'wait' || st.screen === 'sent' ? (st.lastReal || 'think-intro') : st.screen) : 'enter';   // 지난 기록은 먼저 요약(우리 팀·결과 카드·그래프)
    if (startScreen !== 'enter' && /measure$/.test(startScreen)) startScreen = startScreen.replace(/measure$/, 'cond');   // 카메라 화면 가운데서 새로고침했으면 조건 화면부터
    st.lastScreen = st.screen;
    show(startScreen === 'enter' && st.team ? 'enter' : startScreen, { back: true });
    if (share && !PRESENT) retryLoop();
    if (st.dirty) queueSend();
    // 시험·디버그용 (화면에서 쓰지 않음)
    window.__filmRocket = { state: function () { return st; }, show: show, sendNow: sendNow, share: function () { return share; }, foundLine: foundLine };
})();
