// 필름통 로켓 2026-11-21 비계 4 — Playwright, 가짜 저장소, iPhone 13 + 교사 1920·4K
//  ① 결과 없는 결론 막기: 한 가지 값만 잰 차시는 정리 문장에서 '아직 말할 수 없어요', 결과판에도 '아직 말할 수 없음'
//     '왜냐하면' 보기·2차시 결과 안내·예측 까닭 보기 글이 팀이 고른 변인에 맞음 (잠긴 변인을 권하지 않음)
//  ② 정리 문장에 우리 숫자(저절로), 교사 결과판 💬 에 바꾼 것·숫자·예측 까닭, 크게 보기(프로젝터)에도 💬
//  ③ 반복 범위 막대(그래프)·'차이가 흔들림보다 큰가요?'   ④ 🔎 우리 팀 물음   ⑤ 새 설명 장 '펑' (풀이 그림은 풀이 뒤)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
const M = require('../js/film-rocket-math.js');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
// 그래프 도구 흉내: 만든 그래프 설정을 window.__charts 에 모음 (반복 범위 막대 확인용)
const CHART_STUB = 'window.__charts = []; window.Chart = class Chart { constructor(c, cfg) { window.__charts.push(cfg); this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('로켓 계산: 변인별 까닭 보기·우리 숫자·흔들림·요약 20칸', () => {
    // 변인별 보기: 물의 양 팀은 '빈 공간', 잠긴 다른 변인(온도) 이야기는 없음
    assert.ok(M.becauseFor('t1', 'water').some(t => /빈 공간/.test(t)));
    assert.ok(!M.becauseFor('t1', 'water').some(t => /따뜻/.test(t)));
    assert.ok(M.becauseFor('t2', 'fins').some(t => /공기 저항/.test(t)));
    assert.deepEqual(M.becauseFor('t1', 'nope'), M.BECAUSE.t1._);
    for (const part of ['t1', 't2']) for (const k of Object.keys(M.BECAUSE[part])) for (const t of M.BECAUSE[part][k]) assert.equal(M.cleanShort(t), t, '보기는 40자 안: ' + t);
    assert.match(M.whyExample('t2', 'mass'), /무거우면/); assert.doesNotMatch(M.whyExample('t2', 'mass'), /따뜻/);
    assert.equal(M.teamQuestion('t1', 'temp'), '물을 따뜻하게 하면 뚜껑이 더 빨리 열릴까?');
    // 우리 숫자
    const p = { changed: 'temp', trials: [{ value: 20, y: 14 }, { value: 20, y: 14.4 }, { value: 40, y: 9.8 }] };
    const ev = M.evidence('t1', p);
    assert.equal(ev.text, '물의 온도을(를) 20 °C → 40 °C 로 바꿨더니 평균 14.2초 → 9.8초');
    assert.equal(ev.short, '물의 온도 20 °C→40 °C: 14.2초→9.8초');
    assert.equal(M.evidence('t1', { changed: 'temp', trials: [{ value: 20, y: 14 }] }).one, true);
    // 흔들림: 겹침 / 안 겹침 / 반복 없음
    assert.equal(M.spread(M.byValue([{ value: 10, y: 10 }, { value: 10, y: 14 }, { value: 20, y: 12 }])).verdict, 'overlap');
    assert.equal(M.spread(M.byValue([{ value: 10, y: 10 }, { value: 10, y: 11 }, { value: 20, y: 15 }])).verdict, 'clear');
    assert.equal(M.spread(M.byValue([{ value: 10, y: 10 }, { value: 20, y: 15 }])).verdict, '');
    // 모든 칸이 다 찬 요약도 20칸 안
    const st = {
        quiz: { gas: { tries: 1, correct: true } }, think: { first: {}, last: {} },
        t1: { changed: 'temp', guess: { dir: 'down', why: '따뜻하면 거품이 빨리 나서' }, trials: p.trials, challenge: [{ value: 40, y: 12, diff: 0.5 }] },
        t2: { changed: 'mass', guess: { dir: 'down', why: '무거우면 덜 올라가서' }, trials: [{ value: 0, pct: 120 }, { value: 2, pct: 90 }], challenge: [{ value: 1, pct: 100, diff: 0 }] },
        concl: { t1: { dir: 'down', why: '따뜻하면 기체(거품)가 더 빨리 생겨서' }, t2: { dir: 'down', why: '무거우면 덜 빨라져서(질량)' } }
    };
    const sm = M.summary(st, {});
    assert.ok(Object.keys(sm).length <= 20, '요약 ' + Object.keys(sm).length + '칸');
    assert.equal(sm['1차시 증거'], '물의 온도 20 °C→40 °C: 14.2초→9.8초');
    assert.equal(sm['2차시 증거'], '몸체 무게 0개→2개: 120%→90%');
    assert.equal(sm['1차시 예측'], '짧아짐(따뜻하면 거품이 빨리 나서)');
    assert.equal(sm['1차시 결과'], '짧아짐');
    for (const v of Object.values(sm)) if (typeof v === 'string') assert.ok(v.length <= 40, v);
    // 한 값만 잰 차시: 정리에서 '짧아졌어요'를 골랐어도 결과는 '아직 말할 수 없음', 까닭은 빼기
    const one = M.summary(Object.assign({}, st, { t1: { changed: 'temp', trials: [{ value: 20, y: 14 }] } }), {});
    assert.equal(one['1차시 결과'], '아직 말할 수 없음'); assert.equal(one['1차시 까닭'], undefined);
});

test('로켓 설명 장: 압력을 ‘펑’ 장면에 잇는 장 (풀이 그림은 풀이 뒤)', () => {
    const { LessonContent, LessonSlides } = require('../js/lesson-slides.js');
    const vm = require('node:vm'), box = { LessonContent }; box.window = box;
    vm.runInNewContext(fs.readFileSync(path.join(REPO, 'js', 'lesson-content', 'rocket.js'), 'utf8'), box);
    const t1 = LessonContent.get('rocket').stages.t1;
    // 2026-11-27 분량 조절: '펑' 물음 두 장(기체 발생 + 그 순간)을 1차시 첫 장 하나로 (gas 퀴즈 key 그대로)
    const i = t1.findIndex(s => s.key === 'gas');
    assert.equal(i, 0, '1차시 첫 장');
    assert.equal(t1.filter(s => /펑/.test(s.title)).length, 1, "'펑' 장은 하나");
    const s = t1[i];
    assert.ok(s.ask && s.reveal && s.revealImg && s.img);
    assert.match(s.reveal, /이산화 탄소[\s\S]*압력[\s\S]*붙잡는 힘/, '기체 → 압력 → 붙잡는 힘보다 커지면 펑');
    assert.doesNotMatch(LessonSlides.render(s, false), /③ 펑/, '풀이 전에는 답 그림 없음');
    assert.match(LessonSlides.render(s, true), /③ 펑/);
});

test('로켓 비계 4: 아직 말할 수 없어요·변인별 보기·우리 숫자·결과판 💬·반복 막대·우리 팀 물음', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
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
    const show = async (pg, id) => { await pg.evaluate(s => window.__filmRocket.show(s), id); await go(pg, id); };
    try {
        const c = await app.post({ action: 'createClass', ban: 1, mode: 'team', nTeams: 4, exp: 'rocket', stage: 4 });
        const A = await ctx(devices['iPhone 13'], 'A');
        await A.goto(ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space); await go(A, 'enter');
        await A.fill('#ev-name', '별빛가족'); await A.click('#ev-start'); await go(A, 'think-intro');

        // ④ 우리 팀 물음: 바꿀 것 고르기 화면에는 없고, 고른 뒤 조건·결과 화면 위에
        await show(A, 't1-var');
        await A.click('.ev-choice[data-k="water"]'); await A.waitForSelector('[data-guess="t1"]');
        assert.equal(await A.locator('.ev-teamq').count(), 0, '고르는 화면에는 물음 줄 없음');
        assert.match(await A.getAttribute('[data-guess="t1"] .ev-why-in', 'placeholder'), /물이 많으면/, '예측 까닭 보기 글도 물의 양 팀용');
        await A.click('[data-guess="t1"] [data-dir="up"]');
        await show(A, 't1-cond');
        assert.match(await A.textContent('.ev-teamq'), /우리 팀 물음 · 물을 많이 넣으면 뚜껑이 열리는 시간은 어떻게 될까\?/);

        // ① 한 가지 값(10 mL)으로만 3번 → 정리 문장 '아직 말할 수 없어요', 결과 고르기 없음
        await A.evaluate(() => { const s = window.__filmRocket.state(); s.t1.trials = [11, 12, 13].map(y => ({ value: 10, y, predict: 10, method: 'stopwatch' })); s.last = s.t1.trials[2]; });
        await show(A, 'end-sentence');
        const box1 = A.locator('.ev-concl[data-concl="t1"]');
        assert.match(await box1.locator('.ev-notyet').textContent(), /아직 말할 수 없어요 — 값을 하나 바꿔 재야 알 수 있어요/);
        assert.equal(await box1.locator('[data-dir]').count(), 0, '결과 고르기 없음');
        assert.equal(await box1.locator('[data-why]').count(), 0, '까닭 고르기도 없음');
        assert.match(await box1.locator('.ev-evidence').textContent(), /물의 양을\(를\) 10 mL 로 했더니 평균 12초/);
        assert.equal(await box1.locator('[data-go="t1-again"]').count(), 1, '바꿔서 재러 가기');

        // ③ 값을 바꿔 재기(15 mL 3번, 겹침 없음) → 가족 체험형은 그래프 없이 결과 비교 표·'흔들림보다 큰가요?'·핵심 개념 연결
        await A.evaluate(() => { const s = window.__filmRocket.state(); s.t1.trials = s.t1.trials.concat([15, 16, 17].map(y => ({ value: 15, y, predict: 12, method: 'stopwatch' }))); });
        await show(A, 't1-graph');
        assert.match(await A.textContent('.ev-teamq'), /우리 팀 물음/, '결과 비교 화면에도 물음 줄');
        assert.equal(await A.locator('#ev-chart').count(), 0, '가족 체험형은 그래프 캔버스 없음');
        assert.match(await A.textContent('.ev-concept-link'), /압력[\s\S]*일정한 넓이에 작용하는 힘/);
        assert.match(await A.textContent('.ev-spread'), /차이가 흔들림보다 큰가요\?.*겹치지 않아요/);
        assert.match(await A.textContent('#ev-mini'), /11\.0초~13\.0초|11초~13초/);
        assert.match(await A.textContent('#ev-mini'), /15\.0초~17\.0초|15초~17초/);
        // 겹치면 '말하기 어려워요'
        await A.evaluate(() => { const s = window.__filmRocket.state(); s.t1.trials.push({ value: 15, y: 12, predict: 12, method: 'stopwatch' }); });
        await show(A, 't1-graph');
        assert.equal(await A.getAttribute('.ev-spread', 'data-spread'), 'overlap');
        assert.match(await A.textContent('.ev-spread'), /차이가 있다고 말하기 어려워요/);

        // ① 변인별 왜냐하면 보기 + ② 우리 숫자
        await show(A, 'end-sentence');
        assert.match(await box1.locator('.ev-evidence').textContent(), /물의 양을\(를\) 10 mL → 15 mL 로 바꿨더니 평균 12초 → 15초/);
        assert.match(await box1.locator('.ev-teamq').textContent(), /물을 많이 넣으면/);
        const why = await box1.locator('[data-why]').allTextContents();
        assert.ok(why.some(t => /빈 공간/.test(t)), '물의 양 팀용 보기: ' + why.join(' / '));
        assert.ok(!why.some(t => /따뜻|조각/.test(t)), '잠긴 변인 이야기 없음');
        await box1.locator('[data-dir="up"]').click();
        await box1.locator('[data-why]').first().click();
        assert.equal(await A.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px');

        // ① 2차시: 날개 팀 결과 안내는 날개만, 예측 까닭 보기 글도 2차시 것
        await show(A, 't2-var');
        await A.click('.ev-choice[data-k="fins"]'); await A.waitForSelector('[data-guess="t2"]');
        const ph = await A.getAttribute('[data-guess="t2"] .ev-why-in', 'placeholder');
        assert.match(ph, /날개/); assert.doesNotMatch(ph, /따뜻|거품/, '2차시 보기 글');
        await A.evaluate(() => { const s = window.__filmRocket.state(); s.t2.trials = [{ value: 3, pct: 60, method: 'film' }]; s.last2 = s.t2.trials[0]; });
        await show(A, 't2-result');
        const hint = await A.locator('.ev-screen .ev-card p').first().textContent();   // 아래 줄은 운영계획서의 설계 정의 (그대로)
        assert.match(hint, /날개 수 값을 바꿔서 다시 쏘아 볼까요/);
        assert.doesNotMatch(hint, /무게|물·발포비타민/, '잠긴 조건을 권하지 않음');
        assert.match(await A.textContent('.ev-teamq'), /날개 수를 바꾸면/);

        // ② 요약 → 교사 결과판 💬 (진행 화면·크게 보기)
        await A.evaluate(() => window.__filmRocket.sendNow());
        await A.waitForFunction(() => /선생님께 보냄/.test(document.getElementById('ev-sync').textContent), null, { timeout: 15000 });
        const sm = app.items('rocket')[0].summary;
        assert.equal(sm['1차시 증거'], '물의 양 10 mL→15 mL: 12초→15초');
        assert.equal(sm['1차시 결과'], '길어짐'); assert.match(sm['1차시 까닭'], /빈 공간/);
        assert.equal(sm['2차시 결과'], '아직 말할 수 없음', '2차시는 한 가지 값');
        assert.ok(Object.keys(sm).length <= 20);
        const T = await ctx({ viewport: { width: 1920, height: 1080 } }, 'T', true);
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=run');
        await T.waitForFunction(() => /🔧 물의 양 10 mL→15 mL: 12초→15초/.test((document.getElementById('board') || {}).textContent || ''), null, { timeout: 20000 });
        const talk = await T.textContent('#board .ct-talk');
        assert.match(talk, /예측 길어짐 → 결과 길어짐 · 왜냐하면 통 안 빈 공간/);
        assert.match(talk, /2차시: 🔧 날개 수 3장: 60% · 결과 아직 말할 수 없음/);
        await T.click('#btnBoardBig');
        assert.match(await T.textContent('#boardBigBody'), /💬 생각/, '크게 보기에도 💬');
        assert.match(await T.textContent('#boardBigBody .ct-talk'), /🔧 물의 양/);
        assert.match(await T.textContent('#boardBigBody'), /별빛가족/, '팀 이름은 그대로');
        // 4K 프로젝터에서 크게 보기 표가 가로로 넘치지 않음
        await T.setViewportSize({ width: 3840, height: 2160 });
        assert.ok(await T.evaluate(() => { const b = document.getElementById('boardBig'); return b.scrollWidth <= b.clientWidth + 1; }), '4K 크게 보기 가로 넘침 없음');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
