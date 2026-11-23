// Firestore 규칙 — 📖 선생님이 고친 수업 자료 lessonEdits/{uid}/exps/{exp}: 구글 로그인한 본인만 읽고 쓰고 지움, 모양 검사, expireAt 없음
// 실행: FIRESTORE_EMULATOR_HOST 가 있고 @firebase/rules-unit-testing·firebase 를 찾을 수 있을 때만 (없으면 건너뜀)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const LabStore = require('../js/lab-store.js');

let RUT = null, firebase = null;
try { RUT = require('@firebase/rules-unit-testing'); firebase = require('firebase/compat/app'); require('firebase/compat/firestore'); } catch (e) { RUT = null; }
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = (!HOST && 'FIRESTORE_EMULATOR_HOST 없음') || (!RUT && '@firebase/rules-unit-testing 없음');

test('규칙: 고친 수업 자료 lessonEdits (에뮬레이터)', { skip, timeout: 120000 }, async () => {
    const [host, port] = HOST.split(':');
    const env = await RUT.initializeTestEnvironment({ projectId: 'demo-ledit-' + Date.now(), firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
    const ctxs = {};
    const ctx = (uid, provider) => { if (!ctxs[uid]) { const c = env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }); let f = null; ctxs[uid] = { firestore: () => f || (f = c.firestore()) }; } return ctxs[uid]; };
    const as = (uid, provider, auth) => { const fsx = ctx(uid, provider).firestore(); const core = LabStore.core(LabStore.firestoreDb({ firestore: () => fsx, raw: firebase.default || firebase })); return b => core.handle(b, auth); };
    const T1 = as('t1', 'google.com', { uid: 't1', google: true });
    const T2 = as('t2', 'google.com', { uid: 't2', google: true });
    try {
        const edit = { stages: { think: [{ ref: 'k:force', of: '힘', set: { title: '고침' } }, { add: 'my-a1', kind: 'how', title: '새 장', body: '<p>x</p>' }] } };
        const r = await T1({ action: 'lessonEditSave', exp: 'rocket', edit });
        assert.equal(r.ok, true, r.error);
        assert.equal((await T1({ action: 'lessonEditGet', exp: 'rocket' })).edit.stages.think.length, 2);
        assert.deepEqual((await T1({ action: 'lessonEditList' })).edits.map(e => e.exp), ['rocket']);
        assert.equal((await T2({ action: 'lessonEditSave', exp: 'qdot', edit })).ok, true, '다른 선생님은 자기 계정에');
        const ts = firebase.default.firestore.FieldValue.serverTimestamp();
        const d = (uid, prov, p) => ctx(uid, prov).firestore().doc(p);
        const ok = { v: 1, exp: 'rocket', stages: {}, updatedAt: ts };
        await RUT.assertFails(d('t2', 'google.com', 'lessonEdits/t1/exps/rocket').get(), '다른 선생님은 못 읽음');
        await RUT.assertFails(ctx('t2', 'google.com').firestore().collection('lessonEdits/t1/exps').get(), '다른 선생님은 목록도 못 봄');
        await RUT.assertFails(d('t2', 'google.com', 'lessonEdits/t1/exps/rocket').set(ok), '다른 선생님은 못 씀');
        await RUT.assertFails(d('t2', 'google.com', 'lessonEdits/t1/exps/rocket').delete(), '다른 선생님은 못 지움');
        await RUT.assertFails(d('s1', 'anonymous', 'lessonEdits/s1/exps/rocket').set(ok), '익명(학생)은 자기 uid 라도 못 씀');
        await RUT.assertFails(d('s1', 'anonymous', 'lessonEdits/t1/exps/rocket').get(), '학생은 못 읽음');
        await RUT.assertFails(env.unauthenticatedContext().firestore().doc('lessonEdits/t1/exps/rocket').get(), '로그인 없이는 못 읽음');
        await RUT.assertFails(d('t1', 'google.com', 'lessonEdits/t1/exps/rocket').set(Object.assign({}, ok, { exp: 'qdot' })), 'exp 는 문서 이름과 같게');
        await RUT.assertFails(d('t1', 'google.com', 'lessonEdits/t1/exps/Bad-Exp').set(Object.assign({}, ok, { exp: 'Bad-Exp' })), '실험 키 모양');
        await RUT.assertFails(d('t1', 'google.com', 'lessonEdits/t1/exps/rocket').set(Object.assign({}, ok, { extra: 1 })), '모르는 칸');
        await RUT.assertFails(d('t1', 'google.com', 'lessonEdits/t1/exps/rocket').set(Object.assign({}, ok, { v: 2 })), '판 번호');
        await RUT.assertFails(d('t1', 'google.com', 'lessonEdits/t1/exps/rocket').set(Object.assign({}, ok, { stages: [] })), 'stages 는 묶음(map)');
        const many = {}; for (let i = 0; i < 21; i++) many['s' + i] = [];
        await RUT.assertFails(d('t1', 'google.com', 'lessonEdits/t1/exps/rocket').set(Object.assign({}, ok, { stages: many })), '단계 20개까지');
        await RUT.assertFails(d('t1', 'google.com', 'lessonEdits/t1/exps/rocket').set(Object.assign({}, ok, { updatedAt: new Date(2020, 1, 1) })), 'updatedAt 은 서버 시각');
        await RUT.assertSucceeds(d('t1', 'google.com', 'lessonEdits/t1/exps/rocket').set(ok));
        assert.equal((await T1({ action: 'lessonEditReset', exp: 'rocket' })).ok, true);
        assert.equal((await T1({ action: 'lessonEditGet', exp: 'rocket' })).edit, null);
        assert.equal((await T2({ action: 'lessonEditGet', exp: 'qdot' })).edit.stages.think.length, 2, '다른 선생님 자료는 그대로');
    } finally { await env.cleanup(); }
});
