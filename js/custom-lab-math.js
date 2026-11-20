// 선생님이 만든 실험(custom-lab)용 계산·검사 함수 (브라우저/Node 공용)
// 전역 이름: CustomLabMath
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CustomLabMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    const MAX_COLS = 8;         // 표의 열 수 한도
    const MAX_ROWS = 200;       // 표의 행 수 한도
    const MAX_QUESTIONS = 5;    // 생각해 볼 질문 수 한도
    const MAX_TITLE = 80;
    const MAX_DESC = 5000;
    const FITS = ['none', 'proportional', 'linear'];
    // 학생 화면 방식: 'single' 한 화면에 모두 / 'steps' 보고서 순서 7단계 탭 (목적·이론·준비물·과정·데이터·결과·결론)
    const LAYOUTS = ['single', 'steps', 'hd'];   // hd = 가설연역 6단계 (같은 7단계 칸을 묶어 보임, docs/inquiry-types-design.md)
    const STEP_TEXTS = ['theory', 'materials', 'procedure'];   // 선생님이 따로 쓰는 단계 글 (목적은 실험 안내 글)
    const MAX_STEP_TEXT = 3000;
    const MAX_SERIES = 3000;        // 센서로 한 번에 기록하는 점 수 한도
    const MAX_SUBMIT_SERIES = 1500; // 제출에 담는 점 수 한도 (넘으면 고르게 솎아 냄)

    // 우리 센서 보드(Pico 환경 센서)의 기능. 보드는 한 번에 한 기능만 측정한다 (펌웨어 START:<command>).
    // fields: [값 이름(key), 화면 이름, 단위, 소수 자릿수]. rates: 측정 주기 선택지 [보드에 보내는 값, 화면 이름]
    const SLOW_RATES = [['1000', '1초마다'], ['2000', '2초마다'], ['5000', '5초마다']];
    const SENSORS = {
        env: {
            label: '환경 (온도·습도·기압)', command: 'ENV', rates: SLOW_RATES,
            fields: [['temp', '온도', '°C', 2], ['humidity', '습도', '%RH', 1], ['pressure', '기압', 'kPa', 3]]
        },
        light: {
            label: '조도 (밝기)', command: 'LIGHT', rates: SLOW_RATES,
            fields: [['lux', '조도', 'lux', 2], ['full', '광대역 채널', 'counts', 0], ['infrared', '적외선 채널', 'counts', 0]]
        },
        uv: {
            label: '자외선', command: 'UV', rates: SLOW_RATES,
            fields: [['uvRaw', '자외선 원시 신호', 'counts', 0]]
        },
        voc: {
            label: '공기질 (VOC Index)', command: 'VOC', rates: [['1000', '1초마다']],
            fields: [['vocIndex', 'VOC Index', 'Index', 0], ['temp', '온도', '°C', 2], ['humidity', '습도', '%RH', 1]]
        },
        imu: {
            label: '가속도', command: 'IMU', rates: [['25', '1초에 25번'], ['50', '1초에 50번'], ['100', '1초에 100번']],
            fields: [['total', '가속도 크기', 'g', 3], ['x', 'x축 가속도', 'g', 3], ['y', 'y축 가속도', 'g', 3], ['z', 'z축 가속도', 'g', 3]]
        },
        // 보드에 INA219/INA226 전류·전압 모듈을 더 꽂았을 때 (펌웨어 2026.11-iv 이상)
        iv: {
            label: '전류·전압 (INA219/INA226 모듈)', command: 'IV',
            rates: [['200', '0.2초마다'], ['500', '0.5초마다'], ['1000', '1초마다']],
            fields: [['voltage', '전압', 'V', 3], ['current', '전류', 'mA', 3]]
        },
        // 시판 Vernier Go Direct® 무선 센서 (버니어 공개 도구 vendor/godirect, js/vernier-godirect.js).
        // 센서마다 채널(힘·온도·전압 …)이 달라, 선생님은 '몇 개의 칸'을 고르고 학생이 연결한 뒤 칸마다 채널을 고른다.
        // 칸 이름·단위는 연결하면 센서가 알려 준 이름으로 바뀐다
        vernier: {
            label: 'Vernier Go Direct 센서 (시판 무선 센서)', vendor: 'vernier',
            rates: [['auto', '센서 기본 빠르기'], ['100', '1초에 10번'], ['500', '0.5초마다'], ['1000', '1초마다']],
            fields: [['ch1', '채널 1', '', 3], ['ch2', '채널 2', '', 3], ['ch3', '채널 3', '', 3]]
        }
    };

    // 실험 설정의 센서 부분을 다듬는다. 반환: { mode: 'none' | 기능 이름, fields: [값 이름...] }
    function normalizeSensor(sensor) {
        const mode = sensor && Object.prototype.hasOwnProperty.call(SENSORS, sensor.mode) ? sensor.mode : 'none';
        if (mode === 'none') return { mode: 'none', fields: [] };
        const known = SENSORS[mode].fields.map(f => f[0]);
        const picked = Array.isArray(sensor.fields) ? sensor.fields : [];
        let fields = known.filter(k => picked.includes(k));   // 목록의 순서를 따른다
        if (!fields.length) fields = [known[0]];
        return { mode, fields };
    }
    // 고른 측정값의 정보 목록: [{ key, name, unit, digits }]
    function sensorFields(sensor) {
        const s = normalizeSensor(sensor);
        if (s.mode === 'none') return [];
        return SENSORS[s.mode].fields.filter(f => s.fields.includes(f[0]))
            .map(f => ({ key: f[0], name: f[1], unit: f[2], digits: f[3] }));
    }
    // 센서 값을 화면·표에 넣을 글자로 (자릿수 맞춤). 값이 없으면 빈 글자
    function sensorValueText(value, digits) {
        return typeof value === 'number' && isFinite(value) ? value.toFixed(digits) : '';
    }

    // 센서 기록: { t: [초...], v: { 값 이름: [값...] } }
    function emptySeries(fields) {
        const v = {};
        fields.forEach(f => { v[f.key] = []; });
        return { t: [], v };
    }
    // 저장·제출에서 읽어 온 기록을 확인해 다듬는다 (모양이 다르면 빈 기록)
    function normalizeSeries(series, fields) {
        const out = emptySeries(fields);
        if (!series || !Array.isArray(series.t) || !series.v) return out;
        const n = Math.min(series.t.length, MAX_SERIES);
        if (!fields.every(f => Array.isArray(series.v[f.key]) && series.v[f.key].length >= n)) return out;
        for (let i = 0; i < n; i++) {
            if (typeof series.t[i] !== 'number' || !isFinite(series.t[i])) return emptySeries(fields);
            out.t.push(series.t[i]);
            fields.forEach(f => {
                const val = series.v[f.key][i];
                out.v[f.key].push(typeof val === 'number' && isFinite(val) ? val : null);
            });
        }
        return out;
    }
    // 점이 max 개를 넘으면 처음과 끝을 지키며 고르게 솎아 낸다. 반환: { series, thinned }
    function thinSeries(series, max) {
        const n = series.t.length;
        if (n <= max) return { series, thinned: false };
        const idx = [];
        for (let i = 0; i < max; i++) idx.push(Math.round(i * (n - 1) / (max - 1)));
        const out = { t: idx.map(i => series.t[i]), v: {} };
        Object.keys(series.v).forEach(k => { out.v[k] = idx.map(i => series.v[k][i]); });
        return { series: out, thinned: true };
    }
    function seriesToCsv(series, fields) {
        const lines = [['시간 (s)'].concat(fields.map(f => f.name + ' (' + f.unit + ')')).join(',')];
        series.t.forEach((t, i) => {
            lines.push([t.toFixed(3)].concat(fields.map(f => sensorValueText(series.v[f.key][i], f.digits))).join(','));
        });
        return '\uFEFF' + lines.join('\r\n') + '\r\n';
    }
    // 기록 요약 문장: "조도 12.3~456.7 lux"
    function seriesSummary(series, fields) {
        if (!series.t.length) return '';
        const parts = fields.map(f => {
            const vals = series.v[f.key].filter(v => v !== null);
            if (!vals.length) return f.name + ' 값 없음';
            return f.name + ' ' + sensorValueText(Math.min.apply(null, vals), f.digits) + '~' + sensorValueText(Math.max.apply(null, vals), f.digits) + ' ' + f.unit;
        });
        return '센서 ' + series.t.length + '점 (' + series.t[series.t.length - 1].toFixed(1) + '초): ' + parts.join(', ');
    }

    // 글자 → 숫자. 빈칸·숫자가 아닌 글자는 null. 쉼표 소수점(3,14)과 유니코드 빼기(−)도 받는다.
    function parseNumber(v) {
        if (typeof v === 'number') return isFinite(v) ? v : null;
        if (v == null) return null;
        let s = String(v).trim().replace(/−/g, '-');
        if (!s) return null;
        if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
        if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
        const n = Number(s);
        return isFinite(n) ? n : null;
    }

    // 엑셀·한셀·구글 시트에서 복사한 글(탭·줄바꿈 구분)을 2차원 배열로
    function parsePaste(text) {
        const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
        while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
        return lines.map(line => line.split('\t').map(c => c.trim()));
    }

    // 실험 설정을 정해진 모양으로 다듬는다 (모르는 칸은 버리고 한도를 넘는 부분은 자른다)
    function normalizeDefinition(def) {
        def = def || {};
        const str = (v, max) => (typeof v === 'string' ? v : '').slice(0, max);
        let columns = Array.isArray(def.columns) ? def.columns : [];
        columns = columns.slice(0, MAX_COLS).map(c => ({
            name: str(c && c.name, 30).trim(),
            unit: str(c && c.unit, 15).trim()
        }));
        let questions = Array.isArray(def.questions) ? def.questions : [];
        questions = questions.map(q => str(q, 300).trim()).filter(Boolean).slice(0, MAX_QUESTIONS);
        const idx = (v, fallback) => (Number.isInteger(v) && v >= 0 && v < columns.length ? v : fallback);
        return {
            version: 1,
            title: str(def.title, MAX_TITLE).trim(),
            description: str(def.description, MAX_DESC),
            columns,
            xCol: idx(def.xCol, 0),
            yCol: idx(def.yCol, Math.min(1, Math.max(0, columns.length - 1))),
            fit: FITS.includes(def.fit) ? def.fit : 'none',
            questions,
            sensor: normalizeSensor(def.sensor),
            layout: LAYOUTS.includes(def.layout) ? def.layout : 'single',
            stepTexts: STEP_TEXTS.reduce((o, k) => { o[k] = str(def.stepTexts && def.stepTexts[k], MAX_STEP_TEXT); return o; }, {}),
            published: def.published === true
        };
    }

    // 저장하기 전에 확인. 문제가 있으면 한국어 안내 문장 목록을 돌려준다.
    function validateDefinition(def) {
        const d = normalizeDefinition(def);
        const errors = [];
        if (!d.title) errors.push('실험 제목을 넣으세요.');
        if (!d.columns.length) errors.push('측정값 표의 열을 하나 이상 만드세요.');
        d.columns.forEach((c, i) => { if (!c.name) errors.push((i + 1) + '번째 열의 이름이 비어 있습니다.'); });
        const names = d.columns.map(c => c.name).filter(Boolean);
        if (new Set(names).size !== names.length) errors.push('이름이 같은 열이 있습니다. 서로 다른 이름을 쓰세요.');
        if (d.columns.length >= 2 && d.xCol === d.yCol) errors.push('그래프의 가로축과 세로축에 서로 다른 열을 고르세요.');
        return { ok: errors.length === 0, errors, definition: d };
    }

    // 열 머리글: "전압 (V)"
    function columnLabel(col) {
        if (!col) return '';
        return col.unit ? col.name + ' (' + col.unit + ')' : col.name;
    }

    // 표에서 가로축·세로축 값이 모두 숫자인 행만 골라 점 목록으로
    function pointsFromRows(rows, xCol, yCol) {
        const pts = [];
        (rows || []).forEach(r => {
            const x = parseNumber(r && r[xCol]);
            const y = parseNumber(r && r[yCol]);
            if (x !== null && y !== null) pts.push({ x, y });
        });
        return pts;
    }

    // 한 칸이라도 채워진 행의 수
    function filledRowCount(rows) {
        return (rows || []).filter(r => (r || []).some(c => String(c == null ? '' : c).trim() !== '')).length;
    }

    // 최소제곱법. kind: 'proportional' (y = a·x) 또는 'linear' (y = a·x + b)
    // 반환: { kind, n, slope, intercept, r2 } 또는 null (점이 모자라거나 x 가 모두 같을 때)
    function fit(points, kind) {
        const n = points.length;
        if (kind !== 'proportional' && kind !== 'linear') return null;
        if (n < 2) return null;
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        points.forEach(p => { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; });
        let slope, intercept;
        if (kind === 'proportional') {
            if (!(sxx > 0)) return null;
            slope = sxy / sxx; intercept = 0;
        } else {
            const D = n * sxx - sx * sx;
            if (!(Math.abs(D) > 1e-12 * Math.max(1, n * sxx))) return null;
            slope = (n * sxy - sx * sy) / D;
            intercept = (sy - slope * sx) / n;
        }
        const my = sy / n;
        let ssRes = 0, ssTot = 0;
        points.forEach(p => {
            ssRes += Math.pow(p.y - (slope * p.x + intercept), 2);
            ssTot += Math.pow(p.y - my, 2);
        });
        return { kind, n, slope, intercept, r2: ssTot > 0 ? 1 - ssRes / ssTot : null };
    }

    // 화면에 보일 숫자 (유효 숫자 4자리, 너무 크거나 작으면 지수 표기)
    function formatNumber(v) {
        if (v === null || v === undefined || !isFinite(v)) return '—';
        if (v === 0) return '0';
        const a = Math.abs(v);
        if (a >= 1e5 || a < 1e-3) return v.toExponential(3).replace('e+', 'e');
        return String(Number(v.toPrecision(4)));
    }

    // 맞춤 결과를 문장으로: "전압 = 2.01 × 전류 + 0.03 (R² = 0.998, 점 6개)"
    function fitText(result, xName, yName) {
        if (!result) return '';
        let s = yName + ' = ' + formatNumber(result.slope) + ' × ' + xName;
        if (result.kind === 'linear') {
            s += (result.intercept < 0 ? ' − ' : ' + ') + formatNumber(Math.abs(result.intercept));
        }
        s += ' (';
        if (result.r2 !== null) s += 'R² = ' + result.r2.toFixed(4) + ', ';
        return s + '점 ' + result.n + '개)';
    }

    // 엑셀에서 한글이 깨지지 않도록 BOM 을 붙인 CSV
    function toCsv(columns, rows) {
        const esc = v => {
            const s = String(v == null ? '' : v);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const lines = [columns.map(c => esc(columnLabel(c))).join(',')];
        (rows || []).forEach(r => {
            if (!(r || []).some(c => String(c == null ? '' : c).trim() !== '')) return;
            lines.push(columns.map((_, i) => esc(r[i])).join(','));
        });
        return '﻿' + lines.join('\r\n') + '\r\n';
    }

    // ---------- 조 공유 (js/class-share.js, 구글 로그인 없이 사이트 저장소로) ----------
    const SHARE_SERIES = MAX_SUBMIT_SERIES;   // 보낼 때 센서 기록 점 수 한도 (넘으면 고르게 솎아 냄)
    // 서버 요약 이름 규칙 (예전 Code.gs 규칙. 지금 저장소 js/lab-store.js 는 더 넓게 받음): 영어·숫자·한글·공백·.()- 30자
    function summaryKey(s, fallback) {
        const k = String(s == null ? '' : s).replace(/[^A-Za-z0-9_가-힣 .()-]/g, '').trim().slice(0, 30);
        return k || fallback;
    }
    function roundSig(v) { return typeof v === 'number' && isFinite(v) ? Number(v.toPrecision(6)) : null; }
    function nonEmptyRows(rows) {
        return (rows || []).filter(r => (r || []).some(c => String(c == null ? '' : c).trim() !== ''));
    }
    /* 이 기기가 보낼 것 → ClassShare 의 getItems 모양 [{ id, title, n, summary, data }]
       o: { def, rows, answers, series, fields, sel }. 표·센서 기록·질문 답을 따로 한 줄씩 (비어 있어도 n 0 으로 보내 '지움') */
    function shareItems(o) {
        const def = o.def, cols = def.columns;
        const rows = nonEmptyRows(o.rows).map(r => cols.map((_, i) => String(r[i] == null ? '' : r[i]).slice(0, 200)));
        const sel = o.sel || { x: def.xCol, y: def.yCol, fit: def.fit };
        const items = [];
        const tSum = { 행: rows.length };
        if (cols.length >= 2 && sel.x !== sel.y) {
            const r = fit(pointsFromRows(rows, sel.x, sel.y), sel.fit);
            if (r) {
                tSum['기울기'] = roundSig(r.slope);
                if (r.kind === 'linear') tSum['절편'] = roundSig(r.intercept);
                if (r.r2 !== null) tSum.R2 = roundSig(r.r2);
            }
        }
        items.push({ id: 'table', title: '측정값 표', n: rows.length, summary: tSum, data: { cols: cols.map(c => c.name), rows } });
        const fields = o.fields || [];
        if (fields.length) {
            const s = o.series || emptySeries(fields), n = s.t.length;
            const sum = { 점: n };
            if (n) {
                sum['초'] = roundSig(s.t[n - 1]);
                fields.forEach(f => {
                    const vals = s.v[f.key].filter(v => v !== null);
                    if (!vals.length) return;
                    const k = summaryKey(f.name, f.key);
                    sum[(k + ' 최소').slice(0, 30)] = roundSig(Math.min.apply(null, vals));
                    sum[(k + ' 최대').slice(0, 30)] = roundSig(Math.max.apply(null, vals));
                });
            }
            const thin = thinSeries(s, SHARE_SERIES);
            items.push({ id: 'sensor', title: '센서 기록', n, summary: sum,
                data: { mode: def.sensor.mode, keys: fields.map(f => f.key), series: n ? thin.series : null, total: thin.thinned ? n : undefined } });
        }
        if (def.questions.length) {
            const answers = def.questions.map((_, i) => String((o.answers || [])[i] || '').slice(0, 2000));
            const done = answers.filter(a => a.trim()).length;
            items.push({ id: 'answers', title: '질문 답', n: done, summary: { 답: done, 질문: def.questions.length }, data: { questions: def.questions, answers } });
        }
        return items;
    }
    /* 같은 조 다른 기기가 보낸 것(ClassShare onIncoming 의 items)을 기기별 보관함에 넣는다.
       ext: { 기기번호: { from, rows, series, answers } } (이 기기에서 잰 값과 따로). 돌려주는 값: { ext, changed }
       표는 열 이름으로 맞춰 넣는다 (선생님이 실험을 고쳐 열 순서가 달라져도) */
    function mergeIncoming(ext, items, def, fields) {
        const out = {};
        // CSV 로 불러온 것(이름이 csv 로 시작)은 서버 목록에 없으니 그대로 둔다
        Object.keys(ext || {}).forEach(k => { if (/^csv/.test(k)) out[k] = ext[k]; });
        (items || []).forEach(it => {
            if (!it || !it.device || /^csv/.test(it.device) || !it.data || typeof it.data !== 'object') return;
            const box = out[it.device] || (out[it.device] = { from: String(it.from || it.device), rows: [], series: null, answers: [] });
            if (it.id === 'table' && Array.isArray(it.data.rows) && Array.isArray(it.data.cols)) {
                const at = def.columns.map(c => it.data.cols.indexOf(c.name));
                if (at.some(i => i >= 0)) {
                    box.rows = it.data.rows.slice(0, MAX_ROWS).map(r => at.map(i => (i >= 0 && Array.isArray(r) && r[i] != null ? String(r[i]) : '')))
                        .filter(r => r.some(c => c.trim() !== ''));
                }
            } else if (it.id === 'sensor' && it.data.series && it.data.mode === def.sensor.mode) {
                const s = normalizeSeries(it.data.series, fields || []);
                if (s.t.length) box.series = s;
            } else if (it.id === 'answers' && Array.isArray(it.data.questions) && Array.isArray(it.data.answers)) {
                box.answers = def.questions.map(q => {
                    const i = it.data.questions.indexOf(q);
                    return i >= 0 ? String(it.data.answers[i] || '') : '';
                });
            }
        });
        Object.keys(out).forEach(d => { const b = out[d]; if (/^csv/.test(d)) return; if (!b.rows.length && !b.series && !b.answers.some(a => a.trim())) delete out[d]; });
        const changed = JSON.stringify(out) !== JSON.stringify(ext || {});
        return { ext: changed ? out : (ext || {}), changed };
    }
    // 불러온 값 개수 (표의 행 + 센서 점 + 답)
    function incomingCount(ext) {
        return Object.keys(ext || {}).reduce((n, d) => {
            const b = ext[d];
            return n + (b.rows || []).length + (b.series ? b.series.t.length : 0) + (b.answers || []).filter(a => String(a).trim()).length;
        }, 0);
    }
    // 저장해 둔 보관함을 읽을 때 모양을 다듬는다
    function normalizeExt(ext, def, fields) {
        const out = {};
        if (!ext || typeof ext !== 'object') return out;
        Object.keys(ext).slice(0, 30).forEach(d => {
            const b = ext[d];
            if (!/^[A-Za-z0-9_-]{4,20}$/.test(d) || !b || typeof b !== 'object') return;
            out[d] = {
                from: String(b.from || d).slice(0, 40),
                rows: (Array.isArray(b.rows) ? b.rows : []).slice(0, MAX_ROWS).map(r => def.columns.map((_, i) => (Array.isArray(r) && r[i] != null ? String(r[i]) : ''))),
                series: b.series ? normalizeSeries(b.series, fields || []) : null,
                answers: def.questions.map((_, i) => (Array.isArray(b.answers) && typeof b.answers[i] === 'string' ? b.answers[i] : ''))
            };
            if (out[d].series && !out[d].series.t.length) out[d].series = null;
        });
        return out;
    }

    // CSV 한 파일 → 글자 칸 목록 (따옴표·따옴표 안 줄바꿈·BOM 처리)
    function parseCsv(text) {
        const s = String(text || '').replace(/^﻿/, '');
        const out = []; let row = [], cell = '', q = false;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (q) {
                if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
                else cell += ch;
            } else if (ch === '"') q = true;
            else if (ch === ',') { row.push(cell); cell = ''; }
            else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && s[i + 1] === '\n') i++;
                row.push(cell); out.push(row); row = []; cell = '';
            } else cell += ch;
        }
        if (cell !== '' || row.length) { row.push(cell); out.push(row); }
        return out.filter(r => r.some(c => c.trim() !== ''));
    }
    /* 이 페이지의 'CSV 저장' 파일을 표 행으로 (첫 줄 머리글을 열 이름·"이름 (단위)"로 맞춤)
       돌려주는 값: { rows } 또는 { error } */
    function rowsFromCsv(text, columns) {
        const grid = parseCsv(text);
        if (grid.length < 2) return { error: '값이 들어 있는 CSV 가 아닙니다.' };
        const head = grid[0].map(h => h.trim());
        const at = columns.map(c => {
            let i = head.indexOf(columnLabel(c));
            if (i < 0) i = head.indexOf(c.name);
            return i;
        });
        if (!at.some(i => i >= 0)) return { error: '첫 줄의 열 이름이 이 실험의 표와 맞지 않습니다 (이 페이지에서 저장한 CSV 인지 확인하세요).' };
        const rows = grid.slice(1, MAX_ROWS + 1).map(r => at.map(i => (i >= 0 && r[i] != null ? r[i].trim() : ''))).filter(r => r.some(c => c !== ''));
        return { rows };
    }

    return {
        MAX_COLS, MAX_ROWS, MAX_QUESTIONS, MAX_TITLE, MAX_DESC, FITS, MAX_SERIES, MAX_SUBMIT_SERIES, SENSORS,
        LAYOUTS, STEP_TEXTS, MAX_STEP_TEXT,
        normalizeSensor, sensorFields, sensorValueText, emptySeries, normalizeSeries, thinSeries, seriesToCsv, seriesSummary,
        parseNumber, parsePaste, normalizeDefinition, validateDefinition, columnLabel,
        pointsFromRows, filledRowCount, fit, formatNumber, fitText, toCsv,
        summaryKey, shareItems, mergeIncoming, incomingCount, normalizeExt, parseCsv, rowsFromCsv
    };
});
