// 심박수 앞(전면) 카메라 고르기 (2026-11-22 선생님 결정 "뒤 기본 + 앞 고르기", 빛은 방 밝기만, 심박수 페이지 전부)
//  가짜 카메라가 facingMode 를 흉내: 앞·뒤가 서로 다른 장치(앞은 플래시 없음), 앞 카메라가 없는 폰
//  ① 앞 고르기 → 기억(새로고침) · 앞 카메라로 켜짐 · 플래시 숨김 · 회차·CSV 머리말에 facing
//  ② 켠 채로 뒤로 바꾸기 → 플래시 보임  ③ 앞이 없는 폰 → 쉬운 말로 알리고 뒤로
//  ④ 📱 폰 측정 화면(?role=phone) 숨 참기 회차에 facing  ⑤ iPhone 13 375px·44px
const http = require('http'), path = require('path'), fs = require('fs');
const REPO = path.join(__dirname, '..');
let chromium = null, devices = null;
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const test = require('node:test');
const assert = require('node:assert/strict');

const stat = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), p = path.join(REPO, decodeURIComponent(u.pathname));
    fs.readFile(p, (e, d) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d);
    });
});
// noFront: 앞 카메라가 없는 폰 (exact: 'user' 면 OverconstrainedError)
const CAM = (noFront, dark) => `(() => {
    const srgb = l => { const c = Math.min(1, Math.max(0, l)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); };
    window.__camAsked = [];
    navigator.mediaDevices.getUserMedia = async (cons) => {
        const fm = cons && cons.video && cons.video.facingMode;
        const want = fm && (fm.exact || fm.ideal) || 'user';
        window.__camAsked.push(JSON.stringify(fm));
        if (fm && fm.exact === 'user' && ${noFront ? 'true' : 'false'}) { const e = new Error('no front camera'); e.name = 'OverconstrainedError'; throw e; }
        const front = want === 'user' && !${noFront ? 'true' : 'false'};
        const cv = document.createElement('canvas'); cv.width = 160; cv.height = 120;
        const c = cv.getContext('2d'), t0 = performance.now();
        const draw = () => {
            const t = (performance.now() - t0) / 1000, ph = (t * 72 / 60) % 1;
            const p = Math.exp(-(((ph - 0.15) / 0.09) ** 2)) + 0.35 * Math.exp(-(((ph - 0.5) / 0.08) ** 2));
            const L = (${dark ? '0.08' : '(front ? 0.35 : 0.45)'}) * (1 - 0.05 * p), R = srgb(L), G = srgb(0.033 * L), B = srgb(0.018 * L);
            const img = c.createImageData(160, 120), d = img.data;
            for (let i = 0; i < d.length; i += 4) { d[i] = R + 3 * (Math.random() - 0.5); d[i + 1] = G + 3 * (Math.random() - 0.5); d[i + 2] = B + 3 * (Math.random() - 0.5); d[i + 3] = 255; }
            c.putImageData(img, 0, 0);
        };
        draw(); setInterval(draw, 16);
        const stream = cv.captureStream(30), tr = stream.getVideoTracks()[0];
        let st = { exposureMode: 'continuous', exposureTime: ${dark ? 416 : 330}, iso: ${dark ? 3200 : 800}, whiteBalanceMode: 'continuous', torch: false, facingMode: front ? 'user' : 'environment' };
        const base = tr.getSettings.bind(tr);
        tr.getCapabilities = () => Object.assign({ exposureMode: ['continuous', 'manual'], exposureTime: { min: 1, max: 10000, step: 1 }, iso: { min: 50, max: 3200 }, whiteBalanceMode: ['continuous', 'manual'] }, front ? {} : { torch: true });
        tr.getSettings = () => Object.assign(base(), st);
        tr.applyConstraints = async c => { (c.advanced || []).forEach(a => Object.assign(st, a)); };
        return stream;
    };
})();`;

test('심박수 앞 카메라 고르기: 기억·플래시 숨김·facing 기록·앞 없음·숨 참기 폰', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
    await new Promise(r => stat.listen(0, r));
    const ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    async function page(opt, name, cam, url) {
        const c = await browser.newContext(Object.assign({ acceptDownloads: true }, opt));
        c.setDefaultTimeout(15000);
        await c.route(/gstatic|jsdelivr/, r => r.abort());
        await c.addInitScript(cam);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message));
        pg.on('dialog', d => d.accept());
        await pg.goto(ROOT + (url || 'projects/heart-rate.html'));
        return pg;
    }
    const layout = async (pg, n) => {
        const ov = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        const small = await pg.evaluate(() => [...document.querySelectorAll('button, select, .btn, summary')]
            .filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim().slice(0, 20)));
        console.log(n, 'overflow', ov, 'small', small);
        assert.equal(ov, 0, n + ' 가로 스크롤'); assert.deepEqual(small, [], n + ' 44px');
    };
    const pressed = pg => pg.evaluate(() => [...document.querySelectorAll('#facing button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.facing));
    try {
        // ---- ① 앞 카메라 고르기 (iPhone 13) ----
        const A = await page(devices['iPhone 13'], 'A', CAM(false));
        assert.deepEqual(await pressed(A), ['environment'], '뒤가 기본');
        await A.click('#facing button[data-facing="user"]');
        assert.deepEqual(await pressed(A), ['user']);
        await A.reload();
        assert.deepEqual(await pressed(A), ['user'], '새로고침해도 기억');
        await A.click('#cam');
        await A.waitForFunction(() => window.__hrCore.hasCamera());
        assert.equal(await A.evaluate(() => window.__hrCore.facing()), 'user');
        assert.match(await A.evaluate(() => window.__camAsked.join(' ')), /"exact":"user"/);
        assert.equal(await A.isVisible('#torch-wrap'), false, '앞 카메라는 플래시 없음');
        assert.match(await A.textContent('#status'), /앞 카메라|좋아요|준비/);
        await A.waitForFunction(() => /좋아요/.test(document.getElementById('v-qtext').textContent), null, { timeout: 10000 });
        await layout(A, 'iPhone 13 앞 카메라');
        await A.selectOption('#dur', '15');
        await A.click('#start');
        await A.waitForFunction(() => window.__hrCore.runs().length === 1, null, { timeout: 40000 });
        const run = await A.evaluate(() => window.__hrCore.runs()[0]);
        console.log('① 앞 카메라 회차:', run.facing, run.torch, run.res.bpm);
        assert.equal(run.facing, 'user'); assert.equal(run.torch, false);
        assert.ok(Math.abs(run.res.bpm - 72) <= 4, '심박 ' + run.res.bpm);
        assert.match(await A.textContent('#runs'), /🤳 앞 카메라/);
        const [dl] = await Promise.all([A.waitForEvent('download'), A.click('#csv-all')]);
        const csv = fs.readFileSync(await dl.path(), 'utf8');
        assert.match(csv, /# 카메라: 앞 \(user\)/); assert.match(csv, /# facing: user/);
        // ---- ② 켠 채로 뒤로 바꾸기 → 플래시 보임 ----
        await A.click('#facing button[data-facing="environment"]');
        await A.waitForFunction(() => window.__hrCore.hasCamera() && window.__hrCore.facing() === 'environment' && !document.getElementById('torch-wrap').hidden, null, { timeout: 10000 });
        assert.equal(await A.isVisible('#torch-wrap'), true, '뒤 카메라는 플래시 고르기');
        assert.match(await A.evaluate(() => window.__camAsked.slice(-1)[0]), /environment/);

        // ---- ③ 앞 카메라가 없는 폰 → 알리고 뒤로 ----
        const B = await page(devices['Pixel 7'], 'B', CAM(true));
        await B.click('#facing button[data-facing="user"]');
        await B.click('#cam');
        await B.waitForFunction(() => window.__hrCore.hasCamera());
        await B.waitForFunction(() => /앞 카메라를 고를 수 없어/.test(document.getElementById('msg').textContent));
        console.log('③', (await B.textContent('#msg')).replace(/\s+/g, ' '));
        assert.equal(await B.evaluate(() => window.__hrCore.facing()), 'environment');
        assert.deepEqual(await pressed(B), ['environment'], '뒤로 돌아감');

        // ---- ④ 📱 폰 측정 화면(?role=phone) 숨 참기: 회차·보내는 원본에 facing ----
        const P = await page(devices['iPhone 13'], 'P', CAM(false), 'projects/heart-rate.html?role=phone&group=3-1-4821#breath-scale=0.2');
        assert.equal(await P.isVisible('#facing'), true);
        await P.click('#facing button[data-facing="user"]');
        await P.click('#cam');
        await P.waitForFunction(() => /좋아요/.test(document.getElementById('v-qtext').textContent), null, { timeout: 15000 });
        await P.click('#mode-breath');
        await P.check('#br-sit'); await P.check('#br-watch'); await P.check('#br-ok');
        await P.waitForFunction(() => !document.getElementById('br-start').disabled, null, { timeout: 15000 });
        await P.click('#br-start');
        await P.waitForFunction(() => document.getElementById('br-phase').textContent === '숨 참기', null, { timeout: 30000 });
        await P.waitForTimeout(2000);
        await P.click('#br-stop');
        await P.waitForFunction(() => window.__breath.state().phoneRuns.length === 1, null, { timeout: 40000 });
        const pr = await P.evaluate(() => window.__breath.state().phoneRuns[0]);
        assert.equal(pr.facing, 'user');
        const packed = await P.evaluate(r => HeartRateRaw.rawPack(HeartRateMath.unpack(r.raw), { mode: 'breath', facing: r.facing }), pr);
        assert.equal(packed.facing, 'user'); assert.equal(HeartRateRawNode().rawUnpack(packed).facing, 'user');
        console.log('④ 폰 숨 참기 회차 facing:', pr.facing);

        // ---- ⑤ 어두운 방(선생님 실측 r27 흉내): 자동 노출이 이미 셔터 한계 → 잠그지 않고, 15초를 30초로 ----
        const D = await page(devices['Pixel 7'], 'D', CAM(false, true));
        await D.click('#cam');
        await D.waitForFunction(() => window.__hrCore.hasCamera() && window.__hrCore.live().length > 40, null, { timeout: 15000 });
        await D.selectOption('#dur', '15');
        const t0 = Date.now();
        await D.click('#start');
        await D.waitForFunction(() => /30초/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
        console.log('⑤ 잠금까지', ((Date.now() - t0) / 1000).toFixed(1) + '초 ·', (await D.textContent('#msg')).replace(/\s+/g, ' '));
        assert.ok(Date.now() - t0 < 6000, '잠금 시도에 시간을 쓰지 않음');
        await D.waitForFunction(() => window.__hrCore.runs().length === 1, null, { timeout: 50000 });
        const dr = await D.evaluate(() => window.__hrCore.runs()[0]);
        console.log('⑤ 어두운 회차:', dr.lock, dr.why, dr.lockLog && dr.lockLog.steps.length, dr.res.dur, dr.res.bpm);
        assert.equal(dr.lock, 'unlocked'); assert.match(dr.why, /어두워서 자동 노출이 이미 한계/);
        assert.equal(dr.lockLog.skipped, true); assert.equal(dr.lockLog.steps.length, 1, '잠그기 전만 (밝기 맞추기 없음)');
        assert.ok(dr.res.dur > 27, '30초로 늘림 ' + dr.res.dur);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); stat.close();
    }
});
function HeartRateRawNode() { return require(REPO + '/js/heart-rate-raw.js'); }
