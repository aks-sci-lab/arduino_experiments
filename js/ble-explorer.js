// 시판 블루투스 센서 해석 도구 — 화면 (projects/ble-explorer.html)
// 계산은 js/ble-decode.js(BleDecode). 기록·규칙은 이 브라우저(localStorage)와 내려받은 파일에만 남는다.
(function () {
    'use strict';
    const B = window.BleDecode;
    const $ = id => document.getElementById(id);
    const KEY_SVC = 'ble-explorer:services:v1';
    const KEY_DRAFT = 'ble-explorer:draft:v1';
    const KEY_SAVED = 'ble-explorer:saved:v1';
    const MAX_RECORDS = 5000;

    const S = {
        device: null,
        chars: new Map(),        // 특성 UUID → { uuid, service, obj, props, notifying, onValue, lastHex }
        charService: {},         // 특성 UUID → 서비스 UUID (기록 파일·규칙에서도 채움)
        records: [],             // { t(초), at(ISO), char, bytes }
        t0: null,
        paused: false,
        rules: {},               // 특성 UUID → 필드 목록
        truths: {},              // 특성 UUID → [{ truth, bytes, t }]
        meta: { deviceName: '', maker: '', model: '', firmware: '' },
        candidates: [],
        events: [],              // 연결 기록: { at(ISO), kind, text } — 끊긴 시각을 선생님이 보내 줄 수 있게
        initCommands: [],        // 연결 뒤 순서대로 보낼 시작 명령 목록 (규칙 JSON 에 함께 저장)
        connectedAt: null,
        gdxCounter: 0xff,
        dirty: true
    };

    // ---------- 작은 도구 ----------
    const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null ? d : v; } catch (e) { return d; } };
    const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
    const charLabel = u => { const n = B.knownName(u); return B.shortUuid(u) + (n ? ' ' + n : ''); };
    const fmtNum = v => (v === null || v === undefined || !Number.isFinite(v)) ? '—' : String(Number(v.toPrecision(8)));
    function setStatus(text, kind) {
        const el = $('status');
        el.textContent = text;
        el.className = 'dash-status' + (kind ? ' ' + kind : '');
    }
    function download(name, text, type) {
        const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const printable = bytes => {
        if (!bytes.length || !Array.from(bytes).every(b => b >= 32 && b < 127)) {
            try { const t = new TextDecoder('utf-8', { fatal: true }).decode(bytes); return /^[\P{C}\s]+$/u.test(t) ? t : ''; } catch (e) { return ''; }
        }
        return String.fromCharCode.apply(null, Array.from(bytes));
    };

    // ---------- ① 연결·탐색 ----------
    const svcPrefs = load(KEY_SVC, { off: [], on: [], custom: '' });
    function renderServiceChoices() {
        $('stdServices').innerHTML = B.STANDARD_SERVICES.map((s, i) => {
            const u = B.normUuid(s.uuid);
            const on = svcPrefs.on.includes(u) || (s.on && !svcPrefs.off.includes(u));
            return '<label><input type="checkbox" data-svc="' + esc(u) + '"' + (on ? ' checked' : '') + '> ' + esc(s.name) + ' <span class="note">' + esc(B.shortUuid(u)) + '</span></label>';
        }).join('');
        $('customUuids').value = svcPrefs.custom || '';
    }
    function saveServiceChoices() {
        svcPrefs.on = []; svcPrefs.off = [];
        document.querySelectorAll('#stdServices input[data-svc]').forEach(c => (c.checked ? svcPrefs.on : svcPrefs.off).push(c.dataset.svc));
        svcPrefs.custom = $('customUuids').value;
        store(KEY_SVC, svcPrefs);
        checkCustom();
    }
    function checkCustom() {
        const lines = $('customUuids').value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        const bad = lines.filter(l => !B.normUuid(l));
        $('uuidMsg').textContent = bad.length ? '⚠️ UUID 모양이 아니에요: ' + bad.join(', ') + ' (4자리 16진수 또는 8-4-4-4-12 모양)' : (lines.length ? '✓ 직접 넣은 서비스 ' + lines.length + '개' : '');
        return lines.map(B.normUuid).filter(Boolean);
    }
    function selectedServices() {
        const list = [];
        document.querySelectorAll('#stdServices input[data-svc]:checked').forEach(c => list.push(c.dataset.svc));
        checkCustom().forEach(u => { if (!list.includes(u)) list.push(u); });
        return list;
    }

    function checkSupport() {
        const el = $('support');
        if (!navigator.bluetooth) {
            const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
            el.className = 'box warn';
            el.textContent = ios
                ? '⚠️ 아이폰·아이패드 사파리는 Web Bluetooth 가 없어요. App Store 의 Bluefy 같은 블루투스 브라우저 앱으로 이 주소를 여세요.'
                : (location.protocol !== 'https:' && location.hostname !== 'localhost'
                    ? '⚠️ https 주소에서만 블루투스를 쓸 수 있어요.'
                    : '⚠️ 이 브라우저는 Web Bluetooth 를 지원하지 않아요. PC 크롬·엣지 또는 안드로이드 크롬을 쓰세요.');
            return false;
        }
        el.className = 'box ok';
        el.textContent = '✓ 이 브라우저는 블루투스를 쓸 수 있어요. 센서를 켜고 🔍 를 누르세요. 아래 기록은 ④ 저장에서 파일로 받을 수 있어요.';
        return true;
    }

    async function scan() {
        if (!checkSupport()) return;
        saveServiceChoices();
        const services = selectedServices();
        let device;
        try {
            setStatus('기기 고르는 창을 열었어요…');
            device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: services });
        } catch (e) {
            setStatus(e && e.name === 'NotFoundError' ? '기기를 고르지 않았어요.' : '기기 찾기 실패: ' + (e && e.message || e), e && e.name === 'NotFoundError' ? '' : 'error');
            return;
        }
        await disconnect(true);
        S.device = device;
        S.meta = { deviceName: device.name || '', maker: '', model: '', firmware: '' };
        await connectDevice(device);
    }

    // 고른 기기에 연결해 서비스·특성을 읽는다 (다시 연결할 때도 이것만 다시 부름 — 기기 고르는 창 없이)
    async function connectDevice(device) {
        device.removeEventListener('gattserverdisconnected', onDisconnected);
        device.addEventListener('gattserverdisconnected', onDisconnected);
        $('btnReconnect').hidden = true;
        S.chars.clear();
        try {
            setStatus('"' + (device.name || '이름 없는 기기') + '" 에 연결하는 중…');
            const server = await device.gatt.connect();
            let svcs = [];
            try { svcs = await server.getPrimaryServices(); } catch (e) { svcs = []; }
            const tree = [];
            for (const svc of svcs) {
                let chars = [];
                try { chars = await svc.getCharacteristics(); } catch (e) { chars = []; }
                const su = B.normUuid(svc.uuid) || svc.uuid;
                const node = { uuid: su, chars: [] };
                for (const c of chars) {
                    const cu = B.normUuid(c.uuid) || c.uuid;
                    const p = c.properties || {};
                    const info = { uuid: cu, service: su, obj: c, props: p, notifying: false, onValue: null, lastHex: '' };
                    S.chars.set(cu, info);
                    S.charService[cu] = su;
                    node.chars.push(info);
                }
                tree.push(node);
            }
            await readDeviceInfo();
            renderTree(tree);
            // 0x180A(기기 정보)·0x180F(배터리) 외에 실제 데이터 서비스가 없으면 숨긴 UUID 찾기 안내 표시
            const infoOnly = new Set([B.normUuid('180a'), B.normUuid('180f')]);
            const hasDataSvc = tree.some(t => !infoOnly.has(t.uuid) && t.chars.length > 0);
            if ($('uuidHelpBox')) $('uuidHelpBox').hidden = hasDataSvc;
            // 공개된 연결 방식이 있는 센서면 해석할 필요가 없다고 알림
            const vendor = B.knownVendor(device.name, tree.map(t => t.uuid));
            $('vendorNote').hidden = !vendor;
            if (vendor && vendor.id === 'vernier') {
                $('vendorNote').textContent = '✅ 이 센서는 버니어 공개 방식(Go Direct)으로 바로 쓸 수 있어요. 해석하지 않아도 됩니다 — 선생님이 만든 실험의 센서 기능에서 "Vernier Go Direct 센서"를 고르세요.';
            }
            S.connectedAt = performance.now();
            logEvent('connect', '연결됨: ' + (device.name || '이름 없는 기기') + ' · 서비스 ' + tree.length + '개');
            $('btnDisconnect').disabled = false;
            $('vernierBox').hidden = !(vendor && vendor.id === 'vernier');
            if (vendor && vendor.id === 'vernier' && $('vernierAuto').checked) await vernierInit();
            setStatus('✓ 연결됨: ' + (device.name || '이름 없는 기기') + ' · 서비스 ' + tree.length + '개', 'ok');
            if (!tree.length) setStatus('연결됐지만 열 수 있는 서비스가 없어요. 서비스 UUID 를 직접 넣고 다시 연결해 보세요.', 'error');
            refreshCharSelects();
        } catch (e) {
            setStatus('연결 실패: ' + (e && e.message || e), 'error');
            logEvent('error', '연결 실패: ' + (e && e.message || e));
            $('btnReconnect').hidden = false;
        }
    }

    // ---------- 연결 기록 ----------
    function logEvent(kind, text) {
        S.events.push({ at: new Date().toISOString(), kind, text });
        if (S.events.length > 200) S.events.shift();
        const list = $('eventLog');
        if (!list) return;
        list.innerHTML = S.events.slice().reverse().map(e => '<li><span class="note">' + esc(e.at.slice(11, 19)) + '</span> ' + esc(e.text) + '</li>').join('');
        $('eventBox').hidden = false;
    }
    const eventText = () => S.events.map(e => e.at + '\t' + e.kind + '\t' + e.text).join('\n');

    // ---------- 버니어 Go Direct: 연결 직후 공개 도구와 같은 처음 인사(init)·상태 묻기를 보낸다 ----------
    // 이 센서는 연결만 하고 명령을 받지 못하면 10초쯤 뒤 스스로 끊는 것으로 보여(선생님 실측), 같은 순서를 보낸다
    async function vernierInit() {
        const V = B.VERNIER;
        const cmd = S.chars.get(V.COMMAND), resp = S.chars.get(V.RESPONSE);
        const msg = $('vernierMsg');
        if (!cmd || !resp) { msg.textContent = '⚠ 버니어 명령·응답 특성을 찾지 못했어요. 서비스 고르기에 "Vernier Go Direct" 가 켜져 있는지 보세요.'; return false; }
        try {
            if (!resp.notifying) {
                const btn = document.querySelector('[data-notify="' + CSS.escape(V.RESPONSE) + '"]');
                await toggleNotify(V.RESPONSE, btn);   // 센서의 답도 기록에 남도록
            }
            for (const sub of [V.INIT, V.GET_STATUS]) {
                S.gdxCounter = (S.gdxCounter - 1) & 0xff;
                const packet = B.vernierCommand(sub, S.gdxCounter);
                for (let i = 0; i < packet.length; i += 20) {
                    const part = packet.slice(i, i + 20);
                    if (cmd.obj.writeValue) await cmd.obj.writeValue(part);
                    else await cmd.obj.writeValueWithResponse(part);
                }
            }
            msg.textContent = '✓ 버니어 처음 인사(init)·상태 묻기를 보냈어요 (' + new Date().toLocaleTimeString() + ').';
            logEvent('vernier-init', '버니어 처음 인사·상태 묻기 보냄');
            return true;
        } catch (e) {
            msg.textContent = '⚠ 보내기 실패: ' + (e && e.message || e);
            logEvent('error', '버니어 처음 인사 실패: ' + (e && e.message || e));
            return false;
        }
    }

    async function readDeviceInfo() {
        const names = { '2a29': 'maker', '2a24': 'model', '2a26': 'firmware' };
        const rows = [['이름', S.device.name || '(이름 없음)']];
        for (const short of B.DEVICE_INFO_CHARS) {
            const c = S.chars.get(B.normUuid(short));
            if (!c || !c.props.read) continue;
            try {
                const v = await c.obj.readValue();
                const text = new TextDecoder().decode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)).replace(/\0+$/, '');
                rows.push([B.knownName(short), text]);
                if (names[short]) S.meta[names[short]] = text;
            } catch (e) { rows.push([B.knownName(short), '(읽지 못함)']); }
        }
        $('devInfo').innerHTML = rows.map(r => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('');
        $('devName').textContent = '📶 ' + (S.device.name || '이름 없는 기기');
        $('deviceBox').hidden = false;
        if (!$('sensorName').value) $('sensorName').value = [S.meta.maker, S.meta.model].filter(Boolean).join(' ') || S.device.name || '';
    }

    function propText(p) {
        const out = [];
        if (p.read) out.push('읽기');
        if (p.notify) out.push('알림');
        if (p.indicate) out.push('확인 알림');
        if (p.write) out.push('쓰기');
        if (p.writeWithoutResponse) out.push('쓰기(답 없음)');
        return out.join(' · ') || '속성 없음';
    }
    function renderTree(tree) {
        $('tree').innerHTML = tree.map(svc => '<div class="svc"><div class="svc-head">' + esc(charLabel(svc.uuid)) +
            ' <span class="note">' + esc(svc.uuid) + '</span></div>' + (svc.chars.length ? svc.chars.map(c => {
            const p = c.props;
            const btns = [];
            if (p.read) btns.push('<button type="button" class="btn small" data-read="' + esc(c.uuid) + '">📖 읽기</button>');
            if (p.notify || p.indicate) btns.push('<button type="button" class="btn small" data-notify="' + esc(c.uuid) + '" aria-pressed="false">🔔 알림 켜기</button>');
            return '<div class="chr" data-chr="' + esc(c.uuid) + '"><span class="chr-name">' + esc(charLabel(c.uuid)) +
                '<br><span class="props">' + esc(propText(p)) + ' · ' + esc(c.uuid) + '</span></span>' + btns.join('') +
                '<span class="val" data-val="' + esc(c.uuid) + '"></span></div>';
        }).join('') : '<p class="note">특성이 없거나 열 수 없어요.</p>') + '</div>').join('');
    }

    async function readChar(uuid) {
        const c = S.chars.get(uuid);
        if (!c) return;
        try { addRecord(uuid, await c.obj.readValue(), true); }
        catch (e) { setStatus('읽기 실패 (' + B.shortUuid(uuid) + '): ' + (e && e.message || e), 'error'); }
    }
    async function toggleNotify(uuid, btn) {
        const c = S.chars.get(uuid);
        if (!c) return;
        try {
            if (c.notifying) {
                await c.obj.stopNotifications().catch(() => {});
                c.obj.removeEventListener('characteristicvaluechanged', c.onValue);
                c.notifying = false;
            } else {
                c.onValue = e => addRecord(uuid, e.target.value);
                c.obj.addEventListener('characteristicvaluechanged', c.onValue);
                await c.obj.startNotifications();
                c.notifying = true;
            }
        } catch (e) {
            setStatus('알림 켜기 실패 (' + B.shortUuid(uuid) + '): ' + (e && e.message || e), 'error');
        }
        if (btn) {
            btn.textContent = c.notifying ? '🔕 알림 끄기' : '🔔 알림 켜기';
            btn.classList.toggle('on', c.notifying);
            btn.setAttribute('aria-pressed', c.notifying ? 'true' : 'false');
        }
    }

    function addRecord(uuid, dv, force) {
        const bytes = new Uint8Array(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength));
        const c = S.chars.get(uuid);
        if (c) {
            c.lastHex = B.toHex(bytes);
            const el = document.querySelector('[data-val="' + CSS.escape(uuid) + '"]');
            if (el) { const t = printable(bytes); el.textContent = c.lastHex + (t ? '  “' + t + '”' : ''); }
        }
        if (S.paused && !force) return;
        if (S.t0 === null) S.t0 = performance.now();
        const isNew = !S.records.some(r => r.char === uuid);
        S.records.push({ t: (performance.now() - S.t0) / 1000, at: new Date().toISOString(), char: uuid, bytes });
        if (S.records.length > MAX_RECORDS) S.records.splice(0, S.records.length - MAX_RECORDS);
        if (isNew) refreshCharSelects();
        S.dirty = true;
    }

    function onDisconnected() {
        S.chars.forEach(c => { c.notifying = false; });
        document.querySelectorAll('[data-notify]').forEach(b => { b.textContent = '🔔 알림 켜기'; b.classList.remove('on'); b.disabled = true; });
        document.querySelectorAll('[data-read]').forEach(b => { b.disabled = true; });
        $('btnDisconnect').disabled = true;
        const after = S.connectedAt !== null ? (performance.now() - S.connectedAt) / 1000 : null;
        S.connectedAt = null;
        const when = new Date().toLocaleTimeString();
        const how = after !== null ? '끊김: ' + after.toFixed(1) + '초 만에 (' + when + ')' : '끊김 (' + when + ')';
        setStatus('⚠ ' + how + ' — 기록은 그대로 있어요. 🔄 다시 연결을 누르세요.', 'error');
        logEvent('disconnect', how);
        $('btnReconnect').hidden = !S.device;
    }
    async function disconnect(quiet) {
        const d = S.device;
        if (!d) return;
        d.removeEventListener('gattserverdisconnected', onDisconnected);
        for (const c of S.chars.values()) {
            if (c.notifying) { try { await c.obj.stopNotifications(); } catch (e) { /* 끊김 */ } }
            if (c.onValue) c.obj.removeEventListener('characteristicvaluechanged', c.onValue);
        }
        S.chars.clear();
        try { if (d.gatt.connected) d.gatt.disconnect(); } catch (e) { /* 무시 */ }
        S.device = null;
        $('btnDisconnect').disabled = true;
        if (!quiet) { onDisconnected(); setStatus('연결을 끊었어요. 기록은 그대로 있어요.'); }
        refreshCharSelects();
    }

    // ---------- 특성 고르기 칸 ----------
    function knownChars() {
        const set = [];
        const add = u => { if (u && !set.includes(u)) set.push(u); };
        S.records.forEach(r => add(r.char));
        Object.keys(S.rules).forEach(add);
        return set;
    }
    function fillSelect(sel, list, firstLabel) {
        const cur = sel.value;
        sel.innerHTML = (firstLabel !== undefined ? '<option value="">' + esc(firstLabel) + '</option>' : '') +
            list.map(u => '<option value="' + esc(u) + '">' + esc(charLabel(u)) + '</option>').join('');
        if (list.includes(cur) || (cur === '' && firstLabel !== undefined)) sel.value = cur;
        else if (list.length && firstLabel === undefined) {
            const withData = list.filter(u => S.records.some(r => r.char === u));
            sel.value = withData[0] || list[0];
        }
    }
    function refreshCharSelects() {
        const list = knownChars();
        fillSelect($('logChar'), list, '모든 특성');
        const before = $('ruleChar').value;
        fillSelect($('ruleChar'), list);
        // 직접 고르기 전에는 기록이 가장 많은 특성(보통 알림으로 값을 보내는 곳)을 고름
        if (!S.ruleCharChosen && list.length) {
            const counts = {};
            S.records.forEach(r => { counts[r.char] = (counts[r.char] || 0) + 1; });
            const best = list.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0];
            if (counts[best]) $('ruleChar').value = best;
        }
        if ($('ruleChar').value !== before) renderFields();
        const writable = Array.from(S.chars.values()).filter(c => c.props.write || c.props.writeWithoutResponse).map(c => c.uuid);
        fillSelect($('writeChar'), writable);
        $('writeChar').disabled = !writable.length;
        $('ruleEmpty').hidden = list.length > 0;
        $('btnWrite').disabled = !(writable.length && $('writeOk').checked);
        if ($('btnAddInitCmd')) $('btnAddInitCmd').disabled = !writable.length;
        if ($('btnRunInitCmds')) $('btnRunInitCmds').disabled = !(S.initCommands.length && writable.length && $('writeOk').checked);
        S.dirty = true;
    }

    // ---------- ② 기록 ----------
    function hexWithMarks(bytes, changing) {
        return Array.from(bytes, (b, i) => {
            const h = b.toString(16).padStart(2, '0').toUpperCase();
            return changing && changing[i] ? '<span class="chg">' + h + '</span>' : h;
        }).join(' ');
    }
    function renderLog() {
        const filter = $('logChar').value;
        const recs = filter ? S.records.filter(r => r.char === filter) : S.records;
        // 특성·길이별로 바뀌는 바이트 (최근 300개 기준)
        const groups = {};
        const chars = filter ? [filter] : Array.from(new Set(recs.map(r => r.char)));
        const summary = [];
        chars.forEach(u => {
            const mine = S.records.filter(r => r.char === u).slice(-300);
            B.changingBytes(mine.map(r => r.bytes)).forEach(g => {
                groups[u + '|' + g.length] = g.changing;
                const pos = g.changing.map((c, i) => (c ? i : -1)).filter(i => i >= 0);
                summary.push('<p><b>' + esc(charLabel(u)) + '</b> · ' + g.length + '바이트 × ' + g.count + '개 → ' +
                    (g.count < 2 ? '패킷이 더 필요해요' : pos.length ? '바뀌는 자리 <mark class="chg">' + pos.join(', ') + '</mark>' : '바뀌는 자리 없음 (값을 바꿔 보세요)') + '</p>');
            });
        });
        $('chgSummary').innerHTML = summary.join('') || '<p class="note">아직 기록이 없어요. ① 연결에서 🔔 알림을 켜세요.</p>';

        // 바이트별 10진수: 한 특성(골랐거나 마지막에 받은 것)의 가장 흔한 길이
        const target = filter || (recs.length ? recs[recs.length - 1].char : '');
        const tbl = $('byteTable');
        if (target) {
            const mine = S.records.filter(r => r.char === target);
            const g = B.changingBytes(mine.slice(-300).map(r => r.bytes))[0];
            const rows = mine.filter(r => r.bytes.length === g.length).slice(-30).reverse();
            const head = '<thead><tr><th>시각</th>' + g.changing.map((c, i) => '<th' + (c ? ' class="chg"' : '') + '>' + i + '</th>').join('') + '</tr></thead>';
            tbl.innerHTML = head + '<tbody>' + rows.map(r => '<tr><td>' + r.t.toFixed(2) + '</td>' +
                Array.from(r.bytes, (b, i) => '<td' + (g.changing[i] ? ' class="chg"' : '') + '>' + b + '</td>').join('') + '</tr>').join('') + '</tbody>';
            tbl.setAttribute('aria-label', charLabel(target) + ' 바이트별 값');
        } else tbl.innerHTML = '';

        const last = recs.slice(-200).reverse();
        $('logTable').tBodies[0].innerHTML = last.map(r => '<tr><td>' + r.t.toFixed(3) + '</td><td>' + esc(B.shortUuid(r.char)) + '</td><td>' + r.bytes.length +
            '</td><td class="hex">' + hexWithMarks(r.bytes, groups[r.char + '|' + r.bytes.length]) + '</td></tr>').join('');
    }

    async function sendBytesToChar(c, bytes) {
        for (let i = 0; i < bytes.length; i += 20) {
            const part = bytes.slice(i, i + 20);
            if (c.props.write && c.obj.writeValueWithResponse) await c.obj.writeValueWithResponse(part);
            else if (c.obj.writeValueWithoutResponse) await c.obj.writeValueWithoutResponse(part);
            else await c.obj.writeValue(part);
        }
    }

    async function writeChar() {
        const msg = $('writeMsg');
        const c = S.chars.get($('writeChar').value);
        if (!c) { msg.textContent = '쓸 수 있는 특성이 없어요. 먼저 연결하세요.'; return; }
        if (!$('writeOk').checked) { msg.textContent = '확인 칸에 표시해야 보낼 수 있어요.'; return; }
        const mode = $('writeMode') ? $('writeMode').value : 'hex';
        let bytes;
        try { bytes = B.encodeCommand($('writeHex').value, mode); } catch (e) { msg.textContent = '⚠️ ' + e.message; return; }
        if (!confirm(charLabel(c.uuid) + ' 에 ' + B.toHex(bytes) + ' 를 보낼까요?\n센서 설정이 바뀔 수 있어요.')) return;
        try {
            await sendBytesToChar(c, bytes);
            msg.textContent = '✓ 보냈어요: ' + B.toHex(bytes) + (mode === 'ascii' ? ' (' + $('writeHex').value + ')' : '');
            logEvent('write', B.shortUuid(c.uuid) + ' ← ' + B.toHex(bytes));
        } catch (e) { msg.textContent = '⚠️ 보내기 실패: ' + (e && e.message || e); }
    }

    function renderInitCommands() {
        const ul = $('initCmdList');
        if (!ul) return;
        ul.innerHTML = S.initCommands.length ? S.initCommands.map((cmd, i) => '<li><b>' + (i + 1) + '. ' + esc(B.shortUuid(cmd.characteristic)) + '</b> ' +
            '<code class="mono">' + esc(cmd.mode === 'ascii' ? 'ASCII: ' + cmd.payload : cmd.payload) + '</code>' +
            '<span class="note">대기 ' + (cmd.delayMs || 0) + 'ms</span>' +
            '<button type="button" class="btn small" data-delcmd="' + i + '" aria-label="' + (i + 1) + '번 시작 명령 지우기">🗑</button></li>').join('')
            : '<li class="note">저장된 시작 명령이 없어요. (센서가 연결만으로 값을 보내면 비워 두세요)</li>';
        const writable = Array.from(S.chars.values()).some(c => c.props.write || c.props.writeWithoutResponse);
        if ($('btnRunInitCmds')) $('btnRunInitCmds').disabled = !(S.initCommands.length && writable && $('writeOk').checked);
    }

    function addInitCommand() {
        const msg = $('writeMsg');
        const charUuid = $('writeChar').value;
        const c = S.chars.get(charUuid);
        if (!c) { msg.textContent = '먼저 쓸 특성을 고르세요.'; return; }
        const mode = $('writeMode') ? $('writeMode').value : 'hex';
        const payload = $('writeHex').value.trim();
        try { B.encodeCommand(payload, mode); } catch (e) { msg.textContent = '⚠️ ' + e.message; return; }
        const delayMs = Math.max(0, Math.min(10000, Math.round(Number($('writeDelay') && $('writeDelay').value) || 0)));
        S.initCommands.push({ service: c.service || S.charService[charUuid] || '', characteristic: charUuid, mode, payload, delayMs, label: '' });
        saveDraft();
        renderInitCommands();
        msg.textContent = '✓ 시작 명령 ' + S.initCommands.length + '번으로 추가했어요. ④ 저장 시 프로필에 함께 들어갑니다.';
    }

    async function runInitCommands() {
        const msg = $('initCmdMsg');
        if (!S.initCommands.length) { msg.textContent = '저장된 시작 명령이 없어요.'; return; }
        if (!$('writeOk').checked) { msg.textContent = '위 확인 칸에 표시해야 보낼 수 있어요.'; return; }
        if (!confirm('저장된 시작 명령 ' + S.initCommands.length + '개를 순서대로 보낼까요?')) return;
        try {
            for (let i = 0; i < S.initCommands.length; i++) {
                const cmd = S.initCommands[i];
                const c = S.chars.get(cmd.characteristic);
                if (!c) throw new Error((i + 1) + '번 특성(' + B.shortUuid(cmd.characteristic) + ')을 찾지 못했어요.');
                const bytes = B.encodeCommand(cmd.payload, cmd.mode);
                await sendBytesToChar(c, bytes);
                logEvent('write', '시작명령 ' + (i + 1) + ': ' + B.shortUuid(c.uuid) + ' ← ' + B.toHex(bytes));
                if (cmd.delayMs > 0) await new Promise(r => setTimeout(r, cmd.delayMs));
            }
            msg.textContent = '✓ 시작 명령 ' + S.initCommands.length + '개를 순서대로 보냈어요.';
        } catch (e) {
            msg.textContent = '⚠️ 실행 실패: ' + (e && e.message || e);
        }
    }

    // ---------- ③ 해석 규칙 ----------
    const curChar = () => $('ruleChar').value;
    const curFields = () => (S.rules[curChar()] = S.rules[curChar()] || []);
    const lastPacket = u => { for (let i = S.records.length - 1; i >= 0; i--) if (S.records[i].char === u) return S.records[i]; return null; };
    const formatOptions = sel => B.FORMATS.map(f => '<option value="' + f.id + '"' + (f.id === sel ? ' selected' : '') + '>' + esc(f.label) + '</option>').join('');

    function renderFields() {
        const u = curChar();
        const list = $('fieldList');
        if (!u) { list.innerHTML = ''; renderTruths(); return; }
        const fields = curFields();
        list.innerHTML = fields.length ? fields.map((f, i) => '<div class="field" data-i="' + i + '">' +
            '<label class="full">이름<input type="text" data-k="name" value="' + esc(f.name) + '" maxlength="40"></label>' +
            '<label>시작 위치<input type="number" data-k="offset" min="0" step="1" value="' + esc(f.offset) + '"></label>' +
            '<label class="full">형식<select data-k="format">' + formatOptions(f.format) + '</select></label>' +
            '<label>배율<input type="number" data-k="scale" step="any" value="' + esc(f.scale) + '"></label>' +
            '<label>더할 값<input type="number" data-k="add" step="any" value="' + esc(f.add) + '"></label>' +
            '<label>단위<input type="text" data-k="unit" value="' + esc(f.unit) + '" maxlength="20"></label>' +
            '<label>비트 마스크<input type="text" data-k="mask" value="' + esc(f.mask) + '" placeholder="0x0F" spellcheck="false"></label>' +
            '<button type="button" class="btn danger" data-del="' + i + '" aria-label="' + esc(f.name) + ' 필드 지우기">🗑</button>' +
            '<span class="fval" data-fval="' + i + '"></span></div>').join('')
            : '<p class="note">아직 필드가 없어요. ➕ 로 추가하거나 \'참값 맞추기\'에서 후보를 고르세요.</p>';
        renderTruths();
        S.chartKey = null;
        S.dirty = true;
    }
    function addField(f) {
        const fields = curFields();
        fields.push(f || { name: '값' + (fields.length + 1), offset: 0, format: 'uint8', scale: 1, add: 0, unit: '', mask: '' });
        saveDraft();
        renderFields();
    }
    function onFieldInput(e) {
        const box = e.target.closest('.field');
        if (!box || !e.target.dataset.k) return;
        const f = curFields()[Number(box.dataset.i)];
        const k = e.target.dataset.k;
        let v = e.target.value;
        if (k === 'offset') v = Math.max(0, parseInt(v, 10) || 0);
        else if (k === 'scale') v = v === '' ? 1 : Number(v);
        else if (k === 'add') v = v === '' ? 0 : Number(v);
        f[k] = v;
        saveDraft();
        S.chartKey = null;
        S.dirty = true;
    }

    function renderDecoded() {
        const u = curChar();
        const fields = u ? curFields() : [];
        const p = u ? lastPacket(u) : null;
        const el = $('latestDecoded');
        if (!p) { el.textContent = ''; }
        else {
            const vals = fields.map(f => (f.name || '값') + ' = ' + fmtNum(B.readField(p.bytes, f)) + (f.unit ? ' ' + f.unit : ''));
            el.textContent = '최근 패킷 ' + B.toHex(p.bytes) + (vals.length ? '\n→ ' + vals.join(',  ') : '');
        }
        fields.forEach((f, i) => {
            const s = document.querySelector('[data-fval="' + i + '"]');
            if (s) s.textContent = p ? '지금 값: ' + fmtNum(B.readField(p.bytes, f)) + (f.unit ? ' ' + f.unit : '') : '';
        });
    }

    let chart = null;
    function renderChart() {
        const u = curChar();
        const fields = u ? curFields() : [];
        const recs = u ? S.records.filter(r => r.char === u).slice(-500) : [];
        const tbl = $('decTable');
        tbl.innerHTML = fields.length ? '<thead><tr><th>시각(s)</th>' + fields.map(f => '<th>' + esc(f.name) + (f.unit ? ' (' + esc(f.unit) + ')' : '') + '</th>').join('') + '</tr></thead><tbody>' +
            recs.slice(-30).reverse().map(r => '<tr><td>' + r.t.toFixed(2) + '</td>' + fields.map(f => '<td>' + fmtNum(B.readField(r.bytes, f)) + '</td>').join('') + '</tr>').join('') + '</tbody>'
            : '<tbody><tr><td class="note">필드를 만들면 값이 여기에 나와요.</td></tr></tbody>';
        if (!window.Chart) { $('chartNote').hidden = false; return; }
        const colors = ['#1565c0', '#c62828', '#1e7e34', '#7b1fa2', '#ef6c00', '#0e7490', '#5f6b7a', '#ad1457'];
        const key = u + '|' + JSON.stringify(fields);
        const data = fields.map(f => recs.map(r => ({ x: r.t, y: B.readField(r.bytes, f) })).filter(pt => Number.isFinite(pt.y)));
        if (!chart || S.chartKey !== key) {
            if (chart) chart.destroy();
            chart = new window.Chart($('chart'), {
                type: 'scatter',
                data: { datasets: fields.map((f, i) => ({ label: (f.name || '값') + (f.unit ? ' (' + f.unit + ')' : ''), data: data[i], showLine: true, pointRadius: 0, borderWidth: 2, borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length] })) },
                options: { animation: false, maintainAspectRatio: false, parsing: false, scales: { x: { title: { display: true, text: '시각 (s)' } } } }
            });
            S.chartKey = key;
        } else {
            chart.data.datasets.forEach((d, i) => { d.data = data[i]; });
            chart.update('none');
        }
    }

    // 참값 맞추기
    function renderTruths() {
        const u = curChar();
        const list = (u && S.truths[u]) || [];
        $('truthTable').tBodies[0].innerHTML = list.map((t, i) => '<tr><td>' + (i + 1) + '</td><td>' + fmtNum(t.truth) + '</td><td class="hex">' + esc(B.toHex(t.bytes)) +
            '</td><td><button type="button" class="btn small" data-deltruth="' + i + '" aria-label="' + (i + 1) + '번 참값 지우기">✕</button></td></tr>').join('') ||
            '<tr><td colspan="4" class="note">아직 찍은 참값이 없어요.</td></tr>';
    }
    function addTruth() {
        const u = curChar();
        const v = Number($('truthVal').value);
        const msg = $('findMsg');
        if (!u) { msg.textContent = '먼저 특성을 고르세요.'; return; }
        if ($('truthVal').value === '' || !Number.isFinite(v)) { msg.textContent = '참값을 숫자로 넣어 주세요.'; return; }
        const p = lastPacket(u);
        if (!p) { msg.textContent = '이 특성의 기록이 아직 없어요. 🔔 알림을 켜거나 📖 읽어 주세요.'; return; }
        (S.truths[u] = S.truths[u] || []).push({ truth: v, bytes: p.bytes, t: p.t });
        const n = S.truths[u].length;
        msg.textContent = '📌 ' + n + '번째 참값 ' + v + ' 을(를) 찍었어요.' + (n < 3 ? ' (' + (3 - n) + '번 더)' : ' 🔎 를 눌러 보세요.');
        $('truthVal').value = '';
        renderTruths();
    }
    function find() {
        const u = curChar();
        const res = B.findCandidates((u && S.truths[u]) || [], { limit: 10 });
        const tbl = $('candTable');
        S.candidates = res.candidates;
        if (!res.ok) { $('findMsg').textContent = '⚠️ ' + res.reason; tbl.hidden = true; return; }
        $('findMsg').textContent = '자리·형식 조합 ' + res.total + '개를 맞춰 봤어요. r² 가 1 에 가깝고 배율이 깔끔한 수(0.01, 0.1 …)면 맞을 가능성이 커요.';
        tbl.hidden = false;
        tbl.tBodies[0].innerHTML = res.candidates.map((c, i) => '<tr' + (i === 0 ? ' class="best"' : '') + '><td>' + (i + 1) + '</td><td>' + c.offset + '</td><td>' + esc(c.format) + '</td><td>' +
            fmtNum(c.scale) + (c.niceScale !== null ? ' ≈ <b>' + c.niceScale + '</b>' : '') + '</td><td>' + fmtNum(Number(c.add.toPrecision(4))) + '</td><td>' + c.r2.toFixed(5) + '</td><td>' + fmtNum(Number(c.rmse.toPrecision(3))) +
            '</td><td><button type="button" class="btn small primary" data-usecand="' + i + '">필드로</button></td></tr>').join('');
    }

    // ---------- ④ 저장 ----------
    function buildDecoder() {
        const characteristics = Object.keys(S.rules).filter(u => (S.rules[u] || []).length).map(u => {
            const c = S.chars.get(u);
            const notify = c ? (c.props.notify || c.props.indicate) : S.records.filter(r => r.char === u).length > 1;
            return { service: S.charService[u] || '', characteristic: u, mode: notify ? 'notify' : 'read', fields: S.rules[u] };
        });
        const dec = {
            schema: B.SCHEMA, version: 1, name: $('sensorName').value.trim() || S.meta.deviceName || '이름 없는 센서',
            device: { namePrefix: S.meta.deviceName || '', maker: S.meta.maker || '', model: S.meta.model || '', firmware: S.meta.firmware || '' },
            characteristics, notes: $('ruleNotes').value, savedAt: new Date().toISOString()
        };
        if (S.initCommands.length) dec.initCommands = S.initCommands.map(cmd => Object.assign({}, cmd));
        return dec;
    }
    function saveDraft() {
        store(KEY_DRAFT, { rules: S.rules, charService: S.charService, initCommands: S.initCommands, meta: S.meta, name: $('sensorName').value, notes: $('ruleNotes').value });
    }
    function applyDecoder(dec) {
        S.rules = {};
        dec.characteristics.forEach(c => { S.rules[c.characteristic] = c.fields.map(f => Object.assign({}, f)); if (c.service) S.charService[c.characteristic] = c.service; });
        S.initCommands = Array.isArray(dec.initCommands) ? dec.initCommands.map(cmd => Object.assign({}, cmd)) : [];
        $('sensorName').value = dec.name;
        $('ruleNotes').value = dec.notes || '';
        if (!S.device) S.meta = { deviceName: dec.device.namePrefix, maker: dec.device.maker, model: dec.device.model, firmware: dec.device.firmware };
        saveDraft();
        refreshCharSelects();
        renderInitCommands();
        renderFields();
    }
    function renderSaved() {
        const list = load(KEY_SAVED, []);
        $('savedRules').innerHTML = list.length ? list.map((d, i) => '<li><b>' + esc(d.name) + '</b><span class="note">특성 ' + d.characteristics.length + '개' +
            (d.initCommands && d.initCommands.length ? ' · 명령 ' + d.initCommands.length + '개' : '') + ' · ' + esc((d.savedAt || '').slice(0, 10)) + '</span>' +
            '<a class="btn small primary" href="vernier-temp-lab.html?profile=' + encodeURIComponent(d.name) + '">📊 대시보드</a>' +
            '<button type="button" class="btn small" data-loadrule="' + i + '">불러오기</button><button type="button" class="btn small" data-delrule="' + i + '" aria-label="' + esc(d.name) + ' 지우기">🗑</button></li>').join('')
            : '<li class="note">아직 저장한 규칙이 없어요.</li>';
        $('rulePreview').textContent = JSON.stringify(buildDecoder(), null, 2);
    }
    function saveRule() {
        const check = B.validateDecoder(buildDecoder());
        if (!check.ok) { $('ruleMsg').textContent = '⚠️ ' + check.errors.join(' '); return; }
        if (!check.decoder.characteristics.length) { $('ruleMsg').textContent = '⚠️ 필드가 있는 특성이 없어요. ③ 해석에서 필드를 만드세요.'; return; }
        const list = load(KEY_SAVED, []).filter(d => d.name !== check.decoder.name);
        list.unshift(check.decoder);
        $('ruleMsg').textContent = store(KEY_SAVED, list.slice(0, 30)) ? '✓ "' + check.decoder.name + '" 을(를) 이 브라우저에 저장했어요.' : '⚠️ 이 브라우저에 저장할 수 없어요 (사생활 보호 모드?). JSON 파일로 받으세요.';
        renderSaved();
    }
    function readFile(input, fn) {
        const file = input.files && input.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = () => { try { fn(String(r.result)); } finally { input.value = ''; } };
        r.readAsText(file);
    }

    // ---------- 그리기 (자주 오는 알림에도 화면이 버벅이지 않게 0.25초마다) ----------
    let mainTabs = null, ruleTabs = null;
    function render() {
        if (!S.dirty) return;
        S.dirty = false;
        $('countBadge').textContent = '기록 ' + S.records.length + '개' + (S.paused ? ' · 멈춤' : '');
        const tab = mainTabs && mainTabs.current();
        if (tab === 'log') renderLog();
        if (tab === 'rules') {
            renderDecoded();
            if (ruleTabs && ruleTabs.current() === 'chart') renderChart();
        }
    }

    // ---------- 시작 ----------
    function init() {
        renderServiceChoices();
        checkCustom();
        checkSupport();
        const draft = load(KEY_DRAFT, null);
        if (draft) {
            S.rules = draft.rules || {};
            S.charService = draft.charService || {};
            S.initCommands = Array.isArray(draft.initCommands) ? draft.initCommands : [];
            S.meta = Object.assign(S.meta, draft.meta || {});
            $('sensorName').value = draft.name || '';
            $('ruleNotes').value = draft.notes || '';
        }
        mainTabs = LabUI.initTabs('#bxTabs', { key: 'ble-explorer', onShow: tab => { S.dirty = true; if (tab === 'save') renderSaved(); if (tab === 'rules') refreshCharSelects(); render(); } });
        ruleTabs = LabUI.initTabs('#ruleTabs', { key: 'ble-explorer-rule', onShow: () => { S.chartKey = null; S.dirty = true; render(); } });
        LabUI.initTabs('#saveTabs', { key: 'ble-explorer-save' });
        refreshCharSelects();
        renderInitCommands();
        renderFields();

        $('stdServices').addEventListener('change', saveServiceChoices);
        $('customUuids').addEventListener('input', saveServiceChoices);
        $('btnScan').addEventListener('click', scan);
        if ($('btnCopyBtInternals')) {
            $('btnCopyBtInternals').addEventListener('click', () => {
                const url = 'chrome://bluetooth-internals/#devices';
                const done = () => { $('uuidHelpMsg').textContent = '✓ 주소를 복사했어요. 크롬 새 탭 주소창에 붙여 넣고 Enter 를 누르세요.'; };
                if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => { $('uuidHelpMsg').textContent = url; });
                else $('uuidHelpMsg').textContent = url;
            });
        }
        if ($('btnOpenSvcBox')) {
            $('btnOpenSvcBox').addEventListener('click', () => {
                $('svcBox').open = true;
                $('customUuids').focus();
                $('svcBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
        $('btnReconnect').addEventListener('click', () => { if (S.device) { setStatus('다시 연결하는 중…'); connectDevice(S.device); } });
        $('btnVernierInit').addEventListener('click', vernierInit);
        try { $('vernierAuto').checked = localStorage.getItem('ble-explorer:vernierAuto') !== '0'; } catch (e) { /* 기본 켬 */ }
        $('vernierAuto').addEventListener('change', () => { try { localStorage.setItem('ble-explorer:vernierAuto', $('vernierAuto').checked ? '1' : '0'); } catch (e) { /* 무시 */ } });
        $('btnCopyEvents').addEventListener('click', () => {
            const t = eventText();
            const done = () => { $('eventMsg').textContent = '✓ 연결 기록을 복사했어요.'; };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => { $('eventMsg').textContent = t; });
            else $('eventMsg').textContent = t;
        });
        $('btnDisconnect').addEventListener('click', () => disconnect(false));
        $('btnPause').addEventListener('click', () => {
            S.paused = !S.paused;
            $('btnPause').textContent = S.paused ? '▶ 기록 다시' : '⏸ 기록 멈춤';
            $('btnPause').classList.toggle('on', S.paused);
            S.dirty = true;
        });
        $('tree').addEventListener('click', e => {
            const r = e.target.closest('[data-read]');
            if (r) return readChar(r.dataset.read);
            const n = e.target.closest('[data-notify]');
            if (n) toggleNotify(n.dataset.notify, n);
        });
        $('logChar').addEventListener('change', () => { S.dirty = true; render(); });
        $('btnClear').addEventListener('click', () => {
            if (S.records.length && !confirm('기록 ' + S.records.length + '개를 지울까요? (해석 규칙·참값은 남아요)')) return;
            S.records = []; S.t0 = null;
            refreshCharSelects();
            render();
        });
        $('writeOk').addEventListener('change', refreshCharSelects);
        $('btnWrite').addEventListener('click', writeChar);
        if ($('btnAddInitCmd')) $('btnAddInitCmd').addEventListener('click', addInitCommand);
        if ($('btnRunInitCmds')) $('btnRunInitCmds').addEventListener('click', runInitCommands);
        if ($('initCmdList')) {
            $('initCmdList').addEventListener('click', e => {
                const d = e.target.closest('[data-delcmd]');
                if (!d) return;
                S.initCommands.splice(Number(d.dataset.delcmd), 1);
                saveDraft();
                renderInitCommands();
            });
        }

        $('ruleChar').addEventListener('change', () => { S.ruleCharChosen = true; $('candTable').hidden = true; $('findMsg').textContent = ''; renderFields(); render(); });
        $('btnAddField').addEventListener('click', () => { if (!curChar()) { $('ruleEmpty').hidden = false; return; } addField(); });
        $('fieldList').addEventListener('input', onFieldInput);
        $('fieldList').addEventListener('change', onFieldInput);
        $('fieldList').addEventListener('click', e => {
            const d = e.target.closest('[data-del]');
            if (!d) return;
            curFields().splice(Number(d.dataset.del), 1);
            saveDraft();
            renderFields();
        });
        $('btnTruth').addEventListener('click', addTruth);
        $('truthVal').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTruth(); } });
        $('truthTable').addEventListener('click', e => {
            const d = e.target.closest('[data-deltruth]');
            if (!d) return;
            S.truths[curChar()].splice(Number(d.dataset.deltruth), 1);
            renderTruths();
        });
        $('btnFind').addEventListener('click', find);
        $('candTable').addEventListener('click', e => {
            const b = e.target.closest('[data-usecand]');
            if (!b) return;
            const c = S.candidates[Number(b.dataset.usecand)];
            const fields = curFields();
            addField(B.candidateToField(c, '값' + (fields.length + 1), ''));
            ruleTabs.show('fields', true);
            $('findMsg').textContent = '✓ 필드로 만들었어요. 이름·단위를 넣고 \'값·그래프\'에서 확인하세요.';
        });

        $('sensorName').addEventListener('input', saveDraft);
        $('ruleNotes').addEventListener('input', saveDraft);
        $('btnSaveRule').addEventListener('click', saveRule);
        $('btnRuleFile').addEventListener('click', () => {
            const dec = buildDecoder();
            download('ble-decoder-' + (dec.name.replace(/[^\w가-힣-]+/g, '_') || 'sensor') + '.json', JSON.stringify(dec, null, 2), 'application/json');
        });
        $('ruleFileIn').addEventListener('change', e => readFile(e.target, text => {
            let obj;
            try { obj = JSON.parse(text); } catch (err) { $('ruleMsg').textContent = '⚠️ JSON 파일이 아니에요.'; return; }
            const check = B.validateDecoder(obj);
            if (!check.ok) { $('ruleMsg').textContent = '⚠️ ' + check.errors.join(' '); return; }
            applyDecoder(check.decoder);
            $('ruleMsg').textContent = '✓ "' + check.decoder.name + '" 규칙을 불러왔어요.';
            renderSaved();
        }));
        $('savedRules').addEventListener('click', e => {
            const l = e.target.closest('[data-loadrule]'), d = e.target.closest('[data-delrule]');
            const list = load(KEY_SAVED, []);
            if (l) {
                const check = B.validateDecoder(list[Number(l.dataset.loadrule)]);
                if (check.ok) { applyDecoder(check.decoder); $('ruleMsg').textContent = '✓ "' + check.decoder.name + '" 규칙을 불러왔어요.'; }
            } else if (d) {
                const item = list[Number(d.dataset.delrule)];
                if (!item || !confirm('"' + item.name + '" 규칙을 지울까요?')) return;
                list.splice(Number(d.dataset.delrule), 1);
                store(KEY_SAVED, list);
            }
            renderSaved();
        });
        $('btnCsv').addEventListener('click', () => {
            if (!S.records.length) { $('logMsg').textContent = '기록이 없어요.'; return; }
            download('ble-log-' + stamp() + '.csv', '﻿' + B.recordsToCsv(S.records, S.rules), 'text/csv;charset=utf-8');
        });
        $('btnLogJson').addEventListener('click', () => {
            if (!S.records.length) { $('logMsg').textContent = '기록이 없어요.'; return; }
            download('ble-log-' + stamp() + '.json', B.recordsToJson(S.records, { device: S.meta, services: S.charService, events: S.events }), 'application/json');
        });
        $('logFileIn').addEventListener('change', e => readFile(e.target, text => {
            let got;
            try { got = B.recordsFromJson(text); } catch (err) { $('logMsg').textContent = '⚠️ ' + err.message; return; }
            if (S.records.length && !confirm('지금 기록 ' + S.records.length + '개를 파일의 기록으로 바꿀까요?')) return;
            S.records = got.records;
            S.t0 = null;
            Object.assign(S.charService, (got.meta && got.meta.services) || {});
            if (!S.device && got.meta && got.meta.device) S.meta = Object.assign(S.meta, got.meta.device);
            $('logMsg').textContent = '✓ 기록 ' + got.records.length + '개를 불러왔어요. ② 기록·③ 해석에서 보세요.';
            refreshCharSelects();
            renderFields();
        }));

        setInterval(render, 250);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
