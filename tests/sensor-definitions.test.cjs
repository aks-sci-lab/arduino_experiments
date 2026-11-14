const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../js/sensor-definitions.js');
const { Receiver } = require('../js/environment-protocol.js');

const values = {
    light: { lux: 136.435, full: 1000, infrared: 100, gain: 25 },
    uv: { uvRaw: 1048574 },
    voc: { sraw: 25000, warmup: 60, temp: 25, humidity: 50 }
};
for (const mode of Object.keys(values)) {
    test(`${mode}: validates units and reassembles 20-byte notifications`, () => {
        const packet = { type: mode, ts: 1000, seq: 0, data: values[mode] };
        let received, error;
        const receiver = new Receiver(p => { received = p; }, e => { error = e; }, p => validate(mode, p));
        const payload = new TextEncoder().encode(JSON.stringify(packet) + '\n');
        for (let i = 0; i < payload.length; i += 20) receiver.push(payload.slice(i, i + 20));
        assert.deepEqual(received, packet);
        assert.equal(error, undefined);
        assert.throws(() => validate(mode, { ...packet, type: 'env' }));
        assert.throws(() => validate(mode, { ...packet, data: {} }));
        assert.throws(() => validate(mode, { ...packet, ts: -1 }));
        const bad = { ...packet, data: { ...packet.data } };
        bad.data[Object.keys(values[mode])[0]] = NaN;
        assert.throws(() => validate(mode, bad));
    });
}

test('rejects saturated optical and misleading VOC data', () => {
    for (const [mode, data] of [
        ['light', { ...values.light, full: 36863 }],
        ['light', { ...values.light, gain: 428 }],
        ['uv', { uvRaw: 1048575 }],
        ['uv', { uvRaw: 1.5 }],
        ['voc', { ...values.voc, sraw: 65536 }],
        ['voc', { ...values.voc, warmup: 61 }],
        ['voc', { ...values.voc, humidity: 101 }],
        ['voc', { ...values.voc, vocIndex: 0 }],
        ['voc', { ...values.voc, vocIndex: 501 }],
        ['voc', { ...values.voc, vocIndex: 1.5 }],
        ['voc', { ppm: 100 }]
    ]) assert.throws(() => validate(mode, { type: mode, ts: 0, seq: 0, data }));
});

test('iv packets accept INA219/INA226 values and reject bad ones', () => {
    const packet = data => ({ type: 'iv', ts: 200, seq: 1, data });
    const ok = { voltage: 2.012, current: 5.25, shunt: 0.525, chip: 'INA219' };
    assert.equal(validate('iv', packet(ok)).data.voltage, 2.012);
    assert.ok(validate('iv', packet({ ...ok, current: -0.1, chip: 'INA226' })));
    assert.throws(() => validate('iv', packet({ ...ok, chip: 'X' })));
    assert.throws(() => validate('iv', packet({ ...ok, voltage: -1 })));
    assert.throws(() => validate('iv', packet({ ...ok, current: NaN })));
});
