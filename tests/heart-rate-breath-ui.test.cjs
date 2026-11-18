// 숨 참기 탐구 화면 (projects/heart-rate.html '🫁 숨 참기 탐구'): 가짜 카메라 + 가짜 Apps Script, 구간 길이 0.2 배(#breath-scale=0.2)
//  안전 확인 전에는 시작 막힘 → 안정 → 숨 참기 → ■ 멈춤(누른 때 기록) → 회복 → 저장·지표, 동의 안 하면 보내기 막힘·동의하면 kind 'breath' 로 보냄,
//  CSV 머리말, 30초·60초 두 회차 비교, 375px 가로 스크롤 없음·44px
const http = require('http'), path = require('path'), fs = require('fs');
const REPO = path.join(__dirname, '..');
const { loadLabStore } = require(REPO + '/tests/fake-lab-store.cjs');
let chromium = null, devices = null;
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const test = require('node:test');
const assert = require('node:assert/strict');

const app = loadLabStore();
const api = http.createServer((req, res) => {
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    const u = new URL(req.url, 'http://x');
        let b = ''; req.on('data', c => b += c); req.on('end', () => app.post(b).then(send));
});
const stat = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), p = path.join(REPO, decodeURIComponent(u.pathname));
    fs.readFile(p, (e, d) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d);
    });
});
// 손가락으로 덮은 것처럼 붉은 화면이 75 회/분으로 오르내림, 노출 잠금 가능 (heart-rate-ui 시험의 'lock' 과 같음)
const CAM = `(() => {
    const srgb = l => { const c = Math.min(1, Math.max(0, l)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); };
    navigator.mediaDevices.getUserMedia = async () => {
        const cv = document.createElement('canvas'); cv.width = 160; cv.height = 120;
        const c = cv.getContext('2d'), t0 = performance.now();
        const draw = () => {
            const t = (performance.now() - t0) / 1000, ph = (t * 75 / 60) % 1;
            const p = Math.exp(-(((ph - 0.15) / 0.09) ** 2)) + 0.35 * Math.exp(-(((ph - 0.5) / 0.08) ** 2));
            const L = 1 - 0.05 * p, R = srgb(0.45 * L), G = srgb(0.015 * L), B = srgb(0.008 * L);
            const img = c.createImageData(160, 120), d = img.data;
            for (let i = 0; i < d.length; i += 4) { d[i] = R + 3 * (Math.random() - 0.5); d[i + 1] = G + 3 * (Math.random() - 0.5); d[i + 2] = B + 3 * (Math.random() - 0.5); d[i + 3] = 255; }
            c.putImageData(img, 0, 0);
        };
        draw(); setInterval(draw, 16);
        const stream = cv.captureStream(30), tr = stream.getVideoTracks()[0];
        let st = { exposureMode: 'continuous', exposureTime: 330, iso: 800, whiteBalanceMode: 'continuous', torch: false };
        const base = tr.getSettings.bind(tr);
        tr.getCapabilities = () => ({ exposureMode: ['continuous', 'manual'], exposureTime: { min: 1, max: 10000, step: 1 }, iso: { min: 50, max: 3200 }, whiteBalanceMode: ['continuous', 'manual'] });
        tr.getSettings = () => Object.assign(base(), st);
        tr.applyConstraints = async c => { (c.advanced || []).forEach(a => Object.assign(st, a)); };
        return stream;
    };
})();`;

test('숨 참기 탐구: 안전 확인 · 멈춤 · 지표 · 동의해야 보냄 · CSV · 비교 · 375px', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    try {
        const c = await browser.newContext(Object.assign({ acceptDownloads: true }, devices['Pixel 7']));
        c.setDefaultTimeout(15000);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.LAB_STORE_FAKE_URL=${JSON.stringify(API)};window.PENDULUM_CONFIG={pollSeconds:3};` }));
        await c.route(/gstatic|jsdelivr/, r => r.abort());
        await c.addInitScript(CAM);
        const P = await c.newPage();
        P.on('pageerror', e => errors.push(e.message));
        P.on('dialog', d => d.accept());
        await P.goto(ROOT + 'projects/heart-rate.html#breath-scale=0.2');
        await P.click('#mode-breath');
        assert.equal(await P.isVisible('#breath'), true);
        assert.equal(await P.isVisible('#start'), false, '한 번 재기 단추는 숨김');
        assert.equal(await P.isDisabled('#br-start'), true);
        assert.match(await P.textContent('#br-why'), /카메라를 먼저/);
        await P.click('#cam');
        await P.waitForFunction(() => /좋아요/.test(document.getElementById('v-qtext').textContent), null, { timeout: 10000 });
        await P.waitForFunction(() => /안전 확인 셋/.test(document.getElementById('br-why').textContent));
        await P.check('#br-sit'); await P.check('#br-watch');
        assert.equal(await P.isDisabled('#br-start'), true, '둘만 체크하면 아직 막힘');
        await P.check('#br-ok');
        await P.waitForFunction(() => !document.getElementById('br-start').disabled);
        // 선택 항목 (동의는 안 함)
        await P.click('#br-profile-box summary');
        await P.selectOption('#br-ex', '주 1~2회'); await P.selectOption('#br-h', '160대');
        assert.equal(await P.locator('#br-profile-box select').count(), 3, '성별 칸 없음');
        assert.ok(!/성별을 (고르|적)/.test(await P.textContent('#br-profile-box')));

        // ---- 1회: 30초(→6초) 숨 참기, 중간에 ■ 멈춤 ----
        await P.click('#br-start');
        await P.waitForFunction(() => document.getElementById('br-phase').textContent === '안정', null, { timeout: 15000 });
        assert.match(await P.textContent('#br-guide'), /편하게 앉아/);
        assert.equal(await P.isVisible('#br-stop'), false, '안정 때는 멈춤 단추 없음');
        await P.waitForFunction(() => document.getElementById('br-phase').textContent === '숨 참기', null, { timeout: 20000 });
        assert.equal(await P.isVisible('#br-stop'), true);
        await P.waitForTimeout(3000);
        await P.click('#br-stop');
        await P.waitForFunction(() => document.getElementById('br-phase').textContent === '회복');
        await P.waitForFunction(() => window.__breath.state().runs.length === 1, null, { timeout: 30000 });
        const r1 = await P.evaluate(() => window.__breath.state().runs[0]);
        console.log('1회:', JSON.stringify(r1.ph), JSON.stringify(r1.metrics));
        assert.equal(r1.ph.stopped, true); assert.equal(r1.ph.holdPlanned, 30);
        assert.ok(r1.metrics.heldSec > 2 && r1.metrics.heldSec < 4.5, '멈춘 때 ' + r1.metrics.heldSec);
        assert.ok(Math.abs(r1.metrics.restMean - 75) <= 4, '안정 평균 ' + r1.metrics.restMean);
        assert.ok(Math.abs(r1.metrics.changePct) < 8, '변화율 ' + r1.metrics.changePct);
        assert.equal(r1.consent, false); assert.equal(r1.profile.exercise, '주 1~2회');
        assert.equal(await P.isVisible('#br-result'), true);
        assert.match(await P.textContent('#br-metrics'), /안정 평균.*회\/분.*변화율.*회복 시간.*참은 시간.*\(멈춤\)/s);

        // ---- 동의 안 함 → 보내기 막힘 ----
        assert.equal(await P.isDisabled('#br-send'), true);
        await P.fill('#cs-group', '3-2-4821'); await P.press('#cs-group', 'Enter');
        await P.waitForTimeout(500);
        await P.evaluate(() => document.getElementById('cs-share').open = true);
        await P.click('#cs-send');
        await P.waitForTimeout(1500);
        assert.equal((await app.get({ action: 'list', exp: 'heartrate', group: '3-2-4821' })).items.length, 0, '동의 안 한 회차는 시트에 안 감');
        // ---- 동의 → 보냄 ----
        await P.check('[data-consent="b1"]');
        await P.waitForFunction(() => !document.getElementById('br-send').disabled);
        assert.match(await P.textContent('#br-send'), /1개/);
        await P.click('#br-send');
        await P.waitForFunction(() => /보냈|못했/.test(document.getElementById('br-send-st').textContent), null, { timeout: 15000 });
        const rows = (await app.get({ action: 'list', exp: 'heartrate', group: '3-2-4821' })).items;
        console.log('시트:', rows.map(r => r.title + ' ' + JSON.stringify(r.summary)));
        assert.equal(rows.length, 1);
        assert.deepEqual(Object.keys(rows[0].summary), ['변화율(%)', '참은 초', '안정 평균', '회복 시간(초)']);
        const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
        assert.equal(data.kind, 'breath'); assert.equal(data.profile.height, '160대');
        assert.ok(!JSON.stringify(data).includes('gender'));

        // ---- CSV ----
        const [dl] = await Promise.all([P.waitForEvent('download'), P.click('[data-csv="b1"]')]);
        const csv = fs.readFileSync(await dl.path(), 'utf8');
        assert.match(csv, /# 구간: 안정 0~[\d.]+초 · 숨 참기 [\d.]+~[\d.]+초\(계획 30초, 멈춤\)/);
        assert.match(csv, /# 선택 항목: 운동 습관 주 1~2회 · 키 160대 · 몸무게 안 씀 · 수업 분석 동의 예/);
        assert.match(csv, /\nt_s,phase,bpm,conf,used\n5,안정,/);

        // ---- 2회: 60초(→12초), 끝까지 ----
        await P.click('.br-len button[data-hold="60"]');
        await P.waitForFunction(() => !document.getElementById('br-start').disabled);
        await P.click('#br-start');
        await P.waitForFunction(() => window.__breath.state().runs.length === 2, null, { timeout: 60000 });
        const r2 = await P.evaluate(() => window.__breath.state().runs[1]);
        console.log('2회:', JSON.stringify(r2.ph), JSON.stringify(r2.metrics));
        assert.equal(r2.ph.stopped, false); assert.equal(r2.ph.holdPlanned, 60);
        assert.ok(Math.abs(r2.metrics.heldSec - 12) <= 1, '참은 초(0.2 배) ' + r2.metrics.heldSec);
        assert.ok(Math.abs(r2.metrics.holdLastMean - 75) <= 4, '마지막 10초 ' + r2.metrics.holdLastMean);
        // 비교: 기본으로 최근 30초·60초 두 회차
        assert.equal(await P.locator('[data-cmp]:checked').count(), 2);

        // ---- 375px ----
        await P.setViewportSize({ width: 375, height: 760 });
        await P.evaluate(() => document.querySelectorAll('#breath details').forEach(d => { d.open = true; }));
        await P.waitForTimeout(300);
        assert.equal(await P.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '가로 스크롤');
        const small = await P.evaluate(() => [...document.querySelectorAll('#breath button, #breath select, #breath summary, #breath label.chk, .mode-pick button')]
            .filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim().slice(0, 20)));
        assert.deepEqual(small, [], '44px 보다 작은 단추');
        if (process.env.SHOT_DIR) await P.screenshot({ path: process.env.SHOT_DIR + '/breath-375.png', fullPage: true });
        // 다시 '심박수 재기' 로 돌아가면 숨 참기 칸은 숨김
        await P.click('#mode-live');
        assert.equal(await P.isVisible('#breath'), false); assert.equal(await P.isVisible('#start'), true);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close().catch(() => {});
        api.close(); stat.close();
    }
});
