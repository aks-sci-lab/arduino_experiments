// 📱 폰 연결 시험: 스마트폰 가속도·자유낙하 — 노트북(1280) QR → 폰(Pixel 7)에서 여러 회 측정 → 보낼 회차 골라 📤 → 노트북에 📱 폰 회차로 들어와 그래프·분석
// 가짜 Apps Script(tests/fake-apps-script.cjs)를 작은 HTTP 서버로 띄우고 js/pendulum-config.js 요청을 가로채 그 주소로 보낸다.
// CDN(Chart.js)은 시험 환경에서 막혀 있어 대역을 쓴다. 폰 센서는 devicemotion 이벤트를 직접 만들어 넣고, 자유낙하는 영상 대신 프레임 그림을 넣어 손가락 누르기를 시험한다.
// Playwright 가 없는 컴퓨터에서는 건너뛴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadCodeGs } = require('./fake-apps-script.cjs');

let chromium = null, devices = null;
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const CHART_STUB = `
window.Chart = class Chart {
  constructor(el, cfg) { this.config = cfg; this.data = cfg.data; this.options = cfg.options || {}; window.__charts = (window.__charts || []).concat(this);
    this.scales = { x: { getPixelForValue: () => 0, getValueForPixel: () => 0 } }; this.chartArea = { left: 0, right: 1, top: 0, bottom: 1 }; }
  update() {} destroy() {} resize() {}
};
window.Chart.helpers = { getRelativePosition: () => ({ x: 0, y: 0 }) };`;
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg viewBox=\\"0 0 10 10\\"></svg>"}}};';

function servers(app) {
    const api = http.createServer((req, res) => {
        const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
        const u = new URL(req.url, 'http://x');
        if (req.method === 'GET') return send(app.get(Object.fromEntries(u.searchParams)));
        let b = ''; req.on('data', c => { b += c; }); req.on('end', () => send(app.post(b)));
    });
    const site = http.createServer((req, res) => {
        const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return Promise.all([api, site].map(s => new Promise(r => s.listen(0, '127.0.0.1', r)))).then(() => ({
        api, site, API: 'http://127.0.0.1:' + api.address().port + '/exec', BASE: 'http://127.0.0.1:' + site.address().port
    }));
}

async function open(browser, S, opt, name, errors) {
    const ctx = await browser.newContext(opt);
    await ctx.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.PENDULUM_CONFIG={appsScriptUrl:${JSON.stringify(S.API)},pollSeconds:3};` }));
    await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|www\.gstatic\.com)\//, r => {
        const u = r.request().url();
        r.fulfill({ contentType: 'text/javascript', body: /chart\.umd/.test(u) ? CHART_STUB : /qrcode/.test(u) ? QR : '' });
    });
        // 시험 브라우저의 Pixel 7 흉내는 동작 센서 허용 창(requestPermission)이 늘 '거절'이라 '허용'으로 바꿔 둔다
    await ctx.addInitScript(() => {
        if (typeof window.DeviceMotionEvent === 'undefined') window.DeviceMotionEvent = class extends Event {};
        if (typeof window.DeviceMotionEvent.requestPermission === 'function') window.DeviceMotionEvent.requestPermission = async () => 'granted';
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    return { ctx, page };
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const smallButtons = page => page.evaluate(() => [...document.querySelectorAll('button, select, .cs-btn')]
    .filter(e => e.offsetParent && !e.closest('table, .steps') && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim()));
async function phoneLink(L, group) {
    await L.fill('#cs-group', group);
    await L.waitForTimeout(300);
    await L.click('#cs-phone');
    await L.waitForSelector('.cs-dlg:not([hidden]) #cs-plink', { state: 'attached' });
    const link = await L.getAttribute('#cs-plink', 'href');
    await L.keyboard.press('Escape').catch(() => {});
    return link;
}

test('📱 스마트폰 가속도: 폰에서 3회 → 1·3회만 보내기 → 노트북에 📱 폰 기록, 📈 보기', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadCodeGs(), S = await servers(app), browser = await chromium.launch(), errors = [];
    try {
        const { page: L } = await open(browser, S, { viewport: { width: 1280, height: 800 } }, 'L', errors);
        await L.goto(S.BASE + '/projects/phone-accelerometer.html');
        const link = await phoneLink(L, '2-3-5376');
        assert.match(link, /phone-accelerometer\.html\?.*role=phone&group=2-3-5376/);

        const { page: P } = await open(browser, S, devices['Pixel 7'], 'P', errors);
        await P.goto(link);
        await P.waitForSelector('.cs-phone');
        assert.equal(await P.evaluate(() => document.body.classList.contains('is-phone')), true);
        // 세 번 측정 (시작 → 흔들기 → 중지), 회차마다 크기가 다르게
        for (const k of [1, 2, 3]) {
            await P.click('#btn-start');
            await P.evaluate(k => {
                for (let i = 0; i < 6; i++) {
                    const e = new Event('devicemotion');
                    e.accelerationIncludingGravity = { x: 0, y: k * (i % 2), z: 9.80665 };
                    window.dispatchEvent(e);
                }
            }, k);
            await P.click('#btn-stop');
        }
        assert.equal(await P.locator('.cs-run').count(), 3, '폰 회차 목록');
        assert.equal(await P.isHidden('#runs-box'), true, '폰은 띠 안의 목록만');
        await P.locator('.cs-run input[type=checkbox]').nth(1).uncheck();
        assert.match(await P.textContent('#cs-rsend'), /2개/);
        assert.equal(await overflow(P), 0, '폰 가로 스크롤');
        assert.deepEqual(await smallButtons(P), [], '폰 44px');
        await P.click('#cs-rsend');
        await P.waitForFunction(() => /보냈/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 15000 });

        // 노트북: 📱 폰 기록 2개가 저절로 (🆕, 그래프에 겹쳐 보임)
        await L.waitForFunction(() => document.querySelectorAll('#in-list li').length === 2, null, { timeout: 15000 });
        const txt = await L.textContent('#in-list');
        assert.match(txt, /🆕 📱 폰 \w{4} · 1회.*샘플 6개/);
        assert.match(txt, /📱 폰 \w{4} · 3회.*최대 \|a\| 1\.046 g/);
        assert.doesNotMatch(txt, /2회/);
        assert.equal(await L.locator('#in-list input:checked').count(), 2, '새 기록은 그래프에 겹쳐 보기');
        await L.click('#in-list [data-view="1"]');
        assert.match(await L.textContent('#record-status'), /📈 보는 중: 📱 폰 \w{4} · 3회 \(샘플 6개\)/);
        assert.equal(await L.evaluate(() => window.__charts[0].data.datasets[1].data.length), 6, '그래프에 Ay 6점');
        assert.equal(await overflow(L), 0);
        assert.equal(app.get({ action: 'list', exp: 'phoneaccel', group: '2-3-5376' }).items.length, 2);
        // 폰에서 회차를 지우면 노트북에서도 빠짐
        P.once('dialog', d => d.accept());
        await P.click('[data-del]');
        await L.waitForFunction(() => document.querySelectorAll('#in-list li').length === 1, null, { timeout: 15000 });
        assert.deepEqual(errors, []);
    } finally { await browser.close(); S.api.close(); S.site.close(); }
});

test('📱 자유낙하: 폰에서 프레임에 손가락으로 점 찍기 → 회차 2개 → 하나 보내기 → 노트북 📈 보기로 g', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadCodeGs(), S = await servers(app), browser = await chromium.launch(), errors = [];
    try {
        const { page: L } = await open(browser, S, { viewport: { width: 1280, height: 800 } }, 'L', errors);
        await L.goto(S.BASE + '/projects/free-fall.html#step-5');
        const link = await phoneLink(L, '2-4-1111');

        const { page: P } = await open(browser, S, devices['Pixel 7'], 'P', errors);
        await P.goto(link);
        await P.waitForSelector('.cs-phone');
        assert.equal(await P.isVisible('.phone-only'), true, '폰 안내 + 바로 5. 데이터');
        assert.equal(await overflow(P), 0, '폰 가로 스크롤');
        // 영상 대신 10프레임(30 fps)을 넣는다: 400×300 그림
        await P.evaluate(() => {
            canvas.width = 400; canvas.height = 300; canvasStrobo.width = 400; canvasStrobo.height = 300;
            frames = Array.from({ length: 10 }, (_, i) => ({ img: new ImageData(400, 300), time: i / 30 }));
            fpsInput.value = '30'; fps = 30;
            finishExtraction();
        });
        await P.fill('#pixel-to-mm', '2');
        await P.click('#btn-manual-track');
        // 공이 자유낙하하는 자리(캔버스 좌표)를 화면 좌표로 바꿔 손가락으로 톡 누름: y = 20 + ½·g·t² (2 mm/px, g = 9.8 m/s²)
        const want = [0, 1, 2, 3, 4, 5].map(i => ({ x: 200, y: 20 + 0.5 * 9800 * (i / 30) ** 2 / 2 }));
        for (let i = 0; i < want.length; i++) {
            const box = await P.locator('#canvas').boundingBox();
            await P.touchscreen.tap(box.x + want[i].x * box.width / 400, box.y + want[i].y * box.height / 300);
            await P.waitForTimeout(450);   // 누르면 0.3초 뒤 다음 프레임
            assert.equal(await P.evaluate(() => dataPoints.length), i + 1, '한 번 누르면 점 하나 (마우스 흉내로 두 번 들어가지 않음)');
            assert.equal(await P.evaluate(() => currentFrameIndex), i + 1, '다음 프레임으로 한 칸만');
        }
        const got = await P.evaluate(() => dataPoints.map(d => [d.frameIndex, d.x, d.y]));
        got.forEach(([f, x, y], i) => {
            assert.equal(f, i);
            assert.ok(Math.abs(x - want[i].x) <= 1.5 && Math.abs(y - want[i].y) <= 1.5, `손가락 자리 ${i}: ${x},${y} ↔ ${want[i].x},${want[i].y}`);
        });
        await P.click('#btn-strobo');
        await P.waitForFunction(() => document.querySelectorAll('.cs-run').length === 1);
        // 두 번째 '영상'(같은 점, 다른 회차)
        await P.evaluate(() => { videoTag = 'second'; });
        await P.click('#btn-strobo');
        await P.waitForFunction(() => document.querySelectorAll('.cs-run').length === 2);
        assert.match(await P.textContent('.cs-runs'), /1회 자유낙하.*2회 자유낙하/s);
        await P.locator('.cs-run input[type=checkbox]').first().uncheck();
        assert.equal(await overflow(P), 0, '폰 가로 스크롤 (회차 목록)');
        await P.click('#cs-rsend');
        await P.waitForFunction(() => /보냈/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 15000 });
        const rows = app.get({ action: 'list', exp: 'freefall', group: '2-4-1111' }).items;
        assert.equal(rows.length, 1);
        const data = JSON.parse(rows[0].data);
        assert.equal(data.fps, 30); assert.equal(data.mmPerPx, 2); assert.equal(data.rows.length, 6);

        // 노트북: 6. 결과로 넘어가고 📥 📱 폰 회차 → 📈 보기 → g ≈ 9.8
        await L.waitForFunction(() => /📱 폰/.test(document.getElementById('group-table-body').textContent), null, { timeout: 15000 });
        await L.waitForFunction(() => !document.querySelector('.step-panel[data-step=result]').hidden);
        assert.match(await L.textContent('#group-table-body'), /📥 📱 폰 \w{4}2회 자유낙하/);
        await L.click('#group-table-body [data-view="0"]');
        const fit = await L.textContent('#fit-result');
        const g = Number(/g = 2c\s*([\d.]+)/.exec(fit)[1]);
        assert.ok(Math.abs(g - 9.8) < 0.3, '노트북에서 구한 g ' + g);
        assert.match(await L.textContent('#view-who'), /📱 폰 \w{4} · 2회 자유낙하/);
        assert.equal(await overflow(L), 0);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); S.api.close(); S.site.close(); }
});
