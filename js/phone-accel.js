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
const btnCloudSubmit = document.getElementById('btn-cloud-submit');
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
    if (btnCloudSubmit) btnCloudSubmit.disabled = false;
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
    samples = [];
    originalSamples = null;
    selectionMode = 0;
    cropStartMs = null;
    cropEndMs = null;
    accChart.data.datasets.forEach(ds => ds.data = []);
    accChart.update('none');

    window.addEventListener('devicemotion', handleMotion);
    recording = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnDownload.disabled = true;
    btnCrop.disabled = true;
    btnResetData.disabled = true;
    if (btnCloudSubmit) btnCloudSubmit.disabled = true;
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
    if (btnCloudSubmit) btnCloudSubmit.disabled = samples.length === 0;
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
    selectionMode = 0;
    cropStartMs = null;
    cropEndMs = null;
    updateSelectionStatus();
}

function resetDataToOriginal() {
    if (!originalSamples) return alert('복원할 원본 데이터가 없습니다.');
    samples = originalSamples.slice();
    rebuildChartDataFromSamples();
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

(function init() {
    accChart.data.datasets.forEach(ds => { ds.data = []; });
    accChart.update('none');
    updateTimeRangeDisplay();
    updateSelectionStatus();
})();

// Expose read-only access for the Firebase cloud-submit script (phone-accel-cloud.js)
window.__phoneAccel = {
    getSamples: () => samples,
    getRange
};
