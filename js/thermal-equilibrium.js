// 열평형 실험 화면 (projects/thermal-equilibrium.html)
// 7단계 + 가설연역 6단계 (flows: true), 중3 기본 + 고2 심화 탐구
// 무선 센서 2대(센서 A 작은 비커 · 센서 B 큰 비커) — 해석 도구 등록 센서 + 라즈베리파이 피코 환경 센서 + 표준 BLE/Vernier + 시뮬레이션
(function () {
    'use strict';
    const M = window.ThermalMath;
    const REG = window.BleSensorRegistry;
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (v, d) => (v == null || !Number.isFinite(Number(v)) ? '–' : Number(v).toFixed(d == null ? 1 : d));
    const STORE_KEY = 'thermal-eq:v1';
    const COLORS = ['#c62828', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f'];

    const state = {
        tab: 'purpose',
        runs: [],           // 저장된 회차 [{ no, title, meta, samples:[{t,t1,t2}], markers:[{t,text}], at }]
        ext: {},            // 조 공유로 받은 회차
        sent: {},           // 수업에서 선생님께 보낸 회차 { r1: { at, sig } }
        share: null,
        sensorOptions: [],  // BleSensorRegistry.loadOptionsFor('thermal') 결과
        importedProfiles: [],
        slots: {
            A: { handle: null, temp: null, name: '' },
            B: { handle: null, temp: null, name: '' }
        },
        sim: { active: false, engine: null, timer: null },
        live: {
            recording: false,
            timer: null,
            tStartMs: 0,
            elapsedOffset: 0,
            samples: [],
            markers: []
        },
        comparePicked: {}
    };

    let share = null, steps = null, liveChart = null, compareChart = null;

    function loadState() {
        try {
            const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (d) {
                state.runs = Array.isArray(d.runs) ? d.runs : [];
                state.ext = d.ext && typeof d.ext === 'object' ? d.ext : {};
                state.share = d.share || null;
                state.sent = d.sent && typeof d.sent === 'object' ? d.sent : {};
            }
        } catch (e) { /* 저장 무시 */ }
    }
    function saveState() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify({
                runs: state.runs, ext: state.ext, share: state.share, sent: state.sent
            }));
        } catch (e) { /* 저장 한도 무시 */ }
    }
    function nextRunNo() {
        return state.runs.reduce((mx, r) => Math.max(mx, r.no || 0), 0) + 1;
    }

    function readMeta() {
        return {
            m1: Math.max(1, Number($('inM1').value) || 100),
            liquid1: $('inLiq1').value || 'water',
            m2: Math.max(1, Number($('inM2').value) || 100),
            liquid2: $('inLiq2').value || 'water',
            vessel: $('inVessel').value.trim() || '유리 비커',
            roomT: Number.isFinite(Number($('inRoomT').value)) ? Number($('inRoomT').value) : 22,
            beakerMat: $('inBeakerMat').value || 'none',
            cup1Mass: Math.max(0, Number($('inCup1Mass').value) || 0),
            cup2Mass: Math.max(0, Number($('inCup2Mass').value) || 0)
        };
    }

    function applyMetaToForm(m) {
        if (!m) return;
        if (m.m1 != null) $('inM1').value = m.m1;
        if (m.liquid1) $('inLiq1').value = m.liquid1;
        if (m.m2 != null) $('inM2').value = m.m2;
        if (m.liquid2) $('inLiq2').value = m.liquid2;
        if (m.vessel != null) $('inVessel').value = m.vessel;
        if (m.roomT != null) $('inRoomT').value = m.roomT;
    }

    // ---------- 무선 센서 목록 (해석 도구 체크된 센서 + 라즈베리파이 피코 환경 센서) ----------
    async function refreshSensorOptions(preferredName) {
        if (!REG) return;
        const prevA = $('selSensorA').value;
        const prevB = $('selSensorB').value;
        const res = await REG.loadOptionsFor('thermal', {
            includePico: true,
            includeAutoStd: true,
            labStore: window.LabStore
        });
        // JSON 으로 방금 불러온 규칙도 병합
        const options = res.options.slice();
        state.importedProfiles.forEach(dec => {
            if (!options.some(o => o.kind === 'decoder' && o.name === dec.name)) {
                options.unshift({
                    id: 'decoder:' + REG.slugify(dec.name),
                    kind: 'decoder',
                    name: dec.name,
                    source: 'file',
                    badge: 'JSON 파일',
                    decoder: dec
                });
            }
        });
        state.sensorOptions = options;
        const decoderCount = options.filter(o => o.kind === 'decoder').length;
        $('sensorListNote').textContent = decoderCount > 0
            ? '블루투스 센서 해석 도구에서 열평형 실험에 등록된 센서 ' + decoderCount + '종과 라즈베리파이 피코 환경 센서를 바로 연결할 수 있습니다.'
            : '라즈베리파이 피코 환경 센서 및 표준 BLE 온도를 연결할 수 있습니다. 시판 무선 센서는 블루투스 센서 해석 도구에서 "열평형 실험"에 체크해 등록하면 여기에 자동 표시됩니다.';

        const optsHtml = options.map(o =>
            '<option value="' + esc(o.id) + '">' + esc(o.name) + (o.badge ? ' [' + esc(o.badge) + ']' : '') + '</option>'
        ).join('');
        $('selSensorA').innerHTML = optsHtml;
        $('selSensorB').innerHTML = optsHtml;

        const pickByName = name => {
            const hit = options.find(o => o.name === name);
            return hit ? hit.id : '';
        };
        const targetId = preferredName ? pickByName(preferredName) : '';
        if (targetId) {
            $('selSensorA').value = targetId;
            $('selSensorB').value = targetId;
        } else {
            if (prevA && options.some(o => o.id === prevA)) $('selSensorA').value = prevA;
            if (prevB && options.some(o => o.id === prevB)) $('selSensorB').value = prevB;
        }
    }

    function optionById(id) {
        return state.sensorOptions.find(o => o.id === id) || null;
    }

    function updateSlotUi(slot) {
        const s = state.slots[slot];
        const connected = !!s.handle || state.sim.active;
        $('cardSensor' + slot).classList.toggle('connected', connected);
        $('temp' + slot).textContent = s.temp != null && Number.isFinite(s.temp) ? s.temp.toFixed(2) + ' °C' : '--.- °C';
        $('btnDisc' + slot).disabled = !s.handle;
        $('btnConn' + slot).disabled = state.sim.active;
        const ready = state.sim.active || !!(state.slots.A.handle || state.slots.B.handle);
        $('btnRec').disabled = !ready && !state.live.recording;
        $('btnAddMarker').disabled = !state.live.recording;
        $('btnSaveRun').disabled = state.live.samples.length < 2;
    }

    async function connectSlot(slot) {
        if (state.sim.active) return;
        if (window.BleHelp && !window.BleHelp.guard()) return;
        const opt = optionById($('selSensor' + slot).value);
        if (!opt) { $('status' + slot).textContent = '⚠️ 연결할 센서를 먼저 선택하세요.'; return; }
        disconnectSlot(slot, true);
        $('status' + slot).textContent = '⏳ 연결 준비 중…';
        try {
            const handle = await REG.connectTempSensor(opt, {
                intervalMs: Number($('inInterval').value) || 1000,
                onStatus: txt => { $('status' + slot).textContent = txt; },
                onValue: tempC => {
                    state.slots[slot].temp = tempC;
                    updateSlotUi(slot);
                },
                onDisconnect: reason => {
                    state.slots[slot].handle = null;
                    $('status' + slot).textContent = '⚠️ ' + (reason || '연결이 끊겼습니다.');
                    updateSlotUi(slot);
                }
            });
            state.slots[slot].handle = handle;
            state.slots[slot].name = handle.deviceName || opt.name;
            $('status' + slot).textContent = '✅ 연결됨: ' + handle.deviceName + ' (' + handle.channelLabel + ')';
            updateSlotUi(slot);
        } catch (err) {
            const cancel = err && (err.name === 'NotFoundError' || /cancel|선택하지/i.test(err.message || ''));
            $('status' + slot).textContent = cancel ? '기기를 고르지 않았어요.' : '⚠️ 연결 실패: ' + (err && err.message || err);
            updateSlotUi(slot);
        }
    }

    function disconnectSlot(slot, quiet) {
        const s = state.slots[slot];
        if (s.handle) {
            try { s.handle.disconnect(); } catch (e) {}
            s.handle = null;
        }
        if (!quiet) $('status' + slot).textContent = '연결 해제됨';
        updateSlotUi(slot);
    }

    // ---------- 시뮬레이션 (센서 없이 수업 시연·연습) ----------
    function populateSimPresets() {
        const sel = $('simPreset');
        sel.innerHTML = Object.keys(M.SIM_PRESETS).map(k =>
            '<option value="' + esc(k) + '">' + esc(M.SIM_PRESETS[k].name) + '</option>'
        ).join('');
    }
    function stopSimulation() {
        clearInterval(state.sim.timer);
        state.sim.timer = null;
        state.sim.active = false;
        state.sim.engine = null;
        $('btnSimToggle').textContent = '▶ 시뮬레이션 켜기';
        $('statusA').textContent = state.slots.A.handle ? $('statusA').textContent : '대기 중';
        $('statusB').textContent = state.slots.B.handle ? $('statusB').textContent : '대기 중';
        if (state.live.recording) stopRecording();
        updateSlotUi('A');
        updateSlotUi('B');
    }
    function startSimulation() {
        disconnectSlot('A', true);
        disconnectSlot('B', true);
        const key = $('simPreset').value || 'equal';
        const preset = M.SIM_PRESETS[key] || M.SIM_PRESETS.equal;
        applyMetaToForm(preset);
        if (!$('inRunTitle').value.trim()) $('inRunTitle').value = '시뮬레이션 · ' + preset.name.replace(/^[①-⑤]\s*/, '').slice(0, 24);
        state.sim.engine = M.createSimulator(key);
        state.sim.active = true;
        const cur = state.sim.engine.current();
        state.slots.A.temp = cur.t1;
        state.slots.B.temp = cur.t2;
        $('statusA').textContent = '🧪 시뮬레이션 (작은 비커 · ' + M.liquidOf(preset.liquid1).name + ' ' + preset.m1 + 'g)';
        $('statusB').textContent = '🧪 시뮬레이션 (큰 비커 · ' + M.liquidOf(preset.liquid2).name + ' ' + preset.m2 + 'g)';
        $('btnSimToggle').textContent = '■ 시뮬레이션 끄기';
        updateSlotUi('A');
        updateSlotUi('B');
        updateLiveStats();
    }

    // ---------- 실시간 측정 & 그래프 ----------
    function initCharts() {
        if (typeof window.Chart !== 'function') return;
        const liveCtx = $('liveChart').getContext('2d');
        liveChart = new window.Chart(liveCtx, {
            type: 'line',
            data: {
                datasets: [
                    { label: '🔴 작은 비커 T₁ (°C)', data: [], borderColor: '#e53935', backgroundColor: 'rgba(229,57,53,.1)', borderWidth: 2.4, pointRadius: 2, tension: 0.15 },
                    { label: '🔵 큰 비커 T₂ (°C)', data: [], borderColor: '#1e88e5', backgroundColor: 'rgba(30,136,229,.1)', borderWidth: 2.4, pointRadius: 2, tension: 0.15 },
                    { label: '이론 열평형 T_이론', data: [], borderColor: '#2e7d32', borderDash: [6, 5], borderWidth: 1.8, pointRadius: 0, fill: false }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                scales: {
                    x: { type: 'linear', title: { display: true, text: '시간 (s)' } },
                    y: { title: { display: true, text: '온도 (°C)' } }
                }
            }
        });

        const cmpCtx = $('compareChart').getContext('2d');
        compareChart = new window.Chart(cmpCtx, {
            type: 'line',
            data: { datasets: [] },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                scales: {
                    x: { type: 'linear', title: { display: true, text: '시간 (s)' } },
                    y: { title: { display: true, text: '온도 (°C)' } }
                }
            }
        });
    }

    function updateLiveChart() {
        if (!liveChart) return;
        const pts = state.live.samples;
        liveChart.data.datasets[0].data = pts.map(p => ({ x: p.t, y: p.t1 }));
        liveChart.data.datasets[1].data = pts.map(p => ({ x: p.t, y: p.t2 }));
        if (pts.length >= 1) {
            const a = M.analyzeRun(pts, readMeta());
            const tMax = Math.max(10, pts[pts.length - 1].t);
            liveChart.data.datasets[2].data = a.tTheory != null ? [{ x: 0, y: a.tTheory }, { x: tMax, y: a.tTheory }] : [];
        } else {
            liveChart.data.datasets[2].data = [];
        }
        liveChart.update('none');
    }

    function updateLiveStats() {
        const pts = state.live.samples;
        $('stCount').textContent = String(pts.length);
        $('btnSaveRun').disabled = pts.length < 2;
        if (!pts.length) {
            $('stTime').textContent = '0.0 s';
            $('stDiff').textContent = '–';
            $('stTheory').textContent = '–';
            $('stEq').textContent = state.live.recording ? '측정 중…' : '측정 전';
            $('stEqBox').classList.remove('eq-ok');
            return;
        }
        const last = pts[pts.length - 1];
        const a = M.analyzeRun(pts, readMeta());
        $('stTime').textContent = last.t.toFixed(1) + ' s';
        $('stDiff').textContent = Math.abs(last.t1 - last.t2).toFixed(2) + ' °C';
        $('stTheory').textContent = a.tTheory != null ? a.tTheory.toFixed(1) + ' °C' : '–';
        if (a.reached) {
            $('stEq').textContent = '⚖️ 도달 (' + a.tEq.toFixed(1) + ' °C)';
            $('stEqBox').classList.add('eq-ok');
        } else {
            $('stEq').textContent = state.live.recording ? '진행 중…' : '일시 정지';
            $('stEqBox').classList.remove('eq-ok');
        }
    }

    function pushLivePoint(t, t1, t2) {
        if (!Number.isFinite(t1) || !Number.isFinite(t2)) return;
        state.live.samples.push({ t: M.round(t, 2), t1: M.round(t1, 2), t2: M.round(t2, 2) });
        updateLiveStats();
        updateLiveChart();
    }

    function startRecording() {
        if (state.live.recording) return;
        const intervalMs = Math.max(250, Number($('inInterval').value) || 1000);
        state.live.recording = true;
        $('btnRec').textContent = '⏸ 일시 정지';
        $('btnRec').className = 'danger';
        $('btnAddMarker').disabled = false;
        $('liveMsg').textContent = '🔴 실시간 기록 중… 두 온도 곡선이 만나 열평형에 도달할 때까지 지켜보세요.';

        if (state.sim.active && state.sim.engine) {
            if (!state.live.samples.length) {
                const c0 = state.sim.engine.current();
                pushLivePoint(0, c0.t1, c0.t2);
            }
            const tickMs = 200;
            state.live.timer = setInterval(() => {
                const speed = Math.max(1, Number($('simSpeed').value) || 5);
                const dtSim = (tickMs / 1000) * speed;
                const p = state.sim.engine.step(dtSim);
                state.slots.A.temp = p.t1;
                state.slots.B.temp = p.t2;
                updateSlotUi('A');
                updateSlotUi('B');
                pushLivePoint(p.t, p.t1, p.t2);
            }, tickMs);
        } else {
            state.live.tStartMs = Date.now();
            const take = () => {
                const t = state.live.elapsedOffset + (Date.now() - state.live.tStartMs) / 1000;
                const t1 = state.slots.A.temp;
                const t2 = state.slots.B.temp;
                if (Number.isFinite(t1) && Number.isFinite(t2)) {
                    pushLivePoint(t, t1, t2);
                } else {
                    $('liveMsg').textContent = '⏳ 센서 A·B 둘 다 온도가 들어와야 기록됩니다. 두 센서 연결 상태를 확인하세요.';
                }
            };
            take();
            state.live.timer = setInterval(take, intervalMs);
        }
        updateLiveStats();
    }

    function stopRecording() {
        if (!state.live.recording) return;
        clearInterval(state.live.timer);
        state.live.timer = null;
        if (!state.sim.active && state.live.tStartMs) {
            state.live.elapsedOffset += (Date.now() - state.live.tStartMs) / 1000;
        }
        state.live.recording = false;
        $('btnRec').textContent = '▶ 측정 계속';
        $('btnRec').className = 'good';
        $('btnAddMarker').disabled = true;
        updateLiveStats();
    }

    function clearLive() {
        stopRecording();
        state.live.samples = [];
        state.live.markers = [];
        state.live.elapsedOffset = 0;
        $('btnRec').textContent = '▶ 측정 시작';
        $('liveMsg').textContent = '';
        if (state.sim.active) {
            const key = $('simPreset').value || 'equal';
            state.sim.engine = M.createSimulator(key);
            const c0 = state.sim.engine.current();
            state.slots.A.temp = c0.t1;
            state.slots.B.temp = c0.t2;
            updateSlotUi('A');
            updateSlotUi('B');
        }
        updateLiveStats();
        updateLiveChart();
    }

    function saveCurrentRun() {
        if (state.live.samples.length < 2) {
            $('liveMsg').textContent = '⚠️ 2개 이상의 점이 기록되어야 회차를 저장할 수 있어요.';
            return;
        }
        stopRecording();
        const no = nextRunNo();
        const meta = readMeta();
        const title = $('inRunTitle').value.trim() || ('회차 ' + no + ' (' + meta.m1 + 'g : ' + meta.m2 + 'g)');
        const run = {
            no,
            title,
            meta,
            samples: state.live.samples.slice(),
            markers: state.live.markers.slice(),
            at: new Date().toISOString()
        };
        state.runs.push(run);
        state.comparePicked['m:' + no] = true;
        saveState();
        $('inRunTitle').value = '';
        $('liveMsg').textContent = '✅ "' + title + '" 회차를 저장했어요! 조건을 ②로 바꿔 한 번 더 재거나 6. 결과에서 분석하세요.';
        renderRuns();
        renderResults();
        sendToTeacher();
    }

    // ---------- 저장 회차 & 결과 표·그래프 ----------
    function allRuns() {
        const list = state.runs.map(r => Object.assign({ _key: 'm:' + r.no, _mine: true }, r));
        Object.keys(state.ext || {}).forEach(k => {
            list.push(Object.assign({ _key: 'e:' + k, _mine: false }, state.ext[k]));
        });
        return list;
    }

    // ---------- 수업(?c=)이면 회차를 저장·불러오기·지울 때 선생님께 저절로 보내기 ----------
    // (ClassShare autoSendOnSave: 수업일 때만 켬. 보낸 상태는 회차 목록에 '✅ 선생님께 보냄')
    const IN_CLASS = !!new URLSearchParams(location.search).get('c');
    const sendRun = { busy: false, err: '' };
    const runSig = r => String(r.title || '') + '|' + ((r.samples || []).length);
    function sendToTeacher(again) {
        if (!share) return Promise.resolve(null);
        if (!IN_CLASS) return share.saved();
        sendRun.busy = true; sendRun.err = ''; renderRuns();
        return (again ? share.sendPicked() : share.saved()).then(r => {
            sendRun.busy = false;
            if (r && r.busy) { setTimeout(() => sendToTeacher(true), 1500); sendRun.busy = true; return r; }
            if (r && r.ok && !r.skipped) {
                const at = new Date().toISOString(), pre = String(share.device() || '') + '-';
                const itemId = id => (String(id).indexOf(pre) === 0 ? String(id).slice(pre.length) : String(id));   // 줄 id = 기기-회차 id
                (r.ids || []).map(itemId).forEach(id => {
                    const run = state.runs.find(x => 'r' + x.no === id);
                    if (run) state.sent[id] = { at, sig: runSig(run) };
                });
                (r.cleared || []).map(itemId).forEach(id => { delete state.sent[id]; });
                saveState();
            } else if (r && !r.ok) {
                sendRun.err = r.error ? String(r.error) : '수업 참여(조·번호)를 먼저 고르세요.';
            }
            renderRuns();
            return r;
        }, () => { sendRun.busy = false; sendRun.err = '인터넷 연결을 확인하세요.'; renderRuns(); });
    }
    function sentLine(r) {
        if (!IN_CLASS) return '';
        const s = state.sent && state.sent['r' + r.no];
        if (s && s.sig === runSig(r)) {
            const d = new Date(s.at);
            return '<div class="th-sent ok" data-sent="ok">✅ 선생님께 보냄 (' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ')</div>';
        }
        if (sendRun.busy) return '<div class="th-sent" data-sent="busy">📤 선생님께 보내는 중…</div>';
        return '<div class="th-sent err" data-sent="no">⚠ 아직 선생님께 못 보냈어요' + (sendRun.err ? ' — ' + esc(sendRun.err) : '') + '</div>';
    }

    function renderRuns() {
        const cnt = state.runs.length;
        $('runsCnt').textContent = cnt ? '(' + cnt + '회차)' : '';
        if (!cnt) {
            $('runsList').innerHTML = '<p class="note">아직 저장한 회차가 없습니다. 위에서 측정한 뒤 💾 이 회차 저장을 누르세요.</p>';
            return;
        }
        const unsent = IN_CLASS && !sendRun.busy && state.runs.some(r => { const s = state.sent['r' + r.no]; return !s || s.sig !== runSig(r); });
        $('runsList').innerHTML = state.runs.slice().reverse().map(r => {
            const a = M.analyzeRun(r.samples, r.meta);
            return '<div class="th-run-item"><div><b>' + esc(r.title) + '</b><div class="meta">' +
                esc(M.liquidOf(r.meta.liquid1).name) + ' ' + r.meta.m1 + 'g : ' + esc(M.liquidOf(r.meta.liquid2).name) + ' ' + r.meta.m2 + 'g · ' +
                '열평형 <b>' + fmt(a.tEq, 1) + ' °C</b> (이론 ' + fmt(a.tTheory, 1) + ' °C) · 점 ' + a.n + '개</div>' + sentLine(r) + '</div>' +
                '<div class="th-bar" style="margin:0;">' +
                '<button type="button" class="secondary" data-csv="' + r.no + '">⬇ CSV</button>' +
                '<button type="button" class="danger" data-del="' + r.no + '">🗑</button></div></div>';
        }).join('') + (unsent ? '<div class="th-bar"><button type="button" id="btnResend">📤 선생님께 다시 보내기</button></div>' : '');
    }

    function renderResults() {
        const list = allRuns();
        if (!list.length) {
            $('resTbody').innerHTML = '<tr><td colspan="9">저장된 회차가 없습니다. 5. 데이터에서 측정하거나 시뮬레이션 회차를 저장해 주세요.</td></tr>';
            $('advTbody').innerHTML = '<tr><td colspan="9">저장된 회차가 없습니다.</td></tr>';
            $('resSummary').textContent = '';
            $('comparePicks').innerHTML = '';
            if (compareChart) { compareChart.data.datasets = []; compareChart.update('none'); }
            return;
        }

        const summaries = [];
        $('resTbody').innerHTML = list.map(r => {
            const a = M.analyzeRun(r.samples, r.meta);
            const cond = M.liquidOf(r.meta.liquid1).name + ' ' + r.meta.m1 + 'g : ' + M.liquidOf(r.meta.liquid2).name + ' ' + r.meta.m2 + 'g';
            summaries.push(r.title + ' → 실측 ' + fmt(a.tEq, 1) + '°C (이론 ' + fmt(a.tTheory, 1) + '°C, 열손실 ' + fmt(a.lossPct, 1) + '%)');
            return '<tr>' +
                '<td><b>' + esc(r.title) + '</b>' + (r._mine ? '' : ' <small>(' + esc(r.from || '조원') + ')</small>') + '</td>' +
                '<td>' + esc(cond) + '</td>' +
                '<td>' + fmt(a.t1_0, 1) + ' / ' + fmt(a.t2_0, 1) + '</td>' +
                '<td><b>' + fmt(a.tEq, 2) + '</b>' + (a.reached ? '' : ' <small>(미도달)</small>') + '</td>' +
                '<td>' + fmt(a.tTheory, 2) + '</td>' +
                '<td>' + (a.eqTime != null ? a.eqTime.toFixed(1) : '미도달') + '</td>' +
                '<td>' + (a.qLost != null ? a.qLost.toLocaleString() : '–') + '</td>' +
                '<td>' + (a.qGained != null ? a.qGained.toLocaleString() : '–') + '</td>' +
                '<td>' + (a.lossPct != null ? a.lossPct.toFixed(1) + '%' : '–') + '</td>' +
                '</tr>';
        }).join('');
        $('resSummary').textContent = '요약: ' + summaries.join(' | ');

        // 고2 심화 표
        $('advTbody').innerHTML = list.map(r => {
            const a = M.analyzeRun(r.samples, r.meta);
            const r1Min = a.rate1 != null ? (a.rate1 * 60).toFixed(2) : '–';
            const r2Min = a.rate2 != null ? (a.rate2 * 60).toFixed(2) : '–';
            return '<tr>' +
                '<td><b>' + esc(r.title) + '</b></td>' +
                '<td>' + fmt(a.C1, 0) + ' / ' + fmt(a.C2, 0) + '</td>' +
                '<td>' + (a.Ccup > 0 ? fmt(a.tCorrected, 2) : '보정 안 함') + '</td>' +
                '<td>' + r1Min + '</td>' +
                '<td>' + r2Min + '</td>' +
                '<td>' + (a.expFit ? a.expFit.tau.toFixed(1) : '–') + '</td>' +
                '<td>' + (a.expFit ? a.expFit.halfLife.toFixed(1) : '–') + '</td>' +
                '<td>' + (a.expFit ? a.expFit.r2.toFixed(4) : '–') + '</td>' +
                '<td>' + (a.qEnv != null ? a.qEnv.toLocaleString() : '–') + '</td>' +
                '</tr>';
        }).join('');

        // 비교 곡선 체크박스
        list.forEach(r => { if (state.comparePicked[r._key] === undefined) state.comparePicked[r._key] = true; });
        $('comparePicks').innerHTML = list.map(r =>
            '<label><input type="checkbox" data-cmp="' + esc(r._key) + '"' + (state.comparePicked[r._key] ? ' checked' : '') + '> ' + esc(r.title) + '</label>'
        ).join('');
        renderCompareChart();
    }

    function renderCompareChart() {
        if (!compareChart) return;
        const mode = $('selCompareMode').value || 'temps';
        const picked = allRuns().filter(r => state.comparePicked[r._key]);
        const datasets = [];
        picked.forEach((r, idx) => {
            const col = COLORS[idx % COLORS.length];
            if (mode === 'diff') {
                datasets.push({
                    label: r.title + ' |T₁−T₂|',
                    data: (r.samples || []).map(p => ({ x: p.t, y: Math.abs(p.t1 - p.t2) })),
                    borderColor: col, borderWidth: 2.2, pointRadius: 1.5, tension: 0.15
                });
            } else {
                datasets.push({
                    label: r.title + ' T₁(작은)',
                    data: (r.samples || []).map(p => ({ x: p.t, y: p.t1 })),
                    borderColor: col, borderWidth: 2.2, pointRadius: 1.5, tension: 0.15
                });
                datasets.push({
                    label: r.title + ' T₂(큰)',
                    data: (r.samples || []).map(p => ({ x: p.t, y: p.t2 })),
                    borderColor: col, borderDash: [5, 4], borderWidth: 2, pointRadius: 1.5, tension: 0.15
                });
            }
        });
        compareChart.options.scales.y.title.text = mode === 'diff' ? '온도 차 |T₁ − T₂| (°C)' : '온도 (°C)';
        compareChart.data.datasets = datasets;
        compareChart.update('none');
    }

    // ---------- 변인 카드 & 보고서 AI (7단계 + 가설연역 6단계) ----------
    const VARS = {
        vars: [
            { key: 'mass', name: '물의 질량비 (작은 : 큰)' },
            { key: 'tempDiff', name: '처음 온도 차이' },
            { key: 'pos', name: '뜨거운 물 위치 (안/밖)' },
            { key: 'vessel', name: '비커 재질·단열 (심화)' },
            { key: 'liquid', name: '액체 종류·비열 (심화)' }
        ],
        choose: ['mass', 'tempDiff', 'pos', 'vessel', 'liquid'],
        measure: '작은 비커·큰 비커의 온도 변화, 열평형 온도 및 도달 시간',
        predictQ: '{var}을(를) ①에서 ②로 바꾸면 열평형 온도나 도달 시간은 어떻게 달라질까요?',
        predict: [
            { key: 'up', label: '열평형 온도가 더 높아질 것이다' },
            { key: 'down', label: '열평형 온도가 더 낮아질 것이다' },
            { key: 'faster', label: '열평형에 더 빨리 도달할 것이다' },
            { key: 'slower', label: '열평형에 더 천천히 도달할 것이다' },
            { key: 'same', label: '거의 비슷할 것이다' }
        ]
    };

    function bindEvents() {
        $('btnConnA').addEventListener('click', () => connectSlot('A'));
        $('btnConnB').addEventListener('click', () => connectSlot('B'));
        $('btnDiscA').addEventListener('click', () => disconnectSlot('A'));
        $('btnDiscB').addEventListener('click', () => disconnectSlot('B'));
        $('btnRefreshSensors').addEventListener('click', () => refreshSensorOptions());
        $('inProfileJson').addEventListener('change', e => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => {
                try {
                    const obj = JSON.parse(String(r.result));
                    const check = window.BleDecode.validateDecoder(obj);
                    if (!check.ok) { $('liveMsg').textContent = '⚠️ 규칙 파일 오류: ' + check.errors.join(' '); return; }
                    state.importedProfiles = state.importedProfiles.filter(d => d.name !== check.decoder.name);
                    state.importedProfiles.unshift(check.decoder);
                    refreshSensorOptions(check.decoder.name);
                    $('liveMsg').textContent = '✅ "' + check.decoder.name + '" 센서 규칙을 목록에 추가했어요.';
                } catch (err) {
                    $('liveMsg').textContent = '⚠️ JSON 파일을 읽지 못했어요.';
                } finally { e.target.value = ''; }
            };
            r.readAsText(f);
        });

        $('btnSimToggle').addEventListener('click', () => {
            if (state.sim.active) stopSimulation();
            else startSimulation();
        });
        $('simPreset').addEventListener('change', () => {
            if (state.sim.active) { clearLive(); startSimulation(); }
        });

        $('btnRec').addEventListener('click', () => {
            if (state.live.recording) stopRecording();
            else startRecording();
        });
        $('btnSaveRun').addEventListener('click', saveCurrentRun);
        $('btnClearLive').addEventListener('click', () => {
            if (state.live.samples.length && !confirm('현재 측정 기록을 지울까요?')) return;
            clearLive();
        });
        $('btnAddMarker').addEventListener('click', () => {
            const txt = $('inMarker').value.trim();
            if (!txt || !state.live.samples.length) return;
            const last = state.live.samples[state.live.samples.length - 1];
            state.live.markers.push({ t: last.t, text: txt });
            $('inMarker').value = '';
            $('liveMsg').textContent = '🏷️ ' + last.t.toFixed(1) + 's 지점에 "' + txt + '" 표시를 남겼어요.';
        });
        $('btnManAdd').addEventListener('click', () => {
            const t = Number($('inManT').value), t1 = Number($('inManT1').value), t2 = Number($('inManT2').value);
            if (![t, t1, t2].every(Number.isFinite)) { $('liveMsg').textContent = '⚠️ 시간, T₁, T₂ 를 숫자로 넣으세요.'; return; }
            pushLivePoint(t, t1, t2);
            $('inManT').value = String(t + 10);
        });

        $('runsList').addEventListener('click', e => {
            const del = e.target.closest('[data-del]');
            if (del) {
                const no = Number(del.dataset.del);
                if (!confirm('회차 ' + no + '을(를) 지울까요?')) return;
                state.runs = state.runs.filter(r => r.no !== no);
                saveState(); renderRuns(); renderResults();
                sendToTeacher();
                return;
            }
            if (e.target.closest('#btnResend')) {
                sendToTeacher(true);
                return;
            }
            const csv = e.target.closest('[data-csv]');
            if (csv) {
                const run = state.runs.find(r => r.no === Number(csv.dataset.csv));
                if (!run) return;
                const blob = new Blob([M.runToCsv(run)], { type: 'text/csv;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'thermal-' + run.no + '.csv';
                document.body.appendChild(a); a.click();
                setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            }
        });

        $('btnImportCsv').addEventListener('click', () => $('inCsvFile').click());
        $('inCsvFile').addEventListener('change', e => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => {
                const parsed = M.parseRunCsv(String(r.result), f.name);
                if (parsed.samples.length < 2) { $('liveMsg').textContent = '⚠️ CSV 에서 (시간, T₁, T₂) 행을 2개 이상 찾지 못했어요.'; return; }
                const no = nextRunNo();
                state.runs.push({ no, title: parsed.title, meta: readMeta(), samples: parsed.samples, markers: [], at: new Date().toISOString() });
                state.comparePicked['m:' + no] = true;
                saveState(); renderRuns(); renderResults();
                $('liveMsg').textContent = '✅ CSV "' + parsed.title + '" (' + parsed.samples.length + '점)을 회차로 불러왔어요.' + (IN_CLASS ? ' 선생님께도 보내요.' : '');
                sendToTeacher();
                e.target.value = '';
            };
            r.readAsText(f);
        });

        $('selCompareMode').addEventListener('change', renderCompareChart);
        $('comparePicks').addEventListener('change', e => {
            const cb = e.target.closest('input[data-cmp]');
            if (!cb) return;
            state.comparePicked[cb.dataset.cmp] = cb.checked;
            renderCompareChart();
        });
        $('btnPrint').addEventListener('click', () => window.print());
        ['inM1', 'inM2', 'inLiq1', 'inLiq2', 'inRoomT', 'inBeakerMat', 'inCup1Mass', 'inCup2Mass'].forEach(id => {
            $(id).addEventListener('input', () => { updateLiveStats(); updateLiveChart(); });
        });
    }

    function onStep(step) {
        state.tab = step;
        if (share) share.stepChanged();
        if (step === 'result') renderResults();
    }

    // ---------- 초기화 ----------
    loadState();
    populateSimPresets();
    initCharts();
    bindEvents();
    renderRuns();
    renderResults();
    updateSlotUi('A');
    updateSlotUi('B');

    const urlProfile = new URLSearchParams(location.search).get('profile') || '';
    refreshSensorOptions(urlProfile);

    if (window.ClassShare) {
        share = ClassShare.init({
            exp: 'thermal',
            barMount: '#class-bar-mount',
            shareMount: '#share-mount',
            csvHint: '5-4 저장한 회차 → ⬇ CSV',
            autoSendOnSave: IN_CLASS,   // 수업이면 회차를 저장·불러오기·지울 때 저절로 보냄
            store: { load: () => state.share, save: o => { state.share = o; saveState(); } },
            getItems: () => M.buildItems(state.runs),
            onIncoming: items => {
                const r = M.applyIncoming(state.ext, items);
                if (r.changed) { state.ext = r.ext; saveState(); renderResults(); }
                return r.changed;
            },
            getStep: () => state.tab,
            getPoints: () => state.runs.reduce((s, r) => s + (r.samples ? r.samples.length : 0), 0),
            pollWhen: () => ['data', 'result', 'conclusion'].includes(state.tab),
            incomingCount: () => Object.keys(state.ext || {}).length,
            clearIncoming: () => { state.ext = {}; saveState(); renderResults(); }
        });
    }

    steps = window.LabUI && LabUI.initSteps({ key: 'thermal-eq', onShow: onStep, flows: true });
    if (window.LabUI && LabUI.autoSubtabs) LabUI.autoSubtabs();

    if (window.ReportAI) {
        ReportAI.init({
            exp: 'thermal',
            mount: '#report-ai',
            contextFrom: '#resTable, #resSummary, #advTable',
            sections: [
                { key: 'problem', name: '우리 생각', step: 'purpose', inline: true, hint: '두 물의 온도는 어떻게 변하고, 만나는 온도는 무엇에 따라 달라질까? 예: "○○이 많으면(높으면) 만나는 온도는 …" 처럼 한두 줄로.' },
                { key: 'theory', hint: '열의 이동 방향, 열평형 온도, Q = c·m·ΔT (심화: 열용량·열전달 속도)를 내 말로 정리하세요.' },
                { key: 'design', name: '변인·예상', step: 'procedure', inline: true, vars: VARS, hint: '바꿀 것은 하나만, ① → ② 값과 예상을 먼저 정해요.' },
                { key: 'method', hint: '큰 비커·작은 비커 배치, 무선 센서 2대 측정 순서와 통제 변인을 적으세요.' },
                { key: 'analysis', asks: [
                    '[중3 기본] 두 온도 곡선은 어떻게 변했고, 몇 °C에서 열평형에 도달했나요? (① vs ② 비교)',
                    '[중3 기본] 실측 열평형 온도와 이론 열평형 온도(T_이론)는 얼마나 차이 났나요? Q_잃과 Q_얻을 숫자로 비교해 보세요.',
                    '[고2 심화·선택] 초기 온도 변화율(dT/dt)이나 시상수 τ·반감기는 조건에 따라 어떻게 달라졌나요?'
                ] },
                { key: 'conclusion', asks: [
                    '내 예상(변인 카드)과 실제 결과가 같았나요? 달랐다면 데이터 근거는 무엇인가요?',
                    '잃은 열량과 얻은 열량의 차이(열손실률 %)는 왜 생겼으며, 실험을 어떻게 개선하면 줄일 수 있을까요?',
                    '[고2 심화·선택] 비커 열용량 보정이나 뉴턴의 냉각 법칙(R²)이 우리 결과를 얼마나 잘 설명하나요?'
                ] }
            ],
            hdSections: [
                { key: 'problem', hint: '관찰·궁금증에서 실험으로 답할 수 있는 탐구 문제 한 줄을 쓰세요.' },
                'hypothesis',
                { key: 'design', vars: VARS, hint: '독립·종속·통제 변인과 ① → ② 조건, 예상을 정하세요.' },
                { key: 'analysis', name: '자료 해석', hint: '회차별 열평형 온도, Q_잃 vs Q_얻, 곡선 모양(심화: τ·dT/dt)을 숫자로 해석하세요.', asks: [
                    '[중3 기본] 조건 ①과 ②의 열평형 온도·도달 시간·열손실률 차이를 표에서 읽어 쓰세요.',
                    '[중3 기본] 실측값과 이론값(T_이론) 차이는 어떤 경향을 보였나요?',
                    '[고2 심화·선택] 시상수 τ와 초기 기울기 dT/dt가 가설과 어떻게 연결되나요?'
                ] },
                { key: 'verdict', asks: [
                    '우리 조의 가설은 지지되었나요, 기각되었나요? 표·그래프의 숫자를 들어 판정하세요.',
                    '열손실(주변 공기·비커 열용량·증발)이 결과에 미친 영향과 개선 방법을 제안하세요.'
                ] }
            ]
        });
    }

    // 시험·디버깅용 접근
    window.__thermalLab = {
        state,
        refreshSensorOptions,
        startSimulation,
        stopSimulation,
        startRecording,
        stopRecording,
        saveCurrentRun,
        renderResults
    };
})();
