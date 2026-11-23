// 📖 수업 자료 편집 ② 그림 바꾸기: 'my-img:<id>' 만 받기·data URL 로 바꿔 그리기·저장소(본인만·종류·크기·안 쓰는 그림 지우기·되돌리면 함께 지움)
const test = require('node:test');
const assert = require('node:assert/strict');
const { LessonSlides: L } = require('../js/lesson-slides.js');
const LabStore = require('../js/lab-store.js');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('그림 칸: my-img 만 받고 그릴 때 data URL 로 (다른 주소·SVG 는 버림)', () => {
    const def = { title: 'x', stages: { purpose: [{ kind: 'why', title: '가', body: '<p>1</p>', img: '<svg viewBox="0 0 1 1"></svg>' }, { kind: 'ask', title: '나', ask: '왜?', reveal: '<p>r</p>' }] } };
    const edit = { stages: { purpose: [
        { ref: 's:purpose:0', of: '가', set: { img: 'my-img:iaaaaaaaaaaaaaaa' } },
        { ref: 's:purpose:1', of: '나', set: { img: 'https://evil.example/x.png', revealImg: 'my-img:ibbbbbbbbbbbbbbb' } },
        { add: 'my-n1', kind: 'how', title: '새', body: '<p>b</p>', img: 'javascript:alert(1)' },
        { add: 'my-n2', kind: 'how', title: '새2', body: '<p>b</p>', img: 'my-img:iccccccccccccccc', revealImg: 'my-img:iddddddddddddddd' }
    ] } };
    const M = L.applyEdit(def, edit);
    const s = M.stages.purpose;
    assert.equal(s[0].img, 'my-img:iaaaaaaaaaaaaaaa');
    assert.equal(s[1].img, undefined, '다른 주소는 받지 않음');
    assert.equal(s[1].revealImg, 'my-img:ibbbbbbbbbbbbbbb');
    assert.equal(s[2].img, undefined);
    assert.equal(s[3].revealImg, undefined, '풀이 없는 장의 풀이 뒤 그림은 뺌');
    assert.deepEqual(L.imgIds(M), ['iaaaaaaaaaaaaaaa', 'ibbbbbbbbbbbbbbb', 'iccccccccccccccc']);
    const R = L.resolveImgs(M, { iaaaaaaaaaaaaaaa: PNG, ibbbbbbbbbbbbbbb: 'data:image/svg+xml;base64,PHN2Zz4=' });
    assert.equal(R.stages.purpose[0].img, PNG);
    assert.equal(R.stages.purpose[1].revealImg, undefined, 'SVG data URL 은 그리지 않음');
    assert.equal(R.stages.purpose[3].img, undefined, '못 읽은 그림은 뺌');
    assert.match(L.render(R.stages.purpose[0], false, {}), /<img src="data:image\/png;base64,/);
    // 그림 빼기('') → 기본 그림 없이
    assert.equal(L.applyEdit(def, { stages: { purpose: [{ ref: 's:purpose:0', of: '가', set: { img: '' } }] } }).stages.purpose[0].img, undefined);
    // toEdit: 바꾼 그림만 저장
    const Rs = L.resolveEdit(def, null).stages;
    Rs.purpose[0].set.img = 'my-img:ieeeeeeeeeeeeeee';
    Rs.purpose.push({ add: 'my-z', kind: 'how', title: 'z', body: '<p>z</p>', img: 'my-img:iffffffffffffff0' });
    const E = L.toEdit('x', Rs);
    assert.deepEqual(E.stages.purpose[0].set, { img: 'my-img:ieeeeeeeeeeeeeee' });
    assert.equal(E.stages.purpose[2].img, 'my-img:iffffffffffffff0');
});

test('저장소: 그림은 본인 계정에만, 종류·크기 검사, 안 쓰는 그림은 저장 때 지움, 되돌리면 함께 지움', async () => {
    const db = LabStore.memoryDb(), core = LabStore.core(db);
    const T1 = b => core.handle(b, { uid: 't1', google: true }), T2 = b => core.handle(b, { uid: 't2', google: true }), S = b => core.handle(b, { uid: 's1' });
    assert.equal((await S({ action: 'lessonImgSave', exp: 'rocket', data: PNG, w: 1, h: 1 })).ok, false, '학생은 못 올림');
    assert.equal((await T1({ action: 'lessonImgSave', exp: 'rocket', data: 'data:image/svg+xml;base64,PHN2Zz4=', w: 1, h: 1 })).ok, false, 'SVG 안 받음');
    assert.equal((await T1({ action: 'lessonImgSave', exp: 'rocket', data: 'https://x/y.png', w: 1, h: 1 })).ok, false, '주소 안 받음');
    assert.equal((await T1({ action: 'lessonImgSave', exp: 'rocket', data: 'data:image/png;base64,' + 'A'.repeat(420000), w: 1, h: 1 })).ok, false, '300KB 넘음');
    assert.equal((await T1({ action: 'lessonImgSave', exp: 'rocket', data: PNG, w: 0, h: 1 })).ok, false, '크기');
    const a = await T1({ action: 'lessonImgSave', exp: 'rocket', data: PNG, w: 1, h: 1 });
    const b = await T1({ action: 'lessonImgSave', exp: 'rocket', data: PNG, w: 1, h: 1 });
    const q = await T1({ action: 'lessonImgSave', exp: 'qdot', data: PNG, w: 1, h: 1 });
    assert.equal(a.ok, true, a.error); assert.match(a.ref, /^my-img:i[a-z0-9]{15}$/);
    assert.deepEqual(Object.keys(db.docs.get('lessonEdits/t1/imgs/' + a.id)).sort(), ['createdAt', 'data', 'exp', 'h', 'w'], 'expireAt 없음(교사 자료)');
    assert.equal((await T1({ action: 'lessonImgGet', id: a.id })).data, PNG);
    assert.equal((await T2({ action: 'lessonImgGet', id: a.id })).ok, false, '다른 선생님은 못 읽음 (자기 계정만 찾음)');
    assert.equal((await T1({ action: 'lessonImgGet', id: '../x' })).ok, false);
    // 저장: a 만 씀 → b 는 지움, 다른 실험 그림(q)은 그대로
    const r = await T1({ action: 'lessonEditSave', exp: 'rocket', edit: { stages: { think: [{ ref: 'k:force', of: '힘', set: { img: a.ref, revealImg: 'https://evil' } }, { add: 'my-a', kind: 'how', title: 't', img: '' }] } } });
    assert.equal(r.ok, true, r.error); assert.equal(r.imagesRemoved, 1);
    const doc = db.docs.get('lessonEdits/t1/exps/rocket');
    assert.deepEqual(doc.stages.think, [{ ref: 'k:force', of: '힘', set: { img: a.ref } }, { add: 'my-a', kind: 'how', title: 't' }], '모양이 틀린 그림 칸은 버림');
    assert.equal(db.docs.has('lessonEdits/t1/imgs/' + a.id), true);
    assert.equal(db.docs.has('lessonEdits/t1/imgs/' + b.id), false, '안 쓰는 그림은 지움');
    assert.equal(db.docs.has('lessonEdits/t1/imgs/' + q.id), true, '다른 실험 그림은 그대로');
    // 되돌리기: 그 실험 그림도 함께
    const z = await T1({ action: 'lessonEditReset', exp: 'rocket' });
    assert.equal(z.images, 1);
    assert.equal(db.docs.has('lessonEdits/t1/imgs/' + a.id), false);
    assert.equal(db.docs.has('lessonEdits/t1/imgs/' + q.id), true);
});
