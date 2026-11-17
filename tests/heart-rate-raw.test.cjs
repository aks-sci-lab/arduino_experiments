// 심박수 원본 담기·풀기 (js/heart-rate-raw.js): 폰 → 선생님 시트 → 노트북. 3분 회차도 서버 칸 한도(45,000자 × 6칸)에 들어가는지
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/heart-rate-raw.js');
const H = require('../js/heart-rate-math.js');

function makeFrames(sec, fps, bpm) {
    const out = [];
    for (let i = 0; i < sec * fps; i++) {
        const t = i / fps + (i % 3) * 0.0007, ph = (t * bpm / 60) % 1;
        const p = Math.exp(-(((ph - 0.15) / 0.09) ** 2));
        out.push({ t: 12.5 + t, r: 150 - 3 * p + (i % 7) * 0.013, g: 9 - 0.2 * p, b: 4.12, y: 50 - p, exposureTime: i < 200 ? 33.3 : 33.4, iso: 400, s: 0 });
    }
    return out;
}

test('담고 풀면 값이 0.01 안에서 같다 (시각은 0 부터, ms)', () => {
    const fr = makeFrames(20, 30, 72);
    const d = R.rawPack(fr, { mode: 'once', at: '2026-11-17T01:02:03Z', lock: 'locked' });
    assert.equal(d.kind, 'raw'); assert.equal(d.decimate, 1); assert.equal(d.frames0, fr.length);
    const u = R.rawUnpack(JSON.parse(JSON.stringify(d)));
    assert.equal(u.frames.length, fr.length); assert.equal(u.mode, 'once'); assert.equal(u.lock, 'locked');
    let maxErr = 0;
    u.frames.forEach((f, i) => {
        ['r', 'g', 'b', 'y'].forEach(k => { maxErr = Math.max(maxErr, Math.abs(f[k] - fr[i][k])); });
        assert.ok(Math.abs(f.t - (fr[i].t - fr[0].t)) < 0.0011);
        assert.equal(f.exposureTime, fr[i].exposureTime); assert.equal(f.iso, 400);
    });
    assert.ok(maxErr <= 0.0051, '오차 ' + maxErr);
    // 풀어서 계산해도 같은 심박수
    const a = H.analyzeRun ? H.analyzeRun('locked', fr) : null, b = H.analyzeRun ? H.analyzeRun('locked', u.frames) : null;
    console.log('bpm', a && a.bpm, b && b.bpm);
    if (a && b && a.bpm && b.bpm) assert.ok(Math.abs(a.bpm - b.bpm) < 1, a.bpm + ' vs ' + b.bpm);
});

test('3분 · 30장/초 (5400장) 숨 참기 회차가 솎지 않고 한도 안 (시트 6칸 × 45,000자)', () => {
    const fr = makeFrames(180, 30, 80);
    const d = R.rawPack(fr, { mode: 'breath', at: '2026-11-17T01:02:03Z', ph: { holdStart: 60, holdEnd: 120, end: 180, holdPlanned: 60 }, lockLog: { before: 120 } });
    const len = JSON.stringify(d).length;
    console.log('3분 회차 글자 수', len);
    assert.ok(len <= R.LIMIT && len <= 6 * 45000, '글자 수 ' + len);
    assert.equal(d.decimate, 1);
    const it = R.rawItems([{ id: 'b1', mode: 'breath', at: d.at, frames: fr, ph: d.ph, held: 60 }])[0];
    assert.deepEqual(it.summary, { '참은 초': 60 });
    assert.equal(it.data.kind, 'raw'); assert.equal(it.n, 5400);
    const inc = R.rawIncoming([Object.assign({ device: 'pab12', from: '📱 폰', sentAt: 'x' }, it)]);
    assert.equal(inc.length, 1); assert.equal(inc[0].mode, 'breath'); assert.equal(inc[0].key, 'pab12/b1');
    assert.equal(R.rawUnpack(inc[0].raw).ph.holdEnd, 120);
});

test('너무 크면 고르게 솎고 표시 (요약에 솎음)', () => {
    // 잡음이 큰 60장/초 · 5분 = 18,000장
    const fr = makeFrames(300, 60, 70).map((f, i) => Object.assign(f, { r: f.r + ((i * 7919) % 97) / 3, g: f.g + ((i * 104729) % 89) / 4, y: f.y + ((i * 31) % 83) / 2, exposureTime: 30 + (i % 5) }));
    const d = R.rawPack(fr, { mode: 'once' });
    assert.ok(JSON.stringify(d).length <= R.LIMIT);
    assert.ok(d.decimate > 1, '솎음 ' + d.decimate);
    assert.equal(d.frames0, fr.length);
    assert.equal(R.rawUnpack(d).frames.length, Math.ceil(fr.length / d.decimate));
    const it = R.rawItems([{ id: 'r1', mode: 'once', frames: fr, bpm: 70.04 }])[0];
    assert.equal(it.summary['솎음'], d.decimate); assert.equal(it.summary['심박수(회/분)'], 70);
});

test('원본이 아닌 항목·빈 항목은 건너뜀', () => {
    assert.deepEqual(R.rawIncoming([{ device: 'a', id: '1', n: 3, data: { kind: 'breath' } }, { device: 'a', id: '2', n: 0, data: { kind: 'raw', cols: {} } }]), []);
    assert.equal(R.rawUnpack({ kind: 'breath' }), null);
    assert.deepEqual(R.rawItems([{ id: 'x', frames: [] }]), []);
});
