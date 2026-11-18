// Firestore 보안 규칙(firestore.rules 의 lab… 부분) + js/lab-store.js core 를 진짜 에뮬레이터에서 함께 시험
// 실행: FIRESTORE_EMULATOR_HOST 가 있고 @firebase/rules-unit-testing·firebase 를 찾을 수 있을 때만 (없으면 건너뜀)
//   예) npx firebase emulators:exec --only firestore "node --test tests/firestore-rules.test.cjs"
//       (모듈은 NODE_PATH 로 가리켜도 됨: NODE_PATH=<firebase 가 깔린 node_modules>)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const LabStore = require('../js/lab-store.js');

let RUT = null, firebase = null;
try { RUT = require('@firebase/rules-unit-testing'); firebase = require('firebase/compat/app'); require('firebase/compat/firestore'); } catch (e) { RUT = null; }
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = (!HOST && 'FIRESTORE_EMULATOR_HOST 없음') || (!RUT && '@firebase/rules-unit-testing 없음');

test('규칙: 수업·조 공유·진행·개발 자료 (에뮬레이터)', { skip, timeout: 120000 }, async () => {
    const [host, port] = HOST.split(':');
    const env = await RUT.initializeTestEnvironment({ projectId: 'demo-lab-' + Date.now(), firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
    const ctxs = {};   // 같은 사용자의 Firestore 는 한 번만 만든다 (두 번 만들면 설정 오류)
    const ctx = (uid, provider, email) => {
        if (ctxs[uid]) return ctxs[uid];
        const c = env.authenticatedContext(uid, { email: email || '', firebase: { sign_in_provider: provider } });
        let fsx = null;
        return (ctxs[uid] = { firestore: () => fsx || (fsx = c.firestore()) });
    };
    const store = c => { const fsx = c.firestore(); return LabStore.firestoreDb({ firestore: () => fsx, raw: firebase.default || firebase }); };
    const as = (c, auth) => { const core = LabStore.core(store(c)); return body => core.handle(body, auth); };
    const T1 = as(ctx('t1', 'google.com'), { uid: 't1', google: true });
    const T2 = as(ctx('t2', 'google.com'), { uid: 't2', google: true });
    const S1 = as(ctx('s1', 'anonymous'), { uid: 's1' });
    const S2 = as(ctx('s2', 'anonymous'), { uid: 's2' });
    try {
        // 개발 자료 시험용 교사 역할 (이 함수는 시험 하나에 한 번만 — 두 번 부르면 Firestore 설정 오류)
        await env.withSecurityRulesDisabled(async c2 => { await c2.firestore().doc('roles/t1').set({ isTeacher: true }); });
        // 익명 학생은 수업을 못 만듦 (core 가 막지 않게 google 이라고 속여도 규칙이 막음)
        const fakeT = as(ctx('s9', 'anonymous'), { uid: 's9', google: true });
        assert.equal((await fakeT({ action: 'createClass', ban: 1, nStudents: 4, groupSize: 2, exp: 'idealgas' })).ok, false);
        // 교사가 수업 만들기 → 학생이 코드로 찾기
        const c = await T1({ action: 'createClass', ban: 2, nStudents: 6, groupSize: 3, exp: 'idealgas' });
        assert.equal(c.ok, true, c.error);
        assert.match(c.space, /^c[a-z0-9]{23}$/);
        const j = await S1({ action: 'joinInfo', class: c.classCode });
        assert.equal(j.ok, true, j.error); assert.equal(j.space, c.space);
        // 학생 1조가 보내고, 같은 공간의 다른 학생이 읽음
        const g1 = c.groups[0].code;
        const sv = await S1({ action: 'save', space: c.space, exp: 'idealgas', group: g1, id: 'nabcd12-r1', device: 'nabcd12', title: '실험 1', n: 5, summary: { 'P (kPa)': 101.3 }, data: '{"a":1}' });
        assert.equal(sv.ok, true, sv.error);
        const ls = await S2({ action: 'list', space: c.space, exp: 'idealgas', group: g1 });
        assert.equal(ls.ok, true, ls.error); assert.equal(ls.items.length, 1); assert.equal(ls.items[0].summary['P (kPa)'], 101.3);
        // 공간을 모르는 학생이 수업 목록을 훑을 수 없음 (목록 조회)
        await RUT.assertFails(ctx('s2', 'anonymous').firestore().collection('labClasses').get());
        await RUT.assertFails(ctx('s2', 'anonymous').firestore().collection('labClassCodes').get());
        await RUT.assertFails(ctx('s2', 'anonymous').firestore().collectionGroup('items').get());
        // 로그인 안 하면 아무것도 못 읽음
        await RUT.assertFails(env.unauthenticatedContext().firestore().collection('labSpaces/' + c.space + '/items').get());
        // 크기 제한: 자료 27만 자 넘으면 규칙이 막음 (core 검사를 건너뛰고 직접 써 봄)
        const big = { exp: 'idealgas', group: c.groups[1].code, id: 'nabcd12-r9', device: 'nabcd12', n: 1, data: 'x'.repeat(270001), expireAt: new Date(Date.now() + 86400000) };
        await RUT.assertFails(ctx('s1', 'anonymous').firestore().doc('labSpaces/' + c.space + '/items/idealgas~' + g1 + '~nabcd12-r9').set(big));
        // expireAt 를 1년 뒤로 늦출 수 없음
        await RUT.assertFails(ctx('s1', 'anonymous').firestore().doc('labSpaces/' + c.space + '/items/x1').set(Object.assign({}, big, { data: '', expireAt: new Date(Date.now() + 365 * 86400000) })));
        await RUT.assertSucceeds(ctx('s1', 'anonymous').firestore().doc('labSpaces/' + c.space + '/items/x1').set(Object.assign({}, big, { data: '' })));
        // 하트비트 → 주인 교사만 진행을 봄
        assert.equal((await S1({ action: 'heartbeat', class: c.classCode, space: c.space, jo: 1, num: 2, step: 'data', points: 5, submitted: true, device: 'nabcd12' })).ok, true);
        const st = await T1({ action: 'classStatus', space: c.space });
        assert.equal(st.ok, true, st.error); assert.equal(st.students.length, 1); assert.equal(st.submissions[0].rows, 1);
        assert.equal((await T2({ action: 'classStatus', space: c.space })).ok, false, '다른 교사는 못 봄');
        await RUT.assertFails(ctx('s1', 'anonymous').firestore().collection('labClasses/' + c.space + '/progress').get());
        await RUT.assertFails(ctx('t2', 'google.com').firestore().collection('labClasses/' + c.space + '/progress').get());
        // 내 수업 목록: 주인 것만
        assert.equal((await T1({ action: 'myClasses' })).classes.length, 1);
        assert.equal((await T2({ action: 'myClasses' })).classes.length, 0);
        // 내려받기: 주인만
        const ex = await T1({ action: 'classExport', space: c.space });
        assert.equal(ex.ok, true, ex.error); assert.equal(ex.items.filter(d => d.group === g1).length, 1); assert.equal(ex.items.length, 2);
        assert.equal((await T2({ action: 'classExport', space: c.space })).ok, false);
        // 조 코드 공간·폰 짝 공간 (수업 없이)
        assert.equal((await S1({ action: 'save', group: '3-4-1234', id: 'mabcdefgh1', L: 1, nPeriods: 10, T_mean: 2.01, raw: ['P1|1|1'] })).ok, true);
        assert.equal((await S2({ action: 'list', group: '3-4-1234' })).items.length, 1);
        assert.equal((await S2({ action: 'raw', group: '3-4-1234', id: 'mabcdefgh1' })).raw[0], 'P1|1|1');
        const pair = LabStore.newSpace('p');
        assert.equal((await S1({ action: 'save', space: pair, exp: 'phoneaccel', group: '99-5-1111', id: 'pabcdef-run1', device: 'pabcdef', n: 3, data: '{}' })).ok, true);
        assert.equal((await S2({ action: 'list', space: pair, exp: 'phoneaccel', group: '99-5-1111' })).items.length, 1);
        assert.equal((await S2({ action: 'list', exp: 'phoneaccel', group: '99-5-1111' })).items.length, 0, '짝 공간은 조 코드만으로 못 봄');
        // 이상한 공간 이름은 막음
        await RUT.assertFails(ctx('s1', 'anonymous').firestore().collection('labSpaces/abc/items').get());
        // 개발 자료: 교사(roles) 만
        assert.equal((await T1({ action: 'devSave', exp: 'heartrate', id: 'hr-abc-r1', device: 'dvabc123', summary: { bpm: 70 }, data: '{}' })).ok, true);
        assert.equal((await T2({ action: 'devSave', exp: 'heartrate', id: 'hr-abc-r2', device: 'dvabc123', data: '{}' })).ok, false);
        await RUT.assertFails(ctx('t2', 'google.com').firestore().collection('devlog').limit(1).get());
        await RUT.assertSucceeds(ctx('t1', 'google.com').firestore().collection('devlog').limit(1).get());
        // 수업 코드 찾기 기간(joinUntil): 지나면 코드로 공간을 알아낼 수 없음 (코드 99만 개를 훑는 것을 막음)
        await RUT.assertSucceeds(ctx('s3', 'anonymous').firestore().doc('labClassCodes/' + c.classCode).get());   // 아직 유효
        const past = new Date(Date.now() - 3600000);
        // 찾기 기간을 지난 것으로 (주인은 자기 코드 문서를 고칠 수 있음)
        const t1fs = ctx('t1', 'google.com').firestore(), exp1 = new Date(Date.now() + 86400000);
        await t1fs.doc('labClassCodes/' + c.classCode).set({ space: c.space, owner: 't1', joinUntil: past, expireAt: exp1 });
        await t1fs.doc('labClassCodes/9-9999').set({ space: 'c' + 'q'.repeat(23), owner: 't1', joinUntil: past, expireAt: exp1 });
        await RUT.assertFails(ctx('s3', 'anonymous').firestore().doc('labClassCodes/' + c.classCode).get());
        await RUT.assertFails(ctx('s3', 'anonymous').firestore().doc('labClassCodes/9-9999').get());
        const S3 = as(ctx('s3', 'anonymous'), { uid: 's3' });
        assert.equal((await S3({ action: 'joinInfo', class: c.classCode })).ok, false, '찾기 기간이 지나면 코드로 못 찾음');
        assert.equal((await S3({ action: 'joinInfo', class: c.classCode, space: c.space })).ok, true, 'QR(공간)으로는 그대로');
        // 다른 선생님은 기간이 지난 코드를 새 수업에 다시 쓸 수 있음 (만든 쪽 코드 고르기에서 읽기 거절 = 비어 있음)
        await RUT.assertSucceeds(ctx('t2', 'google.com').firestore().doc('labClassCodes/9-9999').set({ space: 'c' + 'r'.repeat(23), owner: 't2', joinUntil: new Date(Date.now() + 86400000), expireAt: new Date(Date.now() + 86400000) }));
        // 아직 유효한(남이 쓰는) 코드는 덮어쓸 수 없음
        await RUT.assertFails(ctx('t1', 'google.com').firestore().doc('labClassCodes/9-9999').set({ space: c.space, owner: 't1', joinUntil: new Date(Date.now() + 86400000), expireAt: new Date(Date.now() + 86400000) }));
        // 주인이 '코드 다시 열기' → 다시 찾을 수 있음, 남이 다시 열 수는 없음
        assert.equal((await T2({ action: 'reopenCode', space: c.space })).ok, false);
        const ro = await T1({ action: 'reopenCode', space: c.space });
        assert.equal(ro.ok, true, ro.error);
        assert.ok(Date.parse(ro.joinUntil) - Date.now() < LabStore.JOIN_DAYS * 86400000 + 60000);
        assert.equal((await as(ctx('s4', 'anonymous'), { uid: 's4' })({ action: 'joinInfo', class: c.classCode })).ok, true);
        // 다른 교사는 내 수업을 지울 수 없고, 주인은 학생 자료까지 지움
        assert.equal((await T2({ action: 'deleteClass', space: c.space })).ok, false);
        const del = await T1({ action: 'deleteClass', space: c.space });
        assert.equal(del.ok, true, del.error);
        assert.equal((await S2({ action: 'joinInfo', class: c.classCode })).ok, false);
    } finally {
        await env.cleanup();
    }
});

test('정리 도구: expireAt 가 지난 문서만 지움 (가짜 Firestore)', async () => {
    const { cleanup, GROUPS } = require('../tools/firestore-cleanup.cjs');
    const now = new Date('2027-06-01T00:00:00Z');
    const docs = new Map([
        ['labSpaces/c1/items/a', { expireAt: new Date('2027-05-01') }], ['labSpaces/c1/items/b', { expireAt: new Date('2027-07-01') }],
        ['labClasses/c1', { expireAt: new Date('2027-05-01') }], ['labClasses/c1/progress/1-1', { expireAt: new Date('2027-05-01') }],
        ['customExperiments/x', { title: '지우면 안 됨' }]
    ]);
    const db = {
        collectionGroup: g => ({ where: (f, op, v) => ({ limit: () => ({ get: async () => {
            const hit = [...docs.keys()].filter(p => p.split('/').slice(-2)[0] === g && docs.get(p)[f] < v);
            return { empty: !hit.length, size: hit.length, docs: hit.map(p => ({ ref: p })) };
        } }) }) }),
        batch: () => { const del = []; return { delete: r => del.push(r), commit: async () => del.forEach(p => docs.delete(p)) }; }
    };
    const r = await cleanup(db, now);
    assert.deepEqual(r, { items: 1, raw: 0, progress: 1, labClasses: 1, labClassCodes: 0, devlog: 0 });
    assert.deepEqual([...docs.keys()].sort(), ['customExperiments/x', 'labSpaces/c1/items/b']);
    assert.ok(GROUPS.includes('labClassCodes'));
});
