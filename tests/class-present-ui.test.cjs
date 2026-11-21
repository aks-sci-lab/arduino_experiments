// 🎬 발표 보기 (2026-11-20 선생님 "수업 진행하기에서는 학생의 화면이 보이도록", "웹앱만으로 프레젠테이션을 대신") — Playwright, 가짜 저장소
//  교사(1280): 진행 화면 → 🎬 발표 보기 → iframe 의 실험 페이지가 발표용(?present=1): 1단계, 2단계 🔒, 수업 참여 띠·조 공유 없음, 카메라 요청 없음
//  학생 폰(iPhone 13) 한 대 참여 → → 키 (1단계엔 작은 탭 없음) → '다음 단계를 열까요?' → Enter → 학생 폰·발표 화면 같이 2단계
//  2단계(이론)에서 → 는 작은 탭만 넘김(학생 폰은 그대로), '들어온 학생' 수는 그대로(발표용은 참여 안 함), 1920 폭, 로켓은 폰 모양 틀
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('발표 보기: 발표용 iframe 은 참여하지 않고 단계 잠금은 학생과 같게, 키로 작은 탭·다음 단계 열기, 로켓 폰 틀', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const ctx = async (opt, name, teacher) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' }); });
        await c.route(/gstatic/, r => r.abort());
        // 설명 화면(📖)은 tests/lesson-slides-ui.test.cjs 가 봄 — 여기서는 학생 화면(iframe)만
        await c.route('**/js/lesson-content/**', r => r.fulfill({ status: 404, body: '' }));
        await c.addInitScript(t => {
            if (t) localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true }));
            // 카메라·센서 권한 요청을 세어 봄 (발표용은 0 이어야)
            window.__gum = 0;
            if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = function () { window.__gum++; return Promise.reject(new Error('막음')); };
        }, !!teacher);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const noHScroll = async (pg, n) => assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
    try {
        const q = await app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 1 });
        const T = await ctx({ viewport: { width: 1280, height: 900 } }, 'T', true);
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + q.space + '&view=run');
        await T.waitForSelector('#stageCard:not([hidden])');
        await T.click('#btnPresent');
        await T.waitForSelector('#presentPane:not([hidden])');
        assert.match(T.url(), /view=present/);
        assert.equal(await T.isVisible('#cornerQr'), true, '발표 화면에도 오른쪽 위 QR');
        assert.equal(await T.isVisible('.ct-head'), false, '머리말은 숨김');
        assert.equal(await T.isVisible('#classOut'), false, '큰 QR 화면은 숨김');
        const F = () => T.frames().find(f => /present=1/.test(f.url()));
        await T.waitForFunction(() => { const f = document.getElementById('presentFrame'); const d = f && f.contentDocument; return d && d.querySelector('nav.steps button[data-step="theory"].cs-locked'); }, null, { timeout: 15000 });
        const frame = F();
        assert.ok(frame, '발표용 iframe');
        assert.match(frame.url(), /c=2-\d{4}.*s=c[a-z0-9]{23}.*present=1/);
        const sel = fr => fr.evaluate(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.dataset.step : ''; });
        assert.equal(await sel(frame), 'purpose');
        assert.equal(await frame.evaluate(() => document.documentElement.classList.contains('lab-present')), true);
        assert.equal(await frame.evaluate(() => [...document.querySelectorAll('.cs-bar, .cs-share, .cs-phonecard')].filter(e => e.getClientRects().length).length), 0, '수업 참여 띠·조 공유·폰 QR 없음');
        assert.match(await T.textContent('#pStage'), /1 목적.*\(1 \/ 7\)/);

        // 학생 폰 한 대 참여
        const S = await ctx(devices['iPhone 13'], 'S');
        await S.goto(ROOT + 'projects/quantum-dot.html?c=' + q.classCode + '&s=' + q.space);
        await S.waitForSelector('#cs-cpick:not([hidden])');
        await S.selectOption('#cs-cjo', '1'); await S.selectOption('#cs-cnum', '1'); await S.click('#cs-cjoin');
        await S.waitForSelector('nav.steps button[data-step="theory"].cs-locked');
        await T.click('#btnRefresh').catch(() => {});   // (발표 화면에서는 숨겨진 단추 — 실시간으로 바뀜)
        await T.waitForFunction(() => /들어온 학생 1 \/ 4/.test(document.getElementById('pJoined').textContent), null, { timeout: 15000 });

        // → : 글자를 화면 높이에 맞춰 키워 1단계가 한 화면보다 길면 먼저 아래로 내려감 → 끝에 닿으면 다음 단계 열기 확인 → Enter
        const press = async (key, until, max) => { for (let i = 0; i < (max || 25); i++) { if (await until()) return i; await T.keyboard.press(key); await T.waitForTimeout(80); } return await until() ? max : -1; };
        const scrolls = await press('ArrowRight', () => T.isVisible('#pAsk'));
        assert.ok(scrolls >= 1, '단계 끝에서 한 번 더 → 열기 확인');
        assert.equal(await T.isVisible('#pAsk'), true, '단계 끝에서 한 번 더 → 열기 확인');
        assert.match(await T.textContent('#pAskText'), /2 이론/);
        assert.equal(app.db.docs.get('labClasses/' + q.space).stage, 1, '확인 전에는 열지 않음');
        await T.keyboard.press('Escape');
        assert.equal(await T.isVisible('#pAsk'), false, 'Esc 로 취소');
        await T.keyboard.press('PageDown');   // 이미 끝까지 내려가 있어 바로 열기 확인
        assert.equal(await T.isVisible('#pAsk'), true);
        await T.keyboard.press('Enter');
        await T.waitForFunction(() => /2 이론.*\(2 \/ 7\)/.test(document.getElementById('pStage').textContent));
        await S.waitForFunction(() => document.querySelector('nav.steps button[aria-selected="true"]').dataset.step === 'theory', null, { timeout: 15000 });
        await T.waitForFunction(() => document.getElementById('presentFrame').contentDocument.querySelector('nav.steps button[aria-selected="true"]').dataset.step === 'theory', null, { timeout: 15000 });

        // 2단계 안에서 → 는 작은 탭만 (학생 폰은 첫 탭 그대로)
        const subSel = pg => pg.evaluate(() => { const n = [...document.querySelectorAll('nav.subtabs')].find(x => x.getClientRects().length); const b = n && n.querySelector('button[aria-selected="true"]'); return b ? b.textContent.trim() : ''; });
        const first = await subSel(F());
        assert.equal(first, await subSel(S));
        await press('ArrowRight', async () => (await subSel(F())) !== first);   // 먼저 내려가고 끝에서 다음 작은 탭
        const second = await subSel(F());
        assert.notEqual(second, first, '발표 화면은 다음 작은 탭');
        assert.equal(await F().evaluate(() => Math.round(scrollY)), 0, '다음 작은 탭은 맨 위부터');
        assert.equal(await subSel(S), first, '학생 폰은 그대로');
        await T.keyboard.press('ArrowLeft');
        assert.equal(await subSel(F()), first, '맨 위에서 ← 는 앞 작은 탭');
        // iframe 안을 누른 뒤에도 같은 키
        await F().click('body');
        await press('ArrowRight', async () => (await subSel(F())) === second);
        assert.equal(await subSel(F()), second, 'iframe 안에서도 → 로 넘김');
        await T.click('#btnPPrev');
        assert.equal(await subSel(F()), first, '◀ 이전 단추');

        // 발표용은 학생으로 참여하지 않음: 진행 자료(하트비트)는 학생 한 명뿐, 카메라 요청 없음
        const prog = [...app.db.docs.keys()].filter(k => k.startsWith('labClasses/' + q.space + '/progress/'));
        assert.equal(prog.length, 1, '들어온 학생 수 그대로: ' + prog.join(', '));
        assert.match(await T.textContent('#pJoined'), /들어온 학생 1 \/ 4/);
        assert.equal(await F().evaluate(() => window.__gum), 0, '발표용은 카메라 권한을 묻지 않음');
        await noHScroll(T, '발표 1280');

        // 1920 폭
        await T.setViewportSize({ width: 1920, height: 1080 });
        await noHScroll(T, '발표 1920');
        const fb = await T.locator('#presentFrame').boundingBox(), qb = await T.locator('#cornerQrImg').boundingBox();
        assert.ok(fb.x + fb.width <= qb.x, '오른쪽 위 QR 이 발표 화면을 가리지 않음');
        assert.ok(fb.width > 1400, '발표 화면 폭: ' + fb.width);
        // ✕ 진행 화면으로
        await T.click('#btnPExit');
        await T.waitForSelector('#stageCard:not([hidden])');
        assert.equal(await T.isVisible('#presentPane'), false);

        // 로켓 (행사형): 폰 모양 틀, 열린 단계 첫 화면 → 열기 → 1차시 첫 화면
        const r = await app.post({ action: 'createClass', ban: 5, mode: 'team', nTeams: 3, exp: 'rocket', stage: 1 });
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + r.space + '&view=present'); await T.reload();   // 새 수업까지 목록을 다시 받음
        await T.waitForSelector('#presentPane.phone:not([hidden])');
        assert.equal(await T.isVisible('#classOut'), false, '주소로 바로 연 발표 화면에 큰 QR 이 겹치지 않음');
        await T.waitForFunction(() => { const d = document.getElementById('presentFrame').contentDocument; return d && d.getElementById('ev-app') && d.getElementById('ev-app').getAttribute('data-screen') === 'think-intro'; }, null, { timeout: 15000 });
        const pb = await T.locator('#presentFrame').boundingBox(), vh = T.viewportSize().height;   // 폰 틀은 화면 높이에 맞춰 (폰 비율 400 × 820)
        assert.ok(pb.width / pb.height > 0.45 && pb.width / pb.height < 0.56, '폰 틀 비율: ' + Math.round(pb.width) + '×' + Math.round(pb.height));
        assert.ok(pb.y + pb.height <= vh + 1 && pb.height >= vh * 0.75, '폰 틀이 화면 높이에 맞음');
        await T.keyboard.press('ArrowRight');
        assert.equal(await T.isVisible('#pAsk'), true);
        await T.click('#btnPAskYes');
        await T.waitForFunction(() => document.getElementById('presentFrame').contentDocument.getElementById('ev-app').getAttribute('data-screen') === 't1-intro', null, { timeout: 15000 });
        assert.equal(app.db.docs.get('labClasses/' + r.space).stage, 2);
        assert.equal([...app.db.docs.keys()].filter(k => k.startsWith('labClasses/' + r.space + '/teams/') || k.startsWith('labClasses/' + r.space + '/progress/')).length, 0, '발표용은 팀 자리를 잡지 않음');
        await noHScroll(T, '로켓 발표 1920');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
