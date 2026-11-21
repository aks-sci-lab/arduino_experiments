// Firestore 규칙 — 🎬 발표 보기 설명 장 상태(labClasses 의 lesson·lessonOpen): 주인 교사만, 모양 검사, 학생은 읽기만
// 실행: FIRESTORE_EMULATOR_HOST 가 있고 @firebase/rules-unit-testing·firebase 를 찾을 수 있을 때만 (없으면 건너뜀)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const LabStore = require('../js/lab-store.js');

let RUT = null, firebase = null;
try { RUT = require('@firebase/rules-unit-testing'); firebase = require('firebase/compat/app'); require('firebase/compat/firestore'); } catch (e) { RUT = null; }
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = (!HOST && 'FIRESTORE_EMULATOR_HOST 없음') || (!RUT && '@firebase/rules-unit-testing 없음');

test('규칙: 설명 장 상태 lesson·lessonOpen (에뮬레이터)', { skip, timeout: 120000 }, async () => {
    const [host, port] = HOST.split(':');
    const env = await RUT.initializeTestEnvironment({ projectId: 'demo-lesson-' + Date.now(), firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
    const ctxs = {};
    const ctx = (uid, provider) => { if (!ctxs[uid]) { const c = env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }); let f = null; ctxs[uid] = { firestore: () => f || (f = c.firestore()) }; } return ctxs[uid]; };
    const as = (c, auth) => { const fsx = c.firestore(); const core = LabStore.core(LabStore.firestoreDb({ firestore: () => fsx, raw: firebase.default || firebase })); return b => core.handle(b, auth); };
    const T1 = as(ctx('t1', 'google.com'), { uid: 't1', google: true });
    const T2 = as(ctx('t2', 'google.com'), { uid: 't2', google: true });
    const S1 = as(ctx('s1', 'anonymous'), { uid: 's1' });
    try {
        const c = await T1({ action: 'createClass', ban: 1, mode: 'team', nTeams: 3, exp: 'rocket' });
        assert.equal(c.ok, true, c.error);
        assert.equal((await S1({ action: 'joinInfo', space: c.space })).lesson, null, '새 수업은 설명 화면 칸 없음');
        const r1 = await T1({ action: 'classLesson', space: c.space, lesson: { on: true, stage: 'think', i: 1, key: 'force', reveal: false } });
        assert.equal(r1.ok, true, r1.error);
        const r2 = await T1({ action: 'classLesson', space: c.space, lesson: { on: true, stage: 'think', i: 1, key: 'force', reveal: true }, open: ['force', 'force', 'BAD KEY'] });
        assert.deepEqual(r2.lessonOpen, ['force'], '중복·모양이 틀린 key 는 빼고 더함');
        const ji = await S1({ action: 'classInfo', space: c.space });
        assert.equal(ji.lesson.on, true); assert.equal(ji.lesson.key, 'force'); assert.deepEqual(ji.lessonOpen, ['force'], '학생은 읽을 수 있음');
        assert.equal((await T2({ action: 'classLesson', space: c.space, lesson: { on: false } })).ok, false, '다른 교사는 못 씀');
        assert.equal((await S1({ action: 'classLesson', space: c.space, lesson: { on: false } })).ok, false, '학생은 못 씀');
        const doc = p => ctx(p, p[0] === 't' ? 'google.com' : 'anonymous').firestore().doc('labClasses/' + c.space);
        const ok = { on: false, stage: 't1', i: 0, key: '', reveal: false };
        const ts = firebase.default.firestore.FieldValue.serverTimestamp();
        await RUT.assertFails(doc('s1').update({ lesson: Object.assign({ at: ts }, ok) }), '학생(익명)은 못 씀');
        await RUT.assertFails(doc('s1').update({ lessonOpen: ['force', 'gas'] }), '학생은 풀이를 열 수 없음');
        await RUT.assertFails(doc('t2').update({ lessonOpen: ['gas'] }), '다른 교사는 못 씀');
        await RUT.assertFails(doc('t1').update({ lesson: Object.assign({ at: ts, extra: 1 }, ok) }), '모르는 칸');
        await RUT.assertFails(doc('t1').update({ lesson: Object.assign({ at: ts }, ok, { i: 500 }) }), 'i 범위');
        await RUT.assertFails(doc('t1').update({ lesson: Object.assign({ at: ts }, ok, { on: 'yes' }) }), 'on 은 참·거짓');
        await RUT.assertFails(doc('t1').update({ lesson: Object.assign({ at: new Date(2020, 1, 1) }, ok) }), 'at 은 서버 시각');
        await RUT.assertFails(doc('t1').update({ lessonOpen: new Array(201).fill('k') }), '200개까지');
        await RUT.assertFails(doc('t1').update({ lessonOpen: 'force' }), '목록만');
        await RUT.assertFails(doc('t1').update({ lessonOpen: ['x'], groups: [] }), '다른 칸은 그대로 못 고침');
        await RUT.assertSucceeds(doc('t1').update({ lesson: Object.assign({ at: ts }, ok), lessonOpen: ['force', 'gas'] }));
        // 설명 화면을 쓴 뒤에도(예전 lesson.at 이 남아 있어도) 단계 열기·수업 마치기·설정 고치기·다시 설명 장 쓰기가 됨 (실제 저장 경로)
        await new Promise(r => setTimeout(r, 1100));
        const st2 = await T1({ action: 'classStage', space: c.space, stage: 2 }); assert.equal(st2.ok, true, 'classLesson 뒤 classStage: ' + JSON.stringify(st2));
        const dn = await T1({ action: 'classDone', space: c.space, done: true }); assert.equal(dn.ok, true, 'classLesson 뒤 classDone: ' + JSON.stringify(dn));
        // (예전 규칙은 수업을 마친 뒤(doneAt 이 남아 있으면) 설정·단계 고치기도 막았음 — 함께 고침)
        const su = await T1({ action: 'classSetup', space: c.space, setup: { targetTime: 12 } }); assert.equal(su.ok, true, 'classLesson·수업 마치기 뒤 classSetup: ' + JSON.stringify(su));
        assert.equal((await T1({ action: 'classStage', space: c.space, stage: 2 })).ok, true, '수업 마치기 뒤 classStage');
        assert.equal((await T1({ action: 'classDone', space: c.space, done: false })).ok, true, '다시 진행 중으로');
        assert.equal((await T1({ action: 'classDone', space: c.space, done: true })).ok, true);
        // 발표 보기 흐름: 설명 장(on) → 학생 화면(off) → 다음 단계 열기 → 새 단계 설명 장 → 풀이 열기
        assert.equal((await T1({ action: 'classLesson', space: c.space, lesson: { on: true, stage: 't1', i: 0, key: 'gas', reveal: false } })).ok, true);
        assert.equal((await T1({ action: 'classLesson', space: c.space, lesson: { on: false } })).ok, true);
        assert.equal((await T1({ action: 'classStage', space: c.space, stage: 3 })).ok, true, '설명 장 → 학생 화면 → 다음 단계 열기');
        const r3 = await T1({ action: 'classLesson', space: c.space, lesson: { on: true, stage: 't2', i: 0, key: 'action', reveal: true }, open: ['action'] });
        assert.equal(r3.ok, true, r3.error); assert.deepEqual(r3.lessonOpen, ['force', 'gas', 'action']);
        const fin = await S1({ action: 'classInfo', space: c.space });
        assert.equal(fin.stage, 3); assert.equal(fin.done, true); assert.equal(fin.lesson.key, 'action');
        // lesson 을 안 바꾸는 쓰기에 이상한 lessonOpen 은 여전히 막음
        await RUT.assertFails(doc('t1').update({ stage: 4, lessonOpen: 'bad' }), 'lessonOpen 을 바꾸면 검사');
    } finally { await env.cleanup(); }
});
