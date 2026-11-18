// 수업 참여·조 공유 공통 부품(js/class-share.js)과 Code.gs 6판 실험 공용 저장(submissions 시트)
const test = require('node:test');
const assert = require('node:assert/strict');
const CS = require('../js/class-share.js');
const CC = require('../js/class-cloud.js');
const PD = require('../js/pendulum-cloud.js');
const { loadCodeGs } = require('./fake-apps-script.cjs');

const base = over => Object.assign({ exp: 'idealgas', group: '2-3-5376', device: 'nab12cd', isGroupCode: PD.isGroupCode, now: '2026-11-16T01:00:00.000Z',
    items: [{ id: 'boyle1', title: '보일 1회', n: 8, summary: { k: 101.3, R2: 0.998 }, data: { rows: [[1, 2], [3, 4]] } }, { id: 'charles', title: '샤를', n: 0, data: [] }] }, over);

test('보낼 내용: 노트북 번호 + id, data 는 JSON 글자, 예전에 보냈다 사라진 것은 빈 줄', () => {
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

test('받은 목록: 내 노트북·지운 줄은 빼고, data 를 풀어 줌', () => {
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

test('Apps Script 6판: 공용 저장 → 목록 → 고쳐 쓰기, 실험끼리·조끼리 섞이지 않음, 글자는 글자로', () => {
    const app = loadCodeGs();
    const pls = CS.buildPayloads(base()).payloads;
    pls.forEach(p => assert.equal(app.post(p).ok, true));
    app.post(Object.assign({}, pls[0], { exp: 'malus' }));
    app.post(Object.assign({}, pls[0], { group: '1-1-0001' }));
    app.post(Object.assign({}, pls[0], { exp: 'custom:abcDEF_12', title: '=SUM(A1)' }));
    const sh = app.ss.getSheetByName('submissions');
    assert.equal(sh.rows.length, 1 + 5);
    assert.equal(sh.rows[1][2], '2-3-5376', '조 코드가 날짜로 바뀌지 않음');
    assert.equal(sh.rows[5][3], '=SUM(A1)'); assert.equal(sh.written[5][3], "'=SUM(A1)");
    let list = app.get({ action: 'list', exp: 'idealgas', group: '2-3-5376' });
    assert.equal(list.ok, true, list.error);
    assert.deepEqual(list.items.map(x => [x.id, x.n]), [['nab12cd-boyle1', 8], ['nab12cd-charles', 0]]);
    assert.deepEqual(list.items[0].summary, { k: 101.3, R2: 0.998 });
    assert.equal(list.items[0].data, '{"rows":[[1,2],[3,4]]}');
    assert.equal(app.get({ action: 'list', exp: 'custom:abcDEF_12', group: '2-3-5376' }).items[0].title, '=SUM(A1)');
    // 다시 보내면 같은 줄
    assert.equal(app.post(Object.assign({}, pls[0], { n: 9 })).updated, true);
    list = app.get({ action: 'list', exp: 'idealgas', group: '2-3-5376' });
    assert.equal(list.items.length, 2); assert.equal(list.items[0].n, 9);
    // 플랑크·진자는 그대로 따로
    assert.equal(app.get({ action: 'list', exp: 'planck', group: '2-3-5376' }).items.length, 0);
    assert.equal(app.get({ action: 'list', group: '2-3-5376' }).items.length, 0);
    // 다른 노트북 쪽에서 받기
    const got = CS.incomingFrom(list.items, 'nzz9999');
    assert.equal(got.length, 1); assert.deepEqual(got[0].data, { rows: [[1, 2], [3, 4]] });
});

test('Apps Script 6판: 큰 자료는 6칸에 나눠 담고 그대로 되돌림', () => {
    const app = loadCodeGs();
    const data = JSON.stringify({ s: 'ab'.repeat(100000) });   // 약 20만 자
    assert.equal(app.post({ action: 'save', exp: 'accel', id: 'nab12cd-run001', group: '2-3-4821', device: 'nab12cd', n: 5000, data }).ok, true);
    const row = app.ss.getSheetByName('submissions').rows[1];
    assert.ok(row.slice(9).filter(Boolean).length >= 5);
    assert.equal(app.get({ action: 'list', exp: 'accel', group: '2-3-4821' }).items[0].data, data);
    assert.match(app.post({ action: 'save', exp: 'accel', id: 'nab12cd-run002', group: '2-3-4821', device: 'nab12cd', n: 1, data: 'x'.repeat(270001) }).error, /너무 큽니다/);
});

test('Apps Script 6판: 값 검사', () => {
    const app = loadCodeGs();
    const ok = CS.buildPayloads(base()).payloads[0];
    const bad = o => app.post(Object.assign({}, ok, o)).error;
    assert.match(bad({ exp: 'nope' }), /알 수 없는 실험/);
    assert.match(bad({ exp: 'custom:a b' }), /알 수 없는 실험/);
    assert.match(bad({ group: '2-3' }), /조 코드/);
    assert.match(bad({ id: 'x' }), /id/);
    assert.match(bad({ device: '' }), /노트북/);
    assert.match(bad({ n: -1 }), /점 수/);
    assert.match(bad({ summary: [1, 2] }), /요약/);
    assert.match(bad({ summary: { 'a|b': 1 } }), /요약 이름/);
    assert.match(bad({ summary: Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['k' + i, i])) }), /너무 많습니다/);
    assert.match(app.get({ action: 'list', exp: 'nope', group: '2-3-5376' }).error, /알 수 없는 실험/);
    assert.match(app.get({ action: 'raw', exp: 'idealgas', group: '2-3-5376' }).error, /알 수 없는 요청/);
    assert.ok(app.get({ action: 'ping' }).version >= 6);
});

test('수업: 모든 실험으로 만들 수 있고, 진행 보기에 실험별 제출 요약', () => {
    const app = loadCodeGs();
    // 공용 실험
    const c = app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 4, exp: 'idealgas' });
    assert.equal(c.ok, true, c.error);
    const g1 = c.groups[0].code;
    CS.buildPayloads(base({ group: g1 })).payloads.forEach(p => app.post(p));
    app.post(Object.assign({}, CS.buildPayloads(base({ group: g1 })).payloads[0], { exp: 'malus', id: 'nab12cd-malus1' }));   // 다른 실험은 세지 않음
    let st = app.post({ action: 'classStatus', class: c.classCode, key: c.key });
    assert.equal(st.ok, true, st.error);
    assert.equal(st.exp, 'idealgas');
    assert.equal(st.submissions[0].rows, 1, 'n 0 인 줄은 세지 않음');
    assert.deepEqual(st.submissions[0].labels, ['보일 1회']);
    assert.deepEqual(st.submissions[0].summary, { k: 101.3, R2: 0.998 });
    assert.equal(CC.submissionText('idealgas', st.submissions[0]), '제출: 1개 (보일 1회) · k 101.3, R2 0.998');
    // 진자: measurements 시트
    const p = app.post({ action: 'createClass', ban: 3, nStudents: 4, groupSize: 4, exp: 'pendulum' });
    app.post({ action: 'save', id: 'mabcdefghij', group: p.groups[0].code, L: 1, nPeriods: 10, T_mean: 2.006, measuredAt: '2026-11-16T01:00:00Z', device: 'iPhone' });
    st = app.post({ action: 'classStatus', class: p.classCode, key: p.key });
    assert.equal(st.submissions[0].rows, 1);
    assert.deepEqual(st.submissions[0].summary, { L: 1, T: 2.006 });
    assert.match(CC.submissionText('pendulum', st.submissions[0]), /L 1 m.*T 2\.006/);
    // 선생님이 만든 실험
    const u = app.post({ action: 'createClass', ban: 4, nStudents: 4, groupSize: 2, exp: 'custom:abcDEF_12' });
    assert.equal(app.get({ action: 'joinInfo', class: u.classCode }).exp, 'custom:abcDEF_12');
    // 하트비트에 실험 이름
    app.post({ action: 'heartbeat', class: u.classCode, jo: 1, num: 1, step: 'data' });
    assert.equal(app.ss.getSheetByName('progress').rows[1][10], 'custom:abcDEF_12');
});

test('9판: 스마트폰 카메라 심박수(heartrate) 저장·목록, 수업도 만들 수 있음', () => {
    const app = loadCodeGs();
    assert.ok(app.get({ action: 'ping' }).version >= 9);
    assert.equal(app.ctx.isGenericExp('heartrate'), true);
    assert.equal(app.ctx.isClassExp('heartrate'), true);
    const r = app.post({ action: 'save', exp: 'heartrate', id: 'nabcd12-run1', group: '2-3-5376', device: 'nabcd12', title: '1회', n: 300,
        summary: { 'BPM': 72, '측정 시간(s)': 30 }, data: JSON.stringify({ t: [0, 1], v: [1, 2] }), sentAt: new Date().toISOString() });
    assert.equal(r.ok, true, JSON.stringify(r));
    const l = app.get({ action: 'list', exp: 'heartrate', group: '2-3-5376' });
    assert.equal(l.items.length, 1); assert.equal(l.items[0].summary.BPM, 72);
    const c = app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 4, exp: 'heartrate' });
    assert.equal(c.ok, true, JSON.stringify(c));
});
test('11판: 탄소 양자점 형광(qdot) 저장·목록, 수업도 만들 수 있음, 교사 화면은 서버 11판 필요', () => {
    const app = loadCodeGs();
    assert.ok(app.get({ action: 'ping' }).version >= 11);
    assert.equal(app.ctx.isGenericExp('qdot'), true);
    assert.equal(app.ctx.isClassExp('qdot'), true);
    const r = app.post({ action: 'save', exp: 'qdot', id: 'pabcd12-s1', group: '2-3-5376', device: 'pabcd12', title: '시료 1', n: 1,
        summary: { '가열(s)': 120, '봉우리(nm)': 455.2 }, data: JSON.stringify({ v: 1 }), sentAt: new Date().toISOString() });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(app.get({ action: 'list', exp: 'qdot', group: '2-3-5376' }).items[0].summary['봉우리(nm)'], 455.2);
    assert.equal(app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 4, exp: 'qdot' }).ok, true);
    assert.equal(CC.EXPS.qdot.needServer, 11);
    assert.equal(CC.EXPS.qdot.ready, true);
});
test('실험 목록: 서버와 같은 이름, 학생 링크(이미 ?가 있는 주소 포함)', () => {
    const app = loadCodeGs();
    Object.keys(CC.EXPS).forEach(k => assert.equal(app.ctx.isClassExp(k), true, k));
    assert.equal(app.ctx.isClassExp('custom:abc'), true);
    assert.equal(CC.studentUrl('https://x', 'light', '2-4821', 'SID'), 'https://x/projects/environment-lab.html?sensor=light&c=2-4821&s=SID');
    assert.equal(CC.studentUrl('https://x', 'custom:abc_1', '2-4821'), 'https://x/projects/custom-lab.html?id=abc_1&c=2-4821');
    assert.equal(CC.expInfo('custom:bad id'), null);
    assert.equal(CC.readClassParam('?sensor=light&c=2-4821'), '2-4821');
});

test('7판: 요약 이름에 °·%·한글 허용, | 와 제어 문자·빈 이름만 막음', () => {
    const app = loadCodeGs();
    const ok = CS.buildPayloads(base()).payloads[0];
    const r = app.post(Object.assign({}, ok, { summary: { '온도(°C)': 23.5, '습도(%)': 41, 'VOC Index': 100, 'ΔP/P': 0.01 } }));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(app.get({ action: 'list', exp: 'idealgas', group: '2-3-5376' }).items[0].summary, { '온도(°C)': 23.5, '습도(%)': 41, 'VOC Index': 100, 'ΔP/P': 0.01 });
    const bad = o => app.post(Object.assign({}, ok, { summary: o })).error;
    assert.match(bad({ 'a|b': 1 }), /요약 이름/);
    assert.match(bad({ 'a\nb': 1 }), /요약 이름/);
    assert.match(bad({ '  ': 1 }), /요약 이름/);
    assert.match(bad({ ['x'.repeat(31)]: 1 }), /요약 이름/);
    assert.ok(app.get({ action: 'ping' }).version >= 7);
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

test('📱 폰 연결: 주소 읽기·만들기, 폰 기기 이름, 교사 화면 단계 이름', () => {
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
