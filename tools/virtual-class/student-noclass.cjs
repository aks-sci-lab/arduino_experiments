// 수업 없이(QR·수업 코드 없이) 연 화면 확인 — 조 공유 칸이 숨겨지는지, 이원화 실험의 폰 → 노트북 짝 연결이 남아 있는지.
//   VC_REPO=<확인할 브랜치 폴더> VC_NPM=… node tools/virtual-class/student-noclass.cjs [그림 폴더]
'use strict';
const { startWorld } = require('./student-lib.cjs');
const PAGES = [['진자 분석', 'projects/pendulum-report.html'], ['말루스', 'projects/malus-law.html'], ['자유낙하', 'projects/free-fall.html'], ['양자점', 'projects/quantum-dot.html'], ['플랑크', 'projects/planck-led.html'], ['이상기체', 'projects/ideal-gas.html'], ['전자기 유도', 'projects/em-induction.html']];
(async () => {
    const W = await startWorld({ shots: process.argv[2] });
    const out = {};
    const look = pg => pg.evaluate(() => {
        const vis = e => e.offsetParent && e.getBoundingClientRect().height > 0;
        const t = [...document.querySelectorAll('button, summary, a, label, input, p, div, span, h2, h3')].filter(vis);
        const has = re => t.filter(e => re.test(e.childElementCount ? (e.tagName === 'BUTTON' || e.tagName === 'SUMMARY' ? e.textContent : '') : (e.textContent || e.placeholder || ''))).map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 50)).filter(Boolean).slice(0, 4);
        return { 조공유: has(/조 공유|새 조 코드|조 코드/), 선생님께: has(/선생님께 보내기|선생님께 내기/), 폰카드: has(/폰으로 측정/), 폰주소: !![...document.querySelectorAll('a[href*="role=phone"], a[href*="pendulum-measure"]')].find(vis), CSV: has(/CSV/), 인쇄: has(/인쇄/), 가로스크롤: document.documentElement.scrollWidth - innerWidth, 화면장: +(document.documentElement.scrollHeight / innerHeight).toFixed(1) };
    });
    const open5 = async (pg, url) => { await pg.goto(url); await pg.waitForTimeout(2000); const b = pg.locator('nav.steps button').filter({ hasText: /데이터|탐구 수행/ }).first(); if (await b.count()) { await b.click().catch(() => {}); await pg.waitForTimeout(1000); } };
    try {
        for (const [name, page] of PAGES) {
            const o = out[name] = {};
            for (const dev of ['laptop', 'phone', 'tablet']) {
                const pg = await W.student(name + '-' + dev, dev);
                await open5(pg, W.ROOT + page); o[dev + ' 5 데이터'] = await look(pg);
                if (dev === 'laptop') {
                    await W.shot(pg, name + ' 노트북 5', true);
                    const s7 = pg.locator('nav.steps button').filter({ hasText: /결론/ }).first(); if (await s7.count()) { await s7.click().catch(() => {}); await pg.waitForTimeout(800); o['laptop 7 결론'] = await look(pg); }
                    // 예전에 조 코드를 만든 적 있는 브라우저: 저장 값에 조 코드가 남은 것처럼 만들고 다시 엶
                    await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (/share|group|class|cs[-:]/i.test(k)) window.__had = (window.__had || []).concat(k); });
                    o['저장 값 열쇠'] = await pg.evaluate(() => Object.keys(localStorage).slice(0, 12));
                }
                await pg.context().close();
            }
        }
    } catch (e) { out['막힘'] = String(e.message).split('\n')[0]; }
    out['오류'] = W.errors; out['알림 창'] = W.dialogs;
    console.log(JSON.stringify(out, null, 1)); await W.close();
})();
