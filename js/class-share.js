/* 수업 참여 · 조 공유 공통 부품 (모든 실험 페이지용, 교사·학생 구글 로그인 없이)
   - '🏫 수업 참여' 띠: 주소에 ?c=수업코드 가 있으면 조·번호(이름 없음)를 고르게 하고, 그 조의 조 코드를 정한다
   - '👥 조 공유' 칸: 조 코드 → 📤 선생님께 보내기 · 📥 불러오기(몇 초마다 자동) · (있으면) 📂 CSV 불러오기
   - 하트비트: 단계를 바꿀 때·보낼 때·3분마다 선생님 화면에 보고 있는 단계·잰 점 수·보냄 여부
   저장소는 사이트의 Firebase(Firestore, js/lab-store.js — 2026-11-18 Apps Script 대신). 학생은 화면에 안 보이는 익명 로그인.
   같은 조의 새 측정은 실시간으로 들어온다(몇 초마다 확인도 하지만 읽기 횟수는 늘지 않음). 사용법: docs/class-share.md
   필요한 파일(이 순서로): js/pendulum-config.js, js/pendulum-cloud.js, js/lab-store.js, js/class-cloud.js, js/class-share.js, css/class-share.css

   const share = ClassShare.init({
       exp: 'idealgas',                       // 실험 이름 (js/class-cloud.js 의 EXPS)
       barMount: '#class-bar',                // 수업 참여 띠를 넣을 곳 (없으면 첫 h1 바로 뒤)
       shareMount: '#share',                  // 조 공유 칸을 넣을 곳 (없으면 띠만)
       getItems: () => [{ id, title, n, summary, data }],   // 이 노트북이 직접 잰 것 (보낼 것)
       onIncoming: (items) => true|false,     // 같은 조 다른 노트북이 보낸 것 → 표에 합치고 바뀌었으면 true
       getStep: () => 'data', getPoints: () => 12,
       ...선택: onGroup(code), pollWhen(), csvImport(files), incomingCount(), clearIncoming(), store, send, pull
       팀 이름 수업(수업 mode 'team', 가족 행사): onClass(info, me) — 수업 정보·내 팀이 정해질 때, teamPicker: false — 띠에 팀 이름 칸을 두지 않음(페이지가 share.joinTeam(이름))
   });
   share.stepChanged();   // 단계(탭)를 바꿀 때 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ClassShare = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var DEVICE_RE = /^[A-Za-z0-9_-]{4,20}$/;
    var ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
    var DATA_MAX = 45000 * 6;

    // 노트북은 'n…', 폰(📱 폰 연결로 연 화면)은 'p…' 로 시작한다 (교사 화면·다른 노트북이 폰을 알아보게)
    function newDeviceId(random, prefix) {
        var R = typeof random === 'function' ? random : Math.random, s = prefix === 'p' ? 'p' : 'n';
        for (var i = 0; i < 6; i++) s += 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(R() * 32)];
        return s;
    }
    // 📱 노트북·폰 짝 공간 번호 (p + 23자). 이 번호가 곧 자료를 지키는 열쇠라(아는 기기만 읽음) crypto.getRandomValues 를 먼저 쓴다
    //  (js/lab-store.js 의 randomChars 와 같은 글자). random 을 주면(시험) 그것으로, crypto 가 없을 때만 Math.random
    function newPairSpace(random) {
        var A = 'abcdefghijkmnpqrstuvwxyz23456789', s = 'p', bytes = null;
        if (typeof random !== 'function') {
            try { if (typeof crypto !== 'undefined' && crypto.getRandomValues) { bytes = new Uint8Array(23); crypto.getRandomValues(bytes); } } catch (e) { bytes = null; }
        }
        var R = typeof random === 'function' ? random : Math.random;
        for (var i = 0; i < 23; i++) s += A[bytes ? bytes[i] % 32 : Math.floor(R() * 32)];
        return s;
    }
    function isPhoneDevice(device) { return /^p/.test(String(device || '')); }
    function deviceLabel(device) { return (isPhoneDevice(device) ? '📱 폰 ' : '노트북 ') + String(device || '').slice(-4).toUpperCase(); }
    /* 📱 폰 연결: 폰 주소의 값 읽기 (?role=phone&group=조코드[&c=수업&jo=조&num=번호]) → { group, jo, num } 또는 null */
    function readPhoneParams(search) {
        var q = String(search || '');
        if (!/[?&]role=phone(?:&|#|$)/.test(q)) return null;
        var get = function (k) { var m = new RegExp('[?&]' + k + '=([^&#]*)').exec(q); return m ? decodeURIComponent(m[1]) : ''; };
        var g = get('group').replace(/\s+/g, '');
        if (!/^\d{1,2}-\d{1,2}-\d{4}$/.test(g)) return null;
        var jo = Number(get('jo')), num = Number(get('num'));
        return { group: g, jo: jo >= 1 && jo <= 99 && jo % 1 === 0 ? jo : 0, num: num >= 1 && num <= 10 && num % 1 === 0 ? num : 0 };
    }
    /* 폰 주소 만들기: base(폰 페이지 주소) 의 다른 값은 그대로 두고 role·group·s·c·jo·num 을 새로 붙인다 */
    function phoneUrl(base, o) {
        var u = new URL(base);
        ['role', 'group', 's', 'c', 'jo', 'num'].forEach(function (k) { u.searchParams.delete(k); });
        u.searchParams.set('role', 'phone');
        u.searchParams.set('group', o.group);
        if (o.scriptId) u.searchParams.set('s', o.scriptId);
        if (o.classCode) { u.searchParams.set('c', o.classCode); if (o.jo && o.num) { u.searchParams.set('jo', String(o.jo)); u.searchParams.set('num', String(o.num)); } }
        u.hash = '';
        return u.href;
    }
    // 시트 한 줄의 id: 노트북 번호 + 실험이 정한 id (서버 규칙 ^[A-Za-z0-9_-]{6,40}$)
    function rowId(device, itemId) {
        var x = String(itemId == null ? '' : itemId).replace(/[^A-Za-z0-9_-]/g, '');
        var s = (String(device) + '-' + (x || 'item')).slice(0, 40);
        return ID_RE.test(s) ? s : null;
    }
    function fixState(st) {
        st = Object.assign({ group: '', ban: '', jo: '', device: '', auto: true, sent: [], space: '' }, st || {});
        if (!/^p[a-z0-9]{23}$/.test(String(st.space || ''))) st.space = '';   // 노트북↔폰 짝 공간 (수업 없이 📱 폰 연결할 때 이 노트북이 만듦)
        if (!DEVICE_RE.test(st.device)) st.device = newDeviceId();
        if (!Array.isArray(st.sent)) st.sent = [];
        st.auto = st.auto !== false;
        return st;
    }

    /* 보낼 내용 (공용 저장): items → 서버 save 요청들. 예전에 보냈는데 지금 없는 id 는 빈 줄(n 0)로 보내 시트를 고친다
       돌려주는 값: { payloads } 또는 { error } */
    function buildPayloads(o) {
        if (!o.isGroupCode(o.group)) return { error: '조 코드를 먼저 정하세요 (예: 2-3-4821).' };
        if (!DEVICE_RE.test(String(o.device || ''))) return { error: '노트북 번호가 없습니다. 페이지를 새로고침하세요.' };
        var now = o.now || new Date().toISOString(), seen = {}, list = [];
        var only = Array.isArray(o.only) ? o.only.map(String) : null;   // 폰 회차 고르기: 고른 id 만 보냄 (안 고른 것은 시트에 그대로 둠)
        (o.items || []).forEach(function (it) {
            var id = rowId(o.device, it.id);
            if (!id || seen[id]) return;
            seen[id] = true;
            if (only && only.indexOf(String(it.id)) < 0) return;
            var data = it.data === undefined ? '' : (typeof it.data === 'string' ? it.data : JSON.stringify(it.data));
            if (data.length > DATA_MAX) data = '';   // 너무 크면 자료는 빼고 요약만 (화면에서 CSV 안내)
            list.push({ action: 'save', exp: o.exp, id: id, group: o.group, device: o.device, title: String(it.title || '측정').slice(0, 60),
                n: Math.max(0, Math.round(Number(it.n) || 0)), summary: it.summary || {}, data: data, sentAt: now, tooBig: data === '' && it.data !== undefined && it.data !== '' });
        });
        (o.sent || []).forEach(function (id) {
            if (!seen[id] && String(id).indexOf(o.device + '-') === 0) list.push({ action: 'save', exp: o.exp, id: id, group: o.group, device: o.device, title: '(지움)', n: 0, summary: {}, data: '', sentAt: now });
        });
        if (!list.length) return { error: '이 노트북에서 보낼 측정값이 없습니다.' };
        return { payloads: list };
    }
    // 서버 목록 → 다른 노트북이 보낸 것 (내 노트북 것·지운 줄은 뺀다). data 는 JSON 으로 풀어 줌
    function incomingFrom(items, myDevice) {
        return (items || []).filter(function (x) { return x && String(x.device) !== String(myDevice) && Number(x.n) > 0; }).map(function (x) {
            var data = x.data;
            if (typeof data === 'string') { try { data = data ? JSON.parse(data) : null; } catch (e) { /* 글자 그대로 */ } }
            var dev = String(x.device);
            return { id: String(x.id).indexOf(dev + '-') === 0 ? String(x.id).slice(dev.length + 1) : String(x.id), rowId: String(x.id), device: dev,
                from: deviceLabel(dev), title: String(x.title || ''), n: Number(x.n) || 0, summary: x.summary || {}, data: data, sentAt: String(x.sentAt || x.timestamp || '') };
        });
    }

    // ---------- 화면 ----------
    function init(opts) {
        opts = opts || {};
        if (typeof document === 'undefined') throw new Error('ClassShare.init 은 브라우저에서만');
        var PCF = window.PendulumCloud, CC = window.ClassCloud, CFG = window.PENDULUM_CONFIG || {};
        if (!PCF || !CC) throw new Error('js/pendulum-cloud.js 와 js/class-cloud.js 를 먼저 불러오세요.');
        var exp = String(opts.exp || '');
        var info = CC.expInfo(exp) || { name: exp };
        var $q = function (sel) { return typeof sel === 'string' ? document.querySelector(sel) : sel; };
        var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var LS = null; try { LS = window.localStorage; } catch (e) { LS = null; }
        var KEY = 'class-share:' + exp;
        // 📱 폰으로 연 화면이면(?role=phone) 조 코드·수업 자리를 주소에서 받고, 노트북 화면의 저장과 섞이지 않게 따로 저장한다
        var PHONE = readPhoneParams(location.search);
        // 🎬 발표용 (교사 화면 '발표 보기' 의 iframe, ?present=1): 수업 문서만 읽어 단계 잠금을 학생과 같게.
        //  익명 로그인으로 자리 잡기·하트비트·조 공유·폰 QR·이 기기 저장 없음 ('들어온 학생' 수가 늘지 않음)
        var PRESENT = !PHONE && !!(window.LabUI && window.LabUI.present);
        var role = PHONE ? 'phone' : PRESENT ? 'present' : 'laptop';
        if (PHONE) KEY += ':phone';
        var CLASS = CC.readClassParam(location.search);
        // 🧍 수업 없이 연 화면 (2026-11-20 선생님 결정 "교사가 만든 큐알이나 사이트로 접속하지 않은 경우에는 조별 활동 필요없음"):
        //  주소에 ?c=수업코드 가 없고 폰 화면도 아니면 '👥 조 공유' 칸·선생님께 보내기 단추를 숨긴다.
        //  📱 폰 → 노트북 보내기(share.phoneCard 의 짝 QR)는 그대로. <html class="cs-solo"> 이 붙어
        //  페이지는 .cs-hide-solo(숨김)·.cs-show-solo(이때만 보임)로 조·선생님 안내를 바꾼다. 개발 페이지는 opts.solo: false 로 예전처럼
        var SOLO = !CLASS && !PHONE && !PRESENT && opts.solo !== false;
        try { document.documentElement.classList.toggle('cs-solo', SOLO); } catch (e) { /* 무시 */ }
        var store = PRESENT ? { load: function () { return null; }, save: function () { /* 발표용은 저장 안 함 */ } } : (!PHONE && opts.store) || {
            load: function () { try { return JSON.parse((LS && LS.getItem(KEY)) || 'null'); } catch (e) { return null; } },
            save: function (o) { try { LS.setItem(KEY, JSON.stringify(o)); } catch (e) { /* 저장 불가 */ } }
        };
        var st = fixState(store.load());
        // 예전에 수업 없이 조 코드를 만들어 기억해 둔 기기: 그 조 코드(남과 같이 쓰는 조 코드 공간)는 잊는다. 폰 짝 공간이면 그대로. 측정 자료는 페이지가 따로 저장하므로 지우지 않음
        if (SOLO && st.group && !st.space) { st.group = ''; st.sent = []; st.auto = false; }
        if (!st.runs || typeof st.runs !== 'object') st.runs = {};   // 폰 회차 목록: { 실험 id: { sel, memo, at, sig } }
        var PICK = !!PHONE && !opts.autoSendOnSave && !opts.phoneAutoSend;   // phoneAutoSend: 폰만 바로 보내기                  // 폰은 기본으로 '회차를 골라 보내기'
        if (PHONE) {
            if (!isPhoneDevice(st.device)) st.device = newDeviceId(null, 'p');
            if (st.group !== PHONE.group) { st.group = PHONE.group; st.sent = []; }
            st.auto = false;   // 폰은 측정해서 보내기만 (불러오기는 노트북이)
        }
        function saveSt() { store.save(st); }
        saveSt();
        // 저장 공간: 링크의 ?s= (수업·폰 QR) > 수업 코드로 찾은 수업 공간 > 이 노트북이 만든 폰 짝 공간 > 조 코드 공간 (js/lab-store.js)
        var LINK = PCF.resolveServer(location.search);
        var SERVER = {};
        function srv() {
            var clsSpace = cls && cls.info && cls.info.space && cls.info.exp === exp ? cls.info.space : '';
            var sp = LINK.from === 'link' ? LINK.id : clsSpace || st.space || '';
            SERVER.url = 'lab:' + sp; SERVER.id = sp || null; SERVER.from = LINK.from === 'link' || clsSpace ? 'link' : sp ? 'pair' : LINK.from;
            return SERVER;
        }
        srv();
        var pollSec = function () { return Math.max(3, Number(CFG.pollSeconds) || 5) * (run.fails >= 3 ? 3 : 1); };
        var run = { busy: false, pulling: false, lastOk: null, fails: 0, timer: null, seen: null };
        var timeText = function (d) { return d ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''; };
        var groupOk = function () { return PCF.isGroupCode(st.group); };
        var els = {};

        // ----- 조 공유 칸 -----
        var mount = opts.shareMount && !PRESENT ? $q(opts.shareMount) : null;
        var soloBox = null;   // 수업 없이 연 화면: 조 공유 칸 대신 (있으면) CSV 불러오기·불러온 값 지우기만
        if (mount && SOLO) {
            if (opts.csvImport || opts.clearIncoming) {
                mount.innerHTML = '<div class="cs-card cs-solo-box"><div class="cs-row">' +
                    (opts.csvImport ? '<label class="cs-btn secondary cs-file">📂 CSV 불러오기<input type="file" id="cs-csv" accept=".csv,text/csv" multiple hidden></label>' : '') +
                    (opts.clearIncoming ? '<button type="button" id="cs-clear" class="cs-btn danger">불러온 값 지우기</button>' : '') + '</div>' +
                    '<div id="cs-status" class="cs-note" role="status" aria-live="polite"></div>' +
                    '<p class="cs-note">다른 기기에서 저장한 ' + esc(opts.csvHint || '이 페이지의 CSV') + ' 파일을 불러와 함께 볼 수 있어요. 선생님 QR 로 들어오면 같은 조와 자동으로 나눠요.</p></div>';
                soloBox = mount;
                ['csv', 'clear', 'status'].forEach(function (k) { els[k] = document.getElementById('cs-' + k); });
            } else { mount.hidden = true; mount.innerHTML = ''; }
            mount = null;
        }
        if (mount) {
            mount.innerHTML =
                '<details class="cs-card cs-share" id="cs-share"><summary>👥 조 공유: 선생님께 보내기 · 다른 노트북에서 불러오기 <span class="cs-note" id="cs-sum"></span></summary>' +
                '<p class="cs-note">같은 조 노트북 여러 대가 같은 <b>조 코드</b>를 넣으면, 한 노트북이 보낸 측정값을 다른 노트북에서 불러와 합칩니다. 수업으로 들어왔으면 선생님 화면에서도 보여요. 이름·학번은 보내지 않습니다.</p>' +
                '<div class="cs-row"><label>반 <input type="number" id="cs-ban" min="1" max="99" inputmode="numeric" class="cs-in cs-num"></label>' +
                '<label>조 <input type="number" id="cs-jo" min="1" max="99" inputmode="numeric" class="cs-in cs-num"></label>' +
                '<button type="button" id="cs-make" class="cs-btn secondary">🎲 새 조 코드 만들기</button></div>' +
                '<div class="cs-row"><label>조 코드 <input type="text" id="cs-group" placeholder="예: 2-3-4821" inputmode="numeric" autocomplete="off" class="cs-in cs-code"></label>' +
                '<span class="cs-note">같은 조의 다른 노트북에는 이 코드를 그대로 넣으세요.</span></div>' +
                '<div class="cs-row"><button type="button" id="cs-send" class="cs-btn good">📤 선생님께 보내기</button>' +
                '<button type="button" id="cs-pull" class="cs-btn secondary">📥 불러오기</button>' +
                '<label class="cs-check"><input type="checkbox" id="cs-auto"> 새 측정 자동으로 불러오기</label></div>' +
                '<div id="cs-status" class="cs-note" role="status" aria-live="polite"></div>' +
                '<div class="cs-row" id="cs-extra">' +
                (opts.phone && !PHONE ? '<button type="button" id="cs-phone" class="cs-btn">📱 폰으로 측정하기</button>' : '') +
                (opts.csvImport ? '<label class="cs-btn secondary cs-file">📂 CSV 불러오기<input type="file" id="cs-csv" accept=".csv,text/csv" multiple hidden></label>' : '') +
                (opts.clearIncoming ? '<button type="button" id="cs-clear" class="cs-btn danger">불러온 값 지우기</button>' : '') + '</div>' +
                '<p class="cs-note">이 노트북에서 직접 잰 값만 보내므로, 값을 잰 노트북마다 한 번씩 보내세요. 다시 보내면 같은 줄을 고쳐 씁니다.<br>' +
                '학교 인터넷에서 보내기가 안 되면: ' + esc(opts.csvHint || '이 페이지의 CSV 저장') + ' 파일을 다른 노트북으로 옮기고, 선생님께는 CSV 파일로 내세요.</p>' +
                '<p class="cs-note" id="cs-server"></p></details>';
            ['share', 'sum', 'ban', 'jo', 'make', 'group', 'send', 'pull', 'auto', 'status', 'csv', 'clear', 'server', 'phone'].forEach(function (k) { els[k] = document.getElementById('cs-' + k); });
            if (!groupOk() && !PHONE) els.share.open = true;
            if (PHONE) els.share.open = false;   // 폰 화면은 측정에 집중 (조 공유 칸은 접어 둠)
        }
        function setStatus(html, err) { if (!els.status) return; els.status.innerHTML = html; els.status.classList.toggle('cs-err', !!err); }
        function incoming() { return typeof opts.incomingCount === 'function' ? opts.incomingCount() : 0; }
        function render() {
            if (cardEl && !PHONE) renderCard();
            if (SOLO) (opts.sendButtons || []).forEach(function (b) { b = $q(b); if (b) b.hidden = true; });
            if (soloBox && els.clear) els.clear.disabled = !incoming();
            if (!mount) { schedule(); return; }
            if (document.activeElement !== els.group) els.group.value = st.group;
            if (document.activeElement !== els.ban) els.ban.value = st.ban;
            if (document.activeElement !== els.jo) els.jo.value = st.jo;
            els.auto.checked = st.auto;
            var ok = groupOk();
            els.send.disabled = els.pull.disabled = !ok || run.busy;
            (opts.sendButtons || []).forEach(function (b) { b = $q(b); if (b) { b.disabled = run.busy; if (SOLO) b.hidden = true; } });
            var ext = incoming();
            if (els.clear) els.clear.disabled = !ext;
            els.sum.textContent = ok ? '— 조 ' + st.group + (ext ? ' · 불러온 값 ' + ext + '개' : '') : '— 조 코드 없음';
            srv();
            els.server.textContent = (SERVER.from === 'legacy' ? '⚠ 예전 선생님 시트(Apps Script) 링크예요. 이제 사이트 저장소를 써요 — 선생님께 새 QR 을 받으세요. ' : '') +
                '저장: ' + (CLASS && SERVER.from === 'link' ? '이 수업 공간' : SERVER.from === 'link' ? '링크로 받은 공간' : SERVER.from === 'pair' ? '이 노트북·폰 짝 공간' : '조 코드 공간 (같은 조 코드를 넣은 기기끼리)') +
                ' · 학기 끝(6개월 뒤)에 저절로 지워져요 · 이 기기: ' + deviceLabel(st.device);
            if (!ok && !els.status.textContent) setStatus('반·조를 넣고 <b>🎲 새 조 코드 만들기</b>를 누르거나, 같은 조 노트북의 조 코드를 넣으세요.');
            schedule();
        }
        function setGroup(code, quiet, pairSpace) {
            var g = PCF.normalizeGroup(code);
            // 같은 코드로 다시 정해지면(칸에서 다른 곳을 누를 때 등) 아무것도 바꾸지 않음 — 안내 글이 지워져 화면이 움직이면 누르려던 단추를 놓친다
            if (g === st.group && !quiet) { render(); return; }
            if (g !== st.group) { st.group = g; st.sent = []; st.space = pairSpace || ''; srv(); }
            if (PCF.isGroupCode(g)) { var p = PCF.groupParts(g); st.ban = String(p.ban); st.jo = String(p.jo); }
            saveSt();
            if (!quiet) setStatus('');
            if (typeof opts.onGroup === 'function' && PCF.isGroupCode(g)) opts.onGroup(g);
            render();
            if (groupOk() && st.auto) pull(true);
        }
        if (mount) {
            els.group.addEventListener('change', function (e) { setGroup(e.target.value); });
            els.group.addEventListener('input', function (e) { var g = PCF.normalizeGroup(e.target.value); if (PCF.isGroupCode(g) && g !== st.group) setGroup(g); });
            els.ban.addEventListener('input', function (e) { st.ban = e.target.value; saveSt(); });
            els.jo.addEventListener('input', function (e) { st.jo = e.target.value; saveSt(); });
            els.make.addEventListener('click', function () {
                var code = PCF.makeGroupCode(st.ban, st.jo);
                if (!code) { setStatus('반과 조를 1~99 사이 숫자로 넣으세요.', true); return; }
                if (groupOk() && st.group !== code && !confirm('지금 조 코드(' + st.group + ')를 새 코드로 바꿀까요? 같은 조의 다른 노트북에도 새 코드를 넣어야 합니다.')) return;
                setGroup(code);
                setStatus('조 코드 <b>' + esc(code) + '</b> 를 만들었습니다. 같은 조의 다른 노트북에 이 코드를 넣으세요.');
            });
            els.auto.addEventListener('change', function (e) { st.auto = e.target.checked; saveSt(); render(); if (st.auto) pull(true); });
            els.send.addEventListener('click', function () { send(); });
            els.pull.addEventListener('click', function () { pull(false); });
        }
        if (mount || soloBox) {
            if (els.csv) els.csv.addEventListener('change', async function (e) {
                var files = Array.prototype.slice.call(e.target.files || []);
                e.target.value = '';
                var r = await opts.csvImport(files);
                if (r) setStatus(r.html || '', !!r.error);
                render();
            });
            if (els.clear) els.clear.addEventListener('click', function () {
                var n = incoming();
                if (!n || !confirm('다른 노트북·CSV 에서 불러온 값 ' + n + '개를 이 노트북에서 지울까요? (이 노트북에서 잰 값과 보낸 기록은 그대로입니다)' + (st.auto && !SOLO ? '\n자동 불러오기는 끕니다.' : ''))) return;
                opts.clearIncoming();
                if (!SOLO) st.auto = false;   // 수업 없이 연 화면은 폰에서 오는 측정을 계속 받음
                saveSt(); render();
                setStatus(SOLO ? '불러온 값을 지웠습니다.' : '불러온 값을 지웠습니다. 다시 합치려면 📥 불러오기를 누르세요.');
            });
        }

        // ----- 보내기 -----
        function defaultSend(ctx) {
            var b = buildPayloads({ exp: exp, group: ctx.group, device: ctx.device, items: myItems(), sent: ctx.sent, only: ctx.only, isGroupCode: PCF.isGroupCode });
            if (b.error) return Promise.resolve({ ok: false, error: b.error });
            var done = 0, ids = [], cleared = [], big = b.payloads.filter(function (p) { return p.tooBig; }).length;
            return b.payloads.reduce(function (pr, pl) {
                return pr.then(function (prev) {
                    if (prev && !prev.ok) return prev;
                    ctx.progress(done + 1, b.payloads.length);
                    var body = Object.assign({}, pl); delete body.tooBig;
                    return PCF.save(ctx.url, body).then(function (r) { if (r.ok) { done++; if (pl.n > 0) ids.push(pl.id); else cleared.push(pl.id); } return r; });
                });
            }, Promise.resolve(null)).then(function (last) {
                return last && !last.ok ? { ok: false, error: last.error, network: !!last.network, done: done, ids: ids, cleared: cleared } : { ok: true, done: done, ids: ids, cleared: cleared, note: big ? '자료가 너무 커서 ' + big + '개는 요약만 보냈습니다 (CSV 로 내세요).' : '' };
            });
        }
        // 이 기기가 잰 것 (폰 회차 메모는 제목 뒤에 붙여 보냄)
        function myItems() {
            var items = opts.getItems ? (opts.getItems() || []) : [];
            return items.map(function (it) {
                var m = it && st.runs[String(it.id)] && st.runs[String(it.id)].memo;
                return m ? Object.assign({}, it, { title: String(it.title || '측정') + ' · ' + m }) : it;
            });
        }
        async function send(statusEl, only) {
            var show = function (html, err) {
                setStatus(html, err); if (statusEl) $q(statusEl).innerHTML = html;
                if (els.pmsg) { els.pmsg.innerHTML = html; els.pmsg.classList.toggle('cs-err', !!err); els.presend.hidden = !err || PICK; }
            };
            if (!groupOk()) { show('⚠ 먼저 조 코드를 정하세요' + (mount ? ' (👥 조 공유).' : '.'), true); return { ok: false }; }
            if (run.busy) { show('📤 이미 보내는 중이에요. 끝나면 결과가 여기에 나와요.'); return { ok: false, busy: true }; }
            run.busy = true; render();
            // 불러오기가 도는 중이면 (조 코드를 넣은 직후 등) 끝날 때까지 기다렸다가 이어서 보낸다
            if (run.pulling && run.pullDone) { show('📥 불러오는 중이라, 끝나면 바로 보낼게요…'); await run.pullDone; }
            var ctx = { url: srv().url, group: st.group, device: st.device, sent: st.sent.slice(), exp: exp, only: only || null,
                progress: function (i, n) { show('📤 보내는 중… (' + i + '/' + n + ')'); } };
            var r = await (opts.send || defaultSend)(ctx);
            run.busy = false; run.sentAt = Date.now();
            (r.ids || []).forEach(function (id) { if (st.sent.indexOf(id) < 0) st.sent.push(id); });
            (r.cleared || []).forEach(function (id) { var k = st.sent.indexOf(id); if (k >= 0) st.sent.splice(k, 1); });   // 지운 줄은 한 번 비우면 끝
            if (PHONE) markSent(r.ids || []);
            if (r.ok && r.done === 0 && !(r.ids || []).length) { /* 아무것도 안 보냄 */ }
            saveSt();
            if (!r.ok) show('⚠ ' + (r.done ? '일부만 보냈습니다 (' + r.done + '개). ' : '보내지 못했습니다: ') + esc(r.error) + '<br>다시 눌러 보고, 계속 안 되면 ' + esc(opts.csvHint || 'CSV 저장') + ' 파일을 선생님께 내세요.', true);
            else { show('✅ ' + (PHONE ? '노트북으로 보냈어요' : '보냈습니다') + ': ' + esc(r.label || ('측정 ' + (r.ids || []).length + '개')) + ' (' + timeText(new Date()) + '). ' +
                (PHONE ? '노트북 화면에 몇 초 안에 나타나요.' : '같은 조의 다른 노트북에서 📥 불러오기를 누르면 합쳐집니다.') + (r.note ? '<br>' + esc(r.note) : '')); beat(true); }
            render(); if (PICK) renderRuns();
            return r;
        }

        // ----- 불러오기 -----
        function defaultPull(ctx) {
            return PCF.list(ctx.url + (ctx.url.indexOf('?') >= 0 ? '&' : '?') + 'exp=' + encodeURIComponent(exp), ctx.group).then(function (r) {
                if (!r.ok) return r;
                var items = incomingFrom(r.items, ctx.device);
                var changed = opts.onIncoming ? !!opts.onIncoming(items) : false;
                var others = {}; items.forEach(function (x) { others[x.device] = 1; });
                // 폰에서 새로 들어온 측정 세기 (처음 불러올 때는 세지 않음)
                var keys = items.map(function (x) { return x.rowId; }), phoneNew = 0;   // 새 측정만 (다시 보낸 측정은 세지 않음)
                if (run.seen) items.forEach(function (x, i) { if (isPhoneDevice(x.device) && !run.seen[keys[i]]) phoneNew++; });
                run.seen = {}; keys.forEach(function (k) { run.seen[k] = 1; });
                return { ok: true, changed: changed, others: Object.keys(others).length, points: items.reduce(function (n, x) { return n + x.n; }, 0), phoneNew: phoneNew };
            });
        }
        async function pull(quiet) {
            if (!groupOk() || run.pulling) return;
            if (run.busy && quiet) { schedule(); return; }   // 보내는 중에는 자동 불러오기를 미룸
            run.pulling = true;
            if (!quiet) setStatus('📥 불러오는 중…');
            var group = st.group, finish;
            run.pullDone = new Promise(function (res) { finish = res; });
            var r;
            try { r = await (opts.pull || defaultPull)({ url: srv().url, group: group, device: st.device, exp: exp }); }
            catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
            run.pulling = false; finish();
            if (group !== st.group) return;
            // 보내기 결과를 막 보여 준 참이면(10초 안) 자동 불러오기가 그 글을 덮지 않게
            var keepMsg = quiet && (run.busy || (run.sentAt && Date.now() - run.sentAt < 10000));
            if (!r.ok) {
                run.fails++;
                if (!keepMsg) setStatus('⚠ 불러오지 못했습니다: ' + esc(r.error) + (run.lastOk ? ' (마지막 성공 ' + timeText(run.lastOk) + ')' : '') + '<br>계속 안 되면 CSV 파일로 주고받으세요.', true);
                schedule();
                return;
            }
            run.fails = 0; run.lastOk = new Date();
            liveWatch(group);
            if (r.phoneNew) { notifyPhone(r.phoneNew); }
            if (!keepMsg || r.changed) setStatus((r.phoneNew ? '🆕 폰에서 새 측정 ' + r.phoneNew + '개가 들어왔어요' : r.changed ? '🆕 다른 노트북의 값을 합쳤습니다' : '🟢 연결됨') + ' · 같은 조의 다른 노트북 ' + (r.others || 0) + '대, 불러온 값 ' + (r.points || 0) + '개' +
                (r.newItems ? ', 새 항목 ' + r.newItems + '개' : '') + ' <span class="cs-note">(마지막 확인 ' + timeText(run.lastOk) + (st.auto ? ', ' + pollSec() + '초마다 확인' : '') + ')</span>');
            render();
        }
        // 실시간: 같은 조에 새 측정이 들어오면 바로 불러오기 (Firestore 일 때. 몇 초마다 확인은 그대로 두되 받아 둔 것을 읽어 비용 없음)
        var liveKey = '', liveOff = null;
        function liveWatch(group) {
            var key = srv().url + '|' + group;
            if (!st.auto || key === liveKey) return;
            if (liveOff) { try { liveOff(); } catch (e) { /* 무시 */ } liveOff = null; }
            liveKey = key;
            PCF.labStore().then(function (L) { return L.watch(SERVER.url, opts.watchExp || exp, group, function () { if (st.auto && group === st.group && !document.hidden) pull(true); }); })
                .then(function (off) { if (liveKey === key) liveOff = off; else if (off) off(); }, function () { /* 몇 초마다 확인으로 */ });
        }
        function schedule() {
            clearTimeout(run.timer); run.timer = null;
            if ((!mount && !cardEl) || !st.auto || !groupOk()) return;
            run.timer = setTimeout(function () {
                var when = typeof opts.pollWhen === 'function' ? opts.pollWhen() : true;
                if (!document.hidden && when) pull(true); else schedule();
            }, pollSec() * 1000);
        }

        // ----- 수업 참여 띠 (?c=) -----
        var cls = { info: null, me: null, lastBeat: 0, timer: null, pending: null };
        var ME_KEY = 'class-share:me:' + CLASS;
        var bar = null;
        function loadMe() {
            var d = null;
            try { d = JSON.parse((LS && LS.getItem(ME_KEY)) || 'null'); } catch (e) { d = null; }
            if (!d && opts.legacyMeKey) { try { d = JSON.parse((LS && LS.getItem(opts.legacyMeKey)) || 'null'); } catch (e) { d = null; } }
            return d && d.c === CLASS && d.jo && d.num ? d : null;
        }
        function saveMe() { try { if (cls.me) LS.setItem(ME_KEY, JSON.stringify(cls.me)); else LS.removeItem(ME_KEY); } catch (e) { /* 저장 불가 */ } }
        function beat(force) {
            if (!CLASS || !cls.me || !cls.info) return;
            var now = Date.now(), wait = 5000 - (now - cls.lastBeat);
            // 탭을 빨리 넘길 때 너무 자주 보내지 않게: 5초 안이면 조금 뒤에 마지막 단계로 한 번만
            if (!force && wait > 0) { if (!cls.pending) cls.pending = setTimeout(function () { cls.pending = null; beat(true); }, wait); return; }
            clearTimeout(cls.pending); cls.pending = null;
            cls.lastBeat = now;
            var submitted = typeof opts.getSubmitted === 'function' ? !!opts.getSubmitted() : st.sent.length > 0;
            var stepNow = opts.getStep ? String(opts.getStep() || '') : '';
            if (PHONE) stepNow = ('phone-' + (stepNow || 'live')).slice(0, 20);   // 교사 화면에 📱 로 보임
            CC.heartbeat(srv().url, { classCode: CLASS, jo: cls.me.jo, num: cls.me.num, step: stepNow,
                points: opts.getPoints ? opts.getPoints() : '', submitted: submitted, device: st.device })
                .then(function (r) { els.cmsg.innerHTML = r.ok ? '' : '⚠ 선생님께 진행 상황을 보내지 못했습니다: ' + esc(r.error); });
        }
        function renderBar() {
            if (cardEl) renderCard();
            if (!bar) return;
            var i = cls.info, me = cls.me;
            if (!i) return;
            var e = CC.expInfo(i.exp), wrong = i.exp !== exp;
            els.cinfo.innerHTML = '<b>🏫 ' + esc(i.ban) + '반 수업</b> <span class="cs-note">수업 코드 ' + esc(i.classCode) + (e ? ' · ' + esc(e.name) : '') + '</span>';
            if (wrong) {
                var url = e ? new URL('../' + e.page, location.href) : null;
                if (url) { url.searchParams.set('c', CLASS); if (SERVER.id && SERVER.from === 'link') url.searchParams.set('s', SERVER.id); }
                els.cpick.hidden = true; els.cjoined.hidden = true;
                els.cmsg.innerHTML = '⚠ 이 수업은 <b>' + esc(e ? e.name : i.exp) + '</b> 수업입니다.' + (url ? ' <a href="' + esc(url.href) + '">그 실험 페이지로 가기 →</a>' : '');
                return;
            }
            if (i.mode === 'team') {   // 팀 이름으로 입장 (조·번호 고르기 없음)
                els.cpick.hidden = true; els.cjoined.hidden = !me; els.cteam.hidden = !!me || opts.teamPicker === false;
                if (els.cchange) els.cchange.hidden = true;
                if (els.cphone) els.cphone.hidden = true;
                if (me) els.cme.innerHTML = '팀: <b>' + esc(me.team || (me.jo + '팀')) + '</b> <span class="cs-note">· 결과는 선생님 화면에 모여요</span>';
                return;
            }
            els.cteam.hidden = true;
            els.cpick.hidden = !!me; els.cjoined.hidden = !me;
            if (me) {
                var g = CC.groupFor(i, me.jo);
                els.cme.innerHTML = '나: <b>' + esc(me.jo) + '조 ' + esc(me.num) + '번</b>' + (PHONE ? ' 📱' : '') + ' <span class="cs-note">· 조 코드 ' + esc(g ? g.code : '') + ' · 측정값은 조원·선생님과 자동으로 나눠요</span>';
                if (els.cphone) els.cphone.hidden = !opts.phone || !!PHONE;
                if (els.cchange) els.cchange.hidden = !!PHONE;
                return;
            }
            els.cjo.innerHTML = '<option value="">조 고르기</option>' + i.groups.map(function (g) { return '<option value="' + g.jo + '">' + g.jo + '조 (' + g.size + '명)</option>'; }).join('');
            fillNums();
        }
        function fillNums() {
            var g = cls.info && CC.groupFor(cls.info, els.cjo.value);
            els.cnum.innerHTML = g ? Array.from({ length: g.size }, function (_, k) { return '<option value="' + (k + 1) + '">' + (k + 1) + '번</option>'; }).join('') : '<option value="">–</option>';
            els.cjoin.disabled = !g;
        }
        function applyMe() {
            var g = CC.groupFor(cls.info, cls.me.jo);
            if (!g) return;
            if (!PHONE) st.auto = true;
            if (st.group !== g.code) setGroup(g.code, true);
            else { saveSt(); if (typeof opts.onGroup === 'function') opts.onGroup(g.code); render(); if (mount) pull(true); }
            beat(true);
            clearInterval(cls.timer);
            // 폰은 측정·보내기 때만 신호 (노트북의 신호와 번갈아 덮어쓰지 않게). 무료 한도를 아끼려고 3분마다 (5분 넘게 없으면 '쉬는 중')
            // opts.beatEvery: 신호 간격(ms, 30초 이상). 행사형(필름통 로켓)은 1분 — 교사 화면 🔌 끊김을 빨리 알게
            if (!PHONE) cls.timer = setInterval(function () { if (!document.hidden) beat(true); }, Math.max(30000, Number(opts.beatEvery) || 180000));
        }
        function tellClass() { if (typeof opts.onClass === 'function') { try { opts.onClass(cls.info, cls.me); } catch (e) { /* 실험 쪽 오류 */ } } }
        async function startClass() {
            if (PRESENT) return cls.info ? Object.assign({ ok: true }, cls.info) : { ok: false, error: '발표용 화면' };
            if (cls.starting) return cls.starting;
            cls.starting = (async function () {
                var r = await CC.joinInfo(srv().url, CLASS);
                if (!r.ok) {
                    els.cinfo.innerHTML = '<b>🏫 수업 참여</b>';
                    els.cmsg.innerHTML = '⚠ ' + esc(r.error) + '<br>수업 없이 측정은 그대로 할 수 있습니다' + (mount ? '. 조 공유에 조 코드를 직접 넣어도 됩니다.' : '.');
                    cls.failed = r; tellClass();
                    return r;
                }
                cls.failed = null;
                startedClass(r);
                return r;
            })();
            try { return await cls.starting; } finally { cls.starting = null; }
        }
        function startedClass(r) {
            cls.info = r;
            cls.me = r.exp === exp ? loadMe() : null;
            // 폰 주소에 조·번호가 있으면 그대로 (묻지 않음)
            if (PHONE && PHONE.jo && PHONE.num && r.exp === exp && CC.groupFor(r, PHONE.jo) && CC.groupFor(r, PHONE.jo).code === PHONE.group) { cls.me = { c: CLASS, jo: PHONE.jo, num: PHONE.num }; saveMe(); }
            if (cls.me && !CC.groupFor(r, cls.me.jo)) cls.me = null;
            if (r.mode === 'team' && cls.me && Number(cls.me.num) !== 1) cls.me = null;
            renderBar();
            if (cls.me) applyMe();
            tellClass();
            startGate();
        }

        // ----- 선생님이 여는 단계 (교사 화면 '▶ 다음 단계 열기') -----
        // 7단계 실험: nav.steps / nav.tabs 의 열리지 않은 단계 단추를 🔒 로 잠그고, 열린 단계가 늘면 그 단계로 저절로 옮김
        // 다른 모양의 페이지(필름통 로켓)는 opts.onStage(열린 단계 목록 또는 null(모두), { moved, info }) 로 스스로 처리 (gateDom: false)
        // 잠그지 않는 경우: 📱 폰 측정 화면, 수업 없이 연 화면, 예전 수업(stage 없음), 한 화면 실험
        // 수업의 진행 방법(flow: 'hd' 가설연역 / 없음 7단계)에 따라 단계 목록이 달라짐 → 그때그때 계산
        function flowNow() { return cls.info && cls.info.exp === exp ? cls.info.flow : ''; }
        function gate() { return CC.gateSteps ? CC.gateSteps(exp, flowNow()) : null; }
        var GATE = gate();
        // 학생 화면의 단계 부품(LabUI.initSteps({ flows: true }))을 수업 방법으로 고정 (수업 없이 연 화면은 학생이 고름)
        function applyFlow() {
            if (!cls.info || cls.info.exp !== exp || !window.LabUI || !LabUI.setFlow || !(CC.canFlow && CC.canFlow(exp))) return;   // 선생님이 만든 실험은 만들 때 고른 방법 그대로
            LabUI.setFlow(cls.info.flow === 'hd' ? 'hd' : 'report', { lock: true });
            GATE = gate();
        }
        var gateSt = { on: false, prev: undefined, bypass: false, toast: null, timer: null, off: null };
        function openSteps() {
            if (!GATE || PHONE || !cls.info || cls.info.exp !== exp) return null;
            var si = CC.stageInfo(exp, cls.info.stage, flowNow());
            return si && !si.all ? si.keys : null;
        }
        function stepButtons() { return Array.prototype.slice.call(document.querySelectorAll('nav.steps button[data-step], nav.tabs button[data-tab]')); }
        function stepKey(el) {
            var k = el.getAttribute('data-step') || el.getAttribute('data-tab') || el.getAttribute('data-go') || '';
            // 가설연역이면 패널 안 단추의 7단계 키(data-go="data")를 그 단계 키(perform)로
            var sp = window.LabUI && LabUI.steps && LabUI.steps();
            return sp && sp.stepOf && sp.stepOf(k) || k;
        }
        function isLocked(key) { var o = openSteps(); return !!(o && GATE.indexOf(key) >= 0 && o.indexOf(key) < 0); }
        function currentStep() { var b = stepButtons().filter(function (x) { return x.getAttribute('aria-selected') === 'true'; })[0]; return b ? stepKey(b) : ''; }
        function goStep(key) {
            var b = stepButtons().filter(function (x) { return stepKey(x) === key; })[0];
            if (!b) return;
            gateSt.bypass = true; try { b.click(); } finally { gateSt.bypass = false; }
        }
        function gateToast(text) {
            if (!gateSt.toast) { gateSt.toast = document.createElement('div'); gateSt.toast.className = 'cs-toast'; gateSt.toast.setAttribute('role', 'status'); document.body.appendChild(gateSt.toast); }
            gateSt.toast.textContent = text; gateSt.toast.hidden = false;
            clearTimeout(gateSt.timer); gateSt.timer = setTimeout(function () { gateSt.toast.hidden = true; }, 2500);
        }
        function applyGate(moved) {
            var open = openSteps();
            if (typeof opts.onStage === 'function') { try { opts.onStage(open, { moved: moved, info: cls.info }); } catch (e) { /* 실험 쪽 오류 */ } }
            if (opts.gateDom === false) return;
            stepButtons().forEach(function (b) {
                var lock = isLocked(stepKey(b));
                b.classList.toggle('cs-locked', lock);
                if (lock) { b.setAttribute('aria-disabled', 'true'); b.title = '🔒 선생님이 열면 넘어가요'; } else { b.removeAttribute('aria-disabled'); if (b.title === '🔒 선생님이 열면 넘어가요') b.removeAttribute('title'); }
            });
            var cur = currentStep();
            if (moved && moved.to) { goStep(moved.to); gateToast('▶ 선생님이 다음 단계를 열었어요'); }
            else if (cur && isLocked(cur) && open) goStep(open[open.length - 1]);   // 잠긴 단계에 있으면(주소 #step-5 등) 열린 마지막 단계로
        }
        // 잠긴 단계로 가는 누름·화살표를 막음 (페이지의 단추 처리보다 먼저)
        document.addEventListener('click', function (e) {
            if (gateSt.bypass || !GATE) return;
            var t = e.target.closest && e.target.closest('nav.steps button[data-step], nav.tabs button[data-tab], [data-go]');
            if (!t || !isLocked(stepKey(t))) return;
            e.preventDefault(); e.stopImmediatePropagation();
            gateToast('🔒 아직 잠겨 있어요 — 선생님이 열면 저절로 넘어가요');
        }, true);
        document.addEventListener('keydown', function (e) {
            if (!GATE || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
            if (!e.target.closest || !e.target.closest('nav.steps, nav.tabs')) return;
            var keys = stepButtons().map(stepKey), i = keys.indexOf(currentStep()), j = i + (e.key === 'ArrowRight' ? 1 : -1);
            if (j >= 0 && j < keys.length && isLocked(keys[j])) { e.preventDefault(); e.stopImmediatePropagation(); gateToast('🔒 아직 잠겨 있어요 — 선생님이 열면 저절로 넘어가요'); }
        }, true);
        function stageChanged(stage, setup) {
            if (!cls.info) return;
            if (setup && JSON.stringify(setup) !== JSON.stringify(cls.info.setup || null)) { cls.info.setup = setup; tellClass(); }
            var before = gateSt.prev;
            cls.info.stage = stage;
            if (stage === before) return;
            gateSt.prev = stage;
            var moved = null;
            if (before !== undefined && GATE) {
                var a = CC.stageInfo(exp, before, flowNow()), b = CC.stageInfo(exp, stage, flowNow());
                if (a && b && b.n > a.n) moved = { to: b.keys[a.n], from: a.cur };   // 새로 열린 첫 단계로
            }
            applyGate(moved);
        }
        function startGate() {
            applyFlow();
            if (gateSt.on || PHONE || !cls.info || cls.info.exp !== exp || (!GATE && typeof opts.onStage !== 'function')) return;
            gateSt.on = true;
            gateSt.prev = cls.info.stage; applyGate(null);
            var poll = function () {
                clearTimeout(gateSt.poll);
                gateSt.poll = setTimeout(function () {
                    if (document.hidden) return poll();
                    CC.classInfo(srv().url, CLASS).then(function (r) { if (r && r.ok) stageChanged(r.stage, r.setup); poll(); });
                }, (gateSt.off ? 120 : Math.max(3, Number(CFG.pollSeconds) || 5)) * 1000);
            };
            // Firestore 는 수업 문서를 실시간으로 (읽기 한 번). 못 들으면(가짜 서버 등) 몇 초마다 확인
            PCF.labStore().then(function (L) { return L.watchClassDoc ? L.watchClassDoc(srv().url, function (d) { stageChanged(d.stage, d.setup); }) : null; })
                .then(function (off) { gateSt.off = off || null; if (!off) poll(); }, function () { poll(); });
        }
        // 팀 이름으로 입장: 빈 조 자리 하나를 이 이름으로 잡는다 (이 폰은 한 팀만. 이미 팀이 있으면 그 팀으로)
        async function joinTeam(name) {
            if (!CLASS) return { ok: false, error: '선생님 QR 로 들어온 화면이 아니에요.' };
            if (!cls.info) { var s0 = await startClass(); if (!s0.ok) return s0; }   // network 는 저장소가 진짜 연결 문제일 때만 붙임
            if (cls.info.mode !== 'team') return { ok: false, error: '이 수업은 팀 이름으로 들어가는 수업이 아니에요.' };
            var r = await CC.joinTeam(srv().url, { classCode: CLASS, name: name, device: st.device });
            if (!r.ok) return r;
            cls.me = { c: CLASS, jo: Number(r.jo), num: 1, team: String(r.name || '') };
            saveMe(); renderBar(); applyMe(); tellClass();
            els.cmsg.textContent = r.again ? '이 폰은 이미 \u2018' + r.name + '\u2019 팀이에요. 그 팀으로 이어서 해요.' : '';
            return r;
        }
        if (CLASS && PRESENT) {
            // 발표용: 수업 정보만 (joinInfo 는 수업 문서 읽기 — 교사 화면과 같은 사이트라 교사 로그인 그대로)
            CC.joinInfo(srv().url, CLASS).then(function (r) {
                if (!r || !r.ok) { cls.failed = r; tellClass(); return; }
                cls.info = r; cls.me = null; tellClass(); startGate();
            });
        } else if (CLASS) {
            bar = document.createElement('div');
            bar.className = 'cs-card cs-bar';
            bar.innerHTML = '<div id="cs-cinfo"><b>🏫 수업 참여</b> <span class="cs-note">불러오는 중…</span></div>' +
                '<div class="cs-row" id="cs-cpick" hidden><label>조 <select id="cs-cjo" class="cs-in"></select></label><label>번호 <select id="cs-cnum" class="cs-in"></select></label>' +
                '<button type="button" id="cs-cjoin" class="cs-btn good">참여하기</button></div>' +
                '<div class="cs-row" id="cs-cteam" hidden><label>팀 이름 <input type="text" id="cs-tname" class="cs-in" maxlength="12" autocomplete="off" placeholder="예: 별빛 가족"></label>' +
                '<button type="button" id="cs-tjoin" class="cs-btn good">입장하기</button></div>' +
                '<div class="cs-row" id="cs-cjoined" hidden><span id="cs-cme"></span><button type="button" id="cs-cchange" class="cs-btn secondary">조·번호 바꾸기</button>' +
                (opts.phone && !PHONE ? '<button type="button" id="cs-cphone" class="cs-btn" hidden>📱 폰으로 측정하기</button>' : '') + '</div>' +
                '<div id="cs-cmsg" class="cs-note" role="status" aria-live="polite"></div>';
            var where = opts.barMount ? $q(opts.barMount) : null;
            if (where) where.appendChild(bar);
            else { var h1 = document.querySelector('h1'); if (h1) h1.insertAdjacentElement('afterend', bar); else document.body.insertBefore(bar, document.body.firstChild); }
            ['cinfo', 'cpick', 'cjo', 'cnum', 'cjoin', 'cjoined', 'cme', 'cchange', 'cmsg', 'cphone', 'cteam', 'tname', 'tjoin'].forEach(function (k) { els[k] = document.getElementById('cs-' + k); });
            els.tjoin.addEventListener('click', async function () {
                els.tjoin.disabled = true;
                var r = await joinTeam(els.tname.value);
                els.tjoin.disabled = false;
                if (!r.ok) els.cmsg.innerHTML = '⚠ ' + esc(r.error);
            });
            if (els.cphone) els.cphone.addEventListener('click', function () { openPhone(); });
            els.cjo.addEventListener('change', fillNums);
            els.cjoin.addEventListener('click', function () {
                var jo = Number(els.cjo.value), num = Number(els.cnum.value);
                if (!jo || !num) return;
                cls.me = { c: CLASS, jo: jo, num: num };
                saveMe(); renderBar(); applyMe();
                els.cmsg.textContent = '✅ ' + jo + '조 ' + num + '번으로 참여했습니다.';
            });
            els.cchange.addEventListener('click', function () {
                if (!confirm('조·번호를 다시 고를까요? (이 기기에서 잰 값은 그대로 남습니다)')) return;
                cls.me = null; clearInterval(cls.timer); saveMe(); renderBar();
            });
            startClass();
        }

        // ----- 📱 폰 연결 -----
        // 폰 쪽: 맨 위에 '노트북과 연결됨' 띠. 실험이 측정을 저장할 때 share.saved() 를 부르면 바로 보낸다
        if (PHONE) {
            var strip = document.createElement('div');
            strip.className = 'cs-card cs-phone';
            strip.innerHTML = '<div>📱 <b>노트북과 연결됨</b> · 조 <b>' + esc(PHONE.group) + '</b>' + (PHONE.jo && PHONE.num ? ' · ' + PHONE.jo + '조 ' + PHONE.num + '번' : '') +
                '<br><span class="cs-note">' + (PICK ? '여러 번 측정해 저장한 뒤, 보낼 회차를 골라 <b>📤 고른 회차 보내기</b>를 누르세요.' : '측정을 저장하면 저절로 노트북(과 선생님 화면)으로 보내요.') + '</span></div>' +
                (PICK ? '<div id="cs-runs" class="cs-runs"></div>' +
                    '<div class="cs-row"><button type="button" id="cs-rall" class="cs-btn">☑ 전체 선택</button><button type="button" id="cs-rnone" class="cs-btn">☐ 전체 해제</button>' +
                    '<button type="button" id="cs-rsend" class="cs-btn good">📤 고른 회차 보내기</button></div>' : '') +
                '<div id="cs-pmsg" class="cs-note" role="status" aria-live="polite"></div>' +
                '<div class="cs-row"><button type="button" id="cs-presend" class="cs-btn good" hidden>📤 다시 보내기</button></div>';
            var pw = opts.barMount ? $q(opts.barMount) : null;
            if (pw) pw.insertBefore(strip, pw.firstChild);
            else { var h1p = document.querySelector('h1'); if (h1p) h1p.insertAdjacentElement('afterend', strip); else document.body.insertBefore(strip, document.body.firstChild); }
            els.pmsg = document.getElementById('cs-pmsg'); els.presend = document.getElementById('cs-presend');
            els.presend.addEventListener('click', function () { send(); });
            if (PICK) {
                els.runs = document.getElementById('cs-runs'); els.rsend = document.getElementById('cs-rsend');
                document.getElementById('cs-rall').addEventListener('click', function () { setAll(true); });
                document.getElementById('cs-rnone').addEventListener('click', function () { setAll(false); });
                els.rsend.addEventListener('click', function () { sendPicked(); });
                els.runs.addEventListener('change', function (e) {
                    var id = e.target.getAttribute('data-id'); if (id == null || !st.runs[id]) return;
                    if (e.target.type === 'checkbox') st.runs[id].sel = e.target.checked;
                    else st.runs[id].memo = String(e.target.value || '').replace(/[|\u0000-\u001f]/g, ' ').trim().slice(0, 30);
                    saveSt(); renderRuns();
                });
                els.runs.addEventListener('click', function (e) {
                    var b = e.target.closest('[data-del]'); if (!b) return;
                    var id = b.getAttribute('data-del'), r = st.runs[id];
                    if (!window.confirm('이 회차를 지울까요?' + (r && r.sig ? ' (노트북·선생님 화면에서도 빠져요)' : ''))) return;
                    var wasSent = !!(r && r.sig);
                    try { opts.deleteItem(id); } catch (err) { /* 실험 쪽 오류 */ }
                    delete st.runs[id]; saveSt(); renderRuns();
                    if (wasSent && groupOk()) send(null, []);   // 보낸 회차였으면 시트의 그 줄도 비움
                });
                renderRuns();
            }
        }
        // ----- 📱 폰 회차 목록 (여러 번 재고 골라 보내기) -----
        function itemSig(it) {   // 내용이 바뀌었는지 알아보는 짧은 지문
            var s = JSON.stringify([it.title, it.n, it.summary || {}, it.data === undefined ? '' : it.data]), h = 0;
            for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
            return s.length + ':' + h;
        }
        function syncRuns() {   // 실험의 회차와 목록 맞추기: 새 회차는 골라 둔 상태로
            var items = opts.getItems ? (opts.getItems() || []) : [], seen = {};
            items.forEach(function (it) {
                var id = String(it.id); seen[id] = 1;
                if (!st.runs[id]) st.runs[id] = { sel: true, memo: '', at: it.at || new Date().toISOString(), sig: '' };
            });
            Object.keys(st.runs).forEach(function (id) { if (!seen[id]) delete st.runs[id]; });
            return items;
        }
        function markSent(rowIds) {
            (opts.getItems ? (opts.getItems() || []) : []).forEach(function (it) {
                var r = st.runs[String(it.id)];
                if (r && rowIds.indexOf(rowId(st.device, it.id)) >= 0) { r.sig = itemSig(it); r.sel = false; }   // 보낸 것은 고르기 풀기 → 남은 것 = 못 보낸 것
            });
            saveSt();
        }
        function fmtNum(v) { var x = Number(v); return isFinite(x) && typeof v !== 'string' ? (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 1 ? x.toFixed(2) : x.toPrecision(3)) : String(v); }
        function renderRuns() {
            if (!els.runs) return;
            var items = syncRuns(); saveSt();
            var picked = items.filter(function (it) { return st.runs[String(it.id)].sel; }).length;
            els.rsend.textContent = '📤 고른 회차 보내기 (' + picked + '개)';
            els.rsend.disabled = !picked || run.busy;
            if (!items.length) { els.runs.innerHTML = '<p class="cs-note">아직 저장한 회차가 없어요. 측정하고 저장하면 여기에 1회, 2회… 로 쌓여요 (새로고침해도 남아요).</p>'; return; }
            els.runs.innerHTML = items.map(function (it, k) {
                var id = String(it.id), r = st.runs[id];
                var at = new Date(r.at), when = isNaN(at) ? '' : at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                var sum = Object.keys(it.summary || {}).slice(0, 3).map(function (k2) { return esc(k2) + ' ' + esc(fmtNum(it.summary[k2])); }).join(' · ');
                var state = !r.sig ? '<span class="cs-rst">보내기 전</span>' : r.sig === itemSig(it) ? '<span class="cs-rst ok">✅ 보냄</span>' : '<span class="cs-rst warn">✏️ 바뀜 · 다시 보내기</span>';
                return '<div class="cs-run' + (r.sel ? ' on' : '') + '"><label class="cs-rchk"><input type="checkbox" data-id="' + esc(id) + '"' + (r.sel ? ' checked' : '') + '> <b>' + esc(it.title || ((k + 1) + '회')) + '</b></label> ' + state +
                    '<div class="cs-note">' + esc(when) + (it.n != null ? ' · ' + esc(it.n) + '점' : '') + (sum ? ' · ' + sum : '') + '</div>' +
                    '<div class="cs-row"><input type="text" class="cs-memo" data-id="' + esc(id) + '" maxlength="30" placeholder="메모 (선택, 예: 손에 들고)" value="' + esc(r.memo || '') + '" aria-label="' + esc(it.title || '') + ' 메모">' +
                    (typeof opts.deleteItem === 'function' ? '<button type="button" class="cs-btn" data-del="' + esc(id) + '" aria-label="' + esc(it.title || '') + ' 지우기">🗑</button>' : '') + '</div></div>';
            }).join('');
        }
        function setAll(on) { syncRuns(); Object.keys(st.runs).forEach(function (id) { st.runs[id].sel = on; }); saveSt(); renderRuns(); }
        function sendPicked() {
            syncRuns();
            var ids = Object.keys(st.runs).filter(function (id) { return st.runs[id].sel; });
            if (!ids.length) { els.pmsg.innerHTML = '⚠ 보낼 회차에 체크하세요.'; els.pmsg.classList.add('cs-err'); return Promise.resolve({ ok: false }); }
            return send(null, ids);
        }
        if (typeof opts.onRole === 'function') opts.onRole(role);
        // 노트북 쪽: QR 창
        var dlg = null;
        function siteRoot() { var h = location.href.split('#')[0].split('?')[0]; var i = h.indexOf('/projects/'); return i >= 0 ? h.slice(0, i + 1) : h.replace(/[^/]*$/, ''); }
        function phoneLink() {
            var base = opts.phone && typeof opts.phone === 'object' && opts.phone.page ? siteRoot() + String(opts.phone.page).replace(/^\/+/, '') : location.href.split('#')[0];
            return phoneUrl(base, { group: st.group, scriptId: srv().id || '', classCode: CLASS && cls.me ? CLASS : '', jo: cls.me && cls.me.jo, num: cls.me && cls.me.num });
        }
        function ensureQr() {
            if (typeof window.qrcode === 'function') return Promise.resolve(true);
            return new Promise(function (res) {
                var sc = document.createElement('script');
                sc.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
                sc.onload = function () { res(typeof window.qrcode === 'function'); }; sc.onerror = function () { res(false); };
                document.head.appendChild(sc);
            });
        }
        async function openPhone() {
            if (SOLO) autoGroup();   // 수업 없이 연 화면: 이 노트북·폰 짝 공간을 저절로
            if (!groupOk()) { setStatus('먼저 조 코드를 정하세요. 그다음 📱 폰으로 측정하기를 누르면 폰용 QR 이 나와요.', true); if (els.share) els.share.open = true; return; }
            var link = phoneLink();
            if (!dlg) {
                dlg = document.createElement('div');
                dlg.className = 'cs-dlg'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-label', '폰으로 측정하기 QR');
                dlg.innerHTML = '<div class="cs-dlg-in"><h2>📱 폰으로 측정하기</h2><p class="cs-note">폰 카메라로 QR 을 찍으면 측정 화면이 이 조(<b id="cs-dgroup"></b>)로 열려요. 폰에서 측정을 저장하면 몇 초 안에 이 노트북에 들어와요.</p>' +
                    '<div id="cs-qr" class="cs-qr"></div><p class="cs-link"><a id="cs-plink" target="_blank" rel="noopener"></a></p>' +
                    '<div class="cs-row"><button type="button" id="cs-pcopy" class="cs-btn secondary">🔗 주소 복사</button><button type="button" id="cs-pclose" class="cs-btn">닫기</button></div></div>';
                document.body.appendChild(dlg);
                document.getElementById('cs-pclose').addEventListener('click', function () { dlg.hidden = true; });
                document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dlg) dlg.hidden = true; });
                document.getElementById('cs-pcopy').addEventListener('click', async function () {
                    var b = document.getElementById('cs-pcopy');
                    try { await navigator.clipboard.writeText(document.getElementById('cs-plink').href); b.textContent = '✅ 복사함'; } catch (e) { prompt('아래 주소를 복사하세요.', document.getElementById('cs-plink').href); }
                    setTimeout(function () { b.textContent = '🔗 주소 복사'; }, 1500);
                });
            }
            document.getElementById('cs-dgroup').textContent = st.group;
            var a = document.getElementById('cs-plink'); a.href = link; a.textContent = link;
            dlg.hidden = false;
            document.getElementById('cs-pclose').focus();
            var ok = await ensureQr(), box = document.getElementById('cs-qr');
            if (ok) { var qr = window.qrcode(0, 'M'); qr.addData(link); qr.make(); box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true }); }
            else box.innerHTML = '<p class="cs-note">QR 을 만드는 도구를 불러오지 못했어요(인터넷 확인). 아래 주소를 폰에서 열어도 돼요.</p>';
            // 폰에서 오는 측정을 받도록 자동 불러오기를 켬
            if (!st.auto) { st.auto = true; saveSt(); }
            render(); pull(true);
        }
        if (els.phone) els.phone.addEventListener('click', function () { openPhone(); });
        // 📱 노트북 화면의 '폰으로 측정해 보내기' 카드 (폰 측정 · 노트북 분석 이원화, AGENTS.md UI 규칙)
        //  share.phoneCard(자리): QR 을 대화창 없이 그 자리에 크게. 조 코드가 없으면 이 노트북용 조 코드를 저절로 만든다
        //  (반·조를 넣어 두었으면 그 반·조로, 없으면 99반 아무 조). 수업(?c=)이면 수업 참여 뒤에 나온다.
        var cardEl = null, cardBusy = false;
        function autoGroup() {
            if (groupOk() || CLASS) return groupOk();
            var code = PCF.makeGroupCode(st.ban, st.jo) || PCF.makeGroupCode(99, 1 + Math.floor(Math.random() * 99));
            // 이 노트북과 폰만 쓰는 짝 공간 (남이 조 코드를 맞혀도 못 봄). 폰 QR 에 담김
            setGroup(code, true, newPairSpace(opts.random));
            return groupOk();
        }
        function renderCard() {
            if (!cardEl || cardBusy) return;
            cardBusy = true;
            try { return drawCard(); } finally { cardBusy = false; }
        }
        function drawCard() {
            if (PHONE) { cardEl.hidden = true; return; }
            cardEl.hidden = false;
            if (CLASS && !cls.me) { cardEl.innerHTML = '<p class="cs-note">위 🏫 수업 참여에서 조·번호를 고르면 폰용 QR 이 나와요.</p>'; return; }
            // 카드가 안 보이면(태블릿·폰에서 .show-on-laptop 등) 조 코드를 저절로 만들지 않음 — 보이게 되면('이 기기' 바꿈) 그때
            if (!cardEl.getClientRects().length) { cardEl.dataset.link = ''; return; }
            if (!autoGroup()) return;
            var link = phoneLink();
            if (cardEl.dataset.link === link && document.getElementById('cs-cardqr')) return;
            cardEl.dataset.link = link;
            cardEl.innerHTML = '<div class="cs-pcard"><div class="cs-qr" id="cs-cardqr"></div><div class="cs-pcard-txt">' +
                '<p><b>폰 카메라로 QR 을 찍으세요.</b> 폰에서 측정하고 보낼 회차를 골라 📤 보내면 몇 초 안에 이 노트북에 들어와요.</p>' +
                '<p class="cs-note">조 코드 <b>' + esc(st.group) + '</b> · <a target="_blank" rel="noopener" href="' + esc(link) + '">폰 주소</a></p>' +
                '<p class="cs-note" id="cs-cardst">⏳ 폰에서 오는 측정을 기다리는 중</p></div></div>';
            if (!st.auto) { st.auto = true; saveSt(); render(); }
            pull(true);
            ensureQr().then(function (ok) {
                var box = document.getElementById('cs-cardqr');
                if (!box || cardEl.dataset.link !== link) return;
                if (ok) { var qr = window.qrcode(0, 'M'); qr.addData(link); qr.make(); box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true }); }
                else box.innerHTML = '<p class="cs-note">QR 도구를 불러오지 못했어요(인터넷 확인). 위 폰 주소를 폰에서 열어도 돼요.</p>';
            });
        }
        function phoneCard(where) {
            if (PRESENT) { var pe = typeof where === 'string' ? document.querySelector(where) : where; if (pe) pe.hidden = true; return null; }
            if (!cardEl) window.addEventListener('lab-device', function () { setTimeout(renderCard, 0); });
            cardEl = typeof where === 'string' ? document.querySelector(where) : where;
            // 단계 탭·접기 안에 있어 처음엔 안 보이다가 보이게 되면 그때 그림
            if (cardEl && typeof ResizeObserver === 'function') new ResizeObserver(function () { if (cardEl.getClientRects().length && !cardEl.dataset.link) renderCard(); }).observe(cardEl);
            if (cardEl) cardEl.classList.add('cs-card', 'cs-phonecard');
            renderCard();
            return cardEl;
        }
        function notifyPhone(n) {
            if (typeof opts.onPhoneData === 'function') { try { opts.onPhoneData(n); } catch (e) { /* 무시 */ } }
            var cst = document.getElementById('cs-cardst'); if (cst) cst.innerHTML = '🆕 <b>폰에서 새 측정 ' + n + '개</b>가 들어왔어요!';
            if (dlg && !dlg.hidden) { var p = dlg.querySelector('.cs-note'); if (p) p.innerHTML = '🆕 <b>폰에서 새 측정 ' + n + '개</b>가 들어왔어요! 창을 닫고 표를 보세요.'; }
        }

        render();
        if (groupOk() && st.auto && !CLASS && mount) pull(true);
        if (groupOk() && typeof opts.onGroup === 'function' && !CLASS) opts.onGroup(st.group);
        var api = {
            send: send, pull: pull, render: render, beat: beat,
            role: function () { return role; }, solo: function () { return SOLO; }, isPhone: function () { return !!PHONE; }, isPresent: function () { return PRESENT; },
            openPhone: openPhone, phoneLink: phoneLink, phoneCard: phoneCard,
            // 실험이 측정 하나를 저장했을 때 부른다: 폰 화면(또는 autoSendOnSave)이면 바로 보내기
            // 폰은 기본으로 회차 목록에 쌓기만 하고(고른 회차 보내기), autoSendOnSave: true 면 바로 보낸다
            saved: function () {
                if (PICK) { renderRuns(); els.pmsg.classList.remove('cs-err'); els.pmsg.innerHTML = '💾 저장했어요. 보낼 회차에 체크하고 <b>📤 고른 회차 보내기</b>를 누르세요.'; return Promise.resolve({ ok: true, skipped: true, listed: true }); }
                return (PHONE || opts.autoSendOnSave) && groupOk() ? send() : Promise.resolve({ ok: true, skipped: true });
            },
            sendPicked: function () { return PICK ? sendPicked() : send(); },
            runs: function () { return st.runs; },
            stepChanged: function () { beat(false); },
            setGroup: setGroup,
            group: function () { return st.group; }, device: function () { return st.device; },
            classCode: function () { return CLASS; }, me: function () { return cls.me; },
            // 팀 이름 수업: 수업 정보(행사 설정 포함)·입장·다시 연결(인터넷이 끊겼다가 돌아왔을 때)·선생님 설정 새로 받기
            classInfo: function () { return cls.info; }, classFailed: function () { return cls.failed || null; },
            openSteps: openSteps,   // 선생님이 연 단계 목록 (null = 모두 열림·잠금 없음)
            joinTeam: joinTeam,
            reconnect: function () { return CLASS && !cls.info ? startClass() : Promise.resolve(cls.info ? Object.assign({ ok: true }, cls.info) : { ok: false }); },
            refreshClass: async function () {
                if (!CLASS) return { ok: false };
                var r = await CC.classInfo(srv().url, CLASS);
                if (r.ok && cls.info) { cls.info.setup = r.setup; tellClass(); } else if (r.ok) startedClass(r);
                return r;
            },
            server: function () { return srv(); }, state: function () { return st; }
        };
        EXPORTS.current = api;   // 다른 부품(js/report-ai.js 보고서 AI)이 이 페이지의 수업·조 자리를 알 수 있게
        return api;
    }

    var EXPORTS = { init: init, buildPayloads: buildPayloads, incomingFrom: incomingFrom, rowId: rowId, newDeviceId: newDeviceId, deviceLabel: deviceLabel, fixState: fixState,
        isPhoneDevice: isPhoneDevice, newPairSpace: newPairSpace, readPhoneParams: readPhoneParams, phoneUrl: phoneUrl, current: null };
    return EXPORTS;
});
