// 스마트폰 카메라 심박수 한 화면 페이지 (projects/heart-rate.html): 가짜 카메라(canvas 로 만든 맥파 영상)
//  A. 노출 고정이 되는 폰(Pixel 7): 잠금 → 1.5초 확인 → 🔒 고정됨 → 75 회/분, 손목 비교, CSV(locked 1)
//  B. '고정된다'고 하지만 노출이 분당 40회로 계속 출렁이는 폰(실제 심박 67): 확인 단계에서 '고정 안 됨' → 노출 보정 → 67 회/분
//  C. 노출 고정도, 노출 값 읽기도 안 되는 폰(아이폰처럼, 375px): '보정 불가' 표시 → 90 회/분, 시뮬레이션(노출 출렁임) → 67, 가로 스크롤 없음·단추 44px
//  E. 자동 노출 중 노출 값을 틀리게(짧게) 알려 주는 폰: 잠그면 어두워짐 → 밝기 맞추기로 잠그기 전 밝기 ±10% → 🔒
//  F. 셔터·ISO 범위가 좁아 다시 밝힐 수 없는 폰: 맞추기 실패 → 자동 노출 + 보정으로, 까닭 표시
//  G. 선생님 폰처럼 자동 노출 중 ISO 를 27 로 알려 주는 폰: 그대로 잠그면 아주 어두움 → ISO 하한·밝기 맞추기로 ISO 를 올려 고정
//  D. 어두운 곳(손가락 밝기 빨강 ≈ 70): 측정 전 '🌙 어두워요' 안내, 결과·회차에 어두움 표시, CSV light 열 dim
const http = require('http'), path = require('path'), fs = require('fs');
const REPO = path.join(__dirname, '..');
let chromium = null, devices = null;
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const test = require('node:test');
const assert = require('node:assert/strict');

const stat = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = path.join(REPO, decodeURIComponent(u.pathname));
    fs.readFile(p, (e, d) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d);
    });
});

// 가짜 카메라. kind: 'lock'(잠그면 노출이 멈춤) | 'drift'(잠근다고 하지만 노출이 분당 40회로 계속 출렁이고 밝기도 따라감) | 'none'(노출 기능 없음)
function fakeCamera(bpm, kind, scale) {
    return `(() => {
        const BPM = ${bpm}, KIND = ${JSON.stringify(kind)}, SCALE = ${scale || 1};
        window.__applied = [];
        const srgb = l => { const c = Math.min(1, Math.max(0, l)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); };
        let t0 = performance.now();
        const expo = () => KIND === 'drift' ? 1 + 0.3 * Math.sin(2 * Math.PI * 40 / 60 * (performance.now() - t0) / 1000) : 1;
        navigator.mediaDevices.getUserMedia = async () => {
            const cv = document.createElement('canvas'); cv.width = 160; cv.height = 120;
            const c = cv.getContext('2d');
            let st = { exposureMode: 'continuous', exposureTime: 330, iso: 800, whiteBalanceMode: 'continuous', torch: false };
            // stale·capped: 자동 노출 중 getSettings 가 실제(330)보다 짧은 노출(100)을 알려 줌 → 그 값으로 잠그면 어두워짐
            //  잠근 뒤(manual) 밝기 = 실제 쓰는 노출 ÷ 330 × ISO ÷ 800. capped 는 셔터 최대 120·ISO 최대 800 이라 다시 밝힐 수 없음
            const STALE = KIND === 'stale' || KIND === 'capped' || KIND === 'iso27';
            const bf = () => STALE && st.exposureMode === 'manual' ? (st.exposureTime / 330) * (st.iso / 800) : 1;
            t0 = performance.now();
            const draw = () => {
                const t = (performance.now() - t0) / 1000, ph = (t * BPM / 60) % 1;
                const p = Math.exp(-(((ph - 0.15) / 0.09) ** 2)) + 0.35 * Math.exp(-(((ph - 0.5) / 0.08) ** 2));
                const L = (1 - 0.05 * p) * expo() * SCALE * bf();
                // 실제 센서처럼 화소마다 잡음(±1.5 단계)을 섞어, 영역 평균이 0~255 정수 단계보다 고운 값을 갖게 함
                const R = srgb(0.45 * L), G = srgb(0.015 * L), B = srgb(0.008 * L);
                const img = c.createImageData(160, 120), d = img.data;
                for (let i = 0; i < d.length; i += 4) { d[i] = R + 3 * (Math.random() - 0.5); d[i + 1] = G + 3 * (Math.random() - 0.5); d[i + 2] = B + 3 * (Math.random() - 0.5); d[i + 3] = 255; }
                c.putImageData(img, 0, 0);
            };
            draw(); setInterval(draw, 16);
            const stream = cv.captureStream(30), tr = stream.getVideoTracks()[0];
            if (KIND === 'none') { tr.getCapabilities = () => ({ width: { min: 1, max: 160 } }); return stream; }
            const base = tr.getSettings.bind(tr);
            const CAP = KIND === 'capped' ? { et: 120, iso: 800 } : { et: 10000, iso: 3200 };
            tr.getCapabilities = () => ({ exposureMode: ['continuous', 'manual'], exposureTime: { min: 1, max: CAP.et, step: 1 }, iso: { min: 50, max: CAP.iso }, whiteBalanceMode: ['continuous', 'manual'], torch: true });
            tr.getSettings = () => Object.assign(base(), st, KIND === 'drift' ? { exposureTime: 330 * expo() } : {}, STALE && st.exposureMode !== 'manual' ? (KIND === 'iso27' ? { exposureTime: 330, iso: 27 } : { exposureTime: 100 }) : {});
            tr.applyConstraints = async c => { window.__applied.push(JSON.parse(JSON.stringify(c))); (c.advanced || []).forEach(a => Object.assign(st, a)); };
            return stream;
        };
    })();`;
}

test('심박수 한 화면: 노출 고정됨 / 잠금 확인 실패 → 노출 보정 / 보정 불가, 375px', { skip: !chromium && 'playwright 없음', timeout: 360000 }, async () => {
    await new Promise(r => stat.listen(0, r));
    const ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    // 실패해도 브라우저·서버를 닫아 시험이 멈춰 있지 않게
    try {
    async function page(opt, name, cam) {
        const c = await browser.newContext(Object.assign({ acceptDownloads: true }, opt));
        await c.addInitScript(cam);
        c.setDefaultTimeout(15000);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message));
        pg.on('dialog', d => d.accept());
        // 터치 없는 큰 창은 노트북(측정 기능 숨김)으로 보므로, 측정 시험은 기기를 태블릿으로 정함 (폰 에뮬레이션은 저절로 폰)
        await pg.goto(ROOT + 'projects/heart-rate.html' + (opt.hasTouch ? '' : '?device=tablet'));
        return pg;
    }
    const layout = async (pg, n) => {
        assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, n + ' 가로 스크롤');
        const small = await pg.evaluate(() => [...document.querySelectorAll('button, select, .btn, input[type=number], summary')]
            .filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim().slice(0, 20)));
        assert.deepEqual(small, [], n + ' 44px 보다 작은 단추');
    };
    async function measure(pg, dur) {
        console.log('  측정 시작', dur + '초');
        await pg.click('#cam');
        await pg.waitForFunction(() => /좋아요/.test(document.getElementById('v-qtext').textContent), null, { timeout: 10000 });
        await pg.selectOption('#dur', String(dur));
        const n0 = await pg.evaluate(() => window.__heartRate.state().runs.length);
        await pg.click('#start');
        await pg.waitForFunction(n => window.__heartRate.state().runs.length > n, n0, { timeout: (dur + 15) * 1000 });
        return (await pg.evaluate(() => window.__heartRate.state().runs)).pop();
    }

    // ---- A. 노출 고정 되는 폰 ----
    const A = await page(devices['Pixel 7'], 'A', fakeCamera(75, 'lock'));
    assert.equal(await A.textContent('#v-bpm'), '--');
    const a = await measure(A, 15);
    console.log('A 고정:', a.res.bpm, a.res.level, a.lock, a.res.modeText, a.res.fpsMean + '장/초');
    const applied = await A.evaluate(() => window.__applied);
    assert.ok(applied.some(c => c.advanced && c.advanced[0].exposureMode === 'manual' && c.advanced[0].exposureTime === 330 && c.advanced[0].iso === 800), JSON.stringify(applied));
    assert.equal(a.lock, 'locked'); assert.equal(a.res.mode, 'locked');
    assert.ok(Math.abs(a.res.bpm - 75) <= 4, '75 ≈ ' + a.res.bpm);
    assert.match(await A.textContent('#v-lock'), /🔒 고정됨/);
    assert.equal(await A.textContent('#v-bpm'), String(Math.round(a.res.bpm)));
    const est = await A.textContent('#live-est');
    console.log('A 실시간:', est);
    assert.match(est, /계산 신호 /);
    assert.match(await A.textContent('#wave-label'), /빨강\(R\) 밝기 · 노출 보정 전/);
    assert.match(await A.textContent('#msg'), /계산에 쓴 신호: .* · /);
    assert.match(est, /최근 \d+초: (7[2-8]) 회\/분 · 봉우리 \d+개/);
    assert.ok(Number(await A.textContent('#v-ibi')) > 700 && Number(await A.textContent('#v-ibi')) < 900, '박동 간격');
    assert.ok(a.raw.every(f => f[4] === 330 && f[5] === 800), '프레임마다 노출 값');
    await A.fill(`[data-palp="${a.id}"]`, '19'); await A.press(`[data-palp="${a.id}"]`, 'Tab');
    assert.match(await A.textContent('#runs'), /= 76 회\/분/);
    const [dl] = await Promise.all([A.waitForEvent('download'), A.click(`[data-csv="${a.id}"]`)]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    assert.match(csv, /t_s,R,G,Y,Y_corr,exposureTime,iso,locked,light/);
    assert.match(csv.trim().split('\n').pop(), /,330,800,1,ok$/);
    await layout(A, 'A Pixel 7');
    await A.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/heart-a.png' : '/dev/null' }).catch(() => {});

    // ---- B. 잠근다고 하지만 노출이 계속 출렁이는 폰 (실제 심박 67, 노출 40) ----
    const B = await page({ viewport: { width: 1280, height: 860 } }, 'B', fakeCamera(67, 'drift'));
    const b = await measure(B, 30);
    if (process.env.SHOT_DIR) fs.writeFileSync(process.env.SHOT_DIR + '/run-b.json', JSON.stringify(b));
    console.log('B 출렁임:', b.res.bpm, b.res.level, b.lock, b.why, '|', b.res.modeText, '|', b.res.exposure && b.res.exposure.text);
    assert.equal(b.lock, 'unlocked');
    assert.match(b.why, /계속 바뀜|맞출 수 없어/);   // 밝기가 출렁여 맞추기에서 먼저 걸리거나, 값이 계속 바뀜으로 걸림
    assert.equal(b.res.mode, 'corrected');
    assert.match(await B.textContent('#msg'), /노출 보정 뒤 — 실시간 그래프\(빨강 · 보정 전\)와 달라요/);
    assert.ok(Math.abs(b.res.bpm - 67) <= 4, '보정 뒤 67 ≈ ' + b.res.bpm);
    assert.match(await B.textContent('#v-lock'), /고정 안 됨/);
    assert.match(await B.textContent('#v-locktext'), /노출 보정/);
    // 자세히: 보정 전·후 비교 그래프와 노출 그래프
    await B.click(`[data-view="${b.id}"]`);
    await B.waitForTimeout(300);
    assert.equal(await B.isVisible('#res-cmp'), true);
    assert.match(await B.textContent('#res-grid'), /노출 보정/);
    assert.equal(await B.isHidden('#detail-empty'), true);
    assert.match(await B.textContent('#res-why'), /분당 약 40회로 출렁임/);
    const before = await B.evaluate(() => { const H = window.HeartRateMath, r = window.__heartRate.state().runs.slice(-1)[0]; return H.analyze(H.unpack(r.raw)).bpm; });
    console.log('B 보정 전 계산:', before);
    assert.ok(Math.abs(before - 40) <= 5, '보정 전에는 노출 출렁임(40)을 잡음: ' + before);
    await layout(B, 'B 노트북');
    await B.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/heart-b.png' : '/dev/null', fullPage: true }).catch(() => {});

    // ---- C. 노출 기능 없음 (375px) ----
    const C = await page({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true }, 'C', fakeCamera(90, 'none'));
    const c = await measure(C, 15);
    console.log('C 기능 없음:', c.res.bpm, c.lock, c.res.modeText);
    assert.equal(c.res.mode, 'nocorrect');
    assert.ok(Math.abs(c.res.bpm - 90) <= 4, '90 ≈ ' + c.res.bpm);
    assert.match(await C.textContent('#v-locktext'), /보정/);
    assert.equal(await C.isVisible('#torch-wrap'), false);
    assert.match(await C.textContent('#runs'), /보정 불가/);
    // 시뮬레이션: 노출이 고정 안 된 폰 → 보정해서 67
    await C.click('details.sim summary'); await C.fill('#sim-bpm', '67'); await C.check('#sim-exp'); await C.click('#sim');
    const s = (await C.evaluate(() => window.__heartRate.state().runs)).pop();
    console.log('C 시뮬레이션:', s.res.bpm, s.res.mode);
    assert.equal(s.res.mode, 'corrected'); assert.ok(Math.abs(s.res.bpm - 67) <= 3);
    await C.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    await C.waitForTimeout(200);
    await layout(C, 'C 375px (모두 펼침)');
    await C.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/heart-c.png' : '/dev/null', fullPage: true }).catch(() => {});

    // ---- E. 잠그면 어두워지는 폰 → 밝기 맞추기 ----
    const E = await page(devices['Pixel 7'], 'E', fakeCamera(75, 'stale'));
    await E.click('#cam');
    await E.waitForFunction(() => /좋아요/.test(document.getElementById('v-qtext').textContent), null, { timeout: 10000 });
    await E.selectOption('#dur', '15');
    await E.click('#start');
    await E.waitForFunction(() => window.__heartRate.state().runs.length > 0, null, { timeout: 40000 });
    const e = (await E.evaluate(() => window.__heartRate.state().runs)).pop();
    const st = e.lockLog.steps;
    console.log('E 잠금 과정:', st.map(x => `${x.what}(밝기 ${x.y}, 셔터 ${x.et})`).join(' → '), '|', e.lock, e.res.bpm);
    assert.equal(e.lock, 'locked');
    assert.ok(e.lockLog.afterLock.y < 0.7 * e.lockLog.before.y, '잠근 직후 어두워짐(흉내) ' + e.lockLog.afterLock.y);
    assert.ok(Math.abs(e.lockLog.adjusted.y / e.lockLog.before.y - 1) <= 0.1, '맞춘 뒤 잠그기 전 ±10%: ' + e.lockLog.adjusted.y + ' / ' + e.lockLog.before.y);
    assert.ok(Math.abs(e.res.bpm - 75) <= 4, '75 ≈ ' + e.res.bpm);
    const [dl3] = await Promise.all([E.waitForEvent('download'), E.click(`[data-csv="${e.id}"]`)]);
    const csv3 = fs.readFileSync(await dl3.path(), 'utf8');
    assert.match(csv3, /# 노출 잠금 과정: 잠그기 전: 밝기 [\d.]+ · 셔터 100.*잠근 직후.*밝기 맞추기/);
    assert.match(csv3, /# 덮임 판정: 덮임 · R /);

    // ---- G. ISO 27 로 알려 주는 폰 ----
    const G = await page(devices['Pixel 7'], 'G', fakeCamera(78, 'iso27'));
    await G.click('#cam');
    await G.waitForFunction(() => /좋아요/.test(document.getElementById('v-qtext').textContent), null, { timeout: 10000 });
    await G.selectOption('#dur', '15');
    await G.click('#start');
    await G.waitForFunction(() => window.__heartRate.state().runs.length > 0, null, { timeout: 40000 });
    const gr = (await G.evaluate(() => window.__heartRate.state().runs)).pop();
    console.log('G ISO 27:', gr.lockLog.steps.map(x => `${x.what}(빨강 ${x.r}, 셔터 ${x.et}, ISO ${x.iso})`).join(' → '), '|', gr.lock, gr.res.bpm);
    assert.equal(gr.lock, 'locked');
    const last = gr.lockLog.adjusted;
    assert.ok(last.iso >= 600, 'ISO 를 올림 ' + last.iso);
    assert.ok(Math.abs(last.r / gr.lockLog.before.r - 1) <= 0.15, '잠그기 전 밝기로 ' + last.r + ' / ' + gr.lockLog.before.r);
    assert.ok(Math.abs(gr.res.bpm - 78) <= 4, '78 ≈ ' + gr.res.bpm);

    // ---- F. 다시 밝힐 수 없는 폰 → 자동 노출 + 보정 ----
    const F = await page(devices['Pixel 7'], 'F', fakeCamera(75, 'capped'));
    await F.click('#cam');
    await F.waitForFunction(() => /좋아요/.test(document.getElementById('v-qtext').textContent), null, { timeout: 10000 });
    await F.selectOption('#dur', '15');
    await F.click('#start');
    await F.waitForFunction(() => window.__heartRate.state().runs.length > 0, null, { timeout: 40000 });
    const fr = (await F.evaluate(() => window.__heartRate.state().runs)).pop();
    console.log('F 맞추기 실패:', fr.lock, fr.why, fr.res.bpm, fr.res.mode, fr.res.alt && fr.res.alt.chosen);
    assert.equal(fr.lock, 'unlocked'); assert.match(fr.why, /맞출 수 없어/);
    assert.ok(fr.lockLog.steps.some(x => /자동 노출로 되돌림/.test(x.what)));
    assert.ok(Math.abs(fr.res.bpm - 75) <= 4, '75 ≈ ' + fr.res.bpm);
    assert.match(await F.textContent('#v-locktext'), /맞출 수 없어/);
    // '노출 잠금 끄기' 를 고르면 잠그지 않음
    await F.check('#nolock');
    await F.click('#start');
    await F.waitForFunction(() => window.__heartRate.state().runs.length > 1, null, { timeout: 40000 });
    const f2 = (await F.evaluate(() => window.__heartRate.state().runs)).pop();
    assert.equal(f2.lock, 'unlocked'); assert.match(f2.why, /노출 잠금 끔/);
    assert.ok(!f2.lockLog.steps.some(x => /잠근 직후/.test(x.what)));
    await layout(F, 'F Pixel 7');

    // ---- D. 어두운 곳 ----
    const D = await page(devices['Pixel 7'], 'D', fakeCamera(72, 'lock', 0.15));
    await D.click('#cam');
    await D.waitForFunction(() => /어두워요/.test(document.getElementById('status').textContent), null, { timeout: 10000 });
    console.log('D 측정 전:', await D.textContent('#status'));
    await D.selectOption('#dur', '15');
    await D.click('#start');
    // 🌙 어두우면 15초를 30초로 늘림 (선생님 실측 r27 로 정한 측정 과정)
    await D.waitForFunction(() => /30초/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
    await D.waitForFunction(() => window.__heartRate.state().runs.length > 0, null, { timeout: 50000 });
    const d = (await D.evaluate(() => window.__heartRate.state().runs)).pop();
    assert.ok(d.res.dur > 27, '어두워서 30초 ' + d.res.dur);
    if (process.env.SHOT_DIR) fs.writeFileSync(process.env.SHOT_DIR + '/run-d.json', JSON.stringify(d));
    console.log('D 어두움:', d.res.bpm, d.res.level, d.res.light && d.res.light.level, d.res.light && d.res.light.text);
    assert.equal(d.res.light.level, 'dim');
    assert.notEqual(d.res.level, 'good');
    assert.ok(Math.abs(d.res.bpm - 72) <= 4, '72 ≈ ' + d.res.bpm);
    assert.match(await D.textContent('#msg'), /어두워요/);
    assert.match(await D.textContent('#runs'), /🌙 어두움/);
    const [dl2] = await Promise.all([D.waitForEvent('download'), D.click(`[data-csv="${d.id}"]`)]);
    const csv2 = fs.readFileSync(await dl2.path(), 'utf8');
    assert.match(csv2, /# 밝기 판정: 🌙 어두워요/);
    assert.match(csv2.trim().split('\n').pop(), /,1,dim$/);
    await layout(D, 'D Pixel 7');

    assert.deepEqual(errors, []);
    } finally {
        await browser.close().catch(() => {});
        stat.close();
    }
});
