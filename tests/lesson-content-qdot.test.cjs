// 탄소 양자점 수업 설명 장(js/lesson-content/qdot.js) 형식 검사 — 공통 검사 시험(js/lesson-content/*.js 전부)이 생기면 합친다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FILE = path.join(__dirname, '..', 'js', 'lesson-content', 'qdot.js');
const STEPS = ['purpose', 'theory', 'materials', 'procedure', 'data', 'result', 'conclusion'];
const KINDS = ['why', 'concept', 'vars', 'how', 'ask', 'safety'];
const plain = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('양자점 설명 장: 형식 · 7단계 4~8장 · 물음 먼저 · 변인 통제', () => {
    const { key, lesson } = require(FILE);
    assert.equal(key, 'qdot');
    assert.match(lesson.title, /양자점/);
    assert.deepEqual(Object.keys(lesson.stages), STEPS, '7단계 키 그대로(가설연역은 같은 키를 묶어 씀)');
    const kinds = new Set();
    for (const st of STEPS) {
        const cards = lesson.stages[st];
        assert.ok(cards.length >= 4 && cards.length <= 8, st + ' 장 수 ' + cards.length);
        cards.forEach((c, i) => {
            const at = st + ' ' + (i + 1);
            assert.ok(KINDS.includes(c.kind), at + ' kind');
            kinds.add(c.kind);
            assert.ok(c.title && c.title.length <= 30, at + ' 제목(짧게)');
            assert.ok(c.body || c.vars, at + ' 본문');
            if (c.reveal) assert.ok(c.ask, at + ' 풀이가 있으면 물음이 먼저');
            if (c.kind === 'vars') {
                assert.ok(c.vars.change && c.vars.measure && c.vars.predict && c.vars.keep.length >= 3, at + ' 변인 카드 칸');
            }
            // 4K 한 장에 한 가지: 본문은 짧게 (글자 수)
            assert.ok(plain(c.body).length <= 360, at + ' 본문 ' + plain(c.body).length + '자');
            // 저장소 글만: 스크립트·이벤트 속성·외부 주소 없음
            const html = [c.body, c.reveal, c.ask].join(' ');
            assert.doesNotMatch(html, /<script|on\w+=|javascript:|https?:\/\//i, at + ' 안전한 HTML');
            if (c.img) assert.ok(fs.existsSync(path.join(__dirname, '..', c.img.replace(/^\//, ''))), at + ' 그림 파일');
        });
    }
    // 넣을 설명 네 가지(변인 통제·왜 하는지·개념 풀이·하는 방법) + 안전
    ['vars', 'why', 'concept', 'how', 'safety'].forEach(k => assert.ok(kinds.has(k), k + ' 장이 있음'));
    // 1 목적 첫 장 = 물음(답보다 먼저)
    const first = lesson.stages.purpose[0];
    assert.equal(first.kind, 'ask');
    assert.match(first.ask, /무엇이 다른가요\? 왜/);
    // 변인 통제: 가열 시간·재료 비율 실험 각각, '두 가지가 함께 바뀌면?' 물음
    const vars = lesson.stages.procedure.filter(c => c.kind === 'vars');
    assert.equal(vars.length, 2);
    assert.match(vars[0].vars.change, /가열 시간/); assert.match(vars[1].vars.change, /요소/);
    vars.forEach(v => { assert.ok(v.vars.keep.some(k => /희석/.test(k))); assert.ok(v.vars.keep.some(k => /빛/.test(k))); assert.ok(v.vars.keep.some(k => /노출/.test(k))); });
    assert.ok(lesson.stages.procedure.some(c => /두 가지가 함께/.test(c.title) && c.reveal));
    // 개념 풀이: 2 이론과 같은 말
    const theory = lesson.stages.theory.map(c => plain(c.body + ' ' + (c.reveal || ''))).join(' ');
    ['양자', '띠 틈', '1240', '스토크스', '노출'].forEach(w => assert.match(theory, new RegExp(w)));
    assert.match(lesson.stages.data.map(c => plain(c.body)).join(' '), /반치폭/);
    assert.match(lesson.stages.result.map(c => plain(c.body + c.reveal)).join(' '), /보정 밝기/);
});

test('양자점 설명 장: 브라우저에서 LessonContent.add 로 등록 (틀이 먼저 와도, 나중에 와도)', () => {
    const src = fs.readFileSync(FILE, 'utf8');
    const got = {};
    const ctxA = { self: { LessonContent: { add: (k, v) => { got[k] = v; } } } };
    vm.runInNewContext(src, ctxA);
    assert.ok(got.qdot && got.qdot.stages.purpose.length);
    const ctxB = { self: {} };
    vm.runInNewContext(src, ctxB);
    assert.ok(ctxB.self.LessonContent._wait.qdot, '틀이 아직 없으면 대기열');
});
