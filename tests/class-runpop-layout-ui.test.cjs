// 📋 진행 상황 팝업 재배치 (2026-11-23 선생님 "팝업창에서도 정보의 중요성을 판단해서 화면 재배치", 고른 것 '한 화면 두 칸') — Playwright, 가짜 저장소
//  ① 맨 위 요약 한 줄(0 인 도전 성공 등은 안 보임) ② ⚠ 챙길 팀·조가 이름과 함께 ③ 팀·조마다 작은 칸(챙길 팀이 맨 앞)
//  ④ 오른쪽 단계 조작 ⑤ 작은 탭(🏆 결과판·📤 제출·🔧 선생님용) 바꾸기 ⑥ 팝업은 스크롤 없이 한 화면 (1920×1080·4K 100·150·200 %·1280×720)
//  팀 수업(로켓)·조 수업(양자점) 둘 다, 팝업을 닫으면 진행 화면은 예전 그대로
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';
const SIZES = [[1920, 1080], [3840, 2160], [2560, 1440], [1280, 720]];
const SHOTS = process.env.RUNPOP_SHOTS || '';

test('진행 상황 팝업: 요약 → 챙길 팀 → 팀별 칸 · 오른쪽 단계 · 작은 탭, 한 화면', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];
    const c0 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await c0.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
    await c0.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : '' }));
    await c0.route(/gstatic/, r => r.abort());
    await c0.addInitScript(() => localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })));
    const T = await c0.newPage();
    T.on('pageerror', e => errors.push(e.message)); T.on('dialog', d => d.accept());
    const openPop = async () => { await T.click('#btnPExit'); await T.waitForSelector('#runPop:not([hidden]) #rpSum:not([hidden])'); };
    // 팝업이 한 화면에: 상자·본문이 넘치지 않고, 띠·요약·단계 단추가 화면 안
    const oneScreen = async label => {
        const r = await T.evaluate(() => {
            const box = document.querySelector('.ct-runpop-box'), body = document.getElementById('runPopBody'), b = box.getBoundingClientRect();
            // 그 칸 안에서 잘리지 않고(조상 칸이 넘쳐 숨기지 않고) 상자 안에 다 보임
            const inView = id => { const e = document.getElementById(id); if (!e || !e.getClientRects().length) return true; const q = e.getBoundingClientRect();
                if (q.top < b.top - 1 || q.bottom > b.bottom + 1) return false;
                for (let p = e.parentElement; p && p !== box; p = p.parentElement) { const r = p.getBoundingClientRect(); if (q.bottom > r.bottom + 1 || q.top < r.top - 1) return false; }
                return true; };
            return { boxOver: box.scrollHeight - box.clientHeight, bodyOver: body.scrollHeight - body.clientHeight, sx: document.documentElement.scrollWidth - innerWidth,
                sum: inView('rpSum'), next: inView('btnStageNext'), prev: inView('btnStagePrev'), tabs: inView('rpTabs'), care: inView('rpCare') };
        });
        assert.ok(r.boxOver <= 1 && r.bodyOver <= 1, label + ' 팝업 스크롤 없음: ' + JSON.stringify(r));
        assert.ok(r.sum && r.next && r.prev && r.tabs && r.care, label + ' 요약·단계·탭·챙길 팀이 한 화면에: ' + JSON.stringify(r));
        assert.equal(r.sx, 0, label + ' 가로 스크롤');
    };
    try {
        // ---------- 팀 수업 (로켓): 2차시까지 연 수업, 5팀 ----------
        const c = await app.post({ action: 'createClass', ban: 5, mode: 'team', nTeams: 5, exp: 'rocket', stage: 3 });
        const names = ['별빛가족', '우주탐험대', '달님팀', '번개팀', '구름가족'];
        for (const [i, n] of names.entries()) await app.post({ action: 'teamJoin', 'class': c.classCode, name: n, device: 'd' + i }, { uid: 'fam' + i });
        const beat = (i, step, points) => app.post({ action: 'heartbeat', class: c.classCode, space: c.space, jo: i + 1, num: 1, step, points, device: 'd' + i }, { uid: 'fam' + i });
        await beat(0, 't2', 4);        // 2차시 하는 중 — 1차시 값은 한 가지(요약에 값 가짓수 없음 → 🔧 값 안 바꿈)
        await beat(1, 'think-done', 0); // ↩ 앞 단계 (생각 열기)
        await beat(2, 't2-done', 6);   // ⏳ 끝내고 기다림
        await beat(3, 't2-done', 5);
        // 구름가족은 들어왔지만 신호 없음 (팀 자리만)
        for (const jo of [3, 4]) await app.post({ action: 'save', exp: 'rocket', group: c.groups[jo - 1].code, class: c.classCode, space: c.space,
            items: [{ id: 'team', title: names[jo - 1], n: 3, summary: { '팀 점수': 20, '2차시 값 가짓수': 2, '1차시 값 가짓수': 2 }, data: {} }], device: 'd' + (jo - 1) }, { uid: 'fam' + (jo - 1) }).catch(() => {});
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + c.space + '&view=present');
        await T.waitForSelector('#presentPane:not([hidden])');
        await T.waitForFunction(() => /팀/.test(document.getElementById('pJoined').textContent), null, { timeout: 15000 });
        await openPop();
        await T.waitForFunction(() => /들어옴/.test(document.getElementById('rpSum').textContent), null, { timeout: 15000 });
        const sum = await T.textContent('#rpSum');
        assert.match(sum, /들어옴 \d+ \/ 5[\s\S]*⏳ 끝내고 기다림 2[\s\S]*하는 중[\s\S]*↩ 앞 단계 1/, '요약 한 줄: ' + sum);
        assert.doesNotMatch(sum, /도전 성공|🔌/, '0 인 숫자는 안 보임');
        // ② 챙길 팀: 이름과 까닭
        const care = await T.textContent('#rpCare');
        assert.match(care, /우주탐험대[\s\S]*↩ 앞 단계/, '앞 단계에 남은 팀: ' + care);
        // ③ 팀별 칸: 챙길 팀이 맨 앞
        const cells = await T.$$eval('#rpCells .ct-rp-cell', els => els.map(e => ({ t: e.textContent, care: e.classList.contains('care') })));
        assert.equal(cells.length, 5);
        const firstPlain = cells.findIndex(x => !x.care), lastCare = cells.map(x => x.care).lastIndexOf(true);
        assert.ok(lastCare < firstPlain || firstPlain < 0, '챙길 팀이 앞: ' + JSON.stringify(cells));
        // ④ 오른쪽 단계 조작, 칸 순서: 왼쪽(챙길·팀별) | 오른쪽(단계)
        const L = await T.locator('#rpLeft').boundingBox(), S = await T.locator('#stageCard').boundingBox();
        assert.ok(L.x + L.width <= S.x + 1, '단계 조작이 오른쪽');
        assert.match(await T.textContent('#stageCard'), /2차시/);
        // ⑤ 작은 탭: 🏆 결과판 → 표, 🔧 선생님용 → 예비 실험 값, 다시 누르면 접힘
        assert.equal(await T.isVisible('#boardCard'), false, '탭을 누르기 전엔 결과판 안 보임');
        await T.click('#rpTabs [data-rptab="board"]'); await T.waitForSelector('#boardCard .ct-board', { state: 'visible' });
        await T.click('#rpTabs [data-rptab="teach"]');
        assert.equal(await T.isVisible('#boardCard'), false); assert.equal(await T.isVisible('#rpTeach #setupTeach'), true, '예비 실험 값은 🔧 선생님용 탭');
        await T.click('#rpTabs [data-rptab="teach"]'); assert.equal(await T.isVisible('#rpTeach'), false, '다시 누르면 접힘');
        // ⑥ 한 화면 (탭을 펼친 채로도)
        await T.click('#rpTabs [data-rptab="board"]');
        for (const [w, h] of SIZES) {
            await T.setViewportSize({ width: w, height: h }); await T.waitForTimeout(250);
            await oneScreen('팀 ' + w + '×' + h);
            if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'runpop-team-' + w + '.png') });
        }
        await T.setViewportSize({ width: 1920, height: 1080 });
        // 팝업의 ▶ 다음 단계 = 단계 열기 + 발표 화면도 그 단계 설명 첫 장
        await T.click('#btnStageNext');
        await T.waitForFunction(() => /모든 단계 열림/.test(document.getElementById('stageNow').textContent), null, { timeout: 15000 });   // 마지막 단계(정리)를 열면 '모두 열림'
        assert.ok(app.db.docs.get('labClasses/' + c.space).stage >= 4, '마지막 단계까지 열림');
        // 닫으면 진행 화면 요소는 제자리, 팝업 전용 칸은 숨김
        await T.keyboard.press('Escape');
        assert.equal(await T.evaluate(() => { const p = document.getElementById('runPane'); return !p.closest('#runPop') && !p.classList.contains('in-pop') && document.getElementById('rpSum').hidden && !!document.querySelector('#boardCard #setupTeach'); }), true, '닫으면 제자리');
        await T.waitForFunction(() => /정리/.test((document.querySelector('#pSlides .ls-kicker') || {}).textContent || ''), null, { timeout: 15000 });

        // ---------- 조 수업 (양자점) ----------
        const q = await app.post({ action: 'createClass', ban: 2, nStudents: 6, groupSize: 2, exp: 'qdot', stage: 2 });
        const qb = (jo, num, step, uid) => app.post({ action: 'heartbeat', class: q.classCode, space: q.space, jo, num, step, points: 2, device: 'n' + uid }, { uid });
        await qb(1, 1, 'theory', 'a1'); await qb(1, 2, 'purpose', 'a2'); await qb(2, 1, 'theory', 'b1');
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + q.space + '&view=present'); await T.reload();
        await T.waitForSelector('#presentPane:not([hidden])');
        await T.waitForFunction(() => /🧑‍🎓/.test(document.getElementById('pJoined').textContent), null, { timeout: 15000 });
        await openPop();
        await T.waitForFunction(() => /들어온 학생/.test(document.getElementById('rpSum').textContent), null, { timeout: 15000 });
        assert.match(await T.textContent('#rpSum'), /들어온 학생 3 \/ 6[\s\S]*📤 제출한 조 0 \/ 3/);
        assert.match(await T.textContent('#rpCare'), /1조[\s\S]*↩ 2번[\s\S]*3조[\s\S]*아직 아무도/, '챙길 조');
        assert.match(await T.textContent('#rpCellsH'), /조별/);
        const qc = await T.$$eval('#rpCells .ct-rp-cell', els => els.map(e => e.textContent));
        assert.equal(qc.length, 3); assert.match(qc[0] + qc[1], /1조|3조/, '챙길 조가 앞');
        // 조 칸을 누르면 📤 제출 탭에서 그 조 (학생 자세히는 거기서)
        await T.click('#rpCells [data-rpjo="2"]');
        assert.equal(await T.getAttribute('#runPane', 'data-rptab'), 'sub');
        assert.equal(await T.isVisible('#groups .ct-group'), true);
        await T.click('#groups button.ct-mem >> nth=0'); assert.equal(await T.isVisible('#detail'), true, '학생 자세히');
        for (const [w, h] of SIZES) {
            await T.setViewportSize({ width: w, height: h }); await T.waitForTimeout(250);
            await oneScreen('조 ' + w + '×' + h);
            if (SHOTS) await T.screenshot({ path: path.join(SHOTS, 'runpop-groups-' + w + '.png') });
        }
        // 팝업에는 '진행 화면으로 가기' 단추가 없고, 수업 마치기·설정·수업 목록을 바로 조작
        await T.setViewportSize({ width: 1920, height: 1080 });
        assert.equal(await T.locator('#btnRunPopGo').count(), 0, '진행 화면으로 가기 단추 없음');
        await T.click('#btnRunPopDone');
        await T.waitForFunction(() => /마친 수업으로 표시/.test(document.getElementById('runPopMsg').textContent));
        assert.match(await T.textContent('#btnRunPopDone'), /다시 진행 중/);
        await T.click('#btnRunPopDone');
        await T.waitForFunction(() => /다시 진행 중인 수업/.test(document.getElementById('runPopMsg').textContent));
        await T.click('#btnRunPopSet');
        await T.waitForSelector('#viewSettings:not([hidden])');
        assert.equal(await T.isVisible('#runPop'), false, '설정으로 가면 팝업 닫힘');
        await T.click('#btnMain');
        await T.waitForSelector('#presentPane:not([hidden])');
        await openPop();
        await T.click('#btnRunPopList');
        await T.waitForSelector('#viewList:not([hidden])');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); api.close(); stat.close(); }
});
