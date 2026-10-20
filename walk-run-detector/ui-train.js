// 🧠 학습 탭: 설정·학습 / 결과 / 학습곡선
import { FEATURES } from './analysis.js';
import { MODEL_TYPES, trainAndEvaluate, featureWeights, learningCurve } from './ml.js';
import { toRows, summarize } from './dataset.js';
import { drawCurve } from './charts.js';
import { labelName } from './labels.js';
import { $, state, on, el, dot, pct, trainingRecordings, allRecordings, setActiveModel } from './state.js';
import { currentTab, currentSub, showSub } from './tabs.js';
import { publishModel, loadClassModel } from './accounts.js';
import { topFeatures } from './ui-explore.js';

let curve = null;

const setStatus = msg => { $('train-status').textContent = msg; };

// ---------- 설정 ----------
function renderFeatureList() {
  const chosen = state.featureIdx;
  $('feat-list').replaceChildren(...FEATURES.map((f, i) => {
    const label = el('label');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.value = String(i);
    cb.checked = !chosen || chosen.includes(i);
    cb.addEventListener('change', () => { state.featureIdx = selectedFeatures(); });
    label.append(cb, `${f.name}`);
    label.title = f.hint;
    return label;
  }));
}

const selectedFeatures = () => [...$('feat-list').querySelectorAll('input:checked')].map(cb => Number(cb.value));

function setFeatures(idx) {
  state.featureIdx = idx;
  renderFeatureList();
}

function renderSummary() {
  const recs = trainingRecordings();
  const s = summarize(recs);
  const parts = Object.entries(s.byLabel).map(([id, n]) => `${labelName(id)} ${n}`).join(' · ');
  const excluded = allRecordings().length - recs.length;
  $('train-summary').textContent = `학습에 쓸 기록: ${s.total}개${parts ? ` (${parts})` : ''}, 구간 ${s.windows}개`
    + (excluded ? ` · 평가용 지정·시뮬레이션 ${excluded}개 제외됨` : '');
}

// ---------- 학습 ----------
async function train() {
  const recs = trainingRecordings();
  if (!recs.length) return setStatus('학습할 기록이 없습니다. 🧪 데이터 탭에서 먼저 기록하세요.');
  const featureIdx = selectedFeatures();
  if (!featureIdx.length) return setStatus('특징을 1개 이상 고르세요.');
  $('btn-train').disabled = true;
  setStatus('학습 중…');
  await new Promise(r => setTimeout(r, 30)); // 안내 문구가 먼저 그려지게 한다
  try {
    const rows = toRows(recs);
    const res = trainAndEvaluate({
      type: $('train-type').value,
      rows,
      featureIdx,
      testFrac: Number($('train-test').value),
      refitAll: $('train-refit').checked,
    });
    if (res.error) return setStatus(res.error);
    state.lastTraining = { rows, res, featureIdx };
    curve = null;
    if (!setActiveModel(res.model)) setStatus('⚠ 모델을 이 기기에 저장하지 못했습니다. 새로고침하면 사라집니다.');
    else setStatus(`학습 완료 — ${MODEL_TYPES[res.model.type]}, 특징 ${featureIdx.length}개. 📱 판정 탭에서 이 모델로 판정합니다.`);
    renderResult();
    showSub('train', 'result');
  } finally {
    $('btn-train').disabled = false;
  }
}

// ---------- 결과 ----------
function renderResult() {
  const t = state.lastTraining;
  $('result-empty').hidden = !!t;
  $('train-result').hidden = !t;
  if (!t) return;
  const { res } = t;
  const tiles = [
    ['학습 정확도', pct(res.train.accuracy), `${res.train.n}구간`],
    ['테스트 정확도', pct(res.test.accuracy), `${res.test.n}구간`],
    ['테스트 F1(평균)', pct(res.test.macroF1), '라벨 평균'],
    ['과적합 정도', pct(Math.max(0, res.train.accuracy - res.test.accuracy)), '학습−테스트'],
  ];
  $('train-metrics').replaceChildren(...tiles.map(([k, v, u]) => {
    const d = el('div', undefined, 'stat');
    d.append(el('span', k, 'k'), el('span', v, 'v'), el('span', u, 'u'));
    return d;
  }));

  const test = res.test;
  const pcHead = el('tr');
  for (const h of ['라벨', '정밀도', '재현율', 'F1', '표본']) pcHead.appendChild(el('th', h));
  const pcBody = el('tbody');
  for (const [id, m] of Object.entries(test.perClass).filter(([, m]) => m.support > 0 || m.precision > 0)) {
    const tr = el('tr');
    const c = el('td');
    c.append(dot(id), labelName(id));
    tr.append(c, el('td', pct(m.precision)), el('td', pct(m.recall)), el('td', pct(m.f1)), el('td', String(m.support)));
    pcBody.appendChild(tr);
  }
  const pcThead = el('thead');
  pcThead.appendChild(pcHead);
  $('perclass').replaceChildren(pcThead, pcBody);

  const cols = test.colLabels;
  const cHead = el('tr');
  cHead.appendChild(el('th', '실제 \\ 예측'));
  for (const c of cols) cHead.appendChild(el('th', labelName(c)));
  const cBody = el('tbody');
  for (const r of test.rowLabels) {
    const tr = el('tr');
    tr.appendChild(el('th', labelName(r)));
    for (const c of cols) {
      const td = el('td', String(test.confusion[r][c]));
      if (r === c) td.style.fontWeight = '700';
      tr.appendChild(td);
    }
    cBody.appendChild(tr);
  }
  const cThead = el('thead');
  cThead.appendChild(cHead);
  $('confusion').replaceChildren(cThead, cBody);

  const weights = featureWeights(res.model);
  $('weights-box').hidden = !weights;
  if (weights) {
    const maxAbs = Math.max(...weights.flatMap(w => Object.values(w.byLabel).map(Math.abs)), 1e-6);
    const labels = res.model.labels;
    const head = el('tr');
    head.appendChild(el('th', '특징', 'left'));
    for (const l of labels) head.appendChild(el('th', labelName(l)));
    const body = el('tbody');
    const order = [...weights].sort((a, b) => Math.max(...Object.values(b.byLabel).map(Math.abs)) - Math.max(...Object.values(a.byLabel).map(Math.abs)));
    for (const w of order) {
      const f = FEATURES.find(x => x.key === w.key);
      const tr = el('tr');
      const name = el('td', f.name, 'left');
      name.title = f.hint;
      tr.appendChild(name);
      for (const l of labels) {
        const v = w.byLabel[l];
        const td = el('td', (v >= 0 ? '+' : '') + v.toFixed(2));
        td.style.background = `color-mix(in srgb, var(${v >= 0 ? '--c1' : '--c2'}) ${Math.round((Math.abs(v) / maxAbs) * 55)}%, transparent)`;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    const thead = el('thead');
    thead.appendChild(head);
    $('weights').replaceChildren(thead, body);
  }
}

// ---------- 학습곡선 ----------
async function drawCurveNow() {
  const t = state.lastTraining;
  const rows = t?.rows ?? toRows(trainingRecordings());
  if (!rows.length) return ($('curve-status').textContent = '학습할 기록이 없습니다.');
  const featureIdx = selectedFeatures();
  if (!featureIdx.length) return ($('curve-status').textContent = '특징을 1개 이상 고르세요.');
  $('btn-curve').disabled = true;
  $('curve-status').textContent = '계산 중… (모델을 여러 번 학습합니다)';
  await new Promise(r => setTimeout(r, 30));
  try {
    curve = learningCurve({ type: $('train-type').value, rows, featureIdx, testFrac: Number($('train-test').value) });
    if (!curve) return ($('curve-status').textContent = '라벨마다 기록이 2개 이상 필요합니다.');
    const last = curve[curve.length - 1];
    $('curve-status').textContent = `기록 ${curve[0].n}개 → ${last.n}개: 테스트 정확도 ${pct(curve[0].mean)} → ${pct(last.mean)}`;
    drawCurveIfVisible();
  } finally {
    $('btn-curve').disabled = false;
  }
}

function drawCurveIfVisible() {
  if (currentTab() === 'train' && currentSub('train') === 'curve') drawCurve($('curve-chart'), curve);
}

// ---------- 반 모델 ----------
async function publish() {
  if (!state.model) return setStatus('먼저 모델을 학습하세요.');
  if (!confirm('이 모델을 학급 전체의 공용 모델로 게시할까요? 기존 공용 모델은 대체됩니다.')) return;
  try {
    await publishModel(state.model, state.account.user.email);
    setStatus('✔ 반 모델로 게시했습니다. 학생들은 "반 모델 불러오기"로 사용할 수 있습니다.');
  } catch (e) {
    setStatus('게시 실패: ' + (e.code === 'permission-denied' ? '권한이 없습니다. Firestore 규칙을 배포했는지 확인하세요.' : e.message));
  }
}

export async function loadClass(silent = false) {
  if (!state.account.user) return setStatus('반 모델은 로그인한 뒤에 불러올 수 있습니다.');
  try {
    const m = await loadClassModel();
    if (!m || m.v === undefined) return silent || setStatus('게시된 반 모델이 아직 없습니다.');
    setActiveModel(m);
    if (!silent) setStatus('✔ 반 모델을 불러와 사용합니다.');
  } catch (e) {
    if (!silent) setStatus('불러오기 실패: ' + (e.code === 'permission-denied' ? '권한이 없습니다.' : e.message));
  }
}

export function initTrain() {
  renderFeatureList();
  $('btn-feat-all').addEventListener('click', () => setFeatures(null));
  $('btn-feat-top').addEventListener('click', () => {
    const top = topFeatures(3);
    if (!top.length) return setStatus('먼저 🔍 탐색 탭에서 두 라벨을 비교해 특징 순위를 확인하세요.');
    setFeatures(top);
    setStatus('탐색 탭 순위 상위 3개 특징을 선택했습니다.');
  });
  $('btn-train').addEventListener('click', train);
  $('btn-curve').addEventListener('click', drawCurveNow);
  $('btn-class-load').addEventListener('click', () => loadClass(false));
  $('btn-class-publish').addEventListener('click', publish);
  $('train-sim').addEventListener('change', renderSummary);
  on('recordings', renderSummary);
  on('tab', renderSummary);
  on('subtab', drawCurveIfVisible);
  on('tab', drawCurveIfVisible);
  window.addEventListener('resize', drawCurveIfVisible);
  renderSummary();
  renderResult();
}
