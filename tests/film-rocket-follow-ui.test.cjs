// 필름통 로켓 '📱 폰은 응답만' (2026-11-23 선생님 "학생용 화면은 응답을 수집하기 위함이지 정보를 제공하기 위함이 아니야",
//  "최대한 화면을 보고 수업에 참여하고 응답할 때만 스마트폰") — Playwright, 가짜 저장소, iPhone 13 · Galaxy Tab S4 · 교사 노트북
//  ① 선생님이 설명 장을 띄우면 폰은 '👀 앞 화면을 봐요' + 팀 이름만 (단계 탭·다음 단추 흐름 없음)
//  ② 응답 장(mode 'phone' + key) → 그 답 칸만 → 답하면 '✅ 보냈어요' → 다음 장이면 다시 대기, 프로젝터에 팀 답이 모임
//  ③ 새로고침해도 지금 응답 장으로, 퀴즈는 풀이를 열면 ⭕·점수
//  ④ 측정 장(do-t1) → 측정 화면, 측정 중(⏱ 도는 중)에는 장이 바뀌어도 그대로 → 끝나면 대기
//  ⑤ 선생님이 설명을 닫으면(📱 학생) 하던 곳으로, 수업 없이 연 화면은 지금처럼 폰 혼자 끝까지
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const SHOTS = process.env.PRESENT_SHOTS || '';

test('로켓 폰은 응답만: 대기 → 응답 장 → 보냄 → 대기, 새로고침, 측정 중 유지, 수업 없이 연 화면은 그대로', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const ctx = async (opt, name, teacher) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' }); });
        await c.route(/gstatic/, r => r.abort());
        await c.addInitScript(t => { if (t) localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); }, !!teacher);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const go = (pg, id, t) => pg.waitForSelector('#ev-app[data-screen="' + id + '"]', { timeout: t || 15000 });
    const scr = pg => pg.getAttribute('#ev-app', 'data-screen');
    const navShown = pg => pg.locator('.ev-screen .ev-nav').evaluateAll(els => els.filter(e => e.offsetParent).length);
    try {
        const c = await app.post({ action: 'createClass', ban: 3, mode: 'team', nTeams: 4, exp: 'rocket', stage: 1 });
        const famUrl = ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space;
        const A = await ctx(devices['iPhone 13'], 'A'), B = await ctx(devices['Galaxy Tab S4'], 'B');
        for (const [P, name] of [[A, '별빛가족'], [B, '달님가족']]) {
            await P.goto(famUrl); await go(P, 'enter');
            await P.fill('#ev-name', name); await P.click('#ev-start'); await go(P, 'think-intro');
        }
        // 교사: 발표 보기 → 생각 열기 '왜' 장 → 두 폰 모두 👀 대기 + 팀 이름
        const T = await ctx({ viewport: { width: 1920, height: 1080 } }, 'T', true);
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
        await T.waitForSelector('#pSlides .ls-slide');
        for (const P of [A, B]) { await go(P, 'wait'); }
        assert.match(await A.textContent('.ev-screen'), /앞 화면을 봐요[\s\S]*별빛가족/);
        assert.match(await B.textContent('.ev-screen'), /달님가족/);
        assert.equal(await A.isVisible('#ev-stages'), false, '단계 탭 숨김');
        assert.equal(await A.locator('.ev-screen [data-lesson-answer], .ev-screen .ev-def').count(), 0, '설명·정의 없음');
        assert.equal(await A.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px');
        if (SHOTS) await A.screenshot({ path: path.join(SHOTS, 'phone-1-wait.png') });
        // 응답 장 '힘' → 답 칸만 (다음 단추 없음)
        await T.keyboard.press('ArrowRight');
        for (const P of [A, B]) await go(P, 'think-force');
        assert.equal(await navShown(A), 0, '응답 장에서는 다음 단추 흐름 없음');
        assert.equal(await A.locator('.ev-screen .ev-def').count(), 0, '답하기 전 정의 없음');
        if (SHOTS) await A.screenshot({ path: path.join(SHOTS, 'phone-2-answer.png') });
        // 새로고침해도 지금 응답 장으로
        await A.reload(); await go(A, 'think-force', 20000);
        await A.click('.ev-choice[data-k="have"]'); await go(A, 'sent');
        assert.match(await A.textContent('.ev-screen'), /보냈어요[\s\S]*앞 화면을 봐요/);
        await B.click('.ev-choice[data-k="ok"]'); await go(B, 'sent');
        assert.deepEqual([(await A.evaluate(() => window.__filmRocket.state().think.first.force)), (await B.evaluate(() => window.__filmRocket.state().think.first.force))], ['have', 'ok'], '처음 생각은 그대로 저장');
        // 프로젝터에 두 팀 답이 모임
        await T.waitForFunction(() => /답한 팀 2 \/ 2/.test((document.querySelector('#pSlides .ls-answers') || {}).textContent || ''), null, { timeout: 25000 });
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'projector-answers.png') });
        // 풀이 → 다음 장(가속도, 응답 장) → 다시 답 칸
        await T.keyboard.press('ArrowRight'); await T.keyboard.press('ArrowRight');
        for (const P of [A, B]) await go(P, 'think-accel');

        // 1차시 열기 → 첫 장 '기체'(퀴즈 응답 장) → 폰은 q-gas, 고르면 '골랐어요 ✓', 풀이를 열면 ⭕ +10점
        await T.click('#btnPOpen'); await T.click('#btnPAskYes');
        await T.waitForFunction(() => /뚜껑은 왜/.test((document.querySelector('#pSlides .ls-title') || {}).textContent || ''), null, { timeout: 15000 });
        await go(A, 'q-gas'); await go(B, 'q-gas');
        await A.click('.ev-choice[data-k="ok"]'); await A.waitForSelector('.ev-hold');
        await T.keyboard.press('ArrowRight');   // 풀이
        await A.waitForSelector('.ev-ok', { timeout: 15000 });
        assert.match(await A.textContent('.ev-ok'), /\+10점/);
        // 측정 장(do-t1)까지 넘기기 → 폰은 측정 화면(안전 확인부터)
        for (let k = 0; k < 12 && !/이제 폰으로 재요/.test(await T.textContent('#pSlides .ls-title')); k++) await T.keyboard.press('ArrowRight');
        assert.match(await T.textContent('#pSlides .ls-title'), /이제 폰으로 재요/);
        await go(A, 't1-safe');
        await go(B, 't1-safe');
        assert.ok(await navShown(A) > 0, '측정 장에서는 측정 흐름 단추가 보임');
        // A: 조건 → 예측 → ⏱ 초시계 시작 (도는 중)
        await A.evaluate(() => { const s = window.__filmRocket.state(); s.t1.safe = { goggle: true, face: true, away: true, wait: true }; s.t1.changed = 'water'; s.t1.guess = { dir: 'up' }; window.__filmRocket.show('t1-cond'); });
        await go(A, 't1-cond');
        await A.locator('.ev-screen .ev-next:not([disabled])[data-go]').last().click(); await go(A, 't1-measure');
        await A.click('#ev-m-sw'); await A.click('#ev-sw1');
        if (SHOTS) await A.screenshot({ path: path.join(SHOTS, 'phone-3-measure.png') });
        // 교사가 다음 장(설명) → B 는 대기, A 는 재는 중이라 그대로
        await T.keyboard.press('ArrowRight');
        await go(B, 'wait');
        await A.waitForTimeout(3500);
        assert.equal(await scr(A), 't1-measure', '측정 중에는 장이 바뀌어도 그대로');
        // 측정을 마치면 → 대기 (기록은 저장)
        await A.waitForTimeout(300); await A.click('#ev-sw2'); await A.click('#ev-sw3');
        await go(A, 'wait');
        assert.equal(await A.evaluate(() => window.__filmRocket.state().t1.trials.length), 1, '잰 값은 저장');

        // 선생님이 설명을 닫음(📱 학생) → 하던 곳으로, 다시 혼자 흐름 (단계 탭 보임)
        await T.click('#btnPMode');
        await A.waitForFunction(() => !document.documentElement.classList.contains('ev-following'), null, { timeout: 15000 });
        assert.notEqual(await scr(A), 'wait');
        assert.equal(await A.isVisible('#ev-stages'), true);

        // 수업 없이 연 화면: 폰 혼자 끝까지 (대기 없음)
        const C = await ctx(devices['iPhone 13'], 'C');
        await C.goto(ROOT + 'projects/film-rocket.html'); await go(C, 'enter');
        await C.fill('#ev-name', '집에서'); await C.click('#ev-start'); await go(C, 'think-intro');
        await C.locator('.ev-screen .ev-next:not([disabled])[data-go]').last().click(); await go(C, 'think-force');
        await C.click('.ev-choice[data-k="ok"]');
        await C.waitForTimeout(500);
        assert.equal(await scr(C), 'think-force', '보냈어요 화면 없음');
        assert.ok(await navShown(C) > 0, '다음 단추 그대로');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
