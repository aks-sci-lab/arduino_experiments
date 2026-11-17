// 스마트폰 카메라 심박수 — 화면 (projects/heart-rate.html)
//  보고서 순서 7단계(LabUI.initSteps). 5 데이터: 카메라 측정(노출 고정)·시뮬레이션·회차 목록·CSV, 6 결과: 회복 그래프·회차 자세히, 7 결론: 보내기
//  계산은 js/heart-rate-math.js, 조 공유 자료는 js/heart-rate-share.js, 수업 참여·조 공유·📱 폰 연결은 js/class-share.js (docs/class-share.md)
//  영상은 저장·전송하지 않는다: 프레임마다 가운데 영역의 빨강·초록·밝기 평균과 노출 값만 기록
(function () {
    'use strict';
    const H = window.HeartRateMath, HS = window.HeartRateShare;
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const PHONE = !!(window.ClassShare && ClassShare.readPhoneParams && ClassShare.readPhoneParams(location.search));
    const KEY = 'heart-rate:v1' + (PHONE ? ':phone' : '');
    const MAX_RUNS = 30;
    const LEVEL = { good: '🟢', fair: '🟡', bad: '🔴' };
    const LOCK_LABEL = { locked: '🔒 노출 고정됨', unsupported: '⚠ 노출 고정 안 됨 (이 폰은 지원 안 함)', failed: '⚠ 노출 고정 안 됨 (잠그기 실패)', sim: '🧪 시뮬레이션', csv: '📂 파일에서 불러옴' };

    // ---------- 저장 ----------
    let state = { runs: [], ext: {}, share: null, label: H.LABELS[0], dur: 30, tab: 'purpose', pick: '' };
    function load() {
        try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') state = Object.assign(state, s); } catch (e) { /* 무시 */ }
        if (!Array.isArray(state.runs)) state.runs = [];
        if (!state.ext || typeof state.ext !== 'object') state.ext = {};
    }
    let saveWarned = false;
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { if (!saveWarned) { saveWarned = true; msg('⚠ 이 브라우저에 저장하지 못했어요(저장 공간 부족 또는 사생활 보호 모드). 원본 CSV 로 내려받아 두세요.', 'warn'); } }
    }
    load();

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

    // ---------- 카메라 ----------
    const video = $('video'), canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 30;
    const cctx = canvas.getContext('2d', { willReadFrequently: true });
    let stream = null, track = null, caps = {}, lockState = '', camT0 = null, timeBase = '';
    let phase = 'off';           // off | idle | settle | rec
    let live = [];               // 최근 4초 (품질·그래프)
    let rec = null;              // 지금 측정 { frames, start, dur, label, torch, lock }
    let wakeLock = null;

    function msg(html, kind) { const el = $('msg'); el.innerHTML = html || ''; el.className = 'note' + (kind ? ' ' + kind : ''); }
    function supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

    async function startCamera() {
        if (!supported()) { msg('이 브라우저에서는 카메라를 쓸 수 없어요. <b>https</b> 주소인지, 크롬·사파리 최신판인지 확인하세요. 카메라 없이 🧪 시뮬레이션으로 해 볼 수 있어요.', 'err'); return false; }
        msg('카메라를 켜는 중…');
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } } });
        } catch (e) {
            msg('카메라를 켜지 못했어요: ' + esc(e && e.name === 'NotAllowedError' ? '권한이 거절됨 — 주소창의 🔒 에서 카메라를 허용하세요' : (e && e.message) || e) + '. 카메라 없이 🧪 시뮬레이션으로 해 볼 수 있어요.', 'err');
            return false;
        }
        video.srcObject = stream; video.classList.add('on');
        try { await video.play(); } catch (e) { /* 자동 재생 막힘: 프레임은 그래도 옴 */ }
        track = stream.getVideoTracks()[0];
        caps = {};
        try { caps = (track.getCapabilities && track.getCapabilities()) || {}; } catch (e) { caps = {}; }
        const canLock = Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual');
        lockState = canLock ? 'ready' : 'unsupported';
        $('lock-st').textContent = canLock ? '노출: 측정 시작 때 고정해요' : '⚠ 이 폰은 노출을 고정할 수 없어요 (측정은 돼요)';
        $('lock-st').className = 'pill ' + (canLock ? '' : 'fair');
        $('torch-wrap').hidden = !caps.torch;
        phase = 'idle'; camT0 = null; timeBase = '';
        $('cam').textContent = '📷 카메라 끄기';
        $('start').disabled = false;
        msg('검지 끝으로 뒤 카메라를 살짝 눌러 덮으세요. 품질이 🟢 가 되면 ▶ 측정 시작.');
        loop();
        return true;
    }
    function stopCamera() {
        if (rec) finish(true);
        phase = 'off';
        if (stream) stream.getTracks().forEach(t => t.stop());
        stream = null; track = null; video.srcObject = null; video.classList.remove('on');
        $('cam').textContent = '📷 카메라 켜기'; $('start').disabled = true;
        $('q-st').textContent = '품질: —'; $('q-st').className = 'pill';
        msg('카메라를 껐어요.');
    }

    // 프레임마다: 가운데 60% 영역 평균
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
                // 실제 찍힌 시각: captureTime(있으면) > mediaTime > now. 한 번 정한 기준을 계속 씀
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
        const q = H.quality(live.filter(f => f.t >= (live.length ? live[live.length - 1].t - 2 : 0)));
        $('q-st').textContent = LEVEL[q.level] + ' ' + q.text; $('q-st').className = 'pill ' + q.level;
        if (phase === 'settle' || phase === 'rec') {
            const el = (now - rec.wall) / 1000;
            const left = phase === 'settle' ? Math.max(0, 3 - el) : Math.max(0, rec.dur - (el - 3));
            $('time-st').hidden = false;
            $('time-st').textContent = phase === 'settle' ? '노출 맞추는 중 ' + left.toFixed(0) + '초' : '⏱ 남은 시간 ' + Math.ceil(left) + '초';
            if (phase === 'rec' && rec.frames.length > 10 && now - lastBpmT > 1000) {
                lastBpmT = now;
                const last = rec.frames[rec.frames.length - 1].t;
                if (last - rec.frames[0].t >= 6) {
                    const a = H.analyze(rec.frames.filter(f => f.t >= last - 12));
                    if (a.ok) { $('bpm-now').textContent = Math.round(a.bpm); const big = $('bpm-now').parentElement; big.classList.remove('beat'); void big.offsetWidth; big.classList.add('beat'); }
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
        plot($('wave'), [{ pts: out, color: '#c62828', width: 2 }], { xmin: -6, xmax: 0, yticks: false, empty: '손가락을 올리면 파형이 나와요' });
    }

    // ---------- 노출 고정 ----------
    async function settleThenLock() {
        if (!track) return 'unsupported';
        const canLock = Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual');
        if (!canLock) return 'unsupported';
        const s = track.getSettings ? track.getSettings() : {};
        const adv = { exposureMode: 'manual' };
        if (caps.exposureTime && Number.isFinite(s.exposureTime)) adv.exposureTime = Math.min(caps.exposureTime.max || Infinity, Math.max(caps.exposureTime.min || 0, s.exposureTime));
        if (caps.iso && Number.isFinite(s.iso)) adv.iso = Math.min(caps.iso.max || Infinity, Math.max(caps.iso.min || 0, s.iso));
        if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('manual')) adv.whiteBalanceMode = 'manual';
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('manual')) adv.focusMode = 'manual';
        try {
            await track.applyConstraints({ advanced: [adv] });
            const after = track.getSettings ? track.getSettings() : {};
            return after.exposureMode === 'manual' ? 'locked' : 'failed';
        } catch (e) { return 'failed'; }
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
        rec = { frames: [], wall: performance.now(), dur: Number($('dur').value) || 30, label: $('label').value, torch: !!$('torch').checked, lock: '' };
        phase = 'settle';
        $('start').hidden = true; $('stop').hidden = false; $('cam').disabled = true;
        $('bpm-now').textContent = '--';
        msg('손가락을 가만히 — 3초 동안 노출을 맞춘 뒤 잠가요.');
        try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
        await setAuto();
        settleTimer = setTimeout(async () => {
            if (!rec) return;
            const lk = await settleThenLock();
            if (!rec) return;
            rec.lock = lk; lockState = lk;
            $('lock-st').textContent = LOCK_LABEL[lk] || lk; $('lock-st').className = 'pill ' + (lk === 'locked' ? 'good' : 'fair');
            phase = 'rec'; rec.frames = [];
            msg(lk === 'locked' ? '🔒 노출을 잠갔어요. 가만히 기다리세요.' : '⚠ 노출을 고정하지 못했어요. 측정은 하지만 결과에 \'노출 고정 안 됨\'으로 표시해요.', lk === 'locked' ? '' : 'warn');
            endTimer = setTimeout(() => finish(false), rec.dur * 1000 + 150);
        }, 3000);
    }
    function finish(cancel) {
        clearTimeout(settleTimer); clearTimeout(endTimer);
        const r = rec; rec = null;
        if (phase === 'settle' || phase === 'rec') phase = stream ? 'idle' : 'off';
        $('start').hidden = false; $('stop').hidden = true; $('cam').disabled = false; $('time-st').hidden = true;
        torchOff();
        if (wakeLock) { try { wakeLock.release(); } catch (e) { /* 무시 */ } wakeLock = null; }
        if (!r) return;
        const dur = r.frames.length > 1 ? r.frames[r.frames.length - 1].t - r.frames[0].t : 0;
        if (cancel && dur < 8) { msg('8초보다 짧아 저장하지 않았어요.'); return; }
        addRun({ label: r.label, lock: r.lock || 'unsupported', torch: r.torch, frames: r.frames });
    }

    function newId() { let k = 1; const ids = new Set(state.runs.map(r => r.id)); while (ids.has('r' + k)) k++; return 'r' + k; }
    function addRun(o) {
        const raw = HS.fromFrames(o.frames);
        const res = summarize(H.analyze(HS.toFrames(raw)));
        const run = { id: newId(), at: o.at || new Date().toISOString(), label: o.label || H.LABELS[0], lock: o.lock, torch: !!o.torch, sim: !!o.sim, palp: null, raw, res };
        state.runs.push(run);
        while (state.runs.length > MAX_RUNS) state.runs.shift();
        state.pick = 'me/' + run.id;
        save();
        renderRuns(); renderLast(run);
        if (share) share.saved();
        if (res.bpm != null) msg(`✅ 저장했어요: ${esc(run.label)} — <b>${Math.round(res.bpm)} 회/분</b> ${LEVEL[res.level] || ''}` + (PHONE ? ' · 아래 띠에서 보낼 회차를 골라 📤' : ''));
        else msg('저장했지만 심박수를 찾지 못했어요: ' + esc((res.reasons || []).join(', ')) + '. 손가락을 다시 덮고 재 보세요.', 'warn');
        return run;
    }
    // 저장할 결과 (파형 등 큰 것은 빼고)
    function summarize(a) {
        return {
            ok: a.ok, bpm: a.bpm, level: a.level, conf: a.conf, method: a.method, channel: a.channel, bpmFFT: a.bpmFFT, bpmAC: a.bpmAC, bpmPeaks: a.bpmPeaks,
            ibi: a.ibi, cv: a.cv, dur: a.dur, fpsMean: a.fpsMean, reasons: a.reasons, exposure: a.exposure ? { warn: a.exposure.warn, available: a.exposure.available, text: a.exposure.text, bpm: a.exposure.bpm } : null
        };
    }

    // ---------- 회차 목록 ----------
    function runTime(at) { const d = new Date(at); return isNaN(d) ? '' : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    function renderRuns() {
        const ul = $('runs');
        $('runs-empty').hidden = !!state.runs.length;
        $('csv-all').disabled = !state.runs.length;
        ul.innerHTML = state.runs.slice().reverse().map(r => {
            const res = r.res || {}, palp = H.palpBpm(r.palp), err = palp && res.bpm != null ? H.errorPct(res.bpm, palp) : null;
            return `<li data-id="${esc(r.id)}"><span class="ttl">${esc(r.label)}${r.sim ? ' 🧪' : ''} <small>${runTime(r.at)} · ${res.dur ? Math.round(res.dur) + '초' : ''} · ${r.lock === 'locked' ? '🔒' : r.lock === 'sim' ? '' : '⚠ 노출 고정 안 됨'}${r.torch ? ' · 플래시' : ''}</small></span>` +
                `<span class="bpm">${res.bpm != null ? Math.round(res.bpm) : '--'}</span><span>회/분 ${LEVEL[res.level] || '🔴'}</span>` +
                `<label>손목 15초 <input type="number" min="0" max="80" step="1" inputmode="numeric" data-palp="${esc(r.id)}" value="${r.palp == null ? '' : esc(r.palp)}"></label>` +
                `<span>${palp ? '= ' + palp + ' 회/분' + (err != null ? ` (오차 ${err > 0 ? '+' : ''}${err}%)` : '') : ''}</span>` +
                `<span class="acts"><button type="button" class="secondary" data-view="${esc(r.id)}" title="자세히">🔍</button><button type="button" class="info" data-csv="${esc(r.id)}" title="원본 CSV">⬇</button><button type="button" class="danger" data-del="${esc(r.id)}" title="지우기">🗑</button></span></li>`;
        }).join('');
    }
    function renderLast(run) {
        const res = run.res || {};
        $('last-card').hidden = false;
        $('last').innerHTML = `<div class="results">` +
            `<div>심박수<b>${res.bpm != null ? Math.round(res.bpm) + ' 회/분' : '찾지 못함'}</b></div>` +
            `<div>신뢰도<b>${LEVEL[res.level] || '🔴'} ${res.conf != null ? Math.round(res.conf * 100) + '%' : ''}</b></div>` +
            `<div>노출<b>${run.lock === 'locked' ? '🔒 고정됨' : run.lock === 'sim' ? '🧪 시뮬레이션' : '⚠ 고정 안 됨'}</b></div>` +
            `<div>프레임<b>${res.fpsMean != null ? res.fpsMean + '장/초' : ''}</b></div></div>` +
            (res.exposure && res.exposure.warn ? `<div class="warn">${esc(res.exposure.text)}</div>` : '') +
            (res.reasons && res.reasons.length ? `<p class="note">참고: ${esc(res.reasons.join(' · '))}</p>` : '') +
            `<p class="note">손목 맥박을 15초 동안 셌다면 아래 회차 목록의 '손목 15초' 칸에 넣으세요.</p>`;
    }
    $('runs').addEventListener('change', e => {
        const id = e.target.dataset.palp;
        if (!id) return;
        const r = state.runs.find(x => x.id === id);
        if (!r) return;
        const v = e.target.value === '' ? null : Math.round(Number(e.target.value));
        r.palp = Number.isFinite(v) && v > 0 && v <= 80 ? v : null;
        save(); renderRuns(); renderResult();
        if (share) share.saved();
    });
    $('runs').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.del) { if (!confirm('이 회차를 지울까요?')) return; deleteRun(b.dataset.del); if (share) share.saved(); }
        else if (b.dataset.csv) downloadRunCsv('me/' + b.dataset.csv);
        else if (b.dataset.view) { state.pick = 'me/' + b.dataset.view; save(); if (steps && !PHONE) steps.show('result', true); else renderResult(); }
    });
    function deleteRun(id) { state.runs = state.runs.filter(r => r.id !== id); save(); renderRuns(); renderResult(); }

    // ---------- 시뮬레이션 ----------
    $('sim').addEventListener('click', () => {
        const bpm = Math.min(210, Math.max(36, Number($('sim-bpm').value) || 72));
        const frames = H.simulate({ bpm, dur: Number($('dur').value) || 30, fps: 24, jitter: 0.4, noise: 0.004, expBpm: $('sim-exp').checked ? 40 : 0, expFollow: 0.15, seed: Math.floor(Math.random() * 1e9) });
        addRun({ label: $('label').value, lock: 'sim', sim: true, frames });
    });

    // ---------- CSV ----------
    function download(name, text) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
        a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function entry(key) {
        const [src, ...rest] = String(key || '').split('/'), id = rest.join('/');
        if (src === 'me') { const r = state.runs.find(x => x.id === id); return r ? { mine: true, from: '내 기록', id: r.id, label: r.label, at: r.at, lock: r.lock, sim: r.sim, palp: r.palp, raw: r.raw, res: r.res } : null; }
        const e = state.ext[key];
        return e ? { mine: false, from: e.from, id: e.id, label: e.label || e.title, at: e.at, lock: e.lock, sim: e.sim, palp: e.palp, raw: e.raw, bpm: e.bpm } : null;
    }
    function csvFor(en) {
        return H.toCsv(HS.toFrames(en.raw), { '실험': '스마트폰 카메라 심박수', '기록': en.from, '회차': en.label, '시각': en.at, '노출 고정': HS.LOCK_TEXT[en.lock] || en.lock, '손목 15초': en.palp });
    }
    function downloadRunCsv(key) {
        const en = entry(key);
        if (!en) return;
        download('heart_rate_' + (en.mine ? 'me' : String(key).split('/')[0].slice(-4)) + '_' + en.id + '.csv', csvFor(en));
    }
    $('csv-all').addEventListener('click', () => {
        download('heart_rate_all.csv', state.runs.map(r => csvFor(entry('me/' + r.id))).join('\n'));
    });
    $('csv-in').addEventListener('change', async e => {
        const files = Array.from(e.target.files || []);
        let ok = 0, bad = [];
        for (const f of files) {
            const text = await f.text();
            // 한 파일에 회차 여러 개(모든 회차 CSV)면 머리글마다 나눔
            const parts = text.split(/\r?\n(?=(?:#[^\n]*\r?\n)*t_s,)/);
            for (const p of parts) {
                const pr = H.parseCsv(p);
                if (pr.error || pr.frames.length < 20) { bad.push(f.name + (pr.error ? ': ' + pr.error : '')); continue; }
                const label = H.LABELS.includes(pr.meta['회차']) ? pr.meta['회차'] : '기타';
                addRun({ label, lock: 'csv', frames: pr.frames, at: !isNaN(Date.parse(pr.meta['시각'])) ? pr.meta['시각'] : undefined });
                ok++;
            }
        }
        e.target.value = '';
        msg(`📂 ${ok}개 회차를 불러왔어요` + (bad.length ? ` · 못 읽음: ${esc(bad.join(', '))}` : '') + '.', bad.length ? 'warn' : '');
    });

    // ---------- 결과: 회복 그래프 ----------
    function renderRecovery() {
        const groups = HS.recoveryGroups(state.runs, state.ext);
        plot($('rec'), groups.map((g, i) => ({ pts: g.points, color: COLORS[i % COLORS.length], dots: 4, width: 2 })),
            { xlabel: '운동 직후부터 (분)', ylabel: '심박수 (회/분)', empty: '시뮬레이션이 아닌 회차를 재면 여기에 그려져요' });
        $('rec-legend').innerHTML = groups.map((g, i) => `<span><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(g.name)}</span>`).join('');
        // 표: 내 기록 + 불러온 기록
        const rows = [];
        state.runs.forEach(r => rows.push({ from: '내 기록', label: r.label + (r.sim ? ' 🧪' : ''), at: r.at, bpm: r.res && r.res.bpm, palp: H.palpBpm(r.palp), conf: r.res && r.res.conf, level: r.res && r.res.level, sim: r.sim }));
        Object.keys(state.ext).forEach(k => { const e = state.ext[k]; rows.push({ from: e.from, label: (e.label || e.title) + (e.sim ? ' 🧪' : ''), at: e.at, bpm: e.bpm, palp: H.palpBpm(e.palp), conf: e.conf, sim: e.sim }); });
        const mins = {};
        groups.forEach(g => g.points.forEach(p => { mins[g.key + '|' + p.label + '|' + p.y] = p.x; }));
        const minOf = (key, r) => { const v = mins[key + '|' + r.label + '|' + Number(r.bpm)]; return v == null ? '' : v.toFixed(1); };
        const keyOf = r => r.from === '내 기록' ? 'me' : (Object.values(state.ext).find(e => e.from === r.from) || {}).device;
        $('rec-table').tBodies[0].innerHTML = rows.length ? rows.map(r => `<tr><td>${esc(r.from)}</td><td>${esc(r.label)}</td><td>${r.sim ? '' : minOf(keyOf(r), r)}</td><td>${r.bpm != null ? Math.round(r.bpm) : '--'}</td><td>${r.palp || ''}</td><td>${r.conf != null ? Math.round(r.conf * 100) + '%' : ''}</td></tr>`).join('')
            : '<tr><td colspan="6" class="note">아직 기록이 없어요.</td></tr>';
        $('rec-csv').onclick = () => {
            const lines = ['기록,회차,시각,카메라(회/분),손목(회/분),신뢰도'];
            rows.forEach(r => lines.push([r.from, r.label, r.at, r.bpm != null ? r.bpm : '', r.palp || '', r.conf != null ? r.conf : ''].map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')));
            download('heart_rate_results.csv', lines.join('\n') + '\n');
        };
    }

    // ---------- 결과: 회차 자세히 ----------
    function renderPick() {
        const opts = state.runs.slice().reverse().map(r => ['me/' + r.id, '내 기록 · ' + r.label + (r.sim ? ' 🧪' : '') + ' · ' + runTime(r.at)]);
        Object.keys(state.ext).forEach(k => { const e = state.ext[k]; opts.push([k, e.from + ' · ' + (e.label || e.title) + ' · ' + runTime(e.at)]); });
        if (!opts.some(o => o[0] === state.pick)) state.pick = opts.length ? opts[0][0] : '';
        $('pick').innerHTML = opts.map(o => `<option value="${esc(o[0])}"${o[0] === state.pick ? ' selected' : ''}>${esc(o[1])}</option>`).join('');
    }
    $('pick').addEventListener('change', e => { state.pick = e.target.value; save(); renderDetail(); });
    function renderDetail() {
        const en = entry(state.pick);
        $('detail').hidden = !en; $('detail-empty').hidden = !!en;
        if (!en) return;
        const a = H.analyze(HS.toFrames(en.raw));
        const palp = H.palpBpm(en.palp), err = palp && a.bpm != null ? H.errorPct(a.bpm, palp) : null;
        const avgIbi = a.ibi && a.ibi.length ? Math.round(H.mean(a.ibi)) : null;
        $('res-grid').innerHTML =
            `<div>심박수 (${esc(a.method || '-')})<b>${a.bpm != null ? a.bpm + ' 회/분' : '찾지 못함'}</b></div>` +
            `<div>신뢰도<b>${LEVEL[a.level] || '🔴'} ${a.conf != null ? Math.round(a.conf * 100) + '%' : ''}</b></div>` +
            `<div>주파수 분석(FFT)<b>${a.bpmFFT != null ? a.bpmFFT : '-'}</b></div>` +
            `<div>자기상관<b>${a.bpmAC != null ? a.bpmAC : '-'}</b></div>` +
            `<div>봉우리 간격<b>${a.bpmPeaks != null ? a.bpmPeaks : '-'}</b></div>` +
            `<div>박동 간격(IBI) 평균<b>${avgIbi != null ? avgIbi + ' ms' : '-'}${a.cv != null ? ' ±' + Math.round(a.cv * 100) + '%' : ''}</b></div>` +
            `<div>손목 맥박<b>${palp ? palp + ' 회/분' + (err != null ? ` (${err > 0 ? '+' : ''}${err}%)` : '') : '안 넣음'}</b></div>` +
            `<div>노출<b>${en.lock === 'locked' ? '🔒 고정됨' : en.lock === 'sim' ? '🧪 시뮬레이션' : en.lock === 'csv' ? '📂 파일' : '⚠ 고정 안 됨'}</b></div>` +
            `<div>사진 수<b>${a.fpsMean != null ? a.fpsMean + '장/초 · ' + a.dur + '초' : '-'}</b></div>` +
            `<div>쓴 색<b>${{ r: '빨강 R', g: '초록 G', y: '밝기 Y' }[a.channel] || '-'}</b></div>`;
        const why = [];
        if (a.exposure) why.push(`<div class="${a.exposure.warn ? 'warn' : 'note'}">노출 점검: ${esc(a.exposure.text)}</div>`);
        if (a.reasons && a.reasons.length) why.push(`<p class="note">참고: ${esc(a.reasons.join(' · '))}</p>`);
        if (en.lock !== 'locked' && en.lock !== 'sim') why.push('<p class="note">노출을 고정하지 않고 잰 회차예요. 자동 노출 때문에 값이 틀릴 수 있어요.</p>');
        $('res-why').innerHTML = why.join('');
        if (a.ok && a.wave) {
            const w = a.wave.map((y, i) => ({ x: i / a.fs, y }));
            const pk = (a.peaks || []).map(t => ({ x: t, y: a.wave[Math.min(a.wave.length - 1, Math.round(t * a.fs))] }));
            plot($('res-wave'), [{ pts: w, color: '#c62828', width: 1.5 }, { pts: pk, color: '#1565c0', dots: 4, noLine: true }], { xlabel: '시간 (초)', yticks: false });
            const sp = a.spec.f.map((f, i) => ({ x: f * 60, y: a.spec.p[i] })).filter(p => p.x <= 240);
            const mx = Math.max(...sp.map(p => p.y)) || 1;
            plot($('res-spec'), [{ pts: sp.map(p => ({ x: p.x, y: p.y / mx })), color: '#1565c0', width: 1.5 }, { pts: [{ x: a.bpm, y: 0 }, { x: a.bpm, y: 1 }], color: '#c62828', dash: [4, 3], width: 1.5 }],
                { xlabel: '빠르기 (회/분)', ymin: 0, ymax: 1.05, yticks: false, xmin: 0, xmax: 240, bands: [{ x0: 0, x1: 36, color: 'rgba(0,0,0,.05)' }, { x0: 210, x1: 240, color: 'rgba(0,0,0,.05)' }] });
        } else {
            plot($('res-wave'), [], { empty: '파형을 만들 수 없어요' }); plot($('res-spec'), [], {});
        }
        $('res-csv').onclick = () => downloadRunCsv(state.pick);
    }
    function renderResult() { renderPick(); if (state.tab === 'result') { renderRecovery(); renderDetail(); } }

    // ---------- 단추 ----------
    $('label').innerHTML = H.LABELS.map(l => `<option${l === state.label ? ' selected' : ''}>${esc(l)}</option>`).join('');
    $('dur').value = String(state.dur || 30);
    $('label').addEventListener('change', e => { state.label = e.target.value; save(); });
    $('dur').addEventListener('change', e => { state.dur = Number(e.target.value); save(); });
    $('torch').addEventListener('change', async e => {
        $('torch-warn').hidden = !e.target.checked;
        if (track && caps.torch && phase !== 'off') { try { await track.applyConstraints({ advanced: [{ torch: e.target.checked }] }); } catch (err) { /* 무시 */ } }
    });
    $('cam').addEventListener('click', () => { if (stream) stopCamera(); else startCamera(); });
    $('start').addEventListener('click', start);
    $('stop').addEventListener('click', () => finish(true));
    $('btn-print').addEventListener('click', () => window.print());
    document.addEventListener('visibilitychange', () => { if (document.hidden && rec) { finish(true); msg('화면을 벗어나 측정을 멈췄어요.', 'warn'); } });

    // ---------- 조 공유 · 수업 참여 · 📱 폰 연결 (docs/class-share.md) ----------
    let share = null;
    if (window.ClassShare && HS) {
        share = ClassShare.init({
            exp: 'heartrate',
            barMount: '#class-bar-mount', shareMount: '#share-mount',
            csvHint: '5. 데이터 → 원본 CSV',
            sendButtons: ['#btn-send2'],
            store: { load: () => state.share, save: o => { state.share = o; save(); } },
            getItems: () => HS.buildItems(state.runs),
            onIncoming: items => {
                const r = HS.applyIncoming(state.ext, items);
                if (r.changed) { state.ext = r.ext; save(); renderResult(); }
                return r.changed;
            },
            getStep: () => (PHONE ? 'data' : state.tab),
            getPoints: () => state.runs.length,
            pollWhen: () => ['data', 'result', 'conclusion'].includes(state.tab),
            incomingCount: () => Object.keys(state.ext).length,
            clearIncoming: () => { state.ext = {}; save(); renderResult(); },
            phone: true,
            onRole: role => { document.body.classList.toggle('hr-phone', role === 'phone'); },
            onPhoneData: n => {
                const el = $('phone-note');
                el.hidden = false;
                el.innerHTML = '🆕 <b>폰에서 새 회차 ' + n + '개</b>가 들어왔어요. <button type="button" class="secondary" data-go="result">6. 결과에서 보기 →</button>';
            },
            deleteItem: id => deleteRun(String(id))
        });
    }
    $('btn-send2').onclick = () => {
        if (!share) { $('send2-status').textContent = '조 공유를 불러오지 못했어요. 5. 데이터의 원본 CSV 를 쓰세요.'; return; }
        if (!share.group()) { $('send2-status').textContent = '먼저 5. 데이터 맨 위 \'👥 조 공유\'에서 조 코드를 정하세요.'; return; }
        share.send('#send2-status');
    };

    renderRuns(); renderPick();
    const steps = window.LabUI && LabUI.initSteps({
        key: PHONE ? 'heart-rate-phone' : 'heart-rate',
        start: PHONE ? 'data' : undefined,
        onShow: step => { state.tab = step; save(); if (step === 'result') { renderRecovery(); renderDetail(); } if (share) share.stepChanged(); }
    });
    if (PHONE && steps && steps.current() !== 'data') steps.show('data');
    window.addEventListener('resize', () => { if (state.tab === 'result') { renderRecovery(); renderDetail(); } });
    // 시험용
    window.__heartRate = { state: () => state, addRun, analyzeRun: id => H.analyze(HS.toFrames((state.runs.find(r => r.id === id) || {}).raw)), phase: () => phase, lockState: () => lockState };
})();
