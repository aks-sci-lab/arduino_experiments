// 설명 화면 합동 수업 2차 ① 필름통 로켓(고친 판: 👀 앞 화면을 봐요 띠 · 답 가리기 · 하나만 바꿔 한 번 더) — 학생(가족) 쪽 차례.
//   VC_REPO=<고친 판 폴더> VC_NPM=… node tools/virtual-class/student-live-rocket4.cjs <상태 폴더> <차례> [교사 묶음.json]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { openLive } = require('./student-live.cjs');
const SP = 'labClasses/cb63cejb3spj924cwsebbpq8', PAGE = 'projects/film-rocket.html?c=1-0703&s=cb63cejb3spj924cwsebbpq8';
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
    // 교사 설명 장: 수업 문서의 lesson · lessonOpen 을 바꿈 (교사 세션이 알려 준 값 그대로)
    const lesson = async (stage, i, key, reveal, open, on) => { const d = W.app.db.docs.get(SP); d.lesson = { on: on !== false, stage: on === false ? '' : stage, i: on === false ? 0 : i, key: key || '', reveal: !!reveal, at: new Date() }; d.lessonOpen = open.slice(); await new Promise(r => setTimeout(r, 6500)); };
    const st = async (pg, n) => ({ 띠: await pg.locator('.cs-look-band').locator('visible=true').count() ? '👀 있음' : '없음', 가려진곳: await pg.locator('.cs-ans-hide').locator('visible=true').count(), 글: (await top(pg, n || 420)).split(' / ').slice(3).join(' / '), 단추: (await btns(pg)).slice(4) });
    const pickQ = async (pg, txt) => { await W.tap(pg, txt); await pg.waitForTimeout(500); };
    const T = {
        1: async () => {   // 0~12분: 생각 열기 — 교사가 장을 넘길 때마다 (0)~(8)
            teacher();
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7');
            await enter(A, '무지개 로켓'); await enter(B, '번개팀'); await enter(C, '할머니와 나'); await A.waitForTimeout(1500);
            note('(0) 장 1 · A 입장 뒤', await st(A, 500)); await W.shot(A, 'A 앞 화면 띠');
            // B: 장 1 동안 혼자 끝까지 눌러 봄
            await W.tap(B, '시작 →'); await B.waitForTimeout(400); await pickQ(B, '세게 움직이는 것'); note('(0) B 가 먼저 힘을 고름', await st(B, 520)); await W.shot(B, 'B 가려진 정의');
            await W.tap(B, '다음 →'); await pickQ(B, '속도가 변하는 정도'); note('(0) B 가속도', await st(B, 420)); await W.tap(B, '다음 →'); await pickQ(B, '일정한 넓이에 작용하는 힘'); await W.tap(B, '다음 →'); await B.waitForTimeout(500); note('(0) B 끝까지 간 화면', await st(B, 420));
            await lesson('think', 1, 'force', false, []);
            await W.tap(A, '시작 →'); await pickQ(A, '물체가 가지고 있는 것'); note('(1) 힘 물음 · A 고른 뒤', await st(A, 520));
            await W.tap(C, '시작 →'); await pickQ(C, '물체의 모양이나 움직임을 바꾸는 원인'); note('(1) C 고른 뒤', await st(C, 300));
            await lesson('think', 1, 'force', true, ['force']);
            note('(2) 힘 풀이 열림 · A', await st(A, 520)); note('(2) B(기다림 화면)', await st(B, 300));
            await lesson('think', 2, 'accel', false, ['force']);
            await W.tap(A, '다음 →'); await pickQ(A, '빠른 정도'); note('(3) 가속도 물음 · A 고른 뒤', await st(A, 520));
            await W.tap(C, '다음 →'); await pickQ(C, '움직인 거리');
            const D = await live.student('D', 'phone'); await enter(D, '티격태격'); await W.tap(D, '시작 →'); await pickQ(D, '물체가 가지고 있는 것'); note('(3) D 늦게 와 힘을 고름(이미 열린 풀이)', await st(D, 420));
            await lesson('think', 2, 'accel', true, ['force', 'accel']);
            note('(4) 가속도 풀이 열림 · A', await st(A, 420));
            await lesson('think', 3, 'pressure', false, ['force', 'accel']);
            await W.tap(A, '다음 →'); await pickQ(A, '누르는 힘의 크기'); await W.tap(C, '다음 →'); await pickQ(C, '공기의 무게'); await W.tap(D, '다음 →'); await pickQ(D, '빠른 정도'); await W.tap(D, '다음 →'); await D.waitForTimeout(400);
            note('(5) 압력 물음 · A 고른 뒤', await st(A, 420));
            await lesson('think', 3, 'pressure', true, ['force', 'accel', 'pressure']);
            note('(6) 압력 풀이 열림 · A', await st(A, 420));
            await lesson('think', 4, '', false, ['force', 'accel', 'pressure']);
            await W.tap(A, '다음 →'); await W.tap(C, '다음 →'); await A.waitForTimeout(600);
            await lesson('', 0, '', false, ['force', 'accel', 'pressure'], false);
            await all('(8) 설명 닫힘 · 12분'); note('(8) 띠', Object.fromEntries(await Promise.all(Object.entries(W.pages).map(async ([n, pg]) => [n, (await st(pg, 10)).띠]))));
            await W.tap(B, '돌아가기').catch(() => {}); await B.waitForTimeout(600); note('B 가 생각 열기로 돌아가 본 화면', await st(B, 520));
        },
        2: async () => {   // 12~18분: 1차시 열림 + 설명 장 1~5 — (9)~(16)
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const O3 = ['force', 'accel', 'pressure']; const lg = (k, v) => note(k, { 글: v.글 ? v.글.slice(0, 520) : v, 단추: v.단추 });
            const SW = /초시계로 재기|시작 \(뚜껑/;
            await A.waitForTimeout(1200); if (await has(D, '공기의 무게')) { await pickQ(D, '공기의 무게'); }
            setStage(2); await lesson('t1', 0, 'gas', false, O3);
            for (const [n, pg] of Object.entries(W.pages)) note('(9) 1차시 열림 ' + n, await st(pg, 330));
            if (await D.locator('button, a').filter({ hasText: /로 가기/ }).locator('visible=true').count()) await D.locator('button, a').filter({ hasText: /로 가기/ }).locator('visible=true').first().click();
            // B: 설명 중에 먼저 누름
            await W.stroll(B, '(9) B 먼저', 7, 0, /🔒 무엇을 바꿔|물의 양 바꾸기/, lg); await W.shot(B, 'B 1차시 퀴즈 가림');
            await lesson('t1', 0, 'gas', true, O3.concat('gas'));
            note('(10) 풀이 뒤 B 폰', await st(B, 520));
            await W.stroll(A, '(10) A 풀이 듣고', 5, 0, /🔒 무엇을 바꿔|물의 양 바꾸기|안전 확인 →/, lg);
            await lesson('t1', 1, '', false, O3.concat('gas'));
            await lesson('t1', 2, 'control', false, O3.concat('gas'));
            await W.stroll(B, '(12) B 먼저', 8, 1, /이 조건으로|예측했어요|초시계로 재기/, lg);
            await lesson('t1', 2, 'control', true, O3.concat('gas', 'control'));
            note('(13) 풀이 뒤 B 폰', await st(B, 420));
            await lesson('t1', 3, '', false, O3.concat('gas', 'control'));
            await lesson('t1', 4, '', false, O3.concat('gas', 'control'));
            await lesson('', 0, '', false, O3.concat('gas', 'control'), false);
            await W.stroll(A, '(16) A', 22, 0, SW, lg);
            for (const [n, pg, k] of [['B', B, 1], ['C', C, 2]]) await W.stroll(pg, n, 22, k, SW, quiet);
            await W.stroll(D, 'D', 8, 0, SW, quiet);
            await all('(16) 시작! 뒤');
        },
        21: async () => {   // 18~50분: 측정 — 한 값으로만 재면? · (17)~(20) 돌아보기
            setStage(2);
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const O5 = ['force', 'accel', 'pressure', 'gas', 'control']; const lg = (k, v) => note(k, { 글: v.글 ? v.글.slice(0, 560) : v, 단추: v.단추 });
            const SW = /초시계로 재기|시작 \(뚜껑/; const team = async (n, f) => { try { await f(); } catch (e) { note(n + ' 막힘', String(e.message).split('\n')[0]); } };
            const res = async pg => ({ 글: (await top(pg, 620)).split(' / ').slice(3).join(' / '), 단추: (await btns(pg)).slice(4) });
            await team('A', async () => { for (let i = 0; i < 3; i++) { await toSw(A); await sw(A, 2 + i * 0.4); } note('A 10 mL 로만 3번 잰 뒤', await res(A)); await W.shot(A, 'A 한 값 3번');
                if (await has(A, '그래프 보기')) { await W.tap(A, '그래프 보기'); await A.waitForTimeout(600); note('A 그래프 눌러 봄(값 한 가지)', await res(A)); await W.shot(A, 'A 그래프 값 한 가지'); } });
            await team('B', async () => { for (let i = 0; i < 3; i++) { await toSw(B); await sw(B, 2 + i * 0.3); } note('B 20 °C 로만 3번 잰 뒤', await res(B));
                if (await has(B, '그래프 보기')) { await W.tap(B, '그래프 보기'); await B.waitForTimeout(600); note('B 그래프(값 한 가지)', await res(B)); await W.stroll(B, 'B 더 가 봄', 4, 0, /도전하기/, lg); } });
            await team('C', async () => { for (let i = 0; i < 2; i++) { await toSw(C); await sw(C, 2.2); } });
            await team('D', async () => { await W.stroll(D, 'D', 22, 0, SW, quiet); await start(D); await D.waitForTimeout(1200); });
            await lesson('t1', 5, '', false, O5);
            for (const [n, pg] of Object.entries(W.pages)) note('(17) 돌아보기 ' + n, await st(pg, 300)); await W.shot(D, 'D 초시계 + 앞 화면 띠');
            await team('D', async () => { await stop(D); note('(17) D 띠가 뜬 채 펑 멈춤', await res(D)); });
            await lesson('t1', 5, '', true, O5); await lesson('t1', 6, '', false, O5); await lesson('', 0, '', false, O5, false);
            // 돌아보기 뒤: 폰 말을 따라 값을 바꿔 재는지 (A·B 는 따라 함, C 는 그대로)
            await team('A 값 바꿈', async () => { const t = (await btns(A)).find(x => /바꿔|더 재기/.test(x)); note('A 가 누른 단추', t); await W.tap(A, t.slice(0, 10)); await A.waitForTimeout(600); note('A 값 고르는 화면', await res(A)); await W.tap(A, '+'); await toSw(A); await sw(A, 3.2); note('A 15 mL 1번 잰 뒤', await res(A)); await W.tap(A, '그래프 보기'); await A.waitForTimeout(600); note('A 그래프(값 두 가지)', await res(A)); });
            await team('B 값 바꿈', async () => { const t = (await btns(B)).find(x => /바꿔|더 재기/.test(x)); await W.tap(B, t.slice(0, 10)); await B.waitForTimeout(500); await W.tap(B, '+'); await toSw(B); await sw(B, 1.5); await W.tap(B, '그래프 보기'); await B.waitForTimeout(500); await W.stroll(B, 'B 값 두 가지 뒤', 9, 0, /도전하기/, lg); if (await has(B, '도전하기')) { await W.tap(B, '도전하기'); await B.waitForTimeout(500); note('B 도전 화면', await res(B)); } });
            await A.waitForTimeout(3000); await all('50분');
        },
        22: async () => {   // B: '바꿔서 다시 재기'를 누르고도 값을 안 바꾼 채(20 °C) 한 번 더 → 그 뒤 값을 바꿈 → 그래프 → 도전
            setStage(2); const B = await live.student('B', 'phone'); const lg = (k, v) => note(k, { 글: v.글 ? v.글.slice(0, 560) : v, 단추: v.단추 });
            const res = async pg => ({ 글: (await top(pg, 620)).split(' / ').slice(3).join(' / '), 단추: (await btns(pg)).slice(4) });
            note('B 지금 화면', await res(B)); if (await has(B, '녹화 시작')) { await W.tap(B, '← 뒤로'); await B.waitForTimeout(500); } note('B 뒤로 뒤', await res(B)); await toSw(B); await W.tap(B, '초시계로 재기').catch(() => {}); await B.waitForTimeout(300); await W.tap(B, '시작 (뚜껑'); await B.waitForTimeout(2000); await stop(B); note('B 값을 안 바꾸고(20 °C) 4번째 잰 뒤', await res(B));
            await W.tap(B, '그래프 보기'); await B.waitForTimeout(500); note('B 그래프 눌러 봄', await res(B));
            await W.tap(B, '바꿔서 다시 재기'); await B.waitForTimeout(500); await W.tap(B, '+'); await toSw(B); await sw(B, 1.4); note('B 30 °C 1번 잰 뒤', await res(B));
            await W.tap(B, '그래프 보기'); await B.waitForTimeout(500); await W.stroll(B, 'B 값 두 가지 뒤', 9, 0, /도전하기/, lg);
            if (await has(B, '도전하기')) { await W.tap(B, '도전하기'); await B.waitForTimeout(500); note('B 도전 화면', await res(B)); }
            await B.waitForTimeout(2500);
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
