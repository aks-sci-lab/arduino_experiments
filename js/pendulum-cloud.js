/* 스마트폰 진자 — 조 코드와 구글 시트(Apps Script) 주고받기 (브라우저·Node 공용)
   - 조 코드: 반-조-4자리 숫자 (예: 2-3-4821). 학생 이름 없이 조만 구분
   - 원본 데이터 줄이기: 정수로 바꾼 뒤 '앞 값과의 차이'를 36진수로 적어 글자 수를 줄이고,
     셀 한 칸(45,000자) × 6칸 안에 들어가게 나눔. 그래도 크면 점을 2개 중 1개만 남김
   - 서버 요청은 '단순 요청'(GET, 또는 Content-Type: text/plain 인 POST)이라 미리보기 요청이 생기지 않음
   서버 코드: apps-script/Code.gs, 주소: js/pendulum-config.js, 시험: tests/pendulum-cloud.test.cjs */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PendulumCloud = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var GROUP_RE = /^\d{1,2}-\d{1,2}-\d{4}$/;
    var CELL_MAX = 45000, RAW_CELLS = 6;
    var CHANNELS = [['t', 1], ['ax', 100], ['ay', 100], ['az', 100], ['alpha', 10], ['beta', 10], ['gamma', 10]];

    // ---------- 조 코드 ----------
    function normalizeGroup(s) {
        return String(s == null ? '' : s)
            .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
            .replace(/[‐-―－~·.\/_ ]/g, '-').replace(/\s+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
    function isGroupCode(s) { return GROUP_RE.test(String(s || '')); }
    function makeGroupCode(ban, jo, random) {
        ban = Math.round(Number(ban)); jo = Math.round(Number(jo));
        if (!(ban >= 1 && ban <= 99) || !(jo >= 1 && jo <= 99)) return null;
        var r = typeof random === 'function' ? random() : Math.random();
        var four = String(Math.floor(r * 10000)).padStart(4, '0');
        return ban + '-' + jo + '-' + four;
    }
    function groupParts(code) {
        if (!isGroupCode(code)) return null;
        var p = code.split('-');
        return { ban: +p[0], jo: +p[1], key: p[2] };
    }
    function newId(random) {
        var R = typeof random === 'function' ? random : Math.random, s = 'm';
        for (var i = 0; i < 11; i++) s += 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(R() * 32)];
        return s;
    }

    // ---------- 원본 데이터 줄이기 ----------
    function encode(samples, step) {
        var pick = [];
        for (var i = 0; i < samples.length; i += step) pick.push(samples[i]);
        var t0 = pick.length ? pick[0].t : 0;
        var parts = ['P1', pick.length, step];
        CHANNELS.forEach(function (ch) {
            var prev = 0, out = [];
            pick.forEach(function (s) {
                var v = ch[0] === 't' ? Math.round(s.t - t0) : Math.round(Number(s[ch[0]]) * ch[1]);
                if (!Number.isFinite(v)) v = 0;
                out.push((v - prev).toString(36));
                prev = v;
            });
            parts.push(out.join(','));
        });
        return parts.join('|');
    }
    /* 돌려주는 값: { parts: [조각…], step: 몇 개 중 1개를 남겼는지, n: 남긴 점 수, chars } */
    function packSamples(samples, opts) {
        opts = opts || {};
        var cell = opts.cellMax || CELL_MAX, cells = opts.cells || RAW_CELLS;
        samples = samples || [];
        var step = 1, text = encode(samples, step);
        while (text.length > cell * cells && step < 64) { step *= 2; text = encode(samples, step); }
        var parts = [];
        for (var i = 0; i < text.length; i += cell) parts.push(text.slice(i, i + cell));
        return { parts: parts, step: step, n: Math.ceil(samples.length / step), chars: text.length };
    }
    function unpackSamples(parts) {
        var text = Array.isArray(parts) ? parts.join('') : String(parts || '');
        var f = text.split('|');
        if (f[0] !== 'P1') throw new Error('원본 데이터 형식이 아닙니다.');
        var n = +f[1], cols = CHANNELS.map(function (ch, k) {
            var vals = f[3 + k] ? f[3 + k].split(',') : [], acc = 0;
            return vals.map(function (d) { acc += parseInt(d, 36); return acc / (ch[0] === 't' ? 1 : ch[1]); });
        });
        var out = [];
        for (var i = 0; i < n; i++) {
            var s = {};
            CHANNELS.forEach(function (ch, k) { s[ch[0]] = cols[k][i]; });
            out.push(s);
        }
        return out;
    }

    // ---------- 보낼 내용 ----------
    function buildSavePayload(o) {
        var r = o.result || {}, c = o.conditions || {};
        var L = Number(c.L);
        if (!isGroupCode(o.group)) return { error: '조 코드가 없습니다. 노트북 화면의 QR 로 다시 열어 주세요.' };
        if (!(L > 0)) return { error: '줄 길이 L 을 먼저 적어 주세요.' };
        if (!r || r.error || !Number.isFinite(r.T)) return { error: '주기가 계산되지 않았습니다. 다시 측정해 주세요.' };
        var packed = packSamples(o.samples || []);
        return {
            payload: {
                action: 'save', id: o.id, group: o.group,
                L: L, amplitude: c.amplitude === '' || c.amplitude == null ? '' : Number(c.amplitude), note: String(c.note || '').slice(0, 200),
                sensorAxis: r.axis, kind: r.kind, nPeriods: r.n, T_mean: round(r.T, 5), T_std: round(r.Tstd, 5), T_sem: round(r.Tsem, 5),
                rate: round(r.rate, 1), source: o.source === 'simulation' ? 'simulation' : 'sensor', device: o.device || '',
                measuredAt: o.measuredAt || '', raw: packed.parts,
                rawInfo: 'n=' + packed.n + (packed.step > 1 ? ', ' + packed.step + '개 중 1개' : '') + ', ' + packed.chars + '자'
            }
        };
    }
    function round(v, d) { return Number.isFinite(v) ? +v.toFixed(d) : ''; }

    // ---------- 서버 응답 ----------
    function parseResponse(text) {
        var j;
        try { j = typeof text === 'string' ? JSON.parse(text) : text; }
        catch (e) {
            // 로그인 화면(HTML)이 오면 웹앱 '액세스: 모든 사용자' 설정이 빠진 것
            return { ok: false, error: /<html/i.test(String(text)) ? '서버가 로그인 화면을 보냈습니다. 선생님: 웹 앱의 액세스를 "모든 사용자"로 배포했는지 확인하세요.' : '서버 응답을 읽지 못했습니다.' };
        }
        if (!j || typeof j !== 'object') return { ok: false, error: '서버 응답이 비어 있습니다.' };
        if (!j.ok) return { ok: false, error: String(j.error || '서버 오류') };
        return j;
    }
    // 서버 목록 한 줄을 화면 표의 한 줄로
    function itemFromServer(x) {
        var T = Number(x.T_mean);
        return {
            id: String(x.id), from: 'server', L: Number(x.L), T: T, Tstd: num(x.T_std), n: num(x.nPeriods),
            amplitude: num(x.amplitude), note: x.note || '', kind: x.kind || '', axis: x.sensorAxis || '',
            source: x.source || 'sensor', at: x.measuredAt || x.timestamp || '', hasRaw: !!x.hasRaw
        };
    }
    function num(v) { return v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null); }
    // id 가 같으면 새 값으로 바꾸고, 새 id 는 뒤에 붙임. 새로 들어온 id 목록도 돌려줌
    function mergeItems(list, incoming) {
        var out = list.slice(), added = [], pos = {};
        out.forEach(function (it, i) { pos[it.id] = i; });
        incoming.forEach(function (it) {
            if (pos[it.id] == null) { pos[it.id] = out.length; out.push(it); added.push(it.id); }
            else {
                var old = out[pos[it.id]];
                if (old.T !== it.T || old.L !== it.L) added.push(it.id);
                out[pos[it.id]] = it;
            }
        });
        return { items: out, added: added };
    }

    // ---------- 요청 (fetchImpl 은 시험에서 가짜로 바꿈) ----------
    function withTimeout(promise, ms) {
        return new Promise(function (resolve, reject) {
            var t = setTimeout(function () { reject(new Error('시간 초과')); }, ms);
            promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
        });
    }
    function request(url, init, fetchImpl, ms) {
        var f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
        if (!url) return Promise.resolve({ ok: false, error: '선생님 설정이 아직 안 되었습니다 (Apps Script 주소 없음).', noConfig: true });
        if (!f) return Promise.resolve({ ok: false, error: '이 브라우저는 서버에 연결할 수 없습니다.' });
        return withTimeout(f(url, init), ms || 15000)
            .then(function (res) { return res.text(); })
            .then(parseResponse, function (e) { return { ok: false, error: '서버에 연결하지 못했습니다 (' + (e && e.message || e) + ').', network: true }; });
    }
    function query(base, params) {
        var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
        return base + (base.indexOf('?') >= 0 ? '&' : '?') + q;
    }
    function save(url, payload, fetchImpl) {
        return request(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' }, fetchImpl, 30000);
    }
    function list(url, group, fetchImpl) {
        return request(url && query(url, { action: 'list', group: group, _: Date.now() }), { method: 'GET', redirect: 'follow' }, fetchImpl);
    }
    function raw(url, group, id, fetchImpl) {
        return request(url && query(url, { action: 'raw', group: group, id: id }), { method: 'GET', redirect: 'follow' }, fetchImpl, 30000);
    }

    return {
        GROUP_RE: GROUP_RE, CELL_MAX: CELL_MAX, RAW_CELLS: RAW_CELLS,
        normalizeGroup: normalizeGroup, isGroupCode: isGroupCode, makeGroupCode: makeGroupCode, groupParts: groupParts, newId: newId,
        packSamples: packSamples, unpackSamples: unpackSamples, buildSavePayload: buildSavePayload,
        parseResponse: parseResponse, itemFromServer: itemFromServer, mergeItems: mergeItems,
        save: save, list: list, raw: raw
    };
});
