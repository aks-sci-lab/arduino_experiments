// 아두이노 Nano 페이지 조 공유 화면 시험 (Playwright). 가짜 Apps Script(Code.gs 를 Node 에서 실행) + 가짜 블루투스 보드
// 교사 수업 만들기(nano) → 학생 2명 같은 조 → 한 명이 회차 기록·📤 보내기 → 다른 학생이 자동으로 📥 불러옴 → 교사 진행 보기
// Playwright 가 없으면 건너뛴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadLabStore } = require('./fake-lab-store.cjs');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.NANO_SHOTS;   // 스크린숏을 남기려면 NANO_SHOTS=폴더
const shot = (page, name) => (SHOTS ? page.screenshot({ path: path.join(SHOTS, name), fullPage: true }) : null);
const SCRIPT_ID = 'AKfycbFAKEnanoTESTscript0123456789';
const EXEC = 'https://script.google.com/macros/s/' + SCRIPT_ID + '/exec';

// 펌웨어(NanoSenseLab.ino)를 흉내 내는 가짜 블루투스 보드 (페이지 안에서 실행)
function fakeBoard() {
    const listeners = {};
    let timer = null, ms = 5000, seq = 0;
    const ch = () => ({ l: [], addEventListener(n, f) { this.l.push(f); }, removeEventListener(n, f) { this.l = this.l.filter(x => x !== f); },
        async startNotifications() {}, emit(buf) { const v = new DataView(buf); this.l.forEach(f => f({ target: { value: v } })); } });
    const tx = ch(), accel = ch();
    const sendText = t => { const b = new TextEncoder().encode(t); for (let i = 0; i < b.length; i += 20) tx.emit(b.slice(i, i + 20).buffer); };
    const cmd = { async writeValueWithResponse(bytes) {
        const c = new TextDecoder().decode(bytes);
        clearInterval(timer);
        if (c === 'GET_BOARD') sendText(JSON.stringify({ type: 'board', ts: ms, seq: seq++, data: { name: 'NanoSense-A3F1', board: null, id: 'D1:A3:F1', fw: 'fake', saved: false, accelRange: 16 } }) + '\n');
        else if (c === 'START:IMU') timer = setInterval(() => { for (let k = 0; k < 5; k++) { ms += 10; const b = new ArrayBuffer(16), v = new DataView(b);
            v.setUint32(0, ms, true); v.setFloat32(4, 0, true); v.setFloat32(8, 0, true); v.setFloat32(12, 2, true); accel.emit(b); } }, 50);
    } };
    const device = { name: 'NanoSense-A3F1', addEventListener(n, f) { listeners[n] = f; }, removeEventListener(n) { delete listeners[n]; },
        gatt: { connected: false, async connect() { this.connected = true; return this; },
            async getPrimaryService() { return { getCharacteristic: async u => (u.startsWith('19b10001') ? tx : u.startsWith('19b10004') ? accel : cmd) }; },
            disconnect() { this.connected = false; clearInterval(timer); listeners.gattserverdisconnected?.(); } } };
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => device } });
}

function serveRepo() {
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
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

async function openPage(browser, app, url, width, withBoard) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    // 가짜 Apps Script: 진짜 웹 앱 주소로 가는 요청을 Code.gs(Node) 로 돌린다
    await page.addInitScript(() => { window.LAB_STORE_FAKE_URL = 'https://script.google.com/macros/s/FAKE_LAB_STORE/exec'; });   // 가짜 저장소 (js/lab-store.js)
    await page.route('https://script.google.com/macros/s/**', async route => {
        const req = route.request();
        const params = Object.fromEntries(new URL(req.url()).searchParams);
        const out = req.method() === 'POST' ? (await app.post(req.postData() || '')) : (await app.get(params));
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(out), headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    // 바깥 CDN(Chart.js·QR 등)은 막는다 — 페이지는 그래프 없이도 동작해야 함
    await page.route(/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|www\.gstatic\.com|api\.qrserver\.com)\//, r => r.abort());
    if (withBoard) await page.addInitScript(fakeBoard);
    await page.goto(url);
    return { ctx, page, errors };
}
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const smallButtons = page => page.$$eval('button', bs => bs.filter(b => b.offsetParent && b.getBoundingClientRect().height < 43.5).map(b => b.id || b.textContent.trim()));

test('Nano 페이지: 수업 참여 → 같은 조 보내기·자동 불러오기 → 교사 진행 보기 (375px)', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadLabStore();
    const server = serveRepo().listen(0);
    const base = 'http://localhost:' + server.address().port;
    const browser = await chromium.launch();
    try {
        // ---------- 교사: 시트 연결 → 수업 만들기 (nano) ----------
        const t = await openPage(browser, app, base + '/projects/class-teacher.html', 1280, false);
        const tp = t.page;
        await tp.click('#btnLogin');   // 가짜 구글 로그인 (js/lab-store.js, 시험)
        await tp.waitForSelector('#btnSettings:not([hidden])'); await tp.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); }); await tp.click('#ctTabs button[data-tab="make"]');
        await tp.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); }); await tp.click('#ctTabs button[data-tab="make"]');
        await tp.fill('#inBan', '2'); await tp.fill('#inN', '8'); await tp.fill('#inSize', '4');
        await tp.selectOption('#inExp', 'nano');
        await tp.waitForSelector('#btnCreate:not([disabled])');
        await tp.click('#btnCreate');
        await tp.waitForSelector('#classOut:not([hidden])');
        const link = await tp.inputValue('#outLink').catch(() => tp.textContent('#outLink'));
        assert.match(link, /projects\/arduino-nano-lab\.html\?c=2-\d{4}/);
        const classCode = link.match(/c=(2-\d{4})/)[1];
        const studentUrl = base + '/projects/arduino-nano-lab.html?c=' + classCode + '&s=' + SCRIPT_ID;

        // ---------- 학생 두 명 (375px), 같은 조 1조 ----------
        const join = async (p, num) => {
            await p.waitForSelector('#cs-cjo');
            await p.selectOption('#cs-cjo', '1');
            await p.selectOption('#cs-cnum', String(num));
            await p.click('#cs-cjoin');
            await p.waitForFunction(() => /조 코드 2-1-\d{4}/.test(document.getElementById('cs-cme')?.textContent || ''));
        };
        const a = await openPage(browser, app, studentUrl, 375, true);
        const b = await openPage(browser, app, studentUrl, 375, true);
        await join(a.page, 1);
        await join(b.page, 2);

        // 학생 A: 연결 → 가속도 한 회차 기록 → 중지
        const ap = a.page;
        await ap.click('#connectButton');
        await ap.waitForSelector('#startButton:not([disabled])');
        await ap.click('#startButton');
        await ap.waitForTimeout(1200);
        await ap.click('#stopButton');
        await ap.waitForFunction(() => /가속도 1회/.test(document.getElementById('runList').textContent));
        assert.match(await ap.textContent('#runList'), /내 기록 · \d+점/);
        assert.match(await ap.textContent('#runList'), /평균 크기\(g\) 2/);

        // 📤 보내기 (조 공유 칸을 펼쳐서)
        await ap.evaluate(() => { document.getElementById('cs-share').open = true; });
        await ap.click('#cs-send');
        await ap.waitForFunction(() => /보냈/.test(document.getElementById('cs-status').textContent), null, { timeout: 15000 });
        assert.ok(app.items('nano').length >= 1, '저장소에 저장');

        // 학생 B: 자동 불러오기로 📥 회차가 생긴다
        const bp = b.page;
        await bp.waitForFunction(() => /📥 가속도 1회/.test(document.getElementById('runList').textContent), null, { timeout: 30000 });
        assert.match(await bp.textContent('#runList'), /불러온 값 · 노트북 [A-Z0-9]{4}/);
        // 받은 회차를 그래프로 보기 → CSV 단추가 켜진다
        await bp.click('#runList .run-card.ext button');
        assert.match(await bp.textContent('#viewText'), /📥 가속도 1회/);
        assert.equal(await bp.isDisabled('#csvButton'), false);

        for (const p of [ap, bp]) {
            assert.ok(await noSideScroll(p), '375px 가로 스크롤 없음');
            assert.deepEqual(await smallButtons(p), [], '보이는 단추는 44px 이상');
        }

        // ---------- 교사: 진행 보기에 단계·점 수·제출 요약 ----------
        await tp.evaluate(() => { const b = document.getElementById('btnMain'); if (!b.hidden) b.click(); const r = document.getElementById('btnToRun'); if (r && r.offsetParent) r.click(); });
        await tp.click('#btnRefresh').catch(() => {});
        await tp.waitForFunction(() => /가속도 1회/.test(document.getElementById('groups').textContent), null, { timeout: 30000 });
        const groups = await tp.textContent('#groups');
        await shot(ap, 'student-a-375.png'); await shot(bp, 'student-b-375.png'); await shot(tp, 'teacher-watch.png');
        assert.match(groups, /1조/);
        assert.match(groups, /기록|측정 중/);
        assert.deepEqual([...t.errors, ...a.errors, ...b.errors], []);
    } finally {
        await browser.close();
        server.close();
    }
});
