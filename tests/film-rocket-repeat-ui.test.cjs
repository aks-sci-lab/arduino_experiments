// 필름통 로켓(행사형) 다시 재기·반복 측정·끊김·지난 기록 — 2026-11-20 선생님이 고른 것 (학생 가상 수업 기록 상 3, 중 4~8)
//  "다시 재기 바로 가기" ① 이미 한 단계로 돌아가면 소개·안전·퀴즈를 건너뛰고 '이어서 하기'(안전 한 화면) → 조건 → 예측 → 측정
//  "반복 측정 간단히" ② 녹화 영상은 끝 2초 앞에서 열림·⏪⏩ 2초씩 ③ 같은 조건 반복은 예측·방법을 다시 묻지 않음 / 조건을 바꾸면 다시 예측
//                     ④ '이 조건은 ○번 쟀어요' 는 지금 고른 값 기준
//  "끊김·지난 기록" ⑤ 인터넷이 끊긴 채 새로고침해도 단계 잠금 유지 ⑥ 수업 주소 없이 열어도 이 폰의 지난 기록 보기
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';

test('로켓: 다시 재기 바로 가기·반복 측정·끊긴 채 새로고침 잠금·지난 기록 보기', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    const errors = [], net = { off: false };
    const c = await browser.newContext(Object.assign({ permissions: ['camera'] }, devices['iPhone 13']));
    await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
    await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /chart/i.test(r.request().url()) ? CHART_STUB : '' }));
    await c.route(/gstatic/, r => r.abort());
    await c.route(API + '**', r => (net.off ? r.abort('internetdisconnected') : r.continue()));
    const A = await c.newPage();
    A.on('pageerror', e => errors.push(e.message)); A.on('dialog', d => d.accept());
    const go = id => A.waitForSelector('#ev-app[data-screen="' + id + '"]', { timeout: 15000 });
    const next = () => A.locator('.ev-screen .ev-next:not([disabled])[data-go]').last().click();
    const layout = async n => {
        assert.equal(await A.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
        const small = await A.evaluate(() => [...document.querySelectorAll('.ev-app button')].filter(e => e.offsetParent && !e.classList.contains('ev-link') && !e.classList.contains('ev-chip') && e.getBoundingClientRect().height < 55.5).map(e => e.textContent.trim().slice(0, 20)));
        assert.deepEqual(small, [], n + ' 작은 단추');
    };
    // 화면이 바뀔 때마다 기록 (몇 화면을 지났는지)
    const trail = () => A.evaluate(() => window.__trail.slice());
    await A.addInitScript(() => {
        window.__trail = [];
        new MutationObserver(() => { const v = document.getElementById('ev-app') && document.getElementById('ev-app').getAttribute('data-screen'); if (v && window.__trail[window.__trail.length - 1] !== v) window.__trail.push(v); })
            .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-screen'] });
    });
    try {
        const cls = await app.post({ action: 'createClass', ban: 2, mode: 'team', nTeams: 4, exp: 'rocket', stage: 2 });   // 생각 열기·1차시 열림
        const famUrl = ROOT + 'projects/film-rocket.html?c=' + cls.classCode + '&s=' + cls.space;
        await A.goto(famUrl); await go('enter');
        await A.fill('#ev-name', '무지개 팀'); await A.click('#ev-start'); await go('think-intro');
        await next(); await go('think-force'); await A.click('.ev-choice[data-k="have"]');
        await next(); await go('think-accel'); await A.click('.ev-choice[data-k="fast"]');
        await next(); await go('think-pressure'); await A.click('.ev-choice[data-k="ok"]');
        await next(); await go('t1-intro');
        await next(); await go('q-gas'); await A.click('.ev-choice[data-k="ok"]'); await A.waitForSelector('.ev-ok'); await next();
        await go('t1-safe');
        for (const k of ['goggle', 'face', 'away', 'wait']) await A.check('[data-safe="' + k + '"]');
        await next(); await go('q-pressure'); await A.click('.ev-choice[data-k="ok"]'); await A.waitForSelector('.ev-ok'); await next();
        await go('t1-var'); await A.click('.ev-choice[data-k="water"]'); await A.click('[data-guess] [data-dir="up"]'); await next();
        await go('q-control'); await A.click('.ev-choice[data-k="ok"]'); await A.waitForSelector('.ev-ok'); await next();
        await go('t1-cond');
        assert.equal(await A.textContent('#ev-count'), '0');
        await next(); await go('t1-measure');
        // 첫 측정: ⏱ 초시계
        await A.click('#ev-m-sw'); await A.click('#ev-sw1'); await A.waitForTimeout(400); await A.click('#ev-sw2'); await A.click('#ev-sw3');
        await go('t1-result');
        // ③ 같은 조건 한 번 더: 예측·방법 고르기 없이 지난 방법(초시계)으로 바로
        const before = (await trail()).length;
        await A.click('#ev-again'); await go('t1-measure');
        assert.match(await A.textContent('.ev-screen'), /같은 조건 2번째[\s\S]*🔮 우리 예측/);
        assert.equal(await A.isVisible('#ev-m-sw'), false, '방법 고르기 없음');
        assert.equal(await A.isVisible('#ev-sw1'), true, '초시계가 바로');
        assert.deepEqual((await trail()).slice(before), ['t1-measure'], '예측 화면을 지나지 않음');
        await layout('같은 조건 측정');
        await A.click('#ev-sw1'); await A.waitForTimeout(300); await A.click('#ev-sw2'); await A.click('#ev-sw3');
        await go('t1-result');
        assert.match(await A.textContent('.ev-screen'), /이 조건: 2번째/);
        // ④ 조건 화면: 정해 둔 ② 로 자동 맞춤(0번), − 로 ① 로 가면 2번, 다시 + 로 ② 로 가면 0번
        await A.click('#ev-change'); await go('t1-cond');
        assert.equal(await A.textContent('#ev-count'), '0', '정해 둔 ② 로 자동 맞춤');
        await A.click('.ev-stepper:not(.locked) [data-pm="-1"]');
        assert.equal(await A.textContent('#ev-count'), '2', '① 값 기준');
        await A.click('.ev-stepper:not(.locked) [data-pm="1"]');
        assert.equal(await A.textContent('#ev-count'), '0', '바꾼 값 기준');
        // 조건을 바꾸면 방법을 다시 고름 ('몇 초?' 예측 화면은 2026-11-23 에 뺌)
        await next(); await go('t1-measure');
        assert.equal(await A.isVisible('#ev-m-sw'), true, '조건을 바꾸면 방법도 다시 고름');
        // ② 🎥 녹화: 끝 2초 앞에서 열림, ⏪ 2초 앞으로
        await A.click('#ev-m-rec');
        await A.waitForFunction(() => { const cv = document.getElementById('ev-cam'); return cv && cv.width > 0; }, null, { timeout: 15000 });
        await A.click('#ev-r1'); await A.waitForTimeout(200); await A.click('#ev-r2'); await A.waitForTimeout(4500); await A.click('#ev-r3');
        await A.waitForSelector('#ev-vid', { timeout: 15000 });
        await A.waitForFunction(() => { const v = document.getElementById('ev-vid'); return v && v.currentTime > 1; }, null, { timeout: 15000 });
        const pos = await A.evaluate(() => { const v = document.getElementById('ev-vid'); return { t: v.currentTime, d: v.duration }; });
        assert.ok(pos.t > 2 && (!isFinite(pos.d) || pos.t >= pos.d - 2.3), '끝 2초 앞에서 열림: ' + JSON.stringify(pos));
        await A.waitForFunction(() => /⏱ [1-9]\.\d\d초/.test(document.getElementById('ev-clock').textContent), null, { timeout: 5000 });   // 시계가 0초가 아님
        assert.match(await A.textContent('.ev-screen'), /⏪ ⏩ 2초씩/);
        await A.click('.ev-frames [data-f="-60"]'); await A.waitForTimeout(500);
        const t2 = await A.evaluate(() => document.getElementById('ev-vid').currentTime);
        assert.ok(pos.t - t2 > 1.5, '⏪ 는 2초 앞으로: ' + pos.t + ' → ' + t2);
        await A.click('.ev-frames [data-f="60"]'); await A.waitForTimeout(500);
        await A.click('#ev-pick'); await go('t1-result');
        assert.equal((await A.evaluate(() => window.__filmRocket.state())).t1.trials.length, 3);

        // ① 위 탭으로 다시 1차시: 소개·안전·퀴즈 없이 '이어서 하기' → 조건 → 측정 (3화면)
        await A.evaluate(() => window.__filmRocket.show('think-pressure')); await go('think-pressure');
        const b0 = (await trail()).length;
        await A.click('.ev-stage[data-stage="t1"]'); await go('t1-again');
        assert.match(await A.textContent('.ev-screen'), /이어서 해요[\s\S]*3번[\s\S]*안전 다시 확인[\s\S]*보안경/);
        await layout('이어서 하기');
        await A.click('.ev-screen [data-go="t1-cond"]'); await go('t1-cond');
        await next(); await go('t1-measure');
        assert.deepEqual((await trail()).slice(b0), ['t1-again', 't1-cond', 't1-measure'], '돌아가서 측정까지 3화면');

        // ⑤ 인터넷이 끊긴 채 새로고침해도 2차시·정리는 잠김
        await A.evaluate(() => window.__filmRocket.show('t1-graph')); await go('t1-graph');
        net.off = true;
        await A.reload(); await go('t1-graph');
        await A.waitForTimeout(1500);
        assert.equal(await A.isVisible('.ev-stage.locked[data-stage="t2"]'), true, '끊겨도 2차시 잠금');
        assert.equal(await A.isVisible('.ev-stage.locked[data-stage="end"]'), true);
        await A.click('.ev-stage[data-stage="t2"]', { force: true }); await go('locked');
        net.off = false;

        // ⑥ 수업이 끝난 뒤 주소만(수업 코드 없이) 열어도 이 폰의 지난 기록
        await A.goto(ROOT + 'projects/film-rocket.html'); await go('enter');
        assert.match(await A.textContent('.ev-screen'), /이 폰의 지난 기록[\s\S]*무지개 팀[\s\S]*잰 값 3개/);
        await layout('지난 기록 목록');
        await Promise.all([A.waitForURL(/past=2-\d{4}/), A.click('[data-past]')]);
        await go('enter');
        assert.match(await A.textContent('#ev-app'), /무지개 팀[\s\S]*선생님께는 보내지 않아요/);
        await A.click('#ev-continue');
        await A.waitForFunction(() => document.getElementById('ev-app').getAttribute('data-screen') !== 'enter');
        assert.match(await A.textContent('#ev-sync'), /지난 기록/);
        assert.equal((await A.evaluate(() => window.__filmRocket.state())).t1.trials.length, 3, '지난 기록 그대로');
        assert.equal(await A.evaluate(() => window.__filmRocket.share()), null, '지난 기록은 선생님께 보내지 않음');
        // 2차시 발사 영상: 가장 높은 장면은 발사 0.5~1초 뒤, 떨어진 뒤 녹화를 멈추므로 끝에서 2.5초 앞에서 열림 (맨 앞 0초가 아님)
        await A.evaluate(() => window.__filmRocket.show('t2-measure')); await go('t2-measure');
        await A.waitForFunction(() => { const cv = document.getElementById('ev-cam'); return cv && cv.width > 0; }, null, { timeout: 15000 });
        await A.click('#ev-r1'); await A.waitForTimeout(4500); await A.click('#ev-r3');
        await A.waitForSelector('#ev-vid', { timeout: 15000 });
        await A.waitForFunction(() => { const v = document.getElementById('ev-vid'); return v && v.currentTime > 1; }, null, { timeout: 15000 });
        const p2 = await A.evaluate(() => { const v = document.getElementById('ev-vid'); return { t: v.currentTime, d: v.duration }; });
        assert.ok(p2.t > 1.5 && (!isFinite(p2.d) || (p2.t >= p2.d - 2.8 && p2.t <= p2.d - 2.2)), '발사 영상 끝 2.5초 앞: ' + JSON.stringify(p2));
        await A.click('.ev-frames [data-f="-60"]'); await A.waitForTimeout(500);
        assert.ok(p2.t - await A.evaluate(() => document.getElementById('ev-vid').currentTime) > 1.5, '⏪ 2초');
        await layout('발사 장면 고르기');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
