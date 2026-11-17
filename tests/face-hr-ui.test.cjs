// 얼굴 심박(rPPG) 개발 페이지 (projects/face-hr-lab.html): 가짜 얼굴 영상 + 가짜 손가락 영상 + 가짜 Apps Script
//  가짜 얼굴: canvas 피부색 타원 + 미세 맥동(75회/분) + 조명 출렁임(1.55 Hz, 심박 범위 안) + 약간 움직임
//  A. 같은 폰 앞·뒤 카메라 동시 열기 성공 → 30초 측정 → POS·CHROM 오차 < GREEN 오차, 375px·44px
//  B. 동시 열기 실패(NotReadableError) → 실패 문구 기록 → 두 번째 폰 자동 선택 → 폰에서 손가락 → 얼굴 폰에 정답 붙음
//  얼굴 찾기(MediaPipe)는 시험 환경에서 내려받지 못하게 막아 '안내 타원'으로 돈다
const http = require('http'), path = require('path'), fs = require('fs');
const REPO = path.join(__dirname, '..');
const { loadCodeGs } = require(REPO + '/tests/fake-apps-script.cjs');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require(REPO + '/js/face-hr-math.js');

const app = loadCodeGs();
// 서버 9판(heartrate 허용) 전까지 시험에서만 허용 목록에 더함
app.ctx.GENERIC_EXPS.heartrate = 1; app.ctx.CLASS_EXPS.heartrate = 1;
const api = http.createServer((req, res) => {
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    const u = new URL(req.url, 'http://x');
    if (req.method === 'GET') return send(app.get(Object.fromEntries(u.searchParams)));
    let b = ''; req.on('data', c => b += c); req.on('end', () => send(app.post(b)));
});
const stat = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = path.join(REPO, decodeURIComponent(u.pathname));
    fs.readFile(p, (e, d) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d);
    });
});
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';

// 가짜 카메라. rear: 'ok'(손가락 영상) | 'fail'(NotReadableError) | 'finger'(이 기기는 뒤 카메라만 = 두 번째 폰)
function fakeCams(bpm, rear) {
    return `(() => {
        const BPM = ${bpm}, REAR = ${JSON.stringify(rear)};
        window.__gum = [];
        function faceStream() {
            const W = 160, H = 120, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const c = cv.getContext('2d'), img = c.createImageData(W, H), t0 = performance.now();
            const PBV = [0.33 / 0.77, 1, 0.53 / 0.77], base = [182, 132, 108];
            const draw = () => {
                const t = (performance.now() - t0) / 1000, ph = 2 * Math.PI * BPM / 60 * t;
                const p = Math.sin(ph) + 0.35 * Math.sin(2 * ph - 0.6);
                const I = 1 + 0.012 * Math.sin(2 * Math.PI * 1.55 * t);           // 조명 출렁임 (흰빛)
                const dx = 1.5 * Math.sin(2 * Math.PI * 0.2 * t);                    // 약간 움직임
                const col = base.map((b, k) => b * I * (1 + 0.004 * PBV[k] * p));
                const cx = W / 2 + dx, cy = H * 0.47, ry = H * 0.34, rx = ry * 0.75, d = img.data;
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                    const i = (y * W + x) * 4, e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
                    if (e <= 1) { for (let k = 0; k < 3; k++) d[i + k] = col[k] + (Math.random() - 0.5) * 6; }
                    else { d[i] = d[i + 1] = d[i + 2] = 50 * I; }
                    d[i + 3] = 255;
                }
                c.putImageData(img, 0, 0);
            };
            draw(); setInterval(draw, 30);
            return cv.captureStream(30);
        }
        function fingerStream() {
            const cv = document.createElement('canvas'); cv.width = 80; cv.height = 60;
            const c = cv.getContext('2d'), t0 = performance.now();
            const draw = () => {
                const t = (performance.now() - t0) / 1000, ph = (t * BPM / 60) % 1;
                const p = Math.exp(-(((ph - 0.15) / 0.09) ** 2)) + 0.35 * Math.exp(-(((ph - 0.5) / 0.08) ** 2));
                const k = 1 - 0.05 * p;
                c.fillStyle = 'rgb(' + Math.round(200 * k) + ',' + Math.round(35 * k) + ',' + Math.round(25 * k) + ')';
                c.fillRect(0, 0, 80, 60);
            };
            draw(); setInterval(draw, 16);
            return cv.captureStream(30);
        }
        navigator.mediaDevices.getUserMedia = async (c) => {
            const fm = c && c.video && c.video.facingMode, env = fm && (fm.exact === 'environment' || fm.ideal === 'environment');
            window.__gum.push(env ? 'env' : 'user');
            if (REAR === 'finger') return fingerStream();
            if (env) {
                if (REAR === 'fail') throw new DOMException('Could not start video source', 'NotReadableError');
                return fingerStream();
            }
            return faceStream();
        };
    })();`;
}

test('얼굴 심박 개발 페이지: 동시 카메라 → 측정·비교, 실패 → 두 번째 폰, 375px', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    async function ctx(opt, name, cam) {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.PENDULUM_CONFIG={appsScriptUrl:${JSON.stringify(API)},pollSeconds:3};` }));
        await c.route(/qrcode-generator/, r => r.fulfill({ contentType: 'text/javascript', body: QR }));
        await c.route(/gstatic|jsdelivr|storage\.googleapis/, r => r.abort());
        if (cam) await c.addInitScript(cam);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message));
        pg.on('dialog', d => d.accept());
        return pg;
    }
    const layout = async (pg, n) => {
        const ov = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.equal(ov, 0, n + ' 가로 스크롤');
        const small = await pg.evaluate(() => [...document.querySelectorAll('button, select, .btn, .cs-btn, input[type=number]')]
            .filter(e => e.offsetParent && !e.closest('td, th') && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim().slice(0, 20)));
        assert.deepEqual(small, [], n + ' 44px 보다 작은 단추');
    };
    const shot = async (pg, name) => { if (process.env.SHOT_DIR) await pg.screenshot({ path: process.env.SHOT_DIR + '/' + name + '.png', fullPage: true }).catch(() => {}); };
    const mobile = { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true };

    // ---------------- A. 같은 폰 동시 열기 성공 ----------------
    const A = await ctx(mobile, 'A', fakeCams(75, 'ok'));
    await A.goto(ROOT + 'projects/face-hr-lab.html');
    assert.equal(await A.getAttribute('meta[name=robots]', 'content'), 'noindex, nofollow');
    assert.equal(await A.isDisabled('#cam'), true, '안내에 동의해야 카메라');
    for (const t of ['prep', 'measure', 'analysis', 'io', 'help']) { await A.click(`#tabs [data-tab=${t}]`); await A.waitForTimeout(80); await layout(A, '375px ' + t); }
    await A.click('#tabs [data-tab=prep]');
    await A.check('#consent');
    await A.click('#cam');
    await A.waitForFunction(() => /안내 타원/.test(document.getElementById('st-det').textContent), null, { timeout: 25000 });
    await A.click('#auto');
    await A.waitForFunction(() => document.querySelector('.path-pick [data-path=dual]').getAttribute('aria-pressed') === 'true', null, { timeout: 10000 });
    assert.match(await A.textContent('#path-log'), /동시 열기 성공/);
    assert.match(await A.textContent('#dual-st'), /함께 돌아요/);
    await A.click('#tabs [data-tab=measure]');
    await A.selectOption('#dur', '30');
    await A.click('#start');
    await A.waitForTimeout(16000);
    assert.notEqual(await A.textContent('#bpm-pos'), '--', '측정 중 POS 숫자');
    assert.notEqual(await A.textContent('#bpm-gt'), '--', '측정 중 정답 숫자');
    await layout(A, '375px 측정 중');
    await A.waitForFunction(() => window.__faceHr.session() && window.__faceHr.session().frames.length > 0 && !document.getElementById('a-table').closest('[hidden]'), null, { timeout: 40000 });
    const sA = await A.evaluate(() => window.__faceHr.session());
    const resA = F.analyze(sA.frames), truthA = F.truthSeries(sA.truth);
    const rowsA = Object.fromEntries(F.table(resA, truthA).filter(r => r.roi === 'all').map(r => [r.method, r]));
    console.log('A: 프레임', sA.frames.length, resA.fps + 'fps', '정답', truthA.length, '점 평균', F.round(F.mean(truthA.map(x => x.bpm)), 1),
        '| GREEN', rowsA.green.mae, 'CHROM', rowsA.chrom.mae, 'POS', rowsA.pos.mae);
    assert.equal(sA.truth.source, 'dual');
    assert.equal(sA.meta.detector, 'oval');
    assert.ok(sA.frames.length > 400, '프레임 ' + sA.frames.length);
    assert.ok(sA.truth.finger.length > 400, '손가락 ' + sA.truth.finger.length);
    assert.ok(Math.abs(F.mean(truthA.map(x => x.bpm)) - 75) < 3, '정답 ≈ 75');
    assert.ok(rowsA.pos.mae < rowsA.green.mae, 'POS < GREEN');
    assert.ok(rowsA.chrom.mae < rowsA.green.mae, 'CHROM < GREEN');
    assert.ok(rowsA.pos.mae < 5, 'POS 오차 ' + rowsA.pos.mae);
    // 화면 표
    assert.equal(await A.locator('#a-table tbody tr').count(), 12);
    assert.match(await A.textContent('#a-table tbody tr.best'), /POS|CHROM/);
    assert.match(await A.textContent('#a-src'), /① 같은 폰 뒤 카메라/);
    // 영상은 저장하지 않음: 프레임 자료에는 숫자만
    assert.deepEqual(Object.keys(sA.frames[5]).sort(), ['et', 'iso', 'm', 'rois', 't', 'y']);
    for (const t of ['prep', 'measure', 'analysis', 'io', 'help']) { await A.click(`#tabs [data-tab=${t}]`); await A.waitForTimeout(80); await layout(A, '375px 측정 뒤 ' + t); }
    await A.click('#tabs [data-tab=analysis]'); await shot(A, 'face-375-analysis');
    // 내보내기 → 다시 불러오기
    await A.click('#tabs [data-tab=io]');
    const [dl] = await Promise.all([A.waitForEvent('download'), A.click('#ex-csv')]);
    const csvPath = path.join(require('os').tmpdir(), 'face-hr-test.csv');
    await dl.saveAs(csvPath);
    const parsed = F.parseCsv(fs.readFileSync(csvPath, 'utf8'));
    assert.equal(parsed.frames.length, sA.frames.length);
    assert.equal(parsed.truth.finger.length, sA.truth.finger.length);
    await A.click('#sim');
    assert.match(await A.textContent('#a-src'), /시뮬레이션/);
    await A.setInputFiles('#im-file', csvPath);
    await A.waitForFunction(() => /face-hr-test\.csv/.test(document.getElementById('a-src').textContent));
    assert.equal(await A.locator('#a-table tbody tr').count(), 12);

    // ---------------- B. 동시 열기 실패 → 두 번째 폰 ----------------
    const B = await ctx({ viewport: { width: 412, height: 900 }, isMobile: true, hasTouch: true }, 'B', fakeCams(75, 'fail'));
    await B.goto(ROOT + 'projects/face-hr-lab.html');
    await B.check('#consent'); await B.click('#cam');
    await B.waitForFunction(() => /안내 타원/.test(document.getElementById('st-det').textContent), null, { timeout: 25000 });
    await B.click('#auto');
    await B.waitForFunction(() => document.querySelector('.path-pick [data-path=phone2]').getAttribute('aria-pressed') === 'true', null, { timeout: 10000 });
    const logB = await B.textContent('#path-log');
    assert.match(logB, /NotReadableError: Could not start video source/, '실패 문구 그대로');
    assert.match(logB, /두 번째 폰/);
    assert.equal(await B.isVisible('#share-mount'), true);
    assert.equal(await B.evaluate(() => window.__gum.join(',')), 'user,env');
    await B.fill('#cs-group', '9-9-4821'); await B.press('#cs-group', 'Enter');
    await B.waitForTimeout(300);
    await B.click('#cs-phone');
    await B.waitForSelector('.cs-dlg:not([hidden])');
    const link = await B.getAttribute('#cs-plink', 'href');
    assert.match(link, /face-hr-lab\.html\?role=phone&group=9-9-4821/);
    await B.click('#cs-pclose');
    await B.click('#clock');
    await B.waitForFunction(() => /서버보다/.test(document.getElementById('clock-st').textContent), null, { timeout: 10000 });

    // 두 번째 폰: 손가락
    const P = await ctx({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true }, 'P', fakeCams(75, 'finger'));
    await P.goto(link);
    assert.equal(await P.isVisible('#phone-view'), true);
    assert.equal(await P.isVisible('#main-view'), false);
    await P.click('#p-cam');
    await P.waitForFunction(() => !document.getElementById('p-start').disabled);
    await P.click('#p-start');
    await P.waitForFunction(() => /서버보다/.test(document.getElementById('p-clock').textContent), null, { timeout: 10000 });
    await layout(P, '두 번째 폰 측정 중');
    await shot(P, 'face-phone2');
    // 얼굴 폰 측정 (30초)
    await B.click('#tabs [data-tab=measure]');
    await B.selectOption('#dur', '30');
    await B.click('#start');
    await B.waitForFunction(() => window.__faceHr.session() && window.__faceHr.session().meta.path === 'phone2', null, { timeout: 45000 });
    await P.click('#p-stop');
    await P.waitForFunction(() => /보냈|못했/.test(document.body.textContent) && !/보내는 중/.test(document.getElementById('cs-pmsg') ? document.getElementById('cs-pmsg').textContent : ''), null, { timeout: 20000 }).catch(() => {});
    const rows = app.get({ action: 'list', exp: 'heartrate', group: '9-9-4821' }).items;
    console.log('시트:', rows.map(r => r.id + ' n=' + r.n + ' ' + JSON.stringify(r.summary)));
    assert.ok(rows.some(r => r.n > 300 && /손가락/.test(r.title)), '손가락 자료가 시트에');
    assert.equal(rows.filter(r => /-clock$/.test(r.id)).length, 2, '시계 맞추기 줄은 기기마다 하나 (n=0)');
    // 얼굴 폰이 자동 불러오기로 받아 붙임
    await B.waitForFunction(() => (window.__faceHr.session().truth.finger || []).length > 300, null, { timeout: 25000 });
    const sB = await B.evaluate(() => window.__faceHr.session());
    const resB = F.analyze(sB.frames), truthB = F.truthSeries(sB.truth);
    const posB = F.table(resB, truthB).find(r => r.method === 'pos' && r.roi === 'all');
    console.log('B: 정답', truthB.length, '점', sB.truth.note, '| POS', posB.mae);
    assert.ok(truthB.length > 10);
    assert.ok(Math.abs(F.mean(truthB.map(x => x.bpm)) - 75) < 3);
    assert.ok(posB.mae < 6, 'POS 오차 ' + posB.mae);
    assert.match(sB.truth.note, /서버 왕복으로 맞춤/);
    await B.click('#tabs [data-tab=analysis]');
    assert.match(await B.textContent('#a-src'), /② 두 번째 폰/);
    await layout(B, '412px 분석');
    await shot(B, 'face-412-phone2-analysis');

    assert.deepEqual(errors, []);
    await browser.close(); api.close(); stat.close();
});
