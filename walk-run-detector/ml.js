// 다중 분류기: 소프트맥스 회귀(로지스틱 회귀의 다중 클래스 확장), k-최근접 이웃
// 라벨은 문자열 id(예: 'walk', 'run', '계단'). 모델이 내놓는 값은 라벨별 확률이다.
// 외부 라이브러리 없이 구현했고 브라우저/Node 어디서나 돌아간다.

import { FEATURE_KEYS, featureVector, MIN_MOVEMENT_STD } from './analysis.js';

export const MODEL_VERSION = 2;
export const MODEL_TYPES = {
  logistic: '로지스틱(소프트맥스) 회귀',
  knn: 'k-최근접 이웃 (k=5)',
};

const pick = (x, idx) => idx.map(i => x[i]);

// 라벨 표시 순서: 걷기, 뛰기, 나머지는 이름순. 모델 안의 순서도 이것을 따른다.
const ORDER = ['walk', 'run'];
export const sortLabels = ids => [...ids].sort((a, b) => {
  const ia = ORDER.indexOf(a);
  const ib = ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'ko');
});

// ---------- 표준화 ----------
export function fitScaler(X) {
  const d = X[0].length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  for (const x of X) for (let j = 0; j < d; j++) mean[j] += x[j] / X.length;
  for (const x of X) for (let j = 0; j < d; j++) std[j] += (x[j] - mean[j]) ** 2 / X.length;
  return { mean, std: std.map(s => Math.sqrt(s) || 1) };
}
const scale = (x, sc) => x.map((v, j) => (v - sc.mean[j]) / sc.std[j]);

// ---------- 소프트맥스 회귀 ----------
function softmax(z) {
  const m = Math.max(...z);
  const e = z.map(v => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / s);
}

// Xs: 표준화된 입력, y: 라벨 번호(0..K-1)
function trainSoftmax(Xs, y, K, { epochs = 600, lr = 0.3, l2 = 0.01 } = {}) {
  const n = Xs.length;
  const d = Xs[0].length;
  const W = Array.from({ length: K }, () => new Array(d).fill(0));
  const b = new Array(K).fill(0);
  const loss = [];
  for (let e = 0; e < epochs; e++) {
    const gW = Array.from({ length: K }, () => new Array(d).fill(0));
    const gb = new Array(K).fill(0);
    let l = 0;
    for (let i = 0; i < n; i++) {
      const z = new Array(K);
      for (let k = 0; k < K; k++) {
        let s = b[k];
        for (let j = 0; j < d; j++) s += W[k][j] * Xs[i][j];
        z[k] = s;
      }
      const p = softmax(z);
      l -= Math.log(p[y[i]] + 1e-12);
      for (let k = 0; k < K; k++) {
        const err = p[k] - (k === y[i] ? 1 : 0);
        for (let j = 0; j < d; j++) gW[k][j] += err * Xs[i][j];
        gb[k] += err;
      }
    }
    for (let k = 0; k < K; k++) {
      for (let j = 0; j < d; j++) W[k][j] -= lr * (gW[k][j] / n + l2 * W[k][j]);
      b[k] -= lr * (gb[k] / n);
    }
    if (e % 20 === 0 || e === epochs - 1) loss.push(l / n);
  }
  return { W, b, loss };
}

function knnProbs(points, ys, K, xs, k) {
  const dist = points.map((p, i) => {
    let s = 0;
    for (let j = 0; j < p.length; j++) s += (p[j] - xs[j]) ** 2;
    return { s, y: ys[i] };
  });
  dist.sort((a, b) => a.s - b.s);
  const top = dist.slice(0, Math.min(k, dist.length));
  const p = new Array(K).fill(0);
  for (const t of top) p[t.y] += 1 / top.length;
  return p;
}

// ---------- 모델 ----------
// X: 전체 특징 벡터, labelsOf[i]: 라벨 id, featureIdx: 사용할 특징 번호
export function fitModel({ type, X, ys, featureIdx = FEATURE_KEYS.map((_, i) => i), epochs }) {
  const labels = sortLabels(new Set(ys));
  const yIdx = ys.map(y => labels.indexOf(y));
  const Xp = X.map(x => pick(x, featureIdx));
  const scaler = fitScaler(Xp);
  const Xs = Xp.map(x => scale(x, scaler));
  const base = { v: MODEL_VERSION, type, labels, featureIdx, features: featureIdx.map(i => FEATURE_KEYS[i]), scaler };
  if (type === 'knn') {
    return { ...base, k: 5, points: Xs.map(r => r.map(v => +v.toFixed(4))), ys: yIdx, loss: [] };
  }
  const { W, b, loss } = trainSoftmax(Xs, yIdx, labels.length, { epochs });
  return { ...base, W, b, loss };
}

// 전체 특징 벡터 → 라벨별 확률 (model.labels 순서)
export function predictProbs(model, x) {
  const xs = scale(pick(x, model.featureIdx), model.scaler);
  const K = model.labels.length;
  if (model.type === 'knn') return knnProbs(model.points, model.ys, K, xs, model.k);
  return softmax(model.W.map((w, k) => w.reduce((s, v, j) => s + v * xs[j], model.b[k])));
}

export function predictLabel(model, x) {
  const p = predictProbs(model, x);
  let best = 0;
  for (let k = 1; k < p.length; k++) if (p[k] > p[best]) best = k;
  return { label: model.labels[best], p: p[best], probs: Object.fromEntries(model.labels.map((l, k) => [l, p[k]])) };
}

// 실시간 구간 특징 → { label, p, probs } (흔들림이 너무 작으면 분류하지 않는다)
export function classify(model, features) {
  if (features.std < MIN_MOVEMENT_STD) return { label: 'idle', p: null, probs: null };
  return predictLabel(model, featureVector(features));
}

// ---------- 평가 ----------
// rows: [{ x, y(라벨 id), group }]
export function evaluate(model, rows) {
  const rowLabels = sortLabels(new Set(rows.map(r => r.y)));
  const colLabels = model.labels;
  const cm = {};
  for (const t of rowLabels) cm[t] = Object.fromEntries(colLabels.map(c => [c, 0]));
  let correct = 0;
  for (const r of rows) {
    const pred = predictLabel(model, r.x).label;
    cm[r.y][pred]++;
    if (pred === r.y) correct++;
  }
  const perClass = {};
  for (const l of sortLabels(new Set([...rowLabels, ...colLabels]))) {
    const tp = cm[l]?.[l] ?? 0;
    const support = rowLabels.includes(l) ? Object.values(cm[l]).reduce((a, b) => a + b, 0) : 0;
    const predicted = rowLabels.reduce((s, t) => s + (cm[t][l] ?? 0), 0);
    const precision = predicted ? tp / predicted : 0;
    const recall = support ? tp / support : 0;
    perClass[l] = { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0, support };
  }
  const supported = Object.keys(perClass).filter(l => perClass[l].support > 0);
  const macroF1 = supported.reduce((s, l) => s + perClass[l].f1, 0) / Math.max(1, supported.length);
  return { n: rows.length, accuracy: rows.length ? correct / rows.length : 0, macroF1, perClass, confusion: cm, rowLabels, colLabels };
}

// ---------- 학습/테스트 분리 ----------
// 같은 기록에서 나온 구간이 학습과 테스트에 섞이면 정확도가 부풀려진다.
// 그래서 "기록 단위"로 나누고, 라벨마다 최소 1개 기록은 테스트로 보낸다.
export function splitByRecording(rows, testFrac, rng) {
  const groupsByLabel = {};
  const seen = new Set();
  for (const r of rows) {
    if (!seen.has(r.group)) {
      seen.add(r.group);
      (groupsByLabel[r.y] ||= []).push(r.group);
    }
  }
  const short = Object.entries(groupsByLabel).filter(([, g]) => g.length < 2).map(([l]) => l);
  if (Object.keys(groupsByLabel).length < 2 || short.length) return { short, labels: Object.keys(groupsByLabel) };
  const testGroups = new Set();
  for (const g0 of Object.values(groupsByLabel)) {
    const g = [...g0];
    for (let i = g.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [g[i], g[j]] = [g[j], g[i]];
    }
    const k = Math.min(g.length - 1, Math.max(1, Math.round(g.length * testFrac)));
    g.slice(0, k).forEach(id => testGroups.add(id));
  }
  return { train: rows.filter(r => !testGroups.has(r.group)), test: rows.filter(r => testGroups.has(r.group)) };
}

const fitOn = (type, rs, featureIdx, epochs) => fitModel({ type, X: rs.map(r => r.x), ys: rs.map(r => r.y), featureIdx, epochs });

// 반환: { error } 또는 { model(최종), evalModel, train, test, split }
export function trainAndEvaluate({ type, rows, featureIdx, testFrac = 0.25, refitAll = true, rng = Math.random }) {
  const split = splitByRecording(rows, testFrac, rng);
  if (!split.train) {
    return {
      error: split.labels.length < 2
        ? '서로 다른 라벨이 2개 이상 필요합니다.'
        : `라벨마다 기록이 2개 이상 필요합니다. 부족한 라벨: ${split.short.join(', ')} (같은 기록의 구간끼리 학습·테스트에 섞이지 않게 기록 단위로 나눕니다)`,
    };
  }
  const evalModel = fitOn(type, split.train, featureIdx);
  const train = evaluate(evalModel, split.train);
  const test = evaluate(evalModel, split.test);
  const model = refitAll ? fitOn(type, rows, featureIdx) : evalModel;
  model.trainedAt = Date.now();
  model.nWindows = rows.length;
  model.nRecordings = new Set(rows.map(r => r.group)).size;
  model.metrics = { train: slim(train), test: slim(test) };
  return { model, evalModel, train, test, split };
}

// 저장·게시할 모델에는 요약 지표만 싣는다.
const slim = ev => ({ n: ev.n, accuracy: ev.accuracy, macroF1: ev.macroF1, perClass: ev.perClass });

// 소프트맥스 회귀의 라벨별 표준화 가중치 (특징 이름 → 라벨별 값)
export function featureWeights(model) {
  if (model.type !== 'logistic') return null;
  return model.features.map((key, j) => ({ key, byLabel: Object.fromEntries(model.labels.map((l, k) => [l, model.W[k][j]])) }));
}

// ---------- 학습곡선: 기록이 늘면 테스트 정확도가 어떻게 변하나 ----------
// 같은 테스트 기록으로, 라벨마다 학습 기록을 1개, 2개, ... 늘려가며 여러 번 뽑아 평균을 낸다.
export function learningCurve({ type, rows, featureIdx, testFrac = 0.25, repeats = 4, rng = Math.random }) {
  const split = splitByRecording(rows, testFrac, rng);
  if (!split.train) return null;
  const byLabel = {};
  for (const r of split.train) ((byLabel[r.y] ||= {})[r.group] ||= []).push(r);
  const maxN = Math.min(...Object.values(byLabel).map(g => Object.keys(g).length));
  const steps = [];
  for (let n = 1; n <= maxN; n = n < 4 ? n + 1 : Math.ceil(n * 1.5)) steps.push(n);
  if (steps[steps.length - 1] !== maxN) steps.push(maxN);
  const curve = [];
  for (const n of steps) {
    const accs = [];
    for (let rep = 0; rep < repeats; rep++) {
      const subset = [];
      for (const groups of Object.values(byLabel)) {
        const ids = Object.keys(groups);
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        for (const id of ids.slice(0, n)) subset.push(...groups[id]);
      }
      accs.push(evaluate(fitOn(type, subset, featureIdx, 250), split.test).accuracy);
    }
    curve.push({ n, mean: accs.reduce((a, b) => a + b, 0) / accs.length, min: Math.min(...accs), max: Math.max(...accs) });
  }
  return curve;
}

// 모델 크기(JSON 바이트)와 예측 1회에 걸리는 시간(ms)
export function modelCost(model, xs, reps = 200) {
  const bytes = JSON.stringify(model).length;
  if (!xs.length) return { bytes, msPerPrediction: 0 };
  const t0 = performance.now();
  for (let r = 0; r < reps; r++) predictLabel(model, xs[r % xs.length]);
  return { bytes, msPerPrediction: (performance.now() - t0) / reps };
}
