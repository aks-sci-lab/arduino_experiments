// 필름통 로켓(행사형) 단계 열기 — 2026-11-20 선생님 결정 "기다리는 팀만 옮기기", "기다리는 팀 수 표시" (가상 수업 기록 상 1·2, 중 5·7)
//  ① 하는 중인 팀(⏱ 초시계가 도는 중)은 다음 단계가 열려도 화면이 안 바뀌고 측정이 저장됨, 위에 '열었어요 · 끝내면 넘어가요' 띠
//  ② 앞 단계를 끝내고 잠김 화면에서 기다리던 팀만 저절로 이동  ③ 하는 중인 팀이 그 단계를 마치면 잠김 화면 없이 바로 다음 단계
//  ④ ◀ 되돌리기 뒤 띠 없음, 잠김 화면 '돌아가기' = 마지막으로 하던 화면, 새로고침 뒤에도 같음, 다시 열면 하던 곳으로
//  ⑤ 교사 화면 '⏳ 기다리는 팀 N / 들어온 팀 M'·'모든 팀이 기다려요'·결과판 '✓ 기다림'·🔌 끊김
//  (7단계 실험의 단계 열기·저절로 이동은 tests/class-stage-ui.test.cjs 가 그대로 확인)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('로켓 단계 열기: 기다리던 팀만 이동, 하는 중인 팀은 띠만, 되돌리기, 교사 화면 기다리는 팀 수·🔌', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const ctx = async (opt, name, teacher) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' }); });
        await c.route(/gstatic/, r => r.abort());
        if (teacher) await c.addInitScript(() => { localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); });
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const go = (pg, id) => pg.waitForSelector('#ev-app[data-screen="' + id + '"]', { timeout: 15000 });
    const next = pg => pg.locator('.ev-screen .ev-next:not([disabled])[data-go]').last().click();
    const screen = pg => pg.getAttribute('#ev-app', 'data-screen');
    const notice = pg => pg.evaluate(() => { const n = document.getElementById('ev-notice'); return n && !n.hidden ? n.textContent : ''; });
    const thinkAll = async pg => {   // 생각 열기 세 문제 → 마지막 '다음'
        await next(pg); await go(pg, 'think-force'); await pg.click('.ev-choice[data-k="have"]');
        await next(pg); await go(pg, 'think-accel'); await pg.click('.ev-choice[data-k="fast"]');
        await next(pg); await go(pg, 'think-pressure'); await pg.click('.ev-choice[data-k="ok"]');
        await next(pg);
    };
    try {
        const c = await app.post({ action: 'createClass', ban: 1, mode: 'team', nTeams: 4, exp: 'rocket', stage: 1 });
        assert.equal(c.ok, true, c.error);
        const famUrl = ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space;
        const T = await ctx({ viewport: { width: 1920, height: 1080 } }, 'T', true);
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=run');
        // 단계를 열면 🎬 발표 보기로 넘어가 그 단계 설명부터 (2026-11-23) → 이 시험은 진행 화면을 보므로 '📋 진행 화면' 으로 돌아옴
        const toRun = async () => {
            await T.waitForSelector('#presentPane:not([hidden])'); await T.waitForSelector('#pSlides .ls-slide'); await T.waitForTimeout(600);
            await T.click('#btnPExit'); await T.waitForSelector('#runPane:not([hidden])');
            const d = () => app.db.docs.get('labClasses/' + c.space);
            for (let k = 0; k < 50 && d().lesson && d().lesson.on; k++) await T.waitForTimeout(100);
            delete d().lesson; d().lessonOpen = [];
        };   // 이 시험은 설명 화면을 안 쓰는 반의 단계 열기 (폰 혼자 흐름)
        await T.waitForSelector('#stageCard:not([hidden])');
        const join = async (name, team) => {
            const P = await ctx(devices['iPhone 13'], name);
            await P.goto(famUrl); await go(P, 'enter');
            await P.fill('#ev-name', team); await P.click('#ev-start'); await go(P, 'think-intro');
            return P;
        };
        const A = await join('A', '별빛가족'), B = await join('B', '달님 탐험대');
        // A: 생각 열기를 끝냄 → '1차시는 잠겨 있어요' (기다림), B: 하는 중
        await thinkAll(A); await go(A, 'locked');
        assert.match(await A.textContent('.ev-screen'), /‘1차시’ 은 아직 잠겨 있어요/);
        await next(B); await go(B, 'think-force');
        // ⑤ 교사: 기다리는 팀 1 / 2, 결과판 '생각 열기 ✓ 기다림'
        await T.waitForFunction(() => /기다리는 팀\s*1\s*\/\s*들어온 팀\s*2/.test(document.getElementById('stageWait').textContent), null, { timeout: 20000 });
        assert.match(await T.textContent('#board'), /별빛가족[\s\S]*생각 열기 ✓ 기다림/);
        assert.doesNotMatch(await T.textContent('#board'), /달님 탐험대[\s\S]*✓ 기다림/);
        // ② 끝낸 팀이 잠김 화면을 떠나 앞 화면을 다시 봐도 '끝냄'으로 셈 ('✓ 끝냄 · 더 재는 중')
        await A.locator('.ev-screen [data-go]').last().click(); await go(A, 'think-pressure');
        await T.waitForFunction(() => /더 재는 중/.test(document.getElementById('board').textContent), null, { timeout: 20000 });
        assert.match(await T.textContent('#stageWait'), /기다리는 팀\s*1\s*\/\s*들어온 팀\s*2/, '결과를 다시 보는 팀도 기다림으로');
        assert.match(await T.textContent('#board'), /별빛가족[\s\S]*생각 열기 ✓ 끝냄 · 더 재는 중/);
        await next(A); await go(A, 'locked');
        // B 도 끝내면 '모든 팀이 기다려요'
        await B.click('.ev-choice[data-k="have"]'); await next(B); await go(B, 'think-accel'); await B.click('.ev-choice[data-k="fast"]');
        await next(B); await go(B, 'think-pressure'); await B.click('.ev-choice[data-k="ok"]'); await next(B); await go(B, 'locked');
        await T.waitForFunction(() => /모든 팀이 기다려요/.test(document.getElementById('stageWait').textContent), null, { timeout: 20000 });
        assert.equal(await T.evaluate(() => document.getElementById('stageWait').classList.contains('all')), true);
        // 결과판 크게 보기에도 같은 줄 (4K 프로젝터: 글자가 결과판과 함께 커짐)
        await T.click('#btnBoardBig');
        assert.match(await T.textContent('#boardBigWait'), /모든 팀이 기다려요/);
        assert.match(await T.textContent('#boardBigBody'), /✓ 기다림/);
        const fs1 = await T.evaluate(() => parseFloat(getComputedStyle(document.getElementById('boardBigWait')).fontSize));
        assert.ok(fs1 >= 30, '크게 보기 기다림 줄 글자 ' + fs1 + 'px (1920 폭)');
        await T.click('#btnBoardClose');

        // ② 1차시 열기 → 기다리던 두 팀 모두 1차시 첫 화면
        await T.click('#btnStageNext'); await toRun();
        await go(A, 't1-intro'); await go(B, 't1-intro');
        assert.equal(await notice(A), '', '이미 넘어간 팀은 띠 없음');
        await T.waitForFunction(() => /기다리는 팀\s*0\s*\/\s*들어온 팀\s*2/.test(document.getElementById('stageWait').textContent), null, { timeout: 20000 });
        // A: 1차시 측정 화면까지 → ⏱ 초시계 시작(도는 중)
        await next(A); await go(A, 'q-gas'); await A.click('.ev-choice[data-k="ok"]'); await A.waitForSelector('.ev-ok'); await next(A);
        await go(A, 't1-safe');
        for (const k of ['goggle', 'face', 'away', 'wait']) await A.check('[data-safe="' + k + '"]');
        await next(A); await go(A, 'q-pressure'); await A.click('.ev-choice[data-k="ok"]'); await A.waitForSelector('.ev-ok'); await next(A);
        await go(A, 't1-var'); await A.click('.ev-choice[data-k="water"]'); await A.click('[data-guess] [data-dir="up"]'); await next(A);
        await go(A, 'q-control'); await A.click('.ev-choice[data-k="ok"]'); await A.waitForSelector('.ev-ok'); await next(A);
        await go(A, 't1-cond'); await next(A); await go(A, 't1-measure');
        await A.click('#ev-m-sw'); await A.click('#ev-sw1');

        // ① 2차시 열기 → A(초시계 도는 중)·B(1차시 첫 화면) 그대로, 위에 띠
        await T.click('#btnStageNext'); await toRun();
        await A.waitForFunction(() => { const n = document.getElementById('ev-notice'); return n && !n.hidden; }, null, { timeout: 15000 });
        assert.match(await notice(A), /선생님이 ‘2차시’ 단계를 열었어요/);
        // ① 측정 중에는 띠 단추를 누를 수 없음
        assert.equal(await A.isDisabled('#ev-notice-go'), true, '측정 중에는 못 누름');
        assert.match(await A.textContent('#ev-notice-go'), /이 측정을 끝내고 가요/);
        await B.waitForFunction(() => { const n = document.getElementById('ev-notice'); return n && !n.hidden; }, null, { timeout: 15000 });
        assert.equal(await B.isDisabled('#ev-notice-go'), false);
        assert.match(await B.textContent('#ev-notice-go'), /‘2차시’ 로 가기/);
        const gb = await B.locator('#ev-notice-go').boundingBox();
        assert.ok(gb.height >= 55.5, '띠 단추 56px: ' + gb.height);
        // ③ 교사 화면 '앞 단계에 남은 팀 2' (둘 다 1차시), 결과판 '↩ … (앞 단계)'
        await T.waitForFunction(() => /앞 단계에 남은 팀\s*2/.test(document.getElementById('stageWait').textContent), null, { timeout: 20000 });
        await T.waitForFunction(() => /↩ 1차시[^↩]*\(앞 단계\)/.test(document.getElementById('board').textContent), null, { timeout: 20000 });
        assert.equal(await screen(A), 't1-measure', '측정 중인 팀은 옮기지 않음');
        assert.equal(await screen(B), 't1-intro', '하는 중인 팀은 옮기지 않음');
        await A.waitForTimeout(400); await A.click('#ev-sw2'); await A.click('#ev-sw3');
        await go(A, 't1-result');
        assert.equal((await A.evaluate(() => window.__filmRocket.state())).t1.trials.length, 1, '측정이 저장됨');
        // ① 측정이 끝나면 띠 단추로 스스로 2차시 (잠김 화면 없이)
        await A.waitForFunction(() => !document.getElementById('ev-notice-go').disabled, null, { timeout: 5000 });
        await A.click('#ev-notice-go');
        await go(A, 't2-intro');
        await T.waitForFunction(() => /앞 단계에 남은 팀\s*1/.test(document.getElementById('stageWait').textContent), null, { timeout: 20000 });
        assert.match(await T.textContent('#stageWait'), /달님 탐험대/);
        assert.equal(await notice(A), '', '넘어가면 띠가 사라짐');
        await next(A); await go(A, 'q-action');

        // ④ ◀ 하나 되돌리기 → A 는 잠김 화면, B 의 띠는 사라짐
        await T.click('#btnStagePrev');
        await go(A, 'locked');
        assert.match(await A.textContent('.ev-screen'), /‘2차시’ 은 아직 잠겨 있어요/);
        assert.equal(await A.isVisible('#ev-flash'), false, '열었어요 알림이 남지 않음');
        assert.equal(await notice(A), '');
        await B.waitForFunction(() => document.getElementById('ev-notice').hidden, null, { timeout: 15000 });
        // 새로고침해도 잠김 화면, '돌아가기' 는 마지막으로 하던 1차시 화면
        await A.reload(); await go(A, 'locked');
        const backBtn = A.locator('.ev-screen [data-go]').last();
        assert.equal(await backBtn.getAttribute('data-go'), 't1-result', '돌아가기 = 마지막으로 하던 화면');
        assert.match(await backBtn.textContent(), /1차시/);
        // 다시 2차시를 열면 하던 곳(q-action)으로
        await T.click('#btnStageNext'); await toRun();
        await go(A, 'q-action');

        // 한 단계 넘게 뒤처진 팀: '모두 열기' 뒤에도 B 는 1차시 그대로 이어 감, 띠는 '정리 단계까지'
        await T.click('#btnStageAll');
        await B.waitForFunction(() => /‘정리’ 단계까지 열었어요/.test(document.getElementById('ev-notice').textContent), null, { timeout: 15000 });
        assert.equal(await screen(B), 't1-intro', '건너뛰지 않음');
        // ⑤ 🔌 끊김: 팀 폰은 1분마다 신호 → 2분 넘게 없으면 🔌 (B 의 마지막 신호를 2분 30초 전으로)
        assert.equal(await B.evaluate(() => window.__filmRocket.share() && true), true);
        for (const [k, d] of app.db.docs) if (k.startsWith('labClasses/' + c.space + '/progress/2-')) d.lastSeen = new Date(Date.now() - 150 * 1000);
        await T.click('#btnRefresh');
        await T.waitForFunction(() => /🔌 2분 전/.test(document.getElementById('board').textContent), null, { timeout: 15000 });
        assert.match(await T.textContent('#stageWait'), /🔌 연결 끊김 1팀/);
        assert.doesNotMatch(await T.textContent('#board'), /별빛가족 🔌/);

        // ⑥ 👀 눈으로 고르기 화면: 고르기 전에는 띠 단추 꺼짐, 고르면 켜짐·그 발사가 저장됨 (A 는 2차시, 정리가 열림)
        await A.evaluate(() => window.__filmRocket.show('t2-hand'));
        await go(A, 't2-hand');
        await A.waitForFunction(() => { const n = document.getElementById('ev-notice'); return n && !n.hidden; }, null, { timeout: 15000 });
        assert.equal(await A.isDisabled('#ev-notice-go'), true, '고르기 전에는 못 누름');
        assert.match(await A.textContent('#ev-notice-go'), /이 측정을 끝내고 가요/);
        assert.equal(await A.locator('#ev-notice-jump').count(), 0, '한 단계 차이면 바로 가기 없음');
        await A.click('.ev-choice[data-k="same"]');
        await go(A, 't2-result');
        assert.equal((await A.evaluate(() => window.__filmRocket.state())).t2.trials.length, 1, '눈으로 고른 발사가 저장됨');
        assert.equal(await A.isDisabled('#ev-notice-go'), false, '고른 뒤에는 누를 수 있음');
        assert.match(await A.textContent('#ev-notice-go'), /‘정리’ 로 가기/);

        // ⑦ 1차시에 남은 B: '2차시로 가기' 와 함께 '정리로 바로 가기' → 한 번에 정리, 2차시는 하지 않음으로 남음
        assert.match(await B.textContent('#ev-notice-go'), /‘2차시’ 로 가기/);
        assert.match(await B.textContent('#ev-notice-jump'), /‘2차시’ 건너뛰고 ‘정리’ 로 바로 가기/);
        const jb = await B.locator('#ev-notice-jump').boundingBox();
        assert.ok(jb.height >= 43.5, '바로 가기 44px: ' + jb.height);
        await B.click('#ev-notice-jump');
        await go(B, 'end-intro');
        assert.equal(await notice(B), '', '정리에 오면 띠가 사라짐');
        const bs = await B.evaluate(() => window.__filmRocket.state());
        assert.ok(!(bs.done && bs.done.t2), '건너뛴 2차시는 끝내지 않은 것으로');
        assert.equal(bs.t2.trials.length, 0);
        await T.click('#btnRefresh');
        await T.waitForFunction(() => /달님 탐험대/.test(document.getElementById('board').textContent) && !/달님 탐험대[^\n]*\(앞 단계\)/.test(document.getElementById('board').innerText), null, { timeout: 20000 });
        // 건너뛴 2차시는 위 탭으로 나중에 할 수 있음
        await B.click('#ev-stages [data-stage="t2"]');
        await go(B, 't2-intro');
        await B.click('#ev-stages [data-stage="end"]');
        await go(B, 'end-intro');

        // 375px (iPhone 13) 가로 스크롤 없음·단추 56px
        for (const P of [A, B]) {
            assert.equal(await P.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '가로 스크롤');
            const small = await P.evaluate(() => [...document.querySelectorAll('.ev-app button')].filter(e => e.offsetParent && !e.classList.contains('ev-link') && !e.classList.contains('ev-chip') && e.getBoundingClientRect().height < 55.5).map(e => e.textContent.trim().slice(0, 20)));
            assert.deepEqual(small, [], '작은 단추');
        }
        assert.equal(await T.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '교사 1920 가로 스크롤');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
