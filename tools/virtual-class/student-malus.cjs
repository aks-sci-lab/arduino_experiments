// 가상 수업 ⑤ 말루스 법칙 — 1조 노트북(분석) + 폰(카메라 측정, 크롬 가짜 카메라).
//   VC_NPM=<chart.js 가 깔린 폴더> node tools/virtual-class/student-malus.cjs [그림 폴더]
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
        const cls = await W.createClass({ exp: 'malus', ban: 2, nStudents: 8, groupSize: 4, stage: 5 });   // 교사: 5 데이터까지 열어 둔 때
        const L = await W.student('1조노트북', 'laptop');
        await walk('노트북 입장', async () => {
            await L.goto(W.classUrl(cls, 'projects/malus-law.html')); await L.waitForTimeout(1500);
            await L.locator('#cs-cjo').selectOption({ index: 1 }); await L.locator('#cs-cnum').selectOption({ index: 0 }); await W.tap(L, '참여하기'); await L.waitForTimeout(1500);
            await W.tap(L, /^5\s*데이터/); await L.waitForTimeout(1200);
            await see(L, '노트북 5 데이터', 2000, 8); note('단추', (await W.buttons(L)).slice(8));
        });
        const P = await W.student('1조폰', 'phone');
        await walk('폰 측정 화면', async () => {
            const u = await L.evaluate(() => [...document.querySelectorAll('a[href*="role=phone"]')].filter(e => e.offsetParent).map(e => e.href)[0]);
            await P.goto(u); await P.waitForTimeout(2500); await see(P, '폰 첫 화면', 1800); note('폰 단추', await W.buttons(P)); await W.shot(P, '폰 첫 화면 보이는 곳');
        });
        const band = async pg => (await W.text(pg)).split('\n').slice(6, 22).join(' / ').slice(0, 700);
        await walk('폰 측정', async () => {
            await W.tap(P, '카메라 켜기'); await P.waitForTimeout(2500);
            const t0 = Date.now(); await W.tap(P, '측정 기록'); await P.waitForFunction(() => /1번 측정/.test(document.body.innerText), null, { timeout: 20000 }); note('한 점 기록에 걸린 시간(초)', ((Date.now() - t0) / 1000).toFixed(1));
            note('한 점 기록 뒤', (await W.text(P)).split('\n').filter(l => /회차|번 측정|✅|⚠|배경|기록/.test(l)).slice(0, 12)); await W.shot(P, '한 점 뒤', true);
            for (let i = 0; i < 4; i++) { await W.tap(P, '다음 ▶'); await W.tap(P, '측정 기록'); await P.waitForTimeout(3500); }
            note('5점 뒤 띠', await band(P)); note('5점 뒤 점검', await W.check(P));
            await W.tap(P, '고른 회차 보내기').catch(e => note('보내기', e.message)); await P.waitForTimeout(3000); note('보낸 뒤 띠', await band(P));
            await L.waitForTimeout(4000); note('노트북', (await W.text(L)).split('\n').filter(l => /🆕|기다리는|불러온 값/.test(l)));
        });
        await walk('6 결과', async () => { await W.openStage(cls, 6); await L.waitForTimeout(6000); note('6 단계', await cur(L)); if (!/6/.test(await cur(L))) await W.tap(L, /^6\s*결과/); await L.waitForTimeout(800); await see(L, '노트북 6 결과', 2400, 22); });
        await walk('7 결론', async () => { await W.openStage(cls, 7); await L.waitForTimeout(6000); if (!/7/.test(await cur(L))) await W.tap(L, /^7\s*결론/); await L.waitForTimeout(800); await see(L, '노트북 7 결론', 2000, 22); });
        // STEPS
    } finally {
        out.push(['알림 창', W.dialogs], ['오류', W.errors]);
        console.log(JSON.stringify(out, null, 1));
        await W.close();
    }
})();
