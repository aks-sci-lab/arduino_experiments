// 문항 출제용 그림 도구: 내 PC 의 LM Studio(로컬 LLM)로 그림 만들기
// LM Studio 의 OpenAI 호환 서버(기본 http://127.0.0.1:1234)에 브라우저가 바로 요청한다.
// 내용이 PC 밖으로 나가지 않고 요금도 없다. LM Studio 서버 설정에서 'Enable CORS' 를 켜야 한다.
import { SYSTEM, extractJson, requestText, toResult } from './figure-ai-prompt.js';

export const DEFAULT_BASE = 'http://127.0.0.1:1234';

// 그림 자료 모양만 정해 두는 JSON 스키마 (LM Studio 가 이 모양으로만 쓰게 함)
const SCHEMA = {
    type: 'json_schema',
    json_schema: {
        name: 'figure',
        schema: {
            type: 'object',
            properties: {
                note: { type: 'string' },
                width: { type: 'number' },
                height: { type: 'number' },
                font: { type: 'string', enum: ['serif', 'sans'] },
                objects: { type: 'array', items: { type: 'object' } }
            },
            required: ['objects']
        }
    }
};

function cleanBase(base) {
    return String(base || DEFAULT_BASE).trim().replace(/\/+$/, '').replace(/\/v1$/, '');
}

function connectError(base) {
    return new Error(`LM Studio(${base})에 연결하지 못했습니다.\n` +
        '① LM Studio 의 Developer(개발자) 화면에서 서버가 Running 인지\n' +
        '② 서버 설정의 ‘Enable CORS’ 가 켜져 있는지\n' +
        '③ 브라우저가 ‘로컬 네트워크 접근’ 허용을 물으면 허용했는지 확인해 주세요.');
}

async function readError(res) {
    let text = '';
    try { text = await res.text(); } catch (e) { /* 무시 */ }
    let m = text;
    try { const j = JSON.parse(text); m = (j.error && (j.error.message || j.error)) || j.message || text; } catch (e) { /* 글 그대로 */ }
    return String(m).slice(0, 400);
}

function explain(status, message) {
    if (/context|n_ctx|too long|exceed/i.test(message)) {
        return new Error('모델의 대화 길이(Context Length)가 모자랍니다. LM Studio 에서 모델을 불러올 때 Context Length 를 16384 이상으로 올려 주세요.\n(' + message + ')');
    }
    if (/image|vision|multimodal|mmproj/i.test(message)) {
        return new Error('이 모델은 사진을 읽지 못합니다. 참고 그림을 빼거나 사진을 볼 수 있는 모델(vision)을 골라 주세요.\n(' + message + ')');
    }
    if (/no models? loaded|not loaded|model.*not found/i.test(message)) {
        return new Error('LM Studio 에 불러온 모델이 없습니다. 모델을 먼저 불러온(Load) 뒤 다시 해 주세요.\n(' + message + ')');
    }
    return new Error(`LM Studio 오류 (${status}): ${message}`);
}

// 불러온 모델 목록 (id 배열)
export async function listModels(base, signal) {
    base = cleanBase(base);
    let res;
    try { res = await fetch(base + '/v1/models', { signal }); } catch (e) { if (e.name === 'AbortError') throw e; throw connectError(base); }
    if (!res.ok) throw explain(res.status, await readError(res));
    const j = await res.json();
    return (j.data || []).map(m => m.id).filter(id => typeof id === 'string' && !/embed/i.test(id));
}

// 스트리밍 답을 읽으며 받은 글자 수를 알린다
async function readStream(res, onProgress) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', text = '', finish = null;
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            let j;
            try { j = JSON.parse(data); } catch (e) { continue; }
            if (j.error) throw new Error(typeof j.error === 'string' ? j.error : j.error.message || 'LM Studio 오류');
            const c = j.choices && j.choices[0];
            if (!c) continue;
            if (c.delta && typeof c.delta.content === 'string') text += c.delta.content;
            if (c.finish_reason) finish = c.finish_reason;
            if (onProgress) onProgress(text.length);
        }
    }
    return { text, finish };
}

async function chat(base, body, signal, onProgress) {
    let res;
    try {
        res = await fetch(base + '/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal
        });
    } catch (e) { if (e.name === 'AbortError') throw e; throw connectError(base); }
    if (!res.ok) return { status: res.status, error: await readError(res) };
    return readStream(res, onProgress);
}

// 반환: { scene: 그림 자료(정리 전), note, model }
export async function drawWithLocal({ base, model, prompt, mode, scene, image, signal, onProgress }) {
    base = cleanBase(base);
    if (!model) {
        const ids = await listModels(base, signal);
        if (!ids.length) throw new Error('LM Studio 에 불러온 모델이 없습니다. 모델을 먼저 불러온(Load) 뒤 다시 해 주세요.');
        model = ids[0];
    }
    // Gemma 처럼 system 역할을 따로 받지 않는 모델이 있어 규칙을 첫 사용자 글에 함께 넣는다
    const content = [{ type: 'text', text: SYSTEM + '\n\n---\n\n' + requestText({ prompt, mode, scene, hasImage: !!image }) }];
    if (image) content.push({ type: 'image_url', image_url: { url: `data:${image.media_type};base64,${image.data}` } });
    const messages = [{ role: 'user', content }];
    const body = { model, messages, temperature: 0.2, max_tokens: 8192, stream: true, response_format: SCHEMA };

    let r = await chat(base, body, signal, onProgress);
    if (r.error && r.status === 400 && /response_format|json_schema|schema|grammar/i.test(r.error)) {
        // 스키마를 받지 않는 버전·모델이면 없이 다시
        delete body.response_format;
        r = await chat(base, body, signal, onProgress);
    }
    if (r.error) throw explain(r.status, r.error);
    if (r.finish === 'length') throw new Error('답이 너무 길어 끝까지 받지 못했습니다. 그림을 나누어 요청하거나 LM Studio 의 Context Length 를 늘려 주세요.');

    let data;
    try {
        data = extractJson(r.text);
    } catch (e) {
        // 작은 모델은 형식을 틀리기 쉬우므로 한 번만 고쳐 쓰게 한다
        const fix = {
            ...body,
            messages: [...messages, { role: 'assistant', content: r.text.slice(0, 20000) },
                { role: 'user', content: `위 답을 JSON 으로 읽을 수 없습니다 (${e.message}). 같은 그림을 형식에 맞는 JSON 하나로만 다시 쓰세요. 다른 글은 쓰지 마세요.` }]
        };
        const r2 = await chat(base, fix, signal, onProgress);
        if (r2.error) throw explain(r2.status, r2.error);
        data = extractJson(r2.text);
    }
    return { ...toResult(data, mode, scene), model };
}
