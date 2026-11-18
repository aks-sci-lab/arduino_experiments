// Firestore 보안 규칙: 보고서 AI (labClasses/{수업}/aiAsk·reports·aiDesk) + js/lab-store.js core 를 진짜 에뮬레이터에서
// 실행: tests/firestore-rules.test.cjs 와 같음 (FIRESTORE_EMULATOR_HOST + @firebase/rules-unit-testing 이 있을 때만, 없으면 건너뜀)
//   예) npx firebase emulators:exec --only firestore "node --test tests/report-ai-rules.test.cjs"
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const LabStore = require('../js/lab-store.js');

let RUT = null, firebase = null;
try { RUT = require('@firebase/rules-unit-testing'); firebase = require('firebase/compat/app'); require('firebase/compat/firestore'); } catch (e) { RUT = null; }
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = (!HOST && 'FIRESTORE_EMULATOR_HOST 없음') || (!RUT && '@firebase/rules-unit-testing 없음');

test('규칙: 보고서 AI — 학생은 답을 못 위조, 다른 기기·다른 조·남의 교사는 못 읽음 (에뮬레이터)', { skip, timeout: 120000 }, async () => {
    const [host, port] = HOST.split(':');
    const PID = 'demo-ai-' + Date.now();
    const env = await RUT.initializeTestEnvironment({ projectId: PID, firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
    const ctxs = {};
    const ctx = (uid, provider) => {
        if (ctxs[uid]) return ctxs[uid];
        const c = env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } });
        let fsx = null;
        return (ctxs[uid] = { firestore: () => fsx || (fsx = c.firestore()) });
    };
    const FB = firebase.default || firebase;
    const store = c => { const fsx = c.firestore(); return LabStore.firestoreDb({ firestore: () => fsx, raw: FB }); };
    const as = (uid, provider, auth) => { const core = LabStore.core(store(ctx(uid, provider))); return body => core.handle(body, auth); };
    const T1 = as('t1', 'google.com', { uid: 't1', google: true }), T2 = as('t2', 'google.com', { uid: 't2', google: true });
    const S1 = as('s1', 'anonymous', { uid: 's1' }), S2 = as('s2', 'anonymous', { uid: 's2' }), S3 = as('s3', 'anonymous', { uid: 's3' });
    const f = uid => ctx(uid, uid[0] === 't' ? 'google.com' : 'anonymous').firestore();
    const ts = () => FB.firestore.FieldValue.serverTimestamp();
    const later = () => new Date(Date.now() + 86400000);
    try {
        // 규칙 없이 보는 눈: 에뮬레이터 REST 에 'Bearer owner' (관리자)
        const count = async coll => { const r = await fetch('http://' + HOST + '/v1/projects/' + PID + '/databases/(default)/documents/' + coll, { headers: { Authorization: 'Bearer owner' } }); const j = await r.json(); return (j.documents || []).length; };
        const c = await T1({ action: 'createClass', ban: 2, nStudents: 6, groupSize: 3, exp: 'malus', aiLimit: 2 });
        assert.equal(c.ok, true, c.error); assert.equal(c.aiLimit, 2);
        const sp = c.space, g1 = c.groups[0].code, g2 = c.groups[1].code, base = 'labClasses/' + sp;
        // 한도 칸 범위는 규칙도 막음
        await RUT.assertFails(f('t1').doc('labClasses/c' + 'z'.repeat(23)).set({ owner: 't1', classCode: '2-1111', ban: 2, nStudents: 1, groupSize: 1, exp: 'malus', groups: [], aiLimit: 999, createdAt: new Date(), expireAt: later() }));

        // 학생 1(1조)이 질문 → core 로
        const q = await S1({ action: 'aiAsk', space: sp, group: g1, section: 'conclusion', sectionName: '결론 및 검토', prompt: '오차 원인 검토', attach: ['draft'], draft: '공기저항', device: 'nabc123' });
        assert.equal(q.ok, true, q.error);
        const askDoc = base + '/aiAsk/' + q.id;
        // 학생이 답 칸을 넣어 만들기·답 칸 고치기·상태 바꾸기 = 막힘
        const okAsk = { uid: 's1', group: g1, jo: 1, exp: 'malus', section: 'theory', sectionName: '이론', prompt: 'x', attach: [], draft: '', calc: '', device: '', status: 'wait', expireAt: later() };
        await RUT.assertFails(f('s1').doc(base + '/aiAsk/a' + 'b'.repeat(19)).set(Object.assign({}, okAsk, { createdAt: ts(), answer: '위조한 답' })));
        await RUT.assertFails(f('s1').doc(base + '/aiAsk/a' + 'c'.repeat(19)).set(Object.assign({}, okAsk, { createdAt: ts(), status: 'done' })));
        await RUT.assertFails(f('s1').doc(base + '/aiAsk/a' + 'd'.repeat(19)).set(Object.assign({}, okAsk, { createdAt: ts(), uid: 's2' })), '남의 uid 로');
        await RUT.assertFails(f('s1').doc(base + '/aiAsk/a' + 'e'.repeat(19)).set(Object.assign({}, okAsk, { createdAt: ts(), prompt: 'x'.repeat(1501) })), '프롬프트 너무 김');
        await RUT.assertSucceeds(f('s1').doc(base + '/aiAsk/a' + 'f'.repeat(19)).set(Object.assign({}, okAsk, { createdAt: ts() })));
        await RUT.assertFails(f('s1').doc(askDoc).update({ answer: '위조', status: 'done' }));
        await RUT.assertFails(f('s1').doc(askDoc).update({ used: 0 }));
        // 학생: 검증 메모는 됨
        assert.equal((await S1({ action: 'aiVerify', space: sp, id: q.id, verify: '데이터로 확인' })).ok, true);
        // 다른 학생(다른 기기·같은 조든 다른 조든)은 못 읽음·못 고침
        await RUT.assertFails(f('s2').doc(askDoc).get());
        await RUT.assertFails(f('s2').collection(base + '/aiAsk').get());
        await RUT.assertFails(f('s2').doc(askDoc).update({ verify: '남이 씀' }));
        assert.equal((await S2({ action: 'aiMine', space: sp })).asks.length, 0);
        // 본인 목록은 됨
        const mine = await S1({ action: 'aiMine', space: sp });
        assert.equal(mine.ok, true, mine.error); assert.equal(mine.asks.length, 2); assert.equal(mine.limit, 2);
        // 남의 교사: 목록·답 쓰기 못 함
        assert.equal((await T2({ action: 'aiList', space: sp })).ok, false);
        await RUT.assertFails(f('t2').doc(askDoc).update({ status: 'done', answer: '남의 교사' }));
        await RUT.assertFails(f('t2').collection(base + '/aiAsk').get());
        // 주인 교사: 잡기 → 두 번째 잡기는 규칙이 막음 → 답
        const L = await T1({ action: 'aiList', space: sp });
        assert.equal(L.ok, true, L.error); assert.equal(L.asks.length, 2); assert.equal(L.asks.find(x => x.id === q.id).draft, '공기저항');
        assert.equal((await T1({ action: 'aiClaim', space: sp, id: q.id })).ok, true);
        await RUT.assertFails(f('t1').doc(askDoc).update({ status: 'busy', busyAt: ts() }));
        // 주인 교사라도 학생 질문(프롬프트)은 못 바꿈
        await RUT.assertFails(f('t1').doc(askDoc).update({ prompt: '바꿈' }));
        assert.equal((await T1({ action: 'aiAnswer', space: sp, id: q.id, status: 'done', answer: '데이터의 어느 값이 근거인가요?', provider: 'claude', model: 'claude-sonnet-5-5', used: 1, limit: 2 })).ok, true);
        // 학생 목록은 실시간 듣기라 답이 들어오기까지 아주 잠깐 걸릴 수 있음
        let after = null;
        for (let i = 0; i < 30; i++) { after = (await S1({ action: 'aiMine', space: sp })).asks.find(x => x.id === q.id); if (after.answer) break; await new Promise(r => setTimeout(r, 100)); }
        assert.equal(after.answer, '데이터의 어느 값이 근거인가요?'); assert.equal(after.verify, '데이터로 확인'); assert.equal(after.used, 1);
        // 키 문제로 못 답하면 다시 '기다림'
        const q2 = await S1({ action: 'aiAsk', space: sp, group: g1, section: 'theory', prompt: '두 번째' });
        assert.equal((await T1({ action: 'aiClaim', space: sp, id: q2.id })).ok, true);
        assert.equal((await T1({ action: 'aiAnswer', space: sp, id: q2.id, status: 'wait' })).ok, true);
        assert.equal((await T1({ action: 'aiClaim', space: sp, id: q2.id })).ok, true, '기다림으로 돌아가면 다시 잡을 수 있음');

        // 켜짐 신호: 주인만 쓰고, 학생은 읽음
        assert.equal((await T1({ action: 'aiDeskBeat', space: sp, on: true, provider: 'claude', model: 'm' })).ok, true);
        assert.equal((await T2({ action: 'aiDeskBeat', space: sp, on: true })).ok, false);
        await RUT.assertFails(f('s1').doc(base + '/aiDesk/status').set({ on: true, provider: '', model: '', seenAt: ts(), expireAt: later() }));
        assert.equal((await S1({ action: 'aiMine', space: sp })).desk.fresh, true);

        // 보고서: 본인만 읽기·쓰기, 제출 뒤 잠김, 교사만 다시 열기
        assert.equal((await S1({ action: 'reportSave', space: sp, group: g1, device: 'nabc123', sections: { conclusion: '내 결론' }, external: { prompt: '외부' } })).ok, true);
        assert.equal((await S3({ action: 'reportSave', space: sp, group: g2, sections: { conclusion: '2조 결론' } })).ok, true);
        const rid = g1 + '~s1';
        await RUT.assertFails(f('s3').doc(base + '/reports/' + rid).get(), '다른 조 보고서 못 읽음');
        await RUT.assertFails(f('s2').doc(base + '/reports/' + rid).get(), '같은 조 다른 기기도 못 읽음');
        await RUT.assertFails(f('s3').collection(base + '/reports').get());
        await RUT.assertFails(f('s3').doc(base + '/reports/' + g1 + '~s3').set({ uid: 's3', group: g2, jo: 2, exp: 'malus', device: '', sections: {}, external: {}, submitted: false, updatedAt: ts(), expireAt: later() }), '문서 이름과 조가 다름');
        await RUT.assertFails(f('s3').doc(base + '/reports/' + rid).set({ uid: 's3', group: g1, jo: 1, exp: 'malus', device: '', sections: {}, external: {}, submitted: false, updatedAt: ts(), expireAt: later() }), '남의 보고서 덮어쓰기');
        assert.equal((await S2({ action: 'reportGet', space: sp, group: g1 })).report, null);
        assert.equal((await S1({ action: 'reportGet', space: sp, group: g1 })).report.sections.conclusion, '내 결론');
        assert.equal((await S1({ action: 'reportSave', space: sp, group: g1, sections: { conclusion: '최종' }, submit: true })).submitted, true);
        // 제출 뒤: core 를 건너뛰고 직접 써도 막힘
        await RUT.assertFails(f('s1').doc(base + '/reports/' + rid).set({ uid: 's1', group: g1, jo: 1, exp: 'malus', device: '', sections: { conclusion: '몰래 고침' }, external: {}, submitted: false, updatedAt: ts(), expireAt: later() }));
        assert.equal((await T2({ action: 'reportList', space: sp })).ok, false);
        await RUT.assertFails(f('t2').doc(base + '/reports/' + rid).get());
        const RL = await T1({ action: 'reportList', space: sp });
        assert.equal(RL.ok, true, RL.error); assert.equal(RL.reports.length, 2);
        // 교사는 글을 못 바꾸고 다시 열기만
        await RUT.assertFails(f('t1').doc(base + '/reports/' + rid).update({ sections: { conclusion: '교사가 씀' } }));
        assert.equal((await T1({ action: 'reportReopen', space: sp, id: rid })).ok, true);
        assert.equal((await S1({ action: 'reportSave', space: sp, group: g1, sections: { conclusion: '고침' } })).ok, true);
        // 수업 지우기: 질문·보고서·신호까지
        assert.ok(await count(base + '/aiAsk') >= 3, '지우기 전에는 있음');
        assert.equal((await T1({ action: 'deleteClass', space: sp })).ok, true);
        assert.equal(await count('labClasses'), 0);
        for (const sub of ['aiAsk', 'reports', 'aiDesk']) assert.equal(await count(base + '/' + sub), 0, sub);
    } finally {
        await env.cleanup();
    }
});
