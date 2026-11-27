// 열평형 가상 수업 — 짠 측정값 만들기 (방법 보완 ③: 가짜 장치·시뮬레이션 값에 맡기지 않음)
//   node tools/virtual-class/thermal/make-data.cjs          → data/*.csv 와 data/runs.json 을 다시 만들고 표를 찍음
// 같은 씨앗(seed)이라 몇 번을 돌려도 같은 파일이 나온다. 교사·학생 세션은 저장소에 들어 있는 data/ 를 그대로 쓴다.
// 모양: 페이지의 '📂 CSV 회차 불러오기'(ThermalMath.parseRunCsv)가 읽는 그대로 — # 머리말, 열 time_s,small_beaker_C,big_beaker_C,diff_C
// 물리 모형: 작은 비커(1)·큰 비커(2)·실내(r)의 열 교환 (페이지 시뮬레이터와 같은 식, 값만 이 파일에서 정함)
//   C1 dT1/dt = −k12 (T1 − T2) − k1r (T1 − Tr),   C2 dT2/dt = k12 (T1 − T2) − k2r (T2 − Tr)
// 센서 흔들림: 점마다 정규분포 σ(기본 0.08 °C) + 0.1 °C 단위로 반올림(시판 무선 온도계 표시와 같게)
'use strict';
const fs = require('node:fs'), path = require('node:path');
const M = require('../../../js/thermal-equilibrium-math.js');
const OUT = path.join(__dirname, 'data');

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const C = { water: 4.186, oil: 2.0 };

function curve(p, seed) {
    const r = rng(seed);
    const C1 = C[p.liq1 || 'water'] * p.m1 + (p.cupC1 || 0), C2 = C[p.liq2 || 'water'] * p.m2 + (p.cupC2 || 0);
    let T1 = p.T1, T2 = p.T2; const Tr = p.Tr == null ? 22 : p.Tr, dt = p.dt || 2, dur = p.dur || 480, sig = p.sigma == null ? 0.08 : p.sigma;
    const rows = [];
    for (let t = 0; t <= dur + 1e-9; t += dt) {
        const q = v => Math.round((v + gauss(r) * sig) * 10) / 10;
        rows.push({ t, t1: q(T1), t2: q(T2) });
        const sub = 20, h = dt / sub;
        for (let i = 0; i < sub; i++) {
            const d1 = (-p.k12 * (T1 - T2) - p.k1r * (T1 - Tr)) / C1, d2 = (p.k12 * (T1 - T2) - p.k2r * (T2 - Tr)) / C2;
            T1 += d1 * h; T2 += d2 * h;
        }
    }
    return rows;
}

// 반·조·회차 설계. form = 학생이 CSV 를 불러오기 직전에 5-1 칸에 넣을 값(페이지는 CSV 머리말이 아니라 그때 칸 값을 씀).
// story = 이 회차에 심어 둔 상황 (교사·학생 세션 모두 볼 수 있는 곳에 적지 않는다 — 시나리오 문서의 교수용 절에만)
const K = { k12: 3.4, k1r: 0.03, k2r: 0.14 };   // 유리 비커, 뚜껑 없음 (τ ≈ 60 s, 열손실 약 10 %)
const RUNS = [
    // ── 1차: 중3 기본 · 7단계 ──
    { cls: 'g9', g: '1조', file: 'g9-1조-①-100g-100g', form: { m1: 100, m2: 100, vessel: '유리 비커 (열림)' }, p: Object.assign({ m1: 100, m2: 100, T1: 60.2, T2: 20.1 }, K), story: '경향(질량비) ①' },
    { cls: 'g9', g: '1조', file: 'g9-1조-②-100g-300g', form: { m1: 100, m2: 300, vessel: '유리 비커 (열림)' }, p: Object.assign({ m1: 100, m2: 300, T1: 60.0, T2: 20.3 }, K, { k2r: 0.16 }), story: '경향(질량비) ② — 큰 쪽 처음 온도에 가까워짐' },
    { cls: 'g9', g: '2조', file: 'g9-2조-①-35도-20도', form: { m1: 100, m2: 100, vessel: '유리 비커 (열림)' }, p: Object.assign({ m1: 100, m2: 100, T1: 35.1, T2: 20.2 }, K), story: '반복 1 (흔들림)' },
    { cls: 'g9', g: '2조', file: 'g9-2조-①반복-35도-20도', form: { m1: 100, m2: 100, vessel: '유리 비커 (열림)' }, p: Object.assign({ m1: 100, m2: 100, T1: 34.4, T2: 20.6 }, K, { k1r: 0.05, k2r: 0.20 }), story: '반복 2 (흔들림)' },
    { cls: 'g9', g: '2조', file: 'g9-2조-②-35도-4도', form: { m1: 100, m2: 100, vessel: '유리 비커 (열림, 얼음물)' }, p: Object.assign({ m1: 100, m2: 100, T1: 35.0, T2: 4.3 }, K, { k2r: 0.30 }), story: '예상 밖: 열평형 온도가 실온(22 °C)보다 낮아 큰 비커가 공기에서 열을 얻음 → 실측 > 이론, 열손실률 음수' },
    { cls: 'g9', g: '3조', file: 'g9-3조-①-뜨거운물안', form: { m1: 100, m2: 100, vessel: '유리 · 뜨거운 물 안' }, p: Object.assign({ m1: 100, m2: 100, T1: 60.0, T2: 20.0 }, K, { k1r: 0.02, k2r: 0.10 }), story: '차이 < 흔들림 ① 1회' },
    { cls: 'g9', g: '3조', file: 'g9-3조-①반복-뜨거운물안', form: { m1: 100, m2: 100, vessel: '유리 · 뜨거운 물 안' }, p: Object.assign({ m1: 100, m2: 100, T1: 59.0, T2: 20.4 }, K, { k1r: 0.04, k2r: 0.20 }), story: '차이 < 흔들림 ① 2회' },
    { cls: 'g9', g: '3조', file: 'g9-3조-②-뜨거운물밖', form: { m1: 100, m2: 100, vessel: '유리 · 뜨거운 물 밖' }, p: Object.assign({ m1: 100, m2: 100, T1: 20.2, T2: 60.0 }, K, { k1r: 0.02, k2r: 0.16 }), story: '차이 < 흔들림 ② 1회 (두 범위 겹침)' },
    { cls: 'g9', g: '3조', file: 'g9-3조-②반복-뜨거운물밖', form: { m1: 100, m2: 100, vessel: '유리 · 뜨거운 물 밖' }, p: Object.assign({ m1: 100, m2: 100, T1: 20.0, T2: 59.6 }, K, { k1r: 0.03, k2r: 0.22 }), story: '차이 < 흔들림 ② 2회' },
    { cls: 'g9', g: '4조', file: 'g9-4조-①-100g-100g', form: { m1: 100, m2: 100, vessel: '유리 비커 (열림)' }, p: Object.assign({ m1: 100, m2: 100, T1: 60.3, T2: 20.0 }, K), story: '두 가지 함께 ①' },
    { cls: 'g9', g: '4조', file: 'g9-4조-②-100g-200g', form: { m1: 100, m2: 200, vessel: '유리 비커 (열림)' }, p: Object.assign({ m1: 100, m2: 200, T1: 75.4, T2: 20.1 }, K, { k1r: 0.04 }), story: '두 가지 함께 ② — 질량비와 함께 뜨거운 물을 75 °C 로 (전기 주전자 물을 그대로 부음)' },
    { cls: 'g9', g: '5조', file: 'g9-5조-1', form: { m1: 100, m2: 100, vessel: '유리 비커 (열림)' }, p: Object.assign({ m1: 100, m2: 100, T1: 61.0, T2: 19.6 }, K, { k2r: 0.20 }), story: '어려운 조 ① — 파일 이름·회차 이름이 뜻이 없음' },
    { cls: 'g9', g: '5조', file: 'g9-5조-2', form: { m1: 100, m2: 100, vessel: '유리 비커 (열림)' }, p: Object.assign({ m1: 100, m2: 100, T1: 60.6, T2: 19.8 }, K, { k1r: 0.005, k2r: 0.02, dur: 300 }), story: '어려운 조 ② — 실제로는 스티로폼+뚜껑(단열)인데 칸 메모를 안 바꿈, 300초에서 일찍 멈춤' },
    // ── 2차: 고2 심화 · 가설연역 ──  (cup: 작은 비커 재질 · 빈 질량 → 5-1 고2 심화 칸)
    { cls: 'g11', g: 'A조', file: 'g11-A조-①-유리컵', form: { m1: 100, m2: 200, vessel: '안쪽 유리 컵', beakerMat: 'glass', cup1Mass: 60, cup2Mass: 0, roomT: 22 }, p: { m1: 100, m2: 200, T1: 65.0, T2: 20.0, cupC1: 0.84 * 60, k12: 3.0, k1r: 0.03, k2r: 0.16, dur: 600 }, story: '경향(재질, τ 큼)' },
    { cls: 'g11', g: 'A조', file: 'g11-A조-②-스테인리스컵', form: { m1: 100, m2: 200, vessel: '안쪽 스테인리스 컵', beakerMat: 'steel', cup1Mass: 60, cup2Mass: 0, roomT: 22 }, p: { m1: 100, m2: 200, T1: 64.8, T2: 20.2, cupC1: 0.50 * 60, k12: 11.0, k1r: 0.03, k2r: 0.16, dur: 600 }, story: '경향(재질, τ 작음)' },
    { cls: 'g11', g: 'B조', file: 'g11-B조-①-물', form: { m1: 100, m2: 100, liquid1: 'water', vessel: '유리 비커 (열림)' }, p: Object.assign({ m1: 100, m2: 100, T1: 60.0, T2: 20.0, dur: 600 }, K), story: '비열 ① 물' },
    { cls: 'g11', g: 'B조', file: 'g11-B조-②-식용유', form: { m1: 100, m2: 100, liquid1: 'oil', vessel: '유리 비커 (식용유·물)' }, p: Object.assign({ m1: 100, m2: 100, liq1: 'oil', T1: 60.2, T2: 20.1, dur: 600 }, K, { k12: 2.6 }), story: '비열 ② 식용유 — 이론 32.9 °C 쪽으로' },
    { cls: 'g11', g: 'C조', file: 'g11-C조-①-열림', form: { m1: 100, m2: 200, vessel: '열림' }, p: Object.assign({ m1: 100, m2: 200, T1: 65.0, T2: 20.0, dur: 600 }, K, { k2r: 0.12 }), story: '차이 < 흔들림 (τ·T_eq) ① 1회' },
    { cls: 'g11', g: 'C조', file: 'g11-C조-①반복-열림', form: { m1: 100, m2: 200, vessel: '열림' }, p: Object.assign({ m1: 100, m2: 200, T1: 64.1, T2: 20.5, dur: 600 }, K, { k12: 3.0, k2r: 0.18 }), story: '① 2회' },
    { cls: 'g11', g: 'C조', file: 'g11-C조-②-뚜껑', form: { m1: 100, m2: 200, vessel: '큰 비커 뚜껑' }, p: Object.assign({ m1: 100, m2: 200, T1: 64.6, T2: 20.1, dur: 600 }, K, { k12: 3.2, k2r: 0.09 }), story: '② 1회 (뚜껑 효과 < 반복 흔들림)' },
    { cls: 'g11', g: 'C조', file: 'g11-C조-②반복-뚜껑', form: { m1: 100, m2: 200, vessel: '큰 비커 뚜껑' }, p: Object.assign({ m1: 100, m2: 200, T1: 65.2, T2: 19.8, dur: 600 }, K, { k12: 3.6, k2r: 0.13 }), story: '② 2회' },
    { cls: 'g11', g: 'D조', file: 'g11-D조-①', form: { m1: 100, m2: 200, vessel: '유리 컵', beakerMat: 'glass', cup1Mass: 60, roomT: 22 }, p: { m1: 100, m2: 200, T1: 65.0, T2: 20.0, cupC1: 0.84 * 60, k12: 3.0, k1r: 0.03, k2r: 0.16, dur: 600 }, story: '두 가지 함께 ① 유리 100 g' },
    { cls: 'g11', g: 'D조', file: 'g11-D조-②', form: { m1: 60, m2: 200, vessel: '스테인리스 컵', beakerMat: 'steel', cup1Mass: 60, roomT: 22 }, p: { m1: 60, m2: 200, T1: 65.1, T2: 20.2, cupC1: 0.50 * 60, k12: 11.0, k1r: 0.03, k2r: 0.16, dur: 600 }, story: '두 가지 함께 ② 재질 + 물 60 g (τ 가 작아진 까닭을 가를 수 없음)' }
];

function toCsv(run, rows) {
    const f = run.form, L = M.liquidOf(f.liquid1 || 'water').name, L2 = M.liquidOf(f.liquid2 || 'water').name;
    const head = ['# 회차: ' + run.file, '# 작은 비커: ' + L + ' ' + f.m1 + 'g, 큰 비커: ' + L2 + ' ' + f.m2 + 'g, 비커: ' + f.vessel, 'time_s,small_beaker_C,big_beaker_C,diff_C'];
    rows.forEach(r => head.push([r.t, r.t1.toFixed(1), r.t2.toFixed(1), Math.abs(r.t1 - r.t2).toFixed(1)].join(',')));
    return '﻿' + head.join('\r\n') + '\r\n';
}

fs.mkdirSync(OUT, { recursive: true });
const out = [];
RUNS.forEach((run, i) => {
    const rows = curve(run.p, 1000 + i * 7);
    fs.writeFileSync(path.join(OUT, run.file + '.csv'), toCsv(run, rows));
    const meta = Object.assign({ liquid1: 'water', liquid2: 'water', roomT: 22, beakerMat: 'none', cup1Mass: 0, cup2Mass: 0 }, run.form);
    const a = M.analyzeRun(rows, meta);
    out.push({ cls: run.cls, g: run.g, file: run.file + '.csv', form: run.form, story: run.story, n: rows.length,
        t1_0: a.t1_0, t2_0: a.t2_0, tEq: a.tEq, tTheory: a.tTheory, tCorrected: a.tCorrected, eqTime: a.eqTime, lossPct: a.lossPct,
        tau: a.expFit && a.expFit.tau, r2: a.expFit && a.expFit.r2 });
});
fs.writeFileSync(path.join(OUT, 'runs.json'), JSON.stringify(out, null, 1));
console.log('| 반 | 조 | 파일 | 처음 T₁/T₂ | 실측 T_eq | 이론 | 보정 | 도달 s | 열손실률 % | τ s (R²) | 심어 둔 상황 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
out.forEach(o => console.log('| ' + [o.cls, o.g, '`' + o.file + '`', o.t1_0 + ' / ' + o.t2_0, o.tEq, o.tTheory, o.tCorrected, o.eqTime == null ? '미도달' : o.eqTime, o.lossPct, (o.tau || '–') + (o.r2 ? ' (' + o.r2 + ')' : ''), o.story].join(' | ') + ' |'));
