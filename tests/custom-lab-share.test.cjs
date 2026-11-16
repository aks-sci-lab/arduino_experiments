// 선생님이 만든 실험 — 조 공유(구글 로그인 없이) 시험
//  1) Node: 보낼 것(shareItems)·받은 것 합치기(mergeIncoming)·CSV 불러오기(rowsFromCsv)
//  2) Playwright(있으면): 가짜 Apps Script(tests/fake-apps-script.cjs, 진짜 시트처럼 '2-3-5376' → 날짜)로
//     교사 수업 만들기 → 학생 2명 같은 조(보내기 → 다른 학생 자동 불러오기) → 교사 진행 보기의 단계·점 수, 375px
//  Firebase·Chart.js 는 시험 환경에서 막혀 있어, 실험 설정은 이 기기 저장값으로 열고 Chart 는 작은 가짜로 바꾼다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/custom-lab-math.js');
const { loadCodeGs } = require('./fake-apps-script.cjs');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const DEF = M.normalizeDefinition({
    title: '옴의 법칙 확인', description: '[목표] 전압과 전류의 관계', published: true, layout: 'steps',
    columns: [{ name: '전압', unit: 'V' }, { name: '전류', unit: 'mA' }, { name: '메모', unit: '' }],
    xCol: 0, yCol: 1, fit: 'proportional', questions: ['기울기는 무엇을 뜻하나요?', '오차의 원인은?'],
    stepTexts: { theory: 'V = IR', materials: '', procedure: '' }, sensor: { mode: 'none' }
});

test('shareItems: 표·질문 답을 따로 한 줄씩, 빈 표는 n 0', () => {
    const items = M.shareItems({ def: DEF, rows: [['1', '10', 'a'], ['', '', ''], ['2', '20', '']], answers: ['저항의 역수', ''], series: null, fields: [], sel: { x: 0, y: 1, fit: 'proportional' } });
    assert.deepEqual(items.map(i => i.id), ['table', 'answers']);
    assert.equal(items[0].n, 2);
    assert.deepEqual(items[0].data, { cols: ['전압', '전류', '메모'], rows: [['1', '10', 'a'], ['2', '20', '']] });
    assert.equal(items[0].summary['행'], 2);
    assert.equal(items[0].summary['기울기'], 10);
    assert.equal(items[1].n, 1);
    assert.deepEqual(items[1].summary, { 답: 1, 질문: 2 });
    const empty = M.shareItems({ def: DEF, rows: [], answers: [], fields: [] });
    assert.equal(empty[0].n, 0);
});

test('shareItems: 센서 기록 요약 이름은 서버 규칙에 맞게, 긴 기록은 솎아 냄', () => {
    const def = M.normalizeDefinition(Object.assign({}, DEF, { sensor: { mode: 'imu', fields: ['total', 'x'] } }));
    const fields = M.sensorFields(def.sensor);
    assert.ok(fields.length >= 1);
    const s = M.emptySeries(fields);
    for (let i = 0; i < 2000; i++) { s.t.push(i / 100); fields.forEach(f => s.v[f.key].push(Math.sin(i))); }
    const it = M.shareItems({ def, rows: [], answers: [], series: s, fields }).find(x => x.id === 'sensor');
    assert.equal(it.n, 2000);
    assert.equal(it.data.series.t.length, M.MAX_SUBMIT_SERIES);
    assert.equal(it.data.total, 2000);
    Object.keys(it.summary).forEach(k => assert.match(k, /^[A-Za-z0-9_가-힣 .()-]{1,30}$/, k));
    // 가짜 서버가 그대로 받아 준다 (요약 이름·자료 크기)
    const app = loadCodeGs();
    const r = app.post({ action: 'save', exp: 'custom:ohm01', id: 'nabcdef-sensor', group: '2-3-5376', device: 'nabcdef', title: it.title, n: it.n, summary: it.summary, data: JSON.stringify(it.data), sentAt: new Date().toISOString() });
    assert.equal(r.ok, true, JSON.stringify(r));
});

test('mergeIncoming: 기기별로 따로, 열 이름으로 맞추고 CSV 로 불러온 것은 남김', () => {
    const items = [
        { id: 'table', device: 'nAAAA1', from: '노트북 AAA1', data: { cols: ['전류', '전압'], rows: [['10', '1'], ['20', '2']] } },
        { id: 'answers', device: 'nAAAA1', from: '노트북 AAA1', data: { questions: ['오차의 원인은?'], answers: ['접촉 저항'] } },
        { id: 'table', device: 'nBBBB2', from: '노트북 BBB2', data: { cols: ['딴것'], rows: [['x']] } }
    ];
    const start = { csvabc: { from: '파일 a.csv', rows: [['3', '30', '']], series: null, answers: ['', ''] } };
    const r = M.mergeIncoming(start, items, DEF, []);
    assert.equal(r.changed, true);
    assert.deepEqual(Object.keys(r.ext).sort(), ['csvabc', 'nAAAA1']);
    assert.deepEqual(r.ext.nAAAA1.rows, [['1', '10', ''], ['2', '20', '']]);
    assert.deepEqual(r.ext.nAAAA1.answers, ['', '접촉 저항']);
    assert.equal(M.incomingCount(r.ext), 4);
    // 같은 것을 다시 받으면 바뀌지 않음
    assert.equal(M.mergeIncoming(r.ext, items, DEF, []).changed, false);
    // 저장값 다듬기
    assert.deepEqual(M.normalizeExt(JSON.parse(JSON.stringify(r.ext)), DEF, []), r.ext);
    assert.deepEqual(M.normalizeExt({ 'bad key!': {} }, DEF, []), {});
});

test('rowsFromCsv: 이 페이지의 CSV 저장 파일을 다시 읽는다', () => {
    const csv = M.toCsv(DEF.columns, [['1', '10', '쉼표, "따옴표"'], ['2', '20', '']]);
    assert.deepEqual(M.rowsFromCsv(csv, DEF.columns).rows, [['1', '10', '쉼표, "따옴표"'], ['2', '20', '']]);
    assert.match(M.rowsFromCsv('a,b\n1,2', DEF.columns).error, /열 이름/);
    assert.match(M.rowsFromCsv('', DEF.columns).error, /CSV/);
});

// ---------------- 화면 시험 ----------------
const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://lab.test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm' };
// Chart.js 대신: 받은 자료를 window.__charts 에 남기는 작은 가짜
const FAKE_CHART = 'window.__charts=[];window.Chart=class{constructor(c,o){this.data=o.data;this.options=o.options;window.__charts.push(this);}update(){}destroy(){}};';

async function newPage(browser, app, width, def) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    await ctx.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'script.google.com') {
            const req = route.request();
            let body;
            if (req.method() === 'POST') body = app.post(req.postData() || '{}');
            else body = app.get(Object.fromEntries(u.searchParams));
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
        }
        if (u.hostname === 'cdn.jsdelivr.net' && /chart\.js/.test(u.pathname)) return route.fulfill({ contentType: 'application/javascript', body: FAKE_CHART });
        if (u.origin !== ORIGIN) return route.abort();
        const file = path.join(ROOT, decodeURIComponent(u.pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    if (def) await ctx.addInitScript(d => { try { if (!localStorage.getItem('customLabDef:v1:ohm01')) localStorage.setItem('customLabDef:v1:ohm01', d); } catch (e) { /* */ } }, JSON.stringify(def));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    return { ctx, page, errors };
}
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function smallButtons(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('button, .cs-btn, select'))
        .filter(b => b.offsetParent !== null && !b.closest('table'))
        .filter(b => b.getBoundingClientRect().height < 43.5)
        .map(b => (b.id || b.textContent.trim()).slice(0, 30)));
}

test('화면: 교사 수업 만들기 → 학생 2명 같은 조 보내기·자동 불러오기 → 교사 진행 보기 (375px)', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadCodeGs();
    const browser = await chromium.launch();
    try {
        // ---------- 교사: 수업 만들기 ----------
        const t = await newPage(browser, app, 1200);
        await t.page.goto(ORIGIN + '/projects/class-teacher.html');
        await t.page.click('#ctTabs button[data-tab="make"]');
        await t.page.fill('#inBan', '2'); await t.page.fill('#inN', '4'); await t.page.fill('#inSize', '2');
        await t.page.selectOption('#inExp', 'custom');
        await t.page.fill('#inCustom', ORIGIN + '/projects/custom-lab.html?id=ohm01');
        assert.equal(await t.page.textContent('#expNote'), '', '준비 중 안내가 없어야 함');
        assert.doesNotMatch(await t.page.textContent('#inExp'), /선생님이 만든 실험…\s*\(페이지 연결 준비 중\)/);
        await t.page.click('#btnCreate');
        await t.page.waitForSelector('#classOut:not([hidden])');
        const classCode = (await t.page.textContent('#outCode')).trim();
        assert.match(classCode, /^2-\d{4}$/);
        const link = await t.page.getAttribute('#outLink', 'href');
        assert.match(link, /custom-lab\.html\?id=ohm01&c=2-\d{4}/);

        // ---------- 학생 A (375px): 조·번호 → 값 넣기 → 보내기 ----------
        const a = await newPage(browser, app, 375, DEF);
        const studentUrl = ORIGIN + '/projects/custom-lab.html?id=ohm01&c=' + classCode;
        await a.page.goto(studentUrl);
        await a.page.waitForSelector('#cs-cpick:not([hidden])');
        // 학생 화면에는 구글 로그인 단추가 없다
        assert.equal(await a.page.isVisible('#btnSignIn'), false);
        await a.page.selectOption('#cs-cjo', '1'); await a.page.selectOption('#cs-cnum', '1');
        await a.page.click('#cs-cjoin');
        await a.page.waitForSelector('#cs-cjoined:not([hidden])');
        await a.page.click('#stepNav button[data-step="data"]');
        const groupCode = await a.page.inputValue('#cs-group');
        assert.match(groupCode, /^2-1-\d{4}$/);
        const fill = async (p, rows) => { for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) await p.fill(`#dataTable input[data-r="${r}"][data-c="${c}"]`, rows[r][c]); };
        await fill(a.page, [['1', '10'], ['2', '20'], ['3', '30']]);
        await a.page.click('#stepNav button[data-step="conclusion"]');
        await a.page.fill('#questions textarea[data-q="0"]', '저항의 역수');
        a.page.on('dialog', d => d.accept());
        await a.page.click('#btnSubmit');
        await a.page.waitForFunction(() => /선생님 시트로 보냈습니다/.test(document.getElementById('submitStatus').textContent));
        assert.ok(await noSideScroll(a.page), '학생 A 가로 스크롤');
        // 시트에는 이름·학번이 없고 조 코드가 글자로 남는다
        const sheet = app.ss.getSheetByName('submissions');
        assert.ok(sheet.rows.length >= 3);
        assert.ok(sheet.written.slice(1).every(r => String(r[2]) === "'" + groupCode), '조 코드는 글자로 저장');
        assert.doesNotMatch(JSON.stringify(sheet.written), /학번|@gmail/);

        // ---------- 학생 B: 같은 조 2번 → 자동 불러오기 ----------
        const b = await newPage(browser, app, 375, DEF);
        await b.page.goto(studentUrl);
        await b.page.waitForSelector('#cs-cpick:not([hidden])');
        await b.page.selectOption('#cs-cjo', '1'); await b.page.selectOption('#cs-cnum', '2');
        await b.page.click('#cs-cjoin');
        await b.page.click('#stepNav button[data-step="data"]');
        await b.page.waitForSelector('#incomingCard:not([hidden])', { timeout: 15000 });
        const inc = await b.page.textContent('#incomingList');
        assert.match(inc, /노트북 [A-Z0-9]{4}/);
        assert.match(inc, /30/);
        assert.match(inc, /저항의 역수/);
        await fill(b.page, [['4', '41']]);
        await b.page.click('#stepNav button[data-step="result"]');
        const ds = await b.page.evaluate(() => window.__charts[0].data.datasets.map(d => [d.label, d.data.length]));
        assert.deepEqual(ds.slice(0, 2), [['측정값', 1], ['📥 불러온 값', 3]]);
        assert.match(await b.page.textContent('#fitResult'), /내 값 \+ 불러온 값.*점 4개/);
        assert.ok(await noSideScroll(b.page), '학생 B 가로 스크롤');
        await b.page.click('#stepNav button[data-step="data"]');
        await b.page.click('#cs-share > summary').catch(() => {});
        assert.deepEqual(await smallButtons(b.page), [], '44px 보다 작은 단추');
        // 단추 글자가 바탕색과 같아 안 보이는 일이 없게 (페이지 CSS 가 공통 단추를 덮어쓰지 않는지)
        const clear = await b.page.$eval('#cs-clear', e => { const c = getComputedStyle(e); return [c.color, c.backgroundColor]; });
        assert.notEqual(clear[0], clear[1], '불러온 값 지우기 단추 글자색');
        b.page.on('dialog', d => d.accept());
        await b.page.click('#stepNav button[data-step="conclusion"]');
        await b.page.click('#btnSubmit');
        await b.page.waitForFunction(() => /선생님 시트로 보냈습니다/.test(document.getElementById('submitStatus').textContent));
        // 새로고침해도 불러온 값이 남음
        await b.page.reload();
        await b.page.click('#stepNav button[data-step="data"]');
        assert.equal(await b.page.isVisible('#incomingCard'), true);

        // ---------- 교사: 진행 보기 ----------
        await t.page.click('#ctTabs button[data-tab="watch"]');
        await t.page.waitForFunction(() => /1조/.test(document.getElementById('groups').textContent));
        const g = await t.page.textContent('#groups');
        assert.match(g, /7 결론|5 데이터/);
        assert.match(g, /점 3/);
        assert.match(g, /제출: \d+개 \(.*측정값 표/);
        assert.match(await t.page.textContent('#watchSum'), /제출한 조\s*1 \/ 2/);

        assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []); assert.deepEqual(t.errors, []);
        await Promise.all([t.ctx.close(), a.ctx.close(), b.ctx.close()]);
    } finally {
        await browser.close();
    }
});

test('화면: 한 화면 방식 · ?c= 없이 열면 조 공유 칸만 (로그인 없이), 휴대폰 375px', { skip: !chromium && 'playwright 없음', timeout: 60000 }, async () => {
    const app = loadCodeGs();
    const browser = await chromium.launch();
    try {
        const def = Object.assign({}, DEF, { layout: 'single' });
        const s = await newPage(browser, app, 375, def);
        await s.page.goto(ORIGIN + '/projects/custom-lab.html?id=ohm01');
        await s.page.waitForSelector('#share-mount #cs-share');
        assert.equal(await s.page.$('.cs-bar'), null, '?c= 없으면 수업 참여 띠 없음');
        assert.equal(await s.page.isVisible('#btnSignIn'), false);
        assert.match(await s.page.textContent('#submitCard'), /구글 로그인은 필요 없/);
        // 조 코드 없이 보내기를 누르면 안내
        await s.page.fill('#dataTable input[data-r="0"][data-c="0"]', '1');
        s.page.on('dialog', d => d.accept());
        await s.page.click('#btnSubmit');
        await s.page.waitForFunction(() => /조 코드를 정하세요/.test(document.getElementById('submitStatus').textContent));
        assert.ok(await noSideScroll(s.page));
        assert.deepEqual(await smallButtons(s.page), []);
        assert.deepEqual(s.errors, []);
        await s.ctx.close();
    } finally {
        await browser.close();
    }
});
