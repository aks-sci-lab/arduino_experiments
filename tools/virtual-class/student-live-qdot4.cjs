// 설명 화면 합동 수업 2차 ② 탄소 양자점(고친 판: 👀 띠 · 답 가리기 · 가열 방향 글은 결과 뒤 · 그래프 가로축) — 학생 쪽 차례.
//   VC_REPO=<고친 판 폴더> VC_NPM=… node tools/virtual-class/student-live-qdot4.cjs <상태 폴더> <차례> [교사 묶음.json]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { openLive } = require('./student-live.cjs');
const NOTES = 'quantum-dot-notes-v1', CODE = '2-0050', SP = 'labClasses/cii65iqv99eqfnknmgjf9r4i', PAGE = 'projects/quantum-dot.html?c=2-0050&s=cii65iqv99eqfnknmgjf9r4i';
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
    // 교사 설명 장: 수업 문서 lesson · lessonOpen (교사 세션이 알려 준 규칙). w = 기다릴 ms
    const OPEN = [];
    const lesson = async (stage, i, key, reveal, w) => { const d = W.app.db.docs.get(SP); if (!OPEN.length && Array.isArray(d.lessonOpen)) OPEN.push(...d.lessonOpen); if (stage === null) d.lesson = { on: false, stage: '', i: 0, key: '', reveal: false, at: new Date() }; else { d.lesson = { on: true, stage, i, key: key || '', reveal: !!reveal, at: new Date() }; if (reveal && key && !OPEN.includes(key)) OPEN.push(key); } d.lessonOpen = OPEN.slice(); await new Promise(r => setTimeout(r, w || 6500)); };
    const bandOn = async pg => (await pg.locator('.cs-look-band').locator('visible=true').count()) ? '👀 있음' : '없음';
    // 지금 보이는 단계에서 답 가리기 자리: key · 가려졌는지 · 글머리
    const gates = pg => pg.evaluate(() => [...document.querySelectorAll('[data-lesson-answer]')].filter(e => e.offsetParent).map(e => e.getAttribute('data-lesson-answer') + (e.classList.contains('cs-ans-hide') ? ' 🔒가림' : ' 보임') + ' · ' + e.textContent.trim().replace(/\s+/g, ' ').slice(0, 46)));
    const T = {
        1: async () => {   // 0~25분: 1 목적 + 2 이론
            teacher();
            const L = {}; for (const j of [1, 2, 3, 4]) { const pg = L[j] = await live.student(j + '조노트북', 'laptop'); await pg.goto(W.ROOT + PAGE); await pg.waitForTimeout(1500); await join(pg, j, 1); }
            const P3 = await live.student('3조폰', 'phone'); await P3.goto(W.ROOT + PAGE); await P3.waitForTimeout(1500); await join(P3, 3, 2);
            await lesson('purpose', 0, '', false);
            note('purpose 0 물음 · 띠', { 노트북1조: await bandOn(L[1]), 폰3조: await bandOn(P3) }); await W.shot(L[1], '1조 노트북 앞 화면 띠');
            await L[1].locator('#rai-in-problem').fill('색이 A 파랑 → C 연두로 다르다. 가열을 오래 할수록 알갱이가 커져서 띠 틈이 작아지고 파장이 길어진 것 같다.');
            await L[2].locator('#rai-in-problem').fill('색이 다르다. 가열 시간이 달라서.');
            await L[3].locator('#rai-in-problem').fill('C 가 제일 많이 익어서 색이 진하다');
            await W.tap(L[1], '실험 목적 · 하는 일 보기').catch(e => note('1조 접힌 목적 글', String(e.message).slice(0, 80))); await L[1].waitForTimeout(500);
            note('1조: 접힌 목적 글을 펼친 뒤(purpose 2 풀이 전)', { 글: (await ptext(L[1], 2600)).split('실험 목적 · 하는 일')[1] || '(못 찾음)', 가리기: await gates(L[1]) });
            await lesson('purpose', 0, '', true, 1500); await lesson('purpose', 1, '', false, 1500); await lesson('purpose', 2, '', false, 1500); await lesson('purpose', 2, '', true, 1500); await lesson('purpose', 3, '', false, 1500); await lesson(null);
            note('1 목적 설명 닫힘 · 띠', await bandOn(L[1]));
            setStage(2); await lesson('theory', 0, 'qd-box', false);
            note('theory 0 물음(qd-box) · 지금 단계·띠', Object.fromEntries(await Promise.all(Object.entries(W.pages).map(async ([n, pg]) => [n, (await cur(pg)) + ' · ' + (await bandOn(pg))]))));
            note('theory 0 풀이 전 · 노트북 [양자점] 탭', { 글: await ptext(L[2], 900), 가리기: await gates(L[2]) }); await W.shot(L[2], '2조 이론 양자점 탭 가림');
            // 1조: 띠가 뜬 동안 탭을 넘겨 봄
            const tabs = ['띠 틈과 색', '형광', '탄소 양자점', '한계', '카메라로 재기'];
            for (const t of tabs) { await W.tap(L[1], t).catch(() => {}); await L[1].waitForTimeout(300); note('풀이 전 1조가 넘겨 본 탭 [' + t + ']', { 가리기: await gates(L[1]), 글: (await ptext(L[1], 1400)).split('카메라로 재기 / ').slice(1).join('').slice(0, 620) }); }
            await W.tap(L[1], /^양자점$/).catch(() => {});
            await lesson('theory', 0, 'qd-box', true);
            note('theory 0 풀이 뒤 · 2조 노트북', await gates(L[2]));
            await lesson('theory', 1, '', false, 1200); await lesson('theory', 2, '', false, 1200);
            await lesson('theory', 3, 'qd-energy', false, 1500); await W.tap(L[2], '띠 틈과 색'); await L[2].waitForTimeout(400); note('theory 3 물음 · 2조가 [띠 틈과 색] 탭을 봄', await gates(L[2]));
            await lesson('theory', 3, 'qd-energy', true); note('theory 3 풀이 뒤', await gates(L[2]));
            await lesson('theory', 4, 'qd-stokes', false, 1500); await W.tap(L[2], /^형광$/); await L[2].waitForTimeout(400); note('theory 4 물음 · 2조 [형광] 탭', await gates(L[2]));
            await lesson('theory', 4, 'qd-stokes', true); note('theory 4 풀이 뒤', await gates(L[2]));
            await lesson('theory', 5, '', false, 1200); await lesson('theory', 6, '', false, 1200);
            await lesson('theory', 7, 'qd-auto', false, 1500); await W.tap(L[2], '카메라로 재기'); await L[2].waitForTimeout(400); note('theory 7 물음 · 2조 [카메라로 재기] 탭', { 가리기: await gates(L[2]), 글: (await ptext(L[2], 900)).split('카메라로 재기 / ').slice(1).join('').slice(0, 420) });
            await lesson('theory', 7, 'qd-auto', true); note('theory 7 풀이 뒤', await gates(L[2]));
            await lesson(null);
            await W.tap(L[2], '탄소 양자점'); await L[2].waitForTimeout(400); note('이론 끝 · 2조 [탄소 양자점] 탭(예상 물음 때)', { 가리기: await gates(L[2]), 글: (await ptext(L[2], 1500)).split('카메라로 재기 / ').slice(1).join('').slice(0, 800) });
            note('끝 · 띠', await bandOn(L[1]));
        },
        2: async () => {   // 25~55분: 3 준비물 · 4 과정(변인 카드) · 5 데이터(폰 측정) — 55분 상태(4조 안 보냄)
            const L = {}; for (const j of [1, 2, 3, 4]) L[j] = await live.student(j + '조노트북', 'laptop'); const P3 = await live.student('3조폰', 'phone');
            const team = async (n, f) => { try { await f(); } catch (e) { note(n + ' 막힘', String(e.message).split('\n')[0]); } };
            const find = async (pg, re) => (await pg.locator('.step-panel').locator('visible=true').first().innerText()).split('\n').filter(l => re.test(l)).map(l => l.slice(0, 150)).slice(0, 5);
            await L[1].waitForTimeout(1200); setStage(3); await lesson('materials', 0, '', false, 6500);
            await lesson('materials', 1, 'qd-microwave', false, 1500);
            note('materials 1 물음(왜 같은 전자레인지) · 노트북 3 준비물', { 띠: await bandOn(L[4]), 가리기: await gates(L[4]), 전자레인지글: await find(L[4], /전자레인지/) });
            await lesson('materials', 1, 'qd-microwave', true); note('materials 1 풀이 뒤', await gates(L[4]));
            await lesson('materials', 2, '', false, 1500); note('materials 2 물음(파장을 더 정확히?) · 노트북에 보이는 답', await find(L[3], /분광|회절|격자/));
            await lesson('materials', 2, '', true, 1200); await lesson('materials', 3, '', false, 1200); await lesson(null, 0, '', false, 1500);
            setStage(4); await lesson('procedure', 0, '', false, 6500);
            note('procedure 0 물음(바꿀 것 하나) · 노트북 4 과정', { 단계: await cur(L[2]), 가리기: await gates(L[2]), 보이는답: await find(L[2], /하나만|같게|🔒/) });
            await lesson('procedure', 0, '', true, 1200); await lesson('procedure', 1, '', false, 1500);
            note('변인 카드 빈 화면(2조)', await panel(L[2], /🔧|🔒|📏|🔮|같게|예상|바꿀 것|까닭|거리|노출/, 12));
            await team('1조 카드', () => card(L[1], 'heat', 'up', '같은 전자레인지, 시료–폰 거리, 노출 고정', '조각이 자라면 상자가 커지는 셈이라 에너지 간격이 작아져 파장이 길어질 것 같다. 단, 크기는 직접 재지 않으니 가정'));
            await team('2조 카드', () => card(L[2], 'heat', 'up', '시료–폰 거리, 노출 고정', '상자가 커지면 간격이 작아지니까 에너지가 작은 빨강 쪽? (확실하지 않음)'));
            await team('3조 카드', () => card(L[3], 'ratio', 'unknown', '폰 거리', '요소가 많으면 질소가 더 들어간다는데 색이 어떻게 될지는 모르겠다'));
            await team('4조 카드', () => card(L[4], 'ratio', 'up', '', ''));
            await L[1].waitForTimeout(1200);
            for (const j of [1, 3, 4]) note(j + '조 변인 카드', await panel(L[j], /🔒 같게|더 같게|🔮|까닭/, 6));
            await lesson('procedure', 2, '', false, 1200); await lesson('procedure', 3, '', false, 1500);
            note('procedure 3 물음(두 가지가 함께 바뀌면) · 노트북에 보이는 답', await find(L[2], /두 가지|함께 바/));
            await lesson('procedure', 3, '', true, 1200); await lesson('procedure', 4, '', false, 1000); await lesson('procedure', 5, '', false, 1000); await lesson('procedure', 6, '', false, 1500);
            await W.tap(L[2], '③ 보정').catch(() => {}); await L[2].waitForTimeout(300); note('procedure 6 물음(알려진 파장의 빛이 왜?) · 노트북 ③ 보정 탭', await find(L[2], /알려진|436|546|파장/));
            await lesson('procedure', 6, '', true, 1000); await lesson('procedure', 7, '', false, 1000); await lesson(null, 0, '', false, 1500);
            setStage(5); await lesson('data', 0, '', false, 6500);
            const phone = async j => { const u = await L[j].evaluate(() => (document.querySelector('a[href*="role=phone"]') || {}).href || ''); const P = await live.student(j + '조폰', 'phone'); await P.goto(u); await P.waitForTimeout(2500); return P; };
            const P1 = await phone(1);
            note('data 0 · 1조 폰(QR 로 엶, 설명 중)', { 띠: await bandOn(P1), 가리기: await gates(P1), 위글: (await W.text(P1)).split('\n').slice(0, 9).join(' / ').slice(0, 330) }); await W.shot(P1, '1조 폰 측정 화면 + 띠');
            await lesson('data', 1, '', false, 1200); await lesson('data', 1, '', true, 1200); await lesson('data', 2, 'qd-hue', false, 1500);
            note('data 2 물음(≈ vs 분광기) · 노트북 5 데이터·폰', { 노트북: await gates(L[2]), 폰: await gates(P1), 노트북글: await find(L[2], /≈|추정|분광기/) });
            await lesson('data', 2, 'qd-hue', true, 1500); await lesson('data', 3, '', false, 1200); await lesson(null, 0, '', false, 6500);
            note('설명 닫힘 · 띠', { 노트북: await bandOn(L[1]), 폰: await bandOn(P1) });
            const send = async P => { await P.evaluate(() => scrollTo(0, 0)); await W.tap(P, '고른 회차 보내기'); await P.waitForTimeout(3000); };
            await team('1조', async () => { await sample(P1, { heat: 60, what: 'heat' }); await sample(P1, { heat: 120 }); await sample(P1, { heat: 180 }); await send(P1); });
            await team('2조', async () => { const P = await phone(2); await sample(P, { heat: 60, what: 'heat' }); await sample(P, { heat: 120 }); await send(P); });
            await team('3조', async () => { const P = await phone(3); await sample(P, { heat: 120, urea: 0.5, what: 'ratio' });
                note('3조 폰: 요소 2 + 가열 180 ① 화면', await sample(P, { heat: 180, urea: 2, upto: 'info' }));
                await W.tap(P, '다음: ② 형광 색'); await P.waitForTimeout(800); if (await P.getByText('카메라 켜기').locator('visible=true').count()) { await W.tap(P, '카메라 켜기'); await P.waitForTimeout(2500); }
                await W.tap(P, '이 색 기록'); await W.tap(P, '건너뛰고 ④ 저장'); await W.tap(P, '시료 저장'); await P.waitForTimeout(800);
                const inR = P.locator('input[type=radio][value=in]').locator('visible=true'); await inR.first().check(); const why = P.locator('.qd-mix input[type=text], .qd-mix textarea').locator('visible=true'); await why.first().fill('둘 다 늘리면 더 잘 보일 것 같아서'); await why.first().blur(); await P.waitForTimeout(500);
                note('3조 폰 넣기를 고른 뒤 띠', (await W.text(P)).split('\n').filter(l => /✏️|바뀜|보냄|보내기 전|고른 회차/.test(l)).slice(0, 5)); await send(P); });
            await team('4조', async () => { const P = await phone(4); await sample(P, { heat: 120, urea: 1, what: 'ratio' }); note('4조 폰 저장 뒤(안 보냄)', (await W.text(P)).split('\n').filter(l => /저장했|보내|📤|안 보낸/.test(l)).slice(0, 5)); });
            await L[1].waitForTimeout(4000);
            for (const j of [1, 2, 3, 4]) note('55분 ' + j + '조 노트북 5 데이터', await panel(L[j], /🆕|기다리는|⚠/, 4));
        },
        21: async () => {   // 55~65분: 교사가 4조에 "폰 맨 위를 봐요" → 4조가 보냄
            setStage(5); const L4 = await live.student('4조노트북', 'laptop'), P4 = await live.student('4조폰', 'phone'); await P4.waitForTimeout(1500);
            await P4.evaluate(() => scrollTo(0, 0)); note('4조 폰 맨 위', (await W.text(P4)).split('\n').slice(6, 16).join(' / ').slice(0, 420));
            await W.tap(P4, '고른 회차 보내기'); await P4.waitForTimeout(3500); note('4조 폰 보낸 뒤', (await W.text(P4)).split('\n').filter(l => /보냄|보내기 전|고른 회차/.test(l)).slice(0, 4));
            await L4.waitForTimeout(3000); note('65분 4조 노트북', await panel(L4, /🆕|기다리는|⚠/, 4));
        },
        3: async () => {   // 65~80분: 6 결과 — 가로축 · 문헌 장(qd-heat-dir) · 넣기 → 빼기
            setStage(5);
            const L = {}; for (const j of [1, 2, 3, 4]) L[j] = await live.student(j + '조노트북', 'laptop'); const P3 = await live.student('3조폰', 'phone');
            const team = async (n, f) => { try { await f(); } catch (e) { note(n + ' 막힘', String(e.message).split('\n')[0]); } };
            const RE = /시료 \d|⚠|≈ 표시|속 빈|예상|📊|최소제곱|기울기|뺐|넣었|직선|점이|점 \d|필요|아직|문헌|📚/;
            const axis = pg => pg.evaluate(() => [...document.querySelectorAll('#sel-x option')].map(o => (o.selected ? '●' : '') + o.textContent));
            await L[1].waitForTimeout(1200); setStage(6); await lesson('result', 0, '', false, 6500);
            for (const j of [1, 2, 3, 4]) note('6 결과 ' + j + '조', { 단계: await cur(L[j]), 가로축: await axis(L[j]), 줄: await panel(L[j], RE, 18), 가리기: await gates(L[j]) });
            await W.shot(L[3], '3조 6 결과 넣음', true); await W.shot(L[2], '2조 6 결과', true);
            await lesson('result', 1, '', false, 1200); await lesson('result', 1, '', true, 1200); await lesson('result', 2, '', false, 1200); await lesson('result', 2, '', true, 1200); await lesson('result', 3, '', false, 1200); await lesson('result', 3, '', true, 1200);
            await lesson('result', 4, 'qd-heat-dir', false, 1500);
            await W.tap(L[2], /^2\s*이론/); await L[2].waitForTimeout(500); await W.tap(L[2], '탄소 양자점'); await L[2].waitForTimeout(400);
            note('result 4 물음(문헌에서는) · 2조가 2 이론 [탄소 양자점] 탭을 봄', await gates(L[2]));
            note('result 4 물음 · 6 결과 화면의 가리기(1조)', await gates(L[1]));
            await lesson('result', 4, 'qd-heat-dir', true);
            note('result 4 풀이 뒤 · 2조 [탄소 양자점] 탭', await gates(L[2])); note('result 4 풀이 뒤 · 1조 6 결과', { 가리기: await gates(L[1]), 줄: await panel(L[1], /문헌|📚|경향/, 5) });
            await W.tap(L[2], /^6\s*결과/); await L[2].waitForTimeout(500);
            await lesson('result', 5, '', false, 1500); await lesson('result', 5, '', true, 1200); await lesson(null, 0, '', false, 6500);
            await team('3조 빼기로', async () => {
                note('3조 노트북 ⚠ 상자(노트북에서 바꿀 수 있나)', { 고르기칸: await L[3].locator('.qd-mix input[type=radio]').locator('visible=true').count(), 글: await panel(L[3], /잰 기기|폰에서|고른 것|맞춤에/, 5) });
                await W.tap(P3, '④ 저장').catch(() => {}); await P3.waitForTimeout(500);
                await P3.locator('input[type=radio][value=out]').locator('visible=true').first().check(); const why = P3.locator('.qd-mix input[type=text], .qd-mix textarea').locator('visible=true'); await why.first().fill('요소와 가열을 같이 바꿔서 무엇 때문인지 알 수 없어서 뺌'); await why.first().blur(); await P3.waitForTimeout(700);
                note('3조 폰 빼기로 바꾼 뒤 띠', { 줄: (await W.text(P3)).split('\n').filter(l => /✏️|바뀜|보냄|보내기 전|고른 회차/.test(l)).slice(0, 5), 체크: await P3.locator('input[type=checkbox]').locator('visible=true').evaluateAll(a => a.map(e => e.checked)) });
                const btn = P3.locator('button').filter({ hasText: '고른 회차 보내기' }).locator('visible=true').first(); if (await btn.isDisabled()) { const boxes = P3.locator('input[type=checkbox]').locator('visible=true'); await boxes.nth((await boxes.count()) - 1).check(); note('3조', '보내기 단추가 꺼져 있어 회차를 다시 체크함'); }
                await P3.evaluate(() => scrollTo(0, 0)); await W.tap(P3, '고른 회차 보내기'); await P3.waitForTimeout(3500); await L[3].waitForTimeout(3000);
                note('3조 노트북(빼기 뒤)', { 가로축: await axis(L[3]), 줄: await panel(L[3], RE, 16) }); await W.shot(L[3], '3조 6 결과 뺌', true);
            });
            note('4조 노트북(점 하나)', { 가로축: await axis(L[4]), 줄: await panel(L[4], RE, 10) });
        },
        31: async () => {   // 80~95분: 7 결론
            setStage(6);
            const L = {}; for (const j of [1, 2, 3, 4]) L[j] = await live.student(j + '조노트북', 'laptop');
            const team = async (n, f) => { try { await f(); } catch (e) { note(n + ' 막힘', String(e.message).split('\n')[0]); } };
            await L[1].waitForTimeout(1200); setStage(7); await lesson('conclusion', 0, '', false, 6500);
            note('7 결론 위쪽(보고서 밖, 2조)', (await L[2].locator('.step-panel').locator('visible=true').first().innerText()).split('📝 보고서 쓰기')[0].replace(/\n+/g, ' / ').slice(0, 1100));
            await lesson('conclusion', 1, '', false, 1200); await lesson('conclusion', 1, '', true, 1200); await lesson('conclusion', 2, '', false, 1200); await lesson('conclusion', 2, '', true, 1200); await lesson('conclusion', 3, '', false, 1200); await lesson('conclusion', 3, '', true, 1200); await lesson('conclusion', 4, '', false, 1200); await lesson(null, 0, '', false, 6500);
            const rai = async pg => (await pg.locator('#report-ai').innerText()).replace(/\n+/g, ' / ');
            const write = async (pg, tab, txt) => { await W.tap(pg, tab); await pg.waitForTimeout(300); const ta = pg.locator('#report-ai textarea').locator('visible=true').first(); await ta.fill(txt); await pg.waitForTimeout(1200); };
            await W.tap(L[2], '결론 및 검토'); await L[2].waitForTimeout(400); note('결론 칸 위 글(2조) — 틀·물음', (await rai(L[2])).split(' / ').filter(l => /주장|증거|추론|물음|\?|우리 조|스토크스/.test(l)).slice(0, 10));
            await team('1조', async () => { await write(L[1], '데이터 분석', '가열 60·120·180초의 색 추정 파장은 538.8, 540.4, 535.5 nm 로 5 nm 안에서 오르내렸다(뚜렷한 방향 없음). 분광기를 못 써서 ≈ 추정값이다.');
                await write(L[1], '결론 및 검토', '[주장] 우리 자료로는 가열 시간을 늘리면 파장이 길어진다고 말할 수 없다. [증거] 60→180초에서 ≈538.8→535.5 nm, 차이가 색 추정 오차(±5~10 nm) 안. [추론] 예상은 "조각이 자라면 길어진다"였지만 크기를 재지 않았으니 가정이었다. 문헌 경향(초록 쪽)과 다른 까닭은 RGB 색 추정의 한계나 가열 범위일 수 있다. 스토크스 이동: 1240/538 ≈ 2.30 eV, 3.40 − 2.30 = 1.10 eV.');
                await W.tap(L[1], '제출·인쇄'); await W.tap(L[1], '최종 제출'); await L[1].waitForTimeout(2000); });
            await team('2조', async () => { await write(L[2], '결론 및 검토', '주장: 우리 측정에서는 가열 60초와 120초의 파장이 거의 같았다(예상 "길어진다"와 다름). 증거: 60초 ≈539.2 nm, 120초 ≈540.4 nm, 차이 1.2 nm. 추론: 점이 2개뿐이고 ≈ 추정값이라 방향을 말하기 어렵다. 예상이 틀렸다고도 맞았다고도 못 한다. 스토크스 이동: 1240/540 = 2.30 eV, 3.40 − 2.30 = 1.10 eV');
                note('2조 7 결론 예상 ↔ 결과', await panel(L[2], /내 예상|📊|길어|그대로|달라요|맞았/, 6)); await W.tap(L[2], '제출·인쇄'); await W.tap(L[2], '최종 제출'); await L[2].waitForTimeout(2000); });
            await team('3조', async () => { await write(L[3], '결론 및 검토', '요소를 늘린 시료는 가열도 같이 바꿔서 뺐다. 남은 시료가 하나라 결론을 못 낸다. 다음에는 가열을 120초로 같게 하고 요소만 0.5, 1, 2 로 바꾼다. (4조 시료 요소 1 · 536 nm 를 같이 보면 0.5 → 1 에서 540 → 536)'); });
            await team('4조', async () => { await write(L[4], '결론 및 검토', '시료 1개(요소 1, 120초) ≈536 nm. 예상(길어진다)은 확인 못 함. 시료가 더 필요하다.'); });
            await L[1].waitForTimeout(3000);
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
