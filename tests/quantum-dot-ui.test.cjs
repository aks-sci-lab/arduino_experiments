// 탄소 양자점 형광 실험 화면 시험 (Playwright, 가짜 카메라·가짜 getSettings, 가짜 저장소 tests/fake-lab-store.cjs)
//  - 노트북 1280: 측정 숨김·📱 QR 카드
//  - 폰(iPhone 13, QR 주소): 시료 2개 측정(형광 색 + 분광기 보정·스펙트럼) → 1개만 골라 보내기 → 노트북 🆕·표·그래프
//  - 태블릿: 측정·분석 둘 다, 375px 가로 스크롤 없음·단추 44px
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadLabStore } = require('./fake-lab-store.cjs');

let chromium = null, devices = null;
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
function staticServer() {
    return new Promise(resolve => {
        const srv = http.createServer((req, res) => {
            const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            const f = path.join(ROOT, u);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';

// 가짜 카메라 설정값: 노출 10 ms(100 µs 단위로 100)·ISO 200·색온도 5000 K, manual 노출 지원, 색온도는 '범위 밖' 오류(갤럭시 흉내)
function fakeCameraInit() {
    const P = MediaStreamTrack.prototype, orig = P.getSettings;
    P.getSettings = function () {
        const s = orig ? orig.call(this) : {};
        if (this.kind === 'video') Object.assign(s, { exposureTime: 100, iso: 200, colorTemperature: 5000, exposureMode: window.__qdLocked ? 'manual' : 'continuous' });
        return s;
    };
    P.getCapabilities = function () {
        return { exposureMode: ['continuous', 'manual'], exposureTime: { min: 1, max: 10000, step: 1 }, iso: { min: 50, max: 3200, step: 1 },
            whiteBalanceMode: ['continuous', 'manual'], colorTemperature: { min: 2850, max: 7000, step: 50 } };
    };
    P.applyConstraints = async function (c) {
        const a = (c && c.advanced && c.advanced[0]) || {};
        if (a.colorTemperature != null) throw new Error('colorTemperature setting out of range');
        if (a.exposureMode === 'manual') window.__qdLocked = true;
    };
}

// 가짜 분광기 사진 (PNG): 가로 x 화소가 nm = 380 + 0.6·x, 띠는 가운데 높이
async function spectrumPng(browser, lines) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const url = await page.evaluate(ls => {
        const W = 600, H = 200, cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const g = cv.getContext('2d'), img = g.createImageData(W, H);
        const to8 = v => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
        for (let x = 0; x < W; x++) {
            const nm = 380 + 0.6 * x;
            let I = 0;
            ls.forEach(l => { I += l.amp * Math.exp(-0.5 * ((nm - l.nm) / l.w) ** 2); });
            I = Math.min(1, I);
            const col = nm < 490 ? [0.2, 0.3, 1] : nm < 575 ? [0.3, 1, 0.2] : [1, 0.35, 0.1];
            for (let y = 0; y < H; y++) {
                const k = (y * W + x) * 4, band = y >= 70 && y <= 130 ? 1 : 0.02;
                for (let c = 0; c < 3; c++) img.data[k + c] = to8(I * band * col[c] * 0.9 + 0.004);
                img.data[k + 3] = 255;
            }
        }
        g.putImageData(img, 0, 0);
        return cv.toDataURL('image/png');
    }, lines);
    await ctx.close();
    return Buffer.from(url.split(',')[1], 'base64');
}
const LAMP = [{ nm: 435.8, w: 1.5, amp: 0.7 }, { nm: 546.1, w: 1.5, amp: 1 }, { nm: 611.6, w: 2, amp: 0.8 }, { nm: 487, w: 2, amp: 0.15 }];

const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const smallControls = (page, sel) => page.$$eval(sel, els => els.filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim()));

async function setup(app) {
    const srv = await staticServer();
    const base = 'http://127.0.0.1:' + srv.address().port;
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    const errors = [];
    async function open(opt, name, url) {
        const ctx = await browser.newContext(Object.assign({ permissions: ['camera'] }, opt));
        await ctx.addInitScript(() => { window.LAB_STORE_FAKE_URL = 'https://script.google.com/macros/s/FAKE_LAB_STORE/exec'; });   // 가짜 저장소 (js/lab-store.js)
        await ctx.route('https://script.google.com/**', async route => {
            const req = route.request(), u = new URL(req.url());
            let out;
            try { out = req.method() === 'POST' ? (await app.post(req.postData() || '{}')) : (await app.get(Object.fromEntries(u.searchParams))); }
            catch (e) { out = { ok: false, error: e.message }; }
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(out), headers: { 'Access-Control-Allow-Origin': '*' } });
        });
        await ctx.route(/qrcode-generator/, r => r.fulfill({ contentType: 'text/javascript', body: QR }));
        await ctx.route(/gstatic\.com/, r => r.abort());
        await ctx.addInitScript(fakeCameraInit);
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(name + ': ' + e.message));
        page.on('dialog', d => d.accept());
        await page.goto(url);
        return page;
    }
    return { srv, base, browser, errors, open };
}

test('📱 폰 측정 · 노트북 분석: 노트북 QR → 폰(iPhone 13)에서 시료 2개(형광 색·분광기) → 1개만 보내기 → 노트북 🆕·표·그래프', { skip: !chromium && 'playwright 없음', timeout: 180000 }, async () => {
    const app = loadLabStore();
    const S = await setup(app);
    try {
        const lamp = await spectrumPng(S.browser, LAMP);
        const sample = await spectrumPng(S.browser, [{ nm: 450, w: 25, amp: 0.8 }]);
        const sample2 = await spectrumPng(S.browser, [{ nm: 520, w: 25, amp: 0.8 }]);

        // ---- 노트북 1280: 측정 숨김, 5. 데이터 맨 위 QR 카드 ----
        const L = await S.open({ viewport: { width: 1280, height: 800 } }, 'L', S.base + '/projects/quantum-dot.html#step-5');
        assert.equal(await L.getAttribute('html', 'data-device'), 'laptop');
        assert.equal(await L.isVisible('.qd-measure'), false, '노트북에는 측정 없음');
        assert.equal(await L.isVisible('#phone-card'), true);
        await L.waitForSelector('#cs-cardqr svg', { state: 'attached' });
        const link = await L.getAttribute('#phone-card a[href*="role=phone"]', 'href');
        assert.match(link, /quantum-dot\.html\?role=phone&group=99-\d+-\d{4}/);
        const G = /group=([\d-]+)/.exec(link)[1];

        // ---- 폰: 측정 화면만 ----
        const P = await S.open(devices['iPhone 13'], 'P', link);
        assert.equal(await P.evaluate(() => document.body.classList.contains('qd-phone')), true);
        assert.equal(await P.isVisible('nav.steps'), false, '폰은 7단계 탭 없음');
        assert.equal(await P.isVisible('#qdTabs'), true);
        assert.ok((await P.textContent('.cs-phone')).includes('노트북과 연결됨 · 조 ' + G));

        // 시료 1: 60초, 1:1 — 카메라로 형광 색 (🔒 노출 고정: 색온도만 실패해도 노출은 고정)
        await P.fill('#in-heat', '60');
        await P.click('#qdTabs button[data-tab=color]');
        await P.click('#btn-cam');
        await P.waitForFunction(() => !document.getElementById('btn-lock').disabled, null, { timeout: 15000 });
        await P.click('#btn-lock');
        await P.waitForFunction(() => /노출은 고정|고정했어요/.test(document.getElementById('cam-msg').textContent));
        assert.match(await P.textContent('#cam-msg'), /고정했어요 \(노출·화이트밸런스\)/, '색온도 값이 범위 밖이어도 모드만 걸어 고정');
        await P.waitForFunction(() => /10\.00 ms[\s\S]*🔒 고정됨/.test(document.getElementById('cam-live').textContent), null, { timeout: 10000 });
        assert.match(await P.textContent('#cam-live'), /ISO\s*200[\s\S]*5000 K[\s\S]*lux[\s\S]*🔒 고정됨/);
        await P.click('#btn-color');
        await P.waitForFunction(() => /기록/.test(document.getElementById('color-msg').textContent));
        assert.match(await P.textContent('#color-msg'), /노출 10\.00 ms · ISO 200 🔒/);

        // 분광기: 형광등 사진으로 보정 → 시료 사진 스펙트럼 450 nm
        await P.click('#qdTabs button[data-tab=spec]');
        await P.setInputFiles('#file-photo', { name: 'lamp.png', mimeType: 'image/png', buffer: lamp });
        await P.waitForFunction(() => !document.getElementById('btn-cal-shot').disabled);
        await P.evaluate(() => { document.getElementById('cal-box').open = true; });
        await P.click('#btn-cal-shot');
        await P.waitForFunction(() => /봉우리 \d+개를 찾았어요/.test(document.getElementById('cal-msg').textContent));
        await P.click('#btn-cal-auto');
        await P.click('#btn-cal-save');
        assert.match(await P.textContent('#cal-msg'), /✅ λ = 3\d\d\.\d \+ 0\.6\d*/);
        await P.setInputFiles('#file-photo', { name: 'sample.png', mimeType: 'image/png', buffer: sample });
        await P.waitForTimeout(300);
        await P.click('#btn-spec');
        await P.waitForFunction(() => /봉우리 \d/.test(document.getElementById('spec-msg').textContent));
        const pk = Number(/봉우리 ([\d.]+) nm/.exec(await P.textContent('#spec-msg'))[1]);
        assert.ok(Math.abs(pk - 450) <= 5, '봉우리 ' + pk);
        await P.click('#qdTabs button[data-tab=save]');
        assert.match(await P.textContent('#draft-sum'), /10\.00 ms · ISO 200/);
        await P.click('#btn-save');
        await P.waitForFunction(() => document.querySelectorAll('.cs-run').length === 1);

        // 시료 2: 180초, 1:2 — 사진으로 색·스펙트럼 (보정은 기억됨)
        await P.click('#qdTabs button[data-tab=sample]');
        await P.fill('#in-heat', '180');
        await P.fill('#in-urea', '2');
        assert.equal(await P.textContent('#ratio-txt'), '1:2');
        await P.click('#qdTabs button[data-tab=spec]');
        assert.match(await P.textContent('#cal-sum'), /보정됨/);
        await P.setInputFiles('#file-photo', { name: 'sample2.png', mimeType: 'image/png', buffer: sample2 });
        await P.waitForTimeout(300);
        await P.click('#btn-spec');
        await P.waitForFunction(() => /봉우리 \d/.test(document.getElementById('spec-msg').textContent));
        await P.click('#qdTabs button[data-tab=save]');
        assert.match(await P.textContent('#draft-sum'), /노출 값 없음/, '사진은 노출 값을 모름');
        await P.click('#btn-save');
        await P.waitForFunction(() => document.querySelectorAll('.cs-run').length === 2);
        assert.match(await P.textContent('#cs-runs'), /시료 1 · 60초 · 1:1[\s\S]*시료 2 · 180초 · 1:2/);
        // 가열 시간·비율을 함께 바꿈(바꿀 것을 안 고름) → 두 가지가 바뀐 시료, 기본은 맞춤에서 뺌
        assert.match(await P.textContent('#mine-list'), /두 가지가 바뀌었어요[\s\S]*넣을까요, 뺄까요/);
        assert.equal(await P.isChecked('#mine-list [data-mix-no="2"] input[value="out"]'), true);
        assert.equal(await noSideScroll(P), true, '폰 가로 스크롤');
        assert.deepEqual(await smallControls(P, '.cs-phone button, #qdTabs button, #btn-save, #mine-list button'), []);

        // 시료 2 만 보내기
        await P.locator('.cs-run input[type=checkbox][data-id=s1]').uncheck();
        await P.click('#cs-rsend');
        await P.waitForFunction(() => /보냈/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 15000 });
        const rows = (await app.get({ action: 'list', exp: 'qdot', group: G })).items;
        assert.deepEqual(rows.map(r => r.title), ['시료 2 · 180초 · 1:2']);
        assert.ok(Math.abs(rows[0].summary['봉우리(nm)'] - 520) <= 5);
        assert.equal(rows[0].summary['⚠두 가지 바뀜'], '맞춤에서 뺌', '교사 조 카드 요약에도');
        assert.match(rows[0].device, /^p/);
        assert.doesNotMatch(JSON.stringify(rows[0].data), /data:image/, '사진은 보내지 않음');

        // ---- 노트북: 🆕 알림 → 6. 결과 표·그래프 ----
        await L.waitForSelector('#phone-note:not([hidden])', { timeout: 20000 });
        assert.match(await L.textContent('#phone-note'), /폰에서 새 시료 1개/);
        await L.click('#phone-note [data-go=result]');
        await L.waitForFunction(() => /불러온 값 1개/.test(document.getElementById('cnt').textContent));
        const body = await L.textContent('#tbody');
        assert.match(body, /📱 폰 \w{4}[\s\S]*시료 2[\s\S]*180/);
        assert.match(await L.textContent('#spec-legend'), /시료 2 · 180초 · 1:2 \(5[12]\d nm\)/);
        // 시료 1 도 보내면 두 점 → 직선
        await P.locator('.cs-run input[type=checkbox][data-id=s1]').check();
        await P.click('#cs-rsend');
        await L.waitForFunction(() => /불러온 값 2개/.test(document.getElementById('cnt').textContent), null, { timeout: 20000 });
        // 받은 노트북에도 같은 ⚠ 표시, 폰이 고른 '빼기'를 따라 직선에서 빠짐
        assert.match(await L.textContent('#tbody'), /⚠ 두 가지가 바뀜 \(가열 시간, 재료 비율.*\) · 맞춤에서 뺌/);
        assert.match(await L.textContent('#mix-box'), /고르기는 잰 기기에서/);
        assert.equal(await L.locator('#mix-box input').count(), 0, '받은 시료는 보기만');
        assert.match(await L.textContent('#xy-fit'), /가로값이 다른 시료가 2개 이상[\s\S]*시료 1개는 두 가지가 바뀌어 직선에서 뺐어요/);
        // 폰에서 '넣기' + 까닭 → 다시 보내면 노트북 직선이 2점으로
        await P.check('#mine-list [data-mix-no="2"] input[value="in"]');
        await P.fill('#mine-list [data-mix-no="2"] [data-mix-why]', '비율 차이는 작아서');
        await P.press('#mine-list [data-mix-no="2"] [data-mix-why]', 'Tab');
        assert.deepEqual(await smallControls(P, '#mine-list label, #mine-list input[type=text]'), []);
        assert.equal(await noSideScroll(P), true, '폰 가로 스크롤 (⚠ 칸)');
        await P.locator('.cs-run input[type=checkbox][data-id=s2]').check();
        await P.click('#cs-rsend');
        await L.waitForFunction(() => /최소제곱 직선[\s\S]*점 2개/.test(document.getElementById('xy-fit').textContent), null, { timeout: 20000 });
        assert.match(await L.textContent('#xy-fit'), /두 가지가 바뀌었지만 직선에 넣었어요/);
        assert.match(await L.textContent('#mix-box'), /맞춤에 넣음 · 까닭: 비율 차이는 작아서/);
        await L.selectOption('#sel-y', 'corr');
        assert.match(await L.textContent('#xy-fit'), /가로값이 다른 시료가 2개 이상/, '보정 밝기는 시료 1(카메라)만 있음');
        // CSV 다운로드
        const [dl] = await Promise.all([L.waitForEvent('download'), L.click('#btn-csv')]);
        const csv = fs.readFileSync(await dl.path(), 'utf8');
        assert.match(csv, /source,no,at,heat_s/);
        assert.equal(csv.trim().split('\n').length, 4);
        if (process.env.SHOT_DIR) { await P.screenshot({ path: process.env.SHOT_DIR + '/qdot-phone.png', fullPage: true }); await L.screenshot({ path: process.env.SHOT_DIR + '/qdot-laptop.png', fullPage: true }); }
        assert.deepEqual(S.errors, []);
    } finally {
        await S.browser.close();
        S.srv.close();
    }
});

test('태블릿은 측정·분석 둘 다, 노트북 375px 가로 스크롤 없음·단추 44px, 이론 단계 열림', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadLabStore();
    const S = await setup(app);
    try {
        const T = await S.open(devices['Galaxy Tab S4'], 'T', S.base + '/projects/quantum-dot.html#step-5');
        assert.equal(await T.getAttribute('html', 'data-device'), 'tablet');
        assert.equal(await T.isVisible('.qd-measure'), true);
        assert.equal(await T.isVisible('nav.steps'), true);
        assert.equal(await T.isVisible('#phone-card'), false);
        await T.click('#qdTabs button[data-tab=color]');
        await T.click('#btn-cam');
        await T.waitForFunction(() => !document.getElementById('btn-color').disabled, null, { timeout: 15000 });
        await T.click('#btn-color');
        await T.waitForFunction(() => /기록/.test(document.getElementById('color-msg').textContent));
        await T.click('#qdTabs button[data-tab=save]');
        await T.click('#btn-save');
        await T.click('nav.steps button[data-step="result"]');
        assert.match(await T.textContent('#cnt'), /^\(1개\)$/);
        assert.match(await T.textContent('#tbody'), /이 기기[\s\S]*시료 1/);
        assert.equal(await noSideScroll(T), true);

        for (const step of [1, 2, 3, 4, 5, 6, 7]) {
            const L = await S.open({ viewport: { width: 375, height: 800 } }, 'L' + step, S.base + '/projects/quantum-dot.html#step-' + step);
            assert.equal(await noSideScroll(L), true, '375px 가로 스크롤 (단계 ' + step + ')');
            assert.deepEqual(await smallControls(L, 'nav.steps button, .step-panel:not([hidden]) button, .step-panel:not([hidden]) select, #device-switch select'), [], '단계 ' + step);
            if (step === 2) assert.ok(await L.locator('.step-panel[data-step=theory] .subtabs button').count() >= 5, '이론 작은 탭');
            await L.context().close();
        }
        assert.deepEqual(S.errors, []);
    } finally {
        await S.browser.close();
        S.srv.close();
    }
});
