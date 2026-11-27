// 필름통 로켓 5차 가상 수업 도구가 지금 판(PR #212 브랜치 claude/rocket-plan-ask)에서 열리는지만 확인 (수업 전체를 돌리지 않음).
//   VC_REPO=<claude/rocket-plan-ask 를 체크아웃한 폴더> node tools/virtual-class/rocket5/smoke.cjs [작업 폴더]
// 시나리오 작성 세션이 한 번 돌려 본 것. 교사 수업 만들기(팀) → 발표 보기 → 폰 2대 입장 → 계획 🔮 → ⏱ 한 번 → 2차시 🛠 → 🎥 한 발
'use strict';
const path = require('node:path'), assert = require('node:assert/strict');
const VC = require('./lib.cjs');
(async () => {
    const S = await VC.start({ dir: path.resolve(process.argv[2] || '/tmp/vc-rocket5-smoke'), role: 'teacher' });
    const res = {};
    try {
        // 교사: ⚙ 설정 → 수업 만들기 → 실험 필름통 로켓 → 팀 수 6 → 만들기 → 큰 QR → 🎬 발표 보기 (4K 100 %)
        const T = await S.teacher({ width: 3840, height: 2160 }, 1);
        await T.goto(S.ROOT + 'projects/class-teacher.html');
        await T.waitForSelector('#btnGoMake:visible', { timeout: 15000 });
        await T.click('#btnGoMake');
        await T.selectOption('#inExp', 'rocket');
        await T.waitForSelector('#rowTeams:not([hidden])');
        await T.fill('#inBan', '1'); await T.fill('#inTeams', '6');
        await T.click('#btnCreate');
        await T.waitForSelector('#classOut:not([hidden])', { timeout: 15000 });
        res.code = (await T.textContent('#outCode')).trim();
        res.link = S.local(await T.getAttribute('#outLink', 'href'));
        res.toRun = (await T.textContent('#btnToRun')).trim();
        await T.click('#btnToRun');
        await T.waitForSelector('#presentPane:not([hidden]) #pSlides .ls-slide', { timeout: 15000 });
        res.first = await S.title(T);
        res.font100 = await S.minFont(T);
        // 폰 둘: A iPhone 13, C Pixel 7
        const A = await S.phone('A'), C = await S.phone('C', 'Pixel 7');
        res.enterA = await S.enter(A, res.link, '별빛가족');
        res.enterC = await S.enter(C, res.link, '할머니와 나');
        res.hscrollA = await S.hscroll(A);
        // 들어가기: force 물음 → 폰 답 칸
        res.force = await S.toSlide(T, /‘힘’/);
        await A.waitForTimeout(4000);
        res.A_force = await S.scr(A, 300);
        await S.pick(A, '원인'); await S.pick(C, '세게');
        await S.sendNow(A); await S.sendNow(C);
        await T.waitForTimeout(5000);
        res.ans_force = (await S.answers(T)).slice(0, 300);
        // 1차시 열기까지
        res.askT1 = await S.toSlide(T, /펑/);
        if (await T.isVisible('#pAsk')) { await T.click('#btnPAskYes'); await T.waitForTimeout(1500); }
        res.t1first = await S.title(T);
        res.plan = await S.toSlide(T, /우리 팀 실험 계획/);
        await A.waitForTimeout(4000);
        res.A_plan0 = await S.scr(A, 300);
        // 놓친 퀴즈가 먼저 나올 수 있음 (고친 판: 다음 응답 장 앞에 한 번)
        for (let g = 0; g < 4; g++) { const id = await S.screen(A); if (id === 'q-gas') await S.pick(A, '이산화'); else if (id === 'q-control') await S.pick(A, '무엇 때문에'); else break; await A.waitForTimeout(800); }
        await S.waitScreen(A, 't1-var');
        await S.pick(A, '물의 양');
        res.planVals = [await S.planStep(A, 0, 0), await S.planStep(A, 1, 1)];
        await S.pick(A, '길어질');
        await A.click('#ev-plan-send'); await S.waitScreen(A, 'sent');
        await S.sendNow(A); await T.waitForTimeout(5000);
        res.ans_plan = (await S.answers(T)).slice(0, 400);
        // do-t1 → 안전 → 조건 → ⏱ 3초 한 번 (스모크라 짧게)
        res.do = await S.toSlide(T, /이제 폰으로 재요/);
        await A.waitForTimeout(4000);
        const R = require('./team.cjs');
        res.run1 = await R.run1(S, A, [{ v: 0, s: 1.5 }, { v: 'same', s: 1.8 }, { v: 1, s: 2.2 }]);
        await S.toSlide(T, /도전: 목표 시간/); await A.waitForTimeout(4000);
        res.ch1 = await R.challenge(S, A, 't1', { to: '10 mL', s: 2.0 });
        res.ch1val = await A.evaluate(() => window.__filmRocket.state().t1.challenge.map(c => c.value + ':' + c.y));
        res.trials = await A.evaluate(() => window.__filmRocket.state().t1.trials.map(t => [t.value, t.y, t.method]));
        // 2차시 열기 (#209: 마지막 장 다음 = 열까요?)
        res.askT2 = await S.toSlide(T, /로켓을 만들어요/);
        if (await T.isVisible('#pAsk')) { await T.click('#btnPAskYes'); await T.waitForTimeout(2500); }
        res.t2first = await S.title(T);
        await S.waitScreen(A, 't2-build', 20000);
        for (const k of ['body', 'fins', 'nose', 'clay']) await A.click('[data-build="' + k + '"]');
        await A.click('#ev-build-done'); await S.sendNow(A); await T.waitForTimeout(5000);
        res.ans_build = (await S.answers(T)).slice(0, 200);
        // 2차시 계획 → do-t2 → 🎥 한 발 80 %
        await S.toSlide(T, /로켓은 왜 솟고/); await A.waitForTimeout(4000);
        for (let g = 0; g < 4; g++) { const id = await S.screen(A); if (id === 'q-action') await S.pick(A, '물과 기체'); else if (id === 'q-mass') await S.pick(A, '가속도가 작아'); else break; await A.waitForTimeout(800); }
        await S.toSlide(T, /우리 팀 실험 계획/); await A.waitForTimeout(4000);
        await S.waitScreen(A, 't2-var'); await S.pick(A, '몸체 무게'); await S.planStep(A, 1, 1); await S.pick(A, '낮아질');
        await A.click('#ev-plan-send'); await S.waitScreen(A, 'sent');
        await S.toSlide(T, /이제 폰으로 쏘아요/); await A.waitForTimeout(4000);
        res.A_do2 = await S.scr(A, 300);
        res.run2 = await R.run2(S, A, [{ v: 0, pct: 80 }, { v: 'same', pct: 84 }, { v: 1, hand: 'low' }]);
        res.trials2 = await A.evaluate(() => window.__filmRocket.state().t2.trials.map(t => [t.value, t.pct, t.method]));
        res.over = await S.overflow(T);
        res.out = S.out('smoke');
        res.log = S.log.filter(l => l.kind === 'pageerror');
        assert.deepEqual(res.trials.map(t => t[1]), [1.5, 1.8, 2.2]);
        assert.deepEqual(res.trials2.map(t => t[0]), [0, 0, 2], '같은 조건 반복 뒤 ②'); assert.equal(res.trials2[2][1], 70);
        res.ok = true;
    } catch (e) { res.error = String(e && e.stack || e).slice(0, 1500); }
    finally { console.log(JSON.stringify(res, null, 1)); await S.close(); }
})();
