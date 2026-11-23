// 필름통 로켓 계산 (js/film-rocket-math.js): 평균·목표 차이·세 점 → %·퀴즈 점수·요약, 팀 이름 정리(js/lab-store.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/film-rocket-math.js');
const LabStore = require('../js/lab-store.js');

test('같은 조건 반복 → 조건마다 평균·표준편차 (값 순서대로)', () => {
    const d = M.vars1().water;
    const rows = M.byValue([{ value: 15, y: 9 }, { value: 10, y: 12 }, { value: 15, y: 11 }, { value: 10, y: 14 }, { value: 15, y: 10 }, { value: 20, y: NaN }], d);
    assert.deepEqual(rows.map(r => r.value), [10, 15]);
    assert.equal(rows[0].mean, 13); assert.equal(rows[0].n, 2);
    assert.equal(rows[1].mean, 10); assert.equal(rows[1].n, 3);
    assert.ok(Math.abs(rows[1].sd - 1) < 1e-12);
    // 고르기형(조각 크기)은 순서 번호로
    const p = M.vars1().piece;
    assert.deepEqual(M.byValue([{ value: 'powder', y: 3 }, { value: 'whole', y: 9 }], p).map(r => r.value), ['whole', 'powder']);
    assert.equal(M.axisValue(p, 'powder'), 3);
});

test('목표와 차이: 실제 − 목표, 허용 오차 안이면 성공', () => {
    assert.deepEqual(M.targetDiff(13.5, 15, 2), { diff: -1.5, abs: 1.5, ok: true });
    assert.equal(M.targetDiff(18, 15, 2).ok, false);
    assert.equal(M.targetDiff(17, 15, 2).ok, true, '경계(딱 2초)도 성공');
    assert.equal(M.targetDiff(NaN, 15, 2), null);
});

test('세 점(발끝·정수리·로켓 꼭대기) → 아이 키의 몇 %', () => {
    // 발끝 y=900, 정수리 y=300 (아이 600 화소) — 로켓 꼭대기 y=300 → 100 %, y=0 → 150 %, y=600 → 50 %
    assert.equal(M.heightPct({ y: 900 }, { y: 300 }, { y: 300 }).pct, 100);
    assert.equal(M.heightPct({ y: 900 }, { y: 300 }, { y: 0 }).pct, 150);
    assert.equal(M.heightPct({ y: 900 }, { y: 300 }, { y: 600 }).pct, 50);
    assert.equal(M.heightPct({ y: 900, x: 10 }, { y: 300, x: 400 }, { y: 420, x: 50 }).pct, 80, 'x 는 상관없음');
    assert.match(M.heightPct({ y: 300 }, { y: 900 }, { y: 100 }).error, /정수리가 발끝보다 위/, '순서를 거꾸로 누름');
    assert.match(M.heightPct({ y: 900 }, { y: 300 }, { y: 1200 }).error, /발끝보다 아래/);
    assert.match(M.heightPct({ y: 900 }, null, null).error, /세 곳/);
    assert.equal(M.cmFrom(120, 130), 156);
    assert.equal(M.cmFrom(120, null), null);
    assert.equal(M.handPct('same'), 100);
});

test('+/− 단추: 값 목록에서 한 칸씩, 끝에서 멈춤', () => {
    const v = M.vars1({ waterMin: 5, waterMax: 20, waterStep: 5 }).water.values;
    assert.deepEqual(v, [5, 10, 15, 20]);
    assert.equal(M.stepIn(v, 10, 1), 15);
    assert.equal(M.stepIn(v, 20, 1), 20);
    assert.equal(M.stepIn(v, 5, -1), 5);
    assert.equal(M.stepIn(v, 12, 1), 15, '목록에 없는 값은 가까운 아래 값에서');
    assert.equal(M.tabletLabel(2), '½ 알'); assert.equal(M.tabletLabel(4), '1 알'); assert.equal(M.tabletLabel(5), '1 ¼ 알');
});

test('선생님 설정 합치기: 범위가 뒤집히면 고치고, 기본값은 범위 안으로', () => {
    const s = M.mergeSetup({ waterMin: 10, waterMax: 5, waterBase: 30, pieces: 'powder,bad', pieceBase: 'whole', repeats: 0, targetTime: '' });
    assert.equal(s.waterMax, 10); assert.equal(s.waterBase, 10);
    assert.equal(s.pieces, 'powder'); assert.equal(s.pieceBase, 'powder');
    assert.equal(s.repeats, 1); assert.equal(s.targetTime, 15, '빈 값은 기본');
});

test('퀴즈 점수: 처음 10점, 두 번째 5점, 그 뒤 0점 → 팀 점수', () => {
    assert.equal(M.quizPoints(1, true), 10); assert.equal(M.quizPoints(2, true), 5); assert.equal(M.quizPoints(3, true), 0); assert.equal(M.quizPoints(1, false), 0);
    // 풀이가 열린 뒤 처음 고른 퀴즈(late): 맞혀도 5점까지
    assert.equal(M.quizPoints(1, true, true), 5); assert.equal(M.quizPoints(2, true, true), 5); assert.equal(M.quizPoints(3, true, true), 0);
    assert.equal(M.score({ a: { tries: 1, correct: true, late: true }, b: { tries: 1, correct: true } }).points, 15);
    const sc = M.score({ pressure: { tries: 1, correct: true }, control: { tries: 2, correct: true }, gas: { tries: 3, correct: true }, action: { tries: 1, correct: false } });
    assert.deepEqual(sc, { points: 15, correct: 3, total: 4 });
    Object.values(M.QUIZ).forEach(q => assert.equal(q.opts.filter(o => o.k === 'ok').length, 1, q.q + ' 정답 하나'));
    M.CONCEPTS.forEach(c => assert.equal(c.opts.filter(o => o.k === 'ok').length, 1));
});

test('운영계획서 문구 그대로 (이산화 탄소·작용 반작용 띄어 씀)', () => {
    assert.equal(M.DEF.force, '힘 = 물체의 모양이나 운동 상태를 바꾸는 원인');
    assert.equal(M.DEF.accel, '가속도 = 속도가 변하는 정도');
    assert.equal(M.DEF.pressure, '압력 = 일정한 넓이에 작용하는 힘');
    assert.match(M.DEF.gas, /이산화 탄소가 닫힌 필름통 안에 쌓여 압력이 커지고/);
    assert.match(M.DEF.control, /한 가지만 바꾸고 나머지는 같게 한다/);
    assert.match(M.DEF.action, /그 반작용으로 몸통이 위로 솟는다/);
    assert.match(M.DEF.design, /질량이 작을수록 가속도가 커지는/);
    const all = JSON.stringify([M.DEF, M.QUIZ, M.CONCEPTS, M.WHY]);
    assert.equal(/이산화탄소|작용반작용/.test(all), false);
});

test('처음 생각 → 지금 생각: 틀렸다가 맞게 바뀐 것만 ✨', () => {
    const ch = M.conceptChanges({ force: 'have', accel: 'ok', pressure: 'push' }, { force: 'ok', accel: 'ok', pressure: 'air' });
    assert.deepEqual(ch.map(c => c.sparkle), [true, false, false]);
    assert.deepEqual(ch.map(c => c.changed), [true, false, true]);
});

test('선생님께 보낼 요약·자료: 가장 가까운 도전, 최고 %, 아이 키는 빼고', () => {
    const st = {
        quiz: { pressure: { tries: 1, correct: true } },
        think: { first: { force: 'have' }, last: { force: 'ok' } },
        t1: { trials: [{ value: 10, y: 12 }, { value: 10, y: 13 }], challenge: [{ value: 15, y: 18, diff: 3 }, { value: 15, y: 14.2, diff: -0.8 }] },
        t2: { trials: [{ value: 2, pct: 130 }, { value: 4, pct: 95 }], challenge: [{ value: 4, pct: 92, diff: -8 }] },
        childCm: 128, stage: 't2'
    };
    const s = M.summary(st, { tolTime: 1, tolPct: 10 });
    assert.equal(s['팀 점수'], 10);
    assert.equal(s['시간 도전 차이(초)'], -0.8); assert.equal(s['시간 도전 성공'], 1);
    assert.equal(s['높이 최고(%)'], undefined, '결과판에서 뺀 최고 높이는 요약에도 없음');
    assert.equal(s['도전 장면'], undefined, '도전 장면을 안 보냈으면 칸 없음');
    assert.equal(M.summary(Object.assign({}, st, { media: { t1: 'v', t2: 'x' } }), {})['도전 장면'], 'vx');
    assert.equal(M.summary(Object.assign({}, st, { media: { t2: 'p' } }), {})['도전 장면'], '-p');
    assert.ok(Object.keys(M.summary(Object.assign({}, st, { media: { t1: 'v', t2: 'v' } }), {})).length <= 20, '요약 칸 20개 안');
    assert.equal(s['높이 도전 차이(%)'], -8); assert.equal(s['높이 도전 성공'], 1);
    assert.equal(s['열림 측정 수'], 4); assert.equal(s['로켓 발사 수'], 3);
    assert.equal(s['생각 바뀜 ✨'], 1);
    assert.ok(Object.keys(s).length <= 20, '공용 저장 요약 20개 이하');
    const p = JSON.stringify(M.payload(st));
    assert.equal(/128|childCm/.test(p), false, '아이 키는 보내지 않음');
    // 공용 저장이 받는 요약 모양 (이름·값 검사 통과)
    assert.equal(Object.keys(s).every(k => /^[^|\u0000-\u001f]{1,30}$/.test(k)), true);
});

test('팀 이름 정리 (js/lab-store.js): 12글자·꺾쇠·제어 문자, 겹침 열쇠', () => {
    assert.equal(LabStore.cleanTeamName('  별빛<script>가족  '), '별빛 script 가족');
    assert.equal(Array.from(LabStore.cleanTeamName('가나다라마바사아자차카타파하')).length, 12);
    assert.equal(LabStore.cleanTeamName('\u0000\n'), '');
    assert.equal(LabStore.teamKey('별빛 가족'), LabStore.teamKey('별빛가족'));
    assert.equal(LabStore.teamKey('Moon Team'), LabStore.teamKey('moon team'));
    assert.deepEqual(LabStore.cleanSetup({ targetTime: '20', pieces: 'whole,x,powder,whole', junk: 1 }), { targetTime: 20, pieces: 'whole,powder' });
    assert.throws(() => LabStore.cleanSetup({ targetTime: 9999 }), /행사 설정 값/);
});

test('팀 이름 수업 (가짜 저장소): 입장·같은 이름 막기·자리 다 참·남의 팀 쓰기 막기·지우기', async () => {
    const db = LabStore.memoryDb(), core = LabStore.core(db), T = { uid: 't1', google: true };
    assert.equal((await core.handle({ action: 'createClass', ban: 1, mode: 'team', nTeams: 2, exp: 'idealgas' }, T)).ok, false, '팀 이름은 로켓 실험만');
    const c = await core.handle({ action: 'createClass', ban: 1, mode: 'team', nTeams: 2, exp: 'rocket', setup: { targetTime: 12 } }, T);
    assert.equal(c.ok, true, c.error); assert.equal(c.mode, 'team'); assert.equal(c.groups.length, 2); assert.equal(c.setup.targetTime, 12);
    const a = await core.handle({ action: 'teamJoin', space: c.space, name: '별빛 가족', device: 'nabc123' }, { uid: 'a' });
    assert.equal(a.ok, true); assert.equal(a.jo, 1); assert.equal(a.group, c.groups[0].code);
    assert.match((await core.handle({ action: 'teamJoin', space: c.space, name: '별빛가족' }, { uid: 'b' })).error, /같은 이름/);
    assert.equal((await core.handle({ action: 'teamJoin', space: c.space, name: '다른 이름' }, { uid: 'a' })).again, true, '같은 폰은 그 팀으로');
    assert.equal((await core.handle({ action: 'teamJoin', space: c.space, name: '달님' }, { uid: 'b' })).jo, 2);
    assert.match((await core.handle({ action: 'teamJoin', space: c.space, name: '해님' }, { uid: 'c' })).error, /자리가 다 찼/);
    // 저장: 그 팀 폰만
    const body = { action: 'save', space: c.space, exp: 'rocket', group: a.group, id: 'nabc123-team', device: 'nabc123', n: 1, summary: { '팀 점수': 10 }, data: '{}' };
    assert.equal((await core.handle(body, { uid: 'b' })).ok, false);
    assert.equal((await core.handle(Object.assign({}, body, { space: '' }), { uid: 'a' })).ok, false, '수업 공간이 아니면 못 씀');
    assert.equal((await core.handle(body, { uid: 'a' })).ok, true);
    const st = await core.handle({ action: 'classStatus', space: c.space }, T);
    assert.deepEqual(st.teams, [{ jo: 1, name: '별빛 가족' }, { jo: 2, name: '달님' }]);
    assert.equal(st.submissions[0].summary['팀 점수'], 10);
    // 설정 고치기는 주인만
    assert.equal((await core.handle({ action: 'classSetup', space: c.space, setup: { targetTime: 20 } }, { uid: 'x', google: true })).ok, false);
    assert.equal((await core.handle({ action: 'classSetup', space: c.space, setup: { targetTime: 20 } }, T)).ok, true);
    assert.equal((await core.handle({ action: 'classInfo', space: c.space }, { uid: 'a' })).setup.targetTime, 20);
    // CSV 에 팀 이름 열
    const ex = await core.handle({ action: 'classExport', space: c.space }, T);
    const csv = LabStore.toCsv('rocket', ex.items, c.groups.map(g => Object.assign({}, g, { team: (ex.teams.find(t => t.jo === g.jo) || {}).name })));
    assert.match(csv.csv, /팀 이름/); assert.match(csv.csv, /별빛 가족/);
    // 수업 지우면 팀도
    await core.handle({ action: 'deleteClass', space: c.space }, T);
    assert.deepEqual(Object.keys(db.dump('labClasses/' + c.space)), []);
    // 로켓은 팀 이름 수업으로만, 조 방식 수업에는 팀 입장 안 됨
    assert.match((await core.handle({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'rocket' }, T)).error, /팀 이름으로 입장/);
    const g = await core.handle({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'idealgas' }, T);
    assert.equal(g.ok, true); assert.equal(g.mode, '');
    assert.match((await core.handle({ action: 'teamJoin', space: g.space, name: '팀' }, { uid: 'a' })).error, /팀 이름으로 들어가는 수업이 아니/);
});

test('인터넷 문제와 다른 오류 나누기 (js/lab-store.js): 익명 로그인 꺼짐·권한·한도는 network 아님', async () => {
    const E = (code, message) => Object.assign(new Error(message || code), { code });
    assert.equal(LabStore.isNetworkError(E('auth/admin-restricted-operation', 'Firebase: Error (auth/admin-restricted-operation).')), false);
    assert.match(LabStore.friendlyError(E('auth/admin-restricted-operation')), /익명 로그인이 꺼져 있어요/);
    assert.equal(LabStore.isNetworkError(E('auth/operation-not-allowed')), false);
    assert.equal(LabStore.isNetworkError(E('permission-denied', 'Missing or insufficient permissions.')), false);
    assert.equal(LabStore.isNetworkError(E('resource-exhausted', 'Quota exceeded.')), false);
    assert.equal(LabStore.isNetworkError(E('auth/network-request-failed')), true);
    assert.equal(LabStore.isNetworkError(E('unavailable', 'Failed to get document because the client is offline.')), true);
    assert.equal(LabStore.isNetworkError(new TypeError('Failed to fetch')), true);
    assert.equal(LabStore.isNetworkError(new TypeError('Load failed')), true, '아이폰 사파리');
    assert.equal(LabStore.isNetworkError(new Error('시간 초과 — 인터넷 연결을 확인하세요')), true);
    assert.equal(LabStore.isNetworkError(new Error('불러오지 못함: https://www.gstatic.com/…')), true);
    // core 안에서 난 오프라인 오류도 network 표시
    const db = LabStore.memoryDb();
    db.get = () => Promise.reject(E('unavailable', 'client is offline'));
    const r = await LabStore.core(db).handle({ action: 'joinInfo', space: 'c' + 'a'.repeat(23) }, { uid: 'x' });
    assert.equal(r.ok, false); assert.equal(r.network, true);
    db.get = () => Promise.reject(E('permission-denied', 'Missing or insufficient permissions.'));
    const r2 = await LabStore.core(db).handle({ action: 'joinInfo', space: 'c' + 'a'.repeat(23) }, { uid: 'x' });
    assert.equal(r2.network, undefined); assert.match(r2.error, /권한 없음/);
});
