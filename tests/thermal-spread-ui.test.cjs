// 열평형 6 결과: 같은 조건 반복 범위·'차이가 흔들림보다 큰가요?'·비커 메모 칸 화면 시험
//  노트북 1366·폰 375(가로 스크롤 없음·단추 44px), 7단계·가설연역 둘 다, 고2 심화 τ
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const pickVars = require('./vars-pick.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = (cfg && cfg.options) || { scales: { y: { title: {} } } }; } update() {} destroy() {} resize() {} };';
const SHOTS = path.join(REPO, 'docs/screens/thermal-spread');

function run(no, title, meta, h, c, eq, tau) {
    const samples = [];
    for (let t = 0; t <= 300; t += 2) {
        const k = Math.exp(-t / tau);
        samples.push({ t, t1: +(eq + (h - eq) * k).toFixed(2), t2: +(eq + (c - eq) * k).toFixed(2) });
    }
    return { no, title, meta: Object.assign({ m1: 100, liquid1: 'water', m2: 100, liquid2: 'water', vessel: '유리 비커 (열림)', roomT: 22, beakerMat: 'none', cup1Mass: 0, cup2Mass: 0 }, meta), samples, markers: [], at: '2026-11-27T01:00:00Z' };
}
// 하 수준 조 장면: 뚜껑 효과를 보려다 차이가 흔들림 안 / 질량은 반복 1번 / 질량+메모 함께 바뀜
const LID = { vessel: '유리 비커 + 뚜껑' };
const RUNS = [
    run(1, '① 열림 1', {}, 65, 20, 41.0, 30), run(2, '① 열림 2', {}, 65, 20, 42.2, 33),
    run(3, '② 뚜껑 1', LID, 65, 20, 41.8, 52), run(4, '② 뚜껑 2', LID, 65, 20, 42.4, 55),
    run(5, '③ 50g:150g', { m1: 50, m2: 150, vessel: '스티로폼' }, 65, 20, 31.0, 35)
];

test('6 결과 반복 범위·흔들림 판정·메모 칸', { skip: !chromium && 'playwright 없음', timeout: 180000 }, async () => {
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => {
            if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' });
            res.end(d);
        });
    });
    await new Promise(r => stat.listen(0, r));
    const ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    fs.mkdirSync(SHOTS, { recursive: true });
    const open = async (vp, flow, runs, shot) => {
        const c = await browser.newContext({ viewport: vp });
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /chart/i.test(r.request().url()) ? CHART_STUB : '' }));
        await c.route(/gstatic/, r => r.abort());
        await c.addInitScript(([runs, flow]) => {
            localStorage.setItem('thermal-eq:v1', JSON.stringify({ runs, ext: {}, share: null, sent: {} }));
            localStorage.setItem('lab-flow', flow);
        }, [runs, flow]);
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(e.message));
        await pg.goto(ROOT + 'projects/thermal-equilibrium.html?device=laptop');
        await pg.waitForSelector('nav.steps button');
        await pickVars(pg);
        await pg.evaluate(() => LabUI.steps().show('result'));
        await pg.waitForSelector('#repBox tr[data-group]');
        if (shot) await pg.screenshot({ path: path.join(SHOTS, shot), fullPage: true, clip: await pg.evaluate(() => { const r = document.querySelector('[data-step="result"] .card').getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top + scrollY), width: innerWidth, height: Math.min(1600, r.height) }; }) });
        return { c, pg };
    };
    try {
        for (const flow of ['steps', 'hd']) {
            const { c, pg } = await open({ width: 1366, height: 900 }, flow, RUNS, flow === 'steps' ? 'laptop-1366.png' : 'laptop-1366-hd.png');
            if (flow === 'hd') assert.match(await pg.textContent('nav.steps'), /자료 해석/);
            // 묶음 3개: ① 2번 · ② 2번 · ③ 1번
            const groups = await pg.$$eval('#repBox tr[data-group]', trs => trs.map(t => [...t.cells].map(td => td.textContent)));
            assert.equal(groups.length, 3);
            assert.match(groups[0][3], /2번/); assert.match(groups[0][5], /↕ 41\.\d+ ~ 42\.\d+/);
            assert.match(groups[1][2], /뚜껑/); assert.match(groups[2][5], /한 번만/);
            const v = await pg.$$eval('#repBox [data-verdict]', ds => ds.map(d => d.dataset.verdict + '|' + d.textContent));
            assert.equal(v.length, 2);
            assert.match(v[0], /^unclear\|.*비커·단열 메모.*아직 말하기 어려워요/, '뚜껑: 차이 < 흔들림');
            assert.match(v[1], /^norep\|.*같은 조건으로 한 번 더/, '③ 반복 없음');
            assert.equal(await pg.locator('#repBox [data-mix]').count(), 1, '질량+메모 함께 바뀜 ⚠');
            assert.match(await pg.textContent('#repBox [data-mix]'), /물의 질량.*비커·단열 메모/);
            // 표 메모 칸
            assert.match(await pg.textContent('#resTable thead'), /비커·단열 메모/);
            const memo = await pg.$$eval('#resTbody td[data-col="memo"]', ts => ts.map(t => t.textContent));
            assert.deepEqual(memo.slice(0, 3), ['유리 비커 (열림)', '유리 비커 (열림)', '유리 비커 + 뚜껑']);
            // 고2 심화 τ: 열림 ~31 vs 뚜껑 ~53 → 차이가 흔들림보다 큼
            assert.equal(await pg.isVisible('#repTauBox'), false, '심화는 접힘');
            await pg.click('#advPanel summary');
            const tau = await pg.$$eval('#repTauBox [data-verdict]', ds => ds.map(d => d.dataset.verdict));
            assert.equal(tau[0], 'clear', 'τ 는 뚜껑 효과가 보임');
            await c.close();
        }
        // 같은 조건 반복이 없으면 한 줄 안내
        {
            const { c, pg } = await open({ width: 1366, height: 900 }, 'steps', [RUNS[0], RUNS[4]]);
            assert.equal(await pg.locator('#repBox [data-rep-hint]').count(), 1);
            assert.match(await pg.textContent('#repBox [data-rep-hint]'), /같은 조건으로 한 번 더 재 보세요/);
            await c.close();
        }
        // 폰 폭 375: 가로 스크롤 없음, 단추 44px
        {
            const { c, pg } = await open({ width: 375, height: 800 }, 'steps', RUNS, 'phone-375.png');
            const sw = await pg.evaluate(() => document.documentElement.scrollWidth);
            assert.ok(sw <= 375, '가로 스크롤 ' + sw);
            const small = await pg.$$eval('[data-step="result"] button', bs => bs.filter(b => b.offsetParent && b.getBoundingClientRect().height < 44).map(b => b.textContent));
            assert.deepEqual(small, []);
            await c.close();
        }
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        stat.close();
    }
});
