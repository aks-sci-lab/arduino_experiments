// 공용 무선 센서 도구 목록 & 연결 엔진 (브라우저·Node 공용)
// - 블루투스 센서 해석 도구(projects/ble-explorer.html)에서 완료·등록한 센서 도구(이 브라우저 localStorage + 교사 공용 Firestore bleSensors)를 불러오고
//   실험별로 체크된 센서만 목록에 띄운다.
// - 라즈베리파이 피코 환경 센서(PicoEnv-XXXX), Vernier Go Direct, 표준 BLE 온도 센서(0x181A·0x1809)도 함께 연결할 수 있다.
// - 센서 A·B 두 대를 동시에 독립 연결할 수 있도록 연결마다 별도 정리(disconnect) 핸들을 돌려준다.
(function (root, factory) {
    var api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.BleSensorRegistry = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';

    var LOCAL_KEY = 'ble-explorer:saved:v1';
    var PICO_SERVICE = '19b10000-e8f2-537e-4f6c-d104768a1214';
    var PICO_TX = '19b10001-e8f2-537e-4f6c-d104768a1214';
    var PICO_CMD = '19b10002-e8f2-537e-4f6c-d104768a1214';
    var VERNIER_SERVICE = 'd91714ef-28b9-4f91-ba16-f0d9a604f112';
    var STD_OPTIONAL = [
        VERNIER_SERVICE,
        0x181a, 0x1809, 0x180f, 0x180a,
        '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        0xffe0, 0xfff0, 0xff00,
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        '4a5c0000-0000-0000-0000-5c1e741f1c00',
        '4a5c0001-0000-0000-0000-5c1e741f1c00',
        '4a5c0002-0000-0000-0000-5c1e741f1c00'
    ];

    function getDecode() {
        return (root && root.BleDecode) || (typeof require === 'function' ? require('./ble-decode.js') : null);
    }

    function slugify(name) {
        var s = String(name || '').trim().toLowerCase();
        var ascii = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
        // 한글 등 비ASCII 이름이 겹치지 않도록 짧은 해시를 붙임
        var h = 2166136261;
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        var hex = (h >>> 0).toString(36);
        return (ascii ? ascii + '-' : 's-') + hex;
    }

    function readLocal(storage) {
        var B = getDecode();
        var ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!B || !ls) return [];
        var raw = [];
        try {
            var parsed = JSON.parse(ls.getItem(LOCAL_KEY) || '[]');
            if (Array.isArray(parsed)) raw = parsed;
        } catch (e) { raw = []; }
        var out = [];
        raw.forEach(function (item) {
            var res = B.validateDecoder(item);
            if (res.ok && res.decoder.characteristics.length && res.decoder.characteristics[0].fields.length) {
                out.push({ id: slugify(res.decoder.name), source: 'local', decoder: res.decoder });
            }
        });
        return out;
    }

    async function readCloud(labStore) {
        var B = getDecode();
        var store = labStore || (root && root.LabStore);
        if (!B || !store || !store.call) return [];
        try {
            var res = await store.call('', { action: 'bleSensorList' }, 8000);
            if (!res || !res.ok || !Array.isArray(res.sensors)) return [];
            var out = [];
            res.sensors.forEach(function (row) {
                try {
                    var parsed = typeof row.json === 'string' ? JSON.parse(row.json) : row.json;
                    if (Array.isArray(row.experiments)) parsed.experiments = row.experiments;
                    var v = B.validateDecoder(parsed);
                    if (v.ok && v.decoder.characteristics.length && v.decoder.characteristics[0].fields.length) {
                        out.push({ id: row.id || slugify(v.decoder.name), source: 'cloud', decoder: v.decoder, updatedAt: row.updatedAt || '' });
                    }
                } catch (e) { /* 손상된 규칙은 건너뜀 */ }
            });
            return out;
        } catch (e) {
            return [];
        }
    }

    // 로컬 + 클라우드 규칙을 이름 기준으로 합침 (클라우드 공용 우선, 로컬에만 있으면 로컬 유지; 같은 이름이면 experiments 합집합)
    function mergeProfiles(cloudList, localList) {
        var byName = new Map();
        (cloudList || []).forEach(function (entry) {
            if (!entry || !entry.decoder) return;
            byName.set(entry.decoder.name, Object.assign({}, entry));
        });
        (localList || []).forEach(function (entry) {
            if (!entry || !entry.decoder) return;
            var prev = byName.get(entry.decoder.name);
            if (!prev) {
                byName.set(entry.decoder.name, Object.assign({}, entry));
            } else if (!prev.decoder.experiments && entry.decoder.experiments) {
                prev.decoder = Object.assign({}, prev.decoder, { experiments: entry.decoder.experiments.slice() });
            }
        });
        return Array.from(byName.values());
    }

    // 특정 실험(expId)에서 호출할 수 있는 해석 완료 센서만 거름.
    // - experiments 배열이 있으면 expId 가 체크되어 있어야 표시
    // - 예전 규칙(experiments 필드가 없는 경우): legacyFallback=true 이면 표시 (온도 대시보드 하위 호환)
    function filterForExperiment(merged, expId, opts) {
        opts = opts || {};
        return (merged || []).filter(function (entry) {
            var exps = entry && entry.decoder && entry.decoder.experiments;
            if (!Array.isArray(exps)) return !!opts.legacyFallback;
            return exps.indexOf(expId) >= 0;
        });
    }

    var BUILTIN_PICO = {
        id: 'builtin:pico-env',
        kind: 'pico-env',
        name: '라즈베리파이 피코 환경 센서 (PicoEnv)',
        badge: '내장'
    };

    var BUILTIN_AUTO_STD = {
        id: 'builtin:auto-temp',
        kind: 'auto-temp',
        name: 'Vernier Go Direct · 표준 BLE 온도 (자동)',
        badge: '표준'
    };

    // 실험 화면의 드롭다운에 띄울 무선 센서 목록 구성
    // 순서: 1) 해석 도구에서 이 실험에 체크해 등록한 센서들 2) 라즈베리파이 피코 환경 센서 3) (선택) Vernier·표준 BLE 자동
    async function loadOptionsFor(expId, opts) {
        opts = opts || {};
        var local = readLocal(opts.storage);
        var cloud = opts.skipCloud ? [] : await readCloud(opts.labStore);
        var merged = mergeProfiles(cloud, local);
        var matched = filterForExperiment(merged, expId, { legacyFallback: !!opts.legacyFallback });
        var options = matched.map(function (m) {
            return {
                id: 'decoder:' + m.id,
                kind: 'decoder',
                name: m.decoder.name,
                source: m.source,
                badge: m.source === 'cloud' ? '공용 도구' : '이 브라우저',
                decoder: m.decoder
            };
        });
        if (opts.includePico !== false) options.push(Object.assign({}, BUILTIN_PICO));
        if (opts.includeAutoStd) options.push(Object.assign({}, BUILTIN_AUTO_STD));
        return { options: options, cloudCount: cloud.length, localCount: local.length, allMerged: merged };
    }

    // ---------- 실제 블루투스 연결 어댑터 (센서 1대당 독립 핸들 반환) ----------
    async function findCharacteristic(server, serviceUuid, charUuid) {
        if (serviceUuid) {
            try {
                var svc = await server.getPrimaryService(serviceUuid);
                return await svc.getCharacteristic(charUuid);
            } catch (e) { /* 아래에서 전체 탐색 */ }
        }
        var svcs = await server.getPrimaryServices();
        for (var i = 0; i < svcs.length; i++) {
            try { return await svcs[i].getCharacteristic(charUuid); } catch (e) { /* 다음 서비스 */ }
        }
        return null;
    }

    async function writeChunked(char, bytes) {
        var props = char.properties || {};
        for (var i = 0; i < bytes.length; i += 20) {
            var part = bytes.slice(i, i + 20);
            if (props.write && char.writeValueWithResponse) await char.writeValueWithResponse(part);
            else if (char.writeValueWithoutResponse) await char.writeValueWithoutResponse(part);
            else await char.writeValue(part);
        }
    }

    function decodeHealthThermometerC(dv) {
        if (!dv || dv.byteLength < 5) return NaN;
        var flags = dv.getUint8(0);
        var isF = (flags & 0x01) !== 0;
        var mantissa = dv.getUint8(1) | (dv.getUint8(2) << 8) | (dv.getUint8(3) << 16);
        if (mantissa & 0x800000) mantissa -= 0x1000000;
        var val = mantissa * Math.pow(10, dv.getInt8(4));
        return isF ? (val - 32) * 5 / 9 : val;
    }

    async function connectPicoEnv(cb) {
        var nav = root && root.navigator;
        if (!nav || !nav.bluetooth) throw new Error('이 브라우저는 Web Bluetooth 를 지원하지 않습니다. 크롬·엣지를 쓰세요.');
        if (!root.PicoBLE || !root.EnvironmentProtocol) throw new Error('Pico 센서 연결 도구(pico-ble.js)를 불러오지 못했습니다.');
        cb.onStatus && cb.onStatus('PicoEnv 센서를 고르세요…');
        var device = await nav.bluetooth.requestDevice({
            filters: [{ namePrefix: 'PicoEnv-' }],
            optionalServices: [PICO_SERVICE]
        });
        var tx = null, cmd = null, closed = false;
        var receiver = new root.EnvironmentProtocol.Receiver(
            function (packet) {
                var t = packet && packet.data && packet.data.temp;
                if (typeof t === 'number' && isFinite(t)) cb.onValue && cb.onValue(t, packet);
            },
            function (err) { cb.onStatus && cb.onStatus('⚠ ' + (err && err.message || err)); },
            root.EnvironmentProtocol.validateSample
        );
        var onNotif = function (ev) { receiver.push(ev.target.value); };
        var onDisc = function () {
            if (closed) return;
            closed = true;
            cb.onDisconnect && cb.onDisconnect('연결 끊김');
        };
        device.addEventListener('gattserverdisconnected', onDisc);
        try {
            await root.PicoBLE.discover(device, PICO_SERVICE, [PICO_TX, PICO_CMD], function (attempt) {
                cb.onStatus && cb.onStatus('재연결 시도 ' + attempt + '/2…');
            }, {
                isCancelled: function () { return closed; },
                cleanup: function () { if (tx) tx.removeEventListener('characteristicvaluechanged', onNotif); receiver.reset(); },
                prepare: async function (chars) {
                    tx = chars[0]; cmd = chars[1];
                    tx.addEventListener('characteristicvaluechanged', onNotif);
                    await tx.startNotifications();
                    var enc = new TextEncoder();
                    await cmd.writeValueWithResponse(enc.encode('SET_MODE:env'));
                    await cmd.writeValueWithResponse(enc.encode('SET_SENSOR_RATE:' + Math.max(500, Math.round(cb.intervalMs || 1000))));
                    await cmd.writeValueWithResponse(enc.encode('START'));
                }
            });
        } catch (err) {
            closed = true;
            device.removeEventListener('gattserverdisconnected', onDisc);
            try { if (device.gatt && device.gatt.connected) device.gatt.disconnect(); } catch (e) {}
            throw err;
        }
        return {
            deviceName: device.name || 'PicoEnv',
            channelLabel: 'Pico 환경 온도 (°C)',
            disconnect: function () {
                closed = true;
                try { if (cmd && device.gatt && device.gatt.connected) cmd.writeValueWithResponse(new TextEncoder().encode('STOP')).catch(function () {}); } catch (e) {}
                try { if (tx) tx.removeEventListener('characteristicvaluechanged', onNotif); } catch (e) {}
                try { device.removeEventListener('gattserverdisconnected', onDisc); } catch (e) {}
                try { if (device.gatt && device.gatt.connected) device.gatt.disconnect(); } catch (e) {}
            }
        };
    }

    async function connectDecodedProfile(profile, cb) {
        var nav = root && root.navigator;
        var B = getDecode();
        if (!nav || !nav.bluetooth) throw new Error('이 브라우저는 Web Bluetooth 를 지원하지 않습니다. 크롬·엣지를 쓰세요.');
        if (!B) throw new Error('BLE 해석 도구(ble-decode.js)를 불러오지 못했습니다.');
        var chRule = profile.characteristics && profile.characteristics[0];
        var field = chRule && chRule.fields && (
            chRule.fields.find(function (f) { return /온도|temp|°c/i.test((f.name || '') + ' ' + (f.unit || '')); }) || chRule.fields[0]
        );
        if (!chRule || !field) throw new Error('이 센서 도구에 읽을 필드가 없습니다.');

        var optSet = new Set(STD_OPTIONAL);
        (profile.characteristics || []).forEach(function (c) { if (c.service) optSet.add(c.service); });
        (profile.initCommands || []).forEach(function (c) { if (c.service) optSet.add(c.service); });
        if (profile.rateCommand && profile.rateCommand.service) optSet.add(profile.rateCommand.service);
        if (profile.pollCommand && profile.pollCommand.service) optSet.add(profile.pollCommand.service);

        cb.onStatus && cb.onStatus('"' + profile.name + '" 센서를 고르세요…');
        var device = await nav.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: Array.from(optSet)
        });
        var server = await device.gatt.connect();
        var dataChar = await findCharacteristic(server, chRule.service, chRule.characteristic);
        if (!dataChar) {
            try { device.gatt.disconnect(); } catch (e) {}
            throw new Error('선택한 기기에서 특성(' + B.shortUuid(chRule.characteristic) + ')을 찾지 못했습니다.');
        }

        var closed = false, pollTimer = null, cmdPollTimer = null;
        var framer = (B.createFramer && chRule.preprocess && chRule.preprocess.type && chRule.preprocess.type !== 'none')
            ? B.createFramer(chRule.preprocess) : null;
        var emitDecoded = function (frameBytes) {
            if (B.decodeCharPacket) {
                var dec = B.decodeCharPacket(frameBytes, chRule);
                if (dec) {
                    var v = dec[field.name];
                    if (typeof v === 'number' && isFinite(v)) { cb.onValue && cb.onValue(v); return; }
                }
                return;
            }
            var val = B.readField(frameBytes, field);
            if (typeof val === 'number' && isFinite(val)) cb.onValue && cb.onValue(val);
        };
        var handleDv = function (dv) {
            if (!dv) return;
            var bytes = new Uint8Array(dv.buffer, dv.byteOffset || 0, dv.byteLength);
            if (framer) {
                var frames = framer.push(bytes);
                for (var fi = 0; fi < frames.length; fi++) emitDecoded(frames[fi]);
            } else {
                emitDecoded(bytes);
            }
        };
        var onChar = function (ev) { handleDv(ev.target.value); };
        var onDisc = function () {
            if (closed) return;
            closed = true;
            clearInterval(pollTimer);
            clearInterval(cmdPollTimer);
            cb.onDisconnect && cb.onDisconnect('연결 끊김');
        };
        device.addEventListener('gattserverdisconnected', onDisc);

        try {
            var props = dataChar.properties || {};
            if (chRule.mode !== 'read' && (props.notify || props.indicate)) {
                dataChar.addEventListener('characteristicvaluechanged', onChar);
                await dataChar.startNotifications();
            } else if (props.read) {
                var readOnce = async function () { try { handleDv(await dataChar.readValue()); } catch (e) {} };
                readOnce();
                pollTimer = setInterval(readOnce, Math.max(300, cb.intervalMs || 1000));
            }
            if (Array.isArray(profile.initCommands) && profile.initCommands.length) {
                for (var i = 0; i < profile.initCommands.length; i++) {
                    var ic = profile.initCommands[i];
                    var wChar = await findCharacteristic(server, ic.service, ic.characteristic);
                    if (!wChar) throw new Error('시작 명령 특성(' + B.shortUuid(ic.characteristic) + ')을 찾지 못했습니다.');
                    await writeChunked(wChar, B.encodeCommand(ic.payload, ic.mode));
                    if (ic.delayMs > 0) await new Promise(function (r) { setTimeout(r, ic.delayMs); });
                }
            }
            if (profile.rateCommand && B.buildRateCommand) {
                var rChar = await findCharacteristic(server, profile.rateCommand.service, profile.rateCommand.characteristic);
                if (rChar) {
                    var rBytes = B.buildRateCommand(profile.rateCommand, Math.max(200, cb.intervalMs || 1000));
                    if (rBytes && rBytes.length) await writeChunked(rChar, rBytes);
                }
            }
            if (profile.pollCommand) {
                var pc = profile.pollCommand;
                var wantMs = Math.max(200, cb.intervalMs || 1000);
                if (!pc.onlyFasterThanMs || wantMs < pc.onlyFasterThanMs) {
                    var pChar = await findCharacteristic(server, pc.service, pc.characteristic);
                    if (pChar) {
                        var pBytes = B.encodeCommand(pc.payload, pc.mode);
                        var sendPoll = function () { if (!closed) writeChunked(pChar, pBytes).catch(function () {}); };
                        sendPoll();
                        cmdPollTimer = setInterval(sendPoll, wantMs);
                    }
                }
            }
        } catch (err) {
            closed = true;
            clearInterval(pollTimer);
            clearInterval(cmdPollTimer);
            try { dataChar.removeEventListener('characteristicvaluechanged', onChar); } catch (e) {}
            try { device.removeEventListener('gattserverdisconnected', onDisc); } catch (e) {}
            try { if (device.gatt && device.gatt.connected) device.gatt.disconnect(); } catch (e) {}
            throw err;
        }

        return {
            deviceName: device.name || profile.name,
            channelLabel: profile.name + ' · ' + field.name + (field.unit ? ' (' + field.unit + ')' : ''),
            disconnect: function () {
                closed = true;
                clearInterval(pollTimer);
                clearInterval(cmdPollTimer);
                try { dataChar.removeEventListener('characteristicvaluechanged', onChar); } catch (e) {}
                try { if (chRule.mode !== 'read' && (dataChar.properties.notify || dataChar.properties.indicate)) Promise.resolve(dataChar.stopNotifications()).catch(function () {}); } catch (e) {}
                try { device.removeEventListener('gattserverdisconnected', onDisc); } catch (e) {}
                try { if (device.gatt && device.gatt.connected) device.gatt.disconnect(); } catch (e) {}
            }
        };
    }

    var godirectPromise = null;
    function loadGoDirect() {
        if (root && root.godirect) return Promise.resolve(root.godirect);
        if (godirectPromise) return godirectPromise;
        godirectPromise = new Promise(function (resolve, reject) {
            var sc = document.createElement('script');
            sc.src = '../vendor/godirect/godirect.min.umd.js';
            sc.onload = function () { if (root.godirect) resolve(root.godirect); else { godirectPromise = null; reject(new Error('Vernier 도구 초기화 실패')); } };
            sc.onerror = function () { godirectPromise = null; reject(new Error('Vernier 도구를 불러오지 못했습니다.')); };
            document.head.appendChild(sc);
        });
        return godirectPromise;
    }

    async function connectAutoTemp(cb) {
        var nav = root && root.navigator;
        if (!nav || !nav.bluetooth) throw new Error('이 브라우저는 Web Bluetooth 를 지원하지 않습니다. 크롬·엣지를 쓰세요.');
        cb.onStatus && cb.onStatus('Vernier 또는 표준 BLE 온도 센서를 고르세요…');
        var device = await nav.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: STD_OPTIONAL });
        var server = await device.gatt.connect();
        var hasVernier = false;
        try { await server.getPrimaryService(VERNIER_SERVICE); hasVernier = true; } catch (e) {}
        if (hasVernier) {
            var gd = await loadGoDirect();
            var gdev = await gd.createDevice(device, { open: true, startMeasurements: false });
            gdev.enableDefaultSensors();
            var enabled = gdev.sensors.filter(function (s) { return s.enabled; });
            var tempS = enabled.find(function (s) { return /temp/i.test(s.name); }) || gdev.sensors.find(function (s) { return /temp/i.test(s.name); }) || enabled[0] || gdev.sensors[0];
            if (!tempS) { try { gdev.close(); } catch (e) {} throw new Error('Vernier 온도 채널을 찾지 못했습니다.'); }
            gdev.sensors.forEach(function (s) { s.setEnabled(s === tempS); });
            var onVal = function (s) { if (typeof s.value === 'number' && isFinite(s.value)) cb.onValue && cb.onValue(s.value); };
            var closed = false;
            gdev.on('device-closed', function () { if (!closed) { closed = true; cb.onDisconnect && cb.onDisconnect('연결 끊김'); } });
            tempS.on('value-changed', onVal);
            gdev.start(Math.max(200, cb.intervalMs || 1000));
            return {
                deviceName: gdev.name || 'Vernier Go Direct',
                channelLabel: tempS.name + ' (' + (tempS.unit || '°C') + ')',
                disconnect: function () {
                    closed = true;
                    try { tempS.off('value-changed', onVal); } catch (e) {}
                    try { gdev.stop(); } catch (e) {}
                    try { gdev.close(); } catch (e) {}
                }
            };
        }
        // 표준 BLE 온도 (0x181A/0x2A6E → 0x1809/0x2A1C)
        var char = null, parser = null, chLabel = '';
        try {
            var s1 = await server.getPrimaryService(0x181a);
            char = await s1.getCharacteristic(0x2a6e);
            parser = function (dv) { return dv && dv.byteLength >= 2 ? dv.getInt16(0, true) / 100 : NaN; };
            chLabel = 'BLE 환경 온도 (0x2A6E, °C)';
        } catch (e) {}
        if (!char) {
            try {
                var s2 = await server.getPrimaryService(0x1809);
                char = await s2.getCharacteristic(0x2a1c);
                parser = decodeHealthThermometerC;
                chLabel = 'BLE 표준 온도계 (0x2A1C, °C)';
            } catch (e) {}
        }
        if (!char) {
            try { device.gatt.disconnect(); } catch (e) {}
            throw new Error('표준 온도 서비스를 찾지 못했습니다. 블루투스 센서 해석 도구에서 규칙을 만들어 등록해 보세요.');
        }
        var closed2 = false, pollTimer2 = null;
        var onCh = function (ev) { var v = parser(ev.target.value); if (isFinite(v)) cb.onValue && cb.onValue(v); };
        var onD2 = function () { if (!closed2) { closed2 = true; clearInterval(pollTimer2); cb.onDisconnect && cb.onDisconnect('연결 끊김'); } };
        device.addEventListener('gattserverdisconnected', onD2);
        var props = char.properties || {};
        if (props.notify || props.indicate) {
            char.addEventListener('characteristicvaluechanged', onCh);
            await char.startNotifications();
        } else if (props.read) {
            var readOnce2 = async function () { try { var v = parser(await char.readValue()); if (isFinite(v)) cb.onValue && cb.onValue(v); } catch (e) {} };
            readOnce2();
            pollTimer2 = setInterval(readOnce2, Math.max(300, cb.intervalMs || 1000));
        }
        return {
            deviceName: device.name || 'BLE 온도 센서',
            channelLabel: chLabel,
            disconnect: function () {
                closed2 = true;
                clearInterval(pollTimer2);
                try { char.removeEventListener('characteristicvaluechanged', onCh); } catch (e) {}
                try { device.removeEventListener('gattserverdisconnected', onD2); } catch (e) {}
                try { if (device.gatt && device.gatt.connected) device.gatt.disconnect(); } catch (e) {}
            }
        };
    }

    async function connectTempSensor(option, cb) {
        cb = cb || {};
        if (!option) throw new Error('연결할 센서를 먼저 선택하세요.');
        if (option.kind === 'pico-env') return connectPicoEnv(cb);
        if (option.kind === 'decoder' && option.decoder) return connectDecodedProfile(option.decoder, cb);
        if (option.kind === 'auto-temp') return connectAutoTemp(cb);
        throw new Error('지원하지 않는 센서 형식입니다.');
    }

    return {
        LOCAL_KEY: LOCAL_KEY,
        BUILTIN_PICO: BUILTIN_PICO,
        BUILTIN_AUTO_STD: BUILTIN_AUTO_STD,
        slugify: slugify,
        readLocal: readLocal,
        readCloud: readCloud,
        mergeProfiles: mergeProfiles,
        filterForExperiment: filterForExperiment,
        loadOptionsFor: loadOptionsFor,
        connectTempSensor: connectTempSensor
    };
});
