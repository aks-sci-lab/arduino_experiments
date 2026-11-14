// 선생님이 만든 실험 페이지 (projects/custom-lab.html)
//   ?id=문서id      학생 화면: 안내 읽기 → 측정값 넣기 → 그래프 → 제출
//   ?edit=new|문서id 선생님 화면: 실험 만들기·고치기
//   ?record=문서id  제출 내용 보기 (본인 또는 선생님)
// 실험 설정은 Firestore `customExperiments` 에, 학생 제출은 기존 `experiments` 에 저장한다.
// 실험 설정에서 센서 기능을 고르면 Pico 환경 센서 보드를 연결해 시간 그래프를 그린다 (custom-lab-sensor.js).
(function () {
    'use strict';
    const M = window.CustomLabMath;
    const $ = id => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const expId = params.get('id');
    let editId = params.get('edit');
    const recordId = params.get('record');
    const mode = recordId ? 'record' : editId ? 'edit' : expId ? 'view' : 'none';

    const firebaseConfig = {
        projectId: "web-experiment-f9b24",
        appId: "1:718758606428:web:e11ed8d0b64a471ee65899",
        storageBucket: "web-experiment-f9b24.firebasestorage.app",
        apiKey: "AIzaSyCYVme6ZP-iyspRmHTtuUSsKXe7K_D0vJQ",
        authDomain: "web-experiment-f9b24.firebaseapp.com",
        messagingSenderId: "718758606428"
    };
    const TEACHER_EMAIL = 'lany0665@gmail.com';
    const DEFAULT_ROWS = 5;

    let auth = null, db = null, user = null, isTeacher = false;
    let loaded = false;      // 화면에 실험을 띄웠는지
    let loading = false;

    // ---------- 공통 ----------
    function showMessage(text, kind) {
        const el = $('message');
        el.className = kind || 'warn';
        el.textContent = text;
        el.hidden = !text;
    }
    function el(tag, props, children) {
        const e = document.createElement(tag);
        Object.assign(e, props || {});
        (children || []).forEach(c => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
        return e;
    }
    function download(name, text, type) {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const a = el('a', { href: url });
        a.setAttribute('download', name);
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function safeFileName(s) { return (s || '실험').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40); }
    function errorText(e) {
        const code = e && e.code ? String(e.code) : '';
        if (code.includes('permission-denied')) return '권한이 없습니다. (선생님 계정으로 로그인했는지, Firestore 보안 규칙이 배포되었는지 확인하세요)';
        if (code.includes('unavailable') || /offline/i.test(e && e.message || '')) return '인터넷에 연결할 수 없습니다.';
        return (e && e.message) || String(e);
    }

    // ---------- 로그인 ----------
    function signIn() {
        if (!auth) { alert('로그인 기능을 불러오지 못했습니다. 인터넷 연결을 확인하세요.'); return; }
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err => alert('로그인 실패: ' + err.message));
    }
    async function checkIsTeacher(u) {
        if (!u) return false;
        if (u.email === TEACHER_EMAIL) return true;
        try {
            const doc = await db.collection('roles').doc(u.uid).get();
            return doc.exists && doc.data().isTeacher === true;
        } catch (e) { return false; }
    }
    function updateUserBar() {
        $('userInfo').textContent = user ? '👤 ' + (user.displayName || user.email) + (isTeacher ? ' (선생님)' : '') : (auth ? '로그인하지 않음' : '');
        $('btnSignIn').hidden = !auth || !!user;
        if (mode === 'view' && loaded) {
            $('teacherLinks').hidden = !isTeacher;
        }
    }

    function start() {
        $('btnSignIn').addEventListener('click', signIn);
        if (mode === 'none') {
            showMessage('실험이 지정되지 않았습니다. 메인 페이지의 실험 목록에서 실험을 고르세요.');
            $('userInfo').textContent = '';
            return;
        }
        try {
            if (typeof firebase === 'undefined') throw new Error('firebase 없음');
            firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
            db = firebase.firestore();
        } catch (e) {
            auth = null; db = null;
        }
        if (!auth) {
            updateUserBar();
            if (mode === 'view') loadViewOffline('인터넷에 연결할 수 없어 이 기기에 저장된 실험 설정으로 엽니다. 제출은 연결 후에 할 수 있습니다.');
            else showMessage('인터넷에 연결할 수 없어 화면을 불러오지 못했습니다. 연결을 확인하고 새로고침하세요.', 'error');
            return;
        }
        auth.onAuthStateChanged(async u => {
            user = u;
            isTeacher = await checkIsTeacher(u);
            updateUserBar();
            if (!loaded && !loading) {
                loading = true;
                try {
                    if (mode === 'view') await loadView();
                    else if (mode === 'edit') await loadEdit();
                    else await loadRecord();
                } finally { loading = false; }
                updateUserBar();
            }
        });
    }

    // =====================================================================
    // 학생 화면
    // =====================================================================
    const view = {
        def: null, rows: [], answers: [], student: { id: '', name: '' },
        sel: { x: 0, y: 1, fit: 'none' }, submitted: '', readOnly: false, chart: null
    };
    // 센서: fields 고른 측정값, series 기록한 값, live 기록하지 않을 때 보여 주는 최근 값
    const sensor = {
        fields: [], series: { t: [], v: {} }, live: { t: [], v: {} }, latest: null,
        rate: '', conn: null, recording: false, recStart: 0, charts: [], thinnedNote: ''
    };
    const LIVE_POINTS = 300;
    const dataKey = () => 'customLab:v1:' + expId;
    const defKey = () => 'customLabDef:v1:' + expId;

    function readCachedDef() {
        try { const raw = localStorage.getItem(defKey()); return raw ? M.normalizeDefinition(JSON.parse(raw)) : null; }
        catch (e) { return null; }
    }
    function loadViewOffline(note) {
        const cached = readCachedDef();
        if (!cached) { showMessage('인터넷에 연결할 수 없어 실험을 불러오지 못했습니다. 연결을 확인하고 새로고침하세요.', 'error'); return; }
        showMessage(note);
        openView(cached);
    }
    async function loadView() {
        try {
            const doc = await db.collection('customExperiments').doc(expId).get();
            if (!doc.exists) { showMessage('이 실험을 찾을 수 없습니다. 삭제되었거나 주소가 잘못되었습니다.', 'error'); return; }
            const def = M.normalizeDefinition(doc.data());
            try { localStorage.setItem(defKey(), JSON.stringify(def)); } catch (e) { /* 설정 캐시는 없어도 됨 */ }
            showMessage('');
            openView(def);
        } catch (e) {
            const code = e && e.code ? String(e.code) : '';
            if (code.includes('permission-denied')) {
                showMessage(user
                    ? '이 실험은 아직 공개되지 않았거나 없는 실험입니다.'
                    : '이 실험은 아직 공개되지 않았거나 없는 실험입니다. 선생님이라면 위의 "구글 로그인"을 누르세요.');
            } else {
                loadViewOffline('실험 설정을 새로 받지 못해 이 기기에 저장된 설정으로 엽니다. (' + errorText(e) + ')');
            }
        }
    }

    function emptyRow() { return view.def.columns.map(() => ''); }
    function restoreData() {
        const d = view.def;
        view.sel = { x: d.xCol, y: d.yCol, fit: d.fit };
        view.rows = []; view.answers = d.questions.map(() => ''); view.student = { id: '', name: '' }; view.submitted = '';
        sensor.series = M.emptySeries(sensor.fields);
        try {
            const raw = localStorage.getItem(dataKey());
            if (raw) {
                const s = JSON.parse(raw);
                if (Array.isArray(s.rows)) {
                    view.rows = s.rows.slice(0, M.MAX_ROWS).map(r => d.columns.map((_, i) => (Array.isArray(r) && r[i] != null ? String(r[i]) : '')));
                }
                if (Array.isArray(s.answers)) view.answers = d.questions.map((_, i) => (typeof s.answers[i] === 'string' ? s.answers[i] : ''));
                if (s.student) view.student = { id: String(s.student.id || ''), name: String(s.student.name || '') };
                if (s.sel) {
                    const ok = v => Number.isInteger(v) && v >= 0 && v < d.columns.length;
                    if (ok(s.sel.x)) view.sel.x = s.sel.x;
                    if (ok(s.sel.y)) view.sel.y = s.sel.y;
                    if (M.FITS.includes(s.sel.fit)) view.sel.fit = s.sel.fit;
                }
                if (typeof s.submitted === 'string') view.submitted = s.submitted;
                if (sensor.fields.length) {
                    sensor.series = M.normalizeSeries(s.series, sensor.fields);
                    if (typeof s.rate === 'string' && M.SENSORS[d.sensor.mode].rates.some(r => r[0] === s.rate)) sensor.rate = s.rate;
                }
            }
        } catch (e) { /* 깨진 저장값은 무시하고 빈 표로 시작 */ }
        while (view.rows.length < DEFAULT_ROWS) view.rows.push(emptyRow());
    }
    let saveTimer = null;
    function saveSoon() {
        if (view.readOnly) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 300);
    }
    function saveNow() {
        if (view.readOnly) return;
        try {
            localStorage.setItem(dataKey(), JSON.stringify({
                v: 1, rows: view.rows, answers: view.answers, student: view.student, sel: view.sel, submitted: view.submitted,
                series: sensor.fields.length ? sensor.series : undefined, rate: sensor.rate || undefined
            }));
            $('saveStatus').textContent = '';
        } catch (e) {
            $('saveStatus').textContent = '⚠ 이 기기에 저장하지 못했습니다 (사생활 보호 모드이거나 저장 공간 부족). 새로고침하면 값이 사라지니 CSV 저장을 해 두세요.';
        }
    }

    function openView(def) {
        view.def = def;
        document.title = def.title + ' | 센서 기반 실험실';
        $('title').textContent = def.title;
        $('description').textContent = def.description;
        const useSteps = def.layout === 'steps' && !view.readOnly;   // 제출 내용 보기는 늘 한 화면
        $('descHeading').textContent = useSteps ? '🎯 목적 · 실험 안내' : '📖 실험 안내';
        $('descCard').hidden = !useSteps && !def.description.trim();
        M.STEP_TEXTS.forEach(k => {
            const text = def.stepTexts[k] || '';
            $(k + 'Text').textContent = text;
            $(k + 'Card').hidden = !useSteps && !text.trim();
        });
        sensor.fields = M.sensorFields(def.sensor);
        if (sensor.fields.length) sensor.rate = M.SENSORS[def.sensor.mode].rates[0][0];
        if (!view.readOnly) {
            restoreData();
            $('draftNotice').hidden = def.published;
            $('editLink').href = 'custom-lab.html?edit=' + encodeURIComponent(expId);
        }
        $('stId').value = view.student.id;
        $('stName').value = view.student.name;
        renderTable();
        renderSelectors();
        renderQuestions();
        $('graphCard').hidden = def.columns.length < 2;
        if (view.submitted && !view.readOnly) $('submitStatus').textContent = '마지막 제출: ' + view.submitted;
        if (view.readOnly) {
            ['stId', 'stName'].forEach(id => { $(id).readOnly = true; });
            $('tableHelp').hidden = true;
            $('btnAddRow').hidden = true; $('btnClear').hidden = true;
            $('submitCard').hidden = true;
        }
        $('viewSection').hidden = false;
        loaded = true;
        refreshGraph();
        setupSensor();
        if (useSteps) arrangeSteps();
    }

    // ---------- 7단계 화면: 카드를 보고서 순서의 단계로 나눠 담는다 (카드·id 는 그대로) ----------
    const STEP_CARDS = {
        purpose: ['descCard', 'studentCard'],
        theory: ['theoryCard'],
        materials: ['materialsCard'],
        procedure: ['procedureCard'],
        data: ['sensorCard', 'tableCard'],
        result: ['graphCard'],
        conclusion: ['questionCard', 'submitCard']
    };
    const STEP_NAMES = { purpose: '1. 목적', theory: '2. 이론', materials: '3. 준비물', procedure: '4. 과정', data: '5. 데이터', result: '6. 결과', conclusion: '7. 결론' };
    let stepsArranged = false;
    function arrangeSteps() {
        if (stepsArranged) return;
        stepsArranged = true;
        const order = Object.keys(STEP_CARDS);
        const anchor = $('teacherLinks');
        const note = text => el('div', { className: 'card' }, [el('p', { className: 'step-empty', textContent: text })]);
        order.forEach((step, i) => {
            const panel = el('section', { className: 'step-panel' });
            panel.dataset.step = step;
            // 칸을 먼저 페이지에 붙여야 옮긴 카드를 $(id) 로 다시 찾을 수 있다
            anchor.parentNode.insertBefore(panel, anchor);
            STEP_CARDS[step].forEach(id => panel.appendChild($(id)));
            if (M.STEP_TEXTS.includes(step) && !(view.def.stepTexts[step] || '').trim()) {
                $(step + 'Text').replaceChildren(el('p', { className: 'step-empty', textContent: '선생님이 이 단계에 따로 적은 내용이 없습니다. 다음 단계로 넘어가세요.' }));
            }
            if (step === 'result' && $('graphCard').hidden) panel.appendChild(note('이 실험에는 그래프가 없습니다. 5. 데이터의 표를 보고 7. 결론으로 넘어가세요.'));
            if (step === 'conclusion' && $('questionCard').hidden) panel.insertBefore(note('측정한 결과로 알게 된 점을 정리한 뒤 제출하세요.'), panel.firstChild);
            const nav = el('div', { className: 'step-next no-print' });
            if (i > 0) { const b = el('button', { textContent: '← 이전' }); b.dataset.go = order[i - 1]; nav.appendChild(b); }
            if (i < order.length - 1) { const b = el('button', { className: 'primary', textContent: '다음: ' + STEP_NAMES[order[i + 1]] + ' →' }); b.dataset.go = order[i + 1]; nav.appendChild(b); }
            panel.appendChild(nav);
        });
        $('stepNav').hidden = false;
        LabUI.initSteps({ key: 'custom-lab:' + expId, onShow: step => { if (step === 'result') refreshGraph(); } });
    }

    // ---------- 센서 (실험 설정에서 센서 기능을 고른 경우) ----------
    function setupSensor() {
        const mode = view.def.sensor.mode;
        if (!sensor.fields.length) { $('sensorCard').hidden = true; return; }
        const config = M.SENSORS[mode];
        $('sensorCard').hidden = false;
        $('sensorName').textContent = '— ' + config.label;
        const readouts = $('sensorReadouts'), charts = $('sensorCharts');
        readouts.textContent = ''; charts.textContent = '';
        sensor.charts = [];
        sensor.live = M.emptySeries(sensor.fields);
        sensor.fields.forEach(f => {
            const value = el('div', { className: 'v', textContent: '--' });
            value.dataset.key = f.key;
            readouts.appendChild(el('div', { className: 'readout' }, [
                el('div', { className: 'k', textContent: f.name }), value, el('div', { className: 'k', textContent: f.unit })
            ]));
            const canvas = el('canvas');
            canvas.setAttribute('aria-label', f.name + ' 시간 그래프');
            charts.appendChild(el('div', { className: 'sensor-chart' }, [canvas]));
            if (typeof Chart !== 'undefined') {
                sensor.charts.push(new Chart(canvas.getContext('2d'), {
                    type: 'scatter',
                    data: { datasets: [{ label: f.name + ' (' + f.unit + ')', data: [], showLine: true, borderColor: '#007BFF', backgroundColor: '#007BFF', borderWidth: 1.5, pointRadius: 0 }] },
                    options: {
                        animation: false, responsive: true, maintainAspectRatio: false, parsing: false,
                        scales: { x: { type: 'linear', title: { display: true, text: '시간 (s)' } }, y: { title: { display: true, text: f.name + ' (' + f.unit + ')' } } },
                        plugins: { legend: { display: false } }
                    }
                }));
            }
        });
        if (typeof Chart === 'undefined') charts.appendChild(el('p', { className: 'muted', textContent: '그래프 도구를 불러오지 못했습니다 (인터넷 연결 확인). 값 표시와 기록·CSV 저장은 그대로 쓸 수 있습니다.' }));
        if (view.readOnly) {
            $('sensorButtons').hidden = true; $('sensorReadouts').hidden = true;
            $('btnRec').hidden = true; $('btnToTable').hidden = true; $('btnSeriesClear').hidden = true;
            $('sensorStatus').textContent = '';
        } else {
            const sel = $('selRate');
            sel.textContent = '';
            config.rates.forEach(r => sel.appendChild(el('option', { value: r[0], textContent: r[1] })));
            sel.value = sensor.rate;
            sel.disabled = config.rates.length < 2;
            // 표에 같은 이름의 열이 있을 때만 "표에 넣기"를 쓴다
            $('btnToTable').hidden = !sensor.fields.some(f => columnIndexFor(f) >= 0);
            const reason = CustomLabSensor.unsupportedReason();
            $('btnSensorConnect').disabled = !!reason;
            $('sensorStatus').textContent = reason ? '⚠ ' + reason : '센서 보드의 전원을 켜고 "센서 연결"을 누르세요.';
            sensor.conn = CustomLabSensor.create({
                mode, rate: sensor.rate,
                onSample: handleSensorSample,
                onStatus: text => { $('sensorStatus').textContent = text; },
                onState: connected => {
                    $('btnSensorConnect').hidden = connected;
                    $('btnSensorDisconnect').hidden = !connected;
                    if (!connected) {
                        if (sensor.recording) stopRecording('연결이 끊어져 기록을 멈췄습니다.');
                        sensor.latest = null;
                        $('sensorReadouts').querySelectorAll('.v').forEach(v => { v.textContent = '--'; });
                    }
                    updateSensorButtons();
                }
            });
        }
        updateSensorButtons();
        drawSensor();
    }
    function columnIndexFor(field) {
        return view.def.columns.findIndex(c => c.name === field.name);
    }
    function updateSensorButtons() {
        const has = sensor.series.t.length > 0;
        const connected = !!(sensor.conn && sensor.conn.isConnected());
        $('btnRec').disabled = !connected || !sensor.latest;
        $('btnRec').textContent = sensor.recording ? '■ 기록 중지' : '● 기록 시작';
        $('btnRec').className = sensor.recording ? 'rec' : '';
        $('btnToTable').disabled = !connected || !sensor.latest;
        $('btnSeriesCsv').disabled = sensor.recording || !has;
        $('btnSeriesClear').disabled = sensor.recording || !has;
        let info = '';
        if (sensor.recording) info = '기록 중: ' + sensor.series.t.length + '점';
        else if (has) info = '기록한 값: ' + M.seriesSummary(sensor.series, sensor.fields) + (sensor.thinnedNote ? ' ' + sensor.thinnedNote : '');
        else if (!view.readOnly) info = '연결하면 지금 값이 그래프에 보입니다. "기록 시작"을 누르면 그때부터의 값이 저장되어 제출에 포함됩니다.';
        else info = '이 제출에는 센서 기록이 없습니다.';
        $('sensorInfo').textContent = info;
    }
    function handleSensorSample(sample) {
        sensor.latest = sample;
        // 연결이 다시 시작되어 시간이 0 으로 돌아가면 최근 값 그래프를 새로 그린다
        const live = sensor.live;
        if (live.t.length && sample.t < live.t[live.t.length - 1]) sensor.live = M.emptySeries(sensor.fields);
        sensor.live.t.push(sample.t);
        sensor.fields.forEach(f => sensor.live.v[f.key].push(sample.values[f.key]));
        if (sensor.live.t.length > LIVE_POINTS) {
            sensor.live.t.shift();
            sensor.fields.forEach(f => sensor.live.v[f.key].shift());
        }
        if (sensor.recording) {
            if (!sensor.series.t.length) sensor.recStart = sample.t;
            sensor.series.t.push(Math.round((sample.t - sensor.recStart) * 1000) / 1000);
            sensor.fields.forEach(f => sensor.series.v[f.key].push(sample.values[f.key]));
            if (sensor.series.t.length >= M.MAX_SERIES) stopRecording('기록할 수 있는 점 수(' + M.MAX_SERIES + '개)를 채워 기록을 멈췄습니다.');
        }
        sensorDrawSoon();
    }
    let sensorTimer = null;
    function sensorDrawSoon() { if (!sensorTimer) sensorTimer = setTimeout(() => { sensorTimer = null; drawSensor(); }, 250); }
    function drawSensor() {
        if (!sensor.fields.length) return;
        if (sensor.latest) {
            $('sensorReadouts').querySelectorAll('.v').forEach(v => {
                const f = sensor.fields.find(x => x.key === v.dataset.key);
                v.textContent = M.sensorValueText(sensor.latest.values[f.key], f.digits) || '준비 중';
            });
        }
        // 기록 중이거나 기록한 값이 있으면 그 기록을, 아니면 최근 값을 그린다
        const src = (sensor.recording || sensor.series.t.length) ? sensor.series : sensor.live;
        sensor.charts.forEach((chart, i) => {
            const key = sensor.fields[i].key;
            const pts = [];
            for (let k = 0; k < src.t.length; k++) if (src.v[key][k] !== null) pts.push({ x: src.t[k], y: src.v[key][k] });
            chart.data.datasets[0].data = pts;
            chart.update('none');
        });
        updateSensorButtons();
    }
    function stopRecording(note) {
        sensor.recording = false;
        saveNow();
        drawSensor();
        if (note) $('sensorInfo').textContent = note + ' ' + $('sensorInfo').textContent;
    }
    function bindSensor() {
        $('btnSensorConnect').addEventListener('click', () => { if (sensor.conn) sensor.conn.connect(); });
        $('btnSensorDisconnect').addEventListener('click', () => { if (sensor.conn) sensor.conn.disconnect(); });
        $('selRate').addEventListener('change', () => {
            sensor.rate = $('selRate').value;
            if (sensor.conn) sensor.conn.setRate(sensor.rate);
            saveSoon();
        });
        $('btnRec').addEventListener('click', () => {
            if (sensor.recording) { stopRecording(''); return; }
            if (sensor.series.t.length && !confirm('앞서 기록한 센서 값을 지우고 새로 기록할까요? (남기려면 먼저 "센서 기록 CSV"로 저장하세요)')) return;
            sensor.series = M.emptySeries(sensor.fields);
            sensor.thinnedNote = '';
            sensor.recording = true;
            drawSensor();
        });
        $('btnSeriesClear').addEventListener('click', () => {
            if (!confirm('기록한 센서 값을 지울까요?')) return;
            sensor.series = M.emptySeries(sensor.fields);
            sensor.thinnedNote = '';
            saveNow(); drawSensor();
        });
        $('btnSeriesCsv').addEventListener('click', () => {
            download(safeFileName(view.def.title) + '_센서.csv', M.seriesToCsv(sensor.series, sensor.fields), 'text/csv;charset=utf-8');
        });
        // 지금 센서 값을, 이름이 같은 열의 첫 빈 행에 넣는다 (다른 열은 학생이 직접 채움)
        $('btnToTable').addEventListener('click', () => {
            if (!sensor.latest) return;
            const targets = sensor.fields.map(f => ({ f, c: columnIndexFor(f) })).filter(x => x.c >= 0);
            if (!targets.length) return;
            let r = view.rows.findIndex(row => targets.every(x => String(row[x.c]).trim() === ''));
            if (r < 0) {
                if (view.rows.length >= M.MAX_ROWS) { alert('행은 최대 ' + M.MAX_ROWS + '개까지 넣을 수 있습니다.'); return; }
                view.rows.push(emptyRow());
                r = view.rows.length - 1;
            }
            targets.forEach(x => { view.rows[r][x.c] = M.sensorValueText(sensor.latest.values[x.f.key], x.f.digits); });
            renderTable(); saveSoon(); refreshGraph();
            $('sensorInfo').textContent = (r + 1) + '행에 지금 값을 넣었습니다: ' + targets.map(x => x.f.name + ' ' + view.rows[r][x.c] + ' ' + x.f.unit).join(', ');
        });
    }

    function renderTable() {
        const cols = view.def.columns;
        const table = $('dataTable');
        table.textContent = '';
        const head = el('tr', {}, [el('th', { textContent: '#' })]);
        cols.forEach(c => head.appendChild(el('th', { textContent: M.columnLabel(c) })));
        if (!view.readOnly) head.appendChild(el('th', { textContent: '' }));
        table.appendChild(el('thead', {}, [head]));
        const body = el('tbody');
        view.rows.forEach((row, r) => {
            const tr = el('tr', {}, [el('td', { className: 'num', textContent: String(r + 1) })]);
            cols.forEach((c, ci) => {
                const input = el('input', { type: 'text', value: row[ci] || '', readOnly: view.readOnly });
                input.setAttribute('inputmode', 'text');
                input.setAttribute('aria-label', (r + 1) + '행 ' + c.name);
                input.dataset.r = r; input.dataset.c = ci;
                tr.appendChild(el('td', {}, [input]));
            });
            if (!view.readOnly) {
                const del = el('button', { textContent: '✕', title: '이 행 지우기' });
                del.dataset.del = r;
                tr.appendChild(el('td', {}, [del]));
            }
            body.appendChild(tr);
        });
        table.appendChild(body);
    }
    function renderSelectors() {
        ['selX', 'selY'].forEach(id => {
            const sel = $(id);
            sel.textContent = '';
            view.def.columns.forEach((c, i) => sel.appendChild(el('option', { value: String(i), textContent: M.columnLabel(c) })));
        });
        $('selX').value = String(view.sel.x);
        $('selY').value = String(view.sel.y);
        $('selFit').value = view.sel.fit;
    }
    function renderQuestions() {
        const box = $('questions');
        box.textContent = '';
        const qs = view.def.questions;
        $('questionCard').hidden = !qs.length;
        qs.forEach((q, i) => {
            const ta = el('textarea', { value: view.answers[i] || '', readOnly: view.readOnly });
            ta.dataset.q = i;
            ta.setAttribute('aria-label', '질문 ' + (i + 1) + ' 답');
            box.appendChild(el('label', { className: 'f', textContent: (i + 1) + '. ' + q }));
            box.appendChild(ta);
        });
    }

    function currentFit() {
        const pts = M.pointsFromRows(view.rows, view.sel.x, view.sel.y);
        return { pts, result: M.fit(pts, view.sel.fit) };
    }
    function refreshGraph() {
        if (!view.def || view.def.columns.length < 2) return;
        const cols = view.def.columns;
        const xc = cols[view.sel.x], yc = cols[view.sel.y];
        // 가로축·세로축 열에 숫자가 아닌 값이 있으면 노랗게 표시
        $('dataTable').querySelectorAll('input').forEach(inp => {
            const c = +inp.dataset.c;
            const used = c === view.sel.x || c === view.sel.y;
            inp.classList.toggle('bad', used && inp.value.trim() !== '' && M.parseNumber(inp.value) === null);
        });
        const { pts, result } = currentFit();
        let msg = '';
        if (view.sel.x === view.sel.y) msg = '가로축과 세로축에 서로 다른 열을 고르세요.';
        else if (!pts.length) msg = '가로축·세로축 열에 숫자를 넣으면 그래프가 그려집니다.';
        const fitEl = $('fitResult');
        if (view.sel.fit === 'none') fitEl.textContent = '';
        else if (result) fitEl.textContent = '맞춤 결과: ' + M.fitText(result, xc.name, yc.name);
        else fitEl.textContent = pts.length < 2 ? '맞춤을 하려면 점이 2개 이상 필요합니다.' : '가로축 값이 모두 같아 맞춤을 할 수 없습니다.';

        if (typeof Chart === 'undefined') {
            $('chartBox').hidden = true;
            $('chartMsg').textContent = '그래프 도구를 불러오지 못했습니다 (인터넷 연결 확인). 표와 맞춤 결과는 그대로 쓸 수 있습니다.';
            return;
        }
        $('chartMsg').textContent = msg;
        const datasets = [{
            label: '측정값', data: view.sel.x === view.sel.y ? [] : pts,
            backgroundColor: '#007BFF', pointRadius: 5, showLine: false
        }];
        if (result && view.sel.x !== view.sel.y) {
            let x0 = Math.min.apply(null, pts.map(p => p.x)), x1 = Math.max.apply(null, pts.map(p => p.x));
            if (result.kind === 'proportional') { x0 = Math.min(0, x0); x1 = Math.max(0, x1); }
            datasets.push({
                label: '맞춤 직선',
                data: [{ x: x0, y: result.slope * x0 + result.intercept }, { x: x1, y: result.slope * x1 + result.intercept }],
                borderColor: '#DC3545', borderWidth: 2, pointRadius: 0, showLine: true, fill: false
            });
        }
        if (!view.chart) {
            view.chart = new Chart($('chart').getContext('2d'), {
                type: 'scatter',
                data: { datasets },
                options: {
                    animation: false, responsive: true, maintainAspectRatio: false,
                    scales: { x: { title: { display: true, text: '' } }, y: { title: { display: true, text: '' } } },
                    plugins: { legend: { display: true } }
                }
            });
        }
        view.chart.data.datasets = datasets;
        view.chart.options.scales.x.title.text = M.columnLabel(xc);
        view.chart.options.scales.y.title.text = M.columnLabel(yc);
        view.chart.update();
    }
    let graphTimer = null;
    function graphSoon() { clearTimeout(graphTimer); graphTimer = setTimeout(refreshGraph, 200); }

    function tableText() {   // 스프레드시트 붙여넣기용 (탭 구분)
        const cols = view.def.columns;
        const lines = [cols.map(c => M.columnLabel(c)).join('\t')];
        view.rows.forEach(r => { if (r.some(c => String(c).trim() !== '')) lines.push(r.join('\t')); });
        return lines.join('\n');
    }
    function summaryText() {
        const n = M.filledRowCount(view.rows);
        const { result } = currentFit();
        const cols = view.def.columns;
        let s = '측정 ' + n + '행';
        if (result) s += ' · ' + M.fitText(result, cols[view.sel.x].name, cols[view.sel.y].name);
        if (sensor.series.t.length) s += ' · ' + M.seriesSummary(sensor.series, sensor.fields);
        return s;
    }

    function bindView() {
        const table = $('dataTable');
        table.addEventListener('input', e => {
            const t = e.target;
            if (t.tagName !== 'INPUT' || view.readOnly) return;
            view.rows[+t.dataset.r][+t.dataset.c] = t.value;
            saveSoon(); graphSoon();
        });
        table.addEventListener('click', e => {
            const t = e.target;
            if (t.dataset.del === undefined || view.readOnly) return;
            view.rows.splice(+t.dataset.del, 1);
            while (view.rows.length < 1) view.rows.push(emptyRow());
            renderTable(); saveSoon(); refreshGraph();
        });
        // 엑셀·한셀·구글 시트에서 복사한 표를 누른 칸부터 채운다
        table.addEventListener('paste', e => {
            const t = e.target;
            if (t.tagName !== 'INPUT' || view.readOnly) return;
            const text = (e.clipboardData || window.clipboardData).getData('text');
            if (!/[\t\n]/.test(text.replace(/[\r\n]+$/, ''))) return;   // 값 하나는 평소처럼
            e.preventDefault();
            const grid = M.parsePaste(text);
            const r0 = +t.dataset.r, c0 = +t.dataset.c, nCols = view.def.columns.length;
            let cut = false;
            grid.forEach((line, i) => {
                const r = r0 + i;
                if (r >= M.MAX_ROWS) { cut = true; return; }
                while (view.rows.length <= r) view.rows.push(emptyRow());
                line.forEach((val, j) => { if (c0 + j < nCols) view.rows[r][c0 + j] = val; else if (val) cut = true; });
            });
            renderTable(); saveSoon(); refreshGraph();
            $('saveStatus').textContent = cut ? '⚠ 붙여넣은 표가 커서 일부(표의 열 수, 최대 ' + M.MAX_ROWS + '행을 넘는 부분)는 들어가지 않았습니다.' : '';
        });
        $('btnAddRow').addEventListener('click', () => {
            if (view.rows.length >= M.MAX_ROWS) { alert('행은 최대 ' + M.MAX_ROWS + '개까지 넣을 수 있습니다.'); return; }
            view.rows.push(emptyRow());
            renderTable(); saveSoon(); refreshGraph();
            const inputs = $('dataTable').querySelectorAll('tbody tr:last-child input');
            if (inputs[0]) inputs[0].focus();
        });
        $('btnClear').addEventListener('click', () => {
            if (!confirm('표의 값을 모두 지울까요? (질문의 답과 학번·이름은 남습니다)')) return;
            view.rows = []; while (view.rows.length < DEFAULT_ROWS) view.rows.push(emptyRow());
            renderTable(); saveSoon(); refreshGraph();
        });
        $('btnCsv').addEventListener('click', () => {
            download(safeFileName(view.def.title) + '.csv', M.toCsv(view.def.columns, view.rows), 'text/csv;charset=utf-8');
        });
        $('btnCopy').addEventListener('click', async () => {
            const text = tableText();
            try {
                await navigator.clipboard.writeText(text);
                $('saveStatus').textContent = '표를 복사했습니다. 스프레드시트에 붙여넣으세요.';
            } catch (e) {
                const ta = el('textarea', { value: text });
                document.body.appendChild(ta); ta.select();
                let ok = false;
                try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
                ta.remove();
                $('saveStatus').textContent = ok ? '표를 복사했습니다. 스프레드시트에 붙여넣으세요.' : '⚠ 복사하지 못했습니다. CSV 저장을 이용하세요.';
            }
        });
        ['selX', 'selY', 'selFit'].forEach(id => $(id).addEventListener('change', () => {
            view.sel = { x: +$('selX').value, y: +$('selY').value, fit: $('selFit').value };
            saveSoon(); refreshGraph();
        }));
        ['stId', 'stName'].forEach(id => $(id).addEventListener('input', () => {
            view.student = { id: $('stId').value, name: $('stName').value };
            saveSoon();
        }));
        $('questions').addEventListener('input', e => {
            if (e.target.dataset.q === undefined) return;
            view.answers[+e.target.dataset.q] = e.target.value;
            saveSoon();
        });
        $('btnPrint').addEventListener('click', () => window.print());
        $('btnSubmit').addEventListener('click', submit);
        window.addEventListener('beforeunload', () => { if (loaded && mode === 'view') { clearTimeout(saveTimer); saveNow(); } });
    }

    async function submit() {
        const status = $('submitStatus');
        if (!auth) { alert('제출 기능을 불러오지 못했습니다. 인터넷 연결을 확인하거나 CSV 저장·인쇄를 이용하세요.'); return; }
        if (!user) { alert('먼저 구글 로그인을 하세요.'); signIn(); return; }
        if (!view.student.id.trim() || !view.student.name.trim()) {
            alert('학번과 이름을 넣으세요.');
            $(view.student.id.trim() ? 'stName' : 'stId').focus();
            return;
        }
        if (sensor.recording) { alert('센서 기록을 먼저 멈추세요.'); return; }
        if (!M.filledRowCount(view.rows) && !sensor.series.t.length) {
            alert(sensor.fields.length ? '표에 측정값을 넣거나 센서 값을 기록한 뒤 제출하세요.' : '측정값을 한 행 이상 넣으세요.');
            return;
        }
        const emptyAnswers = view.def.questions.filter((_, i) => !(view.answers[i] || '').trim()).length;
        if (emptyAnswers && !confirm('답을 쓰지 않은 질문이 ' + emptyAnswers + '개 있습니다. 그래도 제출할까요?')) return;
        const btn = $('btnSubmit');
        try {
            btn.disabled = true; btn.textContent = '제출 중...';
            const d = view.def;
            // 센서 기록이 길면 제출용으로 고르게 솎아 낸다 (이 기기의 기록과 CSV 는 그대로)
            const thin = M.thinSeries(sensor.series, M.MAX_SUBMIT_SERIES);
            await db.collection('experiments').add({
                userId: user.uid,
                userEmail: user.email,
                userName: user.displayName || '',
                experimentName: d.title,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                tab: 'custom-lab',
                customId: expId,
                dataSummary: view.student.id.trim() + ' ' + view.student.name.trim() + ' · ' + summaryText(),
                // 제출 시점의 실험 설정과 값을 그대로 담아, 나중에 실험을 고치거나 지워도 제출 내용을 볼 수 있게 한다
                customJson: JSON.stringify({
                    v: 1,
                    def: { title: d.title, description: d.description, columns: d.columns, questions: d.questions, xCol: d.xCol, yCol: d.yCol, fit: d.fit, sensor: d.sensor, layout: d.layout, stepTexts: d.stepTexts },
                    series: sensor.series.t.length ? thin.series : undefined,
                    seriesThinned: thin.thinned ? sensor.series.t.length : undefined,
                    rows: view.rows.filter(r => r.some(c => String(c).trim() !== '')),
                    answers: view.answers, student: view.student, sel: view.sel
                }),
                // 현재 firestore.rules 가 요구하는 칸 (이 실험에서는 쓰지 않음)
                weatherSample: {},
                stargazingSample: []
            });
            view.submitted = new Date().toLocaleString('ko-KR');
            saveNow();
            status.className = 'ok';
            status.textContent = '✅ 제출했습니다 (' + view.submitted + '). 메인 페이지의 기록 목록에서 확인할 수 있습니다.';
        } catch (e) {
            status.className = 'error';
            status.textContent = '❌ 제출 실패: ' + errorText(e);
        } finally {
            btn.disabled = false; btn.textContent = '📤 선생님께 제출';
        }
    }

    // =====================================================================
    // 제출 내용 보기
    // =====================================================================
    async function loadRecord() {
        if (!user) { showMessage('제출 내용을 보려면 위의 "구글 로그인"을 누르세요.'); return; }
        try {
            const doc = await db.collection('experiments').doc(recordId).get();
            if (!doc.exists) { showMessage('제출 기록을 찾을 수 없습니다.', 'error'); return; }
            const data = doc.data();
            let payload = null;
            try { payload = JSON.parse(data.customJson); } catch (e) { payload = null; }
            if (!payload || !payload.def) { showMessage('이 기록에는 볼 수 있는 실험 내용이 없습니다.', 'error'); return; }
            const def = M.normalizeDefinition(Object.assign({}, payload.def, { published: true }));
            view.readOnly = true;
            view.rows = (Array.isArray(payload.rows) ? payload.rows : []).map(r => def.columns.map((_, i) => (Array.isArray(r) && r[i] != null ? String(r[i]) : '')));
            view.answers = def.questions.map((_, i) => (payload.answers && typeof payload.answers[i] === 'string' ? payload.answers[i] : ''));
            view.student = { id: String(payload.student && payload.student.id || ''), name: String(payload.student && payload.student.name || '') };
            const ok = v => Number.isInteger(v) && v >= 0 && v < def.columns.length;
            view.sel = {
                x: payload.sel && ok(payload.sel.x) ? payload.sel.x : def.xCol,
                y: payload.sel && ok(payload.sel.y) ? payload.sel.y : def.yCol,
                fit: payload.sel && M.FITS.includes(payload.sel.fit) ? payload.sel.fit : def.fit
            };
            const recFields = M.sensorFields(def.sensor);
            sensor.fields = recFields;
            sensor.series = M.normalizeSeries(payload.series, recFields);
            sensor.thinnedNote = payload.seriesThinned ? '(기록한 ' + payload.seriesThinned + '점을 고르게 줄여 제출함)' : '';
            const when = data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().toLocaleString('ko-KR') : '';
            const info = $('recordInfo');
            info.textContent = '📄 제출 내용 보기 — ' + (data.userEmail || '') + (when ? ' · ' + when : '') + ' (고칠 수 없습니다)';
            info.hidden = false;
            showMessage('');
            openView(def);
        } catch (e) {
            showMessage('제출 기록을 불러오지 못했습니다: ' + errorText(e), 'error');
        }
    }

    // =====================================================================
    // 선생님: 실험 만들기 · 고치기
    // =====================================================================
    const ed = { columns: [], questions: [], existing: null, sensorFields: [] };

    function renderEdSensor() {
        const mode = $('edSensorMode').value;
        const box = $('edSensorFields');
        box.textContent = '';
        if (mode === 'none') { $('edSensorHelp').textContent = ''; return; }
        M.SENSORS[mode].fields.forEach(f => {
            const cb = el('input', { type: 'checkbox', checked: ed.sensorFields.includes(f[0]) });
            cb.dataset.key = f[0];
            cb.addEventListener('change', () => {
                ed.sensorFields = Array.from(box.querySelectorAll('input')).filter(i => i.checked).map(i => i.dataset.key);
                // 고른 측정값과 이름이 같은 열을 표에 만들어 두면, 학생이 "지금 값을 표에 넣기"를 쓸 수 있다
                if (cb.checked && !ed.columns.some(c => c.name.trim() === f[1])) {
                    const blank = ed.columns.findIndex(c => !c.name.trim() && !c.unit.trim());
                    if (blank >= 0) ed.columns[blank] = { name: f[1], unit: f[2] };
                    else if (ed.columns.length < M.MAX_COLS) ed.columns.push({ name: f[1], unit: f[2] });
                    renderEdColumns(); renderEdSelectors();
                }
            });
            box.appendChild(el('label', {}, [cb, ' ' + f[1] + ' (' + f[2] + ')']));
        });
        $('edSensorHelp').textContent = '값을 고르면 같은 이름의 열이 표에 생깁니다. 학생은 "지금 값을 표에 넣기"로 센서 값을 그 열에 넣고, 나머지 열(예: 거리)은 직접 적습니다. 필요 없으면 그 열을 지워도 됩니다. 센서 연결은 PC·안드로이드의 크롬·엣지에서만 됩니다.';
    }

    function renderEdColumns() {
        const box = $('edColumns');
        box.textContent = '';
        ed.columns.forEach((c, i) => {
            const name = el('input', { type: 'text', className: 'cname', value: c.name, maxLength: 30, placeholder: '이름 (예: 전압)' });
            const unit = el('input', { type: 'text', className: 'cunit', value: c.unit, maxLength: 15, placeholder: '단위 (예: V)' });
            name.setAttribute('aria-label', (i + 1) + '번째 열 이름');
            unit.setAttribute('aria-label', (i + 1) + '번째 열 단위');
            name.addEventListener('input', () => { c.name = name.value; renderEdSelectors(); });
            unit.addEventListener('input', () => { c.unit = unit.value; renderEdSelectors(); });
            const del = el('button', { textContent: '✕', title: '이 열 지우기' });
            del.addEventListener('click', () => {
                const x = +$('edX').value, y = +$('edY').value;
                ed.columns.splice(i, 1);
                renderEdColumns();
                // 지운 열 뒤의 축 선택은 한 칸 당긴다
                renderEdSelectors(x > i ? x - 1 : x, y > i ? y - 1 : y);
            });
            box.appendChild(el('div', { className: 'col-row' }, [name, unit, del]));
        });
        $('btnAddCol').disabled = ed.columns.length >= M.MAX_COLS;
    }
    function renderEdSelectors(x, y) {
        const keepX = x !== undefined ? x : +$('edX').value || 0;
        const keepY = y !== undefined ? y : ($('edY').value === '' ? 1 : +$('edY').value);
        ['edX', 'edY'].forEach(id => {
            const sel = $(id);
            sel.textContent = '';
            ed.columns.forEach((c, i) => sel.appendChild(el('option', { value: String(i), textContent: M.columnLabel({ name: c.name.trim() || (i + 1) + '번째 열', unit: c.unit.trim() }) })));
        });
        const clamp = v => Math.max(0, Math.min(ed.columns.length - 1, v));
        if (ed.columns.length) { $('edX').value = String(clamp(keepX)); $('edY').value = String(clamp(keepY)); }
    }
    function renderEdQuestions() {
        const box = $('edQuestions');
        box.textContent = '';
        ed.questions.forEach((q, i) => {
            const input = el('input', { type: 'text', value: q, maxLength: 300, placeholder: '예: 그래프가 직선이 되는 까닭은?' });
            input.setAttribute('aria-label', '질문 ' + (i + 1));
            input.addEventListener('input', () => { ed.questions[i] = input.value; });
            const del = el('button', { textContent: '✕', title: '이 질문 지우기' });
            del.addEventListener('click', () => { ed.questions.splice(i, 1); renderEdQuestions(); });
            box.appendChild(el('div', { className: 'q-row' }, [input, del]));
        });
        $('btnAddQ').disabled = ed.questions.length >= M.MAX_QUESTIONS;
    }
    function fillEditor(def) {
        $('edTitle').value = def.title;
        $('edDesc').value = def.description;
        document.querySelectorAll('input[name=edLayout]').forEach(r => { r.checked = r.value === def.layout; });
        $('edTheory').value = def.stepTexts.theory;
        $('edMaterials').value = def.stepTexts.materials;
        $('edProcedure').value = def.stepTexts.procedure;
        renderEdLayout();
        ed.columns = def.columns.map(c => ({ name: c.name, unit: c.unit }));
        ed.questions = def.questions.slice();
        renderEdColumns();
        renderEdSelectors(def.xCol, def.yCol);
        renderEdQuestions();
        $('edFit').value = def.fit;
        $('edPublished').checked = def.published;
        $('edSensorMode').value = def.sensor.mode;
        ed.sensorFields = def.sensor.fields.slice();
        renderEdSensor();
    }
    function collectEditor() {
        return {
            title: $('edTitle').value, description: $('edDesc').value,
            columns: ed.columns, questions: ed.questions,
            xCol: +$('edX').value || 0, yCol: +$('edY').value || 0,
            fit: $('edFit').value, published: $('edPublished').checked,
            sensor: { mode: $('edSensorMode').value, fields: ed.sensorFields },
            layout: edLayout(),
            stepTexts: { theory: $('edTheory').value, materials: $('edMaterials').value, procedure: $('edProcedure').value }
        };
    }
    function edLayout() {
        const r = document.querySelector('input[name=edLayout]:checked');
        return r ? r.value : 'single';
    }
    function renderEdLayout() {
        const steps = edLayout() === 'steps';
        $('edStepTexts').hidden = !steps;
        $('edDescLabel').textContent = steps
            ? '실험 안내 = 1. 목적 (실험 목표와 하는 일, 줄바꿈 그대로 보임)'
            : '실험 안내 (목표·준비물·과정 등, 줄바꿈 그대로 보임)';
    }
    let editorBound = false;
    function bindEditor() {
        if (editorBound) return;
        editorBound = true;
        document.querySelectorAll('input[name=edLayout]').forEach(r => r.addEventListener('change', renderEdLayout));
        const modeSel = $('edSensorMode');
        modeSel.appendChild(el('option', { value: 'none', textContent: '사용 안 함' }));
        Object.keys(M.SENSORS).forEach(k => modeSel.appendChild(el('option', { value: k, textContent: M.SENSORS[k].label })));
        modeSel.addEventListener('change', () => {
            ed.sensorFields = [];   // 기능을 바꾸면 값 선택은 처음부터
            renderEdSensor();
        });
        $('btnAddCol').addEventListener('click', () => {
            if (ed.columns.length >= M.MAX_COLS) return;
            ed.columns.push({ name: '', unit: '' });
            renderEdColumns(); renderEdSelectors();
            const inputs = $('edColumns').querySelectorAll('input.cname');
            inputs[inputs.length - 1].focus();
        });
        $('btnAddQ').addEventListener('click', () => {
            if (ed.questions.length >= M.MAX_QUESTIONS) return;
            ed.questions.push('');
            renderEdQuestions();
            const inputs = $('edQuestions').querySelectorAll('input');
            inputs[inputs.length - 1].focus();
        });
        $('btnSave').addEventListener('click', saveDefinition);
        $('btnDelete').addEventListener('click', deleteDefinition);
        $('btnExportDef').addEventListener('click', () => {
            const def = M.normalizeDefinition(collectEditor());
            download('실험설정_' + safeFileName(def.title) + '.json', JSON.stringify(def, null, 2), 'application/json');
        });
        $('btnImportDef').addEventListener('click', () => $('fileDef').click());
        $('fileDef').addEventListener('change', async e => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
                const obj = JSON.parse(await file.text());
                if (!obj || !Array.isArray(obj.columns)) throw new Error('실험 설정 파일이 아닙니다.');
                fillEditor(M.normalizeDefinition(obj));
                setEdStatus('설정 파일을 불러왔습니다. 확인한 뒤 "저장"을 눌러야 반영됩니다.', 'ok');
            } catch (err) {
                setEdStatus('설정 파일을 읽지 못했습니다: ' + err.message, 'error');
            }
        });
    }
    function setEdStatus(text, kind, links) {
        const s = $('edStatus');
        s.className = kind || '';
        s.textContent = text;
        (links || []).forEach(l => { s.appendChild(document.createTextNode(' ')); s.appendChild(el('a', { href: l.href, textContent: l.text })); });
    }

    async function loadEdit() {
        if (!user) { showMessage('실험을 만들거나 고치려면 선생님 계정으로 로그인하세요. 위의 "구글 로그인"을 누르세요.'); return; }
        if (!isTeacher) { showMessage('선생님 계정만 실험을 만들거나 고칠 수 있습니다.', 'error'); return; }
        bindEditor();
        if (editId === 'new') {
            fillEditor(M.normalizeDefinition({
                columns: [{ name: '', unit: '' }, { name: '', unit: '' }], xCol: 0, yCol: 1, fit: 'none', published: false
            }));
        } else {
            try {
                const doc = await db.collection('customExperiments').doc(editId).get();
                if (!doc.exists) { showMessage('고칠 실험을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.', 'error'); return; }
                ed.existing = doc.data();
                fillEditor(M.normalizeDefinition(ed.existing));
                $('editTitle').textContent = '실험 고치기';
                $('btnDelete').hidden = false;
            } catch (e) {
                showMessage('실험을 불러오지 못했습니다: ' + errorText(e), 'error');
                return;
            }
        }
        document.title = '실험 만들기 | 센서 기반 실험실';
        showMessage('');
        $('editSection').hidden = false;
        loaded = true;
    }

    async function saveDefinition() {
        const check = M.validateDefinition(collectEditor());
        const errBox = $('edErrors');
        errBox.hidden = check.ok;
        errBox.textContent = check.errors.join(' ');
        if (!check.ok) return;
        const btn = $('btnSave');
        try {
            btn.disabled = true; btn.textContent = '저장 중...';
            const isNew = editId === 'new';
            const ref = isNew ? db.collection('customExperiments').doc() : db.collection('customExperiments').doc(editId);
            const prev = ed.existing || {};
            const data = Object.assign({}, check.definition, {
                order: typeof prev.order === 'number' ? prev.order : Date.now(),
                createdBy: prev.createdBy || user.uid,
                createdByEmail: prev.createdByEmail || user.email || '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await ref.set(data);
            ed.existing = data;
            if (isNew) {
                editId = ref.id;
                history.replaceState(null, '', 'custom-lab.html?edit=' + encodeURIComponent(editId));
                $('editTitle').textContent = '실험 고치기';
                $('btnDelete').hidden = false;
            }
            setEdStatus(
                '✅ 저장했습니다. ' + (check.definition.published ? '메인 페이지 실험 목록에 보입니다.' : '아직 학생에게는 보이지 않습니다 (공개 꺼짐).'),
                'ok',
                [{ href: 'custom-lab.html?id=' + encodeURIComponent(editId), text: '학생 화면 보기' }, { href: '../index.html', text: '메인 페이지로' }]
            );
        } catch (e) {
            setEdStatus('❌ 저장 실패: ' + errorText(e), 'error');
        } finally {
            btn.disabled = false; btn.textContent = '💾 저장';
        }
    }
    async function deleteDefinition() {
        if (editId === 'new') return;
        if (!confirm('이 실험을 삭제할까요?\n메인 페이지 목록에서 사라지고 되돌릴 수 없습니다. (학생이 이미 제출한 기록은 남습니다)\n지우기 전에 "설정 파일로 저장"을 해 두면 나중에 다시 만들 수 있습니다.')) return;
        try {
            await db.collection('customExperiments').doc(editId).delete();
            location.href = '../index.html';
        } catch (e) {
            setEdStatus('❌ 삭제 실패: ' + errorText(e), 'error');
        }
    }

    bindView();
    bindSensor();
    start();
})();
