// 설명 화면 합동 수업 ② 탄소 양자점(claude/lesson-qdot) — 학생 쪽 차례.
//   VC_REPO=<고친 판 폴더> VC_NPM=… node tools/virtual-class/student-live-qdot3.cjs <상태 폴더> <차례> [교사 묶음.json]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { openLive } = require('./student-live.cjs');
const NOTES = 'quantum-dot-notes-v1', CODE = '2-3530', SP = 'labClasses/cz84jt9zhtr2rxzc694z5gmq', PAGE = 'projects/quantum-dot.html?c=2-3530&s=cz84jt9zhtr2rxzc694z5gmq';
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
    const ptext = async (pg, n) => (await pg.locator('.step-panel').locator('visible=true').first().innerText()).replace(/\n+/g, ' / ').slice(0, n || 1500);
    const T = {
        1: async () => {   // 0~25분: 1 목적 설명 장 4 + 2 이론 설명 장 8 동안 노트북·폰
            teacher();
            const L = {}; for (const j of [1, 2, 3, 4]) { const pg = L[j] = await live.student(j + '조노트북', 'laptop'); await pg.goto(W.ROOT + PAGE); await pg.waitForTimeout(1500); await join(pg, j, 1); }
            note('노트북 1 목적 화면(1조)', { 글: await ptext(L[1], 1800), 화면몇장: (await W.check(L[1])).pages });
            const P3 = await live.student('3조폰', 'phone'); await P3.goto(W.ROOT + PAGE); await P3.waitForTimeout(1500); await join(P3, 3, 2);
            note('3조 폰(설명 중 먼저 만짐) 1 목적', { 글: (await ptext(P3, 500)), 화면몇장: (await W.check(P3)).pages, 단계단추: await P3.evaluate(() => [...document.querySelectorAll('nav.steps button')].map(b => b.textContent.trim().replace(/\s+/g, ' ') + (b.disabled || b.getAttribute('aria-disabled') === 'true' ? '(꺼짐)' : ''))) });
            await W.tap(P3, /^5/, 0, true).catch(() => {}); await P3.waitForTimeout(600); note('3조 폰 5 데이터 눌러 봄', { 지금단계: await cur(P3), 알림: W.dialogs.splice(0), 글: (await W.text(P3)).split('\n').filter(l => /🔒|잠|아직|선생님/.test(l)).slice(0, 4) });
            await L[1].locator('#rai-in-problem').fill('색이 A 파랑 → C 연두로 다르다. 가열을 오래 할수록 알갱이가 커져서 띠 틈이 작아지고 파장이 길어진 것 같다.');
            await L[2].locator('#rai-in-problem').fill('색이 다르다. 가열 시간이 달라서.');
            await L[3].locator('#rai-in-problem').fill('C 가 제일 많이 익어서 색이 진하다');
            await L[1].waitForTimeout(1500);
            setStage(2); await L[1].waitForTimeout(7000);
            note('2 이론 열린 뒤 지금 단계', Object.fromEntries(await Promise.all(Object.entries(W.pages).map(async ([n, pg]) => [n, await cur(pg)]))));
            const tabs = await L[1].evaluate(() => [...document.querySelectorAll('.step-panel:not([hidden]) .subtabs button, .step-panel:not([hidden]) nav.subtabs a')].filter(e => e.offsetParent).map(e => e.textContent.trim()));
            note('노트북 2 이론 작은 탭', tabs);
            for (const t of tabs.slice(0, 8)) { await W.tap(L[1], t).catch(() => {}); await L[1].waitForTimeout(300); const tx = await ptext(L[1], 6000); note('2 이론 탭 [' + t + ']', { 글머리: tx.slice(0, 700), 답이보이는말: ['1/L', '작을수록', '1240', '스토크스', '나온 빛', '파장이 긴', '노출', '한계', '가정', 'sp'].filter(k => tx.includes(k)), 화면몇장: (await W.check(L[1])).pages }); }
            note('2 이론에 쓰는 칸', await L[1].evaluate(() => [...document.querySelectorAll('.step-panel:not([hidden]) textarea, .step-panel:not([hidden]) input[type=radio]')].filter(e => e.offsetParent).map(e => e.placeholder || e.value)));
            await L[1].waitForTimeout(2500);
        },
        2: async () => {   // 25~65분: 3 준비물 · 4 과정(변인 카드) · 5 데이터(폰 측정, 3조는 두 가지를 함께 바꿈)
            const L = {}; for (const j of [1, 2, 3, 4]) L[j] = await live.student(j + '조노트북', 'laptop'); const P3 = await live.student('3조폰', 'phone');
            const team = async (n, f) => { try { await f(); } catch (e) { note(n + ' 막힘', String(e.message).split('\n')[0]); } };
            await L[1].waitForTimeout(1500); setStage(3); await L[1].waitForTimeout(6500);
            note('3 준비물 노트북(1조)', { 단계: await cur(L[1]), 글: await ptext(L[1], 700), 화면몇장: (await W.check(L[1])).pages });
            setStage(4); await L[1].waitForTimeout(6500);
            note('4 과정 노트북(1조)', { 단계: await cur(L[1]), 글: await ptext(L[1], 1500), 화면몇장: (await W.check(L[1])).pages });
            await team('1조 카드', () => card(L[1], 'heat', 'up', '같은 전자레인지, 희석 1:10, 시료–폰 거리, 노출 고정', '가열이 길면 sp² 영역이 자라 띠 틈이 작아질 것 같아서. 단, 크기는 직접 재지 않으니 가정'));
            await team('2조 카드', () => card(L[2], 'heat', 'up', '희석', '이론에서 길게 가열하면 초록 쪽이라고 해서'));
            await team('3조 카드', () => card(L[3], 'ratio', 'unknown', '', ''));
            await team('4조 카드', () => card(L[4], 'ratio', null, '', ''));
            await L[1].waitForTimeout(1200);
            for (const j of [1, 2, 3, 4]) note(j + '조 변인 카드', await panel(L[j], /🔧|🔒|📏|🔮|같게|예상|바꿀 것|까닭|저장/, 12));
            setStage(5); await L[1].waitForTimeout(6500);
            note('5 데이터 노트북(1조) 처음', { 단계: await cur(L[1]), 글: await ptext(L[1], 600) });
            const phone = async j => { const u = await L[j].evaluate(() => (document.querySelector('a[href*="role=phone"]') || {}).href || ''); const P = await live.student(j + '조폰', 'phone'); await P.goto(u); await P.waitForTimeout(2000); return P; };
            const send = async P => { await P.evaluate(() => scrollTo(0, 0)); await W.tap(P, '고른 회차 보내기'); await P.waitForTimeout(3000); };
            await team('1조', async () => { const P = await phone(1);
                note('1조 폰 ① 시료 화면', { 글: (await W.text(P)).split('\n').slice(0, 40).join(' / ').slice(0, 900) });
                const w1 = await sample(P, { heat: 60, what: 'heat', upto: 'color' }); note('1조 폰 ② 형광 색 화면', (await W.text(P)).split('\n').filter(l => /≈|파장|노출|고정|🔒|밝기|색상/.test(l)).slice(0, 10));
                await W.tap(P, '이 색 기록'); await P.waitForTimeout(500); note('1조 폰 ③ 분광기 화면 말', (await W.text(P)).split('\n').filter(l => /봉우리|반치폭|보정|스펙트럼|건너/.test(l)).slice(0, 8));
                await W.tap(P, '건너뛰고 ④ 저장'); note('1조 폰 ④ 저장 화면 말', (await W.text(P)).split('\n').filter(l => /≈|봉우리|반치폭|보정 밝기|E |eV|nm/.test(l)).slice(0, 10)); await W.tap(P, '시료 저장'); await P.waitForTimeout(600);
                await sample(P, { heat: 120 }); await sample(P, { heat: 180 }); await send(P); note('1조 폰 보낸 뒤', (await W.text(P)).split('\n').filter(l => /보냈|✅|📤/.test(l)).slice(0, 4)); });
            await team('2조', async () => { const P = await phone(2); await sample(P, { heat: 60, what: 'heat' }); await sample(P, { heat: 120 }); await send(P); });
            await team('3조', async () => { const P = await phone(3);
                await sample(P, { heat: 120, urea: 0.5, what: 'ratio' });
                note('3조 폰: 요소 2 + 가열 180 (두 가지를 함께 바꿈) ① 화면', await sample(P, { heat: 180, urea: 2, upto: 'info' }));
                await W.tap(P, '다음: ② 형광 색'); await P.waitForTimeout(800); if (await P.getByText('카메라 켜기').locator('visible=true').count()) { await W.tap(P, '카메라 켜기'); await P.waitForTimeout(2500); }
                await W.tap(P, '이 색 기록'); await W.tap(P, '건너뛰고 ④ 저장'); note('3조 폰 ④ 저장 앞', (await W.text(P)).split('\n').filter(l => /⚠|두 가지|맞춤/.test(l)).slice(0, 4)); await W.tap(P, '시료 저장'); await P.waitForTimeout(800);
                note('3조 폰 저장 뒤(넣을지 뺄지)', (await W.text(P)).split('\n').filter(l => /⚠|두 가지|맞춤|까닭|빼기|넣기/.test(l)).slice(0, 10)); await W.shot(P, '3조 폰 두 가지 바뀜', true);
                const inR = P.locator('input[type=radio][value=in]').locator('visible=true'); note('3조 폰 넣기/빼기 고르기 칸 수', await inR.count());
                if (await inR.count()) { await inR.first().check(); await P.waitForTimeout(400); const why = P.locator('.qd-mix input[type=text], .qd-mix textarea, .qd-mix-item input[type=text], .qd-mix-item textarea').locator('visible=true'); note('3조 폰 까닭 칸', { 수: await why.count(), 안내: await why.first().getAttribute('placeholder').catch(() => '') }); if (await why.count()) { await why.first().fill('둘 다 늘리면 더 잘 보일 것 같아서'); await why.first().blur(); } await P.waitForTimeout(500); }
                await send(P); });
            await team('4조', async () => { const P = await phone(4); await sample(P, { heat: 120, urea: 1, what: 'ratio' }); note('4조 폰 저장 뒤(안 보냄)', (await W.text(P)).split('\n').filter(l => /저장했|보내|📤|안 보낸/.test(l)).slice(0, 5)); });
            await L[1].waitForTimeout(5000);
            for (const j of [1, 2, 3, 4]) note('65분 ' + j + '조 노트북 5 데이터', { 단계: await cur(L[j]), 줄: await panel(L[j], /🆕|기다리는|⚠|시료 \d|받은|폰에서/, 6) });
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
