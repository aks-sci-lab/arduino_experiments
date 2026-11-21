// 가상 수업(교사 역할) — 7단계 보고서 실험 공통 진행: node tools/virtual-class/teacher-report.cjs <실험 키> [그림 폴더]
//   실험 키: planck · pendulum · malus · freefall · idealgas · eminduction (js/class-cloud.js 의 EXPS)
// 교사(1280×720): 메인 → 수업 진행 화면 → 로그인 → 새 수업(7단계) → 큰 QR → 진행 화면 → 🎬 발표 보기에서 리모컨 → 로 1~7 단계를 끝까지
//   (단계마다 첫 화면을 찍고, 작은 탭 이름·글이 틀 아래로 잘리는지·가장 많이 쓰인 글자 크기를 적음) → 조 카드 → 같은 실험 가설연역 수업을 만들어 단계 이름만 확인.
// 학생(미리 짠 움직임): 조 노트북 L1(1조)·L2(2조)가 참여만 하고, 단계가 열릴 때 L1 이 따라오는지 본다. 5 데이터·7 결론에서 L1 화면 전체를 찍는다.
// 실험마다 다른 측정(센서·카메라)은 여기서 하지 않는다 — 실험별 스크립트·기록에서.
'use strict';
const path = require('node:path');
const VC = require('./teacher-lib.cjs');
const exp = process.argv[2];
if (!exp) { console.error('실험 키를 주세요'); process.exit(1); }

(async () => {
    const S = await VC.start({ shots: process.argv[3] || path.join(process.cwd(), 'vc-shots', exp) });
    const out = { exp };
    const stepOf = pg => pg.evaluate(() => { const b = document.querySelector('nav.steps button[aria-selected="true"]'); return b ? b.innerText.replace(/\s+/g, ' ') : '(단계 탭 없음)'; });
    const join = async (pg, jo, num) => { await pg.waitForSelector('#cs-cpick:not([hidden])', { timeout: 15000 }); await pg.selectOption('#cs-cjo', String(jo)); await pg.selectOption('#cs-cnum', String(num)); await pg.click('#cs-cjoin'); await pg.waitForTimeout(1200); };
    // 발표 화면(iframe) 안의 지금 모습
    const frameInfo = fr => fr.evaluate(() => {
        const tabs = [...document.querySelectorAll('.step-panel:not([hidden]) .subtabs button')].filter(x => x.offsetParent);
        const sel = tabs.filter(x => x.getAttribute('aria-selected') === 'true').map(x => x.innerText.trim()).join('|');
        const m = {}; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
        while ((t = w.nextNode())) { const s = t.nodeValue.trim(), p = t.parentElement; if (!s || !p || !p.offsetParent) continue; const r = p.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue; const f = Math.round(parseFloat(getComputedStyle(p).fontSize)); m[f] = (m[f] || 0) + s.length; }
        const main = Object.keys(m).sort((a, b) => m[b] - m[a])[0];
        const first = document.querySelector('.step-panel:not([hidden])'); const top = first ? Math.round(first.getBoundingClientRect().top) : null;
        return { tab: sel || '(작은 탭 없음)', nTabs: tabs.length, page: document.documentElement.scrollHeight, view: innerHeight, mainFont: main + 'px', panelTop: top,
            hidden: { measure: [...document.querySelectorAll('video, canvas')].filter(e => e.offsetParent).length } };
    });
    try {
        const T = await S.teacher({ width: 1280, height: 720 });
        await T.goto(S.ROOT + 'index.html'); await S.tap(T, '교사'); await S.tap(T, '수업 진행 화면'); await S.tap(T, '구글 계정으로 로그인'); await S.tap(T, '새 수업 만들기');
        await T.selectOption('#inExp', exp); await T.waitForTimeout(300);
        out.preview = await T.evaluate(() => document.getElementById('preview').innerText);
        await S.tap(T, '수업 만들기', 'last'); await T.waitForTimeout(600);
        const link = await T.getAttribute('#outLink', 'href'), stu = S.local(link); out.link = link.replace(/^https?:\/\/[^/]+\//, '');
        out.title = await T.evaluate(() => document.getElementById('outTitle').innerText);
        await S.tap(T, '진행 보기'); await T.evaluate(() => scrollTo(0, 0));
        const L1 = await S.laptop('L1'); await L1.goto(stu); await join(L1, 1, 1); await S.shot(L1, '조1-1목적');
        const L2 = await S.laptop('L2'); await L2.goto(stu); await join(L2, 2, 1);
        out.student = { device: await L1.getAttribute('html', 'data-device'), steps: await L1.evaluate(() => [...document.querySelectorAll('nav.steps button')].filter(b => b.offsetParent).map(b => b.innerText.replace(/\s+/g, ' ') + (b.classList.contains('cs-locked') ? '🔒' : ''))) };

        // 🎬 발표 보기: 리모컨으로 끝까지
        await S.tap(T, '발표 보기'); await T.waitForTimeout(1800); const fr = T.frames()[1];
        out.stages = [];
        for (let st = 1; st <= 7; st++) {
            const top = (await S.seen(T)).split('\n')[0]; await S.shot(T, '발표-' + st);
            const rec = { stage: top, tabs: [], L1: await stepOf(L1) };
            for (let i = 0; i < 20; i++) {
                const fi = await frameInfo(fr); rec.tabs.push(fi.tab + (fi.page > fi.view + 8 ? ' ✂' + fi.page + '/' + fi.view : '')); rec.font = fi.mainFont; rec.panelTop = fi.panelTop; rec.media = fi.hidden.measure;
                await T.keyboard.press('ArrowRight'); await T.waitForTimeout(450);
                if ((await S.seen(T)).split('\n').some(l => /열까요/.test(l))) break;
                if (fi.nTabs === 0 && i > 1) { rec.stuck = '→ 를 눌러도 열까요가 안 나옴'; break; }
            }
            out.stages.push(rec);
            if (st === 7) { await T.keyboard.press('Escape'); break; }
            await T.keyboard.press('Enter'); await T.waitForTimeout(3500);
            if (st === 4) await S.shot(L1, '조1-5데이터', true);
        }
        out.afterAll = (await S.seen(T)).split('\n')[0];
        await L1.waitForTimeout(1500); out.L1end = await stepOf(L1); await S.shot(L1, '조1-7결론', true);
        out.L1concl = (await S.seen(L1)).split('\n').filter(l => /보내기|제출|인쇄|서버|저장/.test(l)).slice(0, 12);
        out.L1data = await L1.evaluate(() => { const b = document.querySelector('nav.steps button[data-step="data"]'); if (b) b.click(); return null; }).then(async () => { await L1.waitForTimeout(800); return (await S.seen(L1)).split('\n').filter(l => /📱|QR|폰|센서|연결|블루투스|직접/.test(l)).slice(0, 10); });
        await S.tap(T, '진행 화면으로'); await T.waitForTimeout(2500); await T.evaluate(() => scrollTo(0, 0)); await S.shot(T, '진행-끝', true);
        out.cards = (await S.seen(T)).split('\n').slice(18, 50).join(' / ').slice(0, 700);
        out.extra = (await S.seen(T)).split('\n').filter(l => /🔬|결과판|🏆/.test(l));

        // 가설연역 수업: 이름·단계 수만
        await S.tap(T, '설정'); await S.tap(T, '수업 만들기·내 수업'); await T.fill('#inBan', '3'); await T.selectOption('#inExp', exp);
        const hd = T.locator('input[value="hd"]'); out.hdOffered = await hd.isVisible();
        if (out.hdOffered) {
            await hd.check(); await S.tap(T, '수업 만들기', 'last'); await T.waitForTimeout(600); const link2 = await T.getAttribute('#outLink', 'href');
            await S.tap(T, '진행 보기'); await T.evaluate(() => scrollTo(0, 0));
            out.hdStages = (await S.seen(T)).split('\n').filter(l => /^(🔒 )?[①②③④⑤⑥]/.test(l));
            const H = await S.laptop('H1'); await H.goto(S.local(link2)); await join(H, 1, 1);
            out.hdStudent = await H.evaluate(() => [...document.querySelectorAll('nav.steps button')].filter(b => b.offsetParent).map(b => b.innerText.replace(/\s+/g, ' ') + (b.classList.contains('cs-locked') ? '🔒' : '')));
            await S.tap(T, '모두 열기'); await H.waitForTimeout(4000); out.hdAfterAll = { locked: await H.locator('nav.steps .cs-locked').count(), step: await stepOf(H) };
            const walk = []; for (const b of await H.locator('nav.steps button').all()) { await b.click(); await H.waitForTimeout(400); walk.push(await H.evaluate(() => { const ps = [...document.querySelectorAll('.step-panel')].filter(p => !p.hidden && p.offsetParent); return ps.map(p => p.dataset.step).join('+') + ' | 쓰기 칸: ' + [...document.querySelectorAll('.rai-inline')].filter(e => e.offsetParent).map(e => e.dataset.sec).join(','); })); }
            out.hdWalk = walk; await S.shot(H, '가설연역-⑥', true);
        }
        out.log = S.log.filter(l => l.kind !== 'console');
        console.log(JSON.stringify(out, null, 1));
    } finally { await S.close(); }
})().catch(e => { console.error(e); process.exit(1); });
