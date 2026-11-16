/* 수업 참여 · 조 공유 공통 부품 (모든 실험 페이지용, 교사·학생 구글 로그인 없이)
   - '🏫 수업 참여' 띠: 주소에 ?c=수업코드 가 있으면 조·번호(이름 없음)를 고르게 하고, 그 조의 조 코드를 정한다
   - '👥 조 공유' 칸: 조 코드 → 📤 선생님께 보내기 · 📥 불러오기(몇 초마다 자동) · (있으면) 📂 CSV 불러오기
   - 하트비트: 단계를 바꿀 때·보낼 때·1분마다 선생님 시트에 보고 있는 단계·잰 점 수·보냄 여부
   서버는 선생님 시트의 Apps Script(apps-script/Code.gs 6판, 공용 submissions 시트). 사용법: docs/class-share.md
   필요한 파일(이 순서로): js/pendulum-config.js, js/pendulum-cloud.js, js/class-cloud.js, js/class-share.js, css/class-share.css

   const share = ClassShare.init({
       exp: 'idealgas',                       // 실험 이름 (js/class-cloud.js 의 EXPS)
       barMount: '#class-bar',                // 수업 참여 띠를 넣을 곳 (없으면 첫 h1 바로 뒤)
       shareMount: '#share',                  // 조 공유 칸을 넣을 곳 (없으면 띠만)
       getItems: () => [{ id, title, n, summary, data }],   // 이 노트북이 직접 잰 것 (보낼 것)
       onIncoming: (items) => true|false,     // 같은 조 다른 노트북이 보낸 것 → 표에 합치고 바뀌었으면 true
       getStep: () => 'data', getPoints: () => 12,
       ...선택: onGroup(code), pollWhen(), csvImport(files), incomingCount(), clearIncoming(), store, send, pull
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

    function newDeviceId(random) {
        var R = typeof random === 'function' ? random : Math.random, s = 'n';
        for (var i = 0; i < 6; i++) s += 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(R() * 32)];
        return s;
    }
    function deviceLabel(device) { return '노트북 ' + String(device || '').slice(-4).toUpperCase(); }
    // 시트 한 줄의 id: 노트북 번호 + 실험이 정한 id (서버 규칙 ^[A-Za-z0-9_-]{6,40}$)
    function rowId(device, itemId) {
        var x = String(itemId == null ? '' : itemId).replace(/[^A-Za-z0-9_-]/g, '');
        var s = (String(device) + '-' + (x || 'item')).slice(0, 40);
        return ID_RE.test(s) ? s : null;
    }
    function fixState(st) {
        st = Object.assign({ group: '', ban: '', jo: '', device: '', auto: true, sent: [] }, st || {});
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
        (o.items || []).forEach(function (it) {
            var id = rowId(o.device, it.id);
            if (!id || seen[id]) return;
            seen[id] = true;
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
        var store = opts.store || {
            load: function () { try { return JSON.parse((LS && LS.getItem(KEY)) || 'null'); } catch (e) { return null; } },
            save: function (o) { try { LS.setItem(KEY, JSON.stringify(o)); } catch (e) { /* 저장 불가 */ } }
        };
        var st = fixState(store.load());
        function saveSt() { store.save(st); }
        saveSt();
        var SERVER = PCF.resolveServer(location.search, CFG.appsScriptUrl || '', LS, true);
        var pollSec = function () { return Math.max(3, Number(CFG.pollSeconds) || 5) * (run.fails >= 3 ? 3 : 1); };
        var run = { busy: false, pulling: false, lastOk: null, fails: 0, timer: null };
        var timeText = function (d) { return d ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''; };
        var groupOk = function () { return PCF.isGroupCode(st.group); };
        var els = {};

        // ----- 조 공유 칸 -----
        var mount = opts.shareMount ? $q(opts.shareMount) : null;
        if (mount) {
            mount.innerHTML =
                '<details class="cs-card cs-share" id="cs-share"><summary>👥 조 공유: 선생님께 보내기 · 다른 노트북에서 불러오기 <span class="cs-note" id="cs-sum"></span></summary>' +
                '<p class="cs-note">같은 조 노트북 여러 대가 같은 <b>조 코드</b>를 넣으면, 한 노트북이 보낸 측정값을 다른 노트북에서 불러와 합칩니다. 보낸 값은 선생님 구글 시트에도 저장됩니다. 이름·학번은 보내지 않습니다.</p>' +
                '<div class="cs-row"><label>반 <input type="number" id="cs-ban" min="1" max="99" inputmode="numeric" class="cs-in cs-num"></label>' +
                '<label>조 <input type="number" id="cs-jo" min="1" max="99" inputmode="numeric" class="cs-in cs-num"></label>' +
                '<button type="button" id="cs-make" class="cs-btn secondary">🎲 새 조 코드 만들기</button></div>' +
                '<div class="cs-row"><label>조 코드 <input type="text" id="cs-group" placeholder="예: 2-3-4821" inputmode="numeric" autocomplete="off" class="cs-in cs-code"></label>' +
                '<span class="cs-note">같은 조의 다른 노트북에는 이 코드를 그대로 넣으세요.</span></div>' +
                '<div class="cs-row"><button type="button" id="cs-send" class="cs-btn good">📤 선생님께 보내기</button>' +
                '<button type="button" id="cs-pull" class="cs-btn secondary">📥 불러오기</button>' +
                '<label class="cs-check"><input type="checkbox" id="cs-auto"> 몇 초마다 자동으로 불러오기</label></div>' +
                '<div id="cs-status" class="cs-note" role="status" aria-live="polite"></div>' +
                '<div class="cs-row" id="cs-extra">' +
                (opts.csvImport ? '<label class="cs-btn secondary cs-file">📂 CSV 불러오기<input type="file" id="cs-csv" accept=".csv,text/csv" multiple hidden></label>' : '') +
                (opts.clearIncoming ? '<button type="button" id="cs-clear" class="cs-btn danger">불러온 값 지우기</button>' : '') + '</div>' +
                '<p class="cs-note">이 노트북에서 직접 잰 값만 보내므로, 값을 잰 노트북마다 한 번씩 보내세요. 다시 보내면 같은 줄을 고쳐 씁니다.<br>' +
                '학교 인터넷에서 보내기가 안 되면: ' + esc(opts.csvHint || '이 페이지의 CSV 저장') + ' 파일을 다른 노트북으로 옮기고, 선생님께는 CSV 파일로 내세요.</p>' +
                '<p class="cs-note" id="cs-server"></p></details>';
            ['share', 'sum', 'ban', 'jo', 'make', 'group', 'send', 'pull', 'auto', 'status', 'csv', 'clear', 'server'].forEach(function (k) { els[k] = document.getElementById('cs-' + k); });
            if (!groupOk()) els.share.open = true;
        }
        function setStatus(html, err) { if (!els.status) return; els.status.innerHTML = html; els.status.classList.toggle('cs-err', !!err); }
        function incoming() { return typeof opts.incomingCount === 'function' ? opts.incomingCount() : 0; }
        function render() {
            if (!mount) return;
            if (document.activeElement !== els.group) els.group.value = st.group;
            if (document.activeElement !== els.ban) els.ban.value = st.ban;
            if (document.activeElement !== els.jo) els.jo.value = st.jo;
            els.auto.checked = st.auto;
            var ok = groupOk();
            els.send.disabled = els.pull.disabled = !ok || run.busy;
            (opts.sendButtons || []).forEach(function (b) { b = $q(b); if (b) b.disabled = run.busy; });
            var ext = incoming();
            if (els.clear) els.clear.disabled = !ext;
            els.sum.textContent = ok ? '— 조 ' + st.group + (ext ? ' · 불러온 값 ' + ext + '개' : '') : '— 조 코드 없음';
            els.server.textContent = !SERVER.url ? '⚠ 선생님 설정이 아직 안 되어 보내기·불러오기를 쓸 수 없습니다. CSV 로 주고받으세요.'
                : '보낼 곳: ' + (SERVER.from === 'link' ? '링크로 받은 선생님 시트' : SERVER.from === 'saved' ? '이 브라우저가 기억한 선생님 시트' : '사이트 기본 선생님 시트') + ' · 이 노트북: ' + deviceLabel(st.device);
            if (!ok && !els.status.textContent) setStatus('반·조를 넣고 <b>🎲 새 조 코드 만들기</b>를 누르거나, 같은 조 노트북의 조 코드를 넣으세요.');
            schedule();
        }
        function setGroup(code, quiet) {
            var g = PCF.normalizeGroup(code);
            if (g !== st.group) { st.group = g; st.sent = []; }
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
            if (els.csv) els.csv.addEventListener('change', async function (e) {
                var files = Array.prototype.slice.call(e.target.files || []);
                e.target.value = '';
                var r = await opts.csvImport(files);
                if (r) setStatus(r.html || '', !!r.error);
                render();
            });
            if (els.clear) els.clear.addEventListener('click', function () {
                var n = incoming();
                if (!n || !confirm('다른 노트북·CSV 에서 불러온 값 ' + n + '개를 이 노트북에서 지울까요? (이 노트북에서 잰 값과 선생님 시트는 그대로입니다)' + (st.auto ? '\n자동 불러오기는 끕니다.' : ''))) return;
                opts.clearIncoming();
                st.auto = false; saveSt(); render();
                setStatus('불러온 값을 지웠습니다. 다시 합치려면 📥 불러오기를 누르세요.');
            });
        }

        // ----- 보내기 -----
        function defaultSend(ctx) {
            var b = buildPayloads({ exp: exp, group: ctx.group, device: ctx.device, items: opts.getItems ? opts.getItems() : [], sent: ctx.sent, isGroupCode: PCF.isGroupCode });
            if (b.error) return Promise.resolve({ ok: false, error: b.error });
            var done = 0, ids = [], big = b.payloads.filter(function (p) { return p.tooBig; }).length;
            return b.payloads.reduce(function (pr, pl) {
                return pr.then(function (prev) {
                    if (prev && !prev.ok) return prev;
                    ctx.progress(done + 1, b.payloads.length);
                    var body = Object.assign({}, pl); delete body.tooBig;
                    return PCF.save(ctx.url, body).then(function (r) { if (r.ok) { done++; if (pl.n > 0) ids.push(pl.id); } return r; });
                });
            }, Promise.resolve(null)).then(function (last) {
                return last && !last.ok ? { ok: false, error: last.error, done: done, ids: ids } : { ok: true, done: done, ids: ids, note: big ? '자료가 너무 커서 ' + big + '개는 요약만 보냈습니다 (CSV 로 내세요).' : '' };
            });
        }
        async function send(statusEl) {
            var show = function (html, err) { setStatus(html, err); if (statusEl) $q(statusEl).innerHTML = html; };
            if (!groupOk()) { show('⚠ 먼저 조 코드를 정하세요' + (mount ? ' (👥 조 공유).' : '.'), true); return { ok: false }; }
            if (run.busy) { show('📤 이미 보내는 중이에요. 끝나면 결과가 여기에 나와요.'); return { ok: false, busy: true }; }
            run.busy = true; render();
            // 불러오기가 도는 중이면 (조 코드를 넣은 직후 등) 끝날 때까지 기다렸다가 이어서 보낸다
            if (run.pulling && run.pullDone) { show('📥 불러오는 중이라, 끝나면 바로 보낼게요…'); await run.pullDone; }
            var ctx = { url: SERVER.url, group: st.group, device: st.device, sent: st.sent.slice(), exp: exp,
                progress: function (i, n) { show('📤 보내는 중… (' + i + '/' + n + ')'); } };
            var r = await (opts.send || defaultSend)(ctx);
            run.busy = false; run.sentAt = Date.now();
            (r.ids || []).forEach(function (id) { if (st.sent.indexOf(id) < 0) st.sent.push(id); });
            if (r.ok && r.done === 0 && !(r.ids || []).length) { /* 아무것도 안 보냄 */ }
            saveSt();
            if (!r.ok) show('⚠ ' + (r.done ? '일부만 보냈습니다 (' + r.done + '개). ' : '보내지 못했습니다: ') + esc(r.error) + '<br>다시 눌러 보고, 계속 안 되면 ' + esc(opts.csvHint || 'CSV 저장') + ' 파일을 선생님께 내세요.', true);
            else { show('✅ 선생님 시트로 보냈습니다: ' + esc(r.label || ('측정 ' + (r.ids || []).length + '개')) + ' (' + timeText(new Date()) + '). 같은 조의 다른 노트북에서 📥 불러오기를 누르면 합쳐집니다.' + (r.note ? '<br>' + esc(r.note) : '')); beat(true); }
            render();
            return r;
        }

        // ----- 불러오기 -----
        function defaultPull(ctx) {
            return PCF.list(ctx.url + (ctx.url.indexOf('?') >= 0 ? '&' : '?') + 'exp=' + encodeURIComponent(exp), ctx.group).then(function (r) {
                if (!r.ok) return r;
                var items = incomingFrom(r.items, ctx.device);
                var changed = opts.onIncoming ? !!opts.onIncoming(items) : false;
                var others = {}; items.forEach(function (x) { others[x.device] = 1; });
                return { ok: true, changed: changed, others: Object.keys(others).length, points: items.reduce(function (n, x) { return n + x.n; }, 0) };
            });
        }
        async function pull(quiet) {
            if (!groupOk() || run.pulling) return;
            if (!SERVER.url) { if (!quiet) setStatus('⚠ 선생님 설정이 아직 안 되었습니다. CSV 로 주고받으세요.', true); return; }
            if (run.busy && quiet) { schedule(); return; }   // 보내는 중에는 자동 불러오기를 미룸
            run.pulling = true;
            if (!quiet) setStatus('📥 불러오는 중…');
            var group = st.group, finish;
            run.pullDone = new Promise(function (res) { finish = res; });
            var r;
            try { r = await (opts.pull || defaultPull)({ url: SERVER.url, group: group, device: st.device, exp: exp }); }
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
            if (!keepMsg || r.changed) setStatus((r.changed ? '🆕 다른 노트북의 값을 합쳤습니다' : '🟢 연결됨') + ' · 같은 조의 다른 노트북 ' + (r.others || 0) + '대, 불러온 값 ' + (r.points || 0) + '개' +
                (r.newItems ? ', 새 항목 ' + r.newItems + '개' : '') + ' <span class="cs-note">(마지막 확인 ' + timeText(run.lastOk) + (st.auto ? ', ' + pollSec() + '초마다 확인' : '') + ')</span>');
            render();
        }
        function schedule() {
            clearTimeout(run.timer); run.timer = null;
            if (!mount || !st.auto || !groupOk() || !SERVER.url) return;
            run.timer = setTimeout(function () {
                var when = typeof opts.pollWhen === 'function' ? opts.pollWhen() : true;
                if (!document.hidden && when) pull(true); else schedule();
            }, pollSec() * 1000);
        }

        // ----- 수업 참여 띠 (?c=) -----
        var CLASS = CC.readClassParam(location.search);
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
            if (!CLASS || !cls.me || !cls.info || !SERVER.url) return;
            var now = Date.now(), wait = 5000 - (now - cls.lastBeat);
            // 탭을 빨리 넘길 때 너무 자주 보내지 않게: 5초 안이면 조금 뒤에 마지막 단계로 한 번만
            if (!force && wait > 0) { if (!cls.pending) cls.pending = setTimeout(function () { cls.pending = null; beat(true); }, wait); return; }
            clearTimeout(cls.pending); cls.pending = null;
            cls.lastBeat = now;
            var submitted = typeof opts.getSubmitted === 'function' ? !!opts.getSubmitted() : st.sent.length > 0;
            CC.heartbeat(SERVER.url, { classCode: CLASS, jo: cls.me.jo, num: cls.me.num, step: opts.getStep ? opts.getStep() : '',
                points: opts.getPoints ? opts.getPoints() : '', submitted: submitted, device: st.device })
                .then(function (r) { els.cmsg.innerHTML = r.ok ? '' : '⚠ 선생님께 진행 상황을 보내지 못했습니다: ' + esc(r.error); });
        }
        function renderBar() {
            if (!bar) return;
            var i = cls.info, me = cls.me;
            if (!i) return;
            var e = CC.expInfo(i.exp), wrong = i.exp !== exp;
            els.cinfo.innerHTML = '<b>🏫 ' + esc(i.ban) + '반 수업</b> <span class="cs-note">수업 코드 ' + esc(i.classCode) + (e ? ' · ' + esc(e.name) : '') + '</span>';
            if (wrong) {
                var url = e ? new URL('../' + e.page, location.href) : null;
                if (url) { url.searchParams.set('c', CLASS); if (SERVER.id && SERVER.from !== 'default') url.searchParams.set('s', SERVER.id); }
                els.cpick.hidden = true; els.cjoined.hidden = true;
                els.cmsg.innerHTML = '⚠ 이 수업은 <b>' + esc(e ? e.name : i.exp) + '</b> 수업입니다.' + (url ? ' <a href="' + esc(url.href) + '">그 실험 페이지로 가기 →</a>' : '');
                return;
            }
            els.cpick.hidden = !!me; els.cjoined.hidden = !me;
            if (me) {
                var g = CC.groupFor(i, me.jo);
                els.cme.innerHTML = '나: <b>' + esc(me.jo) + '조 ' + esc(me.num) + '번</b> <span class="cs-note">· 조 코드 ' + esc(g ? g.code : '') + ' · 측정값은 조원·선생님과 자동으로 나눠요</span>';
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
            st.auto = true;
            if (st.group !== g.code) setGroup(g.code, true);
            else { saveSt(); if (typeof opts.onGroup === 'function') opts.onGroup(g.code); render(); if (mount) pull(true); }
            beat(true);
            clearInterval(cls.timer);
            cls.timer = setInterval(function () { if (!document.hidden) beat(true); }, 60000);
        }
        async function startClass() {
            var r = await CC.joinInfo(SERVER.url, CLASS);
            if (!r.ok) {
                els.cinfo.innerHTML = '<b>🏫 수업 참여</b>';
                els.cmsg.innerHTML = '⚠ ' + esc(r.error) + '<br>수업 없이 측정은 그대로 할 수 있습니다' + (mount ? '. 조 공유에 조 코드를 직접 넣어도 됩니다.' : '.');
                return;
            }
            cls.info = r;
            cls.me = r.exp === exp ? loadMe() : null;
            if (cls.me && !CC.groupFor(r, cls.me.jo)) cls.me = null;
            renderBar();
            if (cls.me) applyMe();
        }
        if (CLASS) {
            bar = document.createElement('div');
            bar.className = 'cs-card cs-bar';
            bar.innerHTML = '<div id="cs-cinfo"><b>🏫 수업 참여</b> <span class="cs-note">불러오는 중…</span></div>' +
                '<div class="cs-row" id="cs-cpick" hidden><label>조 <select id="cs-cjo" class="cs-in"></select></label><label>번호 <select id="cs-cnum" class="cs-in"></select></label>' +
                '<button type="button" id="cs-cjoin" class="cs-btn good">참여하기</button></div>' +
                '<div class="cs-row" id="cs-cjoined" hidden><span id="cs-cme"></span><button type="button" id="cs-cchange" class="cs-btn secondary">조·번호 바꾸기</button></div>' +
                '<div id="cs-cmsg" class="cs-note" role="status" aria-live="polite"></div>';
            var where = opts.barMount ? $q(opts.barMount) : null;
            if (where) where.appendChild(bar);
            else { var h1 = document.querySelector('h1'); if (h1) h1.insertAdjacentElement('afterend', bar); else document.body.insertBefore(bar, document.body.firstChild); }
            ['cinfo', 'cpick', 'cjo', 'cnum', 'cjoin', 'cjoined', 'cme', 'cchange', 'cmsg'].forEach(function (k) { els[k] = document.getElementById('cs-' + k); });
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
            if (!SERVER.url) els.cmsg.textContent = '⚠ 선생님 시트 주소가 없습니다. 선생님이 보여 준 QR 로 다시 들어오세요.';
            else startClass();
        }

        render();
        if (groupOk() && st.auto && !CLASS && mount) pull(true);
        if (groupOk() && typeof opts.onGroup === 'function' && !CLASS) opts.onGroup(st.group);
        return {
            send: send, pull: pull, render: render, beat: beat,
            stepChanged: function () { beat(false); },
            setGroup: setGroup,
            group: function () { return st.group; }, device: function () { return st.device; },
            classCode: function () { return CLASS; }, me: function () { return cls.me; },
            server: function () { return SERVER; }, state: function () { return st; }
        };
    }

    return { init: init, buildPayloads: buildPayloads, incomingFrom: incomingFrom, rowId: rowId, newDeviceId: newDeviceId, deviceLabel: deviceLabel, fixState: fixState };
});
