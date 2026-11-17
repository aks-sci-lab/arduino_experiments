// 개발 데이터 자동 수집: 서버 10판 devSave·devExport, js/dev-collect.js, tools/dev-data-pull.cjs, 심박수 페이지 띠
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { loadCodeGs } = require('./fake-apps-script.cjs');
const DC = require('../js/dev-collect.js');
const PULL = require('../tools/dev-data-pull.cjs');
const REPO = path.join(__dirname, '..');

const rec = (id, extra) => Object.assign({ action: 'devSave', exp: 'heartrate', id, measuredAt: '2026-11-17T01:02:03.000Z', device: 'dvabc123',
    summary: { '심박수': 72, '노출': 'locked' }, data: JSON.stringify({ csv: 't,R\n0,1\n', result: { bpm: 72 } }) }, extra || {});

test('서버 10판: devSave·devExport 는 관리 열쇠가 맞을 때만, 같은 id 는 고쳐 씀, 받는 실험만', () => {
    const app = loadCodeGs();
    assert.ok(app.get({ action: 'ping' }).version >= 10);
    assert.match(app.post(rec('hr-aaaaaa-1')).error, /관리 열쇠가 아직 없/);
    const key = app.post({ action: 'claimAdmin' }).key;
    assert.match(app.post(rec('hr-aaaaaa-1', { key: 'wrong' })).error, /관리 열쇠가 맞지/);
    assert.match(app.post(rec('hr-aaaaaa-1')).error, /관리 열쇠가 맞지/);
    assert.match(app.post(rec('hr-aaaaaa-1', { key, exp: 'planck' })).error, /받지 않는 실험/);
    assert.match(app.post(rec('a b', { key })).error, /id/);
    assert.equal(app.post(rec('hr-aaaaaa-1', { key })).updated, false);
    assert.equal(app.post(rec('hr-aaaaaa-1', { key, summary: { '심박수': 75 } })).updated, true);
    assert.equal(app.post(rec('fh-bbbbbb-1', { key, exp: 'facehr' })).ok, true);
    assert.match(app.post({ action: 'devExport', key: 'nope' }).error, /관리 열쇠가 맞지/);
    assert.match(app.post({ action: 'devExport' }).error, /관리 열쇠가 맞지/);
    const all = app.post({ action: 'devExport', key });
    assert.equal(all.ok, true); assert.equal(all.items.length, 2);
    const hr = all.items.find(x => x.id === 'hr-aaaaaa-1');
    assert.equal(hr.summary['심박수'], 75); assert.equal(hr.measuredAt, '2026-11-17T01:02:03.000Z'); assert.equal(JSON.parse(hr.data).csv, 't,R\n0,1\n');
    // 키는 시트에 남지 않음
    assert.ok(!JSON.stringify(app.ss.getSheetByName('devlog').written).includes(key));
    assert.equal(app.post({ action: 'devExport', key, since: '2999-01-01T00:00:00Z' }).items.length, 0);
    assert.match(app.post({ action: 'devExport', key, since: 'abc' }).error, /since/);
});

test('서버: devExport 는 한 번에 40줄, 같은 시각 줄은 나누지 않고, since 로 이어 받기', () => {
    const app = loadCodeGs();
    const key = app.post({ action: 'claimAdmin' }).key;
    for (let i = 0; i < 45; i++) assert.equal(app.post(rec('hr-cccccc-' + i, { key })).ok, true);
    const seen = new Set(); let since = '', calls = 0;
    for (;;) {
        const r = app.post({ action: 'devExport', key, since }); calls++;
        r.items.forEach(x => seen.add(x.id));
        if (!r.more || !r.items.length) break;
        since = r.items[r.items.length - 1].timestamp;
    }
    assert.equal(seen.size, 45);
    assert.ok(calls <= 3);
});

function memStore(init) { const m = new Map(Object.entries(init || {})); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; }
const URL1 = 'https://script.google.com/macros/s/AKfycbTEST/exec';

test('도우미: 열쇠 없는 기기(학생)는 아무것도 보내지 않음, devCollect 꺼지면 멈춤', async () => {
    let calls = 0;
    const post = async () => { calls++; return { ok: true }; };
    const s1 = DC.create({ store: memStore(), post, url: URL1, enabled: true });
    assert.equal(s1.active(), false);
    assert.equal((await s1.send('heartrate', { summary: {} })).skipped, true);
    const keyed = { 'class-teacher:admin:v1': JSON.stringify({ [URL1]: 'K1' }) };
    const s2 = DC.create({ store: memStore(keyed), post, url: URL1, enabled: false });
    assert.equal(s2.active(), false);
    await s2.send('heartrate', {});
    assert.equal(calls, 0);
    assert.deepEqual(DC.pickAdmin({ [URL1]: 'K1' }, ''), { url: URL1, key: 'K1' });   // 열쇠가 하나면 그것
    assert.equal(DC.pickAdmin({ [URL1]: 'K1', [URL1 + '2']: 'K2' }, ''), null);   // 여러 개면 지금 시트 것만
});

test('도우미: 선생님 기기는 보내고, 실패하면 쌓아 두었다가 다시, 열쇠가 틀리면 멈춤', async () => {
    const bodies = []; let fail = true;
    const post = async (u, b) => { bodies.push({ u, b }); return fail ? { ok: false, error: '서버에 연결하지 못했습니다' } : { ok: true }; };
    const store = memStore({ 'class-teacher:admin:v1': JSON.stringify({ [URL1]: 'K1' }) });
    const d = DC.create({ store, post, url: URL1, enabled: true });
    assert.equal(d.active(), true);
    const r1 = await d.send('heartrate', { id: 'hr-x-r1', summary: { '심박수': 70 }, data: { csv: 'a\n' } });
    assert.equal(r1.ok, false); assert.equal(d.pending(), 1);
    assert.equal(bodies[0].b.key, 'K1'); assert.equal(bodies[0].b.action, 'devSave'); assert.equal(typeof bodies[0].b.data, 'string');
    await d.send('heartrate', { id: 'hr-x-r1', summary: { '심박수': 71 } });   // 같은 측정은 하나로
    assert.equal(d.pending(), 1);
    // 새로 연 페이지도 쌓인 것을 안다
    fail = false;
    const d2 = DC.create({ store, post, url: URL1, enabled: true });
    assert.equal(d2.pending(), 1);
    const f = await d2.flush();
    assert.equal(f.ok, true); assert.equal(d2.pending(), 0); assert.equal(d2.sent(), 1);
    assert.equal(bodies[bodies.length - 1].b.summary['심박수'], 71);
    // 열쇠가 틀리면 이 기기는 멈춤
    const d3 = DC.create({ store, post: async () => ({ ok: false, error: '관리 열쇠가 맞지 않습니다.' }), url: URL1, enabled: true });
    await d3.send('heartrate', { id: 'hr-x-r2' });
    assert.equal(d3.active(), false);
    assert.match(DC.uaSummary('Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'), /Android 14; SM-S918N · Chrome 131/);
    assert.match(DC.uaSummary('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'), /iPhone.*Safari 17/);
});

test('가져오기 도구: devExport → 날짜 폴더에 CSV·JSON, index.json, state.json, 두 번째는 새 것만', async () => {
    const app = loadCodeGs();
    const key = app.post({ action: 'claimAdmin' }).key;
    app.post(rec('hr-dddddd-r1', { key }));
    app.post(rec('fh-dddddd-r1', { key, exp: 'facehr', measuredAt: '2026-11-17T20:00:00.000Z', data: JSON.stringify({ raw: { t: [0, 0.033], g: [100, 101] }, result: { bpm: 66 } }) }));
    let lastBody = null;
    const fakeFetch = async (u, o) => { lastBody = JSON.parse(o.body); const r = app.post(o.body); return { status: 200, text: async () => JSON.stringify(r) }; };
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'devdata-'));
    assert.equal((await PULL.pull({ url: 'x', key: '', out, fetch: fakeFetch })).skipped, true);
    const r = await PULL.pull({ url: 'https://example.invalid/exec', key, out, fetch: fakeFetch });
    assert.equal(r.got, 2);
    assert.equal(fs.readFileSync(path.join(out, 'heart-rate/2026-11-17/hr-dddddd-r1.csv'), 'utf8'), 't,R\n0,1\n');
    const j = JSON.parse(fs.readFileSync(path.join(out, 'heart-rate/2026-11-17/hr-dddddd-r1.json'), 'utf8'));
    assert.equal(j.data.result.bpm, 72); assert.equal(j.data.csv, undefined); assert.equal(j.summary['심박수'], 72);
    // 한국 시각 날짜 폴더 (UTC 20시 = 다음 날 5시), raw 로 CSV
    assert.equal(fs.readFileSync(path.join(out, 'face-hr/2026-11-18/fh-dddddd-r1.csv'), 'utf8'), 't,g\n0,100\n0.033,101\n');
    const idx = JSON.parse(fs.readFileSync(path.join(out, 'heart-rate/index.json'), 'utf8'));
    assert.equal(idx.count, 1); assert.equal(idx.items[0].csv, 'heart-rate/2026-11-17/hr-dddddd-r1.csv');
    const st = JSON.parse(fs.readFileSync(path.join(out, 'state.json'), 'utf8'));
    assert.ok(st.since); assert.equal(st.total, 2);
    // 아무것도 안 바뀌면 state 도 그대로 (커밋이 안 생김)
    const before = fs.readFileSync(path.join(out, 'state.json'), 'utf8');
    assert.equal((await PULL.pull({ url: 'u', key, out, fetch: fakeFetch })).got, 0);
    assert.equal(lastBody.since, st.since);
    assert.equal(fs.readFileSync(path.join(out, 'state.json'), 'utf8'), before);
    // 손목 맥박을 넣어 고친 측정은 다시 받아 같은 파일을 고침
    await new Promise(r2 => setTimeout(r2, 5));
    app.post(rec('hr-dddddd-r1', { key, summary: { '심박수': 72, '손목': 76 } }));
    assert.equal((await PULL.pull({ url: 'u', key, out, fetch: fakeFetch })).got, 1);
    const idx2 = JSON.parse(fs.readFileSync(path.join(out, 'heart-rate/index.json'), 'utf8'));
    assert.equal(idx2.count, 1); assert.equal(idx2.items[0].summary['손목'], 76);
    // 열쇠가 틀리면 실패
    await assert.rejects(PULL.pull({ url: 'u', key: 'bad', out, fetch: fakeFetch }), /관리 열쇠/);
});

test('워크플로: dev-data 브랜치에만, devCollect·Secret 확인, 매시간', () => {
    const y = fs.readFileSync(path.join(REPO, '.github/workflows/dev-data-collect.yml'), 'utf8');
    assert.match(y, /cron:/); assert.match(y, /workflow_dispatch/);
    assert.match(y, /git push --quiet origin dev-data/); assert.ok(!/push[^\n]*main/.test(y.replace(/ref: main/, '')));
    assert.match(y, /devCollect:\[\[:space:\]\]\*true/); assert.match(y, /secrets\.DEV_SHEET_URL/); assert.match(y, /secrets\.DEV_ADMIN_KEY/);
    assert.match(y, /node site\/tools\/dev-data-pull\.cjs/);
    // 사이트 배포는 main 에서만
    assert.match(fs.readFileSync(path.join(REPO, '.github/workflows/deploy-hosting.yml'), 'utf8'), /branches: \[main\]/);
});

let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
test('심박수 페이지: 열쇠 없으면 띠 없음, QR(#devkey) 로 열쇠 넣으면 🧪 띠·주소에서 열쇠 지움, 보내면 시트에', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadCodeGs();
    const key = app.post({ action: 'claimAdmin' }).key;
    const api = http.createServer((req, res) => {
        const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
        const u = new URL(req.url, 'http://x');
        if (req.method === 'GET') return send(app.get(Object.fromEntries(u.searchParams)));
        let b = ''; req.on('data', c => b += c); req.on('end', () => send(app.post(b)));
    });
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    try {
        const c = await browser.newContext({ viewport: { width: 375, height: 760 } });
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.PENDULUM_CONFIG={appsScriptUrl:${JSON.stringify(API)},pollSeconds:3,devCollect:true};` }));
        await c.route(/cdn\.jsdelivr|gstatic/, r => r.abort());
        const pg = await c.newPage(); pg.on('pageerror', e => errors.push(e.message));
        await pg.goto(ROOT + 'projects/heart-rate.html');
        await pg.waitForTimeout(500);
        assert.equal(await pg.locator('.dev-collect').count(), 0, '열쇠 없으면 띠 없음');
        assert.equal(await pg.evaluate(() => DevCollect.active()), false);
        // 틀린 열쇠
        await pg.goto(ROOT + 'projects/heart-rate.html?t=1#devkey=wrongkey');
        await pg.waitForFunction(() => /열쇠를 넣지 못했/.test(document.body.textContent), null, { timeout: 10000 });
        assert.equal(await pg.evaluate(() => location.hash), '');
        assert.equal(await pg.locator('.dev-collect').count(), 0);
        // 맞는 열쇠
        await pg.goto(ROOT + 'projects/heart-rate.html?t=2#devkey=' + encodeURIComponent(key));
        await pg.waitForSelector('.dev-collect', { timeout: 10000 });
        assert.equal(await pg.evaluate(() => location.hash), '');
        assert.match(await pg.textContent('.dev-collect'), /개발 데이터 자동 수집 중/);
        await pg.evaluate(() => DevCollect.send('heartrate', { id: 'hr-test-r1', summary: { '심박수': 70 }, data: { csv: 't\n0\n' } }));
        await pg.waitForFunction(() => /보냄 1/.test(document.querySelector('.dev-collect').textContent), null, { timeout: 10000 });
        assert.equal(app.post({ action: 'devExport', key }).items.length, 1);
        assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px 가로 스크롤');
        // 이 기기 끄기
        pg.once('dialog', d => d.accept());
        await pg.click('.dev-collect [data-act=off]');
        assert.match(await pg.textContent('.dev-collect'), /꺼짐/);
        assert.equal(await pg.evaluate(() => DevCollect.active()), false);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
