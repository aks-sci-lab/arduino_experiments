// Pico 센서 보드 펌웨어의 판 확인 (블루투스로 연결하는 모든 페이지 공용).
// - LATEST: 사이트가 가진 최신 판. firmware/pico2w-environment/main.py 의 FIRMWARE_VERSION 과 같아야 한다
//   (tests/pico-firmware.test.cjs 가 확인). 펌웨어 판을 올리면 HISTORY 맨 뒤에 예전 판을 더하고 LATEST 를 바꾼다.
// - probe(tx, cmd): 페이지가 자기 알림을 붙이기 "전에" GET_BOARD 를 한 번 보내 판을 읽는다.
//   아주 예전 펌웨어는 GET_BOARD 를 몰라 "Unknown command" 오류를 돌려주므로 그것도 '예전 판'으로 본다.
// - showNotice(결과, 자리): 예전 판이면 한 줄 안내(측정은 막지 않음).
(function (root) {
    'use strict';

    const LATEST = '2026.11-usb';
    const HISTORY = ['2026.11-board', '2026.11-iv'];   // 예전 판 (오래된 것부터)
    const SETUP_PAGE = 'board-setup.html#usb';

    // fw 글자 → 'latest' | 'old' | 'none'(판을 안 알려 줌 = 아주 예전) | 'newer'(사이트보다 새 판, 개발 중)
    function compare(fw) {
        if (fw === undefined || fw === null || fw === '') return 'none';
        const text = String(fw);
        if (text === LATEST) return 'latest';
        if (HISTORY.includes(text)) return 'old';
        // 모르는 판: 앞의 '연.월' 로 견준다. 같거나 앞이면 예전, 뒤면 새 판.
        const month = value => {
            const match = /^(\d{4})\.(\d{1,2})/.exec(value);
            return match ? Number(match[1]) * 100 + Number(match[2]) : null;
        };
        const mine = month(text), latest = month(LATEST);
        if (mine === null) return 'old';
        return mine > latest ? 'newer' : 'old';
    }

    function message(result) {
        if (!result || (result.state !== 'old' && result.state !== 'none')) return '';
        const from = result.state === 'none' ? '판 정보 없음' : result.fw;
        return '⚠ 보드 펌웨어가 예전 판이에요 (' + from + ' → ' + LATEST + '). '
            + '보드 번호 정하기 화면에서 올리세요. 측정은 지금처럼 할 수 있어요.';
    }

    // GET_BOARD 를 보내고 답(board 또는 error 한 줄)을 기다린다. 판을 못 읽으면 state 'unknown'.
    // tx: 알림 특성, cmd: 쓰기 특성 (Web Bluetooth). 페이지의 수신기보다 먼저 부른다.
    async function probe(tx, cmd, options = {}) {
        const timeout = options.timeout ?? 2500;
        const setTimer = options.setTimeout || root.setTimeout.bind(root);
        const clearTimer = options.clearTimeout || root.clearTimeout.bind(root);
        if (!tx || !cmd || typeof cmd.writeValueWithResponse !== 'function') return { state: 'unknown', fw: null };
        let buffer = '';
        let listener = null, timer = null;
        const decoder = new TextDecoder();
        const done = new Promise(resolve => {
            listener = event => {
                const view = event.target.value;
                buffer += decoder.decode(view instanceof DataView
                    ? new Uint8Array(view.buffer, view.byteOffset, view.byteLength) : view, { stream: true });
                if (buffer.length > 4096) buffer = buffer.slice(-2048);
                let newline;
                while ((newline = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, newline).trim();
                    buffer = buffer.slice(newline + 1);
                    let packet = null;
                    try { packet = JSON.parse(line); } catch (error) { continue; }
                    if (packet && packet.type === 'board') {
                        const fw = packet.data && typeof packet.data.fw === 'string' ? packet.data.fw : null;
                        resolve({ state: compare(fw), fw });
                        return;
                    }
                    if (packet && packet.type === 'error') {
                        resolve({ state: 'none', fw: null });
                        return;
                    }
                }
            };
            timer = setTimer(() => resolve({ state: 'unknown', fw: null }), timeout);
        });
        tx.addEventListener('characteristicvaluechanged', listener);
        try {
            await tx.startNotifications();
            await cmd.writeValueWithResponse(new TextEncoder().encode('GET_BOARD'));
            return await done;
        } catch (error) {
            return { state: 'unknown', fw: null };
        } finally {
            clearTimer(timer);
            tx.removeEventListener('characteristicvaluechanged', listener);
        }
    }

    // anchor 바로 뒤에 안내 한 줄을 넣거나 고친다. 최신이면 지운다.
    function showNotice(result, anchor, options = {}) {
        if (!anchor || !anchor.ownerDocument) return null;
        const doc = anchor.ownerDocument;
        // 상태 글이 <span> 이면 그 글을 담은 덩어리 바로 뒤에 둔다.
        if (anchor.closest) anchor = anchor.closest('p, div, li, section, td') || anchor;
        let box = anchor.nextElementSibling && anchor.nextElementSibling.classList
            && anchor.nextElementSibling.classList.contains('fw-notice') ? anchor.nextElementSibling : null;
        const text = message(result);
        if (!text) { if (box) box.remove(); return null; }
        if (!box) {
            box = doc.createElement('p');
            box.className = 'fw-notice';
            box.setAttribute('role', 'status');
            box.style.cssText = 'background:var(--c-warn-bg,#fff3cd);color:var(--c-warn-text,#7a5b00);'
                + 'border-radius:8px;padding:8px 12px;margin:8px 0;font-weight:600;overflow-wrap:anywhere;';
            anchor.insertAdjacentElement('afterend', box);
        }
        box.textContent = text + ' ';
        const link = doc.createElement('a');
        link.href = options.href || SETUP_PAGE;
        link.textContent = '보드 번호 정하기 화면 열기';
        box.appendChild(link);
        return box;
    }

    const api = { LATEST, HISTORY, SETUP_PAGE, compare, message, probe, showNotice };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PicoFirmware = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
