// LED 플랑크 상수 Apps Script 웹앱 화면 시험 (Playwright, 390px 휴대폰 폭·1366px 노트북 폭)
// Code.gs 는 tests/fake-planck-apps-script.cjs 의 가짜 Apps Script 에서 돌고, 화면의 google.script.run 이 그것을 부른다.
// Playwright 가 없는 컴퓨터에서는 건너뛴다.  스크린숏을 남기려면 PLANCK_SHOTS=폴더 를 정해 실행.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadPlanckApp, renderPage, callServer } = require('./fake-planck-apps-script.cjs');
const P = require('../js/planck-math.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const SHOTS = process.env.PLANCK_SHOTS;
const URL_BASE = 'https://script.google.com/macros/s/FAKE/exec';

async function openPage(browser, app, which, width) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('__gasCall', (name, args) => callServer(app, name, args));
    await page.route(URL_BASE + '**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: renderPage(app, which).html }));
    await page.goto(URL_BASE + (which === 'teacher' ? '?page=teacher' : ''));
    return { ctx, page, errors };
}
async function noSideScroll(page) {
    return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name), fullPage: true }); }

// LED 하나를 화면에서 입력: 문턱 vt 위로 직선 (전류계 방식이면 I, 저항 방식이면 V_R)
async function enterLed(page, chipName, vt, byResistor) {
    await page.getByRole('tab', { name: new RegExp(chipName) }).click();
    for (const d of [0, 0.1, 0.2, 0.3]) {
        const v = +(vt + d).toFixed(3), iMa = +(d * 40).toFixed(3);
        await page.fill('#in-v', String(v));
        if (byResistor) await page.fill('#in-vr', String(+(iMa / 1000 * 330).toFixed(5)));
        else await page.fill('#in-i', String(iMa));
        await page.click('#btn-add');
    }
}

test('학생 화면(390px) → 제출 → 선생님 화면(1366px·390px) 조별 보기·CSV', { skip: !chromium && 'playwright 없음' }, async () => {
    const app = loadPlanckApp();
    const browser = await chromium.launch();
    try {
        /* ---------- 학생 ---------- */
        const s = await openPage(browser, app, 'student', 390);
        const sp = s.page;
        assert.ok(await noSideScroll(sp), '학생 화면 가로 스크롤');
        // 아무것도 안 넣고 제출하면 안내
        await sp.click('#btn-submit');
        await sp.waitForSelector('#submit-msg .msg.err');
        assert.match(await sp.textContent('#submit-msg'), /조를 넣으세요/);

        await sp.fill('#in-group', '3반 2조');
        await sp.fill('#in-name', '10307 김과학');
        // 기본은 '고정 저항 전압' 방식 (R = 330 Ω)
        await sp.fill('#in-v', '2'); await sp.fill('#in-vr', '0.33');
        assert.match(await sp.textContent('#calc-i'), /1\.0000 mA/);
        await sp.fill('#in-v', ''); await sp.fill('#in-vr', '');
        for (const [name, lambda] of [['빨강', 625], ['초록', 525], ['파랑', 470]]) await enterLed(sp, name, P.photonVolt(lambda) - 0.1, true);
        assert.match(await sp.textContent('#led-result'), /문턱 전압 V₀ = [\d.]+ V/);
        const resText = await sp.textContent('#planck-result');
        assert.match(resText, /h = e × 기울기/);
        assert.match(resText, /오차: [+-]?0\.\d %/);
        assert.ok(await noSideScroll(sp), '측정 뒤 학생 화면 가로 스크롤');
        await shot(sp, 'student-390.png');

        // 새로고침해도 입력이 남는다 (이 기기에 자동 저장)
        await sp.reload();
        assert.equal(await sp.inputValue('#in-group'), '3반 2조');
        assert.match(await sp.textContent('#led-chips'), /빨강 · 4/);

        await sp.click('#btn-submit');
        await sp.waitForSelector('#submit-msg .msg.ok');
        assert.match(await sp.textContent('#submit-msg'), /제출했습니다\. LED 3개/);
        // 학생 화면에는 다른 학생 자료를 보여 주는 칸·함수가 없다
        assert.equal(await sp.evaluate(() => document.body.innerText.includes('다른 학생')), false);
        assert.deepEqual(s.errors, []);
        await s.ctx.close();

        const saved = app.rows();
        assert.equal(saved.length, 4);
        assert.equal(saved[1][10], '고정 저항 전압'); assert.equal(saved[1][11], 330);

        // 다른 조 · 빛 기준 학생 (서버 함수 직접)
        callServer(app, 'submitMeasurement', [{ group: '3반 1조', name: '10301', method: 'glow', iMode: 'ammeter',
            leds: [{ name: '빨강', lambda: 625, v0: 1.9, glow: [1.9] }, { name: '파랑', lambda: 470, v0: 2.55, glow: [2.5, 2.6] }], hStudent: 6.1 }]);

        /* ---------- 선생님 ---------- */
        const t = await openPage(browser, app, 'teacher', 1366);
        const tp = t.page;
        assert.equal(await tp.isVisible('#app'), false, '암호 전에는 자료 화면이 보이지 않음');
        await tp.fill('#in-pw', '틀린암호');
        await tp.click('#btn-login');
        await tp.waitForSelector('#login-msg .msg.err');
        assert.match(await tp.textContent('#login-msg'), /맞지 않습니다/);
        await tp.fill('#in-pw', 'teacher-pw-123');
        await tp.click('#btn-login');
        await tp.waitForSelector('#tbl-overview tr[data-group]');
        const ov = await tp.$$eval('#tbl-overview tr[data-group]', trs => trs.map(tr => tr.getAttribute('data-group')));
        assert.deepEqual(ov, ['3반 1조', '3반 2조']);
        await tp.click('#tbl-overview tr[data-group="3반 2조"]');
        await tp.waitForSelector('#detail:not([hidden])');
        const stats = await tp.textContent('#stats');
        assert.match(stats, /조 h \(직선\)6\.\d\d × 10−34 J·s/);
        assert.match(stats, /학생 h 평균 \(1명\)/);
        assert.equal(await tp.$$eval('#tbl-rows tr', trs => trs.length), 1 + 3);
        await shot(tp, 'teacher-1366.png');

        const [dl] = await Promise.all([tp.waitForEvent('download'), tp.click('#btn-csv-group')]);
        // 시험 브라우저는 한글 파일 이름을 'download' 로 바꾸는 일이 있어 둘 다 받는다 (실제 크롬은 한글 이름 그대로)
        assert.match(dl.suggestedFilename(), /^(플랑크상수_3반_2조_\d{8}\.csv|download)$/);
        const csv = require('node:fs').readFileSync(await dl.path(), 'utf8');
        assert.ok(csv.startsWith('﻿제출 시각,조,'));
        assert.equal(csv.split('\r\n').filter(l => l.includes('3반 2조')).length, 3 + 1);   // LED 3줄 + 요약 1줄
        assert.ok(!csv.includes('3반 1조'));
        await tp.click('#btn-csv-show');
        assert.ok((await tp.inputValue('#csv-text')).includes('10307 김과학'));

        await tp.selectOption('#sel-group', '3반 1조');
        assert.match(await tp.textContent('#h-detail'), /3반 1조/);
        const [dlAll] = await Promise.all([tp.waitForEvent('download'), tp.click('#btn-csv-all')]);
        const all = require('node:fs').readFileSync(await dlAll.path(), 'utf8');
        assert.ok(all.includes('3반 1조') && all.includes('3반 2조'));
        assert.deepEqual(t.errors, []);
        await t.ctx.close();

        // 휴대폰 폭에서도 선생님 화면이 넘치지 않는다 (넓은 표는 표 안에서만 옆으로 밀림)
        const m = await openPage(browser, app, 'teacher', 390);
        await m.page.fill('#in-pw', 'teacher-pw-123');
        await m.page.click('#btn-login');
        await m.page.waitForSelector('#tbl-overview tr[data-group]');
        await m.page.click('#tbl-overview tr[data-group="3반 2조"]');
        await m.page.waitForSelector('#detail:not([hidden])');
        assert.ok(await noSideScroll(m.page), '선생님 화면 390px 가로 스크롤');
        await shot(m.page, 'teacher-390.png');
        assert.deepEqual(m.errors, []);
        await m.ctx.close();

        // 학생 화면 1366px 도 확인
        const w = await openPage(browser, app, 'student', 1366);
        assert.ok(await noSideScroll(w.page));
        await shot(w.page, 'student-1366.png');
        await w.ctx.close();
    } finally {
        await browser.close();
    }
});
