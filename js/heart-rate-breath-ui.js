// 숨 참기 탐구 화면 (projects/heart-rate.html 의 '🫁 숨 참기 탐구' 모드). 설계: docs/data-processing-class-design.md 2부
//  안정 60초 → 숨 참기 30/60초(■ 멈춤 가능) → 회복 60초를 끊지 않고 이어서 기록. 카메라·노출 잠금·기록은 js/heart-rate.js(__hrCore)를 그대로 씀
//  계산은 js/heart-rate-breath.js. 안전 확인 셋을 체크해야 시작, 선택 항목(운동 습관·키·몸무게 구간, 성별 없음), 동의한 회차만 보냄
(function () {
    'use strict';
    const core = window.__hrCore, B = window.HeartRateBreath, H = window.HeartRateMath;
    if (!core || !B || !H) return;
    const $ = id => document.getElementById(id);
    const esc = core.esc;
    const PHONE = !!core.isPhone;   // 📱 노트북 QR 로 연 폰: 측정만, 원본을 골라 보냄 (계산·결과는 노트북)
    const R = window.HeartRateRaw;
    const KEY = 'heart-rate-breath:v1' + (PHONE ? ':phone' : '');
    const MAX_RUNS = 20, KEEP_RAW = 2;
    // 시험용: 주소 끝 #breath-scale=0.2 면 구간 길이를 0.2 배로 (안정 12초 · 숨 참기 6초 · 회복 12초)
    const SCALE = (() => { const m = /breath-scale=([\d.]+)/.exec(location.hash); const v = m ? Number(m[1]) : 1; return v > 0 && v <= 1 ? v : 1; })();

    let state = { mode: 'live', hold: 30, profile: { exercise: '', height: '', weight: '' }, consent: false, runs: [], ext: {}, view: '', cmp: null, share: null, phoneRuns: [] };
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') state = Object.assign(state, s); } catch (e) { /* 무시 */ }
    if (!Array.isArray(state.runs)) state.runs = [];
    if (!Array.isArray(state.phoneRuns)) state.phoneRuns = [];
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { core.msg('⚠ 숨 참기 회차를 이 브라우저에 저장하지 못했어요. CSV 로 내려받아 두세요.', 'warn'); } }

    // ---------- 모드 바꾸기 ----------
    function setMode(m) {
        state.mode = m === 'breath' ? 'breath' : 'live';
        save();
        document.body.classList.toggle('mode-breath', state.mode === 'breath');
        $('breath').hidden = state.mode !== 'breath';
        $('mode-live').setAttribute('aria-pressed', String(state.mode === 'live'));
        $('mode-breath').setAttribute('aria-pressed', String(state.mode === 'breath'));
        if (share) share.stepChanged();
        gate(); renderRuns(); renderResult();
    }
    $('mode-live').addEventListener('click', () => { if (!busy()) setMode('live'); });
    $('mode-breath').addEventListener('click', () => { if (!busy()) setMode('breath'); });
    const busy = () => !!timeline || core.phase() === 'settle' || core.phase() === 'adjust' || core.phase() === 'verify' || core.phase() === 'rec';

    // ---------- 안전 확인 · 시작 ----------
    const safety = ['br-sit', 'br-watch', 'br-ok'];
    function gate() {
        const allSafe = safety.every(id => $(id).checked), cam = core.hasCamera(), idle = core.phase() === 'idle';
        $('br-start').disabled = !(allSafe && cam && idle && !timeline);
        $('br-why').textContent = timeline ? '' : !cam ? '📷 위 띠에서 카메라를 먼저 켜세요' : !allSafe ? '안전 확인 셋을 모두 체크해야 시작돼요' : !idle ? '' : `약 ${Math.round((B.REST + state.hold + B.RECOVER) * SCALE / 60 * 10) / 10}분 걸려요`;
    }
    safety.forEach(id => $(id).addEventListener('change', gate));
    setInterval(() => { if (state.mode === 'breath') gate(); }, 500);
    document.querySelectorAll('.br-len button').forEach(b => b.addEventListener('click', () => {
        if (timeline) return;
        state.hold = Number(b.dataset.hold) === 60 ? 60 : 30; save();
        document.querySelectorAll('.br-len button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        gate();
    }));
    document.querySelectorAll('.br-len button').forEach(x => x.setAttribute('aria-pressed', String(Number(x.dataset.hold) === state.hold)));

    // ---------- 선택 항목 ----------
    const fill = (sel, list, val) => { $(sel).innerHTML = '<option value="">안 씀</option>' + list.map(v => `<option${v === val ? ' selected' : ''}>${esc(v)}</option>`).join(''); };
    fill('br-ex', B.EXERCISE, state.profile.exercise); fill('br-h', B.HEIGHT, state.profile.height); fill('br-w', B.WEIGHT, state.profile.weight);
    [['br-ex', 'exercise'], ['br-h', 'height'], ['br-w', 'weight']].forEach(([id, k]) => $(id).addEventListener('change', e => { state.profile[k] = e.target.value; save(); }));
    $('br-consent').checked = !!state.consent;
    $('br-consent').addEventListener('change', e => { state.consent = e.target.checked; save(); });

    // ---------- 측정 진행 ----------
    let timeline = null;   // { rec, holdStartWall, holdEndWall, endWall, stopped, timer, marks: { holdStart, holdEnd } (프레임 시각, 초) }
    const frameNow = rec => rec.frames.length ? rec.frames[rec.frames.length - 1].t - rec.frames[0].t : 0;
    function showRun(on) { $('br-run').hidden = !on; $('br-setup').hidden = !!on; }
    function setPhase(p, count, guide) {
        $('br-phase').textContent = p === 'rest' ? '안정' : p === 'hold' ? '숨 참기' : p === 'rec' ? '회복' : '준비';
        $('br-count').textContent = count == null ? '…' : String(Math.max(0, Math.ceil(count)));
        $('br-guide').textContent = guide;
        $('br-run').classList.toggle('hold', p === 'hold');
        $('br-stop').hidden = p !== 'hold';
        const order = ['rest', 'hold', 'rec'], i = order.indexOf(p);
        document.querySelectorAll('.br-steps span').forEach((s, k) => { s.classList.toggle('on', k === i); s.classList.toggle('done', i >= 0 && k < i); });
    }
    $('br-start').addEventListener('click', async () => {
        if ($('br-start').disabled) return;
        timeline = { stopped: false, marks: {} };
        showRun(true);
        setPhase('prep', null, '손가락을 카메라에 대고 가만히 — 노출을 맞추는 중이에요');
        $('br-result').hidden = true;
        const ok = await core.start({ breath: true, onRec, onFinish });
        if (ok === false) { timeline = null; showRun(false); gate(); }
    });
    function onRec(rec) {
        const now = performance.now(), L = s => s * 1000 * SCALE;
        Object.assign(timeline, { rec, startWall: now, holdStartWall: now + L(B.REST), planned: state.hold });
        timeline.holdEndWall = timeline.holdStartWall + L(state.hold);
        timeline.endWall = timeline.holdEndWall + L(B.RECOVER);
        timeline.timer = setInterval(tickTimeline, 200);
        tickTimeline();
    }
    function tickTimeline() {
        const t = timeline;
        if (!t || !t.rec) return;
        const now = performance.now();
        if (now < t.holdStartWall) { setPhase('rest', (t.holdStartWall - now) / 1000, '편하게 앉아 숨 쉬세요 · 손가락은 그대로'); return; }
        if (t.marks.holdStart == null) t.marks.holdStart = frameNow(t.rec);
        if (now < t.holdEndWall) { setPhase('hold', (t.holdEndWall - now) / 1000, '숨을 참으세요 · 힘들면 바로 ■ 멈춤'); return; }
        if (t.marks.holdEnd == null) { t.marks.holdEnd = frameNow(t.rec); }
        if (now < t.endWall) { setPhase('rec', (t.endWall - now) / 1000, '편하게 숨 쉬세요 · 손가락은 그대로'); return; }
        clearInterval(t.timer); t.timer = null;
        setPhase('rec', 0, '계산하는 중…');
        core.finish(false);
    }
    // ■ 숨 참기 멈춤: 누른 때를 숨 참기 끝으로, 바로 회복 60초
    $('br-stop').addEventListener('click', () => {
        const t = timeline;
        if (!t || !t.rec || t.marks.holdStart == null || t.marks.holdEnd != null) return;
        const now = performance.now();
        t.stopped = true;
        t.marks.holdEnd = frameNow(t.rec);
        t.holdEndWall = now; t.endWall = now + B.RECOVER * 1000 * SCALE;
        tickTimeline();
    });
    $('br-abort').addEventListener('click', () => { if (timeline) core.finish(true); });
    function onFinish(rec, cancel) {
        const t = timeline;
        if (t && t.timer) clearInterval(t.timer);
        timeline = null;
        if (cancel || !t || t.marks.holdStart == null || t.marks.holdEnd == null) {
            showRun(false); gate();
            core.msg('숨 참기 측정을 그만둬서 저장하지 않았어요. 다시 하려면 ▶ 숨 참기 측정 시작.', 'warn');
            return;
        }
        const ph0 = { holdStart: round1(t.marks.holdStart), holdEnd: round1(t.marks.holdEnd), end: round1(frameNow(rec)), holdPlanned: t.planned, stopped: t.stopped, scale: SCALE };
        if (PHONE) {
            // 폰은 계산하지 않고 원본만 저장 → 위 '📱 노트북과 연결됨' 띠의 회차 목록에서 골라 보냄
            const id = (() => { let k = 1; const ids = new Set(state.phoneRuns.map(r => r.id)); while (ids.has('b' + k)) k++; return 'b' + k; })();
            state.phoneRuns.push({ id, mode: 'breath', at: new Date().toISOString(), ph: ph0, raw: H.pack(rec.frames), lock: rec.lock || 'unlocked', why: rec.why || '', lockLog: rec.lockLog || null, scene: rec.scene || null });
            while (state.phoneRuns.length > 10) state.phoneRuns.shift();
            save();
            showRun(false); gate();
            if (share) share.saved();
            core.msg(`💾 숨 참기 회차를 저장했어요 (참은 시간 ${Math.round(ph0.holdEnd - ph0.holdStart)}초${ph0.stopped ? ', 멈춤' : ''}). 위 띠에서 보낼 회차를 체크하고 📤 를 누르면 노트북에서 결과를 봐요.`);
            return;
        }
        setPhase('rec', 0, '계산하는 중… (몇 초 걸려요)');
        setTimeout(() => {
            const frames = rec.frames;
            const ph = ph0;
            const curve = B.breathCurve(frames, { lock: rec.lock || 'unlocked', scene: rec.scene });
            const metrics = B.breathMetrics(curve, ph);
            const run = {
                id: newId(), at: new Date().toISOString(), ph, curve, metrics, profile: Object.assign({}, state.profile), consent: !!state.consent,
                lock: rec.lock === 'locked' ? '🔒 노출 고정됨' : '⚠ 고정 안 됨' + (rec.why ? ' (' + rec.why + ')' : ''), raw: H.pack(frames)
            };
            state.runs.push(run);
            while (state.runs.length > MAX_RUNS) state.runs.shift();
            state.runs.forEach((r, i) => { if (i < state.runs.length - KEEP_RAW) delete r.raw; });   // 원본은 최근 2회차만 (저장 공간)
            state.view = run.id; state.cmp = null;
            save();
            showRun(false); gate(); renderRuns(); renderResult();
            if (share) share.saved();
            devSend(run);
            const m = run.metrics;
            core.msg(`✅ 숨 참기 회차를 저장했어요: 안정 ${m.restMean == null ? '-' : m.restMean} → 숨 참기 마지막 10초 ${m.holdLastMean == null ? '-' : m.holdLastMean} 회/분 (변화율 ${m.changePct == null ? '-' : m.changePct}%)` + (run.consent ? '' : ' · 수업 분석 동의를 안 해서 보내지 않아요'));
            $('br-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 30);
    }
    const round1 = x => Math.round(x * 10) / 10;
    function newId() { let k = 1; const ids = new Set(state.runs.map(r => r.id)); while (ids.has('b' + k)) k++; return 'b' + k; }

    // ---------- 결과 ----------
    function plotCurve(cv, runs, o) {
        const colors = ['#c62828', '#1565c0', '#2f9e44', '#ae3ec9', '#e8590c', '#0c8599'];
        const series = [];
        runs.forEach((r, i) => {
            const off = o.align ? r.ph.holdStart : 0;
            series.push({ pts: r.curve.filter(p => p.ok).map(p => ({ x: p.t - off, y: p.bpm })), color: colors[i % colors.length], width: 2, dots: 2 });
        });
        const bands = [];
        if (!o.align && runs[0]) bands.push({ x0: runs[0].ph.holdStart, x1: runs[0].ph.holdEnd, color: 'rgba(95,107,122,.15)' });
        if (o.align) bands.push({ x0: 0, x1: Math.max(...runs.map(r => r.ph.holdEnd - r.ph.holdStart)), color: 'rgba(95,107,122,.12)' });
        if (!o.align && runs[0] && runs[0].metrics.restMean != null) series.push({ pts: [{ x: 0, y: runs[0].metrics.restMean }, { x: runs[0].ph.end, y: runs[0].metrics.restMean }], color: '#5f6b7a', dash: [4, 4], width: 1 });
        // 세로축은 적어도 20 회/분 폭 (1~2 회/분 흔들림이 크게 부풀어 보이지 않게)
        const ys = series.flatMap(x => x.pts.map(p => p.y)).filter(Number.isFinite);
        let ymin, ymax;
        if (ys.length) { const lo = Math.min(...ys), hi = Math.max(...ys), mid = (lo + hi) / 2, half = Math.max(10, (hi - lo) / 2 + 3); ymin = Math.floor(mid - half); ymax = Math.ceil(mid + half); }
        core.plot(cv, series, { xlabel: o.align ? '숨 참기 시작부터 (초)' : '시간 (초)', ylabel: '심박수 (회/분)', bands, ymin, ymax, empty: '쓸 수 있는 창이 없어요' });
    }
    function title(r, i) { return `${i + 1}회 · ${r.from ? r.from + ' · ' : ''}숨 참기 ${r.ph.holdPlanned}초` + (r.ph.stopped ? ` (${Math.round(r.metrics.heldSec)}초에 멈춤)` : '') + (r.ph.scale && r.ph.scale !== 1 ? ' · 시험' : ''); }
    function renderResult() {
        const i = state.runs.findIndex(r => r.id === state.view), r = state.runs[i];
        $('br-result').hidden = !r || state.mode !== 'breath';
        if (!r || state.mode !== 'breath') return;
        const m = r.metrics, f = (v, u) => v == null ? '-' : v + (u || '');
        $('br-rtitle').textContent = title(r, i) + ' · ' + new Date(r.at).toLocaleTimeString('ko-KR');
        $('br-metrics').innerHTML =
            `<div>안정 평균<b>${f(m.restMean, ' 회/분')}</b></div>` +
            `<div>숨 참기 마지막 10초<b>${f(m.holdLastMean, ' 회/분')}</b></div>` +
            `<div>변화율<b>${m.changePct == null ? '-' : (m.changePct > 0 ? '+' : '') + m.changePct + '%'}</b></div>` +
            `<div>가장 낮은 값<b>${m.low ? m.low.bpm + ' 회/분 (' + m.low.t + '초)' : '-'}</b></div>` +
            `<div>회복 시간<b>${esc(m.recoveryText)}</b></div>` +
            `<div>참은 시간<b>${m.heldSec}초${r.ph.stopped ? ' (멈춤)' : ''}</b></div>` +
            `<div>뺀 창(신뢰도 낮음)<b>${m.dropped} / ${m.total}</b></div>` +
            `<div>노출<b>${esc(r.lock)}</b></div>`;
        plotCurve($('br-curve'), [r], { align: false });
    }
    function cmpRuns() {
        if (Array.isArray(state.cmp)) return state.runs.filter(r => state.cmp.includes(r.id));
        // 기본: 가장 최근 30초 회차와 60초 회차
        const last = n => state.runs.slice().reverse().find(r => r.ph.holdPlanned === n);
        return [last(30), last(60)].filter(Boolean);
    }
    function renderRuns() {
        const ul = $('br-runs');
        $('br-runs-empty').hidden = !!state.runs.length;
        $('br-csv-all').disabled = !state.runs.length;
        const nOk = state.runs.filter(r => r.consent).length;
        $('br-runs-sum').textContent = state.runs.length ? `— ${state.runs.length}개 · 보낼 수 있는 것 ${nOk}개` : '';
        $('br-send').disabled = !nOk;
        $('br-send').textContent = `📤 동의한 회차 선생님께 보내기 (${nOk}개)`;
        const cmp = cmpRuns().map(r => r.id);
        ul.innerHTML = state.runs.map((r, i) => {
            const m = r.metrics;
            return `<li><span class="ttl">${esc(title(r, i))} <small>${new Date(r.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</small></span>` +
                `<span>변화율 <b>${m.changePct == null ? '-' : (m.changePct > 0 ? '+' : '') + m.changePct + '%'}</b> · 안정 ${m.restMean == null ? '-' : m.restMean} · 회복 ${esc(m.recoveryText)}</span>` +
                `<label class="chk"><input type="checkbox" data-consent="${esc(r.id)}"${r.consent ? ' checked' : ''}> 수업 분석 동의</label>` +
                `<label class="chk"><input type="checkbox" data-cmp="${esc(r.id)}"${cmp.includes(r.id) ? ' checked' : ''}> 비교</label>` +
                `<span class="acts"><button type="button" class="secondary" data-view="${esc(r.id)}" title="결과 보기">🔍</button><button type="button" class="info" data-csv="${esc(r.id)}" title="CSV">⬇</button><button type="button" class="danger" data-del="${esc(r.id)}" title="지우기">🗑</button></span></li>`;
        }).reverse().join('');
        if (state.mode === 'breath') plotCurve($('br-compare'), cmpRuns(), { align: true });
    }
    $('br-runs').addEventListener('change', e => {
        const c = e.target.dataset.consent, k = e.target.dataset.cmp;
        if (c) { const r = state.runs.find(x => x.id === c); if (r) { r.consent = e.target.checked; save(); renderRuns(); if (share) share.saved(); } }
        if (k) { const ids = cmpRuns().map(r => r.id).filter(id => id !== k); if (e.target.checked) ids.push(k); state.cmp = ids; save(); renderRuns(); }
    });
    $('br-runs').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.view) { state.view = b.dataset.view; save(); renderResult(); $('br-result').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        else if (b.dataset.csv) { const r = state.runs.find(x => x.id === b.dataset.csv); if (r) core.download('breath_' + r.id + '.csv', B.breathCsv(r)); }
        else if (b.dataset.del) { if (!confirm('이 숨 참기 회차를 지울까요?')) return; state.runs = state.runs.filter(x => x.id !== b.dataset.del); if (state.view === b.dataset.del) state.view = ''; save(); renderRuns(); renderResult(); if (share) share.saved(); }
    });
    $('br-csv-all').addEventListener('click', () => core.download('breath_all.csv', state.runs.map(B.breathCsv).join('\n')));
    window.addEventListener('resize', () => { if (state.mode === 'breath') { renderResult(); renderRuns(); } });

    // ---------- 개발 자동 수집 (선생님 기기만, js/dev-collect.js) ----------
    function devSend(run) {
        if (typeof DevCollect === 'undefined' || !DevCollect.active()) return;
        const m = run.metrics;
        DevCollect.send('heartrate', {
            id: 'hrb-' + DevCollect.device().slice(-6) + '-' + Math.floor(Date.parse(run.at) / 1000).toString(36) + '-' + run.id,
            measuredAt: run.at,
            summary: { '종류': '숨 참기', '변화율': m.changePct == null ? '' : m.changePct, '참은 초': m.heldSec, '안정 평균': m.restMean == null ? '' : m.restMean, '회복': m.recoverySec == null ? '' : m.recoverySec },
            data: { kind: 'breath', csv: B.breathCsv(run), raw: run.raw ? H.toCsv(H.unpack(run.raw), { locked: /고정됨/.test(run.lock) }) : '', ph: run.ph, metrics: m, lock: run.lock,
                device: DevCollect.uaSummary(navigator.userAgent) }
        });
    }

    // ---------- 📱 폰 → 노트북 원본 ----------
    // 폰의 회차 목록 = 한 번 재기(js/heart-rate.js 의 회차) + 숨 참기(이 화면의 phoneRuns)
    function phoneRawRuns() {
        const tm = at => R.timeText(at);
        const once = core.runs().filter(r => r.raw && !r.sim && !String(r.lock).startsWith('csv')).map(r => ({
            id: r.id, mode: 'once', at: r.at, frames: H.unpack(r.raw), lock: r.lock, why: r.why, lockLog: r.lockLog, scene: r.scene, torch: r.torch,
            bpm: r.res && r.res.bpm, title: `❤️ 한 번 재기 · ${tm(r.at)}` }));
        const br = state.phoneRuns.map(r => ({
            id: r.id, mode: 'breath', at: r.at, frames: H.unpack(r.raw), lock: r.lock, why: r.why, lockLog: r.lockLog, scene: r.scene, ph: r.ph,
            held: r.ph.holdEnd - r.ph.holdStart, title: `🫁 숨 참기 ${r.ph.holdPlanned}초${r.ph.stopped ? ' (' + Math.round(r.ph.holdEnd - r.ph.holdStart) + '초에 멈춤)' : ''} · ${tm(r.at)}` }));
        return once.concat(br);
    }
    // 노트북: 받은 원본 중 처음 보는 것만 → 숨 참기는 곡선·지표를 여기서 계산해 회차로, 한 번 재기는 심박수 회차 목록으로
    const seenRaw = new Set();
    function takeRaw(list) {
        let got = 0;
        list.forEach(it => {
            const sig = it.key + '|' + it.sentAt;
            if (seenRaw.has(sig)) return;
            seenRaw.add(sig);
            const u = R.rawUnpack(it.raw);
            if (!u || !u.frames.length) return;
            if (it.mode === 'breath' && u.ph) {
                const old = state.runs.find(r => r.srcKey === it.key);
                if (old && old.at === u.at) return;
                const curve = B.breathCurve(u.frames, { lock: u.lock || 'unlocked', scene: u.scene });
                const metrics = B.breathMetrics(curve, u.ph);
                const run = { id: old ? old.id : newId(), at: u.at || new Date().toISOString(), ph: u.ph, curve, metrics, profile: Object.assign({}, state.profile), consent: false,
                    lock: u.lock === 'locked' ? '🔒 노출 고정됨' : '⚠ 고정 안 됨' + (u.why ? ' (' + u.why + ')' : ''), raw: H.pack(u.frames), from: it.from, srcKey: it.key, decimate: u.decimate };
                if (old) Object.assign(old, run); else state.runs.push(run);
                while (state.runs.length > MAX_RUNS) state.runs.shift();
                state.runs.forEach((r, i) => { if (i < state.runs.length - KEEP_RAW) delete r.raw; });
                state.view = run.id;
                got++;
            } else if (it.mode === 'once') {
                if (core.runs().some(r => r.srcKey === it.key)) return;
                core.addRun({ frames: u.frames, lock: u.lock || 'unlocked', why: u.why, lockLog: u.lockLog, scene: u.scene, at: u.at, torch: u.torch, from: it.from, srcKey: it.key, fromPhone: true });
                got++;
            }
        });
        if (got) { save(); renderRuns(); renderResult(); }
        return got;
    }
    function phoneNote(n) {
        const el = $('br-phone-note');
        el.hidden = false;
        el.innerHTML = `🆕 <b>폰에서 새 회차 ${n}개</b>가 들어왔어요. 숨 참기는 아래 '내 숨 참기 회차'에, 한 번 재기는 '🗂 측정 회차'에 있어요.`;
    }
    core.hooks.onRunSaved = () => { if (PHONE && share) share.saved(); };
    core.hooks.onRunDeleted = () => { if (PHONE && share) share.saved(); };

    // ---------- 📱 원본을 선생님께도 보낼지 (수업 ?c= 로 들어온 폰만, 2026-11-20 선생님 결정 "동의 먼저 받기") ----------
    //  수업 공간에 들어간 원본(kind 'raw')은 교사 화면 조 카드·내려받기에도 보인다. 그래서 폰에서 먼저 묻는다.
    //   - 동의함: 지금처럼 수업 공간으로 (요약에 '원본(동의함)' 표시 → 교사 화면에서 구분)
    //   - 동의 안 함: 이 폰과 QR 을 만든 노트북만 읽는 짝 공간(주소의 pp=, 수업 없이 열 때의 폰 짝과 같은 방식)으로 → 노트북 분석은 그대로
    //   - 끄면 이미 수업 공간에 보낸 원본도 빼고(지움 줄) 다음부터 짝 공간으로
    const PCF = window.PendulumCloud, CC = window.ClassCloud;
    const CLASS = CC && CC.readClassParam ? CC.readClassParam(location.search) : '';
    const PAIR_RE = /^p[a-z0-9]{23}$/;
    const newPair = () => { let sp = 'p'; for (let i = 0; i < 23; i++) sp += 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]; return sp; };
    if (!state.pair || typeof state.pair !== 'object') state.pair = {};          // 노트북: 수업마다 폰 짝 공간 { 수업 코드: 공간 id }
    if (!state.rawOk || typeof state.rawOk !== 'object') state.rawOk = {};      // 폰: 수업마다 원본 동의 { 수업 코드: true }
    if (!state.classSent || typeof state.classSent !== 'object') state.classSent = {};   // 폰: 수업 공간에 보낸 원본 id { 수업 코드: [줄 id] }
    const PAIR = PHONE ? ((/[?&]pp=([a-z0-9]+)/.exec(location.search) || [])[1] || '') : (CLASS ? (state.pair[CLASS] = PAIR_RE.test(state.pair[CLASS] || '') ? state.pair[CLASS] : newPair()) : '');
    if (!PHONE && CLASS) save();
    const pairOk = PAIR_RE.test(PAIR);
    const rawOn = () => !!(CLASS && state.rawOk[CLASS]);
    const classUrl = () => (PCF ? PCF.resolveServer(location.search).url : 'lab:');
    function myRawItems() {
        const memo = share && share.runs ? share.runs() : {};
        return R.rawItems(phoneRawRuns()).map(it => {
            const m = memo[String(it.id)] && memo[String(it.id)].memo;
            const out = m ? Object.assign({}, it, { title: String(it.title) + ' · ' + m }) : Object.assign({}, it);
            if (CLASS && rawOn()) out.summary = Object.assign({}, it.summary, { '원본(동의함)': 1 });   // 교사 화면 조 카드에 보임
            return out;
        });
    }
    async function saveAll(url, payloads, ctx) {
        let done = 0; const ids = [], cleared = [];
        for (const pl of payloads) {
            if (ctx) ctx.progress(done + 1, payloads.length);
            const body = Object.assign({}, pl); delete body.tooBig;
            const r = await PCF.save(url, body);
            if (!r.ok) return { ok: false, error: r.error, network: !!r.network, done, ids, cleared };
            done++; (pl.n > 0 ? ids : cleared).push(pl.id);
        }
        return { ok: true, done, ids, cleared };
    }
    // 수업 공간에서 이 폰이 보낸 원본 줄 빼기 (동의를 끌 때)
    async function clearClass() {
        const sent = state.classSent[CLASS] || [];
        if (!sent.length || !share) return { ok: true, done: 0 };
        const b = ClassShare.buildPayloads({ exp: 'heartrate', group: share.group(), device: share.device(), items: [], sent, isGroupCode: PCF.isGroupCode });
        if (b.error) return { ok: true, done: 0 };
        const r = await saveAll(classUrl(), b.payloads);
        state.classSent[CLASS] = sent.filter(id => r.cleared.indexOf(id) < 0); save();
        return r;
    }
    // 폰 보내기: 수업이면 동의에 따라 수업 공간 / 짝 공간, 수업이 아니면 지금처럼 (ctx.url = 짝 공간)
    async function phoneSend(ctx) {
        let url = ctx.url, note = '';
        if (CLASS && !rawOn()) {
            if (!pairOk) return { ok: false, error: "원본을 선생님께 보내는 데 동의하지 않았는데, 이 QR 에는 짝 노트북 자리가 없어요(예전 QR). 노트북 화면의 새 QR 을 찍거나, 위 '선생님께도 보내기'를 체크하세요" };
            url = 'lab:' + PAIR; note = '🔒 원본은 선생님께는 가지 않고 짝 노트북만 받아요.';
        }
        const b = ClassShare.buildPayloads({ exp: 'heartrate', group: ctx.group, device: ctx.device, items: myRawItems(), sent: url === ctx.url ? ctx.sent : [], only: ctx.only, isGroupCode: PCF.isGroupCode });
        if (b.error) return { ok: false, error: b.error };
        const r = await saveAll(url, b.payloads, ctx);
        if (CLASS && url === ctx.url) {
            const list = state.classSent[CLASS] || [];
            r.ids.forEach(id => { if (list.indexOf(id) < 0) list.push(id); });
            state.classSent[CLASS] = list.filter(id => r.cleared.indexOf(id) < 0); save();
            note = '🔓 원본은 같은 조 노트북과 선생님께도 갔어요(동의함).';
        }
        if (CLASS && url !== ctx.url && r.ok) await clearClass();   // 예전에 동의해서 보낸 것이 남아 있으면 이번에 뺌
        return Object.assign(r, { note });
    }
    // 노트북(수업): 수업 공간 + 폰 짝 공간을 함께 불러와 합침 (같은 폰·같은 회차는 나중에 보낸 것)
    const seenRows = {};
    async function laptopPull(ctx) {
        const q = u => u + (u.indexOf('?') >= 0 ? '&' : '?') + 'exp=heartrate';
        const lists = await Promise.all([PCF.list(q(ctx.url), ctx.group), pairOk ? PCF.list(q('lab:' + PAIR), ctx.group) : Promise.resolve({ ok: true, items: [] })]);
        if (!lists[0].ok) return lists[0];
        const byId = {};
        lists.forEach(l => (l.ok ? l.items || [] : []).forEach(x => { const k = String(x.id), o = byId[k]; if (!o || String(x.sentAt || '') >= String(o.sentAt || '')) byId[k] = x; }));
        const items = ClassShare.incomingFrom(Object.values(byId), ctx.device);
        const changed = onIncoming(items);
        let phoneNew = 0; const first = !Object.keys(seenRows).length && !laptopPull.ran;
        items.forEach(x => { if (ClassShare.isPhoneDevice(x.device) && !seenRows[x.rowId] && !first) phoneNew++; seenRows[x.rowId] = 1; });
        laptopPull.ran = true;
        const others = {}; items.forEach(x => { others[x.device] = 1; });
        return { ok: true, changed, others: Object.keys(others).length, points: items.reduce((n, x) => n + x.n, 0), phoneNew };
    }
    function onIncoming(items) {
        const ext = B.breathIncoming(items), changed = JSON.stringify(ext) !== JSON.stringify(state.ext);
        if (changed) { state.ext = ext; save(); }
        const got = PHONE ? 0 : takeRaw(R.rawIncoming(items));
        return changed || got > 0;
    }
    // 폰 화면의 동의 칸
    function renderRawConsent() {
        const box = $('raw-consent-box');
        if (!box) return;
        box.hidden = !(PHONE && CLASS);
        if (box.hidden) return;
        $('raw-consent').checked = rawOn();
        $('raw-consent-st').innerHTML = rawOn()
            ? '🔓 보내는 원본이 <b>선생님 화면에도</b> 보여요(선생님이 원본으로 다시 분석할 수 있어요). 언제든 체크를 끄면 이미 보낸 원본도 선생님 쪽에서 빼요.'
            : (pairOk ? '🔒 체크하지 않으면 원본은 <b>이 폰과 QR 을 찍은 노트북만</b> 읽는 곳으로 가요. 노트북에서 분석은 그대로 돼요.'
                : '⚠ 체크하지 않으면 보낼 수 없어요: 이 QR 은 예전 것이라 짝 노트북 자리가 없어요. 노트북 화면의 새 QR 을 찍으세요.');
    }
    if ($('raw-consent')) $('raw-consent').addEventListener('change', async e => {
        state.rawOk[CLASS] = e.target.checked; save(); renderRawConsent();
        if (!e.target.checked) {
            const n = (state.classSent[CLASS] || []).length;
            if (n) { $('raw-consent-st').innerHTML += '<br>⏳ 선생님 쪽에서 이미 보낸 원본 ' + n + '개를 빼는 중…'; const r = await clearClass(); renderRawConsent(); $('raw-consent-st').innerHTML += r.ok ? '<br>✅ 이미 보낸 원본을 선생님 쪽에서 뺐어요. 짝 노트북에 다시 보내려면 회차를 골라 📤 다시 보내세요.' : '<br>⚠ 빼지 못했어요: ' + esc(r.error || '') + ' — 다시 체크했다 끄거나 선생님께 말씀하세요.'; }
        }
    });

    // ---------- 조 공유 · 수업 참여 (동의한 회차만, exp heartrate 의 kind 'breath') ----------
    let share = null;
    if (window.ClassShare) {
        try {
            share = ClassShare.init({
                exp: 'heartrate', barMount: '#class-bar-mount', shareMount: '#br-share-mount',
                csvHint: '🗂 숨 참기 CSV',
                sendButtons: ['#br-send'],
                store: { load: () => state.share, save: o => { state.share = o; save(); } },
                // 폰: 잰 원본(한 번 재기 + 숨 참기)을 kind 'raw' 로 / 노트북: 동의한 숨 참기 결과를 kind 'breath' 로
                getItems: () => (PHONE ? myRawItems() : B.breathItems(state.runs)),
                onIncoming,
                send: PHONE && PCF ? phoneSend : undefined,
                pull: !PHONE && CLASS && PCF ? laptopPull : undefined,
                getStep: () => state.mode,
                getPoints: () => (PHONE ? phoneRawRuns().length : state.runs.length),
                // 수업이면 폰 QR 에 짝 공간(pp=)을 넣음 — 원본 동의를 안 한 폰도 이 노트북으로는 보낼 수 있게
                phone: !PHONE && CLASS && pairOk ? { page: 'projects/heart-rate.html?pp=' + PAIR } : true,
                onRole: role => { document.body.classList.toggle('hr-phone', role === 'phone'); },
                onPhoneData: n => { phoneNote(n); },
                deleteItem: id => {
                    if (/^b\d+$/.test(String(id))) { state.phoneRuns = state.phoneRuns.filter(r => r.id !== id); save(); }
                    else core.deleteRun(String(id));
                }
            });
        } catch (e) { share = null; }
    }
    renderRawConsent();
    $('br-send').addEventListener('click', () => {
        if (!state.runs.some(r => r.consent)) { $('br-send-st').textContent = "'수업 분석 동의'를 체크한 회차가 없어 보내지 않아요."; return; }
        if (!share) { $('br-send-st').textContent = '조 공유를 불러오지 못했어요. CSV 로 내세요.'; return; }
        if (!share.group()) { $('br-send-st').textContent = "먼저 아래 '👥 조 공유'에서 조 코드를 정하세요 (수업 QR 로 들어왔으면 저절로)."; return; }
        share.send('#br-send-st');
    });

    // ---------- 기기 종류: 💻 노트북·PC 는 분석만, 📱 폰·태블릿은 측정 (폰 측정 · 노트북 분석 이원화, AGENTS.md UI 규칙) ----------
    //  폰 역할(?role=phone)이면 기기 추측과 상관없이 측정 화면. 노트북이면 측정 부분(.hr-measure)을 숨기고 '📱 폰으로 측정해 보내기' 카드
    function applyDevice() {
        const kind = window.LabUI && LabUI.device ? LabUI.device().kind : 'phone';
        const laptop = !PHONE && kind === 'laptop';
        document.body.classList.toggle('hr-laptop', laptop);
        if (laptop && share && share.phoneCard && !applyDevice.card) { applyDevice.card = true; share.phoneCard('#phone-card'); }
    }
    if (!PHONE && window.LabUI && LabUI.deviceSwitch) LabUI.deviceSwitch('#dev-switch');
    window.addEventListener('lab-device', applyDevice);
    applyDevice();

    setMode(state.mode);
    // 시험용
    window.__breath = { state: () => state, scale: SCALE };
})();
