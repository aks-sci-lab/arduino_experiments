// 확인 합동 수업 ② 탄소 양자점(고친 판 2: #153 현상·물음·우리 생각, 변인 카드·예상, 내는 곳 하나 / #154 진행 표시) — 학생 쪽 차례.
//   VC_REPO=<고친 판 폴더> VC_NPM=… node tools/virtual-class/student-live-qdot2.cjs <상태 폴더> <차례> [교사 묶음.json]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { openLive } = require('./student-live.cjs');
const NOTES = 'quantum-dot-notes-v1', CODE = '2-2266', SP = 'labClasses/cgc2as6qmm85qu89e655tedf', PAGE = 'projects/quantum-dot.html?c=2-2266&s=cgc2as6qmm85qu89e655tedf';
(async () => {
    const [dir, turnArg, bundleFile] = process.argv.slice(2), turn = +turnArg;
    const live = await openLive(dir), W = live.W, out = [];
    const note = (k, v) => out.push([k, v]);
    const teacher = () => { if (bundleFile) live.apply(JSON.parse(fs.readFileSync(bundleFile, 'utf8'))); };
    const setStage = n => { W.app.db.docs.get(SP).stage = n; };
    const cur = pg => pg.evaluate(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.textContent.trim() : ''; });
    const band = async pg => ((await W.text(pg)).split('\n').find(l => /^나: /.test(l)) || '(참여 안 함)').slice(0, 40);
    const join = async (pg, jo, num) => { await pg.locator('#cs-cjo').selectOption({ index: jo }); await pg.locator('#cs-cnum').selectOption({ index: num - 1 }); await W.tap(pg, '참여하기'); await pg.waitForTimeout(1200); };
    const panel = async (pg, re, n) => (await pg.locator('.step-panel').locator('visible=true').first().innerText()).split('\n').filter(l => re.test(l)).slice(0, n || 6);
    const vis = (pg, sel) => pg.locator(sel).locator('visible=true');
    const card = async (pg, what, pred, same, why) => {   // 4 과정 변인 카드: 바꿀 것 · 같게 둘 것 · 예상 · 까닭
        if (what) await vis(pg, 'input[type=radio][value=' + what + ']').first().check();
        if (same) await pg.getByPlaceholder(/그 밖에 같게 둘 것/).locator('visible=true').first().fill(same);
        if (pred) await vis(pg, 'input[type=radio][value=' + pred + ']').first().check();
        if (why) await pg.getByPlaceholder(/왜 그렇게 생각해요/).locator('visible=true').first().fill(why);
        await pg.waitForTimeout(600);
    };
    const sample = async (P, o) => {   // 폰(또는 폰만 가진 조의 5 데이터) 시료 하나. o: { heat, urea, what, upto: 'save'|'color'|'info' }
        await W.tap(P, '① 시료'); const num = vis(P, '.step-panel input[type=number], main input[type=number]');
        if (o.heat != null) await num.nth(0).fill(String(o.heat)); if (o.urea != null) await num.nth(2).fill(String(o.urea));
        if (o.what) await vis(P, 'input[type=radio][value=' + o.what + ']').last().check().catch(() => {});
        await P.waitForTimeout(500); const warn = (await W.text(P)).split('\n').filter(l => /⚠|함께 바꿨|두 가지|같게/.test(l)).slice(0, 4);
        if (o.upto === 'info') return warn;
        await W.tap(P, '다음: ② 형광 색'); await P.waitForTimeout(800); if (await P.getByText('카메라 켜기').locator('visible=true').count()) { await W.tap(P, '카메라 켜기'); await P.waitForTimeout(2500); }
        if (o.upto === 'color') return warn;
        await W.tap(P, '이 색 기록'); await W.tap(P, '건너뛰고 ④ 저장'); const before = (await W.text(P)).split('\n').filter(l => /⚠|함께 바꿨|두 가지/.test(l)).slice(0, 3); await W.tap(P, '시료 저장'); await P.waitForTimeout(600);
        return warn.concat(before);
    };
    const T = {
        1: async () => {   // 0~45분
            teacher();
            const L1 = await live.student('1조노트북', 'laptop'), L2 = await live.student('2조노트북', 'laptop'), P3 = await live.student('3조폰', 'phone');
            await L1.goto(W.ROOT + 'index.html'); await W.tap(L1, '학생'); await L1.getByPlaceholder('2-4821').fill(CODE); await W.tap(L1, '들어가기'); await L1.waitForTimeout(1500); await join(L1, 1, 1);
            await L2.goto(W.ROOT + PAGE); await L2.waitForTimeout(1500); await join(L2, 2, 1);
            await P3.goto(W.ROOT + PAGE); await P3.waitForTimeout(1500); await join(P3, 2, 2); await L1.waitForTimeout(2000);
            note('3조가 2조 2번으로 있을 때 저장소 자리', [...W.app.db.docs.keys()].filter(k => /progress/.test(k)).map(k => k.split('/').pop()));
            await W.tap(P3, '조·번호 바꾸기'); await P3.waitForTimeout(500); await join(P3, 3, 1); await L1.waitForTimeout(2500);
            note('3조가 고친 뒤 저장소 자리', [...W.app.db.docs.keys()].filter(k => /progress/.test(k)).map(k => k.split('/').pop()));
            await W.shot(P3, '3조 폰 1 목적'); note('3조 폰 1 목적 화면 길이', (await W.check(P3)).pages);
            await L1.locator('#rai-in-problem').fill('B, C 로 갈수록 오래 가열해서 알갱이가 달라져 색이 초록 쪽으로 바뀐 것 같다.');
            await L2.locator('#rai-in-problem').fill('더 타서?');
            await P3.locator('#rai-in-problem').fill('가열을 오래 하면 뜨거워져서 색이 바뀐다.');
            await L1.waitForTimeout(1500); note('1조 우리 생각 저장 표시', await panel(L1, /저장|💾|☁️/, 3));
            await W.tap(L1, '실험 목적 · 하는 일 보기').catch(() => {});
            setStage(2); await L1.waitForTimeout(6000); setStage(3); await L1.waitForTimeout(6000);
            const P4 = await live.student('4조폰', 'phone'); await P4.goto(W.ROOT + PAGE); await P4.waitForTimeout(1500); await join(P4, 4, 1); note('4조 늦게 들어온 직후 단계', await cur(P4));
            setStage(4); await L1.waitForTimeout(6000); note('4 과정이 열린 뒤 단계', Object.fromEntries(await Promise.all(Object.entries(W.pages).map(async ([n, pg]) => [n, await cur(pg)]))));
            await card(L1, 'heat', 'up', '같은 컵, 같은 전자레인지, 희석 1:10', '오래 가열하면 알갱이가 커져서'); note('1조 변인 카드 채운 뒤', await panel(L1, /🔒|같게|예상|바꿀 것/, 8)); await W.shot(L1, '1조 변인 카드');
            await card(L2, 'heat', 'unknown', '', '');
            if (!/4/.test(await cur(P3))) await W.tap(P3, /^4\s*과정/); await card(P3, 'heat', 'down', '', '뜨거우면 파래지니까'); note('3조 폰 4 과정 화면 길이', (await W.check(P3)).pages);
            setStage(5); await L1.waitForTimeout(6000);
            // 1조: QR → 폰. 시료 2개 보내고 세 번째(가열 시간과 요소를 함께 바꿈)를 재는 중
            const u = await L1.evaluate(() => (document.querySelector('a[href*="role=phone"]') || {}).href || ''); const P1 = await live.student('1조폰', 'phone'); await P1.goto(u); await P1.waitForTimeout(2000);
            note('1조 폰 ① 시료의 바꿀 것 줄', (await W.text(P1)).split('\n').filter(l => /바꿀 것|변인/.test(l)).slice(0, 3));
            await sample(P1, { heat: 60, what: 'heat' }); await sample(P1, { heat: 120 }); await P1.evaluate(() => scrollTo(0, 0)); await W.tap(P1, '고른 회차 보내기'); await P1.waitForTimeout(3000);
            note('1조 폰: 가열 시간과 요소를 함께 바꾼 세 번째 시료(① 화면)', await sample(P1, { heat: 180, urea: 2, upto: 'info' })); await W.shot(P1, '1조 폰 두 가지 바꿈', true);
            await W.tap(P1, '다음: ② 형광 색'); await P1.waitForTimeout(800); note('경고를 무시하고 ② 로(대충)', (await W.text(P1)).split('\n').filter(l => /⚠|함께|두 가지/.test(l)).slice(0, 3));
            await L1.waitForTimeout(3000); note('1조 노트북 5 데이터', await panel(L1, /🆕|기다리는|⚠/, 4));
            // 3조(폰 1대): 5 데이터에서 시료 1개 저장까지만
            if (!/5/.test(await cur(P3))) await W.tap(P3, /^5\s*데이터/); note('3조 폰 시료 저장', await sample(P3, { heat: 150, what: 'heat' })); await P3.waitForTimeout(2500);
            note('3조 폰 저장 뒤 화면', (await W.text(P3)).split('\n').filter(l => /저장했|보내|선생님|📤/.test(l)).slice(0, 6));
            // 4조(폰, 늦음): ① 시료 화면. 2조: 5 데이터에서 머뭇
            if (!/5/.test(await cur(P4))) await W.tap(P4, /^5\s*데이터/); await P4.waitForTimeout(600);
            note('2조 노트북 5 데이터에서 보이는 것', await panel(L2, /QR|기다리는|CSV|폰으로/, 4));
            await L1.waitForTimeout(4000);
            for (const [n, pg] of Object.entries(W.pages)) note('45분 ' + n, { 띠: await band(pg), 단계: await cur(pg) });
        },
        2: async () => {   // 45~75분: 6 결과(두 가지 바꾼 시료·내 예상 ↔ 결과) → 7 결론(쓸 곳 하나인지)
            setStage(5);
            const L1 = await live.student('1조노트북', 'laptop'), L2 = await live.student('2조노트북', 'laptop'), P3 = await live.student('3조폰', 'phone'), P4 = await live.student('4조폰', 'phone'), P1 = await live.student('1조폰', 'phone');
            // 2조 노트북은 '예전에 분석 질문 칸에 써 둔 글이 남은 기기'로 만든다 (예전 판이 쓰던 저장 자리에 글을 넣고 다시 엶)
            await L2.evaluate(k => localStorage.setItem(k, JSON.stringify({ q1: '(지난 학기) 가열 시간이 길수록 파장이 조금 길어졌다.', q4: '(지난 학기) 크기만으로는 설명이 안 되는 것 같다.' })), NOTES); await L2.reload(); await L2.waitForTimeout(2500);
            // 1조: 세 번째 시료(가열 180 + 요소 2, 경고 무시) 저장·보내기
            note('1조 폰 다시 연 화면의 ① 값', await P1.locator('input[type=number]').locator('visible=true').evaluateAll(a => a.slice(0, 3).map(e => e.value)).catch(() => '① 아님'));
            note('1조 세 번째 시료 저장 때 경고', await sample(P1, { heat: 180, urea: 2 })); await P1.evaluate(() => scrollTo(0, 0)); await W.tap(P1, '고른 회차 보내기'); await P1.waitForTimeout(3000);
            // 3조: 교사 말("선생님께 보내는 곳을 찾아볼래요?")을 듣고
            if (!/5/.test(await cur(P3))) await W.tap(P3, /^5\s*데이터/);
            const send3 = P3.locator('button').filter({ hasText: /^\s*📤 선생님께 보내기/ }).locator('visible=true'); if (!(await send3.count())) { await P3.locator('summary').filter({ hasText: '조 공유' }).first().click(); await P3.waitForTimeout(400); note('3조', '조 공유 칸이 접혀 있어 펼침'); }
            await W.tap(P3, /^\s*📤 선생님께 보내기/); await P3.waitForTimeout(2500);
            setStage(6); await L1.waitForTimeout(7000);
            note('(가) 6 열린 뒤 단계', Object.fromEntries(await Promise.all(Object.entries(W.pages).map(async ([n, pg]) => [n, await cur(pg)]))));
            note('(가) 1조 6 결과: 표·경고·예상↔결과', await panel(L1, /시료 \d|⚠|함께|예상|결과|최소제곱|맞았|달랐/, 14)); await W.shot(L1, '1조 6 결과', true);
            note('(가) 3조 폰 6 결과: 예상↔결과', await panel(P3, /예상|결과|맞았|달랐|필요/, 6));
            // 2조: 교사 말대로 QR → 폰 → 90초 시료 → 보내기
            if (!/5/.test(await cur(L2))) await W.tap(L2, /^5\s*데이터/); await L2.waitForTimeout(800);
            const u2 = await L2.evaluate(() => (document.querySelector('a[href*="role=phone"]') || {}).href || ''); const P2 = await live.student('2조폰', 'phone'); await P2.goto(u2); await P2.waitForTimeout(2000);
            await sample(P2, { heat: 90, what: 'heat' }); await P2.evaluate(() => scrollTo(0, 0)); await W.tap(P2, '고른 회차 보내기'); await P2.waitForTimeout(3000);
            setStage(7); await L1.waitForTimeout(7000);
            // (나) 7 결론
            const outside = pg => pg.evaluate(() => [...document.querySelectorAll('.step-panel textarea')].filter(e => e.offsetParent && !e.closest('#report-ai')).length);
            note('(나) 7 결론 위쪽(보고서 밖) 글', (await L1.locator('.step-panel').locator('visible=true').first().innerText()).split('📝 보고서 쓰기')[0].replace(/\n+/g, ' / ').slice(0, 900));
            note('(나) 보고서 밖 쓰기 칸 수 (1조·2조)', [await outside(L1), await outside(L2)]); note('7 결론 화면 길이', (await W.check(L1)).pages);
            const rai = async pg => (await pg.locator('#report-ai').innerText()).replace(/\n+/g, ' / ');
            await W.tap(L1, '결론 및 검토'); note('1조 결론 칸 위 생각해 볼 물음', (await rai(L1)).split(' / ').filter(l => /물음|\?|예상/.test(l)).slice(0, 7));
            await L1.locator('#report-ai textarea').locator('visible=true').first().fill('예상(가열 시간을 늘리면 파장이 길어진다)은 맞지 않았다. 60·120초 시료는 539.7, 538.9 nm 로 거의 같았다. 세 번째 시료는 요소 양도 함께 바꿔서 가열 시간 때문인지 알 수 없다. 색 추정값(≈)이라 믿기 어렵다.'); await L1.waitForTimeout(1200);
            await W.tap(L1, '제출·인쇄'); await W.tap(L1, '최종 제출'); await L1.waitForTimeout(2000); note('1조 최종 제출', (await rai(L1)).split(' / ').filter(l => /제출했|저장됨/.test(l)).slice(0, 2));
            // 2조(예전 글이 남은 기기): 7 결론에서 보이는 것 → 어디에 쓰나
            if (!/7/.test(await cur(L2))) await W.tap(L2, /^7\s*결론/); await L2.waitForTimeout(800);
            note('2조 예전 글 안내', (await L2.locator('.step-panel').locator('visible=true').first().innerText()).split('\n').filter(l => /예전|지난 학기|옮겼/.test(l)).slice(0, 6));
            await W.tap(L2, '데이터 분석'); note('2조 데이터 분석 칸에 들어 있는 글', await L2.locator('#report-ai textarea').locator('visible=true').first().inputValue());
            await L2.locator('#report-ai textarea').locator('visible=true').first().fill('90초 시료 하나만 재서 직선은 못 그렸다. 색 추정 약 539 nm.'); await L2.waitForTimeout(1500);
            note('2조 7 결론의 예상 ↔ 결과', await panel(L2, /내 예상|📊|잘 모르|결과/, 5));
            // 3조(폰): 7 결론 → 결론만 쓰고 제출 안 함 / 4조: 아무것도 안 씀
            if (!/7/.test(await cur(P3))) await W.tap(P3, /^7\s*결론/); await W.tap(P3, '결론 및 검토'); await P3.locator('#report-ai textarea').locator('visible=true').first().fill('예상(짧아진다)과 달리 초록색이었다. 시료가 하나라 더 재야 한다.'); await P3.waitForTimeout(1500);
            note('3조 폰 7 결론 화면 길이', (await W.check(P3)).pages);
            await L1.waitForTimeout(4000);
        }
        // TURNS
    };
    try { await T[turn](); } catch (e) { note('막힘', String(e.message).split('\n')[0]); }
    out.push(['알림 창', W.dialogs.splice(0)], ['오류', W.errors.splice(0)]);
    const bundle = await live.close(turn, '학생 차례 ' + turn);
    delete bundle.set[SP];
    for (const d of Object.values(bundle.set)) { if (typeof d.data === 'string' && d.data.length > 200) d.data = d.data.slice(0, 120) + '…(줄임)'; for (const k of ['expireAt', 'timestamp']) delete d[k]; }
    fs.writeFileSync(path.join(dir, 'out-' + turn + '.json'), JSON.stringify(bundle));
    console.log(JSON.stringify(out, null, 1)); console.log('묶음 글자 수', JSON.stringify(bundle).length, Object.keys(bundle.set).map(k => k.split('/').slice(2).join('/')));
})();
