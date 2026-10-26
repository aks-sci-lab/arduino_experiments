// 말루스 법칙 실험: 스마트폰 카메라(또는 촬영한 사진)로 각도별 밝기를 측정하고 분석한다.
// 탭: 접해보기(malus-tutorial.js) → 측정하기 → 분석하기, 설정(자동화 켜고 끄기)
(function () {
    'use strict';
    const M = window.MalusMath;
    const T = window.MalusTutorial;
    const $ = id => document.getElementById(id);
    const STORE_KEY = 'malus-law-v1';
    const SETTINGS_KEY = 'malus-law-settings-v1';
    const NOTES_KEY = 'malus-law-notes-v1';

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
        run: 1,              // 현재 측정 회차
        models: [],          // 분석하기에서 학생이 고른 비교 모델
        residModel: null,    // 잔차·정규화에 쓸 모델
        normView: 'both',    // 정규화 전/후 보기
        tab: 'explore'
    };

    // ---------- 설정 (자동화 켜고 끄기) ----------
    // learn: 학습 모드 값, fast: 빠른 모드 값
    const SETTINGS = [
        { key: 'autoAdvance', label: '다음 각도 자동 진행', learn: false, fast: true,
          desc: '같은 각도를 계획한 횟수만큼 재면 계획의 다음 각도로 넘어갑니다. 끄면 학생이 각도를 직접 고릅니다.' },
        { key: 'track', label: '빛 위치 자동 추적', learn: true, fast: true,
          desc: '측정 직전에 초록 사각형을 화면 속 빛 번짐 중심으로 옮깁니다. 학습과 관계없는 흔들림만 줄여 주므로 학습 모드에서도 켭니다. 단, 편광판이나 폰이 돌아간 것(각도 변화)은 보정하지 못합니다.' },
        { key: 'delay', label: '측정 전 대기 (초)', type: 'number', learn: 2, fast: 2,
          desc: '버튼을 누른 손의 흔들림이 가라앉을 때까지 기다립니다.' },
        { key: 'autoExclude', label: '의심 값 자동 결측', learn: false, fast: true,
          desc: '판단 기준에 걸린 값을 자동으로 결측 처리합니다. 끄면 ⚠ 의심 표시만 하고, 뺄지는 학생이 결정합니다.' },
        { key: 'requireReason', label: '결측 처리할 때 사유 입력 필수', learn: true, fast: false,
          desc: '값을 뺄 때 이유를 적어야 합니다. 이유는 실험 기록과 내보내기에 남습니다.' },
        { key: 'normGate', label: '정규화 전에 생각해 보기 질문', learn: true, fast: false,
          desc: '정규화 결과를 보기 전에 "회차를 어떻게 공정하게 비교할까?"에 대한 생각을 먼저 적게 합니다.' },
        { key: 'showVerdict', label: '판정 문구 표시', learn: false, fast: true,
          desc: '"말루스 법칙과 잘 일치합니다" 같은 판정을 보여 줍니다. 결론을 학생 대신 내리므로 학습 모드에서는 끕니다.' }
    ];
    const settings = {};
    function applyPreset(mode) { SETTINGS.forEach(d => { settings[d.key] = d[mode]; }); }
    applyPreset('learn');
    function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* 무시 */ } }
    try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* 무시 */ }

    // 학생이 쓴 생각(정규화 질문 답, 결론)
    const notes = { normAnswer: '', normOpen: false, claim: '', evidence: '', reasoning: '' };
    function saveNotes() { try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch (e) { /* 무시 */ } }
    try { Object.assign(notes, JSON.parse(localStorage.getItem(NOTES_KEY) || '{}')); } catch (e) { /* 무시 */ }

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
                angle: $('angle').value, frames: $('frames').value,
                zoom: state.zoom, refPos: state.refPos, run: state.run,
                models: state.models, residModel: state.residModel, normView: state.normView, tab: state.tab
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
            if (d.frames != null) $('frames').value = d.frames;
            if (d.zoom != null) state.zoom = !!d.zoom;
            state.refPos = d.refPos || null;
            if (Array.isArray(d.models)) state.models = d.models.filter(k => M.MODELS[k]);
            if (d.residModel && M.MODELS[d.residModel]) state.residModel = d.residModel;
            if (d.normView) state.normView = d.normView;
            if (d.tab) state.tab = d.tab;
            // 이전 버전에서 저장된 점: 회차가 없으면 1회차, 자동 결측은 사유를 붙인다
            state.points.forEach(p => {
                if (p.run == null) p.run = 1;
                if (p.excluded && !p.reason) p.reason = '(이전 버전에서 자동 결측)';
            });
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
                $('live-val').textContent = (m.mean - darkFor($('sel-channel').value, $('sel-gamma').value)).toFixed(4);
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

    // ---------- 측정 계획 (접해보기에서 정한 값) ----------
    const DEFAULT_PLAN = { start: 0, end: 180, step: 15, custom: '', repeats: 1, dark: 'measure' };
    function tut() { return T ? T.get() : null; }
    function plan() {
        const t = tut();
        const p = t && t.startedAt ? t.plan : DEFAULT_PLAN;
        return { plan: p, angles: M.planAngles(p), repeats: Math.max(1, p.repeats || 1), started: !!(t && t.startedAt) };
    }
    function criteria() {
        const t = tut();
        return t && t.startedAt ? t.crit : { move: true, sat: false, repeat: false, repeatPct: 10, note: '' };
    }
    // 계획에서 배경을 빼기로 했고, 같은 채널·감마로 잰 배경이 있을 때만 뺀다
    function darkFor(ch, gamma) {
        if (plan().plan.dark === 'none' || !state.dark) return 0;
        return state.dark.ch === ch && state.dark.gamma === gamma ? state.dark.value : 0;
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
        const sec = Math.max(0, Math.min(10, parseFloat(settings.delay) || 0));
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
        if (settings.track) {
            const moved = trackSpot();
            if (moved != null && moved >= 1) note += ' · 위치 보정 ' + moved.toFixed(0) + 'px';
        }
        const m0 = measure(true);
        const r = await sample(currentFrames(), '측정 중');
        // 카메라 움직임 감지: 이번 회차 첫 측정 때의 빛 위치에서 영역 크기의 30% 넘게 벗어났는지
        const d = srcDims();
        if (!state.refPos || !state.points.some(p => p.run === state.run)) state.refPos = { cx: state.cx, cy: state.cy };
        const drift = Math.hypot((state.cx - state.refPos.cx) * d.w, (state.cy - state.refPos.cy) * d.h);
        const moved = drift > roiRect().s * 0.3;
        const pt = { run: state.run, theta, raw: r.mean, sd: r.sd, sat: r.sat, ch: $('sel-channel').value, gamma: $('sel-gamma').value,
            edge: m0 ? m0.edge : 0, drift: Math.round(drift), moved, excluded: false, reason: '' };
        state.points.push(pt);
        // 학생이 정한 기준에 걸리는지 확인 (자동 결측이 켜져 있으면 바로 결측 처리)
        const why = flags()[state.points.length - 1];
        if (why.length) {
            if (settings.autoExclude) { pt.excluded = true; pt.reason = '자동: ' + why.join(', '); note += ' · 자동 결측 (' + why.join(', ') + ')'; }
            else note += ' · ⚠ 의심 (' + why.join(', ') + ')';
        }
        $('move-warn').hidden = !moved;
        $('move-warn').innerHTML = moved ? '⚠️ 이번 회차 첫 측정 때보다 빛 위치가 많이 옮겨졌습니다. 폰이나 스크린이 움직였다면 다시 맞춘 뒤 <b>새 회차</b>를 시작하세요.' : '';
        const pl = plan();
        const next = M.nextPlannedAngle(M.planProgress(pl.angles, state.points, state.run), pl.repeats, theta);
        if (next == null) note += ' · 계획한 측정을 모두 마쳤습니다';
        else if (settings.autoAdvance) $('angle').value = next;
        else if (next !== theta) note += ' · 다음 계획 각도: ' + next + '°';
        $('rec-status').textContent = theta + '° 기록 완료' + (r.sat > 0.01 ? ' (⚠ 포화)' : '') + note;
        state.busy = false;
        save(); render();
    }

    // ---------- 데이터 ----------
    function intensity(p) { return p.raw - darkFor(p.ch, p.gamma); }

    const RUN_COLORS = ['#1c64f2', '#e8590c', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#c92a2a', '#5c940d'];
    const runColor = run => RUN_COLORS[(run - 1) % RUN_COLORS.length];
    const MODEL_DASH = { cos2: [], cos: [9, 5], linear: [3, 4] };

    function pointsI() {
        return state.points.map(p => ({ run: p.run, theta: p.theta, y: intensity(p), sd: p.sd, excluded: !!p.excluded, moved: !!p.moved, sat: p.sat }));
    }
    function flags() { return M.flagSuspicious(pointsI(), criteria()); }
    // 잔차·정규화·내보내기에 쓰는 모델. 학생이 아직 고르지 않았으면 null
    function analysisModel() {
        if (state.residModel && state.models.includes(state.residModel)) return state.residModel;
        return state.models[0] || null;
    }

    function newRun() {
        if (state.busy) return;
        if (!state.points.some(p => p.run === state.run)) return;   // 빈 회차는 새로 만들지 않는다
        state.run += 1;
        state.refPos = null;
        $('move-warn').hidden = true;
        const pl = plan();
        $('angle').value = pl.angles.length ? pl.angles[0] : 0;
        $('rec-status').textContent = state.run + '회차를 시작합니다. 카메라·스크린 정렬을 다시 확인하세요.';
        save(); render();
    }

    // 삭제는 결측 처리와 달리 기록에 남지 않으므로 어느 화면에서든 확인을 받는다
    function deletePoint(p) {
        const i = state.points.indexOf(p);
        if (i < 0) return;
        if (!confirm(p.run + '회차 ' + p.theta + '° 측정값을 삭제할까요?\n(결측 처리와 달리 기록에 남지 않습니다. 잘못 누른 기록만 삭제하세요)')) return;
        state.points.splice(i, 1);
        save(); render();
    }

    function setExcluded(p, on) {
        if (!on) { p.excluded = false; p.reason = ''; save(); render(); return; }
        const msg = settings.requireReason
            ? '이 값을 결측 처리하는 이유를 적어 주세요. (필수)\n예: 측정 중 폰이 밀림, 판단 기준의 "반복 차이"에 걸림'
            : '결측 처리하는 이유 (선택)';
        const reason = window.prompt(msg, '');
        if (reason == null) return;
        if (settings.requireReason && !reason.trim()) { alert('이유를 적어야 결측 처리할 수 있습니다.'); return; }
        p.excluded = true;
        p.reason = reason.trim();
        save(); render();
    }

    // ---------- 화면 갱신 ----------
    function render() {
        renderMeasure();
        if (state.tab === 'analyze') renderAnalysis();
        refreshButtons();
    }

    function refreshButtons() {
        const has = !!srcEl();
        $('btn-record').disabled = !has || state.busy;
        $('btn-dark').disabled = !has || state.busy;
        $('btn-new-run').disabled = state.busy || !state.points.some(p => p.run === state.run);
    }

    function renderMeasure() {
        const pl = plan();
        const darkTxt = pl.plan.dark === 'none' ? '배경은 빼지 않음' : '배경을 재서 뺌';
        $('plan-banner').innerHTML = pl.started
            ? '📋 <b>내 계획</b>: 각도 ' + pl.angles.length + '개 × ' + pl.repeats + '번 · ' + darkTxt
            : '📋 접해보기에서 계획을 세우지 않아 <b>기본 계획</b>(0°~180°, 15° 간격, 1번)으로 측정합니다. <button class="secondary" data-goto="explore">📘 계획 세우러 가기</button>';
        const go = $('plan-banner').querySelector('[data-goto]');
        if (go) go.onclick = () => showTab('explore');
        $('dark-row').hidden = pl.plan.dark === 'none';

        const prog = M.planProgress(pl.angles, state.points, state.run);
        const cur = parseFloat($('angle').value);
        $('plan-chips').innerHTML = '';
        prog.forEach(p => {
            const b = document.createElement('button');
            b.className = 'chip' + (p.count >= pl.repeats ? ' done' : p.count > 0 ? ' part' : '') + (Math.abs(p.angle - cur) < 1e-6 ? ' current' : '');
            b.textContent = p.angle + '° ' + p.count + '/' + pl.repeats;
            b.onclick = () => { $('angle').value = p.angle; save(); renderMeasure(); };
            $('plan-chips').appendChild(b);
        });
        const inRun = state.points.filter(p => p.run === state.run);
        $('run-label').textContent = state.run + '회차';
        $('run-count').textContent = inRun.length + '번 측정 · 계획 ' + prog.filter(p => p.count >= pl.repeats).length + '/' + prog.length + ' 각도 완료';

        const fl = flags();
        $('recent').innerHTML = '';
        state.points.map((p, i) => ({ p, i })).filter(o => o.p.run === state.run).slice(-5).reverse().forEach(({ p, i }) => {
            const div = document.createElement('div');
            const f = fl[i].length ? ' <span class="flag">⚠ ' + fl[i].join(', ') + '</span>' : '';
            div.innerHTML = '<span>' + p.theta + '° → ' + intensity(p).toFixed(4) + f + (p.excluded ? ' (결측)' : '') + '</span>';
            const del = document.createElement('button');
            del.className = 'danger'; del.textContent = '삭제'; del.style.padding = '3px 8px'; del.style.fontSize = '.8em';
            del.onclick = () => deletePoint(p);
            div.appendChild(del);
            $('recent').appendChild(div);
        });

        const locked = state.points.length > 0;
        $('sel-channel').disabled = $('sel-gamma').disabled = locked;
        $('chan-warn').hidden = !locked;
        $('dark-txt').textContent = state.dark ? '배경 = ' + state.dark.value.toFixed(5) + ' (' + state.dark.ch.toUpperCase() + ', ' + state.dark.gamma + ')' : '배경 미측정';
        $('btn-dark-clear').hidden = !state.dark;
        const none = state.points.length === 0;
        $('btn-csv').disabled = $('btn-clear').disabled = $('btn-copy').disabled = $('btn-gs').disabled = $('btn-gs-oauth').disabled = none;
    }

    function renderAnalysis() {
        const pts = pointsI(), fl = flags(), c = criteria();
        // 1. 데이터 점검
        const crit = [];
        if (c.move) crit.push('빛 위치 이동');
        if (c.sat) crit.push('포화 픽셀');
        if (c.repeat) crit.push('같은 각도 반복값 ' + c.repeatPct + '% 넘게 차이');
        $('crit-summary').innerHTML = '<b>측정 전에 정한 의심 기준:</b> ' + (crit.join(', ') || '없음') + (c.note ? ' · 그 밖의 기준: ' + escapeHtml(c.note) : '') +
            '<br>⚠ 표시는 기준에 걸린 값입니다. 뺄 값은 <b>결측</b>을 누르고 이유를 적으세요.';
        $('tbody').innerHTML = '';
        state.points.forEach((p, i) => {
            const tr = document.createElement('tr');
            if (p.excluded) tr.className = 'excluded';
            tr.innerHTML = '<td><span class="run-dot" style="background:' + runColor(p.run) + '"></span>' + p.run + '</td><td>' + p.theta + '°</td><td>' +
                pts[i].y.toFixed(4) + '</td><td>' + (fl[i].length ? '<span class="flag">⚠ ' + fl[i].join(', ') + '</span>' : '') + '</td><td class="reason">' +
                escapeHtml(p.reason || '') + '</td><td class="acts"><button class="secondary">' + (p.excluded ? '복원' : '결측') + '</button> <button class="danger">삭제</button></td>';
            const [bEx, bDel] = tr.querySelectorAll('button');
            bEx.onclick = () => setExcluded(p, !p.excluded);
            bDel.onclick = () => deletePoint(p);
            $('tbody').appendChild(tr);
        });
        const nEx = state.points.filter(p => p.excluded).length;
        $('cnt').textContent = '(' + state.points.length + '개' + (nEx ? ', 결측 ' + nEx + '개' : '') + ')';

        // 2. 모델 비교
        $('model-list').innerHTML = '';
        Object.keys(M.MODELS).forEach(k => {
            const lab = document.createElement('label');
            lab.innerHTML = '<input type="checkbox" value="' + k + '"' + (state.models.includes(k) ? ' checked' : '') + '> ' + M.MODELS[k].label;
            lab.querySelector('input').onchange = e => {
                state.models = Object.keys(M.MODELS).filter(m => m === k ? e.target.checked : state.models.includes(m));
                save(); renderAnalysis();
            };
            $('model-list').appendChild(lab);
        });
        const an = {};
        state.models.forEach(k => { an[k] = M.analyzeRuns(pts, k); });
        $('model-table-wrap').hidden = !state.models.length;
        $('model-table').innerHTML = state.models.map(k => {
            const fits = an[k].runs.filter(r => r.fit);
            const r2 = fits.length ? M.mean(fits.map(r => r.fit.r2)).toFixed(4) : '–';
            return '<tr><td>' + M.MODELS[k].label + '</td><td>' + r2 + '</td><td>' + (an[k].rms != null ? an[k].rms.toFixed(4) : '–') + '</td></tr>';
        }).join('');
        const runs = [...new Set(pts.map(p => p.run))].sort((a, b) => a - b);
        const minT = Math.min(0, ...pts.map(p => p.theta)), maxT = Math.max(180, ...pts.map(p => p.theta));
        const curveOf = (fit, color, dash) => {
            const pts2 = [];
            for (let t = minT; t <= maxT; t += 2) pts2.push({ x: t, y: fit.model(t) });
            return { pts: pts2, color, dash };
        };
        const dataSeries = runs.map(run => ({
            color: runColor(run),
            pts: pts.filter(p => p.run === run).map(p => ({ x: p.theta, y: p.y, e: p.sd, hollow: p.excluded }))
        }));
        const modelCurves = [];
        state.models.forEach(k => an[k].runs.forEach(r => { if (r.fit) modelCurves.push(curveOf(r.fit, runColor(r.run), MODEL_DASH[k])); }));
        drawChart($('chart-models'), { series: dataSeries, curves: modelCurves, xl: '각도 θ (°)', yl: '밝기 I', xmin: minT, xmax: maxT });

        // 잔차
        const sel = $('resid-model');
        sel.innerHTML = state.models.map(k => '<option value="' + k + '">' + M.MODELS[k].label + '</option>').join('');
        const km = analysisModel();
        if (km) sel.value = km;
        sel.disabled = !km;
        if (km) {
            const fitOf = new Map(an[km].runs.map(r => [r.run, r.fit]));
            const res = runs.map(run => ({
                color: runColor(run),
                pts: pts.filter(p => p.run === run && fitOf.get(run)).map(p => ({ x: p.theta, y: p.y - fitOf.get(run).model(p.theta), hollow: p.excluded }))
            }));
            drawChart($('chart-resid'), { series: res, curves: [{ pts: [{ x: minT, y: 0 }, { x: maxT, y: 0 }], color: '#999', dash: [6, 4] }], xl: '각도 θ (°)', yl: '잔차', xmin: minT, xmax: maxT, symmetric: true });
        } else {
            drawChart($('chart-resid'), { series: [], xl: '각도 θ (°)', yl: '잔차', message: '위에서 모델을 하나 이상 고르세요' });
        }

        renderNormalization(pts, km ? an[km] : null, km, dataSeries, minT, maxT);
        renderVerdict(pts);
    }

    function renderNormalization(pts, an, km, dataSeries, minT, maxT) {
        const gated = settings.normGate && !notes.normOpen;
        $('norm-gate').hidden = !gated;
        $('norm-body').hidden = gated;
        if (gated) return;
        document.querySelectorAll('#norm-view button').forEach(b => b.classList.toggle('active', b.dataset.view === state.normView));
        const showB = state.normView !== 'after', showA = state.normView !== 'before';
        $('chart-before').hidden = !showB;
        $('chart-after').hidden = !showA;
        const cell = (t, v) => '<div>' + t + '<b>' + v + '</b></div>';
        if (!an) {
            $('norm-results').innerHTML = '<div style="grid-column:1/-1">2번에서 모델을 고르면 정규화 결과가 보입니다.</div>';
            if (showB) drawChart($('chart-before'), { series: dataSeries, xl: '각도 θ (°)', yl: '정규화 전: 밝기 I', xmin: minT, xmax: maxT });
            if (showA) drawChart($('chart-after'), { series: [], xl: 'θ − θ₀ (°)', yl: '정규화 후', message: '모델을 고르세요' });
            drawChart($('chart-line'), { series: [], xl: 'f(θ − θ₀)', yl: '(I − B) / A', message: '모델을 고르세요' });
            return;
        }
        const nRuns = an.runs.filter(r => r.fit).length;
        $('norm-results').innerHTML =
            cell('정규화 전 R² (모든 회차를 곡선 하나로)', an.raw ? an.raw.r2.toFixed(4) : '–') +
            cell('정규화 후 R² (회차마다 정규화)', an.r2 != null ? an.r2.toFixed(4) : '–') +
            cell('분석한 회차 / 사용한 점', nRuns + '회차 / ' + an.used + '개') +
            (nRuns < 2 ? '<div style="grid-column:1/-1">💡 회차가 2개 이상이면 정규화 전후 차이가 잘 보입니다. <b>새 회차</b>로 한 번 더 측정해 보세요.</div>' : '');
        if (showB) {
            const curves = an.runs.filter(r => r.fit && an.raw).length && an.raw
                ? [{ pts: Array.from({ length: Math.round((maxT - minT) / 2) + 1 }, (_, i) => ({ x: minT + 2 * i, y: an.raw.model(minT + 2 * i) })), color: '#333', dash: [] }]
                : [];
            drawChart($('chart-before'), { series: dataSeries, curves, xl: '각도 θ (°)', yl: '정규화 전: 밝기 I', xmin: minT, xmax: maxT, legend: '검은 선: 모든 회차를 곡선 하나로 맞춘 결과' });
        }
        const f = M.MODELS[km].f;
        const runs = an.runs.map(r => r.run);
        const normSeries = runs.map(run => ({
            color: runColor(run),
            pts: pts.map((p, i) => p.run === run ? an.norm[i] : null).filter(Boolean).map(q => ({ x: q.phi, y: q.n, e: q.e }))
        }));
        const theory = { pts: Array.from({ length: 91 }, (_, i) => ({ x: i * 2, y: f(i * 2) })), color: '#333', dash: [] };
        const curves = [theory];
        const t = tut();
        if ($('show-pred').checked && t && t.sketch.some(v => v != null)) {
            // 예측과 측정 모두 "가장 밝은 위치에서 돌린 각도" φ 를 가로축으로 쓴다 (MalusMath.sketchCurve 참고)
            const pred = M.sketchCurve(t.sketch).map(q => ({ x: q.phi, y: q.y, gap: q.gap }));
            curves.push({ pts: pred, color: '#7048e8', dash: [6, 4], width: 2.5 });
        }
        if (showA) drawChart($('chart-after'), { series: normSeries, curves, xl: '가장 밝은 위치에서 돌린 각도 θ − θ₀ (°)', yl: '정규화 후: (I − B) / A', xmin: 0, xmax: 180, ymin: -0.15, ymax: 1.15, legend: '회차마다 가장 밝은 위치를 0°로 맞춤 · 검은 선: ' + M.MODELS[km].label + (curves.length > 1 ? ' · 보라 점선: 내 예측' : '') });
        drawChart($('chart-line'), {
            series: runs.map(run => ({ color: runColor(run), pts: pts.map((p, i) => p.run === run ? an.norm[i] : null).filter(Boolean).map(q => ({ x: q.x, y: q.n, e: q.e })) })),
            curves: [{ pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: '#999', dash: [6, 4] }],
            xl: M.MODELS[km].label + ' 모양 f(θ − θ₀)', yl: '(I − B) / A', xmin: 0, xmax: 1, ymin: -0.1, ymax: 1.1
        });
    }

    function renderVerdict(pts) {
        const v = $('verdict');
        const an = M.analyzeRuns(pts, 'cos2');
        if (!settings.showVerdict || an.r2 == null) { v.hidden = true; return; }
        const good = an.r2 >= 0.98;
        v.hidden = false;
        v.className = good ? 'ok' : 'warn';
        v.textContent = good
            ? '✅ 회차별로 정규화한 cos² 모델 R² = ' + an.r2.toFixed(4) + ' — 측정값이 말루스 법칙과 잘 일치합니다.'
            : '⚠️ 회차별로 정규화한 cos² 모델 R² = ' + an.r2.toFixed(4) + ' — 오차가 큽니다. 포화, 자동 노출, 빔/스크린 움직임, 레이저 출력 변동, 각도 오차를 점검하세요.';
    }

    function escapeHtml(t) {
        return String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    // ---------- 그래프 (Canvas) ----------
    // o.series: [{ color, pts: [{x, y, e, hollow}] }]  점
    // o.curves: [{ color, dash, width, pts: [{x, y, gap}] }]  선 (gap: 이 점에서 선을 끊는다)
    function drawChart(cv, o) {
        if (cv.hidden) return;
        const dpr = window.devicePixelRatio || 1;
        const W = cv.clientWidth || 600, H = cv.clientHeight || 280;
        cv.width = W * dpr; cv.height = H * dpr;
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        const L = 54, R = 12, T0 = o.legend ? 26 : 12, B = 40;
        const series = o.series || [], curves = o.curves || [];
        const all = series.flatMap(s => s.pts).concat(curves.flatMap(c => c.pts));
        let xmin = o.xmin, xmax = o.xmax, ymin = o.ymin, ymax = o.ymax;
        if (xmin == null) xmin = all.length ? Math.min(...all.map(p => p.x)) : 0;
        if (xmax == null) xmax = all.length ? Math.max(...all.map(p => p.x)) : 1;
        if (ymin == null) ymin = all.length ? Math.min(0, ...all.map(p => p.y - (p.e || 0))) : 0;
        if (ymax == null) ymax = all.length ? Math.max(...all.map(p => p.y + (p.e || 0))) * 1.05 : 1;
        if (o.symmetric) { const m = Math.max(Math.abs(ymin), Math.abs(ymax), 1e-4) * 1.1; ymin = -m; ymax = m; }
        if (xmax === xmin) xmax = xmin + 1;
        if (ymax === ymin) ymax = ymin + 1;
        const X = x => L + (x - xmin) / (xmax - xmin) * (W - L - R);
        const Y = y => H - B - (y - ymin) / (ymax - ymin) * (H - T0 - B);
        g.font = '12px sans-serif'; g.fillStyle = '#555'; g.strokeStyle = '#e5e5e5'; g.lineWidth = 1;
        const ticks = (a, b, n) => { const out = []; for (let i = 0; i <= n; i++) out.push(a + (b - a) * i / n); return out; };
        g.textAlign = 'center';
        for (const t of ticks(xmin, xmax, 6)) {
            g.beginPath(); g.moveTo(X(t), T0); g.lineTo(X(t), H - B); g.stroke();
            g.fillText(Math.abs(xmax - xmin) >= 10 ? t.toFixed(0) : t.toFixed(2), X(t), H - B + 15);
        }
        g.textAlign = 'right';
        for (const t of ticks(ymin, ymax, 5)) {
            g.beginPath(); g.moveTo(L, Y(t)); g.lineTo(W - R, Y(t)); g.stroke();
            g.fillText(Math.abs(ymax - ymin) < 0.05 ? t.toFixed(4) : t.toFixed(2), L - 6, Y(t) + 4);
        }
        g.strokeStyle = '#999'; g.strokeRect(L, T0, W - L - R, H - T0 - B);
        g.fillStyle = '#333'; g.textAlign = 'center';
        g.fillText(o.xl || '', L + (W - L - R) / 2, H - 6);
        g.save(); g.translate(13, T0 + (H - T0 - B) / 2); g.rotate(-Math.PI / 2); g.fillText(o.yl || '', 0, 0); g.restore();
        if (o.legend) { g.textAlign = 'left'; g.fillStyle = '#666'; g.font = '11px sans-serif'; g.fillText(o.legend, L, 16); }
        if (o.message) { g.textAlign = 'center'; g.fillStyle = '#999'; g.font = '13px sans-serif'; g.fillText(o.message, L + (W - L - R) / 2, T0 + (H - T0 - B) / 2); }
        g.save(); g.beginPath(); g.rect(L, T0, W - L - R, H - T0 - B); g.clip();
        for (const c of curves) {
            g.setLineDash(c.dash || []); g.strokeStyle = c.color; g.globalAlpha = 0.75; g.lineWidth = c.width || 2;
            g.beginPath();
            c.pts.forEach((p, i) => (i && !p.gap) ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)));
            g.stroke();
            g.setLineDash([]); g.globalAlpha = 1;
        }
        for (const s of series) {
            for (const p of s.pts) {
                if (p.e) { g.strokeStyle = s.color; g.globalAlpha = 0.5; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(p.x), Y(p.y - p.e)); g.lineTo(X(p.x), Y(p.y + p.e)); g.stroke(); g.globalAlpha = 1; }
                g.beginPath(); g.arc(X(p.x), Y(p.y), 4, 0, 2 * Math.PI);
                // 결측 처리한 점은 속이 빈 원으로 표시
                if (p.hollow) { g.strokeStyle = s.color; g.lineWidth = 1.5; g.stroke(); }
                else { g.fillStyle = s.color; g.fill(); }
            }
        }
        g.restore();
    }

    // ---------- 내보내기 ----------
    function exportRows() {
        const pts = pointsI(), fl = flags(), km = analysisModel();
        const an = km ? M.analyzeRuns(pts, km) : null;
        return state.points.map((p, i) => {
            const q = an ? an.norm[i] : null;
            return { p, i, I: pts[i].y, q, flag: fl[i].join(' / '), model: km ? M.MODELS[km].label : '' };
        });
    }

    function downloadCsv() {
        // 결측치는 정규화 칸을 비워 둔다 (스프레드시트·분석 프로그램에서 빈 칸 = 결측)
        const csvCell = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
        const rows = ['run,theta_deg,intensity,model,normalized,model_shape,excluded,reason,suspicious,std,raw_mean,dark,saturated_fraction,channel,gamma,edge_ratio,drift_px'];
        exportRows().forEach(({ p, I, q, flag, model }) => {
            rows.push([p.run, p.theta, I, model, q ? q.n : '', q ? q.x : '', p.excluded ? 1 : 0, p.reason || '', flag, p.sd, p.raw, p.raw - I, p.sat, p.ch, p.gamma,
                p.edge != null ? p.edge.toFixed(3) : '', p.drift != null ? p.drift : ''].map(csvCell).join(','));
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + rows.join('\n')], { type: 'text/csv' }));
        a.download = 'malus-law.csv';
        document.body.appendChild(a); a.click(); a.remove();
    }

    // 예측·계획·기준·결측·생각·결론을 한 번에 복사 (보고서나 과제 제출용)
    function reportText() {
        const t = tut() || {}, pl = plan(), c = criteria();
        const lines = [];
        lines.push('[말루스 법칙 실험 기록] ' + new Date().toLocaleString('ko-KR') + ($('gs-name').value.trim() ? ' · ' + $('gs-name').value.trim() : ''));
        lines.push('', '■ 예측');
        lines.push('가설: ' + (t.hyp ? T.HYP_LABELS[t.hyp] : '(선택 안 함)'));
        const sk = (t.sketch || []).map((v, i) => v == null ? null : (i * 5) + '°:' + v.toFixed(2)).filter(Boolean);
        lines.push('예상 그래프(0~1): ' + (sk.length ? sk.filter((_, i) => i % 3 === 0).join(', ') : '(그리지 않음)'));
        lines.push('근거: ' + (t.hypReason || ''));
        lines.push('', '■ 측정 계획' + (pl.started ? '' : ' (기본 계획)'));
        lines.push('각도: ' + pl.angles.join(', ') + ' (°) · 반복 ' + pl.repeats + '번 · 배경: ' + (pl.plan.dark === 'none' ? '빼지 않음' : '재서 뺌'));
        if (pl.started) lines.push('이유: ' + (t.plan.reason || ''));
        lines.push('', '■ 이상한 값 판단 기준 (측정 전에 정함)');
        lines.push([c.move && '빛 위치 이동', c.sat && '포화 픽셀', c.repeat && ('반복값 ' + c.repeatPct + '% 넘게 차이')].filter(Boolean).join(', ') || '없음');
        if (c.note) lines.push('그 밖의 기준: ' + c.note);
        const ex = state.points.filter(p => p.excluded);
        lines.push('', '■ 결측 처리 (' + ex.length + '개)');
        ex.forEach(p => lines.push('- ' + p.run + '회차 ' + p.theta + '°: ' + (p.reason || '(사유 없음)')));
        lines.push('', '■ 모델 비교');
        const pts = pointsI();
        if (!state.models.length) lines.push('(모델을 고르지 않음)');
        state.models.forEach(k => {
            const an = M.analyzeRuns(pts, k), fits = an.runs.filter(r => r.fit);
            lines.push('- ' + M.MODELS[k].label + ': 회차별 R² 평균 ' + (fits.length ? M.mean(fits.map(r => r.fit.r2)).toFixed(4) : '–') +
                ', 정규화 잔차 RMS ' + (an.rms != null ? an.rms.toFixed(4) : '–') + ', 정규화 전 R² ' + (an.raw ? an.raw.r2.toFixed(4) : '–') + ', 정규화 후 R² ' + (an.r2 != null ? an.r2.toFixed(4) : '–'));
        });
        lines.push('', '■ 정규화에 대한 내 생각', notes.normAnswer || '');
        lines.push('', '■ 결론', '주장: ' + notes.claim, '증거: ' + notes.evidence, '추론과 한계: ' + notes.reasoning);
        return lines.join('\n');
    }

    // ---------- 구글 스프레드시트 ----------
    const GS_HEADER = ['시각', '이름/조', '회차', '각도(°)', '밝기 I', '분석 모델', '정규화 (I−B)/A', '모델 모양 f(θ−θ₀)', '결측', '결측 사유', '의심', '표준편차', '원값', '배경', '포화비율', '채널', '감마'];
    function sheetRows() {
        const t = new Date().toLocaleString('ko-KR'), name = $('gs-name').value.trim();
        return exportRows().map(({ p, I, q, flag, model }) =>
            [t, name, p.run, p.theta, I, model, q ? q.n : '', q ? q.x : '', p.excluded ? '결측' : '', p.reason || '', flag, p.sd, p.raw, p.raw - I, p.sat, p.ch, p.gamma]);
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
        copyText(rows.map(r => r.map(v => String(v).replace(/[\t\n]/g, ' ')).join('\t')).join('\n'), '복사됨 — 시트에 붙여넣으세요.', $('gs-status'));
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
    $('btn-copy-report').onclick = () => copyText(reportText(), '복사됨 — 보고서나 과제 칸에 붙여넣으세요.', $('report-status'));

    // ---------- 탭 ----------
    function showTab(name) {
        state.tab = name;
        document.querySelectorAll('.tab').forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
        document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
        save();
        if (name === 'explore' && T) T.redraw();
        render();
        window.scrollTo(0, 0);
    }
    document.querySelectorAll('.tab').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });

    // ---------- 설정 화면 ----------
    function renderSettings() {
        const box = $('settings-list');
        box.innerHTML = '';
        SETTINGS.forEach(d => {
            const row = document.createElement('label');
            row.className = 'setting';
            const input = d.type === 'number'
                ? '<input type="number" min="0" max="10" step="0.5" value="' + settings[d.key] + '">'
                : '<input type="checkbox"' + (settings[d.key] ? ' checked' : '') + '>';
            row.innerHTML = input + '<span><b>' + d.label + '</b><span class="desc">' + d.desc + '</span></span>';
            row.querySelector('input').onchange = e => {
                settings[d.key] = d.type === 'number' ? Math.max(0, Math.min(10, parseFloat(e.target.value) || 0)) : e.target.checked;
                saveSettings(); renderSettings(); render();
            };
            box.appendChild(row);
        });
        const same = mode => SETTINGS.every(d => settings[d.key] === d[mode]);
        $('preset-txt').textContent = same('learn') ? '현재: 학습 모드' : same('fast') ? '현재: 빠른 모드' : '현재: 직접 설정';
    }
    $('preset-learn').onclick = () => { applyPreset('learn'); saveSettings(); renderSettings(); render(); };
    $('preset-fast').onclick = () => { applyPreset('fast'); saveSettings(); renderSettings(); render(); };

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
    // ◀ 이전 / 다음 ▶ : 계획한 각도 목록에서 옮겨 간다
    const stepAngle = dir => {
        const list = plan().angles;
        if (!list.length) return;
        const cur = parseFloat($('angle').value);
        let i = list.findIndex(a => Math.abs(a - cur) < 1e-6);
        if (i < 0) i = list.reduce((bi, a, k) => Math.abs(a - cur) < Math.abs(list[bi] - cur) ? k : bi, 0);
        else i = Math.max(0, Math.min(list.length - 1, i + dir));
        $('angle').value = list[i];
        save(); renderMeasure();
    };
    $('btn-step-up').onclick = () => stepAngle(1);
    $('btn-step-dn').onclick = () => stepAngle(-1);
    $('angle').onchange = () => { save(); renderMeasure(); };
    $('frames').onchange = save;
    $('btn-csv').onclick = downloadCsv;
    $('btn-clear').onclick = () => { if (confirm('측정 데이터를 모두 지울까요?')) { state.points = []; state.refPos = null; state.run = 1; $('move-warn').hidden = true; save(); render(); } };
    $('btn-zoom').onclick = () => setZoom(!state.zoom);
    $('btn-new-run').onclick = newRun;
    $('resid-model').onchange = e => { state.residModel = e.target.value; save(); renderAnalysis(); };
    document.querySelectorAll('#norm-view button').forEach(b => { b.onclick = () => { state.normView = b.dataset.view; save(); renderAnalysis(); }; });
    $('show-pred').onchange = () => renderAnalysis();
    $('norm-answer').value = notes.normAnswer;
    $('norm-answer').oninput = e => { notes.normAnswer = e.target.value; saveNotes(); };
    $('btn-norm-open').onclick = () => {
        if (notes.normAnswer.trim().length < 5) { $('norm-gate-msg').textContent = '생각을 조금 더 적어 주세요.'; return; }
        notes.normOpen = true; saveNotes(); renderAnalysis();
    };
    [['cer-claim', 'claim'], ['cer-evidence', 'evidence'], ['cer-reasoning', 'reasoning']].forEach(([id, key]) => {
        $(id).value = notes[key] || '';
        $(id).oninput = e => { notes[key] = e.target.value; saveNotes(); };
    });
    // 블루투스 키보드·리모컨의 Enter/Space 로도 기록한다 (측정하기 탭에서만). 각도 칸에서는 Enter 로 기록한다.
    // 버튼·링크·다른 입력칸에 포커스가 있으면 그 요소의 원래 동작(삭제, 결측 등)을 그대로 둔다.
    document.addEventListener('keydown', e => {
        if (state.tab !== 'measure') return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
        const t = e.target || {};
        if (t.id === 'angle') { if (e.key !== 'Enter') return; }
        else if (t !== document.body && t !== document.documentElement && t !== view) return;
        e.preventDefault();
        recordPoint();
    });
    window.addEventListener('resize', render);

    // 접해보기에서 "이 계획으로 측정 시작" → 측정하기 탭으로 이동, 첫 계획 각도로 맞춘다
    if (T) {
        T.onStart(() => {
            const pl = plan();
            const next = M.nextPlannedAngle(M.planProgress(pl.angles, state.points, state.run), pl.repeats, pl.angles[0]);
            $('angle').value = next != null ? next : pl.angles[0];
            $('rec-status').textContent = '계획대로 측정을 시작하세요. 먼저 카메라를 켜고 측정 영역을 맞춥니다.';
            showTab('measure');
        });
        T.onChange(() => { if (state.tab !== 'explore') render(); });
    }

    load();
    setZoom(state.zoom);
    renderSettings();
    showTab(state.tab);
    requestAnimationFrame(frame);
})();
