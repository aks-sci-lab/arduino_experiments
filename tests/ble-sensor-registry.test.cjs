// 공용 무선 센서 도구 등록·실험 체크 필터·LabStore 연동 단위 시험
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/ble-decode.js');
const REG = require('../js/ble-sensor-registry.js');
const { loadLabStore } = require('./fake-lab-store.cjs');

function sampleDecoder(name, experiments) {
    return {
        schema: B.SCHEMA,
        version: 1,
        name,
        device: { namePrefix: 'TH-' },
        characteristics: [{
            service: '181a',
            characteristic: '2a6e',
            mode: 'notify',
            fields: [{ name: '온도', offset: 0, format: 'int16le', scale: 0.01, add: 0, unit: '°C' }]
        }],
        experiments
    };
}

test('BleDecode.validateDecoder: experiments 체크 목록 검증·정규화', () => {
    const ok = B.validateDecoder(sampleDecoder('무선 온도계 A', ['thermal', 'TEMPDASH', 'thermal', 'bad space!']));
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.decoder.experiments, ['thermal', 'tempdash']);
    assert.ok(B.SENSOR_EXPERIMENTS.some(x => x.id === 'thermal'));
});

test('BleSensorRegistry + LabStore: 공용 등록·로컬 병합·체크된 실험 필터 + 라즈베리파이 피코 포함', async () => {
    const app = loadLabStore();
    const fakeStore = {
        call: (url, body) => app.post(body, { uid: 'anon-1', anonymous: true, google: false })
    };
    const decThermal = B.validateDecoder(sampleDecoder('학교 온도센서 T1', ['thermal', 'tempdash'])).decoder;
    const decOther = B.validateDecoder(sampleDecoder('대시보드 전용 센서', ['tempdash'])).decoder;

    // 비교사(학생) 계정은 공용 등록 차단
    const denied = await app.post({
        action: 'bleSensorSave', id: REG.slugify(decThermal.name),
        name: decThermal.name, json: JSON.stringify(decThermal), experiments: decThermal.experiments
    }, { uid: 'stu-1', google: false, anonymous: true });
    assert.equal(denied.ok, false);

    // 교사 계정으로 2종 공용 등록
    for (const d of [decThermal, decOther]) {
        const sv = await app.post({
            action: 'bleSensorSave', id: REG.slugify(d.name),
            name: d.name, json: JSON.stringify(d), experiments: d.experiments
        }, app.TEACHER);
        assert.equal(sv.ok, true);
    }

    // 학생 브라우저(빈 localStorage)에서 열평형('thermal') 목록 요청 → T1 + 피코만 (대시보드 전용 제외)
    const emptyLs = { getItem: () => null };
    const thermalOpts = await REG.loadOptionsFor('thermal', { storage: emptyLs, labStore: fakeStore, includePico: true });
    assert.deepEqual(thermalOpts.options.map(o => o.name), [
        '학교 온도센서 T1',
        '라즈베리파이 피코 환경 센서 (PicoEnv)'
    ]);
    assert.equal(thermalOpts.options[0].source, 'cloud');

    // 로컬 브라우저에만 저장된 열평형 센서도 함께 표시
    const localOnly = B.validateDecoder(sampleDecoder('로컬 온도센서 L1', ['thermal'])).decoder;
    const localLs = { getItem: () => JSON.stringify([localOnly]) };
    const mergedOpts = await REG.loadOptionsFor('thermal', { storage: localLs, labStore: fakeStore, includePico: true });
    assert.deepEqual(mergedOpts.options.map(o => o.name), [
        '학교 온도센서 T1',
        '로컬 온도센서 L1',
        '라즈베리파이 피코 환경 센서 (PicoEnv)'
    ]);

    // 공용 삭제 후 목록에서 제거
    const del = await app.post({ action: 'bleSensorDelete', id: REG.slugify(decThermal.name) }, app.TEACHER);
    assert.equal(del.ok, true);
    const afterDel = await REG.loadOptionsFor('thermal', { storage: emptyLs, labStore: fakeStore, includePico: true });
    assert.deepEqual(afterDel.options.map(o => o.name), ['라즈베리파이 피코 환경 센서 (PicoEnv)']);
});
