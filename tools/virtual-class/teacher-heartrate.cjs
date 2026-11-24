// 가상 수업(교사 역할) ⑨ 스마트폰 카메라 심박수(숨 참기 탐구) · 데이터 가공 실험실
//   node tools/virtual-class/teacher-heartrate.cjs [그림 폴더]
// 교사(1920×1080 = 4K 배율 200%): 심박수 수업 만들기 → 진행 화면(단계 열기·발표 보기가 있는지) → 1조 노트북 참여 → 1조 폰(Pixel 7, 가짜 카메라)이
//   숨 참기 측정(#breath-scale=0.2 로 짧게, 3초에 멈춤) → 📤 보내기 → 노트북 결과 · 교사 조 카드 · 교사 내려받기(동의 전 원본이 들어가는지)
//   → 데이터 가공 실험실을 프로젝터에 띄웠을 때 크기(1920·2560·3840).
'use strict';
const path = require('node:path'), fs = require('node:fs');
const VC = require('./teacher-lib.cjs');
(async () => {
    const S = await VC.start({ shots: process.argv[2] || path.join(process.cwd(), 'vc-shots', 'heartrate') });
    const note = (k, v) => console.log('── ' + k + '\n' + (typeof v === 'string' ? v : JSON.stringify(v, null, 1)));
    try {
        const T = await S.teacher({ width: 1920, height: 1080 });
        await T.goto(S.ROOT + 'projects/class-teacher.html'); await S.tap(T, '구글 계정으로 로그인'); await S.tap(T, '새 수업 만들기'); await T.selectOption('#inExp', 'heartrate'); await T.waitForTimeout(300);
        note('수업 만들기에 데이터 가공 실험실이 있는가', await T.evaluate(() => [...document.getElementById('inExp').options].map(o => o.textContent).filter(t => /가공|심박/.test(t))));
        await S.tap(T, '수업 만들기', 'last'); await T.waitForTimeout(600); const link = await T.getAttribute('#outLink', 'href');
        await S.tap(T, '진행 보기'); await T.evaluate(() => scrollTo(0, 0)); await S.shot(T, '진행');
        note('진행 화면 윗줄 단추(단계 열기·발표 보기가 있는가)', (await S.buttons(T)).slice(1, 8));
        const L1 = await S.laptop('L1'); await L1.goto(S.local(link) + '#breath-scale=0.2'); await L1.waitForSelector('#cs-cpick:not([hidden])'); await L1.selectOption('#cs-cjo', '1'); await L1.selectOption('#cs-cnum', '1'); await L1.click('#cs-cjoin'); await L1.waitForTimeout(1200);
        await L1.click('#mode-breath'); await L1.waitForTimeout(600); await S.shot(L1, '조1노트북-숨참기', true);
        const href = await L1.getAttribute('a[href*="role=phone"]', 'href');
        const PH = await S.phone('PH', 'Pixel 7'); await PH.goto(S.local(href) + '#breath-scale=0.2'); await PH.waitForTimeout(1500); await S.shot(PH, '폰-처음');
        await PH.click('#cam'); await PH.waitForTimeout(6000);
        await PH.click('#mode-breath'); note('폰 안전 안내', (await S.seen(PH)).split('\n').filter(l => /⚠️|셋 다|앉아|관찰|몸 상태/.test(l)));
        await PH.check('#br-sit'); await PH.check('#br-watch'); await PH.check('#br-ok'); await PH.waitForFunction(() => !document.getElementById('br-start').disabled, null, { timeout: 15000 });
        await PH.click('#br-start'); await PH.waitForFunction(() => document.getElementById('br-phase').textContent === '숨 참기', null, { timeout: 30000 }); await S.shot(PH, '폰-숨참기중');
        await PH.waitForTimeout(3000); await PH.click('#br-stop'); await PH.waitForFunction(() => window.__breath.state().phoneRuns.length === 1, null, { timeout: 40000 }); await PH.waitForTimeout(800);
        await PH.click('#cs-rsend'); await PH.waitForTimeout(3000); await L1.waitForTimeout(5000); await S.shot(L1, '조1노트북-결과', true);
        note('노트북: 동의한 회차 보내기 단추', (await S.seen(L1)).split('\n').filter(l => /동의한 회차|동의하지 않은/.test(l)));
        await T.waitForTimeout(1500); await T.evaluate(() => scrollTo(0, 0)); note('교사 조 카드(학생이 동의하기 전)', (await S.seen(T)).split('\n').slice(15, 22).join(' / '));
        await S.tap(T, '설정'); await S.tap(T, '자료 내려받기');
        const [dl] = await Promise.all([T.waitForEvent('download'), T.click('#btnCsv')]); const csv = fs.readFileSync(await dl.path(), 'utf8').split('\r\n');
        note('교사 CSV(학생이 동의하기 전)', { 열: csv[0], 줄: csv.length - 2, 자료앞: (csv[1] || '').slice(0, 200) });
        const D = await S.laptop('D', { width: 1920, height: 1080 }); await D.goto(S.ROOT + 'projects/data-lab.html'); await D.waitForTimeout(2500); await S.shot(D, '데이터가공-1920');
        const m = () => D.evaluate(() => { const mm = {}; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode())) { const s = t.nodeValue.trim(), p = t.parentElement; if (!s || !p || !p.offsetParent) continue; const f = Math.round(parseFloat(getComputedStyle(p).fontSize)); mm[f] = (mm[f] || 0) + s.length; } const main = document.querySelector('main') || document.body.firstElementChild; const f = Number(Object.keys(mm).sort((a, b) => mm[b] - mm[a])[0]); return '본문 ' + f + 'px = 화면 높이의 ' + (f / innerHeight * 100).toFixed(1) + '% · 내용 폭 ' + Math.round(main.getBoundingClientRect().width / innerWidth * 100) + '%'; });
        const sizes = {}; for (const [n, w, h] of [['4K 200%', 1920, 1080], ['4K 150%', 2560, 1440], ['4K 100%', 3840, 2160]]) { await D.setViewportSize({ width: w, height: h }); await D.waitForTimeout(400); sizes[n] = await m(); }
        note('데이터 가공 실험실을 프로젝터에 띄우면', sizes);
        note('알림 창·오류', S.log.filter(l => l.kind !== 'console'));
    } finally { await S.close(); }
})().catch(e => { console.error(e); process.exit(1); });
