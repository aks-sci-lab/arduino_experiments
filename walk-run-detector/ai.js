// Claude API 연동 (브라우저에서 사용자의 API 키로 직접 호출)
// SDK(@anthropic-ai/sdk 0.131.0)는 vendor/에 한 파일로 번들되어 있고, AI 기능을 쓸 때만 불러온다.

const SDK_URL = './vendor/anthropic-sdk-0.131.0.js';

// 거절(refusal) 시 서버 측 대체 모델 사용을 지원하는 모델
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

const SYSTEM_PROMPT = `당신은 고등학교 물리학 실험 수업을 돕는 조교입니다.
학생이 스마트폰 가속도 센서(중력 포함 가속도, accelerationIncludingGravity)로 측정한 데이터의 요약을 보고
걷기/뛰기/정지 판정과 그 물리적 근거를 설명합니다.
- 고등학생이 이해할 수 있는 한국어로, 핵심부터 간결하게 씁니다.
- 뉴턴 운동 법칙, 수직항력, 자유낙하(겉보기 무중력), 충격량-운동량 관계 등 교과 개념과 연결합니다.
- 숫자를 근거로 들 때는 제공된 값만 사용하고, 없는 값을 지어내지 않습니다.
- 데이터가 부족하거나 측정 방법에 문제가 보이면 솔직하게 지적하고 개선 방법을 제안합니다.
- 정답을 바로 주기보다 학생이 스스로 생각해 볼 수 있는 탐구 질문도 함께 제시합니다.`;

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['정지', '걷기', '뛰기', '혼합', '판단 불가'] },
    confidence: { type: 'integer', description: '0~100' },
    agrees_with_rule: { type: 'boolean', description: '앱의 규칙 기반 판정과 같은 결론인지' },
    evidence: { type: 'array', items: { type: 'string' }, description: '수치를 근거로 한 판정 이유' },
    physics_explanation: { type: 'string', description: '관련 물리 개념 설명' },
    measurement_tips: { type: 'array', items: { type: 'string' }, description: '측정 개선 팁' },
    inquiry_questions: { type: 'array', items: { type: 'string' }, description: '학생용 탐구 질문' },
  },
  required: ['verdict', 'confidence', 'agrees_with_rule', 'evidence', 'physics_explanation', 'measurement_tips', 'inquiry_questions'],
  additionalProperties: false,
};

let clientPromise = null;
let clientKey = null;

async function getClient(apiKey) {
  if (!clientPromise || clientKey !== apiKey) {
    clientKey = apiKey;
    clientPromise = import(SDK_URL).then(({ default: Anthropic }) =>
      // 학생 각자의 키를 브라우저에서 직접 사용하는 구조이므로 브라우저 호출을 허용한다.
      new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    );
  }
  return clientPromise;
}

async function callClaude({ apiKey, model, userText, outputFormat }) {
  const client = await getClient(apiKey);
  const params = {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'medium', ...(outputFormat ? { format: outputFormat } : {}) },
    messages: [{ role: 'user', content: userText }],
  };
  if (FALLBACK_MODELS.has(model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  const response = await client.beta.messages.create(params);
  if (response.stop_reason === 'refusal') {
    throw new Error('AI가 이 요청에 답하지 않았습니다. 질문을 바꿔 다시 시도해 보세요.');
  }
  return response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
}

export async function analyzeWithClaude({ apiKey, model, summary }) {
  const userText = `다음은 학생이 측정한 가속도 데이터 요약(JSON)입니다. 걷기/뛰기 판정과 근거를 분석해 주세요.

${JSON.stringify(summary, null, 2)}`;
  const text = await callClaude({
    apiKey,
    model,
    userText,
    outputFormat: { type: 'json_schema', schema: ANALYSIS_SCHEMA },
  });
  return JSON.parse(text);
}

export async function askClaude({ apiKey, model, question, summary }) {
  const context = summary
    ? `참고용 측정 데이터 요약(JSON):\n${JSON.stringify(summary)}\n\n`
    : '아직 측정 데이터는 없습니다.\n\n';
  return callClaude({ apiKey, model, userText: `${context}학생 질문: ${question}` });
}

// SDK 오류를 학생이 이해할 수 있는 메시지로 바꾼다.
export function explainError(err) {
  const status = err?.status;
  if (status === 401) return 'API 키가 올바르지 않습니다. 키를 다시 확인하세요.';
  if (status === 403) return '이 API 키로는 해당 모델을 사용할 권한이 없습니다.';
  if (status === 404) return '모델을 찾을 수 없습니다. 다른 모델을 선택해 보세요.';
  if (status === 429) return '요청이 너무 많거나 사용 한도를 넘었습니다. 잠시 후 다시 시도하세요.';
  if (status >= 500) return 'AI 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도하세요.';
  if (err instanceof TypeError) return '네트워크 연결 또는 SDK 로딩에 실패했습니다. 인터넷 연결을 확인하세요.';
  return err?.message || String(err);
}
