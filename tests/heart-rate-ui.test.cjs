// 스마트폰 카메라 심박수 화면 (projects/heart-rate.html): 가짜 카메라(canvas 로 만든 맥파 영상) + 가짜 Apps Script
//  노트북(1280) 조 코드 → 📱 QR → 폰(Pixel 7)에서 카메라 측정(노출 고정) → 회차 골라 보내기 → 노트북 결과 단계 회복 그래프
//  노출을 고정할 수 없는 카메라(아이폰처럼) → '노출 고정 안 됨' 표시. 375px 가로 스크롤 없음, 단추 44px
const http = require('http'), path = require('path'), fs = require('fs');
const REPO = path.join(__dirname, '..');
const { loadCodeGs } = require(REPO + '/tests/fake-apps-script.cjs');
let chromium = null, devices = null;
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require(REPO + '/js/heart-rate-math.js');

const app = loadCodeGs();
// 서버 Code.gs 에는 아직 heartrate 가 없음 (통합 관리 세션이 서버에 넣을 예정) → 시험에서만 허용 목록에 더함
app.ctx.GENERIC_EXPS.heartrate = 1; app.ctx.CLASS_EXPS.heartrate = 1;
const api = http.createServer((req, res) => {
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    const u = new URL(req.url, 'http://x');
    if (req.method === 'GET') return send(app.get(Object.fromEntries(u.searchParams)));
    let b = ''; req.on('data', c => b += c); req.on('end', () => send(app.post(b)));
});
const stat = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = path.join(REPO, decodeURIComponent(u.pathname));
    fs.readFile(p, (e, d) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d);
    });
});
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';

// 가짜 카메라: 손가락으로 덮은 것처럼 붉은 화면이 BPM 회/분으로 어두워졌다 밝아짐. lock=true 면 노출 고정을 흉내 냄
function fakeCamera(bpm, lock) {
    return `(() => {
        const BPM = ${bpm}, LOCK = ${lock};
        window.__applied = [];
        navigator.mediaDevices.getUserMedia = async () => {
            const cv = document.createElement('canvas'); cv.width = 160; cv.height = 120;
            const c = cv.getContext('2d'), t0 = performance.now();
            const draw = () => {
                const t = (performance.now() - t0) / 1000, ph = (t * BPM / 60) % 1;
                const p = Math.exp(-(((ph - 0.15) / 0.09) ** 2)) + 0.35 * Math.exp(-(((ph - 0.5) / 0.08) ** 2));
                const k = 1 - 0.05 * p;
                c.fillStyle = 'rgb(' + Math.round(200 * k) + ',' + Math.round(35 * k) + ',' + Math.round(25 * k) + ')';
                c.fillRect(0, 0, 160, 120);
            };
            draw(); setInterval(draw, 16);
            const stream = cv.captureStream(30), tr = stream.getVideoTracks()[0];
            if (LOCK) {
                let st = { exposureMode: 'continuous', exposureTime: 330, iso: 800, whiteBalanceMode: 'continuous', torch: false };
                const base = tr.getSettings.bind(tr);
                tr.getCapabilities = () => ({ exposureMode: ['continuous', 'manual'], exposureTime: { min: 1, max: 10000, step: 1 }, iso: { min: 50, max: 3200 }, whiteBalanceMode: ['continuous', 'manual'], torch: true });
                tr.getSettings = () => Object.assign(base(), st);
                tr.applyConstraints = async c => { window.__applied.push(JSON.parse(JSON.stringify(c))); (c.advanced || []).forEach(a => Object.assign(st, a)); };
            } else {
                tr.getCapabilities = () => ({ width: { min: 1, max: 160 } });
            }
            return stream;
        };
    })();`;
}

test('심박수: 노트북 QR → 폰 카메라 측정(노출 고정) → 골라 보내기 → 노트북 회복 그래프, 노출 고정 안 되는 폰, 375px', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    async function ctx(opt, name, cam) {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.PENDULUM_CONFIG={appsScriptUrl:${JSON.stringify(API)},pollSeconds:3};` }));
        await c.route(/qrcode-generator/, r => r.fulfill({ contentType: 'text/javascript', body: QR }));
        await c.route(/gstatic|jsdelivr/, r => r.abort());
        if (cam) await c.addInitScript(cam);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message));
        pg.on('dialog', d => d.accept());
        return pg;
    }
    const layout = async (pg, n) => {
        const ov = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.equal(ov, 0, n + ' 가로 스크롤');
        const small = await pg.evaluate(() => [...document.querySelectorAll('button, select, .btn, .cs-btn, input[type=number]')]
            .filter(e => e.offsetParent && !e.closest('td, th') && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim().slice(0, 20)));
        assert.deepEqual(small, [], n + ' 44px 보다 작은 단추');
    };

    // ---- 노트북 ----
    const L = await ctx({ viewport: { width: 1280, height: 800 } }, 'L');
    await L.goto(ROOT + 'projects/heart-rate.html');
    assert.equal(await L.locator('nav.steps button').count(), 7);
    await L.click('nav.steps [data-step=data]');
    await L.fill('#cs-group', '3-2-4821'); await L.press('#cs-group', 'Enter');
    await L.waitForTimeout(300);
    await L.click('#cs-phone');
    await L.waitForSelector('.cs-dlg:not([hidden])');
    const link = await L.getAttribute('#cs-plink', 'href');
    assert.match(link, /heart-rate\.html\?role=phone&group=3-2-4821/);
    await L.click('#cs-pclose');

    // ---- 폰 (노출 고정 되는 가짜 카메라) ----
    const P = await ctx(devices['Pixel 7'], 'P', fakeCamera(75, true));
    await P.goto(link);
    assert.equal(await P.evaluate(() => document.body.classList.contains('hr-phone')), true);
    assert.equal(await P.isVisible('nav.steps'), false);
    assert.equal(await P.isVisible('#measure'), true);
    await P.click('#cam');
    await P.waitForFunction(() => /노출: 측정 시작 때 고정/.test(document.getElementById('lock-st').textContent));
    await P.waitForFunction(() => /좋아요/.test(document.getElementById('q-st').textContent), null, { timeout: 10000 });
    assert.equal(await P.isVisible('#torch-wrap'), true, '플래시 고르기');
    await P.selectOption('#label', '안정 시'); await P.selectOption('#dur', '15');
    await P.click('#start');
    await P.waitForFunction(() => /노출을 잠갔/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
    const applied = await P.evaluate(() => window.__applied);
    assert.ok(applied.some(c => c.advanced && c.advanced[0].exposureMode === 'manual' && c.advanced[0].exposureTime === 330 && c.advanced[0].iso === 800), JSON.stringify(applied));
    await P.waitForTimeout(8000);
    assert.notEqual(await P.textContent('#bpm-now'), '--', '측정 중 큰 숫자');
    await P.waitForFunction(() => /저장했어요/.test(document.getElementById('msg').textContent), null, { timeout: 20000 });
    const run1 = (await P.evaluate(() => window.__heartRate.state().runs))[0];
    console.log('폰 카메라 측정:', run1.res.bpm, '회/분', run1.res.level, run1.res.method, '프레임', run1.raw.length, run1.res.fpsMean + '장/초', '노출', run1.lock);
    assert.equal(run1.lock, 'locked');
    assert.ok(Math.abs(run1.res.bpm - 75) <= 4, '75 회/분 ≈ ' + run1.res.bpm);
    assert.ok(run1.raw.length > 200);
    assert.ok(run1.raw.every(f => f[4] === 330 && f[5] === 800), '프레임마다 노출 값 기록');
    // 손목 15초 = 19 → 76 회/분
    await P.fill(`[data-palp="${run1.id}"]`, '19'); await P.press(`[data-palp="${run1.id}"]`, 'Tab');
    assert.match(await P.textContent('#runs'), /= 76 회\/분/);
    // 두 번째 회차는 시간을 아끼려고 같은 방식의 자료를 직접 넣음 (2분 뒤로 놓은 '운동 직후' 130 회/분)
    await P.evaluate(fr => {
        window.__heartRate.addRun({ label: '운동 직후', lock: 'locked', frames: fr, at: new Date(Date.now() + 120000).toISOString() });
    }, H.simulate({ bpm: 130, dur: 15, seed: 3 }));
    // 시뮬레이션 단추도
    await P.click('details.sim summary'); await P.fill('#sim-bpm', '95'); await P.click('#sim');
    assert.equal(await P.locator('.cs-run').count(), 3);
    await layout(P, 'P(Pixel 7)');
    await P.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/heart-phone.png' : '/dev/null', fullPage: true }).catch(() => {});
    // 시뮬레이션 회차는 빼고 보내기
    const ids = await P.evaluate(() => window.__heartRate.state().runs.map(r => r.id));
    await P.locator(`.cs-run input[type=checkbox][data-id=${ids[2]}]`).uncheck();
    await P.click('#cs-rsend');
    await P.waitForFunction(() => /보냈|못했/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 20000 });
    assert.match(await P.textContent('#cs-pmsg'), /보냈/);
    const rows = app.get({ action: 'list', exp: 'heartrate', group: '3-2-4821' }).items;
    assert.equal(rows.length, 2);
    console.log('시트:', rows.map(r => r.title + ' ' + JSON.stringify(r.summary)));

    // ---- 노트북: 받아서 결과 ----
    await L.waitForFunction(() => Object.keys(window.__heartRate.state().ext).length === 2, null, { timeout: 20000 });
    assert.equal(await L.isVisible('#phone-note'), true);
    await L.click('nav.steps [data-step=result]');
    const legend = await L.textContent('#rec-legend');
    assert.match(legend, /📱 폰/);
    const tbl = await L.textContent('#rec-table');
    assert.match(tbl, /안정 시/); assert.match(tbl, /운동 직후/); assert.match(tbl, /76/);
    // 받은 회차 자세히 (원본으로 다시 계산)
    const opts = await L.locator('#pick option').allTextContents();
    assert.ok(opts.some(o => /📱 폰 .*안정 시/.test(o)), opts.join('|'));
    await L.selectOption('#pick', { index: opts.findIndex(o => /운동 직후/.test(o)) });
    assert.match(await L.textContent('#res-grid'), /13\d(\.\d)? 회\/분|12[7-9](\.\d)? 회\/분/);
    assert.match(await L.textContent('#res-grid'), /고정됨/);
    await L.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/heart-laptop-result.png' : '/dev/null', fullPage: true }).catch(() => {});

    // ---- 노출을 고정할 수 없는 폰 (아이폰처럼), 375px ----
    const N = await ctx({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true }, 'N', fakeCamera(90, false));
    await N.goto(ROOT + 'projects/heart-rate.html#step-5');
    await N.click('#cam');
    await N.waitForFunction(() => /노출을 고정할 수 없어요/.test(document.getElementById('lock-st').textContent));
    assert.equal(await N.isVisible('#torch-wrap'), false);
    await N.selectOption('#dur', '15');
    await N.click('#start');
    await N.waitForFunction(() => /저장했어요|찾지 못했/.test(document.getElementById('msg').textContent), null, { timeout: 30000 });
    const r = (await N.evaluate(() => window.__heartRate.state().runs))[0];
    console.log('노출 고정 없는 카메라:', r.res.bpm, r.lock, r.res.exposure && r.res.exposure.text);
    assert.equal(r.lock, 'unsupported');
    assert.ok(Math.abs(r.res.bpm - 90) <= 4, '90 ≈ ' + r.res.bpm);
    assert.match(await N.textContent('#runs'), /노출 고정 안 됨/);
    assert.match(await N.textContent('#last'), /고정 안 됨/);
    for (const s of ['purpose', 'theory', 'materials', 'procedure', 'data', 'result', 'conclusion']) {
        await N.click(`nav.steps [data-step=${s}]`);
        await N.waitForTimeout(100);
        await layout(N, '375px ' + s);
    }
    await N.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/heart-375-result.png' : '/dev/null', fullPage: true }).catch(() => {});
    await layout(L, '노트북 결과');

    assert.deepEqual(errors, []);
    await browser.close(); api.close(); stat.close();
});
