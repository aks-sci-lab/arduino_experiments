/* LED 플랑크 상수 — 조 코드로 선생님 구글 시트에 보내기 · 같은 조의 다른 노트북에서 불러오기 (브라우저·Node 공용)
   - 서버는 스마트폰 진자와 같은 Apps Script(apps-script/Code.gs, 시트 'planck')를 쓴다. 요청 보내기·조 코드는 js/pendulum-cloud.js
   - 노트북 한 대가 직접 잰 LED 하나 = 시트 한 줄 (id = 노트북 번호 + LED). 같은 줄을 다시 보내면 고쳐 쓴다
   - 다른 노트북·CSV 에서 불러온 값은 LED 의 ext[출처] 에 따로 두어, 내 기록과 섞이지 않고 다시 불러오면 그 출처만 바뀐다
   - 학생 이름·학번은 보내지 않는다 (조 코드로만 구분)
   시험: tests/planck-cloud.test.cjs */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PlanckCloud = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var EXP = 'planck';
    var ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
    var DEVICE_RE = /^[A-Za-z0-9_-]{4,20}$/;
    var MAX_POINTS = 500;

    function newDeviceId(random) {
        var R = typeof random === 'function' ? random : Math.random, s = 'n';
        for (var i = 0; i < 6; i++) s += 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(R() * 32)];
        return s;
    }
    // 시트 한 줄의 id: 노트북 번호 + LED id (서버 규칙 ^[A-Za-z0-9_-]{6,40}$ 에 맞게)
    function rowId(device, ledId) {
        var led = String(ledId == null ? '' : ledId).replace(/[^A-Za-z0-9_-]/g, '');
        var s = (String(device) + '-' + (led || 'led')).slice(0, 40);
        return ID_RE.test(s) ? s : null;
    }
    // 노트북 번호를 사람이 알아보기 쉽게 (끝 4자리)
    function deviceLabel(device) { return '노트북 ' + String(device || '').slice(-4).toUpperCase(); }

    // ---------- 측정점 ↔ 글자 ----------
    function rnd(v, d) { var x = Number(v); return Number.isFinite(x) ? +x.toFixed(d) : null; }
    function encodeIv(iv) {
        return JSON.stringify((iv || []).slice(0, MAX_POINTS).map(function (p) {
            return [rnd(p.v, 4), rnd(p.i, 5), p.vr != null ? rnd(p.vr, 6) : null, p.r != null ? rnd(p.r, 2) : null, p.src === 'sensor' ? 1 : 0];
        }).filter(function (a) { return a[0] != null && a[1] != null; }));
    }
    function encodeGlow(glow) {
        return JSON.stringify((glow || []).slice(0, MAX_POINTS).map(function (v) { return rnd(v, 4); }).filter(function (v) { return v != null; }));
    }
    function parseArr(text) {
        if (Array.isArray(text)) return text;
        try { var a = JSON.parse(String(text == null || text === '' ? '[]' : text)); return Array.isArray(a) ? a : []; } catch (e) { return []; }
    }
    function decodeIv(text) {
        var out = [];
        parseArr(text).forEach(function (a) {
            if (!Array.isArray(a)) return;
            var v = Number(a[0]), i = Number(a[1]);
            if (!(Number.isFinite(v) && Number.isFinite(i) && v >= 0 && i >= 0)) return;
            var p = { v: v, i: i };
            if (a[2] != null && Number.isFinite(Number(a[2]))) p.vr = Number(a[2]);
            if (a[3] != null && Number.isFinite(Number(a[3]))) p.r = Number(a[3]);
            if (a[4]) p.src = 'sensor';
            out.push(p);
        });
        return out.slice(0, MAX_POINTS);
    }
    function decodeGlow(text) {
        return parseArr(text).map(Number).filter(function (v) { return Number.isFinite(v) && v > 0; }).slice(0, MAX_POINTS);
    }

    // ---------- 보낼 내용 ----------
    /* o = { group, device, leds, sent: [이전에 보낸 id], v0: function(led, 'current'|'glow') → 숫자 또는 null,
             summary: { hCurrent, errorPct, r2, hGlow } (×10⁻³⁴ J·s 단위), curMode, iMin, now }
       내가 직접 잰 값이 있는 LED 만 보낸다. 예전에 보냈는데 지금은 비어 있는 LED 는 빈 줄로 보내 시트를 고친다 */
    function buildPayloads(o, isGroupCode) {
        if (!isGroupCode(o.group)) return { error: '조 코드를 먼저 정하세요 (예: 2-3-4821).' };
        if (!DEVICE_RE.test(String(o.device || ''))) return { error: '노트북 번호가 없습니다. 페이지를 새로고침하세요.' };
        var sent = o.sent || [], s = o.summary || {}, list = [];
        (o.leds || []).forEach(function (led) {
            var id = rowId(o.device, led.id);
            if (!id) return;
            var mine = (led.iv || []).length + (led.glow || []).length;
            if (!mine && sent.indexOf(id) < 0) return;
            list.push({
                action: 'save', exp: EXP, id: id, group: o.group, device: o.device,
                led: String(led.name || '').slice(0, 40) || 'LED', ledKey: led.key || '', lambda: Number(led.lambda),
                v0Current: num(o.v0 && o.v0(led, 'current')), v0Glow: num(o.v0 && o.v0(led, 'glow')),
                nIV: Math.min((led.iv || []).length, MAX_POINTS), nGlow: Math.min((led.glow || []).length, MAX_POINTS),
                hCurrent: num(s.hCurrent), errorPct: num(s.errorPct), r2: num(s.r2), hGlow: num(s.hGlow),
                curMode: o.curMode === 'current' ? 'current' : 'extrapolate', iMin: num(o.iMin),
                sentAt: o.now || new Date().toISOString(),
                iv: encodeIv(led.iv), glow: encodeGlow(led.glow)
            });
        });
        if (!list.length) return { error: '이 노트북에서 직접 잰 값이 없습니다. 값을 잰 노트북에서 보내세요.' };
        return { payloads: list };
    }
    function num(v) {
        if (v === '' || v == null) return '';
        var x = Number(v);
        return Number.isFinite(x) ? +x.toPrecision(6) : '';
    }

    // ---------- 받은 값을 내 LED 목록에 합치기 ----------
    // 같은 LED 찾기: 미리 넣은 LED 는 key 로, 직접 추가한 LED 는 이름 + 파장으로
    function findLed(leds, key, name, lambda) {
        var n = String(name || '').trim();
        return leds.find(function (l) { return key && l.key === key; }) ||
            leds.find(function (l) { return String(l.name).trim() === n && Math.abs(Number(l.lambda) - Number(lambda)) < 0.5; }) || null;
    }
    /* entries = [{ src, label, key, name, lambda, iv, glow, at }] 를 leds 에 넣는다.
       같은 출처(src)의 값은 통째로 바꾼다 (다시 불러와도 두 번 들어가지 않음). 없는 LED 는 새로 만든다.
       돌려주는 값: { changed, newLeds, points } */
    function applyEntries(leds, entries, makeId) {
        var changed = false, newLeds = 0, points = 0;
        entries.forEach(function (e) {
            var lambda = Number(e.lambda);
            if (!(lambda >= 200 && lambda <= 1100)) return;
            var led = findLed(leds, e.key, e.name, lambda);
            var has = (e.iv || []).length + (e.glow || []).length;
            if (!led) {
                if (!has) return;
                led = { id: makeId(), key: e.key || null, name: String(e.name || 'LED').slice(0, 40), lambda: lambda, on: true, fit: true, iv: [], glow: [] };
                leds.push(led); newLeds++; changed = true;
            }
            led.ext = led.ext || {};
            var before = JSON.stringify(led.ext[e.src] || null);
            if (has) led.ext[e.src] = { label: e.label, at: e.at || '', iv: e.iv || [], glow: e.glow || [] };
            else delete led.ext[e.src];
            if (JSON.stringify(led.ext[e.src] || null) !== before) changed = true;
            points += has;
        });
        return { changed: changed, newLeds: newLeds, points: points };
    }
    // 서버 목록 → 합칠 값 (내 노트북이 보낸 줄은 뺀다)
    function entriesFromServer(items, myDevice) {
        return (items || []).filter(function (x) { return x && String(x.device) !== String(myDevice); }).map(function (x) {
            return {
                src: 'n:' + String(x.device), label: deviceLabel(x.device), key: String(x.ledKey || ''), name: String(x.led == null ? '' : x.led),
                lambda: Number(x.lambda_nm), iv: decodeIv(x.ivData), glow: decodeGlow(x.glowData), at: String(x.sentAt || x.timestamp || '')
            };
        });
    }
    // 다른 노트북·파일에서 불러온 값까지 합친 LED (계산·그래프용)
    function merged(led) {
        var iv = (led.iv || []).slice(), glow = (led.glow || []).slice();
        Object.keys(led.ext || {}).forEach(function (k) {
            var e = led.ext[k];
            (e.iv || []).forEach(function (p) { iv.push(Object.assign({}, p, { from: e.label || k })); });
            (e.glow || []).forEach(function (v) { glow.push(v); });
        });
        return Object.assign({}, led, { iv: iv, glow: glow });
    }
    function extCount(led) {
        var n = 0;
        Object.keys(led.ext || {}).forEach(function (k) { n += (led.ext[k].iv || []).length + (led.ext[k].glow || []).length; });
        return n;
    }

    // ---------- CSV (이 페이지의 'CSV 다운로드' 파일) 불러오기 ----------
    function splitCsvLine(line) {
        var out = [], cur = '', q = false;
        for (var i = 0; i < line.length; i++) {
            var c = line[i];
            if (q) {
                if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (c === '"') q = false;
                else cur += c;
            } else if (c === '"') q = true;
            else if (c === ',') { out.push(cur); cur = ''; }
            else cur += c;
        }
        out.push(cur);
        return out;
    }
    /* 돌려주는 값: { entries: [{ name, lambda, iv, glow }], rows } 또는 { error } */
    function parseCsv(text) {
        var lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (!lines.length) return { error: '빈 파일입니다.' };
        var head = splitCsvLine(lines[0]).map(function (h) { return h.trim(); });
        var col = function (n) { return head.indexOf(n); };
        var cL = col('led'), cW = col('wavelength_nm'), cM = col('method'), cV = col('voltage_V'), cI = col('current_mA');
        if (cL < 0 || cW < 0 || cM < 0 || cV < 0) return { error: '이 페이지에서 받은 CSV 가 아닙니다 (첫 줄에 led, wavelength_nm, method, voltage_V 가 있어야 합니다).' };
        var cVr = col('resistor_voltage_V'), cR = col('resistor_ohm'), cS = col('source');
        var map = {}, order = [], rows = 0;
        lines.slice(1).forEach(function (line) {
            var f = splitCsvLine(line);
            var name = String(f[cL] || '').trim(), lambda = Number(f[cW]), v = Number(f[cV]);
            if (!name || !(lambda >= 200 && lambda <= 1100) || !(Number.isFinite(v) && v >= 0)) return;
            var k = name + '|' + lambda;
            if (!map[k]) { map[k] = { name: name, lambda: lambda, iv: [], glow: [] }; order.push(k); }
            if (String(f[cM]).trim() === 'glow') { if (v > 0) { map[k].glow.push(v); rows++; } return; }
            var i = Number(f[cI]);
            if (f[cI] === '' || !(Number.isFinite(i) && i >= 0)) return;
            var p = { v: v, i: i };
            if (cVr >= 0 && f[cVr] !== '' && Number.isFinite(Number(f[cVr]))) p.vr = Number(f[cVr]);
            if (cR >= 0 && f[cR] !== '' && Number.isFinite(Number(f[cR]))) p.r = Number(f[cR]);
            if (cS >= 0 && String(f[cS]).trim() === 'sensor') p.src = 'sensor';
            map[k].iv.push(p); rows++;
        });
        if (!rows) return { error: '불러올 측정값이 없습니다.' };
        return { entries: order.map(function (k) { return map[k]; }), rows: rows };
    }

    return {
        EXP: EXP, MAX_POINTS: MAX_POINTS,
        newDeviceId: newDeviceId, rowId: rowId, deviceLabel: deviceLabel,
        encodeIv: encodeIv, decodeIv: decodeIv, encodeGlow: encodeGlow, decodeGlow: decodeGlow,
        buildPayloads: buildPayloads, findLed: findLed, applyEntries: applyEntries, entriesFromServer: entriesFromServer,
        merged: merged, extCount: extCount, parseCsv: parseCsv
    };
});
