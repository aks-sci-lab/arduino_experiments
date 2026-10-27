const test = require('node:test');
const assert = require('node:assert/strict');
const { discover } = require('../js/pico-ble.js');

function device(failures, permanent = false) {
    let attempts = 0;
    const gatt = {
        connected: false,
        async connect() { attempts++; this.connected = true; return this; },
        async getPrimaryService() {
            if (permanent) throw Object.assign(new Error('Missing service'), { name: 'NotFoundError' });
            if (attempts <= failures) {
                this.connected = false;
                throw new Error('GATT Server is disconnected. Cannot retrieve services.');
            }
            return { getCharacteristic: async id => ({ id, attempt: attempts }) };
        },
        disconnect() { this.connected = false; }
    };
    return { gatt, get attempts() { return attempts; } };
}

test('rediscovers fresh characteristics after transient disconnect', async () => {
    const d = device(1);
    const retries = [];
    const result = await discover(d, 'service', ['tx', 'cmd'], attempt => retries.push(attempt));
    assert.deepEqual(retries, [1]);
    assert.deepEqual(result, [{ id: 'tx', attempt: 2 }, { id: 'cmd', attempt: 2 }]);
});

test('stops after three failed connections', async () => {
    const d = device(3);
    await assert.rejects(discover(d, 'service', ['tx'], () => {}), /disconnected/);
    assert.equal(d.attempts, 3);
});

test('does not retry a missing service on a connected device', async () => {
    const d = device(0, true);
    await assert.rejects(discover(d, 'service', ['tx'], () => {}), /Missing service/);
    assert.equal(d.attempts, 1);
});

test('disconnects an existing GATT connection before a new discovery', async () => {
    const d = device(0);
    d.gatt.connected = true;
    let disconnects = 0;
    const disconnect = d.gatt.disconnect.bind(d.gatt);
    d.gatt.disconnect = () => { disconnects++; disconnect(); };
    await discover(d, 'service', ['tx'], () => {});
    assert.equal(disconnects, 1);
    assert.equal(d.attempts, 1);
    assert.equal(d.gatt.connected, true);
});

test('cancels and disconnects when page leaves during async setup', async () => {
    const d = device(0);
    let cancelled = false, cleaned = 0;
    await assert.rejects(discover(d, 'service', ['tx'], () => {}, {
        isCancelled: () => cancelled,
        prepare: async () => { cancelled = true; },
        cleanup: () => { cleaned++; }
    }), /취소/);
    assert.equal(d.attempts, 1);
    assert.equal(d.gatt.connected, false);
    assert.equal(cleaned, 1);
});
