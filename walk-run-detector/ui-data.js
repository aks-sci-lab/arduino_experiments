// 🧪 데이터 탭: 기록하기 / 내 데이터 / 라벨 관리
import { HZ, resample, extractFeatures, featureVector, windowsOf, makeSimSeries, FEATURE_KEYS } from './analysis.js';
import { makeRecording, summarize } from './dataset.js';
import { drawSeries } from './charts.js';
import { labelIds, labelName, labelColorVar, addLabel, removeLabel, isCustom, validateNewLabel } from './labels.js';
import {
  $, state, sampler, sampleHandlers, on, emit, el, download, stamp, allRecordings, isEvalRec,
  persistRecordings, setCloudRecordings, fillLabelSelect, dot,
} from './state.js';
import { currentTab, currentSub } from './tabs.js';
import { uploadRecording, loadCloudRecordings, deleteCloudRecording, currentUid, setEvalSet } from './accounts.js';

const COUNTDOWN_MS = 3000;
const MIN_RECORD_STD = 0.5;     // 이보다 흔들림이 작은 기록은 저장하지 않는다
const MIN_SENSOR_HZ = 20;
const SIM_LABELS = ['walk', 'run'];
const rec = { phase: 'idle', pts: [], seconds: 20, label: 'walk', source: 'sensor', result: null };
const radio = name => document.querySelector(`input[name="${name}"]:checked`).value;

function warn(msg) {
  $('rec-warning').textContent = msg;
  $('rec-warning').hidden = false;
}

// ---------- 기록하기 ----------
async function startRecord() {
  if (state.mode) return warn('이미 측정 중입니다. 먼저 📱 판정 탭에서 정지하세요.');
  $('rec-warning').hidden = true;
  rec.label = $('rec-label').value;
  rec.source = radio('rec-source');
  rec.seconds = Number($('rec-seconds').value);
  if (rec.source === 'sim' && !SIM_LABELS.includes(rec.label)) {
    return warn('시뮬레이션은 걷기·뛰기만 만들 수 있습니다. 센서로 기록하거나 라벨을 바꾸세요.');
  }
  rec.pts = [];
  rec.result = null;
  $('rec-result').hidden = true;
  state.mode = 'record';
  rec.phase = 'countdown';
  const ok = await sampler.start(rec.source === 'sensor' ? 'sensor' : rec.label);
  if (!ok) { state.mode = null; rec.phase = 'idle'; return; }
  $('btn-rec-start').disabled = true;
  $('btn-rec-cancel').disabled = false;
  $('rec-progress').hidden = false;
  $('rec-bar').style.width = '0%';
  $('rec-status').textContent = `3초 뒤 시작합니다. 휴대폰을 잡고 ${labelName(rec.label)} 준비!`;
}

function onRecordSample(s) {
  if (s.t < COUNTDOWN_MS) {
    $('rec-status').textContent = `${Math.ceil((COUNTDOWN_MS - s.t) / 1000)}… ${labelName(rec.label)} 준비!`;
    return;
  }
  rec.phase = 'recording';
  rec.pts.push(s);
  const elapsed = s.t - COUNTDOWN_MS;
  const total = rec.seconds * 1000;
  $('rec-bar').style.width = Math.min(100, (elapsed / total) * 100).toFixed(0) + '%';
  $('rec-status').textContent = `🔴 ${labelName(rec.label)} 기록 중… ${Math.max(0, Math.ceil((total - elapsed) / 1000))}초 남음`;
  if (rec.pts.length % 4 === 0) drawRecChart();
  if (elapsed >= total) finishRecord();
}

function resetRecordUI() {
  $('btn-rec-start').disabled = false;
  $('btn-rec-cancel').disabled = true;
  $('rec-progress').hidden = true;
}

function cancelRecord() {
  if (state.mode !== 'record') return;
  sampler.stop();
  state.mode = null;
  rec.phase = 'idle';
  resetRecordUI();
  $('rec-status').textContent = '취소했습니다.';
}

function finishRecord() {
  sampler.stop();
  state.mode = null;
  rec.phase = 'idle';
  resetRecordUI();
  const rate = rec.pts.length / rec.seconds;
  if (rate < MIN_SENSOR_HZ) {
    $('rec-status').textContent = '';
    return warn(`센서 표본이 너무 적습니다 (${rate.toFixed(0)}Hz). 화면을 켠 채로 다시 기록하세요.`);
  }
  const x = resample(rec.pts, HZ, COUNTDOWN_MS, rec.seconds * HZ);
  const f = extractFeatures(x);
  rec.result = { x, f };
  drawRecChart();
  const tooStill = f.std < MIN_RECORD_STD;
  $('rec-status').textContent = '기록이 끝났습니다.';
  $('rec-result-text').textContent = tooStill
    ? `움직임이 거의 없습니다 (σ ${f.std.toFixed(2)}). 휴대폰을 들고 ${labelName(rec.label)} 동작을 하면서 다시 기록하세요.`
    : `${labelName(rec.label)} 기록 · ${rec.seconds}초 · 학습 구간 ${windowsOf(x).length}개 · σ ${f.std.toFixed(2)} · 최소 |a| ${f.min.toFixed(1)} · 케이던스 ${Math.round(f.cadence)}걸음/분`
      + ' — 동작과 라벨이 맞는지 그래프를 확인하고 저장하세요.';
  $('btn-rec-save').disabled = tooStill;
  const canUpload = !!state.account.user && rec.source === 'sensor';
  $('rec-upload').disabled = !canUpload;
  $('rec-upload').checked = canUpload && $('rec-upload').checked;
  $('rec-result').hidden = false;
}

function drawRecChart() {
  if (currentTab() !== 'data' || currentSub('data') !== 'rec') return;
  if (rec.result) {
    drawSeries($('rec-chart'), rec.result.x.map((y, i) => ({ x: i / HZ, y })), 0, rec.seconds,
      { peaks: rec.result.f._peaks.map(i => ({ x: i / HZ, y: rec.result.x[i] })) });
  } else {
    drawSeries($('rec-chart'), rec.pts.map(p => ({ x: (p.t - COUNTDOWN_MS) / 1000, y: p.m })), 0, rec.seconds);
  }
}

async function saveRecord() {
  if (!rec.result) return;
  const r = makeRecording({ label: rec.label, source: rec.source, m: rec.result.x });
  let note = '';
  if ($('rec-upload').checked && !$('rec-upload').disabled) {
    try {
      r.cloudId = await uploadRecording(r);
      r.userId = currentUid();
      note = ' (학급 데이터에도 올렸습니다)';
    } catch (e) {
      note = ` (클라우드 업로드 실패: ${e.code === 'permission-denied' ? 'Firestore 규칙이 배포되지 않았거나 권한이 없습니다' : e.message})`;
    }
  }
  state.recordings.push(r);
  if (!persistRecordings()) note += ' ⚠ 이 기기 저장 공간이 부족합니다. 오래된 기록을 삭제하세요.';
  rec.result = null;
  $('rec-result').hidden = true;
  $('rec-status').textContent = `저장했습니다.${note} 다른 기록도 계속 모아 보세요.`;
  drawRecChart();
}

function discardRecord() {
  rec.result = null;
  $('rec-result').hidden = true;
  $('rec-status').textContent = '기록을 버렸습니다.';
  drawRecChart();
}

// ---------- 내 데이터 ----------
const SOURCE_TEXT = { sensor: '📱 센서', sim: '🖥 시뮬', cloud: '☁ 학급' };
const setDataStatus = msg => { $('data-status').textContent = msg; };

function renderMine() {
  const all = allRecordings();
  const s = summarize(all);
  const parts = Object.entries(s.byLabel).map(([id, n]) => `${labelName(id)} ${n}`).join(' · ');
  $('data-summary').textContent = all.length
    ? `기록 ${s.total}개 (${parts}) · 학습 구간 ${s.windows}개 · 이 기기 ${state.recordings.length}개 · 불러온 학급 데이터 ${state.cloudRecs.length}개`
    : '아직 기록이 없습니다. "기록하기"에서 동작마다 여러 번 기록하세요.';
  $('btn-cloud-load').disabled = !state.account.user;
  $('btn-data-csv').disabled = !all.length;

  const head = el('tr');
  for (const h of ['라벨', '출처', '길이', '구간', '평가용', '']) head.appendChild(el('th', h));
  const tbody = el('tbody');
  const uid = currentUid();
  for (const r of [...all].reverse()) {
    const tr = el('tr');
    const labelCell = el('td');
    labelCell.append(dot(r.label), labelName(r.label));
    const evalCell = el('td');
    const cloudDoc = r.cloudId ? state.cloudRecs.find(c => c.cloudId === r.cloudId) : null;
    if (state.account.isAdmin && cloudDoc) {
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = cloudDoc.evalSet === true;
      cb.title = '평가용으로 지정';
      cb.addEventListener('change', () => toggleEval(cloudDoc, cb));
      evalCell.appendChild(cb);
    } else {
      evalCell.textContent = isEvalRec(r) ? '★' : '';
    }
    const delCell = el('td');
    if (state.recordings.includes(r) || (r.source === 'cloud' && (r.userId === uid || state.account.isAdmin))) {
      const b = el('button', '삭제');
      b.addEventListener('click', () => deleteRecord(r));
      delCell.appendChild(b);
    }
    tr.append(labelCell, el('td', SOURCE_TEXT[r.source] + (r.cloudId && r.source !== 'cloud' ? ' ☁' : '')),
      el('td', `${(r.m.length / (r.hz || HZ)).toFixed(0)}초`), el('td', String(windowsOf(r.m).length)), evalCell, delCell);
    tbody.appendChild(tr);
  }
  const thead = el('thead');
  thead.appendChild(head);
  $('data-table').replaceChildren(thead, tbody);
}

async function toggleEval(doc, cb) {
  cb.disabled = true;
  try {
    await setEvalSet(doc.cloudId, cb.checked);
    doc.evalSet = cb.checked;
    setDataStatus(cb.checked ? '평가용으로 지정했습니다. 이 기록은 학생 학습에서 제외됩니다.' : '평가용 지정을 해제했습니다.');
    emit('recordings');
  } catch (e) {
    cb.checked = !cb.checked;
    setDataStatus('지정 실패: ' + (e.code === 'permission-denied' ? '권한이 없습니다. Firestore 규칙을 배포했는지 확인하세요.' : e.message));
  } finally {
    cb.disabled = false;
  }
}

async function deleteRecord(r) {
  try {
    if (r.cloudId && (r.userId === currentUid() || state.account.isAdmin)
      && confirm('클라우드에서도 삭제할까요? (다른 학생의 학습·비교에도 영향이 있습니다)')) {
      await deleteCloudRecording(r.cloudId);
    }
  } catch (e) {
    return setDataStatus('클라우드 삭제 실패: ' + (e.code === 'permission-denied' ? '권한이 없습니다.' : e.message));
  }
  state.recordings = state.recordings.filter(x => x.id !== r.id);
  setCloudRecordings(state.cloudRecs.filter(x => x.id !== r.id && x.cloudId !== r.cloudId));
  persistRecordings();
}

async function loadCloud() {
  setDataStatus('학급 데이터를 불러오는 중…');
  try {
    const list = await loadCloudRecordings();
    setCloudRecordings(list);
    const ev = list.filter(r => r.evalSet).length;
    setDataStatus(`학급 데이터 ${list.length}개를 불러왔습니다 (평가용 ${ev}개 포함). 이 기기에는 저장되지 않고 학습·비교에만 사용됩니다.`);
  } catch (e) {
    setDataStatus('불러오기 실패: ' + (e.code === 'permission-denied' ? '권한이 없습니다. Firestore 규칙을 배포했는지 확인하세요.' : e.message));
  }
}

function generateSim() {
  for (const label of SIM_LABELS) {
    for (let i = 0; i < 6; i++) state.recordings.push(makeRecording({ label, source: 'sim', m: makeSimSeries(label, 20) }));
  }
  setDataStatus(persistRecordings()
    ? '시뮬레이션 기록 12개를 만들었습니다. 학습 탭에서 "시뮬레이션 데이터도 학습에 포함"을 체크하세요.'
    : '⚠ 저장 공간이 부족합니다.');
}

function clearLocal() {
  if (!state.recordings.length || !confirm(`이 기기의 기록 ${state.recordings.length}개를 모두 삭제할까요?`)) return;
  state.recordings = [];
  persistRecordings();
}

function exportDataset() {
  const rows = [['recording', 'label', 'source', 'start_s', ...FEATURE_KEYS].join(',')];
  for (const r of allRecordings()) {
    for (const w of windowsOf(r.m)) {
      rows.push([r.id, r.label, r.source, (w.start / HZ).toFixed(1), ...featureVector(w.features).map(v => v.toFixed(4))].join(','));
    }
  }
  download(`walk-run-features-${stamp()}.csv`, rows.join('\n'));
}

// ---------- 라벨 ----------
function renderLabels() {
  fillLabelSelect($('rec-label'));
  const counts = summarize(allRecordings()).byLabel;
  const head = el('tr');
  for (const h of ['라벨', '기록 수', '']) head.appendChild(el('th', h));
  const thead = el('thead');
  thead.appendChild(head);
  const tbody = el('tbody');
  for (const id of labelIds()) {
    const tr = el('tr');
    const c = el('td');
    c.append(dot(id), labelName(id));
    const n = counts[id] || 0;
    const del = el('td');
    if (isCustom(id) && n === 0) {
      const b = el('button', '삭제');
      b.addEventListener('click', () => { removeLabel(id); emit('labels'); });
      del.appendChild(b);
    }
    tr.append(c, el('td', String(n)), del);
    tbody.appendChild(tr);
  }
  $('label-table').replaceChildren(thead, tbody);
}

function onAddLabel() {
  const input = $('label-new');
  const err = validateNewLabel(input.value) || addLabel(input.value);
  $('label-status').textContent = err || `"${input.value.trim()}" 라벨을 추가했습니다. 이제 기록하기에서 고를 수 있습니다.`;
  if (!err) { input.value = ''; emit('labels'); }
}

export function initData() {
  sampleHandlers.record = onRecordSample;
  on('sampler-error', msg => { if (state.mode === 'record') warn(msg); });
  on('recordings', () => { renderMine(); renderLabels(); });
  on('labels', renderLabels);
  on('account', renderMine);
  on('tab', drawRecChart);
  on('subtab', drawRecChart);
  window.addEventListener('resize', drawRecChart);

  $('btn-rec-start').addEventListener('click', startRecord);
  $('btn-rec-cancel').addEventListener('click', cancelRecord);
  $('btn-rec-save').addEventListener('click', saveRecord);
  $('btn-rec-discard').addEventListener('click', discardRecord);
  $('btn-cloud-load').addEventListener('click', loadCloud);
  $('btn-gen-sim').addEventListener('click', generateSim);
  $('btn-data-csv').addEventListener('click', exportDataset);
  $('btn-data-clear').addEventListener('click', clearLocal);
  $('btn-label-add').addEventListener('click', onAddLabel);
  $('label-new').addEventListener('keydown', e => { if (e.key === 'Enter') onAddLabel(); });
  renderMine();
  renderLabels();
}
