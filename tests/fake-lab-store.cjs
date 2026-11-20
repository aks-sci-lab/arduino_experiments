// 가짜 저장소 (시험용): js/lab-store.js 의 core 를 메모리 DB 로 돌린다.
// 브라우저 페이지에 window.LAB_STORE_FAKE_URL = '<이 서버 주소>' 를 넣으면 LabStore 가 Firestore 대신 여기로 { body, auth } 를 보낸다.
//   const app = loadLabStore();
//   await app.post({ action: 'createClass', … })   → 시험 쪽에서 바로 (기본 사용자: 선생님 teacher-1, 구글 로그인)
//   await app.get({ action: 'list', exp, group })   → 시험 쪽 확인용: space 가 없으면 모든 공간에서 그 조의 줄을 모아 줌
//   app.post(브라우저가 보낸 글자)                 → 페이지 요청 처리 (http 서버·page.route 에서)
//   app.items(exp)                                   → 저장된 측정 줄(문서) 전부
// 예전 가짜 Apps Script 시험 옮기기: require('./fake-apps-script.cjs') → require('./fake-lab-store.cjs') 의 loadLabStore,
//   app.post/get 앞에 await, script.google.com 을 가로채는 시험은 페이지에 window.LAB_STORE_FAKE_URL 을 그 주소로(addInitScript),
//   pendulum-config.js 대역은 configJs(주소), app.ss 시트 확인은 app.items(exp)·app.progress(), 교사 화면은 #btnLogin(가짜 구글 로그인)
'use strict';
const LabStore = require('../js/lab-store.js');

const TEACHER = { uid: 'teacher-1', google: true, teacher: true };

function loadLabStore(opts) {
    opts = opts || {};
    const db = LabStore.memoryDb(opts);
    const core = LabStore.core(db);
    const calls = [];
    async function handle(body, auth) { calls.push({ body, auth }); return core.handle(body, auth); }
    function itemsOf(exp) {
        const out = [];
        db.docs.forEach((d, p) => { if (/^labSpaces\/[^/]+\/items\//.test(p) && (!exp || d.exp === exp)) out.push(Object.assign({ _path: p, _space: p.split('/')[1] }, d)); });
        return out;
    }
    return {
        db, calls, TEACHER,
        // 예전 가짜 Apps Script 시험에서 옮길 때 쓰던 자리 (허용 목록은 js/lab-store.js 의 GENERIC_EXPS 가 진짜)
        ctx: { GENERIC_EXPS: LabStore.GENERIC_EXPS, CLASS_EXPS: {}, isGenericExp: LabStore.isGenericExp, isClassExp: LabStore.isClassExp },
        handle,
        // 페이지가 보낸 글자({ body, auth }) 또는 시험이 직접 넣은 요청 내용
        async post(raw, auth) {
            let o = raw;
            if (typeof raw === 'string') { try { o = JSON.parse(raw || '{}'); } catch (e) { return { ok: false, error: '요청 형식이 올바르지 않습니다.' }; } }
            if (o && o.body && typeof o.body === 'object' && 'auth' in o) return handle(o.body, o.auth || {});
            // 시험이 직접 만드는 수업은 모든 단계를 연 채로 (단계 열기 자체는 tests/class-stage-ui.test.cjs). 페이지(교사 화면)로 만든 수업은 진짜처럼 1단계만
            if (o && o.action === 'createClass' && o.stage == null) o = Object.assign({ stage: 99 }, o);
            return handle(o, auth || TEACHER);
        },
        async get(params, auth) {
            const p = Object.assign({}, params);
            if ((p.action === 'list' || p.action === 'raw') && !p.space && p.group) {
                // 모든 공간에서 찾아 모음 (수업 공간·짝 공간·조 코드 공간)
                const spaces = new Set([LabStore.groupSpace(p.group)]);
                db.docs.forEach((d, path) => { const m = /^labSpaces\/([^/]+)\//.exec(path); if (m && d.group === p.group) spaces.add(m[1]); });
                if (p.action === 'raw') {
                    for (const sp of spaces) { const r = await handle(Object.assign({}, p, { space: LabStore.isSpace(sp) ? sp : '' }), auth || TEACHER); if (r.ok) return r; }
                    return { ok: false, error: '그 측정을 찾지 못했습니다.' };
                }
                let all = null;
                for (const sp of spaces) {
                    const r = await handle(Object.assign({}, p, { space: LabStore.isSpace(sp) ? sp : '' }), auth || TEACHER);
                    if (!r.ok) return r;
                    if (!all) all = r; else all.items = all.items.concat(r.items);
                }
                return all;
            }
            return handle(p, auth || TEACHER);
        },
        items: itemsOf,
        progress() { const out = []; db.docs.forEach((d, p) => { if (/^labClasses\/[^/]+\/progress\//.test(p)) out.push(d); }); return out; }
    };
}

// 시험용 http 서버: 페이지의 LabStore 가 POST 로 보낸 { body, auth } 를 처리 (CORS 허용)
function labServer(app) {
    const http = require('node:http');
    return http.createServer((req, res) => {
        const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); res.end(JSON.stringify(o)); };
        if (req.method === 'OPTIONS') return send({});
        let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { app.post(b).then(send, e => send({ ok: false, error: String(e && e.message || e) })); });
    });
}
// page.route / context.route 로 가로채 처리 (서버 없이)
function routeHandler(app) {
    return async route => {
        const req = route.request();
        const out = await app.post(req.postData() || '{}');
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(out) });
    };
}
// pendulum-config.js 대신 넣을 글자 (가짜 저장소 주소 + 설정)
function configJs(url, extra) {
    return 'window.LAB_STORE_FAKE_URL=' + JSON.stringify(url) + ';window.PENDULUM_CONFIG=' + JSON.stringify(Object.assign({ pollSeconds: 3 }, extra || {})) + ';';
}

module.exports = { loadLabStore, labServer, routeHandler, configJs, TEACHER };
