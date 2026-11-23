// 📖 수업 자료 편집 ② 그림 바꾸기 화면: 큰 사진 올리기 → 기기에서 긴 변 1280px·300KB 아래로 줄임 → 미리보기 → 💾 저장 → 🎬 발표 보기에 그 그림
// SVG 파일은 받지 않음, 그림 빼기·원래 그림, 기본 자료로 되돌리면 그림 문서도 지움
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('그림 바꾸기 → 줄여 저장 → 발표 보기 → 되돌리기', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
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
    const imgsOf = () => [...app.db.docs.keys()].filter(k => /^lessonEdits\/teacher-1\/imgs\//.test(k));
    try {
        const T = await ctx({ viewport: { width: 1280, height: 900 } }, 'T');
        await T.goto(ROOT + 'projects/lesson-editor.html#exp=rocket');
        await T.waitForSelector('#slideList .le-item');
        // 큰 사진 (3000×2000, 잡음이 많아 그대로면 300KB 넘음) 을 브라우저에서 만들어 파일로
        const big = await T.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d'), d = g.createImageData(3000, 2000);
            for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = (i / 4) % 3000 / 12; d.data[i + 2] = 120; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); return c.toDataURL('image/png').split(',')[1]; });
        const buf = Buffer.from(big, 'base64');
        assert.ok(buf.length > 1000000, '원본은 1MB 넘음: ' + buf.length);
        assert.equal(await T.frameLocator('#prevFrame').locator('.ls-fig svg').count(), 1, '첫 장 기본 그림(SVG)');
        await T.setInputFiles('#slideForm input[data-img="img"]', { name: 'photo.png', mimeType: 'image/png', buffer: buf });
        await T.waitForFunction(() => /그림을 바꿨어요/.test(document.querySelector('[data-imgmsg="img"]').textContent), null, { timeout: 20000 });
        const msg = await T.textContent('[data-imgmsg="img"]');
        assert.match(msg, /1280×853/, '긴 변 1280: ' + msg);
        assert.ok(Number(/(\d+)KB/.exec(msg)[1]) <= 300, '300KB 아래: ' + msg);
        const pv = await T.evaluate(() => { const i = document.getElementById('prevFrame').contentDocument.querySelector('.ls-fig img'); return i ? i.getAttribute('src').slice(0, 23) : ''; });
        assert.match(pv, /^data:image\/(webp|jpeg)/, '미리보기에 줄인 그림');
        assert.equal(imgsOf().length, 1, '올리면 바로 내 계정 그림 문서');
        // SVG 파일은 받지 않음
        await T.setInputFiles('#slideForm input[data-img="img"]', { name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') });
        await T.waitForFunction(() => /PNG·JPEG·WebP 그림만/.test(document.querySelector('[data-imgmsg="img"]').textContent));
        // 다음 장(힘, 그림 없음)에 그림 더하고 빼기 → 저장하면 안 쓰는 그림은 지움
        await T.click('#slideList .le-pickslide[data-i="1"]');
        await T.setInputFiles('#slideForm input[data-img="img"]', { name: 'p.png', mimeType: 'image/png', buffer: buf });
        await T.waitForFunction(() => /그림을 바꿨어요/.test(document.querySelector('[data-imgmsg="img"]').textContent), null, { timeout: 20000 });
        assert.equal(imgsOf().length, 2);
        await T.click('#slideForm button[data-imgop="none"][data-for="img"]');
        await T.click('#btnSave');
        await T.waitForFunction(() => /저장했어요/.test(document.getElementById('saveMsg').textContent));
        assert.equal(imgsOf().length, 1, '빼 버린 그림은 저장 때 지움');
        const doc = app.db.docs.get('lessonEdits/teacher-1/exps/rocket');
        const ref = doc.stages.think[0].set.img;
        assert.match(ref, /^my-img:i[a-z0-9]{15}$/);
        assert.equal(app.db.docs.get('lessonEdits/teacher-1/imgs/' + ref.slice(7)).w, 1280);

        // 🎬 발표 보기: 첫 장 그림이 바꾼 그림
        const cls = await app.post({ action: 'createClass', ban: 3, mode: 'team', nTeams: 4, exp: 'rocket', stage: 1 });
        const P = await ctx({ viewport: { width: 1280, height: 900 } }, 'P');
        await P.goto(ROOT + 'projects/class-teacher.html#class=' + cls.space + '&view=present'); await P.reload();
        await P.waitForFunction(() => document.querySelector('#presentPane.ls-on #pSlides .ls-fig img'), null, { timeout: 15000 });
        assert.match(await P.getAttribute('#pSlides .ls-fig img', 'src'), /^data:image\/(webp|jpeg);base64,/);
        assert.equal(await P.locator('#pSlides .ls-fig svg').count(), 0);

        // 다시 열면 그림도 불러옴 → ↩ 원래 그림 단추
        await T.reload();
        await T.waitForFunction(() => document.querySelector('#slideForm .le-thumb img'), null, { timeout: 15000 });
        assert.equal(await T.isVisible('#slideForm button[data-imgop="undo"]'), true);
        await T.click('#btnReset');
        await T.waitForFunction(() => /기본 자료로 되돌렸어요/.test(document.getElementById('saveMsg').textContent));
        assert.equal(imgsOf().length, 0, '되돌리면 그림 문서도 지움');
        await P.reload();
        await P.waitForFunction(() => document.querySelector('#presentPane.ls-on #pSlides .ls-fig'), null, { timeout: 15000 });
        assert.equal(await P.locator('#pSlides .ls-fig svg').count(), 1, '되돌린 뒤 기본 그림');
        // 375px
        const M = await ctx({ viewport: { width: 375, height: 800 } }, 'M');
        await M.goto(ROOT + 'projects/lesson-editor.html#exp=rocket');
        await M.waitForSelector('#slideForm .le-imgfield');
        assert.equal(await M.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375 가로 스크롤');
        const lb = await M.locator('.le-file').first().boundingBox();
        assert.ok(lb.height >= 43.5, '그림 바꾸기 단추 44px');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
