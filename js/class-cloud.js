/* 수업 연결 — 교사·학생 모두 구글 로그인 없이 (브라우저·Node 공용)
   - 수업 코드: 반-4자리 (예: 2-4821). 조 코드는 반-조-같은 4자리 (예: 2-3-4821) → 기존 조 공유가 그대로 동작
   - 서버는 선생님 시트의 Apps Script(apps-script/Code.gs 4판): createClass·joinInfo·heartbeat·classStatus
   - 교사 열쇠는 POST 본문으로만 보낸다 (주소에 남지 않게). 학생은 이름 없이 '3조 2번' 으로만
   - 요청은 미리보기 요청이 생기지 않는 단순 요청 (GET, 또는 Content-Type: text/plain 인 POST)
   화면: projects/class-teacher.html(js/class-teacher.js), 학생 쪽은 projects/planck-led.html, 메인 index.html
   시험: tests/class-cloud.test.cjs */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ClassCloud = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var CLASS_RE = /^\d{1,2}-\d{4}$/;
    var MIN_VERSION = 4;           // 수업 연결을 쓰려면 Apps Script 가 4판 이상
    var UPDATE_VERSION = 5;        // 이 판부터 교사 화면의 단추로 서버가 스스로 업데이트
    var IDLE_MS = 5 * 60 * 1000;   // 이만큼 신호가 없으면 '쉬는 중'

    // 실험별 페이지와 단계 이름
    // 실험별 페이지와 단계 이름. 서버 Code.gs 의 CLASS_EXPS 와 같게 둔다.
    //   ready: 그 페이지가 '?c=' 수업 참여(js/class-share.js)를 붙였는지. 실험 페이지를 붙인 세션이 true 로 바꾼다 (docs/class-share.md)
    //   'custom:<실험 id>' 는 선생님이 만든 실험 (projects/custom-lab.html?id=…)
    var STEPS7 = { purpose: '1 목적', theory: '2 이론', materials: '3 준비물', procedure: '4 과정', data: '5 데이터', result: '6 결과', conclusion: '7 결론' };
    var DASH = { live: '측정 중', record: '기록', more: '안내' };
    var EXPS = {
        planck: { name: 'LED 로 플랑크 상수 측정', icon: '💡', page: 'projects/planck-led.html', steps: STEPS7, ready: true },
        pendulum: { name: '스마트폰 진자 (노트북 분석)', icon: '⏱️', page: 'projects/pendulum-report.html', steps: STEPS7, ready: true },
        idealgas: { name: '이상기체 상태 방정식 검증', icon: '🎈', page: 'projects/ideal-gas.html', steps: STEPS7, ready: false },
        malus: { name: '말루스 법칙 실험', icon: '🕶️', page: 'projects/malus-law.html', steps: STEPS7, ready: false },
        eminduction: { name: '전자기 유도 전압·전류 측정', icon: '🧲', page: 'projects/em-induction.html', steps: STEPS7, ready: true },
        freefall: { name: '자유낙하 궤적 분석', icon: '🏀', page: 'projects/free-fall.html', steps: STEPS7, ready: false },
        env: { name: '환경 센서 (온도·습도·기압·VOC)', icon: '🌡️', page: 'projects/environment-lab.html', steps: DASH, ready: false },
        light: { name: '조도 센서', icon: '🔆', page: 'projects/environment-lab.html?sensor=light', steps: DASH, ready: false },
        uv: { name: '자외선 센서', icon: '🟣', page: 'projects/environment-lab.html?sensor=uv', steps: DASH, ready: false },
        accel: { name: '가속도계 데이터 분석', icon: '📐', page: 'projects/accelerometer-lab.html', steps: DASH, ready: false },
        nano: { name: '아두이노 Nano 33 BLE Sense', icon: '🔷', page: 'projects/arduino-nano-lab.html', steps: DASH, ready: true },
        phoneaccel: { name: '스마트폰 가속도 센서 실험', icon: '📱', page: 'projects/phone-accelerometer.html', steps: DASH, ready: false }
    };
    var CUSTOM_RE = /^custom:([A-Za-z0-9_-]{1,40})$/;
    var CUSTOM_STEPS = Object.assign({ live: '한 화면' }, STEPS7);
    // 실험 정보 (선생님이 만든 실험 'custom:<id>' 도)
    function expInfo(exp) {
        if (EXPS[exp]) return EXPS[exp];
        var m = CUSTOM_RE.exec(String(exp || ''));
        // 한 화면 방식이면 단계 'live', 7단계 방식이면 STEPS7 (js/custom-lab.js)
        if (m) return { name: '선생님이 만든 실험 (' + m[1] + ')', icon: '👩‍🏫', page: 'projects/custom-lab.html?id=' + m[1], steps: CUSTOM_STEPS, ready: true, custom: true };
        return null;
    }
    function isExp(exp) { return !!expInfo(exp); }

    function normalizeClass(s) {
        return String(s == null ? '' : s)
            .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
            .replace(/[‐-―－~·.\/_ ]/g, '-').replace(/\s+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
    function isClassCode(s) { return CLASS_RE.test(String(s || '')); }

    // 학생 수를 조별 인원에 맞춰 고르게: 26명·4명 → [4,4,4,4,4,3,3] (서버 Code.gs 의 splitGroups 와 같음)
    function splitGroups(n, size) {
        n = Math.round(Number(n)); size = Math.round(Number(size));
        if (!(n >= 1 && n <= 60) || !(size >= 1 && size <= 10)) return [];
        var k = Math.ceil(n / size), base = Math.floor(n / k), extra = n % k, out = [];
        for (var i = 0; i < k; i++) out.push(base + (i < extra ? 1 : 0));
        return out;
    }
    function groupFor(info, jo) {
        return ((info && info.groups) || []).filter(function (g) { return Number(g.jo) === Number(jo); })[0] || null;
    }

    // 학생 링크: 실험 페이지?c=수업코드&s=스크립트ID (s 가 없으면 학생 쪽은 사이트 기본 시트)
    function studentUrl(origin, exp, classCode, scriptId) {
        var e = expInfo(exp);
        if (!e || !isClassCode(classCode)) return '';
        return String(origin || '').replace(/\/+$/, '') + '/' + e.page + (e.page.indexOf('?') >= 0 ? '&' : '?') + 'c=' + encodeURIComponent(classCode) + (scriptId ? '&s=' + encodeURIComponent(scriptId) : '');
    }
    function readClassParam(search) {
        var m = /[?&]c=([^&#]*)/.exec(search || '');
        var c = m ? normalizeClass(decodeURIComponent(m[1])) : '';
        return isClassCode(c) ? c : '';
    }

    // 교사 화면: 학생 한 명의 상태 (now 는 서버 시각 기준, 컴퓨터 시계가 달라도 맞게)
    function studentState(st, nowIso) {
        if (!st) return { joined: false, label: '아직 안 들어옴', cls: 'none' };
        var now = Date.parse(nowIso), seen = Date.parse(st.lastSeen);
        var ago = Number.isFinite(now) && Number.isFinite(seen) ? Math.max(0, now - seen) : null;
        var idle = ago != null && ago > IDLE_MS;
        return { joined: true, ago: ago, idle: idle, label: idle ? '쉬는 중' : '활동 중', cls: idle ? 'idle' : 'active' };
    }
    function agoText(ms) {
        if (ms == null) return '';
        var s = Math.round(ms / 1000);
        if (s < 60) return s + '초 전';
        if (s < 3600) return Math.floor(s / 60) + '분 전';
        return Math.floor(s / 3600) + '시간 전';
    }
    function stepName(exp, step) {
        var e = expInfo(exp);
        return (e && e.steps[step]) || (step ? step : '–');
    }
    /* 선생님이 만든 실험이 학생에게 공개되었는지 (로그인 없이 Firestore 를 읽어 봄. 규칙: published == true 일 때만 누구나 읽기)
       돌려주는 값: { state: 'public', title } | { state: 'hidden' }(비공개이거나 없는 번호) | { state: 'unknown', error }(인터넷 등) */
    var FIRESTORE_DOC = 'https://firestore.googleapis.com/v1/projects/web-experiment-f9b24/databases/(default)/documents/customExperiments/';
    var FIREBASE_KEY = 'AIzaSyCYVme6ZP-iyspRmHTtuUSsKXe7K_D0vJQ';   // 사이트 공개 웹 키 (index.html·js/phone-accel-cloud.js 와 같음)
    function checkCustom(id, fetchImpl) {
        var f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(id || ''))) return Promise.resolve({ state: 'hidden' });
        if (!f) return Promise.resolve({ state: 'unknown', error: '이 브라우저는 확인할 수 없어요.' });
        return f(FIRESTORE_DOC + encodeURIComponent(id) + '?key=' + FIREBASE_KEY, { method: 'GET' }).then(function (res) {
            if (res.status === 403 || res.status === 404) return { state: 'hidden' };
            if (!res.ok) return { state: 'unknown', error: '확인하지 못했어요 (' + res.status + ').' };
            return res.json().then(function (j) {
                var fl = (j && j.fields) || {};
                if (!(fl.published && fl.published.booleanValue === true)) return { state: 'hidden' };
                return { state: 'public', title: fl.title && fl.title.stringValue || '' };
            });
        }, function (e) { return { state: 'unknown', error: '확인하지 못했어요 (' + (e && e.message || e) + ').' }; });
    }
    // 교사 화면: 조 하나의 제출 요약 한 줄 (실험마다 단위가 달라 이름은 실험이 정한 summary 이름 그대로)
    function submissionText(exp, sub) {
        if (!sub || !sub.rows) return '아직 제출 없음';
        var labels = (sub.labels && sub.labels.length ? sub.labels : sub.leds || []);
        var list = labels.slice(0, 6).join(', ') + (labels.length > 6 ? ' 외 ' + (labels.length - 6) + '개' : '');
        if (exp === 'planck') {
            var h = sub.hCurrent !== '' && sub.hCurrent != null ? ' · h = ' + Number(sub.hCurrent).toFixed(2) + ' ×10⁻³⁴' +
                (sub.errorPct !== '' && sub.errorPct != null ? ' (' + (sub.errorPct >= 0 ? '+' : '') + Number(sub.errorPct).toFixed(1) + ' %)' : '') : '';
            return '제출: LED ' + sub.rows + '개 (' + list + ')' + h;
        }
        var sm = sub.summary && typeof sub.summary === 'object' ? Object.keys(sub.summary).slice(0, 4).map(function (k) {
            var v = sub.summary[k];
            return k + ' ' + (typeof v === 'number' ? Number(v.toPrecision(4)) : v);
        }).join(', ') : '';
        return '제출: ' + sub.rows + '개 (' + list + ')' + (sm ? ' · ' + sm : '');
    }
    /* classStatus 응답 → 조별 카드 자료
       돌려주는 값: { groups: [{ jo, code, size, members: [{ num, st, state }], sub }], joined, total, active, idle, submittedGroups } */
    function summarize(status) {
        var by = {};
        (status.students || []).forEach(function (s) { by[s.jo + '-' + s.num] = s; });
        var subs = {};
        (status.submissions || []).forEach(function (s) { subs[s.code] = s; });
        var out = { groups: [], joined: 0, total: 0, active: 0, idle: 0, submittedGroups: 0 };
        (status.groups || []).forEach(function (g) {
            var members = [];
            for (var n = 1; n <= Number(g.size); n++) {
                var st = by[g.jo + '-' + n] || null, state = studentState(st, status.now);
                members.push({ num: n, st: st, state: state });
                out.total++;
                if (state.joined) { out.joined++; if (state.idle) out.idle++; else out.active++; }
            }
            var sub = subs[g.code] || null;
            if (sub && sub.rows > 0) out.submittedGroups++;
            out.groups.push({ jo: g.jo, code: g.code, size: g.size, members: members, sub: sub });
        });
        return out;
    }

    // ---------- 요청 (fetchImpl 은 시험에서 가짜로 바꿈) ----------
    function parseResponse(text) {
        var j;
        try { j = typeof text === 'string' ? JSON.parse(text) : text; }
        catch (e) {
            return { ok: false, error: /<html/i.test(String(text)) ? '서버가 로그인 화면을 보냈습니다. 웹 앱의 액세스를 "모든 사용자"로 배포했는지 확인하세요.' : '서버 응답을 읽지 못했습니다.' };
        }
        if (!j || typeof j !== 'object') return { ok: false, error: '서버 응답이 비어 있습니다.' };
        if (!j.ok) return { ok: false, error: String(j.error || '서버 오류') };
        return j;
    }
    function request(url, init, fetchImpl, ms) {
        var f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
        if (!url) return Promise.resolve({ ok: false, error: '선생님 시트가 아직 연결되지 않았습니다 (Apps Script 주소 없음).', noConfig: true });
        if (!f) return Promise.resolve({ ok: false, error: '이 브라우저는 서버에 연결할 수 없습니다.' });
        return new Promise(function (resolve) {
            var done = false;
            var t = setTimeout(function () { if (!done) { done = true; resolve({ ok: false, error: '서버에 연결하지 못했습니다 (시간 초과).', network: true }); } }, ms || 15000);
            f(url, init).then(function (res) { return res.text(); }).then(function (txt) {
                if (done) return; done = true; clearTimeout(t); resolve(parseResponse(txt));
            }, function (e) {
                if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: '서버에 연결하지 못했습니다 (' + (e && e.message || e) + ').', network: true });
            });
        });
    }
    function getQ(url, params, fetchImpl) {
        if (!url) return request('', null, fetchImpl);
        var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
        return request(url + (url.indexOf('?') >= 0 ? '&' : '?') + q, { method: 'GET', redirect: 'follow' }, fetchImpl);
    }
    function post(url, body, fetchImpl, ms) {
        return request(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' }, fetchImpl, ms || 30000);
    }
    function ping(url, fetchImpl) { return getQ(url, { action: 'ping', _: Date.now() }, fetchImpl); }
    function createClass(url, o, fetchImpl) {
        return post(url, { action: 'createClass', ban: Number(o.ban), nStudents: Number(o.nStudents), groupSize: Number(o.groupSize), exp: o.exp }, fetchImpl);
    }
    function joinInfo(url, classCode, fetchImpl) { return getQ(url, { action: 'joinInfo', 'class': classCode, _: Date.now() }, fetchImpl); }
    function heartbeat(url, o, fetchImpl) {
        return post(url, {
            action: 'heartbeat', 'class': o.classCode, jo: Number(o.jo), num: Number(o.num), step: String(o.step || ''),
            points: Number.isFinite(Number(o.points)) ? Number(o.points) : '', submitted: !!o.submitted, device: o.device || ''
        }, fetchImpl, 15000);
    }
    function classStatus(url, classCode, key, fetchImpl) { return post(url, { action: 'classStatus', 'class': classCode, key: key }, fetchImpl, 20000); }
    // 스스로 업데이트 (5판): 관리 열쇠도 POST 본문으로만
    function claimAdmin(url, fetchImpl) { return post(url, { action: 'claimAdmin' }, fetchImpl); }
    function update(url, key, fetchImpl) { return post(url, { action: 'update', key: key }, fetchImpl, 120000); }
    function rollback(url, key, fetchImpl) { return post(url, { action: 'rollback', key: key }, fetchImpl, 60000); }
    /* 서버 판(ping) 과 사이트 공식 판(release.json) 비교 → 교사 화면에 보일 것
       돌려주는 값: { show, kind: 'manual'|'update'|'latest', from, to, canRollback } */
    function updatePlan(ping, release) {
        var from = Number(ping && ping.version) || 0, to = Number(release && release.version) || 0;
        var canRollback = !!(ping && ping.canRollback) && from >= UPDATE_VERSION;
        if (!from || !to || to <= from) return { show: canRollback, kind: 'latest', from: from, to: to, canRollback: canRollback };
        return { show: true, kind: from >= UPDATE_VERSION ? 'update' : 'manual', from: from, to: to, canRollback: canRollback };
    }

    return {
        expInfo: expInfo, isExp: isExp, STEPS7: STEPS7,
        CLASS_RE: CLASS_RE, MIN_VERSION: MIN_VERSION, UPDATE_VERSION: UPDATE_VERSION, IDLE_MS: IDLE_MS, EXPS: EXPS,
        claimAdmin: claimAdmin, update: update, rollback: rollback, updatePlan: updatePlan,
        normalizeClass: normalizeClass, isClassCode: isClassCode, splitGroups: splitGroups, groupFor: groupFor,
        studentUrl: studentUrl, readClassParam: readClassParam,
        studentState: studentState, submissionText: submissionText, checkCustom: checkCustom, agoText: agoText, stepName: stepName, summarize: summarize,
        parseResponse: parseResponse, ping: ping, createClass: createClass, joinInfo: joinInfo, heartbeat: heartbeat, classStatus: classStatus
    };
});
