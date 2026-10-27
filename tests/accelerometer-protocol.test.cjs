const test = require('node:test');
const assert = require('node:assert/strict');
const { Receiver } = require('../js/accelerometer-protocol.js');

function packet(...samples) {
    const view = new DataView(new ArrayBuffer(samples.length * 16));
    samples.forEach(([ts, x, y, z], index) => {
        view.setUint32(index * 16, ts, true);
        [x, y, z].forEach((value, axis) => view.setFloat32(index * 16 + 4 + axis * 4, value, true));
    });
    return view;
}

test('zero timestamp, signed g values, batched frames and actual time gaps', () => {
    const receiver = new Receiver();
    const first = receiver.read(packet([0, 1, -0.5, 0]));
    assert.equal(first[0].time, 0);
    assert.equal(first[0].total, Math.hypot(1, -0.5, 0));
    const next = receiver.read(packet([10, 0, 0, 1], [50, 0, 0, 1]));
    assert.deepEqual(next.map(item => item.time), [0.01, 0.05]);
    receiver.reset();
    assert.equal(receiver.read(packet([500, 0, 0, 1]))[0].time, 0);
});

test('uint32 timestamp wrap is accumulated', () => {
    const receiver = new Receiver();
    receiver.read(packet([0xFFFFFFFA, 0, 0, 1]));
    assert.equal(receiver.read(packet([4, 0, 0, 1]))[0].time, 0.01);
});

test('rejects partial frames, invalid g, duplicate and backwards timestamps atomically', () => {
    const receiver = new Receiver();
    for (const length of [0, 1, 15, 17, 31]) assert.throws(() => receiver.read(new DataView(new ArrayBuffer(length))));
    for (const x of [NaN, Infinity, -Infinity, 16.1, -16.1]) {
        assert.throws(() => receiver.read(packet([100, x, 0, 1])));
    }
    receiver.read(packet([100, 0, 0, 1]));
    assert.throws(() => receiver.read(packet([100, 0, 0, 1])));
    assert.throws(() => receiver.read(packet([90, 0, 0, 1])));
    assert.throws(() => receiver.read(packet([110, 0, 0, 1], [120, NaN, 0, 1])));
    assert.equal(receiver.read(packet([110, 0, 0, 1]))[0].time, 0.01);
});

test('accepts full +/-16g axes and a resultant greater than 16g', () => {
    const receiver = new Receiver();
    const [sample] = receiver.read(packet([0, -16, 32767 / 2048, 16]));
    assert.equal(sample.x, -16);
    assert.equal(sample.y, 32767 / 2048);
    assert.equal(sample.z, 16);
    assert.ok(sample.total > 16);
});
