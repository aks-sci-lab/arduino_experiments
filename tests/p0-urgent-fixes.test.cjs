// P0 긴급 수정 회귀 시험 (2026-11-27 글자 확인 → 동작 확인으로 바꿈):
// 1. LabStore.lessonOut 및 watchClassDoc(진짜 Firestore 길)이 응답 물음 lesson.q 를 학생 화면까지 넘기는지 — 가짜 firebase 로 실제 함수를 부름
// 2. firestoreDb.get(..., { live: true }) 단일 문서 실시간 캐시 및 aiMine / teamList / classExport(live) 캐시 옵션 전달
// 3. 교사 ③ 보고서 AI: 마친 수업에는 켜짐 신호를 쓰지 않고, 꺼 두면 한 번 '꺼짐' 뒤로 쓰기가 멈춤 — 가짜 저장소 쓰기 횟수
// 4. 수업 마치기 확인창: 팀 수업은 도전 장면 사진·영상이 바로 지워진다는 안내 — 실제 확인창 글
// 5. 보고서 AI 가설연역 '가설 판정' 항목은 계산 결과를 기본으로 함께 보냄 — 실제 체크 칸
// 6. 진자 분석 화면의 낡은 안내('다음 업데이트에서…') 대신 7. 결론에 보고서 칸
// 7. 전자기 유도: 양(+)·음(−) 반파 넓이를 따로(0 통과에서 나눔) — 짠 파형을 예전 저장 측정으로 넣고 📈 보기 + 시뮬레이션 측정 결과 칸
// 8. 이상기체 변인 카드: 바꿀 것 후보는 압력 P·온도 t, 고르면 나머지 🔒
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const LS = require('../js/lab-store.js');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
const pickVars = require('./vars-pick.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT_DIR = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = (cfg && cfg.options) || {}; } update() {} destroy() {} resize() {} static register() {} };';

test('LabStore.lessonOut 은 켜진 응답 물음(lesson.q)을 그대로 보존하고, 꺼지면 뺀다', () => {
    const raw = {
        on: true, stage: 't1', i: 2, key: 'my-q1', reveal: false, mode: 'phone',
        q: { type: 'pick', text: '어느 쪽이 더 빠를까요?', choices: ['따뜻한 물', '찬물'] }
    };
    const out = LS.lessonOut(raw);
    assert.deepEqual(out.q, { type: 'pick', text: '어느 쪽이 더 빠를까요?', choices: ['따뜻한 물', '찬물'] });
    const off = LS.lessonOut(Object.assign({}, raw, { on: false }));
    assert.equal(off.q, undefined, '설명이 꺼지면 q 는 빠짐');
});

test('watchClassDoc(진짜 Firestore 길): 수업 문서가 바뀌면 lesson.q 까지 그대로 넘기고, 설명을 끄면 q 가 빠짐', async () => {
    // 가짜 firebase (전역) — lab-store 의 firebaseReady 가 스크립트를 받지 않고 이것을 씀
    const listeners = {};
    const fakeFs = {
        doc: p => ({
            onSnapshot: (next) => { (listeners[p] = listeners[p] || []).push(next); return () => { listeners[p] = listeners[p].filter(f => f !== next); }; },
            get: async () => ({ exists: false })
        }),
        collection: () => ({ get: async () => ({ docs: [] }) })
    };
    global.firebase = {
        apps: [],
        initializeApp(cfg, name) { const app = { name, auth: () => ({}), firestore: () => fakeFs }; this.apps.push(app); return app; },
        auth: {}, firestore: { FieldValue: { serverTimestamp: () => new Date() } }
    };
    try {
        const space = 'c' + 'a1b2c3d4e5f6g7h8i9j0k1l'.slice(0, 23);
        assert.ok(LS.isSpace(space));
        const got = [];
        const off = await LS.watchClassDoc('lab:' + space, d => got.push(d));
        assert.equal(typeof off, 'function', '구독을 돌려줌');
        const subs = listeners['labClasses/' + space];
        assert.equal(subs && subs.length, 1, '수업 문서 하나만 들음');
        const q = { type: 'pick', text: '어느 쪽이 더 빠를까요?', choices: ['따뜻한 물', '찬물'] };
        subs[0]({ exists: true, data: () => ({ stage: 3, setup: null, lesson: { on: true, stage: 't1', i: 2, key: 'my-q1', reveal: false, mode: 'phone', q }, lessonOpen: ['force'] }) });
        assert.equal(got.length, 1);
        assert.equal(got[0].stage, 3);
        assert.deepEqual(got[0].lesson.q, q, '응답 물음이 학생 화면까지 감');
        assert.equal(got[0].lesson.key, 'my-q1');
        assert.deepEqual(got[0].lessonOpen, ['force']);
        subs[0]({ exists: true, data: () => ({ stage: 3, lesson: { on: false, stage: 't1', i: 2, key: 'my-q1', q }, lessonOpen: [] }) });
        assert.equal(got[1].lesson.q, undefined, '설명을 끄면 물음도 빠짐');
        off();
        assert.equal(listeners['labClasses/' + space].length, 0, '끄면 듣기 멈춤');
    } finally { delete global.firebase; }
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

// ---------- 화면 시험 ----------
async function setup() {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(ROOT_DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [], dialogs = [];
    const ctx = async (opt, name, init) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' }); });
        await c.route(/gstatic|accounts\.google/, r => r.abort());
        if (init) await c.addInitScript(init.fn, init.arg);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message));
        pg.on('dialog', d => { dialogs.push({ name, message: d.message() }); const ans = pg.__dialogAnswer ? pg.__dialogAnswer.shift() : true; return ans === false ? d.dismiss() : d.accept(); });
        return pg;
    };
    const close = async () => { await browser.close(); api.close(); stat.close(); };
    return { app, ROOT, ctx, errors, dialogs, close };
}
const TEACHER_INIT = { fn: () => { localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); } };

test('교사 ③ 보고서 AI: 마친 수업에는 켜짐 신호를 쓰지 않고, 꺼 두면 한 번 꺼짐 알림 뒤 쓰기가 멈춤', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const E = await setup();
    try {
        const live = await E.app.post({ action: 'createClass', ban: 1, nStudents: 4, groupSize: 2, exp: 'malus' });
        const done = await E.app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'malus' });
        assert.equal((await E.app.post({ action: 'classDone', space: done.space, done: true })).ok, true);
        const beats = sp => E.app.calls.filter(c => c.body && c.body.action === 'aiDeskBeat' && c.body.space === sp).map(c => c.body.on);
        const T = await E.ctx({ viewport: { width: 1280, height: 900 } }, 'T', TEACHER_INIT);
        await T.goto(E.ROOT + 'projects/class-teacher.html');
        await T.waitForSelector('#classList button[data-open="' + live.space + '"]', { timeout: 15000 });
        await T.waitForSelector('#btnSettings:not([hidden])');
        await T.click('#btnSettings'); await T.click('#ctTabs button[data-tab="ai"]');
        await T.fill('#aiKey', 'sk-ant-TESTKEY');
        await T.check('#aiOn');
        await T.waitForFunction(() => /AI 답하기 켜짐/.test(document.getElementById('aiDeskNow').textContent));
        assert.match(await T.textContent('#aiDeskNow'), /내 수업 1개/, '마친 수업은 셈에서 빠짐');
        for (let i = 0; i < 40 && !beats(live.space).length; i++) await T.waitForTimeout(200);
        assert.deepEqual(beats(live.space), [true], '진행 중 수업에 켜짐 신호 한 번');
        // 끄기 → '꺼짐' 한 번 → 그 뒤로는 쓰지 않음 (3초마다 도는 일을 세 번 넘게 기다림)
        await T.uncheck('#aiOn');
        for (let i = 0; i < 40 && beats(live.space).length < 2; i++) await T.waitForTimeout(200);
        assert.deepEqual(beats(live.space), [true, false], '꺼짐 알림 한 번');
        await T.waitForTimeout(10000);
        assert.deepEqual(beats(live.space), [true, false], '꺼 둔 동안 유휴 쓰기 없음');
        assert.deepEqual(beats(done.space), [], '마친 수업에는 한 번도 안 씀');
        assert.deepEqual(E.errors, []);
    } finally { await E.close(); }
});

test('수업 마치기 확인창: 팀 수업은 도전 장면이 바로 지워진다고 알리고, 취소하면 그대로 · 조 수업은 되돌릴 수 있다고', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const E = await setup();
    try {
        const team = await E.app.post({ action: 'createClass', ban: 1, mode: 'team', nTeams: 4, exp: 'rocket' });
        const grp = await E.app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'malus' });
        const T = await E.ctx({ viewport: { width: 1280, height: 900 } }, 'T', TEACHER_INIT);
        const openPop = async sp => {
            await T.goto(E.ROOT + 'projects/class-teacher.html#class=' + sp + '&view=present');
            await T.waitForSelector('#presentPane:not([hidden])', { timeout: 15000 });
            await T.click('#btnPExit'); await T.waitForSelector('#runPop:not([hidden])');
        };
        await openPop(team.space);
        T.__dialogAnswer = [false];
        await T.click('#btnRunPopDone');
        for (let i = 0; i < 20 && !E.dialogs.length; i++) await T.waitForTimeout(100);
        assert.equal(E.dialogs.length, 1);
        assert.match(E.dialogs[0].message, new RegExp(team.classCode + '[\\s\\S]*도전 장면 사진·영상은 지금 바로 지워지며 되돌릴 수 없어요'));
        await T.waitForTimeout(500);
        assert.notEqual(E.app.db.docs.get('labClasses/' + team.space).done, true, '취소하면 마치지 않음');
        T.__dialogAnswer = [true];
        await T.click('#btnRunPopDone');
        await T.waitForFunction(() => /마친 수업으로 표시/.test(document.getElementById('runPopMsg').textContent), null, { timeout: 15000 });
        assert.equal(E.app.db.docs.get('labClasses/' + team.space).done, true);
        // 단계 열기가 없는 실험(말루스)은 발표 보기 대신 진행 화면 → 그 화면의 ✅ 수업 마치기
        await T.goto(E.ROOT + 'projects/class-teacher.html#class=' + grp.space + '&view=run');
        await T.waitForSelector('#runPane:not([hidden])', { timeout: 15000 });
        const n = E.dialogs.length;
        await T.click('#btnDone');
        for (let i = 0; i < 20 && E.dialogs.length === n; i++) await T.waitForTimeout(100);
        assert.doesNotMatch(E.dialogs[n].message, /도전 장면/, '조 수업에는 도전 장면 안내 없음');
        assert.match(E.dialogs[n].message, /다시 눌러 되돌릴 수 있어요/);
        assert.deepEqual(E.errors, []);
    } finally { await E.close(); }
});

test('보고서 AI 가설연역: 가설 판정·자료 해석은 계산 결과를 기본으로 함께 보내고, 가설 쓰기는 안 보냄 · 진자 분석 낡은 안내 없음', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const E = await setup();
    try {
        const P = await E.ctx({ viewport: { width: 1280, height: 900 } }, 'P', { fn: () => { localStorage.setItem('lab-flow', /quantum-dot/.test(location.pathname) ? 'hd' : 'steps'); } });
        await P.goto(E.ROOT + 'projects/quantum-dot.html?device=laptop');
        await P.waitForSelector('#report-ai input[data-sec="verdict"][data-att="calc"]', { state: 'attached', timeout: 15000 });
        const att = await P.evaluate(() => {
            const o = {};
            document.querySelectorAll('#report-ai input[data-att="calc"]').forEach(cb => { o[cb.dataset.sec] = cb.checked; });
            return o;
        });
        assert.equal(att.verdict, true, '가설 판정: 계산 결과 기본 체크 ' + JSON.stringify(att));
        assert.equal(att.analysis, true, '자료 해석: 계산 결과 기본 체크');
        assert.equal(att.hypothesis, false, '가설: 계산 결과 기본 안 보냄');
        assert.equal(att.problem, false, '탐구 문제: 계산 결과 기본 안 보냄');
        // 진자 분석: 1. 목적에 '다음 업데이트' 안내가 없고, 7. 결론에 보고서 칸이 실제로 있음
        await P.goto(E.ROOT + 'projects/pendulum-report.html?device=laptop');
        await P.waitForSelector('.step-panel[data-step="purpose"]', { state: 'attached' });
        assert.doesNotMatch(await P.textContent('main'), /다음 업데이트/);
        assert.equal(await pickVars(P), true, '변인 카드 고르기(골라야 다음)');
        await P.click('nav.steps button[data-step="conclusion"]');
        await P.waitForSelector('#report-ai .rai-card', { timeout: 15000 });
        assert.deepEqual(E.errors, []);
    } finally { await E.close(); }
});

test('전자기 유도: 양(+)·음(−) 넓이를 0 통과에서 나눠 따로 구함 — 예전 저장 측정(넓이 값 없음)의 📈 보기 · 시뮬레이션 측정 결과 칸', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const E = await setup();
    try {
        // 짠 파형(넓이 값이 없는 예전 저장 모양): 0 → +10 mV → +10 → −10 → −20 → 0, 0.1 s 간격. +10 → −10 칸은 가운데(0.25 s)에서 나뉨
        // 양: 0.5·10·0.1 + 10·0.1 + 0.5·10·0.05 = 1.75 mV·s / 음: −(0.5·10·0.05 + 15·0.1 + 0.5·20·0.1) = −2.75 mV·s / 순: −1.0
        const old = [{ id: 'oldTrial01', name: '예전 측정', N: 200, integral: -1, wave: { t: [0, 0.1, 0.2, 0.3, 0.4, 0.5], v: [0, 10, 10, -10, -20, 0], i: [0, 0, 0, 0, 0, 0] } }];
        const P = await E.ctx({ viewport: { width: 1280, height: 900 } }, 'P', { fn: t => { if (!localStorage.getItem('emTrials')) localStorage.setItem('emTrials', JSON.stringify(t)); }, arg: old });
        await P.goto(E.ROOT + 'projects/em-induction.html');
        assert.equal(await pickVars(P), true, '변인 카드 고르기(골라야 다음)');
        await P.click('nav.steps button[data-step="result"]');
        await P.click('#trials button[title="이 측정의 그래프 보기"]');
        await P.waitForFunction(() => /양\(\+\) 넓이/.test(document.getElementById('results').textContent));
        const read = async () => {
            const txt = await P.textContent('#results');
            const num = re => { const m = re.exec(txt); return m ? Number(m[1]) : NaN; };
            return { txt, pos: num(/양\(\+\) 넓이[^\d-]*?(-?[\d.]+) mV·s/), neg: num(/음\(−\) 넓이[^\d-]*?(-?[\d.]+) mV·s/),
                net: num(/전체 순 넓이[^\d-]*?(-?[\d.]+) mV·s/), dPos: num(/양\(\+\) 넓이[^(]*\((-?[\d.]+) µWb/), dNeg: num(/음\(−\) 넓이[^(]*\((-?[\d.]+) µWb/) };
        };
        let r = await read();
        assert.equal(r.pos, 1.75, '양 넓이 ' + r.txt);
        assert.equal(r.neg, -2.75, '음 넓이 ' + r.txt);
        assert.equal(r.net, -1, '순 넓이');
        assert.ok(r.dPos > 0 && r.dNeg > 0 && Math.abs(r.dNeg / r.dPos - 2.75 / 1.75) < 0.01, '선속 변화 크기 둘 다 양수, 비율은 넓이 비율: ' + r.dPos + ' / ' + r.dNeg);
        // 시뮬레이션으로 실제 측정 → 결과 칸
        await P.click('nav.steps button[data-step="data"]');
        assert.match(await P.evaluate(() => document.getElementById('rV').closest('.readout').textContent), /코일 단자 전압 V/);
        await P.click('#btnDemo');
        await P.click('#btnRec');
        await P.waitForTimeout(3200);   // 한 사이클 2.4 s 보다 길게
        await P.click('#btnRec');
        await P.click('nav.steps button[data-step="result"]');
        r = await read();
        assert.ok(r.pos > 0, '시뮬레이션 양 넓이 ' + r.txt);
        assert.ok(r.neg < 0, '시뮬레이션 음 넓이 ' + r.neg);
        assert.ok(Math.abs(r.net - (r.pos + r.neg)) < 0.01, '순 넓이 = 양 + 음');
        assert.match(r.txt, /봉우리 순서[\s\S]*\+ 먼저, − 나중/, '들어갈 때 +, 나올 때 −');
        assert.deepEqual(E.errors, []);
    } finally { await E.close(); }
});

test('이상기체 변인 카드: 바꿀 것 후보는 압력 P·온도 t, 압력을 고르면 온도·기체의 양이 🔒, 재는 것은 부피 V', { skip: !chromium && 'playwright 없음', timeout: 120000 }, async () => {
    const E = await setup();
    try {
        const P = await E.ctx({ viewport: { width: 1280, height: 900 } }, 'P');
        await P.goto(E.ROOT + 'projects/ideal-gas.html');
        await P.click('nav.steps button[data-step="procedure"]');
        const VC = '.rai-inline.rai-vc:not([hidden])';
        await P.waitForSelector(VC + ' input[data-vc="change"]', { timeout: 15000 });
        const opts = await P.$$eval(VC + ' input[data-vc="change"]', l => l.map(i => i.closest('label').textContent.trim()));
        assert.equal(opts.length, 2, '바꿀 것 후보 둘: ' + opts);
        assert.match(opts[0], /압력 P/); assert.match(opts[1], /온도 t/);
        await P.check(VC + ' input[data-vc="change"][value="pres"]');
        const keep = await P.textContent(VC + ' [data-vc-keep]');
        assert.match(keep, /🔒 온도 t/); assert.match(keep, /🔒 기체의 양/);
        assert.doesNotMatch(keep, /압력 P/, '바꾸는 것은 잠그지 않음');
        assert.match(await P.textContent(VC), /주사기 부피 V/);
        assert.deepEqual(E.errors, []);
    } finally { await E.close(); }
});
