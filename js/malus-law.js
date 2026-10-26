// 말루스 법칙 실험: 스마트폰 카메라(또는 촬영한 사진)로 각도별 밝기를 측정하고 cos² 법칙을 검증한다.
(function () {
    'use strict';
    const M = window.MalusMath;
    const $ = id => document.getElementById(id);
    const STORE_KEY = 'malus-law-v1';

    const state = {
        kind: null,          // 'video' | 'photo'
        stream: null,
        track: null,
        caps: {},
        photo: null,         // HTMLImageElement
        cx: 0.5, cy: 0.5,    // 측정 영역 중심 (0~1)
        size: 100,           // 측정 영역 한 변 (원본 픽셀)
        dark: null,          // { value, ch, gamma }
        points: [],
        busy: false,
        zoom: false,         // 측정 영역 근처만 확대해서 보기
        frozenView: null,    // 끄는 동안 화면이 따라 움직이지 않도록 고정한 보기 영역
        refPos: null,        // 이번 회차 첫 측정 때 빛 번짐 위치 (카메라 움직임 감지용)
        run: 1               // 현재 측정 회차
    };

    const video = $('video');
    const view = $('view');
    const vctx = view.getContext('2d');
    const mcv = document.createElement('canvas');
    const mctx = mcv.getContext('2d', { willReadFrequently: true });
    let table = M.linearTable($('sel-gamma').value);

    // ---------- 저장 ----------
    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify({
                points: state.points, dark: state.dark,
                ch: $('sel-channel').value, gamma: $('sel-gamma').value,
                angle: $('angle').value, step: $('step').value,
                zoom: state.zoom, delay: $('delay').value, track: $('track').checked, refPos: state.refPos, run: state.run
            }));
        } catch (e) { /* 저장소를 쓸 수 없어도 동작에는 영향 없음 */ }
    }
    function load() {
        try {
            const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (!d) return;
            state.points = Array.isArray(d.points) ? d.points : [];
            state.dark = d.dark || null;
            if (d.ch) $('sel-channel').value = d.ch;
            if (d.gamma) $('sel-gamma').value = d.gamma;
            if (d.angle != null) $('angle').value = d.angle;
            if (d.step != null) $('step').value = d.step;
            if (d.zoom != null) state.zoom = !!d.zoom;
            if (d.delay != null) $('delay').value = d.delay;
            if (d.track != null) $('track').checked = !!d.track;
            state.refPos = d.refPos || null;
            // 회차 기능 이전에 저장된 점은 1회차로 본다
            state.points.forEach(p => { if (p.run == null) p.run = 1; });
            state.run = Math.max(d.run || 1, ...state.points.map(p => p.run), 1);
            table = M.linearTable($('sel-gamma').value);
        } catch (e) { /* 무시 */ }
    }

    // ---------- 소스(카메라/사진) ----------
    function srcEl() { return state.kind === 'video' ? video : state.kind === 'photo' ? state.photo : null; }
    function srcDims() {
        if (state.kind === 'video') return { w: video.videoWidth, h: video.videoHeight };
        if (state.kind === 'photo') return { w: state.photo.naturalWidth, h: state.photo.naturalHeight };
        return { w: 0, h: 0 };
    }

    function showMsg(text, ok) {
        const el = $('cam-msg');
        el.textContent = text || '';
        el.className = ok ? 'ok' : 'warn';
        el.hidden = !text;
    }

    async function startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showMsg('이 브라우저/주소에서는 카메라를 쓸 수 없습니다. https 주소로 접속했는지 확인하세요. (사진 불러오기는 사용 가능)');
            return;
        }
        try {
            if (state.stream) state.stream.getTracks().forEach(t => t.stop());
            state.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            });
            video.srcObject = state.stream;
            await video.play();
            state.track = state.stream.getVideoTracks()[0];
            state.caps = (state.track.getCapabilities && state.track.getCapabilities()) || {};
            state.kind = 'video';
            showMsg('');
            setupManualControls();
            updateSizeRange();
            $('btn-cam').textContent = '📷 카메라 다시 켜기';
            refreshButtons();
        } catch (e) {
            showMsg('카메라를 켤 수 없습니다: ' + (e && e.message ? e.message : e) + ' — 권한을 허용했는지, https 주소인지 확인하세요.');
        }
    }

    // 수동 노출 지원 여부 확인 및 슬라이더 구성 (Chrome Android 등)
    function setupManualControls() {
        const c = state.caps, s = state.track.getSettings ? state.track.getSettings() : {};
        const canLock = !!((c.exposureMode && c.exposureMode.includes('manual')) || c.exposureTime || c.iso);
        $('btn-lock').disabled = !canLock;
        $('manual-box').hidden = !(c.exposureTime || c.iso);
        const bind = (rowId, slId, txtId, cap, cur, unit, key) => {
            const row = $(rowId);
            row.hidden = !cap;
            if (!cap) return;
            const sl = $(slId);
            sl.min = cap.min; sl.max = cap.max; sl.step = cap.step || 1;
            sl.value = cur != null ? cur : cap.min;
            const upd = () => { $(txtId).textContent = unit(parseFloat(sl.value)); };
            upd();
            sl.oninput = async () => {
                upd();
                try { await state.track.applyConstraints({ advanced: [{ exposureMode: 'manual', [key]: parseFloat(sl.value) }] }); }
                catch (e) { showMsg('노출 설정을 적용하지 못했습니다: ' + e.message); }
            };
        };
        bind('row-exp', 'sl-exp', 'txt-exp', c.exposureTime, s.exposureTime, v => (v / 10).toFixed(1) + ' ms', 'exposureTime');
        bind('row-iso', 'sl-iso', 'txt-iso', c.iso, s.iso, v => String(Math.round(v)), 'iso');
        if (!canLock) {
            showMsg('이 기기/브라우저는 웹에서 노출 고정을 지원하지 않습니다. 기본 카메라 앱에서 노출을 고정(AE/AF 잠금 또는 프로 모드)해 각도별로 사진을 찍은 뒤 "사진 불러오기"로 측정하세요.');
        }
    }

    async function lockExposure() {
        const c = state.caps, s = state.track.getSettings();
        const adv = {};
        if (c.exposureMode && c.exposureMode.includes('manual')) {
            adv.exposureMode = 'manual';
            if (s.exposureTime != null) adv.exposureTime = s.exposureTime;
        }
        if (c.iso && s.iso != null) adv.iso = s.iso;
        if (c.whiteBalanceMode && c.whiteBalanceMode.includes('manual')) {
            adv.whiteBalanceMode = 'manual';
            if (s.colorTemperature != null) adv.colorTemperature = s.colorTemperature;
        }
        if (c.focusMode && c.focusMode.includes('manual')) {
            adv.focusMode = 'manual';
            if (s.focusDistance != null) adv.focusDistance = s.focusDistance;
        }
        try {
            await state.track.applyConstraints({ advanced: [adv] });
            const n = state.track.getSettings();
            const bits = [];
            if (n.exposureMode) bits.push('노출: ' + n.exposureMode);
            if (n.whiteBalanceMode) bits.push('화이트밸런스: ' + n.whiteBalanceMode);
            if (n.focusMode) bits.push('초점: ' + n.focusMode);
            showMsg('고정 적용됨 — ' + (bits.join(', ') || '설정 완료') + '. 값이 "manual"이 아니면 기기가 일부 고정을 지원하지 않는 것입니다.', true);
        } catch (e) {
            showMsg('노출 고정 실패: ' + e.message);
        }
    }

    function loadPhoto(file) {
        if (!file) return;
        const img = new Image();
        img.onload = () => {
            state.photo = img;
            state.kind = 'photo';
            updateSizeRange();
            refreshButtons();
            showMsg('');
        };
        img.onerror = () => showMsg('사진을 열 수 없습니다.');
        img.src = URL.createObjectURL(file);
    }

    // ---------- 측정 영역 ----------
    function updateSizeRange() {
        const d = srcDims();
        if (!d.w) return;
        const sl = $('roi-size');
        sl.max = Math.min(d.w, d.h);
        if (state.size > +sl.max) state.size = +sl.max;
        sl.value = state.size;
        $('roi-size-txt').textContent = state.size + ' px';
    }

    function roiRect() {
        const d = srcDims();
        const s = Math.max(4, Math.min(Math.round(state.size), d.w, d.h));
        let x = Math.round(state.cx * d.w - s / 2), y = Math.round(state.cy * d.h - s / 2);
        x = Math.max(0, Math.min(d.w - s, x));
        y = Math.max(0, Math.min(d.h - s, y));
        return { x, y, s };
    }

    // 픽셀 하나의 선택 채널 선형 밝기와 8비트 원값
    function chanLin(r, g, b, ch) {
        if (ch === 'r') return table[r];
        if (ch === 'g') return table[g];
        if (ch === 'b') return table[b];
        if (ch === 'y') return 0.2126 * table[r] + 0.7152 * table[g] + 0.0722 * table[b];
        return Math.max(table[r], table[g], table[b]);
    }
    function chanRaw(r, g, b, ch) {
        return ch === 'r' ? r : ch === 'g' ? g : ch === 'b' ? b : Math.max(r, g, b);
    }

    // 원본에서 (x, y, w, h) 영역의 선택 채널 선형 밝기 배열을 읽는다.
    function readRegion(x, y, w, h) {
        if (mcv.width !== w || mcv.height !== h) { mcv.width = w; mcv.height = h; }
        mctx.drawImage(srcEl(), x, y, w, h, 0, 0, w, h);
        const data = mctx.getImageData(0, 0, w, h).data;
        const ch = $('sel-channel').value;
        const v = new Float32Array(w * h);
        let sat = 0, max = 0;
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            v[j] = chanLin(r, g, b, ch);
            const pm = chanRaw(r, g, b, ch);
            if (pm > max) max = pm;
            if (pm >= 250) sat++;
        }
        return { v, sat: sat / (w * h), max };
    }

    // 현재 프레임에서 ROI의 평균 선형 밝기를 구한다.
    function measure(withEdge) {
        if (!srcEl()) return null;
        const { x, y, s } = roiRect();
        const r = readRegion(x, y, s, s);
        let sum = 0;
        for (let i = 0; i < r.v.length; i++) sum += r.v[i];
        const out = { mean: sum / r.v.length, sat: r.sat, max: r.max };
        if (withEdge) out.edge = M.edgeRatio(r.v, s);
        return out;
    }

    // 측정 영역 주변(2.5배)에서 빛 번짐 중심을 찾아 영역을 그 위치로 옮긴다.
    // 빛이 너무 어두우면(소광 근처) 위치를 믿을 수 없으므로 옮기지 않는다.
    function trackSpot() {
        const d = srcDims(), roi = roiRect();
        const side = Math.min(Math.round(roi.s * 2.5), d.w, d.h);
        let x = Math.round(roi.x + roi.s / 2 - side / 2), y = Math.round(roi.y + roi.s / 2 - side / 2);
        x = Math.max(0, Math.min(d.w - side, x));
        y = Math.max(0, Math.min(d.h - side, y));
        const c = M.spotCentroid(readRegion(x, y, side, side).v, side, side);
        if (!c || c.contrast < 0.02) return null;
        const ncx = (x + c.x + 0.5) / d.w, ncy = (y + c.y + 0.5) / d.h;
        const moved = Math.hypot((ncx - state.cx) * d.w, (ncy - state.cy) * d.h);
        state.cx = ncx; state.cy = ncy;
        return moved;
    }

    // ---------- 화면 그리기 ----------
    let lastLive = 0;
    // 화면에 보여 줄 원본 영역. 확대 보기에서는 측정 영역의 3배 정사각형만 잘라서 보여 준다.
    function viewRect() {
        const d = srcDims();
        if (!state.zoom) return { x: 0, y: 0, w: d.w, h: d.h };
        if (state.frozenView) return state.frozenView;
        const r = roiRect();
        const c = Math.min(Math.max(r.s * 3, 120), d.w, d.h);
        let x = Math.round(r.x + r.s / 2 - c / 2), y = Math.round(r.y + r.s / 2 - c / 2);
        x = Math.max(0, Math.min(d.w - c, x));
        y = Math.max(0, Math.min(d.h - c, y));
        return { x, y, w: c, h: c };
    }

    function frame(ts) {
        requestAnimationFrame(frame);
        const d = srcDims();
        if (!d.w) return;
        const el = srcEl();
        const vr = viewRect();
        // 확대 보기는 잘라낸 부분만 그리므로 전체 보기보다 가볍다.
        const W = Math.max(Math.min(vr.w, 960), Math.min(480, 960)), H = Math.round(W * vr.h / vr.w);
        if (view.width !== W || view.height !== H) { view.width = W; view.height = H; }
        vctx.drawImage(el, vr.x, vr.y, vr.w, vr.h, 0, 0, W, H);
        const r = roiRect(), k = W / vr.w;
        // 화면에서 약 3px 두께가 되도록 캔버스 배율을 반영하고, 밝은 배경에서도 보이게 검은 테두리를 함께 그린다.
        const px = W / (view.clientWidth || W);
        const rx = (r.x - vr.x) * k, ry = (r.y - vr.y) * k, rs = r.s * k;
        vctx.lineWidth = 5 * px; vctx.strokeStyle = 'rgba(0,0,0,.7)';
        vctx.strokeRect(rx, ry, rs, rs);
        vctx.lineWidth = 3 * px; vctx.strokeStyle = '#2ee66b';
        vctx.strokeRect(rx, ry, rs, rs);
        if (ts - lastLive > 150) {
            lastLive = ts;
            const m = measure(true);
            if (m) {
                // 번짐이 영역보다 훨씬 크거나 빛이 없으면 가장자리 비율이 1 근처라 경고하지 않는다.
                $('edge-warn').hidden = !(m.edge > 0.35 && m.edge < 0.9 && m.max > 30);
                const dv = state.dark && state.dark.ch === $('sel-channel').value && state.dark.gamma === $('sel-gamma').value ? state.dark.value : 0;
                $('live-val').textContent = (m.mean - dv).toFixed(4);
                $('live-sat').textContent = (m.sat * 100).toFixed(1) + ' %';
                $('live-max').textContent = m.max;
                $('sat-warn').hidden = !(m.sat > 0.01);
            }
        }
    }

    function pointerMove(ev) {
        if (!srcEl()) return;
        const b = view.getBoundingClientRect(), d = srcDims(), vr = viewRect();
        const sx = vr.x + (ev.clientX - b.left) / b.width * vr.w;
        const sy = vr.y + (ev.clientY - b.top) / b.height * vr.h;
        state.cx = Math.max(0, Math.min(1, sx / d.w));
        state.cy = Math.max(0, Math.min(1, sy / d.h));
    }
    let dragging = false;
    const endDrag = () => { dragging = false; state.frozenView = null; };
    view.addEventListener('pointerdown', e => {
        if (state.busy) return;   // 측정 중에는 영역을 옮기지 않는다
        dragging = true;
        state.frozenView = state.zoom ? viewRect() : null;
        view.setPointerCapture(e.pointerId);
        pointerMove(e);
    });
    view.addEventListener('pointermove', e => { if (dragging) pointerMove(e); });
    view.addEventListener('pointerup', endDrag);
    view.addEventListener('pointercancel', endDrag);

    function setZoom(on) {
        state.zoom = on;
        $('btn-zoom').textContent = on ? '🔭 전체 보기' : '🔍 측정 영역 확대 보기';
        save();
    }

    // ---------- 측정 기록 ----------
    function nextFrame() {
        if (state.kind === 'video' && video.requestVideoFrameCallback) {
            return new Promise(res => video.requestVideoFrameCallback(() => res()));
        }
        return new Promise(res => requestAnimationFrame(() => res()));
    }

    async function sample(n, label) {
        const means = [], sats = [];
        const count = state.kind === 'video' ? n : 1;
        for (let i = 0; i < count; i++) {
            if (state.kind === 'video') await nextFrame();
            const m = measure();
            means.push(m.mean); sats.push(m.sat);
            $('rec-status').textContent = label + ' ' + (i + 1) + '/' + count;
        }
        return { mean: M.mean(means), sd: M.std(means), sat: M.mean(sats) };
    }

    const sleep = ms => new Promise(res => setTimeout(res, ms));

    // 버튼을 누른 손의 흔들림이 가라앉을 때까지 기다린다.
    async function settle() {
        const sec = Math.max(0, Math.min(10, parseFloat($('delay').value) || 0));
        for (let t = Math.ceil(sec); t > 0; t--) {
            $('rec-status').textContent = '✋ 폰에서 손을 떼세요… ' + t;
            await sleep(Math.min(1000, sec * 1000 - (Math.ceil(sec) - t) * 1000));
        }
    }

    function currentFrames() {
        return Math.max(1, Math.min(300, parseInt($('frames').value, 10) || 30));
    }

    async function recordDark() {
        if (state.busy || !srcEl()) return;
        state.busy = true; refreshButtons();
        await settle();
        const r = await sample(currentFrames(), '배경 측정');
        state.dark = { value: r.mean, ch: $('sel-channel').value, gamma: $('sel-gamma').value };
        $('rec-status').textContent = '배경 ' + r.mean.toFixed(5) + ' 저장됨';
        state.busy = false;
        save(); render();
    }

    async function recordPoint() {
        if (state.busy || !srcEl()) return;
        const theta = parseFloat($('angle').value);
        if (!isFinite(theta)) { $('rec-status').textContent = '각도를 입력하세요.'; return; }
        state.busy = true; refreshButtons();
        await settle();
        let note = '';
        if ($('track').checked) {
            const moved = trackSpot();
            if (moved != null && moved >= 1) note += ' · 위치 보정 ' + moved.toFixed(0) + 'px';
        }
        const m0 = measure(true);
        const r = await sample(currentFrames(), '측정 중');
        // 카메라 움직임 감지: 이번 회차 첫 측정 때의 빛 위치에서 영역 크기의 30% 넘게 벗어나면 경고
        const d = srcDims();
        if (!state.refPos || !state.points.some(p => p.run === state.run)) state.refPos = { cx: state.cx, cy: state.cy };
        const drift = Math.hypot((state.cx - state.refPos.cx) * d.w, (state.cy - state.refPos.cy) * d.h);
        const shifted = drift > roiRect().s * 0.3;
        $('move-warn').hidden = !shifted;
        // 카메라가 움직인 것으로 보이는 점은 자동으로 결측치로 표시한다 (표에서 되돌릴 수 있음)
        state.points.push({ run: state.run, theta, raw: r.mean, sd: r.sd, sat: r.sat, ch: $('sel-channel').value, gamma: $('sel-gamma').value,
            edge: m0 ? m0.edge : 0, drift: Math.round(drift), excluded: shifted });
        if (shifted) note += ' · 결측 처리됨';
        if ($('auto-step').checked) $('angle').value = theta + (parseFloat($('step').value) || 10);
        $('rec-status').textContent = theta + '° 기록 완료' + (r.sat > 0.01 ? ' (⚠ 포화)' : '') + note;
        state.busy = false;
        save(); render();
    }

    // ---------- 데이터/결과 ----------
    function darkValue() {
        const ch = $('sel-channel').value, g = $('sel-gamma').value;
        return state.dark && state.dark.ch === ch && state.dark.gamma === g ? state.dark.value : 0;
    }
    function intensity(p) {
        return p.raw - (state.dark && state.dark.ch === p.ch && state.dark.gamma === p.gamma ? state.dark.value : 0);
    }

    const RUN_COLORS = ['#1c64f2', '#e8590c', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#c92a2a', '#5c940d'];
    const runColor = run => RUN_COLORS[(run - 1) % RUN_COLORS.length];

    // 표·그래프·내보내기에 공통으로 쓰는 분석 결과
    function analysis() {
        const pts = state.points.map(p => ({ run: p.run, theta: p.theta, y: intensity(p), sd: p.sd, excluded: !!p.excluded }));
        return { pts, an: M.analyzeRuns(pts) };
    }

    function newRun() {
        if (state.busy) return;
        if (!state.points.some(p => p.run === state.run)) return;   // 빈 회차는 새로 만들지 않는다
        state.run += 1;
        state.refPos = null;
        $('move-warn').hidden = true;
        $('angle').value = 0;
        $('rec-status').textContent = state.run + '회차를 시작합니다. 카메라·스크린 정렬을 다시 확인하세요.';
        save(); render();
    }

    function render() {
        const { pts, an } = analysis();
        $('tbody').innerHTML = '';
        state.points.forEach((p, i) => {
            const q = an.norm[i];
            const tr = document.createElement('tr');
            if (p.excluded) tr.className = 'excluded';
            tr.innerHTML = '<td><span class="run-dot" style="background:' + runColor(p.run) + '"></span>' + p.run + '</td><td>' + p.theta +
                '</td><td>' + pts[i].y.toFixed(4) + '</td><td>' + (q ? q.n.toFixed(3) : (p.excluded ? '결측' : '–')) +
                '</td><td>' + (p.sat > 0.01 ? '⚠ ' : '') + (p.sat * 100).toFixed(1) + '%</td>' +
                '<td class="acts"><button class="secondary">' + (p.excluded ? '복원' : '결측') + '</button> <button class="danger">삭제</button></td>';
            const [bEx, bDel] = tr.querySelectorAll('button');
            bEx.onclick = () => { p.excluded = !p.excluded; save(); render(); };
            bDel.onclick = () => { state.points.splice(i, 1); save(); render(); };
            $('tbody').appendChild(tr);
        });
        const nEx = state.points.filter(p => p.excluded).length;
        $('cnt').textContent = '(' + state.points.length + '개' + (nEx ? ', 결측 ' + nEx + '개' : '') + ')';
        $('run-label').textContent = state.run + '회차';
        $('run-count').textContent = state.points.filter(p => p.run === state.run).length + '점 측정됨';
        $('btn-new-run').disabled = state.busy || !state.points.some(p => p.run === state.run);
        $('btn-csv').disabled = $('btn-clear').disabled = $('btn-copy').disabled = $('btn-gs').disabled = $('btn-gs-oauth').disabled = state.points.length === 0;
        const locked = state.points.length > 0;
        $('sel-channel').disabled = $('sel-gamma').disabled = locked;
        $('chan-warn').hidden = !locked;
        $('dark-txt').textContent = state.dark ? '배경 = ' + state.dark.value.toFixed(5) + ' (' + state.dark.ch.toUpperCase() + ', ' + state.dark.gamma + ')' : '배경 미측정';
        $('btn-dark-clear').hidden = !state.dark;
        refreshButtons();
        renderResults(pts, an);
    }

    function refreshButtons() {
        const has = !!srcEl();
        $('btn-record').disabled = !has || state.busy;
        $('btn-dark').disabled = !has || state.busy;
    }

    function renderResults(pts, an) {
        const verdict = $('verdict');
        const c1 = $('chart1'), c2 = $('chart2');
        // 회차별 결과 표
        const rows = an.runs.map(r => {
            const f = r.fit;
            const dot = '<span class="run-dot" style="background:' + runColor(r.run) + '"></span>';
            return '<tr><td>' + dot + r.run + '</td><td>' + r.n + (r.total > r.n ? ' / ' + r.total : '') + '</td>' +
                (f ? '<td>' + f.A.toFixed(4) + '</td><td>' + f.B.toFixed(4) + '</td><td>' + f.theta0.toFixed(1) + '°</td><td>' + f.r2.toFixed(4) + '</td>'
                   : '<td colspan="4">유효한 점 3개 이상 필요</td>') + '</tr>';
        }).join('');
        $('run-table').innerHTML = rows;
        $('run-table-wrap').hidden = an.runs.length === 0;

        // 그래프 1: 회차별 원래 밝기와 그 회차의 적합 곡선
        const minTheta = Math.min(0, ...pts.map(p => p.theta)), maxTheta = Math.max(180, ...pts.map(p => p.theta));
        const series1 = an.runs.map(r => {
            const curve = [];
            if (r.fit) for (let t = minTheta; t <= maxTheta; t += 2) curve.push({ x: t, y: r.fit.model(t) });
            return {
                color: runColor(r.run), curve,
                pts: pts.filter(p => p.run === r.run).map(p => ({ x: p.theta, y: p.y, e: p.sd, hollow: p.excluded }))
            };
        });
        drawChart(c1, { series: series1, xl: '각도 θ (°)', yl: '밝기 I', xmin: minTheta, xmax: maxTheta });

        // 그래프 2: 회차마다 정규화한 값을 모두 모아 이론선 n = x 와 비교
        const series2 = an.runs.map(r => ({
            color: runColor(r.run),
            pts: pts.map((p, i) => p.run === r.run ? an.norm[i] : null).filter(Boolean).map(q => ({ x: q.x, y: q.n, e: q.e }))
        }));
        drawChart(c2, { series: series2, line: [{ x: 0, y: 0 }, { x: 1, y: 1 }], xl: 'cos²(θ − θ₀)', yl: '정규화 밝기 (I − B) / A', xmin: 0, xmax: 1, ymin: -0.1, ymax: 1.1 });

        const cell = (t, v) => '<div>' + t + '<b>' + v + '</b></div>';
        const fitted = an.runs.filter(r => r.fit);
        if (an.r2 == null || !fitted.length) {
            $('results').innerHTML = '';
            verdict.hidden = true;
            return;
        }
        $('results').innerHTML =
            cell('분석에 쓴 회차', fitted.length + ' / ' + an.runs.length) +
            cell('사용한 점 (결측 제외)', an.used + '개') +
            cell('전체 결정계수 R²', an.r2.toFixed(4)) +
            (an.pooled ? cell('정규화 기울기 (이론값 1)', an.pooled.slope.toFixed(3)) : '') +
            cell('평균 소광비 Imin/Imax', (M.mean(fitted.map(r => r.fit.extinction)) * 100).toFixed(1) + ' %');
        const good = an.r2 >= 0.98;
        verdict.hidden = false;
        verdict.className = good ? 'ok' : 'warn';
        verdict.textContent = good
            ? '✅ 회차별로 정규화한 R² = ' + an.r2.toFixed(4) + ' — 측정값이 I = I₀cos²θ 형태(말루스 법칙)와 잘 일치합니다.'
            : '⚠️ 회차별로 정규화한 R² = ' + an.r2.toFixed(4) + ' — 오차가 큽니다. 회차 안에서 카메라가 움직인 점은 결측 처리하고, 포화·자동 노출·레이저 출력 변동·각도 오차를 점검하세요.';
    }

    // ---------- 그래프 (Canvas) ----------
    // o.series: [{ color, pts: [{x, y, e, hollow}], curve: [{x, y}] }], o.line: 점선 기준선
    function drawChart(cv, o) {
        const dpr = window.devicePixelRatio || 1;
        const W = cv.clientWidth || 600, H = cv.clientHeight || 280;
        cv.width = W * dpr; cv.height = H * dpr;
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        const L = 54, R = 12, T = 12, B = 40;
        const series = o.series || [];
        const all = series.flatMap(s => (s.pts || []).concat(s.curve || [])).concat(o.line || []);
        let xmin = o.xmin, xmax = o.xmax, ymin = o.ymin, ymax = o.ymax;
        if (xmin == null) xmin = all.length ? Math.min(...all.map(p => p.x)) : 0;
        if (xmax == null) xmax = all.length ? Math.max(...all.map(p => p.x)) : 1;
        if (ymin == null) ymin = all.length ? Math.min(0, ...all.map(p => p.y - (p.e || 0))) : 0;
        if (ymax == null) ymax = all.length ? Math.max(...all.map(p => p.y + (p.e || 0))) * 1.05 : 1;
        if (xmax === xmin) xmax = xmin + 1;
        if (ymax === ymin) ymax = ymin + 1;
        const X = x => L + (x - xmin) / (xmax - xmin) * (W - L - R);
        const Y = y => H - B - (y - ymin) / (ymax - ymin) * (H - T - B);
        g.font = '12px sans-serif'; g.fillStyle = '#555'; g.strokeStyle = '#e5e5e5'; g.lineWidth = 1;
        const ticks = (a, b, n) => { const out = []; for (let i = 0; i <= n; i++) out.push(a + (b - a) * i / n); return out; };
        g.textAlign = 'center';
        for (const t of ticks(xmin, xmax, 6)) {
            g.beginPath(); g.moveTo(X(t), T); g.lineTo(X(t), H - B); g.stroke();
            g.fillText(Math.abs(t) >= 10 ? t.toFixed(0) : t.toFixed(2), X(t), H - B + 15);
        }
        g.textAlign = 'right';
        for (const t of ticks(ymin, ymax, 5)) {
            g.beginPath(); g.moveTo(L, Y(t)); g.lineTo(W - R, Y(t)); g.stroke();
            g.fillText(t.toFixed(2), L - 6, Y(t) + 4);
        }
        g.strokeStyle = '#999'; g.strokeRect(L, T, W - L - R, H - T - B);
        g.fillStyle = '#333'; g.textAlign = 'center';
        g.fillText(o.xl || '', L + (W - L - R) / 2, H - 6);
        g.save(); g.translate(13, T + (H - T - B) / 2); g.rotate(-Math.PI / 2); g.fillText(o.yl || '', 0, 0); g.restore();
        g.save(); g.beginPath(); g.rect(L, T, W - L - R, H - T - B); g.clip();
        if (o.line) {
            g.setLineDash([6, 4]); g.strokeStyle = '#999'; g.lineWidth = 1.5; g.beginPath();
            o.line.forEach((p, i) => i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))); g.stroke(); g.setLineDash([]);
        }
        for (const s of series) {
            if (s.curve && s.curve.length) {
                g.strokeStyle = s.color; g.globalAlpha = 0.7; g.lineWidth = 2; g.beginPath();
                s.curve.forEach((p, i) => i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))); g.stroke();
                g.globalAlpha = 1;
            }
            for (const p of s.pts || []) {
                if (p.e) { g.strokeStyle = s.color; g.globalAlpha = 0.5; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(p.x), Y(p.y - p.e)); g.lineTo(X(p.x), Y(p.y + p.e)); g.stroke(); g.globalAlpha = 1; }
                g.beginPath(); g.arc(X(p.x), Y(p.y), 4, 0, 2 * Math.PI);
                // 결측 처리한 점은 속이 빈 원으로 표시
                if (p.hollow) { g.strokeStyle = s.color; g.lineWidth = 1.5; g.stroke(); }
                else { g.fillStyle = s.color; g.fill(); }
            }
        }
        g.restore();
    }

    function downloadCsv() {
        // 결측치는 정규화 칸을 비워 둔다 (스프레드시트·분석 프로그램에서 빈 칸 = 결측)
        const { an } = analysis();
        const rows = ['run,theta_deg,intensity,normalized,cos2,excluded,std,raw_mean,dark,saturated_fraction,channel,gamma,edge_ratio,drift_px'];
        state.points.forEach((p, i) => {
            const q = an.norm[i];
            rows.push([p.run, p.theta, intensity(p), q ? q.n : '', q ? q.x : '', p.excluded ? 1 : 0, p.sd, p.raw, p.raw - intensity(p), p.sat, p.ch, p.gamma,
                p.edge != null ? p.edge.toFixed(3) : '', p.drift != null ? p.drift : ''].join(','));
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + rows.join('\n')], { type: 'text/csv' }));
        a.download = 'malus-law.csv';
        document.body.appendChild(a); a.click(); a.remove();
    }

    // ---------- 구글 스프레드시트 ----------
    const GS_HEADER = ['시각', '이름/조', '회차', '각도(°)', '밝기 I', '정규화 (I−B)/A', 'cos²(θ−θ₀)', '결측', '표준편차', '원값', '배경', '포화비율', '채널', '감마'];
    function sheetRows() {
        const t = new Date().toLocaleString('ko-KR'), name = $('gs-name').value.trim();
        const { an } = analysis();
        return state.points.map((p, i) => {
            const q = an.norm[i];
            return [t, name, p.run, p.theta, intensity(p), q ? q.n : '', q ? q.x : '', p.excluded ? '결측' : '', p.sd, p.raw, p.raw - intensity(p), p.sat, p.ch, p.gamma];
        });
    }
    window.__malus = { header: GS_HEADER, rows: sheetRows };
    async function copyText(text, okMsg, el) {
        try { await navigator.clipboard.writeText(text); el.textContent = okMsg; }
        catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); el.textContent = okMsg; } catch (e2) { el.textContent = '복사 실패: 직접 선택해서 복사하세요.'; }
            ta.remove();
        }
    }
    function copyTable() {
        const rows = [GS_HEADER].concat(sheetRows());
        copyText(rows.map(r => r.join('\t')).join('\n'), '복사됨 — 시트에 붙여넣으세요.', $('gs-status'));
    }
    async function sendToSheet() {
        const url = $('gs-url').value.trim();
        if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { $('gs-status').textContent = 'script.google.com 웹 앱 URL을 입력하세요.'; return; }
        try { localStorage.setItem(STORE_KEY + '-gs', JSON.stringify({ url, name: $('gs-name').value })); } catch (e) { /* 무시 */ }
        $('gs-status').textContent = '전송 중…';
        try {
            // text/plain + no-cors: 사전 요청(CORS preflight) 없이 보내며, 응답은 읽을 수 없다.
            await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ header: GS_HEADER, rows: sheetRows() }) });
            $('gs-status').textContent = state.points.length + '행 전송 요청 완료 — 시트에서 확인하세요.';
        } catch (e) { $('gs-status').textContent = '전송 실패: ' + e.message; }
    }
    try {
        const g = JSON.parse(localStorage.getItem(STORE_KEY + '-gs') || 'null');
        if (g) { $('gs-url').value = g.url || ''; $('gs-name').value = g.name || ''; }
    } catch (e) { /* 무시 */ }
    $('btn-copy').onclick = copyTable;
    $('btn-gs').onclick = sendToSheet;
    $('btn-copy-code').onclick = () => copyText($('gs-code').textContent, '코드 복사됨', $('gs-status'));

    // ---------- 이벤트 ----------
    $('btn-cam').onclick = startCamera;
    $('btn-lock').onclick = lockExposure;
    $('btn-photo').onclick = () => $('file-photo').click();
    $('file-photo').onchange = e => { loadPhoto(e.target.files[0]); e.target.value = ''; };
    $('roi-size').oninput = e => { state.size = +e.target.value; $('roi-size-txt').textContent = state.size + ' px'; };
    $('sel-channel').onchange = () => { save(); render(); };
    $('sel-gamma').onchange = () => { table = M.linearTable($('sel-gamma').value); save(); render(); };
    $('btn-record').onclick = recordPoint;
    $('btn-dark').onclick = recordDark;
    $('btn-dark-clear').onclick = () => { state.dark = null; save(); render(); };
    const stepAngle = d => { $('angle').value = (parseFloat($('angle').value) || 0) + d * (parseFloat($('step').value) || 10); save(); };
    $('btn-step-up').onclick = () => stepAngle(1);
    $('btn-step-dn').onclick = () => stepAngle(-1);
    $('angle').onchange = $('step').onchange = save;
    $('btn-csv').onclick = downloadCsv;
    $('btn-clear').onclick = () => { if (confirm('측정 데이터를 모두 지울까요?')) { state.points = []; state.refPos = null; state.run = 1; $('move-warn').hidden = true; save(); render(); } };
    $('btn-zoom').onclick = () => setZoom(!state.zoom);
    $('btn-new-run').onclick = newRun;
    $('delay').onchange = $('track').onchange = save;
    // 블루투스 키보드·리모컨의 Enter/Space 로도 기록한다. 각도 칸에서는 Enter 로 기록한다.
    // 버튼·링크·다른 입력칸에 포커스가 있으면 그 요소의 원래 동작(삭제, 결측 등)을 그대로 둔다.
    document.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
        const t = e.target || {};
        if (t.id === 'angle') { if (e.key !== 'Enter') return; }
        else if (t !== document.body && t !== document.documentElement && t !== view) return;
        e.preventDefault();
        recordPoint();
    });
    window.addEventListener('resize', render);

    load();
    setZoom(state.zoom);
    render();
    requestAnimationFrame(frame);
})();
