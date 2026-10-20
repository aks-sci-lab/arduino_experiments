import { G, DEFAULT_THRESHOLDS, LABELS, analyzeWindow, simulate } from './analysis.js';
import { analyzeWithGemini, askGemini, listModels, testConnection, explainError } from './ai.js';
import { initAccounts, signIn, signOut, loadAIConfig, saveAIConfig, deleteAIConfig } from './accounts.js';

const WINDOW_MS = 4000;      // 판정에 쓰는 구간 길이
const STEP_MS = 500;         // 판정 주기
const CHART_MS = 10000;      // 그래프에 보이는 시간
const MAX_SAMPLES = 60 * 60 * 10; // 약 10분 (60Hz 기준)
const CAL_MS = 10000;

const $ = id => document.getElementById(id);

const state = {
  running: false,
  source: null,        // 'sensor' | 'walk' | 'run'
  t0: 0,
  samples: [],         // { t, ax, ay, az, m }
  windows: [],         // analyzeWindow 결과 + t
  latest: null,
  simTimer: null,
  analyzeTimer: null,
  watchdog: null,
  gotEvent: false,
  wakeLock: null,
  cal: { walk: null, run: null, active: null, activeStart: 0, stds: [] },
};

// ---------- 기준값 ----------
function thresholds() {
  const num = (id, d) => {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : d;
  };
  return {
    stillStd: num('th-still', DEFAULT_THRESHOLDS.stillStd),
    runStd: num('th-run', DEFAULT_THRESHOLDS.runStd),
    flightMin: num('th-flight', DEFAULT_THRESHOLDS.flightMin),
  };
}

// ---------- 측정 시작/정지 ----------
async function startSensor() {
  if (typeof DeviceMotionEvent === 'undefined') {
    showWarning('이 브라우저에서는 가속도 센서(DeviceMotionEvent)를 사용할 수 없습니다. 시뮬레이션 버튼으로 체험해 보세요.');
    return;
  }
  if (!window.isSecureContext) {
    showWarning('센서는 HTTPS 주소에서만 동작합니다. https:// 로 시작하는 주소로 접속하세요.');
    return;
  }
  // iOS 13+ 는 사용자 동작 안에서 권한 요청이 필요하다.
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const perm = await DeviceMotionEvent.requestPermission();
      if (perm !== 'granted') {
        showWarning('센서 권한이 거부되었습니다. Safari 설정에서 "동작 및 방향" 접근을 허용한 뒤 다시 시도하세요.');
        return;
      }
    } catch (e) {
      showWarning('센서 권한 요청에 실패했습니다: ' + e.message);
      return;
    }
  }
  beginSession('sensor');
  window.addEventListener('devicemotion', onMotion);
  state.gotEvent = false;
  state.watchdog = setTimeout(() => {
    if (!state.gotEvent) {
      showWarning('센서 데이터가 들어오지 않습니다. 스마트폰에서 접속했는지, 브라우저가 센서를 지원하는지 확인하세요. PC라면 시뮬레이션 버튼을 사용하세요.');
    }
  }, 2000);
  requestWakeLock();
}

function startSimulation(kind) {
  beginSession(kind);
  state.simTimer = setInterval(() => {
    const t = performance.now() - state.t0;
    const m = simulate(kind, t / 1000);
    addSample(t, 0, m, 0, m);
  }, 1000 / 60);
}

function beginSession(source) {
  stop();
  hideWarning();
  if (state.samples.length === 0) state.t0 = performance.now();
  state.source = source;
  state.running = true;
  state.analyzeTimer = setInterval(analyzeNow, STEP_MS);
  $('btn-start').disabled = true;
  $('btn-stop').disabled = false;
  setStatus(runningStatus());
}

function runningStatus() {
  return state.source === 'sensor' ? '측정 중… (센서)' : `측정 중… (시뮬레이션: ${LABELS[state.source]})`;
}

function stop() {
  if (!state.running) return;
  state.running = false;
  window.removeEventListener('devicemotion', onMotion);
  clearInterval(state.simTimer);
  clearInterval(state.analyzeTimer);
  clearTimeout(state.watchdog);
  state.cal.active = null;
  releaseWakeLock();
  $('btn-start').disabled = false;
  $('btn-stop').disabled = true;
  updateExportButtons();
  setStatus(`정지됨 — 샘플 ${state.samples.length}개, ${(sessionMs() / 1000).toFixed(1)}초 기록`);
}

function reset() {
  stop();
  state.samples = [];
  state.windows = [];
  state.latest = null;
  renderVerdict(null);
  updateExportButtons();
  drawChart();
  drawTimeline();
  setStatus('초기화됨');
}

function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x === null) return;
  state.gotEvent = true;
  const t = performance.now() - state.t0;
  addSample(t, a.x, a.y, a.z, Math.hypot(a.x, a.y, a.z));
}

function addSample(t, ax, ay, az, m) {
  state.samples.push({ t, ax, ay, az, m });
  if (state.samples.length > MAX_SAMPLES) state.samples.splice(0, state.samples.length - MAX_SAMPLES);
}

function sessionMs() {
  const s = state.samples;
  return s.length ? s[s.length - 1].t - s[0].t : 0;
}

// ---------- 분석 ----------
function recentSamples(ms) {
  const s = state.samples;
  if (!s.length) return [];
  const tEnd = s[s.length - 1].t;
  let i = s.length - 1;
  while (i > 0 && s[i - 1].t >= tEnd - ms) i--;
  return s.slice(i);
}

function analyzeNow() {
  const win = recentSamples(WINDOW_MS);
  if (win.length < 10 || win[win.length - 1].t - win[0].t < WINDOW_MS * 0.75) {
    setStatus('데이터 모으는 중…');
    return;
  }
  const r = analyzeWindow(win, thresholds());
  r.t = win[win.length - 1].t;
  state.latest = r;
  state.windows.push(r);
  setStatus(runningStatus());
  renderVerdict(r);
  drawTimeline();
  collectCalibration(r);
  updateExportButtons();
}

function renderVerdict(r) {
  const v = $('verdict');
  if (!r) {
    v.dataset.state = 'idle';
    $('verdict-label').textContent = '—';
    $('verdict-reason').textContent = '측정을 시작하면 최근 4초 데이터로 판정합니다.';
    for (const id of ['s-now', 's-std', 's-max', 's-min', 's-steps', 's-cad']) $(id).textContent = '—';
    return;
  }
  v.dataset.state = r.label;
  $('verdict-label').textContent = LABELS[r.label];
  $('verdict-reason').textContent = r.reason;
  const last = state.samples[state.samples.length - 1];
  $('s-now').textContent = last ? last.m.toFixed(2) : '—';
  $('s-std').textContent = r.std.toFixed(2);
  $('s-max').textContent = r.max.toFixed(1);
  $('s-min').textContent = r.min.toFixed(1);
  $('s-steps').textContent = r.steps;
  $('s-cad').textContent = Math.round(r.cadence);
}

// ---------- 보정 ----------
function startCalibration(kind) {
  if (!state.running) {
    showWarning('먼저 측정을 시작한 뒤 보정 버튼을 누르세요.');
    return;
  }
  state.cal.active = kind;
  state.cal.activeStart = state.samples.length ? state.samples[state.samples.length - 1].t : 0;
  state.cal.stds = [];
  $('cal-status').textContent = `${LABELS[kind]} 보정 기록 중… 10초 동안 ${LABELS[kind]}를 계속하세요.`;
}

function collectCalibration(r) {
  const cal = state.cal;
  if (!cal.active) return;
  // 첫 4초 창이 보정 시작 전 데이터를 포함하지 않도록 한 창 길이만큼 지난 뒤부터 모은다.
  if (r.t - cal.activeStart >= WINDOW_MS) cal.stds.push(r.std);
  if (r.t - cal.activeStart >= CAL_MS + WINDOW_MS) {
    const avg = cal.stds.reduce((a, b) => a + b, 0) / Math.max(1, cal.stds.length);
    cal[cal.active] = avg;
    cal.active = null;
    applyCalibration();
  }
}

function applyCalibration() {
  const { walk, run } = state.cal;
  const parts = [];
  if (walk !== null) parts.push(`걷기 σ ≈ ${walk.toFixed(2)}`);
  if (run !== null) parts.push(`뛰기 σ ≈ ${run.toFixed(2)}`);
  let msg = parts.join(', ');
  if (walk !== null && run !== null) {
    if (run > walk) {
      const th = (walk + run) / 2;
      $('th-run').value = th.toFixed(1);
      msg += ` → 뛰기 기준을 σ ≥ ${th.toFixed(1)} 로 설정했습니다.`;
    } else {
      msg += ' → 뛰기 σ가 걷기보다 작습니다. 동작을 더 뚜렷하게 하여 다시 기록해 보세요.';
    }
  }
  $('cal-status').textContent = msg;
}

// ---------- 그래프 ----------
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function drawChart() {
  if ($('panel-measure').hidden) return;
  const { ctx, w, h } = fitCanvas($('chart'));
  ctx.clearRect(0, 0, w, h);
  const pad = { l: 34, r: 8, t: 8, b: 20 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;
  const data = recentSamples(CHART_MS);
  const tEnd = data.length ? data[data.length - 1].t : CHART_MS;
  const tStart = tEnd - CHART_MS;
  let yMax = 20;
  for (const s of data) if (s.m > yMax) yMax = s.m;
  yMax = Math.ceil(yMax / 10) * 10;
  const x = t => pad.l + ((t - tStart) / CHART_MS) * pw;
  const y = m => pad.t + ph - (m / yMax) * ph;

  // 축과 눈금
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = cssVar('--muted');
  ctx.strokeStyle = cssVar('--border');
  ctx.lineWidth = 1;
  for (let v = 0; v <= yMax; v += 10) {
    ctx.beginPath();
    ctx.moveTo(pad.l, y(v));
    ctx.lineTo(w - pad.r, y(v));
    ctx.stroke();
    ctx.fillText(String(v), 4, y(v) + 4);
  }
  ctx.fillText('시간 (최근 10초)', pad.l, h - 4);

  // g 기준선
  ctx.strokeStyle = cssVar('--gref');
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.l, y(G));
  ctx.lineTo(w - pad.r, y(G));
  ctx.stroke();
  ctx.setLineDash([]);

  // |a| 곡선
  if (data.length > 1) {
    ctx.strokeStyle = cssVar('--line');
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    data.forEach((s, i) => (i ? ctx.lineTo(x(s.t), y(s.m)) : ctx.moveTo(x(s.t), y(s.m))));
    ctx.stroke();
  }

  // 최근 판정 구간의 걸음 봉우리
  if (state.latest) {
    ctx.fillStyle = cssVar('--peak');
    for (const p of state.latest.peaks) {
      if (p.t < tStart) continue;
      ctx.beginPath();
      ctx.arc(x(p.t), y(p.m), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTimeline() {
  if ($('panel-measure').hidden) return;
  const { ctx, w, h } = fitCanvas($('timeline'));
  ctx.clearRect(0, 0, w, h);
  const wins = state.windows;
  if (!wins.length) return;
  const t0 = state.samples.length ? state.samples[0].t : 0;
  const span = Math.max(wins[wins.length - 1].t - t0, 1);
  const colors = { still: cssVar('--still'), walk: cssVar('--walk'), run: cssVar('--run') };
  let prevX = 0;
  for (const win of wins) {
    const xEnd = ((win.t - t0) / span) * w;
    ctx.fillStyle = colors[win.label];
    ctx.fillRect(prevX, 0, Math.max(1, xEnd - prevX), h);
    prevX = xEnd;
  }
}

let lastDraw = 0;
function loop(ts) {
  if (state.running && ts - lastDraw > 80 && !$('panel-measure').hidden) {
    lastDraw = ts;
    drawChart();
    const last = state.samples[state.samples.length - 1];
    if (last && state.latest) $('s-now').textContent = last.m.toFixed(2);
  }
  requestAnimationFrame(loop);
}

// ---------- CSV ----------
function download(name, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function exportRaw() {
  const t0 = state.samples[0]?.t ?? 0;
  const rows = ['time_s,ax,ay,az,a_mag'];
  for (const s of state.samples) {
    rows.push([((s.t - t0) / 1000).toFixed(3), s.ax.toFixed(3), s.ay.toFixed(3), s.az.toFixed(3), s.m.toFixed(3)].join(','));
  }
  download(`accel-raw-${stamp()}.csv`, rows.join('\n'));
}

function exportWindows() {
  const t0 = state.samples[0]?.t ?? 0;
  const rows = ['time_s,label,mean,std,max,min,steps,cadence_spm'];
  for (const r of state.windows) {
    rows.push([((r.t - t0) / 1000).toFixed(2), LABELS[r.label], r.mean.toFixed(3), r.std.toFixed(3), r.max.toFixed(3), r.min.toFixed(3), r.steps, r.cadence.toFixed(1)].join(','));
  }
  download(`accel-windows-${stamp()}.csv`, rows.join('\n'));
}

function updateExportButtons() {
  $('btn-csv').disabled = state.samples.length === 0;
  $('btn-csv-win').disabled = state.windows.length === 0;
}

// ---------- AI ----------
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

function buildSummary() {
  if (!state.latest) return null;
  const s = state.samples;
  const durationSec = sessionMs() / 1000;
  const byLabel = {};
  for (const key of Object.keys(LABELS)) {
    const ws = state.windows.filter(w => w.label === key);
    if (!ws.length) continue;
    const avg = f => round(ws.reduce((a, w) => a + w[f], 0) / ws.length);
    byLabel[LABELS[key]] = {
      fraction_of_windows: round(ws.length / state.windows.length),
      avg_std: avg('std'),
      avg_max: avg('max'),
      avg_min: avg('min'),
      avg_cadence_spm: avg('cadence'),
    };
  }
  // 최근 8초를 10Hz로 줄여 파형 모양을 전달
  const recent = recentSamples(8000);
  const waveform = [];
  let next = recent.length ? recent[0].t : 0;
  for (const p of recent) {
    if (p.t >= next) {
      waveform.push(round(p.m, 1));
      next += 100;
    }
  }
  const L = state.latest;
  return {
    sensor: 'accelerationIncludingGravity의 크기 |a| (m/s²), g = 9.81',
    data_source: state.source === 'sensor' ? '스마트폰 센서' : `시뮬레이션(${LABELS[state.source]})`,
    student_memo: $('ai-memo').value.trim() || null,
    duration_sec: round(durationSec, 1),
    sample_rate_hz: durationSec > 0 ? round(s.length / durationSec, 0) : null,
    rule_thresholds: thresholds(),
    calibration_std: { walk: state.cal.walk && round(state.cal.walk), run: state.cal.run && round(state.cal.run) },
    latest_4s_window: {
      rule_verdict: LABELS[L.label],
      rule_reason: L.reason,
      mean: round(L.mean), std: round(L.std), max: round(L.max), min: round(L.min),
      steps: L.steps, cadence_spm: round(L.cadence, 0),
    },
    whole_session_by_rule_label: byLabel,
    recent_8s_waveform_10hz: waveform,
  };
}

function aiSettings() {
  const cfg = account.aiConfig;
  if (!cfg) throw new Error('AI 설정을 불러오지 못했습니다. 로그인 상태와 관리자 설정을 확인하세요.');
  return { apiKey: cfg.apiKey, model: cfg.model };
}

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function list(items) {
  const ul = el('ul');
  for (const it of items) ul.appendChild(el('li', it));
  return ul;
}

function renderAnalysis(box, r) {
  box.replaceChildren(
    el('div', `AI 판정: ${r.verdict} (확신도 ${r.confidence}%)`, 'big'),
    el('div', r.agrees_with_rule ? '✔ 앱의 규칙 판정과 일치' : '✖ 앱의 규칙 판정과 다름 — 기준값을 점검해 보세요'),
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
    box.textContent = '먼저 4초 이상 측정하세요.';
    return;
  }
  runAI($('btn-ai'), box, async () => {
    const r = await analyzeWithGemini({ ...aiSettings(), summary });
    renderAnalysis(box, r);
  });
}

function onAsk() {
  const box = $('ai-answer');
  const question = $('ai-question').value.trim();
  if (!question) return;
  runAI($('btn-ask'), box, async () => {
    box.textContent = await askGemini({ ...aiSettings(), question, summary: buildSummary() });
  });
}

// ---------- 공통 UI ----------
function setStatus(msg) { $('status').textContent = msg; }
function showWarning(msg) { const w = $('sensor-warning'); w.textContent = msg; w.hidden = false; }
function hideWarning() { $('sensor-warning').hidden = true; }

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* 지원하지 않으면 무시 */ }
}
function releaseWakeLock() {
  state.wakeLock?.release().catch(() => {});
  state.wakeLock = null;
}

// ---------- 탭 ----------
const TABS = ['measure', 'criteria', 'ai', 'theory', 'admin'];

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
  if (name === 'measure') redraw();
}

function initTabs() {
  for (const t of TABS) {
    $('tab-' + t).addEventListener('click', () => showTab(t));
  }
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

function redraw() {
  if ($('panel-measure').hidden) return;
  drawChart();
  drawTimeline();
}

// ---------- 로그인 · AI 설정 ----------
const account = { user: null, isAdmin: false, aiState: 'loading', aiConfig: null, unavailable: false };

async function onAccountChange({ user, isAdmin, unavailable }) {
  account.user = user;
  account.isAdmin = isAdmin;
  account.unavailable = !!unavailable;
  account.aiConfig = null;
  account.aiState = user ? 'loading' : 'signedOut';
  renderAccount();
  if (!user) return;
  const r = await loadAIConfig();
  // 로딩 중 로그아웃/계정 전환이 있었다면 결과를 버린다.
  if (account.user?.uid !== user.uid) return;
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
  if (!isAdmin && $('tab-admin').getAttribute('aria-selected') === 'true') showTab('measure');
  renderAIGate();
  if (isAdmin) fillAdminForm();
}

function renderAIGate() {
  const gate = $('ai-gate');
  const body = $('ai-body');
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
  gate.textContent = msg;
  gate.hidden = ok;
  body.hidden = !ok;
}

async function onLogin() {
  try {
    await signIn();
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    alert('로그인에 실패했습니다: ' + (e.message || e));
  }
}

// ---------- 관리자 ----------
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
function adminKey() {
  return $('adm-key').value.trim() || account.aiConfig?.apiKey || '';
}

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
    const model = $('adm-model').value.trim();
    if (!apiKey || !model) return admStatus('API 키와 모델을 모두 입력하세요.');
    admStatus('연결 테스트 중…');
    const reply = await testConnection({ apiKey, model });
    admStatus(`✔ 연결 성공 (응답: ${reply.slice(0, 40)})`);
  }));

  $('btn-adm-save').addEventListener('click', () => adminAction($('btn-adm-save'), async () => {
    const apiKey = adminKey();
    const model = $('adm-model').value.trim();
    if (!apiKey || !model) return admStatus('API 키와 모델을 모두 입력하세요.');
    await saveAIConfig({ apiKey, model, allowStudents: $('adm-allow').checked, updatedBy: account.user.email });
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

function init() {
  $('btn-start').addEventListener('click', startSensor);
  $('btn-stop').addEventListener('click', stop);
  $('btn-reset').addEventListener('click', reset);
  $('btn-sim-walk').addEventListener('click', () => startSimulation('walk'));
  $('btn-sim-run').addEventListener('click', () => startSimulation('run'));
  $('btn-cal-walk').addEventListener('click', () => startCalibration('walk'));
  $('btn-cal-run').addEventListener('click', () => startCalibration('run'));
  $('btn-csv').addEventListener('click', exportRaw);
  $('btn-csv-win').addEventListener('click', exportWindows);
  $('btn-ai').addEventListener('click', onAnalyze);
  $('btn-ask').addEventListener('click', onAsk);
  window.addEventListener('resize', redraw);
  initTabs();
  initAdmin();
  initAccounts(onAccountChange);
  redraw();
  requestAnimationFrame(loop);
}

init();
