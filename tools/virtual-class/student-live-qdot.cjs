// 합동 수업 ② 탄소 양자점(7단계) — 학생 쪽 차례. 교사 세션이 보낸 문서 묶음을 넣고, 학생 화면을 움직인 뒤, 바뀐 문서 묶음을 내놓는다.
//   VC_NPM=… node tools/virtual-class/student-live-qdot.cjs <상태 폴더> <차례 번호> [교사 묶음.json]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { openLive } = require('./student-live.cjs');
const CODE = '2-5512', PAGE = 'projects/quantum-dot.html?c=2-5512&s=cyuk7hbdrs768zt8ndurn3au';
(async () => {
    const [dir, turnArg, bundleFile] = process.argv.slice(2), turn = +turnArg;
    const live = await openLive(dir), W = live.W, out = [];
    const note = (k, v) => out.push([k, v]);
    if (bundleFile) live.apply(JSON.parse(fs.readFileSync(bundleFile, 'utf8')));
    const cur = pg => pg.evaluate(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.textContent.trim() : ''; });
    const band = async pg => ((await W.text(pg)).split('\n').find(l => /^나: /.test(l)) || '(아직 참여 안 함)');
    const join = async (pg, jo, num) => { await pg.locator('#cs-cjo').selectOption({ index: jo }); await pg.locator('#cs-cnum').selectOption({ index: num - 1 }); await W.tap(pg, '참여하기'); await pg.waitForTimeout(1200); };
    const T = {
        1: async () => {   // 0~3분: 들어오기
            const L1 = await live.student('1조노트북', 'laptop');   // 성실: 메인 → 학생 → 코드
            await L1.goto(W.ROOT + 'index.html'); await W.tap(L1, '학생'); await L1.getByPlaceholder('2-4821').fill(CODE); await W.tap(L1, '들어가기'); await L1.waitForTimeout(1500); await join(L1, 1, 1);
            const L2 = await live.student('2조노트북', 'laptop');   // 줄표 없이 넣었다가 고침
            await L2.goto(W.ROOT + 'index.html'); await W.tap(L2, '학생'); await L2.getByPlaceholder('2-4821').fill('25512'); await W.tap(L2, '들어가기'); await L2.waitForTimeout(800);
            note('2조 줄표 없이', (await W.text(L2)).split('\n').find(l => /모양|찾지/.test(l)));
            await L2.getByPlaceholder('2-4821').fill(CODE); await W.tap(L2, '들어가기'); await L2.waitForTimeout(1500); await join(L2, 2, 1);
            const P3 = await live.student('3조폰', 'phone');         // QR, 조를 2조로 잘못 고름(모름)
            await P3.goto(W.ROOT + PAGE); await P3.waitForTimeout(1500); await join(P3, 2, 2);
            const L6 = await live.student('6조노트북', 'laptop');   // 들어와서 조·번호를 안 고르고 글만 읽음
            await L6.goto(W.ROOT + PAGE); await L6.waitForTimeout(1500);
            await W.tap(L1, '이론', 0, true); await L1.waitForTimeout(500);   // 1조: 잠긴 2 이론 눌러 봄
            for (const pg of [L1, L2, P3, L6]) note(pg.vcName, { 띠: await band(pg), 단계: await cur(pg) });
            await W.shot(L6, '6조 참여 전'); await L1.waitForTimeout(4000);
        }
        // TURNS
    };
    try { await T[turn](); } catch (e) { note('막힘', String(e.message).split('\n')[0]); }
    out.push(['알림 창', W.dialogs.splice(0)], ['오류', W.errors.splice(0)]);
    const bundle = await live.close(turn, '학생 차례 ' + turn);
    fs.writeFileSync(path.join(dir, 'out-' + turn + '.json'), JSON.stringify(bundle));
    console.log(JSON.stringify(out, null, 1)); console.log('묶음 글자 수', JSON.stringify(bundle).length, Object.keys(bundle.set));
})();
