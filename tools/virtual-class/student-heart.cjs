// 가상 수업 ⑨ 심박수 · 데이터 가공 실험실 — 노트북(데이터 가공 실험실) + 폰(손가락 카메라, 크롬 가짜 카메라).
//   VC_NPM=<chart.js 가 깔린 폴더> node tools/virtual-class/student-heart.cjs [그림 폴더]
'use strict';
const { startWorld } = require('./student-lib.cjs');
(async () => {
    const W = await startWorld({ shots: process.argv[2] });
    const out = [];
    const note = (k, v) => out.push([k, v]);
    let dead = false;
    const walk = async (name, fn) => { if (dead) return; try { await fn(); } catch (e) { note('막힘@' + name, String(e.message).split('\n')[0]); dead = true; } };
    const see = async (pg, k, n, from) => { note(k, { 글: (await W.text(pg)).split('\n').slice(from || 0).join(' / ').slice(0, n || 1400), 점검: await W.check(pg) }); await W.shot(pg, k, true); };
    try {
        const cls = await W.createClass({ exp: 'heartrate', ban: 2, nStudents: 8, groupSize: 4, stage: 99 });
        const L = await W.student('1조노트북', 'laptop');
        await walk('노트북 입장(수업 코드)', async () => {
            await L.goto(W.ROOT + 'index.html'); await W.tap(L, '학생'); await L.getByPlaceholder('2-4821').fill(cls.classCode); await W.tap(L, '들어가기'); await L.waitForTimeout(2000);
            note('들어간 주소', L.url().replace(W.ROOT, '').replace(/s=[^&]+/, 's=…'));
            await see(L, '노트북 첫 화면', 2200); note('단추', await W.buttons(L));
        });
        const P = await W.student('1조폰', 'phone');
        await walk('참여 → QR → 폰', async () => {
            await L.locator('#cs-cjo').selectOption({ index: 1 }); await L.locator('#cs-cnum').selectOption({ index: 0 }); await W.tap(L, '참여하기'); await L.waitForTimeout(2000);
            const u = await L.evaluate(() => [...document.querySelectorAll('a[href*="role=phone"]')].filter(e => e.offsetParent).map(e => e.href)[0]); note('폰 주소', String(u).replace(/^https?:\/\/[^/]+\//, '').replace(/s=[^&]+/, 's=…'));
            await P.goto(u); await P.waitForTimeout(2500); await see(P, '폰 첫 화면', 1800); note('폰 단추', await W.buttons(P)); await W.shot(P, '폰 보이는 곳');
        });
        const lines = async (pg, re, n) => (await W.text(pg)).split('\n').filter(l => re.test(l)).slice(0, n || 10);
        await walk('폰 한 번 재기', async () => {
            await W.tap(P, '카메라 켜기'); await P.waitForTimeout(4000); note('카메라 켠 뒤', await lines(P, /카메라|덮|노출|손가락|품질|🔒|🟢|🟡|🔴/, 10)); await W.shot(P, '카메라 켠 뒤');
            await P.locator('select[aria-label="측정 길이"]').selectOption('15').catch(() => {});
            await W.tap(P, '측정 시작'); await P.waitForTimeout(6000); note('재는 중', await lines(P, /측정|남|초|덮|품질|🟢|🟡|🔴|회\/분/, 10)); await W.shot(P, '재는 중');
            await P.waitForTimeout(13000); note('잰 뒤', await lines(P, /측정|회차|보내|저장|품질|끝|다시|✅|💾/, 12)); await W.shot(P, '잰 뒤', true); note('잰 뒤 단추', await W.buttons(P));
        });
        await walk('보내기 → 노트북', async () => {
            await P.evaluate(() => scrollTo(0, 0)); await W.tap(P, '고른 회차 보내기'); await P.waitForTimeout(3000); note('보낸 뒤 폰', await lines(P, /보냈|보냄|실패/, 4));
            await L.waitForTimeout(5000); await see(L, '노트북(심박수 페이지)에 도착', 1700, 8); note('노트북 단추', (await W.buttons(L)).slice(3));
        });
        await walk('폰 숨 참기 탐구 화면', async () => {
            await W.tap(P, '숨 참기 탐구'); await P.waitForTimeout(1000); await see(P, '폰 숨 참기 화면', 1500, 9); note('숨 참기 단추', (await W.buttons(P)).slice(6));
            await W.tap(P, /시작/).then(() => note('안전 확인 없이 시작', '눌림'), e => note('안전 확인 없이 시작', e.message));
        });
        await walk('노트북 숨 참기 · 데이터 가공 실험실', async () => {
            await W.tap(L, '숨 참기 탐구'); await L.waitForTimeout(1000); await see(L, '노트북 숨 참기 화면', 1500, 8);
            await L.goto(W.classUrl(cls, 'projects/data-lab.html')); await L.waitForTimeout(2500); await see(L, '노트북 데이터 가공 실험실', 2200); note('데이터 가공 단추', (await W.buttons(L)).slice(0, 40));
        });
        // STEPS
    } finally {
        out.push(['알림 창', W.dialogs], ['오류', W.errors]);
        console.log(JSON.stringify(out, null, 1));
        await W.close();
    }
})();
