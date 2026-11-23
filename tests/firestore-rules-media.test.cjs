// Firestore 규칙 — 필름통 로켓 🎯 도전 장면 사진·영상 (labClasses/{수업}/media): 그 팀 폰만 쓰고, 주인 교사만 읽고 지움, 크기·모양·7일
// 실행: FIRESTORE_EMULATOR_HOST 가 있고 @firebase/rules-unit-testing·firebase 를 찾을 수 있을 때만 (없으면 건너뜀)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const LabStore = require('../js/lab-store.js');

let RUT = null, firebase = null;
try { RUT = require('@firebase/rules-unit-testing'); firebase = require('firebase/compat/app'); require('firebase/compat/firestore'); } catch (e) { RUT = null; }
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = (!HOST && 'FIRESTORE_EMULATOR_HOST 없음') || (!RUT && '@firebase/rules-unit-testing 없음');

test('규칙: 도전 장면 사진·영상 (에뮬레이터)', { skip, timeout: 120000 }, async () => {
    const [host, port] = HOST.split(':');
    const env = await RUT.initializeTestEnvironment({ projectId: 'demo-media-' + Date.now(), firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
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
    const S3 = as(ctx('s3', 'anonymous'), { uid: 's3' });
    const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(5000), VIDEO = 'data:video/webm;base64,' + 'B'.repeat(20000);
    const ts = () => firebase.firestore.FieldValue.serverTimestamp();
    const doc = (o) => Object.assign({ jo: 1, part: 't1', kind: 'photo', data: PHOTO, masked: true, uid: 's1', at: ts(), expireAt: new Date(Date.now() + 7 * 86400000) }, o);
    try {
        const c = await T1({ action: 'createClass', ban: 4, mode: 'team', nTeams: 3, exp: 'rocket' });
        assert.equal(c.ok, true, c.error);
        assert.equal((await S1({ action: 'teamJoin', space: c.space, name: '별빛' })).jo, 1);
        assert.equal((await S2({ action: 'teamJoin', space: c.space, name: '달님' })).jo, 2);
        const P = 'labClasses/' + c.space + '/media/';
        // 그 팀 폰: 사진·영상 보내기, 다시 도전하면 덮어씀
        assert.equal((await S1({ action: 'mediaSave', space: c.space, jo: 1, part: 't1', kind: 'photo', data: PHOTO })).ok, true);
        assert.equal((await S1({ action: 'mediaSave', space: c.space, jo: 1, part: 't1', kind: 'video', data: VIDEO })).ok, true);
        const again = await S1({ action: 'mediaSave', space: c.space, jo: 1, part: 't1', kind: 'photo', data: PHOTO.replace(/A{10}$/, 'CCCCCCCCCC') });
        assert.equal(again.ok, true, again.error);
        // 다른 팀·팀 없는 폰은 남의 팀 자리에 못 씀
        assert.equal((await S2({ action: 'mediaSave', space: c.space, jo: 1, part: 't1', kind: 'photo', data: PHOTO })).ok, false);
        await RUT.assertFails(fsOf('s2').doc(P + '1~t1~photo').set(doc({ uid: 's2' })), '남의 팀 문서');
        await RUT.assertFails(fsOf('s3').doc(P + '3~t1~photo').set(doc({ jo: 3, uid: 's3' })), '자리 없는 팀');
        await RUT.assertSucceeds(fsOf('s2').doc(P + '2~t2~photo').set(doc({ jo: 2, part: 't2', uid: 's2' })));
        // 모양·크기: 가리지 않은 표시·큰 사진·다른 종류·긴 보관·다른 칸·번호 불일치는 막음
        await RUT.assertFails(fsOf('s1').doc(P + '1~t2~photo').set(doc({ part: 't2', masked: false })), 'masked false');
        await RUT.assertFails(fsOf('s1').doc(P + '1~t2~photo').set(doc({ part: 't2', data: 'data:image/jpeg;base64,' + 'A'.repeat(230000) })), '큰 사진');
        await RUT.assertFails(fsOf('s1').doc(P + '1~t2~video').set(doc({ part: 't2', kind: 'video', data: 'data:video/webm;base64,' + 'A'.repeat(900001) })), '큰 영상');
        await RUT.assertFails(fsOf('s1').doc(P + '1~t2~photo').set(doc({ part: 't2', data: 'data:text/html;base64,PHNjcmlwdD4=' })), 'html');
        await RUT.assertFails(fsOf('s1').doc(P + '1~t2~photo').set(doc({ part: 't2', data: 'data:image/svg+xml;base64,PHN2Zz4=' })), 'svg');
        await RUT.assertFails(fsOf('s1').doc(P + '1~t2~photo').set(doc({ part: 't2', expireAt: new Date(Date.now() + 30 * 86400000) })), '30일 보관');
        await RUT.assertFails(fsOf('s1').doc(P + '1~t2~photo').set(doc({ part: 't2', name: '홍길동' })), '다른 칸');
        await RUT.assertFails(fsOf('s1').doc(P + '1~t2~photo').set(doc({ part: 't1' })), '문서 번호와 part 다름');
        await RUT.assertFails(fsOf('s1').doc(P + '1~t3~photo').set(doc({ part: 't3' })), '없는 차시');
        // 읽기: 주인 교사만 (보낸 팀 폰·다른 팀·다른 교사·로그인 없음은 못 읽음)
        await RUT.assertFails(fsOf('s1').doc(P + '1~t1~photo').get(), '보낸 팀도 못 읽음');
        await RUT.assertFails(fsOf('s2').doc(P + '1~t1~photo').get(), '다른 팀');
        await RUT.assertFails(fsOf('s2').collection('labClasses/' + c.space + '/media').get(), '다른 팀 목록');
        await RUT.assertFails(fsOf('t2').doc(P + '1~t1~photo').get(), '다른 교사');
        await RUT.assertFails(env.unauthenticatedContext().firestore().doc(P + '1~t1~photo').get());
        assert.equal((await S2({ action: 'mediaGet', space: c.space, jo: 1, part: 't1', kind: 'photo' })).ok, false);
        const g = await T1({ action: 'mediaGet', space: c.space, jo: 1, part: 't1', kind: 'photo' });
        assert.equal(g.ok, true, g.error); assert.match(g.media.data, /C{10}$/, '덮어쓴 사진');
        // 지우기: 팀 폰은 못 지움, 수업 마치기 → 주인 교사가 모두 지움
        await RUT.assertFails(fsOf('s1').doc(P + '1~t1~photo').delete());
        const d = await T1({ action: 'classDone', space: c.space, done: true });
        assert.equal(d.ok, true, d.error); assert.equal(d.mediaDeleted, 3);
        await env.withSecurityRulesDisabled(async c2 => { assert.equal((await c2.firestore().collection('labClasses/' + c.space + '/media').get()).size, 0); });
        // 마친 수업에는 core 가 더 받지 않음
        assert.equal((await S1({ action: 'mediaSave', space: c.space, jo: 1, part: 't1', kind: 'photo', data: PHOTO })).ok, false);
        // 수업 지우기도 media 를 지움
        const c2 = await T1({ action: 'createClass', ban: 5, mode: 'team', nTeams: 2, exp: 'rocket' });
        await S3({ action: 'teamJoin', space: c2.space, name: '해님' });
        assert.equal((await S3({ action: 'mediaSave', space: c2.space, jo: 1, part: 't2', kind: 'photo', data: PHOTO })).ok, true);
        assert.equal((await T1({ action: 'deleteClass', space: c2.space })).ok, true);
        await env.withSecurityRulesDisabled(async x => { assert.equal((await x.firestore().collection('labClasses/' + c2.space + '/media').get()).size, 0); });
    } finally {
        await env.cleanup();
    }
});
