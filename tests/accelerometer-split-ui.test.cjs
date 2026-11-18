// 폰 측정 · 노트북 분석 이원화 시험 (2026-11-17 선생님 결정): 스마트폰 가속도·자유낙하
//  💻 노트북(1280, 터치 없음): 측정 단추가 보이지 않고 '📱 폰으로 측정해 보내기' QR 카드만 → 📱 폰(iPhone 13)으로 그 주소를 열어 2회 측정
//  → 1회만 골라 보내기 → 노트북에 🆕 로 들어와 그래프(·표·결과)가 저절로 그 기록으로. 📟 태블릿(Galaxy Tab S4)은 측정·분석 둘 다.
//  가짜 저장소·CDN 대역은 tests/accelerometer-ui-helpers.cjs. Playwright 가 없으면 건너뜀.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLabStore, chromium, devices, servers, open, overflow, smallButtons, fakeFrames, tapFall, shake } = require('./accelerometer-ui-helpers.cjs');

const LAPTOP = { viewport: { width: 1280, height: 800 } };
const visible = (page, sel) => page.isVisible(sel);
async function cardLink(L) {
    await L.waitForSelector('#phone-card a[href*="role=phone"]');
    return L.getAttribute('#phone-card a[href*="role=phone"]', 'href');
}

test('스마트폰 가속도: 노트북은 분석만(QR 카드), 폰은 측정·골라 보내기, 태블릿은 둘 다', { skip: !chromium && 'playwright 없음', timeout: 150000 }, async () => {
    const app = loadLabStore(), S = await servers(app), browser = await chromium.launch(), errors = [];
    try {
        const { page: L } = await open(browser, S, LAPTOP, 'L', errors);
        await L.goto(S.BASE + '/projects/phone-accelerometer.html');
        assert.equal(await L.getAttribute('html', 'data-device'), 'laptop');
        assert.equal(await visible(L, '#btn-start'), false, '노트북: 측정 시작 단추 없음');
        assert.equal(await visible(L, '#btn-stop'), false);
        assert.equal(await visible(L, '.dash-readouts'), false, '노트북: 지금 값 카드 없음');
        assert.equal(await visible(L, '#laptop-note'), true);
        assert.equal(await visible(L, '#device-switch select'), true, '이 기기 고르기');
        assert.match(await L.textContent('#record-status'), /분석 화면/);
        const link = await cardLink(L);
        assert.match(link, /phone-accelerometer\.html\?role=phone&group=99-\d+-\d{4}/, '조 코드가 없어도 노트북용 조 코드로');

        // 폰: 그 주소로 2회 측정 → 2회만 골라 보내기
        const { page: P } = await open(browser, S, devices['iPhone 13'], 'P', errors);
        await P.goto(link);
        await P.waitForSelector('.cs-phone');
        assert.equal(await P.getAttribute('html', 'data-device'), 'phone');
        assert.equal(await visible(P, '#btn-start'), true, '폰: 측정');
        assert.equal(await visible(P, '#phone-card'), false, '폰: QR 카드 없음');
        await shake(P, 1);
        await shake(P, 3);
        assert.equal(await P.locator('.cs-run').count(), 2);
        await P.locator('.cs-run input[type=checkbox]').first().uncheck();
        assert.match(await P.textContent('#cs-rsend'), /1개/);
        assert.equal(await overflow(P), 0, '폰 가로 스크롤');
        assert.deepEqual(await smallButtons(P), [], '폰 44px');
        await P.click('#cs-rsend');
        await P.waitForFunction(() => /보냈/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 15000 });

        // 노트북: 🆕 → 그래프가 저절로 그 기록으로 (분석은 노트북에서)
        await L.waitForFunction(() => /📈 보는 중: 📱 폰/.test(document.getElementById('record-status').textContent), null, { timeout: 15000 });
        assert.match(await L.textContent('#record-status'), /📱 폰 \w{4} · 2회 \(샘플 6개\)/);
        assert.match(await L.textContent('#in-list'), /🆕 📱 폰 \w{4} · 2회/);
        assert.doesNotMatch(await L.textContent('#in-list'), /1회/);
        assert.match(await L.textContent('#phone-card'), /🆕/);
        assert.equal(await L.evaluate(() => window.__charts[0].data.datasets[1].data.length), 6, '그래프에 Ay 6점');
        assert.equal(await overflow(L), 0);

        // 태블릿: 측정도 분석도 (QR 카드는 없음, 조 코드도 저절로 만들지 않음)
        const { page: T } = await open(browser, S, devices['Galaxy Tab S4'], 'T', errors);
        await T.goto(S.BASE + '/projects/phone-accelerometer.html');
        assert.equal(await T.getAttribute('html', 'data-device'), 'tablet');
        assert.equal(await visible(T, '#btn-start'), true);
        assert.equal(await visible(T, '#phone-card'), false);
        assert.equal(await T.inputValue('#cs-group'), '', '태블릿: 조 코드를 저절로 만들지 않음');
        await shake(T, 2);
        assert.equal(await visible(T, '#runs-box'), true, '태블릿: 내 회차 목록·📈 보기');
        assert.equal(await overflow(T), 0);
        assert.deepEqual(await smallButtons(T), []);

        // 터치 없는 375px 창(노트북으로 봄)도 가로 스크롤 없음
        const { page: N } = await open(browser, S, { viewport: { width: 375, height: 800 } }, 'N', errors);
        await N.goto(S.BASE + '/projects/phone-accelerometer.html');
        await N.waitForSelector('#phone-card a[href*="role=phone"]');
        assert.equal(await overflow(N), 0, '375px');
        // 이 기기 고르기로 바꾸면 측정 단추가 나타남
        await N.selectOption('#device-switch select', 'tablet');
        assert.equal(await visible(N, '#btn-start'), true, "'이 기기'를 태블릿으로 바꾸면 측정");
        assert.deepEqual(errors, []);
    } finally { await browser.close(); S.api.close(); S.site.close(); }
});

test('자유낙하: 노트북은 영상·점 찍기 없이 QR 카드, 폰에서 점 찍어 1회 골라 보내기 → 노트북 표·결과, 태블릿은 둘 다', { skip: !chromium && 'playwright 없음', timeout: 150000 }, async () => {
    const app = loadLabStore(), S = await servers(app), browser = await chromium.launch(), errors = [];
    try {
        const { page: L } = await open(browser, S, LAPTOP, 'L', errors);
        await L.goto(S.BASE + '/projects/free-fall.html#step-5');
        assert.equal(await visible(L, '#video-upload'), false, '노트북: 영상 열기 없음');
        assert.equal(await visible(L, '#btn-extract'), false);
        assert.equal(await visible(L, '#canvas'), false);
        assert.equal(await visible(L, '#laptop-note'), true);
        assert.equal(await visible(L, '#data-table'), true, '노트북: 측정값 표는 그대로');
        assert.match(await L.textContent('#data-table-body'), /QR 로 폰에서 측정해 보내세요/);
        const link = await cardLink(L);
        assert.match(link, /free-fall\.html\?role=phone&group=99-\d+-\d{4}/);

        const { page: P } = await open(browser, S, devices['iPhone 13'], 'P', errors);
        await P.goto(link);
        await P.waitForSelector('.cs-phone');
        assert.equal(await visible(P, '#video-upload'), true, '폰: 영상 열기');
        assert.equal(await visible(P, '.phone-only'), true, '폰 순서 안내, 바로 5. 데이터');
        await fakeFrames(P, 8);
        await P.fill('#pixel-to-mm', '2');
        await P.click('#btn-manual-track');
        await tapFall(P, 5);
        assert.equal(await P.evaluate(() => dataPoints.length), 5);
        await P.click('#btn-strobo');
        await P.evaluate(() => { videoTag = 'second'; });
        await P.click('#btn-strobo');
        await P.waitForFunction(() => document.querySelectorAll('.cs-run').length === 2);
        await P.locator('.cs-run input[type=checkbox]').first().uncheck();
        assert.equal(await overflow(P), 0, '폰 가로 스크롤');
        assert.deepEqual(await smallButtons(P), [], '폰 44px');
        await P.click('#cs-rsend');
        await P.waitForFunction(() => /보냈/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 15000 });

        // 노트북: 받은 회차가 저절로 6. 결과(그래프·g)와 5. 데이터 표에
        await L.waitForFunction(() => /📱 폰/.test(document.getElementById('view-who').textContent), null, { timeout: 15000 });
        assert.match(await L.textContent('#view-who'), /📥 📱 폰 \w{4} · 2회 자유낙하/);
        assert.equal(await L.evaluate(() => !document.querySelector('.step-panel[data-step=result]').hidden), true);
        const g = Number(/g = 2c\s*([\d.]+)/.exec(await L.textContent('#fit-result'))[1]);
        assert.ok(Math.abs(g - 9.8) < 0.3, '노트북 g ' + g);
        assert.equal(await L.locator('#data-table-body tr').count(), 5, '표에 받은 점 5개');
        assert.match(await L.textContent('#phone-card'), /🆕/);
        assert.equal(await overflow(L), 0);

        // 태블릿: 영상 점 찍기(측정)와 결과(분석) 둘 다
        const { page: T } = await open(browser, S, devices['Galaxy Tab S4'], 'T', errors);
        await T.goto(S.BASE + '/projects/free-fall.html#step-5');
        assert.equal(await T.getAttribute('html', 'data-device'), 'tablet');
        assert.equal(await visible(T, '#video-upload'), true);
        assert.equal(await visible(T, '#phone-card'), false);
        await fakeFrames(T, 6);
        await T.click('#btn-manual-track');
        await tapFall(T, 4);
        await T.click('#btn-strobo');
        await T.click('.steps button[data-step=result]');
        assert.match(await T.textContent('#fit-result'), /g = 2c/, '태블릿: 결과도');
        assert.equal(await overflow(T), 0);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); S.api.close(); S.site.close(); }
});
