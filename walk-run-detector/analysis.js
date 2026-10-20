// 신호 처리 · 특징 추출 · 시뮬레이션 (브라우저/Node 공용 순수 함수)
// 기록은 모두 HZ(50Hz)로 다시 표본화한 |a| 배열로 다룬다. 기기마다 센서 주기가 달라도 같은 특징을 얻기 위해서다.

export const G = 9.80665;
export const HZ = 50;
export const WIN_SEC = 4;
export const WIN_N = HZ * WIN_SEC;      // 한 판정 구간의 표본 수
export const STEP_N = HZ * 2;           // 학습용 구간을 자를 때 이동 간격 (2초, 절반 겹침)
export const MIN_MOVEMENT_STD = 0.5;    // 이보다 흔들림이 작으면 "움직임 없음"으로 보고 분류하지 않는다

export const LABELS = { walk: '걷기', run: '뛰기' };
export const LABEL_KEYS = ['walk', 'run'];

// 모델이 보는 특징 (|a|는 휴대폰 방향과 무관한 가속도 크기)
export const FEATURES = [
  { key: 'mean', name: '평균 |a|', unit: 'm/s²', hint: '구간 동안의 평균. 대체로 g(9.8) 근처' },
  { key: 'std', name: '표준편차 σ', unit: 'm/s²', hint: '흔들림의 크기' },
  { key: 'min', name: '최소 |a|', unit: 'm/s²', hint: '0에 가까우면 체공(자유낙하)' },
  { key: 'max', name: '최대 |a|', unit: 'm/s²', hint: '착지 충격의 크기' },
  { key: 'spread', name: '90%−10% 폭', unit: 'm/s²', hint: '이상값에 덜 민감한 흔들림 폭' },
  { key: 'jerk', name: '평균 변화율', unit: 'm/s³', hint: '|a|가 얼마나 급하게 변하는가' },
  { key: 'cadence', name: '케이던스', unit: '걸음/분', hint: '1분에 환산한 걸음 수' },
  { key: 'regularity', name: '주기성', unit: '0~1', hint: '걸음이 얼마나 규칙적으로 반복되는가' },
  { key: 'lowFrac', name: '낮은 구간 비율', unit: '비율', hint: '|a| < 3 m/s² 인 시간의 비율(체공 근처)' },
  { key: 'highFrac', name: '높은 구간 비율', unit: '비율', hint: '|a| > 15 m/s² 인 시간의 비율(강한 충격)' },
];
export const FEATURE_KEYS = FEATURES.map(f => f.key);

// ---------- 표본화 ----------

// pts: [{t(ms), m}] 시간순. tStart부터 1/hz 간격으로 n개를 선형보간해 뽑는다.
export function resample(pts, hz, tStart, n) {
  const out = new Array(n);
  const dt = 1000 / hz;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = tStart + i * dt;
    while (j < pts.length - 2 && pts[j + 1].t < t) j++;
    const a = pts[j];
    const b = pts[Math.min(j + 1, pts.length - 1)];
    const span = b.t - a.t;
    const f = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    out[i] = a.m + (b.m - a.m) * f;
  }
  return out;
}

// ---------- 특징 추출 ----------

function percentile(sorted, p) {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function smooth3(x) {
  return x.map((v, i) => (x[Math.max(0, i - 1)] + v + x[Math.min(x.length - 1, i + 1)]) / 3);
}

// 걸음(착지) 봉우리의 위치 인덱스. 평균보다 충분히 크고, 직전 봉우리와 0.28초 이상 떨어진 극댓값.
export function findPeaks(x, mean, std, hz = HZ) {
  const sm = smooth3(x);
  const threshold = mean + Math.max(0.5 * std, 0.5);
  const minGap = Math.round(0.28 * hz);
  const peaks = [];
  for (let i = 1; i < sm.length - 1; i++) {
    if (sm[i] > threshold && sm[i] >= sm[i - 1] && sm[i] > sm[i + 1]) {
      const last = peaks[peaks.length - 1];
      if (last !== undefined && i - last < minGap) {
        if (sm[i] > sm[last]) peaks[peaks.length - 1] = i;
      } else {
        peaks.push(i);
      }
    }
  }
  return peaks;
}

// 0.3~1.2초 지연 범위에서 정규화 자기상관의 최댓값 (규칙적으로 반복될수록 1에 가깝다)
function regularity(x, mean, hz) {
  const d = x.map(v => v - mean);
  let r0 = 0;
  for (const v of d) r0 += v * v;
  if (r0 < 1e-9) return 0;
  let best = 0;
  const lo = Math.round(0.3 * hz);
  const hi = Math.min(Math.round(1.2 * hz), d.length - 2);
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    for (let i = 0; i + lag < d.length; i++) s += d[i] * d[i + lag];
    best = Math.max(best, s / r0);
  }
  return Math.max(0, Math.min(1, best));
}

// x: HZ로 표본화한 |a| 배열 → { 특징키: 값 }
export function extractFeatures(x, hz = HZ) {
  const n = x.length;
  let sum = 0;
  for (const v of x) sum += v;
  const mean = sum / n;
  let sq = 0;
  let jerkSum = 0;
  let low = 0;
  let high = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = x[i];
    sq += (v - mean) ** 2;
    if (v < min) min = v;
    if (v > max) max = v;
    if (v < 3) low++;
    if (v > 15) high++;
    if (i > 0) jerkSum += Math.abs(v - x[i - 1]);
  }
  const std = Math.sqrt(sq / n);
  const sorted = [...x].sort((a, b) => a - b);
  const peaks = findPeaks(x, mean, std, hz);
  return {
    mean,
    std,
    min,
    max,
    spread: percentile(sorted, 0.9) - percentile(sorted, 0.1),
    jerk: (jerkSum / (n - 1)) * hz,
    cadence: (peaks.length / (n / hz)) * 60,
    regularity: regularity(x, mean, hz),
    lowFrac: low / n,
    highFrac: high / n,
    _peaks: peaks,
  };
}

export const featureVector = f => FEATURE_KEYS.map(k => f[k]);

// 기록(배열)을 WIN_N 길이 구간으로 잘라 구간마다 특징을 구한다.
export function windowsOf(x, winN = WIN_N, stepN = STEP_N) {
  const out = [];
  for (let s = 0; s + winN <= x.length; s += stepN) {
    out.push({ start: s, features: extractFeatures(x.slice(s, s + winN)) });
  }
  return out;
}

// ---------- 시뮬레이션 (센서 없이 수업·테스트용 데이터 생성) ----------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 사람마다 걸음 빠르기·세기가 다르도록 매번 다른 파라미터를 뽑는다.
export function makeSimSignal(kind, rng = Math.random) {
  const u = (a, b) => a + (b - a) * rng();
  const phase0 = rng() * 2 * Math.PI;
  const noiseSd = u(0.2, 0.8);
  const gauss = () => (rng() + rng() + rng() + rng() - 2) * 1.7;
  if (kind === 'walk') {
    const f = u(1.4, 2.4);
    const amp = u(1.5, 4.5);
    const amp2 = u(0.3, 1.4);
    return t => G * u(0.99, 1.01) + amp * Math.sin(2 * Math.PI * f * t + phase0)
      + amp2 * Math.sin(4 * Math.PI * f * t + 0.6) + noiseSd * gauss();
  }
  const f = u(2.1, 3.4);
  const contact = u(0.28, 0.52);
  const scale = u(0.85, 1.15);
  const flightFloor = u(0, 1.5);
  return t => {
    const p = (t * f + phase0 / (2 * Math.PI)) % 1;
    if (p < contact) {
      const peak = (G * Math.PI) / (2 * contact) * scale;
      return peak * Math.sin((Math.PI * p) / contact) + noiseSd * gauss();
    }
    return Math.abs(flightFloor + noiseSd * gauss());
  };
}

export function makeSimSeries(kind, seconds, rng = Math.random, hz = HZ) {
  const sig = makeSimSignal(kind, rng);
  return Array.from({ length: Math.round(seconds * hz) }, (_, i) => sig(i / hz));
}
