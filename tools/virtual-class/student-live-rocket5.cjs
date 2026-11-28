// 합동 수업 3차 필름통 로켓(고친 판 3: 하나만 바꿔 구멍 · 퀴즈 ⭕ 는 풀이 뒤 · 띠 📱/👀 · 🔮 예측 · ✍️ 정리 문장) — 학생(가족) 쪽 차례.
//   VC_REPO=<고친 판 폴더> VC_NPM=… node tools/virtual-class/student-live-rocket5.cjs <상태 폴더> <차례> [교사 묶음.json]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { openLive } = require('./student-live.cjs');
const SP = 'labClasses/ck525km29tytpymq23fiwnjr', PAGE = 'projects/film-rocket.html?c=1-4735&s=ck525km29tytpymq23fiwnjr';
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
    // 교사 설명 장: 수업 문서 lesson(mode 포함) · lessonOpen. 물음 상태의 key 있는 장 = mode 'phone', 그 밖 = 'look'
    const OPEN = [];
    const lesson = async (stage, i, key, reveal, w) => { const d = W.app.db.docs.get(SP); if (!OPEN.length && Array.isArray(d.lessonOpen)) OPEN.push(...d.lessonOpen);
        if (stage === null) d.lesson = { on: false, stage: '', i: 0, key: '', reveal: false, mode: 'look', at: new Date() };
        else { d.lesson = { on: true, stage, i, key: key || '', reveal: !!reveal, mode: key && !reveal ? 'phone' : 'look', at: new Date() }; if (reveal && key && !OPEN.includes(key)) OPEN.push(key); }
        d.lessonOpen = OPEN.slice(); await new Promise(r => setTimeout(r, w || 6500)); };
    const bandTxt = async pg => { const b = pg.locator('.cs-look-band').locator('visible=true'); return (await b.count()) ? (await b.first().innerText()).trim() : '띠 없음'; };
    const st = async (pg, n) => ({ 띠: await bandTxt(pg), 글: (await top(pg, n || 460)).split(' / ').slice(3).join(' / '), 단추: (await btns(pg)).slice(4) });
    const pickQ = async (pg, txt) => { await W.tap(pg, txt); await pg.waitForTimeout(500); };
    const team = async (n, f) => { try { await f(); } catch (e) { note(n + ' 막힘', String(e.message).split('\n')[0]); } };
    const lg = (k, v) => note(k, { 글: v.글 ? v.글.slice(0, 640) : v, 단추: v.단추 });
    const T = {
        1: async () => {   // 0~12분: 생각 열기
            teacher();
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7');
            await lesson('think', 0, '', false, 1500);
            await enter(A, '무지개 로켓'); await enter(B, '번개팀'); await enter(C, '할머니와 나'); await A.waitForTimeout(4000);
            note('think 0 · A 입장 뒤', await st(A, 520));
            await team('B 먼저', async () => { await W.tap(B, '시작 →'); await B.waitForTimeout(400); await pickQ(B, '세게 움직이는 것'); note('think 0 · B 가 먼저 힘을 고름', await st(B, 520)); await W.stroll(B, 'B 먼저', 8, 1, /돌아가기/, quiet); note('think 0 · B 끝까지 간 화면', await st(B, 420)); });
            await lesson('think', 1, 'force', false);
            note('think 1 물음(phone) · A', await st(A, 300)); await W.shot(A, 'A 폰에서 골라요 띠');
            await W.tap(A, '시작 →'); await pickQ(A, '물체가 가지고 있는 것'); note('think 1 · A 고른 뒤', await st(A, 520)); await W.tap(C, '시작 →'); await pickQ(C, '물체의 모양이나 움직임을 바꾸는 원인');
            await lesson('think', 1, 'force', true); note('think 1 풀이(look) · A', await st(A, 520));
            await lesson('think', 2, 'accel', false, 3500); await W.tap(A, '다음 →'); await pickQ(A, '빠른 정도'); await W.tap(C, '다음 →'); await pickQ(C, '움직인 거리');
            const D = await live.student('D', 'phone'); await enter(D, '티격태격'); await W.tap(D, '시작 →'); await pickQ(D, '물체가 가지고 있는 것');
            await lesson('think', 2, 'accel', true, 3500);
            await lesson('think', 3, 'pressure', false, 3500); await W.tap(A, '다음 →'); await pickQ(A, '누르는 힘의 크기'); await W.tap(C, '다음 →'); await pickQ(C, '공기의 무게'); await W.tap(D, '다음 →'); await pickQ(D, '빠른 정도'); await W.tap(D, '다음 →'); await D.waitForTimeout(400); await pickQ(D, '공기의 무게');
            await lesson('think', 3, 'pressure', true, 3500); await lesson('think', 4, '', false, 1500);
            await W.tap(A, '다음 →'); await W.tap(C, '다음 →'); await W.tap(D, '다음 →'); await A.waitForTimeout(500);
            note('think 4 · A 기다림 화면', await st(A, 520));
            await lesson(null);
            await all('12분');
        },
        2: async () => {   // 12~20분: 1차시 열림 + 설명 장 0~4 (gas·control 은 폰에서 고르는 장)
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const SW = /초시계로 재기|시작 \(뚜껑/;
            await A.waitForTimeout(1200); setStage(2); await lesson('t1', 0, 'gas', false);
            for (const [n, pg] of Object.entries(W.pages)) note('t1 0 물음(phone) ' + n, await st(pg, 330));
            // B: 먼저, 틀린 보기부터
            await team('B gas', async () => { await W.tap(B, '다음 →'); await B.waitForTimeout(400); await pickQ(B, '물이 무거워져서'); note('B gas 퀴즈: 틀린 보기를 먼저 고름(풀이 전)', await st(B, 620)); await W.shot(B, 'B 퀴즈 골랐어요');
                await pickQ(B, '이산화 탄소가 닫힌 통 안에 쌓여서').catch(e => note('B 다시 고르기', String(e.message).slice(0, 70))); note('B gas: 다른 보기를 다시 눌러 봄', await st(B, 620)); });
            await team('A gas', async () => { await W.tap(A, '다음 →'); await A.waitForTimeout(400); await pickQ(A, '뚜껑이 차가워져서'); note('A gas: 폰에서 골라요 때 고름(풀이 전)', await st(A, 420)); });
            await team('C gas', async () => { await W.tap(C, '다음 →'); await C.waitForTimeout(400); await pickQ(C, '이산화 탄소가 닫힌 통 안에 쌓여서'); });
            await lesson('t1', 0, 'gas', true);
            note('t1 0 풀이 뒤 · B(틀렸다 고침)', await st(B, 700)); note('t1 0 풀이 뒤 · A(틀림)', await st(A, 700)); note('t1 0 풀이 뒤 · C(맞음)', await st(C, 500));
            await team('D gas(풀이 뒤에 품)', async () => { await W.tap(D, '다음 →'); await D.waitForTimeout(400); await pickQ(D, '이산화 탄소가 닫힌 통 안에 쌓여서'); note('D gas: 풀이를 듣고 고름', await st(D, 600)); });
            await team('A 풀이 뒤 다시', async () => { const again = (await btns(A)).filter(t => /이산화|물이|뚜껑이/.test(t)); note('A 풀이 뒤 보기 단추', again); });
            await lesson('t1', 1, '', false, 2500);
            await W.stroll(B, 'B 안전~', 6, 1, /물의 양 바꾸기|실험을 빨리/, lg);
            await lesson('t1', 2, 'control', false);
            for (const [n, pg, k] of [['A', A, 0], ['C', C, 2], ['D', D, 0]]) await team(n, () => W.stroll(pg, n, 8, k, /실험을 빨리|물의 양 바꾸기/, quiet));
            note('t1 2 물음(phone) · A 폰', await st(A, 520)); note('t1 2 물음 · B 폰', await st(B, 520));
            await lesson('t1', 2, 'control', true);
            note('t1 2 풀이 뒤 · A', await st(A, 620)); note('t1 2 풀이 뒤 · B', await st(B, 620));
            await lesson('t1', 3, '', false, 2500);
            await W.stroll(A, 'A 계획(예측)', 8, 0, SW, lg); await W.shot(A, 'A 예측 화면');
            note('A 지금', await st(A, 700));
            note('A 화면의 입력 칸', await A.evaluate(() => [...document.querySelectorAll('input, textarea, select')].filter(e => e.offsetParent).map(e => (e.type || e.tagName) + ':' + (e.placeholder || e.name || e.value || '') + (e.maxLength > 0 ? ' (최대 ' + e.maxLength + '자)' : ''))));
        },
        21: async () => {   // 20~50분: 🔮 예측 + 까닭 → 측정('하나만 바꿔') → 42분 돌아보기
            setStage(2);
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const SW = /초시계로 재기|시작 \(뚜껑/; const VAR = /물의 양 바꾸기/;
            const res = async pg => ({ 글: (await top(pg, 700)).split(' / ').slice(3).join(' / '), 단추: (await btns(pg)).slice(4) });
            const why = pg => pg.locator('textarea, input[type=text]').locator('visible=true');
            const plan = async (pg, v, pred, txt) => { await W.tap(pg, v); await pg.waitForTimeout(400); if (pred) await W.tap(pg, pred); if (txt && await why(pg).count()) { await why(pg).first().fill(txt); await why(pg).first().blur(); } await pg.waitForTimeout(400); };
            await lesson('t1', 4, '', false, 1500); await lesson(null, 0, '', false, 3000);
            // A: 예측을 안 고르고 지나갔던 것 → 엄마가 "예측 골라야지" 하며 뒤로
            await team('A 예측', async () => { for (let i = 0; i < 4 && !(await has(A, '물의 양 바꾸기')); i++) { await W.tap(A, '← 뒤로'); await A.waitForTimeout(400); }
                note('A 뒤로 가서 다시 본 계획 화면', await res(A)); note('A 까닭 칸', await why(A).evaluateAll(a => a.map(e => (e.placeholder || '') + ' · 최대 ' + e.maxLength + '자 · 높이 ' + Math.round(e.getBoundingClientRect().height))));
                await plan(A, null, '길어질 것 같아요', '물이 많으면 무거워서 늦게 열려요'); note('A 예측 고른 뒤', await res(A)); await W.shot(A, 'A 예측 고름', true); });
            await team('B 계획', async () => { await W.stroll(B, 'B', 6, 1, VAR, quiet); await plan(B, '물의 온도 바꾸기', '짧아질 것 같아요', '따뜻하면 빨리 녹아서'); await W.tap(B, '다음 →'); await B.waitForTimeout(400); note('B 변인 퀴즈(풀이가 이미 열린 뒤)', await res(B)); });
            await team('C 계획', async () => { if (!(await has(C, '물의 양 바꾸기'))) await W.stroll(C, 'C', 6, 2, VAR, quiet); await plan(C, '발포비타민 양 바꾸기', '짧아질 것 같아요', ''); });
            await team('D 계획', async () => { if (!(await has(D, '물의 양 바꾸기'))) await W.stroll(D, 'D', 6, 0, VAR, quiet); await W.tap(D, '물의 양 바꾸기'); await D.waitForTimeout(300); await W.tap(D, '다음 →'); await D.waitForTimeout(400); note('D 예측을 안 고르고 다음', await res(D)); });
            // 측정
            await team('A 측정', async () => { for (let i = 0; i < 3; i++) { await toSw(A); await sw(A, 2 + i * 0.4); if (i === 0) note('A 10 mL 1번 잰 뒤', await res(A)); } note('A 10 mL 로만 3번 잰 뒤(결과 화면)', await res(A)); await W.shot(A, 'A 한 값 3번 결과', true);
                const t = (await btns(A)).find(x => /바꿔/.test(x)); await W.tap(A, t.slice(0, 10)); await A.waitForTimeout(500); note('A 바꿔서 다시 → 값 화면', await res(A)); await W.tap(A, '+'); await toSw(A); await sw(A, 3.3); note('A 15 mL 1번 잰 뒤', await res(A)); if (await has(A, '그래프 보기')) { await W.tap(A, '그래프 보기'); await A.waitForTimeout(500); note('A 그래프', await res(A)); } });
            await team('B 측정', async () => { for (let i = 0; i < 3; i++) { await toSw(B); await sw(B, 2 + i * 0.3); } const t = (await btns(B)).find(x => /바꿔/.test(x)); await W.tap(B, t.slice(0, 10)); await B.waitForTimeout(500);
                await W.tap(B, '이 조건으로 →', 0, true).catch(e => note('B 값을 안 바꾸고 이 조건으로', String(e.message).slice(0, 80))); await B.waitForTimeout(500); note('B 값을 안 바꾸고 [이 조건으로 →]를 눌러 봄', await res(B)); await W.shot(B, 'B 같은 값');
                await W.tap(B, '+'); await B.waitForTimeout(300); note('B + 누른 뒤', await res(B)); await toSw(B); await sw(B, 1.5); if (await has(B, '그래프 보기')) { await W.tap(B, '그래프 보기'); await B.waitForTimeout(500); await W.stroll(B, 'B 그래프 뒤', 8, 0, /도전하기/, lg); } });
            await team('C 측정', async () => { for (let i = 0; i < 3; i++) { await toSw(C); await sw(C, 2.2); if (i === 1) note('C ½ 알 2번 잰 뒤(결과 화면)', await res(C)); } note('C ½ 알 3번 잰 뒤(결과 화면 — 그래프를 안 누르는 팀)', await res(C)); await W.shot(C, 'C 한 값 결과', true);
                const t = (await btns(C)).find(x => /바꿔/.test(x)); await W.tap(C, t.slice(0, 10)); await C.waitForTimeout(500); await W.tap(C, '+'); await toSw(C); await sw(C, 1.6); note('C 값을 바꿔 1번 잰 뒤', await res(C)); });
            await team('D 측정', async () => { await toSw(D); await start(D); await D.waitForTimeout(1200); });
            await lesson('t1', 5, '', false, 6500); note('42분 돌아보기 · 띠', Object.fromEntries(await Promise.all(Object.entries(W.pages).map(async ([n, pg]) => [n, await bandTxt(pg)]))));
            await team('D', async () => { await stop(D); note('D 1번 잰 뒤(결과 화면)', await res(D)); });
            await lesson('t1', 5, '', true, 1500); await lesson('t1', 6, '', false, 1500); await lesson(null, 0, '', false, 6500);
            await all('50분');
        },
        22: async () => {   // 덧확인: A 예측·까닭 적기 / 같은 값일 때 글(C) / 한 번 잰 팀의 그래프 단추(D)
            setStage(2);
            const A = await live.student('A', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const full = async pg => (await W.text(pg)).split('\n').slice(3).join(' / ').slice(0, 900);
            await team('A', async () => { for (let i = 0; i < 9 && !(await has(A, '길어질 것 같아요')); i++) { await W.tap(A, '← 뒤로'); await A.waitForTimeout(400); }
                note('A 계획 화면으로 돌아옴', (await full(A)).slice(0, 500));
                await W.tap(A, '길어질 것 같아요'); const w = A.locator('textarea, input[type=text]').locator('visible=true').first(); await w.fill('물이 많으면 무거워서 늦게 열려요'); await w.blur(); await A.waitForTimeout(800);
                note('A 예측·까닭 넣은 뒤', await full(A)); await W.shot(A, 'A 예측 까닭', true); await A.waitForTimeout(2500); });
            await team('C', async () => { const t = (await btns(C)).find(x => /바꿔/.test(x)); await W.tap(C, t.slice(0, 10)); await C.waitForTimeout(500); await W.tap(C, '이 조건으로 →', 0, true); await C.waitForTimeout(600);
                note('C 값 화면에서 값을 안 바꾸고 [이 조건으로 →]', await full(C)); await W.shot(C, 'C 같은 값 안내', true); await W.tap(C, '← 뒤로'); await C.waitForTimeout(400); });
            await team('D', async () => { await W.tap(D, '그래프 보기'); await D.waitForTimeout(600); note('D(1번 잼)가 그래프 보기를 누름', await full(D)); await W.tap(D, '← 뒤로').catch(() => {}); await D.waitForTimeout(400); note('D 뒤로', (await full(D)).slice(0, 200)); });
        },
        3: async () => {   // 50~85분: 2차시 열림 · 퀴즈(action·mass) · 🔮 예측 · 발사('하나만 바꿔')
            setStage(2);
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const P = { A, B, C, D };
            const res = async pg => ({ 띠: await bandTxt(pg), 글: (await W.text(pg)).split('\n').slice(6).join(' / ').slice(0, 760), 단추: (await btns(pg)).slice(4) });
            const go = pg => pg.locator('button, a').filter({ hasText: /로 가기|끝내고 가요/ }).locator('visible=true');
            const EYE = /영상으로 재기|눈으로 보고 고르기/;
            const eye = async (pg, pick) => { await W.tap(pg, '눈으로 보고 고르기'); await pg.waitForTimeout(400); await W.tap(pg, pick); await pg.waitForTimeout(700); };
            const why = pg => pg.locator('textarea, input[type=text]').locator('visible=true');
            await A.waitForTimeout(1200); setStage(3); await lesson('t2', 0, 'action', false);
            note('2차시 열림 · D(1차시 한 값·1번)', { 띠: await bandTxt(D), 줄: (await W.text(D)).split('\n').filter(l => /선생님이|한 가지|하나만|바꿔|로 가기/.test(l)).slice(0, 6) }); await W.shot(D, 'D 2차시 열림 띠');
            note('2차시 열림 · C', (await W.text(C)).split('\n').filter(l => /선생님이|한 가지|하나만|로 가기/.test(l)).slice(0, 5));
            for (const [n, pg] of Object.entries(P)) await team(n, async () => { if (await go(pg).count()) { await go(pg).first().click(); await pg.waitForTimeout(700); } });
            note('D 띠 단추 누른 뒤', await res(D));
            for (const [n, pg, pick] of [['B', B, '공기가 로켓을 위로 빨아올려서'], ['A', A, '발포비타민이 가벼워서'], ['C', C, '물과 기체를 아래로 밀어내고']]) await team(n + ' action', async () => { await W.tap(pg, '다음 →'); await pg.waitForTimeout(400); await pickQ(pg, pick); });
            note('t2 0 물음(phone) · B 틀린 보기 고른 뒤', await res(B));
            await lesson('t2', 0, 'action', true);
            note('t2 0 풀이 뒤 · A(틀림)', await res(A)); await pickQ(A, '물과 기체를 아래로 밀어내고').catch(() => {}); await pickQ(B, '물과 기체를 아래로 밀어내고').catch(() => {});
            await team('D action(풀이 뒤)', async () => { await W.tap(D, '다음 →'); await D.waitForTimeout(400); await pickQ(D, '물과 기체를 아래로 밀어내고'); note('D 풀이 듣고 고름', (await res(D)).글.slice(0, 260)); });
            await lesson('t2', 1, 'mass', false, 3000);
            for (const [n, pg, pick] of [['A', A, '가속도가 작아져서 덜 높이'], ['B', B, '가속도가 커져서 더 높이'], ['C', C, '가속도가 작아져서 덜 높이'], ['D', D, '가속도가 작아져서 덜 높이']]) await team(n + ' mass', async () => { await W.tap(pg, '다음 →'); await pg.waitForTimeout(400); if (await has(pg, '설계 끝')) { await W.tap(pg, '설계 끝'); await pg.waitForTimeout(400); } await pickQ(pg, pick); });
            note('t2 1 물음(phone) · A 폰', await res(A));
            await lesson('t2', 1, 'mass', true); note('t2 1 풀이 뒤 · A', (await res(A)).글.slice(0, 420)); await pickQ(B, '가속도가 작아져서 덜 높이').catch(() => {});
            for (const i of [2, 3]) await lesson('t2', i, '', false, 1200);
            // 계획 + 🔮 예측
            const plan = async (n, pg, v, re, txt) => team(n + ' 계획', async () => { if (!(await has(pg, '몸체 무게 바꾸기'))) { await W.tap(pg, '다음 →'); await pg.waitForTimeout(400); } await W.tap(pg, v); await pg.waitForTimeout(500); if (n === 'A') { note('A 2차시 계획 화면(바꿀 것 고른 뒤)', await res(A)); await W.shot(A, 'A 2차시 예측', true); }
                const t = (await btns(pg)).find(x => re.test(x)); if (t) await W.tap(pg, t.slice(0, 8)); else note(n + ' 예측 단추', '못 찾음: ' + (await btns(pg)).join(' | ')); if (txt && await why(pg).count()) { await why(pg).first().fill(txt); await why(pg).first().blur(); } await pg.waitForTimeout(500); });
            await plan('A', A, '몸체 무게 바꾸기', /낮아|덜|줄어/, '무거우면 덜 빨라져서');
            await plan('B', B, '물의 양 바꾸기', /높아|더 /, '물이 많으면 더 세게 밀어서');
            await plan('C', C, '발포비타민 양 바꾸기', /높아|더 /, '');
            await plan('D', D, '몸체 무게 바꾸기', /낮아|덜|줄어/, '무거운 가방 메면 못 뛰니까');
            for (const i of [4, 5, 6]) await lesson('t2', i, '', false, 1000); await lesson(null, 0, '', false, 3000);
            for (const [n, pg] of Object.entries(P)) await team(n, () => W.stroll(pg, n, 12, 0, EYE, quiet));
            await team('A', async () => { await eye(A, '아이 키보다 높'); note('A 첫 발사(0개, 높다)', await res(A)); const t = (await btns(A)).find(x => /바꿔/.test(x)); await W.tap(A, t.slice(0, 10)); await A.waitForTimeout(500); await W.tap(A, '+'); await W.stroll(A, 'A', 8, 0, EYE, quiet); await eye(A, '아이 키와 비슷'); note('A 두 번째(1개, 비슷)', await res(A)); });
            await team('B', async () => { await eye(B, '아이 키보다 높'); const t = (await btns(B)).find(x => /바꿔/.test(x)); await W.tap(B, t.slice(0, 10)); await B.waitForTimeout(500); await W.tap(B, '−'); await W.stroll(B, 'B', 8, 0, EYE, quiet); await eye(B, '아이 키와 비슷'); if (await has(B, '그래프 보기')) { await W.tap(B, '그래프 보기'); await B.waitForTimeout(500); note('B 그래프', await res(B)); } });
            await team('C', async () => { await eye(C, '아이 키와 비슷'); note('C 첫 발에 목표(비슷) 결과 화면', await res(C)); await W.shot(C, 'C 첫 발 목표', true);
                if (await has(C, '그래프 보기')) { await W.tap(C, '그래프 보기'); await C.waitForTimeout(500); note('C(1번 쏨) 그래프를 누름', await res(C)); }
                const t = (await btns(C)).find(x => /바꿔/.test(x)); if (t) { await W.tap(C, t.slice(0, 10)); await C.waitForTimeout(500); await W.tap(C, '+'); await W.stroll(C, 'C', 8, 0, EYE, quiet); await eye(C, '아이 키보다 높'); note('C 두 번째(값 바꿈, 높다)', await res(C)); } });
            await team('D', async () => { await eye(D, '아이 키보다 낮'); note('D 첫 발사(0개, 낮다)', await res(D)); const t = (await btns(D)).find(x => /바꿔/.test(x)); await W.tap(D, t.slice(0, 10)); await D.waitForTimeout(500); await W.tap(D, '+'); await W.stroll(D, 'D', 8, 0, EYE, quiet); await eye(D, '아이 키보다 낮'); note('D 두 번째(1개, 낮다)', await res(D)); });
            await A.waitForTimeout(3000);
        },
        31: async () => {   // 85분~: 정리 열림 · 다시 풀기 · ✍️ 문장 화면 (살펴보기: A·C)
            setStage(3);
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const P = { A, B, C, D };
            const res = async pg => ({ 띠: await bandTxt(pg), 글: (await W.text(pg)).split('\n').slice(6).join(' / ').slice(0, 900), 단추: (await btns(pg)).slice(4) });
            const go = pg => pg.locator('button, a').filter({ hasText: /로 가기|끝내고 가요/ }).locator('visible=true');
            const inputs = pg => pg.evaluate(() => [...document.querySelectorAll('input, textarea, select')].filter(e => e.offsetParent).map(e => (e.tagName === 'SELECT' ? 'select:' + [...e.options].map(o => o.textContent).join('|') : (e.type || e.tagName) + ':' + (e.placeholder || '') + (e.maxLength > 0 ? ' (최대 ' + e.maxLength + '자)' : ''))));
            await A.waitForTimeout(1200); setStage(4); await lesson('end', 0, 'end-think', false);
            for (const [n, pg] of Object.entries(P)) await team(n, async () => { if (await go(pg).count()) { await go(pg).first().click(); await pg.waitForTimeout(700); } });
            const solve = async (pg, picks) => { await W.tap(pg, '다시 풀기 →'); await pg.waitForTimeout(400); for (const p of picks) { await W.tap(pg, p); await pg.waitForTimeout(500); if (p === picks[0] && pg === A) note('end 0 물음(phone) · A 다시 풀기 힘 고른 뒤', await res(A)); await W.tap(pg, '다음 →'); await pg.waitForTimeout(500); } };
            await team('A', () => solve(A, ['물체의 모양이나 움직임을 바꾸는 원인', '속도가 변하는 정도', '누르는 힘의 크기']));
            await team('B', () => solve(B, ['물체의 모양이나 움직임을 바꾸는 원인', '속도가 변하는 정도', '일정한 넓이에 작용하는 힘']));
            await team('C', () => solve(C, ['물체의 모양이나 움직임을 바꾸는 원인', '속도가 변하는 정도', '일정한 넓이에 작용하는 힘']));
            await team('D', () => solve(D, ['물체의 모양이나 움직임을 바꾸는 원인', '빠른 정도', '일정한 넓이에 작용하는 힘']));
            note('end 0 풀이 전 · A 지금 화면', await res(A));
            await lesson('end', 0, 'end-think', true);
            note('end 0 풀이 뒤 · A', await res(A));
            await lesson('end', 1, 'end-cause', false);
            for (const [n, pg] of Object.entries(P)) note('end 1 물음(phone: 문장) ' + n + ' 폰', { 화면: await res(pg), 입력칸: await inputs(pg) });
            await W.shot(A, 'A 정리 문장 화면 전', true);
        },
        32: async () => {   // ✍️ 우리 팀 정리 문장 화면 살펴보기(A·C·D 화면 글만 — 아직 안 적음)
            setStage(4);
            const A = await live.student('A', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const dump = async pg => ({ 띠: await bandTxt(pg), 글: (await W.text(pg)).split('\n').slice(6).join(' / ').slice(0, 1300), 단추: (await btns(pg)).slice(4), 입력칸: await pg.evaluate(() => [...document.querySelectorAll('input, textarea, select')].filter(e => e.offsetParent).map(e => (e.tagName === 'SELECT' ? 'select:' + [...e.options].map(o => o.textContent).join('|') : (e.type || e.tagName) + ':' + (e.placeholder || '') + (e.maxLength > 0 ? ' (최대 ' + e.maxLength + '자)' : '')))) });
            await lesson('end', 1, 'end-cause', false, 3000);
            for (const [n, pg] of [['A', A], ['C', C], ['D', D]]) await team(n, async () => { await W.tap(pg, '우리 팀 정리 문장'); await pg.waitForTimeout(700); note(n + ' ✍️ 문장 화면', await dump(pg)); });
            await W.shot(A, 'A 정리 문장 화면', true); note('A 화면 길이', (await W.check(A, 56)).pages);
        },
        33: async () => {   // ✍️ 문장 고르고 적기 → end 1 풀이 → 결과 카드 (95분)
            setStage(4);
            const A = await live.student('A', 'phone'), B = await live.student('B', 'phone'), C = await live.student('C', 'Pixel 7'), D = await live.student('D', 'phone');
            const txt = pg => pg.locator('input[type=text]').locator('visible=true');
            const full = async pg => (await W.text(pg)).split('\n').slice(6).join(' / ').slice(0, 1100);
            await lesson('end', 1, 'end-cause', false, 2500);
            await team('B', async () => { await W.tap(B, '우리 팀 정리 문장'); await B.waitForTimeout(600); });
            for (const pg of [A, B, C, D]) if (!(await has(pg, '우리 팀 정리 문장')) && !(await has(pg, '왜냐하면…'))) await W.tap(pg, '우리 팀 정리 문장').catch(() => {});
            await team('A', async () => { await W.tap(A, '길어졌어요'); await W.tap(A, '잘 모르겠어요', 0); await txt(A).nth(0).fill('물이 많아서 늦게 차서'); await txt(A).nth(0).blur(); await W.tap(A, '낮아졌어요'); await W.tap(A, '무거워서 덜 빨라져서'); await A.waitForTimeout(800); note('A 문장 고르고 적은 뒤', await full(A)); await W.shot(A, 'A 정리 문장 적음', true); });
            await team('B', async () => { await W.tap(B, '짧아졌어요'); await W.tap(B, '기체(거품)가 더 빨리 생겨서'); await W.tap(B, '높아졌어요'); await W.tap(B, '아래로 미는 힘이 세져서'); await B.waitForTimeout(600); });
            await team('C', async () => { await W.tap(C, '짧아졌어요'); await W.tap(C, '기체가 더 많이 생겨서'); await W.tap(C, '높아졌어요'); await C.waitForTimeout(600); });
            await team('D', async () => { await W.tap(D, '비슷했어요', 0); await D.waitForTimeout(400); note('D 1차시(한 값·1번)인데 결과를 고름', (await full(D)).slice(0, 420)); await W.tap(D, '비슷했어요', 1); await txt(D).nth(1).fill('점토 붙여도 똑같이 낮았어요'); await txt(D).nth(1).blur(); await D.waitForTimeout(600); });
            await lesson('end', 1, 'end-cause', true); note('end 1 풀이 뒤 · A', { 띠: await bandTxt(A), 글: (await full(A)).slice(0, 500) });
            await lesson('end', 2, '', false, 1500); await lesson(null, 0, '', false, 3000);
            await team('A 카드', async () => { await W.tap(A, '결과 카드 만들기'); await A.waitForTimeout(1500); note('A 결과 카드', (await full(A)).slice(0, 400)); await W.shot(A, 'A 결과 카드', true); });
            for (const pg of [B, C, D]) await team('카드', async () => { await W.tap(pg, '결과 카드 만들기'); await pg.waitForTimeout(1000); });
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
