// 탄소 양자점 — 설명 화면 답 가리기 (2026-11-21, 공통 부품 js/class-share.js applyLesson 위에서 양자점 key 7개 확인)
// Playwright, 가짜 저장소(tests/fake-lab-store.cjs)
//  ① 교사 🎬 발표 보기로 2 이론 설명을 띄우면 노트북·📱 폰(수업 QR) 모두 '👀 앞 화면을 봐요', key 8개 모두 '🔒 선생님 설명 뒤에 열려요'
//  ② 교사가 상자 장 풀이를 열면(→ 키) 그 답만 열림, 이론의 나머지 장도 → 키로 차례로 열림
//  ③ 1 목적·3 준비물·5 데이터·6 결과 장의 풀이도 열면 노트북·폰 모두 7개가 열림 (가열 시간 방향 qd-heat-dir 은 6 결과 장)
//  ④ 설명 화면을 안 쓴 수업·수업 없이 연 화면은 처음부터 다 보임
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadLabStore } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://lab.test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg viewBox=\\"0 0 10 10\\"></svg>"}}};';
const KEYS = ['qd-measure', 'qd-box', 'qd-energy', 'qd-stokes', 'qd-auto', 'qd-microwave', 'qd-hue', 'qd-heat-dir'];

async function newPage(browser, app, opt, teacher) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opt || {}));
    await ctx.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'script.google.com') {
            const req = route.request();
            const body = req.method() === 'POST' ? await app.post(req.postData() || '{}') : await app.get(Object.fromEntries(u.searchParams));
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
        }
        if (/cdn\.jsdelivr|cdnjs/.test(u.hostname)) return route.fulfill({ contentType: 'application/javascript', body: /qrcode/.test(u.pathname) ? QR : '' });
        if (u.origin !== ORIGIN) return route.abort();
        const file = path.join(ROOT, decodeURIComponent(u.pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await ctx.addInitScript(t => {
        window.LAB_STORE_FAKE_URL = 'https://script.google.com/macros/s/FAKE_LAB_STORE/exec';
        try { localStorage.setItem('lab-flow', 'report'); if (t) localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); } catch (e) { /* 무시 */ }
    }, !!teacher);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    return { page, errors };
}
// key → 가려졌나 (true/false, 없으면 null)
const hiddenMap = pg => pg.evaluate(keys => Object.fromEntries(keys.map(k => {
    const els = [...document.querySelectorAll('[data-lesson-answer="' + k + '"]')];
    return [k, els.length ? els.every(e => e.classList.contains('cs-ans-hide')) : null];
})), KEYS);
const expectHidden = (map, hiddenKeys, who) => KEYS.forEach(k => assert.equal(map[k], hiddenKeys.includes(k), who + ' ' + k + (hiddenKeys.includes(k) ? ' 가림' : ' 열림')));
const waitMap = (pg, hiddenKeys) => pg.waitForFunction(([keys, hid]) => keys.every(k => {
    const els = [...document.querySelectorAll('[data-lesson-answer="' + k + '"]')];
    return els.length && els.every(e => e.classList.contains('cs-ans-hide') === hid.includes(k));
}), [KEYS, hiddenKeys], { timeout: 15000 });
const slide = pg => pg.evaluate(() => { const s = document.querySelector('#presentPane.ls-on #pSlides .ls-slide'); return s ? { title: s.querySelector('.ls-title').textContent, rev: s.dataset.revealed } : null; });

test('양자점 설명 화면: key 8개 가림 → 교사 풀이 열기 → 열림 (노트북·📱 폰)', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch();
    try {
        const cls = await app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 2 });
        assert.equal(cls.ok, true, cls.error);
        // 학생 노트북: 수업 참여
        const L = await newPage(browser, app);
        await L.page.goto(ORIGIN + '/projects/quantum-dot.html?c=' + cls.classCode + '&s=' + cls.space);
        await L.page.waitForSelector('#cs-cpick:not([hidden])');
        await L.page.selectOption('#cs-cjo', '1'); await L.page.selectOption('#cs-cnum', '1'); await L.page.click('#cs-cjoin');
        await L.page.waitForSelector('#cs-cjoined:not([hidden])');
        expectHidden(await hiddenMap(L.page), [], '설명 전 노트북');
        assert.equal(await L.page.evaluate(() => document.documentElement.classList.contains('cs-look')), false);

        // 📱 폰: 교사 수업 QR 로 같은 수업에 참여 (iPhone 13)
        const F = await newPage(browser, app, devices['iPhone 13']);
        await F.page.goto(ORIGIN + '/projects/quantum-dot.html?c=' + cls.classCode + '&s=' + cls.space);
        await F.page.waitForSelector('#cs-cpick:not([hidden])');
        await F.page.selectOption('#cs-cjo', '1'); await F.page.selectOption('#cs-cnum', '2'); await F.page.click('#cs-cjoin');
        await F.page.waitForSelector('#cs-cjoined:not([hidden])');
        expectHidden(await hiddenMap(F.page), [], '설명 전 폰');

        // 교사: 🎬 발표 보기 → 2 이론 설명 첫 장(상자) → 노트북·폰에 👀 띠, 7개 모두 가림
        const T = await newPage(browser, app, { viewport: { width: 1920, height: 1080 } }, true);
        await T.page.goto(ORIGIN + '/projects/class-teacher.html#class=' + cls.space + '&view=present');
        await T.page.waitForFunction(() => document.querySelector('#presentPane.ls-on .ls-slide'), null, { timeout: 20000 });
        assert.match((await slide(T.page)).title, /상자/);
        for (const P of [L, F]) {
            await P.page.waitForFunction(() => { const b = document.querySelector('.cs-look-band'); return b && !b.hidden; }, null, { timeout: 15000 });
            await waitMap(P.page, KEYS);
        }
        // 가린 자리는 🔒 안내만 (글은 안 보임)
        await L.page.click('nav.steps button[data-step="theory"]');
        const lock = await L.page.evaluate(() => { const e = document.querySelector('[data-lesson-answer="qd-box"]'); return { vis: getComputedStyle(e).visibility, after: getComputedStyle(e, '::after').content }; });
        assert.equal(lock.vis, 'hidden');
        assert.match(lock.after, /2\. 이론 설명 뒤에 열려요/);
        // 가린 자리마다 '언제 열리는지' (1 목적의 접힌 실험 목적 글도 가림)
        const when = await L.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-lesson-answer]')].map(e => [e.dataset.lessonAnswer, getComputedStyle(e, '::after').content])));
        assert.match(when['qd-measure'], /1\. 목적 설명 뒤에/);
        assert.match(when['qd-microwave'], /3\. 준비물 설명 뒤에/);
        assert.match(when['qd-hue'], /5\. 데이터 설명 뒤에/);
        assert.match(when['qd-heat-dir'], /6\. 결과 설명 뒤에/);
        assert.equal(await L.page.evaluate(() => document.querySelector('details.qd-purpose-more ol[data-lesson-answer="qd-measure"]').classList.contains('cs-ans-hide')), true, '접힌 실험 목적 글');

        // ② → 키: 상자 풀이 → qd-box 만 열림
        await T.page.keyboard.press('ArrowRight');
        assert.equal((await slide(T.page)).rev, '1');
        for (const P of [L, F]) await waitMap(P.page, KEYS.filter(k => k !== 'qd-box'));
        assert.equal(await L.page.evaluate(() => getComputedStyle(document.querySelector('[data-lesson-answer="qd-box"]')).visibility), 'visible');
        // 이론 나머지 장을 → 키로 끝까지 (풀이가 열릴 때마다 그 key 가 lessonOpen 에)
        for (let n = 0; n < 30; n++) {
            const s = await slide(T.page);
            const open = (app.db.docs.get('labClasses/' + cls.space).lessonOpen || []);
            if (['qd-box', 'qd-energy', 'qd-stokes', 'qd-auto'].every(k => open.includes(k))) break;
            if (!s) break;
            await T.page.keyboard.press('ArrowRight');
            await T.page.waitForTimeout(150);
        }
        const theoryKeys = ['qd-box', 'qd-energy', 'qd-stokes', 'qd-auto'];
        for (const P of [L, F]) await waitMap(P.page, KEYS.filter(k => !theoryKeys.includes(k)));

        // ③ 3 준비물·5 데이터·6 결과 장의 풀이 (발표 화면이 그 장에서 부르는 것과 같은 요청)
        for (const [stage, key] of [['purpose', 'qd-measure'], ['materials', 'qd-microwave'], ['data', 'qd-hue'], ['result', 'qd-heat-dir']]) {
            const r = await T.page.evaluate(([sp, st, k]) => ClassCloud.classLesson(sp, { on: true, stage: st, i: 0, key: k, reveal: true }, [k]), [cls.space, stage, key]);
            assert.equal(r.ok, true, r.error);
        }
        for (const P of [L, F]) await waitMap(P.page, []);
        assert.deepEqual([...app.db.docs.get('labClasses/' + cls.space).lessonOpen].sort(), [...KEYS].sort());
        // 열린 글: 가열 시간 경향(6 결과 뒤)·스토크스
        await L.page.click('nav.steps button[data-step="theory"]');
        assert.equal(await L.page.evaluate(() => [...document.querySelectorAll('[data-lesson-answer="qd-heat-dir"]')].every(e => getComputedStyle(e).visibility === 'visible')), true);
        // 발표 끝 → 띠 내려감, 열린 답은 그대로
        await T.page.click('#btnPExit');
        for (const P of [L, F]) {
            await P.page.waitForFunction(() => { const b = document.querySelector('.cs-look-band'); return !b || b.hidden; }, null, { timeout: 15000 });
            expectHidden(await hiddenMap(P.page), [], '발표 끝');
        }
        assert.equal(await L.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        assert.equal(await F.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '폰 375px 가로 스크롤 없음');
        assert.deepEqual(L.errors, []); assert.deepEqual(F.errors, []); assert.deepEqual(T.errors, []);
    } finally {
        await browser.close();
    }
});

test('양자점: 설명 화면을 안 쓴 수업·수업 없이 연 화면은 처음부터 다 보임', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch();
    try {
        const cls = await app.post({ action: 'createClass', ban: 3, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 7 });
        const L = await newPage(browser, app);
        await L.page.goto(ORIGIN + '/projects/quantum-dot.html?c=' + cls.classCode + '&s=' + cls.space);
        await L.page.waitForSelector('#cs-cpick:not([hidden])');
        await L.page.selectOption('#cs-cjo', '1'); await L.page.selectOption('#cs-cnum', '2'); await L.page.click('#cs-cjoin');
        await L.page.waitForSelector('#cs-cjoined:not([hidden])');
        await L.page.waitForTimeout(3500);
        expectHidden(await hiddenMap(L.page), [], '설명 안 쓴 수업');
        // 가설연역 수업: 가린 자리 글이 그 방법의 단계 이름
        const hd = await app.post({ action: 'createClass', ban: 4, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 7, flow: 'hd' });
        assert.equal(hd.ok, true, hd.error);
        const H = await newPage(browser, app);
        await H.page.goto(ORIGIN + '/projects/quantum-dot.html?c=' + hd.classCode + '&s=' + hd.space);
        await H.page.waitForSelector('#cs-cpick:not([hidden])');
        await H.page.selectOption('#cs-cjo', '1'); await H.page.selectOption('#cs-cnum', '1'); await H.page.click('#cs-cjoin');
        await H.page.waitForSelector('#cs-cjoined:not([hidden])');
        assert.equal((await app.post({ action: 'classLesson', space: hd.space, lesson: { on: true, stage: 'theory', i: 0, key: 'qd-box' }, open: [] })).ok, true);
        await waitMap(H.page, KEYS);
        const hdWhen = await H.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-lesson-answer]')].map(e => [e.dataset.lessonAnswer, getComputedStyle(e, '::after').content])));
        assert.match(hdWhen['qd-measure'], /① 문제 인식 설명 뒤에/);
        assert.match(hdWhen['qd-box'], /② 가설 설정 설명 뒤에/);
        assert.match(hdWhen['qd-microwave'], /③ 탐구 설계 설명 뒤에/);
        assert.match(hdWhen['qd-hue'], /④ 탐구 수행 설명 뒤에/);
        assert.match(hdWhen['qd-heat-dir'], /⑤ 자료 해석 설명 뒤에/);
        assert.deepEqual(H.errors, []);
        const S = await newPage(browser, app, devices['iPhone 13']);
        await S.page.goto(ORIGIN + '/projects/quantum-dot.html');
        await S.page.waitForTimeout(1500);
        expectHidden(await hiddenMap(S.page), [], '수업 없이');
        assert.deepEqual(L.errors, []); assert.deepEqual(S.errors, []);
    } finally {
        await browser.close();
    }
});
