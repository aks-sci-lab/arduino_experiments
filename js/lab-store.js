/* 실험실 저장소 — Firebase(Firestore) 로 수업 연결·조 공유·폰→노트북 전송 (2026-11-18, Apps Script 대신)
   브라우저·Node 공용. 예전 서버(Apps Script, 2026-11-20 지움)가 하던 요청을 같은 모양으로 받아 Firestore 에 저장한다.
   그래서 실험 페이지(js/class-share.js·pendulum-*·planck-*)는 거의 고치지 않고, 요청이 가는 곳만 바뀐다.

   주소 대신 '공간(space)': 'lab:<공간 id>'
     c… 24자  수업 하나 (교사가 만들 때 무작위, 학생 QR·링크의 ?s= 에 담김 → 남이 맞히기 어려움)
     p… 24자  수업 없이 노트북↔폰 짝 (노트북이 무작위로 만들어 폰 QR 에 담음)
     ''       조 코드만 넣어 쓰는 경우 → 공간 = 'g' + 조 코드 (사람이 코드를 그대로 옮겨 적어야 해서 맞히기 쉬움)
   Firestore 모양 (규칙: firestore.rules 의 lab… 부분)
     labSpaces/{공간}/items/{실험~조~id}   측정 한 줄 (진자·플랑크·공용 모두)
     labSpaces/{공간}/raw/{같은 id}         진자 원본(목록에서 빼려고 따로)
     labClasses/{공간}                      수업 (주인 = 교사 uid)
     labClasses/{공간}/progress/{조-번호}   학생 진행 (하트비트, 그 자리의 📱 폰 측정 화면은 {조-번호-p}, uid = 쓴 기기)
     labClassCodes/{수업 코드}              학생이 메인 화면에서 수업 코드만 넣었을 때 공간 찾기
     devlog/{실험~id}                       개발 데이터 (선생님 기기)
     lessonEdits/{교사 uid}/exps/{실험}     선생님이 고친 수업 설명 자료 (그 교사만 읽고 씀, 교사 자료라 expireAt 없음 — projects/lesson-editor.html)
     lessonEdits/{교사 uid}/imgs/{그림 id}  그 자료에 바꿔 넣은 그림 하나 (줄인 data URL, 본인만, expireAt 없음)
     labClasses/{공간}/aiAsk/{a…}           보고서 AI 질문 하나 (학생 익명 uid 가 만들고, 켜 둔 교사 화면이 답을 씀 — 키는 교사 브라우저에만, js/report-ai.js)
     labClasses/{공간}/reports/{조코드~uid} 학생 보고서 글 (기기마다 하나, 최종 제출 뒤에는 학생이 못 고침)
     labClasses/{공간}/aiDesk/status        교사 화면 AI 켜짐 신호 (학생 화면이 '선생님 화면 켜짐'을 보여 줌)
     labClasses/{공간}/teams/{조 번호}       '팀 이름으로 입장' 수업(mode 'team', 가족 행사 — 필름통 로켓)의 팀 하나: 이름·그 팀 폰(익명 uid)
                                            팀 이름을 정하면 빈 조 자리 하나를 차지하고, 그 뒤로는 그 조 코드로 저장한다 (조 방식 수업은 그대로)
   모든 문서에 expireAt = 만든 때 + 183일 (학기 끝 자동 삭제: TTL 정책 + .github/workflows/firestore-cleanup.yml)

   쓰는 법(브라우저): LabStore.call('lab:<공간>', { action: 'save', … }) → Promise<응답>
   시험: 페이지에 window.LAB_STORE_FAKE_URL 이 있으면 Firestore 대신 그 주소로 { body, auth } 를 보낸다
         (tests/fake-lab-store.cjs 가 같은 core 를 메모리 DB 로 돌림) */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.LabStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var VERSION = 'firestore-1';
    var TTL_DAYS = 183;
    var SPACE_RE = /^[cp][a-z0-9]{23}$/;
    var GROUP_RE = /^\d{1,2}-\d{1,2}-\d{4}$/;
    var CLASS_RE = /^\d{1,2}-\d{4}$/;
    var ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
    var DEVICE_RE = /^[A-Za-z0-9_-]{4,20}$/;
    var STEP_RE = /^[a-z0-9_-]{1,20}$/;
    var DATA_MAX = 45000 * 6;        // 자료 글자 수 한도 (예전 셀 6칸과 같게)
    var CELL_MAX = 45000;
    var SUMMARY_KEYS = 20, PLANCK_POINTS = 500;
    var JOIN_DAYS = 2;               // 수업 코드만으로 찾을 수 있는 기간 (규칙도 이 기간 뒤 읽기를 막음 — 코드는 99만 개라 훑기 쉬움). QR·링크는 수업이 지워질 때까지
    var GENERIC_EXPS = { idealgas: 1, accel: 1, env: 1, light: 1, uv: 1, phoneaccel: 1, malus: 1, eminduction: 1, freefall: 1, nano: 1, heartrate: 1, qdot: 1, rocket: 1 };   // qdot: 퀀텀닷 용액(PR #120), rocket: 필름통 로켓(가족 행사, 팀 이름으로 입장)
    var CLASS_EXPS = { planck: 1, pendulum: 1 };
    Object.keys(GENERIC_EXPS).forEach(function (k) { CLASS_EXPS[k] = 1; });
    var CUSTOM_EXP_RE = /^custom:[A-Za-z0-9_-]{1,40}$/;
    var DEV_EXPS = { heartrate: 1, facehr: 1 };
    // 보고서 AI (js/report-ai.js). 한도는 교사 화면이 셈 (규칙은 크기·필드만)
    var AI = { LIMIT_DEFAULT: 20, LIMIT_MAX: 200, PROMPT: 1500, DRAFT: 6000, CALC: 4000, ANSWER: 8000, VERIFY: 2000, TEXT: 8000, EXTERNAL: 3000, SECTIONS: 12, STALE_MS: 3 * 60000, DESK_MS: 150000 };
    var SECTION_RE = /^[a-z0-9_-]{1,20}$/;
    var ASK_ID_RE = /^a[a-z0-9]{19}$/;
    // '팀 이름으로 입장' (가족 행사): 팀 이름 1~12글자, 같은 수업에서 겹치지 않게. 이 실험의 줄은 그 팀 폰만 쓴다
    var TEAM = { NAME: 12, MAX: 40 };
    var STAGE_ALL = 99;   // 수업 stage 의 '모두 열림'
    // 🎬 설명 화면: 장의 key(학생 화면 답 [data-lesson-answer] 와 짝), 단계 키, 풀이를 연 key 목록 최대 수 (firestore.rules 와 같게)
    var LESSON_KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/, STAGE_KEY_RE = /^[a-z0-9_-]{1,20}$/, LESSON_OPEN_MAX = 200;
    var TEAM_EXPS = { rocket: 1 };
    // 📖 선생님이 고친 수업 자료 (firestore.rules lessonEdits 와 같게): 실험 키·장 자리·새 장 key·장 종류·크기
    var LESSON_EXP_RE = /^[a-z0-9]{1,20}$/, LESSON_REF_RE = /^(k:[a-z0-9][a-z0-9-]{0,39}|s:[a-z0-9_-]{1,20}:\d{1,3})$/, LESSON_NEW_KEY_RE = /^my-[a-z0-9-]{1,36}$/;
    var LESSON_KINDS = ['why', 'concept', 'vars', 'how', 'ask', 'safety'];
    // 내가 바꾼 그림 (lessonEdits/{uid}/imgs/{id}): 선생님 기기에서 줄인 WebP·JPEG·PNG data URL, 300KB(글자로 약 41만 자) 아래, 한 실험 40장
    var LESSON_IMG_REF_RE = /^my-img:i[a-z0-9]{15}$/, LESSON_IMG_ID_RE = /^i[a-z0-9]{15}$/, LESSON_IMG_DATA_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+\/=]+$/;
    var LESSON_IMG = { CHARS: 410000, PER_EXP: 40, SIDE: 4000 };
    var LESSON_EDIT = { STAGES: 20, SLIDES: 60, FIELD: { title: 200, body: 6000, ask: 1500, reveal: 6000, note: 3000 }, VAR: 300, KEEP: 8, BYTES: 600000 };
    function cleanTeamName(v) {
        var s = String(v == null ? '' : v);
        if (s.normalize) s = s.normalize('NFC');
        s = s.replace(/[\u0000-\u001f\u007f<>"'`\\|{}]/g, ' ').replace(/\s+/g, ' ').trim();
        var chars = Array.from(s);
        if (chars.length > TEAM.NAME) s = chars.slice(0, TEAM.NAME).join('').trim();
        return s;
    }
    function teamKey(name) { return cleanTeamName(name).toLowerCase().replace(/\s+/g, ''); }
    // 행사 설정 (선생님이 예비 실험으로 정한 값): 이름이 정해진 숫자만, 글은 'pieces' 하나
    var SETUP_NUM = { waterMin: [1, 50], waterMax: [1, 50], waterStep: [1, 20], waterBase: [1, 50],
        tabletMin: [1, 8], tabletMax: [1, 8], tabletBase: [1, 8], tempMin: [0, 60], tempMax: [0, 60], tempStep: [1, 20], tempBase: [0, 60],
        targetTime: [1, 300], tolTime: [0, 60], tolPct: [0, 100], repeats: [1, 10], targetPct: [10, 300] };
    function cleanSetup(v) {
        if (v == null || v === '') return null;
        if (typeof v !== 'object' || Array.isArray(v)) fail('행사 설정 형식이 올바르지 않습니다.');
        var out = {};
        Object.keys(SETUP_NUM).forEach(function (k) {
            if (v[k] === '' || v[k] == null) return;
            var r = SETUP_NUM[k], n = Number(v[k]);
            if (!isFinite(n) || n < r[0] || n > r[1]) fail('행사 설정 값(' + k + ')이 올바르지 않습니다.');
            out[k] = Math.round(n * 100) / 100;
        });
        if (v.pieces != null && v.pieces !== '') {
            var ps = String(v.pieces).split(',').filter(function (x, i, a) { return /^(whole|half|quarter|powder)$/.test(x) && a.indexOf(x) === i; });
            if (ps.length) out.pieces = ps.join(',');
        }
        if (v.pieceBase && /^(whole|half|quarter|powder)$/.test(String(v.pieceBase))) out.pieceBase = String(v.pieceBase);
        return out;
    }
    function isClassExp(e) { return !!CLASS_EXPS[e] || CUSTOM_EXP_RE.test(e); }
    function isGenericExp(e) { return !!GENERIC_EXPS[e] || CUSTOM_EXP_RE.test(e); }

    // ---------- 공간 ----------
    function randomChars(n) {
        var A = 'abcdefghijkmnpqrstuvwxyz23456789', s = '', bytes = null;
        try { if (typeof crypto !== 'undefined' && crypto.getRandomValues) { bytes = new Uint8Array(n); crypto.getRandomValues(bytes); } } catch (e) { bytes = null; }
        if (!bytes) { try { bytes = require('node:crypto').randomBytes(n); } catch (e) { bytes = null; } }
        for (var i = 0; i < n; i++) s += A[(bytes ? bytes[i] : Math.floor(Math.random() * 256)) % 32];
        return s;
    }
    function newSpace(kind) { return (kind === 'p' ? 'p' : 'c') + randomChars(23); }
    function isSpace(s) { return SPACE_RE.test(String(s || '')); }
    function isLabUrl(url) { return /^lab:/.test(String(url || '')); }
    function urlOf(space) { return 'lab:' + (isSpace(space) ? space : ''); }
    function spaceOf(url) { var m = /^lab:([a-z0-9]*)/.exec(String(url || '')); return m && isSpace(m[1]) ? m[1] : ''; }
    function groupSpace(group) { return 'g' + group; }
    // 'lab:공간?action=list&group=…' → { space, params }
    function parseUrl(url) {
        var s = String(url || ''), q = s.indexOf('?'), params = {};
        if (q >= 0) s.slice(q + 1).split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); params[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); });
        return { space: spaceOf(q >= 0 ? s.slice(0, q) : s), params: params };
    }

    // ---------- 값 검사 (예전 Code.gs 와 같은 문구) ----------
    function fail(msg) { var e = new Error(msg); e.userError = true; throw e; }
    function cleanGroup(g) {
        g = String(g == null ? '' : g).replace(/\s+/g, '');
        if (!GROUP_RE.test(g)) fail('조 코드 형식이 올바르지 않습니다 (예: 2-3-4821).');
        return g;
    }
    function cleanClass(c) {
        c = String(c == null ? '' : c).replace(/\s+/g, '');
        if (!CLASS_RE.test(c)) fail('수업 코드 형식이 올바르지 않습니다 (예: 2-4821).');
        return c;
    }
    function numIn(v, lo, hi, name, optional) {
        if ((v === '' || v == null) && optional) return '';
        var n = Number(v);
        if (!isFinite(n) || n < lo || n > hi) fail(name + ' 값이 올바르지 않습니다.');
        return n;
    }
    // 여러 줄 글 (줄바꿈·탭은 남김)
    function block(v, max) { return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').slice(0, max); }
    function text(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, max); }
    function cleanSummary(v) {
        if (v == null || v === '') return {};
        if (typeof v !== 'object' || Array.isArray(v)) fail('요약(summary) 형식이 올바르지 않습니다.');
        var keys = Object.keys(v);
        if (keys.length > SUMMARY_KEYS) fail('요약(summary) 항목이 너무 많습니다.');
        var out = {};
        keys.forEach(function (k) {
            // 이름은 30자까지 아무 글자나 (예: '온도(°C)', '최대 a (m/s²)'). '|'·제어 문자, Firestore 가 쓰는 __이름__ 만 막는다
            if (!/^[^|\u0000-\u001f]{1,30}$/.test(k) || !k.trim() || /^__.*__$/.test(k)) fail('요약 이름이 올바르지 않습니다 (1~30자, | 는 쓸 수 없음).');
            var x = v[k];
            if (typeof x === 'number') { if (!isFinite(x)) fail('요약 값이 올바르지 않습니다.'); out[k] = x; }
            else if (x == null) out[k] = null;
            else out[k] = String(x).replace(/[\u0000-\u001f]/g, ' ').slice(0, 40);
        });
        return out;
    }
    function cleanPoints(textValue, isIv, name) {
        if (textValue === '' || textValue == null) return '[]';
        var arr;
        try { arr = typeof textValue === 'string' ? JSON.parse(textValue) : textValue; } catch (err) { fail(name + ' 형식이 올바르지 않습니다.'); }
        if (!Array.isArray(arr) || arr.length > PLANCK_POINTS) fail(name + ' 점 수가 너무 많거나 형식이 올바르지 않습니다.');
        var out = arr.map(function (p) {
            if (!isIv) return numIn(p, 0, 50, name + ' 전압');
            if (!Array.isArray(p) || p.length < 2 || p.length > 5) fail(name + ' 형식이 올바르지 않습니다.');
            var row = [numIn(p[0], 0, 50, name + ' 전압'), numIn(p[1], 0, 1000, name + ' 전류')];
            if (p.length > 2) row.push(p[2] == null ? null : numIn(p[2], 0, 50, name + ' 저항 전압'));
            if (p.length > 3) row.push(p[3] == null ? null : numIn(p[3], 0, 1e7, name + ' 저항'));
            if (p.length > 4) row.push(p[4] ? 1 : 0);
            return row;
        });
        var s = JSON.stringify(out);
        if (s.length > CELL_MAX) fail(name + ' 이 너무 큽니다.');
        return s;
    }
    function splitGroups(n, size) {
        var k = Math.ceil(n / size), base = Math.floor(n / k), extra = n % k, out = [];
        for (var i = 0; i < k; i++) out.push(base + (i < extra ? 1 : 0));
        return out;
    }
    function docKey(exp, group, id) { return (String(exp).replace(/[^A-Za-z0-9_:-]/g, '') + '~' + group + '~' + id).slice(0, 120); }
    function iso(v) { return v instanceof Date ? v.toISOString() : String(v == null ? '' : v); }

    /* ---------- 핵심: 요청 하나 처리 (db·auth 는 밖에서) ----------
       db: { get(path, opt) → 자료|null, set(path, data), del(path), query(coll, [[필드, 값]…], opt) → [{ id, data }], now() → Date, stamp() }
           opt.live: 같은 질문을 자주 다시 할 때(몇 초마다 불러오기·진행 보기) — Firestore 쪽은 실시간 듣기로 바꿔 읽기 횟수를 줄인다
           opt.cache: 잘 안 바뀌는 문서(수업 설정)는 한 번만 읽기
       auth: { uid, google: 구글 로그인 여부, admin: 서버 쪽(개발 자료 내보내기)만 } */
    function core(db) {
        function expireAt() { return new Date(db.now().getTime() + TTL_DAYS * 86400000); }
        function itemsPath(space) { return 'labSpaces/' + space + '/items'; }
        function spaceFor(body, group) { return isSpace(body.space) ? body.space : groupSpace(group); }

        // --- 진자 (예전 measurements 시트) ---
        async function saveMeasurement(b) {
            var group = cleanGroup(b.group), id = String(b.id || '');
            if (!ID_RE.test(id)) fail('측정 번호(id)가 올바르지 않습니다.');
            var raw = Array.isArray(b.raw) ? b.raw : [];
            if (raw.length > 6) fail('원본 데이터가 너무 큽니다.');
            raw.forEach(function (r) { if (typeof r !== 'string' || r.length > CELL_MAX) fail('원본 데이터 조각이 너무 큽니다.'); });
            var space = spaceFor(b, group), key = docKey('pendulum', group, id), exp = expireAt();
            var rec = {
                exp: 'pendulum', group: group, id: id,
                L: numIn(b.L, 0.01, 10, '줄 길이 L'), amplitude: numIn(b.amplitude, 0, 90, '진폭', true),
                sensorAxis: text(b.sensorAxis, 10), nPeriods: numIn(b.nPeriods, 1, 500, '주기 수'),
                T_mean: numIn(b.T_mean, 0.05, 30, '주기 T'), T_std: numIn(b.T_std, 0, 30, 'T 표준편차', true),
                note: text(b.note, 200), kind: b.kind === 'acc' ? 'acc' : 'gyro', source: b.source === 'simulation' ? 'simulation' : 'sensor',
                T_sem: numIn(b.T_sem, 0, 30, 'T 표준오차', true), rate: numIn(b.rate, 0, 2000, '샘플 빈도', true),
                device: text(b.device, 20), measuredAt: text(b.measuredAt, 40), rawInfo: text(b.rawInfo, 200),
                hasRaw: raw.some(function (p) { return !!p; }), timestamp: db.stamp(), expireAt: exp
            };
            var old = await db.get(itemsPath(space) + '/' + key);
            if (rec.hasRaw) await db.set('labSpaces/' + space + '/raw/' + key, { group: group, id: id, raw: raw.filter(function (p) { return p; }), expireAt: exp });
            await db.set(itemsPath(space) + '/' + key, rec);
            return { ok: true, id: id, updated: !!old };
        }
        async function listPendulum(space, group) {
            var rows = await db.query(itemsPath(space), [['exp', 'pendulum'], ['group', group]], { live: true });
            var keep = ['timestamp', 'L', 'amplitude', 'sensorAxis', 'nPeriods', 'T_mean', 'T_std', 'note', 'id', 'kind', 'source', 'T_sem', 'rate', 'device', 'measuredAt', 'rawInfo', 'hasRaw'];
            return rows.map(function (r) { var o = { group: group }; keep.forEach(function (k) { var v = r.data[k]; o[k] = v === undefined ? '' : v instanceof Date ? v.toISOString() : v; }); o.hasRaw = !!r.data.hasRaw; return o; });
        }
        async function rawOf(space, group, id) {
            var d = await db.get('labSpaces/' + space + '/raw/' + docKey('pendulum', group, id));
            if (!d) return { ok: false, error: '그 측정을 찾지 못했습니다.' };
            return { ok: true, id: id, raw: (d.raw || []).map(String) };
        }

        // --- LED 플랑크 상수 (예전 planck 시트, 같은 이름의 칸) ---
        async function savePlanck(b) {
            var group = cleanGroup(b.group), id = String(b.id || '');
            if (!ID_RE.test(id)) fail('측정 번호(id)가 올바르지 않습니다.');
            var device = String(b.device || '');
            if (!DEVICE_RE.test(device)) fail('노트북 번호가 올바르지 않습니다.');
            var led = String(b.led == null ? '' : b.led).trim();
            if (!led) fail('LED 이름이 없습니다.');
            var ledKey = String(b.ledKey || '');
            var rec = {
                exp: 'planck', group: group, led: text(led, 40), lambda_nm: numIn(b.lambda, 200, 1100, 'LED 파장'),
                V0_current: numIn(b.v0Current, 0, 10, '문턱 전압(전류 기준)', true), V0_glow: numIn(b.v0Glow, 0, 10, '문턱 전압(빛 기준)', true),
                nIV: numIn(b.nIV, 0, PLANCK_POINTS, '점 수'), nGlow: numIn(b.nGlow, 0, PLANCK_POINTS, '점 수'),
                'h_current_e-34': numIn(b.hCurrent, 0, 100, '플랑크 상수', true), error_pct: numIn(b.errorPct, -10000, 10000, '오차율', true),
                R2: numIn(b.r2, -1, 1, '결정계수', true), 'h_glow_e-34': numIn(b.hGlow, 0, 100, '플랑크 상수(빛 기준)', true),
                device: device, id: id, ledKey: /^[A-Za-z0-9_-]{1,20}$/.test(ledKey) ? ledKey : '',
                curMode: b.curMode === 'current' ? 'current' : 'extrapolate', iMin: numIn(b.iMin, 0, 100, '직선 부분 기준 전류', true),
                sentAt: text(b.sentAt, 40), ivData: cleanPoints(b.iv, true, 'I–V 측정값'), glowData: cleanPoints(b.glow, false, '빛 기준 측정값'),
                timestamp: db.stamp(), expireAt: expireAt()
            };
            var path = itemsPath(spaceFor(b, group)) + '/' + docKey('planck', group, id);
            var old = await db.get(path);
            await db.set(path, rec);
            return { ok: true, id: id, updated: !!old };
        }
        var PLANCK_COLS = ['timestamp', 'led', 'lambda_nm', 'V0_current', 'V0_glow', 'nIV', 'nGlow', 'h_current_e-34', 'error_pct', 'R2', 'h_glow_e-34', 'device', 'id', 'ledKey', 'curMode', 'iMin', 'sentAt', 'ivData', 'glowData'];
        async function listPlanck(space, group) {
            var rows = await db.query(itemsPath(space), [['exp', 'planck'], ['group', group]], { live: true });
            return rows.map(function (r) { var o = { group: group }; PLANCK_COLS.forEach(function (k) { var v = r.data[k]; o[k] = v === undefined ? '' : (v instanceof Date ? v.toISOString() : v); }); return o; });
        }

        // --- 공용 저장 (예전 submissions 시트) ---
        async function saveSubmission(b, auth) {
            var exp = String(b.exp || '');
            if (!isGenericExp(exp)) fail('알 수 없는 실험입니다.');
            var group = cleanGroup(b.group), id = String(b.id || '');
            // 팀 이름 수업의 실험(필름통 로켓): 그 팀 자리를 잡은 폰만 그 팀 줄을 쓴다 (규칙도 같은 것을 확인)
            var owner = '';
            if (TEAM_EXPS[exp]) {
                needUid(auth);
                if (!isSpace(b.space)) fail('선생님 QR 로 들어온 팀만 보낼 수 있어요.');
                var t = await getOrNull('labClasses/' + b.space + '/teams/' + Number(group.split('-')[1]));
                if (!t || t.uid !== auth.uid) fail('이 팀의 폰이 아니에요. 처음 팀 이름을 정한 폰에서 보내 주세요.');
                owner = auth.uid;
            }
            if (!ID_RE.test(id)) fail('측정 번호(id)가 올바르지 않습니다.');
            var device = String(b.device || '');
            if (!DEVICE_RE.test(device)) fail('노트북 번호가 올바르지 않습니다.');
            var data = b.data == null ? '' : String(b.data);
            if (data.length > DATA_MAX) fail('보낸 자료가 너무 큽니다 (' + DATA_MAX + '자까지).');
            var rec = {
                exp: exp, group: group, id: id, device: device,
                title: text(String(b.title == null ? '' : b.title).trim() || '측정', 60),
                n: numIn(b.n, 0, 100000, '점 수'), summary: cleanSummary(b.summary), sentAt: text(b.sentAt, 40), data: data,
                timestamp: db.stamp(), expireAt: expireAt()
            };
            if (owner) rec.uid = owner;
            var path = itemsPath(spaceFor(b, group)) + '/' + docKey(exp, group, id);
            var old = await db.get(path);
            await db.set(path, rec);
            return { ok: true, id: id, updated: !!old };
        }
        async function listSubmissions(space, exp, group) {
            var rows = await db.query(itemsPath(space), [['exp', exp], ['group', group]], { live: true });
            return rows.map(function (r) {
                var d = r.data;
                return { exp: exp, group: group, id: String(d.id), device: String(d.device || ''), title: String(d.title || ''), n: Number(d.n) || 0,
                    summary: d.summary && typeof d.summary === 'object' ? d.summary : {}, sentAt: String(d.sentAt || ''), timestamp: iso(d.timestamp), data: String(d.data || '') };
            });
        }

        // --- 수업 ---
        async function findClass(body, cached) {
            var space = isSpace(body.space) ? body.space : '';
            var code = body['class'] != null && body['class'] !== '' ? cleanClass(body['class']) : '';
            if (!space) {
                if (!code) fail('수업 코드 형식이 올바르지 않습니다 (예: 2-4821).');
                var look = await getOrNull('labClassCodes/' + code);   // 찾기 기간이 지나면 규칙이 막음 → 못 찾음
                if (!look || !isSpace(look.space) || (look.joinUntil && new Date(look.joinUntil) < db.now())) return null;
                space = look.space;
            }
            var c = await db.get('labClasses/' + space, { cache: cached });
            if (!c || (code && c.classCode !== code)) return null;
            return Object.assign({ space: space }, c);
        }
        // mode: 띠 문구 ('look' = 👀 앞 화면을 봐요, 'phone' = ✍️ 내 화면에서 해요 — 장의 mode, js/lesson-slides.js)
        function lessonOut(L) { return L && typeof L === 'object' ? { on: L.on === true, stage: String(L.stage || ''), i: Number(L.i) || 0, key: String(L.key || ''), reveal: L.reveal === true, mode: L.mode === 'phone' ? 'phone' : 'look' } : null; }
        function aiLimitOf(c) { var n = Number(c && c.aiLimit); return c && c.aiLimit != null && isFinite(n) ? n : AI.LIMIT_DEFAULT; }   // 예전 수업(칸 없음)은 기본 20
        function publicClass(c) {
            return { ok: true, classCode: c.classCode, space: c.space, ban: c.ban, nStudents: c.nStudents, groupSize: c.groupSize, exp: c.exp,
                groups: c.groups || [], aiLimit: aiLimitOf(c), created: iso(c.createdAt), expireAt: iso(c.expireAt), mode: c.mode === 'team' ? 'team' : '', setup: c.setup || null,
                flow: c.flow === 'hd' ? 'hd' : '',   // 진행 방법: 'hd' = 가설연역 6단계, '' = 7단계(예전 수업 포함)
                stage: c.stage == null || !isFinite(Number(c.stage)) ? null : Number(c.stage),
                done: c.done === true, doneAt: c.done === true && c.doneAt ? iso(c.doneAt) : '',
                // 🎬 발표 보기 설명 화면 (없으면 이 수업은 설명 화면을 안 씀 → 학생 화면 답 가리기 없음)
                lesson: lessonOut(c.lesson), lessonOpen: Array.isArray(c.lessonOpen) ? c.lessonOpen.slice(0, LESSON_OPEN_MAX) : [] };
        }
        // ----- 팀 이름으로 입장 (mode 'team') -----
        async function teamList(c) {
            return (await db.query('labClasses/' + c.space + '/teams', [])).map(function (r) { return { jo: Number(r.id), name: String(r.data.name || ''), key: String(r.data.key || ''), uid: String(r.data.uid || '') }; })
                .filter(function (t) { return t.jo >= 1; }).sort(function (a, x) { return a.jo - x.jo; });
        }
        async function teamJoin(b, auth) {
            needUid(auth);
            var c = await findClass(b, false);
            if (!c) fail('그 수업을 찾지 못했습니다. 선생님이 보여 준 QR 을 다시 찍어 주세요.');
            if (c.mode !== 'team') fail('이 수업은 팀 이름으로 들어가는 수업이 아니에요.');
            var name = cleanTeamName(b.name), key = teamKey(name);
            if (!key) fail('팀 이름을 넣어 주세요 (12글자까지).');
            var device = String(b.device || '');
            for (var round = 0; round < 3; round++) {
                var teams = await teamList(c);
                var mine = teams.filter(function (t) { return t.uid === auth.uid; })[0];
                if (mine) {   // 이 폰은 이미 팀이 있음 → 그 팀으로 (새로고침·다시 들어오기)
                    var g0 = (c.groups || []).filter(function (x) { return Number(x.jo) === mine.jo; })[0];
                    return { ok: true, again: true, jo: mine.jo, num: 1, name: mine.name, group: g0 ? g0.code : '' };
                }
                if (teams.some(function (t) { return t.key === key; })) fail('같은 이름의 팀이 벌써 있어요. 다른 이름을 정해 주세요 (예: 이름 뒤에 숫자).');
                var used = {}; teams.forEach(function (t) { used[t.jo] = 1; });
                var g = (c.groups || []).filter(function (x) { return !used[Number(x.jo)]; })[0];
                if (!g) fail('팀 자리가 다 찼어요 (' + (c.groups || []).length + '팀). 선생님께 알려 주세요.');
                try {
                    await db.set('labClasses/' + c.space + '/teams/' + g.jo, { name: name, key: key, uid: auth.uid, device: DEVICE_RE.test(device) ? device : '', createdAt: db.stamp(), expireAt: classExpire(c) }, { create: true });
                    return { ok: true, jo: Number(g.jo), num: 1, name: name, group: g.code };
                } catch (e) {
                    if (!(e && (e.exists || /permission|insufficient|already/i.test(String(e.code || '') + String(e.message || ''))))) throw e;   // 같은 순간 다른 팀이 그 자리를 잡음 → 다시
                }
            }
            fail('팀 자리를 잡지 못했어요. 다시 눌러 주세요.');
        }
        // 수업 정보 다시 받기 (선생님이 행사 설정을 고친 뒤: 저장해 둔 것을 쓰지 않고 새로 읽음)
        async function classInfo(b) {
            var c = await findClass(b, false);
            if (!c) return { ok: false, error: '그 수업을 찾지 못했습니다.' };
            return publicClass(c);
        }
        // 교사: 학생에게 열 단계 수 (1 = 첫 단계만, 99 = 모두). 학생 화면은 수업 문서를 실시간으로 듣고 잠금·이동 (js/class-share.js)
        async function classStage(b, auth) {
            var c = await ownedClass(b, auth);
            var st = numIn(b.stage, 1, STAGE_ALL, '열 단계');
            if (st % 1) fail('열 단계는 정수로 넣어 주세요.');
            await db.update('labClasses/' + c.space, { stage: st });
            return { ok: true, stage: st };
        }
        /* 교사: 🎬 발표 보기의 설명 장 상태 (js/class-teacher.js). 학생 화면(js/class-share.js)이 수업 문서를 듣고
           lesson.on 이면 '👀 앞 화면을 봐요' 띠, lessonOpen 에 없는 key 의 답([data-lesson-answer])은 가림. 장을 넘길 때마다 한 번 씀 */
        async function classLesson(b, auth) {
            var c = await ownedClass(b, auth);
            var L = b.lesson && typeof b.lesson === 'object' ? b.lesson : {};
            var i = Math.round(Number(L.i));
            var lesson = { on: L.on === true, stage: STAGE_KEY_RE.test(String(L.stage || '')) ? String(L.stage) : '', i: isFinite(i) && i >= 0 && i < 200 ? i : 0,
                key: LESSON_KEY_RE.test(String(L.key || '')) ? String(L.key) : '', reveal: L.reveal === true, mode: L.mode === 'phone' ? 'phone' : 'look', at: db.stamp() };
            var fresh = await db.get('labClasses/' + c.space, { cache: false }) || c;
            var open = Array.isArray(fresh.lessonOpen) ? fresh.lessonOpen.slice(0, LESSON_OPEN_MAX) : [];
            var add = (Array.isArray(b.open) ? b.open : []).map(String).filter(function (k, j, arr) { return LESSON_KEY_RE.test(k) && open.indexOf(k) < 0 && arr.indexOf(k) === j; });
            var up = { lesson: lesson };
            if (add.length) { open = open.concat(add).slice(0, LESSON_OPEN_MAX); up.lessonOpen = open; }
            else if (!Array.isArray(fresh.lessonOpen)) up.lessonOpen = open;
            await db.update('labClasses/' + c.space, up);
            return { ok: true, lesson: lessonOut(lesson), lessonOpen: open };
        }
        // 교사: '✅ 수업 마치기' 표시 (저절로 판단하지 않음, 되돌릴 수 있음). 학생 화면은 그대로 둠
        async function classDone(b, auth) {
            var c = await ownedClass(b, auth);
            var done = b.done === true || b.done === 'true';
            await db.update('labClasses/' + c.space, { done: done, doneAt: done ? db.stamp() : null });
            return { ok: true, done: done };
        }
        /* ---------- 📖 선생님이 고친 수업 자료 (projects/lesson-editor.html, 그리는 쪽 js/lesson-slides.js applyEdit) ----------
           lessonEdits/{교사 uid}/exps/{실험}: 그 교사 본인만 읽고 씀(규칙), 학생은 읽지 않음. 교사 자료라 expireAt 없음(정리 작업 대상 아님).
           여기서는 모양·길이만 거름 — 화면에 그릴 때 js/lesson-slides.js 가 허용 태그만 남김(규칙으로 바로 쓴 글도 그렇게) */
        function needGoogle(auth) { if (!auth || !auth.google || !auth.uid) fail('선생님 구글 로그인이 필요합니다.'); }
        function lessonEditPath(auth, exp) { return 'lessonEdits/' + auth.uid + '/exps/' + exp; }
        function lessonExp(b) { var e = String(b.exp || ''); if (!LESSON_EXP_RE.test(e)) fail('실험 이름이 올바르지 않습니다.'); return e; }
        function cleanLessonEntry(x) {
            if (!x || typeof x !== 'object') return null;
            var o = {};
            var fields = function (src, dst) {
                Object.keys(LESSON_EDIT.FIELD).forEach(function (f) { if (typeof src[f] === 'string') dst[f] = block(src[f], LESSON_EDIT.FIELD[f]); });
                // 그림: 'my-img:<id>'(내 계정 그림 문서) 또는 ''(빼기, 기본 장만)
                ['img', 'revealImg'].forEach(function (f) { if (typeof src[f] === 'string' && (LESSON_IMG_REF_RE.test(src[f]) || (src[f] === '' && dst !== o))) dst[f] = src[f]; });
                if (src.vars && typeof src.vars === 'object') {
                    dst.vars = { change: text(src.vars.change, LESSON_EDIT.VAR), measure: text(src.vars.measure, LESSON_EDIT.VAR), predict: text(src.vars.predict, LESSON_EDIT.VAR),
                        keep: (Array.isArray(src.vars.keep) ? src.vars.keep : []).slice(0, LESSON_EDIT.KEEP).map(function (k) { return text(k, LESSON_EDIT.VAR); }) };
                }
            };
            if (x.add != null) {
                if (!LESSON_NEW_KEY_RE.test(String(x.add)) || LESSON_KINDS.indexOf(String(x.kind)) < 0) return null;
                o.add = String(x.add); o.kind = String(x.kind); fields(x, o);
                return o;
            }
            if (!LESSON_REF_RE.test(String(x.ref || ''))) return null;
            o.ref = String(x.ref);
            if (x.of != null) o.of = text(x.of, LESSON_EDIT.FIELD.title);
            if (x.hide === true) o.hide = true;
            if (x.set && typeof x.set === 'object') { o.set = {}; fields(x.set, o.set); if (!Object.keys(o.set).length) delete o.set; }
            return o;
        }
        async function lessonEditGet(b, auth) {
            needGoogle(auth);
            var d = await db.get(lessonEditPath(auth, lessonExp(b)));
            return { ok: true, edit: d ? { v: 1, exp: d.exp, stages: d.stages || {}, updatedAt: iso(d.updatedAt) } : null };
        }
        async function lessonEditSave(b, auth) {
            needGoogle(auth);
            var exp = lessonExp(b), e = b.edit && typeof b.edit === 'object' ? b.edit : null;
            if (!e || !e.stages || typeof e.stages !== 'object' || Array.isArray(e.stages)) fail('고친 자료 모양이 올바르지 않습니다.');
            var stages = {}, keys = Object.keys(e.stages);
            if (keys.length > LESSON_EDIT.STAGES) fail('단계가 너무 많습니다.');
            keys.forEach(function (sk) {
                if (!STAGE_KEY_RE.test(sk) || !Array.isArray(e.stages[sk])) return;
                if (e.stages[sk].length > LESSON_EDIT.SLIDES) fail('한 단계의 장은 ' + LESSON_EDIT.SLIDES + '장까지예요.');
                stages[sk] = e.stages[sk].map(cleanLessonEntry).filter(Boolean);
            });
            if (JSON.stringify(stages).length > LESSON_EDIT.BYTES) fail('고친 자료가 너무 커요. 긴 글을 줄여 주세요.');
            await db.set(lessonEditPath(auth, exp), { v: 1, exp: exp, stages: stages, updatedAt: db.stamp() });
            // 저장한 자료에서 더 쓰지 않는 그림은 지움 (올리고 저장하지 않은 그림·바꾼 그림의 옛 것)
            var used = refsOf(stages), imgs = await db.query(lessonImgColl(auth), [['exp', exp]]), gone = 0;
            for (var i = 0; i < imgs.length; i++) if (!used[imgs[i].id]) { await db.del(lessonImgColl(auth) + '/' + imgs[i].id); gone++; }
            return { ok: true, imagesRemoved: gone };
        }
        async function lessonEditReset(b, auth) {
            needGoogle(auth);
            var exp = lessonExp(b);
            await db.del(lessonEditPath(auth, exp));
            // 그 실험에 올린 그림도 함께 지움
            var imgs = await db.query(lessonImgColl(auth), [['exp', exp]]);
            for (var i = 0; i < imgs.length; i++) await db.del(lessonImgColl(auth) + '/' + imgs[i].id);
            return { ok: true, images: imgs.length };
        }
        // ---------- 내가 바꾼 그림 ----------
        function lessonImgColl(auth) { return 'lessonEdits/' + auth.uid + '/imgs'; }
        function refsOf(stages) {
            var ids = {};
            Object.keys(stages || {}).forEach(function (k) { (stages[k] || []).forEach(function (x) {
                [x, x && x.set].forEach(function (o) { if (o) ['img', 'revealImg'].forEach(function (f) { if (LESSON_IMG_REF_RE.test(String(o[f] || ''))) ids[o[f].slice(7)] = 1; }); });
            }); });
            return ids;
        }
        async function lessonImgSave(b, auth) {
            needGoogle(auth);
            var exp = lessonExp(b), data = String(b.data || '');
            if (!LESSON_IMG_DATA_RE.test(data)) fail('그림은 WebP·JPEG·PNG 만 올릴 수 있어요.');
            if (data.length > LESSON_IMG.CHARS) fail('그림이 너무 커요 (300KB 아래로 줄여 주세요).');
            var w = Math.round(Number(b.w)), h = Math.round(Number(b.h));
            if (!(w >= 1 && w <= LESSON_IMG.SIDE && h >= 1 && h <= LESSON_IMG.SIDE)) fail('그림 크기가 올바르지 않습니다.');
            var have = await db.query(lessonImgColl(auth), [['exp', exp]]);
            if (have.length >= LESSON_IMG.PER_EXP) fail('한 실험에 그림은 ' + LESSON_IMG.PER_EXP + '장까지예요. 안 쓰는 그림은 저장할 때 저절로 지워져요.');
            var id = 'i' + randomChars(15);
            await db.set(lessonImgColl(auth) + '/' + id, { exp: exp, data: data, w: w, h: h, createdAt: db.stamp() });
            return { ok: true, id: id, ref: 'my-img:' + id };
        }
        async function lessonImgGet(b, auth) {
            needGoogle(auth);
            var id = String(b.id || '');
            if (!LESSON_IMG_ID_RE.test(id)) fail('그림 번호가 올바르지 않습니다.');
            var d = await db.get(lessonImgColl(auth) + '/' + id);
            if (!d) return { ok: false, error: '그 그림을 찾지 못했습니다.' };
            return { ok: true, id: id, data: String(d.data || ''), w: d.w, h: d.h, exp: d.exp };
        }
        // 어느 실험에 고친 자료가 있는지 (편집 화면의 실험 고르기 카드에 '✏️ 고침' 표시)
        async function lessonEditList(b, auth) {
            needGoogle(auth);
            var rows = await db.query('lessonEdits/' + auth.uid + '/exps', []);
            return { ok: true, edits: rows.map(function (r) { return { exp: r.id, updatedAt: iso(r.data.updatedAt) }; }) };
        }
        // 교사: 행사 설정만 고치기 (예비 실험 값·목표)
        async function classSetup(b, auth) {
            var c = await ownedClass(b, auth);
            var setup = cleanSetup(b.setup) || {};
            await db.update('labClasses/' + c.space, { setup: setup });
            return { ok: true, setup: setup };
        }
        async function createClass(b, auth) {
            if (!auth || !auth.google) fail('선생님 구글 로그인이 필요합니다.');
            var team = b.mode === 'team';
            var ban = numIn(b.ban, 1, 99, '반'), n = numIn(team ? b.nTeams : b.nStudents, 1, team ? TEAM.MAX : 60, team ? '팀 수' : '학생 수'), size = team ? 1 : numIn(b.groupSize, 1, 10, '조별 인원');
            if (ban % 1 || n % 1 || size % 1) fail('반·학생 수·조별 인원은 정수로 넣어 주세요.');
            var exp = String(b.exp || '');
            if (!isClassExp(exp)) fail('이 실험은 아직 수업 연결을 쓸 수 없습니다.');
            if (team && !TEAM_EXPS[exp]) fail('이 실험은 팀 이름으로 입장할 수 없습니다.');
            if (!team && TEAM_EXPS[exp]) fail('이 실험은 \u2018팀 이름으로 입장\u2019 수업으로만 만들 수 있어요.');
            var setup = cleanSetup(b.setup);
            var aiLimit = b.aiLimit === '' || b.aiLimit == null ? AI.LIMIT_DEFAULT : numIn(b.aiLimit, 0, AI.LIMIT_MAX, 'AI 질문 한도');
            if (aiLimit % 1) fail('AI 질문 한도는 정수로 넣어 주세요.');
            // 아직 쓰이는(찾기 기간이 남은) 코드와 겹치지 않는 4자리
            var code = '';
            for (var t = 0; t < 30 && !code; t++) {
                var c = ban + '-' + ('000' + Math.floor(Math.random() * 10000)).slice(-4);
                // 찾기 기간이 지난 코드는 규칙이 읽기를 막음(permission-denied) → 비어 있는 것으로 보고 다시 씀(규칙이 덮어쓰기 허용)
                var old = await getOrNull('labClassCodes/' + c);
                if (!old || (old.joinUntil && new Date(old.joinUntil) < db.now())) code = c;
            }
            if (!code) fail('수업 코드를 만들지 못했습니다. 다시 눌러 주세요.');
            var four = code.split('-')[1], space = newSpace('c'), now = db.now(), exp2 = expireAt();
            var groups = splitGroups(n, size).map(function (k, i) { return { jo: i + 1, code: ban + '-' + (i + 1) + '-' + four, size: k }; });
            var rec = { owner: auth.uid, classCode: code, ban: ban, nStudents: n, groupSize: size, exp: exp, groups: groups, aiLimit: aiLimit, createdAt: now, expireAt: exp2 };
            if (team) rec.mode = 'team';
            if (setup) rec.setup = setup;
            if (b.flow != null && b.flow !== '' && b.flow !== 'report' && b.flow !== 'hd') fail('진행 방법은 7단계 또는 가설연역만 고를 수 있어요.');
            if (b.flow === 'hd') { if (team) fail('팀 이름 수업은 가설연역으로 만들 수 없어요.'); rec.flow = 'hd'; }   // 만든 뒤에는 바꾸지 않음 (규칙)
            rec.stage = b.stage == null || b.stage === '' ? 1 : numIn(b.stage, 1, STAGE_ALL, '열 단계');   // 학생이 볼 수 있는 단계 수 (교사 화면 '▶ 다음 단계 열기'). 예전 수업은 칸이 없음 = 모두 열림
            await db.set('labClasses/' + space, rec);
            await db.set('labClassCodes/' + code, { space: space, owner: auth.uid, joinUntil: new Date(now.getTime() + JOIN_DAYS * 86400000), expireAt: exp2 });
            return publicClass(Object.assign({ space: space }, rec));
        }
        async function getOrNull(path) {
            try { return await db.get(path); }
            catch (e) { if (/permission|insufficient/i.test(String(e && (e.code || '') + (e.message || '')))) return null; throw e; }
        }
        // 수업 코드 다시 열기 (주인만): 코드로 찾기를 지금부터 JOIN_DAYS 동안 다시 허용
        async function reopenCode(b, auth) {
            var c = await ownedClass(b, auth);
            var cur = await getOrNull('labClassCodes/' + c.classCode);
            if (cur && cur.space !== c.space) fail('이 수업 코드(' + c.classCode + ')는 지금 다른 수업이 쓰고 있어요. 학생에게 QR·링크로 들어오라고 해 주세요.');
            var until = new Date(db.now().getTime() + JOIN_DAYS * 86400000);
            await db.set('labClassCodes/' + c.classCode, { space: c.space, owner: auth.uid, joinUntil: until, expireAt: c.expireAt instanceof Date ? c.expireAt : expireAt() });
            return { ok: true, classCode: c.classCode, joinUntil: until.toISOString() };
        }
        async function joinInfo(b) {
            var c = await findClass(b, true);
            if (!c) return { ok: false, error: '그 수업 코드를 찾지 못했습니다. 선생님이 보여 준 코드나 QR 을 다시 확인하세요.' };
            return publicClass(c);
        }
        // 학생 자리 문서: 노트북(또는 수업 QR 로 연 폰·태블릿)은 '조-번호', 그 자리의 📱 폰 측정 화면(폰 QR)은 '조-번호-p' 에 따로
        //  (2026-11-21: 같은 문서를 번갈아 덮어써 단계·점 수·제출 표시가 마지막에 쓴 쪽으로 바뀌던 것). uid = 쓴 기기(익명 로그인) — 옮길 때 자기 것만 지움
        function seatPath(c, jo, num, phone) { return 'labClasses/' + c.space + '/progress/' + jo + '-' + num + (phone ? '-p' : ''); }
        async function seatOf(b) {
            var c = await findClass(b, true);
            if (!c) fail('그 수업 코드를 찾지 못했습니다.');
            var jo = numIn(b.jo, 1, 99, '조'), num = numIn(b.num, 1, 10, '번호');
            var g = (c.groups || []).filter(function (x) { return Number(x.jo) === jo; })[0];
            if (!g || num % 1 || num > Number(g.size)) fail('이 수업에 없는 조·번호입니다.');
            return { c: c, jo: jo, num: num, g: g };
        }
        async function heartbeat(b, auth) {
            var s = await seatOf(b), c = s.c;
            var step = String(b.step || ''), device = String(b.device || '');
            var doc = {
                jo: s.jo, num: s.num, group: s.g.code, step: STEP_RE.test(step) ? step : '', points: numIn(b.points, 0, 100000, '측정 점 수', true),
                submitted: !!b.submitted, device: DEVICE_RE.test(device) ? device : '', lastSeen: db.stamp(), expireAt: c.expireAt instanceof Date ? c.expireAt : expireAt()
            };
            if (auth && auth.uid) doc.uid = String(auth.uid);
            await db.set(seatPath(c, s.jo, s.num, !!b.phone), doc);
            return { ok: true };
        }
        // 조·번호를 바꾼 기기: 옛 자리 문서를 지움. 그 사이 다른 기기가 그 자리를 쓰고 있으면(uid 가 다름) 그대로 둠 — 규칙도 자기 uid 문서만 지우게 함
        async function leaveSeat(b, auth) {
            var s = await seatOf(b), path = seatPath(s.c, s.jo, s.num, !!b.phone), d;
            try { d = await db.get(path); } catch (e) { d = undefined; }   // 학생은 진행 문서를 읽을 수 없음(규칙) → 지우기 시도만, 규칙이 가림
            if (d === null) return { ok: true, removed: false };
            if (d && (!auth || !auth.uid || d.uid !== auth.uid)) return { ok: true, removed: false, kept: true };
            try { await db.del(path); } catch (e) { return { ok: true, removed: false, kept: true }; }
            return { ok: true, removed: true };
        }
        // 교사 화면용: 한 자리의 노트북 문서와 📱 폰 문서를 한 학생으로 합침 (점 수는 큰 쪽, 제출은 한 번이라도, 마지막 활동은 늦은 쪽)
        function mergeSeats(rows) {
            var by = {}, order = [];
            rows.forEach(function (r) {
                var x = r.data, phone = /-p$/.test(String(r.id || '')), key = Number(x.jo) + '-' + Number(x.num);
                var one = { jo: Number(x.jo), num: Number(x.num), step: String(x.step || ''), points: x.points === '' || x.points == null ? null : Number(x.points),
                    submitted: !!x.submitted, lastSeen: iso(x.lastSeen), device: String(x.device || '') };
                if (!by[key]) { by[key] = { main: null, phone: null }; order.push(key); }
                by[key][phone ? 'phone' : 'main'] = one;
            });
            return order.map(function (k) {
                var m = by[k].main, p = by[k].phone;
                if (!p) return m;
                if (!m) return p;
                var pts = [m.points, p.points].filter(function (v) { return v != null; });
                return { jo: m.jo, num: m.num, step: m.step, points: pts.length ? Math.max.apply(null, pts) : null, submitted: m.submitted || p.submitted,
                    lastSeen: String(p.lastSeen) > String(m.lastSeen) ? p.lastSeen : m.lastSeen, device: m.device,
                    phone: { step: p.step, points: p.points, submitted: p.submitted, lastSeen: p.lastSeen, device: p.device } };
            });
        }
        async function ownedClass(b, auth) {
            if (!auth || !auth.google) fail('선생님 구글 로그인이 필요합니다.');
            var c = await findClass(b, true);
            if (!c) fail('그 수업을 찾지 못했습니다.');
            if (c.owner !== auth.uid) fail('이 수업을 만든 선생님만 볼 수 있습니다.');
            return c;
        }
        async function classItems(c, live) { return db.query(itemsPath(c.space), [['exp', c.exp === 'pendulum' || c.exp === 'planck' || isGenericExp(c.exp) ? c.exp : '-']], { live: live }); }
        async function classStatus(b, auth) {
            var c = await ownedClass(b, auth);
            var prog = await db.query('labClasses/' + c.space + '/progress', [], { live: true });
            var students = mergeSeats(prog);
            var subs = {}, devs = {};
            (c.groups || []).forEach(function (g) { subs[g.code] = { code: g.code, jo: g.jo, rows: 0, labels: [], leds: [], devices: 0, lastSent: '', hCurrent: '', errorPct: '', summary: null }; });
            (await classItems(c, true)).forEach(function (r) {
                var d = r.data, s = subs[d.group];
                if (!s) return;
                if (c.exp === 'planck') {
                    if (!(Number(d.nIV) + Number(d.nGlow))) return;
                    s.rows++; s.leds.push(String(d.led)); s.labels.push(String(d.led));
                    (devs[d.group] = devs[d.group] || {})[String(d.device)] = true;
                    if (String(d.sentAt) >= s.lastSent) { s.lastSent = String(d.sentAt); if (d['h_current_e-34'] !== '') { s.hCurrent = Number(d['h_current_e-34']); s.errorPct = d.error_pct === '' ? '' : Number(d.error_pct); } }
                } else if (c.exp === 'pendulum') {
                    s.rows++; s.labels.push('L ' + d.L + ' m');
                    (devs[d.group] = devs[d.group] || {})[String(d.device || 'phone')] = true;
                    var at = String(d.measuredAt || '');
                    if (at >= s.lastSent) { s.lastSent = at; s.summary = { L: Number(d.L), T: Number(d.T_mean) }; }
                } else {
                    if (!Number(d.n)) return;
                    s.rows++; s.labels.push(String(d.title));
                    (devs[d.group] = devs[d.group] || {})[String(d.device)] = true;
                    if (String(d.sentAt) >= s.lastSent) { s.lastSent = String(d.sentAt); s.summary = d.summary || {}; }
                }
            });
            Object.keys(devs).forEach(function (gc) { subs[gc].devices = Object.keys(devs[gc]).length; });
            var out = publicClass(c);
            if (c.mode === 'team') out.teams = (await teamList(c)).map(function (t) { return { jo: t.jo, name: t.name }; });
            out.now = db.now().toISOString();
            out.students = students;
            out.submissions = (c.groups || []).map(function (g) { return subs[g.code]; });
            return out;
        }
        // 교사: 내려받기용 모든 줄 (자료 포함)
        async function classExport(b, auth) {
            var c = await ownedClass(b, auth);
            var rows = (await classItems(c, false)).map(function (r) { var o = {}; Object.keys(r.data).forEach(function (k) { o[k] = r.data[k] instanceof Date ? r.data[k].toISOString() : r.data[k]; }); return o; });
            if (c.exp === 'pendulum') {
                for (var i = 0; i < rows.length; i++) {
                    if (!rows[i].hasRaw) continue;
                    var raw = await db.get('labSpaces/' + c.space + '/raw/' + docKey('pendulum', rows[i].group, rows[i].id));
                    if (raw) rows[i].raw = (raw.raw || []).join('');
                }
            }
            var out = publicClass(c);
            if (c.mode === 'team') out.teams = (await teamList(c)).map(function (t) { return { jo: t.jo, name: t.name }; });
            out.items = rows.filter(function (d) { return c.exp === 'planck' ? Number(d.nIV) + Number(d.nGlow) > 0 : c.exp === 'pendulum' ? true : Number(d.n) > 0; });
            return out;
        }
        async function myClasses(b, auth) {
            if (!auth || !auth.google) fail('선생님 구글 로그인이 필요합니다.');
            var rows = await db.query('labClasses', [['owner', auth.uid]]);
            var list = rows.map(function (r) { return publicClass(Object.assign({ space: r.id }, r.data)); });
            list.sort(function (a, c) { return String(c.created).localeCompare(String(a.created)); });
            return { ok: true, classes: list };
        }
        async function deleteClass(b, auth) {
            var c = await ownedClass(b, auth);
            var paths = [];
            (await db.query('labClasses/' + c.space + '/progress', [])).forEach(function (r) { paths.push('labClasses/' + c.space + '/progress/' + r.id); });
            (await db.query(itemsPath(c.space), [])).forEach(function (r) { paths.push(itemsPath(c.space) + '/' + r.id); });
            (await db.query('labSpaces/' + c.space + '/raw', [])).forEach(function (r) { paths.push('labSpaces/' + c.space + '/raw/' + r.id); });
            for (var sub of ['aiAsk', 'reports', 'aiDesk', 'teams']) (await db.query('labClasses/' + c.space + '/' + sub, [])).forEach(function (r) { paths.push('labClasses/' + c.space + '/' + sub + '/' + r.id); });
            for (var i = 0; i < paths.length; i++) await db.del(paths[i]);
            var look = await db.get('labClassCodes/' + c.classCode);
            if (look && look.space === c.space) await db.del('labClassCodes/' + c.classCode);
            await db.del('labClasses/' + c.space);
            return { ok: true, deleted: paths.length };
        }

        // --- 개발 데이터 (선생님 기기만: 규칙이 roles/{uid}.isTeacher 를 확인) ---
        async function devSave(b, auth) {
            if (!auth || !auth.google) fail('개발 데이터는 선생님 구글 로그인 기기에서만 보낼 수 있습니다.');
            var exp = String(b.exp || '');
            if (!DEV_EXPS[exp]) fail('개발 데이터를 받지 않는 실험입니다.');
            var id = String(b.id || '');
            if (!ID_RE.test(id)) fail('측정 번호(id)가 올바르지 않습니다.');
            var device = String(b.device || '');
            if (!DEVICE_RE.test(device)) fail('기기 번호가 올바르지 않습니다.');
            var data = b.data == null ? '' : (typeof b.data === 'string' ? b.data : JSON.stringify(b.data));
            if (data.length > DATA_MAX) fail('보낸 자료가 너무 큽니다 (' + DATA_MAX + '자까지).');
            var path = 'devlog/' + exp + '~' + id, old = await db.get(path);
            await db.set(path, { exp: exp, id: id, measuredAt: text(b.measuredAt, 40), device: device, summary: cleanSummary(b.summary), data: data, owner: auth.uid, timestamp: db.stamp(), expireAt: expireAt() });
            return { ok: true, id: id, updated: !!old };
        }
        // 서버 쪽(GitHub Actions·시험)만: since 뒤에 저장된 것을 시각 순으로 40개씩
        async function devExport(b, auth) {
            if (!auth || !auth.admin) fail('관리자만 내보낼 수 있습니다.');
            var since = b.since ? Date.parse(String(b.since)) : 0;
            if (b.since && !isFinite(since)) fail('since 시각이 올바르지 않습니다.');
            var list = (await db.query('devlog', [])).map(function (r) { var t = r.data.timestamp; return { d: r.data, ms: t instanceof Date ? t.getTime() : Date.parse(String(t)) || 0 }; })
                .filter(function (x) { return x.ms > since; }).sort(function (a, c) { return a.ms - c.ms; });
            var page = list.slice(0, 40);
            while (page.length < list.length && list[page.length].ms === page[page.length - 1].ms) page.push(list[page.length]);
            return { ok: true, more: list.length > page.length, items: page.map(function (x) {
                return { timestamp: new Date(x.ms).toISOString(), exp: x.d.exp, id: x.d.id, measuredAt: iso(x.d.measuredAt), device: x.d.device, summary: x.d.summary || {}, data: String(x.d.data || '') };
            }) };
        }

        // --- 보고서 AI · 보고서 글 (js/report-ai.js) ---
        function classPath(c, sub) { return 'labClasses/' + c.space + '/' + sub; }
        function needUid(auth) { if (!auth || !auth.uid) fail('로그인 정보가 없습니다. 페이지를 새로고침하세요.'); }
        function classExpire(c) { return c.expireAt instanceof Date ? c.expireAt : expireAt(); }
        async function joinedClass(b) {
            var c = await findClass(b, true);
            if (!c) fail('그 수업을 찾지 못했습니다. 선생님이 준 QR·링크로 다시 들어오세요.');
            return c;
        }
        function groupIn(c, group) {
            var g = (c.groups || []).filter(function (x) { return x.code === group; })[0];
            if (!g) fail('이 수업에 없는 조 코드입니다. 위 🏫 수업 참여에서 조·번호를 다시 고르세요.');
            return g;
        }
        function publicAsk(id, d, full) {
            var o = { id: id, group: String(d.group || ''), jo: Number(d.jo) || 0, exp: String(d.exp || ''), section: String(d.section || ''), sectionName: String(d.sectionName || ''),
                prompt: String(d.prompt || ''), attach: Array.isArray(d.attach) ? d.attach.map(String) : [], status: String(d.status || 'wait'),
                answer: String(d.answer || ''), error: String(d.error || ''), provider: String(d.provider || ''), model: String(d.model || ''),
                used: d.used == null ? null : Number(d.used), limit: d.limit == null ? null : Number(d.limit), verify: String(d.verify || ''),
                createdAt: iso(d.createdAt), answeredAt: iso(d.answeredAt || ''), busyAt: iso(d.busyAt || ''), device: String(d.device || '') };
            if (full) { o.draft = String(d.draft || ''); o.calc = String(d.calc || ''); o.uid = String(d.uid || ''); }   // uid: 교사 화면이 기기별 상한을 셈
            return o;
        }
        function byTime(a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)); }
        // 학생: 질문 하나 만들기 (답 칸은 비움 — 규칙도 막음)
        async function aiAsk(b, auth) {
            needUid(auth);
            var c = await joinedClass(b), group = cleanGroup(b.group), g = groupIn(c, group);
            if (!aiLimitOf(c)) fail('이 수업은 선생님이 AI 질문을 끄셨어요 (한도 0).');
            var section = String(b.section || '');
            if (!SECTION_RE.test(section)) fail('보고서 항목이 올바르지 않습니다.');
            var prompt = block(b.prompt, AI.PROMPT + 1).trim();
            if (!prompt) fail('AI 에게 물을 내용(프롬프트)을 먼저 쓰세요.');
            if (prompt.length > AI.PROMPT) fail('프롬프트가 너무 깁니다 (' + AI.PROMPT + '자까지).');
            var attach = (Array.isArray(b.attach) ? b.attach : []).map(String).filter(function (x, i, a) { return (x === 'draft' || x === 'calc') && a.indexOf(x) === i; });
            var draft = attach.indexOf('draft') >= 0 ? block(b.draft, AI.DRAFT) : '', calc = attach.indexOf('calc') >= 0 ? block(b.calc, AI.CALC) : '';
            var device = String(b.device || ''), id = 'a' + randomChars(19);
            await db.set(classPath(c, 'aiAsk') + '/' + id, {
                uid: auth.uid, group: group, jo: Number(g.jo), exp: text(c.exp, 60), section: section, sectionName: text(b.sectionName, 40),
                prompt: prompt, attach: attach, draft: draft, calc: calc, device: DEVICE_RE.test(device) ? device : '', status: 'wait',
                createdAt: db.stamp(), expireAt: classExpire(c)
            });
            return { ok: true, id: id };
        }
        // 학생: 내가(이 기기의 익명 uid) 만든 질문과 답 + 선생님 화면이 켜져 있는지
        async function aiMine(b, auth) {
            needUid(auth);
            var c = await joinedClass(b);
            var rows = await db.query(classPath(c, 'aiAsk'), [['uid', auth.uid]], { live: true });
            var desk = await getOrNull(classPath(c, 'aiDesk') + '/status');
            return { ok: true, limit: aiLimitOf(c), now: db.now().toISOString(), desk: deskInfo(desk),
                asks: rows.map(function (r) { return publicAsk(r.id, r.data, false); }).sort(byTime) };
        }
        function deskInfo(d) {
            if (!d) return { on: false, seenAt: '', fresh: false };
            var seen = d.seenAt instanceof Date ? d.seenAt.getTime() : Date.parse(String(d.seenAt || ''));
            return { on: !!d.on, seenAt: iso(d.seenAt), provider: String(d.provider || ''), model: String(d.model || ''), fresh: !!d.on && isFinite(seen) && db.now().getTime() - seen < AI.DESK_MS };
        }
        async function aiVerify(b, auth) {
            needUid(auth);
            var c = await joinedClass(b), id = String(b.id || '');
            if (!ASK_ID_RE.test(id)) fail('질문 번호가 올바르지 않습니다.');
            var path = classPath(c, 'aiAsk') + '/' + id, d = await getOrNull(path);
            if (!d || d.uid !== auth.uid) fail('그 질문을 찾지 못했습니다.');
            await db.update(path, { verify: block(b.verify, AI.VERIFY) });
            return { ok: true };
        }
        // 교사: 이 수업의 모든 질문 (진행 보기·AI 답하기)
        async function aiList(b, auth) {
            var c = await ownedClass(b, auth);
            var rows = await db.query(classPath(c, 'aiAsk'), [], { live: true });
            return { ok: true, space: c.space, classCode: c.classCode, limit: aiLimitOf(c), groups: c.groups || [], asks: rows.map(function (r) { return publicAsk(r.id, r.data, true); }).sort(byTime) };
        }
        // 교사: 답하기 전에 '답하는 중'으로 잡기 (교사 화면 두 개가 같은 질문을 두 번 부르지 않게)
        async function aiClaim(b, auth) {
            var c = await ownedClass(b, auth), id = String(b.id || '');
            if (!ASK_ID_RE.test(id)) fail('질문 번호가 올바르지 않습니다.');
            var path = classPath(c, 'aiAsk') + '/' + id, d = await db.get(path);
            if (!d) fail('그 질문을 찾지 못했습니다.');
            var busyMs = d.busyAt instanceof Date ? d.busyAt.getTime() : Date.parse(String(d.busyAt || ''));
            if (d.status !== 'wait' && !(d.status === 'busy' && isFinite(busyMs) && db.now().getTime() - busyMs > AI.STALE_MS)) return { ok: false, taken: true, error: '이미 다른 화면이 답하는 중이에요.' };
            try { await db.update(path, { status: 'busy', busyAt: db.stamp() }); }
            catch (e) { return { ok: false, taken: true, error: friendlyError(e) }; }
            return { ok: true };
        }
        async function aiAnswer(b, auth) {
            var c = await ownedClass(b, auth), id = String(b.id || '');
            if (!ASK_ID_RE.test(id)) fail('질문 번호가 올바르지 않습니다.');
            var status = String(b.status || '');
            if (['done', 'error', 'limit', 'wait'].indexOf(status) < 0) fail('답 상태가 올바르지 않습니다.');
            var path = classPath(c, 'aiAsk') + '/' + id;
            if (!(await db.get(path))) fail('그 질문을 찾지 못했습니다.');
            if (status === 'wait') { await db.update(path, { status: 'wait' }); return { ok: true }; }   // 키·한도 문제로 못 답함 → 다시 기다리게
            var up = { status: status, answer: block(b.answer, AI.ANSWER), error: text(b.error, 300), provider: text(b.provider, 20), model: text(b.model, 60),
                answeredAt: db.stamp(), used: numIn(b.used, 0, 100000, '사용 횟수', true) || 0, limit: numIn(b.limit, 0, AI.LIMIT_MAX, '한도', true) || 0 };
            await db.update(path, up);
            return { ok: true };
        }
        // 교사: AI 켜짐 신호 (1분마다). 학생 화면은 2분 30초 안에 신호가 있으면 '선생님 화면 켜짐'
        async function aiDeskBeat(b, auth) {
            var c = await ownedClass(b, auth);
            await db.set(classPath(c, 'aiDesk') + '/status', { on: !!b.on, provider: text(b.provider, 20), model: text(b.model, 60), seenAt: db.stamp(), expireAt: classExpire(c) });
            return { ok: true };
        }
        // 학생: 보고서 글 저장 (기기마다 하나: 조코드~uid). submit 이면 최종 제출 — 그 뒤로는 학생이 못 고침
        function cleanSections(v) {
            var out = {};
            if (v == null) return out;
            if (typeof v !== 'object' || Array.isArray(v)) fail('보고서 형식이 올바르지 않습니다.');
            var keys = Object.keys(v);
            if (keys.length > AI.SECTIONS) fail('보고서 항목이 너무 많습니다.');
            keys.forEach(function (k) { if (!SECTION_RE.test(k)) fail('보고서 항목 이름이 올바르지 않습니다.'); out[k] = block(v[k], AI.TEXT); });
            return out;
        }
        async function reportSave(b, auth) {
            needUid(auth);
            var c = await joinedClass(b), group = cleanGroup(b.group), g = groupIn(c, group);
            var path = classPath(c, 'reports') + '/' + group + '~' + auth.uid, old = await getOrNull(path);
            if (old && old.submitted) fail('이미 최종 제출했어요. 고치려면 선생님께 다시 열어 달라고 하세요.');
            var ex = b.external && typeof b.external === 'object' ? b.external : {}, device = String(b.device || '');
            var rec = { uid: auth.uid, group: group, jo: Number(g.jo), exp: text(c.exp, 60), device: DEVICE_RE.test(device) ? device : '', sections: cleanSections(b.sections),
                external: { prompt: block(ex.prompt, AI.EXTERNAL), adopted: block(ex.adopted, AI.EXTERNAL), verify: block(ex.verify, AI.EXTERNAL) },
                submitted: !!b.submit, updatedAt: db.stamp(), expireAt: classExpire(c) };
            if (b.submit) rec.submittedAt = db.stamp();
            await db.set(path, rec);
            return { ok: true, submitted: rec.submitted, updated: !!old };
        }
        function publicReport(id, d) {
            return { id: id, group: String(d.group || ''), jo: Number(d.jo) || 0, exp: String(d.exp || ''), device: String(d.device || ''),
                sections: d.sections && typeof d.sections === 'object' ? d.sections : {}, external: d.external && typeof d.external === 'object' ? d.external : {},
                submitted: !!d.submitted, submittedAt: iso(d.submittedAt || ''), updatedAt: iso(d.updatedAt) };
        }
        async function reportGet(b, auth) {
            needUid(auth);
            var c = await joinedClass(b), group = cleanGroup(b.group);
            var path = classPath(c, 'reports') + '/' + group + '~' + auth.uid, d = await getOrNull(path);
            if (!d || d.uid !== auth.uid) return { ok: true, report: null };
            return { ok: true, report: publicReport(group + '~' + auth.uid, d) };
        }
        async function reportList(b, auth) {
            var c = await ownedClass(b, auth);
            var rows = await db.query(classPath(c, 'reports'), [], { live: true });
            return { ok: true, reports: rows.map(function (r) { return publicReport(r.id, r.data); }).sort(function (a, x) { return a.jo - x.jo || a.updatedAt.localeCompare(x.updatedAt); }) };
        }
        // 교사: 최종 제출한 보고서를 학생이 다시 고칠 수 있게
        async function reportReopen(b, auth) {
            var c = await ownedClass(b, auth), id = String(b.id || '');
            if (!/^\d{1,2}-\d{1,2}-\d{4}~[A-Za-z0-9_-]{1,128}$/.test(id)) fail('보고서 번호가 올바르지 않습니다.');
            var path = classPath(c, 'reports') + '/' + id;
            if (!(await db.get(path))) fail('그 보고서를 찾지 못했습니다.');
            await db.update(path, { submitted: false });
            return { ok: true };
        }

        async function handle(body, auth) {
            body = body || {};
            try {
                var a = body.action, exp = body.exp == null ? '' : String(body.exp);
                if (a === 'ping') return { ok: true, version: VERSION, store: 'firestore' };
                if (a === 'save') {
                    if (exp === 'planck') return await savePlanck(body);
                    if (exp && exp !== 'pendulum') return await saveSubmission(body, auth);
                    return await saveMeasurement(body);
                }
                if (a === 'list' || a === 'raw') {
                    var group = cleanGroup(body.group), space = spaceFor(body, group);
                    if (a === 'raw') {
                        if (!ID_RE.test(String(body.id || ''))) fail('측정 번호(id)가 올바르지 않습니다.');
                        return await rawOf(space, group, String(body.id));
                    }
                    if (exp === 'planck') return { ok: true, group: group, items: await listPlanck(space, group) };
                    if (exp && exp !== 'pendulum') {
                        if (!isGenericExp(exp)) fail('알 수 없는 실험입니다.');
                        return { ok: true, group: group, exp: exp, items: await listSubmissions(space, exp, group) };
                    }
                    return { ok: true, group: group, items: await listPendulum(space, group) };
                }
                if (a === 'createClass') return await createClass(body, auth);
                if (a === 'joinInfo') return await joinInfo(body);
                if (a === 'heartbeat') return await heartbeat(body, auth);
                if (a === 'leaveSeat') return await leaveSeat(body, auth);
                if (a === 'teamJoin') return await teamJoin(body, auth);
                if (a === 'classInfo') return await classInfo(body);
                if (a === 'classSetup') return await classSetup(body, auth);
                if (a === 'classStage') return await classStage(body, auth);
                if (a === 'classDone') return await classDone(body, auth);
                if (a === 'classLesson') return await classLesson(body, auth);
                if (a === 'lessonEditGet') return await lessonEditGet(body, auth);
                if (a === 'lessonEditSave') return await lessonEditSave(body, auth);
                if (a === 'lessonEditReset') return await lessonEditReset(body, auth);
                if (a === 'lessonEditList') return await lessonEditList(body, auth);
                if (a === 'lessonImgSave') return await lessonImgSave(body, auth);
                if (a === 'lessonImgGet') return await lessonImgGet(body, auth);
                if (a === 'classStatus') return await classStatus(body, auth);
                if (a === 'classExport') return await classExport(body, auth);
                if (a === 'myClasses') return await myClasses(body, auth);
                if (a === 'deleteClass') return await deleteClass(body, auth);
                if (a === 'reopenCode') return await reopenCode(body, auth);
                if (a === 'devSave') return await devSave(body, auth);
                if (a === 'aiAsk') return await aiAsk(body, auth);
                if (a === 'aiMine') return await aiMine(body, auth);
                if (a === 'aiVerify') return await aiVerify(body, auth);
                if (a === 'aiList') return await aiList(body, auth);
                if (a === 'aiClaim') return await aiClaim(body, auth);
                if (a === 'aiAnswer') return await aiAnswer(body, auth);
                if (a === 'aiDeskBeat') return await aiDeskBeat(body, auth);
                if (a === 'reportSave') return await reportSave(body, auth);
                if (a === 'reportGet') return await reportGet(body, auth);
                if (a === 'reportList') return await reportList(body, auth);
                if (a === 'reportReopen') return await reportReopen(body, auth);
                if (a === 'devExport') return await devExport(body, auth);
                fail('알 수 없는 요청입니다.');
            } catch (err) {
                if (err && err.userError) return { ok: false, error: err.message };
                return isNetworkError(err) ? { ok: false, error: friendlyError(err), network: true } : { ok: false, error: friendlyError(err) };
            }
        }
        return { handle: handle };
    }
    /* 진짜 인터넷 문제인지 (시간 초과·오프라인·fetch 실패·도구를 못 불러옴). 로그인 꺼짐·권한·한도 오류는 아님
       → network: true 는 이때만 붙인다 (필름통 로켓 등은 이때만 '폰에 저장하고 나중에 보내기', 아니면 진짜 이유를 보여 줌) */
    function isNetworkError(err) {
        var code = String(err && err.code || ''), msg = String(err && err.message || err);
        if (/operation-not-allowed|admin-restricted|permission-denied|insufficient permissions|resource-exhausted|quota|unauthenticated/i.test(code + msg)) return false;
        return /auth\/network-request-failed|unavailable|deadline-exceeded|offline|failed to fetch|load failed|networkerror|network ?error|시간 초과|불러오지 못함/i.test(code + ' ' + msg);
    }
    function friendlyError(err) {
        var code = String(err && err.code || ''), msg = String(err && err.message || err);
        if (/operation-not-allowed|admin-restricted/i.test(code + msg)) return '익명 로그인이 꺼져 있어요. 선생님: Firebase 콘솔 → Authentication → 로그인 방법 → 익명 사용.';
        if (/permission-denied|insufficient permissions/i.test(code + msg)) return '저장소가 요청을 막았어요 (권한 없음). 링크·QR 을 다시 확인하거나 선생님께 알려 주세요.';
        if (isNetworkError(err) || /unavailable|network|offline/i.test(code + msg)) return '인터넷에 연결하지 못했어요 (' + msg.slice(0, 80) + ').';
        if (/resource-exhausted|quota/i.test(code + msg)) return '오늘 저장소 사용 한도를 넘었어요. 선생님께 알려 주세요.';
        return msg.slice(0, 200);
    }

    // ---------- 메모리 DB (Node 시험·가짜 서버) ----------
    function memoryDb(opts) {
        opts = opts || {};
        var docs = new Map();
        var clock = opts.now || function () { return new Date(); };
        function clone(v) { return v instanceof Date ? new Date(v.getTime()) : Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.keys(v).reduce(function (o, k) { o[k] = clone(v[k]); return o; }, {}) : v; }
        return {
            docs: docs,
            now: function () { return clock(); },
            stamp: function () { return clock(); },
            get: function (path) { return Promise.resolve(docs.has(path) ? clone(docs.get(path)) : null); },
            // opt.create: 이미 있으면 실패 (Firestore 는 규칙이 팀 자리 덮어쓰기를 막아 같은 결과)
            set: function (path, data, opt) {
                if (opt && opt.create && docs.has(path)) { var e = new Error('already exists'); e.exists = true; return Promise.reject(e); }
                docs.set(path, clone(data)); return Promise.resolve();
            },
            update: function (path, data) {
                if (!docs.has(path)) return Promise.reject(Object.assign(new Error('없는 문서: ' + path), { code: 'not-found' }));
                docs.set(path, Object.assign(docs.get(path), clone(data))); return Promise.resolve();
            },
            del: function (path) { docs.delete(path); return Promise.resolve(); },
            query: function (coll, filters) {
                var pre = coll + '/', out = [];
                docs.forEach(function (d, p) {
                    if (p.indexOf(pre) !== 0 || p.slice(pre.length).indexOf('/') >= 0) return;
                    if ((filters || []).every(function (f) { return d[f[0]] === f[1]; })) out.push({ id: p.slice(pre.length), data: clone(d) });
                });
                return Promise.resolve(out);
            },
            dump: function (prefix) { var o = {}; docs.forEach(function (d, p) { if (!prefix || p.indexOf(prefix) === 0) o[p] = clone(d); }); return o; }
        };
    }

    // ---------- 브라우저: Firebase 불러오기·익명 로그인·Firestore 어댑터 ----------
    var FB_VER = '9.22.2';
    var FB_CONFIG = {   // 사이트 공개 웹 설정 (index.html·js/phone-accel-cloud.js 와 같음)
        apiKey: 'AIzaSyCYVme6ZP-iyspRmHTtuUSsKXe7K_D0vJQ',
        authDomain: 'web-experiment-f9b24.firebaseapp.com',
        projectId: 'web-experiment-f9b24',
        storageBucket: 'web-experiment-f9b24.firebasestorage.app',
        messagingSenderId: '718758606428',
        appId: '1:718758606428:web:e11ed8d0b64a471ee65899'
    };
    function loadScript(src) {
        return new Promise(function (res, rej) {
            var s = document.createElement('script');
            s.src = src; s.onload = res; s.onerror = function () { rej(new Error('불러오지 못함: ' + src)); };
            document.head.appendChild(s);
        });
    }
    var fbReady = null, APP_NAME = 'lab-store';
    function firebaseReady() {
        if (fbReady) return fbReady;
        fbReady = (async function () {
            var base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
            if (typeof firebase === 'undefined' || !firebase.initializeApp) await loadScript(base + 'firebase-app-compat.js');
            if (!firebase.auth) await loadScript(base + 'firebase-auth-compat.js');
            if (!firebase.firestore) await loadScript(base + 'firebase-firestore-compat.js');
            // 따로 이름 붙인 앱: 페이지가 스스로 Firebase 를 켜도(구글 로그인 제출 등) 겹치지 않게
            var app = firebase.apps.filter(function (a) { return a.name === APP_NAME; })[0] || firebase.initializeApp(FB_CONFIG, APP_NAME);
            return { auth: function () { return app.auth(); }, firestore: function () { return app.firestore(); }, raw: firebase };
        })();
        fbReady.catch(function () { fbReady = null; });
        return fbReady;
    }
    function waitUser(fb) {
        var a = fb.auth();
        return new Promise(function (res) { var off = a.onAuthStateChanged(function (u) { off(); res(u); }); });
    }
    var teacherCache = {};
    function userInfo(fb, u) {
        if (!u) return null;
        var google = !u.isAnonymous && (u.providerData || []).some(function (p) { return p && p.providerId === 'google.com'; });
        return { uid: u.uid, google: google, anonymous: !!u.isAnonymous, email: u.email || '', name: u.displayName || '' };
    }
    // 지금 사용자 (없으면 화면에 안 보이는 익명 로그인)
    async function ensureUser() {
        if (fakeUrl()) {
            // 시험: 익명 로그인이 꺼진 Firebase 흉내 (window.LAB_STORE_FAKE_AUTH_ERROR = 'auth/admin-restricted-operation')
            if (window.LAB_STORE_FAKE_AUTH_ERROR) { var ae = new Error('Firebase: Error (' + window.LAB_STORE_FAKE_AUTH_ERROR + ').'); ae.code = String(window.LAB_STORE_FAKE_AUTH_ERROR); throw ae; }
            return fakeUser();
        }
        var fb = await firebaseReady();
        var u = fb.auth().currentUser || await waitUser(fb);
        if (!u) u = (await fb.auth().signInAnonymously()).user;
        return userInfo(fb, u);
    }
    async function signInGoogle() {
        if (fakeUrl()) { var t = { uid: 'teacher-1', google: true, email: 'teacher@example.com', name: '시험 선생님', teacher: true }; setFakeUser(t); notify(t); return t; }
        var fb = await firebaseReady();
        var p = new fb.raw.auth.GoogleAuthProvider();
        await fb.auth().signInWithPopup(p);
        var info = userInfo(fb, fb.auth().currentUser); notify(info); return info;
    }
    async function signOut() {
        if (fakeUrl()) { setFakeUser(null); notify(null); return; }
        var fb = await firebaseReady(); await fb.auth().signOut(); notify(null);
    }
    async function currentUser() {
        if (fakeUrl()) { var f = readFakeUser(); return f && f.google ? f : f; }
        var fb = await firebaseReady();
        return userInfo(fb, fb.auth().currentUser || await waitUser(fb));
    }
    // 사이트 관리 교사인지 — 개발 데이터 수집에 씀
    async function isTeacher() {
        var u = await currentUser();
        if (!u || !u.google) return false;
        if (fakeUrl()) return !!u.teacher;
        if (teacherCache[u.uid] != null) return teacherCache[u.uid];
        // 규칙(firestore.rules isTeacher)이 교사에게만 devlog 읽기를 허락하므로, 한 개 읽어 보기로 확인
        try { var fb = await firebaseReady(); await fb.firestore().collection('devlog').limit(1).get(); teacherCache[u.uid] = true; }
        catch (e) { teacherCache[u.uid] = false; }
        return teacherCache[u.uid];
    }
    var userListeners = [];
    function onUser(cb) {
        userListeners.push(cb);
        if (fakeUrl()) { setTimeout(function () { cb(readFakeUser()); }, 0); return; }
        firebaseReady().then(function (fb) { fb.auth().onAuthStateChanged(function (u) { cb(userInfo(fb, u)); }); }, function () { cb(null); });
    }
    function notify(u) { if (fakeUrl()) userListeners.forEach(function (cb) { try { cb(u); } catch (e) { /* 무시 */ } }); }

    // Firestore 어댑터: live 질문은 실시간 듣기로 한 번 붙여 두고 그 뒤로는 받아 둔 것을 돌려준다 (몇 초마다 불러와도 읽기 횟수가 늘지 않음)
    function firestoreDb(fb) {
        var fs = fb.firestore(), live = {}, cacheDocs = {}, LIVE_MAX = 30, order = [];   // 30: 교사 화면이 수업 여러 개의 AI 질문을 함께 들음
        function conv(v) {
            if (v && typeof v.toDate === 'function') return v.toDate();
            if (Array.isArray(v)) return v.map(conv);
            if (v && typeof v === 'object') return Object.keys(v).reduce(function (o, k) { o[k] = conv(v[k]); return o; }, {});
            return v;
        }
        function q(coll, filters) { var r = fs.collection(coll); (filters || []).forEach(function (f) { r = r.where(f[0], '==', f[1]); }); return r; }
        function rows(snap) { return snap.docs.map(function (d) { return { id: d.id, data: conv(d.data({ serverTimestamps: 'estimate' })) }; }); }
        function liveQuery(coll, filters) {
            var key = coll + '|' + JSON.stringify(filters || []), L = live[key];
            if (L) { L.used = Date.now(); return L.ready.then(function () { return L.rows; }); }
            L = live[key] = { rows: [], cbs: [], used: Date.now() };
            L.ready = new Promise(function (res, rej) {
                var first = true;
                L.off = q(coll, filters).onSnapshot(function (snap) {
                    L.rows = rows(snap);
                    if (first) { first = false; res(); } else L.cbs.forEach(function (cb) { try { cb(); } catch (e) { /* 무시 */ } });
                }, function (err) { delete live[key]; if (first) { first = false; rej(err); } });
            });
            order.push(key);
            while (order.length > LIVE_MAX) { var old = order.shift(); if (live[old] && old !== key) { try { live[old].off(); } catch (e) { /* 무시 */ } delete live[old]; } }
            return L.ready.then(function () { return L.rows; });
        }
        return {
            now: function () { return new Date(); },
            stamp: function () { return fb.raw.firestore.FieldValue.serverTimestamp(); },
            get: function (path, opt) {
                if (opt && opt.cache && cacheDocs[path]) return cacheDocs[path];
                var p = fs.doc(path).get().then(function (d) { return d.exists ? conv(d.data()) : null; });
                if (opt && opt.cache) { cacheDocs[path] = p; p.then(function (v) { if (!v) delete cacheDocs[path]; }, function () { delete cacheDocs[path]; }); }
                return p;
            },
            set: function (path, data) { return fs.doc(path).set(data); },
            update: function (path, data) { return fs.doc(path).update(data); },
            del: function (path) { return fs.doc(path).delete(); },
            query: function (coll, filters, opt) { return opt && opt.live ? liveQuery(coll, filters) : q(coll, filters).get().then(rows); },
            subscribeDoc: function (path, cb) {
                return fs.doc(path).onSnapshot(function (d) { cb(d.exists ? conv(d.data()) : null); }, function () { /* 끊기면 다음에 다시 */ });
            },
            subscribe: function (coll, filters, cb) {
                var key = coll + '|' + JSON.stringify(filters || []);
                return liveQuery(coll, filters).then(function () { var L = live[key]; if (!L) return function () {}; L.cbs.push(cb); return function () { L.cbs = L.cbs.filter(function (x) { return x !== cb; }); }; });
            }
        };
    }
    var browserCore = null, browserDb = null;
    async function getCore() {
        if (browserCore) return browserCore;
        var fb = await firebaseReady();
        browserDb = firestoreDb(fb);
        browserCore = core(browserDb);
        return browserCore;
    }

    // ---------- 시험용 가짜 서버로 보내기 ----------
    function fakeUrl() { return typeof window !== 'undefined' && window.LAB_STORE_FAKE_URL ? String(window.LAB_STORE_FAKE_URL) : ''; }
    var FAKE_USER_KEY = 'lab-store:fake-user';
    function readFakeUser() { try { return JSON.parse(localStorage.getItem(FAKE_USER_KEY) || 'null'); } catch (e) { return null; } }
    function setFakeUser(u) { try { if (u) localStorage.setItem(FAKE_USER_KEY, JSON.stringify(u)); else localStorage.removeItem(FAKE_USER_KEY); } catch (e) { /* 무시 */ } }
    function fakeUser() {
        var u = readFakeUser();
        if (!u) { u = { uid: 'anon-' + randomChars(10), google: false, anonymous: true }; setFakeUser(u); }
        return u;
    }

    /* 요청 하나: url = 'lab:공간' (뒤에 ?action=… 이 붙어 있으면 그 값도), body = 보낼 내용(없으면 주소의 값) */
    async function call(url, body, ms) {
        var p = parseUrl(url), b = Object.assign({}, p.params, body || {});
        if (p.space && !b.space) b.space = p.space;
        delete b._;
        var run = (async function () {
            var auth = await ensureUser();
            if (fakeUrl()) {
                var res = await fetch(fakeUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ body: b, auth: auth }) });
                return res.json();
            }
            return (await getCore()).handle(b, auth);
        })();
        return withTimeout(run, ms || 20000).catch(function (e) { var o = { ok: false, error: friendlyError(e) }; if (isNetworkError(e)) o.network = true; return o; });
    }
    function withTimeout(p, ms) {
        return new Promise(function (res, rej) {
            var t = setTimeout(function () { rej(new Error('시간 초과 — 인터넷 연결을 확인하세요')); }, ms);
            p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
        });
    }
    /* 실시간: 같은 조의 새 측정이 들어오면 cb() (Firestore 일 때만. 가짜 서버면 null → 몇 초마다 불러오기가 대신함) */
    async function watch(url, exp, group, cb) {
        if (fakeUrl() || !GROUP_RE.test(String(group || ''))) return null;
        try {
            var space = spaceOf(url) || groupSpace(group);
            await getCore();
            return await browserDb.subscribe('labSpaces/' + space + '/items', [['exp', exp && exp !== 'pendulum' ? exp : 'pendulum'], ['group', group]], cb);
        } catch (e) { return null; }
    }
    /* 수업 문서(열린 단계·행사 설정)를 실시간으로: cb({ stage, setup }) — 가짜 서버면 null (부르는 쪽이 몇 초마다 classInfo) */
    async function watchClassDoc(url, cb) {
        if (fakeUrl()) return null;
        try {
            var space = spaceOf(url); if (!space) return null;
            await getCore();
            return browserDb.subscribeDoc ? browserDb.subscribeDoc('labClasses/' + space, function (d) {
                if (d) cb({ stage: d.stage == null ? null : Number(d.stage), setup: d.setup || null,
                    lesson: d.lesson && typeof d.lesson === 'object' ? { on: d.lesson.on === true, stage: String(d.lesson.stage || ''), i: Number(d.lesson.i) || 0, key: String(d.lesson.key || ''), reveal: d.lesson.reveal === true, mode: d.lesson.mode === 'phone' ? 'phone' : 'look' } : null,
                    lessonOpen: Array.isArray(d.lessonOpen) ? d.lessonOpen.slice(0, LESSON_OPEN_MAX) : [] });
            }) : null;
        } catch (e) { return null; }
    }
    async function watchClass(url, classCode, cb) {
        if (fakeUrl()) return null;
        try {
            var space = spaceOf(url); if (!space) return null;
            await getCore();
            return await browserDb.subscribe('labClasses/' + space + '/progress', [], cb);
        } catch (e) { return null; }
    }

    // ---------- 교사 화면: 내려받기 CSV (엑셀에서 한글이 안 깨지게 UTF-8 BOM) ----------
    var BASE_COLS = [['jo', '조'], ['group', '조 코드'], ['device', '보낸 기기'], ['id', '회차 번호'], ['title', '회차 이름'], ['n', '점 수'], ['sentAt', '보낸 시각']];
    var PEND_COLS = [['L', '줄 길이 L (m)'], ['amplitude', '진폭 (°)'], ['T_mean', '주기 T 평균 (s)'], ['T_std', 'T 표준편차 (s)'], ['T_sem', 'T 표준오차 (s)'], ['nPeriods', '주기 수'], ['kind', '센서 (gyro 회전 속도 / acc 가속도)'], ['sensorAxis', '축'], ['rate', '기록 빈도 (Hz)'], ['source', '자료 (sensor 측정 / simulation)'], ['note', '메모'], ['rawInfo', '원본 정보']];
    var PLANCK_CSV = [['led', 'LED'], ['lambda_nm', '파장 λ (nm)'], ['V0_current', '문턱 전압 V₀ 전류 기준 (V)'], ['V0_glow', '문턱 전압 V₀ 빛 기준 (V)'], ['nIV', 'I–V 점 수'], ['nGlow', '빛 기준 점 수'], ['h_current_e-34', 'h 전류 기준 (×10⁻³⁴ J·s)'], ['error_pct', '오차율 (%)'], ['R2', '결정계수 R²'], ['h_glow_e-34', 'h 빛 기준 (×10⁻³⁴ J·s)'], ['curMode', '문턱 전압 방법'], ['iMin', '직선 기준 전류 (mA)']];
    var EXCEL_CELL = 32000;
    function csvCell(v) {
        if (v == null) return '';
        var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;   // 엑셀이 수식으로 읽지 않게
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function bigCell(s, label) { s = String(s == null ? '' : s); return s.length > EXCEL_CELL ? '(너무 큼 ' + s.length + '자 — 전체 자료(JSON)로 받으세요)' : s; }
    /* exp: 실험, items: classExport 의 items, groups: 수업의 조 목록 → { csv, rows }
       한 줄 = 한 회차. 맨 위 한 줄은 열 이름(단위 포함). summary 는 실험이 정한 이름 그대로 열이 된다 */
    function toCsv(exp, items, groups) {
        var joOf = {}, teamOf = {}, hasTeam = false;
        (groups || []).forEach(function (g) { joOf[g.code] = g.jo; if (g.team) { teamOf[g.code] = g.team; hasTeam = true; } });   // 팀 이름 수업: groups 에 team 을 붙여 주면 '팀 이름' 열
        var cols = BASE_COLS.slice(), extra = exp === 'pendulum' ? PEND_COLS : exp === 'planck' ? PLANCK_CSV : [];
        cols = cols.concat(extra);
        if (hasTeam) cols.splice(1, 0, ['team', '팀 이름']);
        var sumKeys = [];
        (items || []).forEach(function (d) { Object.keys(d.summary || {}).forEach(function (k) { if (sumKeys.indexOf(k) < 0) sumKeys.push(k); }); });
        var dataCol = exp === 'pendulum' ? ['raw', '원본 (압축, 진자 분석 화면에서 읽음)'] : exp === 'planck' ? null : ['data', '자료 (JSON)'];
        var head = cols.map(function (c) { return c[1]; }).concat(sumKeys.map(function (k) { return '요약: ' + k; }));
        if (exp === 'planck') head.push('I–V 측정값 [V, I(mA), …] (JSON)', '빛 기준 전압 (JSON)');
        if (dataCol) head.push(dataCol[1]);
        var sorted = (items || []).slice().sort(function (a, b) { return (joOf[a.group] || 0) - (joOf[b.group] || 0) || String(a.sentAt || a.measuredAt || '').localeCompare(String(b.sentAt || b.measuredAt || '')); });
        var lines = [head.map(csvCell).join(',')];
        sorted.forEach(function (d) {
            var row = cols.map(function (c) {
                if (c[0] === 'jo') return joOf[d.group] || '';
                if (c[0] === 'team') return teamOf[d.group] || '';
                if (c[0] === 'title' && exp === 'pendulum') return 'L ' + d.L + ' m';
                if (c[0] === 'title' && exp === 'planck') return d.led;
                if (c[0] === 'n' && exp === 'pendulum') return d.nPeriods;
                if (c[0] === 'n' && exp === 'planck') return Number(d.nIV || 0) + Number(d.nGlow || 0);
                if (c[0] === 'sentAt') return d.sentAt || d.measuredAt || d.timestamp || '';
                return d[c[0]];
            });
            sumKeys.forEach(function (k) { row.push(d.summary ? d.summary[k] : ''); });
            if (exp === 'planck') row.push(bigCell(d.ivData), bigCell(d.glowData));
            if (dataCol) row.push(bigCell(d[dataCol[0]]));
            lines.push(row.map(csvCell).join(','));
        });
        return { csv: '﻿' + lines.join('\r\n') + '\r\n', rows: sorted.length };
    }

    /* 보고서 AI 기록 CSV: 한 줄 = 질문 하나(웹앱 안) 또는 보고서 하나의 외부 AI 기록. 프롬프트·답·검증 메모 포함 */
    var AI_STATUS = { wait: '기다리는 중', busy: '답하는 중', done: '답함', error: '오류', limit: '한도 넘음' };
    function aiCsv(asks, reports, groups) {
        var joOf = {}; (groups || []).forEach(function (g) { joOf[g.code] = g.jo; });
        var head = ['조', '조 코드', '어디서', '보고서 항목', '시각', '프롬프트', '함께 보낸 참고 자료', '보낸 내 초안', '보낸 계산 결과', 'AI 답 (외부: 채택한 부분)', '검증·수정 메모', '상태', 'AI 회사', '모델', '조 사용 횟수', '한도'];
        var rows = [];
        (asks || []).forEach(function (q) {
            rows.push([joOf[q.group] || q.jo || '', q.group, '웹앱 안', q.sectionName || q.section, q.createdAt, q.prompt,
                (q.attach || []).map(function (x) { return x === 'draft' ? '내 초안' : x === 'calc' ? '계산 결과' : x; }).join('·') || '없음',
                q.draft || '', q.calc || '', q.status === 'done' ? q.answer : q.error || q.answer, q.verify, AI_STATUS[q.status] || q.status, q.provider, q.model, q.used == null ? '' : q.used, q.limit == null ? '' : q.limit]);
        });
        (reports || []).forEach(function (r) {
            var e = r.external || {};
            if (!(e.prompt || e.adopted || e.verify)) return;
            rows.push([joOf[r.group] || r.jo || '', r.group, '외부 AI (학생이 적음)', '', r.updatedAt, e.prompt || '', '', '', '', e.adopted || '', e.verify || '', '', '', '', '', '']);
        });
        rows.sort(function (a, b) { return (Number(a[0]) || 0) - (Number(b[0]) || 0) || String(a[4]).localeCompare(String(b[4])); });
        return { csv: '\ufeff' + [head].concat(rows).map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n', rows: rows.length };
    }
    /* 보고서 CSV: 한 줄 = 보고서 하나(기기 하나). sections: [{ key, name }] (없으면 들어온 항목 이름 그대로) */
    function reportCsv(reports, groups, sections) {
        var joOf = {}; (groups || []).forEach(function (g) { joOf[g.code] = g.jo; });
        var secs = (sections || []).slice();
        (reports || []).forEach(function (r) { Object.keys(r.sections || {}).forEach(function (k) { if (!secs.some(function (x) { return x.key === k; })) secs.push({ key: k, name: k }); }); });
        var head = ['조', '조 코드', '기기', '최종 제출', '제출 시각', '마지막 저장'].concat(secs.map(function (x) { return x.name; }), ['외부 AI: 내가 쓴 프롬프트', '외부 AI: 채택한 부분', '외부 AI: 검증·고친 점']);
        var sorted = (reports || []).slice().sort(function (a, b) { return (joOf[a.group] || a.jo || 0) - (joOf[b.group] || b.jo || 0); });
        var lines = [head.map(csvCell).join(',')];
        sorted.forEach(function (r) {
            var e = r.external || {};
            lines.push([joOf[r.group] || r.jo || '', r.group, r.device, r.submitted ? '제출' : '쓰는 중', r.submittedAt, r.updatedAt].concat(
                secs.map(function (x) { return (r.sections || {})[x.key] || ''; }), [e.prompt || '', e.adopted || '', e.verify || '']).map(csvCell).join(','));
        });
        return { csv: '\ufeff' + lines.join('\r\n') + '\r\n', rows: sorted.length };
    }

    return {
        AI: AI, aiCsv: aiCsv, reportCsv: reportCsv,
        VERSION: VERSION, TTL_DAYS: TTL_DAYS, SPACE_RE: SPACE_RE, JOIN_DAYS: JOIN_DAYS,
        core: core, memoryDb: memoryDb, firestoreDb: firestoreDb, call: call, watch: watch, watchClass: watchClass, watchClassDoc: watchClassDoc, STAGE_ALL: STAGE_ALL,
        newSpace: newSpace, isSpace: isSpace, isLabUrl: isLabUrl, urlOf: urlOf, spaceOf: spaceOf, groupSpace: groupSpace, parseUrl: parseUrl, docKey: docKey,
        ensureUser: ensureUser, currentUser: currentUser, signInGoogle: signInGoogle, signOut: signOut, onUser: onUser, isTeacher: isTeacher,
        cleanTeamName: cleanTeamName, teamKey: teamKey, cleanSetup: cleanSetup, TEAM: TEAM,
        friendlyError: friendlyError, isNetworkError: isNetworkError,
        toCsv: toCsv, csvCell: csvCell, isClassExp: isClassExp, isGenericExp: isGenericExp, GENERIC_EXPS: GENERIC_EXPS
    };
});
