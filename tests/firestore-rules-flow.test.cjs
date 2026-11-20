// Firestore 규칙 — 수업의 진행 방법 flow (📋 7단계 'report'·칸 없음 / 🔍 가설연역 'hd', docs/inquiry-types-design.md)
//  만들 때만 정함: 'report'|'hd' 만, 만든 뒤에는 주인도 못 바꿈. 학생은 읽기
// 실행: FIRESTORE_EMULATOR_HOST 가 있고 @firebase/rules-unit-testing·firebase 를 찾을 수 있을 때만 (없으면 건너뜀)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const LabStore = require('../js/lab-store.js');

let RUT = null, firebase = null;
try { RUT = require('@firebase/rules-unit-testing'); firebase = require('firebase/compat/app'); require('firebase/compat/firestore'); } catch (e) { RUT = null; }
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = (!HOST && 'FIRESTORE_EMULATOR_HOST 없음') || (!RUT && '@firebase/rules-unit-testing 없음');

test('규칙: 수업 진행 방법 flow (에뮬레이터)', { skip, timeout: 120000 }, async () => {
    const [host, port] = HOST.split(':');
    const env = await RUT.initializeTestEnvironment({ projectId: 'demo-flow-' + Date.now(), firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
    const ctxs = {};
    const ctx = (uid, provider) => { if (!ctxs[uid]) { const c = env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }); let f = null; ctxs[uid] = { firestore: () => f || (f = c.firestore()) }; } return ctxs[uid]; };
    const as = (c, auth) => { const fsx = c.firestore(); const core = LabStore.core(LabStore.firestoreDb({ firestore: () => fsx, raw: firebase.default || firebase })); return b => core.handle(b, auth); };
    const T1 = as(ctx('t1', 'google.com'), { uid: 't1', google: true });
    const S1 = as(ctx('s1', 'anonymous'), { uid: 's1' });
    try {
        const c = await T1({ action: 'createClass', ban: 1, nStudents: 4, groupSize: 2, exp: 'qdot', flow: 'hd' });
        assert.equal(c.ok, true, c.error); assert.equal(c.flow, 'hd');
        const j = await S1({ action: 'joinInfo', space: c.space });
        assert.equal(j.ok, true, j.error); assert.equal(j.flow, 'hd', '학생은 수업 방법을 읽음');
        assert.equal((await T1({ action: 'classStage', space: c.space, stage: 2 })).ok, true, '단계 열기는 그대로');
        const doc = (uid, sp) => ctx(uid, uid[0] === 't' ? 'google.com' : 'anonymous').firestore().doc('labClasses/' + (sp || c.space));
        await RUT.assertFails(doc('t1').update({ flow: 'report' }), '만든 뒤에는 주인도 못 바꿈');
        await RUT.assertFails(doc('s1').update({ flow: 'report' }), '학생도 못 바꿈');
        const base = () => ({ owner: 't1', classCode: '1-1234', ban: 1, nStudents: 1, groupSize: 1, exp: 'qdot', groups: [], stage: 1, createdAt: new Date(), expireAt: new Date(Date.now() + 86400000) });
        await RUT.assertFails(doc('t1', 'c' + 'y'.repeat(23)).set(Object.assign(base(), { flow: 'free' })), "'report'·'hd' 말고는 막음");
        await RUT.assertFails(doc('t1', 'c' + 'x'.repeat(23)).set(Object.assign(base(), { flow: 1 })), '글자만');
        await RUT.assertSucceeds(doc('t1', 'c' + 'w'.repeat(23)).set(Object.assign(base(), { flow: 'report' })));
        await RUT.assertSucceeds(doc('t1', 'c' + 'v'.repeat(23)).set(base()), '칸 없음(예전 수업 모양) = 7단계');
        const r = await T1({ action: 'createClass', ban: 2, nStudents: 2, groupSize: 2, exp: 'qdot' });
        assert.equal(r.ok, true, r.error); assert.equal(r.flow, '');
    } finally { await env.cleanup(); }
});
