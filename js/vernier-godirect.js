// Vernier Go Direct® 무선 센서를 버니어 공개 도구(vendor/godirect, BSD 3-Clause)로 연결해 값을 받는 부분
// 전역 이름: VernierSensor. CustomLabSensor 와 같은 모양으로 쓴다 (선생님이 만든 실험의 'vernier' 기능)
//   const s = VernierSensor.create({ rate: 'auto', slots: ['ch1', 'ch2'],
//       onSample(sample) {},      // { t: 초, values: { ch1: 숫자|null, … } }
//       onStatus(text) {}, onState(connected) {},
//       onChannels(channels, mapping) {}   // 센서가 알려 준 채널 [{ number, name, unit }] 과 칸 → 채널 번호
//   });
//   s.connect(); s.disconnect(); s.setRate('500'); s.setMapping({ ch1: 2 }); s.isConnected(); s.channels();
(function (root) {
    'use strict';
    const LIB_SRC = (function () {
        const me = root.document && root.document.currentScript && root.document.currentScript.src;
        return me ? new URL('../vendor/godirect/godirect.min.umd.js', me).href : '../vendor/godirect/godirect.min.umd.js';
    })();
    const SERVICE = 'd91714ef-28b9-4f91-ba16-f0d9a604f112';   // 버니어가 공개한 Go Direct 서비스
    const SILENCE_MS = 15000;

    function unsupportedReason() {
        if (!root.isSecureContext || !root.navigator || !root.navigator.bluetooth) {
            return '이 브라우저에서는 블루투스 센서를 연결할 수 없습니다. PC나 안드로이드의 크롬·엣지로 https 주소에서 여세요. (아이폰·아이패드 사파리는 지원하지 않습니다)';
        }
        return '';
    }

    let loading = null;
    function loadLibrary() {
        if (root.godirect) return Promise.resolve(root.godirect);
        if (loading) return loading;
        loading = new Promise((resolve, reject) => {
            const s = root.document.createElement('script');
            s.src = LIB_SRC;
            s.onload = () => (root.godirect ? resolve(root.godirect) : reject(new Error('버니어 연결 도구를 불러오지 못했습니다.')));
            s.onerror = () => { loading = null; reject(new Error('버니어 연결 도구를 불러오지 못했습니다. 페이지를 새로고침하세요.')); };
            root.document.head.appendChild(s);
        });
        return loading;
    }

    // 칸(ch1, ch2…)마다 쓸 채널: 이미 정한 것 → 센서 기본 채널 → 남은 채널 순서
    function defaultMapping(channels, defaults, slots, previous) {
        const map = {};
        const used = new Set();
        const has = n => channels.some(c => c.number === n);
        slots.forEach(k => { if (previous && has(previous[k]) && !used.has(previous[k])) { map[k] = previous[k]; used.add(previous[k]); } });
        const order = defaults.concat(channels.map(c => c.number).filter(n => !defaults.includes(n)));
        slots.forEach(k => {
            if (map[k] !== undefined) return;
            const n = order.find(x => !used.has(x));
            if (n !== undefined) { map[k] = n; used.add(n); }
        });
        return map;
    }

    function create(options) {
        const slots = options.slots && options.slots.length ? options.slots.slice() : ['ch1'];
        const onSample = options.onSample || function () {};
        const onStatus = options.onStatus || function () {};
        const onState = options.onState || function () {};
        const onChannels = options.onChannels || function () {};
        let rate = String(options.rate || 'auto');
        let device = null, mapping = {}, channelList = [], count = 0, period = 0, lastSampleAt = null, latest = {};
        let connecting = false, leaving = false;
        const listeners = [];

        function channels() { return channelList.slice(); }
        function clean() {
            listeners.splice(0).forEach(([sensor, fn]) => { try { sensor.off ? sensor.off('value-changed', fn) : null; } catch (e) { /* 무시 */ } });
            const d = device;
            device = null; lastSampleAt = null; latest = {};
            if (d) { try { d.close().catch(() => {}); } catch (e) { /* 이미 끊김 */ } }
            onState(false);
        }
        function fail(error) {
            console.error('버니어 센서 오류:', error);
            clean();
            onStatus('⚠ 센서 오류: ' + (error && error.message || error));
        }

        // 고른 채널만 켜고 다시 측정 시작
        async function apply() {
            if (!device) return;
            const wanted = new Set(slots.map(k => mapping[k]).filter(n => n !== undefined));
            device.stop();
            listeners.splice(0).forEach(([sensor, fn]) => sensor.off && sensor.off('value-changed', fn));
            device.sensors.forEach(s => s.setEnabled(wanted.has(s.number)));
            const on = device.sensors.filter(s => s.enabled);
            const missing = [...wanted].filter(n => !on.some(s => s.number === n));
            // 같이 켤 수 없는 채널(센서가 막음)이 있으면 알림
            const note = missing.length ? ' — 같이 켤 수 없는 채널이 있어 일부만 받습니다' : '';
            // 한 묶음에 켜진 채널 값이 번호 순서로 오므로, 마지막 채널 값이 오면 한 점으로 본다
            const last = on.reduce((a, s) => (a === null || s.number > a.number ? s : a), null);
            count = 0; latest = {};
            on.forEach(s => {
                const fn = sensor => {
                    latest[sensor.number] = sensor.value;
                    if (sensor !== last) return;
                    const values = {};
                    slots.forEach(k => {
                        const v = latest[mapping[k]];
                        values[k] = typeof v === 'number' && isFinite(v) ? v : null;
                    });
                    const t = Math.round(count * period) / 1000;
                    count++;
                    lastSampleAt = performance.now();
                    onStatus('연결됨 — 값을 받는 중' + note);
                    onSample({ t, values });
                };
                s.on('value-changed', fn);
                listeners.push([s, fn]);
            });
            device.start(rate === 'auto' ? null : Number(rate));
            period = device.measurementPeriod;   // 밀리초 (센서가 정함)
            lastSampleAt = performance.now();
            onChannels(channels(), Object.assign({}, mapping));
        }

        async function connect() {
            if (connecting) return;
            const reason = unsupportedReason();
            if (reason) { onStatus('⚠ ' + reason); return; }
            connecting = true;
            clean();
            try {
                onStatus('버니어 연결 도구를 불러오는 중…');
                const lib = await loadLibrary();
                onStatus('장치 선택 — 목록에서 GDX 로 시작하는 이름을 고르세요. (센서 전원 단추를 눌러 불이 깜박이게)');
                const d = await lib.selectDevice(true);
                if (leaving) { try { await d.close(); } catch (e) { /* 무시 */ } return; }
                device = d;
                d.on('device-closed', () => {
                    if (device !== d) return;
                    device = null;
                    clean();
                    onStatus('연결 해제됨 — 기록한 값은 그대로 있습니다.');
                });
                channelList = d.sensors.map(s => ({ number: s.number, name: s.name, unit: s.unit }));
                if (!channelList.length) throw new Error('이 센서가 알려 준 측정 채널이 없습니다.');
                const defaults = d.sensors.filter(s => s.enabled).map(s => s.number);
                mapping = defaultMapping(channelList, defaults, slots, mapping);
                onState(true);
                onStatus((d.name || '버니어 센서') + ' 연결됨 — 채널 ' + channelList.length + '개, 첫 값을 기다리는 중');
                await apply();
            } catch (error) {
                if (error && (error.name === 'NotFoundError' || /No device selected/.test(error.message || ''))) {
                    clean();
                    onStatus('장치를 고르지 않았습니다. 다시 "센서 연결"을 누르세요.');
                } else fail(error);
            } finally {
                connecting = false;
            }
        }

        const timer = setInterval(() => {
            if (device && lastSampleAt !== null && performance.now() - lastSampleAt > SILENCE_MS) {
                fail(new Error('15초 동안 센서 값이 오지 않았습니다. 센서 전원과 배터리를 확인하세요.'));
            }
        }, 1000);
        const onHide = () => { leaving = true; clean(); };
        const onShow = () => { leaving = false; };
        root.addEventListener('pagehide', onHide);
        root.addEventListener('pageshow', onShow);

        return {
            connect, channels,
            setRate(value) { rate = String(value); if (device) apply().catch(fail); },
            setMapping(map) {
                Object.keys(map || {}).forEach(k => { if (slots.includes(k)) mapping[k] = Number(map[k]); });
                if (device) apply().catch(fail);
            },
            mapping() { return Object.assign({}, mapping); },
            disconnect() { if (device) { clean(); onStatus('연결 해제됨 — 기록한 값은 그대로 있습니다.'); } },
            isConnected() { return !!device; },
            destroy() { clearInterval(timer); root.removeEventListener('pagehide', onHide); root.removeEventListener('pageshow', onShow); clean(); }
        };
    }

    const api = { create, unsupportedReason, defaultMapping, SERVICE };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.VernierSensor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
