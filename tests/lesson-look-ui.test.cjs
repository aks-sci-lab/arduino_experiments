// 👀 앞을 봐요 + 답 가리기 (2026-11-21 선생님 결정) — Playwright, 가짜 저장소
//  교사 🎬 발표 보기에서 설명 장을 띄움 → 가족 폰(iPhone 13)에 '👀 앞 화면을 봐요' 띠, 📘 정의는 '🔒 선생님 설명 뒤에 열려요'
//  → 그 장의 풀이를 열면 폰에도 정의가 보임 → 📱 학생 화면으로 넘기면 띠가 내려감, 발표 화면 띠에 팀 상태
//  설명 화면을 쓰지 않은 반은 그대로 다 보임 · 한 가지 값으로만 재면 그래프·도전 대신 '하나만 바꿔 한 번 더' (56px, 375px)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('설명 화면 ↔ 학생 폰: 👀 띠·답 가리기·풀이 열기, 설명 안 쓴 반은 그대로, 값 안 바꾸면 도전 막힘', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
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
        await c.addInitScript(t => { if (t) localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); }, !!teacher);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const go = (pg, id) => pg.waitForSelector('#ev-app[data-screen="' + id + '"]', { timeout: 15000 });
    const next = pg => pg.locator('.ev-screen .ev-next:not([disabled])[data-go]').last().click();
    const hidden = pg => pg.evaluate(() => { const e = document.querySelector('[data-lesson-answer]'); return e ? e.classList.contains('cs-ans-hide') : null; });
    const band = pg => pg.evaluate(() => { const b = document.querySelector('.cs-look-band'); return !!(b && !b.hidden && b.getClientRects().length); });
    const slide = pg => pg.evaluate(() => { const s = document.querySelector('#presentPane.ls-on #pSlides .ls-slide'); return s ? { title: s.querySelector('.ls-title').textContent, rev: s.dataset.revealed } : null; });
    try {
        const c = await app.post({ action: 'createClass', ban: 1, mode: 'team', nTeams: 4, exp: 'rocket', stage: 1 });
        const famUrl = ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space;
        const T = await ctx({ viewport: { width: 1920, height: 1080 } }, 'T', true);
        const A = await ctx(devices['iPhone 13'], 'A');
        await A.goto(famUrl); await go(A, 'enter');
        await A.fill('#ev-name', '별빛가족'); await A.click('#ev-start'); await go(A, 'think-intro');
        assert.equal(await band(A), false, '설명 전에는 띠 없음');
        // 교사: 발표 보기 → 생각 열기 첫 설명 장 → 폰에 👀 띠
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
        await T.waitForFunction(() => document.querySelector('#presentPane.ls-on .ls-slide'), null, { timeout: 15000 });
        await A.waitForFunction(() => { const b = document.querySelector('.cs-look-band'); return b && !b.hidden; }, null, { timeout: 15000 });
        assert.match(await A.textContent('.cs-look-band'), /앞 화면을 봐요/);
        assert.equal(await A.evaluate(() => document.documentElement.classList.contains('cs-look')), true);
        assert.equal(app.db.docs.get('labClasses/' + c.space).lesson.on, true);
        // 발표 띠에 팀 상태 (들어온 팀)
        await T.waitForFunction(() => /👨‍👩‍👧 1팀/.test(document.getElementById('pJoined').textContent), null, { timeout: 15000 });
        // 📱 폰은 응답만 (2026-11-23): 설명 장('왜')을 띄우면 폰은 👀 대기 + 팀 이름
        await go(A, 'wait');
        assert.match(await A.textContent('.ev-screen'), /앞 화면을 봐요[\s\S]*별빛가족/);
        assert.equal(await A.isVisible('#ev-stages'), false, '단계 탭도 숨김');
        // 교사: 힘 장(응답 장, mode 'phone') → 폰은 저절로 그 답 칸, 띠 '✍️ 내 화면에서 해요', 다음 단추 흐름 없음
        await T.keyboard.press('ArrowRight');
        assert.match((await slide(T)).title, /힘/);
        await go(A, 'think-force');
        await A.waitForFunction(() => /내 화면에서 해요 — 다 하면 앞 화면을 봐요/.test((document.querySelector('.cs-look-band') || {}).textContent || ''), null, { timeout: 15000 });
        assert.equal(app.db.docs.get('labClasses/' + c.space).lesson.mode, 'phone');
        assert.equal(await A.locator('.ev-screen .ev-nav').evaluateAll(els => els.filter(e => e.offsetParent).length), 0, '응답 장에서는 다음 단추 없음');
        // 답하면 '✅ 보냈어요 · 앞 화면을 봐요'
        await A.click('.ev-choice[data-k="have"]');
        await go(A, 'sent');
        assert.match(await A.textContent('.ev-screen'), /보냈어요[\s\S]*앞 화면을 봐요/);
        // 풀이 → 띠 '👀', 폰은 그대로 ✅
        await T.keyboard.press('ArrowRight');
        assert.equal((await slide(T)).rev, '1');
        await A.waitForFunction(() => /앞 화면을 봐요/.test((document.querySelector('.cs-look-band') || {}).textContent || ''), null, { timeout: 15000 });
        assert.deepEqual(app.db.docs.get('labClasses/' + c.space).lessonOpen, ['force']);
        assert.equal(await A.getAttribute('#ev-app', 'data-screen'), 'sent');
        // 발표 보기를 떠나 진행 화면으로 가면(설명을 닫음) 폰의 띠가 내려가고 하던 곳으로 → 혼자 흐름에서는 연 풀이만 보임
        await T.click('#btnPExit'); await T.click('#btnRunPopGo'); await T.waitForSelector('#stageCard:not([hidden])');
        await A.waitForFunction(() => { const b = document.querySelector('.cs-look-band'); return b && b.hidden; }, null, { timeout: 15000 });
        assert.equal(await A.evaluate(() => document.documentElement.classList.contains('cs-look')), false);
        await go(A, 'think-intro');
        await next(A); await go(A, 'think-force');
        await A.waitForFunction(() => !document.querySelector('[data-lesson-answer="force"]').classList.contains('cs-ans-hide'), null, { timeout: 15000 });
        assert.match(await A.textContent('[data-lesson-answer="force"]'), /운동 상태를 바꾸는 원인/);
        assert.match(await A.textContent('[data-lesson-answer="force"]'), /쉬운 말 · 원인 = 왜 그렇게 됐는지의 까닭/, '초3 쉬운 말');
        // 아직 안 연 '가속도' 는 가림
        await next(A); await go(A, 'think-accel'); await A.click('.ev-choice[data-k="fast"]');
        await A.waitForFunction(() => document.querySelector('[data-lesson-answer="accel"]').classList.contains('cs-ans-hide'), null, { timeout: 10000 });
        const box = await A.locator('[data-lesson-answer="accel"]').boundingBox();
        assert.ok(box && box.height >= 40, '가린 자리에 🔒 안내');
        assert.equal(await A.evaluate(() => getComputedStyle(document.querySelector('[data-lesson-answer] .ev-def p')).visibility), 'hidden', '정의 글은 안 보임');
        assert.equal(await A.isDisabled('.ev-screen .ev-next'), false, '답을 가려도 다음으로는 갈 수 있음');
        // 진행 화면 '🔓 모든 풀이 열기'
        await T.waitForSelector('#lessonTeach:not([hidden])');
        await T.evaluate(() => { document.getElementById('lessonTeach').open = true; });
        await T.click('#btnLessonOpenAll');
        await T.waitForFunction(() => /풀이 \d+개를 열었어요/.test(document.getElementById('lessonMsg').textContent));
        await A.waitForFunction(() => !document.querySelector('[data-lesson-answer="accel"]').classList.contains('cs-ans-hide'), null, { timeout: 15000 });
        assert.equal(await band(A), false, '발표 보기를 닫으면 띠 없음');

        // ---------- 설명 화면을 안 쓴 반: 처음부터 다 보임 ----------
        const c2 = await app.post({ action: 'createClass', ban: 2, mode: 'team', nTeams: 4, exp: 'rocket', stage: 99 });
        const B = await ctx(devices['iPhone 13'], 'B');
        await B.goto(ROOT + 'projects/film-rocket.html?c=' + c2.classCode + '&s=' + c2.space); await go(B, 'enter');
        await B.fill('#ev-name', '달님'); await B.click('#ev-start'); await go(B, 'think-intro');
        await next(B); await go(B, 'think-force'); await B.click('.ev-choice[data-k="ok"]');
        await B.waitForSelector('[data-lesson-answer="force"]', { state: 'attached' }); await B.waitForTimeout(3500);
        assert.equal(await hidden(B), false, '설명 화면을 안 쓴 반은 가리지 않음');
        assert.equal(await band(B), false);

        // ---------- 한 가지 바꿔 한 번 더: 한 값으로만 재면 그래프·도전 대신 안내 ----------
        await B.evaluate(() => { const s = window.__filmRocket.state(); s.t1.changed = 'water'; s.t1.trials = [{ value: 10, y: 9 }, { value: 10, y: 10 }]; window.__filmRocket.show('t1-graph'); });
        await go(B, 't1-more');
        assert.match(await B.textContent('.ev-screen'), /하나만 바꿔 한 번 더[\s\S]*물의 양[\s\S]*10 mL[\s\S]*2번/);
        assert.match(await B.textContent('.ev-screen'), /무엇 때문에 열리는 시간이 달라지는지/, '막힌 까닭 한 줄');
        await B.evaluate(() => window.__filmRocket.show('t1-challenge')); await go(B, 't1-more');
        const small = await B.evaluate(() => [...document.querySelectorAll('.ev-screen button')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 55.5).map(e => e.textContent.trim()));
        assert.deepEqual(small, [], '행사형 큰 단추 56px');
        assert.equal(await B.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px 가로 스크롤');
        await B.click('.ev-screen .ev-next.good'); await go(B, 't1-cond');
        await B.evaluate(() => { const s = window.__filmRocket.state(); s.t1.trials.push({ value: 15, y: 7 }); window.__filmRocket.show('t1-graph'); });
        await go(B, 't1-graph');
        // 2차시도 같음
        await B.evaluate(() => { const s = window.__filmRocket.state(); s.t2.changed = 'mass'; s.t2.trials = [{ value: 0, pct: 90 }]; window.__filmRocket.show('t2-challenge'); });
        await go(B, 't2-more');
        assert.match(await B.textContent('.ev-screen'), /높이가 달라지는지/);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
