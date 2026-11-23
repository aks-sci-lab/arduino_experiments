// 가상 수업 ② 탄소 양자점 형광 (7단계) — 1조(노트북 1대 + 폰)를 끝까지, 다른 조는 가볍게.
//   VC_NPM=<chart.js 가 깔린 폴더> node tools/virtual-class/student-qdot.cjs [그림 폴더]
'use strict';
const { startWorld } = require('./student-lib.cjs');
(async () => {
    const W = await startWorld({ shots: process.argv[2] });
    const out = [];
    const note = (k, v) => out.push([k, v]);
    let dead = false;
    const walk = async (name, fn) => { if (dead) return; try { await fn(); } catch (e) { note('막힘@' + name, String(e.message).split('\n')[0]); dead = true; } };
    const see = async (pg, k, full) => { note(k, { 글: (await W.text(pg)).replace(/\n/g, ' / ').slice(0, 1200), 점검: await W.check(pg, 44) }); await W.shot(pg, k, full); };
    try {
        const cls = await W.createClass({ exp: 'qdot', ban: 2, nStudents: 24, groupSize: 4 });   // 교사: 2반 24명 6조, 1 목적만 열림
        const L1 = await W.student('1조노트북', 'laptop');
        await walk('노트북 입장', async () => {
            await L1.goto(W.ROOT + 'index.html'); await W.tap(L1, '학생'); await L1.getByPlaceholder('2-4821').fill(cls.classCode); await W.tap(L1, '들어가기'); await L1.waitForTimeout(1500);
            await see(L1, '노트북 첫 화면'); note('단추', await W.buttons(L1));
        });
        const band = async pg => (await pg.locator('[class*="cs-"]').locator('visible=true').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 500);
        const cur = pg => pg.evaluate(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.textContent.trim() : ''; });
        const join = async (pg, jo, num) => { await pg.locator('select').locator('visible=true').nth(pg === L1 || /노트북/.test(pg.vcName) ? 1 : 0).selectOption({ label: new RegExp('^' + jo + '조').test('') ? '' : undefined }).catch(() => {}); };
        await walk('1조 참여', async () => {
            const sel = L1.locator('select').locator('visible=true');
            await sel.nth(1).selectOption({ index: 1 }); await L1.waitForTimeout(300); note('번호 보기', await sel.nth(2).locator('option').allInnerTexts()); await sel.nth(2).selectOption({ index: 1 });
            await W.tap(L1, '참여하기'); await L1.waitForTimeout(1500); note('참여 뒤 띠', await band(L1)); await W.shot(L1, '참여 뒤');
            await W.tap(L1, '이론', 0, true); await L1.waitForTimeout(500); note('잠긴 2 이론 누른 뒤', { 지금단계: await cur(L1), 띠: await band(L1) }); await W.shot(L1, '잠긴 이론 누름');
            await W.tap(L1, '다음: 2. 이론', 0, true); await L1.waitForTimeout(500); note('아래 다음 단추 누른 뒤', { 지금단계: await cur(L1) });
        });
        // 3조 학생: 폰으로 QR, 조를 2조로 잘못 고름
        const P3 = await W.student('3조폰', 'phone');
        await walk('3조 잘못 고름', async () => {
            await P3.goto(W.classUrl(cls, 'projects/quantum-dot.html')); await P3.waitForTimeout(1500); await see(P3, '폰 QR 첫 화면');
            const sel = P3.locator('select').locator('visible=true'); note('폰 고르기 칸', await sel.evaluateAll(a => a.map(s => s.getAttribute('aria-label') || s.id)));
        });
        await walk('3조 → 2조로 잘못', async () => {
            await P3.locator('#cs-cjo').selectOption({ index: 2 }); await P3.locator('#cs-cnum').selectOption({ index: 2 }); await W.tap(P3, '참여하기'); await P3.waitForTimeout(1200);
            note('잘못 들어간 뒤 띠', await band(P3)); await W.shot(P3, '2조로 들어감');
            await W.tap(P3, '조·번호 바꾸기'); await P3.waitForTimeout(500); await W.shot(P3, '바꾸기 누름'); note('바꾸기 화면 단추', (await W.buttons(P3)).slice(0, 8));
            await P3.locator('#cs-cjo').selectOption({ index: 3 }); await P3.locator('#cs-cnum').selectOption({ index: 0 }); await W.tap(P3, '참여하기'); await P3.waitForTimeout(1200); note('고친 뒤 띠', await band(P3));
        });
        await walk('교사 3·4·5 잇달아 열기', async () => {
            await W.openStage(cls, 2); await L1.waitForTimeout(2500); note('2 열림: 노트북/폰 단계', [await cur(L1), await cur(P3)]);
            for (const st of [3, 4, 5]) { await W.openStage(cls, st); await L1.waitForTimeout(900); }
            await L1.waitForTimeout(2500); note('3·4·5 잇달아 연 뒤 노트북/폰 단계', [await cur(L1), await cur(P3)]);
            await see(L1, '노트북 5 데이터', true); await see(P3, '폰(QR 로 들어온 학생) 5 데이터', true);
        });
        await walk('노트북 5 데이터', async () => {
            await L1.waitForTimeout(3000); note('3초 더 기다린 뒤 단계', [await cur(L1), await cur(P3)]);
            await W.tap(L1, /^5\s*데이터/); await L1.waitForTimeout(1200); await see(L1, '노트북 5 데이터 화면', true); note('5 데이터 단추', await W.buttons(L1));
            note('화면의 링크', await L1.evaluate(() => [...document.querySelectorAll('a[href*="role=phone"], [data-url], input[readonly]')].filter(e => e.offsetParent).map(e => (e.href || e.dataset.url || e.value || '').replace(/^https?:\/\/[^/]+\//, ''))));
        });
        const P1 = await W.student('1조폰', 'phone');
        let phoneUrl = '';
        await walk('폰 QR', async () => {
            phoneUrl = await L1.evaluate(() => (document.querySelector('a[href*="role=phone"]') || {}).href || '');
            await P1.goto(phoneUrl); await P1.waitForTimeout(2000); await see(P1, '폰 측정 첫 화면', true); note('폰 단추', await W.buttons(P1)); await W.shot(P1, '폰 측정 보이는 곳');
        });
        const pv = async (pg, k) => { note(k, { 글: (await W.text(pg)).split('\n').slice(15).join(' / ').slice(0, 1100), 단추: (await W.buttons(pg)).slice(5), 점검: await W.check(pg, 44) }); await W.shot(pg, k, true); };
        await walk('폰 ② 형광 색', async () => { await P1.locator('input[type=number]').locator('visible=true').first().fill('60'); await W.tap(P1, '다음: ② 형광 색'); await P1.waitForTimeout(2000); await pv(P1, '폰 ② 형광 색'); });
        await walk('폰 색 기록', async () => {
            await W.tap(P1, '카메라 켜기'); await P1.waitForTimeout(2500); await W.shot(P1, '카메라 켠 뒤', true);
            note('카메라 켠 뒤 글', (await W.text(P1)).split('\n').slice(23).join(' / ').slice(0, 700));
            await W.tap(P1, '노출 고정').catch(e => note('노출 고정 못 누름', e.message)); await P1.waitForTimeout(1500); note('노출 고정 뒤', (await W.text(P1)).split('\n').slice(23, 32).join(' / '));
            await W.tap(P1, '이 색 기록'); await P1.waitForTimeout(800); note('색 기록 뒤', (await W.text(P1)).split('\n').slice(23).join(' / ').slice(0, 700));
            await W.tap(P1, '다음: ③ 분광기'); await P1.waitForTimeout(1500); await pv(P1, '폰 ③ 분광기');
        });
        await walk('폰 분광기 기록(보정 없이) → 저장', async () => {
            await W.tap(P1, '시료 스펙트럼 기록'); await P1.waitForTimeout(800); note('보정 없이 스펙트럼 기록', (await W.text(P1)).split('\n').slice(-8).join(' / '));
            await W.tap(P1, '다음: ④ 저장'); await P1.waitForTimeout(1000); await pv(P1, '폰 ④ 저장');
        });
        await walk('저장·시료2·보내기', async () => {
            await W.tap(P1, '시료 저장'); await P1.waitForTimeout(1000); await pv(P1, '시료 1 저장 뒤'); await W.shot(P1, '저장 뒤 보이는 곳');
            note('저장 뒤 맨 위 띠', (await W.text(P1)).split('\n').slice(3, 12).join(' / '));
        });
        await walk('시료 2·3 + 보내기', async () => {
            for (const sec of ['120', '180']) {
                await W.tap(P1, '① 시료'); await P1.locator('input[type=number]').locator('visible=true').first().fill(sec); await W.tap(P1, '다음: ② 형광 색'); await P1.waitForTimeout(1200);
                await W.tap(P1, '이 색 기록'); await W.tap(P1, '건너뛰고 ④ 저장'); await W.tap(P1, '시료 저장'); await P1.waitForTimeout(600);
            }
            await W.tap(P1, '고른 회차 보내기'); await P1.waitForTimeout(3000); note('보낸 뒤 폰 띠', (await W.text(P1)).split('\n').slice(6, 26).join(' / ')); await W.shot(P1, '보낸 뒤 폰');
            await L1.waitForTimeout(4000); await see(L1, '노트북에 도착', true);
        });
        await walk('6 결과', async () => {
            await W.openStage(cls, 6); await L1.waitForTimeout(2500); note('6 열린 뒤 단계', await cur(L1)); await see(L1, '노트북 6 결과', true); note('6 결과 단추', (await W.buttons(L1)).slice(11));
        });
        await walk('7 결론(AI 꺼짐)', async () => {
            await W.openStage(cls, 7); await L1.waitForTimeout(2500); await see(L1, '노트북 7 결론', true); note('7 결론 단추', (await W.buttons(L1)).slice(11));
        });
        const rai = async pg => (await pg.locator('#report-ai').innerText()).replace(/\n+/g, ' / ');
        await walk('보고서 쓰기 + AI 꺼진 채 묻기', async () => {
            await W.tap(L1, '결론 및 검토'); await L1.waitForTimeout(400);
            const ta = L1.locator('#report-ai textarea').locator('visible=true');
            await ta.nth(0).fill('가열 시간이 60초에서 180초로 길어져도 형광 파장은 536~539 nm 로 거의 같았다. 따라서 우리 조 결과로는 가열 시간이 길수록 파장이 길어진다고 말하기 어렵다.');
            await L1.waitForTimeout(1200);
            note('글 쓴 뒤 저장 표시', (await rai(L1)).slice(0, 900));
            await W.tap(L1, 'AI에게 묻기').catch(e => note('프롬프트 없이 AI 묻기', e.message));
            await ta.nth(1).fill('내 결론에서 근거가 부족한 부분을 질문으로 알려 줘.'); await W.tap(L1, 'AI에게 묻기'); await L1.waitForTimeout(2500);
            note('AI 꺼진 채 물은 뒤', (await rai(L1)).slice(300, 1700)); await W.shot(L1, 'AI 꺼진 채 물음', true);
        });
        let desk = null;
        await walk('교사 AI 켬', async () => {
            const t0 = Date.now(); desk = await W.aiDesk();
            let got = null; while (Date.now() - t0 < 60000) { await L1.waitForTimeout(2000); if (/가짜 AI 답/.test(await rai(L1))) { got = Math.round((Date.now() - t0) / 1000); break; } }
            note('교사 AI 켠 뒤 답 오기까지(초, 교사 화면 여는 시간 포함)', got); note('답 온 뒤', (await rai(L1)).slice(300, 2000)); await W.shot(L1, 'AI 답', true);
            note('답 온 뒤 단추', await L1.locator('#report-ai button, #report-ai textarea, #report-ai input').locator('visible=true').evaluateAll(a => a.map(e => (e.disabled ? '(꺼짐)' : '') + (e.tagName === 'BUTTON' ? e.textContent.trim().slice(0, 24) : '[' + e.tagName.toLowerCase() + ' ' + (e.placeholder || e.type || '').slice(0, 30) + ']'))));
        });
        await walk('한도 오류 → 풀림, 메모, 제출', async () => {
            const ta = L1.locator('#report-ai textarea').locator('visible=true');
            desk.busy = true; await ta.nth(1).fill('오차 원인을 더 생각해 볼 질문을 줘.'); await W.tap(L1, 'AI에게 묻기'); await L1.waitForTimeout(9000);
            note('한도 오류 중 학생 화면', (await rai(L1)).slice(-500)); await W.shot(L1, '한도 오류 중', true);
            desk.busy = false; const t0 = Date.now(); let ok = null; while (Date.now() - t0 < 90000) { await L1.waitForTimeout(3000); if (/가짜 AI 답 [3-9]/.test(await rai(L1))) { ok = Math.round((Date.now() - t0) / 1000); break; } }
            note('한도 풀린 뒤 답까지(초)', ok || '90초가 지나도 답 없음: ' + (await rai(L1)).slice(-300));
            const memo = L1.locator('#report-ai textarea').locator('visible=true').nth(2); await memo.fill('표의 60초·180초 파장 숫자를 결론에 넣었다.'); await W.tap(L1, '메모 저장'); await L1.waitForTimeout(800); note('메모 저장 뒤', (await rai(L1)).slice(-260));
            await W.tap(L1, '제출·인쇄'); await L1.waitForTimeout(600); note('제출·인쇄 탭', (await rai(L1)).slice(520)); await W.shot(L1, '제출 탭', true);
            note('제출 탭 단추', await L1.locator('#report-ai button').locator('visible=true').evaluateAll(a => a.map(e => (e.disabled ? '(꺼짐)' : '') + e.textContent.trim().slice(0, 30))));
        });
        await walk('최종 제출', async () => {
            await W.tap(L1, '최종 제출'); await L1.waitForTimeout(1500); note('제출 뒤', (await rai(L1)).slice(480, 1100));
            await L1.reload(); await L1.waitForTimeout(2500); note('새로고침 뒤 단계·띠', [await cur(L1), (await band(L1)).slice(0, 120)]);
            await W.tap(L1, '결론 및 검토'); await L1.waitForTimeout(500); note('제출 뒤 다시 연 결론 칸', { 글: (await rai(L1)).slice(480, 900), 고칠수있나: await L1.locator('#report-ai textarea').locator('visible=true').first().isEditable().catch(() => '칸 없음') });
        });
        // 4조: 7 결론이 열린 뒤 늦게, 폰으로 메인 → 학생 → 코드
        const P4 = await W.student('4조폰(늦음)', 'phone');
        await walk('늦게 온 4조', async () => {
            await P4.goto(W.ROOT + 'index.html'); await W.tap(P4, '학생'); await P4.getByPlaceholder('2-4821').fill(cls.classCode); await W.tap(P4, '들어가기'); await P4.waitForTimeout(1500);
            await P4.locator('#cs-cjo').selectOption({ index: 4 }); await P4.locator('#cs-cnum').selectOption({ index: 0 }); await W.tap(P4, '참여하기'); await P4.waitForTimeout(2500);
            note('늦게 들어온 직후 단계', await cur(P4)); await W.shot(P4, '늦게 들어온 직후');
            await W.tap(P4, /^5\s*데이터/); await P4.waitForTimeout(1000); note('폰으로 연 5 데이터(역할 폰 아님)', { 글: (await W.text(P4)).split('\n').slice(22, 40).join(' / ').slice(0, 700), 점검: await W.check(P4) }); await W.shot(P4, '폰 5 데이터', true);
        });
        // 수업 없이: 노트북에서 페이지를 바로 열어 폰 → 노트북 보내기가 되는지
        const LN = await W.student('수업없는노트북', 'laptop'), PN = await W.student('수업없는폰', 'phone');
        await walk('수업 없이 폰→노트북', async () => {
            await LN.goto(W.ROOT + 'projects/quantum-dot.html#step-5'); await LN.waitForTimeout(2500); note('수업 없는 노트북 5 데이터', (await W.text(LN)).split('\n').slice(5, 30).join(' / ').slice(0, 900)); await W.shot(LN, '수업 없는 노트북', true);
            const u = await LN.evaluate(() => (document.querySelector('a[href*="role=phone"]') || {}).href || ''); note('폰 주소', u.replace(/^https?:\/\/[^/]+\//, ''));
            if (!u) return;
            await PN.goto(u); await PN.waitForTimeout(2000); await W.tap(PN, '다음: ② 형광 색'); await W.tap(PN, '카메라 켜기'); await PN.waitForTimeout(2500); await W.tap(PN, '이 색 기록'); await W.tap(PN, '건너뛰고 ④ 저장'); await W.tap(PN, '시료 저장'); await W.tap(PN, '고른 회차 보내기'); await PN.waitForTimeout(3000);
            note('수업 없는 폰 보낸 뒤', (await W.text(PN)).split('\n').slice(6, 16).join(' / ')); await LN.waitForTimeout(4000); note('수업 없는 노트북 도착', (await W.text(LN)).split('\n').filter(l => /🆕|기다리는/.test(l)));
        });
        // STEPS
    } finally {
        out.push(['알림 창', W.dialogs], ['오류', W.errors]);
        console.log(JSON.stringify(out, null, 1));
        await W.close();
    }
})();
