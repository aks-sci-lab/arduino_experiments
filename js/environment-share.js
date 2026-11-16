/* 환경 센서 페이지(온도·습도·기압·VOC / 조도 / 자외선)의 조 공유 (교사·학생 구글 로그인 없이)
   - 공통 부품 js/class-share.js(ClassShare)를 이 페이지에 맞게 붙인다. 사용법: docs/class-share.md
   - 보낼 것: 저장한 회차 + 지금 측정을 한 회차 = 시트 한 줄. 자료는 열 이름 + 숫자 배열로 줄이고, 점이 많으면 고르게 덜어 낸다
   - 받은 것: 같은 조 다른 노트북의 회차를 '📥 노트북 AB12 · 회차 이름' 으로 내 회차와 따로 보관(이 브라우저)
   - CSV 대체: 이 페이지의 'CSV 저장' 파일을 다른 노트북에서 '📂 CSV 불러오기' 로 합친다
   계산 부분(pack·unpack·summary·mergeIncoming·parseCsv)은 Node 시험: tests/environment-share.test.cjs */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.EnvironmentShare = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var MAX_POINTS = 2000;          // 한 회차에서 보낼 점 수 (넘으면 고르게 덜어 냄, 1초 간격이면 약 33분)

    function round(v, d) {
        if (typeof v !== 'number' || !isFinite(v)) return null;
        var f = Math.pow(10, d == null ? 4 : d);
        return Math.round(v * f) / f;
    }
    // 점이 max 개를 넘으면 처음·끝을 남기고 고르게 고른다
    function thin(list, max) {
        max = max || MAX_POINTS;
        if (list.length <= max) return list.slice();
        var out = [], step = (list.length - 1) / (max - 1);
        for (var i = 0; i < max; i++) out.push(list[Math.round(i * step)]);
        return out;
    }
    // points → { cols, rows, n } (get(point, col) 로 값을 꺼냄, digits[col] 자리에서 반올림)
    function pack(points, cols, get, digits) {
        digits = digits || {};
        var src = thin(points || []);
        return {
            cols: cols.slice(), n: (points || []).length,
            rows: src.map(function (p) { return cols.map(function (c) { var v = get(p, c); return v === null || v === undefined || v === '' ? null : round(Number(v), digits[c]); }); })
        };
    }
    // { cols, rows } → [{ col: 값 }] (모양이 틀리면 빈 배열)
    function unpack(data) {
        if (!data || !Array.isArray(data.cols) || !Array.isArray(data.rows)) return [];
        var cols = data.cols.map(String);
        return data.rows.filter(Array.isArray).map(function (r) {
            var o = {};
            cols.forEach(function (c, i) { var v = r[i]; o[c] = typeof v === 'number' && isFinite(v) ? v : null; });
            return o;
        }).filter(function (o) { return o.time !== null; });
    }

    function stats(points, get) {
        var vals = points.map(get).filter(function (v) { return typeof v === 'number' && isFinite(v); });
        if (!vals.length) return null;
        var sum = vals.reduce(function (a, b) { return a + b; }, 0);
        return { mean: sum / vals.length, min: Math.min.apply(null, vals), max: Math.max.apply(null, vals), last: vals[vals.length - 1] };
    }
    function duration(points) {
        var t = stats(points, function (p) { return p.time; });
        return t ? round(t.max - t.min, 1) : 0;
    }
    // 교사 진행 보기·시트에 보일 요약 (앞 4개가 교사 화면에 나옴). 이름은 서버 규칙(한글·영어·숫자·띄어쓰기·괄호)
    function summaryEnv(points) {
        var g = function (k) { var s = stats(points, function (p) { return p[k]; }); return s; };
        var t = g('temp'), h = g('humidity'), p = g('pressure'), v = g('vocIndex');
        return {
            '시간(s)': duration(points),
            '온도 평균(C)': t ? round(t.mean, 2) : null,
            '습도 평균(RH)': h ? round(h.mean, 1) : null,
            '기압 평균(kPa)': p ? round(p.mean, 2) : null,
            'VOC 마지막': v ? v.last : null
        };
    }
    function summarySingle(points, key, unit, digits) {
        var s = stats(points, function (p) { return p[key]; });
        var u = String(unit || '').replace(/[^A-Za-z0-9_가-힣 .-]/g, '');
        var name = function (x) { return x + (u ? '(' + u + ')' : ''); };
        var o = { '시간(s)': duration(points) };
        o[name('평균')] = s ? round(s.mean, digits) : null;
        o[name('최소')] = s ? round(s.min, digits) : null;
        o[name('최대')] = s ? round(s.max, digits) : null;
        return o;
    }

    /* 서버에서 받은 다른 노트북 항목(ClassShare 의 onIncoming 인자)을 보관함에 반영.
       서버 것('d:' 로 시작)은 받은 목록으로 통째로 바꾸고(지운 회차는 사라짐), CSV 로 불러온 것('f:')은 그대로 둔다.
       돌려주는 값: { store, changed } */
    function mergeIncoming(store, items) {
        store = store || {};
        var next = {}, changed = false;
        Object.keys(store).forEach(function (k) { if (k.indexOf('d:') !== 0) next[k] = store[k]; });
        (items || []).forEach(function (it) {
            if (!it || !it.data || !Array.isArray(it.data.cols) || !Array.isArray(it.data.rows)) return;
            var key = 'd:' + it.device + '-' + it.id;
            next[key] = { from: String(it.from || ''), title: String(it.title || '측정'), n: Number(it.n) || it.data.rows.length,
                sentAt: String(it.sentAt || ''), cols: it.data.cols, rows: it.data.rows };
        });
        var a = Object.keys(store).sort(), b = Object.keys(next).sort();
        if (a.join('|') !== b.join('|')) changed = true;
        else changed = a.some(function (k) { return store[k].sentAt !== next[k].sentAt || store[k].rows.length !== next[k].rows.length; });
        return { store: next, changed: changed };
    }

    // CSV 한 줄 나누기 (이 페이지의 CSV 는 따옴표가 없지만 혹시 있으면 벗긴다)
    function splitLine(line) {
        return line.split(',').map(function (s) { return s.trim().replace(/^"(.*)"$/, '$1'); });
    }
    /* 이 페이지의 'CSV 저장' 파일 → { points: [{ key: 값 }] } 또는 { error }
       headers: { 'CSV 머리글': 'key' } (time 은 꼭 있어야 함) */
    function parseCsv(text, headers) {
        var lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (lines.length < 2) return { error: '측정값이 없는 파일입니다.' };
        var head = splitLine(lines[0]);
        var map = head.map(function (h) { return Object.prototype.hasOwnProperty.call(headers, h) ? headers[h] : null; });
        if (map.indexOf('time') < 0) return { error: '이 센서 화면에서 저장한 CSV 가 아닙니다 (시간 열이 없음).' };
        var keys = Object.keys(headers).map(function (h) { return headers[h]; });
        var need = keys.filter(function (k) { return k !== 'time'; });
        if (!need.some(function (k) { return map.indexOf(k) >= 0; })) return { error: '이 센서 화면에서 저장한 CSV 가 아닙니다 (측정값 열이 없음).' };
        var points = [];
        for (var i = 1; i < lines.length; i++) {
            var cells = splitLine(lines[i]), o = {};
            map.forEach(function (k, j) {
                if (!k) return;
                var s = cells[j];
                var v = s === undefined || s === '' ? null : Number(s);
                o[k] = typeof v === 'number' && isFinite(v) ? v : null;
            });
            if (o.time !== null && o.time !== undefined) points.push(o);
        }
        if (!points.length) return { error: '읽을 수 있는 측정값이 없습니다.' };
        return { points: points };
    }

    /* ---------- 화면에 붙이기 (브라우저) ----------
       opts: exp, csvHint, cols, digits, get(point, col), summary(points),
             mine() → [{ id, title, points }], toPoint(row 객체) → 페이지의 점 모양,
             csvHeaders, onChange(), getStep(), getPoints()
       돌려주는 값: { share, list() → [{ key, name, from, n, points }], has(key), stepChanged() } (ClassShare 가 없으면 null) */
    function attach(opts) {
        if (typeof window === 'undefined' || !window.ClassShare || !window.PendulumCloud || !window.ClassCloud) return null;
        var KEY = 'class-share-in:' + opts.exp, cache = {};
        var load = function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
        var store = load();
        var save = function () { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* 저장 불가 */ } };
        var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var changed = function () { cache = {}; save(); if (opts.onChange) opts.onChange(); };
        var share = window.ClassShare.init({
            exp: opts.exp,
            barMount: '#class-bar-mount', shareMount: '#share-mount',
            csvHint: opts.csvHint || '맨 위 CSV 저장',
            getItems: function () {
                return opts.mine().filter(function (t) { return t.points && t.points.length; }).map(function (t) {
                    return { id: t.id, title: t.title, n: t.points.length, summary: opts.summary(t.points), data: pack(t.points, opts.cols, opts.get, opts.digits) };
                });
            },
            onIncoming: function (items) {
                var r = mergeIncoming(store, items);
                if (r.changed) { store = r.store; changed(); }
                return r.changed;
            },
            getStep: opts.getStep, getPoints: opts.getPoints,
            incomingCount: function () { return Object.keys(store).length; },
            clearIncoming: function () { store = {}; changed(); },
            csvImport: async function (files) {
                var msgs = [], any = false;
                for (var i = 0; i < files.length; i++) {
                    var f = files[i], r = parseCsv(await f.text(), opts.csvHeaders);
                    if (r.error) { msgs.push('⚠ ' + esc(f.name) + ': ' + esc(r.error)); continue; }
                    var p = pack(r.points, opts.cols, function (o, c) { return o[c]; }, opts.digits);
                    store['f:' + f.name] = { from: '파일', title: f.name, n: r.points.length, sentAt: new Date().toISOString(), cols: p.cols, rows: p.rows };
                    any = true;
                    msgs.push('✅ ' + esc(f.name) + ': 측정값 ' + r.points.length + '개를 📥 불러온 값으로 넣었습니다.');
                }
                if (any) changed();
                return { html: msgs.join('<br>'), error: msgs.some(function (m) { return m.indexOf('⚠') === 0; }) };
            }
        });
        function list() {
            return Object.keys(store).sort().map(function (k) {
                var e = store[k];
                if (!cache[k]) cache[k] = unpack(e).map(opts.toPoint);
                return { key: k, name: '📥 ' + (e.from ? e.from + ' · ' : '') + e.title, from: e.from, n: e.n, points: cache[k] };
            });
        }
        return { share: share, list: list, stepChanged: function () { share.stepChanged(); } };
    }

    return { MAX_POINTS: MAX_POINTS, round: round, thin: thin, pack: pack, unpack: unpack, summaryEnv: summaryEnv, summarySingle: summarySingle,
        mergeIncoming: mergeIncoming, parseCsv: parseCsv, attach: attach };
});
