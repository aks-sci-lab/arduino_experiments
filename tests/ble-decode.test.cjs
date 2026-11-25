// 시판 블루투스 센서 해석 도구 계산 시험 (js/ble-decode.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/ble-decode.js');

// 가짜 센서 패킷: [A5, 순번, 온도 int16LE×0.01, 습도 uint8, 0, 상태 비트, 합계]
function packet(seq, temp, hum, status) {
    const b = new Uint8Array(8);
    const dv = new DataView(b.buffer);
    b[0] = 0xA5; b[1] = seq & 0xff;
    dv.setInt16(2, Math.round(temp * 100), true);
    b[4] = hum; b[5] = 0; b[6] = status || 0;
    b[7] = b.slice(0, 7).reduce((s, x) => s + x, 0) & 0xff;
    return b;
}

test('형식별로 바이트를 읽는다', () => {
    const b = Uint8Array.from([0xFE, 0xFF, 0x01, 0x02, 0x03, 0x00, 0x00, 0xC0, 0x3F]);
    assert.equal(B.readRaw(b, 0, 'int8'), -2);
    assert.equal(B.readRaw(b, 0, 'uint8'), 254);
    assert.equal(B.readRaw(b, 0, 'int16le'), -2);
    assert.equal(B.readRaw(b, 0, 'uint16le'), 65534);
    assert.equal(B.readRaw(b, 2, 'int16be'), 0x0102);
    assert.equal(B.readRaw(b, 2, 'uint24le'), 0x030201);
    assert.equal(B.readRaw(b, 2, 'int24be'), 0x010203);
    assert.equal(B.readRaw(Uint8Array.from([0xFF, 0xFF, 0xFF]), 0, 'int24le'), -1);
    assert.equal(B.readRaw(Uint8Array.from([0x00, 0x00, 0x80]), 0, 'int24le'), -0x800000);
    assert.equal(B.readRaw(b, 2, 'uint32le'), 0x00030201);
    assert.equal(B.readRaw(b, 5, 'float32le'), 1.5);
    assert.equal(B.readRaw(Uint8Array.from([0x3F, 0xC0, 0, 0]), 0, 'float32be'), 1.5);
    assert.equal(B.readRaw(b, 8, 'int16le'), null, '모자라면 null');
    assert.equal(B.readRaw(b, -1, 'uint8'), null);
    assert.equal(B.readRaw(b, 0, '없는형식'), null);
});

test('필드: 배율·더할 값·비트 마스크', () => {
    const p = packet(1, 23.45, 40, 0b10110000);
    assert.equal(Number(B.readField(p, { offset: 2, format: 'int16le', scale: 0.01 }).toFixed(2)), 23.45);
    assert.equal(B.readField(p, { offset: 4, format: 'uint8', scale: 1, add: -40 }), 0);
    assert.equal(B.readField(p, { offset: 6, format: 'uint8', mask: '0xF0' }), 0b1011);
    assert.equal(B.readField(p, { offset: 6, format: 'uint8', mask: '0b00100000' }), 1);
    assert.equal(B.readField(p, { offset: 6, format: 'uint8', mask: '16' }), 1);
    assert.equal(Number(B.readField(packet(1, -5.5, 0), { offset: 2, format: 'int16le', scale: 0.01 }).toFixed(2)), -5.5);
    assert.equal(B.readField(p, { offset: 9, format: 'uint8' }), null);
    assert.equal(B.parseMask('zz'), null);
    const d = B.decodePacket(p, [{ name: '온도', offset: 2, format: 'int16le', scale: 0.01 }, { offset: 4, format: 'uint8' }]);
    assert.deepEqual(Object.keys(d), ['온도', '값2']);
});

test('16진수·UUID', () => {
    assert.equal(B.toHex([0, 10, 255]), '00 0A FF');
    assert.deepEqual(Array.from(B.parseHex('01 a0 ff')), [1, 0xa0, 0xff]);
    assert.deepEqual(Array.from(B.parseHex('0x01,0xA0')), [1, 0xa0]);
    assert.throws(() => B.parseHex('abc'), /홀수/);
    assert.throws(() => B.parseHex('zz'), /0~9/);
    assert.throws(() => B.parseHex(''), /넣어/);
    assert.equal(B.normUuid('180F'), '0000180f-0000-1000-8000-00805f9b34fb');
    assert.equal(B.normUuid('0x2A19'), '00002a19-0000-1000-8000-00805f9b34fb');
    assert.equal(B.normUuid('6E400001-B5A3-F393-E0A9-E50E24DCCA9E'), '6e400001-b5a3-f393-e0a9-e50e24dcca9e');
    assert.equal(B.normUuid('6e400001b5a3f393e0a9e50e24dcca9e'), '6e400001-b5a3-f393-e0a9-e50e24dcca9e');
    assert.equal(B.normUuid('battery'), null);
    assert.equal(B.shortUuid('0000180f-0000-1000-8000-00805f9b34fb'), '0x180F');
    assert.equal(B.knownName('2a19'), '배터리 잔량');
    assert.equal(B.knownName('49535343-1e4d-4bd9-ba61-23c647249616'), 'ISSC UART 받기(알림·TX)');
    assert.equal(B.knownName('4a5c0000-0000-0000-0000-5c1e741f1c00'), 'PASCO 장치 제어');
    assert.equal(B.knownName('4a5c0001-0000-0000-0000-5c1e741f1c00'), 'PASCO 센서 채널 1');
    assert.equal(B.knownName('4a5c0001-0002-0000-0000-5c1e741f1c00'), 'PASCO 채널 1 명령 보내기(쓰기)');
    assert.equal(B.knownName('4a5c0001-0003-0000-0000-5c1e741f1c00'), 'PASCO 채널 1 데이터·응답(알림)');
    assert.equal(B.knownName('4a5c0000-0005-0000-0000-5c1e741f1c00'), 'PASCO 장치 확인(ACK)');
    assert.equal(B.knownName('12345678-1234-1234-1234-123456789abc'), '');
    assert.ok(B.STANDARD_SERVICES.some(s => s.uuid === '4a5c0000-0000-0000-0000-5c1e741f1c00' && s.on));
    assert.equal(B.knownVendor('Temperature 123-456', ['4a5c0000-0000-0000-0000-5c1e741f1c00']).id, 'pasco');
    assert.equal(B.knownVendor('GDX-TMP 0A1234', []).id, 'vernier');
    assert.equal(B.knownVendor('SC:TEMP-304', ['49535343-fe7d-4ae5-8fa9-9fafd205e455']), null);
    // 여러 UUID · 크롬 Services: 줄 통째 붙여넣기
    const multi = B.parseUuidList('Services: 00001800-0000-1000-8000-00805f9b34fb, 00001801-0000-1000-8000-00805f9b34fb, 0000180a-0000-1000-8000-00805f9b34fb, 49535343-fe7d-4ae5-8fa9-9fafd205e455');
    assert.deepEqual(multi.uuids, ['0000180a-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455']);
    assert.equal(multi.skippedSystem.length, 2);
    assert.deepEqual(multi.bad, []);
    const mixed = B.parseUuidList('fff0\nzz-bad');
    assert.deepEqual(mixed.uuids, ['0000fff0-0000-1000-8000-00805f9b34fb']);
    assert.deepEqual(mixed.bad, ['zz-bad']);
});

test('바뀌는 바이트를 길이별로 찾는다', () => {
    const groups = B.changingBytes([packet(1, 20, 40), packet(2, 21.5, 40), packet(3, 22, 40), Uint8Array.from([1, 2])]);
    assert.equal(groups[0].length, 8);
    assert.equal(groups[0].count, 3);
    assert.deepEqual(groups[0].changing, [false, true, true, true, false, false, false, true]);
    assert.equal(groups[1].length, 2);
    assert.deepEqual(groups[1].changing, [false, false]);
});

test('참값 도우미: 온도 자리·int16LE·0.01 이 1위', () => {
    const truths = [23.5, 19.2, 26.8, 21.1, 24.9];
    const samples = truths.map((t, i) => ({ bytes: packet(10 + i * 7, t, 45), truth: t }));
    const res = B.findCandidates(samples);
    assert.ok(res.ok);
    const top = res.candidates[0];
    assert.equal(top.offset, 2);
    assert.equal(top.format, 'int16le');
    assert.ok(Math.abs(top.scale - 0.01) < 1e-9);
    assert.ok(Math.abs(top.add) < 1e-6);
    assert.ok(top.r > 0.999999);
    assert.equal(top.niceScale, 0.01);
    const f = B.candidateToField(top, '온도', '°C');
    assert.deepEqual(f, { name: '온도', offset: 2, format: 'int16le', scale: 0.01, add: 0, unit: '°C', mask: '' });
});

test('참값 도우미: 잡음이 조금 있어도, 더할 값이 있어도 찾는다', () => {
    // 습도 = uint8 × 0.5 − 10 , 참값 기계도 ±0.2 정도 차이
    const hums = [30, 55, 42, 70, 61, 35];
    const noise = [0.1, -0.2, 0.15, -0.1, 0.2, -0.05];
    const samples = hums.map((h, i) => {
        const p = packet(i * 13, 20 + (i % 2), Math.round((h + 10) / 0.5));
        return { bytes: p, truth: h + noise[i] };
    });
    const top = B.findCandidates(samples).candidates[0];
    assert.equal(top.offset, 4);
    assert.equal(top.format, 'uint8');
    assert.equal(top.niceScale, 0.5);
    assert.ok(Math.abs(top.add + 10) < 0.5);
});

test('참값 도우미: 모자란 참값·같은 값은 안내', () => {
    assert.equal(B.findCandidates([{ bytes: packet(1, 2, 3), truth: 1 }]).ok, false);
    const same = [1, 2, 3].map(i => ({ bytes: packet(i, 20 + i, 40), truth: 5 }));
    assert.match(B.findCandidates(same).reason, /모두 같아요/);
});

test('보기 좋은 수', () => {
    assert.equal(B.niceNumber(0.010001), 0.01);
    assert.equal(B.niceNumber(0.0998), 0.1);
    assert.equal(B.niceNumber(-0.5003), -0.5);
    assert.equal(B.niceNumber(0.0037), null);
});

test('해석 규칙 파일 검사', () => {
    const ok = B.validateDecoder({
        schema: 'sensor-lab-ble-decoder', name: '무선 온도 센서', device: { namePrefix: 'TH-' },
        characteristics: [{ service: '181a', characteristic: '2A6E', mode: 'notify', fields: [{ name: '온도', offset: 0, format: 'int16le', scale: 0.01, unit: '°C' }] }]
    });
    assert.ok(ok.ok, JSON.stringify(ok.errors));
    assert.equal(ok.decoder.characteristics[0].characteristic, '00002a6e-0000-1000-8000-00805f9b34fb');
    assert.equal(ok.decoder.characteristics[0].fields[0].add, 0);
    assert.equal(B.validateDecoder({ schema: 'x', characteristics: [] }).ok, false);
    const bad = B.validateDecoder({ schema: 'sensor-lab-ble-decoder', characteristics: [{ characteristic: '2a6e', fields: [{ offset: 0, format: 'int99' }] }] });
    assert.equal(bad.ok, false);

    // HEX / ASCII 명령 인코딩 및 initCommands 검증
    assert.deepEqual(Array.from(B.encodeCommand('01 A0', 'hex')), [1, 0xa0]);
    assert.deepEqual(Array.from(B.encodeCommand('START\\r\\n', 'ascii')), [83, 84, 65, 82, 84, 13, 10]);
    assert.throws(() => B.encodeCommand('', 'ascii'), /글자/);
    const withCmd = B.validateDecoder({
        schema: 'sensor-lab-ble-decoder', name: '명령 필요 센서',
        characteristics: [{ service: 'fff0', characteristic: 'fff1', mode: 'notify', fields: [{ name: '온도', offset: 2, format: 'int16le', scale: 0.01, unit: '°C' }] }],
        initCommands: [
            { service: 'fff0', characteristic: 'fff2', mode: 'ascii', payload: 'START\\r\\n', delayMs: 200 },
            { service: 'fff0', characteristic: 'fff2', mode: 'hex', payload: '01 00', delayMs: 50 }
        ]
    });
    assert.ok(withCmd.ok, JSON.stringify(withCmd.errors));
    assert.equal(withCmd.decoder.initCommands.length, 2);
    assert.equal(withCmd.decoder.initCommands[0].characteristic, '0000fff2-0000-1000-8000-00805f9b34fb');
    assert.equal(withCmd.decoder.initCommands[0].mode, 'ascii');
    const badCmd = B.validateDecoder({
        schema: 'sensor-lab-ble-decoder', characteristics: [],
        initCommands: [{ characteristic: 'fff2', mode: 'hex', payload: 'ZZ' }]
    });
    assert.equal(badCmd.ok, false);
});

test('기록 CSV·JSON', () => {
    const char = B.normUuid('2a6e');
    const recs = [{ t: 0.1, at: '2026-11-17T01:00:00.000Z', char, bytes: packet(1, 23.5, 40) }, { t: 0.2, at: '', char, bytes: packet(2, 24, 40) }];
    const csv = B.recordsToCsv(recs, { [char]: [{ name: '온도', offset: 2, format: 'int16le', scale: 0.01 }] });
    const lines = csv.trim().split('\n');
    assert.equal(lines[0], 't_s,time,characteristic,length,hex,온도');
    assert.match(lines[1], /,8,A5 01 2E 09 28 00 00 [0-9A-F]{2},23\.5$/);
    const back = B.recordsFromJson(B.recordsToJson(recs, { device: 'x' }));
    assert.equal(back.records.length, 2);
    assert.deepEqual(Array.from(back.records[1].bytes), Array.from(recs[1].bytes));
    assert.throws(() => B.recordsFromJson('{}'), /기록 파일/);
    assert.equal(B.csvCell('=1+1'), "'=1+1");
    assert.equal(B.csvCell('-3.5'), '-3.5');
});

test('포장 풀기·자동 감지·스트림 프레이머 (SC:TEMP-304 실측 패킷 + ASCII HEX + 텍스트 숫자)', () => {
    const enc = s => Uint8Array.from(s, c => c.charCodeAt(0));
    const scPackets = [
        enc('{{dAkAVABQBUIAAABo}}'), // 33.328125 °C
        enc('{{dAkAVAB4BEIAAACP}}'), // 33.1171875 °C
        enc('{{dAkAVADgAEIAAADz}}')  // 32.21875 °C
    ];
    const det = B.detectFraming(scPackets);
    assert.ok(det);
    assert.equal(det.type, 'base64');
    assert.equal(det.prefix, '{{');
    assert.equal(det.suffix, '}}');
    assert.equal(det.checksum, 'sum8');
    assert.equal(det.decodedLength, 12);

    const pre = { type: det.type, prefix: det.prefix, suffix: det.suffix, checksum: det.checksum };
    const unpackedSc = scPackets.map(p => B.preprocessPacket(p, pre));
    const temps = unpackedSc.map(b => B.readField(b, { offset: 4, format: 'float32le' }));
    assert.equal(Number(temps[0].toFixed(2)), 33.33);
    assert.equal(Number(temps[1].toFixed(2)), 33.12);
    assert.equal(Number(temps[2].toFixed(2)), 32.22);

    // 참값 맞추기: IEEE-754 float32le @ offset 4 (배율 1, 오프셋 0) 가 1위여야 함
    const scFit = B.findCandidates([
        { bytes: unpackedSc[0], truth: 33.33 },
        { bytes: unpackedSc[1], truth: 33.12 },
        { bytes: unpackedSc[2], truth: 32.22 }
    ]);
    assert.ok(scFit.ok);
    assert.equal(scFit.candidates[0].offset, 4);
    assert.equal(scFit.candidates[0].format, 'float32le');
    assert.equal(scFit.candidates[0].niceScale, 1);

    // 체크섬 깨진 패킷 거부
    assert.equal(B.preprocessPacket(enc('{{dAkAVADgAEIAAAD0}}'), pre), null);

    // 스트림 프레이머: 조각난 패킷과 연속 2패킷 모두 복원
    const framer = B.createFramer(pre);
    assert.deepEqual(framer.push(enc('{{dAkAVADg')), []);
    const got1 = framer.push(enc('AEIAAADz}}{{dAkAVABQBUIAAABo}}'));
    assert.equal(got1.length, 2);
    assert.equal(Number(B.readField(got1[0], { offset: 4, format: 'float32le' }).toFixed(2)), 32.22);
    assert.equal(Number(B.readField(got1[1], { offset: 4, format: 'float32le' }).toFixed(2)), 33.33);

    // ASCII 16진수 자동 감지·풀기
    const hexPkts = [enc('A5 01 2E 09 28 00 00 00\r\n'), enc('A5 02 38 09 28 00 00 00\r\n')];
    const detHex = B.detectFraming(hexPkts);
    assert.equal(detHex.type, 'ascii-hex');
    const unHex = B.preprocessPacket(hexPkts[0], detHex);
    assert.equal(unHex[0], 0xA5);
    assert.equal(B.readField(unHex, { offset: 2, format: 'int16le', scale: 0.01 }), 23.5);

    // 텍스트·CSV 숫자 자동 감지·풀기 (float32le 배열)
    const txtPkts = [enc('T:23.45, H:48.2\r\n'), enc('T:24.10, H:47.5\r\n'), enc('T:25.00, H:46.0\r\n')];
    const detTxt = B.detectFraming(txtPkts);
    assert.equal(detTxt.type, 'ascii-number');
    assert.equal(detTxt.count, 2);
    const uTxt = B.preprocessPacket(txtPkts[0], detTxt);
    assert.equal(Number(B.readField(uTxt, { offset: 0, format: 'float32le' }).toFixed(2)), 23.45);
    assert.equal(Number(B.readField(uTxt, { offset: 4, format: 'float32le' }).toFixed(1)), 48.2);

    // 내장 규칙(BUILTIN_PROFILES) 및 preprocess 규칙 검사 + CSV 내보내기
    assert.ok(B.BUILTIN_PROFILES.length >= 1);
    const scRule = B.BUILTIN_PROFILES[0];
    const v = B.validateDecoder(scRule);
    assert.ok(v.ok, JSON.stringify(v.errors));
    assert.equal(v.decoder.characteristics[0].preprocess.type, 'base64');
    const dec = B.decodeCharPacket(scPackets[2], v.decoder.characteristics[0]);
    assert.equal(Number(dec['온도'].toFixed(2)), 32.22);

    const charUuid = scRule.characteristics[0].characteristic;
    const csv = B.recordsToCsv([{ t: 1.0, at: '', char: charUuid, bytes: scPackets[2] }], { [charUuid]: scRule.characteristics[0].fields }, { [charUuid]: pre });
    assert.match(csv, /,32\.21875\n$/);

    const badPre = B.validateDecoder({
        schema: B.SCHEMA,
        characteristics: [{ characteristic: '2a6e', preprocess: { type: 'bogus' }, fields: [] }]
    });
    assert.equal(badPre.ok, false);
});

test('하드웨어 주기 변경 명령(rateCommand) 생성 및 검사', () => {
    const asciiRc = { service: 'fff0', characteristic: 'fff2', mode: 'ascii', template: 'SET_RATE:{{ms}}:{{hz}}\\r\\n' };
    const built = B.buildRateCommand(asciiRc, 200);
    assert.equal(built.payload, 'SET_RATE:200:5\\r\\n');
    assert.equal(new TextDecoder().decode(built.bytes), 'SET_RATE:200:5\r\n');

    const mapRc = { characteristic: 'fff2', mode: 'hex', map: { '100': '01 0A', '1000': '01 01' } };
    const b100 = B.buildRateCommand(mapRc, 100);
    assert.deepEqual(Array.from(b100.bytes), [1, 10]);
    assert.equal(B.buildRateCommand(mapRc, 500), null);

    const ok = B.validateDecoder({
        schema: B.SCHEMA,
        name: '주기 제어 센서',
        characteristics: [{ service: 'fff0', characteristic: 'fff1', mode: 'notify', fields: [{ name: '온도', offset: 0, format: 'int16le', scale: 0.01, unit: '°C' }] }],
        rateCommand: asciiRc
    });
    assert.ok(ok.ok, JSON.stringify(ok.errors));
    assert.equal(ok.decoder.rateCommand.characteristic, '0000fff2-0000-1000-8000-00805f9b34fb');
    assert.equal(ok.decoder.rateCommand.template, 'SET_RATE:{{ms}}:{{hz}}\\r\\n');

    const bad = B.validateDecoder({
        schema: B.SCHEMA,
        characteristics: [],
        rateCommand: { characteristic: 'fff2', mode: 'hex', template: 'ZZ' }
    });
    assert.equal(bad.ok, false);
});


