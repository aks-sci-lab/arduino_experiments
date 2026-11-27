// 발표 보기 설명 장 전부를 4K(3840×2160) 배율 100·150·200 % 로 넘기며 넘침·가장 작은 글자를 잼 (수업 전 확인용, 학생 폰 없음).
//   VC_REPO=<claude/rocket-plan-ask 체크아웃> node tools/virtual-class/rocket5/check-4k.cjs [작업 폴더]
// 장마다: 제목 · 풀이 전/뒤 · 넘침(장 칸보다 큰지) · 가장 작은 글자(화면 높이 %, '🔧 선생님용' 표지는 뺌)
'use strict';
const path = require('node:path');
const VC = require('./lib.cjs');
(async () => {
    const S = await VC.start({ dir: path.resolve(process.argv[2] || '/tmp/vc-rocket5-4k'), role: 'teacher' });
    const out = {};
    try {
        const c = await S.app.post({ action: 'createClass', ban: 1, mode: 'team', nTeams: 6, exp: 'rocket', stage: 99 });
        for (const z of [1, 1.5, 2]) {
            const T = await S.teacher({ width: 3840, height: 2160 }, z, 'T' + z);
            await T.goto(S.ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
            await T.waitForSelector('#pSlides .ls-slide', { timeout: 15000 });
            // 맨 첫 장으로 (들어가기 첫 장)
            for (let k = 0; k < 40; k++) { await T.click('#btnPPrev'); await T.waitForTimeout(80); }
            const rows = []; let last = '';
            for (let k = 0; k < 60; k++) {
                const t = await S.title(T), rev = await T.evaluate(() => (document.querySelector('#pSlides .ls-slide') || {}).dataset?.revealed === '1');
                const f = await T.evaluate(() => { let min = 999, at = ''; const box = document.querySelector('#pSlides'); const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); let n;
                    while ((n = w.nextNode())) { const s = n.nodeValue.trim(), p = n.parentElement; if (!s || !p || !p.offsetParent || p.closest('details:not([open])') || p.closest('summary')) continue; const r = p.getBoundingClientRect(); if (r.width === 0) continue;
                        const fs = parseFloat(getComputedStyle(p).fontSize); if (fs < min) { min = fs; at = s.slice(0, 20); } }
                    return { min, at, ratio: +(min / innerHeight * 100).toFixed(2) }; });
                const o = await S.overflow(T);
                const key = t + (rev ? ' (풀이)' : '');
                if (key !== last) rows.push([key, o && o.over ? '넘침 ' + (o.sh - o.ch) + 'px' : '', f.ratio + '%', f.at]);
                last = key;
                await T.click('#btnPNext'); await T.waitForTimeout(450);
                if (await T.isVisible('#pAsk')) { await T.click('#btnPAskYes'); await T.waitForTimeout(800); }
                if ((await S.title(T)) === t && !(await T.evaluate(() => (document.querySelector('#pSlides .ls-slide') || {}).dataset?.revealed === '1')) && rev) break;
                if (k > 2 && (await S.title(T)) === t && (await T.evaluate(() => (document.querySelector('#pSlides .ls-slide') || {}).dataset?.revealed === '1')) === rev) break;   // 마지막 장에서 머묾
            }
            out['배율 ' + z * 100 + '%'] = rows;
            await T.close();
        }
    } catch (e) { out.error = String(e && e.stack || e).slice(0, 1500); }
    finally { console.log(JSON.stringify(out, null, 1)); await S.close(); }
})();
