// Firestore 규칙 — 선생님이 여는 단계(labClasses 의 stage): 주인 교사만, 1~99 정수, 주인도 setup·stage 말고는 못 고침
// 실행: FIRESTORE_EMULATOR_HOST 가 있고 @firebase/rules-unit-testing·firebase 를 찾을 수 있을 때만 (없으면 건너뜀)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const LabStore = require('../js/lab-store.js');

let RUT = null, firebase = null;
try { RUT = require('@firebase/rules-unit-testing'); firebase = require('firebase/compat/app'); require('firebase/compat/firestore'); } catch (e) { RUT = null; }
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = (!HOST && 'FIRESTORE_EMULATOR_HOST 없음') || (!RUT && '@firebase/rules-unit-testing 없음');

test('규칙: 선생님이 여는 단계 stage (에뮬레이터)', { skip, timeout: 120000 }, async () => {
    const [host, port] = HOST.split(':');
    const env = await RUT.initializeTestEnvironment({ projectId: 'demo-stage-' + Date.now(), firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
    const ctxs = {};
    const ctx = (uid, provider) => { if (!ctxs[uid]) { const c = env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }); let f = null; ctxs[uid] = { firestore: () => f || (f = c.firestore()) }; } return ctxs[uid]; };
    const as = (c, auth) => { const fsx = c.firestore(); const core = LabStore.core(LabStore.firestoreDb({ firestore: () => fsx, raw: firebase.default || firebase })); return b => core.handle(b, auth); };
    const T1 = as(ctx('t1', 'google.com'), { uid: 't1', google: true });
    const T2 = as(ctx('t2', 'google.com'), { uid: 't2', google: true });
    const S1 = as(ctx('s1', 'anonymous'), { uid: 's1' });
    try {
        const c = await T1({ action: 'createClass', ban: 1, nStudents: 4, groupSize: 2, exp: 'malus' });
        assert.equal(c.ok, true, c.error); assert.equal(c.stage, 1, '새 수업은 1단계만');
        assert.equal((await T1({ action: 'classStage', space: c.space, stage: 3 })).ok, true);
        assert.equal((await S1({ action: 'joinInfo', space: c.space })).stage, 3, '학생은 읽을 수 있음');
        assert.equal((await T2({ action: 'classStage', space: c.space, stage: 5 })).ok, false, '다른 교사는 못 바꿈');
        const doc = p => ctx(p, p[0] === 't' ? 'google.com' : 'anonymous').firestore().doc('labClasses/' + c.space);
        await RUT.assertFails(doc('s1').update({ stage: 7 }), '학생(익명)은 못 바꿈');
        await RUT.assertFails(doc('t2').update({ stage: 7 }), '다른 교사는 못 바꿈');
        await RUT.assertFails(doc('t1').update({ stage: 0 }), '범위 밖 0');
        await RUT.assertFails(doc('t1').update({ stage: 100 }), '범위 밖 100');
        await RUT.assertFails(doc('t1').update({ stage: 2.5 }), '정수만');
        await RUT.assertFails(doc('t1').update({ stage: 'all' }), '숫자만');
        await RUT.assertFails(doc('t1').update({ stage: 2, groups: [] }), '주인도 stage·setup 말고는 못 고침');
        await RUT.assertSucceeds(doc('t1').update({ stage: 99 }));
        // 만들 때 이상한 stage 는 막음
        await RUT.assertFails(ctx('t1', 'google.com').firestore().doc('labClasses/c' + 'z'.repeat(23)).set({ owner: 't1', classCode: '1-1234', ban: 1, nStudents: 1, groupSize: 1, exp: 'malus', groups: [], stage: 500, createdAt: new Date(), expireAt: new Date(Date.now() + 86400000) }));
        // 행사 설정도 그대로 됨 (팀 수업)
        const r = await T1({ action: 'createClass', ban: 2, mode: 'team', nTeams: 2, exp: 'rocket', setup: { targetTime: 10 } });
        assert.equal((await T1({ action: 'classSetup', space: r.space, setup: { targetTime: 12 } })).ok, true);
        assert.equal((await T1({ action: 'classStage', space: r.space, stage: 2 })).ok, true);
    } finally { await env.cleanup(); }
});
