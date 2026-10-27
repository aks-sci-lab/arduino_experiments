const test = require('node:test');
const assert = require('node:assert/strict');
const metrics = require('../js/environment-metrics.js');

test('Magnus actual water vapor pressure agrees with saturation reference values within 0.5%', () => {
    // Saturation pressures over liquid water, kPa (not ice at subzero temperatures).
    for (const [temp, reference] of [[-20, 0.1255], [0, 0.6112], [20, 2.3388], [25, 3.1698], [50, 12.352]]) {
        const saturation = metrics.vaporPressure(temp, 100);
        assert.ok(Math.abs(saturation / reference - 1) < 0.005, `Temperature ${temp}`);
        assert.equal(metrics.vaporPressure(temp, 50), saturation / 2);
        assert.equal(metrics.vaporPressure(temp, 0), 0);
    }
    assert.ok(Math.abs(metrics.vaporPressure(25, 50) - 1.5809) < 0.0001);
});

test('rejects invalid inputs rather than clipping humidity or silently producing NaN', () => {
    for (const [temp, rh] of [[NaN, 50], [-41, 50], [86, 50], [25, -1], [25, 101], [25, Infinity]]) {
        assert.throws(() => metrics.vaporPressure(temp, rh));
    }
});

test('combined protocol requires both environment and compensated VOC data', () => {
    const packet = { type: 'env_voc', ts: 1000, seq: 0,
        data: { temp: 25, humidity: 50, pressure: 101.325, sraw: 25000, warmup: 60 } };
    assert.equal(metrics.validateCombined(packet), packet);
    assert.throws(() => metrics.validateCombined({ ...packet, type: 'env' }), /통합 펌웨어/);
    for (const [key, value] of [['pressure', 101325], ['sraw', undefined], ['warmup', 61], ['temp', NaN]]) {
        assert.throws(() => metrics.validateCombined({ ...packet, data: { ...packet.data, [key]: value } }));
    }
});
