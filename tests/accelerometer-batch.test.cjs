const test = require('node:test');
const assert = require('node:assert/strict');
const { Receiver } = require('../js/accelerometer-protocol.js');

function fragment(sequence, offset, count, length = 1) {
    const view = new DataView(new ArrayBuffer(4 + length * 16));
    view.setUint16(0, sequence, true);
    view.setUint8(2, offset);
    view.setUint8(3, count);
    for (let i = 0; i < length; i++) {
        view.setUint32(4 + i * 16, (sequence * 10 + offset + i) * 5, true);
        view.setFloat32(8 + i * 16, offset + i, true);
        view.setFloat32(16 + i * 16, 1, true);
    }
    return view;
}

test('default MTU fragments yield an atomic ten-sample batch at original 5ms timestamps', () => {
    const receiver = new Receiver();
    for (let offset = 0; offset < 9; offset++) assert.deepEqual(receiver.readBatch(fragment(0, offset, 10)), []);
    const samples = receiver.readBatch(fragment(0, 9, 10));
    assert.equal(samples.length, 10);
    assert.deepEqual(samples.map(p => p.timestamp), Array.from({ length: 10 }, (_, i) => i * 5));
    assert.equal(samples[9].x, 9);
    assert.equal(samples[9].time, 0.045);
});

test('large MTU whole batches and partial stop batches preserve values and count missing batches', () => {
    const receiver = new Receiver();
    assert.equal(receiver.readBatch(fragment(0, 0, 10, 10)).length, 10);
    const tail = receiver.readBatch(fragment(2, 0, 3, 3));
    assert.equal(tail.length, 3);
    assert.equal(receiver.droppedBatches, 1);
    assert.equal(tail[0].timestamp, 100);
    receiver.reset();
    assert.equal(receiver.droppedBatches, 0);
});

test('rejects missing or duplicate fragments and corrupt headers without inventing samples', () => {
    const receiver = new Receiver();
    receiver.readBatch(fragment(0, 0, 10));
    assert.throws(() => receiver.readBatch(fragment(0, 2, 10)), /누락/);
    receiver.reset();
    receiver.readBatch(fragment(0, 0, 10));
    assert.throws(() => receiver.readBatch(fragment(1, 0, 10)), /누락/);
    receiver.reset();
    assert.throws(() => receiver.readBatch(new DataView(new ArrayBuffer(16))), /형식/);
    assert.throws(() => receiver.readBatch(fragment(0, 0, 11)), /크기/);
    const corrupt = fragment(0, 0, 1);
    corrupt.setFloat32(8, NaN, true);
    assert.throws(() => receiver.readBatch(corrupt), /유효/);
    assert.equal(receiver.previous, null);
});
