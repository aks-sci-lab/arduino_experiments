// 가속도 데이터 분석 · 판정 로직 (브라우저/Node 공용 순수 함수)

export const G = 9.80665;

export const DEFAULT_THRESHOLDS = {
  stillStd: 0.6,   // σ가 이보다 작으면 정지
  runStd: 4.0,     // σ가 이보다 크면 뛰기
  flightMin: 2.5,  // 최소 |a|가 이보다 작으면 체공 구간이 있다고 봄 → 뛰기
};

export const LABELS = { still: '정지', walk: '걷기', run: '뛰기' };

const MIN_STEP_INTERVAL_MS = 280; // 사람이 낼 수 있는 최대 케이던스 ≈ 210걸음/분

function meanStd(values) {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0 };
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  let sq = 0;
  for (const v of values) sq += (v - mean) ** 2;
  return { mean, std: Math.sqrt(sq / n) };
}

// 3점 이동평균으로 센서 잡음을 줄인다.
export function smooth(values) {
  return values.map((v, i) => {
    const a = values[Math.max(0, i - 1)];
    const b = values[Math.min(values.length - 1, i + 1)];
    return (a + v + b) / 3;
  });
}

// 걸음(착지) 봉우리 검출: 평균보다 충분히 크고, 직전 봉우리와 280ms 이상 떨어진 극댓값
export function detectPeaks(samples, mean, std) {
  const sm = smooth(samples.map(s => s.m));
  const threshold = mean + Math.max(0.5 * std, 0.5);
  const peaks = [];
  for (let i = 1; i < sm.length - 1; i++) {
    if (sm[i] > threshold && sm[i] >= sm[i - 1] && sm[i] > sm[i + 1]) {
      const last = peaks[peaks.length - 1];
      if (last && samples[i].t - last.t < MIN_STEP_INTERVAL_MS) {
        if (sm[i] > last.m) peaks[peaks.length - 1] = { t: samples[i].t, m: sm[i] };
      } else {
        peaks.push({ t: samples[i].t, m: sm[i] });
      }
    }
  }
  return peaks;
}

// samples: [{ t: ms, m: |a| (m/s²) }, ...]
export function analyzeWindow(samples, th = DEFAULT_THRESHOLDS) {
  if (samples.length < 10) return null;
  const values = samples.map(s => s.m);
  const { mean, std } = meanStd(values);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const durationSec = (samples[samples.length - 1].t - samples[0].t) / 1000;
  const peaks = detectPeaks(samples, mean, std);
  const steps = peaks.length;
  const cadence = durationSec > 0 ? (steps / durationSec) * 60 : 0;

  let label;
  let reason;
  if (std < th.stillStd) {
    label = 'still';
    reason = `σ = ${std.toFixed(2)} < ${th.stillStd} → 흔들림이 거의 없음`;
  } else if (std >= th.runStd) {
    label = 'run';
    reason = `σ = ${std.toFixed(2)} ≥ ${th.runStd} → 큰 충격과 흔들림`;
  } else if (min <= th.flightMin && steps >= 2) {
    label = 'run';
    reason = `최소 |a| = ${min.toFixed(2)} ≤ ${th.flightMin} → 체공(자유낙하에 가까운) 구간 존재`;
  } else {
    label = 'walk';
    reason = `σ = ${std.toFixed(2)} (기준 ${th.stillStd}~${th.runStd}), 최소 |a| = ${min.toFixed(1)} → 항상 발이 땅에 닿아 있음`;
  }

  return { n: samples.length, durationSec, mean, std, max, min, steps, cadence, peaks, label, reason };
}

// 시뮬레이션 신호 (센서 없는 PC 테스트용). 한 주기 동안 평균 |a|가 g가 되도록 만든다.
export function simulate(kind, tSec) {
  const noise = (Math.random() - 0.5) * 0.8;
  if (kind === 'walk') {
    const f = 1.8; // 걸음/초 ≈ 108걸음/분
    const phase = 2 * Math.PI * f * tSec;
    return G + 2.6 * Math.sin(phase) + 0.8 * Math.sin(2 * phase + 0.6) + noise;
  }
  // 뛰기: 접지 구간에 반사인 모양의 충격, 체공 구간은 자유낙하(|a| ≈ 0)
  const f = 2.7; // ≈ 162걸음/분
  const contact = 0.4; // 한 주기 중 접지 비율
  const p = (tSec * f) % 1;
  if (p < contact) {
    const peak = (G * Math.PI) / (2 * contact); // 평균이 g가 되는 봉우리 높이
    return peak * Math.sin((Math.PI * p) / contact) + noise;
  }
  return Math.abs(0.4 + noise);
}
