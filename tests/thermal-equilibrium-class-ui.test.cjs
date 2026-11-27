// 열평형 — 가상 수업 1차 뒤 고친 것 (2026-11-27, 묶음 A '답 먼저 보임 막기' · 묶음 C '회차 보내기')
// Playwright, 가짜 저장소(tests/fake-lab-store.cjs)
//  A ① 설명 화면을 쓴 수업: 1 목적 '🎯 실험 목적 보기'(닫힘)·2 이론 th-eq·th-loss 답 문장이 풀이 전에는 학생 노트북에 안 보임
//      → 교사 🎬 발표 보기에서 '오늘 알아낼 것' 풀이를 열면 실험 목적이 열리고, 이론 풀이를 열면 그 답 문장이 보임
//    ② 수업 없이 연 화면은 처음부터 다 보임(실험 목적은 접혀 있지만 가리지 않음), '우리 생각' 칸 안내에 변인 쓰기 예
//  C ③ 수업에서 회차 저장·CSV 불러오기 → 저절로 선생님께(교사 classStatus 에 그 조 제출), 회차 목록 '✅ 선생님께 보냄'
//    ④ 수업 없이 연 화면은 보내지 않음(보낸 상태 줄도 없음). 375px 가로 스크롤 없음·단추 44px
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadLabStore } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://lab.test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg viewBox=\\"0 0 10 10\\"></svg>"}}};';
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = (cfg && cfg.options) || { scales: { y: { title: {} } } }; } update() {} destroy() {} resize() {} };';
const ANS = {   // 가린 칸 밖에 있으면 안 되는 답 문장
    'th-eq': /높은 물체에서 낮은 물체로/,
    'th-loss': /주변 공기/
};

async function newPage(browser, app, opt, teacher) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opt || {}));
    await ctx.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'script.google.com') {
            const req = route.request();
            const body = req.method() === 'POST' ? await app.post(req.postData() || '{}') : await app.get(Object.fromEntries(u.searchParams));
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
        }
        if (/cdn\.jsdelivr|cdnjs/.test(u.hostname)) return route.fulfill({ contentType: 'application/javascript', body: /qrcode/.test(u.pathname) ? QR : /chart/i.test(u.pathname) ? CHART_STUB : '' });
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
async function join(P, cls, num) {
    await P.page.goto(ORIGIN + '/projects/thermal-equilibrium.html?c=' + cls.classCode + '&s=' + cls.space);
    await P.page.waitForSelector('#cs-cpick:not([hidden])');
    await P.page.selectOption('#cs-cjo', '1'); await P.page.selectOption('#cs-cnum', String(num)); await P.page.click('#cs-cjoin');
    await P.page.waitForSelector('#cs-cjoined:not([hidden])');
}
// 패널에서 가린 칸을 뺀 글 (학생 눈에 보이는 글)
const shownText = (pg, step) => pg.evaluate(st => {
    const panel = document.querySelector('.step-panel[data-step="' + st + '"]').cloneNode(true);
    panel.querySelectorAll('[data-lesson-answer].cs-ans-hide').forEach(e => e.remove());
    return panel.textContent;
}, step);
const isHidden = (pg, key) => pg.evaluate(k => { const els = [...document.querySelectorAll('[data-lesson-answer="' + k + '"]')]; return els.length ? els.every(e => e.classList.contains('cs-ans-hide')) : null; }, key);
const waitShown = (pg, key, hidden) => pg.waitForFunction(([k, h]) => { const els = [...document.querySelectorAll('[data-lesson-answer="' + k + '"]')]; return els.length && els.every(e => e.classList.contains('cs-ans-hide') === h); }, [key, hidden], { timeout: 15000 });
const slide = pg => pg.evaluate(() => { const s = document.querySelector('#presentPane.ls-on #pSlides .ls-slide'); return s ? { title: s.querySelector('.ls-title').textContent, rev: s.dataset.revealed } : null; });

test('열평형 A: 설명 화면을 쓴 수업에서 1 목적·2 이론 답 문장은 풀이 뒤에 보임', { skip: !chromium && 'playwright 없음', timeout: 180000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch();
    try {
        const cls = await app.post({ action: 'createClass', ban: 3, nStudents: 4, groupSize: 2, exp: 'thermal', stage: 1 });
        assert.equal(cls.ok, true, cls.error);
        const L = await newPage(browser, app);
        await join(L, cls, 1);
        // 실험 목적은 처음부터 펼쳐져 있지 않음
        assert.equal(await L.page.evaluate(() => document.querySelector('details.th-purpose').open), false, '실험 목적 접힘');

        // 교사 🎬 발표 보기: 1 목적 첫 장(먼저 보기) → 학생 노트북은 실험 목적이 가려짐
        const T = await newPage(browser, app, { viewport: { width: 1920, height: 1080 } }, true);
        await T.page.goto(ORIGIN + '/projects/class-teacher.html#class=' + cls.space + '&view=present');
        await T.page.waitForFunction(() => document.querySelector('#presentPane.ls-on .ls-slide'), null, { timeout: 20000 });
        assert.match((await slide(T.page)).title, /먼저 보기/);
        await waitShown(L.page, 'th-purpose', true);
        const lock = await L.page.evaluate(() => { const e = document.querySelector('details.th-purpose'); return { vis: getComputedStyle(e).visibility, after: getComputedStyle(e, '::after').content }; });
        assert.equal(lock.vis, 'hidden');
        assert.match(lock.after, /1\. 목적 설명 뒤에 열려요/);
        assert.doesNotMatch(await shownText(L.page, 'purpose'), /열의 이동 방향/, '풀이 전 목적 글 안 보임');
        // '우리 생각' 칸은 변인을 쓰게 이끔 (답은 주지 않음)
        assert.match(await L.page.evaluate(() => document.querySelector('.step-panel[data-step="purpose"] .th-ask').textContent), /○○이 많으면/);

        // 풀이 → 다음 장('오늘 알아낼 것') → 풀이: 그 key 가 열리면 실험 목적이 보임
        for (let n = 0; n < 6 && !(app.db.docs.get('labClasses/' + cls.space).lessonOpen || []).includes('th-purpose'); n++) {
            await T.page.keyboard.press('ArrowRight');
            await T.page.waitForTimeout(200);
        }
        assert.ok((app.db.docs.get('labClasses/' + cls.space).lessonOpen || []).includes('th-purpose'), '오늘 알아낼 것 풀이 → th-purpose');
        await waitShown(L.page, 'th-purpose', false);
        assert.match(await shownText(L.page, 'purpose'), /열의 이동 방향/);

        // 2 이론: 설명을 띄우면 답 칸 밖 글에도 답이 없음
        assert.equal((await app.post({ action: 'classStage', space: cls.space, stage: 2 })).ok, true);
        assert.equal((await app.post({ action: 'classLesson', space: cls.space, lesson: { on: true, stage: 'theory', i: 0, key: 'th-eq' }, open: [] })).ok, true);
        await waitShown(L.page, 'th-eq', true);
        await L.page.waitForSelector('nav.steps button[data-step="theory"]:not(.locked)', { timeout: 15000 }).catch(() => {});
        await L.page.evaluate(() => { location.hash = '#step-2'; });
        for (const k of ['th-eq', 'th-loss']) assert.equal(await isHidden(L.page, k), true, k + ' 가림');
        const before = await shownText(L.page, 'theory');
        for (const [k, re] of Object.entries(ANS)) assert.doesNotMatch(before, re, k + ' 답이 가린 칸 밖에 보임');
        assert.match(before, /어느 쪽으로 이동할까요/, '물음은 보임');
        // 풀이를 열면 그 답 문장이 보임
        for (const k of ['th-eq', 'th-loss']) {
            assert.equal((await app.post({ action: 'classLesson', space: cls.space, lesson: { on: true, stage: 'theory', i: 1, key: k, reveal: true }, open: [k] })).ok, true);
            await waitShown(L.page, k, false);
        }
        const after = await shownText(L.page, 'theory');
        for (const [k, re] of Object.entries(ANS)) assert.match(after, re, k + ' 풀이 뒤 보임');
        assert.equal(await L.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        assert.deepEqual(L.errors, []); assert.deepEqual(T.errors, []);
    } finally {
        await browser.close();
    }
});

test('열평형 A: 수업 없이 연 화면은 답·실험 목적이 그대로 보임 (375px)', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch();
    try {
        const S = await newPage(browser, app, { viewport: { width: 375, height: 800 } });
        await S.page.goto(ORIGIN + '/projects/thermal-equilibrium.html');
        await S.page.waitForSelector('nav.steps button[data-step="theory"]');
        await S.page.waitForTimeout(800);
        for (const k of ['th-purpose', 'th-eq', 'th-loss']) assert.equal(await isHidden(S.page, k), false, k + ' 보임');
        for (const [k, re] of Object.entries(ANS)) assert.match(await shownText(S.page, 'theory'), re, k);
        // 실험 목적 접기 단추 44px
        const h = await S.page.evaluate(() => document.querySelector('details.th-purpose > summary').getBoundingClientRect().height);
        assert.ok(h >= 44, '실험 목적 보기 높이 ' + h);
        await S.page.click('details.th-purpose > summary');
        assert.match(await S.page.evaluate(() => document.querySelector('details.th-purpose').innerText), /열의 이동 방향/);
        assert.equal(await S.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px 가로 스크롤 없음');
        assert.deepEqual(S.errors, []);
    } finally {
        await browser.close();
    }
});

const CSV = '﻿# 회차: 불러온 회차\r\ntime_s,small_beaker_C,big_beaker_C,diff_C\r\n' +
    Array.from({ length: 30 }, (_, i) => { const t = i * 10, d = 40 * Math.exp(-t / 60); return [t, (30 + d * 0.75).toFixed(2), (30 - d * 0.25).toFixed(2), d.toFixed(2)].join(','); }).join('\r\n') + '\r\n';

async function saveSimRun(pg) {
    await pg.click('nav.steps button[data-step="procedure"]');
    await pg.waitForSelector('.rai-inline.rai-vc:not([hidden])');
    const vc = pg.locator('.rai-inline.rai-vc:not([hidden])').first();
    await vc.locator('input[data-vc="change"]').first().check();
    await vc.locator('input[data-vc="val1"]').fill('100 g : 100 g');
    await vc.locator('input[data-vc="val2"]').fill('50 g : 150 g');
    await vc.locator('input[data-vc="predict"]').first().check();
    await pg.click('nav.steps button[data-step="data"]');
    await pg.selectOption('#simSpeed', '15');
    await pg.click('#btnSimToggle');
    await pg.click('#btnRec');
    await pg.waitForFunction(() => Number(document.getElementById('stCount').textContent) >= 8, null, { timeout: 15000 });
    await pg.click('#btnSaveRun');
    await pg.waitForFunction(() => /1회차/.test(document.getElementById('runsCnt').textContent), null, { timeout: 10000 });
}

test('열평형 C: 수업에서 회차 저장·CSV 불러오기 → 저절로 선생님께, 수업 없이 연 화면은 안 보냄', { skip: !chromium && 'playwright 없음', timeout: 180000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'thermal-csv-'));
    const csvPath = path.join(tmp, 'run.csv');
    fs.writeFileSync(csvPath, CSV);
    try {
        const cls = await app.post({ action: 'createClass', ban: 4, nStudents: 4, groupSize: 2, exp: 'thermal', stage: 7 });
        assert.equal(cls.ok, true, cls.error);
        const L = await newPage(browser, app, { viewport: { width: 375, height: 800 } });
        await join(L, cls, 1);
        await saveSimRun(L.page);
        // 접힌 조 공유 칸을 열지 않아도 보냄
        await L.page.waitForSelector('#runsList [data-sent="ok"]', { timeout: 15000 });
        assert.match(await L.page.textContent('#runsList'), /✅ 선생님께 보냄/);
        const sub = async () => (await app.post({ action: 'classStatus', space: cls.space })).submissions.find(s => s.jo === 1 || s.jo === '1');
        let s1 = await sub();
        assert.equal(s1.rows, 1, '저장한 회차 1개가 교사 화면에');

        // CSV 불러오기 → 회차 2 도 저절로
        await L.page.setInputFiles('#inCsvFile', csvPath);
        await L.page.waitForFunction(() => /2회차/.test(document.getElementById('runsCnt').textContent), null, { timeout: 10000 });
        await L.page.waitForFunction(() => document.querySelectorAll('#runsList [data-sent="ok"]').length === 2, null, { timeout: 15000 });
        s1 = await sub();
        assert.equal(s1.rows, 2, 'CSV 회차도 교사 화면에');
        assert.ok(s1.labels.includes('run'), 'CSV 파일 이름이 회차 이름: ' + s1.labels.join(','));
        assert.equal(await L.page.$('#btnResend'), null, '다 보냈으면 다시 보내기 없음');
        assert.equal(await L.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px 가로 스크롤 없음');

        // 지우면 교사 화면에서도 빠짐
        await L.page.click('#runsList [data-del="2"]');
        await L.page.waitForFunction(() => /1회차/.test(document.getElementById('runsCnt').textContent), null, { timeout: 10000 });
        for (let n = 0; n < 30 && (await sub()).rows !== 1; n++) await L.page.waitForTimeout(200);
        assert.equal((await sub()).rows, 1, '지운 회차는 교사 화면에서 빠짐');
        assert.deepEqual(L.errors, []);

        // 수업 없이 연 화면: 저장해도 보내지 않음, 보낸 상태 줄 없음
        const before = [...app.db.docs.keys()].length;
        const S = await newPage(browser, app, { viewport: { width: 1280, height: 900 } });
        await S.page.goto(ORIGIN + '/projects/thermal-equilibrium.html');
        await saveSimRun(S.page);
        await S.page.setInputFiles('#inCsvFile', csvPath);
        await S.page.waitForFunction(() => /2회차/.test(document.getElementById('runsCnt').textContent), null, { timeout: 10000 });
        await S.page.waitForTimeout(1000);
        assert.equal(await S.page.$('#runsList [data-sent]'), null, '수업 없이: 보낸 상태 줄 없음');
        assert.equal(await S.page.$('#btnResend'), null);
        const added = [...app.db.docs.keys()].slice(before).filter(k => /items|submissions/.test(k));
        assert.deepEqual(added, [], '수업 없이 연 화면은 아무것도 보내지 않음');
        assert.deepEqual(S.errors, []);
    } finally {
        await browser.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});
