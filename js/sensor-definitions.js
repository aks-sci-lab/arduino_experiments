(function (root) {
    'use strict';

    const definitions = {
        light: {
            title: '조도 센서 측정', sensor: 'TSL2591', command: 'LIGHT', key: 'lux', unit: 'lux', digits: 3,
            description: '가시광선과 적외선 채널에서 계산한 조도입니다. 100ms 적분, 25배 이득으로 시작하며 포화 시 1배로 낮춥니다. 조명·가림·거리 변화 비교용으로 사용하세요.',
            fields: [['lux', '조도', 'lux'], ['full', '광대역 채널', 'counts'], ['infrared', '적외선 채널', 'counts'], ['gain', '이득', '배']]
        },
        uv: {
            title: '자외선 센서 측정', sensor: 'LTR390', command: 'UV', key: 'uvRaw', unit: 'counts', digits: 0,
            description: '20비트·이득 3배·400ms 적분으로 읽은 UVS 원시 카운트입니다. UV Index나 자외선 세기(W/m²)가 아니며, 안전 판단이나 표준 측정값으로 사용할 수 없습니다.',
            fields: [['uvRaw', 'UVS 원시 신호', 'counts']]
        },
        voc: {
            title: 'VOC Index 측정', sensor: 'SGP40', command: 'VOC', key: 'vocIndex', unit: 'Index', digits: 0,
            description: 'Sensirion 공식 Gas Index Algorithm으로 계산한 상대 VOC 지표(1~500)입니다. 100은 알고리즘이 학습한 평소 수준, 100보다 높으면 상대적으로 VOC가 많은 방향, 낮으면 적은 방향입니다. ppm 농도나 건강·안전 기준이 아닙니다. 첫 60초와 알고리즘 초기화 중에는 값을 표시하지 않으며, 연결 중 1초마다 계산합니다.',
            fields: [['vocIndex', 'VOC Index', 'Index'], ['sraw', 'VOC 원시 신호', 'SRAW'], ['warmup', '안정화 남은 시간', 's'], ['temp', '보정 온도', '°C'], ['humidity', '보정 습도', '%RH']]
        }
    };

    function validate(mode, packet) {
        if (!definitions[mode] || !packet || packet.type !== mode || !packet.data
            || !Number.isSafeInteger(packet.ts) || packet.ts < 0
            || !Number.isSafeInteger(packet.seq) || packet.seq < 0) {
            throw new Error('센서 종류 또는 측정 시각이 올바르지 않습니다. 최신 펌웨어를 확인하세요.');
        }
        const data = packet.data;
        const inRange = (key, min, max, integer = false) => Number.isFinite(data[key])
            && data[key] >= min && data[key] <= max && (!integer || Number.isInteger(data[key]));
        let valid;
        if (mode === 'light') {
            valid = inRange('lux', 0, 200000) && inRange('full', 0, 36862, true)
                && inRange('infrared', 0, 36862, true) && [1, 25].includes(data.gain);
        } else if (mode === 'uv') {
            valid = inRange('uvRaw', 0, 1048574, true);
        } else {
            valid = inRange('sraw', 0, 65535, true) && inRange('warmup', 0, 60, true)
                && inRange('temp', -40, 85) && inRange('humidity', 0, 100);
            if ('vocIndex' in data) {
                valid = valid && (data.vocIndex === null || inRange('vocIndex', 1, 500, true));
            }
        }
        if (!valid) throw new Error('센서 데이터의 단위 또는 범위가 올바르지 않습니다.');
        return packet;
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { definitions, validate };
    else root.SensorDefinitions = { definitions, validate };
})(typeof globalThis !== 'undefined' ? globalThis : this);
