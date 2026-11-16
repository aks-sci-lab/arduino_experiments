// 🛠 내 서버 만들기(js/server-maker.js): 구글 API 호출 순서·값, 공식 코드 확인, 오류 문구, 중간 실패 뒤 이어 하기
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SM = require('../js/server-maker.js');

const DIR = path.join(__dirname, '..', 'apps-script');
const FILES = { 'release.json': fs.readFileSync(path.join(DIR, 'release.json'), 'utf8'), 'Code.gs': fs.readFileSync(path.join(DIR, 'Code.gs'), 'utf8'), 'appsscript.json': fs.readFileSync(path.join(DIR, 'appsscript.json'), 'utf8') };
const VERSION = JSON.parse(FILES['release.json']).version;

function google(over) {
    over = over || {};
    const calls = [];
    const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
    const fetch = async (url, init) => {
        init = init || {};
        const method = init.method || 'GET';
        const site = /^site\/([^?]+)/.exec(url);
        if (site) { calls.push('GET site:' + site[1]); return over.site && over.site[site[1]] != null ? res(200, over.site[site[1]]) : res(200, FILES[site[1]]); }
        const short = url.replace('https://sheets.googleapis.com/v4/spreadsheets', 'sheets:').replace('https://script.googleapis.com/v1/projects', 'script:');
        calls.push(method + ' ' + short);
        const body = init.body ? JSON.parse(init.body) : null;
        if (over.fail && over.fail[method + ' ' + short]) { const f = over.fail[method + ' ' + short]; if (!f.once || !f.used) { f.used = true; return res(f.status, f.body); } }
        assert.equal(init.headers.Authorization, 'Bearer TOK');
        if (short === 'sheets:' && method === 'POST') { calls.sheet = body; return res(200, { spreadsheetId: 'SHEET1', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/SHEET1/edit' }); }
        if (short === 'script:' && method === 'POST') { calls.project = body; return res(200, { scriptId: 'SCRIPT1' }); }
        if (short === 'script:/SCRIPT1/content' && method === 'PUT') { calls.content = body; return res(200, body); }
        if (short === 'script:/SCRIPT1/versions' && method === 'POST') { calls.version = body; return res(200, { versionNumber: 1 }); }
        if (short === 'script:/SCRIPT1/deployments' && method === 'POST') {
            calls.deploy = body;
            return res(200, { deploymentId: 'DEP1', entryPoints: [{ entryPointType: 'WEB_APP', webApp: { url: 'https://script.google.com/macros/s/DEP1/exec' } }] });
        }
        return res(404, { error: { message: 'not found ' + short } });
    };
    return { fetch, calls };
}

test('만들기: 시트 → 시트에 붙은 Apps Script → 공식 코드 → 버전 → 웹 앱 배포', async () => {
    const g = google(), steps = [];
    const r = await SM.run({ token: 'TOK', fetch: g.fetch, siteBase: 'site/', onStep: (k, s) => steps.push(k + ':' + s) });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.url, 'https://script.google.com/macros/s/DEP1/exec');
    assert.equal(r.version, VERSION);
    assert.deepEqual(g.calls.filter(c => typeof c === 'string'), [
        'POST sheets:', 'POST script:', 'GET site:release.json', 'GET site:Code.gs', 'GET site:appsscript.json',
        'PUT script:/SCRIPT1/content', 'POST script:/SCRIPT1/versions', 'POST script:/SCRIPT1/deployments']);
    assert.deepEqual(g.calls.sheet, { properties: { title: '센서 실험실 서버', locale: 'ko_KR', timeZone: 'Asia/Seoul' } });
    assert.deepEqual(g.calls.project, { title: '센서 실험실 서버', parentId: 'SHEET1' });
    assert.deepEqual(g.calls.content.files.map(f => [f.name, f.type]), [['Code', 'SERVER_JS'], ['appsscript', 'JSON']]);
    assert.equal(g.calls.content.files[0].source, FILES['Code.gs']);
    assert.equal(g.calls.content.files[1].source, FILES['appsscript.json']);
    assert.deepEqual(g.calls.deploy, { versionNumber: 1, manifestFileName: 'appsscript', description: '센서 기반 실험실 서버 ' + VERSION + '판' });
    assert.deepEqual(r.resume, { spreadsheetId: 'SHEET1', sheetUrl: 'https://docs.google.com/spreadsheets/d/SHEET1/edit', scriptId: 'SCRIPT1', codeVersion: VERSION, versionNumber: 1, deploymentId: 'DEP1', url: 'https://script.google.com/macros/s/DEP1/exec' });
    assert.deepEqual(steps.filter(s => s.endsWith(':done')), ['sheet:done', 'project:done', 'code:done', 'version:done', 'deploy:done']);
    assert.deepEqual(SM.SCOPES, ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/script.projects', 'https://www.googleapis.com/auth/script.deployments']);
});

test('Apps Script API 꺼짐 → 쉬운 안내, 켠 뒤 다시 누르면 만든 시트를 다시 써서 이어 함', async () => {
    const g = google({ fail: { 'POST script:': { once: true, status: 403, body: { error: { code: 403, message: 'User has not enabled the Apps Script API. Enable it by visiting https://script.google.com/home/usersettings then retry.', status: 'PERMISSION_DENIED' } } } } });
    const r1 = await SM.run({ token: 'TOK', fetch: g.fetch, siteBase: 'site/' });
    assert.equal(r1.ok, false); assert.equal(r1.at, 'project'); assert.equal(r1.code, 'script-api-off');
    assert.match(r1.error, /usersettings/);
    assert.equal(r1.resume.spreadsheetId, 'SHEET1');
    const before = g.calls.length;
    const r2 = await SM.run({ token: 'TOK', fetch: g.fetch, siteBase: 'site/', resume: r1.resume });
    assert.equal(r2.ok, true, r2.error);
    assert.ok(!g.calls.slice(before).includes('POST sheets:'), '시트를 또 만들지 않음');
    assert.equal(g.calls.slice(before)[0], 'POST script:');
});

test('배포에서 실패해도 다시 하면 배포만', async () => {
    const g = google({ fail: { 'POST script:/SCRIPT1/deployments': { once: true, status: 500, body: { error: { message: 'Internal error' } } } } });
    const r1 = await SM.run({ token: 'TOK', fetch: g.fetch, siteBase: 'site/' });
    assert.equal(r1.at, 'deploy'); assert.match(r1.error, /웹 앱 배포 중 구글 오류 500/);
    const before = g.calls.length;
    const r2 = await SM.run({ token: 'TOK', fetch: g.fetch, siteBase: 'site/', resume: r1.resume });
    assert.equal(r2.ok, true);
    assert.deepEqual(g.calls.slice(before), ['POST script:/SCRIPT1/deployments']);
});

test('공식 코드 확인: 해시가 다르면 코드를 넣지 않음', async () => {
    const g = google({ site: { 'Code.gs': FILES['Code.gs'] + '\n// 바뀜' } });
    const r = await SM.run({ token: 'TOK', fetch: g.fetch, siteBase: 'site/' });
    assert.equal(r.ok, false); assert.equal(r.at, 'code'); assert.match(r.error, /SHA-256/);
    assert.ok(!g.calls.includes('PUT script:/SCRIPT1/content'));
});

test('오류 문구: 로그인 만료·권한 없음·클라우드 API 꺼짐·인터넷', async () => {
    assert.equal(SM.explain(401, {}, 'x').code, 'token');
    assert.match(SM.explain(403, { error: { message: 'The caller does not have permission' } }, '시트 만들기').text, /권한을 모두 허용/);
    const off = SM.explain(403, { error: { message: 'Google Sheets API has not been used in project 123 before or it is disabled.' } }, '시트 만들기');
    assert.equal(off.code, 'cloud-api-off'); assert.match(off.text, /Google Sheets API/);
    const net = await SM.run({ token: 'TOK', fetch: async () => { throw new Error('Failed to fetch'); }, siteBase: 'site/' });
    assert.equal(net.at, 'sheet'); assert.match(net.error, /인터넷 연결이 끊겼어요/);
    assert.equal(SM.webAppUrl({ deploymentId: 'D9' }), 'https://script.google.com/macros/s/D9/exec');
});
