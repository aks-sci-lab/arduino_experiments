// 필름통 로켓 🎯 도전 장면 사진·영상 (2026-11-23 선생님 "시간 도전과 높이 도전에서 사진이나 동영상을 확인할 수 있게해",
//  "도전하면 저절로 수집으로 하고, 웹앱 스마트폰으로 촬영시 얼굴이 있으면 인식해서 자동으로 캐릭터로 가리도록", 수업을 마치면 지움,
//  "결과판에서 최고 높이는 필요 없어") — Playwright, 가짜 저장소, 크롬 가짜 카메라(자홍색 네모 = 가짜 얼굴이 움직이는 영상), 가짜 얼굴 찾기
//  ① 얼굴 찾기가 되는 폰: 도전 녹화 → 보낸 사진에 '얼굴'(자홍색)이 하나도 없고 캐릭터(노란 원)가 있음, 영상도 감
//  ①' 보내기 전 팀이 확인 (2026-11-23 선생님 결정): 확인 화면 → '✅ 보내기' 를 누를 때만 보냄, '🙈 보내지 않기' → 결과판 '📷 안 보냄'
//  ② 얼굴 찾기를 못 불러온 폰: 아무것도 보내지 않음 → 결과판 '📷 없음(얼굴 가리기 못 함)'
//  ③ 결과판: 최고 높이 칸 없음, 📷 ▶ 는 누를 때만 읽어 크게, 4K·375px
//  ④ 수업 마치기 → 도전 장면 모두 지움
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = {}; } update() {} destroy() {} resize() {} };';
const SHOTS = process.env.PRESENT_SHOTS || '';

// 회색 바탕에 자홍색 네모(가짜 얼굴)가 좌우로 움직이는 y4m (크롬 가짜 카메라가 되풀이 재생)
function makeY4m(file) {
    const W = 320, H = 240, N = 60, parts = [Buffer.from('YUV4MPEG2 W' + W + ' H' + H + ' F30:1 Ip A1:1 C420jpeg\n')];
    for (let f = 0; f < N; f++) {
        const Y = Buffer.alloc(W * H, 128), U = Buffer.alloc(W * H / 4, 128), V = Buffer.alloc(W * H / 4, 128);
        const x0 = 50 + Math.round(100 * Math.abs(Math.sin(f / N * Math.PI))), y0 = 60, s = 90;
        for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) Y[y * W + x] = 105;
        for (let y = y0 / 2; y < (y0 + s) / 2; y++) for (let x = Math.floor(x0 / 2); x < (x0 + s) / 2; x++) { U[y * W / 2 + x] = 212; V[y * W / 2 + x] = 235; }
        parts.push(Buffer.from('FRAME\n'), Y, U, V);
    }
    fs.writeFileSync(file, Buffer.concat(parts));
}
// 가짜 MediaPipe: 그 장면에서 자홍색 화소를 둘러싼 상자를 '얼굴'로 돌려줌
const FAKE_VISION = `
export const FilesetResolver = { forVisionTasks: async () => ({}) };
export const FaceDetector = { createFromOptions: async (fs, o) => {
  window.__faceModel = o && o.baseOptions && o.baseOptions.modelAssetPath;
  const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
  return { detectForVideo(v, ts) {
    window.__faceCalls = (window.__faceCalls || 0) + 1;
    const w = v.videoWidth, h = v.videoHeight; if (!w) return { detections: [] };
    cv.width = w; cv.height = h; g.drawImage(v, 0, 0); const d = g.getImageData(0, 0, w, h).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const i = (y * w + x) * 4;
      if (d[i] > 170 && d[i + 1] < 110 && d[i + 2] > 170) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } }
    return { detections: x1 < 0 ? [] : [{ boundingBox: { originX: x0, originY: y0, width: x1 - x0 + 2, height: y1 - y0 + 2 } }] };
  } };
} };`;

test('로켓 도전 장면: 얼굴을 캐릭터로 가려 보냄·못 가리면 안 보냄·결과판 📷 ▶·수업 마치면 지움', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const y4m = path.join(os.tmpdir(), 'rocket-face-' + process.pid + '.y4m'); makeY4m(y4m);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'application/octet-stream') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + y4m, '--autoplay-policy=no-user-gesture-required'] });
    const errors = [];
    const ctx = async (opt, name, o) => {
        o = o || {};
        const c = await browser.newContext(Object.assign({ permissions: ['camera'] }, opt));
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => {
            const u = r.request().url();
            if (/tasks-vision/.test(u)) return o.face ? r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: /vision_bundle/.test(u) ? FAKE_VISION : '' }) : r.abort();
            r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' });
        });
        await c.route(/gstatic/, r => r.abort());
        await c.addInitScript(t => { if (t) localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); }, !!o.teacher);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const go = (pg, id, t) => pg.waitForSelector('#ev-app[data-screen="' + id + '"]', { timeout: t || 15000 });
    const mediaDocs = () => { const out = []; app.db.docs.forEach((d, p) => { if (/\/media\//.test(p)) out.push(Object.assign({ _path: p }, d)); }); return out; };
    const mediaReads = () => app.calls.filter(x => x.body && x.body.action === 'mediaGet').length;
    // 1차시 도전: 녹화(시계 시작 → 1.5초 → 끝) → 끝 장면 고르기 → 결과
    const challengeT1 = async P => {
        await P.evaluate(() => window.__filmRocket.show('t1-ch-measure'));
        await go(P, 't1-ch-measure');
        await P.click('#ev-m-rec');
        await P.waitForFunction(() => { const c = document.getElementById('ev-cam'); return c && c.width > 0; }, null, { timeout: 15000 });
        await P.waitForTimeout(600);
        const tip = await P.textContent('#ev-face');
        await P.click('#ev-r1'); await P.waitForTimeout(300);
        await P.click('#ev-r2'); await P.waitForTimeout(1800);
        await P.click('#ev-r3');
        await P.waitForSelector('#ev-vid', { timeout: 15000 });
        await P.waitForFunction(() => /초/.test(document.getElementById('ev-clock').textContent), null, { timeout: 15000 });
        await P.fill('#ev-scrub', '1000'); await P.dispatchEvent('#ev-scrub', 'input');
        await P.waitForTimeout(600);
        await P.click('.ev-frames [data-f="-1"]'); await P.waitForTimeout(300);
        await P.click('#ev-pick');
        return tip;
    };
    try {
        const c = await app.post({ action: 'createClass', ban: 2, mode: 'team', nTeams: 4, exp: 'rocket' });
        const famUrl = ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space;
        // ---- 팀 A: 얼굴 찾기 됨 ----
        const A = await ctx(devices['iPhone 13'], 'A', { face: true });
        await A.goto(famUrl); await go(A, 'enter');
        assert.match(await A.textContent('.ev-screen'), /도전 장면은 얼굴을 캐릭터로 가리고, 팀이 확인한 뒤에만 선생님께 보내요\. 수업이 끝나면 지워져요\./, '입장 화면 안내');
        await A.fill('#ev-name', '별빛가족'); await A.click('#ev-start'); await go(A, 'think-intro');
        await A.evaluate(() => window.__filmRocket.show('t1-challenge'));
        await A.waitForFunction(() => window.FilmRocketFace.state() === 'ok', null, { timeout: 15000 });
        assert.match(await A.evaluate(() => window.__faceModel), /vendor\/mediapipe\/blaze_face_short_range\.tflite$/, '모델은 사이트에 둔 파일');
        assert.match(await challengeT1(A), /얼굴은 캐릭터로 가려져요 · 도전 장면은 확인한 뒤 선생님께 보내요/, '카메라 아래 한 줄');
        // 확인 화면: 가린 사진·영상을 크게, 누르기 전에는 아무것도 안 보냄
        await go(A, 't1-ch-check');
        await A.waitForSelector('#ev-chk-img', { timeout: 40000 });
        await A.waitForSelector('#ev-chk-send:not([disabled])');
        assert.equal(await A.locator('#ev-chk-vid').count(), 1, '영상도 확인');
        assert.equal(mediaDocs().length, 0, '확인 전에는 서버에 없음');
        assert.match(await A.textContent('.ev-screen'), /얼굴이 다 가려졌나요/);
        const ib = await A.evaluate(() => { const r = document.getElementById('ev-chk-img').getBoundingClientRect(); return r.width / innerWidth; });
        assert.ok(ib > 0.4, '사진을 크게: ' + ib);
        assert.ok(await A.evaluate(() => document.getElementById('ev-chk-skip').getBoundingClientRect().bottom <= innerHeight), '두 단추가 한 화면에');
        assert.equal(await A.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '확인 화면 375px');
        if (SHOTS) await A.screenshot({ path: path.join(SHOTS, 'phone-media-check.png') });
        await A.click('#ev-chk-send');
        await go(A, 't1-ch-result');
        await A.waitForFunction(() => /보냈어요/.test((document.getElementById('ev-media-t1') || {}).textContent || ''), null, { timeout: 40000 });
        assert.ok(await A.evaluate(() => window.__faceCalls) > 5, '녹화 동안 얼굴 찾기를 여러 번');
        assert.equal(await A.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px 가로 스크롤 없음');
        if (SHOTS) await A.screenshot({ path: path.join(SHOTS, 'phone-media-sent.png') });
        let docs = mediaDocs();
        assert.deepEqual(docs.map(d => d._path.split('/').pop()).sort(), ['1~t1~photo', '1~t1~video'], '사진·영상 문서: ' + docs.map(d => d._path));
        const photo = docs.find(d => d.kind === 'photo'), video = docs.find(d => d.kind === 'video');
        assert.match(photo.data, /^data:image\/jpeg;base64,/); assert.ok(photo.data.length <= 220000, '사진 크기 ' + photo.data.length);
        assert.match(video.data, /^data:video\/(webm|mp4);base64,/); assert.ok(video.data.length <= 900000, '영상 크기 ' + video.data.length);
        assert.equal(photo.masked, true); assert.ok(photo.expireAt.getTime() - Date.now() < 8 * 86400000, '7일 뒤 지움');
        // 보낸 사진에 얼굴(자홍색) 화소가 없고 캐릭터(노란 원)가 있음
        const px = await A.evaluate(async d => {
            const img = new Image(); img.src = d; await img.decode();
            const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
            const g = cv.getContext('2d'); g.drawImage(img, 0, 0); const a = g.getImageData(0, 0, cv.width, cv.height).data;
            let face = 0, mask = 0;
            for (let i = 0; i < a.length; i += 4) { if (a[i] > 170 && a[i + 1] < 110 && a[i + 2] > 170) face++; if (a[i] > 220 && a[i + 1] > 180 && a[i + 1] < 235 && a[i + 2] < 140) mask++; }
            return { face, mask, w: cv.width, h: cv.height };
        }, photo.data);
        assert.equal(px.face, 0, '보낸 사진에 가리지 않은 얼굴 화소 없음: ' + JSON.stringify(px));
        assert.ok(px.mask > 500, '캐릭터로 가린 자리: ' + JSON.stringify(px));
        assert.ok(Math.max(px.w, px.h) <= 640, '사진 긴 변 640px');
        // 폰의 결과 요약에 '도전 장면' 표시 (교사 결과판 📷 ▶)
        await A.waitForFunction(() => window.__filmRocket.state().media && window.__filmRocket.state().media.t1 === 'v');

        // ---- 팀 B: 얼굴 찾기를 못 불러옴 (학교 망에서 막힘) → 녹화는 되지만 아무것도 안 보냄 ----
        const B = await ctx(devices['Pixel 7'], 'B', { face: false });
        await B.goto(famUrl); await go(B, 'enter');
        await B.fill('#ev-name', '달님가족'); await B.click('#ev-start'); await go(B, 'think-intro');
        await B.evaluate(() => window.__filmRocket.show('t1-challenge'));
        await B.waitForFunction(() => window.FilmRocketFace.state() === 'fail', null, { timeout: 30000 });
        assert.match(await challengeT1(B), /얼굴 가리기를 쓸 수 없어요 · 도전 장면은 보내지 않아요/, '못 쓰면 미리 알림');
        await go(B, 't1-ch-result');   // 못 가린 녹화는 확인 화면도 없이 결과로
        await B.waitForFunction(() => /보내지 않았어요/.test((document.getElementById('ev-media-t1') || {}).textContent || ''), null, { timeout: 15000 });
        assert.equal(mediaDocs().filter(d => d.jo === 2).length, 0, '얼굴을 못 가린 팀은 서버에 아무것도 없음');
        assert.equal(await B.evaluate(() => window.__filmRocket.state().media.t1), 'x');

        // ---- 팀 C: 얼굴 찾기는 되지만 팀이 확인하고 '🙈 보내지 않기' ----
        const C2 = await ctx(devices['iPhone 13'], 'C', { face: true });
        await C2.goto(famUrl); await go(C2, 'enter');
        await C2.fill('#ev-name', '해님가족'); await C2.click('#ev-start'); await go(C2, 'think-intro');
        await C2.evaluate(() => window.__filmRocket.show('t1-challenge'));
        await C2.waitForFunction(() => window.FilmRocketFace.state() === 'ok', null, { timeout: 15000 });
        await challengeT1(C2);
        await go(C2, 't1-ch-check');
        await C2.waitForSelector('#ev-chk-img', { timeout: 40000 });
        await C2.click('#ev-chk-skip');
        await go(C2, 't1-ch-result');
        assert.match(await C2.textContent('#ev-media-t1'), /보내지 않았어요/);
        assert.equal(await C2.evaluate(() => window.__filmRocket.state().media.t1), 'n');
        await C2.waitForTimeout(1500);
        assert.equal(mediaDocs().filter(d => d.jo === 3).length, 0, '보내지 않기 → 서버에 없음');
        assert.equal(app.items('rocket').filter(x => /"challenge":\[\{/.test(x.data || '') ).length >= 1, true, '도전 결과 숫자는 보냄');

        // ---- 교사 결과판: 최고 높이 칸 없음, 📷 ▶ 는 누를 때만 읽음 ----
        const T = await ctx({ viewport: { width: 3840, height: 2160 } }, 'T', { teacher: true });
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=run');
        await T.waitForFunction(() => document.querySelectorAll('#board [data-media]').length >= 2 && /📷 없음\(얼굴 가리기 못 함\)/.test(document.getElementById('board').textContent) && /해님가족[\s\S]*📷 안 보냄|📷 안 보냄[\s\S]*해님가족/.test(document.getElementById('board').textContent), null, { timeout: 30000 });
        const head = await T.textContent('#board thead');
        assert.doesNotMatch(head, /최고 높이/, '최고 높이 칸 뺌');
        assert.match(head, /⏱ 시간 도전[\s\S]*🎯 높이 도전/);
        assert.match(await T.textContent('#board'), /달님가족[\s\S]*📷 없음\(얼굴 가리기 못 함\)|📷 없음\(얼굴 가리기 못 함\)[\s\S]*달님가족/);
        assert.equal(mediaReads(), 0, '결과판을 그릴 때는 도전 장면을 읽지 않음');
        assert.equal(await T.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '4K 가로 스크롤 없음');
        await T.click('#board [data-media="1~t1~photo"]');
        await T.waitForSelector('#ctMediaBody img', { timeout: 15000 });
        assert.equal(mediaReads(), 1, '누른 하나만 읽음');
        const bx = await T.evaluate(() => { const r = document.querySelector('#ctMedia .ct-media-in').getBoundingClientRect(); return { ok: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, w: document.querySelector('#ctMediaBody img').naturalWidth }; });
        assert.ok(bx.ok && bx.w > 0, '사진이 화면 안에 크게: ' + JSON.stringify(bx));
        if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'teacher-media-photo.png') });
        await T.keyboard.press('Escape'); assert.equal(await T.isVisible('#ctMedia'), false, 'Esc 로 닫기');
        await T.click('#board [data-media="1~t1~video"]');
        await T.waitForSelector('#ctMediaBody video', { timeout: 15000 });
        assert.match(await T.getAttribute('#ctMediaBody video', 'src'), /^data:video\//);
        await T.click('#ctMediaClose');
        assert.equal(mediaReads(), 2);
        // 노트북 1280 에서도 가로 스크롤 없음
        await T.setViewportSize({ width: 1280, height: 720 }); await T.waitForTimeout(300);
        assert.equal(await T.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '1280 가로 스크롤 없음');

        // ---- 수업 마치기 → 도전 장면 모두 지움 ----
        const done = await app.post({ action: 'classDone', space: c.space, done: true });
        assert.equal(done.ok, true); assert.equal(done.mediaDeleted, 2);
        assert.equal(mediaDocs().length, 0, '수업 마치면 도전 장면 0');
        const again = await app.post({ action: 'mediaGet', space: c.space, jo: 1, part: 't1', kind: 'photo' });
        assert.equal(again.media, null);
        // 마친 수업에는 더 보내지 못함
        const late = await app.handle({ action: 'mediaSave', space: c.space, 'class': c.classCode, jo: 1, part: 't1', kind: 'photo', data: photo.data }, { uid: 'x' });
        assert.equal(late.ok, false);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); api.close(); stat.close();
        try { fs.unlinkSync(y4m); } catch (e) { /* 무시 */ }
    }
});
