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
    // 📱 노트북 QR 로 연 폰 화면(?role=phone&group=…)은 기록을 노트북 화면과 따로 저장 (js/heart-rate-breath-ui.js 가 조 공유·폰 연결을 맡음)
    const PHONE = /[?&]role=phone(?:&|#|$)/.test(location.search);
    const KEY = 'heart-rate:v1' + (PHONE ? ':phone' : '');
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
    // scene: 손가락 대기 전 장면 밝기 { y, exposureTime, iso } (밝기 판정에 씀, 없으면 빼고 판정)
    function analyzeFrames(lock, frames, scene) {
        return H.analyzeRun(lock, frames, { scene });   // 보정할 때는 보정 전·후를 둘 다 계산해 믿을 만한 쪽 (a.alt)
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
    let lastScene = null;        // 손가락 대기 전 장면 { y, exposureTime, iso }
    let lastDim = false;         // 손가락을 덮은 채 어두운지 (어두우면 한 번 재기를 30초로 늘림)
    // 📷 뒤 / 🤳 앞 카메라 (2026-11-22 선생님 결정 "뒤 기본 + 앞 고르기", 빛은 방 밝기만: 앞 카메라에는 플래시가 없음). 이 폰에 기억
    const FACING_KEY = 'heart-rate:facing';
    let facing = 'environment';  // 고른 쪽
    try { if (localStorage.getItem(FACING_KEY) === 'user') facing = 'user'; } catch (e) { /* 저장 불가 */ }
    let camFacing = facing;      // 지금 켜진 카메라 (못 고르면 뒤)
    const isFront = () => camFacing === 'user';
    const camName = f => (f === 'user' ? '앞' : '뒤');
    // 계산 쪽(heart-rate-math.js, 고치지 않음)의 '플래시를 켜세요' 안내를 앞 카메라에 맞게
    function lightText(t, f) {
        if ((f || camFacing) !== 'user' || !t) return t;
        return String(t).replace(/(하거나|이나) 플래시를 켜세요/g, (m, a) => (a === '이나' ? '으로 가세요' : '하세요'))
            .replace(/ 하거나 플래시를 켜면/g, '하면').replace(/거나 플래시를 끄세요/g, '세요');
    }
    function renderFacing() {
        document.querySelectorAll('#facing button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.facing === facing)));
        if (isFront() || facing === 'user') { $('torch').checked = false; $('torch-warn').hidden = true; }
        $('torch-wrap').hidden = isFront() || !caps.torch;
    }

    function setCard(id, level) { const c = $(id).closest('.dash-card'); c.classList.remove('good', 'fair', 'bad'); if (level) c.classList.add(level); }
    function showLock(kind, text) {
        $('v-lock').textContent = kind; $('v-locktext').textContent = text || '';
        setCard('v-lock', kind.startsWith('🔒') ? 'good' : kind.startsWith('⚠') ? 'fair' : '');
    }

    async function startCamera() {
        if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { msg('이 브라우저에서는 카메라를 쓸 수 없어요. <b>https</b> 주소인지, 크롬·사파리 최신판인지 확인하세요. 아래 🧪 시뮬레이션으로 해 볼 수 있어요.', 'err'); return; }
        status('카메라를 켜는 중…');
        try {
            const want = facing;
            const video0 = f => ({ audio: false, video: { facingMode: f === 'user' ? { exact: 'user' } : { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } } });
            let note = '';
            try { stream = await navigator.mediaDevices.getUserMedia(video0(want)); }
            catch (e1) {
                if (want !== 'user' || (e1 && e1.name === 'NotAllowedError')) throw e1;
                // 앞 카메라를 못 고름(없음·이 브라우저가 고르기를 못 함) → 뒤로
                stream = await navigator.mediaDevices.getUserMedia(video0('environment'));
                note = '이 폰(브라우저)에서는 앞 카메라를 고를 수 없어 <b>뒤 카메라</b>로 켰어요.';
            }
            const tr0 = stream.getVideoTracks()[0];
            let got = '';
            try { got = (tr0.getSettings && tr0.getSettings().facingMode) || ''; } catch (e2) { got = ''; }
            camFacing = note ? 'environment' : (got === 'user' || got === 'environment' ? got : want);
            if (want === 'user' && camFacing !== 'user' && !note) note = '앞 카메라를 골랐지만 이 폰이 <b>뒤 카메라</b>를 켰어요.';
            if (note) { facing = camFacing; try { localStorage.setItem(FACING_KEY, facing); } catch (e3) { /* 무시 */ } renderFacing(); setTimeout(() => msg('📷 ' + note + ' 뒤 카메라로 재도 돼요.', 'warn'), 0); }
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
        renderFacing();
        phase = 'idle'; timeBase = '';
        $('cam').textContent = '📷 카메라 끄기';
        $('start').disabled = false;
        status(isFront() ? '☝ 검지로 화면 위쪽의 앞 카메라를 덮으세요 (방이 밝아야 해요)' : '☝ 검지로 뒤 카메라를 덮으세요');
        if (!$('msg').classList.contains('warn')) msg('');
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
        // 손가락을 대지 않은 동안의 장면 밝기·노출 (최근 값, 손가락을 덮으면 그대로 둠)
        if (!(r > 25 && r > 1.6 * g)) lastScene = { y: Math.round(f.y * 10) / 10, exposureTime: et, iso, at: tSec };
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
    let lastUi = 0, lastBpmT = 0, lastLiveT = 0, liveA = null;
    function tick() {
        const now = performance.now();
        if (now - lastUi < 120) return;
        lastUi = now;
        drawLive();
        const tl = live.length ? live[live.length - 1].t : 0;
        const q = H.quality(live.filter(f => f.t >= tl - 2));
        $('v-q').textContent = LEVEL[q.level]; $('v-qtext').textContent = lightText(q.text); setCard('v-q', q.level);
        // 손가락을 덮었는데 어두우면(빨강이 낮거나 카메라가 노출을 길게 잡음) 미리 알림
        const lastF = live[live.length - 1];
        const dimNow = q.covered && lastF && (q.R < 80 || (Number(lastF.exposureTime) >= 330 && (lastF.iso == null || lastF.iso >= 1600)));
        if (q.covered) lastDim = !!dimNow;
        // 최근 10초 실시간 추정 (그래프와 같은 프레임으로 계산, 봉우리 점·아래 글에 씀)
        if (now - lastLiveT > 1000 && live.length > 30 && live[live.length - 1].t - live[0].t >= 5 && q.covered) {
            lastLiveT = now;
            const src = rec && rec.frames.length > 30 ? rec.frames.filter(f => f.t >= rec.frames[rec.frames.length - 1].t - 10) : live;
            liveA = analyzeFrames(rec && rec.lock ? rec.lock : 'unlocked', src);
            $('live-est').textContent = liveA.ok ? `최근 ${Math.round(liveA.dur)}초: ${Math.round(liveA.bpm)} 회/분 · 봉우리 ${liveA.peaks ? liveA.peaks.length : 0}개 ${LEVEL[liveA.level] || ''} · 계산 신호 ${(CH_NAME[liveA.channel] || '?')} · ${liveA.corrected ? '보정 뒤' : '보정 전'}` : '최근 10초: 아직 계산 못 함';
        } else if (!q.covered) { liveA = null; $('live-est').textContent = ''; }
        if (phase === 'idle') status(q.level === 'good' ? (dimNow ? (isFront() ? '🌙 어두워요 — 앞 카메라는 방 밝기만 써요. 창가나 밝은 곳으로 가면 정확해요' : '🌙 어두워요 — 더 밝은 곳이나 플래시를 켜면 정확해요') : '🟢 준비됐어요 — ▶ 측정 시작') : '☝ ' + lightText(q.text));
        if (rec && (phase === 'settle' || phase === 'adjust' || phase === 'verify' || phase === 'rec')) {
            const el = (now - rec.wall) / 1000;
            $('time-st').hidden = false;
            if (phase === 'settle') { $('time-st').textContent = '노출 맞추는 중 ' + Math.max(0, 3 - el).toFixed(0) + '초'; status('⏳ 노출을 맞추는 중 — 가만히'); }
            else if (phase === 'adjust') { $('time-st').textContent = '노출 맞추는 중'; status('⏳ 잠근 뒤 밝기를 잠그기 전과 맞추는 중 — 가만히'); }
            else if (phase === 'verify') { $('time-st').textContent = '노출 잠금 확인 중'; status('🔍 노출이 정말 고정됐는지 확인 중'); }
            else {
                const left = Math.max(0, rec.dur - (now - rec.recWall) / 1000);
                if (!rec.breath) $('time-st').textContent = '⏱ 남은 시간 ' + Math.ceil(left) + '초';
                status('🔴 측정 중 — 움직이지 마세요');
            }
            if (phase === 'rec' && rec.frames.length > 10 && now - lastBpmT > 1000) {
                lastBpmT = now;
                const last = rec.frames[rec.frames.length - 1].t;
                if (last - rec.frames[0].t >= 6) {
                    // 큰 숫자 = 그래프의 파란 점과 같은 계산(최근 10초)
                    const a = liveA && liveA.ok ? liveA : analyzeFrames(rec.lock, rec.frames.filter(f => f.t >= last - 10), rec.scene);
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
        // 계산이 찾은 봉우리(최근 10초 분석)를 같은 그래프에 점으로 → 학생이 봉우리를 세어 확인
        const dots = [];
        if (liveA && liveA.ok && liveA.peaks) liveA.peaks.forEach(tp => {
            const x = liveA.t0 + tp - tEnd;
            if (x < -6 || x > 0) return;
            let best = null; out.forEach(p => { if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; });
            if (best) dots.push({ x, y: best.y });
        });
        plot($('wave'), [{ pts: out, color: '#c62828', width: 2 }, { pts: dots, color: '#1565c0', dots: 4, noLine: true }], { xmin: -6, xmax: 0, xlabel: '초 (지금 = 0)', yticks: false, empty: '손가락을 올리면 파형이 나와요' });
    }

    // ---------- 노출 고정 ----------
    // 노출 잠금 (선생님 실측: 갤럭시 Z 플립6 에서 잠그는 순간 화면이 갑자기 어두워짐)
    //  자동 노출 중 getSettings() 의 exposureTime·iso 가 실제로 쓰는 값이 아닐 수 있어(옛 값·기본값), 그 값으로 잠그면 어두워진다.
    //  ① 잠그기 전 밝기(Y, 손가락 덮은 상태)를 기억 ② (있으면) single-shot 으로 한 번 맞춘 뒤 manual 로 잠금
    //  ③ 0.3초마다 밝기를 보고 잠그기 전과 10% 넘게 다르면 셔터(최대 1/30초 = 333, 100 µs 단위)를, 모자라면 ISO 를 바꿔 2초 안에 맞춤
    //  ④ 못 맞추면(범위 끝·포화) 잠금을 풀고 자동 노출 + 노출 보정으로 ⑤ 맞추면 1.5초 동안 값이 안 바뀌는지 확인해야 '고정됨'
    //  과정은 log 에 남겨 회차·CSV 머리말에 (원인 분석용)
    const meanR = sec => { const tl = live.length ? live[live.length - 1].t : 0, fr = live.filter(f => f.t >= tl - sec); return fr.length ? H.mean(fr.map(f => f.r)) : NaN; };
    const meanY = sec => { const tl = live.length ? live[live.length - 1].t : 0, fr = live.filter(f => f.t >= tl - sec); return fr.length ? H.mean(fr.map(f => f.y)) : NaN; };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const setNow = () => { try { const g = track.getSettings(); return { mode: g.exposureMode, et: Number.isFinite(g.exposureTime) ? g.exposureTime : null, iso: Number.isFinite(g.iso) ? g.iso : null }; } catch (e) { return {}; } };
    async function lockAndVerify() {
        const log = { steps: [] }, t0 = performance.now();
        const note = (what, extra) => log.steps.push(Object.assign({ what, ms: Math.round(performance.now() - t0), y: Math.round(meanY(0.3) * 10) / 10, r: Math.round(meanR(0.3) * 10) / 10 }, setNow(), extra || {}));
        const canLock = track && Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual');
        note('잠그기 전');
        log.before = log.steps[0];
        if ($('nolock').checked) return { lock: 'unlocked', why: '노출 잠금 끔(선택)', log };
        if (!canLock) return { lock: 'unlocked', why: '이 폰은 노출 고정을 지원하지 않아요', log };
        // 목표 밝기: 빨강 평균을 잠그기 전 값으로, 단 60~180 안으로 (선생님 폰은 ISO 27 로 잠겨 빨강 2~10 으로 너무 어두웠음 → 더 밝게)
        const rBefore = meanR(0.6), rTarget = Math.min(180, Math.max(60, rBefore));
        log.target = Math.round(rTarget);
        const etCap = caps.exposureTime || {}, isoCap = caps.iso || {};
        const etMax = Math.min(etCap.max || Infinity, 10000 / 30);   // 30장/초 를 지키려면 1/30초(333) 보다 길면 안 됨
        // 어두운 곳: 자동 노출이 이미 셔터 한계(1/30초 근처)까지 열었으면 잠가도 더 밝게 못 함 → 잠그지 않고 자동 그대로
        //  (선생님 실측 r27: 잠그기 전 셔터 41.6 ms → 잠그고 밝기 맞추다 빨강이 2.7 까지 흔들리고 결국 되돌림, 시간만 씀.
        //   자동 노출은 측정 내내 33.3 ms·ISO 3200 으로 그대로라 '보정 없이 그대로' 계산 → 82 회/분)
        const b0 = log.before || {};
        //  셔터가 한계이고 손가락이 어둡고(빨강 < 120), ISO 를 더 올릴 여유가 없거나(한계 근처) 폰이 알려 준 ISO 를 믿기 어려울 때(100 미만, r27 은 27)만.
        //  ISO 를 더 올릴 수 있으면 지금처럼 잠그고 밝기 맞추기
        const isoHigh = Number.isFinite(b0.iso) && isoCap.max && b0.iso >= 0.9 * isoCap.max;
        const isoOdd = !Number.isFinite(b0.iso) || b0.iso < 100;
        const atLimit = Number.isFinite(b0.et) && b0.et >= 0.95 * etMax && rBefore < 120 && (isoHigh || isoOdd);
        if (atLimit) { log.skipped = true; return { lock: 'unlocked', why: '어두워서 자동 노출이 이미 한계라 잠그지 않음(값이 그대로인지만 봄)', log, dark: true }; }
        const clampEt = v => Math.min(etMax, Math.max(etCap.min || 0, v));
        const clampIso = v => Math.min(isoCap.max || Infinity, Math.max(isoCap.min || 0, v));
        try {
            if (caps.exposureMode.includes('single-shot')) { await track.applyConstraints({ advanced: [{ exposureMode: 'single-shot' }] }); await wait(800); note('single-shot'); }
        } catch (e) { note('single-shot 거절'); }
        if (!rec) return { lock: 'unlocked', why: '', log };
        const s = setNow();
        let et = Number.isFinite(s.et) ? clampEt(s.et) : null, iso = Number.isFinite(s.iso) && caps.iso ? clampIso(s.iso) : null;
        // ISO 하한 100 (폰이 알려 준 값이 27 처럼 아주 낮으면 그대로 쓰지 않음, 너무 밝으면 아래에서 다시 줄임)
        if (iso != null) iso = clampIso(Math.max(iso, Math.min(100, isoCap.max || 100)));
        const adv = { exposureMode: 'manual' };
        if (et != null && caps.exposureTime) adv.exposureTime = et;
        if (iso != null) adv.iso = iso;
        if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('manual')) adv.whiteBalanceMode = 'manual';
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('manual')) adv.focusMode = 'manual';
        try { await track.applyConstraints({ advanced: [adv] }); } catch (e) { return { lock: 'unlocked', why: '잠그기 요청이 거절됨', log }; }
        phase = 'adjust';
        await wait(300); note('잠근 직후'); log.afterLock = log.steps[log.steps.length - 1];
        // 밝기 맞추기 (닫힌 고리)
        let matched = false;
        for (let i = 0; i < 7 && rec; i++) {
            const rNow = meanR(0.25);
            if (!(rNow > 0) || !(rTarget > 0)) break;
            const k = H.toLinear(rTarget) / Math.max(1e-6, H.toLinear(rNow));   // 빛의 세기로 몇 배 모자라나 (빨강 기준)
            if (Math.abs(k - 1) <= 0.1) { matched = true; break; }
            if (!caps.exposureTime || et == null) break;
            let want = et * k, nextEt = clampEt(want), nextIso = iso;
            if (want > nextEt * 1.02 && iso != null) nextIso = clampIso(iso * want / nextEt);      // 셔터가 끝까지 가면 ISO 로
            if (k < 1 && iso != null && iso > (isoCap.min || 0) && nextEt <= (etCap.min || 0)) nextIso = clampIso(iso * k);
            if (Math.abs(nextEt - et) < 1e-6 && nextIso === iso) break;   // 더 바꿀 수 없음
            et = nextEt; iso = nextIso;
            const a2 = { exposureMode: 'manual', exposureTime: et };
            if (iso != null) a2.iso = iso;
            try { await track.applyConstraints({ advanced: [a2] }); } catch (e) { break; }
            await wait(300);
            // 바꾼 직후 한두 프레임은 아직 예전 설정일 수 있음 → 크게 어두워졌으면 조금 더 기다려 다시 봄, 그래도 어두우면 바로 멈춤
            if (H.toLinear(meanR(0.2)) < 0.5 * H.toLinear(rNow)) {
                await wait(400);
                if (rec && H.toLinear(meanR(0.2)) < 0.5 * H.toLinear(rNow)) { note('밝기 맞추기', { k: Math.round(k * 100) / 100 }); log.dropped = true; break; }
            }
            note('밝기 맞추기', { k: Math.round(k * 100) / 100 });
        }
        if (!matched && rec) {
            const rNow = meanR(0.25);
            matched = rNow > 0 && Math.abs(H.toLinear(rTarget) / H.toLinear(rNow) - 1) <= 0.1;
            // 목표(60)까지 못 올려도 잠그기 전보다 어둡지 않으면 받아 줌 (원래 어두운 곳)
            if (!matched && rNow > 0 && rBefore < 60 && H.toLinear(rNow) >= 0.9 * H.toLinear(rBefore)) { matched = true; log.short = '목표 밝기(빨강 60)까지는 못 올림'; }
        }
        log.adjusted = log.steps[log.steps.length - 1];
        if (!rec) return { lock: 'unlocked', why: '', log };
        if (!matched) {
            await setAuto(); note('자동 노출로 되돌림');
            return { lock: 'unlocked', why: log.dropped ? '잠그고 밝기를 맞추는 중 크게 어두워져 바로 멈추고 자동 노출로 측정' : '잠그면 잠그기 전 밝기로 맞출 수 없어(셔터·ISO 범위 끝) 자동 노출로 측정', log };
        }
        phase = 'verify';
        const seen = [];
        for (let i = 0; i < 15; i++) {
            await wait(100);
            if (!rec) return { lock: 'unlocked', why: '', log };
            seen.push(setNow());
        }
        if (!seen.length || seen.some(x => x.mode !== 'manual')) return { lock: 'unlocked', why: '잠갔는데 자동 노출로 돌아감', log };
        const ets = seen.map(x => x.et).filter(Number.isFinite), isos = seen.map(x => x.iso).filter(Number.isFinite);
        if (!ets.length) return { lock: 'unlocked', why: '노출 값을 읽을 수 없어 고정됐는지 확인 못 함', log };
        const changed = a => a.length && (Math.max(...a) - Math.min(...a)) / Math.max(1e-9, Math.abs(H.mean(a))) > 0.01;
        if (changed(ets) || changed(isos)) return { lock: 'unlocked', why: '잠갔는데 노출 값이 계속 바뀜', log };
        return { lock: 'locked', why: '', log };
    }
    async function setAuto() {
        if (!track) return;
        const adv = {};
        if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) adv.exposureMode = 'continuous';
        if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) adv.whiteBalanceMode = 'continuous';
        if (caps.torch && !isFront()) adv.torch = !!$('torch').checked;
        if (Object.keys(adv).length) { try { await track.applyConstraints({ advanced: [adv] }); } catch (e) { /* 무시 */ } }
    }
    async function torchOff() { if (track && caps.torch) { try { await track.applyConstraints({ advanced: [{ torch: false }] }); } catch (e) { /* 무시 */ } } }

    // ---------- 측정 ----------
    let settleTimer = null, endTimer = null;
    // opts (숨 참기 탐구, js/heart-rate-breath-ui.js): { breath: true, onRec(rec) 기록 시작 때, onFinish(rec, cancel) 끝날 때 } — 숨 참기는 길이를 그쪽이 정하고 끝냄
    async function start(opts) {
        if (phase !== 'idle') return false;
        opts = opts && opts.breath ? opts : {};
        rec = { frames: [], wall: performance.now(), dur: Number($('dur').value) || 30, torch: !isFront() && !!$('torch').checked, facing: camFacing, lock: '', scene: lastScene, breath: !!opts.breath, onRec: opts.onRec, onFinish: opts.onFinish };
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
            rec.lock = v.lock; rec.why = v.why; rec.lockLog = v.log;
            // 🌙 어두우면 짧은 측정은 맥파가 잡음에 묻히기 쉬움 → 한 번 재기는 30초로 (선생님 실측 r27: 15초·빨강 79·ISO 3200)
            if (!rec.breath && rec.dur < 30 && (v.dark || lastDim)) { rec.dur = 30; rec.longer = true; msg('🌙 어두워서 <b>30초</b> 재요 — 짧으면 맥파가 잡음에 묻히기 쉬워요. 가만히 있어 주세요.', 'warn'); }
            const hasExp = live.some(f => Number(f.e) > 0);
            if (v.lock === 'locked') showLock('🔒 고정됨', '밝기 그대로 계산');
            else if (hasExp) showLock('⚠ 고정 안 됨', (v.why ? v.why + ' → ' : '') + '노출 보정으로 계산');
            else showLock('⚠ 고정 안 됨', (v.why ? v.why + ' · ' : '') + '노출 값을 못 읽어 보정 불가 (출렁임 가능성)');
            phase = 'rec'; rec.frames = []; rec.recWall = performance.now();
            if (rec.breath) { if (typeof rec.onRec === 'function') rec.onRec(rec); }
            else endTimer = setTimeout(() => finish(false), rec.dur * 1000 + 150);
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
        if (r.breath) { if (typeof r.onFinish === 'function') r.onFinish(r, !!cancel); return; }
        const dur = r.frames.length > 1 ? r.frames[r.frames.length - 1].t - r.frames[0].t : 0;
        if (cancel && dur < 8) { msg('8초보다 짧아 저장하지 않았어요.'); return; }
        const run = addRun({ lock: r.lock || 'unlocked', why: r.why, torch: r.torch, facing: r.facing, frames: r.frames, scene: r.scene, lockLog: r.lockLog });
        devSend(run);   // 선생님 기기에서만 (개발 데이터 자동 수집, js/dev-collect.js)
    }

    // 개발 데이터: 카메라로 잰 회차만 (시뮬레이션·CSV 불러오기는 빼고). 손목 맥박을 넣으면 같은 id 로 다시 보냄
    function devSend(run) {
        if (!run || run.sim || String(run.lock).startsWith('csv') || typeof DevCollect === 'undefined' || !DevCollect.active()) return;
        const res = run.res || {};
        DevCollect.send('heartrate', {
            id: 'hr-' + DevCollect.device().slice(-6) + '-' + Math.floor((Date.parse(run.at) || Date.now()) / 1000).toString(36) + '-' + run.id,
            measuredAt: run.at,
            summary: { '심박수': res.bpm == null ? '' : Math.round(res.bpm * 10) / 10, '신뢰도': res.conf == null ? '' : Math.round(res.conf * 100) / 100, '노출': res.mode || '',
                '손목': H.palpBpm(run.palp) || '', 'FFT': res.bpmFFT == null ? '' : Math.round(res.bpmFFT), '자기상관': res.bpmAC == null ? '' : Math.round(res.bpmAC), '봉우리': res.bpmPeaks == null ? '' : Math.round(res.bpmPeaks) },
            // 판단 근거 모두: 보정 전·후 결과(alt: 각 FFT·자기상관·봉우리·신뢰도), 두 배 검사, 노출 출렁임 빠르기, 덮임·밝기 판정, 잠금 과정, 손가락 대기 전 장면
            data: { csv: csvFor(run), result: res, lock: run.lock, why: run.why, lockLog: run.lockLog || null, scene: run.scene || null, torch: run.torch, facing: run.facing || 'environment', palp: run.palp, palpBpm: H.palpBpm(run.palp) || null,
                device: DevCollect.uaSummary(navigator.userAgent), screen: [screen.width, screen.height, devicePixelRatio] }
        });
    }
    function newId() { let k = 1; const ids = new Set(state.runs.map(r => r.id)); while (ids.has('r' + k)) k++; return 'r' + k; }
    const hooks = {};   // 숨 참기·폰 연결(js/heart-rate-breath-ui.js)이 채움: onRunSaved(run), onRunDeleted(id)
    function addRun(o) {
        const raw = H.pack(o.frames);
        const scene = o.scene ? { y: o.scene.y, exposureTime: o.scene.exposureTime, iso: o.scene.iso } : null;
        const a = analyzeFrames(o.lock, H.unpack(raw), scene);
        const run = { id: newId(), at: o.at || new Date().toISOString(), lock: o.lock, why: o.why || '', torch: !!o.torch, facing: o.facing === 'user' ? 'user' : (o.facing === 'environment' ? 'environment' : ''), sim: !!o.sim, palp: null, scene, lockLog: o.lockLog || null, raw, res: summarize(a), from: o.from || '', srcKey: o.srcKey || '' };
        state.runs.push(run);
        while (state.runs.length > MAX_RUNS) state.runs.shift();
        state.pick = run.id;
        save();
        renderRuns(); renderDetail();
        const res = run.res;
        if (res.bpm != null) {
            $('v-bpm').textContent = Math.round(res.bpm);
            $('v-ibi').textContent = res.ibi && res.ibi.length ? Math.round(H.mean(res.ibi)) : Math.round(60000 / res.bpm);
            showLock(res.modeText.split(' ')[0] + ' ' + (res.mode === 'locked' ? '고정됨' : '고정 안 됨'), res.modeText.replace(/^\S+\s*/, '') + (run.why ? ' (' + run.why + ')' : ''));
            msg(`✅ 저장했어요: <b>${Math.round(res.bpm)} 회/분</b> ${LEVEL[res.level] || ''} (신뢰도 ${Math.round(res.conf * 100)}%) · ${esc(res.modeText)}` +
                (res.exposure && res.exposure.warn ? `<br>${esc(res.exposure.text)}` : '') + (res.light && res.light.level !== 'ok' ? `<br>${esc(lightText(res.light.text, run.facing || 'environment'))}` : '') +
                (res.doubled ? '<br>🔁 처음 찾은 값의 두 배가 더 그럴듯해 바꿨어요 (어두우면 절반으로 잡히기 쉬워요).' : '') +
                `<br>${esc(signalNote(res))}` + (res.level === 'bad' ? '<br>신뢰도가 낮아요. 손가락을 다시 덮고 가만히 재 보세요.' : ''), res.level === 'bad' || (res.exposure && res.exposure.warn) || (res.light && res.light.level !== 'ok') ? 'warn' : '');
        } else msg('저장했지만 심박수를 찾지 못했어요: ' + esc((res.reasons || []).join(', ')) + '. 손가락을 다시 덮고 재 보세요.', 'warn');
        if (typeof hooks.onRunSaved === 'function' && !o.fromPhone) { try { hooks.onRunSaved(run); } catch (e) { /* 무시 */ } }
        return run;
    }
    function summarize(a) {
        return {
            ok: a.ok, bpm: a.bpm, level: a.level, conf: a.conf, method: a.method, channel: a.channel, bpmFFT: a.bpmFFT, bpmAC: a.bpmAC, bpmPeaks: a.bpmPeaks,
            ibi: a.ibi, cv: a.cv, dur: a.dur, fpsMean: a.fpsMean, reasons: a.reasons, mode: a.mode.mode, modeText: a.mode.text, doubled: !!a.doubled, acdc: a.acdc, alt: a.alt || null, cutAt: a.cutAt == null ? null : a.cutAt,
            doubleCheck: a.doubleCheck || null, expLag: a.expLag == null ? null : a.expLag, expBeta: a.expBeta == null ? null : a.expBeta,
            quality: a.quality ? { covered: a.quality.covered, R: a.quality.R, G: a.quality.G, B: a.quality.B, rg: a.quality.rg, level: a.quality.level } : null,
            light: a.light ? { level: a.light.level, text: a.light.text, R: a.light.R, acdc: a.light.acdc, exposureTime: a.light.exposureTime, iso: a.light.iso } : null,
            exposure: a.exposure ? { warn: a.exposure.warn, wobble: !!a.exposure.wobble, available: a.exposure.available, text: a.exposure.text, bpm: a.exposure.bpm, varPct: a.exposure.varPct } : null
        };
    }

    // 계산에 쓴 신호 이름 (실시간 그래프는 늘 '빨강 · 보정 전')
    const CH_NAME = { r: '빨강(R)', g: '초록(G)', y: '밝기(Y)' };
    function signalName(res) { return (CH_NAME[res.channel] || res.channel || '?') + ' · ' + (res.mode === 'corrected' ? '노출 보정 뒤' : '보정 전'); }
    function signalNote(res) {
        if (!res || !res.channel) return '';
        const same = res.channel === 'r' && res.mode !== 'corrected';
        return same ? `계산에 쓴 신호: ${signalName(res)} (실시간 그래프와 같음)` : `계산에 쓴 신호: ${signalName(res)} — 실시간 그래프(빨강 · 보정 전)와 달라요`;
    }

    // ---------- 회차 목록 ----------
    const runTime = at => { const d = new Date(at); return isNaN(d) ? '' : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
    const MODE_SHORT = { locked: '🔒 노출 고정', corrected: '⚠ 노출 보정', raw: '⚠ 보정 전 밝기', nocorrect: '⚠ 보정 불가' };
    function runName(r, i) { return (i + 1) + '회' + (r.sim ? ' 🧪' : r.from ? ' · ' + r.from : r.lock.startsWith('csv') ? ' 📂' : ''); }
    function renderRuns() {
        const ul = $('runs');
        $('runs-empty').hidden = !!state.runs.length;
        $('csv-all').disabled = !state.runs.length;
        $('runs-sum').textContent = state.runs.length ? '— ' + state.runs.length + '개' : '';
        ul.innerHTML = state.runs.map((r, i) => {
            const res = r.res || {}, palp = H.palpBpm(r.palp), err = palp && res.bpm != null ? H.errorPct(res.bpm, palp) : null;
            return `<li data-id="${esc(r.id)}"><span class="ttl">${runName(r, i)} <small>${runTime(r.at)} · ${res.dur ? Math.round(res.dur) + '초' : ''} · ${MODE_SHORT[res.mode] || ''}${res.light && res.light.level !== 'ok' ? ' · 🌙 어두움' : ''}${res.doubled ? ' · 🔁 두 배' : ''}${r.torch ? ' · 플래시' : ''}${r.facing === 'user' ? ' · 🤳 앞 카메라' : ''}</small></span>` +
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
        save(); renderRuns(); renderDetail(); devSend(r);
    });
    $('runs').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.del) { if (!confirm('이 회차를 지울까요?')) return; deleteRun(b.dataset.del); }
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
        return H.toCsv(H.unpack(r.raw), { '실험': '스마트폰 카메라 심박수', '회차': runName(r, i), '시각': r.at, '노출': r.res && r.res.modeText, '심박수': r.res && r.res.bpm, '손목 15초': r.palp, '카메라': r.facing ? camName(r.facing) + ' (' + r.facing + ')' : '', facing: r.facing || '',
            locked: r.lock === 'locked' || r.lock === 'csv-locked', light: r.res && r.res.light ? r.res.light.level : '',
            '밝기 판정': r.res && r.res.light ? r.res.light.text : '', 'AC/DC': r.res && r.res.acdc,
            '보정 전·후 결과': r.res && r.res.alt ? `보정 전 ${r.res.alt.raw.bpm}회/분(${Math.round((r.res.alt.raw.conf || 0) * 100)}%) · 보정 후 ${r.res.alt.corrected.bpm}회/분(${Math.round((r.res.alt.corrected.conf || 0) * 100)}%) · 고른 쪽 ${r.res.alt.chosen === 'raw' ? '보정 전' : '보정 후'}` : '',
            '덮임 판정': r.res && r.res.quality ? `${r.res.quality.covered ? '덮임' : '안 덮임'} · R ${r.res.quality.R} · G ${r.res.quality.G} · B ${r.res.quality.B} · R/G ${r.res.quality.rg}` : '',
            '노출 잠금 과정': r.lockLog ? r.lockLog.steps.map(x => `${x.what}: 밝기 ${x.y} · 셔터 ${x.et == null ? '?' : x.et} · ISO ${x.iso == null ? '?' : x.iso}${x.k ? ' · ×' + x.k : ''}`).join(' → ') : '',
            '잠금 실패 까닭': r.why || '',
            '손가락 대기 전 장면': r.scene ? `밝기 ${r.scene.y} · 노출 ${r.scene.exposureTime == null ? '?' : r.scene.exposureTime} · ISO ${r.scene.iso == null ? '?' : r.scene.iso}` : '' });
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
        const frames = H.unpack(r.raw), a = analyzeFrames(r.lock, frames, r.scene);
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
            (a.alt ? `<div>보정 전 / 보정 후<b>${a.alt.raw.bpm == null ? '-' : a.alt.raw.bpm} / ${a.alt.corrected.bpm == null ? '-' : a.alt.corrected.bpm}</b></div>` : '') +
            (a.quality ? `<div>덮임 (빨강/초록)<b>${a.quality.covered ? '덮임' : '확인'} · ${a.quality.rg}</b></div>` : '') +
            `<div>계산에 쓴 신호<b>${esc(signalName({ channel: a.channel, mode: a.corrected ? 'corrected' : 'raw' }))}</b></div>` +
            `<div>밝기 판정<b>${a.light ? (a.light.level === 'ok' ? '☀ 좋음' : a.light.level === 'dim' ? '🌙 어두움' : '🌙 아주 어두움') : '-'}</b></div>` +
            `<div>맥파 크기 AC/DC<b>${a.acdc != null ? (a.acdc * 100).toFixed(2) + '%' : '-'}</b></div>` +
            (a.corrected ? `<div>노출 값 어긋남<b>${a.expLag > 0 ? '+' : ''}${a.expLag} 초</b></div>` : '') +
            `<div>사진 수<b>${a.fpsMean != null ? a.fpsMean + '장/초 · ' + a.dur + '초' : '-'}</b></div>`;
        const why = [`<p class="note">노출: ${esc(a.mode.text)}${r.why ? ' (' + esc(r.why) + ')' : ''}</p>`];
        why.push(`<p class="note">${esc(signalNote({ channel: a.channel, mode: a.corrected ? 'corrected' : 'raw' }))}</p>`);
        if (a.alt) why.push(`<p class="note">보정 전 ${a.alt.raw.bpm == null ? '-' : a.alt.raw.bpm}회/분(신뢰도 ${Math.round((a.alt.raw.conf || 0) * 100)}%) · 보정 후 ${a.alt.corrected.bpm == null ? '-' : a.alt.corrected.bpm}회/분(${Math.round((a.alt.corrected.conf || 0) * 100)}%) → <b>${a.alt.chosen === 'raw' ? '보정 전' : '보정 후'}</b>을 씀</p>`);
        if (r.lockLog && r.lockLog.steps) why.push(`<p class="note">노출 잠금 과정: ${esc(r.lockLog.steps.map(x => `${x.what} (밝기 ${x.y}, 셔터 ${x.et == null ? '?' : x.et}, ISO ${x.iso == null ? '?' : x.iso})`).join(' → '))}</p>`);
        if (a.quality) why.push(`<p class="note">덮임 판정 근거: 빨강 ${a.quality.R} · 초록 ${a.quality.G} · 파랑 ${a.quality.B == null ? '-' : a.quality.B} · 빨강/초록 ${a.quality.rg}</p>`);
        if (a.light && a.light.level !== 'ok') why.push(`<div class="note warn">${esc(lightText(a.light.text, r.facing || 'environment'))}</div>`);
        if (a.doubled) why.push(`<p class="note">🔁 두 배 후보 검사: 처음 찾은 ${Math.round(a.doubleCheck.from)}회/분의 두 배 쪽에 따로 고른 박동이 있고, 절반 쪽 파형이 맥박 모양(뾰족함)이 아니라 두 배로 바꿨어요.</p>`);
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
    // 📷 뒤 / 🤳 앞 고르기: 측정 중이 아니면 바로 바꿔 켬
    document.querySelectorAll('#facing button').forEach(b => b.addEventListener('click', async () => {
        const f = b.dataset.facing === 'user' ? 'user' : 'environment';
        if (rec) { msg('측정 중에는 카메라를 바꿀 수 없어요. 끝난 뒤 바꾸세요.', 'warn'); return; }
        facing = f;
        try { localStorage.setItem(FACING_KEY, f); } catch (e) { /* 이 페이지에서만 */ }
        renderFacing();
        if (stream) { stopCamera(); await startCamera(); }
        else status(f === 'user' ? '🤳 앞 카메라를 골랐어요 — 📷 카메라 켜기' : '📷 뒤 카메라를 골랐어요 — 📷 카메라 켜기');
    }));
    renderFacing();
    $('start').addEventListener('click', () => start());
    $('stop').addEventListener('click', () => finish(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden && rec) { finish(true); msg('화면을 벗어나 측정을 멈췄어요.', 'warn'); } });
    window.addEventListener('resize', () => { drawLive(); renderDetail(); });

    renderRuns(); renderDetail();
    plot($('wave'), [], { empty: '카메라를 켜고 손가락을 올리면 맥파가 나와요' });
    // 시험용
    window.__heartRate = { state: () => state, addRun, phase: () => phase };
    // 숨 참기 탐구(js/heart-rate-breath-ui.js)가 같은 카메라·노출 잠금·기록을 쓰도록
    function deleteRun(id) { state.runs = state.runs.filter(r => r.id !== id); save(); renderRuns(); renderDetail(); if (typeof hooks.onRunDeleted === 'function') hooks.onRunDeleted(id); }
    window.__hrCore = { facing: () => camFacing, chosenFacing: () => facing, hooks, runs: () => state.runs, deleteRun, addRun, isPhone: PHONE, start, finish, phase: () => phase, rec: () => rec, live: () => live, plot, msg, download, esc, LEVEL, hasCamera: () => !!stream, lastScene: () => lastScene };
})();
