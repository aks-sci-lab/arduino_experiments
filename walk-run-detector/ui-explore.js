// 🔍 탐색 탭: 어떤 특징이 두 동작을 잘 가르는가?
import { FEATURES, FEATURE_KEYS, featureVector } from './analysis.js';
import { toRows } from './dataset.js';
import { rankFeatures, histogram } from './explore.js';
import { drawHistogram, drawScatter } from './charts.js';
import { labelIds, labelName } from './labels.js';
import { $, state, on, el, fillLabelSelect, dot, trainingRecordings, pct } from './state.js';
import { currentTab, currentSub } from './tabs.js';

let rows = [];
let ranking = [];
let lastPair = ['', ''];
let selected = null;   // 분포에 보여 줄 특징 번호 (학생이 고르기 전에는 1위 특징)

const bar = (frac, text) => {
  const td = el('td', undefined, 'cellbar');
  const i = el('i');
  i.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  td.append(i, el('span', text));
  return td;
};

function rebuildRows() {
  rows = toRows(trainingRecordings());
}
export const exploreRows = () => rows;
export const topFeatures = n => ranking.slice(0, n).map(f => f.index);

function refresh() {
  if (currentTab() !== 'explore') return;
  rebuildRows();
  const a = $('ex-a').value;
  const b = $('ex-b').value;
  if (a !== lastPair[0] || b !== lastPair[1]) { selected = null; lastPair = [a, b]; }
  const countOf = l => new Set(rows.filter(r => r.y === l).map(r => r.group)).size;
  if (!a || !b || a === b) {
    ranking = [];
    $('ex-status').textContent = '서로 다른 라벨 두 개를 고르세요.';
  } else {
    ranking = rankFeatures(rows, a, b);
    $('ex-status').textContent = ranking.length
      ? `${labelName(a)} 기록 ${countOf(a)}개 vs ${labelName(b)} 기록 ${countOf(b)}개로 비교합니다.`
      : `${labelName(a)} 또는 ${labelName(b)} 기록이 없습니다. 🧪 데이터 탭에서 기록하세요. (시뮬레이션 데이터는 🧠 학습 탭에서 포함을 켜야 보입니다)`;
  }
  renderTable();
  renderHist();
  renderScatter();
}

function renderTable() {
  const a = $('ex-a').value;
  const b = $('ex-b').value;
  const head = el('tr');
  for (const [h, left] of [['특징', true], ['정확도', false], [`${labelName(a)} 평균`, false], [`${labelName(b)} 평균`, false], ['효과 크기 d', false]]) {
    const th = el('th', h);
    if (left) th.className = 'left';
    head.appendChild(th);
  }
  const thead = el('thead');
  thead.appendChild(head);
  const tbody = el('tbody');
  for (const f of ranking) {
    const tr = el('tr');
    tr.dataset.clickable = '1';
    if (f.index === (selected ?? ranking[0]?.index)) tr.className = 'sel';
    const name = el('td', f.name, 'left');
    name.title = f.hint;
    tr.append(name, bar((f.accuracy - 0.5) * 2, pct(f.accuracy)), el('td', f.meanA.toFixed(2)), el('td', f.meanB.toFixed(2)), el('td', f.d.toFixed(1)));
    tr.addEventListener('click', () => { selected = f.index; renderTable(); renderHist(); });
    tbody.appendChild(tr);
  }
  $('ex-table').replaceChildren(thead, tbody);
}

function renderHist() {
  if (currentTab() !== 'explore' || currentSub('explore') !== 'rank') return;
  const a = $('ex-a').value;
  const b = $('ex-b').value;
  const f = ranking.find(x => x.index === selected) || ranking[0];
  if (!f) { drawHistogram($('ex-hist'), null, []); $('ex-think').hidden = true; return; }
  $('ex-hist-title').textContent = `분포: ${f.name} (${f.unit})`;
  drawHistogram($('ex-hist'), histogram(rows, f.index, [a, b]), [a, b], f.threshold);
  const legend = [a, b].map(l => { const s = el('span'); s.append(dot(l), labelName(l)); return s; });
  legend.push(el('span', '┆ 점선 = 가장 잘 가르는 기준선'));
  $('ex-hist-legend').replaceChildren(...legend);
  const higher = f.aHigher ? labelName(a) : labelName(b);
  const lower = f.aHigher ? labelName(b) : labelName(a);
  const strong = f.accuracy >= 0.9;
  $('ex-think').hidden = false;
  $('ex-think').textContent = `💭 "${f.name}"이(가) ${f.threshold.toFixed(2)}${f.unit} 보다 크면 ${higher}, 작으면 ${lower}라고 하면 ${pct(f.accuracy)}를 맞힙니다. `
    + (strong ? '이 특징 하나만으로도 꽤 잘 구별합니다. 물리적으로 왜 그럴까요?'
      : f.accuracy < 0.65 ? '두 분포가 많이 겹칩니다. 이 특징만으로는 구별이 어렵습니다. 왜 겹칠까요?'
        : '어느 정도 구별하지만 겹치는 부분이 있습니다. 다른 특징과 함께 쓰면 어떨까요?');
}

function renderScatter() {
  if (currentTab() !== 'explore' || currentSub('explore') !== 'scatter') return;
  const ix = Number($('sc-x').value);
  const iy = Number($('sc-y').value);
  const a = $('ex-a').value;
  const b = $('ex-b').value;
  const pts = rows.filter(r => r.y === a || r.y === b).map(r => ({ x: r.x[ix], y: r.x[iy], label: r.y }));
  const L = state.live.latest;
  const marker = L ? { x: featureVector(L.f)[ix], y: featureVector(L.f)[iy] } : null;
  drawScatter($('scatter'), pts, FEATURES[ix].name, FEATURES[iy].name, marker);
  const legend = [a, b].filter(Boolean).map(l => { const s = el('span'); s.append(dot(l), labelName(l)); return s; });
  $('scatter-legend').replaceChildren(...legend);
}

export function initExplore() {
  for (const [id, def] of [['sc-x', FEATURE_KEYS.indexOf('std')], ['sc-y', FEATURE_KEYS.indexOf('min')]]) {
    $(id).replaceChildren(...FEATURES.map((f, i) => { const o = el('option', f.name); o.value = String(i); return o; }));
    $(id).value = String(def);
    $(id).addEventListener('change', renderScatter);
  }
  const fillAB = () => {
    fillLabelSelect($('ex-a'));
    fillLabelSelect($('ex-b'));
    const ids = labelIds();
    if (!$('ex-a').value) $('ex-a').value = ids[0];
    if (!$('ex-b').value || $('ex-b').value === $('ex-a').value) $('ex-b').value = ids.find(x => x !== $('ex-a').value) ?? ids[0];
  };
  fillAB();
  $('ex-a').value = 'walk';
  $('ex-b').value = 'run';
  on('labels', () => { fillAB(); refresh(); });
  on('recordings', refresh);
  on('tab', refresh);
  on('subtab', ({ group }) => { if (group === 'explore') { renderHist(); renderScatter(); } });
  on('judged', renderScatter);
  $('ex-a').addEventListener('change', refresh);
  $('ex-b').addEventListener('change', refresh);
  $('train-sim').addEventListener('change', refresh);
  window.addEventListener('resize', () => { renderHist(); renderScatter(); });
}
