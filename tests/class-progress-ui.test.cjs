// 교사 화면 진행 표시 바로잡기 (2026-11-21, 탄소 양자점 합동 가상 수업에서 나온 것) — 가짜 저장소(tests/fake-lab-store.cjs)
//  ① 노트북과 그 자리의 📱 폰이 번갈아 신호를 보내도 학생 줄에 둘 다 맞게(점 수·제출 유지)
//  ② 조·번호를 바꾼 기기의 옛 자리는 '들어온 학생'에서 빠지고, 다른 기기가 쓰는 자리는 그대로
//  ③ 폰만 가진 학생이 5 데이터로 가서 저장하면 교사 화면 단계·점 수가 바로 바뀜
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
const CC = require('../js/class-cloud.js');
let chromium = null, devices = null; try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg viewBox=\\"0 0 10 10\\"></svg>"}}};';
// 시험용 7단계 실험 페이지 (exp qdot): 단계 바꾸기·측정 저장 단추
const HARNESS = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="../css/lab-base.css"><script src="../js/lab-ui.js"></script><link rel="stylesheet" href="../css/class-share.css"></head>
<body><h1>시험 실험</h1><div id="bar"></div><div id="sh"></div>
<button id="save" class="cs-btn">💾 저장</button><button id="go5" class="cs-btn">5 데이터</button><button id="go7" class="cs-btn">7 결론</button>
<script src="../js/pendulum-config.js"></script><script src="../js/pendulum-cloud.js"></script><script src="../js/lab-store.js"></script><script src="../js/class-cloud.js"></script><script src="../js/class-share.js"></script>
<script>
window.step = 'purpose'; window.mine = [];
window.share = ClassShare.init({ exp: 'qdot', barMount: '#bar', shareMount: '#sh', phone: true,
  getItems: () => mine, getStep: () => step, getPoints: () => mine.length, onIncoming: () => false });
document.getElementById('save').onclick = () => { mine.push({ id: 'run' + (mine.length + 1), title: (mine.length + 1) + '회', n: 5, summary: { '점': 5 }, data: { a: [1, 2] } }); share.saved(); };
document.getElementById('go5').onclick = () => { step = 'data'; share.stepChanged(); };
document.getElementById('go7').onclick = () => { step = 'conclusion'; share.stepChanged(); };
</script></body></html>`;

test('교사 화면 진행 표시: 노트북+폰 합치기 · 옛 자리 치우기 · 폰만 가진 학생', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        if (u.pathname === '/projects/_t.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(HARNESS); }
        const p = path.join(REPO, decodeURIComponent(u.pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const open = async (opt, name) => {
        const c = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opt || {}));
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: QR }));
        await c.route(/gstatic/, r => r.abort());
        const pg = await c.newPage(); pg.on('pageerror', e => errors.push(name + ': ' + e.message)); pg.on('dialog', d => d.accept()); return pg;
    };
    const status = async () => { const r = await app.post({ action: 'classStatus', space: c.space }); assert.equal(r.ok, true, r.error); return r; };
    const until = async (fn, msg) => { for (let i = 0; i < 60; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } assert.fail(msg); };
    const seat = (st, jo, num) => st.students.find(x => x.jo === jo && x.num === num);
    const join = async (pg, jo, num) => {
        await pg.waitForSelector('#cs-cpick:not([hidden])');
        await pg.selectOption('#cs-cjo', String(jo)); await pg.selectOption('#cs-cnum', String(num)); await pg.click('#cs-cjoin');
        await pg.waitForSelector('#cs-cjoined:not([hidden])');
    };
    const c = await app.post({ action: 'createClass', ban: 2, nStudents: 9, groupSize: 3, exp: 'qdot' });
    assert.equal(c.ok, true, c.error);
    const Q = '?c=' + c.classCode + '&s=' + c.space;
    try {
        // ---- ① 1조 1번: 노트북 + 그 자리의 📱 폰 ----
        const L = await open({}, 'L');
        await L.goto(ROOT + 'projects/_t.html' + Q);
        await join(L, 1, 1);
        await L.click('#go7');
        await until(async () => (seat(await status(), 1, 1) || {}).step === 'conclusion', '노트북 단계');
        const plink = await L.evaluate(() => share.phoneLink());
        assert.match(plink, /role=phone&group=2-1-\d{4}&s=c[a-z0-9]{23}&c=2-\d{4}&jo=1&num=1/);
        const P = await open(devices['iPhone 13'], 'P');
        await P.goto(plink.replace(/^https?:\/\/[^/]+\//, ROOT));
        await P.waitForSelector('.cs-phone');
        for (let i = 0; i < 3; i++) await P.click('#save');
        await P.click('#cs-rsend');
        await P.waitForFunction(() => /보냈어요/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 15000 });
        // 노트북이 다시 신호 (예전에는 여기서 폰 신호를 덮어써 '점 0'·✅ 없음)
        await L.evaluate(() => share.beat(true));
        await new Promise(r => setTimeout(r, 400));
        let st = await status();
        let s11 = seat(st, 1, 1);
        assert.equal(st.students.filter(x => x.jo === 1 && x.num === 1).length, 1, '한 학생 줄');
        assert.equal(s11.step, 'conclusion', '노트북 단계 그대로');
        assert.match(String(s11.phone && s11.phone.step), /^phone-/, '폰 단계도');
        assert.equal(s11.points, 3, '점 수는 큰 쪽(폰 3)');
        assert.equal(s11.submitted, true, '폰이 낸 것이 지워지지 않음');

        // ---- ② 조·번호 바꾸기 ----
        // A 가 2조 2번을 잘못 고름, 그 뒤 B 도 같은 자리를 고름(마지막에 쓴 기기 = B) → A 가 옮겨도 B 의 자리는 남음
        const A = await open(devices['iPhone 13'], 'A');
        await A.goto(ROOT + 'projects/_t.html' + Q); await join(A, 2, 2);
        const B = await open(devices['Galaxy Tab S4'], 'B');
        await B.goto(ROOT + 'projects/_t.html' + Q); await join(B, 2, 2);
        await until(async () => !!seat(await status(), 2, 2), '2조 2번');
        await A.click('#cs-cchange'); await join(A, 3, 1);
        // C 가 2조 1번을 잘못 골랐다가 3조 2번으로 → 옛 자리 치움
        const C = await open({ viewport: { width: 375, height: 800 } }, 'C');
        await C.goto(ROOT + 'projects/_t.html' + Q); await join(C, 2, 1);
        await until(async () => !!seat(await status(), 2, 1), '2조 1번');
        await C.click('#cs-cchange'); await join(C, 3, 2);
        await until(async () => { const x = await status(); return !seat(x, 2, 1) && !!seat(x, 3, 2) && !!seat(x, 3, 1); }, '옛 자리 치움·새 자리');
        st = await status();
        assert.ok(seat(st, 2, 2), '다른 기기(B)가 쓰는 2조 2번은 그대로');
        const sum = CC.summarize(st);
        assert.equal(sum.joined, 4, '들어온 학생 = 1-1(노트북+폰 한 사람) · 2-2(B) · 3-1(A) · 3-2(C), 유령 자리 없음: ' + JSON.stringify(st.students.map(x => x.jo + '-' + x.num)));

        // ---- ③ 폰만 가진 학생(A, 수업 QR 로 연 폰): 5 데이터로 가서 저장 → 교사 화면 단계·점 수 ----
        await A.click('#go5');
        await A.click('#save');
        await until(async () => { const x = seat(await status(), 3, 1); return x && x.step === 'data' && x.points === 1; }, '폰만 가진 학생: 5 데이터 · 점 1 이 교사 화면에');

        // ---- 교사 화면 학생 줄 ----
        const T = await open({}, 'T');
        await T.goto(ROOT + 'projects/class-teacher.html');
        await T.click('#btnLogin');
        await T.waitForSelector('#classList .ct-cls');
        await T.click('#classList button[data-open="' + c.space + '"]'); await T.click('#btnToRun'); await T.waitForFunction(() => !document.getElementById('runPane').hidden || !document.getElementById('presentPane').hidden); if (await T.isVisible('#btnPExit')) await T.click('#btnPExit'); await T.waitForSelector('#runPane:not([hidden])');
        await T.waitForFunction(() => /점 3/.test((document.getElementById('groups') || {}).textContent || ''), null, { timeout: 15000 });
        const g = await T.textContent('#groups');
        assert.match(g, /7 결론 · 📱[^·]*· 점 3 · ✅/, '노트북 단계 · 폰 단계 · 점 · 제출이 함께: ' + g.replace(/\s+/g, ' ').slice(0, 300));
        assert.match(await T.textContent('#watchSum'), /들어온 학생\s*4 \/ 9/);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
