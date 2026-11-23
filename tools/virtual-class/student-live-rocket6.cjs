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
    };
    try { await T[turn](); } catch (e) { note('스크립트 오류', String(e.stack).slice(0, 400)); }
    note('페이지 오류', W.errors); note('알림 창', W.dialogs);
    const b = await live.close(turn, '학생 차례 ' + turn);
    fs.writeFileSync(path.join(dir, 'out-' + turn + '.json'), JSON.stringify(b));
    console.log(JSON.stringify(out, null, 1));
})();
