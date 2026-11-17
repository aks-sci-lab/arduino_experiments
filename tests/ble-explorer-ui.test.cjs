// 블루투스 센서 해석 도구 화면 시험 (Playwright). 가짜 navigator.bluetooth: 가짜 온도 센서가 int16LE × 0.01 로 온도를 보냄
// 탐색(기기 정보 자동 읽기) → 알림 구독 → 기록·바뀌는 바이트 강조 → 참값 5번 → 후보 1위가 (자리 2, int16le, 0.01) → 필드 → 저장
// Playwright 가 없으면 건너뛴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.BLE_SHOTS;   // 스크린숏: BLE_SHOTS=폴더
const SVC = '0000fff0-0000-1000-8000-00805f9b34fb';
const CHR = '0000fff1-0000-1000-8000-00805f9b34fb';

// 가짜 센서 (페이지 안에서 실행): 패킷 [A5, 순번, 온도 int16LE×0.01, 습도, 0, 0, 합계], 0.1초마다 알림
function fakeSensor(cfg) {
    const enc = t => new TextEncoder().encode(t);
    const dv = bytes => new DataView(Uint8Array.from(bytes).buffer);
    window.__fake = { temp: 23.5, writes: [], requestOpts: null };
    let seq = 0, timer = null;
    const packet = () => {
        const b = new Uint8Array(8), v = new DataView(b.buffer);
        b[0] = 0xA5; b[1] = seq++ & 0xff;
        v.setInt16(2, Math.round(window.__fake.temp * 100), true);
        b[4] = 45;
        b[7] = b.slice(0, 7).reduce((s, x) => s + x, 0) & 0xff;
        return b;
    };
    const textChar = (uuid, text) => ({ uuid, properties: { read: true }, async readValue() { return dv(enc(text)); } });
    const data = {
        uuid: cfg.CHR, properties: { read: true, notify: true }, l: [],
        addEventListener(n, f) { this.l.push(f); }, removeEventListener(n, f) { this.l = this.l.filter(x => x !== f); },
        async readValue() { return dv(packet()); },
        async startNotifications() { clearInterval(timer); timer = setInterval(() => { const value = dv(packet()); this.l.forEach(f => f({ target: { value } })); }, 100); },
        async stopNotifications() { clearInterval(timer); }
    };
    const ctrl = { uuid: '0000fff2-0000-1000-8000-00805f9b34fb', properties: { write: true }, async writeValueWithResponse(b) { window.__fake.writes.push(Array.from(b)); } };
    const services = [
        { uuid: '0000180a-0000-1000-8000-00805f9b34fb', chars: [textChar('00002a29-0000-1000-8000-00805f9b34fb', 'FakeSci'), textChar('00002a24-0000-1000-8000-00805f9b34fb', 'TH-100'), textChar('00002a26-0000-1000-8000-00805f9b34fb', '1.2.3')] },
        { uuid: '0000180f-0000-1000-8000-00805f9b34fb', chars: [{ uuid: '00002a19-0000-1000-8000-00805f9b34fb', properties: { read: true }, async readValue() { return dv([87]); } }] },
        { uuid: cfg.SVC, chars: [data, ctrl] }
    ].map(s => ({ uuid: s.uuid, async getCharacteristics() { return s.chars; } }));
    const listeners = {};
    const device = {
        name: 'TH-100 A1B2', id: 'fake',
        addEventListener(n, f) { listeners[n] = f; }, removeEventListener(n) { delete listeners[n]; },
        gatt: {
            connected: false,
            async connect() { this.connected = true; return this; },
            async getPrimaryServices() {
                // 진짜 Web Bluetooth 처럼 optionalServices 에 적은 서비스만 보여 줌
                const allowed = window.__fake.requestOpts.optionalServices || [];
                return services.filter(s => allowed.includes(s.uuid));
            },
            disconnect() { this.connected = false; clearInterval(timer); listeners.gattserverdisconnected && listeners.gattserverdisconnected(); }
        }
    };
    Object.defineProperty(navigator, 'bluetooth', { value: { async requestDevice(opts) { window.__fake.requestOpts = opts; return device; } } });
}

function serveRepo() {
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
    return http.createServer((req, res) => {
        const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
        if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
        fs.readFile(file, (err, body) => {
            if (err) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
            res.end(body);
        });
    });
}
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const smallButtons = page => page.$$eval('button, label.btn, select', bs => bs.filter(b => b.offsetParent && !b.closest('td, th') && b.getBoundingClientRect().height < 43.5).map(b => b.id || b.textContent.trim()));

test('블루투스 해석 도구: 탐색 → 기록 → 참값 도우미 → 규칙 저장 (375px)', { skip: !chromium && 'playwright 없음', timeout: 90000 }, async () => {
    const server = serveRepo().listen(0);
    const base = 'http://localhost:' + server.address().port;
    const browser = await chromium.launch();
    try {
        const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', d => d.accept());
        let chartLoaded = true;
        await page.route(/^https:\/\/cdn\.jsdelivr\.net\//, r => { chartLoaded = false; return r.abort(); });
        await page.addInitScript(fakeSensor, { SVC, CHR });
        await page.goto(base + '/projects/ble-explorer.html');

        // 개발용 표시·검색 막기
        assert.match(await page.textContent('.dev-badge'), /개발용/);
        assert.equal(await page.getAttribute('meta[name="robots"]', 'content'), 'noindex, nofollow');
        assert.ok(await noSideScroll(page), '첫 화면 가로 스크롤');
        assert.deepEqual(await smallButtons(page), [], '44px 보다 작은 단추');

        // ① 직접 넣은 서비스 UUID (짧은 모양) → optionalServices 에 128비트로
        await page.click('#svcBox summary');
        await page.fill('#customUuids', 'fff0\nzz-bad');
        assert.match(await page.textContent('#uuidMsg'), /zz-bad/);
        await page.click('#btnScan');
        await page.waitForSelector('#deviceBox:not([hidden])');
        const opts = await page.evaluate(() => window.__fake.requestOpts);
        assert.equal(opts.acceptAllDevices, true);
        assert.ok(opts.optionalServices.includes(SVC), '직접 넣은 서비스');
        assert.ok(opts.optionalServices.includes('0000180a-0000-1000-8000-00805f9b34fb'), '기기 정보 서비스');
        assert.ok(!opts.optionalServices.some(u => /zz/.test(u)));
        await page.waitForFunction(() => /FakeSci/.test(document.getElementById('devInfo').textContent));
        const info = await page.textContent('#devInfo');
        assert.match(info, /TH-100/); assert.match(info, /1\.2\.3/);
        assert.equal(await page.locator('.svc').count(), 3);
        assert.match(await page.textContent('#status'), /연결됨/);
        assert.ok(await noSideScroll(page), '나무 표시 가로 스크롤');
        assert.deepEqual(await smallButtons(page), []);

        // 배터리 한 번 읽기, 데이터 특성 알림 켜기
        await page.click('[data-read="00002a19-0000-1000-8000-00805f9b34fb"]');
        await page.waitForFunction(() => /57/.test(document.querySelector('[data-val="00002a19-0000-1000-8000-00805f9b34fb"]').textContent));
        await page.click(`[data-notify="${CHR}"]`);
        await page.waitForFunction(() => /기록 ([2-9]\d|\d{3,})개/.test(document.getElementById('countBadge').textContent));
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'ble-1-connect.png'), fullPage: true });

        // ② 기록: 온도를 바꿔 바뀌는 바이트 강조 (자리 1 순번, 2·3 온도, 7 합계)
        await page.evaluate(() => { window.__fake.temp = 19.2; });
        await page.click('#bxTabs [data-tab="log"]');
        await page.selectOption('#logChar', CHR);
        await page.waitForTimeout(500);
        const heads = await page.$$eval('#byteTable thead th', ths => ths.slice(1).map(t => t.classList.contains('chg')));
        assert.deepEqual(heads, [false, true, true, true, false, false, false, true]);
        assert.match(await page.textContent('#chgSummary'), /바뀌는 자리 1, 2, 3, 7/);
        assert.ok(await page.locator('#logTable td.hex .chg').count() > 0, '16진수 칸의 강조');
        assert.ok(await noSideScroll(page), '기록 탭 가로 스크롤');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'ble-2-log.png'), fullPage: true });

        // 쓰기는 확인 칸 뒤에만
        await page.click('#writeBox summary');
        assert.equal(await page.isDisabled('#btnWrite'), true);
        await page.fill('#writeHex', '01 0A');
        await page.check('#writeOk');
        await page.click('#btnWrite');
        await page.waitForFunction(() => window.__fake.writes.length === 1);
        assert.deepEqual(await page.evaluate(() => window.__fake.writes[0]), [1, 10]);

        // ③ 참값 맞추기: 온도를 바꾸며 5번 찍기
        await page.click('#bxTabs [data-tab="rules"]');
        assert.equal(await page.inputValue('#ruleChar'), CHR);
        await page.click('#ruleTabs [data-tab="truth"]');
        for (const t of [23.5, 19.2, 26.8, 21.1, 24.9]) {
            await page.evaluate(v => { window.__fake.temp = v; }, t);
            await page.waitForTimeout(250);
            await page.fill('#truthVal', String(t));
            await page.click('#btnTruth');
        }
        assert.equal(await page.locator('#truthTable tbody tr').count(), 5);
        await page.click('#btnFind');
        const top = await page.$$eval('#candTable tbody tr:first-child td', tds => tds.map(t => t.textContent));
        assert.equal(top[1], '2', '1위 자리');
        assert.equal(top[2], 'int16le', '1위 형식');
        assert.match(top[3], /≈ 0\.01$/, '1위 배율');
        assert.ok(Number(top[5]) > 0.9999, 'r²');
        assert.ok(await noSideScroll(page), '후보 표 가로 스크롤');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'ble-3-truth.png'), fullPage: true });

        // 후보 → 필드 → 지금 값
        await page.click('[data-usecand="0"]');
        assert.equal(await page.inputValue('.field [data-k="offset"]'), '2');
        assert.equal(await page.inputValue('.field [data-k="format"]'), 'int16le');
        await page.fill('.field [data-k="name"]', '온도');
        await page.fill('.field [data-k="unit"]', '°C');
        await page.evaluate(() => { window.__fake.temp = 22.22; });
        await page.waitForFunction(() => /온도 = 22\.22 °C/.test(document.getElementById('latestDecoded').textContent));
        assert.ok(await noSideScroll(page), '필드 편집 가로 스크롤');
        assert.deepEqual(await smallButtons(page), []);
        await page.click('#ruleTabs [data-tab="chart"]');
        await page.waitForFunction(() => /22\.22/.test(document.getElementById('decTable').textContent));
        if (!chartLoaded) assert.equal(await page.isVisible('#chartNote'), true, 'Chart.js 없을 때 안내');

        // ④ 저장: 브라우저 저장 + JSON 파일
        await page.click('#bxTabs [data-tab="save"]');
        await page.fill('#sensorName', '가짜 온도 센서');
        await page.click('#btnSaveRule');
        assert.match(await page.textContent('#ruleMsg'), /저장했어요/);
        assert.match(await page.textContent('#savedRules'), /가짜 온도 센서/);
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnRuleFile')]);
        const dec = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
        assert.equal(dec.schema, 'sensor-lab-ble-decoder');
        assert.equal(dec.device.maker, 'FakeSci');
        assert.equal(dec.characteristics[0].service, SVC);
        assert.equal(dec.characteristics[0].mode, 'notify');
        assert.deepEqual(dec.characteristics[0].fields[0], { name: '온도', offset: 2, format: 'int16le', scale: 0.01, add: 0, unit: '°C', mask: '' });

        await page.click('#saveTabs [data-tab="logfile"]');
        const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
        const csvText = fs.readFileSync(await csv.path(), 'utf8');
        assert.match(csvText.split('\n')[0], /t_s,time,characteristic,length,hex,온도/);
        const [logJson] = await Promise.all([page.waitForEvent('download'), page.click('#btnLogJson')]);
        const logPath = await logJson.path();
        assert.ok(await noSideScroll(page), '저장 탭 가로 스크롤');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'ble-4-save.png'), fullPage: true });

        // 센서 없이 다시: 새로고침 → 기록 JSON 불러오기 → 저장된 규칙으로 값이 나옴
        await page.click('#btnDisconnect');
        await page.reload();
        await page.click('#bxTabs [data-tab="save"]');
        await page.click('#saveTabs [data-tab="logfile"]');
        await page.setInputFiles('#logFileIn', logPath);
        await page.waitForFunction(() => /불러왔어요/.test(document.getElementById('logMsg').textContent));
        await page.click('#bxTabs [data-tab="rules"]');
        await page.click('#ruleTabs [data-tab="fields"]');
        await page.waitForFunction(() => /온도 = \d+\.\d+ °C/.test(document.getElementById('latestDecoded').textContent));

        // ⑤ 도움말의 법적 주의
        await page.click('#bxTabs [data-tab="help"]');
        assert.match(await page.textContent('.legal'), /암호화/);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        server.close();
    }
});

test('블루투스 해석 도구: Web Bluetooth 가 없으면 안내', { skip: !chromium && 'playwright 없음', timeout: 30000 }, async () => {
    const server = serveRepo().listen(0);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.route(/^https:\/\/cdn\.jsdelivr\.net\//, r => r.abort());
        await page.addInitScript(() => { Object.defineProperty(navigator, 'bluetooth', { value: undefined }); });
        await page.goto('http://localhost:' + server.address().port + '/projects/ble-explorer.html');
        assert.match(await page.textContent('#support'), /지원하지 않아요|Bluefy|https/);
    } finally {
        await browser.close();
        server.close();
    }
});
