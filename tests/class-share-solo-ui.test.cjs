// 수업 없이 연 화면(주소에 ?c= 없음)에서는 조별 활동(👥 조 공유·선생님께 보내기)을 보이지 않는다 (2026-11-20 선생님 결정
//  "교사가 만든 큐알이나 사이트로 접속하지 않은 경우에는 조별 활동 필요없음"). 📱 폰 → 노트북 짝 QR 은 그대로.
//  대표 실험: 진자 분석(이원화, 자체 화면)·말루스(이원화, share.phoneCard)·플랑크(블루투스)·선생님이 만든 실험. 가짜 저장소(tests/fake-lab-store.cjs)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
const P = require('../js/pendulum-math.js');
const PC = require('../js/pendulum-cloud.js');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = (cfg && cfg.options) || {}; this.scales = { x: { getPixelForValue: () => 0, getValueForPixel: () => 0 } }; this.chartArea = { left: 0, right: 1, top: 0, bottom: 1 }; } update() {} destroy() {} resize() {} static register() {} }; window.Chart.helpers = { getRelativePosition: () => ({ x: 0, y: 0 }) };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';
const STU = { uid: 'phone-1', anonymous: true };

test('수업 없이 연 화면: 조 공유 없음 · 폰 짝 QR 은 그대로 · ?c= 면 지금처럼', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch();
    const errors = [];
    const open = async (url, opt, name, init) => {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opt || {}));
        await ctx.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await ctx.route(/cdn\.jsdelivr|cdnjs|unpkg/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) && !/plugin/i.test(u) ? CHART_STUB : '' }); });
        await ctx.route(/gstatic|googleapis/, r => r.abort());
        if (init) await ctx.addInitScript(init);
        const pg = await ctx.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        await pg.goto(ROOT + url);
        return pg;
    };
    const layout = async (pg, n) => {
        assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
        const small = await pg.evaluate(() => [...document.querySelectorAll('button, select')].filter(e => e.offsetParent && !e.closest('td, th, .subtabs, .steps, nav') && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim().slice(0, 20)));
        assert.deepEqual(small, [], n + ' 44px 보다 작은 단추');
    };
    const visible = (pg, sel) => pg.evaluate(s => [...document.querySelectorAll(s)].some(e => e.getClientRects().length > 0), sel);
    const noGroup = async (pg, n) => {
        assert.equal(await pg.evaluate(() => document.documentElement.classList.contains('cs-solo')), true, n + ': cs-solo');
        assert.equal(await pg.locator('#cs-share, #cs-group, #cs-make, #cs-send').count(), 0, n + ': 조 공유 칸·조 코드 입력 없음');
        assert.equal(await visible(pg, '.cs-hide-solo'), false, n + ': 조·선생님 안내 숨김');
    };
    try {
        // ---------- 1) 진자 분석 (노트북, 자체 화면): 조 코드 칸 없이 바로 짝 QR → 폰이 보낸 측정이 표에 ----------
        const R = await open('projects/pendulum-report.html#step-5', {}, '진자 노트북', () => {
            // 예전에 수업 없이 조 코드로 쓰던 기기 (그 표는 새 짝으로 옮겨 보임)
            localStorage.setItem('pendulum-report:group', JSON.stringify('2-3-4821'));
            localStorage.setItem('pendulum-report:data:2-3-4821', JSON.stringify({ items: [{ id: 'mold000001', L: 0.5, T: 1.42, Tstd: 0.01, n: 10, source: 'csv' }], excluded: [] }));
        });
        await R.waitForSelector('#qrCard:not([hidden])');
        assert.equal(await R.isVisible('#groupCard'), false, '진자: 조 코드 만들기 칸 없음');
        assert.equal(await R.isVisible('#btnLeave'), false); assert.equal(await R.isVisible('#codeShow'), false, '조 코드를 보이지 않음');
        const qrUrl = await R.getAttribute('#qrUrl', 'href');
        const mm = /group=([\d-]+)&s=(p[a-z0-9]{23})$/.exec(qrUrl);
        assert.ok(mm, '짝 QR 주소: ' + qrUrl);
        assert.match(await R.textContent('#serverInfo'), /짝 공간/);
        assert.match(await R.textContent('#tableBody, table'), /0\.50|0\.5/, '예전 표가 남아 있음');
        // 폰(그 QR 주소의 공간)이 측정을 보냄
        const s = P.simulate({ L: 0.9, duration: 25, seed: 3 });
        const { payload } = PC.buildSavePayload({ id: 'mphone00001', group: decodeURIComponent(mm[1]), conditions: { L: '0.90', amplitude: '5' }, result: P.analyze(s, { nPeriods: 10 }), samples: s, source: 'sensor', device: 'iOS' });
        const sv = await app.post(Object.assign({ space: mm[2] }, payload), STU);
        assert.equal(sv.ok, true, sv.error);
        await R.waitForFunction(() => /0\.90/.test(document.body.textContent), null, { timeout: 15000 });
        await layout(R, '진자 노트북');
        // 새로고침해도 같은 짝
        await R.reload(); await R.waitForSelector('#qrCard:not([hidden])');
        assert.equal(await R.getAttribute('#qrUrl', 'href'), qrUrl, '짝은 이 노트북에 기억');
        await R.context().close();

        // ---------- 2) 말루스 (이원화, 공통 부품): 노트북은 폰 카드만, 폰이 보낸 회차가 도착 ----------
        const M = await open('projects/malus-law.html#step-5', {}, '말루스 노트북', () => {
            localStorage.setItem('class-share:malus', JSON.stringify({ group: '2-3-4821', ban: '2', jo: '3', auto: true, sent: [], device: 'nab12cd' }));   // 예전 조 코드 기억
        });
        await M.waitForSelector('#phone-card .cs-pcard', { timeout: 15000 });
        await noGroup(M, '말루스 노트북');
        assert.equal(await M.isVisible('#btn-send2'), false, '선생님께 보내기 단추 없음');
        const plink = await M.getAttribute('#phone-card a', 'href');
        const pm = /role=phone&group=([\d-]+)&s=(p[a-z0-9]{23})/.exec(plink);
        assert.ok(pm, '폰 주소: ' + plink);
        assert.notEqual(decodeURIComponent(pm[1]), '2-3-4821', '예전 조 코드(남과 같이 쓰는 공간)는 쓰지 않음');
        assert.ok(!/[?&]c=/.test(plink));
        // 폰 화면(iPhone 13): 조 공유 칸·조 코드 입력 없이 측정 화면
        const Mp = await open(plink.replace(/^https?:\/\/[^/]+\//, ''), devices['iPhone 13'], '말루스 폰');
        await Mp.waitForSelector('.cs-phonebar, #cs-pbar, .cs-bar', { timeout: 15000 }).catch(() => {});
        assert.equal(await Mp.evaluate(() => document.documentElement.classList.contains('cs-solo')), false, '폰 화면은 cs-solo 아님');
        await layout(Mp, '말루스 폰');
        await Mp.context().close();
        // 폰이 보낸 회차 (같은 공간·조)
        const pr = await app.post({ action: 'save', exp: 'malus', space: pm[2], group: decodeURIComponent(pm[1]), id: 'pzz9999-r1', device: 'pzz9999', title: '1회차', n: 2, summary: { '점': 2 },
            data: JSON.stringify({ v: 1, run: 1, pts: [{ a: 0, i: 100, t: 1 }, { a: 90, i: 3, t: 2 }] }) }, STU);
        assert.equal(pr.ok, true, pr.error);
        await M.waitForFunction(() => /폰에서 새 측정/.test((document.getElementById('cs-cardst') || {}).textContent || '') || /📱 폰/.test(document.body.textContent), null, { timeout: 15000 });
        await layout(M, '말루스 노트북');
        await M.context().close();

        // ---------- 3) 플랑크 (블루투스): 노트북·폰·태블릿 모두 조 공유 없음, ?c= 면 지금처럼 ----------
        for (const [name, opt] of [['노트북', {}], ['iPhone 13', devices['iPhone 13']], ['Galaxy Tab S4', devices['Galaxy Tab S4']]]) {
            const L = await open('projects/planck-led.html#step-5', opt, '플랑크 ' + name);
            await L.waitForFunction(() => document.documentElement.classList.contains('cs-solo'), null, { timeout: 15000 });
            await noGroup(L, '플랑크 ' + name);
            assert.equal(await L.locator('#btn-send2').isVisible(), false);
            await layout(L, '플랑크 ' + name);
            await L.context().close();
        }
        const c = await app.post({ action: 'createClass', ban: 3, nStudents: 4, groupSize: 2, exp: 'planck' });
        const C = await open('projects/planck-led.html?c=' + c.classCode + '&s=' + c.space + '#step-5', {}, '플랑크 수업');
        await C.waitForSelector('#cs-cpick:not([hidden])', { timeout: 15000 });
        assert.equal(await C.evaluate(() => document.documentElement.classList.contains('cs-solo')), false);
        await C.selectOption('#cs-cjo', '1'); await C.selectOption('#cs-cnum', '1'); await C.click('#cs-cjoin');
        await C.waitForSelector('#cs-cjoined:not([hidden])');
        assert.equal(await C.locator('#cs-share').count(), 1, '수업이면 조 공유 칸 그대로');
        assert.equal(await C.inputValue('#cs-group'), c.groups[0].code);
        await C.context().close();

        // ---------- 4) 선생님이 만든 실험: 선생님께 보내기 카드 대신 인쇄 안내 ----------
        const def = () => localStorage.setItem('customLabDef:v1:ohm01', JSON.stringify({ title: '옴의 법칙', description: '', columns: [{ name: 'V' }, { name: 'I' }], questions: [], published: true }));
        const U = await open('projects/custom-lab.html?id=ohm01', { viewport: { width: 375, height: 800 } }, '만든 실험', def);
        await U.waitForFunction(() => document.documentElement.classList.contains('cs-solo'), null, { timeout: 15000 });
        await noGroup(U, '만든 실험');
        assert.equal(await U.isVisible('#btnSubmit'), false);
        assert.equal(await visible(U, '#submitCard .cs-show-solo'), true, '인쇄 안내');
        await layout(U, '만든 실험 375px');
        await U.context().close();

        assert.deepEqual(errors.filter(e => !/Chart|chartjs|annotation|getUserMedia|NotAllowed|NotFound|camera/i.test(e)), [], '페이지 오류');
    } finally { await browser.close(); api.close(); stat.close(); }
});
