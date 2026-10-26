const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const EnvironmentProtocol = require('../js/environment-protocol.js');
const AccelerometerProtocol = require('../js/accelerometer-protocol.js');
const PicoBLE = require('../js/pico-ble.js');

function page({ failCommand, bluetooth = true, stopTail = [] } = {}) {
    const elements = new Map(), commands = [], errors = [], submitted = [];
    let chart, watchdog, clock = 0, batchSequence = 0;
    class Element {
        constructor() {
            this.listeners = {}; this.style = {}; this.rows = []; this.children = [];
            this.checked = true; this.disabled = false; this.value = '';
            this.selectedOptions = [{ text: '100 Hz' }];
        }
        set innerHTML(value) { this.html = value; if (!value) this.rows = []; }
        get innerHTML() { return this.html || ''; }
        addEventListener(event, fn) { this.listeners[event] = fn; }
        removeEventListener(event) { delete this.listeners[event]; }
        appendChild(child) { this.children.push(child); }
        removeChild() {}
        querySelector() { return element('currentTrialCheckbox'); }
        querySelectorAll() { return []; }
        insertAdjacentHTML(_, html) { this.rows.push(...html.matchAll(/<tr>/g)); }
        deleteRow(index) { this.rows.splice(index, 1); }
        click() {}
    }
    function element(id) {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
    }
    element('samplingRateSelect').value = '100';
    element('recordButton').disabled = true;
    const data = new Element(), status = new Element(), device = new Element();
    data.startNotifications = status.startNotifications = async () => {};
    const command = {
        async writeValueWithResponse(value) {
            const text = new TextDecoder().decode(value);
            commands.push(text);
            if (text === failCommand) throw new Error('write failure');
            if (text === 'STOP:IMU_BATCH') {
                for (let offset = 0; offset < stopTail.length; offset++) {
                    const view = new DataView(new ArrayBuffer(20));
                    view.setUint16(0, batchSequence, true);
                    view.setUint8(2, offset);
                    view.setUint8(3, stopTail.length);
                    view.setUint32(4, stopTail[offset], true);
                    view.setFloat32(16, 1, true);
                    data.listeners.characteristicvaluechanged({ target: { value: view } });
                }
                if (stopTail.length) batchSequence++;
                status.listeners.characteristicvaluechanged({
                    target: { value: new TextEncoder().encode('{"type":"imu_stopped","ts":0,"seq":0}\n') }
                });
            }
        }
    };
    device.name = 'PicoEnv-0102';
    device.gatt = {
        connected: false,
        async connect() { this.connected = true; return this; },
        async getPrimaryService() {
            return {
                getCharacteristic: async uuid => uuid.startsWith('19b10004') ? data
                    : uuid.startsWith('19b10001') ? status : command
            };
        },
        disconnect() { this.connected = false; device.listeners.gattserverdisconnected?.(); }
    };
    const storage = new Map();
    const context = vm.createContext({
        TextEncoder, TextDecoder, DataView, EnvironmentProtocol, AccelerometerProtocol, PicoBLE,
        performance: { now: () => clock },
        console: { error: (...args) => errors.push(args), warn() {} },
        setTimeout: (fn, ms) => ms >= 5000 ? setTimeout(fn, ms) : fn(),
        clearTimeout,
        setInterval: fn => { watchdog = fn; },
        alert: message => errors.push(message), prompt: () => 'IMU trial', confirm: () => true,
        localStorage: {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key)
        },
        window: { isSecureContext: true, addEventListener() {} },
        navigator: bluetooth ? { bluetooth: { requestDevice: async () => device } } : {},
        firebase: {
            initializeApp() {},
            auth: () => ({ onAuthStateChanged: fn => fn({ uid: 'student', email: 'student@example.com' }) }),
            firestore: Object.assign(() => ({ collection: () => ({ add: async doc => submitted.push(doc) }) }), {
                FieldValue: { serverTimestamp: () => 'server timestamp' }
            })
        },
        Chart: class {
            constructor(_, config) {
                Object.assign(this, config);
                this.scales = { x: { min: 0, max: 0.025 } };
                chart = this;
            }
            update() {}
            resetZoom() {}
        },
        document: {
            body: new Element(),
            addEventListener: (_, fn) => fn(),
            getElementById: element,
            createElement: () => new Element(),
            querySelector: selector => element(selector)
        }
    });
    const html = fs.readFileSync(path.join(__dirname, '..', 'projects', 'accelerometer-lab.html'), 'utf8');
    vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1], context);
    return {
        element, commands, storage, errors, submitted, device,
        get chart() { return chart; },
        click: id => element(id).listeners.click(),
        tick: ms => { clock += ms; watchdog(); },
        emit(ts, x = 0, y = 0, z = 1) {
            const buffered = element('samplingRateSelect').value === '200';
            const offset = buffered ? 4 : 0;
            const view = new DataView(new ArrayBuffer(16 + offset));
            if (buffered) {
                view.setUint16(0, batchSequence++, true);
                view.setUint8(2, 0);
                view.setUint8(3, 1);
            }
            view.setUint32(offset, ts, true);
            [x, y, z].forEach((value, axis) => view.setFloat32(offset + 4 + axis * 4, value, true));
            data.listeners.characteristicvaluechanged({ target: { value: view } });
        },
        sensorError() {
            status.listeners.characteristicvaluechanged({
                target: { value: new TextEncoder().encode('{"type":"error","message":"IMU read failed"}\n') }
            });
        }
    };
}

test('Pico connect/start/binary samples/stop, local saving and cloud summary', async () => {
    const app = page();
    await app.click('connectBleButton');
    assert.deepEqual(app.commands, ['STOP', 'SET_IMU_RATE:100']);
    await app.click('recordButton');
    app.emit(0, 8, -4, 0);
    app.emit(10);
    app.emit(40);
    assert.deepEqual(Array.from(app.chart.data.datasets[0].data, p => p.x), [0, 0.01, 0.04]);
    assert.equal(app.chart.data.datasets[0].data[0].y, 8);
    await app.click('recordButton');
    assert.deepEqual(app.commands.slice(-2), ['START:IMU', 'STOP']);
    assert.equal(app.element('saveTrialButton').disabled, false);
    app.click('saveTrialButton');
    assert.equal(Object.values(JSON.parse(app.storage.get('accelerometer_trials')))[0].data.length, 3);
    assert.equal(Object.values(JSON.parse(app.storage.get('accelerometer_trials')))[0].data[0][1], 8);
    await app.click('saveCloudButton');
    assert.equal(app.submitted.length, 1);
    assert.equal(app.submitted[0].trialsCount, 1);
    assert.match(app.submitted[0].dataSummary, /3/);
    app.click('cropButton');
    assert.deepEqual(Array.from(app.chart.data.datasets[0].data, p => p.x), [0, 0.01]);
    app.device.gatt.disconnect();
    assert.equal(app.element('recordButton').disabled, true);
    assert.equal(app.element('downloadButton').disabled, false);
});

test('200Hz commands, sample cadence diagnostics and clipping warning retain raw samples', async () => {
    const app = page();
    app.element('samplingRateSelect').value = '200';
    await app.click('connectBleButton');
    assert.deepEqual(app.commands, ['STOP', 'SET_IMU_RATE:200']);
    await app.click('recordButton');
    assert.equal(app.commands.at(-1), 'START:IMU_BATCH');
    app.emit(100, 0, 0, 1);
    app.emit(105, 0, 0, 1);
    app.emit(110, 15.999, 0, 1);
    app.emit(125, 0, 0, 1);
    assert.match(app.element('acquisitionQuality').textContent, /120\.0Hz.*간격 이상 1회.*포화 의심 1개/);
    assert.match(app.element('acquisitionQuality').textContent, /최대값을 신뢰할 수 없음/);
    await app.click('recordButton');
    assert.equal(app.commands.at(-1), 'STOP:IMU_BATCH');
    app.click('saveTrialButton');
    const trial = Object.values(JSON.parse(app.storage.get('accelerometer_trials')))[0];
    assert.equal(trial.data.length, 4);
    assert.ok(trial.data[2][1] > 15.99);
    assert.equal(trial.data[3][0], 0.025);
    await app.click('recordButton');
    app.emit(200);
    assert.match(app.element('acquisitionQuality').textContent, /간격 이상 0회.*포화 의심 0개/);
});

test('200Hz stop drains partial final batch before completing recording', async () => {
    const app = page({ stopTail: [105, 110, 115] });
    app.element('samplingRateSelect').value = '200';
    await app.click('connectBleButton');
    await app.click('recordButton');
    app.emit(100);
    await app.click('recordButton');
    app.click('saveTrialButton');
    const trial = Object.values(JSON.parse(app.storage.get('accelerometer_trials')))[0];
    assert.equal(trial.data.length, 4);
    assert.equal(trial.data[3][0], 0.015);
    assert.equal(app.commands.at(-1), 'STOP:IMU_BATCH');
    assert.equal(app.errors.length, 0);
});

test('sensor error and timeout stop measurement but preserve samples', async () => {
    const app = page();
    await app.click('connectBleButton');
    await app.click('recordButton');
    app.emit(100);
    app.sensorError();
    assert.equal(app.element('recordButton').disabled, true);
    assert.match(app.element('status').textContent, /IMU read failed/);
    assert.equal(app.element('saveTrialButton').disabled, false);
    app.device.gatt.disconnect();
    await app.click('connectBleButton');
    await app.click('recordButton');
    app.emit(200);
    app.tick(16000);
    assert.match(app.element('status').textContent, /15초/);
    assert.equal(app.element('recordButton').textContent, '측정 시작');
});

test('unexpected disconnect ends recording and reconnect resets timestamps', async () => {
    const app = page();
    await app.click('connectBleButton');
    await app.click('recordButton');
    app.emit(1000);
    app.device.gatt.disconnect();
    assert.equal(app.element('recordButton').textContent, '측정 시작');
    await app.click('connectBleButton');
    await app.click('recordButton');
    app.emit(0);
    assert.equal(app.chart.data.datasets[0].data[0].x, 0);
});

test('failed start and unsupported browser cannot pretend to record', async () => {
    const app = page({ failCommand: 'START:IMU' });
    await app.click('connectBleButton');
    await app.click('recordButton');
    assert.match(app.element('status').textContent, /write failure/);
    assert.equal(app.element('recordButton').disabled, true);
    assert.equal(page({ bluetooth: false }).element('connectBleButton').disabled, true);
});

test('new connection stops current recording and preserves its samples', async () => {
    const app = page();
    await app.click('connectBleButton');
    await app.click('recordButton');
    app.emit(1000, 8);
    await app.click('connectBleButton');
    assert.equal(app.element('recordButton').textContent, '측정 시작');
    assert.equal(app.element('saveTrialButton').disabled, false);
    app.click('saveTrialButton');
    const trial = Object.values(JSON.parse(app.storage.get('accelerometer_trials')))[0];
    assert.equal(trial.data[0][1], 8);
    assert.equal(app.device.gatt.connected, true);
});
