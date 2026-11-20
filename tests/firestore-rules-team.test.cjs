// Firestore 규칙 — '팀 이름으로 입장' 수업(가족 행사, 필름통 로켓): 팀 자리·팀 줄은 그 팀 폰만, 행사 설정은 주인 교사만
// 실행: FIRESTORE_EMULATOR_HOST 가 있고 @firebase/rules-unit-testing·firebase 를 찾을 수 있을 때만 (없으면 건너뜀, tests/firestore-rules.test.cjs 와 같음)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const LabStore = require('../js/lab-store.js');

let RUT = null, firebase = null;
try { RUT = require('@firebase/rules-unit-testing'); firebase = require('firebase/compat/app'); require('firebase/compat/firestore'); } catch (e) { RUT = null; }
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = (!HOST && 'FIRESTORE_EMULATOR_HOST 없음') || (!RUT && '@firebase/rules-unit-testing 없음');

test('규칙: 팀 이름 수업 (에뮬레이터)', { skip, timeout: 120000 }, async () => {
    const [host, port] = HOST.split(':');
    const env = await RUT.initializeTestEnvironment({ projectId: 'demo-team-' + Date.now(), firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
    const ctxs = {};
    const ctx = (uid, provider) => {
        if (ctxs[uid]) return ctxs[uid];
        const c = env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } });
        let fsx = null;
        return (ctxs[uid] = { firestore: () => fsx || (fsx = c.firestore()) });
    };
    const store = c => { const fsx = c.firestore(); return LabStore.firestoreDb({ firestore: () => fsx, raw: firebase.default || firebase }); };
    const as = (c, auth) => { const core = LabStore.core(store(c)); return body => core.handle(body, auth); };
    const T1 = as(ctx('t1', 'google.com'), { uid: 't1', google: true });
    const T2 = as(ctx('t2', 'google.com'), { uid: 't2', google: true });
    const S1 = as(ctx('s1', 'anonymous'), { uid: 's1' });
    const S2 = as(ctx('s2', 'anonymous'), { uid: 's2' });
    const fsOf = uid => ctx(uid, uid[0] === 't' ? 'google.com' : 'anonymous').firestore();
    const later = () => new Date(Date.now() + 86400000);
    try {
        const c = await T1({ action: 'createClass', ban: 3, mode: 'team', nTeams: 3, exp: 'rocket', setup: { targetTime: 14, tolTime: 2, pieces: 'whole,powder' } });
        assert.equal(c.ok, true, c.error); assert.equal(c.mode, 'team');
        // 예전 모양(조 방식) 수업도 그대로 만들어짐
        assert.equal((await T1({ action: 'createClass', ban: 3, nStudents: 4, groupSize: 2, exp: 'idealgas' })).ok, true);
        // 이상한 mode 는 규칙이 막음
        await RUT.assertFails(fsOf('t1').doc('labClasses/c' + 'x'.repeat(23)).set({ owner: 't1', classCode: '3-1111', ban: 3, nStudents: 1, groupSize: 1, exp: 'rocket', groups: [], mode: 'evil', createdAt: new Date(), expireAt: later() }));

        // 가족 입장
        const a = await S1({ action: 'teamJoin', space: c.space, name: '별빛 가족', device: 'pabc123' });
        assert.equal(a.ok, true, a.error); assert.equal(a.jo, 1);
        assert.match((await S2({ action: 'teamJoin', space: c.space, name: '별빛가족' })).error, /같은 이름/);
        const b = await S2({ action: 'teamJoin', space: c.space, name: '달님', device: 'pabc456' });
        assert.equal(b.ok, true, b.error); assert.equal(b.jo, 2);
        // 남의 팀 자리를 덮어쓰거나, 없는 자리를 만들 수 없음
        const seat = { name: '해킹', key: '해킹', uid: 's2', device: '', createdAt: firebase.firestore.FieldValue.serverTimestamp(), expireAt: later() };
        await RUT.assertFails(fsOf('s2').doc('labClasses/' + c.space + '/teams/1').set(seat));
        await RUT.assertFails(fsOf('s2').doc('labClasses/' + c.space + '/teams/9').set(seat));
        await RUT.assertFails(fsOf('s2').doc('labClasses/' + c.space + '/teams/3').set(Object.assign({}, seat, { uid: 's1' })), '다른 사람 uid 로 자리 잡기');
        await RUT.assertSucceeds(fsOf('s2').collection('labClasses/' + c.space + '/teams').get());
        await RUT.assertFails(env.unauthenticatedContext().firestore().collection('labClasses/' + c.space + '/teams').get());

        // 팀 줄: 그 팀 폰만
        const body = { action: 'save', space: c.space, exp: 'rocket', group: a.group, id: 'pabc123-team', device: 'pabc123', title: '별빛 가족', n: 2, summary: { '팀 점수': 10 }, data: '{}' };
        assert.equal((await S1(body)).ok, true);
        assert.equal((await S2(body)).ok, false, 'core 도 막음');
        const key = 'labSpaces/' + c.space + '/items/' + LabStore.docKey('rocket', a.group, 'pabc123-team');
        const fake = { exp: 'rocket', group: a.group, id: 'pabc123-team', device: 'pabc123', n: 1, summary: { '팀 점수': 999 }, data: '', uid: 's2', expireAt: later() };
        await RUT.assertFails(fsOf('s2').doc(key).set(fake), '남의 팀 줄 고치기');
        await RUT.assertFails(fsOf('s2').doc('labSpaces/' + c.space + '/items/rocket~' + a.group + '~pzzz-team').set(Object.assign({}, fake, { id: 'pzzz-team' })), '남의 팀 조 코드로 새 줄');
        await RUT.assertFails(fsOf('s1').doc('labSpaces/' + c.space + '/items/rocket~' + a.group + '~pq-team1').set(Object.assign({}, fake, { id: 'pq-team1', uid: 's2' })), 'uid 를 속임');
        await RUT.assertFails(fsOf('s1').doc('labSpaces/g' + a.group + '/items/x1').set(Object.assign({}, fake, { uid: 's1' })), '수업 공간이 아닌 곳의 로켓 줄');
        // 다른 실험 줄은 예전처럼
        assert.equal((await S2({ action: 'save', space: c.space, exp: 'idealgas', group: b.group, id: 'pabc456-r1', device: 'pabc456', n: 1, data: '' })).ok, true);

        // 교사: 진행·팀 이름, 행사 설정 고치기(주인만)
        const st = await T1({ action: 'classStatus', space: c.space });
        assert.equal(st.ok, true, st.error);
        assert.deepEqual(st.teams.map(t => t.name), ['별빛 가족', '달님']);
        assert.equal(st.submissions[0].summary['팀 점수'], 10);
        assert.equal((await T1({ action: 'classSetup', space: c.space, setup: { targetTime: 20 } })).ok, true);
        assert.equal((await S2({ action: 'classInfo', space: c.space })).setup.targetTime, 20);
        assert.equal((await T2({ action: 'classSetup', space: c.space, setup: { targetTime: 5 } })).ok, false);
        await RUT.assertFails(fsOf('s1').doc('labClasses/' + c.space).update({ setup: { targetTime: 1 } }), '가족은 설정을 못 고침');
        await RUT.assertFails(fsOf('t1').doc('labClasses/' + c.space).update({ owner: 't9' }), '주인도 설정 말고는 못 고침');

        // 수업 지우기: 팀 자리도
        assert.equal((await T1({ action: 'deleteClass', space: c.space })).ok, true);
        await env.withSecurityRulesDisabled(async c2 => {
            const left = await c2.firestore().collection('labClasses/' + c.space + '/teams').get();
            assert.equal(left.size, 0, '팀 자리도 지움');
        });
    } finally {
        await env.cleanup();
    }
});
