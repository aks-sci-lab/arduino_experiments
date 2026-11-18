/* 개발 데이터 자동 수집 (2026-11-17, 선생님 요청 "개발 단계에서는 측정 데이터를 깃허브로 바로 수집")
   - 켜지는 때: js/pendulum-config.js 의 devCollect: true  그리고  이 브라우저가 사이트 관리 교사 구글 계정으로 로그인했을 때
     (교사 화면 projects/class-teacher.html 에서 로그인, Firestore roles/{uid}.isTeacher) → 선생님 기기에서만.
     학생 기기(익명)는 아무것도 하지 않는다. (2026-11-18 Apps Script 관리 열쇠 대신 구글 로그인)
   - 켜지면 페이지 위에 작은 띠 '🧪 개발 데이터 자동 수집 중 (선생님 기기)' · '이 기기 끄기'
   - DevCollect.send(exp, { id, measuredAt, summary, data }) : 측정 하나가 끝날 때 부른다. 실패하면 이 기기에 쌓아 두고 다음에 다시.
   - 저장: Firestore devlog (js/lab-store.js devSave). GitHub Actions(dev-data-collect.yml)가 서비스 계정으로 읽어 dev-data 브랜치에
   - 이 기기에서 다시 켜기: 주소 끝에 ?devcollect=on
   사용법: docs/dev-data.md */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.DevCollect = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    var QUEUE_KEY = 'dev-collect:queue', OFF_KEY = 'dev-collect:off', DEV_KEY = 'dev-collect:device', COUNT_KEY = 'dev-collect:sent';
    var QUEUE_MAX = 30, ID_RE = /^[A-Za-z0-9_-]{6,40}$/;

    // 기기 정보 짧게 (이름 없음): 예 'Android 14; SM-S918N · Chrome 131'
    function uaSummary(ua) {
        ua = String(ua || '');
        var m = /\(([^)]*)\)/.exec(ua), inside = m ? m[1].split(';').map(function (s) { return s.trim(); }).filter(function (s) { return s && !/^(Linux|U|wv|K|x64|Win64|Mobile)$/.test(s) && !/^[a-z]{2}-[A-Z]{2}$/.test(s); }).slice(0, 3).join('; ') : '';
        var b = /(Edg|SamsungBrowser|CriOS|FxiOS|Firefox|Chrome|Version)\/(\d+)/.exec(ua);
        var name = b ? ({ Edg: 'Edge', CriOS: 'Chrome(iOS)', FxiOS: 'Firefox(iOS)', Version: /Safari/.test(ua) ? 'Safari' : 'Browser' }[b[1]] || b[1]) + ' ' + b[2] : '';
        return (inside + (name ? ' · ' + name : '')).slice(0, 120);
    }
    function makeId(device, now) { return ('d' + device + '-' + Math.floor(now / 1000).toString(36)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40); }

    // 화면 없는 핵심 (시험용으로 밖에서 store·post 를 넣을 수 있음). o.admin: 선생님(사이트 관리 교사) 구글 로그인 기기인지
    function create(o) {
        var store = o.store, post = o.post, now = o.now || function () { return Date.now(); };
        var get = function (k) { try { return store && store.getItem(k); } catch (e) { return null; } };
        var set = function (k, v) { try { if (store) store.setItem(k, v); } catch (e) { /* 저장 불가 */ } };
        var admin = o.enabled !== false && !!o.admin;
        var device = get(DEV_KEY);
        if (!/^[A-Za-z0-9_-]{4,20}$/.test(device || '')) { device = 'dv' + Math.random().toString(36).slice(2, 10); set(DEV_KEY, device); }
        var off = get(OFF_KEY) === '1';
        var queue = []; try { queue = JSON.parse(get(QUEUE_KEY) || '[]'); if (!Array.isArray(queue)) queue = []; } catch (e) { queue = []; }
        var busy = null, last = { ok: null, error: '' };
        var api = {
            active: function () { return !!admin && !off; },
            available: function () { return !!admin; },
            device: function () { return device; },
            pending: function () { return queue.length; },
            sent: function () { return Number(get(COUNT_KEY)) || 0; },
            last: function () { return last; },
            setOff: function (v) { off = !!v; set(OFF_KEY, off ? '1' : ''); },
            // 측정 하나 보내기 (쌓아 두고 바로 시도)
            send: function (exp, rec) {
                if (!api.active()) return Promise.resolve({ ok: false, skipped: true });
                rec = rec || {};
                var id = rec.id && ID_RE.test(String(rec.id)) ? String(rec.id) : makeId(device, now());
                var item = { action: 'devSave', exp: String(exp), id: id, measuredAt: rec.measuredAt || new Date(now()).toISOString(), device: device,
                    summary: rec.summary || {}, data: typeof rec.data === 'string' ? rec.data : JSON.stringify(rec.data == null ? {} : rec.data) };
                queue = queue.filter(function (q) { return !(q.exp === item.exp && q.id === item.id); });   // 같은 측정은 새것으로
                queue.push(item);
                while (queue.length > QUEUE_MAX) queue.shift();
                set(QUEUE_KEY, JSON.stringify(queue));
                return api.flush().then(function (r) { return Object.assign({ id: id }, r); });
            },
            // 쌓인 것 보내기 (차례로, 실패하면 멈추고 다음에)
            flush: function () {
                if (!api.active()) return Promise.resolve({ ok: false, skipped: true });
                if (busy) return busy;
                busy = (async function () {
                    var done = 0;
                    while (queue.length) {
                        var item = queue[0], r;
                        try { r = await post(item); } catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
                        if (!r || !r.ok) {
                            last = { ok: false, error: (r && r.error) || '보내지 못함' };
                            if (/권한 없음|구글 로그인 기기에서만/.test(last.error)) off = true;   // 선생님 계정이 아니면 이 기기는 멈춤 (화면에 안내)
                            return { ok: false, error: last.error, done: done, pending: queue.length };
                        }
                        queue.shift(); done++; set(QUEUE_KEY, JSON.stringify(queue)); set(COUNT_KEY, String(api.sent() + 1));
                    }
                    last = { ok: true, error: '' };
                    return { ok: true, done: done, pending: 0 };
                })().finally(function () { busy = null; });
                return busy;
            }
        };
        return api;
    }

    // 브라우저: 설정·로그인을 확인하고, 켜지면 띠를 붙인다 (로그인 확인이 비동기라 Promise)
    var inst = null, starting = null;
    function init() {
        if (starting) return starting;
        if (typeof window === 'undefined') return Promise.resolve(null);
        var CFG = window.PENDULUM_CONFIG || {}, LS = null;
        try { LS = window.localStorage; } catch (e) { LS = null; }
        if (/[?&]devcollect=on\b/.test(location.search)) { try { LS.removeItem(OFF_KEY); } catch (e) { /* 무시 */ } }
        starting = (async function () {
            var admin = false, L = window.LabStore;
            if (CFG.devCollect === true && L) { try { admin = await L.isTeacher(); } catch (e) { admin = false; } }
            inst = create({ store: LS, post: function (body) { return L.call('lab:', body); }, enabled: CFG.devCollect === true, admin: admin });
            if (inst.available()) mountBar();
            if (inst.active() && inst.pending()) inst.flush().then(renderBar);
            if (!init.timer) init.timer = setInterval(function () { if (inst.active() && inst.pending() && !document.hidden) inst.flush().then(renderBar); }, 60000);
            return inst;
        })();
        return starting;
    }
    function flash(text) {
        var d = document.createElement('div');
        d.setAttribute('role', 'status'); d.textContent = text;
        d.style.cssText = 'padding:8px 12px;background:var(--c-fill);border-bottom:1px solid var(--c-line)';
        document.body.insertBefore(d, bar ? bar.nextSibling : document.body.firstChild);
        setTimeout(function () { d.remove(); }, 12000);
    }
    var bar = null;
    function mountBar() {
        if (bar) { renderBar(); return; }
        bar = document.createElement('div');
        bar.className = 'dev-collect';
        bar.setAttribute('role', 'status');
        bar.style.cssText = 'position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:6px 12px;' +
            'background:var(--c-warn-bg);color:var(--c-warn-text);border-bottom:2px solid var(--c-warn-text);font:inherit;font-size:.9em';
        document.body.insertBefore(bar, document.body.firstChild);
        bar.addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            if (b.dataset.act === 'off') { if (window.confirm('이 기기에서 개발 데이터 자동 수집을 끌까요? (다시 켜려면 주소 끝에 ?devcollect=on)')) inst.setOff(true); }
            if (b.dataset.act === 'on') inst.setOff(false);
            if (b.dataset.act === 'retry') inst.flush().then(renderBar);
            renderBar();
        });
        renderBar();
    }
    function renderBar() {
        if (!bar || !inst) return;
        var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        if (!inst.active()) { bar.innerHTML = '<span>🧪 개발 데이터 수집 꺼짐 (이 기기)</span><button type="button" data-act="on">다시 켜기</button>'; return; }
        var l = inst.last();
        bar.innerHTML = '<span>🧪 <b>개발 데이터 자동 수집 중</b> (선생님 기기) · 보냄 ' + inst.sent() + (inst.pending() ? ' · <b>대기 ' + inst.pending() + '</b>' : '') + '</span>' +
            (l.ok === false ? '<span>⚠ ' + esc(l.error).slice(0, 80) + '</span><button type="button" data-act="retry">다시 보내기</button>' : '') +
            '<button type="button" data-act="off">이 기기 끄기</button>';
    }
    function send(exp, rec) {
        return init().then(function (d) {
            if (!d || !d.active()) return { ok: false, skipped: true };
            var p = d.send(exp, rec); p.then(renderBar); renderBar();
            return p;
        });
    }
    // 페이지를 열면 바로 확인 (켜져 있으면 띠, 쌓인 것 보내기)
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
    }
    return { create: create, init: init, send: send, uaSummary: uaSummary, makeId: makeId,
        active: function () { return !!(inst && inst.active()); }, device: function () { return inst ? inst.device() : ''; } };
});
