// 합동 수업 4차 필름통 로켓(main 51bcdf2, 1회) — 학생(가족) 쪽 차례. 교사 세션 인물 A~E·짠 측정값.
//   VC_NPM=… node tools/virtual-class/student-live-rocket6.cjs <상태 폴더> <차례> <교사 묶음.json> > 결과.json
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { openLive } = require('./student-live.cjs');
const ID = 'cuqatmrtg2qcey3c2fu3pff2', SP = 'labClasses/' + ID, PAGE = 'projects/film-rocket.html?c=1-5295&s=' + ID;
const DEV = { A: 'phone', B: 'phone', C: 'Pixel 7', D: 'phone', E: 'phone' };
const NAME = { A: '별빛가족', B: '달님 탐험대', C: '할머니와 나', D: '티격태격', E: '번개팀' };
(async () => {
    const [dir, turnArg, bundleFile] = process.argv.slice(2), turn = +turnArg;
    const live = await openLive(dir), W = live.W, out = [];
    const note = (k, v) => { out.push([k, v]); };
    if (bundleFile) live.apply(JSON.parse(fs.readFileSync(bundleFile, 'utf8')));
    const doc = () => W.app.db.docs.get(SP);
    const OPEN = () => { const d = doc(); if (!Array.isArray(d.lessonOpen)) d.lessonOpen = []; return d.lessonOpen; };
    // 교사가 띄운 장을 수업 문서에 (교사 세션이 알려 준 순서대로)
    const lesson = async (stage, i, key, reveal, mode, w) => { const d = doc();
        d.lesson = { on: true, stage, i, key: key || '', reveal: !!reveal, mode: mode || (key && !reveal ? 'phone' : 'look'), at: new Date() };
        if (reveal && key && !OPEN().includes(key)) OPEN().push(key);
        await new Promise(r => setTimeout(r, w || 6000)); };
    const off = async w => { doc().lesson = Object.assign({}, doc().lesson, { on: false, at: new Date() }); await new Promise(r => setTimeout(r, w || 5000)); };
    const btns = async pg => (await W.buttons(pg)).filter(t => !/선생님 연결|메인 페이지/.test(t));
    const scr = async (pg, n) => ({ 글: (await W.text(pg)).split('\n').filter(l => !/선생님 연결 · 도움말/.test(l)).join(' / ').slice(0, n || 500), 단추: await btns(pg) });
    const has = async (pg, t) => (await pg.getByText(t).locator('visible=true').count()) > 0;
    const P = {};
    const open = async k => { P[k] = await live.student(k, DEV[k]); return P[k]; };
    const enter = async (k, name) => { const pg = P[k]; await pg.goto(W.ROOT + PAGE); await pg.waitForTimeout(1500); await pg.getByPlaceholder('예: 별빛 가족').locator('visible=true').first().fill(name || NAME[k]); await W.tap(pg, '시작하기'); await pg.waitForTimeout(1500); };
    const pick = async (k, re) => { const pg = P[k]; try { await W.tap(pg, re); await pg.waitForTimeout(600); } catch (e) { note(k + ' 고르기 실패', String(e.message).split('\n')[0]); } };
    const all = async tag => { for (const k of Object.keys(P)) note(tag + ' · ' + k, await scr(P[k], 300)); };
    const guard = async (n, f) => { try { await f(); } catch (e) { note(n + ' 막힘', String(e.message).split('\n')[0]); } };
    const T = {
        1: async () => {   // 0~15분 생각 열기
            for (const k of ['A', 'B', 'C', 'E']) await open(k);
            await guard('입장 A', () => enter('A'));
            await guard('입장 B', () => enter('B'));
            await guard('입장 C', () => enter('C'));
            await guard('입장 E(같은 이름 먼저 넣어 봄: 달님 탐험대)', async () => { await enter('E', '달님 탐험대'); note('E 같은 이름으로 넣은 뒤', await scr(P.E, 400)); await W.shot(P.E, 'E 같은 이름'); });   // 아빠는 경고 글을 안 읽고 폰을 내려놓음
            await P.A.waitForTimeout(3000);
            await all('think 0(look) 입장 뒤'); await W.shot(P.A, 'A think0');
            // E 아빠: 화면 안 읽고 보이는 것 다 눌러 봄
            await guard('E 이것저것', async () => { const b = await btns(P.E); note('E 누를 수 있는 것(look)', b); });
            await lesson('think', 1, 'force', false);
            note('force 물음 · A', await scr(P.A)); await W.shot(P.A, 'A force');
            await pick('B', '물체의 모양이나 움직임을 바꾸는 원인');   // 아빠가 먼저 답
            note('B 고른 뒤(풀이 전)', await scr(P.B)); await W.shot(P.B, 'B force 고른 뒤');
            await pick('B', '세게 움직이는 것'); note('B 아이가 "난 이거야" → 다른 보기 눌러 봄', await scr(P.B, 300));
            await pick('A', '세게 움직이는 것');
            await pick('C', '물체가 가지고 있는 것');
            
            await lesson('think', 1, 'force', true);
            for (const k of ['A', 'B', 'C', 'E']) note('force 풀이 뒤 · ' + k, await scr(P[k], 600));
            await W.shot(P.A, 'A force 풀이 뒤');
            await lesson('think', 2, 'accel', false, 6000); note('accel 물음 6초 뒤 · A 띠', (await W.text(P.A)).split('\n')[0]);
            await open('D'); await guard('입장 D(늦게)', () => enter('D')); await P.D.waitForTimeout(2500);
            note('accel 물음 · D 늦게 들어온 직후', await scr(P.D)); await W.shot(P.D, 'D 늦게 입장');
            note('accel 물음 · A', await scr(P.A));
            await guard('E 이름 다시', async () => { note('accel 물음 · E(아직 이름 화면, 아이가 "아빠 안 들어갔어" 알아챔)', await scr(P.E, 300)); await P.E.getByPlaceholder('예: 별빛 가족').locator('visible=true').first().fill('번개팀'); await W.tap(P.E, '시작하기'); await P.E.waitForTimeout(3000); note('E 번개팀으로 들어간 직후(accel 물음 중)', await scr(P.E)); });
            await pick('E', /움직인 거리/);
            await pick('A', /빠른 정도|빠르기/);
            await pick('B', '속도가 변하는 정도');
            await pick('C', /빠른 정도|빠르기/);
            await pick('D', /움직인 거리|거리/);
            await lesson('think', 2, 'accel', true);
            for (const k of ['A', 'D', 'E']) note('accel 풀이 뒤 · ' + k, await scr(P[k], 600));
            await lesson('think', 3, 'pressure', false);
            note('pressure 물음 · C', await scr(P.C));
            await pick('B', /누르는 힘/);
            await pick('A', /공기의 무게/);
            await pick('C', /누르는 힘/);
            await pick('E', '공기의 무게');
            note('pressure · D(아직 accel 답 안 한 채 넘어옴?)', await scr(P.D));
            await pick('D', /공기의 무게|무게/);
            await lesson('think', 3, 'pressure', true);
            for (const k of ['A', 'C', 'D']) note('pressure 풀이 뒤 · ' + k, await scr(P[k], 600));
            await lesson('think', 4, '', false);
            await all('think 4(look)'); await W.shot(P.C, 'C think4');
            note('점수', Object.fromEntries(await Promise.all(Object.keys(P).map(async k => [k, (await W.text(P[k])).match(/⭐ \d+점/)?.[0]]))));
        },

        2: async () => {   // 15~45분 1차시: gas → 펑 → 안전 → control → 계획 → 재는 법 → do-t1(측정) → 같은 조건 다른 시간 → 도전
            for (const k of 'ABCDE') await open(k);
            await P.A.waitForTimeout(3000);
            note('gas 물음 · E', await scr(P.E, 400));
            await pick('E', '물이 무거워져서');                 // 아빠가 먼저
            await pick('B', '이산화 탄소가 닫힌 통 안에 쌓여서');  // 아빠가 먼저(정답)
            await pick('A', '뚜껑이 차가워져서');               // 아이 "차가워서 쪼그라들어서!"
            await pick('C', '이산화 탄소가 닫힌 통 안에 쌓여서');
            note('gas 고른 뒤(풀이 전) · A', await scr(P.A, 500));
            await lesson('t1', 0, 'gas', true);
            for (const k of 'ACE') note('gas 풀이 뒤 · ' + k, await scr(P[k], 700));
            await pick('D', '이산화 탄소가 닫힌 통 안에 쌓여서');   // 남매 싸우다 늦게, 풀이 듣고 고름
            note('gas 풀이 뒤에 고름 · D', await scr(P.D, 700));
            await lesson('t1', 1, '', false, 4000); note('t1 1 펑(look) · A', await scr(P.A, 300));
            await lesson('t1', 1, '', true, 3000);
            await lesson('t1', 2, '', false, 3000); note('t1 2 안전(look) · B', await scr(P.B, 300));
            await lesson('t1', 3, 'control', false);
            note('control 물음 · C', await scr(P.C, 600));
            await pick('B', '무엇 때문에 결과가 달라졌는지 알려고');
            await pick('E', '실험을 빨리 끝내려고');
            await pick('A', '무엇 때문에 결과가 달라졌는지 알려고');
            await pick('C', '여러 가지를 한꺼번에 바꿔야 더 정확해서');
            await pick('D', '실험을 빨리 끝내려고');
            await lesson('t1', 3, 'control', true);
            note('control 풀이 뒤 · C(틀림)', await scr(P.C, 700));
            for (const i of [4, 5]) { await lesson('t1', i, '', false, 3000); }
            note('t1 4·5(look) · A', await scr(P.A, 300));
            await lesson('t1', 6, 'do-t1', false, 6000);
            for (const k of 'ABCDE') note('do-t1 첫 화면 · ' + k, await scr(P[k], 500));
            await W.shot(P.A, 'A do-t1 첫 화면');
            // 팀마다 측정 (동시에)
            const vis = (pg, re) => pg.locator('button').filter({ hasText: re }).locator('visible=true');
            const tapIf = async (pg, re) => { const b = vis(pg, re); if (await b.count() && await b.first().isEnabled()) { await b.first().click(); await pg.waitForTimeout(450); return true; } return false; };
            const res = async (pg, n) => (await W.text(pg)).split('\n').filter(l => !/선생님 연결 · 도움말|^(생각 열기|1차시|2차시|정리|🔒.*)$/.test(l)).slice(3).join(' / ').slice(0, n || 900);
            const QZ = { A: /^일정한 넓이|^무엇 때문에/, B: /^일정한 넓이|^무엇 때문에/, C: /^누르는 힘|^무엇 때문에/, D: /^공기의 무게|^무엇 때문에/, E: /^누르는 힘|^실험을 빨리|^무엇 때문에/ };
            const prep = async (k, o) => { const pg = P[k];   // 안전 → (퀴즈) → 바꿀 것·예측 → 값 → 초 예측 → 초시계
                for (let g = 0; g < 14; g++) {
                    const b = await btns(pg);
                    if (b.some(t => /⏱ 초시계로 재기/.test(t))) { await tapIf(pg, /초시계로 재기/); continue; }
                    if (b.some(t => /시작 \(뚜껑/.test(t))) return;
                    const box = pg.locator('input[type=checkbox]:not(:checked)').locator('visible=true'); if (await box.count()) { while (await box.count()) await box.first().click(); continue; }
                    const wrong = /❌ 아니에요/.test(await res(pg, 900)); const q = b.find(t => !/^\(꺼짐\)/.test(t) && (wrong ? /^일정한 넓이|^무엇 때문에/ : QZ[k]).test(t)); if (q) { await W.tap(pg, q.slice(0, 8)); await pg.waitForTimeout(500); note(k + ' 측정 전 퀴즈', await res(pg, 400)); continue; }
                    if (b.some(t => /바꾸기$/.test(t)) && !pg.vcVar) { pg.vcVar = 1; await W.tap(pg, o.v); if (o.pred) await W.tap(pg, o.pred); if (o.why) { const w = pg.locator('input[type=text], textarea').locator('visible=true'); await w.first().fill(o.why); await w.first().blur(); } note(k + ' 계획(바꿀 것·예측)', await res(pg, 700)); if (k === 'E') { const f = await vis(pg, /다음 →/).first().isEnabled(); note('E 예측 안 고르고 다음 누름 → 켜져 있나', f); if (!f) { await W.tap(pg, '짧아질 것 같아요'); } } await tapIf(pg, /다음 →/); continue; }
                    if (b.includes('이 조건으로 →')) { for (let i = 0; i < (o.plus || 0); i++) await W.tap(pg, '+'); for (let i = 0; i < (o.minus || 0); i++) await W.tap(pg, '−'); note(k + ' 값 화면', await res(pg, 500)); await tapIf(pg, /이 조건으로/); continue; }
                    if (b.some(t => /예측했어요/.test(t))) { for (let i = 0; i < (o.sec || 0); i++) await W.tap(pg, '+'); await tapIf(pg, /예측했어요/); continue; }
                    if (!(await tapIf(pg, /다음 →|이어서|재러 가기|측정하러/))) { note(k + ' 준비 중 멈춤', { 글: await res(pg, 500), 단추: b }); return; }
                } };
            const sw = async (k, sec) => { const pg = P[k]; await W.tap(pg, '시작 (뚜껑'); await pg.waitForTimeout(sec * 1000); await W.tap(pg, /펑/); await pg.waitForTimeout(400); await tapIf(pg, /이 시간으로 기록/); await pg.waitForTimeout(600); };
            const again = async (k, o) => { const pg = P[k]; const b = await btns(pg);   // 결과 화면 → 다음 측정까지
                const same = b.find(t => /같은 조건|한 번 더|또 재기/.test(t) && !/바꿔/.test(t));
                if (!o.change && same) { await W.tap(pg, same.slice(0, 10)); }
                else { const ch = b.find(t => /바꿔/.test(t)); if (!ch) { note(k + ' 바꾸는 단추 없음', b); return false; } await W.tap(pg, ch.slice(0, 10)); }
                pg.vcVar = 1; await prep(k, o.change ? { plus: o.plus, minus: o.minus } : {}); return true; };
            const run = async (k, plan) => { const pg = P[k]; await prep(k, plan.first);
                for (const [si, set] of plan.sets.entries()) for (const [ti, sec] of set.entries()) {
                    if (si > 0 && ti === 0) { if (!(await again(k, { change: true, plus: set.plus, minus: set.minus }))) return; }
                    else if (ti > 0) { if (!(await again(k, {}))) return; }
                    if (!(await btns(pg)).some(t => /시작 \(뚜껑/.test(t))) { note(k + ' 시작 단추 없음', { 글: await res(pg, 500), 단추: await btns(pg) }); return; }
                    await sw(k, sec);
                    note(k + ' ' + (si + 1) + '번째 값 ' + (ti + 1) + '회 뒤 결과', { 글: await res(pg, 1000), 단추: await btns(pg) });
                }
                if (plan.graph !== false && await tapIf(pg, /그래프 보기/)) { await pg.waitForTimeout(800); note(k + ' 그래프 화면', { 글: await res(pg, 1400), 단추: await btns(pg) }); await W.shot(pg, k + ' 1차시 그래프', true); }
                else note(k + ' 그래프 안 봄(단추 없음 또는 안 누르는 팀)', await btns(pg)); };
            const S = n => n - 0.4;   // 짠 값(초)만큼 실제로 기다림(누르는 시간 0.4초 빼기), 팀은 동시에
            const plans = {
                A: { first: { v: '물의 양 바꾸기', pred: '길어질 것 같아요', why: '물이 많으면 무거워서', sec: 1 }, sets: [[12, 15, 13], Object.assign([18, 21, 19], { plus: 2 })] },
                B: { first: { v: '물의 온도 바꾸기', pred: '짧아질 것 같아요', why: '따뜻하면 빨리 녹아서' }, sets: [[14, 16, 15], Object.assign([13, 15, 14], { plus: 1 }), Object.assign([9, 10, 9], { plus: 1 })] },
                C: { graph: false, first: { v: '발포비타민 양 바꾸기', pred: '짧아질 것 같아요' }, sets: [[15, 13, 16], Object.assign([8, 9, 8], { plus: 2 })] },
                D: { first: { v: '조각 크기 바꾸기', pred: '비슷할 것 같아요' }, sets: [[14, 15, 13]] },
                E: { graph: false, first: { v: '물의 온도 바꾸기' }, sets: [[15, 12, 16], Object.assign([17, 14, 18], { minus: 1 })] },
            };
            W.realSec = true;
            await Promise.all(Object.entries(plans).map(([k, pl]) => guard(k + ' 측정', () => run(k, { graph: pl.graph, first: pl.first, sets: pl.sets.map(s => Object.assign(s.map(S), { plus: s.plus, minus: s.minus })) }))));
            await W.shot(P.B, 'B 1차시 결과', true); await W.shot(P.C, 'C 1차시 결과', true);
            // D: 한 값만 재고 정리로 가려 함
            await guard('D 정리로', async () => { const t = P.D.locator('button, a').filter({ hasText: /정리/ }).locator('visible=true'); note('D 정리 탭 누르기 전 단추', await btns(P.D)); if (await t.count()) { await t.first().click({ force: true }); await P.D.waitForTimeout(600); } note('D 정리 탭 누른 뒤', { 글: await res(P.D, 700), 단추: await btns(P.D) }); await W.shot(P.D, 'D 정리 누름', true); });
            await guard('D 가루로', async () => { if (await tapIf(P.D, /← 뒤로|돌아가기/)) await P.D.waitForTimeout(300);
                const ch = (await btns(P.D)).find(t => /바꿔/.test(t)); note('D 다시 본 결과 화면 단추', await btns(P.D)); if (!ch) return;
                await W.tap(P.D, ch.slice(0, 10)); P.D.vcVar = 1; await prep('D', { plus: 3 });
                for (const [i, sec] of [7, 8, 7].entries()) { if (i) await again('D', {}); await sw('D', S(sec)); }
                note('D 가루 3회 뒤 결과', { 글: await res(P.D, 1000), 단추: await btns(P.D) }); });
            note('측정 중 교사 물음 "지금 뭘 알아보는 거예요?" (아이 답 — 연기)', { A: '물을 많이 넣으면 늦게 펑 하는지요!', B: '(아빠가) 온도요 / 아이: 따뜻한 물이 더 빠른지', C: '(중2, 작게) 비타민 많이 넣으면… 빨리 열리는 거', D: '누나: 몰라, 그냥 재는 거 / 동생: 조각이요?', E: '(아빠) 온도 차이요. 아이는 대답 안 함' });
            await lesson('t1', 7, '', false, 4000); for (const k of 'ABCDE') note('t1 7 같은 조건 다른 시간(look) · ' + k, await scr(P[k], 400));
            await lesson('t1', 7, '', true, 3000);
            await lesson('t1', 8, '', false, 4000); for (const k of 'ABCDE') note('t1 8 도전(look) · ' + k, await scr(P[k], 400));
            note('점수', Object.fromEntries(await Promise.all(Object.keys(P).map(async k => [k, (await W.text(P[k])).match(/⭐ \d+점/)?.[0]]))));
        },

        3: async () => {   // 45~75분 2차시: action → mass → 안전·계획·찍는 법 → do-t2(발사, 영상 세 곳) → 6 → 7 도전
            for (const k of 'ABCDE') await open(k);
            await P.A.waitForTimeout(3000);
            const vis = (pg, re) => pg.locator('button').filter({ hasText: re }).locator('visible=true');
            const tapIf = async (pg, re) => { const b = vis(pg, re); if (await b.count() && await b.first().isEnabled()) { await b.first().click(); await pg.waitForTimeout(450); return true; } return false; };
            const res = async (pg, n) => (await W.text(pg)).split('\n').filter(l => !/선생님 연결 · 도움말|^(생각 열기|1차시|2차시|정리|🔒.*)$/.test(l)).slice(3).join(' / ').replace(/✅ 선생님께 보냄 \/ |⏳ 보내는 중 \/ /g, '').slice(0, n || 900);
            note('action 물음 · B', await scr(P.B, 500));
            await pick('B', '물과 기체를 아래로');   // 아빠 먼저
            await pick('E', '공기가 로켓을 위로');   // 아빠 먼저, 첫 보기
            await pick('A', '발포비타민이 가벼워서');
            await pick('C', '공기가 로켓을 위로');
            await lesson('t2', 0, 'action', true);
            note('action 풀이 뒤 · A(틀림)', await res(P.A, 600));
            await pick('D', '물과 기체를 아래로');   // 풀이 듣고
            for (const k of 'ACE') if (/❌/.test(await res(P[k], 900))) await pick(k, '물과 기체를 아래로');   // 다시 골라 5점
            await lesson('t2', 1, 'mass', false);
            await pick('B', '가속도가 커져서 더 높이');   // 아빠가 또 먼저 — 이번엔 틀림
            note('mass 고른 뒤 · B 아빠 틀림(풀이 전)', await res(P.B, 500));
            await pick('A', '가속도가 작아져서');
            await pick('C', '가속도가 작아져서');
            await pick('D', '아무 차이가 없어요');
            await pick('E', '가속도가 작아져서');
            await lesson('t2', 1, 'mass', true);
            note('mass 풀이 뒤 · B', await res(P.B, 700)); note('mass 풀이 뒤 · D', await res(P.D, 700));
            for (const k of 'BD') if (/❌/.test(await res(P[k], 900))) await pick(k, '가속도가 작아져서');
            for (const i of [2, 3, 4]) await lesson('t2', i, '', false, 2500);
            note('t2 2~4(look) · C', await scr(P.C, 300));
            await lesson('t2', 5, 'do-t2', false, 6000);
            for (const k of 'ABCDE') note('do-t2 첫 화면 · ' + k, await res(P[k], 500));
            const OK = /^물과 기체|^가속도가 작아/;
            const prep = async (k, o) => { const pg = P[k];
                for (let g = 0; g < 16; g++) {
                    const b = await btns(pg), txt = await res(pg, 1200);
                    if (b.includes('● 녹화 시작')) return;
                    if (b.some(t => /^🎥 영상으로 재기/.test(t))) { await W.tap(pg, '영상으로 재기'); await pg.waitForTimeout(1200); continue; }
                    const box = pg.locator('input[type=checkbox]:not(:checked)').locator('visible=true'); if (await box.count()) { while (await box.count()) await box.first().click(); continue; }
                    if (/정의 퀴즈/.test(txt)) { const q = b.find(t => !/^\(꺼짐\)/.test(t) && OK.test(t)); if (q) { await W.tap(pg, q.slice(0, 8)); note(k + ' 2차시 측정 전 퀴즈', txt.slice(0, 300)); continue; } }
                    if (b.includes('설계 끝 →')) { note(k + ' 설계 기록 화면(그대로 둠)', txt.slice(0, 400)); await W.tap(pg, '설계 끝'); continue; }
                    if (b.some(t => /바꾸기$/.test(t)) && !pg.vcVar2) { pg.vcVar2 = 1; await W.tap(pg, o.v); await pg.waitForTimeout(400); if (o.pred) await W.tap(pg, o.pred); else { const f = (await btns(pg)).find(t => /것 같아요$/.test(t)); if (f && !(await vis(pg, /다음 →/).first().isEnabled())) await W.tap(pg, f); }
                        if (o.why) { const w = pg.locator('input[type=text], textarea').locator('visible=true'); await w.first().fill(o.why); await w.first().blur(); }
                        note(k + ' 2차시 계획', await res(pg, 800)); await tapIf(pg, /다음 →/); continue; }
                    if (b.includes('이 조건으로 →')) { for (let i = 0; i < (o.plus || 0); i++) await W.tap(pg, '+'); note(k + ' 2차시 값 화면', await res(pg, 500)); await tapIf(pg, /이 조건으로/); continue; }
                    if (!(await tapIf(pg, /다음 →|이어서|측정하러/))) { note(k + ' 2차시 준비 중 멈춤', { 글: txt.slice(0, 600), 단추: b }); return; }
                } };
            const launch = async (k, pct) => { const pg = P[k];
                await W.tap(pg, '녹화 시작'); await pg.waitForTimeout(1600); await W.tap(pg, '녹화 끝'); await pg.waitForTimeout(1500);
                await W.tap(pg, '이 장면이 가장 높아요'); await pg.waitForTimeout(600);
                const c = pg.locator('canvas').locator('visible=true').first(); const bb = await c.boundingBox();
                const foot = bb.height * 0.92, head = bb.height * 0.42, top = foot - (foot - head) * pct / 100;   // 아이 키 = 발끝~정수리, 로켓 꼭대기 = 짠 %
                for (const y of [foot, head, top]) { await c.click({ position: { x: bb.width * 0.5, y } }); await pg.waitForTimeout(450); }
                await pg.waitForTimeout(500); await tapIf(pg, /기록|이 높이로/); await pg.waitForTimeout(700); };
            const again = async (k, o) => { const pg = P[k]; const b = await btns(pg);
                const same = b.find(t => /같은 조건|한 번 더/.test(t) && !/바꿔/.test(t));
                if (!o.change && !same) { note(k + ' 같은 조건으로 다시 쏘는 단추 없음 — 이 값은 여기까지', b); return 'skip'; }
                if (!o.change && same) await W.tap(pg, same.slice(0, 10));
                else { const ch = b.find(t => /바꿔/.test(t)); if (!ch) { note(k + ' 바꾸는 단추 없음', b); return false; } await W.tap(pg, ch.slice(0, 10)); }
                await prep(k, o.change ? { plus: o.plus } : {}); return true; };
            const run = async (k, pl) => { const pg = P[k]; await prep(k, pl.first);
                for (const [si, set] of pl.sets.entries()) for (const [ti, pct] of set.entries()) {
                    if (si > 0 && ti === 0) { if (!(await again(k, { change: true, plus: set.plus }))) return; }
                    else if (ti > 0) { if (pg.vcSkip === si) continue; const r = await again(k, {}); if (r === 'skip') { pg.vcSkip = si; continue; } if (!r) return; }
                    if (!(await btns(pg)).includes('● 녹화 시작')) { note(k + ' 녹화 단추 없음', { 글: await res(pg, 600), 단추: await btns(pg) }); return; }
                    await launch(k, pct);
                    note(k + ' 2차시 ' + (si + 1) + '번째 값 ' + (ti + 1) + '발 뒤 결과', { 글: await res(pg, 1000), 단추: await btns(pg) });
                    if (si === 0 && ti === 0) await W.shot(pg, k + ' 2차시 첫 발 결과', true);
                }
                if (pl.graph && await tapIf(pg, /그래프 보기/)) { await pg.waitForTimeout(800); note(k + ' 2차시 그래프 화면', { 글: await res(pg, 1400), 단추: await btns(pg) }); await W.shot(pg, k + ' 2차시 그래프', true);
                    if (pl.more) { await tapIf(pg, /더 재기/); await pg.waitForTimeout(600); note(k + ' ➕ 더 재기 누른 뒤', { 글: await res(pg, 900), 단추: await btns(pg) });
                        for (const pct of pl.more) { await prep(k, {}); if (!(await btns(pg)).includes('● 녹화 시작')) { note(k + ' 더 재기: 녹화까지 못 감', { 글: await res(pg, 700), 단추: await btns(pg) }); break; } await launch(k, pct); note(k + ' 더 재기 뒤 결과', { 글: await res(pg, 900), 단추: await btns(pg) }); const r = (await btns(pg)).find(t => /더 재기|같은 조건|한 번 더/.test(t)); if (r) await W.tap(pg, r.slice(0, 8)); else if (await tapIf(pg, /그래프 보기/)) await tapIf(pg, /더 재기/); }
                        if (await tapIf(pg, /그래프 보기/)) { await pg.waitForTimeout(800); } note(k + ' 더 잰 뒤 그래프', { 글: await res(pg, 1400), 단추: await btns(pg) }); await W.shot(pg, k + ' 2차시 더 잰 그래프', true); } }
                else note(k + ' 2차시 그래프 안 봄', await btns(pg)); };
            const plans = {
                A: { graph: true, first: { v: '몸체 무게 바꾸기', pred: '낮아질 것 같아요', why: '무거우면 덜 빨라져서' }, sets: [[80, 85, 78], Object.assign([55, 60, 52], { plus: 2 })] },
                B: { graph: true, first: { v: '물의 양 바꾸기', pred: '높아질 것 같아요', why: '물이 많으면 세게 나가서' }, sets: [[70, 82, 75], Object.assign([90, 98, 94], { plus: 2 })] },
                C: { graph: true, first: { v: '발포비타민 양 바꾸기', pred: '높아질 것 같아요' }, sets: [[60, 65, 58], Object.assign([90, 95, 88], { plus: 2 })] },
                D: { graph: true, first: { v: '몸체 무게 바꾸기', pred: '비슷할 것 같아요', why: '점토는 가벼우니까' }, sets: [[72, 80, 76], Object.assign([70, 78, 74], { plus: 2 })], more: [78, 74] },
                E: { graph: false, first: { v: '몸체 무게 바꾸기' }, sets: [[85, 70, 90], Object.assign([75, 88, 80], { plus: 1 })] },
            };
            await Promise.all(Object.entries(plans).map(([k, pl]) => guard(k + ' 2차시 측정', () => run(k, pl))));
            note('측정 중 교사 물음 "지금 뭘 알아보는 거예요?" (연기)', { A: '아이: 무거우면 덜 올라가는지요! (엄마 "아까는 물이었지?" 아이 "이번엔 무게!")', B: '아빠: 물을 늘리면 높이요 / 아이: 아빠가 정했어요', C: '아이: 비타민 많이 넣으면 높이 가는지 (할머니 "아까랑 같은 거네")', D: '누나: 점토 붙이면 낮아지는지, 근데 별로 안 달라요 / 동생: 똑같애!', E: '아빠: 무게요. 아이: (처음으로) 근데 아빠 세 번 다 달라' });
            await lesson('t2', 6, '', false, 4000); for (const k of 'ABCDE') note('t2 6 왜 % 로(look) · ' + k, await scr(P[k], 300));
            await lesson('t2', 6, '', true, 3000);
            await lesson('t2', 7, '', false, 5000); for (const k of 'ABCDE') note('t2 7 도전(look) · ' + k, { 글: await res(P[k], 400), 단추: await btns(P[k]) });
            note('점수', Object.fromEntries(await Promise.all(Object.keys(P).map(async k => [k, (await W.text(P[k])).match(/⭐ \d+점/)?.[0]]))));
        },
        23: async () => {   // 도전 장 동안: E 아이·C 아이가 폰을 받아 그래프를 눌러 봄, D 도 그래프
            for (const k of 'CDE') await open(k);
            await P.C.waitForTimeout(2500);
            for (const k of 'CDE') await guard(k + ' 그래프', async () => { const pg = P[k]; note(k + ' 지금 화면', await scr(pg, 300)); const b = pg.locator('button').filter({ hasText: /그래프 보기/ }).locator('visible=true'); if (await b.count()) { await b.first().click(); await pg.waitForTimeout(800); } note(k + ' 그래프 화면', await scr(pg, 1300)); await W.shot(pg, k + ' 그래프', true); });
        },
        39: async () => {   // 살펴보기(복사본): A 가 2차시 측정 화면까지
            const A = await open('A'); await A.waitForTimeout(3000);
            note('action · A', await scr(A, 600)); const b0 = (await btns(A))[2]; if (b0) await pick('A', b0.slice(0, 8));
            await lesson('t2', 0, 'action', true, 3000); await lesson('t2', 1, 'mass', false); note('mass · A', await scr(A, 600)); const b1 = (await btns(A))[0]; if (b1) await pick('A', b1.slice(0, 8));
            await lesson('t2', 1, 'mass', true, 3000); await lesson('t2', 5, 'do-t2', false);
            let last = '';
            for (let i = 0; i < 25; i++) { const s = await scr(A, 1000); const t = JSON.stringify(s); if (t !== last) { note('do-t2 ' + i, s); await W.shot(A, 'y' + i); } last = t;
                const b = s.단추;
                if (b.some(t => /눈으로 보고 고르기/.test(t))) { note('측정 방법 화면', s); break; }
                const box = A.locator('input[type=checkbox]:not(:checked)').locator('visible=true'); if (await box.count()) { while (await box.count()) await box.first().click(); continue; }
                if (/정의 퀴즈/.test(s.글) && b.some(t => !/꺼짐/.test(t) && /^물과 기체|^가속도가 작아/.test(t))) { await W.tap(A, b.find(t => /^물과 기체|^가속도가 작아/.test(t)).slice(0, 8)); continue; }
                if (b.some(t => /바꾸기$/.test(t)) && !A.vcV) { A.vcV = 1; await W.tap(A, b.find(t => /무게 바꾸기/.test(t)) || b.find(t => /바꾸기$/.test(t))); await A.waitForTimeout(400); const p = (await btns(A)).find(t => /낮아|덜/.test(t)); if (p) await W.tap(A, p.slice(0, 8)); continue; }
                const f = b.find(t => !/^\(꺼짐\)/.test(t) && /→|다음|시작|이 조건|했어요|끝/.test(t) && !/뒤로/.test(t)); if (f) { await W.tap(A, f.slice(0, 10)); continue; }
                note('멈춤', s); break; }
        },
        38: async () => {   // 살펴보기(복사본): A 영상으로 재기 흐름
            const A = await open('A'); await A.waitForTimeout(2500);
            note('지금', await scr(A, 500));
            await W.tap(A, '영상으로 재기'); await A.waitForTimeout(1500); note('영상 1', await scr(A, 800)); await W.shot(A, 'v1');
            let last = '';
            for (let i = 0; i < 12; i++) { const s = await scr(A, 900); const t = JSON.stringify(s); if (t !== last) { note('영상 ' + (i + 2), s); await W.shot(A, 'v' + (i + 2)); } last = t;
                const f = s.단추.find(t => !/^\(꺼짐\)/.test(t) && /녹화 시작|시작|멈추|그만|끝|다음|이 장면|고르기|→/.test(t) && !/뒤로|눈으로/.test(t));
                if (!f) break; await W.tap(A, f.slice(0, 8)); await A.waitForTimeout(f.includes('시작') ? 3500 : 1000); }
            note('화면 요소', await A.evaluate(() => [...document.querySelectorAll('canvas, video, img')].filter(e => e.offsetParent).map(e => e.tagName + '#' + e.id + '.' + e.className + ' ' + JSON.stringify(e.getBoundingClientRect()))));
        },
        9: async () => {   // 살펴보기(상태 복사본에서만): A 가 gas → do-t1 측정 화면까지
            const A = await open('A');
            await A.waitForTimeout(3000); note('gas 물음 · A', await scr(A));
            await pick('A', /이산화/); await lesson('t1', 0, 'gas', true); note('gas 풀이 뒤 · A', await scr(A));
            await lesson('t1', 1, '', false, 3000); note('t1 1 · A', await scr(A));
            await lesson('t1', 3, 'control', false); note('control 물음 · A', await scr(A));
            const b = (await btns(A))[0]; if (b) await pick('A', b.slice(0, 10)); note('control 고른 뒤 · A', await scr(A));
            await lesson('t1', 3, 'control', true); await lesson('t1', 6, 'do-t1', false, 6000);
            for (let i = 0; i < 30; i++) { const s = await scr(A, 900); note('do-t1 ' + i, s); await W.shot(A, 'x' + i);
                if (s.단추.some(t => /초시계로 재기|시작 \(뚜껑/.test(t))) break;
                if (/정의 퀴즈/.test(s.글) && s.단추.some(t => /^일정한 넓이|^무엇 때문에|^이산화/.test(t))) { await W.tap(A, s.단추.find(t => /^일정한 넓이|^무엇 때문에|^이산화/.test(t)).slice(0, 8)); await A.waitForTimeout(500); note('퀴즈 고른 뒤', await scr(A, 700)); continue; }
                if (s.단추.includes('물의 양 바꾸기')) { await W.tap(A, '물의 양 바꾸기'); continue; }
                if (s.단추.some(t => /길어질 것 같아요/.test(t)) && !A.vcPred && (A.vcPred = 1)) { await W.tap(A, '길어질 것 같아요'); continue; }
                const f = s.단추.find(t => !/^\(꺼짐\)/.test(t) && /→|다음|시작|확인|했어요/.test(t) && !/뒤로/.test(t));
                if (s.단추.some(t => /초시계|시작/.test(t))) break;
                if (f) { await W.tap(A, f.slice(0, 10)); continue; }
                const box = A.locator('input[type=checkbox]:not(:checked)').locator('visible=true'); if (await box.count()) { while (await box.count()) await box.first().click(); continue; }
                break; }
        },
    };
    try { await T[turn](); } catch (e) { note('스크립트 오류', String(e.stack).slice(0, 400)); }
    note('페이지 오류', W.errors); note('알림 창', W.dialogs);
    const b = await live.close(turn, '학생 차례 ' + turn);
    fs.writeFileSync(path.join(dir, 'out-' + turn + '.json'), JSON.stringify(b));
    console.log(JSON.stringify(out, null, 1));
})();
