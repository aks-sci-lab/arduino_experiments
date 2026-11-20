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
    // 교사 묶음은 기본으로 먼저 넣지만, LATE 에 든 차례는 학생 화면을 연 뒤에 넣는다(수업 중에 단계가 열리는 것을 그대로 보려고)
    const LATE = { 3: 1, 4: 1, 5: 1 };
    const teacher = () => { if (bundleFile) live.apply(JSON.parse(fs.readFileSync(bundleFile, 'utf8'))); };
    if (!LATE[turn]) teacher();
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
        },
        2: async () => {   // 3~7분: 교사 말("참여하기까지 눌러야", "2조 2번 누구?", "폰으로 해도 돼요")에 반응
            const P3 = await live.student('3조폰', 'phone'), L6 = await live.student('6조노트북', 'laptop'), L1 = await live.student('1조노트북', 'laptop'), L2 = await live.student('2조노트북', 'laptop');
            note('다시 연 화면(지난 차례 이어짐)', { '3조폰': await band(P3), '1조': await band(L1), '6조': await band(L6) });
            await W.tap(P3, '조·번호 바꾸기'); await P3.waitForTimeout(500); await join(P3, 3, 1);          // 3조: 고침
            await join(L6, 6, 1);                                                                           // 6조: 이제 참여
            const P4 = await live.student('4조폰', 'phone'); await P4.goto(W.ROOT + PAGE); await P4.waitForTimeout(1500); await join(P4, 4, 1);   // 4조: 폰으로
            await W.shot(P4, '4조 폰 1 목적'); note('4조 폰 화면 길이', (await W.check(P4)).pages);
            for (const pg of [L1, L2, P3, P4, L6]) note(pg.vcName, { 띠: await band(pg), 단계: await cur(pg) });
            await L1.waitForTimeout(4000);
        },
        3: async () => {   // 7~17분: 2 이론이 열림 → 저절로 넘어가나, 작은 탭 넘겨 읽기
            W.app.db.docs.get('labClasses/cyuk7hbdrs768zt8ndurn3au').stage = 1;   // (다시 돌릴 때) 교사가 열기 전 상태에서 학생 화면을 엶
            const pgs = {}; for (const [n, d] of [['1조노트북', 'laptop'], ['2조노트북', 'laptop'], ['3조폰', 'phone'], ['4조폰', 'phone'], ['6조노트북', 'laptop']]) pgs[n] = await live.student(n, d);
            teacher(); await pgs['1조노트북'].waitForTimeout(6000);
            const sub = pg => pg.evaluate(() => { const b = [...document.querySelectorAll('.subtabs [aria-selected="true"]')].find(e => e.offsetParent); return b ? b.textContent.trim() : ''; });
            for (const [n, pg] of Object.entries(pgs)) note(n, { 단계: await cur(pg), 작은탭: await sub(pg), 화면장: (await W.check(pg)).pages });
            const P4 = pgs['4조폰']; await W.shot(P4, '4조 폰 2 이론'); note('4조 폰 이론 첫 화면 글', (await W.text(P4)).split('\n').slice(8, 22).join(' / ').slice(0, 600));
            await W.tap(pgs['1조노트북'], '띠 틈과 색'); await W.tap(pgs['2조노트북'], '띠 틈과 색'); await W.tap(pgs['3조폰'], '띠 틈과 색');   // 4조·6조는 안 넘김
            await W.tap(pgs['6조노트북'], '준비물', 0, true); await pgs['6조노트북'].waitForTimeout(400);   // 6조: 잠긴 3 을 눌러 봄
            note('1조 띠 틈과 색 글', (await pgs['1조노트북'].locator('.step-panel').locator('visible=true').first().innerText()).replace(/\n+/g, ' / ').slice(0, 700));
            await pgs['1조노트북'].waitForTimeout(4000);
        }
        // TURNS
    };
    try { await T[turn](); } catch (e) { note('막힘', String(e.message).split('\n')[0]); }
    out.push(['알림 창', W.dialogs.splice(0)], ['오류', W.errors.splice(0)]);
    const bundle = await live.close(turn, '학생 차례 ' + turn);
    fs.writeFileSync(path.join(dir, 'out-' + turn + '.json'), JSON.stringify(bundle));
    console.log(JSON.stringify(out, null, 1)); console.log('묶음 글자 수', JSON.stringify(bundle).length, Object.keys(bundle.set));
})();
