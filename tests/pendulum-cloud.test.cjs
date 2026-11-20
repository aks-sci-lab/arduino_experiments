// 스마트폰 진자: 조 코드·원본 데이터 줄이기·보낼 내용·저장소(js/lab-store.js, 가짜 메모리 DB) 시험
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/pendulum-math.js');
const C = require('../js/pendulum-cloud.js');
const { loadLabStore } = require('./fake-lab-store.cjs');

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

test('목록 합치기: 새 측정은 뒤에, 같은 id 는 고친 값으로', () => {
    const a = { id: 'a', L: 1, T: 2 }, b = { id: 'b', L: 0.5, T: 1.4 };
    let m = C.mergeItems([], [a]);
    assert.deepEqual(m.added, ['a']);
    m = C.mergeItems(m.items, [a, b]);
    assert.deepEqual(m.added, ['b']); assert.equal(m.items.length, 2);
    m = C.mergeItems(m.items, [{ ...a, T: 2.01 }, b]);
    assert.deepEqual(m.added, ['a']); assert.equal(m.items[0].T, 2.01);
});

test('요청: 예전 시트(Apps Script) 주소는 보내지 않고 안내, 저장소 주소는 저장소로', async () => {
    const old = await C.list('https://script.google.com/macros/s/AKfycb' + 'X'.repeat(40) + '/exec', '2-3-4821');
    assert.equal(old.ok, false); assert.equal(old.legacy, true); assert.match(old.error, /새 QR/);
    assert.equal(typeof C.parseResponse, 'undefined');
    assert.equal(typeof C.scriptIdFromUrl, 'undefined');
});

test('저장소: 저장 → 목록 → 원본, 같은 id 는 고쳐 씀, 다른 조는 안 보임', async () => {
    const gs = loadLabStore();
    const s = P.simulate({ L: 0.7, duration: 25, seed: 8 });
    const r = P.analyze(s, { nPeriods: 10 });
    const { payload } = C.buildSavePayload({ id: 'mtest000001', group: '2-3-4821', conditions: { L: '0.70', amplitude: '5' }, result: r, samples: s, source: 'sensor', device: 'iOS' });
    const res = await gs.post(payload);
    assert.equal(res.ok, true, res.error); assert.equal(res.updated, false);
    await gs.post({ ...payload, id: 'mtest000002', group: '2-4-1111' });
    const list = await gs.get({ action: 'list', group: '2-3-4821' });
    assert.equal(list.items.length, 1);
    const item = C.itemFromServer(list.items[0]);
    assert.equal(item.L, 0.7); assert.ok(Math.abs(item.T - r.T) < 1e-4); assert.equal(item.hasRaw, true);
    assert.equal(list.items[0].rawData, undefined, '목록에는 원본을 빼서 가볍게');
    assert.equal((await gs.post({ ...payload, T_mean: 1.7 })).updated, true);
    assert.equal((await gs.get({ action: 'list', group: '2-3-4821' })).items[0].T_mean, 1.7);
    const raw = await gs.get({ action: 'raw', group: '2-3-4821', id: 'mtest000001' });
    assert.equal(C.unpackSamples(raw.raw).length, s.length);
});

test('저장소: 잘못된 요청은 막고 이유를 알려 줌, 받지 않은 항목은 저장 안 함', async () => {
    const gs = loadLabStore();
    const good = { action: 'save', id: 'mtest000003', group: '1-1-0001', L: 1, nPeriods: 10, T_mean: 2.0, T_std: 0.01, raw: [] };
    assert.match((await gs.post({ ...good, group: '1-1' })).error, /조 코드/);
    assert.match((await gs.post({ ...good, L: -1 })).error, /줄 길이/);
    assert.match((await gs.post({ ...good, T_mean: 'x' })).error, /주기/);
    assert.match((await gs.post({ ...good, id: 'a b' })).error, /id/);
    assert.equal((await gs.post({ ...good, note: '=IMPORTXML("x")', name: '홍길동', email: 'a@b.c' })).ok, true);
    const docs = JSON.stringify(gs.items());
    assert.ok(!docs.includes('홍길동') && !docs.includes('a@b.c'), '받지 않은 항목은 저장 안 함');
});

test('저장 공간 고르기 (2026-11-18 Firestore): 링크의 ?s=공간 > 조 코드 공간, 예전 Apps Script 링크는 legacy, 기억하지 않음', () => {
    const sp = 'c' + 'a1'.repeat(11) + 'b';
    assert.deepEqual(C.resolveServer(''), { url: 'lab:', id: null, from: 'default' });
    assert.deepEqual(C.resolveServer('?s=' + sp + '&group=2-3-4821'), { url: 'lab:' + sp, id: sp, from: 'link' });
    assert.equal(C.resolveServer('?s=' + 'p' + 'z'.repeat(23)).from, 'link');
    assert.equal(C.resolveServer('?s=AKfycb' + 'X'.repeat(40)).from, 'legacy');
    assert.equal(C.resolveServer('?s=AKfycb' + 'X'.repeat(40)).url, 'lab:');
    assert.equal(C.resolveServer('?s=bad!id').from, 'default');
    assert.equal(C.isScriptId('<script>alert(1)</script>xxxxxxxxxxxx'), false);
    assert.equal(C.isLab('lab:'), true); assert.equal(C.isLab('https://script.google.com/x'), false);
});
