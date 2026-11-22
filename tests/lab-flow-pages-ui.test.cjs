// 진행 방법 두 가지 — PR 2: 보고서 실험 7개 + 선생님이 만든 실험 + 가설·변인·가설 판정 칸 (docs/inquiry-types-design.md) — Playwright, 가짜 저장소
//  ① 플랑크·이상기체(예전 자체 탭 → 공통 nav.steps)·말루스·전자기 유도·자유낙하·진자 분석·퀀텀닷: 가설연역 6단계, ③ = 준비물+과정,
//     ② 가설 쓰기 칸 → ⑥ 보고서 AI '가설' 항목과 같은 글, ⑥ 가설 판정 고르기 → '[판정] 지지', 새로고침해도 남음,
//     7단계로 바꾸면 쓰기 칸 숨김·보고서 항목은 이론·방법·데이터 분석·결론 및 검토, 노트북 1280·375px 가로 스크롤 없음
//  ② 선생님이 만든 실험 '가설연역 6단계'(layout 'hd'): 학생 화면 6단계, 방법 고르기 없음(만들 때 고른 것), 표는 ④ 탐구 수행
//  ③ 가설연역 수업(퀀텀닷): 가설 쓰기 칸에 쓴 글이 선생님께 저장(reports 의 sections.hypothesis·verdict)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/custom-lab-math.js');
const { loadLabStore } = require('./fake-lab-store.cjs');
const pickVars = require('./vars-pick.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://lab.test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.csv': 'text/csv' };
const FAKE_CHART = 'window.Chart=class{constructor(c,o){this.data=(o&&o.data)||{datasets:[]};this.options=(o&&o.options)||{};}update(){}destroy(){}resize(){}};';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg viewBox=\\"0 0 10 10\\"></svg>"}}};';
const HD = ['problem', 'hypothesis', 'design', 'perform', 'interpret', 'conclude'];
const PAGES = ['planck-led', 'ideal-gas', 'malus-law', 'em-induction', 'free-fall', 'pendulum-report', 'quantum-dot'];
const DEF = M.normalizeDefinition({
    title: '옴의 법칙 확인', description: '[목표] 전압과 전류의 관계', published: true, layout: 'hd',
    columns: [{ name: '전압', unit: 'V' }, { name: '전류', unit: 'mA' }], xCol: 0, yCol: 1, fit: 'proportional', questions: ['기울기는 무엇을 뜻하나요?'],
    stepTexts: { theory: 'V = IR', materials: '건전지', procedure: '전압을 바꾸며 전류를 잰다' }, sensor: { mode: 'none' }
});

async function newPage(browser, app, opt, init) {
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
    if (init) await ctx.addInitScript(init.fn, init.arg);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    return { ctx, page, errors };
}
const setHd = { fn: () => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('lab-flow', 'hd'); sessionStorage.setItem('seeded', '1'); } } catch (e) { /* 무시 */ } } };
const stepKeys = pg => pg.evaluate(() => [...document.querySelectorAll('nav.steps button[data-step]')].map(b => b.dataset.step));
const shown = pg => pg.evaluate(() => [...document.querySelectorAll('.step-panel[data-step]')].filter(p => !p.hidden).map(p => p.dataset.step));
const hscroll = pg => pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test('진행 방법 PR 2: 보고서 실험 7개 가설연역 + 가설·판정 칸, 선생님이 만든 실험, 수업 보고서 저장', { skip: !chromium && 'playwright 없음', timeout: 400000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    try {
        for (const name of PAGES) {
            const { page: P, errors } = await newPage(browser, app, { permissions: ['camera'] }, setHd);
            await P.goto(ORIGIN + '/projects/' + name + '.html');
            await P.waitForSelector('nav.steps button[data-step="problem"]', { timeout: 15000 });
            assert.deepEqual(await stepKeys(P), HD, name + ' 6단계');
            await P.click('nav.steps button[data-step="design"]');
            assert.deepEqual(await shown(P), ['materials', 'procedure'], name + ' ③ = 준비물 + 과정');
            // ② 가설 쓰기 칸
            await P.click('nav.steps button[data-step="hypothesis"]');
            await P.waitForSelector('.step-panel[data-step="theory"] .rai-inline[data-sec="hypothesis"]:not([hidden])');
            await P.fill('.rai-inline[data-sec="hypothesis"] textarea', '만약 A 를 늘리면 B 가 커질 것이다.');
            assert.equal(await P.isVisible('.step-panel[data-step="purpose"] .rai-inline[data-sec="problem"]'), false, name + ' 다른 단계 칸은 그 단계에서만');
            // ⑥ 보고서 AI: 가설연역 항목, 같은 글
            await pickVars(P);   // ③ 탐구 설계 변인 카드 '골라야 다음' (말루스는 카드 없음)
            await P.click('nav.steps button[data-step="conclude"]');
            await P.waitForSelector('#rai-tabs button[data-tab="hypothesis"]:not([hidden])');
            assert.equal(await P.isVisible('#rai-tabs button[data-tab="theory"]'), false, name + ' 7단계 항목은 숨김');
            assert.match(await P.textContent('#rai-tabs button[data-tab="analysis"]'), /자료 해석/);
            await P.click('#rai-tabs button[data-tab="hypothesis"]');
            assert.equal(await P.inputValue('#rai-t-hypothesis'), '만약 A 를 늘리면 B 가 커질 것이다.', name + ' 같은 글');
            // ⑥ 가설 판정
            await P.check('.rai-inline[data-sec="verdict"] input[value="지지"]');
            assert.match(await P.inputValue('.rai-inline[data-sec="verdict"] textarea'), /^\[판정\] 지지\n/);
            await P.fill('.rai-inline[data-sec="verdict"] textarea', '[판정] 지지\n기울기가 양수라서.');
            assert.equal(await hscroll(P), 0, name + ' 1280 가로 스크롤');
            await P.reload();
            await P.waitForSelector('nav.steps button[data-step="problem"]');
            assert.equal(await selected(P), 'conclude', name + ' 새로고침해도 단계');
            assert.equal(await P.inputValue('.rai-inline[data-sec="verdict"] textarea'), '[판정] 지지\n기울기가 양수라서.');
            assert.equal(await P.isChecked('.rai-inline[data-sec="verdict"] input[value="지지"]'), true);
            // 7단계로 바꾸면 쓰기 칸 숨김, 보고서 항목 원래대로
            await P.click('.flow-pick button[data-flow="report"]');
            assert.equal((await stepKeys(P)).length, 7);
            // 7단계에도 변인 카드(4. 과정, 말루스 빼고)·양자점은 '우리 생각'도 있음(같은 칸이 이름만 바뀜)
            assert.deepEqual(await P.$$eval('.rai-inline:not([hidden])', a => a.map(b => b.dataset.sec).sort()), name === 'quantum-dot' ? ['design', 'problem'] : name === 'malus-law' ? [] : ['design'], name + ' 7단계엔 가설연역 쓰기 칸 없음(변인 카드만)');
            assert.equal(await P.isVisible('#rai-tabs button[data-tab="hypothesis"]'), false);
            await P.click('nav.steps button[data-step="conclusion"]');
            assert.equal(await P.isVisible('#rai-tabs button[data-tab="theory"]'), true);
            assert.match(await P.textContent('#rai-tabs button[data-tab="analysis"]'), /데이터 분석/);
            assert.deepEqual(errors, [], name + ' 오류');
            await P.context().close();
        }
        // 375px (터치 없는 좁은 창 = 노트북 화면) 가로 스크롤
        for (const name of PAGES) {
            const { page: P, errors } = await newPage(browser, app, { viewport: { width: 375, height: 800 } }, setHd);
            await P.goto(ORIGIN + '/projects/' + name + '.html');
            await P.waitForSelector('nav.steps button[data-step="problem"]');
            for (const k of ['hypothesis', 'design', 'conclude']) { await P.click('nav.steps button[data-step="' + k + '"]'); assert.equal(await hscroll(P), 0, name + ' 375 ' + k); }
            assert.deepEqual(errors, []);
            await P.context().close();
        }

        // ---- ② 선생님이 만든 실험 '가설연역 6단계' ----
        const C = await newPage(browser, app, {}, { fn: d => { try { localStorage.setItem('customLabDef:v1:ohm01', d); localStorage.setItem('lab-flow', 'report'); } catch (e) { /* 무시 */ } }, arg: JSON.stringify(DEF) });
        await C.page.goto(ORIGIN + '/projects/custom-lab.html?id=ohm01');
        await C.page.waitForSelector('nav.steps button[data-step="perform"]');
        assert.deepEqual(await stepKeys(C.page), HD, '만들 때 고른 가설연역 (학생이 고른 7단계보다 먼저)');
        assert.equal(await C.page.locator('.flow-pick:not([hidden])').count(), 0, '선생님이 만든 실험은 학생이 방법을 안 바꿈');
        await C.page.click('nav.steps button[data-step="perform"]');
        assert.equal(await C.page.isVisible('#tableCard'), true, '표는 ④ 탐구 수행');
        await C.page.click('nav.steps button[data-step="design"]');
        assert.deepEqual(await shown(C.page), ['materials', 'procedure']);
        assert.deepEqual(C.errors, []);
        const ed = await newPage(browser, app);
        await ed.page.goto(ORIGIN + '/projects/custom-lab.html?edit=new');
        await ed.page.waitForTimeout(800);
        assert.equal(await ed.page.locator('input[name=edLayout][value=hd]').count(), 1, '만들기 화면에 가설연역 고르기');
        assert.deepEqual(M.normalizeDefinition({ title: 'x', layout: 'hd', columns: [{ name: 'a' }, { name: 'b' }] }).layout, 'hd');

        // ---- ③ 가설연역 수업: 쓴 글이 선생님께 저장 ----
        const cls = await app.post({ action: 'createClass', ban: 3, nStudents: 2, groupSize: 2, exp: 'qdot', flow: 'hd' });
        assert.equal(cls.ok, true, cls.error);
        const S = await newPage(browser, app, Object.assign({}, devices['iPhone 13'], { permissions: ['camera'] }));
        await S.page.goto(ORIGIN + '/projects/quantum-dot.html?c=' + cls.classCode + '&s=' + cls.space);
        await S.page.waitForSelector('#cs-cpick:not([hidden])');
        await S.page.selectOption('#cs-cjo', '1'); await S.page.selectOption('#cs-cnum', '1'); await S.page.click('#cs-cjoin');
        await S.page.waitForSelector('nav.steps button[data-step="hypothesis"]');
        await S.page.evaluate(() => { const t = document.querySelector('.rai-inline[data-sec="problem"] textarea'); t.value = '가열 시간이 형광 색을 바꿀까?'; t.dispatchEvent(new Event('input', { bubbles: true })); });
        await S.page.waitForFunction(() => true);
        const deadline = Date.now() + 15000;
        let rep = null;
        while (Date.now() < deadline) {
            rep = [...app.db.docs.entries()].find(([k]) => k.startsWith('labClasses/' + cls.space + '/reports/'));
            if (rep && rep[1].sections && rep[1].sections.problem) break;
            await new Promise(r => setTimeout(r, 500));
        }
        assert.ok(rep, '보고서 문서가 생김');
        assert.equal(rep[1].sections.problem, '가열 시간이 형광 색을 바꿀까?', '① 탐구 문제가 선생님께 저장');
        assert.deepEqual(S.errors, []);
    } finally {
        await browser.close();
    }
});
async function selected(pg) { return pg.evaluate(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.dataset.step : ''; }); }
