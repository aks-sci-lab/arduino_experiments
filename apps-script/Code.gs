/**
 * 스마트폰 진자 실험 — 선생님 구글 시트에 붙이는 Apps Script (센서 기반 실험실)
 *
 * 설치(1번만): 구글 시트 → 확장 프로그램 → Apps Script → 이 내용을 통째로 붙여 넣고 저장
 *   → 배포 → 새 배포 → 유형 '웹 앱' → 실행: 나 / 액세스: 모든 사용자 → 배포 → 웹 앱 주소 복사
 *   → 사이트의 js/pendulum-config.js 에 그 주소를 넣는다.
 *   자세한 안내: https://aks-sci-lab.web.app/projects/pendulum-setup.html
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
 * 개인정보: 학생 이름·학번·이메일은 받지도 저장하지도 않는다. 조 코드로만 구분한다.
 * 4단계(보고서·AI)용 시트 reports·ai_logs·quiz 는 만들어 두기만 한다.
 */

var VERSION = 3;   // 2: 조 코드·글자를 시트에 '글자'로 저장 (2-3-5376 이 날짜로 바뀌던 문제)  3: LED 플랑크 상수(planck 시트) 추가
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
    'h_current_e-34', 'error_pct', 'R2', 'h_glow_e-34', 'device', 'id', 'ledKey', 'curMode', 'iMin', 'sentAt', 'ivData', 'glowData']
};
var DEVICE_RE = /^[A-Za-z0-9_-]{4,20}$/;
var PLANCK_POINTS = 500;                          // LED 하나·기준 하나에 받는 점 수 한도

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') return json({ ok: true, version: VERSION });
    var group = cleanGroup(p.group);
    if (p.exp === 'planck') {
      if (p.action === 'list') return json({ ok: true, group: group, items: listPlanck(group) });
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
