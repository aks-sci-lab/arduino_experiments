// 말루스 법칙 실험 — 접해보기 탭: 측정 전에 학생이 정하는 것(예측, 측정 계획, 이상한 값 판단 기준)
// 다른 스크립트는 window.MalusTutorial.get() 으로 내용을 읽고, onStart / onChange 로 변화를 받는다.
(function () {
    'use strict';
    const M = window.MalusMath;
    const $ = id => document.getElementById(id);
    const STORE_KEY = 'malus-law-explore-v1';
    const N = 37;                       // 예측 그래프: 0°~180° 를 5° 간격으로 37칸
    const listeners = { start: [], change: [] };

    const data = {
        hyp: null,
        sketch: new Array(N).fill(null),   // 칸마다 0(어두움)~1(밝음), 그리지 않은 칸은 null
        hypReason: '',
        plan: { start: 0, end: 180, step: 15, custom: '', repeats: 1, dark: 'measure', reason: '' },
        crit: { move: true, sat: false, repeat: false, repeatPct: 10, note: '' },
        startedAt: null
    };

    // ---------- 저장 ----------
    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* 저장소를 쓸 수 없어도 동작에는 영향 없음 */ }
    }
    function load() {
        try {
            const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (!d) return;
            data.hyp = d.hyp || null;
            if (Array.isArray(d.sketch) && d.sketch.length === N) data.sketch = d.sketch;
            data.hypReason = d.hypReason || '';
            Object.assign(data.plan, d.plan || {});
            Object.assign(data.crit, d.crit || {});
            data.startedAt = d.startedAt || null;
        } catch (e) { /* 무시 */ }
    }

    // 화면 → data
    function readForm() {
        const hyp = document.querySelector('input[name=hyp]:checked');
        data.hyp = hyp ? hyp.value : null;
        data.hypReason = $('hyp-reason').value;
        const num = (id, def) => { const v = parseFloat($(id).value); return isFinite(v) ? v : def; };
        data.plan.start = num('plan-start', 0);
        data.plan.end = num('plan-end', 180);
        data.plan.step = num('plan-step', 15);
        data.plan.custom = $('plan-custom').value;
        data.plan.repeats = Math.max(1, Math.min(10, Math.round(num('plan-repeats', 1))));
        const dark = document.querySelector('input[name=plan-dark]:checked');
        data.plan.dark = dark ? dark.value : 'measure';
        data.plan.reason = $('plan-reason').value;
        data.crit.move = $('crit-move').checked;
        data.crit.sat = $('crit-sat').checked;
        data.crit.repeat = $('crit-repeat').checked;
        data.crit.repeatPct = Math.max(1, Math.min(100, num('crit-pct', 10)));
        data.crit.note = $('crit-note').value;
    }

    // data → 화면
    function writeForm() {
        document.querySelectorAll('input[name=hyp]').forEach(r => { r.checked = r.value === data.hyp; });
        $('hyp-reason').value = data.hypReason;
        $('plan-start').value = data.plan.start;
        $('plan-end').value = data.plan.end;
        $('plan-step').value = data.plan.step;
        $('plan-custom').value = data.plan.custom;
        $('plan-repeats').value = data.plan.repeats;
        document.querySelectorAll('input[name=plan-dark]').forEach(r => { r.checked = r.value === data.plan.dark; });
        $('plan-reason').value = data.plan.reason;
        $('crit-move').checked = data.crit.move;
        $('crit-sat').checked = data.crit.sat;
        $('crit-repeat').checked = data.crit.repeat;
        $('crit-pct').value = data.crit.repeatPct;
        $('crit-note').value = data.crit.note;
    }

    function changed() {
        readForm();
        save();
        renderPreview();
        listeners.change.forEach(cb => cb(api.get()));
    }

    // ---------- 측정 계획 미리보기 ----------
    function renderPreview() {
        const angles = M.planAngles(data.plan);
        const el = $('plan-preview');
        if (!angles.length) { el.textContent = '⚠️ 각도를 만들 수 없습니다. 시작·끝·간격을 확인하세요.'; return; }
        const total = angles.length * data.plan.repeats;
        // 한 번 기록에 대기 2초 + 측정 1초 + 편광판 돌리기 약 5초로 어림한다
        const min = Math.ceil(total * 8 / 60);
        const shown = angles.slice(0, 24).join('°, ') + '°' + (angles.length > 24 ? ' …' : '');
        let tip = '';
        if (angles.length < 5) tip = '<br>💡 모델을 비교하려면 서로 다른 각도가 많을수록 좋습니다.';
        else if (Math.max(...angles) - Math.min(...angles) < 90) tip = '<br>💡 밝은 곳부터 가장 어두운 곳까지 보려면 90° 이상 돌려 보세요.';
        el.innerHTML = '각도 <b>' + angles.length + '개</b> × ' + data.plan.repeats + '번 = 측정 <b>' + total + '번</b> (약 ' + min + '분)<br>' + shown + tip;
    }

    // ---------- 예측 그래프 ----------
    const cv = $('sketch');
    const PAD = { L: 34, R: 10, T: 10, B: 24 };
    let drawing = false, lastIdx = null;

    function plotBox() {
        const W = cv.clientWidth || 600, H = cv.clientHeight || 200;
        return { W, H, x0: PAD.L, x1: W - PAD.R, y0: PAD.T, y1: H - PAD.B };
    }

    function redraw() {
        const dpr = window.devicePixelRatio || 1;
        const b = plotBox();
        cv.width = b.W * dpr; cv.height = b.H * dpr;
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, b.W, b.H);
        g.font = '11px sans-serif'; g.fillStyle = '#777'; g.strokeStyle = '#eee'; g.lineWidth = 1;
        g.textAlign = 'center';
        for (let a = 0; a <= 180; a += 30) {
            const x = b.x0 + a / 180 * (b.x1 - b.x0);
            g.beginPath(); g.moveTo(x, b.y0); g.lineTo(x, b.y1); g.stroke();
            g.fillText(a + '°', x, b.H - 8);
        }
        g.textAlign = 'right';
        g.fillText('밝음', b.x0 - 4, b.y0 + 8);
        g.fillText('0', b.x0 - 4, b.y1);
        g.strokeStyle = '#bbb'; g.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
        g.strokeStyle = '#7048e8'; g.lineWidth = 3; g.lineJoin = 'round';
        g.beginPath();
        let pen = false;
        data.sketch.forEach((v, i) => {
            if (v == null) { pen = false; return; }
            const x = b.x0 + i / (N - 1) * (b.x1 - b.x0), y = b.y1 - v * (b.y1 - b.y0);
            if (pen) g.lineTo(x, y); else g.moveTo(x, y);
            pen = true;
        });
        g.stroke();
        const filled = data.sketch.filter(v => v != null).length;
        $('sketch-status').textContent = filled ? '' : '아직 그리지 않았습니다';
    }

    function penAt(ev) {
        const r = cv.getBoundingClientRect(), b = plotBox();
        const x = (ev.clientX - r.left) * b.W / r.width, y = (ev.clientY - r.top) * b.H / r.height;
        const idx = Math.max(0, Math.min(N - 1, Math.round((x - b.x0) / (b.x1 - b.x0) * (N - 1))));
        const val = Math.max(0, Math.min(1, (b.y1 - y) / (b.y1 - b.y0)));
        // 손가락을 빨리 움직여 건너뛴 칸은 직선으로 채운다
        if (lastIdx != null && lastIdx !== idx) {
            const from = data.sketch[lastIdx], step = idx > lastIdx ? 1 : -1;
            for (let i = lastIdx + step; i !== idx; i += step) {
                data.sketch[i] = from + (val - from) * (i - lastIdx) / (idx - lastIdx);
            }
        }
        data.sketch[idx] = val;
        lastIdx = idx;
        redraw();
    }
    cv.addEventListener('pointerdown', e => { drawing = true; lastIdx = null; cv.setPointerCapture(e.pointerId); penAt(e); });
    cv.addEventListener('pointermove', e => { if (drawing) penAt(e); });
    const endPen = () => { if (drawing) { drawing = false; lastIdx = null; save(); listeners.change.forEach(cb => cb(api.get())); } };
    cv.addEventListener('pointerup', endPen);
    cv.addEventListener('pointercancel', endPen);
    $('btn-sketch-clear').onclick = () => { data.sketch = new Array(N).fill(null); save(); redraw(); listeners.change.forEach(cb => cb(api.get())); };

    // ---------- 측정 시작 ----------
    $('btn-plan-start').onclick = () => {
        readForm();
        const angles = M.planAngles(data.plan);
        if (angles.length < 3) { $('plan-msg').textContent = '⚠️ 서로 다른 각도가 3개 이상 필요합니다.'; return; }
        const noPred = !data.hyp && !data.sketch.some(v => v != null);
        if (noPred && !confirm('아직 예측을 하지 않았습니다. 예측 없이 측정을 시작할까요?')) return;
        data.startedAt = new Date().toISOString();
        save();
        $('plan-msg').textContent = '';
        listeners.start.forEach(cb => cb(api.get()));
    };

    document.querySelectorAll('[data-panel=explore] input, [data-panel=explore] textarea').forEach(el => {
        el.addEventListener('input', changed);
        el.addEventListener('change', changed);
    });
    window.addEventListener('resize', redraw);

    const api = {
        get() {
            return JSON.parse(JSON.stringify(Object.assign({}, data, { angles: M.planAngles(data.plan) })));
        },
        onStart(cb) { listeners.start.push(cb); },
        onChange(cb) { listeners.change.push(cb); },
        redraw,
        HYP_LABELS: { linear: '각도에 비례해 감소', cos: 'cos θ 모양', cos2: 'cos²θ 모양', other: '모르겠음 / 다른 모양' }
    };
    window.MalusTutorial = api;

    load();
    writeForm();
    renderPreview();
    redraw();
})();
