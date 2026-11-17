// 심박수 원본 회차(폰 → 노트북) 담기·풀기 (브라우저·Node 공용, 화면 없음). 시험 tests/heart-rate-raw.test.cjs
//  선생님 지시 "측정은 스마트폰, 분석은 노트북에서": 폰이 잰 원본 frames(t·R·G·B·Y·노출·ISO·포화)를 조 공유(exp heartrate, kind 'raw')로 보내고
//  노트북(숨 참기 탐구·데이터 가공 실험실)이 받아 그대로 계산한다. 서버 칸 한도(45,000자 × 6칸 ≈ 27만 자)에 3분·30장/초(약 5400장)도 들어가게 줄여 담는다.
//   - 시각: 앞 프레임과의 차이(ms, 정수)  - R·G·B·Y: 0.01 단위 정수의 앞 값과의 차이  - 노출·ISO·포화: 같은 값이 이어지면 [값, 개수]
//   - 그래도 크면 고르게 솎고(decimate: k장마다 1장) 그 사실을 남김
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.HeartRateRaw = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const LIMIT = 250000;   // 자료 JSON 글자 수 (서버 27만 자보다 조금 작게)

    const delta = arr => { const out = []; let p = 0; arr.forEach(v => { out.push(v - p); p = v; }); return out; };
    const undelta = arr => { const out = []; let p = 0; (arr || []).forEach(d => { p += Number(d) || 0; out.push(p); }); return out; };
    const rle = arr => { const out = []; arr.forEach(v => { const last = out[out.length - 1]; if (last && last[0] === v) last[1]++; else out.push([v, 1]); }); return out; };
    const unrle = (arr, n) => { const out = []; (arr || []).forEach(([v, c]) => { for (let i = 0; i < c; i++) out.push(v); }); while (out.length < n) out.push(null); return out.slice(0, n); };
    const q = (v, k) => Number.isFinite(Number(v)) ? Math.round(Number(v) * k) : null;

    // frames: 계산 모양 { t(초), r, g, b?, y, exposureTime, iso, s } → 담은 묶음
    function packCols(frames) {
        const t0 = frames.length ? frames[0].t : 0;
        const tms = frames.map(f => Math.round((f.t - t0) * 1000));
        const ch = k => delta(frames.map(f => q(f[k], 100) || 0));
        return {
            n: frames.length, dt: delta(tms), r: ch('r'), g: ch('g'), b: frames.some(f => Number.isFinite(Number(f.b))) ? ch('b') : null, y: ch('y'),
            et: rle(frames.map(f => (f.exposureTime == null ? null : Math.round(Number(f.exposureTime) * 1000) / 1000))),
            iso: rle(frames.map(f => (f.iso == null ? null : Math.round(Number(f.iso))))),
            s: rle(frames.map(f => q(f.s, 100) || 0))
        };
    }
    function unpackCols(c) {
        const n = Number(c && c.n) || 0;
        if (!n) return [];
        const t = undelta(c.dt), ch = k => (c[k] ? undelta(c[k]).map(v => v / 100) : null);
        const r = ch('r'), g = ch('g'), b = ch('b'), y = ch('y'), et = unrle(c.et, n), iso = unrle(c.iso, n), s = unrle(c.s, n);
        const out = [];
        for (let i = 0; i < n; i++) {
            const e = et[i], is = iso[i];
            const f = { t: (t[i] || 0) / 1000, r: r ? r[i] : null, g: g ? g[i] : null, y: y ? y[i] : null, exposureTime: e, iso: is,
                e: Number.isFinite(e) && e > 0 ? e * (Number.isFinite(is) && is > 0 ? is : 1) : null, s: (s[i] || 0) / 100 };
            if (b) f.b = b[i];
            out.push(f);
        }
        return out;
    }

    // 원본 회차 → 조 공유 자료 (kind 'raw'). meta: { mode: 'once'|'breath', at, lock, why, lockLog, scene, ph, torch, label }
    function rawPack(frames, meta) {
        meta = meta || {};
        let fr = (frames || []).filter(f => f && Number.isFinite(f.t)), k = 1;
        const make = () => ({
            kind: 'raw', v: 1, mode: meta.mode === 'breath' ? 'breath' : 'once', at: meta.at || '', lock: meta.lock || '', why: String(meta.why || '').slice(0, 200),
            lockLog: meta.lockLog || null, scene: meta.scene || null, ph: meta.ph || null, torch: !!meta.torch, decimate: k, frames0: (frames || []).length, cols: packCols(fr)
        });
        let d = make();
        while (JSON.stringify(d).length > LIMIT && k < 20) { k++; fr = (frames || []).filter((_, i) => i % k === 0); d = make(); }
        if (JSON.stringify(d).length > LIMIT) { d.lockLog = null; d.cols = packCols(fr); }
        return d;
    }
    function rawUnpack(d) {
        if (!d || d.kind !== 'raw' || !d.cols) return null;
        return { frames: unpackCols(d.cols), mode: d.mode === 'breath' ? 'breath' : 'once', at: d.at || '', lock: d.lock || '', why: d.why || '', lockLog: d.lockLog || null,
            scene: d.scene || null, ph: d.ph || null, torch: !!d.torch, decimate: Number(d.decimate) || 1, frames0: Number(d.frames0) || 0 };
    }

    // 폰의 회차들 → ClassShare 항목. runs: [{ id, mode, at, frames(계산 모양), lock, why, lockLog, scene, ph, title, bpm, held }]
    //  요약은 폰에서 잰 대략값만: 한 번 재기 = 심박수, 숨 참기 = 참은 초
    function rawItems(runs) {
        return (runs || []).filter(r => r && r.frames && r.frames.length).map(r => {
            const d = rawPack(r.frames, r);
            const summary = r.mode === 'breath' ? { '참은 초': r.held == null ? null : Math.round(r.held * 10) / 10 } : { '심박수(회/분)': r.bpm == null ? null : Math.round(r.bpm * 10) / 10 };
            Object.keys(summary).forEach(k2 => { if (summary[k2] == null) delete summary[k2]; });
            if (d.decimate > 1) summary['솎음'] = d.decimate;
            return { id: String(r.id), title: String(r.title || (r.mode === 'breath' ? '🫁 숨 참기' : '❤️ 한 번 재기')), n: r.frames.length, at: r.at, summary, data: d };
        });
    }
    // 받은 항목 중 원본만 → [{ key, device, from, id, title, at, sentAt, raw(풀기 전 자료) }] (풀기는 고를 때 rawUnpack)
    function rawIncoming(items) {
        return (items || []).filter(it => it && it.data && it.data.kind === 'raw' && Number(it.n) > 0 && it.data.cols)
            .map(it => ({ key: it.device + '/' + it.id, device: String(it.device), from: String(it.from || ''), id: String(it.id), title: String(it.title || ''),
                at: String(it.data.at || it.at || it.sentAt || ''), sentAt: String(it.sentAt || ''), mode: it.data.mode === 'breath' ? 'breath' : 'once', raw: it.data }));
    }
    const timeText = at => { const d = new Date(at); return isNaN(d) ? '' : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); };

    return { LIMIT, rawPack, rawUnpack, rawItems, rawIncoming, packCols, unpackCols, timeText };
});
