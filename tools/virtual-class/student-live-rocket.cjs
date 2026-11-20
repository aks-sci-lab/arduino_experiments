// 합동 수업 ① 필름통 로켓(고친 판) — 학생(가족) 쪽 차례. 교사 세션 문서 묶음을 넣고 가족 폰을 움직인 뒤 바뀐 문서 묶음을 내놓는다.
//   VC_REPO=<고친 판 폴더> VC_NPM=… node tools/virtual-class/student-live-rocket.cjs <상태 폴더> <차례> [교사 묶음.json]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { openLive } = require('./student-live.cjs');
const CODE = '1-5411', SP = 'labClasses/cixem6przhsi57h2j9suc5cc', PAGE = 'projects/film-rocket.html?c=1-5411&s=cixem6przhsi57h2j9suc5cc';
(async () => {
    const [dir, turnArg, bundleFile] = process.argv.slice(2), turn = +turnArg;
    const live = await openLive(dir), W = live.W, out = [];
    const note = (k, v) => out.push([k, v]);
    const quiet = () => {};   // 걷기 기록은 남기지 않음(필요한 것만 적음)
    const teacher = () => { if (bundleFile) live.apply(JSON.parse(fs.readFileSync(bundleFile, 'utf8'))); };
    const stageOf = () => W.app.db.docs.get(SP).stage, setStage = n => { W.app.db.docs.get(SP).stage = n; };
    const top = async pg => (await W.text(pg)).split('\n').filter(l => !/^(생각 열기|1차시|2차시|정리|🔒.*)$/.test(l)).slice(0, 9).join(' / ').slice(0, 420);
    const name = pg => pg.getByPlaceholder('예: 별빛 가족').locator('visible=true').first();
    const enter = async (pg, team) => { await name(pg).fill(team); await W.tap(pg, '시작하기'); await pg.waitForTimeout(1500); };
    const T = {
        1: async () => {   // 0~6분: 입장 · 생각 열기
            teacher();
            const A = await live.student('A별빛', 'phone'); await A.goto(W.ROOT + PAGE); await A.waitForTimeout(1200); await enter(A, '별빛가족');
            const B = await live.student('B달님', 'phone'); await B.goto(W.ROOT + PAGE); await B.waitForTimeout(1200); await enter(B, '별빛가족');
            note('B 같은 이름', (await W.text(B)).split('\n').find(l => /같은 이름/.test(l))); await enter(B, '달님 탐험대');
            const C = await live.student('C로켓왕', 'Pixel 7'); await C.goto(W.ROOT + PAGE); await C.waitForTimeout(1200); await enter(C, '로켓왕👑');
            const E = await live.student('E코드', 'phone'); await E.goto(W.ROOT + 'index.html'); await W.tap(E, '학생'); await E.getByPlaceholder('2-4821').fill('15411'); await W.tap(E, '들어가기'); await E.waitForTimeout(800);
            note('E 줄표 없이', { 주소: E.url().replace(W.ROOT, '').slice(0, 40), 글: (await W.text(E)).split('\n').find(l => /모양|찾지/.test(l)) || '' });
            if (/index/.test(E.url())) { await E.getByPlaceholder('2-4821').fill(CODE); await W.tap(E, '들어가기'); await E.waitForTimeout(1500); }
            await enter(E, '우리집 최고');
            await W.stroll(A, 'A', 14, 2, /돌아가기/, quiet); await W.stroll(C, 'C', 14, 0, /돌아가기/, quiet);   // A·C: 세 문제 다 풀고 기다림
            await W.stroll(E, 'E', 5, 1, /돌아가기/, quiet);                                                          // E: 두 문제쯤
            await W.stroll(B, 'B', 2, 0, /돌아가기/, quiet);                                                          // B: 느림(첫 문제 읽는 중)
            for (const [n, pg] of Object.entries(W.pages)) note(n, await top(pg));
            await W.shot(A, 'A 기다리는 화면'); await A.waitForTimeout(4000);
        }
        // TURNS
    };
    try { await T[turn](); } catch (e) { note('막힘', String(e.message).split('\n')[0]); }
    out.push(['알림 창', W.dialogs.splice(0)], ['오류', W.errors.splice(0)]);
    const bundle = await live.close(turn, '학생 차례 ' + turn);
    fs.writeFileSync(path.join(dir, 'out-' + turn + '.json'), JSON.stringify(bundle));
    console.log(JSON.stringify(out, null, 1)); console.log('묶음 글자 수', JSON.stringify(bundle).length, Object.keys(bundle.set));
})();
