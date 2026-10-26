const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const EnvironmentProtocol = require('../js/environment-protocol.js');
const PicoBLE = require('../js/pico-ble.js');
const EnvironmentMetrics = require('../js/environment-metrics.js');
const VOCIndex = require('../js/voc-index.js');
const vocBytes = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'sensirion', 'voc-index.wasm'));

function page({ bluetooth = true, secure = true, failWrite = false, algorithmFailure = false, stored, yKey = 'temp' } = {}) {
    const elements = new Map(), commands = [], logs = [], downloads = [], selectedTrials = new Set();
    let clock = 0, watchdog, chart, clipboard;
    const windowListeners = {};
    class Element {
        constructor() {
            this.listeners = {};
            this.style = {};
            this.rows = [];
            this.children = [];
            this.checked = true;
            this.disabled = false;
            this.textContent = '';
            this.value = '';
        }
        set innerHTML(value) {
            this.html = value;
            if (!value) { this.rows = []; this.children = []; }
        }
        get innerHTML() { return this.html || ''; }
        addEventListener(name, callback) { this.listeners[name] = callback; }
        removeEventListener(name) { delete this.listeners[name]; }
        appendChild(child) { this.children.push(child); }
        removeChild(child) { this.children = this.children.filter(item => item !== child); }
        querySelector() { return element('currentTrialCheckbox'); }
        querySelectorAll(selector) {
            return selector === '.trial-checkbox:checked' ? [...selectedTrials].map(id => ({ id })) : [];
        }
        insertRow() { const row = new Element(); this.rows.push(row); return row; }
        deleteRow(index) { this.rows.splice(index, 1); }
        click() { if (this.href) downloads.push(this.href); }
    }
    function element(id) {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
    }
    for (const id of ['recordButton', 'downloadButton', 'saveTrialButton', 'copyAndGoButton']) element(id).disabled = true;
    element('samplingRateSelect').value = '1000';
    element('xAxisSelect').value = 'time';
    const yCheckbox = new Element();
    yCheckbox.value = yKey;
    const dataCharacteristic = new Element();
    dataCharacteristic.startNotifications = async () => {};
    const commandCharacteristic = {
        async writeValueWithResponse(bytes) {
            if (failWrite) throw new Error('GATT write failed');
            commands.push(new TextDecoder().decode(bytes));
        }
    };
    const device = new Element();
    device.name = 'PicoEnv-0102';
    device.gatt = {
        connected: false,
        async connect() { this.connected = true; return this; },
        async getPrimaryService() {
            return { getCharacteristic: async uuid => uuid.startsWith('19b10001') ? dataCharacteristic : commandCharacteristic };
        },
        disconnect() {
            this.connected = false;
            device.listeners.gattserverdisconnected?.();
        }
    };
    const storage = new Map();
    if (stored) storage.set('env_sensor_trials', stored);
    const context = vm.createContext({
        TextEncoder, TextDecoder, EnvironmentProtocol, PicoBLE, EnvironmentMetrics,
        VOCIndex: {
            create: async () => {
                if (algorithmFailure) throw new Error('VOC algorithm HTTP 404');
                return VOCIndex.fromBytes(vocBytes);
            }
        },
        console: { error: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
        performance: { now: () => clock },
        setInterval: callback => { watchdog = callback; },
        alert: message => logs.push(message),
        prompt: () => 'Pico trial',
        confirm: () => true,
        localStorage: {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key)
        },
        window: { isSecureContext: secure, open() {}, addEventListener: (event, fn) => { windowListeners[event] = fn; } },
        navigator: {
            ...(bluetooth ? { bluetooth: { requestDevice: async () => device } } : {}),
            clipboard: { writeText: async text => { clipboard = text; } }
        },
        Chart: class {
            constructor(_, config) {
                Object.assign(this, config);
                this.scales = { x: { min: 0, max: 100 } };
                chart = this;
            }
            resetZoom() {}
            update() {}
        },
        document: {
            body: new Element(),
            addEventListener: (_, callback) => callback(),
            getElementById: element,
            createElement: () => new Element(),
            querySelectorAll: () => [yCheckbox]
        }
    });
    const html = fs.readFileSync(path.join(__dirname, '..', 'projects', 'environment-lab.html'), 'utf8');
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
    vm.runInContext(script, context);
    return {
        element, device, commands, logs, downloads, storage, chart,
        clipboard: () => clipboard,
        leave: () => windowListeners.pagehide(),
        returnToPage: () => windowListeners.pageshow(),
        axis: key => { element('xAxisSelect').value = key; element('xAxisSelect').listeners.change(); },
        selectTrial: id => {
            element('currentTrialCheckbox').checked = false;
            selectedTrials.add(id);
            element('xAxisSelect').listeners.change();
        },
        click: id => element(id).listeners.click(),
        rate: async value => {
            element('samplingRateSelect').value = value;
            await element('samplingRateSelect').listeners.change();
            await new Promise(resolve => setImmediate(resolve));
        },
        tick: milliseconds => { clock += milliseconds; watchdog(); },
        emit(packet) {
            const bytes = new TextEncoder().encode(JSON.stringify(packet) + '\n');
            for (let offset = 0; offset < bytes.length; offset += 20) {
                dataCharacteristic.listeners.characteristicvaluechanged({
                    target: { value: new DataView(bytes.buffer, offset, Math.min(20, bytes.length - offset)) }
                });
            }
        }
    };
}

const sample = (ts, seq) => ({ type: 'env_voc', ts, seq, data: { temp: 25, humidity: 50, pressure: 101.325, sraw: 25000, warmup: Math.max(0, 60 - seq) } });

test('connect, display, real timestamp axis across rate changes, CSV and local trial saving', async () => {
    const app = page();
    await app.click('connectBleButton');
    assert.deepEqual(app.commands, ['STOP', 'START:ENV_VOC']);
    assert.equal(app.element('recordButton').disabled, true);
    app.emit(sample(1000, 0));
    assert.equal(app.element('temp-value').textContent, '25.00');
    assert.equal(app.element('pressure-value').textContent, '101.33');
    assert.equal(app.element('vapor-pressure-value').textContent, '1.581');
    assert.equal(app.element('recordButton').disabled, false);
    app.click('recordButton');
    app.emit(sample(2000, 1));
    app.emit(sample(3000, 2));
    await app.rate('5000');
    app.emit(sample(8000, 3));
    assert.equal(app.commands.at(-1), 'START:ENV_VOC');
    assert.deepEqual(Array.from(app.chart.data.datasets[0].data, point => point.x), [0, 1, 6]);
    app.click('recordButton');
    app.click('saveTrialButton');
    const saved = Object.values(JSON.parse(app.storage.get('env_sensor_trials')))[0];
    assert.equal(saved.data.length, 3);
    assert.equal(saved.data[2].time, 6);
    assert.equal(saved.data[2].vocIndex, null);
    assert.equal(saved.data[2].sraw, 25000);
    app.click('downloadButton');
    const csv = decodeURI(app.downloads[0]);
    assert.match(csv, /Pressure \(kPa\)/);
    assert.match(csv, /,6\.000,25\.00,50\.00,101\.33,1\.581,8000,,25000/);
    app.click('disconnectBleButton');
    assert.equal(app.element('recordButton').disabled, true);
    assert.equal(app.element('downloadButton').disabled, false);
    assert.equal(app.element('copyAndGoButton').disabled, false);
});

test('unexpected disconnect stops recording, keeps data and reconnects cleanly', async () => {
    const app = page();
    await app.click('connectBleButton');
    app.emit(sample(1000, 0));
    app.click('recordButton');
    app.emit(sample(2000, 1));
    app.device.gatt.disconnect();
    assert.equal(app.element('recordButton').textContent, '측정 시작');
    assert.equal(app.element('saveTrialButton').disabled, false);
    await app.click('connectBleButton');
    app.emit(sample(1000, 0));
    assert.equal(app.element('recordButton').disabled, false);
});

test('sensor errors and stalled connection stop recording with explicit status', async () => {
    const app = page();
    await app.click('connectBleButton');
    app.emit(sample(1000, 0));
    app.click('recordButton');
    app.emit({ type: 'error', message: 'BME280 read failed' });
    assert.match(app.element('status').textContent, /BME280 read failed/);
    assert.equal(app.element('recordButton').disabled, true);
    await app.click('connectBleButton');
    app.emit(sample(2000, 1));
    app.click('recordButton');
    app.emit(sample(3000, 2));
    app.tick(16000);
    assert.match(app.element('status').textContent, /15초/);
    assert.equal(app.element('recordButton').textContent, '측정 시작');
    assert.equal(app.element('saveTrialButton').disabled, false);
});

test('unsupported browser and failed GATT write are surfaced', async () => {
    for (const options of [{ bluetooth: false }, { secure: false }]) {
        const app = page(options);
        assert.equal(app.element('connectBleButton').disabled, true);
        assert.match(app.element('status').textContent, /Web Bluetooth/);
    }
    const app = page({ failWrite: true });
    await app.click('connectBleButton');
    assert.match(app.element('status').textContent, /GATT write failed/);
    assert.equal(app.element('connectBleButton').disabled, false);
    assert.equal(app.device.gatt.connected, false);
});

test('new connection ends recording and preserves current data', async () => {
    const app = page();
    await app.click('connectBleButton');
    app.emit(sample(1000, 0));
    app.click('recordButton');
    app.emit(sample(2000, 1));
    await app.click('connectBleButton');
    assert.equal(app.element('recordButton').textContent, '측정 시작');
    assert.equal(app.element('saveTrialButton').disabled, false);
    app.click('saveTrialButton');
    const trial = Object.values(JSON.parse(app.storage.get('env_sensor_trials')))[0];
    assert.equal(trial.data.length, 1);
    assert.equal(app.device.gatt.connected, true);
});

test('combined monitor learns every second while logging every five seconds and exports Index', async () => {
    const app = page({ yKey: 'vocIndex' });
    await app.click('connectBleButton');
    for (let seq = 0; seq <= 60; seq++) app.emit(sample((seq + 1) * 1000, seq));
    const expected = require('./voc-reference.json').indexes;
    assert.equal(app.element('voc-index-value').textContent, String(expected[60]));
    await app.rate('5000');
    app.click('recordButton');
    for (let seq = 61; seq <= 71; seq++) app.emit(sample((seq + 1) * 1000, seq));
    assert.deepEqual(Array.from(app.chart.data.datasets[0].data, p => p.x), [0, 5, 10]);
    assert.deepEqual(Array.from(app.chart.data.datasets[0].data, p => p.y), [expected[61], expected[66], expected[71]]);
    assert.deepEqual(app.commands, ['STOP', 'START:ENV_VOC']);
    app.click('recordButton');
    app.click('saveTrialButton');
    const saved = Object.values(JSON.parse(app.storage.get('env_sensor_trials')))[0];
    assert.equal(saved.data[2].vocIndex, expected[71]);
    assert.equal(saved.data[2].vocAlgorithm, VOCIndex.version);
    app.click('downloadButton');
    assert.match(decodeURI(app.downloads[0]), /VOC Index,SRAW,Warmup \(s\),VOC algorithm/);
    await app.click('copyAndGoButton');
    assert.match(app.clipboard(), /VOC Index/);
    assert.match(app.clipboard(), new RegExp(`${expected[71]}\\n`));
    app.emit(sample(73000, 72));
    assert.equal(app.element('voc-index-value').textContent, String(expected[72]));
    app.leave();
    assert.equal(app.device.gatt.connected, false);
    app.returnToPage();
    await app.click('connectBleButton');
    app.emit(sample(1000, 0));
    assert.equal(app.element('voc-index-value').textContent, '준비 중');
});

test('VOC preparation is blank in graph and notice covers missing frames and high-temperature extrapolation', async () => {
    const app = page({ yKey: 'vocIndex' });
    await app.click('connectBleButton');
    app.emit(sample(1000, 0));
    app.click('recordButton');
    app.emit(sample(2000, 1));
    assert.equal(app.chart.data.datasets[0].data[0].y, null);
    assert.match(app.element('measurementNotice').textContent, /준비 중/);
    app.emit({ ...sample(4000, 3), data: { ...sample(4000, 3).data, temp: 60 } });
    assert.match(app.element('measurementNotice').textContent, /누락.*외삽/);
    assert.ok(Number(app.element('vapor-pressure-value').textContent) > 9);
    app.axis('vocIndex');
    assert.equal(app.chart.data.datasets[0].data.length, 0);
});

test('old environment trials with no Index remain valid and graph them as missing values', () => {
    const app = page({ yKey: 'vocIndex', stored: JSON.stringify({
        old: { id: 'old', name: 'Old environment', data: [{ time: 0, temp: 25, humidity: 50, pressure: 101, vaporPressure: 1.581 }] }
    }) });
    assert.ok(app.element('trial-list').children.length > 1);
    assert.equal(app.logs.length, 0);
    app.selectTrial('old');
    assert.equal(app.chart.data.datasets[0].data[0].y, null);
});

test('old VOC URL redirects to combined monitor while legacy query retains saved trial access', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'projects', 'voc-lab.html'), 'utf8');
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
    let destination = null;
    const context = { URLSearchParams, location: { search: '', replace: value => { destination = value; } } };
    vm.runInNewContext(script, context);
    assert.equal(destination, 'environment-lab.html');
    destination = null;
    context.location.search = '?legacy=1';
    vm.runInNewContext(script, context);
    assert.equal(destination, null);
});

test('old firmware and algorithm download failures have explicit errors, no environment-only fallback', async () => {
    const failed = page({ algorithmFailure: true });
    await failed.click('connectBleButton');
    assert.match(failed.element('status').textContent, /HTTP 404/);
    assert.equal(failed.device.gatt.connected, false);
    const app = page();
    await app.click('connectBleButton');
    app.emit({ ...sample(1000, 0), type: 'env' });
    assert.match(app.element('status').textContent, /통합 펌웨어/);
    assert.equal(app.device.gatt.connected, false);
});

test('displayed titles and installation guides omit board model while keeping the correct download target', () => {
    for (const filename of ['index.html', ...['environment', 'accelerometer', 'light', 'uv', 'voc'].map(mode => `projects/${mode}-lab.html`)]) {
        const html = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
        assert.doesNotMatch(html, /Pico 2 W/i);
    }
    const html = fs.readFileSync(path.join(__dirname, '..', 'projects', 'environment-lab.html'), 'utf8');
    assert.match(html, /RPI_PICO2_W/);
    assert.match(html, /voc-index-value/);
    assert.match(html, /value="vocIndex"/);
});
