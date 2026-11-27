// 열평형 합동 가상 수업 — 공통 도우미 (교사·학생 세션이 함께 씀). 제품 코드는 고치지 않는다.
//   const VC = require('./lib.cjs'); const S = await VC.start({ dir: '<작업 폴더>', role: 'teacher' | 'student' });
//   const T = await S.teacher({ width: 3840, height: 2160 }, 1)   // 교사 화면 (마지막 값 = 배율: 1 / 1.5 / 2)
//   const L = await S.laptop('1조', 1366)                         // 조 노트북 (1366×768 또는 1280×800)
//   const P = await S.phone('5조-폰')                              // iPhone 13 (Pixel 7 은 S.phone(이름, 'Pixel 7'))
//   await S.look(P, '이름') → [주소, 그림 경로, 보이는 글]           // 사람처럼: 찍고 보이는 글만 읽기
//   S.out('메모') / S.in('<파일>')                                  // 차례마다 바뀐 저장소 문서만 묶어 주고받기
// 수업 상태(가짜 저장소 문서)는 작업 폴더/state.json 에 걸음마다 저장 → 서버를 다시 켜도 이어짐.
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const REPO = process.env.VC_REPO || path.join(__dirname, '..', '..', '..');
const { loadLabStore, labServer, configJs } = require(path.join(REPO, 'tests', 'fake-lab-store.cjs'));
const { chromium, devices } = require('playwright');

// 그래프·QR 라이브러리: CDN 이 막혀 있어 이 컴퓨터에 받아 둔 것을 씀(없으면 빈 그림 — 그래프 판정은 '기록 못 함').
//   mkdir -p /home/user/vc-modules && cd /home/user/vc-modules && npm init -y >/dev/null && npm i chart.js@4.4.1 qrcode-generator@1.4.4
const MOD = process.env.VC_MODULES || '/home/user/vc-modules';
const readMod = rel => { try { return fs.readFileSync(path.join(MOD, 'node_modules', rel), 'utf8'); } catch (e) { return null; } };
const QR_LIB = readMod('qrcode-generator/qrcode.js');
const CHART_LIB = readMod('chart.js/dist/chart.umd.js') || readMod('chart.js/dist/chart.umd.min.js');
const QR_STUB = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"},createImgTag(){return ""},getModuleCount(){return 1},isDark(){return true}}};';
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = (cfg && cfg.options) || { scales: { y: { title: {} } } }; } update() {} destroy() {} resize() {} };';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.wasm': 'application/wasm', '.task': 'application/octet-stream' };
const TEACHER = { uid: 'teacher-1', google: true, teacher: true };
const enc = v => v instanceof Date ? { $date: v.toISOString() } : Array.isArray(v) ? v.map(enc) : v && typeof v === 'object' ? Object.keys(v).reduce((o, k) => { o[k] = enc(v[k]); return o; }, {}) : v;
const dec = v => Array.isArray(v) ? v.map(dec) : v && typeof v === 'object' ? (typeof v.$date === 'string' && Object.keys(v).length === 1 ? new Date(v.$date) : Object.keys(v).reduce((o, k) => { o[k] = dec(v[k]); return o; }, {})) : v;

async function start(opts) {
    opts = opts || {};
    const dir = opts.dir || path.join(process.cwd(), 'vc-thermal'); fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
    const role = opts.role || 'teacher';
    const app = loadLabStore(), api = labServer(app), docs = app.db.docs;
    const stat = http.createServer((req, res) => {
        let p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (p.endsWith(path.sep) || p === REPO) p = path.join(p, 'index.html');
        fs.readFile(p, (e, d) => {
            if (e) { res.writeHead(404); return res.end(); }
            const t = TYPES[path.extname(p)] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': t + (/text|json|javascript/.test(t) ? '; charset=utf-8' : '') }); res.end(d);
        });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch();
    const log = [], pages = {};
    let n = 0, sent = {}, turn = 0;
    const snap = () => { const o = {}; docs.forEach((d, p) => { o[p] = JSON.stringify(enc(d)); }); return o; };

    async function open(name, ctxOpt, asTeacher) {
        const c = await browser.newContext(Object.assign({ acceptDownloads: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul' }, ctxOpt));
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? (QR_LIB || QR_STUB) : /chart/i.test(u) ? (CHART_LIB || CHART_STUB) : '' }); });
        await c.route(/gstatic|accounts\.google|firestore\.googleapis|identitytoolkit|securetoken/, r => r.abort());
        if (asTeacher) await c.addInitScript(u => { try { localStorage.setItem('lab-store:fake-user', u); } catch (e) { /* 무시 */ } }, JSON.stringify(TEACHER));
        const pg = await c.newPage();
        pg.vcName = name;
        pg.on('pageerror', e => log.push({ who: name, kind: 'pageerror', text: e.message }));
        pg.on('console', m => { if (m.type() === 'error') log.push({ who: name, kind: 'console', text: m.text().slice(0, 300) }); });
        pg.on('dialog', d => { log.push({ who: name, kind: 'dialog:' + d.type(), text: d.message() }); d.accept().catch(() => {}); });
        pages[name] = pg;
        return pg;
    }

    const S = {
        app, API, ROOT, browser, log, pages, dir, role, devices,
        DATA: path.join(__dirname, 'data'),
        local: href => String(href).replace(/^https?:\/\/[^/]+\//, ROOT),
        // 교사 화면: 배율(zoom) 1·1.5·2 는 deviceScaleFactor 가 아니라 CSS 픽셀 폭을 나눠 흉내 냄 (3840×2160 을 150 % 로 = 2560×1440)
        teacher: (vp, zoom, name) => { vp = vp || { width: 3840, height: 2160 }; const z = zoom || 1;
            return open(name || 'T', { viewport: { width: Math.round(vp.width / z), height: Math.round(vp.height / z) }, deviceScaleFactor: 1 }, true); },
        laptop: (name, w) => open(name, { viewport: w === 1280 ? { width: 1280, height: 800 } : { width: 1366, height: 768 } }),
        phone: (name, dev) => open(name, devices[dev || 'iPhone 13']),
        async shot(pg, label, full) {
            const f = path.join(dir, 'shots', String(++n).padStart(3, '0') + '-' + (pg.vcName || 'x') + '-' + String(label).replace(/[^\w가-힣.-]+/g, '_') + '.png');
            await pg.screenshot({ path: f, fullPage: !!full }); return f;
        },
        seen: pg => pg.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').trim()),
        async look(pg, label) { return [pg.url().replace(ROOT, ''), await S.shot(pg, label), (await S.seen(pg)).slice(0, 4000)]; },
        // 사람처럼: 보이는 단추·링크 가운데 그 글이 있는 것을 누름
        async tap(pg, text, nth) {
            const l = pg.locator('button:visible, a:visible, summary:visible, label:visible, [role=button]:visible, [role=tab]:visible').filter({ hasText: text });
            const k = nth === 'last' ? l.last() : l.nth(nth || 0);
            await k.scrollIntoViewIfNeeded(); await k.click({ timeout: 8000 }); await pg.waitForTimeout(600);
        },
        // 가로 스크롤 생김 여부 (375px 판정)
        hscroll: pg => pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        // 화면에 보이는 가장 작은 글자 크기 (4K 판정: 화면 높이 2 % 아래면 '안 읽힘'으로 셈)
        minFont: pg => pg.evaluate(() => { let min = 999, at = ''; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
            while ((t = w.nextNode())) { const s = t.nodeValue.trim(); const p = t.parentElement; if (!s || !p || !p.offsetParent) continue; const r = p.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || r.width === 0) continue;
                const f = parseFloat(getComputedStyle(p).fontSize); if (f < min) { min = f; at = s.slice(0, 30); } }
            return { min, at, h: innerHeight, ratio: +(min / innerHeight * 100).toFixed(2) }; }),
        // 학생: 짠 CSV 를 '센서로 잰 회차'처럼 넣기 — ① 5-1 칸을 짠 값의 form 대로 채우고 ② 📂 CSV 회차 불러오기
        async importRun(pg, file) {
            const meta = JSON.parse(fs.readFileSync(path.join(S.DATA, 'runs.json'), 'utf8')).find(r => r.file === file);
            if (!meta) throw new Error('data/runs.json 에 없는 파일: ' + file);
            await S.fillForm(pg, meta.form);
            // 한글 파일 경로는 이 Playwright 에서 조용히 안 올라가서(files 0개) 내용 + 이름으로 올림 (회차 이름 = 파일 이름)
            const [chooser] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#btnImportCsv')]);
            await chooser.setFiles({ name: file, mimeType: 'text/csv', buffer: fs.readFileSync(path.join(S.DATA, file)) }); await pg.waitForTimeout(800);
            return pg.textContent('#liveMsg');
        },
        async fillForm(pg, f) {
            const set = async (id, v) => { if (v == null) return; const el = await pg.$('#' + id); if (!el) return;
                if ((await el.evaluate(e => e.tagName)) === 'SELECT') await pg.selectOption('#' + id, String(v)); else await pg.fill('#' + id, String(v)); };
            await set('inM1', f.m1); await set('inM2', f.m2); await set('inLiq1', f.liquid1); await set('inLiq2', f.liquid2); await set('inVessel', f.vessel);
            if (f.beakerMat || f.cup1Mass != null || f.roomT != null) {
                await pg.evaluate(() => { const d = [...document.querySelectorAll('details')].find(x => /열용량 보정 값/.test(x.textContent)); if (d) d.open = true; });
                await set('inRoomT', f.roomT); await set('inBeakerMat', f.beakerMat); await set('inCup1Mass', f.cup1Mass); await set('inCup2Mass', f.cup2Mass);
            }
        },
        // ── 차례 주고받기 (두 세션은 다른 컴퓨터) ──
        // 묶음 모양: { v:1, from, turn, note, set: { <문서 경로>: 내용 }, del: [경로] }  날짜는 { "$date": ISO }
        out(note) {
            const now = snap(), set = {}, del = [];
            for (const p of Object.keys(now)) if (now[p] !== sent[p]) set[p] = JSON.parse(now[p]);
            for (const p of Object.keys(sent)) if (!(p in now)) del.push(p);
            sent = now; turn++;
            const b = { v: 1, from: role, turn, note: note || '', set, del }, txt = JSON.stringify(b);
            const f = path.join(dir, 'out-' + role + '-' + turn + '.json'); fs.writeFileSync(f, txt); S.save();
            return { file: f, bytes: Buffer.byteLength(txt), paths: Object.keys(set), del };
        },
        in(src) {
            const b = typeof src === 'string' ? JSON.parse(fs.existsSync(src) ? fs.readFileSync(src, 'utf8') : src) : src, got = [];
            for (const p of Object.keys(b.set || {})) { docs.set(p, dec(b.set[p])); got.push(p); }
            for (const p of b.del || []) docs.delete(p);
            sent = snap(); S.save();   // 받은 것은 다시 내보내지 않음
            return { from: b.from, turn: b.turn, set: got.length, del: (b.del || []).length, paths: got };
        },
        all() { const set = {}; docs.forEach((d, p) => { set[p] = enc(d); }); return set; },
        save() { fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ docs: S.all(), sent, turn, urls: Object.keys(pages).reduce((o, k) => { o[k] = pages[k].url().replace(ROOT, ''); return o; }, {}) })); },
        restore() {
            const f = path.join(dir, 'state.json'); if (!fs.existsSync(f)) return null;
            const st = JSON.parse(fs.readFileSync(f, 'utf8'));
            for (const p of Object.keys(st.docs || {})) docs.set(p, dec(st.docs[p])); sent = st.sent || {}; turn = st.turn || 0;
            return st;
        },
        async close() { await browser.close(); api.close(); stat.close(); }
    };
    return S;
}
module.exports = { start, TEACHER, REPO };
