// 메인 화면 역할별 (index.html, 2026-11-20): 첫 화면은 교사/학생 고르기만 → 학생: 수업 코드·수업 없이 실험 / 교사: 수업 진행 화면·실험 목록·사이트 관리
// 고른 역할은 이 브라우저에 기억(새로고침해도), 🔄 역할 바꾸기. 375px 가로 스크롤 없음·단추 44px, 가짜 저장소로 수업 코드 입장
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
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
        await P.click('#homeTabs button[data-tab="records"]'); assert.equal(await vis('#studentRecordsSection'), true, '기록 탭 그대로');
        await layout('교사');
        await P.reload(); assert.equal(await vis('#homeTeacher'), true, '새로고침해도 교사');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
