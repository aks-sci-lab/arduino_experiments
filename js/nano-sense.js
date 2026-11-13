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

    const api = {
        SERVICE_UUID, TX_UUID, CMD_UUID, ACCEL_UUID, NAME_PREFIX, STALE_MS, MAX_SAMPLES, MAX_CHART_POINTS,
        MODES, isNanoName, rateCommands, validateBoard, makeValidator, environmentSample,
        toCsv, thin, isStale, friendlyError
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.NanoSense = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
