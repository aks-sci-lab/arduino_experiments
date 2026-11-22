// 개발 데이터 자동 수집 (2026-11-18 Firestore): js/lab-store.js devSave·devExport, js/dev-collect.js, tools/dev-data-pull.cjs, 심박수 페이지 띠
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
const DC = require('../js/dev-collect.js');
const PULL = require('../tools/dev-data-pull.cjs');
const REPO = path.join(__dirname, '..');
const ADMIN = { admin: true };

const rec = (id, extra) => Object.assign({ action: 'devSave', exp: 'heartrate', id, measuredAt: '2026-11-17T01:02:03.000Z', device: 'dvabc123',
    summary: { '심박수': 72, '노출': 'locked' }, data: JSON.stringify({ csv: 't,R\n0,1\n', result: { bpm: 72 } }) }, extra || {});

test('저장소: devSave 는 구글 로그인(선생님)만, 같은 id 는 고쳐 씀, 받는 실험만, devExport 는 관리자(서버)만', async () => {
    const app = loadLabStore();
    assert.match((await app.post(rec('hr-aaaaaa-1'), { uid: 'anon' })).error, /선생님 구글 로그인/);
    assert.match((await app.post(rec('hr-aaaaaa-1', { exp: 'planck' }))).error, /받지 않는 실험/);
    assert.match((await app.post(rec('a b'))).error, /id/);
    assert.equal((await app.post(rec('hr-aaaaaa-1'))).updated, false);
    assert.equal((await app.post(rec('hr-aaaaaa-1', { summary: { '심박수': 75 } }))).updated, true);
    assert.equal((await app.post(rec('fh-bbbbbb-1', { exp: 'facehr' }))).ok, true);
    assert.match((await app.post({ action: 'devExport' })).error, /관리자/);
    const all = await app.post({ action: 'devExport' }, ADMIN);
    assert.equal(all.ok, true); assert.equal(all.items.length, 2);
    const hr = all.items.find(x => x.id === 'hr-aaaaaa-1');
    assert.equal(hr.summary['심박수'], 75); assert.equal(hr.measuredAt, '2026-11-17T01:02:03.000Z'); assert.equal(JSON.parse(hr.data).csv, 't,R\n0,1\n');
    assert.equal((await app.post({ action: 'devExport', since: '2999-01-01T00:00:00Z' }, ADMIN)).items.length, 0);
    assert.match((await app.post({ action: 'devExport', since: 'abc' }, ADMIN)).error, /since/);
});

test('저장소: devExport 는 한 번에 40줄, since 로 이어 받기', async () => {
    let t = Date.parse('2026-11-17T00:00:00Z');
    const app = loadLabStore({ now: () => new Date(t += 1000) });
    for (let i = 0; i < 45; i++) assert.equal((await app.post(rec('hr-cccccc-' + i))).ok, true);
    const seen = new Set(); let since = '', calls = 0;
    for (;;) {
        const r = await app.post({ action: 'devExport', since }, ADMIN); calls++;
        r.items.forEach(x => seen.add(x.id));
        if (!r.more || !r.items.length) break;
        since = r.items[r.items.length - 1].timestamp;
    }
    assert.equal(seen.size, 45);
    assert.ok(calls <= 3);
});

function memStore(init) { const m = new Map(Object.entries(init || {})); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; }

test('도우미: 선생님 계정이 아닌 기기(학생)는 아무것도 보내지 않음, devCollect 꺼지면 멈춤', async () => {
    let calls = 0;
    const post = async () => { calls++; return { ok: true }; };
    const s1 = DC.create({ store: memStore(), post, enabled: true, admin: false });
    assert.equal(s1.active(), false);
    assert.equal((await s1.send('heartrate', { summary: {} })).skipped, true);
    const s2 = DC.create({ store: memStore(), post, enabled: false, admin: true });
    assert.equal(s2.active(), false);
    await s2.send('heartrate', {});
    assert.equal(calls, 0);
});

test('도우미: 선생님 기기는 보내고, 실패하면 쌓아 두었다가 다시, 권한이 없으면 멈춤', async () => {
    const bodies = []; let fail = true;
    const post = async b => { bodies.push(b); return fail ? { ok: false, error: '인터넷에 연결하지 못했어요' } : { ok: true }; };
    const store = memStore();
    const d = DC.create({ store, post, enabled: true, admin: true });
    assert.equal(d.active(), true);
    const r1 = await d.send('heartrate', { id: 'hr-x-r1', summary: { '심박수': 70 }, data: { csv: 'a\n' } });
    assert.equal(r1.ok, false); assert.equal(d.pending(), 1);
    assert.equal(bodies[0].key, undefined); assert.equal(bodies[0].action, 'devSave'); assert.equal(typeof bodies[0].data, 'string');
    await d.send('heartrate', { id: 'hr-x-r1', summary: { '심박수': 71 } });   // 같은 측정은 하나로
    assert.equal(d.pending(), 1);
    fail = false;
    const d2 = DC.create({ store, post, enabled: true, admin: true });
    assert.equal(d2.pending(), 1);
    const f = await d2.flush();
    assert.equal(f.ok, true); assert.equal(d2.pending(), 0); assert.equal(d2.sent(), 1);
    assert.equal(bodies[bodies.length - 1].summary['심박수'], 71);
    const d3 = DC.create({ store, post: async () => ({ ok: false, error: '저장소가 요청을 막았어요 (권한 없음).' }), enabled: true, admin: true });
    await d3.send('heartrate', { id: 'hr-x-r2' });
    assert.equal(d3.active(), false);
    assert.match(DC.uaSummary('Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'), /Android 14; SM-S918N · Chrome 131/);
    assert.match(DC.uaSummary('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'), /iPhone.*Safari 17/);
});

test('가져오기 도구: devExport → 날짜 폴더에 CSV·JSON, index.json, state.json, 두 번째는 새 것만', async () => {
    let t = Date.parse('2026-11-17T03:00:00Z');
    const app = loadLabStore({ now: () => new Date(t += 1000) });
    await app.post(rec('hr-dddddd-r1'));
    await app.post(rec('fh-dddddd-r1', { exp: 'facehr', measuredAt: '2026-11-17T20:00:00.000Z', data: JSON.stringify({ raw: { t: [0, 0.033], g: [100, 101] }, result: { bpm: 66 } }) }));
    let lastSince = null;
    const exportPage = async since => { lastSince = since; const r = await app.post({ action: 'devExport', since }, ADMIN); if (!r.ok) throw new Error(r.error); return r; };
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'devdata-'));
    assert.equal((await PULL.pull({ out })).skipped, true);
    const r = await PULL.pull({ out, exportPage });
    assert.equal(r.got, 2);
    assert.equal(fs.readFileSync(path.join(out, 'heart-rate/2026-11-17/hr-dddddd-r1.csv'), 'utf8'), 't,R\n0,1\n');
    const j = JSON.parse(fs.readFileSync(path.join(out, 'heart-rate/2026-11-17/hr-dddddd-r1.json'), 'utf8'));
    assert.equal(j.data.result.bpm, 72); assert.equal(j.data.csv, undefined); assert.equal(j.summary['심박수'], 72);
    assert.equal(fs.readFileSync(path.join(out, 'face-hr/2026-11-18/fh-dddddd-r1.csv'), 'utf8'), 't,g\n0,100\n0.033,101\n');
    const idx = JSON.parse(fs.readFileSync(path.join(out, 'heart-rate/index.json'), 'utf8'));
    assert.equal(idx.count, 1); assert.equal(idx.items[0].csv, 'heart-rate/2026-11-17/hr-dddddd-r1.csv');
    const st = JSON.parse(fs.readFileSync(path.join(out, 'state.json'), 'utf8'));
    assert.ok(st.since); assert.equal(st.total, 2);
    const before = fs.readFileSync(path.join(out, 'state.json'), 'utf8');
    assert.equal((await PULL.pull({ out, exportPage })).got, 0);
    assert.equal(lastSince, st.since);
    assert.equal(fs.readFileSync(path.join(out, 'state.json'), 'utf8'), before);
    await app.post(rec('hr-dddddd-r1', { summary: { '심박수': 72, '손목': 76 } }));
    assert.equal((await PULL.pull({ out, exportPage })).got, 1);
    const idx2 = JSON.parse(fs.readFileSync(path.join(out, 'heart-rate/index.json'), 'utf8'));
    assert.equal(idx2.count, 1); assert.equal(idx2.items[0].summary['손목'], 76);
    await assert.rejects(PULL.pull({ out, exportPage: async () => { throw new Error('권한 없음'); } }), /권한/);
    // Firestore 직접 읽기 모양({ items, more }, ok 없음)도 받아야 한다 (Actions 가 매번 '알 수 없음'으로 실패하던 것)
    const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'devpull2-'));
    const plain = await PULL.pull({ out: out2, exportPage: async since => (since ? { items: [], more: false } : { more: false, items: [{ timestamp: '2026-11-22T01:00:00.000Z', exp: 'heartrate', id: 'r27', measuredAt: '2026-11-22T00:59:00.000Z', device: 'd1', summary: { bpm: 82 }, data: JSON.stringify({ csv: 't_s,R\n0,80\n' }) }] }) });
    assert.equal(plain.got, 1);
    await assert.rejects(PULL.pull({ out: out2, exportPage: async () => ({ ok: false, error: '막힘' }) }), /막힘/);
});

test('워크플로: dev-data 브랜치에만, devCollect·서비스 계정 확인, 매시간', () => {
    const y = fs.readFileSync(path.join(REPO, '.github/workflows/dev-data-collect.yml'), 'utf8');
    assert.match(y, /cron:/); assert.match(y, /workflow_dispatch/);
    assert.match(y, /git push --quiet origin dev-data/); assert.ok(!/push[^\n]*main/.test(y.replace(/ref: main/, '')));
    assert.match(y, /devCollect:\[\[:space:\]\]\*true/); assert.match(y, /secrets\.FIREBASE_SERVICE_ACCOUNT/);
    assert.ok(!/DEV_SHEET_URL|DEV_ADMIN_KEY/.test(y));
    assert.match(y, /node site\/tools\/dev-data-pull\.cjs/);
    assert.match(fs.readFileSync(path.join(REPO, '.github/workflows/deploy-hosting.yml'), 'utf8'), /branches: \[main\]/);
});

let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
test('심박수 페이지: 학생(익명)이면 띠 없음, 선생님 구글 로그인 기기면 🧪 띠·보내면 저장소에', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const app = loadLabStore();
    const api = labServer(app);
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
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { devCollect: true }) }));
        await c.route(/cdn\.jsdelivr|gstatic/, r => r.abort());
        const pg = await c.newPage(); pg.on('pageerror', e => errors.push(e.message));
        await pg.goto(ROOT + 'projects/heart-rate.html');
        await pg.evaluate(() => DevCollect.init());
        assert.equal(await pg.locator('.dev-collect').count(), 0, '학생이면 띠 없음');
        assert.equal(await pg.evaluate(() => DevCollect.active()), false);
        // 선생님 구글 로그인 (가짜: 사이트 관리 교사)
        await pg.evaluate(() => localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })));
        await pg.reload();
        await pg.waitForSelector('.dev-collect', { timeout: 10000 });
        assert.match(await pg.textContent('.dev-collect'), /개발 데이터 자동 수집 중/);
        await pg.evaluate(() => DevCollect.send('heartrate', { id: 'hr-test-r1', summary: { '심박수': 70 }, data: { csv: 't\n0\n' } }));
        await pg.waitForFunction(() => /보냄 1/.test(document.querySelector('.dev-collect').textContent), null, { timeout: 10000 });
        assert.equal((await app.post({ action: 'devExport' }, ADMIN)).items.length, 1);
        assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px 가로 스크롤');
        pg.once('dialog', d => d.accept());
        await pg.click('.dev-collect [data-act=off]');
        assert.match(await pg.textContent('.dev-collect'), /꺼짐/);
        assert.equal(await pg.evaluate(() => DevCollect.active()), false);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
