// 교사 화면 수업 목록·QR (2026-11-20 선생님 의견): 첫 화면 = 내 수업 목록(날짜·주제·상태) → 누르면 큰 QR → 다음 → 진행 보기(오른쪽 위 QR)
// 주소 #class=… 로 새로고침해도 그 수업, 뒤로 가기로 앞 화면, ✅ 수업 마치기·되돌리기. 375px·1280 가로 스크롤 없음·단추 44px
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('교사 수업 목록 → 큰 QR → 진행 보기(오른쪽 위 QR) → 새로고침·뒤로 가기 → 수업 마치기·되돌리기', { skip: !chromium && 'playwright 없음', timeout: 180000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const ctx = async (opt, name) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : '' }));
        await c.route(/gstatic/, r => r.abort());
        await c.addInitScript(() => { localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); });
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const layout = async (pg, n) => {
        assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
        const small = await pg.evaluate(() => [...document.querySelectorAll('button, select')].filter(e => e.offsetParent && !e.closest('td, th, .subtabs') && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim().slice(0, 20)));
        assert.deepEqual(small, [], n + ' 작은 단추');
    };
    try {
        // 수업 셋 (실험 다르게, 만든 시각 다르게)
        const a = await app.post({ action: 'createClass', ban: 1, nStudents: 8, groupSize: 4, exp: 'malus' });
        await new Promise(r => setTimeout(r, 20));
        const b = await app.post({ action: 'createClass', ban: 2, nStudents: 6, groupSize: 3, exp: 'qdot', stage: 1 });
        await new Promise(r => setTimeout(r, 20));
        const c = await app.post({ action: 'createClass', ban: 3, mode: 'team', nTeams: 5, exp: 'rocket', stage: 1 });

        const T = await ctx({ viewport: { width: 1280, height: 900 } }, 'T');
        await T.goto(ROOT + 'projects/class-teacher.html');
        await T.waitForSelector('#classList .ct-cls');
        assert.equal(await T.isVisible('#viewList'), true, '첫 화면 = 수업 목록');
        assert.equal(await T.locator('#watchSel').count(), 0, '드롭다운 없음');
        assert.equal(await T.isVisible('#btnGoMake'), true, '수업 만들기 단추는 목록 위에');
        const cards = await T.$$eval('#classList .ct-cls', els => els.map(e => e.textContent));
        assert.equal(cards.length, 3);
        assert.match(cards[0], /필름통 로켓[\s\S]*3반[\s\S]*최대 5팀[\s\S]*코드 3-\d{4}[\s\S]*📅 \d+월 \d+일 \(.\)[\s\S]*진행 중[\s\S]*단계 1 \/ 4/, '최근 수업이 위: ' + cards[0]);
        assert.match(cards[1], /탄소 양자점[\s\S]*2반[\s\S]*6명 · 2개 조[\s\S]*단계 1 \/ 7/);
        assert.match(cards[2], /말루스[\s\S]*모든 단계 열림/);
        await layout(T, '목록 1280');

        // 하나 누르면 큰 QR
        await T.click('#classList button[data-open="' + b.space + '"]');
        await T.waitForSelector('#classOut:not([hidden])');
        assert.match(T.url(), new RegExp('#class=' + b.space + '$'));
        assert.equal(await T.textContent('#outCode'), b.classCode);
        const qrW = await T.evaluate(() => document.getElementById('qr').getBoundingClientRect().width);
        assert.ok(qrW >= 400, '첫 화면 QR 크게: ' + qrW);
        assert.equal(await T.isVisible('#cornerQr'), false, '첫 화면에는 오른쪽 위 QR 없음');
        // 다음 → 진행 보기: 오른쪽 위 QR
        await T.click('#btnToRun');
        await T.waitForSelector('#stageCard:not([hidden])');
        assert.match(T.url(), /view=run/);
        assert.equal(await T.isVisible('#cornerQr'), true);
        const box = await T.locator('#cornerQrImg').boundingBox();
        assert.ok(box.width >= 160 && box.height >= 160, '오른쪽 위 QR 크기: ' + box.width);
        const winW = await T.evaluate(() => innerWidth);
        assert.ok(box.x + box.width > winW - 40 && box.y < 40, '오른쪽 위');
        assert.match(await T.textContent('#cornerQr'), new RegExp(b.classCode));
        const sb = await T.locator('#stageCard').boundingBox();
        assert.ok(sb.x + sb.width <= box.x, '오른쪽 위 QR 이 진행 화면을 가리지 않음');
        await layout(T, '진행 1280');
        await T.click('#cornerQr'); assert.equal(await T.isVisible('#bigQr'), true, '누르면 크게'); await T.click('#btnBigClose');
        // 새로고침해도 그 수업 진행 화면
        await T.reload();
        await T.waitForSelector('#stageCard:not([hidden])');
        assert.match(await T.textContent('#classTitle'), /탄소 양자점/);
        assert.equal(await T.isVisible('#classOut'), false, '주소로 바로 연 진행 화면에 큰 QR 이 겹쳐 나오지 않음');
        // 뒤로 가기 → 큰 QR → 목록
        await T.goBack(); await T.waitForSelector('#classOut:not([hidden])');
        await T.goBack(); await T.waitForSelector('#viewList:not([hidden])');
        // 수업 마치기 → 목록에 ✅ (아래 '마친 수업') → 되돌리기
        await T.click('#classList button[data-open="' + a.space + '"]'); await T.click('#btnToRun');
        await T.click('#btnDone');
        await T.waitForFunction(() => /마친 수업으로 표시/.test(document.getElementById('doneMsg').textContent));
        assert.match(await T.textContent('#btnDone'), /다시 진행 중/);
        await T.click('#btnToList');
        assert.equal(await T.locator('#classList .ct-cls').count(), 2, '진행 중 목록에서 빠짐');
        assert.equal(await T.isVisible('#doneBox'), true);
        assert.match(await T.textContent('#doneSum'), /마친 수업 \(1\)/);
        await T.click('#doneSum');
        assert.match(await T.textContent('#doneList'), /말루스[\s\S]*✅ 마침/);
        assert.equal(app.db.docs.get('labClasses/' + a.space).done, true);
        await T.click('#doneList button[data-open="' + a.space + '"]'); await T.click('#btnToRun');
        await T.click('#btnDone');
        await T.waitForFunction(() => /다시 진행 중인 수업/.test(document.getElementById('doneMsg').textContent));
        await T.click('#btnToList');
        assert.equal(await T.locator('#classList .ct-cls').count(), 3);
        assert.equal(await T.isVisible('#doneBox'), false);
        // 팀 결과판 크게 보기에도 QR
        await T.click('#classList button[data-open="' + c.space + '"]'); await T.click('#btnToRun');
        await T.click('#btnBoardBig');
        assert.equal(await T.isVisible('#boardBigQr svg'), true);
        await T.click('#btnBoardClose');

        // 375px: 목록·QR·진행 (오른쪽 위 QR 은 작은 단추로)
        const N = await ctx({ viewport: { width: 375, height: 760 } }, 'N');
        await N.goto(ROOT + 'projects/class-teacher.html');
        await N.waitForSelector('#classList .ct-cls');
        await layout(N, '목록 375');
        await N.click('#classList button[data-open="' + b.space + '"]');
        await layout(N, 'QR 375');
        await N.click('#btnToRun');
        await N.waitForSelector('#stageCard:not([hidden])');
        assert.equal(await N.isVisible('#cornerQrImg'), false, '폰 폭에서는 접힘');
        assert.equal(await N.isVisible('#cornerQr'), true);
        await layout(N, '진행 375');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
