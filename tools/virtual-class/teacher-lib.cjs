// 가상 수업(교사 역할) 공통 도우미 — 저장소 파일을 Playwright 로 열고 가짜 저장소(tests/fake-lab-store.cjs)를 쓴다.
//   const VC = require('./teacher-lib.cjs');
//   const S = await VC.start({ shots: '<그림 둘 폴더>' });
//   const T = await S.teacher({ width: 1280, height: 720 });      // 교사 노트북(프로젝터)
//   const A = await S.phone('가족A');                               // 학생·가족 폰 (iPhone 13)
//   const L = await S.laptop('1조');                                // 조 노트북
//   await S.shot(T, '01-메인');                                     // 화면 찍기 (PNG 경로를 돌려줌)
//   S.local(href)                                                   // 사이트 주소(aks-sci-lab.web.app)를 이 컴퓨터 주소로
// QR·그래프 라이브러리는 CDN 이 막혀 있어 이 컴퓨터에 설치한 것을 넣는다(VC_MODULES 또는 /home/user/vc-modules, 없으면 빈 그림).
//   설치: mkdir -p /home/user/vc-modules && cd /home/user/vc-modules && npm init -y && npm i qrcode-generator@1.4.4 chart.js
// 제품 코드는 고치지 않는다. 그림 파일은 저장소에 넣지 않는다.
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
// VC_REPO: 다른 브랜치를 따로 받아 둔 폴더(git worktree)의 제품 파일로 띄울 때
const REPO = process.env.VC_REPO || path.join(__dirname, '..', '..');
const { loadLabStore, labServer, configJs } = require(path.join(REPO, 'tests', 'fake-lab-store.cjs'));
const { chromium, devices } = require('playwright');

const MOD = process.env.VC_MODULES || '/home/user/vc-modules';
function readMod(rel) { try { return fs.readFileSync(path.join(MOD, 'node_modules', rel), 'utf8'); } catch (e) { return null; } }
const QR_LIB = readMod('qrcode-generator/qrcode.js');
const CHART_LIB = readMod('chart.js/dist/chart.umd.js') || readMod('chart.js/dist/chart.umd.min.js');
const QR_STUB = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"},createImgTag(){return ""},getModuleCount(){return 1},isDark(){return true}}};';
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; } update() {} destroy() {} };';
const FAKE_AI_KEY = 'vc-fake-key';   // 진짜 키가 아님 (가짜 AI 서버용)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.wasm': 'application/wasm' };

async function start(opts) {
    opts = opts || {};
    const shots = opts.shots || path.join(process.cwd(), 'vc-shots');
    fs.mkdirSync(shots, { recursive: true });
    const app = loadLabStore(), api = labServer(app);
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
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    const log = [], net = {};          // net[name] = true 면 그 화면의 저장소 요청을 끊음 (와이파이 끊김 흉내)
    const pages = {};
    // 가짜 AI 서버 3곳 (tests/report-ai-ui.test.cjs 와 같은 모양): 키가 FAKE_AI_KEY 면 답, 아니면 401. aiCalls 에 받은 질문이 쌓인다. ai.fail = 상태 코드면 그 오류를 돌려줌
    const aiCalls = [], ai = { fail: 0, n: 0 };
    const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    const fakeAI = async route => {
        const req = route.request(), u = new URL(req.url());
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
        const h = req.headers(), body = req.postData() ? JSON.parse(req.postData()) : null;
        const prov = /googleapis/.test(u.host) ? 'gemini' : /anthropic/.test(u.host) ? 'claude' : 'gpt';
        const key = prov === 'gemini' ? u.searchParams.get('key') : prov === 'claude' ? h['x-api-key'] : String(h.authorization || '').replace(/^Bearer /, '');
        const json = (status, o) => route.fulfill({ status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify(o) });
        if (key !== FAKE_AI_KEY) return json(401, { error: { message: 'invalid api key', type: 'authentication_error' } });
        if (ai.fail) return json(ai.fail, { error: { message: ai.fail === 429 ? 'rate limit exceeded' : 'server error', type: 'error' } });
        if (req.method() === 'GET') return json(200, prov === 'gemini' ? { models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] } : { data: [{ id: prov === 'claude' ? 'claude-sonnet-5-5' : 'gpt-6-luna' }] });
        const system = prov === 'gemini' ? body.systemInstruction.parts[0].text : prov === 'claude' ? body.system : body.messages[0].content;
        const user = prov === 'gemini' ? body.contents[0].parts[0].text : prov === 'claude' ? body.messages[0].content : body.messages[1].content;
        aiCalls.push({ prov, system, user });
        const text = /준비/.test(user) && /한 단어/.test(system) ? '준비' : '가짜 답 ' + (++ai.n) + ': 어느 측정값이 그 생각의 근거인가요? 다른 설명은 없을까요?';
        if (prov === 'gemini') return json(200, { candidates: [{ content: { parts: [{ text }] } }] });
        if (prov === 'claude') return json(200, { content: [{ type: 'text', text }] });
        return json(200, { choices: [{ message: { role: 'assistant', content: text } }] });
    };
    async function open(name, ctxOpt) {
        const c = await browser.newContext(Object.assign({ permissions: ['camera'], acceptDownloads: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul' }, ctxOpt));
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? (QR_LIB || QR_STUB) : /chart/i.test(u) ? (CHART_LIB || CHART_STUB) : '' }); });
        await c.route(/gstatic|accounts\.google|firestore\.googleapis|identitytoolkit|securetoken/, r => r.abort());
        await c.route(/generativelanguage\.googleapis\.com|api\.anthropic\.com|api\.openai\.com/, fakeAI);
        await c.route(API + '**', r => (net[name] ? r.abort('internetdisconnected') : r.continue()));
        const pg = await c.newPage();
        pg.vcName = name;
        pg.on('pageerror', e => log.push({ who: name, kind: 'pageerror', text: e.message }));
        pg.on('console', m => { if (m.type() === 'error') log.push({ who: name, kind: 'console', text: m.text().slice(0, 300) }); });
        pg.on('dialog', d => { log.push({ who: name, kind: 'dialog:' + d.type(), text: d.message() }); d.accept().catch(() => {}); });
        pg.on('download', d => { log.push({ who: name, kind: 'download', text: d.suggestedFilename() }); });
        pages[name] = pg;
        return pg;
    }
    let n = 0;
    const S = {
        app, API, ROOT, browser, log, net, pages, shots, devices, aiCalls, ai, FAKE_AI_KEY,
        local: href => String(href).replace(/^https?:\/\/[^/]+\//, ROOT),
        teacher: (vp, name) => open(name || 'T', { viewport: vp || { width: 1280, height: 720 } }),
        laptop: (name, vp) => open(name, { viewport: vp || { width: 1366, height: 768 } }),
        phone: (name, dev) => open(name, devices[dev || 'iPhone 13']),
        tablet: name => open(name, devices['Galaxy Tab S4']),
        // 화면 찍기: full 이면 긴 화면 전체, 아니면 지금 보이는 만큼(프로젝터에 보이는 것)
        async shot(pg, label, full) {
            const f = path.join(shots, String(++n).padStart(3, '0') + '-' + (pg.vcName || 'x') + '-' + label.replace(/[^\w가-힣.-]+/g, '_') + '.png');
            await pg.screenshot({ path: f, fullPage: !!full });
            return f;
        },
        // 화면에 보이는 글만 (사람이 읽는 것과 같게)
        seen: pg => pg.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').trim()),
        // 보이는 단추·링크 목록
        buttons: pg => pg.evaluate(() => [...document.querySelectorAll('button, a[href], select, input, summary')].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0)
            .map(e => { const r = e.getBoundingClientRect(); return (e.tagName.toLowerCase() + (e.disabled ? '(꺼짐)' : '') + ' ' + ((e.innerText || e.value || e.placeholder || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)) + ' [' + Math.round(r.width) + '×' + Math.round(r.height) + ' @' + Math.round(r.x) + ',' + Math.round(r.y) + ']' + (e.id ? ' #' + e.id : '')); })),
        // 글자 크기 어림: 화면에 보이는 글 조각 중 가장 작은 글자 크기들 (프로젝터에서 읽히는지)
        fonts: pg => pg.evaluate(() => { const m = {}; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
            while ((t = w.nextNode())) { const s = t.nodeValue.trim(); const p = t.parentElement; if (!s || !p || !p.offsetParent) continue; const r = p.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue;
                const f = Math.round(parseFloat(getComputedStyle(p).fontSize)); (m[f] = m[f] || []).push(s.slice(0, 24)); }
            return Object.keys(m).sort((a, b) => a - b).map(k => k + 'px ×' + m[k].length + ': ' + m[k].slice(0, 4).join(' | ')); }),
        // 사람처럼: 보이는 단추·링크 가운데 그 글이 있는 것을 누름
        async tap(pg, text, nth) {
            const l = pg.locator('button:visible, a:visible, summary:visible, label:visible, [role=button]:visible').filter({ hasText: text });
            const k = nth === 'last' ? l.last() : l.nth(nth || 0);
            await k.scrollIntoViewIfNeeded(); await k.click({ timeout: 8000 }); await pg.waitForTimeout(700);
        },
        // 화면 찍고 보이는 글 읽기
        async look(pg, label) { return [pg.url().replace(ROOT, ''), await S.shot(pg, label), await S.seen(pg)]; },
        async close() { await browser.close(); api.close(); stat.close(); }
    };
    return S;
}

module.exports = { start, REPO };
