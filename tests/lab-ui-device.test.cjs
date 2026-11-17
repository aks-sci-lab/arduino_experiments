// 공통 기기 종류 (js/lab-ui.js 의 LabUI.device · setDevice · deviceSwitch, css/lab-base.css 의 .hide-on-* / .show-on-*)
//  폰 측정 · 노트북 분석 이원화(2026-11-17 사용자 결정)의 바탕: 노트북은 분석만, 폰은 측정, 태블릿은 둘 다
const http = require('http'), path = require('path'), fs = require('fs');
const REPO = path.join(__dirname, '..');
let chromium = null, devices = {};
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const test = require('node:test');
const assert = require('node:assert/strict');

const PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/css/lab-base.css"><script src="/js/lab-ui.js"></script></head>
<body><p id="m" class="hide-on-laptop">측정</p><p id="a" class="show-on-laptop">노트북 분석 안내</p><p id="np" class="hide-on-phone">폰 아님</p><div id="sw"></div></body></html>`;
const stat = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/t.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
    fs.readFile(path.join(REPO, decodeURIComponent(u.pathname)), (e, d) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.css': 'text/css' }[path.extname(u.pathname)] || 'text/plain') + '; charset=utf-8' }); res.end(d);
    });
});

test('기기 종류: 노트북·폰·태블릿 추측, 보이기·숨기기, 고쳐 기억하기', { skip: !chromium && 'playwright 없음', timeout: 90000 }, async () => {
    await new Promise(r => stat.listen(0, r));
    const base = `http://localhost:${stat.address().port}/t.html`;
    const browser = await chromium.launch();
    const vis = async (p) => p.evaluate(() => ['m', 'a', 'np'].map(id => getComputedStyle(document.getElementById(id)).display !== 'none'));
    try {
        // 노트북 (마우스, 넓은 화면) — 폰 화면 폭이어도 터치가 없으면 노트북
        for (const vp of [{ width: 1280, height: 800 }, { width: 375, height: 800 }]) {
            const c = await browser.newContext({ viewport: vp });
            const p = await c.newPage();
            await p.goto(base);
            assert.equal(await p.evaluate(() => LabUI.device().kind), 'laptop');
            assert.equal(await p.getAttribute('html', 'data-device'), 'laptop');
            assert.deepEqual(await vis(p), [false, true, true], '노트북은 측정 숨김·안내 보임');
            await c.close();
        }
        // 폰 (아이폰·갤럭시)
        for (const name of ['iPhone 13', 'Pixel 7']) {
            const c = await browser.newContext({ ...devices[name] });
            const p = await c.newPage();
            await p.goto(base);
            assert.equal(await p.evaluate(() => LabUI.device().kind), 'phone', name);
            assert.deepEqual(await vis(p), [true, false, false], name + ': 측정 보임·노트북 안내 숨김');
            await c.close();
        }
        // 태블릿 (안드로이드 태블릿, 아이패드가 맥처럼 보여도)
        for (const name of ['Galaxy Tab S4', 'iPad (gen 7)']) {
            const c = await browser.newContext({ ...devices[name] });
            const p = await c.newPage();
            await p.goto(base);
            assert.equal(await p.evaluate(() => LabUI.device().kind), 'tablet', name);
            assert.deepEqual(await vis(p), [true, false, true], name + ': 측정·분석 둘 다');
            await c.close();
        }
        {
            const c = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: false,
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' });
            await c.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
            const p = await c.newPage();
            await p.goto(base);
            assert.equal(await p.evaluate(() => LabUI.device().kind), 'tablet', '맥처럼 보이는 아이패드');
            await c.close();
        }
        // 고치기: 주소 ?device= → 기억, 고르기 → 이벤트, 자동으로 되돌리기
        {
            const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
            const p = await c.newPage();
            await p.goto(base + '?device=tablet');
            assert.deepEqual(await p.evaluate(() => LabUI.device()), { kind: 'tablet', auto: 'laptop', manual: true });
            await p.goto(base);
            assert.equal(await p.evaluate(() => LabUI.device().kind), 'tablet', '이 브라우저에 기억');
            await p.evaluate(() => { window.__ev = []; addEventListener('lab-device', e => __ev.push(e.detail.kind)); LabUI.deviceSwitch('#sw'); });
            assert.match(await p.textContent('#sw'), /이 기기:.*노트북·PC \(자동\)/s);
            assert.equal(await p.inputValue('#sw select'), 'tablet');
            await p.selectOption('#sw select', 'phone');
            assert.equal(await p.getAttribute('html', 'data-device'), 'phone');
            assert.deepEqual(await vis(p), [true, false, false]);
            await p.selectOption('#sw select', 'laptop');   // 자동과 같은 것을 고르면 기억을 지움
            assert.deepEqual(await p.evaluate(() => [LabUI.device(), __ev]), [{ kind: 'laptop', auto: 'laptop', manual: false }, ['phone', 'laptop']]);
            const h = await p.evaluate(() => document.querySelector('#sw select').getBoundingClientRect().height);
            assert.ok(h >= 44, '고르기 높이 ' + h);
            assert.equal(await p.evaluate(() => localStorage.getItem('lab-ui:device')), null);
            await c.close();
        }
    } finally {
        await browser.close();
        stat.close();
    }
});
