// 문항 출제용 그림 도구: AI(Claude)로 그림 만들기
// 선생님이 넣은 API 키로 이 브라우저에서 Anthropic 에 바로 요청한다 (사이트 서버를 거치지 않음).
// AI 는 그림 자료(JSON)를 돌려주고, 화면은 그것을 보통 그림처럼 고칠 수 있게 넣는다.
import Anthropic from 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
import { SYSTEM, extractJson, requestText, toResult } from './figure-ai-prompt.js';

// 거절(refusal) 때 서버가 알아서 다른 모델로 이어 주는 기능을 쓸 수 있는 모델
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];

function userContent({ prompt, mode, scene, image }) {
    const parts = [];
    if (image) parts.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
    parts.push({ type: 'text', text: requestText({ prompt, mode, scene, hasImage: !!image }) });
    return parts;
}

function explain(e) {
    if (e instanceof Anthropic.AuthenticationError) return new Error('API 키가 맞지 않습니다. AI 설정의 키를 확인해 주세요.');
    if (e instanceof Anthropic.PermissionDeniedError) return new Error('이 API 키로는 이 모델을 쓸 수 없습니다. 다른 모델을 골라 보세요.');
    if (e instanceof Anthropic.RateLimitError) return new Error('요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.');
    if (e instanceof Anthropic.BadRequestError) {
        const m = String(e.message || '');
        if (/credit|balance/i.test(m)) return new Error('API 크레딧(잔액)이 부족합니다. Anthropic 콘솔에서 확인해 주세요.');
        return new Error('요청이 거절되었습니다: ' + m);
    }
    if (e instanceof Anthropic.APIConnectionError) return new Error('Anthropic 에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    if (e instanceof Anthropic.InternalServerError) return new Error('AI 서버가 바쁩니다. 잠시 뒤 다시 시도해 주세요.');
    return e;
}

// 반환: { scene: 그림 자료(정리 전), note }
export async function drawWithAI({ apiKey, model, prompt, mode, scene, image, signal }) {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
    const params = {
        model,
        max_tokens: 32000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: SYSTEM,
        messages: [{ role: 'user', content: userContent({ prompt, mode, scene, image }) }]
    };
    if (FALLBACK_MODELS.includes(model)) {
        params.betas = ['server-side-fallback-2026-07-01'];
        params.fallbacks = 'default';
    }
    let msg;
    try {
        msg = await client.beta.messages.stream(params, { signal }).finalMessage();
    } catch (e) {
        throw explain(e);
    }
    if (msg.stop_reason === 'refusal') throw new Error('AI 가 이 요청을 그리지 않았습니다. 요청 내용을 바꿔 보세요.');
    if (msg.stop_reason === 'max_tokens') throw new Error('그림이 너무 복잡해 끝까지 받지 못했습니다. 나누어 요청해 주세요.');
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return toResult(extractJson(text), mode, scene);
}
