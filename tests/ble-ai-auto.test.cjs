// 블루투스 센서 자동 역추적 · AI 보조 해석 시험 (js/ble-ai-auto.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/ble-decode.js');
const A = require('../js/ble-ai-auto.js');

const enc = s => Uint8Array.from(s, c => c.charCodeAt(0));
const SC_PACKETS = [
    enc('{{dAkAVABQBUIAAABo}}'), // 33.328125 °C
    enc('{{dAkAVAB4BEIAAACP}}'), // 33.1171875 °C
    enc('{{dAkAVADgAEIAAADz}}')  // 32.21875 °C
];

test('로컬 자동 분석: SC:TEMP-304 실측 패킷 + 대략값 힌트만으로 포장 풀기·offset 4 float32le 자동 탐지', () => {
    const res = A.guessFieldsLocally(SC_PACKETS, { approxValue: 32.5, unit: '°C', name: '온도', sensorName: 'SC:TEMP-304' });
    assert.ok(res.ok, res.error);
    assert.equal(res.proposal.preprocess.type, 'base64');
    assert.equal(res.proposal.preprocess.prefix, '{{');
    assert.equal(res.proposal.preprocess.suffix, '}}');
    assert.equal(res.proposal.preprocess.checksum, 'sum8');
    assert.equal(res.proposal.fields.length, 1);
    assert.equal(res.proposal.fields[0].offset, 4);
    assert.equal(res.proposal.fields[0].format, 'float32le');
    assert.equal(res.proposal.fields[0].scale, 1);

    const v = A.verifyProposal(res.proposal, SC_PACKETS, {
        serviceUuid: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        charUuid: '49535343-1e4d-4bd9-ba61-23c647249616',
        deviceMeta: { deviceName: 'SC:TEMP-304' }
    });
    assert.equal(v.valid, true);
    assert.equal(v.okFrames, 3);
    assert.equal(v.totalFrames, 3);
    assert.equal(Number(v.fieldStats[0].min.toFixed(2)), 32.22);
    assert.equal(Number(v.fieldStats[0].max.toFixed(2)), 33.33);
    assert.equal(v.decoder.schema, B.SCHEMA);
});

test('로컬 자동 분석: 텍스트·CSV 숫자 센서는 힌트 없이도 다채널 자동 해석', () => {
    const pkts = [enc('T:23.45, H:48.2\r\n'), enc('T:24.10, H:47.5\r\n'), enc('T:25.00, H:46.0\r\n')];
    const res = A.guessFieldsLocally(pkts, { name: '값', unit: '°C' });
    assert.ok(res.ok);
    assert.equal(res.proposal.preprocess.type, 'ascii-number');
    assert.equal(res.proposal.fields.length, 2);
    const v = A.verifyProposal(res.proposal, pkts, { charUuid: 'fff1' });
    assert.equal(v.valid, true);
    assert.equal(Number(v.fieldStats[0].last.toFixed(2)), 25.0);
    assert.equal(Number(v.fieldStats[1].last.toFixed(1)), 46.0);
});

test('로컬 자동 분석: 참값 3개 이상이면 최소제곱으로 int16le × 0.01 자동 채택', () => {
    function mk(seq, temp) {
        const b = new Uint8Array(6), dv = new DataView(b.buffer);
        b[0] = 0xA5; b[1] = seq; dv.setInt16(2, Math.round(temp * 100), true);
        return b;
    }
    const truths = [
        { bytes: mk(1, 20.5), truth: 20.5 },
        { bytes: mk(2, 25.2), truth: 25.2 },
        { bytes: mk(3, 30.8), truth: 30.8 }
    ];
    const res = A.guessFieldsLocally(truths.map(x => x.bytes), { truths, name: '온도', unit: '°C' });
    assert.ok(res.ok);
    assert.equal(res.proposal.fields[0].offset, 2);
    assert.equal(res.proposal.fields[0].format, 'int16le');
    assert.equal(res.proposal.fields[0].scale, 0.01);
});

test('AI 프롬프트 생성 · JSON 응답 파싱 · 로컬 전수 검증 및 재시도 피드백', () => {
    const prompt = A.buildAiPrompt({
        deviceName: 'SC:TEMP-304',
        serviceUuid: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        charUuid: '49535343-1e4d-4bd9-ba61-23c647249616',
        services: [{ uuid: '49535343-fe7d-4ae5-8fa9-9fafd205e455', chars: [{ uuid: '49535343-1e4d-4bd9-ba61-23c647249616', props: ['notify'] }] }],
        rawPackets: SC_PACKETS.map((bytes, i) => ({ t: i + 1, bytes })),
        hint: '사이언스큐브 온도 센서, 손으로 잡았다 놓음',
        approxValue: 32.5,
        unit: '°C'
    });
    assert.match(prompt.system, /float32le/);
    assert.match(prompt.user, /SC:TEMP-304/);
    assert.match(prompt.user, /\{\{dAkAVADgAEIAAADz\}\}/);
    assert.match(prompt.user, /로컬 포장 자동 감지/);

    // 코드블록 안 JSON 파싱 + 검증 통과
    const aiText = '분석했습니다.\n```json\n' + JSON.stringify({
        summary: '{{…}} 안의 Base64 12바이트 패킷이며 4~7번 바이트가 float32le 온도(°C)입니다.',
        confidence: 'high',
        sensorName: 'ScienceCube 온도 센서',
        preprocess: { type: 'base64', prefix: '{{', suffix: '}}', checksum: 'sum8' },
        fields: [{ name: '온도', offset: 4, format: 'float32le', scale: 1, add: 0, unit: '°C', mask: '' }],
        initCommands: [],
        nextStep: '찬물에서 값이 내려가는지 확인하세요.'
    }) + '\n```';
    const parsed = A.parseAiProposal(aiText);
    assert.ok(parsed.ok);
    const v = A.verifyProposal(parsed.proposal, SC_PACKETS, {
        serviceUuid: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        charUuid: '49535343-1e4d-4bd9-ba61-23c647249616',
        truths: [
            { bytes: SC_PACKETS[0], truth: 33.33 },
            { bytes: SC_PACKETS[2], truth: 32.22 }
        ]
    });
    assert.equal(v.valid, true);
    assert.equal(v.okFrames, 3);
    assert.ok(v.truthRmse < 0.01);

    // 잘못된 형식 제안 → 검증 실패 및 피드백 생성
    const badParsed = A.parseAiProposal('{"summary":"오류","fields":[{"name":"x","offset":0,"format":"bad_fmt"}]}');
    assert.ok(badParsed.ok);
    const badV = A.verifyProposal(badParsed.proposal, SC_PACKETS, { charUuid: '49535343-1e4d-4bd9-ba61-23c647249616' });
    assert.equal(badV.valid, false);
    assert.match(badV.feedbackForRetry, /규칙 형식 오류/);

    // JSON 이 전혀 없는 텍스트
    assert.equal(A.parseAiProposal('그냥 일반 글입니다.').ok, false);
});
