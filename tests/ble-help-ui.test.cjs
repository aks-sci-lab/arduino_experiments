// 블루투스 공통 도우미(js/ble-help.js) 화면 시험 (Playwright)
//  아이폰 흉내 + 블루투스 없음 → 연결 단추를 누르면 Bluefy 안내·주소 복사 (주소에 ?c=·?s= 그대로)
//  안드로이드 흉내 + 블루투스 없음 / 노트북 → 안내 안 뜸 (페이지 기존 안내 그대로)
//  아이폰 흉내 + 블루투스 있음(Bluefy 앱 안을 흉내) → 안내 없이 바로 연결 흐름
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fakeGoDirect } = require('./fake-godirect.cjs');

let chromium = null, devices = null;
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://lab.test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm' };
const FAKE_CHART = 'window.Chart=class{constructor(c,o){this.data=o.data;this.options=o.options;}update(){}destroy(){}resize(){}};window.Chart.register=function(){};';
// 블루투스로 연결하는 페이지와 연결 단추
const PAGES = [
    ['/projects/ble-explorer.html', '#btnScan'],
    ['/projects/environment-lab.html', '#connectBleButton'],
    ['/projects/accelerometer-lab.html', '#connectBleButton'],
    ['/projects/arduino-nano-lab.html', '#connectButton'],
    ['/projects/ideal-gas.html?c=2-4821&s=lab:ctestspace', '#btn-connect']
];

async function newPage(browser, device, opts) {
    const ctx = await browser.newContext(Object.assign({}, device || { viewport: { width: 1200, height: 800 } }, { permissions: ['clipboard-read', 'clipboard-write'] }));
    await ctx.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'cdn.jsdelivr.net' && /chart\.js/.test(u.pathname)) return route.fulfill({ contentType: 'application/javascript', body: FAKE_CHART });
        if (u.origin !== ORIGIN) return route.abort();
        const file = path.join(ROOT, decodeURIComponent(u.pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    if (opts.noBluetooth) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true }); });
    if (opts.fake) await ctx.addInitScript(fakeGoDirect, { install: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.dismiss());
    return { ctx, page, errors };
}
async function clickConnect(page, sel) {
    // 단계 탭 안의 단추는 그 단계를 열어야 보인다
    await page.evaluate(s => {
        const b = document.querySelector(s);
        const panel = b && b.closest('[data-step], [data-tab]');
        if (!panel || !panel.hidden) return;
        const key = panel.dataset.step ? 'step' : 'tab';
        const t = Array.from(document.querySelectorAll('nav button[data-' + key + ']')).find(x => x.dataset[key] === panel.dataset[key]);
        if (t) t.click();
    }, sel);
    await page.locator(sel).first().click({ timeout: 5000 });
}

test('아이폰 + 블루투스 없음: 연결 단추 → Bluefy 안내·주소 복사', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const browser = await chromium.launch();
    try {
        for (const [url, sel] of PAGES) {
            const { ctx, page, errors } = await newPage(browser, devices['iPhone 13'], { noBluetooth: true });
            await page.goto(ORIGIN + url);
            assert.equal(await page.evaluate(() => window.BleHelp.needsBluefy()), true, url);
            await clickConnect(page, sel);
            await page.waitForSelector('#bleHelpBluefy:not([hidden])', { timeout: 5000 });
            const text = await page.textContent('#bleHelpBluefy');
            assert.match(text, /Bluefy – Web BLE Browser/, url);
            assert.match(text, /보증하지 않아요/);
            assert.equal(await page.inputValue('#bleHelpBluefy .ble-help-url'), await page.evaluate(() => location.href), '지금 주소 그대로');
            const box = await page.$eval('#bleHelpBluefy .ble-help-card', el => { const r = el.getBoundingClientRect(); return { w: r.width, left: r.left }; });
            assert.ok(box.left >= 0 && box.w <= 390, '휴대폰 폭 안');
            const small = await page.$$eval('#bleHelpBluefy button', bs => bs.filter(b => b.getBoundingClientRect().height < 43.5).length);
            assert.equal(small, 0, '안내 단추 44px');
            await page.click('#bleHelpBluefy .ble-help-copy');
            await page.waitForFunction(() => /복사/.test(document.querySelector('#bleHelpBluefy .ble-help-msg').textContent));
            if (/ideal-gas/.test(url)) {
                assert.match(await page.inputValue('#bleHelpBluefy .ble-help-url'), /\?c=2-4821&s=lab:ctestspace/);
                assert.match(await page.evaluate(() => navigator.clipboard.readText()), /c=2-4821/);
            }
            await page.click('#bleHelpBluefy .ble-help-close');
            assert.equal(await page.isVisible('#bleHelpBluefy'), false);
            assert.deepEqual(errors, [], url);
            await ctx.close();
        }
    } finally { await browser.close(); }
});

test('안드로이드·노트북 + 블루투스 없음: Bluefy 안내 안 뜸', { skip: !chromium && 'playwright 없음', timeout: 60000 }, async () => {
    const browser = await chromium.launch();
    try {
        for (const device of [devices['Pixel 7'], null]) {
            const { ctx, page } = await newPage(browser, device, { noBluetooth: true });
            await page.goto(ORIGIN + '/projects/ble-explorer.html');
            assert.equal(await page.evaluate(() => window.BleHelp.needsBluefy()), false);
            await page.click('#btnScan');
            await page.waitForTimeout(300);
            assert.equal(await page.$('#bleHelpBluefy'), null, '안내 없음');
            assert.match(await page.textContent('#support'), /크롬·엣지|지원하지 않아요/, '기존 안내 그대로');
            await ctx.close();
        }
    } finally { await browser.close(); }
});

test('아이폰 + 블루투스 있음(Bluefy 앱 안): 안내 없이 바로 연결', { skip: !chromium && 'playwright 없음', timeout: 60000 }, async () => {
    const browser = await chromium.launch();
    try {
        const { page, errors } = await newPage(browser, devices['iPhone 13'], { fake: true });
        await page.goto(ORIGIN + '/projects/ble-explorer.html');
        assert.equal(await page.evaluate(() => window.BleHelp.needsBluefy()), false);
        await page.click('#btnScan');
        await page.waitForFunction(() => /연결됨/.test(document.getElementById('status').textContent));
        assert.equal(await page.$('#bleHelpBluefy'), null);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});
