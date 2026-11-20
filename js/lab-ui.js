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
        if (typeof presentFit === 'function') presentFit();
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
       LabUI.initSteps({ key: '페이지별 저장 이름', onShow: function (step) { 그래프 다시 그리기 등 }, flows: true })
       - nav.steps button[data-step] 을 누르거나 [data-go="단계"] 단추를 누르면 그 단계만 보인다
       - 본 단계는 ✓ 표시, 마지막으로 본 단계와 본 단계 목록은 이 브라우저에 기억
       - 주소 끝 #step-5 처럼 쓰면 그 단계로 바로 연다 (지금 진행 방법의 5번째 단계)
       - flows: true 면 '진행 방법' 두 가지(📋 7단계 보고서 순서 / 🔍 가설연역 6단계)로 같은 패널을 보여 준다 (설계 docs/inquiry-types-design.md)
         · 패널(section.step-panel)은 한 벌. 가설연역은 LabUI.FLOWS.hd 처럼 패널을 묶어 다른 단계 이름·순서로
         · 수업 없이 열면 단계 탭 위 '진행 방법' 고르기(이 브라우저 'lab-flow' 에 기억), 수업이면 LabUI.setFlow(flow, { lock: true }) (js/class-share.js)
         · onShow(패널 키, { flow, step }) — 묶인 단계(③ 탐구 설계 = 준비물 + 과정)는 패널마다 한 번씩 부름. 그래서 페이지 코드는 7단계 키만 알면 됨
         · show() 에는 패널 키('data')도 단계 키('perform')도 넣을 수 있음
       돌려주는 값: { show(step), current()(패널 키), flow(), flowStep()(지금 방법의 단계 키) } */
    var FLOWS = {
        report: { name: '7단계', icon: '📋', hint: '목적 → 결론 보고서 순서' },
        hd: { name: '가설연역', icon: '🔍', hint: '문제 → 가설 → 설계 → 수행 → 해석 → 결론', steps: [
            { key: 'problem', no: '①', label: '문제 인식', panels: ['purpose'] },
            { key: 'hypothesis', no: '②', label: '가설 설정', panels: ['theory'] },
            { key: 'design', no: '③', label: '탐구 설계', panels: ['materials', 'procedure'] },
            { key: 'perform', no: '④', label: '탐구 수행', panels: ['data'] },
            { key: 'interpret', no: '⑤', label: '자료 해석', panels: ['result'] },
            { key: 'conclude', no: '⑥', label: '결론 도출', panels: ['conclusion'] }
        ] }
    };
    var FLOW_KEY = 'lab-flow';
    function flowPref() { try { var f = localStorage.getItem(FLOW_KEY); return FLOWS[f] ? f : 'report'; } catch (e) { return 'report'; } }
    var activeSteps = null, pendingFlow = null;
    // 수업(js/class-share.js)이 진행 방법을 정함. 단계 부품이 아직 없으면 기억했다가 initSteps 때 씀
    function setFlow(flow, o) {
        flow = FLOWS[flow] ? flow : 'report';
        if (activeSteps) return activeSteps.setFlow(flow, o);
        pendingFlow = { flow: flow, o: o || {} };
        return false;
    }
    function initSteps(opts) {
        opts = opts || {};
        var nav = document.querySelector('nav.steps');
        if (!nav) return null;
        var origButtons = Array.prototype.slice.call(nav.querySelectorAll('button[data-step]'));
        var panelOrder = origButtons.map(function (b) { return b.dataset.step; });
        var panels = Array.prototype.slice.call(document.querySelectorAll('.step-panel[data-step]'));
        var baseKey = 'lab-steps:' + (opts.key || location.pathname);
        var canFlow = !!opts.flows && panelOrder.join() === 'purpose,theory,materials,procedure,data,result,conclusion';
        var flow = 'report', locked = false;
        if (canFlow) {
            flow = flowPref();
            var fh = /[?&]flow=(hd|report)\b/.exec(location.search);
            if (fh) flow = fh[1];
            if (pendingFlow) { flow = pendingFlow.flow; locked = !!pendingFlow.o.lock; pendingFlow = null; }
        }
        // 패널의 이전·다음 단추 줄 (.step-next, 플랑크·이상기체는 .row.next). 작은 탭 안으로 옮겨졌어도 마지막 것
        function nextRow(p) { var a = p.querySelectorAll('.step-next, .row.next'); return a.length ? a[a.length - 1] : null; }
        var origNext = panels.map(function (p) { var n = nextRow(p); return n ? n.innerHTML : null; });
        var steps, order, buttons, saved, seen, cur = null, key;
        // 단계 목록: [{ key, no, label, panels }]
        function makeSteps() {
            if (flow === 'hd') return FLOWS.hd.steps;
            return origButtons.map(function (b) { return { key: b.dataset.step, panels: [b.dataset.step], button: b }; });
        }
        function stepOf(k) {
            if (order.indexOf(k) >= 0) return k;
            for (var i = 0; i < steps.length; i++) if (steps[i].panels.indexOf(k) >= 0) return steps[i].key;
            return null;
        }
        function load() {
            key = baseKey + (flow === 'hd' ? ':hd' : '');
            try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { saved = {}; }
            seen = Array.isArray(saved.seen) ? saved.seen.filter(function (s) { return order.indexOf(s) >= 0; }) : [];
        }
        function persist() {
            try { localStorage.setItem(key, JSON.stringify({ step: cur, seen: seen })); } catch (e) { /* 저장 불가: 무시 */ }
        }
        // 가설연역이면 탭 단추·패널 제목 앞 이름·이전/다음 단추를 그 방법에 맞게 (7단계면 원래대로)
        function build() {
            steps = makeSteps();
            order = steps.map(function (s) { return s.key; });
            if (flow === 'hd') {
                nav.innerHTML = '';
                steps.forEach(function (s) {
                    var b = document.createElement('button');
                    b.type = 'button'; b.dataset.step = s.key; b.innerHTML = '<b>' + s.no + '</b><span>' + s.label + '</span>';
                    nav.appendChild(b);
                });
            } else if (nav.firstElementChild !== origButtons[0] || nav.children.length !== origButtons.length) {
                nav.innerHTML = ''; origButtons.forEach(function (b) { nav.appendChild(b); });
            }
            nav.classList.toggle('steps-hd', flow === 'hd');
            document.documentElement.classList.toggle('flow-hd', flow === 'hd');
            buttons = Array.prototype.slice.call(nav.querySelectorAll('button[data-step]'));
            buttons.forEach(function (b) {
                b.setAttribute('role', 'tab');
                if (!b._stepBound) { b._stepBound = true; b.addEventListener('click', function () { show(b.dataset.step, true); }); }
            });
            panels.forEach(function (p, i) {
                var h = p.querySelector('h2'), tag = h && h.querySelector('.flow-tag');
                var si = steps.map(function (s) { return s.panels.indexOf(p.dataset.step) >= 0; }).indexOf(true), s = steps[si];
                if (flow === 'hd' && h && s) {
                    if (!tag) { tag = document.createElement('span'); tag.className = 'flow-tag'; h.insertBefore(tag, h.firstChild); }
                    tag.textContent = s.no + ' ' + s.label + ' · ';
                } else if (tag) tag.remove();
                var nx = nextRow(p);
                if (!nx || origNext[i] == null) return;
                if (flow !== 'hd' || !s) { nx.innerHTML = origNext[i]; nx.hidden = false; return; }
                // 묶인 단계의 앞 패널(준비물)은 이전·다음 단추를 숨김, 마지막 패널에 단계 순서대로 다시 씀
                var last = s.panels[s.panels.length - 1] === p.dataset.step;
                nx.hidden = !last;
                if (!last) return;
                var pv = steps[si - 1], nt = steps[si + 1];
                nx.innerHTML = (pv ? '<button type="button" class="secondary" data-go="' + pv.key + '">← 이전: ' + pv.no + ' ' + pv.label + '</button>' : '') +
                    (nt ? '<button type="button" data-go="' + nt.key + '">다음: ' + nt.no + ' ' + nt.label + ' →</button>' : '');
            });
            load();
        }
        function show(step, scroll) {
            var target = step, st = stepOf(step);
            if (!st) { st = order[0]; target = null; }
            cur = st;
            if (seen.indexOf(st) < 0) seen.push(st);
            var group = steps[order.indexOf(st)].panels;
            panels.forEach(function (p) { p.hidden = group.indexOf(p.dataset.step) < 0; });
            buttons.forEach(function (b) {
                var on = b.dataset.step === st;
                b.setAttribute('aria-selected', on ? 'true' : 'false');
                b.tabIndex = on ? 0 : -1;
                b.classList.toggle('done', seen.indexOf(b.dataset.step) >= 0);
            });
            persist();
            // 같은 단계 안의 다른 패널을 가리키면(③ 안의 '4. 과정') 그 패널로 스크롤
            var tp = target && target !== st && group.length > 1 ? panels.filter(function (p) { return p.dataset.step === target; })[0] : null;
            if (tp && tp !== panels.filter(function (p) { return p.dataset.step === group[0]; })[0]) { if (tp.scrollIntoView) tp.scrollIntoView(); }
            else if (scroll) window.scrollTo(0, 0);
            if (typeof opts.onShow === 'function') group.forEach(function (pk) { opts.onShow(pk, { flow: flow, step: st }); });
            // 숨어 있던 그래프가 보일 때 크기를 다시 잡도록
            window.dispatchEvent(new Event('resize'));
        }
        // 왼쪽·오른쪽 화살표로 단계 옮기기
        nav.addEventListener('keydown', function (e) {
            var i = order.indexOf(cur);
            if (e.key === 'ArrowRight' && i < order.length - 1) { show(order[i + 1]); buttons[i + 1].focus(); }
            else if (e.key === 'ArrowLeft' && i > 0) { show(order[i - 1]); buttons[i - 1].focus(); }
        });
        document.addEventListener('click', function (e) {
            var go = e.target.closest && e.target.closest('[data-go]');
            if (go && stepOf(go.dataset.go)) show(go.dataset.go, true);
        });
        // 진행 방법 고르기 (수업 없이 연 화면만, 📱 폰 측정 화면은 숨김)
        var pick = null;
        function renderPick() {
            if (!canFlow) return;
            var hide = locked || /[?&]c=/.test(location.search) || /[?&]role=phone\b/.test(location.search) || /[?&]present=1\b/.test(location.search);
            if (!pick) {
                pick = document.createElement('div');
                pick.className = 'seg flow-pick'; pick.setAttribute('role', 'group'); pick.setAttribute('aria-label', '진행 방법');
                pick.innerHTML = '<span class="flow-pick-label">진행 방법</span>' + Object.keys(FLOWS).map(function (k) {
                    return '<button type="button" data-flow="' + k + '" title="' + FLOWS[k].hint + '">' + FLOWS[k].icon + ' ' + FLOWS[k].name + '</button>';
                }).join('');
                pick.addEventListener('click', function (e) {
                    var b = e.target.closest('button[data-flow]');
                    if (!b || locked) return;
                    try { localStorage.setItem(FLOW_KEY, b.dataset.flow); } catch (er) { /* 무시 */ }
                    api.setFlow(b.dataset.flow);
                });
                nav.parentNode.insertBefore(pick, nav);
            }
            pick.hidden = hide;
            pick.querySelectorAll('button[data-flow]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.flow === flow ? 'true' : 'false'); });
        }
        var api = {
            show: show,
            current: function () { var g = steps[order.indexOf(cur)]; return g ? g.panels[g.panels.length - 1] : cur; },
            flow: function () { return flow; },
            flowStep: function () { return cur; },
            stepOf: function (k) { return stepOf(k); },
            setFlow: function (f, o) {
                f = canFlow && FLOWS[f] ? f : 'report';
                if (o && o.lock) locked = true;
                if (f === flow) { renderPick(); return false; }
                var here = api.current();   // 지금 보던 패널을 새 방법에서도 이어서
                flow = f; build(); renderPick();
                show(here);
                try { document.dispatchEvent(new CustomEvent('lab-flow', { detail: { flow: flow } })); } catch (e) { /* 무시 */ }
                return true;
            }
        };
        build(); renderPick();
        var fromHash = /^#step-(\d)$/.exec(location.hash);
        show(fromHash && order[Number(fromHash[1]) - 1] ? order[Number(fromHash[1]) - 1] : (opts.start || saved.step || order[0]));
        activeSteps = api;
        try { document.dispatchEvent(new CustomEvent('lab-flow', { detail: { flow: flow } })); } catch (e) { /* 무시 */ }
        return api;
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
                // 위에 붙어 있는 7단계 탭에 가리지 않게 그 아래까지만 올린다
                var bar = document.querySelector('nav.steps, nav.tabs');
                var cover = bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().bottom : 0;
                var top = nav.getBoundingClientRect().top;
                if (top < cover) window.scrollBy(0, top - cover - 8);
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

    /* 제목(h3)으로 나눈 긴 글을 작은 탭으로 자동으로 바꾸기 — 페이지 HTML 은 표시만 붙이면 된다
       <div data-subtabs="과정 나눠 보기">            ← 제목들의 바로 위 부모
         <h2>4. 실험 과정</h2> 안내 글…               ← 첫 표시 앞의 내용은 탭 위에 늘 보임
         <h3 data-subtab="준비">① 역할 나누기</h3> …   ← 여기부터 다음 표시 전까지가 '준비' 탭
         <h3>② …</h3> …                               ← 표시 없는 제목은 앞 탭에 함께 들어감
         <h3 data-subtab="회로">③ 회로 꾸미기</h3> …
         <div class="step-next">…</div>               ← '다음 단계' 단추 줄(.step-next, .row.next)은 탭 아래에 늘 보임
       </div>
       각 탭 끝에는 "다음: ○○ →" 단추가 붙는다. 탭을 옮겨도 입력값·연결은 그대로다(숨기기만 함). */
    var autoCount = 0;
    function autoSubtabs(scope) {
        var roots = (scope || document).querySelectorAll('[data-subtabs]');
        Array.prototype.forEach.call(roots, function (root) {
            if (root.dataset.subtabsReady) return;
            var heads = Array.prototype.filter.call(root.children, function (el) { return el.hasAttribute('data-subtab'); });
            if (heads.length < 2) return;
            root.dataset.subtabsReady = '1';
            var keepSel = '.step-next, .row.next';
            var prefix = 'sub' + (++autoCount) + '-';
            var nav = document.createElement('nav');
            nav.className = 'subtabs wrap';
            nav.setAttribute('aria-label', root.getAttribute('data-subtabs') || '나눠 보기');
            var boxes = heads.map(function (h, i) {
                var id = prefix + (i + 1);
                var label = h.getAttribute('data-subtab');
                var b = document.createElement('button');
                b.dataset.tab = id;
                b.textContent = label;
                nav.appendChild(b);
                var box = document.createElement('div');
                box.className = 'tab-panel';
                box.dataset.tab = id;
                root.insertBefore(box, h);
                var n = h;
                while (n) {
                    var next = n.nextSibling;
                    if (n !== h && n.nodeType === 1 && (n.hasAttribute('data-subtab') || (n.matches && n.matches(keepSel)))) break;
                    box.appendChild(n);
                    n = next;
                }
                return { box: box, id: id, label: label };
            });
            boxes.forEach(function (o, i) {
                var nx = boxes[i + 1];
                if (!nx) return;
                var row = document.createElement('div');
                row.className = 'subtab-next';
                var b = document.createElement('button');
                b.type = 'button';
                b.dataset.tabGo = nx.id;
                b.textContent = '다음: ' + nx.label + ' →';
                row.appendChild(b);
                o.box.appendChild(row);
            });
            root.insertBefore(nav, boxes[0].box);
            initTabs(nav, { key: root.getAttribute('data-subtabs-key') || null });
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { autoSubtabs(); });
    else autoSubtabs();


    /* 기기 종류: 폰 측정 · 노트북 분석 이원화 (2026-11-17 사용자 결정)
       "스마트폰으로 측정하는 보고서 실험은 측정은 스마트폰, 분석은 노트북. 태블릿은 둘 다, 노트북은 완전히 나눔.
        노트북으로 측정하는 실험은 외부 블루투스 센서를 쓰는 경우뿐"
       LabUI.device() → { kind: 'phone'|'tablet'|'laptop', auto: 추측한 종류, manual: 사용자가 바꿨는지 }
       - 추측: 터치가 주 입력(pointer: coarse)이고 화면 짧은 변 < 600 이면 폰, ≥ 600 이면 태블릿(아이패드가 맥처럼 보여도 터치 점 2개 이상이면 태블릿), 아니면 노트북
       - 틀리면 사용자가 고침: 주소 ?device=phone|tablet|laptop 또는 LabUI.deviceSwitch(자리) 의 고르기 → 이 브라우저에 기억
       - <html> 에 class device-phone / device-tablet / device-laptop 과 data-device 를 붙인다 (head 에서 불러오므로 처음부터)
         css/lab-base.css: .hide-on-laptop · .hide-on-phone · .show-on-laptop · .show-on-phone 로 페이지가 보이고 숨길 것을 정함
       - 바뀌면 window 에 'lab-device' 이벤트 (detail = LabUI.device()) */
    var DEV_KEY = 'lab-ui:device', DEV_KINDS = ['phone', 'tablet', 'laptop'];
    /* 🎬 발표용 (교사 화면 '발표 보기'가 iframe 으로 여는 ?present=1): 학생으로 참여하지 않고 보여 주기만.
       기기는 늘 노트북(측정 부분은 숨김, 기억하지 않음), <html class="lab-present"> 로 측정·조 공유·수업 참여 띠를 숨김 (css/lab-base.css) */
    var PRESENT = /[?&]present=1(?:&|#|$)/.test(location.search || '');
    if (PRESENT) root.classList.add('lab-present');
    /* 발표용 크기: 교사 화면 틀(iframe) 높이에 맞춰 페이지를 통째로 키움(zoom) — 4K 프로젝터에서도 본문 ≈ 화면 높이의 3 %, 그림·표·그래프도 함께.
       - 보통 실험: 본문 16px × 배율 ≈ 틀 높이 × 0.032 (가로로 최소 760px 은 남겨 휴대폰 모양이 되지 않게), 1~6 배
       - 행사형(필름통 로켓, body.ev-body): 폰 화면 400 × 820 이 틀에 꽉 차게
       - 크게 보기(Alt+B)는 body 를 한 번 더 키우는 대신 이 배율을 1.25 배로 (교사 화면에서 눌러도 같은 브라우저 저장값으로 따라옴)
       zoom 을 걸면 vh 도 함께 커지므로 발표용에서는 그래프 높이를 고정값으로 (css/lab-base.css 의 html.lab-present) */
    function presentFit() {
        if (!PRESENT || !document.body) return;
        var W = window.innerWidth || 0, H = window.innerHeight || 0, big = root.classList.contains('big-view');
        if (!W || !H) return;
        var z = document.body.classList.contains('ev-body') ? Math.min(W / 400, H / 820) : Math.min(H * 0.002, W / 760);
        if (big) z = Math.min(z * 1.25, document.body.classList.contains('ev-body') ? z * 1.25 : W / 600);
        z = Math.max(1, Math.min(6, z));
        var v = String(Math.round(z * 100) / 100);
        if (root.style.zoom !== v) { root.style.zoom = v; window.dispatchEvent(new Event('resize')); }
    }
    // 발표용은 학생과 함께 보는 화면이라 페이지 제목·소개 글(단계 탭 위의 글)·이전 페이지 링크는 숨김
    function presentTidy() {
        if (!PRESENT || !document.body) return;
        var nav = document.querySelector('nav.steps');
        Array.prototype.forEach.call(document.querySelectorAll('a.back, h1'), function (el) { el.classList.add('hide-on-present'); });
        if (nav && nav.parentNode) {
            for (var el = nav.previousElementSibling; el; el = el.previousElementSibling) if (el.tagName === 'P') el.classList.add('hide-on-present');
        }
    }
    if (PRESENT) {
        var presentReady = function () { presentTidy(); presentFit(); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', presentReady); else presentReady();
        var fitTimer = null;
        window.addEventListener('resize', function () { clearTimeout(fitTimer); fitTimer = setTimeout(presentFit, 60); });
        // 교사 화면에서 Alt+B 를 누르면(같은 브라우저 저장값) 발표용도 따라감
        window.addEventListener('storage', function (e) { if (e.key === KEY) { root.classList.toggle('big-view', read()); presentFit(); } });
    }
    function guessDevice() {
        var nav = window.navigator || {}, touch = (nav.maxTouchPoints || 0) > 0;
        var coarse = false;
        try { coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; } catch (e) { /* 옛 브라우저 */ }
        var ipad = /Macintosh/.test(nav.userAgent || '') && (nav.maxTouchPoints || 0) > 1;
        var sc = window.screen || {}, short = Math.min(sc.width || window.innerWidth || 0, sc.height || window.innerHeight || 0);
        if (ipad) return 'tablet';
        if (coarse && touch) return short && short < 600 ? 'phone' : 'tablet';
        if (/Android|iPhone|iPod/.test(nav.userAgent || '') && short && short < 600) return 'phone';
        return 'laptop';
    }
    function readDevice() {
        var q = null;
        try { q = new URLSearchParams(location.search).get('device'); } catch (e) { /* 무시 */ }
        if (DEV_KINDS.indexOf(q) >= 0) { try { localStorage.setItem(DEV_KEY, q); } catch (e) { /* 무시 */ } return q; }
        try { var v = localStorage.getItem(DEV_KEY); if (DEV_KINDS.indexOf(v) >= 0) return v; } catch (e) { /* 무시 */ }
        return null;
    }
    function device() {
        if (PRESENT) return { kind: 'laptop', auto: 'laptop', manual: true };
        var auto = guessDevice(), m = readDevice();
        return { kind: m || auto, auto: auto, manual: !!m };
    }
    function applyDevice() {
        var d = device();
        DEV_KINDS.forEach(function (k) { root.classList.toggle('device-' + k, k === d.kind); });
        root.setAttribute('data-device', d.kind);
        return d;
    }
    function setDevice(kind) {
        try {
            if (DEV_KINDS.indexOf(kind) >= 0) localStorage.setItem(DEV_KEY, kind);
            else localStorage.removeItem(DEV_KEY);
        } catch (e) { /* 저장 안 되면 이 페이지에서만 */ }
        var d = applyDevice();
        if (DEV_KINDS.indexOf(kind) >= 0 && d.kind !== kind) {   // 저장이 막힌 브라우저: 이 페이지에서만이라도
            DEV_KINDS.forEach(function (k) { root.classList.toggle('device-' + k, k === kind); });
            root.setAttribute('data-device', kind);
            d = { kind: kind, auto: d.auto, manual: true };
        }
        window.dispatchEvent(new CustomEvent('lab-device', { detail: d }));
        return d;
    }
    var DEV_NAME = { phone: '📱 스마트폰', tablet: '📟 태블릿', laptop: '💻 노트북·PC' };
    // 작은 고르기 '이 기기: 💻 노트북·PC ▾' — 추측이 틀렸을 때 고치는 곳. mount: 요소 또는 선택자
    function deviceSwitch(mount) {
        var el = typeof mount === 'string' ? document.querySelector(mount) : mount;
        if (!el) return null;
        var d = device(), box = document.createElement('label');
        box.className = 'device-switch';
        box.appendChild(document.createTextNode('이 기기: '));
        var sel = document.createElement('select');
        sel.setAttribute('aria-label', '이 기기의 종류');
        DEV_KINDS.forEach(function (k) {
            var o = document.createElement('option');
            o.value = k; o.textContent = DEV_NAME[k] + (k === d.auto ? ' (자동)' : '');
            if (k === d.kind) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', function () { setDevice(sel.value === d.auto ? null : sel.value); });
        box.appendChild(sel);
        el.appendChild(box);
        return sel;
    }
    applyDevice();

    window.LabUI = { toggleBigView: toggle, initSteps: initSteps, FLOWS: FLOWS, setFlow: setFlow, flowPref: flowPref, steps: function () { return activeSteps; }, initTabs: initTabs, autoSubtabs: autoSubtabs,
        device: device, setDevice: setDevice, deviceSwitch: deviceSwitch, DEVICE_NAME: DEV_NAME, present: PRESENT };
})();
