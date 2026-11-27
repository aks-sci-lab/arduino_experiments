// 가상 수업 ⑦ 이상기체 · ⑧ 전자기 유도 — 노트북에서 센서로 재는 실험. 센서가 없어 화면이 주는 길(직접 입력·시뮬레이션)로 감.
//   VC_NPM=<chart.js 가 깔린 폴더> node tools/virtual-class/student-sensor-labs.cjs [그림 폴더] [idealgas|eminduction]
'use strict';
const { startWorld } = require('./student-lib.cjs');
(async () => {
    const W = await startWorld({ shots: process.argv[2] });
    const only = process.argv[3] || '';
    const out = [];
    const note = (k, v) => out.push([k, v]);
    const cur = pg => pg.evaluate(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.textContent.trim() : ''; });
    const panel = async (pg, k, n) => { note(k, { 글: (await pg.locator('.step-panel').locator('visible=true').first().innerText()).replace(/\n+/g, ' / ').slice(0, n || 1800), 점검: await W.check(pg) }); await W.shot(pg, k, true); };
    const controls = pg => pg.locator('.step-panel').locator('visible=true').first().locator('button, select, input, textarea, summary').locator('visible=true').evaluateAll(a => a.map(e => (e.disabled ? '(꺼짐)' : '') + (e.tagName === 'BUTTON' || e.tagName === 'SUMMARY' ? e.textContent.trim().replace(/\s+/g, ' ').slice(0, 26) : '[' + e.tagName.toLowerCase() + ' ' + (e.getAttribute('aria-label') || e.placeholder || e.id || e.type) + '=' + String(e.value).slice(0, 10) + ']')));
    const enter = async (exp, page, name) => {
        const cls = await W.createClass({ exp, ban: 2, nStudents: 8, groupSize: 4, stage: 99 });
        const L = await W.student(name, 'laptop');
        await L.goto(W.classUrl(cls, page)); await L.waitForTimeout(1500);
        await L.locator('#cs-cjo').selectOption({ index: 1 }); await L.locator('#cs-cnum').selectOption({ index: 0 }); await W.tap(L, '참여하기'); await L.waitForTimeout(1500);
        return { cls, L };
    };
    try {
        if (!only || only === 'idealgas') try {
            const { L } = await enter('idealgas', 'projects/ideal-gas.html', '이상기체 노트북');
            await W.tap(L, /^5/); await L.waitForTimeout(1000); await panel(L, '이상기체 5 데이터', 2600); note('이상기체 5 조작 칸', await controls(L));
            for (const [v, pr] of [['60', '101'], ['70', '87'], ['80', '76'], ['90', '67'], ['100', '61']]) { await L.locator('#in-v').fill(v); await L.locator('#in-p').fill(pr); await L.locator('#in-t').fill('22'); await W.tap(L, '✅ 기록'); await L.waitForTimeout(250); }
            await L.locator('#in-v').fill('110'); await L.locator('#in-p').fill('5.5'); await W.tap(L, '✅ 기록'); await L.waitForTimeout(300);   // 55 를 5.5 로 잘못
            note('보일 6점 뒤', (await L.locator('.step-panel').locator('visible=true').first().innerText()).split('\n').slice(-22).join(' / ').slice(0, 900));
            await L.locator('.step-panel input[type=radio]').locator('visible=true').nth(1).check({ force: true }); await L.waitForTimeout(600); await panel(L, '이상기체 실험 2 화면', 1300); note('실험 2 조작 칸', (await controls(L)).slice(9));
            await W.tap(L, /^6/); await L.waitForTimeout(1000); await panel(L, '이상기체 6 결과', 2000);
            await W.tap(L, /^7/); await L.waitForTimeout(1000); await panel(L, '이상기체 7 결론', 2000);
        } catch (e) { note('막힘@이상기체', String(e.message).split('\n')[0]); }
        if (!only || only === 'eminduction') try {
            const { L } = await enter('eminduction', 'projects/em-induction.html', '전자기유도 노트북');
            await W.tap(L, /^5/); await L.waitForTimeout(1000); await panel(L, '전자기 유도 5 데이터', 2600); note('전자기 유도 5 조작 칸', await controls(L));
            await W.tap(L, '시뮬레이션 (센서 없이'); await L.waitForTimeout(800); note('시뮬레이션 켠 뒤', (await controls(L)).slice(9));
            await W.tap(L, '측정 시작'); await L.waitForTimeout(7000); note('측정 뒤', (await L.locator('.step-panel').locator('visible=true').first().innerText()).split('\n').slice(30).join(' / ').slice(0, 700)); await W.shot(L, '전자기 유도 측정 뒤', true);
            await W.tap(L, '이 측정 저장'); await L.waitForTimeout(600); note('저장 뒤 단추', (await controls(L)).slice(15));
            await W.tap(L, '측정 시작'); await L.waitForTimeout(7000); await W.tap(L, '이 측정 저장'); await L.waitForTimeout(400);
            await W.tap(L, /^\s*📤 선생님께 보내기/); await L.waitForTimeout(2500); note('보낸 뒤', (await L.locator('[class*="cs-"]').locator('visible=true').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').split(' | ').filter(l => /보냈|실패/.test(l) && l.length < 200).slice(0, 2));
            await W.tap(L, /^6/); await L.waitForTimeout(1000); await panel(L, '전자기 유도 6 결과', 2200);
            await W.tap(L, /^7/); await L.waitForTimeout(1000); await panel(L, '전자기 유도 7 결론', 1700);
        } catch (e) { note('막힘@전자기 유도', String(e.message).split('\n')[0]); }
    } finally {
        out.push(['알림 창', W.dialogs], ['오류', W.errors]);
        console.log(JSON.stringify(out, null, 1));
        await W.close();
    }
})();
