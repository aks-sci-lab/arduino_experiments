// 📱 판정 탭: 학습된 모델로 실시간 판정
import {
  HZ, WIN_N, WIN_SEC, FEATURE_KEYS, resample, extractFeatures, featureVector,
} from './analysis.js';
import { MODEL_TYPES, classify } from './ml.js';
import { drawSeries, drawTimeline, labelColor } from './charts.js';
import { labelName, labelColorVar } from './labels.js';
import { $, state, sampler, sampleHandlers, on, emit, el, download, stamp, pct, setCustomColor } from './state.js';
import { currentTab } from './tabs.js';

const JUDGE_EVERY_MS = 500;
const CHART_SEC = 10;
const MAX_BUF_MS = 10 * 60 * 1000;
const live = state.live;

function warn(msg) {
  $('sensor-warning').textContent = msg;
  $('sensor-warning').hidden = false;
}
const setStatus = msg => { $('status').textContent = msg; };

async function startJudge(source) {
  if (state.mode === 'record') return warn('데이터 기록 중에는 판정을 시작할 수 없습니다.');
  $('sensor-warning').hidden = true;
  live.buf = [];
  live.windows = [];
  live.latest = null;
  live.source = source;
  state.mode = 'judge';
  const ok = await sampler.start(source);
  if (!ok) { state.mode = null; return; }
  live.timer = setInterval(judgeStep, JUDGE_EVERY_MS);
  $('btn-start').disabled = true;
  $('btn-stop').disabled = false;
  setStatus(source === 'sensor' ? '측정 중… (센서)' : `측정 중… (시뮬레이션: ${labelName(source)})`);
}

function stopJudge() {
  if (state.mode !== 'judge') return;
  sampler.stop();
  clearInterval(live.timer);
  state.mode = null;
  $('btn-start').disabled = false;
  $('btn-stop').disabled = true;
  updateExportButtons();
  setStatus(`정지됨 — 샘플 ${live.buf.length}개, 구간 판정 ${live.windows.length}회`);
}

function resetJudge() {
  stopJudge();
  live.buf = [];
  live.windows = [];
  live.latest = null;
  renderVerdict(null);
  redrawLive();
  updateExportButtons();
  setStatus('초기화됨');
}

function recent(ms) {
  const b = live.buf;
  if (!b.length) return [];
  const tEnd = b[b.length - 1].t;
  let i = b.length - 1;
  while (i > 0 && b[i - 1].t >= tEnd - ms) i--;
  return b.slice(i);
}
export const recentPoints = recent;

function judgeStep() {
  const pts = recent(WIN_SEC * 1000);
  if (pts.length < 10 || pts[pts.length - 1].t - pts[0].t < WIN_SEC * 1000 * 0.95) {
    setStatus(`데이터 모으는 중… (${WIN_SEC}초 필요)`);
    return;
  }
  const tEnd = pts[pts.length - 1].t;
  const tStart = tEnd - (WIN_N - 1) * (1000 / HZ);
  const f = extractFeatures(resample(pts, HZ, tStart, WIN_N));
  const result = state.model ? classify(state.model, f) : f.std < 0.5 ? { label: 'idle', p: null, probs: null } : { label: 'none', p: null, probs: null };
  live.latest = { t: tEnd, tStart, f, ...result };
  live.windows.push({ t: tEnd, label: result.label, p: result.p, f });
  renderVerdict(live.latest);
  drawTimeline($('timeline'), live.windows, live.windows[0].t - JUDGE_EVERY_MS);
  updateExportButtons();
  emit('judged');
}

function renderVerdict(r) {
  const v = $('verdict');
  const ids = ['s-now', 's-std', 's-max', 's-min', 's-cad', 's-prob'];
  $('prob-bars').replaceChildren();
  v.style.removeProperty('--vc');
  if (!r) {
    v.dataset.state = 'idle';
    $('verdict-label').textContent = '—';
    $('verdict-reason').textContent = '측정을 시작하면 최근 4초 데이터를 학습된 모델로 판정합니다.';
    for (const id of ids) $(id).textContent = '—';
    return;
  }
  const f = r.f;
  const detail = `σ ${f.std.toFixed(1)} · 최소 |a| ${f.min.toFixed(1)} · ${Math.round(f.cadence)}걸음/분`;
  if (r.label === 'idle') {
    v.dataset.state = 'still';
    $('verdict-label').textContent = '움직임 없음';
    $('verdict-reason').textContent = `흔들림이 거의 없어 분류하지 않았습니다 (σ ${f.std.toFixed(2)} < 0.5)`;
  } else if (r.label === 'none') {
    v.dataset.state = 'idle';
    $('verdict-label').textContent = '모델 없음';
    $('verdict-reason').textContent = `🧪 데이터 탭에서 기록을 모으고 🧠 학습 탭에서 모델을 학습하세요 · ${detail}`;
  } else {
    v.dataset.state = 'label';
    setCustomColor(v, r.label);
    $('verdict-label').textContent = labelName(r.label);
    $('verdict-reason').textContent = `확신도 ${pct(r.p)} · ${detail}`;
    const bars = Object.entries(r.probs).sort((a, b) => b[1] - a[1]).map(([id, p]) => {
      const row = el('div', undefined, 'pbar');
      const track = el('div', undefined, 'track');
      const fill = el('div', undefined, 'fill');
      fill.style.width = pct(p);
      fill.style.background = `var(${labelColorVar(id)})`;
      track.appendChild(fill);
      row.append(el('span', labelName(id)), track, el('span', pct(p)));
      return row;
    });
    $('prob-bars').replaceChildren(...bars);
  }
  const last = live.buf[live.buf.length - 1];
  $('s-now').textContent = last ? last.m.toFixed(2) : '—';
  $('s-std').textContent = f.std.toFixed(2);
  $('s-max').textContent = f.max.toFixed(1);
  $('s-min').textContent = f.min.toFixed(1);
  $('s-cad').textContent = Math.round(f.cadence);
  $('s-prob').textContent = r.p === null ? '—' : pct(r.p);
}

export function redrawLive() {
  if (currentTab() !== 'measure') return;
  const b = live.buf;
  const tEnd = b.length ? b[b.length - 1].t : CHART_SEC * 1000;
  const t0 = tEnd - CHART_SEC * 1000;
  const pts = recent(CHART_SEC * 1000).map(p => ({ x: (p.t - t0) / 1000, y: p.m }));
  const peaks = [];
  if (live.latest) {
    for (const i of live.latest.f._peaks) {
      const t = live.latest.tStart + i * (1000 / HZ);
      if (t < t0) continue;
      const near = b.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best), b[b.length - 1]);
      peaks.push({ x: (t - t0) / 1000, y: near.m });
    }
  }
  drawSeries($('chart'), pts, 0, CHART_SEC, { peaks });
  drawTimeline($('timeline'), live.windows, live.windows.length ? live.windows[0].t - JUDGE_EVERY_MS : 0);
}

function renderModelLine() {
  const box = $('model-line');
  const m = state.model;
  if (!m) {
    box.className = 'model-line empty';
    box.textContent = '⚠ 학습된 모델이 없습니다. 🧪 데이터 탭에서 기록을 모으고 🧠 학습 탭에서 학습하세요.';
  } else {
    const t = m.metrics?.test;
    box.className = 'model-line';
    box.textContent = `🧠 사용 중인 모델: ${MODEL_TYPES[m.type]} · 라벨 ${m.labels.map(labelName).join('/')} · 기록 ${m.nRecordings ?? '?'}개 · `
      + (t ? `테스트 정확도 ${pct(t.accuracy)}` : '정확도 정보 없음');
  }
  const legend = $('timeline-legend');
  const items = [...(m ? m.labels : []), 'idle'].map(id => {
    const s = el('span');
    const sw = el('i', '', 'sw');
    sw.style.height = '10px';
    sw.style.background = labelColor(id);
    s.append(sw, id === 'idle' ? '움직임 없음/모델 없음' : labelName(id));
    return s;
  });
  legend.replaceChildren(...items);
}
export { renderModelLine };

function exportRaw() {
  const t0 = live.buf[0]?.t ?? 0;
  const rows = ['time_s,ax,ay,az,a_mag'];
  for (const s of live.buf) rows.push([((s.t - t0) / 1000).toFixed(3), s.ax.toFixed(3), s.ay.toFixed(3), s.az.toFixed(3), s.m.toFixed(3)].join(','));
  download(`accel-raw-${stamp()}.csv`, rows.join('\n'));
}

function exportWindows() {
  const t0 = live.buf[0]?.t ?? 0;
  const rows = [['time_s', 'prediction', 'confidence', ...FEATURE_KEYS].join(',')];
  for (const w of live.windows) {
    rows.push([((w.t - t0) / 1000).toFixed(2), w.label, w.p === null ? '' : w.p.toFixed(3), ...featureVector(w.f).map(v => v.toFixed(4))].join(','));
  }
  download(`accel-windows-${stamp()}.csv`, rows.join('\n'));
}

function updateExportButtons() {
  $('btn-csv').disabled = live.buf.length === 0;
  $('btn-csv-win').disabled = live.windows.length === 0;
}

export function initJudge() {
  sampleHandlers.judge = s => {
    live.buf.push(s);
    const cut = s.t - MAX_BUF_MS;
    if (live.buf[0].t < cut) live.buf = live.buf.filter(p => p.t >= cut);
  };
  on('sampler-error', msg => { if (state.mode !== 'record') warn(msg); });
  on('model', renderModelLine);
  on('labels', renderModelLine);
  on('tab', redrawLive);
  $('btn-start').addEventListener('click', () => startJudge('sensor'));
  $('btn-stop').addEventListener('click', stopJudge);
  $('btn-reset').addEventListener('click', resetJudge);
  $('btn-sim-walk').addEventListener('click', () => startJudge('walk'));
  $('btn-sim-run').addEventListener('click', () => startJudge('run'));
  $('btn-csv').addEventListener('click', exportRaw);
  $('btn-csv-win').addEventListener('click', exportWindows);
  renderModelLine();
  renderVerdict(null);

  let lastDraw = 0;
  const loop = ts => {
    if (state.mode === 'judge' && ts - lastDraw > 80) {
      lastDraw = ts;
      redrawLive();
      const last = live.buf[live.buf.length - 1];
      if (last && live.latest) $('s-now').textContent = last.m.toFixed(2);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
