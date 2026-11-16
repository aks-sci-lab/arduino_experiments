// 전자기 유도 조 공유 계산 (js/em-induction-share.js) + 공용 서버(가짜 Apps Script)로 두 노트북 주고받기
const test = require('node:test');
const assert = require('node:assert/strict');
const ES = require('../js/em-induction-share.js');
const CS = require('../js/class-share.js');
const { loadCodeGs } = require('./fake-apps-script.cjs');

function wave(n) {
    const rec = [];
    for (let k = 0; k < n; k++) {
        const t = k / 500;
        const v = 30 * Math.exp(-((t - 1) ** 2) / 0.002) - 40 * Math.exp(-((t - 1.2) ** 2) / 0.001);
        rec.push({ t, v, i: v / 25 });
    }
    return rec;
}

test('파형 줄이기: 600점 안, 처음·끝 점과 봉우리를 남긴다', () => {
    const rec = wave(2500);
    const w = ES.downsample(rec);
    assert.ok(w.t.length <= 600 && w.t.length > 500);
    assert.equal(w.t[0], 0);
    assert.equal(w.t[w.t.length - 1], +rec[rec.length - 1].t.toFixed(4));
    const maxRec = Math.max(...rec.map(p => p.v)), minRec = Math.min(...rec.map(p => p.v));
    assert.ok(Math.abs(Math.max(...w.v) - maxRec) < 0.01);
    assert.ok(Math.abs(Math.min(...w.v) - minRec) < 0.01);
    // 시간 순서 유지
    for (let k = 1; k < w.t.length; k++) assert.ok(w.t[k] >= w.t[k - 1]);
    assert.equal(ES.downsample(rec.slice(0, 10)).t.length, 10);
    assert.equal(ES.wavePoints(w).length, w.t.length);
});

test('예전 측정에 id 붙이기, 겹치는 id 고치기', () => {
    const tr = [{ name: 'a' }, { id: 'tabcd1234', name: 'b' }, { id: 'tabcd1234', name: 'c' }];
    assert.equal(ES.fixTrials(tr), true);
    assert.equal(new Set(tr.map(t => t.id)).size, 3);
    assert.equal(tr[1].id, 'tabcd1234');
    assert.equal(ES.fixTrials(tr), false);
});

const sample = () => ({ id: 'tq2w3e4r5', name: '자석 빠르게', N: 200, maxV: 29.8, minV: -39.5, tMax: 0.98, tMin: 1.2, order: '+ 먼저, − 나중',
    maxAbsI: 1.58, integral: 0.0012, dPhi: -0.006, samples: 2500, wave: ES.downsample(wave(2500)) });

test('보낼 것: 요약(봉우리·∫ε dt·ΔΦ)과 자료', () => {
    const items = ES.itemsFrom([sample()]);
    assert.equal(items.length, 1);
    const it = items[0];
    assert.equal(it.id, 'tq2w3e4r5');
    assert.equal(it.title, '자석 빠르게');
    assert.equal(it.n, 2500);
    assert.deepEqual(Object.keys(it.summary), ['maxV_mV', 'minV_mV', 'int_mVs', 'dPhi_uWb', 'maxI_mA', 'N']);
    assert.equal(it.summary.maxV_mV, 29.8);
    assert.ok(JSON.stringify(it.data).length < 45000 * 6);
    // 공통 부품이 시트 한 줄로 만든다
    const b = CS.buildPayloads({ exp: 'eminduction', group: '2-3-5376', device: 'nabcdef', items, sent: [], isGroupCode: g => /^\d+-\d+-\d{4}$/.test(g) });
    assert.equal(b.payloads.length, 1);
    assert.equal(b.payloads[0].tooBig, false);
});

test('받은 것: 출처별로 ext 에, 다시 받아도 같으면 바뀌지 않음, 지운 측정은 빠짐, CSV 파일 값은 그대로', () => {
    const ext = { 'f:old.csv': { name: 'old', maxV: 1, minV: -1, integral: 0 } };
    const it = ES.itemsFrom([sample()])[0];
    const incoming = [{ id: it.id, device: 'nzzzzzz', from: '노트북 ZZZZ', title: it.title, n: it.n, summary: it.summary, data: JSON.parse(JSON.stringify(it.data)), sentAt: 'x' }];
    assert.equal(ES.applyIncoming(ext, incoming), true);
    const k = 'd:nzzzzzz:' + it.id;
    assert.ok(ext[k]);
    assert.equal(ext[k].from, '노트북 ZZZZ');
    assert.equal(ext[k].maxV, 29.8);
    assert.equal(ext[k].wave.t.length, it.data.wave.t.length);
    assert.equal(ES.applyIncoming(ext, incoming), false);
    // 모양이 이상한 자료는 무시
    assert.equal(ES.applyIncoming(ext, incoming.concat([{ id: 'x', device: 'nyyyyyy', data: 'hello' }])), false);
    assert.equal(ES.applyIncoming(ext, []), true);
    assert.deepEqual(Object.keys(ext), ['f:old.csv']);
});

test('CSV 읽기: 이 페이지가 내려받은 모양만', () => {
    const csv = '﻿time_s,voltage_mV,current_mA\n0.0000,0.1,0.01\n0.0100,0.2,0.02\n0.0200,0.3,0.03\n0.0300,0.4,0.04\n';
    assert.equal(ES.parseCsv(csv).rec.length, 4);
    assert.match(ES.parseCsv('a,b\n1,2').error, /CSV/);
    assert.match(ES.parseCsv('time_s,voltage_mV,current_mA\n1,2,3').error, /적습니다/);
});

test('가짜 Apps Script: 노트북 A 가 보내면 같은 조 노트북 B 가 받는다 (조 코드가 날짜로 바뀌지 않음)', () => {
    const app = loadCodeGs();
    const group = '2-3-5376';
    const items = ES.itemsFrom([sample()]);
    const b = CS.buildPayloads({ exp: 'eminduction', group, device: 'naaaaaa', items, sent: [], isGroupCode: () => true });
    for (const pl of b.payloads) { const body = Object.assign({}, pl); delete body.tooBig; assert.equal(app.post(body).ok, true); }
    const list = app.get({ action: 'list', exp: 'eminduction', group });
    assert.equal(list.ok, true);
    const inc = CS.incomingFrom(list.items, 'nbbbbbb');
    assert.equal(inc.length, 1);
    const ext = {};
    assert.equal(ES.applyIncoming(ext, inc), true);
    const t = Object.values(ext)[0];
    assert.equal(t.name, '자석 빠르게');
    assert.equal(t.N, 200);
    assert.ok(t.wave.t.length > 500);
    // 보낸 노트북 자신은 받지 않음
    assert.equal(CS.incomingFrom(list.items, 'naaaaaa').length, 0);
});
