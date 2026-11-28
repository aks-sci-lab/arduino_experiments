// 가상 수업 ① 필름통 로켓 (둘째 걸음) — 대충 하는 가족 C(Pixel 7): 단계가 모두 열린 수업에 QR 로 들어와 2차시(로켓 높이)와 정리를 한다.
//   VC_NPM=<chart.js 가 깔린 폴더> node tools/virtual-class/student-rocket-2.cjs [그림 폴더]
'use strict';
const { startWorld } = require('./student-lib.cjs');
(async () => {
    const W = await startWorld({ shots: process.argv[2] });
    const out = [];
    const note = (k, v) => out.push([k, v]);
    let dead = false;
    const walk = async (name, fn) => { if (dead) return; try { await fn(); } catch (e) { note('막힘@' + name, String(e.message).split('\n')[0]); dead = true; } };
    const stroll = (pg, tag, max, pick, until) => W.stroll(pg, tag, max, pick, until, note);
    const see = async (pg, k, top) => { note(k, { 글: (await W.text(pg)).split('\n').filter(l => !/보내는 중|선생님께 보냄/.test(l)).slice(top == null ? 6 : top).join(' / ').slice(0, 900), 점검: await W.check(pg, 56) }); await W.shot(pg, k, true); };
    try {
        const cls = await W.createClass({ exp: 'rocket', mode: 'team', nTeams: 6, stage: 99 });
        const C = await W.student('C', 'Pixel 7');
        await walk('입장', async () => { await C.goto(W.classUrl(cls, 'projects/film-rocket.html')); await C.waitForTimeout(1000); await W.tap(C, '무지개 팀'); await W.tap(C, '시작하기'); await C.waitForTimeout(1200); await W.tap(C, '2차시'); await see(C, '2차시 바로'); });
        await walk('2차시 걷기', async () => { await stroll(C, '2차시', 24, 0, /영상으로 재기/); });
        await walk('영상', async () => {
            await W.tap(C, '영상으로 재기'); await C.waitForTimeout(1000); await W.tap(C, '녹화 시작'); await C.waitForTimeout(2500); await see(C, '발사 녹화 중'); note('녹화 중 단추', (await W.buttons(C)).slice(4));
        });
        await walk('녹화 끝', async () => { await W.tap(C, '녹화 끝'); await C.waitForTimeout(2000); await see(C, '가장 높은 장면'); note('단추', (await W.buttons(C)).slice(4)); });
        await walk('세 곳 누르기', async () => { for (let i = 0; i < 3; i++) await W.tap(C, '⏩'); await W.tap(C, '이 장면이 가장 높아요'); await C.waitForTimeout(800); await see(C, '세 곳 누르기 화면'); note('단추', (await W.buttons(C)).slice(4)); await W.shot(C, '세곳_보이는화면'); });
        await walk('세 점', async () => {
            const pic = C.locator('canvas').locator('visible=true').first(); const bx = await pic.boundingBox();
            const at = async (fx, fy) => { await C.touchscreen.tap(bx.x + bx.width * fx, bx.y + bx.height * fy); await C.waitForTimeout(500); };
            await at(0.3, 0.95); note('① 뒤 안내', (await W.text(C)).split('\n').slice(8, 10)); await at(0.3, 0.45); note('② 뒤 안내', (await W.text(C)).split('\n').slice(8, 10));
            await W.tap(C, '하나 지우기'); note('하나 지운 뒤', (await W.text(C)).split('\n').slice(8, 10)); await at(0.3, 0.5); await W.shot(C, '두점');
            await at(0.6, 0.35); await C.waitForTimeout(600); await see(C, '세 점 뒤'); note('단추', (await W.buttons(C)).slice(4));
        });
        await walk('기록', async () => { await W.tap(C, '이 결과 기록'); await C.waitForTimeout(600); await see(C, '발사 결과'); note('단추', (await W.buttons(C)).slice(4)); });
        await walk('다시 발사(눈으로)', async () => {
            await W.tap(C, '바꿔서 다시 발사'); await W.tap(C, '+'); await W.tap(C, '+'); await stroll(C, '재발사', 8, 0, /눈으로 보고 고르기/);
            await W.tap(C, '눈으로 보고 고르기'); await see(C, '눈으로 고르기'); note('단추', (await W.buttons(C)).slice(4));
        });
        await walk('비슷 → 그래프 → 끝까지', async () => {
            await W.tap(C, '아이 키와 비슷'); await C.waitForTimeout(500); await see(C, '눈으로 결과');
            await W.tap(C, '그래프 보기'); await C.waitForTimeout(900); await see(C, '2차시 그래프'); note('그래프 단추', (await W.buttons(C)).slice(4));
        });
        await walk('그래프 뒤 걷기', async () => { await W.tap(C, '도전: 딱'); await W.tap(C, '정리로 가기'); await stroll(C, '정리', 30, 1, /카드|PNG|저장/); await see(C, '걷기 끝난 곳'); note('단추', (await W.buttons(C)).slice(4)); });
        await walk('결과 카드', async () => {
            await W.tap(C, '결과 카드 만들기'); await C.waitForTimeout(1200); await see(C, '결과 카드'); note('카드 단추', (await W.buttons(C)).slice(4));
            const dl = C.waitForEvent('download', { timeout: 5000 }).catch(() => null); await W.tap(C, /저장|PNG|내려받/); const d = await dl; note('카드 저장', d ? '파일 ' + d.suggestedFilename() : '내려받기가 일어나지 않음'); await see(C, '카드 저장 뒤');
        });
        // 수업이 끝난 뒤 다시 열어 보기: 같은 폰으로 QR 다시, 그리고 메인 화면에서
        await walk('다시 열기', async () => {
            await C.goto(W.classUrl(cls, 'projects/film-rocket.html')); await C.waitForTimeout(1500); await see(C, '다시 연 화면', 0);
            await C.goto(W.ROOT + 'projects/film-rocket.html'); await C.waitForTimeout(1500); await see(C, '수업 주소 없이 다시 연 화면', 0);
        });
        // 수업 없이(QR·코드 없이) 처음 여는 가족
        const D = await W.student('D', 'phone');
        await walk('수업 없이', async () => { await D.goto(W.ROOT + 'projects/film-rocket.html'); await D.waitForTimeout(1200); await see(D, '수업 없이 첫 화면', 0); await W.tap(D, '별빛 가족'); await W.tap(D, '시작하기'); await D.waitForTimeout(1200); await see(D, '수업 없이 입장 뒤', 0); });
        // STEPS
    } finally {
        out.push(['알림 창', W.dialogs], ['오류', W.errors]);
        console.log(JSON.stringify(out, null, 1));
        await W.close();
    }
})();
