// 보고서 AI 화면 (js/report-ai.js 학생 · js/class-teacher-ai.js 교사): 가짜 저장소 + 가짜 AI 서버 3곳(Playwright 라우트)
// 교사 로그인 → 키 넣기(3곳 키 시험) → 수업(한도 2) → 학생 질문 → 교사 화면이 답 → 학생에게 표시 → 교사 꺼짐 안내 → 한도 넘음
// → 검증 메모·최종 제출 → 교사 조별 보기·CSV. 키가 학생 화면·저장소 문서에 없는지, 375px·44px
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = (cfg && cfg.options) || {}; } update() {} destroy() {} resize() {} static register() {} }; window.Chart.helpers = { getRelativePosition: () => ({ x: 0, y: 0 }) };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';
const KEYS = { claude: 'sk-ant-TESTKEY-claude-123', gemini: 'AIzaTESTKEY-gemini-456', gpt: 'sk-TESTKEY-gpt-789' };

test('보고서 AI: 교사 키 → 학생 질문 → 답 → 꺼짐 안내 → 한도 → 제출 → 교사 보기·CSV (375px)', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore();
    const api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [], aiCalls = [];
    let answerN = 0;
    // 가짜 AI 서버 3곳 (키가 맞으면 답, 아니면 401)
    const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    const fakeAI = async route => {
        const req = route.request(), u = new URL(req.url());
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
        const h = req.headers(), body = req.postData() ? JSON.parse(req.postData()) : null;
        const prov = /googleapis/.test(u.host) ? 'gemini' : /anthropic/.test(u.host) ? 'claude' : 'gpt';
        const key = prov === 'gemini' ? u.searchParams.get('key') : prov === 'claude' ? h['x-api-key'] : String(h.authorization || '').replace(/^Bearer /, '');
        const json = (status, o) => route.fulfill({ status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify(o) });
        if (key !== KEYS[prov]) return json(401, { error: { message: 'invalid api key', type: 'authentication_error' } });
        if (req.method() === 'GET') return json(200, prov === 'gemini' ? { models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] } : { data: [{ id: prov === 'claude' ? 'claude-sonnet-5-5' : 'gpt-6-luna' }] });
        const system = prov === 'gemini' ? body.systemInstruction.parts[0].text : prov === 'claude' ? body.system : body.messages[0].content;
        const user = prov === 'gemini' ? body.contents[0].parts[0].text : prov === 'claude' ? body.messages[0].content : body.messages[1].content;
        aiCalls.push({ prov, body, headers: h, system, user, test: /한 단어/.test(system) });
        const text = /준비/.test(user) && /한 단어/.test(system) ? '준비' : '가짜 답 ' + (++answerN) + ': 어느 값이 근거인가요?';
        if (prov === 'gemini') return json(200, { candidates: [{ content: { parts: [{ text }] } }] });
        if (prov === 'claude') return json(200, { content: [{ type: 'text', text }] });
        return json(200, { choices: [{ message: { role: 'assistant', content: text } }] });
    };
    const ctx = async (opt, name) => {
        const c = await browser.newContext(Object.assign({ acceptDownloads: true }, opt));
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' }); });
        await c.route(/gstatic|accounts\.google/, r => r.abort());
        await c.route(/generativelanguage\.googleapis\.com|api\.anthropic\.com|api\.openai\.com/, fakeAI);
        const pg = await c.newPage(); pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept()); return pg;
    };
    const layout = async (pg, n, within) => {
        assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
        const small = await pg.evaluate(w => [...document.querySelectorAll((w ? w + ' ' : '') + 'button, ' + (w ? w + ' ' : '') + 'select')].filter(e => e.offsetParent && !e.closest('td, th') && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim().slice(0, 20)), within || '');
        assert.deepEqual(small, [], n + ' 44px 보다 작은 단추');
    };
    try {
        // ---- 교사: 로그인 → 수업(한도 2) ----
        const T = await ctx({ viewport: { width: 375, height: 800 } }, 'T');
        await T.goto(ROOT + 'projects/class-teacher.html');
        await T.click('#btnLogin');
        await T.waitForSelector('#btnLogout:not([hidden])');
        await T.fill('#inBan', '2'); await T.fill('#inN', '4'); await T.fill('#inSize', '2'); await T.fill('#inAiLimit', '2');
        await T.selectOption('#inExp', 'malus');
        assert.match(await T.textContent('#preview'), /AI 질문 조마다 2번/);
        await T.click('#btnCreate');
        await T.waitForSelector('#classOut:not([hidden])');
        const link = await T.getAttribute('#outLink', 'href');
        const space = /[?&]s=(c[a-z0-9]{23})/.exec(link)[1];
        assert.equal(app.db.docs.get('labClasses/' + space).aiLimit, 2);

        // ---- 교사: ③ 보고서 AI — 3곳 키 시험 ----
        await T.click('#ctTabs button[data-tab="ai"]');
        assert.match(await T.textContent('#aiDeskNow'), /API 키를 넣으면/);
        for (const p of ['gemini', 'gpt', 'claude']) {
            await T.selectOption('#aiProvider', p);
            await T.fill('#aiKey', 'wrong-key');
            await T.click('#aiTest');
            await T.waitForFunction(() => /⚠️/.test(document.getElementById('aiTestMsg').textContent));
            assert.match(await T.textContent('#aiTestMsg'), /API 키가 틀렸/, p + ' 틀린 키');
            await T.fill('#aiKey', KEYS[p]);
            await T.click('#aiTest');
            await T.waitForFunction(() => /✅/.test(document.getElementById('aiTestMsg').textContent), null, { timeout: 10000 });
            assert.match(await T.textContent('#aiTestMsg'), /키가 맞아요/, p);
        }
        assert.ok(aiCalls.some(c => c.prov === 'claude' && c.headers['anthropic-dangerous-direct-browser-access'] === 'true'));
        // 키는 기본으로 이 탭에만 (localStorage 에 없음)
        assert.equal(await T.evaluate(() => Object.keys(localStorage).filter(k => /key:/.test(k)).length), 0);
        assert.ok(await T.evaluate(k => Object.values(sessionStorage).includes(k), KEYS.claude));
        await T.waitForFunction(() => /AI 답하기 켜짐/.test(document.getElementById('aiDeskNow').textContent));
        await layout(T, '교사 ③ 보고서 AI');

        // ---- 학생 (375px 노트북): 1조 1번 → 7. 결론 → 보고서 ----
        const S = await ctx({ viewport: { width: 375, height: 800 } }, 'S');
        await S.goto(link.replace(/^https?:\/\/[^/]+\//, ROOT));
        await S.waitForSelector('#cs-cpick:not([hidden])');
        await S.selectOption('#cs-cjo', '1'); await S.selectOption('#cs-cnum', '1'); await S.click('#cs-cjoin');
        await S.waitForSelector('#cs-cjoined:not([hidden])');
        await S.click('nav.steps button[data-step="conclusion"]');
        await S.waitForSelector('#report-ai .rai-card');
        assert.match(await S.textContent('#report-ai'), /AI 사용 기록은 평가에 반영됩니다/);
        assert.match(await S.textContent('#report-ai'), /개인정보는 넣지 마세요/);
        await S.waitForFunction(() => /선생님 화면이 켜져 있어요/.test(document.getElementById('rai-status').textContent), null, { timeout: 15000 });
        // 프롬프트가 비면 단추 꺼짐
        await S.fill('#rai-t-theory', '말루스 법칙은 I = I0 cos²θ 이다.');
        assert.equal(await S.isDisabled('[data-askbtn="theory"]'), true);
        await S.fill('#rai-p-theory', '내 이론 정리에서 빠진 개념을 질문으로 알려 줘');
        assert.equal(await S.isDisabled('[data-askbtn="theory"]'), false);
        await layout(S, '학생 보고서', '#report-ai');
        await S.click('[data-askbtn="theory"]');
        await S.waitForFunction(() => /가짜 답/.test((document.querySelector('#rai-l-theory .rai-a') || {}).textContent || ''), null, { timeout: 20000 });
        const sent = aiCalls.filter(c => !c.test);
        assert.equal(sent.length, 1); assert.equal(sent[0].prov, 'claude');
        assert.match(sent[0].system, /대신 써 주지 않는다/);
        assert.match(sent[0].user, /I = I0 cos²θ/, '내 초안을 함께 보냄(기본 체크)');
        assert.match(sent[0].user, /\[페이지가 코드로 계산한 결과\]\n\(함께 보내지 않음\)/, '이론 항목은 계산 결과 기본 안 보냄');
        assert.match(await S.textContent('#rai-status'), /1 \/ 2/);
        // 검증·수정 메모
        await S.fill('#rai-l-theory textarea[data-vid]', '교과서 2단원으로 확인함');
        await S.click('#rai-l-theory button[data-verify]');
        await S.waitForFunction(() => /저장했어요/.test(document.querySelector('#rai-l-theory [data-vmsg]').textContent));

        // ---- 교사 화면 꺼짐 → 학생 안내, 다시 켜면 답 ----
        await T.uncheck('#aiOn');
        await S.waitForFunction(() => /선생님 화면이 켜져 있어야 AI 답이 와요/.test(document.getElementById('rai-status').textContent), null, { timeout: 15000 });
        await S.click('.rai-tabs button[data-tab="conclusion"]');
        await S.fill('#rai-t-conclusion', '오차 원인은 주변 빛이다.');
        await S.fill('#rai-p-conclusion', '내가 쓴 오차 원인이 데이터와 맞는지 검토해 줘');
        await S.click('[data-askbtn="conclusion"]');
        await S.waitForFunction(() => /선생님 화면이 켜져 있어야/.test(document.getElementById('rai-l-conclusion').textContent));
        await T.check('#aiOn');
        await S.waitForFunction(() => /가짜 답/.test(document.getElementById('rai-l-conclusion').textContent), null, { timeout: 20000 });
        // ---- 한도(2) 넘음 ----
        await S.fill('#rai-p-conclusion', '한 번 더 봐 줘');
        await S.click('[data-askbtn="conclusion"]');
        await S.waitForFunction(() => /다 썼어요/.test(document.getElementById('rai-l-conclusion').textContent), null, { timeout: 20000 });
        assert.equal(aiCalls.filter(c => !c.test).length, 2, '한도를 넘은 질문은 AI 를 부르지 않음');

        // ---- 외부 AI 기록 · 최종 제출 ----
        await S.click('.rai-tabs button[data-tab="external"]');
        await S.fill('#rai-x-prompt', '집에서 다른 AI 에게 cos² 뜻을 물음');
        await S.click('.rai-tabs button[data-tab="submit"]');
        await S.waitForFunction(() => /선생님께 저장됨/.test(document.getElementById('rai-save').textContent), null, { timeout: 15000 });
        await S.click('#rai-submit');
        await S.waitForFunction(() => /최종 제출했어요/.test(document.getElementById('rai-smsg').textContent), null, { timeout: 15000 });
        assert.equal(await S.evaluate(() => document.getElementById('rai-t-conclusion').readOnly), true);
        const printed = await S.evaluate(() => ReportAI.current.printHtml());
        assert.match(printed, /오차 원인은 주변 빛이다/); assert.match(printed, /교과서 2단원으로 확인함/); assert.match(printed, /AI 사용 기록은 평가에 반영됩니다/);

        // ---- 교사: 조별 보기 · CSV ----
        await T.click('#aiViewRefresh');
        await T.waitForFunction(() => /✅ 제출/.test(document.getElementById('aiGroups').textContent), null, { timeout: 10000 });
        assert.match(await T.textContent('#aiGroups'), /2 \/ 2/);
        await T.click('#aiGroups button[data-aig]');
        const detail = await T.textContent('#aiGroupBody');
        assert.match(detail, /내가 쓴 오차 원인이 데이터와 맞는지/); assert.match(detail, /교과서 2단원으로 확인함/); assert.match(detail, /다른 AI 에게 cos²/);
        await T.click('#aiCloseGroup');
        const [d1] = await Promise.all([T.waitForEvent('download'), T.click('#aiCsvLog')]);
        const logCsv = fs.readFileSync(await d1.path(), 'utf8');
        assert.equal(logCsv.charCodeAt(0), 0xFEFF);
        assert.match(logCsv, /내 이론 정리에서 빠진 개념/); assert.match(logCsv, /가짜 답 1/); assert.match(logCsv, /한도 넘음/); assert.match(logCsv, /외부 AI/);
        const [d2] = await Promise.all([T.waitForEvent('download'), T.click('#aiCsvRep')]);
        const repCsv = fs.readFileSync(await d2.path(), 'utf8');
        assert.match(repCsv, /결론 및 검토/); assert.match(repCsv, /오차 원인은 주변 빛이다/); assert.match(repCsv, /제출/);
        await layout(T, '교사 조별 보기');

        // ---- 키는 어디에도 없음: 저장소 문서·학생 화면·학생 브라우저 저장 ----
        const dump = JSON.stringify(app.db.dump()) + JSON.stringify(app.calls.map(c => c.body));
        for (const k of Object.values(KEYS)) {
            assert.ok(!dump.includes(k), '저장소에 키 없음');
            assert.ok(!(await S.content()).includes(k), '학생 화면에 키 없음');
            assert.ok(!(await S.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).includes(k), '학생 저장에 키 없음');
        }
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});

test('보고서 AI: 수업 밖에서 열면 AI 는 꺼지고 글쓰기·저장은 됨', { skip: !chromium && 'playwright 없음', timeout: 60000 }, async () => {
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => stat.listen(0, r));
    const ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    try {
        const c = await browser.newContext({ viewport: { width: 375, height: 800 } });
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs('http://127.0.0.1:9/none') }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /chart/i.test(r.request().url()) ? CHART_STUB : QR }));
        await c.route(/gstatic|accounts\.google/, r => r.abort());
        for (const page of ['planck-led.html', 'ideal-gas.html', 'em-induction.html', 'free-fall.html', 'pendulum-report.html', 'quantum-dot.html', 'malus-law.html']) {
            const pg = await c.newPage(); pg.on('pageerror', e => errors.push(page + ': ' + e.message));
            await pg.goto(ROOT + 'projects/' + page + '#step-7');
            await pg.waitForSelector('#report-ai .rai-card', { state: 'attached' });
            assert.match(await pg.textContent('#rai-status'), /수업으로 들어온 화면이 아니라/, page);
            assert.equal(await pg.evaluate(() => document.querySelectorAll('[data-askbtn]').length >= 4), true, page);
            await pg.evaluate(() => { const t = document.querySelector('.rai-text'); t.value = '내 글'; t.dispatchEvent(new Event('input', { bubbles: true })); });
            assert.match(await pg.evaluate(() => JSON.stringify(ReportAI.current.state().sections)), /내 글/, page);
            assert.equal(await pg.evaluate(() => document.querySelector('[data-askbtn]').disabled), true, page + ' AI 단추 꺼짐');
            await pg.close();
        }
        assert.deepEqual(errors, []);
    } finally { await browser.close(); stat.close(); }
});

// 선생님 요금 지키기: 규칙은 조 코드 모양만 보므로 교사 화면이 부르기 전에 막는다 (통합 관리 세션 검토 의견)
// 학생 기기가 core 검사를 건너뛰고 Firestore 에 직접 쓴 질문을 흉내 내 메모리 DB 에 바로 넣는다
test('보고서 AI: 가짜 조 코드·수업 전체 상한·한 기기가 조를 오가기 → AI 를 부르지 않음', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadLabStore();
    const api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    let calls = 0;
    try {
        const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : CHART_STUB }));
        await c.route(/gstatic|accounts\.google/, r => r.abort());
        await c.route(/api\.anthropic\.com/, async route => {
            const req = route.request(), CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
            if (req.method() === 'POST') calls++;
            const body = req.method() === 'GET' ? { data: [{ id: 'claude-sonnet-5-5' }] } : { content: [{ type: 'text', text: '답' }] };
            return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify(body) });
        });
        const T = await c.newPage(); T.on('pageerror', e => errors.push(e.message)); T.on('dialog', d => d.accept());
        await T.goto(ROOT + 'projects/class-teacher.html');
        await T.click('#btnLogin'); await T.waitForSelector('#btnLogout:not([hidden])');
        // 수업 하나: 조 2개, 조마다 한도 1 → 수업 전체 상한 2
        await T.fill('#inBan', '3'); await T.fill('#inN', '4'); await T.fill('#inSize', '2'); await T.fill('#inAiLimit', '1');
        await T.selectOption('#inExp', 'malus'); await T.click('#btnCreate'); await T.waitForSelector('#classOut:not([hidden])');
        const cls = Object.entries(app.db.dump('labClasses/')).find(([p]) => p.split('/').length === 2)[1];
        const sp = Object.keys(app.db.dump('labClasses/')).find(p => p.split('/').length === 2).split('/')[1];
        const [g1, g2] = cls.groups.map(g => g.code), four = g1.split('-')[2];
        let t0 = Date.now() - 60000, n = 0;
        const put = async (o) => {   // 학생이 Firestore 에 바로 쓴 질문 (core 의 조 검사를 건너뜀)
            const id = 'a' + String(++n).padStart(19, '0');
            await app.db.set('labClasses/' + sp + '/aiAsk/' + id, Object.assign({ jo: 1, exp: 'malus', section: 'theory', sectionName: '이론', prompt: '질문 ' + n, attach: [], draft: '', calc: '', device: '', status: 'wait', createdAt: new Date(t0 + n * 1000), expireAt: new Date(Date.now() + 86400000) }, o));
            return id;
        };
        const st = id => app.db.docs.get('labClasses/' + sp + '/aiAsk/' + id);
        const fakeA = await put({ uid: 'evil', group: '3-9-' + four, jo: 9 });       // 수업에 없는 조
        const fakeB = await put({ uid: 'evil', group: '3-1-0001', jo: 1 });           // 조 번호는 있지만 코드가 다름
        const u1 = await put({ uid: 'u1', group: g1, jo: 1 });                         // 정상 → 답
        const hop = await put({ uid: 'u1', group: g2, jo: 2 });                        // 같은 기기가 다른 조로 → 기기 상한
        const u2 = await put({ uid: 'u2', group: g2, jo: 2 });                         // 정상 → 답 (수업 전체 2 다 참)
        // 키 넣고 켜기
        await T.click('#ctTabs button[data-tab="ai"]');
        await T.selectOption('#aiProvider', 'claude'); await T.fill('#aiKey', 'sk-ant-x');
        const wait = async (id, s) => { for (let i = 0; i < 100; i++) { if (st(id).status === s) return; await new Promise(r => setTimeout(r, 100)); } assert.fail(id + ' 가 ' + s + ' 이 아님: ' + st(id).status); };
        await wait(u2, 'done');
        await wait(fakeA, 'error'); await wait(fakeB, 'error');
        assert.match(st(fakeA).error, /이 수업에 없는 조/);
        assert.equal(st(u1).status, 'done');
        await wait(hop, 'limit'); assert.match(st(hop).error, /이 기기/);
        assert.equal(calls, 2, 'AI 는 정상 질문 2개만 부름');
        // 수업 전체 상한: 한도 계산을 틀리게 만들 만한 '이미 답한' 가짜 조 기록이 있어도 전체 2 를 넘지 않음
        const extra = await put({ uid: 'u3', group: g1, jo: 1 });
        await wait(extra, 'limit');
        assert.equal(calls, 2);
        // 전체 상한만 걸리는 경우: 조 2 는 아직 0 이지만 다른 기록이 이미 2개 답함
        await app.db.set('labClasses/' + sp + '/aiAsk/' + u2, Object.assign({}, st(u2), { group: '3-8-' + four }));   // 답한 것을 엉뚱한 조로 옮겨 조 2 를 비움
        const capped = await put({ uid: 'u4', group: g2, jo: 2 });
        await wait(capped, 'limit'); assert.match(st(capped).error, /수업 전체/);
        assert.equal(calls, 2);
        // 키 시험 실패 때 모델 이름 안내
        await c.unroute(/api\.anthropic\.com/);
        await c.route(/api\.anthropic\.com/, async route => {
            const req = route.request(), CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
            if (req.method() === 'GET') return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify({ data: [{ id: 'claude-haiku-5-5' }] }) });
            return route.fulfill({ status: 404, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify({ error: { type: 'not_found_error', message: 'model: claude-sonnet-5-5' } }) });
        });
        assert.equal(await T.getAttribute('#aiModel', 'type'), 'text', '모델은 직접 쓸 수 있는 글칸');
        await T.click('#aiTest');
        await T.waitForFunction(() => /⚠️/.test(document.getElementById('aiTestMsg').textContent));
        assert.match(await T.textContent('#aiTestMsg'), /모델 이름을 확인하세요/);
        await T.fill('#aiModel', 'claude-haiku-5-5');
        assert.equal(await T.inputValue('#aiModel'), 'claude-haiku-5-5');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
