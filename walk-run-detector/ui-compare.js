// 🏆 조별 비교 탭: 모델 게시 / 같은 평가 기록으로 채점해 순위 매기기
import { toRows } from './dataset.js';
import { MODEL_TYPES, MODEL_VERSION, evaluate, modelCost } from './ml.js';
import { labelIds, labelName } from './labels.js';
import { $, state, on, el, dot, pct, writeLocal, evalRecordings, setCloudRecordings, renderCards } from './state.js';
import { publishGroupModel, loadGroupModels, deleteGroupModel, currentUid, loadCloudRecordings } from './accounts.js';

const setGm = msg => { $('gm-status').textContent = msg; };
const setCmp = msg => { $('cmp-status').textContent = msg; };
const needLogin = () => !state.account.user;

// ---------- 게시 ----------
function renderPublish() {
  $('group-name').value = state.group;
  const m = state.model;
  const box = $('cmp-model-line');
  if (!m) {
    box.className = 'model-line empty';
    box.textContent = '⚠ 게시할 모델이 없습니다. 🧠 학습 탭에서 먼저 학습하세요.';
  } else {
    box.className = 'model-line';
    const t = m.metrics?.test;
    box.textContent = `🧠 ${MODEL_TYPES[m.type]} · 라벨 ${m.labels.map(labelName).join('/')} · 특징 ${m.features.length}개 · 기록 ${m.nRecordings ?? '?'}개`
      + (t ? ` · 자체 테스트 정확도 ${pct(t.accuracy)}` : '');
  }
}

async function publish() {
  if (needLogin()) return setGm('게시하려면 오른쪽 위에서 로그인하세요.');
  if (!state.model) return setGm('게시할 모델이 없습니다. 먼저 학습하세요.');
  const group = $('group-name').value.trim();
  if (!group) return setGm('조 이름을 입력하세요.');
  state.group = group;
  writeLocal('wr-group', group);
  try {
    await publishGroupModel(group, state.model);
    setGm(`✔ "${group}" 이름으로 게시했습니다. 🏆 순위 비교에서 확인하세요.`);
  } catch (e) {
    setGm('게시 실패: ' + (e.code === 'permission-denied' ? '권한이 없습니다. Firestore 규칙을 배포했는지 확인하세요.' : e.message));
  }
}

async function unpublish() {
  if (needLogin()) return setGm('로그인하세요.');
  try {
    await deleteGroupModel(currentUid());
    setGm('게시를 취소했습니다.');
  } catch (e) {
    setGm('취소 실패: ' + e.message);
  }
}

// ---------- 비교 ----------
function renderLabelChips() {
  const checked = new Set([...$('cmp-labels').querySelectorAll('input:checked')].map(cb => cb.value));
  const first = checked.size === 0;
  $('cmp-labels').replaceChildren(...labelIds().map(id => {
    const label = el('label');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.value = id;
    cb.checked = first ? ['walk', 'run'].includes(id) : checked.has(id);
    label.append(cb, dot(id), labelName(id));
    return label;
  }));
}

async function evalRows() {
  const kind = $('cmp-eval').value;
  if (kind !== 'local' && !state.cloudRecs.length && state.account.user) {
    setCmp('학급 데이터를 불러오는 중…');
    setCloudRecordings(await loadCloudRecordings());
  }
  const recs = kind === 'teacher' ? evalRecordings() : kind === 'cloud' ? state.cloudRecs : state.recordings;
  return { kind, recs };
}

const recallText = (ev, labels) => labels.map(l => `${labelName(l)} ${pct(ev.perClass[l]?.recall ?? 0)}`).join(' · ');

async function compare() {
  if (needLogin()) return setCmp('모든 조의 모델을 불러오려면 로그인하세요.');
  const labels = [...$('cmp-labels').querySelectorAll('input:checked')].map(cb => cb.value);
  if (labels.length < 2) return setCmp('비교할 라벨을 2개 이상 고르세요.');
  $('btn-compare').disabled = true;
  try {
    const { kind, recs } = await evalRows();
    const rows = toRows(recs).filter(r => labels.includes(r.y));
    const present = new Set(rows.map(r => r.y));
    if (!rows.length || labels.some(l => !present.has(l))) {
      return setCmp(kind === 'teacher'
        ? '평가용 기록에 선택한 라벨의 데이터가 부족합니다. 교사가 라벨마다 평가용 기록을 지정해야 합니다. (🧪 데이터 → 내 데이터)'
        : '평가에 쓸 기록에 선택한 라벨의 데이터가 부족합니다.');
    }
    setCmp('조별 모델을 불러오는 중…');
    const entries = (await loadGroupModels()).map(g => ({ ...g, mine: g.uid === currentUid() }));
    if (state.model) entries.push({ uid: 'local', group: '(미게시) 내 현재 모델', model: state.model, testAccuracy: state.model.metrics?.test?.accuracy ?? null, mine: true, local: true });
    const results = [];
    for (const e of entries) {
      if (e.model.v !== MODEL_VERSION) continue;      // 이전 형식의 모델은 채점하지 않는다
      const ev = evaluate(e.model, rows);
      results.push({ ...e, ev, cost: modelCost(e.model, rows.map(r => r.x)) });
    }
    results.sort((a, b) => b.ev.accuracy - a.ev.accuracy || b.ev.macroF1 - a.ev.macroF1);
    renderTable(results, labels);
    const nRec = new Set(rows.map(r => r.group)).size;
    setCmp(`평가 기록 ${nRec}개(구간 ${rows.length}개)로 모델 ${results.length}개를 채점했습니다.`
      + (kind === 'cloud' ? ' ⚠ 학습에 쓴 기록이 섞여 있어 점수가 실제보다 높게 나올 수 있습니다.' : '')
      + (kind === 'local' ? ' ⚠ 내 기록으로 채점한 값이라 다른 사람의 데이터에서는 다를 수 있습니다.' : ''));
  } catch (e) {
    setCmp('비교 실패: ' + (e.code === 'permission-denied' ? '권한이 없습니다. Firestore 규칙을 배포했는지 확인하세요.' : e.message));
  } finally {
    $('btn-compare').disabled = false;
  }
}

function renderTable(results, labels) {
  renderCards($('cmp-list'), results.map((r, i) => {
    const missing = labels.filter(l => !r.model.labels.includes(l));
    const gap = r.testAccuracy === null ? null : Math.round((r.ev.accuracy - r.testAccuracy) * 100);
    return {
      best: i === 0,
      title: `${i === 0 ? '🥇' : i + 1 + '위'} ${r.group}`,
      badge: r.mine && !r.local ? '내 모델' : '',
      sub: `${MODEL_TYPES[r.model.type].split(' ')[0]} · 특징 ${r.model.features.length}개 · 학습 기록 ${r.model.nRecordings ?? '?'}개`,
      bar: { frac: r.ev.accuracy, text: `평가 정확도 ${pct(r.ev.accuracy)}` },
      facts: [
        ['F1(평균)', pct(r.ev.macroF1)],
        ['자체 정확도', r.testAccuracy === null ? '—' : `${pct(r.testAccuracy)} (${gap >= 0 ? '+' : ''}${gap}%p)`],
        ['모델 크기', `${(r.cost.bytes / 1024).toFixed(1)}KB`],
        ['추론 1회', `${r.cost.msPerPrediction.toFixed(3)}ms · 토큰 0`],
      ],
      note: missing.length ? `⚠ ${missing.map(labelName).join(', ')} 라벨이 없는 모델입니다` : `라벨별 재현율: ${recallText(r.ev, labels)}`,
    };
  }));
}

export function initCompare() {
  renderPublish();
  renderLabelChips();
  $('btn-gm-publish').addEventListener('click', publish);
  $('btn-gm-delete').addEventListener('click', unpublish);
  $('btn-compare').addEventListener('click', compare);
  on('model', renderPublish);
  on('labels', renderLabelChips);
  on('recordings', renderLabelChips);
}

