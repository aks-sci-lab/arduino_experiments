// 열평형 실험 계산·분석·시뮬레이션 엔진 (브라우저·Node 공용, 시험 tests/thermal-equilibrium-math.test.cjs)
// 중3 기본(열평형 온도, Q_잃 = Q_얻, 열손실률) + 고2 심화(비커 열용량 보정, 초기 온도 변화율 dT/dt, 지수 감쇠 시상수 τ·반감기)
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ThermalMath = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var LIQUIDS = {
        water: { name: '물', c: 4.186 },
        oil: { name: '식용유', c: 2.0 },
        ethanol: { name: '에탄올', c: 2.44 },
        saltwater: { name: '소금물 (10%)', c: 3.72 }
    };

    var BEAKER_MATERIALS = {
        none: { name: '보정 안 함 (중3 기본)', c: 0 },
        glass: { name: '유리 비커', c: 0.84 },
        steel: { name: '스테인리스 컵', c: 0.50 },
        aluminum: { name: '알루미늄 컵', c: 0.90 },
        styrofoam: { name: '스티로폼 컵', c: 1.30 }
    };

    var SIM_PRESETS = {
        equal: {
            name: '① 같은 질량 (작은 100 g 65 °C · 큰 100 g 20 °C)',
            m1: 100, liquid1: 'water', t1_0: 65,
            m2: 100, liquid2: 'water', t2_0: 20,
            roomT: 22, k12: 6.2, k1r: 0.12, k2r: 0.32, vessel: '유리 비커 (열림)'
        },
        mass1to3: {
            name: '② 질량비 1 : 3 (작은 50 g 65 °C · 큰 150 g 20 °C)',
            m1: 50, liquid1: 'water', t1_0: 65,
            m2: 150, liquid2: 'water', t2_0: 20,
            roomT: 22, k12: 5.2, k1r: 0.10, k2r: 0.35, vessel: '유리 비커 (열림)'
        },
        outerHot: {
            name: '③ 뜨거운 물 바깥쪽 (작은 100 g 20 °C · 큰 150 g 65 °C)',
            m1: 100, liquid1: 'water', t1_0: 20,
            m2: 150, liquid2: 'water', t2_0: 65,
            roomT: 22, k12: 6.2, k1r: 0.08, k2r: 0.55, vessel: '유리 비커 (열림)'
        },
        insulated: {
            name: '④ 단열·뚜껑 있음 (작은 100 g 65 °C · 큰 100 g 20 °C)',
            m1: 100, liquid1: 'water', t1_0: 65,
            m2: 100, liquid2: 'water', t2_0: 20,
            roomT: 22, k12: 6.5, k1r: 0.02, k2r: 0.05, vessel: '스티로폼 단열 + 뚜껑'
        },
        oilWater: {
            name: '⑤ [심화] 식용유 100 g (65 °C) + 물 100 g (20 °C)',
            m1: 100, liquid1: 'oil', t1_0: 65,
            m2: 100, liquid2: 'water', t2_0: 20,
            roomT: 22, k12: 4.5, k1r: 0.08, k2r: 0.28, vessel: '유리 비커 (식용유·물)'
        }
    };

    function liquidOf(key) { return LIQUIDS[key] || LIQUIDS.water; }
    function beakerOf(key) { return BEAKER_MATERIALS[key] || BEAKER_MATERIALS.none; }
    function round(v, d) {
        if (!Number.isFinite(v)) return null;
        var f = Math.pow(10, d == null ? 2 : d);
        return Math.round(v * f) / f;
    }

    // 이론 열평형 온도 (중3 기본 + 고2 비커 열용량 보정)
    // m1, m2 (g), c1, c2 (J/g·°C), t1_0, t2_0 (°C)
    function calcTheoryTemp(p) {
        p = p || {};
        var m1 = Number(p.m1), m2 = Number(p.m2);
        var c1 = Number(p.c1 != null ? p.c1 : liquidOf(p.liquid1).c);
        var c2 = Number(p.c2 != null ? p.c2 : liquidOf(p.liquid2).c);
        var t1 = Number(p.t1_0), t2 = Number(p.t2_0);
        if (![m1, m2, c1, c2, t1, t2].every(Number.isFinite) || m1 <= 0 || m2 <= 0 || c1 <= 0 || c2 <= 0) {
            return { basic: null, corrected: null, C1: null, C2: null, Ccup: 0 };
        }
        var C1 = c1 * m1;
        var C2 = c2 * m2;
        var basic = (C1 * t1 + C2 * t2) / (C1 + C2);

        // 고2 심화: 비커(열량계) 열용량 보정
        var cup1C = Math.max(0, Number(p.cup1Mass) || 0) * Math.max(0, Number(p.cup1C) || 0);
        var cup2C = Math.max(0, Number(p.cup2Mass) || 0) * Math.max(0, Number(p.cup2C) || 0);
        var tCup1 = Number.isFinite(Number(p.tCup1_0)) ? Number(p.tCup1_0) : t1;
        var tCup2 = Number.isFinite(Number(p.tCup2_0)) ? Number(p.tCup2_0) : t2;
        var corrected = (C1 * t1 + C2 * t2 + cup1C * tCup1 + cup2C * tCup2) / (C1 + C2 + cup1C + cup2C);

        return {
            basic: round(basic, 2),
            corrected: round(corrected, 2),
            C1: round(C1, 1),
            C2: round(C2, 1),
            Ccup: round(cup1C + cup2C, 1)
        };
    }

    // 단순 최소제곱 직선 맞춤 (y = a + b x)
    function linFit(xs, ys) {
        var n = Math.min(xs.length, ys.length);
        if (n < 2) return null;
        var mx = 0, my = 0;
        for (var i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
        mx /= n; my /= n;
        var sxx = 0, syy = 0, sxy = 0;
        for (var j = 0; j < n; j++) {
            var dx = xs[j] - mx, dy = ys[j] - my;
            sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
        }
        if (!(sxx > 0)) return null;
        var slope = sxy / sxx;
        var intercept = my - slope * mx;
        var r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1;
        return { slope: slope, intercept: intercept, r2: r2, n: n };
    }

    // 고2 심화: 온도 차 지수 감쇠 맞춤 |T1(t) - T2(t)| ≈ ΔT0 · exp(-t / τ)
    function fitExpDecay(samples) {
        var pts = (samples || []).filter(function (s) {
            return s && Number.isFinite(s.t) && Number.isFinite(s.t1) && Number.isFinite(s.t2);
        });
        if (pts.length < 4) return null;
        var t0 = pts[0].t;
        var d0 = Math.abs(pts[0].t1 - pts[0].t2);
        if (!(d0 >= 2)) return null;
        var floor = Math.max(0.6, d0 * 0.08);
        var xs = [], ys = [];
        for (var i = 0; i < pts.length; i++) {
            var diff = Math.abs(pts[i].t1 - pts[i].t2);
            if (diff < floor) break;
            xs.push(pts[i].t - t0);
            ys.push(Math.log(diff));
        }
        if (xs.length < 3) return null;
        var fit = linFit(xs, ys);
        if (!fit || !(fit.slope < -1e-6)) return null;
        var tau = -1 / fit.slope;
        var halfLife = tau * Math.LN2;
        return {
            tau: round(tau, 1),
            halfLife: round(halfLife, 1),
            dT0Fit: round(Math.exp(fit.intercept), 2),
            r2: round(fit.r2, 4),
            n: fit.n
        };
    }

    // 한 회차 측정 데이터 분석 (중3 기본 + 고2 심화)
    function analyzeRun(samples, meta) {
        meta = meta || {};
        var pts = (samples || []).filter(function (s) {
            return s && Number.isFinite(Number(s.t)) && Number.isFinite(Number(s.t1)) && Number.isFinite(Number(s.t2));
        }).map(function (s) {
            return { t: Number(s.t), t1: Number(s.t1), t2: Number(s.t2) };
        }).sort(function (a, b) { return a.t - b.t; });

        if (!pts.length) {
            return { ok: false, n: 0, reached: false };
        }

        var tStart = pts[0].t;
        var tEnd = pts[pts.length - 1].t;
        var duration = round(tEnd - tStart, 1);
        var t1_0 = round(pts[0].t1, 2);
        var t2_0 = round(pts[0].t2, 2);
        var dT0 = round(Math.abs(t1_0 - t2_0), 2);

        // 열평형 판정: |T1 - T2| <= tol (기본 0.5 °C) 가 3점 이상 연속 유지되는 첫 시점
        var tol = Number(meta.eqTol) > 0 ? Number(meta.eqTol) : 0.5;
        var eqIdx = -1;
        var streak = 0;
        var needStreak = Math.min(3, Math.max(1, pts.length));
        for (var i = 0; i < pts.length; i++) {
            if (Math.abs(pts[i].t1 - pts[i].t2) <= tol) {
                streak++;
                if (streak >= needStreak && eqIdx < 0) eqIdx = i - needStreak + 1;
            } else {
                streak = 0;
            }
        }
        var reached = eqIdx >= 0;
        var eqTime = reached ? round(pts[eqIdx].t - tStart, 1) : null;

        // 실측 열평형 온도: 도달했으면 도달 시점부터 5개(또는 끝까지 최대 10개) 평균, 미도달이면 마지막 3개 평균
        var win;
        if (reached) {
            win = pts.slice(eqIdx, Math.min(pts.length, eqIdx + 8));
        } else {
            win = pts.slice(Math.max(0, pts.length - 3));
        }
        var tEqSum = 0;
        win.forEach(function (p) { tEqSum += (p.t1 + p.t2) / 2; });
        var tEq = round(tEqSum / win.length, 2);
        var finalDiff = round(Math.abs(pts[pts.length - 1].t1 - pts[pts.length - 1].t2), 2);

        // 이론 열평형 온도 & 열량 계산 (Q_잃, Q_얻, 열손실률)
        var liq1 = liquidOf(meta.liquid1), liq2 = liquidOf(meta.liquid2);
        var m1 = Number(meta.m1) > 0 ? Number(meta.m1) : 100;
        var m2 = Number(meta.m2) > 0 ? Number(meta.m2) : 100;
        var c1 = Number(meta.c1) > 0 ? Number(meta.c1) : liq1.c;
        var c2 = Number(meta.c2) > 0 ? Number(meta.c2) : liq2.c;
        var bkr = beakerOf(meta.beakerMat);
        var theory = calcTheoryTemp({
            m1: m1, c1: c1, t1_0: t1_0,
            m2: m2, c2: c2, t2_0: t2_0,
            cup1Mass: meta.cup1Mass || 0, cup1C: bkr.c,
            cup2Mass: meta.cup2Mass || 0, cup2C: bkr.c,
            tCup1_0: Number.isFinite(Number(meta.roomT)) ? Number(meta.roomT) : t2_0,
            tCup2_0: Number.isFinite(Number(meta.roomT)) ? Number(meta.roomT) : t2_0
        });

        var hotSide = t1_0 >= t2_0 ? 1 : 2;
        var qLost, qGained;
        if (hotSide === 1) {
            qLost = c1 * m1 * (t1_0 - tEq);
            qGained = c2 * m2 * (tEq - t2_0);
        } else {
            qLost = c2 * m2 * (t2_0 - tEq);
            qGained = c1 * m1 * (tEq - t1_0);
        }
        var qDiff = qLost - qGained;
        var lossPct = qLost > 1e-6 ? round((qDiff / qLost) * 100, 1) : null;
        var errBasic = theory.basic != null ? round(tEq - theory.basic, 2) : null;
        var errCorr = theory.corrected != null ? round(tEq - theory.corrected, 2) : null;

        // 고2 심화: 초기 온도 변화율 (처음 30초 또는 첫 25% 구간)
        var winSec = Math.min(30, Math.max(10, (tEnd - tStart) * 0.25));
        var initPts = pts.filter(function (p) { return (p.t - tStart) <= winSec; });
        if (initPts.length < 3) initPts = pts.slice(0, Math.min(5, pts.length));
        var fit1 = linFit(initPts.map(function (p) { return p.t - tStart; }), initPts.map(function (p) { return p.t1; }));
        var fit2 = linFit(initPts.map(function (p) { return p.t - tStart; }), initPts.map(function (p) { return p.t2; }));
        var expFit = fitExpDecay(pts);

        return {
            ok: true,
            n: pts.length,
            duration: duration,
            t1_0: t1_0,
            t2_0: t2_0,
            dT0: dT0,
            hotSide: hotSide,
            reached: reached,
            eqTime: eqTime,
            tEq: tEq,
            finalDiff: finalDiff,
            tTheory: theory.basic,
            tCorrected: theory.corrected,
            errBasic: errBasic,
            errCorr: errCorr,
            C1: theory.C1,
            C2: theory.C2,
            Ccup: theory.Ccup,
            qLost: round(qLost, 0),
            qGained: round(qGained, 0),
            qEnv: round(qDiff, 0),
            lossPct: lossPct,
            rate1: fit1 ? round(fit1.slope, 4) : null,
            rate2: fit2 ? round(fit2.slope, 4) : null,
            expFit: expFit
        };
    }

    // 결합 2물체 + 실내 열교환 시뮬레이터 (1초 간격 등으로 호출 가능)
    function createSimulator(presetKey, overrides) {
        var base = Object.assign({}, SIM_PRESETS[presetKey] || SIM_PRESETS.equal, overrides || {});
        var C1 = liquidOf(base.liquid1).c * (Number(base.m1) || 100);
        var C2 = liquidOf(base.liquid2).c * (Number(base.m2) || 100);
        var T1 = Number(base.t1_0), T2 = Number(base.t2_0), Tr = Number(base.roomT != null ? base.roomT : 22);
        var k12 = Number(base.k12 || 6.0), k1r = Number(base.k1r || 0.1), k2r = Number(base.k2r || 0.3);
        var t = 0;
        var noiseAmp = base.noiseAmp != null ? Number(base.noiseAmp) : 0.06;

        function step(dtSec) {
            var dt = Math.max(0.05, Number(dtSec) || 1);
            var sub = Math.max(1, Math.ceil(dt / 0.2));
            var h = dt / sub;
            for (var i = 0; i < sub; i++) {
                var d1 = (-k12 * (T1 - T2) - k1r * (T1 - Tr)) / C1;
                var d2 = (k12 * (T1 - T2) - k2r * (T2 - Tr)) / C2;
                T1 += d1 * h;
                T2 += d2 * h;
            }
            t += dt;
            var n1 = noiseAmp ? (Math.random() - 0.5) * 2 * noiseAmp : 0;
            var n2 = noiseAmp ? (Math.random() - 0.5) * 2 * noiseAmp : 0;
            return { t: round(t, 2), t1: round(T1 + n1, 2), t2: round(T2 + n2, 2) };
        }
        function current() {
            return { t: round(t, 2), t1: round(T1, 2), t2: round(T2, 2) };
        }
        return { config: base, step: step, current: current };
    }

    // ---------- CSV · 조 공유 ----------
    function csvCell(v) {
        if (v == null) return '';
        var s = String(v);
        if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function runToCsv(run) {
        var m = run.meta || {};
        var a = analyzeRun(run.samples, m);
        var head = [
            '# 회차: ' + (run.title || ('회차 ' + run.no)),
            '# 작은 비커: ' + liquidOf(m.liquid1).name + ' ' + (m.m1 || '') + 'g, 큰 비커: ' + liquidOf(m.liquid2).name + ' ' + (m.m2 || '') + 'g, 비커: ' + (m.vessel || ''),
            '# 실측 열평형 온도(°C): ' + (a.tEq != null ? a.tEq : '') + ', 이론 열평형 온도(°C): ' + (a.tTheory != null ? a.tTheory : '') + ', 열손실률(%): ' + (a.lossPct != null ? a.lossPct : ''),
            'time_s,small_beaker_C,big_beaker_C,diff_C'
        ];
        (run.samples || []).forEach(function (s) {
            var d = Number.isFinite(s.t1) && Number.isFinite(s.t2) ? round(Math.abs(s.t1 - s.t2), 2) : '';
            head.push([round(s.t, 2), round(s.t1, 2), round(s.t2, 2), d].map(csvCell).join(','));
        });
        return '\ufeff' + head.join('\r\n') + '\r\n';
    }

    function parseRunCsv(text, filename) {
        var lines = String(text || '').replace(/^\ufeff/, '').split(/\r?\n/);
        var samples = [];
        lines.forEach(function (line) {
            var s = line.trim();
            if (!s || s.charAt(0) === '#') return;
            var cols = s.split(',').map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
            if (cols.length < 3) return;
            var t = Number(cols[0]), t1 = Number(cols[1]), t2 = Number(cols[2]);
            if (Number.isFinite(t) && Number.isFinite(t1) && Number.isFinite(t2)) {
                samples.push({ t: round(t, 2), t1: round(t1, 2), t2: round(t2, 2) });
            }
        });
        return { title: String(filename || '불러온 CSV').replace(/\.csv$/i, ''), samples: samples };
    }

    // 조 공유(ClassShare)용 항목 변환: 곡선은 200점 안으로 솎아 보내 전송 크기 제한 준수
    function thinSamples(samples, maxPts) {
        var list = Array.isArray(samples) ? samples : [];
        var cap = maxPts || 180;
        if (list.length <= cap) return list.map(function (s) { return [round(s.t, 1), round(s.t1, 2), round(s.t2, 2)]; });
        var out = [], step = (list.length - 1) / (cap - 1);
        for (var i = 0; i < cap; i++) {
            var s = list[Math.round(i * step)];
            out.push([round(s.t, 1), round(s.t1, 2), round(s.t2, 2)]);
        }
        return out;
    }

    function buildItems(runs) {
        return (runs || []).map(function (r) {
            var a = analyzeRun(r.samples, r.meta);
            return {
                id: 'r' + r.no,
                title: r.title || ('회차 ' + r.no),
                n: (r.samples || []).length,
                summary: {
                    '작은비커(g)': (r.meta && r.meta.m1) || '',
                    '큰비커(g)': (r.meta && r.meta.m2) || '',
                    '처음T1(°C)': a.t1_0,
                    '처음T2(°C)': a.t2_0,
                    '열평형온도(°C)': a.tEq,
                    '이론온도(°C)': a.tTheory,
                    '도달시간(s)': a.eqTime,
                    '열손실률(%)': a.lossPct,
                    '시상수τ(s)': a.expFit ? a.expFit.tau : ''
                },
                data: JSON.stringify({ no: r.no, title: r.title, meta: r.meta, pts: thinSamples(r.samples, 180) })
            };
        });
    }

    function applyIncoming(ext, items) {
        var next = Object.assign({}, ext || {});
        var changed = false;
        (items || []).forEach(function (it) {
            var k = (it.device || 'ext') + ':' + it.id;
            var d = null;
            try { d = typeof it.data === 'string' ? JSON.parse(it.data) : it.data; } catch (e) { d = null; }
            if (!d || !Array.isArray(d.pts)) return;
            var run = {
                no: d.no || 1,
                title: d.title || it.title || '조 회차',
                meta: d.meta || {},
                samples: d.pts.map(function (p) { return { t: p[0], t1: p[1], t2: p[2] }; }),
                from: it.device || '조원'
            };
            if (JSON.stringify(next[k]) !== JSON.stringify(run)) {
                next[k] = run;
                changed = true;
            }
        });
        return { ext: next, changed: changed };
    }

    return {
        LIQUIDS: LIQUIDS,
        BEAKER_MATERIALS: BEAKER_MATERIALS,
        SIM_PRESETS: SIM_PRESETS,
        liquidOf: liquidOf,
        beakerOf: beakerOf,
        round: round,
        calcTheoryTemp: calcTheoryTemp,
        linFit: linFit,
        fitExpDecay: fitExpDecay,
        analyzeRun: analyzeRun,
        createSimulator: createSimulator,
        runToCsv: runToCsv,
        parseRunCsv: parseRunCsv,
        thinSamples: thinSamples,
        buildItems: buildItems,
        applyIncoming: applyIncoming
    };
});
