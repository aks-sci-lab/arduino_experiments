// 시판 블루투스 센서 해석 도구 — 계산 부분 (브라우저·Node 공용, 시험 tests/ble-decode.test.cjs)
// 받은 바이트를 숫자로 읽기, 해석 규칙(필드) 적용, '바뀌는 바이트' 찾기, 참값으로 해석 후보 찾기, UUID·16진수·CSV.
// 화면은 js/ble-explorer.js
(function (root) {
    'use strict';

    // ---------- 숫자 형식 ----------
    // size: 쓰는 바이트 수, signed: 음수 가능. 순서가 곧 '같은 점수일 때 먼저 보여 줄 순서'(부호 있는 것 먼저)
    const FORMATS = [
        { id: 'int8', label: 'int8 (부호 있음 1바이트)', size: 1, int: true },
        { id: 'uint8', label: 'uint8 (1바이트)', size: 1, int: true },
        { id: 'int16le', label: 'int16 LE (2바이트, 작은 자리 먼저)', size: 2, int: true },
        { id: 'uint16le', label: 'uint16 LE', size: 2, int: true },
        { id: 'int16be', label: 'int16 BE (2바이트, 큰 자리 먼저)', size: 2, int: true },
        { id: 'uint16be', label: 'uint16 BE', size: 2, int: true },
        { id: 'int24le', label: 'int24 LE (3바이트)', size: 3, int: true },
        { id: 'uint24le', label: 'uint24 LE', size: 3, int: true },
        { id: 'int24be', label: 'int24 BE', size: 3, int: true },
        { id: 'int32le', label: 'int32 LE (4바이트)', size: 4, int: true },
        { id: 'uint32le', label: 'uint32 LE', size: 4, int: true },
        { id: 'int32be', label: 'int32 BE', size: 4, int: true },
        { id: 'float32le', label: 'float32 LE (소수 4바이트)', size: 4, int: false },
        { id: 'float32be', label: 'float32 BE', size: 4, int: false }
    ];
    const FORMAT_BY_ID = Object.fromEntries(FORMATS.map((f, i) => [f.id, Object.assign({ order: i }, f)]));

    function toBytes(v) {
        if (v instanceof Uint8Array) return v;
        if (Array.isArray(v)) return Uint8Array.from(v);
        if (v instanceof ArrayBuffer) return new Uint8Array(v);
        if (v && v.buffer instanceof ArrayBuffer) return new Uint8Array(v.buffer, v.byteOffset || 0, v.byteLength);
        return new Uint8Array(0);
    }

    // 바이트 묶음의 offset 자리에서 형식대로 읽은 '날것' 숫자 (모자라면 null)
    function readRaw(bytes, offset, format) {
        const f = FORMAT_BY_ID[format];
        const b = toBytes(bytes);
        if (!f || !Number.isInteger(offset) || offset < 0 || offset + f.size > b.length) return null;
        const dv = new DataView(b.buffer, b.byteOffset + offset, f.size);
        switch (format) {
            case 'int8': return dv.getInt8(0);
            case 'uint8': return dv.getUint8(0);
            case 'int16le': return dv.getInt16(0, true);
            case 'uint16le': return dv.getUint16(0, true);
            case 'int16be': return dv.getInt16(0, false);
            case 'uint16be': return dv.getUint16(0, false);
            case 'int24le': case 'uint24le': case 'int24be': {
                const le = format !== 'int24be';
                let u = le ? (b[offset] | (b[offset + 1] << 8) | (b[offset + 2] << 16))
                    : ((b[offset] << 16) | (b[offset + 1] << 8) | b[offset + 2]);
                if (format !== 'uint24le' && (u & 0x800000)) u -= 0x1000000;
                return u;
            }
            case 'int32le': return dv.getInt32(0, true);
            case 'uint32le': return dv.getUint32(0, true);
            case 'int32be': return dv.getInt32(0, false);
            case 'float32le': return dv.getFloat32(0, true);
            case 'float32be': return dv.getFloat32(0, false);
        }
        return null;
    }

    // 비트 마스크 칸(16진수 '0x0F', 10진수 '15', 2진수 '0b1100')을 숫자로. 비면 null
    function parseMask(text) {
        if (text === undefined || text === null || text === '') return null;
        if (typeof text === 'number') return Number.isInteger(text) && text > 0 ? text : null;
        const s = String(text).trim().toLowerCase().replace(/_/g, '');
        if (!s) return null;
        let n = NaN;
        if (/^0x[0-9a-f]+$/.test(s)) n = parseInt(s.slice(2), 16);
        else if (/^0b[01]+$/.test(s)) n = parseInt(s.slice(2), 2);
        else if (/^\d+$/.test(s)) n = parseInt(s, 10);
        return Number.isFinite(n) && n > 0 && n <= 0xffffffff ? n : null;
    }

    // 필드 하나 = { name, offset, format, scale, add, unit, mask }
    // 값 = ((날것 & 마스크) >> 마스크 아래쪽 0 개수) × 배율 + 더할 값
    function readField(bytes, field) {
        if (!field) return null;
        let raw = readRaw(bytes, Number(field.offset), field.format);
        if (raw === null || !Number.isFinite(raw)) return null;
        const mask = parseMask(field.mask);
        if (mask !== null && FORMAT_BY_ID[field.format].int) {
            let shift = 0;
            while (shift < 32 && !((mask >>> shift) & 1)) shift++;
            raw = ((raw >>> 0) & mask) >>> shift;
        }
        const scale = field.scale === undefined || field.scale === '' ? 1 : Number(field.scale);
        const add = field.add === undefined || field.add === '' ? 0 : Number(field.add);
        if (!Number.isFinite(scale) || !Number.isFinite(add)) return null;
        return raw * scale + add;
    }

    function decodePacket(bytes, fields) {
        const out = {};
        (fields || []).forEach((f, i) => { out[f.name || ('값' + (i + 1))] = readField(bytes, f); });
        return out;
    }

    // ---------- 16진수 ----------
    function toHex(bytes, sep) {
        return Array.from(toBytes(bytes), x => x.toString(16).padStart(2, '0').toUpperCase()).join(sep === undefined ? ' ' : sep);
    }
    // 'A5 01 ff', 'a501ff', '0xA5,0x01' 모두 받음. 잘못되면 오류
    function parseHex(text) {
        const s = String(text || '').replace(/0x/gi, '').replace(/[\s,:;-]+/g, '');
        if (!s) throw new Error('16진수를 넣어 주세요 (예: 01 A0 FF).');
        if (!/^[0-9a-fA-F]+$/.test(s)) throw new Error('0~9, A~F 만 쓸 수 있어요.');
        if (s.length % 2) throw new Error('16진수 글자 수가 홀수예요. 한 바이트는 두 글자입니다 (예: 0A).');
        const out = new Uint8Array(s.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
        return out;
    }
    // 명령 바이트 만들기: mode='hex'(기본) 또는 'ascii' (\r, \n, \t, \0, \\ 지원)
    function encodeCommand(text, mode) {
        if (mode === 'ascii') {
            const raw = String(text === undefined || text === null ? '' : text);
            if (!raw) throw new Error('보낼 글자를 넣어 주세요 (예: START\\r\\n).');
            const unescaped = raw.replace(/\\([rnt0\\])/g, (_, ch) => ({ r: '\r', n: '\n', t: '\t', '0': '\0', '\\': '\\' }[ch]));
            return new TextEncoder().encode(unescaped);
        }
        return parseHex(text);
    }

    // ---------- UUID ----------
    const BASE = '-0000-1000-8000-00805f9b34fb';
    // '180f', '0x180F', '0000180f-…', 대문자 모두 → 소문자 128비트. 잘못되면 null
    function normUuid(text) {
        let s = String(text || '').trim().toLowerCase();
        if (s.startsWith('0x')) s = s.slice(2);
        if (/^[0-9a-f]{4}$/.test(s)) return '0000' + s + BASE;
        if (/^[0-9a-f]{8}$/.test(s)) return s + BASE;
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return s;
        if (/^[0-9a-f]{32}$/.test(s)) return s.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
        return null;
    }
    // 표준 16비트면 '0x180F', 아니면 앞 8자리…
    function shortUuid(uuid) {
        const u = normUuid(uuid);
        if (!u) return String(uuid || '');
        if (u.endsWith(BASE) && u.startsWith('0000')) return '0x' + u.slice(4, 8).toUpperCase();
        return u.slice(0, 8) + '…';
    }
    // 여러 UUID 를 쉼표·줄바꿈·공백으로 붙여 넣어도 자동 추출 ('Services: 00001800-..., 49535343-...' 형태 지원)
    const SYSTEM_UUIDS = new Set([normUuid('1800'), normUuid('1801')]);
    function parseUuidList(text) {
        const cleaned = String(text || '').replace(/^\s*services\s*:\s*/gim, '');
        const tokens = cleaned.split(/[\n,\s;]+/).map(s => s.trim()).filter(Boolean);
        const uuids = [], skippedSystem = [], bad = [];
        tokens.forEach(tok => {
            const u = normUuid(tok);
            if (!u) { bad.push(tok); return; }
            if (SYSTEM_UUIDS.has(u)) { if (!skippedSystem.includes(u)) skippedSystem.push(u); return; }
            if (!uuids.includes(u)) uuids.push(u);
        });
        return { uuids, skippedSystem, bad };
    }

    // 자주 쓰는 표준 서비스 (Web Bluetooth 는 여기 적은 서비스만 열 수 있음)
    const STANDARD_SERVICES = [
        { uuid: '180a', name: '기기 정보 (제조사·모델·펌웨어)', on: true },
        { uuid: '180f', name: '배터리', on: true },
        { uuid: '181a', name: '환경 감지 (온도·습도·기압)', on: true },
        { uuid: '1809', name: '체온계 (Health Thermometer)', on: true },
        { uuid: '180d', name: '심박', on: true },
        { uuid: '1816', name: '자전거 속도·회전', on: false },
        { uuid: '1818', name: '자전거 파워', on: false },
        { uuid: '1814', name: '달리기 속도', on: false },
        { uuid: '1819', name: '위치·길찾기', on: false },
        { uuid: '1815', name: '자동화 입출력', on: false },
        { uuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', name: 'Nordic UART (여러 센서가 쓰는 글자 통로)', on: true },
        { uuid: 'ffe0', name: 'BLE 직렬 (HM-10 등 0xFFE0)', on: true },
        { uuid: 'fff0', name: '사용자 지정 BLE (0xFFF0)', on: true },
        { uuid: 'ff00', name: '사용자 지정 BLE (0xFF00)', on: true },
        { uuid: 'fee0', name: '사용자 지정 BLE (0xFEE0)', on: true },
        { uuid: 'fe00', name: '사용자 지정 BLE (0xFE00)', on: true },
        { uuid: 'ffa0', name: '사용자 지정 BLE (0xFFA0)', on: false },
        { uuid: '49535343-fe7d-4ae5-8fa9-9fafd205e455', name: 'Microchip/ISSC UART (사이언스큐브·듀얼모드)', on: true },
        { uuid: '4a5c0000-0000-0000-0000-5c1e741f1c00', name: 'PASCO 무선 센서 (장치 제어)', on: true },
        { uuid: '4a5c0001-0000-0000-0000-5c1e741f1c00', name: 'PASCO 센서 채널 1', on: true },
        { uuid: '4a5c0002-0000-0000-0000-5c1e741f1c00', name: 'PASCO 센서 채널 2', on: true },
        { uuid: '4a5c0003-0000-0000-0000-5c1e741f1c00', name: 'PASCO 센서 채널 3', on: true },
        { uuid: '4a5c0004-0000-0000-0000-5c1e741f1c00', name: 'PASCO 센서 채널 4', on: true },
        { uuid: 'd91714ef-28b9-4f91-ba16-f0d9a604f112', name: 'Vernier Go Direct (공개 방식)', on: true },
        { uuid: '19b10000-e8f2-537e-4f6c-d104768a1214', name: '우리 Pico·Nano 센서 보드 (시험용)', on: false }
    ];
    const KNOWN_NAMES = {
        '1800': '기본 접속 정보', '1801': '기본 속성', '180a': '기기 정보', '180f': '배터리', '181a': '환경 감지',
        '1809': '체온계', '180d': '심박', '1816': '자전거 속도·회전', '1818': '자전거 파워', '1814': '달리기 속도',
        '1819': '위치·길찾기', '1815': '자동화 입출력', '2a29': '제조사 이름', '2a24': '모델 번호', '2a25': '일련번호',
        '2a26': '펌웨어 판', '2a27': '하드웨어 판', '2a28': '소프트웨어 판', '2a23': '시스템 ID', '2a19': '배터리 잔량',
        '2a6e': '온도', '2a6f': '습도', '2a6d': '기압', '2a1c': '체온 측정', '2a37': '심박 측정', '2a00': '기기 이름',
        'ffe0': 'BLE 직렬 (0xFFE0)', 'ffe1': 'BLE 직렬 통로 (0xFFE1)', 'fff0': '사용자 지정 (0xFFF0)', 'ff00': '사용자 지정 (0xFF00)',
        'fee0': '사용자 지정 (0xFEE0)', 'fe00': '사용자 지정 (0xFE00)', 'ffa0': '사용자 지정 (0xFFA0)',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455': 'Microchip/ISSC UART',
        '49535343-1e4d-4bd9-ba61-23c647249616': 'ISSC UART 받기(알림·TX)',
        '49535343-8841-43f4-a8d4-ecbe34729bb3': 'ISSC UART 보내기(쓰기·RX)',
        '49535343-4c8a-39b3-2f49-511cff073b7e': 'ISSC UART 제어',
        '6e400001-b5a3-f393-e0a9-e50e24dcca9e': 'Nordic UART', '6e400002-b5a3-f393-e0a9-e50e24dcca9e': 'UART 받기(쓰기)',
        '6e400003-b5a3-f393-e0a9-e50e24dcca9e': 'UART 보내기(알림)', '19b10000-e8f2-537e-4f6c-d104768a1214': '우리 센서 보드', 'd91714ef-28b9-4f91-ba16-f0d9a604f112': 'Vernier Go Direct'
    };
    function knownName(uuid) {
        const u = normUuid(uuid);
        if (!u) return '';
        if (KNOWN_NAMES[u]) return KNOWN_NAMES[u];
        // PASCO 무선 센서 공식 UUID 규칙 (4a5c000<채널>-000<특성>-0000-0000-5c1e741f1c00)
        const pasco = /^4a5c000([0-9])-000([0-9])-0000-0000-5c1e741f1c00$/.exec(u);
        if (pasco) {
            const ch = Number(pasco[1]), cid = Number(pasco[2]);
            const head = ch === 0 ? 'PASCO 장치' : ('PASCO 채널 ' + ch);
            if (cid === 0) return ch === 0 ? 'PASCO 장치 제어' : ('PASCO 센서 채널 ' + ch);
            if (cid === 2) return head + ' 명령 보내기(쓰기)';
            if (cid === 3) return head + ' 데이터·응답(알림)';
            if (cid === 5) return head + ' 확인(ACK)';
            return head + ' 특성 ' + cid;
        }
        if (u.endsWith(BASE) && u.startsWith('0000')) return KNOWN_NAMES[u.slice(4, 8)] || '';
        return '';
    }
    // 기기 정보 서비스에서 자동으로 읽을 글자 특성 (일련번호 0x2A25 는 Web Bluetooth 가 막음)
    const DEVICE_INFO_CHARS = ['2a29', '2a24', '2a26', '2a27', '2a28'];

    // ---------- 바뀌는 바이트 ----------
    // 패킷 목록 → 길이별 묶음 [{ length, count, changing:[bool], min:[], max:[] }] (많은 것 먼저)
    function changingBytes(packets) {
        const groups = new Map();
        (packets || []).forEach(p => {
            const b = toBytes(p);
            let g = groups.get(b.length);
            if (!g) {
                g = { length: b.length, count: 0, min: Array.from(b), max: Array.from(b) };
                groups.set(b.length, g);
            }
            g.count++;
            for (let i = 0; i < b.length; i++) {
                if (b[i] < g.min[i]) g.min[i] = b[i];
                if (b[i] > g.max[i]) g.max[i] = b[i];
            }
        });
        return Array.from(groups.values()).map(g => Object.assign(g, { changing: g.min.map((m, i) => m !== g.max[i]) }))
            .sort((a, b) => b.count - a.count || a.length - b.length);
    }

    // ---------- 참값 맞추기 ----------
    function fitLine(xs, ys) {
        const n = xs.length;
        if (n < 2) return null;
        let mx = 0, my = 0;
        for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
        mx /= n; my /= n;
        let sxx = 0, syy = 0, sxy = 0;
        for (let i = 0; i < n; i++) {
            const dx = xs[i] - mx, dy = ys[i] - my;
            sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
        }
        if (!(sxx > 0) || !(syy > 0)) return null;
        const scale = sxy / sxx, add = my - scale * mx;
        const r = sxy / Math.sqrt(sxx * syy);
        let se = 0;
        for (let i = 0; i < n; i++) { const e = ys[i] - (scale * xs[i] + add); se += e * e; }
        return { scale, add, r, rmse: Math.sqrt(se / n) };
    }

    // 배율을 보기 좋은 수(1·2·5·2.5 × 10ⁿ)로 다듬을 수 있으면 그 수 (2% 안), 아니면 null
    function niceNumber(x) {
        if (!Number.isFinite(x) || x === 0) return null;
        const sign = x < 0 ? -1 : 1, a = Math.abs(x);
        const p = Math.pow(10, Math.floor(Math.log10(a)));
        for (const m of [1, 2, 2.5, 5, 10]) {
            const c = m * p;
            if (Math.abs(c - a) / a <= 0.02) return sign * Number(c.toPrecision(6));
        }
        return null;
    }

    // samples: [{ bytes, truth }] → 모든 자리·형식에 대해 truth ≈ 배율 × 날것 + 더할 값 을 맞춰 순위
    // 같은 점수(상관계수가 거의 같음)면 적은 바이트·부호 있는 형식·앞 자리 먼저
    function findCandidates(samples, opts) {
        opts = opts || {};
        const list = (samples || []).filter(s => s && Number.isFinite(Number(s.truth)) && toBytes(s.bytes).length);
        if (list.length < 3) return { ok: false, reason: '참값을 3번 이상 찍어 주세요 (서로 다른 값으로).', candidates: [] };
        const ys = list.map(s => Number(s.truth));
        if (Math.max.apply(null, ys) === Math.min.apply(null, ys)) {
            return { ok: false, reason: '참값이 모두 같아요. 값이 달라질 때(데우기·식히기 등) 찍어 주세요.', candidates: [] };
        }
        const minLen = Math.min.apply(null, list.map(s => toBytes(s.bytes).length));
        const formats = opts.formats ? FORMATS.filter(f => opts.formats.includes(f.id)) : FORMATS;
        const out = [];
        for (const f of formats) {
            for (let off = 0; off + f.size <= minLen; off++) {
                const xs = [];
                let bad = false;
                for (const s of list) {
                    const v = readRaw(s.bytes, off, f.id);
                    if (v === null || !Number.isFinite(v) || Math.abs(v) > 1e12) { bad = true; break; }
                    xs.push(v);
                }
                if (bad) continue;
                const fit = fitLine(xs, ys);
                if (!fit) continue;
                const niceScale = niceNumber(fit.scale);
                // 계산 끝자리 오차(−3e-15 같은 것)는 0 으로
                const span = Math.max.apply(null, ys) - Math.min.apply(null, ys);
                if (Math.abs(fit.add) < span * 1e-9) fit.add = 0;
                out.push({
                    offset: off, format: f.id, size: f.size, order: FORMAT_BY_ID[f.id].order,
                    scale: fit.scale, add: fit.add, r: fit.r, r2: fit.r * fit.r, rmse: fit.rmse,
                    niceScale, n: list.length
                });
            }
        }
        const TIE = 1e-5;
        const cleanScore = c => {
            let s = 0;
            if (c.niceScale !== null) { s += 2; if (Math.abs(c.niceScale) === 1) s += 1; }
            if (Math.abs(c.add) < Math.max(1e-6, Math.abs(c.scale) * 0.5)) s += 1;
            return s;
        };
        out.sort((a, b) => {
            if (Math.abs(b.r2 - a.r2) > TIE) return b.r2 - a.r2;
            const cs = cleanScore(b) - cleanScore(a);
            if (cs !== 0) return cs;
            if (a.size !== b.size) return a.size - b.size;
            if (a.order !== b.order) return a.order - b.order;
            return a.offset - b.offset;
        });
        const limit = opts.limit || 10;
        return { ok: true, candidates: out.slice(0, limit), total: out.length };
    }

    // 후보 → 필드 (배율은 다듬은 수가 있으면 그것, 더할 값은 작은 자리 반올림)
    function candidateToField(c, name, unit) {
        const scale = c.niceScale !== null && c.niceScale !== undefined ? c.niceScale : Number(c.scale.toPrecision(6));
        const add = Math.abs(c.add) < Math.abs(scale) * 0.5 ? 0 : Number(c.add.toPrecision(6));
        return { name: name || '값', offset: c.offset, format: c.format, scale, add, unit: unit || '', mask: '' };
    }

    // ---------- 포장 풀기(전처리: Base64 · ASCII 16진수 · 텍스트 숫자) ----------
    const PREPROCESS_TYPES = ['none', 'base64', 'ascii-hex', 'ascii-number'];
    const CHECKSUM_TYPES = ['none', 'sum8', 'xor8'];

    function unescapeMarker(s) {
        return String(s || '').replace(/\\([rnt\\])/g, (_, ch) => ({ r: '\r', n: '\n', t: '\t', '\\': '\\' }[ch]));
    }
    function bytesToAscii(bytes) {
        const b = toBytes(bytes);
        let out = '';
        for (let i = 0; i < b.length; i++) out += String.fromCharCode(b[i]);
        return out;
    }
    function base64ToBytes(str) {
        const clean = String(str || '').replace(/\s+/g, '');
        if (!clean || clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
        try {
            if (typeof atob === 'function') {
                const bin = atob(clean);
                const out = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
                return out;
            }
            if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(clean, 'base64'));
        } catch (e) { return null; }
        return null;
    }
    function verifyChecksum(bytes, kind) {
        const b = toBytes(bytes);
        if (!kind || kind === 'none') return true;
        if (b.length < 2) return false;
        if (kind === 'sum8') {
            let s = 0;
            for (let i = 0; i < b.length - 1; i++) s = (s + b[i]) & 0xff;
            return s === b[b.length - 1];
        }
        if (kind === 'xor8') {
            let x = 0;
            for (let i = 0; i < b.length - 1; i++) x ^= b[i];
            return (x & 0xff) === b[b.length - 1];
        }
        return true;
    }
    function normalizePreprocess(pre) {
        if (!pre || typeof pre !== 'object' || !PREPROCESS_TYPES.includes(pre.type) || pre.type === 'none') {
            return { type: 'none', prefix: '', suffix: '', checksum: 'none' };
        }
        return {
            type: pre.type,
            prefix: String(pre.prefix || '').slice(0, 16),
            suffix: String(pre.suffix || '').slice(0, 16),
            checksum: CHECKSUM_TYPES.includes(pre.checksum) ? pre.checksum : 'none'
        };
    }
    function extractInnerText(text, pre) {
        const pfx = unescapeMarker(pre.prefix);
        const sfx = unescapeMarker(pre.suffix);
        let s = text;
        if (pfx) {
            const idx = s.indexOf(pfx);
            if (idx < 0) return null;
            s = s.slice(idx + pfx.length);
        }
        if (sfx) {
            const end = s.indexOf(sfx);
            if (end < 0) return null;
            s = s.slice(0, end);
        } else if (!pfx) {
            s = s.trim();
        }
        return s;
    }
    // 원본 패킷 바이트 → 포장 푼 바이트 (실패·체크섬 불일치면 null)
    function preprocessPacket(bytes, pre) {
        const raw = toBytes(bytes);
        const p = normalizePreprocess(pre);
        if (p.type === 'none') return raw;
        const inner = extractInnerText(bytesToAscii(raw), p);
        if (inner === null || !inner.length) return null;
        if (p.type === 'base64') {
            const out = base64ToBytes(inner);
            if (!out || !out.length) return null;
            return verifyChecksum(out, p.checksum) ? out : null;
        }
        if (p.type === 'ascii-hex') {
            let out;
            try { out = parseHex(inner); } catch (e) { return null; }
            if (!out.length) return null;
            return verifyChecksum(out, p.checksum) ? out : null;
        }
        if (p.type === 'ascii-number') {
            const nums = (inner.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || []).map(Number).filter(Number.isFinite);
            if (!nums.length) return null;
            const out = new Uint8Array(nums.length * 4);
            const dv = new DataView(out.buffer);
            nums.forEach((n, i) => dv.setFloat32(i * 4, n, true));
            return out;
        }
        return raw;
    }
    // 실시간 스트림 프레이머: BLE UART 가 한 프레임({{…}})을 여러 조각으로 나눠 보내도 이어 붙여 풀기
    function createFramer(pre) {
        const p = normalizePreprocess(pre);
        const pfx = unescapeMarker(p.prefix);
        const sfx = unescapeMarker(p.suffix);
        let buf = '';
        return {
            reset() { buf = ''; },
            push(chunkBytes) {
                const raw = toBytes(chunkBytes);
                if (p.type === 'none' || (!pfx && !sfx)) {
                    const out = preprocessPacket(raw, p);
                    return out ? [out] : [];
                }
                buf += bytesToAscii(raw);
                if (buf.length > 4096) buf = buf.slice(-2048);
                const frames = [];
                while (true) {
                    let start = 0;
                    if (pfx) {
                        start = buf.indexOf(pfx);
                        if (start < 0) {
                            buf = buf.slice(-(pfx.length - 1));
                            break;
                        }
                    }
                    const bodyStart = start + pfx.length;
                    let end;
                    if (sfx) {
                        end = buf.indexOf(sfx, bodyStart);
                        if (end < 0) {
                            if (start > 0) buf = buf.slice(start);
                            break;
                        }
                        const frameText = buf.slice(start, end + sfx.length);
                        buf = buf.slice(end + sfx.length);
                        const frameBytes = Uint8Array.from(frameText, ch => ch.charCodeAt(0) & 0xff);
                        const out = preprocessPacket(frameBytes, p);
                        if (out) frames.push(out);
                    } else {
                        // 접두어만 있는 경우 다음 접두어가 올 때까지 대기
                        const next = buf.indexOf(pfx, bodyStart);
                        if (next < 0) {
                            if (start > 0) buf = buf.slice(start);
                            break;
                        }
                        const frameText = buf.slice(start, next);
                        buf = buf.slice(next);
                        const frameBytes = Uint8Array.from(frameText, ch => ch.charCodeAt(0) & 0xff);
                        const out = preprocessPacket(frameBytes, p);
                        if (out) frames.push(out);
                    }
                }
                return frames;
            }
        };
    }
    // 받은 패킷 묶음에서 Base64·ASCII 16진수·텍스트 숫자 포장을 자동 감지
    function detectFraming(packets) {
        const list = (packets || []).slice(-30).map(toBytes).filter(b => b.length >= 2);
        if (!list.length) return null;
        const ascii = list.filter(b => Array.from(b).every(x => x === 9 || x === 10 || x === 13 || (x >= 32 && x < 127)));
        if (ascii.length < Math.max(1, Math.ceil(list.length * 0.7))) return null;
        const texts = ascii.map(bytesToAscii);

        // 1) Base64 감싸기 확인 ({{...}}, {...}, [...], <...>, 줄바꿈 등)
        const pairs = [['{{', '}}'], ['{', '}'], ['[', ']'], ['<', '>'], ['', '\\r\\n'], ['', '\\n'], ['', '']];
        for (const [prefix, suffix] of pairs) {
            const p = { type: 'base64', prefix, suffix, checksum: 'none' };
            const decoded = [];
            for (let i = 0; i < texts.length; i++) {
                const inner = extractInnerText(texts[i], p);
                if (!inner || inner.length < 8 || inner.length % 4 !== 0) continue;
                // 내부 공백이 있거나 순수 16진수·숫자 문자열이면 Base64 오탐 방지
                if (/\s/.test(inner) || !/[G-Zg-z+/=]/.test(inner)) continue;
                const b = base64ToBytes(inner);
                if (b && b.length >= 4) decoded.push(b);
            }
            if (decoded.length >= Math.max(1, Math.ceil(texts.length * 0.7))) {
                let checksum = 'none';
                if (decoded.length >= 2) {
                    const sumOk = decoded.filter(b => verifyChecksum(b, 'sum8')).length;
                    const xorOk = decoded.filter(b => verifyChecksum(b, 'xor8')).length;
                    if (sumOk >= Math.ceil(decoded.length * 0.9)) checksum = 'sum8';
                    else if (xorOk >= Math.ceil(decoded.length * 0.9)) checksum = 'xor8';
                }
                const wrapTxt = (prefix || suffix) ? (prefix + '…' + suffix) : '문자열';
                const csTxt = checksum === 'sum8' ? ' · 끝 바이트 합 체크섬 일치' : checksum === 'xor8' ? ' · 끝 바이트 XOR 체크섬 일치' : '';
                return {
                    type: 'base64', prefix, suffix, checksum,
                    decodedLength: decoded[0].length,
                    label: 'Base64 (' + wrapTxt + ')',
                    reason: wrapTxt + ' 안의 Base64 (풀면 ' + decoded[0].length + '바이트' + csTxt + ')'
                };
            }
        }

        // 2) ASCII 16진수 글자 확인 (예: "A5 01 2E 09" 또는 "A5012E09\r\n")
        for (const [prefix, suffix] of [['{{', '}}'], ['<', '>'], ['', '\\r\\n'], ['', '\\n'], ['', '']]) {
            const p = { type: 'ascii-hex', prefix, suffix, checksum: 'none' };
            const decoded = [];
            for (let i = 0; i < texts.length; i++) {
                const inner = extractInnerText(texts[i], p);
                if (!inner || inner.length < 8) continue;
                if (!/^[0-9a-fA-F\s,:-]+$/.test(inner)) continue;
                if (!/[a-fA-F]/.test(inner) && !/\s/.test(inner.trim())) continue;
                try {
                    const b = parseHex(inner);
                    if (b.length >= 4) decoded.push(b);
                } catch (e) { /* 무시 */ }
            }
            if (decoded.length >= Math.max(1, Math.ceil(texts.length * 0.7))) {
                return {
                    type: 'ascii-hex', prefix, suffix, checksum: 'none',
                    decodedLength: decoded[0].length,
                    label: 'ASCII 16진수',
                    reason: '16진수 글자열 (풀면 ' + decoded[0].length + '바이트)'
                };
            }
        }

        // 3) 텍스트·CSV 숫자 확인 (예: "23.45\r\n", "T:23.4,H:48.2")
        const numCounts = [];
        for (let i = 0; i < texts.length; i++) {
            const trimmed = texts[i].trim();
            if (!trimmed) continue;
            const nums = trimmed.match(/-?\d+(?:\.\d+)?/g);
            if (nums && nums.length >= 1 && nums.length <= 8) numCounts.push(nums.length);
        }
        if (numCounts.length >= Math.max(1, Math.ceil(texts.length * 0.7))) {
            const sample = texts[texts.length - 1].trim().slice(0, 32);
            return {
                type: 'ascii-number', prefix: '', suffix: '', checksum: 'none',
                decodedLength: numCounts[0] * 4,
                count: numCounts[0],
                label: '텍스트·CSV 숫자',
                reason: '글자 속 숫자 ' + numCounts[0] + '개 (예: "' + sample + '") → float32 LE 로 변환'
            };
        }
        return null;
    }

    function decodeCharPacket(bytes, charRule) {
        if (!charRule) return null;
        const unpacked = preprocessPacket(bytes, charRule.preprocess);
        if (!unpacked) return null;
        return decodePacket(unpacked, charRule.fields);
    }

    // ---------- 하드웨어 주기 변경 명령 (rateCommand) ----------
    // { service?, characteristic, mode:'ascii'|'hex', template?:'RATE:{{ms}}\r\n', map?:{ '100':'01 0A' } }
    function buildRateCommand(rateCommand, intervalMs) {
        if (!rateCommand || typeof rateCommand !== 'object') return null;
        const ms = Math.max(10, Math.min(3600000, Math.round(Number(intervalMs) || 0)));
        if (!Number.isFinite(ms) || ms <= 0) return null;
        const characteristic = normUuid(rateCommand.characteristic);
        if (!characteristic) return null;
        const service = normUuid(rateCommand.service) || '';
        const mode = rateCommand.mode === 'hex' ? 'hex' : 'ascii';
        let payload = '';
        if (rateCommand.map && typeof rateCommand.map === 'object' && rateCommand.map[String(ms)] !== undefined) {
            payload = String(rateCommand.map[String(ms)]);
        } else if (rateCommand.template) {
            const hz = Number((1000 / ms).toFixed(3));
            const sec = Number((ms / 1000).toFixed(3));
            payload = String(rateCommand.template)
                .replace(/\{\{\s*ms\s*\}\}/gi, String(ms))
                .replace(/\{\{\s*hz\s*\}\}/gi, String(hz))
                .replace(/\{\{\s*sec\s*\}\}/gi, String(sec));
        } else {
            return null;
        }
        const bytes = encodeCommand(payload, mode);
        return { service, characteristic, mode, payload, bytes };
    }

    // ---------- 해석 규칙 파일 ----------
    // { schema:'sensor-lab-ble-decoder', version:1, name, device:{ namePrefix, maker, model, firmware },
    //   characteristics:[{ service, characteristic, mode:'notify'|'read', preprocess?:{type,prefix,suffix,checksum}, fields:[필드…] }],
    //   initCommands?:[…], rateCommand?:{ service?, characteristic, mode, template?, map? }, notes }
    const SCHEMA = 'sensor-lab-ble-decoder';
    function validateDecoder(obj) {
        const errors = [];
        if (!obj || typeof obj !== 'object') return { ok: false, errors: ['JSON 모양이 아니에요.'] };
        if (obj.schema !== SCHEMA) errors.push('해석 규칙 파일이 아니에요 (schema 가 ' + SCHEMA + ' 여야 함).');
        if (!Array.isArray(obj.characteristics)) errors.push('characteristics 목록이 없어요.');
        const chars = [];
        (obj.characteristics || []).forEach((c, i) => {
            const service = normUuid(c && c.service), characteristic = normUuid(c && c.characteristic);
            if (!characteristic) { errors.push((i + 1) + '번째 특성 UUID 가 잘못됐어요.'); return; }
            let preprocess = null;
            if (c && c.preprocess !== undefined && c.preprocess !== null) {
                if (typeof c.preprocess !== 'object' || !PREPROCESS_TYPES.includes(c.preprocess.type)) {
                    errors.push((i + 1) + '번째 특성의 포장 풀기(preprocess) 형식이 잘못됐어요.');
                    return;
                }
                const np = normalizePreprocess(c.preprocess);
                if (np.type !== 'none') preprocess = np;
            }
            const fields = [];
            (Array.isArray(c.fields) ? c.fields : []).forEach((f, j) => {
                if (!f || !FORMAT_BY_ID[f.format]) { errors.push((i + 1) + '번째 특성 ' + (j + 1) + '번째 필드 형식이 잘못됐어요.'); return; }
                const offset = Number(f.offset);
                if (!Number.isInteger(offset) || offset < 0 || offset > 511) { errors.push((i + 1) + '번째 특성 ' + (j + 1) + '번째 필드 시작 위치가 잘못됐어요.'); return; }
                const scale = f.scale === undefined || f.scale === '' ? 1 : Number(f.scale);
                const add = f.add === undefined || f.add === '' ? 0 : Number(f.add);
                if (!Number.isFinite(scale) || !Number.isFinite(add)) { errors.push((i + 1) + '번째 특성 ' + (j + 1) + '번째 필드 배율·더할 값이 숫자가 아니에요.'); return; }
                fields.push({
                    name: String(f.name || ('값' + (j + 1))).slice(0, 40), offset, format: f.format, scale, add,
                    unit: String(f.unit || '').slice(0, 20), mask: f.mask === undefined || f.mask === null ? '' : String(f.mask).slice(0, 20)
                });
            });
            const entry = { service: service || '', characteristic, mode: c.mode === 'read' ? 'read' : 'notify', fields };
            if (preprocess) entry.preprocess = preprocess;
            chars.push(entry);
        });
        const initCommands = [];
        if (obj.initCommands !== undefined) {
            if (!Array.isArray(obj.initCommands)) errors.push('initCommands 는 목록이어야 해요.');
            else obj.initCommands.slice(0, 20).forEach((cmd, i) => {
                const characteristic = normUuid(cmd && cmd.characteristic);
                if (!characteristic) { errors.push((i + 1) + '번째 시작 명령의 특성 UUID 가 잘못됐어요.'); return; }
                const service = normUuid(cmd && cmd.service) || '';
                const mode = cmd && cmd.mode === 'ascii' ? 'ascii' : 'hex';
                const payload = String(cmd && cmd.payload !== undefined ? cmd.payload : '').slice(0, 200);
                try { encodeCommand(payload, mode); } catch (e) { errors.push((i + 1) + '번째 시작 명령: ' + e.message); return; }
                const delayMs = Math.max(0, Math.min(10000, Math.round(Number(cmd && cmd.delayMs) || 0)));
                initCommands.push({ service, characteristic, mode, payload, delayMs, label: String((cmd && cmd.label) || '').slice(0, 40) });
            });
        }
        let rateCommand = null;
        if (obj.rateCommand !== undefined && obj.rateCommand !== null) {
            const rc = obj.rateCommand;
            if (typeof rc !== 'object' || Array.isArray(rc)) {
                errors.push('rateCommand 모양이 잘못됐어요.');
            } else {
                const characteristic = normUuid(rc.characteristic);
                const service = normUuid(rc.service) || '';
                const mode = rc.mode === 'hex' ? 'hex' : 'ascii';
                const template = rc.template ? String(rc.template).slice(0, 200) : '';
                const map = {};
                if (rc.map && typeof rc.map === 'object' && !Array.isArray(rc.map)) {
                    Object.keys(rc.map).slice(0, 20).forEach(k => {
                        const ms = parseInt(k, 10);
                        if (!Number.isInteger(ms) || ms < 10 || ms > 3600000) {
                            errors.push('rateCommand.map 의 간격(' + k + 'ms)이 잘못됐어요.');
                            return;
                        }
                        const pay = String(rc.map[k] || '').slice(0, 200);
                        try { encodeCommand(pay, mode); map[String(ms)] = pay; } catch (e) { errors.push('rateCommand.map[' + k + ']: ' + e.message); }
                    });
                }
                if (!characteristic) {
                    errors.push('rateCommand 의 특성 UUID 가 잘못됐어요.');
                } else if (!template && !Object.keys(map).length) {
                    errors.push('rateCommand 에 template 또는 map 이 필요해요.');
                } else {
                    if (template) {
                        try { buildRateCommand({ service, characteristic, mode, template }, 1000); } catch (e) { errors.push('rateCommand.template: ' + e.message); }
                    }
                    rateCommand = { service, characteristic, mode };
                    if (template) rateCommand.template = template;
                    if (Object.keys(map).length) rateCommand.map = map;
                }
            }
        }
        if (errors.length) return { ok: false, errors };
        const d = obj.device || {};
        const clean = {
            schema: SCHEMA, version: 1, name: String(obj.name || '이름 없는 센서').slice(0, 60),
            device: {
                namePrefix: String(d.namePrefix || '').slice(0, 40), maker: String(d.maker || '').slice(0, 60),
                model: String(d.model || '').slice(0, 60), firmware: String(d.firmware || '').slice(0, 40)
            },
            characteristics: chars, notes: String(obj.notes || '').slice(0, 2000)
        };
        if (initCommands.length) clean.initCommands = initCommands;
        if (rateCommand) clean.rateCommand = rateCommand;
        if (obj.builtin) clean.builtin = true;
        if (obj.savedAt) clean.savedAt = String(obj.savedAt).slice(0, 40);
        return { ok: true, decoder: clean };
    }

    // ---------- 기록 내보내기 ----------
    function csvCell(v) {
        if (v === null || v === undefined) return '';
        let s = String(v);
        if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;   // 표 프로그램 수식 막기
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    // records: [{ t(초), at(ISO), char(uuid), bytes }], decoders: { uuid: fields[] }, preprocessors?: { uuid: pre }
    function recordsToCsv(records, decoders, preprocessors) {
        decoders = decoders || {};
        preprocessors = preprocessors || {};
        const names = [];
        Object.keys(decoders).forEach(u => (decoders[u] || []).forEach((f, i) => {
            const n = f.name || ('값' + (i + 1));
            if (!names.includes(n)) names.push(n);
        }));
        const head = ['t_s', 'time', 'characteristic', 'length', 'hex'].concat(names);
        const lines = [head.map(csvCell).join(',')];
        (records || []).forEach(r => {
            let dec = {};
            if (decoders[r.char]) {
                const unpacked = preprocessPacket(r.bytes, preprocessors[r.char]);
                if (unpacked) dec = decodePacket(unpacked, decoders[r.char]);
            }
            const row = [Number(r.t).toFixed(3), r.at || '', r.char, toBytes(r.bytes).length, toHex(r.bytes)]
                .concat(names.map(n => (dec[n] === undefined || dec[n] === null ? '' : Number(dec[n].toPrecision(10)))));
            lines.push(row.map(csvCell).join(','));
        });
        return lines.join('\n') + '\n';
    }
    function recordsToJson(records, meta) {
        return JSON.stringify({
            schema: 'sensor-lab-ble-log', version: 1, meta: meta || {},
            records: (records || []).map(r => ({ t: r.t, at: r.at, char: r.char, hex: toHex(r.bytes, '') }))
        }, null, 1);
    }
    function recordsFromJson(text) {
        const obj = JSON.parse(text);
        if (!obj || obj.schema !== 'sensor-lab-ble-log' || !Array.isArray(obj.records)) throw new Error('기록 파일(sensor-lab-ble-log)이 아니에요.');
        return {
            meta: obj.meta || {},
            records: obj.records.map(r => ({ t: Number(r.t) || 0, at: String(r.at || ''), char: normUuid(r.char) || String(r.char || ''), bytes: r.hex ? parseHex(r.hex) : new Uint8Array(0) }))
        };
    }

    // 실측 역추적으로 확인된 기본 내장 규칙 (기기 이름 접두사가 맞을 때 자동 매칭)
    const BUILTIN_PROFILES = [
        {
            schema: SCHEMA,
            version: 1,
            name: 'ScienceCube 온도 센서 (SC:TEMP)',
            builtin: true,
            device: { namePrefix: 'SC:TEMP', maker: 'ScienceCube', model: 'WL100T', firmware: '' },
            characteristics: [{
                service: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
                characteristic: '49535343-1e4d-4bd9-ba61-23c647249616',
                mode: 'notify',
                preprocess: { type: 'base64', prefix: '{{', suffix: '}}', checksum: 'sum8' },
                fields: [{ name: '온도', offset: 4, format: 'float32le', scale: 1, add: 0, unit: '°C', mask: '' }]
            }],
            notes: '실측 패킷 역추적: {{Base64}} → 12바이트, offset 4 float32 LE (°C), 끝 바이트 8비트 합 체크섬'
        }
    ];

    // 해석하지 않아도 공개된 연결 방식으로 바로 쓸 수 있는 센서인지 (기기 이름·서비스로 판단). 없으면 null
    const KNOWN_VENDORS = [
        { id: 'vernier', name: 'Vernier Go Direct', service: 'd91714ef-28b9-4f91-ba16-f0d9a604f112', namePrefix: 'GDX' },
        { id: 'pasco', name: 'PASCO Wireless', service: '4a5c0000-0000-0000-0000-5c1e741f1c00', servicePattern: /^4a5c000[0-9]-0000-0000-0000-5c1e741f1c00$/ }
    ];
    // 버니어 Go Direct 명령 묶음 (공개 도구 godirect-js, BSD 3-Clause 의 Device._sendCommand 와 같은 모양):
    // [0x58, 전체 길이, 순번, 합계, …명령]. 합계 = 모든 바이트 합(합계 칸 0) 의 아래 8비트
    const VERNIER = {
        SERVICE: 'd91714ef-28b9-4f91-ba16-f0d9a604f112',
        COMMAND: 'f4bf14a6-c7d5-4b6d-8aa8-df1a7c83adcb',
        RESPONSE: 'b41e6675-a329-40e0-aa01-44d2f444babe',
        INIT: [0x1a, 0xa5, 0x4a, 0x06, 0x49, 0x07, 0x48, 0x08, 0x47, 0x09, 0x46, 0x0a, 0x45, 0x0b, 0x44, 0x0c, 0x43, 0x0d, 0x42, 0x0e, 0x41],
        GET_STATUS: [0x10]
    };
    function vernierCommand(sub, counter) {
        const b = new Uint8Array(4 + sub.length);
        b[0] = 0x58; b[1] = b.length; b[2] = counter & 0xff; b[3] = 0;
        b.set(sub, 4);
        let sum = 0;
        for (let i = 0; i < b.length; i++) sum = (sum + b[i]) & 0xff;
        b[3] = sum;
        return b;
    }
    function knownVendor(deviceName, serviceUuids) {
        const svcs = (serviceUuids || []).map(normUuid).filter(Boolean);
        return KNOWN_VENDORS.find(v =>
            svcs.includes(v.service) ||
            (v.servicePattern && svcs.some(s => v.servicePattern.test(s))) ||
            (v.namePrefix && String(deviceName || '').startsWith(v.namePrefix))
        ) || null;
    }

    const api = {
        knownVendor, KNOWN_VENDORS, VERNIER, vernierCommand, BUILTIN_PROFILES,
        FORMATS, FORMAT_BY_ID, STANDARD_SERVICES, DEVICE_INFO_CHARS, SCHEMA, PREPROCESS_TYPES, CHECKSUM_TYPES,
        toBytes, readRaw, parseMask, readField, decodePacket, decodeCharPacket,
        base64ToBytes, verifyChecksum, normalizePreprocess, preprocessPacket, createFramer, detectFraming,
        toHex, parseHex, encodeCommand, buildRateCommand, normUuid, shortUuid, parseUuidList, knownName,
        changingBytes, fitLine, niceNumber, findCandidates, candidateToField, validateDecoder,
        recordsToCsv, recordsToJson, recordsFromJson, csvCell
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.BleDecode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
