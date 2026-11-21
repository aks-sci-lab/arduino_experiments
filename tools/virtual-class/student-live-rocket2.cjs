// 확인 합동 수업 ① 필름통 로켓(고친 판 2: #152 띠의 '가기' 단추·기다리는 팀·영상 여는 위치) — 학생(가족) 쪽 차례.
//   VC_REPO=<고친 판 폴더> VC_NPM=… node tools/virtual-class/student-live-rocket2.cjs <상태 폴더> <차례> [교사 묶음.json]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { openLive } = require('./student-live.cjs');
const SP = 'labClasses/ccixk7rpw5tx8fjgcdc6m2sp', PAGE = 'projects/film-rocket.html?c=1-9433&s=ccixk7rpw5tx8fjgcdc6m2sp';
(async () => {
    const [dir, turnArg, bundleFile] = process.argv.slice(2), turn = +turnArg;
    const live = await openLive(dir), W = live.W, out = [];
    const note = (k, v) => out.push([k, v]);
    const quiet = () => {};
    const teacher = () => { if (bundleFile) live.apply(JSON.parse(fs.readFileSync(bundleFile, 'utf8'))); };
    const setStage = n => { W.app.db.docs.get(SP).stage = n; };
    const top = async (pg, n) => (await W.text(pg)).split('\n').filter(l => !/^(생각 열기|1차시|2차시|정리|🔒.*)$/.test(l)).slice(0, 10).join(' / ').slice(0, n || 330);
    const btns = async pg => (await W.buttons(pg)).filter(t => !/선생님 연결|메인 페이지/.test(t));
    const has = (pg, t) => pg.getByText(t).locator('visible=true').count();
    const enter = async (pg, team) => { await pg.goto(W.ROOT + PAGE); await pg.waitForTimeout(1200); await pg.getByPlaceholder('예: 별빛 가족').locator('visible=true').first().fill(team); await W.tap(pg, '시작하기'); await pg.waitForTimeout(1500); };
    const toSw = pg => W.stroll(pg, 'x', 18, 0, /초시계로 재기|시작 \(뚜껑/, quiet);
    const start = async pg => { if (await has(pg, '초시계로 재기')) await W.tap(pg, '초시계로 재기'); await W.tap(pg, '시작 (뚜껑'); };
    const stop = async pg => { await W.tap(pg, /펑/); await pg.waitForTimeout(400); if (await has(pg, '이 시간으로 기록')) await W.tap(pg, '이 시간으로 기록'); await pg.waitForTimeout(500); };
    const sw = async (pg, sec) => { await start(pg); await pg.waitForTimeout(sec * 1000); await stop(pg); };
    const all = async tag => { for (const [n, pg] of Object.entries(W.pages)) note(tag + ' ' + n, { 글: await top(pg), 단추: (await btns(pg)).slice(0, 9) }); };
    const T = {
        1: async () => {   // 0~35분: 입장 · 생각 열기 → (8분 1차시 열림) → A 도전 결과, B 초시계 앞, C 한 번 재고 끊김, D 결과 화면
            teacher();
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            await enter(A, '별빛가족'); await enter(B, '달님 탐험대'); await enter(C, '로켓왕'); await enter(D, '느긋한 곰');
            for (const pg of [A, B, C, D]) await W.stroll(pg, 'x', 14, 1, /돌아가기/, quiet);
            setStage(2); await A.waitForTimeout(6000);
            await toSw(A); await sw(A, 2); await W.tap(A, '그래프 보기'); await W.tap(A, '왜 달랐을까'); await W.stroll(A, 'x', 10, 0, /도전하기/, quiet); await W.tap(A, '도전하기'); await toSw(A); await sw(A, 3);
            await toSw(C); await sw(C, 2); await C.waitForTimeout(2500); W.offline.C = true;
            await toSw(D); await sw(D, 2.5);
            await toSw(B);
            await A.waitForTimeout(3000); await all('35분');
        }
        // TURNS
    };
    try { await T[turn](); } catch (e) { note('막힘', String(e.message).split('\n')[0]); }
    out.push(['알림 창', W.dialogs.splice(0)], ['오류', W.errors.splice(0)]);
    const bundle = await live.close(turn, '학생 차례 ' + turn);
    delete bundle.set[SP];   // 수업 문서(단계)는 교사 것이라 보내지 않음
    for (const d of Object.values(bundle.set)) { if (d.data) { try { d.data = JSON.stringify({ v: 1, stage: JSON.parse(d.data).stage }); } catch (e) { d.data = '{}'; } } for (const k of ['expireAt', 'timestamp']) delete d[k]; }
    bundle.cut = ['items 줄의 data']; fs.writeFileSync(path.join(dir, 'out-' + turn + '.json'), JSON.stringify(bundle));
    console.log(JSON.stringify(out, null, 1)); console.log('묶음 글자 수', JSON.stringify(bundle).length);
})();
