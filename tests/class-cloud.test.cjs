// 수업 연결(교사·학생 로그인 없이): 조 나누기·코드·학생 링크·진행 요약, 그리고 Apps Script(Code.gs 4판)의 classes·progress
const test = require('node:test');
const assert = require('node:assert/strict');
const CC = require('../js/class-cloud.js');
const PC = require('../js/planck-cloud.js');
const PD = require('../js/pendulum-cloud.js');
const { loadCodeGs } = require('./fake-apps-script.cjs');

test('조 나누기: 인원을 고르게 (26명·4명 → 4·4·4·4·4·3·3), 서버와 같음', () => {
    assert.deepEqual(CC.splitGroups(26, 4), [4, 4, 4, 4, 4, 3, 3]);
    assert.deepEqual(CC.splitGroups(24, 4), [4, 4, 4, 4, 4, 4]);
    assert.deepEqual(CC.splitGroups(5, 4), [3, 2]);
    assert.deepEqual(CC.splitGroups(1, 4), [1]);
    assert.deepEqual(CC.splitGroups(0, 4), []);
    assert.deepEqual(CC.splitGroups(30, 11), []);
    const app = loadCodeGs();
    for (let n = 1; n <= 60; n++) for (let g = 1; g <= 10; g++) {
        const a = CC.splitGroups(n, g);
        assert.deepEqual(Array.from(app.ctx.splitGroups(n, g)), a, n + '/' + g);
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

test('Apps Script: 수업 만들기 → 수업 코드·조 코드가 날짜로 바뀌지 않고, 열쇠는 해시만 저장', () => {
    const app = loadCodeGs();
    const r = app.post({ action: 'createClass', ban: 2, nStudents: 26, groupSize: 4, exp: 'planck' });
    assert.equal(r.ok, true, r.error);
    assert.match(r.classCode, /^2-\d{4}$/);
    const four = r.classCode.split('-')[1];
    assert.deepEqual(r.groups.map(g => g.size), [4, 4, 4, 4, 4, 3, 3]);
    assert.deepEqual(r.groups.map(g => g.code), [1, 2, 3, 4, 5, 6, 7].map(j => '2-' + j + '-' + four));
    r.groups.forEach(g => assert.ok(PD.isGroupCode(g.code)));
    assert.match(r.key, /^[0-9a-f]{12}$/);
    const sh = app.ss.getSheetByName('classes');
    assert.equal(sh.rows[1][1], r.classCode, '수업 코드가 글자 그대로 (날짜 아님)');
    assert.equal(sh.written[1][1], "'" + r.classCode);
    assert.ok(!JSON.stringify(sh.rows).includes(r.key), '열쇠 자체는 시트에 없음');
    assert.match(String(sh.rows[1][7]), /^[0-9a-f]{64}$/);
    // 학생용 정보: 열쇠·해시 없음
    const j = app.get({ action: 'joinInfo', class: r.classCode });
    assert.equal(j.ok, true);
    assert.deepEqual(j.groups, r.groups);
    assert.ok(!('key' in j) && !('keyHash' in j));
    assert.match(app.get({ action: 'joinInfo', class: '2-0000' === r.classCode ? '2-0001' : '2-0000' }).error, /찾지 못했습니다/);
    assert.match(app.get({ action: 'joinInfo', class: '2-3-4821' }).error, /형식/);
    // 수업 코드가 겹치지 않음
    const codes = new Set([r.classCode]);
    for (let i = 0; i < 30; i++) codes.add(app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'planck' }).classCode);
    assert.equal(codes.size, 31);
});

test('Apps Script: 수업 만들기 값 검사', () => {
    const app = loadCodeGs();
    const bad = o => app.post(Object.assign({ action: 'createClass', ban: 2, nStudents: 20, groupSize: 4, exp: 'planck' }, o)).error;
    assert.match(bad({ ban: 0 }), /반/);
    assert.match(bad({ nStudents: 61 }), /학생 수/);
    assert.match(bad({ groupSize: 0 }), /조별 인원/);
    assert.match(bad({ nStudents: 2.5 }), /정수/);
    assert.match(bad({ exp: 'pendulum' }), /수업 연결을 쓸 수 없습니다/);
});

test('Apps Script: 학생 신호는 조·번호마다 한 줄 고쳐 쓰고, 없는 자리는 거절', () => {
    const app = loadCodeGs();
    const c = app.post({ action: 'createClass', ban: 3, nStudents: 7, groupSize: 4, exp: 'planck' });   // 4·3
    const beat = o => app.post(Object.assign({ action: 'heartbeat', class: c.classCode, jo: 1, num: 2, step: 'data', points: 4, submitted: false, device: 'nab12cd' }, o));
    assert.deepEqual(beat({}), { ok: true, updated: false });
    assert.deepEqual(beat({ step: 'result', points: 9, submitted: true }), { ok: true, updated: true });
    assert.deepEqual(beat({ jo: 2, num: 3 }), { ok: true, updated: false });
    assert.match(beat({ jo: 2, num: 4 }).error, /없는 조·번호/);
    assert.match(beat({ jo: 3, num: 1 }).error, /없는 조·번호/);
    assert.match(beat({ class: '3-9999' === c.classCode ? '3-9998' : '3-9999' }).error, /찾지 못했습니다/);
    assert.equal(beat({ step: '<b>x</b>', device: '!!' }).ok, true);
    const rows = app.ss.getSheetByName('progress').rows;
    assert.equal(rows.length, 1 + 2);
    assert.equal(rows[1][1], c.classCode); assert.equal(rows[1][2], '3-1-' + c.classCode.split('-')[1]);
    assert.equal(rows[1][5], '', '이상한 단계 이름은 빈칸'); assert.equal(rows[1][9], '');
});

test('Apps Script: 진행 보기는 열쇠가 맞을 때만, 조별 플랑크 제출 요약 포함', () => {
    const app = loadCodeGs();
    const c = app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 4, exp: 'planck' });
    app.post({ action: 'heartbeat', class: c.classCode, jo: 1, num: 1, step: 'data', points: 4, submitted: true, device: 'nab12cd' });
    app.post({ action: 'heartbeat', class: c.classCode, jo: 2, num: 3, step: 'theory', points: 0, device: 'nzz9999' });
    // 1조가 플랑크 조 공유로 보냄 (기존 planck 시트), 다른 수업의 조는 섞이지 않음
    const ivFor = vt => [0, 0.1, 0.2, 0.3].map(d => ({ v: +(vt + d).toFixed(3), i: +(d * 40).toFixed(3) }));
    const leds = [{ id: 'red', key: 'red', name: '빨강', lambda: 625, iv: ivFor(1.8), glow: [] }, { id: 'blue', key: 'blue', name: '파랑', lambda: 470, iv: ivFor(2.5), glow: [] }];
    const pls = PC.buildPayloads({ group: c.groups[0].code, device: 'nab12cd', leds, v0: () => 1.8, summary: { hCurrent: 6.5, errorPct: -1.9 }, now: '2026-11-16T01:00:00.000Z' }, PD.isGroupCode).payloads;
    pls.forEach(p => assert.equal(app.post(p).ok, true));
    app.post(Object.assign({}, pls[0], { group: '9-1-0000' }));
    assert.match(app.post({ action: 'classStatus', class: c.classCode, key: 'wrong' }).error, /열쇠/);
    assert.match(app.post({ action: 'classStatus', class: c.classCode }).error, /열쇠/);
    // GET 으로는 받지 않음 (열쇠가 주소에 남지 않게)
    assert.match(app.get({ action: 'classStatus', class: c.classCode, key: c.key }).error, /알 수 없는|형식/);
    const st = app.post({ action: 'classStatus', class: c.classCode, key: c.key });
    assert.equal(st.ok, true, st.error);
    assert.equal(st.students.length, 2);
    const s1 = st.students.find(x => x.jo === 1);
    assert.deepEqual([s1.num, s1.step, s1.points, s1.submitted, s1.device], [1, 'data', 4, true, 'nab12cd']);
    assert.equal(typeof s1.lastSeen, 'string');
    assert.equal(st.submissions[0].rows, 2); assert.deepEqual(st.submissions[0].leds, ['빨강', '파랑']);
    assert.equal(st.submissions[0].hCurrent, 6.5); assert.equal(st.submissions[0].devices, 1);
    assert.equal(st.submissions[1].rows, 0);
    const sum = CC.summarize(st);
    assert.deepEqual([sum.joined, sum.total, sum.submittedGroups], [2, 8, 1]);
    // 진자·플랑크 기존 동작은 그대로
    assert.equal(app.get({ action: 'list', exp: 'planck', group: c.groups[0].code }).items.length, 2);
    assert.equal(app.get({ action: 'list', group: c.groups[0].code }).items.length, 0);
    assert.ok(app.get({ action: 'ping' }).version >= 4);
});

test('요청 도우미: 주소 없음·로그인 화면·열쇠는 POST 본문으로', async () => {
    assert.equal((await CC.ping('')).noConfig, true);
    let seen = null;
    const fake = async (url, init) => { seen = { url, init }; return { text: async () => '{"ok":true}' }; };
    await CC.classStatus('https://s/exec', '2-4821', 'abc123', fake);
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers['Content-Type'], 'text/plain;charset=utf-8');
    assert.ok(!seen.url.includes('abc123'));
    assert.deepEqual(JSON.parse(seen.init.body), { action: 'classStatus', class: '2-4821', key: 'abc123' });
    await CC.joinInfo('https://s/exec', '2-4821', fake);
    assert.match(seen.url, /\?action=joinInfo&class=2-4821&_=\d+$/);
    assert.equal(seen.init.method, 'GET');
    const html = async () => ({ text: async () => '<html>login</html>' });
    assert.match((await CC.ping('https://s/exec', html)).error, /모든 사용자/);
    const boom = async () => { throw new Error('Failed to fetch'); };
    assert.equal((await CC.heartbeat('https://s/exec', { classCode: '2-4821', jo: 1, num: 1 }, boom)).network, true);
});
