// 📱 폰 연결(js/class-share.js): 노트북·폰 두 브라우저, 가짜 Apps Script 서버, 수업 있음/없음
const http = require('http'), path = require('path'), fs = require('fs');
const REPO = path.join(__dirname, '..');
const { loadLabStore } = require(REPO + '/tests/fake-lab-store.cjs');
let chromium = null, devices = null;
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const test = require('node:test');
const assert = require('node:assert/strict');
const app = loadLabStore();
const api = http.createServer((req, res) => {
  const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
  const u = new URL(req.url, 'http://x');
    let b = ''; req.on('data', c => b += c); req.on('end', () => app.post(b).then(send));
});
// 시험용 실험 페이지 (exp phoneaccel): 폰이면 '측정 저장' → share.saved()
const HARNESS = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="../css/lab-base.css"><script src="../js/lab-ui.js"></script><link rel="stylesheet" href="../css/class-share.css"></head>
<body style="padding:12px"><h1>시험 폰 실험</h1><div id="bar"></div><div id="pc"></div><div id="sh"></div>
<button id="save" class="cs-btn good">💾 측정 저장</button><p id="role"></p><pre id="got"></pre>
<script src="../js/pendulum-config.js"></script><script src="../js/pendulum-cloud.js"></script><script src="../js/class-cloud.js"></script><script src="../js/class-share.js"></script>
<script>
window.mine = JSON.parse(localStorage.getItem('mine' + location.search.includes('role=phone')) || '[]'); window.got = {}; window.phoneNotes = 0;
window.share = ClassShare.init({ exp: 'phoneaccel', barMount: '#bar', shareMount: '#sh', phone: true, autoSendOnSave: /auto=1/.test(location.search),
  deleteItem: id => { mine = mine.filter(x => x.id !== id); },
  getItems: () => mine, getStep: () => 'live', getPoints: () => mine.length,
  onRole: r => { document.getElementById('role').textContent = 'role=' + r; },
  onPhoneData: n => { phoneNotes += n; },
  onIncoming: items => { const b = JSON.stringify(got); items.forEach(it => { got[it.from + '/' + it.id] = it.data; }); document.getElementById('got').textContent = JSON.stringify(got); return JSON.stringify(got) !== b; } });
if (!share.isPhone()) share.phoneCard('#pc');
document.getElementById('save').onclick = () => { const k = mine.reduce((m, x) => Math.max(m, +x.id.slice(3)), 0) + 1; mine.push({ id: 'run' + k, title: k + '회', n: 50, summary: { '최대 a (m/s²)': 12.3 }, data: { t: [0, 1], a: [9.8, 12.3] } }); localStorage.setItem('mine' + location.search.includes('role=phone'), JSON.stringify(mine)); share.saved(); };
</script></body></html>`;
const stat = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/projects/_phone.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(HARNESS); }
  const p = path.join(REPO, decodeURIComponent(u.pathname));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
});
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"></svg>"}}};';
test('📱 폰 연결: 노트북(1280) QR → 폰(Pixel 7) 저장 → 노트북 자동 추가, 수업 있음/없음', { skip: !chromium && 'playwright 없음', timeout: 180000 }, async () => {
  await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
  const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
  const browser = await chromium.launch(), errors = [];
  async function ctx(opt, name) {
    const c = await browser.newContext(opt);
    await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.LAB_STORE_FAKE_URL=${JSON.stringify(API)};window.PENDULUM_CONFIG={pollSeconds:3};` }));
    await c.route(/qrcode-generator/, r => r.fulfill({ contentType: 'text/javascript', body: QR }));
    await c.route(/gstatic/, r => r.abort());
    const pg = await c.newPage(); pg.on('pageerror', e => errors.push(name + ': ' + e.message)); return pg;
  }
  const check = async (pg, n) => { const ov = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.equal(ov, 0, n + ' 가로 스크롤'); console.log(n, 'overflow', await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    'small', await pg.evaluate(() => [...document.querySelectorAll('button, select, .cs-btn')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim()))); };
  // ---- 1) 수업 없이: 조 공유 칸 없이 '📱 폰으로 측정해 보내기' 카드의 짝 QR (2026-11-20) ----
  const L = await ctx({ viewport: { width: 1280, height: 800 } }, 'L');
  await L.goto(ROOT + 'projects/_phone.html');
  await L.waitForSelector('#pc #cs-cardqr svg', { state: 'attached' });
  assert.equal(await L.locator('#cs-share').count(), 0, '수업 없이: 조 공유 칸 없음');
  const link = await L.getAttribute('#pc a', 'href');
  assert.match(link, /role=phone&group=99-\d+-\d{4}&s=p[a-z0-9]{23}/);
  const GROUP = /group=([\d-]+)/.exec(link)[1];
  console.log('L role:', await L.textContent('#role'), '| link:', link);
  const P = await ctx(devices['Pixel 7'], 'P');
  await P.goto(link);
  assert.equal(await P.textContent('#role'), 'role=phone'); assert.equal(await L.textContent('#role'), 'role=laptop');
  assert.equal(await P.evaluate(() => document.getElementById('cs-share').open), false);
  console.log('P role:', await P.textContent('#role'), '| strip:', (await P.textContent('.cs-phone')).replace(/\s+/g, ' '), '| share open:', await P.evaluate(() => document.getElementById('cs-share').open));
  // 3회 측정 → 목록에 쌓임 (바로 보내지 않음) → 2회 빼고 1·3회만 보내기
  for (let i = 0; i < 3; i++) await P.click('#save');
  assert.equal(await P.locator('.cs-run').count(), 3);
  assert.match(await P.textContent('#cs-rsend'), /3개/);
  await P.reload();   // 새로고침해도 남음
  assert.equal(await P.locator('.cs-run').count(), 3);
  await P.locator('.cs-run input[type=checkbox][data-id=run2]').uncheck();
  await P.locator('.cs-memo[data-id=run3]').fill('손에 들고'); await P.locator('.cs-memo[data-id=run3]').press('Enter');
  await P.locator('.cs-memo[data-id=run3]').blur();
  assert.match(await P.textContent('#cs-rsend'), /2개/);
  await check(P, 'P(Pixel7) 회차 3개');
  await P.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/phone-runs.png' : '/dev/null' }).catch(() => {});
  await P.click('#cs-rsend');
  await P.waitForFunction(() => /보냈|못했/.test(document.getElementById('cs-pmsg').textContent));
  console.log('P sent:', await P.textContent('#cs-pmsg'), '| states:', await P.locator('.cs-rst').allTextContents());
  assert.deepEqual(await P.locator('.cs-rst').allTextContents(), ['✅ 보냄', '보내기 전', '✅ 보냄']);
  await L.waitForFunction(() => document.getElementById('got').textContent.includes('run3'), null, { timeout: 15000 });
  await L.waitForTimeout(300);
  const g1 = JSON.parse(await L.textContent('#got'));
  assert.deepEqual(Object.keys(g1).map(k => k.split('/')[1]).sort(), ['run1', 'run3']);
  assert.ok(Object.keys(g1).every(k => /^📱 폰 /.test(k)));
  const rows = (await app.get({ action: 'list', exp: 'phoneaccel', group: GROUP })).items;
  assert.equal(rows.length, 2); assert.ok(rows.some(r => /3회 · 손에 들고/.test(r.title)));
  console.log('L got 2 rows:', Object.keys(g1), '| titles', rows.map(r => r.title));
  // 2회를 마저 보내면 '새 측정 1개' (이미 보낸 것은 세지 않음)
  await P.locator('.cs-run input[type=checkbox][data-id=run2]').check();
  await P.click('#cs-rsend');
  await L.waitForFunction(() => phoneNotes >= 1 && document.getElementById('got').textContent.includes('run2'), null, { timeout: 15000 });
  await L.waitForFunction(() => /폰에서 새 측정 1개/.test(document.getElementById('cs-cardst').textContent));
  // 전부 다시 보내도 줄 수 그대로 (같은 id 로 고쳐 씀)
  await P.click('#cs-rall'); await P.click('#cs-rsend');
  await P.waitForFunction(() => /측정 3개/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 15000 });
  assert.equal((await app.get({ action: 'list', exp: 'phoneaccel', group: GROUP })).items.length, 3);
  // 보낸 회차 지우기 → 시트에서도 빠짐
  P.once('dialog', d => d.accept());
  await P.click('[data-del=run1]');
  await P.waitForFunction(() => document.querySelectorAll('.cs-run').length === 2);
  await new Promise(r => setTimeout(r, 1500));
  const after = (await app.get({ action: 'list', exp: 'phoneaccel', group: GROUP })).items.filter(r => Number(r.n) > 0);
  assert.deepEqual(after.map(r => r.id.split('-').pop()).sort(), ['run2', 'run3']);
  console.log('after delete run1, sheet rows with data:', after.map(r => r.id));
  // 못 보낸 회차는 체크가 남아 그대로 다시 보내면 됨
  await P.route('**/exec**', r => r.abort());
  await P.click('#save');
  await P.click('#cs-rsend');
  await P.waitForFunction(() => /못했/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 40000 });
  assert.equal(await P.locator('.cs-run input[type=checkbox][data-id=run4]').isChecked(), true);
  assert.match(await P.textContent('#cs-rsend'), /1개/);
  await P.unroute('**/exec**');
  await P.click('#cs-rsend');
  await P.waitForFunction(() => /보냈어요/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 20000 });
  assert.equal(await P.locator('.cs-run input[type=checkbox][data-id=run4]').isChecked(), false);
  console.log('P retry ok:', await P.locator('.cs-rst').allTextContents());
  // ---- 2) 수업 있음 ----
  const c = (await app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 4, exp: 'phoneaccel' }));
  const L2 = await ctx({ viewport: { width: 1280, height: 800 } }, 'L2');
  await L2.goto(ROOT + 'projects/_phone.html?auto=1&c=' + c.classCode);   // 이 실험은 '한 번에 하나' (autoSendOnSave)
  await L2.waitForFunction(() => !document.getElementById('cs-cpick').hidden);
  await L2.selectOption('#cs-cjo', '2'); await L2.selectOption('#cs-cnum', '3'); await L2.click('#cs-cjoin');
  await L2.waitForFunction(() => !document.getElementById('cs-cjoined').hidden);
  console.log('L2 bar phone btn visible:', await L2.isVisible('#cs-cphone'));
  await L2.click('#cs-cphone');
  await L2.waitForSelector('.cs-dlg:not([hidden])');
  const link2 = await L2.getAttribute('#cs-plink', 'href');
  console.log('L2 link:', link2);
  const P2 = await ctx(devices['Pixel 7'], 'P2');
  await P2.goto(link2);
  await P2.waitForFunction(() => !document.getElementById('cs-cjoined').hidden, null, { timeout: 10000 });
  assert.match(link2, /auto=1/); assert.match(link2, /role=phone&group=2-2-\d{4}&s=c[a-z0-9]{23}&c=2-\d{4}&jo=2&num=3/);
  assert.equal(await P2.isHidden('#cs-cpick'), true);
  assert.equal(await P2.locator('#cs-rsend').count(), 0);   // 바로 보내기 방식이면 회차 고르기 없음
  console.log('P2 me:', (await P2.textContent('#cs-cme')).replace(/\s+/g, ' '), '| pick hidden', await P2.isHidden('#cs-cpick'), '| change hidden', await P2.isHidden('#cs-cchange'));
  await P2.click('#save');
  await P2.waitForFunction(() => /보냈|못했/.test(document.getElementById('cs-pmsg').textContent));
  await L2.waitForFunction(() => document.getElementById('got').textContent.includes('📱 폰'), null, { timeout: 15000 });
  console.log('L2 got phone data ✓');
  await check(P2, 'P2(Pixel7)');
  await new Promise(r => setTimeout(r, 800));
  const st = (await app.post({ action: 'classStatus', class: c.classCode, key: c.key }));
  const s = st.students.find(x => x.jo === 2 && x.num === 3);
  // 노트북과 그 자리의 폰은 따로 보내고 교사 화면에서 한 학생으로 합침 (2026-11-21, js/lab-store.js mergeSeats)
  assert.equal(s.step, 'live', '노트북 단계'); assert.equal(s.phone && s.phone.step, 'phone-live', '폰 단계');
  console.log('teacher sees:', s.step, '+', s.phone.step, '→', require(REPO + '/js/class-cloud.js').stepName('phoneaccel', s.phone.step), '| submissions', JSON.stringify(st.submissions[1].labels));
  // 실패 시 다시 보내기
  await P2.route('**/exec**', r => r.abort());
  await P2.click('#save');
  await P2.waitForFunction(() => /못했/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 40000 });
  assert.equal(await P2.isVisible('#cs-presend'), true);
  console.log('P2 fail:', (await P2.textContent('#cs-pmsg')).slice(0, 80), '| resend shown', await P2.isVisible('#cs-presend'));
  assert.deepEqual(errors, []);
  await browser.close(); api.close(); stat.close();
});
