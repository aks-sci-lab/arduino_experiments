// 🎬 발표 보기 '나란히 보기 · 교사 조작은 한곳' (2026-11-23 선생님 "교사가 가상 수업을 진행하면서 교사가 조작해야 할 버튼 위치가
//  최대한 한곳에 집중되도록 하고 학생 화면은 수업화면 옆에 같이 보이도록") — Playwright, 가짜 저장소
//  ① 설명 장(왼쪽 약 65 %) | 학생 화면(오른쪽 약 35 %) — 장을 넘기면 학생 화면도 따라감
//     · 로켓: 폰이 보는 화면 그대로(👀 대기 → 답 칸 → 퀴즈 → 측정), 7단계: 그 단계 탭 + 👀 띠 + 답 가리기(풀이를 열면 열림)
//  ② 아래 띠 하나로: 단계 열기·↩ 되돌리기·🔓 풀이·⬜ 설명만/⇔ 나란히·📱 학생 크게·🧩 모아 보기·🏆 결과판·📱 QR·⛶·📋
//     띠는 한 줄 (4K 3840×2160 배율 100·150·200 %·1280×720), 단추 44px 이상, 오른쪽 위 QR 없음
//  ③ 설명 장이 없는 실험은 학생 화면만 크게
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const SHOTS = process.env.PRESENT_SHOTS || '';
// 배율 100·150·200 % 의 4K = CSS 화면 3840×2160 · 2560×1440 · 1920×1080, 작은 노트북 1280×720
const SIZES = [[3840, 2160], [2560, 1440], [1920, 1080], [1280, 720]];

test('발표 보기 나란히: 설명 장 옆 학생 화면이 따라감, 조작은 아래 띠 하나, 설명 없는 실험은 학생 화면만', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
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
    const frameScreen = T => T.evaluate(() => { const d = document.getElementById('presentFrame').contentDocument; const a = d && d.getElementById('ev-app'); return a ? a.getAttribute('data-screen') : ''; });
    const waitFrame = (T, id, t) => T.waitForFunction(x => { const d = document.getElementById('presentFrame').contentDocument; const a = d && d.getElementById('ev-app'); return a && a.getAttribute('data-screen') === x; }, id, { timeout: t || 15000 });
    const box = async (T, sel) => { const b = await T.locator(sel).boundingBox(); return b && b.width > 0 ? b : null; };
    const slideTitle = T => T.evaluate(() => { const s = document.querySelector('#presentPane.ls-on #pSlides .ls-title'); return s && s.getClientRects().length ? s.textContent : ''; });
    // 띠 한 줄: 보이는 단추가 모두 같은 줄(위 끝이 거의 같음), 띠 높이는 단추 두 줄보다 낮음, 단추 44px 이상, 가로 스크롤 없음
    const barOneLine = async (T, label) => {
        const r = await T.evaluate(() => {
            const bar = document.querySelector('#presentPane .ct-pbar'), bs = [...bar.querySelectorAll('button')].filter(b => b.getClientRects().length);
            const tops = bs.map(b => b.getBoundingClientRect().top), hs = bs.map(b => Math.min(b.getBoundingClientRect().height, b.getBoundingClientRect().width));
            return { n: bs.length, spread: Math.max(...tops) - Math.min(...tops), minH: Math.min(...hs), barH: bar.getBoundingClientRect().height, scroll: document.documentElement.scrollWidth - innerWidth,
                bottom: bar.getBoundingClientRect().bottom, vh: innerHeight };
        });
        assert.ok(r.spread < 4, label + ' 띠 한 줄: ' + JSON.stringify(r));
        assert.ok(r.minH >= 44, label + ' 단추 44px: ' + JSON.stringify(r));
        assert.ok(r.barH < r.minH * 2, label + ' 띠 높이: ' + JSON.stringify(r));
        assert.equal(r.scroll, 0, label + ' 가로 스크롤');
        assert.ok(r.bottom <= r.vh + 1, label + ' 띠가 화면 안: ' + JSON.stringify(r));
    };
    // 왼쪽 위 작은 QR 칸은 없음 (2026-11-23 선생님 "큐알코드 화면 다시 없애") — QR 은 띠의 📱 QR 로 크게
    const qrTopLeft = async (T, label) => {
        assert.equal(await T.locator('#pQr').count(), 0, label + ' 왼쪽 위 QR 칸 없음');
        const d = await box(T, '#pSlides') || await box(T, '#pPanel');
        if (d) assert.ok(d.x < T.viewportSize().width * 0.05, label + ' 설명 장이 왼쪽 끝부터: ' + JSON.stringify(d));
    };
    try {
        // ---------- 로켓 (팀 수업) ----------
        const c = await app.post({ action: 'createClass', ban: 4, mode: 'team', nTeams: 3, exp: 'rocket', stage: 1 });
        const A = await ctx(devices['iPhone 13'], 'A');
        await A.goto(ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space);
        await A.waitForSelector('#ev-app[data-screen="enter"]');
        await A.fill('#ev-name', '별빛가족'); await A.click('#ev-start'); await A.waitForSelector('#ev-app[data-screen="think-intro"]');

        const T = await ctx({ viewport: { width: 1920, height: 1080 } }, 'T', true);
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
        await T.waitForFunction(() => document.querySelector('#presentPane.ls-on .ls-slide'), null, { timeout: 15000 });
        // 나란히: 설명 장 왼쪽 | 폰 틀 오른쪽, 겹치지 않음, 오른쪽 위 QR 없음
        await waitFrame(T, 'wait');
        let d = await box(T, '#pSlides'), f = await box(T, '#presentFrame');
        assert.ok(d && f, '설명 장과 학생 화면이 함께 보임');
        assert.ok(d.x + d.width <= f.x + 1, '설명 왼쪽 · 학생 화면 오른쪽');
        assert.ok(d.width / T.viewportSize().width > 0.55 && d.width / T.viewportSize().width < 0.8, '설명 장 (65~75 %): ' + Math.round(d.width));
        assert.equal(await T.isVisible('#cornerQr'), false, '오른쪽 위 QR 없음');
        assert.match(await T.evaluate(() => document.getElementById('presentFrame').contentDocument.querySelector('.ev-screen').textContent), /앞 화면을 봐요/, '학생 화면 = 폰이 보는 👀 대기');
        await A.waitForSelector('#ev-app[data-screen="wait"]');
        // → 응답 장 '힘' → 학생 화면도 답 칸 (폰과 같음)
        await T.keyboard.press('ArrowRight');
        await waitFrame(T, 'think-force');
        await A.waitForSelector('#ev-app[data-screen="think-force"]');
        assert.equal(await T.isVisible('#btnPReveal'), true, '풀이가 있는 장이면 🔓 풀이');
        if (SHOTS) for (const [w, h] of SIZES) { await T.setViewportSize({ width: w, height: h }); await T.waitForTimeout(250); await T.screenshot({ path: path.join(SHOTS, 'rocket-side-' + w + 'x' + h + '.png') }); }
        for (const [w, h] of SIZES) { await T.setViewportSize({ width: w, height: h }); await T.waitForTimeout(150); await barOneLine(T, '로켓 ' + w + '×' + h);
            const dd = await box(T, '#pSlides'), ff = await box(T, '#presentFrame');
            assert.ok(dd && ff && dd.x + dd.width <= ff.x + 1, w + ' 나란히');
            assert.ok(ff.height >= h * 0.6, w + ' 폰 틀 높이: ' + Math.round(ff.height));
            // 폰 틀 = 실제 폰 비율 9 : 19.5, 안쪽 답 칸 화면은 틀을 채움 (아래 빈 곳 25 % 미만)
            assert.ok(Math.abs(ff.width / ff.height - 9 / 19.5) < 0.02, w + ' 폰 비율: ' + Math.round(ff.width) + '×' + Math.round(ff.height));
            await T.waitForTimeout(250);
            const fill = await T.evaluate(() => { const f = document.getElementById('presentFrame'), win = f.contentWindow, d = f.contentDocument; let m = 0;
                [...d.body.children].forEach(el => { if (el.tagName !== 'SCRIPT' && el.getClientRects().length) m = Math.max(m, el.getBoundingClientRect().bottom); }); return m / win.innerHeight; });
            assert.ok(fill >= 0.75, w + ' 폰 틀 안 채움: ' + fill.toFixed(2));
            await qrTopLeft(T, '로켓 ' + w);
        }
        await T.setViewportSize({ width: 1920, height: 1080 });
        // 🔓 풀이 (띠 단추) → 풀이 열림, 단추는 '✅ 풀이 열림'
        await T.click('#btnPReveal');
        await T.waitForFunction(() => document.querySelector('#pSlides .ls-slide').dataset.revealed === '1');
        assert.match(await T.textContent('#btnPReveal'), /풀이 열림/);
        // ⬜ 설명만 → 학생 화면 접힘, ⇔ 나란히 → 다시 옆에
        await T.click('#btnPLayout');
        assert.equal(await box(T, '#presentFrame'), null, '⬜ 설명만');
        assert.ok((await box(T, '#pSlides')).width > 1500, '설명 장 크게');
        assert.match(await T.textContent('#btnPLayout'), /나란히/);
        await T.click('#btnPLayout');
        assert.ok(await box(T, '#presentFrame'), '⇔ 나란히');
        // 🏆 결과판 · 🧩 모아 보기 (띠) → 왼쪽에, 학생 화면은 옆에 그대로
        await T.click('#btnPBoard');
        await T.waitForSelector('#pPanel:not([hidden]) .ct-ppanel-h');
        assert.match(await T.textContent('#pPanel'), /결과판/);
        f = await box(T, '#presentFrame'); d = await box(T, '#pPanel');
        assert.ok(f && d && d.x + d.width <= f.x + 1, '결과판 옆에 학생 화면');
        await T.click('#btnPGather');
        assert.match(await T.textContent('#pPanel'), /모아 보기/);
        await T.click('#btnPGather');
        assert.equal(await T.isVisible('#pPanel'), false, '다시 누르면 설명 장으로');
        assert.ok(await slideTitle(T), '설명 장 그대로');
        // 📋 진행 상황 = 팝업 (발표 보기를 떠나지 않음, 2026-11-23 "진행 화면으로 돌아가기 보다는 … 팝업으로")
        const before = await slideTitle(T);
        await T.click('#btnPExit');
        assert.equal(await T.isVisible('#runPop'), true, '진행 상황 팝업');
        assert.equal(await T.evaluate(() => !!document.querySelector('#runPopBody #runPane:not([hidden])')), true, '진행 화면 내용이 팝업 안에');
        assert.equal(await T.isVisible('#presentPane'), true, '발표 화면은 뒤에 그대로');
        assert.match(T.url(), /view=present/, '주소도 발표 보기 그대로');
        await T.keyboard.press('ArrowRight');
        await T.keyboard.press('Escape');
        assert.equal(await T.isVisible('#runPop'), false, 'Esc 로 닫힘');
        assert.equal(await slideTitle(T), before, '팝업을 띄운 동안 장이 넘어가지 않음');
        assert.equal(await T.evaluate(() => { const p = document.getElementById('runPane'); return !p.closest('#runPop') && p.hidden; }), true, '닫으면 제자리·숨김');
        // 📱 QR (띠) → 크게, Esc 로 닫기
        await T.click('#btnPQr');
        assert.equal(await T.isVisible('#bigQr'), true);
        await T.keyboard.press('Escape');
        assert.equal(await T.isVisible('#bigQr'), false);
        // ▶ 다음 단계 (띠) → 열기 → 1차시 설명 첫 장, 학생 화면은 그 장 (퀴즈 '기체' 는 응답 장 → 답 칸)
        await T.click('#btnPOpen'); await T.click('#btnPAskYes');
        await T.waitForFunction(() => /뚜껑은 왜/.test((document.querySelector('#pSlides .ls-title') || {}).textContent || ''), null, { timeout: 15000 });
        await waitFrame(T, 'q-gas');
        assert.equal(app.db.docs.get('labClasses/' + c.space).stage, 2);
        // 측정 장까지 → 학생 화면은 측정 첫 화면(안전 확인)
        for (let k = 0; k < 14 && !/이제 폰으로 재요/.test(await slideTitle(T)); k++) await T.keyboard.press('ArrowRight');
        assert.match(await slideTitle(T), /이제 폰으로 재요/);
        await waitFrame(T, 't1-safe');
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'rocket-side-measure-1920.png') });
        // ↩ 되돌리기 (띠, 확인 창) → 단계 하나 잠김
        await T.click('#btnPBack');
        await T.waitForFunction(() => /생각 열기/.test(document.getElementById('pStage').textContent), null, { timeout: 15000 });
        assert.equal(app.db.docs.get('labClasses/' + c.space).stage, 1, '↩ 로 되돌림');
        // 📱 학생 크게 → 설명 닫고 학생 화면만 (폰도 혼자 흐름으로)
        await T.click('#btnPMode');
        assert.equal(await slideTitle(T), '', '설명 닫힘');
        f = await box(T, '#presentFrame');
        assert.ok(f && f.height > 900, '학생 화면 크게');
        await A.waitForFunction(() => !document.documentElement.classList.contains('ev-following'), null, { timeout: 15000 });
        assert.match(await T.textContent('#btnPMode'), /설명/);
        // 📋 진행 화면 (띠) → 관리 화면, 오른쪽 위 QR 은 거기에만
        await T.click('#btnPExit'); await T.click('#btnRunPopGo');
        await T.waitForSelector('#stageCard:not([hidden])');
        assert.equal(await T.isVisible('#cornerQr'), true, '진행 화면에는 오른쪽 위 QR');
        await A.close();

        // ---------- 7단계 (탄소 양자점, 실제 설명 내용) ----------
        const q = await app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 1 });
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + q.space + '&view=present'); await T.reload();
        await T.waitForFunction(() => document.querySelector('#presentPane.ls-on .ls-slide'), null, { timeout: 15000 });
        const fsel = () => T.evaluate(() => { const d = document.getElementById('presentFrame').contentDocument; const b = d && d.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.dataset.step : ''; });
        await T.waitForFunction(() => { const d = document.getElementById('presentFrame').contentDocument; return d && d.querySelector('nav.steps button[aria-selected="true"]'); }, null, { timeout: 15000 });
        assert.equal(await fsel(), 'purpose');
        d = await box(T, '#pSlides'); f = await box(T, '#presentFrame');
        assert.ok(d && f && d.x + d.width <= f.x + 1, '7단계도 나란히');
        // 학생 화면도 학생 폰처럼 👀 띠, 물음 장의 답(qd-measure)은 풀이를 열 때까지 가림
        await T.waitForFunction(() => document.getElementById('presentFrame').contentDocument.documentElement.classList.contains('cs-look'), null, { timeout: 15000 });
        for (let k = 0; k < 12 && !/어떻게 잴까/.test(await slideTitle(T)); k++) await T.keyboard.press('ArrowRight');
        assert.match(await slideTitle(T), /어떻게 잴까/);
        const hidden = () => T.evaluate(() => { const e = document.getElementById('presentFrame').contentDocument.querySelector('[data-lesson-answer="qd-measure"]'); return e ? e.classList.contains('cs-ans-hide') : null; });
        await T.waitForFunction(() => { const e = document.getElementById('presentFrame').contentDocument.querySelector('[data-lesson-answer="qd-measure"]'); return e && e.classList.contains('cs-ans-hide'); }, null, { timeout: 15000 });
        await T.click('#btnPReveal');
        await T.waitForFunction(() => { const e = document.getElementById('presentFrame').contentDocument.querySelector('[data-lesson-answer="qd-measure"]'); return e && !e.classList.contains('cs-ans-hide'); }, null, { timeout: 15000 });
        assert.equal(await hidden(), false, '풀이를 열면 학생 화면의 답도 열림');
        if (SHOTS) for (const [w, h] of SIZES) { await T.setViewportSize({ width: w, height: h }); await T.waitForTimeout(250); await T.screenshot({ path: path.join(SHOTS, 'qdot-side-' + w + 'x' + h + '.png') }); }
        for (const [w, h] of SIZES) { await T.setViewportSize({ width: w, height: h }); await T.waitForTimeout(150); await barOneLine(T, '양자점 ' + w + '×' + h); await qrTopLeft(T, '양자점 ' + w);
            const dd = await box(T, '#pSlides'), ff = await box(T, '#presentFrame');
            assert.ok(ff.height >= h * 0.8, w + ' 7단계 학생 화면은 칸 높이를 다 씀'); assert.ok(dd.width >= ff.width, w + ' 설명 장이 더 넓음'); }
        await T.setViewportSize({ width: 1920, height: 1080 });
        // 단계를 열면 설명 첫 장 + 학생 화면도 그 단계로
        await T.click('#btnPOpen'); await T.click('#btnPAskYes');
        await T.waitForFunction(() => /2 이론/.test(document.getElementById('pStage').textContent), null, { timeout: 15000 });
        await T.waitForFunction(() => { const d = document.getElementById('presentFrame').contentDocument; const b = d && d.querySelector('nav.steps button[aria-selected="true"]'); return b && b.dataset.step === 'theory'; }, null, { timeout: 15000 });
        assert.ok(await slideTitle(T), '이론 설명 장');

        // ---------- 설명 장이 없는 실험 (말루스): 학생 화면만 크게, 나란히 단추 없음 ----------
        const m = await app.post({ action: 'createClass', ban: 3, nStudents: 4, groupSize: 2, exp: 'malus', stage: 1 });
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + m.space + '&view=present'); await T.reload();
        await T.waitForFunction(() => { const d = document.getElementById('presentFrame').contentDocument; return d && d.querySelector('nav.steps button[aria-selected="true"]'); }, null, { timeout: 15000 });
        await T.waitForTimeout(400);
        assert.equal(await slideTitle(T), '');
        assert.equal(await T.isVisible('#btnPLayout'), false);
        assert.equal(await T.isVisible('#btnPMode'), false);
        f = await box(T, '#presentFrame');
        assert.ok(f.width > 1600, '학생 화면만 크게 (왼쪽 위 QR 칸만 빼고): ' + f.width);
        await barOneLine(T, '말루스 1920');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
