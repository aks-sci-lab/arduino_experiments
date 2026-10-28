// 문항 출제용 그림 도구: 화면·그리기 조작 (그림 자료와 SVG 는 figure-model.js)
(function () {
    'use strict';
    const M = window.FigureModel;
    const $ = id => document.getElementById(id);
    const svg = $('svg');
    const GRID = 10;
    const STORE_KEY = 'figure-maker-scene';

    const state = {
        scene: M.normalizeScene({}),
        sel: [],              // 고른 물체 id 목록
        tool: 'select',
        drag: null,           // 끌기 중인 정보
        draft: null,          // 그리는 중인 물체 (아직 그림에 넣지 않음)
        poly: null,           // 꺾은선·도선 점 찍는 중 { type, points, hover }
        snapHint: null,       // 도선이 붙을 소자 끝
        lastDown: { t: 0, x: 0, y: 0 },
        undo: [], redo: [], saved: ''
    };

    // ───────────────────────── 저장·실행 취소 ─────────────────────────
    function store(key, val) { try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, val); return true; } catch (e) { return false; } }
    function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

    function commit() {
        const now = JSON.stringify(state.scene);
        if (now === state.saved) return;
        if (state.saved) state.undo.push(state.saved);
        if (state.undo.length > 150) state.undo.shift();
        state.redo = [];
        state.saved = now;
        store(STORE_KEY, now);
        updateUndoButtons();
    }
    function setScene(scene, keepSel) {
        state.scene = scene;
        if (!keepSel) state.sel = [];
        state.sel = state.sel.filter(id => scene.objects.some(o => o.id === id));
        render(); buildProps();
    }
    function undo() {
        commit();
        if (!state.undo.length) return;
        state.redo.push(state.saved);
        state.saved = state.undo.pop();
        store(STORE_KEY, state.saved);
        setScene(JSON.parse(state.saved), true);
        updateUndoButtons();
    }
    function redo() {
        if (!state.redo.length) return;
        state.undo.push(state.saved);
        state.saved = state.redo.pop();
        store(STORE_KEY, state.saved);
        setScene(JSON.parse(state.saved), true);
        updateUndoButtons();
    }
    function updateUndoButtons() {
        $('btn-undo').disabled = !state.undo.length && JSON.stringify(state.scene) === state.saved;
        $('btn-redo').disabled = !state.redo.length;
    }

    // ───────────────────────── 좌표 ─────────────────────────
    function toSvg(e) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const m = svg.getScreenCTM();
        const p = m ? pt.matrixTransform(m.inverse()) : pt;
        return { x: p.x, y: p.y };
    }
    const snapOn = () => $('chk-snap').checked;
    const snapV = v => snapOn() ? Math.round(v / GRID) * GRID : Math.round(v * 10) / 10;
    const snapP = p => ({ x: snapV(p.x), y: snapV(p.y) });

    // 도선이 붙을 곳: 회로 소자 끝·다른 도선 끝·점 (12px 안)
    function terminalSnap(p, skipId) {
        let best = null, bd = 12;
        for (const o of state.scene.objects) {
            if (o.id === skipId) continue;
            for (const t of M.terminals(o)) {
                const d = Math.hypot(t[0] - p.x, t[1] - p.y);
                if (d < bd) { bd = d; best = { x: Math.round(t[0] * 100) / 100, y: Math.round(t[1] * 100) / 100 }; }
            }
        }
        return best;
    }

    const byId = id => state.scene.objects.find(o => o.id === id);
    const selected = () => state.sel.map(byId).filter(Boolean);

    // ───────────────────────── 그리기 ─────────────────────────
    function gridSvg(W, H) {
        if (!$('chk-grid').checked) return '';
        let d = '';
        for (let x = GRID * 2; x < W; x += GRID * 2) d += `M${x} 0V${H}`;
        for (let y = GRID * 2; y < H; y += GRID * 2) d += `M0 ${y}H${W}`;
        return `<path d="${d}" stroke="#e6ebf0" stroke-width="1" fill="none" pointer-events="none"/>`;
    }

    function render() {
        const sc = state.scene;
        svg.setAttribute('viewBox', `0 0 ${sc.width} ${sc.height}`);
        svg.setAttribute('width', sc.width);
        svg.setAttribute('height', sc.height);
        const objs = sc.objects.slice();
        if (state.draft) objs.push(state.draft);
        if (state.poly) {
            const pts = state.poly.points.concat(state.poly.hover ? [state.poly.hover] : []);
            if (pts.length >= 2) objs.push(M.makeObject(state.poly.type, { id: '__poly', points: pts, ...(state.poly.type === 'polyline' ? { arrow: state.poly.arrow } : {}) }));
        }
        const view = { ...sc, objects: objs };
        svg.innerHTML = `<rect width="${sc.width}" height="${sc.height}" fill="#fff"/>` + gridSvg(sc.width, sc.height) +
            M.renderInner(view, { edit: true, background: false }) + '<g id="overlay"></g>';
        drawOverlay();
    }

    function drawOverlay() {
        const ov = svg.querySelector('#overlay');
        let s = '';
        for (const o of selected()) {
            const g = svg.querySelector(`[data-id="${CSS.escape(o.id)}"]`);
            if (g) {
                try {
                    const b = g.getBBox();
                    s += `<rect class="sel-box" x="${b.x - 4}" y="${b.y - 4}" width="${b.width + 8}" height="${b.height + 8}"/>`;
                } catch (e) { /* 그리지 못한 물체 */ }
            }
            if (state.sel.length === 1) {
                for (const h of M.handles(o)) s += `<circle class="handle" data-handle="${h.key}" data-oid="${o.id}" cx="${h.x}" cy="${h.y}" r="5.5"/>`;
            }
        }
        if (state.snapHint) s += `<circle class="snap-dot" cx="${state.snapHint.x}" cy="${state.snapHint.y}" r="7"/>`;
        ov.innerHTML = s;
    }

    // ───────────────────────── 도구 ─────────────────────────
    const DRAG_TOOLS = ['line', 'arrow', 'rect', 'ellipse', 'ground', 'spring', 'wave', 'graph'];
    const CLICK_TOOLS = ['text', 'dot', 'comp', 'lens', 'mirror', 'angle'];
    const POINT_TOOLS = ['polyline', 'wire'];
    const HINTS = {
        select: '물체를 눌러 고르고 끌어서 옮기세요. 파란 동그라미를 끌면 크기·끝점이 바뀝니다.',
        line: '그림판에서 끌어 직선을 그리세요.', arrow: '끌어서 화살표를 그리세요 (끝 쪽에 화살촉).',
        rect: '끌어서 사각형을 그리세요.', ellipse: '끌어서 원을 그리세요.',
        ground: '끌어서 바닥(빗금)을 그리세요. 빗금 방향은 속성에서 바꿉니다.', spring: '끌어서 용수철을 그리세요.',
        wave: '왼쪽에서 오른쪽으로 끌어 파동 길이를 정하세요.', graph: '끌어서 그래프 크기를 정하세요 (그냥 누르면 기본 크기).',
        text: '글자를 넣을 곳을 누르세요.', dot: '점을 찍을 곳을 누르세요.', comp: '소자를 놓을 곳을 누르세요. 놓은 뒤 R 키로 90° 돌립니다.',
        lens: '렌즈를 놓을 곳을 누르세요.', mirror: '거울을 놓을 곳을 누르세요.', angle: '각의 꼭짓점을 누르세요.',
        polyline: '점을 차례로 누르세요. 마지막 점에서 두 번 누르거나 Enter 로 끝냅니다.',
        wire: '도선이 지날 점을 차례로 누르세요 (가로·세로로 꺾임, 소자 끝에 붙음). 두 번 누르거나 Enter 로 끝.'
    };
    function setTool(t) {
        if (state.poly) finishPoly();
        state.tool = t;
        document.querySelectorAll('#tools [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
        svg.classList.toggle('tool-select', t === 'select');
        svg.classList.toggle('tool-draw', t !== 'select');
        $('hint').textContent = HINTS[t] || '';
        state.snapHint = null;
        render();
    }

    function addObject(o, keepTool) {
        state.scene.objects.push(o);
        state.sel = [o.id];
        commit();
        if (!keepTool) setTool('select'); else render();
        buildProps();
    }

    function createAt(tool, p) {
        const at = { x: p.x, y: p.y };
        switch (tool) {
            case 'text': return M.makeObject('text', at);
            case 'dot': return M.makeObject('dot', at);
            case 'comp': return M.makeObject('comp', { ...at, kind: $('sel-comp').value });
            case 'lens': return M.makeObject('lens', at);
            case 'mirror': return M.makeObject('mirror', at);
            case 'angle': return M.makeObject('angle', at);
        }
    }

    // 끌어 그리는 도구: 시작점 a, 끝점 b
    function dragShape(tool, a, b) {
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
        switch (tool) {
            case 'line': return { type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
            case 'arrow': return { type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, arrow: 'end', width: 2 };
            case 'ground': return { type: 'ground', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
            case 'spring': return { type: 'spring', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
            case 'rect': return { type: 'rect', x, y, w, h };
            case 'ellipse': return { type: 'ellipse', cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: w / 2, ry: h / 2 };
            case 'wave': return { type: 'wave', x: Math.min(a.x, b.x), y: a.y, length: w };
            case 'graph': return { type: 'graph', x, y, w, h };
        }
    }
    // 그냥 누르기만 했을 때의 기본 크기
    function clickShape(tool, p) {
        switch (tool) {
            case 'line': return dragShape(tool, p, { x: p.x + 120, y: p.y });
            case 'arrow': return dragShape(tool, p, { x: p.x + 100, y: p.y });
            case 'ground': return dragShape(tool, p, { x: p.x + 200, y: p.y });
            case 'spring': return dragShape(tool, p, { x: p.x + 120, y: p.y });
            case 'rect': return dragShape(tool, p, { x: p.x + 100, y: p.y + 60 });
            case 'ellipse': return { type: 'ellipse', cx: p.x, cy: p.y, rx: 40, ry: 40 };
            case 'wave': return { type: 'wave', x: p.x, y: p.y, length: 300 };
            case 'graph': {
                // 축 이름·눈금 글자 자리까지 그림판 안에 들어오게
                const W = state.scene.width, H = state.scene.height;
                const w = Math.min(320, W - 110), h = Math.min(220, H - 80);
                return { type: 'graph', x: snapV(Math.max(50, Math.min(p.x, W - w - 60))), y: snapV(Math.max(40, Math.min(p.y, H - h - 40))), w, h };
            }
        }
    }
    function finalize(props) {
        const o = M.makeObject(props.type, props);
        if (o.type === 'graph' && !o.plots.length) {
            o.plots = [M.normalizeObject({ type: 'graph', plots: [{ kind: 'func', expr: 'x' }] }).plots[0]];
            if (o.w < 80) o.w = 320;
            if (o.h < 60) o.h = 220;
        }
        return o;
    }

    // 꺾은선·도선
    function polyPoint(p) {
        const pts = state.poly.points;
        let q = snapP(p);
        if (state.poly.type === 'wire') {
            const t = terminalSnap(p);
            if (t) q = t;
            else if (pts.length) {
                // 가로·세로로만
                const last = pts[pts.length - 1];
                if (Math.abs(q.x - last[0]) >= Math.abs(q.y - last[1])) q.y = last[1]; else q.x = last[0];
            }
        }
        return [q.x, q.y];
    }
    function finishPoly() {
        const P = state.poly;
        state.poly = null;
        state.snapHint = null;
        if (!P) return;
        const pts = P.points.filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
        if (pts.length >= 2) {
            const o = M.makeObject(P.type, { points: pts, ...(P.type === 'polyline' ? { arrow: P.arrow } : {}) });
            state.scene.objects.push(o);
            state.sel = [o.id];
            commit();
            buildProps();
        }
        render();
    }

    // ───────────────────────── 마우스·터치 ─────────────────────────
    svg.addEventListener('pointerdown', e => {
        if (e.button > 0) return;
        const p = toSvg(e);
        const now = Date.now();
        const dbl = now - state.lastDown.t < 400 && Math.hypot(p.x - state.lastDown.x, p.y - state.lastDown.y) < 8;
        state.lastDown = { t: now, x: p.x, y: p.y };
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* 터치 */ }

        if (POINT_TOOLS.includes(state.tool)) {
            if (!state.poly) state.poly = { type: state.tool, points: [], hover: null, arrow: 'none' };
            if (dbl && state.poly.points.length >= 2) { finishPoly(); return; }
            state.poly.points.push(polyPoint(p));
            render();
            return;
        }
        const handle = e.target.closest && e.target.closest('[data-handle]');
        if (handle) {
            state.drag = { kind: 'handle', id: handle.dataset.oid, key: handle.dataset.handle };
            return;
        }
        if (DRAG_TOOLS.includes(state.tool)) {
            const a = snapP(p);
            state.drag = { kind: 'create', a, b: a };
            return;
        }
        if (CLICK_TOOLS.includes(state.tool)) {
            const o = createAt(state.tool, snapP(p));
            addObject(o, e.shiftKey);
            if (o.type === 'text') setTimeout(focusFirstText, 0);   // 그림판을 누른 뒤에 글자 칸으로
            return;
        }
        // 선택 도구
        const g = e.target.closest && e.target.closest('[data-id]');
        const id = g && g.dataset.id;
        if (id && byId(id)) {
            if (e.shiftKey) state.sel = state.sel.includes(id) ? state.sel.filter(s => s !== id) : state.sel.concat(id);
            else if (!state.sel.includes(id)) state.sel = [id];
            state.drag = { kind: 'move', start: p, applied: { x: 0, y: 0 } };
            if (dbl && byId(id).type === 'text') { buildProps(); setTimeout(focusFirstText, 0); state.drag = null; return; }
        } else {
            state.sel = [];
        }
        render(); buildProps();
    });

    svg.addEventListener('pointermove', e => {
        const p = toSvg(e);
        if (state.poly) {
            state.poly.hover = polyPoint(p);
            state.snapHint = state.poly.type === 'wire' ? terminalSnap(p) : null;
            render();
            return;
        }
        if (state.tool === 'wire') { state.snapHint = terminalSnap(p); drawOverlay(); }
        const d = state.drag;
        if (!d) return;
        if (d.kind === 'create') {
            d.b = snapP(p);
            const sh = dragShape(state.tool, d.a, d.b);
            state.draft = M.makeObject(sh.type, sh);
            state.draft.id = '__draft';
            render();
        } else if (d.kind === 'move') {
            let dx = p.x - d.start.x, dy = p.y - d.start.y;
            if (snapOn()) { dx = Math.round(dx / GRID) * GRID; dy = Math.round(dy / GRID) * GRID; }
            const mx = dx - d.applied.x, my = dy - d.applied.y;
            if (!mx && !my) return;
            for (const o of selected()) M.translate(o, mx, my);
            d.applied = { x: dx, y: dy };
            d.moved = true;
            render();
        } else if (d.kind === 'handle') {
            const o = byId(d.id);
            if (!o) return;
            let q = snapP(p);
            if (o.type === 'wire' || o.type === 'line') { const t = terminalSnap(p, o.id); if (t) q = t; state.snapHint = t; }
            M.moveHandle(o, d.key, q.x, q.y);
            d.moved = true;
            render();
        }
    });

    function endDrag() {
        const d = state.drag;
        state.drag = null;
        state.snapHint = null;
        if (!d) return;
        if (d.kind === 'create') {
            const tool = state.tool;
            const far = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) >= 6;
            state.draft = null;
            addObject(finalize(far ? dragShape(tool, d.a, d.b) : clickShape(tool, d.a)));
            return;
        }
        if (d.moved) { commit(); buildProps(); }
        render();
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('pointerleave', () => { if (state.poly) { state.poly.hover = null; render(); } });

    // ───────────────────────── 편집 명령 ─────────────────────────
    function removeSel() {
        if (!state.sel.length) return;
        state.scene.objects = state.scene.objects.filter(o => !state.sel.includes(o.id));
        state.sel = [];
        commit(); render(); buildProps();
    }
    function duplicateSel() {
        const copies = selected().map(o => { const c = JSON.parse(JSON.stringify(o)); c.id = M.newId(); M.translate(c, 20, 20); return c; });
        if (!copies.length) return;
        state.scene.objects.push(...copies);
        state.sel = copies.map(c => c.id);
        commit(); render(); buildProps();
    }
    function nudge(dx, dy) {
        if (!state.sel.length) return;
        for (const o of selected()) M.translate(o, dx, dy);
        commit(); render(); buildProps();
    }
    function rotateSel() {
        let changed = false;
        for (const o of selected()) {
            if ('rot' in o) { o.rot = ((o.rot + 90) % 360 + 360) % 360; changed = true; }
        }
        if (changed) { commit(); render(); buildProps(); }
    }
    function reorder(front) {
        const objs = state.scene.objects;
        const pick = objs.filter(o => state.sel.includes(o.id)), rest = objs.filter(o => !state.sel.includes(o.id));
        state.scene.objects = front ? rest.concat(pick) : pick.concat(rest);
        commit(); render();
    }

    document.addEventListener('keydown', e => {
        const tag = (e.target.tagName || '').toLowerCase();
        const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (ctrl && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
        if (typing) return;
        if (e.key === 'Escape') {
            if (state.poly) { state.poly = null; render(); return; }
            state.sel = []; setTool('select'); buildProps(); return;
        }
        if (e.key === 'Enter' && state.poly) { finishPoly(); return; }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); return; }
        if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
        if (!ctrl && e.key.toLowerCase() === 'r') { rotateSel(); return; }
        if (!ctrl && e.key.toLowerCase() === 'v') { setTool('select'); return; }
        const step = e.shiftKey ? GRID : 1;
        const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (arrows[e.key] && state.sel.length) { e.preventDefault(); nudge(...arrows[e.key]); }
    });

    // ───────────────────────── 속성 칸 ─────────────────────────
    const OPT = {
        arrow: [['none', '없음'], ['end', '끝 →'], ['start', '시작 ←'], ['both', '양쪽 ↔'], ['mid', '가운데 (광선)']],
        dash: [['solid', '실선'], ['dashed', '점선'], ['dotted', '짧은 점선']],
        fill: [['none', '없음'], ['white', '흰색'], ['lightgray', '옅은 회색'], ['gray', '회색'], ['black', '검정'], ['hatch', '빗금']],
        anchor: [['start', '왼쪽 맞춤'], ['middle', '가운데'], ['end', '오른쪽 맞춤']],
        font: [['', '그림 기본'], ['serif', '바탕(명조)'], ['sans', '돋움(고딕)']],
        comp: [['resistor', '저항'], ['battery', '전지'], ['bulb', '전구'], ['switch', '스위치'], ['ammeter', '전류계'], ['voltmeter', '전압계'],
            ['galvanometer', '검류계'], ['led', 'LED'], ['diode', '다이오드'], ['capacitor', '축전기'], ['varistor', '가변 저항'], ['ac', '교류 전원'], ['coil', '코일']],
        rot: [[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']],
        labelSide: [['a', '위 / 왼쪽'], ['b', '아래 / 오른쪽']],
        lens: [['convex', '볼록 렌즈'], ['concave', '오목 렌즈']],
        lensStyle: [['shape', '렌즈 모양'], ['arrow', '선 + 화살촉 (간단)']],
        mirror: [['plane', '평면 거울'], ['concave', '오목 거울'], ['convex', '볼록 거울']],
        side: [['below', '아래 (오른쪽)'], ['above', '위 (왼쪽)']],
        grid: [['none', '없음'], ['tick', '눈금마다'], ['fine', '촘촘하게 (모눈종이)']],
        tick: [['auto', '자동 (숫자)'], ['none', '없음'], ['custom', '직접 적기']],
        plotKind: [['func', '식 y = f(x)'], ['data', '점 이어 그리기']],
        plotStyle: [['line', '꺾은선'], ['smooth', '매끄러운 곡선'], ['points', '점만'], ['both', '선 + 점']],
        guide: [['both', '두 축으로'], ['x', '가로축으로'], ['y', '세로축으로'], ['none', '없음']],
        pos: [['ne', '오른쪽 위'], ['nw', '왼쪽 위'], ['se', '오른쪽 아래'], ['sw', '왼쪽 아래'], ['n', '위'], ['s', '아래'], ['e', '오른쪽'], ['w', '왼쪽']],
        shadeFill: [['hatch', '빗금'], ['lightgray', '옅은 회색'], ['gray', '회색']],
        resStyle: [['zigzag', '지그재그'], ['box', '네모']]
    };
    const F = (key, label, kind, extra) => ({ key, label, kind, ...(extra || {}) });
    const STROKE = [F('color', '색', 'color'), F('width', '굵기', 'num', { step: 0.5, min: 0.3 }), F('dash', '선 모양', 'select', { options: OPT.dash })];
    // 두 칸짜리 숫자 (좌표는 ',', 범위는 '~')
    const P = (a, b, label, sep) => F(a, label, 'pair', { keys: [a, b], sep: sep || ',' });
    const FIELDS = {
        line: [F('arrow', '화살표', 'select', { options: OPT.arrow }), P('x1', 'y1', '시작점'), P('x2', 'y2', '끝점'), ...STROKE],
        polyline: [F('arrow', '화살표', 'select', { options: OPT.arrow }), F('closed', '닫힌 도형', 'check'), F('smooth', '매끄럽게', 'check'),
            F('fill', '채우기', 'select', { options: OPT.fill, when: o => o.closed }), F('points', '점 (x,y)', 'points'), ...STROKE],
        wire: [F('points', '점 (x,y)', 'points'), F('color', '색', 'color'), F('width', '굵기', 'num', { step: 0.5 })],
        rect: [F('label', '안쪽 글자', 'text'), P('x', 'y', '위치'), P('w', 'h', '가로·세로'), F('rot', '기울기 (°)', 'num', { step: 5 }), F('r', '모서리 둥글기', 'num'),
            F('fill', '채우기', 'select', { options: OPT.fill }), F('size', '글자 크기', 'num'), ...STROKE],
        ellipse: [F('label', '안쪽 글자', 'text'), P('cx', 'cy', '중심'), P('rx', 'ry', '반지름 (가로·세로)'), F('fill', '채우기', 'select', { options: OPT.fill }), F('size', '글자 크기', 'num'), ...STROKE],
        text: [F('text', '글자', 'textarea'), P('x', 'y', '위치'), F('size', '크기', 'num'), F('anchor', '맞춤', 'select', { options: OPT.anchor }),
            F('font', '글꼴', 'select', { options: OPT.font }), F('bold', '굵게', 'check'), F('bg', '흰 바탕 (선 가리기)', 'check'), F('box', '테두리', 'check'), F('color', '색', 'color')],
        dot: [P('x', 'y', '위치'), F('r', '크기', 'num', { step: 0.5 }), F('hollow', '속 빈 점 (○)', 'check'), F('color', '색', 'color')],
        ground: [P('x1', 'y1', '시작점'), P('x2', 'y2', '끝점'), F('side', '빗금 쪽', 'select', { options: OPT.side }), F('gap', '빗금 간격', 'num'), F('color', '색', 'color'), F('width', '굵기', 'num', { step: 0.5 })],
        spring: [P('x1', 'y1', '시작점'), P('x2', 'y2', '끝점'), F('coils', '감은 수', 'num'), F('amp', '폭', 'num'), F('color', '색', 'color'), F('width', '굵기', 'num', { step: 0.5 })],
        comp: [F('kind', '소자', 'select', { options: OPT.comp }), F('label', '이름', 'text'), F('labelSide', '이름 위치', 'select', { options: OPT.labelSide }),
            F('style', '저항 모양', 'select', { options: OPT.resStyle, when: o => o.kind === 'resistor' || o.kind === 'varistor' }),
            F('cells', '전지 개수', 'num', { min: 1, max: 6, when: o => o.kind === 'battery' }),
            F('on', '스위치 닫힘', 'check', { when: o => o.kind === 'switch' }),
            P('x', 'y', '가운데'), F('rot', '방향', 'select', { options: OPT.rot, num: true }), F('len', '길이 (끝–끝)', 'num'), F('size', '글자 크기', 'num'),
            F('color', '색', 'color'), F('width', '굵기', 'num', { step: 0.5 })],
        lens: [F('kind', '종류', 'select', { options: OPT.lens }), F('style', '모양', 'select', { options: OPT.lensStyle }), P('x', 'y', '중심'), F('h', '높이', 'num'),
            F('fill', '채우기', 'select', { options: OPT.fill, when: o => o.style === 'shape' }), F('color', '색', 'color'), F('width', '굵기', 'num', { step: 0.5 })],
        mirror: [F('kind', '종류', 'select', { options: OPT.mirror }), P('x', 'y', '중심'), F('h', '높이', 'num'), F('rot', '방향 (°)', 'num', { step: 15 }),
            F('radius', '곡률 반지름', 'num', { when: o => o.kind !== 'plane' }), F('color', '색', 'color'), F('width', '굵기', 'num', { step: 0.5 })],
        wave: [P('x', 'y', '시작점'), F('length', '전체 길이', 'num'), F('lambda', '파장', 'num'), F('amp', '진폭', 'num'), F('phase', '위상 (°)', 'num', { step: 15 }),
            F('axis', '가운데 기준선', 'check'), F('standing', '정상파 (반대 모양 점선)', 'check'), ...STROKE],
        angle: [F('label', '이름', 'text'), P('x', 'y', '꼭짓점'), F('r', '반지름', 'num'), P('a1', 'a2', '각 (시작·끝, °)', '~'), F('right', '직각 표시 (ㄴ)', 'check'),
            F('size', '글자 크기', 'num'), F('color', '색', 'color'), F('width', '굵기', 'num', { step: 0.5 })],
        graph: [
            F('_h1', '축', 'heading'),
            F('xlabel', '가로축 이름', 'text'), F('ylabel', '세로축 이름', 'text'), F('origin', '원점 글자', 'text'),
            P('xmin', 'xmax', '가로 범위', '~'), P('ymin', 'ymax', '세로 범위', '~'),
            F('xtickMode', '가로 눈금', 'select', { options: OPT.tick }), F('xstep', '가로 간격', 'num', { when: o => o.xtickMode === 'auto', help: '0 = 자동' }),
            F('xticks', '가로 눈금 글자', 'text', { when: o => o.xtickMode === 'custom', placeholder: '1:*t*_0, 2:2*t*_0' }),
            F('ytickMode', '세로 눈금', 'select', { options: OPT.tick }), F('ystep', '세로 간격', 'num', { when: o => o.ytickMode === 'auto', help: '0 = 자동' }),
            F('yticks', '세로 눈금 글자', 'text', { when: o => o.ytickMode === 'custom', placeholder: '2:*v*_0' }),
            F('tickLabels', '눈금 숫자·글자 보이기', 'check'), F('grid', '모눈', 'select', { options: OPT.grid }), F('arrows', '축 끝 화살표', 'check'),
            F('plots', '그래프 선', 'list', {
                add: '＋ 선 더하기', title: i => `선 ${i + 1}`,
                make: () => ({ kind: 'func', expr: 'x', data: '', from: null, to: null, style: 'line', color: '#000000', width: 2, dash: 'solid', label: '' }),
                fields: [F('kind', '종류', 'select', { options: OPT.plotKind }),
                    F('expr', 'y =', 'expr', { when: q => q.kind === 'func', placeholder: '예) 2x+1, 3/x, sin(x)' }),
                    F('data', '점 (x,y)', 'textarea', { when: q => q.kind === 'data', placeholder: '0,0  2,4  6,4  8,0' }),
                    P('from', 'to', 'x 구간 (비우면 전체)', '~'),
                    F('style', '그리기', 'select', { options: OPT.plotStyle }), F('dash', '선 모양', 'select', { options: OPT.dash }),
                    F('width', '굵기', 'num', { step: 0.5 }), F('label', '선 이름', 'text', { placeholder: 'A, B …' }), F('color', '색', 'color')]
            }),
            F('marks', '표시할 점 (축까지 점선)', 'list', {
                add: '＋ 점 더하기', title: i => `점 ${i + 1}`,
                make: () => ({ x: 1, y: 1, label: '', guide: 'both', dot: true, pos: 'ne' }),
                fields: [P('x', 'y', '좌표 (그래프 값)'), F('label', '이름', 'text'), F('pos', '이름 위치', 'select', { options: OPT.pos }),
                    F('guide', '점선', 'select', { options: OPT.guide }), F('dot', '점 찍기', 'check')]
            }),
            F('shades', '넓이 칠하기 (선과 가로축 사이)', 'list', {
                add: '＋ 칠하기 더하기', title: i => `칠하기 ${i + 1}`,
                make: () => ({ plot: 1, from: 0, to: 1, fill: 'hatch' }),
                fields: [F('plot', '몇 번째 선', 'num', { min: 1 }), P('from', 'to', 'x 구간', '~'), F('fill', '채우기', 'select', { options: OPT.shadeFill })]
            }),
            F('_h2', '위치·모양', 'heading'),
            P('x', 'y', '위치 (왼쪽 위)'), P('w', 'h', '가로·세로 (px)'), F('size', '글자 크기', 'num'), F('color', '축 색', 'color'), F('width', '축 굵기', 'num', { step: 0.2 })
        ]
    };
    const TYPE_NAMES = {
        line: '선·화살표', polyline: '꺾은선', wire: '도선', rect: '사각형', ellipse: '원', text: '글자', dot: '점', ground: '바닥(빗금)',
        spring: '용수철', comp: '회로 소자', lens: '렌즈', mirror: '거울', wave: '파동', angle: '각도 표시', graph: '그래프'
    };

    let lastTextInput = null;   // 기호 단추가 넣을 곳
    let propTimer = null;
    function changed(rebuild) {
        render();
        clearTimeout(propTimer);
        propTimer = setTimeout(commit, 400);
        if (rebuild) buildProps();
    }

    function el(tag, attrs, ...kids) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (k === 'class') n.className = v;
            else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
            else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
        }
        for (const c of kids) if (c != null) n.append(c);
        return n;
    }

    function numInput(obj, key, f, after) {
        const v = obj[key];
        const inp = el('input', { type: 'number', step: f.step || 1, value: v == null ? '' : v });
        if (f.min != null) inp.min = f.min;
        if (f.max != null) inp.max = f.max;
        inp.addEventListener('input', () => {
            const t = inp.value.trim();
            const n = parseFloat(t);
            if (t === '' && (key === 'from' || key === 'to')) obj[key] = null;
            else if (isFinite(n)) obj[key] = n;
            else return;
            after(false);
        });
        inp.addEventListener('change', () => after(false));
        return inp;
    }

    function buildFields(container, obj, fields, after) {
        for (const f of fields) {
            if (f.when && !f.when(obj)) continue;
            if (f.kind === 'heading') { container.append(el('h3', {}, f.label)); continue; }
            const row = el('div', { class: 'field' });
            const lab = el('label', {}, f.label);
            switch (f.kind) {
                case 'num':
                    row.append(lab, numInput(obj, f.key, f, after));
                    if (f.help) row.append(el('span', { class: 'note' }, f.help));
                    break;
                case 'pair': {
                    const pair = el('div', { class: 'pair' });
                    pair.append(numInput(obj, f.keys[0], f, after), el('span', {}, f.sep), numInput(obj, f.keys[1], f, after));
                    row.append(lab, pair);
                    break;
                }
                case 'text': case 'expr': {
                    const inp = el('input', { type: 'text', value: obj[f.key] == null ? '' : obj[f.key], placeholder: f.placeholder || '' });
                    const err = el('div', { class: 'err' });
                    const check = () => {
                        if (f.kind !== 'expr') return;
                        try { M.compile(inp.value); err.textContent = ''; } catch (e) { err.textContent = '식 오류: ' + e.message; }
                    };
                    inp.addEventListener('input', () => { obj[f.key] = inp.value; check(); after(false); });
                    inp.addEventListener('focus', () => { lastTextInput = inp; });
                    row.append(lab, inp);
                    check();
                    container.append(row);
                    if (f.kind === 'expr') container.append(err);
                    continue;
                }
                case 'textarea': {
                    const ta = el('textarea', { rows: f.key === 'data' ? 3 : 2, placeholder: f.placeholder || '' });
                    ta.value = obj[f.key] == null ? '' : obj[f.key];
                    ta.addEventListener('input', () => { obj[f.key] = ta.value; after(false); });
                    ta.addEventListener('focus', () => { lastTextInput = ta; });
                    row.append(lab, ta);
                    break;
                }
                case 'points': {
                    const ta = el('textarea', { rows: 2 });
                    ta.value = obj.points.map(p => p.join(',')).join('  ');
                    ta.addEventListener('change', () => {
                        const pts = M.parsePoints(ta.value);
                        if (pts.length >= 2) { obj.points = pts; after(false); }
                    });
                    row.append(lab, ta);
                    break;
                }
                case 'check': {
                    const cb = el('input', { type: 'checkbox' });
                    cb.checked = !!obj[f.key];
                    cb.addEventListener('change', () => { obj[f.key] = cb.checked; after(true); });
                    row.append(el('label', {}, cb, ' ' + f.label));
                    break;
                }
                case 'select': {
                    const s = el('select', { class: 'grow' });
                    for (const [v, t] of f.options) s.append(el('option', { value: v }, t));
                    s.value = String(obj[f.key]);
                    s.addEventListener('change', () => { obj[f.key] = f.num ? Number(s.value) : s.value; after(true); });
                    row.append(lab, s);
                    break;
                }
                case 'color': {
                    const c = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(obj[f.key]) ? obj[f.key] : '#000000' });
                    c.addEventListener('input', () => { obj[f.key] = c.value; after(false); });
                    row.append(lab, c);
                    break;
                }
                case 'list': {
                    container.append(el('h3', {}, f.label));
                    const box = el('div', { class: 'card-list' });
                    obj[f.key].forEach((item, i) => {
                        const card = el('div', { class: 'item' });
                        const del = el('button', { class: 'danger small', title: '빼기', onclick: () => { obj[f.key].splice(i, 1); after(true); } }, '✕');
                        card.append(el('div', { class: 'item-head' }, f.title(i), del));
                        buildFields(card, item, f.fields, after);
                        box.append(card);
                    });
                    box.append(el('button', { class: 'secondary small', onclick: () => { obj[f.key].push(f.make()); after(true); } }, f.add));
                    container.append(box);
                    continue;
                }
            }
            container.append(row);
        }
    }

    function buildProps() {
        const box = $('props');
        box.innerHTML = '';
        const sel = selected();
        if (!sel.length) {
            const sc = state.scene;
            box.append(el('div', { class: 'type-title' }, '그림판'));
            const after = rebuild => { sc.width = Math.round(Math.min(3000, Math.max(100, sc.width))); sc.height = Math.round(Math.min(3000, Math.max(100, sc.height))); changed(rebuild); };
            buildFields(box, sc, [P('width', 'height', '크기 (가로·세로)'), F('font', '기본 글꼴', 'select', { options: OPT.font.slice(1) })], after);
            box.append(el('p', { class: 'note' }, `물체 ${sc.objects.length}개. 위 도구로 그리거나, 📚 예시·🤖 AI 그리기로 시작해 보세요.`));
            return;
        }
        const acts = el('div', { class: 'sel-actions' },
            el('button', { onclick: duplicateSel, title: 'Ctrl+D' }, '⧉ 복제'),
            el('button', { onclick: () => reorder(true) }, '맨 앞으로'),
            el('button', { onclick: () => reorder(false) }, '맨 뒤로'),
            sel.some(o => o.type === 'comp' || o.type === 'mirror' || o.type === 'rect') ? el('button', { onclick: rotateSel, title: 'R' }, '⟳ 90°') : null,
            el('button', { class: 'danger', onclick: removeSel, title: 'Delete' }, '🗑 지우기'));
        if (sel.length > 1) {
            box.append(el('div', { class: 'type-title' }, `${sel.length}개 선택`), acts,
                el('p', { class: 'note' }, '끌면 함께 움직입니다. 하나만 고르면 자세한 속성이 나옵니다.'));
            return;
        }
        const o = sel[0];
        box.append(el('div', { class: 'type-title' }, TYPE_NAMES[o.type] || o.type), acts);
        buildFields(box, o, FIELDS[o.type] || [], rebuild => changed(rebuild));
    }

    function focusFirstText() {
        const t = $('props').querySelector('textarea, input[type=text]');
        if (t) { t.focus(); t.select && t.select(); }
    }

    // 기호 단추
    const SYMBOLS = ['θ', 'λ', 'α', 'β', 'ω', 'μ', 'π', 'ρ', 'Δ', 'Ω', '°', '×', '·', '±', '→', '⇒', '′', '″', '√', '∝', '≈', '≤', '≥', '①', '②', '③', '㉠', '㉡', '㉢', '(가)', '(나)', '(다)'];
    function buildSymbols() {
        const box = $('symbols');
        for (const s of SYMBOLS) {
            box.append(el('button', {
                type: 'button', onmousedown: e => e.preventDefault(), onclick: () => {
                    const t = lastTextInput;
                    if (!t || !document.body.contains(t)) return;
                    const a = t.selectionStart ?? t.value.length, b = t.selectionEnd ?? t.value.length;
                    t.value = t.value.slice(0, a) + s + t.value.slice(b);
                    t.selectionStart = t.selectionEnd = a + s.length;
                    t.dispatchEvent(new Event('input'));
                    t.focus();
                }
            }, s));
        }
    }

    // ───────────────────────── 내보내기 ─────────────────────────
    function contentBox() {
        const sc = state.scene;
        const m = Math.max(0, Number($('ex-margin').value) || 0);
        if ($('ex-crop').value === 'page' || !sc.objects.length) return { x: 0, y: 0, w: sc.width, h: sc.height };
        // 화면 밖 임시 SVG 에 그려서 크기를 잰다
        const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        tmp.setAttribute('width', sc.width); tmp.setAttribute('height', sc.height);
        tmp.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden';
        tmp.innerHTML = M.renderInner(sc, { background: false });
        document.body.append(tmp);
        let b;
        try { b = tmp.querySelector('.fm-content').getBBox(); } finally { tmp.remove(); }
        if (!b || !b.width) return { x: 0, y: 0, w: sc.width, h: sc.height };
        const x = Math.floor(b.x - m), y = Math.floor(b.y - m);
        return { x, y, w: Math.ceil(b.x + b.width + m) - x, h: Math.ceil(b.y + b.height + m) - y };
    }
    function svgText() {
        return M.renderSVG(state.scene, { box: contentBox(), transparent: $('ex-transparent').checked });
    }
    async function pngBlob() {
        const box = contentBox();
        const text = M.renderSVG(state.scene, { box, transparent: $('ex-transparent').checked });
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
        await img.decode();
        const k = Number($('ex-scale').value) || 3;
        const cv = document.createElement('canvas');
        cv.width = Math.round(box.w * k); cv.height = Math.round(box.h * k);
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('PNG 만들기 실패')), 'image/png'));
    }
    function download(blob, name) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    const fileName = ext => (($('ex-name').value || '문항그림').replace(/[\\/:*?"<>|]/g, '_')) + '.' + ext;
    function msg(id, text, kind) {
        const m = $(id);
        m.hidden = !text;
        m.textContent = text || '';
        m.className = 'msg' + (kind ? ' ' + kind : '');
    }

    $('ex-copy').addEventListener('click', async () => {
        try {
            if (!navigator.clipboard || !window.ClipboardItem) throw new Error('이 브라우저는 그림 복사를 지원하지 않습니다. ‘PNG 저장’을 쓰세요.');
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]);
            msg('ex-msg', '✅ 복사했습니다. 한글·워드에서 Ctrl+V 로 붙여 넣으세요.', 'ok');
        } catch (e) { msg('ex-msg', '복사하지 못했습니다: ' + e.message, 'bad'); }
    });
    $('ex-png').addEventListener('click', async () => {
        try { download(await pngBlob(), fileName('png')); msg('ex-msg', ''); } catch (e) { msg('ex-msg', 'PNG 저장 실패: ' + e.message, 'bad'); }
    });
    $('ex-svg').addEventListener('click', () => {
        download(new Blob([svgText()], { type: 'image/svg+xml' }), fileName('svg'));
    });

    // ───────────────────────── 작업 파일 ─────────────────────────
    $('btn-save').addEventListener('click', () => {
        const data = JSON.stringify({ app: 'figure-maker', version: 1, scene: state.scene }, null, 1);
        download(new Blob([data], { type: 'application/json' }), fileName('json'));
    });
    $('btn-open').addEventListener('click', () => $('file-open').click());
    $('file-open').addEventListener('change', async () => {
        const file = $('file-open').files[0];
        $('file-open').value = '';
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            replaceScene(M.normalizeScene(data.scene || data));
            $('ex-name').value = file.name.replace(/\.json$/i, '');
        } catch (e) { alert('작업 파일을 열지 못했습니다: ' + e.message); }
    });
    function replaceScene(scene) {
        commit();
        state.scene = scene;
        state.sel = [];
        commit();
        render(); buildProps();
    }
    $('btn-new').addEventListener('click', () => {
        if (state.scene.objects.length && !confirm('지금 그림을 지우고 새로 시작할까요? (↶ 로 되돌릴 수 있습니다)')) return;
        replaceScene(M.normalizeScene({ font: state.scene.font }));
    });
    const exSel = $('sel-example');
    for (const [k, ex] of Object.entries(M.EXAMPLES)) exSel.append(el('option', { value: k }, ex.name));
    exSel.addEventListener('change', () => {
        const ex = M.EXAMPLES[exSel.value];
        exSel.value = '';
        if (!ex) return;
        if (state.scene.objects.length && !confirm(`‘${ex.name}’ 예시로 바꿀까요? (↶ 로 되돌릴 수 있습니다)`)) return;
        replaceScene(M.normalizeScene(JSON.parse(JSON.stringify(ex.scene))));
    });

    // ───────────────────────── AI 그리기 ─────────────────────────
    const AI_KEY = 'figure-maker-ai-key', AI_MODEL = 'figure-maker-ai-model';
    let aiImage = null;     // { media_type, data(base64), url }
    let aiAbort = null;
    (function initAi() {
        const k = load(AI_KEY);
        if (k) { $('ai-key').value = k; $('ai-remember').checked = true; }
        else $('ai-set').open = true;
        const m = load(AI_MODEL);
        if (m && [...$('ai-model').options].some(o => o.value === m)) $('ai-model').value = m;
    })();
    $('ai-remember').addEventListener('change', () => store(AI_KEY, $('ai-remember').checked ? $('ai-key').value.trim() : null));
    $('ai-key').addEventListener('change', () => { if ($('ai-remember').checked) store(AI_KEY, $('ai-key').value.trim()); });
    $('ai-model').addEventListener('change', () => store(AI_MODEL, $('ai-model').value));

    // 사진은 긴 쪽 1568px 이하 JPEG 로 줄여서 보낸다
    $('ai-image').addEventListener('change', async () => {
        const file = $('ai-image').files[0];
        if (!file) return;
        try {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.src = url;
            await img.decode();
            const k = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight));
            const cv = document.createElement('canvas');
            cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
            const ctx = cv.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.drawImage(img, 0, 0, cv.width, cv.height);
            const dataUrl = cv.toDataURL('image/jpeg', 0.9);
            URL.revokeObjectURL(url);
            aiImage = { media_type: 'image/jpeg', data: dataUrl.split(',')[1] };
            $('ai-thumb').querySelector('img').src = dataUrl;
            $('ai-thumb').hidden = false;
        } catch (e) { msg('ai-msg', '그림을 읽지 못했습니다: ' + e.message, 'bad'); }
    });
    $('ai-image-clear').addEventListener('click', () => { aiImage = null; $('ai-image').value = ''; $('ai-thumb').hidden = true; });

    $('ai-run').addEventListener('click', async () => {
        const apiKey = $('ai-key').value.trim();
        const prompt = $('ai-prompt').value.trim();
        if (!apiKey) { $('ai-set').open = true; msg('ai-msg', 'AI 설정에 Claude API 키를 넣어 주세요.', 'bad'); return; }
        if (!prompt && !aiImage) { msg('ai-msg', '그릴 내용을 적거나 참고 그림을 붙여 주세요.', 'bad'); return; }
        if ($('ai-remember').checked) store(AI_KEY, apiKey);
        const mode = $('ai-mode').value;
        $('ai-run').disabled = true; $('ai-stop').hidden = false;
        aiAbort = new AbortController();
        const t0 = Date.now();
        const tick = setInterval(() => msg('ai-msg', `🤖 그리는 중… ${Math.round((Date.now() - t0) / 1000)}초 (보통 20~60초)`), 1000);
        msg('ai-msg', '🤖 AI 를 불러오는 중…');
        try {
            const ai = await import(new URL('../js/figure-ai.js', location.href).href);
            const res = await ai.drawWithAI({
                apiKey, model: $('ai-model').value, prompt, mode, image: aiImage,
                scene: state.scene, signal: aiAbort.signal
            });
            clearInterval(tick);
            const got = M.normalizeScene(res.scene);
            if (!got.objects.length) throw new Error('AI 가 그릴 물체를 주지 않았습니다.' + (res.note ? '\n' + res.note : ''));
            commit();
            if (mode === 'add') {
                const ids = new Set(state.scene.objects.map(o => o.id));
                for (const o of got.objects) { if (ids.has(o.id)) o.id = M.newId(); state.scene.objects.push(o); }
                state.sel = got.objects.map(o => o.id);
            } else {
                state.scene = got;
                state.sel = [];
            }
            commit();
            render(); buildProps();
            msg('ai-msg', `✅ ${got.objects.length}개를 그렸습니다 (${Math.round((Date.now() - t0) / 1000)}초). 마음에 들지 않으면 ↶ 로 되돌리거나, ‘지금 그림 고치기’로 다시 부탁하세요.` + (res.note ? '\n💬 ' + res.note : ''), 'ok');
        } catch (e) {
            clearInterval(tick);
            msg('ai-msg', e.name === 'AbortError' || /abort/i.test(e.message) ? '멈췄습니다.' : '❌ ' + e.message, 'bad');
        } finally {
            $('ai-run').disabled = false; $('ai-stop').hidden = true; aiAbort = null;
        }
    });
    $('ai-stop').addEventListener('click', () => { if (aiAbort) aiAbort.abort(); });

    // ───────────────────────── 시작 ─────────────────────────
    document.querySelectorAll('#tools [data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
    $('sel-comp').addEventListener('change', () => setTool('comp'));
    document.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.tabs [data-tab]').forEach(x => x.classList.toggle('on', x === b));
        document.querySelectorAll('.panel[data-tab]').forEach(p => { p.hidden = p.dataset.tab !== b.dataset.tab; });
    }));
    $('btn-undo').addEventListener('click', undo);
    $('btn-redo').addEventListener('click', redo);
    $('chk-grid').addEventListener('change', render);

    const saved = load(STORE_KEY);
    let start = null;
    if (saved) { try { start = M.normalizeScene(JSON.parse(saved)); } catch (e) { start = null; } }
    state.scene = start || M.normalizeScene(JSON.parse(JSON.stringify(M.EXAMPLES.vt.scene)));
    state.saved = JSON.stringify(state.scene);
    buildSymbols();
    setTool('select');
    buildProps();
    updateUndoButtons();
    window.__figureMaker = state;   // 시험용
})();
