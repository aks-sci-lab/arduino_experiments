// Gemini API 연동 (관리자가 Firebase에 저장한 모델·API 키를 브라우저에서 사용)
// REST 엔드포인트를 직접 호출하므로 별도 SDK 없이 동작한다.

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const SYSTEM_PROMPT = `당신은 고등학교 물리학 실험 수업을 돕는 조교입니다.
학생들은 스마트폰 가속도 센서(중력 포함 가속도, accelerationIncludingGravity)의 크기 |a|를 4초 구간마다
10가지 특징(평균, 표준편차, 최소·최대, 90%-10% 폭, 평균 변화율, 케이던스, 주기성, 낮은/높은 구간 비율)으로 요약하고,
직접 모은 걷기/뛰기 데이터로 머신러닝 모델(로지스틱 회귀 또는 k-최근접 이웃)을 학습시켜 걷기와 뛰기를 구별합니다.
당신은 학생이 측정한 데이터와 학습 결과의 요약을 보고 판정의 물리적 근거와 모델의 상태를 설명합니다.
- 고등학생이 이해할 수 있는 한국어로, 핵심부터 간결하게 씁니다.
- 뉴턴 운동 법칙, 수직항력, 자유낙하(겉보기 무중력), 충격량-운동량 관계 등 교과 개념과 연결합니다.
- 숫자를 근거로 들 때는 제공된 값만 사용하고, 없는 값을 지어내지 않습니다.
- 데이터가 부족하거나 측정 방법에 문제가 보이면 솔직하게 지적하고 개선 방법을 제안합니다.
- 머신러닝 개념(라벨, 특징, 학습/테스트 분리, 과적합, 데이터 다양성)도 필요하면 쉬운 말로 연결합니다.
- 정답을 바로 주기보다 학생이 스스로 생각해 볼 수 있는 탐구 질문도 함께 제시합니다.`;

const str = description => ({ type: 'STRING', description });
const strList = description => ({ type: 'ARRAY', items: { type: 'STRING' }, description });

const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING', enum: ['정지', '걷기', '뛰기', '혼합', '판단 불가'] },
    confidence: { type: 'INTEGER', description: '0~100' },
    consistent_with_model: { type: 'BOOLEAN', description: '학습된 모델의 예측과 같은 결론인지(모델이 없으면 false)' },
    evidence: strList('수치를 근거로 한 판정 이유'),
    physics_explanation: str('관련 물리 개념 설명'),
    measurement_tips: strList('측정 개선 팁'),
    inquiry_questions: strList('학생용 탐구 질문'),
  },
  required: ['verdict', 'confidence', 'consistent_with_model', 'evidence', 'physics_explanation', 'measurement_tips', 'inquiry_questions'],
};

class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { apiKey, method = 'GET', body }) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'x-goog-api-key': apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new GeminiError('네트워크 연결에 실패했습니다. 인터넷 연결을 확인하세요.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GeminiError(data?.error?.message || `HTTP ${res.status}`, res.status);
  }
  return data;
}

async function generate({ apiKey, model, userText, schema }) {
  const data = await request(`/models/${encodeURIComponent(model)}:generateContent`, {
    apiKey,
    method: 'POST',
    body: {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        maxOutputTokens: 8192,
        ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
      },
    },
  });
  const block = data.promptFeedback?.blockReason;
  if (block) throw new GeminiError(`AI가 이 요청을 처리하지 않았습니다 (${block}). 질문을 바꿔 보세요.`, 0);
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || []).map(p => p.text || '').join('');
  if (!text) {
    throw new GeminiError(`AI가 답변을 만들지 못했습니다${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}.`, 0);
  }
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new GeminiError('답변이 너무 길어 중간에 끊겼습니다. 다시 시도하세요.', 0);
  }
  return text;
}

export async function analyzeWithGemini({ apiKey, model, summary }) {
  const userText = `다음은 학생이 측정한 가속도 데이터와 학습된 모델의 요약(JSON)입니다. 걷기/뛰기 판정과 근거를 분석해 주세요.

${JSON.stringify(summary, null, 2)}`;
  const text = await generate({ apiKey, model, userText, schema: ANALYSIS_SCHEMA });
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError('AI 응답 형식이 올바르지 않습니다. 다시 시도하세요.', 0);
  }
}

export async function askGemini({ apiKey, model, question, summary }) {
  const context = summary
    ? `참고용 측정 데이터 요약(JSON):\n${JSON.stringify(summary)}\n\n`
    : '아직 측정 데이터는 없습니다.\n\n';
  return generate({ apiKey, model, userText: `${context}학생 질문: ${question}` });
}

export async function interpretTraining({ apiKey, model, summary }) {
  const userText = `다음은 학생이 걷기/뛰기 분류 모델을 학습한 결과(JSON)입니다.
1) 정확도와 혼동 행렬을 쉬운 말로 해석하고, 2) 학습/테스트 정확도 차이로 과적합 여부를 판단하고,
3) (가중치가 있으면) 중요하게 본 특징이 물리적으로 말이 되는지 설명하고, 4) 데이터를 어떻게 더 모으면 좋을지 제안해 주세요.
데이터가 적거나 한쪽 라벨에 치우쳤다면 그 점도 지적해 주세요. 다섯 문단 이내로 답하세요.

${JSON.stringify(summary, null, 2)}`;
  return generate({ apiKey, model, userText });
}

// 이 키로 generateContent를 쓸 수 있는 모델 이름 목록
export async function listModels(apiKey) {
  const names = [];
  let pageToken = '';
  do {
    const data = await request(`/models?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`, { apiKey });
    for (const m of data.models || []) {
      if ((m.supportedGenerationMethods || []).includes('generateContent')) names.push(m.name.replace(/^models\//, ''));
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return names.sort();
}

export async function testConnection({ apiKey, model }) {
  const text = await generate({ apiKey, model, userText: '"OK"라고만 답하세요.' });
  return text.trim();
}

// 오류를 학생·관리자가 이해할 수 있는 메시지로 바꾼다.
export function explainError(err) {
  const status = err?.status;
  const msg = err?.message || String(err);
  if (status === 400 && /API key/i.test(msg)) return 'API 키가 올바르지 않습니다. 관리자에게 문의하세요.';
  if (status === 401 || status === 403) return 'API 키가 거부되었습니다(권한·리퍼러 제한 확인). 관리자에게 문의하세요.';
  if (status === 404) return '설정된 모델을 찾을 수 없습니다. 관리자가 모델을 다시 선택해야 합니다.';
  if (status === 429) return '사용 한도를 넘었거나 요청이 너무 많습니다. 잠시 후 다시 시도하세요.';
  if (status >= 500) return 'AI 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도하세요.';
  return msg;
}
