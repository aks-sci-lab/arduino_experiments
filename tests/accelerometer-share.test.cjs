// 가속도계·스마트폰 가속도·자유낙하 조 공유 도우미(js/accelerometer-share.js) + 가짜 Apps Script 왕복
const test = require('node:test');
const assert = require('node:assert/strict');
const AS = require('../js/accelerometer-share.js');
const CS = require('../js/class-share.js');
const PD = require('../js/pendulum-cloud.js');
const CC = require('../js/class-cloud.js');
const { loadLabStore } = require('./fake-lab-store.cjs');

test('줄 줄이기: 반올림, 모양이 틀린 줄은 빼고, 너무 길면 고르게 솎음', async () => {
    const p = AS.pack([[0.123456, 1.234567, 2, 3, 99], [1, 'x', 0, 0], null, [2, 0, 0, 1]], ['t', 'x', 'y', 'z'], [3, 2, 2, 2]);
    assert.deepEqual(p, { cols: ['t', 'x', 'y', 'z'], step: 1, rows: [[0.123, 1.23, 2, 3], [2, 0, 0, 1]] });
    const long = Array.from({ length: 20000 }, (_, i) => [i * 0.005, Math.sin(i), Math.cos(i), 1 + i / 1e5]);
    const q = AS.pack(long, ['t', 'x', 'y', 'z'], [4, 4, 4, 4]);
    assert.ok(JSON.stringify(q).length <= AS.DATA_MAX);
    assert.ok(q.step >= 2);
    assert.equal(q.rows[0][0], 0);
    assert.deepEqual(AS.unpack(q, ['t', 'z']).length, q.rows.length);
    assert.deepEqual(AS.unpack({ cols: ['t'], rows: [[1]] }, ['t', 'x']), []);
    assert.deepEqual(AS.unpack('nope', ['t']), []);
});

test('가속도 요약: 점·시간·평균 |a|·최대 |a| (서버 요약 이름 규칙에 맞음)', async () => {
    const rows = [[0, 0, 0, 1], [0.01, 0, 0, 2], [0.03, 3, 4, 0]];
    const s = AS.accelSummary(rows);
    assert.deepEqual(s, { '점': 3, '시간 (s)': 0.03, '평균 a (g)': 2.667, '최대 a (g)': 5 });
    Object.keys(s).forEach(k => assert.match(k, /^[A-Za-z0-9_가-힣 .()-]{1,30}$/));
    const it = AS.accelItem('t1', '1회', rows.map(r => r.concat([9, 9])));   // 가속도계 페이지의 줄은 [t,x,y,z,total,ts]
    assert.deepEqual(it.data.rows[2], [0.03, 3, 4, 0]);
    assert.deepEqual(AS.accelRows(it.data), rows);
    assert.deepEqual(AS.accelSummary([]), { '점': 0 });
});

test('받은 것 보관: 노트북:id 로 따로, 같은 것은 바뀌지 않음, 빠진 것은 사라짐', async () => {
    const items = [{ id: 'a1', device: 'nzz9999', from: '노트북 9999', title: 'A', n: 2, summary: {}, sentAt: 's1', data: 1 },
        { id: 'b1', device: 'nqq1111', from: '노트북 1111', title: 'B', n: 1, summary: {}, sentAt: 's1', data: null }];
    const conv = it => (it.data ? { rows: [it.data] } : null);
    let r = AS.replaceIncoming({}, items, conv);
    assert.equal(r.changed, true);
    assert.deepEqual(Object.keys(r.store), ['nzz9999:a1']);
    assert.equal(AS.replaceIncoming(r.store, items, conv).changed, false);
    assert.equal(AS.replaceIncoming(r.store, [Object.assign({}, items[0], { sentAt: 's2' })], conv).changed, true);
    assert.deepEqual(AS.replaceIncoming(r.store, [], conv), { store: {}, changed: true });
});

test('자유낙하: 종류별 한 줄, 요약 g·오차·R²·vx, 받은 자료 되살리기', async () => {
    const rows = [{ t: 0, x: 0, y: 0 }, { t: 0.1, x: 50, y: 49.05 }, { t: 0.2, x: 100, y: 196.2 }];
    const ff = AS.freeFallItem({ mode: 'free-fall', rows, mmPerPx: 1.5, fit: { g: 9.8123, r2: 0.99991, errPct: 0.1255, vx: null } });
    assert.equal(ff.id, 'ff'); assert.equal(ff.n, 3); assert.equal(ff.title, '자유낙하 3점');
    assert.deepEqual(ff.summary, { '종류': '자유낙하', '점': 3, g: 9.812, '오차(퍼센트)': 0.1, R2: 0.9999 });
    assert.equal(ff.data.mode, 'free-fall'); assert.equal(ff.data.mmPerPx, 1.5);
    assert.equal(ff.data.fps, undefined);
    assert.equal(AS.freeFallItem({ mode: 'free-fall', rows, fps: 60 }).data.fps, 60, '영상 FPS 도 함께 (영상 자체는 보내지 않음)');
    Object.keys(ff.summary).forEach(k => assert.match(k, /^[A-Za-z0-9_가-힣 .()-]{1,30}$/, '서버 요약 이름 규칙: ' + k));
    const pj = AS.freeFallItem({ mode: 'projectile', rows, fit: { vx: 0.5 } });
    assert.equal(pj.id, 'pj'); assert.equal(pj.summary.vx, 0.5);
    assert.deepEqual(AS.freeFallFromData(JSON.parse(JSON.stringify(ff.data))), { mode: 'free-fall', rows });
    assert.equal(AS.freeFallFromData({ mode: 'other', cols: ['t', 'x', 'y'], rows: [[0, 0, 0]] }), null);
});

test('가짜 Apps Script: 세 실험 모두 공용 저장 → 같은 조 다른 노트북이 불러옴 (조 코드는 글자 그대로)', async () => {
    const app = loadLabStore();
    for (const exp of ['accel', 'phoneaccel', 'freefall']) assert.equal(CC.expInfo(exp).ready, true, exp);
    const items = {
        accel: [AS.accelItem('t1', '1회', [[0, 0, 0, 1], [0.01, 0, 0, 1.5]])],
        phoneaccel: [AS.accelItem('rec', '스마트폰 기록', [[0, 0, 0, 1]])],
        freefall: [AS.freeFallItem({ mode: 'projectile', rows: [{ t: 0, x: 1, y: 2 }], fit: { g: 9.7, r2: 0.99, errPct: 1.02, vx: 0.8 } })]
    };
    for (const exp of Object.keys(items)) {
        const b = CS.buildPayloads({ exp, group: '2-3-5376', device: 'nab12cd', items: items[exp], isGroupCode: PD.isGroupCode });
        assert.equal(b.error, undefined);
        for (const p of b.payloads) { const body = Object.assign({}, p); delete body.tooBig; const r = (await app.post(body)); assert.equal(r.ok, true, r.error); }
        const list = (await app.get({ action: 'list', exp, group: '2-3-5376' }));
        assert.equal(list.ok, true);
        const got = CS.incomingFrom(list.items, 'nother1');
        assert.equal(got.length, 1);
        assert.deepEqual(got[0].summary, items[exp][0].summary);
        if (exp === 'freefall') assert.equal(AS.freeFallFromData(got[0].data).rows[0].y, 2);
        else assert.deepEqual(AS.accelRows(got[0].data), items[exp][0].data.rows);
    }
    assert.equal(app.items()[0].group, '2-3-5376');
});
