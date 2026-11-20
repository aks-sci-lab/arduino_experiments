// 이상기체 실험 조 공유 화면 시험 (Playwright): 교사 수업 만들기 → 학생 2명 같은 조 → 보내기 → 다른 학생 자동 불러오기 → 교사 진행 보기
// 서버는 tests/fake-lab-store.cjs 의 가짜 저장소.
// 사이트 파일은 작은 정적 서버로 연다. Playwright 가 없는 컴퓨터에서는 건너뛴다. 스크린숏: IDEAL_SHOTS=폴더
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadLabStore } = require('./fake-lab-store.cjs');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const SHOTS = process.env.IDEAL_SHOTS;
const ROOT = path.join(__dirname, '..');
const SCRIPT_ID = 'AKfycbFAKEidealGas0123456789abcdef';
const GAS = 'https://script.google.com/macros/s/' + SCRIPT_ID + '/exec';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.gs': 'text/plain; charset=utf-8', '.json': 'application/json' };

function startStatic() {
    const srv = http.createServer((req, res) => {
        const p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
        const f = path.join(ROOT, p);
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
        fs.createReadStream(f).pipe(res);
    });
    return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

async function newPage(browser, app, base, width) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 812 : 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    // 사이트 기본 서버 대신 가짜 서버 (링크의 ?s= 로도 같은 주소)
    await page.route(base + '/js/pendulum-config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.LAB_STORE_FAKE_URL=' + JSON.stringify(GAS) + ';window.PENDULUM_CONFIG = { pollSeconds: 3 };' }));
    await page.addInitScript(() => { window.LAB_STORE_FAKE_URL = 'https://script.google.com/macros/s/FAKE_LAB_STORE/exec'; });   // 가짜 저장소 (js/lab-store.js)
    await page.route('https://script.google.com/**', async route => {
        const req = route.request(), u = new URL(req.url());
        const out = req.method() === 'POST' ? (await app.post(req.postData() || '{}')) : (await app.get(Object.fromEntries(u.searchParams)));
        route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(out) });
    });
    await page.route(/gstatic\.com|jsdelivr\.net/, route => route.abort());
    return { ctx, page, errors };
}
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name), fullPage: true }); }
async function smallButtons(page) {
    // 화면에 보이는 단추·고르기 칸 중 44px 보다 낮은 것 (표 안의 작은 단추는 예외)
    return page.evaluate(() => [...document.querySelectorAll('button, select, .cs-btn')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 43.5 && !el.closest('table') && !el.closest("nav.tabs, nav.steps");
    }).map(el => (el.id || el.className || el.tagName) + ':' + Math.round(el.getBoundingClientRect().height)));
}

test('교사 수업 → 학생 2명 같은 조 → 보내기·자동 불러오기 → 교사 진행 보기 (375px)', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadLabStore({ scriptId: SCRIPT_ID });
    const srv = await startStatic();
    const base = 'http://127.0.0.1:' + srv.address().port;
    const browser = await chromium.launch();
    try {
        /* ---------- 선생님: 시트 연결 → 수업 만들기 (이상기체, 학생 8명, 4명씩) ---------- */
        const t = await newPage(browser, app, base, 1280);
        const tp = t.page;
        await tp.goto(base + '/projects/class-teacher.html');
        await tp.click('#btnLogin');   // 가짜 구글 로그인 (js/lab-store.js, 시험)
        await tp.waitForSelector('#btnSettings:not([hidden])'); await tp.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); }); await tp.click('#ctTabs button[data-tab="make"]');
        await tp.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); }); await tp.click('#ctTabs button[data-tab="make"]');
        await tp.fill('#inBan', '2'); await tp.fill('#inN', '8'); await tp.fill('#inSize', '4');
        assert.ok(await tp.$eval('#inExp', s => [...s.options].some(o => o.value === 'idealgas' && !/준비 중/.test(o.textContent))), '실험 고르기에 이상기체가 준비됨');
        await tp.selectOption('#inExp', 'idealgas');
        assert.equal(await tp.textContent('#expNote'), '');
        await tp.click('#btnCreate');
        await tp.waitForFunction(() => /만들었어요/.test(document.getElementById('createMsg').textContent));
        await tp.evaluate(() => { const b = document.getElementById('btnMain'); if (!b.hidden) b.click(); const r = document.getElementById('btnToRun'); if (r && r.offsetParent) r.click(); }); await tp.click('#btnStageAll'); await tp.waitForFunction(() => /모든 단계를 열었어요/.test(document.getElementById('stageMsg').textContent));
        const link = await tp.getAttribute('#outLink', 'href');
        assert.match(link, /projects\/ideal-gas\.html\?c=2-\d{4}/);
        const studentUrl = link.replace(/^https?:\/\/[^/]+/, base);

        /* ---------- 학생 A (375px): 1조 1번으로 참여 → 실험 1 직접 입력 → 보내기 ---------- */
        const a = await newPage(browser, app, base, 375);
        const ap = a.page;
        await ap.goto(studentUrl);
        await ap.waitForSelector('#cs-cpick:not([hidden])');
        await ap.selectOption('#cs-cjo', '1'); await ap.selectOption('#cs-cnum', '1');
        await ap.click('#cs-cjoin');
        await ap.waitForFunction(() => /1조 1번/.test(document.getElementById('cs-cme').textContent));
        await ap.click('nav.steps button[data-step="data"]');
        // 센서 없이 직접 입력: 실험 1 네 점
        for (const [v, p] of [[20, 101.3], [24, 84.4], [29, 69.9], [34, 59.6]]) {
            await ap.fill('#in-p', String(p)); await ap.fill('#in-t', '20.5');
            await ap.fill('#in-v', String(v)); await ap.click('#btn-add-boyle');
        }
        assert.equal(await ap.$$eval('#boyle-body tr', trs => trs.length), 4);
        assert.ok(await noSideScroll(ap), '학생 A 375px 가로 스크롤');
        assert.deepEqual(await smallButtons(ap), [], '44px 보다 낮은 단추');
        await ap.click('#cs-share > summary').catch(() => {});
        if (!(await ap.$eval('#cs-share', d => d.open))) await ap.click('#cs-share > summary');
        await ap.click('#cs-send');
        await ap.waitForFunction(() => /보냈습니다/.test(document.getElementById('cs-status').textContent));
        await shot(ap, 'student-a-375.png');

        /* ---------- 학생 B (375px): 1조 2번 → 아무것도 안 재도 A 의 값이 저절로 들어옴 ---------- */
        const b = await newPage(browser, app, base, 375);
        const bp = b.page;
        await bp.goto(studentUrl);
        await bp.waitForSelector('#cs-cpick:not([hidden])');
        await bp.selectOption('#cs-cjo', '1'); await bp.selectOption('#cs-cnum', '2');
        await bp.click('#cs-cjoin');
        await bp.click('nav.steps button[data-step="data"]');
        await bp.waitForFunction(() => document.querySelectorAll('#boyle-body tr.ext-row').length === 4, null, { timeout: 15000 });
        assert.match(await bp.textContent('#boyle-body'), /📥 노트북 /);
        // 결과 단계에도 합쳐진 값으로 계산
        await bp.click('nav.steps button[data-step="result"]');
        assert.match(await bp.textContent('#res-boyle'), /PV 평균/);
        assert.match(await bp.textContent('#res-boyle-table'), /📥 노트북/);
        assert.ok(await noSideScroll(bp), '학생 B 결과 375px 가로 스크롤');
        await shot(bp, 'student-b-result-375.png');
        // 7단계: 구글 로그인·제출 단추가 없고 보내기·인쇄만
        await bp.click('nav.steps button[data-step="conclusion"]');
        assert.equal(await bp.$('#btn-login'), null);
        assert.equal(await bp.$('#btn-submit'), null);
        assert.ok(await bp.isVisible('#btn-send2'));
        assert.ok(await noSideScroll(bp), '학생 B 결론 375px 가로 스크롤');
        assert.equal(await bp.evaluate(() => typeof window.firebase), 'undefined', '학생 화면에서는 로그인 도구를 불러오지 않음');
        // B 는 직접 잰 값이 없으므로 보낼 것이 없다는 안내
        await bp.click('#btn-send2');
        await bp.waitForFunction(() => /보낼 측정값이 없습니다/.test(document.getElementById('send2-status').textContent));

        /* ---------- 서버: A 의 실험 1 한 줄, 조 코드는 글자 그대로 ---------- */
        const rows = app.items();
        assert.equal(rows.length, 1);
        assert.equal(rows[0].exp, 'idealgas');
        assert.match(String(rows[0].group), /^2-1-\d{4}$/);
        assert.equal(rows[0].n, 4);
        assert.match(JSON.stringify(rows[0].summary), /PV 평균/);
        assert.match(rows[0]._space, /^c[a-z0-9]{23}$/, '수업 공간에 저장');

        /* ---------- 선생님 진행 보기: 단계·점 수·제출 ---------- */
        await tp.evaluate(() => { const b = document.getElementById('btnMain'); if (!b.hidden) b.click(); const r = document.getElementById('btnToRun'); if (r && r.offsetParent) r.click(); });
        // 학생 화면은 단계 알림을 5초에 한 번까지만 보내므로, 교사 화면이 몇 번 새로 볼 때까지 기다린다
        await tp.waitForFunction(() => /2번7 결론/.test(document.getElementById('groups').textContent), null, { timeout: 30000 });
        const g = await tp.textContent('#groups');
        assert.match(g, /1번.*5 데이터 · 점 4 · ✅/s, g);
        assert.match(g, /2번.*7 결론 · 점 0/s, g);
        assert.match(g, /📤 .*실험 1 보일 법칙 \(4점\)/s, g);
        await shot(tp, 'teacher-watch.png');

        for (const x of [t, a, b]) assert.deepEqual(x.errors, []);
    } finally {
        await browser.close();
        srv.close();
    }
});

test('수업 링크 없이 열면 예전처럼 (띠 없음, 조 공유 칸은 있음), ?report= 는 학생 화면 대신 보고서 보기', { skip: !chromium && 'playwright 없음', timeout: 60000 }, async () => {
    const app = loadLabStore({ scriptId: SCRIPT_ID });
    const srv = await startStatic();
    const base = 'http://127.0.0.1:' + srv.address().port;
    const browser = await chromium.launch();
    try {
        const s = await newPage(browser, app, base, 375);
        await s.page.goto(base + '/projects/ideal-gas.html');
        assert.equal(await s.page.$('.cs-bar'), null);
        await s.page.click('nav.steps button[data-step="data"]');
        assert.ok(await s.page.isVisible('#cs-share'));
        assert.ok(await noSideScroll(s.page));
        assert.deepEqual(s.errors, []);
        const r = await newPage(browser, app, base, 375);
        await r.page.goto(base + '/projects/ideal-gas.html?report=abc123');
        assert.ok(await r.page.evaluate(() => document.body.classList.contains('report-mode')));
        // 시험에서는 로그인 도구(gstatic)를 막았으므로 안내가 나온다
        await r.page.waitForFunction(() => /로그인 도구를 불러오지 못했습니다/.test(document.getElementById('rv-body').textContent));
        assert.equal(await r.page.$('#cs-share'), null, '보고서 보기에서는 조 공유를 붙이지 않음');
    } finally {
        await browser.close();
        srv.close();
    }
});
