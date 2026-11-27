// 필름통 로켓 가상 수업 4차 뒤 고침 (2026-11-23 선생님 "개선해") — Playwright, 가짜 저장소, iPhone 13 + 교사 4K·1280×720
//  ① 2차시 같은 조건 반복: 결과 화면 '🔁 같은 조건으로 한 번 더'(예측·방법 다시 안 물음) → 반복 범위·'차이가 흔들림보다 큰가요?'
//     반복이 하나도 없으면 정리 문장 '아직 말할 수 없어요'(같은 조건으로 한 번 더), 요약 '아직 말할 수 없음'
//  ② 수업 중 팀 폰: 대기 화면은 👀·팀 이름·우리가 낸 답만, 응답 장은 물음과 답 칸만 (선생님 결정, 처음 넣은 '📊 우리 팀 결과 보기'는 뺌)
//     연결이 끊겼을 때만 '📶 연결이 끊겼어요' 안내(수업 코드), 다시 연결되면 사라짐
//  ③ 🎯 도전 장(ch-t1·ch-t2)을 띄우면 폰이 그 차시 도전 화면
//  ④ 2차시 '✏️ 로켓 설계 기록' 빠짐  ⑤ 측정 장 안에서는 정의 퀴즈를 되풀이하지 않음  ⑥ 1차시 '몇 초?' 예측 빠짐
//  ⑦ 교사 설정 발포비타민 양은 '알' 이름으로 고름 (저장값은 ¼ 알 단위 그대로, 폰·요약과 같은 말)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
const M = require('../js/film-rocket-math.js');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';
const CHART_STUB = 'window.__charts = []; window.Chart = class Chart { constructor(c, cfg) { window.__charts.push(cfg); this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';

test('로켓 계산: 반복이 없으면 아직 말할 수 없음 (2차시도)', () => {
    const one = M.evidence('t2', { changed: 'mass', trials: [{ value: 0, pct: 80 }, { value: 2, pct: 55 }] });
    assert.equal(one.one, false); assert.equal(one.norep, true, '값마다 1발씩이면 흔들림을 모름');
    assert.equal(M.evidence('t2', { changed: 'mass', trials: [{ value: 0, pct: 80 }, { value: 0, pct: 85 }, { value: 2, pct: 55 }] }).norep, false);
    const st = { quiz: {}, think: { first: {}, last: {} }, t1: { trials: [] }, t2: { changed: 'mass', trials: [{ value: 0, pct: 80 }, { value: 2, pct: 55 }] }, concl: { t2: { dir: 'down', why: '무거워서' } } };
    const sm = M.summary(st, {});
    assert.equal(sm['2차시 결과'], '아직 말할 수 없음');
    assert.equal(sm['2차시 까닭'], undefined, '결과를 말할 수 없으면 까닭도 안 보냄');
    assert.equal(M.tabletLabel(2), '½ 알'); assert.equal(M.tabletLabel(4), '1 알'); assert.equal(M.tabletLabel(6), '1 ½ 알');
});

test('로켓 4차 고침: 2차시 반복·대기 화면·끊김 안내·도전 장·흐름 줄이기·발포비타민 이름', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
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
    const next = pg => pg.locator('.ev-screen .ev-next:not([disabled])[data-go]').last().click();
    const noHScroll = async (pg, n) => assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
    try {
        // ---------- 수업 없이 이 폰만: ④ 설계 기록 없음 · ⑥ 몇 초 예측 없음 · ① 2차시 같은 조건 반복 ----------
        const P = await ctx(devices['iPhone 13'], 'P');
        await P.goto(ROOT + 'projects/film-rocket.html');
        await go(P, 'enter'); await P.fill('#ev-name', '혼자 가족'); await P.click('#ev-start'); await go(P, 'think-intro');
        // ⑥ 1차시: 조건 → 바로 측정 ('몇 초?' 화면 없음, 🔮 우리 예측 한 줄)
        await P.evaluate(() => { const s = window.__filmRocket.state(); s.t1.safe = { goggle: true, face: true, away: true, wait: true }; s.t1.changed = 'water'; s.t1.guess = { dir: 'up' }; window.__filmRocket.show('t1-cond'); });
        await go(P, 't1-cond'); await next(P); await go(P, 't1-measure');
        assert.match(await P.textContent('.ev-screen'), /‘펑’까지 시간 재기/);
        await P.click('#ev-m-sw'); await P.click('#ev-sw1'); await P.waitForTimeout(300); await P.click('#ev-sw2'); await P.click('#ev-sw3');
        await go(P, 't1-result');
        assert.match(await P.textContent('.ev-screen'), /🔮 우리 예측: 길어질 것 같아요/);
        assert.doesNotMatch(await P.textContent('.ev-screen'), /예측 \d+초/, '몇 초 예측 글 없음');
        await P.click('#ev-again'); await go(P, 't1-measure');
        assert.doesNotMatch(await P.textContent('.ev-screen'), /처음 예측 그대로|예측 바꾸기/);
        // 예전에 저장된 '몇 초?' 화면 주소로 와도 측정으로
        await P.evaluate(() => window.__filmRocket.show('t1-predict')); await go(P, 't1-measure');
        // ④ 2차시: 발사 전 퀴즈 → mass 퀴즈 (설계 기록 없음), 예전 주소 t2-base 도 넘어감
        await P.evaluate(() => { const s = window.__filmRocket.state(); s.gate = { open: null }; window.__filmRocket.show('t2-intro'); });
        await go(P, 't2-intro'); await next(P); await go(P, 't2-build');   /* 2026-11-27 🛠 만들기 */ await P.click('#ev-build-done'); await go(P, 'q-action'); await P.click('.ev-choice[data-k="ok"]'); await P.waitForSelector('.ev-ok'); await next(P);
        await go(P, 'q-mass');
        await P.evaluate(() => window.__filmRocket.show('t2-base')); await go(P, 'q-mass');
        // ① 2차시 결과 → 🔁 같은 조건으로 한 번 더 (눈으로 고르기로 빠르게)
        await P.evaluate(() => { const s = window.__filmRocket.state(); s.t2.changed = 'mass'; s.t2.value = 0; s.t2.guess = { dir: 'down' }; s.t2.ch = false; window.__filmRocket.show('t2-hand'); });
        await go(P, 't2-hand'); await P.click('.ev-choice[data-k="high"]'); await go(P, 't2-result');
        assert.match(await P.textContent('.ev-screen'), /이 조건: 1번째/);
        assert.equal(await P.isVisible('#ev-again2'), true, '2차시 결과에 같은 조건으로 한 번 더');
        assert.match(await P.textContent('#ev-again2'), /같은 조건으로 한 번 더 \(1\/3\)/);
        await noHScroll(P, '2차시 결과');
        await P.click('#ev-again2'); await go(P, 't2-hand');   // 예측·안전·촬영 안내를 다시 묻지 않고 바로 그 방법
        await P.click('.ev-choice[data-k="same"]'); await go(P, 't2-result');
        assert.match(await P.textContent('.ev-screen'), /이 조건: 2번째 · 평균 <?b?>?/);
        assert.equal((await P.evaluate(() => window.__filmRocket.state().t2.trials.map(t => t.value))).join(','), '0,0', '같은 값 두 발');
        // '정해 둔 ②' 로 바로 맞춰지고, 일부러 지난번(0개)으로 되돌리면 여전히 막음
        await P.click('#ev-change'); await go(P, 't2-cond');
        assert.match(await P.textContent('.ev-stepper:not(.locked) .ev-sval'), /1개/, '정해 둔 ② 로 자동 맞춤');
        await P.click('.ev-stepper:not(.locked) [data-pm="-1"]');
        await next(P); await P.waitForTimeout(200);
        assert.equal(await P.getAttribute('#ev-app', 'data-screen'), 't2-cond'); assert.match(await P.textContent('#ev-must'), /값을 하나 바꿔요/);
        // 다른 값 두 발 → 그래프 표에 ↕ 범위·흔들림 판정
        await P.evaluate(() => { const s = window.__filmRocket.state(); s.t2.mustChange = null; s.t2.trials.push({ value: 2, pct: 70, method: 'hand' }, { value: 2, pct: 72, method: 'hand' }); window.__filmRocket.show('t2-graph'); });
        await go(P, 't2-graph');
        assert.match(await P.textContent('#ev-mini'), /↕ 범위[\s\S]*100%~120%/);
        assert.match(await P.textContent('#ev-mini'), /차이가 흔들림보다 큰가요\?[\s\S]*겹치지 않아요/);
        // 정리 문장: 2차시 반복 있음 → 고를 수 있음 / 1차시 반복 없음(값마다 1번) → '아직 말할 수 없어요'
        await P.evaluate(() => { const s = window.__filmRocket.state(); s.t1.trials = [{ value: 10, y: 12, method: 'stopwatch' }, { value: 15, y: 16, method: 'stopwatch' }]; window.__filmRocket.show('end-sentence'); });
        await go(P, 'end-sentence');
        assert.match(await P.textContent('[data-concl="t1"]'), /아직 말할 수 없어요[\s\S]*같은 조건으로 한 번 더 재야/);
        assert.equal(await P.locator('[data-concl="t1"] [data-dir]').count(), 0);
        assert.ok(await P.locator('[data-concl="t2"] [data-dir]').count() > 0, '반복한 2차시는 결과를 고름');

        const c = await app.post({ action: 'createClass', ban: 4, mode: 'team', nTeams: 3, exp: 'rocket', stage: 1, setup: { tabletMin: 2, tabletMax: 4, tabletBase: 2 } });
        const A = await ctx(devices['iPhone 13'], 'A');
        await A.goto(ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space);
        await go(A, 'enter'); await A.fill('#ev-name', '별빛가족'); await A.click('#ev-start'); await go(A, 'think-intro');
        const T = await ctx({ viewport: { width: 1920, height: 1080 } }, 'T', true);
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
        await T.waitForSelector('#pSlides .ls-slide');
        await go(A, 'wait');
        // ⑧ 응답 장('힘')을 보는 중에 교사 화면 새로고침 · 두 번째 창(다른 배율) → 같은 장에서 이어 보임, 폰 답 칸 그대로 (문서를 되돌려 쓰지 않음)
        await T.keyboard.press('ArrowRight'); await go(A, 'think-force');   // 첫 장 → '힘' (2026-11-27 '폰에서 이렇게 해요'는 첫 장에 합침)
        await T.waitForFunction(() => /힘/.test((document.querySelector('#pSlides .ls-title') || {}).textContent || ''));
        await T.waitForTimeout(800);
        const L0 = JSON.stringify(app.db.docs.get('labClasses/' + c.space).lesson);
        await T.reload();
        await T.waitForFunction(() => /힘/.test((document.querySelector('#pSlides .ls-title') || {}).textContent || ''), null, { timeout: 15000 });
        const T2 = await ctx({ viewport: { width: 2560, height: 1440 } }, 'T2', true);
        await T2.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
        await T2.waitForFunction(() => /힘/.test((document.querySelector('#pSlides .ls-title') || {}).textContent || ''), null, { timeout: 15000 });
        await A.waitForTimeout(2000);
        assert.equal(await A.getAttribute('#ev-app', 'data-screen'), 'think-force', '새로고침·두 번째 창에도 폰 답 칸 그대로');
        const L1 = app.db.docs.get('labClasses/' + c.space).lesson;
        assert.equal(JSON.stringify(Object.assign({}, L1, { at: null })), JSON.stringify(Object.assign({}, JSON.parse(L0), { at: null })), '지금 장을 다시 쓰지 않음');
        await T2.close();
        // ② 수업 중 폰: 응답 장은 물음과 답 칸만 → 고르면 '✅ 보냈어요' + 낸 답, 대기 화면은 👀·팀 이름·우리가 낸 답만
        assert.equal(await A.isVisible('#ev-score'), false, '응답 장에 점수 없음');
        assert.equal(await A.isVisible('.ev-foot'), false, '선생님 연결·도움말 없음');
        await A.click('.ev-choice[data-k="ok"]'); await go(A, 'sent');
        assert.match(await A.textContent('.ev-sentlist'), /✅ 보냈어요: 힘 · /);
        await T.keyboard.press('ArrowLeft'); await go(A, 'wait');   // 장을 넘기면 그때부터 씀
        const waitShown = await A.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
        assert.match(waitShown, /앞 화면을 봐요[\s\S]*별빛가족[\s\S]*✅ 보냈어요: 힘/, '대기 화면: ' + waitShown);
        assert.doesNotMatch(waitShown, /점|선생님이 설명 중|선생님 연결|도움말|우리 팀 결과/, '그 밖의 글 없음: ' + waitShown);
        assert.equal(await A.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px');
        if (process.env.ROCKET_SHOTS) await A.screenshot({ path: path.join(process.env.ROCKET_SHOTS, 'phone-wait-answers.png') });
        // ⑤ 연결이 끊겼을 때만 큰 안내 (수업 코드 포함) → 다시 연결되면 사라짐
        assert.equal(await A.isVisible('#ev-offline'), false, '연결돼 있으면 안내 없음');
        await A.context().setOffline(true);
        await A.waitForSelector('#ev-offline:not([hidden])', { timeout: 10000 });
        assert.match(await A.textContent('#ev-offline'), /연결이 끊겼어요[\s\S]*와이파이[\s\S]*새로고침[\s\S]*QR 을 다시 찍어요[\s\S]*팀 이름은 그대로/);
        assert.match(await A.textContent('#ev-offline'), new RegExp(c.classCode));
        assert.match(await A.textContent('#ev-offline'), /다시 연결되면 저절로 보내요/);
        if (process.env.ROCKET_SHOTS) await A.screenshot({ path: path.join(process.env.ROCKET_SHOTS, 'phone-offline.png') });
        await A.context().setOffline(false);
        await A.waitForSelector('#ev-offline', { state: 'hidden', timeout: 10000 });
        // ⑨ 발표 화면 🏆 결과판: 관리 표시(🔌·✓ 기다림) 없음, 값이 없는 ⏱·🎯 칸 없음, 💬 생각은 있음
        // (가상 수업 5차 상 2: 발표 화면 결과판은 순위·점수 없이 팀마다 '바꾼 것 → 우리 숫자' 한 줄)
        await T.click('#btnPBoard'); await T.waitForSelector('#pPanel:not([hidden]) .ct-pboard');
        const bh = await T.textContent('#pPanel .ct-pboard thead');
        assert.doesNotMatch(bh, /⏱|🎯|🚀|⭐|점수/, '값이 없는 도전 칸·점수 숨김: ' + bh);
        assert.match(bh, /바꾼 것 → 우리 숫자/);
        assert.doesNotMatch(await T.textContent('#pPanel'), /🔌|✓ 기다림/);
        await T.click('#btnPBoard');
        // 1차시 열기 → 측정 장(do-t1)까지
        await T.click('#btnPOpen'); await T.click('#btnPAskYes');
        await T.waitForFunction(() => /뚜껑은 왜/.test((document.querySelector('#pSlides .ls-title') || {}).textContent || ''), null, { timeout: 15000 });
        const toSlide = async re => { for (let k = 0; k < 20 && !re.test(await T.textContent('#pSlides .ls-title')); k++) await T.keyboard.press('ArrowRight'); assert.match(await T.textContent('#pSlides .ls-title'), re); };
        await toSlide(/이제 폰으로 재요/);
        await go(A, 't1-safe');
        for (const k of ['goggle', 'face', 'away', 'wait']) await A.check('[data-safe="' + k + '"]');
        await next(A); await go(A, 't1-var');   // ⑤ q-pressure 를 건너뜀
        await A.click('.ev-choice[data-k="tablet"]'); await A.click('[data-guess] [data-dir="down"]');
        await next(A); await go(A, 't1-cond');   // ⑤ q-control 을 건너뜀
        // ⑦ 교사 설정 2·4 (¼ 알 단위) → 폰 '½ 알', 교사 화면 고르기도 같은 이름
        assert.match(await A.textContent('.ev-stepper:not(.locked) .ev-sval'), /½ 알/);
        const pressure = await A.evaluate(() => window.__filmRocket.state().quiz.pressure);
        assert.ok(!pressure || !pressure.tries, '측정 장 안에서 정의 퀴즈(압력)를 풀지 않음');
        // 잰 값 두 가지 (½ 알 · 1 알) 를 넣고 → 🎯 도전 장 → 폰은 1차시 도전 화면
        await A.evaluate(() => { const s = window.__filmRocket.state(); s.t1.trials = [{ value: 2, y: 15, method: 'stopwatch' }, { value: 2, y: 14, method: 'stopwatch' }, { value: 4, y: 8, method: 'stopwatch' }, { value: 4, y: 9, method: 'stopwatch' }]; });
        await toSlide(/도전: 목표 시간에 맞춰 열기/);
        await go(A, 't1-challenge');
        assert.match(await A.textContent('.ev-screen h2'), /초에 ‘펑’ 하게 만들어요/);
        if (process.env.ROCKET_SHOTS) for (const [w, h] of [[3840, 2160], [1280, 720]]) { await T.setViewportSize({ width: w, height: h }); await T.waitForTimeout(400); await T.screenshot({ path: path.join(process.env.ROCKET_SHOTS, 'present-challenge-' + w + '.png') }); }
        await T.setViewportSize({ width: 1920, height: 1080 });
        assert.equal(await T.locator('#pSlides .ls-answers').count(), 0, '도전 장에는 빈 답 모음 칸 없음');
        await A.click('.ev-screen [data-go="t1-ch-cond"]'); await go(A, 't1-ch-cond');
        await next(A); await go(A, 't1-ch-measure');   // 도전도 '몇 초?' 예측 없이
        // 다른 장(앞 장, 설명) → 측정 화면이라 그대로 → 도전 측정을 마치면 대기, 대기 화면에 우리 팀 결과 보기
        await T.keyboard.press('ArrowLeft'); await A.waitForTimeout(1500);
        assert.equal(await A.getAttribute('#ev-app', 'data-screen'), 't1-ch-measure', '측정 화면은 장이 바뀌어도 그대로');
        await A.click('#ev-m-sw'); await A.click('#ev-sw1'); await A.waitForTimeout(300); await A.click('#ev-sw2'); await A.click('#ev-sw3');
        await go(A, 'wait');
        assert.equal((await A.evaluate(() => window.__filmRocket.state().t1.challenge.length)), 1, '도전 기록은 저장');
        assert.equal(await A.locator('.ev-myres').count(), 0, '대기 화면에 결과 보기 접기 없음 (선생님 결정: 우리가 낸 답만)');
        // 교사 설정 화면: 발포비타민은 '알' 이름으로 고름 (팝업의 🔧 선생님용 탭에서 바로)
        await T.click('#btnPExit'); await T.waitForSelector('#runPop:not([hidden])');
        await T.click('#rpTabs [data-rptab="teach"]');
        await T.waitForSelector('#te-tabletMin', { state: 'attached' });
        const opts = await T.evaluate(() => { const s = document.getElementById('te-tabletMin'); return s ? { tag: s.tagName, sel: s.options[s.selectedIndex].textContent, all: [...s.options].map(o => o.textContent) } : null; });
        assert.ok(opts && opts.tag === 'SELECT', '고르기 칸');
        assert.equal(opts.sel, '½ 알'); assert.deepEqual(opts.all.slice(0, 4), ['¼ 알', '½ 알', '¾ 알', '1 알']);
        assert.equal(await T.evaluate(() => document.getElementById('te-tabletMax').value), '4');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
