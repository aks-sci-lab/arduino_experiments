// 가상 수업 ③ LED 플랑크 상수 (7단계) — 1조 노트북 두 대(2인 1조 × 2)가 멀티미터 값을 넣고 조 공유로 합친다.
//   VC_NPM=<chart.js 가 깔린 폴더> node tools/virtual-class/student-planck.cjs [그림 폴더]
'use strict';
const { startWorld } = require('./student-lib.cjs');
(async () => {
    const W = await startWorld({ shots: process.argv[2] });
    const out = [];
    const note = (k, v) => out.push([k, v]);
    let dead = false;
    const walk = async (name, fn) => { if (dead) return; try { await fn(); } catch (e) { note('막힘@' + name, String(e.message).split('\n')[0]); dead = true; } };
    const cur = pg => pg.evaluate(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.textContent.trim() : ''; });
    const panel = async (pg, k, n) => { note(k, { 글: (await pg.locator('.step-panel').locator('visible=true').first().innerText()).replace(/\n+/g, ' / ').slice(0, n || 1500), 점검: await W.check(pg) }); await W.shot(pg, k, true); };
    const controls = pg => pg.locator('.step-panel').locator('visible=true').first().locator('button, select, input, textarea, summary').locator('visible=true').evaluateAll(a => a.map(e => (e.disabled ? '(꺼짐)' : '') + (e.tagName === 'BUTTON' || e.tagName === 'SUMMARY' ? e.textContent.trim().replace(/\s+/g, ' ').slice(0, 28) : '[' + e.tagName.toLowerCase() + ' ' + (e.getAttribute('aria-label') || e.placeholder || e.name || e.id || e.type) + '=' + String(e.value).slice(0, 12) + ']')));
    try {
        const cls = await W.createClass({ exp: 'planck', ban: 2, nStudents: 8, groupSize: 4, stage: 4 });   // 교사: 2반, 4 과정까지 열어 둔 때
        const A = await W.student('1조노트북A', 'laptop');
        await walk('입장', async () => {
            await A.goto(W.classUrl(cls, 'projects/planck-led.html')); await A.waitForTimeout(1500);
            await A.locator('#cs-cjo').selectOption({ index: 1 }); await A.locator('#cs-cnum').selectOption({ index: 0 }); await W.tap(A, '참여하기'); await A.waitForTimeout(1500);
            note('입장 뒤 단계', await cur(A)); await W.shot(A, '입장 뒤');
            await W.openStage(cls, 5); await A.waitForTimeout(2500); note('5 연 지 2.5초', await cur(A)); await A.waitForTimeout(3000); note('5 열린 뒤', await cur(A)); await panel(A, '5 데이터', 2600); note('5 데이터 조작 칸', await controls(A));
        });
        const msg = async pg => (await pg.locator('.step-panel').locator('visible=true').first().innerText()).split('\n').filter(l => /⚠|✅|❌|기록했|넣어|확인|오류|안 돼|없/.test(l)).slice(0, 6);
        const rec = async (pg, v, vr) => { await pg.locator('#in-v').fill(v); await pg.locator('#in-vr').fill(vr); await W.tap(pg, '✅ 기록'); await pg.waitForTimeout(250); };
        await walk('값 넣기', async () => {
            await W.tap(A, '✅ 기록'); await A.waitForTimeout(300); note('빈 채로 기록', await msg(A));
            await A.locator('#in-v').fill('1,8').catch(e => note('쉼표 소수 넣기', String(e.message).split('\n')[0]));
            await rec(A, '18', '0.1'); note('18 V(소수점 빠뜨림) 기록', await msg(A));
            for (const [v, vr] of [['1.5', '0'], ['1.7', '0.01'], ['1.8', '0.1'], ['1.85', '0.3'], ['1.9', '0.6'], ['1.95', '1.0']]) await rec(A, v, vr);
            await panel(A, '빨강 기록 뒤', 2600);
        });
        const B = await W.student('1조노트북B', 'laptop');
        const share = async pg => (await pg.locator('[class*="cs-"]').locator('visible=true').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').split(' | ').filter(l => /연결|불러온 값 \d|보냈|보내는|실패|못/.test(l) && l.length < 200).slice(0, 5);
        await walk('둘째 노트북·조 공유', async () => {
            await A.getByText('삭제').last().click(); await A.waitForTimeout(300);
            await A.locator('#sel-led').selectOption('green'); for (const [v, vr] of [['2.2', '0.01'], ['2.4', '0.2'], ['2.5', '0.5'], ['2.6', '0.9'], ['2.7', '1.4']]) await rec(A, v, vr);
            await B.goto(W.classUrl(cls, 'projects/planck-led.html')); await B.waitForTimeout(1500);
            await B.locator('#cs-cjo').selectOption({ index: 1 }); await B.locator('#cs-cnum').selectOption({ index: 2 }); await W.tap(B, '참여하기'); await B.waitForTimeout(5000);
            note('B 들어온 뒤 단계', await cur(B));
            if (!/5/.test(await cur(B))) await W.tap(B, /^5\s*데이터/);
            await B.locator('#sel-led').selectOption('blue'); for (const [v, vr] of [['2.4', '0.01'], ['2.6', '0.2'], ['2.7', '0.5'], ['2.8', '0.9'], ['2.9', '1.4']]) await rec(B, v, vr);
            note('보내기 전 B 가 본 A 값', await share(B));
            await W.tap(A, /^\s*📤 선생님께 보내기/); await A.waitForTimeout(2500); note('A 보낸 뒤', await share(A)); await W.shot(A, 'A 보낸 뒤', true); note('저장소 줄', W.app.items('planck').map(d => [d.group, d.title || d.led || '', d._space.slice(0, 4)]));
            await B.waitForTimeout(5000); note('B 화면(자동 불러오기)', await share(B));
            await W.tap(B, /^\s*📤 선생님께 보내기/); await B.waitForTimeout(2500); await A.waitForTimeout(4000); note('A 화면(B 값 도착)', await share(A));
        });
        await walk('6 결과', async () => { await W.openStage(cls, 6); await A.waitForTimeout(6000); note('6 단계', await cur(A)); await panel(A, '6 결과', 2400); note('6 조작 칸', await controls(A)); });
        await walk('7 결론', async () => { await W.openStage(cls, 7); await A.waitForTimeout(6000); note('7 단계', await cur(A)); await panel(A, '7 결론', 3000); });
        // STEPS
    } finally {
        out.push(['알림 창', W.dialogs], ['오류', W.errors]);
        console.log(JSON.stringify(out, null, 1));
        await W.close();
    }
})();
