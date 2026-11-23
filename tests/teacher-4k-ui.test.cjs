// 교사 화면 4K 프로젝터 기준 (선생님 "프로젝터는 4k야", "웹앱 만으로 프리젠테이션을 대신") — Playwright, 가짜 저장소
//  화면: 3840×2160 을 윈도우 배율 100·150·200 % (CSS 3840×2160 / 2560×1440 / 1920×1080) + 작은 노트북 1280×720
//  ① 🎬 발표 보기 본문 글자 ÷ 화면 높이 ≥ 2.5 %, 내용이 틀을 가로로 채움, 제목·소개 글 숨김
//  ② 긴 단계(플랑크 3 준비물)에서 → 는 먼저 아래로, 끝에 닿으면 다음 작은 탭(위로 돌아감), ← 는 반대
//  ③ 큰 QR 화면: QR·수업 코드·노트북 접속 방법(주소 → 학생 → 수업 코드)·'다음' 단추가 한 화면, 코드는 QR 다음으로 큰 글자
//  ④ 🏆 결과판 크게 보기 글자 ≥ 3 %  ⑤ 함께 보는 화면에 교사용 글(긴 주소·지워지는 날·2일·CSV·예비 실험 값·넘기는 키)이 보이지 않음(접기)
//  ⑥ 로켓 폰 틀은 화면 높이에 맞춤  ⑦ Alt+B 가 겹쳐서 화면을 넘지 않음  ⑧ 교사 화면 375px 가로 스크롤 없음
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadLabStore } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://lab.test';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm' };
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg viewBox=\\"0 0 10 10\\"><rect width=\\"10\\" height=\\"10\\"/></svg>"}}};';
const CHART = 'window.Chart=class{constructor(c,o){this.data=(o&&o.data)||{datasets:[]};this.options={};}update(){}destroy(){}resize(){}};';
const SIZES = [['4K 100%', 3840, 2160], ['4K 150%', 2560, 1440], ['4K 200%', 1920, 1080], ['노트북 1280×720', 1280, 720]];

test('교사 화면 4K: 발표 글자·먼저 내리기·큰 QR 한 화면·결과판·교사용 글 접기·로켓 틀·Alt+B·375px', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
    const app = loadLabStore();
    const browser = await chromium.launch();
    try {
        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        await ctx.route('**/*', async route => {
            const req = route.request(), u = new URL(req.url());
            if (u.hostname === 'script.google.com') {
                const body = req.method() === 'POST' ? await app.post(req.postData() || '{}') : await app.get(Object.fromEntries(u.searchParams));
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
            }
            if (/cdn\.jsdelivr|cdnjs/.test(u.hostname)) return route.fulfill({ contentType: 'application/javascript', body: /qrcode/.test(u.pathname) ? QR : /chart/i.test(u.pathname) ? CHART : '' });
            if (u.origin !== ORIGIN) return route.abort();
            // 설명 화면(📖)은 tests/lesson-slides-ui.test.cjs 가 봄 — 여기서는 학생 화면(iframe)만
            if (/\/js\/lesson-content\//.test(u.pathname)) return route.fulfill({ status: 404, body: '' });
            const file = path.join(ROOT, decodeURIComponent(u.pathname));
            if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
        });
        await ctx.addInitScript(() => { window.LAB_STORE_FAKE_URL = 'https://script.google.com/macros/s/FAKE_LAB_STORE/exec'; });
        const T = await ctx.newPage(); const errors = [];
        T.on('pageerror', e => errors.push(e.message)); T.on('dialog', d => d.accept());
        const planck = await app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 2, exp: 'planck', stage: 99 });
        const rocket = await app.post({ action: 'createClass', ban: 3, mode: 'team', nTeams: 4, exp: 'rocket', setup: { targetTime: 15 } });
        for (const [i, n] of ['별빛가족', '달님탐험대', '로켓왕'].entries()) await app.post({ action: 'teamJoin', 'class': rocket.classCode, name: n, device: 'd' + i }, { uid: 'fam' + i });
        await T.goto(ORIGIN + '/projects/class-teacher.html'); await T.click('#btnLogin'); await T.waitForSelector('#btnSettings:not([hidden])');
        const open = async (c, w, h) => {
            await T.setViewportSize({ width: w, height: h });
            await T.goto(ORIGIN + '/projects/class-teacher.html#class=' + c.space); await T.reload();
            await T.waitForSelector('#classOut:not([hidden])'); await T.waitForSelector('#qr svg');   // QR 그림이 다 그려진 뒤에 잼
            await T.waitForTimeout(300);
        };
        const frame = () => T.frames().find(f => /present=1/.test(f.url()));
        // 함께 보는 화면에서 보이면 안 되는 교사용 글
        const teacherText = () => T.evaluate(() => {
            const vis = el => el.checkVisibility ? el.checkVisibility() : !!el.offsetParent;
            const bad = [];
            document.querySelectorAll('#outLink, #outExpire, #btnCopy, #ctpCsv, #teamSetupEdit, #pHint').forEach(el => { if (vis(el)) bad.push(el.id); });
            [...document.querySelectorAll('#viewClass p, #viewClass li, #viewClass span')].forEach(el => { if (vis(el) && /지워져요|2일까지|https?:\/\//.test(el.textContent) && !el.querySelector('p, li')) bad.push(el.textContent.trim().slice(0, 30)); });
            return bad;
        });
        const table = [];
        for (const [name, w, h] of SIZES) {
            const row = { 화면: name };
            // ③ 큰 QR 화면
            await open(planck, w, h);
            const q = await T.evaluate(() => {
                const r = id => document.getElementById(id).getBoundingClientRect(), fs = el => parseFloat(getComputedStyle(el).fontSize);
                const st = document.querySelector('.ct-joinsteps');
                return { qr: r('qr').height, qrB: r('qr').bottom, codeB: r('outCode').bottom, code: fs(document.getElementById('outCode')), stepsB: st.getBoundingClientRect().bottom, steps: fs(st), text: st.textContent, nextB: r('btnToRun').bottom, sx: document.documentElement.scrollWidth - innerWidth };
            });
            for (const k of ['qrB', 'codeB', 'stepsB', 'nextB']) assert.ok(q[k] <= h + 1, name + ' 큰 QR 화면 한 화면에: ' + k + ' ' + q[k] + ' > ' + h);
            assert.match(q.text, /aks-sci-lab\.web\.app[\s\S]*학생[\s\S]*수업 코드/, '노트북 접속 방법');
            assert.ok(q.code / h >= 0.08, name + ' 수업 코드 글자 ' + (q.code / h * 100).toFixed(1) + '%');
            assert.ok(q.steps / h >= 0.025, name + ' 접속 방법 글자');
            assert.ok(q.qr / h >= 0.45, name + ' QR 한 변 ' + (q.qr / h * 100).toFixed(1) + '%');
            assert.equal(q.sx, 0);
            assert.deepEqual(await teacherText(), [], name + ' 큰 QR 화면의 교사용 글');
            row['QR'] = (q.qr / h * 100).toFixed(1) + '%'; row['수업 코드'] = (q.code / h * 100).toFixed(1) + '%'; row['접속 방법'] = (q.steps / h * 100).toFixed(1) + '%';
            // 진행 화면
            await T.click('#btnToRun'); await T.waitForFunction(() => !document.getElementById('runPane').hidden || !document.getElementById('presentPane').hidden); if (await T.isVisible('#btnPExit')) { await T.click('#btnPExit'); await T.click('#btnRunPopGo'); } await T.waitForSelector('#runPane:not([hidden])'); await T.waitForSelector('#runPane:not([hidden])'); await T.waitForTimeout(300);
            const run = await T.evaluate(() => ({ w: document.getElementById('stageCard').getBoundingClientRect().width, note: parseFloat(getComputedStyle(document.querySelector('#stageCard .note')).fontSize), now: parseFloat(getComputedStyle(document.getElementById('stageNow')).fontSize), sx: document.documentElement.scrollWidth - innerWidth }));
            assert.ok(run.w / w >= 0.7, name + ' 진행 화면 내용 폭 ' + (run.w / w * 100).toFixed(1) + '%');
            assert.ok(run.note / h >= 0.017, name + ' 진행 화면 보통 글자');
            assert.equal(run.sx, 0);
            assert.deepEqual(await teacherText(), [], name + ' 진행 화면의 교사용 글');
            row['진행 폭'] = (run.w / w * 100).toFixed(1) + '%'; row['진행 글자'] = (run.note / h * 100).toFixed(1) + '%';
            // ① 발표 보기
            await T.click('#btnPresent'); await T.waitForSelector('#presentPane:not([hidden])');
            await T.waitForFunction(() => { const d = document.getElementById('presentFrame').contentDocument; return d && d.querySelector('nav.steps button[aria-selected="true"]'); }, null, { timeout: 15000 });
            await T.waitForTimeout(300);
            const p = await frame().evaluate(() => {
                const m = {}; const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
                while ((t = wk.nextNode())) { const s = t.nodeValue.trim(), el = t.parentElement; if (!s || !el || !el.checkVisibility()) continue; const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue; const f = Math.round(parseFloat(getComputedStyle(el).fontSize) * (el.currentCSSZoom || 1)); m[f] = (m[f] || 0) + s.length; }
                const z = parseFloat(document.documentElement.style.zoom) || 1, pn = document.querySelector('.step-panel:not([hidden])');
                return { main: Number(Object.keys(m).sort((a, b) => m[b] - m[a])[0]), fill: pn.getBoundingClientRect().width / innerWidth, h1: document.querySelector('h1').checkVisibility(), z };
            });
            const fb = await T.evaluate(() => document.getElementById('presentFrame').getBoundingClientRect());
            assert.ok(p.main / h >= 0.025, name + ' 발표 본문 글자 ' + (p.main / h * 100).toFixed(2) + '%');
            assert.ok(p.main / h <= 0.06, name + ' 발표 글자가 지나치게 크지 않음');
            assert.ok(p.fill >= 0.85, name + ' 내용이 틀을 가로로 채움 ' + (p.fill * 100).toFixed(0) + '%');
            assert.equal(p.h1, false, '발표용은 페이지 제목 숨김');
            assert.ok(fb.bottom <= h + 1 && fb.height / h >= 0.75, name + ' 틀이 화면 안에서 크게 ' + Math.round(fb.height) + '/' + h);
            assert.deepEqual(await teacherText(), [], name + ' 발표 화면의 교사용 글');
            row['발표 본문'] = (p.main / h * 100).toFixed(1) + '%'; row['발표 배율'] = p.z;
            // ⑦ Alt+B: 발표용 배율 1.25 배, 틀은 화면 안
            await T.keyboard.press('Alt+b');
            await T.waitForFunction(z => (parseFloat(document.getElementById('presentFrame').contentDocument.documentElement.style.zoom) || 1) > z, p.z, { timeout: 5000 }).catch(() => {});
            const zb = await frame().evaluate(() => parseFloat(document.documentElement.style.zoom) || 1);
            const fb2 = await T.evaluate(() => { const r = document.getElementById('presentFrame').getBoundingClientRect(); return { b: r.bottom, sx: document.documentElement.scrollWidth - innerWidth }; });
            assert.ok(zb > p.z && zb <= p.z * 1.3, name + ' Alt+B 발표 배율 ' + p.z + ' → ' + zb);
            assert.ok(fb2.b <= h + 1 && fb2.sx === 0, name + ' Alt+B 뒤에도 화면 안');
            await T.keyboard.press('Alt+b'); await T.waitForTimeout(200);
            await T.click('#btnPExit'); await T.click('#btnRunPopGo');
            table.push(row);
        }

        // ② 긴 단계에서 → 는 먼저 내림, 끝에서 다음 작은 탭 (1920×1080 = 4K 200 %)
        await open(planck, 1920, 1080);
        await T.click('#btnToRun'); await T.waitForFunction(() => !document.getElementById('runPane').hidden || !document.getElementById('presentPane').hidden); if (await T.isVisible('#btnPExit')) { await T.click('#btnPExit'); await T.click('#btnRunPopGo'); } await T.waitForSelector('#runPane:not([hidden])'); await T.click('#btnPresent');
        await T.waitForFunction(() => { const d = document.getElementById('presentFrame').contentDocument; return d && d.querySelector('nav.steps button[data-step="materials"]'); }, null, { timeout: 15000 });
        await frame().click('nav.steps button[data-step="materials"]');
        await T.waitForTimeout(300);
        const state = () => frame().evaluate(() => { const s = [...document.querySelectorAll('nav.subtabs')].find(n => n.checkVisibility()); const b = s && s.querySelector('button[aria-selected="true"]'); const st = document.querySelector('nav.steps button[aria-selected="true"]'); return { y: Math.round(scrollY), tab: b ? b.textContent.trim() : '', step: st ? st.dataset.step : '', tall: document.documentElement.scrollHeight > innerHeight + 10 }; });
        await T.focus('#btnPNext'); await T.evaluate(() => document.activeElement.blur());
        const s0 = await state();
        assert.ok(s0.tall, '3 준비물 첫 탭이 한 화면보다 김 (글자를 키운 결과)');
        const seq = [s0];
        for (let i = 0; i < 30; i++) { await T.keyboard.press('ArrowRight'); await T.waitForTimeout(120); const s = await state(); seq.push(s); if (s.tab !== s0.tab || s.step !== s0.step) break; }
        const firstChange = seq.findIndex(s => s.tab !== s0.tab || s.step !== s0.step);
        assert.ok(firstChange > 1, '탭이 바뀌기 전에 먼저 내려감: ' + JSON.stringify(seq.slice(0, 4)));
        assert.ok(seq[1].y > s0.y, '첫 → 는 아래로');
        assert.equal(seq[firstChange].y, 0, '다음 탭은 맨 위부터');
        await T.keyboard.press('ArrowDown');   // (아무 일 없음)
        await T.keyboard.press('ArrowLeft'); await T.waitForTimeout(150);
        const back = await state();
        assert.ok(back.tab === s0.tab || back.y > 0 || back.step !== seq[firstChange].step || back.tab !== seq[firstChange].tab, '← 는 반대로');
        await T.click('#btnPExit'); await T.click('#btnRunPopGo');

        // ④ 결과판 크게 보기 · ⑥ 로켓 폰 틀
        for (const [name, w, h] of [SIZES[0], SIZES[2], SIZES[3]]) {
            await open(rocket, w, h);
            await T.click('#btnToRun'); await T.waitForFunction(() => !document.getElementById('runPane').hidden || !document.getElementById('presentPane').hidden); if (await T.isVisible('#btnPExit')) { await T.click('#btnPExit'); await T.click('#btnRunPopGo'); } await T.waitForSelector('#runPane:not([hidden])'); await T.waitForSelector('#boardCard:not([hidden])');
            assert.deepEqual(await teacherText(), [], name + ' 로켓 진행 화면의 교사용 글');
            await T.click('#btnBoardBig'); await T.waitForSelector('#boardBig:not([hidden])');
            const bf = await T.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#boardBigBody td')).fontSize));
            assert.ok(bf / h >= 0.03, name + ' 결과판 글자 ' + (bf / h * 100).toFixed(1) + '%');
            await T.click('#btnBoardClose');
            await T.click('#btnPresent'); await T.waitForSelector('#presentPane.phone:not([hidden])');
            await T.waitForFunction(() => { const d = document.getElementById('presentFrame').contentDocument; return d && d.getElementById('ev-app') && d.getElementById('ev-app').getAttribute('data-screen'); }, null, { timeout: 15000 });
            await T.waitForTimeout(300);
            const pf = await T.evaluate(() => document.getElementById('presentFrame').getBoundingClientRect());
            assert.ok(pf.height / h >= 0.8 && pf.bottom <= h + 1, name + ' 폰 틀이 화면 높이에 맞음 ' + Math.round(pf.height) + '/' + h);
            const rz = await frame().evaluate(() => ({ z: parseFloat(document.documentElement.style.zoom) || 1, sx: document.documentElement.scrollWidth - innerWidth }));
            assert.equal(rz.sx, 0, '로켓 화면 가로 스크롤 없음');
            if (h >= 1080) assert.ok(rz.z > 1, name + ' 로켓 화면도 틀에 맞춰 커짐');
            await T.click('#btnPExit'); await T.click('#btnRunPopGo');
        }

        // ⑧ 교사 화면 375px
        await open(planck, 375, 800);
        assert.equal(await T.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375 큰 QR 화면');
        await T.click('#btnToRun'); await T.waitForFunction(() => !document.getElementById('runPane').hidden || !document.getElementById('presentPane').hidden); if (await T.isVisible('#btnPExit')) { await T.click('#btnPExit'); await T.click('#btnRunPopGo'); } await T.waitForSelector('#runPane:not([hidden])'); await T.waitForTimeout(300);
        assert.equal(await T.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375 진행 화면');
        console.log(table.map(r => Object.entries(r).map(([k, v]) => k + ' ' + v).join(' · ')).join('\n'));
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
});
