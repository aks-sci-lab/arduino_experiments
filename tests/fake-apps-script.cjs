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
    // 수업 코드 '2-4821' 처럼 두 부분이어도 (2074년 2월 같은) 날짜로 바뀐다
    if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(x) || /^\d{1,4}[-/.]\d{1,4}$/.test(x) || /^\d{4}-\d{2}-\d{2}T/.test(x)) {
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

// opts.code: Code.gs 대신 시험할 코드 글자, opts.fetch(url, params) → { code, body(문자열 또는 Buffer) }: 가짜 인터넷
//   (스스로 업데이트 5판: 사이트 파일·Apps Script API). 부른 순서는 돌려주는 값의 fetches 에 쌓인다
function loadCodeGs(opts) {
    opts = opts || {};
    const ss = makeSpreadsheet();
    const fetches = [];
    const store = new Map();
    const scriptId = opts.scriptId || 'SCRIPT_ID_FAKE_0123456789abcdef';
    const ctx = {
        SpreadsheetApp: { getActiveSpreadsheet: () => ss },
        ContentService: {
            MimeType: { JSON: 'application/json' },
            createTextOutput(text) { return { text, setMimeType() { return this; }, getContent() { return text; } }; }
        },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
        // 수업 연결(4판): 교사 열쇠 만들기·해시. 진짜처럼 부호 있는 바이트 배열을 돌려준다
        Utilities: {
            DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
            // 글자(UTF-8) 또는 바이트 배열(부호 있는 값, getContent() 결과) 모두 받음
            computeDigest(alg, v) {
                const buf = Array.isArray(v) ? Buffer.from(v.map(x => (x + 256) % 256)) : Buffer.from(String(v), 'utf8');
                return Array.from(new Int8Array(require('node:crypto').createHash('sha256').update(buf).digest()));
            },
            getUuid() { return require('node:crypto').randomUUID(); }
        },
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: k => (store.has(k) ? store.get(k) : null),
                setProperty: (k, v) => { store.set(k, String(v)); },
                deleteProperty: k => { store.delete(k); }
            })
        },
        ScriptApp: {
            getScriptId: () => scriptId,
            getOAuthToken: () => 'TOKEN_FAKE',
            getService: () => ({ getUrl: () => opts.serviceUrl || 'https://script.google.com/macros/s/DEPLOY_ID_FAKE/exec' })
        },
        UrlFetchApp: {
            fetch(url, params) {
                params = params || {};
                fetches.push({ url, method: (params.method || 'get').toLowerCase(), payload: params.payload, headers: params.headers || {} });
                const r = opts.fetch ? opts.fetch(url, params) : { code: 404, body: '' };
                const buf = Buffer.isBuffer(r.body) ? r.body : Buffer.from(String(r.body == null ? '' : r.body), 'utf8');
                return {
                    getResponseCode: () => r.code,
                    getContent: () => Array.from(new Int8Array(buf)),
                    getContentText: () => buf.toString('utf8')
                };
            }
        },
        Date, JSON, Math, String, Number, Array, Object, RegExp, isFinite
    };
    vm.createContext(ctx);
    vm.runInContext(opts.code != null ? opts.code : fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
    return {
        ss, fetches, props: store,
        get(params) { return JSON.parse(ctx.doGet({ parameter: params }).getContent()); },
        post(body) {
            const contents = typeof body === 'string' ? body : JSON.stringify(body);
            return JSON.parse(ctx.doPost({ postData: { contents, type: 'text/plain' } }).getContent());
        },
        ctx
    };
}

module.exports = { loadCodeGs, makeSpreadsheet };
