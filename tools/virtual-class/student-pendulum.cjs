// 가상 수업 ④ 스마트폰 진자 — 1조 노트북(분석 화면) + 폰(측정 화면, 시뮬레이션으로 센서 대신).
//   VC_NPM=<chart.js 가 깔린 폴더> node tools/virtual-class/student-pendulum.cjs [그림 폴더]
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
        const cls = await W.createClass({ exp: 'pendulum', ban: 2, nStudents: 8, groupSize: 4, stage: 5 });   // 교사: 5 데이터까지 열어 둔 때
        const L = await W.student('1조노트북', 'laptop');
        await walk('노트북 입장', async () => {
            await L.goto(W.ROOT + 'index.html'); await W.tap(L, '학생'); await L.getByPlaceholder('2-4821').fill(cls.classCode); await W.tap(L, '들어가기'); await L.waitForTimeout(1500);
            note('들어간 주소', L.url().replace(W.ROOT, '').replace(/s=[^&]+/, 's=…'));
            await L.locator('#cs-cjo').selectOption({ index: 1 }); await L.locator('#cs-cnum').selectOption({ index: 0 }); await W.tap(L, '참여하기'); await L.waitForTimeout(5000);
            note('단계', await cur(L)); await W.tap(L, /^5\s*데이터/).catch(() => {}); await L.waitForTimeout(800);
            await see(L, '노트북 5 데이터', 2200, 8); note('단추', (await W.buttons(L)).slice(8));
            note('폰 주소', await L.evaluate(() => [...document.querySelectorAll('a[href*="pendulum-measure"], a[href*="role=phone"]')].filter(e => e.offsetParent).map(e => e.href.replace(/^https?:\/\/[^/]+\//, '').replace(/s=[^&]+/, 's=…'))));
        });
        const P = await W.student('1조폰', 'phone');
        await walk('폰 측정 화면', async () => {
            const u = await L.evaluate(() => [...document.querySelectorAll('a[href*="pendulum-measure"]')].filter(e => e.offsetParent).map(e => e.href)[0]);
            await P.goto(u); await P.waitForTimeout(1500); await see(P, '폰 첫 화면', 1500); note('폰 단추', await W.buttons(P)); await W.shot(P, '폰 첫 화면 보이는 곳');
        });
        const top = async pg => (await W.text(pg)).split('\n').slice(6, 14).join(' / ');
        await walk('L 없이 시작 · 센서 없음', async () => {
            await W.tap(P, '측정 시작'); await P.waitForTimeout(1500); note('L 없이 측정 시작', await top(P)); await W.shot(P, 'L 없이 시작');
            note('시작 누른 뒤 열린 작은 탭', await P.evaluate(() => { const b = document.querySelector('.subtabs [aria-selected="true"]'); return b ? b.textContent.trim() : ''; })); await W.tap(P, '① 준비'); await P.waitForTimeout(400);
            await P.getByPlaceholder('예: 1.00').fill('0.5'); await P.getByPlaceholder('예: 5').first().fill('5');
            await W.tap(P, '④ 자료'); await P.waitForTimeout(600); await see(P, '폰 ④ 자료', 1600, 18); note('④ 단추', (await W.buttons(P)).slice(10));
        });
        await walk('시뮬레이션 측정 3번 → 보내기', async () => {
            await W.tap(P, '시뮬레이션 (폰 없이'); await P.waitForTimeout(300);
            let i = 0;
            for (const Lm of ['0.5', '0.8', '1.1']) {
                await W.tap(P, '④ 자료'); await P.locator('details[open] input[type=number]').locator('visible=true').first().fill(Lm); await W.tap(P, '시뮬레이션 데이터 만들기'); await P.waitForTimeout(1500);
                if (!i) { note('시뮬레이션 만든 뒤 탭·띠', [await P.evaluate(() => { const b = document.querySelector('.subtabs [aria-selected="true"]'); return b ? b.textContent.trim() : ''; }), await top(P)]); await W.tap(P, '③ 주기'); await P.waitForTimeout(500); await see(P, '폰 ③ 주기', 1300, 18); }
                await W.tap(P, '노트북으로 보내기'); await P.waitForTimeout(2500);
                if (!i++) { note('보낸 뒤 폰', await top(P)); await W.shot(P, '보낸 뒤 폰'); }
            }
            await L.waitForTimeout(3000); await see(L, '노트북 표', 1300, 18);
        });
        await walk('6 결과', async () => { await W.openStage(cls, 6); await L.waitForTimeout(6000); note('6 단계로 넘어갔나', await cur(L)); if (!/6/.test(await cur(L))) await W.tap(L, /^6\s*결과/); await L.waitForTimeout(800); await see(L, '노트북 6 결과', 2200, 18); });
        await walk('7 결론', async () => { await W.openStage(cls, 7); await L.waitForTimeout(6000); if (!/7/.test(await cur(L))) await W.tap(L, /^7\s*결론/); await L.waitForTimeout(800); await see(L, '노트북 7 결론', 1800, 18); });
        // 노트북으로 측정 화면을 열거나 폰으로 분석 화면을 열면
        const PX = await W.student('폰으로 분석 화면', 'phone');
        await walk('기기 안내', async () => { await PX.goto(W.classUrl(cls, 'projects/pendulum-report.html')); await PX.waitForTimeout(1500); await see(PX, '폰으로 연 분석 화면', 700); });
        await walk('폰만 든 조원: 수업 코드 → 측정 화면', async () => {
            await PX.locator('#cs-cjo').selectOption({ index: 1 }); await PX.locator('#cs-cnum').selectOption({ index: 1 }); await W.tap(PX, '참여하기'); await PX.waitForTimeout(1200);
            await W.tap(PX, '측정 화면으로'); await PX.waitForTimeout(1500); note('측정 화면 주소', PX.url().replace(W.ROOT, '').replace(/s=[^&]+/, 's=…')); note('측정 화면 위쪽', (await W.text(PX)).split('\n').slice(6, 16).join(' / ').slice(0, 600));
        });
        // STEPS
    } finally {
        out.push(['알림 창', W.dialogs], ['오류', W.errors]);
        console.log(JSON.stringify(out, null, 1));
        await W.close();
    }
})();
