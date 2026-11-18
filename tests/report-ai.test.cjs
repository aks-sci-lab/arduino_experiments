// 보고서 AI (js/report-ai.js 요청 모양·프롬프트, js/lab-store.js 의 aiAsk…reportSave 를 메모리 DB 로)
const test = require('node:test');
const assert = require('node:assert/strict');
const RA = require('../js/report-ai.js');
const LabStore = require('../js/lab-store.js');

test('프롬프트: 대신 써 주지 않기·계산하지 않기·질문 2~3개, 안 고른 참고 자료는 보내지 않음', () => {
    const p = RA.buildPrompt({ exp: 'malus', section: 'conclusion', sectionName: '결론 및 검토', prompt: '오차 원인 검토해 줘', attach: ['calc'], draft: '비밀 초안', calc: 'R² = 0.98' }, '말루스 법칙 실험');
    assert.match(p.system, /대신 써 주지 않는다/);
    assert.match(p.system, /계산하지 않는다/);
    assert.match(p.system, /질문 2~3개/);
    assert.match(p.system, /데이터 근거/);   // 결론 항목 안내
    assert.match(p.user, /\[실험\] 말루스 법칙 실험/);
    assert.match(p.user, /R² = 0\.98/);
    assert.doesNotMatch(p.user, /비밀 초안/);
    assert.match(p.user, /\[학생 초안\]\n\(함께 보내지 않음\)/);
    // 항목마다 다른 안내
    assert.match(RA.buildPrompt({ section: 'theory', prompt: 'x', attach: [] }).system, /빠졌거나/);
    assert.match(RA.buildPrompt({ section: 'method', prompt: 'x', attach: [] }).system, /통제 변인/);
    assert.match(RA.buildPrompt({ section: 'analysis', prompt: 'x', attach: [] }).system, /계산은 하지 않는다/);
});

test('요청 모양: Gemini ?key=, Claude 브라우저 헤더, GPT Bearer', () => {
    const g = RA.chatRequest('gemini', 'gemini-3.8-flash', 'AIzaKEY', 'S', 'U');
    assert.match(g.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent\?key=AIzaKEY$/);
    assert.equal(JSON.parse(g.init.body).systemInstruction.parts[0].text, 'S');
    const c = RA.chatRequest('claude', 'claude-sonnet-5-5', 'sk-ant-x', 'S', 'U');
    assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(c.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.equal(c.init.headers['x-api-key'], 'sk-ant-x');
    assert.equal(JSON.parse(c.init.body).system, 'S');
    const o = RA.chatRequest('gpt', 'gpt-6-luna', 'sk-x', 'S', 'U');
    assert.equal(o.init.headers.Authorization, 'Bearer sk-x');
    assert.equal(JSON.parse(o.init.body).messages[0].role, 'system');
    // 답 읽기
    assert.equal(RA.parseAnswer('gemini', { candidates: [{ content: { parts: [{ text: '생각', thought: true }, { text: '답' }] } }] }), '답');
    assert.equal(RA.parseAnswer('claude', { content: [{ type: 'text', text: '답2' }] }), '답2');
    assert.equal(RA.parseAnswer('gpt', { choices: [{ message: { content: '답3' } }] }), '답3');
    assert.deepEqual(RA.parseModels('gemini', { models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding-1', supportedGenerationMethods: ['embedContent'] }] }), ['gemini-3.8-flash']);
});

test('오류를 쉬운 말로 + callAI (가짜 fetch)', async () => {
    assert.match(RA.friendlyHttp('gemini', 400, { error: { message: 'API key not valid', status: 'INVALID_ARGUMENT' } }), /API 키가 틀렸/);
    assert.match(RA.friendlyHttp('claude', 429, { error: { type: 'rate_limit_error' } }), /한도/);
    assert.match(RA.friendlyHttp('gpt', 429, { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } }), /한도/);
    assert.match(RA.friendlyHttp('claude', 529, {}), /바빠요/);
    const fake = (status, body) => async () => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
    const ok = await RA.callAI({ provider: 'claude', model: 'm', key: 'k', system: 's', user: 'u', fetch: fake(200, { content: [{ type: 'text', text: '좋아요' }] }) });
    assert.deepEqual(ok, { ok: true, text: '좋아요' });
    const bad = await RA.callAI({ provider: 'gpt', model: 'm', key: 'k', system: 's', user: 'u', fetch: fake(401, { error: { message: 'Incorrect API key' } }) });
    assert.equal(bad.ok, false); assert.equal(bad.status, 401); assert.match(bad.error, /API 키/);
    const net = await RA.callAI({ provider: 'gemini', model: 'm', key: 'k', system: 's', user: 'u', fetch: async () => { throw new TypeError('Failed to fetch'); } });
    assert.match(net.error, /연결하지 못했어요/); assert.equal(net.status, 0);
    assert.match((await RA.callAI({ provider: 'gemini', model: 'm', key: '' })).error, /키를 넣어/);
});

test('저장소: 질문 → 교사 답 → 학생 확인, 다른 기기·다른 교사 막힘, 보고서 제출 뒤 잠김', async () => {
    const db = LabStore.memoryDb(), core = LabStore.core(db);
    const T = { uid: 't1', google: true }, T2 = { uid: 't2', google: true }, S1 = { uid: 's1' }, S2 = { uid: 's2' };
    const c = await core.handle({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'malus', aiLimit: 2 }, T);
    assert.equal(c.ok, true, c.error); assert.equal(c.aiLimit, 2);
    const g1 = c.groups[0].code, g2 = c.groups[1].code, sp = c.space;
    assert.equal((await core.handle({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'malus', aiLimit: 201 }, T)).ok, false);
    const q = await core.handle({ action: 'aiAsk', space: sp, group: g1, section: 'conclusion', sectionName: '결론', prompt: '검토해 줘', attach: ['draft', 'calc', 'evil'], draft: '내 글', calc: 'g=9.7', answer: '위조' }, S1);
    assert.equal(q.ok, true, q.error);
    const doc = db.docs.get('labClasses/' + sp + '/aiAsk/' + q.id);
    assert.equal(doc.status, 'wait'); assert.equal(doc.answer, undefined, '학생이 답 칸을 못 씀'); assert.deepEqual(doc.attach, ['draft', 'calc']);
    assert.equal((await core.handle({ action: 'aiAsk', space: sp, group: g1, section: 'conclusion', prompt: '  ' }, S1)).ok, false, '빈 프롬프트');
    assert.equal((await core.handle({ action: 'aiAsk', space: sp, group: '9-9-9999', section: 'conclusion', prompt: 'x' }, S1)).ok, false, '수업에 없는 조');
    // 다른 기기(s2)는 내 질문을 못 봄
    assert.equal((await core.handle({ action: 'aiMine', space: sp }, S2)).asks.length, 0);
    // 교사: 다른 교사는 못 봄
    assert.equal((await core.handle({ action: 'aiList', space: sp }, T2)).ok, false);
    const L = await core.handle({ action: 'aiList', space: sp }, T);
    assert.equal(L.asks.length, 1); assert.equal(L.asks[0].draft, '내 글'); assert.equal(L.limit, 2);
    assert.equal((await core.handle({ action: 'aiClaim', space: sp, id: q.id }, T)).ok, true);
    assert.equal((await core.handle({ action: 'aiClaim', space: sp, id: q.id }, T)).ok, false, '두 번 잡지 못함');
    assert.equal((await core.handle({ action: 'aiAnswer', space: sp, id: q.id, status: 'done', answer: '좋은 질문이에요', used: 1, limit: 2, provider: 'claude', model: 'm' }, T)).ok, true);
    const mine = await core.handle({ action: 'aiMine', space: sp }, S1);
    assert.equal(mine.asks[0].answer, '좋은 질문이에요'); assert.equal(mine.asks[0].used, 1); assert.equal(mine.asks[0].draft, undefined);
    assert.equal(mine.desk.fresh, false);
    await core.handle({ action: 'aiDeskBeat', space: sp, on: true, provider: 'claude', model: 'm' }, T);
    assert.equal((await core.handle({ action: 'aiMine', space: sp }, S1)).desk.fresh, true);
    assert.equal((await core.handle({ action: 'aiDeskBeat', space: sp, on: true }, T2)).ok, false);
    // 검증 메모: 본인만
    assert.equal((await core.handle({ action: 'aiVerify', space: sp, id: q.id, verify: '교과서로 확인' }, S2)).ok, false);
    assert.equal((await core.handle({ action: 'aiVerify', space: sp, id: q.id, verify: '교과서로 확인' }, S1)).ok, true);
    assert.equal(db.docs.get('labClasses/' + sp + '/aiAsk/' + q.id).verify, '교과서로 확인');
    // 보고서
    assert.equal((await core.handle({ action: 'reportSave', space: sp, group: g1, sections: { theory: '이론 글', conclusion: '결론' }, external: { prompt: 'p', adopted: 'a', verify: 'v' } }, S1)).ok, true);
    assert.equal((await core.handle({ action: 'reportGet', space: sp, group: g1 }, S2)).report, null, '다른 기기 보고서는 못 읽음');
    assert.equal((await core.handle({ action: 'reportGet', space: sp, group: g1 }, S1)).report.sections.theory, '이론 글');
    assert.equal((await core.handle({ action: 'reportSave', space: sp, group: g1, sections: { 'Bad Key': 'x' } }, S1)).ok, false);
    assert.equal((await core.handle({ action: 'reportSave', space: sp, group: g1, sections: { conclusion: '최종' }, submit: true }, S1)).submitted, true);
    assert.match((await core.handle({ action: 'reportSave', space: sp, group: g1, sections: { conclusion: '고침' } }, S1)).error, /이미 최종 제출/);
    const RL = await core.handle({ action: 'reportList', space: sp }, T);
    assert.equal(RL.reports.length, 1); assert.equal(RL.reports[0].submitted, true);
    assert.equal((await core.handle({ action: 'reportReopen', space: sp, id: RL.reports[0].id }, T)).ok, true);
    assert.equal((await core.handle({ action: 'reportSave', space: sp, group: g1, sections: { conclusion: '고침' } }, S1)).ok, true);
    // CSV: 프롬프트·답·메모·외부 기록
    const all = (await core.handle({ action: 'aiList', space: sp }, T)).asks, reps = (await core.handle({ action: 'reportList', space: sp }, T)).reports;
    const csv = LabStore.aiCsv(all, reps.map(r => Object.assign({}, r, { external: { prompt: '외부 질문', adopted: '채택', verify: '' } })), c.groups);
    assert.equal(csv.csv.charCodeAt(0), 0xFEFF); assert.equal(csv.rows, 2);
    assert.match(csv.csv, /검토해 줘/); assert.match(csv.csv, /좋은 질문이에요/); assert.match(csv.csv, /교과서로 확인/); assert.match(csv.csv, /외부 AI/);
    const rc = LabStore.reportCsv(reps, c.groups, [{ key: 'theory', name: '이론' }]);
    assert.match(rc.csv, /이론/); assert.match(rc.csv, /고침/);   // 학생 화면은 늘 모든 항목을 함께 보냄
    // 한도 0 수업은 질문을 못 만듦
    const c0 = await core.handle({ action: 'createClass', ban: 3, nStudents: 2, groupSize: 2, exp: 'malus', aiLimit: 0 }, T);
    assert.match((await core.handle({ action: 'aiAsk', space: c0.space, group: c0.groups[0].code, section: 'theory', prompt: 'x' }, S1)).error, /끄셨어요/);
    // 수업 지우면 질문·보고서도 지움
    await core.handle({ action: 'deleteClass', space: sp }, T);
    assert.equal([...db.docs.keys()].filter(p => p.indexOf(sp) >= 0).length, 0);
    void g2;
});
