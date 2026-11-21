/* 수업 연결 — 교사·학생 모두 구글 로그인 없이 (브라우저·Node 공용)
   - 수업 코드: 반-4자리 (예: 2-4821). 조 코드는 반-조-같은 4자리 (예: 2-3-4821) → 기존 조 공유가 그대로 동작
   - 저장소는 사이트 Firebase(Firestore, js/lab-store.js — 2026-11-18 Apps Script 대신): createClass·joinInfo·heartbeat·classStatus·myClasses·classExport·deleteClass
     교사는 구글 로그인(수업 주인 = 교사 uid), 학생은 화면에 안 보이는 익명 로그인. 주소는 'lab:<수업 공간>'
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
    var IDLE_MS = 5 * 60 * 1000;   // 이만큼 신호가 없으면 '쉬는 중'

    // 실험별 페이지와 단계 이름
    // 실험별 페이지와 단계 이름. 저장소 js/lab-store.js 의 CLASS_EXPS 와 같게 둔다.
    //   ready: 그 페이지가 '?c=' 수업 참여(js/class-share.js)를 붙였는지. 실험 페이지를 붙인 세션이 true 로 바꾼다 (docs/class-share.md)
    //   'custom:<실험 id>' 는 선생님이 만든 실험 (projects/custom-lab.html?id=…)
    var STEPS7 = { purpose: '1 목적', theory: '2 이론', materials: '3 준비물', procedure: '4 과정', data: '5 데이터', result: '6 결과', conclusion: '7 결론' };
    // 가설연역 6단계 (js/lab-ui.js 의 LabUI.FLOWS.hd 와 같은 키·이름). 수업 문서 flow: 'hd' 면 7단계 대신 이 단계로 (docs/inquiry-types-design.md)
    var STEPS_HD = { problem: '① 문제 인식', hypothesis: '② 가설 설정', design: '③ 탐구 설계', perform: '④ 탐구 수행', interpret: '⑤ 자료 해석', conclude: '⑥ 결론 도출' };
    var HD_OF = { purpose: 'problem', theory: 'hypothesis', materials: 'design', procedure: 'design', data: 'perform', result: 'interpret', conclusion: 'conclude' };
    var FLOW_NAMES = { report: '📋 7단계 (보고서 순서)', hd: '🔍 가설연역 (6단계)' };
    function flowOf(f) { return f === 'hd' ? 'hd' : 'report'; }
    var DASH = { live: '측정 중', record: '기록', more: '안내' };
    var EXPS = {
        planck: { name: 'LED 로 플랑크 상수 측정', icon: '💡', page: 'projects/planck-led.html', steps: STEPS7, ready: true, flows: true },
        pendulum: { name: '스마트폰 진자 (노트북 분석)', icon: '⏱️', page: 'projects/pendulum-report.html', steps: STEPS7, ready: true, flows: true },
        idealgas: { name: '이상기체 상태 방정식 검증', icon: '🎈', page: 'projects/ideal-gas.html', steps: STEPS7, ready: true, flows: true },
        malus: { name: '말루스 법칙 실험', icon: '🕶️', page: 'projects/malus-law.html', steps: STEPS7, ready: true, flows: true },
        eminduction: { name: '전자기 유도 전압·전류 측정', icon: '🧲', page: 'projects/em-induction.html', steps: STEPS7, ready: true, flows: true },
        freefall: { name: '자유낙하 궤적 분석', icon: '🏀', page: 'projects/free-fall.html', steps: STEPS7, ready: true, flows: true },
        env: { name: '환경 센서 (온도·습도·기압·VOC)', icon: '🌡️', page: 'projects/environment-lab.html', steps: DASH, ready: true },
        light: { name: '조도 센서', icon: '🔆', page: 'projects/environment-lab.html?sensor=light', steps: DASH, ready: true },
        uv: { name: '자외선 센서', icon: '🟣', page: 'projects/environment-lab.html?sensor=uv', steps: DASH, ready: true },
        accel: { name: '가속도계 데이터 분석', icon: '📐', page: 'projects/accelerometer-lab.html', steps: DASH, ready: true },
        nano: { name: '아두이노 Nano 33 BLE Sense', icon: '🔷', page: 'projects/arduino-nano-lab.html', steps: DASH, ready: true },
        phoneaccel: { name: '스마트폰 가속도 센서 실험', icon: '📱', page: 'projects/phone-accelerometer.html', steps: DASH, ready: true },
        // 서버 9판부터 공용 저장에 heartrate. 숨 참기 탐구 회차는 kind 'breath' 자료 (js/heart-rate-breath.js)
        heartrate: { name: '스마트폰 카메라 심박수 (숨 참기 탐구)', icon: '❤️', page: 'projects/heart-rate.html', steps: { live: '심박수 재기', breath: '숨 참기 탐구' }, ready: true },
        // 탄소 양자점 형광 (시료 하나 = 한 줄, 저장은 Firestore)
        qdot: { name: '탄소 양자점 형광 실험', icon: '🌈', page: 'projects/quantum-dot.html', steps: STEPS7, ready: true, flows: true },
        // 가족 행사 (행사형 화면): 조를 미리 나누지 않고 가족이 팀 이름을 정해 들어옴 (team: true → 수업 만들 때 '팀 수'·예비 실험 값)
        rocket: { name: '발포비타민 필름통 로켓 (가족 행사)', icon: '🚀', page: 'projects/film-rocket.html', steps: { enter: '입장', think: '생각 열기', t1: '1차시 열리는 시간', t2: '2차시 로켓 높이', end: '정리' }, gate: ['think', 't1', 't2', 'end'], ready: true, team: true }
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
    /* 교사가 하나씩 여는 단계 (교사 화면 '▶ 다음 단계 열기', 학생 화면 잠금은 js/class-share.js)
       7단계 보고서 실험 = 목적…결론, 필름통 로켓 = 생각 열기·1차시·2차시·정리 (입장은 늘 열림), 한 화면 실험·선생님이 만든 실험 = 없음(null) */
    var STAGE_ALL = 99;
    // flow: 수업의 진행 방법 ('hd' = 가설연역 6단계, 그 밖 = 7단계). 가설연역은 그 페이지가 붙였을 때(flows: true)만
    function canFlow(exp) { var e = EXPS[exp]; return !!(e && e.flows && e.steps === STEPS7); }
    function gateSteps(exp, flow) {
        var e = EXPS[exp];
        if (!e) return null;
        if (e.gate) return e.gate.slice();
        if (e.steps !== STEPS7) return null;
        return flowOf(flow) === 'hd' && canFlow(exp) ? Object.keys(STEPS_HD) : Object.keys(STEPS7);
    }
    // 지금 열린 단계: { n(열린 수), all, keys(열린 단계들), cur(가장 뒤 열린 단계) } — stage 가 없으면(예전 수업) 모두 열림
    function stageInfo(exp, stage, flow) {
        var g = gateSteps(exp, flow);
        if (!g) return null;
        var n = stage == null || !isFinite(Number(stage)) ? g.length : Math.max(1, Math.min(g.length, Math.round(Number(stage))));
        return { gate: g, n: n, all: n >= g.length, keys: g.slice(0, n), cur: g[n - 1] };
    }

    function normalizeClass(s) {
        return String(s == null ? '' : s)
            .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
            .replace(/[‐-―－~·.\/_ ]/g, '-').replace(/\s+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
    function isClassCode(s) { return CLASS_RE.test(String(s || '')); }

    // 학생 수를 조별 인원에 맞춰 고르게: 26명·4명 → [4,4,4,4,4,3,3] (js/lab-store.js 의 splitGroups 와 같음)
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

    // 학생 링크: 실험 페이지?c=수업코드&s=수업 공간(24자, 남이 맞히기 어려움)
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
    function stepName(exp, step, flow) {
        // 폰 연결(📱)로 연 화면은 단계 앞에 'phone-' 을 붙여 보낸다
        var ph = /^phone-/.test(String(step || ''));
        if (ph) step = String(step).slice(6);
        var e = expInfo(exp);
        // 가설연역 수업: 학생 화면이 7단계 패널 키(data 등)를 보내도 가설연역 단계 이름으로
        var hd = flowOf(flow) === 'hd' && e && e.steps === STEPS7;
        var name = (hd && (STEPS_HD[step] || STEPS_HD[HD_OF[step]])) || (e && e.steps[step]) || STEPS_HD[step] || (step ? step : '–');
        return ph ? '📱 ' + (name === 'live' ? '폰으로 측정 중' : name) : name;
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
    // 요청은 모두 사이트 저장소(Firestore, js/lab-store.js, 'lab:공간' 주소)로 — js/pendulum-cloud.js 가 불러 줌 (2026-11-20 Apps Script 길 지움)
    function request(url, init, fetchImpl, ms) {
        if (!/^lab:/.test(String(url || ''))) return Promise.resolve({ ok: false, error: '예전 선생님 시트(Apps Script) 주소는 이제 쓰지 않아요. 선생님께 새 QR 을 받으세요.', legacy: true });
        var PC = typeof self !== 'undefined' && self.PendulumCloud;
        if (PC && PC.labRequest) return PC.labRequest(url, init, ms);
        try { return require('./pendulum-cloud.js').labRequest(url, init, ms); } catch (e) { return Promise.resolve({ ok: false, error: '저장소 도구가 없습니다.' }); }
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
        var b = { action: 'createClass', ban: Number(o.ban), nStudents: Number(o.nStudents), groupSize: Number(o.groupSize), exp: o.exp, aiLimit: o.aiLimit == null || o.aiLimit === '' ? '' : Number(o.aiLimit) };
        if (o.mode === 'team') { b.mode = 'team'; b.nTeams = Number(o.nTeams); }
        if (o.setup) b.setup = o.setup;
        if (o.flow === 'hd') b.flow = 'hd';
        return post(url, b, fetchImpl);
    }
    // 팀 이름으로 입장 (가족 행사): 빈 조 자리 하나를 그 팀 이름으로 잡음 → { jo, num: 1, name, group }
    function joinTeam(url, o, fetchImpl) { return post(url, { action: 'teamJoin', 'class': o.classCode, name: String(o.name || ''), device: o.device || '' }, fetchImpl, 20000); }
    // 수업 정보 새로 읽기 (선생님이 행사 설정을 고친 뒤)
    function classInfo(url, classCode, fetchImpl) { return post(url, { action: 'classInfo', 'class': classCode }, fetchImpl, 15000); }
    function classDone(space, done, fetchImpl) { return post('lab:' + space, { action: 'classDone', done: !!done }, fetchImpl, 20000); }
    function classStage(space, stage, fetchImpl) { return post('lab:' + space, { action: 'classStage', stage: Number(stage) }, fetchImpl, 20000); }
    // 🎬 설명 화면 상태: lesson { on, stage, i, key, reveal }, open = 풀이를 연 장의 key (더하기만)
    function classLesson(space, lesson, open, fetchImpl) { return post('lab:' + space, { action: 'classLesson', lesson: lesson || {}, open: open || [] }, fetchImpl, 20000); }
    function classSetup(space, setup, fetchImpl) { return post('lab:' + space, { action: 'classSetup', setup: setup }, fetchImpl, 20000); }
    function joinInfo(url, classCode, fetchImpl) { return getQ(url, { action: 'joinInfo', 'class': classCode, _: Date.now() }, fetchImpl); }
    function heartbeat(url, o, fetchImpl) {
        return post(url, {
            action: 'heartbeat', 'class': o.classCode, jo: Number(o.jo), num: Number(o.num), step: String(o.step || ''),
            points: Number.isFinite(Number(o.points)) ? Number(o.points) : '', submitted: !!o.submitted, device: o.device || '', phone: !!o.phone
        }, fetchImpl, 15000);
    }
    // 조·번호를 바꾼 기기가 옛 자리 진행 신호를 지움 (자기 기기가 쓴 것만, js/lab-store.js leaveSeat)
    function leaveSeat(url, o, fetchImpl) { return post(url, { action: 'leaveSeat', 'class': o.classCode, jo: Number(o.jo), num: Number(o.num), phone: !!o.phone }, fetchImpl, 15000); }
    function classStatus(url, classCode, key, fetchImpl) { return post(url, { action: 'classStatus', 'class': classCode, key: key }, fetchImpl, 20000); }
    // 교사(구글 로그인): 내 수업 목록·내려받기·지우기 (Firestore)
    function myClasses(fetchImpl) { return post('lab:', { action: 'myClasses' }, fetchImpl, 20000); }
    function classExport(space, fetchImpl) { return post('lab:' + space, { action: 'classExport' }, fetchImpl, 60000); }
    function deleteClass(space, fetchImpl) { return post('lab:' + space, { action: 'deleteClass' }, fetchImpl, 60000); }
    function reopenCode(space, fetchImpl) { return post('lab:' + space, { action: 'reopenCode' }, fetchImpl, 20000); }
    // 지워지는 날 (만든 때 + 183일): '2027년 5월 20일'
    function expireText(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }

    return {
        expInfo: expInfo, isExp: isExp, STEPS7: STEPS7,
        CLASS_RE: CLASS_RE, IDLE_MS: IDLE_MS, EXPS: EXPS,
        normalizeClass: normalizeClass, isClassCode: isClassCode, splitGroups: splitGroups, groupFor: groupFor,
        studentUrl: studentUrl, readClassParam: readClassParam,
        studentState: studentState, submissionText: submissionText, checkCustom: checkCustom, agoText: agoText, stepName: stepName, summarize: summarize,
        ping: ping, createClass: createClass, joinInfo: joinInfo, joinTeam: joinTeam, classInfo: classInfo, classSetup: classSetup, classStage: classStage, classDone: classDone, classLesson: classLesson, gateSteps: gateSteps, stageInfo: stageInfo, canFlow: canFlow, flowOf: flowOf, STEPS_HD: STEPS_HD, HD_OF: HD_OF, FLOW_NAMES: FLOW_NAMES, STAGE_ALL: STAGE_ALL, heartbeat: heartbeat, leaveSeat: leaveSeat, classStatus: classStatus,
        myClasses: myClasses, classExport: classExport, deleteClass: deleteClass, reopenCode: reopenCode, expireText: expireText
    };
});
