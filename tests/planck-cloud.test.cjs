// LED 플랑크 상수 조 공유: 보낼 내용·받은 값 합치기·CSV 불러오기, 그리고 저장소(js/lab-store.js, 가짜 메모리 DB)의 planck 줄
const test = require('node:test');
const assert = require('node:assert/strict');
const PC = require('../js/planck-cloud.js');
const C = require('../js/pendulum-cloud.js');
const P = require('../js/planck-math.js');
const { loadLabStore } = require('./fake-lab-store.cjs');

const ivFor = vt => [0, 0.1, 0.2, 0.3].map(d => ({ v: +(vt + d).toFixed(3), i: +(d * 40).toFixed(3), vr: +(d * 40 * 0.33).toFixed(4), r: 330 }));
function leds() {
    return [
        { id: 'red', key: 'red', name: '빨강', lambda: 625, on: true, fit: true, iv: ivFor(1.8), glow: [1.75, 1.78] },
        { id: 'green', key: 'green', name: '초록', lambda: 525, on: true, fit: true, iv: [], glow: [] },
        { id: 'led1x', key: null, name: '=1+1', lambda: 590, on: true, fit: true, iv: ivFor(2.0), glow: [] }
    ];
}
const base = over => Object.assign({
    group: '2-3-5376', device: 'nab12cd', leds: leds(), sent: [],
    v0: (led, m) => { const t = P.thresholdOf(led, m === 'glow' ? 'glow' : 'extrapolate', { iMin: 1 }); return t.error ? null : t.v0; },
    summary: { hCurrent: 6.512345678, errorPct: -1.7, r2: 0.998, hGlow: null }, curMode: 'extrapolate', iMin: 1, now: '2026-11-14T10:00:00.000Z'
}, over);

test('측정점 글자로 바꾸기·되돌리기', () => {
    const iv = [{ v: 1.81234567, i: 0.1234567, vr: 0.0004, r: 330 }, { v: 2, i: 3, src: 'sensor' }];
    const back = PC.decodeIv(PC.encodeIv(iv));
    assert.deepEqual(back, [{ v: 1.8123, i: 0.12346, vr: 0.0004, r: 330 }, { v: 2, i: 3, src: 'sensor' }]);
    assert.deepEqual(PC.decodeGlow(PC.encodeGlow([1.75, 2.1])), [1.75, 2.1]);
    assert.deepEqual(PC.decodeIv('망가진 글자'), []);
    assert.deepEqual(PC.decodeIv('[[1,"a"],[-1,2],[1.5,0.2]]'), [{ v: 1.5, i: 0.2 }]);
});

test('보낼 내용: 직접 잰 LED 만, 조 코드·노트북 번호 검사, 예전에 보낸 LED 는 빈 줄로', () => {
    const r = PC.buildPayloads(base(), C.isGroupCode);
    assert.equal(r.error, undefined);
    assert.deepEqual(r.payloads.map(p => p.led), ['빨강', '=1+1']);
    const red = r.payloads[0];
    assert.equal(red.exp, 'planck'); assert.equal(red.action, 'save');
    assert.equal(red.id, 'nab12cd-red'); assert.equal(red.nIV, 4); assert.equal(red.nGlow, 2);
    assert.ok(Math.abs(red.v0Current - 1.8) < 0.02, String(red.v0Current));
    assert.equal(red.hCurrent, 6.51235);
    assert.equal(red.hGlow, '');
    assert.ok(!('name' in red) && !('student' in red));
    assert.match(PC.buildPayloads(base({ group: '' }), C.isGroupCode).error, /조 코드/);
    assert.match(PC.buildPayloads(base({ device: '' }), C.isGroupCode).error, /노트북/);
    const none = leds().map(l => Object.assign(l, { iv: [], glow: [] }));
    assert.match(PC.buildPayloads(base({ leds: none }), C.isGroupCode).error, /직접 잰 값이 없습니다/);
    const again = PC.buildPayloads(base({ leds: none, sent: ['nab12cd-green'] }), C.isGroupCode);
    assert.deepEqual(again.payloads.map(p => [p.id, p.nIV, p.iv]), [['nab12cd-green', 0, '[]']]);
});

test('불러온 값 합치기: 같은 출처는 바꿔 쓰고, 내 기록과 따로, 없는 LED 는 새로', () => {
    const mine = leds();
    let n = 0;
    const mk = () => 'x' + (++n);
    const items = [
        { device: 'nab12cd', ledKey: 'red', led: '빨강', lambda_nm: 625, ivData: '[[9,9]]', glowData: '[]' },   // 내 노트북 → 빼기
        { device: 'nzz9999', ledKey: 'green', led: '초록', lambda_nm: 525, ivData: PC.encodeIv(ivFor(2.2)), glowData: '[2.3]' },
        { device: 'nzz9999', ledKey: '', led: 1234, lambda_nm: 700, ivData: PC.encodeIv(ivFor(1.6)), glowData: '[]' }       // 이름이 숫자로 와도
    ];
    const entries = PC.entriesFromServer(items, 'nab12cd');
    assert.equal(entries.length, 2);
    let r = PC.applyEntries(mine, entries, mk);
    assert.equal(r.changed, true); assert.equal(r.newLeds, 1); assert.equal(r.points, 4 + 1 + 4);
    const green = mine.find(l => l.id === 'green');
    assert.equal(green.iv.length, 0, '내 기록은 그대로');
    assert.equal(PC.merged(green).iv.length, 4);
    assert.equal(PC.merged(green).iv[0].from, '노트북 9999');
    assert.equal(PC.extCount(green), 5);
    assert.equal(mine.find(l => l.id === 'x1').name, '1234');
    // 같은 내용을 다시 불러오면 바뀌지 않고 두 번 들어가지 않음
    r = PC.applyEntries(mine, PC.entriesFromServer(items, 'nab12cd'), mk);
    assert.equal(r.changed, false); assert.equal(PC.merged(green).iv.length, 4);
    // 그 노트북이 값을 지우고 빈 줄을 보내면 여기서도 빠짐
    r = PC.applyEntries(mine, PC.entriesFromServer([{ device: 'nzz9999', ledKey: 'green', led: '초록', lambda_nm: 525, ivData: '[]', glowData: '[]' }], 'x'), mk);
    assert.equal(r.changed, true); assert.equal(PC.extCount(green), 0);
    // 합친 값으로 문턱 전압 계산
    const red = mine.find(l => l.id === 'red');
    PC.applyEntries(mine, [{ src: 'n:b', label: 'b', key: 'red', name: '빨강', lambda: 625, iv: ivFor(1.8).map(p => ({ ...p, i: p.i + 0.01 })), glow: [] }], mk);
    assert.ok(!P.thresholdOf(PC.merged(red), 'extrapolate', { iMin: 1 }).error);
});

test('CSV 불러오기: 이 페이지의 CSV(따옴표 이름·from 칸)를 LED 별로', () => {
    const csv = '﻿led,wavelength_nm,frequency_1e14Hz,method,voltage_V,current_mA,resistor_voltage_V,resistor_ohm,source,from\n' +
        '"빨강, 5mm",625,4.7967,current,1.8,0,0,330,multimeter,\n' +
        '"빨강, 5mm",625,4.7967,current,1.9,4,1.32,330,sensor,"노트북 AB12"\n' +
        '"빨강, 5mm",625,4.7967,glow,1.75,,,,eye,\n' +
        '파랑,470,6.3786,current,2.6,1.5,,,multimeter,\n' +
        '잘못,50,1,current,1,1,,,multimeter,\n';
    const r = PC.parseCsv(csv);
    assert.equal(r.error, undefined);
    assert.equal(r.rows, 4);
    assert.deepEqual(r.entries.map(e => [e.name, e.lambda, e.iv.length, e.glow.length]), [['빨강, 5mm', 625, 2, 1], ['파랑', 470, 1, 0]]);
    assert.deepEqual(r.entries[0].iv[1], { v: 1.9, i: 4, vr: 1.32, r: 330, src: 'sensor' });
    // 예전 CSV (source·from 칸 없음)도
    assert.equal(PC.parseCsv('led,wavelength_nm,frequency_1e14Hz,method,voltage_V,current_mA\nA,600,5,current,2,1\n').rows, 1);
    assert.match(PC.parseCsv('a,b\n1,2').error, /CSV/);
    assert.match(PC.parseCsv('').error, /빈/);
});

test('저장소: planck 줄 저장·고쳐 쓰기, 같은 조 목록에 나옴, 다른 조는 섞이지 않음', async () => {
    const app = loadLabStore();
    const pls = PC.buildPayloads(base(), C.isGroupCode).payloads;
    for (const p of pls) { const r = await app.post(p); assert.equal(r.ok, true, r.error); assert.equal(r.updated, false); }
    const other = PC.buildPayloads(base({ device: 'nzz9999' }), C.isGroupCode).payloads[0];
    await app.post(other);
    await app.post(Object.assign({}, other, { group: '1-1-0001' }));
    let list = await app.get({ action: 'list', exp: 'planck', group: '2-3-5376' });
    assert.equal(list.ok, true, list.error);
    assert.equal(list.items.length, 3);
    const it = list.items.find(x => x.id === 'nzz9999-red');
    assert.equal(it.device, 'nzz9999'); assert.equal(it.ledKey, 'red'); assert.equal(it.led, '빨강');
    assert.deepEqual(PC.decodeIv(it.ivData), PC.decodeIv(other.iv));
    const fix = Object.assign({}, pls[0], { iv: '[[1.9,2]]', nIV: 1 });
    assert.equal((await app.post(fix)).updated, true);
    list = await app.get({ action: 'list', exp: 'planck', group: '2-3-5376' });
    assert.equal(list.items.length, 3);
    assert.equal(PC.decodeIv(list.items.find(x => x.id === 'nab12cd-red').ivData).length, 1);
    const mine = leds().map(l => Object.assign(l, { iv: [], glow: [] }));
    const res = PC.applyEntries(mine, PC.entriesFromServer(list.items, 'nzz9999'), () => 'y1');
    assert.equal(res.points, 1 + 2 + 4);
});

test('저장소: planck 값 검사 (형식·범위·크기)', async () => {
    const app = loadLabStore();
    const ok = PC.buildPayloads(base(), C.isGroupCode).payloads[0];
    const bad = async over => app.post(Object.assign({}, ok, over));
    assert.match((await bad({ group: '2-3' })).error, /조 코드/);
    assert.match((await bad({ id: 'a' })).error, /id/);
    assert.match((await bad({ device: '<x>' })).error, /노트북/);
    assert.match((await bad({ led: '  ' })).error, /LED 이름/);
    assert.match((await bad({ lambda: 5000 })).error, /파장/);
    assert.match((await bad({ iv: '[[1,99999]]' })).error, /전류/);
    assert.match((await bad({ iv: JSON.stringify(Array.from({ length: 501 }, () => [1, 1])) })).error, /점 수/);
    assert.match((await bad({ glow: '["=HACK()"]' })).error, /전압/);
    assert.equal((await bad({ iv: '[[1.9, 2, null, null, "yes"]]' })).ok, true, '숫자가 아닌 칸은 버리고 저장');
});
