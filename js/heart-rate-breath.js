// 숨 참기 탐구 (2부): 안정 → 숨 참기 → 회복 연속 측정의 계산 (브라우저·Node 공용, 화면 없음). 시험 tests/heart-rate-breath.test.cjs
//  설계: docs/data-processing-class-design.md '2부'. 손가락 맥파 계산은 js/heart-rate-math.js 의 analyzeRun 을 그대로 씀(그 파일은 고치지 않음)
//  - breathCurve: 10초 창을 1초씩 밀며 심박수 곡선 (창 가운데 시각, 신뢰도)
//  - breathMetrics: 안정 평균, 숨 참기 마지막 10초 평균, 변화율(%), 가장 낮은 값과 그 시각, 회복 시간(안정 ±5% 로 돌아오기까지)
//  - breathSimulate: 시각에 따라 심박이 바뀌는 가짜 맥파 (시험·연습용)
//  - breathCsv, breathItems: CSV(한 줄 = 1초 곡선), 조 공유 항목(kind 'breath', 동의한 회차만)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./heart-rate-math.js'));
    else root.HeartRateBreath = factory(root.HeartRateMath);
})(typeof self !== 'undefined' ? self : this, function (H) {
    'use strict';

    const REST = 60, RECOVER = 60, WIN = 10, STEP = 1;
    const MIN_CONF = 0.45;          // 이보다 낮은 창은 지표 계산에서 뺌
    const EXERCISE = ['주 0회', '주 1~2회', '주 3~4회', '주 5회 이상'];
    const HEIGHT = ['150 미만', '150대', '160대', '170대', '180 이상'];
    const WEIGHT = ['40 미만', '40대', '50대', '60대', '70대', '80대', '90 이상'];   // kg, 10 kg 구간
    const round = (x, d) => Number.isFinite(x) ? +x.toFixed(d) : null;
    const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;

    // ---------- 연속 곡선 ----------
    // frames: 계산 모양 프레임 { t(초), r, g, y, e … } (첫 프레임 = 0초로 봄), opts: { lock, win, step, scene }
    // → [{ t(창 가운데, 초), bpm, conf, level, ok }]
    function breathCurve(frames, opts) {
        opts = opts || {};
        const win = opts.win || WIN, step = opts.step || STEP;
        const fr = (frames || []).filter(f => f && Number.isFinite(f.t));
        if (fr.length < 20) return [];
        const t0 = fr[0].t, tEnd = fr[fr.length - 1].t - t0, out = [];
        // 1초마다 손가락이 카메라를 덮었는지 (H.quality) — 한 초라도 안 덮였으면 그 초를 품은 창은 쓰지 않음
        const covered = [];
        for (let s = 0; s <= Math.ceil(tEnd); s++) {
            const sec = fr.filter(f => f.t - t0 >= s && f.t - t0 < s + 1);
            covered.push(sec.length < 5 ? true : H.quality(sec).covered);
        }
        for (let a = 0; a + win <= tEnd + 1e-9; a += step) {
            const seg = fr.filter(f => f.t - t0 >= a && f.t - t0 < a + win);
            const allCovered = covered.slice(Math.floor(a), Math.ceil(a + win)).every(Boolean);
            if (seg.length < 20 || !allCovered) { out.push({ t: round(a + win / 2, 2), bpm: null, conf: 0, level: 'bad', ok: false, uncovered: !allCovered }); continue; }
            const r = H.analyzeRun(opts.lock || 'unlocked', seg, { scene: opts.scene });
            const ok = !!r.ok && r.bpm != null && (r.conf || 0) >= MIN_CONF && r.level !== 'bad';
            out.push({ t: round(a + win / 2, 2), bpm: r.bpm == null ? null : round(r.bpm, 1), conf: round(r.conf || 0, 2), level: r.level, ok });
        }
        return out;
    }

    // ---------- 지표 ----------
    // curve: breathCurve 결과, ph: { holdStart, holdEnd, end, holdPlanned, stopped } (초, 첫 프레임 기준)
    function breathMetrics(curve, ph) {
        const good = (curve || []).filter(p => p.ok && Number.isFinite(p.bpm));
        const half = WIN / 2;
        const inRange = (a, b) => good.filter(p => p.t >= a - 1e-9 && p.t <= b + 1e-9);
        const holdLen = ph.holdEnd - ph.holdStart;
        // 안정: 창 전체가 안정 구간 안 (가운데 5초 ~ 숨 참기 시작 5초 전)
        const rest = inRange(half, ph.holdStart - half);
        const restMean = rest.length ? mean(rest.map(p => p.bpm)) : NaN;
        // 숨 참기 마지막 10초: 그 10초를 덮는 창(가운데 = 끝 − 5초)과 앞뒤 1초 창 셋의 평균 (한 창만 쓰면 잡음에 약함)
        //  짧게 참아 10초가 안 되면 숨 참기 안에 가운데가 있는 창
        const c = Math.max(ph.holdStart + half, ph.holdEnd - half);
        let holdLast = inRange(c - 1, Math.min(c + 1, Math.max(c, ph.holdEnd - half + 1)));
        if (!holdLast.length) holdLast = inRange(ph.holdStart, ph.holdEnd);
        const holdLastMean = holdLast.length ? mean(holdLast.map(p => p.bpm)) : NaN;
        const changePct = Number.isFinite(restMean) && Number.isFinite(holdLastMean) ? (holdLastMean - restMean) / restMean * 100 : NaN;
        // 가장 낮은 값과 그 시각 (숨 참기 시작부터 끝까지)
        const after = inRange(ph.holdStart, ph.end);
        let low = null;
        after.forEach(p => { if (!low || p.bpm < low.bpm) low = p; });
        // 회복 시간: 숨 참기가 끝난 뒤, 안정 ±5% 안에 5초(창 5개) 이어서 들어온 첫 시각까지
        let recovery = null;
        if (Number.isFinite(restMean)) {
            const rec = (curve || []).filter(p => p.t >= ph.holdEnd - 1e-9);
            let run = 0;
            for (let i = 0; i < rec.length; i++) {
                const p = rec[i];
                if (p.ok && Math.abs(p.bpm - restMean) / restMean <= 0.05) { run++; if (run >= 5) { recovery = rec[i - 4].t - ph.holdEnd; break; } }
                else if (p.ok) run = 0;
            }
        }
        const dropped = (curve || []).length - good.length;
        return {
            restMean: round(restMean, 1), holdLastMean: round(holdLastMean, 1), changePct: round(changePct, 1),
            low: low ? { bpm: round(low.bpm, 1), t: round(low.t - ph.holdStart, 1) } : null,
            recoverySec: recovery == null ? null : round(Math.max(0, recovery), 1),
            recoveryText: recovery == null ? '60초 안에 안 돌아옴' : `${Math.round(Math.max(0, recovery))}초`,
            heldSec: round(holdLen, 1), planned: ph.holdPlanned, stopped: !!ph.stopped,
            dropped, total: (curve || []).length,
            counts: { rest: rest.length, holdLast: holdLast.length }
        };
    }

    // ---------- 시뮬레이션: 시각에 따라 심박이 바뀌는 가짜 맥파 ----------
    // o: { bpmAt(t) 함수 또는 profile: { rest, holdEnd(숨 참기 끝 심박), holdSec, stopAt }, dur, fps, jitter, noise, amp, seed }
    function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    // 안정 rest → 숨 참기 동안 holdEnd 까지 곧게 바뀜 → 끝나면 tau 초로 지수적으로 안정으로 돌아옴
    function breathProfile(p) {
        const held = p.stopAt != null ? p.stopAt : p.holdSec, hs = REST, he = REST + held, tau = p.tau || 12;
        const target = p.rest + (p.holdEnd - p.rest) * (held / p.holdSec);
        return t => t < hs ? p.rest : t < he ? p.rest + (target - p.rest) * (t - hs) / held : p.rest + (target - p.rest) * Math.exp(-(t - he) / tau) + (p.overshoot || 0) * Math.exp(-(t - he) / 4) * (t - he > 0 ? 1 : 0);
    }
    function breathSimulate(o) {
        o = Object.assign({ fps: 30, jitter: 0.3, noise: 0.003, amp: 0.02, seed: 1, dicrotic: 0.35 }, o || {});
        const bpmAt = o.bpmAt || breathProfile(o.profile);
        const dur = o.dur || (REST + (o.profile ? (o.profile.stopAt != null ? o.profile.stopAt : o.profile.holdSec) : 30) + RECOVER);
        const rand = rng(o.seed), beats = [];
        let tb = -rand() * 60 / bpmAt(0);
        while (tb < dur + 2) { beats.push(tb); tb += 60 / bpmAt(Math.max(0, tb)) * (1 + 0.02 * (rand() * 2 - 1)); }
        const frames = [];
        let k = 0, t = 0;
        while (t <= dur) {
            while (k < beats.length - 2 && beats[k + 1] <= t) k++;
            let p = 0;
            for (let j = Math.max(0, k - 1); j <= Math.min(beats.length - 2, k + 1); j++) {
                const T = beats[j + 1] - beats[j], ph = (t - beats[j]) / T;
                p += Math.exp(-(((ph - 0.15) / 0.09) ** 2)) + o.dicrotic * Math.exp(-(((ph - 0.5) / 0.08) ** 2));
            }
            const light = (1 - o.amp * p) * (1 + o.noise * (rand() * 2 - 1));
            const r = 180 * light, g = 30 * light, b = 20 * light;
            frames.push({ t: round(t, 4), r: round(r, 3), g: round(g, 3), b: round(b, 3), y: round(0.299 * r + 0.587 * g + 0.114 * b, 3), exposureTime: 333, iso: 800, e: 333 * 800, s: 0 });
            t += (1 / o.fps) * (1 + o.jitter * (rand() * 2 - 1));
        }
        return frames;
    }

    // ---------- CSV: 한 줄 = 1초 곡선 ----------
    // run: { at, holdPlanned, ph, curve, metrics, profile: { exercise, height, weight }, consent, lock }
    function phaseOf(t, ph) { return t < ph.holdStart ? '안정' : t < ph.holdEnd ? '숨 참기' : '회복'; }
    function breathCsv(run) {
        const m = run.metrics || {}, ph = run.ph || {}, pf = run.profile || {};
        const q = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
        const lines = [
            '# 실험: 숨 참기와 심박수 (스마트폰 카메라)',
            '# 시각: ' + (run.at || ''),
            `# 구간: 안정 0~${round(ph.holdStart, 1)}초 · 숨 참기 ${round(ph.holdStart, 1)}~${round(ph.holdEnd, 1)}초(계획 ${ph.holdPlanned}초${ph.stopped ? ', 멈춤' : ''}) · 회복 ${round(ph.holdEnd, 1)}~${round(ph.end, 1)}초`,
            `# 지표: 안정 평균 ${m.restMean} · 숨 참기 마지막 10초 ${m.holdLastMean} · 변화율 ${m.changePct}% · 가장 낮은 값 ${m.low ? m.low.bpm + '(숨 참기 시작 뒤 ' + m.low.t + '초)' : '-'} · 회복 시간 ${m.recoveryText} · 참은 초 ${m.heldSec} · 뺀 창 ${m.dropped}/${m.total}`,
            `# 선택 항목: 운동 습관 ${pf.exercise || '안 씀'} · 키 ${pf.height || '안 씀'} · 몸무게 ${pf.weight || '안 씀'} · 수업 분석 동의 ${run.consent ? '예' : '아니오'}`,
            '# 노출: ' + (run.lock || ''),
            't_s,phase,bpm,conf,used'
        ];
        (run.curve || []).forEach(p => lines.push([p.t, phaseOf(p.t, ph), p.bpm == null ? '' : p.bpm, p.conf, p.ok ? 1 : 0].map(q).join(',')));
        return lines.join('\n') + '\n';
    }

    // ---------- 조 공유 항목 (kind 'breath', 동의한 회차만) ----------
    // 요약 순서: 변화율·참은 초·안정 평균·회복 시간 (교사 화면은 앞 4개를 보여 줌)
    function breathItems(runs) {
        return (runs || []).filter(r => r && r.consent && r.metrics).map(r => {
            const m = r.metrics, pf = r.profile || {};
            const summary = { '변화율(%)': m.changePct, '참은 초': m.heldSec, '안정 평균': m.restMean, '회복 시간(초)': m.recoverySec == null ? '60초 넘음' : m.recoverySec };
            Object.keys(summary).forEach(k => { if (summary[k] == null) delete summary[k]; });
            return {
                id: String(r.id), title: `숨 참기 ${r.ph.holdPlanned}초${r.ph.stopped ? ' (' + Math.round(m.heldSec) + '초에 멈춤)' : ''}`, n: (r.curve || []).length, at: r.at, summary,
                data: { kind: 'breath', v: 1, at: r.at, ph: r.ph, metrics: m, profile: { exercise: pf.exercise || '', height: pf.height || '', weight: pf.weight || '' },
                    curve: (r.curve || []).map(p => [p.t, p.bpm, p.conf, p.ok ? 1 : 0]) }
            };
        });
    }
    // 받은 항목 → 같은 조 다른 기기의 숨 참기 회차 (kind 'breath' 만)
    function breathIncoming(items) {
        const ext = {};
        (items || []).forEach(it => {
            const d = it && it.data;
            if (!d || d.kind !== 'breath' || !(Number(it.n) > 0) || !Array.isArray(d.curve)) return;
            ext[it.device + '/' + it.id] = { from: String(it.from || ''), title: String(it.title || ''), at: String(d.at || ''), ph: d.ph || {}, metrics: d.metrics || {}, profile: d.profile || {},
                curve: d.curve.map(a => ({ t: Number(a[0]), bpm: a[1] == null ? null : Number(a[1]), conf: Number(a[2]) || 0, ok: !!a[3] })) };
        });
        return ext;
    }

    return { REST, RECOVER, WIN, STEP, MIN_CONF, EXERCISE, HEIGHT, WEIGHT, breathCurve, breathMetrics, breathProfile, breathSimulate, breathCsv, breathItems, breathIncoming, phaseOf };
});
