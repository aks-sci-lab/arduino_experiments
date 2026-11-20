// 가상 수업(교사 역할) ② 탄소 양자점 형광 — 7단계 수업(2반) 한 번 + 가설연역 6단계 수업(3반) 한 번
//   node tools/virtual-class/teacher-qdot.cjs [그림 폴더]
// 교사: 노트북 1280×720(발표 보기는 1920×1080 도). 학생(미리 짠 움직임): 조 노트북 L1(1조)·L2(2조)·L3(3조인데 2조를 고름)·L4(4조, 늦게)·L6(6조, 1 목적에 멈춤), 5조는 안 옴.
//   폰 PH1·PH2·PH3 는 노트북의 '📱 폰으로 측정해 보내기' 주소로 열어 형광 색만 측정(가짜 카메라). 보고서 AI 는 가짜 AI 서버.
// 수업 기록: docs/virtual-class/teacher/quantum-dot.md
'use strict';
const path = require('node:path');
const VC = require('./teacher-lib.cjs');

(async () => {
    const S = await VC.start({ shots: process.argv[2] || path.join(process.cwd(), 'vc-shots', 'qdot') });
    const note = (k, v) => console.log('── ' + k + '\n' + (typeof v === 'string' ? v : JSON.stringify(v, null, 1)));
    const lines = async (pg, re) => (await S.seen(pg)).split('\n').filter(l => re.test(l));
    const stepOf = pg => pg.evaluate(() => document.querySelector('nav.steps button[aria-selected="true"]').innerText.replace(/\s+/g, ' '));
    const join = async (pg, jo, num) => { await pg.waitForSelector('#cs-cpick:not([hidden])'); await pg.selectOption('#cs-cjo', String(jo)); await pg.selectOption('#cs-cnum', String(num)); await pg.click('#cs-cjoin'); await pg.waitForTimeout(1200); };
    const phoneOf = async (lap, name) => { const href = await lap.getAttribute('#phone-card a[href*="role=phone"]', 'href'); const ph = await S.phone(name); await ph.goto(S.local(href)); await ph.waitForTimeout(1500); return ph; };
    const measure = async (ph, heat, urea) => { await ph.click('#qdTabs button[data-tab=sample]'); await ph.fill('#in-heat', String(heat)); if (urea) await ph.fill('#in-urea', String(urea));
        await ph.click('#qdTabs button[data-tab=color]'); if (await ph.locator('#btn-cam:visible').count()) { await ph.click('#btn-cam'); await ph.waitForTimeout(1500); } await ph.click('#btn-color'); await ph.waitForTimeout(600);
        await ph.click('#qdTabs button[data-tab=save]'); await ph.click('#btn-save'); await ph.waitForTimeout(500); };
    const openNext = async T => { await T.evaluate(() => scrollTo(0, 0)); await S.tap(T, '다음 단계 열기'); await T.waitForTimeout(4000); };
    // 발표 보기에서 리모컨(→)을 '열까요?'가 나올 때까지 누르며 지나간 작은 탭 이름을 모음
    const remote = async (T, max) => { const fr = T.frames()[1], seen = []; for (let i = 0; i < (max || 14); i++) { await T.keyboard.press('ArrowRight'); await T.waitForTimeout(450);
        const ask = (await S.seen(T)).split('\n').find(l => /열까요/.test(l)); if (ask) { seen.push(ask); break; }
        seen.push(await fr.evaluate(() => [...document.querySelectorAll('.step-panel:not([hidden]) .subtabs button[aria-selected="true"]')].filter(x => x.offsetParent).map(x => x.innerText).join('|') || '(탭 없음)')); } return seen; };
    try {
        // ───────── 수업 전 ─────────
        const T = await S.teacher({ width: 1280, height: 720 });
        await T.goto(S.ROOT + 'index.html'); await S.tap(T, '교사'); await S.tap(T, '수업 진행 화면'); await S.tap(T, '구글 계정으로 로그인'); await S.tap(T, '새 수업 만들기');
        await T.fill('#inBan', '2'); await T.selectOption('#inExp', { label: '🌈 탄소 양자점 형광 실험' }); await S.tap(T, '수업 만들기', 'last');
        const link = await T.getAttribute('#outLink', 'href'), stu = S.local(link); await S.shot(T, '큰QR');
        note('큰 QR 화면에 노트북용 사이트 주소가 크게 보이는가', await lines(T, /메인 페이지|web\.app|http/));
        await S.tap(T, '진행 보기'); await T.evaluate(() => scrollTo(0, 0)); await S.shot(T, '진행-빈');

        // ───────── 0~5분: 조 노트북 입장 (1 목적) ─────────
        const L1 = await S.laptop('L1'); await L1.goto(S.ROOT + 'index.html'); await S.tap(L1, '학생'); await L1.fill('#joinCode', (/c=([\d-]+)/.exec(link) || [])[1]); await S.tap(L1, '들어가기'); await L1.waitForTimeout(1500); await join(L1, 1, 1);
        const L2 = await S.laptop('L2'); await L2.goto(stu); await join(L2, 2, 1);
        const L3 = await S.laptop('L3'); await L3.goto(stu); await join(L3, 2, 2);   // 3조인데 2조를 고름
        await T.waitForTimeout(2500); await S.shot(T, '진행-3대');
        note('조 카드(3조가 2조를 잘못 고른 상태)', (await S.seen(T)).split('\n').slice(27, 60).join(' / '));

        // ───────── 5~15분: 🎬 발표 보기로 1 목적 → 2 이론 ─────────
        await S.tap(T, '발표 보기'); await T.waitForTimeout(1500); await S.shot(T, '발표-1목적');
        const fr = T.frames()[1];
        note('발표 화면 크기·글자 크기(글자 수)', { 틀: await T.evaluate(() => { const f = document.querySelector('iframe').getBoundingClientRect(); return Math.round(f.width) + '×' + Math.round(f.height); }),
            글자: await fr.evaluate(() => { const m = {}; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode())) { const s = t.nodeValue.trim(), p = t.parentElement; if (!s || !p || !p.offsetParent) continue; const f = Math.round(parseFloat(getComputedStyle(p).fontSize)) + 'px'; m[f] = (m[f] || 0) + s.length; } return m; }) });
        note('1 목적에서 리모컨 →', await remote(T, 2)); await T.keyboard.press('Enter'); await T.waitForTimeout(2500); await S.shot(T, '발표-2이론');
        note('2 이론: 글이 틀 아래로 잘리는가(전체 높이 / 보이는 높이)', await fr.evaluate(() => document.documentElement.scrollHeight + ' / ' + innerHeight));
        note('2 이론에서 리모컨 → 끝까지', await remote(T)); await T.keyboard.press('Escape');
        await T.keyboard.press('Alt+b'); await T.waitForTimeout(400); await S.shot(T, '발표-AltB'); await T.keyboard.press('Alt+b');
        await T.setViewportSize({ width: 1920, height: 1080 }); await T.waitForTimeout(400); await S.shot(T, '발표-1920'); await T.setViewportSize({ width: 1280, height: 720 });
        await S.tap(T, '진행 화면으로');

        // ───────── 15~45분: 3 준비물 · 4 과정 · 5 데이터 (폰 측정) ─────────
        await openNext(T); await openNext(T); await openNext(T);
        note('5 데이터까지 연 뒤 조 노트북이 보고 있는 단계', { L1: await stepOf(L1), L2: await stepOf(L2), L3: await stepOf(L3) });
        const PH1 = await phoneOf(L1, 'PH1'); await S.shot(PH1, '조1폰');
        await measure(PH1, 60); await measure(PH1, 120); await measure(PH1, 180); await PH1.click('#cs-rsend'); await PH1.waitForTimeout(2500);
        const PH2 = await phoneOf(L2, 'PH2'); await measure(PH2, 90); await PH2.click('#cs-rsend'); await PH2.waitForTimeout(1500);
        if (await stepOf(L3) !== '5 데이터') await L3.click('nav.steps button[data-step="data"]'); await L3.waitForTimeout(1500);
        const PH3 = await phoneOf(L3, 'PH3'); await measure(PH3, 150, 2); await PH3.click('#cs-rsend'); await PH3.waitForTimeout(1500);
        const L4 = await S.laptop('L4'); await L4.goto(stu); await join(L4, 4, 1);
        note('늦게 들어온 4조 노트북이 처음 보는 단계(수업은 5 데이터)', await stepOf(L4));
        const L6 = await S.laptop('L6'); await L6.goto(stu); await join(L6, 6, 1); await L6.click('nav.steps button[data-step="purpose"]');
        await T.waitForTimeout(3000); await T.evaluate(() => scrollTo(0, 0)); await S.shot(T, '진행-5데이터중', true);
        note('교사 조 카드(5 데이터 중)', (await S.seen(T)).split('\n').slice(23).join(' / '));

        // ───────── 45~50분(2차시): 6 결과 · 7 결론 · 보고서 AI ─────────
        await openNext(T); await openNext(T);
        await L1.click('nav.steps button[data-step="conclusion"]'); await L1.waitForTimeout(800); await S.shot(L1, '조1-7결론', true);
        await L1.fill('#rai-t-theory', '양자점은 작을수록 띠 틈이 커져서 파란 빛이 나온다.'); await L1.fill('#rai-p-theory', '내 이론 정리에서 빠진 개념이 있는지 질문으로 알려 줘'); await L1.click('[data-askbtn="theory"]'); await L1.waitForTimeout(2500);
        note('교사 AI 가 꺼진 채 학생이 질문하면(학생 화면)', await lines(L1, /기다리는 중|꺼져/));
        await T.evaluate(() => scrollTo(0, 0)); note('그때 교사 진행 화면에 AI 에 관한 글이 있는가', await lines(T, /AI|🤖/)); await S.shot(T, '진행-AI질문기다림');
        await S.tap(T, '설정'); await S.tap(T, '보고서 AI'); await S.shot(T, '보고서AI설정', true);
        await T.fill('#aiKey', 'wrong-key'); await S.tap(T, '키 시험'); await T.waitForTimeout(1500); note('틀린 키', (await lines(T, /마지막 오류/))[0]);
        await T.fill('#aiKey', S.FAKE_AI_KEY); await S.tap(T, '키 시험'); await T.waitForTimeout(2500); if (!await T.isChecked('#aiOn')) await T.check('#aiOn');
        await T.waitForTimeout(6000); note('맞는 키 → 켜짐', await lines(T, /✅ 키가|🟢 AI/)); note('학생 화면 답', await lines(L1, /가짜 답|선생님 화면이 켜져/));
        await S.tap(T, '돌아가기'); await T.reload(); await T.waitForTimeout(2000);
        await L1.fill('#rai-p-theory', '한 번 더 봐 줘'); await L1.click('[data-askbtn="theory"]'); await L1.waitForTimeout(8000);
        note('교사가 진행 화면으로 돌아가 새로고침한 뒤에도 답이 가는가', await lines(L1, /가짜 답 2|기다리는 중/));
        S.ai.fail = 429; await L1.fill('#rai-p-theory', '세 번째 질문'); await L1.click('[data-askbtn="theory"]'); await L1.waitForTimeout(7000);
        note('AI 한도 오류(429) 때 학생 화면', await lines(L1, /기다리는 중|만드는 중|한도|오류/));
        await T.evaluate(() => scrollTo(0, 0)); note('AI 한도 오류 때 교사 진행 화면', await lines(T, /AI|🤖|오류|한도/));
        await S.tap(T, '설정'); await S.tap(T, '보고서 AI'); note('AI 한도 오류 때 ⚙ 설정 → 보고서 AI', await lines(T, /마지막 오류/));
        S.ai.fail = 0; await L1.waitForTimeout(25000); note('오류가 풀린 뒤', await lines(L1, /가짜 답 3|기다리는 중|만드는 중/));
        await L1.click('.rai-tabs button[data-tab="submit"]'); await L1.click('#rai-submit'); await L1.waitForTimeout(1500);
        await S.tap(T, '새로 보기', 'last'); await T.waitForTimeout(1200); note('조별 보고서 표', ((await S.seen(T)).match(/조\tAI 질문[\s\S]*?6조[^\n]*/) || [''])[0]);
        await T.locator('#aiGroups button[data-aig]').first().click(); await T.waitForTimeout(800); await S.shot(T, '보고서보기', true);

        // ───────── 다른 반(3반) 가설연역 수업 만들기 → 목록에서 구별되는가 ─────────
        await S.tap(T, '수업 만들기·내 수업'); await T.fill('#inBan', '3'); await T.selectOption('#inExp', { label: '🌈 탄소 양자점 형광 실험' }); await T.locator('input[value="hd"]').check();
        await S.tap(T, '수업 만들기', 'last'); await T.waitForTimeout(800); const link2 = await T.getAttribute('#outLink', 'href');
        await S.tap(T, '수업 목록'); await S.shot(T, '목록-두수업'); note('수업 목록 카드', (await S.seen(T)).split('\n').slice(5, 19).join(' / '));
        await T.locator('#classList button[data-open]').first().click(); await T.waitForTimeout(600); await S.tap(T, '진행 보기'); await T.evaluate(() => scrollTo(0, 0)); await S.shot(T, '가설연역-진행');
        note('가설연역 수업 단계 이름', (await lines(T, /^(🔓|🔒|①|▶)/)).join(' / '));

        // ───────── 가설연역 수업 ─────────
        const H1 = await S.laptop('H1'); await H1.goto(S.local(link2)); await join(H1, 1, 1); await S.shot(H1, '가설연역-①', true);
        note('학생 단계 탭(가설연역)', await H1.evaluate(() => [...document.querySelectorAll('nav.steps button')].filter(b => b.offsetParent).map(b => b.innerText.replace(/\s+/g, ' ') + (b.classList.contains('cs-locked') ? ' 🔒' : ''))));
        await openNext(T); await S.shot(H1, '가설연역-②가설', true);
        await H1.locator('.rai-inline textarea:visible').first().fill('만약 가열 시간이 길어지면 형광 파장이 길어질 것이다. 왜냐하면 양자점이 커져 띠 틈이 작아지기 때문이다.'); await H1.waitForTimeout(1500);
        note('가설 쓰기 칸 안내', await lines(H1, /가설 쓰기|보고서에 같이 저장/));
        await S.tap(T, '발표 보기'); await T.waitForTimeout(1500); await S.shot(T, '발표-가설연역②');
        note('발표 ② 에서 리모컨 →', await remote(T)); await T.keyboard.press('Enter'); await T.waitForTimeout(2500);
        note('발표 ③ 탐구 설계(준비물+과정)에서 리모컨 →', await remote(T)); await S.shot(T, '발표-가설연역③'); await T.keyboard.press('Enter'); await T.waitForTimeout(2500);
        await S.tap(T, '진행 화면으로');
        const PHh = await phoneOf(H1, 'PHh'); await measure(PHh, 60); await measure(PHh, 180); await PHh.click('#cs-rsend'); await PHh.waitForTimeout(2000);
        await openNext(T); await openNext(T);
        await H1.click('nav.steps button:has-text("결론 도출")'); await H1.waitForTimeout(1000); await S.shot(H1, '가설연역-⑥결론', true);
        await H1.locator('#rai-in-verdict').fill('180초 시료의 파장이 더 길었다. 가설을 지지한다.'); await H1.locator('.rai-verdict input[value="지지"]').check(); await H1.waitForTimeout(2000);
        await S.tap(T, '설정'); await S.tap(T, '보고서 AI'); await T.waitForTimeout(500);
        note('3반 진행 화면에서 ⚙ 설정 → 보고서 AI 로 왔을 때 골라져 있는 수업', await T.evaluate(() => [...document.getElementById('aiView').options].map(o => o.textContent + (o.selected ? ' ✔' : ''))));
        await T.selectOption('#aiView', { index: 0 }); await T.waitForTimeout(1500); await T.locator('#aiGroups button[data-aig]').first().click(); await T.waitForTimeout(800);
        note('교사가 보는 가설연역 보고서', (await S.seen(T)).split('\n').slice(-9).join(' / ')); await S.shot(T, '가설연역-보고서보기', true);

        note('알림 창·오류', S.log.filter(l => l.kind !== 'console'));
    } finally { await S.close(); }
})().catch(e => { console.error(e); process.exit(1); });
