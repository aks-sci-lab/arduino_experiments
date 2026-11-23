// 필름통 로켓 2026-11-21 고침 3 — Playwright, 가짜 저장소, iPhone 13
//  ① 🔮 예측: 바꿀 것을 고르면 예측 칸이 바로 아래(스크롤 없이 보임), 방향을 골라야 [다음 →] 이 켜짐 (까닭은 안 써도 됨) — 1·2차시
//  ② 늦게 고른 팀: 설명 화면을 쓴 반에서 그 장 풀이가 이미 열린 뒤 처음 고르면 맞혀도 5점 + '풀이를 본 뒤 골라서 5점이에요'
//     (풀이 전에 고른 팀은 10점 그대로, 설명 화면을 안 쓴 반도 그대로)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('로켓: 예측을 골라야 다음·늦게 고른 팀 5점', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const ctx = async (opt, name) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' }); });
        await c.route(/gstatic/, r => r.abort());
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const go = (pg, id) => pg.waitForSelector('#ev-app[data-screen="' + id + '"]', { timeout: 15000 });
    const join = async (pg, c, team) => {
        await pg.goto(ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space); await go(pg, 'enter');
        await pg.fill('#ev-name', team); await pg.click('#ev-start');
        await pg.waitForFunction(() => /^(think-intro|q-gas)$/.test(document.getElementById('ev-app').getAttribute('data-screen')), null, { timeout: 15000 });   // 응답 장을 띄운 반은 q-gas
    };
    const quiz = async (pg) => { await pg.evaluate(() => window.__filmRocket.show('q-gas')); await go(pg, 'q-gas'); };
    try {
        const c = await app.post({ action: 'createClass', ban: 1, mode: 'team', nTeams: 4, exp: 'rocket', stage: 3 });
        const doc = () => app.db.docs.get('labClasses/' + c.space);
        Object.assign(doc(), { lesson: { on: true, stage: 't1', i: 0, key: 'gas', reveal: false, mode: 'phone' }, lessonOpen: [] });
        // 풀이 전에 고른 팀 A
        const A = await ctx(devices['iPhone 13'], 'A');
        await join(A, c, '별빛가족');
        await A.waitForFunction(() => { const b = document.querySelector('.cs-look-band'); return b && !b.hidden; }, null, { timeout: 15000 });
        await quiz(A);
        assert.match(await A.textContent('.ev-screen'), /처음에 맞히면 10점/);
        await A.click('.ev-choice[data-k="ok"]'); await A.waitForSelector('.ev-hold');
        // 교사가 풀이를 엶
        Object.assign(doc(), { lesson: { on: true, stage: 't1', i: 0, key: 'gas', reveal: true, mode: 'look' }, lessonOpen: ['gas'] });
        await A.waitForSelector('.ev-ok', { timeout: 15000 });
        assert.match(await A.textContent('.ev-ok'), /\+10점/);
        assert.equal(await A.locator('.ev-late').count(), 0, '풀이 전에 고른 팀은 한 줄 없음');
        assert.match(await A.textContent('#ev-score'), /⭐ 10점/);
        // 풀이가 열린 뒤 처음 고른 팀 B → 맞혀도 5점
        const B = await ctx(devices['iPhone 13'], 'B');
        await join(B, c, '달빛가족');
        await B.waitForFunction(() => { const b = document.querySelector('.cs-look-band'); return b && !b.hidden; }, null, { timeout: 15000 });
        await quiz(B);
        assert.match(await B.textContent('.ev-late'), /풀이가 이미 나왔어요/);
        await B.click('.ev-choice[data-k="ok"]'); await B.waitForSelector('.ev-ok');
        assert.match(await B.textContent('.ev-ok'), /\+5점/);
        assert.equal((await B.textContent('.ev-late')).trim(), '풀이를 본 뒤 골라서 5점이에요');
        assert.match(await B.textContent('#ev-score'), /⭐ 5점/);
        assert.equal((await B.evaluate(() => window.__filmRocket.state().quiz.gas)).late, true);

        // 설명 화면을 안 쓴 반: 지금 그대로 10점
        const c2 = await app.post({ action: 'createClass', ban: 2, mode: 'team', nTeams: 4, exp: 'rocket', stage: 2 });
        const C = await ctx(devices['iPhone 13'], 'C');
        await join(C, c2, '해님가족');
        await quiz(C);
        await C.click('.ev-choice[data-k="ok"]'); await C.waitForSelector('.ev-ok');
        assert.match(await C.textContent('.ev-ok'), /\+10점/);
        assert.equal(await C.locator('.ev-late').count(), 0);
        assert.equal((await C.evaluate(() => window.__filmRocket.state().quiz.gas)).late, undefined);

        // ① 🔮 예측: 1·2차시 — 고르기 전 [다음 →] 꺼짐, 예측 칸은 스크롤 없이 보임
        // (1차시를 하는 중에는 2차시를 아직 안 엶 — 띠 없이 보통 화면. 2차시는 그다음에 엶)
        for (const [scr, k, nextScr] of [['t1-var', 'temp', 'q-control'], ['t2-var', 'water', 't2-cond']]) {
            if (scr === 't2-var') { app.db.docs.get('labClasses/' + c2.space).stage = 3; await C.waitForFunction(() => !/🔒/.test([...document.querySelectorAll('button')].filter(b => /2차시/.test(b.textContent))[0].textContent), null, { timeout: 15000 }); }
            await C.evaluate(s => { window.scrollTo(0, 0); window.__filmRocket.show(s); }, scr); await go(C, scr);
            assert.equal(await C.isDisabled('.ev-screen .ev-next[data-go]'), true, scr + ': 바꿀 것 고르기 전 꺼짐');
            await C.click('.ev-choice[data-k="' + k + '"]');
            await C.waitForSelector('[data-guess]');
            await C.evaluate(() => window.scrollTo(0, 0));
            assert.equal(await C.isDisabled('.ev-screen .ev-next[data-go]'), true, scr + ': 예측 고르기 전 꺼짐');
            assert.match(await C.textContent('.ev-need-guess'), /예측을 골라야/);
            const box = await C.evaluate(() => { const r = document.querySelector('[data-guess] [data-dir="same"]').getBoundingClientRect(); return { bottom: r.bottom, vh: window.innerHeight }; });
            assert.ok(box.bottom <= box.vh, scr + ': 예측 고르기가 첫 화면에 보임 ' + JSON.stringify(box));
            await C.click('[data-guess] [data-dir="up"]');
            assert.equal(await C.isDisabled('.ev-screen .ev-next[data-go]'), false, scr + ': 고르면 켜짐 (까닭은 안 써도)');
            assert.equal(await C.locator('.ev-need-guess').count(), 0);
            await C.click('.ev-screen .ev-next[data-go]'); await go(C, nextScr);
        }
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); api.close(); stat.close();
    }
});
