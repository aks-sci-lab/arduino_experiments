// 필름통 로켓 5차 — 학생(가족) 세션이 팀 폰으로 '사람처럼' 재는 도우미. 화면 id 를 보고 보이는 단추만 누른다.
//   걸음 안에서는 R 로 바로 씀 (live.cjs 가 넘겨 줌)
//                 return await R.run1(S, pg.A, [{ v: 0, s: 12.4 }, { v: 0, s: 15.1 }, { v: 0, s: 13.2 }, { v: 1, s: 18.3 }, ...]);
//   v: 0 = 계획의 ①, 1 = ②, 'same' = 방금 잰 값으로 한 번 더, '+1'·'-1' = 조건 화면에서 지금 값에서 + / − 한 번 (계획에 없는 셋째 값)
//   1차시 s = 초(⏱ 초시계로, 실제로 그만큼 기다림), 2차시 pct = 아이 키의 % (🎥 녹화 → 세 곳) 또는 hand = 'high'|'same'|'low' (👀 눈으로)
// 돌려주는 것: 한 번마다 { 잰 것, 결과 화면 글 } + 지나간 화면 id 목록 + 막힘(같은 화면에 5번 머묾 → 멈추고 그 화면 글·단추)
'use strict';

async function goMeasure(S, pg, part, want, log, opt) {
    opt = opt || {};
    const seen = [];
    for (let g = 0; g < 14; g++) {
        const id = await S.screen(pg);
        seen.push(id);
        if (seen.filter(x => x === id).length > 4) return { stuck: await S.scr(pg, 600), seen };
        if (part === 't1' && /^t1-(ch-)?measure$/.test(id)) return { seen };
        if (part === 't2' && /^t2-(film|measure|hand)$/.test(id)) return { seen };
        if (/^t[12]-safe$/.test(id)) { await S.safe(pg); await S.forward(pg); continue; }
        if (/^t[12]-again$/.test(id) || id === 't2-intro' || id === 't1-intro') { await S.forward(pg); continue; }
        if (/^t[12]-(ch-)?cond$/.test(id)) {
            if (opt.to) {   // 도전: 조건 화면 값을 그 글(예: '10 mL', '½ 알')이 될 때까지 − 먼저, 없으면 +
                const val = () => pg.textContent('.ev-stepper:not(.locked) .ev-sval').then(t => t.trim());
                for (let i = 0; i < 12 && (await val()) !== opt.to; i++) { const before = await val(); await S.condStep(pg, -1); if ((await val()) === before) break; }
                for (let i = 0; i < 24 && (await val()) !== opt.to; i++) await S.condStep(pg, 1);
                if ((await val()) !== opt.to) return { stuck: await S.scr(pg, 600), seen, note: '조건 값을 ' + opt.to + ' 로 못 맞춤' };
            } else if (typeof want === 'number') {
                const chip = pg.locator('[data-pick-plan="' + want + '"]');
                if (await chip.count()) { await chip.click(); await pg.waitForTimeout(250); }
            } else if (typeof want === 'string' && /^[+-]\d+$/.test(want)) await S.condStep(pg, Number(want));
            else if (opt.steps) await S.condStep(pg, opt.steps);
            const t = await S.forward(pg);
            if (!t) return { stuck: await S.scr(pg, 600), seen };
            continue;
        }
        if (/^t[12]-result$/.test(id)) {   // 결과 화면: 같은 값이면 '같은 조건으로 한 번 더', 다른 값이면 '정해 둔 ②'·'바꿔서'
            const last = await pg.evaluate(p => { const s = window.__filmRocket.state()[p]; const r = s.trials[s.trials.length - 1]; return { v: r && r.value, plan: s.plan }; }, part);
            const wantVal = typeof want === 'number' && last.plan ? last.plan[want] : null;
            if ((want === 'same' || (wantVal != null && wantVal === last.v)) && await pg.isVisible(part === 't2' ? '#ev-again2' : '#ev-again')) { await pg.click(part === 't2' ? '#ev-again2' : '#ev-again'); await pg.waitForTimeout(600); continue; }
            if (await pg.isVisible('#ev-change')) { await pg.click('#ev-change'); await pg.waitForTimeout(600); continue; }
            return { stuck: await S.scr(pg, 600), seen };
        }
        if (/^t[12]-more$/.test(id) || /^t[12]-(graph|why)$/.test(id)) { await S.forward(pg); continue; }
        if (/^t[12]-challenge$/.test(id)) { await S.forward(pg); continue; }   // '도전하기 →'
        if (/^t[12]-ch-result$/.test(id)) { const b = pg.locator('[data-go="' + part + '-ch-cond"]'); if (await b.count()) { await b.click(); await pg.waitForTimeout(600); continue; } }
        if (id === 'wait' || id === 'sent') return { stuck: await S.scr(pg, 400), seen, note: '👀 대기 — 선생님이 측정 장을 띄워야 해요' };
        return { stuck: await S.scr(pg, 600), seen };
    }
    return { stuck: await S.scr(pg, 600), seen };
}

// 1차시: trials 를 차례로 (같은 값 반복·② 로 가기는 결과 화면 단추로)
async function run1(S, pg, trials) {
    const out = [];
    for (const t of trials) {
        const g = await goMeasure(S, pg, 't1', t.v, out);
        if (g.stuck) { out.push({ 막힘: g.stuck, 지나간: g.seen, 메모: g.note }); break; }
        const r = await S.stopwatch(pg, t.s);
        out.push({ 잰것: t.s + '초', 지나간: g.seen, 결과: r.글.slice(0, 260) });
    }
    out.push({ 쟀던값: await pg.evaluate(() => window.__filmRocket.state().t1.trials.map(x => x.value + ':' + x.y)) });
    return out;
}
// 2차시: shots 를 차례로 (pct = 🎥, hand = 👀)
async function run2(S, pg, shots) {
    const out = [];
    for (const t of shots) {
        const g = await goMeasure(S, pg, 't2', t.v, out);
        if (g.stuck) { out.push({ 막힘: g.stuck, 지나간: g.seen, 메모: g.note }); break; }
        let r;
        if (t.hand) r = [t.hand, await S.hand(pg, t.hand)];
        else r = await S.launch(pg, t.pct);
        out.push({ 잰것: t.hand ? '👀 ' + t.hand : t.pct + '%', 지나간: g.seen, 결과: (r[1].글 || '').slice(0, 260), 표시: typeof r[0] === 'string' ? r[0] : '' });
    }
    out.push({ 쟀던값: await pg.evaluate(() => window.__filmRocket.state().t2.trials.map(x => x.value + ':' + x.pct + (x.method === 'hand' ? '(눈)' : ''))) });
    return out;
}
// 🎯 도전 (선생님이 도전 장을 띄운 동안): to = 고를 조건 글(예 '10 mL'), 1차시 s 초 / 2차시 pct 또는 hand
async function challenge(S, pg, part, o) {
    const g = await goMeasure(S, pg, part, null, [], { to: o.to, steps: o.steps || 0 });
    if (g.stuck) return { 막힘: g.stuck, 지나간: g.seen, 메모: g.note };
    let r;
    if (part === 't1') r = await S.stopwatch(pg, o.s);
    else r = o.hand ? await S.hand(pg, o.hand) : (await S.launch(pg, o.pct))[1];
    // 도전 장면 확인 화면이 나오면 (얼굴 가리기를 쓴 폰만) 그 화면 글을 그대로 돌려줌 — 누를지는 인물이 정함
    return { 지나간: g.seen, 결과: r.글.slice(0, 400), 단추: r.단추 };
}
// 차례마다 팀 폰 화면 한 줄씩 (사람이 폰을 들여다보는 것)
async function glance(S, pages, n) {
    const o = {};
    for (const k of Object.keys(pages)) { try { const r = await S.scr(pages[k], n || 260); o[k] = r.화면 + ' | ' + r.글 + ' | 단추: ' + r.단추.join(' · '); } catch (e) { o[k] = '못 봄: ' + e.message; } }
    return o;
}
module.exports = { run1, run2, challenge, glance, goMeasure };
