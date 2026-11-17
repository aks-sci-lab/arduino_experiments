// 스마트폰 카메라 심박수: 조 공유(js/class-share.js)에 넘길 자료 · 같은 조 다른 기기에서 받은 회차 정리 (브라우저/Node 공용, 화면 없음)
//  - 보낼 것: 내 회차 하나 = 시트 한 줄 (제목 '안정 시' 등, 요약: 심박수·손목·신뢰도·노출 고정, 자료: 결과 + 원본 프레임 값)
//    원본(t, R, G, Y, 노출)도 보냄 — 선생님이 시트에 모인 자료로 계산 방법을 고쳐 나가기 위해 (영상은 보내지 않음)
//  - 받은 것: 기기·회차별로 따로 보관 (내 회차와 섞지 않음), 결과 단계의 회복 그래프·회차 고르기에 '📱 폰 AB12 · 운동 직후' 로
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./heart-rate-math.js'));
    else root.HeartRateShare = factory(root.HeartRateMath);
})(typeof self !== 'undefined' ? self : this, function (H) {
    'use strict';

    const MAX_CHARS = 250000;   // 서버 자료 한도(27만 자)보다 조금 작게
    const num = (v, d) => { const x = Number(v); return Number.isFinite(x) ? +x.toFixed(d) : null; };

    // 저장 모양 프레임 [t(ms), R, G, Y, exposureTime, iso, s] ↔ 계산 모양 { t(초), r, g, y, exposureTime, iso, e, s }
    function toFrames(raw) {
        return (Array.isArray(raw) ? raw : []).filter(a => Array.isArray(a) && Number.isFinite(Number(a[0]))).map(a => {
            const et = a[4] == null || a[4] === '' ? null : Number(a[4]), iso = a[5] == null || a[5] === '' ? null : Number(a[5]);
            return { t: Number(a[0]) / 1000, r: Number(a[1]), g: Number(a[2]), y: Number(a[3]), exposureTime: et, iso,
                e: Number.isFinite(et) && et > 0 ? et * (Number.isFinite(iso) && iso > 0 ? iso : 1) : null, s: Number(a[6]) || 0 };
        });
    }
    function fromFrames(frames) {
        const t0 = frames.length ? frames[0].t : 0;
        return frames.map(f => [Math.round((f.t - t0) * 1000), num(f.r, 2), num(f.g, 2), num(f.y, 2),
            f.exposureTime == null ? null : num(f.exposureTime, 3), f.iso == null ? null : num(f.iso, 0), num(f.s, 2) || 0]);
    }
    // 너무 길면 고르게 솎음 (서버 자료 한도)
    function fitRaw(raw) {
        let r = raw, step = 1;
        while (JSON.stringify(r).length > MAX_CHARS && step < 16) { step++; r = raw.filter((_, i) => i % step === 0); }
        return r;
    }

    const LOCK_TEXT = { locked: '됨', unsupported: '안 됨', failed: '안 됨', sim: '시뮬레이션', csv: '파일' };

    // 내 회차들 → ClassShare 항목. runs: [{ id, at, label, memo, lock, torch, palp, sim, raw, res }]
    function buildItems(runs) {
        return (runs || []).map(r => {
            const res = r.res || {}, palp = H.palpBpm(r.palp);
            const summary = { '심박수(회/분)': num(res.bpm, 1), '손목(회/분)': palp, '신뢰도': num(res.conf, 2), '노출 고정': LOCK_TEXT[r.lock] || '?' };
            if (palp != null && res.bpm != null) summary['오차(%)'] = H.errorPct(res.bpm, palp);
            // 빈 값은 빼기 (폰 회차 목록·교사 화면에 0.00 으로 보이지 않게)
            Object.keys(summary).forEach(k => { if (summary[k] == null) delete summary[k]; });
            const item = {
                id: String(r.id), title: (r.label || '회차') + (r.sim ? ' (시뮬레이션)' : ''), n: (r.raw || []).length, at: r.at, summary,
                data: { v: 1, at: r.at, label: r.label || '', lock: r.lock || '', torch: !!r.torch, sim: !!r.sim, palp: r.palp == null ? null : Number(r.palp),
                    bpm: num(res.bpm, 1), conf: num(res.conf, 2), level: res.level || '', method: res.method || '', ibi: (res.ibi || []).slice(0, 400),
                    expWarn: !!(res.exposure && res.exposure.warn), raw: fitRaw(r.raw || []) }
            };
            return item;
        });
    }

    // ClassShare 의 onIncoming(items) → 새 ext ({ 'device/id': {...} }). 서버 목록은 늘 그 조의 전체라 통째로 새로 만든다
    function applyIncoming(oldExt, items) {
        const ext = {};
        (items || []).forEach(it => {
            if (!it || !it.device || !it.data || !(Number(it.n) > 0)) return;
            const d = it.data, raw = Array.isArray(d.raw) ? d.raw : [];
            if (!raw.length && !Number.isFinite(Number(d.bpm))) return;
            ext[it.device + '/' + it.id] = {
                device: String(it.device), from: String(it.from || ''), id: String(it.id), title: String(it.title || ''),
                at: String(d.at || it.at || it.sentAt || ''), label: String(d.label || ''), lock: String(d.lock || ''), sim: !!d.sim,
                palp: d.palp == null ? null : Number(d.palp), bpm: Number.isFinite(Number(d.bpm)) ? Number(d.bpm) : null,
                conf: Number.isFinite(Number(d.conf)) ? Number(d.conf) : null, raw
            };
        });
        return { ext, changed: JSON.stringify(ext) !== JSON.stringify(oldExt || {}) };
    }

    // 회복 그래프용: 출처별 묶음 [{ key, name, points: [{x, y, label}] }]
    function recoveryGroups(myRuns, ext) {
        const groups = [];
        const mine = (myRuns || []).filter(r => !r.sim).map(r => ({ at: r.at, label: r.label, bpm: r.res && r.res.bpm }));
        if (mine.length) groups.push({ key: 'me', name: '내 기록', points: H.recovery(mine) });
        const byDev = {};
        Object.keys(ext || {}).forEach(k => { const e = ext[k]; if (e.sim) return; (byDev[e.device] = byDev[e.device] || { name: e.from, list: [] }).list.push({ at: e.at, label: e.label, bpm: e.bpm }); });
        Object.keys(byDev).forEach(dev => { const pts = H.recovery(byDev[dev].list); if (pts.length) groups.push({ key: dev, name: byDev[dev].name, points: pts }); });
        return groups.filter(g => g.points.length);
    }

    return { buildItems, applyIncoming, recoveryGroups, toFrames, fromFrames, fitRaw, LOCK_TEXT, MAX_CHARS };
});
