// 버니어 공개 도구(vendor/godirect) + 가짜 Go Direct 센서 시험, 사이트에 둔 파일의 지문값 확인
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fakeGoDirect } = require('./fake-godirect.cjs');
const V = require('../js/vernier-godirect.js');

const LIB = path.join(__dirname, '..', 'vendor', 'godirect', 'godirect.min.umd.js');

test('사이트에 둔 버니어 도구가 README 의 SHA-256·라이선스와 같다', () => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(LIB)).digest('hex');
    const readme = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'godirect', 'README.md'), 'utf8');
    assert.ok(readme.includes(hash), 'README 의 SHA-256 이 파일과 다름: ' + hash);
    const license = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'godirect', 'LICENSE'), 'utf8');
    assert.match(license, /BSD 3-Clause License/);
    assert.match(license, /Vernier Software & Technology/);
});

test('버니어 도구가 가짜 센서에서 채널 이름·단위·값을 읽는다', { timeout: 20000 }, async () => {
    const godirect = require(LIB);
    const native = fakeGoDirect({});
    const device = await godirect.createDevice(native, { open: true, startMeasurements: false });
    try {
        assert.equal(device.name, 'GDX-FOR 0F1000123');
        assert.equal(device.orderCode, 'GDX-FOR');
        assert.deepEqual(device.sensors.map(s => [s.number, s.name, s.unit]),
            [[1, 'Force', 'N'], [2, 'X-axis acceleration', 'm/s²'], [3, 'Y-axis acceleration', 'm/s²']]);
        device.sensors.forEach(s => s.setEnabled(s.number === 1 || s.number === 3));
        const got = [];
        device.sensors[2].on('value-changed', s => got.push([device.sensors[0].value, s.value]));
        device.start(50);
        await new Promise(r => setTimeout(r, 400));
        assert.ok(got.length >= 3, '값 개수 ' + got.length);
        assert.ok(Math.abs(got[0][0] - 1.25) < 1e-6);
        assert.ok(Math.abs(got[0][1] + 9.8) < 1e-5);
        assert.equal(native.state.period, 50000, '간격을 µs 로 보냄');
        assert.equal(native.state.mask, (1 << 1) | (1 << 3));
    } finally {
        await device.close().catch(() => {});
    }
});

test('칸마다 채널 정하기: 이미 고른 것 → 센서 기본 → 남은 것', () => {
    const chs = [{ number: 1 }, { number: 2 }, { number: 3 }];
    assert.deepEqual(V.defaultMapping(chs, [1], ['ch1', 'ch2']), { ch1: 1, ch2: 2 });
    assert.deepEqual(V.defaultMapping(chs, [2], ['ch1', 'ch2']), { ch1: 2, ch2: 1 });
    assert.deepEqual(V.defaultMapping(chs, [1], ['ch1', 'ch2'], { ch2: 3 }), { ch1: 1, ch2: 3 });
    assert.deepEqual(V.defaultMapping(chs, [1], ['ch1'], { ch1: 9 }), { ch1: 1 }, '없는 채널은 버림');
    assert.deepEqual(V.defaultMapping([{ number: 1 }], [1], ['ch1', 'ch2']), { ch1: 1 }, '채널이 모자라면 빈 칸');
});
