// 화면 모듈들이 함께 쓰는 상태 · 이벤트 · 작은 도구들
import { createSampler } from './sampler.js';
import { loadLocalRecordings, saveLocalRecordings, loadActiveModel, saveActiveModel } from './dataset.js';
import { labelIds, labelName, observe, labelColorVar } from './labels.js';

export const $ = id => document.getElementById(id);

// 아주 단순한 이벤트 버스. 이벤트: 'recordings' 'model' 'labels' 'account' 'sampler-error' 'tab' 'subtab'
const handlers = {};
export const on = (evt, fn) => { (handlers[evt] ||= []).push(fn); };
export const emit = (evt, payload) => (handlers[evt] || []).forEach(fn => fn(payload));

const readLocal = (key, fallback = '') => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const writeLocal = (key, value) => { try { localStorage.setItem(key, value); } catch { /* 저장소를 못 쓰면 이번 세션만 유지 */ } };
export { readLocal, writeLocal };

export const state = {
  mode: null,                       // null | 'judge' | 'record'
  model: loadActiveModel(),         // 지금 판정에 쓰는 모델
  recordings: loadLocalRecordings(),
  cloudRecs: [],                    // 불러온 학급 데이터 (메모리에만 둠)
  lastTraining: null,               // { rows, res, featureIdx }
  group: readLocal('wr-group'),
  featureIdx: null,                 // 학습에 쓸 특징 번호들 (null이면 전체)
  live: { buf: [], windows: [], latest: null, source: null, timer: null },
  account: { user: null, isAdmin: false, aiState: 'loading', aiConfig: null, unavailable: false },
};
observe(state.recordings.map(r => r.label));

// 센서 표본은 지금 모드(judge/record)를 맡은 화면 모듈이 받는다.
export const sampleHandlers = {};
export const sampler = createSampler({
  onSample: s => sampleHandlers[state.mode]?.(s),
  onError: msg => emit('sampler-error', msg),
});

// ---------- 데이터 ----------
export const allRecordings = () => [
  ...state.recordings,
  ...state.cloudRecs.filter(c => !state.recordings.some(r => r.cloudId && r.cloudId === c.cloudId)),
];

// 교사가 평가용으로 지정한 기록인가 (내가 올린 기록이 나중에 평가용으로 지정된 경우도 포함)
export const isEvalRec = r => r.evalSet === true || (!!r.cloudId && state.cloudRecs.some(c => c.cloudId === r.cloudId && c.evalSet));

// 학습에 쓸 기록: 평가용은 항상 제외, 시뮬레이션은 선택
export const trainingRecordings = () => allRecordings().filter(r => !isEvalRec(r) && ($('train-sim').checked || r.source !== 'sim'));
export const evalRecordings = () => state.cloudRecs.filter(r => r.evalSet);

export function persistRecordings() {
  const ok = saveLocalRecordings(state.recordings);
  observe(state.recordings.map(r => r.label));
  emit('recordings');
  return ok;
}

export function setCloudRecordings(list) {
  state.cloudRecs = list;
  observe(list.map(r => r.label));
  emit('recordings');
}

export function setActiveModel(m) {
  state.model = m;
  const ok = m ? saveActiveModel(m) : true;
  emit('model');
  return ok;
}

// ---------- 화면 도구 ----------
export function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

export function list(items) {
  const ul = el('ul');
  for (const it of items) ul.appendChild(el('li', it));
  return ul;
}

export function download(name, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

// <select>를 라벨 목록으로 채우되 선택값은 유지한다.
export function fillLabelSelect(select, { exclude = [] } = {}) {
  const prev = select.value;
  const ids = labelIds().filter(id => !exclude.includes(id));
  select.replaceChildren(...ids.map(id => { const o = el('option', labelName(id)); o.value = id; return o; }));
  if (ids.includes(prev)) select.value = prev;
}

export const dot = id => { const d = el('span', '', 'dot'); d.style.background = `var(${labelColorVar(id)})`; return d; };

export const pct = v => Math.round(v * 100) + '%';
export const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function setCustomColor(node, id) {
  node.style.setProperty('--vc', `var(${labelColorVar(id)})`);
}

// 비교 결과를 카드 목록으로 그린다 (좁은 화면에서 표보다 읽기 쉽고 가로 스크롤이 없다).
// items: [{ title, badge?, sub?, best?, bar?: { frac, text }, facts: [[이름, 값]…], note? }]
export function renderCards(container, items) {
  container.replaceChildren(...items.map(it => {
    const card = el('div', undefined, 'cmp-card' + (it.best ? ' best' : ''));
    const head = el('div', undefined, 'cmp-head');
    head.append(el('span', it.title, 'cmp-title'), el('span', it.badge ?? '', 'cmp-badge'));
    card.appendChild(head);
    if (it.sub) card.appendChild(el('div', it.sub, 'muted'));
    if (it.bar) {
      const bar = el('div', undefined, 'cmp-bar');
      const fill = el('i');
      fill.style.width = pct(Math.max(0, Math.min(1, it.bar.frac)));
      bar.append(fill, el('span', it.bar.text));
      card.appendChild(bar);
    }
    const facts = el('div', undefined, 'facts');
    for (const [k, v] of it.facts) {
      const f = el('div');
      f.append(el('span', k, 'k'), el('span', v, 'v'));
      facts.appendChild(f);
    }
    card.appendChild(facts);
    if (it.note) card.appendChild(el('div', it.note, 'muted'));
    return card;
  }));
}
