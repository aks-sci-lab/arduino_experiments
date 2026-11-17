// 스마트폰 진자: 폰 측정 · 노트북 분석 이원화 (2026-11-17 사용자 결정)
//  노트북으로 측정 화면 → '📊 분석 화면' 안내(+ 연습용 시뮬레이션), 폰으로 분석 화면 → '📱 측정 화면' 안내(+ 그래도 여기서 보기),
//  태블릿은 두 화면 모두 그대로. 기기는 Playwright devices 또는 ?device= 로 정한다 (js/lab-ui.js LabUI.device)
const http = require('http'), path = require('path'), fs = require('fs');
const REPO = path.join(__dirname, '..');
let chromium = null, devices = {};
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const test = require('node:test');
const assert = require('node:assert/strict');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.gs': 'text/plain' };
const stat = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    fs.readFile(path.join(REPO, decodeURIComponent(u.pathname)), (e, d) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': (TYPES[path.extname(u.pathname)] || 'text/plain') + '; charset=utf-8' }); res.end(d);
    });
});
const SID = 'AKfycbTestSheet' + 'a'.repeat(30);

async function open(browser, ctxOpts, url) {
    const c = await browser.newContext(ctxOpts);
    // 바깥 주소(CDN·구글)는 막는다: 화면 나누기는 이것 없이도 되어야 함
    await c.route(/^https?:\/\/(?!localhost)/, r => r.abort());
    const p = await c.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(url);
    await p.waitForFunction(() => document.readyState === 'complete');
    return { c, p, errors };
}
const shown = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, sel);
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('진자 측정 화면: 노트북은 분석 화면 안내(연습용 시뮬레이션만), 폰·태블릿은 측정', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    await new Promise(r => stat.listen(0, r));
    const base = `http://localhost:${stat.address().port}/projects/pendulum-measure.html`;
    const browser = await chromium.launch();
    try {
        // 노트북 (넓은 창, 터치 없는 375px 창도 노트북)
        for (const vp of [{ width: 1280, height: 800 }, { width: 375, height: 800 }]) {
            const { c, p, errors } = await open(browser, { viewport: vp }, base + '?s=' + SID + '&c=ABC123&group=2-3-4821');
            assert.equal(await shown(p, '#laptopNotice'), true, '안내 보임');
            assert.equal(await shown(p, '#btnStart'), false, '측정 시작 숨김');
            assert.equal(await shown(p, '#pdTabs'), false, '측정 탭 숨김');
            assert.equal(await shown(p, '#pdDevice select'), true, "'이 기기' 고르기");
            const href = await p.getAttribute('#toReport', 'href');
            assert.equal(href, 'pendulum-report.html?s=' + SID + '&c=ABC123', '선생님 시트·수업 코드를 이어 붙임 (조 코드는 넘기지 않음)');
            if (vp.width === 375) {
                assert.equal(await noHScroll(p), true, '375px 가로 스크롤 없음');
                for (const sel of ['#toReport', '#btnPractice', '#pdDevice select']) {
                    assert.ok((await p.locator(sel).boundingBox()).height >= 44, sel + ' 높이 44px 이상');
                }
            }
            // 연습용 시뮬레이션: 화면은 펼치되 측정·보내기 단추는 계속 숨김
            await p.click('#btnPractice');
            assert.equal(await shown(p, '#pdTabs'), true);
            assert.equal(await shown(p, '#simDetails'), true);
            assert.equal(await shown(p, '#btnStart'), false, '연습 중에도 측정 시작 없음');
            assert.equal(await shown(p, '#laptopNotice'), false);
            await p.fill('#sL', '1.00'); await p.click('#btnSim');
            await p.waitForFunction(() => /\d/.test(document.getElementById('rT').textContent));
            const T = Number(await p.textContent('#rT'));
            assert.ok(Math.abs(T - 2.006) < 0.03, 'T ' + T);
            assert.deepEqual(errors, []);
            await c.close();
        }
        // 폰·태블릿: 안내 없이 측정 그대로
        for (const name of ['iPhone 13', 'Galaxy Tab S4']) {
            const { c, p, errors } = await open(browser, { ...devices[name] }, base);
            assert.equal(await shown(p, '#laptopNotice'), false, name + ': 안내 없음');
            assert.equal(await shown(p, '#btnStart'), true, name + ': 측정 시작 보임');
            assert.equal(await shown(p, '#pdTabs'), true, name);
            if (name === 'iPhone 13') assert.equal(await noHScroll(p), true, '폰 가로 스크롤 없음');
            assert.deepEqual(errors, []);
            await c.close();
        }
        // 기기 고르기로 바꾸면 바로 바뀜 (노트북 → 태블릿)
        {
            const { c, p } = await open(browser, { viewport: { width: 1280, height: 800 } }, base);
            await p.selectOption('#pdDevice select', 'tablet');
            assert.equal(await shown(p, '#btnStart'), true, '태블릿으로 바꾸면 측정 보임');
            assert.equal(await shown(p, '#laptopNotice'), false);
            await c.close();
        }
    } finally {
        await browser.close();
        await new Promise(r => stat.close(r));
    }
});

test('진자 분석 화면: 폰은 측정 화면 안내(그래도 여기서 보기), 노트북·태블릿은 분석 그대로', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    await new Promise(r => stat.listen(0, r));
    const base = `http://localhost:${stat.address().port}/projects/pendulum-report.html`;
    const browser = await chromium.launch();
    try {
        // 폰
        {
            const { c, p, errors } = await open(browser, { ...devices['iPhone 13'] }, base + '?s=' + SID + '&c=ABC123#step-5');
            assert.equal(await shown(p, '#phoneNotice'), true, '안내 보임');
            assert.equal(await shown(p, 'nav.steps'), false, '분석 단계 숨김');
            assert.equal(await shown(p, '#pdDevice select'), true);
            assert.equal(await p.getAttribute('#toMeasure', 'href'), 'pendulum-measure.html?s=' + SID + '&c=ABC123');
            assert.equal(await noHScroll(p), true, '375px 가로 스크롤 없음');
            for (const sel of ['#toMeasure', '#btnForce']) assert.ok((await p.locator(sel).boundingBox()).height >= 44, sel + ' 44px');
            await p.click('#btnForce');
            assert.equal(await shown(p, 'nav.steps'), true, '그래도 여기서 보기 → 보임');
            assert.equal(await shown(p, '#phoneNotice'), false);
            assert.equal(await shown(p, '#groupCard'), true, '5. 데이터 조 코드 칸');
            await p.reload(); await p.waitForFunction(() => document.readyState === 'complete');
            assert.equal(await shown(p, 'nav.steps'), true, '같은 탭에서는 새로고침해도 기억');
            assert.equal(await noHScroll(p), true);
            assert.deepEqual(errors, []);
            await c.close();
        }
        // 노트북·태블릿: 안내 없이 분석, 조 코드를 만들면 5. 데이터 맨 위 카드가 측정 화면 QR
        for (const opts of [{ viewport: { width: 1280, height: 800 } }, { ...devices['Galaxy Tab S4'] }]) {
            const { c, p, errors } = await open(browser, opts, base + '#step-5');
            assert.equal(await shown(p, '#phoneNotice'), false);
            assert.equal(await shown(p, 'nav.steps'), true);
            await p.fill('#gBan', '2'); await p.fill('#gJo', '3'); await p.click('#btnMake');
            const first = await p.evaluate(() => [...document.querySelectorAll('.step-panel[data-step="data"] > .pd-card')]
                .find(e => getComputedStyle(e).display !== 'none' && !e.hidden).id);
            assert.equal(first, 'qrCard', '5. 데이터에서 처음 보이는 카드 = 측정 화면 QR');
            assert.match(await p.getAttribute('#qrUrl', 'href'), /pendulum-measure\.html\?group=2-3-\d{4}/);
            assert.deepEqual(errors, []);
            await c.close();
        }
        // ?device=phone 으로도 폰처럼
        {
            const { c, p } = await open(browser, { viewport: { width: 1280, height: 800 } }, base + '?device=phone');
            assert.equal(await shown(p, '#phoneNotice'), true);
            await c.close();
        }
    } finally {
        await browser.close();
        await new Promise(r => stat.close(r));
    }
});
