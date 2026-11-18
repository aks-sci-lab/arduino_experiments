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
    const runList = $('runList');
    const viewText = $('viewText');
    const STORE_KEY = 'nano-lab:runs:v1';

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
    // 회차: 측정 시작 → 중지 한 번. 내 회차(myRuns)는 이 브라우저에 저장, 받은 회차(incoming)는 조 공유에서
    let myRuns = [];
    const incoming = new Map();
    let current = null;                       // 지금 기록 중인 회차
    const viewKey = { imu: null, env: null }; // 그래프에 보이는 회차 ('me:id' 또는 '노트북-id')
    let share = null;
    const rates = { imu: N.MODES.imu.defaultRate, env: N.MODES.env.defaultRate };
    const charts = {};

    const accelReceiver = new AccelerometerProtocol.Receiver();
    const textReceiver = new EnvironmentProtocol.Receiver(handlePacket, reportBoardError,
        N.makeValidator(EnvironmentProtocol.validateSample));

    function setStatus(text, kind = '') {
        statusBox.textContent = text;
        statusBox.className = 'dash-status' + (kind ? ' ' + kind : '');
    }

    function runKey(run) { return run.incoming ? run.key : 'me:' + run.id; }
    function runsOf(m) {
        return myRuns.filter(r => r.mode === m).concat([...incoming.values()].filter(r => r.mode === m));
    }
    // 그래프·지금 값·CSV 에 쓰는 회차
    function viewed() {
        if (recording && current && current.mode === mode) return current;
        const list = runsOf(mode);
        return list.find(r => runKey(r) === viewKey[mode]) || myRuns.filter(r => r.mode === mode).slice(-1)[0] || null;
    }
    function viewedSamples() { const run = viewed(); return run ? run.samples : []; }

    function saveRuns() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(myRuns.filter(r => r.samples.length).map(r => ({
                id: r.id, mode: r.mode, no: r.no, startedAt: r.startedAt, n: r.n, summary: r.summary, data: N.packRun(r.mode, r.samples)
            }))));
        } catch (error) {
            console.warn('회차 저장 실패', error);
        }
    }
    function loadRuns() {
        try {
            const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
            myRuns = list.map(x => {
                const run = N.unpackRun(x.data);
                if (!run || !/^[A-Za-z0-9_-]{1,30}$/.test(String(x.id))) return null;
                // 저장할 때 점을 고르게 줄였으므로 새로고침 뒤에는 줄인 값 (thinned)
                return { id: x.id, mode: run.mode, no: x.no, startedAt: x.startedAt, samples: run.samples, n: x.n || run.n,
                    summary: x.summary || N.runSummary(run.mode, run.samples), thinned: run.samples.length < (x.n || 0) };
            }).filter(Boolean);
        } catch (error) {
            myRuns = [];
        }
    }

    function fmt(value) { return value === null || value === undefined || value === '' ? '-' : String(value); }

    // 회차 목록 (내 회차 + 📥 불러온 회차). 단추는 손가락으로 누르기 좋게 44px
    function renderRuns() {
        const list = runsOf(mode);
        const shown = viewed();
        runList.innerHTML = '';
        if (!list.length) {
            runList.innerHTML = '<p class="note">아직 회차가 없습니다. ▶ 측정 시작 → ■ 측정 중지 하면 한 회차가 됩니다.</p>';
        }
        for (const run of list) {
            const card = document.createElement('div');
            card.className = 'run-card' + (run === shown ? ' on' : '') + (run.incoming ? ' ext' : '');
            const head = document.createElement('div');
            head.className = 'run-head';
            const title = document.createElement('strong');
            title.textContent = (run.incoming ? '📥 ' : '') + (run.incoming ? run.title : N.runTitle(run.mode, run.no)) + (run === current && recording ? ' (기록 중)' : '');
            const who = document.createElement('span');
            who.className = 'note';
            who.textContent = (run.incoming ? '불러온 값 · ' + run.from : '내 기록') + ' · ' + (run.n || run.samples.length).toLocaleString('ko-KR') + '점'
                + (run.incoming || run.thinned ? ' (그래프는 ' + run.samples.length.toLocaleString('ko-KR') + '점으로 줄임)' : '');
            head.append(title, who);
            const sum = document.createElement('div');
            sum.className = 'run-sum';
            const summary = run.summary || N.runSummary(run.mode, run.samples);
            sum.textContent = Object.entries(summary).map(([k, v]) => k + ' ' + fmt(v)).join(' · ');
            const row = document.createElement('div');
            row.className = 'row';
            const view = document.createElement('button');
            view.type = 'button';
            view.textContent = run === shown ? '✔ 그래프에 보이는 중' : '그래프로 보기';
            view.disabled = recording || run === shown;
            view.addEventListener('click', () => { viewKey[mode] = runKey(run); refreshView(); });
            row.appendChild(view);
            if (!run.incoming) {
                const del = document.createElement('button');
                del.type = 'button';
                del.textContent = '이 회차 지우기';
                del.disabled = recording;
                del.addEventListener('click', () => deleteRun(run));
                row.appendChild(del);
            }
            card.append(head, sum, row);
            runList.appendChild(card);
        }
        if (viewText) {
            viewText.textContent = shown ? '그래프: ' + (shown.incoming ? '📥 ' + shown.title + ' (' + shown.from + ')' : N.runTitle(shown.mode, shown.no)) : '';
        }
    }

    function refreshView() {
        buildReadouts();
        drawCharts();
        renderRuns();
        updateButtons();
    }

    function deleteRun(run) {
        if (recording) return;
        if (!window.confirm(N.runTitle(run.mode, run.no) + ' (' + run.samples.length.toLocaleString('ko-KR') + '점) 을 지울까요? 조 공유로 이미 보냈다면 다음에 보낼 때 사이트 저장소에서도 지워집니다.')) return;
        myRuns = myRuns.filter(r => r !== run);
        viewKey[mode] = null;
        saveRuns();
        refreshView();
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
        const count = viewedSamples().length;
        csvButton.disabled = recording || count === 0;
        if (clearButton) clearButton.style.display = 'none';   // 지우기는 회차 목록의 '이 회차 지우기'로
        countText.textContent = count ? `그래프의 점: ${count.toLocaleString('ko-KR')}개` + (count >= N.MAX_SAMPLES ? ' (최대 개수에 도달해 기록을 멈췄습니다)' : '') : '';
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
        const list = viewedSamples();
        const last = list[list.length - 1];
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
        const points = N.thin(viewedSamples());
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
        buildCharts();
        refreshView();
    }

    function addSample(kind, sample) {
        if (!recording || !current || kind !== current.mode) return;
        lastSampleAt = Date.now();
        if (staleShown) {
            staleShown = false;
            setStatus(`측정 중: ${device ? device.name : ''} — 값이 다시 들어옵니다.`);
        }
        const list = current.samples;
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
        if (list.length % 100 === 1 || kind === 'env') renderRuns();
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
        if (recording) finishRun();
        recording = false;
        lastSampleAt = null;
        if (device) device.removeEventListener('gattserverdisconnected', onDisconnected);
        detachCharacteristics();
        device = null;
        boardInfo.textContent = '';
        setStatus((wasRecording ? '측정 중에 ' : '') + '블루투스 연결이 끊어졌습니다. 기록은 남아 있습니다. 보드 전원과 거리를 확인하고 다시 연결하세요.', 'warn');
        refreshView();
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
            current = {
                id: 'r' + Date.now().toString(36), mode, samples: [], startedAt: new Date().toISOString(),
                no: myRuns.filter(r => r.mode === mode).reduce((m, r) => Math.max(m, r.no || 0), 0) + 1
            };
            myRuns.push(current);
            viewKey[mode] = 'me:' + current.id;
            firstEnvTs = null;
            fullNotified = false;
            accelReceiver.reset();
            recording = true;
            lastSampleAt = Date.now();
            staleShown = false;
            refreshView();
            share?.stepChanged();
            await sendCommand(startCommand);
            setStatus(`측정 중: ${device.name || '보드'} — ${N.runTitle(mode, current.no)}`);
        } catch (error) {
            recording = false;
            if (current && !current.samples.length) myRuns = myRuns.filter(r => r !== current);
            current = null;
            setStatus('측정을 시작하지 못했습니다: ' + N.friendlyError(error), 'error');
        }
        refreshView();
    }

    // 기록이 끝난 회차 정리: 점이 없으면 버리고, 있으면 요약을 만들어 저장
    function finishRun() {
        const run = current;
        current = null;
        if (!run) return null;
        if (!run.samples.length) {
            myRuns = myRuns.filter(r => r !== run);
            viewKey[run.mode] = null;
            return null;
        }
        run.n = run.samples.length;
        run.summary = N.runSummary(run.mode, run.samples);
        saveRuns();
        return run;
    }

    async function stopRecording(message, kind) {
        if (!recording) return;
        recording = false;
        const run = finishRun();
        lastSampleAt = null;
        refreshView();
        share?.stepChanged();
        try {
            if (connected()) await sendCommand('STOP');
        } catch (error) {
            console.warn('STOP failed', error);
        }
        setStatus(message || (run ? `${N.runTitle(run.mode, run.no)}: ${run.samples.length.toLocaleString('ko-KR')}개를 기록했습니다. CSV 저장, 또는 👥 조 공유로 선생님께 보낼 수 있습니다.` : '측정을 멈췄습니다. 받은 값이 없어 회차를 만들지 않았습니다.'), kind || '');
    }

    function downloadCsv() {
        const run = viewed();
        const list = run ? run.samples : [];
        if (!list.length) return;
        const blob = new Blob([N.toCsv(mode, list)], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        link.href = URL.createObjectURL(blob);
        const name = run.incoming ? `${run.title}-${run.from}` : N.runTitle(run.mode, run.no);
        link.download = `nano-${name.replace(/\s+/g, '')}-${stamp}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
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
    rateSelect.addEventListener('change', () => { rates[mode] = Number(rateSelect.value); });
    tabs.forEach(tab => tab.addEventListener('click', () => selectMode(tab.dataset.mode)));
    window.addEventListener('beforeunload', () => { if (device && device.gatt.connected) device.gatt.disconnect(); });

    // 👥 조 공유 (수업 참여 ?c= · 조 코드, 구글 로그인 없음): docs/class-share.md
    function initShare() {
        if (!window.ClassShare || !window.PendulumCloud) return null;
        return window.ClassShare.init({
            exp: 'nano',
            barMount: '#class-bar-mount', shareMount: '#share-mount',
            csvHint: '회차를 그래프로 보기 → CSV 저장',
            getItems: () => N.shareItems(myRuns.filter(r => r !== current)),
            onIncoming: items => {
                const changed = N.mergeIncoming(incoming, items);
                if (changed) refreshView();
                return changed;
            },
            getStep: () => (recording ? 'live' : 'record'),
            getPoints: () => myRuns.reduce((n, r) => n + (r.n || r.samples.length), 0),
            pollWhen: () => !recording,
            incomingCount: () => [...incoming.values()].reduce((n, r) => n + (r.n || r.samples.length), 0),
            clearIncoming: () => { incoming.clear(); refreshView(); }
        });
    }

    loadRuns();
    modeNote.textContent = MODE_NOTES[mode];
    buildRateOptions();
    buildCharts();
    refreshView();
    share = initShare();
    if (!navigator.bluetooth) {
        setStatus('이 브라우저는 웹 블루투스를 지원하지 않습니다. PC·안드로이드의 크롬이나 엣지로 열어 주세요. (아이폰·아이패드·파이어폭스는 안 됩니다)', 'warn');
    }
})();
