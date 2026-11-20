// 교사 화면(projects/class-teacher.html, 2026-11-18 Firestore): 구글 로그인 → 수업 만들기 → 학생 2명 같은 조(폰 QR 측정 골라 보내기)
// → 노트북 즉시 도착 → 교사 진행 보기 → CSV 내려받기(BOM·한 줄 = 한 회차) → 지우기. 가짜 저장소(tests/fake-lab-store.cjs)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = (cfg && cfg.options) || {}; } update() {} destroy() {} resize() {} static register() {} }; window.Chart.helpers = { getRelativePosition: () => ({ x: 0, y: 0 }) };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';

test('교사 화면: 로그인 → 수업 → 학생·폰 → 진행 보기 → CSV → 지우기 (375px·1280px)', { skip: !chromium && 'playwright 없음', timeout: 180000 }, async () => {
    const app = loadLabStore();
    const api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const ctx = async (opt, name) => {
        const c = await browser.newContext(Object.assign({ acceptDownloads: true }, opt));
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' }); });
        await c.route(/gstatic/, r => r.abort());
        const pg = await c.newPage(); pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept()); return pg;
    };
    const layout = async (pg, n) => {
        assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
        const small = await pg.evaluate(() => [...document.querySelectorAll('button, select')].filter(e => e.offsetParent && !e.closest('td, th, .subtabs') && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim().slice(0, 20)));
        assert.deepEqual(small, [], n + ' 44px 보다 작은 단추');
    };
    try {
        // ---- 교사 (375px): 로그인 전에는 만들 수 없음 ----
        const T = await ctx({ viewport: { width: 375, height: 800 } }, 'T');
        await T.goto(ROOT + 'projects/class-teacher.html');
        await T.waitForSelector('#btnLogin:not([hidden])');
        assert.match(await T.textContent('#loginNow'), /구글 계정으로 로그인/);
        assert.equal(await T.isVisible('#viewMain'), false, '로그인 전에는 진행 화면 없음');
        assert.equal(await T.isVisible('#viewSettings'), false);
        assert.equal(await T.isVisible('#btnSettings'), false);
        await layout(T, '교사 로그인 전');
        await T.click('#btnLogin');
        await T.waitForSelector('#btnSettings:not([hidden])'); await T.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); }); await T.click('#ctTabs button[data-tab="make"]');
        assert.match(await T.textContent('#acctNow'), /로그인됨/);
        assert.equal(await T.isVisible('#acctNow'), false, '이메일 등 계정 정보는 설정 → 계정 안에만');
        await T.fill('#inBan', '2'); await T.fill('#inN', '4'); await T.fill('#inSize', '2');
        await T.selectOption('#inExp', 'phoneaccel');
        await T.click('#btnCreate');
        await T.waitForSelector('#classOut:not([hidden])');
        const code = (await T.textContent('#outCode')).trim(), link = await T.getAttribute('#outLink', 'href');
        assert.match(code, /^2-\d{4}$/);
        assert.match(link, /phone-accelerometer\.html\?c=2-\d{4}&s=c[a-z0-9]{23}$/);
        assert.match(await T.textContent('#outExpire'), /\d{4}년 \d{1,2}월 \d{1,2}일에 저절로 지워져요/);
        assert.match(await T.textContent('#classList'), new RegExp(code));
        await layout(T, '교사 수업 만든 뒤');
        // 다른 컴퓨터에서 같은 계정으로 로그인해도 내 수업이 보임
        const T2 = await ctx({ viewport: { width: 1280, height: 800 } }, 'T2');
        await T2.goto(ROOT + 'projects/class-teacher.html');
        await T2.click('#btnLogin');
        await T2.waitForFunction(c => document.getElementById('classList').textContent.includes(c), code);
        // 다른 선생님은 못 봄
        const st0 = await app.post({ action: 'classStatus', class: code }, { uid: 'other', google: true });
        assert.match(st0.error, /만든 선생님만/);

        // ---- 학생 노트북 A (1280, 노트북) 1조 1번 → 📱 폰 QR → 폰이 두 회차 재고 하나만 골라 보내기 → 노트북 즉시 ----
        const A = await ctx({ viewport: { width: 1280, height: 800 } }, 'A');
        await A.goto(link.replace(/^https?:\/\/[^/]+\//, ROOT));
        await A.waitForSelector('#cs-cpick:not([hidden])');
        await A.selectOption('#cs-cjo', '1'); await A.selectOption('#cs-cnum', '1'); await A.click('#cs-cjoin');
        await A.waitForSelector('#cs-cjoined:not([hidden])');
        const phoneLink = await A.evaluate(() => window.__share ? __share.phoneLink() : document.querySelector('.cs-pcard a, #cs-plink') && document.querySelector('.cs-pcard a, #cs-plink').href);
        assert.ok(phoneLink, '폰 주소');
        assert.match(phoneLink, /role=phone&group=2-1-\d{4}&s=c[a-z0-9]{23}&c=2-\d{4}&jo=1&num=1/);
        // 학생 B 같은 조
        const B = await ctx({ viewport: { width: 375, height: 800 } }, 'B');
        await B.goto(link.replace(/^https?:\/\/[^/]+\//, ROOT));
        await B.waitForSelector('#cs-cpick:not([hidden])');
        await B.selectOption('#cs-cjo', '1'); await B.selectOption('#cs-cnum', '2'); await B.click('#cs-cjoin');
        await B.waitForSelector('#cs-cjoined:not([hidden])');
        // 폰: 같은 공간에 직접 두 회차 중 하나 (페이지 대신 저장소 요청으로 — 폰 화면 자체는 accelerometer-phone-ui 시험)
        const g1 = (await app.post({ action: 'joinInfo', class: code }, { uid: 'p' })).groups[0].code;
        const space = /[?&]s=(c[a-z0-9]{23})/.exec(link)[1];
        const sv = await app.post({ action: 'save', space, exp: 'phoneaccel', group: g1, id: 'pphone1-run2', device: 'pphone1', title: '2회 · 손에 들고', n: 120,
            summary: { '최대 a (m/s²)': 12.3 }, data: JSON.stringify({ t: [0, 1], a: [9.8, 12.3] }), sentAt: new Date().toISOString() }, { uid: 'anon-phone' });
        assert.equal(sv.ok, true, sv.error);
        await app.post({ action: 'heartbeat', space, class: code, jo: 1, num: 1, step: 'phone-live', points: 120, submitted: true, device: 'pphone1' }, { uid: 'anon-phone' });
        await A.waitForFunction(() => /📱 폰/.test(document.body.textContent), null, { timeout: 15000 });

        // ---- 교사 진행 보기 ----
        await T.evaluate(() => { const b = document.getElementById('btnMain'); if (!b.hidden) b.click(); });
        await T.waitForFunction(() => /제출: 1개/.test(document.getElementById('groups').textContent), null, { timeout: 15000 });
        const groupsText = await T.textContent('#groups');
        assert.match(groupsText, /1조/); assert.match(groupsText, /2회 · 손에 들고/);
        assert.match(await T.textContent('#watchExpire'), /지워져요/);
        await layout(T, '교사 진행 보기');
        // CSV 내려받기 (전체)
        const [dl] = await (async () => { await T.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); }); await T.click('#ctTabs button[data-tab="dl"]'); return Promise.all([T.waitForEvent('download'), T.click('#btnCsv')]); })();
        const csv = fs.readFileSync(await dl.path(), 'utf8');
        assert.equal(csv.charCodeAt(0), 0xFEFF, 'UTF-8 BOM');
        const lines = csv.slice(1).trim().split(/\r\n/);
        assert.match(lines[0], /^조,조 코드,보낸 기기,회차 번호,회차 이름,점 수,보낸 시각,요약: 최대 a \(m\/s²\),자료 \(JSON\)$/);
        assert.equal(lines.length, 2, '한 줄 = 한 회차');
        assert.match(lines[1], /^1,2-1-\d{4},pphone1,pphone1-run2,2회 · 손에 들고,120,/);
        // 파일 이름(수업2-xxxx_….csv)은 시험 브라우저에서 한글 이름이 'download' 로 나와 확인하지 않음
        // 조별: 2조는 비어 있음
        await T.selectOption('#dlGroup', { index: 2 });
        const [dl2] = await (async () => { await T.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); }); await T.click('#ctTabs button[data-tab="dl"]'); return Promise.all([T.waitForEvent('download'), T.click('#btnCsv')]); })();
        assert.equal(fs.readFileSync(await dl2.path(), 'utf8').slice(1).trim().split(/\r\n/).length, 1);
        // JSON
        await T.selectOption('#dlGroup', '');
        const [dl3] = await (async () => { await T.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); }); await T.click('#ctTabs button[data-tab="dl"]'); return Promise.all([T.waitForEvent('download'), T.click('#btnJson')]); })();
        const js = JSON.parse(fs.readFileSync(await dl3.path(), 'utf8'));
        assert.equal(js.items.length, 1); assert.equal(js.items[0].data, '{"t":[0,1],"a":[9.8,12.3]}');

        // ---- 지우기 ----
        await T.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); }); await T.click('#ctTabs button[data-tab="make"]');
        await T.click('#classList button.danger');
        await T.waitForFunction(() => /지웠어요/.test(document.getElementById('listMsg').textContent));
        assert.equal(app.items('phoneaccel').length, 0, '학생 자료도 지움');
        assert.equal((await app.post({ action: 'joinInfo', class: code }, { uid: 'z' })).ok, false);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
