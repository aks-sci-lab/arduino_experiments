// 교사 화면 🧩 모아 보기 (2026-11-22, 교수 세션 공통 원칙 6) — 계산(Node) + 화면(Playwright, 가짜 저장소)
//  ① 조별 예상·까닭·결과(✅/🤔)·우리 생각·결론 주장·요약 숫자 모으기, 같은 예상끼리 묶음, 같은 조 노트북 여럿이면 나중 것
//  ② 프로젝터 화면에는 아직 못 한 조의 번호가 없음(수만), 교사 노트북 접기에만 어느 조인지
//  ③ 받은 글은 esc, 숫자 하나 → 조별 점 그래프
//  ④ 화면: 진행 화면 '🧩 모아 보기' → 큰 화면(4K 3840×2160 배율 100·150·200%, 1280×720 한 화면), 보고서는 열 때·🔄 에만 읽음
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/class-teacher-gather.js');
const { loadLabStore } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }

const status = {
    groups: [{ jo: 1, code: '2-1-1111' }, { jo: 2, code: '2-2-1111' }, { jo: 3, code: '2-3-1111' }, { jo: 4, code: '2-4-1111' }],
    submissions: [{ code: '2-1-1111', summary: { 'g (m/s²)': 9.6, '점': 12 } }, { code: '2-2-1111', summary: { 'g (m/s²)': 9.9 } }, { code: '2-3-1111', summary: null }, { code: '2-4-1111', summary: null }]
};
const design = (c, p, r, o) => '[바꿀 것] ' + c + '\n[재는 것] g\n[같게 둘 것] 높이\n[예상] ' + p + (r ? '\n[까닭] ' + r : '') + (o ? '\n[결과] ' + o : '');
const reports = [
    { group: '2-1-1111', jo: 1, updatedAt: '2026-11-22T01:00:00Z', sections: { problem: '예전 생각', design: design('공의 무게', '작아진다') } },
    { group: '2-1-1111', jo: 1, updatedAt: '2026-11-22T02:00:00Z', sections: { problem: '무거운 공이 더 빨리 떨어질까?', design: design('공의 무게', '커진다', '무거우니까', '거의 같다'), conclusion: 'g 는 공의 무게와 거의 상관없었다. 둘째 문장은 안 보임.' } },
    { group: '2-2-1111', jo: 2, updatedAt: '2026-11-22T02:10:00Z', sections: { problem: '<img src=x onerror=alert(1)>', design: design('공의 무게', '커진다', '', '커진다'), verdict: '[판정] 지지\n가설과 같았다.' } },
    { group: '2-3-1111', jo: 3, updatedAt: '2026-11-22T02:20:00Z', sections: { design: design('공의 무게', '거의 같다', '중력은 같으니까') } }
];

test('모아 보기 계산: 조별 모음·같은 예상 묶음·결과 ✅/🤔·못 한 조', () => {
    const g = G.gather(status, reports, 'freefall');
    assert.equal(g.total, 4);
    const r1 = g.rows[0];
    assert.equal(r1.think, '무거운 공이 더 빨리 떨어질까?', '같은 조는 나중에 고친 것');
    assert.equal(r1.predict, '커진다'); assert.equal(r1.reason, '무거우니까'); assert.equal(r1.observed, '거의 같다');
    assert.equal(r1.match, 'diff', '예상과 결과가 다름');
    assert.equal(r1.claim, 'g 는 공의 무게와 거의 상관없었다.', '결론 주장은 첫 문장');
    assert.equal(g.rows[1].match, 'same'); assert.equal(g.rows[1].verdict, '지지'); assert.equal(g.rows[1].claim, '가설과 같았다.');
    assert.equal(g.rows[2].match, '', '결과를 안 고른 조');
    assert.deepEqual(g.predicts.map(p => [p.label, p.jos]), [['공의 무게 ↑ → 커진다', [1, 2]], ['공의 무게 ↑ → 거의 같다', [3]]]);
    assert.deepEqual(g.missing, { think: [3, 4], predict: [4], claim: [3, 4] });
    assert.deepEqual(g.keys, ['g (m/s²)', '점']);
    assert.deepEqual(g.rows.map(x => x.nums['g (m/s²)']), [9.6, 9.9, undefined, undefined]);
    // 실험별 숫자
    assert.deepEqual(G.numsOf({ hCurrent: 6.4 }, 'planck'), { 'h (×10⁻³⁴ J·s)': 6.4 });
    assert.deepEqual(G.numsOf({ summary: { L: 0.8, T: 1.79 } }, 'pendulum'), { L: 0.8, T: 1.79 });
    assert.deepEqual(G.numsOf({ summary: { a: '', b: 'x', c: '3' } }, 'freefall'), { c: 3 });
    assert.deepEqual(G.parseTags('[바꿀 것] A\n[예상] 커진다\n덧붙인 글'), { change: 'A', predict: '커진다', reason: '', observed: '', rest: '덧붙인 글' });
});

test('모아 보기 화면 글: 프로젝터에는 못 한 조 번호 없음 · 교사 접기에만 · esc · 점 그래프', () => {
    const g = G.gather(status, reports, 'freefall');
    const pred = G.boardHtml(g, 'predict');
    assert.match(pred, /1조<\/b> <span class="ctg-diff"[^>]*>🤔 결과 거의 같다/);
    assert.match(pred, /✅ 결과 커진다/);
    assert.match(pred, /아직 1개 조가 고르는 중이에요/);
    assert.doesNotMatch(pred, /4조/, '예상 안 고른 4조는 프로젝터에 없음');
    const think = G.boardHtml(g, 'think');
    assert.doesNotMatch(think, /<img/, '받은 글은 esc');
    assert.match(think, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(think, /3조|4조/, '안 쓴 조 번호 없음');
    assert.match(think, /아직 2개 조가 쓰는 중이에요/);
    assert.match(G.boardHtml(g, 'claim'), /<span class="ctg-tag">지지<\/span> 가설과 같았다\./);
    const nums = G.boardHtml(g, 'nums', 'g (m/s²)');
    assert.equal((nums.match(/<circle/g) || []).length, 2, '보낸 두 조만 점');
    assert.match(nums, /평균 9\.75/);
    assert.match(nums, /아직 2개 조가 보내는 중이에요/);
    assert.match(G.teacherHtml(g), /예상 안 고른 조: 4조[\s\S]*우리 생각 안 쓴 조: 3조, 4조/);
    assert.equal(G.dotSvg(g.rows, '없는 칸'), '');
});

test('모아 보기 화면: 진행 화면 → 🖥 모아 보기, 4K·1280×720 한 화면, 🔄 때만 보고서 읽기', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const http = require('node:http');
    const { labServer, configJs } = require('./fake-lab-store.cjs');
    const REPO = path.join(__dirname, '..');
    const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg viewBox=\\"0 0 10 10\\"></svg>"}}};';
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch();
    try {
        const c = await app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 2, exp: 'freefall', stage: 7 });
        const code = j => c.groups[j - 1].code;
        const S = n => ({ uid: 'stu-' + n });
        await app.post({ action: 'reportSave', space: c.space, classCode: c.classCode, group: code(1), sections: { problem: '무거운 공이 더 빨리?', design: design('공의 무게 (공 종류)', '커진다', '무거우니까', '거의 같다'), conclusion: 'g 는 공의 무게와 거의 상관없었다.' } }, S(1));
        await app.post({ action: 'reportSave', space: c.space, classCode: c.classCode, group: code(2), sections: { problem: '<b>굵게</b>', design: design('공의 무게 (공 종류)', '거의 같다', '중력은 같으니까', '거의 같다') } }, S(2));
        for (const [j, gv] of [[1, 9.62], [2, 9.85], [3, 9.4]]) {
            const r = await app.post({ action: 'save', space: c.space, exp: 'freefall', group: code(j), id: 'run-000' + j, device: 'nb0' + j + 'ab', title: j + '회차', n: 12, data: { x: [1] }, summary: { 'g (m/s²)': gv, '점 수': 12 } }, S(j));
            assert.equal(r.ok, true, r.error);
        }
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await ctx.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
        await ctx.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : '' }));
        await ctx.route(/gstatic/, r => r.abort());
        await ctx.addInitScript(() => localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })));
        const T = await ctx.newPage(), errors = [];
        T.on('pageerror', e => errors.push(e.message));
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=run');
        await T.waitForSelector('#gatherCard:not([hidden]) #btnGather', { timeout: 20000 });
        const before = app.calls ? app.calls.length : 0;
        const reportCalls = () => (app.calls || []).filter(x => x.body && x.body.action === 'reportList').length;
        assert.equal(reportCalls(), 0, '열기 전에는 보고서를 읽지 않음');
        await T.click('#btnGather');
        await T.waitForFunction(() => /공의 무게/.test(document.getElementById('gatherBody').textContent));
        assert.equal(reportCalls(), 1, '열 때 한 번');
        const body = await T.textContent('#gatherBody');
        assert.match(body, /🔮 공의 무게 \(공 종류\) ↑ → 커진다 · 1개 조\s*1조 🤔 결과 거의 같다/);
        assert.match(body, /거의 같다[\s\S]*2조[\s\S]*✅ 결과 거의 같다/);
        assert.match(body, /아직 2개 조가 고르는 중이에요/);
        assert.doesNotMatch(body, /3조|4조/, '못 한 조 번호는 프로젝터에 없음');
        await T.click('.ctg-tabs button[data-tab="think"]');
        assert.equal(await T.locator('#gatherBody b:text("굵게")').count(), 0, '받은 글 esc');
        assert.match(await T.textContent('#gatherBody'), /<b>굵게<\/b>/);
        await T.click('.ctg-tabs button[data-tab="nums"]');
        assert.equal(await T.locator('#gatherBody svg circle').count(), 3, '보낸 세 조 점');
        assert.match(await T.textContent('#gatherBody'), /평균 9\.62/);
        // 🔄 로만 다시 읽음
        await T.click('#btnGatherReload');
        await T.waitForFunction(() => /에 모음/.test(document.getElementById('gatherMsg').textContent));
        assert.equal(reportCalls(), 2);
        // 화면 크기: 4K 배율 100·150·200%(= 창 3840·2560·1920) 와 1280×720 에서 한 화면, 가로 넘침 없음
        for (const tab of ['predict', 'nums']) {
            await T.click('.ctg-tabs button[data-tab="' + tab + '"]');
            for (const [w, h] of [[3840, 2160], [2560, 1440], [1920, 1080], [1280, 720]]) {
                await T.setViewportSize({ width: w, height: h });
                if (process.env.GATHER_SHOTS) await T.screenshot({ path: process.env.GATHER_SHOTS + '/' + tab + '-' + w + '.png' });
                const m = await T.evaluate(() => { const b = document.getElementById('gatherBig'); return { sh: b.scrollHeight, ch: b.clientHeight, sw: b.scrollWidth, cw: b.clientWidth, fs: parseFloat(getComputedStyle(b).fontSize) }; });
                assert.ok(m.sh <= m.ch + 1, tab + ' ' + w + '×' + h + ' 세로 한 화면 ' + JSON.stringify(m));
                assert.ok(m.sw <= m.cw + 1, tab + ' ' + w + '×' + h + ' 가로 넘침 없음');
                assert.ok(m.fs >= h * 0.02, tab + ' ' + w + '×' + h + ' 글자 ' + m.fs);
            }
        }
        // 교사 노트북 접기: 어느 조가 아직인지
        await T.click('#btnGatherClose');
        await T.evaluate(() => { document.getElementById('gatherTeach').open = true; });
        assert.match(await T.textContent('#gatherTeachBody'), /예상 안 고른 조: 3조, 4조/);
        assert.deepEqual(errors, []);
        void before;
    } finally {
        await browser.close(); api.close(); stat.close();
    }
});
