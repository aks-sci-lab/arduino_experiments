// 📱 수업 폰의 원본 동의 (2026-11-20 선생님 결정 "동의 먼저 받기"): 가짜 저장소, 측정은 시뮬레이션 프레임을 회차로 넣어 짧게
//  ① 동의 없이 보내기 → 수업 공간에 원본 없음(교사 classStatus·내려받기 X), 짝 공간으로 가 노트북은 받아 분석
//  ② 동의 뒤 보내기 → 수업 공간에 '원본(동의함)' 줄, 교사에게 보임  ③ 동의 끄기 → 이미 보낸 원본도 수업 공간에서 빠짐
//  ④ 수업 없이 연 폰 짝은 동의 칸 없음·그대로  ⑤ 화면 글, iPhone 13 375px·44px
const path = require('path'), fs = require('fs'), http = require('http');
const REPO = path.join(__dirname, '..');
const { loadLabStore, labServer, configJs } = require(REPO + '/tests/fake-lab-store.cjs');
let chromium = null, devices = null;
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const test = require('node:test');
const assert = require('node:assert/strict');

const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg></svg>"}}};';
const stat = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), p = path.join(REPO, decodeURIComponent(u.pathname));
    fs.readFile(p, (e, d) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d);
    });
});

test('📱 수업 폰 원본 동의: 안 하면 짝 노트북만 · 하면 선생님께도 · 끄면 뺌', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    async function ctx(opt, name) {
        const c = await browser.newContext(opt);
        c.setDefaultTimeout(15000);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 2 }) }));
        await c.route(/gstatic|jsdelivr/, r => r.abort());
        await c.route(/qrcode-generator/, r => r.fulfill({ contentType: 'text/javascript', body: QR }));
        const pg = await c.newPage(); pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept()); return pg;
    }
    const check = async (pg, n) => {
        const ov = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        const small = await pg.evaluate(() => [...document.querySelectorAll('button, select, .cs-btn, label.btn, label.chk')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5 && !e.closest('table')).map(e => e.id || e.textContent.trim().slice(0, 20)));
        console.log(n, 'overflow', ov, 'small', small);
        assert.equal(ov, 0, n + ' 가로 스크롤'); assert.deepEqual(small, [], n + ' 44px');
    };
    // 폰 회차 하나 넣기 (카메라 측정 대신 시뮬레이션 프레임 — 실제 카메라 길은 tests/heart-rate-phone-ui.test.cjs)
    const addRun = (pg, seed) => pg.evaluate(s => window.__hrCore.addRun({ frames: HeartRateMath.simulate({ bpm: 72, dur: 15, seed: s }), lock: 'locked' }).id, seed);
    const classRows = space => app.items('heartrate').filter(d => d._space === space && Number(d.n) > 0);
    try {
        const c = await app.post({ action: 'createClass', ban: 3, nStudents: 4, groupSize: 2, exp: 'heartrate' });
        assert.ok(c.ok, JSON.stringify(c));
        // ---- 노트북: 수업 참여 → 폰 카드 QR (짝 공간 pp= 가 들어감) ----
        const L = await ctx({ viewport: { width: 1280, height: 800 } }, 'L');
        await L.goto(ROOT + 'projects/heart-rate.html?c=' + c.classCode);
        await L.waitForFunction(() => !document.getElementById('cs-cpick').hidden);
        await L.selectOption('#cs-cjo', '1'); await L.selectOption('#cs-cnum', '1'); await L.click('#cs-cjoin');
        await L.waitForFunction(() => !document.getElementById('cs-cjoined').hidden);
        await L.waitForFunction(() => { const a = document.querySelector('#phone-card a'); return a && /role=phone/.test(a.href); });
        const link = await L.getAttribute('#phone-card a', 'href');
        console.log('QR:', link);
        const pp = (/[?&]pp=(p[a-z0-9]{23})/.exec(link) || [])[1], space = (/[?&]s=(c[a-z0-9]{23})/.exec(link) || [])[1];
        assert.ok(pp, '짝 공간'); assert.ok(space, '수업 공간'); assert.match(link, /&c=3-\d{4}&jo=1&num=1/);
        // 노트북 글: '같은 조 기기만' 같은 틀린 말 없음
        const ltxt = await L.textContent('main');
        assert.ok(!/같은 조 기기만/.test(ltxt), '노트북 글');
        assert.match(await L.textContent('#phone-card-box'), /선생님 화면에도/);

        // ---- 폰 (iPhone 13): 동의 칸이 보이고 기본은 꺼짐 ----
        const P = await ctx(devices['iPhone 13'], 'P');
        await P.goto(link);
        await P.waitForFunction(() => !document.getElementById('cs-cjoined').hidden, null, { timeout: 10000 });
        assert.equal(await P.isVisible('#raw-consent-box'), true);
        assert.equal(await P.isChecked('#raw-consent'), false);
        assert.match(await P.textContent('#raw-consent-box'), /선생님께도.*이름·학번은 보내지 않아요/s);
        assert.match(await P.textContent('#raw-consent-st'), /이 폰과 QR 을 찍은 노트북만/);
        // ① 동의 없이 보내기
        const id1 = await addRun(P, 3);
        await P.waitForFunction(() => document.querySelectorAll('.cs-run').length === 1);
        await P.click('#cs-rsend');
        await P.waitForFunction(() => /보냈|못했/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 15000 });
        console.log('① 폰:', (await P.textContent('#cs-pmsg')).replace(/\s+/g, ' '));
        assert.match(await P.textContent('#cs-pmsg'), /선생님께는 가지 않고/);
        assert.equal(classRows(space).length, 0, '수업 공간에 원본 없음');
        assert.equal(classRows(pp).length, 1, '짝 공간에 원본');
        let s1 = await app.post({ action: 'classStatus', class: c.classCode, key: c.key });
        assert.equal(s1.submissions.reduce((n, g) => n + g.rows, 0), 0, '교사 조 카드에 없음');
        // 노트북은 받아 분석 (한 번 재기 회차로)
        await L.waitForFunction(() => window.__hrCore.runs().some(r => /^p/.test(r.srcKey)), null, { timeout: 20000 });
        const got = await L.evaluate(() => window.__hrCore.runs().filter(r => r.srcKey).map(r => ({ k: r.srcKey, bpm: r.res.bpm })));
        console.log('① 노트북 받음:', JSON.stringify(got));
        assert.equal(got.length, 1); assert.ok(Math.abs(got[0].bpm - 72) <= 4, '심박 ' + got[0].bpm);

        // ② 동의 → 새 회차 보내기 → 수업 공간에 '원본(동의함)'
        await P.check('#raw-consent');
        assert.match(await P.textContent('#raw-consent-st'), /선생님 화면에도/);
        const id2 = await addRun(P, 5);
        await P.waitForFunction(() => document.querySelectorAll('.cs-run').length === 2);
        await P.locator(`.cs-run input[type=checkbox][data-id="${id1}"]`).uncheck();
        await P.click('#cs-rsend');
        await P.waitForFunction(() => /선생님께도 갔어요|못했/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 15000 });
        const rows = classRows(space);
        console.log('② 수업 공간:', rows.map(r => r.title + ' ' + JSON.stringify(r.summary)));
        assert.equal(rows.length, 1); assert.ok(rows[0].id.endsWith(id2)); assert.equal(rows[0].summary['원본(동의함)'], 1);
        const s2 = await app.post({ action: 'classStatus', class: c.classCode, key: c.key });
        const g1 = s2.submissions.find(g => g.jo === 1);
        console.log('② 교사 조 카드:', JSON.stringify(g1.labels), JSON.stringify(g1.summary));
        assert.equal(g1.rows, 1);
        // 노트북은 두 회차 다
        await L.waitForFunction(() => window.__hrCore.runs().filter(r => r.srcKey).length === 2, null, { timeout: 20000 });

        // ③ 동의 끄기 → 이미 보낸 원본을 수업 공간에서 뺌
        await P.uncheck('#raw-consent');
        await P.waitForFunction(() => /뺐어요|빼지 못했/.test(document.getElementById('raw-consent-st').textContent), null, { timeout: 15000 });
        assert.match(await P.textContent('#raw-consent-st'), /뺐어요/);
        assert.equal(classRows(space).length, 0, '끄면 수업 공간에서 빠짐');
        const s3 = await app.post({ action: 'classStatus', class: c.classCode, key: c.key });
        assert.equal(s3.submissions.reduce((n, g) => n + g.rows, 0), 0);
        await check(P, 'iPhone 13 수업 폰');

        // ④ 수업 없이 연 폰 짝: 동의 칸 없음, 짝 공간으로 그대로
        const L0 = await ctx({ viewport: { width: 1280, height: 800 } }, 'L0');
        await L0.goto(ROOT + 'projects/heart-rate.html');
        await L0.waitForFunction(() => { const a = document.querySelector('#phone-card a'); return a && /role=phone/.test(a.href); });
        const link0 = await L0.getAttribute('#phone-card a', 'href');
        assert.ok(!/[?&]c=/.test(link0) && !/pp=/.test(link0), link0);
        const P0 = await ctx(devices['iPhone 13'], 'P0');
        await P0.goto(link0);
        assert.equal(await P0.isVisible('#raw-consent-box'), false);
        await addRun(P0, 7);
        await P0.waitForFunction(() => document.querySelectorAll('.cs-run').length === 1);
        await P0.click('#cs-rsend');
        await P0.waitForFunction(() => /보냈|못했/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 15000 });
        assert.match(await P0.textContent('#cs-pmsg'), /노트북으로 보냈어요/);
        await L0.waitForFunction(() => window.__hrCore.runs().some(r => /^p/.test(r.srcKey)), null, { timeout: 20000 });
        console.log('④ 수업 없는 짝 ✓');
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); api.close(); stat.close();
    }
});
