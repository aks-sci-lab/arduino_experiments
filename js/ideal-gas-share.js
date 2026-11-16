/* 이상기체 실험 — 조 공유 자료 바꾸기 (브라우저·Node 공용, 시험: tests/ideal-gas-share.test.cjs)
   공통 부품 js/class-share.js(docs/class-share.md)에 넘길 '보낼 것'과 '받은 것 합치기'를 맡는다.
   - 보낼 것: 이 노트북이 직접 잰 실험 1(보일) 한 줄, 실험 2(샤를·게이뤼삭) 한 줄 (측정이 없으면 빼서 서버에서 '지움')
   - 받은 것: state.ext[출처] = { from, sentAt, boyle: [{v,p,t,dir}], gay: [{s,t,p}] } 로 내 기록과 따로 보관
     출처는 다른 노트북 'd:<노트북 번호>' 또는 CSV 파일 'f:<파일 이름>'
   - 분석·표·그래프에는 내 기록 뒤에 불러온 값을 붙여 쓴다 (combined) */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.IdealGasShare = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAX_POINTS = 1500;
    const okNum = x => typeof x === 'number' && isFinite(x);
    const r = (x, d) => +Number(x).toFixed(d);
    // 받은 점이 말이 되는지 (잘못된 자료가 그래프를 망치지 않게)
    function cleanBoyle(list) {
        return (Array.isArray(list) ? list : []).filter(q => q && okNum(q.v) && q.v > 0 && okNum(q.p) && q.p > 0 && q.p < 200 && okNum(q.t) && q.t > -30 && q.t < 80)
            .slice(0, MAX_POINTS).map(q => ({ v: q.v, p: q.p, t: q.t, dir: q.dir === 'up' ? 'up' : 'down' }));
    }
    function cleanGay(list) {
        return (Array.isArray(list) ? list : []).filter(q => q && okNum(q.s) && okNum(q.p) && q.p > 0 && q.p < 200 && okNum(q.t) && q.t > -30 && q.t < 80)
            .slice(0, MAX_POINTS).map(q => ({ s: q.s, t: q.t, p: q.p }));
    }

    // 실험 2 기록(at, ms) → 처음부터 지난 시간(s)
    function gayPoints(list) {
        const t0 = list.length ? list[0].at : 0;
        return list.map(q => ({ s: (q.at - t0) / 1000, t: q.t, p: q.p }));
    }

    // 요약 이름은 서버 규칙 ^[A-Za-z0-9_가-힣 .()-]{1,30}$ 에 맞춘다 (apps-script/Code.gs cleanSummary)
    /* 보낼 것: o = { boyle, gay, dead, ba, ga } (ba·ga 는 내 기록만으로 낸 분석, 없으면 null) */
    function buildItems(o) {
        const items = [];
        const fx = (v, d) => (okNum(v) ? r(v, d) : null);
        const pct = (v, d) => (okNum(v) ? v.toFixed(d) + '%' : null);   // 서버 요약 이름에는 % 를 쓸 수 없어 값에 붙인다
        const pick = obj => { const out = {}; Object.keys(obj).forEach(k => { if (obj[k] != null) out[k] = obj[k]; }); return out; };
        if (o.boyle && o.boyle.length) {
            const ba = o.ba;
            items.push({
                id: 'boyle1', title: '실험 1 보일 법칙 (' + o.boyle.length + '점)', n: o.boyle.length,
                summary: pick({
                    'PV 평균': ba ? fx(ba.pvMean, 0) : null, 'PV 변동': ba ? pct(ba.pvCv, 2) : null,
                    'R2': ba && ba.fit ? fx(ba.fit.r2, 4) : null, '절편(mL)': ba && ba.fit ? fx(ba.fit.intercept, 2) : null
                }),
                data: { dead: okNum(o.dead) ? o.dead : 0, points: o.boyle.map(q => ({ v: q.v, p: q.p, t: q.t, dir: q.dir === 'up' ? 'up' : 'down' })) }
            });
        }
        if (o.gay && o.gay.length) {
            const ga = o.ga;
            items.push({
                id: 'gay1', title: '실험 2 샤를·게이뤼삭 (' + o.gay.length + '점)', n: o.gay.length,
                summary: pick({
                    '절대 영도(C)': ga && ga.t0 != null ? fx(ga.t0, 1) : null, '오차율': ga && ga.errPct != null ? pct(ga.errPct, 1) : null,
                    'R2': ga && ga.fit ? fx(ga.fit.r2, 4) : null, '온도 폭(C)': ga ? fx(ga.tMax - ga.tMin, 1) : null
                }),
                data: { points: gayPoints(o.gay).map(q => ({ s: r(q.s, 1), t: q.t, p: q.p })) }
            });
        }
        return items;
    }

    /* 다른 노트북에서 받은 것 → ext 를 바꿈 (그 노트북 것은 통째로 바꿔 씀). 바뀌었으면 true
       items: class-share 의 incomingFrom 결과 [{ id, device, from, data, sentAt }] — 서버 목록 전체이므로, 목록에 없는 노트북은 지운다 */
    function applyIncoming(ext, items) {
        const next = {};
        for (const it of items || []) {
            if (!it || !it.device) continue;
            const key = 'd:' + it.device;
            const e = next[key] || (next[key] = { from: it.from || ('노트북 ' + String(it.device).slice(-4).toUpperCase()), sentAt: '', boyle: [], gay: [] });
            const d = it.data && typeof it.data === 'object' ? it.data : {};
            if (it.id === 'boyle1') e.boyle = cleanBoyle(d.points);
            else if (it.id === 'gay1') e.gay = cleanGay(d.points);
            if (String(it.sentAt || '') > e.sentAt) e.sentAt = String(it.sentAt || '');
        }
        let changed = false;
        for (const k of Object.keys(ext)) {
            if (k.indexOf('d:') !== 0) continue;
            if (!next[k]) { delete ext[k]; changed = true; }
        }
        for (const k of Object.keys(next)) {
            const e = next[k];
            if (!e.boyle.length && !e.gay.length) { if (ext[k]) { delete ext[k]; changed = true; } continue; }
            const old = ext[k];
            if (!old || JSON.stringify([old.boyle, old.gay]) !== JSON.stringify([e.boyle, e.gay])) changed = true;
            ext[k] = e;
        }
        return changed;
    }

    function extCount(ext) {
        return Object.keys(ext || {}).reduce((n, k) => n + ext[k].boyle.length + ext[k].gay.length, 0);
    }

    /* 내 기록 + 불러온 값 (분석·표·그래프용). 불러온 점에는 from(출처 이름)이 붙는다 */
    function combined(state) {
        const boyle = state.boyle.map(q => ({ v: q.v, p: q.p, t: q.t, dir: q.dir }));
        const gay = gayPoints(state.gay);
        const ext = state.ext || {};
        for (const k of Object.keys(ext)) {
            const e = ext[k];
            e.boyle.forEach(q => boyle.push({ v: q.v, p: q.p, t: q.t, dir: q.dir, from: e.from }));
            e.gay.forEach(q => gay.push({ s: q.s, t: q.t, p: q.p, from: e.from }));
        }
        return { boyle, gay };
    }

    /* 이 페이지의 CSV(6. 결과 → CSV 다운로드)를 읽는다 → { boyle, gay } 또는 { error }
       열: experiment,no,process,time_s,scale_volume_mL,air_volume_mL,pressure_kPa,temp_C,PV_kPa_mL,P_over_T_kPa_per_K,source */
    function parseCsv(text) {
        const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
        if (!lines.length) return { error: '빈 파일입니다.' };
        const head = lines[0].split(',').map(s => s.trim());
        const col = name => head.indexOf(name);
        const iE = col('experiment'), iP = col('process'), iS = col('time_s'), iV = col('scale_volume_mL'), iPr = col('pressure_kPa'), iT = col('temp_C'), iSrc = col('source');
        if (iE < 0 || iPr < 0 || iT < 0) return { error: '이 실험 페이지에서 받은 CSV 가 아닙니다 (첫 줄에 experiment, pressure_kPa, temp_C 가 있어야 함).' };
        const boyle = [], gay = [];
        for (const line of lines.slice(1)) {
            const c = line.split(',');
            if (iSrc >= 0 && /^from:/.test(c[iSrc] || '')) continue;   // 그 노트북도 불러온 값은 빼고 (겹치지 않게)
            const n = i => (i >= 0 ? parseFloat(c[i]) : NaN);
            if (c[iE] === 'boyle') boyle.push({ v: n(iV), p: n(iPr), t: n(iT), dir: c[iP] === 'up' ? 'up' : 'down' });
            else if (c[iE] === 'gay-lussac') gay.push({ s: n(iS), t: n(iT), p: n(iPr) });
        }
        const out = { boyle: cleanBoyle(boyle), gay: cleanGay(gay) };
        if (!out.boyle.length && !out.gay.length) return { error: '읽을 수 있는 측정값이 없습니다.' };
        return out;
    }

    return { buildItems, applyIncoming, extCount, combined, parseCsv, gayPoints, cleanBoyle, cleanGay };
});
