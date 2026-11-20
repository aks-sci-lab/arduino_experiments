// 이상기체 실험 조 공유 자료 바꾸기 (js/ideal-gas-share.js) + 공통 부품·가짜 저장소(tests/fake-lab-store.cjs)와 맞물리는지
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/ideal-gas-math.js');
const S = require('../js/ideal-gas-share.js');
const CS = require('../js/class-share.js');
const PCF = require('../js/pendulum-cloud.js');
const { loadLabStore } = require('./fake-lab-store.cjs');

const boyle = [101.3, 85, 70, 60].map((p, i) => ({ v: +(2026 / p).toFixed(2), p, t: 20 + i * 0.1, dir: i === 3 ? 'up' : 'down', src: 'sensor' }));
const gay = [20, 25, 30, 35].map((t, i) => ({ at: 1000000 + i * 5000, t, p: +(70 * (t + 273.15) / 293.15).toFixed(3), src: 'sensor' }));

test('보낼 것: 실험 1·2 한 줄씩, 요약 이름은 서버 규칙에 맞고 점 자료가 그대로', async () => {
    const ba = G.boyleAnalysis(boyle), ga = G.gayLussacAnalysis(S.gayPoints(gay));
    const items = S.buildItems({ boyle, gay, dead: 0.5, ba, ga });
    assert.deepEqual(items.map(x => x.id), ['boyle1', 'gay1']);
    assert.equal(items[0].n, 4); assert.equal(items[1].n, 4);
    for (const it of items) for (const k of Object.keys(it.summary)) assert.match(k, /^[A-Za-z0-9_가-힣 .()-]{1,30}$/, k);
    assert.equal(items[0].summary['PV 평균'], 2026);
    assert.match(items[0].summary['PV 변동'], /^\d+\.\d\d%$/);
    assert.ok(Math.abs(items[1].summary['절대 영도(C)'] + 273.2) < 1);
    assert.equal(items[0].data.dead, 0.5);
    assert.deepEqual(items[0].data.points[3], { v: boyle[3].v, p: 60, t: 20.3, dir: 'up' });
    assert.deepEqual(items[1].data.points.map(q => q.s), [0, 5, 10, 15]);
    // 측정이 없으면 보낼 것도 없음 (class-share 가 예전에 보낸 줄을 '지움'으로 보냄)
    assert.deepEqual(S.buildItems({ boyle: [], gay: [], ba: null, ga: null }), []);
});

test('받은 것: 노트북별로 따로 두고, 바뀔 때만 true, 목록에서 빠진 노트북은 지움, 엉뚱한 값은 버림', async () => {
    const ext = { 'f:a.csv': { from: '파일 a.csv', sentAt: '', boyle: [{ v: 1, p: 50, t: 20, dir: 'down' }], gay: [] } };
    const items = [
        { id: 'boyle1', device: 'nabc123', from: '노트북 C123', sentAt: '2026-11-16T01:00:00Z', data: { points: [{ v: 20, p: 101, t: 20, dir: 'down' }, { v: 'x', p: 1, t: 1 }, { v: 25, p: 500, t: 20 }] } },
        { id: 'gay1', device: 'nabc123', from: '노트북 C123', sentAt: '2026-11-16T01:02:00Z', data: { points: [{ s: 0, t: 20, p: 70 }, { s: 5, t: 30, p: 72.4 }] } }
    ];
    assert.equal(S.applyIncoming(ext, items), true);
    assert.equal(ext['d:nabc123'].boyle.length, 1);   // 글자·200 kPa 넘는 값은 버림
    assert.equal(ext['d:nabc123'].gay.length, 2);
    assert.equal(ext['d:nabc123'].sentAt, '2026-11-16T01:02:00Z');
    assert.equal(S.extCount(ext), 1 + 1 + 2);
    assert.equal(S.applyIncoming(ext, items), false, '같은 것을 다시 받으면 바뀐 것 없음');
    // 합친 목록: 내 기록 뒤에 불러온 값 (from 붙음) → 분석에도 from 이 남는다
    const c = S.combined({ boyle, gay, ext });
    assert.equal(c.boyle.length, 4 + 2); assert.equal(c.gay.length, 4 + 2);
    assert.equal(c.boyle[4].from, '파일 a.csv'); assert.equal(c.gay[5].from, '노트북 C123');
    assert.equal(G.boyleAnalysis(c.boyle).rows[5].from, '노트북 C123');
    // 그 노트북이 측정을 지우면(목록에서 빠짐) 내 노트북에서도 빠지고, CSV 로 불러온 것은 그대로
    assert.equal(S.applyIncoming(ext, []), true);
    assert.deepEqual(Object.keys(ext), ['f:a.csv']);
});

test('CSV: 이 페이지 CSV 를 읽고, 그 노트북도 불러온 값(from:)은 빼서 겹치지 않게', async () => {
    const csv = '﻿experiment,no,process,time_s,scale_volume_mL,air_volume_mL,pressure_kPa,temp_C,PV_kPa_mL,P_over_T_kPa_per_K,source\n' +
        'boyle,1,down,,20,20.5,101.3,20.1,2076.65,,sensor\n' +
        'boyle,2,up,,30,30.5,67,20.2,2043.5,,hand\n' +
        'boyle,3,down,,25,25.5,80,20,2040,,from:노트북 AB12\n' +
        'gay-lussac,1,,0.0,,,70,20,,0.23879,sensor\n' +
        'gay-lussac,2,,5.0,,,71.2,25,,0.23880,sensor\n';
    const r = S.parseCsv(csv);
    assert.deepEqual(r.boyle, [{ v: 20, p: 101.3, t: 20.1, dir: 'down' }, { v: 30, p: 67, t: 20.2, dir: 'up' }]);
    assert.deepEqual(r.gay, [{ s: 0, t: 20, p: 70 }, { s: 5, t: 25, p: 71.2 }]);
    assert.match(S.parseCsv('a,b\n1,2').error, /CSV 가 아닙니다/);
    assert.match(S.parseCsv('').error, /빈 파일/);
});

test('가짜 서버(진짜 시트처럼 조 코드가 날짜로 바뀌는 시트)로: 노트북 A 보내기 → 노트북 B 목록에서 받아 합침', async () => {
    const app = loadLabStore();
    const group = '2-3-5376';
    const ba = G.boyleAnalysis(boyle), ga = G.gayLussacAnalysis(S.gayPoints(gay));
    const b = CS.buildPayloads({ exp: 'idealgas', group, device: 'nAAAA11', items: S.buildItems({ boyle, gay, ba, ga }), sent: [], isGroupCode: PCF.isGroupCode });
    assert.ok(!b.error, b.error);
    for (const pl of b.payloads) { const body = Object.assign({}, pl); delete body.tooBig; const r = (await app.post(body)); assert.ok(r.ok, JSON.stringify(r)); }
    const list = (await app.get({ action: 'list', exp: 'idealgas', group }));
    assert.ok(list.ok, JSON.stringify(list));
    assert.equal(list.items.length, 2);
    const ext = {};
    assert.equal(S.applyIncoming(ext, CS.incomingFrom(list.items, 'nBBBB22')), true);
    assert.equal(ext['d:nAAAA11'].boyle.length, 4);
    assert.equal(ext['d:nAAAA11'].gay.length, 4);
    assert.equal(ext['d:nAAAA11'].from, '노트북 AA11');
    // 내 노트북(A)이 보낸 것은 A 에서 다시 불러오지 않음
    assert.equal(S.applyIncoming({}, CS.incomingFrom(list.items, 'nAAAA11')), false);
});
