/* 필름통 로켓 — 큰 시계를 겹친 녹화와 장면 고르기 (브라우저 전용)
   카메라 영상과 큰 시계를 캔버스에 함께 그리고, 그 캔버스를 MediaRecorder 로 녹화한다 → 시계가 영상 안에 찍힌다.
   장면의 시각 = 영상 재생 위치 − (시계를 시작한 때 − 녹화를 시작한 때). 영상은 이 폰에만 있고 어디로도 보내지 않는다.
   녹화가 안 되는 폰(MediaRecorder·captureStream 없음, 카메라 거절)은 supported() 가 false → 화면이 초시계 단추로 바꾼다.

   const cam = FilmRocketVideo.camera(캔버스, { clock: true });   await cam.open();   cam.record();   cam.startClock();   const clip = await cam.stop();
   const pick = FilmRocketVideo.player(video 요소, clip);   pick.seek(초); pick.step(±1); pick.clockAt() → 그 장면의 시계 값(초) */
(function (root) {
    'use strict';
    var FPS = 30;
    function supported() {
        try {
            return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder &&
                typeof HTMLCanvasElement.prototype.captureStream === 'function');
        } catch (e) { return false; }
    }
    function pickMime() {
        var list = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4'];
        for (var i = 0; i < list.length; i++) { try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) { /* 다음 */ } }
        return '';
    }
    function fmt(sec) { return (sec < 0 ? 0 : sec).toFixed(2); }

    function camera(canvas, opts) {
        opts = opts || {};
        var g = canvas.getContext('2d'), video = document.createElement('video');
        video.muted = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
        var stream = null, raf = 0, rec = null, chunks = [], recStart = 0, clockStart = 0, stopped = null, mime = '';
        function draw() {
            raf = requestAnimationFrame(draw);
            var vw = video.videoWidth, vh = video.videoHeight;
            if (!vw || !vh) return;
            // 너무 큰 화면은 줄여 녹화 (폰 메모리·발열)
            var scale = Math.min(1, 720 / Math.max(vw, vh)), W = Math.round(vw * scale), H = Math.round(vh * scale);
            if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
            g.drawImage(video, 0, 0, W, H);
            if (opts.clock === false) return;
            var now = performance.now(), t = clockStart ? (now - clockStart) / 1000 : 0;
            var fs = Math.round(H * 0.11), pad = Math.round(fs * 0.3), txt = (clockStart ? fmt(t) : '0.00') + '초';
            g.font = 'bold ' + fs + 'px system-ui, sans-serif';
            var tw = g.measureText(txt).width;
            g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(pad, pad, tw + pad * 2, fs + pad * 1.4);
            g.fillStyle = clockStart ? '#ffeb3b' : '#ffffff'; g.textBaseline = 'top';
            g.fillText(txt, pad * 2, pad * 1.6);
            if (rec && rec.state === 'recording') {
                g.fillStyle = '#e53935'; g.beginPath(); g.arc(W - pad * 2, pad * 2, pad * 0.9, 0, Math.PI * 2); g.fill();
            }
        }
        return {
            async open() {
                stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
                video.srcObject = stream;
                await video.play().catch(function () { /* 자동 재생이 막혀도 그리기는 시도 */ });
                cancelAnimationFrame(raf); draw();
                return true;
            },
            record() {
                chunks = []; mime = pickMime();
                var cs = canvas.captureStream(FPS);
                rec = mime ? new MediaRecorder(cs, { mimeType: mime, videoBitsPerSecond: 2500000 }) : new MediaRecorder(cs);
                rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
                stopped = new Promise(function (res) { rec.onstop = res; });
                rec.start(250);
                recStart = performance.now(); clockStart = 0;
            },
            // 시계 시작 (뚜껑을 닫는 순간 — 1차시). 녹화 중이 아니어도 된다
            startClock() { clockStart = performance.now(); return clockStart; },
            clockRunning() { return !!clockStart; },
            elapsed() { return clockStart ? (performance.now() - clockStart) / 1000 : 0; },
            recording() { return !!(rec && rec.state === 'recording'); },
            async stop() {
                if (!rec) return null;
                var end = performance.now();
                if (rec.state !== 'inactive') rec.stop();
                await stopped;
                var blob = new Blob(chunks, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] });
                var clip = { blob: blob, url: URL.createObjectURL(blob), duration: (end - recStart) / 1000, clockOffset: clockStart ? (clockStart - recStart) / 1000 : null, type: blob.type };
                rec = null;
                return clip;
            },
            close() {
                cancelAnimationFrame(raf); raf = 0;
                try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) { /* 무시 */ }
                if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
                stream = null; video.srcObject = null;
            }
        };
    }

    /* 녹화한 영상 앞뒤로 넘기기. webm 은 길이(duration)가 비어 있는 경우가 있어 끝으로 한 번 보내 길이를 알아낸다 */
    function player(video, clip) {
        video.muted = true; video.playsInline = true; video.setAttribute('playsinline', '');
        video.src = clip.url;
        var dur = clip.duration;
        var ready = new Promise(function (res) {
            var done = false, finish = function () { if (!done) { done = true; res(); } };
            video.addEventListener('loadedmetadata', function () {
                if (isFinite(video.duration) && video.duration > 0) { dur = video.duration; finish(); return; }
                var fix = function () { if (isFinite(video.duration) && video.duration > 0) { dur = video.duration; video.removeEventListener('durationchange', fix); video.currentTime = 0; finish(); } };
                video.addEventListener('durationchange', fix);
                try { video.currentTime = 1e7; } catch (e) { finish(); }
                setTimeout(finish, 2500);
            }, { once: true });
            video.addEventListener('error', finish, { once: true });
            setTimeout(finish, 4000);
        });
        function clampT(t) { return Math.max(0, Math.min(Math.max(0, dur - 0.01), t)); }
        function seek(t) {
            t = clampT(t);
            return new Promise(function (res) {
                var done = false, ok = function () { if (!done) { done = true; res(video.currentTime); } };
                video.addEventListener('seeked', ok, { once: true });
                setTimeout(ok, 800);
                video.currentTime = t;
            });
        }
        return {
            ready: ready,
            duration: function () { return dur; },
            time: function () { return video.currentTime; },
            seek: seek,
            step: function (frames) { return seek(video.currentTime + frames / FPS); },
            // 이 장면의 시계 값 (초). 시계를 시작하지 않았으면 영상 처음부터의 시간
            clockAt: function () { return Math.max(0, video.currentTime - (clip.clockOffset || 0)); },
            // 지금 장면을 캔버스로 (세 점 누르기용)
            grab: function (canvas) {
                var w = video.videoWidth || 360, h = video.videoHeight || 640;
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(video, 0, 0, w, h);
                return { w: w, h: h };
            }
        };
    }

    root.FilmRocketVideo = { supported: supported, camera: camera, player: player, FPS: FPS };
})(typeof self !== 'undefined' ? self : this);
