/* 센서 기반 실험실 — 모든 페이지 공통 화면 기능
   - 크게 보기: Alt+B (맥은 Option+B) 로 켜고 끔. 교실 프로젝터로 띄울 때 글자·버튼·그래프를 함께 키운다.
     켠 상태는 이 브라우저에 기억되어 다른 실험 페이지로 가도 유지된다.
   <head> 안에서 defer 없이 불러와야 페이지가 처음 그려질 때부터 크게 보인다. */
(function () {
    'use strict';
    var KEY = 'lab-ui:big-view';
    var root = document.documentElement;

    function read() {
        try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
    }
    function write(on) {
        try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* 사생활 보호 모드: 이 페이지에서만 적용 */ }
    }
    function apply(on) {
        root.classList.toggle('big-view', on);
        // 그래프(Chart.js 등)가 새 크기에 맞춰 다시 그려지도록 알림
        window.dispatchEvent(new Event('resize'));
    }

    var toastTimer = null;
    function toast(text) {
        var el = document.getElementById('labToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'labToast';
            el.className = 'lab-toast';
            el.setAttribute('role', 'status');
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1600);
    }

    function toggle() {
        var on = !root.classList.contains('big-view');
        apply(on);
        write(on);
        toast(on ? '크게 보기 켜짐 (Alt+B 로 끄기)' : '크게 보기 꺼짐');
        return on;
    }

    if (read()) root.classList.add('big-view');

    document.addEventListener('keydown', function (e) {
        // e.code 를 써야 맥 Option+B(∫ 글자)와 한글 입력 상태에서도 동작한다
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyB') {
            e.preventDefault();
            toggle();
        }
    });

    /* 단계형 실험의 7단계 탭 (모양: css/lab-base.css 의 .steps)
       LabUI.initSteps({ key: '페이지별 저장 이름', onShow: function (step) { 그래프 다시 그리기 등 } })
       - nav.steps button[data-step] 을 누르거나 [data-go="단계"] 단추를 누르면 그 단계만 보인다
       - 본 단계는 ✓ 표시, 마지막으로 본 단계와 본 단계 목록은 이 브라우저에 기억
       - 주소 끝 #step-5 처럼 쓰면 그 단계로 바로 연다
       돌려주는 값: { show(step), current() } */
    function initSteps(opts) {
        opts = opts || {};
        var nav = document.querySelector('nav.steps');
        if (!nav) return null;
        var buttons = Array.prototype.slice.call(nav.querySelectorAll('button[data-step]'));
        var order = buttons.map(function (b) { return b.dataset.step; });
        var panels = Array.prototype.slice.call(document.querySelectorAll('.step-panel[data-step]'));
        var key = 'lab-steps:' + (opts.key || location.pathname);
        var saved = {};
        try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { saved = {}; }
        var seen = Array.isArray(saved.seen) ? saved.seen.filter(function (s) { return order.indexOf(s) >= 0; }) : [];
        var cur = null;

        function persist() {
            try { localStorage.setItem(key, JSON.stringify({ step: cur, seen: seen })); } catch (e) { /* 저장 불가: 무시 */ }
        }
        function show(step, scroll) {
            if (order.indexOf(step) < 0) step = order[0];
            cur = step;
            if (seen.indexOf(step) < 0) seen.push(step);
            panels.forEach(function (p) { p.hidden = p.dataset.step !== step; });
            buttons.forEach(function (b) {
                var on = b.dataset.step === step;
                b.setAttribute('aria-selected', on ? 'true' : 'false');
                b.tabIndex = on ? 0 : -1;
                b.classList.toggle('done', seen.indexOf(b.dataset.step) >= 0);
            });
            persist();
            if (scroll) window.scrollTo(0, 0);
            if (typeof opts.onShow === 'function') opts.onShow(step);
            // 숨어 있던 그래프가 보일 때 크기를 다시 잡도록
            window.dispatchEvent(new Event('resize'));
        }
        buttons.forEach(function (b) {
            b.setAttribute('role', 'tab');
            b.addEventListener('click', function () { show(b.dataset.step, true); });
        });
        // 왼쪽·오른쪽 화살표로 단계 옮기기
        nav.addEventListener('keydown', function (e) {
            var i = order.indexOf(cur);
            if (e.key === 'ArrowRight' && i < order.length - 1) { show(order[i + 1]); buttons[i + 1].focus(); }
            else if (e.key === 'ArrowLeft' && i > 0) { show(order[i - 1]); buttons[i - 1].focus(); }
        });
        document.addEventListener('click', function (e) {
            var go = e.target.closest && e.target.closest('[data-go]');
            if (go && order.indexOf(go.dataset.go) >= 0) show(go.dataset.go, true);
        });
        var fromHash = /^#step-(\d)$/.exec(location.hash);
        show(fromHash ? order[Number(fromHash[1]) - 1] : (opts.start || saved.step || order[0]));
        return { show: show, current: function () { return cur; } };
    }

    /* 페이지 안 작은 탭 (모양: css/lab-base.css 의 .subtabs) — 길게 스크롤하는 대신 내용을 나눠 보여 준다
       LabUI.initTabs(nav 또는 선택자, { key: '저장 이름(없으면 기억 안 함)', start: '처음 탭', onShow: function (tab) {} })
       - nav 안의 button[data-tab] 을 누르면 nav 와 같은 부모 아래의 .tab-panel[data-tab] 중 그 탭만 보인다
       - 다른 단추에서 [data-tab-go="탭"] 을 누르면 그 탭으로 간다
       돌려주는 값: { show(tab), current(), mark(tab) }  (mark: 새 내용이 생긴 탭에 작은 점) */
    function initTabs(nav, opts) {
        opts = opts || {};
        if (typeof nav === 'string') nav = document.querySelector(nav);
        if (!nav) return null;
        var buttons = Array.prototype.slice.call(nav.querySelectorAll('button[data-tab]'));
        var order = buttons.map(function (b) { return b.dataset.tab; });
        var panels = Array.prototype.slice.call(nav.parentElement.children).filter(function (el) {
            return el.classList.contains('tab-panel') && el.dataset.tab;
        });
        var key = opts.key ? 'lab-tabs:' + opts.key : null;
        var cur = null;
        nav.setAttribute('role', 'tablist');

        function show(tab, scroll) {
            if (order.indexOf(tab) < 0) tab = order[0];
            cur = tab;
            panels.forEach(function (p) { p.hidden = p.dataset.tab !== tab; });
            buttons.forEach(function (b) {
                var on = b.dataset.tab === tab;
                b.setAttribute('aria-selected', on ? 'true' : 'false');
                b.tabIndex = on ? 0 : -1;
                if (on) b.classList.remove('has-news');
            });
            if (key) { try { localStorage.setItem(key, tab); } catch (e) { /* 저장 불가: 무시 */ } }
            // 탭이 화면 위로 올라가 있으면 탭이 보이는 곳까지만 올린다
            if (scroll) {
                var top = nav.getBoundingClientRect().top;
                if (top < 0) window.scrollBy(0, top - 8);
            }
            if (typeof opts.onShow === 'function') opts.onShow(tab);
            window.dispatchEvent(new Event('resize'));
        }
        function mark(tab) {
            buttons.forEach(function (b) { if (b.dataset.tab === tab && tab !== cur) b.classList.add('has-news'); });
        }
        buttons.forEach(function (b) {
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.addEventListener('click', function () { show(b.dataset.tab, true); });
        });
        nav.addEventListener('keydown', function (e) {
            var i = order.indexOf(cur);
            if (e.key === 'ArrowRight' && i < order.length - 1) { show(order[i + 1]); buttons[i + 1].focus(); }
            else if (e.key === 'ArrowLeft' && i > 0) { show(order[i - 1]); buttons[i - 1].focus(); }
        });
        document.addEventListener('click', function (e) {
            var go = e.target.closest && e.target.closest('[data-tab-go]');
            if (go && order.indexOf(go.dataset.tabGo) >= 0) show(go.dataset.tabGo, true);
        });
        var saved = null;
        if (key) { try { saved = localStorage.getItem(key); } catch (e) { saved = null; } }
        show(opts.start || saved || order[0]);
        return { show: show, current: function () { return cur; }, mark: mark };
    }

    window.LabUI = { toggleBigView: toggle, initSteps: initSteps, initTabs: initTabs };
})();
