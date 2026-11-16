let recording = false;
let samples = [];
let originalSamples = null;
let sessionStart = null;
let selectionMode = 0;
let cropStartMs = null;
let cropEndMs = null;
let sensorWatchdogTimer = null;
const MAX_SAMPLES = 200;

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnDownload = document.getElementById('btn-download');
const btnCrop = document.getElementById('btn-crop');
const btnResetData = document.getElementById('btn-reset-data');
const selectionStatus = document.getElementById('selection-status');
const timeRangeSpan = document.getElementById('time-range');
const recordStatusEl = document.getElementById('record-status');
const sensorWarningEl = document.getElementById('sensor-warning');
const axEl = document.getElementById('ax');
const ayEl = document.getElementById('ay');
const azEl = document.getElementById('az');
const atotEl = document.getElementById('atot');
const bufferSizeEl = document.getElementById('buffer-size');
const accChartCanvasEl = document.getElementById('accChart');

bufferSizeEl.innerText = MAX_SAMPLES;

function getRange() {
    if (samples.length === 0) return { minMs: 0, maxMs: 0, rangeMs: 0 };
    const minMs = Math.min(...samples.map(s => s.rel));
    const maxMs = Math.max(...samples.map(s => s.rel));
    return { minMs, maxMs, rangeMs: maxMs - minMs };
}

function getNearestSample(sampleList, timeMs) {
    if (!sampleList || sampleList.length === 0) return null;
    let nearest = sampleList[0];
    let minDiff = Math.abs(sampleList[0].rel - timeMs);
    for (let i = 1; i < sampleList.length; i++) {
        const diff = Math.abs(sampleList[i].rel - timeMs);
        if (diff < minDiff) {
            minDiff = diff;
            nearest = sampleList[i];
        }
    }
    return nearest;
}

// Chart.js plugin: draws the selected start/end markers directly on the
// chart's own plot area, using the x-axis scale so they line up exactly
// with the time values on the axis.
const selectionOverlayPlugin = {
    id: 'selectionOverlay',
    afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.x) return;
        const xScale = scales.x;

        const drawLine = (ms, color) => {
            const px = xScale.getPixelForValue(ms);
            if (px < chartArea.left || px > chartArea.right) return;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px, chartArea.top);
            ctx.lineTo(px, chartArea.bottom);
            ctx.stroke();
            ctx.restore();
        };

        if (cropStartMs !== null && cropEndMs !== null) {
            const startPx = xScale.getPixelForValue(cropStartMs);
            const endPx = xScale.getPixelForValue(cropEndMs);
            ctx.save();
            ctx.fillStyle = 'rgba(39, 174, 96, 0.12)';
            ctx.fillRect(startPx, chartArea.top, endPx - startPx, chartArea.bottom - chartArea.top);
            ctx.restore();
        }

        if (cropStartMs !== null) drawLine(cropStartMs, '#e74c3c');
        if (cropEndMs !== null) drawLine(cropEndMs, '#27ae60');
    }
};

const ctx = accChartCanvasEl.getContext('2d');
const accChart = new Chart(ctx, {
    type: 'line',
    data: {
        datasets: [
            { label: 'Ax (g)', data: [], borderColor: '#e74c3c', borderWidth: 1, tension: 0.15, pointRadius: 0, fill: false },
            { label: 'Ay (g)', data: [], borderColor: '#3498db', borderWidth: 1, tension: 0.15, pointRadius: 0, fill: false },
            { label: 'Az (g)', data: [], borderColor: '#2ecc71', borderWidth: 1, tension: 0.15, pointRadius: 0, fill: false }
        ]
    },
    options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { type: 'linear', title: { display: true, text: 'time (ms)' } },
            y: { suggestedMin: -2, suggestedMax: 2, title: { display: true, text: 'g' } }
        }
    },
    plugins: [selectionOverlayPlugin]
});

function updateTimeRangeDisplay() {
    const r = getRange();
    timeRangeSpan.innerText = `전체: ${r.rangeMs.toFixed(0)} ms`;
    accChart.update('none');
}

function rebuildChartDataFromSamples() {
    accChart.data.datasets[0].data = samples.map(s => ({ x: s.rel, y: s.ax }));
    accChart.data.datasets[1].data = samples.map(s => ({ x: s.rel, y: s.ay }));
    accChart.data.datasets[2].data = samples.map(s => ({ x: s.rel, y: s.az }));
    accChart.update('none');
    updateTimeRangeDisplay();
}

function handleMotion(event) {
    const g = event.accelerationIncludingGravity;
    if (!g || (g.x === null && g.y === null && g.z === null)) return; // no sensor data in this event
    const ax = g.x || 0;
    const ay = g.y || 0;
    const az = g.z || 0;
    const gx = ax / 9.80665;
    const gy = ay / 9.80665;
    const gz = az / 9.80665;
    const atot = Math.sqrt(gx * gx + gy * gy + gz * gz);

    axEl.innerText = gx.toFixed(2);
    ayEl.innerText = gy.toFixed(2);
    azEl.innerText = gz.toFixed(2);
    atotEl.innerText = atot.toFixed(2);

    if (!recording) return;

    // Got real sensor data: clear the "no signal" watchdog/warning
    if (sensorWatchdogTimer) { clearTimeout(sensorWatchdogTimer); sensorWatchdogTimer = null; }
    sensorWarningEl.style.display = 'none';
    recordStatusEl.textContent = `🔴 기록 중... (${samples.length + 1}개 샘플)`;
    recordStatusEl.style.color = 'var(--c-danger)';

    const t = Date.now();
    if (!sessionStart) sessionStart = t;
    const rel = t - sessionStart;
    samples.push({ t, rel, ax: gx, ay: gy, az: gz });
    if (samples.length > MAX_SAMPLES) samples.shift();

    accChart.data.datasets[0].data.push({ x: rel, y: gx });
    accChart.data.datasets[1].data.push({ x: rel, y: gy });
    accChart.data.datasets[2].data.push({ x: rel, y: gz });
    accChart.data.datasets.forEach(ds => { while (ds.data.length > MAX_SAMPLES) ds.data.shift(); });
    accChart.update('none');

    btnCrop.disabled = false;
    btnResetData.disabled = false;
    btnDownload.disabled = false;
    updateTimeRangeDisplay();
}

async function startRecording() {
    if (!window.isSecureContext) {
        alert('가속도 센서는 보안 연결(https://)에서만 동작합니다. 주소창이 https로 시작하는지 확인하세요.');
        return;
    }
    if (typeof DeviceMotionEvent === 'undefined') {
        alert('이 브라우저/기기에서는 가속도 센서(DeviceMotionEvent)를 지원하지 않습니다.');
        return;
    }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const perm = await DeviceMotionEvent.requestPermission();
            if (perm !== 'granted') {
                alert('가속도 권한이 필요합니다. 설정에서 동작 및 방향 접근 권한을 허용해주세요.');
                return;
            }
        } catch (e) {
            alert('가속도 권한 요청 실패: ' + e.message);
            return;
        }
    }

    sessionStart = null;
    currentRunId = newRunId();   // 시작 → 중지 = 회차 하나
    viewLabel = '';
    samples = [];
    originalSamples = null;
    selectionMode = 0;
    cropStartMs = null;
    cropEndMs = null;
    accChart.data.datasets.slice(0, 3).forEach(ds => ds.data = []);   // 4번째부터는 📥 불러온 기록 겹쳐 보기
    accChart.update('none');

    window.addEventListener('devicemotion', handleMotion);
    recording = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnDownload.disabled = true;
    btnCrop.disabled = true;
    btnResetData.disabled = true;
    recordStatusEl.textContent = '🔴 기록 중... (센서 신호 대기)';
    recordStatusEl.style.color = 'var(--c-danger)';
    sensorWarningEl.style.display = 'none';

    // Watchdog: if no sensor data arrives within 3s, warn the user with likely causes
    if (sensorWatchdogTimer) clearTimeout(sensorWatchdogTimer);
    sensorWatchdogTimer = setTimeout(() => {
        if (samples.length === 0) {
            sensorWarningEl.style.display = 'block';
        }
    }, 3000);

    updateTimeRangeDisplay();
    updateSelectionStatus();
}

function stopRecording() {
    window.removeEventListener('devicemotion', handleMotion);
    if (sensorWatchdogTimer) { clearTimeout(sensorWatchdogTimer); sensorWatchdogTimer = null; }
    recording = false;
    btnStart.disabled = false;
    btnStop.disabled = true;
    recordStatusEl.textContent = `⏸ 대기 중 (샘플 ${samples.length}개 기록됨)`;
    recordStatusEl.style.color = 'var(--c-muted)';
    storeRun();
}

function downloadCSV() {
    if (samples.length === 0) return alert('저장할 데이터가 없습니다');
    let csv = 'time(ms),ax(g),ay(g),az(g)\n';
    const start = samples[0].rel;
    samples.forEach(s => {
        csv += `${(s.rel - start).toFixed(1)},${s.ax.toFixed(4)},${s.ay.toFixed(4)},${s.az.toFixed(4)}\n`;
    });
    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    link.download = 'phone_accelerometer.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function cropToSelection() {
    if (cropStartMs === null || cropEndMs === null) return alert('시작 지점과 종료 지점을 모두 선택하세요.');
    if (cropStartMs >= cropEndMs) return alert('유효한 시간 범위를 선택하세요. (시작 < 종료)');
    if (!originalSamples) originalSamples = samples.slice();
    const source = originalSamples;
    let filtered = source.filter(s => s.rel >= cropStartMs && s.rel <= cropEndMs);
    if (filtered.length === 0) {
        const startNearest = getNearestSample(source, cropStartMs);
        const endNearest = getNearestSample(source, cropEndMs);
        if (startNearest && endNearest) {
            const startIdx = source.indexOf(startNearest);
            const endIdx = source.indexOf(endNearest);
            const from = Math.min(startIdx, endIdx);
            const to = Math.max(startIdx, endIdx);
            filtered = source.slice(from, to + 1);
        }
    }
    if (filtered.length === 0) return alert('선택된 구간에 데이터가 없습니다.');
    samples = filtered;
    rebuildChartDataFromSamples();
    storeRun();
    selectionMode = 0;
    cropStartMs = null;
    cropEndMs = null;
    updateSelectionStatus();
}

function resetDataToOriginal() {
    if (!originalSamples) return alert('복원할 원본 데이터가 없습니다.');
    samples = originalSamples.slice();
    rebuildChartDataFromSamples();
    storeRun();
    selectionMode = 0;
    cropStartMs = null;
    cropEndMs = null;
    updateSelectionStatus();
}

function updateSelectionStatus() {
    if (selectionMode === 0) {
        selectionStatus.innerText = '준비됨';
        selectionStatus.style.color = 'var(--c-muted)';
        btnCrop.disabled = true;
    } else if (selectionMode === 1) {
        selectionStatus.innerText = `시작 지점 선택됨 (${cropStartMs.toFixed(0)} ms)`;
        selectionStatus.style.color = 'var(--c-danger)';
        btnCrop.disabled = true;
    } else {
        selectionStatus.innerText = `구간 선택됨: ${cropStartMs.toFixed(0)}~${cropEndMs.toFixed(0)} ms`;
        selectionStatus.style.color = 'var(--c-success)';
        btnCrop.disabled = false;
    }
    accChart.update('none');
}

// Handle a click directly on the graph: convert the click's pixel
// position into a time value (ms) using the chart's own x-axis scale.
function onChartClick(event) {
    if (samples.length === 0) return;
    let x = null;
    if (Chart.helpers && typeof Chart.helpers.getRelativePosition === 'function') {
        const pos = Chart.helpers.getRelativePosition(event, accChart);
        x = pos.x;
    } else {
        const rect = accChartCanvasEl.getBoundingClientRect();
        const scaleX = accChartCanvasEl.width / rect.width;
        x = (event.clientX - rect.left) * scaleX;
    }
    const area = accChart.chartArea;
    if (!area || x < area.left || x > area.right) return;

    const rawTimeMs = accChart.scales.x.getValueForPixel(x);
    const r = getRange();
    if (r.rangeMs === 0) return;
    const clampedTimeMs = Math.min(r.maxMs, Math.max(r.minMs, rawTimeMs));
    const nearest = getNearestSample(samples, clampedTimeMs);
    if (!nearest) return;
    const timeMs = nearest.rel;

    if (selectionMode === 0) {
        cropStartMs = timeMs;
        selectionMode = 1;
    } else if (selectionMode === 1) {
        if (timeMs <= cropStartMs) {
            alert('종료 지점이 시작 지점보다 뒤에 와야 합니다.');
            return;
        }
        cropEndMs = timeMs;
        selectionMode = 2;
    } else {
        selectionMode = 0;
        cropStartMs = null;
        cropEndMs = null;
    }

    updateSelectionStatus();
}

btnStart.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);
btnDownload.addEventListener('click', downloadCSV);
btnCrop.addEventListener('click', cropToSelection);
btnResetData.addEventListener('click', resetDataToOriginal);
accChartCanvasEl.addEventListener('click', onChartClick);

/* 회차: '시작 → 중지' 한 번이 회차 하나 (구간을 자르거나 되돌리면 그 회차를 고침). 이 기기에 남아 새로고침해도 보이고,
   👥 조 공유에서 골라 보낸다. 지금 화면의 기록(마지막 회차 또는 📈 보기로 띄운 기록)도 따로 남긴다 */
const LAST_KEY = 'phone-accel:last', RUNS_KEY = 'phone-accel:runs';
let runs = [];             // [{ id, num, title, at, samples: [{ rel, ax, ay, az }] }]
let currentRunId = null;   // 지금 화면이 어느 회차인지 (불러온 기록을 보고 있으면 null)
let viewLabel = '';        // 📈 보기로 띄운 다른 기기 기록의 이름
const slim = list => list.map(s => ({ t: s.t, rel: s.rel, ax: s.ax, ay: s.ay, az: s.az }));
const okSamples = a => Array.isArray(a) && a.every(s => s && [s.rel, s.ax, s.ay, s.az].every(Number.isFinite));
function newRunId() { return 'r' + Date.now().toString(36); }
function saveRuns() { try { localStorage.setItem(RUNS_KEY, JSON.stringify(runs)); } catch (e) { /* 저장 불가: 이 화면에서만 */ } }
function saveLast() {
    try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ samples: slim(samples), original: originalSamples ? slim(originalSamples) : null, runId: currentRunId, view: viewLabel }));
    } catch (e) { /* 저장 불가: 이 화면에서만 */ }
}
// 지금 기록을 회차에 넣거나 고치고 알림
function storeRun() {
    let changedRun = false;
    if (currentRunId && samples.length) {
        let r = runs.find(x => x.id === currentRunId);
        if (!r) {
            const num = runs.reduce((m, x) => Math.max(m, x.num || 0), 0) + 1;
            r = { id: currentRunId, num, title: num + '회', at: new Date().toISOString() };
            runs.push(r);
        }
        r.samples = slim(samples);
        changedRun = true;
        saveRuns();
    }
    saveLast();
    renderRunList();
    notifyChange(changedRun);
}
function deleteRun(id) {
    runs = runs.filter(r => r.id !== id);
    if (currentRunId === id) currentRunId = null;
    saveRuns(); saveLast(); renderRunList();
    notifyChange(false);
}
// 회차나 다른 기기 기록을 그래프에 띄움 (label 이 있으면 다른 기기 기록: 고쳐도 내 회차가 되지 않음)
function showSamples(list, runId, label) {
    if (recording) return;
    samples = slim(list).slice(-MAX_SAMPLES);
    originalSamples = null;
    currentRunId = runId || null;
    viewLabel = label || '';
    selectionMode = 0; cropStartMs = null; cropEndMs = null;
    rebuildChartDataFromSamples();
    updateSelectionStatus();
    btnDownload.disabled = !samples.length;
    btnResetData.disabled = true;
    const r = runs.find(x => x.id === currentRunId);
    recordStatusEl.textContent = viewLabel ? `📈 보는 중: ${viewLabel} (샘플 ${samples.length}개)` : `⏸ ${r ? r.title : '지난 기록'} (샘플 ${samples.length}개)`;
    recordStatusEl.style.color = 'var(--c-muted)';
    saveLast();
    renderRunList();
}
// 🗂 내 회차 목록 (폰 연결 화면에서는 조 공유 띠가 회차 고르기를 맡으므로 숨김)
let runListHidden = false;
function renderRunList() {
    const box = document.getElementById('runs-box'), ul = document.getElementById('run-list');
    if (!box || !ul) return;
    box.hidden = runListHidden || !runs.length;
    document.getElementById('runs-sum').textContent = runs.length ? '— ' + runs.length + '개' : '';
    ul.innerHTML = runs.map(r => `<li${r.id === currentRunId ? ' class="on"' : ''}><b>${r.title}</b><span class="sm">샘플 ${r.samples.length}개 · ${new Date(r.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>` +
        `<button type="button" data-view="${r.id}">📈 보기</button><button type="button" class="btn-danger" data-del="${r.id}" aria-label="${r.title} 지우기">🗑</button></li>`).join('');
}
document.getElementById('run-list')?.addEventListener('click', e => {
    const v = e.target.closest('[data-view]'), d = e.target.closest('[data-del]');
    if (v) { const r = runs.find(x => x.id === v.dataset.view); if (r) showSamples(r.samples, r.id); }
    if (d) { const r = runs.find(x => x.id === d.dataset.del); if (r && confirm(`'${r.title}' 회차를 지울까요?`)) deleteRun(r.id); }
});
function loadLast() {
    try {
        const saved = JSON.parse(localStorage.getItem(RUNS_KEY) || 'null');
        if (Array.isArray(saved)) runs = saved.filter(r => r && typeof r.id === 'string' && okSamples(r.samples) && r.samples.length);
        const d = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
        if (!d || !okSamples(d.samples) || !d.samples.length) return;
        samples = d.samples.slice(-MAX_SAMPLES);
        originalSamples = okSamples(d.original) && d.original.length ? d.original : null;
        viewLabel = typeof d.view === 'string' ? d.view : '';
        currentRunId = typeof d.runId === 'string' ? d.runId : null;
        // 예전 판(회차 없이 마지막 기록 하나)은 그 기록을 1회로 (조 공유 id 'rec' 그대로라 예전에 보낸 줄을 고쳐 씀)
        if (!runs.length && !viewLabel && d.runId === undefined) {
            runs.push({ id: 'rec', num: 1, title: '1회', at: new Date().toISOString(), samples: slim(samples) });
            currentRunId = 'rec';
            saveRuns();
        }
        rebuildChartDataFromSamples();
        btnDownload.disabled = false;
        btnResetData.disabled = !originalSamples;
        const r = runs.find(x => x.id === currentRunId);
        recordStatusEl.textContent = viewLabel ? `📈 보는 중: ${viewLabel} (샘플 ${samples.length}개)` : `⏸ ${r ? r.title : '지난 기록'} (샘플 ${samples.length}개)`;
    } catch (e) { /* 깨진 값은 무시 */ }
}
// 기록이 바뀌었음을 조 공유 스크립트(js/phone-accel-share.js)에 알림 (runChanged: 회차가 새로 생기거나 바뀜)
const changeListeners = [];
function notifyChange(runChanged) { changeListeners.forEach(fn => { try { fn(!!runChanged); } catch (e) { console.error(e); } }); }

(function init() {
    accChart.data.datasets.forEach(ds => { ds.data = []; });
    accChart.update('none');
    loadLast();
    renderRunList();
    updateTimeRangeDisplay();
    updateSelectionStatus();
})();

// 👥 조 공유 스크립트(js/phone-accel-share.js)가 쓰는 창구
window.__phoneAccel = {
    getSamples: () => samples,
    getRuns: () => runs,
    deleteRun,
    showSamples,
    hideRunList(on) { runListHidden = !!on; renderRunList(); },
    isRecording: () => recording,
    getRange,
    onChange: fn => changeListeners.push(fn),
    // 📥 불러온 기록 겹쳐 보기: [{ label, points: [{ x: ms, y: g }] }] (앞 3개 Ax·Ay·Az 는 그대로)
    setOverlays(list) {
        const colors = ['#8e44ad', '#d35400', '#16a085', '#7f8c8d', '#c0392b', '#2c3e50'];
        accChart.data.datasets.length = 3;
        (list || []).forEach((o, i) => accChart.data.datasets.push({ label: o.label, data: o.points, borderColor: colors[i % colors.length],
            borderWidth: 1.5, borderDash: [5, 4], tension: 0.15, pointRadius: 0, fill: false }));
        accChart.update('none');
    }
};
