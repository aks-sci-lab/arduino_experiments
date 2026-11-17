// Apps Script 스스로 업데이트(Code.gs 5판): 관리 열쇠·공식 코드 받기·해시 확인·Apps Script API 호출 순서·되돌리기
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadCodeGs } = require('./fake-apps-script.cjs');
const { build } = require('../tools/build-apps-script-release.cjs');

const DIR = path.join(__dirname, '..', 'apps-script');
const CODE = fs.readFileSync(path.join(DIR, 'Code.gs'), 'utf8');
const MANIFEST = fs.readFileSync(path.join(DIR, 'appsscript.json'), 'utf8');
const NOW = Number(/\bvar VERSION = (\d+);/.exec(CODE)[1]);
const SITE = 'https://aks-sci-lab.web.app/apps-script/';
const API = 'https://script.googleapis.com/v1/projects/SCRIPT_ID_FAKE_0123456789abcdef';
const sha = t => crypto.createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex');

// 사이트에 올라간 '다음 판' 과 가짜 Google (프로젝트 내용·버전·배포)
function world(over) {
    over = over || {};
    const nextCode = over.siteCode != null ? over.siteCode : CODE.replace(/\bvar VERSION = \d+;/, 'var VERSION = ' + (NOW + 1) + ';');
    const nextMan = over.siteManifest != null ? over.siteManifest : MANIFEST;
    const release = over.release || { version: NOW + 1, files: { Code: { sha256: sha(nextCode) }, appsscript: { sha256: sha(nextMan) } } };
    const g = {
        files: over.projectFiles || [
            { name: 'Code', type: 'SERVER_JS', source: CODE },
            { name: 'appsscript', type: 'JSON', source: over.oldManifest != null ? over.oldManifest : MANIFEST },
            { name: 'Extra', type: 'SERVER_JS', source: 'function extra() {}' }
        ],
        versions: 3, deployVersion: 3, puts: []
    };
    const fetch = (url, p) => {
        const method = (p.method || 'get').toLowerCase();
        if (url.startsWith(SITE)) {
            const name = url.slice(SITE.length).split('?')[0];
            if (name === 'release.json') return { code: 200, body: JSON.stringify(release) };
            if (name === 'Code.gs') return { code: 200, body: nextCode };
            if (name === 'appsscript.json') return { code: 200, body: nextMan };
            return { code: 404, body: '' };
        }
        if (over.apiError) return over.apiError;
        if (url === API + '/content' && method === 'get') return { code: 200, body: JSON.stringify({ scriptId: 'x', files: g.files }) };
        if (url === API + '/content' && method === 'put') { g.files = JSON.parse(p.payload).files; return { code: 200, body: '{}' }; }
        if (url === API + '/versions' && method === 'post') { g.versions++; return { code: 200, body: JSON.stringify({ versionNumber: g.versions }) }; }
        if (url === API + '/deployments/DEPLOY_ID_FAKE' && method === 'get') return { code: 200, body: JSON.stringify({ deploymentId: 'DEPLOY_ID_FAKE', deploymentConfig: { versionNumber: g.deployVersion } }) };
        if (url === API + '/deployments/DEPLOY_ID_FAKE' && method === 'put') {
            const c = JSON.parse(p.payload).deploymentConfig; g.deployVersion = c.versionNumber; g.puts.push(c); return { code: 200, body: '{}' };
        }
        return { code: 404, body: '{"error":{"message":"not found"}}' };
    };
    const app = loadCodeGs({ fetch });
    const key = app.post({ action: 'claimAdmin' }).key;
    app.fetches.length = 0;
    return { app, g, key, nextCode };
}
const calls = app => app.fetches.map(f => f.method.toUpperCase() + ' ' + f.url.replace(SITE, 'site:').replace(API, 'api:').replace(/\?_=\d+$/, ''));

test('release.json 이 Code.gs·appsscript.json 과 맞음 (node tools/build-apps-script-release.cjs)', () => {
    assert.equal(fs.readFileSync(path.join(DIR, 'release.json'), 'utf8'), build(), 'node tools/build-apps-script-release.cjs 를 실행하세요');
    const m = JSON.parse(MANIFEST);
    assert.equal(m.runtimeVersion, 'V8'); assert.equal(m.timeZone, 'Asia/Seoul');
    assert.deepEqual(m.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
    assert.deepEqual(m.oauthScopes.slice().sort(), [
        'https://www.googleapis.com/auth/script.deployments', 'https://www.googleapis.com/auth/script.external_request',
        'https://www.googleapis.com/auth/script.projects', 'https://www.googleapis.com/auth/spreadsheets.currentonly']);
    assert.ok(NOW >= 5);
    assert.match(CODE, /var SITE = 'https:\/\/aks-sci-lab\.web\.app\/apps-script\/';/);
});

test('관리 열쇠: 처음 한 번만 만들고 해시만 저장, ping 이 알려 줌', () => {
    const app = loadCodeGs();
    assert.deepEqual(app.get({ action: 'ping' }), { ok: true, version: NOW, admin: false, canRollback: false, prevServer: null });
    const r = app.post({ action: 'claimAdmin' });
    assert.match(r.key, /^[0-9a-f]{16}$/);
    assert.match(app.props.get('ADMIN_KEY_HASH'), /^[0-9a-f]{64}$/);
    assert.ok(![...app.props.values()].includes(r.key));
    assert.match(app.post({ action: 'claimAdmin' }).error, /이미 관리 열쇠/);
    assert.equal(app.get({ action: 'ping' }).admin, true);
});

test('업데이트: 열쇠가 틀리면 아무것도 받지 않음', () => {
    const { app } = world();
    assert.match(app.post({ action: 'update', key: 'wrong' }).error, /관리 열쇠가 맞지 않습니다/);
    assert.match(app.post({ action: 'update' }).error, /관리 열쇠/);
    assert.match(app.post({ action: 'rollback', key: 'wrong' }).error, /관리 열쇠/);
    assert.equal(app.fetches.length, 0);
    assert.match(loadCodeGs().post({ action: 'update', key: 'x' }).error, /관리 열쇠가 아직 없습니다/);
});

test('업데이트: 공식 코드 확인 → 내용 바꾸기 → 새 버전 → 같은 배포를 새 버전으로 (데이터 시트는 그대로)', () => {
    const { app, g, key, nextCode } = world();
    const r = app.post({ action: 'update', key, url: 'https://evil.example/Code.gs' });
    assert.equal(r.ok, true, r.error);
    assert.deepEqual([r.from, r.to, r.versionNumber, r.previousVersionNumber], [NOW, NOW + 1, 4, 3]);
    assert.deepEqual(calls(app), [
        'GET site:release.json', 'GET site:Code.gs', 'GET site:appsscript.json',
        'GET api:/content', 'GET api:/deployments/DEPLOY_ID_FAKE',
        'PUT api:/content', 'POST api:/versions', 'PUT api:/deployments/DEPLOY_ID_FAKE'
    ]);
    assert.ok(app.fetches.every(f => f.url.startsWith(SITE) || f.url.startsWith(API)), '고정 주소만');
    app.fetches.filter(f => f.url.startsWith(API)).forEach(f => assert.equal(f.headers.Authorization, 'Bearer TOKEN_FAKE'));
    assert.deepEqual(g.files.map(f => [f.name, f.type]), [['Code', 'SERVER_JS'], ['appsscript', 'JSON'], ['Extra', 'SERVER_JS']]);
    assert.equal(g.files[0].source, nextCode);
    assert.equal(g.files[2].source, 'function extra() {}', '다른 파일은 그대로');
    assert.deepEqual(g.puts[0], { scriptId: 'SCRIPT_ID_FAKE_0123456789abcdef', versionNumber: 4, manifestFileName: 'appsscript', description: '센서 기반 실험실 서버 ' + (NOW + 1) + '판' });
    assert.equal(app.props.get('PREV_DEPLOY_VERSION'), '3');
    assert.equal(app.ss.sheets.size, 0, '시트를 만들거나 건드리지 않음');
    const ping = app.get({ action: 'ping' });
    assert.equal(ping.canRollback, true); assert.equal(ping.prevServer, NOW);
});

test('업데이트: 선생님이 서버 파일 이름을 바꿨어도 그 파일을 바꿈', () => {
    const { app, g, key } = world({ projectFiles: [
        { name: '코드', type: 'SERVER_JS', source: CODE }, { name: 'appsscript', type: 'JSON', source: MANIFEST }] });
    assert.equal(app.post({ action: 'update', key }).ok, true);
    assert.deepEqual(g.files.map(f => f.name), ['코드', 'appsscript']);
});

test('업데이트 거절: 해시가 다름·판 번호가 같거나 낮음·판 번호 줄이 다름·너무 큼·새 권한·매니페스트 없음', () => {
    const tamper = world({ siteCode: CODE.replace(/\bvar VERSION = \d+;/, 'var VERSION = ' + (NOW + 1) + ';') + '\n// 몰래 바꿈',
        release: { version: NOW + 1, files: { Code: { sha256: sha(CODE.replace(/\bvar VERSION = \d+;/, 'var VERSION = ' + (NOW + 1) + ';')) }, appsscript: { sha256: sha(MANIFEST) } } } });
    assert.match(tamper.app.post({ action: 'update', key: tamper.key }).error, /확인 값\(SHA-256\)/);
    assert.ok(!calls(tamper.app).some(c => c.startsWith('PUT')), '내용을 바꾸지 않음');

    const same = world({ release: { version: NOW, files: {} } });
    assert.match(same.app.post({ action: 'update', key: same.key }).error, /이미 최신/);
    const lower = world({ release: { version: NOW - 1, files: {} } });
    assert.match(lower.app.post({ action: 'update', key: lower.key }).error, /이미 최신/);

    const lie = world({ siteCode: CODE, release: { version: NOW + 1, files: { Code: { sha256: sha(CODE) }, appsscript: { sha256: sha(MANIFEST) } } } });
    assert.match(lie.app.post({ action: 'update', key: lie.key }).error, /판 번호가 release\.json 과 다릅니다/);

    const huge = 'var VERSION = ' + (NOW + 1) + ';\n' + 'x'.repeat(500000);
    const big = world({ siteCode: huge, release: { version: NOW + 1, files: { Code: { sha256: sha(huge) }, appsscript: { sha256: sha(MANIFEST) } } } });
    assert.match(big.app.post({ action: 'update', key: big.key }).error, /너무 큽니다/);

    const m2 = JSON.parse(MANIFEST); m2.oauthScopes.push('https://www.googleapis.com/auth/drive');
    const scopes = world({ siteManifest: JSON.stringify(m2) });
    const r = scopes.app.post({ action: 'update', key: scopes.key });
    assert.match(r.error, /새 권한이 필요/); assert.match(r.error, /auth\/drive/);
    assert.equal(scopes.g.deployVersion, 3);

    const noMan = world({ projectFiles: [{ name: 'Code', type: 'SERVER_JS', source: CODE }] });
    assert.match(noMan.app.post({ action: 'update', key: noMan.key }).error, /appsscript\.json\(권한 목록\)이 없습니다/);
});

test('업데이트 오류 문구: Apps Script API 꺼짐 · 권한 없음', () => {
    const off = world({ apiError: { code: 403, body: JSON.stringify({ error: { code: 403, message: 'User has not enabled the Apps Script API. Enable it by visiting https://script.google.com/home/usersettings', status: 'PERMISSION_DENIED' } }) } });
    assert.match(off.app.post({ action: 'update', key: off.key }).error, /Apps Script API 가 꺼져 있습니다.*usersettings/);
    const deny = world({ apiError: { code: 403, body: JSON.stringify({ error: { message: 'The caller does not have permission' } }) } });
    assert.match(deny.app.post({ action: 'update', key: deny.key }).error, /업데이트 권한이 없습니다.*손으로/);
    const site = loadCodeGs({ fetch: () => ({ code: 503, body: '' }) });
    const k = site.post({ action: 'claimAdmin' }).key;
    assert.match(site.post({ action: 'update', key: k }).error, /release\.json 을 받지 못했습니다 \(503\)/);
});

test('되돌리기: 업데이트 전 배포 버전으로, 한 번 더 누르면 다시 앞으로', () => {
    const { app, g, key } = world();
    assert.match(app.post({ action: 'rollback', key }).error, /되돌릴 이전 버전이 없습니다/);
    app.post({ action: 'update', key });
    assert.equal(g.deployVersion, 4);
    app.fetches.length = 0;
    const r = app.post({ action: 'rollback', key });
    assert.equal(r.ok, true, r.error); assert.equal(r.versionNumber, 3);
    assert.deepEqual(calls(app), ['GET api:/deployments/DEPLOY_ID_FAKE', 'PUT api:/deployments/DEPLOY_ID_FAKE']);
    assert.equal(g.deployVersion, 3);
    assert.equal(g.puts[1].versionNumber, 3); assert.equal(g.puts[1].manifestFileName, 'appsscript');
    assert.equal(app.post({ action: 'rollback', key }).versionNumber, 4);
    assert.equal(g.deployVersion, 4);
});

test('배포 번호: 웹 앱 주소가 /dev 면 배포 목록에서 찾음', () => {
    const fetch = (url, p) => {
        if (url === API + '/deployments') return { code: 200, body: JSON.stringify({ deployments: [
            { deploymentId: 'HEAD', deploymentConfig: {} },
            { deploymentId: 'D2', deploymentConfig: { versionNumber: 7 }, entryPoints: [{ entryPointType: 'WEB_APP' }] }] }) };
        return { code: 404, body: '' };
    };
    const app = loadCodeGs({ fetch, serviceUrl: 'https://script.google.com/macros/s/AKfyc/dev' });
    assert.equal(app.ctx.deploymentId(), 'D2');
});

test('8판: 업데이트 오류는 원래 문구를 그대로 보여 주고, 권한 문제면 다시 배포·허용 안내', () => {
    // UrlFetchApp 권한이 아직 허용되지 않은 경우 (실제 Apps Script 의 예외 문구 모양)
    const perm = loadCodeGs({ fetch: () => { throw new Error('You do not have permission to call UrlFetchApp.fetch. Required permissions: https://www.googleapis.com/auth/script.external_request'); } });
    const k = perm.post({ action: 'claimAdmin' }).key;
    const e = perm.post({ action: 'update', key: k }).error;
    assert.match(e, /사이트에서 release\.json 을 받는 중 오류: You do not have permission to call UrlFetchApp\.fetch/);
    assert.match(e, /script\.external_request/);
    assert.match(e, /배포 관리 → ✏️ → 버전 "새 버전" → 배포 → 권한 확인 창에서 허용/);
    // 한국어 권한 문구도
    const ko = loadCodeGs({ fetch: () => { throw new Error('UrlFetchApp.fetch을(를) 호출할 권한이 없습니다.'); } });
    const k2 = ko.post({ action: 'claimAdmin' }).key;
    assert.match(ko.post({ action: 'update', key: k2 }).error, /호출할 권한이 없습니다.*권한 확인 창에서 허용/);
    // 권한과 상관없는 오류는 원래 문구만 (안내를 붙이지 않음)
    const dns = loadCodeGs({ fetch: () => { throw new Error('Address unavailable: https://aks-sci-lab.web.app/apps-script/release.json'); } });
    const k3 = dns.post({ action: 'claimAdmin' }).key;
    const e3 = dns.post({ action: 'update', key: k3 }).error;
    assert.match(e3, /받는 중 오류: Address unavailable/); assert.doesNotMatch(e3, /권한 확인 창/);
    // 200 인데 JSON 이 아닌 글 (로그인 화면 등): 받은 글 앞부분까지
    const html = loadCodeGs({ fetch: () => ({ code: 200, body: '<!DOCTYPE html><html>로그인' }) });
    const k4 = html.post({ action: 'claimAdmin' }).key;
    assert.match(html.post({ action: 'update', key: k4 }).error, /release\.json 을 읽지 못했습니다: .+받은 글 앞부분: <!DOCTYPE html>/);
});

test('8판: 되돌리기 중 예상 밖 예외도 원래 문구로', () => {
    const app = loadCodeGs({ fetch: () => { throw new Error('Authorization is required to perform that action.'); } });
    const k = app.post({ action: 'claimAdmin' }).key;
    app.props.set('PREV_DEPLOY_VERSION', '3');
    const e = app.post({ action: 'rollback', key: k }).error;
    assert.match(e, /Authorization is required to perform that action\./);
    assert.match(e, /권한 확인 창에서 허용/);
});
