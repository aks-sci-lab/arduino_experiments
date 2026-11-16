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
            msg.innerHTML = '⚠️ 연결은 되지만 이 시트의 코드가 <b>' + v + '판</b>이에요. 수업 연결은 ' + CC.MIN_VERSION + '판이 필요해요: <a href="pendulum-setup.html">설정 화면</a>에서 새 코드를 복사해 붙여 넣고, 배포 관리 → 연필 → 버전 <b>새 버전</b> → 배포 하세요.';
            return false;
        }
        if (remember && id) {
            try { STORE.setItem(PC.SERVER_KEY, id); } catch (e) { /* 저장 불가 */ }
            server = { url: url, id: id, from: 'saved' };
        }
        msg.className = 'note'; msg.textContent = '✅ 연결됨 (' + v + '판)' + (remember ? ' · 이 브라우저가 기억해요. 진자·플랑크 노트북 화면도 이 시트를 써요.' : '');
        renderSheet();
        return true;
    }
    $('btnConnect').addEventListener('click', function () {
        var id = PC.scriptIdFromUrl($('sheetUrl').value);
        if (!id) { $('sheetMsg').className = 'note err'; $('sheetMsg').textContent = '⚠️ 웹 앱 주소 모양이 아니에요. https://script.google.com/macros/s/…/exec 를 통째로 붙여 넣으세요.'; return; }
        testSheet(PC.urlFromScriptId(id), id, true);
    });
    $('btnTestNow').addEventListener('click', function () { testSheet(server.url, server.id, false); });

    // ---------- ② 수업 만들기 ----------
    function inputs() { return { ban: Number($('inBan').value), nStudents: Number($('inN').value), groupSize: Number($('inSize').value), exp: $('inExp').value }; }
    function renderPreview() {
        var o = inputs(), g = CC.splitGroups(o.nStudents, o.groupSize);
        var ok = g.length && o.ban >= 1 && o.ban <= 99 && o.ban % 1 === 0;
        $('btnCreate').disabled = !ok;
        $('preview').innerHTML = ok
            ? '👥 ' + o.nStudents + '명 → <b>' + g.length + '개 조</b>: ' + g.map(function (k, i) { return (i + 1) + '조 ' + k + '명'; }).join(', ')
            : '반(1~99), 학생 수(1~60), 조별 인원(1~10)을 정수로 넣어 주세요.';
    }
    ['inBan', 'inN', 'inSize', 'inExp'].forEach(function (id) { $(id).addEventListener('input', renderPreview); });
    $('btnCreate').addEventListener('click', async function () {
        if (state.busy) return;
        var o = inputs(), msg = $('createMsg');
        if (!server.url) { msg.className = 'note err'; msg.textContent = '⚠️ 먼저 ① 시트 연결을 해 주세요.'; return; }
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
        var link = studentLink(c), e = CC.EXPS[c.exp];
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
            var e = CC.EXPS[c.exp];
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
            var sub = g.sub, subTxt = sub && sub.rows
                ? '📤 제출: LED ' + sub.rows + '개 (' + esc(sub.leds.join(', ')) + ')' + (sub.hCurrent !== '' && sub.hCurrent != null ? ' · h = ' + Number(sub.hCurrent).toFixed(2) + ' ×10⁻³⁴' + (sub.errorPct !== '' && sub.errorPct != null ? ' (' + (sub.errorPct >= 0 ? '+' : '') + Number(sub.errorPct).toFixed(1) + ' %)' : '') : '')
                : '아직 제출 없음';
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
            '<tr><th>조 전체 제출</th><td>' + (g.sub && g.sub.rows ? 'LED ' + g.sub.rows + '개, 노트북 ' + g.sub.devices + '대' + (g.sub.lastSent ? ', 마지막 ' + esc(new Date(g.sub.lastSent).toLocaleTimeString('ko-KR')) : '') : '아직') + '</td></tr>' +
            '</tbody></table>';
    }
    $('groups').addEventListener('click', function (e) {
        var b = e.target.closest('button.ct-mem'); if (!b) return;
        showDetail(+b.dataset.jo, +b.dataset.num);
        $('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('btnCloseDetail').addEventListener('click', function () { state.detail = null; $('detail').hidden = true; });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && tabs.current() === 'watch') refresh(); });

    renderSheet(); renderPreview(); renderList(); renderWatchSel();
    if (state.classes[0]) showClass(state.classes[0]);
})();
