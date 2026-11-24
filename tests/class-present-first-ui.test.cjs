// 교사 화면: 🎬 발표 보기가 수업 첫 화면 (2026-11-23 선생님 "교사 화면에 수업 내용에 대한 설명이 전혀 없어" → 고른 것 '발표 보기를 첫 화면으로'·'열면 설명부터')
//  ① 수업 카드 → 큰 QR → '다음 →' = 🎬 발표 보기, 가장 뒤에 연 단계의 설명 첫 장부터 (다시 카드로 들어와도 같음)
//  ② 진행 화면(📋)에서 '▶ 다음 단계 열기' → 발표 보기로 넘어가 그 단계 설명 첫 장, 수업 문서 lesson 도 그 장 (학생 폰 '👀')
//     '◀ 하나 되돌리기'·'모두 열기' 는 진행 화면 그대로
//  ③ 설명 내용이 없는 실험(말루스)은 발표 보기가 학생 화면부터, 단계 열기가 없는 실험(가속도계)은 예전처럼 진행 화면
//  ④ 발표 보기 위 띠 단추가 한 줄: 4K 3840×2160 배율 100·150·200% + 1280×720, 로켓·양자점
//  브라우저 뒤로 가기: 진행 화면 → 발표 보기 → 큰 QR → 목록 (발표 틀 주소 바꾸기가 기록에 쌓이지 않음)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const SHOTS = process.env.PRESENT_SHOTS || '';   // 화면 찍기 (PR 설명용): 폴더를 주면 그곳에 PNG

test('발표 보기가 수업 첫 화면: QR → 다음 = 설명 첫 장, 단계 열면 설명부터, 설명·단계 없는 실험은 예전대로, 띠 한 줄', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const ctx = async (opt, name) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' }); });
        await c.route(/gstatic/, r => r.abort());
        await c.addInitScript(() => { localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); });
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const doc = space => app.db.docs.get('labClasses/' + space);
    const openCard = async (T, space) => {
        if (!(await T.isVisible('#viewList'))) { await T.click('#btnToList'); }
        await T.waitForSelector('#classList .ct-cls');
        await T.click('#classList button[data-open="' + space + '"]'); await T.waitForSelector('#classOut:not([hidden])');
    };
    const slideTitle = T => T.textContent('#pSlides .ls-title');
    // 띠 단추가 한 줄인지 (모두 같은 줄 높이, 띠 밖으로 넘치지 않음)
    const barOneLine = T => T.evaluate(() => {
        const bs = [...document.querySelectorAll('#presentPane .ct-pbtns > button')].filter(b => b.offsetParent);
        const tops = bs.map(b => Math.round(b.getBoundingClientRect().top)), bar = document.querySelector('#presentPane .ct-pbar').getBoundingClientRect();
        return { one: Math.max(...tops) - Math.min(...tops) <= 2, inside: bs.every(b => b.getBoundingClientRect().right <= bar.right + 1), n: bs.length, sx: document.documentElement.scrollWidth - innerWidth, labels: bs.map(b => b.textContent.trim()) };
    });
    try {
        const rocket = await app.post({ action: 'createClass', ban: 3, mode: 'team', nTeams: 4, exp: 'rocket', stage: 1 });
        const qdot = await app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 1 });
        const malus = await app.post({ action: 'createClass', ban: 1, nStudents: 4, groupSize: 2, exp: 'malus', stage: 1 });
        const accel = await app.post({ action: 'createClass', ban: 4, nStudents: 4, groupSize: 2, exp: 'accel' });

        const T = await ctx({ viewport: { width: 1280, height: 720 } }, 'T');
        await T.goto(ROOT + 'projects/class-teacher.html');
        await T.waitForSelector('#classList .ct-cls');

        // ① 로켓: 카드 → 큰 QR → '다음 → 🎬 발표 보기' → 생각 열기 설명 첫 장
        await openCard(T, rocket.space);
        assert.match(await T.textContent('#btnToRun'), /다음 → 🎬 발표 보기/);
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'rocket-1-qr.png') });
        await T.click('#btnToRun');
        await T.waitForSelector('#presentPane:not([hidden])');
        assert.match(T.url(), new RegExp('#class=' + rocket.space + '&view=present$'));
        await T.waitForSelector('#pSlides .ls-slide');
        assert.match(await slideTitle(T), /오늘은 필름통 로켓을 쏘아 올려요/, '가장 뒤에 연 단계(생각 열기) 설명 첫 장');
        assert.equal(await T.isVisible('#runPane'), false, '진행 화면은 뒤에');
        assert.match(await T.textContent('#btnPExit'), /📋 진행 상황/);
        assert.deepEqual((await barOneLine(T)).one, true, '1280×720 띠 단추 한 줄');
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'rocket-2-present-first.png') });
        // 📋 진행 상황 팝업 → '▶ 다음 단계 열기' → 발표 보기가 1차시 설명 첫 장, 수업 문서 lesson 도 그 장
        await T.click('#btnPExit'); await T.waitForSelector('#runPop:not([hidden]) #stageCard:not([hidden])');
        assert.equal(await T.locator('#btnRunPopGo').count(), 0, '진행 화면으로 가기 단추 없음');
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'rocket-3-run.png') });
        await T.click('#btnStageNext');
        await T.waitForFunction(() => /뚜껑은 왜/.test((document.querySelector('#pSlides .ls-title') || {}).textContent || ''), null, { timeout: 15000 });
        for (let k = 0; k < 40 && !(doc(rocket.space).lesson && doc(rocket.space).lesson.stage === 't1'); k++) await T.waitForTimeout(100);
        assert.deepEqual([doc(rocket.space).stage, doc(rocket.space).lesson.on, doc(rocket.space).lesson.stage, doc(rocket.space).lesson.i], [2, true, 't1', 0], '학생 폰도 그 장 (👀)');
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'rocket-4-open-t1.png') });
        // '◀ 하나 되돌리기'·'모두 열기' 도 팝업 안에서 바로
        await T.click('#btnStagePrev');
        await T.waitForFunction(() => /까지 열었어요/.test(document.getElementById('stageMsg').textContent));
        await T.click('#btnStageAll');
        await T.waitForFunction(() => /모든 단계를 열었어요/.test(document.getElementById('stageMsg').textContent));
        await T.click('#btnRunPopClose');
        // 브라우저 뒤로 가기: 발표 보기 → 큰 QR → 목록 (발표 틀 주소는 기록에 쌓이지 않음)
        await T.goBack(); await T.waitForSelector('#classOut:not([hidden])');
        await T.goBack(); await T.waitForSelector('#viewList:not([hidden])');
        // 목록 → 다시 카드 → QR → 다음 = 발표 보기
        await openCard(T, rocket.space); await T.click('#btnToRun');
        await T.waitForSelector('#presentPane:not([hidden])'); await T.waitForSelector('#pSlides .ls-slide');
        assert.match(T.url(), /view=present/, '다시 들어와도 발표 보기부터');

        // ② 양자점: QR → 다음 = 1 목적 설명 첫 장 → 팝업에서 2 이론 열기 → 2 이론 설명 첫 장
        await T.click('#btnPExit'); await T.click('#btnRunPopList'); await T.waitForSelector('#viewList:not([hidden])');
        await openCard(T, qdot.space);
        assert.match(await T.textContent('#btnToRun'), /발표 보기/);
        await T.click('#btnToRun'); await T.waitForSelector('#presentPane:not([hidden])'); await T.waitForSelector('#pSlides .ls-slide');
        assert.match(await T.textContent('#pSlides .ls-kicker'), /1 목적/);
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'qdot-1-present-first.png') });
        await T.click('#btnPExit'); await T.waitForSelector('#runPop:not([hidden]) #stageCard:not([hidden])');
        await T.click('#rpTabs [data-rptab="teach"]');
        assert.match(await T.textContent('#lessonTeach'), /발표 보기\(설명 장\)부터 시작/, '선생님용 안내 글');
        await T.click('#btnStageNext');
        await T.waitForFunction(() => /2 이론/.test((document.querySelector('#pSlides .ls-kicker') || {}).textContent || ''), null, { timeout: 15000 });
        assert.equal(await T.evaluate(() => document.querySelector('#pSlides .ls-dots i.on') === document.querySelector('#pSlides .ls-dots i')), true, '그 단계 첫 장');
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'qdot-2-open-theory.png') });

        // ③ 설명 내용이 없는 실험(말루스): 발표 보기가 학생 화면부터
        await T.click('#btnRunPopList'); await T.waitForSelector('#viewList:not([hidden])');
        await openCard(T, malus.space);
        await T.click('#btnToRun'); await T.waitForSelector('#presentPane:not([hidden])');
        await T.waitForFunction(() => { const d = document.getElementById('presentFrame').contentDocument; return d && d.querySelector('nav.steps'); }, null, { timeout: 15000 });
        await T.waitForTimeout(400);
        assert.equal(await T.evaluate(() => document.getElementById('presentPane').classList.contains('ls-on')), false, '설명 없이 학생 화면');
        // 팝업에서 단계 열기
        await T.click('#btnPExit'); await T.waitForSelector('#runPop:not([hidden]) #stageCard:not([hidden])');
        await T.click('#btnStageNext');
        await T.waitForFunction(() => /까지 열었어요/.test(document.getElementById('stageMsg').textContent));
        await T.click('#btnRunPopList'); await T.waitForSelector('#viewList:not([hidden])');
        // 단계 열기가 없는 실험(가속도계): 예전처럼 진행 화면, 발표 보기 단추 없음
        await openCard(T, accel.space);
        assert.match(await T.textContent('#btnToRun'), /다음 → 진행 보기/);
        await T.click('#btnToRun'); await T.waitForSelector('#runPane:not([hidden])');
        assert.match(T.url(), /view=run/);
        assert.equal(await T.isVisible('#btnPresent'), false);

        // ④ 4K 3840×2160 배율 100·150·200% + 1280×720: 띠 단추 한 줄 (로켓·양자점)
        for (const [w, h, dsf] of [[3840, 2160, 1], [2560, 1440, 1.5], [1920, 1080, 2], [1280, 720, 1]]) {
            const P = await ctx({ viewport: { width: w, height: h }, deviceScaleFactor: dsf }, 'P' + w);
            for (const c of [rocket, qdot]) {
                await P.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
                await P.waitForSelector('#presentPane:not([hidden])'); await P.waitForSelector('#pSlides .ls-slide');
                await P.waitForTimeout(300);
                const r = await barOneLine(P);
                assert.ok(r.one && r.inside, w + '×' + h + ' ' + c.exp + ' 띠 단추 한 줄: ' + JSON.stringify(r));
                assert.equal(r.sx, 0, w + ' 가로 스크롤');
                if (SHOTS && dsf === 1 && w === 3840) await P.screenshot({ path: path.join(SHOTS, c.exp + '-4k.png') });
            }
            await P.context().close();
        }
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
