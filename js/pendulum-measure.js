/* 스마트폰 진자 — 측정 화면 (projects/pendulum-measure.html)
   센서 수집(DeviceMotionEvent), 아이폰 권한, 화면 켜짐 유지(Wake Lock), 3초 보정,
   그래프·표, 주기 계산 설정, 시뮬레이션, CSV 저장. 계산은 js/pendulum-math.js (PendulumMath). */
(function () {
    'use strict';
    var PM = window.PendulumMath;
    var $ = function (id) { return document.getElementById(id); };
    var COND_KEY = 'pendulum:cond', OPT_KEY = 'pendulum:opts';
    var CALIB_SECONDS = 3, LIVE_WINDOW = 10, MAX_TABLE_ROWS = 600;
    var COLORS = { x: '#c62828', y: '#1e7e34', z: '#1565c0', mag: '#5f6b7a', mark: '#e8590c' };

    var state = {
        phase: 'idle',          // idle | calib | record
        samples: [], calibBuf: [], calib: null, source: null, result: null,
        wakeLock: null, measuredAt: null, liveTimer: null, calibTimer: null, firstSampleTimer: null,
        group: null, measureId: null, sentKey: null, sending: false
    };
    var PC = window.PendulumCloud;
    var CONFIG = window.PENDULUM_CONFIG || {};
    var charts = { gyro: null, acc: null };

    // ---------- 저장(새로고침해도 조건·설정 유지) ----------
    function load(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; } }
    function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 사생활 보호 모드 */ } }
    var COND_FIELDS = { cGroup: 'group', cL: 'L', cAmp: 'amplitude', cNote: 'note' };
    var OPT_FIELDS = { oKind: 'kind', oN: 'nPeriods', oSkip: 'skip', oSmooth: 'smooth' };
    function restoreFields() {
        var c = load(COND_KEY), o = load(OPT_KEY);
        Object.keys(COND_FIELDS).forEach(function (id) { if (c[COND_FIELDS[id]] != null) $(id).value = c[COND_FIELDS[id]]; });
        Object.keys(OPT_FIELDS).forEach(function (id) { if (o[OPT_FIELDS[id]] != null) $(id).value = o[OPT_FIELDS[id]]; });
        $('oFft').checked = !!o.fft;
        fillAxisOptions(o.axis);
    }
    function conditions() {
        var c = {};
        Object.keys(COND_FIELDS).forEach(function (id) { c[COND_FIELDS[id]] = $(id).value.trim(); });
        return c;
    }
    function options() {
        return {
            kind: $('oKind').value, axis: $('oAxis').value,
            nPeriods: clampInt($('oN').value, 1, 50, 10), skip: Math.max(0, Number($('oSkip').value) || 0),
            smooth: $('oSmooth').value === 'auto' ? 'auto' : clampInt($('oSmooth').value, 1, 101, 5), fft: $('oFft').checked
        };
    }
    function clampInt(v, lo, hi, def) { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; }

    function fillAxisOptions(keep) {
        var kind = $('oKind').value, sel = $('oAxis'), prev = keep || sel.value;
        var keys = kind === 'acc' ? PM.ACC_AXES.concat(['amag']) : PM.GYRO_AXES;
        sel.innerHTML = '<option value="auto">자동 (가장 크게 흔들린 축)</option>' + keys.map(function (k) {
            return '<option value="' + k + '">' + PM.AXIS_LABEL[k] + '</option>';
        }).join('');
        sel.value = keys.indexOf(prev) >= 0 ? prev : 'auto';
    }

    // ---------- 안내·상태 ----------
    function setStatus(text) { $('pdStatus').textContent = text; }
    var warnings = [];
    function warn(text) {
        if (warnings.indexOf(text) < 0) warnings.push(text);
        var box = $('pdWarn');
        box.innerHTML = warnings.map(function (w) { return '<div>' + esc(w) + '</div>'; }).join('');
        box.hidden = false;
    }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function fmt(v, d) { return Number.isFinite(v) ? v.toFixed(d) : '--'; }

    // ---------- 화면 켜짐 유지 ----------
    async function requestWakeLock() {
        if (!('wakeLock' in navigator)) {
            warn('이 브라우저는 "화면 켜짐 유지"를 지원하지 않아요. 측정 중 화면이 꺼지면 기록이 멈출 수 있으니, 폰 설정에서 화면 자동 꺼짐 시간을 길게 해 두세요.');
            return;
        }
        try {
            state.wakeLock = await navigator.wakeLock.request('screen');
            state.wakeLock.addEventListener('release', function () { state.wakeLock = null; });
        } catch (e) {
            warn('화면 켜짐 유지를 켜지 못했어요(' + (e && e.name || '오류') + '). 측정 중에는 화면을 가끔 건드려 주세요.');
        }
    }
    function releaseWakeLock() {
        if (state.wakeLock) { state.wakeLock.release().catch(function () {}); state.wakeLock = null; }
    }
    document.addEventListener('visibilitychange', function () {
        // 다른 앱에 갔다 오면 화면 켜짐 유지가 풀리므로 다시 켬
        if (document.visibilityState === 'visible' && state.phase !== 'idle' && !state.wakeLock) requestWakeLock();
        if (document.visibilityState === 'hidden' && state.phase === 'record') warn('측정 중에 화면을 벗어났어요. 그 사이 기록이 빠졌을 수 있어요.');
    });

    // ---------- 센서 ----------
    function onMotion(e) {
        var a = e.accelerationIncludingGravity || {}, r = e.rotationRate || {};
        var t = e.timeStamp > 0 ? e.timeStamp : performance.now();
        var s = {
            t: t, ax: num(a.x), ay: num(a.y), az: num(a.z),
            alpha: num(r.alpha), beta: num(r.beta), gamma: num(r.gamma)
        };
        if (!e.rotationRate || r.alpha == null) state.noGyro = true;
        if (state.phase === 'calib') state.calibBuf.push(s);
        else if (state.phase === 'record') state.samples.push(s);
    }
    function num(v) { v = Number(v); return Number.isFinite(v) ? v : 0; }

    async function start() {
        // 아이폰: 사용자가 단추를 누른 바로 그 순간에 권한을 물어야 한다 (다른 await 보다 먼저)
        if (typeof DeviceMotionEvent === 'undefined') {
            warn('이 기기·브라우저에는 동작 센서가 없어요. 아래 "시뮬레이션"으로 연습할 수 있어요.');
            return;
        }
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                var p = await DeviceMotionEvent.requestPermission();
                if (p !== 'granted') {
                    warn('동작 센서 사용이 허용되지 않았어요. 아이폰: 사파리를 완전히 닫았다가 다시 열고 "허용"을 눌러요. 안드로이드: 크롬 설정 → 사이트 설정 → 동작 센서를 허용해요. PC 처럼 센서가 없는 기기는 아래 "🧪 시뮬레이션"을 써요.');
                    return;
                }
            } catch (e) {
                warn('동작 센서 권한을 묻지 못했어요: ' + (e && e.message || e) + ' (https 주소인지 확인하세요)');
                return;
            }
        }
        if (!window.isSecureContext) warn('센서는 https 주소에서만 동작해요.');
        await requestWakeLock();

        state.samples = []; state.calibBuf = []; state.calib = null; state.result = null; state.noGyro = false;
        state.source = 'sensor'; state.measuredAt = new Date(); newMeasurement();
        window.addEventListener('devicemotion', onMotion);
        $('btnStart').disabled = true; $('btnStop').disabled = false; $('btnCsv').disabled = true; $('btnSim').disabled = true; $('btnSend').disabled = true;
        clearResult();
        beginCalibration();
        // 1.5초가 지나도 값이 없으면 센서가 없는 기기 (PC 등)
        state.firstSampleTimer = setTimeout(function () {
            if (state.phase !== 'idle' && !state.calibBuf.length && !state.samples.length) {
                warn('센서 값이 들어오지 않아요. 이 기기에는 동작 센서가 없거나 막혀 있어요 (PC 라면 시뮬레이션을 써 보세요).');
                stop(true);
            }
        }, 1500);
    }

    function beginCalibration() {
        state.phase = 'calib';
        var box = $('calibBox'), left = CALIB_SECONDS;
        box.hidden = false; box.classList.remove('go');
        $('calibCount').textContent = left;
        $('calibText').textContent = '폰을 매단 채 가만히 두세요… (센서 방향 확인 중)';
        $('calibResult').hidden = true;
        setStatus('⏳ 3초 보정 중');
        state.calibTimer = setInterval(function () {
            left--;
            if (left > 0) { $('calibCount').textContent = left; return; }
            clearInterval(state.calibTimer); state.calibTimer = null;
            finishCalibration();
        }, 1000);
    }

    function finishCalibration() {
        state.calib = PM.calibrate(state.calibBuf);
        showCalib(state.calib);
        state.phase = 'record';
        var box = $('calibBox');
        box.classList.add('go');
        $('calibCount').textContent = '▶';
        $('calibText').textContent = '이제 작은 각도로 당겼다가 살짝 놓으세요. 다 흔들리면 ■ 중지!';
        setStatus('🔴 기록 중');
        if (state.noGyro) {
            warn('이 기기는 회전 속도(자이로) 값을 주지 않아요. 계산 신호를 "가속도"로 바꿨어요.');
            $('oKind').value = 'acc'; fillAxisOptions();
        }
        startLive();
    }

    function showCalib(c) {
        var el = $('calibResult');
        if (!c || !c.ok) { el.textContent = '보정: ' + (c && c.error || '실패'); el.hidden = false; return; }
        var axisName = { ax: 'x', ay: 'y', az: 'z' }[c.axis];
        el.innerHTML = '보정 결과: 중력 방향 = 가속도 <b>' + axisName + '</b>축 (' + (c.sign > 0 ? '+' : '−') + fmt(Math.abs(c.gravity[c.axis]), 2) +
            ' m/s², 크기 ' + fmt(c.magnitude, 2) + ' m/s²) · ' + (c.still ? '잘 멈춰 있었어요 ✓' : '조금 흔들렸어요') +
            (c.sign < 0 ? ' · 부호가 반대(아이폰 등)여도 주기 계산에는 영향이 없어요.' : '');
        el.hidden = false;
        c.warnings.forEach(warn);
    }

    function stop(silent) {
        window.removeEventListener('devicemotion', onMotion);
        clearInterval(state.calibTimer); state.calibTimer = null;
        clearTimeout(state.firstSampleTimer);
        stopLive();
        releaseWakeLock();
        var wasCalib = state.phase === 'calib';
        state.phase = 'idle';
        $('calibBox').hidden = true;
        $('btnStart').disabled = false; $('btnStop').disabled = true; $('btnSim').disabled = false;
        if (silent) { setStatus('⏸ 대기 중'); updateSendState(); return; }
        if (wasCalib) { setStatus('⏸ 보정 중에 멈췄어요. 다시 시작하세요.'); return; }
        setStatus('✅ 측정 끝 (' + state.samples.length + '개)');
        recompute();
    }

    // ---------- 측정 중 그래프 ----------
    function startLive() {
        stopLive();
        state.liveTimer = setInterval(function () {
            var s = state.samples;
            if (!s.length) return;
            var span = (s[s.length - 1].t - s[0].t) / 1000;
            $('rTime').textContent = fmt(span, 1);
            $('rN').textContent = s.length;
            $('rRate').textContent = span > 0 ? fmt((s.length - 1) / span, 0) + ' Hz' : '-- Hz';
            var from = 0, tEnd = s[s.length - 1].t;
            while (from < s.length && tEnd - s[from].t > LIVE_WINDOW * 1000) from++;
            drawCharts(s.slice(from), null, s[0].t);
        }, 300);
    }
    function stopLive() { clearInterval(state.liveTimer); state.liveTimer = null; }

    // ---------- 그래프 ----------
    function series(samples, key, t0) {
        return samples.map(function (s) {
            var v = key === 'amag' ? Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az) : s[key];
            return { x: (s.t - t0) / 1000, y: v };
        });
    }
    function makeChart(canvas, title, unit) {
        if (typeof Chart === 'undefined') return null;
        return new Chart(canvas, {
            type: 'line',
            data: { datasets: [] },
            options: {
                animation: false, responsive: true, maintainAspectRatio: false, parsing: false, normalized: true,
                interaction: { mode: 'nearest', axis: 'x', intersect: false },
                plugins: {
                    title: { display: true, text: title },
                    legend: { labels: { boxWidth: 12 } },
                    tooltip: {
                        callbacks: {
                            title: function (items) { return items.length ? '시간 ' + items[0].parsed.x.toFixed(3) + ' s' : ''; },
                            label: function (it) { return it.dataset.label + ': ' + it.parsed.y.toFixed(3) + ' ' + unit; }
                        }
                    }
                },
                scales: {
                    x: { type: 'linear', title: { display: true, text: '시간 (s)' } },
                    y: { title: { display: true, text: unit } }
                }
            }
        });
    }
    function line(label, data, color, pts) {
        return { label: label, data: data, borderColor: color, backgroundColor: color, borderWidth: 1.2, pointRadius: pts, pointHoverRadius: 4, tension: 0 };
    }
    function drawCharts(samples, result, t0) {
        if (!charts.gyro) charts.gyro = makeChart($('chartGyro'), '시간–회전 속도', '°/s');
        if (!charts.acc) charts.acc = makeChart($('chartAcc'), '시간–가속도 (중력 포함)', 'm/s²');
        if (!charts.gyro || !charts.acc) return;
        var pts = samples.length > 2500 ? 0 : 1.5;
        charts.gyro.data.datasets = [
            line('α', series(samples, 'alpha', t0), COLORS.z, pts),
            line('β', series(samples, 'beta', t0), COLORS.x, pts),
            line('γ', series(samples, 'gamma', t0), COLORS.y, pts)
        ];
        charts.acc.data.datasets = [
            line('ax', series(samples, 'ax', t0), COLORS.x, pts),
            line('ay', series(samples, 'ay', t0), COLORS.y, pts),
            line('az', series(samples, 'az', t0), COLORS.z, pts)
        ];
        if (result && result.axis === 'amag') charts.acc.data.datasets.push(line('|a|', series(samples, 'amag', t0), COLORS.mag, pts));
        // 가속도로 계산할 때는 쓴 축만 보여 작은 변화가 잘 보이게 (다른 축은 범례를 눌러 다시 켬)
        if (result && result.kind === 'acc' && !result.error) {
            var keyOf = { ax: 'ax', ay: 'ay', az: 'az', amag: '|a|' };
            charts.acc.data.datasets.forEach(function (d) { if (d.label !== keyOf[result.axis]) d.hidden = true; });
        }
        if (result && result.crossings && result.crossings.length) {
            // 0 통과 시점: 계산에 쓴 축의 평균 높이(그래프의 가운데 줄)에 주황 점
            var target = result.kind === 'acc' ? charts.acc : charts.gyro;
            target.data.datasets.push({
                type: 'scatter', label: '0 통과 (' + result.axisLabel + ')',
                data: result.crossings.map(function (c) { return { x: c, y: result.offset }; }),
                borderColor: COLORS.mark, backgroundColor: COLORS.mark, pointRadius: 5, pointHoverRadius: 7, pointStyle: 'circle', showLine: false, order: -1
            });
        }
        charts.gyro.update('none'); charts.acc.update('none');
    }

    // ---------- 계산·결과 ----------
    function clearResult() {
        $('rT').textContent = '--'; $('rStd').textContent = '--';
        $('resultBox').textContent = '측정하거나 시뮬레이션을 만들면 여기에 결과가 나와요.';
        $('periodTable').tBodies[0].innerHTML = '';
        $('dataTable').tBodies[0].innerHTML = ''; $('dataNote').textContent = '아직 데이터가 없어요.';
    }

    function recompute() {
        var s = state.samples;
        if (!s.length) return;
        var o = options();
        save(OPT_KEY, o);
        var r = PM.analyze(s, o);
        state.result = r;
        var span = (s[s.length - 1].t - s[0].t) / 1000;
        $('rTime').textContent = fmt(span, 1);
        $('rN').textContent = s.length;
        $('rRate').textContent = span > 0 ? fmt((s.length - 1) / span, 0) + ' Hz' : '-- Hz';
        drawCharts(s, r, s[0].t);
        renderResult(r);
        renderDataTable();
        $('btnCsv').disabled = false;
        updateSendState();
    }

    // ---------- 노트북으로 보내기 (Apps Script → 선생님 구글 시트 → 노트북 분석 화면) ----------
    function newMeasurement() {
        state.measureId = PC ? PC.newId() : null;
        state.sentKey = null;
    }
    function linkMsg(html, cls) {
        var box = $('linkBox');
        box.classList.remove('err', 'warn');
        if (cls) box.classList.add(cls);
        $('linkMsg').innerHTML = html;
    }
    // 지금 보낼 내용의 '지문': 보낸 뒤 계산 설정이나 L 을 바꾸면 다시 보내라고 알림
    function sendKey() {
        var r = state.result || {}, c = conditions();
        return [state.measureId, c.L, c.amplitude, c.note, r.T, r.axis, r.n].join('|');
    }
    function updateSendState() {
        if (!state.group) return;
        var btn = $('btnSend');
        var ready = state.samples.length && state.result && !state.result.error && state.phase === 'idle';
        btn.disabled = !ready || state.sending;
        if (!ready || state.sending) return;
        if (!CONFIG.appsScriptUrl) {
            btn.disabled = true;
            linkMsg('선생님 설정이 아직 안 되어 있어 바로 보낼 수 없어요. <b>CSV 저장</b>을 눌러 파일을 노트북으로 옮긴 뒤, 노트북 화면에서 불러오세요.', 'warn');
            return;
        }
        if (state.sentKey === sendKey()) return;
        btn.textContent = state.sentKey ? '💻 바뀐 값 다시 보내기' : '💻 노트북으로 보내기';
        linkMsg(state.sentKey ? '보낸 뒤에 값을 바꿨어요. 다시 보내면 노트북 표의 같은 줄이 바뀌어요.'
            : '계산이 끝났어요. 결과가 괜찮으면 <b>💻 노트북으로 보내기</b>를 누르세요.');
    }
    async function sendToLaptop() {
        if (!PC || state.sending) return;
        var built = PC.buildSavePayload({
            id: state.measureId, group: state.group, conditions: conditions(), result: state.result, samples: state.samples,
            source: state.source, device: state.source === 'simulation' ? 'simulation' : deviceName(),
            measuredAt: state.measuredAt ? state.measuredAt.toISOString() : ''
        });
        if (built.error) { linkMsg('⚠️ ' + esc(built.error), 'warn'); if (/줄 길이/.test(built.error)) $('cL').focus(); return; }
        state.sending = true; updateSendState();
        $('btnSend').textContent = '⏳ 보내는 중…';
        linkMsg('보내는 중이에요… (몇 초 걸려요)');
        var key = sendKey();
        var res = await PC.save(CONFIG.appsScriptUrl, built.payload);
        state.sending = false;
        if (res.ok) {
            state.sentKey = key;
            $('btnSend').textContent = '✅ 보냄';
            $('btnSend').disabled = true;
            linkMsg('✅ 노트북으로 보냈어요: L = ' + esc(conditions().L) + ' m, T = ' + fmt(state.result.T, 3) + ' s. 노트북 표에 곧 나타나요. 다른 길이로 또 재려면 L 을 바꾸고 ▶ 측정 시작!');
        } else {
            $('btnSend').textContent = '💻 다시 보내기';
            $('btnSend').disabled = false;
            linkMsg('❌ 보내지 못했어요: ' + esc(res.error) + '<br>인터넷 연결을 확인하고 다시 눌러 보세요. 계속 안 되면 <b>CSV 저장</b>으로 파일을 옮겨 노트북에서 불러오세요.', 'err');
        }
    }
    function setupLink() {
        var m = /[?&]group=([^&#]*)/.exec(location.search);
        if (!m || !PC) return;
        var code = PC.normalizeGroup(decodeURIComponent(m[1]));
        if (!PC.isGroupCode(code)) { warn('주소의 조 코드(' + code + ')가 올바르지 않아요. 노트북 화면의 QR 을 다시 찍어 주세요.'); return; }
        state.group = code;
        $('linkGroup').textContent = code;
        $('linkBox').hidden = false;
        $('btnSend').hidden = false;
        // 조 번호 칸은 조 코드의 '조' 로 채움
        $('cGroup').value = String(PC.groupParts(code).jo);
        $('cGroup').readOnly = true;
        saveCond();
        if (!CONFIG.appsScriptUrl) linkMsg('선생님 설정이 아직 안 되어 있어요. 측정한 뒤 <b>CSV 저장</b>으로 파일을 노트북에 옮겨 불러오세요.', 'warn');
    }

    function renderResult(r) {
        var box = $('resultBox'), tb = $('periodTable').tBodies[0];
        tb.innerHTML = '';
        if (r.error) {
            $('rT').textContent = '--'; $('rStd').textContent = '--';
            box.innerHTML = '<span class="warn">⚠️ ' + esc(r.error) + '</span>';
            return;
        }
        $('rT').textContent = fmt(r.T, 3);
        $('rStd').textContent = fmt(r.Tstd, 3);
        var c = conditions(), L = Number(c.L), html = [];
        html.push('<div><span class="big">T = ' + fmt(r.T, 3) + ' s</span> (표준편차 ' + fmt(r.Tstd, 3) + ' s, 주기 ' + r.n + '개)</div>');
        html.push('<ul>');
        html.push('<li>계산에 쓴 신호: ' + esc(r.axisLabel) + (r.kind === 'acc' ? ' — 한 주기에 최대가 두 번이라 0 통과 두 번을 한 주기로 셈' : '') + '</li>');
        html.push('<li>잡음 줄이기: 이웃한 점 ' + r.smooth + '개 평균' + ($('oSmooth').value === 'auto' ? ' (자동)' : '') + '</li>');
        html.push('<li>평균의 표준오차: ' + fmt(r.Tsem, 4) + ' s · 진동수 ' + fmt(r.freq, 3) + ' Hz · 샘플 빈도 약 ' + fmt(r.rate, 0) + ' Hz</li>');
        if (Number.isFinite(r.fftT)) html.push('<li>FFT 로 구한 주기: ' + fmt(r.fftT, 3) + ' s (0 통과 방법과 ' + fmt((r.fftT - r.T) / r.T * 100, 2) + '% 차이)</li>');
        if (L > 0) {
            var th = PM.theoryPeriod(L, PM.G_REF);
            html.push('<li>참고: 줄 길이 ' + fmt(L, 2) + ' m 로 계산한 이론값 2π√(L/g) = ' + fmt(th, 3) + ' s (g = 9.80). 실제 길이는 폰의 무게중심까지라서 측정값이 조금 더 길게 나오는 게 보통이에요.</li>');
        }
        html.push('<li>자료: ' + (state.source === 'simulation' ? '🧪 시뮬레이션' : '📱 폰 센서') + '</li>');
        html.push('</ul>');
        if (r.warnings.length) html.push('<ul>' + r.warnings.map(function (w) { return '<li class="warn">⚠️ ' + esc(w) + '</li>'; }).join('') + '</ul>');
        box.innerHTML = html.join('');
        tb.innerHTML = r.periods.map(function (p) {
            return '<tr><td>' + p.index + '</td><td>' + fmt(p.T, 4) + '</td><td>' + fmt(p.t0, 3) + '</td><td>' + fmt(p.t1, 3) + '</td></tr>';
        }).join('') + '<tr><th>평균</th><th>' + fmt(r.T, 4) + '</th><th colspan="2">표준편차 ' + fmt(r.Tstd, 4) + '</th></tr>';
    }

    function renderDataTable() {
        var s = state.samples, tb = $('dataTable').tBodies[0];
        if (!$('dataDetails').open) { tb.innerHTML = ''; $('dataNote').textContent = s.length + '개 기록이 있어요. 펼치면 표가 보여요.'; return; }
        var t0 = s.length ? s[0].t : 0, n = Math.min(s.length, MAX_TABLE_ROWS), rows = [];
        for (var i = 0; i < n; i++) {
            var p = s[i];
            rows.push('<tr><td>' + fmt((p.t - t0) / 1000, 3) + '</td><td>' + fmt(p.ax, 3) + '</td><td>' + fmt(p.ay, 3) + '</td><td>' + fmt(p.az, 3) +
                '</td><td>' + fmt(p.alpha, 2) + '</td><td>' + fmt(p.beta, 2) + '</td><td>' + fmt(p.gamma, 2) + '</td></tr>');
        }
        tb.innerHTML = rows.join('');
        $('dataNote').textContent = s.length > n ? '전체 ' + s.length + '개 중 처음 ' + n + '개만 보여요. 전체는 CSV 로 저장하세요.' : '전체 ' + s.length + '개';
    }

    // ---------- 시뮬레이션 ----------
    function simulate() {
        var L = Number($('sL').value) || 1, amp = Number($('sAmp').value) || 5;
        var opts = {
            L: L, ampDeg: amp, noise: Number($('sNoise').value), rate: Number($('sRate').value) || 60,
            jitter: (Number($('sJitter').value) || 0) / 100, duration: Number($('sDur').value) || 30,
            seed: (Date.now() & 0xffff) + 1
        };
        state.calib = PM.calibrate(PM.simulate(Object.assign({}, opts, { ampDeg: 0, duration: CALIB_SECONDS })));
        showCalib(state.calib);
        state.samples = PM.simulate(opts);
        state.source = 'simulation'; state.measuredAt = new Date(); newMeasurement();
        // 실험 조건 칸이 비어 있으면 시뮬레이션 값으로 채움
        if (!$('cL').value) $('cL').value = L.toFixed(2);
        if (!$('cAmp').value) $('cAmp').value = amp;
        saveCond();
        setStatus('🧪 시뮬레이션 데이터 (' + state.samples.length + '개)');
        recompute();
        $('resultBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ---------- CSV ----------
    function deviceName() {
        var ua = navigator.userAgent || '';
        if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
        if (/Android/.test(ua)) return 'Android';
        return 'PC';
    }
    function downloadCsv() {
        if (!state.samples.length) return;
        var r = state.result || {}, c = conditions(), o = options(), cal = state.calib;
        var meta = {
            group: c.group, L: c.L, amplitude: c.amplitude, note: c.note,
            source: state.source, measuredAt: state.measuredAt ? state.measuredAt.toISOString() : '',
            device: state.source === 'simulation' ? 'simulation' : deviceName(),
            sensorAxis: r.axis, kind: o.kind, smooth: r.smooth, skip: o.skip, nPeriods: r.n,
            T_mean: r.T, T_std: r.Tstd, T_sem: r.Tsem, T_fft: r.fftT, rate: r.rate,
            gravityAxis: cal && cal.ok ? (cal.sign > 0 ? '+' : '-') + cal.axis : '', gravity: cal && cal.ok ? +cal.magnitude.toFixed(3) : ''
        };
        var csv = '﻿' + PM.toCsv(meta, state.result, state.samples);
        var d = state.measuredAt || new Date();
        var stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
        var name = 'pendulum_' + (c.group ? '조' + c.group.replace(/[^\w가-힣-]/g, '') + '_' : '') + (c.L ? 'L' + c.L + '_' : '') +
            (state.source === 'simulation' ? 'sim_' : '') + stamp + '.csv';
        var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        var a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function saveCond() { save(COND_KEY, conditions()); }

    // ---------- 시작 ----------
    function init() {
        restoreFields();
        Object.keys(COND_FIELDS).forEach(function (id) { $(id).addEventListener('input', saveCond); });
        $('oKind').addEventListener('change', function () { fillAxisOptions('auto'); recompute(); });
        ['oAxis', 'oN', 'oSkip', 'oSmooth', 'oFft'].forEach(function (id) { $(id).addEventListener('change', recompute); });
        $('cL').addEventListener('change', function () { if (state.result) renderResult(state.result); });
        $('btnStart').addEventListener('click', start);
        $('btnStop').addEventListener('click', function () { stop(false); });
        $('btnCsv').addEventListener('click', downloadCsv);
        $('btnSim').addEventListener('click', simulate);
        $('btnSend').addEventListener('click', sendToLaptop);
        ['cL', 'cAmp', 'cNote'].forEach(function (id) { $(id).addEventListener('input', updateSendState); });
        setupLink();
        $('dataDetails').addEventListener('toggle', renderDataTable);
        if (typeof DeviceMotionEvent === 'undefined') warn('이 기기·브라우저에는 동작 센서가 없어요. 폰으로 열거나, 아래 "🧪 시뮬레이션"으로 연습하세요.');
        if (typeof Chart === 'undefined') warn('그래프 도구를 불러오지 못했어요(인터넷 연결 확인). 계산과 CSV 저장은 그대로 돼요.');
        // ?sim=1 이면 시뮬레이션 칸을 펼쳐 둠 (수업 시연용)
        if (/[?&]sim=1/.test(location.search)) $('simDetails').open = true;
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
