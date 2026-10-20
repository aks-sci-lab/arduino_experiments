// 🤖 AI 탭: API 선택(교사 제공 / 내 키) · 분석·질문 · 토큰 비교
import { FEATURES, FEATURE_KEYS } from './analysis.js';
import { MODEL_TYPES, featureWeights, predictLabel } from './ml.js';
import { summarize } from './dataset.js';
import {
  analyzeWithGemini, askGemini, interpretTraining, listModels, testConnection, explainError,
  countTokens, classifyWithLLM, setBeforeCall,
} from './ai.js';
import { FORMATS, buildPrompt, sampleWindows, CLASSIFY_SYSTEM } from './tokens.js';
import { labelName, labelIds } from './labels.js';
import { $, state, on, el, list, readLocal, writeLocal, round, pct, allRecordings, renderCards } from './state.js';

const ai = {
  source: readLocal('wr-ai-source', 'teacher') === 'personal' ? 'personal' : 'teacher',
  personalKey: '',
  personalModel: readLocal('wr-ps-model'),
};
{
  const saved = readLocal('wr-ps-key');
  if (saved) ai.personalKey = saved;
}

// ---------- 교사 API 하루 사용 횟수 (안내용, 강제 불가) ----------
const quotaKey = () => `wr-quota-${new Date().toISOString().slice(0, 10)}-${state.account.user?.uid ?? 'anon'}`;
const quotaUsed = () => Number(readLocal(quotaKey(), '0')) || 0;
const quotaLimit = () => state.account.aiConfig?.dailyLimit ?? 0;
const quotaLeft = () => (quotaLimit() > 0 ? Math.max(0, quotaLimit() - quotaUsed()) : Infinity);

function renderQuota() {
  $('ai-quota').textContent = ai.source === 'teacher' && state.account.aiConfig && quotaLimit() > 0
    ? `오늘 사용 ${quotaUsed()} / ${quotaLimit()}회 (하루 사용 횟수는 안내용이며, 실제 상한은 교사가 키에 설정한 할당량입니다)`
    : '';
}

// ---------- 사용 가능 여부 ----------
function teacherState() {
  const { aiState, user, aiConfig, unavailable, isAdmin } = state.account;
  if (unavailable) return { ok: false, msg: 'Firebase를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침하세요.' };
  if (!user) return { ok: false, msg: '교사가 제공한 API는 로그인한 사용자만 쓸 수 있습니다. 오른쪽 위의 "Google 로그인"을 눌러 주세요. (내 API 키를 쓰면 로그인 없이도 됩니다)' };
  if (aiState === 'loading') return { ok: false, msg: '교사 API 설정을 불러오는 중…' };
  if (aiState === 'denied') return { ok: false, msg: '지금은 교사 API를 관리자만 쓸 수 있습니다. 선생님께 사용 허용을 요청하거나 "내 API 키"를 선택하세요.' };
  if (aiState === 'unset') return { ok: false, msg: isAdmin ? '교사 API가 아직 없습니다. 🔧 관리자 탭에서 모델과 API 키를 저장하세요.' : '교사 API가 아직 준비되지 않았습니다. 선생님께 문의하거나 "내 API 키"를 선택하세요.' };
  if (aiState === 'error') return { ok: false, msg: '교사 API 설정을 불러오지 못했습니다. 잠시 후 다시 시도하세요.' };
  return aiConfig ? { ok: true, msg: '' } : { ok: false, msg: '교사 API 설정이 없습니다.' };
}

function personalState() {
  return ai.personalKey && ai.personalModel ? { ok: true, msg: '' } : { ok: false, msg: '"API 선택"에서 내 API 키와 모델을 입력하세요.' };
}

const usable = () => (ai.source === 'teacher' ? teacherState() : personalState());

// 호출에 쓸 { apiKey, model }
function settings() {
  const u = usable();
  if (!u.ok) throw new Error(u.msg);
  return ai.source === 'teacher'
    ? { apiKey: state.account.aiConfig.apiKey, model: state.account.aiConfig.model }
    : { apiKey: ai.personalKey, model: ai.personalModel };
}

export function renderAI() {
  document.querySelector(`input[name="ai-source"][value="${ai.source}"]`).checked = true;
  $('ai-teacher-box').hidden = ai.source !== 'teacher';
  $('ai-personal-box').hidden = ai.source !== 'personal';
  const t = teacherState();
  $('ai-gate').textContent = t.ok ? `✔ 교사 API를 쓸 수 있습니다 (모델: ${state.account.aiConfig.model})` : t.msg;
  $('ai-gate').className = t.ok ? 'notice' : 'notice warn';
  const u = usable();
  for (const [needId, bodyId] of [['ai-need', 'ai-body'], ['tk-need', null]]) {
    $(needId).hidden = u.ok;
    $(needId).textContent = u.msg + ' → 🔑 API 선택 탭';
    if (bodyId) $(bodyId).hidden = !u.ok;
  }
  for (const id of ['btn-tk-count', 'btn-tk-run']) $(id).disabled = !u.ok;
  renderQuota();
}

// ---------- 요약 만들기 ----------
function modelInfo() {
  const m = state.model;
  if (!m) return null;
  const w = featureWeights(m);
  return {
    type: MODEL_TYPES[m.type],
    labels: m.labels.map(labelName),
    features_used: m.features.map(k => FEATURES.find(f => f.key === k).name),
    recordings: m.nRecordings,
    windows: m.nWindows,
    train_accuracy: m.metrics ? round(m.metrics.train.accuracy) : null,
    test_accuracy: m.metrics ? round(m.metrics.test.accuracy) : null,
    test_per_label: m.metrics ? Object.fromEntries(Object.entries(m.metrics.test.perClass).map(([l, v]) => [labelName(l), { precision: round(v.precision), recall: round(v.recall), support: v.support }])) : null,
    top_standardized_weights: w
      ? Object.fromEntries(m.labels.map(l => [labelName(l), [...w].sort((a, b) => Math.abs(b.byLabel[l]) - Math.abs(a.byLabel[l])).slice(0, 4).map(x => `${FEATURES.find(f => f.key === x.key).name}: ${round(x.byLabel[l])}`)]))
      : null,
  };
}

function buildSummary() {
  const live = state.live;
  const L = live.latest;
  if (!L) return null;
  const b = live.buf;
  const waveform = [];
  const tEnd = b[b.length - 1].t;
  let next = tEnd - 8000;
  for (const p of b) {
    if (p.t >= next) { waveform.push(round(p.m, 1)); next += 100; }
  }
  const counts = {};
  for (const w of live.windows) counts[w.label] = (counts[w.label] || 0) + 1;
  return {
    sensor: 'accelerationIncludingGravity의 크기 |a| (m/s²), g = 9.81',
    data_source: live.source === 'sensor' ? '스마트폰 센서' : `시뮬레이션(${labelName(live.source)})`,
    student_memo: $('ai-memo').value.trim() || null,
    duration_sec: round((tEnd - b[0].t) / 1000, 1),
    latest_4s_window: {
      model_prediction: L.label === 'idle' ? '움직임 없음' : L.label === 'none' ? '모델 없음' : labelName(L.label),
      confidence: L.p === null ? null : round(L.p),
      probabilities: L.probs ? Object.fromEntries(Object.entries(L.probs).map(([l, p]) => [labelName(l), round(p)])) : null,
      features: Object.fromEntries(FEATURE_KEYS.map(k => [k, round(L.f[k])])),
    },
    whole_session_prediction_counts: Object.fromEntries(Object.entries(counts).map(([l, n]) => [l === 'idle' ? '움직임 없음' : l === 'none' ? '모델 없음' : labelName(l), n])),
    model: modelInfo(),
    recent_8s_waveform_10hz: waveform,
  };
}

function buildTrainingSummary() {
  if (!state.model) return null;
  const s = summarize(allRecordings());
  return {
    model: modelInfo(),
    dataset: { recordings: s.total, by_label: Object.fromEntries(Object.entries(s.byLabel).map(([l, n]) => [labelName(l), n])), by_source: s.bySource, windows: s.windows },
  };
}

// ---------- 분석·질문 ----------
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
    renderQuota();
  }
}

function onAnalyze() {
  const box = $('ai-result');
  const summary = buildSummary();
  if (!summary) { box.hidden = false; box.textContent = '먼저 📱 판정 탭에서 4초 이상 측정하세요.'; return; }
  runAI($('btn-ai'), box, async () => renderAnalysis(box, await analyzeWithGemini({ ...settings(), summary })));
}

function onAnalyzeTraining() {
  const box = $('ai-train-result');
  const summary = buildTrainingSummary();
  if (!summary) { box.hidden = false; box.textContent = '먼저 🧠 학습 탭에서 모델을 학습하세요.'; return; }
  runAI($('btn-ai-train'), box, async () => { box.textContent = await interpretTraining({ ...settings(), summary }); });
}

function onAsk() {
  const question = $('ai-question').value.trim();
  if (!question) return;
  runAI($('btn-ask'), $('ai-answer'), async () => {
    $('ai-answer').textContent = await askGemini({ ...settings(), question, summary: buildSummary() ?? buildTrainingSummary() });
  });
}

// ---------- 내 API 키 ----------
const setPs = msg => { $('ps-status').textContent = msg; };

function readPersonal() {
  ai.personalKey = $('ps-key').value.trim();
  ai.personalModel = $('ps-model').value.trim();
  writeLocal('wr-ps-model', ai.personalModel);
  if ($('ps-remember').checked) writeLocal('wr-ps-key', ai.personalKey);
  else { try { localStorage.removeItem('wr-ps-key'); } catch { /* 무시 */ } }
  renderAI();
}

async function psAction(btn, task) {
  btn.disabled = true;
  try { await task(); } catch (e) { setPs('오류: ' + explainError(e)); } finally { btn.disabled = false; }
}

// ---------- 토큰 비교 ----------
const setTk = msg => { $('tk-status').textContent = msg; };
const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('ko-KR', { maximumFractionDigits: d }) : '—');
const HOUR_WINDOWS = 1800;    // 2초마다 판정하면 1시간에 1800번

function chosenFormats() {
  return FORMATS.filter(f => $('tk-formats').querySelector(`input[value="${f.id}"]`)?.checked);
}

function prepare() {
  const n = Number($('tk-n').value);
  const windows = sampleWindows(allRecordings(), n);
  const names = [...new Set(windows.map(w => w.label))];
  if (names.length < 2) throw new Error('라벨이 2개 이상인 기록이 필요합니다. 🧪 데이터 탭에서 기록하세요.');
  const formats = chosenFormats();
  if (!formats.length) throw new Error('입력 형식을 1개 이상 고르세요.');
  return { windows, labelNames: names.map(labelName), formats };
}

async function onCountTokens() {
  $('btn-tk-count').disabled = true;
  try {
    const { windows, labelNames, formats } = prepare();
    const { apiKey, model } = settings();
    const rows = [];
    let done = 0;
    for (const fmt of formats) {
      let total = 0;
      for (const w of windows) {
        setTk(`토큰 세는 중… (${++done}/${windows.length * formats.length})`);
        total += await countTokens({ apiKey, model, userText: buildPrompt(fmt.id, w.x, w.f, labelNames), system: CLASSIFY_SYSTEM });
      }
      rows.push({ name: fmt.name, prompt: total / windows.length });
    }
    renderTokenTable(rows.map(r => ({ ...r, output: null, thoughts: null, ms: null, acc: null })), null);
    setTk(`구간 ${windows.length}개 × 형식 ${formats.length}개의 입력 토큰을 셌습니다. (생성하지 않았으므로 답변 토큰·정확도는 없습니다)`);
  } catch (e) {
    setTk('오류: ' + explainError(e));
  } finally {
    renderAI();
  }
}

async function onRunTokens() {
  $('btn-tk-run').disabled = true;
  try {
    const { windows, labelNames, formats } = prepare();
    const calls = windows.length * formats.length;
    if (ai.source === 'teacher' && calls > quotaLeft()) throw new Error(`오늘 남은 사용 횟수(${quotaLeft()}회)보다 호출이 많습니다(${calls}회). 구간 수를 줄이세요.`);
    if (calls > 12 && !confirm(`Gemini를 ${calls}번 호출합니다. 계속할까요?`)) return;
    const { apiKey, model } = settings();
    const idOf = Object.fromEntries(labelIds().map(id => [labelName(id), id]));
    const rows = [];
    let done = 0;
    for (const fmt of formats) {
      const acc = { prompt: 0, output: 0, thoughts: 0, ms: 0, ok: 0 };
      for (const w of windows) {
        setTk(`Gemini에게 분류시키는 중… (${++done}/${calls})`);
        const r = await classifyWithLLM({ apiKey, model, labelNames, userText: buildPrompt(fmt.id, w.x, w.f, labelNames), system: CLASSIFY_SYSTEM });
        acc.prompt += r.usage.prompt;
        acc.output += r.usage.output;
        acc.thoughts += r.usage.thoughts;
        acc.ms += r.ms;
        if (idOf[r.label] === w.label) acc.ok++;
      }
      const n = windows.length;
      rows.push({ name: fmt.name, prompt: acc.prompt / n, output: acc.output / n, thoughts: acc.thoughts / n, ms: acc.ms / n, acc: acc.ok / n });
    }
    renderTokenTable(rows, localResult(windows));
    setTk(`구간 ${windows.length}개(라벨: ${labelNames.join(', ')})를 ${formats.length}가지 형식으로 분류시켰습니다.`);
  } catch (e) {
    setTk('오류: ' + explainError(e));
  } finally {
    renderAI();
  }
}

// 우리 모델이 같은 구간을 분류한 결과
function localResult(windows) {
  const m = state.model;
  if (!m) return null;
  const t0 = performance.now();
  let ok = 0;
  for (const w of windows) if (predictLabel(m, w.vec).label === w.label) ok++;
  return { name: `🧠 우리 모델 (${MODEL_TYPES[m.type].split(' ')[0]})`, prompt: 0, output: 0, thoughts: 0, ms: (performance.now() - t0) / windows.length, acc: ok / windows.length };
}

function renderTokenTable(rows, local) {
  const all = local ? [...rows, local] : rows;
  const minTotal = Math.min(...rows.map(r => r.prompt + (r.output ?? 0) + (r.thoughts ?? 0)));
  renderCards($('tk-list'), all.map(r => {
    const total = r.prompt + (r.output ?? 0) + (r.thoughts ?? 0);
    const isLocal = r === local;
    return {
      best: isLocal || (!local && total === minTotal),
      title: r.name,
      badge: isLocal ? '토큰 0' : total === minTotal && rows.length > 1 ? '가장 적은 토큰' : '',
      bar: r.acc === null ? null : { frac: r.acc, text: `정확도 ${pct(r.acc)}` },
      facts: [
        ['입력 토큰', num(r.prompt, 0)],
        ['출력 토큰', r.output === null ? '—' : num(r.output, 1)],
        ['생각 토큰', r.thoughts === null ? '—' : num(r.thoughts, 0)],
        ['구간당 합계', num(total, 0)],
        ['응답 시간', r.ms === null ? '—' : r.ms < 1 ? `${r.ms.toFixed(3)}ms` : `${num(r.ms, 0)}ms`],
        ['1시간 환산', `${num(total * HOUR_WINDOWS, 0)}`],
      ],
    };
  }));
  const raw = rows.find(r => r.name.startsWith('원시 파형 50'));
  const feat = rows.find(r => r.name.startsWith('특징'));
  const note = $('tk-note');
  note.hidden = !(raw && feat);
  if (raw && feat) {
    note.textContent = `💡 같은 정보를 숫자 200개 대신 특징 10개로 요약해서 보내면 입력 토큰이 약 ${(raw.prompt / feat.prompt).toFixed(1)}배 줄어듭니다. `
      + '좋은 요약(특징)은 정확도뿐 아니라 비용과 시간도 줄입니다. 학습된 모델은 곱셈·덧셈만 하므로 토큰 0, 응답은 1000분의 몇 ms입니다. (1시간 환산 = 2초마다 판정할 때 1800번)';
  }
}

export function initAI() {
  setBeforeCall(() => {
    if (ai.source !== 'teacher') return;
    if (quotaLimit() > 0 && quotaUsed() >= quotaLimit()) throw new Error(`오늘 교사 API 사용 횟수(${quotaLimit()}회)를 모두 썼습니다. 내일 다시 쓰거나 "내 API 키"를 선택하세요.`);
    writeLocal(quotaKey(), String(quotaUsed() + 1));
  });

  $('ps-key').value = ai.personalKey;
  $('ps-model').value = ai.personalModel;
  $('ps-remember').checked = !!readLocal('wr-ps-key');
  for (const r of document.querySelectorAll('input[name="ai-source"]')) {
    r.addEventListener('change', () => { ai.source = r.value; writeLocal('wr-ai-source', ai.source); renderAI(); });
  }
  for (const id of ['ps-key', 'ps-model', 'ps-remember']) $(id).addEventListener('change', readPersonal);
  $('btn-ps-models').addEventListener('click', () => psAction($('btn-ps-models'), async () => {
    readPersonal();
    if (!ai.personalKey) return setPs('API 키를 먼저 입력하세요.');
    setPs('모델 목록을 불러오는 중…');
    const names = await listModels(ai.personalKey);
    $('ps-model-list').replaceChildren(...names.map(n => { const o = document.createElement('option'); o.value = n; return o; }));
    setPs(`사용 가능한 모델 ${names.length}개를 불러왔습니다. 모델 칸을 눌러 선택하세요.`);
  }));
  $('btn-ps-test').addEventListener('click', () => psAction($('btn-ps-test'), async () => {
    readPersonal();
    if (!ai.personalKey || !ai.personalModel) return setPs('API 키와 모델을 모두 입력하세요.');
    setPs('연결 테스트 중…');
    const reply = await testConnection({ apiKey: ai.personalKey, model: ai.personalModel });
    setPs(`✔ 연결 성공 (응답: ${reply.slice(0, 40)})`);
  }));

  $('tk-formats').replaceChildren(...FORMATS.map(f => {
    const label = el('label');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.value = f.id;
    cb.checked = true;
    label.append(cb, f.name);
    return label;
  }));
  $('btn-ai').addEventListener('click', onAnalyze);
  $('btn-ai-train').addEventListener('click', onAnalyzeTraining);
  $('btn-ask').addEventListener('click', onAsk);
  $('btn-tk-count').addEventListener('click', onCountTokens);
  $('btn-tk-run').addEventListener('click', onRunTokens);
  on('account', renderAI);
  renderAI();
}
