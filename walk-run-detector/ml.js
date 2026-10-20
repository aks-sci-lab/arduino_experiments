// 걷기/뛰기 이진 분류기: 로지스틱 회귀, k-최근접 이웃 (외부 라이브러리 없이 구현)
// 라벨: 0 = 걷기, 1 = 뛰기. 모델이 내놓는 값 p는 "뛰기일 확률"이다.

import { FEATURE_KEYS, featureVector, MIN_MOVEMENT_STD } from './analysis.js';

export const MODEL_TYPES = {
  logistic: '로지스틱 회귀',
  knn: 'k-최근접 이웃 (k=5)',
};

// ---------- 표준화 ----------
export function fitScaler(X) {
  const d = X[0].length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  for (const x of X) for (let j = 0; j < d; j++) mean[j] += x[j] / X.length;
  for (const x of X) for (let j = 0; j < d; j++) std[j] += (x[j] - mean[j]) ** 2 / X.length;
  return { mean, std: std.map(s => Math.sqrt(s) || 1) };
}
export const scale = (x, sc) => x.map((v, j) => (v - sc.mean[j]) / sc.std[j]);

// ---------- 로지스틱 회귀 ----------
const sigmoid = z => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

export function trainLogistic(Xs, y, { epochs = 800, lr = 0.3, l2 = 0.01 } = {}) {
  const n = Xs.length;
  const d = Xs[0].length;
  const w = new Array(d).fill(0);
  let b = 0;
  const loss = [];
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    let l = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * Xs[i][j];
      const p = sigmoid(z);
      const err = p - y[i];
      for (let j = 0; j < d; j++) gw[j] += err * Xs[i][j];
      gb += err;
      l -= y[i] * Math.log(p + 1e-12) + (1 - y[i]) * Math.log(1 - p + 1e-12);
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
    b -= lr * (gb / n);
    if (e % 20 === 0 || e === epochs - 1) loss.push(l / n);
  }
  return { w, b, loss };
}

// ---------- k-최근접 이웃 ----------
function knnProb(points, labels, xs, k) {
  const dist = points.map((p, i) => {
    let s = 0;
    for (let j = 0; j < p.length; j++) s += (p[j] - xs[j]) ** 2;
    return { s, y: labels[i] };
  });
  dist.sort((a, b) => a.s - b.s);
  const top = dist.slice(0, Math.min(k, dist.length));
  return top.reduce((a, t) => a + t.y, 0) / top.length;
}

// ---------- 모델 ----------
export function fitModel(type, X, y) {
  const scaler = fitScaler(X);
  const Xs = X.map(x => scale(x, scaler));
  if (type === 'knn') {
    return { type, features: FEATURE_KEYS, scaler, k: 5, points: Xs.map(r => r.map(v => +v.toFixed(4))), labels: y, loss: [] };
  }
  const { w, b, loss } = trainLogistic(Xs, y);
  return { type: 'logistic', features: FEATURE_KEYS, scaler, w, b, loss };
}

// x: 특징 벡터 (FEATURE_KEYS 순서) → 뛰기일 확률
export function predictProb(model, x) {
  const xs = scale(x, model.scaler);
  if (model.type === 'knn') return knnProb(model.points, model.labels, xs, model.k);
  let z = model.b;
  for (let j = 0; j < xs.length; j++) z += model.w[j] * xs[j];
  return sigmoid(z);
}

// 실시간 구간 특징 → { label: 'walk'|'run'|'idle', p }
export function classify(model, features) {
  if (features.std < MIN_MOVEMENT_STD) return { label: 'idle', p: null };
  const p = predictProb(model, featureVector(features));
  return { label: p >= 0.5 ? 'run' : 'walk', p };
}

// ---------- 평가 ----------
export function evaluate(model, X, y) {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = 0; i < X.length; i++) {
    const pred = predictProb(model, X[i]) >= 0.5 ? 1 : 0;
    if (pred === 1 && y[i] === 1) tp++;
    else if (pred === 0 && y[i] === 0) tn++;
    else if (pred === 1 && y[i] === 0) fp++;
    else fn++;
  }
  const n = X.length;
  return {
    n, tp, tn, fp, fn,
    accuracy: n ? (tp + tn) / n : 0,
    precisionRun: tp + fp ? tp / (tp + fp) : 0,
    recallRun: tp + fn ? tp / (tp + fn) : 0,
  };
}

// 같은 기록에서 나온 구간이 학습과 테스트에 섞이면 정확도가 부풀려진다.
// 그래서 "기록 단위"로 나눈다. 라벨마다 최소 1개 기록은 테스트로 보낸다.
export function splitByRecording(rows, testFrac, rng) {
  const groups = { 0: [], 1: [] };
  const seen = new Set();
  for (const r of rows) {
    if (!seen.has(r.group)) {
      seen.add(r.group);
      groups[r.y].push(r.group);
    }
  }
  for (const y of [0, 1]) {
    if (groups[y].length < 2) return null;
  }
  const testGroups = new Set();
  for (const y of [0, 1]) {
    const g = [...groups[y]];
    for (let i = g.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [g[i], g[j]] = [g[j], g[i]];
    }
    const k = Math.min(g.length - 1, Math.max(1, Math.round(g.length * testFrac)));
    g.slice(0, k).forEach(id => testGroups.add(id));
  }
  return {
    train: rows.filter(r => !testGroups.has(r.group)),
    test: rows.filter(r => testGroups.has(r.group)),
  };
}

// rows: [{ x(특징 벡터), y(0/1), group(기록 id) }]
// 반환: { model(최종), evalModel(테스트 평가에 쓴 모델), train, test, split }
export function trainAndEvaluate({ type, rows, testFrac = 0.25, refitAll = true, rng = Math.random }) {
  const split = splitByRecording(rows, testFrac, rng);
  if (!split) return { error: '걷기와 뛰기 각각 기록이 2개 이상 필요합니다. (같은 기록의 구간끼리 학습·테스트에 섞이지 않게 기록 단위로 나눕니다)' };
  const fitOn = rs => fitModel(type, rs.map(r => r.x), rs.map(r => r.y));
  const evalModel = fitOn(split.train);
  const train = evaluate(evalModel, split.train.map(r => r.x), split.train.map(r => r.y));
  const test = evaluate(evalModel, split.test.map(r => r.x), split.test.map(r => r.y));
  const model = refitAll ? fitOn(rows) : evalModel;
  model.trainedAt = Date.now();
  model.nWindows = rows.length;
  model.nRecordings = new Set(rows.map(r => r.group)).size;
  model.metrics = { train, test };
  return { model, evalModel, train, test, split };
}

// 로지스틱 회귀에서 "표준화된 가중치"는 특징이 클수록 뛰기 쪽(+)/걷기 쪽(−)으로 미는 정도를 뜻한다.
export function featureWeights(model) {
  if (model.type !== 'logistic') return null;
  return model.features.map((key, i) => ({ key, w: model.w[i] }));
}
