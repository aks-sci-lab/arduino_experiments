const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const EnvironmentProtocol = require('../js/environment-protocol.js');
const SensorDefinitions = require('../js/sensor-definitions.js');
const PicoBLE = require('../js/pico-ble.js');
const VOCIndex = require('../js/voc-index.js');
const vocBytes = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'sensirion', 'voc-index.wasm'));

function page(mode, { supported = true, failure = false, stored, transientStage, startSensorError = false, staleReceiver = false, immediateSample = false, algorithmFailure = false } = {}) {
    const elements = new Map(), commands = [], alerts = [], documents = [], blobs = [];
    let watchdog, clock = 0, chart;
    const windowListeners = {};
    class Element {
        constructor(tag = '') {
            this.tag = tag; this.listeners = {}; this.children = []; this.rows = [];
            this.cells = []; this.style = {}; this.textContent = ''; this.disabled = false;
        }
        set innerHTML(value) { this.html = value; if (!value) { this.children = []; this.rows = []; } }
        get innerHTML() { return this.html || ''; }
        addEventListener(event, fn) { this.listeners[event] = fn; }
        removeEventListener(event) { delete this.listeners[event]; }
        appendChild(child) { this.children.push(child); }
        append(...children) { this.children.push(...children); }
        insertRow() { const row = new Element('tr'); this.rows.push(row); return row; }
        insertCell() { const cell = new Element('td'); this.cells.push(cell); return cell; }
        deleteRow(index) { this.rows.splice(index, 1); }
        click() { return this.listeners.click?.(); }
    }
    const element = id => {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
    };
    element('samplingRateSelect').value = '1000';
    const tx = new Element();
    let failedOnce = false;
    const maybeDrop = stage => {
        if (transientStage === stage && !failedOnce) {
            failedOnce = true;
            device.gatt.disconnect();
            const error = new Error('GATT Server is disconnected. Cannot perform GATT operations.');
            error.name = 'NetworkError';
            throw error;
        }
    };
    tx.startNotifications = async () => { maybeDrop('notifications'); };
    const cmd = {
        async writeValueWithResponse(bytes) {
            const command = new TextDecoder().decode(bytes);
            commands.push(command);
            if (failure) throw new Error('GATT write failed');
            maybeDrop(command);
            if (startSensorError && command.startsWith('START:')) {
                tx.listeners.characteristicvaluechanged({
                    target: { value: new TextEncoder().encode('{"type":"error","message":"Unsupported sensor"}\n') }
                });
                throw new Error('GATT Server is disconnected. Cannot perform GATT operations.');
            }
            if (immediateSample && command.startsWith('START:')) {
                const bytes = new TextEncoder().encode(JSON.stringify(sample(mode, 1000, 0)) + '\n');
                tx.listeners.characteristicvaluechanged({ target: { value: bytes } });
            }
        }
    };
    const device = new Element();
    let connectionCount = 0;
    device.name = 'PicoEnv-0102';
    device.gatt = {
        connected: false,
        async connect() { connectionCount++; this.connected = true; return this; },
        async getPrimaryService() {
            return { getCharacteristic: async id => id.startsWith('19b10001') ? tx : cmd };
        },
        disconnect() { this.connected = false; device.listeners.gattserverdisconnected?.(); }
    };
    const storage = new Map();
    if (stored !== undefined) storage.set(`${mode}_sensor_trials`, stored);
    const context = vm.createContext({
        TextEncoder, TextDecoder,
        EnvironmentProtocol: staleReceiver ? { ...EnvironmentProtocol, version: undefined } : EnvironmentProtocol,
        SensorDefinitions, PicoBLE,
        VOCIndex: {
            ...VOCIndex,
            create: async () => {
                if (algorithmFailure) throw new Error('VOC algorithm HTTP 404');
                return VOCIndex.fromBytes(vocBytes);
            }
        },
        console: { error() {} }, performance: { now: () => clock },
        setInterval: fn => { watchdog = fn; },
        alert: message => alerts.push(message), prompt: () => '<trial>', confirm: () => true,
        localStorage: {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value)
        },
        Blob: class {
            constructor(parts) { blobs.push(parts.join('')); }
        },
        URL: { createObjectURL: () => 'blob:csv', revokeObjectURL() {} },
        window: { isSecureContext: true, addEventListener: (event, fn) => { windowListeners[event] = fn; } },
        navigator: supported ? { bluetooth: { requestDevice: async () => device } } : {},
        firebase: {
            initializeApp() {},
            auth: () => ({ onAuthStateChanged: fn => fn({ uid: 'u1', email: 'student@example.com' }) }),
            firestore: Object.assign(() => ({ collection: () => ({ add: async doc => documents.push(doc) }) }), {
                FieldValue: { serverTimestamp: () => 'server time' }
            })
        },
        Chart: class {
            constructor(_, options) { Object.assign(this, options); chart = this; }
            update() {}
        },
        document: {
            body: { dataset: { sensor: mode } },
            addEventListener: (_, fn) => fn(),
            getElementById: element,
            createElement: tag => new Element(tag)
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'sensor-lab.js'), 'utf8'), context);
    return {
        element, commands, chart, storage, alerts, documents, blobs, device,
        connections: () => connectionCount,
        click: id => element(id).click(),
        leave: () => windowListeners.pagehide(),
        returnToPage: () => windowListeners.pageshow(),
        async rate(value) {
            element('samplingRateSelect').value = value;
            await element('samplingRateSelect').listeners.change();
        },
        tick(ms) { clock += ms; watchdog(); },
        emit(packet) {
            const payload = new TextEncoder().encode(JSON.stringify(packet) + '\n');
            for (let i = 0; i < payload.length; i += 20) {
                tx.listeners.characteristicvaluechanged({ target: { value: payload.slice(i, i + 20) } });
            }
        }
    };
}

const data = {
    light: { lux: 136.435, full: 1000, infrared: 100, gain: 25 },
    uv: { uvRaw: 123456 },
    voc: { sraw: 25000, warmup: 60, temp: 25, humidity: 50 }
};
const sample = (mode, ts, seq) => ({ type: mode, ts, seq, data: data[mode] });

for (const mode of Object.keys(data)) {
    test(`${mode} independent page: connect/display/record/CSV/trials/cloud`, async () => {
        const app = page(mode);
        assert.equal(app.element('readouts').children.length, 1);
        assert.equal(app.element('tableHead').children.length, 1);
        await app.click('connectButton');
        assert.deepEqual(app.commands, ['STOP', 'SET_SENSOR_RATE:1000', `START:${mode.toUpperCase()}`]);
        assert.equal(app.element('recordButton').disabled, true);
        app.emit(sample(mode, 1000, 0));
        assert.equal(app.element('recordButton').disabled, false);
        if (mode === 'voc') assert.match(app.element('readouts').children[0].children[1].textContent, /준비 중/);
        else assert.match(app.element('readouts').children[0].children[1].textContent, new RegExp(String(data[mode][SensorDefinitions.definitions[mode].key])));
        app.click('recordButton');
        app.emit(sample(mode, 2000, 1));
        if (mode !== 'voc') await app.rate('5000');
        else assert.equal(app.element('samplingRateSelect').disabled, true);
        app.emit(sample(mode, 7000, 2));
        assert.deepEqual(Array.from(app.chart.data.datasets[0].data, point => point.x), [0, 5]);
        assert.equal(app.element('historyTbody').rows.length, 2);
        assert.equal(app.element('historyTbody').rows[0].cells.length, 2);
        if (mode === 'voc') assert.match(app.element('status').textContent, /측정 중.*준비 중/);
        app.click('recordButton');
        app.click('downloadButton');
        assert.match(app.blobs[0], new RegExp(SensorDefinitions.definitions[mode].unit));
        if (mode === 'voc') assert.match(app.blobs[0], /안정화/);
        app.click('saveTrialButton');
        const trial = JSON.parse(app.storage.get(`${mode}_sensor_trials`))[0];
        assert.equal(trial.data.length, 2);
        assert.equal(trial.data[1].time, 5);
        assert.deepEqual(trial.data[0].data, mode === 'voc' ? { ...data[mode], vocIndex: null } : data[mode]);
        assert.equal(app.element('trialList').children[0].children[0].textContent, '<trial> (2개) ');
        await app.click('saveCloudButton');
        assert.equal(app.documents[0].tab, `${mode}-lab`);
        assert.equal(app.documents[0].trialsCount, 1);
        app.click('recordButton');
        app.click('recordButton');
        app.element('trialList').children[0].children[1].click();
        assert.equal(app.chart.data.datasets[0].data.length, 2);
        assert.equal(app.element('historyTbody').rows[0].cells.length, 2);
        app.element('trialList').children[0].children[2].click();
        assert.deepEqual(JSON.parse(app.storage.get(`${mode}_sensor_trials`)), []);
        app.click('disconnectButton');
        assert.equal(app.element('recordButton').disabled, true);
        assert.equal(app.element('downloadButton').disabled, false);
    });
}

test('sensor error stops acquisition and preserves samples; reconnect resets sequence', async () => {
    const app = page('voc');
    await app.click('connectButton');
    app.emit(sample('voc', 1000, 0));
    assert.match(app.element('status').textContent, /준비 중/);
    app.click('recordButton');
    app.emit(sample('voc', 2000, 1));
    app.emit({ type: 'error', message: 'SGP40 response CRC mismatch' });
    assert.match(app.element('status').textContent, /CRC mismatch/);
    assert.equal(app.device.gatt.connected, false);
    assert.equal(app.element('saveTrialButton').disabled, false);
    await app.click('connectButton');
    app.emit(sample('voc', 1000, 0));
    assert.equal(app.element('recordButton').disabled, false);
    app.tick(16000);
    assert.match(app.element('status').textContent, /15초/);
});

test('new connection preserves current data and unsupported browser reports limits', async () => {
    const app = page('uv');
    await app.click('connectButton');
    app.emit(sample('uv', 1000, 0));
    app.click('recordButton');
    app.emit(sample('uv', 2000, 1));
    await app.click('connectButton');
    assert.equal(app.element('saveTrialButton').disabled, false);
    app.click('saveTrialButton');
    assert.equal(JSON.parse(app.storage.get('uv_sensor_trials'))[0].data.length, 1);
    assert.equal(page('uv', { supported: false }).element('connectButton').disabled, true);
});

test('GATT command failure and corrupt local data are explicit', async () => {
    const app = page('light', { failure: true, stored: '{"bad":true}' });
    assert.match(app.alerts[0], /불러오기 실패/);
    await app.click('connectButton');
    assert.match(app.element('status').textContent, /GATT write failed/);
    assert.equal(app.element('recordButton').disabled, true);
});

test('pagehide releases BLE and pageshow requires a fresh connection', async () => {
    const app = page('light');
    await app.click('connectButton');
    app.emit(sample('light', 1000, 0));
    app.click('recordButton');
    app.emit(sample('light', 2000, 1));
    app.leave();
    assert.equal(app.device.gatt.connected, false);
    assert.equal(app.element('recordButton').disabled, true);
    assert.equal(app.element('saveTrialButton').disabled, false);
    app.returnToPage();
    await app.click('connectButton');
    app.emit(sample('light', 1000, 0));
    assert.equal(app.element('recordButton').disabled, false);
});

for (const stage of ['notifications', 'STOP', 'SET_SENSOR_RATE:1000', 'START:LIGHT']) {
    test(`restarts full connection setup after disconnect at ${stage}`, async () => {
        const app = page('light', { transientStage: stage });
        await app.click('connectButton');
        assert.equal(app.connections(), 2);
        assert.equal(app.device.gatt.connected, true);
        assert.equal(app.commands.at(-1), 'START:LIGHT');
        app.emit(sample('light', 1000, 0));
        assert.equal(app.element('recordButton').disabled, false);
        assert.match(app.element('status').textContent, /실시간 수신/);
    });
}

test('does not retry Pico sensor errors received during setup', async () => {
    const app = page('light', { startSensorError: true });
    await app.click('connectButton');
    assert.equal(app.connections(), 1);
    assert.equal(app.device.gatt.connected, false);
    assert.match(app.element('status').textContent, /Unsupported sensor/);
    assert.doesNotMatch(app.element('status').textContent, /Cannot perform GATT/);
    assert.equal(app.element('recordButton').disabled, true);
});

test('detects stale environment-only receiver before a Bluetooth connection', () => {
    const app = page('light', { staleReceiver: true });
    assert.equal(app.element('connectButton').disabled, true);
    assert.match(app.element('status').textContent, /이전 BLE 수신 코드/);
    assert.equal(app.connections(), 0);
});

test('first light frame arriving before START write completes stays connected', async () => {
    const app = page('light', { immediateSample: true });
    await app.click('connectButton');
    assert.equal(app.device.gatt.connected, true);
    assert.equal(app.element('recordButton').disabled, false);
    assert.match(app.element('status').textContent, /실시간 수신/);
});

const vocSample = seq => ({
    type: 'voc', ts: (seq + 1) * 1000, seq,
    data: { ...data.voc, warmup: Math.max(0, 60 - seq) }
});

test('VOC learns before recording and stores the official Index with raw data and provenance', async () => {
    const app = page('voc');
    await app.click('connectButton');
    for (let seq = 0; seq <= 60; seq++) app.emit(vocSample(seq));
    const expected = require('./voc-reference.json').indexes;
    assert.equal(app.element('readouts').children[0].children[1].textContent, `${expected[60]} Index`);
    app.click('recordButton');
    app.emit(vocSample(61));
    app.emit(vocSample(62));
    assert.equal(app.chart.data.datasets[0].data[0].y, expected[61]);
    assert.equal(app.element('historyTbody').rows[0].cells[1].textContent, String(expected[61]));
    app.click('recordButton');
    app.click('saveTrialButton');
    const saved = JSON.parse(app.storage.get('voc_sensor_trials'))[0].data[0];
    assert.equal(saved.data.vocIndex, expected[61]);
    assert.equal(saved.data.sraw, 25000);
    assert.equal(saved.vocAlgorithm, VOCIndex.version);
    app.click('downloadButton');
    assert.match(app.blobs[0], /VOC Index \(Index\),VOC 원시 신호 \(SRAW\)/);
    assert.match(app.blobs[0], /sensirion-fixed-3\.2\.0/);
    app.emit(vocSample(63));
    assert.equal(app.element('readouts').children[0].children[1].textContent, `${expected[63]} Index`);
    const restored = page('voc', { stored: app.storage.get('voc_sensor_trials') });
    assert.equal(restored.alerts.length, 0);
    restored.element('trialList').children[0].children[1].click();
    assert.equal(restored.chart.data.datasets[0].data[0].y, expected[61]);
    await app.click('connectButton');
    app.emit(vocSample(0));
    assert.match(app.element('readouts').children[0].children[1].textContent, /준비 중/);
});

test('VOC warmup records blank indexes and gaps reset the algorithm with a visible notice', async () => {
    const app = page('voc');
    await app.click('connectButton');
    app.emit(vocSample(0));
    app.click('recordButton');
    app.emit(vocSample(1));
    assert.equal(app.chart.data.datasets[0].data[0].y, null);
    assert.equal(app.element('historyTbody').rows[0].cells[1].textContent, '—');
    for (let seq = 2; seq <= 60; seq++) app.emit(vocSample(seq));
    assert.ok(app.chart.data.datasets[0].data.at(-1).y > 0);
    app.emit(vocSample(62));
    assert.match(app.element('status').textContent, /준비 중.*데이터 누락/);
    assert.equal(app.chart.data.datasets[0].data.at(-1).y, null);
    app.click('recordButton');
    app.click('downloadButton');
    const firstRow = app.blobs[0].split('\r\n')[1].split(',');
    assert.equal(firstRow[1], '');
    assert.equal(firstRow[2], '25000');
});

test('old SRAW trials remain exportable but are never mislabeled or recalculated as Index', () => {
    const stored = JSON.stringify([{ name: 'Old VOC', data: [{ ...vocSample(0), time: 0 }] }]);
    const app = page('voc', { stored });
    assert.equal(app.alerts.length, 0);
    app.element('trialList').children[0].children[1].click();
    assert.equal(app.chart.data.datasets[0].data[0].y, null);
    assert.equal(app.element('historyTbody').rows[0].cells[1].textContent, '—');
    assert.match(app.element('status').textContent, /이전 SRAW.*VOC Index가 없습니다/);
    app.click('downloadButton');
    assert.equal(app.blobs[0].split('\r\n')[1].split(',')[1], '');
    assert.match(app.blobs[0], /25000/);
});

test('VOC loader and raw input failures stop acquisition without raw-value fallback', async () => {
    const failed = page('voc', { algorithmFailure: true });
    await failed.click('connectButton');
    assert.equal(failed.connections(), 0);
    assert.match(failed.element('status').textContent, /VOC 알고리즘 준비.*HTTP 404/);
    assert.equal(failed.element('recordButton').disabled, true);
    const app = page('voc');
    await app.click('connectButton');
    app.emit({ ...vocSample(0), data: { ...data.voc, sraw: 65000 } });
    assert.equal(app.device.gatt.connected, false);
    assert.match(app.element('status').textContent, /유효하지 않은 SRAW/);
});

test('all three HTML pages wire shared scripts and firmware downloads', () => {
    for (const mode of Object.keys(data)) {
        const html = fs.readFileSync(path.join(__dirname, '..', 'projects', `${mode}-lab.html`), 'utf8');
        assert.ok(html.includes(`data-sensor="${mode}"`));
        assert.ok(html.includes('id="connectButton" class="ble-button"'));
        assert.ok(html.includes('sensor-lab.css?v=layout-v3'));
        assert.ok(html.includes('class="sensor-lab-layout"'));
        assert.ok(html.indexOf('id="historyTbody"') < html.indexOf('id="chart"'));
        for (const script of ['sensor-lab.js', 'sensor-definitions.js', 'environment-protocol.js', 'pico-ble.js']) {
            assert.ok(html.includes(script));
        }
        if (mode === 'voc') {
            assert.ok(html.indexOf('voc-index.js') < html.indexOf('sensor-lab.js'));
            assert.match(html, /vendor\/sensirion\/NOTICE/);
        }
        for (const filename of ['main.py', 'bme280.py', 'imu.py', 'extra_sensors.py']) assert.ok(html.includes(filename));
        for (const id of ['connectButton', 'disconnectButton', 'recordButton', 'historyTbody', 'readouts',
            'chart', 'saveTrialButton', 'clearTrialsButton', 'trialList', 'saveCloudButton']) {
            assert.ok(html.includes(`id="${id}"`));
        }
    }
    const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(index, /<h1>센서 기반 웹실험실<\/h1>/);
    for (const mode of ['light', 'uv']) assert.ok(index.includes(`projects/${mode}-lab.html`));
    assert.ok(index.includes('projects/environment-lab.html'));
    assert.ok(!index.includes('projects/voc-lab.html'));
});
