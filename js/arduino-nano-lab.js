// 아두이노 Nano 33 BLE Sense Rev2 센서 실험 페이지 (projects/arduino-nano-lab.html)
(function () {
    'use strict';
    const N = window.NanoSense;
    const $ = id => document.getElementById(id);
    const statusBox = $('status');
    const connectButton = $('connectButton');
    const disconnectButton = $('disconnectButton');
    const identifyButton = $('identifyButton');
    const boardInfo = $('boardInfo');
    const rateSelect = $('rateSelect');
    const startButton = $('startButton');
    const stopButton = $('stopButton');
    const csvButton = $('csvButton');
    const clearButton = $('clearButton');
    const countText = $('countText');
    const readouts = $('readouts');
    const chartsBox = $('charts');
    const modeNote = $('modeNote');
    const tabs = [$('tabImu'), $('tabEnv')];

    const MODE_NOTES = {
        imu: '가속도 센서(BMI270): x·y·z 세 방향과 크기 |a| 를 g 단위로 보여 줍니다 (1 g ≈ 9.8 m/s²). 범위 ±16 g, 최대 100 Hz.',
        env: '환경 센서: 온도·습도(HS3003), 기압(LPS22HB, kPa). 온도는 보드 열 때문에 실제보다 조금 높게 나올 수 있습니다.'
    };

    let mode = 'imu';
    let device = null;
    let txCharacteristic = null;
    let cmdCharacteristic = null;
    let accelCharacteristic = null;
    let connecting = false;
    let recording = false;
    let lastSampleAt = null;
    let staleShown = false;
    let firstEnvTs = null;
    let fullNotified = false;
    let chartScheduled = false;
    const samples = { imu: [], env: [] };
    const rates = { imu: N.MODES.imu.defaultRate, env: N.MODES.env.defaultRate };
    const charts = {};

    const accelReceiver = new AccelerometerProtocol.Receiver();
    const textReceiver = new EnvironmentProtocol.Receiver(handlePacket, reportBoardError,
        N.makeValidator(EnvironmentProtocol.validateSample));

    function setStatus(text, kind = '') {
        statusBox.textContent = text;
        statusBox.className = 'dash-status' + (kind ? ' ' + kind : '');
    }

    function connected() {
        return !!(device && device.gatt && device.gatt.connected && cmdCharacteristic);
    }

    function updateButtons() {
        const isConnected = connected();
        connectButton.style.display = isConnected ? 'none' : '';
        connectButton.disabled = connecting;
        disconnectButton.style.display = isConnected ? '' : 'none';
        identifyButton.style.display = isConnected ? '' : 'none';
        startButton.disabled = !isConnected || recording;
        stopButton.disabled = !recording;
        rateSelect.disabled = recording;
        tabs.forEach(tab => { tab.disabled = recording; });
        csvButton.disabled = recording || samples[mode].length === 0;
        clearButton.disabled = recording || samples[mode].length === 0;
        const count = samples[mode].length;
        countText.textContent = count ? `기록된 측정: ${count.toLocaleString('ko-KR')}개` + (count >= N.MAX_SAMPLES ? ' (최대 개수에 도달해 기록을 멈췄습니다)' : '') : '';
    }

    function buildReadouts() {
        readouts.innerHTML = '';
        for (const field of N.MODES[mode].fields) {
            // 공통 큰 숫자 카드 (css/lab-base.css 의 .dash-card)
            const box = document.createElement('div');
            box.className = 'dash-card';
            const name = document.createElement('span');
            name.className = 'label';
            name.textContent = field.label;
            const value = document.createElement('span');
            value.className = 'value num';
            value.id = 'value-' + field.key;
            value.textContent = '--';
            const unit = document.createElement('span');
            unit.className = 'unit';
            unit.textContent = field.unit;
            box.append(name, value, unit);
            readouts.appendChild(box);
        }
        const last = samples[mode][samples[mode].length - 1];
        if (last) showValues(last);
    }

    function showValues(sample) {
        for (const field of N.MODES[mode].fields) {
            const element = $('value-' + field.key);
            if (element && Number.isFinite(sample[field.key])) element.textContent = sample[field.key].toFixed(field.digits);
        }
    }

    function buildRateOptions() {
        rateSelect.innerHTML = '';
        for (const item of N.MODES[mode].rates) {
            const option = document.createElement('option');
            option.value = String(item.value);
            option.textContent = item.label;
            rateSelect.appendChild(option);
        }
        rateSelect.value = String(rates[mode]);
    }

    function chartGroups() {
        // 가속도는 한 그래프에 네 줄, 환경은 단위가 달라 값마다 그래프 하나씩
        const fields = N.MODES[mode].fields;
        return mode === 'imu' ? [fields] : fields.map(field => [field]);
    }

    function buildCharts() {
        for (const key of Object.keys(charts)) { charts[key].destroy(); delete charts[key]; }
        chartsBox.innerHTML = '';
        // 환경은 그래프가 셋이라 오른쪽 칸에 작게 쌓는다
        chartsBox.classList.toggle('multi', chartGroups().length > 1);
        if (typeof Chart === 'undefined') {
            chartsBox.textContent = '그래프 프로그램(Chart.js)을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침하세요. 값과 CSV 저장은 그대로 됩니다.';
            return;
        }
        chartGroups().forEach((fields, index) => {
            const box = document.createElement('div');
            box.className = 'dash-chart';
            const canvas = document.createElement('canvas');
            canvas.setAttribute('aria-label', fields.map(field => field.label).join(', ') + ' 시간 그래프');
            box.appendChild(canvas);
            chartsBox.appendChild(box);
            const unit = fields[0].unit;
            charts[index] = new Chart(canvas, {
                type: 'line',
                data: {
                    datasets: fields.map(field => ({
                        label: `${field.label} (${field.unit})`, data: [], borderColor: field.color,
                        backgroundColor: field.color, borderWidth: 1.5, pointRadius: 0, fieldKey: field.key
                    }))
                },
                options: {
                    animation: false, responsive: true, maintainAspectRatio: false, parsing: false,
                    interaction: { mode: 'nearest', intersect: false },
                    scales: {
                        x: { type: 'linear', title: { display: true, text: '시간 (s)' } },
                        y: { title: { display: true, text: unit } }
                    }
                }
            });
        });
        drawCharts();
    }

    function drawCharts() {
        chartScheduled = false;
        const points = N.thin(samples[mode]);
        for (const chart of Object.values(charts)) {
            for (const dataset of chart.data.datasets) {
                dataset.data = points.map(sample => ({ x: sample.time, y: sample[dataset.fieldKey] }));
            }
            chart.update('none');
        }
    }

    function scheduleCharts() {
        if (chartScheduled) return;
        chartScheduled = true;
        (window.requestAnimationFrame || (callback => setTimeout(callback, 50)))(drawCharts);
    }

    function selectMode(next) {
        if (recording || next === mode || !N.MODES[next]) return;
        mode = next;
        tabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.mode === mode)));
        modeNote.textContent = MODE_NOTES[mode];
        buildRateOptions();
        buildReadouts();
        buildCharts();
        updateButtons();
    }

    function addSample(kind, sample) {
        if (!recording || kind !== mode) return;
        lastSampleAt = Date.now();
        if (staleShown) {
            staleShown = false;
            setStatus(`측정 중: ${device ? device.name : ''} — 값이 다시 들어옵니다.`);
        }
        const list = samples[kind];
        if (list.length >= N.MAX_SAMPLES) {
            if (!fullNotified) {
                fullNotified = true;
                stopRecording('기록할 수 있는 최대 개수(' + N.MAX_SAMPLES.toLocaleString('ko-KR') + '개)에 도달해 측정을 멈췄습니다. CSV 로 저장한 뒤 지우고 다시 시작하세요.', 'warn');
            }
            return;
        }
        list.push(sample);
        showValues(sample);
        scheduleCharts();
        if (list.length % 25 === 0 || kind === 'env') updateButtons();
    }

    function handlePacket(packet) {
        if (packet.type === 'board') {
            const data = packet.data;
            const range = data.accelRange === 16 ? ' · 가속도 ±16 g 확인됨' : data.accelRange === 0 ? ' · ⚠️ 가속도 범위를 ±16 g 로 바꾸지 못함' : '';
            boardInfo.textContent = `보드: ${data.name} · 칩 주소 ${data.id || '?'} · 펌웨어 ${data.fw}${range}`;
            return;
        }
        if (firstEnvTs === null) firstEnvTs = packet.ts;
        addSample('env', N.environmentSample(packet, firstEnvTs));
    }

    function handleTextNotification(event) {
        textReceiver.push(event.target.value);
    }

    function handleAccelNotification(event) {
        try {
            for (const sample of accelReceiver.read(event.target.value)) addSample('imu', sample);
        } catch (error) {
            reportBoardError(error);
            accelReceiver.reset();
        }
    }

    function reportBoardError(error) {
        console.error('Nano BLE error:', error);
        if (recording) stopRecording('센서 오류로 측정을 멈췄습니다: ' + N.friendlyError(error), 'error');
        else setStatus('보드 알림: ' + N.friendlyError(error), 'warn');
    }

    async function sendCommand(command) {
        if (!cmdCharacteristic) throw new Error('보드가 연결되어 있지 않습니다.');
        await cmdCharacteristic.writeValueWithResponse(new TextEncoder().encode(command));
    }

    async function connect() {
        if (connecting) return;
        if (!window.isSecureContext) {
            setStatus('블루투스는 https 주소에서만 됩니다. https://aks-sci-lab.web.app 으로 열어 주세요.', 'error');
            return;
        }
        if (!navigator.bluetooth) {
            setStatus('이 브라우저는 웹 블루투스를 지원하지 않습니다. PC·안드로이드의 크롬이나 엣지로 열어 주세요. (아이폰·아이패드·파이어폭스는 안 됩니다)', 'error');
            return;
        }
        connecting = true;
        updateButtons();
        try {
            const chosen = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: N.NAME_PREFIX }],
                optionalServices: [N.SERVICE_UUID]
            });
            device = chosen;
            setStatus(`연결 중: ${chosen.name || '보드'}`);
            await PicoBLE.discover(chosen, N.SERVICE_UUID, [N.TX_UUID, N.CMD_UUID, N.ACCEL_UUID],
                attempt => setStatus(`연결 다시 시도 ${attempt}/2: ${chosen.name || '보드'}`), {
                    isCancelled: () => device !== chosen,
                    cleanup: detachCharacteristics,
                    prepare: async ([tx, cmd, accel]) => {
                        txCharacteristic = tx;
                        cmdCharacteristic = cmd;
                        accelCharacteristic = accel;
                        textReceiver.reset();
                        accelReceiver.reset();
                        tx.addEventListener('characteristicvaluechanged', handleTextNotification);
                        accel.addEventListener('characteristicvaluechanged', handleAccelNotification);
                        await tx.startNotifications();
                        await accel.startNotifications();
                        await sendCommand('STOP');
                        await sendCommand('GET_BOARD');
                    }
                });
            chosen.addEventListener('gattserverdisconnected', onDisconnected);
            setStatus(`연결됨: ${chosen.name || '보드'} — 센서를 고르고 ▶ 측정 시작을 누르세요.`);
        } catch (error) {
            const cancelled = error && error.name === 'NotFoundError';
            if (device && device.gatt.connected) device.gatt.disconnect();
            detachCharacteristics();
            device = null;
            setStatus(cancelled ? '보드를 고르지 않았습니다. 다시 블루투스 연결을 누르세요. 목록에 없으면 보드 전원과 펌웨어를 확인하세요.'
                : '연결 실패: ' + N.friendlyError(error) + ' — 보드 전원을 껐다 켠 뒤 다시 시도하세요.', cancelled ? 'warn' : 'error');
        } finally {
            connecting = false;
            updateButtons();
        }
    }

    function detachCharacteristics() {
        if (txCharacteristic) txCharacteristic.removeEventListener('characteristicvaluechanged', handleTextNotification);
        if (accelCharacteristic) accelCharacteristic.removeEventListener('characteristicvaluechanged', handleAccelNotification);
        txCharacteristic = cmdCharacteristic = accelCharacteristic = null;
    }

    function onDisconnected() {
        const wasRecording = recording;
        recording = false;
        lastSampleAt = null;
        if (device) device.removeEventListener('gattserverdisconnected', onDisconnected);
        detachCharacteristics();
        device = null;
        boardInfo.textContent = '';
        setStatus((wasRecording ? '측정 중에 ' : '') + '블루투스 연결이 끊어졌습니다. 기록은 남아 있습니다. 보드 전원과 거리를 확인하고 다시 연결하세요.', 'warn');
        drawCharts();
        updateButtons();
    }

    function disconnect() {
        if (device && device.gatt.connected) device.gatt.disconnect();
        else onDisconnected();
    }

    async function startRecording() {
        if (!connected() || recording) return;
        startButton.disabled = true;
        const [rateCommand, startCommand] = N.rateCommands(mode, rateSelect.value);
        try {
            await sendCommand('STOP');
            await sendCommand(rateCommand);
            samples[mode] = [];
            firstEnvTs = null;
            fullNotified = false;
            accelReceiver.reset();
            recording = true;
            lastSampleAt = Date.now();
            staleShown = false;
            buildReadouts();
            drawCharts();
            await sendCommand(startCommand);
            setStatus(`측정 중: ${device.name || '보드'} — ${N.MODES[mode].label}`);
        } catch (error) {
            recording = false;
            setStatus('측정을 시작하지 못했습니다: ' + N.friendlyError(error), 'error');
        }
        updateButtons();
    }

    async function stopRecording(message, kind) {
        if (!recording) return;
        recording = false;
        lastSampleAt = null;
        updateButtons();
        drawCharts();
        try {
            if (connected()) await sendCommand('STOP');
        } catch (error) {
            console.warn('STOP failed', error);
        }
        setStatus(message || `측정을 멈췄습니다. ${samples[mode].length.toLocaleString('ko-KR')}개를 기록했습니다. CSV 저장을 누르면 파일로 받을 수 있습니다.`, kind || '');
    }

    function downloadCsv() {
        const list = samples[mode];
        if (!list.length) return;
        const blob = new Blob([N.toCsv(mode, list)], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        link.href = URL.createObjectURL(blob);
        link.download = `nano-${mode === 'imu' ? '가속도' : '환경'}-${stamp}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    function clearSamples() {
        if (recording || !samples[mode].length) return;
        if (!window.confirm(`${N.MODES[mode].label} 기록 ${samples[mode].length}개를 지울까요?`)) return;
        samples[mode] = [];
        buildReadouts();
        drawCharts();
        updateButtons();
    }

    // 값이 15초 동안 오지 않으면 안내
    setInterval(() => {
        if (recording && !staleShown && N.isStale(lastSampleAt, Date.now())) {
            staleShown = true;
            setStatus('15초 동안 센서 값이 오지 않습니다. 보드 전원·거리(5 m 안)를 확인하세요. 계속 안 되면 ■ 측정 중지 → 연결 끊기 → 다시 연결하세요.', 'warn');
        }
    }, 1000);

    connectButton.addEventListener('click', connect);
    disconnectButton.addEventListener('click', disconnect);
    identifyButton.addEventListener('click', () => sendCommand('IDENTIFY').catch(reportBoardError));
    startButton.addEventListener('click', startRecording);
    stopButton.addEventListener('click', () => stopRecording());
    csvButton.addEventListener('click', downloadCsv);
    clearButton.addEventListener('click', clearSamples);
    rateSelect.addEventListener('change', () => { rates[mode] = Number(rateSelect.value); });
    tabs.forEach(tab => tab.addEventListener('click', () => selectMode(tab.dataset.mode)));
    window.addEventListener('beforeunload', () => { if (device && device.gatt.connected) device.gatt.disconnect(); });

    modeNote.textContent = MODE_NOTES[mode];
    buildRateOptions();
    buildReadouts();
    buildCharts();
    updateButtons();
    if (!navigator.bluetooth) {
        setStatus('이 브라우저는 웹 블루투스를 지원하지 않습니다. PC·안드로이드의 크롬이나 엣지로 열어 주세요. (아이폰·아이패드·파이어폭스는 안 됩니다)', 'warn');
    }
})();
