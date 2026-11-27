// 가족 체험형(필름통 로켓): 그래프 제거(① vs ② 평균 비교 표 + 핵심 개념 연결) + 앞 화면 풀이 시 폰에 📘 힘·가속도·압력 정의 및 정리 '처음 생각 → 지금 생각' 복원
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('가족 체험형 로켓: 설명 장에 그래프 안내 없음 + 들어가기 3개념 정리 장 확인', () => {
    // Chart.js 를 불러오지 않는지는 아래 화면 시험이 실제 요청으로 확인 (2026-11-27 글자 확인을 옮김)
    const rocketSlides = fs.readFileSync(path.join(REPO, 'js/lesson-content/rocket.js'), 'utf8');
    const CC = require('../js/class-cloud.js');
    const vm = require('node:vm');
    const { LessonContent } = require('../js/lesson-slides.js');
    const box = { LessonContent }; box.window = box;
    vm.runInNewContext(rocketSlides, box);
    const think = LessonContent.get('rocket').stages.think;
    // 불러온 설명 장 전부(제목·본문·물음·풀이·선생님용)에 그래프 안내가 없음
    const allSlides = Object.values(LessonContent.get('rocket').stages).flat();
    assert.ok(allSlides.length > 20);
    const withGraph = allSlides.filter(sl => /그래프/.test([sl.title, sl.body, sl.ask, sl.reveal, sl.note].join(' '))).map(sl => sl.title);
    assert.deepEqual(withGraph, [], '발표 설명 장에서 그래프 안내 제거');
    assert.equal(CC.EXPS.rocket.steps.think, '들어가기', '1단계 이름은 들어가기');
    assert.equal(think[1].title, '폰에서 이렇게 해요', '안내 장이 처음 생각 물음 앞에 위치');
    assert.equal(think[2].key, 'force');
    assert.equal(think[3].key, 'accel');
    assert.equal(think[4].key, 'pressure');
    const sum = think[5];
    assert.equal(sum.kind, 'concept');
    assert.match(sum.title, /힘 · 가속도 · 압력/);
    assert.match(sum.body, /쉬운 말[\s\S]*운동 상태[\s\S]*속도가[\s\S]*일정한/);
});

test('가족 체험형 로켓: 풀이 시 폰에 힘·가속도·압력 정의 표시 + 정리 처음→지금 비교 + 결과 비교 표(그래프·Chart.js 없음)', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [], chartReqs = [];
    const ctx = async (opt, name, teacher) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 2 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { if (/chart/i.test(r.request().url())) chartReqs.push(r.request().url()); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : '' }); });
        await c.route(/gstatic/, r => r.abort());
        await c.addInitScript(t => { if (t) localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); }, !!teacher);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const go = (pg, id) => pg.waitForSelector('#ev-app[data-screen="' + id + '"]', { timeout: 15000 });
    try {
        const c = await app.post({ action: 'createClass', ban: 1, mode: 'team', nTeams: 4, exp: 'rocket', stage: 4 });
        const doc = () => app.db.docs.get('labClasses/' + c.space);
        // 생각 열기: 힘 → 가속도 → 압력
        Object.assign(doc(), { lesson: { on: true, stage: 'think', i: 1, key: 'force', reveal: false, mode: 'phone' }, lessonOpen: [] });
        const A = await ctx(devices['iPhone 13'], 'A');
        await A.goto(ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space);
        await go(A, 'enter'); await A.fill('#ev-name', '과학가족'); await A.click('#ev-start');
        await go(A, 'think-force');
        await A.click('.ev-choice[data-k="have"]'); await go(A, 'sent');
        // 풀이 전: 정의 숨김
        assert.equal(await A.locator('.ev-sent-def').count(), 0, '풀이 전에는 정의 안 보임');
        // 교사가 '힘' 풀이를 엶 → 폰에 힘의 과학적 정의 표시
        Object.assign(doc(), { lesson: { on: true, stage: 'think', i: 1, key: 'force', reveal: true, mode: 'look' }, lessonOpen: ['force'] });
        await A.waitForSelector('.ev-sent-def .ev-def', { state: 'visible', timeout: 15000 });
        assert.match(await A.textContent('.ev-sent-def'), /힘의 과학적 정의[\s\S]*운동 상태를 바꾸는 원인/);

        // 가속도·압력도 풀이 시 정의 표시
        for (const [idx, key, pick, expectRe] of [
            [2, 'accel', 'fast', /가속도의 과학적 정의[\s\S]*속도가 변하는 정도/],
            [3, 'pressure', 'push', /압력의 과학적 정의[\s\S]*일정한 넓이에 작용하는 힘/]
        ]) {
            Object.assign(doc(), { lesson: { on: true, stage: 'think', i: idx, key, reveal: false, mode: 'phone' } });
            await go(A, 'think-' + key);
            await A.click('.ev-choice[data-k="' + pick + '"]'); await go(A, 'sent');
            assert.equal(await A.locator('.ev-sent-def').count(), 0, key + ' 풀이 전 정의 숨김');
            doc().lessonOpen.push(key);
            Object.assign(doc(), { lesson: { on: true, stage: 'think', i: idx, key, reveal: true, mode: 'look' } });
            await A.waitForSelector('.ev-sent-def .ev-def', { state: 'visible', timeout: 15000 });
            assert.match(await A.textContent('.ev-sent-def'), expectRe);
        }

        // 정리: 처음 생각, 지금 생각(end-think) → 3문제 다시 풀기 → 풀이 전엔 sent, 풀이 열면 end-compare(힘·가속도·압력 정의 3종 모두 보임)
        Object.assign(doc(), { lesson: { on: true, stage: 'end', i: 0, key: 'end-think', reveal: false, mode: 'phone' } });
        await go(A, 'end-force'); await A.click('.ev-choice[data-k="ok"]');
        await go(A, 'end-accel'); await A.click('.ev-choice[data-k="ok"]');
        await go(A, 'end-pressure'); await A.click('.ev-choice[data-k="ok"]');
        await go(A, 'sent');
        assert.match(await A.textContent('.ev-screen'), /처음 생각 → 지금 생각 비교가 나와요/);
        doc().lessonOpen.push('end-think');
        Object.assign(doc(), { lesson: { on: true, stage: 'end', i: 0, key: 'end-think', reveal: true, mode: 'look' } });
        await go(A, 'end-compare');
        const cmpTxt = await A.textContent('.ev-screen');
        assert.match(cmpTxt, /힘[\s\S]*운동 상태를 바꾸는 원인/);
        assert.match(cmpTxt, /가속도[\s\S]*속도가 변하는 정도/);
        assert.match(cmpTxt, /압력[\s\S]*일정한 넓이에 작용하는 힘/);
        assert.equal(await A.locator('.ev-cmp.spark').count(), 3, '세 개념 모두 ✨ 바뀐 생각');
        const defsVisible = await A.evaluate(() => [...document.querySelectorAll('.ev-cmp [data-lesson-answer]')].every(e => e.offsetParent && getComputedStyle(e).visibility === 'visible'));
        assert.equal(defsVisible, true, '정리 비교 화면에서 3개 정의 모두 실제로 보임');
        assert.equal(await A.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px 가로 스크롤 없음');

        // 1차시·2차시 결과 비교 화면: 그래프(<canvas>) 없고 ① vs ② 표 + 핵심 개념 연결
        Object.assign(doc(), { lesson: { on: false, stage: 't1', i: 0, key: '', reveal: false, mode: 'look' } });
        await A.waitForFunction(() => !document.documentElement.classList.contains('ev-following'), null, { timeout: 15000 });
        await A.evaluate(() => {
            const s = window.__filmRocket.state();
            s.t1.changed = 'water'; s.t1.plan = [10, 15]; s.t1.trials = [{ value: 10, y: 12 }, { value: 10, y: 13 }, { value: 15, y: 8 }, { value: 15, y: 9 }];
            s.t2.changed = 'mass'; s.t2.plan = [0, 2]; s.t2.trials = [{ value: 0, pct: 120 }, { value: 0, pct: 115 }, { value: 2, pct: 75 }, { value: 2, pct: 80 }];
            window.__filmRocket.show('t1-graph');
        });
        await go(A, 't1-graph');
        assert.equal(await A.locator('#ev-chart').count(), 0, '1차시 그래프 캔버스 없음');
        assert.match(await A.textContent('.ev-screen'), /결과|비교[\s\S]*10 mL[\s\S]*15 mL[\s\S]*오늘의 핵심 개념 · 압력/);
        await A.evaluate(() => window.__filmRocket.show('t2-graph'));
        await go(A, 't2-graph');
        assert.equal(await A.locator('#ev-chart').count(), 0, '2차시 그래프 캔버스 없음');
        assert.match(await A.textContent('.ev-screen'), /0개[\s\S]*2개[\s\S]*오늘의 핵심 개념 · 힘과 가속도/);
        // 그래프 도구(Chart.js)를 아예 받지 않음
        assert.deepEqual(chartReqs, [], 'Chart.js 요청 없음');
        assert.equal(await A.evaluate(() => typeof window.Chart), 'undefined');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
