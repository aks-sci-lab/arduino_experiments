// 변인 카드 '골라야 다음' (교수 세션 공통 원칙 2, docs/virtual-class/professor/common.md) — Playwright, 가짜 저장소
//  ① 보고서 실험 5개(플랑크·이상기체·전자기 유도·자유낙하·진자 분석): 4. 과정 맨 위 변인 카드(실험마다 바꿀 것·재는 것), 고르기 전엔 '다음' 꺼짐·안내,
//     위 단계 단추로 5. 데이터를 누르면 안내 + 카드로, 바꿀 것 + 예상을 고르면(까닭 없이도) 켜짐
//  ② 6 결과·7 결론 '🔮 내 예상 ↔ 📊 결과': 결과 방향을 학생이 고름 → ✅/🤔, 보고서 항목에 '[결과] …' 로 저장
//  ③ 가설연역(③ 탐구 설계 → ④ 탐구 수행)도 같음, 수업이면 선생님 보고서에도 저장
//  ④ 막지 않는 화면: 📱 폰(iPhone 13), 🎬 발표용(?present=1). 375px 가로 스크롤 없음·고르기 칸 44px
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadLabStore } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://lab.test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.csv': 'text/csv' };
const FAKE_CHART = 'window.Chart=class{constructor(c,o){this.data=(o&&o.data)||{datasets:[]};this.options=(o&&o.options)||{};}update(){}destroy(){}resize(){}};';
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

const PAGES = {
    'planck-led': { exp: 'planck', change: ['led'], measure: /문턱 전압 V₀/ },
    'ideal-gas': { exp: 'idealgas', change: ['pres', 'temp'], measure: /주사기 부피 V/ },
    'em-induction': { exp: 'eminduction', change: ['speed', 'turns'], measure: /코일 전압 봉우리/ },
    'free-fall': { exp: 'freefall', change: ['ball', 'height'], measure: /중력 가속도 g/ },
    'pendulum-report': { exp: 'pendulum', change: ['len', 'amp', 'mass'], measure: /주기 T/ }
};
const VC = '.rai-inline.rai-vc[data-sec="design"]';
const selected = pg => pg.evaluate(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.dataset.step : ''; });
const hscroll = pg => pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const setFlow = f => ({ fn: v => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('lab-flow', v); sessionStorage.setItem('seeded', '1'); } } catch (e) { /* 무시 */ } }, arg: f });

test('변인 카드 골라야 다음: 보고서 실험 5개 (수업 없이, 노트북)', { skip: !chromium && 'playwright 없음', timeout: 400000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch();
    try {
        for (const [name, want] of Object.entries(PAGES)) {
            const { page: P, errors, ctx } = await newPage(browser, app, {}, setFlow('report'));
            await P.goto(ORIGIN + '/projects/' + name + '.html');
            await P.waitForSelector('#report-ai .rai-card', { state: 'attached' });
            await P.click('nav.steps button[data-step="procedure"]');
            // 카드는 4. 과정 맨 위
            assert.equal(await P.isVisible(VC), true, name + ' 카드');
            assert.equal(await P.evaluate(sel => { const p = document.querySelector('.step-panel[data-step="procedure"]'), c = document.querySelector(sel); return p.firstElementChild.contains(c); }, VC), true, name + ' 4. 과정 맨 위');
            assert.deepEqual(await P.$$eval(VC + ' input[data-vc="change"]', a => a.map(i => i.value)), want.change, name + ' 바꿀 것 후보');
            assert.match(await P.textContent(VC + ' .rai-vc-line'), want.measure, name + ' 재는 것');
            // 고르기 전: 다음 꺼짐·안내
            const next = '.step-panel[data-step="procedure"] [data-go="data"]';
            assert.equal(await P.isDisabled(next), true, name + ' 다음 꺼짐');
            assert.match(await P.textContent('.step-panel[data-step="procedure"] .rai-gate-note'), /바꿀 것과 예상 방향을 고르면/);
            // 위 단계 단추로 5. 데이터 → 안내 + 카드에 남음
            await P.click('nav.steps button[data-step="data"]');
            assert.equal(await selected(P), 'procedure', name + ' 5. 데이터로 안 감');
            assert.match(await P.textContent('#rai-gate-toast'), /먼저 4\. 과정의 변인 카드에서 바꿀 것과 예상 방향을 골라요/);
            await P.click('nav.steps button[data-step="conclusion"]');
            assert.equal(await selected(P), 'procedure', name + ' 7. 결론으로도 안 감');
            // 앞 단계로는 갈 수 있음
            await P.click('nav.steps button[data-step="theory"]');
            assert.equal(await selected(P), 'theory');
            await P.click('nav.steps button[data-step="procedure"]');
            // 바꿀 것만 → 아직, 예상까지 → 켜짐 (까닭은 비워 둠)
            await P.check(VC + ' input[data-vc="change"][value="' + want.change[0] + '"]');
            assert.equal(await P.isDisabled(next), true, name + ' 바꿀 것만으로는 아직');
            assert.match(await P.textContent(VC + ' [data-vc-keep]'), /🔒/, name + ' 나머지 🔒');
            await P.check(VC + ' input[data-vc="predict"][value="up"]');
            assert.equal(await P.isDisabled(next), false, name + ' 고르면 켜짐');
            assert.equal(await P.locator('.rai-gate-note').count(), 0, name + ' 안내 사라짐');
            await P.click(next);
            assert.equal(await selected(P), 'data', name + ' 5. 데이터로');
            // 6 결과: 예상 ↔ 결과, 결과 방향 고르기
            await P.click('nav.steps button[data-step="result"]');
            const cmp = '.step-panel[data-step="result"] [data-rai-compare="design"]';
            assert.match(await P.textContent(cmp), /내 예상[\s\S]*커진다[\s\S]*결과/, name + ' 예상이 결과 옆에');
            await P.check(cmp + ' input[data-obs][value="same"]');
            await P.waitForFunction(s => /예상과 달라요/.test(document.querySelector(s).textContent), cmp);
            await P.check(cmp + ' input[data-obs][value="up"]');
            await P.waitForFunction(s => /예상과 같은 방향/.test(document.querySelector(s).textContent), cmp);
            // 7 결론에도 같은 것, 보고서 항목에 저장
            await P.click('nav.steps button[data-step="conclusion"]');
            assert.equal(await P.isChecked('.step-panel[data-step="conclusion"] [data-rai-compare="design"] input[data-obs][value="up"]'), true, name + ' 결론에도 같은 결과');
            const design = await P.evaluate(() => ReportAI.current.state().sections.design);
            assert.match(design, /^\[바꿀 것\] .+\n\[재는 것\] .+\n\[같게 둘 것\] .+[\s\S]*\[예상\] 커진다\n\[결과\] 커진다$/, name + ' 저장 ' + design);
            // 새로고침해도 고른 것 그대로, 막힘 없음
            await P.reload();
            await P.waitForSelector('#report-ai .rai-card', { state: 'attached' });
            await P.click('nav.steps button[data-step="procedure"]');
            assert.equal(await P.isChecked(VC + ' input[data-vc="predict"][value="up"]'), true);
            assert.equal(await P.isDisabled(next), false);
            assert.deepEqual(errors, [], name + ' 오류');
            await ctx.close();
        }
    } finally {
        await browser.close();
    }
});

test('변인 카드: 가설연역 ③ → ④ · 수업이면 선생님께 저장 · 폰·발표용은 막지 않음 · 375px', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch();
    try {
        // 가설연역 수업 (진자 분석)
        const cls = await app.post({ action: 'createClass', ban: 3, nStudents: 4, groupSize: 2, exp: 'pendulum', stage: 6, flow: 'hd' });
        assert.equal(cls.ok, true, cls.error);
        const L = await newPage(browser, app);
        await L.page.goto(ORIGIN + '/projects/pendulum-report.html?c=' + cls.classCode + '&s=' + cls.space);
        await L.page.waitForSelector('#cs-cpick:not([hidden])');
        await L.page.selectOption('#cs-cjo', '1'); await L.page.selectOption('#cs-cnum', '1'); await L.page.click('#cs-cjoin');
        await L.page.waitForSelector('#cs-cjoined:not([hidden])');
        await L.page.click('nav.steps button[data-step="design"]');
        assert.equal(await L.page.isVisible(VC), true, '③ 탐구 설계에 카드');
        await L.page.click('nav.steps button[data-step="perform"]');
        assert.equal(await selected(L.page), 'design', '④ 로 안 감');
        assert.match(await L.page.textContent('#rai-gate-toast'), /③ 탐구 설계의 변인 카드/);
        await L.page.check(VC + ' input[data-vc="change"][value="len"]');
        await L.page.check(VC + ' input[data-vc="predict"][value="up"]');
        await L.page.fill(VC + ' input[data-vc="reason"]', '줄이 길면 더 멀리 가니까');
        await L.page.click('nav.steps button[data-step="perform"]');
        assert.equal(await selected(L.page), 'perform');
        const saved = await (async () => { for (let i = 0; i < 40; i++) { const r = await app.post({ action: 'reportList', space: cls.space }); const x = (r.reports || [])[0]; if (x && /\[까닭\] 줄이 길면/.test(x.sections.design || '')) return x; await new Promise(z => setTimeout(z, 300)); } return null; })();
        assert.ok(saved, '선생님께 저장');
        assert.match(saved.sections.design, /\[바꿀 것\] 줄 길이 L[\s\S]*\[예상\] 커진다\n\[까닭\] 줄이 길면 더 멀리 가니까/);
        assert.deepEqual(L.errors, []);

        // 📱 폰으로 연 화면(수업 없이): 막지 않음
        const F = await newPage(browser, app, devices['iPhone 13'], setFlow('report'));
        await F.page.goto(ORIGIN + '/projects/free-fall.html');
        await F.page.waitForSelector('#report-ai .rai-card', { state: 'attached' });
        await F.page.click('nav.steps button[data-step="data"]');
        assert.equal(await selected(F.page), 'data', '폰은 막지 않음');
        await F.page.click('nav.steps button[data-step="procedure"]');
        assert.equal(await F.page.locator('.rai-gate-note').count(), 0);
        assert.equal(await hscroll(F.page), 0, '폰 375 가로 스크롤 없음');
        const small = await F.page.$$eval(VC + ' label.rai-pill', a => a.filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height)).filter(h => h < 44));
        assert.deepEqual(small, [], '고르기 칸 44px');
        assert.deepEqual(F.errors, []);

        // 🎬 발표용: 막지 않음
        const T = await newPage(browser, app, {}, setFlow('report'));
        await T.page.goto(ORIGIN + '/projects/planck-led.html?present=1');
        await T.page.waitForSelector('nav.steps button[data-step="data"]');
        await T.page.click('nav.steps button[data-step="data"]');
        assert.equal(await selected(T.page), 'data', '발표용은 막지 않음');
        assert.deepEqual(T.errors, []);

        // 노트북 375px 창(터치 없음): 카드 가로 스크롤 없음
        const N = await newPage(browser, app, { viewport: { width: 375, height: 800 } }, setFlow('report'));
        await N.page.goto(ORIGIN + '/projects/ideal-gas.html#step-4');
        await N.page.waitForSelector(VC + ':not([hidden])');
        assert.equal(await hscroll(N.page), 0, '375 가로 스크롤 없음');
        assert.deepEqual(N.errors, []);
    } finally {
        await browser.close();
    }
});
