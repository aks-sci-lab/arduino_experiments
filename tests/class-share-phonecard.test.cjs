// 📱 노트북의 '폰으로 측정해 보내기' 카드 (js/class-share.js 의 share.phoneCard) — 폰 측정 · 노트북 분석 이원화
//  조 코드 없이 열어도 이 노트북용 조 코드를 저절로 만들고 QR 주소(role=phone&group&s)를 보임 → 폰이 보내면 카드에 🆕
//  가짜 Apps Script(Code.gs 를 Node 에서), Playwright 가 없으면 건너뜀
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadCodeGs } = require('./fake-apps-script.cjs');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const SCRIPT_ID = 'AKfycbFAKEphonecardTEST0123456789ab';
const PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/css/lab-base.css"><script src="/js/lab-ui.js"></script><link rel="stylesheet" href="/css/class-share.css"></head>
<body><main><div id="pc" class="show-on-laptop"></div><div id="mount"></div></main>
<script src="/js/pendulum-config.js"></script><script src="/js/pendulum-cloud.js"></script><script src="/js/class-cloud.js"></script><script src="/js/class-share.js"></script>
<script>
window.got = [];
window.mine = [{ id: 'run1', title: '1회차', n: 5, summary: { '점': 5 }, data: { pts: [1, 2, 3, 4, 5] } }];
window.share = ClassShare.init({ exp: 'malus', shareMount: '#mount', phone: true, autoSendOnSave: true,
    getItems: () => window.mine, onIncoming: ext => { window.got = Object.values(ext || {}); }, getStep: () => 'data', getPoints: () => 5 });
if (!share.isPhone()) share.phoneCard('#pc');
</script></body></html>`;

function serve() {
    const types = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
    return http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        if (u.pathname === '/t.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
        const file = path.join(ROOT, decodeURIComponent(u.pathname));
        if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
        fs.readFile(file, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain' }); res.end(d); });
    });
}
async function open(browser, app, url, ctxOpts) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://script.google.com/macros/s/**', async route => {
        const req = route.request();
        const out = req.method() === 'POST' ? app.post(req.postData() || '') : app.get(Object.fromEntries(new URL(req.url()).searchParams));
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(out), headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.route(/^https:\/\/(cdn\.jsdelivr\.net|www\.gstatic\.com)\//, r => r.abort());
    await page.goto(url);
    return { ctx, page, errors };
}

test('📱 폰 카드: 조 코드 없이도 QR 주소 → 폰이 보내면 노트북 카드에 🆕', { skip: !chromium && 'playwright 없음', timeout: 90000 }, async () => {
    const app = loadCodeGs();
    const server = serve().listen(0);
    const base = 'http://localhost:' + server.address().port + '/t.html';
    const browser = await chromium.launch();
    try {
        const L = await open(browser, app, base + '?s=' + SCRIPT_ID, { viewport: { width: 1280, height: 800 } });
        const lp = L.page;
        await lp.waitForSelector('#pc .cs-pcard');
        const group = await lp.evaluate(() => share.group());
        assert.match(group, /^99-\d{1,2}-\d{4}$/, '조 코드를 저절로 ' + group);
        const link = await lp.getAttribute('#pc a', 'href');
        const u = new URL(link);
        assert.equal(u.searchParams.get('role'), 'phone');
        assert.equal(u.searchParams.get('group'), group);
        assert.equal(u.searchParams.get('s'), SCRIPT_ID);
        assert.match(await lp.textContent('#pc'), /기다리는 중/);
        assert.match(await lp.textContent('#pc'), /QR 도구를 불러오지 못했어요/, 'QR 도구가 막히면 주소 안내');
        assert.equal(await lp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        // 다시 그려도 조 코드는 그대로
        await lp.reload();
        await lp.waitForSelector('#pc .cs-pcard');
        assert.equal(await lp.evaluate(() => share.group()), group);

        // 폰: 같은 주소(QR) 로 열고 측정 저장 → 보내기 (이 시험은 autoSendOnSave)
        const P = await open(browser, app, link.replace(/^https?:\/\/[^/]+\/[^?]*/, base), { viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
        assert.equal(await P.page.evaluate(() => share.isPhone()), true);
        assert.equal(await P.page.isVisible('#pc'), false, '폰에는 카드 없음');
        const r = await P.page.evaluate(() => share.saved());
        assert.equal(r.ok, true, JSON.stringify(r));

        await lp.waitForFunction(() => /폰에서 새 측정 1개/.test(document.getElementById('pc').textContent), null, { timeout: 15000 });
        assert.equal(await lp.evaluate(() => got.length), 1);
        assert.deepEqual(L.errors, []); assert.deepEqual(P.errors, []);

        // 태블릿: 카드(.show-on-laptop)가 숨어 있으면 조 코드를 만들지 않고, '이 기기'를 노트북으로 바꾸면 그때 만듦
        const T = await open(browser, app, base + '?s=' + SCRIPT_ID + '&device=tablet', { viewport: { width: 1024, height: 768 } });
        await T.page.waitForTimeout(300);
        assert.equal(await T.page.isVisible('#pc'), false);
        assert.equal(await T.page.evaluate(() => share.group()), '', '숨은 카드는 조 코드를 만들지 않음');
        await T.page.evaluate(() => LabUI.setDevice('laptop'));
        await T.page.waitForSelector('#pc .cs-pcard');
        assert.match(await T.page.evaluate(() => share.group()), /^99-\d{1,2}-\d{4}$/);
        assert.deepEqual(T.errors, []);

        // 숨은 단계 안에 있다가 보이게 되면 그때 그림 (노트북)
        const H = await open(browser, app, base + '?s=' + SCRIPT_ID, { viewport: { width: 1280, height: 800 } });
        await H.page.evaluate(() => { const pc = document.getElementById('pc'); pc.style.display = 'none'; pc.innerHTML = ''; pc.dataset.link = ''; });
        await H.page.waitForTimeout(200);
        await H.page.evaluate(() => { document.getElementById('pc').style.display = ''; });
        await H.page.waitForSelector('#pc .cs-pcard');
        assert.deepEqual(H.errors, []);

        // 수업(?c=) 으로 열었는데 아직 조·번호를 안 골랐으면 QR 대신 안내
        const C = await open(browser, app, base + '?s=' + SCRIPT_ID + '&c=3-1234', { viewport: { width: 1280, height: 800 } });
        await C.page.waitForFunction(() => document.getElementById('pc').textContent.length > 0);
        assert.match(await C.page.textContent('#pc'), /수업 참여에서 조·번호를 고르면/);
        assert.equal(await C.page.evaluate(() => share.group()), '', '수업이면 조 코드를 마음대로 만들지 않음');
    } finally {
        await browser.close();
        server.close();
    }
});
