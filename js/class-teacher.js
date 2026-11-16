/* 수업 연결 (교사) — projects/class-teacher.html
   ① 시트 연결: 웹 앱 주소 → 연결 시험(ping, 4판 이상) → 이 브라우저에 기억 (진자·플랑크 노트북 화면과 같은 기억 칸)
   ② 수업 만들기: 반·학생 수·조별 인원 → 조 나누기 미리보기 → 서버에 수업 만들기 → 수업 코드·QR·교사 열쇠
   ③ 진행 보기: 10초마다 classStatus → 조별 카드(조원의 단계·마지막 활동·측정 점 수·제출) → 학생 하나 누르면 자세히
   교사 열쇠는 이 브라우저(localStorage)에만 두고 POST 본문으로만 보낸다. 로그인 없음. */
(function () {
    'use strict';
    var PC = window.PendulumCloud, CC = window.ClassCloud, CONFIG = window.PENDULUM_CONFIG || {};
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var STORE = null; try { STORE = window.localStorage; } catch (e) { STORE = null; }
    var LIST_KEY = 'class-teacher:v1';
    var POLL_MS = 10000;
    var server = PC.resolveServer(location.search, CONFIG.appsScriptUrl || '', STORE, true);
    var state = { classes: loadList(), watching: null, timer: null, last: null, detail: null, busy: false };

    function loadList() {
        try { var a = JSON.parse((STORE && STORE.getItem(LIST_KEY)) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
    }
    function saveList() { try { STORE.setItem(LIST_KEY, JSON.stringify(state.classes)); } catch (e) { /* 저장 불가 */ } }
    function urlOf(c) { return (c && c.scriptId && PC.urlFromScriptId(c.scriptId)) || (c && c.url) || ''; }
    function siteRoot() { return new URL('../', location.href).href; }

    var tabs = LabUI.initTabs('#ctTabs', { key: 'class-teacher', onShow: function (t) { if (t === 'watch') startWatch(); else stopWatch(); } });

    // ---------- ① 시트 연결 ----------
    function renderSheet() {
        var el = $('sheetNow');
        if (!server.url) { el.className = 'ct-status warn'; el.textContent = '⚠️ 아직 연결한 시트가 없어요. 아래에 웹 앱 주소를 넣어 주세요.'; return; }
        el.className = 'ct-status';
        el.innerHTML = '📒 지금 시트: ' + (server.from === 'default' ? '사이트 기본 시트' : '선생님 시트') +
            (server.id ? ' <span class="ct-mono">…' + esc(server.id.slice(-8)) + '</span>' : '') +
            (server.from === 'saved' ? ' (이 브라우저에 기억됨)' : server.from === 'link' ? ' (링크로 받음, 기억함)' : '');
    }
    async function testSheet(url, id, remember) {
        var msg = $('sheetMsg');
        msg.className = 'note'; msg.textContent = '⏳ 연결 시험 중…';
        var r = await CC.ping(url);
        if (!r.ok) { msg.className = 'note err'; msg.textContent = '⚠️ ' + r.error; return false; }
        var v = Number(r.version) || 0;
        if (v < CC.MIN_VERSION) {
            msg.className = 'note err';
            msg.innerHTML = '⚠️ 연결은 되지만 이 시트의 코드가 <b>' + v + '판</b>이에요. 수업 연결은 ' + CC.MIN_VERSION + '판이 필요해요: 위 <b>손으로 업데이트하는 법</b>대로 새 코드를 붙여 넣고 새 버전으로 배포하세요.';
            checkVersion(r);
            return false;
        }
        if (remember && id) {
            try { STORE.setItem(PC.SERVER_KEY, id); } catch (e) { /* 저장 불가 */ }
            server = { url: url, id: id, from: 'saved' };
        }
        msg.className = 'note'; msg.textContent = '✅ 연결됨 (' + v + '판)' + (remember ? ' · 이 브라우저가 기억해요. 진자·플랑크 노트북 화면도 이 시트를 써요.' : '');
        renderSheet();
        checkVersion(r);
        return true;
    }
    $('btnConnect').addEventListener('click', function () {
        var id = PC.scriptIdFromUrl($('sheetUrl').value);
        if (!id) { $('sheetMsg').className = 'note err'; $('sheetMsg').textContent = '⚠️ 웹 앱 주소 모양이 아니에요. https://script.google.com/macros/s/…/exec 를 통째로 붙여 넣으세요.'; return; }
        testSheet(PC.urlFromScriptId(id), id, true);
    });
    $('btnTestNow').addEventListener('click', function () { testSheet(server.url, server.id, false); });

    // ---------- 서버 판 확인 · 스스로 업데이트 (5판부터) ----------
    // 사이트의 apps-script/release.json(공식 판) 과 시트의 판(ping)을 비교한다. 관리 열쇠는 이 브라우저에 시트마다 저장
    var ADMIN_KEY = 'class-teacher:admin:v1';
    function adminMap() { try { var o = JSON.parse((STORE && STORE.getItem(ADMIN_KEY)) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
    function adminKeyOf(url) { return adminMap()[url] || ''; }
    function setAdminKey(url, key) { var m = adminMap(); m[url] = key; try { STORE.setItem(ADMIN_KEY, JSON.stringify(m)); } catch (e) { /* 저장 불가 */ } }
    var siteRelease = null;
    async function loadRelease() {
        if (siteRelease) return siteRelease;
        try { var res = await fetch('../apps-script/release.json?_=' + Date.now(), { cache: 'no-store' }); if (res.ok) siteRelease = await res.json(); } catch (e) { siteRelease = null; }
        return siteRelease;
    }
    function renderAdmin() {
        var k = server.url && adminKeyOf(server.url);
        $('adminBox').hidden = !k; $('adminKey').textContent = k || '';
    }
    async function checkVersion(ping) {
        var url = server.url;
        if (!url) return;
        // 5판인데 관리 열쇠가 아직 없으면 지금 만든다 (처음 연결한 선생님 화면이 갖는다)
        if (Number(ping.version) >= CC.UPDATE_VERSION && !ping.admin && !adminKeyOf(url)) {
            var c = await CC.claimAdmin(url);
            if (c.ok) { setAdminKey(url, c.key); ping.admin = true; }
        }
        renderAdmin();
        var rel = await loadRelease();
        var plan = CC.updatePlan(ping, rel), box = $('updBox');
        box.hidden = !plan.show;
        if (!plan.show) return;
        box.classList.toggle('warn', plan.kind === 'manual');
        $('updMsg').textContent = '';
        var needKey = plan.kind === 'update' || plan.canRollback;
        $('updKeyRow').hidden = !needKey || !!adminKeyOf(url);
        $('btnUpdate').hidden = plan.kind !== 'update';
        $('btnRollback').hidden = !plan.canRollback;
        if (ping.prevServer) $('btnRollback').textContent = '↩ ' + ping.prevServer + '판으로 되돌리기';
        $('updManual').open = plan.kind === 'manual';
        if (plan.kind === 'update') {
            $('updTitle').textContent = '🆕 새 서버 버전이 있어요 (' + plan.from + '판 → ' + plan.to + '판)';
            $('updText').textContent = '단추를 누르면 선생님 시트의 스크립트가 사이트의 공식 코드를 받아 스스로 바뀌어요. 웹 앱 주소·학생 링크·시트의 기록은 그대로예요. (30초쯤 걸려요)';
        } else if (plan.kind === 'manual') {
            $('updTitle').textContent = '🛠 서버를 ' + plan.to + '판으로 바꿔 주세요 (지금 ' + plan.from + '판)';
            $('updText').textContent = CC.UPDATE_VERSION + '판부터는 단추 하나로 스스로 업데이트돼요. 그 전에 한 번만 아래 순서대로 손으로 바꿔 주세요.';
        } else {
            $('updTitle').textContent = '✅ 서버가 최신이에요 (' + plan.from + '판)';
            $('updText').textContent = '업데이트 뒤 문제가 있으면 이전 판으로 되돌릴 수 있어요.';
        }
    }
    function currentAdminKey() {
        var k = adminKeyOf(server.url) || $('updKey').value.trim();
        if (k && !adminKeyOf(server.url)) setAdminKey(server.url, k);
        return k;
    }
    async function afterChange(expect) {
        // 배포가 바뀐 뒤 몇 번 다시 확인 (구글 쪽 반영에 몇 초 걸릴 수 있음)
        for (var i = 0; i < 4; i++) {
            await new Promise(function (r) { setTimeout(r, i ? 3000 : 1500); });
            var p = await CC.ping(server.url);
            if (p.ok && (expect == null || Number(p.version) === expect)) return p;
        }
        return CC.ping(server.url);
    }
    async function runServerChange(kind) {
        var key = currentAdminKey(), msg = $('updMsg');
        if (!key) { msg.className = 'note err'; msg.textContent = '관리 열쇠를 넣어 주세요 (처음 시트를 연결한 컴퓨터의 ① 시트 연결 → 🔑 관리 열쇠).'; $('updKeyRow').hidden = false; return; }
        if (kind === 'rollback' && !confirm('서버를 이전 판으로 되돌릴까요? 시트의 기록은 그대로예요.')) return;
        $('btnUpdate').disabled = $('btnRollback').disabled = true;
        msg.className = 'note'; msg.textContent = kind === 'update' ? '⏳ 업데이트 중… 새 코드 받기 → 확인 → 바꾸기 → 새 버전으로 배포 (창을 닫지 마세요)' : '⏳ 되돌리는 중…';
        var r = kind === 'update' ? await CC.update(server.url, key) : await CC.rollback(server.url, key);
        if (!r.ok) {
            $('btnUpdate').disabled = $('btnRollback').disabled = false;
            msg.className = 'note err';
            // 서버(8판부터)가 준 원래 오류 문구를 그대로 보여 준다. 권한 안내가 들어 있으면 손으로 하는 법도 펼쳐 둔다
            var permHint = /권한 확인 창/.test(r.error);
            msg.textContent = '⚠️ ' + r.error + (/관리 열쇠가 맞지/.test(r.error) || permHint ? '' : ' — 안 되면 아래 "손으로 업데이트하는 법"을 따라 하세요.');
            if (permHint || !/관리 열쇠가 맞지/.test(r.error)) $('updManual').open = true;
            if (/관리 열쇠가 맞지/.test(r.error)) { var m = adminMap(); delete m[server.url]; try { STORE.setItem(ADMIN_KEY, JSON.stringify(m)); } catch (e) { /* 무시 */ } $('updKeyRow').hidden = false; renderAdmin(); }
            return;
        }
        msg.textContent = '⏳ 바뀐 판을 확인하는 중…';
        var p = await afterChange(kind === 'update' ? r.to : null);
        $('btnUpdate').disabled = $('btnRollback').disabled = false;
        if (p.ok) {
            await checkVersion(p);
            $('updBox').hidden = false;
            msg.className = 'note';
            msg.textContent = '✅ ' + (kind === 'update' ? r.to + '판으로 바뀌었어요.' : '이전 판(' + p.version + '판)으로 되돌렸어요.') + ' 학생 화면은 새로고침하면 바뀐 판을 써요.';
        } else { msg.className = 'note err'; msg.textContent = '⚠️ 바꾼 뒤 연결 확인이 안 돼요: ' + p.error; }
    }
    $('btnUpdate').addEventListener('click', function () { runServerChange('update'); });
    $('btnRollback').addEventListener('click', function () { runServerChange('rollback'); });
    function copyFile(btn, path, label) {
        btn.addEventListener('click', async function () {
            try {
                var res = await fetch(path + '?_=' + Date.now(), { cache: 'no-store' });
                if (!res.ok) throw new Error(res.status);
                await navigator.clipboard.writeText(await res.text());
                $('copyCodeMsg').textContent = '✅ ' + label + ' 을 복사했어요. Apps Script 편집기에 붙여 넣으세요.';
            } catch (e) { $('copyCodeMsg').innerHTML = '복사하지 못했어요. <a href="' + path + '" target="_blank" rel="noopener">' + label + ' 열기</a>에서 모두 선택(Ctrl+A)해 복사하세요.'; }
        });
    }
    copyFile($('btnCopyCode'), '../apps-script/Code.gs', 'Code.gs');
    copyFile($('btnCopyManifest'), '../apps-script/appsscript.json', 'appsscript.json');

    // ---------- 🛠 내 서버 만들기 (구글 로그인 한 번 → 시트 + Apps Script 만들고 배포, js/server-maker.js) ----------
    // 토큰 방식(accounts.google.com/gsi/client)이라 사이트 비밀번호가 필요 없다. 클라이언트 ID 는 js/pendulum-config.js 의 googleClientId
    var SM = window.ServerMaker, CLIENT_ID = String(CONFIG.googleClientId || '');
    var MAKER_KEY = 'class-teacher:maker:v1';
    var maker = { resume: null, busy: false, poll: null };
    try { maker.resume = JSON.parse((STORE && STORE.getItem(MAKER_KEY)) || 'null'); } catch (e) { maker.resume = null; }
    function saveMaker() { try { if (maker.resume) STORE.setItem(MAKER_KEY, JSON.stringify(maker.resume)); else STORE.removeItem(MAKER_KEY); } catch (e) { /* 저장 불가 */ } }
    function mkStep(key, st, text) {
        var li = document.querySelector('#mkSteps li[data-k="' + key + '"]');
        if (!li) return;
        li.className = st;
        li.querySelector('small').textContent = text ? ' — ' + text : '';
    }
    function mkMsg(html, err) { $('mkMsg').className = 'note' + (err ? ' err' : ''); $('mkMsg').innerHTML = html; }
    function renderMaker() {
        if (!SM) return;
        $('mkSteps').innerHTML = SM.STEPS.map(function (s) { return '<li data-k="' + s[0] + '">' + esc(s[1]) + '<small></small></li>'; }).join('');
        $('mkNoClient').hidden = !!CLIENT_ID;
        $('btnMake').disabled = !CLIENT_ID;
        var r = maker.resume;
        $('btnMakeReset').hidden = !r;
        if (r && r.connected) {
            $('btnMake').textContent = '🛠 서버 하나 더 만들기';
            mkMsg('✅ 이 브라우저에서 만든 서버가 연결되어 있어요' + (r.sheetUrl ? ' · <a href="' + esc(r.sheetUrl) + '" target="_blank" rel="noopener">시트 열기</a>' : '') + '.');
        } else if (r) {
            $('btnMake').textContent = '🛠 이어서 만들기';
            $('mkSteps').hidden = false;
            ['sheet', 'project', 'code', 'version', 'deploy'].forEach(function (k) {
                var done = { sheet: r.spreadsheetId, project: r.scriptId, code: r.codeVersion, version: r.versionNumber, deploy: r.url }[k];
                if (done) mkStep(k, 'done');
            });
            if (r.url) { $('mkAllowRow').hidden = false; mkStep('allow', 'run'); mkMsg('배포까지 끝났어요. <b>🔓 권한 허용 창 열기</b>를 눌러 허용하면 자동으로 연결돼요.'); waitAllow(); }
            else mkMsg('지난번에 중간에서 멈췄어요. 단추를 누르면 이미 만든 것을 다시 써서 이어서 해요.');
        }
    }
    // 배포 뒤: 선생님이 새 탭에서 권한을 허용할 때까지 몇 초마다 연결 시험
    function waitAllow() {
        clearTimeout(maker.poll);
        var url = maker.resume && maker.resume.url, started = Date.now();
        if (!url) return;
        (async function tick() {
            var p = await CC.ping(url);
            if (p.ok && Number(p.version) > 0) { finishMaker(url, p); return; }
            if (Date.now() - started > 15 * 60 * 1000) { mkMsg('⚠️ 아직 권한 허용이 확인되지 않아요. <b>🔓 권한 허용 창 열기</b>를 다시 눌러 주세요.', true); return; }
            maker.poll = setTimeout(tick, 3000);
        })();
    }
    async function finishMaker(url, ping) {
        mkStep('allow', 'done'); mkStep('connect', 'run');
        $('mkAllowRow').hidden = true;
        var id = PC.scriptIdFromUrl(url);
        try { STORE.setItem(PC.SERVER_KEY, id); } catch (e) { /* 저장 불가 */ }
        server = { url: url, id: id, from: 'saved' };
        if (!ping.admin && !adminKeyOf(url)) {
            var c = await CC.claimAdmin(url);
            if (c.ok) { setAdminKey(url, c.key); ping.admin = true; }
        }
        mkStep('connect', 'done', ping.version + '판');
        maker.resume.connected = true; saveMaker();
        renderSheet(); renderAdmin(); checkVersion(ping);
        mkMsg('✅ 내 서버가 준비됐어요 (' + ping.version + '판). 이 브라우저가 기억해요.' + (maker.resume.sheetUrl ? ' <a href="' + esc(maker.resume.sheetUrl) + '" target="_blank" rel="noopener">시트 열기</a>' : '') + ' 이제 ② 수업 만들기로 가세요.');
        $('btnMake').textContent = '🛠 서버 하나 더 만들기';
    }
    function loadGis() {
        if (!CLIENT_ID || (window.google && google.accounts && google.accounts.oauth2) || document.getElementById('gisScript')) return;
        var sc = document.createElement('script');
        sc.id = 'gisScript'; sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.defer = true;
        sc.onerror = function () { mkMsg('⚠️ 구글 로그인 도구를 불러오지 못했어요(인터넷·학교 망 확인). 아래 손으로 만들기를 쓰세요.', true); };
        document.head.appendChild(sc);
    }
    if (SM) {
        loadGis();
        renderMaker();
        $('btnMake').addEventListener('click', async function () {
            if (maker.busy || !CLIENT_ID) return;
            if (maker.resume && maker.resume.connected) maker.resume = null;   // 하나 더 만들기
            maker.busy = true; $('btnMake').disabled = true;
            $('mkSteps').hidden = false;
            mkMsg('🔐 구글 로그인 창에서 선생님 계정을 고르고 권한 3가지를 허용해 주세요.');
            var t = await SM.requestToken(CLIENT_ID);   // 팝업은 단추를 누른 바로 그때 열린다
            if (!t.ok) { maker.busy = false; $('btnMake').disabled = false; mkMsg('⚠️ ' + esc(t.error), true); return; }
            mkMsg('⏳ 만드는 중… (창을 닫지 마세요)');
            var r = await SM.run({ token: t.token, siteBase: '../apps-script/', resume: maker.resume || {}, onStep: mkStep });
            maker.resume = r.resume; saveMaker();
            maker.busy = false; $('btnMake').disabled = false; $('btnMakeReset').hidden = false;
            if (!r.ok) {
                $('btnMake').textContent = '🛠 이어서 만들기';
                mkMsg('⚠️ ' + esc(r.error) + (r.resume.spreadsheetId ? '<br>지금까지 만든 것은 남아 있어요. 고친 뒤 <b>🛠 이어서 만들기</b>를 누르면 그다음부터 해요.' : ''), true);
                return;
            }
            mkStep('allow', 'run');
            $('mkAllowRow').hidden = false;
            mkMsg('거의 다 됐어요! <b>🔓 권한 허용 창 열기</b>를 눌러 새 탭에서 선생님 계정으로 <b>허용</b>해 주세요. 허용하면 이 화면이 저절로 연결돼요.');
            waitAllow();
        });
        $('btnAllow').addEventListener('click', function () {
            var url = maker.resume && maker.resume.url;
            if (!url) return;
            var w = window.open(url + '?action=ping', '_blank');
            if (!w) mkMsg('⚠️ 새 탭이 막혔어요. 이 주소를 새 탭에 붙여 넣어 여세요: <code>' + esc(url) + '?action=ping</code>', true);
            else mkMsg('새 탭에서 <b>권한 검토 → 계정 고르기 → (경고가 나오면) 고급 → 이동 → 허용</b>을 마치면 이 화면이 저절로 연결돼요. 새 탭에 <code>{"ok":true…}</code> 가 보이면 끝이에요.');
            waitAllow();
        });
        $('btnMakeReset').addEventListener('click', function () {
            if (!confirm('만들던 기록을 지우고 처음부터 다시 할까요? (구글 드라이브에 이미 만든 시트는 지워지지 않아요. 필요 없으면 드라이브에서 지우세요)')) return;
            clearTimeout(maker.poll); maker.resume = null; saveMaker();
            $('mkAllowRow').hidden = true; $('mkSteps').hidden = true; $('btnMake').textContent = '🛠 구글 계정으로 내 서버 만들기';
            renderMaker(); mkMsg('');
        });
    }

    // ---------- ② 수업 만들기 ----------
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
    function inputs() { return { ban: Number($('inBan').value), nStudents: Number($('inN').value), groupSize: Number($('inSize').value), exp: chosenExp() }; }
    function renderPreview() {
        var o = inputs(), g = CC.splitGroups(o.nStudents, o.groupSize);
        var ok = g.length && o.ban >= 1 && o.ban <= 99 && o.ban % 1 === 0 && !!o.exp;
        $('btnCreate').disabled = !ok;
        $('customRow').hidden = $('inExp').value !== 'custom';
        var e = o.exp && CC.expInfo(o.exp);
        $('expNote').innerHTML = $('inExp').value === 'custom' && !o.exp ? '선생님이 만든 실험의 번호(또는 학생 화면 주소)를 넣어 주세요.'
            : e && !e.ready ? '⚠️ 이 실험 페이지는 아직 수업 참여 띠를 붙이는 중이에요. 수업은 만들 수 있지만, 학생 화면에 조·번호 고르기가 아직 안 나올 수 있어요.' : '';
        $('preview').innerHTML = ok
            ? '👥 ' + o.nStudents + '명 → <b>' + g.length + '개 조</b>: ' + g.map(function (k, i) { return (i + 1) + '조 ' + k + '명'; }).join(', ')
            : '반(1~99), 학생 수(1~60), 조별 인원(1~10)을 정수로 넣어 주세요.';
    }
    ['inBan', 'inN', 'inSize', 'inExp', 'inCustom'].forEach(function (id) { $(id).addEventListener('input', renderPreview); });
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
        if (!server.url) { msg.className = 'note err'; msg.textContent = '⚠️ 먼저 ① 시트 연결을 해 주세요.'; return; }
        if (/^custom:/.test(o.exp) && customState.state === 'hidden' && !confirm('이 실험은 아직 학생에게 공개되지 않았어요. 공개하기 전에는 학생이 열 수 없어요.\n그래도 수업을 만들까요? (나중에 공개로 바꾸면 그때부터 열려요)')) return;
        state.busy = true; $('btnCreate').disabled = true;
        msg.className = 'note'; msg.textContent = '⏳ 수업을 만드는 중…';
        var r = await CC.createClass(server.url, o);
        state.busy = false; renderPreview();
        if (!r.ok) {
            msg.className = 'note err';
            msg.textContent = '⚠️ ' + r.error + (/알 수 없는 요청|올바르지 않습니다/.test(r.error) ? ' (시트의 코드가 4판인지 ① 에서 연결 시험을 해 보세요)' : '');
            return;
        }
        var c = { classCode: r.classCode, key: r.key, scriptId: server.id || '', url: server.id ? '' : server.url, exp: r.exp, ban: r.ban,
            nStudents: r.nStudents, groupSize: r.groupSize, groups: r.groups, created: new Date().toISOString() };
        state.classes.unshift(c); saveList();
        msg.className = 'note'; msg.textContent = '✅ 수업 ' + r.classCode + ' 을 만들었어요.';
        showClass(c); renderList(); renderWatchSel();
    });

    function studentLink(c) { return CC.studentUrl(siteRoot(), c.exp, c.classCode, c.scriptId); }
    function qrSvg(text) {
        if (typeof window.qrcode !== 'function') return null;
        var qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
        return qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
    }
    function showClass(c) {
        var link = studentLink(c), e = CC.expInfo(c.exp);
        $('classOut').hidden = false;
        $('outTitle').textContent = '— ' + c.ban + '반 · ' + (e ? e.name : c.exp) + ' · ' + c.nStudents + '명, ' + c.groups.length + '개 조';
        $('outCode').textContent = c.classCode;
        $('outLink').href = link; $('outLink').textContent = link;
        $('outKey').textContent = c.key;
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

    function renderList() {
        var el = $('classList');
        if (!state.classes.length) { el.innerHTML = '<p class="note">아직 만든 수업이 없어요.</p>'; return; }
        el.innerHTML = state.classes.map(function (c, i) {
            var e = CC.expInfo(c.exp);
            return '<div class="ct-item"><span><b>' + esc(c.classCode) + '</b> ' + esc(c.ban) + '반 · ' + esc(e ? e.name : c.exp) + ' · ' + esc(c.nStudents) + '명/' + esc(c.groups.length) + '조' +
                '<br><span class="note">' + esc(new Date(c.created).toLocaleString('ko-KR')) + '</span></span>' +
                '<span class="ct-row" style="margin:0"><button class="secondary" data-show="' + i + '">QR 보기</button><button data-watch="' + i + '">진행 보기</button>' +
                '<button class="danger" data-del="' + i + '">목록에서 빼기</button></span></div>';
        }).join('');
    }
    $('classList').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var c = state.classes[+(b.dataset.show || b.dataset.watch || b.dataset.del)];
        if (!c) return;
        if (b.dataset.show != null) { showClass(c); $('classOut').scrollIntoView({ behavior: 'smooth' }); }
        else if (b.dataset.watch != null) { state.watching = c.classCode; renderWatchSel(); tabs.show('watch', true); }
        else if (confirm('수업 ' + c.classCode + ' 을 이 브라우저 목록에서 뺄까요? (시트의 기록은 그대로예요. 열쇠를 적어 두지 않았다면 다시 볼 수 없어요)')) {
            state.classes.splice(state.classes.indexOf(c), 1); saveList(); renderList(); renderWatchSel();
        }
    });
    $('btnImport').addEventListener('click', async function () {
        var code = CC.normalizeClass($('impCode').value), key = $('impKey').value.trim(), msg = $('impMsg');
        if (!CC.isClassCode(code) || !key) { msg.className = 'note err'; msg.textContent = '수업 코드(예: 2-4821)와 열쇠를 넣어 주세요.'; return; }
        msg.className = 'note'; msg.textContent = '⏳ 확인 중…';
        var r = await CC.classStatus(server.url, code, key);
        if (!r.ok) { msg.className = 'note err'; msg.textContent = '⚠️ ' + r.error; return; }
        state.classes = state.classes.filter(function (c) { return c.classCode !== code || urlOf(c) !== server.url; });
        state.classes.unshift({ classCode: code, key: key, scriptId: server.id || '', url: server.id ? '' : server.url, exp: r.exp, ban: r.ban,
            nStudents: r.nStudents, groupSize: r.groupSize, groups: r.groups, created: r.created || new Date().toISOString() });
        saveList(); renderList(); renderWatchSel();
        msg.textContent = '✅ 불러왔어요.';
    });

    // ---------- ③ 진행 보기 ----------
    function renderWatchSel() {
        var sel = $('watchSel');
        if (!state.watching && state.classes[0]) state.watching = state.classes[0].classCode;
        sel.innerHTML = state.classes.length ? state.classes.map(function (c) {
            return '<option value="' + esc(c.classCode) + '"' + (c.classCode === state.watching ? ' selected' : '') + '>' + esc(c.classCode) + ' (' + esc(c.ban) + '반)</option>';
        }).join('') : '<option value="">만든 수업 없음</option>';
    }
    $('watchSel').addEventListener('change', function (e) { state.watching = e.target.value; state.last = null; state.detail = null; $('detail').hidden = true; refresh(); });
    $('btnRefresh').addEventListener('click', function () { refresh(); });
    function watched() { return state.classes.filter(function (c) { return c.classCode === state.watching; })[0] || null; }

    function startWatch() { stopWatch(); refresh(); }
    function stopWatch() { clearTimeout(state.timer); state.timer = null; }
    async function refresh() {
        clearTimeout(state.timer);
        var c = watched(), msg = $('watchMsg');
        if (!c) { msg.textContent = '② 수업 만들기에서 수업을 먼저 만들어 주세요.'; $('groups').innerHTML = ''; $('watchSum').innerHTML = ''; return; }
        if (document.hidden) { state.timer = setTimeout(refresh, POLL_MS); return; }
        var r = await CC.classStatus(urlOf(c), c.classCode, c.key);
        if (c !== watched()) return;
        if (!r.ok) msg.innerHTML = '<span class="err">⚠️ ' + esc(r.error) + '</span>' + (state.last ? ' (마지막으로 받은 내용을 보여 줘요)' : '');
        else {
            state.last = r;
            msg.textContent = '🟢 ' + new Date().toLocaleTimeString('ko-KR') + ' 에 받음 · ' + (POLL_MS / 1000) + '초마다 새로 봐요';
            render(r);
        }
        if (tabs.current() === 'watch') state.timer = setTimeout(refresh, POLL_MS);
    }
    function render(st) {
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

    renderSheet(); renderPreview(); renderList(); renderWatchSel(); renderAdmin();
    // 열 때 한 번: 시트의 판을 조용히 확인해 업데이트가 있으면 띠를 보여 준다
    if (server.url) CC.ping(server.url).then(function (p) { if (p.ok) checkVersion(p); });
    if (state.classes[0]) showClass(state.classes[0]);
})();
