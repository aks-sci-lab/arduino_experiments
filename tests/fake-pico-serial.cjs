// 시험용 가짜 Pico 보드 (MicroPython USB 시리얼 흉내). Node 시험과 브라우저(Playwright addInitScript) 둘 다 쓴다.
// - 돌던 main.py 는 Ctrl-C 로 멈추고 >>> , Ctrl-A 로 원시 REPL, Ctrl-B 로 나오기, >>> 에서 Ctrl-D 로 다시 켜기
// - 원시 REPL 에서는 js/pico-flash.js 의 도우미(_o·_w·_c·_h·_d·_m·_ls·_fs·_i)만 알아듣는다.
// options: bluetooth(기본 true), files(처음 파일 { 이름: 글 }), unplugAfterWrites(n 번째 _w 뒤 USB 끊김),
//          corrupt(파일 이름: 쓸 때 한 바이트 바꿈), silent(아무 대답 없음), noBoot(다시 켤 때 판을 안 찍음)
(function (root) {
    'use strict';

    const enc = new TextEncoder();

    function b64decode(text) {
        if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
        const bin = atob(text);
        return Uint8Array.from(bin, c => c.charCodeAt(0));
    }

    async function sha256(bytes) {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
    }

    class FakePicoBoard {
        constructor(options = {}) {
            this.options = options;
            this.fs = new Map();
            for (const [name, text] of Object.entries(options.files || {})) {
                this.fs.set(name, typeof text === 'string' ? enc.encode(text) : text);
            }
            this.mode = 'running';
            this.raw = [];
            this.defined = false;
            this.open = null;          // { name, parts: [] }
            this.writes = 0;
            this.unplugged = false;
            this.listeners = { data: [], close: [] };
            this.log = [];             // 실행한 명령 (시험에서 확인)
            this.boots = 0;
            this.queue = Promise.resolve();
        }
        onData(fn) { this.listeners.data.push(fn); }
        onClose(fn) { this.listeners.close.push(fn); if (this.unplugged) fn(); }
        emit(text) {
            if (this.unplugged || this.options.silent) return;
            const bytes = enc.encode(text);
            setTimeout(() => { for (const fn of this.listeners.data) fn(bytes); }, 0);
        }
        unplug() {
            if (this.unplugged) return;
            this.unplugged = true;
            setTimeout(() => { for (const fn of this.listeners.close) fn(); }, 0);
        }
        text(name) { return this.fs.has(name) ? new TextDecoder().decode(this.fs.get(name)) : null; }
        version() {
            const match = /^FIRMWARE_VERSION\s*=\s*"([^"]+)"/m.exec(this.text('main.py') || '');
            return match ? match[1] : null;
        }

        // 받은 바이트를 차례로 처리한다 (write 는 순서대로 기다림).
        write(bytes) {
            if (this.unplugged) return Promise.reject(new Error('The device has been lost.'));
            this.queue = this.queue.then(() => this.receive(bytes));
            return this.queue;
        }

        async receive(bytes) {
            for (const byte of bytes) {
                if (this.unplugged) return;
                const ch = String.fromCharCode(byte);
                if (this.mode === 'running') {
                    if (byte === 3) { this.mode = 'friendly'; this.emit('[STOP] Program interrupted from USB/Thonny.\r\n>>> '); }
                } else if (this.mode === 'friendly') {
                    if (byte === 1) { this.mode = 'raw'; this.raw = []; this.emit('\r\nraw REPL; CTRL-B to exit\r\n>'); }
                    else if (byte === 4) await this.softReset();
                    else if (byte === 3) this.emit('\r\n>>> ');
                } else if (this.mode === 'raw') {
                    if (byte === 4) { const code = new TextDecoder().decode(new Uint8Array(this.raw)); this.raw = []; await this.exec(code); }
                    else if (byte === 2) { this.mode = 'friendly'; this.emit('\r\nMicroPython v1.24.1 on 2024-11-29; Raspberry Pi Pico 2 W with RP2350\r\n>>> '); }
                    else if (byte === 1) { this.raw = []; this.emit('\r\nraw REPL; CTRL-B to exit\r\n>'); }
                    else if (byte === 3) this.raw = [];
                    else this.raw.push(byte);
                }
                void ch;
            }
        }

        async softReset() {
            this.boots += 1;
            this.defined = false;
            this.mode = 'running';
            this.emit('MPY: soft reboot\r\n[BOOT] Pico lab firmware starting\r\n');
            if (!this.options.noBoot && this.version()) this.emit('[BOOT] Firmware: ' + this.version() + '\r\n[BLE] Advertising: PicoEnv-07\r\n');
        }

        async exec(code) {
            let out = '', err = '';
            const arg = text => JSON.parse(text);
            try {
                code = code.trim();
                if (code.includes('def _o(')) { this.defined = true; }
                else {
                    if (!this.defined) throw new Error("NameError: name '_x' isn't defined");
                    let m;
                    this.log.push(code.length > 60 ? code.slice(0, 60) + '…' : code);
                    if (code === '_i()') out = 'I ' + (this.options.bluetooth === false ? 0 : 1) + ' Raspberry_Pi_Pico_2_W_with_RP2350\r\n';
                    else if (code === '_ls()') out = 'L ' + [...this.fs.keys()].join('/') + '\r\n';
                    else if (code === '_fs()') out = 'F ' + (this.options.free ?? 2000000) + '\r\n';
                    else if ((m = /^_d\(("[^"]*")\)$/.exec(code))) this.fs.delete(arg(m[1]));
                    else if ((m = /^_o\(("[^"]*")\)$/.exec(code))) this.open = { name: arg(m[1]), parts: [] };
                    else if ((m = /^_w\("([A-Za-z0-9+/=]*)"\)$/.exec(code))) {
                        if (!this.open) throw new Error('AttributeError');
                        this.open.parts.push(b64decode(m[1]));
                        this.writes += 1;
                        if (this.options.unplugAfterWrites && this.writes === this.options.unplugAfterWrites) { this.unplug(); return; }
                    } else if (code === '_c()') {
                        const size = this.open.parts.reduce((s, p) => s + p.length, 0);
                        const all = new Uint8Array(size);
                        let at = 0;
                        for (const p of this.open.parts) { all.set(p, at); at += p.length; }
                        if (this.options.corrupt && this.open.name === this.options.corrupt + '.new' && all.length) all[0] ^= 1;
                        this.fs.set(this.open.name, all);
                        this.open = null;
                    } else if ((m = /^_h\(("[^"]*")\)$/.exec(code))) {
                        const data = this.fs.get(arg(m[1]));
                        if (!data) throw new Error('OSError: [Errno 2] ENOENT');
                        out = 'H ' + data.length + ' ' + (this.options.noHash ? '-' : await sha256(data)) + '\r\n';
                    } else if ((m = /^_m\(("[^"]*"),("[^"]*")\)$/.exec(code))) {
                        const from = arg(m[1]), to = arg(m[2]);
                        if (!this.fs.has(from)) throw new Error('OSError: [Errno 2] ENOENT');
                        this.fs.set(to, this.fs.get(from));
                        this.fs.delete(from);
                    } else throw new Error('SyntaxError: invalid syntax');
                }
            } catch (error) {
                err = 'Traceback (most recent call last):\r\n  File "<stdin>", line 1\r\n' + error.message + '\r\n';
            }
            this.emit('OK' + out + '\x04' + err + '\x04>');
        }
    }

    // navigator.serial 흉내. board 하나를 고를 수 있는 포트로 내놓는다.
    function fakeSerial(getBoard, options = {}) {
        return {
            async requestPort() {
                if (options.cancel) { const e = new Error('No port selected by the user.'); e.name = 'NotFoundError'; throw e; }
                const board = getBoard();
                let controller = null;
                const port = {
                    readable: null, writable: null,
                    async open() {
                        if (options.busy) { const e = new Error('Failed to open serial port.'); e.name = 'NetworkError'; throw e; }
                        port.readable = new ReadableStream({ start(c) { controller = c; } });
                        port.writable = new WritableStream({ write: chunk => board.write(chunk) });
                        board.onData(bytes => { try { controller.enqueue(bytes); } catch (e) { /* 닫힘 */ } });
                        board.onClose(() => { try { controller.error(new Error('The device has been lost.')); } catch (e) { /* 닫힘 */ } });
                    },
                    async close() { port.closed = true; },
                };
                return port;
            },
        };
    }

    const api = { FakePicoBoard, fakeSerial };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
