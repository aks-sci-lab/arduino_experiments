// 수업 없이 연 화면 확인 (둘째): ① 예전 판(main)에서 조 코드를 만든 브라우저로 고친 판을 열어도 조 공유가 숨겨지는지 ② 짝 QR → 폰 → 노트북
//   VC_OLD=<예전 판 폴더> VC_REPO=<고친 판 폴더> VC_NPM=… node tools/virtual-class/student-noclass-2.cjs <임시 폴더> old|new
'use strict';
const fs = require('node:fs'), path = require('node:path');
const dir = process.argv[2], phase = process.argv[3];
if (phase === 'old') process.env.VC_REPO = process.env.VC_OLD;
const { startWorld } = require('./student-lib.cjs');
const PAGES = { 플랑크: 'projects/planck-led.html', 이상기체: 'projects/ideal-gas.html', 전자기유도: 'projects/em-induction.html', 말루스: 'projects/malus-law.html' };
(async () => {
    fs.mkdirSync(dir, { recursive: true });
    const W = await startWorld({ shots: path.join(dir, 'shots'), ports: [47722, 47721] }), out = {};
    const five = async pg => { const b = pg.locator('nav.steps button').filter({ hasText: /데이터/ }).first(); await b.click().catch(() => {}); await pg.waitForTimeout(1000); };
    const share = pg => pg.evaluate(() => [...document.querySelectorAll('summary, button, input')].filter(e => e.offsetParent && /조 공유|새 조 코드|선생님께 보내기|조 코드/.test(e.textContent + (e.placeholder || ''))).map(e => (e.textContent.trim() || e.placeholder).slice(0, 30)));
    try {
        for (const [name, page] of Object.entries(PAGES)) {
            const f = path.join(dir, 'old-' + name + '.json');
            const pg = await W.student(name, 'laptop', phase === 'new' && fs.existsSync(f) ? { storageState: f } : {});
            await pg.goto(W.ROOT + page); await pg.waitForTimeout(2000); await five(pg);
            if (phase === 'old') {
                const before = await share(pg);
                if (!(await pg.getByText('새 조 코드 만들기').locator('visible=true').count())) await pg.locator('summary').filter({ hasText: '조 공유' }).first().click().catch(() => {});
                await W.tap(pg, '새 조 코드 만들기').catch(e => { out[name + ' 조 코드 만들기'] = e.message; }); await pg.waitForTimeout(1500);
                out[name] = { 예전판_조공유: before.length, 만든조코드: await pg.locator('input[placeholder*="2-3-4821"]').first().inputValue().catch(() => '') };
                await pg.context().storageState({ path: f });
            } else {
                out[name] = { 고친판_조공유_보이는것: await share(pg), 저장값에_조코드: await pg.evaluate(() => Object.entries(localStorage).filter(([k, v]) => /\d+-\d+-\d{4}/.test(v)).map(([k]) => k)) };
                await W.shot(pg, name + ' 예전 저장값', true);
            }
        }
        if (phase === 'new') for (const [name, page, phonePage] of [['말루스', 'projects/malus-law.html'], ['진자', 'projects/pendulum-report.html']]) {
            const L = await W.student(name + '짝노트북', 'laptop'), P = await W.student(name + '짝폰', 'phone');
            await L.goto(W.ROOT + page); await L.waitForTimeout(2000); await five(L);
            const u = await L.evaluate(() => { const a = [...document.querySelectorAll('a[href*="role=phone"], a[href*="pendulum-measure"]')].find(e => e.offsetParent); return a ? a.href : ''; });
            await P.goto(u); await P.waitForTimeout(2500);
            if (name === '말루스') { await W.tap(P, '카메라 켜기'); await P.waitForTimeout(2500); await W.tap(P, '측정 기록'); await P.waitForTimeout(4500); await P.evaluate(() => scrollTo(0, 0)); await W.tap(P, '고른 회차 보내기'); }
            else { await W.tap(P, '④ 자료'); await W.tap(P, '시뮬레이션 (폰 없이'); await W.tap(P, '시뮬레이션 데이터 만들기'); await P.waitForTimeout(1500); await W.tap(P, '노트북으로 보내기'); }
            await P.waitForTimeout(3000); await L.waitForTimeout(4000);
            out[name + ' 짝 연결'] = { 폰주소: u.replace(/^https?:\/\/[^/]+\//, '').replace(/s=\w+/, 's=…'), 폰: (await W.text(P)).split('\n').filter(l => /보냈|보냄|연결됨|수업|조 공유|선생님/.test(l)).slice(0, 6), 노트북: (await W.text(L)).split('\n').filter(l => /🆕|새 측정|조 공유|선생님께/.test(l)).slice(0, 5) };
        }
    } catch (e) { out['막힘'] = String(e.message).split('\n')[0]; }
    out['오류'] = W.errors; console.log(JSON.stringify(out, null, 1)); await W.close();
})();
