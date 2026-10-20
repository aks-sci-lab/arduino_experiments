// 데이터 탐색: "걷기와 뛰기를 구별하려면 어떤 데이터(특징)가 필요한가?"를 학생이 직접 확인하기 위한 계산
// rows: [{ x(전체 특징 벡터), y(라벨 id), group }]

import { FEATURES } from './analysis.js';

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const variance = a => { const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length; };

// 두 라벨 A, B를 가장 잘 가르는 "기준선 하나"를 찾는다 (결정 그루터기).
// 반환: { threshold, accuracy, aHigher } — aHigher가 true면 "값이 클수록 A".
export function bestThreshold(valsA, valsB) {
  const all = [...valsA.map(v => ({ v, a: true })), ...valsB.map(v => ({ v, a: false }))].sort((p, q) => p.v - q.v);
  const n = all.length;
  const totalA = valsA.length;
  let best = { accuracy: 0, threshold: all[0].v, aHigher: true };
  let aBelow = 0;
  let bBelow = 0;
  for (let i = 0; i < n - 1; i++) {
    if (all[i].a) aBelow++; else bBelow++;
    if (all[i].v === all[i + 1].v) continue;
    const threshold = (all[i].v + all[i + 1].v) / 2;
    const bAbove = valsB.length - bBelow;
    const aHigherAcc = ((totalA - aBelow) + bBelow) / n;   // 기준선 위 = A
    const aLowerAcc = (aBelow + bAbove) / n;               // 기준선 아래 = A
    if (aHigherAcc > best.accuracy) best = { accuracy: aHigherAcc, threshold, aHigher: true };
    if (aLowerAcc > best.accuracy) best = { accuracy: aLowerAcc, threshold, aHigher: false };
  }
  return best;
}

// 특징마다 두 라벨을 얼마나 잘 가르는지: 기준선 하나만으로 맞히는 정확도, 효과 크기(Cohen's d)
// 정확도 순으로 정렬해서 돌려준다.
export function rankFeatures(rows, labelA, labelB) {
  const A = rows.filter(r => r.y === labelA);
  const B = rows.filter(r => r.y === labelB);
  if (!A.length || !B.length) return [];
  return FEATURES.map((f, i) => {
    const a = A.map(r => r.x[i]);
    const b = B.map(r => r.x[i]);
    const pooled = Math.sqrt((variance(a) + variance(b)) / 2) || 1e-9;
    return {
      key: f.key, index: i, name: f.name, unit: f.unit, hint: f.hint,
      meanA: mean(a), meanB: mean(b),
      d: Math.abs(mean(a) - mean(b)) / pooled,
      ...bestThreshold(a, b),
    };
  }).sort((p, q) => q.accuracy - p.accuracy || q.d - p.d);
}

// 히스토그램: 라벨별 구간 분포. 반환: { edges:[…], counts:{ label: [n…] } }
export function histogram(rows, featureIndex, labels, bins = 16) {
  const vals = rows.filter(r => labels.includes(r.y)).map(r => r.x[featureIndex]);
  if (!vals.length) return null;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi === lo) { lo -= 0.5; hi += 0.5; }
  const w = (hi - lo) / bins;
  const counts = Object.fromEntries(labels.map(l => [l, new Array(bins).fill(0)]));
  for (const r of rows) {
    if (!counts[r.y]) continue;
    counts[r.y][Math.min(bins - 1, Math.floor((r.x[featureIndex] - lo) / w))]++;
  }
  return { lo, hi, bins, counts };
}
