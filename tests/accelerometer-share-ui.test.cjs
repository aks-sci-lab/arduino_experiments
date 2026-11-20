// 가속도계·스마트폰 가속도·자유낙하 페이지의 수업 참여·조 공유 화면 시험 (Playwright, 375px 휴대폰 폭)
// 선생님 시트는 tests/fake-apps-script.cjs 의 가짜 Apps Script(진짜 시트처럼 '2-3-5376' 을 날짜로 바꾸려 함)가 맡고,
// 페이지의 script.google.com 요청을 가로채 그것으로 보낸다. CDN(Chart.js 등)은 시험 환경에서 막혀 있어 작은 대역으로 바꾼다.
// 흐름: 교사가 수업 만들기 → 학생 2명 같은 조로 참여 → A 가 📤 보내기 → B 가 자동으로 📥 불러옴 → 교사 진행 보기에 단계·점 수
// Playwright 가 없는 컴퓨터에서는 건너뛴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadLabStore } = require('./fake-lab-store.cjs');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

// Chart.js·회귀·슬라이더 대역 (그래프 그리기는 이 시험의 대상이 아님)
const CHART_STUB = `
window.Chart = class Chart {
  constructor(el, cfg) { this.config = cfg; this.data = cfg.data; this.options = cfg.options || {}; this.scales = { x: { min: 0, max: 1, getPixelForValue: () => 0, getValueForPixel: () => 0 } }; this.chartArea = { left: 0, right: 1, top: 0, bottom: 1 }; }
  update() {} destroy() {} resize() {} resetZoom() {}
  static register() {}
};
window.Chart.helpers = { getRelativePosition: () => ({ x: 0, y: 0 }) };
window.regression = { polynomial: () => ({ string: '', r2: 1, points: [] }) };`;

function startSite() {
    const server = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        const file = path.join(ROOT, decodeURIComponent(u.pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, base: 'http://127.0.0.1:' + server.address().port })));
}

async function openPage(browser, app, url, seed) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|www\.gstatic\.com)\//, route =>
        route.fulfill({ contentType: 'text/javascript', body: /chart\.umd/.test(route.request().url()) ? CHART_STUB : '' }));
    await page.addInitScript(() => { window.LAB_STORE_FAKE_URL = 'https://script.google.com/macros/s/FAKE_LAB_STORE/exec'; });   // 가짜 저장소 (js/lab-store.js)
    await page.route('https://script.google.com/**', async route => {
        const req = route.request();
        let out;
        if (req.method() === 'POST') out = (await app.post(req.postData() || '{}'));
        else out = (await app.get(Object.fromEntries(new URL(req.url()).searchParams)));
        await route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(out) });
    });
    if (seed) await page.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('seeded', '1'); } }, seed);
    await page.goto(url);
    return { ctx, page, errors };
}
async function join(page, jo, num) {
    await page.waitForSelector('#cs-cpick:not([hidden])');
    await page.selectOption('#cs-cjo', String(jo));
    await page.selectOption('#cs-cnum', String(num));
    await page.click('#cs-cjoin');
    await page.waitForSelector('#cs-cjoined:not([hidden])');
}
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const accRows = [[0, 0, 0, 1, 1, 1000], [0.01, 0.5, 0, 1, 1.118, 1010], [0.02, 0, 0, 2, 2, 1020]];
const CASES = [
    {
        exp: 'accel', page: 'projects/accelerometer-lab.html',
        seed: { accelerometer_trials: JSON.stringify({ trial_1731700000000: { name: '1회 낙하', id: 'trial_1731700000000', data: accRows, timeOffset: 0 } }) },
        points: 3, step: '기록',
        incoming: async p => { await p.waitForSelector('#trial-list li.incoming', { state: 'attached' }); return p.textContent('#trial-list li.incoming'); },
        expectIn: /📥 노트북 .* · 1회 낙하 \(3개, 최대 2 g\)/
    },
    {
        exp: 'phoneaccel', page: 'projects/phone-accelerometer.html',
        seed: { 'phone-accel:last': JSON.stringify({ samples: [0, 20, 40, 60].map((rel, i) => ({ t: 5000 + rel, rel, ax: 0, ay: i * 0.1, az: 1 })), original: null }) },
        points: 4, step: '기록',
        incoming: async p => { await p.waitForSelector('#in-list li', { state: 'attached' }); return p.textContent('#in-list li'); },
        // 예전 판의 마지막 기록(phone-accel:last)이 '1회' 회차로 옮겨져 보내짐, 새로 받은 것은 🆕
        expectIn: /🆕 노트북 .* · 1회.*샘플 4개, 0\.06 s/
    },
    {
        exp: 'freefall', page: 'projects/free-fall.html#step-5',
        // 예전 판의 결과(free-fall:mine)가 '1회 자유낙하' 회차로 옮겨짐
        seed: { 'free-fall:mine': JSON.stringify({ 'free-fall': { mode: 'free-fall', rows: [{ t: 0, x: 10, y: 0 }, { t: 0.1, x: 10, y: 49 }, { t: 0.2, x: 10, y: 196 }, { t: 0.3, x: 10, y: 441 }], mmPerPx: 1.2, fit: { g: 9.8, r2: 0.9999, errPct: 0 } } }) },
        points: 4, step: '5 데이터',
        incoming: async p => { await p.waitForFunction(() => /📥/.test(document.getElementById('group-table-body').textContent)); return p.textContent('#group-table-body'); },
        expectIn: /📥 노트북 .*자유낙하49\.80/
    }
];

test('수업 참여 → 조 공유 보내기·자동 불러오기 → 교사 진행 보기 (가속도계·스마트폰 가속도·자유낙하, 375px)', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadLabStore();
    const site = await startSite();
    const browser = await chromium.launch();
    try {
        for (const C of CASES) {
            const cls = (await app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 4, exp: C.exp }));
            assert.equal(cls.ok, true, cls.error);
            const url = site.base + '/' + C.page.replace(/#|$/, m => '?c=' + cls.classCode + m);

            // 학생 A: 측정값이 있는 기기, 1조 1번
            const A = await openPage(browser, app, url, C.seed);
            await join(A.page, 1, 1);
            assert.equal(await A.page.inputValue('#cs-group'), cls.groups[0].code, C.exp + ': 조 코드가 저절로');
            assert.ok(await noSideScroll(A.page), C.exp + ': 375px 가로 스크롤');
            const h = await A.page.evaluate(() => document.getElementById('cs-send').getBoundingClientRect().height);
            assert.ok(h >= 44, C.exp + ': 보내기 단추 높이 ' + h);
            // 참여하자마자 하는 첫 불러오기가 끝난 뒤 보낸다 (안 그러면 그 안내가 보내기 결과 글을 덮음)
            await A.page.waitForFunction(() => /연결됨/.test(document.getElementById('cs-status').textContent));
            // 노트북 화면(터치 없는 창)의 스마트폰 가속도·자유낙하는 조 공유 칸이 접혀 있음 (폰 QR 카드가 먼저) → 펼쳐서 보냄
            await A.page.evaluate(() => { document.getElementById('cs-share').open = true; });
            await A.page.click('#cs-send');
            await A.page.waitForFunction(() => /✅ 보냈습니다/.test(document.getElementById('cs-status').textContent), null, { timeout: 10000 })
                .catch(async e => { throw new Error(C.exp + ': 보내기 — ' + await A.page.textContent('#cs-status') + ' / ' + A.errors.join(' | ')); });

            // 학생 B: 같은 1조 2번 → 참여하면 바로 불러옴
            const B = await openPage(browser, app, url);
            await join(B.page, 1, 2);
            assert.match(await C.incoming(B.page), C.expectIn, C.exp + ': B 가 받은 값');
            assert.ok(await noSideScroll(B.page), C.exp + ': B 375px');
            // 받은 값은 다시 보내지 않음 (B 에는 보낼 측정값이 없음)
            await B.page.evaluate(() => { document.getElementById('cs-share').open = true; });
            await B.page.click('#cs-send');
            await B.page.waitForFunction(() => /보낼 측정값이 없습니다/.test(document.getElementById('cs-status').textContent));

            // 시트: 조 코드가 날짜로 바뀌지 않고 글자 그대로, 한 줄
            const list = (await app.get({ action: 'list', exp: C.exp, group: cls.groups[0].code }));
            assert.equal(list.items.length, 1, C.exp);
            assert.equal(list.items[0].n, C.points);

            // 교사 진행 보기
            const T = await openPage(browser, app, site.base + '/projects/class-teacher.html', {
                'lab-store:fake-user': JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })   // 가짜 구글 로그인 (수업 주인)
            });
            await T.page.evaluate(() => { const b = document.getElementById('btnMain'); if (!b.hidden) b.click(); });
            await T.page.waitForSelector('.ct-group');
            const g1 = await T.page.textContent('.ct-group');
            assert.match(g1, /📤 제출: 1개/, C.exp + ': 조 제출');
            assert.match(g1, new RegExp('1번' + C.step + ' · 점 ' + C.points), C.exp + ': A 의 단계·점 수 — ' + g1);
            assert.match(g1, /2번/);
            for (const x of [A, B, T]) { assert.deepEqual(x.errors, [], C.exp + ' 페이지 오류'); await x.ctx.close(); }
        }
    } finally {
        await browser.close();
        site.server.close();
    }
});
