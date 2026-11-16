/* 전자기 유도 실험의 조 공유 계산 (화면 없음, Node 시험 가능: tests/em-induction-share.test.cjs)
   - 저장한 측정(trial) 하나 = 시트 한 줄. 요약(봉우리·∫ε dt·ΔΦ)과 줄인 파형(최대 600점)을 보낸다
   - 같은 조 다른 노트북이 보낸 측정은 ext(출처별 묶음)에 따로 두고, 내 측정과 섞지 않는다
   쓰는 곳: projects/em-induction.html */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.EmShare = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var WAVE_MAX = 600;
    var num = function (x) { var n = Number(x); return Number.isFinite(n) ? n : null; };
    var round = function (x, d) { var p = Math.pow(10, d); return Math.round(x * p) / p; };

    function newId(random) {
        var R = typeof random === 'function' ? random : Math.random, s = 't';
        for (var i = 0; i < 8; i++) s += 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(R() * 32)];
        return s;
    }

    // 파형 줄이기: 구간마다 |전압|이 가장 큰 점을 남겨 봉우리를 놓치지 않는다. 처음·끝 점은 그대로
    function downsample(rec, max) {
        max = max || WAVE_MAX;
        var src = Array.isArray(rec) ? rec : [];
        var pick = [];
        if (src.length <= max) pick = src.slice();
        else {
            var inner = max - 2, step = (src.length - 2) / inner;
            pick.push(src[0]);
            for (var b = 0; b < inner; b++) {
                var lo = 1 + Math.floor(b * step), hi = Math.max(lo + 1, 1 + Math.floor((b + 1) * step));
                var best = src[lo];
                for (var k = lo + 1; k < hi && k < src.length - 1; k++) if (Math.abs(src[k].v) > Math.abs(best.v)) best = src[k];
                pick.push(best);
            }
            pick.push(src[src.length - 1]);
        }
        return { t: pick.map(function (p) { return round(p.t, 4); }), v: pick.map(function (p) { return round(p.v, 3); }), i: pick.map(function (p) { return round(p.i, 4); }) };
    }
    // 줄인 파형 → 그래프용 점 [{t, v, i}]
    function wavePoints(w) {
        if (!w || !Array.isArray(w.t) || !Array.isArray(w.v)) return [];
        var out = [];
        for (var k = 0; k < w.t.length; k++) {
            var t = num(w.t[k]), v = num(w.v[k]), i = num(w.i && w.i[k]);
            if (t === null || v === null) continue;
            out.push({ t: t, v: v, i: i === null ? 0 : i });
        }
        return out;
    }

    // 예전에 저장한 측정에는 id 가 없다 → 붙여 준다 (바뀌었으면 true)
    function fixTrials(trials, random) {
        var seen = {}, changed = false;
        (trials || []).forEach(function (t) {
            if (!t.id || !/^[A-Za-z0-9_-]{4,30}$/.test(t.id) || seen[t.id]) { t.id = newId(random); changed = true; }
            seen[t.id] = true;
        });
        return changed;
    }

    var FIELDS = ['N', 'maxV', 'minV', 'tMax', 'tMin', 'maxAbsI', 'integral', 'dPhi', 'samples'];

    // 보낼 것 (ClassShare getItems): 내 측정만
    function itemsFrom(trials) {
        return (trials || []).map(function (t) {
            var data = { v: 1, name: String(t.name || '측정'), order: String(t.order || '') };
            FIELDS.forEach(function (k) { var n = num(t[k]); if (n !== null) data[k] = n; });
            if (t.wave) data.wave = t.wave;
            return {
                id: t.id,
                title: String(t.name || '측정').slice(0, 60),
                n: Math.max(1, Math.round(num(t.samples) || (t.wave && t.wave.t ? t.wave.t.length : 1))),
                // 교사 진행 보기에는 앞 4개가 보인다: 봉우리 두 개·그래프 넓이·선속 변화
                summary: {
                    maxV_mV: round(num(t.maxV) || 0, 2), minV_mV: round(num(t.minV) || 0, 2),
                    int_mVs: round(num(t.integral) || 0, 4), dPhi_uWb: round(num(t.dPhi) || 0, 3), maxI_mA: round(num(t.maxAbsI) || 0, 4), N: num(t.N)
                },
                data: data
            };
        });
    }

    // 받은 자료 하나 → 화면용 측정 (모양이 이상하면 null)
    function trialFromData(d, extra) {
        if (!d || typeof d !== 'object') return null;
        var t = { name: String(d.name || (extra && extra.title) || '측정').slice(0, 60), order: String(d.order || '').slice(0, 20) };
        FIELDS.forEach(function (k) { t[k] = num(d[k]); });
        if (t.maxV === null || t.minV === null || t.integral === null) return null;
        if (t.N === null) t.N = 1;
        if (t.dPhi === null) t.dPhi = -t.integral / t.N * 1000;
        if (t.maxAbsI === null) t.maxAbsI = 0;
        if (d.wave && Array.isArray(d.wave.t) && Array.isArray(d.wave.v)) t.wave = { t: d.wave.t.slice(0, 2000), v: d.wave.v.slice(0, 2000), i: Array.isArray(d.wave.i) ? d.wave.i.slice(0, 2000) : [] };
        return Object.assign(t, extra || {});
    }

    // 같은 조 다른 노트북이 보낸 것 (ClassShare onIncoming 의 items) → ext 를 고쳐 씀. 바뀌었으면 true
    // ext: { '<출처 키>': trial } — 서버에서 온 것은 'd:<노트북>:<id>', CSV 파일은 'f:<이름>' (불러오기로 지우지 않음)
    function applyIncoming(ext, items) {
        var next = {};
        (items || []).forEach(function (it) {
            var t = trialFromData(it.data, { title: it.title });
            if (!t) return;
            var key = 'd:' + it.device + ':' + it.id;
            t.key = key; t.from = it.from || ('노트북 ' + String(it.device).slice(-4).toUpperCase()); t.sentAt = String(it.sentAt || '');
            next[key] = t;
        });
        var before = JSON.stringify(Object.keys(ext).filter(function (k) { return k.indexOf('d:') === 0; }).sort().map(function (k) { return [k, ext[k]]; }));
        var after = JSON.stringify(Object.keys(next).sort().map(function (k) { return [k, next[k]]; }));
        if (before === after) return false;
        Object.keys(ext).forEach(function (k) { if (k.indexOf('d:') === 0) delete ext[k]; });
        Object.keys(next).forEach(function (k) { ext[k] = next[k]; });
        return true;
    }

    // 이 페이지가 내려받은 CSV (time_s,voltage_mV,current_mA) → 샘플 [{t, v, i}] 또는 { error }
    function parseCsv(text) {
        var lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
        if (!lines.length || !/^time_s\s*,\s*voltage_mV\s*,\s*current_mA/i.test(lines[0])) return { error: '이 페이지의 ⬇ CSV 저장 파일이 아닙니다 (첫 줄 time_s,voltage_mV,current_mA).' };
        var rec = [];
        for (var k = 1; k < lines.length; k++) {
            var p = lines[k].split(',').map(Number);
            if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) rec.push({ t: p[0], v: p[1], i: p[2] });
        }
        if (rec.length < 4) return { error: '측정값이 너무 적습니다.' };
        return { rec: rec };
    }

    return { WAVE_MAX: WAVE_MAX, newId: newId, downsample: downsample, wavePoints: wavePoints, fixTrials: fixTrials,
        itemsFrom: itemsFrom, trialFromData: trialFromData, applyIncoming: applyIncoming, parseCsv: parseCsv };
});
