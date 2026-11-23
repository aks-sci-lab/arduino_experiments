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
        },
        2: async () => {   // 35~85분: 2차시 열림(띠 단추) → A 영상·도전, B 2차시 측정 중, D 는 1차시에 남음, C 다시 연결
            setStage(2); W.offline.C = true;
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const go = pg => pg.locator('button, a').filter({ hasText: /로 가기|끝내고 가요/ }).locator('visible=true');
            const goState = async pg => { const g = go(pg); return (await g.count()) ? { 글: (await g.first().innerText()).trim(), 꺼짐: await g.first().isDisabled() } : '띠 단추 없음'; };
            await toSw(B); await start(B); await B.waitForTimeout(2500);
            setStage(3); await A.waitForTimeout(7000);
            for (const [n, pg] of Object.entries(W.pages)) note('(가) 2차시 열림 ' + n, { 띠: ((await W.text(pg)).split('\n').find(l => /선생님이/.test(l)) || '띠 없음'), 띠단추: await goState(pg), 화면: (await top(pg, 160)).split(' / ').slice(3, 6).join(' / ') });
            await W.shot(B, 'B 측정 중 띠'); await W.shot(D, 'D 결과 화면 띠');
            await stop(B); note('(가) B 펑 뒤', { 띠단추: await goState(B), 화면: await top(B, 200) });
            // A: 띠 단추로 2차시 → 영상
            await go(A).first().click(); await A.waitForTimeout(800); note('A 띠 단추 누른 뒤', await top(A, 200));
            await W.stroll(A, 'x', 22, 0, /영상으로 재기/, quiet); await W.tap(A, '영상으로 재기'); await A.waitForTimeout(1000); await W.tap(A, '녹화 시작'); await A.waitForTimeout(6000); await W.tap(A, '녹화 끝'); await A.waitForTimeout(2500);
            note('A 발사 영상(6초 녹화)이 열린 위치', (await W.text(A)).split('\n').filter(l => /^영상 |장면|끝|앞/.test(l)).slice(0, 4)); await W.shot(A, 'A 발사 영상 연 위치');
            await W.tap(A, '이 장면이 가장 높아요'); await A.waitForTimeout(800); const bx = await A.locator('canvas').locator('visible=true').first().boundingBox();
            for (const [fx, fy] of [[0.3, 0.95], [0.3, 0.5], [0.6, 0.42]]) { await A.touchscreen.tap(bx.x + bx.width * fx, bx.y + bx.height * fy); await A.waitForTimeout(500); }
            await W.tap(A, '이 결과 기록'); await W.tap(A, '그래프 보기'); await A.waitForTimeout(600); await W.tap(A, /도전: 딱/); await W.tap(A, '도전하기'); await W.stroll(A, 'x', 6, 0, /눈으로 보고 고르기/, quiet); await W.tap(A, '눈으로 보고 고르기'); await W.tap(A, '아이 키와 비슷'); await A.waitForTimeout(600);
            note('A 2차시 도전 결과(여기 머묾)', { 화면: await top(A, 260), 단추: (await btns(A)).slice(4) });
            // B: 띠 단추로 2차시 → 눈으로 고르기 화면에서 발사 기다림
            if (await go(B).count()) await go(B).first().click(); else await W.tap(B, /^2차시$/); await B.waitForTimeout(600); await W.stroll(B, 'x', 22, 0, /영상으로 재기/, quiet); await W.tap(B, '눈으로 보고 고르기'); note('B (85분)', await top(B, 200));
            // C: 다시 연결
            W.offline.C = false; await C.waitForTimeout(14000); note('C 다시 연결 14초 뒤', { 화면: await top(C, 230), 띠단추: await goState(C) });
            note('D (85분, 띠 단추를 안 누름)', { 화면: await top(D, 230), 띠단추: await goState(D) });
            await A.waitForTimeout(3000);
        },
        3: async () => {   // 85~95분: 정리 열림 → D·C 가 띠 단추로 정리에 가는지
            setStage(3);
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const go = pg => pg.locator('button, a').filter({ hasText: /로 가기|끝내고 가요/ }).locator('visible=true');
            const goState = async pg => { const g = go(pg); return (await g.count()) ? { 글: (await g.first().innerText()).trim(), 꺼짐: await g.first().isDisabled() } : '띠 단추 없음'; };
            if (!(await has(B, '아이 키와 비슷'))) { await W.stroll(B, 'x', 8, 0, /눈으로 보고 고르기/, quiet); await W.tap(B, '눈으로 보고 고르기'); }
            setStage(4); await A.waitForTimeout(7000);
            for (const [n, pg] of Object.entries(W.pages)) note('(라) 정리 열림 ' + n, { 띠: ((await W.text(pg)).split('\n').find(l => /선생님이/.test(l)) || '띠 없음'), 띠단추: await goState(pg), 화면: (await top(pg, 170)).split(' / ').slice(3, 6).join(' / ') });
            await W.shot(D, 'D 정리 열림'); 
            await W.tap(B, '아이 키와 비슷'); await B.waitForTimeout(600); note('B 고른 뒤 띠단추', await goState(B));
            for (const [n, pg] of [['D', D], ['C', C]]) { if (await go(pg).count()) { await go(pg).first().click(); await pg.waitForTimeout(800); note(n + ' 띠 단추 누른 뒤', await top(pg, 220)); await W.stroll(pg, 'x', 12, 1, /결과 카드 만들기/, quiet); note(n + ' 정리 끝', await top(pg, 220)); } else note(n + ' 띠 단추', '없음'); }
            if (await go(A).count()) { await go(A).first().click(); await A.waitForTimeout(600); } await W.stroll(A, 'x', 12, 2, /결과 카드 만들기/, quiet); await W.tap(A, '결과 카드 만들기'); await A.waitForTimeout(1000); note('A 끝', await top(A, 160));
            if (await go(B).count()) { await go(B).first().click(); await B.waitForTimeout(600); await W.stroll(B, 'x', 3, 0, /결과 카드 만들기/, quiet); } note('B 끝', await top(B, 200));
            await A.waitForTimeout(3000);
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
