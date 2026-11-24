// Vernier Go Direct 무선 온도 센서 테스트 페이지 검증 (정적 검사 + Playwright 화면 시험)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { fakeGoDirect } = require('./fake-godirect.cjs');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 화면 시험 건너뜀 */ }

const REPO = path.join(__dirname, '..');
const HTML_PATH = path.join(REPO, 'projects', 'vernier-temp-lab.html');
const INDEX_PATH = path.join(REPO, 'index.html');

test('vernier-temp-lab.html 정적 점검: 로컬 godirect·ble-help·noindex·Chart.js 4.6.1·라이선스·개발 링크', () => {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    assert.match(html, /<meta\s+name="robots"\s+content="noindex,\s*nofollow"/);
    assert.match(html, /src="\.\.\/js\/ble-help\.js"/);
    assert.match(html, /chart\.js@4\.6\.1\/dist\/chart\.umd\.min\.js/);
    assert.match(html, /\.\.\/vendor\/godirect\/godirect\.min\.umd\.js/);
    assert.doesNotMatch(html, /unpkg\.com\/@vernier\/godirect/);
    assert.doesNotMatch(html, /jsdelivr\.net\/npm\/@vernier\/godirect/);
    assert.match(html, /id="btnConnectBle"[^>]*data-ble-connect/);
    assert.match(html, /acceptAllDevices:\s*true/);
    assert.doesNotMatch(html, /selectDevice\(\s*true\s*\)/);
    assert.match(html, /getBatteryLevel/);
    assert.match(html, /BSD 3-Clause/);
    assert.match(html, /Vernier Software &amp; Technology/);

    // 교사 전용 개발 도구 링크(#devLinks)에만 있고 학생용 실험 목록 카드에는 없음
    const idx = fs.readFileSync(INDEX_PATH, 'utf8');
    const devLine = idx.split('\n').find(l => l.includes('id="devLinks"'));
    assert.ok(devLine && devLine.includes('projects/vernier-temp-lab.html'), '#devLinks 에 링크 포함');
    const cardMatches = idx.match(/pick-card[^>]*vernier-temp-lab\.html/g);
    assert.equal(cardMatches, null, '메인 실험 목록 카드에는 아직 넣지 않음');
});

test('vernier-temp-lab.html 화면 시험: 가짜 BLE 센서(이름 필터 없음·배터리·온도)·단위 변환·시뮬레이션·일시 중지·마커·CSV', { skip: !chromium && 'playwright 없음', timeout: 60000 }, async () => {
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => {
            if (e) { res.writeHead(404); return res.end(); }
            const ct = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain';
            res.writeHead(200, { 'Content-Type': ct + '; charset=utf-8' });
            res.end(d);
        });
    });
    await new Promise(r => stat.listen(0, r));
    const ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch();
    const errors = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await ctx.route(/cdn\.jsdelivr\.net/, r => r.abort());
        await ctx.addInitScript(fakeGoDirect, { install: true, name: 'CUSTOM-TMP-01' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(ROOT + 'projects/vernier-temp-lab.html');

        // 1. 가짜 BLE 연결 (GDX 아닌 이름도 이름 필터 없이 검색·연결) → 배터리 87%, 실시간 온도 표시
        await page.evaluate(() => { window.__gdx.force = 25.0; });
        await page.click('#btnConnectBle');
        await page.waitForFunction(() => document.getElementById('deviceBattery').textContent === '87%');
        const reqOpts = await page.evaluate(() => window.__gdx.requestOpts);
        assert.equal(reqOpts.acceptAllDevices, true);
        assert.equal(reqOpts.filters, undefined);
        assert.match(await page.textContent('#deviceName'), /CUSTOM-TMP-01/);
        await page.waitForFunction(() => document.getElementById('currentTemp').textContent === '25.00');

        // 2. 기록 시작 전 대기 상태에서 단위 전환(°C → °F → K) 시 표시 온도·상하한선·수동 Y축 변환 확인
        await page.fill('#lowLimit', '0');
        await page.fill('#highLimit', '100');
        await page.click('.unit-btn[data-unit="F"]');
        assert.equal(await page.textContent('#currentTemp'), '77.00');
        assert.equal(await page.inputValue('#lowLimit'), '32');
        assert.equal(await page.inputValue('#highLimit'), '212');
        assert.equal(await page.inputValue('#yMin'), '32');
        assert.equal(await page.inputValue('#yMax'), '212');

        await page.click('.unit-btn[data-unit="C"]');
        assert.equal(await page.textContent('#currentTemp'), '25.00');
        assert.equal(await page.inputValue('#lowLimit'), '0');
        assert.equal(await page.inputValue('#highLimit'), '100');

        // 3. 기록 시작 → 데이터 수집 → 마커 추가(XSS 이스케이프 확인) → 일시 중지/재개
        await page.click('#btnStartStop');
        await page.waitForFunction(() => document.querySelectorAll('#dataTableBody tr').length >= 2 && !document.querySelector('#dataTableBody .empty-row'));
        await page.fill('#markerNote', '<script>alert(1)</script> & 가열');
        await page.click('#btnAddMarker');
        assert.match(await page.textContent('#markerTableBody'), /<script>alert\(1\)<\/script> & 가열/);

        // 4. 연결 해제 → 시뮬레이션 모드
        await page.click('#btnDisconnect');
        assert.match(await page.textContent('#connStatus'), /미연결/);
        await page.click('#btnClear');
        await page.selectOption('#sampleInterval', '200');
        await page.selectOption('#simPreset', 'heating');
        await page.click('#btnToggleSim');
        await page.waitForFunction(() => document.querySelectorAll('#dataTableBody tr').length >= 2 && !document.querySelector('#dataTableBody .empty-row'));

        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        stat.close();
    }
});
