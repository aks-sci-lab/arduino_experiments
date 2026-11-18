// 환경 센서 페이지(환경·조도·자외선)의 조 공유 시험
// - 계산 부분: js/environment-share.js (자료 줄이기·풀기, 요약, 받은 것 합치기, CSV 읽기)
// - 화면: Playwright 로 가짜 선생님 시트(tests/fake-apps-script.cjs, 진짜 시트처럼 '2-3-5376' → 날짜) +
//   교사 수업 만들기 → 학생 2명이 같은 조(보내기 → 다른 학생이 자동으로 불러옴) → 교사 진행 보기에 단계·점 수, 375px
//   Playwright 가 없으면 화면 시험은 건너뛴다. 스크린숏: ENV_SHARE_SHOTS=폴더
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ES = require('../js/environment-share.js');
const CC = require('../js/class-cloud.js');
const { loadLabStore } = require('./fake-lab-store.cjs');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.ENV_SHARE_SHOTS;

const envPoint = (t, k = 0) => ({ id: t, time: t, timestamp: 1000 + t * 1000, temp: 24 + k + t * 0.01, humidity: 50 + t * 0.1, pressure: 101.3, vaporPressure: 1.5, vocIndex: t > 1 ? 100 : null });

test('자료 줄이기·풀기: 열 이름 + 숫자 배열, 점이 많으면 처음·끝을 남기고 고르게 2000개', async () => {
    const pts = Array.from({ length: 5000 }, (_, i) => envPoint(i));
    const cols = ['time', 'temp', 'vocIndex'];
    const p = ES.pack(pts, cols, (x, c) => x[c], { time: 2, temp: 2, vocIndex: 0 });
    assert.equal(p.n, 5000);
    assert.equal(p.rows.length, ES.MAX_POINTS);
    assert.deepEqual(p.rows[0], [0, 24, null]);
    assert.equal(p.rows.at(-1)[0], 4999);
    assert.ok(JSON.stringify(p).length < 45000 * 6, '서버 한도 안');
    const back = ES.unpack(p);
    assert.equal(back.length, ES.MAX_POINTS);
    assert.equal(back[1].temp, Math.round(back[1].temp * 100) / 100);
    assert.equal(back[0].vocIndex, null);
    // 모양이 틀린 자료는 빈 배열, 시간 없는 줄은 뺌
    assert.deepEqual(ES.unpack(null), []);
    assert.deepEqual(ES.unpack({ cols: ['time'], rows: [[null], [1], 'x'] }), [{ time: 1 }]);
});

test('요약 이름은 서버 규칙을 지키고 교사 화면 앞 4개에 시간·평균이 온다', async () => {
    const env = ES.summaryEnv([envPoint(0), envPoint(10)]);
    assert.deepEqual(Object.keys(env).slice(0, 4), ['시간(s)', '온도 평균(C)', '습도 평균(RH)', '기압 평균(kPa)']);
    assert.equal(env['시간(s)'], 10);
    assert.equal(env['VOC 마지막'], 100);
    const one = ES.summarySingle([{ time: 0, lux: 10 }, { time: 2, lux: 30 }], 'lux', 'lux', 3);
    assert.deepEqual(one, { '시간(s)': 2, '평균(lux)': 20, '최소(lux)': 10, '최대(lux)': 30 });
    assert.deepEqual(ES.summarySingle([], 'uvRaw', 'counts', 0)['평균(counts)'], null);
    // 진짜 서버(가짜 시트)에서 그대로 받아들여지는지
    const gs = loadLabStore();
    for (const summary of [env, one, ES.summaryEnv([])]) {
        const r = (await gs.post({ action: 'save', exp: 'env', id: 'nabcdef-t1', group: '2-3-5376', device: 'nabcdef', title: '1회', n: 2, summary, data: '{}', sentAt: 'x' }));
        assert.equal(r.ok, true, JSON.stringify(r));
    }
});

test('받은 것 합치기: 서버 것은 받은 목록으로 바꾸고(지운 회차는 사라짐), CSV 로 불러온 것은 남긴다', async () => {
    const it = (id, sentAt, rows = [[0, 1]]) => ({ id, device: 'nB', from: '노트북 B', title: id, n: rows.length, sentAt, data: { cols: ['time', 'temp'], rows } });
    let r = ES.mergeIncoming({}, [it('t1', 'a'), it('t2', 'a'), { id: 'bad', device: 'nB', data: 'x' }]);
    assert.equal(r.changed, true);
    assert.deepEqual(Object.keys(r.store).sort(), ['d:nB-t1', 'd:nB-t2']);
    r.store['f:파일.csv'] = { from: '파일', title: '파일.csv', n: 1, sentAt: 'z', cols: ['time'], rows: [[0]] };
    assert.equal(ES.mergeIncoming(r.store, [it('t1', 'a'), it('t2', 'a')]).changed, false);
    const r2 = ES.mergeIncoming(r.store, [it('t1', 'b', [[0, 1], [1, 2]])]);
    assert.equal(r2.changed, true);
    assert.deepEqual(Object.keys(r2.store).sort(), ['d:nB-t1', 'f:파일.csv']);
    assert.equal(r2.store['d:nB-t1'].rows.length, 2);
});

test('CSV 읽기: 환경 페이지·조도 페이지의 CSV 저장 파일 모양', async () => {
    const envCsv = 'ID,Time (s),Temperature (C),Humidity (%RH),Pressure (kPa),VaporPressure (kPa),Timestamp (ms),VOC Index,SRAW,Warmup (s),VOC algorithm\n' +
        '1,0.000,24.00,50.00,101.30,1.500,1000,,25000,60,x\n2,1.000,24.10,50.10,101.30,1.510,2000,101,25000,0,x\n';
    const env = ES.parseCsv(envCsv, { 'Time (s)': 'time', 'Temperature (C)': 'temp', 'Humidity (%RH)': 'humidity', 'Pressure (kPa)': 'pressure', 'VaporPressure (kPa)': 'vaporPressure', 'VOC Index': 'vocIndex' });
    assert.equal(env.points.length, 2);
    assert.deepEqual(env.points[1], { time: 1, temp: 24.1, humidity: 50.1, pressure: 101.3, vaporPressure: 1.51, vocIndex: 101 });
    assert.equal(env.points[0].vocIndex, null);
    const light = ES.parseCsv('﻿Time (s),조도 (lux),광대역 채널 (counts),적외선 채널 (counts),이득 (배),Pico timestamp (ms)\r\n0,136.4,1000,100,25,1000\r\n',
        { 'Time (s)': 'time', '조도 (lux)': 'lux', '광대역 채널 (counts)': 'full', '적외선 채널 (counts)': 'infrared', '이득 (배)': 'gain' });
    assert.deepEqual(light.points, [{ time: 0, lux: 136.4, full: 1000, infrared: 100, gain: 25 }]);
    // 다른 센서 CSV·빈 파일은 거절
    assert.match(ES.parseCsv(envCsv, { 'Time (s)': 'time', '조도 (lux)': 'lux' }).error, /측정값 열/);
    assert.match(ES.parseCsv('a,b\n1,2', { 'Time (s)': 'time' }).error, /시간 열/);
    assert.match(ES.parseCsv('', { 'Time (s)': 'time' }).error, /없는 파일/);
});

test('수업 링크: 환경·조도·자외선 수업 준비 끝, 조도는 ?sensor=light 뒤에 &c= 가 붙음', async () => {
    for (const exp of ['env', 'light', 'uv']) assert.equal(CC.EXPS[exp].ready, true);
    assert.equal(CC.studentUrl('https://x', 'light', '2-4821'), 'https://x/projects/environment-lab.html?sensor=light&c=2-4821');
    assert.equal(CC.studentUrl('https://x', 'env', '2-4821'), 'https://x/projects/environment-lab.html?c=2-4821');
});

/* ---------------- 화면 (Playwright) ---------------- */

// 사이트 파일 + 가짜 선생님 시트(/gas) 를 한 서버에서
function startServer(gs) {
    const server = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        if (u.pathname === '/gas') {
            const send = obj => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
            if (req.method === 'POST') {
                let body = '';
                req.on('data', c => { body += c; });
                req.on('end', () => gs.post(body).then(send));
            } else gs.get(Object.fromEntries(u.searchParams)).then(send);
            return;
        }
        const file = path.join(ROOT, decodeURIComponent(u.pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
        const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.wasm': 'application/wasm' }[path.extname(file)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
// 시험 환경은 CDN 이 막혀 있어 Chart.js 대신 그린 자료만 기억하는 가짜를 쓴다
const FAKE_CHART = `window.Chart = class { constructor(el, cfg) { Object.assign(this, cfg); this.canvas = el; this.scales = { x: {} }; (window.__charts = window.__charts || []).push(this); }
    update() {} resetZoom() {} static getChart(el) { return (window.__charts || []).find(c => c.canvas === el); } };`;

async function openStudent(browser, base, url, seed) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await ctx.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|gstatic\.com/, route =>
        route.fulfill({ contentType: 'text/javascript', body: /chart\.umd/.test(route.request().url()) ? FAKE_CHART : '' }));
    await ctx.route('**/js/pendulum-config.js', route => route.fulfill({ contentType: 'text/javascript',
        body: `window.LAB_STORE_FAKE_URL='${base}/gas';window.PENDULUM_CONFIG = { pollSeconds: 3 };` }));
    if (seed) await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, seed);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + url);
    return { ctx, page, errors };
}
async function join(page, jo, num) {
    await page.waitForSelector('#cs-cpick:not([hidden])');
    await page.selectOption('#cs-cjo', String(jo));
    await page.selectOption('#cs-cnum', String(num));
    await page.click('#cs-cjoin');
    await page.waitForSelector('#cs-cjoined:not([hidden])');
}
async function layoutOk(page) {
    return page.evaluate(() => {
        const wide = document.documentElement.scrollWidth <= window.innerWidth + 1;
        const small = [...document.querySelectorAll('#cs-share button, #cs-share select, #cs-share input:not([type=checkbox]):not([type=file]), .cs-bar button, .cs-bar select')]
            .filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent);
        return { wide, small };
    });
}

for (const sc of [
    { exp: 'env', url: '/projects/environment-lab.html', key: 'env_sensor_trials', list: '#trial-list',
        seed: () => JSON.stringify({ env_trial_1: { id: 'env_trial_1', name: '창가 1회', data: [envPoint(0), envPoint(1), envPoint(2)] } }) },
    { exp: 'light', url: '/projects/environment-lab.html?sensor=light', key: 'light_sensor_trials', list: '#trialList',
        seed: () => JSON.stringify([{ name: '창가 조도', data: [0, 1, 2].map(t => ({ type: 'light', ts: 1000 + t * 1000, seq: t, time: t, data: { lux: 100 + t, full: 1000, infrared: 100, gain: 25 } })) }]) }
]) {
    test(`${sc.exp}: 수업 만들기 → 학생 2명 같은 조 보내기·자동 불러오기 → 교사 진행 보기 (375px)`, { skip: !chromium && 'playwright 없음', timeout: 90000 }, async () => {
        const gs = loadLabStore();
        const server = await startServer(gs);
        const base = 'http://127.0.0.1:' + server.address().port;
        const browser = await chromium.launch();
        try {
            const cls = (await gs.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: sc.exp }));
            assert.equal(cls.ok, true, JSON.stringify(cls));
            const link = sc.url + (sc.url.includes('?') ? '&' : '?') + 'c=' + cls.classCode;

            // 학생 A: 저장해 둔 회차 하나 → 1조 1번 → 📤 보내기
            const a = await openStudent(browser, base, link, [sc.key, sc.seed()]);
            await join(a.page, 1, 1);
            assert.equal(await a.page.evaluate(() => !!document.querySelector('.share-details').open), true, '수업이면 조 공유 접기가 열림');
            assert.equal(await a.page.inputValue('#cs-group'), cls.groups[0].code);
            await a.page.evaluate(() => { document.getElementById('cs-share').open = true; });
            await a.page.click('#cs-send');
            await a.page.waitForFunction(() => /보냈/.test(document.getElementById('cs-status').textContent));
            const lay = await layoutOk(a.page);
            assert.ok(lay.wide, '375px 가로 스크롤');
            assert.deepEqual(lay.small, [], '44px 보다 낮은 단추');
            // 센서 고르기 단추에도 수업 코드가 붙는다
            assert.ok((await a.page.getAttribute('.sensor-switch a[data-mode="uv"]', 'href')).includes('c=' + cls.classCode));
            if (SHOTS) await a.page.screenshot({ path: path.join(SHOTS, sc.exp + '-a.png'), fullPage: true });

            // 저장소: 조 코드 그대로, 요약·자료가 들어감
            const row = gs.items(sc.exp).find(r => String(r.title).includes(sc.exp === 'env' ? '창가 1회' : '창가 조도'));
            assert.ok(row, '회차 한 줄');
            assert.equal(row.group, cls.groups[0].code);
            assert.equal(row._space, cls.space, '수업 공간에 저장 (링크에 공간이 없어도 수업 코드로 찾음)');

            // 학생 B: 같은 조 1조 2번 → 자동으로 불러와 📥 회차가 목록·그래프에
            const b = await openStudent(browser, base, link);
            await join(b.page, 1, 2);
            await b.page.waitForFunction(sel => /📥/.test(document.querySelector(sel).textContent), sc.list, { timeout: 20000 });
            const listed = await b.page.textContent(sc.list);
            assert.match(listed, new RegExp('📥 노트북 [A-Z0-9]{4} · ' + (sc.exp === 'env' ? '창가 1회' : '창가 조도') + ' \\(3개\\)'));
            const labels = await b.page.evaluate(() => window.__charts[0].data.datasets.map(d => [d.label, d.data.length]));
            assert.ok(labels.some(([l, n]) => /📥/.test(l) && n === 3), JSON.stringify(labels));
            // 📥 은 내 기록이 아니다: B 가 보내도 A 의 회차를 다시 보내지 않는다
            await b.page.evaluate(() => { document.getElementById('cs-share').open = true; });
            await b.page.click('#cs-send');
            await b.page.waitForFunction(() => /보낼 측정값이 없습니다/.test(document.getElementById('cs-status').textContent));
            assert.ok((await layoutOk(b.page)).wide);
            if (SHOTS) await b.page.screenshot({ path: path.join(SHOTS, sc.exp + '-b.png'), fullPage: true });

            // 교사 진행 보기: 1조 1번 '기록' 단계·점 3개·보냄, 1조 2번은 '안내'·0개
            await new Promise(r => setTimeout(r, 300));
            const st = (await gs.post({ action: 'classStatus', class: cls.classCode, key: cls.key }));
            assert.equal(st.ok, true, JSON.stringify(st));
            const view = CC.summarize(st);
            const g1 = view.groups.find(g => g.jo === 1);
            const m1 = g1.members.find(m => m.num === 1), m2 = g1.members.find(m => m.num === 2);
            assert.equal(m1.st.step, 'record'); assert.equal(m1.st.points, 3); assert.equal(m1.st.submitted, true);
            assert.equal(m2.st.step, 'more'); assert.equal(m2.st.points, 0);
            assert.equal(CC.EXPS[sc.exp].steps[m1.st.step], '기록');
            assert.ok(g1.sub && g1.sub.rows >= 1, '교사 화면 제출 개수');
            assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
            await a.ctx.close(); await b.ctx.close();
        } finally {
            await browser.close();
            server.close();
        }
    });
}
