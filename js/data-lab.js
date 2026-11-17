// 데이터 가공 실험실 화면 (projects/data-lab.html). 계산은 js/data-lab-math.js (그 안에서 js/heart-rate-math.js 를 씀)
//  자료(예시 또는 내 CSV) → 단계 0~6 설정 → DataLabMath.run → 지금 보이는 단계의 전·후 그래프와 맨 위 최종 심박수
//  이 브라우저에 기억: 고른 자료, 설정, 단계마다 적은 한 줄 기록 (불러온 CSV 내용은 기억하지 않음)
(function () {
    'use strict';
    const H = window.HeartRateMath, D = window.DataLabMath;
    const $ = id => document.getElementById(id);
    const KEY = 'data-lab:v1';
    const STEP_NAMES = { s0: '0 원천', s1: '1 수집', s2: '2 점검·정제', s3: '3 변환', s4: '4 걸러 내기', s5: '5 특징 뽑기', s6: '6 결과·검증' };
    const CH_NAME = { r: '빨강 R', g: '초록 G', y: '밝기 Y', auto: '자동' };

    // ---------- 그래프 (heart-rate.js 와 같은 작은 그리기 함수) ----------
    function plot(cv, series, o) {
        o = o || {};
        const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, Hh = cv.clientHeight || 150;
        if (!cv.clientWidth) return;   // 숨은 단계: 보일 때 다시 그림
        cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, W, Hh);
        const all = series.flatMap(s => s.pts).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
        const L = o.ylabel ? 46 : 10, R = 10, T = 10, B = 30;
        if (!all.length) { c.fillStyle = '#5f6b7a'; c.font = '13px sans-serif'; c.fillText(o.empty || '자료 없음', L + 6, Hh / 2); return; }
        let x0 = o.xmin != null ? o.xmin : Math.min(...all.map(p => p.x)), x1 = o.xmax != null ? o.xmax : Math.max(...all.map(p => p.x));
        const inX = all.filter(p => p.x >= x0 && p.x <= x1);
        const ys = (inX.length ? inX : all).map(p => p.y);
        let y0 = o.ymin != null ? o.ymin : Math.min(...ys), y1 = o.ymax != null ? o.ymax : Math.max(...ys);
        if (x1 <= x0) x1 = x0 + 1;
        if (y1 <= y0) { y1 += 1; y0 -= 1; }
        if (o.ymin == null && o.ymax == null) { const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad; }
        const X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => T + (1 - (y - y0) / (y1 - y0)) * (Hh - T - B);
        c.strokeStyle = '#e3e7ec'; c.fillStyle = '#5f6b7a'; c.font = '11px sans-serif'; c.lineWidth = 1;
        const ticks = (a, b, n) => { const st = Math.pow(10, Math.floor(Math.log10((b - a) / n))), m = [1, 2, 5, 10].find(k => (b - a) / (st * k) <= n) * st; const out = []; for (let v = Math.ceil(a / m) * m; v <= b + 1e-9; v += m) out.push(+v.toFixed(6)); return out; };
        (o.bands || []).forEach(b => { c.fillStyle = b.color; const a = Math.max(x0, b.x0), z = Math.min(x1, b.x1); if (z > a) c.fillRect(X(a), T, X(z) - X(a), Hh - T - B); });
        c.fillStyle = '#5f6b7a';
        if (o.yticks !== false) ticks(y0, y1, 4).forEach(v => { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(W - R, Y(v)); c.stroke(); if (o.ylabel) { c.textAlign = 'right'; c.fillText(String(+v.toPrecision(4)), L - 4, Y(v) + 4); c.textAlign = 'left'; } });
        ticks(x0, x1, W < 360 ? 4 : 6).forEach(v => { c.beginPath(); c.moveTo(X(v), T); c.lineTo(X(v), Hh - B); c.stroke(); c.fillText(String(v), X(v) - 8, Hh - B + 14); });
        if (o.xlabel) c.fillText(o.xlabel, W - R - c.measureText(o.xlabel).width, Hh - 3);
        if (o.ylabel) { c.save(); c.translate(11, (Hh - B + T) / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillText(o.ylabel, 0, 0); c.restore(); }
        c.save(); c.beginPath(); c.rect(L, T - 2, W - L - R, Hh - T - B + 4); c.clip();
        series.forEach(s => {
            c.strokeStyle = s.color || '#1565c0'; c.fillStyle = s.color || '#1565c0'; c.lineWidth = s.width || 1.6; c.setLineDash(s.dash || []);
            const ps = s.pts.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= x0 - (x1 - x0) * 0.02 && p.x <= x1 + (x1 - x0) * 0.02);
            if (!s.noLine) { c.beginPath(); ps.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y)))); c.stroke(); }
            c.setLineDash([]);
            if (s.dots) ps.forEach(p => { c.beginPath(); c.arc(X(p.x), Y(p.y), s.dots, 0, 2 * Math.PI); c.fill(); });
        });
        (o.vlines || []).forEach(v => { c.strokeStyle = v.color; c.lineWidth = 2; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(X(v.x), T); c.lineTo(X(v.x), Hh - B); c.stroke(); c.setLineDash([]); });
        c.restore();
        if (o.legend) {
            let lx = L + 6;
            o.legend.forEach(g => { c.fillStyle = g.color; c.fillRect(lx, T + 2, 10, 10); c.fillStyle = '#1f2933'; c.fillText(g.text, lx + 13, T + 11); lx += 22 + c.measureText(g.text).width; });
        }
    }
    // 점이 많으면 그리기용으로 고르게 줄임
    const thin = (pts, max) => { if (pts.length <= max) return pts; const k = pts.length / max, out = []; for (let i = 0; i < max; i++) out.push(pts[Math.floor(i * k)]); return out; };
    const fmt = (x, d) => Number.isFinite(x) ? (+x.toFixed(d == null ? 1 : d)).toLocaleString('ko-KR') : '-';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---------- 기억 ----------
    let store = {};
    try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { store = {}; }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* 저장 불가: 무시 */ } };
    store.notes = store.notes || {};
    let settings = Object.assign(D.defaults(), store.settings || {});
    let wrist = Array.isArray(store.wrist) ? store.wrist : ['', '', '', ''];

    // ---------- 자료 ----------
    let data = null;        // { id, title, note, frames, lock, truth }
    let res = null, base = null;   // 지금 설정 결과, 기본 설정 결과
    const custom = [];      // 불러온 CSV (이 화면에서만)

    function fillSources() {
        const sel = $('src');
        sel.innerHTML = '';
        const g1 = document.createElement('optgroup'); g1.label = '예시 — 선생님 실측';
        const g2 = document.createElement('optgroup'); g2.label = '예시 — 문제 있는 가짜 자료(시뮬레이션)';
        D.EXAMPLES.forEach(e => { const o = new Option(e.title, e.id); (e.sim ? g2 : g1).appendChild(o); });
        sel.append(g1, g2);
        if (custom.length) {
            const g3 = document.createElement('optgroup'); g3.label = '내 측정 (불러온 CSV)';
            const g4 = document.createElement('optgroup'); g4.label = '📱 폰에서 받은 측정';
            custom.forEach((c, i) => (c.srcKey ? g4 : g3).appendChild(new Option(c.title, 'csv:' + i)));
            if (g3.children.length) sel.appendChild(g3);
            if (g4.children.length) sel.appendChild(g4);
        }
    }
    async function loadSource(id) {
        showMsg('');
        const ex = D.EXAMPLES.find(e => e.id === id);
        try {
            if (id.startsWith('csv:')) data = custom[Number(id.slice(4))];
            else if (ex && ex.sim) data = { id, title: ex.title, note: ex.note + ' · 출처: ' + ex.src + (ex.garbage ? ' · 🗑 ' + ex.garbage : ''), frames: D.makeExample(id), lock: 'unlocked', truth: ex.truth, garbage: ex.garbage };
            else if (ex) {
                const r = await fetch('../data/heart-rate/' + ex.file);
                if (!r.ok) throw new Error('파일을 받지 못했어요 (' + r.status + ')');
                const p = H.parseCsv(await r.text());
                data = { id, title: ex.title, note: ex.note + ' · 출처: ' + ex.src + ' (그때 앱이 낸 값 ' + (p.meta['심박수'] || '-') + '회/분)', frames: p.frames, lock: /true/.test(p.meta.locked || '') ? 'csv-locked' : 'unlocked' };
            }
        } catch (e) { showMsg('자료를 불러오지 못했어요: ' + e.message); data = null; }
        if (!data) return;
        store.src = id; save();
        $('src').value = id;
        $('src-note').textContent = data.note || '';
        // 보는 구간·남길 구간은 자료마다 처음부터
        settings.view = [0, null]; settings.keep = [0, null];
        syncInputs();
        recompute();
    }
    $('src').addEventListener('change', () => loadSource($('src').value));
    $('file').addEventListener('change', async e => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const p = H.parseCsv(await f.text());
        e.target.value = '';
        if (p.error || !p.frames.length) { showMsg('CSV 를 읽지 못했어요: ' + (p.error || '자료 줄이 없음') + ' — 심박수 페이지의 원본 CSV 또는 phyphox CSV 를 넣어 주세요.'); return; }
        custom.push({ title: f.name.slice(0, 40), note: `불러온 파일 ${f.name} · ${p.frames.length}줄 (${p.from === 'phyphox' ? 'phyphox' : '심박수 페이지'} 형식) · 이 브라우저 안에서만 계산`, frames: p.frames, lock: /true|1/.test(p.meta.locked || '') ? 'csv-locked' : 'unlocked' });
        fillSources();
        loadSource('csv:' + (custom.length - 1));
    });
    // ---------- 📱 폰에서 받은 원본 (조 공유, exp heartrate · kind 'raw') ----------
    const R = window.HeartRateRaw;
    const seenRaw = {};
    function takeRaw(items) {
        if (!R) return 0;
        let added = 0;
        R.rawIncoming(items).forEach(it => {
            const sig = it.key + '|' + it.sentAt;
            if (seenRaw[sig]) return;
            seenRaw[sig] = true;
            const u = R.rawUnpack(it.raw);
            if (!u || !u.frames.length) return;
            const who = it.from || ((/^p/.test(it.device) ? '📱 폰 ' : '💻 ') + it.device.replace(/^p/, '').slice(-4).toUpperCase());
            const old = custom.findIndex(c => c.srcKey === it.key);
            const n = old >= 0 ? custom[old].no : custom.filter(c => c.srcKey).length + 1;
            const kind = u.mode === 'breath' ? '🫁 숨 참기' : '❤️ 한 번 재기';
            const t = R.timeText(u.at);
            const entry = {
                srcKey: it.key, no: n, title: who + ' · ' + n + '회차' + (t ? ' (' + t + ')' : ''),
                note: kind + ' · ' + u.frames.length + '장' + (u.decimate > 1 ? ` (원래 ${u.frames0}장을 ${u.decimate}장마다 1장으로 솎음)` : '') + ' · 폰에서 잰 원본을 선생님 시트로 받아 이 노트북에서 계산',
                frames: u.frames, lock: u.lock === 'locked' ? 'csv-locked' : (u.lock || 'unlocked')
            };
            if (old >= 0) custom[old] = entry; else { custom.push(entry); added++; }
        });
        if (added) fillSources();
        if ($('src').value !== (store.src || '')) $('src').value = store.src || $('src').value;
        return added;
    }
    function phoneNew(n) {
        const el = $('phone-new');
        if (!el || !n) return;
        el.hidden = false;
        el.innerHTML = '🆕 <b>폰에서 새 측정 ' + n + '개</b>가 들어왔어요. 위 <b>자료</b> 목록의 \'📱 폰에서 받은 측정\'에서 고르세요.';
    }
    let share = null;
    if (window.ClassShare) {
        share = ClassShare.init({
            exp: 'heartrate', barMount: '#class-bar-mount', shareMount: '#share-mount',
            getItems: () => [],
            onIncoming: items => { const n = takeRaw(items); if (n) phoneNew(n); },
            getStep: () => 'datalab',
            phone: { page: 'projects/heart-rate.html' }
        });
        // 폰이 아니면(노트북·태블릿) QR 카드를 바로 보임 — 조 코드가 없으면 저절로 만듦
        const card = () => { if (share.phoneCard && !card.done && !(window.LabUI && LabUI.device && LabUI.device().kind === 'phone')) { card.done = true; share.phoneCard('#phone-card'); } };
        window.addEventListener('lab-device', card);
        card();
    }

    function showMsg(t) { $('msg').hidden = !t; $('msg').textContent = t; }

    // ---------- 설정 칸 ↔ settings ----------
    const num = v => v === '' || v == null ? null : Number(v);
    function syncInputs() {
        $('roi').value = settings.roi; $('roi-v').textContent = settings.roi + '%';
        $('v0').value = settings.view[0] == null ? '' : settings.view[0]; $('v1').value = settings.view[1] == null ? '' : settings.view[1];
        $('autocut').checked = !!settings.autoCut;
        $('ch').value = settings.channel; $('expo').value = settings.exposure;
        $('trend').value = String(settings.trendSec); $('b0').value = settings.band[0]; $('b1').value = settings.band[1];
        $('gap').value = settings.minGap == null ? '' : String(settings.minGap); $('method').value = settings.method;
        document.querySelectorAll('.w').forEach((el, i) => { el.value = wrist[i] == null ? '' : wrist[i]; });
        document.querySelectorAll('[data-note]').forEach(el => { el.value = store.notes[el.dataset.note] || ''; });
    }
    function readInputs() {
        settings.roi = Number($('roi').value);
        settings.view = [num($('v0').value) || 0, num($('v1').value)];
        settings.autoCut = $('autocut').checked;
        settings.keep = [num($('k0').value), num($('k1').value)];
        settings.channel = $('ch').value; settings.exposure = $('expo').value;
        settings.trendSec = Number($('trend').value);
        settings.band = [num($('b0').value) || 36, num($('b1').value) || 210];
        settings.minGap = num($('gap').value);
        settings.method = $('method').value;
        wrist = Array.from(document.querySelectorAll('.w')).map(el => el.value);
        store.settings = settings; store.wrist = wrist; save();
    }
    ['roi', 'v0', 'v1', 'k0', 'k1', 'ch', 'expo', 'trend', 'b0', 'b1', 'gap', 'method'].forEach(id => $(id).addEventListener(id === 'roi' ? 'input' : 'change', () => { readInputs(); recompute(); }));
    $('autocut').addEventListener('change', () => {
        // 자동을 끄면 자르지 않은 전체 구간에서 시작 (손으로 고쳐 자름)
        if (!$('autocut').checked && res) { $('k0').value = 0; $('k1').value = res.s2.dur; }
        readInputs(); recompute();
    });
    document.querySelectorAll('.w').forEach(el => el.addEventListener('input', () => { readInputs(); recompute(); }));
    $('v-all').addEventListener('click', () => { $('v0').value = 0; $('v1').value = ''; readInputs(); recompute(); });
    $('v-2s').addEventListener('click', () => { $('v0').value = 0; $('v1').value = 2; readInputs(); recompute(); });
    document.querySelectorAll('[data-note]').forEach(el => el.addEventListener('input', () => { store.notes[el.dataset.note] = el.value; save(); renderSheet(); }));
    $('reset').addEventListener('click', () => { settings = D.defaults(); wrist = ['', '', '', '']; store.settings = settings; store.wrist = wrist; save(); syncInputs(); recompute(); });

    // ---------- 계산 ----------
    function recompute() {
        if (!data) return;
        res = D.run(data.frames, settings, { lock: data.lock, wrist });
        // 기본 설정 결과는 자료마다 한 번만 (비교용)
        if (!data.base) data.base = D.run(data.frames, D.defaults(), { lock: data.lock });
        base = data.base;
        renderTop();
        renderStep(steps ? steps.current() : 's0');
    }
    function settingLine(step) {
        const s = settings, r = res;
        switch (step) {
            case 's0': return `평균 낼 영역 ${s.roi}%`;
            case 's1': return `보는 구간 ${r.s1.view[0]}~${r.s1.view[1]}초`;
            case 's2': return (s.autoCut ? '자동 제안대로 자르기' : '손으로 자르기') + ` → 남긴 구간 ${r.s2.keep[0]}~${r.s2.keep[1]}초`;
            case 's3': return `채널 ${CH_NAME[s.channel]}${s.channel === 'auto' && r.s3.ok ? '(' + CH_NAME[r.s3.ch] + ')' : ''}, 노출 보정 ${{ auto: '자동', on: '켜기', off: '끄기' }[s.exposure]}${r.s3.ok ? (r.s3.corrected ? '(보정함)' : '(보정 안 함)') : ''}`;
            case 's4': return `느린 흐름 ${s.trendSec ? s.trendSec + '초 이동평균' : '빼지 않음'}, 범위 ${r.s4 ? r.s4.bandBpm.join('~') : s.band.join('~')}회/분`;
            case 's5': return `봉우리 최소 간격 ${s.minGap ? s.minGap + '초' : '자동' + (r.s5 ? '(' + r.s5.minGap + '초)' : '')}, 최종 방법 ${s.method === 'fft' ? '주파수 분석' : '봉우리 간격'}`;
            case 's6': return r.s6 && r.s6.wrist ? `손목 ${r.s6.wrist.bpm}회/분과 비교, 차이 ${fmt(r.s6.error)}회/분` : '손목 맥박 없음';
        }
        return '';
    }
    function renderTop() {
        const f = res.final, b = base.final;
        $('final').textContent = f && f.bpm != null ? fmt(f.bpm) : '--';
        const box = document.querySelector('.dl-final');
        const changed = f.bpm != null && b.bpm != null && Math.abs(f.bpm - b.bpm) >= 2;
        box.classList.toggle('changed', changed || f.bpm == null);
        let sub = res.error ? res.error : `${f.used === 'fft' ? '주파수 분석' : '봉우리 간격'}으로 구함 · 자료: ${data.title}`;
        if (b.bpm != null && f.bpm != null) sub += changed ? ` · 기본 설정이면 ${fmt(b.bpm)} → 지금 ${fmt(f.bpm)}` : ' · 기본 설정과 비슷';
        if (f.wrist) sub += ` · 손목 ${fmt(f.wrist.bpm)}`;
        $('final-sub').textContent = sub;
    }

    // ---------- 단계별 그리기 ----------
    const C = { r: '#c62828', g: '#2f9e44', y: '#495057', blue: '#1565c0', orange: '#e8590c' };
    function renderStep(step) {
        if (!res) return;
        ({ s0: r0, s1: r1, s2: r2, s3: r3, s4: r4, s5: r5, s6: r6 }[step] || r0)();
    }
    function r0() {
        const d = D.sourceDemo(settings.roi);
        $('roi-v').textContent = settings.roi + '%';
        // 흉내 사진: 화소를 그대로 크게
        const cv = $('c0a'), W = d.W, Hh = d.H;
        cv.width = W; cv.height = Hh;
        const c = cv.getContext('2d'), img = c.createImageData(W, Hh);
        for (let i = 0; i < W * Hh; i++) { img.data[i * 4] = d.first[i * 3]; img.data[i * 4 + 1] = d.first[i * 3 + 1]; img.data[i * 4 + 2] = d.first[i * 3 + 2]; img.data[i * 4 + 3] = 255; }
        c.putImageData(img, 0, 0);
        c.strokeStyle = '#fff'; c.lineWidth = 1; c.strokeRect(d.box.x + 0.5, d.box.y + 0.5, d.box.w - 1, d.box.h - 1);
        plot($('c0b'), [{ pts: d.series.map(p => ({ x: p.t, y: p.r })), color: C.r }], { xlabel: '초', ylabel: '평균 빨강' });
        const f = data.frames[0] || {};
        $('f0').innerHTML = `<ul>
            <li>실제 폰 사진 한 장(1920×1080) = 화소 <b>${fmt(d.phonePixels, 0)}</b>개 × 3색 = 숫자 <b>${fmt(d.phoneNumbers, 0)}</b>개 → 평균 <b>3</b>개. 1초에 30장이면 숫자 약 ${fmt(d.phoneNumbers * 30 / 1e6, 0)}백만 개가 1초에 90개로 줄어요.</li>
            <li>영역 ${settings.roi}% = 폰 사진에서 화소 약 <b>${fmt(d.roiPixelsPhone, 0)}</b>개 (그림은 ${d.W}×${d.H} 로 줄여 흉내, 영역 안 ${fmt(d.avg.n, 0)}칸)</li>
            <li>첫 사진의 평균: 빨강 <b>${fmt(d.avg.r)}</b> · 초록 <b>${fmt(d.avg.g)}</b> · 밝기 <b>${fmt(d.avg.y)}</b></li>
            <li>평균에 남은 흔들림: 맥파 크기 <b>${fmt(d.pulseAmp, 2)}</b> ÷ 잡음 <b>${fmt(d.noise, 2)}</b> = <b>${fmt(d.snr)}</b>배 (클수록 맥파가 잘 보임)</li>
            <li>지금 고른 자료의 첫 줄: 빨강 ${fmt(f.r, 2)} · 초록 ${fmt(f.g, 2)} · 밝기 ${fmt(f.y, 2)} — 이 세 숫자가 사진 한 장의 전부예요.</li></ul>`;
    }
    function r1() {
        const s = res.s1, t0 = s.t0, fr = data.frames;
        const pts = ch => fr.map(f => ({ x: f.t - t0, y: Number(f[ch]) }));
        const legend = [{ color: C.r, text: 'R' }, { color: C.g, text: 'G' }, { color: C.y, text: 'Y' }];
        plot($('c1a'), [{ pts: thin(pts('r'), 1500), color: C.r }, { pts: thin(pts('g'), 1500), color: C.g }, { pts: thin(pts('y'), 1500), color: C.y }],
            { xlabel: '초', ylabel: '0~255', legend, bands: [{ x0: s.view[0], x1: s.view[1], color: 'rgba(21,101,192,.12)' }] });
        plot($('c1b'), ['r', 'g', 'y'].map(ch => ({ pts: pts(ch), color: C[ch], dots: 2.5 })), { xmin: s.view[0], xmax: s.view[1], xlabel: '초', ylabel: '0~255' });
        plot($('c1c'), [{ pts: thin(s.gaps.map(g => ({ x: g.t, y: g.dt })), 1500), color: C.blue, width: 1 }], { xlabel: '초', ylabel: 'ms', xmin: s.view[0], xmax: s.view[1] });
        $('f1').innerHTML = `<ul><li>사진 <b>${fmt(s.n, 0)}</b>장 · 길이 <b>${fmt(s.dur, 1)}</b>초 · 평균 <b>${fmt(s.fps)}</b>장/초</li>
            <li>사진 사이 간격: 보통 <b>${fmt(s.dtMed)}</b> ms, 가장 짧게 ${fmt(s.dtMin)} ms ~ 가장 길게 <b>${fmt(s.dtMax)}</b> ms · 보통보다 25% 넘게 다른 간격 ${fmt(s.irregular, 0)}번</li></ul>`;
        const rows = fr.map((f, i) => ({ f, i, t: f.t - t0 })).filter(o => o.t >= s.view[0] && o.t <= s.view[1]).slice(0, 8);
        $('t1').innerHTML = '<tr><th>줄</th><th>시각(초)</th><th>R</th><th>G</th><th>Y</th><th>노출</th></tr>' +
            rows.map(o => `<tr><td>${o.i + 1}</td><td>${fmt(o.t, 3)}</td><td>${fmt(o.f.r, 2)}</td><td>${fmt(o.f.g, 2)}</td><td>${fmt(o.f.y, 2)}</td><td>${o.f.exposureTime == null ? '-' : fmt(o.f.exposureTime, 1) + (o.f.iso ? ' · ISO ' + fmt(o.f.iso, 0) : '')}</td></tr>`).join('') +
            `<tr><td colspan="6" class="note">보는 구간의 처음 ${rows.length}줄</td></tr>`;
    }
    function r2() {
        const s = res.s2, t0 = s.t0, fr = data.frames;
        $('p2').innerHTML = s.problems.map(p => `<li class="${p.kind === 'none' ? 'none' : ''}">${p.kind === 'none' ? '✅' : '⚠️'} ${esc(p.text)}</li>`).join('');
        $('sug').textContent = `(제안: ${s.suggest[0]}~${s.suggest[1]}초)`;
        $('k0').disabled = $('k1').disabled = settings.autoCut;
        if (settings.autoCut) { $('k0').value = s.keep[0]; $('k1').value = s.keep[1]; }
        const all = fr.map(f => ({ x: f.t - t0, y: Number(f.y) }));
        const bands = [];
        if (s.keep[0] > 0) bands.push({ x0: 0, x1: s.keep[0], color: 'rgba(198,40,40,.18)' });
        if (s.keep[1] < s.dur) bands.push({ x0: s.keep[1], x1: s.dur, color: 'rgba(198,40,40,.18)' });
        plot($('c2a'), [{ pts: thin(all, 1500), color: C.y }], { xlabel: '초', ylabel: '밝기 Y', bands, xmin: 0, xmax: s.dur });
        plot($('c2b'), [{ pts: thin(s.kept.map(f => ({ x: f.t - t0, y: Number(f.y) })), 1500), color: C.y }], { xlabel: '초', ylabel: '밝기 Y', xmin: 0, xmax: s.dur });
        $('f2').innerHTML = `<ul><li>남긴 구간 <b>${s.keep[0]}~${s.keep[1]}</b>초 · 남은 사진 <b>${fmt(s.kept.length, 0)}</b>장 (뺀 줄 ${fmt(s.removed, 0)}개)</li></ul>`;
    }
    function r3() {
        const s = res.s3;
        if (!s.ok) { $('f3').textContent = s.error; plot($('c3a'), [], { empty: s.error }); plot($('c3b'), [], { empty: s.error }); return; }
        plot($('c3a'), [{ pts: thin(s.before, 1500), color: C[s.ch], dots: 1.6, noLine: true }], { xlabel: '초', ylabel: CH_NAME[s.ch] });
        plot($('c3b'), [{ pts: thin(s.after, 1500), color: C[s.ch] }], { xlabel: '초', ylabel: '−ln(' + s.ch.toUpperCase() + ')' });
        const a = s.auto;
        const why = a ? Object.keys(a.scores).map(ch => `${CH_NAME[ch]} ${a.scores[ch].skip ? '빠짐(' + a.scores[ch].skip + ')' : '뚜렷함 ' + fmt(a.scores[ch].score * 100, 0) + '%'}`).join(' · ') : '';
        $('f3').innerHTML = `<ul><li>쓴 채널: <b>${CH_NAME[s.ch]}</b>${a ? ` (자동 — ${why})` : ''}</li>
            <li>채널 평균(0~255): 빨강 ${fmt(mean3(res.s2.kept, 'r'), 2)} · 초록 ${fmt(mean3(res.s2.kept, 'g'), 2)} · 밝기 ${fmt(mean3(res.s2.kept, 'y'), 2)}</li>
            <li>노출: 측정 동안 ${s.expVar == null ? '값 없음' : s.expVar + '% 바뀜'} → <b>${s.corrected ? '보정함' + (s.lag ? ` (노출 값 어긋남 ${s.lag}초 맞춤)` : '') : '보정 안 함'}</b>${settings.exposure === 'auto' ? ' · 자동 판단: ' + esc(s.mode.text) : ''}</li>
            <li>보간: 고르지 않은 사진 <b>${fmt(s.nBefore, 0)}</b>장 → 고른 칸 <b>${fmt(s.nAfter, 0)}</b>개 (1/30초마다, 사이는 직선으로 채움)</li></ul>`;
    }
    const mean3 = (fr, ch) => fr.length ? fr.reduce((a, f) => a + Number(f[ch]), 0) / fr.length : NaN;
    function r4() {
        if (!res.s4) { r3(); return; }
        const s = res.s4;
        plot($('c4a'), [{ pts: thin(s.before, 1500), color: C.y }, { pts: thin(s.trend, 1500), color: C.orange, width: 2.5 }], { xlabel: '초', legend: [{ color: C.y, text: '신호' }, { color: C.orange, text: '느린 흐름' }] });
        plot($('c4b'), [{ pts: thin(s.after, 1500), color: C.r }], { xlabel: '초' });
        $('f4').innerHTML = `<ul><li>느린 흐름: ${s.win ? `<b>${s.win}</b>초 동안의 평균(이동평균)을 빼요 — 이보다 느린 오르내림이 사라짐` : '빼지 않음 (평균만 뺌)'}</li>
            <li>남긴 범위: 분당 <b>${s.bandBpm[0]}~${s.bandBpm[1]}</b>회 (1초에 ${fmt(s.band[0], 2)}~${fmt(s.band[1], 2)}번 오르내림)</li>
            <li>남은 흔들림 크기: 거르기 전의 <b>${s.keepPct}%</b></li></ul>`;
    }
    function r5() {
        if (!res.s5) { r3(); return; }
        const s = res.s5;
        plot($('c5a'), [{ pts: thin(s.wave, 1500), color: C.r }, { pts: s.dots, color: C.blue, dots: 4, noLine: true }], { xlabel: '초' });
        const fft = s.bpmFFT;
        plot($('c5b'), [{ pts: s.spec, color: C.blue }], { xlabel: '회/분', xmin: 0, xmax: 240, ymin: 0, ymax: 1.05, yticks: false,
            bands: [{ x0: res.s4.bandBpm[0], x1: res.s4.bandBpm[1], color: 'rgba(47,158,68,.10)' }], vlines: Number.isFinite(fft) ? [{ x: fft, color: C.orange }] : [] });
        $('f5').innerHTML = `<ul><li>① 봉우리 <b>${s.nPeaks}</b>개 (최소 간격 ${s.minGap}초${s.minGapAuto ? ', 자동' : ''}) → 박동 간격 ${s.ibiOk.length}개${s.ibiDropped ? `, 튀는 간격 ${s.ibiDropped}개 뺌` : ''} → 평균 간격으로 <b>${fmt(s.bpmPeaks)}</b> 회/분${Number.isFinite(s.cv) ? ` (간격 고름: 흔들림 ${fmt(s.cv * 100, 0)}%)` : ''}</li>
            <li>박동 간격(ms): ${s.ibi.slice(0, 24).join(', ')}${s.ibi.length > 24 ? ' …' : ''}</li>
            <li>② 주파수 분석: 가장 센 빠르기 <b>${fmt(fft)}</b> 회/분 (주황 선, 뚜렷함 ${fmt(s.peakRatio * 100, 0)}%)</li>
            <li>두 방법의 차이: <b>${fmt(res.s6.agreePct)}%</b> ${res.s6.agreePct != null && res.s6.agreePct < 5 ? '— 잘 맞음 ✅' : '— 많이 다름 ⚠️ (어느 쪽을 믿을지 생각해 보세요)'}</li></ul>`;
    }
    function r6() {
        const f = res.s6 || { bpm: null };
        const truth = data.truth;
        $('r6').innerHTML = res.error ? `<p class="note err">${esc(res.error)}</p>` :
            `<div>최종 심박수 <span class="big">${fmt(f.bpm)}</span> 회/분 <span class="note">(${f.used === 'fft' ? '주파수 분석' : '봉우리 간격'})</span></div>
            <div class="note">기본 설정이면 ${fmt(base.final.bpm)} 회/분 · 봉우리 ${fmt(res.s5.bpmPeaks)} · 주파수 분석 ${fmt(res.s5.bpmFFT)}</div>
            ${data.garbage ? `<p class="note err garbage">🗑 쓰레기가 들어가면 쓰레기가 나온다: ${esc(data.garbage)}</p>` : ''}
            ${truth ? `<div>이 가짜 자료를 만들 때 정한 심박수: <b>${truth}</b> 회/분 → 차이 <b>${fmt(f.bpm - truth)}</b> 회/분 (${fmt((f.bpm - truth) / truth * 100)}%)</div>` : ''}`;
        const w = f.wrist;
        $('w6').innerHTML = w ? `손목 맥박 <b>${fmt(w.bpm)}</b> 회/분 (${w.n}번 평균: ${w.each.join(', ')}) → 카메라와 차이 <b>${fmt(f.error)}</b> 회/분 (<b>${fmt(f.errorPct)}%</b>) ${Math.abs(f.errorPct) <= 5 ? '✅ 5% 안' : '⚠️ 5% 넘음 — 어느 단계 선택이 원인일까?'}` : '';
        renderSheet();
    }
    function renderSheet() {
        if (!res) return;
        const rows = Object.keys(STEP_NAMES).map(k => ({ step: STEP_NAMES[k].split(' ')[0], name: STEP_NAMES[k].replace(/^\d /, ''), setting: settingLine(k), note: store.notes[k] || '' }));
        $('sheet').innerHTML = `<b>자료</b>: ${esc(data.title)} · <b>최종</b> ${fmt(res.final.bpm)} 회/분 (기본 설정 ${fmt(base.final.bpm)})` +
            '<table><tr><th>단계</th><th>고른 것</th><th>이유 (내 기록)</th></tr>' +
            rows.map(r => `<tr><td>${r.step} ${esc(r.name)}</td><td>${esc(r.setting)}</td><td>${r.note ? esc(r.note) : '<span class="note">(적지 않음)</span>'}</td></tr>`).join('') + '</table>';
        sheetText = D.notesText(data.title, rows) + `최종 심박수: ${fmt(res.final.bpm)} 회/분 (기본 설정 ${fmt(base.final.bpm)})\n`;
    }
    let sheetText = '';
    $('copy').addEventListener('click', async () => {
        renderSheet();
        try { await navigator.clipboard.writeText(sheetText); $('copy-msg').textContent = '📋 복사했어요 — 보고서에 붙여 넣으세요'; }
        catch (e) {
            const ta = document.createElement('textarea'); ta.value = sheetText; document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (er) { ok = false; }
            ta.remove();
            $('copy-msg').textContent = ok ? '📋 복사했어요' : '복사가 막혔어요 — 기록 모음을 손으로 골라 복사하세요';
        }
    });
    $('print').addEventListener('click', () => { renderSheet(); document.body.classList.add('print-sheet'); window.print(); setTimeout(() => document.body.classList.remove('print-sheet'), 500); });

    // ---------- 시작 ----------
    let steps = null;
    steps = window.LabUI ? LabUI.initSteps({ key: 'data-lab', onShow: s => renderStep(s) }) : null;
    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => renderStep(steps ? steps.current() : 's0'), 80); });
    fillSources();
    syncInputs();
    loadSource(store.src && D.EXAMPLES.some(e => e.id === store.src) ? store.src : 'r5');
})();
