// 스마트폰 진자 계산 시험 (명세서 docs/pendulum-spec.md 6절 확인 기준)
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/pendulum-math.js');

const within = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg || ''} ${a} vs ${b} (허용 ${rel * 100}%)`);

test('이론값: L = 1.00 m, 작은 진폭이면 T ≈ 2.006 s', () => {
    within(P.theoryPeriod(1, P.G_STD), 2.006, 0.001);
});

test('L = 1.00 m 시뮬레이션: 회전 속도로 구한 T 가 2.006 s 의 1% 이내', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        const s = P.simulate({ L: 1, ampDeg: 5, duration: 30, rate: 60, jitter: 0.2, noise: 2, seed });
        const r = P.analyze(s, { kind: 'gyro', nPeriods: 10 });
        assert.equal(r.error, undefined);
        assert.equal(r.n, 10);
        assert.equal(r.axis, 'alpha', '가장 크게 흔들린 축을 자동으로 고름');
        within(r.T, 2.006, 0.01, `seed ${seed}`);
        assert.ok(r.Tstd < 0.04, `표준편차 ${r.Tstd}`);
    }
});

test('가속도 축으로 계산해도 최대점 간격 = T/2 를 반영해 같은 T', () => {
    for (const seed of [11, 12, 13]) {
        const s = P.simulate({ L: 1, ampDeg: 10, duration: 30, rate: 100, jitter: 0.2, noise: 1, seed });
        const gyro = P.analyze(s, { kind: 'gyro', nPeriods: 10 });
        const acc = P.analyze(s, { kind: 'acc', nPeriods: 10 });
        assert.equal(acc.error, undefined);
        assert.equal(acc.axis, 'ay', '줄 방향 축');
        assert.equal(acc.n, 10);
        within(acc.T, gyro.T, 0.01, `seed ${seed} 가속도 vs 회전 속도`);
        within(acc.T, P.theoryPeriod(1, P.G_STD, 10), 0.01, `seed ${seed} 가속도 vs 이론`);
        // 가속도는 한 주기 안에 통과가 두 번
        assert.equal(acc.crossings.length, 2 * acc.n + 1);
    }
});

test('가속도 축을 반주기로 착각하지 않음: 통과 간격 그대로면 T/2', () => {
    const s = P.simulate({ L: 1, ampDeg: 10, duration: 20, rate: 100, noise: 0, seed: 3 });
    const y = P.movingAverage(P.column(s, 'ay'), 5);
    const m = P.mean(y);
    const t = s.map(p => (p.t - s[0].t) / 1000);
    const cr = P.risingCrossings(t, y.map(v => v - m));
    const half = P.mean(cr.slice(1).map((c, i) => c - cr[i]));
    within(half, P.theoryPeriod(1, P.G_STD, 10) / 2, 0.01);
});

test('FFT 비교: 회전 속도·가속도 모두 같은 주기 근처', () => {
    const s = P.simulate({ L: 0.8, ampDeg: 8, duration: 40, rate: 60, jitter: 0.15, noise: 1, seed: 7 });
    const T0 = P.theoryPeriod(0.8, P.G_STD, 8);
    const g = P.analyze(s, { kind: 'gyro', nPeriods: 0, fft: true });
    const a = P.analyze(s, { kind: 'acc', nPeriods: 0, fft: true });
    within(g.fftT, T0, 0.02, 'gyro FFT');
    within(a.fftT, T0, 0.02, 'acc FFT');
});

test('주기 수: 정한 수만큼만 쓰고, 모자라면 알려 줌', () => {
    const s = P.simulate({ L: 1, duration: 12, seed: 9 });
    const r5 = P.analyze(s, { nPeriods: 3 });
    assert.equal(r5.n, 3);
    const r20 = P.analyze(s, { nPeriods: 20 });
    assert.ok(r20.n < 20);
    assert.ok(r20.warnings.some(w => w.includes('더 오래')));
});

test('처음 가만히 둔 구간·건너뛰기가 있어도 주기는 그대로', () => {
    const s = P.simulate({ L: 0.5, ampDeg: 6, duration: 30, rest: 4, noise: 2, seed: 21 });
    const r = P.analyze(s, { nPeriods: 10, skip: 2 });
    within(r.T, P.theoryPeriod(0.5, P.G_STD, 6), 0.01);
    assert.ok(r.periods[0].t0 >= 2);
});

test('잡음만 있고 흔들림이 없으면 오류 문구', () => {
    const s = P.simulate({ L: 1, ampDeg: 0, duration: 10, noise: 0, seed: 1 });
    const r = P.analyze(s, { nPeriods: 10 });
    assert.ok(r.error);
});

test('이동평균은 시간이 밀리지 않음(가운데 맞춤)', () => {
    const y = [0, 0, 0, 10, 0, 0, 0];
    const m = P.movingAverage(y, 3);
    assert.deepEqual(m.map(v => +v.toFixed(3)), [0, 0, 3.333, 3.333, 3.333, 0, 0]);
});

test('3초 보정: 중력 방향 축과 부호(안드로이드 +, 아이폰 −)', () => {
    const rest = P.simulate({ L: 1, ampDeg: 0, duration: 3, noise: 1, seed: 4 });
    const c = P.calibrate(rest);
    assert.equal(c.axis, 'ay'); assert.equal(c.sign, 1); assert.ok(c.still);
    within(c.magnitude, 9.81, 0.01);
    const flipped = rest.map(p => ({ ...p, ax: -p.ax, ay: -p.ay, az: -p.az }));
    assert.equal(P.calibrate(flipped).sign, -1);
    const shaky = P.simulate({ L: 1, ampDeg: 20, duration: 3, noise: 3, seed: 4 })
        .map((p, i) => ({ ...p, ax: p.ax + (i % 2 ? 1 : -1) }));
    assert.equal(P.calibrate(shaky).still, false);
});

test('2단계용: L 0.5·0.7·0.9·1.1 m + d = 0.08 m → T²–L 기울기로 g ≈ 9.8, 절편으로 d 복원', () => {
    const points = [0.5, 0.7, 0.9, 1.1].map((L, i) => {
        const s = P.simulate({ L, offset: 0.08, ampDeg: 5, duration: 30, rate: 60, jitter: 0.2, noise: 2, seed: 100 + i });
        return { L, T: P.analyze(s, { nPeriods: 10 }).T };
    });
    const fit = P.fitT2L(points);
    within(fit.g, 9.8, 0.01, 'g');
    assert.ok(Math.abs(fit.d - 0.08) < 0.01, `d = ${fit.d}`);
    assert.ok(fit.r2 > 0.999);
    assert.ok(Math.abs(fit.gError) < 1);
});

test('CSV: 만들고 다시 읽으면 조건·주기·원본이 그대로', () => {
    const s = P.simulate({ L: 1, duration: 25, seed: 5 });
    const r = P.analyze(s, { nPeriods: 10 });
    const meta = { group: '3', L: 1, amplitude: 5, note: '쉼표, "따옴표" 포함', source: 'simulation', kind: 'gyro', sensorAxis: r.axis, nPeriods: 10, T_mean: r.T, T_std: r.Tstd };
    const csv = P.toCsv(meta, r, s);
    const back = P.parseCsv('﻿' + csv);
    assert.equal(back.meta.group, '3');
    assert.equal(back.meta.L, 1);
    assert.equal(back.meta.note, '쉼표, "따옴표" 포함');
    assert.equal(back.periods.length, 10);
    assert.equal(back.samples.length, s.length);
    within(back.meta.T_mean, r.T, 1e-9);
    // 다시 읽은 원본으로 계산해도 같은 T
    within(P.analyze(back.samples, { nPeriods: 10 }).T, r.T, 1e-3);
});

test('자동 잡음 줄이기: 진폭 5°·잡음 보통에서도 가속도 T 가 1% 이내, 이동평균 창은 오르내림 시간에 맞춤', () => {
    let ok = 0;
    for (let seed = 1; seed <= 10; seed++) {
        const s = P.simulate({ L: 1, ampDeg: 5, noise: 2, rate: 60, jitter: 0.2, seed });
        const r = P.analyze(s, { kind: 'acc', nPeriods: 10 });
        if (Math.abs(r.T - P.theoryPeriod(1, P.G_STD, 5)) <= 0.01 * r.T) ok++;
        assert.ok(r.smooth >= 15 && r.smooth <= 35, `acc 창 ${r.smooth}`);
    }
    assert.equal(ok, 10);
    const g = P.analyze(P.simulate({ L: 1, rate: 100, seed: 1 }), { kind: 'gyro' });
    assert.ok(g.smooth >= 60 && g.smooth <= 100, `gyro 창 ${g.smooth}`);
    assert.equal(P.analyze(P.simulate({ L: 1, seed: 1 }), { smooth: 3 }).smooth, 3);
});

test('잡음이 너무 커서 틀린 주기가 나오면 반드시 경고', () => {
    for (let seed = 1; seed <= 10; seed++) {
        const s = P.simulate({ L: 1, ampDeg: 3, noise: 3, seed });
        const r = P.analyze(s, { kind: 'acc', nPeriods: 10 });
        const right = r.T && Math.abs(r.T - P.theoryPeriod(1, P.G_STD, 3)) <= 0.01 * r.T;
        assert.ok(right || r.error || r.warnings.length, `seed ${seed}: T=${r.T} 인데 경고 없음`);
    }
});

test('L·T 맞는지 확인: 적은 L 이 잰 T 와 크게 어긋나면 알림 (시뮬레이션 0.90 m 인데 L = 0.50 m 로 남은 경우)', () => {
    const T09 = P.theoryPeriod(0.9, P.G_STD, 5);
    assert.equal(P.lengthCheck(0.5, T09).ok, false);
    assert.ok(Math.abs(P.lengthCheck(0.5, T09).impliedL - 0.9) < 0.01);
    assert.equal(P.lengthCheck(0.9, T09).ok, true);
    // 폰 무게중심까지 8 cm 더해진 실제 측정은 괜찮음 (짧은 줄도)
    for (const L of [0.3, 0.5, 1.1]) assert.equal(P.lengthCheck(L, P.theoryPeriod(L + 0.08, P.G_STD)).ok, true, `L ${L}`);
    assert.equal(P.lengthCheck(0, 1).ok, false);
});
