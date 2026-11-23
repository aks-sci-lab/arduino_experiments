// 가상 수업(교사 역할) ① 발포비타민 필름통 로켓 (가족 행사, 팀 이름으로 입장)
//   node tools/virtual-class/teacher-rocket.cjs [그림 폴더]
// 교사 화면은 사람이 하듯 보이는 단추를 눌러 가고, 가족(팀 폰)은 미리 짠 움직임으로 채운다:
//   A 별빛가족(빨리 끝냄) · B 달님 탐험대(같은 이름을 먼저 넣음, 느림) · C 로켓왕(와이파이 끊김) · D 늦은 번개팀(늦게 옴) · E(QR 없이 수업 코드로)
// 장면마다 화면을 찍고 '본 것'을 JSON 으로 찍어 낸다. 수업 기록: docs/virtual-class/teacher/film-rocket.md
'use strict';
const fs = require('node:fs'), path = require('node:path');
const VC = require('./teacher-lib.cjs');

(async () => {
    const S = await VC.start({ shots: process.argv[2] || path.join(process.cwd(), 'vc-shots', 'rocket') });
    const seen = {}; const note = (k, v) => { seen[k] = v; console.log('── ' + k + '\n' + (typeof v === 'string' ? v : JSON.stringify(v, null, 1))); };
    try {
        // ───────── 수업 전: 메인 → 교사 → 수업 진행 화면 → 로그인 → 새 수업 ─────────
        const T = await S.teacher({ width: 1280, height: 720 });
        await T.goto(S.ROOT + 'index.html'); await T.waitForTimeout(600); await S.shot(T, '메인');
        await S.tap(T, '교사'); await S.shot(T, '교사메인');
        await S.tap(T, '수업 진행 화면'); await S.tap(T, '구글 계정으로 로그인'); await T.waitForTimeout(600); await S.shot(T, '내수업-빈');
        await S.tap(T, '새 수업 만들기');
        await T.selectOption('#inExp', { label: '🚀 발포비타민 필름통 로켓 (가족 행사)' }); await T.fill('#inTeams', '10'); await S.shot(T, '수업만들기-로켓', true);
        await S.tap(T, '수업 만들기', 'last'); await T.waitForTimeout(600);
        const link = await T.getAttribute('#outLink', 'href'); const famUrl = S.local(link);
        await S.shot(T, '큰QR-1280x720');
        note('큰 QR 화면(1280×720)에서 스크롤 없이 보이는가', await T.evaluate(() => { const v = id => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return Math.round(r.bottom) + ' / ' + innerHeight + (r.bottom <= innerHeight ? ' 보임' : ' 화면 아래'); }; return { QR: v('qr'), 수업코드: v('outCode'), 다음단추: v('btnToRun') }; }));
        await S.tap(T, '진행 보기'); await T.evaluate(() => scrollTo(0, 0)); await S.shot(T, '진행-빈');

        // ───────── 가족(팀 폰) 움직임 ─────────
        const F = {};
        F.screen = pg => pg.getAttribute('#ev-app', 'data-screen');
        F.go = (pg, id) => pg.waitForSelector('[data-screen="' + id + '"]', { timeout: 8000 });
        F.next = async pg => { await pg.locator('.ev-screen .ev-next:not([disabled])[data-go]').last().click(); await pg.waitForTimeout(250); };
        F.quiz = async (pg, wrongFirst) => { if (wrongFirst) await pg.click('.ev-choice:not(.wrong):not([data-k="ok"]) >> nth=0'); await pg.click('.ev-choice[data-k="ok"]'); await pg.waitForSelector('.ev-ok'); await F.next(pg); };
        F.enter = async (name, team) => { const pg = await S.phone(name); await pg.goto(famUrl); await F.go(pg, 'enter'); await pg.waitForFunction(() => !/연결하는 중/.test(document.getElementById('ev-enter-msg').textContent)); await pg.fill('#ev-name', team); await pg.click('#ev-start'); await pg.waitForTimeout(900); return pg; };
        F.safe = async pg => { await F.go(pg, 't1-safe'); for (const k of ['goggle', 'face', 'away', 'wait']) await pg.check('[data-safe="' + k + '"]'); await F.next(pg); };
        F.stopwatch = async (pg, ms) => { await pg.click('#ev-m-sw'); await pg.click('#ev-sw1'); await pg.waitForTimeout(ms); await pg.click('#ev-sw2'); await pg.click('#ev-sw3'); await pg.waitForTimeout(300); };
        F.tab = async (pg, name) => { await pg.locator('.ev-stage', { hasText: name }).first().click(); await pg.waitForTimeout(400); };
        // 지금 화면에서 target 화면까지 '다음'으로 (고르기·퀴즈·안전 확인은 알아서)
        F.walk = async (pg, target, varKey) => { for (let i = 0; i < 16; i++) { const s = await F.screen(pg); if (s === target) return true;
            if (s === 'locked') { await pg.locator('.ev-screen button').first().click(); await pg.waitForTimeout(300); continue; }
            if (s === 't1-safe') { await F.safe(pg); continue; }
            if (/^q-/.test(s)) { if (await pg.locator('.ev-choice[data-k="ok"]:not([disabled])').count()) await F.quiz(pg, false); else await F.next(pg); continue; }
            if (/^think-(force|accel|pressure)$/.test(s) || s === 't1-var' || s === 't1-why') { const c = pg.locator('.ev-choice:not([disabled])'); if (await c.count()) { if (s === 't1-var') await pg.click('.ev-choice[data-k="' + (varKey || 'water') + '"]'); else await c.first().click(); await pg.waitForTimeout(250); } }
            await F.next(pg); } return false; };
        const screens = async () => { const o = {}; for (const k of ['A', 'B', 'C', 'D']) if (S.pages[k]) o[k] = await F.screen(S.pages[k]); return o; };
        const board = async () => { await T.waitForTimeout(2500); const m = (await S.seen(T)).match(/팀\t[\s\S]*?(?=🧪)/); return m ? m[0] : '(결과판 없음)'; };

        // ───────── 0~10분: 입장 · 생각 열기 ─────────
        const A = await F.enter('A', '별빛가족');
        const B = await F.enter('B', '별빛가족');
        note('같은 팀 이름을 넣은 가족에게 보이는 글', await B.evaluate(() => document.getElementById('ev-enter-msg').innerText));
        await B.fill('#ev-name', '달님 탐험대'); await B.click('#ev-start'); await B.waitForTimeout(900);
        const C = await F.enter('C', '로켓왕');
        await F.walk(A, 'locked'); await S.shot(A, '가족A-생각열기끝-잠김');
        note('생각 열기를 끝낸 팀 화면', (await S.seen(A)).split('\n').slice(7).join(' / '));
        await F.next(B); await F.go(B, 'think-force');
        note('교사 결과판: 끝내고 기다리는 팀(별빛)과 하는 중인 팀이 구별되는가', await board());
        await S.shot(T, '진행-3팀');

        // 🎬 발표 보기: 리모컨 → 를 누르면
        await S.tap(T, '발표 보기'); await T.waitForTimeout(1200); await S.shot(T, '발표-생각열기');
        await T.keyboard.press('ArrowRight'); await T.waitForTimeout(600);
        note('발표 보기에서 → 한 번(로켓)', (await S.seen(T)).split('\n').filter(l => /열까요|Enter|Esc/.test(l)).join(' / ') || '(다음 화면으로 넘어감)');
        await T.keyboard.press('Escape'); await S.tap(T, '진행 화면으로');

        // ───────── 10분: 1차시 열기 (하는 중이던 팀도 옮겨지는가) ─────────
        const b1 = await screens(); await S.tap(T, '다음 단계 열기'); await T.waitForTimeout(4000);
        note('1차시를 열기 전 → 뒤 가족 화면', { 전: b1, 뒤: await screens() });

        // A: 1차시 측정 화면까지 가서 🎥 녹화를 시작한 순간, 교사가 다음 단계(2차시)를 엶
        await F.walk(A, 't1-measure');
        await A.click('#ev-m-rec'); await A.waitForFunction(() => { const c = document.getElementById('ev-cam'); return c && c.width > 0; }, null, { timeout: 15000 });
        await A.click('#ev-r1'); await A.waitForTimeout(300); await A.click('#ev-r2'); await A.waitForTimeout(1200); await S.shot(A, '가족A-녹화중');
        await S.tap(T, '다음 단계 열기'); await T.waitForTimeout(4000);
        note('가족이 녹화하는 중에 다음 단계를 열면', { 화면: await F.screen(A), 저장된측정: await A.evaluate(() => window.__filmRocket.state().t1.trials.length) });
        await S.shot(A, '가족A-녹화중에옮겨짐');
        // 잘못 열었다고 되돌리면
        await S.tap(T, '하나 되돌리기'); await T.waitForTimeout(4000);
        note('하나 되돌린 뒤 가족 A 화면', (await S.seen(A)).split('\n').slice(7, 12).join(' / '));
        await S.shot(A, '가족A-되돌린뒤');
        await S.tap(T, '다음 단계 열기'); await T.waitForTimeout(4000);   // 다시 엶 (수업은 2차시까지 연 채로 이어감)

        // ───────── 1차시: A 끝까지, B 한 번, C 와이파이 끊김, D 늦게 ─────────
        await F.tab(A, '1차시'); await F.walk(A, 't1-measure');
        for (let i = 0; i < 3; i++) { await F.stopwatch(A, 900 + i * 200); await F.go(A, 't1-result'); if (i < 2) { await A.click('[data-go="t1-predict"]'); await F.go(A, 't1-predict'); await F.next(A); await F.go(A, 't1-measure'); } }
        await A.click('[data-go="t1-cond"]'); await F.go(A, 't1-cond'); await A.click('.ev-stepper:not(.locked) [data-pm="1"]'); await F.next(A); await F.go(A, 't1-predict'); await F.next(A); await F.go(A, 't1-measure'); await F.stopwatch(A, 1800); await F.go(A, 't1-result');
        await A.click('[data-go="t1-graph"]'); await F.go(A, 't1-graph'); await S.shot(A, '가족A-그래프');
        await F.next(A); await F.go(A, 't1-why'); await A.click('.ev-choice[data-k="lid"]'); await A.waitForSelector('.ev-def'); await F.next(A); await F.go(A, 'q-gas'); await F.quiz(A, false); await F.go(A, 't1-challenge');
        await A.click('.ev-screen [data-go="t1-ch-cond"]'); await F.go(A, 't1-ch-cond'); await F.next(A); await F.go(A, 't1-ch-predict'); await F.next(A); await F.go(A, 't1-ch-measure'); await F.stopwatch(A, 1400); await F.go(A, 't1-ch-result');
        note('도전 결과 글(가족 A)', (await S.seen(A)).split('\n').slice(7, 11).join(' / '));
        await F.tab(B, '1차시'); await F.walk(B, 't1-measure', 'temp'); await F.stopwatch(B, 2500); await F.go(B, 't1-result');
        S.net.C = true; await F.tab(C, '1차시'); await F.walk(C, 't1-var'); await C.waitForTimeout(2500);
        note('와이파이가 끊긴 팀 폰의 상태 글', await C.evaluate(() => document.getElementById('ev-sync').innerText));
        const D = await F.enter('D', '늦은 번개팀');
        note('교사 결과판: 끊긴 팀(로켓왕)을 알아볼 수 있는가', await board());
        await S.shot(T, '진행-1차시중');
        await S.tap(T, '크게 보기'); await S.shot(T, '결과판크게-1280'); note('결과판 크게(1280) 글자 크기', await S.fonts(T));
        await T.setViewportSize({ width: 1920, height: 1080 }); await T.waitForTimeout(300); await S.shot(T, '결과판크게-1920'); note('결과판 크게(1920) 글자 크기', await S.fonts(T));
        await S.tap(T, '닫기'); await T.setViewportSize({ width: 1280, height: 720 });

        // 수업 중 새로고침 · 목표 고치기
        await T.reload(); await T.waitForTimeout(1500); note('새로고침 뒤 주소', T.url().replace(S.ROOT, ''));
        await S.tap(T, '예비 실험 값·목표 고치기'); await T.fill('#te-targetTime', '3'); await T.locator('#btnSetupSave').click(); await T.waitForTimeout(800);
        note('목표 저장 글', await T.evaluate(() => document.getElementById('setupMsg').innerText));
        await A.click('text=다시 도전'); await A.waitForTimeout(4000);
        note('목표를 3초로 바꾼 뒤 가족 A 의 다시 도전 화면', ((await S.seen(A)).match(/목표[^\n]*/) || [''])[0]);
        await F.next(A); await F.go(A, 't1-ch-predict'); await F.next(A); await F.go(A, 't1-ch-measure'); await F.stopwatch(A, 2600); await F.go(A, 't1-ch-result');
        note('그 도전 결과', (await S.seen(A)).split('\n').slice(7, 11).join(' / '));

        // ───────── 2차시 · 정리 ─────────
        await A.click('text=2차시로'); await A.waitForTimeout(400); if (await F.screen(A) === 't2-intro') await F.next(A);
        await F.go(A, 'q-action'); await A.click('.ev-choice[data-k="ok"]'); await F.next(A); await F.go(A, 't2-base');
        await A.click('[data-var="mass"] [data-pm="1"]'); await F.next(A); await F.go(A, 'q-mass'); await A.click('.ev-choice[data-k="ok"]'); await F.next(A);
        await F.go(A, 't2-var'); await A.click('.ev-choice[data-k="mass"]'); await F.next(A); await F.go(A, 't2-cond'); await F.next(A); await F.go(A, 't2-safe');
        for (const k of ['goggle', 'face', 'away', 'wait']) await A.check('[data-safe="' + k + '"]'); await F.next(A); await F.go(A, 't2-film'); await S.shot(A, '가족A-촬영안내');
        await A.click('[data-go="t2-hand"]'); await F.go(A, 't2-hand'); await A.click('.ev-choice[data-k="low"]'); await F.go(A, 't2-result');
        await A.click('[data-go="t2-graph"]'); await F.go(A, 't2-graph'); await F.next(A); await F.go(A, 't2-challenge');
        await A.click('#ev-ch2'); await F.go(A, 't2-ch-cond'); await F.next(A); await F.go(A, 't2-safe'); await F.next(A); await F.go(A, 't2-film'); await A.click('[data-go="t2-hand"]'); await A.click('.ev-choice[data-k="same"]'); await F.go(A, 't2-ch-result');
        await A.click('#ev-end'); await A.waitForTimeout(600);
        S.net.C = false; await C.evaluate(() => window.dispatchEvent(new Event('online'))); await C.waitForTimeout(4000);
        note('다시 연결된 팀 폰', await C.evaluate(() => document.getElementById('ev-sync').innerText));
        note('2차시 끝 결과판', await board());
        const b2 = await screens(); await T.evaluate(() => scrollTo(0, 0)); await S.tap(T, '다음 단계 열기'); await T.waitForTimeout(4000);
        note('정리를 열기 전 → 뒤 가족 화면 (뒤처진 팀도 옮겨지는가)', { 전: b2, 뒤: await screens() });
        await F.next(A); for (const id of ['end-force', 'end-accel', 'end-pressure']) { await F.go(A, id); await A.click('.ev-choice[data-k="ok"]'); await A.waitForSelector('.ev-def'); await F.next(A); }
        await F.go(A, 'end-compare'); await F.next(A); await F.go(A, 'end-card'); await S.shot(A, '가족A-결과카드');

        // ───────── 수업 끝: 내려받기 · 마치기 · 다음 날 ─────────
        await S.tap(T, '설정'); await S.tap(T, '자료 내려받기'); await S.shot(T, '내려받기');
        note('내려받기의 조 고르기 칸', await T.evaluate(() => [...document.getElementById('dlGroup').options].map(o => o.textContent).slice(0, 4)));
        const [dl] = await Promise.all([T.waitForEvent('download'), T.click('#btnCsv')]);
        const csv = fs.readFileSync(await dl.path(), 'utf8').split('\r\n');
        note('CSV 첫 줄·줄 수', { 열: csv[0], 줄: csv.length - 2, 둘째줄: csv[1].slice(0, 160) });
        await S.tap(T, '돌아가기'); await S.tap(T, '수업 마치기'); await T.waitForTimeout(600); await S.tap(T, '수업 목록'); await S.shot(T, '목록-마친뒤');
        await S.tap(T, '마친 수업'); await T.locator('#doneList button[data-open]').first().click(); await T.waitForTimeout(700);
        note('다음 날: 마친 수업을 열면 처음 보이는 것', (await S.seen(T)).split('\n').slice(4, 10).join(' / '));
        await S.shot(T, '마친수업-열기');

        // QR 없이 수업 코드로 (띄어 쓴 코드)
        const E = await S.phone('E'); await E.goto(S.ROOT + 'index.html'); await E.waitForTimeout(400); await E.click('a:visible:has-text("학생"), button:visible:has-text("학생")'); await E.waitForTimeout(500);
        const code = (/c=([\d-]+)/.exec(link) || [])[1]; await E.fill('#joinCode', code.replace('-', ' ')); await E.click('button:visible:has-text("들어가기")'); await E.waitForTimeout(1500);
        note('수업 코드를 띄어 써서 넣으면', E.url().replace(S.ROOT, ''));

        note('알림 창·오류', S.log.filter(l => l.kind !== 'console'));
    } finally { await S.close(); }
})().catch(e => { console.error(e); process.exit(1); });
