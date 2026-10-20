import {
  HZ, WIN_N, WIN_SEC, LABELS, FEATURES, FEATURE_KEYS,
  resample, extractFeatures, featureVector, windowsOf, makeSimSeries,
} from './analysis.js';
import { MODEL_TYPES, classify, trainAndEvaluate, featureWeights } from './ml.js';
import {
  loadLocalRecordings, saveLocalRecordings, makeRecording, loadActiveModel, saveActiveModel, toRows, summarize,
} from './dataset.js';
import { createSampler } from './sampler.js';
import { drawSeries, drawTimeline, drawScatter } from './charts.js';
import { analyzeWithGemini, askGemini, interpretTraining, listModels, testConnection, explainError } from './ai.js';
import {
  initAccounts, signIn, signOut, loadAIConfig, saveAIConfig, deleteAIConfig,
  uploadRecording, loadCloudRecordings, deleteCloudRecording, currentUid, publishModel, loadClassModel,
} from './accounts.js';

const $ = id => document.getElementById(id);
const JUDGE_EVERY_MS = 500;
const CHART_SEC = 10;
const MAX_BUF_MS = 10 * 60 * 1000;
const COUNTDOWN_MS = 3000;
const MIN_RECORD_STD = 0.5;       // 이보다 흔들림이 작은 기록은 저장하지 않는다
const MIN_SENSOR_HZ = 20;

// ---------- 상태 ----------
let mode = null;                   // null | 'judge' | 'record'
let model = loadActiveModel();     // 현재 판정에 쓰는 모델
let recordings = loadLocalRecordings();
let cloudRecs = [];                // 불러온 학급 데이터 (메모리에만 둠)
let lastTraining = null;           // { rows, res }

const live = { buf: [], windows: [], latest: null, source: null, timer: null };
const rec = { phase: 'idle', pts: [], seconds: 20, label: 'walk', source: 'sensor', result: null };
const account = { user: null, isAdmin: false, aiState: 'loading', aiConfig: null, unavailable: false };

const sampler = createSampler({ onSample, onError: msg => warn(msg) });

// where: 'rec'(데이터 탭) | 'sensor'(판정 탭). 생략하면 지금 하는 일에 맞춰 고른다.
function warn(msg, where) {
  const toRec = where ? where === 'rec' : mode === 'record';
  const box = toRec ? $('rec-warning') : $('sensor-warning');
  box.textContent = msg;
  box.hidden = false;
}
function clearWarnings() {
  $('sensor-warning').hidden = true;
  $('rec-warning').hidden = true;
}

function onSample(s) {
  if (mode === 'judge') {
    live.buf.push(s);
    const cut = s.t - MAX_BUF_MS;
    if (live.buf[0].t < cut) live.buf = live.buf.filter(p => p.t >= cut);
  } else if (mode === 'record') {
    onRecordSample(s);
  }
}

// ================= 판정 (측정 탭) =================
async function startJudge(source) {
  if (mode === 'record') return warn('데이터 기록 중에는 판정을 시작할 수 없습니다.', 'sensor');
  clearWarnings();
  live.buf = [];
  live.windows = [];
  live.latest = null;
  live.source = source;
  mode = 'judge';
  const ok = await sampler.start(source);
  if (!ok) { mode = null; return; }
  live.timer = setInterval(judgeStep, JUDGE_EVERY_MS);
  $('btn-start').disabled = true;
  $('btn-stop').disabled = false;
  setStatus(source === 'sensor' ? '측정 중… (센서)' : `측정 중… (시뮬레이션: ${LABELS[source]})`);
}

function stopJudge() {
  if (mode !== 'judge') return;
  sampler.stop();
  clearInterval(live.timer);
  mode = null;
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

function judgeStep() {
  const pts = recent(WIN_SEC * 1000);
  if (pts.length < 10 || pts[pts.length - 1].t - pts[0].t < WIN_SEC * 1000 * 0.95) {
    setStatus(`데이터 모으는 중… (${WIN_SEC}초 필요)`);
    return;
  }
  const tEnd = pts[pts.length - 1].t;
  const tStart = tEnd - (WIN_N - 1) * (1000 / HZ);
  const x = resample(pts, HZ, tStart, WIN_N);
  const f = extractFeatures(x);
  const result = model ? classify(model, f) : f.std < 0.5 ? { label: 'idle', p: null } : { label: 'none', p: null };
  live.latest = { t: tEnd, tStart, f, ...result };
  live.windows.push({ t: tEnd, label: result.label, p: result.p, f });
  renderVerdict(live.latest);
  drawTimeline($('timeline'), live.windows, live.windows[0].t - JUDGE_EVERY_MS);
  updateExportButtons();
  if (!$('panel-train').hidden) refreshScatter();
}

const VERDICT_TEXT = {
  walk: ['걷기', 'walk'], run: ['뛰기', 'run'], idle: ['움직임 없음', 'still'], none: ['모델 없음', 'idle'],
};

function renderVerdict(r) {
  const v = $('verdict');
  const ids = ['s-now', 's-std', 's-max', 's-min', 's-cad', 's-prob'];
  if (!r) {
    v.dataset.state = 'idle';
    $('verdict-label').textContent = '—';
    $('verdict-reason').textContent = '측정을 시작하면 최근 4초 데이터를 학습된 모델로 판정합니다.';
    for (const id of ids) $(id).textContent = '—';
    return;
  }
  const [text, state] = VERDICT_TEXT[r.label];
  v.dataset.state = state;
  $('verdict-label').textContent = text;
  const f = r.f;
  const detail = `σ ${f.std.toFixed(1)} · 최소 |a| ${f.min.toFixed(1)} · ${Math.round(f.cadence)}걸음/분`;
  if (r.label === 'idle') $('verdict-reason').textContent = `흔들림이 거의 없어 분류하지 않았습니다 (σ ${f.std.toFixed(2)} < 0.5)`;
  else if (r.label === 'none') $('verdict-reason').textContent = `🧪 데이터 탭에서 기록을 모으고 🧠 학습 탭에서 모델을 학습하세요 · ${detail}`;
  else $('verdict-reason').textContent = `뛰기일 확률 ${Math.round(r.p * 100)}% · ${detail}`;
  const last = live.buf[live.buf.length - 1];
  $('s-now').textContent = last ? last.m.toFixed(2) : '—';
  $('s-std').textContent = f.std.toFixed(2);
  $('s-max').textContent = f.max.toFixed(1);
  $('s-min').textContent = f.min.toFixed(1);
  $('s-cad').textContent = Math.round(f.cadence);
  $('s-prob').textContent = r.p === null ? '—' : Math.round(r.p * 100) + '%';
}

function redrawLive() {
  if ($('panel-measure').hidden) return;
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
  const el = $('model-line');
  if (!model) {
    el.className = 'model-line empty';
    el.textContent = '⚠ 학습된 모델이 없습니다. 🧪 데이터 탭에서 걷기·뛰기 기록을 모으고 🧠 학습 탭에서 학습하세요.';
    return;
  }
  const t = model.metrics?.test;
  el.className = 'model-line';
  el.textContent = `🧠 사용 중인 모델: ${MODEL_TYPES[model.type]} · 기록 ${model.nRecordings ?? '?'}개 · `
    + (t ? `테스트 정확도 ${Math.round(t.accuracy * 100)}%` : '정확도 정보 없음');
}

function setStatus(msg) { $('status').textContent = msg; }

// ================= 데이터 기록 (데이터 탭) =================
const radio = name => document.querySelector(`input[name="${name}"]:checked`).value;

async function startRecord() {
  if (mode) return warn('이미 측정 중입니다. 먼저 📱 판정 탭에서 정지하세요.', 'rec');
  clearWarnings();
  rec.label = radio('rec-label');
  rec.source = radio('rec-source');
  rec.seconds = Number($('rec-seconds').value);
  rec.pts = [];
  rec.result = null;
  $('rec-result').hidden = true;
  mode = 'record';
  rec.phase = 'countdown';
  const ok = await sampler.start(rec.source === 'sensor' ? 'sensor' : rec.label);
  if (!ok) { mode = null; rec.phase = 'idle'; return; }
  $('btn-rec-start').disabled = true;
  $('btn-rec-cancel').disabled = false;
  $('rec-progress').hidden = false;
  $('rec-bar').style.width = '0%';
  $('rec-status').textContent = `3초 뒤 시작합니다. 휴대폰을 잡고 ${LABELS[rec.label]} 준비!`;
}

function onRecordSample(s) {
  if (s.t < COUNTDOWN_MS) {
    $('rec-status').textContent = `${Math.ceil((COUNTDOWN_MS - s.t) / 1000)}… ${LABELS[rec.label]} 준비!`;
    return;
  }
  rec.phase = 'recording';
  rec.pts.push(s);
  const elapsed = s.t - COUNTDOWN_MS;
  const total = rec.seconds * 1000;
  $('rec-bar').style.width = Math.min(100, (elapsed / total) * 100).toFixed(0) + '%';
  $('rec-status').textContent = `🔴 ${LABELS[rec.label]} 기록 중… ${Math.max(0, Math.ceil((total - elapsed) / 1000))}초 남음`;
  if (rec.pts.length % 4 === 0) drawRecChart();
  if (elapsed >= total) finishRecord();
}

function resetRecordUI() {
  $('btn-rec-start').disabled = false;
  $('btn-rec-cancel').disabled = true;
  $('rec-progress').hidden = true;
}

function cancelRecord() {
  if (mode !== 'record') return;
  sampler.stop();
  mode = null;
  rec.phase = 'idle';
  resetRecordUI();
  $('rec-status').textContent = '취소했습니다.';
}

function finishRecord() {
  sampler.stop();
  mode = null;
  rec.phase = 'idle';
  resetRecordUI();
  const n = rec.seconds * HZ;
  const rate = rec.pts.length / rec.seconds;
  if (rate < MIN_SENSOR_HZ) {
    $('rec-status').textContent = '';
    return warn(`센서 표본이 너무 적습니다 (${rate.toFixed(0)}Hz). 화면을 켠 채로 다시 기록하세요.`, 'rec');
  }
  const x = resample(rec.pts, HZ, COUNTDOWN_MS, n);
  const f = extractFeatures(x);
  rec.result = { x, f };
  drawRecChart();
  const nWin = windowsOf(x).length;
  const tooStill = f.std < MIN_RECORD_STD;
  $('rec-status').textContent = '기록이 끝났습니다.';
  $('rec-result-text').textContent = tooStill
    ? `움직임이 거의 없습니다 (σ ${f.std.toFixed(2)}). 휴대폰을 들고 ${LABELS[rec.label]} 동작을 하면서 다시 기록하세요.`
    : `${LABELS[rec.label]} 기록 · ${rec.seconds}초 · 학습 구간 ${nWin}개 · σ ${f.std.toFixed(2)} · 최소 |a| ${f.min.toFixed(1)} · 케이던스 ${Math.round(f.cadence)}걸음/분`
      + ' — 동작과 라벨이 맞는지 그래프를 확인하고 저장하세요.';
  $('btn-rec-save').disabled = tooStill;
  const canUpload = !!account.user && rec.source === 'sensor';
  $('rec-upload').disabled = !canUpload;
  $('rec-upload').checked = canUpload && $('rec-upload').checked;
  $('rec-result').hidden = false;
}

function drawRecChart() {
  const canvas = $('rec-chart');
  if (rec.result) {
    const pts = rec.result.x.map((y, i) => ({ x: i / HZ, y }));
    drawSeries(canvas, pts, 0, rec.seconds, { peaks: rec.result.f._peaks.map(i => ({ x: i / HZ, y: rec.result.x[i] })) });
  } else {
    const pts = rec.pts.map(p => ({ x: (p.t - COUNTDOWN_MS) / 1000, y: p.m }));
    drawSeries(canvas, pts, 0, rec.seconds);
  }
}

async function saveRecord() {
  if (!rec.result) return;
  const r = makeRecording({ label: rec.label, source: rec.source, m: rec.result.x });
  const wantUpload = $('rec-upload').checked && !$('rec-upload').disabled;
  let note = '';
  if (wantUpload) {
    try {
      r.cloudId = await uploadRecording(r);
      r.userId = currentUid();
      note = ' (학급 데이터에도 올렸습니다)';
    } catch (e) {
      note = ` (클라우드 업로드 실패: ${e.code === 'permission-denied' ? 'Firestore 규칙이 배포되지 않았거나 권한이 없습니다' : e.message})`;
    }
  }
  recordings.push(r);
  if (!saveLocalRecordings(recordings)) {
    note += ' ⚠ 이 기기 저장 공간이 부족합니다. 오래된 기록을 삭제하세요.';
  }
  rec.result = null;
  $('rec-result').hidden = true;
  $('rec-status').textContent = `저장했습니다.${note} 다른 기록도 계속 모아 보세요.`;
  drawRecChart();
  renderData();
}

function discardRecord() {
  rec.result = null;
  $('rec-result').hidden = true;
  $('rec-status').textContent = '기록을 버렸습니다.';
  drawRecChart();
}

// ---------- 데이터셋 목록 ----------
const allRecordings = () => [
  ...recordings,
  ...cloudRecs.filter(c => !recordings.some(r => r.cloudId && r.cloudId === c.cloudId)),
];

const SOURCE_TEXT = { sensor: '📱 센서', sim: '🖥 시뮬', cloud: '☁ 학급' };

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function renderData() {
  const all = allRecordings();
  const s = summarize(all);
  $('data-summary').textContent = all.length
    ? `기록 ${s.total}개 (걷기 ${s.byLabel.walk} · 뛰기 ${s.byLabel.run}) · 학습 구간 ${s.windows}개 · 이 기기 ${recordings.length}개 · 불러온 학급 데이터 ${cloudRecs.length}개`
    : '아직 기록이 없습니다. 위에서 걷기와 뛰기를 각각 여러 번 기록하세요.';
  $('btn-cloud-load').disabled = !account.user;
  $('btn-data-csv').disabled = !all.length;

  const table = $('data-table');
  const head = el('tr');
  for (const h of ['라벨', '출처', '길이', '구간', '']) head.appendChild(el('th', h));
  const thead = el('thead');
  thead.appendChild(head);
  const tbody = el('tbody');
  const uid = currentUid();
  for (const r of [...all].reverse()) {
    const tr = el('tr');
    tr.append(
      el('td', LABELS[r.label]),
      el('td', SOURCE_TEXT[r.source] + (r.cloudId && r.source !== 'cloud' ? ' ☁' : '')),
      el('td', `${(r.m.length / (r.hz || HZ)).toFixed(0)}초`),
      el('td', String(windowsOf(r.m).length)),
    );
    const td = el('td');
    const local = recordings.includes(r);
    if (local || (r.source === 'cloud' && (r.userId === uid || account.isAdmin))) {
      const b = el('button', '삭제');
      b.addEventListener('click', () => deleteRecord(r));
      td.appendChild(b);
    }
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  table.replaceChildren(thead, tbody);
  renderTrainSummary();
}

async function deleteRecord(r) {
  try {
    if (r.cloudId && (r.userId === currentUid() || account.isAdmin) && confirm('클라우드에서도 삭제할까요? (다른 학생의 학습에도 영향이 있습니다)')) {
      await deleteCloudRecording(r.cloudId);
    }
  } catch (e) {
    return setDataStatus('클라우드 삭제 실패: ' + (e.code === 'permission-denied' ? '권한이 없습니다.' : e.message));
  }
  recordings = recordings.filter(x => x.id !== r.id);
  cloudRecs = cloudRecs.filter(x => x.id !== r.id && x.cloudId !== r.cloudId);
  saveLocalRecordings(recordings);
  renderData();
}

function setDataStatus(msg) { $('data-status').textContent = msg; }

async function loadCloud() {
  setDataStatus('학급 데이터를 불러오는 중…');
  try {
    cloudRecs = await loadCloudRecordings();
    setDataStatus(`학급 데이터 ${cloudRecs.length}개를 불러왔습니다. (이 기기에는 저장되지 않고, 학습에만 사용됩니다)`);
    renderData();
  } catch (e) {
    setDataStatus('불러오기 실패: ' + (e.code === 'permission-denied' ? '권한이 없습니다. Firestore 규칙을 배포했는지 확인하세요.' : e.message));
  }
}

function generateSim() {
  for (const label of ['walk', 'run']) {
    for (let i = 0; i < 6; i++) recordings.push(makeRecording({ label, source: 'sim', m: makeSimSeries(label, 20) }));
  }
  if (!saveLocalRecordings(recordings)) setDataStatus('⚠ 저장 공간이 부족합니다.');
  else setDataStatus('시뮬레이션 기록 12개를 만들었습니다. 학습 탭에서 "시뮬레이션 데이터도 포함"을 체크하세요.');
  renderData();
}

function clearLocal() {
  if (!recordings.length || !confirm(`이 기기의 기록 ${recordings.length}개를 모두 삭제할까요?`)) return;
  recordings = [];
  saveLocalRecordings(recordings);
  renderData();
}

function download(name, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

function exportDataset() {
  const rows = [['recording', 'label', 'source', 'start_s', ...FEATURE_KEYS].join(',')];
  for (const r of allRecordings()) {
    for (const w of windowsOf(r.m)) {
      rows.push([r.id, r.label, r.source, (w.start / HZ).toFixed(1), ...featureVector(w.features).map(v => v.toFixed(4))].join(','));
    }
  }
  download(`walk-run-features-${stamp()}.csv`, rows.join('\n'));
}

// ================= 학습 (학습 탭) =================
function trainingRecordings() {
  const includeSim = $('train-sim').checked;
  return allRecordings().filter(r => includeSim || r.source !== 'sim');
}

function renderTrainSummary() {
  const recs = trainingRecordings();
  const s = summarize(recs);
  $('train-summary').textContent = `학습에 쓸 기록: ${s.total}개 (걷기 ${s.byLabel.walk} · 뛰기 ${s.byLabel.run}), 구간 ${s.windows}개`
    + (allRecordings().length !== recs.length ? ` · 시뮬레이션 ${allRecordings().length - recs.length}개 제외됨` : '');
}

function setTrainStatus(msg) { $('train-status').textContent = msg; }

function setActiveModel(m) {
  model = m;
  if (!saveActiveModel(m)) setTrainStatus('⚠ 모델을 이 기기에 저장하지 못했습니다. 새로고침하면 사라집니다.');
  renderModelLine();
}

async function train() {
  const recs = trainingRecordings();
  if (!recs.length) return setTrainStatus('학습할 기록이 없습니다. 🧪 데이터 탭에서 먼저 기록하세요.');
  const btn = $('btn-train');
  btn.disabled = true;
  setTrainStatus('학습 중…');
  await new Promise(r => setTimeout(r, 30)); // 안내 문구가 먼저 그려지게 한다
  try {
    const rows = toRows(recs);
    const res = trainAndEvaluate({
      type: $('train-type').value,
      rows,
      testFrac: Number($('train-test').value),
      refitAll: $('train-refit').checked,
    });
    if (res.error) {
      $('train-result').hidden = true;
      return setTrainStatus(res.error);
    }
    lastTraining = { rows, res };
    setActiveModel(res.model);
    setTrainStatus(`학습 완료 — ${MODEL_TYPES[res.model.type]}. 이제 📱 판정 탭에서 이 모델로 판정합니다.`);
    renderTrainResult();
  } finally {
    btn.disabled = false;
  }
}

function renderTrainResult() {
  if (!lastTraining) return;
  const { res } = lastTraining;
  $('train-result').hidden = false;
  const pct = v => Math.round(v * 100) + '%';
  const tiles = [
    ['학습 정확도', pct(res.train.accuracy), `${res.train.n}구간`],
    ['테스트 정확도', pct(res.test.accuracy), `${res.test.n}구간`],
    ['뛰기 정밀도', pct(res.test.precisionRun), '뛰기라 한 것 중'],
    ['뛰기 재현율', pct(res.test.recallRun), '실제 뛰기 중'],
  ];
  $('train-metrics').replaceChildren(...tiles.map(([k, v, u]) => {
    const d = el('div', undefined, 'stat');
    d.append(el('span', k, 'k'), el('span', v, 'v'), el('span', u, 'u'));
    return d;
  }));

  const t = res.test;
  const conf = $('confusion');
  const rowOf = (name, a, b) => { const tr = el('tr'); tr.append(el('th', name), el('td', String(a)), el('td', String(b))); return tr; };
  const head = el('tr');
  head.append(el('th', '실제 \\ 예측'), el('th', '걷기'), el('th', '뛰기'));
  conf.replaceChildren(head, rowOf('걷기', t.tn, t.fp), rowOf('뛰기', t.fn, t.tp));

  const weights = featureWeights(res.model);
  $('weights-box').hidden = !weights;
  if (weights) {
    const maxAbs = Math.max(...weights.map(w => Math.abs(w.w)), 1e-6);
    const sorted = [...weights].sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
    $('weights').replaceChildren(...sorted.map(({ key, w }) => {
      const f = FEATURES.find(x => x.key === key);
      const row = el('div', undefined, 'wbar');
      const track = el('div', undefined, 'track');
      const fill = el('div', undefined, 'fill ' + (w >= 0 ? 'pos' : 'neg'));
      fill.style.width = (Math.abs(w) / maxAbs) * 50 + '%';
      track.appendChild(fill);
      const name = el('span', `${f.name} ${w >= 0 ? '+' : ''}${w.toFixed(2)}`);
      name.title = f.hint;
      row.append(name, track);
      return row;
    }));
  }
  refreshScatter();
}

function refreshScatter() {
  if (!lastTraining || $('panel-train').hidden) return;
  const ix = Number($('sc-x').value);
  const iy = Number($('sc-y').value);
  const test = new Set(lastTraining.res.split.test);
  const points = lastTraining.rows.map(r => ({ x: r.x[ix], y: r.x[iy], label: r.y ? 'run' : 'walk', test: test.has(r) }));
  let marker = null;
  if (live.latest) {
    const v = featureVector(live.latest.f);
    marker = { x: v[ix], y: v[iy] };
  }
  drawScatter($('scatter'), points, FEATURES[ix].name, FEATURES[iy].name, marker);
}

function initScatterSelects() {
  for (const [id, def] of [['sc-x', FEATURE_KEYS.indexOf('std')], ['sc-y', FEATURE_KEYS.indexOf('min')]]) {
    $(id).replaceChildren(...FEATURES.map((f, i) => { const o = el('option', f.name); o.value = String(i); return o; }));
    $(id).value = String(def);
    $(id).addEventListener('change', refreshScatter);
  }
}

async function publish() {
  if (!model) return setTrainStatus('먼저 모델을 학습하세요.');
  if (!confirm('이 모델을 학급 전체의 공용 모델로 게시할까요? 기존 공용 모델은 대체됩니다.')) return;
  try {
    await publishModel(model, account.user.email);
    setTrainStatus('✔ 반 모델로 게시했습니다. 학생들은 "반 모델 불러오기"로 사용할 수 있습니다.');
  } catch (e) {
    setTrainStatus('게시 실패: ' + (e.code === 'permission-denied' ? '권한이 없습니다. Firestore 규칙을 배포했는지 확인하세요.' : e.message));
  }
}

async function loadClass(silent = false) {
  if (!account.user) return setTrainStatus('반 모델은 로그인한 뒤에 불러올 수 있습니다.');
  try {
    const m = await loadClassModel();
    if (!m) return silent || setTrainStatus('게시된 반 모델이 아직 없습니다.');
    setActiveModel(m);
    if (!silent) setTrainStatus('✔ 반 모델을 불러와 사용합니다.');
  } catch (e) {
    if (!silent) setTrainStatus('불러오기 실패: ' + (e.code === 'permission-denied' ? '권한이 없습니다.' : e.message));
  }
}

// ================= 판정 CSV =================
function exportRaw() {
  const t0 = live.buf[0]?.t ?? 0;
  const rows = ['time_s,ax,ay,az,a_mag'];
  for (const s of live.buf) rows.push([((s.t - t0) / 1000).toFixed(3), s.ax.toFixed(3), s.ay.toFixed(3), s.az.toFixed(3), s.m.toFixed(3)].join(','));
  download(`accel-raw-${stamp()}.csv`, rows.join('\n'));
}

function exportWindows() {
  const t0 = live.buf[0]?.t ?? 0;
  const rows = [['time_s', 'prediction', 'run_probability', ...FEATURE_KEYS].join(',')];
  for (const w of live.windows) {
    rows.push([((w.t - t0) / 1000).toFixed(2), w.label, w.p === null ? '' : w.p.toFixed(3), ...featureVector(w.f).map(v => v.toFixed(4))].join(','));
  }
  download(`accel-windows-${stamp()}.csv`, rows.join('\n'));
}

function updateExportButtons() {
  $('btn-csv').disabled = live.buf.length === 0;
  $('btn-csv-win').disabled = live.windows.length === 0;
}

// ================= AI =================
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const featureObj = f => Object.fromEntries(FEATURE_KEYS.map(k => [k, round(f[k])]));

function modelInfo() {
  if (!model) return null;
  const w = featureWeights(model);
  return {
    type: MODEL_TYPES[model.type],
    recordings: model.nRecordings,
    windows: model.nWindows,
    train_accuracy: model.metrics ? round(model.metrics.train.accuracy) : null,
    test_accuracy: model.metrics ? round(model.metrics.test.accuracy) : null,
    test_confusion: model.metrics ? { tn: model.metrics.test.tn, fp: model.metrics.test.fp, fn: model.metrics.test.fn, tp: model.metrics.test.tp } : null,
    standardized_weights_run_positive: w ? Object.fromEntries(w.map(x => [FEATURES.find(f => f.key === x.key).name, round(x.w)])) : null,
  };
}

function buildSummary() {
  const L = live.latest;
  if (!L) return null;
  const b = live.buf;
  const recentPts = recent(8000);
  const waveform = [];
  let next = recentPts.length ? recentPts[0].t : 0;
  for (const p of recentPts) {
    if (p.t >= next) { waveform.push(round(p.m, 1)); next += 100; }
  }
  const counts = { walk: 0, run: 0, idle: 0, none: 0 };
  for (const w of live.windows) counts[w.label]++;
  return {
    sensor: 'accelerationIncludingGravity의 크기 |a| (m/s²), g = 9.81',
    data_source: live.source === 'sensor' ? '스마트폰 센서' : `시뮬레이션(${LABELS[live.source]})`,
    student_memo: $('ai-memo').value.trim() || null,
    duration_sec: round((b[b.length - 1].t - b[0].t) / 1000, 1),
    latest_4s_window: {
      model_prediction: L.label === 'run' ? '뛰기' : L.label === 'walk' ? '걷기' : L.label === 'idle' ? '움직임 없음' : '모델 없음',
      run_probability: L.p === null ? null : round(L.p),
      features: featureObj(L.f),
    },
    whole_session_prediction_counts: counts,
    model: modelInfo(),
    recent_8s_waveform_10hz: waveform,
  };
}

function buildTrainingSummary() {
  if (!model) return null;
  const s = summarize(allRecordings());
  return { model: modelInfo(), dataset: { recordings: s.total, by_label: s.byLabel, by_source: s.bySource, windows: s.windows } };
}

function aiSettings() {
  const cfg = account.aiConfig;
  if (!cfg) throw new Error('AI 설정을 불러오지 못했습니다. 로그인 상태와 관리자 설정을 확인하세요.');
  return { apiKey: cfg.apiKey, model: cfg.model };
}

function list(items) {
  const ul = el('ul');
  for (const it of items) ul.appendChild(el('li', it));
  return ul;
}

function renderAnalysis(box, r) {
  box.replaceChildren(
    el('div', `AI 판정: ${r.verdict} (확신도 ${r.confidence}%)`, 'big'),
    el('div', r.consistent_with_model ? '✔ 학습된 모델의 예측과 일치' : '✖ 학습된 모델의 예측과 다름 — 데이터·모델을 점검해 보세요'),
    el('h4', '근거'), list(r.evidence),
    el('h4', '물리적 해석'), el('div', r.physics_explanation),
    el('h4', '측정 개선 팁'), list(r.measurement_tips),
    el('h4', '생각해 볼 질문'), list(r.inquiry_questions),
  );
}

async function runAI(btn, box, task) {
  box.hidden = false;
  btn.disabled = true;
  box.textContent = 'AI가 생각하는 중…';
  try {
    await task();
  } catch (err) {
    box.textContent = '오류: ' + explainError(err);
  } finally {
    btn.disabled = false;
  }
}

function onAnalyze() {
  const box = $('ai-result');
  const summary = buildSummary();
  if (!summary) {
    box.hidden = false;
    box.textContent = '먼저 📱 판정 탭에서 4초 이상 측정하세요.';
    return;
  }
  runAI($('btn-ai'), box, async () => renderAnalysis(box, await analyzeWithGemini({ ...aiSettings(), summary })));
}

function onAnalyzeTraining() {
  const box = $('ai-train-result');
  const summary = buildTrainingSummary();
  if (!summary) {
    box.hidden = false;
    box.textContent = '먼저 🧠 학습 탭에서 모델을 학습하세요.';
    return;
  }
  runAI($('btn-ai-train'), box, async () => { box.textContent = await interpretTraining({ ...aiSettings(), summary }); });
}

function onAsk() {
  const question = $('ai-question').value.trim();
  if (!question) return;
  runAI($('btn-ask'), $('ai-answer'), async () => {
    $('ai-answer').textContent = await askGemini({ ...aiSettings(), question, summary: buildSummary() ?? buildTrainingSummary() });
  });
}

// ================= 탭 =================
const TABS = ['measure', 'data', 'train', 'ai', 'theory', 'admin'];

function showTab(name) {
  if (!TABS.includes(name)) name = 'measure';
  if (name === 'admin' && !account.isAdmin) name = 'measure';
  for (const t of TABS) {
    const selected = t === name;
    $('tab-' + t).setAttribute('aria-selected', String(selected));
    $('tab-' + t).tabIndex = selected ? 0 : -1;
    $('panel-' + t).hidden = !selected;
  }
  try { history.replaceState(null, '', '#' + name); } catch { /* 무시 */ }
  $('tab-' + name).scrollIntoView({ inline: 'center', block: 'nearest' });
  if (name === 'measure') redrawLive();
  if (name === 'data') { drawRecChart(); renderData(); }
  if (name === 'train') { renderTrainSummary(); refreshScatter(); }
}

function initTabs() {
  for (const t of TABS) $('tab-' + t).addEventListener('click', () => showTab(t));
  $('tab-measure').parentElement.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const visible = TABS.filter(t => !$('tab-' + t).hidden);
    const cur = visible.findIndex(t => $('tab-' + t).getAttribute('aria-selected') === 'true');
    const next = visible[(cur + (e.key === 'ArrowRight' ? 1 : visible.length - 1)) % visible.length];
    showTab(next);
    $('tab-' + next).focus();
  });
  showTab(location.hash.slice(1));
}

// ================= 로그인 · AI 설정 · 관리자 =================
async function onAccountChange({ user, isAdmin, unavailable }) {
  account.user = user;
  account.isAdmin = isAdmin;
  account.unavailable = !!unavailable;
  account.aiConfig = null;
  account.aiState = user ? 'loading' : 'signedOut';
  if (!user) cloudRecs = [];
  renderAccount();
  if (!user) return;
  if (!model) loadClass(true);
  const r = await loadAIConfig();
  if (account.user?.uid !== user.uid) return; // 로딩 중 계정이 바뀌면 결과를 버린다
  account.aiState = r.status;
  account.aiConfig = r.status === 'ok' ? r.config : null;
  renderAccount();
}

function renderAccount() {
  const { user, isAdmin } = account;
  $('btn-login').hidden = !!user;
  $('btn-logout').hidden = !user;
  $('account-info').textContent = user ? `${user.displayName || user.email}${isAdmin ? ' · 관리자' : ''}` : '';
  $('tab-admin').hidden = !isAdmin;
  $('btn-class-publish').hidden = !isAdmin;
  if (!isAdmin && $('tab-admin').getAttribute('aria-selected') === 'true') showTab('measure');
  renderAIGate();
  renderData();
  if (isAdmin) fillAdminForm();
}

function renderAIGate() {
  const { aiState, user, aiConfig } = account;
  let msg = '';
  let ok = false;
  if (account.unavailable) msg = 'Firebase를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침하세요.';
  else if (!user) msg = 'AI 분석은 로그인한 사용자만 사용할 수 있습니다. 오른쪽 위의 "Google 로그인"을 눌러 주세요.';
  else if (aiState === 'loading') msg = 'AI 설정을 불러오는 중…';
  else if (aiState === 'denied') msg = '현재 AI 분석은 관리자만 사용할 수 있습니다. 선생님께 사용 허용을 요청하세요.';
  else if (aiState === 'unset') msg = account.isAdmin ? '아직 AI 설정이 없습니다. 🔧 관리자 탭에서 모델과 API 키를 저장하세요.' : 'AI 분석이 아직 준비되지 않았습니다. 선생님께 문의하세요.';
  else if (aiState === 'error') msg = 'AI 설정을 불러오지 못했습니다. 잠시 후 다시 시도하세요.';
  else ok = !!aiConfig;
  $('ai-gate').textContent = msg;
  $('ai-gate').hidden = ok;
  $('ai-body').hidden = !ok;
}

async function onLogin() {
  try {
    await signIn();
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    alert('로그인에 실패했습니다: ' + (e.message || e));
  }
}

function admStatus(msg) { $('adm-status').textContent = msg; }

function fillAdminForm() {
  const cfg = account.aiConfig;
  if (document.activeElement !== $('adm-model')) $('adm-model').value = cfg?.model || $('adm-model').value || '';
  $('adm-allow').checked = cfg ? !!cfg.allowStudents : $('adm-allow').checked;
  $('adm-key-hint').textContent = cfg?.apiKey
    ? `저장된 키: …${cfg.apiKey.slice(-4)} (바꾸려면 새 키를 입력, 비워 두면 유지)`
    : '저장된 키 없음';
}

// 입력칸에 새 키가 있으면 그것을, 없으면 저장된 키를 쓴다.
const adminKey = () => $('adm-key').value.trim() || account.aiConfig?.apiKey || '';

async function adminAction(btn, task) {
  btn.disabled = true;
  try {
    await task();
  } catch (e) {
    admStatus('오류: ' + (e.code === 'permission-denied' ? '권한이 없습니다. Firestore 규칙이 배포되었는지 확인하세요.' : explainError(e)));
  } finally {
    btn.disabled = false;
  }
}

function initAdmin() {
  $('btn-login').addEventListener('click', onLogin);
  $('btn-logout').addEventListener('click', () => signOut());

  $('btn-adm-models').addEventListener('click', () => adminAction($('btn-adm-models'), async () => {
    const apiKey = adminKey();
    if (!apiKey) return admStatus('API 키를 먼저 입력하세요.');
    admStatus('모델 목록을 불러오는 중…');
    const names = await listModels(apiKey);
    $('adm-model-list').replaceChildren(...names.map(n => { const o = document.createElement('option'); o.value = n; return o; }));
    admStatus(`사용 가능한 모델 ${names.length}개를 불러왔습니다. 모델 칸을 눌러 선택하세요.`);
  }));

  $('btn-adm-test').addEventListener('click', () => adminAction($('btn-adm-test'), async () => {
    const apiKey = adminKey();
    const m = $('adm-model').value.trim();
    if (!apiKey || !m) return admStatus('API 키와 모델을 모두 입력하세요.');
    admStatus('연결 테스트 중…');
    const reply = await testConnection({ apiKey, model: m });
    admStatus(`✔ 연결 성공 (응답: ${reply.slice(0, 40)})`);
  }));

  $('btn-adm-save').addEventListener('click', () => adminAction($('btn-adm-save'), async () => {
    const apiKey = adminKey();
    const m = $('adm-model').value.trim();
    if (!apiKey || !m) return admStatus('API 키와 모델을 모두 입력하세요.');
    await saveAIConfig({ apiKey, model: m, allowStudents: $('adm-allow').checked, updatedBy: account.user.email });
    $('adm-key').value = '';
    const r = await loadAIConfig();
    account.aiState = r.status;
    account.aiConfig = r.status === 'ok' ? r.config : null;
    renderAccount();
    admStatus('✔ 저장했습니다.');
  }));

  $('btn-adm-clear').addEventListener('click', () => adminAction($('btn-adm-clear'), async () => {
    if (!confirm('저장된 API 키와 모델 설정을 삭제할까요?')) return;
    await deleteAIConfig();
    account.aiState = 'unset';
    account.aiConfig = null;
    $('adm-key').value = '';
    renderAccount();
    admStatus('삭제했습니다.');
  }));
}

// ================= 그리기 루프 · 초기화 =================
let lastDraw = 0;
function loop(ts) {
  if (mode === 'judge' && ts - lastDraw > 80) {
    lastDraw = ts;
    redrawLive();
    const last = live.buf[live.buf.length - 1];
    if (last && live.latest) $('s-now').textContent = last.m.toFixed(2);
  }
  requestAnimationFrame(loop);
}

function init() {
  $('btn-start').addEventListener('click', () => startJudge('sensor'));
  $('btn-stop').addEventListener('click', stopJudge);
  $('btn-reset').addEventListener('click', resetJudge);
  $('btn-sim-walk').addEventListener('click', () => startJudge('walk'));
  $('btn-sim-run').addEventListener('click', () => startJudge('run'));
  $('btn-csv').addEventListener('click', exportRaw);
  $('btn-csv-win').addEventListener('click', exportWindows);

  $('btn-rec-start').addEventListener('click', startRecord);
  $('btn-rec-cancel').addEventListener('click', cancelRecord);
  $('btn-rec-save').addEventListener('click', saveRecord);
  $('btn-rec-discard').addEventListener('click', discardRecord);
  $('btn-cloud-load').addEventListener('click', loadCloud);
  $('btn-gen-sim').addEventListener('click', generateSim);
  $('btn-data-csv').addEventListener('click', exportDataset);
  $('btn-data-clear').addEventListener('click', clearLocal);

  $('btn-train').addEventListener('click', train);
  $('btn-class-load').addEventListener('click', () => loadClass(false));
  $('btn-class-publish').addEventListener('click', publish);
  $('train-sim').addEventListener('change', renderTrainSummary);

  $('btn-ai').addEventListener('click', onAnalyze);
  $('btn-ai-train').addEventListener('click', onAnalyzeTraining);
  $('btn-ask').addEventListener('click', onAsk);

  window.addEventListener('resize', () => { redrawLive(); drawRecChart(); refreshScatter(); });
  initScatterSelects();
  initTabs();
  initAdmin();
  renderModelLine();
  renderData();
  renderVerdict(null);
  initAccounts(onAccountChange);
  redrawLive();
  requestAnimationFrame(loop);
}

init();
