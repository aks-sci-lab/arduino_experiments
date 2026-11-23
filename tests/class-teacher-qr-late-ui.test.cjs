// 교사 화면: QR 도구(qrcode-generator, defer)가 화면보다 늦게 불러져도 큰 QR·오른쪽 위 QR·발표 화면 왼쪽 위 QR 이 다시 그려짐
// (예전에는 '불러오지 못했어요' 글이 남아 4K 시험 '큰 QR 한 변' 이 7번에 1번쯤 9.5~10 % 로 실패) — 도구를 끝내 못 받으면 안내 글
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('QR 도구가 늦게 와도 QR 이 그려짐, 끝내 못 받으면 안내', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    // qr: 'late' = 6초 늦게 (수업 목록·큰 QR 화면이 먼저 뜸), 'none' = 끝내 못 받음
    const ctx = async (qr) => {
        const c = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, async r => {
            if (!/qrcode/.test(r.request().url())) return r.fulfill({ contentType: 'text/javascript', body: '' });
            if (qr === 'none') return r.abort();
            await new Promise(res => setTimeout(res, 6000));
            return r.fulfill({ contentType: 'text/javascript', body: QR });
        });
        await c.route(/gstatic/, r => r.abort());
        await c.addInitScript(() => { localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); });
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    try {
        const c = await app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 1 });
        // 늦게 옴: 큰 QR 화면이 먼저 뜨고 '⏳' → 도구가 오면 QR 그림 (큰 QR 높이 = 화면 높이의 45 % 이상)
        const T = await ctx('late');
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space);
        await T.waitForSelector('#classOut:not([hidden])');
        assert.equal(await T.locator('#qr svg').count(), 0, '도구가 오기 전');
        assert.doesNotMatch(await T.textContent('#qr'), /불러오지 못했어요/, '기다리는 동안은 실패 안내가 아님');
        await T.waitForSelector('#qr svg', { timeout: 15000 });
        const h = await T.evaluate(() => document.getElementById('qr').getBoundingClientRect().height / innerHeight);
        assert.ok(h >= 0.45, '큰 QR 한 변 ' + (h * 100).toFixed(1) + '%');
        assert.equal(await T.locator('#cornerQrImg svg').count(), 1, '오른쪽 위 QR 도');
        // 발표 화면: 띠의 📱 QR 로 크게 (왼쪽 위 QR 칸은 2026-11-23 뺌)
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present'); await T.reload();
        await T.waitForSelector('#btnPQr'); await T.click('#btnPQr');
        await T.waitForSelector('#bigQrImg svg', { timeout: 15000 });
        // 끝내 못 받음: 기다린 뒤 안내 글 (학생은 수업 코드로 들어와도 돼요)
        const N = await ctx('none');
        await N.goto(ROOT + 'projects/class-teacher.html#class=' + c.space);
        await N.waitForSelector('#classOut:not([hidden])');
        await N.waitForFunction(() => /불러오지 못했어요/.test(document.getElementById('qr').textContent), null, { timeout: 20000 });
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
