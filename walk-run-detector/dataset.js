// 학습 데이터(기록) 저장소: 이 기기(localStorage) + 불러온 클라우드 데이터(메모리)
// 기록 하나 = { id, label, source, hz, m:[|a| 값들], createdAt, cloudId?, userId? }
//   label: 'walk' | 'run'   source: 'sensor' | 'sim' | 'cloud'

import { HZ, LABEL_KEYS, windowsOf, featureVector } from './analysis.js';

const LOCAL_KEY = 'wr-recordings-v1';
const MODEL_KEY = 'wr-active-model-v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // 용량 초과 또는 저장소 사용 불가
  }
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const loadLocalRecordings = () => read(LOCAL_KEY, []);

export function saveLocalRecordings(list) {
  return write(LOCAL_KEY, list);
}

export function makeRecording({ label, source, m, userId }) {
  return {
    id: newId(),
    label,
    source,
    hz: HZ,
    m: m.map(v => Math.round(v * 100) / 100),
    createdAt: Date.now(),
    ...(userId ? { userId } : {}),
  };
}

export const loadActiveModel = () => read(MODEL_KEY, null);
export const saveActiveModel = model => write(MODEL_KEY, model);

// 기록 목록 → 학습 행. 같은 기록의 구간은 같은 group이어야 한다.
export function toRows(recordings) {
  const rows = [];
  for (const rec of recordings) {
    const y = rec.label === 'run' ? 1 : 0;
    for (const w of windowsOf(rec.m)) {
      rows.push({ x: featureVector(w.features), y, group: rec.id, source: rec.source });
    }
  }
  return rows;
}

// 요약: 라벨·출처별 기록 수와 구간 수
export function summarize(recordings) {
  const out = { total: recordings.length, byLabel: {}, bySource: {}, windows: 0 };
  for (const k of LABEL_KEYS) out.byLabel[k] = 0;
  for (const rec of recordings) {
    out.byLabel[rec.label] = (out.byLabel[rec.label] || 0) + 1;
    out.bySource[rec.source] = (out.bySource[rec.source] || 0) + 1;
    out.windows += windowsOf(rec.m).length;
  }
  return out;
}
