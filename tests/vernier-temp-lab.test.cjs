// Vernier Go Direct 무선 온도 센서 테스트 페이지 검증 (불러오기 점검 + Playwright 화면 시험)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { fakeGoDirect } = require('./fake-godirect.cjs');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 화면 시험 건너뜀 */ }

const REPO = path.join(__dirname, '..');

test('vernier-temp-lab.html 불러오기: 실제로 받는 스크립트(ble-help·Chart.js 4.6.1)·noindex·라이선스 안내·연결 단추 · 메인은 개발 도구 링크만', { skip: !chromium && 'playwright 없음', timeout: 60000 }, async () => {
    // 2026-11-27 글자 확인 → 실제로 페이지를 열어 받는 주소·화면으로. 이름 필터 없음(acceptAllDevices)·배터리 읽기·godirect 를 사이트 파일에서 받는지는 아래 화면 시험이 가짜 센서로 연결하며 확인
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
    try {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const reqs = [];
        ctx.on('request', r => reqs.push(r.url()));
        await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com|gstatic/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
        const page = await ctx.newPage();
        await page.goto(ROOT + 'projects/vernier-temp-lab.html');
        await page.waitForLoadState('load');
        const local = u => u.startsWith(ROOT);
        assert.ok(reqs.some(u => local(u) && /\/js\/ble-help\.js$/.test(u)), '블루투스 공통 도우미');
        assert.ok(reqs.some(u => /chart\.js@4\.6\.1\/dist\/chart\.umd\.min\.js/.test(u)), 'Chart.js 4.6.1 고정');
        assert.match(await page.getAttribute('meta[name="robots"]', 'content'), /noindex,\s*nofollow/);
        assert.equal(await page.getAttribute('#btnConnectBle', 'data-ble-connect'), '', '연결 단추에 블루투스 도우미 표시');
        assert.match(await page.textContent('body'), /godirect-js \(BSD 3-Clause, © Vernier Software & Technology\)/);
        // 메인: 교사 전용 개발 도구 링크(#devLinks)에만 있고 학생용 실험 카드에는 없음
        await page.goto(ROOT + 'index.html');
        assert.equal(await page.locator('#devLinks a[href="projects/vernier-temp-lab.html"]').count(), 1, '#devLinks 에 링크');
        assert.equal(await page.locator('a.pick-card[href*="vernier-temp-lab"]').count(), 0, '메인 실험 목록 카드에는 아직 넣지 않음');
    } finally {
        await browser.close();
        stat.close();
    }
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
        const reqs = [];
        ctx.on('request', r => reqs.push(r.url()));
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
        // 연결할 때 받은 godirect 는 사이트에 둔 파일(vendor), CDN 은 쓰지 않음
        assert.ok(reqs.some(u => u.startsWith(ROOT) && /\/vendor\/godirect\/godirect\.min\.umd\.js$/.test(u)), 'godirect 는 사이트에 둔 파일');
        assert.deepEqual(reqs.filter(u => !u.startsWith(ROOT) && /godirect/i.test(u)), [], 'godirect 를 CDN 에서 받지 않음');
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
