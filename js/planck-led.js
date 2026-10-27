// LED 플랑크 상수 실험: 색이 다른 LED 의 문턱 전압을 멀티미터로 재고 최소제곱법으로 h 를 구한다.
(function () {
    'use strict';
    const P = window.PlanckMath;
    const $ = id => document.getElementById(id);
    const STORE_KEY = 'planck-led-v1';

    const state = {
        leds: [],              // [{ id, key, name, lambda, on, fit, iv: [{v, i}], glow: [v] }]
        method: 'current',     // 'current' (전류가 흐르기 시작) | 'glow' (빛이 나기 시작)
        curMode: 'extrapolate',// 'extrapolate' (직선 연장) | 'current' (기준 전류)
        iMin: 1, iRef: 0.1,    // mA
        origin: false,
        sel: null,             // 측정 중인 LED id
        pot: '10000', rs: '330', rsCustom: '',
        iMode: 'resistor',     // 전류 재는 법: 'resistor' (고정 저항 전압 ÷ 저항) | 'meter' (전류계)
        rMeas: '', vrUnit: 'V', // 고정 저항 실제 값 (비우면 회로 탭 값), 저항 전압 단위
        bat: '4.5', batReal: '', iMax: '10',
        tab: 'purpose',        // 보고 있는 탭
        draft: { v: '', i: '', vr: '', gv: '' } // 기록 버튼을 누르기 전 입력 칸 값 (새로고침해도 남도록)
    };

    function defaultLeds() {
        return P.LED_PRESETS.map(p => ({ id: p.key, key: p.key, name: p.name, lambda: p.lambda, on: p.on, fit: true, iv: [], glow: [] }));
    }

    // ---------- 저장 ----------
    // 사생활 보호 모드 등으로 저장할 수 없으면 알림을 띄운다 (측정은 계속 할 수 있음)
    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); $('store-warn').hidden = true; }
        catch (e) { $('store-warn').hidden = false; }
    }
    function load() {
        let d = null;
        try { d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { d = null; }
        if (d && Array.isArray(d.leds) && d.leds.length) {
            Object.assign(state, d);
            if (state.pot !== '1000') state.pot = '10000';
            state.origin = false;   // 원점 통과 직선은 결론·분석 탭에서 따로 보여 준다
            // 예전 탭 이름 → 보고서 순서 탭 이름
            state.tab = { setup: 'procedure', leds: 'materials', measure: 'data' }[state.tab] || state.tab;
            if (state.rs == null) state.rs = '330';
            if (state.rsCustom == null) state.rsCustom = '';
            state.draft = Object.assign({ v: '', i: '', vr: '', gv: '' }, d.draft);
            if (state.iMode !== 'meter') state.iMode = 'resistor';
            if (state.vrUnit !== 'mV') state.vrUnit = 'V';
            if (state.rMeas == null) state.rMeas = '';
            state.leds.forEach(l => { l.iv = Array.isArray(l.iv) ? l.iv : []; l.glow = Array.isArray(l.glow) ? l.glow : []; if (l.fit == null) l.fit = true; });
        } else {
            state.leds = defaultLeds();
        }
    }

    // ---------- 도우미 ----------
    const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fx = (v, d) => v == null || !isFinite(v) ? '–' : v.toFixed(d);
    const usedLeds = () => state.leds.filter(l => l.on);
    const current = () => state.leds.find(l => l.id === state.sel) || null;
    const methodKey = m => (m || state.method) === 'glow' ? 'glow' : state.curMode;
    const thr = (led, m) => P.thresholdOf(led, methodKey(m), { iMin: state.iMin, iRef: state.iRef });
    const color = led => P.wavelengthColor(led.lambda);
    const methodName = m => m === 'glow' ? '빛 기준' : (state.curMode === 'current' ? '전류 기준(기준 전류)' : '전류 기준');

    // 순방향 전압 추정 (가변저항 안전 한계 계산용): 미리 넣은 LED 는 표의 값, 직접 추가한 LED 는 파장으로 짐작
    function vfOf(led) {
        const p = P.LED_PRESETS.find(q => q.key === led.key);
        if (p && Math.abs(p.lambda - led.lambda) < 40) return p.vf;
        if (led.lambda > 700) return 1.3;
        if (led.lambda >= 560) return 2.1;
        return led.lambda < 420 ? 3.3 : 3.1;
    }

    // ---------- 1. 회로 설정 계산 ----------
    function batteryVolt() {
        const real = num(state.batReal);
        return real && real > 0 ? real : parseFloat(state.bat);
    }
    const ohm = r => r >= 1000 ? Number((r / 1000).toFixed(2)) + ' kΩ' : Math.round(r) + ' Ω';
    // LED 앞 고정 저항 (Ω, 없으면 0)
    function seriesOhm() {
        if (state.rs === 'custom') { const v = num(state.rsCustom); return v && v > 0 ? v : 0; }
        return parseFloat(state.rs) || 0;
    }
    function renderSetup() {
        const vb = batteryVolt(), iMax = parseFloat(state.iMax), rPot = parseFloat(state.pot), rs = seriesOhm();
        const leds = usedLeds().length ? usedLeds() : state.leds;
        const vfs = leds.map(vfOf);
        const vfLow = Math.min(...vfs), vfHigh = Math.max(...vfs);
        const g = P.potGuide(vb, rPot, iMax, vfs, rs);
        const pct = x => Math.round(x * 100) + ' %';
        // 회로도: 가변저항 사각형은 y = 55 (+ 쪽 끝) ~ 165 (− 쪽 끝). 끝까지 안전하면 안전 한계 선을 숨긴다
        const yLim = 165 - 110 * g.xMax;
        $('svg-limit').setAttribute('y1', yLim); $('svg-limit').setAttribute('y2', yLim);
        $('svg-limit-txt').setAttribute('y', Math.max(72, yLim + 4));
        $('svg-limit').style.display = $('svg-limit-txt').style.display = g.safeToEnd ? 'none' : '';
        $('svg-rs').setAttribute('stroke', rs ? '#333' : '#999');
        $('svg-rs').setAttribute('stroke-dasharray', rs ? '' : '4 3');
        $('svg-rs-txt').textContent = rs ? '고정 저항 ' + ohm(rs) : '(선택) 고정 저항';
        document.querySelectorAll('.bb-rs').forEach(e => { e.textContent = rs ? ohm(rs) : '점퍼선'; });
        $('svg-bat').textContent = '건전지 ' + vb.toFixed(1) + ' V';
        $('svg-pot').textContent = ohm(rPot);
        $('row-rs-custom').hidden = state.rs !== 'custom';
        document.querySelectorAll('.imax-txt').forEach(e => { e.textContent = iMax; });
        document.querySelectorAll('.r-limit').forEach(e => { e.textContent = '약 ' + ohm(g.rLower); });
        document.querySelectorAll('.series-r').forEach(e => { e.textContent = g.seriesR + ' Ω'; });
        document.querySelectorAll('.pot-range').forEach(e => { e.textContent = rPot > 2000 ? '20 kΩ' : '2 kΩ'; });
        document.querySelectorAll('.need-limit').forEach(e => { e.hidden = g.safeToEnd; });
        const limitLine = g.safeToEnd
            ? '✅ <b>손잡이를 끝까지 돌려도 안전</b>: 고정 저항 ' + ohm(rs) + ' 덕분에 최대 약 <b>' + g.endLow.toFixed(1) + ' mA</b> (순방향 전압이 낮은 LED, 약 ' + vfLow.toFixed(1) + ' V). 안전 한계 표시는 필요 없습니다<br>'
            : '🛑 <b>안전 한계</b>: 가운데 다리 ~ − 쪽 다리 저항 <b class="big">' + ohm(g.rLower) + '</b> (손잡이 약 ' + pct(g.xMax) + ' 위치)' +
              ' <span class="note">— 이보다 더 돌리면 순방향 전압이 낮은 LED(약 ' + vfLow.toFixed(1) + ' V)에 ' + iMax + ' mA 넘게 흐릅니다' +
              (rs ? '' : '. 고정 저항(' + g.seriesR + ' Ω 이상)을 넣으면 끝까지 돌려도 안전합니다') + '</span><br>';
        $('setup-out').innerHTML =
            '🔧 <b>' + ohm(rPot) + ' 가변저항</b>: 양 끝 다리 → 건전지 +, −  /  가운데 다리 → 전류계 → ' + (rs ? '고정 저항 ' + ohm(rs) + ' → ' : '') + 'LED<br>' +
            '▶️ 시작: 손잡이를 <b>− 쪽 끝</b>까지 (가운데 다리 ~ − 쪽 다리 0 Ω, LED 전압 0 V)<br>' +
            limitLine +
            '💡 LED 가 켜지기 시작하는 위치: 손잡이 약 ' + pct(g.xOnLow * 0.85) + ' ~ ' + pct(Math.min(1, g.xOnHigh * 0.95)) + ' 부근 (색마다 다름)<br>' +
            '🔵 ' + (g.safeToEnd ? '끝까지 돌렸을 때' : '안전 한계에서') + ' 순방향 전압이 높은 LED(파랑 등, 약 ' + vfHigh.toFixed(1) + ' V) 전류: 약 <b>' + g.iHighAtLimit.toFixed(1) + ' mA</b><br>' +
            '🔋 가변저항에 늘 흐르는 전류: 약 ' + g.drainMa.toFixed(2) + ' mA';
        const warns = [];
        if (g.iHighAtLimit < 2) warns.push(rs > g.seriesR * 1.3
            ? '⚠️ 고정 저항(' + ohm(rs) + ')이 커서 순방향 전압이 높은 LED(파랑·초록·보라)에 전류가 충분히 흐르지 않습니다. ' + g.seriesR + '~' + Math.round(g.seriesR * 1.3 / 10) * 10 + ' Ω 정도로 바꾸세요.'
            : '⚠️ 건전지 전압이 낮아 순방향 전압이 높은 LED(파랑·초록·보라, 약 ' + vfHigh.toFixed(1) + ' V)에 전류가 충분히 흐르지 않습니다. <b>4.5 V (건전지 3개)</b> 이상을 쓰세요.');
        if (g.xMax < 0.7) warns.push('⚠️ 안전 한계가 손잡이 ' + pct(g.xMax) + ' 로 낮아 조절할 수 있는 범위가 좁습니다. 고정 저항을 넣거나, 건전지 전압을 낮추거나, 10 kΩ 가변저항을 쓰세요.');
        if (g.drainMa > 5) warns.push('ℹ️ 가변저항에 늘 ' + g.drainMa.toFixed(1) + ' mA 가 흘러 건전지가 빨리 닳습니다. 측정하지 않을 때는 건전지를 빼 두세요.');
        $('setup-warn').innerHTML = warns.join('<br>');
        $('setup-warn').hidden = !warns.length;
    }

    // ---------- 2. LED 목록 ----------
    function renderLeds() {
        $('led-body').innerHTML = state.leds.map(l =>
            '<tr data-id="' + esc(l.id) + '">' +
            '<td><input type="checkbox" data-k="on"' + (l.on ? ' checked' : '') + '></td>' +
            '<td><span class="dot" style="background:' + color(l) + '"></span><input type="text" data-k="name" value="' + esc(l.name) + '"></td>' +
            '<td><input type="number" data-k="lambda" min="200" max="1100" step="1" inputmode="numeric" value="' + l.lambda + '"></td>' +
            '<td><button class="secondary" data-del="1" title="이 LED 와 측정값 삭제">삭제</button></td></tr>').join('');
    }
    // 글자를 치는 동안에도 저장 (다시 그리면 입력 칸 포커스가 사라지므로 저장만 한다)
    $('led-body').addEventListener('input', e => {
        const tr = e.target.closest('tr'); if (!tr) return;
        const led = state.leds.find(l => l.id === tr.dataset.id); if (!led) return;
        const k = e.target.dataset.k;
        if (k === 'name' && e.target.value.trim()) led.name = e.target.value.trim();
        else if (k === 'lambda') { const v = num(e.target.value); if (v && v >= 200 && v <= 1100) led.lambda = v; else return; }
        else return;
        save();
    });
    $('led-body').addEventListener('change', e => {
        const tr = e.target.closest('tr'); if (!tr) return;
        const led = state.leds.find(l => l.id === tr.dataset.id); if (!led) return;
        const k = e.target.dataset.k;
        if (k === 'on') led.on = e.target.checked;
        else if (k === 'name') led.name = e.target.value.trim() || led.name;
        else if (k === 'lambda') {
            const v = num(e.target.value);
            if (v && v >= 200 && v <= 1100) led.lambda = v; else e.target.value = led.lambda;
        }
        save(); renderAll();
    });
    $('led-body').addEventListener('click', e => {
        if (!e.target.dataset.del) return;
        const tr = e.target.closest('tr');
        const led = state.leds.find(l => l.id === tr.dataset.id); if (!led) return;
        const n = led.iv.length + led.glow.length;
        if (n && !confirm(led.name + ' LED 의 측정값 ' + n + '개도 함께 지워집니다. 삭제할까요?')) return;
        state.leds = state.leds.filter(l => l !== led);
        save(); renderAll();
    });
    $('btn-add-led').addEventListener('click', () => {
        const id = 'led' + Date.now().toString(36);
        state.leds.push({ id, key: null, name: 'LED ' + (state.leds.length + 1), lambda: 560, on: true, fit: true, iv: [], glow: [] });
        state.sel = id;
        save(); renderAll();
    });

    // ---------- 3. 측정 ----------
    function renderMeasure() {
        const used = usedLeds();
        if (!used.some(l => l.id === state.sel)) state.sel = used.length ? used[0].id : null;
        $('sel-led').innerHTML = used.map(l => {
            const n = state.method === 'glow' ? l.glow.length : l.iv.length;
            return '<option value="' + esc(l.id) + '"' + (l.id === state.sel ? ' selected' : '') + '>' + esc(l.name) + ' (' + l.lambda + ' nm)' + (n ? ' · ' + n + '개' : '') + '</option>';
        }).join('');
        document.querySelectorAll('input[name=method]').forEach(r => { r.checked = r.value === state.method; });
        const glow = state.method === 'glow';
        $('box-current').hidden = glow;
        $('box-glow').hidden = !glow;
        $('sel-curmode').value = state.curMode;
        $('row-imin').hidden = state.curMode !== 'extrapolate';
        $('row-iref').hidden = state.curMode !== 'current';
        $('i-min').value = state.iMin;
        $('i-ref').value = state.iRef;
        const byR = state.iMode === 'resistor';
        $('sel-imode').value = state.iMode;
        $('row-rmeas').hidden = !byR;
        $('lbl-vr').hidden = !byR;
        $('lbl-i').hidden = byR;
        $('r-meas').placeholder = seriesOhm() ? String(seriesOhm()) : '예: 330';
        $('sel-vr-unit').value = state.vrUnit;
        showCalc();

        const led = current();
        $('led-lambda').innerHTML = led ? '<span class="dot" style="background:' + color(led) + '"></span>광자 에너지 hc/λ = ' + P.photonVolt(led.lambda).toFixed(2) + ' eV' : '';
        ['in-v', 'in-i', 'in-vr', 'btn-add-iv', 'in-gv', 'btn-add-glow', 'btn-clear-led'].forEach(id => { $(id).disabled = !led; });
        if (!led) {
            $('thr-out').textContent = '3. 실험 준비물 탭에서 사용할 LED 를 하나 이상 고르세요.';
            $('meas-head').innerHTML = ''; $('meas-body').innerHTML = '';
            drawIV(null, null);
            return;
        }

        const t = thr(led);
        if (t.error) $('thr-out').innerHTML = '<b>' + esc(led.name) + '</b> 문턱 전압: <span class="note">' + esc(t.error) + '</span>';
        else {
            let extra = '';
            if (glow) extra = ' (평균, ' + t.n + '회' + (t.n > 1 ? ', 표준편차 ' + t.sd.toFixed(3) + ' V' : '') + ')';
            else if (state.curMode === 'extrapolate') extra = ' (직선 연장, 점 ' + t.used + '개, 직선 기울기 ' + t.slope.toFixed(1) + ' mA/V)';
            else extra = ' (' + state.iRef + ' mA 에 이르는 전압)';
            $('thr-out').innerHTML = '<b>' + esc(led.name) + '</b> 문턱 전압 V₀ = <b>' + t.v0.toFixed(3) + ' V</b>' + '<span class="note">' + extra + '</span>';
        }

        if (glow) {
            $('meas-head').innerHTML = '<tr><th>회</th><th>빛이 보인 V<sub>LED</sub> (V)</th><th></th></tr>';
            $('meas-body').innerHTML = led.glow.map((v, k) =>
                '<tr><td>' + (k + 1) + '</td><td>' + v.toFixed(3) + '</td><td><button class="secondary" data-del-glow="' + k + '">삭제</button></td></tr>').join('');
        } else {
            const hasVr = led.iv.some(p => p.vr != null);
            $('meas-head').innerHTML = '<tr><th>번호</th><th>V<sub>LED</sub> (V)</th>' + (hasVr ? '<th>V<sub>R</sub> (mV)</th>' : '') + '<th>전류 I (mA)</th><th></th></tr>';
            // 기록 순서와 상관없이 전압 순으로 보여 준다
            const rows = led.iv.map((p, k) => ({ p, k })).sort((a, b) => a.p.v - b.p.v);
            const usedMark = state.curMode === 'extrapolate' ? (p => p.i >= state.iMin) : (() => false);
            $('meas-body').innerHTML = rows.map(({ p, k }, n) =>
                '<tr><td>' + (n + 1) + (usedMark(p) ? ' ●' : '') + '</td><td>' + p.v.toFixed(3) + '</td>' + (hasVr ? '<td>' + (p.vr != null ? (p.vr * 1000).toFixed(2) : '–') + '</td>' : '') + '<td>' + p.i.toFixed(4) + '</td><td><button class="secondary" data-del-iv="' + k + '">삭제</button></td></tr>').join('');
        }
        $('chart-iv').hidden = glow;
        $('iv-note').hidden = glow;
        drawIV(glow ? null : led, t);
    }

    // 고정 저항 값 (Ω): 측정 탭에 잰 값이 있으면 그것, 없으면 회로 탭에서 고른 값
    function rUsed() {
        const r = num(state.rMeas);
        return r && r > 0 ? r : seriesOhm();
    }
    // 입력한 저항 전압 (V 단위로)
    function vrInput() {
        const x = num($('in-vr').value);
        return x == null ? null : (state.vrUnit === 'mV' ? x / 1000 : x);
    }
    // 저항 전압을 넣는 동안 계산된 전류를 바로 보여 준다
    function showCalc() {
        const out = $('i-calc');
        if (state.iMode !== 'resistor') { out.textContent = ''; return; }
        const r = rUsed(), vr = vrInput();
        if (!r) out.innerHTML = '⚠️ 고정 저항 값을 넣으세요. 회로 탭에서 고정 저항을 "없음"으로 골랐다면 저항을 넣거나 "전류계로 직접"을 고르세요.';
        else if (vr == null) out.textContent = 'I = V_R ÷ ' + r + ' Ω 로 계산합니다.';
        else out.innerHTML = '→ 전류 I = ' + vr.toFixed(4) + ' V ÷ ' + r + ' Ω = <b>' + (vr / r * 1000).toFixed(4) + ' mA</b>';
    }

    function addIV() {
        const led = current(); if (!led) return;
        const v = num($('in-v').value);
        let i, rec;
        if (state.iMode === 'resistor') {
            const r = rUsed(), vr = vrInput();
            if (!r) { alert('고정 저항 값(Ω)을 넣으세요.'); return; }
            if (v == null || vr == null || v < 0 || vr < 0) { alert('LED 전압과 저항 전압을 모두 0 이상의 숫자로 넣으세요.'); return; }
            i = vr / r * 1000;
            rec = { v, i, vr, r };
        } else {
            i = num($('in-i').value);
            if (v == null || i == null || v < 0 || i < 0) { alert('전압(V)과 전류(mA)를 모두 0 이상의 숫자로 넣으세요.'); return; }
            rec = { v, i };
        }
        led.iv.push(rec);
        const warns = [];
        if (i > parseFloat(state.iMax)) warns.push('⚠️ 전류가 ' + state.iMax + ' mA 를 넘었습니다. LED 가 뜨거워지면 문턱 전압이 바뀝니다. 전압을 더 올리지 마세요.');
        if (i > 30) warns.push('⚠️ 30 mA 이상은 LED 가 망가질 수 있습니다. 단위(mA, V/mV)를 확인하세요.');
        $('iv-warn').innerHTML = warns.join('<br>'); $('iv-warn').hidden = !warns.length;
        save(); renderAll();
        $('in-i').value = ''; $('in-vr').value = '';
        saveDraft(); showCalc();
        $('in-v').focus(); $('in-v').select();
    }
    function addGlow() {
        const led = current(); if (!led) return;
        const v = num($('in-gv').value);
        if (v == null || v <= 0) { alert('빛이 보인 전압(V)을 숫자로 넣으세요.'); return; }
        led.glow.push(v);
        $('in-gv').value = '';
        saveDraft();
        save(); renderAll();
        $('in-gv').focus();
    }
    $('btn-add-iv').addEventListener('click', addIV);
    $('btn-add-glow').addEventListener('click', addGlow);
    // Enter: 전압 → 전류 칸으로, 전류 칸에서 Enter 면 기록
    $('in-v').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $(state.iMode === 'resistor' ? 'in-vr' : 'in-i').focus(); } });
    $('in-i').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addIV(); } });
    $('in-vr').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addIV(); } });
    $('in-vr').addEventListener('input', showCalc);
    $('sel-imode').addEventListener('change', e => { state.iMode = e.target.value; save(); renderMeasure(); });
    $('sel-vr-unit').addEventListener('change', e => { state.vrUnit = e.target.value; save(); showCalc(); });
    $('r-meas').addEventListener('input', e => { state.rMeas = e.target.value; save(); showCalc(); });
    $('in-gv').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addGlow(); } });

    $('meas-body').addEventListener('click', e => {
        const led = current(); if (!led) return;
        if (e.target.dataset.delIv != null) led.iv.splice(+e.target.dataset.delIv, 1);
        else if (e.target.dataset.delGlow != null) led.glow.splice(+e.target.dataset.delGlow, 1);
        else return;
        save(); renderAll();
    });
    $('btn-clear-led').addEventListener('click', () => {
        const led = current(); if (!led) return;
        const glow = state.method === 'glow';
        if (!confirm(led.name + ' LED 의 ' + (glow ? '빛 기준' : '전류 기준(I–V)') + ' 기록을 지울까요?')) return;
        if (glow) led.glow = []; else led.iv = [];
        save(); renderAll();
    });
    $('sel-led').addEventListener('change', e => { state.sel = e.target.value; $('iv-warn').hidden = true; save(); renderAll(); });
    document.querySelectorAll('input[name=method]').forEach(r => r.addEventListener('change', () => { state.method = r.value; save(); renderAll(); }));
    $('sel-curmode').addEventListener('change', e => { state.curMode = e.target.value; save(); renderAll(); });
    $('i-min').addEventListener('change', e => { const v = num(e.target.value); if (v != null && v >= 0) state.iMin = v; save(); renderAll(); });
    $('i-ref').addEventListener('change', e => { const v = num(e.target.value); if (v != null && v > 0) state.iRef = v; save(); renderAll(); });

    // ---------- 4. 결과 ----------
    function analysis() {
        const rows = usedLeds().map(l => ({ led: l, t: thr(l), other: thr(l, state.method === 'glow' ? 'current' : 'glow') }));
        const items = rows.filter(r => r.led.fit && !r.t.error).map(r => ({ lambda: r.led.lambda, v0: r.t.v0, led: r.led }));
        const res = P.planckFit(items, { origin: state.origin });
        return { rows, items, res };
    }

    function sci(v, d) {
        if (v == null || !isFinite(v)) return '–';
        const exp = Math.floor(Math.log10(Math.abs(v)));
        return (v / Math.pow(10, exp)).toFixed(d) + ' × 10<sup>' + String(exp).replace('-', '−') + '</sup>';
    }

    function renderResults() {
        const { rows, items, res } = analysis();
        $('cmp-head').textContent = state.method === 'glow' ? '비교: 전류 기준' : '비교: 빛 기준';
        $('sum-body').innerHTML = rows.length ? rows.map(({ led, t, other }) =>
            '<tr data-id="' + esc(led.id) + '"><td><span class="dot" style="background:' + color(led) + '"></span>' + esc(led.name) + '</td>' +
            '<td>' + led.lambda + '</td><td>' + (P.freqOf(led.lambda) / 1e14).toFixed(3) + '</td>' +
            '<td><b>' + (t.error ? '–' : t.v0.toFixed(3)) + '</b></td><td>' + (other.error ? '–' : other.v0.toFixed(3)) + '</td>' +
            '<td>' + P.photonVolt(led.lambda).toFixed(3) + '</td>' +
            '<td><input type="checkbox" data-fit="1"' + (led.fit ? ' checked' : '') + (t.error ? ' disabled' : '') + '></td></tr>').join('')
            : '<tr><td colspan="7" class="note">사용할 LED 가 없습니다.</td></tr>';

        const verdict = $('verdict');
        if (!res) {
            $('results').innerHTML = '';
            verdict.hidden = false; verdict.className = 'warn';
            verdict.textContent = '문턱 전압을 구한 LED 가 ' + items.length + '개입니다. 파장이 다른 LED 2개 이상(3개 이상 추천)을 측정하면 플랑크 상수를 계산합니다. (현재 기준: ' + methodName(state.method) + ')';
            $('calc').innerHTML = '';
            drawPlanck(null, items);
            return;
        }
        const f = res.fit;
        $('results').innerHTML =
            '<div>플랑크 상수 h<b>' + sci(res.h, 3) + ' J·s</b></div>' +
            '<div>표준오차<b>' + (res.sH != null ? '± ' + sci(res.sH, 2) + ' J·s' : '– (점 3개 이상 필요)') + '</b></div>' +
            '<div>참값과 차이<b>' + (res.errorPct >= 0 ? '+' : '') + res.errorPct.toFixed(1) + ' %</b></div>' +
            '<div>기울기 h/e<b>' + sci(f.slope, 3) + ' V·s</b></div>' +
            (state.origin ? '' : '<div>절편<b>' + f.intercept.toFixed(3) + ' V</b></div>') +
            '<div>결정계수 R²<b>' + fx(f.r2, 4) + '</b></div>' +
            '<div>사용한 LED<b>' + f.n + '개</b></div>';
        const err = Math.abs(res.errorPct);
        verdict.hidden = false;
        verdict.className = err <= 10 ? 'ok' : 'warn';
        verdict.innerHTML = '기준: <b>' + methodName(state.method) + '</b>. 참값 h = 6.626 × 10<sup>−34</sup> J·s 와 ' +
            (err <= 10 ? '잘 맞습니다 (차이 ' + err.toFixed(1) + ' %).' : err <= 25 ? '조금 차이가 납니다 (차이 ' + err.toFixed(1) + ' %). 아래 \'결과가 참값과 다른 까닭\'을 살펴보세요.' : '차이가 큽니다 (차이 ' + err.toFixed(1) + ' %). 파장 값, LED 극성, 전압계 연결 위치(LED 다리에 바로), 단위(mA)를 확인하세요.');
        $('calc').innerHTML = calcHtml(res);
        drawPlanck(res, items);
    }
    $('sum-body').addEventListener('change', e => {
        if (!e.target.dataset.fit) return;
        const led = state.leds.find(l => l.id === e.target.closest('tr').dataset.id); if (!led) return;
        led.fit = e.target.checked;
        save(); renderResults();
    });

    // 최소제곱법 계산 과정 (x = f [10¹⁴ Hz], y = V₀ [V])
    function calcHtml(res) {
        const xs = res.points.map(p => p.f / 1e14), ys = res.points.map(p => p.v0);
        const n = xs.length;
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        const body = xs.map((x, i) => {
            sx += x; sy += ys[i]; sxx += x * x; sxy += x * ys[i];
            return '<tr><td>' + (i + 1) + '</td><td>' + x.toFixed(4) + '</td><td>' + ys[i].toFixed(4) + '</td><td>' + (x * x).toFixed(4) + '</td><td>' + (x * ys[i]).toFixed(4) + '</td></tr>';
        }).join('');
        let h = '<p>x = 진동수 f (단위 10<sup>14</sup> Hz), y = 문턱 전압 V₀ (V)</p>' +
            '<div class="tbl-wrap" style="max-height:none"><table><thead><tr><th>번호</th><th>x</th><th>y</th><th>x²</th><th>xy</th></tr></thead><tbody>' + body +
            '<tr><td><b>합 Σ</b></td><td><b>' + sx.toFixed(4) + '</b></td><td><b>' + sy.toFixed(4) + '</b></td><td><b>' + sxx.toFixed(4) + '</b></td><td><b>' + sxy.toFixed(4) + '</b></td></tr></tbody></table></div>';
        let a;
        if (state.origin) {
            a = sxy / sxx;
            h += '<p>원점을 지나는 직선 y = a·x 에서 오차 제곱의 합이 가장 작은 기울기:<br><code>a = Σxy ÷ Σx²</code> = ' + sxy.toFixed(4) + ' ÷ ' + sxx.toFixed(4) + ' = <b>' + a.toFixed(5) + '</b> V / (10<sup>14</sup> Hz)</p>';
        } else {
            const D = n * sxx - sx * sx;
            a = (n * sxy - sx * sy) / D;
            const b = (sy - a * sx) / n;
            h += '<p>직선 y = a·x + b 에서 오차 제곱의 합 Σ(y − a·x − b)² 이 가장 작은 a, b (n = ' + n + '):<br>' +
                '<code>a = (nΣxy − ΣxΣy) ÷ (nΣx² − (Σx)²)</code><br>= (' + n + '×' + sxy.toFixed(4) + ' − ' + sx.toFixed(4) + '×' + sy.toFixed(4) + ') ÷ (' + n + '×' + sxx.toFixed(4) + ' − ' + sx.toFixed(4) + '²)' +
                ' = <b>' + a.toFixed(5) + '</b> V / (10<sup>14</sup> Hz)<br>' +
                '<code>b = (Σy − aΣx) ÷ n</code> = <b>' + b.toFixed(4) + '</b> V</p>';
        }
        h += '<p>기울기 a 의 단위를 V·s 로 바꾸면 a × 10<sup>−14</sup> = ' + sci(a * 1e-14, 4) + ' V·s<br>' +
            '<code>h = e × a</code> = 1.602 × 10<sup>−19</sup> C × ' + sci(a * 1e-14, 4) + ' V·s = <b>' + sci(res.h, 3) + ' J·s</b></p>';
        return h;
    }

    // ---------- 그래프 (Canvas) ----------
    // o.pts: [{x, y, color, hollow}], o.lines: [{pts: [{x,y}], color, dash, width}], o.vlines: [{x, color}]
    function drawChart(cv, o) {
        const dpr = window.devicePixelRatio || 1;
        const W = cv.clientWidth || 600, H = cv.clientHeight || 280;
        cv.width = W * dpr; cv.height = H * dpr;
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        const L = 54, R = 12, T = 12, B = 40;
        const { xmin, xmax, ymin, ymax } = o;
        const X = x => L + (x - xmin) / (xmax - xmin) * (W - L - R);
        const Y = y => H - B - (y - ymin) / (ymax - ymin) * (H - T - B);
        g.font = '12px sans-serif'; g.fillStyle = '#555'; g.strokeStyle = '#e5e5e5'; g.lineWidth = 1;
        const ticks = (a, b, n) => { const out = []; for (let i = 0; i <= n; i++) out.push(a + (b - a) * i / n); return out; };
        g.textAlign = 'center';
        for (const t of ticks(xmin, xmax, 5)) {
            g.beginPath(); g.moveTo(X(t), T); g.lineTo(X(t), H - B); g.stroke();
            g.fillText(t.toFixed(o.xd != null ? o.xd : 2), X(t), H - B + 15);
        }
        g.textAlign = 'right';
        for (const t of ticks(ymin, ymax, 5)) {
            g.beginPath(); g.moveTo(L, Y(t)); g.lineTo(W - R, Y(t)); g.stroke();
            g.fillText(t.toFixed(o.yd != null ? o.yd : 2), L - 6, Y(t) + 4);
        }
        g.strokeStyle = '#999'; g.strokeRect(L, T, W - L - R, H - T - B);
        g.fillStyle = '#333'; g.textAlign = 'center';
        g.fillText(o.xl || '', L + (W - L - R) / 2, H - 6);
        g.save(); g.translate(13, T + (H - T - B) / 2); g.rotate(-Math.PI / 2); g.fillText(o.yl || '', 0, 0); g.restore();
        g.save(); g.beginPath(); g.rect(L, T, W - L - R, H - T - B); g.clip();
        for (const v of o.vlines || []) {
            g.setLineDash([4, 4]); g.strokeStyle = v.color || '#999'; g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(X(v.x), T); g.lineTo(X(v.x), H - B); g.stroke(); g.setLineDash([]);
        }
        for (const ln of o.lines || []) {
            g.setLineDash(ln.dash || []); g.strokeStyle = ln.color; g.lineWidth = ln.width || 2; g.beginPath();
            ln.pts.forEach((p, i) => i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))); g.stroke(); g.setLineDash([]);
        }
        for (const p of o.pts || []) {
            g.beginPath(); g.arc(X(p.x), Y(p.y), 5, 0, 2 * Math.PI);
            if (p.hollow) { g.strokeStyle = p.color; g.lineWidth = 1.5; g.stroke(); }
            else { g.fillStyle = p.color; g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke(); }
        }
        g.restore();
    }

    function drawIV(led, t) {
        const cv = $('chart-iv');
        if (!led) { drawChart(cv, { xmin: 0, xmax: 3.5, ymin: 0, ymax: 10, xl: '전압 V (V)', yl: '전류 I (mA)' }); return; }
        const pts = led.iv.filter(p => isFinite(p.v) && isFinite(p.i));
        const c = color(led);
        const vmax = Math.max(1, ...pts.map(p => p.v)), imax = Math.max(1, ...pts.map(p => p.i));
        const vmin = pts.length ? Math.max(0, Math.min(...pts.map(p => p.v)) - 0.1) : 0;
        const o = {
            xmin: vmin, xmax: vmax + 0.05 * (vmax - vmin + 0.1), ymin: 0, ymax: imax * 1.1,
            xl: '전압 V (V)', yl: '전류 I (mA)', yd: imax < 5 ? 2 : 1,
            pts: pts.map(p => ({ x: p.v, y: p.i, color: c, hollow: state.curMode === 'extrapolate' && p.i < state.iMin })),
            lines: [], vlines: []
        };
        if (t && !t.error) {
            o.vlines.push({ x: t.v0, color: '#333' });
            if (state.curMode === 'extrapolate') {
                const v2 = Math.max(...pts.map(p => p.v));
                o.lines.push({ pts: [{ x: t.v0, y: 0 }, { x: v2, y: t.slope * v2 + t.intercept }], color: '#333', dash: [6, 4], width: 1.5 });
            } else {
                o.lines.push({ pts: [{ x: o.xmin, y: state.iRef }, { x: o.xmax, y: state.iRef }], color: '#999', dash: [2, 3], width: 1 });
            }
        }
        drawChart(cv, o);
    }

    function drawPlanck(res, items) {
        const cv = $('chart-planck');
        const pts = items.map(it => ({ x: P.freqOf(it.lambda) / 1e14, y: it.v0, color: color(it.led) }));
        let xmin = 3, xmax = 8;
        if (pts.length) { xmin = Math.min(...pts.map(p => p.x)) - 0.3; xmax = Math.max(...pts.map(p => p.x)) + 0.3; }
        if (state.origin) xmin = 0;
        const theory = x => P.H_TRUE * x * 1e14 / P.E_CHARGE;
        const lines = [{ pts: [{ x: xmin, y: theory(xmin) }, { x: xmax, y: theory(xmax) }], color: '#aaa', dash: [6, 4], width: 1.5 }];
        if (res) {
            const fy = x => res.fit.slope * x * 1e14 + res.fit.intercept;
            lines.push({ pts: [{ x: xmin, y: fy(xmin) }, { x: xmax, y: fy(xmax) }], color: '#007bff', width: 2 });
        }
        const ys = pts.map(p => p.y).concat(lines.flatMap(l => l.pts.map(p => p.y)));
        let ymin = Math.min(...ys), ymax = Math.max(...ys);
        const pad = (ymax - ymin) * 0.08 || 0.5;
        ymin = state.origin ? Math.min(0, ymin) : ymin - pad; ymax += pad;
        drawChart(cv, { xmin, xmax, ymin, ymax, xd: 1, xl: '진동수 f (10¹⁴ Hz)', yl: '문턱 전압 V₀ (V)', pts, lines });
    }

    // ---------- 5. 내보내기 ----------
    function download(name, text, type) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + text], { type }));
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
    }
    $('btn-csv').addEventListener('click', () => {
        const rows = ['led,wavelength_nm,frequency_1e14Hz,method,voltage_V,current_mA,resistor_voltage_V,resistor_ohm'];
        const q = s => '"' + String(s).replace(/"/g, '""') + '"';
        for (const l of state.leds) {
            const f = (P.freqOf(l.lambda) / 1e14).toFixed(4);
            for (const p of l.iv) rows.push([q(l.name), l.lambda, f, 'current', p.v, p.i, p.vr != null ? p.vr : '', p.r != null ? p.r : ''].join(','));
            for (const v of l.glow) rows.push([q(l.name), l.lambda, f, 'glow', v, '', '', ''].join(','));
        }
        download('planck-led.csv', rows.join('\n'), 'text/csv');
    });
    $('btn-copy').addEventListener('click', async () => {
        const { rows, res } = analysis();
        const lines = [['LED', '파장(nm)', '진동수(1e14 Hz)', '문턱전압 V0 (V) [' + methodName(state.method) + ']', '계산에 사용'].join('\t')];
        for (const { led, t } of rows) lines.push([led.name, led.lambda, (P.freqOf(led.lambda) / 1e14).toFixed(4), t.error ? '' : t.v0.toFixed(4), led.fit ? 'O' : 'X'].join('\t'));
        if (res) {
            lines.push('');
            lines.push(['플랑크 상수 h (J·s)', res.h.toExponential(4)].join('\t'));
            if (res.sH != null) lines.push(['표준오차 (J·s)', res.sH.toExponential(2)].join('\t'));
            lines.push(['참값과 차이 (%)', res.errorPct.toFixed(2)].join('\t'));
            lines.push(['적합', state.origin ? '원점 통과' : '절편 있음'].join('\t'));
        }
        try {
            await navigator.clipboard.writeText(lines.join('\n'));
            $('copy-status').textContent = '복사했습니다. 시트에서 A1 을 선택하고 붙여넣기(Ctrl+V) 하세요.';
        } catch (e) {
            $('copy-status').textContent = '복사하지 못했습니다. CSV 다운로드를 이용하세요.';
        }
    });
    $('btn-clear-all').addEventListener('click', () => {
        if (!confirm('모든 LED 의 측정값을 지울까요? (LED 목록과 파장은 남습니다)')) return;
        state.leds.forEach(l => { l.iv = []; l.glow = []; });
        save(); renderAll();
    });

    // ---------- 1. 설정 이벤트 ----------
    $('sel-bat').addEventListener('change', e => { state.bat = e.target.value; state.batReal = ''; $('bat-real').value = ''; save(); renderSetup(); });
    $('bat-real').addEventListener('input', e => { state.batReal = e.target.value; save(); renderSetup(); });
    $('sel-imax').addEventListener('change', e => { state.iMax = e.target.value; save(); renderSetup(); });
    $('sel-pot').addEventListener('change', e => { state.pot = e.target.value; save(); renderSetup(); });
    $('sel-rs').addEventListener('change', e => { state.rs = e.target.value; save(); renderSetup(); });
    $('rs-custom').addEventListener('input', e => { state.rsCustom = e.target.value; save(); renderSetup(); });

    // ---------- 7. 결론 및 분석: 기준별 결과 요약 ----------
    function fitFor(m, origin) {
        const items = usedLeds().filter(l => l.fit)
            .map(l => ({ lambda: l.lambda, t: thr(l, m) }))
            .filter(x => !x.t.error)
            .map(x => ({ lambda: x.lambda, v0: x.t.v0 }));
        return { n: items.length, res: P.planckFit(items, { origin }) };
    }
    function renderConclusion() {
        const rows = [
            { name: '⚡ 전류 기준 (본 실험)', ...fitFor('current', false), slopeInfo: true },
            { name: '⚡ 전류 기준, 원점을 지나는 직선', ...fitFor('current', true) },
            { name: '💡 빛 기준 (비교 실험)', ...fitFor('glow', false), slopeInfo: true }
        ];
        const cell = r => {
            if (!r.res) return '<td colspan="4" class="note">' + (r.n ? 'LED ' + r.n + '개 — 2개 이상 필요' : '측정하지 않음') + '</td>';
            const err = Math.abs(r.res.errorPct);
            return '<td><b>' + (r.res.h / 1e-34).toFixed(2) + '</b></td><td>' + err.toFixed(1) + ' %</td>' +
                '<td>' + (r.res.fit.r2 != null ? r.res.fit.r2.toFixed(3) : '–') + '</td>' +
                '<td>' + (r.slopeInfo ? r.res.fit.intercept.toFixed(2) + ' V' : '0') + '</td>';
        };
        let html = '<div class="tbl-wrap" style="max-height:none"><table class="sum-table"><thead><tr><th>기준</th><th>h (×10⁻³⁴ J·s)</th><th>오차율</th><th>R²</th><th>절편</th></tr></thead><tbody>' +
            rows.map(r => '<tr><td>' + r.name + (r.res ? ' <span class="note">(LED ' + r.n + '개)</span>' : '') + '</td>' + cell(r) + '</tr>').join('') +
            '</tbody></table></div>';
        const [cur, , glow] = rows;
        const notes = [];
        if (cur.res && glow.res) {
            const better = Math.abs(cur.res.errorPct) <= Math.abs(glow.res.errorPct) ? '전류 기준' : '빛 기준';
            notes.push('두 기준 중 참값에 더 가까운 것: <b>' + better + '</b>. 표 1 의 V₀ 와 \'비교\' 칸을 색깔별로 비교해 보세요. 어느 색에서 차이가 큰가요?');
        }
        if (cur.res) notes.push('참값 h = 6.626 × 10⁻³⁴ J·s. 이론대로라면 절편은 0 V 입니다. 우리 결과의 절편은 ' + cur.res.fit.intercept.toFixed(2) + ' V 입니다.');
        else notes.push('5. 데이터 수집에서 LED 2개 이상(3개 이상 추천)을 측정하면 결과가 여기에 요약됩니다.');
        html += '<p class="note">' + notes.join('<br>') + '</p>';
        $('concl-sum').innerHTML = html;
    }

    function renderAll() {
        renderSetup();
        renderLeds();
        renderMeasure();
        renderResults();
        renderConclusion();
    }

    // ---------- 입력 중인 값 ----------
    function saveDraft() {
        state.draft = { v: $('in-v').value, i: $('in-i').value, vr: $('in-vr').value, gv: $('in-gv').value };
        save();
    }
    ['in-v', 'in-i', 'in-vr', 'in-gv'].forEach(id => $(id).addEventListener('input', saveDraft));

    // ---------- 탭 ----------
    const TABS = ['purpose', 'theory', 'materials', 'procedure', 'data', 'result', 'conclusion'];
    function showTab(t, scroll) {
        if (!TABS.includes(t)) t = 'purpose';
        state.tab = t;
        document.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.tab !== t; });
        document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'));
        save();
        renderAll();   // 숨겨져 있던 그래프는 보일 때 크기에 맞춰 다시 그린다
        if (scroll) window.scrollTo(0, 0);
    }
    document.querySelectorAll('.tabs button, [data-go]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab || b.dataset.go, true)));

    // 저장된 값을 화면 입력 칸에 넣기
    function applyControls() {
        $('sel-pot').value = state.pot;
        $('sel-rs').value = state.rs;
        $('rs-custom').value = state.rsCustom;
        $('sel-bat').value = state.bat;
        $('bat-real').value = state.batReal;
        $('sel-imax').value = state.iMax;
        $('in-v').value = state.draft.v;
        $('in-i').value = state.draft.i;
        $('in-vr').value = state.draft.vr;
        $('r-meas').value = state.rMeas;
        $('in-gv').value = state.draft.gv;
    }

    load();
    applyControls();
    showTab(state.tab);
    // 같은 브라우저의 다른 창(탭)에서 바꾼 내용을 따라간다. 그렇지 않으면 이 창이 저장할 때 다른 창의 기록을 덮어쓴다.
    window.addEventListener('storage', e => {
        if (e.key !== STORE_KEY) return;
        load();
        applyControls();
        showTab(state.tab);
    });
    let resizeTimer = null;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { renderMeasure(); renderResults(); }, 150); });
})();
