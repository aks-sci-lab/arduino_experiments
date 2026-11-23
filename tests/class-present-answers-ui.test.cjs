// 🎬 발표 보기 = 정보의 중심 (2026-11-23 선생님 "학생용 화면은 응답을 수집하기 위함이지 정보를 제공하기 위함이 아니야")
//  ① 응답 장(mode 'phone' + key): '📱 지금 폰으로 답해요' + 팀 답이 실시간으로 모임 (칸별 수·막대, 아직 못 낸 팀은 수만), 정답 ✅ 는 풀이 뒤
//  ② 교사 조작 띠는 발표 화면 맨 아래 얇게: 🏆 결과판 · 🧩 모아 보기 로 프로젝터에 띄울 것을 바꿈, ⏳·🔌 작은 숫자 (이름은 펼친 안에만)
//  계산(js/class-teacher-answers.js)은 Node 로, 화면은 Playwright(가짜 저장소, 노트북 1920 + iPhone 13 팀 폰 둘)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
const A = require('../js/class-teacher-answers.js');
const M = require('../js/film-rocket-math.js');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const SHOTS = process.env.PRESENT_SHOTS || '';

test('응답 장 팀 답 모으기: 처음 생각·퀴즈 첫 답·다시 풀기·정리 문장, 팀 이름은 글에서만, 받은 글은 esc', () => {
    const groups = [{ code: '1-1-1111', jo: 1 }, { code: '1-2-1111', jo: 2 }, { code: '1-3-1111', jo: 3 }];
    const teams = [{ jo: 1, name: '별빛' }, { jo: 2, name: '달님<b>' }, { jo: 3, name: '해님' }];
    const rows = [
        { group: '1-1-1111', sentAt: '2026-11-23T01:00:00Z', data: JSON.stringify({ think: { first: { force: 'have' } }, quiz: { gas: { tries: 2, picks: ['heavy', 'ok'] } } }) },
        { group: '1-1-1111', sentAt: '2026-11-23T01:05:00Z', data: JSON.stringify({ think: { first: { force: 'ok' } }, quiz: { gas: { tries: 1, picks: ['ok'] } }, t1: { changed: 'temp' }, concl: { t1: { dir: 'down', why: '<i>빨리</i>' } } }) },
        { group: '1-2-1111', sentAt: '2026-11-23T01:02:00Z', data: JSON.stringify({ think: { first: { force: 'have' } } }) },
        { group: '9-9-9999', data: '{}' }, { group: '1-3-1111', data: 'not json' }
    ];
    const data = A.payloads(rows, groups);
    assert.deepEqual(Object.keys(data).sort(), ['1', '2'], '모르는 조·깨진 자료는 빼고, 조마다 가장 최근 줄');
    const f = A.tally('rocket', 'force', teams, data, M);
    assert.equal(f.answered, 2); assert.equal(f.total, 3);
    assert.deepEqual(f.groups[0].options.map(o => [o.k, o.n]).filter(x => x[1]), [['have', 1], ['ok', 1]]);
    const g = A.tally('rocket', 'gas', teams, data, M);
    assert.equal(g.answered, 1, '퀴즈는 처음 고른 답');
    const hidden = A.render(f, false), shown = A.render(f, true);
    assert.doesNotMatch(hidden, /✅/, '풀이 전에는 정답 표시 없음');
    assert.match(shown, /✅/);
    assert.match(hidden, /답한 팀 <b>2<\/b> \/ 3 <span class="ls-ans-left">\(아직 1팀\)/, '못 낸 팀은 수만');
    assert.doesNotMatch(hidden, /별빛|달님|해님/, '고르기 모음에는 팀 이름 없음');
    const e = A.tally('rocket', 'end-cause', teams, data, M);
    assert.equal(e.kind, 'list'); assert.equal(e.list.length, 1);
    const eh = A.render(e, false);
    assert.match(eh, /<b>별빛<\/b> 1차시 물의 온도 → 짧아짐 · 왜냐하면 &lt;i&gt;빨리&lt;\/i&gt;/, '글은 팀 이름과 함께, 받은 글은 esc');
    const et = A.tally('rocket', 'end-think', teams, data, M);
    assert.equal(et.groups.length, 3); assert.equal(et.answered, 0);
    assert.equal(A.tally('rocket', 'nope', teams, data, M), null);
    assert.equal(A.tally('qdot', 'force', teams, data, M), null, '지금은 로켓만');
});

test('발표 보기: 응답 장에 팀 답이 실시간으로 모임·풀이 뒤 ✅, 띠는 맨 아래 얇게, 🏆·🧩 바꾸기', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
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
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' }); });
        await c.route(/gstatic/, r => r.abort());
        await c.addInitScript(t => { if (t) localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); }, !!teacher);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const go = (pg, id) => pg.waitForSelector('#ev-app[data-screen="' + id + '"]', { timeout: 15000 });
    try {
        const c = await app.post({ action: 'createClass', ban: 3, mode: 'team', nTeams: 3, exp: 'rocket', stage: 1 });
        // 두 팀이 들어옴 (iPhone 13)
        const phones = [];
        for (const name of ['별빛가족', '달님가족']) {
            const P = await ctx(devices['iPhone 13'], name);
            await P.goto(ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space); await go(P, 'enter');
            await P.fill('#ev-name', name); await P.click('#ev-start'); await go(P, 'think-intro');
            phones.push(P);
        }
        // 교사: 발표 보기 (첫 장 = 생각 열기 '왜')
        const T = await ctx({ viewport: { width: 1920, height: 1080 } }, 'T', true);
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
        await T.waitForSelector('#pSlides .ls-slide');
        await T.waitForFunction(() => /👨‍👩‍👧 2팀/.test(document.getElementById('pJoined').textContent), null, { timeout: 20000 });
        // ② 띠는 발표 화면 맨 아래
        const pos = await T.evaluate(() => ({ bar: document.querySelector('#presentPane .ct-pbar').getBoundingClientRect().top, frame: document.querySelector('#presentPane .ct-pframe').getBoundingClientRect().bottom, h: document.querySelector('#presentPane .ct-pbar').getBoundingClientRect().height, vh: innerHeight }));
        assert.ok(pos.bar >= pos.frame - 1, '띠는 발표 화면 아래: ' + JSON.stringify(pos));
        assert.ok(pos.h <= pos.vh * 0.09, '띠는 얇게 (화면 높이의 9% 안): ' + JSON.stringify(pos));
        assert.equal(await T.locator('#pJoined').evaluate(el => /별빛|달님/.test(el.querySelector('summary') ? el.querySelector('summary').textContent : el.textContent.replace(/<details[\s\S]*$/, ''))), false, '띠 겉에는 팀 이름 없음');
        // ① 다음 장 = '힘' 응답 장 → 답한 팀 0 / 2
        await T.keyboard.press('ArrowRight');
        await T.waitForFunction(() => /‘힘’은 무엇일까요/.test(document.querySelector('#pSlides .ls-title').textContent));
        await T.waitForSelector('#pSlides .ls-answers');
        assert.match(await T.textContent('#pSlides .ls-answers'), /📱 지금 폰으로 답해요 · 답한 팀 0 \/ 2 \(아직 2팀\)/);
        // 두 팀이 폰에서 처음 생각을 고르면 → 프로젝터에 모임 (정답 표시는 아직)
        await phones[0].evaluate(() => window.__filmRocket.show('think-force')); await go(phones[0], 'think-force');
        await phones[0].click('.ev-choice[data-k="have"]');
        await phones[1].evaluate(() => window.__filmRocket.show('think-force')); await go(phones[1], 'think-force');
        await phones[1].click('.ev-choice[data-k="ok"]');
        for (const P of phones) await P.evaluate(() => window.__filmRocket.sendNow());
        await T.waitForFunction(() => /답한 팀 2 \/ 2/.test(document.querySelector('#pSlides .ls-answers').textContent), null, { timeout: 25000 });
        const bars = await T.$$eval('#pSlides .ls-bar', els => els.map(e => [e.querySelector('.ls-bar-t').textContent, e.querySelector('.ls-bar-n').textContent, e.classList.contains('ok')]));
        assert.equal(bars.filter(b => b[1] === '1').length, 2, '칸별 수: ' + JSON.stringify(bars));
        assert.equal(bars.some(b => b[2]), false, '풀이 전에는 정답 표시 없음');
        assert.doesNotMatch(await T.textContent('#pSlides .ls-answers'), /별빛|달님/, '고르기 모음에 팀 이름 없음');
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'rocket-5-answers.png') });
        // 다음 키 = 풀이 → 정답 칸 ✅
        await T.keyboard.press('ArrowRight');
        await T.waitForSelector('#pSlides .ls-reveal');
        await T.waitForSelector('#pSlides .ls-bar.ok');
        assert.match(await T.textContent('#pSlides .ls-bar.ok'), /✅ 물체의 모양이나 움직임을 바꾸는 원인/);
        assert.ok(await T.evaluate(() => { const s = document.querySelector('#pSlides .ls-slide'); return s.scrollHeight <= s.clientHeight + 1; }), '답 모음이 들어가도 한 화면');
        // ② 🏆 결과판 · 🧩 모아 보기로 바꾸기, → 는 설명으로 돌아감
        assert.equal(await T.isVisible('#btnPBoard'), true);
        await T.click('#btnPBoard');
        await T.waitForSelector('#pPanel:not([hidden]) .ct-board');
        assert.equal(await T.isVisible('#pSlides'), false, '결과판을 띄우면 설명은 숨김');
        assert.match(await T.textContent('#pPanel'), /별빛가족/, '결과판은 팀 이름 그대로');
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'rocket-6-board.png') });
        await T.click('#btnPGather');
        await T.waitForFunction(() => /팀 생각 모아 보기/.test(document.getElementById('pPanel').textContent));
        assert.equal(await T.getAttribute('#btnPGather', 'aria-pressed'), 'true');
        await T.keyboard.press('ArrowRight');
        await T.waitForSelector('#pPanel', { state: 'hidden' });
        assert.equal(await T.isVisible('#pSlides .ls-slide'), true, '→ 를 누르면 하던 설명으로');
        assert.match(await T.textContent('#pSlides .ls-title'), /‘힘’은 무엇일까요/);
        // 4K 3840×2160 에서도 띠 한 줄 (새 단추 포함)
        await T.setViewportSize({ width: 3840, height: 2160 }); await T.waitForTimeout(300);
        assert.ok(await T.evaluate(() => { const bs = [...document.querySelectorAll('#presentPane .ct-pbtns > button')].filter(b => b.offsetParent), t = bs.map(b => Math.round(b.getBoundingClientRect().top)); return Math.max(...t) - Math.min(...t) <= 2; }), '4K 띠 한 줄');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
