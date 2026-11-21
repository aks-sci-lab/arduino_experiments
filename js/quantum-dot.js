// 탄소 양자점 형광 실험 화면 (projects/quantum-dot.html)
// 7단계: 1 목적 · 2 이론 · 3 준비물 · 4 과정 · 5 데이터(폰: 시료 정보·형광 색·분광기·저장 / 노트북: 📱 QR 카드·조 공유) · 6 결과(표·그래프·CSV) · 7 결론
// 폰 측정 · 노트북 분석 이원화: 노트북·PC 는 측정 부분(.hide-on-laptop)을 숨김, ?role=phone 은 측정만, 태블릿은 둘 다
// 계산은 js/quantum-dot-math.js. 사진·영상은 저장·전송하지 않고 숫자만.
(function () {
    'use strict';
    const Q = window.QDotMath;
    const $ = id => document.getElementById(id);
    const PHONE = !!(window.ClassShare && ClassShare.readPhoneParams && ClassShare.readPhoneParams(location.search));
    const STORE_KEY = PHONE ? 'quantum-dot-v1:phone' : 'quantum-dot-v1';
    const CAL_KEY = 'quantum-dot-cal-v1';      // 분광기 보정은 기기(폰)마다 하나, 노트북·폰 화면이 같이 씀
    const NOTES_KEY = 'quantum-dot-notes-v1';
    const COLORS = ['#1565c0', '#2e7d32', '#c62828', '#6a1b9a', '#ef6c00', '#00838f', '#ad1457', '#4e342e', '#283593', '#558b2f'];
    let share = null, steps = null, tabs = null;

    const state = {
        samples: [],            // 이 기기가 잰 시료
        draft: null,            // 지금 재는 시료
        ext: {},                // 조 공유로 받은 시료 (기기별)
        extFile: {},            // 📂 CSV 로 불러온 시료
        share: null,
        tab: 'purpose',
        // 카메라 (저장 안 함)
        kind: null, stream: null, track: null, caps: {}, photo: null, locked: false,
        roi: { cx: 0.5, cy: 0.5, size: 20 },           // 영역: 가운데(0~1), 크기(짧은 변의 %)
        line: null, linePick: 0,                        // 분광기 선 { x0,y0,x1,y1 } (0~1), 다음 누름이 시작(0)/끝(1)
        thick: 9, calProfile: null, calPeaks: [], calPairs: {}, liveProfile: null
    };
    let cal = null;    // { a, b, n, r2, rmse, line, thick, at }

    function emptyDraft(prev) {
        const p = prev || {};
        return { heatS: p.heatS != null ? p.heatS : 120, citric: p.citric != null ? p.citric : 1, urea: p.urea != null ? p.urea : 1,
            water: p.water != null ? p.water : 10, dilution: p.dilution || '1:10', light: p.light || '365 nm', memo: '', photo: null, spec: null, cam: null, specCam: null };
    }
    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify({ samples: state.samples, draft: state.draft, ext: state.ext, extFile: state.extFile, share: state.share, line: state.line, thick: state.thick, phoneChange: state.phoneChange })); } catch (e) { /* 저장 불가 */ }
    }
    function load() {
        try {
            const o = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (o) {
                state.samples = Array.isArray(o.samples) ? o.samples : [];
                state.draft = o.draft || null; state.ext = o.ext || {}; state.extFile = o.extFile || {};
                state.share = o.share || null; state.line = o.line || null; state.thick = o.thick || 9; state.phoneChange = o.phoneChange || '';
            }
        } catch (e) { /* 깨진 저장 무시 */ }
        try { cal = JSON.parse(localStorage.getItem(CAL_KEY) || 'null'); } catch (e) { cal = null; }
        if (cal && !(Number.isFinite(cal.a) && Number.isFinite(cal.b))) cal = null;
        if (cal && cal.line && !state.line) state.line = cal.line;
        if (!state.draft) state.draft = emptyDraft(state.samples[state.samples.length - 1]);
    }
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (v, d) => (v == null || !Number.isFinite(Number(v)) ? '–' : Number(v).toFixed(d));
    const nextNo = () => state.samples.reduce((m, s) => Math.max(m, s.no || 0), 0) + 1;

    /* ---------- 시료 정보 ---------- */
    const FORM = [['in-heat', 'heatS', 'num'], ['in-citric', 'citric', 'num'], ['in-urea', 'urea', 'num'], ['in-water', 'water', 'num'],
        ['in-dilution', 'dilution'], ['in-light', 'light'], ['in-memo', 'memo']];
    function fillForm() {
        const d = state.draft;
        FORM.forEach(([id, k]) => { $(id).value = d[k] == null ? '' : d[k]; });
        renderDraft();
    }
    FORM.forEach(([id, k, t]) => $(id).addEventListener('input', () => {
        const v = $(id).value;
        state.draft[k] = t === 'num' ? (v === '' || !Number.isFinite(Number(v)) ? null : Number(v)) : v.slice(0, k === 'memo' ? 30 : 20);
        save(); renderDraft();
    }));

    function renderDraft() {
        const d = state.draft;
        $('draft-no').textContent = '· 시료 ' + nextNo();
        $('ratio-txt').textContent = Q.ratioLabel(d) || '–';
        const m = Q.metrics(d), c = d.cam || d.specCam || {};
        const cells = [
            ['시료', '시료 ' + nextNo() + ' · ' + (d.heatS != null ? d.heatS + '초' : '가열 ?') + ' · ' + (Q.ratioLabel(d) || '비율 ?')],
            ['형광 색', d.photo ? '<span class="dot" style="background:rgb(' + d.photo.r + ',' + d.photo.g + ',' + d.photo.b + ')"></span> ≈ ' + fmt(d.photo.lambda, 0) + ' nm' : '아직 없음'],
            ['분광 봉우리', d.spec ? (d.spec.peakNm != null ? fmt(d.spec.peakNm, 1) + ' nm (반치폭 ' + fmt(d.spec.fwhmNm, 0) + ')' : '화소 ' + fmt(d.spec.peakPx, 0) + ' (보정 없음)') : '아직 없음'],
            ['E = hc/λ', m.energy != null ? fmt(m.energy, 2) + ' eV' : '–'],
            ['노출', c.exposureMs != null ? fmt(c.exposureMs, 2) + ' ms · ISO ' + fmt(c.iso, 0) : '노출 값 없음'],
            ['보정 밝기', m.corr != null ? fmt(m.corr, 3) : '–']
        ];
        $('draft-sum').innerHTML = cells.map(([k, v]) => '<div>' + k + '<b>' + v + '</b></div>').join('');
        $('btn-save').disabled = !(d.photo || d.spec);
        $('save-tab-n').textContent = state.samples.length ? '시료 ' + state.samples.length + '개' : '시료 목록';
        if (typeof renderVarCheck === 'function' && VARS_READY) renderVarCheck();
    }
    let VARS_READY = false;

    function saveSample() {
        const d = state.draft;
        if (!(d.photo || d.spec)) { $('save-msg').textContent = '② 형광 색이나 ③ 분광기를 먼저 기록하세요.'; return; }
        const mixWith = mixNow();
        const s = Q.cleanSample(Object.assign({}, d, { no: nextNo(), at: new Date().toISOString(), cam: d.cam || d.specCam || {}, mix: mixWith.length ? { with: mixWith, use: 'out' } : null }));
        if (d.spec && d.spec.grid) s.spec.grid = d.spec.grid;
        state.samples.push(s);
        state.draft = emptyDraft(d);
        save();
        fillForm(); renderMine(); render();
        $('save-msg').textContent = '✅ 시료 ' + s.no + ' 저장했어요. ' + (s.mix ? '⚠ 두 가지가 바뀐 시료라 아래 목록에서 맞춤에 넣을지 골라요.' : '다음 시료는 ① 시료에서 가열 시간·비율을 바꾸세요.');
        if (share) share.saved();
    }
    $('btn-save').onclick = saveSample;

    function renderMine() {
        $('mine-n').textContent = state.samples.length ? '(' + state.samples.length + '개)' : '';
        $('mine-list').innerHTML = state.samples.length ? state.samples.slice().reverse().map(s => {
            const m = Q.metrics(s), p = s.photo;
            return '<div class="mine-item">' + (p ? '<span class="dot" style="background:rgb(' + p.r + ',' + p.g + ',' + p.b + ')"></span>' : '') +
                '<span class="txt"><b>' + esc(Q.sampleTitle(s)) + '</b><br>' + (m.lambda != null ? (m.lambdaFrom === 'hue' ? '≈' : '') + fmt(m.lambda, 1) + ' nm · ' + fmt(m.energy, 2) + ' eV' : '') +
                (m.corr != null ? ' · 보정 밝기 ' + fmt(m.corr, 3) : '') + (s.memo ? ' · ' + esc(s.memo) : '') + '</span>' +
                '<button type="button" class="danger" data-del="' + s.no + '" aria-label="시료 ' + s.no + ' 지우기">🗑</button>' + (s.mix ? mixHtml(s, 'm') : '') + '</div>';
        }).join('') : '<p class="note">아직 없어요.</p>';
        renderDraft();
    }
    $('mine-list').addEventListener('click', e => {
        const b = e.target.closest('[data-del]');
        if (!b) return;
        const no = Number(b.dataset.del);
        if (!confirm('시료 ' + no + '을(를) 지울까요?')) return;
        deleteSample(no);
    });
    function deleteSample(no) {
        state.samples = state.samples.filter(s => s.no !== no);
        save(); renderMine(); render();
    }

    /* ---------- 카메라 ---------- */
    const video = $('video'), view = $('view'), vctx = view.getContext('2d');
    const work = document.createElement('canvas'), wctx = work.getContext('2d', { willReadFrequently: true });
    function showMsg(t, ok) { const el = $('cam-msg'); el.textContent = t || ''; el.className = ok ? 'ok' : 'warn'; el.hidden = !t; }
    function srcEl() { return state.kind === 'video' ? video : state.kind === 'photo' ? state.photo : null; }
    function srcDims() {
        if (state.kind === 'video') return { w: video.videoWidth, h: video.videoHeight };
        if (state.kind === 'photo') return { w: state.photo.naturalWidth, h: state.photo.naturalHeight };
        return { w: 0, h: 0 };
    }
    async function startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showMsg('이 브라우저/주소에서는 카메라를 쓸 수 없습니다. https 주소인지 확인하세요. (🖼️ 사진 불러오기는 됩니다)'); return; }
        try {
            if (state.stream) state.stream.getTracks().forEach(t => t.stop());
            state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
            video.srcObject = state.stream;
            await video.play();
            state.track = state.stream.getVideoTracks()[0];
            state.caps = (state.track.getCapabilities && state.track.getCapabilities()) || {};
            state.kind = 'video'; state.locked = false;
            const c = state.caps;
            const canLock = !!((c.exposureMode && c.exposureMode.includes('manual')) || c.exposureTime || c.iso);
            $('btn-lock').disabled = !canLock;
            showMsg(canLock ? '' : '이 기기/브라우저는 웹에서 노출 고정을 지원하지 않아요. 그대로 재도 되고(노출 값이 있으면 보정 밝기로 비교), 기본 카메라 앱에서 노출을 고정해 찍은 사진을 🖼️ 불러와도 돼요.');
            $('btn-cam').textContent = '📷 카메라 다시 켜기';
            refreshButtons();
        } catch (e) {
            showMsg('카메라를 켤 수 없습니다: ' + (e && e.message ? e.message : e) + ' — 권한을 허용했는지, https 주소인지 확인하세요.');
        }
    }
    // 🔒 노출 고정 — 말루스(js/malus-law.js)와 같은 방식: 노출·화이트밸런스·초점을 따로따로, 값은 기기 범위·단계에 맞춤
    // (갤럭시에서 "colorTemperature setting out of range" 로 한꺼번에 실패하던 문제)
    function fitCap(v, cap) {
        if (v == null || !Number.isFinite(Number(v))) return undefined;
        v = Number(v);
        if (cap && typeof cap === 'object' && Number.isFinite(cap.min) && Number.isFinite(cap.max)) {
            if (cap.max < cap.min) return undefined;
            v = Math.min(cap.max, Math.max(cap.min, v));
            if (cap.step > 0) v = Math.min(cap.max, cap.min + Math.round((v - cap.min) / cap.step) * cap.step);
        }
        return v;
    }
    async function tryLock(withValue, modeOnly) {
        const tries = withValue ? [withValue, modeOnly] : [modeOnly];
        let err = null;
        for (const c of tries) {
            if (!c || !Object.keys(c).length) continue;
            try { await state.track.applyConstraints({ advanced: [c] }); return { ok: true }; } catch (e) { err = e; }
        }
        return { ok: false, err };
    }
    async function lockExposure() {
        if (!state.track) return;
        const c = state.caps || {}, s = state.track.getSettings ? state.track.getSettings() : {};
        const has = (k, v) => Array.isArray(c[k]) && c[k].includes(v);
        const parts = [];
        if (has('exposureMode', 'manual') || c.exposureTime || c.iso) {
            const full = {}, mode = {};
            if (has('exposureMode', 'manual')) { full.exposureMode = 'manual'; mode.exposureMode = 'manual'; }
            const et = fitCap(s.exposureTime, c.exposureTime), iso = fitCap(s.iso, c.iso);
            if (c.exposureTime && et !== undefined) full.exposureTime = et;
            if (c.iso && iso !== undefined) full.iso = iso;
            parts.push({ name: '노출', full, mode });
        }
        if (has('whiteBalanceMode', 'manual')) {
            const full = { whiteBalanceMode: 'manual' }, ct = fitCap(s.colorTemperature, c.colorTemperature);
            if (c.colorTemperature && ct !== undefined) full.colorTemperature = ct;
            parts.push({ name: '화이트밸런스', full, mode: { whiteBalanceMode: 'manual' } });
        }
        if (has('focusMode', 'manual')) {
            const full = { focusMode: 'manual' }, fd = fitCap(s.focusDistance, c.focusDistance);
            if (c.focusDistance && fd !== undefined) full.focusDistance = fd;
            parts.push({ name: '초점', full, mode: { focusMode: 'manual' } });
        }
        if (!parts.length) { showMsg('이 기기/브라우저는 웹에서 노출 고정을 지원하지 않습니다.'); return; }
        const done = [], failed = [];
        for (const p of parts) {
            const r = await tryLock(p.full, p.mode);
            if (r.ok) done.push(p.name); else failed.push(p.name + (r.err && r.err.message ? ' (' + r.err.message + ')' : ''));
        }
        state.locked = done.includes('노출');
        $('btn-lock').textContent = state.locked ? '🔒 노출 고정됨' : '🔒 노출 고정';
        if (!failed.length) showMsg('🔒 고정했어요 (' + done.join('·') + '). 시료를 바꿔도 노출·ISO 가 그대로라 밝기를 바로 비교할 수 있어요.', true);
        else if (state.locked) showMsg('🔒 노출은 고정했어요. 이 기기에서 안 된 것: ' + failed.join(', ') + ' — 측정해도 돼요(색온도가 바뀌면 색 추정이 조금 달라질 수 있음).', true);
        else showMsg('노출 고정 실패: ' + failed.join(', ') + ' — 그대로 재면 노출 시간·ISO 로 나눈 보정 밝기로 비교해요.');
    }
    function loadPhoto(file) {
        if (!file) return;
        const img = new Image();
        img.onload = () => { state.photo = img; state.kind = 'photo'; state.locked = false; showMsg(''); refreshButtons(); };
        img.onerror = () => showMsg('사진을 열 수 없습니다.');
        img.src = URL.createObjectURL(file);
    }
    $('btn-cam').onclick = startCamera;
    $('btn-lock').onclick = lockExposure;
    $('btn-photo').onclick = () => $('file-photo').click();
    $('file-photo').onchange = e => { loadPhoto(e.target.files[0]); e.target.value = ''; };

    // 지금 카메라 설정값 (사진 불러오기면 모름)
    function camNow() {
        const N = Number($('in-aperture').value) || 1.8;
        const s = state.kind === 'video' && state.track && state.track.getSettings ? state.track.getSettings() : {};
        return Object.assign(Q.cameraInfo(s, N), { locked: state.kind === 'video' ? state.locked : null });
    }
    // 원본을 작업 캔버스(가로 최대 960)에 그려 화소를 읽음
    function grab() {
        const el = srcEl(), d = srcDims();
        if (!el || !d.w) return null;
        const k = Math.min(1, 960 / d.w), w = Math.max(1, Math.round(d.w * k)), h = Math.max(1, Math.round(d.h * k));
        if (work.width !== w || work.height !== h) { work.width = w; work.height = h; }
        wctx.drawImage(el, 0, 0, w, h);
        return wctx.getImageData(0, 0, w, h);
    }
    function roiPx(img) {
        const s = Math.max(2, Math.round(Math.min(img.width, img.height) * state.roi.size / 100));
        const x = Math.max(0, Math.min(img.width - s, Math.round(state.roi.cx * img.width - s / 2)));
        const y = Math.max(0, Math.min(img.height - s, Math.round(state.roi.cy * img.height - s / 2)));
        return { x, y, s };
    }
    function readColor(img) {
        const r = roiPx(img), data = new Uint8ClampedArray(r.s * r.s * 4);
        for (let j = 0; j < r.s; j++) data.set(img.data.subarray(((r.y + j) * img.width + r.x) * 4, ((r.y + j) * img.width + r.x + r.s) * 4), j * r.s * 4);
        return Q.regionStats(data);
    }
    function defaultLine() { return { x0: 0.05, y0: 0.5, x1: 0.95, y1: 0.5 }; }
    function readProfile(img) {
        const L = state.line || defaultLine();
        return Q.lineProfile(img, L.x0 * (img.width - 1), L.y0 * (img.height - 1), L.x1 * (img.width - 1), L.y1 * (img.height - 1), state.thick);
    }
    const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
    // 여러 장 평균 (사진이면 한 장)
    async function averaged(fn, n) {
        const k = state.kind === 'video' ? n : 1, outs = [];
        for (let i = 0; i < k; i++) { const img = grab(); if (img) outs.push(fn(img)); if (i < k - 1) await nextFrame(); }
        return outs;
    }

    async function recordColor() {
        $('btn-color').disabled = true;
        const outs = await averaged(readColor, 8);
        refreshButtons();
        if (!outs.length) return;
        const avg = k => outs.reduce((s, o) => s + o[k], 0) / outs.length;
        const st = Q.colorInfo(avg('r'), avg('g'), avg('b'), avg('Y'), avg('clip'));
        state.draft.photo = st;
        state.draft.cam = camNow();
        save(); renderDraft();
        $('color-msg').textContent = '✅ 기록: ' + (st.lambda != null ? '≈ ' + fmt(st.lambda, 0) + ' nm (색상 ' + fmt(st.hue, 0) + '°)' : '한 파장 색이 아님(자홍)') +
            (state.draft.cam.exposureMs != null ? ' · 노출 ' + fmt(state.draft.cam.exposureMs, 2) + ' ms · ISO ' + fmt(state.draft.cam.iso, 0) : ' · 노출 값 없음') + (state.draft.cam.locked ? ' 🔒' : '');
    }
    $('btn-color').onclick = recordColor;

    function avgProfile(outs) {
        const n = Math.min(...outs.map(o => o.y.length)), mean = key => Array.from({ length: n }, (_, i) => outs.reduce((s, o) => s + o[key][i], 0) / outs.length);
        return { y: mean('y'), r: mean('r'), g: mean('g'), b: mean('b'), clip: outs.reduce((s, o) => s + o.clip, 0) / outs.length };
    }
    async function recordSpectrum() {
        $('btn-spec').disabled = true;
        const outs = await averaged(readProfile, 5);
        refreshButtons();
        if (!outs.length) return;
        const prof = avgProfile(outs);
        const sp = Q.analyzeSpectrum(prof, cal);
        if (!sp) { $('spec-msg').textContent = '⚠️ 띠가 보이지 않아요. 선이 스펙트럼 띠 위에 있는지 보세요.'; return; }
        if (cal) sp.cal = { a: cal.a, b: cal.b, n: cal.n, r2: cal.r2 };
        state.draft.spec = sp;
        state.draft.specCam = camNow();
        save(); renderDraft();
        $('spec-msg').textContent = sp.peakNm != null ? '✅ 봉우리 ' + fmt(sp.peakNm, 1) + ' nm · 반치폭 ' + fmt(sp.fwhmNm, 0) + ' nm' + (sp.edge ? ' ⚠️ 띠가 선 끝에서 잘렸어요(선을 길게)' : '')
            : '✅ 봉우리 화소 ' + fmt(sp.peakPx, 0) + ' — 보정이 없어 파장으로 못 바꿔요. 🎯 보정을 먼저 하면 좋아요.';
        if (sp.clip > 0.05) $('spec-msg').textContent += ' ⚠️ 포화 화소 ' + Math.round(sp.clip * 100) + '%';
    }
    $('btn-spec').onclick = recordSpectrum;

    /* ---------- 분광기 보정 ---------- */
    async function calShot() {
        const outs = await averaged(readProfile, 5);
        if (!outs.length) return;
        state.calProfile = avgProfile(outs);
        state.calPeaks = Q.findPeaks(state.calProfile.y, { max: 8 }).sort((a, b) => a.px - b.px);
        state.calPairs = {};
        renderCal();
        $('cal-msg').textContent = state.calPeaks.length >= 2 ? '봉우리 ' + state.calPeaks.length + '개를 찾았어요. 알려진 파장을 2개 이상 고르세요.' : '⚠️ 봉우리가 2개 미만이에요. 형광등·레이저를 슬릿에 비추고 선을 띠 위에 맞추세요.';
    }
    function lineOptions(sel) {
        return '<option value="">고르지 않음</option>' + Q.KNOWN_LINES.map(l => '<option value="' + l.nm + '"' + (Number(sel) === l.nm ? ' selected' : '') + '>' + l.label + ' nm</option>').join('') +
            '<option value="custom"' + (sel === 'custom' ? ' selected' : '') + '>직접 넣기…</option>';
    }
    function renderCal() {
        $('cal-sum').textContent = '🎯 보정 (화소 → 파장)' + (cal ? ' · ✅ 보정됨 (선 ' + cal.n + '개)' : ' · 아직 안 함');
        const box = $('cal-peaks');
        box.innerHTML = state.calPeaks.map((p, i) => {
            const v = state.calPairs[i];
            const known = v != null && Q.KNOWN_LINES.some(l => l.nm === v);
            return '<div class="cal-peak"><span>봉우리 ' + (i + 1) + ' · 화소 ' + fmt(p.px, 1) + '</span><select data-i="' + i + '" aria-label="봉우리 ' + (i + 1) + ' 파장">' +
                lineOptions(v == null ? '' : known ? v : 'custom') + '</select>' +
                '<input type="number" data-ci="' + i + '" step="0.1" placeholder="nm" ' + (v != null && !known ? 'value="' + v + '"' : 'hidden') + ' aria-label="파장(nm)"></div>';
        }).join('');
        const pairs = calPairList();
        $('btn-cal-save').disabled = pairs.length < 2;
        $('btn-cal-auto').disabled = state.calPeaks.length < 2;
        $('btn-cal-shot').disabled = !srcEl();
    }
    function calPairList() {
        return Object.keys(state.calPairs).map(i => ({ px: state.calPeaks[i] && state.calPeaks[i].px, nm: Number(state.calPairs[i]) })).filter(p => Number.isFinite(p.px) && Number.isFinite(p.nm));
    }
    $('cal-peaks').addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.i != null) {
            const i = Number(t.dataset.i);
            if (t.value === 'custom') { state.calPairs[i] = NaN; renderCal(); const inp = document.querySelector('[data-ci="' + i + '"]'); inp.hidden = false; inp.focus(); return; }
            if (t.value === '') delete state.calPairs[i]; else state.calPairs[i] = Number(t.value);
            renderCal();
        }
    });
    $('cal-peaks').addEventListener('input', e => {
        const t = e.target;
        if (t.dataset.ci != null) { state.calPairs[Number(t.dataset.ci)] = t.value === '' ? NaN : Number(t.value); $('btn-cal-save').disabled = calPairList().length < 2; }
    });
    $('btn-cal-shot').onclick = calShot;
    $('btn-cal-auto').onclick = () => {
        const sug = Q.suggestLamp(state.calProfile, state.calPeaks.slice().sort((a, b) => b.height - a.height));
        state.calPairs = {};
        sug.forEach(s => { const i = state.calPeaks.findIndex(p => p.px === s.px); if (i >= 0) state.calPairs[i] = s.nm; });
        renderCal();
        $('cal-msg').textContent = '가장 밝은 봉우리 ' + sug.length + '개를 형광등 ' + sug.map(s => Math.round(s.nm)).join('·') + ' nm 로 짝지었어요. 맞는지 색을 보고 확인한 뒤 ✅ 보정 저장.';
    };
    $('btn-cal-save').onclick = () => {
        const pairs = calPairList(), f = Q.fitCalibration(pairs);
        if (!f) { $('cal-msg').textContent = '⚠️ 서로 다른 봉우리 2개 이상이 필요해요.'; return; }
        cal = Object.assign(f, { line: state.line || defaultLine(), thick: state.thick, at: new Date().toISOString(), pairs });
        try { localStorage.setItem(CAL_KEY, JSON.stringify(cal)); } catch (e) { /* 저장 불가 */ }
        renderCal();
        $('cal-msg').textContent = '✅ λ = ' + fmt(cal.a, 1) + ' + ' + fmt(cal.b, 4) + ' × 화소 (선 ' + cal.n + '개' + (cal.n > 2 ? ', R² ' + fmt(cal.r2, 5) + ', 어긋남 ' + fmt(cal.rmse, 1) + ' nm' : '') + '). 이 폰이 기억해요. 폰·분광기를 움직이면 다시 보정하세요.';
    };
    $('btn-cal-clear').onclick = () => {
        if (cal && !confirm('저장한 보정을 지울까요?')) return;
        cal = null; try { localStorage.removeItem(CAL_KEY); } catch (e) { /* 무시 */ }
        renderCal(); $('cal-msg').textContent = '보정을 지웠어요.';
    };
    $('btn-line-reset').onclick = () => { state.line = defaultLine(); state.linePick = 0; save(); };
    $('line-thick').oninput = () => { state.thick = Number($('line-thick').value); $('line-thick-txt').textContent = state.thick + ' 화소'; save(); };
    $('roi-size').oninput = () => { state.roi.size = Number($('roi-size').value); $('roi-size-txt').textContent = state.roi.size + '%'; };

    // 화면 누르기: 형광 색은 영역 옮기기, 분광기는 선의 시작·끝 번갈아
    view.addEventListener('pointerdown', ev => {
        const r = view.getBoundingClientRect(), d = srcDims();
        if (!d.w) return;
        const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
        if (measTab === 'color') { state.roi.cx = fx; state.roi.cy = fy; return; }
        if (measTab === 'spec') {
            const L = Object.assign({}, state.line || defaultLine());
            if (state.linePick === 0) { L.x0 = fx; L.y0 = fy; L.x1 = Math.min(1, fx + 0.01); L.y1 = fy; } else { L.x1 = fx; L.y1 = fy; }
            state.line = L; state.linePick = 1 - state.linePick; save();
        }
    });

    function refreshButtons() {
        const has = !!srcEl();
        $('btn-color').disabled = !has; $('btn-spec').disabled = !has; $('btn-cal-shot').disabled = !has;
    }

    /* ---------- 그리기 ---------- */
    let lastLive = 0;
    function frame(ts) {
        requestAnimationFrame(frame);
        if (measTab !== 'color' && measTab !== 'spec') return;
        const el = srcEl(), d = srcDims();
        if (!el || !d.w) return;
        const W = Math.min(960, Math.round(view.clientWidth * (window.devicePixelRatio || 1))) || 640;
        const H = Math.round(W * d.h / d.w);
        if (view.width !== W || view.height !== H) { view.width = W; view.height = H; }
        vctx.drawImage(el, 0, 0, W, H);
        vctx.lineWidth = Math.max(2, W / 240);
        if (measTab === 'color') {
            const s = Math.min(W, H) * state.roi.size / 100;
            vctx.strokeStyle = '#00e676';
            vctx.strokeRect(Math.max(0, Math.min(W - s, state.roi.cx * W - s / 2)), Math.max(0, Math.min(H - s, state.roi.cy * H - s / 2)), s, s);
        } else {
            const L = state.line || defaultLine();
            vctx.strokeStyle = 'rgba(255,255,255,.9)';
            vctx.beginPath(); vctx.moveTo(L.x0 * W, L.y0 * H); vctx.lineTo(L.x1 * W, L.y1 * H); vctx.stroke();
            vctx.fillStyle = '#00e676'; vctx.beginPath(); vctx.arc(L.x0 * W, L.y0 * H, vctx.lineWidth * 3, 0, 7); vctx.fill();
            vctx.fillStyle = '#ff5252'; vctx.beginPath(); vctx.arc(L.x1 * W, L.y1 * H, vctx.lineWidth * 3, 0, 7); vctx.fill();
        }
        if (ts - lastLive < 250) return;
        lastLive = ts;
        const img = grab();
        if (!img) return;
        const cam = camNow();
        $('cam-live').innerHTML = '<div>노출 <b>' + (cam.exposureMs != null ? fmt(cam.exposureMs, 2) + ' ms' : '없음') + '</b></div><div>ISO <b>' + (cam.iso != null ? cam.iso : '없음') + '</b></div>' +
            '<div>색온도 <b>' + (cam.colorTemp != null ? cam.colorTemp + ' K' : '없음') + '</b></div><div>조도 ≈ <b>' + (cam.lux != null ? fmt(cam.lux, 0) + ' lux' : '–') + '</b></div>' +
            '<div><b>' + (state.kind === 'photo' ? '🖼️ 사진' : state.locked ? '🔒 고정됨' : '고정 안 됨') + '</b></div>';
        if (measTab === 'color') {
            const st = readColor(img);
            $('live-swatch').style.background = 'rgb(' + st.r + ',' + st.g + ',' + st.b + ')';
            $('live-color').innerHTML = 'R ' + fmt(st.r, 0) + ' · G ' + fmt(st.g, 0) + ' · B ' + fmt(st.b, 0) + ' · 밝기 ' + fmt(st.Y, 3) + '<br>색상 ' + fmt(st.hue, 0) + '° → <b>' +
                (st.lambda != null ? '≈ ' + fmt(st.lambda, 0) + ' nm (추정)' : '한 파장 색 아님') + '</b>' + (st.chroma < 0.15 ? ' · 색이 옅음' : '');
            $('clip-warn').hidden = !(st.clip > 0.05);
        } else {
            state.liveProfile = readProfile(img);
            drawProfile();
        }
    }
    function setupCanvas(cv) {
        const dpr = window.devicePixelRatio || 1, W = Math.max(280, cv.clientWidth || 600), H = cv.clientHeight || 260;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
        const ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        return { ctx, W, H };
    }
    function drawProfile() {
        const p = state.liveProfile, cv = $('prof-chart');
        if (!p || !cv.clientWidth) return;
        const { ctx, W, H } = setupCanvas(cv);
        const y = Q.smooth(p.y, 3), n = y.length, mx = Math.max(...y, 1e-6), padB = 18;
        // 화소 색을 바닥에 띠로
        for (let i = 0; i < n; i += Math.max(1, Math.floor(n / W))) {
            ctx.fillStyle = 'rgb(' + Math.round(p.r[i]) + ',' + Math.round(p.g[i]) + ',' + Math.round(p.b[i]) + ')';
            ctx.fillRect(i / (n - 1) * W, H - padB, Math.max(1, W / n + 1), 6);
        }
        ctx.strokeStyle = '#1565c0'; ctx.lineWidth = 1.5; ctx.beginPath();
        y.forEach((v, i) => { const X = i / (n - 1) * W, Y = (H - padB - 4) - v / mx * (H - padB - 14); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
        ctx.stroke();
        ctx.fillStyle = '#444'; ctx.font = '11px sans-serif';
        if (cal) {
            [400, 450, 500, 550, 600, 650, 700].forEach(nm => {
                const px = Q.nmToPx(cal, nm);
                if (px < 0 || px > n - 1) return;
                const X = px / (n - 1) * W;
                ctx.fillRect(X, H - padB + 6, 1, 4); ctx.fillText(String(nm), Math.min(W - 22, Math.max(0, X - 10)), H - 2);
            });
        } else ctx.fillText('보정 전: 가로축은 화소 (0 ~ ' + (n - 1) + ')', 4, H - 2);
        const pk = Q.mainPeak(p.y);
        $('prof-note').textContent = pk ? '가장 밝은 곳: ' + (cal ? fmt(Q.pxToNm(cal, pk.px), 1) + ' nm' : '화소 ' + fmt(pk.px, 0)) + ' · 초록 점 = 선의 시작, 빨간 점 = 끝 (화면을 눌러 바꿈)' : '';
    }

    // 6. 결과: 가로·세로 그래프 (점 + 최소제곱 직선)
    function drawXY(cv, series, xLabel, yLabel, fitLine) {
        const { ctx, W, H } = setupCanvas(cv);
        const pts = series.flatMap(s => s.points);
        const L = 56, R = 12, T = 24, B = 40;
        ctx.fillStyle = '#666'; ctx.font = '12px sans-serif';
        if (!pts.length) { ctx.fillText('그릴 값이 없어요 (가로·세로 값이 모두 있는 시료가 필요)', 12, H / 2); return; }
        let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
        if (x1 === x0) { x0 -= 1; x1 += 1; } if (y1 === y0) { y0 -= Math.abs(y0) * 0.05 || 1; y1 += Math.abs(y1) * 0.05 || 1; }
        const px = (x1 - x0) * 0.08, py = (y1 - y0) * 0.12; x0 -= px; x1 += px; y0 -= py; y1 += py;
        const X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - R, H - B); ctx.stroke();
        for (let i = 0; i <= 4; i++) {
            const xv = x0 + (x1 - x0) * i / 4, yv = y0 + (y1 - y0) * i / 4;
            ctx.fillText(niceNum(xv), X(xv) - 12, H - B + 14);
            ctx.fillText(niceNum(yv), 4, Y(yv) + 4);
        }
        ctx.fillText(xLabel, W / 2 - 40, H - 6);
        ctx.fillStyle = '#333'; ctx.fillText('↑ ' + yLabel, L + 6, T + 12); ctx.fillStyle = '#666';
        if (fitLine) {
            ctx.strokeStyle = '#888'; ctx.setLineDash([5, 4]); ctx.beginPath();
            ctx.moveTo(X(x0), Y(fitLine.a + fitLine.b * x0)); ctx.lineTo(X(x1), Y(fitLine.a + fitLine.b * x1)); ctx.stroke(); ctx.setLineDash([]);
        }
        series.forEach(s => s.points.forEach(p => {
            ctx.fillStyle = p.fill || s.color; ctx.strokeStyle = s.color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 6, 0, 7); ctx.fill(); ctx.stroke();
        }));
    }
    function niceNum(v) { const a = Math.abs(v); return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toPrecision(2); }
    function drawSpectra(cv, list) {
        const { ctx, W, H } = setupCanvas(cv);
        const L = 40, R = 10, T = 10, B = 34;
        const X = nm => L + (nm - Q.GRID0) / (Q.GRID1 - Q.GRID0) * (W - L - R), Y = v => T + (1 - v) * (H - T - B);
        // 바닥에 무지개 띠
        for (let nm = 380; nm <= 750; nm += 5) { ctx.fillStyle = 'hsl(' + Math.max(0, Math.min(270, (650 - nm) * 270 / 230)) + ',90%,50%)'; ctx.fillRect(X(nm), H - B + 2, X(nm + 5) - X(nm) + 1, 5); }
        ctx.fillStyle = '#666'; ctx.font = '12px sans-serif';
        for (let nm = 400; nm <= 750; nm += 50) ctx.fillText(String(nm), X(nm) - 10, H - B + 20);
        ctx.fillText('파장 (nm)', W / 2 - 24, H - 2);
        ctx.strokeStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - R, H - B); ctx.stroke();
        if (!list.length) { ctx.fillText('분광기로 잰 시료가 없어요', L + 10, H / 2); return; }
        list.forEach((s, k) => {
            ctx.strokeStyle = COLORS[k % COLORS.length]; ctx.lineWidth = 2; ctx.beginPath();
            let on = false;
            s.spec.grid.forEach((v, i) => {
                if (v == null) { on = false; return; }
                const x = X(Q.gridNm(i)), y = Y(v);
                if (on) ctx.lineTo(x, y); else { ctx.moveTo(x, y); on = true; }
            });
            ctx.stroke();
        });
    }

    /* ---------- 6. 결과 ---------- */
    function fileExt() {
        const ext = {};
        Object.keys(state.extFile).forEach(k => { ext[k] = state.extFile[k]; });
        return ext;
    }
    function everything() {
        return Q.allSamples(state.samples, Object.assign({}, state.ext, fileExt()), '이 기기');
    }
    function render() {
        renderTable(); renderCharts();
        if (window.ReportAI && ReportAI.current && ReportAI.current.renderCompare) { ReportAI.current.renderCompare(); ReportAI.current.renderAsks(); }
    }
    function renderTable() {
        const all = everything();
        const nExt = all.filter(s => s.ext).length;
        $('cnt').textContent = '(' + all.length + '개' + (nExt ? ', 불러온 값 ' + nExt + '개' : '') + ')';
        $('btn-csv').disabled = !all.length;
        $('btn-file-clear').hidden = !Object.keys(state.extFile).length;
        $('tbody').innerHTML = all.length ? all.map(s => {
            const m = Q.metrics(s), p = s.photo, c = s.cam || {};
            return '<tr class="' + (s.ext ? 'ext' : '') + '"><td>' + esc(s.ext ? s.source : '이 기기') + '</td><td>시료 ' + s.no + (s.memo ? ' · ' + esc(s.memo) : '') + (s.mix ? '<br><span class="qd-mix-tag">⚠ 두 가지가 바뀜 (' + esc(s.mix.with.join(', ')) + ') · ' + (s.mix.use === 'in' ? '맞춤에 넣음' : '맞춤에서 뺌') + '</span>' : '') + '</td><td>' + fmt(s.heatS, 0) + '</td><td>' + esc(Q.ratioLabel(s) || '–') + '</td><td>' + esc(s.light || '') + '</td>' +
                '<td>' + (p ? '<span class="dot" style="background:rgb(' + p.r + ',' + p.g + ',' + p.b + ')"></span>' : '') + '</td>' +
                '<td>' + (m.lambda != null ? (m.lambdaFrom === 'hue' ? '≈' : '') + fmt(m.lambda, 1) : '–') + '</td><td>' + fmt(m.fwhm, 0) + '</td><td>' + fmt(m.energy, 2) + '</td><td>' + fmt(m.corr, 3) + '</td>' +
                '<td>' + (c.exposureMs != null ? fmt(c.exposureMs, 1) + 'ms·' + fmt(c.iso, 0) : '없음') + (c.locked ? ' 🔒' : '') + '</td></tr>';
        }).join('') : '<tr><td colspan="11" class="note">아직 시료가 없어요. ' + (deviceKind() === 'laptop' ? '5. 데이터의 QR 로 폰에서 재서 보내세요.' : '5. 데이터에서 재세요.') + '</td></tr>';
        const mixed = all.filter(x => x.mix);
        $('mix-box').hidden = !mixed.length;
        $('mix-box').innerHTML = mixed.length ? '<h3>⚠ 두 가지가 바뀐 시료 ' + mixed.length + '개</h3>' + mixed.map(x => '<div class="qd-mix-item"><b>' + esc((x.ext ? x.source + ' · ' : '') + Q.sampleTitle(x)) + '</b>' + mixHtml(x, 'r') + '</div>').join('') : '';
    }
    const Y_INFO = { lambda: ['파장 λ (nm)', 1], energy: ['E (eV)', 3], corr: ['보정 밝기', 3], fwhm: ['반치폭 (nm)', 1] };
    // 6-2 가로축 = 조가 바꾼 것: 변인 카드(폰은 고른 '바꿀 것')에서, 없으면 시료 값으로 추정
    //  - 맞춤에 넣는 시료 중 한 가지만 여러 값이면 그것, 둘 다 여러 값이면 '두 가지가 바뀜'(mix) 표시에 없는 쪽
    function groupChange(all) {
        const v = curVars();
        if (v && v.change) return { key: v.change, from: 'card' };
        const use = all.filter(Q.inFit), n = k => new Set(use.map(s => { const m = Q.metrics(s); return k === 'heat' ? m.heat : m.ratio; }).filter(x => x != null)).size;
        const h = n('heat'), r = n('ratio');
        if (h > 1 && r <= 1) return { key: 'heat', from: 'data' };
        if (r > 1 && h <= 1) return { key: 'ratio', from: 'data' };
        const withNames = all.filter(s => s.mix).flatMap(s => s.mix.with);
        const name = k => VARS.vars.find(x => x.key === k).name;
        if (withNames.length) {
            const c = VARS.choose.filter(k => withNames.indexOf(name(k)) < 0);
            if (c.length === 1) return { key: c[0], from: 'data' };
        }
        return null;
    }
    let xManual = false;
    function renderCharts() {
        if (state.tab !== 'result') return;
        const all = everything(), yk = $('sel-y').value, gc = groupChange(all);
        if (gc && !xManual && $('sel-x').value !== gc.key) $('sel-x').value = gc.key;
        const xk = $('sel-x').value;
        const groups = {};
        all.forEach(s => {
            const m = Q.metrics(s), x = xk === 'heat' ? m.heat : m.ratio, y = m[yk];
            if (x == null || y == null) return;
            const key = s.ext ? s.source : '이 기기';
            const use = Q.inFit(s);
            (groups[key] = groups[key] || []).push({ x, y, out: !use, fill: !use ? '#fff' : s.photo ? 'rgb(' + s.photo.r + ',' + s.photo.g + ',' + s.photo.b + ')' : null });
        });
        const series = Object.keys(groups).map((k, i) => ({ label: k, color: COLORS[i % COLORS.length], points: groups[k] }));
        const pts = series.flatMap(s => s.points).filter(p => !p.out);
        const mixed = all.filter(s => s.mix), mixOut = mixed.filter(s => !Q.inFit(s)).length, mixIn = mixed.length - mixOut;
        const f = Q.linFit(pts.map(p => p.x), pts.map(p => p.y));
        const xl = xk === 'heat' ? '가열 시간 (초)' : '요소/구연산 (질량비)';
        drawXY($('xy-chart'), series, xl, Y_INFO[yk][0], f);
        $('xy-fit').innerHTML = (series.length ? '점 색 = 그 시료의 형광 색, 테두리 색: ' + series.map(s => '<span style="color:' + s.color + '">●</span> ' + esc(s.label)).join(' · ') + '<br>' : '') +
            (gc && gc.key !== xk ? '<span class="qd-xhint">ⓘ 우리 조가 바꾼 것은 <b>' + esc(VARS.vars.find(x => x.key === gc.key).name) + '</b>' + (gc.from === 'data' ? '(시료 값으로 짐작)' : '') + '이에요. 지금 가로축은 바꾸지 않은 것이라 직선이 뜻을 잃을 수 있어요. <button type="button" class="secondary" data-xfix="' + gc.key + '">가로축 되돌리기</button></span><br>' : '') +
            (f ? '최소제곱 직선: ' + Y_INFO[yk][0] + ' = ' + fmt(f.a, Y_INFO[yk][1]) + ' + (' + f.b.toPrecision(3) + ') × ' + xl.replace(/ \(.*\)/, '') + ' · 점 ' + f.n + '개, ' +
                (f.n === 2 ? '<b>점이 2개라 직선이 늘 꼭 맞아요</b>(R² 는 뜻이 없어요) — 더 재요' : 'R² = ' + fmt(f.r2, 3))
                : '직선을 그리려면 가로값이 다른 시료가 2개 이상 필요해요.') +
            (mixOut ? '<br>⚠ 시료 ' + mixOut + '개는 두 가지가 바뀌어 직선에서 뺐어요 (속 빈 점).' : '') + (mixIn ? '<br>⚠ 시료 ' + mixIn + '개는 두 가지가 바뀌었지만 직선에 넣었어요.' : '') +
            (yk === 'lambda' && all.some(s => Q.metrics(s).lambdaFrom === 'hue') ? '<br>≈ 표시 시료는 색상으로 구한 추정 파장이 섞여 있어요(분광기 값이 더 정확).' : '');
        const specs = all.filter(s => s.spec && Array.isArray(s.spec.grid) && s.spec.grid.some(v => v != null));
        drawSpectra($('spec-chart'), specs);
        $('spec-legend').innerHTML = specs.length ? specs.map((s, k) => '<span style="color:' + COLORS[k % COLORS.length] + '">━</span> ' + esc((s.ext ? s.source + ' · ' : '') + Q.sampleTitle(s)) + ' (' + fmt(s.spec.peakNm, 0) + ' nm)').join('<br>') + '<br>곡선은 각 시료의 최대를 1 로 맞춘 모양입니다(밝기 비교는 6-2 의 보정 밝기로).' : '';
    }
    $('sel-x').onchange = () => { xManual = true; renderCharts(); }; $('sel-y').onchange = renderCharts;
    $('xy-fit').addEventListener('click', e => { const b = e.target.closest('[data-xfix]'); if (b) { $('sel-x').value = b.dataset.xfix; xManual = false; renderCharts(); } });
    window.addEventListener('resize', () => { if (state.tab === 'result') renderCharts(); });

    function downloadCsv() {
        const blob = new Blob(['﻿' + Q.toCsv(everything())], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'quantum-dot-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    $('btn-csv').onclick = downloadCsv;
    async function importCsv(files) {
        const msgs = [];
        for (const f of files) {
            const r = Q.parseCsv(await f.text());
            if (r.error) { msgs.push('⚠ ' + esc(f.name) + ': ' + esc(r.error)); continue; }
            const samples = {};
            r.samples.forEach((s, i) => { samples['c' + (i + 1)] = s; });
            state.extFile['f:' + f.name] = { from: '📂 ' + f.name, samples };
            msgs.push('✅ ' + esc(f.name) + ': 시료 ' + r.samples.length + '개를 6. 결과에 합쳤습니다.');
        }
        save(); render();
        return { html: msgs.join('<br>'), error: msgs.some(m => m.startsWith('⚠')) };
    }
    $('btn-csv-in').onclick = () => $('file-csv').click();
    $('file-csv').onchange = async e => { const r = await importCsv(Array.from(e.target.files)); $('csv-msg').innerHTML = r.html; e.target.value = ''; };
    $('btn-file-clear').onclick = () => { state.extFile = {}; save(); render(); $('csv-msg').textContent = ''; };

    /* ---------- 7. 결론: 예전 '분석 질문' 칸(이 브라우저에만 저장)은 없앴다. 쓴 글은 보고서 항목에 한 번 옮기고 '예전에 쓴 글' 접기로 보여 줌 ---------- */
    const OLD_Q = {
        q1: ['analysis', '가열 시간 ↔ 봉우리 파장'], q2: ['analysis', '재료 비율 ↔ 파장·밝기'], q5: ['analysis', '색상 파장 ↔ 분광기 파장'],
        q3: ['conclusion', '스토크스 이동'], q4: ['conclusion', '크기 설명이 어디까지 맞나'], q6: ['conclusion', '노출과 보정 밝기']
    };
    function moveOldNotes(rai) {
        let notes = {};
        try { notes = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}') || {}; } catch (e) { notes = {}; }
        const keys = Object.keys(OLD_Q).filter(k => String(notes[k] || '').trim());
        if (!keys.length) return;
        $('old-notes').hidden = false;
        $('old-notes-list').innerHTML = keys.map(k => '<p><b>' + esc(OLD_Q[k][1]) + '</b><br>' + esc(notes[k]).replace(/\n/g, '<br>') + '</p>').join('');
        if (notes.moved || !rai || !rai.setSection) return;
        const hd = rai.flow && rai.flow() === 'hd', st = rai.state();
        const add = {};
        keys.forEach(k => {
            const sec = OLD_Q[k][0] === 'conclusion' && hd ? 'verdict' : OLD_Q[k][0];
            if (String(st.sections[sec] || '').indexOf(String(notes[k]).trim()) >= 0) return;
            (add[sec] = add[sec] || []).push('(예전 분석 질문 · ' + OLD_Q[k][1] + ') ' + String(notes[k]).trim());
        });
        let ok = true;
        Object.keys(add).forEach(sec => { const cur = String(st.sections[sec] || '').trim(); if (!rai.setSection(sec, (cur ? cur + '\n\n' : '') + add[sec].join('\n\n'))) ok = false; });
        if (ok) { notes.moved = new Date().toISOString(); try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch (e) { /* 무시 */ } }
    }
    $('btn-print').onclick = () => window.print();

    /* ---------- 변인 카드 · 예상 ↔ 결과 (보고서 항목 'design' 에 저장, js/report-ai.js) ---------- */
    const VARS = {
        vars: [{ key: 'heat', name: '가열 시간' }, { key: 'ratio', name: '재료 비율 (요소/구연산)' }, { key: 'water', name: '물의 양' }, { key: 'dilution', name: '희석' }, { key: 'light', name: '비춘 빛' }],
        choose: ['heat', 'ratio'],
        measure: '형광 봉우리 파장(색)과 밝기',
        predictQ: '— {var}을(를) 늘리면 봉우리 파장은?',
        predict: [{ key: 'up', label: '길어진다 (빨강 쪽으로)' }, { key: 'down', label: '짧아진다 (파랑 쪽으로)' }, { key: 'same', label: '거의 그대로' }, { key: 'unknown', label: '잘 모르겠다' }],
        result: v => resultFor(v)
    };
    const varVals = s => s ? { heat: s.heatS, ratio: Q.ratioLabel(s) || null, water: s.water, dilution: s.dilution, light: s.light } : null;
    // 바꿀 것에 따라 봉우리 파장이 어느 쪽으로 움직였나 (이 기기 + 같은 조에서 받은 시료 모두, 최소제곱 직선)
    function resultFor(v) {
        if (!v || !v.change) return { text: '4. 과정의 변인 카드에서 바꿀 것을 고르면 여기서 견줘 봐요.' };
        const name = VARS.vars.find(x => x.key === v.change).name;
        const all = everything(), mixed = all.filter(s => s.mix), mixOut = mixed.filter(s => !Q.inFit(s)).length, mixIn = mixed.length - mixOut;
        const mixTxt = (mixOut ? ' ⚠ 시료 ' + mixOut + '개는 두 가지가 바뀌어 뺐어요.' : '') + (mixIn ? ' ⚠ 시료 ' + mixIn + '개는 두 가지가 바뀌었지만 넣었어요.' : '');
        const pts = all.filter(Q.inFit).map(s => { const m = Q.metrics(s); return { x: v.change === 'heat' ? m.heat : m.ratio, y: m.lambda }; }).filter(p => p.x != null && p.y != null);
        const xs = [...new Set(pts.map(p => p.x))];
        if (xs.length < 2) return { text: ReportAI.josa(name, '이', '가') + ' 다른 시료가 2개 이상 있어야 방향을 알 수 있어요 (지금 ' + pts.length + '개). 시료를 더 재거나 같은 조 기기의 시료를 불러와요.' + mixTxt };
        const f = Q.linFit(pts.map(p => p.x), pts.map(p => p.y));
        if (!f) return { text: '직선을 맞추지 못했어요.' };
        const lo = Math.min(...xs), hi = Math.max(...xs), d = f.b * (hi - lo);
        const dir = Math.abs(d) < 5 ? 'same' : d > 0 ? 'up' : 'down';
        const unit = v.change === 'heat' ? '초' : '';
        return { dir, text: ReportAI.josa(name, '을', '를') + ' ' + fmt(lo, v.change === 'heat' ? 0 : 2) + unit + ' → ' + fmt(hi, v.change === 'heat' ? 0 : 2) + unit + '로 늘렸을 때 봉우리 파장이 <b>' + (dir === 'same' ? '거의 그대로' : dir === 'up' ? '길어졌어요' : '짧아졌어요') + '</b> (약 ' + (Math.round(d) > 0 ? '+' : '') + Math.round(d) + ' nm, 점 ' + f.n + '개). 6-2 그래프로 확인해요.' + mixTxt };
    }
    // 두 가지가 함께 바뀐 시료: 지금 재는 시료가 앞 시료와 '바꿀 것' 말고도 다르면 그 변인 이름들(저장할 때 시료에 붙음)
    function mixNow() {
        const v = curVars(), prev = state.samples[state.samples.length - 1];
        return window.ReportAI && ReportAI.changedVars ? ReportAI.changedVars(VARS, varVals(prev), varVals(state.draft), v && v.change) : [];
    }
    // 넣을지 뺄지는 잰 기기(그 시료의 주인)에서 고름 → 시료 자료에 담겨 조원·선생님께 같이 감. 받은 시료는 보기만
    function mixHtml(s, at) {
        const m = s.mix, own = !s.ext, k = 'qd-mix-' + (at || 'a') + '-' + (s.ext ? 'x' : s.no);
        const head = '<p class="qd-mix-q">⚠ <b>두 가지가 바뀌었어요</b> · ' + esc(m.with.join(', ')) + '도 앞 시료와 달라요. 무엇 때문에 달라졌는지 알 수 없어요. <b>직선 맞춤에 넣을까요, 뺄까요? 까닭은?</b></p>';
        if (!own) return '<div class="qd-mix">' + head + '<p class="note">고른 것: <b>' + (m.use === 'in' ? '맞춤에 넣음' : '맞춤에서 뺌') + '</b>' + (m.why ? ' · 까닭: ' + esc(m.why) : '') + ' <span class="note">(고르기는 잰 기기에서)</span></p></div>';
        return '<div class="qd-mix" data-mix-no="' + s.no + '">' + head + '<div class="qd-var-pick">' +
            [['out', '맞춤에서 빼기'], ['in', '맞춤에 넣기']].map(([v, t]) => '<label class="rai-pill' + (m.use === v ? ' on' : '') + '"><input type="radio" name="' + k + '" value="' + v + '" data-mix-use' + (m.use === v ? ' checked' : '') + '> ' + t + '</label>').join('') +
            '</div><input type="text" class="qd-mix-why" data-mix-why maxlength="80" value="' + esc(m.why || '') + '" placeholder="고른 까닭 한 줄" aria-label="고른 까닭"></div>';
    }
    const hasMix = () => everything().some(s => s.mix);
    function mixSample(el) { const b = el.closest('[data-mix-no]'); return b ? state.samples.find(x => x.no === Number(b.dataset.mixNo)) : null; }
    document.addEventListener('change', e => {
        const t = e.target, s = (t.matches('[data-mix-use], [data-mix-why]') && mixSample(t)) || null;
        if (!s || !s.mix) return;
        if (t.matches('[data-mix-use]')) s.mix.use = t.value === 'in' ? 'in' : 'out';
        else s.mix.why = t.value.slice(0, 80);
        save(); renderMine(); render();
        if (share) share.saved();
    });
    // 📱 폰(노트북 QR 로 연 측정 화면): 보고서는 기기마다 따로라 노트북 변인 카드를 읽지 못함 → 폰에서 같은 '바꿀 것'을 한 번 고름(이 폰에 저장)
    function curVars() {
        if (PHONE) return state.phoneChange ? { change: state.phoneChange } : null;
        return window.ReportAI && ReportAI.current && ReportAI.current.vars ? ReportAI.current.vars() : null;
    }
    // 5. 데이터: 고른 '바꿀 것' 말고 다른 값이 앞 시료와 달라지면 ⚠ (막지는 않음)
    function renderVarCheck() {
        const v = curVars(), d = state.draft, prev = state.samples[state.samples.length - 1];
        const name = v && v.change ? VARS.vars.find(x => x.key === v.change).name : '';
        $('var-now').innerHTML = PHONE
            ? '🔀 우리 조가 바꿀 것 <span class="note">(노트북 변인 카드와 같게)</span><span class="qd-var-pick">' + VARS.choose.map(k => '<label class="rai-pill' + (state.phoneChange === k ? ' on' : '') + '"><input type="radio" name="qd-phone-change" value="' + k + '"' + (state.phoneChange === k ? ' checked' : '') + '> ' + esc(VARS.vars.find(x => x.key === k).name) + '</label>').join('') + '</span>'
            : name ? '🔀 우리 조가 바꿀 것: <b>' + esc(name) + '</b> · 나머지는 🔒 같게' : '🔀 바꿀 것을 아직 안 골랐어요 — 4. 과정의 변인 카드에서 골라요';
        const diff = window.ReportAI && ReportAI.changedVars ? ReportAI.changedVars(VARS, varVals(prev), varVals(d), v && v.change) : [];
        const sig = diff.join('|') + '#' + JSON.stringify(varVals(d));
        const show = diff.length && d.varOk !== sig;
        document.querySelectorAll('[data-var-warn]').forEach(el => {
            el.hidden = !show;
            el.innerHTML = show ? '⚠️ <b>두 가지가 함께 바뀌었어요</b> · ' + (name ? '바꿀 것은 <b>' + esc(name) + '</b>인데 ' : '') + '<b>' + diff.map(esc).join(', ') + '</b>도 앞 시료(시료 ' + prev.no + ')와 달라요. 그대로 둘까요?' +
                '<div class="row"><button type="button" class="secondary" data-var-fix>↩ 앞 시료와 같게</button><button type="button" class="secondary" data-var-ok>그대로 둘게요</button></div>' : '';
        });
        el_sig = sig;
    }
    let el_sig = '';
    document.addEventListener('click', e => {
        if (e.target.closest('[data-var-ok]')) { state.draft.varOk = el_sig; save(); renderVarCheck(); }
        else if (e.target.closest('[data-var-fix]')) {
            const v = curVars(), prev = state.samples[state.samples.length - 1];
            if (!prev) return;
            ['heatS', 'citric', 'urea', 'water', 'dilution', 'light'].forEach(k => {
                if (v && v.change === 'heat' && k === 'heatS') return;
                if (v && v.change === 'ratio' && (k === 'citric' || k === 'urea')) return;
                state.draft[k] = prev[k];
            });
            save(); fillForm();
        }
    });
    document.addEventListener('report-ai-vars', () => renderVarCheck());
    $('var-now').addEventListener('change', e => { if (e.target.name === 'qd-phone-change') { state.phoneChange = e.target.value; save(); renderVarCheck(); } });

    /* ---------- 측정 작은 탭 ---------- */
    let measTab = 'sample';
    function onMeasTab(tab) {
        measTab = tab;
        $('cam-card').hidden = !(tab === 'color' || tab === 'spec');
        $('color-box').hidden = tab !== 'color';
        $('spec-box').hidden = tab !== 'spec';
        $('stage-hint').textContent = tab === 'color' ? '빛나는 시료 부분을 눌러 초록 네모를 옮기세요.' : tab === 'spec' ? '무지개 띠의 시작(파랑 쪽)과 끝(빨강 쪽)을 차례로 누르세요.' : '';
        // 카메라 카드를 지금 탭 바로 아래로
        const panel = document.querySelector('.qd-measure .tab-panel[data-tab="' + tab + '"]');
        if (panel && (tab === 'color' || tab === 'spec')) { panel.appendChild($('cam-card')); panel.appendChild($(tab === 'color' ? 'color-box' : 'spec-box')); }
        if (tab === 'save') renderMine();
        if (tab === 'spec') renderCal();
    }

    /* ---------- 단계 ---------- */
    function onStep(step) {
        state.tab = step;
        if (share) share.stepChanged();
        if (step === 'result') render();
    }

    load();
    $('line-thick').value = state.thick; $('line-thick-txt').textContent = state.thick + ' 화소';
    $('roi-size').value = state.roi.size; $('roi-size-txt').textContent = state.roi.size + '%';
    fillForm(); renderMine(); renderCal();

    // ---------- 조 공유 (수업 참여 띠 · 📤 · 📥 · 📱 폰 연결) — docs/class-share.md ----------
    if (window.ClassShare) {
        share = ClassShare.init({
            exp: 'qdot',
            barMount: '#class-bar-mount', shareMount: '#share-mount',
            csvHint: '6. 결과 → CSV 다운로드',
            store: { load: () => state.share, save: o => { state.share = o; save(); } },
            getItems: () => Q.buildItems(state.samples),
            onIncoming: items => {
                const r = Q.applyIncoming(state.ext, items);
                if (r.changed) { state.ext = r.ext; save(); render(); }
                return r.changed;
            },
            getStep: () => state.tab,
            getPoints: () => state.samples.length,
            pollWhen: () => ['data', 'result', 'conclusion'].includes(state.tab),
            incomingCount: () => Q.allSamples([], state.ext).length,
            clearIncoming: () => { state.ext = {}; state.extFile = {}; save(); render(); },
            csvImport: importCsv,
            phone: true,
            onRole: role => { document.body.classList.toggle('qd-phone', role === 'phone'); },
            onPhoneData: n => {
                const el = $('phone-note');
                el.hidden = false;
                el.innerHTML = '🆕 <b>폰에서 새 시료 ' + n + '개</b>가 들어왔어요. <button type="button" class="secondary" data-go="result">6. 결과에서 보기 →</button>';
            },
            deleteItem: id => deleteSample(Number(String(id).replace(/^s/, '')))
        });
    }
    let cardMade = false;
    function deviceKind() { return window.LabUI && LabUI.device ? LabUI.device().kind : 'tablet'; }
    function makePhoneCard() {
        if (cardMade || !share || PHONE || deviceKind() !== 'laptop' || !share.phoneCard) return;
        cardMade = true;
        share.phoneCard('#phone-card');
    }
    makePhoneCard();
    window.addEventListener('lab-device', () => { makePhoneCard(); render(); });
    if (window.LabUI && LabUI.deviceSwitch) LabUI.deviceSwitch('#device-switch');
    tabs = window.LabUI && LabUI.initTabs('#qdTabs', { key: PHONE ? 'quantum-dot-meas-phone' : 'quantum-dot-meas', onShow: onMeasTab });
    steps = window.LabUI && LabUI.initSteps({ key: PHONE ? 'quantum-dot-phone' : 'quantum-dot', start: PHONE ? 'data' : undefined, onShow: onStep, flows: true });
    if (PHONE && steps && state.tab !== 'data') steps.show('data', true);
    if (window.LabUI && LabUI.autoSubtabs) LabUI.autoSubtabs();
    // 📝 보고서 · AI 피드백 + 단계 안 쓰기 칸('우리 생각'·변인 카드). 7단계와 가설연역이 같은 항목 키를 써서 칸이 한 벌만
    if (window.ReportAI) {
        const rai = ReportAI.init({
            exp: 'qdot', mount: '#report-ai', contextFrom: '#tbl, #xy-fit',
            sections: [
                { key: 'problem', name: '우리 생각', step: 'purpose', inline: true, hint: '시료마다 형광 색이 왜 다를까? 실험 전에 떠오른 생각을 한두 줄로.', placeholder: '예: 우리 생각이 실험으로 확인할 수 있는 모양인지 봐 줘.' },
                { key: 'theory', hint: '양자점 크기 ↔ 띠 틈 ↔ 빛의 색, E = hc/λ 를 내 말로.' },
                { key: 'design', name: '변인·예상', step: 'procedure', inline: true, vars: VARS, hint: '바꿀 것은 하나만, 나머지는 같게. 재기 전에 결과를 예상해요.' },
                { key: 'method', hint: '시료 만들기·측정 순서(변인은 4. 과정의 변인 카드에).' },
                { key: 'analysis', asks: ['가열 시간이 길어질수록 봉우리 파장(또는 E)은 어떻게 변했나요? 6-2 그래프의 기울기로 답해요.', '재료 비율(요소의 양)에 따라 파장·보정 밝기는 어떻게 달라졌나요?', '색상으로 구한 파장(≈)과 분광기 봉우리 파장은 얼마나 달랐나요? 차이는 왜 생겼을까요?', () => hasMix() ? '두 가지가 바뀐 시료(⚠)를 어떻게 다뤘나요? 넣거나 뺀 까닭은?' : ''] },
                { key: 'conclusion', asks: ['내 예상과 결과가 같았나요? 달랐다면 무엇 때문일까요? (위 🔮 ↔ 📊)', '비춘 자외선(365 nm, 3.40 eV)과 형광의 에너지 차이(스토크스 이동)는 얼마이고, 왜 생길까요?', '"가열이 길수록 양자점이 커져서 띠 틈이 작아졌다"는 설명은 우리 결과로 어디까지 뒷받침되나요? 2-5 한계를 보고 다른 설명도 들어 봐요.', '노출이 고정되지 않았을 때 사진 밝기를 그대로 견주면 어떤 문제가 생기나요? 보정 밝기로 풀리나요?'] }
            ],
            hdSections: [
                { key: 'problem', hint: '그림에서 본 것·우리 생각에서, 실험으로 답할 수 있는 질문 한 줄.' },
                'hypothesis',
                { key: 'design', vars: VARS, hint: '바꿀 것은 하나만, 나머지는 같게. 재기 전에 결과를 예상해요.' },
                { key: 'analysis', name: '자료 해석', hint: '그래프·맞춤 결과에서 무엇을 읽었는지, 숫자를 들어 쓰세요. 가설과 맞는지 함께.', asks: ['가열 시간이 길어질수록 봉우리 파장(또는 E)은 어떻게 변했나요? 6-2 그래프의 기울기로 답해요.', '재료 비율(요소의 양)에 따라 파장·보정 밝기는 어떻게 달라졌나요?', '색상으로 구한 파장(≈)과 분광기 봉우리 파장은 얼마나 달랐나요?', () => hasMix() ? '두 가지가 바뀐 시료(⚠)를 어떻게 다뤘나요? 넣거나 뺀 까닭은?' : ''] },
                { key: 'verdict', asks: ['내 예상(변인 카드)과 결과가 같았나요? 가설은 지지되나요?', '스토크스 이동(365 nm 와 형광의 에너지 차이)은 얼마이고, 왜 생길까요?', '"가열이 길수록 양자점이 커진다"는 설명은 우리 결과로 어디까지 뒷받침되나요?', '노출이 고정되지 않았을 때 사진 밝기를 그대로 견주면 어떤 문제가 생기나요?'] }
            ]
        });
        moveOldNotes(rai);
    }
    VARS_READY = true;
    renderVarCheck();
    refreshButtons();
    requestAnimationFrame(frame);
})();
