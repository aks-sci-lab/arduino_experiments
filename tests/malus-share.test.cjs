// 말루스 법칙 조 공유 시험: 보낼 자료·받은 자료 합치기(Node) + 노트북 두 대 화면 시험(Playwright, 가짜 Apps Script)
// 가짜 서버: tests/fake-apps-script.cjs 가 apps-script/Code.gs 를 그대로 돌림 (진짜 시트처럼 '2-3-5376' → 날짜 변환 흉내)
// Playwright 가 없는 컴퓨터에서는 화면 시험을 건너뛴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const MS = require('../js/malus-share.js');
const CS = require('../js/class-share.js');
const CC = require('../js/class-cloud.js');
const { loadLabStore } = require('./fake-lab-store.cjs');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const RAD = Math.PI / 180;
// 회차 run 의 측정점 (밝기 = A cos²(θ − θ0) + B, 배경 0 이라 raw = 밝기)
function runPoints(run, A, theta0, B) {
    const out = [];
    for (let t = 0; t <= 180; t += 15) out.push({ run, theta: t, raw: A * Math.cos((t - theta0) * RAD) ** 2 + B, sd: 0.001, sat: 0, ch: 'r', gamma: 'srgb', excluded: false, reason: '', moved: false });
    return out;
}

test('보낼 자료: 회차마다 한 줄, 배경 뺀 밝기·결측, 요약 이름은 서버 규칙에 맞음', async () => {
    const pts = runPoints(1, 0.6, 20, 0.05).concat(runPoints(2, 0.3, 25, 0.02));
    pts[3].excluded = true; pts[3].reason = '폰이 밀림';
    const items = MS.buildItems(pts, p => p.raw - 0.01, 'r', 'srgb');
    assert.equal(items.length, 2);
    assert.equal(items[0].id, 'run1');
    assert.equal(items[0].title, '1회차');
    assert.equal(items[0].n, 13);
    assert.equal(items[0].data.points[3].excluded, true);
    assert.equal(items[0].data.points[3].reason, '폰이 밀림');
    assert.ok(Math.abs(items[0].data.points[0].y - (pts[0].raw - 0.01)) < 1e-6);
    assert.equal(items[0].summary['점'], 13);
    assert.equal(items[0].summary['결측'], 1);
    assert.ok(items[0].summary['cos2 R2'] > 0.9999);
    assert.ok(Math.abs(items[0].summary.theta0 - 20) < 0.2);
    // 서버(Code.gs cleanSummary)의 이름 규칙
    items.forEach(it => Object.keys(it.summary).forEach(k => assert.match(k, /^[A-Za-z0-9_가-힣 .()-]{1,30}$/)));
    // 같은 회차 번호는 ClassShare 의 시트 id 로 (노트북 번호 + run1)
    const b = CS.buildPayloads({ exp: 'malus', group: '2-3-5376', device: 'nab12cd', items, sent: [], isGroupCode: () => true });
    assert.deepEqual(b.payloads.map(p => p.id), ['nab12cd-run1', 'nab12cd-run2']);
});

test('받은 자료: 노트북·회차별로 보관, 바뀐 것만 changed, 분석용 점은 101번부터', async () => {
    const items = [
        { id: 'run1', device: 'nzz99', from: '노트북 ZZ99', title: '1회차', n: 2, data: { run: 1, points: [{ theta: 0, y: 0.5 }, { theta: 90, y: 0.01, excluded: true, reason: 'x' }] } },
        { id: 'run2', device: 'naa11', from: '노트북 AA11', title: '2회차', n: 1, data: { run: 2, points: [{ theta: 45, y: 0.3 }, { theta: 'x', y: 1 }] } },
        { id: 'bad', device: 'naa11', from: '노트북 AA11', title: '?', n: 1, data: 'not json' }
    ];
    const r = MS.applyIncoming({}, items);
    assert.equal(r.changed, true);
    assert.equal(MS.extCount(r.ext), 3, '형식이 틀린 점·묶음은 버림');
    assert.equal(MS.applyIncoming(r.ext, items).changed, false, '같은 목록이면 바뀐 것 없음');
    const ep = MS.extPoints(r.ext);
    assert.deepEqual(ep.map(p => p.run), [101, 102, 102]);
    assert.equal(ep[0].label, '노트북 AA11 · 2회차');
    assert.equal(ep[2].excluded, true);
    assert.ok(ep.every(p => p.ext));
    assert.equal(MS.applyIncoming(r.ext, []).changed, true, '다 지워지면 바뀜');
});

test('실험 목록: 말루스는 연결 준비 끝', async () => {
    assert.equal(CC.EXPS.malus.ready, true);
    assert.equal(CC.EXPS.malus.page, 'projects/malus-law.html');
});

/* ---------- 화면 시험 ---------- */
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
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
const SCRIPT_ID = 'FAKE_SCRIPT_ID_0123456789abcdef';

async function openLaptop(browser, base, app, query, width, seed) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    // 가짜 Apps Script (GET ?action=… / POST 본문 JSON)
    await page.addInitScript(() => { window.LAB_STORE_FAKE_URL = 'https://script.google.com/macros/s/FAKE_LAB_STORE/exec'; });   // 가짜 저장소 (js/lab-store.js)
    await page.route('https://script.google.com/**', async route => {
        const req = route.request(), u = new URL(req.url());
        let out;
        try { out = req.method() === 'POST' ? (await app.post(req.postData() || '{}')) : (await app.get(Object.fromEntries(u.searchParams))); }
        catch (e) { out = { ok: false, error: e.message }; }
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(out), headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    // 바깥 CDN(구글 로그인용 Firebase)은 막는다: 로그인 없이도 페이지가 돌아야 함
    await page.route(/gstatic\.com|jsdelivr\.net/, route => route.abort());
    if (seed) await ctx.addInitScript(s => { if (!localStorage.getItem('malus-law-v1')) localStorage.setItem('malus-law-v1', s); }, JSON.stringify(seed));
    await page.goto(base + '/projects/malus-law.html' + query);
    return { ctx, page, errors };
}
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('노트북 두 대 같은 조: 보내기 → 다른 노트북 자동 불러오기, 교사 진행 보기, 375px', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadLabStore();
    const cls = (await app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 4, exp: 'malus' }));
    assert.equal(cls.ok, true, cls.error);
    const g1 = cls.groups[0].code;
    const srv = await staticServer();
    const base = 'http://127.0.0.1:' + srv.address().port;
    const browser = await chromium.launch();
    try {
        const q = '?c=' + cls.classCode + '&s=' + SCRIPT_ID + '#step-5';
        const seedA = { points: runPoints(1, 0.6, 20, 0.05).concat(runPoints(2, 0.4, 22, 0.03)), dark: null, run: 2, models: ['cos2'] };
        const A = await openLaptop(browser, base, app, q, 375, seedA);
        const B = await openLaptop(browser, base, app, q, 375, null);
        for (const [L, num] of [[A, 1], [B, 2]]) {
            const p = L.page;
            await p.waitForSelector('#cs-cpick:not([hidden])');
            await p.selectOption('#cs-cjo', '1');
            await p.selectOption('#cs-cnum', String(num));
            await p.click('#cs-cjoin');
            await p.waitForSelector('#cs-cjoined:not([hidden])');
            assert.match(await p.textContent('#cs-cme'), new RegExp('1조 ' + num + '번.*' + g1));
            // 조 공유 칸은 5. 데이터 맨 위, 조 코드가 저절로
            assert.equal(await p.inputValue('#cs-group'), g1);
            assert.ok(await noSideScroll(p), '375px 가로 스크롤 (노트북 ' + num + ')');
        }
        // 조 공유 칸·띠의 단추는 높이 44px 이상
        const small = await A.page.$$eval('.cs-card button, .cs-card select, .cs-card input:not([type=checkbox]):not([type=file])', els => els.filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent));
        assert.deepEqual(small, []);

        // A: 📤 보내기 → 서버에 회차 2줄 (참여하면 먼저 한 번 불러오므로 끝난 뒤에)
        await A.page.waitForFunction(() => /연결됨/.test(document.getElementById('cs-status').textContent));
        await A.page.click('#cs-send');
        await A.page.waitForFunction(() => /보냈|✅/.test(document.getElementById('cs-status').textContent));
        const listed = (await app.get({ action: 'list', exp: 'malus', group: g1 }));
        assert.equal(listed.ok, true, listed.error);
        assert.deepEqual(listed.items.map(x => x.title).sort(), ['1회차', '2회차']);

        // B: 몇 초마다 자동 불러오기 → 6. 결과 표에 📥 불러온 값 26개
        await B.page.click('nav.steps button[data-step="result"]');
        await B.page.waitForFunction(() => /불러온 값 26개/.test(document.getElementById('cnt').textContent), null, { timeout: 30000 });
        const rows = await B.page.$$eval('#tbody tr.ext', trs => trs.length);
        assert.equal(rows, 26);
        assert.match(await B.page.textContent('#tbody'), /📥 노트북 \w{4} · 1회차/);
        assert.ok(await noSideScroll(B.page), '결과 단계 375px 가로 스크롤');
        // B 가 자기 기록을 지우지 않아도 불러온 값 지우기
        assert.equal(await B.page.isVisible('#cs-clear'), false, '결과 단계에서는 조 공유 칸이 안 보임');

        // 7. 결론의 📤 선생님께 보내기 (B 는 잰 것이 없음 → 보내도 줄이 늘지 않음), 다른 내보내기는 접혀 있음
        await A.page.click('nav.steps button[data-step="conclusion"]');
        assert.equal(await A.page.isVisible('#btn-gs-oauth'), false, '구글 로그인 내보내기는 접기 안');
        await A.page.click('#btn-send2');
        await A.page.waitForFunction(() => /보냈|✅/.test(document.getElementById('send2-status').textContent));
        assert.ok(await noSideScroll(A.page), '결론 단계 375px 가로 스크롤');

        // 교사 진행 보기: 두 학생의 단계·점 수, 조 1 제출 요약
        await A.page.evaluate(() => new Promise(r => setTimeout(r, 300)));
        const st = (await app.post({ action: 'classStatus', class: cls.classCode, key: cls.key }));
        assert.equal(st.ok, true, st.error);
        const sA = st.students.find(s => s.jo === 1 && s.num === 1), sB = st.students.find(s => s.jo === 1 && s.num === 2);
        assert.equal(sA.points, 26);
        assert.equal(sA.submitted, true);
        assert.equal(sB.points, 0);
        assert.ok(['data', 'result', 'conclusion'].includes(sA.step), sA.step);
        assert.equal(sB.step, 'result');
        const sum = CC.summarize(st).groups[0];
        assert.equal(sum.code, g1);
        assert.match(CC.submissionText('malus', sum.sub), /제출: 2개 \(1회차, 2회차\) · 점 13, cos2 R2 1, theta0 2\d/);
        assert.deepEqual(A.errors, []);
        assert.deepEqual(B.errors, []);
    } finally {
        await browser.close();
        srv.close();
    }
});

test('?c= 없이 열면 예전처럼: 띠 없음, 조 공유 칸은 있음, 로그인 없이 동작', { skip: !chromium && 'playwright 없음', timeout: 60000 }, async () => {
    const app = loadLabStore();
    const srv = await staticServer();
    const base = 'http://127.0.0.1:' + srv.address().port;
    const browser = await chromium.launch();
    try {
        const L = await openLaptop(browser, base, app, '#step-5', 375, { points: runPoints(1, 0.6, 20, 0.05), run: 1 });
        await L.page.waitForSelector('#cs-group');
        assert.equal(await L.page.$('.cs-bar'), null);
        // 조 코드 직접 넣기 → 보내기
        await L.page.fill('#cs-group', '2-3-5376');
        // 조 코드를 넣으면 먼저 한 번 불러오기 → 끝난 뒤 보내기 (불러오는 동안은 보내기를 받지 않음, class-share.js)
        await L.page.waitForFunction(() => /연결됨/.test(document.getElementById('cs-status').textContent));
        await L.page.click('#cs-send');
        await L.page.waitForFunction(() => /보냈|✅/.test(document.getElementById('cs-status').textContent), null, { timeout: 5000 }).catch(async e => {
            throw new Error(e.message + ' / 상태: ' + await L.page.textContent('#cs-status') + ' / ' + await L.page.textContent('#cs-server'));
        });
        const listed = (await app.get({ action: 'list', exp: 'malus', group: '2-3-5376' }));
        assert.deepEqual(listed.items.map(x => x.title), ['1회차'], '조 코드가 날짜로 바뀌지 않음');
        // 6. 결과: 내 기록만 (불러온 값 없음)
        await L.page.click('nav.steps button[data-step="result"]');
        assert.match(await L.page.textContent('#cnt'), /^\(13개\)$/);
        assert.ok(await noSideScroll(L.page));
        assert.deepEqual(L.errors, []);
    } finally {
        await browser.close();
        srv.close();
    }
});

test('📱 폰 측정 · 노트북 분석: 노트북(1280) 폰 카드 QR → 폰(Pixel 7, 가짜 카메라)에서 2회차 측정 → 고른 회차만 보내기 → 노트북 결과 표에 📱 폰 회차', { skip: !chromium && 'playwright 없음', timeout: 180000 }, async () => {
    const { devices } = require('playwright');
    const app = loadLabStore();
    const srv = await staticServer();
    const base = 'http://127.0.0.1:' + srv.address().port;
    // 가짜 카메라: 크롬이 움직이는 시험 화면을 카메라처럼 보내 줌
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';
    const errors = [];
    async function open(opt, name, url, init) {
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
        if (init) await ctx.addInitScript(init);
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(name + ': ' + e.message));
        page.on('dialog', d => d.accept());
        await page.goto(url);
        return page;
    }
    try {
        // ---- 노트북(분석만): 측정 화면은 숨고, 5. 데이터 맨 위 '📱 폰으로 측정해 보내기' 카드에 QR (조 코드는 저절로) ----
        const L = await open({ viewport: { width: 1280, height: 800 } }, 'L', base + '/projects/malus-law.html#step-5');
        assert.equal(await L.getAttribute('html', 'data-device'), 'laptop');
        assert.equal(await L.isVisible('#btn-cam'), false, '노트북에는 카메라 켜기 없음');
        assert.equal(await L.isVisible('#btn-record'), false, '노트북에는 측정 기록 없음');
        assert.equal(await L.isVisible('#phone-card'), true);
        assert.match(await L.textContent('#device-switch'), /이 기기/);
        await L.waitForSelector('#cs-cardqr svg', { state: 'attached' });
        const link = await L.getAttribute('#phone-card a[href*="role=phone"]', 'href');
        const G = /group=([\d-]+)/.exec(link)[1];
        assert.match(link, /malus-law\.html\?role=phone&group=99-\d+-\d{4}/);

        // ---- 폰: 측정 화면만, 대기 0초·평균 3프레임으로 빠르게 ----
        const P = await open(devices['Pixel 7'], 'P', link, () => { if (!localStorage.getItem('malus-law-settings-v1')) localStorage.setItem('malus-law-settings-v1', JSON.stringify({ delay: 0 })); });
        assert.equal(await P.evaluate(() => document.body.classList.contains('malus-phone')), true);
        assert.equal(await P.isVisible('nav.steps'), false, '폰은 7단계 탭 없음');
        assert.equal(await P.isVisible('#btn-cam'), true);
        assert.equal(await P.isVisible('#cs-group'), false, '폰은 조 코드를 묻지 않음');
        assert.ok((await P.textContent('.cs-phone')).includes('노트북과 연결됨 · 조 ' + G));
        await P.click('#btn-cam');
        await P.waitForFunction(() => !document.getElementById('btn-record').disabled, null, { timeout: 15000 });
        await P.fill('#frames', '3');
        async function rec(angle) {
            await P.fill('#angle', String(angle));
            await P.click('#btn-record');
            await P.waitForFunction(a => document.getElementById('rec-status').textContent.startsWith(a + '° 기록 완료'), angle, { timeout: 15000 });
        }
        for (const a of [0, 45, 90]) await rec(a);
        await P.click('#btn-new-run');
        for (const a of [0, 90]) await rec(a);
        assert.equal(await P.locator('.cs-run').count(), 2, '회차 목록 2개');
        assert.match(await P.textContent('#cs-runs'), /1회차[\s\S]*3점[\s\S]*2회차[\s\S]*2점/);
        assert.equal(await noSideScroll(P), true, '폰 가로 스크롤');
        const small = await P.$$eval('.cs-phone button, .cs-phone input[type=text], #btn-cam, #btn-record, #btn-new-run', els => els.filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim()));
        assert.deepEqual(small, []);
        // 1회차는 빼고 2회차만 보내기
        await P.locator('.cs-run input[type=checkbox][data-id=run1]').uncheck();
        assert.match(await P.textContent('#cs-rsend'), /1개/);
        await P.click('#cs-rsend');
        await P.waitForFunction(() => /보냈/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 15000 });
        assert.deepEqual(await P.locator('.cs-rst').allTextContents(), ['보내기 전', '✅ 보냄']);
        const rows = (await app.get({ action: 'list', exp: 'malus', group: G })).items;
        assert.deepEqual(rows.map(r => r.title), ['2회차']);
        assert.match(rows[0].device, /^p/, '폰 기기 번호');

        // ---- 노트북: 자동 불러오기 → 알림 → 6. 결과 표에 📱 폰 회차 ----
        await L.waitForSelector('#phone-note:not([hidden])', { timeout: 20000 });
        assert.match(await L.textContent('#cs-cardst'), /폰에서 새 측정 1개/);
        assert.match(await L.textContent('#phone-note'), /폰에서 새 회차 1개/);
        await L.click('#phone-note [data-go=result]');
        await L.waitForFunction(() => /불러온 값 2개/.test(document.getElementById('cnt').textContent));
        const body = await L.textContent('#tbody');
        assert.match(body, /📱 폰 \w{4} · 2회차/);
        assert.doesNotMatch(body, /📥 📱/);
        // 나머지 1회차도 보내면 노트북에 합쳐짐
        await P.locator('.cs-run input[type=checkbox][data-id=run1]').check();
        await P.click('#cs-rsend');
        await L.waitForFunction(() => /불러온 값 5개/.test(document.getElementById('cnt').textContent), null, { timeout: 20000 });
        // 폰에서 보낸 회차를 🗑 로 지우면 시트·노트북에서도 빠짐
        await P.click('[data-del=run2]');
        await P.waitForFunction(() => document.querySelectorAll('.cs-run').length === 1);
        await L.waitForFunction(() => /불러온 값 3개/.test(document.getElementById('cnt').textContent), null, { timeout: 20000 });
        assert.equal(await P.evaluate(() => JSON.parse(localStorage.getItem('malus-law-v1:phone')).points.length), 3, '폰 기록에서도 지움');
        assert.equal(await L.evaluate(() => JSON.parse(localStorage.getItem('malus-law-v1')).points.length), 0, '노트북 자기 기록은 그대로(0)');
        if (process.env.SHOT_DIR) { await P.screenshot({ path: process.env.SHOT_DIR + '/malus-phone.png', fullPage: true }); await L.screenshot({ path: process.env.SHOT_DIR + '/malus-laptop.png' }); }
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        srv.close();
    }
});

test('태블릿은 측정·분석 둘 다, QR 없이 연 폰도 측정·분석, 노트북 375px·CSV 불러오기', { skip: !chromium && 'playwright 없음', timeout: 180000 }, async () => {
    const { devices } = require('playwright');
    const app = loadLabStore();
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
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(out) });
        });
        await ctx.route(/gstatic\.com|jsdelivr\.net/, r => r.abort());
        await ctx.addInitScript(() => { if (!localStorage.getItem('malus-law-settings-v1')) localStorage.setItem('malus-law-settings-v1', JSON.stringify({ delay: 0 })); });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(name + ': ' + e.message));
        page.on('dialog', d => d.accept());
        await page.goto(url);
        return page;
    }
    async function measureTwo(P) {
        await P.click('#btn-cam');
        await P.waitForFunction(() => !document.getElementById('btn-record').disabled, null, { timeout: 15000 });
        await P.fill('#frames', '3');
        for (const a of [0, 45, 90]) {
            await P.fill('#angle', String(a));
            await P.click('#btn-record');
            await P.waitForFunction(x => document.getElementById('rec-status').textContent.startsWith(x + '° 기록 완료'), a, { timeout: 15000 });
        }
    }
    try {
        // ---- 태블릿: 측정도 하고 6. 결과도 봄, 폰 카드는 없음 ----
        const T = await open(devices['Galaxy Tab S4'], 'T', base + '/projects/malus-law.html#step-5');
        assert.equal(await T.getAttribute('html', 'data-device'), 'tablet');
        assert.equal(await T.isVisible('#btn-cam'), true);
        assert.equal(await T.isVisible('#phone-card'), false);
        assert.equal(await T.isVisible('nav.steps'), true);
        await measureTwo(T);
        await T.click('nav.steps button[data-step="result"]');
        assert.match(await T.textContent('#cnt'), /^\(3개\)$/);
        assert.equal(await noSideScroll(T), true, '태블릿 가로 스크롤');

        // ---- QR 없이 연 폰: 노트북 안내 한 줄 + 측정 + 분석 단계도 그대로 (노트북이 없을 때) ----
        const P = await open(devices['iPhone 13'], 'P', base + '/projects/malus-law.html#step-5');
        assert.equal(await P.getAttribute('html', 'data-device'), 'phone');
        assert.equal(await P.isVisible('.phone-solo'), true);
        assert.equal(await P.isVisible('#phone-card'), false);
        await measureTwo(P);
        assert.equal(await P.isVisible('nav.steps'), true, '노트북 없이 쓰면 결과 단계도 봄');
        assert.equal(await noSideScroll(P), true, '폰 가로 스크롤');
        const small = await P.$$eval('#btn-cam, #btn-record, #btn-new-run, nav.steps button, #device-switch select', els => els.filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim()));
        assert.deepEqual(small, []);
        // 폰에서 CSV 로 저장
        await P.click('nav.steps button[data-step="result"]');
        const [dl] = await Promise.all([P.waitForEvent('download'), P.click('#btn-csv')]);
        const csvPath = require('node:path').join(require('node:os').tmpdir(), 'malus-law-' + process.pid + '.csv');
        await dl.saveAs(csvPath);

        // ---- 노트북 375px(터치 없음): 측정 숨김, 폰 카드, 가로 스크롤 없음 → 폰 CSV 를 📂 로 불러와 결과에 합침 ----
        const L = await open({ viewport: { width: 375, height: 800 } }, 'L', base + '/projects/malus-law.html#step-5');
        assert.equal(await L.isVisible('#btn-cam'), false);
        await L.waitForSelector('#cs-cardqr', { state: 'attached' });
        assert.equal(await noSideScroll(L), true, '노트북 375px 가로 스크롤');
        await L.evaluate(() => { document.getElementById('cs-share').open = true; });
        await L.setInputFiles('#cs-csv', csvPath);
        await L.waitForFunction(() => /측정값 3개/.test(document.getElementById('cs-status').textContent + document.getElementById('cs-share').textContent), null, { timeout: 10000 });
        await L.click('nav.steps button[data-step="result"]');
        assert.match(await L.textContent('#cnt'), /불러온 값 3개/);
        assert.match(await L.textContent('#tbody'), /📂 malus-law-\d+\.csv · 1회차/);
        assert.doesNotMatch(await L.textContent('#tbody'), /📥 📂/);
        // '이 기기'를 태블릿으로 바꾸면 측정 화면이 다시 보임
        await L.click('nav.steps button[data-step="data"]');
        await L.selectOption('#device-switch select', 'tablet');
        assert.equal(await L.isVisible('#btn-cam'), true);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        srv.close();
    }
});
