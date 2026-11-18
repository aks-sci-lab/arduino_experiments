// 말루스 법칙: 🔒 노출 고정 (js/malus-law.js lockExposure)
//  선생님 실측 오류 "노출 고정 실패: colorTemperature setting out of range" — 화이트밸런스 색온도가 기기 범위 밖이면
//  예전에는 노출까지 통째로 실패. 이제 노출·화이트밸런스·초점을 따로 걸고, 값은 범위 안으로 맞추고, 안 되면 모드만 건다.
//  가짜 카메라(크롬) + 가짜 카메라 기능(getCapabilities·getSettings·applyConstraints), Playwright 가 없으면 건너뜀
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };

// 카메라 기능 흉내: 범위 밖 값·지원 안 하는 키는 applyConstraints 가 진짜 크롬처럼 거절
function fakeCaps(mode) {
    const CAPS = {
        exposureMode: ['continuous', 'manual'], exposureTime: { min: 1, max: 3000, step: 1 }, iso: { min: 50, max: 3200, step: 1 },
        whiteBalanceMode: ['continuous', 'manual'], colorTemperature: { min: 2850, max: 7000, step: 50 },
        focusMode: ['continuous', 'manual'], focusDistance: { min: 0.1, max: 10, step: 0.01 }
    };
    // 폰이 알려 주는 지금 값: 색온도가 범위 밖(갤럭시에서 본 오류 모양)
    const cur = { exposureMode: 'continuous', exposureTime: 333, iso: 400, whiteBalanceMode: 'continuous', colorTemperature: mode === 'wbBroken' ? 0 : 2000, focusMode: 'continuous', focusDistance: 0.5 };
    window.__applied = [];
    const P = MediaStreamTrack.prototype;
    P.getCapabilities = function () { return JSON.parse(JSON.stringify(CAPS)); };
    P.getSettings = function () { return Object.assign({ width: 640, height: 480 }, cur); };
    P.applyConstraints = async function (c) {
        const a = (c && c.advanced && c.advanced[0]) || {};
        for (const k of Object.keys(a)) {
            const cap = CAPS[k], v = a[k];
            if (mode === 'wbBroken' && k === 'whiteBalanceMode') throw new DOMException(k + ' setting value not supported', 'OverconstrainedError');
            if (Array.isArray(cap) && !cap.includes(v)) throw new DOMException(k + ' setting value not supported', 'OverconstrainedError');
            if (cap && cap.min != null && (v < cap.min || v > cap.max)) throw new DOMException(k + ' setting out of range', 'OverconstrainedError');
        }
        Object.assign(cur, a);
        window.__applied.push(a);
    };
}

test('🔒 노출 고정: 색온도가 범위 밖이어도 노출은 고정, 화이트밸런스가 아예 안 되면 그것만 빼고 안내', { skip: !chromium && 'playwright 없음', timeout: 90000 }, async () => {
    const srv = http.createServer((req, res) => {
        const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/projects/malus-law.html?device=tablet#step-5';
    const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    try {
        for (const mode of ['ctOut', 'wbBroken']) {
            const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 }, permissions: ['camera'] });
            await ctx.route(/gstatic\.com|jsdelivr\.net|script\.google\.com/, r => r.abort());
            await ctx.addInitScript(fakeCaps, mode);
            const p = await ctx.newPage();
            const errors = [];
            p.on('pageerror', e => errors.push(e.message));
            await p.goto(url);
            await p.click('#btn-cam');
            await p.waitForFunction(() => !document.getElementById('btn-lock').disabled, null, { timeout: 15000 });
            await p.click('#btn-lock');
            await p.waitForFunction(() => /고정/.test(document.body.innerText) && window.__applied.length > 0, null, { timeout: 10000 });
            await p.waitForTimeout(300);
            const applied = await p.evaluate(() => window.__applied);
            const msg = await p.evaluate(() => (document.body.innerText.match(/(노출은 고정했어요|고정 적용됨|노출 고정 실패)[^\n]*/) || [''])[0]);
            assert.ok(applied.some(a => a.exposureMode === 'manual' && a.exposureTime === 333 && a.iso === 400), mode + ': 노출 고정 ' + JSON.stringify(applied));
            assert.doesNotMatch(msg, /노출 고정 실패/, mode + ': ' + msg);
            if (mode === 'ctOut') {
                // 색온도 2000 → 기기 범위 2850 으로 맞춰 화이트밸런스도 고정
                assert.ok(applied.some(a => a.whiteBalanceMode === 'manual' && a.colorTemperature === 2850), JSON.stringify(applied));
                assert.match(msg, /고정 적용됨/);
            } else {
                assert.match(msg, /노출은 고정했어요.*화이트밸런스/);
            }
            assert.ok(applied.some(a => a.focusMode === 'manual'), '초점도 따로 고정');
            assert.deepEqual(errors, []);
            await ctx.close();
        }
    } finally {
        await browser.close();
        srv.close();
    }
});
