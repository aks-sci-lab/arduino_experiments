// 가상 수업 ⑥ 자유낙하 — 1조 노트북(분석) + 폰(영상에서 점 찍기).
//   VC_NPM=<chart.js 가 깔린 폴더> node tools/virtual-class/student-freefall.cjs [그림 폴더]
'use strict';
const { startWorld } = require('./student-lib.cjs');
(async () => {
    const W = await startWorld({ shots: process.argv[2] });
    const out = [];
    const note = (k, v) => out.push([k, v]);
    let dead = false;
    const walk = async (name, fn) => { if (dead) return; try { await fn(); } catch (e) { note('막힘@' + name, String(e.message).split('\n')[0]); dead = true; } };
    const cur = pg => pg.evaluate(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.textContent.trim() : ''; });
    const see = async (pg, k, n, from) => { note(k, { 글: (await W.text(pg)).split('\n').slice(from || 0).join(' / ').slice(0, n || 1400), 점검: await W.check(pg) }); await W.shot(pg, k, true); };
    try {
        const cls = await W.createClass({ exp: 'freefall', ban: 2, nStudents: 8, groupSize: 4, stage: 5 });   // 교사: 5 데이터까지 열어 둔 때
        const L = await W.student('1조노트북', 'laptop');
        await walk('노트북 입장', async () => {
            await L.goto(W.classUrl(cls, 'projects/free-fall.html')); await L.waitForTimeout(1500);
            await L.locator('#cs-cjo').selectOption({ index: 1 }); await L.locator('#cs-cnum').selectOption({ index: 0 }); await W.tap(L, '참여하기'); await L.waitForTimeout(1500);
            await W.tap(L, /^5\s*데이터/); await L.waitForTimeout(1200);
            await see(L, '노트북 5 데이터', 2000, 8); note('단추', (await W.buttons(L)).slice(8));
        });
        const P = await W.student('1조폰', 'phone');
        await walk('폰 측정 화면', async () => {
            const u = await L.evaluate(() => [...document.querySelectorAll('a[href*="role=phone"]')].filter(e => e.offsetParent).map(e => e.href)[0]);
            await P.goto(u); await P.waitForTimeout(2500); await see(P, '폰 첫 화면', 1800); note('폰 단추', await W.buttons(P)); await W.shot(P, '폰 첫 화면 보이는 곳');
        });
        const mid = async (pg, n) => (await W.text(pg)).split('\n').filter(l => /단계|프레임|기준|선택|합성|✅|⚠|오류|못|회차|점/.test(l)).slice(0, n || 14);
        await walk('폰 영상 → 점 찍기', async () => {
            const f = await W.fallVideo(require('node:path').join(W.shots, 'fall.webm'), 1.2);
            await P.locator('input[type=file]').locator('visible=true').first().setInputFiles(f); await W.tap(P, '영상 로드 및 추출'); await P.waitForTimeout(9000);
            note('영상 추출 뒤', await mid(P)); note('단추', (await W.buttons(P)).slice(18)); await W.shot(P, '영상 추출 뒤', true);
        });
        // 눈 노릇: 보이는 캔버스에서 색(빨강 공 / 어두운 자)을 찾아 화면 좌표로
        const find = (pg, what) => pg.evaluate(what => {
            const cv = [...document.querySelectorAll('canvas')].filter(c => c.offsetParent && c.width > 50).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0]; if (!cv) return null;
            const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, r = cv.getBoundingClientRect(); let sx = 0, sy = 0, n = 0, y0 = 1e9, y1 = -1, xs = 0;
            for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) { const i = (y * cv.width + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
                if (what === 'ball' ? (R > 170 && G < 80 && B < 80) : (R < 90 && G < 90 && B < 90 && x < cv.width * 0.25)) { sx += x; sy += y; n++; if (y < y0) y0 = y; if (y > y1) y1 = y; xs = x; } }
            if (!n) return null; const kx = r.width / cv.width, ky = r.height / cv.height;
            return what === 'ball' ? { x: r.left + sx / n * kx, y: r.top + sy / n * ky, n } : { x: r.left + sx / n * kx, top: r.top + y0 * ky, bottom: r.top + y1 * ky, n };
        }, what);
        const tapAt = async (pg, x, y) => { await pg.evaluate(y => scrollBy(0, y - innerHeight / 2), y); await pg.waitForTimeout(150); };
        await walk('기준 길이', async () => {
            await W.tap(P, '기준 길이 재기'); await P.waitForTimeout(500); note('기준 길이 누른 뒤', await mid(P, 20)); 
            let r = await find(P, 'ruler'); note('자 찾음', r && { 화면높이: Math.round(r.bottom - r.top) });
            if (r) { await P.evaluate(y => scrollBy(0, y - 200), r.top); r = await find(P, 'ruler'); await P.touchscreen.tap(r.x, r.top + 1); await P.waitForTimeout(400); await P.touchscreen.tap(r.x, r.bottom - 1); await P.waitForTimeout(600); }
            note('자 양 끝 누른 뒤', (await W.text(P)).split('\n').filter(l => /기준|mm|px/.test(l)).slice(0, 6)); await W.shot(P, '기준 길이 뒤');
            note('기준 길이 칸', await P.locator('input[type=number]').locator('visible=true').evaluateAll(a => a.map(e => e.value)));
        });
        await walk('자 길이 고치기 · 점 찍기', async () => {
            const len = P.locator('input[type=number]').locator('visible=true').nth(1); await len.fill('300'); await len.blur(); await P.waitForTimeout(400);
            note('자 길이를 300 으로 고친 뒤', (await W.text(P)).split('\n').filter(l => /mm\/px|자 \d/.test(l)));
            await W.tap(P, '수동 선택 시작'); await P.waitForTimeout(600); note('선택 시작 뒤', (await W.text(P)).split('\n').filter(l => /단계|프레임|선택/.test(l)).slice(-4)); await W.shot(P, '선택 시작 뒤');
            let taps = 0, miss = 0;
            for (let i = 0; i < 40; i++) {
                let b = await find(P, 'ball'); if (!b) { miss++; if (miss > 2) break; await P.waitForTimeout(300); continue; }
                await P.evaluate(y => scrollBy(0, y - innerHeight / 2), b.y); b = await find(P, 'ball'); if (!b) break;
                await P.touchscreen.tap(b.x, b.y); taps++; await P.waitForTimeout(350);
                if (i === 2) note('3번 찍은 뒤', (await W.text(P)).split('\n').filter(l => /단계|프레임|선택|\/ ?\d+/.test(l)).slice(-4));
                if (await P.getByText('합성 실행').locator('visible=true').count() && i > 3 && !(await find(P, 'ball'))) break;
            }
            note('찍은 횟수', taps); note('찍은 뒤', (await W.text(P)).split('\n').filter(l => /단계|프레임|선택|합성|✅|⚠/.test(l)).slice(-6)); note('단추', (await W.buttons(P)).slice(20)); await W.shot(P, '점 찍은 뒤', true);
        });
        await walk('합성 · 보내기 · 결과', async () => {
            await W.tap(P, '합성 실행'); await P.waitForTimeout(2500); note('합성 뒤 폰 띠', (await W.text(P)).split('\n').slice(4, 14).join(' / ').slice(0, 500)); await W.shot(P, '합성 뒤', true);
            await P.evaluate(() => scrollTo(0, 0)); await W.tap(P, '고른 회차 보내기'); await P.waitForTimeout(3000); note('보낸 뒤', (await W.text(P)).split('\n').filter(l => /보냈|보냄/.test(l)));
            await L.waitForTimeout(4000); note('노트북 5', (await W.text(L)).split('\n').filter(l => /🆕|기다리는/.test(l)));
            await W.openStage(cls, 6); await L.waitForTimeout(6000); if (!/6/.test(await cur(L))) await W.tap(L, /^6\s*결과/); await L.waitForTimeout(1000); await see(L, '노트북 6 결과', 2200, 20);
            await W.openStage(cls, 7); await L.waitForTimeout(6000); if (!/7/.test(await cur(L))) await W.tap(L, /^7\s*결론/); await L.waitForTimeout(1000); await see(L, '노트북 7 결론', 1500, 20);
        });
        // STEPS
    } finally {
        out.push(['알림 창', W.dialogs], ['오류', W.errors]);
        console.log(JSON.stringify(out, null, 1));
        await W.close();
    }
})();
