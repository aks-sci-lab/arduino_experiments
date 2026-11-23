// 📱 응답 물음 (③): 띄운 물음(lesson.q, 정답 없음)·학생 기기마다 답 하나·띄운 동안만·2초에 한 번·남의 자리 못 씀·주인 교사만 목록·수업 지우면 함께
const test = require('node:test');
const assert = require('node:assert/strict');
const { LessonSlides: L } = require('../js/lesson-slides.js');
const LabStore = require('../js/lab-store.js');

test('응답 장 모양: 새 장만, 고를 답 2~6개(글자만)·정답 번호, 학생에게 보낼 물음엔 정답 없음, 프로젝터 그리기는 esc', () => {
    const M = L.applyEdit(null, { stages: { purpose: [
        { add: 'my-q1', kind: 'ask', title: '예상', ask: '<b>색</b>은?', reveal: '<p>풀이</p>', resp: { type: 'pick', choices: ['파랑', '<img src=x onerror=1>초록', '', '노랑'], answer: 1 } },
        { add: 'my-q2', kind: 'how', title: '한 줄', resp: { type: 'text' } },
        { add: 'my-q3', kind: 'ask', title: 'x', ask: 'y', resp: { type: 'pick', choices: ['하나'] } }
    ] } });
    const [a, b, c] = M.stages.purpose;
    assert.deepEqual(a.resp, { type: 'pick', choices: ['파랑', '초록', '노랑'], answer: 1 });
    assert.equal(a.mode, 'phone');
    assert.deepEqual(L.respQ(a), { type: 'pick', text: '색은?', choices: ['파랑', '초록', '노랑'] }, '정답은 보내지 않음');
    assert.deepEqual(L.respQ(b), { type: 'text', text: '한 줄' }, '물음이 없으면 제목');
    assert.equal(c.resp, undefined, '고를 답이 하나면 응답 장 아님');
    assert.equal(L.respQ({ key: 'force', resp: { type: 'text' }, title: 'x' }), null, '기본 장 key 는 응답 물음 아님');
    const ans = [{ jo: 1, num: 1, seat: '1-1', choice: 1 }, { jo: 2, num: 1, seat: '2-1-p', choice: 1 }, { jo: 2, num: 2, seat: '2-2', choice: 0 }];
    const h0 = L.respHtml(a, ans, false), h1 = L.respHtml(a, ans, true);
    assert.doesNotMatch(h0, /✅/, '풀이 전에는 정답 표시 없음');
    assert.match(h1, /<li class="ok">.*초록 ✅/);
    assert.match(h0, /답한 기기 <b>3<\/b>/);
    assert.match(h0, /<summary>🔧 선생님용: 조별 답<\/summary>.*1조 1번: B.*2조 1번📱: B.*2조 2번: A/);
    const t = L.respHtml(b, [{ jo: 1, num: 1, seat: '1-1', text: '<img src=x onerror=alert(1)>' }], false);
    assert.doesNotMatch(t, /<img/); assert.match(t, /&lt;img/);
    assert.match(L.render(a, false, {}), /class="ls-choices"/, '미리보기·발표 보기에 고를 답');
});

test('저장소: 띄운 물음에만·기기마다 하나·2초·남의 자리·주인만 목록·수업 지우면 함께', async () => {
    let now = Date.parse('2026-11-23T05:00:00Z');
    const db = LabStore.memoryDb({ now: () => new Date(now) }), core = LabStore.core(db);
    const T = b => core.handle(b, { uid: 't1', google: true }), T2 = b => core.handle(b, { uid: 't2', google: true });
    const S1 = b => core.handle(b, { uid: 's1' }), S2 = b => core.handle(b, { uid: 's2' });
    const c = await T({ action: 'createClass', ban: 1, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 1 });
    assert.equal(c.ok, true, c.error);
    const seat = (jo, num, x) => Object.assign({ action: 'answerSave', space: c.space, jo, num, key: 'my-q1' }, x);
    assert.equal((await S1(seat(1, 1, { choice: 0 }))).ok, false, '물음을 띄우기 전에는 못 씀');
    const q = { type: 'pick', text: '색은?', choices: ['파랑', '초록', '노랑'], answer: 1 };
    const r = await T({ action: 'classLesson', space: c.space, lesson: { on: true, stage: 'purpose', i: 0, key: 'my-q1', reveal: false, mode: 'phone', q } });
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(r.lesson.q, { type: 'pick', text: '색은?', choices: ['파랑', '초록', '노랑'] }, '정답은 수업 문서에 안 감');
    assert.deepEqual((await S1({ action: 'joinInfo', space: c.space })).lesson.q, r.lesson.q, '학생이 수업 문서로 물음을 읽음');
    assert.equal((await T({ action: 'classLesson', space: c.space, lesson: { on: true, stage: 'purpose', i: 0, key: 'force', q } })).lesson.q, undefined, '기본 장 key 에는 물음 안 붙음');
    await T({ action: 'classLesson', space: c.space, lesson: { on: true, stage: 'purpose', i: 0, key: 'my-q1', mode: 'phone', q } });
    assert.equal((await S1(seat(1, 1, { choice: 1 }))).ok, true);
    assert.equal((await S1(seat(1, 1, { choice: 2 }))).ok, false, '2초 안에 다시는 안 됨');
    now += 2500;
    assert.equal((await S1(seat(1, 1, { choice: 2 }))).ok, true, '2초 뒤 고쳐 쓰기');
    assert.equal((await S2(seat(1, 1, { choice: 0 }))).ok, false, '다른 기기는 그 자리에 못 씀');
    assert.equal((await S2(seat(1, 1, { choice: 0, phone: true }))).ok, true, '같은 자리의 📱 폰은 따로');
    assert.equal((await S2(seat(2, 1, { choice: 9 }))).ok, false, '없는 고를 답');
    assert.equal((await S2(seat(2, 1, { text: '글' }))).ok, false, '고르기 물음에 글은 안 됨');
    assert.equal((await S2(seat(9, 1, { choice: 0 }))).ok, false, '없는 조');
    assert.equal((await S2(seat(2, 1, { choice: 0, key: 'my-other' }))).ok, false, '띄운 물음이 아님');
    assert.deepEqual((await S1(Object.assign(seat(1, 1), { action: 'answerMine' }))).answer, { choice: 2 });
    assert.equal((await S2(Object.assign(seat(1, 1), { action: 'answerMine' }))).answer, null, '남의 답은 못 읽음');
    assert.equal((await S1({ action: 'answerList', space: c.space, key: 'my-q1' })).ok, false, '학생은 목록 못 봄');
    assert.equal((await T2({ action: 'answerList', space: c.space, key: 'my-q1' })).ok, false, '다른 교사는 못 봄');
    const list = await T({ action: 'answerList', space: c.space, key: 'my-q1' });
    assert.deepEqual(list.answers.map(a => [a.seat, a.choice]), [['1-1', 2], ['1-1-p', 0]]);
    // 글 물음
    now += 3000;
    await T({ action: 'classLesson', space: c.space, lesson: { on: true, stage: 'purpose', i: 1, key: 'my-q2', mode: 'phone', q: { type: 'text', text: '왜?' } } });
    assert.equal((await S1(Object.assign(seat(1, 1, { text: '  ' + 'ㄱ'.repeat(150) }), { key: 'my-q2' }))).ok, true);
    const t = (await T({ action: 'answerList', space: c.space, key: 'my-q2' })).answers[0].text;
    assert.equal(t.length, 100, '100자까지');
    assert.equal((await S1(Object.assign(seat(1, 1, { choice: 0 }), { key: 'my-q1' }))).ok, false, '내려간 물음에는 못 씀');
    // 설명을 끄면 못 씀
    now += 3000;
    await T({ action: 'classLesson', space: c.space, lesson: { on: false } });
    assert.equal((await S1(Object.assign(seat(1, 1, { text: '다시' }), { key: 'my-q2' }))).ok, false);
    assert.equal((await T({ action: 'deleteClass', space: c.space })).ok, true);
    assert.equal([...db.docs.keys()].filter(k => /\/answers\//.test(k)).length, 0, '수업 지우면 답도');
});
