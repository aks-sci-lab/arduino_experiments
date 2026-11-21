// 가상 수업 ② 탄소 양자점 형광 (가설연역 6단계) — 1조 노트북만, 단계 이름·쓰기 칸·가설 판정을 본다.
//   VC_NPM=<chart.js 가 깔린 폴더> node tools/virtual-class/student-qdot-hd.cjs [그림 폴더]
'use strict';
const { startWorld } = require('./student-lib.cjs');
(async () => {
    const W = await startWorld({ shots: process.argv[2] });
    const out = [];
    const note = (k, v) => out.push([k, v]);
    let dead = false;
    const walk = async (name, fn) => { if (dead) return; try { await fn(); } catch (e) { note('막힘@' + name, String(e.message).split('\n')[0]); dead = true; } };
    const steps = pg => pg.evaluate(() => [...document.querySelectorAll('nav.steps button')].filter(b => b.offsetParent).map(b => (b.classList.contains('cs-locked') ? '🔒' : '') + (b.getAttribute('aria-selected') === 'true' ? '▶' : '') + b.textContent.trim().replace(/\s+/g, ' ')));
    const inline = pg => pg.evaluate(() => [...document.querySelectorAll('.rai-inline')].filter(e => e.offsetParent).map(e => e.innerText.replace(/\n+/g, ' / ').slice(0, 400)));
    try {
        const cls = await W.createClass({ exp: 'qdot', ban: 3, nStudents: 8, groupSize: 4, flow: 'hd' });   // 교사: 3반, 가설연역, ① 만 열림
        const L = await W.student('1조노트북', 'laptop');
        await walk('입장', async () => {
            await L.goto(W.classUrl(cls, 'projects/quantum-dot.html')); await L.waitForTimeout(1500);
            await L.locator('#cs-cjo').selectOption({ index: 1 }); await L.locator('#cs-cnum').selectOption({ index: 0 }); await W.tap(L, '참여하기'); await L.waitForTimeout(1500);
            note('① 단계 줄', await steps(L)); note('① 쓰기 칸', await inline(L)); await W.shot(L, '① 문제 인식', true);
            note('① 글', (await W.text(L)).split('\n').slice(12).join(' / ').slice(0, 900));
        });
        for (const st of [2, 3, 4, 5, 6]) {
            await walk('단계 ' + st, async () => {
                await W.openStage(cls, st); await L.waitForTimeout(2500);
                note('단계 ' + st + ' 줄', await steps(L)); note('단계 ' + st + ' 쓰기 칸', await inline(L)); note('단계 ' + st + ' 화면 길이', (await W.check(L)).pages);
                note('단계 ' + st + ' 작은 탭', await L.evaluate(() => [...document.querySelectorAll('.subtabs button')].filter(b => b.offsetParent).map(b => b.textContent.trim())));
                await W.shot(L, '단계' + st, true);
            });
        }
        await walk('⑥ 판정', async () => {
            note('⑥ 글', (await W.text(L)).split('\n').slice(12).join(' / ').slice(0, 1800));
            note('⑥ 단추', (await W.buttons(L)).slice(9));
        });
    } finally {
        out.push(['알림 창', W.dialogs], ['오류', W.errors]);
        console.log(JSON.stringify(out, null, 1));
        await W.close();
    }
})();
