// 가상 수업(학생 쪽) 공통 도우미 — 저장소 파일을 Playwright 로 열고 가짜 저장소(tests/fake-lab-store.cjs)를 쓴다.
//   const W = await startWorld({ shots: '그림 폴더' });
//   const cls = await W.createClass({ exp: 'rocket', mode: 'team', nTeams: 6, ban: 1 });   // 교사 흉내 (수업 만들기, 1단계만 열림)
//   await W.openStage(cls, 2);                                                           // 교사 흉내 (▶ 다음 단계 열기)
//   const S = await W.student('가족A', 'iPhone 13');  await S.goto(W.classUrl(cls));     // 학생 화면 (폰·태블릿·노트북)
//   await W.shot(S, '입장');                                                              // 지금 보이는 화면을 그림으로
// 실제 사이트·실제 Firestore 가 아니다. 카메라는 크롬 가짜 카메라. 그림 파일은 저장소에 넣지 않는다.
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const REPO = path.join(__dirname, '..', '..');
const { loadLabStore, labServer, configJs } = require(path.join(REPO, 'tests', 'fake-lab-store.cjs'));
const { chromium, devices } = require('playwright');

function lib(name) {   // 진짜 Chart.js·QR 도구가 있으면 쓰고(VC_NPM=그 node_modules 가 든 폴더), 없으면 흉내
    for (const base of [REPO, process.env.VC_NPM].filter(Boolean)) { try { return fs.readFileSync(path.join(base, 'node_modules', name), 'utf8'); } catch (e) { /* 다음 */ } }
    return null;
}
const CHART = lib('chart.js/dist/chart.umd.min.js') || 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
if (!lib('chart.js/dist/chart.umd.min.js')) console.error('⚠ 진짜 Chart.js 가 없어 그래프는 빈칸으로 보입니다 (VC_NPM 에 chart.js 를 깔아 주세요)');
const QR = lib('qrcode-generator/qrcode.js') || 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg viewBox=\\"0 0 10 10\\"></svg>"}}};';
const DEVICES = { phone: devices['iPhone 13'], tablet: devices['Galaxy Tab S4'], laptop: { viewport: { width: 1366, height: 768 } }, 'iPhone 13': devices['iPhone 13'], 'Galaxy Tab S4': devices['Galaxy Tab S4'], 'Pixel 7': devices['Pixel 7'] };

async function startWorld(opts) {
    opts = opts || {};
    const shots = opts.shots || path.join(require('node:os').tmpdir(), 'virtual-class-shots');
    fs.mkdirSync(shots, { recursive: true });
    const app = loadLabStore();
    const api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    const W = { app, API, ROOT, browser, shots, pages: {}, errors: [], dialogs: [], offline: {}, log: [], n: 0 };

    // 학생(또는 가족) 한 명의 브라우저. device: 'phone' | 'tablet' | 'laptop' | Playwright 기기 이름
    W.student = async (name, device, extra) => {
        const c = await browser.newContext(Object.assign({ permissions: ['camera'], acceptDownloads: true, locale: 'ko-KR' }, DEVICES[device || 'phone'] || DEVICES.phone, extra || {}));
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART : '' }); });
        await c.route(/gstatic/, r => r.abort());
        await c.route(API + '**', r => (W.offline[name] ? r.abort('internetdisconnected') : r.continue()));   // 인터넷 끊김 흉내: W.offline[name] = true
        const pg = await c.newPage();
        pg.vcName = name;
        pg.on('pageerror', e => W.errors.push(name + ': ' + e.message));
        pg.on('dialog', d => { W.dialogs.push(name + ' [' + d.type() + '] ' + d.message()); d.accept(); });   // 알림 창 글은 기록해 두고 '확인'
        W.pages[name] = pg;
        return pg;
    };
    // 교사 흉내
    W.createClass = async o => { const r = await app.post(Object.assign({ action: 'createClass', ban: 1, stage: 1 }, o)); if (!r.ok) throw new Error(r.error); return r; };
    W.openStage = async (cls, stage) => { const r = await app.post({ action: 'classStage', space: cls.space, stage }); if (!r.ok) throw new Error(r.error); return r; };
    W.classUrl = (cls, page) => ROOT + (page || cls.page || '') + '?c=' + encodeURIComponent(cls.classCode) + '&s=' + cls.space;
    // 지금 보이는 화면(사람 눈) 그림. full: true 면 페이지 전체
    W.shot = async (pg, label, full) => {
        const f = path.join(shots, String(++W.n).padStart(3, '0') + '-' + (pg.vcName || 'x') + '-' + String(label || '').replace(/[^\w가-힣-]+/g, '_') + '.png');
        await pg.screenshot({ path: f, scale: 'css', fullPage: !!full });
        return f;
    };
    // 화면 점검: 가로 스크롤, 작은 단추(min px), 스크롤 길이(화면 몇 장)
    W.check = (pg, min) => pg.evaluate(m => ({
        hscroll: document.documentElement.scrollWidth - innerWidth,
        pages: +(document.documentElement.scrollHeight / innerHeight).toFixed(1),
        small: [...document.querySelectorAll('button, select, a.pick-card, input[type=text], input[type=number]')].filter(e => e.offsetParent && !e.closest('td, th') && e.getBoundingClientRect().height < m - 0.5).map(e => (e.id || e.textContent.trim().slice(0, 16)) + ':' + Math.round(e.getBoundingClientRect().height))
    }), min || 44);
    // 화면에 보이는 글(사람이 읽는 것)
    W.text = pg => pg.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').trim());
    // 사람처럼 누르기: 화면에 보이는 글로 단추·링크·고르기 칸을 찾아 누른다 (코드 속 이름을 쓰지 않음)
    W.tap = async (pg, text, nth, force) => {   // force: 꺼진 것처럼 보이는(잠긴) 단추도 손가락으로는 눌리므로 눌러 봄
        const re = text instanceof RegExp ? text : new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const all = pg.locator('button, a, summary, label, [role=button], [role=tab], .ev-choice, .pick-card').filter({ hasText: re });
        const vis = []; const n = await all.count();
        for (let i = 0; i < n; i++) if (await all.nth(i).isVisible()) vis.push(all.nth(i));
        if (!vis.length) throw new Error('화면에 "' + text + '" 단추가 안 보임 (' + (pg.vcName || '') + ')');
        const el = vis[nth || 0];
        if (force) { await el.click({ force: true }); await pg.waitForTimeout(350); return; }
        if (await el.isDisabled().catch(() => false)) throw new Error('"' + text + '" 단추가 꺼져 있음 (' + (pg.vcName || '') + ')');
        await el.click();
        await pg.waitForTimeout(350);
    };
    // 지금 화면에 보이는 단추 글 목록 (무엇을 누를 수 있는지)
    W.buttons = pg => pg.evaluate(() => [...document.querySelectorAll('button, a, summary, select, input, textarea')].filter(e => e.offsetParent && e.getBoundingClientRect().height > 0).map(e => (e.disabled ? '(꺼짐) ' : '') + (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.tagName === 'SELECT' ? '[' + e.tagName.toLowerCase() + ' ' + (e.placeholder || e.getAttribute('aria-label') || e.type || '') + '=' + String(e.value).slice(0, 20) + ']' : e.textContent.trim().replace(/\s+/g, ' ').slice(0, 30))).filter(Boolean));
    // 화면에 보이는 것만으로 걷기 (대충 하는 사람): '→·다음·시작' 이 있는 켜진 단추가 있으면 그것, 체크 칸은 모두 체크, 없으면 보기를 차례로 눌러 봄. until 단추가 보이면 멈춤
    const NAV = /뒤로|선생님 연결|메인 페이지|생각 열기|1차시|2차시|정리|점$/;
    W.stroll = async (pg, tag, max, pick, until, note) => {
        let last = '', same = 0; const tries = {};
        for (let i = 0; i < max; i++) {
            const txt = (await W.text(pg)).split('\n').filter(l => !/보내는 중|선생님께 보냄|^⭐ \d+점$/.test(l)).slice(5).join(' / ');
            const btns = await pg.evaluate(() => [...document.querySelectorAll('button')].filter(e => e.offsetParent).map(e => ({ t: e.textContent.trim().replace(/\s+/g, ' '), off: e.disabled })));
            same = txt === last ? same + 1 : 0; last = txt;
            if (same > 4) { note(tag + ' 멈춤', '눌러도 화면이 바뀌지 않음'); break; }
            if (!same) { note(tag + ' ' + (i + 1), { 글: txt.slice(0, 700), 단추: btns.filter(b => !NAV.test(b.t)).map(b => (b.off ? '(꺼짐)' : '') + b.t.slice(0, 24)), 화면몇장: (await W.check(pg, 56)).pages }); await W.shot(pg, tag + (i + 1)); }
            if (until && btns.some(b => until.test(b.t))) break;
            const fwd = btns.find(b => !b.off && /→|다음|시작/.test(b.t) && !/뒤로/.test(b.t));
            if (fwd) { await W.tap(pg, fwd.t.slice(0, 12)); continue; }
            const boxes = pg.locator('input[type=checkbox]:not(:checked)').locator('visible=true');   // 체크 칸이 있으면 하나씩 다 누름
            if (await boxes.count()) { while (await boxes.count()) { await boxes.first().click(); await pg.waitForTimeout(150); } continue; }
            const ch = btns.filter(b => !b.off && !NAV.test(b.t));
            if (!ch.length) { note(tag + ' 멈춤', '누를 것이 없음'); break; }
            const key = txt.split(' / ').slice(0, 2).join('|'); tries[key] = (tries[key] || 0) + 1;
            await W.tap(pg, ch[((pick || 0) + tries[key] - 1) % ch.length].t.slice(0, 12));   // 같은 문제면 다음 보기를 눌러 봄
        }
    };
    // 교사 흉내: 보고서 AI 켜 두기 (교사 화면을 하나 열어 가짜 AI 서버로 답하게 함. 진짜 AI·진짜 키는 쓰지 않음)
    //   const desk = await W.aiDesk();  desk.busy = true (한도 오류 429 흉내) / desk.off() / desk.on()
    W.aiDesk = async () => {
        const desk = { busy: false, calls: [] };
        const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' });
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : CHART }));
        await c.route(/gstatic|accounts\.google/, r => r.abort());
        const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
        await c.route(/api\.anthropic\.com/, async route => {
            const req = route.request();
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
            const json = (status, o) => route.fulfill({ status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify(o) });
            if (req.method() === 'GET') return json(200, { data: [{ id: 'claude-sonnet-5-5' }] });
            if (desk.busy) return json(429, { error: { type: 'rate_limit_error', message: 'rate limit' } });
            const body = JSON.parse(req.postData() || '{}'); const user = body.messages && body.messages[0].content || '';
            desk.calls.push({ system: body.system, user });
            const text = /한 단어/.test(body.system || '') ? '준비' : '(가짜 AI 답 ' + desk.calls.length + ') 주장은 분명해요. 그런데 어느 측정값이 그 주장의 근거인가요? 가열 시간이 다른 시료끼리 견준 숫자를 한 문장으로 넣어 보세요. 측정의 한계도 하나 적어 볼까요?';
            return json(200, { content: [{ type: 'text', text }] });
        });
        const T = await c.newPage(); desk.page = T; T.vcName = '교사AI';
        T.on('dialog', d => d.accept());
        await T.goto(ROOT + 'projects/class-teacher.html');
        await T.click('#btnLogin');
        await T.waitForSelector('#btnSettings:not([hidden])'); await T.evaluate(() => { const b = document.getElementById('btnSettings'); if (!b.hidden) b.click(); }); await T.click('#ctTabs button[data-tab="ai"]');
        await T.selectOption('#aiProvider', 'claude'); await T.fill('#aiKey', 'sk-ant-fake-virtual-class'); await T.click('#aiTest');
        await T.waitForFunction(() => /AI 답하기 켜짐/.test(document.getElementById('aiDeskNow').textContent), null, { timeout: 20000 });
        desk.off = () => T.uncheck('#aiOn'); desk.on = () => T.check('#aiOn');
        return desk;
    };
    // 떨어지는 공 가짜 영상(webm) 파일 만들기: 자(세로 막대 0.3 m)와 공이 g 로 떨어짐. 돌려주는 값 = 파일 경로
    W.fallVideo = async (file, secs) => {
        const c = await browser.newContext({ viewport: { width: 400, height: 700 } }); const pg = await c.newPage();
        const b64 = await pg.evaluate(async secs => {
            const cv = document.createElement('canvas'); cv.width = 360; cv.height = 640; document.body.appendChild(cv); const g = cv.getContext('2d');
            const rec = new MediaRecorder(cv.captureStream(30), { mimeType: 'video/webm' }); const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
            const pxPerM = 600, t0 = performance.now();
            const draw = () => { const t = (performance.now() - t0) / 1000; g.fillStyle = '#fff'; g.fillRect(0, 0, 360, 640); g.fillStyle = '#333'; g.fillRect(40, 100, 8, 0.3 * pxPerM); g.fillStyle = '#d00'; g.beginPath(); g.arc(200, 40 + Math.min(580, 0.5 * 9.8 * Math.max(0, t - 0.3) ** 2 * pxPerM), 12, 0, 7); g.fill(); if (t < secs) requestAnimationFrame(draw); else rec.stop(); };
            rec.start(); draw();
            await new Promise(r => { rec.onstop = r; });
            const buf = await new Blob(chunks, { type: 'video/webm' }).arrayBuffer(); let s = ''; new Uint8Array(buf).forEach(x => { s += String.fromCharCode(x); }); return btoa(s);
        }, secs || 1.2);
        fs.writeFileSync(file, Buffer.from(b64, 'base64')); await c.close(); return file;
    };
    W.close = async () => { await browser.close(); api.close(); stat.close(); };
    return W;
}
module.exports = { startWorld, REPO, DEVICES };
