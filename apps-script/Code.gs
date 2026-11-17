/**
 * 스마트폰 진자 실험 — 선생님 구글 시트에 붙이는 Apps Script (센서 기반 실험실)
 *
 * 설치(1번만): 구글 시트 → 확장 프로그램 → Apps Script → 이 내용을 통째로 붙여 넣고 저장
 *   → (5판부터) ⚙ 프로젝트 설정 → "appsscript.json 매니페스트 파일을 편집기에 표시" 켜기 → appsscript.json 에 사이트의 같은 파일 붙여 넣기
 *   → https://script.google.com/home/usersettings 에서 'Google Apps Script API' 켜기 (스스로 업데이트에 필요)
 *   → 배포 → 새 배포 → 유형 '웹 앱' → 실행: 나 / 액세스: 모든 사용자 → 배포 → 권한 허용 → 웹 앱 주소 복사
 *   자세한 안내: https://aks-sci-lab.web.app/projects/pendulum-setup.html
 *   5판부터는 교사 화면(projects/class-teacher.html)의 '🔄 업데이트' 단추로 이 코드가 사이트의 공식 새 코드로 스스로 바뀐다.
 *
 * 하는 일
 *   POST (본문은 JSON 글자, Content-Type: text/plain → 브라우저가 미리보기 요청을 보내지 않음)
 *     { action: 'save', id, group, L, amplitude, note, ... , raw: ['원본 조각', ...] }  → measurements 시트에 한 줄 (같은 id 면 고쳐 씀)
 *   GET ?action=list&group=2-3-4821   → 그 조의 측정 목록 (원본 데이터는 빼고)
 *   GET ?action=raw&group=…&id=…       → 측정 한 개의 원본 데이터 조각
 *   GET ?action=ping                    → 연결 확인
 *
 *   LED 플랑크 상수 실험(projects/planck-led.html)도 같은 시트를 쓴다 (exp: 'planck', 3판부터):
 *   POST { action: 'save', exp: 'planck', id, group, device, led, lambda, V0…, iv, glow }  → planck 시트에 LED 하나당 한 줄 (같은 id 면 고쳐 씀)
 *   GET ?action=list&exp=planck&group=2-3-4821  → 그 조가 보낸 LED 측정값 (같은 조의 다른 노트북이 불러감)
 *
 *   수업 연결(4판부터, 교사·학생 모두 구글 로그인 없이): 수업 코드 = 반-4자리(예: 2-4821), 조 코드 = 반-조-같은 4자리(예: 2-3-4821)
 *   POST { action: 'createClass', ban, nStudents, groupSize, exp }  → classes 시트에 한 줄, 수업 코드·조 목록·교사 열쇠(한 번만 보여 줌)
 *   GET  ?action=joinInfo&class=2-4821                            → 실험·조 목록 (열쇠 없이, 학생이 조·번호 고르기용)
 *   POST { action: 'heartbeat', class, jo, num, step, points, submitted, device } → progress 시트 (조·번호마다 한 줄 고쳐 씀)
 *   POST { action: 'classStatus', class, key }                    → 모든 학생 진행 + 조별 제출 요약 (열쇠가 맞을 때만)
 *   교사 열쇠는 시트에 SHA-256 해시만 저장한다. 열쇠는 주소(쿼리)에 넣지 않고 POST 본문으로만 받는다.
 *
 *   스스로 업데이트(5판부터): 관리 열쇠(시트 하나에 하나, 해시만 스크립트 속성에)가 있어야 한다
 *   GET  ?action=ping                         → { version, admin: 관리 열쇠가 있는지, canRollback }
 *   POST { action: 'claimAdmin' }             → 관리 열쇠가 아직 없을 때만 새로 만들어 한 번 보여 줌
 *   POST { action: 'update', key }            → 고정된 사이트 주소(SITE)의 release.json·Code.gs·appsscript.json 을 받아
 *                                               해시·판 번호·크기를 확인 → Apps Script API 로 이 프로젝트 내용 바꾸기 → 새 버전 → 같은 배포를 새 버전으로
 *   POST { action: 'rollback', key }          → 업데이트 전 배포 버전으로 되돌리기
 *   데이터 시트는 건드리지 않는다. 받을 주소는 요청 값으로 바꿀 수 없다.
 *
 *   실험 공용 저장(6판부터, 플랑크·진자 밖의 모든 실험: 화면 부품 js/class-share.js 가 씀):
 *   POST { action: 'save', exp: 'idealgas'|…|'custom:실험id', id, group, device, title, n, summary: {이름: 숫자·짧은 글}, data: 'JSON 글자', sentAt }
 *        → submissions 시트에 한 줄 (같은 실험·조·id 면 고쳐 씀, data 는 45,000자씩 6칸까지)
 *   GET  ?action=list&exp=idealgas&group=2-3-4821  → 그 조가 보낸 줄 (data 포함)
 *
 * 개인정보: 학생 이름·학번·이메일은 받지도 저장하지도 않는다. 조 코드로만 구분한다.
 * 4단계(보고서·AI)용 시트 reports·ai_logs·quiz 는 만들어 두기만 한다.
 */

var VERSION = 8;   // 2: 조 코드·글자를 시트에 '글자'로 저장 (2-3-5376 이 날짜로 바뀌던 문제)  3: LED 플랑크 상수(planck 시트) 추가  4: 수업 연결(classes·progress 시트)  5: 스스로 업데이트·관리 열쇠  6: 모든 실험 공용 저장(submissions 시트)·수업에 모든 실험  7: 요약 이름에 °·%·한글 등 허용('|'·제어 문자만 막음)  8: 업데이트·되돌리기 오류에 원래 문구와 권한 안내
// 스스로 업데이트: 코드는 이 고정 주소에서만 받는다 (요청 값으로 바꿀 수 없음)
var SITE = 'https://aks-sci-lab.web.app/apps-script/';
var SCRIPT_API = 'https://script.googleapis.com/v1/projects/';
var UPDATE_MAX_CODE = 400000, UPDATE_MAX_MANIFEST = 20000;
var PROP_ADMIN = 'ADMIN_KEY_HASH', PROP_PREV = 'PREV_DEPLOY_VERSION', PROP_PREV_SERVER = 'PREV_SERVER_VERSION';
var GROUP_RE = /^\d{1,2}-\d{1,2}-\d{4}$/;      // 반-조-4자리 숫자 (예: 2-3-4821)
var ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
var MAX_BODY = 400000;                            // 보내는 글자 수 한도
var CELL_MAX = 45000;                             // 셀 한 칸 한도(구글은 50000)
var RAW_CELLS = 6;                                // 원본 데이터를 나눠 담을 칸 수
var MAX_ROWS_PER_GROUP = 200;

var SHEETS = {
  measurements: ['timestamp', 'groupCode', 'L', 'amplitude', 'sensorAxis', 'nPeriods', 'T_mean', 'T_std', 'rawData', 'note',
    'id', 'kind', 'source', 'T_sem', 'rate', 'device', 'measuredAt', 'rawInfo', 'rawData2', 'rawData3', 'rawData4', 'rawData5', 'rawData6'],
  reports: ['timestamp', 'groupCode', 'section', 'content', 'submitted'],
  ai_logs: ['timestamp', 'groupCode', 'source', 'section', 'prompt', 'attachedContext', 'response', 'verification'],
  quiz: ['timestamp', 'groupCode', 'question', 'answer'],
  // LED 플랑크 상수: 조의 노트북 한 대가 잰 LED 하나 = 한 줄. 선생님은 이 탭에서 모든 조를 본다
  planck: ['timestamp', 'groupCode', 'led', 'lambda_nm', 'V0_current', 'V0_glow', 'nIV', 'nGlow',
    'h_current_e-34', 'error_pct', 'R2', 'h_glow_e-34', 'device', 'id', 'ledKey', 'curMode', 'iMin', 'sentAt', 'ivData', 'glowData'],
  // 수업 연결: 선생님이 만든 수업 하나 = 한 줄. groups 는 [{ jo, code, size }] JSON, keyHash 는 교사 열쇠의 SHA-256
  classes: ['timestamp', 'classCode', 'ban', 'nStudents', 'groupSize', 'exp', 'groups', 'keyHash'],
  // 학생 진행: 수업·조·번호마다 한 줄 (이름 없음). step 은 보고 있는 단계, lastSeen 은 마지막 신호 시각
  progress: ['timestamp', 'classCode', 'groupCode', 'jo', 'num', 'step', 'points', 'submitted', 'lastSeen', 'device', 'exp'],
  // 실험 공용 저장(6판): 플랑크·진자 밖의 실험. 조의 노트북 한 대가 보낸 측정 하나 = 한 줄 (exp 칸으로 실험을 나눔)
  submissions: ['timestamp', 'exp', 'groupCode', 'title', 'n', 'summary', 'device', 'id', 'sentAt', 'data', 'data2', 'data3', 'data4', 'data5', 'data6']
};
var DEVICE_RE = /^[A-Za-z0-9_-]{4,20}$/;
var CLASS_RE = /^\d{1,2}-\d{4}$/;                 // 반-4자리 (예: 2-4821)
// 수업으로 쓸 수 있는 실험 (js/class-cloud.js 의 EXPS 와 같게). 'custom:<실험 id>' 는 선생님이 만든 실험
var GENERIC_EXPS = { idealgas: 1, accel: 1, env: 1, light: 1, uv: 1, phoneaccel: 1, malus: 1, eminduction: 1, freefall: 1, nano: 1 };
var CLASS_EXPS = { planck: 1, pendulum: 1 };
Object.keys(GENERIC_EXPS).forEach(function (k) { CLASS_EXPS[k] = 1; });
var CUSTOM_EXP_RE = /^custom:[A-Za-z0-9_-]{1,40}$/;
function isClassExp(e) { return !!CLASS_EXPS[e] || CUSTOM_EXP_RE.test(e); }
function isGenericExp(e) { return !!GENERIC_EXPS[e] || CUSTOM_EXP_RE.test(e); }
var DATA_CELLS = 6, SUMMARY_KEYS = 20;
var STEP_RE = /^[a-z0-9_-]{1,20}$/;
var MAX_CLASSES = 500;
var PLANCK_POINTS = 500;                          // LED 하나·기준 하나에 받는 점 수 한도

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') return json(pingInfo());
    if (p.action === 'joinInfo') return json(joinInfo(p['class']));
    var group = cleanGroup(p.group);
    if (p.exp === 'planck') {
      if (p.action === 'list') return json({ ok: true, group: group, items: listPlanck(group) });
      throw new Error('알 수 없는 요청입니다.');
    }
    if (p.exp && p.exp !== 'pendulum') {
      if (!isGenericExp(String(p.exp))) throw new Error('알 수 없는 실험입니다.');
      if (p.action === 'list') return json({ ok: true, group: group, exp: String(p.exp), items: listSubmissions(String(p.exp), group) });
      throw new Error('알 수 없는 요청입니다.');
    }
    if (p.action === 'list') return json({ ok: true, group: group, items: listGroup(group) });
    if (p.action === 'raw') {
      if (!ID_RE.test(String(p.id || ''))) throw new Error('측정 번호(id)가 올바르지 않습니다.');
      return json(rawOf(group, String(p.id)));
    }
    throw new Error('알 수 없는 요청입니다.');
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    var bodyText = e && e.postData ? String(e.postData.contents || '') : '';
    if (!bodyText) throw new Error('보낸 내용이 없습니다.');
    if (bodyText.length > MAX_BODY) throw new Error('보낸 내용이 너무 큽니다.');
    var body = JSON.parse(bodyText);
    if (body.action === 'save' && body.exp === 'planck') return json(savePlanck(body));
    if (body.action === 'save' && body.exp && body.exp !== 'pendulum') return json(saveSubmission(body));
    if (body.action === 'claimAdmin') return json(claimAdmin());
    if (body.action === 'update') return json(selfUpdate(body));
    if (body.action === 'rollback') return json(rollback(body));
    if (body.action === 'createClass') return json(createClass(body));
    if (body.action === 'heartbeat') return json(heartbeat(body));
    if (body.action === 'classStatus') return json(classStatus(body));
    if (body.action === 'save') return json(saveMeasurement(body));
    throw new Error('알 수 없는 요청입니다.');
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function cleanGroup(g) {
  g = String(g == null ? '' : g).replace(/\s+/g, '');
  if (!GROUP_RE.test(g)) throw new Error('조 코드 형식이 올바르지 않습니다 (예: 2-3-4821).');
  return g;
}
function numIn(v, lo, hi, name, optional) {
  if ((v === '' || v == null) && optional) return '';
  var n = Number(v);
  if (!isFinite(n) || n < lo || n > hi) throw new Error(name + ' 값이 올바르지 않습니다.');
  return n;
}
function text(v, max) {
  // 시트가 글자를 날짜·숫자·수식으로 바꾸지 않게 앞에 ' 를 붙인다 (' 는 값에 남지 않고 글자로 저장하라는 표시)
  //  예: 조 코드 2-3-5376 을 그냥 넣으면 날짜가 되어 나중에 그 조를 찾지 못한다
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
  return s ? "'" + s : s;
}
function same(cell, s) { return String(cell) === s; }   // 시트 값과 글자 비교

function sheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function setupSheets() {   // 편집기에서 한 번 실행해도 되고, 안 해도 첫 요청 때 자동으로 만들어진다
  Object.keys(SHEETS).forEach(sheet);
}

function saveMeasurement(b) {
  var group = cleanGroup(b.group);
  var id = String(b.id || '');
  if (!ID_RE.test(id)) throw new Error('측정 번호(id)가 올바르지 않습니다.');
  var raw = Array.isArray(b.raw) ? b.raw : [];
  if (raw.length > RAW_CELLS) throw new Error('원본 데이터가 너무 큽니다.');
  raw.forEach(function (r) {
    if (typeof r !== 'string' || r.length > CELL_MAX) throw new Error('원본 데이터 조각이 너무 큽니다.');
  });
  var cols = SHEETS.measurements;
  var rec = {
    timestamp: new Date(),
    groupCode: text(group, 20),
    L: numIn(b.L, 0.01, 10, '줄 길이 L'),
    amplitude: numIn(b.amplitude, 0, 90, '진폭', true),
    sensorAxis: text(b.sensorAxis, 10),
    nPeriods: numIn(b.nPeriods, 1, 500, '주기 수'),
    T_mean: numIn(b.T_mean, 0.05, 30, '주기 T'),
    T_std: numIn(b.T_std, 0, 30, 'T 표준편차', true),
    note: text(b.note, 200),
    id: text(id, 40),
    kind: b.kind === 'acc' ? 'acc' : 'gyro',
    source: b.source === 'simulation' ? 'simulation' : 'sensor',
    T_sem: numIn(b.T_sem, 0, 30, 'T 표준오차', true),
    rate: numIn(b.rate, 0, 2000, '샘플 빈도', true),
    device: text(b.device, 20),
    measuredAt: text(b.measuredAt, 40),
    rawInfo: text(b.rawInfo, 200)
  };
  rec.rawData = text(raw[0], CELL_MAX);
  for (var k = 2; k <= RAW_CELLS; k++) rec['rawData' + k] = text(raw[k - 1], CELL_MAX);
  var row = cols.map(function (c) { return rec[c] === undefined ? '' : rec[c]; });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet('measurements');
    var found = findRow(sh, group, id);
    if (found) {
      sh.getRange(found, 1, 1, row.length).setValues([row]);
      return { ok: true, id: id, updated: true };
    }
    if (countGroup(sh, group) >= MAX_ROWS_PER_GROUP) throw new Error('이 조의 측정이 너무 많습니다(' + MAX_ROWS_PER_GROUP + '개). 선생님께 알려 주세요.');
    sh.appendRow(row);
    return { ok: true, id: id, updated: false };
  } finally {
    lock.releaseLock();
  }
}

// 시트 이름(sheetName)을 주지 않으면 진자 measurements 시트
function allRows(sh, sheetName) {
  var n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, SHEETS[sheetName || 'measurements'].length).getValues();
}
function idx(name, sheetName) { return SHEETS[sheetName || 'measurements'].indexOf(name); }
function findRow(sh, group, id, sheetName) {
  var rows = allRows(sh, sheetName);
  for (var i = 0; i < rows.length; i++) {
    if (same(rows[i][idx('groupCode', sheetName)], group) && same(rows[i][idx('id', sheetName)], id)) return i + 2;
  }
  return 0;
}
function countGroup(sh, group, sheetName) {
  return allRows(sh, sheetName).filter(function (r) { return same(r[idx('groupCode', sheetName)], group); }).length;
}

function listGroup(group) {
  var keep = ['timestamp', 'L', 'amplitude', 'sensorAxis', 'nPeriods', 'T_mean', 'T_std', 'note', 'id', 'kind', 'source', 'T_sem', 'rate', 'device', 'measuredAt', 'rawInfo'];
  return allRows(sheet('measurements')).filter(function (r) { return same(r[idx('groupCode')], group); }).map(function (r) {
    var o = { group: group };
    keep.forEach(function (k) {
      var v = r[idx(k)];
      o[k] = v instanceof Date ? v.toISOString() : v;
    });
    o.hasRaw = !!r[idx('rawData')];
    return o;
  });
}

function rawOf(group, id) {
  var rows = allRows(sheet('measurements'));
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (same(r[idx('groupCode')], group) && same(r[idx('id')], id)) {
      var parts = [r[idx('rawData')]];
      for (var k = 2; k <= RAW_CELLS; k++) parts.push(r[idx('rawData' + k)]);
      return { ok: true, id: id, raw: parts.filter(function (p) { return p; }).map(String) };
    }
  }
  return { ok: false, error: '그 측정을 찾지 못했습니다.' };
}

// ---------- LED 플랑크 상수 (projects/planck-led.html, js/planck-cloud.js) ----------
// 측정점은 JSON 글자로: iv = [[V_LED, I(mA), V_R 또는 null, R 또는 null, 센서면 1], …], glow = [V, …]
// 받은 그대로 저장하지 않고 숫자만 골라 다시 만든다 (이상한 글자·큰 값이 시트에 들어가지 않게)
function cleanPoints(textValue, isIv, name) {
  if (textValue === '' || textValue == null) return '[]';
  var arr;
  try { arr = JSON.parse(String(textValue)); } catch (err) { throw new Error(name + ' 형식이 올바르지 않습니다.'); }
  if (!Array.isArray(arr) || arr.length > PLANCK_POINTS) throw new Error(name + ' 점 수가 너무 많거나 형식이 올바르지 않습니다.');
  var out = arr.map(function (p) {
    if (!isIv) return numIn(p, 0, 50, name + ' 전압');
    if (!Array.isArray(p) || p.length < 2 || p.length > 5) throw new Error(name + ' 형식이 올바르지 않습니다.');
    var row = [numIn(p[0], 0, 50, name + ' 전압'), numIn(p[1], 0, 1000, name + ' 전류')];
    if (p.length > 2) row.push(p[2] == null ? null : numIn(p[2], 0, 50, name + ' 저항 전압'));
    if (p.length > 3) row.push(p[3] == null ? null : numIn(p[3], 0, 1e7, name + ' 저항'));
    if (p.length > 4) row.push(p[4] ? 1 : 0);
    return row;
  });
  var s = JSON.stringify(out);
  if (s.length > CELL_MAX) throw new Error(name + ' 이 너무 큽니다.');
  return s;
}

function savePlanck(b) {
  var group = cleanGroup(b.group);
  var id = String(b.id || '');
  if (!ID_RE.test(id)) throw new Error('측정 번호(id)가 올바르지 않습니다.');
  var device = String(b.device || '');
  if (!DEVICE_RE.test(device)) throw new Error('노트북 번호가 올바르지 않습니다.');
  var led = String(b.led == null ? '' : b.led).trim();
  if (!led) throw new Error('LED 이름이 없습니다.');
  var ledKey = String(b.ledKey || '');
  var rec = {
    timestamp: new Date(),
    groupCode: text(group, 20),
    led: text(led, 40),
    lambda_nm: numIn(b.lambda, 200, 1100, 'LED 파장'),
    V0_current: numIn(b.v0Current, 0, 10, '문턱 전압(전류 기준)', true),
    V0_glow: numIn(b.v0Glow, 0, 10, '문턱 전압(빛 기준)', true),
    nIV: numIn(b.nIV, 0, PLANCK_POINTS, '점 수'),
    nGlow: numIn(b.nGlow, 0, PLANCK_POINTS, '점 수'),
    'h_current_e-34': numIn(b.hCurrent, 0, 100, '플랑크 상수', true),
    error_pct: numIn(b.errorPct, -10000, 10000, '오차율', true),
    R2: numIn(b.r2, -1, 1, '결정계수', true),
    'h_glow_e-34': numIn(b.hGlow, 0, 100, '플랑크 상수(빛 기준)', true),
    device: text(device, 20),
    id: text(id, 40),
    ledKey: text(/^[A-Za-z0-9_-]{1,20}$/.test(ledKey) ? ledKey : '', 20),
    curMode: b.curMode === 'current' ? 'current' : 'extrapolate',
    iMin: numIn(b.iMin, 0, 100, '직선 부분 기준 전류', true),
    sentAt: text(b.sentAt, 40),
    ivData: text(cleanPoints(b.iv, true, 'I–V 측정값'), CELL_MAX),
    glowData: text(cleanPoints(b.glow, false, '빛 기준 측정값'), CELL_MAX)
  };
  var row = SHEETS.planck.map(function (c) { return rec[c] === undefined ? '' : rec[c]; });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet('planck');
    var found = findRow(sh, group, id, 'planck');
    if (found) {
      sh.getRange(found, 1, 1, row.length).setValues([row]);
      return { ok: true, id: id, updated: true };
    }
    if (countGroup(sh, group, 'planck') >= MAX_ROWS_PER_GROUP) throw new Error('이 조가 보낸 줄이 너무 많습니다(' + MAX_ROWS_PER_GROUP + '개). 선생님께 알려 주세요.');
    sh.appendRow(row);
    return { ok: true, id: id, updated: false };
  } finally {
    lock.releaseLock();
  }
}

function listPlanck(group) {
  var cols = SHEETS.planck;
  return allRows(sheet('planck'), 'planck').filter(function (r) { return same(r[idx('groupCode', 'planck')], group); }).map(function (r) {
    var o = { group: group };
    cols.forEach(function (k, j) {
      if (k === 'groupCode') return;
      var v = r[j];
      o[k] = v instanceof Date ? v.toISOString() : v;
    });
    return o;
  });
}

// ---------- 수업 연결 (4판): 교사·학생 모두 구글 로그인 없이 ----------
// 학생 수를 조별 인원에 맞춰 고르게 나눈다: 26명·4명 → 7조, 4·4·4·4·4·3·3 (js/class-cloud.js 의 splitGroups 와 같음)
function splitGroups(n, size) {
  var k = Math.ceil(n / size), base = Math.floor(n / k), extra = n % k, out = [];
  for (var i = 0; i < k; i++) out.push(base + (i < extra ? 1 : 0));
  return out;
}
function cleanClass(c) {
  c = String(c == null ? '' : c).replace(/\s+/g, '');
  if (!CLASS_RE.test(c)) throw new Error('수업 코드 형식이 올바르지 않습니다 (예: 2-4821).');
  return c;
}
function hashKey(key) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(key), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function findClass(code) {
  var rows = allRows(sheet('classes'), 'classes');
  for (var i = 0; i < rows.length; i++) {
    if (same(rows[i][idx('classCode', 'classes')], code)) {
      var r = rows[i], groups;
      try { groups = JSON.parse(String(r[idx('groups', 'classes')])); } catch (err) { groups = []; }
      return {
        row: i + 2, classCode: code, ban: Number(r[idx('ban', 'classes')]), nStudents: Number(r[idx('nStudents', 'classes')]),
        groupSize: Number(r[idx('groupSize', 'classes')]), exp: String(r[idx('exp', 'classes')]), groups: groups,
        keyHash: String(r[idx('keyHash', 'classes')]),
        created: r[idx('timestamp', 'classes')] instanceof Date ? r[idx('timestamp', 'classes')].toISOString() : String(r[idx('timestamp', 'classes')])
      };
    }
  }
  return null;
}
function publicClass(c) {
  return { ok: true, classCode: c.classCode, ban: c.ban, nStudents: c.nStudents, groupSize: c.groupSize, exp: c.exp, groups: c.groups, created: c.created };
}

function createClass(b) {
  var ban = numIn(b.ban, 1, 99, '반');
  var n = numIn(b.nStudents, 1, 60, '학생 수');
  var size = numIn(b.groupSize, 1, 10, '조별 인원');
  if (ban % 1 || n % 1 || size % 1) throw new Error('반·학생 수·조별 인원은 정수로 넣어 주세요.');
  var exp = String(b.exp || '');
  if (!isClassExp(exp)) throw new Error('이 실험은 아직 수업 연결을 쓸 수 없습니다.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet('classes');
    var rows = allRows(sh, 'classes');
    if (rows.length >= MAX_CLASSES) throw new Error('이 시트의 수업이 너무 많습니다(' + MAX_CLASSES + '개). 새 시트를 쓰세요.');
    // 같은 시트 안에서 겹치지 않는 4자리 (조 코드 반-조-4자리 도 함께 겹치지 않게 된다)
    var used = {};
    rows.forEach(function (r) { used[String(r[idx('classCode', 'classes')])] = true; });
    var code = '';
    for (var t = 0; t < 200 && !code; t++) {
      var c = ban + '-' + ('000' + Math.floor(Math.random() * 10000)).slice(-4);
      if (!used[c]) code = c;
    }
    if (!code) throw new Error('수업 코드를 만들지 못했습니다. 다시 눌러 주세요.');
    var four = code.split('-')[1];
    var groups = splitGroups(n, size).map(function (k, i) { return { jo: i + 1, code: ban + '-' + (i + 1) + '-' + four, size: k }; });
    var key = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    var rec = {
      timestamp: new Date(), classCode: text(code, 10), ban: ban, nStudents: n, groupSize: size, exp: text(exp, 50),
      groups: text(JSON.stringify(groups), CELL_MAX), keyHash: text(hashKey(key), 80)
    };
    sh.appendRow(SHEETS.classes.map(function (k) { return rec[k] === undefined ? '' : rec[k]; }));
    return { ok: true, classCode: code, key: key, ban: ban, nStudents: n, groupSize: size, exp: exp, groups: groups };
  } finally {
    lock.releaseLock();
  }
}

function joinInfo(c) {
  var cls = findClass(cleanClass(c));
  if (!cls) return { ok: false, error: '그 수업 코드를 찾지 못했습니다. 선생님이 보여 준 코드나 QR 을 다시 확인하세요.' };
  return publicClass(cls);
}

function heartbeat(b) {
  var code = cleanClass(b['class']);
  var cls = findClass(code);
  if (!cls) throw new Error('그 수업 코드를 찾지 못했습니다.');
  var jo = numIn(b.jo, 1, 99, '조'), num = numIn(b.num, 1, 10, '번호');
  var g = cls.groups.filter(function (x) { return Number(x.jo) === jo; })[0];
  if (!g || num % 1 || num > Number(g.size)) throw new Error('이 수업에 없는 조·번호입니다.');
  var step = String(b.step || '');
  var device = String(b.device || '');
  var rec = {
    timestamp: new Date(), classCode: text(code, 10), groupCode: text(g.code, 20), jo: jo, num: num,
    step: text(STEP_RE.test(step) ? step : '', 20),
    points: numIn(b.points, 0, 100000, '측정 점 수', true),
    submitted: b.submitted ? 1 : 0,
    lastSeen: new Date(),
    device: text(DEVICE_RE.test(device) ? device : '', 20),
    exp: text(cls.exp, 50)
  };
  var row = SHEETS.progress.map(function (k) { return rec[k] === undefined ? '' : rec[k]; });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet('progress');
    var rows = allRows(sh, 'progress');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (same(r[idx('classCode', 'progress')], code) && Number(r[idx('jo', 'progress')]) === jo && Number(r[idx('num', 'progress')]) === num) {
        sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
        return { ok: true, updated: true };
      }
    }
    if (rows.filter(function (r) { return same(r[idx('classCode', 'progress')], code); }).length >= cls.nStudents + 10) throw new Error('이 수업의 학생 줄이 너무 많습니다.');
    sh.appendRow(row);
    return { ok: true, updated: false };
  } finally {
    lock.releaseLock();
  }
}

function classStatus(b) {
  var code = cleanClass(b['class']);
  var cls = findClass(code);
  if (!cls) throw new Error('그 수업 코드를 찾지 못했습니다.');
  if (!b.key || hashKey(String(b.key)) !== cls.keyHash) throw new Error('교사 열쇠가 맞지 않습니다.');
  var iso = function (v) { return v instanceof Date ? v.toISOString() : String(v == null ? '' : v); };
  var students = allRows(sheet('progress'), 'progress').filter(function (r) { return same(r[idx('classCode', 'progress')], code); }).map(function (r) {
    return {
      jo: Number(r[idx('jo', 'progress')]), num: Number(r[idx('num', 'progress')]), step: String(r[idx('step', 'progress')]),
      points: r[idx('points', 'progress')] === '' ? null : Number(r[idx('points', 'progress')]),
      submitted: Number(r[idx('submitted', 'progress')]) === 1, lastSeen: iso(r[idx('lastSeen', 'progress')]), device: String(r[idx('device', 'progress')])
    };
  });
  // 조별 제출 요약 (플랑크: planck 시트에서 그 조 코드의 줄)
  var subs = {};
  cls.groups.forEach(function (g) { subs[g.code] = { code: g.code, jo: g.jo, rows: 0, labels: [], leds: [], devices: 0, lastSent: '', hCurrent: '', errorPct: '', summary: null }; });
  var devs = {};
  if (cls.exp === 'planck') {
    allRows(sheet('planck'), 'planck').forEach(function (r) {
      var gc = String(r[idx('groupCode', 'planck')]), s = subs[gc];
      if (!s) return;
      var nPts = Number(r[idx('nIV', 'planck')]) + Number(r[idx('nGlow', 'planck')]);
      if (!nPts) return;
      s.rows++;
      s.leds.push(String(r[idx('led', 'planck')]));
      s.labels.push(String(r[idx('led', 'planck')]));
      (devs[gc] = devs[gc] || {})[String(r[idx('device', 'planck')])] = true;
      var sent = String(r[idx('sentAt', 'planck')]);
      if (sent >= s.lastSent) {
        s.lastSent = sent;
        if (r[idx('h_current_e-34', 'planck')] !== '') { s.hCurrent = Number(r[idx('h_current_e-34', 'planck')]); s.errorPct = r[idx('error_pct', 'planck')] === '' ? '' : Number(r[idx('error_pct', 'planck')]); }
      }
    });
  } else if (cls.exp === 'pendulum') {
    allRows(sheet('measurements')).forEach(function (r) {
      var gc = String(r[idx('groupCode')]), s = subs[gc];
      if (!s) return;
      s.rows++;
      s.labels.push('L ' + r[idx('L')] + ' m');
      (devs[gc] = devs[gc] || {})[String(r[idx('device')] || 'phone')] = true;
      var at = String(r[idx('measuredAt')] || '');
      if (at >= s.lastSent) { s.lastSent = at; s.summary = { L: Number(r[idx('L')]), T: Number(r[idx('T_mean')]) }; }
    });
  } else if (isGenericExp(cls.exp)) {
    allRows(sheet('submissions'), 'submissions').forEach(function (r) {
      if (!same(r[idx('exp', 'submissions')], cls.exp)) return;
      var gc = String(r[idx('groupCode', 'submissions')]), s = subs[gc];
      if (!s || !Number(r[idx('n', 'submissions')])) return;
      s.rows++;
      s.labels.push(String(r[idx('title', 'submissions')]));
      (devs[gc] = devs[gc] || {})[String(r[idx('device', 'submissions')])] = true;
      var sent = String(r[idx('sentAt', 'submissions')]);
      if (sent >= s.lastSent) { s.lastSent = sent; s.summary = parseSummary(r[idx('summary', 'submissions')]); }
    });
  }
  Object.keys(devs).forEach(function (gc) { subs[gc].devices = Object.keys(devs[gc]).length; });
  var out = publicClass(cls);
  out.now = new Date().toISOString();
  out.students = students;
  out.submissions = cls.groups.map(function (g) { return subs[g.code]; });
  return out;
}

// ---------- 스스로 업데이트 (5판) ----------
// 관리 열쇠: 시트(스크립트) 하나에 하나. 처음 연결한 교사 화면이 만들고, 해시만 스크립트 속성에 둔다.
// 열쇠를 잃어버리면: Apps Script 편집기 ⚙ 프로젝트 설정 → 스크립트 속성에서 ADMIN_KEY_HASH 를 지우고 교사 화면에서 다시 연결
function props() { return PropertiesService.getScriptProperties(); }
function pingInfo() {
  var p = props();
  return { ok: true, version: VERSION, admin: !!p.getProperty(PROP_ADMIN), canRollback: !!p.getProperty(PROP_PREV),
    prevServer: p.getProperty(PROP_PREV_SERVER) ? Number(p.getProperty(PROP_PREV_SERVER)) : null };
}
function claimAdmin() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (props().getProperty(PROP_ADMIN)) throw new Error('이 시트에는 이미 관리 열쇠가 있습니다. 처음 연결한 컴퓨터의 교사 화면에서 열쇠를 확인하세요.');
    var key = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props().setProperty(PROP_ADMIN, hashKey(key));
    return { ok: true, key: key };
  } finally {
    lock.releaseLock();
  }
}
function requireAdmin(b) {
  var h = props().getProperty(PROP_ADMIN);
  if (!h) throw new Error('관리 열쇠가 아직 없습니다. 교사 화면에서 시트를 다시 연결하세요.');
  if (!b || !b.key || hashKey(String(b.key)) !== h) throw new Error('관리 열쇠가 맞지 않습니다.');
}
function hexOf(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
// 고정된 사이트 주소에서 파일 받기 (이름은 정해 둔 것만)
// 오류를 가리지 않는다: 원래 문구를 그대로 붙이고, 권한 문제로 보이면 무엇을 하면 되는지 덧붙인다
var PERM_RE = /permission|권한|authoriz|Required permissions|script\.external_request|not allowed to call/i;
var PERM_HINT = ' → 이 스크립트에 새 권한 허용이 필요해요: Apps Script 편집기의 appsscript.json 이 사이트 것과 같은지 확인하고, 배포 → 배포 관리 → ✏️ → 버전 "새 버전" → 배포 → 권한 확인 창에서 허용하세요 (또는 편집기에서 함수 setupSheets 를 한 번 실행해 허용).';
function errText(err) { return String(err && err.message || err); }
function withHint(prefix, err) {
  var m = errText(err);
  var text = prefix ? prefix + ': ' + m : m;
  if (PERM_RE.test(m) && m.indexOf('배포 관리') < 0 && m.indexOf('손으로') < 0) text += PERM_HINT;
  return new Error(text);
}
function siteFile(name, max) {
  if (['release.json', 'Code.gs', 'appsscript.json'].indexOf(name) < 0) throw new Error('받을 수 없는 파일입니다.');
  var res;
  try { res = UrlFetchApp.fetch(SITE + name + '?_=' + Date.now(), { muteHttpExceptions: true, followRedirects: true }); }
  catch (err) { throw withHint('사이트에서 ' + name + ' 을 받는 중 오류', err); }
  if (res.getResponseCode() !== 200) throw new Error('사이트에서 ' + name + ' 을 받지 못했습니다 (' + res.getResponseCode() + ').');
  var bytes = res.getContent();
  if (bytes.length > max) throw new Error(name + ' 이 너무 큽니다.');
  return { bytes: bytes, text: res.getContentText('UTF-8'), sha256: hexOf(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)) };
}
// Apps Script API 부르기 (선생님 권한의 토큰). 자주 나는 오류는 쉬운 말로
function scriptApi(method, path, payload) {
  var opt = { method: method, muteHttpExceptions: true, contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (payload) opt.payload = JSON.stringify(payload);
  var res = UrlFetchApp.fetch(SCRIPT_API + ScriptApp.getScriptId() + path, opt);
  var code = res.getResponseCode(), body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); } catch (err) { body = {}; }
  if (code >= 200 && code < 300) return body;
  var msg = String((body.error && body.error.message) || '');
  if (code === 403 && /Apps Script API|has not been used|is disabled|SERVICE_DISABLED|User has not enabled/i.test(msg))
    throw new Error('Apps Script API 가 꺼져 있습니다. https://script.google.com/home/usersettings 에서 "Google Apps Script API" 를 켠 뒤 다시 누르세요.');
  if (code === 401 || code === 403)
    throw new Error('업데이트 권한이 없습니다. 5판 코드와 appsscript.json 을 손으로 한 번 붙여 넣고 배포할 때 권한을 허용했는지 확인하세요. 학교(Workspace) 계정에서 막혀 있으면 손으로 붙여 넣는 방법을 쓰세요. (' + code + ')');
  throw new Error('Apps Script API 오류 ' + code + (msg ? ': ' + msg : ''));
}
// 이 웹 앱의 배포 번호: 웹 앱 주소 …/macros/s/<배포 ID>/exec
function deploymentId() {
  var url = String(ScriptApp.getService().getUrl() || '');
  var m = /\/s\/([A-Za-z0-9_-]+)\/(?:exec|dev)/.exec(url);
  if (m && !/\/dev/.test(url)) return m[1];
  var list = scriptApi('get', '/deployments').deployments || [];
  var web = list.filter(function (d) { return (d.entryPoints || []).some(function (e) { return e.entryPointType === 'WEB_APP'; }) && d.deploymentConfig && d.deploymentConfig.versionNumber; });
  if (web.length === 1) return web[0].deploymentId;
  throw new Error('웹 앱 배포를 찾지 못했습니다. 손으로 업데이트하세요.');
}
function scopesOf(manifestText) {
  try { var m = JSON.parse(manifestText); return Array.isArray(m.oauthScopes) ? m.oauthScopes : null; } catch (err) { return null; }
}
function selfUpdate(b) {
  requireAdmin(b);
  try { return selfUpdateInner(b); } catch (err) { throw withHint('', err); }
}
function selfUpdateInner(b) {
  var rel;
  var relText;
  relText = siteFile('release.json', 5000).text;   // 받기 오류는 siteFile 이 원래 문구와 함께 알림
  try { rel = JSON.parse(relText); } catch (err) { throw new Error('사이트의 release.json 을 읽지 못했습니다: ' + errText(err) + ' (받은 글 앞부분: ' + String(relText).slice(0, 60) + ')'); }
  var to = Number(rel.version);
  if (!(to % 1 === 0 && to > VERSION)) throw new Error('이미 최신입니다 (지금 ' + VERSION + '판, 사이트 ' + rel.version + '판).');
  var code = siteFile('Code.gs', UPDATE_MAX_CODE), man = siteFile('appsscript.json', UPDATE_MAX_MANIFEST);
  if (!rel.files || !rel.files.Code || !rel.files.appsscript || code.sha256 !== rel.files.Code.sha256 || man.sha256 !== rel.files.appsscript.sha256)
    throw new Error('받은 코드의 확인 값(SHA-256)이 맞지 않습니다. 사이트가 배포 중일 수 있으니 잠시 뒤 다시 누르세요.');
  if (!new RegExp('\\bvar VERSION = ' + to + ';').test(code.text)) throw new Error('받은 코드의 판 번호가 release.json 과 다릅니다.');
  var newScopes = scopesOf(man.text);
  if (!newScopes) throw new Error('받은 appsscript.json 형식이 올바르지 않습니다.');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var content = scriptApi('get', '/content');
    var files = content.files || [];
    var oldMan = files.filter(function (f) { return f.name === 'appsscript' && f.type === 'JSON'; })[0];
    var oldScopes = oldMan ? scopesOf(oldMan.source) : null;
    // 새 권한(scope)이 늘면 자동으로 바꾸지 않는다: 배포는 선생님이 허용한 권한으로만 돌아가므로
    if (!oldScopes) throw new Error('지금 프로젝트에 appsscript.json(권한 목록)이 없습니다. 5판을 손으로 붙여 넣을 때 매니페스트도 붙여 넣으세요.');
    var added = newScopes.filter(function (s) { return oldScopes.indexOf(s) < 0; });
    if (added.length) throw new Error('새 판은 새 권한이 필요해 자동으로 바꿀 수 없습니다. 이번 한 번은 손으로 붙여 넣고 배포해 권한을 허용하세요. (' + added.join(', ') + ')');
    // 서버 코드 파일: 'function doGet' 과 'var VERSION' 이 든 SERVER_JS (선생님이 이름을 바꿨어도 그 파일을 바꾼다)
    var server = files.filter(function (f) { return f.type === 'SERVER_JS' && /function doGet/.test(f.source) && /var VERSION = /.test(f.source); });
    if (server.length !== 1) throw new Error('바꿀 서버 코드 파일을 하나로 찾지 못했습니다. 손으로 업데이트하세요.');
    var next = files.map(function (f) {
      if (f === server[0]) return { name: f.name, type: 'SERVER_JS', source: code.text };
      if (f === oldMan) return { name: 'appsscript', type: 'JSON', source: man.text };
      return { name: f.name, type: f.type, source: f.source };
    });
    var dep = deploymentId();
    var cur = scriptApi('get', '/deployments/' + dep);
    var prevNo = cur.deploymentConfig && cur.deploymentConfig.versionNumber;
    scriptApi('put', '/content', { scriptId: ScriptApp.getScriptId(), files: next });
    var ver = scriptApi('post', '/versions', { description: '센서 기반 실험실 서버 ' + to + '판 (자동 업데이트, ' + VERSION + '판에서)' });
    scriptApi('put', '/deployments/' + dep, { deploymentConfig: {
      scriptId: ScriptApp.getScriptId(), versionNumber: ver.versionNumber, manifestFileName: 'appsscript',
      description: '센서 기반 실험실 서버 ' + to + '판'
    } });
    if (prevNo) { props().setProperty(PROP_PREV, String(prevNo)); props().setProperty(PROP_PREV_SERVER, String(VERSION)); }
    return { ok: true, from: VERSION, to: to, versionNumber: ver.versionNumber, previousVersionNumber: prevNo || null };
  } finally {
    lock.releaseLock();
  }
}
function rollback(b) {
  requireAdmin(b);
  try { return rollbackInner(b); } catch (err) { throw withHint('', err); }
}
function rollbackInner(b) {
  var prev = Number(props().getProperty(PROP_PREV));
  if (!(prev > 0)) throw new Error('되돌릴 이전 버전이 없습니다.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var dep = deploymentId();
    var cur = scriptApi('get', '/deployments/' + dep);
    var curNo = cur.deploymentConfig && cur.deploymentConfig.versionNumber;
    scriptApi('put', '/deployments/' + dep, { deploymentConfig: {
      scriptId: ScriptApp.getScriptId(), versionNumber: prev, manifestFileName: 'appsscript',
      description: '센서 기반 실험실 서버 ' + (props().getProperty(PROP_PREV_SERVER) || '') + '판으로 되돌림'
    } });
    // 한 번 더 누르면 다시 앞으로 (되돌리기를 되돌리기)
    if (curNo) props().setProperty(PROP_PREV, String(curNo));
    props().setProperty(PROP_PREV_SERVER, String(VERSION));
    return { ok: true, versionNumber: prev };
  } finally {
    lock.releaseLock();
  }
}

// ---------- 실험 공용 저장 (6판): submissions 시트 ----------
// summary: 교사 화면·시트에서 바로 볼 숫자 몇 개 ({ g: 9.79, err: 0.2 } 처럼, 이름 20개까지, 값은 숫자 또는 40자 글)
function cleanSummary(v) {
  if (v == null || v === '') return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error('요약(summary) 형식이 올바르지 않습니다.');
  var keys = Object.keys(v);
  if (keys.length > SUMMARY_KEYS) throw new Error('요약(summary) 항목이 너무 많습니다.');
  var out = {};
  keys.forEach(function (k) {
    // 이름은 30자까지 아무 글자나 (예: '온도(°C)', '습도(%)'). 시트에서 칸을 나누는 데 쓸 수 있는 '|' 와 제어 문자만 막는다
    if (!/^[^|\u0000-\u001f]{1,30}$/.test(k) || !k.trim()) throw new Error('요약 이름이 올바르지 않습니다 (1~30자, | 는 쓸 수 없음).');
    var x = v[k];
    if (typeof x === 'number') { if (!isFinite(x)) throw new Error('요약 값이 올바르지 않습니다.'); out[k] = x; }
    else if (x == null) out[k] = null;
    else out[k] = String(x).replace(/[\u0000-\u001f]/g, ' ').slice(0, 40);
  });
  return out;
}
function parseSummary(cell) { try { var o = JSON.parse(String(cell || '{}')); return o && typeof o === 'object' ? o : {}; } catch (err) { return {}; } }

function saveSubmission(b) {
  var exp = String(b.exp || '');
  if (!isGenericExp(exp)) throw new Error('알 수 없는 실험입니다.');
  var group = cleanGroup(b.group);
  var id = String(b.id || '');
  if (!ID_RE.test(id)) throw new Error('측정 번호(id)가 올바르지 않습니다.');
  var device = String(b.device || '');
  if (!DEVICE_RE.test(device)) throw new Error('노트북 번호가 올바르지 않습니다.');
  var data = b.data == null ? '' : String(b.data);
  if (data.length > CELL_MAX * DATA_CELLS) throw new Error('보낸 자료가 너무 큽니다 (' + (CELL_MAX * DATA_CELLS) + '자까지).');
  var rec = {
    timestamp: new Date(), exp: text(exp, 50), groupCode: text(group, 20),
    title: text(String(b.title == null ? '' : b.title).trim() || '측정', 60),
    n: numIn(b.n, 0, 100000, '점 수'),
    summary: text(JSON.stringify(cleanSummary(b.summary)), 2000),
    device: text(device, 20), id: text(id, 40), sentAt: text(b.sentAt, 40)
  };
  for (var k = 0; k < DATA_CELLS; k++) rec[k ? 'data' + (k + 1) : 'data'] = text(data.slice(k * CELL_MAX, (k + 1) * CELL_MAX), CELL_MAX);
  var row = SHEETS.submissions.map(function (c) { return rec[c] === undefined ? '' : rec[c]; });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet('submissions');
    var rows = allRows(sh, 'submissions'), mine = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!same(r[idx('exp', 'submissions')], exp) || !same(r[idx('groupCode', 'submissions')], group)) continue;
      if (same(r[idx('id', 'submissions')], id)) { sh.getRange(i + 2, 1, 1, row.length).setValues([row]); return { ok: true, id: id, updated: true }; }
      mine++;
    }
    if (mine >= MAX_ROWS_PER_GROUP) throw new Error('이 조가 보낸 줄이 너무 많습니다(' + MAX_ROWS_PER_GROUP + '개). 선생님께 알려 주세요.');
    sh.appendRow(row);
    return { ok: true, id: id, updated: false };
  } finally {
    lock.releaseLock();
  }
}
function listSubmissions(exp, group) {
  var iso = function (v) { return v instanceof Date ? v.toISOString() : v; };
  return allRows(sheet('submissions'), 'submissions').filter(function (r) {
    return same(r[idx('exp', 'submissions')], exp) && same(r[idx('groupCode', 'submissions')], group);
  }).map(function (r) {
    var data = '';
    for (var k = 0; k < DATA_CELLS; k++) data += String(r[idx(k ? 'data' + (k + 1) : 'data', 'submissions')] || '');
    return {
      exp: exp, group: group, id: String(r[idx('id', 'submissions')]), device: String(r[idx('device', 'submissions')]),
      title: String(r[idx('title', 'submissions')]), n: Number(r[idx('n', 'submissions')]) || 0,
      summary: parseSummary(r[idx('summary', 'submissions')]), sentAt: String(iso(r[idx('sentAt', 'submissions')]) || ''),
      timestamp: iso(r[idx('timestamp', 'submissions')]), data: data
    };
  });
}
