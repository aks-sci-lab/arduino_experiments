// 교사 화면 플랑크 수업 결과 (js/class-teacher-planck.js, 예전 apps-script/planck-led 웹앱 선생님 화면을 옮김):
// 학생 노트북이 조 공유로 보낸 LED 줄(가짜 저장소) → 조별 V₀ 다시 계산 → V₀–f 직선 → 조 h, CSV, 그래프 그림
const test = require('node:test');
const assert = require('node:assert/strict');
const CTP = require('../js/class-teacher-planck.js');
const PC = require('../js/planck-cloud.js');
const C = require('../js/pendulum-cloud.js');
const P = require('../js/planck-math.js');
const { loadLabStore } = require('./fake-lab-store.cjs');

// 문턱 전압 vt 에서 직선으로 오르는 I–V (직선 연장으로 vt 가 나옴)
const ivFor = vt => [0, 0.05, 0.1, 0.15, 0.2].map(d => ({ v: +(vt + d).toFixed(4), i: +(d * 40).toFixed(3) }));
const v0Of = lambda => P.H_TRUE * P.freqOf(lambda) / P.E_CHARGE;

async function sent(app, group, device, list) {
    const leds = list.map(([key, name, lambda]) => ({ id: key, key, name, lambda, on: true, fit: true, iv: ivFor(v0Of(lambda)), glow: [+(v0Of(lambda) - 0.05).toFixed(3)] }));
    const { payloads } = PC.buildPayloads({ group, device, leds, sent: [], v0: (led, m) => { const t = P.thresholdOf(led, m === 'glow' ? 'glow' : 'extrapolate', { iMin: 1 }); return t.error ? null : t.v0; },
        summary: { hCurrent: 6.6, errorPct: 0 }, curMode: 'extrapolate', iMin: 1, now: '2026-11-20T01:00:00.000Z' }, C.isGroupCode);
    for (const p of payloads) { const r = await app.post(p); assert.equal(r.ok, true, r.error); }
}

test('조별 요약: V₀ 를 측정값으로 다시 계산해 조 h ≈ 6.6×10⁻³⁴, 노트북 두 대를 한 조로', async () => {
    const app = loadLabStore();
    const groups = [{ jo: 1, code: '2-1-4821' }, { jo: 2, code: '2-2-4821' }, { jo: 3, code: '2-3-4821' }];
    await sent(app, '2-1-4821', 'nab12cd', [['red', '빨강', 625], ['green', '초록', 525]]);
    await sent(app, '2-1-4821', 'nzz9999', [['blue', '파랑', 470]]);
    await sent(app, '2-2-4821', 'nqq1111', [['red', '빨강', 625]]);
    const items = (await app.get({ action: 'list', exp: 'planck', group: '2-1-4821' })).items
        .concat((await app.get({ action: 'list', exp: 'planck', group: '2-2-4821' })).items);
    const sum = CTP.summarize(items, groups);
    assert.deepEqual(sum.map(g => g.jo), [1, 2, 3], '보낸 것이 없는 조도 줄이 있음');
    const g1 = sum[0];
    assert.equal(g1.leds.length, 3); assert.equal(g1.devices, 2);
    assert.deepEqual(g1.leds.map(l => l.lambda), [625, 525, 470], '파장 긴 것부터');
    g1.leds.forEach(l => assert.ok(Math.abs(l.v0 - v0Of(l.lambda)) < 0.01, l.led + ' V₀'));
    assert.ok(g1.fit && Math.abs(g1.fit.h / P.H_TRUE - 1) < 0.03, '조 h: ' + (g1.fit && g1.fit.h));
    assert.ok(g1.fitGlow, '빛 기준 직선도');
    assert.equal(sum[1].leds.length, 1); assert.equal(sum[1].fit, null, 'LED 하나면 직선 없음');
    assert.equal(sum[2].leds.length, 0);
});

test('CSV: 한글 안 깨짐(BOM)·수식처럼 보이는 이름은 글자로·조 하나만', async () => {
    const app = loadLabStore();
    await sent(app, '2-1-4821', 'nab12cd', [['red', '=1+1', 625], ['green', '초록', 525]]);
    const items = (await app.get({ action: 'list', exp: 'planck', group: '2-1-4821' })).items;
    const sum = CTP.summarize(items, [{ jo: 1, code: '2-1-4821' }, { jo: 2, code: '2-2-4821' }]);
    const csv = CTP.toCsv(sum);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.ok(csv.includes("'=1+1"), '수식 막기');
    assert.ok(!/(^|,)=1\+1/m.test(csv));
    assert.ok(CTP.toCsv(sum, '2-2-4821').split('\r\n').filter(Boolean).length < csv.split('\r\n').filter(Boolean).length);
});

test('그래프 그림: 점·직선·이론선이 있는 SVG, 이름은 글자로', async () => {
    const app = loadLabStore();
    await sent(app, '2-1-4821', 'nab12cd', [['red', '<b>x</b>', 625], ['blue', '파랑', 470]]);
    const items = (await app.get({ action: 'list', exp: 'planck', group: '2-1-4821' })).items;
    const g = CTP.summarize(items, [{ jo: 1, code: '2-1-4821' }])[0];
    const svg = CTP.chartSvg(g);
    assert.match(svg, /^<svg/);
    assert.equal((svg.match(/<circle/g) || []).length, 2);
    assert.match(svg, /stroke="#1565c0"/);
    assert.ok(!svg.includes('<b>x</b>'), '받은 이름을 HTML 로 넣지 않음');
});

// ---- 화면: 교사 로그인 → 플랑크 수업 → 학생 노트북이 보낸 LED → 🔬 결과 칸 (375px) ----
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
test('교사 화면: 플랑크 수업이면 조별 h 표·그래프·CSV 가 나옴 (받은 이름은 글자로)', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
    const { labServer, configJs } = require('./fake-lab-store.cjs');
    const REPO = path.join(__dirname, '..');
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    try {
        const c = await browser.newContext({ viewport: { width: 375, height: 800 }, acceptDownloads: true });
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg></svg>"}}};' }));
        await c.route(/gstatic/, r => r.abort());
        const T = await c.newPage(); T.on('pageerror', e => errors.push(e.message)); T.on('dialog', d => d.accept());
        await T.goto(ROOT + 'projects/class-teacher.html');
        await T.click('#btnLogin');
        await T.waitForSelector('#btnSettings:not([hidden])');
        await T.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); });
        await T.click('#ctTabs button[data-tab="make"]');
        await T.fill('#inBan', '2'); await T.fill('#inN', '4'); await T.fill('#inSize', '2');
        await T.selectOption('#inExp', 'planck');
        await T.click('#btnCreate');
        await T.waitForSelector('#classOut:not([hidden])');
        const code = (await T.textContent('#outCode')).trim();
        const info = await app.post({ action: 'joinInfo', class: code }, {});
        assert.equal(info.ok, true, info.error);
        const space = decodeURIComponent((T.url().match(/#class=([^&]+)/) || [])[1] || '');   // 만든 수업은 주소 #class= 에
        assert.match(space, /^c[a-z0-9]{23}$/);
        // 1조 노트북이 LED 3개를 수업 공간으로 보냄
        const leds = [['red', '<img src=x onerror=alert(1)>', 625], ['green', '초록', 525], ['blue', '파랑', 470]]
            .map(([key, name, lambda]) => ({ id: key, key, name, lambda, on: true, fit: true, iv: ivFor(v0Of(lambda)), glow: [] }));
        const { payloads } = PC.buildPayloads({ group: info.groups[0].code, device: 'nab12cd', leds, sent: [], v0: led => P.thresholdOf(led, 'extrapolate', { iMin: 1 }).v0,
            summary: { hCurrent: 6.6 }, curMode: 'extrapolate', iMin: 1, now: new Date().toISOString() }, C.isGroupCode);
        for (const p of payloads) { const r = await app.post(Object.assign({ space: String(space).replace(/^lab:/, '') }, p), { uid: 'stu-1', anonymous: true }); assert.equal(r.ok, true, r.error); }
        await T.evaluate(() => { const b = document.getElementById('btnMain'); if (!b.hidden) b.click(); });   // 만든 수업의 큰 QR 화면
        await T.click('#btnToRun');   // 다음 → 진행 보기
        await T.waitForSelector('#planckCard:not([hidden])', { timeout: 10000 });
        await T.click('#ctpReload');
        await T.waitForFunction(() => /6\.\d\d/.test(document.getElementById('ctpTable').textContent), null, { timeout: 10000 });
        await T.click('#ctpTable .ctp-row');
        await T.waitForSelector('#ctpDetail:not([hidden])');
        assert.equal(await T.locator('#ctpChart circle').count(), 3);
        assert.equal(await T.locator('#ctpLeds img').count(), 0, '받은 LED 이름을 HTML 로 넣지 않음');
        await T.evaluate(() => { const d = document.querySelector('#planckCard details.ct-teach'); if (d) d.open = true; });   // CSV 는 선생님용 접기 안
        const [dl] = await Promise.all([T.waitForEvent('download'), T.click('#ctpCsv')]);
        const csv = fs.readFileSync(await dl.path(), 'utf8');
        assert.equal(csv.charCodeAt(0), 0xfeff); assert.match(csv, /파랑/);
        assert.equal(await T.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px 가로 스크롤');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
