// 🎬 발표 보기 설명 화면 내용 파일 검사: js/lesson-content/*.js 를 모두 읽어 kind·필수 칸·단계 키 확인 (js/lesson-slides.js LessonSlides.check)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { LessonContent, LessonSlides } = require('../js/lesson-slides.js');
const CC = require('../js/class-cloud.js');
const DIR = path.join(__dirname, '..', 'js', 'lesson-content');

test('설명 화면 내용 파일: 모양·단계 키', () => {
    const files = fs.readdirSync(DIR).filter(f => f.endsWith('.js'));
    assert.ok(files.includes('rocket.js'));
    for (const f of files) {
        const exp = f.replace(/\.js$/, '');
        const box = { LessonContent }; box.window = box; box.self = box;   // 내용 파일은 window.LessonContent 로 넣기도 함
        vm.runInNewContext(fs.readFileSync(path.join(DIR, f), 'utf8'), box, { filename: f });
        const def = LessonContent.get(exp);
        assert.ok(def, f + ': LessonContent.add(\'' + exp + '\', …) 로 넣어야 해요 (파일 이름 = 실험 키)');
        assert.deepEqual(LessonSlides.check(exp, def), [], f);
        // 단계 키는 그 실험이 여는 단계(7단계 패널 키·가설연역 키 포함)
        const info = CC.EXPS[exp];
        assert.ok(info, f + ': ClassCloud EXPS 에 있는 실험');
        const ok = new Set([...(CC.gateSteps(exp) || []), ...(CC.gateSteps(exp, 'hd') || []), ...Object.keys(info.steps)]);
        for (const k of Object.keys(def.stages)) assert.ok(ok.has(k), f + ': 모르는 단계 키 ' + k);
    }
});

test('로켓 설명 장: 폰 답(data-lesson-answer)과 key 짝, 초3 쉬운 말이 폰과 같은 말', () => {
    const box = { LessonContent }; box.window = box;
    vm.runInNewContext(fs.readFileSync(path.join(DIR, 'rocket.js'), 'utf8'), box);
    const def = LessonContent.get('rocket'), M = require('../js/film-rocket-math.js');
    const keys = new Set([].concat(...Object.values(def.stages)).map(s => s.key).filter(Boolean));
    const page = fs.readFileSync(path.join(__dirname, '..', 'js', 'film-rocket.js'), 'utf8');
    for (const k of Object.keys(M.KEY_WORDS)) assert.ok(keys.has(k), '폰 📘 정의 ' + k + ' 의 풀이 장이 있어야 해요');
    for (const c of M.CONCEPTS) assert.ok(keys.has(c.key));
    assert.match(page, /data-lesson-answer/);
    const src = fs.readFileSync(path.join(DIR, 'rocket.js'), 'utf8');
    for (const [w, m] of Object.entries(M.EASY)) assert.ok(src.includes(m), '쉬운 말 ‘' + w + '’ = ' + m + ' 이(가) 설명 장에도 같은 말로');
    assert.deepEqual(LessonSlides.check('x', { title: 't', stages: { a: [{ kind: 'why', title: 't', body: 'b', key: 'k1' }], b: [{ kind: 'why', title: 't', body: 'b', key: 'k1' }] } }).length, 1, '한 실험 안 key 겹침');
    assert.equal(LessonSlides.check('x', { title: 't', stages: { a: [{ kind: 'why', title: 't', body: 'b', key: 'Bad Key' }] } }).length, 1, 'key 모양');
});

test('LessonSlides: 먼저 불린 내용 파일 대기열(_wait)', () => {
    const box = {}; box.window = box;
    vm.runInNewContext(fs.readFileSync(path.join(DIR, 'rocket.js'), 'utf8'), box);
    assert.ok(box.LessonContent._wait.rocket, '부품 없이 불리면 대기열에');
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'lesson-slides.js'), 'utf8'), Object.assign(box, { self: box }));
    assert.ok(box.LessonContent.get('rocket'), '부품이 대기열을 가져감');
});

test('LessonSlides: 가설연역은 같은 패널 키 장을 이어 붙임, 물음 뒤 풀이, 검사', () => {
    const def = { title: 'x', stages: { materials: [{ kind: 'how', title: 'a', body: '1' }], procedure: [{ kind: 'how', title: 'b', body: '2' }], purpose: [{ kind: 'why', title: 'c', body: '3' }] } };
    assert.deepEqual(LessonSlides.slidesFor(def, 'design', 'hd').map(s => s.title), ['a', 'b']);
    assert.deepEqual(LessonSlides.slidesFor(def, 'problem', 'hd').map(s => s.title), ['c']);
    assert.deepEqual(LessonSlides.slidesFor(def, 'materials').map(s => s.title), ['a']);
    assert.deepEqual(LessonSlides.slidesFor(def, 'data'), []);
    const s = { kind: 'ask', title: 'Q', ask: '왜?', reveal: '<p>풀이</p>', note: '말할 것' };
    assert.doesNotMatch(LessonSlides.render(s, false), /<p>풀이/, '열기 전에는 풀이를 넣지 않음');
    assert.match(LessonSlides.render(s, true), /class="ls-reveal"><p>풀이/);
    assert.match(LessonSlides.render(s, false), /details class="ct-teach ls-note"/);
    assert.ok(LessonSlides.check('x', { title: 't', stages: { a: [{ kind: 'nope', title: '' }] } }).length >= 2);
    assert.ok(LessonSlides.check('x', { title: 't', stages: { a: [{ kind: 'why', title: 't', body: '<img onerror=alert(1)>' }] } }).length === 1);
    assert.ok(LessonSlides.check('x', { title: 't', stages: { a: [{ kind: 'vars', title: 't', vars: { change: 'a' } }] } }).length === 1);
});
