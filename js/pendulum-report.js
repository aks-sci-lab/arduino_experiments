/* 스마트폰 진자 — 노트북 분석 화면 (projects/pendulum-report.html, 7단계 탭)
   조 코드 만들기 → QR(측정 화면 주소 ?group=조코드) → 구글 시트(Apps Script)에서 몇 초마다 새 측정 가져오기
   → 표(L, T, 표준편차, T²) → T²–L 최소제곱 직선 → g = 4π²/기울기, d = 절편/기울기, 오차율.
   서버가 없어도 CSV 불러오기·직접 넣기로 같은 계산을 한다. 계산은 모두 js/pendulum-math.js (AI 안 씀). */
(function () {
    'use strict';
    var PM = window.PendulumMath, PC = window.PendulumCloud, CONFIG = window.PENDULUM_CONFIG || {};
    // 어느 선생님 시트를 쓸지: 링크의 ?s=스크립트ID > 이 노트북에 기억한 것 > 사이트 기본 (js/pendulum-cloud.js)
    var STORE = (function () { try { return window.localStorage; } catch (e) { return null; } })();
    var SERVER = PC.resolveServer(location.search, CONFIG.appsScriptUrl, STORE, true);
    var $ = function (id) { return document.getElementById(id); };
    var GROUP_KEY = 'pendulum-report:group', GREF_KEY = 'pendulum-report:gref';

    var state = {
        group: null, items: [], excluded: [], fresh: {},
        pollTimer: null, polling: false, fails: 0, lastOk: null, lastNew: null
    };
    var chart = null;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function fmt(v, d) { return Number.isFinite(v) ? v.toFixed(d) : '--'; }
    function load(key, def) { try { var v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
    function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 사생활 보호 모드 */ } }
    function groupKey() { return 'pendulum-report:data:' + state.group; }
    function persist() { if (state.group) save(groupKey(), { items: state.items, excluded: state.excluded }); }
    function timeText(d) { d = d || new Date(); return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

    // ---------- 조 코드 ----------
    function setGroup(code) {
        stopPolling();
        state.group = code; state.fails = 0; state.lastOk = null; state.lastNew = null; state.fresh = {};
        var saved = load(groupKey(), {});
        state.items = Array.isArray(saved.items) ? saved.items : [];
        state.excluded = Array.isArray(saved.excluded) ? saved.excluded : [];
        save(GROUP_KEY, code);
        $('groupCard').hidden = true;
        $('qrCard').hidden = false;
        drawQr();
        render();
        startPolling();
    }
    function leaveGroup() {
        if (!confirm('조 코드를 바꿀까요? 지금 표는 이 노트북에 남아 있어서, 같은 조 코드로 다시 연결하면 돌아와요.')) return;
        stopPolling();
        state.group = null; state.items = []; state.excluded = [];
        save(GROUP_KEY, null);
        $('qrCard').hidden = true; $('groupCard').hidden = false; $('groupMsg').textContent = '';
        render();
    }
    // 폰 주소에는 쓰는 시트의 ID 도 넣어, 폰이 같은 선생님 시트로 보내게 한다
    function measureUrl() {
        return new URL('pendulum-measure.html?group=' + encodeURIComponent(state.group) +
            (SERVER.id ? '&s=' + encodeURIComponent(SERVER.id) : ''), location.href).href;
    }
    function showServer() {
        var el = $('serverInfo');
        if (!el) return;
        if (SERVER.from === 'none') { el.hidden = true; return; }
        var short = SERVER.id ? SERVER.id.slice(0, 6) + '…' + SERVER.id.slice(-4) : '';
        el.hidden = false;
        el.innerHTML = '📒 저장할 곳: ' + (SERVER.from === 'default' ? '사이트 기본 선생님 시트' : '선생님 시트 <span class="num">' + esc(short) + '</span>' +
            (SERVER.from === 'saved' ? ' (이 노트북에 기억됨)' : '')) +
            (SERVER.from !== 'default' && CONFIG.appsScriptUrl ? ' <button id="btnForget" type="button">기본 시트로 되돌리기</button>' : '');
        var b = $('btnForget');
        if (b) b.addEventListener('click', function () {
            if (!confirm('이 노트북이 기억한 선생님 시트를 지우고 사이트 기본 시트를 쓸까요?')) return;
            PC.forgetServer(STORE);
            // 주소의 ?s= 를 빼고 다시 열기 (같은 주소로 가면 # 뒤만 바뀌어 새로 읽지 않으므로 reload)
            history.replaceState(null, '', location.pathname + location.hash);
            location.reload();
        });
    }
    function qrSvg(text) {
        if (typeof window.qrcode !== 'function') return null;
        var qr = window.qrcode(0, 'M');
        qr.addData(text); qr.make();
        return qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
    }
    function drawQr() {
        var url = measureUrl(), svg = qrSvg(url);
        $('codeShow').textContent = state.group;
        $('qrUrl').href = url; $('qrUrl').textContent = url;
        $('qr').innerHTML = svg || '<p class="note">QR 을 만드는 도구를 불러오지 못했어요(인터넷 확인). 아래 주소를 폰에 직접 입력해도 돼요.</p>';
    }

    // ---------- 서버에서 가져오기 ----------
    function setConn(text, cls) {
        var el = $('conn');
        el.className = 'pd-conn' + (cls ? ' ' + cls : '');
        el.innerHTML = text;
    }
    function startPolling() {
        if (!SERVER.url) {
            setConn('⚙️ 선생님 설정이 필요해요(서버 주소 없음). 폰에서 <b>CSV 저장</b> → 아래 <b>CSV 불러오기</b>로 할 수 있어요.', 'warn');
            return;
        }
        setConn('⏳ 서버에 연결하는 중…');
        poll();
    }
    function stopPolling() { clearTimeout(state.pollTimer); state.pollTimer = null; }
    function schedule() {
        stopPolling();
        var sec = Math.max(2, Number(CONFIG.pollSeconds) || 5);
        if (state.fails >= 3) sec = Math.max(sec, 15);   // 계속 실패하면 천천히
        state.pollTimer = setTimeout(poll, sec * 1000);
    }
    async function poll() {
        if (!state.group || state.polling) return;
        if (document.hidden) { schedule(); return; }
        state.polling = true;
        var group = state.group;
        var res = await PC.list(SERVER.url, group);
        state.polling = false;
        if (group !== state.group) return;   // 기다리는 동안 조 코드를 바꿈
        if (res.ok) {
            state.fails = 0; state.lastOk = new Date();
            var m = PC.mergeItems(state.items, (res.items || []).map(PC.itemFromServer));
            state.items = m.items;
            if (m.added.length) {
                m.added.forEach(function (id) { state.fresh[id] = Date.now(); });
                var last = state.items.filter(function (it) { return it.id === m.added[m.added.length - 1]; })[0];
                state.lastNew = { text: '🆕 새 측정 들어옴: L = ' + fmt(last.L, 2) + ' m, T = ' + fmt(last.T, 3) + ' s' + (m.added.length > 1 ? ' 외 ' + (m.added.length - 1) + '개' : ''), at: Date.now() };
                persist(); render();
            }
            if (state.lastNew && Date.now() - state.lastNew.at < 15000) setConn(state.lastNew.text + ' <span class="note">(' + timeText() + ')</span>', 'new');
            else setConn('🟢 연결됨 · 폰에서 보낸 측정을 기다리는 중 <span class="note">(마지막 확인 ' + timeText(state.lastOk) + ', ' + (Number(CONFIG.pollSeconds) || 5) + '초마다 확인)</span>', 'ok');
        } else {
            state.fails++;
            setConn('🔴 서버에 연결 안 됨 (' + state.fails + '번째): ' + esc(res.error) + '<br><span class="note">저절로 다시 시도해요. 급하면 폰에서 CSV 저장 → 아래에서 불러오기.</span>', 'err');
        }
        schedule();
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden && state.group && SERVER.url) { stopPolling(); poll(); } });

    // ---------- 표 ----------
    function included() {
        return state.items.filter(function (it) { return state.excluded.indexOf(it.id) < 0 && it.L > 0 && it.T > 0; });
    }
    function sourceLabel(it) {
        if (it.from === 'csv') return '📄 CSV';
        if (it.from === 'manual') return '✏️ 직접';
        return it.source === 'simulation' ? '🧪 시뮬레이션' : '📱 폰';
    }
    function render() {
        var tb = $('mTable').tBodies[0], now = Date.now();
        if (!state.items.length) {
            tb.innerHTML = '<tr><td colspan="9" class="note" style="text-align:center">아직 측정이 없어요. 폰에서 보내거나 CSV 를 불러오세요.</td></tr>';
        } else {
            tb.innerHTML = state.items.map(function (it, i) {
                var off = state.excluded.indexOf(it.id) >= 0, fresh = state.fresh[it.id] && now - state.fresh[it.id] < 15000;
                return '<tr class="' + (off ? 'off' : '') + (fresh ? ' fresh' : '') + '" data-id="' + esc(it.id) + '">' +
                    '<td><input type="checkbox" data-act="use" aria-label="' + (i + 1) + '번 계산에 쓰기"' + (off ? '' : ' checked') + '></td>' +
                    '<td>' + (i + 1) + '</td><td>' + fmt(it.L, 3) + '</td><td>' + fmt(it.T, 4) + '</td>' +
                    '<td>' + (it.Tstd == null ? '-' : fmt(it.Tstd, 4)) + '</td><td>' + fmt(it.T * it.T, 4) + '</td>' +
                    '<td>' + (it.n == null ? '-' : it.n) + '</td><td title="' + esc(it.note || '') + '">' + sourceLabel(it) + '</td>' +
                    '<td>' + (it.from === 'server' ? (it.hasRaw ? '<button data-act="raw" title="원본 데이터를 CSV 로 저장">원본</button>' : '') : '<button data-act="del" title="이 줄 지우기">지우기</button>') + '</td></tr>';
            }).join('');
        }
        renderFit();
    }
    $('mTable').addEventListener('change', function (e) {
        var tr = e.target.closest('tr[data-id]');
        if (!tr || e.target.dataset.act !== 'use') return;
        var id = tr.dataset.id, k = state.excluded.indexOf(id);
        if (e.target.checked && k >= 0) state.excluded.splice(k, 1);
        if (!e.target.checked && k < 0) state.excluded.push(id);
        persist(); render();
    });
    $('mTable').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-act]'), tr = e.target.closest('tr[data-id]');
        if (!b || !tr) return;
        var id = tr.dataset.id;
        if (b.dataset.act === 'del') {
            state.items = state.items.filter(function (it) { return it.id !== id; });
            persist(); render();
        } else if (b.dataset.act === 'raw') downloadRaw(id, b);
    });

    async function downloadRaw(id, btn) {
        var it = state.items.filter(function (x) { return x.id === id; })[0];
        btn.disabled = true; btn.textContent = '…';
        var res = await PC.raw(SERVER.url, state.group, id);
        btn.disabled = false; btn.textContent = '원본';
        if (!res.ok) { $('importMsg').textContent = '원본을 가져오지 못했어요: ' + res.error; return; }
        var samples = PC.unpackSamples(res.raw);
        var meta = { group: state.group, L: it.L, amplitude: it.amplitude, note: it.note, source: it.source, measuredAt: it.at,
            sensorAxis: it.axis, kind: it.kind, nPeriods: it.n, T_mean: it.T, T_std: it.Tstd };
        var r = PM.analyze(samples, { kind: it.kind || 'gyro', nPeriods: it.n || 10 });
        downloadText('pendulum_' + state.group + '_L' + fmt(it.L, 2) + '.csv', PM.toCsv(meta, r, samples));
    }
    function downloadText(name, text) {
        var url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
        var a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    // ---------- CSV 불러오기·직접 넣기 ----------
    function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
    function ensureGroupForLocal() {
        if (state.group) return true;
        $('importMsg').textContent = '먼저 ① 조 코드를 만들거나 연결해 주세요 (표가 조별로 저장돼요).';
        return false;
    }
    async function importFiles(files) {
        if (!ensureGroupForLocal()) return;
        var msgs = [];
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            try {
                var text = await f.text();
                var d = PM.parseCsv(text), m = d.meta;
                var T = Number(m.T_mean), Tstd = m.T_std === '' ? null : Number(m.T_std), n = Number(m.nPeriods) || null;
                if (!(T > 0) && d.samples.length) {
                    var r = PM.analyze(d.samples, { kind: m.kind || 'gyro', nPeriods: 10 });
                    if (!r.error) { T = r.T; Tstd = r.Tstd; n = r.n; }
                }
                var L = Number(m.L);
                if (!(L > 0)) {
                    var ask = prompt(f.name + ' 에 줄 길이 L 이 없어요. L (m) 을 입력하세요:', '');
                    L = Number(ask);
                }
                if (!(T > 0) || !(L > 0)) { msgs.push('❌ ' + f.name + ': 진자 측정 CSV 가 아니거나 L·T 가 없어요.'); continue; }
                var id = 'csv-' + hash(f.name + '|' + T + '|' + L);
                var merged = PC.mergeItems(state.items, [{ id: id, from: 'csv', L: L, T: T, Tstd: Number.isFinite(Tstd) ? Tstd : null, n: n,
                    amplitude: Number(m.amplitude) || null, note: m.note || f.name, kind: m.kind, source: m.source }]);
                state.items = merged.items;
                msgs.push('✅ ' + f.name + ': L = ' + fmt(L, 2) + ' m, T = ' + fmt(T, 3) + ' s');
            } catch (e) {
                msgs.push('❌ ' + f.name + ': 읽지 못했어요 (' + (e && e.message || e) + ')');
            }
        }
        $('importMsg').innerHTML = msgs.map(esc).join('<br>');
        persist(); render();
    }
    function addManual() {
        if (!ensureGroupForLocal()) return;
        var L = Number($('mL').value), T = Number($('mT').value), s = $('mS').value === '' ? null : Number($('mS').value);
        if (!(L > 0) || !(T > 0)) { $('importMsg').textContent = 'L 과 T 를 0 보다 큰 수로 넣어 주세요.'; return; }
        state.items.push({ id: 'man-' + Date.now().toString(36), from: 'manual', L: L, T: T, Tstd: s, n: null });
        $('mL').value = ''; $('mT').value = ''; $('mS').value = '';
        $('importMsg').textContent = '✅ 넣었어요: L = ' + fmt(L, 2) + ' m, T = ' + fmt(T, 3) + ' s';
        persist(); render();
    }
    function tableCsv() {
        var rows = ['# 스마트폰 진자 측정값 표 (조 코드 ' + (state.group || '') + ')', 'use,L (m),T_mean (s),T_std (s),T^2 (s^2),nPeriods,source,note'];
        state.items.forEach(function (it) {
            var note = String(it.note || '').replace(/"/g, '""');
            rows.push([state.excluded.indexOf(it.id) < 0 ? 1 : 0, it.L, fmt(it.T, 5), it.Tstd == null ? '' : fmt(it.Tstd, 5), fmt(it.T * it.T, 5),
                it.n == null ? '' : it.n, sourceLabel(it).replace(/^\S+\s/, ''), '"' + note + '"'].join(','));
        });
        var f = PM.fitT2L(included(), gRef());
        if (f) rows.push('', 'slope,' + f.slope, 'intercept,' + f.intercept, 'g,' + f.g, 'd,' + f.d, 'g_error_percent,' + f.gError);
        downloadText('pendulum_table_' + (state.group || '') + '.csv', rows.join('\r\n') + '\r\n');
    }

    // ---------- T²–L 직선 ----------
    function gRef() { var g = Number($('gRef').value); return g > 0 ? g : PM.G_REF; }
    function renderFit() {
        var pts = included(), distinct = {}, box = $('fitBox');
        pts.forEach(function (p) { distinct[p.L] = 1; });
        var fit = Object.keys(distinct).length >= 2 ? PM.fitT2L(pts, gRef()) : null;
        drawChart(pts, fit);
        if (!fit) {
            box.textContent = '서로 다른 길이 L 의 측정이 2개 이상 모이면 계산해요 (지금 ' + pts.length + '개). 4개 이상이면 더 믿을 만해요.';
            $('fitSteps').innerHTML = '';
            $('fitBrief').textContent = pts.length ? '측정 ' + pts.length + '개. 길이를 바꿔 더 재 보세요.' : '';
            return;
        }
        var k = 4 * Math.PI * Math.PI;
        box.innerHTML = '<div><span class="big">g = ' + fmt(fit.g, 3) + (pts.length > 2 ? ' ± ' + fmt(fit.sg, 3) : '') + ' m/s²</span></div>' +
            '<ul><li>기준값 ' + fmt(gRef(), 3) + ' m/s² 와의 차이(오차율): <b>' + (fit.gError >= 0 ? '+' : '') + fmt(fit.gError, 2) + ' %</b></li>' +
            '<li>기울기 = ' + fmt(fit.slope, 4) + ' s²/m, 절편 = ' + fmt(fit.intercept, 4) + ' s², 결정계수 R² = ' + fmt(fit.r2, 4) + '</li>' +
            '<li>절편으로 구한 d = ' + fmt(fit.d * 100, 1) + ' cm (줄 끝에서 폰 무게중심까지 더해진 길이)' +
            (fit.d < 0 ? ' — 음수예요. L 을 무게중심보다 길게 쟀거나, 측정값이 흩어졌을 수 있어요.' : '') + '</li>' +
            '<li>사용한 측정: ' + pts.length + '개' + (pts.length < 4 ? ' (4개 이상이면 더 믿을 만해요)' : '') + '</li></ul>';
        $('fitBrief').textContent = '측정 ' + pts.length + '개 → g ≈ ' + fmt(fit.g, 2) + ' m/s² (자세히: 6. 결과)';
        $('fitSteps').innerHTML = '<ol>' +
            '<li>각 측정의 T 를 제곱해 T² 을 구해요 (표의 T² 칸).</li>' +
            '<li>점 (L, T²) ' + pts.length + '개에 최소제곱법으로 직선 T² = a·L + b 를 맞춰요: a = ' + fmt(fit.slope, 5) + ', b = ' + fmt(fit.intercept, 5) + '</li>' +
            '<li>g = 4π² ÷ a = ' + fmt(k, 4) + ' ÷ ' + fmt(fit.slope, 5) + ' = <b>' + fmt(fit.g, 3) + ' m/s²</b>' + (pts.length > 2 ? ' (기울기의 표준오차 ' + fmt(fit.sSlope, 5) + ' → g 의 불확도 ± ' + fmt(fit.sg, 3) + ')' : '') + '</li>' +
            '<li>d = b ÷ a = ' + fmt(fit.intercept, 5) + ' ÷ ' + fmt(fit.slope, 5) + ' = ' + fmt(fit.d, 4) + ' m</li>' +
            '<li>오차율 = (g − 기준값) ÷ 기준값 × 100 = (' + fmt(fit.g, 3) + ' − ' + fmt(gRef(), 3) + ') ÷ ' + fmt(gRef(), 3) + ' × 100 = ' + fmt(fit.gError, 2) + ' %</li></ol>';
    }
    function drawChart(pts, fit) {
        if (typeof Chart === 'undefined') return;
        var data = pts.map(function (p) { return { x: p.L, y: p.T * p.T, T: p.T }; });
        var ds = [{ type: 'scatter', label: '측정 (L, T²)', data: data, backgroundColor: '#1565c0', borderColor: '#1565c0', pointRadius: 6, pointHoverRadius: 8 }];
        if (fit) {
            var xs = pts.map(function (p) { return p.L; });
            var x0 = Math.min(0, -fit.d, Math.min.apply(null, xs)), x1 = Math.max.apply(null, xs) * 1.05;
            ds.push({ type: 'line', label: '최소제곱 직선', data: [{ x: x0, y: fit.slope * x0 + fit.intercept }, { x: x1, y: fit.slope * x1 + fit.intercept }],
                borderColor: '#0e7490', borderWidth: 2, pointRadius: 0, pointHoverRadius: 0 });
        }
        var cfg = {
            data: { datasets: ds },
            options: {
                animation: false, responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: true },
                plugins: {
                    tooltip: {
                        filter: function (it) { return it.datasetIndex === 0; },
                        callbacks: { label: function (it) { var r = it.raw; return 'L = ' + fmt(r.x, 3) + ' m, T² = ' + fmt(r.y, 4) + ' s² (T = ' + fmt(r.T, 4) + ' s)'; } }
                    }
                },
                scales: {
                    x: { type: 'linear', title: { display: true, text: '줄 길이 L (m)' } },
                    y: { title: { display: true, text: 'T² (s²)' }, beginAtZero: true }
                }
            }
        };
        if (chart) { chart.data = cfg.data; chart.update('none'); }
        else chart = new Chart($('fitChart'), cfg);
    }

    // ---------- 시작 ----------
    function init() {
        if (!SERVER.url) $('cfgWarn').hidden = false;
        showServer();
        $('gRef').value = load(GREF_KEY, '9.80');
        $('gRef').addEventListener('input', function () { save(GREF_KEY, $('gRef').value); renderFit(); });
        $('btnMake').addEventListener('click', function () {
            var code = PC.makeGroupCode($('gBan').value, $('gJo').value);
            if (!code) { $('groupMsg').textContent = '반과 조를 1~99 사이 숫자로 넣어 주세요.'; return; }
            setGroup(code);
        });
        $('btnJoin').addEventListener('click', function () {
            var code = PC.normalizeGroup($('gCode').value);
            if (!PC.isGroupCode(code)) { $('groupMsg').textContent = '조 코드는 "반-조-숫자4개" 모양이에요 (예: 2-3-4821).'; return; }
            setGroup(code);
        });
        $('btnLeave').addEventListener('click', leaveGroup);
        $('btnCopy').addEventListener('click', async function () {
            try { await navigator.clipboard.writeText(measureUrl()); $('btnCopy').textContent = '✅ 복사함'; }
            catch (e) { prompt('아래 주소를 복사하세요.', measureUrl()); }
            setTimeout(function () { $('btnCopy').textContent = '🔗 주소 복사'; }, 1500);
        });
        $('btnBigQr').addEventListener('click', function () {
            $('bigQrImg').innerHTML = qrSvg(measureUrl()) || '';
            $('bigQrCode').textContent = state.group;
            $('bigQr').hidden = false;
        });
        $('btnBigClose').addEventListener('click', function () { $('bigQr').hidden = true; });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('bigQr').hidden = true; });
        var drop = $('drop'), input = $('fileInput');
        drop.addEventListener('click', function () { input.click(); });
        drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
        input.addEventListener('change', function () { importFiles(Array.prototype.slice.call(input.files)); input.value = ''; });
        ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
        ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
        drop.addEventListener('drop', function (e) { importFiles(Array.prototype.slice.call(e.dataTransfer.files)); });
        $('btnManual').addEventListener('click', addManual);
        $('btnTableCsv').addEventListener('click', tableCsv);

        window.LabUI && LabUI.initSteps({ key: 'pendulum-report', onShow: function (step) { if (step === 'result') renderFit(); } });
        var m = /[?&]group=([^&#]*)/.exec(location.search);
        var code = m ? PC.normalizeGroup(decodeURIComponent(m[1])) : load(GROUP_KEY, null);
        if (code && PC.isGroupCode(code)) setGroup(code); else render();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
