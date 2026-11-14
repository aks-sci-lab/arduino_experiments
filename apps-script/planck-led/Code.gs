/**
 * LED 플랑크 상수 실험 — Google Apps Script 웹앱 (센서 기반 실험실)
 *
 * 화면 2개를 한 웹앱 주소로 보여 준다.
 *   웹앱 주소              → 학생 화면 (Index.html): 조·이름, LED 측정값 입력 → 문턱 전압·h 계산·그래프 → [제출]
 *   웹앱 주소?page=teacher → 선생님 화면 (Teacher.html): 교사 암호를 넣으면 조별 표·V₀–f 그래프·h 평균·CSV
 *
 * 저장: 이 스크립트가 붙어 있는 구글 스프레드시트의 '제출' 시트에 LED 하나당 한 줄 (제출 시각 포함).
 * 보호: 선생님 자료는 서버(이 파일)가 '스크립트 속성' TEACHER_PASSWORD 와 암호가 같을 때만 돌려준다.
 *       학생 화면이 부르는 함수(submitMeasurement)는 저장만 하고, 다른 학생의 자료는 돌려주지 않는다.
 * 설치 방법: 같은 폴더의 README.md
 *
 * @OnlyCurrentDoc  ← 이 스크립트가 붙은 스프레드시트 하나만 다룬다 (다른 구글 파일에는 권한을 요청하지 않음)
 */

var APP_VERSION = 1;
var SHEET_NAME = '제출';
// 시트 열 (README 의 표와 같은 순서). 열을 바꾸면 README 와 Teacher.html 의 열 이름도 함께 바꾼다.
var COLUMNS = ['제출 시각', '조', '이름(번호)', '제출 번호', 'LED', '파장(nm)', '진동수(10^14 Hz)',
  '문턱 기준', '문턱 전압 V0(V)', '점 개수', '전류 입력 방식', '고정 저항(Ω)',
  '학생 h(10^-34 J·s)', '학생 LED 수', '측정값(JSON)', '메모'];

var LIMITS = {
  text: 20,          // 조·이름·LED 이름 글자 수
  memo: 200,
  leds: 8,           // 한 번에 제출하는 LED 수
  points: 80,        // LED 하나의 (V, I) 점 수
  glow: 20,          // 빛 기준 반복 수
  rows: 20000,       // 시트 전체 줄 수 한도 (넘으면 제출을 막아 시트가 무거워지지 않게)
  failLock: 10,      // 교사 암호를 이만큼 틀리면
  lockSeconds: 300   // 마지막으로 틀린 뒤 이 시간(초) 동안 교사 화면을 잠근다 (스프레드시트 주인은 잠겨도 들어감)
};

/* ---------------- 화면 ---------------- */

function doGet(e) {
  var page = e && e.parameter && e.parameter.page === 'teacher' ? 'Teacher' : 'Index';
  var t = HtmlService.createTemplateFromFile(page);
  return t.evaluate()
    .setTitle(page === 'Teacher' ? 'LED 플랑크 상수 — 선생님' : 'LED 플랑크 상수 실험')
    // Apps Script 는 HTML 의 <meta name="viewport"> 를 무시하므로 여기서 넣어야 휴대폰 폭에 맞는다
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// HTML 안에서 include('Common') 처럼 (템플릿 표시 안에 써서) 다른 HTML 파일을 끼워 넣는다
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ---------------- 학생: 제출 ---------------- */

/**
 * 학생 화면의 [제출] → google.script.run.submitMeasurement(payload)
 * payload = { group, name, memo, method: 'extrapolate'|'glow', iMode: 'ammeter'|'resistor', resistor, iMin, hStudent,
 *             leds: [{ name, lambda, v0, iv: [{v, i, vr?}], glow: [V…] }] }
 * 반환: { ok: true, saved: 줄 수, submittedAt } — 다른 학생의 자료는 돌려주지 않는다.
 */
function submitMeasurement(payload) {
  var clean = validateSubmission(payload);   // 잘못된 값이면 오류(학생 화면에 문구가 보임)
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet();
    if (sheet.getLastRow() > LIMITS.rows) throw new Error('시트가 가득 찼습니다. 선생님께 알려 주세요.');
    var now = new Date();
    var id = Utilities.getUuid().slice(0, 8);
    clean.leds.forEach(function (led) {
      sheet.appendRow([
        now, safeText(clean.group), safeText(clean.name), safeText(id), safeText(led.name), led.lambda,
        round(299792458 / (led.lambda * 1e-9) / 1e14, 4),
        clean.method === 'glow' ? '빛' : '전류(직선 연장, ' + clean.iMin + ' mA 이상)',
        led.v0 == null ? '' : round(led.v0, 4),
        clean.method === 'glow' ? led.glow.length : led.iv.length,
        clean.method === 'glow' ? '' : (clean.iMode === 'resistor' ? '고정 저항 전압' : '전류계'),
        clean.iMode === 'resistor' && clean.method !== 'glow' ? clean.resistor : '',
        clean.hStudent == null ? '' : round(clean.hStudent, 4),
        clean.leds.length,
        JSON.stringify({ method: clean.method, iMin: clean.iMin, iv: led.iv, glow: led.glow }),
        safeText(clean.memo)
      ]);
    });
    return { ok: true, saved: clean.leds.length, id: id, submittedAt: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function validateSubmission(p) {
  if (!p || typeof p !== 'object') throw new Error('보낸 자료가 비어 있습니다.');
  var out = {
    group: needText(p.group, '조'),
    name: needText(p.name, '이름(번호)'),
    memo: optText(p.memo, LIMITS.memo),
    method: p.method === 'glow' ? 'glow' : 'extrapolate',
    iMode: p.iMode === 'resistor' ? 'resistor' : 'ammeter',
    resistor: '',
    iMin: 1,
    hStudent: null,
    leds: []
  };
  if (out.iMode === 'resistor' && out.method !== 'glow') out.resistor = needNum(p.resistor, 1, 1e6, '고정 저항');
  if (out.method !== 'glow') out.iMin = needNum(p.iMin == null ? 1 : p.iMin, 0, 100, '직선 구간 최소 전류');
  if (p.hStudent != null && p.hStudent !== '') out.hStudent = needNum(p.hStudent, -1000, 1000, '학생 h');
  if (!Array.isArray(p.leds) || !p.leds.length) throw new Error('측정한 LED 가 없습니다.');
  if (p.leds.length > LIMITS.leds) throw new Error('LED 는 한 번에 ' + LIMITS.leds + '개까지 제출합니다.');
  p.leds.forEach(function (l, k) {
    var label = 'LED ' + (k + 1);
    if (!l || typeof l !== 'object') throw new Error(label + ' 자료가 비어 있습니다.');
    var led = {
      name: needText(l.name, label + ' 이름'),
      lambda: needNum(l.lambda, 300, 1100, label + ' 파장(nm)'),
      v0: l.v0 == null || l.v0 === '' ? null : needNum(l.v0, -10, 30, label + ' 문턱 전압'),
      iv: [], glow: []
    };
    if (out.method === 'glow') {
      if (!Array.isArray(l.glow) || !l.glow.length) throw new Error(label + ': 빛이 나기 시작한 전압을 1개 이상 기록하세요.');
      if (l.glow.length > LIMITS.glow) throw new Error(label + ': 빛 기준 기록은 ' + LIMITS.glow + '개까지입니다.');
      led.glow = l.glow.map(function (v) { return needNum(v, 0, 30, label + ' 전압'); });
    } else {
      if (!Array.isArray(l.iv) || l.iv.length < 2) throw new Error(label + ': (전압, 전류) 점을 2개 이상 기록하세요.');
      if (l.iv.length > LIMITS.points) throw new Error(label + ': 점은 ' + LIMITS.points + '개까지입니다.');
      led.iv = l.iv.map(function (pt) {
        if (!pt || typeof pt !== 'object') throw new Error(label + ': 측정점이 비어 있습니다.');
        var q = { v: needNum(pt.v, 0, 30, label + ' 전압'), i: needNum(pt.i, 0, 1000, label + ' 전류') };
        if (pt.vr != null && pt.vr !== '') q.vr = needNum(pt.vr, 0, 30, label + ' 저항 전압');
        return q;
      });
    }
    out.leds.push(led);
  });
  return out;
}

/* ---------------- 선생님: 암호 확인 후 자료 ---------------- */

// 선생님 화면의 [들어가기] → 암호가 맞는지만 확인
function teacherLogin(password) {
  checkTeacher(password);
  return { ok: true, version: APP_VERSION };
}

/**
 * 선생님 화면 → google.script.run.teacherData(password)
 * 반환: { rows: [{ submittedAt, group, name, id, led, lambda, method, v0, nPoints, iMode, resistor, hStudent, nLeds, data, memo }] }
 * 조별로 묶기·그래프·평균은 선생님 화면(Teacher.html)에서 PlanckMath 로 다시 계산한다.
 */
function teacherData(password) {
  checkTeacher(password);
  var sheet = getSheet();
  var n = sheet.getLastRow() - 1;
  if (n <= 0) return { rows: [] };
  var values = sheet.getRange(2, 1, n, COLUMNS.length).getValues();
  var rows = [];
  values.forEach(function (r) {
    if (r[1] === '' && r[4] === '') return;   // 빈 줄(선생님이 지운 칸)은 건너뜀
    var data = null;
    try { data = JSON.parse(r[14] || 'null'); } catch (err) { data = null; }
    rows.push({
      submittedAt: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      group: plain(r[1]), name: plain(r[2]), id: String(r[3]), led: plain(r[4]),
      lambda: Number(r[5]), method: String(r[7]), v0: r[8] === '' ? null : Number(r[8]),
      nPoints: Number(r[9]), iMode: String(r[10]), resistor: r[11] === '' ? null : Number(r[11]),
      hStudent: r[12] === '' ? null : Number(r[12]), nLeds: Number(r[13]), data: data, memo: plain(r[15])
    });
  });
  return { rows: rows };
}

function checkTeacher(password) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('teacherFails') || 0);
  // 학생 장난으로 선생님까지 막히지 않게: 스크립트 주인(선생님 구글 계정으로 로그인)은 잠금과 상관없이 암호만 맞으면 들어간다
  if (fails >= LIMITS.failLock && !isOwner()) {
    throw new Error('암호가 여러 번 틀려 ' + Math.round(LIMITS.lockSeconds / 60) + '분 동안 잠겼습니다. 잠시 뒤 다시 하거나, 스프레드시트를 만든 구글 계정으로 로그인한 브라우저에서 여세요.');
  }
  var saved = PropertiesService.getScriptProperties().getProperty('TEACHER_PASSWORD');
  if (!saved || String(saved).length < 6) {
    throw new Error('교사 암호가 아직 정해지지 않았습니다. Apps Script 편집기 → 프로젝트 설정(⚙) → 스크립트 속성에 TEACHER_PASSWORD (6글자 이상)를 추가하세요.');
  }
  if (!sameText(String(password || ''), String(saved))) {
    cache.put('teacherFails', String(fails + 1), LIMITS.lockSeconds);
    throw new Error('암호가 맞지 않습니다.');
  }
  if (fails) cache.remove('teacherFails');   // 맞는 암호가 들어오면 틀린 횟수를 지워 잠금을 바로 푼다
}

// 지금 화면을 연 사람이 이 스크립트의 주인(배포한 선생님)인가.
// 웹앱은 '나'로 실행되므로 실행 계정(effective)은 늘 선생님이고, 연 사람(active)의 메일은 같은 계정일 때만 같다.
// 다른 사람이면 구글이 메일을 빈칸으로 주므로 주인으로 보지 않는다. 확인할 수 없으면 주인이 아닌 것으로 본다.
function isOwner() {
  try {
    var active = Session.getActiveUser().getEmail();
    var effective = Session.getEffectiveUser().getEmail();
    return !!active && active === effective;
  } catch (err) {
    return false;
  }
}

/* ---------------- 도우미 ---------------- */

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 글자 길이가 달라도 끝까지 비교 (몇 글자째에서 틀렸는지 시간으로 드러나지 않게)
function sameText(a, b) {
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function needText(v, label) {
  var s = optText(v, LIMITS.text);
  if (!s) throw new Error(label + '을(를) 넣으세요.');
  return s;
}
function optText(v, max) {
  if (v == null) return '';
  // 줄바꿈·제어 문자는 빈칸으로, 앞뒤 빈칸 지우기, 길이 제한
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function needNum(v, min, max, label) {
  var x = typeof v === 'number' ? v : Number(v);
  if (!isFinite(x) || x < min || x > max) throw new Error(label + ' 값이 올바르지 않습니다 (' + min + ' ~ ' + max + ').');
  return x;
}
// 시트에서 수식으로 실행되지 않게: = + - @ 로 시작하는 글은 앞에 ' 를 붙여 글자로 저장
// 시트가 글자를 수식·날짜·숫자로 바꾸지 않게 늘 앞에 ' 를 붙인다 (예: 조 '1-2' 가 날짜가 되는 것 막기, ' 는 값에 남지 않음)
function safeText(s) { return s ? "'" + s : s; }
function plain(v) { return String(v == null ? '' : v).replace(/^'/, ''); }
function round(x, d) { var k = Math.pow(10, d); return Math.round(x * k) / k; }
