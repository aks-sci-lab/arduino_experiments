/* 필름통 로켓 — 녹화 화면의 얼굴을 캐릭터로 가리기 (브라우저 전용, 2026-11-23)
   도전 장면(사진·영상)을 선생님 화면에 보내기 전에, 팀 폰이 녹화하는 캔버스에 얼굴을 찾아 그 자리를 캐릭터(이모지)로 덮는다.
   → 폰에 남는 영상도, 선생님께 가는 사진·영상도 처음부터 가린 그림이다 (가리지 않은 장면이 서버로 가는 길이 없게).
   얼굴 찾기: MediaPipe FaceDetector (jsdelivr @mediapipe/tasks-vision, 모델은 사이트에 둔 vendor/mediapipe/blaze_face_short_range.tflite).
   불러오지 못하거나(학교 망·오래된 폰) 녹화 중 한 번이라도 얼굴 찾기가 멈추면 masker.ok() = false → 그 장면은 보내지 않는다.

   await FilmRocketFace.load()  → true/false
   const mk = FilmRocketFace.masker('🐻');  mk.frame(video, W, H) → 덮을 상자들 (캔버스 좌표);  mk.draw(g);  mk.ok() */
(function (root) {
    'use strict';
    var MP_VER = '0.10.14';
    var MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER;
    var MODEL = (function () { try { return new URL('../vendor/mediapipe/blaze_face_short_range.tflite', location.href).href; } catch (e) { return ''; } })();
    var EVERY = 2;          // 2장면마다 얼굴 찾기 (나머지 장면은 마지막 상자를 그대로)
    var HOLD_MS = 500;      // 얼굴을 놓쳐도 0.5초는 그 자리를 계속 가림
    var GROW = 1.7;         // 찾은 상자보다 넉넉히 (머리카락·움직임)
    var state = 'off', det = null, loading = null;

    function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('시간 초과')); }, ms); }); }
    function load() {
        if (state === 'ok') return Promise.resolve(true);
        if (state === 'fail') return Promise.resolve(false);
        if (loading) return loading;
        state = 'loading';
        loading = (async function () {
            try {
                var vision = await Promise.race([import(MP_BASE + '/vision_bundle.mjs'), timeout(20000)]);
                var fileset = await Promise.race([vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm'), timeout(20000)]);
                var make = function (delegate) {
                    return vision.FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL, delegate: delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.35 });
                };
                try { det = await Promise.race([make('GPU'), timeout(30000)]); } catch (e) { det = await Promise.race([make('CPU'), timeout(30000)]); }
                if (!det || typeof det.detectForVideo !== 'function') throw new Error('얼굴 찾기 없음');
                state = 'ok';
                return true;
            } catch (e) {
                det = null; state = 'fail';
                return false;
            } finally { loading = null; }
        })();
        return loading;
    }

    function masker(emoji) {
        var boxes = [], n = 0, lastTs = 0, broken = false, used = false;
        function detect(video, W, H, now) {
            var vw = video.videoWidth, vh = video.videoHeight;
            if (!vw || !vh) return;
            var ts = Math.max(lastTs + 1, Math.round(now)); lastTs = ts;
            var res;
            try { res = det.detectForVideo(video, ts); } catch (e) { broken = true; return; }
            var sx = W / vw, sy = H / vh;
            ((res && res.detections) || []).forEach(function (d) {
                var b = d && d.boundingBox; if (!b || !(b.width > 0)) return;
                var cx = (b.originX + b.width / 2) * sx, cy = (b.originY + b.height / 2) * sy;
                var r = Math.max(b.width * sx, b.height * sy) / 2 * GROW;
                // 같은 얼굴이면 새 자리로 옮김, 아니면 새 상자
                var hit = boxes.filter(function (o) { return Math.hypot(o.cx - cx, o.cy - cy) < o.r + r; })[0];
                if (hit) { hit.cx = cx; hit.cy = cy - r * 0.08; hit.r = Math.max(r, hit.r * 0.85); hit.seen = now; }
                else boxes.push({ cx: cx, cy: cy - r * 0.08, r: r, seen: now });
            });
        }
        return {
            // 이 장면에서 덮을 상자들. 얼굴 찾기를 못 쓰면 덮을 수 없음 → ok() 가 false
            frame: function (video, W, H) {
                var now = performance.now();
                used = true;
                if (state !== 'ok' || !det) { broken = true; return []; }
                if (n++ % EVERY === 0 || !boxes.length) detect(video, W, H, now);
                boxes = boxes.filter(function (o) { return now - o.seen <= HOLD_MS; });
                return boxes;
            },
            draw: function (g) {
                boxes.forEach(function (o) {
                    g.save();
                    g.fillStyle = '#ffd54f'; g.strokeStyle = '#f57f17'; g.lineWidth = Math.max(2, o.r * 0.08);
                    g.beginPath(); g.arc(o.cx, o.cy, o.r, 0, Math.PI * 2); g.fill(); g.stroke();
                    g.font = Math.round(o.r * 1.35) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
                    g.textAlign = 'center'; g.textBaseline = 'middle';
                    g.fillText(emoji || '🙂', o.cx, o.cy + o.r * 0.06);
                    g.restore();
                });
            },
            // 녹화를 새로 시작할 때 (이 녹화 동안 얼굴 찾기가 멈추지 않았는지 새로 셈)
            reset: function () { broken = false; used = false; n = 0; },
            ok: function () { return state === 'ok' && !!det && !broken && used; },
            count: function () { return boxes.length; }
        };
    }
    // 팀마다 다른 캐릭터 (팀 번호 순서)
    var EMOJI = ['🐻', '🐰', '🦊', '🐼', '🐯', '🐸', '🐵', '🐱', '🐶', '🐧', '🐨', '🦁'];
    function emojiFor(jo) { var i = (Math.round(Number(jo)) || 1) - 1; return EMOJI[((i % EMOJI.length) + EMOJI.length) % EMOJI.length]; }

    root.FilmRocketFace = { load: load, masker: masker, state: function () { return state; }, emojiFor: emojiFor, MP_VER: MP_VER, MODEL: MODEL };
})(typeof self !== 'undefined' ? self : this);
