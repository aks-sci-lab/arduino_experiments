// 선생님용: Pico 보드에 번호를 정해 블루투스 이름을 PicoEnv-07 처럼 바꾸는 페이지.
// 펌웨어 명령: GET_BOARD, SET_BOARD:NN, CLEAR_BOARD, IDENTIFY (firmware/pico2w-environment/README.md 참고)
(function (root) {
    'use strict';

    const SERVICE = '19b10000-e8f2-537e-4f6c-d104768a1214';
    const TX = '19b10001-e8f2-537e-4f6c-d104768a1214';
    const CMD = '19b10002-e8f2-537e-4f6c-d104768a1214';
    const STORAGE_KEY = 'board_setup_registry';
    const MAX_BOARD = 99;

    // ---------- 계산만 하는 함수 (시험하기 쉽게 분리) ----------

    function pad(number) {
        return String(number).padStart(2, '0');
    }

    function parseNumber(text) {
        const value = String(text ?? '').trim();
        if (!/^\d{1,2}$/.test(value)) return null;
        const number = Number(value);
        return number >= 1 && number <= MAX_BOARD ? number : null;
    }

    function validatePacket(packet) {
        const data = packet && packet.data;
        if (!packet || packet.type !== 'board' || !data
            || typeof data.name !== 'string' || !data.name.startsWith('PicoEnv-')
            || typeof data.id !== 'string' || !/^[0-9A-F]+$/.test(data.id)
            || !(data.board === null || (Number.isInteger(data.board) && data.board >= 1 && data.board <= MAX_BOARD))
            || !Number.isSafeInteger(packet.ts) || !Number.isSafeInteger(packet.seq)) {
            throw new Error('보드 정보 형식이 올바르지 않습니다. 최신 main.py 를 올렸는지 확인하세요.');
        }
        return packet;
    }

    function cleanRegistry(value) {
        if (!Array.isArray(value)) return [];
        return value.filter(entry => entry && typeof entry.id === 'string'
            && Number.isInteger(entry.board) && entry.board >= 1 && entry.board <= MAX_BOARD);
    }

    // 아직 쓰지 않은 가장 작은 번호. 다 찼으면 null.
    function nextFree(registry) {
        const used = new Set(registry.map(entry => entry.board));
        for (let number = 1; number <= MAX_BOARD; number++) {
            if (!used.has(number)) return number;
        }
        return null;
    }

    // 같은 번호를 이미 쓰는 "다른" 보드를 찾는다.
    function conflict(registry, id, board) {
        return registry.find(entry => entry.board === board && entry.id !== id) || null;
    }

    // 한 보드(칩 고유 번호)에는 한 줄만 남긴다. board 가 null 이면 그 보드를 목록에서 뺀다.
    function upsert(registry, id, board, savedAt) {
        const rest = registry.filter(entry => entry.id !== id);
        if (board !== null) rest.push({ id, board, name: 'PicoEnv-' + pad(board), savedAt });
        return rest.sort((a, b) => a.board - b.board);
    }

    function toCsv(registry) {
        const rows = [['번호', '블루투스 이름', '칩 고유 번호', '저장한 때']];
        for (const entry of registry) rows.push([pad(entry.board), entry.name, entry.id, entry.savedAt || '']);
        return '﻿' + rows.map(row => row.join(',')).join('\r\n') + '\r\n';
    }

    function friendlyError(error) {
        const message = String(error && error.message || error).replace(/^Pico: /, '');
        if (message === 'Unknown command') {
            return '이 보드에는 예전 펌웨어가 들어 있어 번호를 정할 수 없습니다. 새 main.py 를 보드에 올린 뒤 다시 연결하세요.';
        }
        return message;
    }

    // ---------- 화면 ----------

    function init(doc, env) {
        const $ = id => doc.getElementById(id);
        const status = $('status');
        const connectButton = $('connectButton');
        const disconnectButton = $('disconnectButton');
        const boardPanel = $('boardPanel');
        const currentName = $('currentName');
        const chipId = $('chipId');
        const numberInput = $('numberInput');
        const saveButton = $('saveButton');
        const clearButton = $('clearButton');
        const identifyButton = $('identifyButton');
        const result = $('result');
        const registryBody = $('registryBody');
        const registryEmpty = $('registryEmpty');
        const exportButton = $('exportButton');
        const forgetButton = $('forgetButton');

        let device = null, tx = null, cmd = null;
        let connecting = false, pageLeaving = false;
        let pending = null;       // 보드의 답을 기다리는 요청 { resolve, reject, timer }
        let board = null;         // 마지막으로 받은 보드 정보 { name, board, id, fw }
        let registry = loadRegistry();

        function loadRegistry() {
            try { return cleanRegistry(JSON.parse(env.localStorage.getItem(STORAGE_KEY) || '[]')); }
            catch (error) { return []; }
        }
        function saveRegistry() {
            try { env.localStorage.setItem(STORAGE_KEY, JSON.stringify(registry)); return true; }
            catch (error) { return false; }
        }

        function renderRegistry() {
            registryBody.innerHTML = '';
            for (const entry of registry) {
                const row = registryBody.insertRow();
                for (const text of [pad(entry.board), entry.name, entry.id, (entry.savedAt || '').slice(0, 10)]) {
                    row.insertCell().textContent = text;
                }
            }
            registryEmpty.hidden = registry.length > 0;
            exportButton.disabled = registry.length === 0;
            forgetButton.disabled = registry.length === 0;
        }

        function setBusy(busy) {
            const connected = Boolean(device && device.gatt.connected && board);
            saveButton.disabled = busy || !connected;
            clearButton.disabled = busy || !connected || board.board === null;
            identifyButton.disabled = busy || !connected;
            numberInput.disabled = busy || !connected;
        }

        function showBoard(suggest) {
            boardPanel.hidden = false;
            currentName.textContent = board.name;
            chipId.textContent = board.id;
            if (suggest) {
                const known = registry.find(entry => entry.id === board.id);
                const number = board.board ?? (known ? known.board : nextFree(registry));
                numberInput.value = number === null ? '' : pad(number);
            }
            setBusy(false);
        }

        function settle(error, packet) {
            if (!pending) return false;
            const request = pending;
            pending = null;
            env.clearTimeout(request.timer);
            if (error) request.reject(error); else request.resolve(packet);
            return true;
        }

        const receiver = new env.EnvironmentProtocol.Receiver(
            packet => { settle(null, packet); },
            error => {
                const shown = new Error(friendlyError(error));
                if (!settle(shown)) status.textContent = '보드 오류: ' + shown.message;
            },
            validatePacket
        );
        const notification = event => receiver.push(event.target.value);

        async function send(command) {
            if (!device || !device.gatt.connected || !cmd) throw new Error('보드와 연결이 끊겼습니다. 다시 연결하세요.');
            await cmd.writeValueWithResponse(new TextEncoder().encode(command));
        }

        // 명령을 보내고 보드의 답(보드 정보 또는 오류)을 기다린다.
        function request(command) {
            if (pending) return Promise.reject(new Error('앞의 요청이 아직 끝나지 않았습니다.'));
            const answer = new Promise((resolve, reject) => {
                pending = {
                    resolve, reject,
                    timer: env.setTimeout(() => settle(new Error('보드가 답하지 않습니다. 다시 연결해 보세요.')), 5000)
                };
            });
            return send(command).then(() => answer, error => { settle(error); return answer; });
        }

        function cleanConnection() {
            settle(new Error('보드와 연결이 끊겼습니다.'));
            if (tx) tx.removeEventListener('characteristicvaluechanged', notification);
            if (device) {
                device.removeEventListener('gattserverdisconnected', disconnected);
                if (device.gatt.connected) device.gatt.disconnect();
            }
            device = null; tx = null; cmd = null; board = null;
            receiver.reset();
            boardPanel.hidden = true;
            connectButton.style.display = '';
            disconnectButton.style.display = 'none';
            setBusy(false);
        }

        function disconnected() {
            cleanConnection();
            status.textContent = '연결이 끊겼습니다. 다음 보드를 연결할 수 있습니다.';
        }

        connectButton.addEventListener('click', async () => {
            if (connecting) return;
            if (!env.navigator.bluetooth) {
                status.textContent = '이 브라우저는 블루투스 연결을 지원하지 않습니다. PC 나 안드로이드의 크롬·엣지를 쓰세요.';
                return;
            }
            connecting = true;
            connectButton.disabled = true;
            cleanConnection();
            result.hidden = true;
            status.textContent = '목록에서 PicoEnv 로 시작하는 이름을 고르세요. 보드는 한 번에 하나만 켜 두면 헷갈리지 않습니다.';
            let stage = '장치 선택';
            try {
                const selected = await env.navigator.bluetooth.requestDevice({
                    filters: [{ namePrefix: 'PicoEnv-' }], optionalServices: [SERVICE]
                });
                if (pageLeaving) throw new Error('페이지를 떠나 연결을 취소했습니다.');
                device = selected;
                stage = '연결';
                status.textContent = '연결 중: ' + selected.name;
                await env.PicoBLE.discover(
                    selected, SERVICE, [TX, CMD],
                    attempt => { status.textContent = `연결 다시 시도 ${attempt}/2 (${stage})`; },
                    {
                        isCancelled: () => pageLeaving || device !== selected,
                        cleanup: () => {
                            settle(new Error('연결을 다시 시도합니다.'));
                            if (tx) tx.removeEventListener('characteristicvaluechanged', notification);
                            tx = null; cmd = null;
                            receiver.reset();
                        },
                        prepare: async characteristics => {
                            [tx, cmd] = characteristics;
                            stage = '알림 등록';
                            tx.addEventListener('characteristicvaluechanged', notification);
                            await tx.startNotifications();
                            stage = '측정 멈춤';
                            await send('STOP');
                        }
                    }
                );
                selected.addEventListener('gattserverdisconnected', disconnected);
                stage = '보드 정보 읽기';
                const packet = await request('GET_BOARD');
                board = packet.data;
                connectButton.style.display = 'none';
                disconnectButton.style.display = '';
                if (board.board !== null) {
                    registry = upsert(registry, board.id, board.board, new Date().toISOString());
                    saveRegistry();
                    renderRegistry();
                    status.textContent = `연결됨: ${board.name} — 이미 ${pad(board.board)}번으로 정해진 보드입니다. LED 가 깜빡인 보드가 맞는지 확인하세요.`;
                } else {
                    status.textContent = `연결됨: ${board.name} — 아직 번호가 없는 보드입니다. LED 가 깜빡인 보드가 맞는지 확인하세요.`;
                }
                showBoard(true);
            } catch (error) {
                cleanConnection();
                status.textContent = error.name === 'NotFoundError'
                    ? '장치를 고르지 않았습니다.'
                    : `${stage} 실패: ${friendlyError(error)}`;
            } finally {
                connecting = false;
                connectButton.disabled = false;
            }
        });

        disconnectButton.addEventListener('click', disconnected);

        async function change(command, number) {
            setBusy(true);
            result.hidden = true;
            status.textContent = '보드에 저장하는 중…';
            try {
                const packet = await request(command);
                board = packet.data;
                if (board.board !== number) throw new Error('보드가 다른 번호를 돌려주었습니다. 다시 시도하세요.');
                registry = upsert(registry, board.id, board.board, new Date().toISOString());
                const remembered = saveRegistry();
                renderRegistry();
                result.hidden = false;
                result.textContent = number === null
                    ? `번호를 지웠습니다. 이 보드는 다시 ${board.name} 로 보입니다. 스티커를 떼세요.`
                    : `저장했습니다. 이 보드의 이름은 이제 ${board.name} 입니다. 보드에 "${pad(number)}" 스티커를 붙이세요.`;
                status.textContent = '새 이름은 연결을 끊은 뒤부터 목록에 보입니다. [연결 끊기]를 누르고 다음 보드를 연결하세요.'
                    + (remembered ? '' : ' (이 브라우저에 번호 목록을 저장하지 못했습니다.)');
                showBoard(false);
            } catch (error) {
                status.textContent = '저장하지 못했습니다: ' + friendlyError(error);
                if (device && device.gatt.connected && board) setBusy(false);
            }
        }

        saveButton.addEventListener('click', () => {
            const number = parseNumber(numberInput.value);
            if (number === null) {
                status.textContent = '번호는 1부터 99까지의 숫자로 적으세요.';
                return;
            }
            const other = conflict(registry, board.id, number);
            if (other && !env.confirm(`${pad(number)}번은 이미 다른 보드(${other.id})에 정해 두었습니다. 같은 번호가 두 개 생기면 학생이 헷갈립니다. 그래도 저장할까요?`)) {
                return;
            }
            return change('SET_BOARD:' + pad(number), number);
        });

        clearButton.addEventListener('click', () => {
            if (!env.confirm('이 보드의 번호를 지우고 자동 이름(PicoEnv-XXXX)으로 되돌릴까요?')) return;
            return change('CLEAR_BOARD', null);
        });

        identifyButton.addEventListener('click', async () => {
            try {
                await send('IDENTIFY');
                status.textContent = '보드의 LED 가 몇 초 동안 깜빡입니다.';
            } catch (error) {
                status.textContent = friendlyError(error);
            }
        });

        exportButton.addEventListener('click', () => {
            const blob = new env.Blob([toCsv(registry)], { type: 'text/csv;charset=utf-8' });
            const url = env.URL.createObjectURL(blob);
            const link = doc.createElement('a');
            link.href = url;
            link.download = 'pico-board-numbers.csv';
            link.click();
            env.URL.revokeObjectURL(url);
        });

        forgetButton.addEventListener('click', () => {
            if (!env.confirm('이 브라우저에 기억해 둔 번호 목록을 지울까요? 보드에 저장된 번호는 그대로 남습니다.')) return;
            registry = [];
            saveRegistry();
            renderRegistry();
        });

        env.addEventListener('pagehide', () => { pageLeaving = true; cleanConnection(); });

        if (!env.navigator.bluetooth) {
            status.textContent = '이 브라우저는 블루투스 연결을 지원하지 않습니다. PC 나 안드로이드의 크롬·엣지를 쓰세요.';
        }
        renderRegistry();
        setBusy(false);
    }

    const api = { init, pad, parseNumber, validatePacket, cleanRegistry, nextFree, conflict, upsert, toCsv, friendlyError, STORAGE_KEY };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        root.BoardSetup = api;
        if (root.document) root.document.addEventListener('DOMContentLoaded', () => init(root.document, root));
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
