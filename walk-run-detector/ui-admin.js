// 🔧 관리자 탭: 교사 제공 Gemini API (모델·키·하루 사용 횟수·학생 허용)
import { listModels, testConnection, explainError } from './ai.js';
import { loadAIConfig, saveAIConfig, deleteAIConfig } from './accounts.js';
import { $, state, on, emit } from './state.js';

const setStatus = msg => { $('adm-status').textContent = msg; };

function fillForm() {
  const cfg = state.account.aiConfig;
  if (document.activeElement !== $('adm-model')) $('adm-model').value = cfg?.model || $('adm-model').value || '';
  if (cfg) {
    $('adm-allow').checked = !!cfg.allowStudents;
    $('adm-limit').value = String(cfg.dailyLimit ?? 0);
  }
  $('adm-key-hint').textContent = cfg?.apiKey
    ? `저장된 키: …${cfg.apiKey.slice(-4)} (바꾸려면 새 키를 입력, 비워 두면 유지)`
    : '저장된 키 없음';
}

// 입력칸에 새 키가 있으면 그것을, 없으면 저장된 키를 쓴다.
const currentKey = () => $('adm-key').value.trim() || state.account.aiConfig?.apiKey || '';

async function act(btn, task) {
  btn.disabled = true;
  try {
    await task();
  } catch (e) {
    setStatus('오류: ' + (e.code === 'permission-denied' ? '권한이 없습니다. Firestore 규칙이 배포되었는지 확인하세요.' : explainError(e)));
  } finally {
    btn.disabled = false;
  }
}

async function reload() {
  const r = await loadAIConfig();
  state.account.aiState = r.status;
  state.account.aiConfig = r.status === 'ok' ? r.config : null;
  emit('account');
}

export function initAdmin() {
  on('account', () => { if (state.account.isAdmin) fillForm(); });

  $('btn-adm-models').addEventListener('click', () => act($('btn-adm-models'), async () => {
    const apiKey = currentKey();
    if (!apiKey) return setStatus('API 키를 먼저 입력하세요.');
    setStatus('모델 목록을 불러오는 중…');
    const names = await listModels(apiKey);
    $('adm-model-list').replaceChildren(...names.map(n => { const o = document.createElement('option'); o.value = n; return o; }));
    setStatus(`사용 가능한 모델 ${names.length}개를 불러왔습니다. 모델 칸을 눌러 선택하세요.`);
  }));

  $('btn-adm-test').addEventListener('click', () => act($('btn-adm-test'), async () => {
    const apiKey = currentKey();
    const model = $('adm-model').value.trim();
    if (!apiKey || !model) return setStatus('API 키와 모델을 모두 입력하세요.');
    setStatus('연결 테스트 중…');
    setStatus(`✔ 연결 성공 (응답: ${(await testConnection({ apiKey, model })).slice(0, 40)})`);
  }));

  $('btn-adm-save').addEventListener('click', () => act($('btn-adm-save'), async () => {
    const apiKey = currentKey();
    const model = $('adm-model').value.trim();
    if (!apiKey || !model) return setStatus('API 키와 모델을 모두 입력하세요.');
    await saveAIConfig({
      apiKey, model, allowStudents: $('adm-allow').checked, dailyLimit: $('adm-limit').value, updatedBy: state.account.user.email,
    });
    $('adm-key').value = '';
    await reload();
    setStatus('✔ 저장했습니다.');
  }));

  $('btn-adm-clear').addEventListener('click', () => act($('btn-adm-clear'), async () => {
    if (!confirm('저장된 API 키와 모델 설정을 삭제할까요?')) return;
    await deleteAIConfig();
    $('adm-key').value = '';
    state.account.aiState = 'unset';
    state.account.aiConfig = null;
    emit('account');
    setStatus('삭제했습니다.');
  }));
}
