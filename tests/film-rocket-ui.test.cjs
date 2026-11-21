// 발포비타민 필름통 로켓 (가족 행사, 행사형 화면) — Playwright, 가짜 저장소(tests/fake-lab-store.cjs), 크롬 가짜 카메라
//  교사(1280): 로그인 → 실험 '필름통 로켓' → 팀 이름으로 입장 + 예비 실험 값(목표 12초) → 수업 만들기
//  가족 A(iPhone 13): 팀 이름 입장 → 생각 열기 → 1차시 안전 확인 → 퀴즈(맞힘 10점) → 한 가지만 바꾸기(물의 양) → 퀴즈(두 번째 5점)
//     → 예측 → 🎥 녹화(시계 겹침)·장면 고르기 → ⏱ 초시계 → 그래프 → 왜? → 퀴즈 → 도전(목표와 ○초 차이)
//  가족 B: 같은 팀 이름은 안내 → 다른 이름으로 입장 → 퀴즈
//  교사 결과판: 두 팀 이름·점수·시간 도전 차이, 크게 보기
//  인터넷 끊김: 가족 A 가 끊긴 채 측정 → 폰에 남음(새로고침해도) → 다시 연결되면 저절로 보냄
//  375px 가로 스크롤 없음, 행사형 단추 56px 이상
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
let CHART = null; try { CHART = fs.readFileSync(require.resolve('chart.js/dist/chart.umd.min.js'), 'utf8'); } catch (e) { CHART = null; }
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; c.dataset.points = JSON.stringify(this.data.datasets.map(d => d.data.length)); } update() {} destroy() {} };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';

test('필름통 로켓: 교사 수업 → 가족 2팀 입장 → 1차시 녹화·초시계·그래프·도전 → 퀴즈 점수 → 교사 결과판 → 끊김에도 폰에 남음', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore();
    const api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    const errors = [], net = { off: false };
    const ctx = async (opt, name) => {
        const c = await browser.newContext(Object.assign({ permissions: ['camera'], acceptDownloads: true }, opt));
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? (CHART || CHART_STUB) : '' }); });
        await c.route(/gstatic/, r => r.abort());
        // 인터넷 끊김 흉내: 저장소 요청만 실패
        await c.route(API + '**', r => (net.off && name === 'A' ? r.abort('internetdisconnected') : r.continue()));
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message));
        pg.on('dialog', d => d.accept());
        return pg;
    };
    const noScroll = async (pg, n) => assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
    const smallBig = pg => pg.evaluate(() => [...document.querySelectorAll('.ev-app button, .ev-top button')].filter(e => e.offsetParent && !e.closest('td, th') && !e.classList.contains('ev-link') && !e.classList.contains('ev-chip') && !e.classList.contains('ev-stage') && e.getBoundingClientRect().height < 55.5).map(e => e.textContent.trim().slice(0, 20)));
    const screen = pg => pg.getAttribute('#ev-app', 'data-screen');
    const go = async (pg, id) => { await pg.waitForSelector('[data-screen="' + id + '"]', { timeout: 15000 }); };
    const next = async pg => { await pg.locator('.ev-screen .ev-next:not([disabled])[data-go]').last().click(); };
    const quiz = async (pg, wrongFirst) => {
        if (wrongFirst) await pg.click('.ev-choice:not(.wrong):not([data-k="ok"]) >> nth=0');
        await pg.click('.ev-choice[data-k="ok"]');
        await pg.waitForSelector('.ev-ok');
        await next(pg);
    };
    try {
        // ---- 교사: 로그인 → 필름통 로켓 · 팀 이름 입장 · 예비 실험 값 ----
        const T = await ctx({ viewport: { width: 1280, height: 900 } }, 'T');
        await T.goto(ROOT + 'projects/class-teacher.html');
        await T.click('#btnLogin');
        await T.waitForSelector('#btnSettings:not([hidden])'); await T.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); }); await T.click('#ctTabs button[data-tab="make"]');
        await T.selectOption('#inExp', 'rocket');
        assert.equal(await T.isVisible('#teamBox'), true, '팀 이름 입장 칸');
        assert.equal(await T.isVisible('#rowN'), false, '학생 수 칸은 숨김');
        await T.fill('#inTeams', '6');
        await T.fill('#ts-targetTime', '12'); await T.fill('#ts-tolTime', '3'); await T.fill('#ts-repeats', '2');
        assert.match(await T.textContent('#preview'), /최대 6팀 · 1차시 목표 12초\(±3초\)/);
        await T.click('#btnCreate');
        await T.waitForSelector('#classOut:not([hidden])');
        const link = await T.getAttribute('#outLink', 'href');
        assert.match(link, /film-rocket\.html\?c=1-\d{4}&s=c[a-z0-9]{23}$/);
        assert.match(await T.textContent('#outTitle'), /팀 이름으로 입장 \(최대 6팀\)/);
        const famUrl = link.replace(/^https?:\/\/[^/]+\//, ROOT);
        // 이 시험은 단계 잠금 없이 끝까지 (단계 열기는 tests/class-stage-ui.test.cjs)
        assert.equal((await app.post({ action: 'classStage', space: /s=(c[a-z0-9]{23})/.exec(link)[1], stage: 99 })).ok, true);

        // ---- 가족 A (iPhone 13) ----
        const A = await ctx(devices['iPhone 13'], 'A');
        await A.goto(famUrl);
        await go(A, 'enter');
        await noScroll(A, '입장');
        await A.fill('#ev-name', '  별빛<b>가족 ');
        await A.click('#ev-start');
        await go(A, 'think-intro');
        assert.match(await A.textContent('#ev-team'), /별빛 b 가족/);   // < > 는 지움
        const teams0 = Object.values(app.db.dump()).filter(d => d.key && d.uid);
        assert.equal(teams0.length, 1, '팀 자리 하나');
        assert.equal(teams0[0].name.includes('<'), false);
        await next(A); await go(A, 'think-force');
        assert.equal(await A.isDisabled('.ev-screen .ev-next'), true, '고르기 전 다음 단추 꺼짐');
        await A.click('.ev-choice[data-k="have"]');   // 흔한 생각
        await A.waitForSelector('.ev-def');
        assert.match(await A.textContent('.ev-def'), /힘 = 물체의 모양이나 운동 상태를 바꾸는 원인/);
        await next(A); await go(A, 'think-accel'); await A.click('.ev-choice[data-k="fast"]');
        assert.match(await A.textContent('.ev-def'), /가속도 = 속도가 변하는 정도/);
        await next(A); await go(A, 'think-pressure'); await A.click('.ev-choice[data-k="ok"]');
        assert.match(await A.textContent('.ev-def'), /압력 = 일정한 넓이에 작용하는 힘/);
        await next(A); await go(A, 't1-intro');
        assert.match(await A.textContent('.ev-screen'), /목표 시간\(12초\)/, '선생님 목표가 가족 화면에');
        await next(A); await go(A, 't1-safe');
        assert.equal(await A.isDisabled('.ev-screen .ev-next'), true);
        for (const k of ['goggle', 'face', 'away']) await A.check('[data-safe="' + k + '"]');
        assert.equal(await A.isDisabled('.ev-screen .ev-next'), true, '하나라도 안 하면 못 넘어감');
        await A.check('[data-safe="wait"]');
        await next(A); await go(A, 'q-pressure');
        await quiz(A, false);                         // 10점
        await go(A, 't1-var');
        await A.click('.ev-choice[data-k="water"]');
        await A.waitForSelector('.ev-stepper.locked');
        assert.match(await A.textContent('.ev-screen'), /🔒 물의 온도/);
        await next(A); await go(A, 'q-control');
        await quiz(A, true);                          // 두 번째에 맞힘 5점
        await go(A, 't1-cond');
        assert.match(await A.textContent('#ev-score'), /15점/);
        await A.click('.ev-stepper:not(.locked) [data-pm="1"]');   // 10 → 15 mL
        assert.match(await A.textContent('.ev-stepper:not(.locked) .ev-sval'), /15 mL/);
        await next(A); await go(A, 't1-predict');
        await A.click('[data-pm="-1"]'); await A.click('[data-pm="-1"]');   // 10 → 8초
        assert.match(await A.textContent('#ev-pv'), /8초/);
        await next(A); await go(A, 't1-measure');
        // 🎥 녹화: 시계 시작 → 1.5초 → 녹화 끝 → 장면 고르기
        await A.click('#ev-m-rec');
        await A.waitForFunction(() => { const c = document.getElementById('ev-cam'); return c && c.width > 0; }, null, { timeout: 15000 });
        await A.click('#ev-r1'); await A.waitForTimeout(300);
        await A.click('#ev-r2'); await A.waitForTimeout(1500);
        await A.click('#ev-r3');
        await A.waitForSelector('#ev-vid', { timeout: 15000 });
        await A.waitForFunction(() => /초/.test(document.getElementById('ev-clock').textContent), null, { timeout: 15000 });
        await A.fill('#ev-scrub', '1000'); await A.dispatchEvent('#ev-scrub', 'input');
        await A.waitForTimeout(600);
        await A.click('.ev-frames [data-f="-1"]'); await A.waitForTimeout(300);
        await A.click('#ev-pick');
        await go(A, 't1-result');
        const st1 = await A.evaluate(() => window.__filmRocket.state());
        assert.equal(st1.t1.trials.length, 1);
        assert.equal(st1.t1.trials[0].method, 'video');
        assert.equal(st1.t1.trials[0].value, 15);
        assert.ok(st1.t1.trials[0].y > 0.8 && st1.t1.trials[0].y < 2.5, '시계 시작부터 펑까지 약 1.5초: ' + st1.t1.trials[0].y);
        assert.match(await A.textContent('.ev-screen'), /예측 8초/);
        // ⏱ 초시계로 한 번 더 (같은 조건 2/2)
        // 같은 조건 반복은 예측·방법을 다시 묻지 않음 (지난 방법 = 녹화로 바로) → '다른 방법으로' 로 초시계
        await A.click('#ev-again'); await go(A, 't1-measure');
        assert.match(await A.textContent('.ev-screen'), /같은 조건 2번째[\s\S]*예측 8초/);
        await A.waitForSelector('#ev-r1');
        await A.click('#ev-m-other'); await A.waitForSelector('#ev-m-sw');
        await A.click('#ev-m-sw'); await A.click('#ev-sw1'); await A.waitForTimeout(700); await A.click('#ev-sw2');
        await A.click('#ev-sw-adj [data-pm="1"]');
        await A.click('#ev-sw3'); await go(A, 't1-result');
        assert.match(await A.textContent('.ev-screen'), /같은 조건으로 2번 쟀어요/);
        // 다른 값 (20 mL) 초시계 한 번 → 그래프
        await A.click('[data-go="t1-cond"]'); await go(A, 't1-cond'); await A.click('.ev-stepper:not(.locked) [data-pm="1"]');
        await next(A); await go(A, 't1-predict'); await next(A); await go(A, 't1-measure');
        await A.click('#ev-m-sw'); await A.click('#ev-sw1'); await A.waitForTimeout(300); await A.click('#ev-sw2'); await A.click('#ev-sw3');
        await go(A, 't1-result');
        await A.click('[data-go="t1-graph"]'); await go(A, 't1-graph');
        assert.match(await A.textContent('#ev-mini'), /15 mL[\s\S]*2[\s\S]*20 mL/);
        await noScroll(A, '그래프');
        await next(A); await go(A, 't1-why');
        await A.click('.ev-choice[data-k="lid"]');
        await A.waitForSelector('.ev-def');
        await next(A); await go(A, 'q-gas'); await quiz(A, false);   // 10점 → 25점
        await go(A, 't1-challenge');
        assert.match(await A.textContent('.ev-screen h2'), /12초/);
        await A.click('.ev-screen [data-go="t1-ch-cond"]'); await go(A, 't1-ch-cond');
        assert.match(await A.textContent('#ev-mini'), /15 mL/, '도전 조건 화면에 지난 평균 표');
        await next(A); await go(A, 't1-ch-predict');
        assert.match(await A.textContent('#ev-pv'), /12초/, '도전 예측 기본 = 목표');
        await next(A); await go(A, 't1-ch-measure');
        await A.click('#ev-m-sw'); await A.click('#ev-sw1'); await A.waitForTimeout(400); await A.click('#ev-sw2'); await A.click('#ev-sw3');
        await go(A, 't1-ch-result');
        assert.match(await A.textContent('.ev-screen'), /목표와 \d+(\.\d)?초 차이/);
        assert.deepEqual(await smallBig(A), [], '행사형 단추 56px');
        // 선생님께 보냄
        await A.waitForFunction(() => /선생님께 보냄/.test(document.getElementById('ev-sync').textContent), null, { timeout: 15000 });
        const itA = app.items('rocket');
        assert.equal(itA.length, 1);
        assert.equal(itA[0].summary['팀 점수'], 25);
        assert.ok(itA[0].summary['시간 도전 차이(초)'] < 0, '목표보다 빠름');
        assert.equal(itA[0].summary['열림 측정 수'], 4);
        assert.match(itA[0].data, /"method":"video"/);
        assert.equal(/childCm|blob:/.test(itA[0].data), false, '아이 키·영상은 보내지 않음');

        // ---- 가족 B: 같은 이름이면 안내 → 다른 이름 ----
        const B = await ctx(devices['iPhone 13'], 'B');
        await B.goto(famUrl);
        await go(B, 'enter');
        await B.waitForFunction(() => !/연결하는 중/.test(document.getElementById('ev-enter-msg').textContent));
        await B.fill('#ev-name', '별빛 b 가족');
        await B.click('#ev-start');
        await B.waitForFunction(() => /같은 이름의 팀/.test(document.getElementById('ev-enter-msg').textContent));
        await B.fill('#ev-name', '달님 탐험대');
        await B.click('#ev-start');
        await go(B, 'think-intro');
        // 생각 열기 → 1차시 퀴즈 하나 (두 번째에 맞힘 5점)
        for (const id of ['think-force', 'think-accel', 'think-pressure']) { await next(B); await go(B, id); await B.click('.ev-choice >> nth=1'); }
        await next(B); await go(B, 't1-intro'); await next(B); await go(B, 't1-safe');
        for (const k of ['goggle', 'face', 'away', 'wait']) await B.check('[data-safe="' + k + '"]');
        await next(B); await go(B, 'q-pressure'); await quiz(B, true);
        await B.waitForFunction(() => /선생님께 보냄/.test(document.getElementById('ev-sync').textContent), null, { timeout: 15000 });

        // ---- 교사 결과판 ----
        await T.evaluate(() => { const b = document.getElementById('btnMain'); if (!b.hidden) b.click(); const r = document.getElementById('btnToRun'); if (r && r.offsetParent) r.click(); });
        await T.waitForSelector('#boardCard:not([hidden])');
        await T.waitForFunction(() => /달님 탐험대5/.test(document.getElementById('board').textContent), null, { timeout: 20000 });
        const rows = await T.$$eval('#board tbody tr', trs => trs.map(t => t.textContent));
        assert.equal(rows.length, 2);
        assert.match(rows[0], /별빛[\s\S]*25[\s\S]*초 차이/, '점수 높은 팀이 위');
        assert.match(rows[1], /달님 탐험대[\s\S]*5/);
        assert.match(await T.textContent('#watchSum'), /들어온 팀2 \/ 6/);
        await T.click('#btnBoardBig');
        assert.equal(await T.isVisible('#boardBig'), true);
        assert.match(await T.textContent('#boardBigBody'), /별빛/);
        await T.click('#btnBoardClose');
        // 교사가 목표 바꾸기 → 가족 도전 화면이 새 목표를 받음
        await T.click('#boardCard summary');
        await T.fill('#te-targetTime', '20');
        await T.click('#btnSetupSave');
        await T.waitForFunction(() => /저장했어요/.test(document.getElementById('setupMsg').textContent));
        // CSV 에 팀 이름 열
        const [dl] = await (async () => { await T.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); }); await T.click('#ctTabs button[data-tab="dl"]'); return Promise.all([T.waitForEvent('download'), T.click('#btnCsv')]); })();
        const csv = fs.readFileSync(await dl.path(), 'utf8');
        assert.match(csv.split('\r\n')[0], /팀 이름/);
        assert.match(csv, /달님 탐험대/);

        // ---- 인터넷 끊김: 가족 A ----
        net.off = true;
        await A.click('[data-go="t1-ch-cond"]'); await go(A, 't1-ch-cond');
        await next(A); await go(A, 't1-ch-predict'); await next(A); await go(A, 't1-ch-measure');
        await A.click('#ev-m-sw'); await A.click('#ev-sw1'); await A.waitForTimeout(300); await A.click('#ev-sw2'); await A.click('#ev-sw3');
        await go(A, 't1-ch-result');
        await A.waitForFunction(() => /폰에 저장됨/.test(document.getElementById('ev-sync').textContent), null, { timeout: 25000 });
        assert.equal(app.items('rocket').filter(d => d.title !== '달님 탐험대')[0].summary['열림 측정 수'], 4, '끊긴 동안은 안 감');
        await A.reload();
        await go(A, 't1-ch-result');
        assert.equal((await A.evaluate(() => window.__filmRocket.state())).t1.challenge.length, 2, '새로고침해도 폰에 남음');
        net.off = false;
        await A.evaluate(() => window.dispatchEvent(new Event('online')));
        await A.waitForFunction(() => /선생님께 보냄/.test(document.getElementById('ev-sync').textContent), null, { timeout: 25000 });
        assert.equal(app.items('rocket').filter(d => d.title !== '달님 탐험대')[0].summary['열림 측정 수'], 5, '다시 연결되면 보냄');
        // 도전 화면을 다시 열면 선생님이 바꾼 목표(20초)
        await A.click('[data-stage="t1"]'); await go(A, 't1-again');   // 이미 한 단계: 소개·안전·퀴즈 없이 '이어서 하기'
        await A.evaluate(() => window.__filmRocket.show('t1-challenge'));
        await A.waitForFunction(() => /20초/.test(document.querySelector('.ev-screen h2').textContent), null, { timeout: 15000 });

        // ---- 다른 팀 폰은 남의 팀 줄을 못 씀 ----
        const g = app.items('rocket').filter(d => d.title !== '달님 탐험대')[0];
        const bad = await app.post({ action: 'save', space: g._space, exp: 'rocket', group: g.group, id: 'nxxxx1-team', device: 'nxxxx1', n: 1, summary: { '팀 점수': 999 }, data: '' }, { uid: 'stranger' });
        assert.equal(bad.ok, false);

        // ---- 익명 로그인이 꺼진 Firebase: '인터넷' 이 아니라 진짜 이유를 보여 주고, 폰에서만 진행하지 않음 ----
        const Z = await ctx(devices['iPhone 13'], 'Z');
        const zDialogs = [];
        Z.removeAllListeners('dialog'); Z.on('dialog', d => { zDialogs.push(d.message()); d.accept(); });
        await Z.addInitScript(() => { window.LAB_STORE_FAKE_AUTH_ERROR = 'auth/admin-restricted-operation'; });
        await Z.goto(famUrl);
        await go(Z, 'enter');
        await Z.waitForFunction(() => /익명 로그인이 꺼져 있어요/.test(document.getElementById('ev-enter-msg').textContent), null, { timeout: 15000 });
        await Z.fill('#ev-name', '로그인 꺼짐 팀'); await Z.click('#ev-start');
        await Z.waitForFunction(() => /익명 로그인이 꺼져 있어요/.test(document.getElementById('ev-enter-msg').textContent));
        await Z.waitForTimeout(300);
        assert.equal(await screen(Z), 'enter', '입장하지 않은 채 다음으로 가지 않음');
        assert.equal(zDialogs.some(m => /인터넷/.test(m)), false, '인터넷 안내가 아님: ' + zDialogs.join(' / '));
        assert.equal(zDialogs.some(m => /익명 로그인이 꺼져 있어요/.test(m)), true, '진짜 이유를 알림');

        // ---- 375px ----
        const N = await ctx({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true }, 'N');
        await N.goto(ROOT + 'projects/film-rocket.html');
        await go(N, 'enter');
        assert.match(await N.textContent('#ev-enter-msg'), /이 폰에만 저장/);
        await noScroll(N, '375 입장');
        await N.fill('#ev-name', '혼자 팀'); await N.click('#ev-start'); await go(N, 'think-intro');
        await noScroll(N, '375 생각 열기');
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); api.close(); stat.close();
    }
});

test('필름통 로켓 2차시·정리 (수업 없이 이 폰만): 설계 → 촬영 → 세 곳 누르기 → % → 눈으로 → 도전 → 다시 풀기 ✨ → 결과 카드', { skip: !chromium && 'playwright 없음', timeout: 180000 }, async () => {
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => stat.listen(0, r));
    const ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    const errors = [];
    try {
        const c = await browser.newContext(Object.assign({ permissions: ['camera'], acceptDownloads: true }, devices['iPhone 13']));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /chart/i.test(r.request().url()) ? (CHART || CHART_STUB) : '' }));
        await c.route(/gstatic|firebase|googleapis/, r => r.abort());
        const P = await c.newPage();
        P.on('pageerror', e => errors.push(e.message)); P.on('dialog', d => d.accept());
        const go = id => P.waitForSelector('[data-screen="' + id + '"]', { timeout: 15000 });
        const next = () => P.locator('.ev-screen .ev-next:not([disabled])[data-go]').last().click();
        await P.goto(ROOT + 'projects/film-rocket.html');
        await go('enter'); await P.fill('#ev-name', '혼자 가족'); await P.click('#ev-start'); await go('think-intro');
        for (const [id, k] of [['think-force', 'have'], ['think-accel', 'fast'], ['think-pressure', 'push']]) { await next(); await go(id); await P.click('.ev-choice[data-k="' + k + '"]'); }
        await P.click('[data-stage="t2"]'); await go('t2-intro');
        await next(); await go('q-action'); await P.click('.ev-choice[data-k="ok"]'); await next();
        await go('t2-base');
        await P.click('[data-var="mass"] [data-pm="1"]'); await P.click('[data-var="mass"] [data-pm="1"]');
        assert.match(await P.textContent('[data-var="mass"] .ev-sval'), /2개/);
        await next(); await go('q-mass'); await P.click('.ev-choice[data-k="ok"]'); await next();
        await go('t2-var'); await P.click('.ev-choice[data-k="mass"]'); await next();
        await go('t2-cond'); assert.match(await P.textContent('.ev-stepper:not(.locked)'), /2개/, '설계 값에서 시작');
        await next(); await go('t2-safe');
        for (const k of ['goggle', 'face', 'away', 'wait']) await P.check('[data-safe="' + k + '"]');
        await next(); await go('t2-film');
        assert.match(await P.textContent('figcaption'), /2~3 m 떨어져 폰을 세로/);
        await P.click('[data-go="t2-measure"]'); await go('t2-measure');
        await P.waitForFunction(() => { const cv = document.getElementById('ev-cam'); return cv && cv.width > 0; }, null, { timeout: 15000 });
        await P.click('#ev-r1'); await P.waitForTimeout(1200); await P.click('#ev-r3');
        await P.waitForSelector('#ev-vid'); await P.waitForTimeout(800);
        await P.click('.ev-frames [data-f="1"]'); await P.waitForTimeout(300);
        await P.click('#ev-pick');
        await P.waitForSelector('#ev-mark');
        const box = await P.locator('#ev-mark').boundingBox();
        assert.match(await P.textContent('#ev-tip'), /발끝/);
        await P.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);
        assert.match(await P.textContent('#ev-tip'), /정수리/);
        await P.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3);
        await P.mouse.click(box.x + box.width / 2, box.y + box.height * 0.2);
        await P.waitForSelector('#ev-mk-ok');
        assert.match(await P.textContent('.ev-result'), /아이 키의 11[67]%/);
        await P.click('#ev-mk-ok'); await go('t2-result');
        // 아이 키(cm)는 이 폰에만
        await P.click('details.ev-more summary');
        await P.click('[data-var="child"] [data-pm="1"]');
        assert.match(await P.textContent('#ev-cm'), /로켓 높이 약 1\d\d cm/);
        // 눈으로 한 번 (무게 3개)
        await P.click('[data-go="t2-cond"]'); await go('t2-cond'); await P.click('.ev-stepper:not(.locked) [data-pm="1"]');
        await next(); await go('t2-safe'); await next(); await go('t2-film'); await P.click('[data-go="t2-hand"]'); await go('t2-hand');
        await P.click('.ev-choice[data-k="low"]'); await go('t2-result');
        await P.click('[data-go="t2-graph"]'); await go('t2-graph');
        assert.match(await P.textContent('#ev-mini'), /2개[\s\S]*11[67]%[\s\S]*3개[\s\S]*70%/);
        await next(); await go('t2-challenge');
        await P.click('#ev-ch2'); await go('t2-ch-cond'); await next(); await go('t2-safe'); await next(); await go('t2-film');
        await P.click('[data-go="t2-hand"]'); await P.click('.ev-choice[data-k="same"]'); await go('t2-ch-result');
        assert.match(await P.textContent('.ev-screen h2'), /성공/);
        await P.click('#ev-end'); await go('end-intro'); await next();
        for (const id of ['end-force', 'end-accel', 'end-pressure']) {
            await go(id);
            assert.equal(await P.isVisible('.ev-def'), false, '맞히기 전에는 정의를 안 보여 줌');
            await P.click('.ev-choice[data-k="ok"]'); await P.waitForSelector('.ev-def'); await next();
        }
        await go('end-compare');
        assert.equal(await P.locator('.ev-cmp.spark').count(), 3, '처음 셋 다 흔한 생각 → 지금 맞음 ✨');
        await next(); await go('end-card');
        const [dl] = await Promise.all([P.waitForEvent('download'), P.click('#ev-save')]);
        assert.equal(fs.readFileSync(await dl.path()).subarray(1, 4).toString(), 'PNG', '결과 카드 PNG (시험 브라우저는 한글 파일 이름을 download 로 보임)');
        const st = await P.evaluate(() => window.__filmRocket.state());
        assert.equal(st.t2.trials.length, 2); assert.equal(st.t2.challenge.length, 1);
        assert.equal(Object.keys(st.quiz).length, 5);
        assert.match(await P.textContent('#ev-score'), /50점/);
        assert.match(await P.textContent('#ev-sync'), /이 폰에만 저장/);
        assert.equal(await P.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); stat.close(); }
});
