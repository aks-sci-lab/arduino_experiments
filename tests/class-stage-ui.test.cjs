// 선생님이 여는 단계 (교사 화면 '▶ 다음 단계 열기', js/class-share.js 잠금) — Playwright, 가짜 저장소
//  교사(1280): 로그인 → 첫 화면은 진행 화면(⚙ 설정 안에 수업 만들기) → 탄소 양자점(7단계) 수업 → 1단계만 열림
//  학생 폰 둘(iPhone 13): 2단계 🔒(누르면 안내, 안 넘어감) → 교사 ▶ 다음 단계 열기 → 두 폰이 저절로 2단계로 → ◀ 되돌리기 → 1단계로
//  필름통 로켓 팀: 1차시 🔒 → 교사 열기 → 1차시 첫 화면으로
//  예전 수업(stage 없음)·📱 폰 측정 화면(?role=phone)은 잠그지 않음, 375px·1280 가로 스크롤 없음·단추 44px
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';

test('선생님이 여는 단계: 교사 진행 화면 → 학생 폰 둘 저절로 이동·잠금, 로켓 팀, 예전 수업·폰 측정 화면은 잠금 없음', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore();
    const api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    const errors = [];
    const ctx = async (opt, name) => {
        const c = await browser.newContext(Object.assign({ permissions: ['camera'] }, opt));
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { devCollect: true }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' }); });
        await c.route(/gstatic/, r => r.abort());
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message));
        pg.on('dialog', d => d.accept());
        return pg;
    };
    const layout = async (pg, n, min) => {
        assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
        const small = await pg.evaluate(m => [...document.querySelectorAll('button, select')].filter(e => e.offsetParent && !e.closest('td, th, .subtabs, nav.steps, nav.tabs, .ev-stages, .ev-chips') && !e.classList.contains('ev-link') && e.getBoundingClientRect().height < m - 0.5).map(e => e.id || e.textContent.trim().slice(0, 20)), min || 44);
        assert.deepEqual(small, [], n + ' 작은 단추');
    };
    const selected = pg => pg.evaluate(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.dataset.step : ''; });
    try {
        // ---- 교사: 첫 화면 = 진행 화면, 수업 만들기는 ⚙ 설정 안 ----
        const T = await ctx({ viewport: { width: 1280, height: 900 } }, 'T');
        await T.goto(ROOT + 'projects/class-teacher.html');
        await T.click('#btnLogin');
        await T.waitForSelector('#btnSettings:not([hidden])');
        assert.equal(await T.isVisible('#viewMain'), true, '첫 화면은 진행 화면');
        assert.equal(await T.isVisible('#inExp'), false, '수업 만들기는 첫 화면에 없음');
        assert.equal(await T.isVisible('#acctNow'), false, '계정(이메일)은 첫 화면에 없음');
        // 개발 메뉴: 사이트 관리 교사(가짜 로그인 teacher: true)면 ⚙ 설정 → 계정 안에 보임
        await T.click('#btnSettings'); await T.click('#ctTabs button[data-tab="account"]');
        await T.waitForSelector('#devBox:not([hidden])');
        await T.click('#btnMain');
        assert.equal(await T.isVisible('#noClass'), true, '수업이 없으면 만들기 안내');
        await T.click('#btnGoMake');
        assert.equal(await T.isVisible('#inExp'), true);
        await T.fill('#inBan', '3'); await T.fill('#inN', '4'); await T.fill('#inSize', '2');
        await T.selectOption('#inExp', 'qdot');
        await T.click('#btnCreate');
        await T.waitForSelector('#viewMain:not([hidden]) #classOut:not([hidden])');
        await T.click('#btnToRun'); await T.waitForFunction(() => !document.getElementById('runPane').hidden || !document.getElementById('presentPane').hidden); if (await T.isVisible('#btnPExit')) { await T.click('#btnPExit'); await T.click('#btnRunPopGo'); } await T.waitForSelector('#runPane:not([hidden])');
        assert.match(await T.textContent('#stageNow'), /1 목적.*\(1 \/ 7\)/);
        assert.match(await T.textContent('#btnStageNext'), /2 이론/);
        assert.equal(await T.isDisabled('#btnStagePrev'), true);
        await layout(T, '교사 진행 화면 1280');
        const link = await T.getAttribute('#outLink', 'href');
        const url = link.replace(/^https?:\/\/[^/]+\//, ROOT);

        // ---- 학생 폰 둘 ----
        const P = [];
        for (const [jo, num] of [[1, 1], [2, 1]]) {
            const S = await ctx(devices['iPhone 13'], 'S' + jo);
            await S.goto(url);
            await S.waitForSelector('#cs-cpick:not([hidden])');
            await S.selectOption('#cs-cjo', String(jo)); await S.selectOption('#cs-cnum', String(num)); await S.click('#cs-cjoin');
            await S.waitForSelector('nav.steps button[data-step="theory"].cs-locked');
            P.push(S);
        }
        const S1 = P[0];
        assert.equal(await selected(S1), 'purpose');
        await S1.click('nav.steps button[data-step="theory"]', { force: true });
        assert.equal(await selected(S1), 'purpose', '잠긴 단계는 안 열림');
        assert.match(await S1.textContent('.cs-toast'), /선생님이 열면/);
        await layout(S1, '학생 폰 375');
        // 교사: ▶ 다음 단계 열기 → 두 폰이 저절로 2단계로
        await T.click('#btnStageNext');
        await T.waitForFunction(() => /2 이론.*까지 열었어요/.test(document.getElementById('stageMsg').textContent));
        // 단계를 열면 설명부터 (2026-11-23): 진행 화면에서 열어도 🎬 발표 보기로 넘어가 그 단계 첫 장 → '📋 진행 화면' 으로 돌아옴
        await T.waitForSelector('#presentPane:not([hidden])'); await T.waitForSelector('#pSlides .ls-slide'); await T.click('#btnPExit'); await T.click('#btnRunPopGo'); await T.waitForSelector('#runPane:not([hidden])');
        for (const S of P) await S.waitForFunction(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b && b.dataset.step === 'theory'; }, null, { timeout: 15000 });
        assert.equal(await S1.isVisible('nav.steps button[data-step="materials"].cs-locked'), true, '3단계는 아직 잠김');
        assert.equal(await S1.isVisible('nav.steps button[data-step="purpose"].cs-locked'), false, '지난 단계는 다시 볼 수 있음');
        await S1.click('nav.steps button[data-step="purpose"]'); assert.equal(await selected(S1), 'purpose');
        // ◀ 되돌리기: 2단계에 있던 폰은 1단계로
        await T.click('#btnStagePrev');
        await P[1].waitForFunction(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b && b.dataset.step === 'purpose'; }, null, { timeout: 15000 });
        assert.equal(await P[1].isVisible('nav.steps button[data-step="theory"].cs-locked'), true);
        // 모두 열기
        await T.evaluate(() => { const b = document.getElementById('btnMain'); if (!b.hidden) b.click(); const r = document.getElementById('btnToRun'); if (r && r.offsetParent) { const m = /class=([a-z0-9]{24})/.exec(location.hash); location.hash = '#class=' + m[1] + '&view=run'; } }); await T.click('#btnStageAll');
        await P[1].waitForFunction(() => !document.querySelector('nav.steps .cs-locked'), null, { timeout: 15000 });
        assert.match(await T.textContent('#stageNow'), /모든 단계 열림/);

        // ---- 📱 폰 측정 화면(?role=phone)은 잠그지 않음 ----
        const c1 = app.db.dump();
        const space = /s=(c[a-z0-9]{23})/.exec(link)[1];
        await app.post({ action: 'classStage', space, stage: 1 });
        const PH = await ctx(devices['iPhone 13'], 'PH');
        await PH.goto(url + '&role=phone&group=' + encodeURIComponent(Object.values(c1).find(d => d.classCode && d.exp === 'qdot').groups[0].code) + '&jo=1&num=2');
        await PH.waitForTimeout(1500);
        assert.equal(await PH.locator('.cs-locked').count(), 0, '폰 측정 화면은 잠금 없음');

        // ---- 예전 수업(stage 없음): 잠금 없음 ----
        const old = await app.post({ action: 'createClass', ban: 4, nStudents: 2, groupSize: 2, exp: 'qdot', stage: 1 });
        delete app.db.docs.get('labClasses/' + old.space).stage;
        const O = await ctx(devices['iPhone 13'], 'O');
        await O.goto(ROOT + 'projects/quantum-dot.html?c=' + old.classCode + '&s=' + old.space);
        await O.waitForSelector('#cs-cpick:not([hidden])');
        await O.selectOption('#cs-cjo', '1'); await O.selectOption('#cs-cnum', '1'); await O.click('#cs-cjoin');
        await O.waitForTimeout(800);
        assert.equal(await O.locator('.cs-locked').count(), 0, '예전 수업은 모두 열림');

        // ---- 필름통 로켓 팀 ----
        await T.click('#btnSettings'); await T.click('#ctTabs button[data-tab="make"]');
        await T.selectOption('#inExp', 'rocket'); await T.fill('#inTeams', '4');
        await T.click('#btnCreate');
        await T.waitForSelector('#viewMain:not([hidden]) #classOut:not([hidden])');
        await T.click('#btnToRun'); await T.waitForFunction(() => !document.getElementById('runPane').hidden || !document.getElementById('presentPane').hidden); if (await T.isVisible('#btnPExit')) { await T.click('#btnPExit'); await T.click('#btnRunPopGo'); } await T.waitForSelector('#runPane:not([hidden])');
        assert.match(await T.textContent('#stageNow'), /생각 열기.*\(1 \/ 4\)/);
        const rlink = (await T.getAttribute('#outLink', 'href')).replace(/^https?:\/\/[^/]+\//, ROOT);
        const F = await ctx(devices['iPhone 13'], 'F');
        await F.goto(rlink);
        await F.waitForSelector('[data-screen="enter"]');
        await F.fill('#ev-name', '단계 가족'); await F.click('#ev-start');
        await F.waitForSelector('[data-screen="think-intro"]');
        await F.waitForSelector('.ev-stage.locked[data-stage="t1"]');
        await F.click('.ev-stage[data-stage="t1"]', { force: true });
        await F.waitForSelector('[data-screen="locked"]');
        assert.match(await F.textContent('.ev-screen'), /아직 잠겨 있어요/);
        await layout(F, '로켓 잠금 화면', 56);
        await T.click('#btnStageNext');
        // 단계를 열면 설명부터 (2026-11-23): 진행 화면에서 열어도 🎬 발표 보기로 넘어가 그 단계 첫 장('기체' 응답 장)
        //  → 팀 폰은 그 답 칸(q-gas, 📱 폰은 응답만) → '📋 진행 화면'(설명을 닫음)으로 돌아오면 폰은 하던 곳(1차시 첫 화면)
        await T.waitForSelector('#presentPane:not([hidden])'); await T.waitForSelector('#pSlides .ls-slide');
        await F.waitForSelector('[data-screen="q-gas"]', { timeout: 15000 });
        await T.click('#btnPExit'); await T.click('#btnRunPopGo'); await T.waitForSelector('#runPane:not([hidden])');
        await F.waitForSelector('[data-screen="t1-intro"]', { timeout: 15000 });
        assert.equal(await F.isVisible('.ev-stage.locked[data-stage="t2"]'), true);
        // 결과판은 그대로 진행 화면에
        await T.waitForSelector('#boardCard:not([hidden])');

        // ---- 다른 선생님(일반 구글 계정): 개발 메뉴 없음 ----
        const O2 = await ctx({ viewport: { width: 1280, height: 800 } }, 'O2');
        await O2.addInitScript(() => { localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-2', google: true, email: 'other@example.com', name: '다른 선생님' })); });
        await O2.goto(ROOT + 'projects/class-teacher.html');
        await O2.waitForSelector('#btnSettings:not([hidden])');
        await O2.click('#btnSettings'); await O2.click('#ctTabs button[data-tab="account"]');
        await O2.waitForTimeout(800);
        assert.equal(await O2.isVisible('#devBox'), false, '다른 교사에게는 개발 메뉴 없음');
        assert.equal(await O2.locator('#devBox:not([hidden])').count(), 0);

        // ---- 교사 375px ----
        const T3 = await ctx({ viewport: { width: 375, height: 800 } }, 'T3');
        await T3.goto(ROOT + 'projects/class-teacher.html');
        await T3.click('#btnLogin'); await T3.click('#classList button[data-open]'); await T3.click('#btnToRun'); await T3.waitForFunction(() => !document.getElementById('runPane').hidden || !document.getElementById('presentPane').hidden); if (await T3.isVisible('#btnPExit')) { await T3.click('#btnPExit'); await T3.click('#btnRunPopGo'); } await T3.waitForSelector('#runPane:not([hidden])'); await T3.waitForSelector('#stageCard:not([hidden])');
        await layout(T3, '교사 진행 화면 375');
        await T3.click('#btnSettings');
        await layout(T3, '교사 설정 375');
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); api.close(); stat.close();
    }
});
