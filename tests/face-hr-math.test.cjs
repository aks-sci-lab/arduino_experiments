// 얼굴 심박(rPPG) 계산 시험: js/face-hr-math.js
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/face-hr-math.js');

const allRows = (sim, opts) => {
    const res = F.analyze(sim.frames, opts);
    assert.ok(res.ok, res.error);
    const rows = F.table(res, sim.truth).filter(r => r.roi === 'all');
    return Object.fromEntries(rows.map(r => [r.method, r]));
};

test('조명이 일정하면 세 방법 모두 맞음 (GREEN 도)', () => {
    const s = F.simulate({ dur: 50, bpm: 70, illum: 0, motion: 0, seed: 5 });
    const r = allRows(s);
    for (const m of F.METHODS) assert.ok(r[m].mae < 3, m + ' ' + r[m].mae);
});

test('조명이 심박 범위에서 출렁이면 POS·CHROM 오차 < GREEN 오차', () => {
    for (const o of [{ bpm: 72, seed: 7 }, { bpm: 110, seed: 9, illumHz: [1.1] }, { bpm: 58, seed: 11, illumHz: [1.4, 2.2], motion: 0.6 }]) {
        const s = F.simulate(Object.assign({ dur: 60, illum: 0.008 }, o));
        const r = allRows(s);
        console.log(JSON.stringify(o), 'GREEN', r.green.mae, 'CHROM', r.chrom.mae, 'POS', r.pos.mae);
        assert.ok(r.pos.mae < r.green.mae, 'POS < GREEN ' + JSON.stringify(o));
        assert.ok(r.chrom.mae < r.green.mae, 'CHROM < GREEN ' + JSON.stringify(o));
        assert.ok(r.pos.mae < 3, 'POS 3회/분 안 ' + r.pos.mae);
    }
});

test('영역별 결과·움직임 많은 창 표시', () => {
    const s = F.simulate({ dur: 45, motion: 1, seed: 3 });
    const res = F.analyze(s.frames);
    for (const roi of ['all', 'fh', 'lc', 'rc']) assert.ok(res.series.pos[roi] && res.series.pos[roi].length >= 30, roi);
    assert.ok(res.motion.some(w => w.high) && res.motion.some(w => !w.high), '움직임 많은 창과 적은 창이 함께');
    const rows = F.table(res, s.truth);
    assert.equal(rows.length, 12);
    const pos = rows.find(r => r.method === 'pos' && r.roi === 'all');
    assert.ok(pos.nMoving > 0 && pos.maeStill != null);
    assert.ok(Math.abs(res.fps - 30) < 1, 'fps ' + res.fps);
});

test('짧거나 얼굴이 없으면 알려 줌', () => {
    assert.equal(F.analyze([]).ok, false);
    const s = F.simulate({ dur: 8 });
    assert.match(F.analyze(s.frames).error, /짧아요/);
});

test('정답: 손가락 영상·손목 세기·블루투스 값', () => {
    const s = F.simulate({ dur: 40, bpm: 80, drift: 0, seed: 2 });
    const f = F.fingerTruth(s.finger);
    assert.ok(f.length > 25);
    assert.ok(Math.abs(F.mean(f.map(x => x.bpm)) - 80) < 1.5);
    assert.deepEqual(F.wristTruth([{ t0: 2, t1: 17, count: 19 }, { t0: 20, t1: 35, count: 0 }, { t0: 40, t1: 55, count: 20 }]), [{ t: 9.5, bpm: 76 }, { t: 47.5, bpm: 80 }]);
    const pts = []; for (let t = 0; t < 30; t += 1) pts.push({ t, bpm: 70 + (t > 15 ? 10 : 0) });
    const sm = F.smoothTruth(pts);
    assert.equal(sm[0].t, 5); assert.equal(sm[0].bpm, 70);
    assert.equal(sm[sm.length - 1].bpm, 80);
    assert.equal(F.truthSeries({ source: 'wrist', counts: [{ t0: 0, t1: 15, count: 18 }] })[0].bpm, 72);
    assert.ok(F.truthSeries({ source: 'dual', finger: s.finger }).length > 25);
});

test('두 기기 시각 어긋남: 곡선 맞추기로 지연 찾기', () => {
    const s = F.simulate({ dur: 80, bpm: 75, drift: 12, illum: 0, motion: 0, seed: 4 });
    const res = F.analyze(s.frames);
    const shifted = s.truth.map(p => ({ t: p.t + 4, bpm: p.bpm }));   // 정답 시계가 4초 늦음
    const before = F.compare(res.series.pos.all, shifted).mae;
    const bl = F.bestLag(res.series.pos.all, shifted, 15, 0.5);
    assert.ok(Math.abs(bl.lag - 4) <= 1, 'lag ' + bl.lag);
    assert.ok(bl.mae < before, bl.mae + ' < ' + before);
});

test('블루투스 심박 측정값(0x2A37) 읽기', () => {
    assert.deepEqual(F.parseHrMeasurement(new Uint8Array([0x00, 72])), { bpm: 72, contact: null, energy: null, rr: [] });
    assert.equal(F.parseHrMeasurement(new Uint8Array([0x01, 0x2c, 0x01])).bpm, 300);
    // 접촉 지원·접촉됨, 에너지, RR 두 개(1024 = 1초)
    const v = F.parseHrMeasurement(new DataView(new Uint8Array([0x1e, 80, 0x10, 0x00, 0x00, 0x04, 0x00, 0x03]).buffer));
    assert.deepEqual(v, { bpm: 80, contact: true, energy: 16, rr: [1, 0.75] });
    assert.equal(F.parseHrMeasurement(new Uint8Array([0x04, 60])).contact, false);
    assert.equal(F.parseHrMeasurement(new Uint8Array([0x01])), null);
});

test('정답 경로 자동 고르기: 동시 열기 실패 → 두 번째 폰 → 블루투스 → 손목', () => {
    assert.equal(F.choosePath({ dual: 'ok' }).path, 'dual');
    const a = F.choosePath({ dual: 'fail', dualError: 'NotReadableError: Could not start video source', server: true });
    assert.equal(a.path, 'phone2');
    assert.ok(a.why.some(w => /NotReadableError: Could not start video source/.test(w)), '실패 문구 그대로');
    assert.equal(F.choosePath({ dual: 'fail', server: false, bluetooth: true }).path, 'ble');
    assert.equal(F.choosePath({ dual: 'fail', server: false, bluetooth: false }).path, 'wrist');
    assert.equal(F.choosePath({}).path, 'wrist');
});

test('시계 차이 (서버 왕복)', () => {
    const o = F.clockOffset({ sendMs: Date.parse('2026-11-17T01:00:00.000Z') + 2500, recvMs: Date.parse('2026-11-17T01:00:00.000Z') + 3500, serverIso: '2026-11-17T01:00:00.500Z' });
    assert.deepEqual(o, { offset: 2500, err: 500 });
    assert.equal(F.clockOffset({ sendMs: 1, recvMs: 2, serverIso: 'x' }), null);
});

test('CSV·JSON 내보내기 → 다시 불러오기 → 같은 결과', () => {
    const s = F.simulate({ dur: 30, seed: 8 });
    const sess = { v: 1, kind: 'face-hr', meta: { at: '2026-11-17T01:00:00Z', path: 'dual' }, frames: s.frames, truth: { source: 'wrist', finger: s.finger.slice(0, 5), points: [{ t: 3, bpm: 70 }], counts: [{ t0: 1, t1: 16, count: 18 }] } };
    const c = F.parseCsv(F.toCsv(sess));
    assert.equal(c.frames.length, s.frames.length);
    assert.deepEqual(c.frames[10].rois, s.frames[10].rois);
    assert.equal(c.meta.path, 'dual');
    assert.equal(c.truth.source, 'wrist');
    assert.deepEqual(c.truth.counts, sess.truth.counts);
    assert.equal(c.truth.finger.length, 5);
    const a1 = F.analyze(s.frames), a2 = F.analyze(c.frames);
    assert.deepEqual(a1.series.pos.all, a2.series.pos.all);
    const j = F.parseJson(JSON.stringify(sess));
    assert.equal(j.frames.length, s.frames.length);
    assert.match(F.parseJson('{"a":1}').error, /아니에요/);
    assert.match(F.parseCsv('a,b\n1,2').error, /찾지 못했어요/);
});

test('노출 정규화: 노출이 계단처럼 바뀌어도 POS 가 버팀', () => {
    const s = F.simulate({ dur: 50, illum: 0, motion: 0, seed: 6 });
    // 자동 노출이 0.7초마다 2 % 씩 오르내렸다고 가정 (밝기도 같이)
    s.frames.forEach(f => {
        const e = 1 + 0.02 * Math.sign(Math.sin(2 * Math.PI * f.t / 1.4));
        f.et = 10 * e; f.iso = 100;
        F.ROIS.forEach(k => { f.rois[k] = f.rois[k].map((v, i) => i < 3 ? v * e : v); });
    });
    const plain = F.table(F.analyze(s.frames), s.truth).find(r => r.method === 'green' && r.roi === 'all');
    const norm = F.table(F.analyze(s.frames, { expNorm: true }), s.truth).find(r => r.method === 'green' && r.roi === 'all');
    assert.ok(norm.mae < plain.mae, 'GREEN 정규화 ' + norm.mae + ' < ' + plain.mae);
    assert.ok(norm.mae < 3);
});
