// 수업 참여·조 공유 공통 부품(js/class-share.js)과 저장소(js/lab-store.js, Firestore — 시험은 메모리 DB)
const test = require('node:test');
const assert = require('node:assert/strict');
const CS = require('../js/class-share.js');
const CC = require('../js/class-cloud.js');
const PD = require('../js/pendulum-cloud.js');
const { loadLabStore } = require('./fake-lab-store.cjs');

const base = over => Object.assign({ exp: 'idealgas', group: '2-3-5376', device: 'nab12cd', isGroupCode: PD.isGroupCode, now: '2026-11-16T01:00:00.000Z',
    items: [{ id: 'boyle1', title: '보일 1회', n: 8, summary: { k: 101.3, R2: 0.998 }, data: { rows: [[1, 2], [3, 4]] } }, { id: 'charles', title: '샤를', n: 0, data: [] }] }, over);

test('보낼 내용: 노트북 번호 + id, data 는 JSON 글자, 예전에 보냈다 사라진 것은 빈 줄', async () => {
    const r = CS.buildPayloads(base({ sent: ['nab12cd-old123', 'nzz9999-other1'] }));
    assert.equal(r.error, undefined);
    assert.deepEqual(r.payloads.map(p => [p.id, p.n, p.title]), [['nab12cd-boyle1', 8, '보일 1회'], ['nab12cd-charles', 0, '샤를'], ['nab12cd-old123', 0, '(지움)']]);
    assert.equal(r.payloads[0].data, '{"rows":[[1,2],[3,4]]}');
    assert.equal(r.payloads[0].action, 'save'); assert.equal(r.payloads[0].exp, 'idealgas');
    assert.match(CS.buildPayloads(base({ group: '' })).error, /조 코드/);
    assert.match(CS.buildPayloads(base({ device: '' })).error, /노트북/);
    assert.match(CS.buildPayloads(base({ items: [] })).error, /보낼 측정값이 없습니다/);
    const big = CS.buildPayloads(base({ items: [{ id: 'big123', n: 1, data: 'x'.repeat(300000) }] })).payloads[0];
    assert.equal(big.data, ''); assert.equal(big.tooBig, true);
    assert.equal(CS.rowId('nab12cd', '한글'), 'nab12cd-item');
    assert.equal(CS.rowId('nab12cd', 'a'.repeat(50)).length, 40);
});

test('받은 목록: 내 노트북·지운 줄은 빼고, data 를 풀어 줌', async () => {
    const items = [
        { device: 'nab12cd', id: 'nab12cd-x1', n: 3, data: '[1]' },
        { device: 'nzz9999', id: 'nzz9999-boyle1', n: 8, title: '보일', summary: { k: 1 }, data: '{"a":1}', sentAt: 't' },
        { device: 'nzz9999', id: 'nzz9999-gone', n: 0, data: '' },
        { device: 'nqq1111', id: 'nqq1111-txt', n: 1, data: 'not json' }
    ];
    const r = CS.incomingFrom(items, 'nab12cd');
    assert.deepEqual(r.map(x => [x.id, x.device, x.from]), [['boyle1', 'nzz9999', '노트북 9999'], ['txt', 'nqq1111', '노트북 1111']]);
    assert.deepEqual(r[0].data, { a: 1 });
    assert.equal(r[1].data, 'not json');
});

test('저장소(js/lab-store.js): 공용 저장 → 목록 → 고쳐 쓰기, 실험끼리·조끼리 섞이지 않음, 글자는 그대로', async () => {
    const app = loadLabStore();
    const pls = CS.buildPayloads(base()).payloads;
    for (const p of pls) assert.equal((await app.post(p)).ok, true);
    await app.post(Object.assign({}, pls[0], { exp: 'malus' }));
    await app.post(Object.assign({}, pls[0], { group: '1-1-0001' }));
    await app.post(Object.assign({}, pls[0], { exp: 'custom:abcDEF_12', title: '=SUM(A1)' }));
    const docs = app.items();
    assert.equal(docs.length, 5);
    assert.ok(docs.every(d => d.expireAt instanceof Date && d.expireAt - Date.now() > 180 * 86400000), '183일 뒤 지워짐 표시');
    assert.ok(docs.every(d => d._space === 'g' + d.group), '조 코드 공간');
    let list = await app.get({ action: 'list', exp: 'idealgas', group: '2-3-5376' });
    assert.equal(list.ok, true, list.error);
    assert.deepEqual(list.items.map(x => [x.id, x.n]), [['nab12cd-boyle1', 8], ['nab12cd-charles', 0]]);
    assert.deepEqual(list.items[0].summary, { k: 101.3, R2: 0.998 });
    assert.equal(list.items[0].data, '{"rows":[[1,2],[3,4]]}');
    assert.equal((await app.get({ action: 'list', exp: 'custom:abcDEF_12', group: '2-3-5376' })).items[0].title, '=SUM(A1)');
    // 다시 보내면 같은 줄
    assert.equal((await app.post(Object.assign({}, pls[0], { n: 9 }))).updated, true);
    list = await app.get({ action: 'list', exp: 'idealgas', group: '2-3-5376' });
    assert.equal(list.items.length, 2); assert.equal(list.items[0].n, 9);
    // 플랑크·진자는 그대로 따로
    assert.equal((await app.get({ action: 'list', exp: 'planck', group: '2-3-5376' })).items.length, 0);
    assert.equal((await app.get({ action: 'list', group: '2-3-5376' })).items.length, 0);
    // 다른 노트북 쪽에서 받기
    const got = CS.incomingFrom(list.items, 'nzz9999');
    assert.equal(got.length, 1); assert.deepEqual(got[0].data, { rows: [[1, 2], [3, 4]] });
    // 짝 공간(p…)에 보낸 것은 조 코드 공간에서 안 보임
    const pair = 'p' + 'a'.repeat(23);
    await app.post(Object.assign({}, pls[0], { space: pair, id: 'nab12cd-pair01' }));
    assert.equal((await app.post({ action: 'list', exp: 'idealgas', group: '2-3-5376' })).items.length, 2);
    assert.equal((await app.post({ action: 'list', space: pair, exp: 'idealgas', group: '2-3-5376' })).items.length, 1);
});

test('저장소: 큰 자료(27만 자까지)는 그대로 되돌림', async () => {
    const app = loadLabStore();
    const data = JSON.stringify({ s: 'ab'.repeat(100000) });   // 약 20만 자
    assert.equal((await app.post({ action: 'save', exp: 'accel', id: 'nab12cd-run001', group: '2-3-4821', device: 'nab12cd', n: 5000, data })).ok, true);
    assert.equal((await app.get({ action: 'list', exp: 'accel', group: '2-3-4821' })).items[0].data, data);
    assert.match((await app.post({ action: 'save', exp: 'accel', id: 'nab12cd-run002', group: '2-3-4821', device: 'nab12cd', n: 1, data: 'x'.repeat(270001) })).error, /너무 큽니다/);
});

test('저장소: 값 검사', async () => {
    const app = loadLabStore();
    const ok = CS.buildPayloads(base()).payloads[0];
    const bad = async o => (await app.post(Object.assign({}, ok, o))).error;
    assert.match(await bad({ exp: 'nope' }), /알 수 없는 실험/);
    assert.match(await bad({ exp: 'custom:a b' }), /알 수 없는 실험/);
    assert.match(await bad({ group: '2-3' }), /조 코드/);
    assert.match(await bad({ id: 'x' }), /id/);
    assert.match(await bad({ device: '' }), /노트북/);
    assert.match(await bad({ n: -1 }), /점 수/);
    assert.match(await bad({ summary: [1, 2] }), /요약/);
    assert.match(await bad({ summary: { 'a|b': 1 } }), /요약 이름/);
    assert.match(await bad({ summary: Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['k' + i, i])) }), /너무 많습니다/);
    assert.match((await app.get({ action: 'list', exp: 'nope', group: '2-3-5376' })).error, /알 수 없는 실험/);
    assert.match((await app.get({ action: 'nope' })).error, /알 수 없는 요청/);
    assert.equal((await app.get({ action: 'ping' })).store, 'firestore');
});

test('수업: 구글 로그인 교사만 만들고, 모든 실험으로 만들 수 있고, 진행 보기에 실험별 제출 요약 (주인만)', async () => {
    const app = loadLabStore();
    assert.match((await app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 4, exp: 'idealgas' }, { uid: 'anon1' })).error, /구글 로그인/);
    const c = await app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 4, exp: 'idealgas' });
    assert.equal(c.ok, true, c.error);
    assert.match(c.space, /^c[a-z0-9]{23}$/);
    const g1 = c.groups[0].code;
    for (const p of CS.buildPayloads(base({ group: g1 })).payloads) await app.post(Object.assign({ space: c.space }, p));
    await app.post(Object.assign({ space: c.space }, CS.buildPayloads(base({ group: g1 })).payloads[0], { exp: 'malus', id: 'nab12cd-malus1' }));   // 다른 실험은 세지 않음
    await app.post(Object.assign({}, CS.buildPayloads(base({ group: g1 })).payloads[0], { id: 'nab12cd-other1' }));   // 다른 공간(조 코드 공간)은 세지 않음
    let st = await app.post({ action: 'classStatus', class: c.classCode });
    assert.equal(st.ok, true, st.error);
    assert.equal(st.exp, 'idealgas');
    assert.equal(st.submissions[0].rows, 1, 'n 0 인 줄은 세지 않음');
    assert.deepEqual(st.submissions[0].labels, ['보일 1회']);
    assert.deepEqual(st.submissions[0].summary, { k: 101.3, R2: 0.998 });
    assert.equal(CC.submissionText('idealgas', st.submissions[0]), '제출: 1개 (보일 1회) · k 101.3, R2 0.998');
    assert.match((await app.post({ action: 'classStatus', space: c.space }, { uid: 'other-teacher', google: true })).error, /만든 선생님만/);
    // 진자
    const p = await app.post({ action: 'createClass', ban: 3, nStudents: 4, groupSize: 4, exp: 'pendulum' });
    await app.post({ action: 'save', space: p.space, id: 'mabcdefghij', group: p.groups[0].code, L: 1, nPeriods: 10, T_mean: 2.006, measuredAt: '2026-11-16T01:00:00Z', device: 'iPhone' });
    st = await app.post({ action: 'classStatus', space: p.space });
    assert.equal(st.submissions[0].rows, 1);
    assert.deepEqual(st.submissions[0].summary, { L: 1, T: 2.006 });
    assert.match(CC.submissionText('pendulum', st.submissions[0]), /L 1 m.*T 2\.006/);
    // 선생님이 만든 실험
    const u = await app.post({ action: 'createClass', ban: 4, nStudents: 4, groupSize: 2, exp: 'custom:abcDEF_12' });
    const j = await app.post({ action: 'joinInfo', class: u.classCode }, { uid: 'anon2' });
    assert.equal(j.exp, 'custom:abcDEF_12'); assert.equal(j.space, u.space);
    // 하트비트 (학생 익명)
    assert.equal((await app.post({ action: 'heartbeat', class: u.classCode, jo: 1, num: 1, step: 'data' }, { uid: 'anon2' })).ok, true);
    assert.match((await app.post({ action: 'heartbeat', class: u.classCode, jo: 9, num: 1 }, { uid: 'anon2' })).error, /없는 조/);
    assert.equal(app.progress().length, 1); assert.equal(app.progress()[0].step, 'data');
    // 내 수업 목록·지우기
    assert.equal((await app.post({ action: 'myClasses' })).classes.length, 3);
    assert.equal((await app.post({ action: 'myClasses' }, { uid: 'x', google: true })).classes.length, 0);
    assert.equal((await app.post({ action: 'deleteClass', space: c.space })).ok, true);
    assert.equal((await app.post({ action: 'joinInfo', class: c.classCode }, { uid: 'anon3' })).ok, false);
    assert.equal(app.items('idealgas').filter(d => d._space === c.space).length, 0, '학생 자료도 지움');
});

test('스마트폰 카메라 심박수(heartrate) 저장·목록, 수업도 만들 수 있음', async () => {
    const app = loadLabStore();
    const LS = require('../js/lab-store.js');
    assert.equal(LS.isGenericExp('heartrate'), true);
    assert.equal(LS.isClassExp('heartrate'), true);
    const r = await app.post({ action: 'save', exp: 'heartrate', id: 'nabcd12-run1', group: '2-3-5376', device: 'nabcd12', title: '1회', n: 300,
        summary: { 'BPM': 72, '측정 시간(s)': 30 }, data: JSON.stringify({ t: [0, 1], v: [1, 2] }), sentAt: new Date().toISOString() });
    assert.equal(r.ok, true, JSON.stringify(r));
    const l = await app.get({ action: 'list', exp: 'heartrate', group: '2-3-5376' });
    assert.equal(l.items.length, 1); assert.equal(l.items[0].summary.BPM, 72);
    const c = await app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 4, exp: 'heartrate' });
    assert.equal(c.ok, true, JSON.stringify(c));
});
test('실험 목록: 저장소와 같은 이름, 학생 링크(이미 ?가 있는 주소 포함)', async () => {
    const LS = require('../js/lab-store.js');
    Object.keys(CC.EXPS).forEach(k => assert.equal(LS.isClassExp(k), true, k));
    assert.equal(LS.isClassExp('custom:abc'), true);
    assert.equal(CC.studentUrl('https://x', 'light', '2-4821', 'SID'), 'https://x/projects/environment-lab.html?sensor=light&c=2-4821&s=SID');
    assert.equal(CC.studentUrl('https://x', 'custom:abc_1', '2-4821'), 'https://x/projects/custom-lab.html?id=abc_1&c=2-4821');
    assert.equal(CC.expInfo('custom:bad id'), null);
    assert.equal(CC.readClassParam('?sensor=light&c=2-4821'), '2-4821');
});

test('요약 이름에 °·%·한글 허용, | 와 제어 문자·빈 이름만 막음', async () => {
    const app = loadLabStore();
    const ok = CS.buildPayloads(base()).payloads[0];
    const r = await app.post(Object.assign({}, ok, { summary: { '온도(°C)': 23.5, '습도(%)': 41, 'VOC Index': 100, 'ΔP-P': 0.01 } }));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual((await app.get({ action: 'list', exp: 'idealgas', group: '2-3-5376' })).items[0].summary, { '온도(°C)': 23.5, '습도(%)': 41, 'VOC Index': 100, 'ΔP-P': 0.01 });
    const bad = async o => (await app.post(Object.assign({}, ok, { summary: o }))).error;
    assert.match(await bad({ 'a|b': 1 }), /요약 이름/);
    assert.match(await bad({ 'a\nb': 1 }), /요약 이름/);
    assert.match(await bad({ '  ': 1 }), /요약 이름/);
    assert.match(await bad({ ['x'.repeat(31)]: 1 }), /요약 이름/);
});

test('내려받기 CSV: BOM·열 이름·요약 열·조 순서·엑셀 수식 막기', async () => {
    const LS = require('../js/lab-store.js');
    const groups = [{ jo: 1, code: '2-1-4821', size: 2 }, { jo: 2, code: '2-2-4821', size: 2 }];
    const items = [
        { exp: 'idealgas', group: '2-2-4821', id: 'nb-r1', device: 'nbbbbbb', title: '=1+1', n: 3, summary: { 'P (kPa)': 101 }, data: '{"a":1}', sentAt: '2026-11-18T02:00:00Z' },
        { exp: 'idealgas', group: '2-1-4821', id: 'na-r1', device: 'naaaaaa', title: '실험 1, "보일"', n: 5, summary: { 'T (°C)': 20 }, data: 'x'.repeat(40000), sentAt: '2026-11-18T01:00:00Z' }
    ];
    const { csv, rows } = LS.toCsv('idealgas', items, groups);
    assert.equal(rows, 2);
    assert.ok(csv.startsWith('﻿조,조 코드,보낸 기기,회차 번호,회차 이름,점 수,보낸 시각,요약: P (kPa),요약: T (°C),자료 (JSON)'));
    const lines = csv.split('\r\n');
    assert.match(lines[1], /^1,2-1-4821,naaaaaa,na-r1,"실험 1, ""보일""",5,/);
    assert.match(lines[1], /너무 큼 40000자/);
    assert.match(lines[2], /^2,2-2-4821,nbbbbbb,nb-r1,'=1\+1,3,/);
    const pc = LS.toCsv('pendulum', [{ group: '2-1-4821', id: 'm1', L: 0.5, T_mean: 1.42, nPeriods: 10, raw: 'P1|…' }], groups).csv;
    assert.match(pc, /줄 길이 L \(m\)/); assert.match(pc.split('\r\n')[1], /^1,2-1-4821,,m1,L 0\.5 m,10,/);
});

test('선생님이 만든 실험 공개 확인: 공개·비공개(403)·없음(404)·인터넷', async () => {
    const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    let url = '';
    const pub = await CC.checkCustom('abc_123', async u => { url = u; return res(200, { fields: { published: { booleanValue: true }, title: { stringValue: '빛의 굴절' } } }); });
    assert.deepEqual(pub, { state: 'public', title: '빛의 굴절' });
    assert.match(url, /^https:\/\/firestore\.googleapis\.com\/v1\/projects\/web-experiment-f9b24\/databases\/\(default\)\/documents\/customExperiments\/abc_123\?key=/);
    assert.equal((await CC.checkCustom('abc', async () => res(403, {}))).state, 'hidden');
    assert.equal((await CC.checkCustom('abc', async () => res(404, {}))).state, 'hidden');
    assert.equal((await CC.checkCustom('abc', async () => res(200, { fields: { published: { booleanValue: false } } }))).state, 'hidden');
    assert.equal((await CC.checkCustom('abc', async () => { throw new Error('Failed'); })).state, 'unknown');
    assert.equal((await CC.checkCustom('bad id', async () => res(200, {}))).state, 'hidden');
});

test('📱 폰 연결: 주소 읽기·만들기, 폰 기기 이름, 교사 화면 단계 이름', async () => {
    assert.deepEqual(CS.readPhoneParams('?role=phone&group=2-3-4821&s=AKfy'), { group: '2-3-4821', jo: 0, num: 0 });
    assert.deepEqual(CS.readPhoneParams('?c=2-4821&role=phone&group=2-3-4821&jo=3&num=2'), { group: '2-3-4821', jo: 3, num: 2 });
    assert.equal(CS.readPhoneParams('?group=2-3-4821'), null, 'role=phone 이 없으면 노트북');
    assert.equal(CS.readPhoneParams('?role=phone&group=2-3'), null);
    assert.equal(CS.readPhoneParams('?role=phonebook&group=2-3-4821'), null);
    assert.deepEqual(CS.readPhoneParams('?role=phone&group=2-3-4821&jo=0&num=99'), { group: '2-3-4821', jo: 0, num: 0 });
    assert.equal(CS.phoneUrl('https://x/projects/environment-lab.html?sensor=light&group=9-9-9999#top', { group: '2-3-4821', scriptId: 'SID' }),
        'https://x/projects/environment-lab.html?sensor=light&role=phone&group=2-3-4821&s=SID');
    assert.equal(CS.phoneUrl('https://x/projects/a.html', { group: '2-3-4821', classCode: '2-4821', jo: 3, num: 2 }),
        'https://x/projects/a.html?role=phone&group=2-3-4821&c=2-4821&jo=3&num=2');
    assert.match(CS.newDeviceId(null, 'p'), /^p[a-z2-9]{6}$/);
    assert.match(CS.newDeviceId(), /^n/);
    assert.equal(CS.deviceLabel('pabcd12'), '📱 폰 CD12');
    assert.equal(CS.deviceLabel('nabcd12'), '노트북 CD12');
    assert.equal(CS.incomingFrom([{ device: 'pabcd12', id: 'pabcd12-run1', n: 3 }], 'nme1234')[0].from, '📱 폰 CD12');
    assert.equal(CC.stepName('phoneaccel', 'phone-live'), '📱 측정 중');
    assert.equal(CC.stepName('malus', 'phone-data'), '📱 5 데이터');
    assert.equal(CC.stepName('malus', 'data'), '5 데이터');
});
