// 수업 연결(교사 구글 로그인, 학생 로그인 없이): 조 나누기·코드·학생 링크·진행 요약, 그리고 저장소(js/lab-store.js, 가짜 메모리 DB)의 수업·진행
const test = require('node:test');
const assert = require('node:assert/strict');
const CC = require('../js/class-cloud.js');
const PD = require('../js/pendulum-cloud.js');
const { loadLabStore } = require('./fake-lab-store.cjs');

test('조 나누기: 인원을 고르게 (26명·4명 → 4·4·4·4·4·3·3), 저장소와 같음', async () => {
    assert.deepEqual(CC.splitGroups(26, 4), [4, 4, 4, 4, 4, 3, 3]);
    assert.deepEqual(CC.splitGroups(24, 4), [4, 4, 4, 4, 4, 4]);
    assert.deepEqual(CC.splitGroups(5, 4), [3, 2]);
    assert.deepEqual(CC.splitGroups(1, 4), [1]);
    assert.deepEqual(CC.splitGroups(0, 4), []);
    assert.deepEqual(CC.splitGroups(30, 11), []);
    const app = loadLabStore();
    for (const [n, g] of [[26, 4], [7, 4], [30, 6], [13, 3], [1, 1]]) {
        const r = await app.post({ action: 'createClass', ban: 2, nStudents: n, groupSize: g, exp: 'planck' });
        assert.deepEqual(r.groups.map(x => x.size), CC.splitGroups(n, g), n + '/' + g);
    }
    for (let n = 1; n <= 60; n++) for (let g = 1; g <= 10; g++) {
        const a = CC.splitGroups(n, g);
        assert.equal(a.reduce((x, y) => x + y, 0), n);
        assert.ok(Math.max(...a) <= g && Math.max(...a) - Math.min(...a) <= 1);
    }
});

test('수업 코드·학생 링크·주소 읽기', () => {
    assert.ok(CC.isClassCode('2-4821'));
    for (const bad of ['', '2-482', '2-3-4821', 'a-4821', '123-4821']) assert.equal(CC.isClassCode(bad), false, bad);
    assert.equal(CC.normalizeClass(' ２ – ４８２１ '), '2-4821');
    assert.equal(CC.studentUrl('https://x.web.app/', 'planck', '2-4821', 'AKfyc_abcdefghijklmnopqrstuv'),
        'https://x.web.app/projects/planck-led.html?c=2-4821&s=AKfyc_abcdefghijklmnopqrstuv');
    assert.equal(CC.studentUrl('https://x.web.app', 'planck', '2-4821', ''), 'https://x.web.app/projects/planck-led.html?c=2-4821');
    assert.equal(CC.studentUrl('https://x', 'nope', '2-4821'), '');
    assert.equal(CC.readClassParam('?c=2-4821&s=abc'), '2-4821');
    assert.equal(CC.readClassParam('?s=abc&c=2%2D4821'), '2-4821');
    assert.equal(CC.readClassParam('?c=<script>'), '');
    assert.equal(CC.readClassParam(''), '');
});

test('진행 요약: 들어옴·활동 중·쉬는 중(5분)·제출한 조', () => {
    const now = '2026-11-16T01:00:00.000Z';
    const st = {
        exp: 'planck', now,
        groups: [{ jo: 1, code: '2-1-4821', size: 2 }, { jo: 2, code: '2-2-4821', size: 2 }],
        students: [
            { jo: 1, num: 1, step: 'data', points: 4, submitted: true, lastSeen: '2026-11-16T00:59:30.000Z' },
            { jo: 1, num: 2, step: 'theory', points: 0, submitted: false, lastSeen: '2026-11-16T00:50:00.000Z' },
            { jo: 2, num: 1, step: 'result', points: 8, submitted: false, lastSeen: '2026-11-16T00:58:00.000Z' }
        ],
        submissions: [{ code: '2-1-4821', rows: 3, leds: ['빨강'] }, { code: '2-2-4821', rows: 0, leds: [] }]
    };
    const s = CC.summarize(st);
    assert.deepEqual([s.total, s.joined, s.active, s.idle, s.submittedGroups], [4, 3, 2, 1, 1]);
    assert.equal(s.groups[0].members[1].state.cls, 'idle');
    assert.equal(s.groups[1].members[1].state.cls, 'none');
    assert.equal(CC.agoText(s.groups[0].members[0].state.ago), '30초 전');
    assert.equal(CC.agoText(s.groups[1].members[0].state.ago), '2분 전');
    assert.equal(CC.stepName('planck', 'data'), '5 데이터');
});

test('저장소: 수업 만들기 → 수업 코드·조 코드·수업 공간, 학생용 정보에는 주인 정보 없음', async () => {
    const app = loadLabStore();
    const r = await app.post({ action: 'createClass', ban: 2, nStudents: 26, groupSize: 4, exp: 'planck' });
    assert.equal(r.ok, true, r.error);
    assert.match(r.classCode, /^2-\d{4}$/);
    const four = r.classCode.split('-')[1];
    assert.deepEqual(r.groups.map(g => g.code), [1, 2, 3, 4, 5, 6, 7].map(j => '2-' + j + '-' + four));
    r.groups.forEach(g => assert.ok(PD.isGroupCode(g.code)));
    assert.match(r.space, /^c[a-z0-9]{23}$/);
    const j = await app.post({ action: 'joinInfo', class: r.classCode }, {});
    assert.equal(j.ok, true, j.error);
    assert.deepEqual(j.groups, r.groups);
    assert.ok(!JSON.stringify(j).includes('teacher-1'), '학생용 정보에 선생님 uid 없음');
    assert.match((await app.post({ action: 'joinInfo', class: '2-3-4821' }, {})).error, /형식/);
});

test('저장소: 수업 만들기 값 검사', async () => {
    const app = loadLabStore();
    const bad = async o => (await app.post(Object.assign({ action: 'createClass', ban: 2, nStudents: 20, groupSize: 4, exp: 'planck' }, o))).error;
    assert.match(await bad({ ban: 0 }), /반/);
    assert.match(await bad({ nStudents: 61 }), /학생 수/);
    assert.match(await bad({ groupSize: 0 }), /조별 인원/);
    assert.match(await bad({ exp: 'nope' }), /수업 연결을 쓸 수 없습니다/);
    assert.equal((await app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 4, exp: 'custom:abcDEF_12' })).ok, true);
});

test('저장소: 학생 신호는 조·번호마다 하나, 없는 자리는 거절, 진행 요약까지', async () => {
    const app = loadLabStore();
    const c = await app.post({ action: 'createClass', ban: 3, nStudents: 7, groupSize: 4, exp: 'planck' });   // 4·3
    const STU = { uid: 'stu-1', anonymous: true };
    const beat = o => app.post(Object.assign({ action: 'heartbeat', class: c.classCode, space: c.space, jo: 1, num: 2, step: 'data', points: 4, submitted: false, device: 'nab12cd' }, o), STU);
    assert.equal((await beat({})).ok, true);
    assert.equal((await beat({ step: 'result', points: 9, submitted: true })).ok, true);
    assert.equal((await beat({ jo: 2, num: 3 })).ok, true);
    assert.match((await beat({ jo: 2, num: 4 })).error, /없는 조·번호/);
    assert.equal(app.progress().length, 2, '같은 자리는 고쳐 씀');
    const st = await app.post({ action: 'classStatus', class: c.classCode, space: c.space });
    assert.equal(st.ok, true, st.error);
    const sum = CC.summarize(st);
    assert.equal(sum.joined, 2);
});

test('요청 도우미: 예전 시트 주소는 쓰지 않고 안내만', async () => {
    const r = await CC.joinInfo('https://script.google.com/macros/s/AKfycbx_abcdefghijklmnopqrstuvwxyz/exec', '2-4821');
    assert.equal(r.ok, false);
    assert.equal(r.legacy, true);
    assert.match(r.error, /새 QR/);
    assert.equal(typeof CC.update, 'undefined', '서버 업데이트 기능은 없앰');
    assert.equal(typeof CC.claimAdmin, 'undefined');
});
