// 모든 실험 페이지(js/class-cloud.js 의 EXPS + 선생님이 만든 실험)에서 수업 QR 로 들어와 조·번호를 고르면
// 수업 공간으로 진행 신호가 가는지 (가짜 저장소 tests/fake-lab-store.cjs, 375px, 페이지 오류 없음)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
const CC = require('../js/class-cloud.js');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = (cfg && cfg.options) || {}; this.scales = { x: { getPixelForValue: () => 0, getValueForPixel: () => 0 } }; this.chartArea = { left: 0, right: 1, top: 0, bottom: 1 }; } update() {} destroy() {} resize() {} static register() {} }; window.Chart.helpers = { getRelativePosition: () => ({ x: 0, y: 0 }) };';

test('모든 실험: 수업 QR → 조·번호 고르기 → 수업 공간에 진행 신호', { skip: !chromium && 'playwright 없음', timeout: 300000 }, async () => {
    const app = loadLabStore();
    const api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port;
    const browser = await chromium.launch();
    const exps = Object.keys(CC.EXPS).concat(['custom:ohm01']);
    const done = [];
    try {
        for (const exp of exps) {
            const c = await app.post({ action: 'createClass', ban: 3, nStudents: 4, groupSize: 2, exp });
            assert.equal(c.ok, true, exp + ' ' + c.error);
            const url = CC.studentUrl(ROOT, exp, c.classCode, c.space);
            const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
            await ctx.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
            await ctx.route(/cdn\.jsdelivr|cdnjs|unpkg/, r => { const u = r.request().url(); r.fulfill({ contentType: 'text/javascript', body: /chart/i.test(u) && !/plugin/i.test(u) ? CHART_STUB : '' }); });
            await ctx.route(/gstatic|googleapis/, r => r.abort());
            if (exp.startsWith('custom:')) await ctx.addInitScript(() => localStorage.setItem('customLabDef:v1:ohm01', JSON.stringify({ title: '옴의 법칙', description: '', columns: [{ name: 'V' }, { name: 'I' }], questions: [], published: true })));
            const pg = await ctx.newPage(), errors = [];
            pg.on('pageerror', e => errors.push(e.message)); pg.on('dialog', d => d.accept());
            await pg.goto(url);
            await pg.waitForSelector('#cs-cpick:not([hidden])', { timeout: 15000 });
            await pg.selectOption('#cs-cjo', '2'); await pg.selectOption('#cs-cnum', '1'); await pg.click('#cs-cjoin');
            await pg.waitForSelector('#cs-cjoined:not([hidden])');
            for (let i = 0; i < 40 && !app.progress().some(p => p.group === c.groups[1].code); i++) await pg.waitForTimeout(150);
            assert.ok(app.progress().some(p => p.group === c.groups[1].code && p.jo === 2 && p.num === 1), exp + ': 진행 신호');
            assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, exp + ': 375px 가로 스크롤');
            assert.deepEqual(errors.filter(e => !/Chart|chartjs|annotation/i.test(e)), [], exp + ': 페이지 오류');
            done.push(exp);
            await ctx.close();
        }
        assert.equal(done.length, exps.length);
    } finally { await browser.close(); api.close(); stat.close(); }
});
