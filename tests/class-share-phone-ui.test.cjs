// 📱 폰 연결(js/class-share.js): 노트북·폰 두 브라우저, 가짜 Apps Script 서버, 수업 있음/없음
const http = require('http'), path = require('path'), fs = require('fs');
const REPO = path.join(__dirname, '..');
const { loadCodeGs } = require(REPO + '/tests/fake-apps-script.cjs');
let chromium = null, devices = null;
try { ({ chromium, devices } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const test = require('node:test');
const assert = require('node:assert/strict');
const app = loadCodeGs();
const api = http.createServer((req, res) => {
  const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
  const u = new URL(req.url, 'http://x');
  if (req.method === 'GET') return send(app.get(Object.fromEntries(u.searchParams)));
  let b = ''; req.on('data', c => b += c); req.on('end', () => send(app.post(b)));
});
// 시험용 실험 페이지 (exp phoneaccel): 폰이면 '측정 저장' → share.saved()
const HARNESS = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="../css/lab-base.css"><script src="../js/lab-ui.js"></script><link rel="stylesheet" href="../css/class-share.css"></head>
<body style="padding:12px"><h1>시험 폰 실험</h1><div id="bar"></div><div id="sh"></div>
<button id="save" class="cs-btn good">💾 측정 저장</button><p id="role"></p><pre id="got"></pre>
<script src="../js/pendulum-config.js"></script><script src="../js/pendulum-cloud.js"></script><script src="../js/class-cloud.js"></script><script src="../js/class-share.js"></script>
<script>
window.mine = []; window.got = {}; window.phoneNotes = 0;
window.share = ClassShare.init({ exp: 'phoneaccel', barMount: '#bar', shareMount: '#sh', phone: true,
  getItems: () => mine, getStep: () => 'live', getPoints: () => mine.length,
  onRole: r => { document.getElementById('role').textContent = 'role=' + r; },
  onPhoneData: n => { phoneNotes += n; },
  onIncoming: items => { const b = JSON.stringify(got); items.forEach(it => { got[it.from + '/' + it.id] = it.data; }); document.getElementById('got').textContent = JSON.stringify(got); return JSON.stringify(got) !== b; } });
document.getElementById('save').onclick = () => { mine.push({ id: 'run' + (mine.length + 1), title: (mine.length + 1) + '회', n: 50, summary: { '최대 a (m/s²)': 12.3 }, data: { t: [0, 1], a: [9.8, 12.3] } }); share.saved(); };
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
    await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.PENDULUM_CONFIG={appsScriptUrl:${JSON.stringify(API)},pollSeconds:3};` }));
    await c.route(/qrcode-generator/, r => r.fulfill({ contentType: 'text/javascript', body: QR }));
    await c.route(/gstatic/, r => r.abort());
    const pg = await c.newPage(); pg.on('pageerror', e => errors.push(name + ': ' + e.message)); return pg;
  }
  const check = async (pg, n) => { const ov = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.equal(ov, 0, n + ' 가로 스크롤'); console.log(n, 'overflow', await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    'small', await pg.evaluate(() => [...document.querySelectorAll('button, select, .cs-btn')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.id || e.textContent.trim()))); };
  // ---- 1) 수업 없이 ----
  const L = await ctx({ viewport: { width: 1280, height: 800 } }, 'L');
  await L.goto(ROOT + 'projects/_phone.html');
  await L.fill('#cs-group', '2-3-5376');
  await L.waitForTimeout(400);
  await L.click('#cs-phone');
  await L.waitForSelector('.cs-dlg:not([hidden]) #cs-qr svg', { state: 'attached' });
  const link = await L.getAttribute('#cs-plink', 'href');
  console.log('L role:', await L.textContent('#role'), '| link:', link);
  const P = await ctx(devices['Pixel 7'], 'P');
  await P.goto(link);
  assert.equal(await P.textContent('#role'), 'role=phone'); assert.equal(await L.textContent('#role'), 'role=laptop');
  assert.equal(await P.evaluate(() => document.getElementById('cs-share').open), false);
  console.log('P role:', await P.textContent('#role'), '| strip:', (await P.textContent('.cs-phone')).replace(/\s+/g, ' '), '| share open:', await P.evaluate(() => document.getElementById('cs-share').open));
  await P.click('#save');
  await P.waitForFunction(() => /보냈|못했/.test(document.getElementById('cs-pmsg').textContent));
  console.log('P sent:', await P.textContent('#cs-pmsg'));
  await check(P, 'P(Pixel7)');
  await L.waitForFunction(() => document.getElementById('got').textContent.includes('📱 폰'), null, { timeout: 15000 });
  await L.waitForTimeout(300);
  assert.match(await L.textContent('#got'), /📱 폰 .+\/run1/);
  console.log('L got:', await L.textContent('#got'), '| dialog note:', await L.textContent('.cs-dlg .cs-note'));
  await P.click('#save');
  await L.waitForFunction(() => phoneNotes >= 1 && document.getElementById('got').textContent.includes('run2'), null, { timeout: 15000 });
  assert.match(await L.textContent('#cs-status'), /폰에서 새 측정 1개/);
  console.log('L status after 2nd:', await L.textContent('#cs-status'), '| phoneNotes', await L.evaluate(() => phoneNotes));
  // ---- 2) 수업 있음 ----
  const c = app.post({ action: 'createClass', ban: 2, nStudents: 8, groupSize: 4, exp: 'phoneaccel' });
  const L2 = await ctx({ viewport: { width: 1280, height: 800 } }, 'L2');
  await L2.goto(ROOT + 'projects/_phone.html?c=' + c.classCode);
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
  assert.match(link2, /role=phone&group=2-2-\d{4}&c=2-\d{4}&jo=2&num=3/);
  assert.equal(await P2.isHidden('#cs-cpick'), true);
  console.log('P2 me:', (await P2.textContent('#cs-cme')).replace(/\s+/g, ' '), '| pick hidden', await P2.isHidden('#cs-cpick'), '| change hidden', await P2.isHidden('#cs-cchange'));
  await P2.click('#save');
  await P2.waitForFunction(() => /보냈|못했/.test(document.getElementById('cs-pmsg').textContent));
  await L2.waitForFunction(() => document.getElementById('got').textContent.includes('📱 폰'), null, { timeout: 15000 });
  console.log('L2 got phone data ✓');
  await check(P2, 'P2(Pixel7)');
  await new Promise(r => setTimeout(r, 800));
  const st = app.post({ action: 'classStatus', class: c.classCode, key: c.key });
  const s = st.students.find(x => x.jo === 2 && x.num === 3);
  assert.equal(s.step, 'phone-live');
  console.log('teacher sees:', s.step, '→', require(REPO + '/js/class-cloud.js').stepName('phoneaccel', s.step), '| submissions', JSON.stringify(st.submissions[1].labels));
  // 실패 시 다시 보내기
  await P2.route('**/exec**', r => r.abort());
  await P2.click('#save');
  await P2.waitForFunction(() => /못했/.test(document.getElementById('cs-pmsg').textContent), null, { timeout: 40000 });
  assert.equal(await P2.isVisible('#cs-presend'), true);
  console.log('P2 fail:', (await P2.textContent('#cs-pmsg')).slice(0, 80), '| resend shown', await P2.isVisible('#cs-presend'));
  assert.deepEqual(errors, []);
  await browser.close(); api.close(); stat.close();
});
