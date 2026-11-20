// 가상 수업 ① 필름통 로켓 — 가족(초3 아이 + 부모, 폰 1대) 역할로 처음부터 끝까지.
//   VC_NPM=<chart.js 가 깔린 폴더> node tools/virtual-class/student-rocket.cjs [그림 폴더] [몇 번째 걸음까지]
// 걸음마다 화면 그림을 남긴다. 누르는 것은 화면에 보이는 글로만 찾는다(W.tap).
'use strict';
const { startWorld } = require('./student-lib.cjs');
(async () => {
    const W = await startWorld({ shots: process.argv[2] });
    const upto = +process.argv[3] || 999;
    const out = [];
    const note = (k, v) => out.push([k, v]);
    let step = 0;
    const walk = async (name, fn) => { if (++step > upto) return; try { await fn(); } catch (e) { note('막힘@' + name, String(e.message).split('\n')[0]); step = 1e9; } };
    try {
        const cls = await W.createClass({ exp: 'rocket', mode: 'team', nTeams: 6 });   // 교사: 팀 6, 1단계(생각 열기)만 열림
        const A = await W.student('A', 'phone');
        // ---- 가족 A: 메인 화면 → 학생 → 수업 코드 길 ----
        await walk('메인', async () => { await A.goto(W.ROOT + 'index.html'); await A.waitForTimeout(700); await W.shot(A, '메인'); note('메인 단추', await W.buttons(A)); });
        await walk('학생 고르기', async () => { await W.tap(A, '학생'); await W.shot(A, '학생화면'); note('학생 화면 단추', await W.buttons(A)); });
        const codeBox = A.getByPlaceholder('2-4821');
        await walk('틀린 코드', async () => { await codeBox.fill(cls.classCode.replace('-', '')); await W.tap(A, '들어가기'); await A.waitForTimeout(1200); await W.shot(A, '코드_줄표없이'); note('줄표 없이 넣은 뒤', (await W.text(A)).slice(0, 300)); note('주소', A.url().replace(W.ROOT, '')); });
        await walk('없는 코드', async () => { if (!/index\.html/.test(A.url())) return; await codeBox.fill('9-0000'); await W.tap(A, '들어가기'); await A.waitForTimeout(1200); await W.shot(A, '코드_없는것'); note('없는 코드 뒤', (await W.text(A)).slice(0, 300)); });
        await walk('맞는 코드', async () => { if (!/index\.html/.test(A.url())) return; await codeBox.fill(cls.classCode); await W.tap(A, '들어가기'); await A.waitForTimeout(1500); await W.shot(A, '입장화면'); note('입장 주소', A.url().replace(W.ROOT, '')); note('입장 단추', await W.buttons(A)); note('입장 점검', await W.check(A, 56)); });
        const nameBox = A.getByPlaceholder('예: 별빛 가족').locator('visible=true').first();
        await walk('빈 이름으로 시작', async () => { await W.tap(A, '시작하기'); await W.shot(A, '빈이름'); note('빈 이름 뒤', (await W.text(A)).slice(0, 400)); });
        await walk('이모지 긴 이름', async () => { await nameBox.fill('🚀우주최강번개로켓가족팀짱짱'); note('칸에 들어간 글', await nameBox.inputValue()); await W.tap(A, '시작하기'); await A.waitForTimeout(1500); await W.shot(A, '입장뒤'); note('입장 뒤 글', (await W.text(A)).slice(0, 600)); note('입장 뒤 단추', await W.buttons(A)); note('점검', await W.check(A, 56)); });
        // 잠긴 단계를 미리 눌러 보는 아이
        await walk('잠긴 1차시 누르기', async () => { await W.tap(A, '1차시', 0, true); await W.shot(A, '잠김'); note('잠긴 단계 누른 뒤', await W.text(A)); note('잠김 단추', await W.buttons(A)); });
        await walk('잠김에서 돌아오기', async () => { await W.tap(A, /돌아가기|뒤로|생각 열기/); await W.shot(A, '잠김뒤'); note('돌아온 화면', (await W.text(A)).slice(0, 200)); });
        const stroll = (pg, tag, max, pick, until) => W.stroll(pg, tag, max, pick, until, note);
        await walk('생각 열기 걷기', async () => { await stroll(A, '생각', 14, 0); });
        await walk('보냄 표시 기다림', async () => { await A.waitForTimeout(4000); note('4초 뒤 보냄 표시', (await W.text(A)).split('\n').slice(6, 8)); });
        // 교사: 1차시 열기 → 잠김 화면에서 기다리던 가족 A 는?
        await walk('교사 1차시 열기', async () => { await W.openStage(cls, 2); await A.waitForTimeout(2500); await W.shot(A, '1차시열림'); note('1차시 열린 뒤', (await W.text(A)).slice(0, 500)); });
        await walk('1차시 걷기', async () => { await stroll(A, '1차시', 30, 0, /녹화로 재기/); });
        // 🎥 녹화로 재기: 폰을 세워 두고 → 녹화 시작 → (뚜껑 닫는 순간) 노란 단추 → 4초 뒤 '펑' → 녹화 끝 → 장면 고르기
        await walk('녹화', async () => {
            await W.tap(A, '녹화로 재기'); await W.tap(A, '녹화 시작'); await A.waitForTimeout(1200);
            await W.tap(A, '뚜껑 닫는 순간'); await A.waitForTimeout(4200); await W.shot(A, '녹화중');
            await W.tap(A, '녹화 끝'); await A.waitForTimeout(1500); await W.shot(A, '장면고르기', true);
            note('장면 고르기', { 글: (await W.text(A)).split('\n').slice(7).join(' / '), 점검: await W.check(A, 56) });
            const clock = async () => (await W.text(A)).split('\n').find(l => /^⏱/.test(l));
            const seen = [];
            for (let i = 0; i < 8; i++) { await W.tap(A, '⏩'); await A.waitForTimeout(300); seen.push(await clock()); }
            for (let i = 0; i < 4; i++) { await W.tap(A, '▶'); await A.waitForTimeout(300); seen.push(await clock()); }
            note('⏩ 8번, ▶ 4번 누르는 동안 시계', seen);
            await W.shot(A, '장면넘김'); note('넘긴 뒤', (await W.text(A)).split('\n').slice(8, 10));
            await W.tap(A, '이 장면이'); await A.waitForTimeout(600); await W.shot(A, '펑고른뒤', true);
            note('펑 고른 뒤', { 글: (await W.text(A)).split('\n').slice(7).join(' / '), 단추: await W.buttons(A) });
        });
        // ⏱ 초시계로 한 번 더
        await walk('한 번 더(초시계)', async () => {
            await W.tap(A, '같은 조건으로 한 번 더'); await stroll(A, '반복', 6, 0, /초시계로 재기/);
            await W.tap(A, '초시계로 재기'); await W.shot(A, '초시계'); note('초시계 화면', { 글: (await W.text(A)).split('\n').slice(7).join(' / '), 단추: (await W.buttons(A)).slice(4) });
        });
        const see = async (pg, k) => { note(k, { 글: (await W.text(pg)).split('\n').filter(l => !/보내는 중|선생님께 보냄/.test(l)).slice(6).join(' / ').slice(0, 800), 점검: await W.check(pg, 56) }); await W.shot(pg, k, true); };
        const stopwatch = async (pg, sec, tag) => {   // 초시계: 시작 → sec 초 → 화면에 보이는 멈춤 단추
            await W.tap(pg, '시작 (뚜껑'); await pg.waitForTimeout(sec * 1000);
            if (tag) await see(pg, tag);
            await W.tap(pg, /펑|멈춤|끝/); await pg.waitForTimeout(500);
        };
        await walk('초시계 재기', async () => { await stopwatch(A, 2.3, '초시계 가는 중'); await see(A, '초시계 멈춘 뒤'); await W.tap(A, '이 시간으로 기록'); await see(A, '초시계 결과'); });
        await walk('세 번째', async () => { await W.tap(A, '같은 조건으로 한 번 더'); await stroll(A, '반복3', 6, 0, /초시계로 재기/); await W.tap(A, '초시계로 재기'); await stopwatch(A, 2.8); await W.tap(A, '이 시간으로 기록'); await see(A, '세 번 잰 뒤'); });
        // 조건 바꿔서 한 번(대충: 한 번만 재고 그래프로)
        await walk('조건 바꾸기', async () => { await W.tap(A, /바꿔서 재기|다른 조건/); await see(A, '조건 바꾸기 화면'); await W.tap(A, '+'); await W.tap(A, '+'); await stroll(A, '조건2', 6, 0, /초시계로 재기/); await W.tap(A, '초시계로 재기'); await stopwatch(A, 1.5); await W.tap(A, '이 시간으로 기록'); await see(A, '조건2 결과'); });
        await walk('그래프', async () => { await W.tap(A, '그래프 보기'); await A.waitForTimeout(800); await see(A, '그래프'); note('그래프 단추', (await W.buttons(A)).slice(4)); });
        await walk('왜 달랐을까', async () => { await W.tap(A, '왜 달랐을까'); await stroll(A, '왜', 12, 1, /도전|목표/); await see(A, '도전 앞'); note('도전 단추', (await W.buttons(A)).slice(4)); });
        await walk('도전', async () => { await W.tap(A, '도전하기'); await stroll(A, '도전', 8, 0, /초시계로 재기/); await W.tap(A, '초시계로 재기'); await stopwatch(A, 3); await W.tap(A, '이 시간으로 기록'); await see(A, '도전 결과'); note('도전 결과 단추', (await W.buttons(A)).slice(4)); });
        await walk('2차시 미리', async () => { await W.tap(A, /2차시로/); await see(A, '2차시 미리 누름'); });
        // ---- 가족 B: 늦게 옴(1차시가 열린 뒤), QR 로, 같은 팀 이름을 넣어 봄 ----
        const B = await W.student('B', 'phone');
        const nameB = B.getByPlaceholder('예: 별빛 가족').locator('visible=true').first();
        await walk('B 같은 이름', async () => { await B.goto(W.classUrl(cls, 'projects/film-rocket.html')); await B.waitForTimeout(1200); await nameB.fill('🚀우주최강번개로켓가족'); await W.tap(B, '시작하기'); await B.waitForTimeout(1200); await see(B, 'B 같은 이름'); });
        await walk('B 추천 이름', async () => { await W.tap(B, '번개 가족'); await W.tap(B, '시작하기'); await B.waitForTimeout(1500); await see(B, 'B 늦게 입장'); });
        // ---- 가족 A: 인터넷이 끊긴 채 다시 도전 → 새로고침 → 다시 연결 ----
        await walk('끊김 중 측정', async () => {
            await W.tap(A, '돌아가기'); await see(A, '1차시로 돌아옴');
        });
        await walk('끊김 중 측정2', async () => {
            W.offline.A = true;
            const b = await W.buttons(A); note('돌아온 뒤 단추', b.slice(4));
        });
        await walk('끊김 중 다시 재기', async () => {
            await stroll(A, '끊김', 14, 0, /초시계로 재기/); await W.tap(A, '초시계로 재기'); await stopwatch(A, 2); await W.tap(A, '이 시간으로 기록'); await A.waitForTimeout(2500);
            note('끊긴 채 기록한 뒤 위쪽 띠', (await W.text(A)).split('\n').slice(0, 9)); await W.shot(A, '끊김 기록');
            await A.reload(); await A.waitForTimeout(2000); note('끊긴 채 새로고침', (await W.text(A)).split('\n').slice(0, 14)); await W.shot(A, '끊김 새로고침');
            W.offline.A = false; await A.waitForTimeout(7000); note('다시 연결 7초 뒤', (await W.text(A)).split('\n').slice(0, 9));
            note('저장소의 팀 줄', W.app.items('rocket').map(d => ({ 조: d.group, 요약: JSON.stringify(d.summary || d.title || '').slice(0, 200) })));
        });
        await walk('다시 연결 기다림', async () => {
            const t0 = Date.now(); let sent = null;
            while (Date.now() - t0 < 70000) { await A.waitForTimeout(3000); const l = (await W.text(A)).split('\n').slice(2, 7).join(' | '); if (!/폰에 저장됨/.test(l)) { sent = Math.round((Date.now() - t0) / 1000 + 7) + '초 뒤: ' + l; break; } }
            note('다시 연결 뒤 보내기까지', sent || '77초가 지나도 "폰에 저장됨 · 연결되면 보내요" 그대로 (' + (await W.text(A)).split('\n').slice(2, 7).join(' | ') + ')');
            note('저장소 측정 수', W.app.items('rocket').map(d => (d.summary || {})['열림 측정 수']));
        });
        // 초시계가 가는 도중에 교사가 2차시를 열면?
        await walk('측정 중 단계 열림', async () => {
            await W.tap(A, '같은 조건으로 한 번 더'); await stroll(A, '중간', 5, 0, /초시계로 재기/); await W.tap(A, '초시계로 재기'); await W.tap(A, '시작 (뚜껑'); await A.waitForTimeout(1000);
            await W.openStage(cls, 3); await A.waitForTimeout(3000); await see(A, '초시계 도중 2차시 열림'); await B.waitForTimeout(500); await see(B, 'B(생각 열기 첫 화면)에서 2차시 열림');
        });
        await walk('2차시 걷기', async () => { await stroll(A, '2차시', 24, 0, /녹화 시작|높다|비슷/); await see(A, '2차시 측정 앞'); note('2차시 측정 단추', (await W.buttons(A)).slice(4)); });
        await walk('2차시 영상', async () => { await W.tap(A, '영상으로 재기'); await A.waitForTimeout(1200); await see(A, '2차시 녹화 앞'); note('단추', (await W.buttons(A)).slice(4)); });
        // STEPS
    } finally {
        out.push(['알림 창', W.dialogs], ['오류', W.errors]);
        console.log(JSON.stringify(out, null, 1));
        await W.close();
    }
})();
