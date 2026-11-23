// 📖 수업 자료 편집 화면 (projects/lesson-editor.html): 교사 로그인 → 실험 고르기 → 글 고치기·숨기기·새 장·순서 → 💾 저장(내 계정)
// → 🎬 발표 보기가 고친 자료로 그림 → ↩ 기본 자료로 되돌리기. 미리보기 1280×720·4K, 375px·1280·4K 가로 스크롤 없음·단추 44px, 넣은 글의 스크립트는 거름
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('수업 자료 편집 → 발표 보기에 반영 → 기본 자료로 되돌리기', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const ctx = async (opt, name, user) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : '' }));
        await c.route(/gstatic/, r => r.abort());
        if (user) await c.addInitScript(u => { localStorage.setItem('lab-store:fake-user', JSON.stringify(u)); }, user);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const layout = async (pg, n) => {
        assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
        const small = await pg.evaluate(() => [...document.querySelectorAll('button, select, input[type=text]')].filter(e => e.offsetParent && !e.closest('.le-tools, .subtabs') && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.getAttribute('aria-label') || e.textContent.trim().slice(0, 20)));
        assert.deepEqual(small, [], n + ' 작은 단추');
    };
    const titles = pg => pg.$$eval('#slideList .le-ttl', els => els.map(e => e.textContent));
    const prevTitle = pg => pg.frameLocator('#prevFrame').locator('.ls-title').textContent();
    try {
        // 로그인 전: 로그인 카드만
        const anon = await ctx({ viewport: { width: 1280, height: 900 } }, 'anon', null);
        await anon.goto(ROOT + 'projects/lesson-editor.html');
        await anon.waitForSelector('#btnLogin:not([hidden])');
        assert.equal(await anon.isVisible('#viewPick'), false);
        await anon.click('#btnLogin');   // 가짜 구글 로그인
        await anon.waitForSelector('#viewPick:not([hidden]) .le-pick');
        await anon.close();

        const T = await ctx({ viewport: { width: 1280, height: 900 } }, 'T', { uid: 'teacher-1', google: true, teacher: true });
        await T.goto(ROOT + 'projects/lesson-editor.html');
        await T.waitForSelector('#viewPick:not([hidden]) .le-pick[data-exp="rocket"]');
        const picks = await T.$$eval('.le-pick', els => els.map(e => e.dataset.exp));
        assert.ok(picks.includes('rocket') && picks.includes('qdot') && picks.includes('planck'), '단계 여는 실험: ' + picks);
        assert.ok(!picks.includes('env'), '한 화면 실험은 없음');
        await layout(T, '고르기 1280');

        await T.click('.le-pick[data-exp="rocket"]');
        await T.waitForSelector('#slideList .le-item');
        assert.match(T.url(), /#exp=rocket$/);
        assert.match(await T.textContent('#stageTabs'), /생각 열기[\s\S]*1차시[\s\S]*2차시[\s\S]*정리/);
        const base = await titles(T);
        assert.equal(base[1], '‘힘’은 무엇일까요?');
        assert.equal(await prevTitle(T), base[0], '미리보기 = 고른 장');

        // ① 글 고치기: 둘째 장(힘) 제목·본문
        await T.click('#slideList .le-pickslide[data-i="1"]');
        await T.fill('#slideForm input[data-f="title"]', '힘이란 무엇일까? (고침)');
        await T.evaluate(() => { const ed = document.querySelector('#slideForm .le-rich[data-f="body"]'); ed.innerHTML = '<p>공을 <b>세게</b> 차 봐요</p><img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'; ed.dispatchEvent(new Event('input', { bubbles: true })); });
        await T.waitForFunction(() => /고침/.test(document.querySelector('#prevFrame').contentDocument.querySelector('.ls-title').textContent));
        assert.match(await T.textContent('#dirtyMsg'), /저장하지 않은/);
        assert.match(await T.textContent('#slideList .le-item.on'), /✏️ 고침/);
        // 미리보기: 풀이까지 보기, 4K
        await T.check('#prevReveal');
        await T.waitForFunction(() => document.querySelector('#prevFrame').contentDocument.querySelector('.ls-reveal'));
        await T.click('.le-seg [data-size="4k"]');
        await T.waitForFunction(() => document.getElementById('prevFrame').style.width === '3840px');
        const pv = await T.evaluate(() => { const d = document.getElementById('prevFrame').contentDocument, s = d.querySelector('.ls-slide'); return { over: s.scrollHeight - s.clientHeight, img: d.querySelectorAll('img').length, box: document.getElementById('prevBox').getBoundingClientRect().width }; });
        assert.ok(pv.over <= 1, '4K 미리보기 한 화면: ' + pv.over);
        assert.equal(pv.img, 0, '넣은 그림·스크립트는 거름');
        assert.equal(await T.evaluate(() => document.getElementById('prevFrame').contentWindow.__xss), undefined, '미리보기에서 스크립트가 돌지 않음');

        // ② 숨기기: 셋째 장(가속도)
        await T.click('#slideList button[data-op="hide"][data-i="2"]');
        assert.match(await T.textContent('#slideList .le-item:nth-child(3)'), /숨김/);
        // ③ 새 장 더하기 (지금 고른 장 다음) → 맨 위로
        await T.click('#slideList .le-pickslide[data-i="0"]');
        await T.click('#btnAdd');
        await T.fill('#slideForm input[data-f="title"]', '오늘 순서 (새 장)');
        await T.selectOption('#slideForm select[data-f="kind"]', 'how');
        await T.evaluate(() => { const ed = document.querySelector('#slideForm .le-rich[data-f="body"]'); ed.innerHTML = '<div>1차시 → 2차시</div>'; ed.dispatchEvent(new Event('input', { bubbles: true })); });
        await T.click('#slideList button[data-op="up"][data-i="1"]');
        assert.deepEqual((await titles(T)).slice(0, 4), ['오늘 순서 (새 장)', base[0], '힘이란 무엇일까? (고침)', base[2]]);
        assert.match(await T.textContent('#stageTabs'), /생각 열기 5장/, '숨긴 장은 세지 않음');
        await layout(T, '고치기 1280');

        // 💾 저장 → 내 계정 (lessonEdits/teacher-1/exps/rocket)
        await T.click('#btnSave');
        await T.waitForFunction(() => /저장했어요/.test(document.getElementById('saveMsg').textContent));
        assert.equal(await T.textContent('#dirtyMsg'), '');
        const doc = app.db.docs.get('lessonEdits/teacher-1/exps/rocket');
        assert.ok(doc, '저장됨');
        assert.equal(doc.stages.think[0].kind, 'how');
        assert.match(doc.stages.think[0].add, /^my-/, '새 장은 새 key');
        assert.equal(doc.stages.think[0].body, '<p>1차시 → 2차시</p>');
        assert.deepEqual(doc.stages.think[2], { ref: 'k:force', of: '‘힘’은 무엇일까요?', set: { title: '힘이란 무엇일까? (고침)', body: '<p>공을 <b>세게</b> 차 봐요</p>' } });
        assert.equal(doc.stages.think[3].hide, true);

        // 다시 열어도(다른 컴퓨터라고 보고) 고친 자료 그대로, 고르기 카드에 ✏️
        await T.reload();
        await T.waitForSelector('#slideList .le-item');
        assert.deepEqual((await titles(T)).slice(0, 3), ['오늘 순서 (새 장)', base[0], '힘이란 무엇일까? (고침)']);
        await T.click('#btnBack');
        await T.waitForFunction(() => /내가 고친 자료 있음/.test(document.querySelector('.le-pick[data-exp="rocket"]').textContent));

        // 🎬 발표 보기: 내 수업(로켓)이 고친 자료로 그림 (새 장이 맨 앞, 숨긴 장 없음, 기본 key 그대로)
        const cls = await app.post({ action: 'createClass', ban: 3, mode: 'team', nTeams: 4, exp: 'rocket', stage: 1 });
        const P = await ctx({ viewport: { width: 1280, height: 900 } }, 'P', { uid: 'teacher-1', google: true, teacher: true });
        await P.goto(ROOT + 'projects/class-teacher.html#class=' + cls.space + '&view=present'); await P.reload();
        await P.waitForFunction(() => document.querySelector('#presentPane.ls-on .ls-title'), null, { timeout: 15000 });
        // 나란히 보기(#176, 기본): 왼쪽 설명 장 = 고친 자료(새 장), 오른쪽 학생 화면도 보임
        const side = await P.evaluate(() => { const pane = document.getElementById('presentPane'), s = document.querySelector('#pSlides .ls-slide'), fr = document.getElementById('presentFrame');
            const a = s.getBoundingClientRect(), b = fr.getBoundingClientRect();
            return { side: pane.classList.contains('lay-side'), title: s.querySelector('.ls-title').textContent, frame: getComputedStyle(fr).display !== 'none' && b.width > 100, left: a.right <= b.left + 2 }; });
        assert.deepEqual(side, { side: true, title: '오늘 순서 (새 장)', frame: true, left: true }, '나란히 보기 왼쪽에 고친 자료');
        const seen = [];
        for (let i = 0; i < 9; i++) {
            const s = await P.evaluate(() => { const el = document.querySelector('#presentPane.ls-on #pSlides .ls-slide'); return el ? el.querySelector('.ls-title').textContent + (el.dataset.revealed === '0' ? '?' : '') : null; });
            if (!s) break;
            if (!seen.includes(s)) seen.push(s);
            await P.keyboard.press('ArrowRight');
        }
        assert.equal(seen[0], '오늘 순서 (새 장)', '발표 보기 첫 장 = 새 장: ' + seen);
        assert.ok(seen.includes('힘이란 무엇일까? (고침)?'), '고친 장(물음 먼저): ' + seen);
        assert.ok(!seen.some(s => /가속도/.test(s)), '숨긴 장 없음: ' + seen);
        assert.ok(app.calls.some(c => c.body.action === 'classLesson' && c.body.lesson && c.body.lesson.key === 'force'), '고친 장도 기본 key(force)로 학생 화면에 알림');
        // 다른 선생님 계정의 발표 보기는 기본 자료 (내 고친 자료는 내 계정에만)
        const cls2 = await app.post({ action: 'createClass', ban: 4, mode: 'team', nTeams: 4, exp: 'rocket', stage: 1 }, { uid: 'teacher-2', google: true });
        const Q = await ctx({ viewport: { width: 1280, height: 900 } }, 'Q', { uid: 'teacher-2', google: true });
        await Q.goto(ROOT + 'projects/class-teacher.html#class=' + cls2.space + '&view=present'); await Q.reload();
        await Q.waitForFunction(() => document.querySelector('#presentPane.ls-on .ls-title'), null, { timeout: 15000 });
        assert.equal(await Q.textContent('#pSlides .ls-title'), base[0], '다른 선생님은 기본 자료');
        await Q.close();

        // ↩ 기본 자료로 되돌리기 → 발표 보기도 기본
        await T.click('.le-pick[data-exp="rocket"]');
        await T.waitForSelector('#slideList .le-item');
        await T.click('#btnReset');
        await T.waitForFunction(() => /기본 자료로 되돌렸어요/.test(document.getElementById('saveMsg').textContent));
        assert.deepEqual(await titles(T), base);
        assert.equal(app.db.docs.has('lessonEdits/teacher-1/exps/rocket'), false);
        await P.reload();
        await P.waitForFunction(() => document.querySelector('#presentPane.ls-on .ls-title'), null, { timeout: 15000 });
        assert.equal(await P.textContent('#pSlides .ls-title'), base[0], '되돌린 뒤 발표 보기는 기본 자료');
        await P.close();

        // 설명 장이 없는 단계에 새 장 (양자점 3 준비물 등) — 장이 없어도 더할 수 있음
        await T.click('#btnBack');
        await T.click('.le-pick[data-exp="planck"]');
        await T.waitForSelector('#slideList .le-empty');
        await T.click('#btnAdd');
        assert.equal((await titles(T)).length, 1);
        await T.close();

        // 375px 폰·4K 프로젝터 화면 (편집은 노트북이 기본이지만 깨지지 않게)
        for (const [vp, n] of [[{ width: 375, height: 800 }, '375'], [{ width: 3840, height: 2160 }, '4K']]) {
            const pg = await ctx({ viewport: vp }, n, { uid: 'teacher-1', google: true, teacher: true });
            await pg.goto(ROOT + 'projects/lesson-editor.html#exp=qdot');
            await pg.waitForSelector('#slideList .le-item');
            await layout(pg, n);
            await pg.close();
        }
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
