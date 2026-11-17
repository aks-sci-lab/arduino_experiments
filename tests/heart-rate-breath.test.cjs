// 숨 참기 탐구 계산 (js/heart-rate-breath.js): 연속 곡선 · 지표 · CSV · 조 공유 항목
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/heart-rate-breath.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≈ ${b} ± ${tol}`);
function runOf(profile, seed, extra) {
    const fr = B.breathSimulate(Object.assign({ profile, seed }, extra || {}));
    const held = profile.stopAt != null ? profile.stopAt : profile.holdSec;
    const ph = { holdStart: 60, holdEnd: 60 + held, end: fr[fr.length - 1].t, holdPlanned: profile.holdSec, stopped: profile.stopAt != null };
    const curve = B.breathCurve(fr, { lock: 'locked' });
    return { fr, ph, curve, m: B.breathMetrics(curve, ph) };
}

test('곡선: 10초 창을 1초씩 — 안정 72, 숨 참기 30초 동안 62 까지 내려감, 회복', () => {
    const { curve, m } = runOf({ rest: 72, holdEnd: 62, holdSec: 30 }, 1);
    assert.equal(curve[0].t, 5);
    assert.equal(curve[1].t - curve[0].t, 1);
    assert.ok(curve.length >= 138 && curve.length <= 141, '점 수 ' + curve.length);
    near(m.restMean, 72, 2, '안정 평균');
    // 마지막 10초의 참값 평균: 65.3 → 62 직선의 평균 ≈ 63.7
    near(m.holdLastMean, 63.7, 2, '숨 참기 마지막 10초');
    near(m.changePct, (63.7 - 72) / 72 * 100, 3, '변화율');
    near(m.low.bpm, 62, 2, '가장 낮은 값'); near(m.low.t, 30, 3, '가장 낮은 시각(숨 참기 시작 뒤)');
    assert.ok(m.recoverySec > 5 && m.recoverySec < 30, '회복 시간 ' + m.recoverySec);
    assert.equal(m.heldSec, 30); assert.equal(m.stopped, false); assert.equal(m.dropped, 0);
});

test('숨 참기 60초 동안 올라감(84) · 60초 중 40초에 멈춤 · 회복 못 함', () => {
    const up = runOf({ rest: 70, holdEnd: 84, holdSec: 60 }, 2).m;
    near(up.restMean, 70, 2); assert.ok(up.changePct > 12 && up.changePct < 22, '변화율 ' + up.changePct);
    const stop = runOf({ rest: 72, holdEnd: 60, holdSec: 60, stopAt: 40 }, 3);
    assert.equal(stop.m.heldSec, 40); assert.equal(stop.m.stopped, true); assert.equal(stop.m.planned, 60);
    // 40초에 멈췄으니 72 → 64 까지만 내려감
    near(stop.m.holdLastMean, 72 - 8 * (35 / 40), 2.5, '멈춘 회차 마지막 10초');
    // 회복이 아주 느리면(τ = 200초) 60초 안에 안 돌아옴
    const slow = runOf({ rest: 72, holdEnd: 60, holdSec: 30, tau: 200 }, 4).m;
    assert.equal(slow.recoverySec, null); assert.equal(slow.recoveryText, '60초 안에 안 돌아옴');
    // 거의 안 바뀌면 회복 시간 0 근처
    const flat = runOf({ rest: 72, holdEnd: 72.5, holdSec: 30 }, 5).m;
    assert.ok(flat.recoverySec != null && flat.recoverySec <= 2, '회복 ' + flat.recoverySec);
});

test('신뢰도 낮은 창은 빼고 계산 (손가락 뗀 구간)', () => {
    const fr = B.breathSimulate({ profile: { rest: 72, holdEnd: 64, holdSec: 30 }, seed: 6 });
    // 20~32초: 맥파 없이 흰 화면처럼 (손가락을 뗌)
    fr.forEach((f, i) => { if (f.t > 20 && f.t < 32) { const w = (i % 7) / 7; f.r = 120 + w; f.g = 118; f.b = 117; f.y = 118 + w; } });
    const curve = B.breathCurve(fr, { lock: 'locked' });
    const m = B.breathMetrics(curve, { holdStart: 60, holdEnd: 90, end: 150, holdPlanned: 30 });
    assert.ok(m.dropped >= 5, '뺀 창 ' + m.dropped);
    near(m.restMean, 72, 2, '나쁜 창을 빼도 안정 평균');
    assert.ok(curve.filter(p => p.t > 22 && p.t < 30).every(p => !p.ok), '손가락 뗀 동안은 쓰지 않음');
});

test('CSV: 한 줄 = 1초, 머리말에 구간·지표·선택 항목 (성별 칸 없음)', () => {
    const { ph, curve, m } = runOf({ rest: 72, holdEnd: 62, holdSec: 30 }, 1);
    const csv = B.breathCsv({ at: '2026-11-17T05:00:00Z', ph, curve, metrics: m, profile: { exercise: '주 1~2회', height: '160대', weight: '50대' }, consent: true, lock: '🔒 노출 고정됨' });
    const lines = csv.trim().split('\n');
    assert.match(lines.find(l => l.startsWith('# 구간')), /안정 0~60초 · 숨 참기 60~90초\(계획 30초\) · 회복 90~/);
    assert.match(lines.find(l => l.startsWith('# 지표')), /변화율 -1\d(\.\d)?% .*회복 시간 \d+초/);
    assert.match(lines.find(l => l.startsWith('# 선택 항목')), /운동 습관 주 1~2회 · 키 160대 · 몸무게 50대 · 수업 분석 동의 예/);
    assert.ok(!/성별/.test(csv));
    const head = lines.indexOf('t_s,phase,bpm,conf,used');
    assert.ok(head > 0);
    assert.equal(lines.length - head - 1, curve.length);
    assert.match(lines[head + 1], /^5,안정,7\d(\.\d)?,0\.\d+,1$/);
    assert.ok(lines.some(l => /^7\d,숨 참기,/.test(l)) && lines.some(l => /^1\d\d,회복,/.test(l)));
});

test('조 공유 항목: 동의한 회차만, kind breath, 요약 순서 변화율·참은 초·안정 평균·회복 시간', () => {
    const a = runOf({ rest: 72, holdEnd: 62, holdSec: 30 }, 1), b = runOf({ rest: 72, holdEnd: 60, holdSec: 60, stopAt: 45 }, 2);
    const runs = [
        { id: 'b1', at: '2026-11-17T05:00:00Z', ph: a.ph, curve: a.curve, metrics: a.m, profile: { exercise: '주 0회' }, consent: true },
        { id: 'b2', at: '2026-11-17T05:05:00Z', ph: b.ph, curve: b.curve, metrics: b.m, profile: {}, consent: false },
        { id: 'b3', at: '2026-11-17T05:09:00Z', ph: b.ph, curve: b.curve, metrics: b.m, profile: { height: '170대' }, consent: true }
    ];
    const items = B.breathItems(runs);
    assert.deepEqual(items.map(i => i.id), ['b1', 'b3'], '동의 안 한 b2 는 빠짐');
    assert.deepEqual(Object.keys(items[0].summary), ['변화율(%)', '참은 초', '안정 평균', '회복 시간(초)']);
    assert.equal(items[0].data.kind, 'breath');
    assert.equal(items[1].title, '숨 참기 60초 (45초에 멈춤)');
    assert.ok(!('gender' in items[0].data.profile) && !('성별' in items[0].data.profile));
    assert.ok(JSON.stringify(items[1].data).length < 50000);
    // 받는 쪽
    const ext = B.breathIncoming(items.map(i => Object.assign({}, i, { device: 'pAB12', from: '📱 폰 AB12' })).concat([{ id: 'x', device: 'n1', n: 5, data: { kind: 'other' } }]));
    assert.deepEqual(Object.keys(ext), ['pAB12/b1', 'pAB12/b3']);
    near(ext['pAB12/b1'].metrics.changePct, a.m.changePct, 0.01);
    assert.equal(ext['pAB12/b1'].curve.length, a.curve.length);
});

test('선택 항목 목록: 운동 습관·키·몸무게 구간 (성별 없음)', () => {
    assert.deepEqual(B.EXERCISE, ['주 0회', '주 1~2회', '주 3~4회', '주 5회 이상']);
    assert.deepEqual(B.HEIGHT, ['150 미만', '150대', '160대', '170대', '180 이상']);
    assert.ok(B.WEIGHT.length >= 6 && B.WEIGHT.every(w => /0|미만|이상/.test(w)));
});
