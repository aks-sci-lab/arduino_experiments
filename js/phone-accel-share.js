/* 스마트폰 가속도 실험 — 👥 조 공유 (구글 로그인 없이, 조 코드로 선생님 구글 시트에 보내고 같은 조 기기에서 불러오기)
   - 보낼 것: 지금 화면의 기록(구간을 잘랐으면 자른 것) 하나 = 시트 한 줄 (id 'rec')
   - 받은 것: 같은 조 다른 기기의 기록 → '📥 같은 조에서 불러온 기록' 목록, 체크하면 그래프에 |a| 점선으로 겹쳐 보기, CSV 받기
   쓰는 것: js/phone-accel.js 의 window.__phoneAccel, js/class-share.js(docs/class-share.md), js/accelerometer-share.js */
(function () {
    'use strict';
    const api = window.__phoneAccel, CS = window.ClassShare, AS = window.AccelShare;
    if (!api || !CS || !AS) return;
    const IN_KEY = 'phone-accel:incoming';
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    let incoming = {};
    try { incoming = JSON.parse(localStorage.getItem(IN_KEY) || '{}') || {}; } catch (e) { incoming = {}; }
    const shown = new Set();
    function saveIncoming() { try { localStorage.setItem(IN_KEY, JSON.stringify(incoming)); } catch (e) { /* 저장 불가 */ } }

    // 내 기록 → [[t(s), ax, ay, az]] (첫 샘플이 0초)
    function myRows() {
        const s = api.getSamples() || [];
        if (!s.length) return [];
        const t0 = s[0].rel;
        return s.map(p => [(p.rel - t0) / 1000, p.ax, p.ay, p.az]);
    }
    function items() {
        if (api.isRecording()) return [];   // 기록 중에는 보내지 않음 (멈춘 뒤에)
        const rows = myRows();
        return rows.length ? [AS.accelItem('rec', '스마트폰 기록', rows)] : [];
    }

    function applyOverlays() {
        api.setOverlays([...shown].filter(k => incoming[k]).map(k => {
            const it = incoming[k];
            return { label: '📥 ' + it.from + ' |a|', points: it.rows.map(r => ({ x: r[0] * 1000, y: Math.sqrt(r[1] * r[1] + r[2] * r[2] + r[3] * r[3]) })) };
        }));
    }
    function downloadCsv(key) {
        const it = incoming[key];
        if (!it) return;
        let csv = 'time(ms),ax(g),ay(g),az(g)\n';
        it.rows.forEach(r => { csv += `${(r[0] * 1000).toFixed(1)},${r[1].toFixed(4)},${r[2].toFixed(4)},${r[3].toFixed(4)}\n`; });
        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        a.download = 'phone_accelerometer_' + String(it.device || 'other').slice(-4) + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
    }
    function renderIncoming() {
        const keys = Object.keys(incoming);
        $('in-box').hidden = !keys.length;
        $('in-sum').textContent = keys.length ? '— ' + keys.length + '개' : '';
        $('in-list').innerHTML = keys.map((k, i) => {
            const it = incoming[k], sm = it.summary || {};
            return `<li><label><input type="checkbox" data-k="${i}"${shown.has(k) ? ' checked' : ''}> 📥 ${esc(it.from)} · ${esc(it.title)}</label>` +
                `<span class="sm">샘플 ${it.rows.length}개` + (sm['시간 (s)'] != null ? `, ${esc(sm['시간 (s)'])} s` : '') +
                (sm['최대 a (g)'] != null ? `, 최대 |a| ${esc(sm['최대 a (g)'])} g` : '') + `</span>` +
                `<button type="button" class="btn-info" data-csv="${i}">CSV</button></li>`;
        }).join('');
        $('in-list').querySelectorAll('input[data-k]').forEach(cb => cb.addEventListener('change', () => {
            const k = keys[Number(cb.dataset.k)];
            if (cb.checked) shown.add(k); else shown.delete(k);
            applyOverlays();
        }));
        $('in-list').querySelectorAll('button[data-csv]').forEach(b => b.addEventListener('click', () => downloadCsv(keys[Number(b.dataset.csv)])));
        [...shown].forEach(k => { if (!incoming[k]) shown.delete(k); });
        applyOverlays();
    }

    let share = null;
    try {
        share = CS.init({
            exp: 'phoneaccel',
            barMount: '#class-bar-mount', shareMount: '#share-mount',
            csvHint: '맨 위 CSV 다운로드',
            getItems: items,
            onIncoming(list) {
                const r = AS.replaceIncoming(incoming, list, it => {
                    const rows = AS.accelRows(it.data);
                    return rows.length ? { rows } : null;
                });
                if (!r.changed) return false;
                incoming = r.store;
                saveIncoming();
                renderIncoming();
                return true;
            },
            incomingCount: () => Object.keys(incoming).length,
            clearIncoming() { incoming = {}; shown.clear(); saveIncoming(); renderIncoming(); },
            // 교사 진행 보기 (DASH 단계): 기록 중 / 기록 있음
            getStep: () => (api.isRecording() || !(api.getSamples() || []).length) ? 'live' : 'record',
            getPoints: () => (api.getSamples() || []).length
        });
    } catch (e) { console.error('조 공유 준비 실패', e); }
    renderIncoming();
    api.onChange(() => { if (share) { share.stepChanged(); share.render(); } });
    document.getElementById('btn-start').addEventListener('click', () => { if (share) setTimeout(() => share.stepChanged(), 0); });
    window.__phoneAccelShare = { items, incoming: () => incoming };
})();
