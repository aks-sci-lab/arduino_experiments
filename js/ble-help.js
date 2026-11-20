// 블루투스 페이지 공통 도우미 (전역 이름: BleHelp) — 블루투스로 센서를 연결하는 모든 페이지가 불러온다
//  ① 아이폰·아이패드: 브라우저에 웹 블루투스가 없으면, 연결 단추(data-ble-connect)를 누를 때
//     'Bluefy 앱으로 이 주소를 여세요' 안내와 주소 복사 단추를 보여 준다.
//     Bluefy 처럼 navigator.bluetooth 를 주는 앱 안에서 열리면 아무것도 막지 않는다 (그대로 연결).
//     안드로이드·PC 에서 블루투스가 없을 때는 페이지의 기존 안내(크롬·엣지 쓰기)를 그대로 둔다.
//  ② 페이지를 떠날 때(pagehide, 보조로 beforeunload) 이 페이지가 연결한 블루투스 기기를 모두 끊는다.
//     보드가 곧바로 다시 광고해서 다음 페이지에서 찾을 수 있게. 뒤로 가기 캐시(bfcache)로 돌아오면 다시 연결 안내.
//  ③ 연결한 기기는 navigator.bluetooth.requestDevice 를 감싸서 저절로 기억한다 (페이지 코드는 고치지 않아도 됨).
// 페이지에서 쓸 것: 연결 단추에 data-ble-connect 속성. 필요하면 BleHelp.guard() 가 false 면 연결하지 않기.
(function (root) {
    'use strict';
    const doc = root.document;
    const devices = new Set();
    let leftConnected = false;

    function isIOS() {
        const nav = root.navigator || {};
        const ua = nav.userAgent || '';
        // 아이패드는 '데스크톱 사이트'로 Macintosh 라고 나오므로 터치로 가린다
        return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
    }
    const hasBluetooth = () => !!(root.navigator && root.navigator.bluetooth && root.navigator.bluetooth.requestDevice);
    const needsBluefy = () => isIOS() && !hasBluetooth();

    // ---------- ① Bluefy 안내 ----------
    function copyText(text) {
        if (root.navigator.clipboard && root.navigator.clipboard.writeText) return root.navigator.clipboard.writeText(text);
        return new Promise((resolve, reject) => {
            const t = doc.createElement('textarea');
            t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
            doc.body.appendChild(t); t.select();
            try { doc.execCommand('copy') ? resolve() : reject(new Error('copy')); } catch (e) { reject(e); } finally { t.remove(); }
        });
    }
    function showBluefy() {
        let box = doc.getElementById('bleHelpBluefy');
        if (!box) {
            box = doc.createElement('div');
            box.id = 'bleHelpBluefy';
            box.className = 'ble-help';
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-labelledby', 'bleHelpTitle');
            box.innerHTML =
                '<div class="ble-help-card">' +
                '<h2 id="bleHelpTitle">📱 아이폰에서는 블루투스 앱으로 열어 주세요</h2>' +
                '<p>아이폰·아이패드의 사파리·크롬은 웹 블루투스를 지원하지 않아 센서를 연결할 수 없어요.</p>' +
                '<ol>' +
                '<li>App Store 에서 <b>Bluefy</b> 를 검색해 <b>“Bluefy – Web BLE Browser”</b> 앱(무료)을 설치하세요. 다른 회사가 만든 앱이며 우리 사이트가 보증하지 않아요.</li>' +
                '<li>아래 <b>📋 주소 복사</b>를 누르고, Bluefy 를 열어 주소 칸에 붙여 넣으세요.</li>' +
                '<li>Bluefy 안에서 이 페이지의 연결 단추를 다시 누르세요.</li>' +
                '</ol>' +
                '<input type="text" class="ble-help-url" readonly aria-label="이 페이지 주소">' +
                '<p class="ble-help-msg" role="status" aria-live="polite"></p>' +
                '<div class="ble-help-row"><button type="button" class="ble-help-copy">📋 주소 복사</button>' +
                '<button type="button" class="ble-help-close">닫기</button></div>' +
                '</div>';
            doc.body.appendChild(box);
            box.querySelector('.ble-help-copy').addEventListener('click', () => {
                const msg = box.querySelector('.ble-help-msg');
                copyText(root.location.href).then(() => { msg.textContent = '✓ 주소를 복사했어요. Bluefy 주소 칸에 붙여 넣으세요.'; },
                    () => { box.querySelector('.ble-help-url').select(); msg.textContent = '복사가 안 되면 위 주소를 길게 눌러 복사하세요.'; });
            });
            box.querySelector('.ble-help-close').addEventListener('click', () => { box.hidden = true; });
            box.addEventListener('click', e => { if (e.target === box) box.hidden = true; });
        }
        box.querySelector('.ble-help-url').value = root.location.href;   // ?c=·?s= 까지 지금 주소 그대로
        box.querySelector('.ble-help-msg').textContent = '';
        box.hidden = false;
        box.querySelector('.ble-help-copy').focus();
        return box;
    }
    // 연결하기 전에 부르면: 아이폰에서 블루투스가 없으면 안내를 띄우고 false
    function guard() {
        if (needsBluefy()) { showBluefy(); return false; }
        return true;
    }

    function hookButtons() {
        if (!needsBluefy()) return;
        // 연결 단추를 누르면 페이지 코드보다 먼저 받아 안내를 띄운다
        doc.addEventListener('click', e => {
            const b = e.target.closest && e.target.closest('[data-ble-connect]');
            if (!b || !needsBluefy()) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            showBluefy();
        }, true);
        // 페이지가 '지원 안 됨'으로 단추를 꺼 두어도 아이폰에서는 눌러서 안내를 볼 수 있게
        const enable = b => { if (b.disabled) b.disabled = false; b.setAttribute('aria-describedby', 'bleHelpBluefy'); };
        const all = () => doc.querySelectorAll('[data-ble-connect]').forEach(enable);
        all();
        new MutationObserver(all).observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['disabled'], childList: true });
    }

    // ---------- ②·③ 연결한 기기 기억, 떠날 때 끊기 ----------
    function track(device) {
        if (device && device.gatt) devices.add(device);
        return device;
    }
    function wrapRequestDevice() {
        if (!hasBluetooth()) return;
        const bt = root.navigator.bluetooth;
        if (bt.__bleHelpWrapped) return;
        const original = bt.requestDevice;
        try {
            bt.requestDevice = function () { return original.apply(bt, arguments).then(track); };
            bt.__bleHelpWrapped = true;
        } catch (e) { /* 감쌀 수 없는 브라우저: 페이지가 BleHelp.track(기기) 를 부르면 됨 */ }
    }
    function disconnectAll() {
        let n = 0;
        devices.forEach(d => {
            try { if (d.gatt && d.gatt.connected) { d.gatt.disconnect(); n++; } } catch (e) { /* 이미 끊김 */ }
        });
        return n;
    }
    function onLeave() { if (disconnectAll()) leftConnected = true; }
    function onShow(e) {
        // 뒤로 가기 캐시에서 돌아온 경우: 떠날 때 끊었으니 다시 연결해야 함
        if (!e.persisted || !leftConnected) return;
        leftConnected = false;
        let note = doc.getElementById('bleHelpReconnect');
        if (!note) {
            note = doc.createElement('div');
            note.id = 'bleHelpReconnect';
            note.className = 'ble-help-note';
            note.setAttribute('role', 'status');
            note.innerHTML = '<span>🔌 페이지를 떠날 때 블루투스 연결을 끊었어요. 센서를 쓰려면 연결 단추를 다시 눌러 주세요.</span><button type="button">닫기</button>';
            note.querySelector('button').addEventListener('click', () => { note.hidden = true; });
            doc.body.prepend(note);
        }
        note.hidden = false;
    }

    function addStyle() {
        if (doc.getElementById('bleHelpStyle')) return;
        const s = doc.createElement('style');
        s.id = 'bleHelpStyle';
        s.textContent =
            '.ble-help{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}' +
            '.ble-help[hidden]{display:none}' +
            '.ble-help-card{background:var(--c-card,#fff);color:var(--c-text,#1f2933);border-radius:var(--r-card,10px);padding:16px;max-width:480px;width:100%;max-height:90vh;overflow:auto;font-family:var(--font,sans-serif)}' +
            '.ble-help-card h2{font-size:1.1rem;margin:0 0 8px}.ble-help-card p,.ble-help-card li{font-size:.95rem;line-height:1.5}' +
            '.ble-help-card ol{padding-left:1.3em;margin:8px 0}' +
            '.ble-help-url{width:100%;min-height:44px;padding:8px;font-size:.85rem;border:1px solid var(--c-line,#e3e7ec);border-radius:var(--r-ctl,6px);box-sizing:border-box}' +
            '.ble-help-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}' +
            '.ble-help-row button,.ble-help-note button{min-height:44px;padding:8px 14px;border-radius:var(--r-ctl,6px);border:1px solid var(--c-line,#e3e7ec);background:var(--c-card,#fff);font-size:1rem;cursor:pointer}' +
            '.ble-help-copy{background:var(--c-primary,#1565c0)!important;border-color:var(--c-primary,#1565c0)!important;color:#fff}' +
            '.ble-help-msg{min-height:1.2em;color:var(--c-ok-text,#1e6b34);margin:6px 0 0}' +
            '.ble-help-note{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;margin:8px;background:var(--c-warn-bg,#fff3cd);color:var(--c-warn-text,#7a5b00);border-radius:var(--r-card,10px);font-family:var(--font,sans-serif)}' +
            '.ble-help-note span{flex:1 1 200px}';
        doc.head.appendChild(s);
    }

    function init() {
        addStyle();
        hookButtons();
    }
    wrapRequestDevice();
    root.addEventListener('pagehide', onLeave);
    root.addEventListener('beforeunload', onLeave);
    root.addEventListener('pageshow', onShow);
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();

    root.BleHelp = { isIOS, needsBluefy, showBluefy, guard, track, disconnectAll, devices: () => Array.from(devices) };
})(typeof globalThis !== 'undefined' ? globalThis : this);
