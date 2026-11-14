// 선생님이 만든 실험(custom-lab) 계산·검사 함수 시험
const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/custom-lab-math.js');

test('숫자 읽기: 빈칸·글자는 null, 쉼표 소수점과 유니코드 빼기 허용', () => {
    assert.strictEqual(M.parseNumber('3.5'), 3.5);
    assert.strictEqual(M.parseNumber(' -2 '), -2);
    assert.strictEqual(M.parseNumber('3,14'), 3.14);
    assert.strictEqual(M.parseNumber('−4'), -4);
    assert.strictEqual(M.parseNumber('1e-3'), 0.001);
    assert.strictEqual(M.parseNumber(''), null);
    assert.strictEqual(M.parseNumber('약 3'), null);
    assert.strictEqual(M.parseNumber('1,234'), 1.234);   // 쉼표 하나는 소수점으로 본다
    assert.strictEqual(M.parseNumber(null), null);
});

test('붙여넣기: 탭·줄바꿈으로 나누고 끝의 빈 줄은 버림', () => {
    assert.deepStrictEqual(M.parsePaste('1\t2\r\n3\t4\r\n\r\n'), [['1', '2'], ['3', '4']]);
    assert.deepStrictEqual(M.parsePaste('5'), [['5']]);
    assert.deepStrictEqual(M.parsePaste(''), []);
});

test('실험 설정 다듬기: 한도 적용, 잘못된 축 번호는 기본값', () => {
    const d = M.normalizeDefinition({
        title: '  옴의 법칙  ', description: '설명',
        columns: [{ name: ' 전류 ', unit: 'A' }, { name: '전압', unit: 'V' }],
        xCol: 7, yCol: 'x', fit: '이상한값', questions: ['  ', '왜 직선인가?'], published: 'yes', extra: 1
    });
    assert.strictEqual(d.title, '옴의 법칙');
    assert.deepStrictEqual(d.columns, [{ name: '전류', unit: 'A' }, { name: '전압', unit: 'V' }]);
    assert.strictEqual(d.xCol, 0);
    assert.strictEqual(d.yCol, 1);
    assert.strictEqual(d.fit, 'none');
    assert.deepStrictEqual(d.questions, ['왜 직선인가?']);
    assert.strictEqual(d.published, false);
    assert.strictEqual(d.extra, undefined);

    const many = M.normalizeDefinition({ title: 'a'.repeat(200), columns: Array.from({ length: 20 }, (_, i) => ({ name: 'c' + i })) });
    assert.strictEqual(many.title.length, M.MAX_TITLE);
    assert.strictEqual(many.columns.length, M.MAX_COLS);
});

test('실험 설정 검사: 제목·열 이름·축 선택', () => {
    assert.strictEqual(M.validateDefinition({ title: '실험', columns: [{ name: 'x' }, { name: 'y' }] }).ok, true);
    assert.match(M.validateDefinition({ columns: [{ name: 'x' }] }).errors.join(' '), /제목/);
    assert.match(M.validateDefinition({ title: 't', columns: [] }).errors.join(' '), /열을 하나 이상/);
    assert.match(M.validateDefinition({ title: 't', columns: [{ name: 'x' }, { name: '' }] }).errors.join(' '), /2번째 열/);
    assert.match(M.validateDefinition({ title: 't', columns: [{ name: 'x' }, { name: 'x' }] }).errors.join(' '), /같은 열/);
    assert.match(M.validateDefinition({ title: 't', columns: [{ name: 'x' }, { name: 'y' }], xCol: 1, yCol: 1 }).errors.join(' '), /서로 다른 열/);
    // 열이 하나뿐이면 그래프 없이 표만 쓰는 실험으로 허용
    assert.strictEqual(M.validateDefinition({ title: 't', columns: [{ name: 'x' }] }).ok, true);
});

test('점 고르기: 두 축이 모두 숫자인 행만', () => {
    const rows = [['1', '2', 'a'], ['', '3', ''], ['2', '글자', ''], ['3', '6', ''], null];
    assert.deepStrictEqual(M.pointsFromRows(rows, 0, 1), [{ x: 1, y: 2 }, { x: 3, y: 6 }]);
    assert.strictEqual(M.filledRowCount(rows), 4);
});

test('비례 맞춤 y = a·x', () => {
    const r = M.fit([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }], 'proportional');
    assert.ok(Math.abs(r.slope - 2) < 1e-12);
    assert.strictEqual(r.intercept, 0);
    assert.ok(Math.abs(r.r2 - 1) < 1e-12);
});

test('일차 맞춤 y = a·x + b', () => {
    const r = M.fit([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }], 'linear');
    assert.ok(Math.abs(r.slope - 2) < 1e-12);
    assert.ok(Math.abs(r.intercept - 1) < 1e-12);
    assert.strictEqual(r.n, 4);
    // 흩어진 자료: 손으로 계산한 값과 비교 (기울기 1.72, 절편 0.05)
    const s = M.fit([{ x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 5.5 }, { x: 4, y: 6.9 }], 'linear');
    assert.ok(Math.abs(s.slope - 1.72) < 1e-9);
    assert.ok(Math.abs(s.intercept - 0.05) < 1e-9);
    assert.ok(s.r2 > 0.97 && s.r2 < 1);
});

test('맞춤을 할 수 없는 경우는 null', () => {
    assert.strictEqual(M.fit([{ x: 1, y: 2 }], 'linear'), null);
    assert.strictEqual(M.fit([{ x: 1, y: 2 }, { x: 1, y: 3 }], 'linear'), null);       // x 가 모두 같음
    assert.strictEqual(M.fit([{ x: 0, y: 2 }, { x: 0, y: 3 }], 'proportional'), null);
    assert.strictEqual(M.fit([{ x: 1, y: 2 }, { x: 2, y: 3 }], 'none'), null);
});

test('숫자·맞춤 결과 문장', () => {
    assert.strictEqual(M.formatNumber(2.00001), '2');
    assert.strictEqual(M.formatNumber(0.000123456), '1.235e-4');
    assert.strictEqual(M.formatNumber(1234567), '1.235e6');
    assert.strictEqual(M.formatNumber(NaN), '—');
    const t = M.fitText({ kind: 'linear', n: 4, slope: 2, intercept: -1, r2: 0.99 }, '전류', '전압');
    assert.strictEqual(t, '전압 = 2 × 전류 − 1 (R² = 0.9900, 점 4개)');
    assert.strictEqual(M.fitText({ kind: 'proportional', n: 3, slope: 2, intercept: 0, r2: 1 }, 'x', 'y'), 'y = 2 × x (R² = 1.0000, 점 3개)');
});

test('CSV: BOM, 단위 붙은 머리글, 빈 행 제외, 따옴표 처리', () => {
    const csv = M.toCsv([{ name: '전류', unit: 'A' }, { name: '메모', unit: '' }], [['1', '좋음, "최고"'], ['', ''], ['2', '']]);
    assert.strictEqual(csv, '﻿전류 (A),메모\r\n1,"좋음, ""최고"""\r\n2,\r\n');
});

test('센서 기능 목록: 다섯 기능, 값 이름이 겹치지 않음', () => {
    assert.deepStrictEqual(Object.keys(M.SENSORS), ['env', 'light', 'uv', 'voc', 'imu', 'iv']);
    Object.values(M.SENSORS).forEach(s => {
        const keys = s.fields.map(f => f[0]);
        assert.strictEqual(new Set(keys).size, keys.length);
        assert.ok(s.rates.length >= 1 && s.command);
    });
});

test('센서 설정 다듬기', () => {
    assert.deepStrictEqual(M.normalizeSensor(undefined), { mode: 'none', fields: [] });
    assert.deepStrictEqual(M.normalizeSensor({ mode: '없는기능', fields: ['lux'] }), { mode: 'none', fields: [] });
    assert.deepStrictEqual(M.normalizeSensor({ mode: 'toString' }), { mode: 'none', fields: [] });
    // 모르는 값 이름은 버리고 목록 순서를 따른다. 하나도 없으면 첫 번째 값
    assert.deepStrictEqual(M.normalizeSensor({ mode: 'env', fields: ['pressure', '가짜', 'temp'] }), { mode: 'env', fields: ['temp', 'pressure'] });
    assert.deepStrictEqual(M.normalizeSensor({ mode: 'light', fields: [] }), { mode: 'light', fields: ['lux'] });
    assert.deepStrictEqual(M.sensorFields({ mode: 'imu', fields: ['z', 'total'] }), [
        { key: 'total', name: '가속도 크기', unit: 'g', digits: 3 }, { key: 'z', name: 'z축 가속도', unit: 'g', digits: 3 }
    ]);
    assert.deepStrictEqual(M.sensorFields({ mode: 'none' }), []);
    // 실험 설정에 포함되고, 예전(센서 칸이 없는) 설정은 '사용 안 함'
    assert.deepStrictEqual(M.normalizeDefinition({ title: 't', columns: [{ name: 'x' }] }).sensor, { mode: 'none', fields: [] });
    assert.deepStrictEqual(M.normalizeDefinition({ title: 't', columns: [{ name: 'x' }], sensor: { mode: 'uv' } }).sensor, { mode: 'uv', fields: ['uvRaw'] });
});

test('센서 기록 다듬기·솎아 내기·CSV·요약', () => {
    const fields = M.sensorFields({ mode: 'env', fields: ['temp', 'humidity'] });
    const good = { t: [0, 1, 2], v: { temp: [20, 20.5, null], humidity: [40, 41, 42], extra: [1, 2, 3] } };
    assert.deepStrictEqual(M.normalizeSeries(good, fields), { t: [0, 1, 2], v: { temp: [20, 20.5, null], humidity: [40, 41, 42] } });
    assert.deepStrictEqual(M.normalizeSeries({ t: [0, 1], v: { temp: [1] } }, fields), M.emptySeries(fields));   // 길이가 모자람
    assert.deepStrictEqual(M.normalizeSeries({ t: ['a'], v: { temp: [1], humidity: [1] } }, fields), M.emptySeries(fields));
    assert.deepStrictEqual(M.normalizeSeries(null, fields), { t: [], v: { temp: [], humidity: [] } });

    const long = { t: Array.from({ length: 101 }, (_, i) => i), v: { temp: Array.from({ length: 101 }, (_, i) => i * 2) } };
    const thin = M.thinSeries(long, 11);
    assert.strictEqual(thin.thinned, true);
    assert.deepStrictEqual(thin.series.t, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    assert.deepStrictEqual(thin.series.v.temp[10], 200);
    assert.strictEqual(M.thinSeries(long, 200).thinned, false);

    assert.strictEqual(M.seriesToCsv(good, fields), '\uFEFF시간 (s),온도 (°C),습도 (%RH)\r\n0.000,20.00,40.0\r\n1.000,20.50,41.0\r\n2.000,,42.0\r\n');
    assert.strictEqual(M.seriesSummary(good, fields), '센서 3점 (2.0초): 온도 20.00~20.50 °C, 습도 40.0~42.0 %RH');
    assert.strictEqual(M.seriesSummary(M.emptySeries(fields), fields), '');
});

test('학생 화면 방식: 한 화면 기본, 7단계와 단계 글 다듬기', () => {
    const d = M.normalizeDefinition({ title: 't', columns: [{ name: 'x' }] });
    assert.strictEqual(d.layout, 'single');
    assert.deepStrictEqual(d.stepTexts, { theory: '', materials: '', procedure: '' });
    const s = M.normalizeDefinition({
        title: 't', columns: [{ name: 'x' }], layout: 'steps',
        stepTexts: { theory: '옴의 법칙', materials: 7, procedure: 'p'.repeat(5000), extra: 'x' }
    });
    assert.strictEqual(s.layout, 'steps');
    assert.strictEqual(s.stepTexts.theory, '옴의 법칙');
    assert.strictEqual(s.stepTexts.materials, '');
    assert.strictEqual(s.stepTexts.procedure.length, M.MAX_STEP_TEXT);
    assert.strictEqual(s.stepTexts.extra, undefined);
    assert.strictEqual(M.normalizeDefinition({ title: 't', columns: [{ name: 'x' }], layout: '이상' }).layout, 'single');
    assert.strictEqual(M.validateDefinition({ title: 't', columns: [{ name: 'x' }], layout: 'steps' }).ok, true);
});
