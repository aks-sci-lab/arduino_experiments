// Pico 센서 보드에 펌웨어 파일 네 개를 USB(Web Serial)로 한 번에 올리기 (선생님용, PC 크롬·엣지).
// MicroPython 의 원시 REPL(raw REPL: Ctrl-A 로 들어가 코드를 보내고 Ctrl-D 로 실행)을 쓴다.
//   1) Ctrl-C 로 돌던 main.py 를 멈추고 Ctrl-A 로 원시 REPL
//   2) 작은 도우미 함수(_o·_w·_c·_h·_m …)를 보드에 정의
//   3) 파일마다 「이름.new」 로 나눠 쓰기(base64) → 크기·SHA-256 확인
//   4) 네 파일이 다 맞으면 그때 원래 이름으로 바꿈(main.py 는 맨 끝) — 중간에 끊겨도 예전 펌웨어가 그대로 남음
//   5) Ctrl-B → Ctrl-D 로 다시 켜기 → main.py 가 찍는 「[BOOT] Firmware: 판」 으로 확인
// 보드 번호 파일(board.json)은 읽지도 쓰지도 지우지도 않는다.
(function (root) {
    'use strict';

    const FILES = ['bme280.py', 'imu.py', 'extra_sensors.py', 'main.py'];
    const KEEP = 'board.json';
    const TEMP = '.new';
    const BASE = '../firmware/pico2w-environment/';
    const UF2_URL = 'https://micropython.org/download/RPI_PICO2_W/';
    const CHUNK = 768;            // 한 번에 보내는 원래 바이트(= base64 1024 글자)
    const WRITE_PIECE = 256;      // 시리얼에 한 번에 쓰는 바이트 (보드 입력 버퍼가 넘치지 않게)
    const RAW_PROMPT = 'raw REPL; CTRL-B to exit\r\n>';

    // 보드에서 한 번 정의해 두고 부르는 도우미 (MicroPython).
    const PRELUDE = [
        'import os,sys,binascii',
        'try:',
        ' import hashlib',
        'except ImportError:',
        ' hashlib=None',
        '_f=None',
        'def _o(n):',
        ' global _f',
        ' _f=open(n,"wb")',
        'def _w(s):',
        ' _f.write(binascii.a2b_base64(s))',
        'def _c():',
        ' global _f',
        ' _f.close();_f=None',
        'def _h(n):',
        ' z=os.stat(n)[6]',
        ' if hashlib is None:',
        '  print("H",z,"-");return',
        ' h=hashlib.sha256();f=open(n,"rb")',
        ' while 1:',
        '  b=f.read(512)',
        '  if not b:break',
        '  h.update(b)',
        ' f.close();print("H",z,binascii.hexlify(h.digest()).decode())',
        'def _d(n):',
        ' try:os.remove(n)',
        ' except OSError:pass',
        'def _m(a,b):',
        ' _d(b);os.rename(a,b)',
        'def _ls():',
        ' print("L","/".join(os.listdir()))',
        'def _fs():',
        ' s=os.statvfs("/");print("F",s[0]*s[3])',
        'def _i():',
        ' try:',
        '  import bluetooth;b=1',
        ' except ImportError:',
        '  b=0',
        ' print("I",b,sys.implementation._machine.replace(" ","_"))',
    ].join('\n');

    const STAGES = [
        ['files', '사이트에서 펌웨어 파일 받기'],
        ['connect', '보드와 이야기 시작 (원시 REPL)'],
        ['check', '보드 확인 (MicroPython·블루투스·저장 공간)'],
        ['write', '파일 네 개 쓰고 확인'],
        ['install', '새 파일로 바꾸기 (보드 번호 파일은 그대로)'],
        ['reboot', '보드 다시 켜고 판 확인'],
    ];

    class FlashError extends Error {
        constructor(stage, message, detail) {
            super(message);
            this.name = 'FlashError';
            this.stage = stage;
            this.detail = detail || '';
        }
    }

    function toBase64(bytes) {
        if (typeof Buffer !== 'undefined' && !root.btoa) return Buffer.from(bytes).toString('base64');
        let text = '';
        for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return root.btoa(text);
    }

    async function sha256Hex(bytes) {
        const subtle = root.crypto && root.crypto.subtle;
        if (!subtle) return null;
        const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
        return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
    }

    function versionOf(text) {
        const match = /^FIRMWARE_VERSION\s*=\s*["']([^"']+)["']/m.exec(text || '');
        return match ? match[1] : null;
    }

    // 시리얼에서 들어오는 글을 모아 두고 기다리는 글이 나올 때까지 기다린다.
    class Link {
        constructor(io, options = {}) {
            this.io = io;
            this.text = '';
            this.closed = false;
            this.waiter = null;
            this.sleep = options.sleep || (ms => new Promise(resolve => root.setTimeout(resolve, ms)));
            this.setTimer = options.setTimeout || root.setTimeout.bind(root);
            this.clearTimer = options.clearTimeout || root.clearTimeout.bind(root);
            this.decoder = new TextDecoder();
            io.onData(bytes => { this.text += this.decoder.decode(bytes, { stream: true }); this.check(); });
            io.onClose(() => { this.closed = true; this.check(); });
        }
        check() {
            const waiter = this.waiter;
            if (!waiter) return;
            const at = this.text.indexOf(waiter.token);
            if (at !== -1) {
                const before = this.text.slice(0, at);
                this.text = this.text.slice(at + waiter.token.length);
                this.finish(null, before);
            } else if (this.closed) {
                this.finish(new FlashError(null, 'USB 연결이 끊겼어요.', 'closed'));
            }
        }
        finish(error, value) {
            const waiter = this.waiter;
            this.waiter = null;
            this.clearTimer(waiter.timer);
            if (error) waiter.reject(error); else waiter.resolve(value);
        }
        waitFor(token, timeout) {
            if (this.waiter) return Promise.reject(new Error('앞의 기다림이 끝나지 않았습니다.'));
            return new Promise((resolve, reject) => {
                this.waiter = { token, resolve, reject, timer: this.setTimer(() => {
                    this.finish(new FlashError(null, '보드가 제때 대답하지 않았어요.', 'timeout'));
                }, timeout) };
                this.check();
            });
        }
        drop() { this.text = ''; }
        async send(text) {
            if (this.closed) throw new FlashError(null, 'USB 연결이 끊겼어요.', 'closed');
            const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
            for (let i = 0; i < bytes.length; i += WRITE_PIECE) {
                await this.io.write(bytes.subarray(i, i + WRITE_PIECE));
                if (bytes.length > WRITE_PIECE) await this.sleep(10);
            }
        }
        // 원시 REPL 에서 코드 한 덩어리 실행 → 화면에 찍은 글. 보드 오류는 FlashError('board').
        async exec(code, timeout = 5000) {
            await this.send(code);
            await this.send('\x04');
            await this.waitFor('OK', timeout);   // 앞에 남은 글(프롬프트 등)은 버린다
            const out = await this.waitFor('\x04', timeout);
            const err = await this.waitFor('\x04', timeout);
            await this.waitFor('>', timeout);
            if (err.trim()) throw new FlashError(null, '보드가 오류를 냈어요.', err.trim().split('\n').slice(-1)[0]);
            return out;
        }
    }

    // 원시 REPL 로 들어가기. 돌던 main.py 는 Ctrl-C 로 멈춘다(두 번까지 해 봄).
    async function enterRaw(link, timeout = 2500) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            await link.send('\r\x03\x03');
            await link.sleep(300);
            link.drop();
            await link.send('\r\x01');
            try {
                await link.waitFor(RAW_PROMPT, timeout);
                return;
            } catch (error) {
                if (link.closed || attempt === 3) throw error;
            }
        }
    }

    function line(out, tag) {
        const found = out.split(/\r?\n/).find(text => text.startsWith(tag + ' '));
        return found ? found.slice(tag.length + 1).trim() : null;
    }

    // files: [{ name, bytes(Uint8Array) }] — FILES 순서. onProgress({ stage, file, done, total, note })
    async function flash(io, files, options = {}) {
        const progress = options.onProgress || (() => {});
        const link = new Link(io, options);
        let stage = 'connect';
        const fail = (error, message) => {
            if (error instanceof FlashError && error.stage) return error;
            const closed = link.closed || (error && error.detail === 'closed');
            const wrapped = new FlashError(stage, closed ? 'USB 연결이 끊겼어요.' : (message || (error && error.message) || String(error)),
                closed ? 'closed' : (error && error.detail) || '');
            return wrapped;
        };
        const expected = versionOf(new TextDecoder().decode(files.find(file => file.name === 'main.py').bytes));
        try {
            progress({ stage });
            await enterRaw(link, options.rawTimeout);

            stage = 'check';
            progress({ stage });
            await link.exec(PRELUDE);
            const info = line(await link.exec('_i()'), 'I') || '';
            const [bluetooth, machine] = info.split(' ');
            if (bluetooth !== '1') {
                throw new FlashError(stage, '이 보드의 MicroPython 에는 블루투스가 없어요. Pico 2 W 용 MicroPython(RPI_PICO2_W) 을 먼저 올리세요.',
                    machine || '');
            }
            const before = (line(await link.exec('_ls()'), 'L') || '').split('/');
            const hadBoard = before.includes(KEEP);
            const free = Number(line(await link.exec('_fs()'), 'F'));
            const need = files.reduce((sum, file) => sum + file.bytes.length, 0) + 8192;
            if (Number.isFinite(free) && free < need) {
                throw new FlashError(stage, `보드 저장 공간이 모자라요 (남은 ${Math.floor(free / 1024)} KB, 필요 ${Math.ceil(need / 1024)} KB). 쓰지 않는 파일을 Thonny 로 지운 뒤 다시 하세요.`);
            }

            stage = 'write';
            const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
            let done = 0;
            for (const [index, file] of files.entries()) {
                const temp = file.name + TEMP;
                progress({ stage, file: file.name, index, count: files.length, done, total });
                await link.exec(`_d(${JSON.stringify(temp)})`);
                await link.exec(`_o(${JSON.stringify(temp)})`);
                for (let offset = 0; offset < file.bytes.length; offset += CHUNK) {
                    const piece = file.bytes.subarray(offset, offset + CHUNK);
                    await link.exec(`_w("${toBase64(piece)}")`);
                    done += piece.length;
                    progress({ stage, file: file.name, index, count: files.length, done, total });
                }
                await link.exec('_c()');
                const [size, hash] = (line(await link.exec(`_h(${JSON.stringify(temp)})`, 15000), 'H') || '').split(' ');
                const want = await sha256Hex(file.bytes);
                if (Number(size) !== file.bytes.length || (hash && hash !== '-' && want && hash !== want)) {
                    throw new FlashError(stage, `「${file.name}」 확인이 맞지 않아요 (보드 ${size} 바이트, 사이트 ${file.bytes.length} 바이트). 다시 하기를 누르세요.`,
                        file.name);
                }
                file.checked = hash && hash !== '-' ? 'sha256' : 'size';
            }

            stage = 'install';
            progress({ stage });
            for (const file of files) await link.exec(`_m(${JSON.stringify(file.name + TEMP)},${JSON.stringify(file.name)})`);
            const after = (line(await link.exec('_ls()'), 'L') || '').split('/');
            const missing = FILES.filter(name => !after.includes(name));
            if (missing.length) throw new FlashError(stage, `보드에 ${missing.join(', ')} 이(가) 없어요. 다시 하기를 누르세요.`);
            const boardKept = !hadBoard || after.includes(KEEP);

            stage = 'reboot';
            progress({ stage });
            link.drop();
            await link.send('\x02');               // 원시 REPL 에서 나오기
            try { await link.waitFor('>>> ', 2000); } catch (error) { if (link.closed) throw error; }
            link.drop();
            await link.send('\x04');               // 다시 켜기(soft reset) → main.py 실행
            let running = null;
            try {
                await link.waitFor('[BOOT] Firmware: ', options.bootTimeout ?? 20000);
                running = (await link.waitFor('\n', 3000)).trim();
            } catch (error) {
                if (link.closed) running = null;
            }
            return { expected, running, rebooted: running !== null, matches: running === expected,
                hadBoard, boardKept, checked: files.map(file => file.checked) };
        } catch (error) {
            throw fail(error);
        }
    }

    function friendly(error) {
        const stage = error && error.stage;
        const name = (STAGES.find(item => item[0] === stage) || [null, '준비'])[1];
        if (error && error.detail === 'closed') {
            return `「${name}」 단계에서 USB 연결이 끊겼어요. 케이블을 다시 꽂고 [다시 하기] 를 누르세요.`
                + (stage === 'install' ? ' (파일을 바꾸던 중이라 꼭 다시 해야 해요.)' : ' 보드에 있던 펌웨어는 그대로예요.');
        }
        if (stage === 'connect' && (error.detail === 'pick' || error.detail === 'open')) return error.message;
        if (stage === 'connect') {
            return '보드가 대답하지 않아요. Thonny 같은 다른 프로그램이 보드를 쓰고 있으면 닫고, USB 를 뽑았다 꽂은 뒤 [다시 하기] 를 누르세요. '
                + 'MicroPython 이 아직 없는 보드라면 아래 「MicroPython 이 없는 보드」 안내를 따르세요.';
        }
        const extra = error && error.detail && error.detail !== 'timeout' && !/[가-힣]/.test(error.detail) ? ` (보드 메시지: ${error.detail})` : '';
        return `「${name}」 단계에서 멈췄어요: ${error && error.message || error}${extra}`
            + (stage === 'install' ? ' 파일을 바꾸던 중이라 꼭 [다시 하기] 를 하세요.' : '');
    }

    // ---------- Web Serial 연결 ----------

    async function openSerial(serial) {
        const port = await serial.requestPort({ filters: [{ usbVendorId: 0x2E8A }] });
        await port.open({ baudRate: 115200 });
        const handlers = { data: () => {}, close: () => {} };
        const writer = port.writable.getWriter();
        const reader = port.readable.getReader();
        let open = true;
        (async () => {
            try {
                for (;;) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (value) handlers.data(value);
                }
            } catch (error) { /* 끊김 */ }
            open = false;
            handlers.close();
        })();
        return {
            onData(fn) { handlers.data = fn; },
            onClose(fn) { handlers.close = fn; if (!open) fn(); },
            async write(bytes) { await writer.write(bytes); },
            async close() {
                try { await reader.cancel(); } catch (error) { /* 이미 닫힘 */ }
                try { reader.releaseLock(); } catch (error) { /* 이미 풀림 */ }
                try { writer.releaseLock(); } catch (error) { /* 이미 풀림 */ }
                try { await port.close(); } catch (error) { /* 이미 닫힘 */ }
            },
        };
    }

    async function fetchFiles(fetcher, base = BASE) {
        const files = [];
        for (const name of FILES) {
            const response = await fetcher(base + name, { cache: 'no-store' });
            if (!response.ok) throw new FlashError('files', `사이트에서 ${name} 을(를) 받지 못했어요 (HTTP ${response.status}). 인터넷 연결을 확인하세요.`);
            files.push({ name, bytes: new Uint8Array(await response.arrayBuffer()) });
        }
        return files;
    }

    // ---------- 화면 (projects/board-setup.html 의 #usb) ----------

    function initPage(doc, env) {
        const box = doc.getElementById('usbFlash');
        if (!box) return;
        const $ = id => doc.getElementById(id);
        const button = $('flashButton');
        const status = $('flashStatus');
        const steps = $('flashSteps');
        const bar = $('flashProgress');
        const result = $('flashResult');
        const latest = env.PicoFirmware ? env.PicoFirmware.LATEST : '';
        if ($('flashLatest')) $('flashLatest').textContent = latest;
        let busy = false;
        let io = null;

        const items = new Map();
        steps.innerHTML = '';
        for (const [key, label] of STAGES) {
            const li = doc.createElement('li');
            li.dataset.stage = key;
            li.textContent = '○ ' + label;
            steps.appendChild(li);
            items.set(key, { li, label });
        }
        function mark(stage, state, extra) {
            let passed = true;
            for (const [key, item] of items) {
                let sign = '○';
                if (key === stage) { sign = state === 'fail' ? '✗' : state === 'done' ? '✓' : '⏳'; passed = false; }
                else if (passed && stage) sign = '✓';
                if (stage === null) sign = state === 'done' ? '✓' : '○';
                item.li.textContent = sign + ' ' + item.label + (key === stage && extra ? ' — ' + extra : '');
                item.li.className = key === stage ? 'now ' + state : '';
            }
        }

        if (!env.navigator.serial) {
            button.disabled = true;
            status.textContent = '이 브라우저는 USB 연결(Web Serial)을 지원하지 않아요. PC 의 크롬이나 엣지에서 이 화면을 여세요. (아이폰·아이패드·안드로이드·사파리는 안 됩니다.)';
            return;
        }

        button.addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            button.disabled = true;
            result.hidden = true;
            result.className = 'setup-result';
            bar.value = 0;
            let stage = 'files';
            mark(stage, 'now');
            status.textContent = '사이트에서 펌웨어 파일을 받는 중…';
            try {
                const files = await fetchFiles(env.fetch.bind(env));
                stage = 'connect';
                mark(stage, 'now');
                status.textContent = '목록에서 Pico 보드(「Board CDC」 또는 「Pico」 같은 이름)를 고르세요.';
                try {
                    io = await openSerial(env.navigator.serial);
                } catch (error) {
                    if (error && error.name === 'NotFoundError') {
                        throw new FlashError('connect', '보드를 고르지 않았어요. 목록이 비어 있으면 USB 케이블이 「데이터용」 인지, 보드에 MicroPython 이 깔려 있는지 확인하세요.', 'pick');
                    }
                    throw new FlashError('connect', 'USB 포트를 열지 못했어요. Thonny 같은 다른 프로그램이나 다른 탭이 보드를 쓰고 있으면 닫고 다시 하세요.', 'open');
                }
                const outcome = await flash(io, files, {
                    onProgress(info) {
                        stage = info.stage;
                        if (info.stage === 'write') {
                            mark('write', 'now', `${info.index + 1}/${info.count} ${info.file}`);
                            bar.value = Math.round(100 * info.done / info.total);
                            status.textContent = `「${info.file}」 쓰는 중… (${info.index + 1}/${info.count}) USB 를 뽑지 마세요.`;
                        } else {
                            mark(info.stage, 'now');
                            if (info.stage === 'install') bar.value = 100;
                            status.textContent = (items.get(info.stage) || { label: '' }).label + '…';
                        }
                    }
                });
                mark(null, 'done');
                result.hidden = false;
                if (outcome.matches) {
                    result.textContent = `✅ 다 됐어요. 보드가 새 펌웨어(${outcome.running})로 다시 켜졌습니다.`
                        + (outcome.hadBoard ? ' 보드 번호는 그대로 남아 있어요.' : '')
                        + ' 이제 USB 를 뽑고 위의 [보드 연결]로 블루투스 연결을 확인해 보세요.';
                } else if (outcome.rebooted) {
                    result.className = 'setup-result warn';
                    result.textContent = `⚠ 파일은 올렸지만 보드가 다른 판(${outcome.running})으로 켜졌어요. USB 를 뽑았다 꽂은 뒤 [다시 하기] 를 해 보세요.`;
                } else {
                    result.className = 'setup-result warn';
                    result.textContent = `파일 네 개를 올리고 확인했어요(${outcome.expected}). 다시 켜졌는지는 확인하지 못했어요 — USB 를 뽑았다 꽂으면 새 펌웨어로 시작합니다. 그 뒤 [보드 연결]로 판을 확인하세요.`;
                }
                if (!outcome.boardKept) result.textContent += ' (보드 번호 파일이 보이지 않아요. 번호를 다시 정하세요.)';
                status.textContent = '끝났어요.';
                button.textContent = '🔌 다른 보드에 올리기';
            } catch (error) {
                const shown = error instanceof FlashError ? error : new FlashError(stage, error && error.message || String(error));
                if (!shown.stage) shown.stage = stage;
                mark(shown.stage, 'fail');
                result.hidden = false;
                result.className = 'setup-result fail';
                result.textContent = friendly(shown);
                status.textContent = '멈췄어요.';
                button.textContent = '🔁 다시 하기';
            } finally {
                if (io) { await io.close(); io = null; }
                busy = false;
                button.disabled = false;
            }
        });
    }

    const api = { FILES, KEEP, TEMP, BASE, UF2_URL, STAGES, PRELUDE, FlashError, Link, flash, friendly, versionOf,
        toBase64, sha256Hex, openSerial, fetchFiles, initPage };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        root.PicoFlash = api;
        if (root.document) root.document.addEventListener('DOMContentLoaded', () => initPage(root.document, root));
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
