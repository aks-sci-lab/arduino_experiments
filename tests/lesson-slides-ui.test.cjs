// 🎬 발표 보기 '수업 설명 화면' (2026-11-21 선생님 "교사가 프로젝트에 띄우게 될 화면에 내용이 있어야") — Playwright, 가짜 저장소
//  로켓 수업 → 발표 보기 → 들어가기 설명부터 → 한 장씩, 물음(❓) 다음 키에 풀이 → 마지막 장 다음은 학생 화면 단독 없이 '열까요?' → 1차시 설명부터 (2026-11-27)
//  7단계(퀀텀닷, 시험용 내용): 마지막 장 다음은 열린 다음 단계 첫 장, 첫 장 ← 는 앞 단계 마지막 장, 설명 없는 단계(준비물)는 학생 화면
//  내용 파일이 없는 실험(말루스)은 지금처럼 학생 화면만, 4K(3840×2160 배율 100·150·200%)에서 글이 넘치지 않음
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';
// 시험용 퀀텀닷 내용 (진행 방법 세션이 쓰는 진짜 파일과 상관없이)
const QDOT = `LessonContent.add('qdot', { title: '시험', stages: {
  purpose: [ { kind: 'why', title: '목적 설명 1', body: '<p>하나</p>' }, { kind: 'ask', title: '목적 물음', body: '<p>둘</p>', ask: '왜?', reveal: '<p>풀이-목적</p>' } ],
  theory: [ { kind: 'concept', title: '이론 설명 1', body: '<p>이론</p><p class="formula">E = hc / λ</p><table><thead><tr><th>λ</th><th>E</th></tr></thead><tbody><tr><td>365 nm</td><td>3.40 eV</td></tr><tr><td>450 nm</td><td>2.76 eV</td></tr></tbody></table>', note: '선생님 말' } ] } });`;

test('발표 보기 설명 화면: 단계마다 설명부터, 물음 뒤 풀이, 학생 화면 단독 없이 다음 단계로, 내용 없는 실험은 그대로, 4K', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const ctx = async (opt) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' }); });
        await c.route(/gstatic/, r => r.abort());
        await c.route('**/js/lesson-content/qdot.js', r => r.fulfill({ contentType: 'text/javascript', body: QDOT }));
        await c.route('**/js/lesson-content/malus.js', r => r.fulfill({ status: 404, body: '' }));
        await c.addInitScript(() => localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })));
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const slide = pg => pg.evaluate(() => { const s = document.querySelector('#presentPane.ls-on #pSlides .ls-slide'); if (!s || !s.getClientRects().length) return null;
        return { title: s.querySelector('.ls-title').textContent, kind: s.dataset.kind, rev: s.dataset.revealed == null ? null : s.dataset.revealed === '1', frame: getComputedStyle(document.getElementById('presentFrame')).display }; });
    const screen = pg => pg.evaluate(() => { const d = document.getElementById('presentFrame').contentDocument; const a = d && d.getElementById('ev-app'); return a ? a.getAttribute('data-screen') : ''; });
    try {
        // ---------- 로켓 ----------
        const r = await app.post({ action: 'createClass', ban: 5, mode: 'team', nTeams: 3, exp: 'rocket', stage: 1 });
        const T = await ctx({ viewport: { width: 1920, height: 1080 } });
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + r.space + '&view=present');
        await T.waitForSelector('#presentPane:not([hidden])');
        await T.waitForFunction(() => document.querySelector('#presentPane.ls-on .ls-slide'), null, { timeout: 15000 });
        let s = await slide(T);
        assert.match(s.title, /필름통 로켓/, '생각 열기 첫 장');
        assert.equal(s.frame, 'block', '설명 옆에 학생 화면 (나란히 보기)');
        assert.equal(await T.isVisible('#btnPMode'), false, '설명 장을 띄운 동안 📱 학생 크게 단추 없음');
        assert.equal(await T.isVisible('#cornerQr'), false, '오른쪽 위 QR 없음 — 띠의 📱 QR');
        assert.equal(await T.isVisible('#btnPQr'), true);
        assert.equal(await T.isVisible('.ls-note summary'), true, '선생님용은 접기');
        assert.equal(await T.isVisible('.ls-note div'), false, '선생님 말은 바로 안 보임');
        await T.keyboard.press('ArrowRight');   // 2026-11-27 분량 조절: '폰에서 이렇게 해요'는 첫 장에 합침
        s = await slide(T);
        assert.match(s.title, /힘/);
        assert.equal(s.rev, false, '물음 먼저, 풀이는 숨김');
        assert.doesNotMatch(await T.textContent('.ls-slide'), /운동 상태를 바꾸는 원인/, '답이 먼저 보이지 않음');
        await T.keyboard.press('PageDown');
        s = await slide(T);
        assert.equal(s.rev, true, '다음 키에 풀이');
        assert.match(await T.textContent('.ls-reveal'), /운동 상태를 바꾸는 원인/);
        await T.keyboard.press('ArrowLeft');
        assert.equal((await slide(T)).rev, false, '← 는 풀이 접기');
        await T.keyboard.press('ArrowLeft');
        assert.match((await slide(T)).title, /필름통 로켓/, '← 앞 장');
        await T.keyboard.press('ArrowLeft');
        assert.match((await slide(T)).title, /필름통 로켓/, '← 첫 장');
        await T.keyboard.press('ArrowLeft');
        assert.match((await slide(T)).title, /필름통 로켓/, '첫 장에서 ← 는 그대로 머묾 (말없이 학생 화면으로 가지 않음)');
        // 끝까지 → 학생 화면을 단독으로 띄우지 않고 '1차시를 열까요?' (2026-11-27 선생님 "핵심개념, 1단계, 2단계 뒤에 학생 화면이 나오는 기능은 필요 없어")
        for (let i = 0; i < 30 && !(await T.isVisible('#pAsk')); i++) await T.keyboard.press('ArrowRight');
        assert.equal(await T.isVisible('#pAsk'), true, '마지막 장 다음은 열기 확인');
        assert.match(await T.textContent('#pAskText'), /1차시/);
        s = await slide(T);
        assert.match(s.title, /힘 · 가속도 · 압력/, '핵심 개념 정리 장이 그대로 떠 있음 (학생 화면 단독 아님)');
        assert.equal(s.frame, 'block', '학생 화면은 옆 칸에만');
        assert.equal(await T.isVisible('#btnPMode'), false, '📖 설명 단추 없음 (설명 장이 떠 있음)');
        // 빨리 한 번 더 → 를 눌러도 열리지 않음 (열기는 Enter·단추로만)
        await T.keyboard.press('ArrowRight'); await T.keyboard.press('PageDown');
        await T.waitForTimeout(300);
        assert.equal(app.db.docs.get('labClasses/' + r.space).stage, 1, '→ 를 거듭 눌러도 열리지 않음');
        assert.equal(await T.isVisible('#pAsk'), true);
        assert.ok(await slide(T), '그동안에도 설명 장 그대로');
        await T.keyboard.press('Enter');
        await T.waitForFunction(() => document.querySelector('#presentPane.ls-on .ls-slide'), null, { timeout: 5000 });
        assert.match((await slide(T)).title, /펑/, '1차시 설명 첫 장');
        // 답을 보여 주는 그림(기체가 뚜껑을 미는 화살표·펑)은 풀이 뒤에 — 풀이 전에는 닫힌 통 물음 그림만 (2026-11-27 '펑' 두 장을 하나로)
        assert.match(await T.getAttribute('#pSlides .ls-fig svg', 'aria-label'), /뚜껑이 닫힌 필름통/, '풀이 전에는 물음 그림');
        await T.keyboard.press('ArrowRight');
        assert.match(await T.getAttribute('#pSlides .ls-fig svg', 'aria-label'), /펑 열릴 때/, '풀이를 열면 답 그림');
        await T.keyboard.press('ArrowLeft');
        assert.equal(app.db.docs.get('labClasses/' + r.space).stage, 2, '단계는 열림');
        // 우리 팀 실험 계획 🔮 (2026-11-27: 변인 통제 물음 + 계획 표를 폰 응답 장 하나로): 바꿀 것 하나 + 예측 물음, 풀이 = 변인 통제
        for (let i = 0; i < 12 && !/실험 계획/.test((await slide(T)).title); i++) await T.keyboard.press('ArrowRight');
        assert.match((await slide(T)).title, /우리 팀 실험 계획/);
        assert.match(await T.textContent('#pSlides .ls-slide'), /바꿀 것 하나만[\s\S]*① → ② 로 바꾸면/);
        // 1차시 마지막 장(🎯 도전) 다음 → 학생 화면 없이 '2차시를 열까요?'
        for (let i = 0; i < 30 && !(await T.isVisible('#pAsk')); i++) await T.keyboard.press('ArrowRight');
        assert.equal(await T.isVisible('#pAsk'), true);
        assert.match(await T.textContent('#pAskText'), /2차시/);
        assert.match((await slide(T)).title, /도전/, '1차시 마지막 장 그대로');
        await T.keyboard.press('Escape');
        assert.equal(await T.isVisible('#pAsk'), false);
        // 1차시 첫 장에서 ← → 들어가기 마지막 장(핵심 개념 정리), → 로 다시 1차시 첫 장 (열린 단계)
        for (let i = 0; i < 40 && !/힘 · 가속도 · 압력/.test(((await slide(T)) || {}).title || ''); i++) await T.keyboard.press('ArrowLeft');
        assert.match((await slide(T)).title, /힘 · 가속도 · 압력/, '첫 장 ← 는 앞 단계 마지막 장');
        await T.keyboard.press('ArrowRight');
        assert.match((await slide(T)).title, /펑/, '열린 다음 단계는 바로 첫 장');
        assert.equal(app.db.docs.get('labClasses/' + r.space).stage, 2);

        // 4K 프로젝터: 3840×2160 배율 100·150·200% → 모든 장(풀이까지)이 넘치지 않고 글자는 화면 높이의 2% 이상
        for (const [w, h] of [[3840, 2160], [2560, 1440], [1920, 1080]]) {
            await T.setViewportSize({ width: w, height: h });
            const bad = await T.evaluate(() => {
                const def = LessonContent.get('rocket'), box = document.getElementById('pSlides'), out = [];
                Object.keys(def.stages).forEach(k => def.stages[k].forEach((sl, i) => {
                    box.innerHTML = LessonSlides.render(sl, true, { i, n: def.stages[k].length, stageName: k });
                    LessonSlides.fit(box);
                    const el = box.querySelector('.ls-slide'), fs = parseFloat(getComputedStyle(el).fontSize);
                    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) out.push(k + i + ' 넘침');
                    if (fs < innerHeight * 0.02) out.push(k + i + ' 글자 ' + fs.toFixed(1) + 'px');
                }));
                return out;
            });
            assert.deepEqual(bad, [], w + '×' + h);
            assert.equal(await T.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, w + ' 가로 스크롤');
            const db = await T.locator('#pSlides').boundingBox(), fb = await T.locator('#presentFrame').boundingBox();
            assert.ok(db.x + db.width <= fb.x + 1, '설명 장과 학생 화면이 겹치지 않음');
        }
        await T.setViewportSize({ width: 1920, height: 1080 });

        // ---------- 7단계 (퀀텀닷, 시험용 내용) ----------
        const q = await app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 2 });
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + q.space + '&view=present'); await T.reload();
        await T.waitForFunction(() => document.querySelector('#presentPane.ls-on .ls-title'), null, { timeout: 15000 });
        const sel = () => T.evaluate(() => { const b = document.getElementById('presentFrame').contentDocument.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.dataset.step : ''; });
        await T.waitForFunction(() => { const d = document.getElementById('presentFrame').contentDocument; return d && d.querySelector('nav.steps button[aria-selected="true"]'); }, null, { timeout: 15000 });
        // 발표를 열면 가장 뒤에 연 단계(이론)의 설명부터 → 옆 학생 화면도 이론
        assert.equal((await slide(T)).title, '이론 설명 1');
        await T.waitForFunction(() => { const b = document.getElementById('presentFrame').contentDocument.querySelector('nav.steps button[aria-selected="true"]'); return b && b.dataset.step === 'theory'; }, null, { timeout: 15000 });
        // 본문의 표·식: 칸이 테두리·간격으로 나뉘고, 식은 본문보다 크고 굵게
        const look = await T.evaluate(() => { const s = document.querySelector('#pSlides .ls-slide'), td = s.querySelector('td'), f = s.querySelector('.formula'), p = s.querySelector('.ls-body p'), cs = getComputedStyle(td);
            return { border: parseFloat(cs.borderLeftWidth), pad: parseFloat(cs.paddingLeft), gap: s.querySelectorAll('td')[1].getBoundingClientRect().left - td.getBoundingClientRect().right, fw: +getComputedStyle(f).fontWeight, fs: parseFloat(getComputedStyle(f).fontSize) / parseFloat(getComputedStyle(p).fontSize), over: s.scrollHeight > s.clientHeight + 1 }; });
        assert.ok(look.border >= 1 && look.pad >= 4, '표 칸 테두리·간격: ' + JSON.stringify(look));
        assert.ok(look.fw >= 700 && look.fs >= 1.2, '식은 크고 굵게: ' + JSON.stringify(look));
        assert.equal(look.over, false, '표·식이 있어도 넘치지 않음');
        // 이론 첫 장에서 ← → 목적 마지막 장(풀이 열린 채), 옆 학생 화면도 목적으로 따라감
        await T.keyboard.press('ArrowLeft');
        s = await slide(T);
        assert.equal(s.title, '목적 물음', '첫 장 ← 는 앞 단계 마지막 장');
        assert.equal(s.rev, true);
        assert.equal(s.frame, 'block');
        assert.equal(await sel(), 'purpose', '옆의 학생 화면도 띄운 장의 단계로 따라감');
        await T.keyboard.press('ArrowLeft'); await T.keyboard.press('ArrowLeft');
        assert.equal((await slide(T)).title, '목적 설명 1');
        await T.keyboard.press('ArrowLeft');
        assert.equal((await slide(T)).title, '목적 설명 1', '맨 첫 단계 첫 장에서 ← 는 그대로');
        // 목적 마지막 장 다음 → 열린 이론 첫 장 (학생 화면 단독 없음)
        for (let i = 0; i < 6 && (await slide(T)).title !== '이론 설명 1'; i++) await T.keyboard.press('ArrowRight');
        assert.equal((await slide(T)).title, '이론 설명 1', '마지막 장 다음은 열린 다음 단계 첫 장');
        assert.equal(await sel(), 'theory');
        // 이론 다음(준비물)은 잠김 → '열까요?' (설명 장 그대로) → 내용 없는 단계(준비물)는 예전처럼 학생 화면
        await T.keyboard.press('ArrowRight');
        assert.equal(await T.isVisible('#pAsk'), true);
        assert.equal((await slide(T)).title, '이론 설명 1', '열지 물을 때도 설명 장 그대로');
        await T.keyboard.press('Enter');
        await T.waitForFunction(() => /3 준비물/.test(document.getElementById('pStage').textContent), null, { timeout: 15000 });
        await T.waitForFunction(() => !document.querySelector('#presentPane.ls-on'), null, { timeout: 5000 });
        assert.equal(await slide(T), null, '설명 없는 단계는 학생 화면');
        await T.waitForFunction(() => { const b = document.getElementById('presentFrame').contentDocument.querySelector('nav.steps button[aria-selected="true"]'); return b && b.dataset.step === 'materials'; }, null, { timeout: 15000 });
        assert.match(await T.textContent('#btnPMode'), /설명/);
        // 학생 화면 맨 위에서 ← → 이론 설명 마지막 장
        await T.evaluate(() => document.getElementById('presentFrame').contentWindow.scrollTo(0, 0));
        for (let i = 0; i < 12 && !(await slide(T)); i++) { await T.keyboard.press('ArrowLeft'); await T.waitForTimeout(40); }
        assert.equal((await slide(T)).title, '이론 설명 1');

        // ---------- 내용 파일이 없는 실험 (말루스): 학생 화면만, 📖 단추 없음 ----------
        const m = await app.post({ action: 'createClass', ban: 3, nStudents: 4, groupSize: 2, exp: 'malus', stage: 1 });
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + m.space + '&view=present'); await T.reload();
        await T.waitForFunction(() => { const d = document.getElementById('presentFrame').contentDocument; return d && d.querySelector('nav.steps button[aria-selected="true"]'); }, null, { timeout: 15000 });
        await T.waitForTimeout(500);
        assert.equal(await slide(T), null);
        assert.equal(await T.isVisible('#btnPMode'), false);
        assert.notEqual(await T.evaluate(() => getComputedStyle(document.getElementById('presentFrame')).display), 'none');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
