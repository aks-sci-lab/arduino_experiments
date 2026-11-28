// 필름통 로켓 합동 가상 수업 5차 — 공통 도우미 (교사·학생 세션이 함께 씀). 제품 코드는 고치지 않는다.
//   열평형 도구(tools/virtual-class/thermal/lib.cjs, 브랜치 claude/virtual-class-thermal-scenario)를 로켓에 맞게 고친 것.
//   const VC = require('./lib.cjs'); const S = await VC.start({ dir: '<작업 폴더>', role: 'teacher' | 'student' });
//   const T = await S.teacher({ width: 3840, height: 2160 }, 1)   // 교사 화면 (마지막 값 = 배율: 1 / 1.5 / 2)
//   const P = await S.phone('A', 'iPhone 13')                       // 팀 폰 (가짜 카메라 켜짐, Pixel 7 도 됨)
//   await S.look(P, '이름') -> [주소, 그림 경로, 보이는 글]           // 사람처럼: 찍고 보이는 글만 읽기
//   await S.scr(P) -> { 화면, 글, 단추 }                              // 폰 화면 id(#ev-app data-screen)·보이는 글·누를 수 있는 단추
//   S.out('메모') / S.in('<파일>')                                  // 차례마다 바뀐 저장소 문서만 묶어 주고받기
// 수업 상태(가짜 저장소 문서)는 작업 폴더/state.json 에 걸음마다 저장 -> 서버를 다시 켜도 이어짐.
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const REPO = process.env.VC_REPO || path.join(__dirname, '..', '..', '..');
const { loadLabStore, labServer, configJs } = require(path.join(REPO, 'tests', 'fake-lab-store.cjs'));
const { chromium, devices } = require('playwright');

// 그래프·QR 라이브러리: CDN 이 막혀 있어 이 컴퓨터에 받아 둔 것을 씀(없으면 빈 그림 — 그래프 판정은 '기록 못 함').
//   mkdir -p /home/user/vc-modules && cd /home/user/vc-modules && npm init -y >/dev/null && npm i qrcode-generator@1.4.4   (없으면 QR 은 회색 네모)
const MOD = process.env.VC_MODULES || '/home/user/vc-modules';
const readMod = rel => { try { return fs.readFileSync(path.join(MOD, 'node_modules', rel), 'utf8'); } catch (e) { return null; } };
const QR_LIB = readMod('qrcode-generator/qrcode.js');
const CHART_LIB = null;   // 로켓은 그래프를 쓰지 않음 (2026-11-23 '그래프 빼기')
const QR_STUB = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"},createImgTag(){return ""},getModuleCount(){return 1},isDark(){return true}}};';
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = (cfg && cfg.options) || { scales: { y: { title: {} } } }; } update() {} destroy() {} resize() {} };';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.wasm': 'application/wasm', '.task': 'application/octet-stream' };
const TEACHER = { uid: 'teacher-1', google: true, teacher: true };
const enc = v => v instanceof Date ? { $date: v.toISOString() } : Array.isArray(v) ? v.map(enc) : v && typeof v === 'object' ? Object.keys(v).reduce((o, k) => { o[k] = enc(v[k]); return o; }, {}) : v;
const dec = v => Array.isArray(v) ? v.map(dec) : v && typeof v === 'object' ? (typeof v.$date === 'string' && Object.keys(v).length === 1 ? new Date(v.$date) : Object.keys(v).reduce((o, k) => { o[k] = dec(v[k]); return o; }, {})) : v;

async function start(opts) {
    opts = opts || {};
    const dir = opts.dir || path.join(process.cwd(), 'vc-rocket5'); fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
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
    // 가짜 카메라: 폰 녹화(MediaRecorder)·장면 고르기·세 곳 누르기가 되게 (얼굴 가리기 MediaPipe 는 CDN 이 막혀 못 씀 -> 도전 사진·영상은 안 감)
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    const log = [], pages = {};
    let n = 0, sent = {}, turn = 0;
    const snap = () => { const o = {}; docs.forEach((d, p) => { o[p] = JSON.stringify(enc(d)); }); return o; };

    async function open(name, ctxOpt, asTeacher) {
        const c = await browser.newContext(Object.assign({ acceptDownloads: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul', permissions: ['camera'] }, ctxOpt));
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
        local: href => String(href).replace(/^https?:\/\/[^/]+\//, ROOT),
        // 교사 화면: 배율(zoom) 1·1.5·2 는 deviceScaleFactor 가 아니라 CSS 픽셀 폭을 나눠 흉내 냄 (3840×2160 을 150 % 로 = 2560×1440)
        teacher: (vp, zoom, name) => { vp = vp || { width: 3840, height: 2160 }; const z = zoom || 1;
            return open(name || 'T', { viewport: { width: Math.round(vp.width / z), height: Math.round(vp.height / z) }, deviceScaleFactor: 1 }, true); },
        // 팀 폰. VC_DSF1=1 이면 화면 크기·터치는 그대로 두고 deviceScaleFactor 1 (6차: 스크린샷을 작게)
        phone: (name, dev) => open(name, Object.assign({}, devices[dev || 'iPhone 13'], process.env.VC_DSF1 ? { deviceScaleFactor: 1 } : {})),
        // 기록용 스크린샷 (6차): JPEG 품질 70, 보이는 화면만, 폴더가 없으면 만듦 → 파일 경로와 크기(KB)
        async snap(pg, file, quality) {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            await pg.screenshot({ path: file, type: 'jpeg', quality: quality || 70 });
            return { file, kb: Math.round(fs.statSync(file).size / 1024) };
        },
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
            while ((t = w.nextNode())) { const s = t.nodeValue.trim(); const p = t.parentElement; if (!s || !p || !p.offsetParent || p.closest('summary') || p.closest('details:not([open])')) continue;   // '🔧 선생님용' 접힌 표지는 뺌 const r = p.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || r.width === 0) continue;
                const f = parseFloat(getComputedStyle(p).fontSize); if (f < min) { min = f; at = s.slice(0, 30); } }
            return { min, at, h: innerHeight, ratio: +(min / innerHeight * 100).toFixed(2) }; }),
        // ── 로켓 팀 폰 ──
        // 폰 화면 하나를 사람이 보는 대로: 화면 id · 보이는 글('선생님 연결' 줄 빼고) · 누를 수 있는 단추 글 (꺼진 단추는 '(꺼짐)')
        async scr(pg, n) {
            const id = await S.screen(pg).catch(() => '');
            const txt = (await S.seen(pg)).split('\n').filter(l => !/선생님 연결 · 도움말/.test(l)).join(' / ');
            const btn = await pg.$$eval('button, [role=button]', bs => bs.filter(b => b.offsetParent).map(b => (b.disabled ? '(꺼짐) ' : '') + b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
            return { 화면: id, 글: txt.slice(0, n || 700), 단추: btn };
        },
        screen: pg => pg.evaluate(() => { const a = document.getElementById('ev-app'); return a ? a.getAttribute('data-screen') || '' : ''; }),
        waitScreen: (pg, id, t) => pg.waitForSelector('#ev-app[data-screen="' + id + '"]', { timeout: t || 15000 }),
        // 팀 이름으로 입장 (수업 주소로 연 폰)
        async enter(pg, link, name) {
            await pg.goto(S.local(link)); await pg.waitForSelector('#ev-name', { timeout: 15000 });
            await pg.fill('#ev-name', name); await pg.click('#ev-start'); await pg.waitForTimeout(1500);
            return S.scr(pg, 400);
        },
        // 고르기 단추(.ev-choice)를 보이는 글로 누름 — 처음 생각·퀴즈·바꿀 것·예측·결과 모두
        async pick(pg, text) {
            const l = pg.locator('.ev-choice:visible').filter({ hasText: text });
            if (!(await l.count())) throw new Error('고르기 없음: ' + text);
            await l.first().click(); await pg.waitForTimeout(500);
        },
        // 계획 화면 ① → ② : 슬롯(0 = ①, 1 = ②)의 +/− 를 n 번 (음수면 −)
        async planStep(pg, slot, n) {
            const b = pg.locator('[data-plan-slot="' + slot + '"] [data-pm="' + (n < 0 ? -1 : 1) + '"]');
            for (let i = 0; i < Math.abs(n); i++) { await b.click(); await pg.waitForTimeout(150); }
            return pg.textContent('[data-plan-slot="' + slot + '"] .ev-sval');
        },
        // 조건 화면의 바꿀 것 +/− 를 n 번
        async condStep(pg, n) {
            const b = pg.locator('.ev-stepper:not(.locked) [data-pm="' + (n < 0 ? -1 : 1) + '"]').first();
            for (let i = 0; i < Math.abs(n); i++) { await b.click(); await pg.waitForTimeout(150); }
            return pg.textContent('.ev-stepper:not(.locked) .ev-sval');
        },
        // 화면의 초록 '다음' 단추(.ev-next.good, 켜진 것) 첫째를 누름 — 사람이 '다음으로'를 누르는 것
        async forward(pg) {
            const b = pg.locator('.ev-screen .ev-next.good:visible:not([disabled])').first();
            if (!(await b.count())) return null;
            const t = (await b.textContent()).trim(); await b.click(); await pg.waitForTimeout(700); return t;
        },
        // 안전 확인 네 칸 모두 체크
        async safe(pg) { for (const c of await pg.$$('[data-safe]')) if (!(await c.isChecked())) await c.check(); await pg.waitForTimeout(300); },
        // ⏱ 1차시 한 번: 실제로 sec 초 기다렸다 '펑' → 손이 늦은 만큼 −/+ 로 sec 에 맞춤 → 기록
        async stopwatch(pg, sec) {
            if (await pg.isVisible('#ev-m-sw')) { await pg.click('#ev-m-sw'); await pg.waitForTimeout(300); }
            await pg.click('#ev-sw1'); await pg.waitForTimeout(Math.max(200, sec * 1000 - 150)); await pg.click('#ev-sw2'); await pg.waitForTimeout(300);
            for (let k = 0; k < 40; k++) {
                const v = parseFloat(await pg.textContent('#ev-swv')), d = Math.round((sec - v) * 10);
                if (!d) break;
                await pg.click('#ev-sw-adj [data-pm="' + (d > 0 ? 1 : -1) + '"]');
            }
            await pg.click('#ev-sw3'); await pg.waitForTimeout(800);
            return S.scr(pg, 600);
        },
        // 🎥 2차시 한 발: (촬영 안내면 영상으로) 녹화 → 끝 → '가장 높은 장면' → 발끝·정수리·로켓 꼭대기 → 아이 키의 pct %
        async launch(pg, pct) {
            if ((await S.screen(pg)) === 't2-film') { await pg.locator('.ev-choice[data-go="t2-measure"]').click(); await pg.waitForTimeout(800); }
            if (!(await pg.isVisible('#ev-r3'))) {   // 이미 녹화 중(● 녹화 시작을 눌러 둔 채)이면 이어서 끝냄
                await pg.waitForSelector('#ev-r1:visible', { timeout: 15000 });
                await pg.waitForTimeout(800); await pg.click('#ev-r1'); await pg.waitForTimeout(2200);
            }
            await pg.click('#ev-r3');
            await pg.waitForSelector('#ev-pick:visible', { timeout: 20000 }); await pg.waitForTimeout(800); await pg.click('#ev-pick');
            const c = pg.locator('#ev-mark'); await c.waitFor({ timeout: 10000 }); await pg.waitForTimeout(400);
            const bb = await c.boundingBox(), foot = bb.height * 0.92, head = bb.height * 0.52, top = foot - (foot - head) * pct / 100;
            for (const y of [foot, head, Math.max(3, top)]) { await c.click({ position: { x: bb.width * 0.5, y } }); await pg.waitForTimeout(300); }
            // 손가락이 1~2 % 빗나가면 '↶ 하나 지우기' 뒤 로켓 꼭대기만 다시 (사람도 그렇게 고침)
            for (let k = 0, y = top; k < 4; k++) {
                const m = /키의\s*(\d+)%/.exec(await pg.textContent('#ev-mk-out')); if (!m || Number(m[1]) === pct) break;
                y -= (pct - Number(m[1])) * (foot - head) / 100; await pg.click('#ev-mk-undo'); await pg.waitForTimeout(200);
                await c.click({ position: { x: bb.width * 0.5, y: Math.max(3, y) } }); await pg.waitForTimeout(300);
            }
            const r = (await pg.textContent('#ev-mk-out')).trim();
            if (await pg.isVisible('#ev-mk-ok')) { await pg.click('#ev-mk-ok'); await pg.waitForTimeout(800); }
            return [r, await S.scr(pg, 600)];
        },
        // 👀 2차시 눈으로 고르기 (high · same · low)
        async hand(pg, k) {
            if ((await S.screen(pg)) === 't2-film') { await pg.locator('.ev-choice[data-go="t2-hand"]').click(); await pg.waitForTimeout(600); }
            await pg.locator('.ev-choice[data-k="' + k + '"]').click(); await pg.waitForTimeout(800); return S.scr(pg, 600);
        },
        // 팀 폰이 저장한 것을 곧바로 보냄 (실제 폰은 몇 초 뒤 저절로 — 차례를 줄이려고)
        sendNow: pg => pg.evaluate(() => window.__filmRocket && window.__filmRocket.sendNow && window.__filmRocket.sendNow()),
        // 와이파이 끊김 흉내 (팀 폰 하나) — on: false 면 끊고, true 면 다시
        net: (pg, on) => pg.context().setOffline(!on),
        // ── 교사 🎬 발표 보기 ──
        title: T => T.evaluate(() => ((document.querySelector('#pSlides .ls-title') || {}).textContent || '').trim()),
        answers: T => T.evaluate(() => ((document.querySelector('#pSlides .ls-answers') || {}).innerText || '').trim()),
        async next(T, n) { for (let i = 0; i < (n || 1); i++) { await T.click('#btnPNext'); await T.waitForTimeout(700); } return S.title(T); },
        // 제목이 re 인 장까지 ▶ (단계 끝 '열까요?' 가 뜨면 멈추고 알려 줌)
        async toSlide(T, re, max) {
            for (let k = 0; k < (max || 25) && !re.test(await S.title(T)); k++) {
                await T.click('#btnPNext'); await T.waitForTimeout(500);
                if (await T.isVisible('#pAsk')) return { ask: (await T.textContent('#pAskText')).trim(), title: await S.title(T) };
            }
            return { title: await S.title(T) };
        },
        // 4K 넘침: 발표 장(.ls-slide)이 자기 칸보다 큰지
        overflow: T => T.evaluate(() => { const s = document.querySelector('#pSlides .ls-slide'); if (!s) return null; return { sh: s.scrollHeight, ch: s.clientHeight, over: s.scrollHeight - s.clientHeight > 2 }; }),
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
