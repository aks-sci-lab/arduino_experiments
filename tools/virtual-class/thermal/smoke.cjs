// 열평형 가상 수업 도구가 지금 판에서 열리는지만 확인 (수업 전체를 돌리지 않음). 시나리오 작성 세션이 한 번 돌려 본 것.
//   node tools/virtual-class/thermal/smoke.cjs [작업 폴더]
'use strict';
const path = require('node:path'), assert = require('node:assert/strict');
const VC = require('./lib.cjs');
(async () => {
    const S = await VC.start({ dir: path.resolve(process.argv[2] || '/tmp/vc-thermal-smoke'), role: 'teacher' });
    const res = {};
    try {
        // 교사: 수업 만들기 (화면으로) — ⚙ 설정 → 수업 만들기 → 실험 열평형 → 7단계 → 만들기
        const T = await S.teacher({ width: 1920, height: 1080 }, 1);
        await T.goto(S.ROOT + 'projects/class-teacher.html');
        await T.waitForSelector('#btnGoMake:visible', { timeout: 15000 });
        await T.click('#btnGoMake');
        await T.fill('#inBan', '3'); await T.fill('#inN', '20'); await T.fill('#inSize', '4');
        await T.selectOption('#inExp', 'thermal');
        await T.waitForSelector('#rowFlow:not([hidden])');
        await T.check('input[name="inFlow"][value="report"]');
        await T.click('#btnCreate');
        await T.waitForSelector('#classOut:not([hidden])', { timeout: 15000 });
        res.code = (await T.textContent('#outCode')).trim();
        res.link = S.local(await T.getAttribute('#outLink', 'href'));
        res.space = new URL(res.link).searchParams.get('s');
        // 학생 노트북: 수업 참여 → 4. 과정 변인 카드 → 5. 데이터 CSV 회차 2개 → 보내기
        const L = await S.laptop('1조', 1366);
        await L.goto(res.link);
        await L.waitForSelector('#cs-cjo option[value="1"]', { state: 'attached', timeout: 15000 });
        await L.selectOption('#cs-cjo', '1'); await L.selectOption('#cs-cnum', '1'); await L.click('#cs-cjoin');
        await L.waitForTimeout(1500);
        res.locked = await L.$$eval('nav.steps button', b => b.map(x => x.textContent.trim() + (x.classList.contains('locked') || x.getAttribute('aria-disabled') === 'true' ? '🔒' : '')));
        // 교사가 단계를 모두 연 것처럼 (스모크에서만 — 실제 수업에서는 교사 차례로 연다)
        await S.app.db.update('labClasses/' + res.space, { stage: 99 });
        await L.reload(); await L.waitForTimeout(1500);
        await L.click('nav.steps button[data-step="procedure"]');
        const vc = L.locator('.rai-inline.rai-vc:not([hidden])').first();
        await vc.waitFor({ timeout: 10000 });
        res.vcText = (await vc.innerText()).slice(0, 400);
        await vc.locator('input[data-vc="change"]').first().check();
        await vc.locator('input[data-vc="val1"]').fill('100 g : 100 g');
        await vc.locator('input[data-vc="val2"]').fill('100 g : 300 g');
        await vc.locator('input[data-vc="predict"]').nth(1).check();
        await L.click('nav.steps button[data-step="data"]');
        res.imp1 = await S.importRun(L, 'g9-1조-①-100g-100g.csv');
        res.imp2 = await S.importRun(L, 'g9-1조-②-100g-300g.csv');
        await L.click('nav.steps button[data-step="result"]');
        await L.waitForTimeout(800);
        res.table = (await L.textContent('#resTbody')).replace(/\s+/g, ' ').slice(0, 300);
        await S.shot(L, '결과');
        // 보내기
        await L.click('nav.steps button[data-step="data"]');
        res.shareOpenBefore = await L.$eval('#cs-share', d => d.open);
        await L.click('#cs-share > summary');   // 접힌 '👥 조 공유' 를 펼쳐야 보내기 단추가 보임
        const send = L.locator('#cs-send');
        res.sendVisible = await send.isVisible().catch(() => false);
        if (res.sendVisible) { await send.click(); await L.waitForTimeout(1500); res.sendMsg = (await L.textContent('#cs-status').catch(() => '')).trim(); }
        res.items = Object.keys(S.all()).filter(p => /labSpaces\/.*\/items\//.test(p));
        // 교사 🎬 발표 보기 4K
        await T.setViewportSize({ width: 3840, height: 2160 });
        await T.goto(S.ROOT + 'projects/class-teacher.html#class=' + res.space + '&view=present');
        await T.waitForSelector('#presentPane:not([hidden]) #pSlides .ls-slide', { timeout: 15000 });
        res.slide = (await T.textContent('#pSlides .ls-title')).trim();
        res.font4k = await S.minFont(T);
        await S.shot(T, '발표-4K');
        await S.app.db.update('labClasses/' + res.space, { stage: 1 });   // 단계 열기 시험: 1 로 되돌린 뒤 띠의 '▶ 다음 단계'
        await T.reload(); await T.waitForSelector('#presentPane:not([hidden]) #pSlides .ls-slide', { timeout: 15000 }); await T.waitForTimeout(1500);
        await T.click('#btnPOpen'); await T.waitForTimeout(600);
        if (await T.isVisible('#btnPAskYes')) await T.click('#btnPAskYes');
        await T.waitForTimeout(1500);
        res.stageAfterOpen = (await S.app.db.get('labClasses/' + res.space)).stage;
        res.slideAfterOpen = (await T.textContent('#pSlides .ls-title')).trim();
        // 375px 폰
        const P = await S.phone('5조-폰');
        await P.goto(res.link); await P.waitForTimeout(2000);
        res.phoneHscroll = await S.hscroll(P);
        await S.shot(P, '폰', true);
        // 차례 묶음
        res.bundle = (({ bytes, paths }) => ({ bytes, n: paths.length, sample: paths.slice(0, 6) }))(S.out('스모크'));
        res.errors = S.log.filter(l => /pageerror/.test(l.kind));
        console.log(JSON.stringify(res, null, 1));
        assert.ok(res.code && res.space, '수업 만들기');
        assert.match(res.imp2, /불러왔어요/);
        assert.match(res.table, /29\.99/);
    } finally { await S.close(); }
})().catch(e => { console.error(e); process.exit(1); });
