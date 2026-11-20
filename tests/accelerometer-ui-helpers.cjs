// 가속도·자유낙하 화면 시험(Playwright)이 같이 쓰는 도우미 — 가짜 저장소 서버(tests/fake-lab-store.cjs)·사이트 서버, CDN 대역, 기기 흉내
// (이 파일은 시험이 아님: 이름이 .test.cjs 가 아니라 node --test tests/*.test.cjs 에 들어가지 않음)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadLabStore } = require('./fake-lab-store.cjs');

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
                let b = ''; req.on('data', c => { b += c; }); req.on('end', () => app.post(b).then(send));
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
    await ctx.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.LAB_STORE_FAKE_URL=${JSON.stringify(S.API)};window.PENDULUM_CONFIG={pollSeconds:3};` }));
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
    // 수업 없이 연 노트북 화면(2026-11-20~)은 조 공유 칸이 없고 '📱 폰으로 측정해 보내기' 카드의 짝 QR 만 → 그 주소
    await L.waitForSelector('.cs-pcard a, #cs-group', { state: 'attached', timeout: 15000 });
    if (!(await L.locator('#cs-group').count())) return L.getAttribute('.cs-pcard a', 'href');
    // 수업(?c=) 화면은 조 공유 칸이 접혀 있음 (QR 카드가 먼저) → 펼쳐서 조 코드를 넣음
    await L.evaluate(() => { const d = document.getElementById('cs-share'); if (d) d.open = true; });
    await L.fill('#cs-group', group);
    await L.waitForTimeout(300);
    await L.click('#cs-phone');
    await L.waitForSelector('.cs-dlg:not([hidden]) #cs-plink', { state: 'attached' });
    const link = await L.getAttribute('#cs-plink', 'href');
    await L.keyboard.press('Escape').catch(() => {});
    return link;
}


// 자유낙하: 영상 대신 프레임 그림을 넣고 '수동 선택 시작' (폰·태블릿 화면에서)
async function fakeFrames(P, n) {
    await P.evaluate(n => {
        canvas.width = 400; canvas.height = 300; canvasStrobo.width = 400; canvasStrobo.height = 300;
        frames = Array.from({ length: n }, (_, i) => ({ img: new ImageData(400, 300), time: i / 30 }));
        fpsInput.value = '30'; fps = 30;
        finishExtraction();
    }, n);
}
// 자유낙하하는 공 자리(캔버스 좌표, 2 mm/px·g = 9.8 m/s²)를 손가락으로 차례로 누름
async function tapFall(P, count) {
    const want = Array.from({ length: count }, (_, i) => ({ x: 200, y: 20 + 0.5 * 9800 * (i / 30) ** 2 / 2 }));
    for (const w of want) {
        await P.locator('#canvas').scrollIntoViewIfNeeded();   // 손가락은 화면 안만 누를 수 있음
        const box = await P.locator('#canvas').boundingBox();
        await P.touchscreen.tap(box.x + w.x * box.width / 400, box.y + w.y * box.height / 300);
        await P.waitForTimeout(450);   // 누르면 0.3초 뒤 다음 프레임
    }
    return want;
}
// 스마트폰 가속도: 시작 → 흔들기(devicemotion 6번) → 중지
async function shake(P, k) {
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

module.exports = { loadLabStore, chromium, devices, servers, open, overflow, smallButtons, phoneLink, fakeFrames, tapFall, shake };
