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

    return {
        MAX_COLS, MAX_ROWS, MAX_QUESTIONS, MAX_TITLE, MAX_DESC, FITS, MAX_SERIES, MAX_SUBMIT_SERIES, SENSORS,
        normalizeSensor, sensorFields, sensorValueText, emptySeries, normalizeSeries, thinSeries, seriesToCsv, seriesSummary,
        parseNumber, parsePaste, normalizeDefinition, validateDefinition, columnLabel,
        pointsFromRows, filledRowCount, fit, formatNumber, fitText, toCsv
    };
});
