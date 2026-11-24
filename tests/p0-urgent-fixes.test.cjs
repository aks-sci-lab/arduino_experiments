// P0 긴급 수정 회귀 시험:
// 1. LabStore.lessonOut 및 watchClassDoc 의 lesson.q 보존
// 2. firestoreDb.get(..., { live: true }) 단일 문서 실시간 캐시 및 aiMine / teamList / classExport(live) 캐시 옵션 전달
// 3. class-teacher-ai.js 마친 수업 제외 · AI 꺼짐 유휴 쓰기 방지
// 4. report-ai.js 가설연역 verdict 탭 calc 기본 첨부, pendulum-report.html 낡은 문구 제거
// 5. em-induction.html 반파 적분 분리 · ideal-gas.html 변인 카드
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const LS = require('../js/lab-store.js');

const ROOT = path.join(__dirname, '..');

test('LabStore.lessonOut 은 켜진 응답 물음(lesson.q)을 그대로 보존하고, 꺼지면 뺀다', () => {
    const raw = {
        on: true, stage: 't1', i: 2, key: 'my-q1', reveal: false, mode: 'phone',
        q: { type: 'pick', text: '어느 쪽이 더 빠를까요?', choices: ['따뜻한 물', '찬물'] }
    };
    const out = LS.lessonOut(raw);
    assert.deepEqual(out.q, { type: 'pick', text: '어느 쪽이 더 빠를까요?', choices: ['따뜻한 물', '찬물'] });
    const off = LS.lessonOut(Object.assign({}, raw, { on: false }));
    assert.equal(off.q, undefined, '설명이 꺼지면 q 는 빠짐');
    // watchClassDoc 코드가 수동 복사가 아니라 lessonOut(d.lesson) 을 쓰는지 확인
    const src = fs.readFileSync(path.join(ROOT, 'js/lab-store.js'), 'utf8');
    assert.match(src, /watchClassDoc[\s\S]{0,600}lesson:\s*lessonOut\(d\.lesson\)/);
});

test('firestoreDb.get(path, { live: true }) 는 onSnapshot 한 번만 붙이고 이후 추가 읽기 없이 최신 값을 돌려준다', async () => {
    let snapCount = 0, getCount = 0, push = null;
    const fakeFb = {
        raw: { firestore: { FieldValue: { serverTimestamp: () => new Date() } } },
        firestore: () => ({
            doc: () => ({
                get: async () => { getCount++; return { exists: false }; },
                onSnapshot: (onNext) => {
                    snapCount++;
                    push = onNext;
                    onNext({ exists: true, data: () => ({ on: true, provider: 'gemini', model: 'm1', seenAt: new Date() }) });
                    return () => {};
                }
            }),
            collection: () => ({ get: async () => ({ docs: [] }) })
        })
    };
    const db = LS.firestoreDb(fakeFb);
    const d1 = await db.get('labClasses/c123/aiDesk/status', { live: true });
    const d2 = await db.get('labClasses/c123/aiDesk/status', { live: true });
    assert.equal(d1.on, true);
    assert.equal(d2.model, 'm1');
    assert.equal(snapCount, 1, 'onSnapshot 은 최초 1회만 등록');
    assert.equal(getCount, 0, '일회성 get() 은 호출하지 않음');
    // 실시간 갱신 반영 확인
    push({ exists: true, data: () => ({ on: false, provider: 'gemini', model: 'm1', seenAt: new Date() }) });
    const d3 = await db.get('labClasses/c123/aiDesk/status', { live: true });
    assert.equal(d3.on, false, '스냅샷 갱신 값이 즉시 반영');
    assert.equal(snapCount, 1);
});

test('core: classStatus·classExport(live) 는 teamList 를 live: true 로, aiMine 은 aiDesk/status 를 live: true 로 조회한다', async () => {
    const base = LS.memoryDb();
    const calls = { get: [], query: [] };
    const spyDb = Object.assign({}, base, {
        get: (p, opt) => { calls.get.push({ p, opt }); return base.get(p, opt); },
        query: (c, f, opt) => { calls.query.push({ c, f, opt }); return base.query(c, f, opt); }
    });
    const core = LS.core(spyDb);
    const T = { uid: 't1', google: true }, S = { uid: 's1', google: false };
    const cr = await core.handle({ action: 'createClass', ban: 1, exp: 'rocket', mode: 'team', nTeams: 4 }, T);
    assert.equal(cr.ok, true);

    calls.query.length = 0;
    const st = await core.handle({ action: 'classStatus', space: cr.space }, T);
    assert.equal(st.ok, true);
    assert.ok(calls.query.some(x => x.c === 'labClasses/' + cr.space + '/teams' && x.opt && x.opt.live === true), 'classStatus 는 teams 를 live 로 읽음');

    calls.query.length = 0;
    const exLive = await core.handle({ action: 'classExport', space: cr.space, live: true }, T);
    assert.equal(exLive.ok, true);
    assert.ok(calls.query.some(x => x.c === 'labClasses/' + cr.space + '/teams' && x.opt && x.opt.live === true), 'classExport(live) 는 teams 를 live 로 읽음');
    assert.ok(calls.query.some(x => x.c === 'labSpaces/' + cr.space + '/items' && x.opt && x.opt.live === true), 'classExport(live) 는 items 를 live 로 읽음');

    calls.query.length = 0;
    const exFresh = await core.handle({ action: 'classExport', space: cr.space }, T);
    assert.equal(exFresh.ok, true);
    assert.ok(calls.query.some(x => x.c === 'labSpaces/' + cr.space + '/items' && (!x.opt || !x.opt.live)), '일반 classExport 는 최신 스냅샷 조회');

    calls.get.length = 0;
    const mine = await core.handle({ action: 'aiMine', space: cr.space }, S);
    assert.equal(mine.ok, true);
    assert.ok(calls.get.some(x => x.p === 'labClasses/' + cr.space + '/aiDesk/status' && x.opt && x.opt.live === true), 'aiMine 은 aiDesk/status 를 live 로 읽음');
});

test('기타 P0 수정 사항(verdict calc, pendulum 안내문, em-induction 반파 적분, ideal-gas 변인, 수업 마치기 경고) 확인', () => {
    const rai = fs.readFileSync(path.join(ROOT, 'js/report-ai.js'), 'utf8');
    assert.match(rai, /s\.key === 'conclusion' \|\| s\.key === 'verdict'/);

    const pend = fs.readFileSync(path.join(ROOT, 'projects/pendulum-report.html'), 'utf8');
    assert.doesNotMatch(pend, /다음 업데이트에서 이 단계들에/);

    const em = fs.readFileSync(path.join(ROOT, 'projects/em-induction.html'), 'utf8');
    assert.match(em, /intPos/);
    assert.match(em, /dPhiNeg/);
    assert.match(em, /코일 단자 전압 V/);

    const ig = fs.readFileSync(path.join(ROOT, 'projects/ideal-gas.html'), 'utf8');
    assert.match(ig, /choose:\["pres","temp"\]/);

    const ct = fs.readFileSync(path.join(ROOT, 'js/class-teacher.js'), 'utf8');
    assert.match(ct, /도전 장면 사진·영상은 지금 바로 지워지며/);

    const ctAi = fs.readFileSync(path.join(ROOT, 'js/class-teacher-ai.js'), 'utf8');
    assert.match(ctAi, /!c\.done &&/);
});
