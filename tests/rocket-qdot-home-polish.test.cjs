// 2차 PR 회귀 시험 (2026-11-27 글자 확인 → 동작 확인으로 바꿈):
// 로켓(날개·앞코 장, 화면 켜짐 유지 WakeLock, 일반 탭 안내) · 양자점(시감도 안내, 몰비 노트, AI expGuide·temperature) · 메인(24인치 5칸, 명암비, <main> 하나, 받은 글 esc)
// 도전 영상 '끝까지 확인했어요' 표시는 tests/film-rocket-media-ui.test.cjs 가 실제 영상 'ended' 로 확인
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const RA = require('../js/report-ai.js');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT_DIR = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';

function lessonOf(exp) {
    const { LessonContent } = require('../js/lesson-slides.js');
    const box = { LessonContent }; box.window = box;
    vm.runInNewContext(fs.readFileSync(path.join(ROOT_DIR, 'js/lesson-content/' + exp + '.js'), 'utf8'), box);
    return LessonContent.get(exp);
}
const plain = h => String(h || '').replace(/<[^>]+>/g, '');

test('설명 장 내용: 로켓 2차시 날개·앞코 물음(풀이에 공기 저항) · 양자점 선생님용 몰비·시감도 노트', () => {
    const t2 = lessonOf('rocket').stages.t2;
    const i = t2.findIndex(s => /날개와 앞코는 왜 달까요/.test(s.title));
    assert.ok(i >= 0, '2차시에 날개·앞코 장');
    const s = t2[i];
    assert.equal(s.kind, 'ask', '물음 장(풀이는 다음 키에)');
    assert.match(plain(s.body), /공기 저항/);
    assert.match(plain(s.reveal), /앞코[\s\S]*공기 저항을 줄여요[\s\S]*꼬리 날개/);
    assert.doesNotMatch(plain(s.body) + plain(s.ask), /줄여요/, '답이 물음보다 먼저 보이지 않음');
    assert.ok(t2.findIndex(x => x.kind === 'safety') > i, '발사 안전 장보다 앞');

    const notes = Object.values(lessonOf('qdot').stages).flat().map(x => plain(x.note)).join('\n');
    assert.match(notes, /몰비로는 약 1 : 3\.2/);
    assert.match(notes, /초록 가중치가 파랑의 약 10배/);
});

test('양자점 보고서 AI: qdot 전용 안내가 시스템 프롬프트에, Claude·GPT temperature 0.4', () => {
    const p = RA.buildPrompt({ exp: 'qdot', section: 'conclusion', prompt: '결론 검토해 줘', attach: [] }, '탄소 양자점 형광');
    assert.match(p.system, /알갱이 크기를 직접 재지 않았으므로/);
    assert.match(p.system, /측정 사실이 아니라 가설/);
    const other = RA.buildPrompt({ exp: 'malus', section: 'conclusion', prompt: '결론 검토해 줘', attach: [] }, '말루스');
    assert.doesNotMatch(other.system, /알갱이 크기/, '다른 실험에는 양자점 안내 없음');
    assert.equal(JSON.parse(RA.chatRequest('claude', 'claude-sonnet-5-5', 'k', 'S', 'U').init.body).temperature, 0.4);
    assert.equal(JSON.parse(RA.chatRequest('gpt', 'gpt-6-luna', 'k', 'S', 'U').init.body).temperature, 0.4);
});

// ---------- 화면 시험 ----------
async function setup() {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(ROOT_DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const ctx = async (opt, name, init, routes) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : '' }));
        if (routes) await routes(c); else await c.route(/gstatic/, r => r.abort());
        if (init) await c.addInitScript(init.fn, init.arg);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    return { app, ROOT, ctx, errors, close: async () => { await browser.close(); api.close(); stat.close(); } };
}
// 가짜 화면 켜짐 유지: 요청을 window.__wl 에 적고, window.__lock.release() 로 놓아 줄 수 있게
const FAKE_WAKELOCK = { fn: () => {
    window.__wl = [];
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: t => {
        window.__wl.push(t);
        const l = new EventTarget(); l.release = () => { l.dispatchEvent(new Event('release')); return Promise.resolve(); };
        window.__lock = l; return Promise.resolve(l);
    } } });
} };

test('로켓 폰: 화면 켜짐 유지를 요청하고 놓치면 다시 · 발표용은 요청 안 함 · 수업 입장 화면에 일반 탭 안내', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const E = await setup();
    try {
        const c = await E.app.post({ action: 'createClass', ban: 1, mode: 'team', nTeams: 4, exp: 'rocket' });
        const A = await E.ctx(devices['iPhone 13'], 'A', FAKE_WAKELOCK);
        await A.goto(E.ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space);
        await A.waitForSelector('#ev-app[data-screen="enter"]', { timeout: 15000 });
        await A.waitForFunction(() => window.__wl.length === 1);
        assert.deepEqual(await A.evaluate(() => window.__wl), ['screen']);
        // 배터리 절약·다른 앱으로 갔다 오면 잠금이 풀림 → 화면이 다시 보이면 다시 요청
        await A.evaluate(() => { window.__lock.release(); document.dispatchEvent(new Event('visibilitychange')); });
        await A.waitForFunction(() => window.__wl.length === 2);
        await A.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await A.waitForTimeout(300);
        assert.equal(await A.evaluate(() => window.__wl.length), 2, '잠금이 살아 있으면 또 요청하지 않음');
        // 수업 입장 화면: 일반 탭 안내가 실제로 보임
        const tip = A.locator('#ev-app .ev-small', { hasText: '일반 탭' });
        assert.equal(await tip.isVisible(), true);
        assert.match(await tip.textContent(), /카카오톡·QR 앱 안 창/);
        // 수업 없이 연 화면: 입장 안내는 없음(팀 자리 없음), 켜짐 유지는 함
        const S = await E.ctx(devices['iPhone 13'], 'S', FAKE_WAKELOCK);
        await S.goto(E.ROOT + 'projects/film-rocket.html');
        await S.waitForSelector('#ev-app[data-screen]', { timeout: 15000 });
        await S.waitForFunction(() => window.__wl.length === 1);
        assert.equal(await S.locator('#ev-app .ev-small', { hasText: '일반 탭' }).count(), 0);
        // 🎬 발표용(교사 화면 안 틀): 학생 폰이 아니므로 요청하지 않음
        const P = await E.ctx({ viewport: { width: 400, height: 820 } }, 'P', FAKE_WAKELOCK);
        await P.goto(E.ROOT + 'projects/film-rocket.html?present=1&c=' + c.classCode + '&s=' + c.space);
        await P.waitForSelector('#ev-app[data-screen]', { timeout: 15000 });
        await P.waitForTimeout(800);
        assert.equal(await P.evaluate(() => window.__wl.length), 0, '발표용은 화면 켜짐 유지 안 함');
        assert.deepEqual(E.errors, []);
    } finally { await E.close(); }
});

test('양자점 2 이론 · 카메라로 재기: 보정 밝기 시감도 주의가 그 작은 탭에 실제로 보임', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const E = await setup();
    try {
        const P = await E.ctx({ viewport: { width: 1280, height: 900 } }, 'P');
        await P.goto(E.ROOT + 'projects/quantum-dot.html?device=laptop');
        await P.click('nav.steps button[data-step="theory"]');
        const panel = '.step-panel[data-step="theory"]';
        await P.click(panel + ' .subtabs button:has-text("카메라로 재기")');
        const note = P.locator(panel + ' li', { hasText: '보정 밝기' }).first();
        assert.equal(await note.isVisible(), true);
        assert.match(await note.textContent(), /초록 가중치가 파랑보다 약 10배/);
        assert.deepEqual(E.errors, []);
    } finally { await E.close(); }
});

// 메인 화면은 사이트 관리용 Firebase(gstatic compat)를 직접 씀 → 그 스크립트 자리에 가짜 firebase 를 넣어, 이름·오류 글에 HTML 을 넣어 봄
const XSS = '<img src=x onerror="window.__xss=1">';
const FAKE_FIREBASE = `window.firebase = {
  initializeApp() {},
  auth() { return { onAuthStateChanged(cb) { setTimeout(() => cb({ uid: 'u1', email: 'a@example.com', displayName: ${JSON.stringify(XSS + '선생님')} }), 0); return () => {}; },
                    signOut() { return Promise.resolve(); } }; },
  firestore() { return { collection(name) { return {
      doc() { return { get: async () => ({ exists: true, data: () => ({ isTeacher: true }) }) }; },
      where() { return this; },
      get: async () => { throw new Error(${JSON.stringify(XSS + ' 권한 없음')}); }
  }; } }; }
};`;

test('메인 화면: 받은 이름·오류 글은 글자로만(실행 안 됨) · <main> 하나 · 구글 단추 명암비 · 24인치 보고서 실험 5칸', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const E = await setup();
    try {
        const P = await E.ctx({ viewport: { width: 1920, height: 1080 } }, 'P', { fn: () => { localStorage.setItem('home-role:v1', 'teacher'); } }, async c => {
            await c.route(/gstatic/, r => /firebase-app-compat/.test(r.request().url()) ? r.fulfill({ contentType: 'text/javascript', body: FAKE_FIREBASE }) : r.fulfill({ contentType: 'text/javascript', body: '' }));
        });
        await P.goto(E.ROOT + 'index.html');
        await P.waitForFunction(() => /선생님/.test(document.getElementById('userInfo').textContent));
        await P.waitForFunction(() => /불러오기 실패/.test(document.getElementById('experimentsList').textContent));
        const r = await P.evaluate(() => ({
            info: document.getElementById('userInfo').textContent, infoImg: document.querySelectorAll('#userInfo img').length,
            list: document.getElementById('experimentsList').textContent, listImg: document.querySelectorAll('#experimentsList img').length,
            xss: window.__xss
        }));
        assert.match(r.info, /<img src=x/, '이름은 글자 그대로');
        assert.equal(r.infoImg, 0); assert.equal(r.listImg, 0, '오류 글의 태그도 실행 안 됨');
        assert.match(r.list, /<img src=x[\s\S]*권한 없음/);
        assert.equal(r.xss, undefined, 'onerror 가 돌지 않음');
        // 문서 구조: main 하나, 실험 목록은 그 안
        assert.deepEqual(await P.evaluate(() => ({ n: document.querySelectorAll('main').length, nested: document.querySelectorAll('main main').length, labsIn: !!document.querySelector('main #homeLabs') })), { n: 1, nested: 0, labsIn: true });
        // 구글 단추: 주 색(--c-primary) 바탕, 흰 글자 대비 4.5 이상
        const c = await P.evaluate(() => {
            const b = document.querySelector('.btn-google'), cs = getComputedStyle(b);
            const probe = document.createElement('i'); probe.style.color = 'var(--c-primary)'; document.body.appendChild(probe);
            const prim = getComputedStyle(probe).color; probe.remove();
            return { bg: cs.backgroundColor, fg: cs.color, prim };
        });
        assert.equal(c.bg, c.prim, '구글 단추 바탕 = 주 색');
        const lum = s => { const [r, g, b] = s.match(/\d+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const L1 = lum(c.bg), L2 = lum(c.fg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        assert.ok(ratio >= 4.5, '명암비 ' + ratio.toFixed(2));
        // 24인치: 보고서 실험 격자 5칸(두 줄은 tests/home-roles-ui.test.cjs)
        const cols = await P.evaluate(() => getComputedStyle(document.querySelector('.report-grid')).gridTemplateColumns.split(' ').length);
        assert.equal(cols, 5);
        await P.setViewportSize({ width: 1366, height: 768 });
        assert.equal(await P.evaluate(() => getComputedStyle(document.querySelector('.report-grid')).gridTemplateColumns.split(' ').length), 5, '노트북도 5칸(5+4)');
        assert.deepEqual(E.errors, []);
    } finally { await E.close(); }
});
