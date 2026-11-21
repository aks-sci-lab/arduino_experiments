// 진행 신호 자리(firestore.rules 의 labClasses/{공간}/progress, 2026-11-21): 노트북 '조-번호' 와 그 자리의 📱 폰 '조-번호-p' 가 따로,
//  쓴 기기 uid 를 남기고, 조·번호를 바꾼 기기는 자기가 쓴 옛 자리만 지움(남의 자리는 못 지우고 못 바꿈). 에뮬레이터에서만 (없으면 건너뜀)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const LabStore = require('../js/lab-store.js');

let RUT = null, firebase = null;
try { RUT = require('@firebase/rules-unit-testing'); firebase = require('firebase/compat/app'); require('firebase/compat/firestore'); } catch (e) { RUT = null; }
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = (!HOST && 'FIRESTORE_EMULATOR_HOST 없음') || (!RUT && '@firebase/rules-unit-testing 없음');

test('규칙: 진행 신호 자리 — 폰 따로·자기 자리만 지우기 (에뮬레이터)', { skip, timeout: 120000 }, async () => {
    const [host, port] = HOST.split(':');
    const env = await RUT.initializeTestEnvironment({ projectId: 'demo-seat-' + Date.now(), firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
    const ctxs = {};
    const ctx = (uid, provider) => {
        if (ctxs[uid]) return ctxs[uid];
        const c = env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } });
        let fsx = null;
        return (ctxs[uid] = { firestore: () => fsx || (fsx = c.firestore()) });
    };
    const store = c => { const fsx = c.firestore(); return LabStore.firestoreDb({ firestore: () => fsx, raw: firebase.default || firebase }); };
    const as = (uid, provider, auth) => { const core = LabStore.core(store(ctx(uid, provider))); return body => core.handle(body, auth); };
    const T = as('t1', 'google.com', { uid: 't1', google: true });
    const L = as('lap1', 'anonymous', { uid: 'lap1' }), P = as('ph1', 'anonymous', { uid: 'ph1' }), O = as('oth1', 'anonymous', { uid: 'oth1' });
    try {
        const c = await T({ action: 'createClass', ban: 2, nStudents: 6, groupSize: 3, exp: 'qdot' });
        assert.equal(c.ok, true, c.error);
        const hb = (who, o) => who(Object.assign({ action: 'heartbeat', class: c.classCode, space: c.space, step: 'data', points: 0, submitted: false }, o));
        // 노트북과 그 자리의 폰이 번갈아 보내도 서로 덮어쓰지 않음
        assert.equal((await hb(L, { jo: 1, num: 1, step: 'conclusion', points: 0, device: 'nlap111' })).ok, true);
        assert.equal((await hb(P, { jo: 1, num: 1, step: 'phone-live', points: 3, submitted: true, device: 'pph1111', phone: true })).ok, true);
        assert.equal((await hb(L, { jo: 1, num: 1, step: 'conclusion', points: 0, device: 'nlap111' })).ok, true);
        let st = await T({ action: 'classStatus', space: c.space });
        assert.equal(st.ok, true, st.error);
        assert.equal(st.students.length, 1, '한 학생으로 합침');
        const s = st.students[0];
        assert.equal(s.step, 'conclusion'); assert.equal(s.points, 3, '점 수는 큰 쪽'); assert.equal(s.submitted, true, '폰이 낸 것이 지워지지 않음');
        assert.equal(s.phone.step, 'phone-live');
        // 문서에 쓴 기기 uid 가 남음
        const d = (await ctx('t1', 'google.com').firestore().doc('labClasses/' + c.space + '/progress/1-1-p').get()).data();   // 수업 주인은 읽을 수 있음
        assert.equal(d.uid, 'ph1');
        // 남의 uid 로 쓸 수 없음, 이상한 자리 이름도 안 됨
        const raw = ctx('oth1', 'anonymous').firestore();
        const base = { jo: 1, num: 2, group: c.groups[0].code, step: '', points: 0, submitted: false, device: '', lastSeen: firebase.firestore.FieldValue.serverTimestamp(), expireAt: new Date(Date.now() + 86400000) };
        await RUT.assertFails(raw.doc('labClasses/' + c.space + '/progress/1-2').set(Object.assign({ uid: 'lap1' }, base)));
        await RUT.assertFails(raw.doc('labClasses/' + c.space + '/progress/1-2-x').set(Object.assign({ uid: 'oth1' }, base)));
        // 조·번호 바꾸기: 다른 학생(oth1)이 2조 1번을 잘못 골랐다가 옮김 → 자기 옛 자리는 지워짐
        assert.equal((await hb(O, { jo: 2, num: 1, device: 'noth111' })).ok, true);
        const lv = await O({ action: 'leaveSeat', class: c.classCode, space: c.space, jo: 2, num: 1 });
        assert.equal(lv.ok, true);
        assert.equal(lv.removed, true);
        for (let i = 0; i < 30; i++) { st = await T({ action: 'classStatus', space: c.space }); if (!st.students.some(x => x.jo === 2)) break; await new Promise(r => setTimeout(r, 100)); }   // 교사 화면은 실시간으로 받음
        assert.equal(st.students.filter(x => x.jo === 2).length, 0, '옛 자리 치움');
        // 남의 자리(1조 1번 노트북·폰)는 못 지움
        await O({ action: 'leaveSeat', class: c.classCode, space: c.space, jo: 1, num: 1 });
        await O({ action: 'leaveSeat', class: c.classCode, space: c.space, jo: 1, num: 1, phone: true });
        await RUT.assertFails(raw.doc('labClasses/' + c.space + '/progress/1-1').delete());
        st = await T({ action: 'classStatus', space: c.space });
        assert.equal(st.students.length, 1); assert.ok(st.students[0].phone, '남의 자리는 그대로');
        // 예전 모양 문서(uid 없음)도 교사 화면에 보이고, 학생은 못 지움
        await env.withSecurityRulesDisabled(async c2 => {
            await c2.firestore().doc('labClasses/' + c.space + '/progress/2-3').set({ jo: 2, num: 3, group: c.groups[1].code, step: 'theory', points: 1, submitted: false, device: 'nold111', lastSeen: new Date(), expireAt: new Date(Date.now() + 86400000) });
        });
        await RUT.assertFails(raw.doc('labClasses/' + c.space + '/progress/2-3').delete());
        for (let i = 0; i < 30; i++) { st = await T({ action: 'classStatus', space: c.space }); if (st.students.length === 2) break; await new Promise(r => setTimeout(r, 100)); }
        assert.equal(st.students.length, 2, '예전 모양 문서도 보임');
        // 수업 주인은 지울 수 있음
        await RUT.assertSucceeds(ctx('t1', 'google.com').firestore().doc('labClasses/' + c.space + '/progress/2-3').delete());
    } finally { await env.cleanup(); }
});
