// 가상 수업(교사 역할) ③ LED 플랑크 상수 — 교사 진행 화면의 '🔬 LED 플랑크 상수 결과' 를 수업 중·수업 끝에 써 보기
//   node tools/virtual-class/teacher-planck.cjs [그림 폴더]
// 발표 보기·단계 열기는 teacher-report.cjs planck 로. 여기서는 조 노트북이 보낸 LED 측정(멀티미터 값을 넣어 보낸 것과 같은 자료)을
// 가짜 저장소에 학생(익명) 이름으로 넣고, 교사가 결과판을 읽는다: 1조 LED 3개(노트북 2대), 2조 LED 1개(직선 못 그림), 3조 LED 3개 중 하나가 크게 틀림, 4~6조 없음.
'use strict';
const path = require('node:path'), fs = require('node:fs');
const VC = require('./teacher-lib.cjs');
const PC = require(path.join(VC.REPO, 'js/planck-cloud.js')), C = require(path.join(VC.REPO, 'js/pendulum-cloud.js')), P = require(path.join(VC.REPO, 'js/planck-math.js'));
const ivFor = vt => [0, 0.05, 0.1, 0.15, 0.2].map(d => ({ v: +(vt + d).toFixed(4), i: +(d * 40).toFixed(3) }));
const v0Of = lambda => P.H_TRUE * P.freqOf(lambda) / P.E_CHARGE;

(async () => {
    const S = await VC.start({ shots: process.argv[2] || path.join(process.cwd(), 'vc-shots', 'planck') });
    const note = (k, v) => console.log('── ' + k + '\n' + (typeof v === 'string' ? v : JSON.stringify(v, null, 1)));
    try {
        const T = await S.teacher({ width: 1280, height: 720 });
        await T.goto(S.ROOT + 'projects/class-teacher.html'); await S.tap(T, '구글 계정으로 로그인'); await S.tap(T, '새 수업 만들기');
        await T.fill('#inBan', '2'); await T.selectOption('#inExp', 'planck'); await S.tap(T, '수업 만들기', 'last'); await T.waitForTimeout(600);
        const code = (await T.textContent('#outCode')).trim(); const space = decodeURIComponent((T.url().match(/#class=([^&]+)/) || [])[1] || '');
        await S.tap(T, '진행 보기'); await T.waitForTimeout(800);
        note('아직 아무도 안 보냈을 때 플랑크 결과 칸', (await S.seen(T)).split('\n').filter(l => /LED|플랑크/.test(l)));
        const info = await S.app.post({ action: 'joinInfo', class: code }, {});
        const send = async (jo, device, list, uid) => {
            const leds = list.map(([key, name, lambda, off]) => ({ id: key, key, name, lambda, on: true, fit: true, iv: ivFor(v0Of(lambda) + (off || 0)), glow: [+(v0Of(lambda) + (off || 0) - 0.05).toFixed(3)] }));
            const { payloads } = PC.buildPayloads({ group: info.groups[jo - 1].code, device, leds, sent: [], v0: (led, m) => { const t = P.thresholdOf(led, m === 'glow' ? 'glow' : 'extrapolate', { iMin: 1 }); return t.error ? null : t.v0; },
                summary: { hCurrent: 6.6 }, curMode: 'extrapolate', iMin: 1, now: new Date().toISOString() }, C.isGroupCode);
            for (const p of payloads) { const r = await S.app.post(Object.assign({ space }, p), { uid, anonymous: true }); if (!r.ok) throw new Error(r.error); }
        };
        await send(1, 'nab12cd', [['red', '빨강', 625], ['green', '초록', 525]], 'stu-1'); await send(1, 'nzz9999', [['blue', '파랑', 470]], 'stu-2');
        await send(2, 'nqq1111', [['red', '빨강', 625]], 'stu-3');
        await send(3, 'nrr2222', [['red', '빨강', 625], ['green', '초록', 525, 0.6], ['blue', '파랑', 470]], 'stu-4');   // 초록 문턱 전압을 0.6 V 크게 잘못 잼
        await T.waitForTimeout(3500); await T.evaluate(() => scrollTo(0, 0));
        const all = await S.seen(T); const i = all.indexOf('플랑크 상수 결과');
        note('학생이 보낸 뒤 저절로 바뀌는가(새로 보기 누르기 전)', i < 0 ? '(결과 칸 없음)' : all.slice(i, i + 900));
        if (await T.locator('#ctpReload').count()) { await T.locator('#ctpReload').scrollIntoViewIfNeeded(); await T.locator('#ctpReload').click(); await T.waitForTimeout(1500); }
        const all2 = await S.seen(T); const j = all2.indexOf('플랑크 상수 결과'); note('🔄 뒤 플랑크 결과 칸', all2.slice(j, j + 1400));
        await T.locator('#ctpTable').scrollIntoViewIfNeeded(); await S.shot(T, '플랑크결과판'); note('결과판 글자 크기', await S.fonts(T));
        note('결과 칸이 진행 화면 어디에 있나(위에서부터 px, 화면 높이 720)', await T.evaluate(() => { const e = document.getElementById('ctpTable'); return Math.round(e.getBoundingClientRect().top + scrollY); }));
        const rows = T.locator('#ctpTable .ctp-row'); note('줄 수', await rows.count());
        await rows.nth(2).click(); await T.waitForTimeout(700); await S.shot(T, '플랑크-3조자세히'); const all3 = await S.seen(T); const k = all3.indexOf('3조 ('); note('3조 줄을 누르면', all3.slice(k, k + 900));
        const [dl] = await Promise.all([T.waitForEvent('download'), T.click('#ctpCsv')]); const csv = fs.readFileSync(await dl.path(), 'utf8').split('\r\n');
        note('CSV', { 첫줄: csv[0], 줄수: csv.length - 2, 예: csv[1] });
        await T.setViewportSize({ width: 375, height: 760 }); await T.waitForTimeout(400); await S.shot(T, '플랑크결과판-폰폭'); 
        note('알림 창·오류', S.log.filter(l => l.kind !== 'console'));
    } finally { await S.close(); }
})().catch(e => { console.error(e); process.exit(1); });
