// 📱 응답 물음 (③) 화면: 편집 화면에서 응답 장 만들기 → 🎬 발표 보기로 띄움 → 학생 폰·노트북에 답 칸 → 프로젝터에 수·글이 모임(조 번호는 선생님용 접기)
// → 풀이를 연 뒤에만 정답 ✅ → 물음을 넘기면 답 칸이 사라짐. 받은 글은 esc, 375px 가로 스크롤 없음·단추 44px
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('응답 물음 만들기 → 띄우기 → 학생 답 → 프로젝터 모음 → 풀이 뒤 정답', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
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
    const TEACHER = { uid: 'teacher-1', google: true, teacher: true };
    try {
        // 1) 편집 화면에서 응답 장 둘 (고르기·정답 B / 짧은 글) — 1 목적 맨 앞
        const E = await ctx({ viewport: { width: 1280, height: 900 } }, 'E', TEACHER);
        await E.goto(ROOT + 'projects/lesson-editor.html#exp=qdot');
        await E.waitForSelector('#slideList .le-item');
        const addResp = async (title, ask, type, choices, answer, reveal) => {
            await E.click('#btnAdd');
            await E.fill('#slideForm input[data-f="title"]', title);
            await E.selectOption('#slideForm select[data-r="type"]', type);
            await E.evaluate(([a, r]) => { const set = (f, v) => { const ed = document.querySelector('#slideForm .le-rich[data-f="' + f + '"]'); ed.innerHTML = v; ed.dispatchEvent(new Event('input', { bubbles: true })); }; set('ask', a); if (r) set('reveal', r); }, [ask, reveal || '']);
            if (choices) { await E.fill('#slideForm textarea[data-r="choices"]', choices.join('\n')); await E.selectOption('#slideForm select[data-r="answer"]', String(answer)); }
        };
        await addResp('예상해 봐요', '가열을 오래 하면 형광 색은?', 'pick', ['파래진다', '붉어진다', '그대로'], 1, '<p>시료가 커질수록 붉어져요</p>');
        await E.click('#slideList button[data-op="up"][data-i="1"]');   // 새 장은 고른 장 다음에 생김 → 맨 앞으로
        // 미리보기에 고를 답
        await E.waitForFunction(() => document.getElementById('prevFrame').contentDocument.querySelectorAll('.ls-choices li').length === 3);
        await addResp('한 줄로', '왜 그렇게 생각해요?', 'text');   // 고른 장(맨 앞) 다음
        const t1 = await E.$$eval('#slideList .le-ttl', els => els.map(e => e.textContent));
        assert.deepEqual(t1.slice(0, 2), ['예상해 봐요', '한 줄로'], t1.join(' / '));
        assert.match(await E.textContent('#slideList .le-item:first-child'), /📱 응답/);
        await E.click('#btnSave');
        await E.waitForFunction(() => /저장했어요/.test(document.getElementById('saveMsg').textContent));
        const saved = app.db.docs.get('lessonEdits/teacher-1/exps/qdot').stages.purpose.slice(0, 2);
        assert.deepEqual(saved[0].resp, { type: 'pick', choices: ['파래진다', '붉어진다', '그대로'], answer: 1 });
        assert.deepEqual(saved[1].resp, { type: 'text' });
        await E.close();

        // 2) 수업(양자점, 1단계) → 🎬 발표 보기 첫 장 = 응답 물음
        const cls = await app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 1 });
        const P = await ctx({ viewport: { width: 1600, height: 900 } }, 'P', TEACHER);
        await P.goto(ROOT + 'projects/class-teacher.html#class=' + cls.space + '&view=present'); await P.reload();
        await P.waitForFunction(() => document.querySelector('#presentPane.ls-on #pSlides .ls-choices'), null, { timeout: 15000 });
        assert.equal(await P.textContent('#pSlides .ls-title'), '예상해 봐요');
        await P.waitForFunction(() => /답한 기기 <b>0<\/b>/.test(document.querySelector('#pSlides .ls-rnote').innerHTML), null, { timeout: 10000 });
        const lqOf = () => app.calls.filter(c => c.body.action === 'classLesson' && c.body.lesson && c.body.lesson.q).pop();
        for (let k = 0; k < 50 && !lqOf(); k++) await P.waitForTimeout(100);
        const lq = lqOf();
        assert.deepEqual(lq.body.lesson.q, { type: 'pick', text: '가열을 오래 하면 형광 색은?', choices: ['파래진다', '붉어진다', '그대로'] }, '학생에게 가는 물음에 정답 없음');

        // 3) 학생: 폰(1조 1번)·노트북(2조 1번)
        const url = ROOT + 'projects/quantum-dot.html?c=' + cls.classCode + '&s=' + cls.space;
        const join = async (pg, jo, num) => {
            await pg.goto(url);
            await pg.waitForSelector('#cs-cpick:not([hidden])');
            await pg.selectOption('#cs-cjo', String(jo)); await pg.selectOption('#cs-cnum', String(num)); await pg.click('#cs-cjoin');
        };
        const S1 = await ctx(Object.assign({}, devices['iPhone 13']), 'S1');
        await join(S1, 1, 1);
        await S1.waitForSelector('.cs-resp:not([hidden]) .cs-resp-choices button', { timeout: 15000 });
        assert.match(await S1.textContent('.cs-resp-q'), /가열을 오래 하면 형광 색은\?/);
        assert.deepEqual(await S1.$$eval('.cs-resp-choices button', b => b.map(x => x.textContent)), ['A 파래진다', 'B 붉어진다', 'C 그대로']);
        assert.match(await S1.textContent('.cs-look-band'), /내 화면에서 해요/);
        await S1.click('.cs-resp-choices button[data-ch="1"]');
        await S1.waitForFunction(() => /보냈어요/.test(document.querySelector('.cs-resp').textContent));
        assert.equal(await S1.getAttribute('.cs-resp-choices button[data-ch="1"]', 'aria-pressed'), 'true');
        assert.equal(await S1.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '폰 가로 스크롤');
        const small = await S1.evaluate(() => [...document.querySelectorAll('.cs-resp button')].filter(b => b.getBoundingClientRect().height < 43.5).length);
        assert.equal(small, 0, '답 단추 44px');
        const S2 = await ctx({ viewport: { width: 1280, height: 800 } }, 'S2');
        await join(S2, 2, 1);
        await S2.waitForSelector('.cs-resp:not([hidden]) .cs-resp-choices button', { timeout: 15000 });
        await S2.click('.cs-resp-choices button[data-ch="0"]');
        await S2.waitForFunction(() => /보냈어요/.test(document.querySelector('.cs-resp').textContent));

        // 4) 프로젝터: 수만(막대), 조 번호는 선생님용 접기, 정답 표시는 아직 없음
        const counts = () => P.$$eval('#pSlides .ls-choices .ls-cnt', els => els.map(e => Number(e.textContent)));
        await P.waitForFunction(() => [...document.querySelectorAll('#pSlides .ls-choices .ls-cnt')].map(e => e.textContent).join() === '1,1,0', null, { timeout: 15000 });
        assert.equal(await P.locator('#pSlides .ls-choices li.ok').count(), 0, '풀이 전 정답 없음');
        assert.equal(await P.isVisible('#pSlides details.ls-who > div'), false, '조별 답은 접혀 있음');
        assert.match(await P.textContent('#pSlides details.ls-who'), /1조 1번: B.*2조 1번: A/);
        // 고쳐 고르기 (2초 뒤)
        await S2.waitForTimeout(2200);
        await S2.click('.cs-resp-choices button[data-ch="1"]');
        await P.waitForFunction(() => [...document.querySelectorAll('#pSlides .ls-choices .ls-cnt')].map(e => e.textContent).join() === '0,2,0', null, { timeout: 15000 });
        // 풀이 열기 → ✅ B
        await P.keyboard.press('ArrowRight');
        await P.waitForSelector('#pSlides .ls-reveal');
        await P.waitForSelector('#pSlides .ls-choices li.ok');
        assert.match(await P.textContent('#pSlides .ls-choices li.ok'), /붉어진다 ✅/);
        assert.deepEqual(await counts(), [0, 2, 0], '풀이를 연 뒤에도 수는 그대로');

        // 5) 다음 장 = 짧은 글 물음 → 학생 화면 답 칸이 바뀜, 받은 글은 esc
        await P.keyboard.press('ArrowRight');
        await P.waitForFunction(() => document.querySelector('#pSlides .ls-title').textContent === '한 줄로');
        await S1.waitForSelector('.cs-resp textarea', { timeout: 15000 });
        await S1.fill('.cs-resp textarea', '<img src=x onerror="window.__x=1">커져서');
        await S1.click('.cs-resp button[data-send]');
        await S1.waitForFunction(() => /보냈어요/.test(document.querySelector('.cs-resp').textContent));
        await P.waitForFunction(() => document.querySelector('#pSlides .ls-texts li'), null, { timeout: 15000 });
        assert.equal(await P.locator('#pSlides .ls-texts img').count(), 0);
        assert.match(await P.textContent('#pSlides .ls-texts li'), /<img src=x onerror="window.__x=1">커져서/);
        assert.equal(await P.evaluate(() => window.__x), undefined);
        // 노트북 학생은 아직 → 나중에 들어와도 같은 물음
        await S2.waitForSelector('.cs-resp textarea', { timeout: 15000 });

        // 6) 물음이 아닌 장으로 넘기면 답 칸이 사라짐
        await P.keyboard.press('ArrowRight');
        await P.waitForFunction(() => document.querySelector('#pSlides .ls-title').textContent !== '한 줄로');
        await S1.waitForFunction(() => { const r = document.querySelector('.cs-resp'); return !r || r.hidden; }, null, { timeout: 15000 });
        // 수업 없이 연 화면에는 답 칸 없음
        const solo = await ctx(Object.assign({}, devices['iPhone 13']), 'solo');
        await solo.goto(ROOT + 'projects/quantum-dot.html');
        await solo.waitForTimeout(800);
        assert.equal(await solo.locator('.cs-resp').count(), 0);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
