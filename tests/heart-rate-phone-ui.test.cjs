// 📱 측정은 폰, 분석은 노트북 (선생님 지시): 가짜 카메라 + 가짜 Apps Script
//  노트북(데이터 가공 실험실) QR → 폰(heart-rate.html?role=phone) 한 번 재기 1회 + 숨 참기 1회(0.2 배) → 숨 참기만 골라 보냄
//  → 데이터 가공 실험실 자료 목록에 '📱 폰 …' + 🆕, 최종 심박수 / 심박수 노트북 숨 참기 탐구에 곡선·지표(노트북에서 계산), 폰은 계산 결과 숨김, 375px·44px
const http = require('http'), path = require('path'), fs = require('fs');
const REPO = path.join(__dirname, '..');
const { loadCodeGs } = require(REPO + '/tests/fake-apps-script.cjs');
let chromium = null, devices = null;
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const test = require('node:test');
const assert = require('node:assert/strict');

const app = loadCodeGs();
const api = http.createServer((req, res) => {
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    const u = new URL(req.url, 'http://x');
    if (req.method === 'GET') return send(app.get(Object.fromEntries(u.searchParams)));
    let b = ''; req.on('data', c => b += c); req.on('end', () => send(app.post(b)));
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


const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg></svg>"}}};';
test('📱 폰 측정 → 노트북 분석: 데이터 가공 실험실 · 숨 참기 탐구', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    async function ctx(opt, name) {
        const c = await browser.newContext(opt);
        c.setDefaultTimeout(15000);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.PENDULUM_CONFIG={appsScriptUrl:${JSON.stringify(API)},pollSeconds:2};` }));
        await c.route(/gstatic|jsdelivr/, r => r.abort());
        await c.route(/qrcode-generator/, r => r.fulfill({ contentType: 'text/javascript', body: QR }));
        await c.addInitScript(CAM);
        const pg = await c.newPage(); pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept()); return pg;
    }
    const check = async (pg, n) => {
        const ov = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        const small = await pg.evaluate(() => [...document.querySelectorAll('button, select, .cs-btn, label.btn')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5 && !e.closest('table')).map(e => e.id || e.textContent.trim().slice(0, 20)));
        console.log(n, 'overflow', ov, 'small', small);
        assert.equal(ov, 0, n + ' 가로 스크롤'); assert.deepEqual(small, [], n + ' 44px');
    };
    try {
        const G = '3-2-4821';
        // ---- 노트북 1: 데이터 가공 실험실 → QR ----
        const L = await ctx({ viewport: { width: 1280, height: 800 } }, 'L');
        await L.goto(ROOT + 'projects/data-lab.html');
        await L.waitForFunction(() => /\d/.test(document.getElementById('final').textContent), null, { timeout: 20000 });
        await L.click('#phone-box summary');
        await L.fill('#cs-group', G); await L.press('#cs-group', 'Enter');
        await L.waitForTimeout(400);
        await L.click('#cs-phone');
        await L.waitForSelector('.cs-dlg:not([hidden]) #cs-qr svg', { state: 'attached' });
        const link = await L.getAttribute('#cs-plink', 'href');
        console.log('QR:', link);
        assert.match(link, /projects\/heart-rate\.html\?role=phone&group=3-2-4821/);
        await L.click('#cs-pclose');
        // ---- 노트북 2: 심박수 숨 참기 탐구 (같은 조 코드) ----
        const L2 = await ctx({ viewport: { width: 1280, height: 800 } }, 'L2');
        await L2.goto(ROOT + 'projects/heart-rate.html#breath-scale=0.2');
        await L2.click('#mode-breath');
        await L2.evaluate(() => document.getElementById('cs-share').open = true);
        await L2.fill('#cs-group', G); await L2.press('#cs-group', 'Enter');
        await L2.waitForTimeout(400);
        assert.equal(await L2.isChecked('#cs-auto'), true, '자동 불러오기 켜짐');

        // ---- 폰: 한 번 재기(15초) 1회 + 숨 참기 1회 ----
        const P = await ctx(devices['Pixel 7'], 'P');
        await P.goto(link + '#breath-scale=0.2');
        assert.equal(await P.evaluate(() => document.body.classList.contains('hr-phone')), true);
        assert.equal(await P.isVisible('#runs-box'), false, '폰은 회차 결과 숨김');
        await P.click('#cam');
        await P.waitForFunction(() => /좋아요/.test(document.getElementById('v-qtext').textContent), null, { timeout: 15000 });
        await P.selectOption('#dur', '15');
        await P.click('#start');
        await P.waitForFunction(() => window.__hrCore.runs().length === 1, null, { timeout: 45000 });
        await P.waitForFunction(() => document.querySelectorAll('.cs-run').length === 1);
        await P.click('#mode-breath');
        await P.check('#br-sit'); await P.check('#br-watch'); await P.check('#br-ok');
        await P.waitForFunction(() => !document.getElementById('br-start').disabled, null, { timeout: 15000 });
        await P.click('#br-start');
        await P.waitForFunction(() => document.getElementById('br-phase').textContent === '숨 참기', null, { timeout: 30000 });
        await P.waitForTimeout(3000);
        await P.click('#br-stop');
        await P.waitForFunction(() => window.__breath.state().phoneRuns.length === 1, null, { timeout: 40000 });
        assert.equal(await P.evaluate(() => window.__breath.state().runs.length), 0, '폰은 숨 참기 계산 안 함');
        assert.equal(await P.isVisible('#br-result'), false);
        await P.waitForFunction(() => document.querySelectorAll('.cs-run').length === 2);
        const titles = await P.locator('.cs-run').allTextContents();
        console.log('폰 회차:', titles.map(t => t.replace(/\s+/g, ' ').slice(0, 70)));
        await check(P, 'P(Pixel7)');
        // 한 번 재기는 빼고 숨 참기만 보냄
        const onceId = await P.evaluate(() => window.__hrCore.runs()[0].id);
        await P.locator(`.cs-run input[type=checkbox][data-id="${onceId}"]`).uncheck();
        assert.match(await P.textContent('#cs-rsend'), /1개/);
        await P.click('#cs-rsend');
        await P.waitForFunction(() => /보냈|못했/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 20000 });
        assert.match(await P.textContent('#cs-pmsg'), /보냈/);
        const rows = app.get({ action: 'list', exp: 'heartrate', group: G }).items;
        console.log('시트:', rows.map(r => r.title + ' ' + JSON.stringify(r.summary) + ' ' + String(typeof r.data === 'string' ? r.data.length : JSON.stringify(r.data).length) + '자'));
        assert.equal(rows.length, 1);
        assert.ok('참은 초' in rows[0].summary);
        const d0 = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
        assert.equal(d0.kind, 'raw'); assert.equal(d0.mode, 'breath');
        if (process.env.DUMP) fs.writeFileSync(process.env.DUMP + '.' + Date.now() + '.json', JSON.stringify(d0));

        // ---- 노트북 1: 자료 목록에 📱 폰 + 🆕 → 단계 계산 ----
        await L.waitForFunction(() => !document.getElementById('phone-new').hidden, null, { timeout: 20000 });
        assert.match(await L.textContent('#phone-new'), /폰에서 새 측정 1개/);
        const opts = await L.$$eval('#src option', os => os.filter(o => /📱 폰/.test(o.textContent)).map(o => ({ v: o.value, t: o.textContent })));
        console.log('자료 목록:', opts);
        assert.equal(opts.length, 1); assert.match(opts[0].t, /📱 폰 \w{4} · 1회차/);
        await L.selectOption('#src', opts[0].v);
        await L.waitForFunction(() => /📱 폰/.test(document.getElementById('final-sub').textContent));
        console.log('L store:', (await L.evaluate(() => JSON.stringify(Object.entries(localStorage)))).slice(0, 800), '| sub:', await L.textContent('#final-sub'));
        const fin = Number(await L.textContent('#final'));
        console.log('데이터 가공 최종:', fin, '|', await L.textContent('#src-note'));
        assert.ok(Math.abs(fin - 75) <= 4, '최종 ' + fin);
        assert.match(await L.textContent('#src-note'), /숨 참기.*장/);

        // ---- 노트북 2: 숨 참기 곡선·지표 (노트북에서 계산), 동의는 꺼진 채 ----
        await L2.waitForFunction(() => window.__breath.state().runs.length === 1, null, { timeout: 30000 });
        const r = await L2.evaluate(() => window.__breath.state().runs[0]);
        console.log('노트북 숨 참기:', r.from, JSON.stringify(r.metrics));
        assert.equal(r.consent, false); assert.match(r.srcKey, /^p/);
        assert.ok(Math.abs(r.metrics.restMean - 75) <= 4, '안정 평균 ' + r.metrics.restMean);
        assert.ok(r.metrics.heldSec > 2 && r.metrics.heldSec < 4.5);
        assert.equal(await L2.isVisible('#br-phone-note'), true);
        assert.match(await L2.textContent('#br-phone-note'), /새 회차 1개/);
        assert.equal(await L2.isVisible('#br-result'), true);
        assert.match(await L2.textContent('#br-runs'), /📱/);

        // ---- 375px: 데이터 가공 실험실 ----
        const S = await ctx({ viewport: { width: 375, height: 760 } }, 'S');
        await S.goto(ROOT + 'projects/data-lab.html');
        await S.waitForFunction(() => /\d/.test(document.getElementById('final').textContent), null, { timeout: 20000 });
        await S.click('#phone-box summary');
        await check(S, 'data-lab 375');
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); api.close(); stat.close();
    }
});
