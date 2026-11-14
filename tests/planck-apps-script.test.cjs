// LED 플랑크 상수 Apps Script 웹앱 (apps-script/planck-led/) 의 서버 쪽 시험: 제출 저장·값 검사·교사 암호·화면 만들기
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPlanckApp, renderPage, DIR } = require('./fake-planck-apps-script.cjs');
const { build } = require('../tools/build-planck-apps-script.cjs');
const P = require('../js/planck-math.js');

// 문턱 vt 위로 직선인 이상적 LED 측정점
function ivFor(vt) { return [0, 0.1, 0.2, 0.3].map(d => ({ v: +(vt + d).toFixed(3), i: +(d * 40).toFixed(3) })); }
function goodPayload(over) {
    const leds = [['빨강', 625], ['초록', 525], ['파랑', 470]].map(([name, lambda]) => {
        const vt = P.photonVolt(lambda) - 0.1;
        const iv = ivFor(vt);
        return { name, lambda, v0: P.thresholdByExtrapolation(iv, 1).v0, iv, glow: [] };
    });
    return Object.assign({ group: '3반 2조', name: '10307 김과학', memo: '', method: 'extrapolate', iMode: 'ammeter', iMin: 1, hStudent: 6.6, leds }, over);
}

test('PlanckMath.html 은 js/planck-math.js 와 같은 계산 코드 (자동 생성 파일이 최신)', () => {
    assert.equal(fs.readFileSync(path.join(DIR, 'PlanckMath.html'), 'utf8'), build(),
        'node tools/build-planck-apps-script.cjs 를 실행하세요');
});

test('학생 제출: LED 하나당 한 줄, 첫 줄은 열 이름, 응답에는 다른 학생 자료가 없음', () => {
    const app = loadPlanckApp();
    app.ctx.submitMeasurement(goodPayload({ group: '1반 1조', name: '다른 학생' }));
    const r = app.ctx.submitMeasurement(goodPayload());
    assert.equal(r.ok, true); assert.equal(r.saved, 3);
    assert.deepEqual(Object.keys(r).sort(), ['id', 'ok', 'saved', 'submittedAt']);
    const rows = app.rows();
    assert.equal(rows.length, 1 + 6);
    assert.deepEqual(rows[0], Array.from(app.ctx.COLUMNS));
    const last = rows[6];
    assert.ok(last[0] instanceof Date);
    assert.equal(last[1], '3반 2조'); assert.equal(last[2], '10307 김과학'); assert.equal(last[4], '파랑');
    assert.equal(last[5], 470);
    assert.ok(Math.abs(last[6] - P.freqOf(470) / 1e14) < 1e-3);
    assert.match(last[7], /^전류/);
    assert.equal(last[9], 4); assert.equal(last[10], '전류계'); assert.equal(last[13], 3);
    const data = JSON.parse(last[14]);
    assert.equal(data.iv.length, 4); assert.equal(data.method, 'extrapolate');
    // 같은 제출의 줄은 제출 번호가 같다
    assert.equal(rows[4][3], rows[6][3]); assert.notEqual(rows[1][3], rows[4][3]);
});

test('빛 기준·고정 저항 방식도 저장', () => {
    const app = loadPlanckApp();
    app.ctx.submitMeasurement(goodPayload({ method: 'glow', leds: [{ name: '빨강', lambda: 625, v0: 1.8, glow: [1.79, 1.81], iv: [] }] }));
    const row = app.rows()[1];
    assert.equal(row[7], '빛'); assert.equal(row[9], 2); assert.equal(row[10], ''); assert.equal(row[11], '');
    app.ctx.submitMeasurement(goodPayload({ iMode: 'resistor', resistor: 330 }));
    assert.equal(app.rows()[2][10], '고정 저항 전압'); assert.equal(app.rows()[2][11], 330);
});

test('잘못된 값은 저장하지 않고 이유를 알려 줌', () => {
    const app = loadPlanckApp();
    const bad = [
        [{ group: '' }, /조/],
        [{ name: '   ' }, /이름/],
        [{ leds: [] }, /LED/],
        [{ leds: goodPayload().leds.map(l => Object.assign({}, l, { lambda: 50 })) }, /파장/],
        [{ leds: [Object.assign({}, goodPayload().leds[0], { iv: [{ v: 1, i: 1 }] })] }, /2개 이상/],
        [{ leds: [Object.assign({}, goodPayload().leds[0], { iv: [{ v: 'abc', i: 1 }, { v: 2, i: 2 }] })] }, /전압/],
        [{ leds: Array.from({ length: 9 }, () => goodPayload().leds[0]) }, /8개/],
        [{ iMode: 'resistor', resistor: 0 }, /고정 저항/]
    ];
    for (const [over, re] of bad) assert.throws(() => app.ctx.submitMeasurement(goodPayload(over)), re, JSON.stringify(over).slice(0, 60));
    assert.throws(() => app.ctx.submitMeasurement(null), /비어/);
    assert.equal(app.rows().length, 0);
});

test('시트에서 수식으로 실행되지 않게 = + - @ 로 시작하는 글은 앞에 \' 를 붙이고, 길이·줄바꿈을 정리', () => {
    const app = loadPlanckApp();
    app.ctx.submitMeasurement(goodPayload({ group: '=IMPORTXML("http://x")', name: '@이름\n두줄', memo: '+메모'.repeat(100) }));
    const row = app.rows()[1];
    assert.equal(row[1], "'=IMPORTXML(\"http://x");   // 20글자로 자른 뒤 ' 붙임
    assert.equal(row[2], "'@이름 두줄");
    assert.ok(row[15].startsWith("'+메모")); assert.ok(row[15].length <= 201);
    // 선생님 화면에는 ' 없이 보인다
    const data = app.ctx.teacherData('teacher-pw-123');
    assert.equal(data.rows[0].name, '@이름 두줄');
});

test('교사 자료: 암호가 없으면 설정 안내, 틀리면 거절, 10번 틀리면 잠김', () => {
    const none = loadPlanckApp({ password: null });
    assert.throws(() => none.ctx.teacherData('아무거나'), /TEACHER_PASSWORD/);
    const short = loadPlanckApp({ password: '123' });
    assert.throws(() => short.ctx.teacherLogin('123'), /6글자/);

    const app = loadPlanckApp();
    app.ctx.submitMeasurement(goodPayload());
    assert.throws(() => app.ctx.teacherData(''), /맞지 않/);
    assert.throws(() => app.ctx.teacherData('teacher-pw-12'), /맞지 않/);
    assert.throws(() => app.ctx.teacherData('teacher-pw-1234'), /맞지 않/);
    assert.equal(app.ctx.teacherLogin('teacher-pw-123').ok, true);
    for (let k = 0; k < 7; k++) assert.throws(() => app.ctx.teacherLogin('x' + k), /맞지 않/);
    assert.throws(() => app.ctx.teacherLogin('teacher-pw-123'), /잠겼/);   // 맞는 암호도 잠긴 동안은 거절
    app.cache.clear();                                                    // 시간이 지나 캐시가 사라지면 다시 됨
    assert.equal(app.ctx.teacherLogin('teacher-pw-123').ok, true);
});

test('교사 자료: 모든 줄을 글자·숫자로 돌려주고(날짜는 ISO 글자) 측정값 JSON 을 풀어 줌', () => {
    const app = loadPlanckApp();
    assert.deepEqual(JSON.parse(JSON.stringify(app.ctx.teacherData('teacher-pw-123'))), { rows: [] });
    app.ctx.submitMeasurement(goodPayload());
    app.ctx.submitMeasurement(goodPayload({ group: '3반 1조', hStudent: null, method: 'glow', leds: [{ name: '노랑', lambda: 590, glow: [2.0] }] }));
    const { rows } = app.ctx.teacherData('teacher-pw-123');
    assert.equal(rows.length, 4);
    assert.match(rows[0].submittedAt, /^\d{4}-\d\d-\d\dT/);
    assert.equal(rows[0].group, '3반 2조'); assert.equal(rows[0].hStudent, 6.6); assert.equal(rows[0].data.iv.length, 4);
    assert.equal(rows[3].v0, null); assert.equal(rows[3].hStudent, null); assert.deepEqual(Array.from(rows[3].data.glow), [2.0]);
    // 선생님 화면과 같은 방법(PlanckMath)으로 다시 계산하면 h 가 나온다
    const items = rows.slice(0, 3).map(r => ({ lambda: r.lambda, v0: P.thresholdByExtrapolation(r.data.iv, r.data.iMin).v0 }));
    const fit = P.planckFit(items);
    assert.ok(Math.abs(fit.errorPct) < 0.5, 'h 오차 ' + fit.errorPct);
});

test('화면: 기본 주소는 학생, ?page=teacher 는 선생님, include 가 풀리고 휴대폰 폭 설정', () => {
    const app = loadPlanckApp();
    const s = renderPage(app, 'student'), t = renderPage(app, 'teacher');
    assert.match(s.out.title, /플랑크/); assert.match(t.out.title, /선생님/);
    assert.equal(s.out.meta.viewport, 'width=device-width, initial-scale=1');
    for (const page of [s.html, t.html]) {
        assert.ok(page.includes('var LabCommon'));
        assert.ok(page.includes('root.PlanckMath = factory()'));
        assert.ok(!/<\?/.test(page));
        // 외부 스크립트는 쓰지 않음 (쓰더라도 jsdelivr 만)
        for (const m of page.matchAll(/<script[^>]+src="([^"]+)"/g)) assert.match(m[1], /^https:\/\/cdn\.jsdelivr\.net\//);
    }
    assert.ok(s.html.includes('submitMeasurement') && !s.html.includes('teacherData'));
    assert.ok(t.html.includes('teacherData'));
});
