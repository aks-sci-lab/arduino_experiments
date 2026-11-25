// 열평형 실험 계산·분석·시뮬레이션 단위 시험 (js/thermal-equilibrium-math.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/thermal-equilibrium-math.js');

test('이론 열평형 온도: 중3 기본(질량비·비열) + 고2 심화(비커 열용량 보정)', () => {
    // 같은 질량 물 100g 60°C + 100g 20°C → 40°C
    const a = M.calcTheoryTemp({ m1: 100, liquid1: 'water', t1_0: 60, m2: 100, liquid2: 'water', t2_0: 20 });
    assert.equal(a.basic, 40);
    // 질량비 1:3 (50g 60°C + 150g 20°C) → 30°C
    const b = M.calcTheoryTemp({ m1: 50, liquid1: 'water', t1_0: 60, m2: 150, liquid2: 'water', t2_0: 20 });
    assert.equal(b.basic, 30);
    // 식용유(c=2.0) 100g 65°C + 물(c=4.186) 100g 20°C → 물 쪽에 더 가까움 (~34.55°C)
    const oil = M.calcTheoryTemp({ m1: 100, liquid1: 'oil', t1_0: 65, m2: 100, liquid2: 'water', t2_0: 20 });
    assert.ok(oil.basic > 34 && oil.basic < 35, '식용유+물: ' + oil.basic);
    // 고2 심화: 유리 비커(c=0.84, 150g, 초기 20°C) 보정 시 이론 온도가 기본보다 낮아짐
    const corr = M.calcTheoryTemp({ m1: 100, liquid1: 'water', t1_0: 60, m2: 100, liquid2: 'water', t2_0: 20, cup1Mass: 50, cup1C: 0.84, cup2Mass: 100, cup2C: 0.84, tCup1_0: 20, tCup2_0: 20 });
    assert.ok(corr.corrected < corr.basic, '비커 열용량 보정: ' + corr.corrected + ' < ' + corr.basic);
    assert.ok(corr.Ccup > 100);
});

test('시뮬레이션 → 회차 분석: 열평형 도달, Q_잃 vs Q_얻, 열손실률, 지수 감쇠 시상수 τ·R²', () => {
    const sim = M.createSimulator('equal', { noiseAmp: 0 });
    const samples = [sim.current()];
    for (let i = 0; i < 240; i++) samples.push(sim.step(1));
    const res = M.analyzeRun(samples, sim.config);
    assert.equal(res.ok, true);
    assert.equal(res.reached, true, '240초 안에 열평형 도달');
    assert.ok(res.eqTime > 20 && res.eqTime < 220, '도달 시간: ' + res.eqTime);
    assert.equal(res.tTheory, 42.5);
    assert.ok(res.tEq < res.tTheory && res.tEq > 37, '주변 열손실로 실측이 이론보다 약간 낮음: ' + res.tEq);
    assert.ok(res.qLost > res.qGained && res.lossPct > 0 && res.lossPct < 30, '열손실률: ' + res.lossPct);
    assert.ok(res.rate1 < 0 && res.rate2 > 0, '뜨거운 물은 하강, 찬물은 상승');
    assert.ok(res.expFit && res.expFit.tau > 10 && res.expFit.r2 > 0.99, '뉴턴 냉각 지수 맞춤 R²>0.99: ' + JSON.stringify(res.expFit));
    assert.ok(Math.abs(res.expFit.halfLife - res.expFit.tau * Math.LN2) < 0.2);

    // 단열 프리셋은 열림 프리셋보다 열손실률이 더 작아야 함
    const simIns = M.createSimulator('insulated', { noiseAmp: 0 });
    const sIns = [simIns.current()];
    for (let i = 0; i < 240; i++) sIns.push(simIns.step(1));
    const resIns = M.analyzeRun(sIns, simIns.config);
    assert.ok(resIns.lossPct < res.lossPct, '단열 손실(' + resIns.lossPct + ') < 열림 손실(' + res.lossPct + ')');
});

test('CSV 내보내기/불러오기 및 조 공유(ClassShare) 항목 변환', () => {
    const run = {
        no: 1, title: '100g:100g', meta: { m1: 100, liquid1: 'water', m2: 100, liquid2: 'water', vessel: '유리' },
        samples: [{ t: 0, t1: 60, t2: 20 }, { t: 10, t1: 50, t2: 30 }, { t: 20, t1: 42, t2: 38 }, { t: 30, t1: 40.1, t2: 39.9 }, { t: 40, t1: 40.0, t2: 40.0 }, { t: 50, t1: 40.0, t2: 40.0 }]
    };
    const csv = M.runToCsv(run);
    assert.ok(csv.includes('time_s,small_beaker_C,big_beaker_C,diff_C'));
    const parsed = M.parseRunCsv(csv, 'test.csv');
    assert.equal(parsed.samples.length, 6);
    assert.equal(parsed.samples[0].t1, 60);

    const items = M.buildItems([run]);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'r1');
    assert.equal(items[0].summary['이론온도(°C)'], 40);
    const inc = M.applyIncoming({}, [{ device: 'dev-2', id: 'r1', title: '100g:100g', data: items[0].data }]);
    assert.equal(inc.changed, true);
    assert.equal(inc.ext['dev-2:r1'].samples.length, 6);
});
