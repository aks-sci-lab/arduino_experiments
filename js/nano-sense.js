// 아두이노 Nano 33 BLE Sense Rev2 실험 페이지의 계산·약속 모음 (화면과 따로 두어 시험할 수 있게 함)
// 펌웨어: firmware/nano33-ble-sense-rev2/NanoSenseLab/NanoSenseLab.ino
(function (root) {
    'use strict';

    // Pico 센서 보드와 같은 블루투스 약속을 쓴다.
    const SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
    const TX_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';
    const CMD_UUID = '19b10002-e8f2-537e-4f6c-d104768a1214';
    const ACCEL_UUID = '19b10004-e8f2-537e-4f6c-d104768a1214';
    const NAME_PREFIX = 'NanoSense-';
    const STALE_MS = 15000;          // 값이 이만큼 안 오면 안내
    const MAX_SAMPLES = 60000;       // 한 번 기록에 담는 최대 측정 수 (100 Hz 로 10분)
    const MAX_CHART_POINTS = 1500;   // 그래프에 그리는 최대 점 수

    const MODES = {
        imu: {
            label: '가속도',
            start: 'START:IMU',
            rateCommand: 'SET_IMU_RATE:',
            rates: [
                { value: 100, label: '1초에 100번 (100 Hz)' },
                { value: 50, label: '1초에 50번 (50 Hz)' },
                { value: 25, label: '1초에 25번 (25 Hz)' }
            ],
            defaultRate: 100,
            fields: [
                { key: 'x', label: 'x', unit: 'g', digits: 3, color: '#dc3545' },
                { key: 'y', label: 'y', unit: 'g', digits: 3, color: '#28a745' },
                { key: 'z', label: 'z', unit: 'g', digits: 3, color: '#007bff' },
                { key: 'total', label: '크기 |a|', unit: 'g', digits: 3, color: '#6f42c1' }
            ]
        },
        env: {
            label: '환경 (온도·습도·기압)',
            start: 'START:ENV',
            rateCommand: 'SET_SENSOR_RATE:',
            rates: [
                { value: 1000, label: '1초마다' },
                { value: 2000, label: '2초마다' },
                { value: 5000, label: '5초마다' }
            ],
            defaultRate: 1000,
            fields: [
                { key: 'temp', label: '온도', unit: '°C', digits: 2, color: '#dc3545' },
                { key: 'humidity', label: '습도', unit: '%', digits: 1, color: '#17a2b8' },
                { key: 'pressure', label: '기압', unit: 'kPa', digits: 3, color: '#6c757d' }
            ]
        }
    };

    function isNanoName(name) {
        return typeof name === 'string' && /^NanoSense-[0-9A-F]{4}$/.test(name);
    }

    function rateCommands(mode, rate) {
        const config = MODES[mode];
        if (!config) throw new Error('알 수 없는 측정 종류입니다: ' + mode);
        const value = Number(rate);
        if (!config.rates.some(item => item.value === value)) {
            throw new Error('고를 수 없는 측정 간격입니다: ' + rate);
        }
        return [config.rateCommand + value, config.start];
    }

    // 보드 정보 응답 {"type":"board", ...} 검사
    function validateBoard(packet) {
        const data = packet && packet.data;
        if (!data || typeof data.name !== 'string' || typeof data.fw !== 'string'
            || !Number.isSafeInteger(packet.ts) || packet.ts < 0
            || !Number.isSafeInteger(packet.seq) || packet.seq < 0) {
            throw new Error('보드 정보 형식이 올바르지 않습니다.');
        }
        return packet;
    }

    // TX 특성으로 오는 JSON 한 줄 검사: 환경 값 또는 보드 정보만 받는다.
    function makeValidator(validateEnvironment) {
        return packet => {
            if (packet && packet.type === 'board') return validateBoard(packet);
            if (packet && packet.type === 'env') return validateEnvironment(packet);
            throw new Error('이 페이지에서 쓰지 않는 메시지입니다. 아두이노 펌웨어(NanoSenseLab.ino)를 올렸는지 확인하세요.');
        };
    }

    // 환경 값: 보드 시각(ms)을 첫 값 기준 초로 바꾼다.
    function environmentSample(packet, firstTs) {
        const start = Number.isFinite(firstTs) ? firstTs : packet.ts;
        return {
            time: (packet.ts - start) / 1000,
            temp: packet.data.temp,
            humidity: packet.data.humidity,
            pressure: packet.data.pressure
        };
    }

    function round(value, digits) {
        return Number.isFinite(value) ? Number(value.toFixed(digits)) : '';
    }

    function toCsv(mode, samples) {
        const config = MODES[mode];
        if (!config) throw new Error('알 수 없는 측정 종류입니다: ' + mode);
        const header = ['시간 (s)', ...config.fields.map(field => `${field.label} (${field.unit})`)];
        const lines = [header.join(',')];
        for (const sample of samples) {
            lines.push([round(sample.time, 3), ...config.fields.map(field => round(sample[field.key], field.digits + 2))].join(','));
        }
        // 엑셀에서 한글이 깨지지 않도록 BOM 을 붙인다.
        return '﻿' + lines.join('\r\n') + '\r\n';
    }

    // 그래프용으로 점을 고르게 줄인다 (첫 점·마지막 점은 남김).
    function thin(samples, maxPoints = MAX_CHART_POINTS) {
        if (samples.length <= maxPoints) return samples.slice();
        const result = [];
        const step = (samples.length - 1) / (maxPoints - 1);
        for (let i = 0; i < maxPoints; i++) result.push(samples[Math.round(i * step)]);
        return result;
    }

    function isStale(lastSampleAt, now, limit = STALE_MS) {
        return Number.isFinite(lastSampleAt) && now - lastSampleAt >= limit;
    }

    // 보드가 보낸 오류 문구 앞의 'Pico: ' 를 이 보드에 맞게 바꾼다.
    function friendlyError(error) {
        const message = (error && error.message) || String(error);
        return message.replace(/^Pico: /, '보드: ');
    }

    // ---------- 회차(측정 한 번) · 조 공유 ----------
    const SHARE_POINTS = 1500;   // 조 공유·저장 때 한 회차에 담는 최대 점 수 (고르게 줄임)

    function mean(list, key) {
        let sum = 0, n = 0;
        for (const s of list) if (Number.isFinite(s[key])) { sum += s[key]; n++; }
        return n ? sum / n : null;
    }
    function fixed(value, digits) { return Number.isFinite(value) ? Number(value.toFixed(digits)) : null; }

    function runTitle(mode, no) {
        return (mode === 'imu' ? '가속도 ' : '환경 ') + no + '회';
    }

    // 교사 진행 보기·회차 표에 보일 숫자 (앞 4개가 교사 화면에 보임)
    function runSummary(mode, samples) {
        const list = samples || [];
        const duration = list.length > 1 ? list[list.length - 1].time - list[0].time : 0;
        if (mode === 'imu') {
            let max = null;
            for (const s of list) if (Number.isFinite(s.total) && (max === null || s.total > max)) max = s.total;
            return { '평균 크기(g)': fixed(mean(list, 'total'), 3), '최대 크기(g)': fixed(max, 3), '시간(s)': fixed(duration, 1), '점': list.length };
        }
        return { '온도(C)': fixed(mean(list, 'temp'), 2), '습도(퍼센트)': fixed(mean(list, 'humidity'), 1), '기압(kPa)': fixed(mean(list, 'pressure'), 3), '시간(s)': fixed(duration, 1) };
    }

    // 회차 → 보낼·저장할 자료 (짧게: 숫자 배열, 점은 고르게 줄임)
    function packRun(mode, samples) {
        const config = MODES[mode];
        if (!config) throw new Error('알 수 없는 측정 종류입니다: ' + mode);
        const keys = config.fields.map(f => f.key).filter(k => k !== 'total');
        const digits = config.fields.filter(f => f.key !== 'total').map(f => f.digits + 1);
        const rows = thin(samples || [], SHARE_POINTS).map(s => [fixed(s.time, 3), ...keys.map((k, i) => fixed(s[k], digits[i]))]);
        return { v: 1, mode, keys, n: (samples || []).length, rows };
    }

    // 받은 자료 → 회차 점들. 모양이 틀리면 null
    function unpackRun(data) {
        if (!data || data.v !== 1 || !MODES[data.mode] || !Array.isArray(data.rows) || !Array.isArray(data.keys)) return null;
        const expected = MODES[data.mode].fields.map(f => f.key).filter(k => k !== 'total');
        if (data.keys.join() !== expected.join()) return null;
        const samples = [];
        for (const row of data.rows) {
            if (!Array.isArray(row) || row.length !== expected.length + 1 || !row.every(x => x === null || Number.isFinite(x))) return null;
            const s = { time: row[0] };
            expected.forEach((k, i) => { s[k] = row[i + 1] === null ? NaN : row[i + 1]; });
            if (data.mode === 'imu') s.total = Math.hypot(s.x, s.y, s.z);
            samples.push(s);
        }
        return { mode: data.mode, samples, n: Number.isSafeInteger(data.n) ? data.n : samples.length };
    }

    // 내 회차들 → 조 공유로 보낼 것 (ClassShare getItems)
    function shareItems(runs) {
        return (runs || []).filter(r => r.samples && r.samples.length).map(r => ({
            id: r.id, title: runTitle(r.mode, r.no), n: r.n || r.samples.length,
            summary: r.summary || runSummary(r.mode, r.samples), data: packRun(r.mode, r.samples)
        }));
    }

    // 같은 조 다른 노트북이 보낸 것 → 받은 회차 모음(Map, 열쇠 = 노트북-id)에 합침. 바뀌었으면 true
    // 받은 목록에 없는 회차는 보낸 노트북이 지운 것이라 뺀다 (목록은 늘 그 조 전체)
    function mergeIncoming(store, items) {
        let changed = false;
        const seen = new Set();
        for (const it of items || []) {
            const run = unpackRun(it.data);
            if (!run) continue;
            const key = it.device + '-' + it.id;
            seen.add(key);
            const old = store.get(key);
            if (old && old.sentAt === it.sentAt) continue;
            store.set(key, { key, id: it.id, device: it.device, from: it.from, mode: run.mode, title: it.title || runTitle(run.mode, '?'),
                samples: run.samples, n: run.n, summary: it.summary || runSummary(run.mode, run.samples), sentAt: it.sentAt, incoming: true });
            changed = true;
        }
        for (const [key, run] of store) {
            if (!seen.has(key)) { store.delete(key); changed = true; }
        }
        return changed;
    }

    const api = {
        SERVICE_UUID, TX_UUID, CMD_UUID, ACCEL_UUID, NAME_PREFIX, STALE_MS, MAX_SAMPLES, MAX_CHART_POINTS,
        MODES, isNanoName, rateCommands, validateBoard, makeValidator, environmentSample,
        toCsv, thin, isStale, friendlyError,
        SHARE_POINTS, runTitle, runSummary, packRun, unpackRun, shareItems, mergeIncoming
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.NanoSense = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
