// 시험용 가짜 Apps Script 환경 (LED 플랑크 상수 웹앱, apps-script/planck-led/)
// Code.gs 를 Node 에서 그대로 실행하고(SpreadsheetApp·HtmlService·LockService·CacheService·PropertiesService 흉내),
// Index.html·Teacher.html 을 Apps Script 처럼 include 를 풀어 한 장의 HTML 로 만든다.
// 브라우저 시험에서는 google.script.run 을 흉내 낸 스크립트를 넣어 이 Code.gs 의 함수를 부르게 한다.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeSpreadsheet } = require('./fake-apps-script.cjs');

const DIR = path.join(__dirname, '..', 'apps-script', 'planck-led');
const read = name => fs.readFileSync(path.join(DIR, name), 'utf8');

// Apps Script 의 HtmlTemplate: <?!= include('X') ?> 만 쓰므로 그 부분만 풀어 준다. 다른 <? 가 있으면 시험이 잡도록 오류.
function evaluateTemplate(text, ctx) {
    const out = text.replace(/<\?!=\s*include\('([A-Za-z]+)'\)\s*\?>/g, (_, n) => ctx.include(n));
    if (/<\?/.test(text.replace(/<\?!=\s*include\('([A-Za-z]+)'\)\s*\?>/g, ''))) throw new Error('템플릿에 처리하지 않은 <? 가 있습니다');
    return out;
}

function loadPlanckApp({ password = 'teacher-pw-123' } = {}) {
    const ss = makeSpreadsheet();
    const props = new Map();
    if (password != null) props.set('TEACHER_PASSWORD', password);
    const cache = new Map();
    let uuid = 0;
    const ctx = {
        SpreadsheetApp: { getActiveSpreadsheet: () => ss },
        HtmlService: {
            createTemplateFromFile(name) {
                const text = read(name + '.html');
                return {
                    evaluate() {
                        const content = evaluateTemplate(text, ctx);
                        const out = { title: '', meta: {}, getContent: () => content,
                            setTitle(t) { this.title = t; return this; }, addMetaTag(k, v) { this.meta[k] = v; return this; } };
                        return out;
                    }
                };
            },
            createHtmlOutputFromFile(name) { const c = read(name + '.html'); return { getContent: () => c }; }
        },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
        CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, String(v)) }) },
        PropertiesService: { getScriptProperties: () => ({ getProperty: k => (props.has(k) ? props.get(k) : null) }) },
        Utilities: { getUuid: () => 'abcdef' + String(++uuid).padStart(2, '0') + '-0000-0000' },
        Date, JSON, Math, String, Number, Array, Object, RegExp, Error, isFinite
    };
    vm.createContext(ctx);
    vm.runInContext(read('Code.gs'), ctx);
    const sheet = () => ss.getSheetByName('제출');
    return { ctx, ss, props, cache, sheet, rows: () => (sheet() ? sheet().rows : []) };
}

// 브라우저에 넣을 가짜 google.script.run. window.__gasCall(함수 이름, 인자들) 이 { ok, value } 또는 { ok: false, message } 를 돌려준다.
const FAKE_RUN_SCRIPT = `
window.google = { script: { run: (function () {
  function runner(ok, fail) {
    return new Proxy({}, { get: function (_, name) {
      if (name === 'withSuccessHandler') return function (f) { return runner(f, fail); };
      if (name === 'withFailureHandler') return function (f) { return runner(ok, f); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        window.__gasCall(name, JSON.parse(JSON.stringify(args))).then(function (r) {
          setTimeout(function () { if (r.ok) { ok && ok(r.value); } else { fail && fail(new Error(r.message)); } }, 30);
        });
      };
    } });
  }
  return runner(null, null);
})() } };`;

// Apps Script 처럼 HTML 을 만들고 가짜 google.script.run 을 맨 앞에 넣는다
function renderPage(app, page) {
    const out = app.ctx.doGet({ parameter: page === 'teacher' ? { page: 'teacher' } : {} });
    const viewport = '<meta name="viewport" content="' + (out.meta.viewport || '') + '">';
    return { html: out.getContent().replace('<head>', '<head>' + viewport + '<title>' + out.title + '</title><script>' + FAKE_RUN_SCRIPT + '</script>'), out };
}

// 브라우저에서 온 호출을 Code.gs 함수로 넘긴다 (서버가 던진 오류는 실패로)
function callServer(app, name, args) {
    const allowed = ['submitMeasurement', 'teacherLogin', 'teacherData'];
    if (!allowed.includes(name)) return { ok: false, message: '없는 함수: ' + name };
    try { return { ok: true, value: JSON.parse(JSON.stringify(app.ctx[name].apply(null, args))) }; }
    catch (e) { return { ok: false, message: e.message }; }
}

module.exports = { loadPlanckApp, renderPage, callServer, DIR };
