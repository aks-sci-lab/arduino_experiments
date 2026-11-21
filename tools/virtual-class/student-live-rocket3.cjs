// 설명 화면 합동 수업 ① 필름통 로켓(claude/lesson-slides) — 학생(가족) 쪽 차례.
//   VC_REPO=<고친 판 폴더> VC_NPM=… node tools/virtual-class/student-live-rocket3.cjs <상태 폴더> <차례> [교사 묶음.json]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { openLive } = require('./student-live.cjs');
const SP = 'labClasses/ckc58rnhy9xkwtidzy4xh5tg', PAGE = 'projects/film-rocket.html?c=1-2747&s=ckc58rnhy9xkwtidzy4xh5tg';
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
        1: async () => {   // 0~12분: 설명 장 5장(생각 열기) 동안 폰 — A 는 장을 따라, B 는 먼저 누름, C 는 할머니가 누름, D 는 늦게
            teacher();
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7');
            await enter(A, '무지개 로켓'); note('A 장1: 시작하기 누른 뒤 폰', { 글: await top(A, 500), 단추: await btns(A) });
            await enter(B, '번개팀'); await W.stroll(B, 'B', 14, 1, /돌아가기/, quiet); note('B 장1 이 끝나기 전에 혼자 끝까지(먼저 누름)', { 글: await top(B, 400), 단추: await btns(B) });
            await enter(C, '할머니와 나');
            await W.stroll(A, 'A', 14, 0, /돌아가기/, note);
            await W.stroll(C, 'C', 14, 2, /돌아가기/, quiet); note('C 끝', { 글: await top(C, 300), 단추: await btns(C) });
            const D = await live.student('D', 'phone'); await enter(D, '티격태격'); await W.stroll(D, 'D', 5, 3, /돌아가기/, quiet); note('D 12분(늦게 와 도중)', { 글: await top(D, 400), 단추: await btns(D) });
            await A.waitForTimeout(3000); await all('12분');
        },
        2: async () => {   // 12~50분: 1차시 열림 + 설명 장 7장 — 폰 1차시 화면 순서 ↔ 장 순서, 측정
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            await A.waitForTimeout(1500);
            if (await has(D, '공기의 무게')) { await W.tap(D, '공기의 무게'); await D.waitForTimeout(400); note('D 압력 고른 뒤(다음 안 누름)', await top(D, 300)); }
            setStage(2); await A.waitForTimeout(7000);
            await all('1차시 열린 순간');
            const lg = (k, v) => note(k, { 글: v.글 ? v.글.slice(0, 520) : v, 단추: v.단추 });
            await W.stroll(B, 'B', 26, 1, /초시계로 재기|시작 \(뚜껑/, lg);
            await W.stroll(A, 'A', 26, 0, /초시계로 재기|시작 \(뚜껑/, quiet);
            await W.stroll(C, 'C', 26, 2, /초시계로 재기|시작 \(뚜껑/, quiet);
            await W.stroll(D, 'D', 9, 0, /초시계로 재기|시작 \(뚜껑/, quiet);
            await all('장 5 뒤 폰 틀로 바뀔 때');
        },
        21: async () => {   // 20~50분: 측정 활동. 35분 장 6, 42분 장 7 을 프로젝터에 띄울 때 폰이 어디인지
            setStage(2);
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const lg = (k, v) => note(k, { 글: v.글 ? v.글.slice(0, 600) : v, 단추: v.단추 });
            const team = async (n, f) => { try { await f(); } catch (e) { note(n + ' 막힘', String(e.message).split('\n')[0]); } };
            await team('B', async () => {
                await toSw(B); await sw(B, 2); note('B 1번 잰 뒤', { 글: await top(B, 500), 단추: (await btns(B)).slice(4) });
                for (let i = 0; i < 2; i++) { await toSw(B); await sw(B, 2 + i); }
                note('B 3번 잰 뒤', { 글: await top(B, 600), 단추: (await btns(B)).slice(4) });
                await W.stroll(B, 'B+', 12, 1, /그래프 보기|왜 달랐을까|도전하기/, lg);
            });
            await team('A', async () => { await toSw(A); await sw(A, 3); await toSw(A); await sw(A, 2); note('A 2번 잰 뒤', { 글: await top(A, 500), 단추: (await btns(A)).slice(4) }); });
            await team('C', async () => { await toSw(C); await sw(C, 2); note('C 1번 잰 뒤', await top(C, 400)); });
            await team('D', async () => { await W.stroll(D, 'D', 14, 1, /초시계로 재기|시작 \(뚜껑/, quiet); await start(D); await D.waitForTimeout(1500); note('D 35분(재는 중)', await top(D, 300)); });
            await all('35분 장 6 띄울 때');
            await team('D', async () => { await stop(D); });
            await team('B', async () => { await W.stroll(B, 'B++', 14, 1, /도전하기/, lg); if (await has(B, '도전하기')) { await W.tap(B, '도전하기'); await B.waitForTimeout(600); note('B 도전 화면', { 글: await top(B, 600), 단추: (await btns(B)).slice(4) }); } });
            await team('A', async () => { await toSw(A); await sw(A, 2.5); await W.stroll(A, 'A+', 6, 0, /그래프 보기|왜 달랐을까|도전하기/, lg); });
            await team('C', async () => { await toSw(C); await sw(C, 2.5); });
            await A.waitForTimeout(3000); await all('50분');
        },
        3: async () => {   // 50분: 2차시 열림 + 설명 장 7장 — 폰 2차시 순서, 첫 발사
            setStage(2);
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const lg = (k, v) => note(k, { 글: v.글 ? v.글.slice(0, 560) : v, 단추: v.단추 });
            const go = pg => pg.locator('button, a').filter({ hasText: /로 가기|끝내고 가요/ }).locator('visible=true');
            const team = async (n, f) => { try { await f(); } catch (e) { note(n + ' 막힘', String(e.message).split('\n')[0]); } };
            await A.waitForTimeout(1500); setStage(3); await A.waitForTimeout(7000);
            for (const [n, pg] of Object.entries(W.pages)) note('2차시 열린 순간 ' + n, { 띠: ((await W.text(pg)).split('\n').find(l => /선생님이/.test(l)) || '띠 없음'), 띠단추: (await go(pg).count()) ? (await go(pg).first().innerText()).trim() : '없음', 화면: (await top(pg, 200)).split(' / ').slice(3, 6).join(' / ') });
            for (const [n, pg] of Object.entries(W.pages)) await team(n, async () => { if (await go(pg).count()) { await go(pg).first().click(); await pg.waitForTimeout(700); } });
            await W.stroll(B, 'B', 30, 1, /영상으로 재기|눈으로 보고 고르기/, lg);
            for (const [n, pg, k] of [['A', A, 0], ['C', C, 2], ['D', D, 0]]) await team(n, () => W.stroll(pg, n, 30, k, /영상으로 재기|눈으로 보고 고르기/, quiet));
            await all('장 7 뒤 폰 틀로 바뀔 때');
            for (const [n, pg, pick] of [['A', A, '아이 키보다 높'], ['B', B, '아이 키보다 높'], ['C', C, '아이 키와 비슷'], ['D', D, '아이 키보다 낮']]) await team(n, async () => {
                await W.tap(pg, '눈으로 보고 고르기'); await pg.waitForTimeout(500); if (n === 'B') note('B 눈으로 고르기 화면', { 글: await top(pg, 500), 단추: (await btns(pg)).slice(4) });
                await W.tap(pg, pick); await pg.waitForTimeout(700); note(n + ' 첫 발사 결과', { 글: await top(pg, 520), 단추: (await btns(pg)).slice(4) });
            });
        },
        31: async () => {   // 60~95분: 하나만 바꿔 한 번 더 → (85분) 정리 열림 → 다시 풀기·결과 카드
            setStage(3);
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const lg = (k, v) => note(k, { 글: v.글 ? v.글.slice(0, 600) : v, 단추: v.단추 });
            const go = pg => pg.locator('button, a').filter({ hasText: /로 가기|끝내고 가요/ }).locator('visible=true');
            const team = async (n, f) => { try { await f(); } catch (e) { note(n + ' 막힘', String(e.message).split('\n')[0]); } };
            await team('A', async () => {
                await W.tap(A, '바꿔서 다시 발사'); await A.waitForTimeout(600); note('A 바꿔서 다시 발사 누른 뒤', { 글: await top(A, 500), 단추: (await btns(A)).slice(4) });
                await W.tap(A, '+'); await A.waitForTimeout(300); await W.stroll(A, 'A', 8, 0, /영상으로 재기|눈으로 보고 고르기/, quiet); await W.tap(A, '눈으로 보고 고르기'); await W.tap(A, '아이 키와 비슷'); await A.waitForTimeout(600);
                note('A 두 번째 발사 결과', { 글: await top(A, 500), 단추: (await btns(A)).slice(4) });
                await W.tap(A, '그래프 보기'); await A.waitForTimeout(600); note('A 그래프', { 글: (await W.text(A)).split('\n').slice(3, 22).join(' / ').slice(0, 700), 단추: (await btns(A)).slice(4) });
            });
            await team('B', async () => { await W.tap(B, '그래프 보기'); await B.waitForTimeout(500); await W.stroll(B, 'B', 8, 1, /영상으로 재기|눈으로 보고 고르기/, lg); });
            await team('D', async () => { await W.tap(D, '바꿔서 다시 발사'); await D.waitForTimeout(500); await W.tap(D, '+'); await W.stroll(D, 'D', 8, 0, /영상으로 재기|눈으로 보고 고르기/, quiet); await W.tap(D, '눈으로 보고 고르기'); await W.tap(D, '아이 키보다 낮'); await D.waitForTimeout(500); note('D 두 번째(무게 +1) 결과', await top(D, 420)); });
            setStage(4); await A.waitForTimeout(7000);
            for (const [n, pg] of Object.entries(W.pages)) note('정리 열린 순간 ' + n, { 띠단추: (await go(pg).count()) ? (await go(pg).first().innerText()).trim() : '없음', 화면: (await top(pg, 220)).split(' / ').slice(3, 7).join(' / ') });
            for (const [n, pg] of Object.entries(W.pages)) await team(n, async () => { if (await go(pg).count()) { await go(pg).first().click(); await pg.waitForTimeout(700); } });
            await W.stroll(A, 'A정리', 16, 2, /결과 카드 만들기/, lg);
            for (const [n, pg, k] of [['B', B, 1], ['C', C, 1], ['D', D, 2]]) await team(n, async () => { await W.stroll(pg, n, 16, k, /결과 카드 만들기/, quiet); note(n + ' 정리 끝', { 글: await top(pg, 700) }); });
            await team('A', async () => { await W.tap(A, '결과 카드 만들기'); await A.waitForTimeout(1200); note('A 결과 카드', await top(A, 500)); });
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
