/* 수업 연결 (교사) — ③ 🤖 보고서 AI (2026-11-19, projects/class-teacher.html)
   선생님 개인 API 키(Gemini·Claude·GPT)를 이 브라우저에만 두고, 학생이 보낸 AI 질문(Firestore labClasses/{수업}/aiAsk)을
   이 화면이 차례로 받아 AI 를 불러 답을 쓴다. 키는 Firestore·서버로 절대 보내지 않는다 (기본: 이 탭에서만 기억, 고르면 이 브라우저에 기억).
   - 이 화면이 열려 있고 'AI 답하기'가 켜져 있는 동안 내 수업(최근 12개)의 질문을 3초마다 확인 (Firestore 실시간이라 읽기 비용 거의 없음)
   - 조마다 한도(수업 만들 때 정함, 기본 20): 답한(done) 질문 수로 셈. 넘으면 '한도 넘음'으로 답
   - 1분마다 '선생님 화면 켜짐' 신호(aiDesk/status) → 학생 화면에 🟢
   - 조별 보고서·AI 기록 보기, CSV(보고서·AI 기록)·JSON 내려받기 (프롬프트·답·검증 메모 포함)
   계산·요청 모양·프롬프트는 js/report-ai.js 에 있다. */
(function () {
    'use strict';
    var RA = window.ReportAI, LS = window.LabStore, CC = window.ClassCloud;
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var TICK_MS = 3000, BEAT_MS = 60000, MAX_CLASSES = 12;
    var P = 'report-ai-teacher:';
    var ss = null, ls = null; try { ss = window.sessionStorage; } catch (e) { ss = null; } try { ls = window.localStorage; } catch (e) { ls = null; }
    function get(s, k) { try { return s ? s.getItem(P + k) : null; } catch (e) { return null; } }
    function put(s, k, v) { try { if (!s) return; if (v == null || v === '') s.removeItem(P + k); else s.setItem(P + k, v); } catch (e) { /* 저장 불가 */ } }
    var state = { user: null, classes: [], asks: {}, beats: {}, busy: false, timer: null, view: '', reports: [], viewAsks: [], viewGroup: '', answered: 0, lastErr: '' };

    // ---------- 설정 칸 (회사·모델·키) ----------
    var sel = $('aiProvider');
    sel.innerHTML = Object.keys(RA.PROVIDERS).map(function (k) { return '<option value="' + k + '">' + esc(RA.PROVIDERS[k].name) + '</option>'; }).join('');
    sel.value = get(ls, 'provider') || 'gemini';
    $('aiRemember').checked = get(ls, 'remember') === '1';
    function prov() { return sel.value; }
    function keyNow() { return $('aiKey').value.trim(); }
    function loadProvider() {
        var p = prov(), info = RA.PROVIDERS[p];
        $('aiModel').value = get(ls, 'model:' + p) || info.models[0];
        $('aiModelList').innerHTML = info.models.map(function (m) { return '<option value="' + esc(m) + '">'; }).join('');
        $('aiKey').value = get(ss, 'key:' + p) || get(ls, 'key:' + p) || '';
        $('aiKey').placeholder = info.keyHint;
        $('aiKeyLink').href = info.keyUrl; $('aiKeyLink').textContent = info.keySite + '에서 키 만들기 ↗';
        $('aiTestMsg').textContent = '';
        renderDesk();
    }
    function saveKey() {
        var p = prov(), k = keyNow(), rem = $('aiRemember').checked;
        put(ls, 'remember', rem ? '1' : '');
        put(ss, 'key:' + p, k);
        put(ls, 'key:' + p, rem ? k : '');
    }
    sel.addEventListener('change', function () { put(ls, 'provider', prov()); loadProvider(); });
    $('aiModel').addEventListener('change', function () { put(ls, 'model:' + prov(), $('aiModel').value.trim()); renderDesk(); });
    $('aiKey').addEventListener('input', function () { saveKey(); state.pauseUntil = 0; state.lastErr = ''; renderDesk(); });
    $('aiRemember').addEventListener('change', function () {
        if ($('aiRemember').checked && !confirm('이 브라우저에 키를 기억할까요? 이 컴퓨터를 다른 사람도 쓰면 키를 볼 수 있어요. (교실 공용 컴퓨터라면 끄세요)')) { $('aiRemember').checked = false; return; }
        saveKey();
    });
    $('aiKeyShow').addEventListener('click', function () { var t = $('aiKey'); t.type = t.type === 'password' ? 'text' : 'password'; $('aiKeyShow').textContent = t.type === 'password' ? '👁 보기' : '🙈 숨기기'; });
    $('aiOn').checked = get(ls, 'on') !== '0';
    $('aiOn').addEventListener('change', function () {
        put(ls, 'on', $('aiOn').checked ? '1' : '0');
        state.beats = {};   // 바로 켜짐/꺼짐 신호
        state.pauseUntil = 0; renderDesk(); tick();
    });
    $('aiTest').addEventListener('click', async function () {
        var m = $('aiTestMsg'), p = prov();
        m.className = 'note'; m.textContent = '⏳ 키를 시험하는 중…';
        var r = await RA.listModels({ provider: p, key: keyNow() });
        if (!r.ok) { m.className = 'note err'; m.textContent = '⚠️ ' + r.error; return; }
        if (r.models.length) $('aiModelList').innerHTML = r.models.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('');
        var model = $('aiModel').value.trim(), has = !r.models.length || r.models.indexOf(model) >= 0;
        var c = await RA.callAI({ provider: p, model: model, key: keyNow(), system: '한 단어로만 답한다.', user: '준비됐으면 "준비"라고만 답해.', timeoutMs: 30000 });
        if (!c.ok) { m.className = 'note err'; m.textContent = '⚠️ 키는 맞지만 ' + model + ' 로 답을 받지 못했어요: ' + c.error + (has ? '' : ' (이 키로 쓸 수 있는 모델 목록에 없어요 — 모델 칸에서 다시 고르세요)'); return; }
        m.className = 'note'; m.textContent = '✅ 키가 맞아요 — ' + model + ' 가 답했어요 ("' + c.text.slice(0, 20) + '"). 쓸 수 있는 모델 ' + r.models.length + '개를 모델 칸 목록에 넣었어요.';
    });

    // ---------- 내 수업 (class-teacher.js 가 알려 줌) ----------
    window.addEventListener('lab-classes', function (e) { state.classes = (e.detail || []).slice(); renderViewSel(); renderDesk(); tick(); });
    LS.onUser(function (u) { state.user = u && u.google ? u : null; renderDesk(); });
    function workClasses() {
        var now = Date.now();
        return state.classes.filter(function (c) { return !c.expireAt || Date.parse(c.expireAt) > now; }).slice(0, MAX_CLASSES);
    }
    function ready() { return !!(state.user && $('aiOn').checked && keyNow() && $('aiModel').value.trim()); }
    function renderDesk() {
        var el = $('aiDeskNow'), n = workClasses().length;
        var why = !state.user ? '맨 위에서 구글 로그인을 하면 켜져요.' : !keyNow() ? 'API 키를 넣으면 켜져요.' : !$('aiModel').value.trim() ? '모델을 고르세요.' : !$('aiOn').checked ? '꺼 두었어요 (학생 질문은 기다려요).' : '';
        el.className = 'ct-status ' + (why ? 'warn' : 'ok');
        el.innerHTML = why ? '⏸ AI 답하기 멈춤 — ' + esc(why) :
            '🟢 AI 답하기 켜짐 — ' + esc(RA.PROVIDERS[prov()].name) + ' · ' + esc($('aiModel').value.trim()) + ' · 내 수업 ' + n + '개의 질문을 받고 있어요. <b>이 화면(탭)을 닫으면 멈춰요.</b>' +
            (state.answered ? '<br>이번에 답한 질문 ' + state.answered + '개' : '') + (state.lastErr ? '<br><span class="err">마지막 오류: ' + esc(state.lastErr) + '</span>' : '');
    }

    // ---------- 일하기: 질문 받아 차례로 답하기 ----------
    function call(space, body) { return LS.call('lab:' + space, body); }
    function usedOf(asks, group, exceptId) { return asks.filter(function (q) { return q.group === group && q.status === 'done' && q.id !== exceptId; }).length; }
    async function tick() {
        clearTimeout(state.timer);
        try { await work(); } catch (e) { state.lastErr = String(e && e.message || e); }
        state.timer = setTimeout(tick, TICK_MS);
    }
    async function work() {
        if (!state.user || state.busy) return;
        state.busy = true;
        try {
            var list = workClasses(), on = ready(), now = Date.now();
            // 켜짐 신호 (1분마다, 켜고 끌 때 바로)
            for (var i = 0; i < list.length; i++) {
                var c = list[i], b = state.beats[c.space];
                if (!b || b.on !== on || now - b.at > BEAT_MS) {
                    var rb = await call(c.space, { action: 'aiDeskBeat', on: on, provider: prov(), model: $('aiModel').value.trim() });
                    if (rb.ok) state.beats[c.space] = { on: on, at: now };
                }
            }
            if (!on || (state.pauseUntil && now < state.pauseUntil)) return;
            // 기다리는 질문 모으기 (Firestore 는 실시간 목록이라 다시 불러도 비용이 늘지 않음)
            var queue = [];
            for (var j = 0; j < list.length; j++) {
                var r = await call(list[j].space, { action: 'aiList' });
                if (!r.ok) continue;
                state.asks[list[j].space] = r;
                r.asks.forEach(function (q) {
                    var stale = q.status === 'busy' && q.busyAt && now - Date.parse(q.busyAt) > 3 * 60000;
                    if (q.status === 'wait' || stale) queue.push({ c: list[j], r: r, q: q });
                });
            }
            queue.sort(function (a, b) { return String(a.q.createdAt).localeCompare(String(b.q.createdAt)); });
            for (var k = 0; k < queue.length && ready() && !(state.pauseUntil && Date.now() < state.pauseUntil); k++) await answer(queue[k]);
            if (queue.length) { renderDesk(); if (state.view) renderView(); }
        } finally { state.busy = false; }
    }
    async function answer(x) {
        var c = x.c, q = x.q, limit = x.r.limit, used = usedOf(x.r.asks, q.group, q.id);
        if (used >= limit) {
            await call(c.space, { action: 'aiAnswer', id: q.id, status: 'limit', used: used, limit: limit,
                error: '이 조는 이 수업에서 AI 질문을 ' + limit + '번까지 쓸 수 있는데 다 썼어요. 이제는 스스로 검토하거나 선생님께 물어보세요.' });
            q.status = 'limit';
            return;
        }
        var cl = await call(c.space, { action: 'aiClaim', id: q.id });
        if (!cl.ok) return;   // 다른 화면이 잡음
        var info = CC && CC.expInfo ? CC.expInfo(q.exp) : null;
        var pr = RA.buildPrompt(q, info ? info.name : q.exp);
        var res = await RA.callAI({ provider: prov(), model: $('aiModel').value.trim(), key: keyNow(), system: pr.system, user: pr.user });
        if (res.ok) {
            await call(c.space, { action: 'aiAnswer', id: q.id, status: 'done', answer: res.text, provider: prov(), model: $('aiModel').value.trim(), used: used + 1, limit: limit });
            q.status = 'done'; state.answered++; state.lastErr = '';
        } else if (!res.status || res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) {
            // 키·한도·인터넷 문제: 학생 질문은 그대로 기다리게 두고(다시 '기다림'), 30초 쉬었다 다시 — 선생님이 위에서 고치면 이어서 답함
            state.lastErr = res.error; state.pauseUntil = Date.now() + 30000;
            await call(c.space, { action: 'aiAnswer', id: q.id, status: 'wait', used: used, limit: limit });
            q.status = 'wait';
        } else {
            state.lastErr = res.error;
            // 그 질문만의 문제(빈 답·모델 이름 등): 학생에게 알림
            await call(c.space, { action: 'aiAnswer', id: q.id, status: 'error', error: res.error.replace(/\(.*\)$/, '').slice(0, 280), provider: prov(), model: $('aiModel').value.trim(), used: used, limit: limit });
            q.status = 'error';
        }
    }

    // ---------- 보기: 조별 보고서·AI 기록 ----------
    function renderViewSel() {
        var s = $('aiView');
        if (!state.view || !state.classes.some(function (c) { return c.space === state.view; })) state.view = state.classes[0] ? state.classes[0].space : '';
        s.innerHTML = state.classes.length ? state.classes.map(function (c) {
            return '<option value="' + esc(c.space) + '"' + (c.space === state.view ? ' selected' : '') + '>' + esc(c.classCode) + ' (' + esc(c.ban) + '반 · AI ' + esc(c.aiLimit == null ? 20 : c.aiLimit) + '번)</option>';
        }).join('') : '<option value="">만든 수업 없음</option>';
    }
    $('aiView').addEventListener('change', function (e) { state.view = e.target.value; state.viewGroup = ''; loadView(); });
    $('aiViewRefresh').addEventListener('click', function () { loadView(); });
    function viewClass() { return state.classes.filter(function (c) { return c.space === state.view; })[0] || null; }
    async function loadView() {
        var c = viewClass(), m = $('aiViewMsg');
        if (!c) { $('aiGroups').innerHTML = ''; m.textContent = state.user ? '① 에서 수업을 먼저 만들어 주세요.' : '구글 로그인을 해 주세요.'; return; }
        m.className = 'note'; m.textContent = '⏳ 불러오는 중…';
        var a = await call(c.space, { action: 'aiList' }), r = await call(c.space, { action: 'reportList' });
        if (!a.ok || !r.ok) { m.className = 'note err'; m.textContent = '⚠️ ' + (a.error || r.error); return; }
        state.viewAsks = a.asks; state.reports = r.reports; state.viewLimit = a.limit;
        m.textContent = '🕘 ' + new Date().toLocaleTimeString('ko-KR') + ' 에 불러옴';
        renderView();
    }
    function secName(k) { var s = RA.sectionInfo(k); return s ? s.name : k; }
    function renderView() {
        var c = viewClass(); if (!c) return;
        var asks = state.viewAsks, reps = state.reports, lim = state.viewLimit;
        $('aiGroups').innerHTML = '<table class="ct-detail-table ct-ai-table"><thead><tr><th>조</th><th>AI 질문</th><th>보고서</th><th></th></tr></thead><tbody>' +
            (c.groups || []).map(function (g) {
                var ga = asks.filter(function (q) { return q.group === g.code; }), gr = reps.filter(function (x) { return x.group === g.code; });
                var used = usedOf(ga, g.code), wait = ga.filter(function (q) { return q.status === 'wait' || q.status === 'busy'; }).length;
                return '<tr><td>' + esc(g.jo) + '조</td><td>' + used + ' / ' + esc(lim) + (wait ? ' · ⏳ ' + wait : '') + '</td><td>' +
                    (gr.length ? gr.map(function (x) { return x.submitted ? '✅ 제출' : '✏️ 쓰는 중'; }).join(', ') : '–') + '</td>' +
                    '<td><button class="secondary" data-aig="' + esc(g.code) + '">보기</button></td></tr>';
            }).join('') + '</tbody></table>';
        renderGroup();
    }
    function renderGroup() {
        var g = state.viewGroup, el = $('aiGroupDetail');
        if (!g) { el.hidden = true; return; }
        var c = viewClass(), gi = (c.groups || []).filter(function (x) { return x.code === g; })[0];
        var asks = state.viewAsks.filter(function (q) { return q.group === g; }), reps = state.reports.filter(function (x) { return x.group === g; });
        el.hidden = false;
        $('aiGroupTitle').textContent = (gi ? gi.jo + '조 ' : '') + '(' + g + ') 보고서·AI 기록';
        $('aiGroupBody').innerHTML =
            (reps.length ? reps.map(function (r) {
                var ex = r.external || {};
                return '<div class="ct-ai-rep"><h3>📝 보고서 — 기기 ' + esc(String(r.device || '').slice(-4).toUpperCase() || '?') + ' · ' + (r.submitted ? '✅ 최종 제출 ' + esc(r.submittedAt ? new Date(r.submittedAt).toLocaleString('ko-KR') : '') +
                        ' <button class="secondary" data-reopen-rep="' + esc(r.id) + '">🔓 다시 열기</button>' : '✏️ 쓰는 중 (마지막 저장 ' + esc(r.updatedAt ? new Date(r.updatedAt).toLocaleTimeString('ko-KR') : '') + ')') + '</h3>' +
                    Object.keys(r.sections).map(function (k) { return '<p><b>' + esc(secName(k)) + '</b><br>' + (esc(r.sections[k]).replace(/\n/g, '<br>') || '<span class="note">(비어 있음)</span>') + '</p>'; }).join('') +
                    (ex.prompt || ex.adopted || ex.verify ? '<p><b>외부 AI 기록</b><br>프롬프트: ' + esc(ex.prompt) + '<br>채택: ' + esc(ex.adopted) + '<br>검증·고친 점: ' + esc(ex.verify) + '</p>' : '') + '</div>';
            }).join('') : '<p class="note">아직 보고서를 저장한 기기가 없어요.</p>') +
            '<h3>🤖 AI 기록 (' + asks.length + '개)</h3>' +
            (asks.length ? asks.map(function (q) {
                return '<div class="ct-ai-ask"><p><b>[' + esc(q.sectionName || q.section) + ']</b> ' + esc(q.prompt) + ' <span class="note">' + esc(new Date(q.createdAt).toLocaleString('ko-KR')) + ' · 함께 보냄: ' +
                    esc((q.attach || []).map(function (x) { return x === 'draft' ? '내 초안' : '계산 결과'; }).join('·') || '없음') + '</span></p>' +
                    (q.draft ? '<details><summary>보낸 내 초안</summary><p>' + esc(q.draft).replace(/\n/g, '<br>') + '</p></details>' : '') +
                    (q.calc ? '<details><summary>보낸 계산 결과</summary><pre>' + esc(q.calc) + '</pre></details>' : '') +
                    '<p class="ct-ai-ans">' + (q.status === 'done' ? '🤖 ' + esc(q.answer).replace(/\n/g, '<br>') : q.status === 'wait' || q.status === 'busy' ? '⏳ 기다리는 중' : '⚠️ ' + esc(q.error)) + '</p>' +
                    (q.verify ? '<p>✍️ <b>검증·수정 메모</b>: ' + esc(q.verify).replace(/\n/g, '<br>') + '</p>' : '') + '</div>';
            }).join('') : '<p class="note">아직 AI 질문이 없어요.</p>');
    }
    $('aiGroups').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-aig]'); if (!b) return;
        state.viewGroup = b.dataset.aig; renderGroup(); $('aiGroupDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('aiGroupBody').addEventListener('click', async function (e) {
        var b = e.target.closest('button[data-reopen-rep]'); if (!b) return;
        if (!confirm('이 보고서를 학생이 다시 고칠 수 있게 열까요?')) return;
        var r = await call(state.view, { action: 'reportReopen', id: b.dataset.reopenRep });
        if (!r.ok) { alert(r.error); return; }
        loadView();
    });
    $('aiCloseGroup').addEventListener('click', function () { state.viewGroup = ''; renderGroup(); });

    // ---------- 내려받기 ----------
    function download(name, text, type) {
        var blob = new Blob([text], { type: type }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }
    function base(c, kind) { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return '수업' + c.classCode + '_' + kind + (state.viewGroup ? '_' + state.viewGroup + '조' : '') + '_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); }
    function picked() {
        var g = state.viewGroup;
        return { asks: state.viewAsks.filter(function (q) { return !g || q.group === g; }), reports: state.reports.filter(function (r) { return !g || r.group === g; }) };
    }
    async function ensure() { if (!state.viewAsks.length && !state.reports.length) await loadView(); return viewClass(); }
    $('aiCsvRep').addEventListener('click', async function () {
        var c = await ensure(); if (!c) return;
        var x = picked(), keys = [];
        x.reports.forEach(function (r) { Object.keys(r.sections).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
        var out = LS.reportCsv(x.reports, c.groups, keys.map(function (k) { return { key: k, name: secName(k) }; }));
        download(base(c, '보고서') + '.csv', out.csv, 'text/csv;charset=utf-8');
        $('aiDlMsg').textContent = '✅ 보고서 ' + out.rows + '개를 내려받았어요' + (state.viewGroup ? ' (이 조만)' : '') + '.';
    });
    $('aiCsvLog').addEventListener('click', async function () {
        var c = await ensure(); if (!c) return;
        var x = picked(), out = LS.aiCsv(x.asks, x.reports, c.groups);
        download(base(c, 'AI기록') + '.csv', out.csv, 'text/csv;charset=utf-8');
        $('aiDlMsg').textContent = '✅ AI 기록 ' + out.rows + '줄을 내려받았어요 (프롬프트·답·검증 메모 포함).';
    });
    $('aiJson').addEventListener('click', async function () {
        var c = await ensure(); if (!c) return;
        var x = picked();
        download(base(c, '보고서AI') + '.json', JSON.stringify({ classCode: c.classCode, exp: c.exp, groups: c.groups, aiLimit: state.viewLimit, exportedAt: new Date().toISOString(), reports: x.reports, aiAsks: x.asks }, null, 1), 'application/json');
        $('aiDlMsg').textContent = '✅ 보고서 ' + x.reports.length + '개 · AI 기록 ' + x.asks.length + '개를 JSON 으로 내려받았어요.';
    });

    // 탭을 열면 보기 불러오기
    window.addEventListener('lab-teacher-tab', function (e) { if (e.detail === 'ai') loadView(); });
    loadProvider();
    tick();
    window.__teacherAI = { state: state, tick: tick, loadView: loadView };
})();
