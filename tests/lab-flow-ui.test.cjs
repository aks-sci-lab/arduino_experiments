// 진행 방법 두 가지 (📋 7단계 / 🔍 가설연역 6단계, docs/inquiry-types-design.md) — 계산 + Playwright, 가짜 저장소
//  ① ClassCloud: gateSteps·stageInfo·stepName 이 flow 를 봄, 예전 수업(flow 없음)은 7단계
//  ② 수업 없이 연 퀀텀닷: 위 '진행 방법' 고르기 → 6단계(③ = 준비물+과정), 새로고침해도 기억, #step-4 = ④ 탐구 수행(5. 데이터), 7단계 진행 기억은 따로
//  ③ 교사(1280)가 가설연역 수업 → 학생 폰 둘(iPhone 13) 6단계·고르기 숨김·② 🔒 → ▶ 다음 단계 열기로 같이 ② → 진행 보기 단계 이름, 발표 보기도 6단계
//  ④ 7단계 수업·예전 수업은 그대로 7단계, 📱 폰 측정 화면은 잠금 없음, 노트북·태블릿(Galaxy Tab S4)·375px 가로 스크롤 없음·단추 44px
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const CC = require('../js/class-cloud.js');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
const pickVars = require('./vars-pick.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';
const HD = ['problem', 'hypothesis', 'design', 'perform', 'interpret', 'conclude'];

test('ClassCloud: 진행 방법(flow)에 따른 단계 목록·이름', () => {
    assert.deepEqual(CC.gateSteps('qdot', 'hd'), HD);
    assert.deepEqual(CC.gateSteps('qdot'), ['purpose', 'theory', 'materials', 'procedure', 'data', 'result', 'conclusion'], '예전 수업(flow 없음) = 7단계');
    assert.equal(CC.gateSteps('qdot', 'report').length, 7);
    for (const e of ['planck', 'pendulum', 'idealgas', 'malus', 'eminduction', 'freefall']) assert.equal(CC.gateSteps(e, 'hd').length, 6, e + ' 가설연역');
    assert.equal(CC.gateSteps('custom:abc', 'hd'), null, '선생님이 만든 실험은 단계 열기 없음 (방법은 만들 때 고름)');
    assert.equal(CC.gateSteps('rocket', 'hd').length, 4, '행사형은 그대로');
    assert.equal(CC.canFlow('qdot'), true); assert.equal(CC.canFlow('env'), false); assert.equal(CC.canFlow('rocket'), false);
    const si = CC.stageInfo('qdot', 2, 'hd');
    assert.equal(si.cur, 'hypothesis'); assert.equal(si.gate.length, 6);
    assert.equal(CC.stageInfo('qdot', 99, 'hd').all, true);
    assert.equal(CC.stepName('qdot', 'data', 'hd'), '④ 탐구 수행', '학생 화면이 패널 키를 보내도 가설연역 이름');
    assert.equal(CC.stepName('qdot', 'procedure', 'hd'), '③ 탐구 설계');
    assert.equal(CC.stepName('qdot', 'perform', 'hd'), '④ 탐구 수행');
    assert.equal(CC.stepName('qdot', 'data'), '5 데이터', '7단계 수업은 그대로');
    assert.equal(CC.stepName('qdot', 'phone-data', 'hd'), '📱 ④ 탐구 수행');
    assert.equal(CC.stepName('env', 'live', 'hd'), '측정 중');
});

test('저장소: 수업 만들기의 flow (가설연역만 저장, 이상한 값·팀 수업은 막음)', async () => {
    const app = loadLabStore();
    const a = await app.post({ action: 'createClass', ban: 1, nStudents: 4, groupSize: 2, exp: 'qdot', flow: 'hd' });
    assert.equal(a.ok, true, a.error); assert.equal(a.flow, 'hd');
    assert.equal(app.db.docs.get('labClasses/' + a.space).flow, 'hd');
    const b = await app.post({ action: 'createClass', ban: 1, nStudents: 4, groupSize: 2, exp: 'qdot' });
    assert.equal(b.flow, ''); assert.equal('flow' in app.db.docs.get('labClasses/' + b.space), false, '7단계는 칸을 만들지 않음 (예전 수업과 같음)');
    assert.equal((await app.post({ action: 'createClass', ban: 1, nStudents: 4, groupSize: 2, exp: 'qdot', flow: 'free' })).ok, false);
    assert.equal((await app.post({ action: 'createClass', ban: 1, mode: 'team', nTeams: 2, exp: 'rocket', flow: 'hd' })).ok, false);
    assert.equal((await app.post({ action: 'joinInfo', space: a.space })).flow, 'hd', '학생도 수업 방법을 읽음');
});

test('진행 방법 화면: 수업 없이 고르기·기억, 가설연역 수업 6단계·단계 열기·발표 보기, 7단계·예전 수업 그대로', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
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
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, {}) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' }); });
        await c.route(/gstatic/, r => r.abort());
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message));
        pg.on('dialog', d => d.accept());
        return pg;
    };
    const layout = async (pg, n) => {
        assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
        const small = await pg.evaluate(() => [...document.querySelectorAll('button, select')].filter(e => e.offsetParent && !e.closest('td, th, .subtabs, nav.steps, nav.tabs') && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim().slice(0, 20)));
        assert.deepEqual(small, [], n + ' 작은 단추');
    };
    const stepKeys = pg => pg.evaluate(() => [...document.querySelectorAll('nav.steps button[data-step]')].map(b => b.dataset.step));
    const selected = pg => pg.evaluate(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.dataset.step : ''; });
    const shownPanels = pg => pg.evaluate(() => [...document.querySelectorAll('.step-panel[data-step]')].filter(p => !p.hidden).map(p => p.dataset.step));
    try {
        // ---- ② 수업 없이: 노트북 ----
        const L = await ctx({ viewport: { width: 1280, height: 900 } }, 'L');
        await L.goto(ROOT + 'projects/quantum-dot.html');
        await L.waitForSelector('.flow-pick:not([hidden])');
        assert.equal((await stepKeys(L)).length, 7, '처음은 7단계');
        await pickVars(L);   // 변인 카드 '골라야 다음'
        await L.click('nav.steps button[data-step="data"]');   // 7단계 진행 기억: 5. 데이터
        await L.click('.flow-pick button[data-flow="hd"]');
        assert.deepEqual(await stepKeys(L), HD);
        assert.equal(await selected(L), 'perform', '보던 5. 데이터 → ④ 탐구 수행으로 이어서');
        assert.deepEqual(await shownPanels(L), ['data']);
        await L.click('nav.steps button[data-step="design"]');
        assert.deepEqual(await shownPanels(L), ['materials', 'procedure'], '③ 탐구 설계 = 준비물 + 과정');
        assert.match(await L.textContent('.step-panel[data-step="materials"] h2'), /③ 탐구 설계 ·/);
        assert.equal(await L.isVisible('.step-panel[data-step="materials"] > .step-next'), false, '묶인 앞 패널의 이전·다음은 숨김');
        assert.match(await L.textContent('.step-panel[data-step="procedure"] > .step-next'), /이전: ② 가설 설정.*다음: ④ 탐구 수행/);
        await L.click('.step-panel[data-step="procedure"] > .step-next button[data-go="perform"]');
        assert.equal(await selected(L), 'perform');
        await L.click('nav.steps button[data-step="problem"]');
        await L.click('.step-panel[data-step="purpose"] .step-next button');
        assert.equal(await selected(L), 'hypothesis', '① 의 다음 → ②');
        await L.click('nav.steps button[data-step="conclude"]');
        assert.equal(await L.isVisible('#report-ai'), true, '⑥ 결론 도출에 보고서 AI 자리 그대로');
        await layout(L, '노트북 가설연역');
        await L.reload();
        await L.waitForSelector('nav.steps button[data-step="problem"]');
        assert.equal(await selected(L), 'conclude', '새로고침해도 방법·단계 기억');
        await L.goto(ROOT + 'projects/quantum-dot.html?h=1#step-4');
        await L.waitForSelector('nav.steps button[data-step="problem"]');
        assert.equal(await selected(L), 'perform', '#step-4 = 가설연역 4번째 단계');
        await L.goto(ROOT + 'projects/quantum-dot.html');
        await L.click('.flow-pick button[data-flow="report"]');
        assert.equal((await stepKeys(L)).length, 7);
        assert.equal(await L.locator('.flow-tag').count(), 0, '7단계로 돌아가면 제목 앞 이름 없음');
        assert.match(await L.textContent('.step-panel[data-step="materials"] > .step-next'), /2\. 이론.*4\. 과정/, '7단계 이전·다음 단추 원래대로');
        assert.equal(await L.evaluate(() => localStorage.getItem('lab-flow')), 'report');

        // 태블릿: 6단계 탭 3+3, 가로 스크롤 없음
        const TB = await ctx(devices['Galaxy Tab S4'], 'TB');
        await TB.addInitScript(() => { try { localStorage.setItem('lab-flow', 'hd'); } catch (e) { /* 무시 */ } });
        await TB.goto(ROOT + 'projects/quantum-dot.html');
        await TB.waitForSelector('nav.steps button[data-step="problem"]');
        await layout(TB, '태블릿 가설연역');

        // ---- ③ 교사: 가설연역 수업 ----
        const T = await ctx({ viewport: { width: 1280, height: 900 } }, 'T');
        await T.goto(ROOT + 'projects/class-teacher.html');
        await T.click('#btnLogin');
        await T.waitForSelector('#btnSettings:not([hidden])');
        await T.click('#btnGoMake');
        await T.fill('#inBan', '5'); await T.fill('#inN', '4'); await T.fill('#inSize', '2');
        await T.selectOption('#inExp', 'env');
        assert.equal(await T.isVisible('#rowFlow'), false, '한 화면 실험은 진행 방법 고르기 없음');
        await T.selectOption('#inExp', 'planck');
        assert.equal(await T.isVisible('#rowFlow'), true, '플랑크도 가설연역을 고를 수 있음');
        await T.selectOption('#inExp', 'qdot');
        assert.equal(await T.isVisible('#rowFlow'), true);
        await T.check('input[name=inFlow][value=hd]');
        assert.match(await T.textContent('#preview'), /가설연역/);
        await layout(T, '교사 수업 만들기');
        await T.click('#btnCreate');
        await T.waitForSelector('#viewMain:not([hidden]) #classOut:not([hidden])');
        assert.match(await T.textContent('#outTitle'), /가설연역/);
        await T.click('#btnToRun'); await T.waitForFunction(() => !document.getElementById('runPane').hidden || !document.getElementById('presentPane').hidden); if (await T.isVisible('#btnPExit')) { await T.click('#btnPExit'); await T.click('#btnRunPopGo'); } await T.waitForSelector('#runPane:not([hidden])');
        assert.match(await T.textContent('#stageNow'), /① 문제 인식.*\(1 \/ 6\)/);
        assert.match(await T.textContent('#btnStageNext'), /② 가설 설정/);
        const link = await T.getAttribute('#outLink', 'href');
        const url = link.replace(/^https?:\/\/[^/]+\//, ROOT);
        const space = /s=(c[a-z0-9]{23})/.exec(link)[1];

        const P = [];
        for (const jo of [1, 2]) {
            const S = await ctx(devices['iPhone 13'], 'S' + jo);
            await S.addInitScript(() => { try { localStorage.setItem('lab-flow', 'report'); } catch (e) { /* 무시 */ } });   // 학생이 고른 것보다 수업 방법이 먼저
            await S.goto(url);
            await S.waitForSelector('#cs-cpick:not([hidden])');
            await S.selectOption('#cs-cjo', String(jo)); await S.selectOption('#cs-cnum', '1'); await S.click('#cs-cjoin');
            await S.waitForSelector('nav.steps button[data-step="hypothesis"].cs-locked');
            assert.deepEqual(await stepKeys(S), HD, '수업 방법(가설연역)을 따름');
            assert.equal(await S.locator('.flow-pick:not([hidden])').count(), 0, '수업이면 학생은 방법을 못 바꿈');
            P.push(S);
        }
        const S1 = P[0];
        assert.equal(await selected(S1), 'problem');
        await S1.click('.step-panel[data-step="purpose"] .step-next button', { force: true });
        assert.equal(await selected(S1), 'problem', '잠긴 ② 로 가는 다음 단추도 막힘');
        await layout(S1, '학생 폰 가설연역');
        await T.click('#btnStageNext');
        await T.waitForFunction(() => /② 가설 설정.*까지 열었어요/.test(document.getElementById('stageMsg').textContent));
        // 단계를 열면 설명부터 (2026-11-23): 🎬 발표 보기로 넘어감
        await T.waitForSelector('#presentPane:not([hidden])');
        for (const S of P) await S.waitForFunction(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b && b.dataset.step === 'hypothesis'; }, null, { timeout: 15000 });
        assert.equal(await S1.isVisible('nav.steps button[data-step="design"].cs-locked'), true, '③ 은 아직 잠김');
        // 진행 보기의 '보고 있는 단계' 이름 (학생 화면은 패널 키 theory 를 보냄)
        await app.post({ action: 'heartbeat', space, 'class': (await app.post({ action: 'joinInfo', space })).classCode, jo: 1, num: 1, step: 'theory', exp: 'qdot', device: 'x1' });
        const status = await app.post({ action: 'classStatus', space });
        assert.equal(status.flow, 'hd');
        assert.equal(CC.stepName(status.exp, status.students.find(x => x.jo === 1).step, status.flow), '② 가설 설정');
        // 발표 보기도 6단계 (단계를 열어 이미 발표 보기)
        await T.waitForSelector('#presentPane:not([hidden])');
        await T.waitForFunction(() => { const d = document.getElementById('presentFrame').contentDocument; return d && d.querySelector('nav.steps button[data-step="design"].cs-locked'); }, null, { timeout: 15000 });
        assert.match(await T.textContent('#pStage'), /② 가설 설정.*\(2 \/ 6\)/);
        assert.equal(await T.evaluate(() => document.getElementById('presentFrame').contentDocument.querySelectorAll('nav.steps button[data-step]').length), 6);
        assert.equal(await T.evaluate(() => !!document.getElementById('presentFrame').contentDocument.querySelector('.flow-pick:not([hidden])')), false);

        // ---- ④ 7단계 수업·예전 수업·📱 폰 측정 화면 ----
        const r7 = await app.post({ action: 'createClass', ban: 6, nStudents: 2, groupSize: 2, exp: 'qdot', stage: 1 });
        const S7 = await ctx(devices['iPhone 13'], 'S7');
        await S7.addInitScript(() => { try { localStorage.setItem('lab-flow', 'hd'); } catch (e) { /* 무시 */ } });
        await S7.goto(ROOT + 'projects/quantum-dot.html?c=' + r7.classCode + '&s=' + r7.space);
        await S7.waitForSelector('#cs-cpick:not([hidden])');
        await S7.selectOption('#cs-cjo', '1'); await S7.selectOption('#cs-cnum', '1'); await S7.click('#cs-cjoin');
        await S7.waitForSelector('nav.steps button[data-step="theory"].cs-locked');
        assert.equal((await stepKeys(S7)).length, 7, '7단계 수업은 학생이 가설연역을 골라 두었어도 7단계');
        const old = await app.post({ action: 'createClass', ban: 7, nStudents: 2, groupSize: 2, exp: 'qdot' });
        delete app.db.docs.get('labClasses/' + old.space).stage;
        const O = await ctx(devices['iPhone 13'], 'O');
        await O.goto(ROOT + 'projects/quantum-dot.html?c=' + old.classCode + '&s=' + old.space);
        await O.waitForSelector('#cs-cpick:not([hidden])');
        await O.waitForTimeout(500);
        assert.equal((await stepKeys(O)).length, 7, '예전 수업 = 7단계'); assert.equal(await O.locator('.cs-locked').count(), 0);
        const g = app.db.docs.get('labClasses/' + space).groups[0].code;
        const PH = await ctx(devices['iPhone 13'], 'PH');
        await PH.goto(url + '&role=phone&group=' + encodeURIComponent(g) + '&jo=1&num=2');
        await PH.waitForSelector('nav.steps button[data-step="perform"]', { state: 'attached' });
        await PH.waitForTimeout(800);
        assert.equal(await selected(PH), 'perform', '📱 폰 측정 화면은 측정 단계에서 시작');
        assert.equal(await PH.locator('.cs-locked').count(), 0, '폰 측정 화면은 잠금 없음');
        assert.equal(await PH.locator('.flow-pick:not([hidden])').count(), 0);

        // 메인 화면 교과 배지
        const M = await ctx(devices['iPhone 13'], 'M');
        await M.goto(ROOT + 'index.html');
        assert.ok(await M.locator('.pick-card .subj').count() >= 8, '교과 배지');
        assert.equal(await M.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '메인 375 가로 스크롤');
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); api.close(); stat.close();
    }
});
