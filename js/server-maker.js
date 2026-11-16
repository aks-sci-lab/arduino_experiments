/* 🛠 내 서버 만들기 — 선생님 구글 드라이브에 시트 + Apps Script 를 만들고 웹 앱으로 배포 (브라우저·Node 공용)
   화면: projects/class-teacher.html ① 시트 연결 (js/class-teacher.js). 시험: tests/server-maker.test.cjs
   - 구글 토큰은 Google Identity Services(accounts.google.com/gsi/client)의 토큰 방식으로 화면이 받아 넘겨 준다 (비밀번호 없이)
   - 권한은 최소: drive.file(이 앱이 만든 파일만), script.projects, script.deployments
   - 순서: 시트 만들기 → 시트에 붙은 Apps Script 프로젝트 → 사이트의 공식 코드(release.json 해시 확인)로 내용 채우기 → 버전 → 웹 앱 배포
   - 단계마다 결과(시트·프로젝트·버전·배포 id)를 resume 에 남겨, 중간에 실패해도 이미 만든 것을 다시 쓰고 이어서 한다
   - 배포 뒤 첫 실행 전에 구글이 주인(선생님)의 '권한 허용'을 요구하므로, 화면이 웹 앱 주소를 새 탭으로 열어 허용하게 한다 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ServerMaker = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/script.projects', 'https://www.googleapis.com/auth/script.deployments'];
    var SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
    var SCRIPT_API = 'https://script.googleapis.com/v1/projects';
    var TITLE = '센서 실험실 서버';
    var STEPS = [
        ['sheet', '구글 시트 만들기'],
        ['project', '시트에 Apps Script 붙이기'],
        ['code', '사이트의 공식 코드 넣기 (확인 값 비교)'],
        ['version', '새 버전 만들기'],
        ['deploy', '웹 앱으로 배포'],
        ['allow', '권한 허용 (새 탭에서 선생님이)'],
        ['connect', '연결 시험 · 관리 열쇠 받기']
    ];

    function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
    function sha256(text) {
        var c = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : (typeof require === 'function' ? require('node:crypto').webcrypto : null);
        return c.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(hex);
    }

    // 구글 API 오류를 쉬운 말로
    function explain(status, body, what) {
        var msg = String((body && body.error && body.error.message) || '');
        if (/Apps Script API/i.test(msg) || /User has not enabled/i.test(msg))
            return { code: 'script-api-off', text: '내 구글 계정에서 Apps Script API 가 꺼져 있어요. https://script.google.com/home/usersettings 에서 "Google Apps Script API" 를 켠 뒤 다시 누르세요.' };
        if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(msg))
            return { code: 'cloud-api-off', text: '사이트의 구글 클라우드 프로젝트에서 ' + (/sheets/i.test(msg) ? 'Google Sheets API' : 'Apps Script API') + ' 가 꺼져 있어요. 사이트 관리자에게 알려 주세요. (' + msg.slice(0, 120) + ')' };
        if (status === 401) return { code: 'token', text: '구글 로그인이 끝났어요(시간 초과). 단추를 다시 눌러 주세요.' };
        if (status === 403) return { code: 'denied', text: what + ' 권한이 없어요. 구글 로그인 창에서 요청한 권한을 모두 허용했는지 확인하세요.' + (msg ? ' (' + msg.slice(0, 120) + ')' : '') };
        return { code: 'http', text: what + ' 중 구글 오류 ' + status + (msg ? ': ' + msg.slice(0, 160) : '') };
    }
    function api(fetchImpl, token, method, url, body, what) {
        var init = { method: method, headers: { Authorization: 'Bearer ' + token } };
        if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
        return fetchImpl(url, init).then(function (res) {
            return res.text().then(function (t) {
                var j = {};
                try { j = t ? JSON.parse(t) : {}; } catch (e) { j = {}; }
                if (res.status >= 200 && res.status < 300) return j;
                var ex = explain(res.status, j, what);
                var err = new Error(ex.text); err.code = ex.code; err.status = res.status;
                throw err;
            });
        }, function (e) { var err = new Error(what + ' 중 인터넷 연결이 끊겼어요 (' + (e && e.message || e) + ').'); err.code = 'network'; throw err; });
    }
    // 사이트의 공식 코드 (같은 출처) + release.json 확인 값
    function siteCode(fetchImpl, base) {
        var get = function (n) {
            return fetchImpl(base + n + '?_=' + Date.now(), { cache: 'no-store' }).then(function (r) {
                if (!r.ok) throw new Error('사이트에서 ' + n + ' 을 받지 못했어요 (' + r.status + ').');
                return r.text();
            });
        };
        return Promise.all([get('release.json'), get('Code.gs'), get('appsscript.json')]).then(function (a) {
            var rel = JSON.parse(a[0]), code = a[1], man = a[2];
            return Promise.all([sha256(code), sha256(man)]).then(function (h) {
                if (!rel.files || h[0] !== rel.files.Code.sha256 || h[1] !== rel.files.appsscript.sha256)
                    throw new Error('사이트 코드의 확인 값(SHA-256)이 release.json 과 달라요. 사이트가 배포 중일 수 있으니 잠시 뒤 다시 누르세요.');
                if (!new RegExp('\\bvar VERSION = ' + Number(rel.version) + ';').test(code)) throw new Error('사이트 코드의 판 번호가 release.json 과 달라요.');
                JSON.parse(man);
                return { version: Number(rel.version), code: code, manifest: man };
            });
        });
    }
    function webAppUrl(dep) {
        var e = ((dep && dep.entryPoints) || []).filter(function (x) { return x.entryPointType === 'WEB_APP'; })[0];
        return (e && e.webApp && e.webApp.url) || (dep && dep.deploymentId ? 'https://script.google.com/macros/s/' + dep.deploymentId + '/exec' : '');
    }

    /* 만들기 (배포까지). o = { token, fetch, siteBase: '../apps-script/', resume: {}, onStep(key, state, text) }
       돌려주는 값: { ok, url, version, resume } 또는 { ok: false, error, code, at(단계), resume } */
    async function run(o) {
        var f = o.fetch || fetch, token = o.token, r = Object.assign({}, o.resume || {});
        var step = function (k, s, t) { if (o.onStep) o.onStep(k, s, t); };
        var at = 'sheet';
        try {
            if (!r.spreadsheetId) {
                step('sheet', 'run');
                var sh = await api(f, token, 'POST', SHEETS_API, { properties: { title: o.title || TITLE, locale: 'ko_KR', timeZone: 'Asia/Seoul' } }, '시트 만들기');
                r.spreadsheetId = sh.spreadsheetId; r.sheetUrl = sh.spreadsheetUrl || '';
                if (!r.spreadsheetId) throw new Error('시트를 만들었지만 번호를 받지 못했어요.');
            }
            step('sheet', 'done', r.sheetUrl);
            at = 'project';
            if (!r.scriptId) {
                step('project', 'run');
                var pr = await api(f, token, 'POST', SCRIPT_API, { title: o.title || TITLE, parentId: r.spreadsheetId }, 'Apps Script 붙이기');
                r.scriptId = pr.scriptId;
                if (!r.scriptId) throw new Error('Apps Script 를 만들었지만 번호를 받지 못했어요.');
            }
            step('project', 'done');
            at = 'code';
            if (!r.codeVersion) {
                step('code', 'run');
                var sc = await siteCode(f, o.siteBase || '../apps-script/');
                await api(f, token, 'PUT', SCRIPT_API + '/' + r.scriptId + '/content', {
                    scriptId: r.scriptId,
                    files: [{ name: 'Code', type: 'SERVER_JS', source: sc.code }, { name: 'appsscript', type: 'JSON', source: sc.manifest }]
                }, '코드 넣기');
                r.codeVersion = sc.version;
            }
            step('code', 'done', r.codeVersion + '판');
            at = 'version';
            if (!r.versionNumber) {
                step('version', 'run');
                var v = await api(f, token, 'POST', SCRIPT_API + '/' + r.scriptId + '/versions', { description: '센서 기반 실험실 서버 ' + r.codeVersion + '판 (내 서버 만들기)' }, '버전 만들기');
                r.versionNumber = v.versionNumber;
            }
            step('version', 'done');
            at = 'deploy';
            if (!r.url) {
                step('deploy', 'run');
                var d = await api(f, token, 'POST', SCRIPT_API + '/' + r.scriptId + '/deployments', {
                    versionNumber: r.versionNumber, manifestFileName: 'appsscript', description: '센서 기반 실험실 서버 ' + r.codeVersion + '판'
                }, '웹 앱 배포');
                r.deploymentId = d.deploymentId;
                r.url = webAppUrl(d);
                if (!r.url) throw new Error('배포했지만 웹 앱 주소를 받지 못했어요.');
            }
            step('deploy', 'done');
            return { ok: true, url: r.url, version: r.codeVersion, resume: r };
        } catch (e) {
            step(at, 'error', e.message);
            return { ok: false, error: e.message, code: e.code || '', at: at, resume: r };
        }
    }

    // 토큰 받기 (Google Identity Services 토큰 방식). 팝업은 단추를 누른 그 순간에 열어야 막히지 않는다
    function requestToken(clientId) {
        return new Promise(function (resolve) {
            var g = typeof google !== 'undefined' && google.accounts && google.accounts.oauth2;
            if (!g) { resolve({ ok: false, error: '구글 로그인 도구를 불러오지 못했어요(인터넷·학교 망 확인). 새로고침해 보세요.' }); return; }
            var client = g.initTokenClient({
                client_id: clientId, scope: SCOPES.join(' '),
                callback: function (resp) {
                    if (!resp || resp.error) { resolve({ ok: false, error: resp && resp.error === 'access_denied' ? '구글 로그인 창에서 허용하지 않았어요. 다시 눌러 권한을 모두 허용해 주세요.' : '구글 로그인이 되지 않았어요 (' + (resp && resp.error) + ').' }); return; }
                    if (g.hasGrantedAllScopes && !g.hasGrantedAllScopes.apply(g, [resp].concat(SCOPES))) {
                        resolve({ ok: false, error: '필요한 권한 3가지(내가 만든 파일, Apps Script 프로젝트, 배포) 중 일부를 허용하지 않았어요. 다시 눌러 모두 체크해 주세요.' }); return;
                    }
                    resolve({ ok: true, token: resp.access_token });
                },
                error_callback: function (err) {
                    var t = err && err.type;
                    resolve({ ok: false, error: t === 'popup_failed_to_open' ? '구글 로그인 창(팝업)이 막혔어요. 주소창 오른쪽의 팝업 차단 표시를 눌러 이 사이트를 허용한 뒤 다시 누르세요.'
                        : t === 'popup_closed' ? '구글 로그인 창이 닫혔어요. 다시 눌러 주세요.' : '구글 로그인 중 문제가 생겼어요 (' + (t || '알 수 없음') + ').' });
                }
            });
            client.requestAccessToken({ prompt: '' });
        });
    }

    return { SCOPES: SCOPES, STEPS: STEPS, TITLE: TITLE, run: run, requestToken: requestToken, siteCode: siteCode, webAppUrl: webAppUrl, explain: explain, sha256: sha256 };
});
