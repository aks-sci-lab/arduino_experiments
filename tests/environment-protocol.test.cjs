const test = require('node:test');
const assert = require('node:assert/strict');
const { Receiver, validateSample } = require('../js/environment-protocol.js');

const sample = (ts = 1000, seq = 0) => ({
    type: 'env', ts, seq, data: { temp: 25.08, humidity: 45.2, pressure: 100.653 }
});
const encode = packet => new TextEncoder().encode(JSON.stringify(packet) + '\n');

function harness() {
    const samples = [], errors = [];
    const receiver = new Receiver(packet => samples.push(packet), error => errors.push(error.message));
    return { samples, errors, receiver };
}

test('reassembles every possible two-part split and 20-byte BLE chunks', () => {
    const payload = encode(sample());
    for (let split = 1; split < payload.length; split++) {
        const { receiver, samples, errors } = harness();
        receiver.push(new DataView(payload.buffer, 0, split));
        assert.equal(samples.length, 0);
        receiver.push(new DataView(payload.buffer, split));
        assert.deepEqual(samples, [sample()]);
        assert.deepEqual(errors, []);
    }
    const { receiver, samples } = harness();
    for (let offset = 0; offset < payload.length; offset += 20) receiver.push(payload.slice(offset, offset + 20));
    assert.deepEqual(samples, [sample()]);
});

test('waits for newline and accepts multiple frames in one notification', () => {
    const { receiver, samples } = harness();
    const bytes = encode(sample());
    receiver.push(bytes.slice(0, -1));
    assert.equal(samples.length, 0);
    receiver.push(new TextEncoder().encode('\n\n' + JSON.stringify(sample(3000, 1)) + '\n'));
    assert.deepEqual(samples, [sample(), sample(3000, 1)]);
});

test('rejects hPa/Pa, wrong types, NaN, missing fields and invalid timestamps', () => {
    for (const pressure of [1013, 101300, '100.6', null, NaN, 29, 111]) {
        const packet = sample();
        packet.data.pressure = pressure;
        assert.throws(() => validateSample(packet));
    }
    for (const [key, value] of [['temp', -41], ['temp', 86], ['humidity', -1], ['humidity', 101]]) {
        const packet = sample();
        packet.data[key] = value;
        assert.throws(() => validateSample(packet));
    }
    assert.throws(() => validateSample({ type: 'env', data: sample().data }));
    assert.throws(() => validateSample(sample(-1)));
    assert.throws(() => validateSample(sample(1.5)));
    assert.throws(() => validateSample(sample(1000, -1)));
    assert.throws(() => validateSample(null));
});

test('reports Pico errors, invalid JSON, oversized frames and recovers', () => {
    const { receiver, samples, errors } = harness();
    receiver.push(encode({ type: 'error', message: 'BME280 init failed' }));
    receiver.push(new TextEncoder().encode('invalid\n'));
    receiver.push(new TextEncoder().encode('x'.repeat(1025)));
    receiver.push(new TextEncoder().encode('x'.repeat(1025) + '\n'));
    assert.equal(errors.length, 4);
    assert.match(errors[0], /BME280 init failed/);
    receiver.push(encode(sample()));
    assert.deepEqual(samples, [sample()]);
});

test('rejects duplicate/out-of-order frames and resets for reconnect', () => {
    const { receiver, samples, errors } = harness();
    receiver.push(encode(sample(5000, 5)));
    receiver.push(encode(sample(5000, 5)));
    receiver.push(encode(sample(4000, 6)));
    receiver.push(encode(sample(7000, 7)));
    assert.equal(errors.length, 2);
    assert.equal(samples.length, 2);
    receiver.push(encode(sample(8000, 8)).slice(0, 10));
    receiver.reset();
    receiver.push(encode(sample(1000, 0)));
    assert.equal(samples.length, 3);
});

test('decodes a multibyte UTF-8 error fragmented one byte at a time', () => {
    const { receiver, errors } = harness();
    for (const byte of encode({ type: 'error', message: '센서 오류' })) receiver.push(Uint8Array.of(byte));
    assert.deepEqual(errors, ['Pico: 센서 오류']);
});
