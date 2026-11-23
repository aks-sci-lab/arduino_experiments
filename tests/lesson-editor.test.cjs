// 📖 수업 자료 편집 (2026-11-23): 허용 태그만 남기기·고친 자료 모양(resolveEdit·toEdit·applyEdit)·저장소 요청(본인 계정만)
const test = require('node:test');
const assert = require('node:assert/strict');
const { LessonSlides: L, LessonContent: C } = require('../js/lesson-slides.js');
const LabStore = require('../js/lab-store.js');
global.LessonContent = C;
require('../js/lesson-content/rocket.js');
require('../js/lesson-content/qdot.js');

test('sanitize: 허용 태그·class 만, 스크립트·속성·그림은 버림', () => {
    const s = L.sanitize;
    assert.equal(s('<div>줄</div><div>둘</div>'), '<p>줄</p><p>둘</p>', 'div → p');
    assert.equal(s('<b onclick="x()">굵게</b>'), '<b>굵게</b>');
    assert.equal(s('<p class="ls-easy" style="color:red">쉬운 말</p>'), '<p class="ls-easy">쉬운 말</p>');
    assert.equal(s('<p class="a&quot;onload=1">x</p>'), '<p>x</p>', '이상한 class 는 버림');
    assert.equal(s('a<script>alert(1)</script>b<style>p{}</style>c<!-- 주석 -->d'), 'abcd');
    assert.equal(s('<img src=x onerror=alert(1)><a href="javascript:1">링크</a><svg onload=1><g/></svg>'), '링크');
    assert.equal(s('x < y & z > 3 &amp; &lt;'), 'x &lt; y &amp; z &gt; 3 &amp; &lt;', '글자의 < & > 는 글자로');
    assert.equal(s('<ul><li>하나</li></ul><table><tr><td colspan=2>칸</td></tr></table>'), '<ul><li>하나</li></ul><table><tr><td>칸</td></tr></table>');
    assert.equal(s('<p><br></p><p>  </p>'), '', '빈 줄은 지움');
    assert.ok(s('가'.repeat(100), 10).length <= 10, '길이 한도');
    // 기본 내용 파일의 모든 글은 그대로 남아야 함 (고치기 칸에 넣었다 빼도 모양이 바뀌지 않게)
    for (const exp of ['rocket', 'qdot']) {
        const def = C.get(exp);
        Object.keys(def.stages).forEach(k => def.stages[k].forEach((sl, i) => ['body', 'ask', 'reveal', 'note'].forEach(f => {
            if (!sl[f]) return;
            const norm = x => x.replace(/\s+/g, ' ').replace(/<p>\s*<\/p>/g, '').trim();
            assert.equal(norm(s(sl[f])), norm(sl[f]), exp + '.' + k + '[' + i + '].' + f + ' 가 sanitize 로 바뀜');
        })));
    }
});

test('고친 자료: 글 고치기·숨기기·새 장·순서 → 저장 모양 → 발표 보기용 내용', () => {
    const def = C.get('rocket');
    const R = L.resolveEdit(def, null);
    assert.deepEqual(R.stageKeys, ['think', 't1', 't2', 'end']);
    const think = R.stages.think;
    assert.deepEqual(think.map(e => e.ref).slice(0, 4), ['s:think:0', 'k:force', 'k:accel', 'k:pressure']);
    think[1].set.title = '힘이란 <b>무엇</b>일까?';
    think[1].set.body = '<p>공을 <b>차요</b></p><script>alert(1)</script>';
    think[2].hide = true;
    think.splice(0, 0, { add: 'my-intro1', kind: 'how', title: '오늘 순서', body: '<div>하나</div><img src=x onerror=1>' });
    think.push(think.splice(1, 1)[0]);   // 원래 첫 장을 맨 뒤로
    const E = L.toEdit('rocket', R.stages);
    assert.equal(E.v, 1); assert.equal(E.exp, 'rocket');
    assert.deepEqual(E.stages.think[0], { add: 'my-intro1', kind: 'how', title: '오늘 순서', body: '<p>하나</p>' });
    assert.deepEqual(E.stages.think[1], { ref: 'k:force', of: '‘힘’은 무엇일까요?', set: { title: '힘이란 <b>무엇</b>일까?', body: '<p>공을 <b>차요</b></p>' } });
    assert.deepEqual(E.stages.think[2], { ref: 'k:accel', of: '‘가속도’는 무엇일까요?', hide: true });
    assert.equal(E.stages.t1.every(x => x.ref && !x.set && !x.hide), true, '안 고친 단계는 자리만');

    const M = L.applyEdit(def, JSON.parse(JSON.stringify(E)));
    const t = M.stages.think;
    assert.deepEqual(t.map(x => x.key || ''), ['my-intro1', 'force', 'pressure', '', '']);
    assert.equal(t[1].title, '힘이란 <b>무엇</b>일까?');
    assert.equal(t[1].ask, def.stages.think[1].ask, '고치지 않은 칸은 그대로');
    assert.equal(t[1].mode, 'phone', 'mode·key 는 그대로');
    assert.equal(t[4].title, def.stages.think[0].title, '원래 첫 장은 맨 뒤로');
    assert.deepEqual(M.stages._hidden.map(x => x.key), ['accel'], '숨긴 key 장은 모든 풀이 열기용으로만');
    assert.deepEqual(L.slidesFor(M, 'think', '').map(x => x.key || ''), ['my-intro1', 'force', 'pressure', '', '']);
    assert.equal(L.slidesFor(M, 't1', '').length, def.stages.t1.length);
    assert.equal(def.stages.think[1].title, '‘힘’은 무엇일까요?', '기본 내용은 그대로');
    // 그리기: 본문에 스크립트가 남지 않음
    assert.doesNotMatch(L.render(t[0], false, {}), /<img|onerror|script/);
});

test('고친 자료: 규칙으로 바로 쓴 이상한 글도 그릴 때 거름 · 내용 파일이 나중에 바뀌어도 제목으로 찾음', () => {
    const def = { title: 'x', stages: { purpose: [{ kind: 'why', title: '가', body: '<p>1</p>' }, { kind: 'concept', title: '나', body: '<p>2</p>' }] } };
    const edit = { stages: { purpose: [
        { ref: 's:purpose:1', of: '나', set: { body: '<p onmouseover=x>바꿈</p><iframe src=//evil></iframe>' } },
        { add: 'BAD KEY', kind: 'why', title: 'x' },            // 모양이 틀린 새 장은 버림
        { add: 'my-ok', kind: 'nope', title: 'x' },             // 모르는 종류도 버림
        { add: 'my-ok2', kind: 'ask', title: '<b>물음</b> 장', ask: '왜?', reveal: '<p>까닭</p>' },
        { ref: 's:purpose:0', of: '가' }
    ], conclusion: [{ add: 'my-end', kind: 'how', title: '정리', body: '<p>끝</p>' }] } };
    const M = L.applyEdit(def, edit);
    assert.deepEqual(M.stages.purpose.map(x => x.title), ['나', '<b>물음</b> 장', '가']);
    assert.equal(M.stages.purpose[0].body, '<p>바꿈</p>');
    assert.deepEqual(M.stages.conclusion.map(x => x.key), ['my-end'], '기본 장이 없는 단계에도 더할 수 있음');
    // 내용 파일에 앞쪽 장이 새로 더해짐 → 순서 자리('s:purpose:1')가 밀려도 원래 제목으로 같은 장을 찾고, 새 장은 끝에 붙음
    const def2 = { title: 'x', stages: { purpose: [{ kind: 'why', title: '새로 더한 장', body: '<p>0</p>' }].concat(def.stages.purpose) } };
    const M2 = L.applyEdit(def2, edit);
    assert.deepEqual(M2.stages.purpose.map(x => x.title), ['나', '<b>물음</b> 장', '가', '새로 더한 장']);
    assert.equal(M2.stages.purpose[0].body, '<p>바꿈</p>');
    // 기본 내용이 없는 실험(설명 장 파일 없음)도 고친 자료만으로
    assert.deepEqual(L.applyEdit(null, edit).stages.conclusion.map(x => x.title), ['정리']);
    assert.equal(L.applyEdit(def, null), def, '고친 자료 없으면 그대로');
});

test('저장소: 구글 로그인한 선생님 본인 계정에만 (다른 선생님·학생은 못 읽고 못 씀)', async () => {
    const db = LabStore.memoryDb(), core = LabStore.core(db);
    const T1 = b => core.handle(b, { uid: 't1', google: true }), T2 = b => core.handle(b, { uid: 't2', google: true }), S = b => core.handle(b, { uid: 's1' });
    const edit = { v: 1, exp: 'rocket', stages: { think: [{ ref: 'k:force', of: '힘', set: { title: '바꿈', body: '<p>x</p>' }, junk: 1 }, { add: 'my-a', kind: 'how', title: '새', body: 'b' }, { add: 'nope', kind: 'how' }, 5] } };
    assert.equal((await S({ action: 'lessonEditSave', exp: 'rocket', edit })).ok, false, '학생(익명)은 못 씀');
    assert.equal((await S({ action: 'lessonEditGet', exp: 'rocket' })).ok, false);
    assert.equal((await T1({ action: 'lessonEditSave', exp: '../x', edit })).ok, false, '실험 이름 모양');
    assert.equal((await T1({ action: 'lessonEditSave', exp: 'rocket', edit: { stages: [] } })).ok, false, '모양');
    const r = await T1({ action: 'lessonEditSave', exp: 'rocket', edit });
    assert.equal(r.ok, true, r.error);
    const doc = db.docs.get('lessonEdits/t1/exps/rocket');
    assert.deepEqual(Object.keys(doc).sort(), ['exp', 'stages', 'updatedAt', 'v'], '칸 네 개, expireAt 없음(교사 자료)');
    assert.deepEqual(doc.stages.think, [{ ref: 'k:force', of: '힘', set: { title: '바꿈', body: '<p>x</p>' } }, { add: 'my-a', kind: 'how', title: '새', body: 'b' }], '모르는 칸·틀린 항목은 버림');
    assert.equal((await T1({ action: 'lessonEditGet', exp: 'rocket' })).edit.stages.think.length, 2);
    assert.equal((await T2({ action: 'lessonEditGet', exp: 'rocket' })).edit, null, '다른 선생님은 자기 계정만 (t1 자료가 안 보임)');
    assert.deepEqual((await T1({ action: 'lessonEditList' })).edits.map(e => e.exp), ['rocket']);
    assert.deepEqual((await T2({ action: 'lessonEditList' })).edits, []);
    const big = { stages: { think: Array.from({ length: 61 }, () => ({ ref: 'k:force' })) } };
    assert.equal((await T1({ action: 'lessonEditSave', exp: 'rocket', edit: big })).ok, false, '한 단계 60장까지');
    assert.equal((await T1({ action: 'lessonEditReset', exp: 'rocket' })).ok, true);
    assert.equal((await T1({ action: 'lessonEditGet', exp: 'rocket' })).edit, null, '되돌리기 = 지우기');
});
