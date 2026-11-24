// 탄소 양자점 — 결론 쓸 곳 하나로 · 예상·변인 칸 (2026-11-20 선생님 결정 "결론 쓸 곳 하나로", "예상·변인 적는 칸")
// Playwright, 가짜 저장소(tests/fake-lab-store.cjs)
//  ① 7 결론에 '분석 질문' 칸이 없고, 물음은 보고서 항목 위 '생각해 볼 물음'으로. 예전 칸에 쓴 글은 보고서로 한 번 옮기고 '예전에 쓴 글' 접기
//  ② 수업: 1 목적 '우리 생각'·4 과정 변인 카드(바꿀 것·예상)를 쓰면 선생님께 저장되고 교사 조별 보기에 보임, 📱 폰은 같은 '바꿀 것'을 한 번 고름
//  ③ 5 데이터: 바꿀 것 말고 다른 값도 앞 시료와 다르면 ⚠ (막지 않음, '앞 시료와 같게'·'그대로 둘게요')
//  ④ 6 결과·7 결론: 내 예상 ↔ 결과
//  ⑤ 가설연역: ① 탐구 문제·③ 변인 카드가 한 벌씩(겹치지 않음)
//  ⑥ 375px 가로 스크롤 없음·단추 44px (수업 없이 연 폰 화면, 수업 폰 측정 화면)
//  ⑦ 발표 보기(?present=1) 1 목적 첫 화면 = 현상 그림 + 물음
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadLabStore } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://lab.test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg viewBox=\\"0 0 10 10\\"></svg>"}}};';

async function newPage(browser, app, opt, init) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opt || {}));
    await ctx.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'script.google.com') {
            const req = route.request();
            const body = req.method() === 'POST' ? await app.post(req.postData() || '{}') : await app.get(Object.fromEntries(u.searchParams));
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
        }
        if (/cdn\.jsdelivr|cdnjs/.test(u.hostname)) return route.fulfill({ contentType: 'application/javascript', body: /qrcode/.test(u.pathname) ? QR : '' });
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
    return { page, errors, ctx };
}
// 한 번만 넣는 이 기기 저장값 (새로고침 때는 다시 안 넣음)
const seed = { fn: o => { try { if (!sessionStorage.getItem('seeded')) { Object.keys(o).forEach(k => localStorage.setItem(k, o[k])); sessionStorage.setItem('seeded', '1'); } } catch (e) { /* 무시 */ } } };
const sample = (no, heatS, lambda, extra) => Object.assign({ no, at: '2026-11-20T01:0' + no + ':00Z', heatS, citric: 1, urea: 1, water: 10, dilution: '1:10', light: '365 nm', memo: '',
    photo: { r: 80, g: 200, b: 255, lambda, Y: 0.4, clip: 0 }, cam: {} }, extra || {});
const hscroll = pg => pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
// 보이는 단추·고르기 중 44px 보다 낮은 것 (표 안 작은 단추는 빼고)
const small = (pg, sel) => pg.$$eval(sel, els => els.filter(e => e.offsetParent && !e.closest('table')).map(e => [e.textContent.trim().slice(0, 20), Math.round(e.getBoundingClientRect().height)]).filter(x => x[1] < 44));
const until = async (fn, ms) => { const end = Date.now() + (ms || 15000); for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await new Promise(r => setTimeout(r, 300)); } };

test('양자점: 결론 쓸 곳 하나로 · 예상·변인 칸 (수업 없이, 태블릿)', { skip: !chromium && 'playwright 없음', timeout: 180000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch();
    try {
        const store = {
            'lab-flow': 'report',
            'quantum-dot-notes-v1': JSON.stringify({ q1: '기울기가 양수라 길어졌다', q3: '에너지 차이는 약 0.7 eV' }),
            'quantum-dot-v1': JSON.stringify({ samples: [sample(1, 60, 470)], draft: Object.assign(sample(2, 180, 0), { photo: { r: 120, g: 240, b: 120, lambda: 520, Y: 0.4, clip: 0 }, dilution: '원액' }) })
        };
        const { page: P, errors } = await newPage(browser, app, devices['Galaxy Tab S4'], Object.assign({ arg: store }, seed));
        await P.goto(ORIGIN + '/projects/quantum-dot.html#step-1');
        await P.waitForSelector('#report-ai .rai-card', { state: 'attached' });

        // ⑦ 1 목적: 현상 그림 + 물음이 먼저, 목적 글은 접힘, '우리 생각' 칸
        assert.equal(await P.isVisible('.qd-look svg'), true);
        assert.match(await P.textContent('.qd-look .qd-ask'), /무엇이 다른가요\? 왜 그럴까요\?/);
        assert.equal(await P.$eval('details.qd-purpose-more', d => d.open), false, '목적 글은 접힘(답이 먼저 안 보이게)');
        assert.equal(await P.isVisible('.qd-look .rai-inline[data-sec="problem"] textarea'), true);
        assert.match(await P.textContent('.qd-look .rai-inline[data-sec="problem"]'), /우리 생각/);
        await P.fill('.qd-look .rai-inline[data-sec="problem"] textarea', '가열하면 알갱이 크기가 달라져서?');

        // 4 과정: 변인 카드 — 바꿀 것 하나 → 나머지 🔒, 예상
        await P.click('nav.steps button[data-step="procedure"]');
        const vc = '.rai-inline.rai-vc[data-sec="design"]';
        await P.waitForSelector(vc + ':visible');
        assert.match(await P.textContent(vc + ' [data-vc-keep]'), /바꿀 것을 고르면/);
        await P.check(vc + ' input[data-vc="change"][value="heat"]');
        const keep = await P.textContent(vc + ' [data-vc-keep]');
        assert.match(keep, /🔒 재료 비율/); assert.match(keep, /🔒 희석/); assert.doesNotMatch(keep, /가열 시간/);
        assert.match(await P.textContent(vc + ' [data-vc-q]'), /가열 시간을 늘리면/);
        await P.fill(vc + ' input[data-vc="val1"]', '60초');
        await P.fill(vc + ' input[data-vc="val2"]', '180초');
        assert.match(await P.textContent(vc + ' [data-vc-q]'), /가열 시간을 60초 → 180초 로 바꾸면/);
        await P.check(vc + ' input[data-vc="predict"][value="up"]');
        await P.fill(vc + ' input[data-vc="reason"]', '알갱이가 커지면 띠 틈이 작아져서');
        await P.fill(vc + ' input[data-vc="extra"]', '같은 컵');
        const design = await P.evaluate(() => ReportAI.current.state().sections.design);
        assert.match(design, /^\[바꿀 것\] 가열 시간\n\[바꿀 값\] 60초 → 180초\n\[재는 것\] .+\n\[같게 둘 것\] 재료 비율 \(요소\/구연산\), 물의 양, 희석, 비춘 빛\n\[더 같게 둘 것\] 같은 컵\n\[예상\] 길어진다 \(빨강 쪽으로\)\n\[까닭\] 알갱이가/);
        assert.deepEqual(await small(P, vc + ' label.rai-pill, ' + vc + ' input[type=text]'), [], '변인 카드 44px');

        // ③ 5 데이터: 희석도 앞 시료와 다름 → ⚠ (막지 않음)
        await P.click('nav.steps button[data-step="data"]');
        await P.click('#qdTabs button[data-tab="sample"]');
        assert.match(await P.textContent('#var-now'), /바꿀 것: 가열 시간/);
        const warn = '.tab-panel[data-tab="sample"] [data-var-warn]';
        await P.waitForSelector(warn + ':visible');
        assert.match(await P.textContent(warn), /두 가지가 함께 바뀌었어요.*희석.*그대로 둘까요\?/s);
        assert.doesNotMatch(await P.textContent(warn), /가열 시간<\/b>도/);
        assert.deepEqual(await small(P, warn + ' button'), []);
        await P.click(warn + ' [data-var-fix]');
        assert.equal(await P.inputValue('#in-dilution'), '1:10', '앞 시료와 같게');
        assert.equal(await P.isVisible(warn), false);
        assert.equal(await P.inputValue('#in-heat'), '180', '바꿀 것(가열 시간)은 그대로');
        await P.selectOption('#in-light', '395 nm');
        await P.waitForSelector(warn + ':visible');
        await P.click(warn + ' [data-var-ok]');
        assert.equal(await P.isVisible(warn), false, '그대로 둘게요');
        // 막지 않음: 그대로 저장됨
        await P.click('#qdTabs button[data-tab="save"]');
        assert.equal(await P.isDisabled('#btn-save'), false);
        await P.click('#btn-save');
        assert.match(await P.textContent('#save-msg'), /시료 2 저장/);

        // 빛을 함께 바꾼 채 저장 → ⚠ 두 가지가 바뀐 시료, 기본은 맞춤에서 뺌
        assert.match(await P.textContent('#mine-list'), /두 가지가 바뀌었어요 · 비춘 빛도/);
        await P.click('nav.steps button[data-step="result"]');
        const cmp6 = '.step-panel[data-step="result"] [data-rai-compare="design"]';
        await P.waitForSelector(cmp6 + ' .rai-cmp-grid');
        assert.match(await P.textContent('#tbody'), /⚠ 두 가지가 바뀜 \(비춘 빛\) · 맞춤에서 뺌/);
        assert.doesNotMatch(await P.textContent('#tbody tr:first-child'), /⚠/, '한 가지만 바꾼(첫) 시료는 그대로');
        assert.match(await P.textContent(cmp6), /2개 이상 있어야[\s\S]*시료 1개는 두 가지가 바뀌어 뺐어요/);
        assert.match(await P.textContent('#xy-fit'), /직선에서 뺐어요 \(속 빈 점\)/);
        // ④ '넣기' 를 고르면 직선·예상 ↔ 결과가 바뀜 (60초 470 nm → 180초 ≈ 530 nm = 길어짐)
        await P.check('#mix-box [data-mix-no="2"] input[value="in"]');
        await P.fill('#mix-box [data-mix-no="2"] [data-mix-why]', '빛은 파장에 영향이 작을 것 같아서');
        await P.press('#mix-box [data-mix-no="2"] [data-mix-why]', 'Tab');
        assert.match(await P.textContent('#xy-fit'), /최소제곱 직선[\s\S]*점 2개[\s\S]*넣었어요/);
        const c6 = await P.textContent(cmp6);
        assert.match(c6, /내 예상.*가열 시간을 60초 → 180초 로 바꾸면.*길어진다/s);
        assert.match(c6, /결과.*봉우리 파장이 길어졌어요.*\+\d+ nm.*두 가지가 바뀌었지만 넣었어요/s);
        assert.match(c6, /예상과 같은 방향/);

        // ① 7 결론: 분석 질문 칸 없음, 내 예상 ↔ 결과, 물음은 보고서 항목 위, 예전 글은 보고서로 옮김 + 접기
        await P.click('nav.steps button[data-step="conclusion"]');
        assert.equal(await P.locator('textarea[data-q]').count(), 0, '분석 질문 칸 없음');
        assert.equal(await P.locator('#btn-send2').count(), 0, '결론에 따로 보내기 단추 없음');
        assert.equal(await P.isVisible('.step-panel[data-step="conclusion"] [data-rai-compare="design"] .rai-cmp-grid'), true);
        assert.match(await P.textContent('.qd-hand'), /이 기기에 저장/, '수업 없이: 이 기기 저장·인쇄');
        await P.click('#rai-tabs button[data-tab="analysis"]');
        assert.match(await P.textContent('#rai-q-analysis'), /6-2 그래프의 기울기/);
        assert.match(await P.textContent('#rai-q-analysis'), /두 가지가 바뀐 시료\(⚠\)를 어떻게 다뤘나요/, '그런 시료가 있을 때만');
        await P.click('#rai-tabs button[data-tab="conclusion"]');
        assert.match(await P.textContent('#rai-q-conclusion'), /스토크스 이동/);
        assert.match(await P.textContent('#rai-q-conclusion'), /내 예상과 결과가 같았나요/);
        assert.match(await P.inputValue('#rai-t-analysis'), /\(예전 분석 질문 · 가열 시간 ↔ 봉우리 파장\) 기울기가 양수라 길어졌다/);
        assert.match(await P.inputValue('#rai-t-conclusion'), /에너지 차이는 약 0\.7 eV/);
        assert.equal(await P.isVisible('#old-notes'), true);
        assert.match(await P.$eval('#old-notes-list', e => e.textContent), /기울기가 양수라 길어졌다/);
        // 보고서 탭에도 같은 글 (우리 생각 · 변인·예상)
        assert.equal(await P.inputValue('#rai-t-problem'), '가열하면 알갱이 크기가 달라져서?');
        assert.match(await P.textContent('#rai-tabs button[data-tab="design"]'), /변인·예상/);
        // 새로고침해도 한 번만 옮김
        await P.reload();
        await P.waitForSelector('#report-ai .rai-card', { state: 'attached' });
        const again = await P.evaluate(() => ReportAI.current.state().sections.analysis);
        assert.equal((again.match(/기울기가 양수라 길어졌다/g) || []).length, 1, '두 번 옮기지 않음');
        assert.equal(await P.isChecked(vc + ' input[data-vc="change"][value="heat"]'), true, '변인 카드가 저장에서 다시 채워짐');
        // 보고서 탭에서 글로 고쳐도 변인 카드가 따라옴
        await P.click('nav.steps button[data-step="conclusion"]');
        await P.click('#rai-tabs button[data-tab="design"]');
        await P.fill('#rai-t-design', (await P.inputValue('#rai-t-design')).replace('[바꿀 것] 가열 시간', '[바꿀 것] 재료 비율 (요소/구연산)'));
        assert.equal(await P.isChecked(vc + ' input[data-vc="change"][value="ratio"]'), true);
        assert.deepEqual(errors, []);

        // ⑥ 375px (수업 없이 연 폰): 가로 스크롤 없음·단추 44px
        const ph = await newPage(browser, app, devices['iPhone 13'], Object.assign({ arg: store }, seed));
        await ph.page.goto(ORIGIN + '/projects/quantum-dot.html');
        await ph.page.waitForSelector('#report-ai .rai-card', { state: 'attached' });
        for (const k of ['purpose', 'procedure', 'data', 'result', 'conclusion']) {
            await ph.page.click('nav.steps button[data-step="' + k + '"]');
            assert.equal(await hscroll(ph.page), 0, '375 ' + k);
        }
        await ph.page.click('nav.steps button[data-step="procedure"]');
        await ph.page.check(vc + ' input[data-vc="change"][value="heat"]');
        assert.deepEqual(await small(ph.page, '.step-panel[data-step="procedure"] label.rai-pill, .qd-look textarea'), []);
        await ph.page.click('nav.steps button[data-step="data"]');
        await ph.page.click('#qdTabs button[data-tab="sample"]');
        assert.equal(await ph.page.isVisible('.tab-panel[data-tab="sample"] [data-var-warn]'), true, '폰도 ⚠');
        assert.deepEqual(await small(ph.page, '.tab-panel[data-tab="sample"] [data-var-warn] button'), []);
        assert.equal(await hscroll(ph.page), 0);
        await ph.page.click('nav.steps button[data-step="conclusion"]');
        assert.deepEqual(await small(ph.page, '.qd-hand button, .qd-hand summary'), []);
        assert.deepEqual(ph.errors, []);

        // ⑦ 발표 보기: 1 목적 첫 화면 = 현상 + 물음
        const pr = await newPage(browser, app, { viewport: { width: 1600, height: 900 } });
        await pr.page.goto(ORIGIN + '/projects/quantum-dot.html?present=1#step-1');
        await pr.page.waitForSelector('.qd-look', { state: 'visible' });
        const top = await pr.page.evaluate(() => {
            const r = e => document.querySelector(e).getBoundingClientRect();
            return { fig: r('.qd-look svg').top < innerHeight, ask: r('.qd-look .qd-ask').top < innerHeight * 1.5, open: document.querySelector('details.qd-purpose-more').open };
        });
        assert.equal(top.fig, true, '그림이 첫 화면에'); assert.equal(top.open, false, '목적 글은 접힘');
        assert.deepEqual(pr.errors, []);
    } finally {
        await browser.close();
    }
});

test('양자점 수업: 우리 생각·변인 카드 → 선생님께 저장 · 교사 조별 보기 · 폰은 바꿀 것 고르기 · 가설연역은 한 벌', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch();
    try {
        const cls = await app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 7 });
        assert.equal(cls.ok, true, cls.error);
        const L = await newPage(browser, app, {}, { fn: () => { try { localStorage.setItem('lab-flow', 'report'); } catch (e) { /* 무시 */ } } });
        await L.page.goto(ORIGIN + '/projects/quantum-dot.html?c=' + cls.classCode + '&s=' + cls.space);
        await L.page.waitForSelector('#cs-cpick:not([hidden])');
        await L.page.selectOption('#cs-cjo', '1'); await L.page.selectOption('#cs-cnum', '1'); await L.page.click('#cs-cjoin');
        await L.page.waitForSelector('#cs-cjoined:not([hidden])');
        await L.page.click('nav.steps button[data-step="purpose"]');
        await L.page.fill('.qd-look .rai-inline[data-sec="problem"] textarea', '탄 정도가 달라서 색이 섞였다?');
        await L.page.click('nav.steps button[data-step="procedure"]');
        const vc = '.rai-inline.rai-vc[data-sec="design"]';
        await L.page.check(vc + ' input[data-vc="change"][value="heat"]');
        await L.page.fill(vc + ' input[data-vc="val1"]', '60초');
        await L.page.fill(vc + ' input[data-vc="val2"]', '180초');
        await L.page.check(vc + ' input[data-vc="predict"][value="down"]');
        await L.page.fill(vc + ' input[data-vc="reason"]', '더 타서 진해지니까');
        const rep = await until(async () => {
            const RL = await app.post({ action: 'reportList', space: cls.space });
            const r = RL.reports && RL.reports[0];
            return r && /\[까닭\] 더 타서/.test(r.sections.design || '') && r.sections.problem ? r : null;
        });
        assert.ok(rep, '선생님께 저장');
        assert.equal(rep.sections.problem, '탄 정도가 달라서 색이 섞였다?');
        assert.match(rep.sections.design, /\[바꿀 것\] 가열 시간\n\[바꿀 값\] 60초 → 180초[\s\S]*\[예상\] 짧아진다/);
        // 7 결론: 측정값은 5 데이터, 글은 보고서 최종 제출 하나
        await L.page.click('nav.steps button[data-step="conclusion"]');
        assert.match(await L.page.textContent('.qd-hand'), /최종 제출/);
        assert.doesNotMatch(await L.page.textContent('#rai-q-analysis'), /두 가지가 바뀐/, '그런 시료가 없으면 물음도 없음');
        assert.equal(await L.page.isVisible('.qd-hand button[data-go="data"]'), true);
        assert.deepEqual(L.errors, []);

        // 📱 폰(노트북 QR): 노트북 변인 카드에서 고른 '바꿀 것'을 보여 줌
        await L.page.click('nav.steps button[data-step="data"]');
        await L.page.waitForSelector('#phone-card a[href*="role=phone"]', { state: 'attached', timeout: 15000 });
        const link = await L.page.getAttribute('#phone-card a[href*="role=phone"]', 'href');
        const F = await newPage(browser, app, devices['iPhone 13']);
        await F.page.goto(new URL(link, ORIGIN + '/projects/').href);
        await F.page.waitForSelector('#qdTabs', { state: 'attached' });
        await F.page.click('#qdTabs button[data-tab="sample"]');
        // 보고서는 기기마다 따로라 폰은 노트북 카드를 읽지 못함 → 폰에서 '바꿀 것'을 같게 한 번 고름, 그 뒤 ⚠ 는 그 기준
        assert.match(await F.page.textContent('#var-now'), /노트북 변인 카드와 같게/);
        await F.page.check('#var-now input[value="heat"]');
        await F.page.reload();
        await F.page.waitForSelector('#qdTabs', { state: 'attached' });
        await F.page.click('#qdTabs button[data-tab="sample"]');
        assert.equal(await F.page.isChecked('#var-now input[value="heat"]'), true, '폰에 기억');
        assert.deepEqual(await small(F.page, '#var-now label'), []);
        assert.equal(await hscroll(F.page), 0, '폰 측정 화면 375 가로 스크롤');
        assert.deepEqual(await small(F.page, '.qd-measure button:not([hidden])'), [], '폰 측정 화면 44px');
        assert.deepEqual(F.errors, []);

        // 교사 화면: ⚙ 설정 → 🤖 보고서 AI 조별 보기
        const T = await newPage(browser, app);
        await T.page.goto(ORIGIN + '/projects/class-teacher.html');
        await T.page.click('#btnLogin');
        await T.page.waitForSelector('#btnSettings:not([hidden])');
        await T.page.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); });
        await T.page.click('#ctTabs button[data-tab="ai"]');
        await T.page.selectOption('#aiView', cls.space);
        await T.page.click('#aiViewRefresh');
        await T.page.waitForSelector('#aiGroups button[data-aig]', { timeout: 10000 });
        await T.page.click('#aiGroups button[data-aig]');
        const detail = await T.page.textContent('#aiGroupBody');
        assert.match(detail, /탄 정도가 달라서/); assert.match(detail, /바꿀 것\] 가열 시간/); assert.match(detail, /예상\] 짧아진다/);
        assert.deepEqual(T.errors, []);

        // ⑤ 가설연역 수업: ① 탐구 문제·③ 변인 카드가 한 벌씩, 같은 글
        const hd = await app.post({ action: 'createClass', ban: 3, nStudents: 2, groupSize: 2, exp: 'qdot', flow: 'hd', stage: 6 });
        const H = await newPage(browser, app);
        await H.page.goto(ORIGIN + '/projects/quantum-dot.html?c=' + hd.classCode + '&s=' + hd.space);
        await H.page.waitForSelector('#cs-cpick:not([hidden])');
        await H.page.selectOption('#cs-cjo', '1'); await H.page.selectOption('#cs-cnum', '1'); await H.page.click('#cs-cjoin');
        await H.page.waitForSelector('nav.steps button[data-step="design"]');
        assert.equal(await H.page.locator('.rai-inline[data-sec="problem"]').count(), 1, '탐구 문제 칸 하나');
        assert.equal(await H.page.locator('.qd-look .rai-inline[data-sec="problem"]').count(), 1, '현상 그림 바로 아래');
        assert.match(await H.page.textContent('.qd-look .rai-inline[data-sec="problem"]'), /탐구 문제/);
        await H.page.click('nav.steps button[data-step="design"]');
        assert.equal(await H.page.locator('.rai-inline[data-sec="design"]').count(), 1, '탐구 설계 칸 하나');
        assert.equal(await H.page.locator('.rai-inline[data-sec="design"] textarea').count(), 0, '글 칸 대신 변인 카드');
        assert.equal(await H.page.isVisible(vc), true);
        await H.page.check(vc + ' input[data-vc="change"][value="ratio"]');
        // 바꿀 값(①→②)과 예상 방향을 정하기 전에는 ③ 뒤 단계로 못 감 → 안내 + 카드로 (골라야 다음)
        await H.page.click('nav.steps button[data-step="conclude"]');
        assert.equal(await H.page.isVisible(vc), true, '카드에 남음');
        assert.match(await H.page.textContent('#rai-gate-toast'), /바꿀 값 ①과 ②를 적고 예상 방향/);
        assert.equal(await H.page.isDisabled('.step-panel[data-step="procedure"] .step-next button[data-go="perform"]'), true, '다음 단추 꺼짐');
        await H.page.fill(vc + ' input[data-vc="val1"]', '1:1');
        await H.page.fill(vc + ' input[data-vc="val2"]', '3:1');
        await H.page.check(vc + ' input[data-vc="predict"][value="up"]');
        assert.equal(await H.page.isDisabled('.step-panel[data-step="procedure"] .step-next button[data-go="perform"]'), false, '정하면 켜짐 (까닭은 안 써도)');
        await H.page.click('nav.steps button[data-step="conclude"]');
        await H.page.click('#rai-tabs button[data-tab="design"]');
        assert.match(await H.page.inputValue('#rai-t-design'), /^\[바꿀 것\] 재료 비율/);
        await H.page.click('#rai-tabs button[data-tab="verdict"]');
        assert.match(await H.page.textContent('#rai-q-verdict'), /내 예상\(변인 카드\)과 결과/);
        assert.equal(await H.page.isVisible('.step-panel[data-step="conclusion"] [data-rai-compare="design"] .rai-cmp-grid'), true, '⑥ 에도 예상 ↔ 결과');
        assert.deepEqual(H.errors, []);
    } finally {
        await browser.close();
    }
});

test('양자점 6-2: 가로축 = 조가 바꾼 것(변인 카드 → 시료 값으로 짐작), 다른 축이면 안내, 점 2개면 R² 대신 안내', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch();
    try {
        // 재료 비율 조: 가열은 같고 요소만 1 → 2 g
        const ratioSamples = [sample(1, 120, 470), sample(2, 120, 500, { urea: 2 })];
        const store = { 'lab-flow': 'report', 'quantum-dot-v1': JSON.stringify({ samples: ratioSamples }) };
        const { page: P, errors } = await newPage(browser, app, devices['Galaxy Tab S4'], Object.assign({ arg: store }, seed));
        await P.goto(ORIGIN + '/projects/quantum-dot.html#step-6');
        await P.waitForSelector('#report-ai .rai-card', { state: 'attached' });
        await P.waitForFunction(() => /점이 2개라/.test(document.getElementById('xy-fit').textContent));
        assert.equal(await P.inputValue('#sel-x'), 'ratio', '바꿀 것을 안 골라도 시료 값으로 짐작(요소만 바뀜)');
        assert.doesNotMatch(await P.textContent('#xy-fit'), /R² = 1\.000/, '점 2개면 R² 대신 안내');
        // 변인 카드에서 재료 비율을 고르고, 가로축을 가열 시간으로 바꾸면 안내 → 되돌리기
        await P.click('nav.steps button[data-step="procedure"]');
        await P.check('.rai-vc input[data-vc="change"][value="ratio"]');
        await P.fill('.rai-vc input[data-vc="val1"]', '1:1');
        await P.fill('.rai-vc input[data-vc="val2"]', '2:1');
        await P.check('.rai-vc input[data-vc="predict"][value="up"]');
        await P.click('nav.steps button[data-step="result"]');
        assert.equal(await P.inputValue('#sel-x'), 'ratio');
        await P.selectOption('#sel-x', 'heat');
        assert.match(await P.textContent('#xy-fit'), /우리 조가 바꾼 것은 재료 비율.*바꾸지 않은 것/s);
        assert.deepEqual(await small(P, '#xy-fit button'), []);
        await P.click('#xy-fit [data-xfix]');
        assert.equal(await P.inputValue('#sel-x'), 'ratio');
        assert.doesNotMatch(await P.textContent('#xy-fit'), /우리 조가 바꾼 것은/);
        assert.deepEqual(errors, []);
        // 받은 시료처럼: 바꿀 것을 안 고른 기기에서 가열만 다른 시료 3개 → 가열 시간, R² 표시
        const heat = await newPage(browser, app, devices['Galaxy Tab S4'], Object.assign({ arg: { 'lab-flow': 'report', 'quantum-dot-v1': JSON.stringify({ samples: [sample(1, 60, 470), sample(2, 120, 480), sample(3, 180, 495)] }) } }, seed));
        await heat.page.goto(ORIGIN + '/projects/quantum-dot.html#step-6');
        await heat.page.waitForFunction(() => /R² = /.test(document.getElementById('xy-fit').textContent));
        assert.equal(await heat.page.inputValue('#sel-x'), 'heat');
        assert.deepEqual(heat.errors, []);
    } finally {
        await browser.close();
    }
});
