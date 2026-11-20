// 가짜 Vernier Go Direct 센서 (블루투스). 버니어 공개 도구(vendor/godirect)가 쓰는 명령·응답 모양을 그대로 흉내 낸다.
// Node 시험: const dev = fakeGoDirect({}) → godirect.createDevice(dev)
// Playwright: page.addInitScript(fakeGoDirect, { install: true }) → navigator.bluetooth.requestDevice 가 이 기기를 돌려줌
// 채널: 1 힘 Force (N, 기본으로 켜짐), 2 X-axis acceleration (m/s²), 3 Y-axis acceleration (m/s²)
// 값 바꾸기: window.__gdx.force = 2.5 (브라우저), dev.state.force (Node)
function fakeGoDirect(cfg) {
    cfg = cfg || {};
    const g = typeof window !== 'undefined' ? window : globalThis;
    const SERVICE = 'd91714ef-28b9-4f91-ba16-f0d9a604f112';
    const CMD = 'f4bf14a6-c7d5-4b6d-8aa8-df1a7c83adcb';
    const RESP = 'b41e6675-a329-40e0-aa01-44d2f444babe';
    const state = { force: 1.25, ax: 0.5, ay: -9.8, commands: [], period: 0, mask: 0, starts: 0, requestOpts: null };
    const CHANNELS = [
        { number: 1, name: 'Force', unit: 'N', typical: 100000, read: () => state.force },
        { number: 2, name: 'X-axis acceleration', unit: 'm/s²', typical: 100000, read: () => state.ax },
        { number: 3, name: 'Y-axis acceleration', unit: 'm/s²', typical: 100000, read: () => state.ay }
    ];
    const DEFAULT_MASK = 1 << 1;
    const NAME = cfg.name || 'GDX-FOR 0F1000123';
    let timer = null, pending = [];
    const listeners = {};

    const enc = s => new TextEncoder().encode(s);
    const resp = {
        uuid: RESP, l: [],
        addEventListener(n, f) { this.l.push(f); }, removeEventListener(n, f) { this.l = this.l.filter(x => x !== f); },
        async startNotifications() {}, async stopNotifications() {},
        emit(bytes) {
            // 블루투스는 한 번에 20바이트씩
            for (let i = 0; i < bytes.length; i += 20) {
                const part = bytes.slice(i, i + 20);
                const value = new DataView(part.buffer);
                this.l.forEach(f => f({ target: { value } }));
            }
        }
    };
    function reply(command, counter, payload) {
        const b = new Uint8Array(6 + payload.length);
        b[0] = 0x01; b[1] = b.length; b[4] = command; b[5] = counter;
        b.set(payload, 6);
        setTimeout(() => resp.emit(b), 2);
    }
    function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; }
    function sensorInfo(ch) {
        const p = new Uint8Array(148);
        const v = new DataView(p.buffer);
        p[0] = ch.number;
        v.setUint32(2, 1000 + ch.number, true);   // 센서 ID (0 이면 없는 채널로 봄)
        p[6] = 0; p[7] = 0;
        p.set(enc(ch.name).slice(0, 60), 8);      // 응답 전체에서 14 자리 = 내용 8 자리
        p.set(enc(ch.unit).slice(0, 32), 68);     // 응답 전체 74 자리
        v.setFloat64(100, 0.01, true);
        v.setFloat64(108, -50, true);
        v.setFloat64(116, 50, true);
        v.setUint32(124, 10000, true);            // 가장 짧은 간격 10 ms (µs 단위)
        v.setUint32(128, 100000000, true);
        v.setUint32(136, ch.typical, true);       // 보통 간격
        v.setUint32(140, 1000, true);
        v.setUint32(144, 0, true);                // 함께 켤 수 없는 채널 없음
        return p;
    }
    function measure() {
        const on = CHANNELS.filter(c => state.mask & (1 << c.number));
        if (!on.length) return;
        const b = new Uint8Array(9 + on.length * 4);
        const v = new DataView(b.buffer);
        b[0] = 0x20; b[1] = b.length; b[4] = 0x06;
        v.setUint16(5, state.mask & 0xffff, true);
        b[7] = 1;
        on.forEach((c, i) => v.setFloat32(9 + i * 4, c.read(), true));
        resp.emit(b);
    }
    function handle(buf) {
        const counter = buf[2], command = buf[4];
        state.commands.push(command);
        switch (command) {
            case 0x1a: reply(command, counter, [0]); break;                                  // 처음 인사
            case 0x10: reply(command, counter, [0, 0, 1, 2, 0, 0, 1, 0, 0, 3, 87, 0]); break; // 상태(배터리 87%)
            case 0x55: {                                                                      // 기기 정보
                const p = new Uint8Array(64);
                p.set(enc('GDX-FOR'), 0); p.set(enc('0F1000123'), 16); p.set(enc(NAME).slice(0, 32), 32);
                reply(command, counter, p); break;
            }
            case 0x56: reply(command, counter, u32(DEFAULT_MASK)); break;
            case 0x51: reply(command, counter, u32(CHANNELS.reduce((m, c) => m | (1 << c.number), 0))); break;
            case 0x50: {
                const ch = CHANNELS.find(c => c.number === buf[5]);
                reply(command, counter, ch ? sensorInfo(ch) : new Uint8Array(148));
                break;
            }
            case 0x1b: state.period = new DataView(buf.buffer, buf.byteOffset).getUint32(7, true); reply(command, counter, [0]); break;
            case 0x18: {
                state.mask = new DataView(buf.buffer, buf.byteOffset).getUint32(7, true);
                state.starts++;
                clearInterval(timer);
                timer = setInterval(measure, Math.max(10, Math.round(state.period / 1000) || 100));
                reply(command, counter, [0]); break;
            }
            case 0x19: clearInterval(timer); timer = null; reply(command, counter, [0]); break;
            case 0x54: reply(command, counter, [0]); setTimeout(() => device.gatt.disconnect(), 5); break;
            default: reply(command, counter, [0]);
        }
    }
    const cmd = {
        uuid: CMD,
        async writeValue(chunk) {
            pending = pending.concat(Array.from(new Uint8Array(chunk.buffer ? chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) : chunk)));
            if (pending.length >= pending[1]) { const buf = Uint8Array.from(pending.splice(0, pending[1])); handle(buf); }
        }
    };
    const device = {
        name: NAME, id: 'fake-gdx', state,
        addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
        removeEventListener(n, f) { listeners[n] = (listeners[n] || []).filter(x => x !== f); },
        gatt: {
            connected: false,
            async connect() { this.connected = true; return this; },
            async getPrimaryService(uuid) {
                if (uuid !== SERVICE) throw Object.assign(new Error('No service'), { name: 'NotFoundError' });
                return { uuid: SERVICE, async getCharacteristics() { return [cmd, resp]; } };
            },
            async getPrimaryServices() { return [{ uuid: SERVICE, async getCharacteristics() { return [cmd, resp]; } }]; },
            disconnect() {
                if (!this.connected) return;
                this.connected = false; clearInterval(timer);
                (listeners.gattserverdisconnected || []).forEach(f => f({ target: device }));
            }
        }
    };
    if (cfg.install) {
        g.__gdx = state;
        Object.defineProperty(navigator, 'bluetooth', {
            value: { async requestDevice(opts) { state.requestOpts = opts; return device; } }, configurable: true
        });
    }
    return device;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { fakeGoDirect };
