// 필름통 로켓 5차 재확인 뒤 고침 (판정 docs/virtual-class/scenario/film-rocket5b-verdict.md, 선생님 '①③만 고치고 머지' + 하도 같은 PR)
//  중 1 지나간 점수 퀴즈는 차시를 넘어도 다음 응답 장 앞에 하나씩 · 중 2 '풀이를 본 뒤 골라서 5점이에요' 가 답 칸 화면에서도 보임
//  중 3 정리 문장 결과가 📏 우리 숫자와 반대면 '숫자를 다시 봐요'(막지 않음) · 프로젝터 정리 답 모음에 그 팀 숫자·⚠
//  하 1 측정을 마치면 띄운 🎯 도전 장으로 · 하 2 폰 도전 실패 ❌ · 하 3 두 칸 답 모음 보기 글 넓게 · 하 4 만들기 '다 만들면 지금 문제로 가요'
//  하 5 '값 안 바꿈' 은 측정 시간이 끝난 뒤에만 · 결과 카드 '알아낸 것' · 조사 · 발표 보기를 다시 열면 그 자리 · '다음 →' · 점토 0개 문구
//  하 6 마친 수업: 발표 보기가 수업 문서를 다시 쓰지 않음 · 폰 '수업이 끝났어요 · 결과 카드'
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
const M = require('../js/film-rocket-math.js');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';
const SHOTS = process.env.CLASS5B_SHOTS || '';

test('5b 계산: 조사·결과 방향', () => {
    assert.equal(M.josa('물의 온도', '을를'), '물의 온도를');
    assert.equal(M.josa('물의 양', '을를'), '물의 양을');
    assert.equal(M.josa('30 °C', '과와'), '30 °C과(와)', '한글이 아니면 그대로');
    assert.equal(M.josa('날개', '과와'), '날개와');
    const e = M.evidence('t1', { changed: 'temp', plan: [20, 10], trials: [{ value: 20, y: 14.4 }, { value: 20, y: 14.4 }, { value: 10, y: 16.5 }, { value: 10, y: 16.7 }] }, {});
    assert.equal(e.dir, 'up');
    assert.match(e.text, /^물의 온도를 20 °C → 10 °C 로 줄였더니 평균 14.4초 → 16.6초$/);
    assert.equal(M.evidence('t2', { changed: 'fins', plan: [3, 0], trials: [{ value: 3, pct: 90 }, { value: 0, pct: 70 }] }, {}).dir, 'down');
});

test('5b 폰(iPhone 13) · 교사 화면', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const ctx = async (opt, name, teacher) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 2 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : '' }));
        await c.route(/gstatic/, r => r.abort());
        await c.addInitScript(t => { if (t) localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); }, !!teacher);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const go = (pg, id, t) => pg.waitForSelector('#ev-app[data-screen="' + id + '"]', { timeout: t || 15000 }).catch(async () => { throw new Error(id + ' 기다림, 지금 ' + await pg.getAttribute('#ev-app', 'data-screen') + ' · ' + errors.join(' / ')); });
    const screen = P => P.getAttribute('#ev-app', 'data-screen');
    try {
        const c = await app.post({ action: 'createClass', ban: 6, mode: 'team', nTeams: 4, exp: 'rocket', stage: 4 });
        const url = ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space;
        const lesson = (stage, i, key, open, extra) => app.post({ action: 'classLesson', space: c.space, lesson: Object.assign({ on: true, stage, i, key, reveal: false, mode: 'phone' }, extra || {}), open: open || [] });
        const join = async name => { const P = await ctx(devices['iPhone 13'], name); await P.goto(url); await go(P, 'enter'); await P.fill('#ev-name', name); await P.click('#ev-start');
            await P.waitForFunction(() => !/^(enter)?$/.test(document.getElementById('ev-app').dataset.screen || '')); return P; };

        // ===== 중 1·2: 1차시 gas 퀴즈를 놓친 팀이 2차시 '쏘는 힘 + 무게' 장에서 =====
        await lesson('t1', 0, 'gas', ['gas']);
        await lesson('t2', 2, 'action', []);   // gas 는 풀이 열림, action 은 아직
        const F = await join('늦은가족');
        await go(F, 'q-gas');
        assert.match(await F.textContent('.ev-late'), /⏪ 지나간 문제예요 · 풀이를 본 뒤 골라서 5점이에요/);
        assert.equal(await F.isVisible('.ev-late'), true, '답 칸만 보이는 화면에서도 보임');
        await F.click('.ev-choice[data-k="ok"]');
        await go(F, 'q-action');   // 한 장에 하나 — 다음은 지금 장의 퀴즈
        assert.equal(await F.evaluate(() => window.__filmRocket.state().quiz.gas.late), true);
        await F.click('.ev-choice[data-k="ok"]'); await go(F, 'q-mass'); await F.click('.ev-choice[data-k="ok"]'); await go(F, 'sent');
        // 2차시 계획 장: 놓친 1차시 변인 통제 퀴즈(아직 풀이 안 열림 · 차시가 지남)를 먼저 하나
        await lesson('t2', 4, 'plan-t2', []);
        await go(F, 'q-control');
        assert.match(await F.textContent('.ev-late'), /⏪ 지나간 문제예요 · 지금 골라요/);
        await F.click('.ev-choice[data-k="ok"]');
        await go(F, 't2-var');
        // 하 5: 계획 단추 '다음 →'
        assert.match(await F.textContent('#ev-plan-send'), /다 정했어요 · 다음 →/);

        // ===== 하 4: 만들기를 시작한 팀은 다음 장에서도 만들기 + 한 줄 =====
        await F.evaluate(() => { const s = window.__filmRocket.state(); s.build = { steps: { body: true }, done: false }; window.__filmRocket.show('t2-build'); });
        await go(F, 't2-build');
        assert.match(await F.textContent('.ev-late'), /🛠 다 만들면 지금 문제로 가요/);
        await F.evaluate(() => { const s = window.__filmRocket.state(); s.build.done = true; });

        // ===== 하 1: 눈으로 고르기(측정 중)를 마치면 그동안 띄운 🎯 도전 장으로 =====
        await F.evaluate(() => { const s = window.__filmRocket.state(); Object.assign(s.t2, { changed: 'mass', plan: [0, 2], value: 2, guess: { dir: 'down', why: '' }, trials: [{ value: 0, pct: 90 }, { value: 0, pct: 95 }, { value: 2, pct: 60 }] }); s.t2.safe = { goggle: 1, face: 1, away: 1, wait: 1 }; s.sentKeys = Object.assign(s.sentKeys || {}, { 'plan-t2': true }); });
        await lesson('t2', 5, 'do-t2', []);
        await F.waitForFunction(() => /^t2-(cond|film|result|graph|again)/.test(document.getElementById('ev-app').dataset.screen), null, { timeout: 10000 }).catch(async e => { throw new Error('측정 장: ' + await screen(F) + ' ' + JSON.stringify(await F.evaluate(() => window.__filmRocket.share().lessonNow()))); });
        await F.evaluate(() => window.__filmRocket.show('t2-hand'));
        await go(F, 't2-hand');
        await lesson('t2', 6, 'ch-t2', []);
        await F.waitForTimeout(4500);
        assert.equal(await screen(F), 't2-hand', '측정 중에는 그대로');
        await F.click('.ev-choice[data-k="low"]');
        await F.waitForFunction(() => /^t2-(challenge|ch-)/.test(document.getElementById('ev-app').dataset.screen), null, { timeout: 8000 });
        // 하 2: 폰 도전 실패 ❌
        await F.evaluate(() => { const s = window.__filmRocket.state(); s.t2.ch = false; s.t2.challenge = [{ value: 2, pct: 60, diff: -40, ok: false, method: 'hand', hand: 'low' }]; window.__filmRocket.show('t2-ch-result'); });
        await F.waitForFunction(() => /^t2-ch-result$|^t2-challenge$/.test(document.getElementById('ev-app').dataset.screen));
        if (await screen(F) === 't2-ch-result') assert.match(await F.textContent('.ev-screen h2'), /^❌ 목표와/);
        // 점토 0개 문구 (하 5)
        assert.doesNotMatch(await F.content(), /몸체 무게는 이미 0개/);

        // ===== 중 3: 정리 문장 결과가 숫자와 반대 =====
        const E = await join('하늘가족');
        await E.evaluate(() => { const s = window.__filmRocket.state(); Object.assign(s.t1, { changed: 'temp', plan: [20, 10], value: 10, trials: [{ value: 20, y: 14.4 }, { value: 20, y: 14.4 }, { value: 10, y: 16.5 }, { value: 10, y: 16.7 }] }); });
        await lesson('end', 1, 'end-cause', []);
        await go(E, 'q-gas');   // 늦게 들어온 팀: 지나간 퀴즈 하나 먼저 (한 장에 하나)
        await E.click('.ev-choice[data-k="ok"]');
        await go(E, 'end-sentence');
        const box = E.locator('[data-concl="t1"]');
        assert.match(await box.textContent(), /물의 온도를 20 °C → 10 °C 로 줄였더니/, '조사');
        await box.locator('[data-dir="down"]').click();
        assert.equal(await box.locator('.ev-numcheck').isVisible(), true);
        assert.match(await box.locator('.ev-numcheck').textContent(), /숫자를 다시 봐요[\s\S]*길어짐/);
        await box.locator('[data-dir="up"]').click();
        assert.equal(await box.locator('.ev-numcheck').isVisible(), false);
        await box.locator('[data-dir="down"]').click();   // 그래도 고를 수 있음 (막지 않음)
        await E.click('#ev-concl-send'); await go(E, 'sent');
        // 결과 카드 '알아낸 것' (하 5)
        assert.match(await E.evaluate(() => window.__filmRocket.foundLine('t1')), /^물의 온도 20 °C→10 °C → 짧아짐 \(14\.4초→16\.6초\)$/);
        assert.equal(await E.evaluate(() => window.__filmRocket.foundLine('t2')), '바꾼 것 없음');
        await E.evaluate(() => { const s = window.__filmRocket.state(); Object.assign(s.t2, { changed: 'fins', plan: [3, 0], trials: [{ value: 3, pct: 90 }] }); });
        assert.equal(await E.evaluate(() => window.__filmRocket.foundLine('t2')), '날개 수 3장→0장 · 아직 말할 수 없음');
        await E.evaluate(() => window.__filmRocket.sendNow());

        // ===== 교사: 정리 답 모음에 숫자·⚠ (중 3), 두 칸 답 모음 (하 3) =====
        const T = await ctx({ viewport: { width: 3840, height: 2160 } }, 'T', true);
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
        await T.waitForSelector('#pSlides .ls-title');
        await T.waitForFunction(() => /하늘가족[\s\S]*⚠ 짧아짐 \(📏 14\.4초→16\.6초\)/.test((document.querySelector('#pSlides .ls-answers') || {}).textContent || ''), null, { timeout: 25000 });
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'end-cause-3840.png') });
        // 발표용 옆 학생 화면은 팀이 아니라 지나간 퀴즈를 띄우지 않음
        const fr = T.frameLocator('iframe').first();
        await T.waitForTimeout(1500);
        assert.equal(await fr.locator('.ev-late').count(), 0, '옆 화면에 지나간 퀴즈 없음: ' + await fr.locator('#ev-app').getAttribute('data-screen') + ' ' + await fr.locator('.ev-late').first().textContent().catch(() => ''));
        const cols = await T.evaluate(() => {
            const A = window.ClassTeacherAnswers, M = window.FilmRocketMath, teams = [1, 2, 3, 4, 5, 6].map(j => ({ jo: j, name: '팀 ' + j })), data = {};
            teams.forEach(t => { data[t.jo] = { quiz: { action: { picks: ['ok'] }, mass: { picks: ['ok'] } } }; });
            const tl = A.tally('rocket', 'action', teams, data, M), box = document.createElement('div');
            box.className = 'ls-answers'; box.innerHTML = A.render(tl, true); document.querySelector('#pSlides .ls-text').appendChild(box);
            const g = box.querySelector('.ls-ans-cols'), t = [...box.querySelectorAll('.ls-bar-t')];
            const r = { n2: g.classList.contains('n2'), minRatio: Math.min(...t.map(e => e.getBoundingClientRect().width / (e.closest('.ls-bar').getBoundingClientRect().width))), tall: Math.max(...t.map(e => e.getBoundingClientRect().height / (parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.2))) };
            box.remove(); return r;
        });
        assert.equal(cols.n2, true);
        assert.ok(cols.minRatio > 0.95, '보기 글이 막대 칸 전체 폭: ' + cols.minRatio);
        assert.ok(cols.tall <= 2.1, '세로로 길게 줄바꿈 안 함 (보기 글 ' + cols.tall.toFixed(1) + '줄)');

        // ===== 하 5: 발표 보기를 닫았다 다시 열면 그 자리 (정리 첫 장으로 되돌아가지 않음) =====
        await T.setViewportSize({ width: 1920, height: 1080 });
        await lesson('end', 2, 'card', []);
        await T.reload(); await T.waitForSelector('#pSlides .ls-title');
        assert.match(await T.textContent('#pSlides .ls-title'), /오늘의 결과 카드/, '띄운 장에서 이어서');
        // 설명을 닫음 (선생님이 '📱 학생 화면' 으로 바꾼 것과 같음)
        await app.post({ action: 'classLesson', space: c.space, lesson: { on: false, stage: 'end', i: 2, key: '', reveal: false, mode: 'look' }, open: [] });
        let doc = await app.post({ action: 'classInfo', space: c.space });
        assert.deepEqual([doc.lesson.on, doc.lesson.stage, doc.lesson.i], [false, 'end', 2], '닫아도 단계·장 번호는 남음');
        await T.reload(); await T.waitForSelector('#pSlides .ls-title');
        assert.match(await T.textContent('#pSlides .ls-title'), /오늘의 결과 카드/, '발표 보기를 닫았다 다시 열면 그 장에서 (정리 첫 장 아님)');
        for (let k = 0; k < 30 && !(await app.post({ action: 'classInfo', space: c.space })).lesson.on; k++) await T.waitForTimeout(100);
        doc = await app.post({ action: 'classInfo', space: c.space });
        assert.deepEqual([doc.lesson.on, doc.lesson.key], [true, 'card']);
        await T.keyboard.press('Escape').catch(() => {});

        // ===== 하 6: 마친 수업 =====
        await E.evaluate(() => window.__filmRocket.show('end-card')); await go(E, 'end-card');
        await lesson('end', 0, 'end-think', [], { reveal: true });
        await app.post({ action: 'classDone', space: c.space, done: true });
        await E.reload();
        await go(E, 'end-card');
        await E.waitForTimeout(3000);
        assert.equal(await screen(E), 'end-card', '장을 띄운 채 마쳐도 결과 카드 그대로');
        assert.match(await E.textContent('.ev-done-band'), /수업이 끝났어요 · 결과 카드/);
        // 교사가 마친 수업의 발표 보기를 다시 열어 넘겨도 수업 문서는 그대로
        const before = JSON.stringify((await app.post({ action: 'classInfo', space: c.space })).lesson);
        await T.reload(); await T.waitForSelector('#presentPane:not([hidden])'); await T.waitForTimeout(800);
        for (let k = 0; k < 3; k++) { await T.keyboard.press('ArrowRight'); await T.waitForTimeout(300); }
        await T.waitForTimeout(1500);
        assert.equal(JSON.stringify((await app.post({ action: 'classInfo', space: c.space })).lesson), before, '마친 수업은 다시 쓰지 않음');
        assert.equal(await screen(E), 'end-card');
        assert.equal(await E.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px');
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); api.close(); stat.close();
    }
});

test('5b 하 5: 챙길 팀 \'🔧 값 안 바꿈\' 은 측정 시간이 끝난 뒤에만', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch();
    try {
        const c = await app.post({ action: 'createClass', ban: 6, mode: 'team', nTeams: 3, exp: 'rocket', stage: 2 });
        const names = ['별빛가족', '달님가족', '번개팀'];
        for (const [i, n] of names.entries()) {
            const r = await app.post({ action: 'teamJoin', 'class': c.classCode, name: n, device: 'fam' + i }, { uid: 'fam' + i });
            await app.post({ action: 'heartbeat', class: c.classCode, space: c.space, jo: r.jo, num: 1, step: 't1', points: 2, device: 'fam' + i }, { uid: 'fam' + i });
            // 별빛 = 한 가지 값만, 달님 = 두 가지, 번개 = 아직 0
            if (i < 2) await app.post({ action: 'save', exp: 'rocket', group: c.groups[r.jo - 1].code, class: c.classCode, space: c.space, id: 'fam' + i + '-team', title: n, n: 2,
                summary: { '팀 점수': 0, '값 가짓수': (i === 0 ? 1 : 2) + '·0' }, data: '{}', device: 'fam' + i }, { uid: 'fam' + i });
        }
        await app.post({ action: 'classLesson', space: c.space, lesson: { on: true, stage: 't1', i: 3, key: 'do-t1', reveal: false, mode: 'phone' }, open: [] });
        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        await ctx.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 2 }) }));
        await ctx.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : '' }));
        await ctx.route(/gstatic/, r => r.abort());
        await ctx.addInitScript(() => localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })));
        const T = await ctx.newPage();
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
        await T.waitForSelector('#pSlides .ls-title');
        const care = async () => { await T.click('#btnPExit'); await T.waitForSelector('#runPop:not([hidden]) #rpSum:not([hidden])');
            await T.waitForFunction(() => /들어옴/.test(document.getElementById('rpSum').textContent), null, { timeout: 15000 });
            const t = await T.textContent('#rpCare'); await T.keyboard.press('Escape'); return t; };
        assert.doesNotMatch(await care(), /값 안 바꿈/, '측정 장 동안에는 없음');
        // 🎯 도전 장을 띄우면 한 가지 값만 잰 팀만
        await app.post({ action: 'classLesson', space: c.space, lesson: { on: true, stage: 't1', i: 5, key: 'ch-t1', reveal: false, mode: 'phone' }, open: [] });
        await T.reload(); await T.waitForSelector('#pSlides .ls-title');
        const t2 = await care();
        assert.match(t2, /별빛가족[^가-힣]*[\s\S]*값 안 바꿈/);
        assert.doesNotMatch(t2, /달님가족[^⚠]*값 안 바꿈|번개팀[^⚠]*값 안 바꿈/);
    } finally {
        await browser.close(); api.close(); stat.close();
    }
});
