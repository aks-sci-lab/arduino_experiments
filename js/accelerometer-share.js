/* 가속도 실험(가속도계·스마트폰 가속도)·자유낙하의 조 공유 도우미 — js/class-share.js 와 같이 쓴다
   - 보낼 자료 줄이기: 측정 줄을 소수 몇 자리로 반올림하고, 너무 길면 고르게 솎아 27만 자 안에 넣는다
   - 요약 숫자: 교사 진행 보기·시트에 보일 몇 개 (이름은 서버 규칙: 한글·영어·숫자·공백·.()-, 30자까지)
   - 받은 자료: 같은 조 다른 노트북이 보낸 것을 '노트북:id' 로 따로 보관 (내 기록과 섞지 않음)
   브라우저: window.AccelShare, Node 시험: require('./accelerometer-share.js') */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.AccelShare = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var DATA_MAX = 260000;   // class-share.js 의 한도(27만 자)보다 조금 작게

    function round(v, d) { var k = Math.pow(10, d); return Math.round(Number(v) * k) / k; }
    function finite(v) { return typeof v === 'number' && isFinite(v); }

    /* rows: [[t, a, b, …], …] → { cols, digits, step, rows } (JSON 길이가 maxChars 이하가 될 때까지 step 을 늘려 솎음) */
    function pack(rows, cols, digits, maxChars) {
        maxChars = maxChars || DATA_MAX;
        var clean = (rows || []).filter(function (r) { return Array.isArray(r) && r.length >= cols.length && r.slice(0, cols.length).every(function (v) { return isFinite(Number(v)); }); })
            .map(function (r) { return cols.map(function (_, i) { return round(r[i], digits[i]); }); });
        var step = 1, out;
        for (;;) {
            var pick = [];
            for (var i = 0; i < clean.length; i += step) pick.push(clean[i]);
            out = { cols: cols.slice(), step: step, rows: pick };
            if (JSON.stringify(out).length <= maxChars || pick.length <= 2) return out;
            step++;
        }
    }
    // 받은 자료 → 줄 배열 (모양이 틀리면 [])
    function unpack(data, cols) {
        if (!data || !Array.isArray(data.rows) || !Array.isArray(data.cols)) return [];
        var idx = cols.map(function (c) { return data.cols.indexOf(c); });
        if (idx.some(function (i) { return i < 0; })) return [];
        return data.rows.filter(Array.isArray).map(function (r) { return idx.map(function (i) { return Number(r[i]); }); })
            .filter(function (r) { return r.every(isFinite); });
    }

    /* 가속도 줄 [[t(s), x, y, z], …] → 요약 { '점', '시간 (s)', '평균 a (g)', '최대 a (g)' } (a = 세 축 크기) */
    function accelSummary(rows) {
        var n = rows.length;
        if (!n) return { '점': 0 };
        var sum = 0, max = 0;
        rows.forEach(function (r) { var a = Math.sqrt(r[1] * r[1] + r[2] * r[2] + r[3] * r[3]); sum += a; if (a > max) max = a; });
        // 앞의 것부터 폰 회차 목록(3개)·교사 진행 보기(4개)에 보이므로 중요한 숫자를 먼저
        return { '최대 a (g)': round(max, 3), '평균 a (g)': round(sum / n, 3), '시간 (s)': round(rows[n - 1][0] - rows[0][0], 3), '점': n };
    }
    var ACCEL_COLS = ['t', 'x', 'y', 'z'], ACCEL_DIGITS = [4, 4, 4, 4];
    // 가속도 측정 하나 → class-share 의 item ({ id, title, n, summary, data })
    function accelItem(id, title, rows) {
        var packed = pack(rows, ACCEL_COLS, ACCEL_DIGITS);
        return { id: id, title: title, n: rows.length, summary: accelSummary(rows), data: packed };
    }
    function accelRows(data) { return unpack(data, ACCEL_COLS); }

    /* 받은 목록 → 보관함 { '노트북:id': { from, title, n, summary, rows, sentAt } }
       convert(item) 가 그 실험에 맞게 바꾼 값(없으면 null 이라 뺌). 바뀌었으면 changed true */
    function replaceIncoming(old, items, convert) {
        var next = {};
        (items || []).forEach(function (it) {
            var v = convert(it);
            if (v) next[it.device + ':' + it.id] = Object.assign({ from: it.from, device: it.device, id: it.id, title: it.title, n: it.n, summary: it.summary || {}, sentAt: it.sentAt }, v);
        });
        var a = Object.keys(old || {}).sort(), b = Object.keys(next).sort();
        var changed = a.length !== b.length || a.some(function (k, i) { return k !== b[i] || String(old[k].sentAt) !== String(next[k].sentAt); });
        return { store: next, changed: changed };
    }

    /* ---------- 자유낙하 ---------- */
    var FF_COLS = ['t', 'x', 'y'], FF_DIGITS = [4, 2, 2];
    var FF_MODES = { 'free-fall': '자유낙하', projectile: '2차원 운동' };
    // fit: { g, r2, errPct, vx, vxR2 } (없는 값은 null)
    function freeFallSummary(mode, n, fit) {
        fit = fit || {};
        // 앞의 것부터 폰 회차 목록(3개)·교사 진행 보기(4개)에 보이므로 g 를 먼저
        var s = {};
        if (finite(fit.g)) s.g = round(fit.g, 3);
        if (finite(fit.errPct)) s['오차(퍼센트)'] = round(fit.errPct, 1);
        if (finite(fit.r2)) s.R2 = round(fit.r2, 4);
        if (finite(fit.vx)) s.vx = round(fit.vx, 3);
        s['종류'] = FF_MODES[mode] || mode;
        s['점'] = n;
        return s;
    }
    // mine: { mode, rows: [{t,x,y}], mmPerPx, fps, fit } → item
    function freeFallItem(mine) {
        var rows = (mine.rows || []).map(function (r) { return [r.t, r.x, r.y]; });
        var data = pack(rows, FF_COLS, FF_DIGITS);
        data.mode = mine.mode; data.mmPerPx = mine.mmPerPx;
        if (isFinite(Number(mine.fps)) && Number(mine.fps) > 0) data.fps = Number(mine.fps);   // 영상 FPS (영상 자체는 셀 한도 때문에 보내지 않음)
        return { id: mine.mode === 'projectile' ? 'pj' : 'ff', title: (FF_MODES[mine.mode] || '측정') + ' ' + rows.length + '점', n: rows.length,
            summary: freeFallSummary(mine.mode, rows.length, mine.fit), data: data };
    }
    function freeFallFromData(data) {
        if (!data || !FF_MODES[data.mode]) return null;
        var rows = unpack(data, FF_COLS).map(function (r) { return { t: r[0], x: r[1], y: r[2] }; });
        return rows.length ? { mode: data.mode, rows: rows } : null;
    }

    return {
        DATA_MAX: DATA_MAX, pack: pack, unpack: unpack, round: round,
        accelSummary: accelSummary, accelItem: accelItem, accelRows: accelRows, replaceIncoming: replaceIncoming,
        FF_MODES: FF_MODES, freeFallSummary: freeFallSummary, freeFallItem: freeFallItem, freeFallFromData: freeFallFromData
    };
});
