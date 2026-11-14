// 시험용 가짜 Apps Script 환경: apps-script/Code.gs 를 Node 에서 그대로 실행한다
// (SpreadsheetApp·ContentService·LockService 를 흉내 냄). 시험 파일이 아니라 도우미라 이름이 .test.cjs 가 아님.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 진짜 구글 시트처럼 글자를 바꿔 저장한다: "'" 로 시작하면 그 뒤 글자 그대로(글자 강제),
// 날짜처럼 보이면 Date, 숫자처럼 보이면 숫자. (2026-11-14 조 코드 '2-3-5376' 이 날짜로 바뀌어 목록에서 사라진 문제를 시험에서 잡기 위해)
function sheetValue(x) {
    if (typeof x !== 'string') return x;
    if (x.startsWith("'")) return x.slice(1);
    if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(x) || /^\d{4}-\d{2}-\d{2}T/.test(x)) {
        const d = new Date(x);
        return isNaN(d) ? new Date(0) : d;
    }
    if (/^\s*-?\d+(\.\d+)?(e[-+]?\d+)?\s*$/i.test(x)) return Number(x);
    return x;
}

function makeSpreadsheet() {
    const sheets = new Map();
    class Sheet {
        constructor(name) { this.name = name; this.rows = []; this.written = []; }   // written: 보낸 그대로(' 포함)
        appendRow(row) { this.written.push(Array.from(row)); this.rows.push(Array.from(row, sheetValue)); }
        setFrozenRows() {}
        getLastRow() { return this.rows.length; }
        getRange(r, c, nr, nc) {
            const sh = this;
            return {
                getValues() {
                    const out = [];
                    for (let i = 0; i < nr; i++) {
                        const row = sh.rows[r - 1 + i] || [];
                        out.push(Array.from({ length: nc }, (_, j) => (row[c - 1 + j] === undefined ? '' : row[c - 1 + j])));
                    }
                    return out;
                },
                setValues(vals) {
                    vals.forEach((v, i) => {
                        const row = sh.rows[r - 1 + i] || (sh.rows[r - 1 + i] = []);
                        sh.written[r - 1 + i] = Array.from(v);
                        v.forEach((x, j) => { row[c - 1 + j] = sheetValue(x); });
                    });
                }
            };
        }
    }
    return {
        sheets,
        getSheetByName(n) { return sheets.get(n) || null; },
        insertSheet(n) { const s = new Sheet(n); sheets.set(n, s); return s; }
    };
}

function loadCodeGs() {
    const ss = makeSpreadsheet();
    const ctx = {
        SpreadsheetApp: { getActiveSpreadsheet: () => ss },
        ContentService: {
            MimeType: { JSON: 'application/json' },
            createTextOutput(text) { return { text, setMimeType() { return this; }, getContent() { return text; } }; }
        },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
        Date, JSON, Math, String, Number, Array, Object, RegExp, isFinite
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
    return {
        ss,
        get(params) { return JSON.parse(ctx.doGet({ parameter: params }).getContent()); },
        post(body) {
            const contents = typeof body === 'string' ? body : JSON.stringify(body);
            return JSON.parse(ctx.doPost({ postData: { contents, type: 'text/plain' } }).getContent());
        },
        ctx
    };
}

module.exports = { loadCodeGs, makeSpreadsheet };
