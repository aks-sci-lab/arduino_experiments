/* ========================================
   자유낙하 및 2차원 운동 분석
   - 보고서 순서 7단계 화면 (LabUI.initSteps), 1. 목적 맨 위에서 실험 종류(자유낙하 / 2차원 운동) 고르기
   - 모바일 터치 확대 선택
   - 픽셀-실제 길이 보정 (자 양 끝을 눌러 mm/px 재기)
   - 측정값 표, 2차 함수·직선 맞춤으로 g·수평 속도 계산
   ======================================== */

const fileInput = document.getElementById('video-upload');
const fpsInput = document.getElementById('fps-input');
const stepSlider = document.getElementById('step-slider');
const stepVal = document.getElementById('step-val');
const pixelToMmInput = document.getElementById('pixel-to-mm');

const btnExtract = document.getElementById('btn-extract');
const btnManualTrack = document.getElementById('btn-manual-track');
const btnStrobo = document.getElementById('btn-strobo');
const btnReset = document.getElementById('btn-reset');
const btnCsv = document.getElementById('btn-csv');
const btnDownloadStrobo = document.getElementById('btn-download-strobo');
const btnPrevFrame = document.getElementById('btn-prev-frame');
const btnNextFrame = document.getElementById('btn-next-frame');
const btnUndoPoint = document.getElementById('btn-undo-point');
const btnClearPoints = document.getElementById('btn-clear-points');

const statusMsg = document.getElementById('status-msg');
const loadingOverlay = document.getElementById('loading-overlay');
const progressText = document.getElementById('progress-text');
const trackControls = document.getElementById('track-controls');
const frameNavControls = document.getElementById('frame-nav-controls');
const stroboContainer = document.getElementById('strobo-container');
const trackingInfo = document.getElementById('tracking-info');
const selectedCount = document.getElementById('selected-count');
const frameInput = document.getElementById('frame-input');
const frameTotal = document.getElementById('frame-total');

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const canvasStrobo = document.getElementById('canvas-strobo');
const ctxStrobo = canvasStrobo.getContext('2d', { willReadFrequently: true });
const chartWrapper = document.getElementById('chart-wrapper');

const zoomOverlay = document.getElementById('zoom-overlay');
const zoomCanvas = document.getElementById('zoom-canvas');
const zoomCtx = zoomCanvas.getContext('2d', { willReadFrequently: true });

let frames = [];
let dataPoints = [];
let chartInstance = null;
let fps = 30;
let frameInterval = 1 / fps;
let extractionTime = 0;
let currentFrameIndex = 0;
let isSelectingMode = false;
let currentAnalysisMode = 'free-fall';

const MAX_DIMENSION = 800;
const MAX_FRAMES = 150;
const ZOOM_RADIUS = 110;
const ZOOM_SCALE = 3;

/* ========================================
   실험 종류 고르기 (1. 목적 맨 위의 .seg: 자유낙하 / 2차원 운동)
   - 고른 종류는 이 브라우저에 기억
   - data-mode="free-fall|projectile" 인 글은 고른 종류일 때만 보임
   ======================================== */
const MODE_KEY = 'free-fall:mode';
let analysisDone = false;   // '합성 실행'을 한 번 했는지 (종류를 바꾸면 그래프를 다시 그림)

function setAnalysisMode(mode, save) {
    if (mode !== 'free-fall' && mode !== 'projectile') mode = 'free-fall';
    currentAnalysisMode = mode;
    document.querySelectorAll('.tab-btn').forEach(b => {
        const on = b.dataset.tab === mode;
        b.classList.toggle('active', on);
        if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-mode]').forEach(el => { el.hidden = el.dataset.mode !== mode; });

    const chartTitle = document.getElementById('chart-title');
    chartTitle.innerText = mode === 'free-fall' ? '자유낙하 t-y 그래프' : '2차원 운동 궤적 (X-Y 그래프)';
    document.getElementById('data-mode-label').innerText = mode === 'free-fall' ? '(자유낙하)' : '(2차원 운동)';
    document.getElementById('table-note').innerText = mode === 'free-fall'
        ? 't 는 첫 프레임부터 지난 시간, x·y 는 화면 왼쪽 위를 원점으로 한 위치(아래가 +)입니다.'
        : 't 는 첫 프레임부터 지난 시간, x·y 는 첫 점을 원점으로 한 위치(오른쪽·위쪽이 +)입니다.';

    if (save) {
        try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* 저장 불가: 이 화면에서만 적용 */ }
    }
    renderDataTable();
    if (analysisDone && dataPoints.length > 0 && typeof Chart !== 'undefined') drawGraph();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        setAnalysisMode(btn.dataset.tab, true);
    });
});

/* ========================================
   측정값 계산 (표·CSV·그래프가 같은 값을 쓰도록)
   - 자유낙하: 화면 좌표 그대로(아래가 +)
   - 2차원 운동: 첫 점 기준, 오른쪽·위쪽이 +
   ======================================== */
function measuredRows() {
    if (dataPoints.length === 0 || frames.length === 0) return [];
    const startTime = frames[0].time;
    const pixelToMm = parseFloat(pixelToMmInput.value) || 1;
    const first = dataPoints[0];
    return dataPoints.map(dp => {
        const t = dp.time - startTime;
        if (currentAnalysisMode === 'free-fall') {
            return { t, x: dp.x * pixelToMm, y: dp.y * pixelToMm };
        }
        return { t, x: (dp.x - first.x) * pixelToMm, y: (first.y - dp.y) * pixelToMm };
    });
}

function renderDataTable() {
    const body = document.getElementById('data-table-body');
    const rows = measuredRows().slice().sort((a, b) => a.t - b.t);
    if (rows.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center">아직 찍은 점이 없습니다.</td></tr>';
        return;
    }
    body.innerHTML = rows.map((r, i) =>
        `<tr><td>${i + 1}</td><td>${r.t.toFixed(4)}</td><td>${r.x.toFixed(2)}</td><td>${r.y.toFixed(2)}</td></tr>`
    ).join('');
}

/* 최소제곱법 다항식 맞춤 (degree 1: y = a + bt, degree 2: y = a + bt + ct²)
   돌려주는 값: { coef: [a, b, c], r2 } 또는 점이 모자라면 null */
function polyFit(xs, ys, degree) {
    const n = xs.length;
    const m = degree + 1;
    if (n < m + 1) return null;
    // 정규방정식 A·coef = B
    const A = Array.from({ length: m }, () => new Array(m).fill(0));
    const B = new Array(m).fill(0);
    for (let k = 0; k < n; k++) {
        const pw = [1];
        for (let j = 1; j < 2 * m; j++) pw.push(pw[j - 1] * xs[k]);
        for (let i = 0; i < m; i++) {
            B[i] += pw[i] * ys[k];
            for (let j = 0; j < m; j++) A[i][j] += pw[i + j];
        }
    }
    // 가우스 소거
    for (let i = 0; i < m; i++) {
        let p = i;
        for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
        [A[i], A[p]] = [A[p], A[i]];
        [B[i], B[p]] = [B[p], B[i]];
        if (Math.abs(A[i][i]) < 1e-15) return null;
        for (let r = i + 1; r < m; r++) {
            const f = A[r][i] / A[i][i];
            for (let c = i; c < m; c++) A[r][c] -= f * A[i][c];
            B[r] -= f * B[i];
        }
    }
    const coef = new Array(m).fill(0);
    for (let i = m - 1; i >= 0; i--) {
        let s = B[i];
        for (let c = i + 1; c < m; c++) s -= A[i][c] * coef[c];
        coef[i] = s / A[i][i];
    }
    const f = x => coef.reduce((s, c, i) => s + c * Math.pow(x, i), 0);
    const mean = ys.reduce((s, v) => s + v, 0) / n;
    let ssRes = 0, ssTot = 0;
    for (let k = 0; k < n; k++) { ssRes += (ys[k] - f(xs[k])) ** 2; ssTot += (ys[k] - mean) ** 2; }
    while (coef.length < 3) coef.push(0);
    return { coef, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1, f };
}

function fitCurve(fit, ts) {
    if (!fit || ts.length < 2) return [];
    const t0 = Math.min(...ts), t1 = Math.max(...ts);
    const pts = [];
    for (let i = 0; i <= 40; i++) {
        const t = t0 + (t1 - t0) * i / 40;
        pts.push({ x: t, y: fit.f(t) });
    }
    return pts;
}

function showFitResult(items, note) {
    const box = document.getElementById('fit-result');
    box.innerHTML = items.map(it => `<div><small>${it.label}</small><b>${it.value}</b></div>`).join('');
    box.hidden = items.length === 0;
    const noteEl = document.getElementById('fit-note');
    noteEl.innerText = note || '';
    noteEl.hidden = !note;
}

/* ========================================
   단계 1: 영상 로드 및 프레임 추출
   ======================================== */

stepSlider.addEventListener('input', (e) => {
    stepVal.innerText = e.target.value;
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fileURL = URL.createObjectURL(file);
    video.src = fileURL;
    statusMsg.innerText = "영상이 로드되었습니다. '영상 로드 및 추출' 버튼을 누르세요.";
});

video.addEventListener('error', () => {
    alert("브라우저에서 지원하지 않는 영상 포맷입니다.");
    btnExtract.disabled = false;
});

btnExtract.addEventListener('click', () => {
    if (!video.src) { alert("동영상 파일을 선택해주세요."); return; }

    fps = parseInt(fpsInput.value) || 30;
    frameInterval = 1 / fps;
    frames = [];
    dataPoints = [];
    extractionTime = 0;
    currentFrameIndex = 0;

    btnExtract.disabled = true;
    fileInput.disabled = true;
    fpsInput.disabled = true;
    loadingOverlay.style.display = 'block';
    statusMsg.innerText = "2단계: 프레임 추출 중...";

    let vw = video.videoWidth;
    let vh = video.videoHeight;
    if (vw > vh) {
        if (vw > MAX_DIMENSION) { vh *= MAX_DIMENSION / vw; vw = MAX_DIMENSION; }
    } else {
        if (vh > MAX_DIMENSION) { vw *= MAX_DIMENSION / vh; vh = MAX_DIMENSION; }
    }

    canvas.width = vw;
    canvas.height = vh;
    canvasStrobo.width = vw;
    canvasStrobo.height = vh;

    video.currentTime = 0;
    video.addEventListener('seeked', extractFrameListener);
});

function extractFrameListener() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push({
        img: ctx.getImageData(0, 0, canvas.width, canvas.height),
        time: extractionTime
    });
    progressText.innerText = `(${frames.length} 프레임)`;
    extractionTime += frameInterval;

    if (extractionTime <= video.duration && frames.length < MAX_FRAMES) {
        video.currentTime = extractionTime;
    } else {
        video.removeEventListener('seeked', extractFrameListener);
        finishExtraction();
    }
}

function finishExtraction() {
    loadingOverlay.style.display = 'none';
    if (frames.length > 0) {
        currentFrameIndex = 0;
        displayFrame(currentFrameIndex);
        trackControls.style.display = 'flex';
        btnManualTrack.style.display = 'inline-block';
        frameTotal.innerText = `/ ${frames.length}`;
        statusMsg.innerText = `3단계: '수동 선택 시작'을 누르고 각 프레임에서 물체 중심을 클릭하세요.`;
    } else {
        statusMsg.innerText = "프레임 추출 실패. 영상 포맷을 확인해주세요.";
        btnExtract.disabled = false;
    }
}

/* ========================================
   단계 2: 프레임 네비게이션
   ======================================== */

function displayFrame(index) {
    if (index < 0) index = 0;
    if (index >= frames.length) index = frames.length - 1;
    currentFrameIndex = index;
    frameInput.value = index + 1;

    ctx.putImageData(frames[index].img, 0, 0);
    drawSelectedPoint(index);
}

function drawSelectedPoint(frameIndex) {
    const dp = dataPoints.find(d => d.frameIndex === frameIndex);
    if (dp) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, 8, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, 8, 0, 2 * Math.PI);
        ctx.stroke();
    }
}

btnPrevFrame.addEventListener('click', () => {
    if (isSelectingMode) displayFrame(currentFrameIndex - 1);
});

btnNextFrame.addEventListener('click', () => {
    if (isSelectingMode) displayFrame(currentFrameIndex + 1);
});

frameInput.addEventListener('change', () => {
    let index = parseInt(frameInput.value) - 1;
    if (isNaN(index)) index = 0;
    displayFrame(index);
});

/* ========================================
   단계 3: 수동 선택 모드
   ======================================== */

btnManualTrack.addEventListener('click', () => {
    isSelectingMode = true;
    dataPoints = [];
    currentFrameIndex = 0;

    btnManualTrack.style.display = 'none';
    frameNavControls.style.display = 'flex';
    trackingInfo.style.display = 'block';
    btnStrobo.style.display = 'inline-block';

    displayFrame(0);
    statusMsg.innerText = "3단계: 캔버스 위의 물체 중심을 클릭하세요. 모바일에서는 길게 눌러 확대 선택이 가능합니다.";
});

/* ========================================
   터치 확대 선택 (모바일 정확도 향상)
   ======================================== */

let touchStartTime = 0;
let isLongPress = false;
let zoomX = 0;
let zoomY = 0;

canvas.addEventListener('touchstart', (event) => {
    if (calibrating) { event.preventDefault(); return; }
    if (!isSelectingMode) return;
    touchStartTime = Date.now();
    isLongPress = false;
    const { x, y } = getCanvasCoordinates(event);
    zoomX = x;
    zoomY = y;
}, false);

canvas.addEventListener('touchmove', (event) => {
    if (!isSelectingMode || Date.now() - touchStartTime < 500) return;
    if (!isLongPress) {
        isLongPress = true;
        showZoomOverlay(zoomX, zoomY);
    }
    const { x, y } = getCanvasCoordinates(event);
    updateZoomOverlay(x, y);
    event.preventDefault();
}, false);

canvas.addEventListener('touchend', (event) => {
    if (calibrating) {
        event.preventDefault();
        const { x, y } = getCanvasCoordinates(event.changedTouches[0]);
        addCalibrationPoint(x, y);
        return;
    }
    if (!isSelectingMode) return;
    
    if (isLongPress) {
        const { x, y } = getCanvasCoordinates(event.changedTouches[0]);
        addDataPoint(x, y);
    } else {
        const touchEndX = event.changedTouches[0].clientX;
        const touchEndY = event.changedTouches[0].clientY;
        const deltaX = touchEndX - (event.touches[0]?.clientX || touchEndX);
        const deltaY = touchEndY - (event.touches[0]?.clientY || touchEndY);
        
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
            if (deltaX > 0) {
                displayFrame(currentFrameIndex + 1);
            } else {
                displayFrame(currentFrameIndex - 1);
            }
        } else if (Math.abs(deltaX) <= 10 && Math.abs(deltaY) <= 10) {
            addDataPoint(zoomX, zoomY);
        }
    }
    
    zoomOverlay.style.display = 'none';
    isLongPress = false;
}, false);

function showZoomOverlay(x, y) {
    zoomOverlay.style.display = 'block';
    updateZoomOverlay(x, y);
}

function updateZoomOverlay(x, y) {
    zoomX = x;
    zoomY = y;
    
    const left = Math.min(x / canvas.width * 100, 85);
    zoomOverlay.style.left = left + '%';
    
    const sourceCanvas = canvas;
    const sourceX = Math.max(0, Math.min(x - ZOOM_RADIUS / ZOOM_SCALE, sourceCanvas.width - ZOOM_RADIUS / ZOOM_SCALE * 2));
    const sourceY = Math.max(0, Math.min(y - ZOOM_RADIUS / ZOOM_SCALE, sourceCanvas.height - ZOOM_RADIUS / ZOOM_SCALE * 2));
    
    zoomCtx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
    zoomCtx.drawImage(
        sourceCanvas,
        sourceX, sourceY, ZOOM_RADIUS / ZOOM_SCALE * 2, ZOOM_RADIUS / ZOOM_SCALE * 2,
        0, 0, zoomCanvas.width, zoomCanvas.height
    );
    
    zoomCtx.strokeStyle = '#f00';
    zoomCtx.lineWidth = 2;
    zoomCtx.beginPath();
    zoomCtx.arc(ZOOM_RADIUS, ZOOM_RADIUS, 6, 0, 2 * Math.PI);
    zoomCtx.stroke();
}

/* ========================================
   마우스 및 클릭
   ======================================== */

let mouseDownX = 0;
let mouseDownY = 0;
let isMouseDown = false;

canvas.addEventListener('mousedown', (event) => {
    if (!isSelectingMode && !calibrating) return;
    isMouseDown = true;
    mouseDownX = event.clientX;
    mouseDownY = event.clientY;
});

canvas.addEventListener('mousemove', (event) => {
    if (isMouseDown) {
        event.preventDefault();
    }
});

canvas.addEventListener('mouseup', (event) => {
    if (calibrating && isMouseDown) {
        isMouseDown = false;
        const { x, y } = getCanvasCoordinates(event);
        addCalibrationPoint(x, y);
        return;
    }
    if (!isSelectingMode || !isMouseDown) return;
    isMouseDown = false;
    
    const mouseUpX = event.clientX;
    const mouseUpY = event.clientY;
    const deltaX = mouseUpX - mouseDownX;
    const deltaY = mouseUpY - mouseDownY;
    
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
        if (deltaX > 0) {
            displayFrame(currentFrameIndex + 1);
        } else {
            displayFrame(currentFrameIndex - 1);
        }
    } else if (Math.abs(deltaX) <= 10 && Math.abs(deltaY) <= 10) {
        const { x, y } = getCanvasCoordinates(event);
        addDataPoint(x, y);
    }
});

function getCanvasCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    const canvasDisplayWidth = rect.width;
    const canvasDisplayHeight = rect.height;
    const canvasActualWidth = canvas.width;
    const canvasActualHeight = canvas.height;
    
    let clientX, clientY;
    if (event.touches) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }
    
    const scaleX = canvasActualWidth / canvasDisplayWidth;
    const scaleY = canvasActualHeight / canvasDisplayHeight;
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    return { x, y };
}

/* ========================================
   기준 길이 재기: 화면에서 자의 양 끝을 차례로 누르면 mm/px 계산
   ======================================== */
const btnCalibrate = document.getElementById('btn-calibrate');
const refLengthInput = document.getElementById('ref-length-mm');
const calibInfo = document.getElementById('calib-info');
let calibrating = false;
let calibPoints = [];

function setCalibrating(on) {
    calibrating = on;
    calibPoints = [];
    btnCalibrate.classList.toggle('on', on);
    btnCalibrate.innerText = on ? '✖ 재기 취소' : '📏 기준 길이 재기';
    if (on) {
        calibInfo.innerText = '화면에서 자의 한쪽 끝을 누르세요.';
    }
    if (frames.length > 0) displayFrame(currentFrameIndex);
}

btnCalibrate.addEventListener('click', () => {
    if (frames.length === 0) { alert('먼저 영상을 불러오세요.'); return; }
    setCalibrating(!calibrating);
});

function addCalibrationPoint(x, y) {
    calibPoints.push({ x, y });
    ctx.fillStyle = 'rgba(0, 120, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fill();
    if (calibPoints.length < 2) {
        calibInfo.innerText = '이제 자의 다른 쪽 끝을 누르세요.';
        return;
    }
    const [a, b] = calibPoints;
    ctx.strokeStyle = 'rgba(0, 120, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    const mm = parseFloat(refLengthInput.value);
    calibrating = false;
    btnCalibrate.classList.remove('on');
    btnCalibrate.innerText = '📏 기준 길이 재기';
    if (!(px > 2) || !(mm > 0)) {
        calibInfo.innerText = '두 점이 너무 가깝거나 자 길이가 비어 있습니다. 다시 재세요.';
        return;
    }
    const ratio = mm / px;
    pixelToMmInput.value = ratio.toFixed(4);
    calibInfo.innerText = `자 ${mm} mm = ${px.toFixed(1)} px → ${ratio.toFixed(4)} mm/px`;
    renderDataTable();
    setTimeout(() => { if (frames.length > 0 && !calibrating) displayFrame(currentFrameIndex); }, 1200);
}

pixelToMmInput.addEventListener('input', () => {
    renderDataTable();
});

function addDataPoint(x, y) {
    const existingIndex = dataPoints.findIndex(d => d.frameIndex === currentFrameIndex);
    if (existingIndex >= 0) {
        dataPoints.splice(existingIndex, 1);
    }

    dataPoints.push({
        time: frames[currentFrameIndex].time,
        x: x,
        y: y,
        frameIndex: currentFrameIndex,
        realX: x * parseFloat(pixelToMmInput.value),
        realY: y * parseFloat(pixelToMmInput.value)
    });

    selectedCount.innerText = dataPoints.length;
    renderDataTable();
    displayFrame(currentFrameIndex);

    if (currentFrameIndex < frames.length - 1) {
        setTimeout(() => displayFrame(currentFrameIndex + 1), 300);
    }
}

btnUndoPoint.addEventListener('click', () => {
    if (dataPoints.length > 0) {
        dataPoints.pop();
        selectedCount.innerText = dataPoints.length;
        renderDataTable();
        displayFrame(currentFrameIndex);
    }
});

btnClearPoints.addEventListener('click', () => {
    if (confirm('선택된 모든 점을 초기화하시겠습니까?')) {
        dataPoints = [];
        selectedCount.innerText = '0';
        renderDataTable();
        displayFrame(currentFrameIndex);
    }
});

/* ========================================
   단계 4: 다중섬광사진 합성
   ======================================== */

btnStrobo.addEventListener('click', () => {
    if (dataPoints.length === 0) {
        alert('선택된 점이 없습니다. 먼저 물체 중심을 선택해주세요.');
        return;
    }

    const step = parseInt(stepSlider.value);
    stroboContainer.style.display = 'block';

    const offCanvas = document.createElement('canvas');
    offCanvas.width = canvas.width;
    offCanvas.height = canvas.height;
    const offCtx = offCanvas.getContext('2d');

    ctxStrobo.putImageData(frames[0].img, 0, 0);
    ctxStrobo.globalCompositeOperation = 'darken';

    for (let i = step; i < frames.length; i += step) {
        offCtx.putImageData(frames[i].img, 0, 0);
        ctxStrobo.drawImage(offCanvas, 0, 0);
    }

    ctxStrobo.globalCompositeOperation = 'source-over';

    if (dataPoints.length > 0) {
        const startTime = frames[0].time;
        let prevPoint = null;

        for (let i = 0; i < dataPoints.length; i++) {
            const dp = dataPoints[i];

            ctxStrobo.fillStyle = 'red';
            ctxStrobo.beginPath();
            ctxStrobo.arc(dp.x, dp.y, 5, 0, 2 * Math.PI);
            ctxStrobo.fill();

            ctxStrobo.strokeStyle = 'yellow';
            ctxStrobo.lineWidth = 2;
            ctxStrobo.beginPath();
            ctxStrobo.arc(dp.x, dp.y, 5, 0, 2 * Math.PI);
            ctxStrobo.stroke();

            const timeText = (dp.time - startTime).toFixed(3) + 's';
            ctxStrobo.font = "bold 14px 'Segoe UI', Arial, sans-serif";
            ctxStrobo.fillStyle = "yellow";
            ctxStrobo.shadowColor = "black";
            ctxStrobo.shadowBlur = 4;
            ctxStrobo.shadowOffsetX = 1;
            ctxStrobo.shadowOffsetY = 1;

            ctxStrobo.fillText(timeText, dp.x + 12, dp.y + 6);

            ctxStrobo.shadowColor = "transparent";
            ctxStrobo.shadowBlur = 0;
            ctxStrobo.shadowOffsetX = 0;
            ctxStrobo.shadowOffsetY = 0;

            if (prevPoint) {
                ctxStrobo.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                ctxStrobo.lineWidth = 2;
                ctxStrobo.beginPath();
                ctxStrobo.moveTo(prevPoint.x, prevPoint.y);
                ctxStrobo.lineTo(dp.x, dp.y);
                ctxStrobo.stroke();
            }
            prevPoint = dp;
        }
    }

    isSelectingMode = false;
    frameNavControls.style.display = 'none';
    trackingInfo.style.display = 'none';
    statusMsg.innerText = "분석 완료! 합성된 사진은 아래에, 그래프와 맞춤 결과는 6. 결과에서 확인하세요.";
    analysisDone = true;
    document.getElementById('result-empty').hidden = true;
    renderDataTable();
    drawGraph();
    btnCsv.style.display = 'inline-block';
    stroboContainer.scrollIntoView({ behavior: 'smooth' });
});

/* ========================================
   그래프 및 데이터 내보내기
   ======================================== */

function drawGraph() {
    chartWrapper.style.display = 'block';
    const ctxChart = document.getElementById('chart').getContext('2d');

    if (dataPoints.length === 0) return;

    const startTime = frames[0].time;
    const pixelToMm = parseFloat(pixelToMmInput.value);
    const rows = measuredRows();
    const ts = rows.map(r => r.t);
    const calibNote = Math.abs(pixelToMm - 1) < 1e-9
        ? '기준 길이를 재지 않아 1 px = 1 mm 로 계산했습니다. 5. 데이터에서 기준 길이를 재면 g 값이 맞게 나옵니다.'
        : '';
    const fmt = (v, d) => (v === null || !isFinite(v)) ? '-' : v.toFixed(d);

    if (currentAnalysisMode === 'free-fall') {
        // 자유낙하: 시간 vs Y 좌표 (아래가 +), 2차 함수 맞춤 y = a + bt + ct² → g = 2c
        document.getElementById('projectile-charts').style.display = 'none';
        const fit = polyFit(ts, rows.map(r => r.y), 2);
        const g = fit ? 2 * fit.coef[2] / 1000 : null;   // mm/s² → m/s²
        showFitResult(fit ? [
            { label: '맞춤식 (y: mm, t: s)', value: `y = ${fit.coef[0].toFixed(1)} + ${fit.coef[1].toFixed(1)}t + ${fit.coef[2].toFixed(1)}t²` },
            { label: '중력가속도 g = 2c', value: `${fmt(g, 2)} m/s²` },
            { label: '9.8 m/s² 와의 상대 오차', value: `${fmt(Math.abs(g - 9.8) / 9.8 * 100, 1)} %` },
            { label: '처음 속도 b', value: `${fmt(fit.coef[1] / 1000, 3)} m/s` },
            { label: '결정계수 R²', value: fmt(fit.r2, 4) }
        ] : [], (fit ? '' : '맞춤에는 점이 4개 이상 필요합니다. ') + calibNote);
        const scatterData = dataPoints.map(dp => ({
            x: (dp.time - startTime).toFixed(4),
            y: (dp.y * pixelToMm).toFixed(2)
        }));

        if (chartInstance) chartInstance.destroy();
        chartInstance = new Chart(ctxChart, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '낙하 거리 (mm)',
                    data: scatterData,
                    backgroundColor: 'red',
                    borderColor: 'red',
                    showLine: true,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 6
                }, {
                    label: '2차 함수 맞춤',
                    data: fitCurve(fit, ts),
                    borderColor: 'rgba(21, 101, 192, 0.8)',
                    backgroundColor: 'rgba(21, 101, 192, 0.8)',
                    showLine: true,
                    borderDash: [6, 4],
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: '경과 시간 (초)',
                            font: { size: 14 }
                        }
                    },
                    y: {
                        reverse: true,
                        title: {
                            display: true,
                            text: '낙하 거리 (mm)',
                            font: { size: 14 }
                        }
                    }
                }
            }
        });
    } else {
        // 2차원 운동: 3개 그래프 표시 (X-t, Y-t, Y-X)
        document.getElementById('projectile-charts').style.display = 'block';
        chartWrapper.style.display = 'none';
        
        const firstPoint = dataPoints[0];
        const baseX = firstPoint.x;
        const baseY = firstPoint.y;
        
        // 맞춤: x–t 는 직선(수평 속도), y–t 는 2차 함수(위쪽 + 이므로 g = −2c)
        const fitX = polyFit(ts, rows.map(r => r.x), 1);
        const fitY = polyFit(ts, rows.map(r => r.y), 2);
        const gY = fitY ? -2 * fitY.coef[2] / 1000 : null;
        const items = [];
        if (fitX) {
            items.push({ label: 'x–t 직선 맞춤 기울기 (수평 속도 vₓ)', value: `${fmt(fitX.coef[1] / 1000, 3)} m/s` });
            items.push({ label: 'x–t 결정계수 R²', value: fmt(fitX.r2, 4) });
        }
        if (fitY) {
            items.push({ label: 'y–t 2차 맞춤으로 구한 g = −2c', value: `${fmt(gY, 2)} m/s²` });
            items.push({ label: '9.8 m/s² 와의 상대 오차', value: `${fmt(Math.abs(gY - 9.8) / 9.8 * 100, 1)} %` });
            items.push({ label: 'y–t 결정계수 R²', value: fmt(fitY.r2, 4) });
        }
        showFitResult(items, (fitY ? '' : '맞춤에는 점이 4개 이상 필요합니다. ') + calibNote);

        // 상대 좌표 계산 (첫 점을 원점으로, 화면 좌표계 반대)
        const scatterDataXT = dataPoints.map(dp => ({
            x: (dp.time - startTime).toFixed(4),
            y: ((dp.x - baseX) * pixelToMm).toFixed(2)
        }));
        
        const scatterDataYT = dataPoints.map(dp => ({
            x: (dp.time - startTime).toFixed(4),
            y: ((baseY - dp.y) * pixelToMm).toFixed(2)  // 위쪽이 +
        }));
        
        const scatterDataYX = dataPoints.map(dp => ({
            x: ((dp.x - baseX) * pixelToMm).toFixed(2),
            y: ((baseY - dp.y) * pixelToMm).toFixed(2)
        }));
        
        // 기존 차트 인스턴스 정리
        if (window.chartXT) window.chartXT.destroy();
        if (window.chartYT) window.chartYT.destroy();
        if (window.chartYX) window.chartYX.destroy();
        
        // X-T 그래프
        const ctxXT = document.getElementById('chart-x-t').getContext('2d');
        window.chartXT = new Chart(ctxXT, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'X 위치 (mm)',
                    data: scatterDataXT,
                    backgroundColor: 'blue',
                    borderColor: 'blue',
                    showLine: true,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5
                }, {
                    label: '직선 맞춤',
                    data: fitCurve(fitX, ts),
                    borderColor: 'rgba(95, 107, 122, 0.9)',
                    backgroundColor: 'rgba(95, 107, 122, 0.9)',
                    showLine: true,
                    borderDash: [6, 4],
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: '시간 (초)', font: { size: 12 } }
                    },
                    y: {
                        title: { display: true, text: 'X (mm)', font: { size: 12 } }
                    }
                }
            }
        });
        
        // Y-T 그래프
        const ctxYT = document.getElementById('chart-y-t').getContext('2d');
        window.chartYT = new Chart(ctxYT, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Y 위치 (mm)',
                    data: scatterDataYT,
                    backgroundColor: 'green',
                    borderColor: 'green',
                    showLine: true,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5
                }, {
                    label: '2차 함수 맞춤',
                    data: fitCurve(fitY, ts),
                    borderColor: 'rgba(95, 107, 122, 0.9)',
                    backgroundColor: 'rgba(95, 107, 122, 0.9)',
                    showLine: true,
                    borderDash: [6, 4],
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: '시간 (초)', font: { size: 12 } }
                    },
                    y: {
                        title: { display: true, text: 'Y (mm)', font: { size: 12 } }
                    }
                }
            }
        });
        
        // Y-X 궤적 그래프
        const ctxYX = document.getElementById('chart-y-x').getContext('2d');
        window.chartYX = new Chart(ctxYX, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '궤적',
                    data: scatterDataYX,
                    backgroundColor: 'red',
                    borderColor: 'red',
                    showLine: true,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'X (mm)', font: { size: 12 } }
                    },
                    y: {
                        title: { display: true, text: 'Y (mm)', font: { size: 12 } }
                    }
                },
                aspectRatio: 1.2
            }
        });
    }
}

btnDownloadStrobo.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'stroboscopic_image.png';
    link.href = canvasStrobo.toDataURL('image/png');
    link.click();
});

btnCsv.addEventListener('click', () => {
    if (dataPoints.length === 0) return;
    const startTime = frames[0].time;
    const pixelToMm = parseFloat(pixelToMmInput.value);
    
    if (currentAnalysisMode === 'free-fall') {
        let csvContent = "data:text/csv;charset=utf-8,Time (s),X Position (mm),Y Position (mm)\n";
        dataPoints.forEach(row => {
            csvContent += `${(row.time - startTime).toFixed(4)},${(row.x * pixelToMm).toFixed(2)},${(row.y * pixelToMm).toFixed(2)}\n`;
        });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "free_fall_analysis.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        // 2차원 운동: 첫 점 기준 상대 좌표
        const firstPoint = dataPoints[0];
        const baseX = firstPoint.x;
        const baseY = firstPoint.y;
        
        let csvContent = "data:text/csv;charset=utf-8,Time (s),X Position (mm),Y Position (mm)\n";
        dataPoints.forEach(row => {
            const relX = ((row.x - baseX) * pixelToMm).toFixed(2);
            const relY = ((baseY - row.y) * pixelToMm).toFixed(2);  // 위쪽이 +
            csvContent += `${(row.time - startTime).toFixed(4)},${relX},${relY}\n`;
        });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "projectile_motion_analysis.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});

btnReset.addEventListener('click', () => { location.reload(); });

/* ========================================
   7단계 화면 (js/lab-ui.js 의 LabUI.initSteps)
   - 결과 단계가 보일 때 숨어 있던 그래프 크기를 다시 잡는다
   ======================================== */
(function initPage() {
    let savedMode = 'free-fall';
    try { savedMode = localStorage.getItem(MODE_KEY) || 'free-fall'; } catch (e) { /* 저장 불가 */ }
    setAnalysisMode(savedMode, false);

    if (window.LabUI && LabUI.initSteps) {
        LabUI.initSteps({
            key: 'free-fall',
            onShow: step => {
                if (step === 'result') {
                    [chartInstance, window.chartXT, window.chartYT, window.chartYX].forEach(c => {
                        if (c) c.resize();
                    });
                }
            }
        });
    }
})();
