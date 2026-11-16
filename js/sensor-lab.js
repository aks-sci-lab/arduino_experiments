document.addEventListener('DOMContentLoaded', () => {
    'use strict';
    const mode = document.body.dataset.sensor;
    if (mode === 'environment') return; // 합친 환경 페이지의 온도·습도·기압·VOC 화면
    const config = SensorDefinitions.definitions[mode];
    if (!config) throw new Error('지원하지 않는 센서 페이지입니다.');
    const displayFields = config.fields.filter(([key]) => key === config.key);
    const element = id => document.getElementById(id);
    const status = element('status');
    const connectButton = element('connectButton');
    const disconnectButton = element('disconnectButton');
    const recordButton = element('recordButton');
    const rate = element('samplingRateSelect');
    const downloadButton = element('downloadButton');
    const saveButton = element('saveTrialButton');
    const tbody = element('historyTbody');
    const trialsList = element('trialList');
    const storageKey = `${mode}_sensor_trials`;
    const SERVICE = '19b10000-e8f2-537e-4f6c-d104768a1214';
    const TX = '19b10001-e8f2-537e-4f6c-d104768a1214';
    const CMD = '19b10002-e8f2-537e-4f6c-d104768a1214';
    let device = null, tx = null, cmd = null;
    let recording = false, samples = [], firstTimestamp = null, lastSampleAt = null;
    let trials = [];
    let share = null;                        // 조 공유 (조도·자외선만, js/environment-share.js)
    const hiddenIncoming = new Set();        // 그래프에서 끈 📥 불러온 회차
    const INCOMING_COLORS = ['#e8590c', '#2f9e44', '#9c36b5', '#c2255c', '#0c8599', '#5c940d'];
    let connecting = false;
    let receivedSample = false;
    let pageLeaving = false;
    let setupFailure = null;
    let connectionStage = '';
    let vocProcessor = null;
    const receiverSupported = EnvironmentProtocol.version === 'multi-sensor-v2';

    document.title = config.title + ' | 센서 기반 실험실';
    element('pageTitle').textContent = config.title;
    element('description').textContent = config.description;
    const readouts = new Map();
    for (const [key, label, unit] of displayFields) {
        const box = document.createElement('div');
        box.className = 'sensor-readout';
        const title = document.createElement('h3');
        title.textContent = label;
        const value = document.createElement('p');
        value.textContent = '-- ' + unit;
        box.append(title, value);
        element('readouts').appendChild(box);
        readouts.set(key, value);
        const th = document.createElement('th');
        th.textContent = `${label} (${unit})`;
        element('tableHead').appendChild(th);
    }
    if (mode === 'voc') {
        rate.value = '1000';
        rate.disabled = true;
    }
    const chart = new Chart(element('chart'), {
        type: 'scatter',
        data: { datasets: [{ label: `${config.title} (${config.unit})`, data: [], showLine: true, borderColor: '#007bff' }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { type: 'linear', title: { display: true, text: '시간 (s)' } },
                y: { title: { display: true, text: config.unit } }
            }
        }
    });
    const receiver = new EnvironmentProtocol.Receiver(
        handleSample, fail, packet => SensorDefinitions.validate(mode, packet)
    );
    window.addEventListener('pagehide', () => {
        pageLeaving = true;
        cleanConnection();
    });
    window.addEventListener('pageshow', () => {
        pageLeaving = false;
    });

    try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed) || !parsed.every(trial =>
                trial && typeof trial.name === 'string' && Array.isArray(trial.data)
                && trial.data.every(point => {
                    SensorDefinitions.validate(mode, point);
                    return Number.isFinite(point.time) && point.time >= 0;
                })
            )) throw new Error('저장된 회차 형식이 올바르지 않습니다.');
            // 조 공유에서 회차를 구분하려고 번호를 붙인다 (예전 회차는 없음)
            let fixed = false;
            parsed.forEach((trial, i) => { if (!/^[A-Za-z0-9_-]{1,30}$/.test(trial.id || '')) { trial.id = `t${Date.now().toString(36)}${i}`; fixed = true; } });
            trials = parsed;
            if (fixed) localStorage.setItem(storageKey, JSON.stringify(trials));
        }
    } catch (error) {
        console.error('Load sensor trials failed:', error);
        alert('로컬 회차 불러오기 실패: ' + error.message);
    }
    renderTrials();
    function updateButtons() {
        downloadButton.disabled = recording || samples.length === 0;
        saveButton.disabled = recording || samples.length === 0;
        recordButton.disabled = connecting || !device?.gatt.connected || !receivedSample;
        recordButton.textContent = recording ? '측정 중지' : '측정 시작';
    }

    function endRecording() {
        const was = recording;
        recording = false;
        updateButtons();
        if (was) shareStep();
    }
    function shareStep() { if (share) share.stepChanged(); }

    function cleanConnection() {
        const previous = device;
        previous?.removeEventListener('gattserverdisconnected', disconnected);
        tx?.removeEventListener('characteristicvaluechanged', notification);
        device = null; tx = null; cmd = null; lastSampleAt = null; receivedSample = false;
        receiver.reset();
        vocProcessor?.reset();
        if (mode === 'voc') readouts.get(config.key).textContent = '-- Index';
        endRecording();
        if (previous?.gatt.connected) previous.gatt.disconnect();
        connectButton.style.display = '';
        disconnectButton.style.display = 'none';
    }

    function disconnected() {
        cleanConnection();
        status.textContent = '연결 해제됨 — 측정 데이터는 보존됩니다.';
        shareStep();
    }

    function fail(error) {
        if (connecting) setupFailure = error;
        console.error('Pico sensor error:', error);
        cleanConnection();
        status.textContent = '센서 오류: ' + error.message;
    }

    async function sendCommand(command) {
        if (!device?.gatt.connected || !cmd) throw new Error('Pico 연결이 해제되었습니다.');
        await cmd.writeValueWithResponse(new TextEncoder().encode(command));
    }

    connectButton.addEventListener('click', async () => {
        if (connecting) return;
        connecting = true;
        connectButton.disabled = true;
        cleanConnection();
        status.textContent = '장치 선택 — 다른 실험의 연결을 먼저 해제하세요.';
        setupFailure = null;
        connectionStage = '장치 선택';
        try {
            const selected = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'PicoEnv-' }], optionalServices: [SERVICE]
            });
            if (pageLeaving) throw new Error('페이지 이동으로 연결을 취소했습니다.');
            device = selected;
            if (mode === 'voc') {
                connectionStage = 'VOC 알고리즘 준비';
                if (typeof VOCIndex === 'undefined') throw new Error('VOC 알고리즘 코드가 없습니다. 페이지를 새로고침하세요.');
                if (!vocProcessor) vocProcessor = await VOCIndex.create();
                vocProcessor.reset();
                if (pageLeaving || device !== selected) throw new Error('페이지 이동으로 연결을 취소했습니다.');
            }
            connectionStage = '서비스 검색';
            const ensureSetup = () => {
                if (setupFailure) throw setupFailure;
                if (pageLeaving || device !== selected) {
                    const error = new Error('페이지 이동으로 연결을 취소했습니다.');
                    error.name = 'AbortError';
                    throw error;
                }
                if (!selected.gatt.connected) throw new Error('GATT 연결이 준비 중 해제되었습니다.');
            };
            await PicoBLE.discover(
                selected, SERVICE, [TX, CMD],
                (attempt, error) => {
                    status.textContent = `연결 준비 재시도 ${attempt}/2 (${connectionStage}): ${error.message}`;
                },
                {
                    isCancelled: () => pageLeaving || device !== selected || setupFailure !== null,
                    cleanup: () => {
                        tx?.removeEventListener('characteristicvaluechanged', notification);
                        tx = null; cmd = null;
                        receiver.reset();
                        vocProcessor?.reset();
                        receivedSample = false; lastSampleAt = null;
                    },
                    prepare: async characteristics => {
                        [tx, cmd] = characteristics;
                        connectionStage = '센서 알림 등록';
                        tx.addEventListener('characteristicvaluechanged', notification);
                        await tx.startNotifications();
                        ensureSetup();
                        for (const command of ['STOP', `SET_SENSOR_RATE:${rate.value}`, 'START:' + config.command]) {
                            connectionStage = `명령 ${command}`;
                            ensureSetup();
                            await sendCommand(command);
                            ensureSetup();
                        }
                        lastSampleAt = performance.now();
                    }
                }
            );
            if (pageLeaving || device !== selected) {
                selected.gatt.disconnect();
                throw new Error('페이지 이동으로 연결을 취소했습니다.');
            }
            selected.addEventListener('gattserverdisconnected', disconnected);
            if (!receivedSample) status.textContent = `${selected.name} 연결됨 — 센서 데이터 대기`;
            connectButton.style.display = 'none';
            disconnectButton.style.display = '';
            shareStep();
        } catch (error) {
            fail(setupFailure || new Error(`${connectionStage}: ${error.message}`));
        } finally {
            connecting = false;
            connectButton.disabled = false;
            updateButtons();
        }
    });
    disconnectButton.addEventListener('click', disconnected);
    rate.addEventListener('change', async () => {
        if (!device?.gatt.connected) return;
        rate.disabled = true;
        try {
            await sendCommand(`SET_SENSOR_RATE:${rate.value}`);
        } catch (error) {
            fail(error);
        } finally {
            rate.disabled = mode === 'voc';
        }
    });
    recordButton.addEventListener('click', () => {
        if (recording) {
            endRecording();
            status.textContent = `측정 완료 (${samples.length}개) — 실시간 표시는 계속됩니다.`;
        } else {
            recording = true; samples = []; firstTimestamp = null;
            tbody.innerHTML = '';
            chart.data.datasets[0].data = [];
            chart.update('none');
            status.textContent = '측정 중';
            updateButtons();
            shareStep();
        }
    });

    function notification(event) { receiver.push(event.target.value); }
    function handleSample(packet) {
        let voc = null;
        if (mode === 'voc') {
            voc = vocProcessor.process(packet);
            packet = {
                ...packet, data: { ...packet.data, vocIndex: voc.index },
                vocAlgorithm: voc.algorithm
            };
        }
        receivedSample = true;
        lastSampleAt = performance.now();
        status.textContent = (recording ? '측정 중' : '연결됨 — 실시간 수신 중')
            + (voc?.index === null
                ? ` — VOC Index 준비 중 (${Math.max(packet.data.warmup, voc.learningRemaining, 1)}초 남음)` : '')
            + (voc?.interrupted ? ' — 데이터 누락/주기 변경으로 알고리즘 초기화' : '');
        for (const [key, , unit] of displayFields) {
            const value = packet.data[key];
            readouts.get(key).textContent = value === null ? '-- (준비 중)' : value.toFixed(config.digits) + ' ' + unit;
        }
        if (recording) {
            if (firstTimestamp === null) firstTimestamp = packet.ts;
            const point = { ...packet, time: (packet.ts - firstTimestamp) / 1000 };
            samples.push(point);
            appendRow(point);
            while (tbody.rows.length > 500) tbody.deleteRow(0);
            chart.data.datasets[0].data.push({ x: point.time, y: point.data[config.key] });
            chart.update('none');
        }
        updateButtons();
    }

    function appendRow(point) {
        const row = tbody.insertRow(-1);
        const values = [point.time.toFixed(3), ...displayFields.map(([key]) => point.data[key] ?? '—')];
        for (const value of values) row.insertCell(-1).textContent = String(value);
    }

    setInterval(() => {
        if (device?.gatt.connected && lastSampleAt !== null && performance.now() - lastSampleAt > 15000) {
            fail(new Error('15초 동안 센서 데이터가 없습니다. Pico 셸과 최신 펌웨어를 확인하세요.'));
        }
    }, 1000);

    function persist(next) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(next));
            trials = next;
            renderTrials();
            shareStep();
        } catch (error) {
            console.error('Save sensor trials failed:', error);
            alert('로컬 회차 저장 실패: ' + error.message);
        }
    }

    saveButton.addEventListener('click', () => {
        const name = prompt('회차 이름', `${config.title} ${new Date().toLocaleString()}`);
        if (name) persist([...trials, { id: `t${Date.now().toString(36)}`, name, data: JSON.parse(JSON.stringify(samples)) }]);
    });
    element('clearTrialsButton').addEventListener('click', () => {
        if (confirm('저장된 회차를 모두 삭제할까요?')) persist([]);
    });
    function renderTrials() {
        trialsList.innerHTML = '';
        trials.forEach((trial, index) => {
            const li = document.createElement('li');
            const label = document.createElement('span');
            label.textContent = `${trial.name} (${trial.data.length}개) `;
            const view = document.createElement('button');
            view.textContent = '불러오기';
            view.addEventListener('click', () => {
                if (recording) return alert('측정을 먼저 중지하세요.');
                samples = JSON.parse(JSON.stringify(trial.data));
                tbody.innerHTML = '';
                samples.slice(-500).forEach(appendRow);
                chart.data.datasets[0].data = samples.map(point => ({ x: point.time, y: point.data[config.key] ?? null }));
                chart.update('none');
                updateButtons();
                status.textContent = `회차 불러옴: ${trial.name}`
                    + (mode === 'voc' && samples.some(point => !('vocIndex' in point.data))
                        ? ' — 이전 SRAW 회차에는 VOC Index가 없습니다. 원시 값은 CSV에서 확인하세요.' : '');
            });
            const remove = document.createElement('button');
            remove.textContent = '삭제';
            remove.addEventListener('click', () => {
                if (confirm(`'${trial.name}' 회차를 삭제할까요?`)) persist(trials.filter((_, i) => i !== index));
            });
            li.append(label, view, remove);
            trialsList.appendChild(li);
        });
        // 📥 같은 조 다른 노트북에서 불러온 회차: 그래프에 겹쳐 그림 (지우기는 조 공유 칸의 '불러온 값 지우기')
        if (share) share.list().forEach(item => {
            const li = document.createElement('li');
            li.className = 'incoming';
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !hiddenIncoming.has(item.key);
            cb.addEventListener('change', () => {
                if (cb.checked) hiddenIncoming.delete(item.key); else hiddenIncoming.add(item.key);
                drawIncoming();
            });
            label.append(cb, ` ${item.name} (${item.n}개)`);
            li.append(label);
            trialsList.appendChild(li);
        });
    }
    // 그래프: 0번은 내 측정, 그 뒤는 보이게 고른 📥 불러온 회차
    function drawIncoming() {
        const mine = chart.data.datasets[0];
        const extra = share ? share.list().filter(item => !hiddenIncoming.has(item.key)).map((item, i) => ({
            label: item.name, showLine: true, borderColor: INCOMING_COLORS[i % INCOMING_COLORS.length], pointRadius: 1,
            data: item.points.map(point => ({ x: point.time, y: point.data[config.key] ?? null }))
        })) : [];
        chart.data.datasets = [mine, ...extra];
        chart.options.plugins = { ...(chart.options.plugins || {}), legend: { display: extra.length > 0 } };
        chart.update('none');
    }
    downloadButton.addEventListener('click', () => {
        const columns = ['Time (s)', ...config.fields.map(([, label, unit]) => `${label} (${unit})`), 'Pico timestamp (ms)'];
        const rows = samples.map(point => [point.time, ...config.fields.map(([key]) => point.data[key]), point.ts]);
        if (mode === 'voc') {
            columns.push('VOC algorithm');
            rows.forEach((row, index) => row.push(samples[index].vocAlgorithm || ''));
        }
        const blob = new Blob(['\uFEFF' + [columns, ...rows].map(row => row.join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `${mode}_${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    });
    // 조 공유 (조도·자외선): 저장한 회차 + 지금 측정을 보내고, 같은 조 다른 노트북 회차를 📥 로 받아 그래프에 겹쳐 그린다
    if ((mode === 'light' || mode === 'uv') && typeof EnvironmentShare !== 'undefined') {
        const keys = config.fields.map(([key]) => key);
        const csvHeaders = { 'Time (s)': 'time' };
        config.fields.forEach(([key, label, unit]) => { csvHeaders[`${label} (${unit})`] = key; });
        const digits = { time: 3 };
        digits[config.key] = config.digits;
        share = EnvironmentShare.attach({
            exp: mode,
            csvHint: '맨 위 CSV 저장',
            cols: ['time', ...keys], digits,
            get: (point, col) => col === 'time' ? point.time : point.data[col],
            summary: points => EnvironmentShare.summarySingle(points.map(point => ({ time: point.time, [config.key]: point.data[config.key] })), config.key, config.unit, config.digits),
            toPoint: o => { const data = {}; keys.forEach(key => { data[key] = o[key]; }); return { time: o.time, data }; },
            mine: () => [...trials.map(trial => ({ id: trial.id, title: trial.name, points: trial.data })), { id: 'current', title: '현재 측정', points: samples }],
            csvHeaders,
            onChange: () => { renderTrials(); drawIncoming(); },
            getStep: () => (recording || device?.gatt.connected) ? 'live' : (samples.length || trials.length ? 'record' : 'more'),
            getPoints: () => samples.length + trials.reduce((n, trial) => n + trial.data.length, 0)
        });
        if (share) { renderTrials(); drawIncoming(); }
    }
    if (!receiverSupported) {
        connectButton.disabled = true;
        status.textContent = '이전 BLE 수신 코드가 로드되었습니다. Ctrl+Shift+R로 새로고침하거나 최신 페이지 링크로 접속하세요.';
    } else if (!window.isSecureContext || !navigator.bluetooth) {
        connectButton.disabled = true;
        status.textContent = 'HTTPS의 PC/Android Chrome·Edge와 Bluetooth가 필요합니다. iPhone Safari는 미지원입니다.';
    }
    updateButtons();
});
