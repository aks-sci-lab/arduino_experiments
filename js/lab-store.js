/* 실험실 저장소 — Firebase(Firestore) 로 수업 연결·조 공유·폰→노트북 전송 (2026-11-18, Apps Script 대신)
   브라우저·Node 공용. 예전 서버(apps-script/Code.gs)가 하던 요청을 같은 모양으로 받아 Firestore 에 저장한다.
   그래서 실험 페이지(js/class-share.js·pendulum-*·planck-*)는 거의 고치지 않고, 요청이 가는 곳만 바뀐다.

   주소 대신 '공간(space)': 'lab:<공간 id>'
     c… 24자  수업 하나 (교사가 만들 때 무작위, 학생 QR·링크의 ?s= 에 담김 → 남이 맞히기 어려움)
     p… 24자  수업 없이 노트북↔폰 짝 (노트북이 무작위로 만들어 폰 QR 에 담음)
     ''       조 코드만 넣어 쓰는 경우 → 공간 = 'g' + 조 코드 (사람이 코드를 그대로 옮겨 적어야 해서 맞히기 쉬움)
   Firestore 모양 (규칙: firestore.rules 의 lab… 부분)
     labSpaces/{공간}/items/{실험~조~id}   측정 한 줄 (진자·플랑크·공용 모두)
     labSpaces/{공간}/raw/{같은 id}         진자 원본(목록에서 빼려고 따로)
     labClasses/{공간}                      수업 (주인 = 교사 uid)
     labClasses/{공간}/progress/{조-번호}   학생 진행 (하트비트)
     labClassCodes/{수업 코드}              학생이 메인 화면에서 수업 코드만 넣었을 때 공간 찾기
     devlog/{실험~id}                       개발 데이터 (선생님 기기)
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
    var GENERIC_EXPS = { idealgas: 1, accel: 1, env: 1, light: 1, uv: 1, phoneaccel: 1, malus: 1, eminduction: 1, freefall: 1, nano: 1, heartrate: 1, qdot: 1 };   // qdot: 퀀텀닷 용액(PR #120)
    var CLASS_EXPS = { planck: 1, pendulum: 1 };
    Object.keys(GENERIC_EXPS).forEach(function (k) { CLASS_EXPS[k] = 1; });
    var CUSTOM_EXP_RE = /^custom:[A-Za-z0-9_-]{1,40}$/;
    var DEV_EXPS = { heartrate: 1, facehr: 1 };
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
        async function saveSubmission(b) {
            var exp = String(b.exp || '');
            if (!isGenericExp(exp)) fail('알 수 없는 실험입니다.');
            var group = cleanGroup(b.group), id = String(b.id || '');
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
        function publicClass(c) {
            return { ok: true, classCode: c.classCode, space: c.space, ban: c.ban, nStudents: c.nStudents, groupSize: c.groupSize, exp: c.exp,
                groups: c.groups || [], created: iso(c.createdAt), expireAt: iso(c.expireAt) };
        }
        async function createClass(b, auth) {
            if (!auth || !auth.google) fail('선생님 구글 로그인이 필요합니다.');
            var ban = numIn(b.ban, 1, 99, '반'), n = numIn(b.nStudents, 1, 60, '학생 수'), size = numIn(b.groupSize, 1, 10, '조별 인원');
            if (ban % 1 || n % 1 || size % 1) fail('반·학생 수·조별 인원은 정수로 넣어 주세요.');
            var exp = String(b.exp || '');
            if (!isClassExp(exp)) fail('이 실험은 아직 수업 연결을 쓸 수 없습니다.');
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
            var rec = { owner: auth.uid, classCode: code, ban: ban, nStudents: n, groupSize: size, exp: exp, groups: groups, createdAt: now, expireAt: exp2 };
            await db.set('labClasses/' + space, rec);
            await db.set('labClassCodes/' + code, { space: space, owner: auth.uid, joinUntil: new Date(now.getTime() + JOIN_DAYS * 86400000), expireAt: exp2 });
            return { ok: true, classCode: code, space: space, ban: ban, nStudents: n, groupSize: size, exp: exp, groups: groups, created: now.toISOString(), expireAt: exp2.toISOString() };
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
        async function heartbeat(b) {
            var c = await findClass(b, true);
            if (!c) fail('그 수업 코드를 찾지 못했습니다.');
            var jo = numIn(b.jo, 1, 99, '조'), num = numIn(b.num, 1, 10, '번호');
            var g = (c.groups || []).filter(function (x) { return Number(x.jo) === jo; })[0];
            if (!g || num % 1 || num > Number(g.size)) fail('이 수업에 없는 조·번호입니다.');
            var step = String(b.step || ''), device = String(b.device || '');
            await db.set('labClasses/' + c.space + '/progress/' + jo + '-' + num, {
                jo: jo, num: num, group: g.code, step: STEP_RE.test(step) ? step : '', points: numIn(b.points, 0, 100000, '측정 점 수', true),
                submitted: !!b.submitted, device: DEVICE_RE.test(device) ? device : '', lastSeen: db.stamp(), expireAt: c.expireAt instanceof Date ? c.expireAt : expireAt()
            });
            return { ok: true };
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
            var students = prog.map(function (r) {
                var x = r.data;
                return { jo: Number(x.jo), num: Number(x.num), step: String(x.step || ''), points: x.points === '' || x.points == null ? null : Number(x.points),
                    submitted: !!x.submitted, lastSeen: iso(x.lastSeen), device: String(x.device || '') };
            });
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

        async function handle(body, auth) {
            body = body || {};
            try {
                var a = body.action, exp = body.exp == null ? '' : String(body.exp);
                if (a === 'ping') return { ok: true, version: VERSION, store: 'firestore' };
                if (a === 'save') {
                    if (exp === 'planck') return await savePlanck(body);
                    if (exp && exp !== 'pendulum') return await saveSubmission(body);
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
                if (a === 'heartbeat') return await heartbeat(body);
                if (a === 'classStatus') return await classStatus(body, auth);
                if (a === 'classExport') return await classExport(body, auth);
                if (a === 'myClasses') return await myClasses(body, auth);
                if (a === 'deleteClass') return await deleteClass(body, auth);
                if (a === 'reopenCode') return await reopenCode(body, auth);
                if (a === 'devSave') return await devSave(body, auth);
                if (a === 'devExport') return await devExport(body, auth);
                fail('알 수 없는 요청입니다.');
            } catch (err) {
                if (err && err.userError) return { ok: false, error: err.message };
                return { ok: false, error: friendlyError(err) };
            }
        }
        return { handle: handle };
    }
    function friendlyError(err) {
        var code = String(err && err.code || ''), msg = String(err && err.message || err);
        if (/permission-denied|insufficient permissions/i.test(code + msg)) return '저장소가 요청을 막았어요 (권한 없음). 링크·QR 을 다시 확인하거나 선생님께 알려 주세요.';
        if (/unavailable|network|offline|failed to get document because the client is offline/i.test(code + msg)) return '인터넷에 연결하지 못했어요 (' + msg.slice(0, 80) + ').';
        if (/resource-exhausted|quota/i.test(code + msg)) return '오늘 저장소 사용 한도를 넘었어요. 선생님께 알려 주세요.';
        if (/operation-not-allowed|admin-restricted/i.test(code + msg)) return '익명 로그인이 꺼져 있어요. 선생님: Firebase 콘솔 → Authentication → 로그인 방법 → 익명 사용.';
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
            set: function (path, data) { docs.set(path, clone(data)); return Promise.resolve(); },
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
        if (fakeUrl()) return fakeUser();
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
        var fs = fb.firestore(), live = {}, cacheDocs = {}, LIVE_MAX = 8, order = [];
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
            del: function (path) { return fs.doc(path).delete(); },
            query: function (coll, filters, opt) { return opt && opt.live ? liveQuery(coll, filters) : q(coll, filters).get().then(rows); },
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
        return withTimeout(run, ms || 20000).catch(function (e) { return { ok: false, error: friendlyError(e), network: true }; });
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
        var joOf = {}; (groups || []).forEach(function (g) { joOf[g.code] = g.jo; });
        var cols = BASE_COLS.slice(), extra = exp === 'pendulum' ? PEND_COLS : exp === 'planck' ? PLANCK_CSV : [];
        cols = cols.concat(extra);
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

    return {
        VERSION: VERSION, TTL_DAYS: TTL_DAYS, SPACE_RE: SPACE_RE, JOIN_DAYS: JOIN_DAYS,
        core: core, memoryDb: memoryDb, firestoreDb: firestoreDb, call: call, watch: watch, watchClass: watchClass,
        newSpace: newSpace, isSpace: isSpace, isLabUrl: isLabUrl, urlOf: urlOf, spaceOf: spaceOf, groupSpace: groupSpace, parseUrl: parseUrl, docKey: docKey,
        ensureUser: ensureUser, currentUser: currentUser, signInGoogle: signInGoogle, signOut: signOut, onUser: onUser, isTeacher: isTeacher,
        toCsv: toCsv, csvCell: csvCell, isClassExp: isClassExp, isGenericExp: isGenericExp, GENERIC_EXPS: GENERIC_EXPS
    };
});
