const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const N = require('../js/nano-sense.js');
const EnvironmentProtocol = require('../js/environment-protocol.js');
const AccelerometerProtocol = require('../js/accelerometer-protocol.js');

const root = path.join(__dirname, '..');
const sketch = fs.readFileSync(path.join(root, 'firmware', 'nano33-ble-sense-rev2', 'NanoSenseLab', 'NanoSenseLab.ino'), 'utf8');
const pico = fs.readFileSync(path.join(root, 'firmware', 'pico2w-environment', 'main.py'), 'utf8');

test('블루투스 UUID 는 Pico 펌웨어·아두이노 펌웨어·페이지가 모두 같다', () => {
    for (const uuid of [N.SERVICE_UUID, N.TX_UUID, N.CMD_UUID, N.ACCEL_UUID]) {
        assert.ok(sketch.includes(`"${uuid}"`), `스케치에 ${uuid}`);
        assert.ok(pico.includes(`"${uuid}"`), `Pico 에 ${uuid}`);
    }
});

test('펌웨어는 칩 주소로 NanoSense-XXXX 이름을 만들고, 페이지가 고르는 명령을 모두 처리한다', () => {
    assert.match(sketch, /BLE\.address\(\)/);
    assert.match(sketch, /"NanoSense-%s"/);
    assert.equal(N.NAME_PREFIX, 'NanoSense-');
    for (const mode of Object.values(N.MODES)) {
        assert.ok(sketch.includes(`"${mode.start}"`), mode.start);
        assert.ok(sketch.includes(`"${mode.rateCommand}"`), mode.rateCommand);
        for (const rate of mode.rates) assert.match(sketch, new RegExp(`value == ${rate.value}\\b`), `${mode.rateCommand}${rate.value}`);
    }
    for (const command of ['"STOP"', '"GET_BOARD"', '"IDENTIFY"']) assert.ok(sketch.includes(command), command);
});

test('펌웨어는 가속도를 ±16 g 로 바꾸고 확인한 뒤 2048 LSB/g 로 읽는다', () => {
    assert.match(sketch, /BMI270_ACC_RANGE = 0x41/);
    assert.match(sketch, /ACC_RANGE_16G = 0x03/);
    assert.match(sketch, /LSB_PER_G_16G = 2048\.0f/);
    assert.match(sketch, /bool setAccelerometer16g\(\)/);
    assert.ok(!/IMU\.readAcceleration\(/.test(sketch), '라이브러리 readAcceleration 은 ±4 g 기준이라 쓰면 안 됨');
    // 가장 큰 값(-32768/2048 = -16 g)도 기존 가속도 해석기 범위 안
    const view = new DataView(new ArrayBuffer(16));
    view.setUint32(0, 1, true);
    view.setFloat32(4, -32768 / 2048, true);
    view.setFloat32(8, 32767 / 2048, true);
    view.setFloat32(12, 1, true);
    assert.equal(new AccelerometerProtocol.Receiver().read(view)[0].x, -16);
});

test('이름 확인', () => {
    assert.ok(N.isNanoName('NanoSense-A3F1'));
    assert.ok(!N.isNanoName('PicoEnv-07'));
    assert.ok(!N.isNanoName('NanoSense-a3f1'));
});

test('측정 간격 명령: 고를 수 있는 값만', () => {
    assert.deepEqual(N.rateCommands('imu', '50'), ['SET_IMU_RATE:50', 'START:IMU']);
    assert.deepEqual(N.rateCommands('env', 5000), ['SET_SENSOR_RATE:5000', 'START:ENV']);
    assert.throws(() => N.rateCommands('imu', 200), /고를 수 없는/);
    assert.throws(() => N.rateCommands('light', 1000), /알 수 없는/);
});

test('JSON 한 줄 받기: 환경 값과 보드 정보를 같은 번호 순서로 받는다', () => {
    const got = [], errors = [];
    const receiver = new EnvironmentProtocol.Receiver(packet => got.push(packet), error => errors.push(error),
        N.makeValidator(EnvironmentProtocol.validateSample));
    const lines = [
        { type: 'board', ts: 10, seq: 0, data: { name: 'NanoSense-A3F1', board: null, id: 'AA:BB', fw: '2026.11-nano-rev2', saved: false } },
        { type: 'env', ts: 1000, seq: 1, data: { temp: 24.5, humidity: 41.2, pressure: 101.325 } },
        { type: 'env', ts: 2000, seq: 2, data: { temp: 24.6, humidity: 41.0, pressure: 101.320 } }
    ].map(item => JSON.stringify(item) + '\n').join('');
    const bytes = new TextEncoder().encode(lines);
    for (let i = 0; i < bytes.length; i += 20) receiver.push(bytes.slice(i, i + 20));
    assert.deepEqual(errors, []);
    assert.deepEqual(got.map(packet => packet.type), ['board', 'env', 'env']);
    assert.deepEqual(N.environmentSample(got[2], got[1].ts), { time: 1, temp: 24.6, humidity: 41.0, pressure: 101.32 });
});

test('보드 오류 메시지는 한글이 20바이트에서 잘려도 읽고 "보드:" 로 보인다', () => {
    const errors = [];
    const receiver = new EnvironmentProtocol.Receiver(() => {}, error => errors.push(error), N.makeValidator(EnvironmentProtocol.validateSample));
    const bytes = new TextEncoder().encode(JSON.stringify({ type: 'error', message: '이 보드의 가속도는 1초에 100번까지만 측정합니다.' }) + '\n');
    for (let i = 0; i < bytes.length; i += 20) receiver.push(bytes.slice(i, i + 20));
    assert.equal(errors.length, 1);
    assert.equal(N.friendlyError(errors[0]), '보드: 이 보드의 가속도는 1초에 100번까지만 측정합니다.');
});

test('다른 종류 메시지(조도 등)는 알려 준다', () => {
    const errors = [];
    const receiver = new EnvironmentProtocol.Receiver(() => {}, error => errors.push(error), N.makeValidator(EnvironmentProtocol.validateSample));
    receiver.push(new TextEncoder().encode('{"type":"light","ts":1,"seq":1,"data":{"lux":3}}\n'));
    assert.match(errors[0].message, /NanoSenseLab\.ino/);
});

test('가속도 16바이트 (ms, x, y, z) 는 기존 가속도 해석기로 읽힌다', () => {
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);
    [[5000, 0, 0, 1], [5010, 0.5, -0.25, 1]].forEach(([ms, x, y, z], i) => {
        view.setUint32(i * 16, ms, true);
        view.setFloat32(i * 16 + 4, x, true);
        view.setFloat32(i * 16 + 8, y, true);
        view.setFloat32(i * 16 + 12, z, true);
    });
    const samples = new AccelerometerProtocol.Receiver().read(view);
    assert.equal(samples.length, 2);
    assert.equal(samples[1].time, 0.01);
    assert.ok(Math.abs(samples[1].total - Math.hypot(0.5, -0.25, 1)) < 1e-9);
});

test('CSV: 머리줄·단위·BOM', () => {
    const csv = N.toCsv('env', [{ time: 0, temp: 24.123456, humidity: 40, pressure: 101.3251 }]);
    assert.ok(csv.startsWith('﻿시간 (s),온도 (°C),습도 (%),기압 (kPa)\r\n'));
    assert.match(csv, /\r\n0,24\.1235,40,101\.3251\r\n$/);
    const imu = N.toCsv('imu', [{ time: 0.01, x: 0.1, y: -0.2, z: 1, total: 1.0247 }]);
    assert.match(imu, /x \(g\),y \(g\),z \(g\),크기 \|a\| \(g\)/);
});

test('그래프 점 줄이기와 15초 확인', () => {
    const many = Array.from({ length: 10000 }, (_, i) => ({ time: i }));
    const thin = N.thin(many, 100);
    assert.equal(thin.length, 100);
    assert.equal(thin[0].time, 0);
    assert.equal(thin[99].time, 9999);
    assert.equal(N.thin(many.slice(0, 5), 100).length, 5);
    assert.ok(N.isStale(0, 15000));
    assert.ok(!N.isStale(0, 14999));
    assert.ok(!N.isStale(null, 99999));
});

test('페이지가 쓰는 파일이 모두 있고 메인 목록에 링크가 있다', () => {
    const html = fs.readFileSync(path.join(root, 'projects', 'arduino-nano-lab.html'), 'utf8');
    for (const m of html.matchAll(/(?:src|href)="(\.\.\/[^"?#]+)/g)) {
        assert.ok(fs.existsSync(path.resolve(root, 'projects', m[1])), m[1]);
    }
    assert.ok(html.includes('chart.js@4.6.1'));
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(index.includes('href="projects/arduino-nano-lab.html"'));
});

test('회차 요약: 가속도는 평균·최대 |a|, 환경은 평균 온도·습도·기압', () => {
    const imu = [{ time: 0, x: 0, y: 0, z: 1, total: 1 }, { time: 0.5, x: 0, y: 0, z: 3, total: 3 }];
    assert.deepEqual(N.runSummary('imu', imu), { '평균 크기(g)': 2, '최대 크기(g)': 3, '시간(s)': 0.5, '점': 2 });
    const env = [{ time: 0, temp: 24, humidity: 40, pressure: 101 }, { time: 10, temp: 25, humidity: 42, pressure: 101.2 }];
    assert.deepEqual(N.runSummary('env', env), { '온도(C)': 24.5, '습도(퍼센트)': 41, '기압(kPa)': 101.1, '시간(s)': 10 });
    assert.equal(N.runTitle('imu', 3), '가속도 3회');
    // 서버(apps-script/Code.gs cleanSummary)가 받는 이름만 쓴다
    const gs = fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8');
    const rule = new RegExp(gs.match(/if \(!(\/\^\[[^\n]+?\$\/)\.test\(k\)/)[1].slice(1, -1));
    for (const k of [...Object.keys(N.runSummary('imu', imu)), ...Object.keys(N.runSummary('env', env))]) assert.match(k, rule, k);
});

test('회차 보내기 자료: 1500점으로 줄이고 그대로 되돌림, 모양이 틀리면 null', () => {
    const many = Array.from({ length: 6000 }, (_, i) => ({ time: i / 100, x: 0.1, y: -0.2, z: 1, total: Math.hypot(0.1, -0.2, 1) }));
    const data = N.packRun('imu', many);
    assert.equal(data.rows.length, N.SHARE_POINTS);
    assert.equal(data.n, 6000);
    assert.ok(JSON.stringify(data).length < 270000);
    const back = N.unpackRun(JSON.parse(JSON.stringify(data)));
    assert.equal(back.mode, 'imu');
    assert.equal(back.n, 6000);
    assert.equal(back.samples.length, N.SHARE_POINTS);
    assert.ok(Math.abs(back.samples[5].total - many[0].total) < 1e-3);
    assert.equal(N.unpackRun({ v: 1, mode: 'env', keys: ['x'], rows: [] }), null);
    assert.equal(N.unpackRun({ v: 1, mode: 'imu', keys: ['x', 'y', 'z'], rows: [[0, 1, 'a', 2]] }), null);
    assert.equal(N.unpackRun(null), null);
});

test('조 공유: 내 회차 → 보낼 것, 받은 것 합치기·고쳐 쓰기·지운 것 빼기', () => {
    const runs = [
        { id: 'r1', mode: 'imu', no: 1, samples: [{ time: 0, x: 0, y: 0, z: 1, total: 1 }] },
        { id: 'r2', mode: 'env', no: 1, samples: [] }
    ];
    const items = N.shareItems(runs);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, '가속도 1회');
    assert.equal(items[0].n, 1);
    const store = new Map();
    const got = [{ id: 'r1', device: 'nabc123', from: '노트북 C123', title: '가속도 1회', n: 1, summary: items[0].summary, data: items[0].data, sentAt: 't1' }];
    assert.equal(N.mergeIncoming(store, got), true);
    assert.equal(store.size, 1);
    assert.equal(store.get('nabc123-r1').incoming, true);
    assert.equal(N.mergeIncoming(store, got), false, '같은 것 다시 받으면 바뀐 것 없음');
    assert.equal(N.mergeIncoming(store, [{ ...got[0], sentAt: 't2' }]), true, '다시 보냈으면 고쳐 씀');
    assert.equal(N.mergeIncoming(store, [{ ...got[0], data: { v: 9 } }]), true, '못 읽는 자료는 빼고 목록에 없으니 지움');
    assert.equal(store.size, 0);
});
