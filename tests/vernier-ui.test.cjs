// 버니어 Go Direct 화면 시험 (Playwright). 가짜 Go Direct 센서(tests/fake-godirect.cjs)는 버니어 공개 도구의 명령·응답을 그대로 흉내 내고,
// 처음 인사(init)를 받지 못하면 잠시 뒤 스스로 끊는다(선생님 실측 '연결 완료 뒤 10초쯤 뒤 끊김', 시험은 1.5초로 줄임).
//  1) 해석 도구: 처음 인사 자동 끔 → 끊김 '몇 초 만에'·🔄 다시 연결·연결 기록 / 다시 연결 + '버니어 초기화 보내기' → 유지 / 자동 켬 → 유지
//  2) 선생님이 만든 실험: 버니어 센서 연결 → 채널 목록·칸마다 고르기 → 지금 값·그래프 → 표에 넣기 → CSV → 조 공유(가짜 저장소) (375px·44px)
//  3) 페이지를 떠나면 연결 끊기 (공통 js/ble-help.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/custom-lab-math.js');
const { loadLabStore } = require('./fake-lab-store.cjs');
const { fakeGoDirect } = require('./fake-godirect.cjs');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://lab.test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm' };
const FAKE_CHART = 'window.__charts=[];window.Chart=class{constructor(c,o){this.data=o.data;this.options=o.options;window.__charts.push(this);}update(){}destroy(){}};';
const SHOTS = process.env.VERNIER_SHOTS;

const DEF = M.normalizeDefinition({
    title: '용수철 힘 재기', description: '버니어 힘 센서로 힘을 재요', published: true, layout: 'single',
    columns: [{ name: 'Force', unit: 'N' }, { name: '늘어난 길이', unit: 'cm' }],
    xCol: 1, yCol: 0, fit: 'linear', questions: [], stepTexts: {}, sensor: { mode: 'vernier', fields: ['ch1', 'ch2'] }
});

async function newPage(browser, app, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: opts.width || 375, height: 800 }, acceptDownloads: true });
    await ctx.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'script.google.com') {
            const req = route.request();
            const body = req.method() === 'POST' ? await app.post(req.postData() || '{}') : await app.get(Object.fromEntries(u.searchParams));
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
        }
        if (u.hostname === 'cdn.jsdelivr.net' && /chart\.js/.test(u.pathname)) return route.fulfill({ contentType: 'application/javascript', body: FAKE_CHART });
        if (u.origin !== ORIGIN) return route.abort();
        const file = path.join(ROOT, decodeURIComponent(u.pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await ctx.addInitScript(() => { window.LAB_STORE_FAKE_URL = 'https://script.google.com/macros/s/FAKE_LAB_STORE/exec'; });
    await ctx.addInitScript(fakeGoDirect, Object.assign({ install: true }, opts.fake || {}));
    if (opts.def) await ctx.addInitScript(d => { try { localStorage.setItem('customLabDef:v1:gdx01', d); } catch (e) { /* */ } }, JSON.stringify(opts.def));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    return { ctx, page, errors };
}
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const smallButtons = page => page.evaluate(() => Array.from(document.querySelectorAll('button, .cs-btn, select, label.btn'))
    .filter(b => b.offsetParent !== null && !b.closest('table') && !b.closest('td'))
    .filter(b => b.getBoundingClientRect().height < 43.5).map(b => (b.id || b.textContent.trim()).slice(0, 30)));
const wait = ms => new Promise(r => setTimeout(r, ms));

test('해석 도구: 버니어는 처음 인사가 없으면 끊기고(몇 초 만에·다시 연결·기록), 보내면 연결 유지', { skip: !chromium && 'playwright 없음', timeout: 90000 }, async () => {
    const browser = await chromium.launch();
    try {
        const app = loadLabStore();
        const { page, errors } = await newPage(browser, app, { fake: { idleMs: 1500 } });
        await page.goto(ORIGIN + '/projects/ble-explorer.html');
        // 버니어 서비스가 기본으로 열어 볼 서비스에 들어 있다
        await page.click('#svcBox summary');
        assert.equal(await page.isChecked('#stdServices input[data-svc="d91714ef-28b9-4f91-ba16-f0d9a604f112"]'), true);
        // ① 자동 보내기를 끄고 연결 → 일반 센서처럼 명령 없음 → 끊김
        await page.evaluate(() => { try { localStorage.setItem('ble-explorer:vernierAuto', '0'); } catch (e) { /* */ } });
        await page.reload();
        await page.click('#btnScan');
        await page.waitForSelector('#vernierBox:not([hidden])');
        assert.equal(await page.isChecked('#vernierAuto'), false);
        assert.match(await page.textContent('#vendorNote'), /버니어 공개 방식/);
        assert.deepEqual(await page.evaluate(() => window.__gdx.commands), [], '자동 끔: 아무 명령도 보내지 않음');
        await page.waitForFunction(() => /끊김: \d+\.\d초 만에/.test(document.getElementById('status').textContent), null, { timeout: 5000 });
        assert.equal(await page.isVisible('#btnReconnect'), true);
        const log1 = await page.textContent('#eventLog');
        assert.match(log1, /끊김: 1\.\d초 만에/);
        assert.match(log1, /연결됨/);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'vernier-1-drop.png'), fullPage: true });

        // ② 🔄 다시 연결(기기 고르는 창 없이) → 📨 버니어 초기화 보내기 → 유지
        await page.click('#btnReconnect');
        await page.waitForFunction(() => /연결됨/.test(document.getElementById('status').textContent));
        await page.click('#btnVernierInit');
        await page.waitForFunction(() => /보냈어요/.test(document.getElementById('vernierMsg').textContent));
        const cmds = await page.evaluate(() => window.__gdx.commands);
        assert.deepEqual(cmds.slice(0, 2), [0x1a, 0x10], '처음 인사 → 상태 묻기');
        await wait(2500);
        assert.equal(await page.evaluate(() => window.__gdx.idleDrops), 1, '처음 인사 뒤로는 끊기지 않음');
        assert.match(await page.textContent('#status'), /연결됨/);
        // 센서의 답(응답 특성 알림)이 기록에 남는다
        assert.ok(await page.evaluate(() => document.getElementById('countBadge').textContent.match(/기록 (\d+)개/)[1] > 0));

        // ③ 자동 켬: 연결하자마자 보냄 → 유지
        await page.check('#vernierAuto');
        await page.click('#btnScan');
        await page.waitForFunction(() => /보냈어요/.test(document.getElementById('vernierMsg').textContent));
        await wait(2500);
        assert.equal(await page.evaluate(() => window.__gdx.idleDrops), 1);
        assert.match(await page.textContent('#status'), /연결됨/);
        assert.ok(await noSideScroll(page), '가로 스크롤');
        assert.deepEqual(await smallButtons(page), []);

        // 연결 기록이 내려받는 기록 JSON 에도 들어간다
        await page.click('#bxTabs [data-tab="save"]');
        await page.click('#saveTabs [data-tab="logfile"]');
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnLogJson')]);
        const log = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
        assert.ok(log.meta.events.some(e => e.kind === 'disconnect' && /초 만에/.test(e.text)));
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});

test('선생님이 만든 실험: 버니어 연결 → 채널 → 값·그래프 → 표에 넣기 → CSV → 조 공유 (375px)', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const browser = await chromium.launch();
    try {
        const app = loadLabStore();
        // 실제 센서처럼 처음 인사를 기다렸다 끊는 가짜 (공개 도구는 연결하자마자 보내므로 끊기지 않아야 함)
        const { page, errors } = await newPage(browser, app, { def: DEF, fake: { idleMs: 1500 } });
        await page.goto(ORIGIN + '/projects/custom-lab.html?id=gdx01');
        await page.waitForSelector('#sensorCard:not([hidden])');
        assert.match(await page.textContent('#sensorName'), /Vernier Go Direct/);
        assert.match(await page.textContent('#sensorStatus'), /Vernier Go Direct 센서의 전원/);
        assert.match(await page.textContent('#vernierCredit'), /BSD 3-Clause/);
        await page.click('#btnSensorConnect');
        // 공개 도구를 사이트에서 불러와 GDX 로 시작하는 기기만 고르게 한다
        await page.waitForSelector('#vernierMap:not([hidden])', { timeout: 15000 });
        const opts = await page.evaluate(() => window.__gdx.requestOpts);
        assert.deepEqual(opts.filters, [{ namePrefix: 'GDX' }]);
        // 채널 목록 3개, 칸 1 = 센서 기본(Force), 칸 2 = 다음 채널
        const options = await page.$$eval('#vernierMap select', ss => Array.from(ss[0].options, o => o.textContent));
        assert.deepEqual(options, ['Force (N)', 'X-axis acceleration (m/s²)', 'Y-axis acceleration (m/s²)']);
        const sels = await page.$$eval('#vernierMap select', ss => ss.map(s => s.value));
        assert.deepEqual(sels, ['1', '2']);
        await page.waitForFunction(() => /1\.250/.test(document.getElementById('sensorReadouts').textContent));
        assert.match(await page.textContent('#sensorReadouts'), /Force/);
        // 칸 2 를 Y 축 가속도로 바꾸면 값이 따라 바뀐다
        await page.locator('#vernierMap select').nth(1).selectOption('3');
        await page.waitForFunction(() => /-9\.800/.test(document.getElementById('sensorReadouts').textContent));
        assert.match(await page.textContent('#sensorReadouts'), /Y-axis acceleration/);
        // 그래프 제목도 채널 이름
        assert.match(await page.evaluate(() => window.__charts.map(c => c.data.datasets[0].label).join('|')), /Force \(N\)\|Y-axis acceleration/);
        // 처음 인사를 공개 도구가 보냈으므로 끊기지 않음
        await wait(2500);
        assert.equal(await page.evaluate(() => window.__gdx.idleDrops), 0, '공개 도구로 연결하면 끊기지 않음');
        assert.equal(await page.isVisible('#btnSensorDisconnect'), true);

        // 기록 → 표에 넣기(열 이름 Force 와 같음) → CSV
        await page.click('#btnRec');
        await page.evaluate(() => { window.__gdx.force = 2.5; });
        await wait(800);
        await page.click('#btnRec');
        await page.click('#btnToTable');
        assert.equal(await page.inputValue('#dataTable input[data-r="0"][data-c="0"]'), '2.500');
        const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#btnSeriesCsv')]);
        const csvText = fs.readFileSync(await csv.path(), 'utf8');
        assert.match(csvText, /Force/);
        assert.match(csvText, /Y-axis acceleration/);
        assert.ok(await noSideScroll(page), '가로 스크롤');
        assert.deepEqual(await smallButtons(page), []);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'vernier-2-custom.png'), fullPage: true });

        // 조 공유: 수업 없이 연 화면이라 조 공유·선생님께 보내기 없음 (2026-11-20)
        assert.equal(await page.locator('#cs-share').count(), 0);
        assert.equal(await page.isVisible('#btnSubmit'), false);
        await page.fill('#dataTable input[data-r="0"][data-c="1"]', '4');
        // 수업 QR 로 다시 들어오면 조 공유 → 보내기 → 가짜 저장소에 센서 기록이 채널 이름으로
        const cls = await app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'custom:gdx01' });
        assert.equal(cls.ok, true, cls.error);
        await page.goto(ORIGIN + '/projects/custom-lab.html?id=gdx01&c=' + cls.classCode + '&s=' + cls.space);
        await page.waitForSelector('#cs-cpick:not([hidden])', { timeout: 15000 });
        await page.selectOption('#cs-cjo', '1'); await page.selectOption('#cs-cnum', '1'); await page.click('#cs-cjoin');
        await page.waitForSelector('#cs-cjoined:not([hidden])');
        await page.click('#btnSubmit');
        await page.waitForFunction(() => /보냈습니다/.test(document.getElementById('submitStatus').textContent), null, { timeout: 15000 });
        const items = app.items('custom:gdx01');
        const sensorItem = items.find(i => /sensor/.test(i.id));
        assert.ok(sensorItem, '센서 기록 줄');
        assert.match(JSON.stringify(sensorItem), /Force/);
        // 새로고침해도 채널 이름 기억
        await page.reload();
        await page.waitForSelector('#sensorCard:not([hidden])');
        assert.match(await page.textContent('#sensorReadouts'), /Force/);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});

test('공통 도우미: 페이지를 떠나면 블루투스 연결을 끊는다', { skip: !chromium && 'playwright 없음', timeout: 60000 }, async () => {
    const browser = await chromium.launch();
    try {
        const app = loadLabStore();
        const { page } = await newPage(browser, app, {});
        await page.goto(ORIGIN + '/projects/ble-explorer.html');
        await page.click('#btnScan');
        await page.waitForFunction(() => /연결됨/.test(document.getElementById('status').textContent));
        assert.equal(await page.evaluate(() => window.BleHelp.devices().length), 1);
        assert.equal(await page.evaluate(() => window.BleHelp.devices()[0].gatt.connected), true);
        // pagehide 를 직접 보내 확인 (실제 이동은 페이지가 사라져 값을 볼 수 없음)
        await page.evaluate(() => { window.__gdx.leftConnected = null; window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); });
        assert.equal(await page.evaluate(() => window.BleHelp.devices()[0].gatt.connected), false, 'pagehide 에 끊음');
        // 뒤로 가기 캐시에서 돌아오면 다시 연결 안내
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
        assert.equal(await page.isVisible('#bleHelpReconnect'), true);
        assert.match(await page.textContent('#bleHelpReconnect'), /다시 눌러/);
    } finally { await browser.close(); }
});
