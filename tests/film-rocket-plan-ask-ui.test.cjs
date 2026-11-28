// 필름통 로켓 분량 조절 (2026-11-27 선생님 "분량이 너무 많은거 같아" → 27장 → 21장, "학생이 로켓을 만드는 과정도",
//  "질문 추가"(계획 장 🔮 물음을 폰 응답으로), "직관적이지 않음"('이렇게 재요' → 그림 흐름))
//  ① 장 수·80자 기준·그림 흐름 장
//  ② 1차시 '우리 팀 실험 계획 🔮' 장: 폰은 변인 통제 퀴즈 → 바꿀 것·① → ②·🔮 예측·까닭 → ✅ 보냈어요, 프로젝터에 예측 수·막대·팀별 까닭(정답 표시 없음)
//     풀이를 열면 변인 통제 퀴즈 ⭕ 도 열림(opens), 측정 장에서는 예측을 다시 묻지 않음
//  ③ 2차시 🛠 만들기 장: 네 단계 체크 → '다 만들었어요' → 프로젝터 '다 만든 팀 N / M'
//  ④ 2차시 '로켓은 왜 솟고, 무거우면?' 장: 폰은 작용 반작용 → 질량 퀴즈 차례로, 프로젝터 두 칸
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';
const SHOTS = process.env.PLAN_SHOTS || '';

function rocketDef() {
    const { LessonContent } = require('../js/lesson-slides.js');
    const box = { LessonContent }; box.window = box;
    vm.runInNewContext(fs.readFileSync(path.join(REPO, 'js', 'lesson-content', 'rocket.js'), 'utf8'), box);
    return LessonContent.get('rocket');
}

test('로켓 설명 장 분량: 21장 안팎, 한 장 글 80자 안(쉬운 말·작은 줄·선생님용·그림 빼고), 이렇게 재요는 측정 장 안 그림 흐름', () => {
    const def = rocketDef(), st = def.stages;
    assert.equal(Object.keys(st).join(','), 'think,t1,t2,end', '단계 키 그대로');
    assert.equal(Object.keys(st).map(k => st[k].length).join(','), '5,6,7,3');
    const all = Object.values(st).flat();
    const text = h => String(h || '').replace(/<p class="ls-(easy|aside)">[\s\S]*?<\/p>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').length;
    const over = all.filter(s => !s.summary).map(s => [s.title, text(s.body) + text(s.ask), text(s.reveal)]).filter(x => x[1] > 80 || x[2] > 80);
    assert.deepEqual(over, [], '80자 넘는 장');
    assert.equal(all.filter(s => s.summary).length, 1, '정리 표 한 장만 예외');
    assert.ok(!all.some(s => /^이렇게 (찍고 )?재요$/.test(s.title)), "'이렇게 재요' 장은 측정 장 안으로");
    for (const k of ['do-t1', 'do-t2', 'build']) {
        const s = all.find(x => x.key === k);
        assert.ok(Array.isArray(s.flow) && s.flow.length >= 1 && s.flow.every(x => /^<svg/.test(x.img)), k + ' 그림 흐름');
        assert.doesNotMatch(s.body || '', /<ol|<li/, k + ' 글 목록 없음');
    }
    // 같은 것을 두 번 묻지 않기: 🔮 예측은 계획 장에서만, 측정 장에는 예측 글 없음
    assert.ok(!/예측/.test(all.find(x => x.key === 'do-t1').body + (all.find(x => x.key === 'do-t1').ask || '')));
    assert.equal(JSON.stringify(all.filter(x => x.opens).map(x => [x.key, x.opens])), JSON.stringify([['plan-t1', ['control']], ['action', ['mass']]]));
});

test('로켓 계획 🔮·🛠 만들기·쏘는 힘+무게 응답 장: 폰(iPhone 13) → 프로젝터 모음', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
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
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : '' }));
        await c.route(/gstatic/, r => r.abort());
        await c.addInitScript(t => { if (t) localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); }, !!teacher);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const go = (pg, id, t) => pg.waitForSelector('#ev-app[data-screen="' + id + '"]', { timeout: t || 15000 });
    const title = T => T.evaluate(() => (document.querySelector('#pSlides .ls-title') || {}).textContent || '');
    const toSlide = async (T, re) => { for (let k = 0; k < 25 && !re.test(await title(T)); k++) { await T.keyboard.press('ArrowRight'); await T.waitForTimeout(150); } assert.match(await title(T), re); };
    const answers = T => T.evaluate(() => (document.querySelector('#pSlides .ls-answers') || {}).textContent || '');
    try {
        const c = await app.post({ action: 'createClass', ban: 2, mode: 'team', nTeams: 3, exp: 'rocket', stage: 2 });
        const famUrl = ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space;
        const A = await ctx(devices['iPhone 13'], 'A'), B = await ctx(devices['iPhone 13'], 'B');
        for (const [P, name] of [[A, '별빛가족'], [B, '달님가족']]) { await P.goto(famUrl); await go(P, 'enter'); await P.fill('#ev-name', name); await P.click('#ev-start'); await go(P, 'think-intro'); }
        const T = await ctx({ viewport: { width: 1920, height: 1080 } }, 'T', true);
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
        await T.waitForSelector('#pSlides .ls-title');

        // ---- ② 1차시 '우리 팀 실험 계획 🔮' ----
        await toSlide(T, /우리 팀 실험 계획/);
        assert.match(await T.textContent('#pSlides .ls-slide'), /① → ② 로 바꾸면 시간이 길어질까요, 짧아질까요\? 왜\?/);
        // 폰: 먼저 변인 통제 퀴즈 (팀 점수), 그다음 바꿀 것·① → ②·🔮 예측
        // (가상 수업 5차 중 3: 풀이가 열린 채 넘어간 gas 퀴즈를 먼저 한 번)
        for (const P of [A, B]) { await go(P, 'q-gas'); await P.click('.ev-choice[data-k="ok"]'); }
        for (const P of [A, B]) await go(P, 'q-control');
        assert.equal(await A.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px');
        await A.click('.ev-choice[data-k="ok"]'); await go(A, 't1-var');
        assert.equal(await A.isVisible('.ev-ok'), false, '풀이 전에는 ⭕ 안 보임');
        await A.click('.ev-choice[data-k="temp"]');
        await A.waitForSelector('[data-guess]');
        assert.equal(await A.isDisabled('#ev-plan-send'), true, '예측을 골라야 보내기');
        await A.click('[data-guess] [data-dir="down"]');
        await A.fill('.ev-why-in', '따뜻하면 빨리 녹아서'); await A.dispatchEvent('.ev-why-in', 'change');
        assert.equal(await A.locator('.ev-screen .ev-nav:not(.ev-follow-only)').evaluateAll(els => els.filter(e => e.offsetParent).length), 0, '응답 장에서는 다음 단추 흐름 없음');
        assert.equal(await A.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '계획 화면 375px');
        if (SHOTS) await A.screenshot({ path: path.join(SHOTS, 'phone-plan-t1.png') });
        await A.click('#ev-plan-send'); await go(A, 'sent');
        assert.match(await A.textContent('.ev-sentlist'), /✅ 보냈어요: 계획 · 물의 온도 .*→.* · 🔮 짧아질 것 같아요/);
        await B.click('.ev-choice[data-k="ok"]'); await go(B, 't1-var');
        await B.click('.ev-choice[data-k="water"]'); await B.waitForSelector('[data-guess]');
        await B.click('[data-guess] [data-dir="up"]'); await B.click('#ev-plan-send'); await go(B, 'sent');
        for (const P of [A, B]) await P.evaluate(() => window.__filmRocket.sendNow());
        // 프로젝터: 예측 칸마다 팀 수·막대, 팀마다 바꾼 것 ① → ② · 예측 · 까닭 (정답 ✅ 없음)
        await T.waitForFunction(() => /답한 팀 2 \/ 2/.test((document.querySelector('#pSlides .ls-answers') || {}).textContent || ''), null, { timeout: 25000 });
        const ans = await answers(T);
        assert.match(ans, /별빛가족 물의 온도 [^·]+→[^·]+ · 짧아질 것 같아요 · 왜냐하면 따뜻하면 빨리 녹아서/);
        assert.match(ans, /달님가족 물의 양 [^·]+→[^·]+ · 길어질 것 같아요/);
        // 바꿀 것별 묶음: 고른 변인마다 예측 칸 수·막대
        const grp = await T.$$eval('#pSlides .ls-ans-g', els => els.map(g => [g.querySelector('.ls-ans-title').textContent, [...g.querySelectorAll('.ls-bar')].map(b => b.querySelector('.ls-bar-n').textContent).join(',')]));
        assert.deepEqual(grp, [['물의 양 · 1팀', '0,1,0'], ['물의 온도 · 1팀', '1,0,0']]);
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'projector-plan-t1.png') });
        // 풀이 열기 → 변인 통제 퀴즈 ⭕ 도 열림 (opens), 프로젝터에 정답 ✅ 없음 (예측에는 정답이 없음)
        await T.keyboard.press('ArrowRight');
        await T.waitForFunction(() => document.querySelector('#pSlides .ls-slide').dataset.revealed === '1');
        assert.equal(await T.locator('#pSlides .ls-bar.ok').count(), 0);
        await T.waitForTimeout(1500);
        assert.deepEqual(['plan-t1', 'control'].filter(k => (app.db.docs.get('labClasses/' + c.space).lessonOpen || []).includes(k)), ['plan-t1', 'control'], '풀이를 열면 변인 통제 퀴즈 key 도');
        // 측정 장 → 안전 확인 다음은 바로 조건 (계획·예측 다시 안 물음)
        await toSlide(T, /이제 폰으로 재요/);
        await go(A, 't1-safe');
        for (const k of ['goggle', 'face', 'away', 'wait']) await A.check('[data-safe="' + k + '"]');
        await A.locator('.ev-screen .ev-next[data-go]').last().click();
        await go(A, 't1-cond');
        assert.equal(await A.evaluate(() => window.__filmRocket.state().t1.guess.dir), 'down', '예측은 계획 장에서 고른 그대로');

        // ---- ③ 2차시 🛠 만들기 ----
        // 1차시 마지막 장 다음 = '2차시를 열까요?' (#209) → Enter → 2차시 첫 장(🛠 만들기)
        for (let k = 0; k < 20 && !(await T.isVisible('#pAsk')); k++) { await T.keyboard.press('ArrowRight'); await T.waitForTimeout(150); }
        assert.match(await T.textContent('#pAskText'), /2차시/);
        await T.keyboard.press('Enter');
        await T.waitForFunction(() => /로켓을 만들어요/.test((document.querySelector('#pSlides .ls-title') || {}).textContent || ''), null, { timeout: 20000 });
        assert.equal(app.db.docs.get('labClasses/' + c.space).stage, 3);
        assert.equal(await T.locator('#pSlides .ls-flow .ls-step').count(), 4, '만들기 그림 4칸');
        await go(A, 't2-build'); await go(B, 't2-build');
        await A.waitForTimeout(500);   // 측정 화면(조건)에서 넘어옴 — 측정 중이 아님
        assert.equal(await A.isDisabled('#ev-build-done'), true, '네 단계를 다 체크해야');
        for (const k of ['body', 'fins', 'nose', 'clay']) await A.click('[data-build="' + k + '"]');
        assert.equal(await A.isDisabled('#ev-build-done'), false);
        if (SHOTS) await A.screenshot({ path: path.join(SHOTS, 'phone-build.png') });
        await A.click('#ev-build-done'); await go(A, 'sent');
        await A.evaluate(() => window.__filmRocket.sendNow());
        await T.waitForFunction(() => /다 만든 팀 1 \/ 2/.test((document.querySelector('#pSlides .ls-answers') || {}).textContent || ''), null, { timeout: 25000 });
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'projector-build.png') });

        // ---- ④ 쏘는 힘 + 무게: 퀴즈 둘을 차례로, 프로젝터 두 칸 ----
        await toSlide(T, /로켓은 왜 솟고/);
        await go(A, 'q-action'); await A.click('.ev-choice[data-k="ok"]');
        await go(A, 'q-mass'); await A.click('.ev-choice[data-k="ok"]');
        await go(A, 'sent');
        await A.evaluate(() => window.__filmRocket.sendNow());
        await T.waitForFunction(() => /답한 팀 1 \/ 2/.test((document.querySelector('#pSlides .ls-answers') || {}).textContent || ''), null, { timeout: 25000 });
        assert.match(await answers(T), /작용 반작용[\s\S]*질량과 가속도/, '두 퀴즈 칸');
        await T.keyboard.press('ArrowRight');
        await T.waitForTimeout(1500);
        assert.deepEqual(['action', 'mass'].filter(k => (app.db.docs.get('labClasses/' + c.space).lessonOpen || []).includes(k)), ['action', 'mass']);
        assert.equal(await A.evaluate(() => window.__filmRocket.state().quiz.mass.tries), 1, '점수 계산은 그대로');

        // ---- 2차시 계획 🔮 ----
        await toSlide(T, /우리 팀 실험 계획/);
        await go(A, 't2-var');
        await A.click('.ev-choice[data-k="mass"]'); await A.waitForSelector('[data-guess]');
        await A.click('[data-guess] [data-dir="down"]'); await A.click('#ev-plan-send'); await go(A, 'sent');
        await A.evaluate(() => window.__filmRocket.sendNow());
        await T.waitForFunction(() => /답한 팀 1 \/ 2/.test((document.querySelector('#pSlides .ls-answers') || {}).textContent || ''), null, { timeout: 25000 });
        assert.match(await answers(T), /별빛가족 몸체 무게 [^·]+→[^·]+ · 낮아질 것 같아요/);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); api.close(); stat.close();
    }
});
