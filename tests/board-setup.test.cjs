const test = require('node:test');
const assert = require('node:assert/strict');
const EnvironmentProtocol = require('../js/environment-protocol.js');
const PicoBLE = require('../js/pico-ble.js');
const BoardSetup = require('../js/board-setup.js');

test('번호 입력은 1~99 의 숫자만 받는다', () => {
    assert.equal(BoardSetup.parseNumber('7'), 7);
    assert.equal(BoardSetup.parseNumber(' 07 '), 7);
    assert.equal(BoardSetup.parseNumber('99'), 99);
    for (const bad of ['', '0', '00', '100', 'a', '1.5', '-1', null, undefined]) {
        assert.equal(BoardSetup.parseNumber(bad), null, String(bad));
    }
    assert.equal(BoardSetup.pad(7), '07');
});

test('다음 빈 번호, 겹침 찾기, 목록 고치기', () => {
    let registry = [];
    assert.equal(BoardSetup.nextFree(registry), 1);
    registry = BoardSetup.upsert(registry, 'AA', 1, 't1');
    registry = BoardSetup.upsert(registry, 'BB', 3, 't2');
    assert.equal(BoardSetup.nextFree(registry), 2);
    assert.equal(BoardSetup.conflict(registry, 'CC', 3).id, 'BB');
    assert.equal(BoardSetup.conflict(registry, 'BB', 3), null);
    // 같은 보드의 번호를 바꾸면 한 줄만 남는다
    registry = BoardSetup.upsert(registry, 'AA', 2, 't3');
    assert.deepEqual(registry.map(entry => [entry.id, entry.board, entry.name]),
        [['AA', 2, 'PicoEnv-02'], ['BB', 3, 'PicoEnv-03']]);
    assert.equal(BoardSetup.nextFree(registry), 1);
    // 번호를 지우면 목록에서 빠진다
    assert.deepEqual(BoardSetup.upsert(registry, 'AA', null, 't4').map(entry => entry.id), ['BB']);
    const full = Array.from({ length: 99 }, (_, index) => ({ id: 'X' + index, board: index + 1 }));
    assert.equal(BoardSetup.nextFree(full), null);
});

test('깨진 저장 목록은 버리고, CSV 는 엑셀에서 한글이 보이게 만든다', () => {
    assert.deepEqual(BoardSetup.cleanRegistry('nope'), []);
    assert.deepEqual(BoardSetup.cleanRegistry([null, { id: 'AA', board: 0 }, { id: 5, board: 1 }, { id: 'BB', board: 4 }]),
        [{ id: 'BB', board: 4 }]);
    const csv = BoardSetup.toCsv([{ id: 'E661', board: 7, name: 'PicoEnv-07', savedAt: '2026-11-10T00:00:00.000Z' }]);
    assert.ok(csv.startsWith('﻿번호,블루투스 이름,칩 고유 번호,저장한 때\r\n'));
    assert.ok(csv.includes('07,PicoEnv-07,E661,2026-11-10T00:00:00.000Z'));
});

test('보드 정보 검사와 쉬운 오류 문구', () => {
    const good = { type: 'board', ts: 1, seq: 1, data: { name: 'PicoEnv-07', board: 7, id: 'E661', fw: 'x', saved: true } };
    assert.equal(BoardSetup.validatePacket(good), good);
    for (const change of [{ type: 'env' }, { data: { ...good.data, name: 'Other-07' } }, { data: { ...good.data, board: 100 } },
        { data: { ...good.data, id: 'zz' } }, { seq: 1.5 }, { data: null }]) {
        assert.throws(() => BoardSetup.validatePacket({ ...good, ...change }), /최신 main.py/);
    }
    assert.match(BoardSetup.friendlyError(new Error('Pico: Unknown command')), /예전 펌웨어/);
    assert.equal(BoardSetup.friendlyError(new Error('Pico: 보드의 BOOTSEL 단추를 누르세요')), '보드의 BOOTSEL 단추를 누르세요');
});

// ---------- 화면 흐름 (가짜 블루투스 = 펌웨어 흉내) ----------

function page({ firmware = 'new', board = null, held = true, stored, supported = true } = {}) {
    const elements = new Map(), commands = [], confirms = [], blobs = [], timers = [];
    class Element {
        constructor() { this.listeners = {}; this.style = {}; this.textContent = ''; this.hidden = false; this.disabled = false; this.rows = []; this.cells = []; this.value = ''; }
        set innerHTML(value) { if (!value) this.rows = []; }
        addEventListener(event, fn) { this.listeners[event] = fn; }
        removeEventListener(event) { delete this.listeners[event]; }
        insertRow() { const row = new Element(); this.rows.push(row); return row; }
        insertCell() { const cell = new Element(); this.cells.push(cell); return cell; }
        click() { return this.listeners.click?.(); }
    }
    const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
    const state = { board, held, confirmAnswer: true, silent: false, sequence: 0 };
    const tx = new Element();
    tx.startNotifications = async () => {};
    const notify = packet => {
        const bytes = new TextEncoder().encode(JSON.stringify(packet) + '\n');
        // 펌웨어처럼 20바이트씩 잘라 보낸다 (한글이 조각 사이에서 잘려도 이어 붙어야 한다)
        for (let offset = 0; offset < bytes.length; offset += 20) {
            tx.listeners.characteristicvaluechanged({ target: { value: bytes.slice(offset, offset + 20) } });
        }
    };
    const reply = saved => {
        state.sequence++;
        notify({ type: 'board', ts: state.sequence, seq: state.sequence, data: {
            name: state.board ? 'PicoEnv-' + String(state.board).padStart(2, '0') : 'PicoEnv-A3F1',
            board: state.board, id: 'E66141A3F1', fw: 'test', saved } });
    };
    const cmd = {
        async writeValueWithResponse(bytes) {
            const command = new TextDecoder().decode(bytes);
            commands.push(command);
            if (command === 'STOP' || command === 'IDENTIFY' || state.silent) return;
            if (firmware === 'old') return notify({ type: 'error', message: 'Unknown command' });
            if (command === 'GET_BOARD') return reply(false);
            if (!state.held) {
                return notify({ type: 'error', message: '보드의 BOOTSEL 단추를 누르고 있는 동안에만 번호를 바꿀 수 있습니다. 단추를 누른 채로 다시 저장하세요.' });
            }
            state.board = command === 'CLEAR_BOARD' ? null : Number(command.split(':')[1]);
            reply(true);
        }
    };
    const device = new Element();
    device.name = 'PicoEnv-A3F1';
    device.gatt = {
        connected: false,
        async connect() { this.connected = true; return this; },
        async getPrimaryService() { return { getCharacteristic: async id => id.startsWith('19b10001') ? tx : cmd }; },
        disconnect() { this.connected = false; device.listeners.gattserverdisconnected?.(); }
    };
    const storage = new Map();
    if (stored !== undefined) storage.set(BoardSetup.STORAGE_KEY, stored);
    const listeners = {};
    let requested;
    const env = {
        EnvironmentProtocol, PicoBLE,
        navigator: supported ? { bluetooth: { requestDevice: async options => { requested = options; return device; } } } : {},
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        confirm: message => { confirms.push(message); return state.confirmAnswer; },
        setTimeout: fn => { timers.push(fn); return timers.length; },
        clearTimeout: id => { timers[id - 1] = null; },
        Blob: class { constructor(parts) { blobs.push(parts.join('')); } },
        URL: { createObjectURL: () => 'blob:csv', revokeObjectURL() {} },
        addEventListener: (event, fn) => { listeners[event] = fn; }
    };
    const links = [];
    const doc = { getElementById: element, createElement: () => { const link = new Element(); links.push(link); return link; } };
    BoardSetup.init(doc, env);
    const registry = () => JSON.parse(storage.get(BoardSetup.STORAGE_KEY) || '[]');
    return { element, commands, confirms, blobs, timers, state, device, env, listeners, registry, links, requested: () => requested };
}

test('연결하면 측정을 멈추고 보드 정보를 읽어 다음 빈 번호를 제안한다', async () => {
    const p = page({ stored: JSON.stringify([{ id: 'AAAA', board: 1, name: 'PicoEnv-01' }, { id: 'BBBB', board: 2, name: 'PicoEnv-02' }]) });
    assert.equal(p.element('saveButton').disabled, true);
    await p.element('connectButton').click();
    assert.deepEqual(p.requested().filters, [{ namePrefix: 'PicoEnv-' }]);
    assert.deepEqual(p.commands, ['STOP', 'GET_BOARD']);
    assert.equal(p.element('currentName').textContent, 'PicoEnv-A3F1');
    assert.equal(p.element('chipId').textContent, 'E66141A3F1');
    assert.equal(p.element('numberInput').value, '03');
    assert.equal(p.element('boardPanel').hidden, false);
    assert.equal(p.element('saveButton').disabled, false);
    assert.equal(p.element('clearButton').disabled, true);
    assert.match(p.element('status').textContent, /아직 번호가 없는 보드/);
});

test('저장하면 새 이름을 확인하고 목록에 적고 스티커 안내를 보여 준다', async () => {
    const p = page();
    await p.element('connectButton').click();
    assert.equal(p.element('numberInput').value, '01');
    p.element('numberInput').value = '7';
    await p.element('saveButton').click();
    assert.equal(p.commands.at(-1), 'SET_BOARD:07');
    assert.equal(p.element('currentName').textContent, 'PicoEnv-07');
    assert.equal(p.element('result').hidden, false);
    assert.match(p.element('result').textContent, /PicoEnv-07.*"07" 스티커/);
    assert.match(p.element('status').textContent, /연결을 끊은 뒤/);
    assert.deepEqual(p.registry().map(entry => [entry.id, entry.board, entry.name]), [['E66141A3F1', 7, 'PicoEnv-07']]);
    assert.equal(p.element('registryBody').rows.length, 1);
    assert.equal(p.element('clearButton').disabled, false);
    // 연결을 끊으면 다음 보드를 받을 준비가 된다
    p.element('disconnectButton').click();
    assert.equal(p.element('boardPanel').hidden, true);
    assert.equal(p.device.gatt.connected, false);
    // 같은 보드를 다시 연결하면 정해 둔 번호가 적혀 있다
    await p.element('connectButton').click();
    assert.equal(p.element('numberInput').value, '07');
    assert.match(p.element('status').textContent, /이미 07번으로 정해진 보드/);
});

test('BOOTSEL 단추를 누르지 않으면 보드의 안내를 그대로 보여 주고 아무것도 바꾸지 않는다', async () => {
    const p = page({ held: false });
    await p.element('connectButton').click();
    await p.element('saveButton').click();
    assert.match(p.element('status').textContent, /저장하지 못했습니다: 보드의 BOOTSEL 단추를 누르고 있는 동안에만/);
    assert.equal(p.element('currentName').textContent, 'PicoEnv-A3F1');
    assert.deepEqual(p.registry(), []);
    assert.equal(p.element('saveButton').disabled, false);
    assert.equal(p.device.gatt.connected, true);
    // 단추를 누르고 다시 하면 된다
    p.state.held = true;
    await p.element('saveButton').click();
    assert.equal(p.element('currentName').textContent, 'PicoEnv-01');
});

test('잘못된 번호는 보내지 않고, 겹치는 번호는 물어본다', async () => {
    const p = page({ stored: JSON.stringify([{ id: 'AAAA', board: 5, name: 'PicoEnv-05' }]) });
    await p.element('connectButton').click();
    p.element('numberInput').value = '100';
    await p.element('saveButton').click();
    assert.match(p.element('status').textContent, /1부터 99까지/);
    p.element('numberInput').value = '5';
    p.state.confirmAnswer = false;
    await p.element('saveButton').click();
    assert.equal(p.confirms.length, 1);
    assert.match(p.confirms[0], /05번은 이미 다른 보드\(AAAA\)/);
    assert.deepEqual(p.commands, ['STOP', 'GET_BOARD']);
    p.state.confirmAnswer = true;
    await p.element('saveButton').click();
    assert.equal(p.commands.at(-1), 'SET_BOARD:05');
});

test('번호 지우기는 자동 이름으로 되돌리고 목록에서 뺀다', async () => {
    const p = page({ board: 7 });
    await p.element('connectButton').click();
    assert.deepEqual(p.registry().map(entry => entry.board), [7]);
    await p.element('clearButton').click();
    assert.equal(p.commands.at(-1), 'CLEAR_BOARD');
    assert.equal(p.element('currentName').textContent, 'PicoEnv-A3F1');
    assert.match(p.element('result').textContent, /번호를 지웠습니다/);
    assert.deepEqual(p.registry(), []);
    assert.equal(p.element('clearButton').disabled, true);
});

test('예전 펌웨어는 새 main.py 를 올리라고 안내하고 연결을 정리한다', async () => {
    const p = page({ firmware: 'old' });
    await p.element('connectButton').click();
    assert.match(p.element('status').textContent, /보드 정보 읽기 실패: .*예전 펌웨어.*새 main.py/);
    assert.equal(p.device.gatt.connected, false);
    assert.equal(p.element('boardPanel').hidden, true);
});

test('보드가 답하지 않으면 시간 초과를 알린다', async () => {
    const p = page();
    await p.element('connectButton').click();
    p.state.silent = true;
    const saving = p.element('saveButton').click();
    await new Promise(resolve => setImmediate(resolve));
    p.timers.filter(Boolean).at(-1)();
    await saving;
    assert.match(p.element('status').textContent, /보드가 답하지 않습니다/);
    assert.equal(p.element('saveButton').disabled, false);
});

test('LED 깜빡이기, 목록 내보내기·비우기, 페이지를 떠날 때 연결 끊기', async () => {
    const p = page({ board: 4 });
    await p.element('connectButton').click();
    await p.element('identifyButton').click();
    assert.equal(p.commands.at(-1), 'IDENTIFY');
    p.element('exportButton').click();
    assert.ok(p.blobs[0].includes('04,PicoEnv-04,E66141A3F1,'));
    assert.equal(p.links[0].download, 'pico-board-numbers.csv');
    p.element('forgetButton').click();
    assert.deepEqual(p.registry(), []);
    assert.equal(p.element('exportButton').disabled, true);
    p.listeners.pagehide();
    assert.equal(p.device.gatt.connected, false);
});

test('블루투스를 지원하지 않는 브라우저는 처음부터 알려 준다', async () => {
    const p = page({ supported: false });
    assert.match(p.element('status').textContent, /지원하지 않습니다/);
    await p.element('connectButton').click();
    assert.match(p.element('status').textContent, /크롬·엣지/);
});
