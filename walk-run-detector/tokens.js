// 토큰 비교 실습: 같은 4초 구간을 LLM에게 "이게 어떤 동작인가?" 하고 물을 때,
// 입력을 어떤 형식으로 주느냐에 따라 토큰 수가 얼마나 달라지는지 본다.
// 학습된 머신러닝 모델은 같은 일을 토큰 0개로 하므로(수학 계산만 함) 그 차이도 비교한다.

import { FEATURES, WIN_N, windowsOf, featureVector } from './analysis.js';

export const CLASSIFY_SYSTEM = '스마트폰 가속도 센서 데이터로 사람의 동작을 분류하는 분류기입니다. 후보 라벨 중 정확히 하나만 고릅니다.';

const r1 = v => Math.round(v * 10) / 10;

// 50Hz 배열 → 10Hz로 줄이기(5개 평균)
export function downsample10(x) {
  const out = [];
  for (let i = 0; i + 5 <= x.length; i += 5) out.push(r1((x[i] + x[i + 1] + x[i + 2] + x[i + 3] + x[i + 4]) / 5));
  return out;
}

export const FORMATS = [
  { id: 'raw50', name: '원시 파형 50Hz (숫자 200개)', data: (x) => x.map(r1).join(',') },
  { id: 'raw10', name: '파형 10Hz (숫자 40개)', data: (x) => downsample10(x).join(',') },
  {
    id: 'features',
    name: '특징 10개 (이 앱이 계산한 요약)',
    data: (x, f) => FEATURES.map(ft => `${ft.name}=${Math.round(f[ft.key] * 100) / 100}`).join(', '),
  },
];

// formatId: FORMATS의 id, x: 50Hz |a| 배열(200개), f: extractFeatures 결과, labelNames: 후보 라벨 이름 배열
export function buildPrompt(formatId, x, f, labelNames) {
  const fmt = FORMATS.find(v => v.id === formatId);
  return `스마트폰 가속도 크기 |a|(m/s², 가만히 있으면 약 9.8)의 4초 구간입니다.
후보 라벨: ${labelNames.join(', ')}
데이터(${fmt.name}): ${fmt.data(x, f)}
어느 라벨입니까?`;
}

// 기록들에서 라벨마다 perLabel개씩 4초 구간을 무작위로 고른다. 반환: [{ label, x(50Hz 배열), f(특징), vec }]
export function sampleWindows(recordings, perLabel, rng = Math.random) {
  const by = {};
  for (const rec of recordings) {
    for (const w of windowsOf(rec.m)) {
      (by[rec.label] ||= []).push({ label: rec.label, x: rec.m.slice(w.start, w.start + WIN_N), f: w.features, vec: featureVector(w.features) });
    }
  }
  const out = [];
  for (const list of Object.values(by)) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    out.push(...list.slice(0, perLabel));
  }
  return out;
}
