// 필름통 로켓 2026-11-21 고침 — Playwright, 가짜 저장소, iPhone 13
//  ① '하나만 바꿔' 구멍: 결과 화면에서 바로 안내·그래프 단추 없음, '바꿔서 다시'에서 값을 안 바꾸면 받지 않음, 잠김 화면·띠에 한 줄, 잠긴 단계로 가는 단추 없음
//  ② 설명 화면을 쓴 반: 점수 퀴즈 ⭕·점수는 그 장 풀이가 열릴 때 (고른 답·점수는 바로 저장)
//  ③ 띠 문구 mode 'phone' → '✍️ 내 화면에서 해요'   ④ 🔮 예측 → 요약·교사 결과판 💬 생각   ⑤ 몸체 무게 0개면 '무게를 줄이거나' 없음
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('로켓: 하나만 바꿔 구멍·퀴즈 정답 표시 풀이 뒤로·내 화면에서 해요 띠·예측 → 결과판', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
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
    const small = pg => pg.evaluate(() => [...document.querySelectorAll('.ev-screen button')].filter(e => e.offsetParent && !e.classList.contains('ev-link') && e.getBoundingClientRect().height < 55.5).map(e => e.textContent.trim().slice(0, 20)));
    try {
        const c = await app.post({ action: 'createClass', ban: 1, mode: 'team', nTeams: 4, exp: 'rocket', stage: 2 });
        const doc = () => app.db.docs.get('labClasses/' + c.space);
        // 이 수업은 설명 화면을 씀: 교사가 1차시 첫 장('뚜껑은 왜…', phone)을 띄운 상태, 아직 아무 풀이도 안 엶
        Object.assign(doc(), { lesson: { on: true, stage: 't1', i: 0, key: 'gas', reveal: false, mode: 'phone' }, lessonOpen: [] });
        const A = await ctx(devices['iPhone 13'], 'A');
        await A.goto(ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space); await go(A, 'enter');
        await A.fill('#ev-name', '별빛가족'); await A.click('#ev-start');
        // 설명 화면이 '기체' 응답 장을 띄운 반 → 폰은 그 답 칸(q-gas)으로 (2026-11-23 폰은 응답만)
        await go(A, 'q-gas');
        // ③ 응답 장: 2026-11-23 선생님 결정 — 겹치는 띠·점수 없이 물음과 답 칸만
        await A.waitForFunction(() => document.documentElement.classList.contains('ev-answering'), null, { timeout: 15000 });
        assert.equal(await A.isVisible('.cs-look-band'), false, '띠와 큰 글자 중 하나만 (띠는 숨김)');
        assert.equal(await A.isVisible('#ev-score'), false, '점수 없음');
        // ② 1차시 첫 퀴즈: 고르면 바로 '✅ 보냈어요' + 낸 답 (⭕·정답 색·점수는 폰에 안 보임)
        await A.click('.ev-choice[data-k="ok"]'); await go(A, 'sent');
        assert.match(await A.textContent('.ev-screen'), /보냈어요[\s\S]*기체 발생과 압력/);
        assert.equal((await A.evaluate(() => window.__filmRocket.state().quiz.gas)).correct, true, '고른 답·점수는 바로 저장');
        // 교사가 풀이를 엶 → 폰은 그대로 (점수는 계산돼 결과판으로)
        Object.assign(doc(), { lesson: { on: true, stage: 't1', i: 0, key: 'gas', reveal: true, mode: 'look' }, lessonOpen: ['gas'] });
        await A.waitForTimeout(1500);
        assert.equal(await A.getAttribute('#ev-app', 'data-screen'), 'sent');
        // ④ 🔮 예측: 바꿀 것을 고르면 예측 고르기·까닭 칸
        // 선생님이 설명을 닫음(📱 학생 화면) → 폰 혼자 흐름
        Object.assign(doc(), { lesson: { on: false, stage: 't1', i: 0, key: '', reveal: false, mode: 'look' } });
        await A.waitForFunction(() => !document.documentElement.classList.contains('ev-following'), null, { timeout: 15000 });
        await A.evaluate(() => window.__filmRocket.show('t1-var')); await go(A, 't1-var');
        await A.click('.ev-choice[data-k="temp"]');
        await A.waitForSelector('[data-guess="t1"]');
        assert.match(await A.textContent('[data-guess="t1"] h3'), /물의 온도을\(를\) 늘리면 열리는 시간이/);
        await A.click('[data-guess="t1"] [data-dir="down"]');
        await A.fill('[data-guess="t1"] .ev-why-in', '따뜻하면 거품이 빨리 나서'); await A.dispatchEvent('[data-guess="t1"] .ev-why-in', 'change');
        assert.deepEqual(await A.evaluate(() => window.__filmRocket.state().t1.guess), { dir: 'down', why: '따뜻하면 거품이 빨리 나서' });
        assert.deepEqual(await small(A), [], '56px');
        // ① 한 값(20 °C)으로 3번 → 결과 화면에서 바로 '값을 하나 바꿔', 그래프 단추 없음
        await A.evaluate(() => { const s = window.__filmRocket.state(); s.t1.value = 20; s.t1.trials = [1, 2, 3].map(i => ({ value: 20, y: 10 + i, predict: 10, method: 'stopwatch' })); s.last = s.t1.trials[2]; window.__filmRocket.show('t1-result'); });
        await go(A, 't1-result');
        assert.match(await A.textContent('.ev-more-hint'), /물의 온도.*값을 하나 바꿔/);
        assert.equal(await A.locator('[data-go="t1-graph"]').count(), 0, '한 값이면 그래프 단추 대신 안내');
        // '바꿔서 다시' → 값을 안 바꾸고 '이 조건으로' → 받지 않음
        await A.click('#ev-change'); await go(A, 't1-cond');
        assert.match(await A.textContent('#ev-must'), /지난번\(20 °C\)과 다른 값/);
        await next(A); await A.waitForTimeout(300);
        assert.equal(await A.getAttribute('#ev-app', 'data-screen'), 't1-cond', '같은 값이면 넘어가지 않음');
        assert.match(await A.textContent('#ev-must'), /값을 하나 바꿔요/);
        await A.click('.ev-stepper:not(.locked) [data-pm="1"]');
        await next(A); await go(A, 't1-measure');
        assert.equal(await A.evaluate(() => window.__filmRocket.state().t1.mustChange), null);
        // 안내 화면: 다음 단계(2차시)가 잠겨 있으면 그리로 가는 단추 없음
        await A.evaluate(() => window.__filmRocket.show('t1-more')); await go(A, 't1-more');
        assert.equal(await A.locator('[data-go="t2-intro"]').count(), 0, '잠긴 2차시로 가는 단추 없음');
        // 잠김 화면: 기다리는 동안 한 줄
        await A.evaluate(() => window.__filmRocket.show('t2-intro')); await go(A, 'locked');
        assert.match(await A.textContent('.ev-screen'), /기다리는 동안 값을 하나 바꿔/);
        // 선생님이 2차시를 열면 띠에도 한 줄 (막지는 않음)
        await A.evaluate(() => window.__filmRocket.show('t1-intro')); await go(A, 't1-intro');
        doc().stage = 3;
        await A.waitForFunction(() => { const n = document.getElementById('ev-notice'); return n && !n.hidden; }, null, { timeout: 15000 });
        assert.match(await A.textContent('#ev-notice'), /넘어가기 전에 값을 하나 바꿔/);
        assert.equal(await A.isDisabled('#ev-notice-go'), false, '막지는 않음');
        // ⑤ 몸체 무게 0개: '무게를 줄이거나' 없음
        await A.evaluate(() => { const s = window.__filmRocket.state(); s.t2.changed = 'water'; s.t2.base = Object.assign({}, s.t2.base, { mass: 0 }); s.t2.value = 10; s.t2.trials = [{ value: 10, pct: 60, method: 'hand', hand: 'low' }]; s.last2 = s.t2.trials[0]; window.__filmRocket.show('t2-result'); });
        await go(A, 't2-result');
        assert.match(await A.textContent('.ev-screen'), /아이 키보다 낮아요/);
        assert.doesNotMatch(await A.textContent('.ev-screen'), /무게를 줄이거나/);
        // 2026-11-23 가상 수업 4차: 첫 발 뒤에는 '같은 조건으로 한 번 더' 가 먼저, 같은 조건을 다 쏜 뒤에 '값을 하나 바꿔' 안내
        assert.equal(await A.isVisible('#ev-again2'), true, '2차시 첫 발 뒤 같은 조건 반복');
        await A.evaluate(() => { const s = window.__filmRocket.state(); s.t2.trials.push({ value: 10, pct: 62, method: 'hand' }, { value: 10, pct: 58, method: 'hand' }); s.last2 = s.t2.trials[2]; window.__filmRocket.show('t2-result'); });
        await A.waitForSelector('.ev-more-hint');
        assert.match(await A.textContent('.ev-more-hint'), /값을 하나 바꿔 한 번 더 쏘아요/, '같은 조건을 다 쏘면 바로 안내');
        assert.equal(await A.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px');
        // 요약 → 교사 결과판 💬 생각
        await A.evaluate(() => window.__filmRocket.sendNow());
        await A.waitForFunction(() => /선생님께 보냄/.test(document.getElementById('ev-sync').textContent), null, { timeout: 15000 });
        const sm = app.items('rocket')[0].summary;
        assert.equal(sm['1차시 예측'], '짧아짐(따뜻하면 거품이 빨리 나서)', '예측과 까닭 한 칸'); assert.equal(sm['1차시 값 가짓수'], 1);
        assert.equal(sm['1차시 결과'], '아직 말할 수 없음', '한 가지 값만 잰 차시');
        assert.ok(Object.keys(sm).length <= 20, '요약 20개까지');
        const T = await ctx({ viewport: { width: 1920, height: 1080 } }, 'T', true);
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=run');
        await T.waitForFunction(() => /예측 짧아짐\(따뜻하면/.test((document.getElementById('board') || {}).textContent || ''), null, { timeout: 20000 });
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
