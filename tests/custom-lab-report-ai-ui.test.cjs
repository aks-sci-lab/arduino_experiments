// 선생님이 만든 실험 — 보고서 쓰기 · AI 피드백 (js/report-ai.js) — Playwright, 가짜 저장소
//  가설연역(layout 'hd') 수업: ⑥ 결론 도출에 보고서, ② 가설 쓰기 칸 → 선생님께 저장, AI 질문(exp 'custom:ohm01', 맥락 = 표·맞춤 결과) → 교사 답 → 학생 화면,
//    최종 제출 → 교사 화면 ⚙ 설정 → 🤖 보고서 AI 조별 보기에 ✅ 제출
//  7단계(layout 'steps'): 7. 결론에 보고서(7단계 항목), 쓰기 칸 없음 / 한 화면(layout 'single'): 보고서 없음 · 375px 가로 스크롤 없음
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/custom-lab-math.js');
const { loadLabStore } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://lab.test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm' };
const FAKE_CHART = 'window.Chart=class{constructor(c,o){this.data=(o&&o.data)||{datasets:[]};this.options=(o&&o.options)||{};}update(){}destroy(){}resize(){}};';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg viewBox=\\"0 0 10 10\\"></svg>"}}};';
const def = layout => M.normalizeDefinition({
    title: '옴의 법칙 확인', description: '[목표] 전압과 전류의 관계', published: true, layout,
    columns: [{ name: '전압', unit: 'V' }, { name: '전류', unit: 'mA' }], xCol: 0, yCol: 1, fit: 'proportional', questions: ['기울기는 무엇을 뜻하나요?'],
    stepTexts: { theory: 'V = IR', materials: '건전지', procedure: '전압을 바꾸며 전류를 잰다' }, sensor: { mode: 'none' }
});

async function newPage(browser, app, opt, layout) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opt || {}));
    await ctx.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'script.google.com') {
            const req = route.request();
            const body = req.method() === 'POST' ? await app.post(req.postData() || '{}') : await app.get(Object.fromEntries(u.searchParams));
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
        }
        if (/cdn\.jsdelivr|cdnjs/.test(u.hostname)) return route.fulfill({ contentType: 'application/javascript', body: /qrcode/.test(u.pathname) ? QR : /chart/i.test(u.pathname) ? FAKE_CHART : '' });
        if (u.origin !== ORIGIN) return route.abort();
        const file = path.join(ROOT, decodeURIComponent(u.pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await ctx.addInitScript(() => { window.LAB_STORE_FAKE_URL = 'https://script.google.com/macros/s/FAKE_LAB_STORE/exec'; });
    if (layout) await ctx.addInitScript(d => { try { localStorage.setItem('customLabDef:v1:ohm01', d); } catch (e) { /* 무시 */ } }, JSON.stringify(def(layout)));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    return { page, errors };
}
const until = async (fn, ms) => { const end = Date.now() + (ms || 15000); for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) return null; await new Promise(r => setTimeout(r, 300)); } };

test('선생님이 만든 실험 보고서 AI: 가설연역 수업 글·질문·답·제출·교사 조별 보기, 7단계, 한 화면엔 없음', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch();
    try {
        const cls = await app.post({ action: 'createClass', ban: 2, nStudents: 2, groupSize: 2, exp: 'custom:ohm01', aiLimit: 5 });
        assert.equal(cls.ok, true, cls.error);
        // ---- 학생 (가설연역) ----
        const S = await newPage(browser, app, devices['iPhone 13'], 'hd');
        await S.page.goto(ORIGIN + '/projects/custom-lab.html?id=ohm01&c=' + cls.classCode + '&s=' + cls.space);
        await S.page.waitForSelector('#cs-cpick:not([hidden])');
        await S.page.selectOption('#cs-cjo', '1'); await S.page.selectOption('#cs-cnum', '1'); await S.page.click('#cs-cjoin');
        await S.page.waitForSelector('#cs-cjoined:not([hidden])');
        // ④ 표에 값 두 줄 → 맞춤 결과가 AI 맥락으로
        await S.page.click('nav.steps button[data-step="perform"]');
        const cells = S.page.locator('#tableCard tbody input');
        await cells.nth(0).fill('1'); await cells.nth(1).fill('10'); await cells.nth(2).fill('2'); await cells.nth(3).fill('20');
        // ② 가설 쓰기 칸
        await S.page.click('nav.steps button[data-step="hypothesis"]');
        await S.page.waitForSelector('.step-panel[data-step="theory"] .rai-inline[data-sec="hypothesis"]:not([hidden])');
        await S.page.fill('.rai-inline[data-sec="hypothesis"] textarea', '전압을 두 배로 하면 전류도 두 배가 될 것이다.');
        // ⑥ 결론 도출: 보고서 (질문 카드 다음, 보내기 카드 앞)
        await S.page.click('nav.steps button[data-step="conclude"]');
        await S.page.waitForSelector('#report-ai .rai-card');
        const order = await S.page.evaluate(() => [...document.querySelector('.step-panel[data-step="conclusion"]').children].map(e => e.id).filter(Boolean));
        assert.ok(order.indexOf('reportAiCard') > order.indexOf('questionCard') && order.indexOf('reportAiCard') < order.indexOf('submitCard'), '질문 → 보고서 → 보내기 순서: ' + order);
        assert.equal(await S.page.isVisible('#rai-tabs button[data-tab="verdict"]'), true, '가설연역 항목');
        assert.equal(await S.page.isVisible('#rai-tabs button[data-tab="theory"]'), false);
        await S.page.click('#rai-tabs button[data-tab="hypothesis"]');
        assert.equal(await S.page.inputValue('#rai-t-hypothesis'), '전압을 두 배로 하면 전류도 두 배가 될 것이다.');
        await S.page.fill('#rai-p-hypothesis', '내 가설이 실험으로 확인할 수 있는 모양인지 봐 줘.');
        await S.page.check('#report-ai input[data-sec="hypothesis"][data-att="calc"]');
        await S.page.click('[data-askbtn="hypothesis"]');
        const ask = await until(() => [...app.db.docs.entries()].find(([k]) => k.startsWith('labClasses/' + cls.space + '/aiAsk/')));
        assert.ok(ask, 'AI 질문이 저장됨');
        assert.equal(ask[1].exp, 'custom:ohm01');
        assert.equal(ask[1].section, 'hypothesis');
        assert.match(ask[1].calc, /\[측정값 표\] 전압 \(V\) \| 전류 \(mA\)/, '맥락에 표');
        assert.match(ask[1].calc, /1 \| 10/);
        assert.match(ask[1].calc, /\[그래프 맞춤\]/, '맥락에 맞춤 결과');
        // 교사가 답 (교사 화면 대신 저장소에 바로)
        const L = await app.post({ action: 'aiList', space: cls.space });
        assert.equal(L.ok, true, L.error);
        const q = L.asks[0];
        assert.equal((await app.post({ action: 'aiClaim', space: cls.space, id: q.id })).ok, true);
        assert.equal((await app.post({ action: 'aiAnswer', space: cls.space, id: q.id, status: 'done', answer: '무엇을 바꾸고 무엇을 재는지 분명해요. 통제 변인은?', used: 1, limit: 5, provider: 'claude', model: 'm' })).ok, true);
        await S.page.waitForSelector('#rai-l-hypothesis .rai-a', { timeout: 15000 });
        assert.match(await S.page.textContent('#rai-l-hypothesis .rai-a'), /통제 변인은/);
        // 가설 판정 → 최종 제출
        await S.page.check('.rai-inline[data-sec="verdict"] input[value="지지"]');
        await S.page.click('#rai-tabs button[data-tab="submit"]');
        await S.page.waitForFunction(() => /선생님께 저장됨/.test(document.getElementById('rai-save').textContent), null, { timeout: 15000 });
        await S.page.click('#rai-submit');
        await S.page.waitForFunction(() => /최종 제출했어요/.test(document.getElementById('rai-smsg').textContent), null, { timeout: 15000 });
        const RL = await app.post({ action: 'reportList', space: cls.space });
        assert.equal(RL.reports.length, 1);
        assert.equal(RL.reports[0].submitted, true);
        assert.equal(RL.reports[0].exp, 'custom:ohm01');
        assert.match(RL.reports[0].sections.hypothesis, /두 배/);
        assert.match(RL.reports[0].sections.verdict, /^\[판정\] 지지/);
        assert.equal(await S.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '학생 375 가로 스크롤');
        assert.deepEqual(S.errors, []);

        // ---- 교사 화면: 🤖 보고서 AI 조별 보기 ----
        const T = await newPage(browser, app);
        await T.page.goto(ORIGIN + '/projects/class-teacher.html');
        await T.page.click('#btnLogin');
        await T.page.waitForSelector('#btnSettings:not([hidden])');
        await T.page.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); });
        await T.page.click('#ctTabs button[data-tab="ai"]');
        await T.page.selectOption('#aiView', cls.space);
        await T.page.click('#aiViewRefresh');
        await T.page.waitForFunction(() => /✅ 제출/.test(document.getElementById('aiGroups').textContent), null, { timeout: 10000 });
        await T.page.click('#aiGroups button[data-aig]');
        const detail = await T.page.textContent('#aiGroupBody');
        assert.match(detail, /두 배로 하면/); assert.match(detail, /통제 변인은/); assert.match(detail, /가설/);
        assert.deepEqual(T.errors, []);

        // ---- 7단계 방식: 7. 결론에 보고서(7단계 항목), 쓰기 칸 없음 ----
        const S7 = await newPage(browser, app, {}, 'steps');
        await S7.page.goto(ORIGIN + '/projects/custom-lab.html?id=ohm01');
        await S7.page.waitForSelector('nav.steps button[data-step="conclusion"]');
        await S7.page.click('nav.steps button[data-step="conclusion"]');
        await S7.page.waitForSelector('#report-ai .rai-card');
        assert.equal(await S7.page.isVisible('#rai-tabs button[data-tab="theory"]'), true);
        assert.equal(await S7.page.isVisible('#rai-tabs button[data-tab="verdict"]'), false);
        assert.equal(await S7.page.locator('.rai-inline:not([hidden])').count(), 0);
        assert.match(await S7.page.textContent('#rai-status'), /수업으로 들어온 화면이 아니라/, '수업 없이 열면 안내');
        assert.deepEqual(S7.errors, []);

        // ---- 한 화면 방식: 보고서 없음 ----
        const S1 = await newPage(browser, app, { viewport: { width: 375, height: 800 } }, 'single');
        await S1.page.goto(ORIGIN + '/projects/custom-lab.html?id=ohm01');
        await S1.page.waitForSelector('#tableCard');
        await S1.page.waitForTimeout(500);
        assert.equal(await S1.page.isVisible('#reportAiCard'), false, '한 화면 방식엔 보고서 없음');
        assert.equal(await S1.page.locator('#report-ai .rai-card').count(), 0);
        assert.equal(await S1.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        assert.deepEqual(S1.errors, []);
    } finally {
        await browser.close();
    }
});
