/* 스마트폰 가속도 실험 — 👥 조 공유 + 📱 폰 연결 (구글 로그인 없이, 조 코드로 선생님 구글 시트에 보내고 같은 조 기기에서 불러오기)
   - 보낼 것: 이 기기의 회차('▶ 시작 → ■ 중지' 한 번 = 회차 하나, js/phone-accel.js) 하나 = 시트 한 줄
   - 📱 폰 연결: 노트북 '📱 폰으로 측정하기' QR → 폰에서 여러 회 측정 → 폰 띠에서 보낼 회차를 골라 📤 → 노트북에 📱 폰 기록으로 자동 추가
   - 받은 것: '📥 같은 조에서 불러온 기록' 목록(샘플·시간·평균·최대 |a|), 체크하면 그래프에 |a| 점선, 📈 보기로 크게 띄워 구간 고르기, CSV
   쓰는 것: js/phone-accel.js 의 window.__phoneAccel, js/class-share.js(docs/class-share.md), js/accelerometer-share.js */
(function () {
    'use strict';
    const api = window.__phoneAccel, CS = window.ClassShare, AS = window.AccelShare;
    if (!api || !CS || !AS) return;
    const IN_KEY = 'phone-accel:incoming';
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // 기기 종류 (js/lab-ui.js 의 LabUI.device): 노트북·PC 는 분석만, 폰은 측정, 태블릿은 둘 다 (AGENTS.md UI 규칙 '폰 측정 · 노트북 분석 이원화')
    const isLaptop = () => document.documentElement.classList.contains('device-laptop');
    // 노트북의 QR 로 연 화면(?role=phone)은 터치가 없는 브라우저여도 폰 화면으로 (이 페이지에서만, 기억하지 않음)
    function forcePhoneView() {
        const html = document.documentElement;
        if (!html.classList.contains('device-laptop')) return;
        html.classList.remove('device-laptop'); html.classList.add('device-phone'); html.setAttribute('data-device', 'phone');
    }
    // 다른 기기 기록을 그래프에 크게 띄우기
    function view(k) {
        const it = incoming[k];
        if (!it || api.isRecording()) return false;
        fresh.delete(k);
        api.showSamples(it.rows.map(r => ({ t: 0, rel: r[0] * 1000, ax: r[1], ay: r[2], az: r[3] })), null, it.from + ' · ' + it.title);
        return true;
    }

    let incoming = {};
    try { incoming = JSON.parse(localStorage.getItem(IN_KEY) || '{}') || {}; } catch (e) { incoming = {}; }
    const shown = new Set(), fresh = new Set();
    function saveIncoming() { try { localStorage.setItem(IN_KEY, JSON.stringify(incoming)); } catch (e) { /* 저장 불가 */ } }

    // 회차 → [[t(s), ax, ay, az]] (첫 샘플이 0초)
    function rowsOf(list) {
        if (!list || !list.length) return [];
        const t0 = list[0].rel;
        return list.map(p => [(p.rel - t0) / 1000, p.ax, p.ay, p.az]);
    }
    function items() {
        return api.getRuns().map(r => Object.assign(AS.accelItem(r.id, r.title, rowsOf(r.samples)), { at: r.at }));
    }
    const totalPoints = () => api.getRuns().reduce((n, r) => n + r.samples.length, 0);

    function applyOverlays() {
        api.setOverlays([...shown].filter(k => incoming[k]).map(k => {
            const it = incoming[k];
            return { label: '📥 ' + it.from + ' ' + it.title + ' |a|', points: it.rows.map(r => ({ x: r[0] * 1000, y: Math.sqrt(r[1] * r[1] + r[2] * r[2] + r[3] * r[3]) })) };
        }));
    }
    function downloadCsv(key) {
        const it = incoming[key];
        if (!it) return;
        let csv = 'time(ms),ax(g),ay(g),az(g)\n';
        it.rows.forEach(r => { csv += `${(r[0] * 1000).toFixed(1)},${r[1].toFixed(4)},${r[2].toFixed(4)},${r[3].toFixed(4)}\n`; });
        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        a.download = 'phone_accelerometer_' + String(it.device || 'other').slice(-4) + '_' + String(it.id || '').slice(0, 12) + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
    }
    function renderIncoming() {
        const keys = Object.keys(incoming);
        $('in-box').hidden = !keys.length;
        $('in-sum').textContent = keys.length ? '— ' + keys.length + '개' + (fresh.size ? ' (🆕 ' + fresh.size + ')' : '') : '';
        $('in-list').innerHTML = keys.map((k, i) => {
            const it = incoming[k], sm = it.summary || {};
            return `<li${fresh.has(k) ? ' class="new"' : ''}><label><input type="checkbox" data-k="${i}"${shown.has(k) ? ' checked' : ''}> ${fresh.has(k) ? '🆕 ' : '📥 '}${esc(it.from)} · ${esc(it.title)}</label>` +
                `<span class="sm">샘플 ${it.rows.length}개` + (sm['시간 (s)'] != null ? `, ${esc(sm['시간 (s)'])} s` : '') +
                (sm['평균 a (g)'] != null ? `, 평균 |a| ${esc(sm['평균 a (g)'])} g` : '') +
                (sm['최대 a (g)'] != null ? `, 최대 |a| ${esc(sm['최대 a (g)'])} g` : '') + `</span>` +
                `<button type="button" data-view="${i}">📈 보기</button><button type="button" class="btn-info" data-csv="${i}">CSV</button></li>`;
        }).join('');
        [...shown].forEach(k => { if (!incoming[k]) shown.delete(k); });
        [...fresh].forEach(k => { if (!incoming[k]) fresh.delete(k); });
        applyOverlays();
    }
    // 목록의 체크·단추 (목록을 다시 그려도 한 번만 붙임)
    $('in-list').addEventListener('change', e => {
        const cb = e.target.closest('input[data-k]');
        if (!cb) return;
        const k = Object.keys(incoming)[Number(cb.dataset.k)];
        if (cb.checked) shown.add(k); else shown.delete(k);
        applyOverlays();
    });
    $('in-list').addEventListener('click', e => {
        const keys = Object.keys(incoming), v = e.target.closest('[data-view]'), c = e.target.closest('[data-csv]');
        if (c) downloadCsv(keys[Number(c.dataset.csv)]);
        if (v) {
            const k = keys[Number(v.dataset.view)], it = incoming[k];
            if (!it) return;
            if (api.isRecording()) { alert('기록을 멈춘 뒤에 보세요.'); return; }
            // 내 회차는 회차 목록에 남아 있으므로 다른 기기 기록을 띄워도 잃지 않음
            view(k);
            renderIncoming();
            $('accChart').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });

    let share = null, role = 'laptop';
    try {
        share = CS.init({
            exp: 'phoneaccel',
            barMount: '#class-bar-mount', shareMount: '#share-mount',
            csvHint: '맨 위 CSV 다운로드',
            phone: true,                      // 노트북 '📱 폰으로 측정하기' → 같은 페이지를 폰으로 (?role=phone)
            onRole(r) {
                role = r;
                document.body.classList.toggle('is-phone', r === 'phone');
                if (r === 'phone') forcePhoneView();
                api.hideRunList(r === 'phone');   // 폰은 띠 안의 회차 고르기 목록을 씀
            },
            deleteItem: id => api.deleteRun(id),
            onPhoneData: () => { $('in-box').open = true; },
            getItems: items,
            onIncoming(list) {
                const r = AS.replaceIncoming(incoming, list, it => {
                    const rows = AS.accelRows(it.data);
                    return rows.length ? { rows } : null;
                });
                if (!r.changed) return false;
                // 새로 들어온 기록(특히 📱 폰)은 🆕 표시하고 그래프에 바로 겹쳐 보이게
                const added = [];
                Object.keys(r.store).forEach(k => {
                    if (!incoming[k] || String(incoming[k].sentAt) !== String(r.store[k].sentAt)) { fresh.add(k); shown.add(k); added.push(k); }
                });
                incoming = r.store;
                saveIncoming();
                // 💻 노트북(직접 재지 않음): 폰에서 새로 온 기록을 바로 그래프에 크게 — 분석은 노트북에서
                const fromPhone = added.filter(k => /^p/.test(String(incoming[k].device || '')));
                if (isLaptop() && fromPhone.length) { const k = fromPhone[fromPhone.length - 1]; view(k); fresh.add(k); }
                renderIncoming();
                return true;
            },
            incomingCount: () => Object.keys(incoming).length,
            clearIncoming() { incoming = {}; shown.clear(); fresh.clear(); saveIncoming(); renderIncoming(); },
            // 교사 진행 보기 (DASH 단계): 기록 중 / 기록 있음
            getStep: () => (api.isRecording() || !api.getRuns().length) ? 'live' : 'record',
            getPoints: totalPoints
        });
    } catch (e) { console.error('조 공유 준비 실패', e); }
    renderIncoming();
    // 💻 노트북·PC: 연결·상태 띠 아래 '📱 폰으로 측정해 보내기' QR 카드 (폰·태블릿에서는 숨김이라 만들지 않음 — 조 코드를 저절로 만들기 때문)
    let cardOn = false;
    function syncDevice() {
        if (share && isLaptop() && !cardOn) {
            cardOn = true; share.phoneCard('#phone-card');
            const sh = document.getElementById('cs-share'); if (sh) sh.open = false;   // 조 공유 칸은 접어 QR 카드가 먼저 보이게
        }
        if (isLaptop() && !api.getSamples().length) $('record-status').textContent = '💻 분석 화면 · 폰에서 보낸 기록을 기다리는 중';
    }
    if (window.LabUI && LabUI.deviceSwitch) LabUI.deviceSwitch('#device-switch');
    window.addEventListener('lab-device', syncDevice);
    syncDevice();
    api.onChange(runChanged => {
        if (!share) return;
        if (runChanged) share.saved();   // 폰: 회차 목록에 쌓임 (노트북: 아무것도 안 함)
        share.stepChanged(); share.render();
    });
    $('btn-start').addEventListener('click', () => { if (share) setTimeout(() => share.stepChanged(), 0); });
    window.__phoneAccelShare = { items, incoming: () => incoming, role: () => role, share: () => share };
})();
