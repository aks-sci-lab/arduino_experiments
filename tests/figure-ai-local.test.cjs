// LM Studio(로컬 LLM) 연결 시험: 가짜 LM Studio 서버로 요청 모양·재시도·오류 안내 확인
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = name => import(pathToFileURL(path.join(__dirname, '..', 'js', name)).href);

const SCENE = { note: '확인용', width: 400, height: 300, objects: [{ type: 'line', x1: 10, y1: 10, x2: 100, y2: 10, arrow: 'end' }] };

// replies: 요청마다 차례로 쓸 답 { status, error } 또는 { text, finish }
function fakeServer(replies) {
    const requests = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            if (req.url === '/v1/models') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ data: [{ id: 'text-embedding-nomic' }, { id: 'google/gemma-4-12b' }] }));
                return;
            }
            const json = JSON.parse(body);
            requests.push(json);
            const r = replies[Math.min(requests.length - 1, replies.length - 1)];
            if (r.status) {
                res.writeHead(r.status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: r.error } }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            // 일부러 조각을 줄 중간에서 나눠 보낸다
            const chunks = [];
            for (let i = 0; i < r.text.length; i += 7) chunks.push(r.text.slice(i, i + 7));
            let out = chunks.map(c => `data: ${JSON.stringify({ choices: [{ delta: { content: c }, finish_reason: null }] })}\n\n`).join('');
            out += `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: r.finish || 'stop' }] })}\n\ndata: [DONE]\n\n`;
            for (let i = 0; i < out.length; i += 50) res.write(out.slice(i, i + 50));
            res.end();
        });
    });
    return new Promise(ok => server.listen(0, '127.0.0.1', () => ok({ server, requests, base: `http://127.0.0.1:${server.address().port}/v1/` })));
}

test('모델 목록: 임베딩 모델은 빼고, 주소 끝 /v1/ 은 알아서 정리', async () => {
    const L = await load('figure-ai-local.js');
    const f = await fakeServer([{ text: '{}' }]);
    try { assert.deepEqual(await L.listModels(f.base), ['google/gemma-4-12b']); }
    finally { f.server.close(); }
});

test('그리기: 규칙은 첫 사용자 글에, 사진은 image_url, JSON 스키마·스트리밍', async () => {
    const L = await load('figure-ai-local.js');
    const f = await fakeServer([{ text: '<think>생각</think>```json\n' + JSON.stringify(SCENE) + '\n```' }]);
    let progress = 0;
    try {
        const r = await L.drawWithLocal({
            base: f.base, model: '', prompt: '화살표', mode: 'new', scene: { width: 640, height: 420, objects: [] },
            image: { media_type: 'image/jpeg', data: 'QUJD' }, onProgress: n => { progress = n; }
        });
        assert.equal(r.model, 'google/gemma-4-12b');       // 모델을 안 고르면 목록의 첫 모델
        assert.equal(r.note, '확인용');
        assert.equal(r.scene.objects.length, 1);
        assert.ok(progress > 50);
        const req = f.requests[0];
        assert.equal(req.stream, true);
        assert.equal(req.messages.length, 1);
        assert.equal(req.messages[0].role, 'user');
        assert.match(req.messages[0].content[0].text, /시험 문항에 넣을 그림/);
        assert.match(req.messages[0].content[0].text, /요청: 화살표/);
        assert.equal(req.messages[0].content[1].image_url.url, 'data:image/jpeg;base64,QUJD');
        assert.equal(req.response_format.type, 'json_schema');
    } finally { f.server.close(); }
});

test('스키마를 받지 않으면 빼고 다시, 깨진 JSON 은 한 번 고쳐 쓰게 함', async () => {
    const L = await load('figure-ai-local.js');
    const f = await fakeServer([
        { status: 400, error: "'response_format' is not supported" },
        { text: '{"objects": [ {"type": "line", ' },
        { text: JSON.stringify(SCENE) }
    ]);
    try {
        const r = await L.drawWithLocal({ base: f.base, model: 'm', prompt: 'x', mode: 'edit', scene: SCENE });
        assert.equal(r.scene.objects.length, 1);
        assert.equal(f.requests.length, 3);
        assert.ok(!('response_format' in f.requests[1]));
        assert.match(f.requests[0].messages[0].content[0].text, /고친 \*\*전체\*\* 그림 자료/);
        const fix = f.requests[2].messages;
        assert.equal(fix.length, 3);
        assert.equal(fix[1].role, 'assistant');
        assert.match(fix[2].content, /JSON 하나로만 다시/);
    } finally { f.server.close(); }
});

test('더하기 모드는 새 물체만, 그림판 크기는 지금 그림 것', async () => {
    const L = await load('figure-ai-local.js');
    const f = await fakeServer([{ text: JSON.stringify({ objects: [{ type: 'dot', x: 1, y: 1 }] }) }]);
    try {
        const r = await L.drawWithLocal({ base: f.base, model: 'm', prompt: 'x', mode: 'add', scene: SCENE });
        assert.deepEqual(r.scene, { width: 400, height: 300, objects: [{ type: 'dot', x: 1, y: 1 }] });
    } finally { f.server.close(); }
});

test('오류는 선생님이 할 일을 알려 줌 (대화 길이, 끝까지 못 받음, 서버 꺼짐)', async () => {
    const L = await load('figure-ai-local.js');
    let f = await fakeServer([{ status: 400, error: 'The number of tokens to keep from the initial prompt is greater than the context length' }]);
    try { await assert.rejects(L.drawWithLocal({ base: f.base, model: 'm', prompt: 'x', mode: 'new', scene: SCENE }), /Context Length 를 16384/); }
    finally { f.server.close(); }
    f = await fakeServer([{ text: '{"objects": [', finish: 'length' }]);
    try { await assert.rejects(L.drawWithLocal({ base: f.base, model: 'm', prompt: 'x', mode: 'new', scene: SCENE }), /끝까지 받지 못했습니다/); }
    finally { f.server.close(); }
    f = await fakeServer([{ text: '' }]);
    const base = f.base;
    await new Promise(ok => f.server.close(ok));
    await assert.rejects(L.listModels(base), /Enable CORS/);
});

test('그림 규칙: 답 읽기와 요청 글', async () => {
    const P = await load('figure-ai-prompt.js');
    assert.deepEqual(P.extractJson('설명 {"a": {"b": 1}} 끝'), { a: { b: 1 } });
    assert.throws(() => P.extractJson('그림 없음'), /찾지 못했습니다/);
    assert.deepEqual(P.toResult([{ type: 'dot' }], 'new', SCENE), { scene: { objects: [{ type: 'dot' }] }, note: '' });
    assert.match(P.requestText({ prompt: '', mode: 'new', scene: SCENE, hasImage: true }), /참고 그림을 바탕으로/);
});
