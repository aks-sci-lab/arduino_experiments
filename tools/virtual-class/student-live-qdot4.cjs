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
    const lesson = async (stage, i, key, reveal, w) => { const d = W.app.db.docs.get(SP); if (stage === null) d.lesson = { on: false, stage: '', i: 0, key: '', reveal: false, at: new Date() }; else { d.lesson = { on: true, stage, i, key: key || '', reveal: !!reveal, at: new Date() }; if (reveal && key && !OPEN.includes(key)) OPEN.push(key); } d.lessonOpen = OPEN.slice(); await new Promise(r => setTimeout(r, w || 6500)); };
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
