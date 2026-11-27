// 열평형: 같은 조건 반복 묶기 · '차이가 흔들림보다 큰가요?' 계산 (js/thermal-equilibrium-math.js repeatGroups)
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/thermal-equilibrium-math.js');

// 처음 온도 h(작은 비커)·c(큰 비커)에서 eq 로 다가가는 곡선 (시상수 tau 초, 300초)
function run(title, meta, h, c, eq, tau) {
    const samples = [];
    for (let t = 0; t <= 300; t += 2) {
        const k = Math.exp(-t / (tau || 30));
        samples.push({ t, t1: eq + (h - eq) * k, t2: eq + (c - eq) * k });
    }
    return { title, meta: Object.assign({ m1: 100, liquid1: 'water', m2: 100, liquid2: 'water', vessel: '유리 비커 (열림)', beakerMat: 'none' }, meta), samples };
}

test('같은 조건 회차를 묶어 평균·범위·회차 수', () => {
    const r = M.repeatGroups([
        run('①-1', {}, 65, 20, 41.0), run('①-2', {}, 64, 21, 42.0), run('①-3', { vessel: '  유리  비커 (열림) ' }, 66, 20, 41.5),
        run('②-1', { m1: 50, m2: 150 }, 65, 20, 31.0), run('②-2', { m1: 50, m2: 150 }, 65, 20, 32.0)
    ]);
    assert.equal(r.groups.length, 2);
    const [g1, g2] = r.groups;
    assert.equal(g1.tEq.n, 3, '메모 띄어쓰기는 같은 조건');
    assert.ok(Math.abs(g1.tEq.mean - 41.5) < 0.05, 'mean ' + g1.tEq.mean);
    assert.ok(Math.abs(g1.tEq.range - 1.0) < 0.05, 'range ' + g1.tEq.range);
    assert.equal(g2.tEq.n, 2);
    assert.equal(r.pairs.length, 1);
    assert.deepEqual(r.pairs[0].changed, ['물의 질량']);
    assert.equal(r.pairs[0].mix, false);
    assert.equal(r.pairs[0].tEq.verdict, 'clear', '차이 9.5 > 흔들림 1');
    assert.equal(r.rep, true);
});

test('차이가 흔들림 안이면 아직 말하기 어려움, 경계(차이 = 흔들림)도 어려움', () => {
    const lid = { vessel: '스티로폼 + 뚜껑' };
    const a = M.repeatGroups([run('A1', {}, 65, 20, 41), run('A2', {}, 65, 20, 42), run('B1', lid, 65, 20, 41.8), run('B2', lid, 65, 20, 42.2)]);
    assert.equal(a.pairs[0].tEq.verdict, 'unclear');
    assert.deepEqual(a.pairs[0].changed, ['비커·단열 메모']);
    // 경계: 평균 41.5 vs 42.5, 흔들림 1.0 → 차이 = 흔들림
    const b = M.repeatGroups([run('A1', {}, 65, 20, 41), run('A2', {}, 65, 20, 42), run('B1', lid, 65, 20, 42), run('B2', lid, 65, 20, 43)]);
    assert.ok(Math.abs(b.pairs[0].tEq.diff - b.pairs[0].tEq.jitter) < 0.02, b.pairs[0].tEq.diff + ' vs ' + b.pairs[0].tEq.jitter);
    assert.equal(b.pairs[0].tEq.verdict, 'unclear');
});

test('반복이 한 번뿐이면 norep (한쪽만 반복이어도)', () => {
    const r = M.repeatGroups([run('①', {}, 65, 20, 41), run('②', { m1: 50, m2: 150 }, 65, 20, 31)]);
    assert.equal(r.rep, false);
    assert.equal(r.pairs[0].tEq.verdict, 'norep');
    const s = M.repeatGroups([run('①', {}, 65, 20, 41), run('①b', {}, 65, 20, 41.4), run('②', { m1: 50, m2: 150 }, 65, 20, 31)]);
    assert.equal(s.rep, true);
    assert.equal(s.pairs[0].tEq.verdict, 'norep');
});

test('두 조건이 함께 바뀌면 mix, 처음 온도는 3 °C 넘게 다르면 다른 조건', () => {
    const r = M.repeatGroups([run('①', {}, 65, 20, 41), run('②', { m1: 50, m2: 150, vessel: '스티로폼' }, 65, 20, 31)]);
    assert.equal(r.pairs[0].mix, true);
    assert.deepEqual(r.pairs[0].changed.sort(), ['물의 질량', '비커·단열 메모'].sort());
    const t = M.repeatGroups([run('①', {}, 65, 20, 41), run('②', {}, 80, 20, 50)]);
    assert.deepEqual(t.pairs[0].changed, ['처음 온도']);
    const pos = M.repeatGroups([run('①', {}, 65, 20, 41), run('②', {}, 20, 65, 41)]);
    assert.deepEqual(pos.pairs[0].changed, ['뜨거운 물 위치']);
});

test('τ(시상수)도 같은 방법으로 판정', () => {
    const lid = { vessel: '뚜껑' };
    const r = M.repeatGroups([run('A1', {}, 65, 20, 41, 30), run('A2', {}, 65, 20, 41, 32), run('B1', lid, 65, 20, 41, 50), run('B2', lid, 65, 20, 41, 53)]);
    const p = r.pairs[0];
    assert.ok(r.groups[0].tau && r.groups[0].tau.n === 2);
    assert.equal(p.tau.verdict, 'clear', JSON.stringify(p.tau));
    assert.equal(p.tEq.verdict, 'unclear', '열평형 온도는 같음');
});

test('빈 목록·점 없는 회차는 건너뜀', () => {
    const r = M.repeatGroups([{ title: 'x', meta: {}, samples: [] }, null]);
    assert.equal(r.groups.length, 0);
    assert.deepEqual(M.repeatGroups([]).pairs, []);
});
