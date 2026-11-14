// 스마트폰 진자: 조 코드·원본 데이터 줄이기·보낼 내용·서버 응답 해석·Apps Script(Code.gs) 시험
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/pendulum-math.js');
const C = require('../js/pendulum-cloud.js');
const { loadCodeGs } = require('./fake-apps-script.cjs');

test('조 코드: 만들기·형식 검사·정리', () => {
    assert.equal(C.makeGroupCode(2, 3, () => 0.4821), '2-3-4821');
    assert.equal(C.makeGroupCode(12, 7, () => 0.0005), '12-7-0005');
    assert.equal(C.makeGroupCode(0, 3), null);
    assert.equal(C.makeGroupCode(2, 100), null);
    assert.ok(C.isGroupCode('2-3-4821'));
    for (const bad of ['', '2-3-482', '2-3-48211', 'a-3-4821', '2-3', '2-3-4821<script>', '123-3-4821']) assert.equal(C.isGroupCode(bad), false, bad);
    assert.equal(C.normalizeGroup(' 2 - 3 - 4821 '), '2-3-4821');
    assert.equal(C.normalizeGroup('２–３–４８２１'), '2-3-4821');
    assert.equal(C.normalizeGroup('2.3.4821'), '2-3-4821');
    assert.deepEqual(C.groupParts('2-3-4821'), { ban: 2, jo: 3, key: '4821' });
    assert.match(C.newId(), /^[A-Za-z0-9_-]{6,40}$/);
});

test('원본 데이터 줄이기: 다시 풀면 정한 자릿수까지 그대로, 30초 60Hz 는 줄이지 않고 들어감', () => {
    const s = P.simulate({ L: 1, duration: 30, rate: 60, noise: 2, seed: 3 });
    const p = C.packSamples(s);
    assert.equal(p.step, 1);
    assert.ok(p.parts.length <= C.RAW_CELLS && p.parts.every(x => x.length <= C.CELL_MAX));
    const back = C.unpackSamples(p.parts);
    assert.equal(back.length, s.length);
    back.forEach((b, i) => {
        assert.ok(Math.abs(b.t - (s[i].t - s[0].t)) <= 0.5 + 1e-9);
        assert.ok(Math.abs(b.ay - s[i].ay) <= 0.005 + 1e-9);
        assert.ok(Math.abs(b.alpha - s[i].alpha) <= 0.05 + 1e-9);
    });
    // 풀어낸 데이터로 계산한 주기가 원래와 같음
    const T0 = P.analyze(s, { nPeriods: 10 }).T, T1 = P.analyze(back, { nPeriods: 10 }).T;
    assert.ok(Math.abs(T0 - T1) < 1e-3, `${T0} vs ${T1}`);
});

test('원본 데이터 줄이기: 너무 길면 점을 골라 셀 6칸 안에 맞춤', () => {
    const s = P.simulate({ L: 1, duration: 120, rate: 200, noise: 3, seed: 1 });
    const p = C.packSamples(s);
    assert.ok(p.step >= 2, `step ${p.step}`);
    assert.ok(p.parts.length <= C.RAW_CELLS && p.parts.every(x => x.length <= C.CELL_MAX));
    const back = C.unpackSamples(p.parts);
    assert.equal(back.length, p.n);
    const r = P.analyze(back, { nPeriods: 10 });
    assert.ok(Math.abs(r.T - P.theoryPeriod(1, P.G_STD, 5)) < 0.02);
});

test('보낼 내용: 조 코드·L·계산 결과가 없으면 쉬운 말로 막음', () => {
    const s = P.simulate({ L: 1, duration: 25, seed: 2 });
    const r = P.analyze(s, { nPeriods: 10 });
    const base = { id: 'mabc123456', group: '2-3-4821', conditions: { L: '1.00', amplitude: '5', note: 'x' }, result: r, samples: s, source: 'simulation' };
    const ok = C.buildSavePayload(base);
    assert.equal(ok.error, undefined);
    assert.equal(ok.payload.L, 1); assert.equal(ok.payload.nPeriods, 10); assert.equal(ok.payload.source, 'simulation');
    assert.ok(JSON.stringify(ok.payload).length < 400000);
    assert.match(C.buildSavePayload({ ...base, group: '' }).error, /조 코드/);
    assert.match(C.buildSavePayload({ ...base, conditions: { L: '' } }).error, /줄 길이/);
    assert.match(C.buildSavePayload({ ...base, result: { error: 'x' } }).error, /주기/);
});

test('서버 응답 해석: 정상·오류·로그인 화면(HTML)', () => {
    assert.deepEqual(C.parseResponse('{"ok":true,"items":[]}'), { ok: true, items: [] });
    assert.equal(C.parseResponse('{"ok":false,"error":"조 코드"}').error, '조 코드');
    assert.match(C.parseResponse('<!DOCTYPE html><html>로그인').error, /모든 사용자/);
    assert.equal(C.parseResponse('???').ok, false);
});

test('목록 합치기: 새 측정은 뒤에, 같은 id 는 고친 값으로', () => {
    const a = { id: 'a', L: 1, T: 2 }, b = { id: 'b', L: 0.5, T: 1.4 };
    let m = C.mergeItems([], [a]);
    assert.deepEqual(m.added, ['a']);
    m = C.mergeItems(m.items, [a, b]);
    assert.deepEqual(m.added, ['b']); assert.equal(m.items.length, 2);
    m = C.mergeItems(m.items, [{ ...a, T: 2.01 }, b]);
    assert.deepEqual(m.added, ['a']); assert.equal(m.items[0].T, 2.01);
});

test('요청: 주소가 없으면 선생님 설정 안내, 연결 실패는 network 표시', async () => {
    assert.equal((await C.list('', '2-3-4821')).noConfig, true);
    const fail = await C.list('https://x', '2-3-4821', () => Promise.reject(new Error('offline')));
    assert.equal(fail.network, true);
    let seen;
    const ok = await C.save('https://x/exec', { a: 1 }, (url, init) => { seen = init; return Promise.resolve({ text: () => Promise.resolve('{"ok":true,"id":"m1"}') }); });
    assert.equal(ok.ok, true);
    assert.equal(seen.method, 'POST');
    assert.equal(seen.headers['Content-Type'], 'text/plain;charset=utf-8', '미리보기 요청이 생기지 않는 단순 요청');
});

test('Apps Script: 저장 → 목록 → 원본, 같은 id 는 고쳐 씀, 다른 조는 안 보임', () => {
    const gs = loadCodeGs();
    assert.equal(gs.get({ action: 'ping' }).ok, true);
    const s = P.simulate({ L: 0.7, duration: 25, seed: 8 });
    const r = P.analyze(s, { nPeriods: 10 });
    const { payload } = C.buildSavePayload({ id: 'mtest000001', group: '2-3-4821', conditions: { L: '0.70', amplitude: '5' }, result: r, samples: s, source: 'sensor', device: 'iOS' });
    const res = gs.post(payload);
    assert.deepEqual(res, { ok: true, id: 'mtest000001', updated: false });
    assert.deepEqual(gs.ss.sheets.get('measurements').rows[0].slice(0, 10),
        ['timestamp', 'groupCode', 'L', 'amplitude', 'sensorAxis', 'nPeriods', 'T_mean', 'T_std', 'rawData', 'note'], '명세서 4절 열 순서');
    // 다른 조
    gs.post({ ...payload, id: 'mtest000002', group: '2-4-1111' });
    const list = gs.get({ action: 'list', group: '2-3-4821' });
    assert.equal(list.items.length, 1);
    const item = C.itemFromServer(list.items[0]);
    assert.equal(item.L, 0.7); assert.ok(Math.abs(item.T - r.T) < 1e-4); assert.equal(item.hasRaw, true);
    assert.equal(list.items[0].rawData, undefined, '목록에는 원본을 빼서 가볍게');
    // 같은 id 로 다시 보내면 한 줄을 고침
    assert.equal(gs.post({ ...payload, T_mean: 1.7 }).updated, true);
    assert.equal(gs.get({ action: 'list', group: '2-3-4821' }).items[0].T_mean, 1.7);
    // 원본
    const raw = gs.get({ action: 'raw', group: '2-3-4821', id: 'mtest000001' });
    assert.equal(C.unpackSamples(raw.raw).length, s.length);
    // 시트를 고르는 4단계용 시트는 아직 없음(첫 요청에 measurements 만)
    assert.ok(gs.ss.sheets.has('measurements'));
});

test('Apps Script: 잘못된 요청은 막고 이유를 알려 줌, 수식처럼 보이는 글은 글자로 저장', () => {
    const gs = loadCodeGs();
    const good = { action: 'save', id: 'mtest000003', group: '1-1-0001', L: 1, nPeriods: 10, T_mean: 2.0, T_std: 0.01, raw: [] };
    assert.match(gs.post({ ...good, group: '1-1' }).error, /조 코드/);
    assert.match(gs.post({ ...good, L: -1 }).error, /줄 길이/);
    assert.match(gs.post({ ...good, T_mean: 'x' }).error, /주기/);
    assert.match(gs.post({ ...good, id: 'a b' }).error, /id/);
    assert.match(gs.post({ ...good, raw: ['x'.repeat(50000)] }).error, /원본/);
    assert.match(gs.post('x'.repeat(400001)).error, /너무 큽니다/);
    assert.match(gs.post('not json').error, /JSON|Unexpected|token/i);
    assert.match(gs.get({ action: 'list', group: 'abc' }).error, /조 코드/);
    assert.equal(gs.post({ ...good, note: '=IMPORTXML("x")', name: '홍길동', email: 'a@b.c' }).ok, true);
    const row = gs.ss.sheets.get('measurements').rows[1];
    assert.equal(row[9], "'=IMPORTXML(\"x\")");
    assert.ok(!JSON.stringify(row).includes('홍길동') && !JSON.stringify(row).includes('a@b.c'), '받지 않은 항목은 저장 안 함');
});
