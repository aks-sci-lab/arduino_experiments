// 메인 화면 역할별 (index.html, 2026-11-20): 첫 화면은 교사/학생 고르기만 → 학생: 수업 코드·수업 없이 실험 / 교사: 수업 진행 화면·실험 목록·사이트 관리
// 고른 역할은 이 브라우저에 기억(새로고침해도), 🔄 역할 바꾸기. 375px 가로 스크롤 없음·단추 44px, 가짜 저장소로 수업 코드 입장
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');

test('메인 화면: 역할 고르기 → 학생(코드·수업 없이) / 교사(진행 화면·실험 목록·사이트 관리), 기억·바꾸기', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
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
        const c = await browser.newContext({ viewport: { width: 375, height: 760 } });
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/gstatic|jsdelivr/, r => r.abort());
        const P = await c.newPage();
        P.on('pageerror', e => errors.push(e.message));
        const vis = sel => P.isVisible(sel);
        const layout = async n => {
            assert.equal(await P.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
            const small = await P.evaluate(() => [...document.querySelectorAll('button, select, a.pick-card')].filter(e => e.offsetParent && !e.closest('td, th') && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim().slice(0, 20)));
            assert.deepEqual(small, [], n + ' 작은 단추');
        };
        await P.goto(ROOT + 'index.html');
        // 처음: 역할 고르기만
        assert.equal(await vis('#homePick'), true);
        for (const sel of ['#homeLabs', '#adminBox', '#joinBox', '#homeTeacher', '#roleSwitch']) assert.equal(await vis(sel), false, sel + ' 는 첫 화면에 없음');
        assert.equal(await P.locator('#homePick .pick-card').count(), 2);
        await layout('첫 화면');
        // 학생
        await P.click('#roleStudent');
        assert.equal(await vis('#joinBox'), true); assert.equal(await vis('#homeLabs'), false); assert.equal(await vis('#adminBox'), false);
        assert.equal(await P.evaluate(() => document.activeElement.id), 'joinCode');
        await P.click('#soloBtn'); assert.equal(await vis('#homeLabs'), true, '수업 없이 실험 목록');
        assert.equal(await vis('#studentRecordsSection'), false, '학생 화면에는 예전 기록 없음');
        assert.equal(await vis('#boardTabs'), false); assert.equal(await vis('#homeTabs'), false, '학생은 작은 탭 없이 실험 목록만'); assert.equal(await vis('#labsList'), true);
        assert.match(await P.textContent('#homeStudent'), /CSV 저장/);
        assert.equal(await P.locator('#pendulumCard.pick-card').count(), 1, '진자도 다른 카드와 같은 모양');
        assert.match(await P.textContent('#customNotice'), /불러오지 못했어요|공개된 실험이 없어요|불러오는 중/);
        assert.equal(await vis('a.pick-card[href="projects/malus-law.html"]'), true);
        await layout('학생');
        await P.reload();
        assert.equal(await vis('#joinBox'), true, '새로고침해도 학생'); assert.equal(await vis('#homePick'), false);
        // 수업 코드로 들어가기
        const cls = await app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'malus' });
        await P.fill('#joinCode', cls.classCode);
        await Promise.all([P.waitForURL(/malus-law\.html\?c=/), P.click('#joinBox button[type="submit"]')]);
        assert.match(P.url(), new RegExp('c=' + cls.classCode + '&s=' + cls.space));
        await P.goto(ROOT + 'index.html');
        // 역할 바꾸기 → 교사
        await P.click('#roleSwitch');
        assert.equal(await vis('#homePick'), true);
        await P.click('#roleTeacher');
        assert.equal(await vis('a.pick-card[href="projects/class-teacher.html"]'), true);
        assert.equal(await vis('a.pick-card[href="qr.html"]'), true, 'QR 코드로 휴대폰에서 열기는 교사 화면에');
        assert.equal(await vis('#adminBox'), true, '사이트 관리는 교사 화면에');
        assert.equal(await vis('#homeLabs'), true, '교사는 실험 목록 바로');
        assert.equal(await vis('#joinBox'), false);
        // 교사 화면 작은 탭: 실험 목록 / 보드 준비 / 예전 기록 (한 페이지에 길게 잇지 않음)
        assert.equal(await vis('#homeTabs'), true);
        assert.equal(await vis('#labsList'), true, '처음은 실험 목록');
        assert.equal(await vis('#studentRecordsSection'), false); assert.equal(await vis('#boardTabs'), false);
        // 필름통 로켓은 '행사' 묶음에, 폰 한 대 배지 (노트북 분석 표시 없음)
        const rocket = await P.evaluate(() => { const a = document.querySelector('a.pick-card[href="projects/film-rocket.html"]'); let h = a.parentElement.previousElementSibling; return { group: h && h.textContent, text: a.textContent }; });
        assert.match(rocket.group, /행사/); assert.match(rocket.text, /폰 한 대로/); assert.doesNotMatch(rocket.text, /이 기기는 분석/);
        await P.click('#homeTabs button[data-tab="records"]');
        assert.equal(await vis('#studentRecordsSection'), true, '예전 기록은 교사 화면의 탭에'); assert.equal(await vis('#labsList'), false);
        await P.click('#homeTabs button[data-tab="board"]');
        assert.equal(await vis('#boardTabs'), true, '보드별 준비 안내는 교사 화면의 탭에');
        // 보드 탭: 누르기·좌우 화살표
        await P.click('#boardTabs button[data-tab="pico"]');
        await P.keyboard.press('ArrowRight');
        assert.equal(await P.getAttribute('#boardTabs button[data-tab="nano"]', 'aria-selected'), 'true');
        assert.equal(await P.evaluate(() => document.activeElement.dataset.tab), 'nano');
        assert.equal(await vis('#boardTabs ~ .tab-panel[data-tab="nano"]'), true);
        assert.equal(await vis('#devLinks'), false, '개발 도구 링크는 사이트 관리 교사가 아니면 안 보임');
        await layout('교사');
        await P.reload(); assert.equal(await vis('#homeTeacher'), true, '새로고침해도 교사');
        // 랜드마크·제목 순서
        assert.deepEqual(await P.evaluate(() => ['header', 'main', 'footer'].map(t => document.querySelectorAll(t).length)), [1, 1, 1]);
        const heads = await P.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4')].map(h => Number(h.tagName[1])));
        assert.equal(heads[0], 1); assert.equal(heads.filter(h => h === 1).length, 1);
        for (let i = 1; i < heads.length; i++) assert.ok(heads[i] - heads[i - 1] <= 1, '제목 단계를 건너뛰지 않음: ' + heads.join(','));
        assert.deepEqual(errors, []);

        // ---- 아이폰 흉내(블루투스 없음): Pico·Nano 카드에 ⚠, 진자 카드는 측정 화면으로 ----
        const I = await browser.newContext(devices['iPhone 13']);
        await I.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await I.route(/gstatic|jsdelivr/, r => r.abort());
        await I.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => undefined, configurable: true }); Object.defineProperty(Navigator.prototype, 'serial', { get: () => undefined, configurable: true }); localStorage.setItem('home-role:v1', 'teacher'); });
        const IP = await I.newPage();
        await IP.goto(ROOT + 'index.html');
        assert.match(await IP.textContent('a.pick-card[href="projects/environment-lab.html"]'), /⚠ 아이폰은 블루투스 안 됨/);
        assert.match(await IP.textContent('a.pick-card[href="projects/arduino-nano-lab.html"]'), /⚠ 아이폰은 블루투스 안 됨/);
        assert.match(await IP.textContent('a.pick-card[href="projects/em-induction.html"]'), /⚠ USB 연결은 PC 크롬/);
        assert.doesNotMatch(await IP.textContent('a.pick-card[href="projects/malus-law.html"]'), /⚠/);
        assert.equal(await IP.getAttribute('#pendulumCard', 'href'), 'projects/pendulum-measure.html');
        assert.equal(await IP.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);

        // ---- PC 크롬 흉내(블루투스·시리얼 있음) + 사이트 관리 교사 계정: ⚠ 없음, 개발 도구 링크 보임 ----
        const C = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await C.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await C.route(/gstatic|jsdelivr/, r => r.abort());
        await C.addInitScript(() => {
            Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => ({ requestDevice() {} }), configurable: true });
            Object.defineProperty(Navigator.prototype, 'serial', { get: () => ({ requestPort() {} }), configurable: true });
            localStorage.setItem('home-role:v1', 'teacher');
            localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true }));
        });
        const CP = await C.newPage();
        await CP.goto(ROOT + 'index.html');
        for (const h of ['environment-lab', 'arduino-nano-lab', 'em-induction', 'ideal-gas']) assert.doesNotMatch(await CP.textContent('a.pick-card[href="projects/' + h + '.html"]'), /⚠/, h);
        assert.match(await CP.textContent('a.pick-card[href="projects/malus-law.html"]'), /측정은 폰으로/);
        assert.equal(await CP.getAttribute('#pendulumCard', 'href'), 'projects/pendulum-report.html');
        // 로그인은 맨 위 줄(header) 안 (2026-11-23 "로그인 기능도 맨 위로")
        assert.equal(await CP.isVisible('header #homeAuth #signInBtn'), true, '구글 로그인 단추는 맨 위 줄에');
        await CP.click('#adminBox summary');
        await CP.waitForSelector('#devLinks:not([hidden])');
        // 24인치(1920×1080): 보고서 실험 9개가 5+4 두 줄, 행사·센서·도구 7개가 다음 한 줄, 모두 첫 화면 안
        await CP.click('#adminBox summary');
        await CP.setViewportSize({ width: 1920, height: 1080 });
        const rows = await CP.evaluate(() => {
            const tops = sel => [...new Set([...document.querySelectorAll(sel)].map(a => Math.round(a.getBoundingClientRect().top)))];
            const all = [...document.querySelectorAll('#labsList .pick-card')].filter(a => !a.closest('#customSection'));
            return { report: tops('.report-grid > .pick-card'), split: tops('.home-split .pick-card'), bottom: Math.max(...all.map(a => a.getBoundingClientRect().bottom)) };
        });
        assert.equal(rows.report.length, 2, '보고서 실험 두 줄(5+4): ' + rows.report);
        assert.equal(rows.split.length, 1, '행사·센서·도구 한 줄: ' + rows.split);
        assert.ok(rows.bottom <= 1080, '카드가 모두 첫 화면 안: ' + rows.bottom);
        assert.equal(await CP.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '1920 가로 스크롤');
        // 일반 구글 계정: 개발 도구 링크 없음
        const G = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await G.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await G.route(/gstatic|jsdelivr/, r => r.abort());
        await G.addInitScript(() => { localStorage.setItem('home-role:v1', 'teacher'); localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-2', google: true })); });
        const GP = await G.newPage();
        await GP.goto(ROOT + 'index.html');
        await GP.click('#adminBox summary'); await GP.waitForTimeout(500);
        assert.equal(await GP.isVisible('#devLinks'), false);
    } finally { await browser.close(); api.close(); stat.close(); }
});
