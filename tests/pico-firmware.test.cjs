// 보드 펌웨어 판 확인(js/pico-firmware.js)과 USB 올리기 화면(projects/board-setup.html #usb) 시험.
// 화면 시험은 Playwright 가 없으면 건너뛴다. 가짜 보드: tests/fake-pico-serial.cjs(USB), 페이지 안 가짜 블루투스(판 응답).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const PicoFirmware = require('../js/pico-firmware.js');

let chromium = null, devices = {};
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.FW_SHOTS;
const LATEST = PicoFirmware.LATEST;

test('판 견주기: 최신·예전·판 없음·모르는 판', () => {
    const main = fs.readFileSync(path.join(ROOT, 'firmware', 'pico2w-environment', 'main.py'), 'utf8');
    assert.equal(/^FIRMWARE_VERSION = "([^"]+)"/m.exec(main)[1], LATEST, 'main.py 와 js 의 판이 같아야 함');
    assert.equal(PicoFirmware.compare(LATEST), 'latest');
    assert.equal(PicoFirmware.compare('2026.11-iv'), 'old');
    assert.equal(PicoFirmware.compare('2026.11-board'), 'old');
    assert.equal(PicoFirmware.compare(undefined), 'none');
    assert.equal(PicoFirmware.compare(''), 'none');
    assert.equal(PicoFirmware.compare('2026.10-x'), 'old');
    assert.equal(PicoFirmware.compare('2027.01-new'), 'newer');
    assert.equal(PicoFirmware.compare('dev'), 'old');
    assert.match(PicoFirmware.message({ state: 'old', fw: '2026.11-iv' }), new RegExp(`2026\\.11-iv → ${LATEST.replace('.', '\\.')}`));
    assert.match(PicoFirmware.message({ state: 'none', fw: null }), /판 정보 없음/);
    assert.equal(PicoFirmware.message({ state: 'latest', fw: LATEST }), '');
    assert.equal(PicoFirmware.message({ state: 'unknown', fw: null }), '');
});

// 가짜 TX·CMD 특성: GET_BOARD 에 answer(글) 을 20바이트씩 알림으로 돌려줌
function fakeChars(answer) {
    const listeners = new Set();
    const tx = {
        addEventListener(n, f) { listeners.add(f); }, removeEventListener(n, f) { listeners.delete(f); },
        async startNotifications() {}
    };
    const written = [];
    const cmd = {
        async writeValueWithResponse(bytes) {
            const text = new TextDecoder().decode(bytes);
            written.push(text);
            if (text !== 'GET_BOARD' || answer === null) return;
            const payload = new TextEncoder().encode(answer);
            setTimeout(() => {
                for (let i = 0; i < payload.length; i += 20) {
                    const value = new DataView(payload.buffer, i, Math.min(20, payload.length - i));
                    for (const f of listeners) f({ target: { value } });
                }
            }, 5);
        }
    };
    return { tx, cmd, written, listeners };
}
const board = fw => JSON.stringify({ type: 'board', ts: 1, seq: 1, data: { name: 'PicoEnv-07', board: 7, id: 'E661', ...(fw === undefined ? {} : { fw }), saved: false } }) + '\n';

test('GET_BOARD 로 판 읽기 — 최신·예전·fw 없음·예전 펌웨어 오류·대답 없음, 끝나면 알림을 뗀다', async () => {
    const cases = [
        [board(LATEST), { state: 'latest', fw: LATEST }],
        [board('2026.11-iv'), { state: 'old', fw: '2026.11-iv' }],
        [board(undefined), { state: 'none', fw: null }],
        ['{"type":"error","message":"Unknown command"}\n', { state: 'none', fw: null }],
        [null, { state: 'unknown', fw: null }],
    ];
    for (const [answer, want] of cases) {
        const chars = fakeChars(answer);
        assert.deepEqual(await PicoFirmware.probe(chars.tx, chars.cmd, { timeout: 200 }), want, String(answer));
        assert.deepEqual(chars.written, ['GET_BOARD']);
        assert.equal(chars.listeners.size, 0, '알림을 떼야 페이지 수신기가 판 응답을 받지 않음');
    }
    assert.deepEqual(await PicoFirmware.probe(null, null), { state: 'unknown', fw: null });
});

// ---------- 화면 ----------

function serveRepo() {
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css', '.json': 'application/json', '.py': 'text/x-python; charset=utf-8', '.wasm': 'application/wasm' };
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
const smallButtons = page => page.$$eval('button', bs => bs.filter(b => b.offsetParent && !b.closest('td, th')
    && b.getBoundingClientRect().height < 43.5).map(b => b.id || b.textContent.trim()));
const FAKE_SERIAL = fs.readFileSync(path.join(__dirname, 'fake-pico-serial.cjs'), 'utf8');

// 페이지 안: 보드 하나(파일 시스템은 window.__fs 에 남김), 케이블 다시 꽂으면 같은 파일로 새 보드
function installSerial(cfg) {
    window.__fs = { 'main.py': 'FIRMWARE_VERSION = "2026.11-iv"\n', 'bme280.py': 'old', 'imu.py': 'old', 'extra_sensors.py': 'old', 'board.json': '{"board": 7}' };
    window.__plugs = 0;
    window.__nextOptions = cfg.first || {};
    const make = () => {
        window.__plugs += 1;
        const opts = window.__nextOptions; window.__nextOptions = {};
        const files = {};
        for (const [k, v] of Object.entries(window.__fs)) files[k] = v;
        const b = new window.FakePicoBoard({ ...opts, files });
        window.__board = b;
        const orig = b.exec.bind(b);
        b.exec = async code => { await orig(code); window.__fs = Object.fromEntries([...b.fs].map(([k, v]) => [k, v])); };
        return b;
    };
    Object.defineProperty(navigator, 'serial', { value: window.fakeSerial(make) });
}

test('USB 로 펌웨어 올리기 화면: 올리기 → 끊김 → 다시 하기, board.json 그대로 (375px)', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const server = serveRepo().listen(0);
    const base = 'http://localhost:' + server.address().port;
    const browser = await chromium.launch();
    try {
        const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(FAKE_SERIAL);
        await page.addInitScript(installSerial, { first: { unplugAfterWrites: 8 } });
        await page.goto(base + '/projects/board-setup.html#usb');
        assert.equal(await page.textContent('#flashLatest'), LATEST);
        assert.equal(await page.locator('#flashSteps li').count(), 6);
        assert.ok(await noSideScroll(page), '첫 화면 가로 스크롤');
        assert.deepEqual(await smallButtons(page), [], '44px 보다 작은 단추');

        // 1) 쓰는 중에 USB 가 빠짐 → 어디서 멈췄는지, 예전 파일 그대로
        await page.click('#flashButton');
        await page.waitForSelector('#flashResult.fail', { timeout: 30000 });
        assert.match(await page.textContent('#flashResult'), /파일 네 개 쓰고 확인.*USB 연결이 끊겼어요/);
        assert.match(await page.textContent('#flashButton'), /다시 하기/);
        assert.match(await page.textContent('#flashSteps li.fail'), /✗ 파일 네 개/);
        assert.equal(await page.evaluate(() => new TextDecoder().decode(window.__fs['main.py'])), 'FIRMWARE_VERSION = "2026.11-iv"\n');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'fw-1-fail.png'), fullPage: true });

        // 2) 다시 하기 → 끝까지
        await page.click('#flashButton');
        await page.waitForFunction(() => { const r = document.getElementById('flashResult'); return !r.hidden && !r.classList.contains('fail') && /다 됐어요/.test(r.textContent); }, null, { timeout: 60000 });
        const text = await page.textContent('#flashResult');
        assert.ok(text.includes(LATEST), text);
        assert.match(text, /보드 번호는 그대로/);
        const state = await page.evaluate(() => ({
            keys: Object.keys(window.__fs).sort(),
            board: new TextDecoder().decode(window.__fs['board.json']),
            plugs: window.__plugs,
        }));
        assert.deepEqual(state.keys, ['bme280.py', 'board.json', 'extra_sensors.py', 'imu.py', 'main.py']);
        assert.equal(state.board, '{"board": 7}');
        assert.equal(state.plugs, 2);
        const main = await page.evaluate(() => new TextDecoder().decode(window.__fs['main.py']));
        assert.equal(main, fs.readFileSync(path.join(ROOT, 'firmware', 'pico2w-environment', 'main.py'), 'utf8'));
        assert.equal(await page.locator('#flashSteps li', { hasText: '✓' }).count(), 6);
        assert.ok(await noSideScroll(page), '끝난 화면 가로 스크롤');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'fw-2-done.png'), fullPage: true });
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        server.close();
    }
});

test('Web Serial 이 없는 기기(아이폰)·보드를 고르지 않음·포트가 쓰이는 중', { skip: !chromium && 'playwright 없음', timeout: 60000 }, async () => {
    const server = serveRepo().listen(0);
    const base = 'http://localhost:' + server.address().port;
    const browser = await chromium.launch();
    try {
        const phone = await browser.newContext({ ...devices['iPhone 13'] });
        const p1 = await phone.newPage();
        // 시험 브라우저(크로미움)에는 있으므로 아이폰 사파리처럼 없앤다
        await p1.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'serial', { get: () => undefined }); });
        await p1.goto(base + '/projects/board-setup.html');
        assert.equal(await p1.isDisabled('#flashButton'), true);
        assert.match(await p1.textContent('#flashStatus'), /PC 의 크롬이나 엣지/);
        assert.ok(await noSideScroll(p1));

        const pc = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        for (const [opt, pattern] of [[{ cancel: true }, /고르지 않았어요/], [{ busy: true }, /Thonny/]]) {
            const page = await pc.newPage();
            await page.addInitScript(FAKE_SERIAL);
            await page.addInitScript(o => {
                Object.defineProperty(navigator, 'serial', { value: window.fakeSerial(() => new window.FakePicoBoard({}), o) });
            }, opt);
            await page.goto(base + '/projects/board-setup.html');
            await page.click('#flashButton');
            await page.waitForSelector('#flashResult.fail');
            assert.match(await page.textContent('#flashResult'), pattern);
            assert.equal(await page.isDisabled('#flashButton'), false);
        }
    } finally {
        await browser.close();
        server.close();
    }
});

// 페이지 안 가짜 Pico 블루투스: GET_BOARD 에 cfg.answer 를 알림으로, 다른 명령은 받기만
function fakePicoBle(cfg) {
    window.__cmds = [];
    const listeners = new Set();
    const tx = {
        uuid: '19b10001-e8f2-537e-4f6c-d104768a1214',
        addEventListener(n, f) { listeners.add(f); }, removeEventListener(n, f) { listeners.delete(f); },
        async startNotifications() {}, async stopNotifications() {}
    };
    const notify = text => {
        const payload = new TextEncoder().encode(text);
        for (let i = 0; i < payload.length; i += 20) {
            const value = new DataView(payload.buffer, i, Math.min(20, payload.length - i));
            for (const f of [...listeners]) f({ target: { value } });
        }
    };
    const cmd = {
        async writeValueWithResponse(bytes) {
            const text = new TextDecoder().decode(bytes);
            window.__cmds.push(text);
            if (text === 'GET_BOARD' && cfg.answer) setTimeout(() => notify(cfg.answer), 5);
        }
    };
    const accel = { addEventListener() {}, removeEventListener() {}, async startNotifications() {}, async stopNotifications() {} };
    const device = {
        name: 'PicoEnv-07', listeners: {},
        addEventListener(n, f) { this.listeners[n] = f; }, removeEventListener(n) { delete this.listeners[n]; },
        gatt: {
            connected: false,
            async connect() { this.connected = true; return this; },
            async getPrimaryService() {
                return { async getCharacteristic(uuid) { return uuid.startsWith('19b10001') ? tx : uuid.startsWith('19b10002') ? cmd : accel; } };
            },
            disconnect() { this.connected = false; device.listeners.gattserverdisconnected && device.listeners.gattserverdisconnected(); }
        }
    };
    Object.defineProperty(navigator, 'bluetooth', { value: { async requestDevice() { return device; } } });
}

test('센서 페이지 연결 때 예전 판이면 한 줄 안내 (환경·조도·가속도·이상기체)', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const server = serveRepo().listen(0);
    const base = 'http://localhost:' + server.address().port;
    const browser = await chromium.launch();
    const chartStub = 'window.Chart = class { constructor(c, o) { this.data = (o && o.data) || { datasets: [] }; this.options = (o && o.options) || {}; } update() {} destroy() {} resize() {} };';
    const pages = [
        ['/projects/environment-lab.html', '#connectBleButton', '#status'],
        ['/projects/environment-lab.html?sensor=light', '#connectButton', '#status'],
        ['/projects/accelerometer-lab.html', '#connectBleButton', '#status'],
        ['/projects/ideal-gas.html', '#btn-connect', '#ble-status', 'nav.steps button[data-step="data"]'],
    ];
    const answers = [
        ['old', JSON.stringify({ type: 'board', ts: 1, seq: 1, data: { name: 'PicoEnv-07', board: 7, id: 'E661', fw: '2026.11-iv', saved: false } }) + '\n', /2026\.11-iv →/],
        ['none', '{"type":"error","message":"Unknown command"}\n', /판 정보 없음 →/],
        ['latest', JSON.stringify({ type: 'board', ts: 1, seq: 1, data: { name: 'PicoEnv-07', board: 7, id: 'E661', fw: LATEST, saved: false } }) + '\n', null],
    ];
    try {
        const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
        await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|www\.gstatic\.com)\//, r => /chart/i.test(r.request().url())
            ? r.fulfill({ contentType: 'text/javascript', body: chartStub }) : r.abort());
        for (const [url, button, statusSel, tab] of pages) {
            for (const [label, answer, pattern] of answers) {
                const page = await ctx.newPage();
                const errors = [];
                page.on('pageerror', e => errors.push(e.message));
                page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
                await page.addInitScript(fakePicoBle, { answer });
                await page.goto(base + url);
                if (tab) await page.click(tab);
                await page.waitForSelector(button + ':visible', { timeout: 10000 }).catch(e => { throw new Error(url + ' ' + errors.join(' | ') + ' ' + e.message); });
                await page.click(button);
                await page.waitForFunction(() => window.__cmds && window.__cmds.some(c => c.startsWith('START') || c.startsWith('SET_')), null, { timeout: 10000 });
                const cmds = await page.evaluate(() => window.__cmds);
                assert.equal(cmds[0], 'GET_BOARD', url + ' 처음 명령은 판 확인');
                const notice = await page.$$eval('.fw-notice', ns => ns.map(n => n.textContent));
                if (pattern) {
                    assert.equal(notice.length, 1, `${url} ${label}`);
                    assert.match(notice[0], pattern);
                    assert.match(notice[0], /보드 번호 정하기/);
                    assert.ok(await noSideScroll(page), url + ' 안내 가로 스크롤');
                    const href = await page.getAttribute('.fw-notice a', 'href');
                    assert.equal(href, 'board-setup.html#usb');
                } else {
                    assert.deepEqual(notice, [], `${url} 최신 판은 안내 없음`);
                }
                // 측정은 막지 않음: 연결 상태 글이 실패가 아님
                assert.doesNotMatch(await page.textContent(statusSel), /실패|오류/, url + ' ' + label);
                if (SHOTS && label === 'old') await page.screenshot({ path: path.join(SHOTS, 'fw-notice-' + path.basename(url).replace(/[^a-z-]/g, '') + '.png') });
                await page.close();
            }
        }
    } finally {
        await browser.close();
        server.close();
    }
});

test('공용 센서 연결(CustomLabSensor: 선생님이 만든 실험·플랑크)도 판 결과를 onFirmware 로 넘긴다', { skip: !chromium && 'playwright 없음', timeout: 60000 }, async () => {
    const server = serveRepo().listen(0);
    const base = 'http://localhost:' + server.address().port;
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.addInitScript(fakePicoBle, { answer: JSON.stringify({ type: 'board', ts: 1, seq: 1, data: { name: 'PicoEnv-07', board: 7, id: 'E661', fw: '2026.11-iv', saved: false } }) + '\n' });
        await page.goto(base + '/projects/board-setup.html');   // 같은 사이트의 아무 페이지 (localhost = 보안 연결)
        for (const file of ['custom-lab-math.js', 'sensor-definitions.js', 'environment-protocol.js', 'accelerometer-protocol.js', 'pico-ble.js', 'pico-firmware.js', 'custom-lab-sensor.js']) {
            await page.addScriptTag({ url: '/js/' + file });
        }
        const result = await page.evaluate(() => new Promise(resolve => {
            const s = window.CustomLabSensor.create({ mode: 'light', onFirmware: r => resolve({ r, cmds: window.__cmds.slice() }) });
            s.connect();
        }));
        assert.deepEqual(result.r, { state: 'old', fw: '2026.11-iv' });
        assert.deepEqual(result.cmds, ['GET_BOARD']);
        await page.waitForFunction(() => window.__cmds.some(c => c.startsWith('START:')));
        assert.deepEqual(await page.evaluate(() => window.__cmds.slice(1, 2)), ['STOP']);
    } finally {
        await browser.close();
        server.close();
    }
});
