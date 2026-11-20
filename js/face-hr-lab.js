// 얼굴 심박(rPPG) 개발 페이지 — 화면 (projects/face-hr-lab.html, 선생님 전용)
//  ① 준비·정답 경로 ② 측정 ③ 분석·비교 ④ 내보내기·불러오기 ⑤ 도움말 (작은 탭 LabUI.initTabs)
//  얼굴: 폰 앞 카메라 → MediaPipe 얼굴 랜드마크(jsdelivr, 버전 고정)로 이마·양 볼 → 피부색 화소만 평균 (못 쓰면 안내 타원)
//  정답: ① 같은 폰 뒤 카메라 동시 ② 두 번째 폰(js/class-share.js 📱 폰 연결, exp heartrate) ③ 블루투스 심박계(0x180D/0x2A37) ④ 손목 15초×4
//  계산은 js/face-hr-math.js. 영상은 저장·전송하지 않는다 — 프레임마다 영역별 색 평균·움직임·밝기·노출만
(function () {
    'use strict';
    const F = window.FaceHrMath, H = window.HeartRateMath;
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const PHONE = !!(window.ClassShare && ClassShare.readPhoneParams && ClassShare.readPhoneParams(location.search));
    const KEY = 'face-hr-lab:v1', SKEY = 'face-hr-lab:session', PKEY = 'face-hr-lab:phone';
    const MP_VER = '0.10.14';
    const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER;
    // 모델은 사이트에 직접 둔 파일(vendor/mediapipe, Apache-2.0) — 외부 주소를 늘리지 않고 학교 망에서도 되게 (2026-11-17 선생님 결정)
    const MP_MODEL = new URL('../vendor/mediapipe/face_landmarker.task', location.href).href;
    // 얼굴 랜드마크 번호 (MediaPipe 얼굴 478점): 이마(눈썹 위), 화면 왼쪽 볼(사람의 오른볼)·오른쪽 볼 — 눈·입·눈썹은 들어가지 않음
    const LM = {
        fh: [67, 109, 10, 338, 297, 334, 296, 336, 9, 107, 66, 105],
        lc: [117, 118, 101, 36, 205, 187, 123, 116],
        rc: [346, 347, 330, 266, 425, 411, 352, 345]
    };
    const WIDTH_LM = [234, 454];
    const MOVE_LM = [1, 4, 10, 33, 61, 152, 199, 234, 263, 291, 454, 9, 117, 346];
    const COL = { gt: '#212529', green: '#2f9e44', chrom: '#e8590c', pos: '#1565c0' };

    // ---------- 저장 ----------
    const pref = { path: '', roi: 'all', lagFit: true, expNorm: false, oval: false, log: [] };
    try { Object.assign(pref, JSON.parse(localStorage.getItem(KEY) || '{}') || {}); } catch (e) { /* 무시 */ }
    if (!Array.isArray(pref.log)) pref.log = [];
    const savePref = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) { /* 저장 불가 */ } };
    let session = null;
    try { session = F.parseJson(localStorage.getItem(SKEY) || ''); if (session.error) session = null; } catch (e) { session = null; }
    function saveSession() {
        try { localStorage.setItem(SKEY, JSON.stringify(session)); }
        catch (e) { ioMsg('⚠ 이 브라우저에 저장하지 못했어요(크기·사생활 보호 모드). 💾 JSON 내보내기로 받아 두세요.', 'warn'); }
    }

    function msg(el, html, kind) { el = typeof el === 'string' ? $(el) : el; if (!el) return; el.innerHTML = html || ''; el.className = 'note' + (kind ? ' ' + kind : ''); }
    const ioMsg = (h, k) => msg('io-msg', h, k);
    const nowS = () => performance.now() / 1000;
    const fmt = (x, d) => Number.isFinite(x) ? x.toFixed(d == null ? 1 : d) : '—';
    const clockText = d => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // ---------- 작은 선 그래프 ----------
    function plot(cv, series, o) {
        o = o || {};
        const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, Hh = cv.clientHeight || 150;
        cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, Hh);
        const all = series.flatMap(s => s.pts).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
        const L = o.ylabel ? 44 : 6, R = 8, T = 8, B = o.xlabel ? 30 : 6;
        if (!all.length) { c.fillStyle = '#5f6b7a'; c.font = '13px sans-serif'; c.fillText(o.empty || '자료 없음', L + 6, Hh / 2); return; }
        let x0 = o.xmin != null ? o.xmin : Math.min(...all.map(p => p.x)), x1 = o.xmax != null ? o.xmax : Math.max(...all.map(p => p.x));
        let y0 = o.ymin != null ? o.ymin : Math.min(...all.map(p => p.y)), y1 = o.ymax != null ? o.ymax : Math.max(...all.map(p => p.y));
        if (x1 <= x0) x1 = x0 + 1;
        if (y1 <= y0) { y1 += 1; y0 -= 1; }
        if (o.pad !== false) { const pd = (y1 - y0) * 0.08; y0 -= pd; y1 += pd; }
        const X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => T + (1 - (y - y0) / (y1 - y0)) * (Hh - T - B);
        (o.bands || []).forEach(b => { c.fillStyle = 'rgba(255,193,7,.25)'; c.fillRect(X(b.x0), T, Math.max(1, X(b.x1) - X(b.x0)), Hh - T - B); });
        c.strokeStyle = '#e3e7ec'; c.fillStyle = '#5f6b7a'; c.font = '11px sans-serif'; c.lineWidth = 1;
        const ticks = (a, b, n) => { const st = Math.pow(10, Math.floor(Math.log10((b - a) / n))), m = [1, 2, 5, 10].find(k => (b - a) / (st * k) <= n) * st; const out = []; for (let v = Math.ceil(a / m) * m; v <= b + 1e-9; v += m) out.push(+v.toFixed(6)); return out; };
        if (o.ylabel) ticks(y0, y1, 5).forEach(v => { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(W - R, Y(v)); c.stroke(); c.textAlign = 'right'; c.fillText(String(v), L - 4, Y(v) + 4); c.textAlign = 'left'; });
        if (o.xlabel) { ticks(x0, x1, 6).forEach(v => { c.beginPath(); c.moveTo(X(v), T); c.lineTo(X(v), Hh - B); c.stroke(); c.fillText(String(v), X(v) - 6, Hh - B + 13); }); c.fillText(o.xlabel, W - R - c.measureText(o.xlabel).width, Hh - 3); }
        if (o.ylabel) { c.save(); c.translate(11, (Hh - B + T) / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillText(o.ylabel, 0, 0); c.restore(); }
        series.forEach(s => {
            const ps = s.pts.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
            c.strokeStyle = c.fillStyle = s.color; c.lineWidth = s.width || 2;
            if (!s.noLine) { c.beginPath(); ps.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y)))); c.stroke(); }
            if (s.dots) ps.forEach(p => { c.beginPath(); c.arc(X(p.x), Y(p.y), s.dots, 0, 2 * Math.PI); c.fill(); });
        });
    }

    // ---------- 카메라 공통 ----------
    function camError(e) {
        const n = e && e.name ? e.name : 'Error';
        return n + (e && e.message ? ': ' + e.message : '');
    }
    function camHint(e) {
        const n = e && e.name;
        if (n === 'NotAllowedError') return '권한이 거절됨 — 주소창의 🔒 에서 카메라를 허용하세요';
        if (n === 'NotReadableError' || n === 'AbortError') return '카메라를 다른 곳(다른 카메라·앱)이 쓰고 있어 열 수 없음';
        if (n === 'OverconstrainedError') return '그런 카메라가 없음';
        if (n === 'NotFoundError') return '카메라를 찾지 못함';
        return '';
    }
    // 비디오 프레임마다 fn(tSec) — requestVideoFrameCallback 의 now/captureTime 은 performance.now 와 같은 시계
    function frameLoop(video, alive, fn) {
        if (video.requestVideoFrameCallback) {
            const cb = (now, meta) => {
                if (!alive()) return;
                const t = meta && Number.isFinite(meta.captureTime) && meta.captureTime > 0 ? meta.captureTime : now;
                try { fn(t / 1000); } catch (e) { console.error(e); }
                video.requestVideoFrameCallback(cb);
            };
            video.requestVideoFrameCallback(cb);
        } else {
            let last = -1;
            const step = () => { if (!alive()) return; if (video.currentTime !== last) { last = video.currentTime; try { fn(nowS()); } catch (e) { console.error(e); } } requestAnimationFrame(step); };
            requestAnimationFrame(step);
        }
    }
    // 손가락: 가운데 60% 의 빨강·초록·파랑 평균
    function fingerSampler(video) {
        const cv = document.createElement('canvas'); cv.width = 40; cv.height = 30;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        return t => {
            const vw = video.videoWidth, vh = video.videoHeight;
            if (!vw || !vh) return null;
            cx.drawImage(video, vw * 0.2, vh * 0.2, vw * 0.6, vh * 0.6, 0, 0, 40, 30);
            const d = cx.getImageData(0, 0, 40, 30).data;
            let r = 0, g = 0, b = 0, sat = 0; const n = d.length / 4;
            for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; if (d[i] >= 250) sat++; }
            r /= n; g /= n; b /= n;
            return { t, r: +r.toFixed(3), g: +g.toFixed(3), b: +b.toFixed(3), y: 0.299 * r + 0.587 * g + 0.114 * b, s: sat / n };
        };
    }
    function liveFingerBpm(buf) {
        if (buf.length < 30 || buf[buf.length - 1].t - buf[0].t < 10.5) return NaN;
        const tEnd = buf[buf.length - 1].t, w = F.fingerTruth(buf.filter(f => f.t >= tEnd - 10.5));
        return w.length ? w[w.length - 1].bpm : NaN;
    }
    function drawFingerWave(cv, buf) {
        if (!buf.length) return;
        const tEnd = buf[buf.length - 1].t, pts = buf.filter(f => f.t >= tEnd - 6);
        const ys = pts.map(f => -Math.log(Math.max(0.5, f.r)));
        const out = pts.map((f, i) => { let s = 0, k = 0; for (let j = 0; j < pts.length; j++) if (Math.abs(pts[j].t - f.t) <= 0.5) { s += ys[j]; k++; } return { x: f.t - tEnd, y: ys[i] - s / k }; });
        plot(cv, [{ pts: out, color: '#c62828' }], { xmin: -6, xmax: 0, empty: '손가락을 올리면 파형이 나와요' });
    }

    // ---------- 시계 맞추기 (서버 왕복) ----------
    // 이 기기 id 로 n=0 줄 하나를 쓰고(같은 id 라 늘 한 줄), 서버가 적은 시각과 비교 — n=0 줄은 목록·진행 보기에서 빠짐
    async function probeClock(share) {
        if (!share || !window.PendulumCloud) return { ok: false, error: '조 공유가 준비되지 않았어요' };
        const srv = share.server(), st = share.state();
        if (!srv || !srv.url) return { ok: false, error: '사이트 저장소 주소가 없어요' };
        if (!PendulumCloud.isGroupCode(st.group)) return { ok: false, error: '조 코드를 먼저 정하세요' };
        const id = st.device + '-clock', sendMs = Date.now();
        const r = await PendulumCloud.save(srv.url, { action: 'save', exp: 'heartrate', id, group: st.group, device: st.device, title: '시계 맞추기', n: 0, summary: {}, data: '', sentAt: new Date(sendMs).toISOString() });
        const recvMs = Date.now();
        if (!r || !r.ok) return { ok: false, error: (r && r.error) || '보내기 실패' };
        const l = await PendulumCloud.list(srv.url + (srv.url.indexOf('?') >= 0 ? '&' : '?') + 'exp=heartrate', st.group);
        const row = l && l.ok && (l.items || []).find(x => String(x.id) === id);
        if (!row || !row.timestamp) return { ok: false, error: '서버 시각을 읽지 못했어요' };
        const o = F.clockOffset({ sendMs, recvMs, serverIso: row.timestamp });
        return o ? Object.assign({ ok: true, at: new Date().toISOString() }, o) : { ok: false, error: '서버 시각 모양이 이상해요' };
    }
    const clockLabel = c => c && c.ok ? '시계: 서버보다 ' + (c.offset >= 0 ? '+' : '') + (c.offset / 1000).toFixed(2) + '초 (±' + (c.err / 1000).toFixed(2) + ')' : '시계: ' + (c && c.error ? '⚠ ' + c.error : '아직');

    // =====================================================================
    // 📱 두 번째 폰 화면 (손가락 정답)
    // =====================================================================
    function phoneMain(share) {
        $('phone-view').hidden = false; $('main-view').hidden = true;
        let runs = [];
        try { runs = JSON.parse(localStorage.getItem(PKEY) || '[]'); if (!Array.isArray(runs)) runs = []; } catch (e) { runs = []; }
        const saveRuns = () => { try { localStorage.setItem(PKEY, JSON.stringify(runs.slice(-10))); } catch (e) { msg('p-msg', '⚠ 이 폰에 저장하지 못했어요.', 'warn'); } };
        phoneItems = () => runs.map(r => ({ id: r.id, title: r.title, at: r.at, n: r.data.t.length, summary: { '심박(회/분)': r.bpm, '시간(초)': r.dur }, data: r.data }));
        const video = $('p-video'), sample = fingerSampler(video);
        let stream = null, buf = [], rec = null, clock = null, lastUi = 0;
        async function cam() {
            if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; $('p-cam').textContent = '📷 뒤 카메라 켜기'; $('p-start').disabled = true; return; }
            try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } } }); }
            catch (e) { msg('p-msg', '카메라를 켜지 못했어요: ' + esc(camError(e)) + ' ' + esc(camHint(e)), 'err'); return; }
            video.srcObject = stream; try { await video.play(); } catch (e) { /* 무시 */ }
            const tr = stream.getVideoTracks()[0];
            try { const cp = tr.getCapabilities ? tr.getCapabilities() : {}; if (cp.torch) await tr.applyConstraints({ advanced: [{ torch: true }] }); } catch (e) { /* 손전등 없음 */ }
            $('p-cam').textContent = '📷 카메라 끄기'; $('p-start').disabled = false;
            msg('p-msg', '검지로 뒤 카메라를 덮고 품질이 🟢 가 되면 ▶');
            frameLoop(video, () => !!stream, t => {
                const f = sample(t); if (!f) return;
                buf.push(f); while (buf.length && buf[0].t < t - 12) buf.shift();
                if (rec) rec.frames.push(f);
                const now = performance.now();
                if (now - lastUi > 500) {
                    lastUi = now; drawFingerWave($('p-wave'), buf);
                    if (H) { const q = H.quality(buf.filter(x => x.t >= t - 2)); $('p-q').textContent = ({ good: '🟢 ', fair: '🟡 ', bad: '🔴 ' }[q.level] || '') + q.text; $('p-q').className = 'pill ' + q.level; }
                    const b = liveFingerBpm(buf); $('p-bpm').textContent = Number.isFinite(b) ? Math.round(b) : '--';
                    if (rec) { $('p-time').hidden = false; $('p-time').textContent = '⏺ ' + Math.round(t - rec.frames[0].t) + '초'; }
                }
            });
        }
        async function start() {
            rec = { frames: [] };
            $('p-start').hidden = true; $('p-stop').hidden = false; $('p-cam').disabled = true;
            msg('p-msg', '측정 중 — 손가락을 가만히. 얼굴 측정이 끝난 뒤 ■');
            probeClock(share).then(c => { clock = c; $('p-clock').textContent = clockLabel(c); $('p-clock').className = 'pill ' + (c.ok ? 'good' : 'fair'); });
        }
        function stop() {
            const r = rec; rec = null;
            $('p-start').hidden = false; $('p-stop').hidden = true; $('p-cam').disabled = false; $('p-time').hidden = true;
            if (!r || r.frames.length < 60) { msg('p-msg', '너무 짧아 저장하지 않았어요.', 'warn'); return; }
            const fr = r.frames, t0 = fr[0].t, w0 = Math.round(performance.timeOrigin + t0 * 1000);
            let step = 1;
            while (fr.length / step * 22 > 250000) step++;
            const pick = fr.filter((_, i) => i % step === 0);
            const tr = F.fingerTruth(fr), bpm = tr.length ? F.round(F.mean(tr.map(x => x.bpm)), 1) : null;
            const data = { kind: 'facegt', v: 1, w0, clk: clock && clock.ok ? clock.offset : null, clkErr: clock && clock.ok ? clock.err : null,
                t: pick.map(f => Math.round((f.t - t0) * 1000)), r: pick.map(f => +f.r.toFixed(2)), g: pick.map(f => +f.g.toFixed(2)) };
            const at = new Date(w0);
            runs.push({ id: 'g' + w0.toString(36), title: '손가락 ' + clockText(at), at: at.toISOString(), bpm, dur: F.round(fr[fr.length - 1].t - t0, 1), data });
            saveRuns();
            msg('p-msg', '저장했어요 (' + F.round(fr[fr.length - 1].t - t0, 0) + '초, 평균 ' + (bpm || '—') + '회/분). 얼굴 폰으로 보내는 중…', 'okmsg');
            share.saved();
        }
        $('p-cam').onclick = cam; $('p-start').onclick = start; $('p-stop').onclick = stop;
    }
    let phoneItems = () => [];

    // =====================================================================
    // 🙂 얼굴 폰 화면
    // =====================================================================
    const video = $('video'), overlay = $('overlay'), fvideo = $('f-video');
    const work = document.createElement('canvas'), wctx = work.getContext('2d', { willReadFrequently: true });
    let front = null, ftrack = null, fcaps = {}, frontFrames = 0, lockState = '';
    let rear = null, rearFrames = 0, fingerSample = fingerSampler(fvideo), fingerBuf = [];
    let live = [], rec = null, phase = 'off';
    let landmarker = null, detState = 'idle', detMs = 0, detCount = 0, detT0 = 0, lastLm = null, lastLmT = 0, lastDetFrame = -1, frameNo = 0;
    let lastPolys = null, lastSkin = NaN, lastMotion = NaN, prevCentroid = null;
    let share = null, p2items = [], clockFace = null;
    let ble = { dev: null, last: null }, beepCtx = null;
    let tabs = null;

    const BAR = { path: $('st-path'), face: $('st-face'), fps: $('st-fps'), exp: $('st-exp'), move: $('st-move'), time: $('st-time') };
    function pill(el, text, level) { el.textContent = text; el.className = 'pill' + (level ? ' ' + level : ''); }

    // ---------- 로그 (정답 경로 시험 결과: 실패 문구 그대로) ----------
    function log(text, ok) {
        pref.log.push({ at: new Date().toISOString(), ok: ok === true ? 1 : ok === false ? 0 : null, text: String(text) });
        if (pref.log.length > 30) pref.log = pref.log.slice(-30);
        savePref(); renderLog();
    }
    function renderLog() {
        $('path-log').innerHTML = pref.log.slice(-8).map(l => '<li class="' + (l.ok === 1 ? 'ok' : l.ok === 0 ? 'no' : '') + '">' + (l.ok === 1 ? '✅ ' : l.ok === 0 ? '❌ ' : '• ') + esc(l.text) + ' <small>' + esc(clockText(new Date(l.at))) + '</small></li>').join('');
    }

    // ---------- 앞 카메라 ----------
    async function startFront() {
        if (front) return true;
        if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { msg('msg', '이 브라우저에서는 카메라를 쓸 수 없어요 (<b>https</b> 주소인지 확인). 🧪 시뮬레이션·📂 불러오기는 됩니다.', 'err'); return false; }
        msg('msg', '앞 카메라를 켜는 중…');
        try { front = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } }); }
        catch (e) { front = null; msg('msg', '앞 카메라를 켜지 못했어요: ' + esc(camError(e)) + ' ' + esc(camHint(e)), 'err'); log('앞 카메라 열기 실패: ' + camError(e), false); return false; }
        video.srcObject = front; try { await video.play(); } catch (e) { /* 무시 */ }
        ftrack = front.getVideoTracks()[0];
        try { fcaps = (ftrack.getCapabilities && ftrack.getCapabilities()) || {}; } catch (e) { fcaps = {}; }
        const canLock = Array.isArray(fcaps.exposureMode) && fcaps.exposureMode.includes('manual');
        lockState = canLock ? 'ready' : 'unsupported';
        pill(BAR.exp, canLock ? '노출: 시작 때 고정' : '노출: 고정 안 됨(지원 안 함)', canLock ? '' : 'fair');
        ftrack.addEventListener('ended', () => { log('앞 카메라가 꺼졌어요 (다른 카메라가 열리며 꺼졌을 수 있음)', false); stopFront(); });
        phase = 'idle';
        $('cam').textContent = '📷 앞 카메라 끄기'; $('start').disabled = false; $('auto').disabled = false;
        msg('msg', '앞 카메라가 켜졌어요. 얼굴이 화면 가운데 오게 하세요. 정답 경로를 고르고 ② 측정에서 ▶.');
        if (!pref.oval) loadLandmarker();
        frameLoop(video, () => !!front, onFaceFrame);
        return true;
    }
    function stopFront() {
        if (rec) finish(true);
        if (front) front.getTracks().forEach(t => t.stop());
        front = null; ftrack = null; video.srcObject = null; phase = 'off';
        $('cam').textContent = '📷 앞 카메라 켜기'; $('start').disabled = true;
        pill(BAR.face, '얼굴: —');
    }

    // ---------- 얼굴 찾기 (MediaPipe) ----------
    async function loadLandmarker() {
        if (landmarker || detState === 'loading') return;
        detState = 'loading'; pill($('st-det'), '얼굴 찾기: 내려받는 중…');
        const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('시간 초과 (' + ms / 1000 + '초)')), ms));
        try {
            const vision = await Promise.race([import(MP_BASE + '/vision_bundle.mjs'), timeout(20000)]);
            const fileset = await Promise.race([vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm'), timeout(20000)]);
            const make = delegate => vision.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MP_MODEL, delegate }, runningMode: 'VIDEO', numFaces: 1 });
            try { landmarker = await Promise.race([make('GPU'), timeout(30000)]); } catch (e) { landmarker = await Promise.race([make('CPU'), timeout(30000)]); }
            detState = 'ok'; detCount = 0; detT0 = performance.now();
            pill($('st-det'), '얼굴 찾기: MediaPipe ' + MP_VER, 'good');
        } catch (e) {
            landmarker = null; detState = 'fail';
            pill($('st-det'), '얼굴 찾기 못 씀 → 안내 타원', 'fair');
            log('얼굴 찾기(MediaPipe) 불러오기 실패: ' + (e && e.message || e) + ' → 안내 타원 사용', false);
        }
    }
    function useOval() { return pref.oval || !landmarker; }

    // 안내 타원 (화면 비율 좌표): 가운데, 세로로 긴 타원
    function ovalPolys(W, Hh) {
        const cx = W / 2, cy = Hh * 0.47, ry = Hh * 0.34, rx = ry * 0.75;
        const rect = (x0, y0, x1, y1) => [[cx + x0 * rx, cy + y0 * ry], [cx + x1 * rx, cy + y0 * ry], [cx + x1 * rx, cy + y1 * ry], [cx + x0 * rx, cy + y1 * ry]];
        return { fh: rect(-0.45, -0.78, 0.45, -0.5), lc: rect(-0.72, 0.0, -0.3, 0.32), rc: rect(0.3, 0.0, 0.72, 0.32), oval: { cx, cy, rx, ry }, width: 2 * rx };
    }
    function hull(pts) {
        const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        if (p.length < 3) return p;
        const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lo = [], up = [];
        p.forEach(q => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
        p.slice().reverse().forEach(q => { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); });
        return lo.slice(0, -1).concat(up.slice(0, -1));
    }
    function lmPolys(lm, W, Hh) {
        const P = i => [lm[i].x * W, lm[i].y * Hh];
        const out = {};
        Object.keys(LM).forEach(k => { out[k] = hull(LM[k].map(P)); });
        const a = P(WIDTH_LM[0]), b = P(WIDTH_LM[1]);
        out.width = Math.hypot(a[0] - b[0], a[1] - b[1]);
        return out;
    }
    function inPoly(x, y, poly) {
        let c = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
        }
        return c;
    }
    // 피부색: YCbCr 범위 (어둡거나 꽉 찬 화소·눈썹·머리카락은 빠짐)
    function isSkin(r, g, b) {
        const y = 0.299 * r + 0.587 * g + 0.114 * b, cr = (r - y) * 0.713 + 128, cb = (b - y) * 0.564 + 128;
        return y > 35 && y < 245 && cr >= 133 && cr <= 180 && cb >= 70 && cb <= 130 && r < 252;
    }

    function onFaceFrame(t) {
        frontFrames++; frameNo++;
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) return;
        const W = 256, Hh = Math.round(256 * vh / vw);
        if (work.width !== W || work.height !== Hh) { work.width = W; work.height = Hh; }
        wctx.drawImage(video, 0, 0, W, Hh);
        const img = wctx.getImageData(0, 0, W, Hh).data;
        // 얼굴 점: 찾는 시간이 길면 2~3 프레임마다 (사이 프레임은 마지막 점을 씀)
        let polys = null, found = false, motion = NaN;
        if (!useOval()) {
            const every = detMs > 60 ? 3 : detMs > 30 ? 2 : 1;
            if (frameNo - lastDetFrame >= every) {
                lastDetFrame = frameNo;
                const a = performance.now();
                let r = null;
                try { r = landmarker.detectForVideo(video, a); } catch (e) { r = null; }
                const dt = performance.now() - a; detMs = detMs ? detMs * 0.9 + dt * 0.1 : dt; detCount++;
                const lm = r && r.faceLandmarks && r.faceLandmarks[0];
                if (lm) {
                    if (lastLm) {
                        const wd = Math.hypot(lm[WIDTH_LM[0]].x - lm[WIDTH_LM[1]].x, (lm[WIDTH_LM[0]].y - lm[WIDTH_LM[1]].y) * vh / vw) || 1;
                        let s = 0; MOVE_LM.forEach(i => { s += Math.hypot(lm[i].x - lastLm[i].x, (lm[i].y - lastLm[i].y) * vh / vw); });
                        motion = s / MOVE_LM.length / wd / Math.max(1, every);
                    }
                    lastLm = lm; lastLmT = t;
                } else lastLm = null;
            }
            if (lastLm && t - lastLmT < 0.5) { polys = lmPolys(lastLm, W, Hh); found = true; }
            if (Number.isFinite(motion)) lastMotion = motion;
        } else {
            polys = ovalPolys(W, Hh); found = true;
        }
        const rois = {}; let skinPx = 0, polyPx = 0, sumY = 0;
        let ccx = 0, ccy = 0, ccn = 0;
        if (polys) {
            F.ROIS.forEach(k => {
                const pg = polys[k];
                let x0 = W, y0 = Hh, x1 = 0, y1 = 0;
                pg.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
                x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W - 1, Math.ceil(x1)); y1 = Math.min(Hh - 1, Math.ceil(y1));
                let r = 0, g = 0, b = 0, n = 0, all = 0, ar = 0, ag = 0, ab = 0;
                for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                    if (!inPoly(x + 0.5, y + 0.5, pg)) continue;
                    const i = (y * W + x) * 4, R = img[i], G = img[i + 1], B = img[i + 2];
                    all++; ar += R; ag += G; ab += B;
                    if (isSkin(R, G, B)) { r += R; g += G; b += B; n++; ccx += x; ccy += y; ccn++; }
                }
                polyPx += all; skinPx += n;
                // 피부 화소가 너무 적으면(조명이 이상하거나 얼굴색이 범위 밖) 영역 전체 평균을 씀
                if (n >= Math.max(10, 0.3 * all)) rois[k] = [+(r / n).toFixed(3), +(g / n).toFixed(3), +(b / n).toFixed(3), n];
                else if (all >= 10) rois[k] = [+(ar / all).toFixed(3), +(ag / all).toFixed(3), +(ab / all).toFixed(3), all];
                if (rois[k]) sumY += (0.299 * rois[k][0] + 0.587 * rois[k][1] + 0.114 * rois[k][2]) * rois[k][3];
            });
            if (useOval() && ccn) {   // 안내 타원: 피부 무게중심이 얼마나 움직였나
                const c = [ccx / ccn, ccy / ccn];
                if (prevCentroid) lastMotion = Math.hypot(c[0] - prevCentroid[0], c[1] - prevCentroid[1]) / (polys.width || W);
                prevCentroid = c;
            }
        }
        lastPolys = polys; lastSkin = polyPx ? skinPx / polyPx : NaN;
        const nAll = F.ROIS.reduce((s, k) => s + (rois[k] ? rois[k][3] : 0), 0);
        let et = null, iso = null;
        try { const s = ftrack && ftrack.getSettings ? ftrack.getSettings() : {}; if (Number.isFinite(s.exposureTime)) et = s.exposureTime; if (Number.isFinite(s.iso)) iso = s.iso; } catch (e) { /* 무시 */ }
        const f = { t, rois: found ? rois : {}, m: Number.isFinite(lastMotion) ? +lastMotion.toFixed(5) : null, y: nAll ? +(sumY / nAll).toFixed(2) : null, et, iso };
        live.push(f); while (live.length && live[0].t < t - 12) live.shift();
        if (phase === 'rec' && rec) rec.frames.push(Object.assign({}, f, { t: +(t - rec.t0).toFixed(4) }));
        uiTick(t);
    }

    // ---------- 화면 고치기 ----------
    let lastUi = 0, lastBpm = 0, lastOv = 0;
    function uiTick(t) {
        const now = performance.now();
        if (now - lastOv > 100) { lastOv = now; drawOverlay(); }
        if (now - lastUi < 400) return;
        lastUi = now;
        const recent = live.filter(f => f.t >= t - 2);
        const fps = recent.length > 2 ? (recent.length - 1) / (recent[recent.length - 1].t - recent[0].t) : NaN;
        const faceOk = recent.filter(f => F.roiRgb(f, 'all')).length / (recent.length || 1);
        pill(BAR.face, useOval() ? '얼굴: 안내 타원' : faceOk > 0.8 ? '얼굴: 찾음' : '얼굴: 못 찾음', useOval() ? 'fair' : faceOk > 0.8 ? 'good' : 'bad');
        pill(BAR.fps, fmt(fps, 0) + ' fps' + (landmarker ? ' · 찾기 ' + fmt(detMs, 0) + ' ms' : ''));
        const mv = F.mean(recent.map(f => f.m));
        pill(BAR.move, '움직임: ' + (Number.isFinite(mv) ? (mv > F.MOTION_HIGH ? '많음' : '적음') : '—'), Number.isFinite(mv) ? (mv > F.MOTION_HIGH ? 'fair' : 'good') : '');
        pill($('st-skin'), '피부 화소: ' + (Number.isFinite(lastSkin) ? Math.round(lastSkin * 100) + '%' : '—'), Number.isFinite(lastSkin) ? (lastSkin > 0.5 ? 'good' : 'fair') : '');
        if (rec && phase !== 'idle') {
            const el = (now - rec.wall) / 1000;
            BAR.time.hidden = false;
            BAR.time.textContent = phase === 'settle' ? '노출 맞추는 중 ' + Math.max(0, Math.ceil(3 - el)) + '초' : '⏱ 남은 ' + Math.max(0, Math.ceil(rec.dur - (t - rec.t0))) + '초';
        }
        if (now - lastBpm > 1000) { lastBpm = now; liveBpm(t); }
    }
    function liveBpm(t) {
        const seg = live.filter(f => f.t >= t - 10.5);
        if (seg.length > 30 && t - seg[0].t > 9.5) {
            const rgb = F.rgbSeries(seg, 'all', { fs: F.FS });
            if (rgb.G.length > 9 * F.FS) {
                F.METHODS.forEach(m => {
                    const s = F[m](rgb.R, rgb.G, rgb.B, F.FS), pk = F.peakBpm(s, F.FS);
                    $('bpm-' + m).textContent = Number.isFinite(pk.bpm) ? Math.round(pk.bpm) : '--';
                    if (m === 'pos') { const k = Math.min(s.length, 8 * F.FS); plot($('wave'), [{ pts: s.slice(-k).map((y, i) => ({ x: (i - k) / F.FS, y })), color: COL.pos }], { xmin: -8, xmax: 0 }); }
                });
            }
        }
        let g = NaN;
        if (pref.path === 'dual' && rear) g = liveFingerBpm(fingerBuf);
        else if (pref.path === 'ble' && ble.last && t - ble.last.t < 5) g = ble.last.bpm;
        else if (pref.path === 'wrist' && rec) { const w = F.wristTruth(rec.counts); if (w.length) g = w[w.length - 1].bpm; }
        $('bpm-gt').textContent = Number.isFinite(g) ? Math.round(g) : '--';
    }
    function drawOverlay() {
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw) return;
        const W = work.width, Hh = work.height;
        if (overlay.width !== W || overlay.height !== Hh) { overlay.width = W; overlay.height = Hh; }
        const c = overlay.getContext('2d');
        c.clearRect(0, 0, W, Hh);
        if (useOval()) {
            const o = ovalPolys(W, Hh).oval;
            c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2; c.setLineDash([6, 4]);
            c.beginPath(); c.ellipse(o.cx, o.cy, o.rx, o.ry, 0, 0, 2 * Math.PI); c.stroke(); c.setLineDash([]);
        }
        if (!lastPolys) return;
        const cl = { fh: '#4dabf7', lc: '#69db7c', rc: '#ffd43b' };
        F.ROIS.forEach(k => {
            const pg = lastPolys[k]; if (!pg || !pg.length) return;
            c.strokeStyle = cl[k]; c.lineWidth = 2; c.beginPath();
            pg.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.stroke();
        });
    }

    // ---------- ① 같은 폰 뒤 카메라 동시 열기 ----------
    function stopRear() { if (rear) rear.getTracks().forEach(t => t.stop()); rear = null; fvideo.srcObject = null; }
    async function tryDual() {
        if (!front && !(await startFront())) return { ok: false, error: '앞 카메라가 켜지지 않음' };
        stopRear();
        msg('dual-st', '뒤 카메라를 함께 여는 중…');
        let s;
        try { s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } } }); }
        catch (e) {
            const err = camError(e);
            log('같은 폰 동시 열기 실패: ' + err + (camHint(e) ? ' (' + camHint(e) + ')' : ''), false);
            msg('dual-st', '❌ 뒤 카메라를 함께 열지 못했어요: <b>' + esc(err) + '</b>', 'err');
            return { ok: false, error: err };
        }
        rear = s; fvideo.srcObject = s; try { await fvideo.play(); } catch (e) { /* 무시 */ }
        const rt = s.getVideoTracks()[0];
        try { const cp = rt.getCapabilities ? rt.getCapabilities() : {}; if (cp.torch) await rt.applyConstraints({ advanced: [{ torch: true }] }); } catch (e) { /* 손전등 없음 */ }
        rearFrames = 0; fingerBuf = [];
        frameLoop(fvideo, () => rear === s, t => {
            rearFrames++;
            const f = fingerSample(t); if (!f) return;
            fingerBuf.push(f); while (fingerBuf.length && fingerBuf[0].t < t - 12) fingerBuf.shift();
            if (phase === 'rec' && rec) rec.finger.push({ t: +(t - rec.t0).toFixed(4), r: f.r, g: f.g, b: f.b });
        });
        // 1.5초 동안 두 카메라 모두 프레임이 오는지 (어떤 폰은 뒤를 열면 앞이 조용히 멈춤)
        const f0 = frontFrames;
        await new Promise(r => setTimeout(r, 1500));
        const fa = frontFrames - f0, ra = rearFrames;
        const frontLive = !!(ftrack && ftrack.readyState === 'live');
        if (frontLive && fa >= 5 && ra >= 5) {
            log('같은 폰 동시 열기 성공 (1.5초에 앞 ' + fa + '장 · 뒤 ' + ra + '장)', true);
            msg('dual-st', '✅ 두 카메라가 함께 돌아요. 검지로 뒤 카메라를 덮으세요.', 'okmsg');
            return { ok: true };
        }
        const err = !frontLive ? '뒤를 열자 앞 카메라가 꺼짐' : fa < 5 ? '뒤를 열자 앞 카메라 프레임이 멈춤 (1.5초에 ' + fa + '장)' : '뒤 카메라 프레임이 오지 않음 (1.5초에 ' + ra + '장)';
        log('같은 폰 동시 열기 실패: ' + err, false);
        msg('dual-st', '❌ ' + esc(err), 'err');
        stopRear();
        if (!frontLive || fa < 5) { stopFront(); await startFront(); }
        return { ok: false, error: err };
    }

    // ---------- 경로 고르기 ----------
    const cap = { dual: 'untried', dualError: '', server: false, bluetooth: !!(navigator.bluetooth && navigator.bluetooth.requestDevice) };
    function setPath(p) {
        pref.path = p; savePref();
        document.querySelectorAll('.path-pick [data-path]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.path === p)));
        document.querySelectorAll('.path-panel').forEach(el => { el.hidden = el.dataset.path !== p; });
        pill(BAR.path, '정답: ' + (p ? F.PATH_NAMES[p].replace(/^[①②③④] /, '') : '아직 안 고름'), p ? 'good' : '');
        if (p !== 'dual') stopRear();
        if (p === 'wrist') renderWrist();
        if (p === 'phone2' && share && share.state && share.server) {
            const shareEl = document.getElementById('cs-share'); if (shareEl) shareEl.open = true;
        }
    }
    async function autoPath() {
        $('auto').disabled = true;
        log('정답 경로 자동 찾기 시작 (' + (navigator.userAgent.match(/\(([^)]+)\)/) || ['', '기기 정보 없음'])[1] + ')');
        const d = await tryDual();
        cap.dual = d.ok ? 'ok' : 'fail'; cap.dualError = d.error || '';
        cap.server = !!(share && share.server && share.server().url);
        const ch = F.choosePath(cap);
        ch.why.forEach(w => log(w));
        log('고른 경로: ' + F.PATH_NAMES[ch.path], true);
        setPath(ch.path);
        $('auto').disabled = false;
        return ch;
    }

    // ---------- ③ 블루투스 심박계 ----------
    async function connectBle() {
        if (!cap.bluetooth) { pill($('ble-st'), '이 브라우저는 블루투스를 쓸 수 없어요', 'bad'); log('블루투스(Web Bluetooth) 없음 (이 브라우저)', false); return; }
        try {
            const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
            pill($('ble-st'), '연결 중… ' + (dev.name || ''));
            const gatt = await dev.gatt.connect();
            const svc = await gatt.getPrimaryService('heart_rate');
            const ch = await svc.getCharacteristic('heart_rate_measurement');
            ch.addEventListener('characteristicvaluechanged', ev => {
                const v = F.parseHrMeasurement(ev.target.value); if (!v || !v.bpm) return;
                const t = nowS();
                ble.last = { t, bpm: v.bpm };
                pill($('ble-st'), '🟢 ' + (dev.name || '심박계') + ' · ' + v.bpm + '회/분' + (v.contact === false ? ' (피부 접촉 안 됨)' : ''), v.contact === false ? 'fair' : 'good');
                if (phase === 'rec' && rec) rec.points.push({ t: +(t - rec.t0).toFixed(3), bpm: v.bpm, rr: v.rr });
            });
            await ch.startNotifications();
            dev.addEventListener('gattserverdisconnected', () => { pill($('ble-st'), '⚠ 연결 끊김 — 다시 연결하세요', 'bad'); log('블루투스 심박계 연결 끊김', false); });
            ble.dev = dev;
            log('블루투스 심박계 연결: ' + (dev.name || '이름 없음'), true);
        } catch (e) {
            pill($('ble-st'), '연결 못 함: ' + camError(e), 'bad');
            log('블루투스 심박계 연결 실패: ' + camError(e), false);
        }
    }

    // ---------- ④ 손목 15초 × 4 ----------
    function beep(hz) {
        try { beepCtx = beepCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = beepCtx.createOscillator(), g = beepCtx.createGain(); o.frequency.value = hz || 880; g.gain.value = 0.15; o.connect(g); g.connect(beepCtx.destination); o.start(); o.stop(beepCtx.currentTime + 0.15); } catch (e) { /* 소리 안 됨 */ }
        try { if (navigator.vibrate) navigator.vibrate(150); } catch (e) { /* 무시 */ }
    }
    function wristCounts() { return rec ? rec.counts : (session && session.truth && session.truth.source === 'wrist' ? session.truth.counts : []); }
    function renderWrist() {
        const cs = wristCounts();
        $('wrist-rows').innerHTML = [0, 1, 2, 3].map(i => {
            const c = cs[i] || {};
            return '<div class="wrist-row"><b>' + (i + 1) + '번</b> <button type="button" class="secondary" data-wst="' + i + '"' + (rec && phase === 'rec' ? '' : ' disabled') + '>⏱ 15초 세기</button>' +
                '<label>맥박 수 <input type="number" min="0" max="80" inputmode="numeric" data-wc="' + i + '" value="' + (c.count != null ? c.count : '') + '"></label>' +
                '<span class="note">' + (Number.isFinite(c.t0) ? fmt(c.t0, 0) + '~' + fmt(c.t1, 0) + '초' + (c.count ? ' → ' + Math.round(c.count * 60 / (c.t1 - c.t0)) + '회/분' : '') : '') + '</span></div>';
        }).join('') + '<p class="note">' + (rec ? '측정 중이에요. ⏱ 를 누르고 15초 동안 손목 맥박을 세세요.' : '▶ 측정을 시작하면 ⏱ 가 켜져요. 측정 뒤에도 수를 고칠 수 있어요.') + '</p>';
    }
    // 15초 세기: ① 준비 탭의 칸 또는 측정 중 띠의 ⏱ (측정 중에는 ② 측정 탭이 보여서 띠에도 둠)
    let wristLast = -1;
    function wristStart(i) {
        const r = rec; if (!r || phase !== 'rec' || i < 0 || i > 3) return;
        const t0 = nowS() - r.t0;
        r.counts[i] = { t0: +t0.toFixed(2), t1: null, count: null };
        beep(880); renderWrist(); renderWristBar();
        setTimeout(() => { r.counts[i].t1 = +(t0 + 15).toFixed(2); wristLast = i; beep(440); renderWrist(); renderWristBar(); const inp = rec ? $('wrist-n') : document.querySelector('[data-wc="' + i + '"]'); if (inp) inp.focus(); }, 15000);
    }
    function renderWristBar() {
        const on = pref.path === 'wrist' && !!rec && phase === 'rec';
        $('wrist-bar').hidden = !on;
        if (!on) return;
        const cs = rec.counts, counting = cs.findIndex(c => c && c.t0 != null && c.t1 == null), next = [0, 1, 2, 3].find(i => !cs[i]);
        $('wrist-go').disabled = counting >= 0 || next == null;
        $('wrist-go').textContent = counting >= 0 ? '⏱ 세는 중…' : next == null ? '⏱ 4번 다 셈' : '⏱ 손목 15초 (' + (next + 1) + '/4)';
        const wait = wristLast >= 0 && cs[wristLast] && cs[wristLast].count == null;
        $('wrist-n').hidden = !wait;
        if (wait) $('wrist-n').placeholder = (wristLast + 1) + '번 센 수';
    }
    $('wrist-go').addEventListener('click', () => { if (rec) wristStart([0, 1, 2, 3].find(i => !rec.counts[i])); });
    $('wrist-n').addEventListener('change', () => {
        const v = Number($('wrist-n').value), cs = wristCounts();
        if (wristLast >= 0 && cs[wristLast] && Number.isFinite(v) && v > 0) { cs[wristLast].count = v; $('wrist-n').value = ''; }
        renderWrist(); renderWristBar();
    });
    $('wrist-rows').addEventListener('click', ev => {
        const b = ev.target.closest('[data-wst]'); if (!b || !rec) return;
        wristStart(+b.dataset.wst);
    });
    $('wrist-rows').addEventListener('change', ev => {
        const inp = ev.target.closest('[data-wc]'); if (!inp) return;
        const i = +inp.dataset.wc, cs = wristCounts(), v = Number(inp.value);
        if (!cs[i] || !Number.isFinite(cs[i].t1)) { inp.value = ''; return; }
        cs[i].count = Number.isFinite(v) && v > 0 ? v : null;
        if (!rec && session) { saveSession(); renderAnalysis(); devSend(session); }
        renderWrist();
    });

    // ---------- ② 두 번째 폰: 받은 손가락 자료 ----------
    function onIncoming(items) {
        const got = (items || []).filter(x => x && x.data && x.data.kind === 'facegt' && Array.isArray(x.data.t));
        const sig = got.map(x => x.rowId + ':' + x.n).join('|'), changed = sig !== p2items.map(x => x.rowId + ':' + x.n).join('|');
        p2items = got;
        if (changed) {
            renderP2();
            if (session && session.truth && session.truth.source === 'phone2' && !(session.truth.finger || []).length) { if (attachPhone2()) { saveSession(); renderAnalysis(); devSend(session); } }
        }
        return changed;
    }
    function renderP2() {
        if (!p2items.length) { msg('p2-st', '두 번째 폰 자료: 아직 없음'); return; }
        msg('p2-st', '두 번째 폰 자료 ' + p2items.length + '개: ' + p2items.slice(-3).map(x => esc(x.from + ' · ' + x.title + ' (' + (x.summary['시간(초)'] || '?') + '초)')).join(', '), 'okmsg');
    }
    // 얼굴 측정과 시간이 가장 많이 겹치는 손가락 자료를 얼굴 시각으로 옮겨 붙임
    function attachPhone2() {
        if (!session || !session.meta || !Number.isFinite(session.meta.wall0)) return false;
        const fc = session.meta.clock && session.meta.clock.ok ? session.meta.clock.offset : 0;
        const dur = session.meta.dur || 0;
        let best = null, bestOv = 0;
        p2items.forEach(x => {
            const d = x.data, pc = Number.isFinite(d.clk) ? d.clk : 0;
            const shift = (d.w0 - pc + fc - session.meta.wall0) / 1000;   // 폰 시각 → 얼굴 측정 시각 (초)
            const a = shift + d.t[0] / 1000, b = shift + d.t[d.t.length - 1] / 1000;
            const ov = Math.min(b, dur) - Math.max(a, 0);
            if (ov > bestOv) { bestOv = ov; best = { x, shift }; }
        });
        if (!best || bestOv < 10) { if (p2items.length) msg('p2-st', '⚠ 두 번째 폰 자료가 이 얼굴 측정과 10초 넘게 겹치지 않아요 (두 폰 시계가 많이 다르거나 다른 시간에 잰 것).', 'warn'); return false; }
        const d = best.x.data;
        session.truth.finger = d.t.map((tt, i) => ({ t: +(best.shift + tt / 1000).toFixed(4), r: d.r[i], g: d.g[i], b: null }));
        session.truth.note = best.x.from + ' · ' + best.x.title + ' · 겹침 ' + bestOv.toFixed(0) + '초 · 시계 ' + (Number.isFinite(d.clk) && session.meta.clock && session.meta.clock.ok ? '서버 왕복으로 맞춤' : '기기 시계 그대로(맞추기 안 함)');
        msg('p2-st', '✅ 두 번째 폰 자료를 붙였어요: ' + esc(session.truth.note), 'okmsg');
        return true;
    }

    // ---------- 노출 고정 (손가락 페이지와 같은 방법: 3초 자동 → 잠그기 → 확인) ----------
    async function lockExposure() {
        if (!ftrack) return 'unsupported';
        const canLock = Array.isArray(fcaps.exposureMode) && fcaps.exposureMode.includes('manual');
        if (!canLock) return 'unsupported';
        const s = ftrack.getSettings ? ftrack.getSettings() : {};
        const adv = { exposureMode: 'manual' };
        if (fcaps.exposureTime && Number.isFinite(s.exposureTime)) adv.exposureTime = Math.min(fcaps.exposureTime.max || Infinity, Math.max(fcaps.exposureTime.min || 0, s.exposureTime));
        if (fcaps.iso && Number.isFinite(s.iso)) adv.iso = Math.min(fcaps.iso.max || Infinity, Math.max(fcaps.iso.min || 0, s.iso));
        if (Array.isArray(fcaps.whiteBalanceMode) && fcaps.whiteBalanceMode.includes('manual')) adv.whiteBalanceMode = 'manual';
        try { await ftrack.applyConstraints({ advanced: [adv] }); const a = ftrack.getSettings ? ftrack.getSettings() : {}; return a.exposureMode === 'manual' ? 'locked' : 'failed'; }
        catch (e) { return 'failed'; }
    }
    async function unlockExposure() {
        if (!ftrack) return;
        const adv = {};
        if (Array.isArray(fcaps.exposureMode) && fcaps.exposureMode.includes('continuous')) adv.exposureMode = 'continuous';
        if (Array.isArray(fcaps.whiteBalanceMode) && fcaps.whiteBalanceMode.includes('continuous')) adv.whiteBalanceMode = 'continuous';
        if (Object.keys(adv).length) { try { await ftrack.applyConstraints({ advanced: [adv] }); } catch (e) { /* 무시 */ } }
    }

    // ---------- 측정 ----------
    let settleT = null, endT = null, wakeLock = null;
    async function start() {
        if (phase !== 'idle') return;
        rec = { wall: performance.now(), dur: Number($('dur').value) || 60, path: pref.path, frames: [], finger: [], points: [], counts: [], t0: 0, lock: '' };
        phase = 'settle';
        $('start').hidden = true; $('stop').hidden = false; $('cam').disabled = true; $('auto').disabled = true;
        tabs && tabs.show('measure');
        try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
        if (pref.path === 'phone2') probeClock(share).then(c => { clockFace = c; pill($('clock-st'), clockLabel(c), c.ok ? 'good' : 'fair'); if (rec) rec.clock = c; });
        await unlockExposure();
        settleT = setTimeout(async () => {
            if (!rec) return;
            const lk = await lockExposure();
            if (!rec) return;
            rec.lock = lk; lockState = lk;
            pill(BAR.exp, lk === 'locked' ? '🔒 노출 고정됨' : '노출: 고정 안 됨' + (lk === 'failed' ? ' (실패)' : ''), lk === 'locked' ? 'good' : 'fair');
            rec.t0 = nowS(); rec.wall0 = Math.round(performance.timeOrigin + rec.t0 * 1000);
            rec.frames = []; rec.finger = []; rec.points = [];
            phase = 'rec';
            if (pref.path === 'wrist') { wristLast = -1; renderWrist(); renderWristBar(); }
            endT = setTimeout(() => finish(false), rec.dur * 1000 + 200);
        }, 3000);
    }
    function finish(cancel) {
        clearTimeout(settleT); clearTimeout(endT);
        const r = rec; rec = null;
        if (phase === 'settle' || phase === 'rec') phase = front ? 'idle' : 'off';
        $('start').hidden = false; $('stop').hidden = true; $('cam').disabled = false; $('auto').disabled = !front; BAR.time.hidden = true;
        if (wakeLock) { try { wakeLock.release(); } catch (e) { /* 무시 */ } wakeLock = null; }
        if (!r) return;
        if (pref.path === 'wrist') { renderWrist(); renderWristBar(); }
        const dur = r.frames.length > 1 ? r.frames[r.frames.length - 1].t - r.frames[0].t : 0;
        if (dur < 12) { msg('msg', '12초보다 짧아 저장하지 않았어요.', 'warn'); return; }
        const fps = (r.frames.length - 1) / dur;
        const settings = (() => { try { const s = ftrack.getSettings(); return { width: s.width, height: s.height, frameRate: s.frameRate, exposureMode: s.exposureMode || null }; } catch (e) { return {}; } })();
        session = {
            v: 1, kind: 'face-hr',
            meta: { at: new Date(r.wall0).toISOString(), wall0: r.wall0, dur: F.round(dur, 2), path: r.path || '', lock: r.lock || 'unsupported', detector: useOval() ? 'oval' : 'mediapipe@' + MP_VER,
                fps: F.round(fps, 2), detMs: F.round(detMs, 1), camera: settings, clock: r.clock || clockFace || null, ua: navigator.userAgent, log: pref.log.slice(-10), cancelled: !!cancel },
            frames: r.frames,
            truth: { source: r.path || '', finger: r.finger, points: r.points, counts: r.counts }
        };
        if (r.path === 'phone2') attachPhone2();
        if (r.lock !== 'locked' && r.frames.some(f => f.et != null)) { pref.expNorm = true; savePref(); }
        saveSession(); renderAnalysis(); tabs && tabs.show('analysis');
        devSend(session);   // 선생님 기기에서만 (개발 데이터 자동 수집, js/dev-collect.js)
        msg('msg', '측정을 저장했어요 (' + dur.toFixed(0) + '초). ③ 분석·비교에서 보세요.' + (r.path === 'phone2' && !session.truth.finger.length ? ' 두 번째 폰에서 ■ 저장하면 자료가 들어와요.' : ''), 'okmsg');
    }

    // ---------- 개발 데이터 자동 수집 (docs/dev-data.md) ----------
    // 카메라로 잰 측정만 (시뮬레이션·불러온 파일은 빼고). 정답이 나중에 붙거나(② 두 번째 폰) 손목 수를 고치면 같은 id 로 다시 보내 고쳐 씀
    // 보내는 것: CSV(프레임별 영역 RGB·움직임·밝기·노출 + 정답 손가락·심박계·손목) + 방법별 결과표 + 정답 경로·경로 시험 기록·기기 정보. 영상은 없음
    const DEV_MAX = 250000;
    function devPayload(s) {
        const res = F.analyze(s.frames, { expNorm: pref.expNorm }), truth = F.truthSeries(s.truth);
        const rows = res.ok ? F.table(res, truth) : [];
        const all = m => rows.find(r => r.method === m && r.roi === 'all') || {};
        const meanBpm = m => res.ok && res.series[m].all ? F.round(F.mean(res.series[m].all.map(w => w.bpm)), 1) : '';
        // 서버 한도(27만 자)에 맞게: 넘으면 얼굴·손가락 프레임을 고르게 솎음 (솎은 배수는 thin 에)
        const meta = Object.assign({}, s.meta); delete meta.ua;   // 긴 기기 문자열 대신 짧은 기기 정보(device)만
        s = Object.assign({}, s, { meta });
        let thin = 1, csv = F.toCsv(s);
        while (csv.length > DEV_MAX && thin < 8) {
            thin++;
            csv = F.toCsv(Object.assign({}, s, { frames: s.frames.filter((_, i) => i % thin === 0),
                truth: Object.assign({}, s.truth, { finger: (s.truth.finger || []).filter((_, i) => i % thin === 0) }) }));
        }
        return {
            summary: { '정답 경로': s.truth.source || '없음', '시간(초)': s.meta.dur || '', 'fps': res.ok ? res.fps : '', '정답 평균': truth.length ? F.round(F.mean(truth.map(p => p.bpm)), 1) : '',
                'POS': meanBpm('pos'), 'CHROM': meanBpm('chrom'), 'GREEN': meanBpm('green'),
                'POS 오차': all('pos').mae == null ? '' : all('pos').mae, 'CHROM 오차': all('chrom').mae == null ? '' : all('chrom').mae, 'GREEN 오차': all('green').mae == null ? '' : all('green').mae,
                '얼굴 찾기': s.meta.detector || '', '노출': s.meta.lock || '' },
            data: { csv, thin, meta, path: s.truth.source || '', truthNote: s.truth.note || '', truth, table: rows,
                motionHigh: res.ok ? res.motion.filter(w => w.high).length : null, expNorm: !!pref.expNorm,
                device: DevCollect.uaSummary(navigator.userAgent), screen: [screen.width, screen.height, devicePixelRatio] }
        };
    }
    function devSend(s) {
        if (!s || !s.meta || s.meta.sim || s.meta.file || !s.frames || !s.frames.length || typeof DevCollect === 'undefined' || !DevCollect.active()) return;
        if (!s.meta.id) { s.meta.id = 'fh-' + DevCollect.device().slice(-6) + '-' + Math.floor((s.meta.wall0 || Date.now()) / 1000).toString(36); saveSession(); }
        let p;
        try { p = devPayload(s); } catch (e) { console.error(e); return; }
        DevCollect.send('facehr', { id: s.meta.id, measuredAt: s.meta.at, summary: p.summary, data: p.data });
    }

    // ---------- ③ 분석 ----------
    function renderAnalysis() {
        const has = !!(session && session.frames && session.frames.length);
        $('ex-json').disabled = $('ex-csv').disabled = !has;
        document.querySelectorAll('.roi-pick [data-roi]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.roi === pref.roi)));
        $('lag-fit').checked = !!pref.lagFit; $('exp-norm').checked = !!pref.expNorm;
        const tb = $('a-table').querySelector('tbody');
        if (!has) { tb.innerHTML = ''; plot($('hr-chart'), [], { empty: '측정이 없어요' }); return; }
        const m = session.meta || {};
        const res = F.analyze(session.frames, { expNorm: pref.expNorm });
        if (!res.ok) { msg('a-src', '⚠ ' + esc(res.error), 'warn'); tb.innerHTML = ''; plot($('hr-chart'), [], { empty: res.error }); return; }
        const truth = F.truthSeries(session.truth);
        let lag = 0, lagText = '';
        // 같은 폰(①)·심박계(③)는 같은 시계라 보정하지 않음. 두 번째 폰(②)·불러온 파일만
        if (pref.lagFit && truth.length >= 3 && ['phone2', ''].includes(session.truth.source) && res.series.pos.all) {
            const bl = F.bestLag(res.series.pos.all, truth, 15, 0.5);
            if (Number.isFinite(bl.mae)) { lag = bl.lag; lagText = bl.kept ? ' · 시각 보정 필요 없음' : ' · 시각 보정 ' + (lag >= 0 ? '+' : '') + lag + '초'; }
        }
        const rows = F.table(res, truth, { lag });
        const src = { dual: '① 같은 폰 뒤 카메라', phone2: '② 두 번째 폰', ble: '③ 블루투스 심박계', wrist: '④ 손목 15초×4' }[session.truth.source] || '없음';
        msg('a-src', esc((m.sim ? '🧪 시뮬레이션' : m.file ? '📂 ' + m.file : '📷 ' + (m.at ? new Date(m.at).toLocaleString('ko-KR') : '측정')) +
            ' · ' + fmt(res.dur, 0) + '초 · ' + fmt(res.fps, 1) + ' fps · 얼굴 ' + Math.round(res.faceRate * 100) + '% · ' + (m.detector || '') + ' · 노출 ' + ({ locked: '고정됨', unsupported: '고정 안 됨', failed: '고정 실패' }[m.lock] || m.lock || '—') +
            ' · 정답: ' + src + (truth.length ? ' (' + truth.length + '점)' : ' (없음)') + lagText + (session.truth.note ? ' · ' + session.truth.note : '')));
        const bestMae = rows.find(r => r.mae != null);
        tb.innerHTML = rows.map(r => '<tr class="' + (bestMae && r === bestMae ? 'best' : '') + '" data-m="' + r.method + '" data-roi="' + r.roi + '"><td>' + esc(r.name) + '</td><td>' + fmt(r.mae, 1) + '</td><td>' + fmt(r.rmse, 1) + '</td><td>' + (r.within5 != null ? Math.round(r.within5 * 100) + '%' : '—') + '</td><td>' + fmt(r.r, 2) + '</td><td>' + fmt(r.maeStill, 1) + '</td><td>' + fmt(r.snr, 1) + '</td></tr>').join('');
        const moving = res.motion.filter(w => w.high).length;
        msg('a-sum', truth.length && bestMae
            ? '가장 잘 맞은 방법: <b>' + esc(bestMae.name) + '</b> — 평균 절대 오차 ' + fmt(bestMae.mae, 1) + '회/분 (' + bestMae.n + '창). 움직임 많은 창 ' + moving + '개.'
            : '정답이 없어 오차는 계산하지 않았어요. 방법별 심박 곡선과 SNR(높을수록 맥파가 뚜렷)만 비교하세요. 움직임 많은 창 ' + moving + '개.');
        const roi = res.series.pos[pref.roi] ? pref.roi : 'all', series = [];
        if (truth.length) series.push({ pts: truth.map(p => ({ x: p.t - lag, y: p.bpm })), color: COL.gt, width: 2.5, dots: session.truth.source === 'wrist' ? 4 : 0, noLine: session.truth.source === 'wrist' });
        F.METHODS.forEach(mm => { const s = res.series[mm][roi]; if (s) series.push({ pts: s.map(w => ({ x: w.t, y: w.bpm })), color: COL[mm], width: mm === 'pos' ? 2 : 1.5 }); });
        const bands = res.motion.filter(w => w.high).map(w => ({ x0: w.t - 0.5, x1: w.t + 0.5 }));
        plot($('hr-chart'), series, { xlabel: '시간 (초)', ylabel: '심박 (회/분)', bands, xmin: 0, xmax: res.dur });
    }

    // ---------- ④ 내보내기 · 불러오기 · 시뮬레이션 ----------
    function download(name, text, type) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type }));
        a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    function fileStem() { const d = session && session.meta && session.meta.at ? new Date(session.meta.at) : new Date(); const p = n => String(n).padStart(2, '0'); return 'face-hr-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); }
    $('ex-json').onclick = () => { if (session) download(fileStem() + '.json', JSON.stringify(session), 'application/json'); };
    $('ex-csv').onclick = () => { if (session) download(fileStem() + '.csv', '﻿' + F.toCsv(session), 'text/csv;charset=utf-8'); };
    $('im-file').onchange = async ev => {
        const file = ev.target.files && ev.target.files[0]; ev.target.value = '';
        if (!file) return;
        const text = await file.text();
        const s = /^\s*\{/.test(text) ? F.parseJson(text) : F.parseCsv(text);
        if (s.error) { ioMsg('⚠ ' + esc(s.error), 'err'); return; }
        s.meta = Object.assign({}, s.meta, { file: file.name });
        session = s; saveSession(); renderAnalysis();
        ioMsg('✅ 불러왔어요: ' + esc(file.name) + ' (얼굴 ' + s.frames.length + '프레임). ③ 분석·비교에서 보세요.', 'okmsg');
        tabs && tabs.show('analysis');
    };
    $('sim').onclick = () => {
        const s = F.simulate({ dur: 60, bpm: Number($('sim-bpm').value) || 72, illum: Number($('sim-illum').value), motion: Number($('sim-move').value), seed: (Date.now() % 100000) + 1 });
        session = { v: 1, kind: 'face-hr', meta: { sim: true, at: new Date().toISOString(), dur: 60, path: 'dual', lock: 'sim', detector: '시뮬레이션', opts: s.opts }, frames: s.frames, truth: { source: 'dual', finger: s.finger, points: [], counts: [] } };
        saveSession(); renderAnalysis(); tabs && tabs.show('analysis');
        ioMsg('🧪 시뮬레이션 자료를 만들었어요.', 'okmsg');
    };

    // ---------- 연결 ----------
    function initMain() {
        tabs = LabUI.initTabs('#tabs', { key: 'face-hr-lab', start: 'prep' });
        renderLog();
        $('consent').onchange = () => { $('cam').disabled = !$('consent').checked; };
        $('cam').onclick = () => (front ? stopFront() : startFront());
        $('auto').onclick = autoPath;
        $('dual-try').onclick = async () => { const d = await tryDual(); cap.dual = d.ok ? 'ok' : 'fail'; cap.dualError = d.error || ''; };
        $('ble-btn').onclick = connectBle;
        $('clock').onclick = async () => { pill($('clock-st'), '시계: 재는 중…'); clockFace = await probeClock(share); pill($('clock-st'), clockLabel(clockFace), clockFace.ok ? 'good' : 'fair'); log('시계 맞추기: ' + clockLabel(clockFace), clockFace.ok); };
        $('start').onclick = start; $('stop').onclick = () => finish(true);
        $('oval').checked = !!pref.oval;
        $('oval').onchange = () => { pref.oval = $('oval').checked; savePref(); lastLm = null; if (!pref.oval && front) loadLandmarker(); };
        document.querySelector('.path-pick').addEventListener('click', ev => { const b = ev.target.closest('[data-path]'); if (b) { setPath(b.dataset.path); log('경로를 직접 골랐어요: ' + F.PATH_NAMES[b.dataset.path]); } });
        document.querySelector('.roi-pick').addEventListener('click', ev => { const b = ev.target.closest('[data-roi]'); if (b) { pref.roi = b.dataset.roi; savePref(); renderAnalysis(); } });
        $('lag-fit').onchange = () => { pref.lagFit = $('lag-fit').checked; savePref(); renderAnalysis(); };
        $('exp-norm').onchange = () => { pref.expNorm = $('exp-norm').checked; savePref(); renderAnalysis(); };
        window.addEventListener('resize', () => renderAnalysis());
        setPath(pref.path || '');
        renderP2();
        renderAnalysis();
    }

    // 조 공유: 두 번째 폰 연결 (폰이면 손가락 화면, 아니면 얼굴 화면)
    try {
        if (window.ClassShare) {
            share = ClassShare.init({
                exp: 'heartrate', shareMount: PHONE ? null : '#share-mount', phone: true, autoSendOnSave: true, solo: false,   // 선생님 개발 페이지: 수업 없이도 조 공유 칸(두 번째 폰 연결)을 그대로
                csvHint: '④ 내보내기의 JSON',
                getItems: () => (PHONE ? phoneItems() : []),
                onIncoming: items => (PHONE ? false : onIncoming(items)),
                getStep: () => (PHONE ? 'finger' : phase === 'rec' ? 'measure' : 'prep'),
                getPoints: () => (rec ? rec.frames.length : 0)
            });
        }
    } catch (e) { console.error(e); share = null; }
    if (PHONE && share) phoneMain(share);
    else initMain();

    // 시험용 (상태 보기)
    window.__faceHr = { devPayload, session: () => session, cap, pref, p2: () => p2items, tryDual, autoPath, setPath, renderAnalysis };
})();
