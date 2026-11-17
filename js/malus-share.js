// 말루스 법칙 실험: 조 공유(js/class-share.js)에 넘길 자료 만들기 · 같은 조 다른 노트북이 보낸 값 합치기 (브라우저/Node 공용, 화면 없음)
//  - 보낼 것: 내가 잰 회차 하나 = 시트 한 줄 (id 'run3', 제목 '3회차', 요약: 점 수·cos² R²·θ₀·결측·A)
//  - 받은 것: 노트북별·회차별로 따로 보관(state.ext). 분석·표·그래프에는 '📥 노트북 AB12 · 1회차'처럼 내 회차 뒤에 붙인다
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./malus-math.js'));
    else root.MalusShare = factory(root.MalusMath);
})(typeof self !== 'undefined' ? self : this, function (M) {
    'use strict';

    const EXT_RUN_BASE = 100;   // 불러온 회차 번호 (내 회차 1, 2, 3 … 과 겹치지 않게 101, 102 …)
    const MAX_POINTS = 2000;
    const num = (v, d) => { const x = Number(v); return Number.isFinite(x) ? +x.toFixed(d) : null; };

    /* 내 측정점 → 보낼 묶음 (회차마다 하나)
       points: state.points (run, theta, raw, sd, sat, excluded, reason, moved), intensity(p): 배경을 뺀 밝기 */
    function buildItems(points, intensity, ch, gamma) {
        const runs = [...new Set((points || []).map(p => p.run))].sort((a, b) => a - b);
        return runs.map(run => {
            const ps = points.filter(p => p.run === run);
            const pts = ps.map(p => ({
                theta: num(p.theta, 3), y: num(intensity(p), 6), sd: num(p.sd, 6), sat: num(p.sat, 4),
                excluded: !!p.excluded, reason: String(p.reason || '').slice(0, 80), moved: !!p.moved
            })).filter(p => p.theta != null && p.y != null);
            const valid = pts.filter(p => !p.excluded);
            const fit = M.fitModel(valid, 'cos2');
            // 이름은 서버 규칙(영어·숫자·한글·공백 .()-)에 맞춤. 교사 화면은 앞 4개를 보여 줌
            const summary = { '점': pts.length };
            if (fit) { summary['cos2 R2'] = num(fit.r2, 4); summary.theta0 = num(fit.theta0, 1); }
            summary['결측'] = pts.length - valid.length;
            if (fit) summary.A = num(fit.A, 5);
            // at: 그 회차의 마지막 측정 시각 (폰 회차 목록에 보임, 예전 점에는 시각이 없음)
            const ts = ps.map(p => Number(p.t)).filter(Number.isFinite);
            const item = { id: 'run' + run, title: run + '회차', n: pts.length, summary, data: { v: 1, run, ch: ch || '', gamma: gamma || '', points: pts } };
            if (ts.length) item.at = new Date(Math.max(...ts)).toISOString();
            return item;
        });
    }

    // 받은 자료 한 묶음 → 측정점 배열 (형식이 틀린 것은 버림)
    function cleanPoints(data) {
        const arr = data && Array.isArray(data.points) ? data.points.slice(0, MAX_POINTS) : [];
        return arr.map(p => ({
            theta: Number(p && p.theta), y: Number(p && p.y), sd: Number(p && p.sd) || 0, sat: Number(p && p.sat) || 0,
            excluded: !!(p && p.excluded), reason: String((p && p.reason) || '').slice(0, 80), moved: !!(p && p.moved)
        })).filter(p => Number.isFinite(p.theta) && Number.isFinite(p.y));
    }

    /* ClassShare 의 onIncoming(items) → 새 ext. 서버 목록은 늘 그 조의 전체이므로 통째로 새로 만든다
       돌려주는 값: { ext, changed } (ext: { [device]: { from, runs: { [id]: { title, run, points } } } }) */
    function applyIncoming(oldExt, items) {
        const ext = {};
        (items || []).forEach(it => {
            if (!it || !it.device) return;
            const pts = cleanPoints(it.data);
            if (!pts.length) return;
            const d = ext[it.device] || (ext[it.device] = { from: String(it.from || ''), runs: {} });
            d.runs[String(it.id)] = { title: String(it.title || ''), run: Number(it.data && it.data.run) || 0, points: pts };
        });
        return { ext, changed: JSON.stringify(ext) !== JSON.stringify(oldExt || {}) };
    }

    function extCount(ext) {
        let n = 0;
        Object.keys(ext || {}).forEach(d => Object.keys(ext[d].runs).forEach(id => { n += ext[d].runs[id].points.length; }));
        return n;
    }

    /* 분석에 쓸 불러온 점: { run: 101…, label: '📥 노트북 AB12 · 1회차', from, ext: true, theta, y, … }
       노트북·회차 순서는 늘 같게 (노트북 번호, 회차 번호 순) */
    function extPoints(ext) {
        const out = [];
        let k = 0;
        Object.keys(ext || {}).sort().forEach(dev => {
            const d = ext[dev];
            Object.keys(d.runs).sort((a, b) => (d.runs[a].run - d.runs[b].run) || (a < b ? -1 : 1)).forEach(id => {
                const r = d.runs[id];
                k++;
                const label = d.from + ' · ' + (r.title || id);
                r.points.forEach(p => out.push(Object.assign({}, p, { run: EXT_RUN_BASE + k, label, from: d.from, ext: true })));
            });
        });
        return out;
    }

    /* 이 페이지의 CSV(6. 결과 → CSV 다운로드)를 다시 읽기: 시트가 없을 때 폰 → 노트북 파일로 옮기기
       이 기기가 잰 줄(source = me, 예전 파일은 source 열 없음)만 회차별로 묶는다 (불러온 값을 또 옮기지 않게)
       돌려주는 값: { runs: { 'run1': { title, run, points } }, points: 점 수 } 또는 { error } */
    function parseCsv(text) {
        const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return { error: '측정값 줄이 없습니다.' };
        const cells = line => {
            const out = []; let cur = '', q = false;
            for (let i = 0; i < line.length; i++) {
                const c = line[i];
                if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
                else if (c === '"') q = true;
                else if (c === ',') { out.push(cur); cur = ''; }
                else cur += c;
            }
            out.push(cur);
            return out;
        };
        const head = cells(lines[0]).map(h => h.trim());
        const col = n => head.indexOf(n);
        const iRun = col('run'), iT = col('theta_deg'), iI = col('intensity');
        if (iRun < 0 || iT < 0 || iI < 0) return { error: '말루스 실험 CSV 가 아닙니다 (run·theta_deg·intensity 열이 필요).' };
        const iEx = col('excluded'), iWhy = col('reason'), iSd = col('std'), iSat = col('saturated_fraction'), iSrc = col('source');
        const runs = {};
        let n = 0;
        lines.slice(1).forEach(line => {
            const c = cells(line);
            if (iSrc >= 0 && c[iSrc] && c[iSrc] !== 'me') return;
            const run = Number(c[iRun]), theta = Number(c[iT]), y = Number(c[iI]);
            if (!Number.isFinite(run) || !Number.isFinite(theta) || !Number.isFinite(y)) return;
            const id = 'run' + run;
            const r = runs[id] || (runs[id] = { title: run + '회차', run, points: [] });
            if (r.points.length >= MAX_POINTS) return;
            r.points.push({ theta, y, sd: Number(c[iSd]) || 0, sat: Number(c[iSat]) || 0, excluded: iEx >= 0 && c[iEx] === '1', reason: iWhy >= 0 ? String(c[iWhy] || '').slice(0, 80) : '', moved: false });
            n++;
        });
        if (!n) return { error: '이 기기가 잰 측정값 줄이 없습니다.' };
        return { runs, points: n };
    }

    return { EXT_RUN_BASE, buildItems, applyIncoming, extCount, extPoints, cleanPoints, parseCsv };
});
