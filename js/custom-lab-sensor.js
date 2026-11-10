// 선생님이 만든 실험에서 Pico 환경 센서 보드를 블루투스로 연결해 값을 받는 부분
// 전역 이름: CustomLabSensor
// 사용법:
//   const s = CustomLabSensor.create({ mode: 'light', rate: '1000',
//       onSample(sample) {},    // sample = { t: 초(첫 값부터), values: { 값 이름: 숫자 또는 null } }
//       onStatus(text) {},      // 화면에 보일 상태 글
//       onState(connected) {}   // 연결됨/해제됨
//   });
//   s.connect(); s.disconnect(); s.setRate('2000'); s.isConnected();
// 필요한 파일(먼저 불러올 것): pico-ble.js, environment-protocol.js, sensor-definitions.js,
//   accelerometer-protocol.js, voc-index.js (공기질 기능에서만 씀), custom-lab-math.js
(function (root) {
    'use strict';
    const SERVICE = '19b10000-e8f2-537e-4f6c-d104768a1214';
    const TX = '19b10001-e8f2-537e-4f6c-d104768a1214';      // 글자(JSON) 값·오류 알림
    const CMD = '19b10002-e8f2-537e-4f6c-d104768a1214';     // 명령 쓰기
    const ACCEL = '19b10004-e8f2-537e-4f6c-d104768a1214';   // 가속도 값 (16바이트 묶음)
    const SILENCE_MS = 15000;

    // 이 브라우저에서 센서를 연결할 수 있는지. 안 되면 까닭을 글로 돌려준다.
    function unsupportedReason() {
        if (!root.isSecureContext || !root.navigator || !root.navigator.bluetooth) {
            return '이 브라우저에서는 센서를 연결할 수 없습니다. PC나 안드로이드의 크롬·엣지로 https 주소에서 여세요. (아이폰은 지원하지 않습니다)';
        }
        if (!root.PicoBLE || !root.EnvironmentProtocol || !root.SensorDefinitions || !root.AccelerometerProtocol) {
            return '센서 연결 코드를 불러오지 못했습니다. 페이지를 새로고침하세요.';
        }
        return '';
    }

    function create(options) {
        const M = root.CustomLabMath;
        const mode = options.mode;
        const config = M.SENSORS[mode];
        if (!config) throw new Error('알 수 없는 센서 기능: ' + mode);
        const onSample = options.onSample || function () {};
        const onStatus = options.onStatus || function () {};
        const onState = options.onState || function () {};
        let rate = String(options.rate || config.rates[0][0]);
        let device = null, tx = null, cmd = null, accel = null;
        let connecting = false, setupFailure = null, received = false;
        let lastSampleAt = null, firstTs = null, voc = null, leaving = false;

        const validator = mode === 'env'
            ? root.EnvironmentProtocol.validateSample
            : packet => root.SensorDefinitions.validate(mode, packet);
        // 가속도 기능에서는 글자 통로로 오류 알림만 온다
        const textReceiver = new root.EnvironmentProtocol.Receiver(
            mode === 'imu' ? function () {} : handlePacket, fail, mode === 'imu' ? p => p : validator
        );
        const accelReceiver = new root.AccelerometerProtocol.Receiver();

        function handlePacket(packet) {
            let values = packet.data;
            let note = '';
            if (mode === 'voc') {
                const result = voc.process(packet);
                values = Object.assign({}, packet.data, { vocIndex: result.index });
                if (result.index === null) {
                    note = ' — VOC Index 준비 중 (' + Math.max(packet.data.warmup, result.learningRemaining, 1) + '초 남음)';
                }
            }
            if (firstTs === null) firstTs = packet.ts;
            emit((packet.ts - firstTs) / 1000, values, note);
        }
        function emit(t, values, note) {
            received = true;
            lastSampleAt = performance.now();
            const picked = {};
            config.fields.forEach(f => {
                const v = values[f[0]];
                picked[f[0]] = typeof v === 'number' && isFinite(v) ? v : null;
            });
            onStatus('연결됨 — 값을 받는 중' + (note || ''));
            onSample({ t, values: picked });
        }
        function textNotification(event) { textReceiver.push(event.target.value); }
        function accelNotification(event) {
            try {
                accelReceiver.read(event.target.value).forEach(s => emit(s.time, s, ''));
            } catch (error) { fail(error); }
        }

        function clean() {
            const previous = device;
            if (previous) previous.removeEventListener('gattserverdisconnected', disconnected);
            if (tx) tx.removeEventListener('characteristicvaluechanged', textNotification);
            if (accel) accel.removeEventListener('characteristicvaluechanged', accelNotification);
            device = null; tx = null; cmd = null; accel = null;
            lastSampleAt = null; firstTs = null; received = false;
            textReceiver.reset(); accelReceiver.reset();
            if (voc) voc.reset();
            if (previous && previous.gatt.connected) previous.gatt.disconnect();
            onState(false);
        }
        function disconnected() {
            clean();
            onStatus('연결 해제됨 — 기록한 값은 그대로 있습니다.');
        }
        function fail(error) {
            if (connecting) setupFailure = error;
            console.error('센서 오류:', error);
            clean();
            onStatus('⚠ 센서 오류: ' + error.message);
        }
        async function send(command) {
            if (!device || !device.gatt.connected || !cmd) throw new Error('센서 연결이 해제되었습니다.');
            await cmd.writeValueWithResponse(new TextEncoder().encode(command));
        }
        const rateCommand = () => (mode === 'imu' ? 'SET_IMU_RATE:' : 'SET_SENSOR_RATE:') + rate;

        async function connect() {
            if (connecting) return;
            const reason = unsupportedReason();
            if (reason) { onStatus('⚠ ' + reason); return; }
            connecting = true; setupFailure = null;
            clean();
            let stage = '장치 선택';
            onStatus('장치 선택 — 목록에서 PicoEnv 로 시작하는 이름을 고르세요. (다른 실험 페이지의 연결은 먼저 끊으세요)');
            try {
                const selected = await root.navigator.bluetooth.requestDevice({
                    filters: [{ namePrefix: 'PicoEnv-' }], optionalServices: [SERVICE]
                });
                device = selected;
                if (mode === 'voc') {
                    stage = 'VOC 계산 준비';
                    if (!root.VOCIndex) throw new Error('VOC 계산 코드를 불러오지 못했습니다. 페이지를 새로고침하세요.');
                    if (!voc) voc = await root.VOCIndex.create();
                    voc.reset();
                }
                stage = '연결';
                onStatus('연결 중: ' + selected.name);
                const ensure = () => {
                    if (setupFailure) throw setupFailure;
                    if (leaving || device !== selected) {
                        const e = new Error('연결을 취소했습니다.'); e.name = 'AbortError'; throw e;
                    }
                    if (!selected.gatt.connected) throw new Error('준비 중에 연결이 끊어졌습니다.');
                };
                await root.PicoBLE.discover(
                    selected, SERVICE, mode === 'imu' ? [TX, CMD, ACCEL] : [TX, CMD],
                    (attempt, error) => onStatus('연결 다시 시도 ' + attempt + '/2 (' + stage + '): ' + error.message),
                    {
                        isCancelled: () => leaving || device !== selected || setupFailure !== null,
                        cleanup: () => {
                            if (tx) tx.removeEventListener('characteristicvaluechanged', textNotification);
                            if (accel) accel.removeEventListener('characteristicvaluechanged', accelNotification);
                            tx = null; cmd = null; accel = null;
                            textReceiver.reset(); accelReceiver.reset();
                            if (voc) voc.reset();
                            received = false; lastSampleAt = null; firstTs = null;
                        },
                        prepare: async characteristics => {
                            tx = characteristics[0]; cmd = characteristics[1]; accel = characteristics[2] || null;
                            stage = '알림 등록';
                            tx.addEventListener('characteristicvaluechanged', textNotification);
                            await tx.startNotifications();
                            if (accel) {
                                accel.addEventListener('characteristicvaluechanged', accelNotification);
                                await accel.startNotifications();
                            }
                            ensure();
                            for (const command of ['STOP', rateCommand(), 'START:' + config.command]) {
                                stage = '명령 ' + command;
                                ensure();
                                await send(command);
                                ensure();
                            }
                            lastSampleAt = performance.now();
                        }
                    }
                );
                if (leaving || device !== selected) { selected.gatt.disconnect(); throw new Error('연결을 취소했습니다.'); }
                selected.addEventListener('gattserverdisconnected', disconnected);
                if (!received) onStatus(selected.name + ' 연결됨 — 첫 값을 기다리는 중');
                onState(true);
            } catch (error) {
                if (error && error.name === 'NotFoundError') {     // 장치 선택 창을 그냥 닫은 경우
                    clean();
                    onStatus('장치를 고르지 않았습니다. 다시 "센서 연결"을 누르세요.');
                } else {
                    fail(setupFailure || new Error(stage + ': ' + error.message));
                }
            } finally {
                connecting = false;
            }
        }

        async function setRate(value) {
            if (!config.rates.some(r => r[0] === String(value))) return;
            rate = String(value);
            if (!device || !device.gatt.connected) return;
            try { await send(rateCommand()); } catch (error) { fail(error); }
        }

        const timer = setInterval(() => {
            if (device && device.gatt.connected && lastSampleAt !== null && performance.now() - lastSampleAt > SILENCE_MS) {
                fail(new Error('15초 동안 센서 값이 오지 않았습니다. 센서 보드의 전원과 최신 펌웨어를 확인하세요.'));
            }
        }, 1000);
        const onHide = () => { leaving = true; clean(); };
        const onShow = () => { leaving = false; };
        root.addEventListener('pagehide', onHide);
        root.addEventListener('pageshow', onShow);

        return {
            connect, setRate,
            disconnect() { if (device) disconnected(); },
            isConnected() { return !!(device && device.gatt.connected); },
            destroy() { clearInterval(timer); root.removeEventListener('pagehide', onHide); root.removeEventListener('pageshow', onShow); clean(); }
        };
    }

    root.CustomLabSensor = { create, unsupportedReason };
})(typeof globalThis !== 'undefined' ? globalThis : this);
