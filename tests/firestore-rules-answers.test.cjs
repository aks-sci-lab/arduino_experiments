// Firestore 규칙 — 📱 응답 물음 (③): 수업 문서 lesson.q 모양(주인만), 답 labClasses/{수업}/answers/{key~자리}: 띄운 물음에만·자기 uid 문서만·2초·남의 답 못 읽음·주인만 목록
// 실행: FIRESTORE_EMULATOR_HOST 가 있고 @firebase/rules-unit-testing·firebase 를 찾을 수 있을 때만 (없으면 건너뜀)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const LabStore = require('../js/lab-store.js');

let RUT = null, firebase = null;
try { RUT = require('@firebase/rules-unit-testing'); firebase = require('firebase/compat/app'); require('firebase/compat/firestore'); } catch (e) { RUT = null; }
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = (!HOST && 'FIRESTORE_EMULATOR_HOST 없음') || (!RUT && '@firebase/rules-unit-testing 없음');

test('규칙: 응답 물음 lesson.q · answers (에뮬레이터)', { skip, timeout: 120000 }, async () => {
    const [host, port] = HOST.split(':');
    const env = await RUT.initializeTestEnvironment({ projectId: 'demo-ans-' + Date.now(), firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
    const ctxs = {};
    const ctx = (uid, provider) => { if (!ctxs[uid]) { const c = env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }); let f = null; ctxs[uid] = { firestore: () => f || (f = c.firestore()) }; } return ctxs[uid]; };
    const as = (uid, provider, auth) => { const fsx = ctx(uid, provider).firestore(); const core = LabStore.core(LabStore.firestoreDb({ firestore: () => fsx, raw: firebase.default || firebase })); return b => core.handle(b, auth); };
    const T1 = as('t1', 'google.com', { uid: 't1', google: true }), T2 = as('t2', 'google.com', { uid: 't2', google: true });
    const S1 = as('s1', 'anonymous', { uid: 's1' }), S2 = as('s2', 'anonymous', { uid: 's2' });
    const wait = ms => new Promise(r => setTimeout(r, ms));
    try {
        const c = await T1({ action: 'createClass', ban: 1, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 1 });
        assert.equal(c.ok, true, c.error);
        const seat = (jo, num, x) => Object.assign({ action: 'answerSave', space: c.space, jo, num, key: 'my-q1' }, x);
        assert.equal((await S1(seat(1, 1, { choice: 0 }))).ok, false, '띄우기 전');
        const q = { type: 'pick', text: '색은?', choices: ['파랑', '초록', '노랑'] };
        const r = await T1({ action: 'classLesson', space: c.space, lesson: { on: true, stage: 'purpose', i: 0, key: 'my-q1', mode: 'phone', q } });
        assert.equal(r.ok, true, r.error);
        assert.deepEqual((await S1({ action: 'classInfo', space: c.space })).lesson.q, q);
        const s1 = await S1(seat(1, 1, { choice: 1 })); assert.equal(s1.ok, true, s1.error);
        assert.equal((await S1(seat(1, 1, { choice: 2 }))).ok, false, '2초 안 고쳐 쓰기 막힘');
        await wait(2300);
        assert.equal((await S1(seat(1, 1, { choice: 2 }))).ok, true, '2초 뒤');
        assert.equal((await S2(seat(1, 1, { choice: 0 }))).ok, false, '남의 자리 문서는 못 고침');
        assert.equal((await S2(seat(2, 1, { choice: 0 }))).ok, true);
        assert.deepEqual((await S1(Object.assign(seat(1, 1), { action: 'answerMine' }))).answer, { choice: 2 });
        assert.equal((await S2(Object.assign(seat(1, 1), { action: 'answerMine' }))).answer, null, '남의 답 못 읽음');
        assert.equal((await S1({ action: 'answerList', space: c.space, key: 'my-q1' })).ok, false, '학생 목록 못 봄');
        assert.equal((await T2({ action: 'answerList', space: c.space, key: 'my-q1' })).ok, false, '다른 교사 못 봄');
        assert.deepEqual((await T1({ action: 'answerList', space: c.space, key: 'my-q1' })).answers.map(a => a.choice), [2, 0]);
        // 직접 쓰기로 규칙 확인
        const ts = firebase.default.firestore.FieldValue.serverTimestamp();
        const exp = new Date(Date.now() + 100 * 86400000);
        const d = (uid, prov, id) => ctx(uid, prov).firestore().doc('labClasses/' + c.space + '/answers/' + id);
        const ok = { key: 'my-q1', jo: 2, num: 2, uid: 's3', choice: 0, at: ts, expireAt: exp };
        await RUT.assertFails(d('s3', 'anonymous', 'my-q1~2-2').set(Object.assign({}, ok, { uid: 's9' })), 'uid 는 자기');
        await RUT.assertFails(d('s3', 'anonymous', 'my-q1~2-1').set(ok), '문서 이름의 자리와 칸이 같아야');
        await RUT.assertFails(d('s3', 'anonymous', 'my-q2~2-2').set(ok), '문서 이름의 key 와 칸이 같아야');
        await RUT.assertFails(d('s3', 'anonymous', 'my-q1~2-2').set(Object.assign({}, ok, { text: '글' })), '고르기와 글 둘 다는 안 됨');
        await RUT.assertFails(d('s3', 'anonymous', 'my-q1~2-2').set(Object.assign({}, ok, { choice: 7 })), '고를 답 범위');
        await RUT.assertFails(d('s3', 'anonymous', 'my-q1~2-2').set((({ choice, ...o }) => Object.assign(o, { text: 'ㄱ'.repeat(101) }))(ok)), '글 100자');
        await RUT.assertFails(d('s3', 'anonymous', 'my-q1~2-2').set(Object.assign({}, ok, { extra: 1 })), '모르는 칸');
        await RUT.assertFails(d('s3', 'anonymous', 'my-q1~2-2').set(Object.assign({}, ok, { expireAt: new Date(Date.now() + 400 * 86400000) })), 'expireAt 200일 안');
        await RUT.assertFails(d('s3', 'anonymous', 'force~2-2').set(Object.assign({}, ok, { key: 'force' })), '기본 장 key 에는 답 없음');
        await RUT.assertSucceeds(d('s3', 'anonymous', 'my-q1~2-2').set(ok));
        await RUT.assertFails(d('s3', 'anonymous', 'my-q1~1-1').get(), '남의 답 읽기');
        await RUT.assertFails(ctx('s3', 'anonymous').firestore().collection('labClasses/' + c.space + '/answers').get(), '학생 목록');
        await RUT.assertFails(d('s3', 'anonymous', 'my-q1~2-2').delete(), '학생 지우기');
        // lesson.q 모양 (주인만)
        const cd = (uid, prov) => ctx(uid, prov).firestore().doc('labClasses/' + c.space);
        const L = { on: true, stage: 'purpose', i: 0, key: 'my-q1', reveal: false, mode: 'phone', at: ts };
        await RUT.assertFails(cd('t1', 'google.com').update({ lesson: Object.assign({}, L, { q: { type: 'pick', text: 'x', choices: ['a'] } }) }), '고를 답 2개 이상');
        await RUT.assertFails(cd('t1', 'google.com').update({ lesson: Object.assign({}, L, { q: { type: 'pick', text: 'x', choices: ['a', 'b'], answer: 1 } }) }), '정답 칸은 못 넣음');
        await RUT.assertFails(cd('t1', 'google.com').update({ lesson: Object.assign({}, L, { q: { type: 'vote', text: 'x' } }) }), '종류');
        await RUT.assertFails(cd('t1', 'google.com').update({ lesson: Object.assign({}, L, { q: { type: 'text', text: 'ㄱ'.repeat(301) } }) }), '물음 300자');
        await RUT.assertFails(cd('s1', 'anonymous').update({ lesson: Object.assign({}, L, { q: { type: 'text', text: 'x' } }) }), '학생은 물음 못 씀');
        await RUT.assertSucceeds(cd('t1', 'google.com').update({ lesson: Object.assign({}, L, { q: { type: 'text', text: '왜?' } }) }));
        // 물음을 내리면 못 씀
        await T1({ action: 'classLesson', space: c.space, lesson: { on: false } });
        await wait(2300);
        await RUT.assertFails(d('s3', 'anonymous', 'my-q1~2-2').set(Object.assign({}, ok, { choice: 1 })), '내린 물음');
        assert.equal((await T1({ action: 'deleteClass', space: c.space })).ok, true, '주인 교사가 수업을 지우면 답도 (규칙: 주인 지우기)');
    } finally { await env.cleanup(); }
});
