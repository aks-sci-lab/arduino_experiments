// 가상 수업(교사 역할) ⑩ 선생님이 만든 실험 (가설연역 6단계 · 7단계 방식)
//   node tools/virtual-class/teacher-custom.cjs [그림 폴더]
// 이 환경에서는 Firebase 로그인이 안 되어 '➕ 새 실험 만들기'(만들기 화면)는 열 수 없다. 그래서 실험 설정(옴의 법칙 확인, 번호 ohm01)을
// 학생 브라우저에 저장된 설정(localStorage customLabDef:v1:ohm01, tests/custom-lab-report-ai-ui.test.cjs 와 같은 방법)으로 넣고,
// 교사는 수업 만들기에서 '선생님이 만든 실험…' + 번호로 수업을 만든다. 볼 것: 진행 화면에 단계 열기·발표 보기가 있는지, 학생 단계가 잠기는지,
// 표 값을 보낸 뒤 조 카드 요약, ⚙ 설정 → 보고서 AI 의 조별 표.
'use strict';
const path = require('node:path');
const VC = require('./teacher-lib.cjs');
const M = require(path.join(VC.REPO, 'js/custom-lab-math.js'));
const def = layout => JSON.stringify(M.normalizeDefinition({ title: '옴의 법칙 확인', description: '[목표] 전압과 전류의 관계를 알아본다', published: true, layout,
    columns: [{ name: '전압', unit: 'V' }, { name: '전류', unit: 'mA' }], xCol: 0, yCol: 1, fit: 'proportional', questions: ['기울기는 무엇을 뜻하나요?'],
    stepTexts: { theory: '옴의 법칙: V = IR', materials: '건전지, 저항, 멀티미터', procedure: '전압을 바꿔 가며 전류를 잰다' } }));
(async () => {
    const S = await VC.start({ shots: process.argv[2] || path.join(process.cwd(), 'vc-shots', 'custom') });
    const note = (k, v) => console.log('── ' + k + '\n' + (typeof v === 'string' ? v : JSON.stringify(v, null, 1)));
    const steps = pg => pg.evaluate(() => [...document.querySelectorAll('nav.steps button')].filter(b => b.offsetParent).map(b => b.innerText.replace(/\s+/g, ' ') + (b.classList.contains('cs-locked') ? '🔒' : '')));
    try {
        const T = await S.teacher({ width: 1920, height: 1080 });
        await T.goto(S.ROOT + 'projects/custom-lab.html?edit=new'); await T.waitForTimeout(2500); note('만들기 화면(이 환경)', (await S.seen(T)).slice(0, 200));
        await T.goto(S.ROOT + 'projects/class-teacher.html'); await S.tap(T, '구글 계정으로 로그인'); await S.tap(T, '새 수업 만들기');
        await T.selectOption('#inExp', { label: '👩‍🏫 선생님이 만든 실험…' }); await T.waitForTimeout(400); await S.shot(T, '수업만들기-만든실험', true);
        note('만든 실험을 고르는 칸', (await S.buttons(T)).filter(b => /inCustom/.test(b)));
        note('진행 방법(7단계/가설연역) 고르기가 보이는가', await T.locator('input[value="hd"]').isVisible());
        await T.fill('#inCustom', 'ohm01'); await T.locator('#inCustom').blur(); await T.waitForTimeout(2500);
        note('번호를 넣은 뒤 안내', (await S.seen(T)).split('\n').filter(l => /공개 여부|공개된/.test(l)));
        await S.tap(T, '수업 만들기', 'last'); await T.waitForTimeout(2500); const link = await T.getAttribute('#outLink', 'href');
        note('만든 수업 이름', (await S.seen(T)).split('\n')[4]);
        await S.tap(T, '진행 보기'); await T.evaluate(() => scrollTo(0, 0)); await S.shot(T, '진행');
        note('진행 화면 윗줄(단계 열기 카드·발표 보기가 있는가)', (await S.seen(T)).split('\n').slice(4, 12).join(' / '));
        const L = await S.laptop('L1'); await L.context().addInitScript(d => { try { localStorage.setItem('customLabDef:v1:ohm01', d); } catch (e) { /* 무시 */ } }, def('hd'));
        await L.goto(S.local(link)); await L.waitForTimeout(2000); await L.selectOption('#cs-cjo', '1'); await L.selectOption('#cs-cnum', '1'); await L.click('#cs-cjoin'); await L.waitForTimeout(1500);
        note('학생 단계 탭(가설연역 방식 실험, 새 수업) — 잠겼는가', await steps(L)); await S.shot(L, '학생-①', true);
        note('학생 ① 화면의 학번·이름 칸', (await S.seen(L)).split('\n').filter(l => /학번|인쇄·PDF/.test(l)));
        const go = async n => { await L.click('nav.steps button:has-text("' + n + '")'); await L.waitForTimeout(600); };
        await go('가설 설정'); await L.locator('.rai-inline textarea:visible').first().fill('만약 전압을 2배로 하면 전류도 2배가 될 것이다. 왜냐하면 저항이 일정하기 때문이다.');
        await go('탐구 설계'); note('③ 탐구 설계 쓰기 칸 안내', (await S.seen(L)).split('\n').filter(l => /탐구 설계 쓰기/.test(l)));
        await go('탐구 수행'); const cells = await L.locator('table input').all(); const rows = [[1, 0.9], [2, 2.1], [3, 3.0], [4, 4.2]];
        for (let i = 0; i < rows.length; i++) { await cells[i * 2].fill(String(rows[i][0])); await cells[i * 2 + 1].fill(String(rows[i][1])); } await L.keyboard.press('Tab'); await L.waitForTimeout(500); await S.shot(L, '학생-④', true);
        await L.click('#cs-send'); await L.waitForTimeout(2500);
        await go('자료 해석'); note('⑤ 맞춤 결과', (await S.seen(L)).split('\n').filter(l => /맞춤 결과/.test(l)));
        await go('결론 도출'); await S.shot(L, '학생-⑥', true); note('⑥ 에 있는 보내기·제출', (await S.seen(L)).split('\n').filter(l => /^📤|^🖨|제출·인쇄/.test(l)));
        await T.waitForTimeout(2500); note('교사 조 카드(1조)', (await S.seen(T)).split('\n').slice(15, 22).join(' / '));
        const L7 = await S.laptop('L7'); await L7.context().addInitScript(d => { try { localStorage.setItem('customLabDef:v1:ohm01', d); } catch (e) { /* 무시 */ } }, def('steps'));
        await L7.goto(S.local(link)); await L7.waitForTimeout(2000); note('7단계 방식 설정이면 학생 단계 탭', await steps(L7));
        await S.tap(T, '설정'); await S.tap(T, '보고서 AI'); await T.waitForTimeout(600); await S.tap(T, '새로 보기', 'last'); await T.waitForTimeout(1200);
        note('⚙ 설정 → 보고서 AI 조별 표', ((await S.seen(T)).match(/조\tAI 질문[\s\S]*?2조[^\n]*/) || [''])[0]);
        note('알림 창·오류', S.log.filter(l => l.kind !== 'console'));
    } finally { await S.close(); }
})().catch(e => { console.error(e); process.exit(1); });
