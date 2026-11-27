// 필름통 로켓 합동 가상 수업 5차 뒤 고침 (판정 docs/virtual-class/scenario/film-rocket5-verdict.md, 선생님 '상·중 모두 고치고 2차시만 재확인')
//  상 1 🛠 만들기를 못 끝낸 팀: 다음 장에서도 '🛠 마저 만들기' → 만들기 화면 → 다 만들면 지금 장으로 · 교사 📋 진행 상황 '🛠 만들기 미완'
//  상 2 🎬 발표 화면 🏆 결과판: 순위·점수 없이 팀마다 한 줄(바꾼 것 → 우리 숫자 · 도전), 같은 바꿀 것끼리, 6팀이 4K 100/150/200 % 한 화면
//  상 3 답 모음(6팀) 글자 ≥ 화면 높이 2 %, 보기 글 줄임표 없음
//  상 4 🖼 결과 카드 장 = 폰 결과 카드, 설명을 닫으면 결과 카드 그대로 (정리 퀴즈 처음부터 다시 풀지 않음)
//  중 1·2 줄인 팀: 계획 ① → ② 차례·'줄였더니', 흔들림은 ① · ② 끼리 · 중 3 놓친 퀴즈 한 번 · 중 4 도전 화면 결과 표·결과판 ❌
//  중 5 2차시 첫 진입은 조건으로·안전 한 번 · 중 7 수업 중 ⭐ 숨김
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
const M = require('../js/film-rocket-math.js');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';
const SHOTS = process.env.CLASS5_SHOTS || '';

test('5차 중 1·2: 계획 ① → ② 차례·줄였더니·흔들림은 ① · ② 끼리, 요약 값 가짓수·만들기', () => {
    const d = M.vars2().fins;
    assert.equal(M.planVerb(d, [3, 0]), '줄였더니'); assert.equal(M.planVerb(d, [0, 3]), '늘렸더니'); assert.equal(M.planVerb(d, null), '바꿨더니');
    assert.equal(M.planVerb(M.vars2().nose, ['point', 'round']), '바꿨더니', '모양은 바꿨더니');
    // 날개 3 → 0 (줄임), 셋째 값 2 는 따로: 결과판 증거·흔들림은 3 · 0 끼리
    const p = { changed: 'fins', plan: [3, 0], trials: [{ value: 3, pct: 80 }, { value: 3, pct: 84 }, { value: 0, pct: 70 }, { value: 0, pct: 72 }, { value: 2, pct: 90 }] };
    const ev = M.evidence('t2', p, {});
    assert.match(ev.text, /3장 → 0장 → 2장 로 줄였더니/);
    assert.equal(ev.short, '날개 수 3장→0장: 82%→71%');
    const rows = M.byValue(p.trials.map(t => ({ value: t.value, y: t.pct })), d, p.plan);
    assert.deepEqual(rows.map(r => r.value), [3, 0, 2]);
    const sp = M.spread(rows, p.plan);
    assert.deepEqual([sp.pair, sp.verdict], [[3, 0], 'clear']);
    // 온도 20 → 30 (겹침) + 40: 예전에는 20 ↔ 40 으로 '말할 수 있어요' → 이제 20 ↔ 30 '겹쳐요'
    const q = { changed: 'temp', plan: [20, 30], trials: [{ value: 20, y: 14 }, { value: 20, y: 12 }, { value: 30, y: 13 }, { value: 30, y: 11.5 }, { value: 40, y: 8 }] };
    const r2 = M.byValue(q.trials, M.vars1().temp, q.plan);
    assert.equal(M.spread(r2, q.plan).verdict, 'overlap');
    assert.equal(M.spread(r2).verdict, 'clear', '계획이 없으면 예전처럼 처음·끝');
    const sm = M.summary({ quiz: {}, think: {}, t1: q, t2: { trials: [] }, build: { done: false } }, {});
    assert.equal(sm['값 가짓수'], '3·0'); assert.equal(sm['만들기'], 0);
    assert.ok(Object.keys(M.summary({ quiz: {}, think: {}, t1: q, t2: p, build: { done: true }, media: { t1: 'v' }, guess: {}, concl: {} }, {})).length <= 20);
});

test('5차 상 1~4 · 중 3~7: 폰(iPhone 13) · 교사 발표 화면(4K)', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const ctx = async (opt, name, teacher) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : '' }));
        await c.route(/gstatic/, r => r.abort());
        await c.addInitScript(t => { if (t) localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); }, !!teacher);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept());
        return pg;
    };
    const go = (pg, id, t) => pg.waitForSelector('#ev-app[data-screen="' + id + '"]', { timeout: t || 15000 }).catch(async e => { throw new Error(id + ' 기다림, 지금 ' + await pg.getAttribute('#ev-app', 'data-screen') + ' · ' + errors.join(' / ')); });
    const title = T => T.evaluate(() => (document.querySelector('#pSlides .ls-title') || {}).textContent || '');
    const toSlide = async (T, re) => { for (let k = 0; k < 25 && !re.test(await title(T)); k++) { await T.keyboard.press('ArrowRight'); await T.waitForTimeout(150); } assert.match(await title(T), re); };
    const join = async (url, name, dev) => { const P = await ctx(devices[dev || 'iPhone 13'], name); await P.goto(url); await go(P, 'enter'); await P.fill('#ev-name', name); await P.click('#ev-start'); await P.waitForFunction(() => !/^(enter)?$/.test(document.getElementById('ev-app').dataset.screen || '')); return P; };
    try {
        // ===== 1차시 (단계 2까지 연 수업) =====
        const c = await app.post({ action: 'createClass', ban: 5, mode: 'team', nTeams: 6, exp: 'rocket', stage: 2 });
        const url = ROOT + 'projects/film-rocket.html?c=' + c.classCode + '&s=' + c.space;
        const A = await join(url, '별빛가족');
        const T = await ctx({ viewport: { width: 1920, height: 1080 } }, 'T', true);
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
        await T.waitForSelector('#pSlides .ls-title');
        // 중 3: gas 장 풀이가 열린 뒤 들어온 팀(F)은 다음 응답 장(계획) 앞에 gas 퀴즈를 한 번 (늦게 골라 5점)
        await toSlide(T, /펑/); await go(A, 'q-gas'); await A.click('.ev-choice[data-k="ok"]'); await go(A, 'sent');
        await T.keyboard.press('ArrowRight');   // 풀이
        await T.waitForFunction(() => document.querySelector('#pSlides .ls-slide').dataset.revealed === '1');
        await T.keyboard.press('ArrowRight');   // 안전 장 (응답 아님)
        const F = await join(url, '늦은가족');
        await go(F, 'wait');
        await toSlide(T, /우리 팀 실험 계획/);
        await go(F, 'q-gas');
        await F.click('.ev-choice[data-k="ok"]');
        await go(F, 'q-control');
        assert.equal(await F.evaluate(() => window.__filmRocket.state().quiz.gas.late), true, '늦게 고름 = 5점');
        await F.click('.ev-choice[data-k="ok"]');
        // 중 7: 수업(설명 화면을 쓰는 반)에서는 ⭐ 점수 숨김
        assert.equal(await F.isVisible('#ev-score'), false);
        // 계획: A 는 온도 30 → 20 으로 줄임 + 예측
        await go(A, 'q-control'); await A.click('.ev-choice[data-k="ok"]'); await go(A, 't1-var');
        await A.click('.ev-choice[data-k="temp"]'); await A.waitForSelector('[data-plan-slot="1"]');
        await A.click('[data-plan-slot="0"] [data-pm="1"]'); await A.click('[data-plan-slot="1"] [data-pm="-1"]'); await A.click('[data-plan-slot="1"] [data-pm="-1"]');
        assert.deepEqual(await A.evaluate(() => window.__filmRocket.state().t1.plan), [30, 10]);
        await A.click('[data-guess] [data-dir="up"]'); await A.click('#ev-plan-send'); await go(A, 'sent');
        // 측정 장: 이미 계획했으면 안전 → 조건 (중 5 의 1차시 쪽도 '이어서 · 0번' 없음), 측정 화면에도 ⭐ 숨김
        await toSlide(T, /이제 폰으로 재요/);
        await go(A, 't1-safe'); for (const k of ['goggle', 'face', 'away', 'wait']) await A.check('[data-safe="' + k + '"]');
        await A.locator('.ev-screen .ev-next[data-go]').last().click(); await go(A, 't1-cond');
        assert.equal(await A.isVisible('#ev-score'), false, '측정 화면에도 점수 숨김');
        // 잰 값 넣기 (30 °C: 9·10, 10 °C: 15·16) → 결과 표·정리 문장은 계획 ① → ② 차례 · '줄였더니'
        await A.evaluate(() => { const s = window.__filmRocket.state(); s.t1.trials = [{ value: 30, y: 9 }, { value: 30, y: 10 }, { value: 10, y: 15 }, { value: 10, y: 16 }]; s.t1.value = 30; });
        await A.evaluate(() => window.__filmRocket.show('t1-graph')); await go(A, 't1-graph');
        assert.match(await A.textContent('#ev-mini'), /30 °C[\s\S]*10 °C/, '표는 ① → ② 차례');
        assert.match(await A.textContent('.ev-spread'), /30 °C과\(와\) 10 °C의 범위가 겹치지 않아요/);
        // 중 4: 도전 장 → 폰 도전 첫 화면에 우리 결과 표
        await toSlide(T, /도전: 목표 시간/);
        await go(A, 't1-challenge');
        assert.match(await A.textContent('#ev-mini-ch'), /30 °C[\s\S]*10 °C/, '도전 화면에 결과 표');

        // ===== 2차시: 🛠 만들기 (상 1) =====
        for (let k = 0; k < 10 && !(await T.isVisible('#pAsk')); k++) { await T.keyboard.press('ArrowRight'); await T.waitForTimeout(150); }
        await T.keyboard.press('Enter');
        await T.waitForFunction(() => /로켓을 만들어요/.test((document.querySelector('#pSlides .ls-title') || {}).textContent || ''), null, { timeout: 20000 });
        await go(F, 't2-build'); await go(A, 't2-build');
        for (const k of ['body', 'fins', 'nose', 'clay']) await A.click('[data-build="' + k + '"]');
        await A.click('#ev-build-done'); await go(A, 'sent');
        await F.click('[data-build="body"]'); await F.click('[data-build="fins"]');   // 두 칸만 하고 장이 넘어감
        await F.evaluate(() => window.__filmRocket.sendNow());
        await T.keyboard.press('ArrowRight');   // '날개와 앞코는 왜?' (look)
        await F.waitForTimeout(800);
        assert.equal(await F.getAttribute('#ev-app', 'data-screen'), 't2-build', '만들던 팀은 장이 넘어가도 만들기 화면 그대로');
        // 만들기 장을 놓치고 들어온 팀(G): 대기 화면에 '🛠 마저 만들기' → 만들기 화면
        const G = await join(url, '번개팀'); await go(G, 'wait');
        assert.equal(await G.isVisible('#ev-build-back'), true, "'🛠 마저 만들기' 단추");
        await G.click('#ev-build-back'); await go(G, 't2-build');
        await G.close();
        // 교사 📋 진행 상황 '챙길 팀'
        await T.click('#btnPExit'); await T.waitForSelector('#runPop:not([hidden]) #rpSum:not([hidden])');
        await T.waitForFunction(() => /늦은가족[^<]*🛠 만들기 미완/.test(document.getElementById('rpCare').textContent), null, { timeout: 25000 });
        await T.keyboard.press('Escape');
        await toSlide(T, /로켓은 왜 솟고/);
        await F.waitForTimeout(800);
        assert.equal(await F.getAttribute('#ev-app', 'data-screen'), 't2-build', '다 만들기 전에는 장이 바뀌어도 만들기 화면');
        await F.click('[data-build="nose"]'); await F.click('[data-build="clay"]'); await F.click('#ev-build-done');
        await go(F, 'q-action');   // 다 만들면 지금 장(쏘는 힘 + 무게)으로

        // 중 5: 2차시 계획 → 측정 장 첫 진입은 '이어서 · 0번' 없이 조건, 안전 체크는 한 번
        await go(A, 'q-action'); await A.click('.ev-choice[data-k="ok"]'); await go(A, 'q-mass'); await A.click('.ev-choice[data-k="ok"]'); await go(A, 'sent');
        await toSlide(T, /우리 팀 실험 계획/);
        await go(A, 't2-var'); await A.click('.ev-choice[data-k="fins"]'); await A.waitForSelector('[data-guess]');
        await A.click('[data-guess] [data-dir="down"]'); await A.click('#ev-plan-send'); await go(A, 'sent');
        await toSlide(T, /이제 폰으로 쏘아요/);
        await go(A, 't2-cond');
        await A.locator('.ev-screen .ev-next[data-go]').last().click(); await go(A, 't2-safe');
        for (const k of ['goggle', 'face', 'away', 'wait']) await A.check('[data-safe="' + k + '"]');
        await A.locator('.ev-screen .ev-next[data-go]').last().click(); await go(A, 't2-film');
        await A.evaluate(() => window.__filmRocket.show('t2-safe')); await go(A, 't2-film');   // 두 번째부터는 안전 체크 없이

        // ===== 상 2·3: 6팀 결과판 · 답 모음 글자 (4K 100/150/200 %) =====
        // 나머지 세 팀 (번개팀은 위에서 폰으로 들어옴): 물의 양 둘 · 발포비타민 하나, 도전 실패도 섞음
        const fams = [['달님가족', '물의 양 10 mL→15 mL: 13초→15초', 0], ['무지개 팀', '조각 크기 통째→가루: 14초→7초', 1], ['로켓 탐험대', '물의 양 5 mL→20 mL: 10초→17초', 0]];
        for (const [i, [n, ev, ok]] of fams.entries()) {
            const r = await app.post({ action: 'teamJoin', 'class': c.classCode, name: n, device: 'f' + i }, { uid: 'fam' + i });
            const jo = r.jo || (r.team && r.team.jo);
            await app.post({ action: 'save', exp: 'rocket', group: c.groups[jo - 1].code, class: c.classCode, space: c.space,
                id: 'fam' + i + '-team', title: n, n: 3, summary: { '팀 점수': 30, '1차시 증거': ev, '2차시 증거': '날개 수 3장→0장: 80%→72%', '시간 도전 차이(초)': ok ? 1 : 4, '시간 도전 성공': ok }, data: '{}', device: 'fam' + i }, { uid: 'fam' + i });
        }
        await T.keyboard.press('Escape');
        await T.click('#btnPBoard');
        await T.waitForSelector('#pPanel:not([hidden]) .ct-pboard');
        await T.waitForFunction(() => document.querySelectorAll('#pPanel .ct-pboard tbody tr').length >= 4, null, { timeout: 25000 });
        const pb = await T.textContent('#pPanel');
        assert.doesNotMatch(pb, /🥇|🥈|🥉|⭐|점수|🔌/, '순위·점수·끊김 없음');
        assert.match(pb, /❌/, '실패 표시');
        const order = await T.$$eval('#pPanel .ct-pboard tbody th', els => els.map(e => e.textContent));
        assert.equal(Math.abs(order.indexOf('달님가족') - order.indexOf('로켓 탐험대')), 1, '같은 바꿀 것(물의 양)끼리 나란히: ' + order);
        assert.equal(order.length, 6, '팀마다 한 줄');
        for (const [w, h] of [[3840, 2160], [2560, 1440], [1920, 1080]]) {
            await T.setViewportSize({ width: w, height: h }); await T.waitForTimeout(300);
            const fit = await T.evaluate(() => { const p = document.getElementById('pPanel'), t = p.querySelector('.ct-pboard'); const rows = [...t.querySelectorAll('tbody tr')]; const pr = p.getBoundingClientRect(); return { inside: rows.every(r => r.getBoundingClientRect().bottom <= pr.bottom + 1), font: parseFloat(getComputedStyle(t.querySelector('td')).fontSize) / innerHeight }; });
            assert.ok(fit.inside, w + ' 결과판 모든 팀이 한 화면');
            assert.ok(fit.font >= 0.02, w + ' 결과판 글자 ' + (fit.font * 100).toFixed(2) + '%');
            if (SHOTS && w === 3840) await T.screenshot({ path: path.join(SHOTS, 'present-board-3840.png') });
        }
        await T.click('#btnPBoard');
        // 상 3: 답 모음(6팀) 글자 ≥ 2 %, 보기 글 줄임표 없음
        for (const [w, h] of [[3840, 2160], [2560, 1440], [1920, 1080]]) {
            await T.setViewportSize({ width: w, height: h });
            const bad = await T.evaluate(() => {
                const def = LessonContent.get('rocket'), box = document.getElementById('pSlides'), A = window.ClassTeacherAnswers, M = window.FilmRocketMath, out = [];
                const teams = [1, 2, 3, 4, 5, 6].map(j => ({ jo: j, name: '팀 이름 ' + j })), data = {};
                teams.forEach((t, j) => { data[t.jo] = { quiz: { action: { picks: ['suck'] }, mass: { picks: ['ok'] }, end_force: { picks: ['ok'] }, end_accel: { picks: ['ok'] }, end_pressure: { picks: ['ok'] } }, t1: { changed: ['water', 'temp', 'tablet', 'piece'][j % 4] }, guess: { t1: { dir: ['down', 'up', 'same'][j % 3], why: '거품이 빨리 나서 그래요' } } }; });
                Object.keys(def.stages).forEach(k => def.stages[k].forEach((sl, i) => {
                    const tl = sl.key && A.tally('rocket', sl.key, teams, data, M); if (!tl || !tl.answered) return;
                    box.innerHTML = LessonSlides.render(sl, false, { i, n: 9 });
                    box.querySelector('.ls-text').insertAdjacentHTML('beforeend', '<div class="ls-answers">' + A.render(tl, false) + '</div>');
                    LessonSlides.fit(box);
                    const s = box.querySelector('.ls-slide');
                    if (s.scrollHeight > s.clientHeight + 1) out.push(sl.key + ' 넘침');
                    box.querySelectorAll('.ls-answers *').forEach(e => { if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < innerHeight * 0.02) out.push(sl.key + ' ' + (e.className || e.tagName)); });
                    box.querySelectorAll('.ls-bar-t').forEach(e => { if (e.scrollWidth > e.clientWidth + 1) out.push(sl.key + ' 줄임'); });
                }));
                return [...new Set(out)];
            });
            assert.deepEqual(bad, [], w + '×' + h);
        }
        await T.setViewportSize({ width: 1920, height: 1080 });

        // ===== 상 4: 결과 카드 장 → 폰 결과 카드, 설명을 닫아도 결과 카드 =====
        for (let k = 0; k < 20 && !(await T.isVisible('#pAsk')); k++) { await T.keyboard.press('ArrowRight'); await T.waitForTimeout(120); }
        await T.keyboard.press('Enter');
        await T.waitForFunction(() => /처음 생각, 지금 생각/.test((document.querySelector('#pSlides .ls-title') || {}).textContent || ''), null, { timeout: 20000 });
        await toSlide(T, /오늘의 결과 카드/);
        await go(A, 'end-card');
        assert.equal(await A.evaluate(() => document.documentElement.classList.contains('ev-answering')), false, '결과 카드는 화면 전체');
        await T.keyboard.press('ArrowRight');   // 마지막 장 다음 → 설명 닫힘
        await A.waitForTimeout(1500);
        assert.equal(await A.getAttribute('#ev-app', 'data-screen'), 'end-card', '설명을 닫아도 결과 카드 (정리 퀴즈 처음부터 아님)');
        assert.equal(await A.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, '375px');
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); api.close(); stat.close();
    }
});
