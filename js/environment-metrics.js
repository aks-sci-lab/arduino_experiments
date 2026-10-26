(function (root) {
    'use strict';
    function vaporPressure(temp, humidity) {
        if (!Number.isFinite(temp) || temp < -40 || temp > 85
            || !Number.isFinite(humidity) || humidity < 0 || humidity > 100) {
            throw new Error('수증기 분압 계산에 유효하지 않은 온도·상대습도입니다.');
        }
        return 0.61094 * Math.exp(17.625 * temp / (temp + 243.04)) * humidity / 100;
    }

    function validateCombined(packet) {
        if (!packet || packet.type !== 'env_voc') {
            throw new Error('환경·VOC 통합 펌웨어가 필요합니다. 최신 main.py와 extra_sensors.py를 장치에 저장하세요.');
        }
        root.EnvironmentProtocol.validateSample({ ...packet, type: 'env' });
        root.SensorDefinitions.validate('voc', { ...packet, type: 'voc' });
        return packet;
    }

    const api = { vaporPressure, validateCombined };
    if (typeof module !== 'undefined' && module.exports) {
        root = {
            EnvironmentProtocol: require('./environment-protocol.js'),
            SensorDefinitions: require('./sensor-definitions.js')
        };
        module.exports = api;
    } else root.EnvironmentMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
