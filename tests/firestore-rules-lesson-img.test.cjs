// Firestore 규칙 — 📖 고친 수업 자료의 그림 lessonEdits/{uid}/imgs/{id}: 구글 로그인한 본인만, WebP·JPEG·PNG data URL 만, 크기, 고칠 수 없음(새 id 로)
// 실행: FIRESTORE_EMULATOR_HOST 가 있고 @firebase/rules-unit-testing·firebase 를 찾을 수 있을 때만 (없으면 건너뜀)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const LabStore = require('../js/lab-store.js');

let RUT = null, firebase = null;
try { RUT = require('@firebase/rules-unit-testing'); firebase = require('firebase/compat/app'); require('firebase/compat/firestore'); } catch (e) { RUT = null; }
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = (!HOST && 'FIRESTORE_EMULATOR_HOST 없음') || (!RUT && '@firebase/rules-unit-testing 없음');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('규칙: 고친 수업 자료 그림 lessonEdits/imgs (에뮬레이터)', { skip, timeout: 120000 }, async () => {
    const [host, port] = HOST.split(':');
    const env = await RUT.initializeTestEnvironment({ projectId: 'demo-limg-' + Date.now(), firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
    const ctxs = {};
    const ctx = (uid, provider) => { if (!ctxs[uid]) { const c = env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }); let f = null; ctxs[uid] = { firestore: () => f || (f = c.firestore()) }; } return ctxs[uid]; };
    const as = (uid, auth) => { const fsx = ctx(uid, 'google.com').firestore(); const core = LabStore.core(LabStore.firestoreDb({ firestore: () => fsx, raw: firebase.default || firebase })); return b => core.handle(b, auth); };
    const T1 = as('t1', { uid: 't1', google: true });
    try {
        const a = await T1({ action: 'lessonImgSave', exp: 'rocket', data: PNG, w: 1, h: 1 });
        assert.equal(a.ok, true, a.error);
        assert.equal((await T1({ action: 'lessonImgGet', id: a.id })).data, PNG);
        const sv = await T1({ action: 'lessonEditSave', exp: 'rocket', edit: { stages: { think: [{ ref: 'k:force', of: '힘', set: { img: a.ref } }] } } });
        assert.equal(sv.ok, true, sv.error);
        const b = await T1({ action: 'lessonImgSave', exp: 'rocket', data: PNG, w: 1, h: 1 });
        assert.equal((await T1({ action: 'lessonEditSave', exp: 'rocket', edit: { stages: { think: [{ ref: 'k:force', of: '힘', set: { img: b.ref } }] } } })).imagesRemoved, 1, '바꾼 옛 그림은 지움 (규칙: 본인 지우기)');
        const ts = firebase.default.firestore.FieldValue.serverTimestamp();
        const d = (uid, prov, p) => ctx(uid, prov).firestore().doc(p);
        const ok = { exp: 'rocket', data: PNG, w: 1, h: 1, createdAt: ts };
        const P = 'lessonEdits/t1/imgs/izzzzzzzzzzzzzzz';
        await RUT.assertFails(d('t2', 'google.com', 'lessonEdits/t1/imgs/' + b.id).get(), '다른 선생님은 못 읽음');
        await RUT.assertFails(d('t2', 'google.com', P).set(ok), '다른 선생님은 못 씀');
        await RUT.assertFails(d('t2', 'google.com', 'lessonEdits/t1/imgs/' + b.id).delete(), '다른 선생님은 못 지움');
        await RUT.assertFails(d('s1', 'anonymous', 'lessonEdits/s1/imgs/izzzzzzzzzzzzzzz').set(ok), '학생(익명)은 못 씀');
        await RUT.assertFails(d('s1', 'anonymous', 'lessonEdits/t1/imgs/' + b.id).get(), '학생은 못 읽음');
        await RUT.assertFails(d('t1', 'google.com', 'lessonEdits/t1/imgs/BAD').set(ok), 'id 모양');
        await RUT.assertFails(d('t1', 'google.com', P).set(Object.assign({}, ok, { data: 'data:image/svg+xml;base64,PHN2Zz4=' })), 'SVG 안 받음');
        await RUT.assertFails(d('t1', 'google.com', P).set(Object.assign({}, ok, { data: 'https://evil.example/x.png' })), '주소 안 받음');
        await RUT.assertFails(d('t1', 'google.com', P).set(Object.assign({}, ok, { data: 'data:image/png;base64,AAA"><script>' })), 'base64 글자만');
        await RUT.assertFails(d('t1', 'google.com', P).set(Object.assign({}, ok, { data: 'data:image/png;base64,' + 'A'.repeat(410000) })), '크기 한도');
        await RUT.assertFails(d('t1', 'google.com', P).set(Object.assign({}, ok, { w: 5000 })), '가로 크기');
        await RUT.assertFails(d('t1', 'google.com', P).set(Object.assign({}, ok, { extra: 1 })), '모르는 칸');
        await RUT.assertFails(d('t1', 'google.com', P).set(Object.assign({}, ok, { createdAt: new Date(2020, 1, 1) })), '서버 시각');
        await RUT.assertSucceeds(d('t1', 'google.com', P).set(ok));
        await RUT.assertFails(d('t1', 'google.com', P).set(ok), '고쳐 쓰기 없음 (바꾸면 새 그림)');
        const z = await T1({ action: 'lessonEditReset', exp: 'rocket' });
        assert.equal(z.ok, true, z.error); assert.equal(z.images, 2, '되돌리면 그 실험 그림 모두 지움');
    } finally { await env.cleanup(); }
});
