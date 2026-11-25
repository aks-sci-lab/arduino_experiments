// Firestore 규칙 — 교사 등록 공용 무선 센서 도구 bleSensors/{docId}: 누구나 읽기, 사이트 관리 교사(isTeacher)만 쓰기·삭제
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');

let RUT = null, firebase = null;
try { RUT = require('@firebase/rules-unit-testing'); firebase = require('firebase/compat/app'); require('firebase/compat/firestore'); } catch (e) { RUT = null; }
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const skip = (!HOST && 'FIRESTORE_EMULATOR_HOST 없음') || (!RUT && '@firebase/rules-unit-testing 없음');

test('규칙: 공용 무선 센서 도구 bleSensors (에뮬레이터)', { skip, timeout: 120000 }, async () => {
    const [host, port] = HOST.split(':');
    const env = await RUT.initializeTestEnvironment({
        projectId: 'demo-blesensors-' + Date.now(),
        firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') }
    });
    const ts = firebase.default.firestore.FieldValue.serverTimestamp();
    const teacherDb = env.authenticatedContext('t-admin', { email: 'lany0665@gmail.com', firebase: { sign_in_provider: 'google.com' } }).firestore();
    const otherGoogleDb = env.authenticatedContext('g-user', { email: 'student@example.com', firebase: { sign_in_provider: 'google.com' } }).firestore();
    const anonDb = env.authenticatedContext('anon-1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    const guestDb = env.unauthenticatedContext().firestore();

    const validDoc = {
        name: '학교 무선 온도계',
        json: JSON.stringify({ schema: 'sensor-lab-ble-decoder', version: 1, name: '학교 무선 온도계', characteristics: [] }),
        experiments: ['thermal', 'tempdash'],
        updatedAt: ts,
        updatedBy: 't-admin'
    };

    try {
        // 교사 쓰기 성공
        await RUT.assertSucceeds(teacherDb.doc('bleSensors/th-sensor-1').set(validDoc));
        // 누구나 읽기 성공 (로그인 없는 학생 노트북·익명·구글)
        await RUT.assertSucceeds(guestDb.doc('bleSensors/th-sensor-1').get());
        await RUT.assertSucceeds(guestDb.collection('bleSensors').get());
        await RUT.assertSucceeds(anonDb.doc('bleSensors/th-sensor-1').get());
        // 비교사 구글·익명·비로그인 쓰기/삭제 차단
        await RUT.assertFails(otherGoogleDb.doc('bleSensors/th-sensor-2').set(validDoc));
        await RUT.assertFails(anonDb.doc('bleSensors/th-sensor-2').set(validDoc));
        await RUT.assertFails(guestDb.doc('bleSensors/th-sensor-2').set(validDoc));
        await RUT.assertFails(otherGoogleDb.doc('bleSensors/th-sensor-1').delete());
        await RUT.assertFails(anonDb.doc('bleSensors/th-sensor-1').delete());
        // 모양 검사: 잘못된 ID, 모르는 필드, 40KB 초과, experiments 20개 초과
        await RUT.assertFails(teacherDb.doc('bleSensors/Bad ID!').set(validDoc));
        await RUT.assertFails(teacherDb.doc('bleSensors/th-bad-extra').set(Object.assign({}, validDoc, { hack: 1 })));
        await RUT.assertFails(teacherDb.doc('bleSensors/th-big').set(Object.assign({}, validDoc, { json: 'x'.repeat(40001) })));
        await RUT.assertFails(teacherDb.doc('bleSensors/th-many').set(Object.assign({}, validDoc, { experiments: Array.from({ length: 21 }, (_, i) => 'e' + i) })));
        // 교사 삭제 성공
        await RUT.assertSucceeds(teacherDb.doc('bleSensors/th-sensor-1').delete());
    } finally {
        await env.cleanup();
    }
});
