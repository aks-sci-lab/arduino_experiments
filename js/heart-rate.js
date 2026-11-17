// 스마트폰 카메라 심박수 — 한 화면형 측정 페이지 (projects/heart-rate.html)
//  상태 띠(카메라·측정) → 큰 숫자(심박수·박동 간격·품질·노출) → 실시간 맥파 → 회차·손목 비교·CSV(접기) → 자세히·시뮬레이션·안내(접기)
//  계산은 js/heart-rate-math.js. 영상은 저장·전송하지 않고, 프레임마다 가운데 영역의 빨강·초록·밝기 평균과 노출 값만 기록
//  노출: ① 잠글 수 있는지 확인 → 잠금 → 1.5초 동안 getSettings 의 exposureTime·iso 가 정말 안 바뀌는지 확인
//        ② 고정됨: 밝기 그대로 ③ 고정 안 됨: 밝기를 선형으로 바꾼 뒤 노출(exposureTime×iso)로 나눠 보정 ④ 노출 값을 못 읽음: 보정 불가 + 경고
(function () {
    'use strict';
    const H = window.HeartRateMath;
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const KEY = 'heart-rate:v1';
    const MAX_RUNS = 30;
    const LEVEL = { good: '🟢', fair: '🟡', bad: '🔴' };

    // ---------- 저장 ----------
    let state = { runs: [], dur: 30, pick: '' };
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') state = Object.assign(state, s); } catch (e) { /* 무시 */ }
    if (!Array.isArray(state.runs)) state.runs = [];
    let saveWarned = false;
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { if (!saveWarned) { saveWarned = true; msg('⚠ 이 브라우저에 저장하지 못했어요(저장 공간 부족 또는 사생활 보호 모드). 원본 CSV 로 내려받아 두세요.', 'warn'); } }
    }
    function msg(html, kind) { const el = $('msg'); el.innerHTML = html || ''; el.className = 'note' + (kind ? ' ' + kind : ''); }
    function status(t) { $('status').textContent = t; }

    // ---------- 그래프 (작은 선 그래프, 외부 라이브러리 없음) ----------
    // series: [{ pts:[{x,y}], color, width, dots, dash, label }], o: { xlabel, ylabel, xmin, xmax, ymin, ymax, marks:[{x, color}] }
    function plot(cv, series, o) {
        o = o || {};
        const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, Hh = cv.clientHeight || 150;
        cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, W, Hh);
        const all = series.flatMap(s => s.pts).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
        const L = o.ylabel ? 52 : 10, R = 10, T = 10, B = o.xlabel ? 34 : 10;
        if (!all.length) { c.fillStyle = '#5f6b7a'; c.font = '13px sans-serif'; c.fillText(o.empty || '자료 없음', L + 6, Hh / 2); return; }
        let x0 = o.xmin != null ? o.xmin : Math.min(...all.map(p => p.x)), x1 = o.xmax != null ? o.xmax : Math.max(...all.map(p => p.x));
        let y0 = o.ymin != null ? o.ymin : Math.min(...all.map(p => p.y)), y1 = o.ymax != null ? o.ymax : Math.max(...all.map(p => p.y));
        if (x1 <= x0) { x1 = x0 + 1; x0 -= 0; }
        if (y1 <= y0) { y1 += 1; y0 -= 1; }
        if (o.ymin == null && o.ymax == null) { const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad; }
        const X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => T + (1 - (y - y0) / (y1 - y0)) * (Hh - T - B);
        c.strokeStyle = '#e3e7ec'; c.fillStyle = '#5f6b7a'; c.font = '11px sans-serif'; c.lineWidth = 1;
        const ticks = (a, b, n) => { const st = Math.pow(10, Math.floor(Math.log10((b - a) / n))), m = [1, 2, 5, 10].find(k => (b - a) / (st * k) <= n) * st; const out = []; for (let v = Math.ceil(a / m) * m; v <= b + 1e-9; v += m) out.push(+v.toFixed(6)); return out; };
        if (o.yticks !== false) ticks(y0, y1, 5).forEach(v => { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(W - R, Y(v)); c.stroke(); if (o.ylabel) { c.textAlign = 'right'; c.fillText(String(v), L - 4, Y(v) + 4); c.textAlign = 'left'; } });
        ticks(x0, x1, 6).forEach(v => { c.beginPath(); c.moveTo(X(v), T); c.lineTo(X(v), Hh - B); c.stroke(); if (o.xlabel) c.fillText(String(v), X(v) - 8, Hh - B + 14); });
        if (o.xlabel) { c.fillText(o.xlabel, W - R - c.measureText(o.xlabel).width, Hh - 4); }
        if (o.ylabel) { c.save(); c.translate(12, (Hh - B + T) / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillText(o.ylabel, 0, 0); c.restore(); }
        (o.bands || []).forEach(b => { c.fillStyle = b.color; c.fillRect(X(b.x0), T, X(b.x1) - X(b.x0), Hh - T - B); });
        series.forEach(s => {
            c.strokeStyle = s.color || '#1565c0'; c.fillStyle = s.color || '#1565c0'; c.lineWidth = s.width || 2; c.setLineDash(s.dash || []);
            const ps = s.pts.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
            if (!s.noLine) { c.beginPath(); ps.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y)))); c.stroke(); }
            c.setLineDash([]);
            if (s.dots) ps.forEach(p => { c.beginPath(); c.arc(X(p.x), Y(p.y), s.dots, 0, 2 * Math.PI); c.fill(); });
        });
    }
    const COLORS = ['#c62828', '#1565c0', '#2f9e44', '#ae3ec9', '#e8590c', '#0c8599', '#5c940d', '#495057'];

    // ---------- 계산 (회차 하나) ----------
    // lock: 'locked'(잠금 확인) | 'unlocked' | 'csv-locked' … → 노출 처리 방식을 정하고 계산
    function analyzeFrames(lock, frames) {
        const mode = H.exposureMode(lock === 'locked' || lock === 'csv-locked' ? 'locked' : 'unlocked', frames);
        const a = H.analyze(frames, { correct: mode.correct });
        a.mode = mode;
        if (mode.mode === 'nocorrect') a.reasons.push('노출 값이 없어 보정 못 함 — 노출 출렁임이 섞였을 수 있음');
        return a;
    }

    // ---------- 카메라 ----------
    const video = $('video'), canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 30;
    const cctx = canvas.getContext('2d', { willReadFrequently: true });
    let stream = null, track = null, caps = {}, timeBase = '';
    let phase = 'off';           // off | idle | settle | verify | rec
    let live = [];               // 최근 6초 (품질·그래프)
    let rec = null;              // 지금 측정 { frames, wall, dur, torch, lock }
    let wakeLock = null;

    function setCard(id, level) { const c = $(id).closest('.dash-card'); c.classList.remove('good', 'fair', 'bad'); if (level) c.classList.add(level); }
    function showLock(kind, text) {
        $('v-lock').textContent = kind; $('v-locktext').textContent = text || '';
        setCard('v-lock', kind.startsWith('🔒') ? 'good' : kind.startsWith('⚠') ? 'fair' : '');
    }

    async function startCamera() {
        if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { msg('이 브라우저에서는 카메라를 쓸 수 없어요. <b>https</b> 주소인지, 크롬·사파리 최신판인지 확인하세요. 아래 🧪 시뮬레이션으로 해 볼 수 있어요.', 'err'); return; }
        status('카메라를 켜는 중…');
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } } });
        } catch (e) {
            status('📷 카메라를 켜지 못했어요');
            msg('카메라를 켜지 못했어요: ' + esc(e && e.name === 'NotAllowedError' ? '권한이 거절됨 — 주소창의 🔒 에서 카메라를 허용하세요' : (e && e.message) || e) + '. 아래 🧪 시뮬레이션으로 해 볼 수 있어요.', 'err');
            return;
        }
        video.srcObject = stream; video.classList.add('on');
        try { await video.play(); } catch (e) { /* 자동 재생 막힘: 프레임은 그래도 옴 */ }
        track = stream.getVideoTracks()[0];
        try { caps = (track.getCapabilities && track.getCapabilities()) || {}; } catch (e) { caps = {}; }
        const canLock = Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual');
        showLock(canLock ? '확인 전' : '⚠ 고정 안 됨', canLock ? '측정 시작 때 잠그고 확인해요' : '이 폰은 노출을 고정할 수 없어요 → 노출 보정으로 계산');
        $('torch-wrap').hidden = !caps.torch;
        phase = 'idle'; timeBase = '';
        $('cam').textContent = '📷 카메라 끄기';
        $('start').disabled = false;
        status('☝ 검지로 뒤 카메라를 덮으세요');
        msg('');
        loop();
    }
    function stopCamera() {
        if (rec) finish(true);
        phase = 'off';
        if (stream) stream.getTracks().forEach(t => t.stop());
        stream = null; track = null; video.srcObject = null; video.classList.remove('on');
        $('cam').textContent = '📷 카메라 켜기'; $('start').disabled = true;
        $('v-q').textContent = '—'; $('v-qtext').textContent = ''; setCard('v-q', '');
        status('📷 카메라를 껐어요');
    }

    // 프레임마다: 가운데 60% 영역 평균 + 노출 값
    function sample(tSec) {
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) return;
        const sw = vw * 0.6, sh = vh * 0.6;
        cctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
        const d = cctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let r = 0, g = 0, b = 0, sat = 0;
        const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; if (d[i] >= 250) sat++; }
        r /= n; g /= n; b /= n;
        let et = null, iso = null;
        try { const s = track && track.getSettings ? track.getSettings() : {}; if (Number.isFinite(s.exposureTime)) et = s.exposureTime; if (Number.isFinite(s.iso)) iso = s.iso; } catch (e) { /* 무시 */ }
        const f = { t: tSec, r, g, b, y: 0.299 * r + 0.587 * g + 0.114 * b, exposureTime: et, iso, e: et != null ? et * (iso || 1) : null, s: sat / n };
        live.push(f);
        while (live.length && live[0].t < tSec - 6) live.shift();
        if (phase === 'rec' && rec) rec.frames.push(f);
    }
    function loop() {
        if (phase === 'off' || !stream) return;
        if (video.requestVideoFrameCallback) {
            video.requestVideoFrameCallback((now, meta) => {
                // 실제 찍힌 시각: captureTime(있으면) > mediaTime > now. 처음 정한 기준을 계속 씀
                if (!timeBase) timeBase = meta && Number.isFinite(meta.captureTime) && meta.captureTime > 0 ? 'capture' : meta && meta.mediaTime > 0 ? 'media' : 'now';
                const t = timeBase === 'capture' ? meta.captureTime / 1000 : timeBase === 'media' ? meta.mediaTime : now / 1000;
                sample(t); tick(); loop();
            });
        } else {
            let last = -1;
            const step = () => {
                if (phase === 'off' || !stream) return;
                if (video.currentTime !== last) { last = video.currentTime; sample(performance.now() / 1000); tick(); }
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        }
    }

    // 화면 고치기 (1초에 몇 번)
    let lastUi = 0, lastBpmT = 0;
    function tick() {
        const now = performance.now();
        if (now - lastUi < 120) return;
        lastUi = now;
        drawLive();
        const tl = live.length ? live[live.length - 1].t : 0;
        const q = H.quality(live.filter(f => f.t >= tl - 2));
        $('v-q').textContent = LEVEL[q.level]; $('v-qtext').textContent = q.text; setCard('v-q', q.level);
        if (phase === 'idle') status(q.level === 'good' ? '🟢 준비됐어요 — ▶ 측정 시작' : '☝ ' + q.text);
        if (rec && (phase === 'settle' || phase === 'verify' || phase === 'rec')) {
            const el = (now - rec.wall) / 1000;
            $('time-st').hidden = false;
            if (phase === 'settle') { $('time-st').textContent = '노출 맞추는 중 ' + Math.max(0, 3 - el).toFixed(0) + '초'; status('⏳ 노출을 맞추는 중 — 가만히'); }
            else if (phase === 'verify') { $('time-st').textContent = '노출 잠금 확인 중'; status('🔍 노출이 정말 고정됐는지 확인 중'); }
            else {
                const left = Math.max(0, rec.dur - (now - rec.recWall) / 1000);
                $('time-st').textContent = '⏱ 남은 시간 ' + Math.ceil(left) + '초';
                status('🔴 측정 중 — 움직이지 마세요');
            }
            if (phase === 'rec' && rec.frames.length > 10 && now - lastBpmT > 1000) {
                lastBpmT = now;
                const last = rec.frames[rec.frames.length - 1].t;
                if (last - rec.frames[0].t >= 6) {
                    const a = analyzeFrames(rec.lock, rec.frames.filter(f => f.t >= last - 12));
                    if (a.ok) {
                        $('v-bpm').textContent = Math.round(a.bpm);
                        $('v-ibi').textContent = a.ibi && a.ibi.length ? Math.round(H.mean(a.ibi)) : Math.round(60000 / a.bpm);
                        const c = $('v-bpm').closest('.dash-card'); c.classList.remove('beat'); void c.offsetWidth; c.classList.add('beat');
                    }
                }
            }
        }
    }
    function drawLive() {
        if (!live.length) return;
        const tEnd = live[live.length - 1].t, pts = live.filter(f => f.t >= tEnd - 6);
        // 1초 이동평균을 빼고 뒤집음 (피가 많을수록 어두워짐 → 봉우리 = 박동)
        const ys = pts.map(f => -Math.log(Math.max(0.5, f.r)));
        const out = pts.map((f, i) => { let s = 0, k = 0; for (let j = 0; j < pts.length; j++) if (Math.abs(pts[j].t - f.t) <= 0.5) { s += ys[j]; k++; } return { x: f.t - tEnd, y: ys[i] - s / k }; });
        plot($('wave'), [{ pts: out, color: '#c62828', width: 2 }], { xmin: -6, xmax: 0, xlabel: '초 (지금 = 0)', yticks: false, empty: '손가락을 올리면 파형이 나와요' });
    }

    // ---------- 노출 고정 ----------
    // 잠근 뒤 1.5초 동안 getSettings 를 읽어 exposureTime·iso 가 1% 넘게 바뀌지 않아야 '고정됨'
    async function lockAndVerify() {
        const canLock = track && Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual');
        if (!canLock) return { lock: 'unlocked', why: '이 폰은 노출 고정을 지원하지 않아요' };
        const s = track.getSettings ? track.getSettings() : {};
        const adv = { exposureMode: 'manual' };
        if (caps.exposureTime && Number.isFinite(s.exposureTime)) adv.exposureTime = Math.min(caps.exposureTime.max || Infinity, Math.max(caps.exposureTime.min || 0, s.exposureTime));
        if (caps.iso && Number.isFinite(s.iso)) adv.iso = Math.min(caps.iso.max || Infinity, Math.max(caps.iso.min || 0, s.iso));
        if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('manual')) adv.whiteBalanceMode = 'manual';
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('manual')) adv.focusMode = 'manual';
        try { await track.applyConstraints({ advanced: [adv] }); } catch (e) { return { lock: 'unlocked', why: '잠그기 요청이 거절됨' }; }
        phase = 'verify';
        const seen = [];
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (!rec) return { lock: 'unlocked', why: '' };
            try { const g = track.getSettings(); seen.push({ m: g.exposureMode, et: g.exposureTime, iso: g.iso }); } catch (e) { /* 무시 */ }
        }
        if (!seen.length || seen.some(x => x.m !== 'manual')) return { lock: 'unlocked', why: '잠갔는데 자동 노출로 돌아감' };
        const ets = seen.map(x => x.et).filter(Number.isFinite), isos = seen.map(x => x.iso).filter(Number.isFinite);
        if (!ets.length) return { lock: 'unlocked', why: '노출 값을 읽을 수 없어 고정됐는지 확인 못 함' };
        const changed = a => a.length && (Math.max(...a) - Math.min(...a)) / Math.max(1e-9, Math.abs(H.mean(a))) > 0.01;
        if (changed(ets) || changed(isos)) return { lock: 'unlocked', why: '잠갔는데 노출 값이 계속 바뀜' };
        return { lock: 'locked', why: '' };
    }
    async function setAuto() {
        if (!track) return;
        const adv = {};
        if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) adv.exposureMode = 'continuous';
        if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) adv.whiteBalanceMode = 'continuous';
        if (caps.torch) adv.torch = !!$('torch').checked;
        if (Object.keys(adv).length) { try { await track.applyConstraints({ advanced: [adv] }); } catch (e) { /* 무시 */ } }
    }
    async function torchOff() { if (track && caps.torch) { try { await track.applyConstraints({ advanced: [{ torch: false }] }); } catch (e) { /* 무시 */ } } }

    // ---------- 측정 ----------
    let settleTimer = null, endTimer = null;
    async function start() {
        if (phase !== 'idle') return;
        rec = { frames: [], wall: performance.now(), dur: Number($('dur').value) || 30, torch: !!$('torch').checked, lock: '' };
        phase = 'settle';
        $('start').hidden = true; $('stop').hidden = false; $('cam').disabled = true;
        $('v-bpm').textContent = '--'; $('v-ibi').textContent = '--';
        msg('');
        try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
        await setAuto();
        settleTimer = setTimeout(async () => {
            if (!rec) return;
            const v = await lockAndVerify();
            if (!rec) return;
            rec.lock = v.lock; rec.why = v.why;
            const hasExp = live.some(f => Number(f.e) > 0);
            if (v.lock === 'locked') showLock('🔒 고정됨', '밝기 그대로 계산');
            else if (hasExp) showLock('⚠ 고정 안 됨', (v.why ? v.why + ' → ' : '') + '노출 보정으로 계산');
            else showLock('⚠ 고정 안 됨', (v.why ? v.why + ' · ' : '') + '노출 값을 못 읽어 보정 불가 (출렁임 가능성)');
            phase = 'rec'; rec.frames = []; rec.recWall = performance.now();
            endTimer = setTimeout(() => finish(false), rec.dur * 1000 + 150);
        }, 3000);
    }
    function finish(cancel) {
        clearTimeout(settleTimer); clearTimeout(endTimer);
        const r = rec; rec = null;
        if (phase !== 'off') phase = stream ? 'idle' : 'off';
        $('start').hidden = false; $('stop').hidden = true; $('cam').disabled = false; $('time-st').hidden = true;
        torchOff();
        if (wakeLock) { try { wakeLock.release(); } catch (e) { /* 무시 */ } wakeLock = null; }
        if (!r) return;
        const dur = r.frames.length > 1 ? r.frames[r.frames.length - 1].t - r.frames[0].t : 0;
        if (cancel && dur < 8) { msg('8초보다 짧아 저장하지 않았어요.'); return; }
        addRun({ lock: r.lock || 'unlocked', why: r.why, torch: r.torch, frames: r.frames });
    }

    function newId() { let k = 1; const ids = new Set(state.runs.map(r => r.id)); while (ids.has('r' + k)) k++; return 'r' + k; }
    function addRun(o) {
        const raw = H.pack(o.frames);
        const a = analyzeFrames(o.lock, H.unpack(raw));
        const run = { id: newId(), at: o.at || new Date().toISOString(), lock: o.lock, why: o.why || '', torch: !!o.torch, sim: !!o.sim, palp: null, raw, res: summarize(a) };
        state.runs.push(run);
        while (state.runs.length > MAX_RUNS) state.runs.shift();
        state.pick = run.id;
        save();
        renderRuns(); renderDetail();
        const res = run.res;
        if (res.bpm != null) {
            $('v-bpm').textContent = Math.round(res.bpm);
            $('v-ibi').textContent = res.ibi && res.ibi.length ? Math.round(H.mean(res.ibi)) : Math.round(60000 / res.bpm);
            showLock(res.modeText.split(' ')[0] + ' ' + (res.mode === 'locked' ? '고정됨' : '고정 안 됨'), res.modeText.replace(/^\S+\s*/, ''));
            msg(`✅ 저장했어요: <b>${Math.round(res.bpm)} 회/분</b> ${LEVEL[res.level] || ''} (신뢰도 ${Math.round(res.conf * 100)}%) · ${esc(res.modeText)}` +
                (res.exposure && res.exposure.warn ? `<br>${esc(res.exposure.text)}` : '') + (res.level === 'bad' ? '<br>신뢰도가 낮아요. 손가락을 다시 덮고 가만히 재 보세요.' : ''), res.level === 'bad' || (res.exposure && res.exposure.warn) ? 'warn' : '');
        } else msg('저장했지만 심박수를 찾지 못했어요: ' + esc((res.reasons || []).join(', ')) + '. 손가락을 다시 덮고 재 보세요.', 'warn');
        return run;
    }
    function summarize(a) {
        return {
            ok: a.ok, bpm: a.bpm, level: a.level, conf: a.conf, method: a.method, channel: a.channel, bpmFFT: a.bpmFFT, bpmAC: a.bpmAC, bpmPeaks: a.bpmPeaks,
            ibi: a.ibi, cv: a.cv, dur: a.dur, fpsMean: a.fpsMean, reasons: a.reasons, mode: a.mode.mode, modeText: a.mode.text,
            exposure: a.exposure ? { warn: a.exposure.warn, wobble: !!a.exposure.wobble, available: a.exposure.available, text: a.exposure.text, bpm: a.exposure.bpm, varPct: a.exposure.varPct } : null
        };
    }

    // ---------- 회차 목록 ----------
    const runTime = at => { const d = new Date(at); return isNaN(d) ? '' : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
    const MODE_SHORT = { locked: '🔒 노출 고정', corrected: '⚠ 노출 보정', nocorrect: '⚠ 보정 불가' };
    function runName(r, i) { return (i + 1) + '회' + (r.sim ? ' 🧪' : r.lock.startsWith('csv') ? ' 📂' : ''); }
    function renderRuns() {
        const ul = $('runs');
        $('runs-empty').hidden = !!state.runs.length;
        $('csv-all').disabled = !state.runs.length;
        $('runs-sum').textContent = state.runs.length ? '— ' + state.runs.length + '개' : '';
        ul.innerHTML = state.runs.map((r, i) => {
            const res = r.res || {}, palp = H.palpBpm(r.palp), err = palp && res.bpm != null ? H.errorPct(res.bpm, palp) : null;
            return `<li data-id="${esc(r.id)}"><span class="ttl">${runName(r, i)} <small>${runTime(r.at)} · ${res.dur ? Math.round(res.dur) + '초' : ''} · ${MODE_SHORT[res.mode] || ''}${r.torch ? ' · 플래시' : ''}</small></span>` +
                `<span class="bpm">${res.bpm != null ? Math.round(res.bpm) : '--'}</span><span>회/분 ${LEVEL[res.level] || '🔴'}</span>` +
                `<label>손목 15초 <input type="number" min="0" max="80" step="1" inputmode="numeric" data-palp="${esc(r.id)}" value="${r.palp == null ? '' : esc(r.palp)}"></label>` +
                `<span>${palp ? '= ' + palp + ' 회/분' + (err != null ? ` (오차 ${err > 0 ? '+' : ''}${err}%)` : '') : ''}</span>` +
                `<span class="acts"><button type="button" class="secondary" data-view="${esc(r.id)}" title="자세히">🔍</button><button type="button" class="info" data-csv="${esc(r.id)}" title="원본 CSV">⬇</button><button type="button" class="danger" data-del="${esc(r.id)}" title="지우기">🗑</button></span></li>`;
        }).reverse().join('');
        renderPick();
    }
    $('runs').addEventListener('change', e => {
        const id = e.target.dataset.palp, r = id && state.runs.find(x => x.id === id);
        if (!r) return;
        const v = e.target.value === '' ? null : Math.round(Number(e.target.value));
        r.palp = Number.isFinite(v) && v > 0 && v <= 80 ? v : null;
        save(); renderRuns(); renderDetail();
    });
    $('runs').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.del) { if (!confirm('이 회차를 지울까요?')) return; state.runs = state.runs.filter(r => r.id !== b.dataset.del); save(); renderRuns(); renderDetail(); }
        else if (b.dataset.csv) downloadRunCsv(b.dataset.csv);
        else if (b.dataset.view) { state.pick = b.dataset.view; save(); renderPick(); $('detail-box').open = true; renderDetail(); $('detail-box').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });

    // ---------- 시뮬레이션 ----------
    $('sim').addEventListener('click', () => {
        const bpm = Math.min(210, Math.max(36, Number($('sim-bpm').value) || 67)), wob = $('sim-exp').checked;
        const frames = H.simulate({ bpm, dur: Number($('dur').value) || 30, fps: 24, jitter: 0.4, noise: 0.004, physical: true, expFollow: 0, expBpm: wob ? 40 : 0, expAmp: 0.3, seed: Math.floor(Math.random() * 1e9) });
        addRun({ lock: wob ? 'unlocked' : 'locked', sim: true, frames });
    });

    // ---------- CSV ----------
    function download(name, text) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
        a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function csvFor(r) {
        const i = state.runs.indexOf(r);
        return H.toCsv(H.unpack(r.raw), { '실험': '스마트폰 카메라 심박수', '회차': runName(r, i), '시각': r.at, '노출': r.res && r.res.modeText, '심박수': r.res && r.res.bpm, '손목 15초': r.palp,
            locked: r.lock === 'locked' || r.lock === 'csv-locked' });
    }
    function downloadRunCsv(id) { const r = state.runs.find(x => x.id === id); if (r) download('heart_rate_' + r.id + '.csv', csvFor(r)); }
    $('csv-all').addEventListener('click', () => download('heart_rate_all.csv', state.runs.map(csvFor).join('\n')));
    $('csv-in').addEventListener('change', async e => {
        const files = Array.from(e.target.files || []);
        let ok = 0; const bad = [];
        for (const f of files) {
            const text = await f.text();
            // 한 파일에 회차 여러 개(모든 회차 CSV)면 머리글마다 나눔
            for (const p of text.split(/\r?\n(?=(?:#[^\n]*\r?\n)*t_s,)/)) {
                const pr = H.parseCsv(p);
                if (pr.error || pr.frames.length < 20) { bad.push(f.name + (pr.error ? ': ' + pr.error : '')); continue; }
                const locked = /^(1|true)$/.test(String(pr.meta.locked || ''));
                addRun({ lock: locked ? 'csv-locked' : 'csv', frames: pr.frames, at: !isNaN(Date.parse(pr.meta['시각'])) ? pr.meta['시각'] : undefined });
                ok++;
            }
        }
        e.target.value = '';
        msg(`📂 ${ok}개 회차를 불러왔어요` + (bad.length ? ` · 못 읽음: ${esc(bad.join(', '))}` : '') + '.', bad.length ? 'warn' : '');
    });

    // ---------- 회차 자세히 ----------
    function renderPick() {
        if (!state.runs.some(r => r.id === state.pick)) state.pick = state.runs.length ? state.runs[state.runs.length - 1].id : '';
        $('pick').innerHTML = state.runs.map((r, i) => `<option value="${esc(r.id)}"${r.id === state.pick ? ' selected' : ''}>${runName(r, i)} · ${runTime(r.at)} · ${r.res && r.res.bpm != null ? Math.round(r.res.bpm) + ' 회/분' : '--'}</option>`).reverse().join('');
    }
    $('pick').addEventListener('change', e => { state.pick = e.target.value; save(); renderDetail(); });
    $('detail-box').addEventListener('toggle', () => renderDetail());
    function renderDetail() {
        const r = state.runs.find(x => x.id === state.pick);
        $('detail').hidden = !r; $('detail-empty').hidden = !!r;
        if (!r || !$('detail-box').open) return;
        const frames = H.unpack(r.raw), a = analyzeFrames(r.lock, frames);
        const palp = H.palpBpm(r.palp), err = palp && a.bpm != null ? H.errorPct(a.bpm, palp) : null;
        const avgIbi = a.ibi && a.ibi.length ? Math.round(H.mean(a.ibi)) : null;
        const ev = H.exposureVariation(frames);
        $('res-grid').innerHTML =
            `<div>심박수 (${esc(a.method || '-')})<b>${a.bpm != null ? a.bpm + ' 회/분' : '찾지 못함'}</b></div>` +
            `<div>신뢰도<b>${LEVEL[a.level] || '🔴'} ${a.conf != null ? Math.round(a.conf * 100) + '%' : ''}</b></div>` +
            `<div>주파수 분석(FFT)<b>${a.bpmFFT != null ? a.bpmFFT : '-'}</b></div>` +
            `<div>자기상관<b>${a.bpmAC != null ? a.bpmAC : '-'}</b></div>` +
            `<div>봉우리 간격<b>${a.bpmPeaks != null ? a.bpmPeaks : '-'}</b></div>` +
            `<div>박동 간격(IBI) 평균<b>${avgIbi != null ? avgIbi + ' ms' : '-'}${a.cv != null ? ' ±' + Math.round(a.cv * 100) + '%' : ''}</b></div>` +
            `<div>손목 맥박<b>${palp ? palp + ' 회/분' + (err != null ? ` (${err > 0 ? '+' : ''}${err}%)` : '') : '안 넣음'}</b></div>` +
            `<div>노출 처리<b>${esc(MODE_SHORT[a.mode.mode] || '')}</b></div>` +
            `<div>노출 변화<b>${ev != null ? ev.toFixed(1) + '%' : '읽을 수 없음'}</b></div>` +
            `<div>사진 수<b>${a.fpsMean != null ? a.fpsMean + '장/초 · ' + a.dur + '초' : '-'}</b></div>`;
        const why = [`<p class="note">노출: ${esc(a.mode.text)}${r.why ? ' (' + esc(r.why) + ')' : ''}</p>`];
        if (a.exposure) why.push(`<div class="note${a.exposure.warn ? ' warn' : ''}">노출 점검: ${esc(a.exposure.text)}</div>`);
        if (a.reasons && a.reasons.length) why.push(`<p class="note">참고: ${esc(a.reasons.join(' · '))}</p>`);
        $('res-why').innerHTML = why.join('');
        if (a.ok && a.wave) {
            plot($('res-wave'), [{ pts: a.wave.map((y, i) => ({ x: i / a.fs, y })), color: '#c62828', width: 1.5 },
                { pts: (a.peaks || []).map(t => ({ x: t, y: a.wave[Math.min(a.wave.length - 1, Math.round(t * a.fs))] })), color: '#1565c0', dots: 4, noLine: true }], { xlabel: '시간 (초)', yticks: false });
            const sp = a.spec.f.map((f, i) => ({ x: f * 60, y: a.spec.p[i] })).filter(p => p.x <= 240), mx = Math.max(...sp.map(p => p.y)) || 1;
            plot($('res-spec'), [{ pts: sp.map(p => ({ x: p.x, y: p.y / mx })), color: '#1565c0', width: 1.5 }, { pts: [{ x: a.bpm, y: 0 }, { x: a.bpm, y: 1 }], color: '#c62828', dash: [4, 3], width: 1.5 }],
                { xlabel: '빠르기 (회/분)', ymin: 0, ymax: 1.05, yticks: false, xmin: 0, xmax: 240, bands: [{ x0: 0, x1: 36, color: 'rgba(0,0,0,.05)' }, { x0: 210, x1: 240, color: 'rgba(0,0,0,.05)' }] });
        } else { plot($('res-wave'), [], { empty: '파형을 만들 수 없어요' }); plot($('res-spec'), [], {}); }
        // 보정 전·후 (노출 값이 있을 때)
        const es = frames.map(f => Number(f.e)), e0 = es.find(e => e > 0);
        $('cmp-box').hidden = !e0;
        if (e0) {
            const before = a.corrected ? H.analyze(frames, { correct: false, channel: a.channel }) : a;
            const after = a.corrected ? a : H.analyze(frames, { correct: true, channel: a.channel });
            const norm = w => { const m = Math.max(...w.map(Math.abs)) || 1; return w.map((y, i) => ({ x: i / FSr, y: y / m })); };
            const FSr = H.FS;
            const ser = [];
            if (before.wave) ser.push({ pts: norm(before.wave).map(p => ({ x: p.x, y: p.y + 1.2 })), color: '#868e96', width: 1.3 });
            if (after.wave) ser.push({ pts: norm(after.wave).map(p => ({ x: p.x, y: p.y - 1.2 })), color: '#c62828', width: 1.3 });
            plot($('res-cmp'), ser, { xlabel: `시간 (초) · 위: 보정 전 ${before.bpm != null ? before.bpm + ' 회/분' : '-'} · 아래: 보정 후 ${after.bpm != null ? after.bpm + ' 회/분' : '-'}`, yticks: false });
            const t0 = frames[0].t;
            plot($('res-exp'), [{ pts: frames.filter(f => f.e > 0).map(f => ({ x: f.t - t0, y: f.e / e0 })), color: '#0e7490', width: 1.5 }], { xlabel: '시간 (초)', ylabel: '노출 (처음 = 1)' });
        }
        $('res-csv').onclick = () => downloadRunCsv(r.id);
    }

    // ---------- 단추 ----------
    $('dur').value = String(state.dur || 30);
    $('dur').addEventListener('change', e => { state.dur = Number(e.target.value); save(); });
    $('torch').addEventListener('change', async e => {
        $('torch-warn').hidden = !e.target.checked;
        if (track && caps.torch && phase !== 'off') { try { await track.applyConstraints({ advanced: [{ torch: e.target.checked }] }); } catch (err) { /* 무시 */ } }
    });
    $('cam').addEventListener('click', () => { if (stream) stopCamera(); else startCamera(); });
    $('start').addEventListener('click', start);
    $('stop').addEventListener('click', () => finish(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden && rec) { finish(true); msg('화면을 벗어나 측정을 멈췄어요.', 'warn'); } });
    window.addEventListener('resize', () => { drawLive(); renderDetail(); });

    renderRuns(); renderDetail();
    plot($('wave'), [], { empty: '카메라를 켜고 손가락을 올리면 맥파가 나와요' });
    // 시험용
    window.__heartRate = { state: () => state, addRun, phase: () => phase };
})();
