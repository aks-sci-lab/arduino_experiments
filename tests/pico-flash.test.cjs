// USB 로 펌웨어 올리기(js/pico-flash.js) — 가짜 Pico 보드(tests/fake-pico-serial.cjs)로 시험.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PicoFlash = require('../js/pico-flash.js');
const PicoFirmware = require('../js/pico-firmware.js');
const { FakePicoBoard } = require('./fake-pico-serial.cjs');

const DIR = path.join(__dirname, '..', 'firmware', 'pico2w-environment');
const siteFiles = () => PicoFlash.FILES.map(name => ({ name, bytes: new Uint8Array(fs.readFileSync(path.join(DIR, name))) }));
const OLD = { 'main.py': 'FIRMWARE_VERSION = "2026.11-iv"\nprint("old")\n', 'bme280.py': 'old', 'imu.py': 'old', 'extra_sensors.py': 'old',
    'board.json': '{"board": 7}' };
const fast = { rawTimeout: 300, bootTimeout: 500 };

test('사이트 펌웨어 파일 네 개가 있고, 판 이름이 웹의 최신 판과 같다', () => {
    assert.deepEqual(PicoFlash.FILES, ['bme280.py', 'imu.py', 'extra_sensors.py', 'main.py']);
    assert.equal(PicoFlash.FILES[PicoFlash.FILES.length - 1], 'main.py', 'main.py 는 맨 끝에 바꾼다');
    const main = fs.readFileSync(path.join(DIR, 'main.py'), 'utf8');
    assert.equal(PicoFlash.versionOf(main), PicoFirmware.LATEST);
    assert.match(main, /print\("\[BOOT\] Firmware:", FIRMWARE_VERSION\)/);
    assert.ok(!PicoFirmware.HISTORY.includes(PicoFirmware.LATEST));
});

test('네 파일을 쓰고 크기·해시를 확인한 뒤 다시 켜서 판을 확인한다 — board.json 은 그대로', async () => {
    const board = new FakePicoBoard({ files: OLD });
    const steps = [];
    const outcome = await PicoFlash.flash(board, siteFiles(), { ...fast, onProgress: info => steps.push(info.stage) });
    assert.equal(outcome.expected, PicoFirmware.LATEST);
    assert.equal(outcome.running, PicoFirmware.LATEST);
    assert.equal(outcome.matches, true);
    assert.equal(outcome.hadBoard, true);
    assert.equal(outcome.boardKept, true);
    assert.deepEqual(outcome.checked, ['sha256', 'sha256', 'sha256', 'sha256']);
    for (const file of siteFiles()) assert.deepEqual(board.fs.get(file.name), file.bytes, file.name);
    assert.equal(board.text('board.json'), '{"board": 7}');
    assert.ok(!board.log.some(line => line.includes('board.json')), 'board.json 을 건드리는 명령이 없다');
    assert.ok(![...board.fs.keys()].some(name => name.endsWith('.new')), '임시 파일이 남지 않는다');
    assert.equal(board.boots, 1);
    assert.deepEqual([...new Set(steps)], ['connect', 'check', 'write', 'install', 'reboot']);
    // 1 KB 보다 큰 파일은 나눠 쓴다
    assert.ok(board.log.filter(line => line.startsWith('_w(')).length > 20);
});

test('보드 번호 파일이 없던 보드에도 만들지 않는다, 해시가 없는 MicroPython 은 크기로 확인', async () => {
    const files = { ...OLD }; delete files['board.json'];
    const board = new FakePicoBoard({ files, noHash: true });
    const outcome = await PicoFlash.flash(board, siteFiles(), fast);
    assert.equal(outcome.hadBoard, false);
    assert.equal(board.fs.has('board.json'), false);
    assert.deepEqual(outcome.checked, ['size', 'size', 'size', 'size']);
});

test('쓰다가 USB 가 끊기면 예전 펌웨어가 그대로이고, 다시 하면 된다', async () => {
    const board = new FakePicoBoard({ files: OLD, unplugAfterWrites: 5 });
    await assert.rejects(PicoFlash.flash(board, siteFiles(), fast), error => {
        assert.equal(error.stage, 'write');
        assert.equal(error.detail, 'closed');
        assert.match(PicoFlash.friendly(error), /파일 네 개 쓰고 확인.*USB 연결이 끊겼어요.*그대로/);
        return true;
    });
    for (const name of ['main.py', 'bme280.py', 'imu.py', 'extra_sensors.py']) assert.equal(board.text(name), OLD[name], name);
    // 케이블을 다시 꽂음 = 같은 파일 시스템의 새 연결 (돌던 예전 main.py)
    const again = new FakePicoBoard({ files: Object.fromEntries(board.fs) });
    const outcome = await PicoFlash.flash(again, siteFiles(), fast);
    assert.equal(outcome.matches, true);
    assert.equal(again.text('board.json'), '{"board": 7}');
});

test('확인이 맞지 않으면 바꾸지 않고 멈춘다', async () => {
    const board = new FakePicoBoard({ files: OLD, corrupt: 'imu.py' });
    await assert.rejects(PicoFlash.flash(board, siteFiles(), fast), error => {
        assert.equal(error.stage, 'write');
        assert.match(error.message, /imu\.py.*확인이 맞지 않아요/);
        return true;
    });
    assert.equal(board.text('main.py'), OLD['main.py']);
    assert.equal(board.text('imu.py'), 'old');
});

test('블루투스 없는 MicroPython·대답 없는 보드·다시 켤 때 판을 못 읽음', async () => {
    await assert.rejects(PicoFlash.flash(new FakePicoBoard({ files: OLD, bluetooth: false }), siteFiles(), fast),
        error => error.stage === 'check' && /RPI_PICO2_W/.test(error.message));
    await assert.rejects(PicoFlash.flash(new FakePicoBoard({ files: OLD, silent: true }), siteFiles(), fast),
        error => error.stage === 'connect' && /Thonny/.test(PicoFlash.friendly(error)));
    await assert.rejects(PicoFlash.flash(new FakePicoBoard({ files: OLD, free: 10000 }), siteFiles(), fast),
        error => error.stage === 'check' && /저장 공간/.test(error.message));
    const outcome = await PicoFlash.flash(new FakePicoBoard({ files: OLD, noBoot: true }), siteFiles(), fast);
    assert.equal(outcome.rebooted, false);
    assert.equal(outcome.matches, false);
});
