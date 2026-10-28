// 문항 출제용 그림 도구: 그림 자료 구조, 식 계산, SVG 그리기 (브라우저/Node 공용)
// 그림(scene) = { width, height, font, objects: [ { id, type, ... } ] }
// 좌표는 픽셀, 왼쪽 위가 (0, 0), 아래로 갈수록 y 가 커진다.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.FigureModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    const finite = v => typeof v === 'number' && isFinite(v);
    const r2 = v => Math.round(v * 100) / 100;
    const f = v => String(r2(v));

    // ───────────────────────── 식 계산 ─────────────────────────
    // 쓸 수 있는 것: + - * / ^, 괄호, 2x 처럼 곱셈 생략, 변수 x (또는 t),
    // sin cos tan asin acos atan sqrt abs exp ln log floor ceil sign min max pow, pi, e
    const FUNCS = {
        sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
        sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10,
        floor: Math.floor, ceil: Math.ceil, sign: Math.sign, round: Math.round,
        min: Math.min, max: Math.max, pow: Math.pow,
        sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh
    };
    const CONSTS = { pi: Math.PI, e: Math.E, π: Math.PI };
    const VARS = ['x', 't'];

    function tokenize(src) {
        const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\*\*/g, '^');
        const out = [];
        let i = 0;
        while (i < s.length) {
            const c = s[i];
            if (/\s/.test(c)) { i++; continue; }
            const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
            if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
            const id = /^[A-Za-zπ]+/.exec(s.slice(i));
            if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
            if ('+-*/^(),'.includes(c)) { out.push({ t: c }); i++; continue; }
            throw new Error(`알 수 없는 글자 '${c}'`);
        }
        return out;
    }

    // 식 글자를 함수로 바꾼다. 실패하면 오류를 던진다.
    function compile(src) {
        const toks = tokenize(src);
        if (!toks.length) throw new Error('식이 비어 있습니다');
        let p = 0;
        const peek = () => toks[p];
        const take = t => { if (!toks[p] || toks[p].t !== t) throw new Error(`'${t}' 가 필요합니다`); p++; };
        // 다음 토큰이 곱셈 생략으로 이어지는지 (2x, 2(x+1), x sin(x), (x)(x))
        const implicit = () => { const k = peek(); return k && (k.t === 'num' || k.t === 'id' || k.t === '('); };

        function expr() {
            let a = term();
            while (peek() && (peek().t === '+' || peek().t === '-')) {
                const op = toks[p++].t, b = term(), l = a;
                a = op === '+' ? x => l(x) + b(x) : x => l(x) - b(x);
            }
            return a;
        }
        function term() {
            let a = unary();
            for (;;) {
                const k = peek();
                if (k && (k.t === '*' || k.t === '/')) {
                    p++;
                    const b = unary(), l = a;
                    a = k.t === '*' ? x => l(x) * b(x) : x => l(x) / b(x);
                } else if (implicit()) {
                    const b = power(), l = a;
                    a = x => l(x) * b(x);
                } else return a;
            }
        }
        function unary() {
            const k = peek();
            if (k && k.t === '-') { p++; const a = unary(); return x => -a(x); }
            if (k && k.t === '+') { p++; return unary(); }
            return power();
        }
        function power() {
            const base = atom();
            if (peek() && peek().t === '^') { p++; const e = unary(); return x => Math.pow(base(x), e(x)); }
            return base;
        }
        function atom() {
            const k = toks[p++];
            if (!k) throw new Error('식이 덜 끝났습니다');
            if (k.t === 'num') { const v = k.v; return () => v; }
            if (k.t === '(') { const a = expr(); take(')'); return a; }
            if (k.t === 'id') {
                const name = k.v;
                if (FUNCS[name] && peek() && peek().t === '(') {
                    p++;
                    const args = [expr()];
                    while (peek() && peek().t === ',') { p++; args.push(expr()); }
                    take(')');
                    const fn = FUNCS[name];
                    return x => fn(...args.map(g => g(x)));
                }
                if (name in CONSTS) { const v = CONSTS[name]; return () => v; }
                if (VARS.includes(name)) return x => x;
                // 'xsin' 처럼 붙여 쓴 것은 지원하지 않는다
                throw new Error(`'${name}' 을(를) 알 수 없습니다 (변수는 x 또는 t)`);
            }
            throw new Error(`'${k.t}' 위치가 잘못되었습니다`);
        }
        const fn = expr();
        if (p < toks.length) throw new Error(`'${toks[p].t === 'id' || toks[p].t === 'num' ? toks[p].v : toks[p].t}' 근처를 확인하세요`);
        return fn;
    }

    // 상수 식 (예: "pi/2", "3") → 숫자, 실패하면 NaN
    function evalConst(src) {
        try { return compile(src)(0); } catch (e) { return NaN; }
    }

    // "0,0 2,4; 4,4" 처럼 숫자를 둘씩 묶어 점 목록으로
    function parsePoints(src) {
        const nums = (String(src || '').match(/-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/g) || []).map(Number);
        const pts = [];
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
        return pts;
    }

    // ───────────────────────── 글자 (아래첨자·위첨자·기울임) ─────────────────────────
    // v_0, v_{max}, x^2, 10^{-3}, *v* (기울임), \theta → θ
    const GREEK = {
        alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', theta: 'θ', lambda: 'λ',
        mu: 'μ', nu: 'ν', pi: 'π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', phi: 'φ', Phi: 'Φ',
        omega: 'ω', Omega: 'Ω', deg: '°', times: '×', cdot: '·', to: '→', pm: '±'
    };
    function parseRich(src) {
        const s = String(src == null ? '' : src).replace(/\\([A-Za-z]+)/g, (m, n) => GREEK[n] || m);
        const segs = [];
        let it = false;
        const push = (t, lv) => {
            if (!t) return;
            const last = segs[segs.length - 1];
            if (last && last.lv === lv && last.it === it) last.t += t; else segs.push({ t, lv, it });
        };
        // 첨자 안에서도 *기울임* 을 쓸 수 있게 한 글자씩 처리
        function run(str, lv) {
            for (let i = 0; i < str.length; i++) {
                const c = str[i];
                if (c === '\\' && i + 1 < str.length) { push(str[++i], lv); continue; }
                if (c === '*') { it = !it; continue; }
                if ((c === '_' || c === '^') && lv === 0 && i + 1 < str.length) {
                    const nlv = c === '_' ? -1 : 1;
                    if (str[i + 1] === '{') {
                        const end = str.indexOf('}', i + 2);
                        const inner = end < 0 ? str.slice(i + 2) : str.slice(i + 2, end);
                        run(inner, nlv);
                        i = end < 0 ? str.length : end;
                    } else { run(str[i + 1], nlv); i++; }
                    continue;
                }
                push(c, lv);
            }
        }
        run(s, 0);
        return segs;
    }
    const plainText = src => parseRich(src).map(s => s.t).join('');

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 대략적인 글자 폭 (한글·한자 1, 나머지 0.56 글자 크기)
    function textWidth(src, size) {
        let w = 0;
        for (const s of parseRich(src)) {
            const k = s.lv ? 0.7 : 1;
            for (const ch of s.t) w += (/[ᄀ-ᇿ㄰-㆏가-힣一-鿿]/.test(ch) ? 1 : 0.56) * size * k;
        }
        return w;
    }

    const FONTS = {
        serif: "'Times New Roman', Batang, '바탕', 'Noto Serif KR', 'Nanum Myeongjo', serif",
        sans: "Arial, 'Malgun Gothic', '맑은 고딕', 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif"
    };

    // 한 줄 글자 → <text> (여러 줄이면 줄마다 하나씩)
    function richText(src, x, y, o) {
        o = o || {};
        const size = o.size || 16;
        const lines = String(src == null ? '' : src).split('\n');
        const lh = size * 1.25;
        // 세로 가운데 맞춤: 첫 줄 기준선을 줄 수에 맞춰 올린다
        const y0 = o.middle ? y + size * 0.35 - (lines.length - 1) * lh / 2 : y;
        let out = '';
        lines.forEach((line, li) => {
            const segs = parseRich(line);
            if (!segs.length) return;
            let attrs = `x="${f(x)}" y="${f(y0 + li * lh)}" font-size="${f(size)}"`;
            if (o.anchor && o.anchor !== 'start') attrs += ` text-anchor="${o.anchor}"`;
            if (o.font) attrs += ` font-family="${esc(FONTS[o.font] || o.font)}"`;
            if (o.bold) attrs += ' font-weight="bold"';
            attrs += ` fill="${esc(o.color || '#000')}"`;
            const off = lv => lv < 0 ? size * 0.28 : lv > 0 ? -size * 0.38 : 0;
            let prev = 0, body = '';
            for (const s of segs) {
                const dy = off(s.lv) - off(prev);
                let a = '';
                if (dy) a += ` dy="${f(dy)}"`;
                if (s.lv) a += ` font-size="${f(size * 0.7)}"`;
                if (s.it) a += ' font-style="italic"';
                body += a ? `<tspan${a}>${esc(s.t)}</tspan>` : esc(s.t);
                prev = s.lv;
            }
            out += `<text ${attrs}>${body}</text>`;
        });
        return out;
    }

    // ───────────────────────── 기본값 ─────────────────────────
    const INK = '#000000';
    const STROKE = { color: INK, width: 1.5, dash: 'solid' };
    const PLOT = { kind: 'func', expr: 'x', data: '', from: null, to: null, style: 'line', color: INK, width: 2, dash: 'solid', label: '' };
    const MARK = { x: 0, y: 0, label: '', guide: 'both', dot: true, pos: 'ne' };
    const SHADE = { plot: 1, from: 0, to: 1, fill: 'hatch' };
    const DEFAULTS = {
        line: { x1: 0, y1: 0, x2: 120, y2: 0, arrow: 'none', ...STROKE },
        rect: { x: 0, y: 0, w: 100, h: 60, r: 0, rot: 0, fill: 'none', label: '', size: 18, ...STROKE },
        ellipse: { cx: 0, cy: 0, rx: 40, ry: 40, fill: 'none', label: '', size: 18, ...STROKE },
        polyline: { points: [[0, 0], [100, 0]], closed: false, smooth: false, arrow: 'none', fill: 'none', ...STROKE },
        wire: { points: [[0, 0], [100, 0]], color: INK, width: 1.5 },
        text: { x: 0, y: 0, text: '글자', size: 18, anchor: 'middle', font: '', bold: false, color: INK, bg: false, box: false },
        dot: { x: 0, y: 0, r: 3, hollow: false, color: INK },
        ground: { x1: 0, y1: 0, x2: 160, y2: 0, side: 'below', gap: 8, color: INK, width: 1.5 },
        spring: { x1: 0, y1: 0, x2: 120, y2: 0, coils: 8, amp: 8, color: INK, width: 1.5 },
        comp: { kind: 'resistor', x: 0, y: 0, rot: 0, len: 80, label: '', labelSide: 'a', style: 'zigzag', cells: 1, on: false, size: 16, color: INK, width: 1.5 },
        lens: { kind: 'convex', x: 0, y: 0, h: 140, style: 'shape', fill: 'none', color: INK, width: 1.5 },
        mirror: { kind: 'plane', x: 0, y: 0, h: 140, rot: 0, radius: 220, color: INK, width: 1.5 },
        wave: { x: 0, y: 0, length: 300, lambda: 100, amp: 30, phase: 0, standing: false, axis: true, ...STROKE, width: 2 },
        angle: { x: 0, y: 0, r: 26, a1: 0, a2: 40, label: 'θ', right: false, size: 16, color: INK, width: 1.2 },
        graph: {
            x: 0, y: 0, w: 320, h: 220, xmin: 0, xmax: 10, ymin: 0, ymax: 10,
            xlabel: '*x*', ylabel: '*y*', origin: 'O',
            xtickMode: 'auto', xstep: 0, xticks: '', ytickMode: 'auto', ystep: 0, yticks: '',
            tickLabels: true, grid: 'none', arrows: true, size: 15, color: INK, width: 1.2,
            plots: [], marks: [], shades: []
        }
    };
    const TYPES = Object.keys(DEFAULTS);
    const ENUMS = {
        arrow: ['none', 'end', 'start', 'both', 'mid'],
        dash: ['solid', 'dashed', 'dotted'],
        fill: ['none', 'white', 'lightgray', 'gray', 'black', 'hatch'],
        anchor: ['start', 'middle', 'end'],
        font: ['', 'serif', 'sans'],
        side: ['below', 'above'],
        labelSide: ['a', 'b'],
        style: ['zigzag', 'box', 'shape', 'arrow'],
        grid: ['none', 'tick', 'fine'],
        xtickMode: ['auto', 'none', 'custom'], ytickMode: ['auto', 'none', 'custom'],
        guide: ['both', 'x', 'y', 'none'], pos: ['ne', 'nw', 'se', 'sw', 'n', 's', 'e', 'w']
    };
    const KINDS = {
        comp: ['resistor', 'battery', 'bulb', 'switch', 'ammeter', 'voltmeter', 'galvanometer', 'led', 'diode', 'capacitor', 'varistor', 'ac', 'coil'],
        lens: ['convex', 'concave'],
        mirror: ['plane', 'concave', 'convex'],
        plot: ['func', 'data'],
        plotStyle: ['line', 'smooth', 'points', 'both']
    };

    // 값 하나를 기본값의 종류에 맞춘다 (AI 가 준 값이나 저장 파일을 믿지 않고 정리)
    function coerce(key, val, def, kindList) {
        if (typeof def === 'number') { const n = Number(val); return finite(n) ? n : def; }
        if (typeof def === 'boolean') return val == null ? def : val === true || val === 'true' || val === 1;
        if (def === null) { if (val === null || val === '' || val === undefined) return null; const n = Number(val); return finite(n) ? n : null; }
        if (typeof def === 'string') {
            const s = val == null ? def : String(val);
            if (kindList) return kindList.includes(s) ? s : def;
            if (ENUMS[key] && key !== 'style') return ENUMS[key].includes(s) ? s : def;
            if (key === 'color') return /^#[0-9a-fA-F]{3,8}$/.test(s) || /^[a-z]+$/.test(s) ? s : def;
            return s.slice(0, 2000);
        }
        return def;
    }
    function cleanFields(src, defs, kinds) {
        const o = {};
        for (const k of Object.keys(defs)) {
            const d = defs[k];
            if (Array.isArray(d)) continue;
            o[k] = coerce(k, src[k], d, kinds && kinds[k]);
        }
        return o;
    }
    function cleanPoints(pts) {
        if (typeof pts === 'string') pts = parsePoints(pts);
        if (!Array.isArray(pts)) return null;
        const out = [];
        for (const p of pts) {
            const x = Number(Array.isArray(p) ? p[0] : p && p.x), y = Number(Array.isArray(p) ? p[1] : p && p.y);
            if (finite(x) && finite(y)) out.push([x, y]);
        }
        return out.length >= 2 ? out.slice(0, 500) : null;
    }

    let idSeq = 0;
    const newId = () => 'o' + Date.now().toString(36) + (idSeq++).toString(36);

    function normalizeObject(raw) {
        if (!raw || typeof raw !== 'object') return null;
        let type = raw.type;
        if (type === 'arrow') { type = 'line'; if (!raw.arrow) raw = { ...raw, arrow: 'end' }; }
        if (type === 'circle') { type = 'ellipse'; raw = { ...raw, rx: raw.rx ?? raw.r, ry: raw.ry ?? raw.r }; }
        if (!DEFAULTS[type]) return null;
        const defs = DEFAULTS[type];
        let kinds = null;
        if (KINDS[type]) kinds = { kind: KINDS[type] };
        const o = { id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : newId(), type, ...cleanFields(raw, defs, kinds) };
        if (type === 'comp') o.style = ['zigzag', 'box'].includes(raw.style) ? raw.style : 'zigzag';
        if (type === 'lens') o.style = ['shape', 'arrow'].includes(raw.style) ? raw.style : 'shape';
        if (type === 'polyline' || type === 'wire') o.points = cleanPoints(raw.points) || defs.points.map(p => p.slice());
        if (type === 'graph') {
            if (o.xmax <= o.xmin) o.xmax = o.xmin + 1;
            if (o.ymax <= o.ymin) o.ymax = o.ymin + 1;
            o.w = Math.max(40, o.w); o.h = Math.max(40, o.h);
            const list = (a, n) => (Array.isArray(a) ? a : []).slice(0, n).filter(v => v && typeof v === 'object');
            o.plots = list(raw.plots, 20).map(pl => {
                const q = cleanFields(pl, PLOT, { kind: KINDS.plot, style: KINDS.plotStyle });
                if (Array.isArray(pl.data) || Array.isArray(pl.points)) q.data = (cleanPoints(pl.data || pl.points) || []).map(p => p.join(',')).join(' ');
                return q;
            });
            o.marks = list(raw.marks, 40).map(m => cleanFields(m, MARK));
            o.shades = list(raw.shades, 10).map(s => cleanFields(s, SHADE));
        }
        for (const k of ['w', 'h', 'rx', 'ry', 'len', 'length', 'lambda', 'r', 'size', 'radius']) {
            if (k in o && typeof o[k] === 'number') o[k] = Math.abs(o[k]);
        }
        if ('width' in o) o.width = Math.min(12, Math.max(0.3, o.width));
        if ('size' in o) o.size = Math.min(120, Math.max(6, o.size));
        if (type === 'spring') o.coils = Math.round(Math.min(40, Math.max(2, o.coils)));
        if (type === 'comp') { o.cells = Math.round(Math.min(6, Math.max(1, o.cells))); o.len = Math.max(30, o.len); }
        if (type === 'wave') o.lambda = Math.max(4, o.lambda);
        return o;
    }

    function normalizeScene(raw) {
        raw = raw && typeof raw === 'object' ? raw : {};
        const w = Number(raw.width), h = Number(raw.height);
        const scene = {
            width: finite(w) ? Math.round(Math.min(3000, Math.max(100, w))) : 640,
            height: finite(h) ? Math.round(Math.min(3000, Math.max(100, h))) : 420,
            font: raw.font === 'sans' ? 'sans' : 'serif',
            objects: []
        };
        const seen = new Set();
        for (const r of Array.isArray(raw.objects) ? raw.objects.slice(0, 1000) : []) {
            const o = normalizeObject(r);
            if (!o) continue;
            if (seen.has(o.id)) o.id = newId();
            seen.add(o.id);
            scene.objects.push(o);
        }
        return scene;
    }

    function makeObject(type, props) {
        return normalizeObject({ type, ...JSON.parse(JSON.stringify(DEFAULTS[type])), ...(props || {}) });
    }

    // ───────────────────────── 위치 다루기 ─────────────────────────
    function translate(o, dx, dy) {
        for (const [a, b] of [['x', 'y'], ['x1', 'y1'], ['x2', 'y2'], ['cx', 'cy']]) {
            if (a in o) { o[a] = r2(o[a] + dx); o[b] = r2(o[b] + dy); }
        }
        if (o.points) o.points = o.points.map(([x, y]) => [r2(x + dx), r2(y + dy)]);
    }

    const rad = d => d * Math.PI / 180;
    function rotPt(px, py, cx, cy, deg) {
        const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
        const dx = px - cx, dy = py - cy;
        return [cx + dx * c - dy * s, cy + dx * s + dy * c];
    }

    // 회로 소자의 양 끝 (도선을 붙일 곳)
    function terminals(o) {
        if (o.type === 'comp') return [rotPt(o.x - o.len / 2, o.y, o.x, o.y, o.rot), rotPt(o.x + o.len / 2, o.y, o.x, o.y, o.rot)];
        if (o.type === 'wire' || o.type === 'polyline') return [o.points[0], o.points[o.points.length - 1]];
        if (o.type === 'line') return [[o.x1, o.y1], [o.x2, o.y2]];
        if (o.type === 'dot') return [[o.x, o.y]];
        return [];
    }

    // 끌어서 바꿀 수 있는 손잡이
    function handles(o) {
        switch (o.type) {
            case 'line': case 'ground': case 'spring':
                return [{ key: 'p1', x: o.x1, y: o.y1 }, { key: 'p2', x: o.x2, y: o.y2 }];
            case 'rect': return o.rot ? [] : [{ key: 'se', x: o.x + o.w, y: o.y + o.h }];
            case 'graph': return [{ key: 'se', x: o.x + o.w, y: o.y + o.h }];
            case 'ellipse': return [{ key: 'r', x: o.cx + o.rx, y: o.cy + o.ry }];
            case 'polyline': case 'wire': return o.points.map((p, i) => ({ key: 'p' + i, x: p[0], y: p[1] }));
            case 'wave': return [{ key: 'end', x: o.x + o.length, y: o.y - o.amp }];
            case 'angle': return [
                { key: 'a1', x: o.x + o.r * Math.cos(rad(o.a1)), y: o.y - o.r * Math.sin(rad(o.a1)) },
                { key: 'a2', x: o.x + o.r * Math.cos(rad(o.a2)), y: o.y - o.r * Math.sin(rad(o.a2)) }];
            case 'lens': return [{ key: 'h', x: o.x, y: o.y - o.h / 2 }];
            case 'mirror': { const [hx, hy] = rotPt(o.x, o.y - o.h / 2, o.x, o.y, o.rot); return [{ key: 'h', x: hx, y: hy }]; }
            case 'comp': { const t = terminals(o)[1]; return [{ key: 'len', x: t[0], y: t[1] }]; }
            default: return [];
        }
    }

    function moveHandle(o, key, x, y) {
        x = r2(x); y = r2(y);
        switch (o.type) {
            case 'line': case 'ground': case 'spring':
                if (key === 'p1') { o.x1 = x; o.y1 = y; } else { o.x2 = x; o.y2 = y; }
                break;
            case 'rect': case 'graph': o.w = Math.max(10, x - o.x); o.h = Math.max(10, y - o.y); break;
            case 'ellipse': o.rx = Math.max(2, Math.abs(x - o.cx)); o.ry = Math.max(2, Math.abs(y - o.cy)); break;
            case 'polyline': case 'wire': { const i = +key.slice(1); if (o.points[i]) o.points[i] = [x, y]; break; }
            case 'wave': o.length = Math.max(10, x - o.x); o.amp = r2(o.y - y); break;
            case 'angle': {
                const a = r2(Math.atan2(o.y - y, x - o.x) * 180 / Math.PI);
                o[key] = a; o.r = Math.max(6, r2(Math.hypot(x - o.x, y - o.y)));
                break;
            }
            case 'lens': case 'mirror': o.h = Math.max(10, r2(2 * Math.hypot(x - o.x, y - o.y))); break;
            case 'comp': o.len = Math.max(30, r2(2 * Math.hypot(x - o.x, y - o.y))); break;
        }
    }

    // ───────────────────────── 그리기 도우미 ─────────────────────────
    const DASH = { solid: '', dashed: 'stroke-dasharray="7 5"', dotted: 'stroke-dasharray="2 4"' };
    function strokeAttr(o, extra) {
        const w = o.width || 1.5;
        let a = `stroke="${esc(o.color || INK)}" stroke-width="${f(w)}"`;
        const d = o.dash && o.dash !== 'solid' ? (o.dash === 'dashed' ? `stroke-dasharray="${f(w * 4 + 3)} ${f(w * 2.5 + 2)}"` : `stroke-dasharray="${f(w)} ${f(w * 2 + 2)}" stroke-linecap="round"`) : '';
        if (d) a += ' ' + d;
        return a + (extra ? ' ' + extra : '');
    }
    function fillAttr(fill) {
        switch (fill) {
            case 'white': return 'fill="#ffffff"';
            case 'lightgray': return 'fill="#d9d9d9"';
            case 'gray': return 'fill="#9a9a9a"';
            case 'black': return 'fill="#000000"';
            case 'hatch': return 'fill="url(#fm-hatch)"';
            default: return 'fill="none"';
        }
    }
    const pathD = pts => pts.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1])).join(' ');

    // 매끄러운 곡선 (카트멀–롬 → 베지어)
    function smoothD(pts, closed) {
        if (pts.length < 3) return pathD(pts) + (closed ? ' Z' : '');
        const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
        let d = `M${f(P[1][0])} ${f(P[1][1])}`;
        const n = closed ? pts.length : pts.length - 1;
        for (let i = 1; i <= n; i++) {
            const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
            d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
        }
        return d + (closed ? ' Z' : '');
    }

    // 화살촉: (tx, ty) 끝, (dx, dy) 방향
    function arrowHead(tx, ty, dx, dy, w, color) {
        const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        const len = 7 + 2.6 * w, hw = len * 0.42;
        const bx = tx - ux * len, by = ty - uy * len;
        return `<path d="M${f(tx)} ${f(ty)} L${f(bx - uy * hw)} ${f(by + ux * hw)} L${f(bx + ux * len * 0.18)} ${f(by + uy * len * 0.18)} L${f(bx + uy * hw)} ${f(by - ux * hw)} Z" fill="${esc(color || INK)}" stroke="none"/>`;
    }
    const headLen = w => 7 + 2.6 * w;

    // 선 + 화살표 (점 목록)
    function arrowPath(pts, o, smooth) {
        const w = o.width || 1.5, mode = o.arrow || 'none';
        let P = pts.map(p => p.slice());
        let heads = '';
        const n = P.length;
        if ((mode === 'end' || mode === 'both') && n >= 2) {
            const [a, b] = [P[n - 2], P[n - 1]];
            heads += arrowHead(b[0], b[1], b[0] - a[0], b[1] - a[1], w, o.color);
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = Math.min(headLen(w) * 0.7, L) / L;
            P[n - 1] = [b[0] - (b[0] - a[0]) * k, b[1] - (b[1] - a[1]) * k];
        }
        if ((mode === 'start' || mode === 'both') && n >= 2) {
            const [a, b] = [P[1], pts[0]];
            heads += arrowHead(b[0], b[1], b[0] - a[0], b[1] - a[1], w, o.color);
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = Math.min(headLen(w) * 0.7, L) / L;
            P[0] = [b[0] - (b[0] - a[0]) * k, b[1] - (b[1] - a[1]) * k];
        }
        if (mode === 'mid') {
            for (let i = 0; i + 1 < n; i++) {
                const a = pts[i], b = pts[i + 1];
                const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
                if (L < headLen(w) * 1.5) continue;
                const t = 0.5 + headLen(w) / 2 / L;
                heads += arrowHead(a[0] + dx * t, a[1] + dy * t, dx, dy, w, o.color);
            }
        }
        const d = smooth ? smoothD(P, false) : pathD(P);
        return `<path d="${d}" fill="none" ${strokeAttr(o, 'stroke-linejoin="round"')}/>` + heads;
    }

    // ───────────────────────── 회로 소자 ─────────────────────────
    // 가로 방향, 가운데 (0, 0), 양 끝 (±L/2, 0) 로 그린 뒤 돌린다
    function compBody(o) {
        const L = o.len, h = L / 2, sw = `stroke="${esc(o.color)}" stroke-width="${f(o.width)}" fill="none"`;
        const lead = (a, b) => `<path d="M${f(-h)} 0 H${f(a)} M${f(b)} 0 H${f(h)}" ${sw}/>`;
        const meter = (letter) => lead(-12, 12) + `<circle cx="0" cy="0" r="12" ${sw} fill="#fff"/>` +
            `<text x="0" y="5.5" font-size="15" text-anchor="middle" font-family="${esc(FONTS.sans)}" fill="${esc(o.color)}" transform="rotate(${-o.rot})">${letter}</text>`;
        switch (o.kind) {
            case 'resistor': {
                if (o.style === 'box') return lead(-18, 18) + `<rect x="-18" y="-6" width="36" height="12" ${sw} fill="#fff"/>`;
                const z = [[-18, 0]];
                for (let i = 0; i < 6; i++) z.push([-15 + i * 6, i % 2 ? 6 : -6]);
                z.push([18, 0]);
                return lead(-18, 18) + `<path d="${pathD(z)}" ${sw} stroke-linejoin="round"/>`;
            }
            case 'varistor':
                return compBody({ ...o, kind: 'resistor' }) + arrowPath([[-14, 12], [14, -12]], { ...o, arrow: 'end', width: Math.max(1, o.width * 0.8) });
            case 'battery': {
                const n = o.cells, gap = 8, span = (n * 2 - 1) * gap / 2 + 2;
                let s = lead(-span, span), xx = -span;
                for (let i = 0; i < n; i++) {
                    // 긴 선(+)·짧은 굵은 선(−)
                    s += `<path d="M${f(xx)} -12 V12" ${sw}/><path d="M${f(xx + gap)} -6 V6" stroke="${esc(o.color)}" stroke-width="${f(o.width * 2.4)}"/>`;
                    if (i < n - 1) s += `<path d="M${f(xx + gap)} 0 H${f(xx + 2 * gap)}" ${sw} ${n > 2 ? 'stroke-dasharray="2 2"' : ''}/>`;
                    xx += 2 * gap;
                }
                return s;
            }
            case 'bulb': {
                const r = 11, k = r * 0.707;
                return lead(-r, r) + `<circle cx="0" cy="0" r="${r}" ${sw} fill="#fff"/><path d="M${f(-k)} ${f(-k)} L${f(k)} ${f(k)} M${f(-k)} ${f(k)} L${f(k)} ${f(-k)}" ${sw}/>`;
            }
            case 'switch': {
                const s = lead(-14, 14) + `<circle cx="-14" cy="0" r="2.6" ${sw} fill="#fff"/><circle cx="14" cy="0" r="2.6" ${sw} fill="#fff"/>`;
                return s + (o.on ? `<path d="M-12 -1 L12 -1" ${sw}/>` : `<path d="M-12 -1.5 L11 -13" ${sw}/>`);
            }
            case 'ammeter': return meter('A');
            case 'voltmeter': return meter('V');
            case 'galvanometer': return meter('G');
            case 'diode': case 'led': {
                let s = lead(-9, 9) + `<path d="M-9 -10 L-9 10 L9 0 Z" ${sw} fill="#fff"/><path d="M9 -10 V10" ${sw}/>`;
                if (o.kind === 'led') {
                    const ao = { color: o.color, width: Math.max(0.8, o.width * 0.75), arrow: 'end' };
                    s += arrowPath([[0, -13], [9, -24]], ao) + arrowPath([[6, -10], [15, -21]], ao);
                }
                return s;
            }
            case 'capacitor': return lead(-4, 4) + `<path d="M-4 -12 V12 M4 -12 V12" ${sw} stroke-width="${f(o.width * 1.4)}"/>`;
            case 'ac':
                return lead(-12, 12) + `<circle cx="0" cy="0" r="12" ${sw} fill="#fff"/><path d="M-7 0 C-5 -8 -2 -8 0 0 S5 8 7 0" ${sw}/>`;
            case 'coil': {
                let d = 'M-20 0';
                for (let i = 0; i < 4; i++) d += ` a5 5 0 0 1 10 0`;
                return lead(-20, 20) + `<path d="${d}" ${sw}/>`;
            }
        }
        return lead(0, 0);
    }
    function renderComp(o) {
        let s = `<g transform="translate(${f(o.x)} ${f(o.y)}) rotate(${f(o.rot)})">${compBody(o)}</g>`;
        if (o.label) {
            // 소자 옆: 'a' 는 가로 소자면 위, 세로 소자면 왼쪽 / 'b' 는 아래·오른쪽
            const side = o.labelSide === 'b' ? 1 : -1;
            const off = (o.kind === 'battery' || o.kind === 'led' ? 24 : 20) + o.size * 0.2;
            const vertical = Math.abs(Math.sin(rad(o.rot))) > 0.5;
            const nx = vertical ? side : 0, ny = vertical ? 0 : side;
            const anchor = vertical ? (nx > 0 ? 'start' : 'end') : 'middle';
            // 세로 소자의 이름은 옆으로 붙이므로 조금 덜 띄운다
            const lx = o.x + nx * (off - 6), ly = o.y + ny * off;
            s += richText(o.label, lx, ly, { size: o.size, anchor, middle: true, color: o.color });
        }
        return s;
    }

    // ───────────────────────── 그래프 ─────────────────────────
    function niceStep(range, count) {
        const raw = range / Math.max(1, count);
        const p = Math.pow(10, Math.floor(Math.log10(raw)));
        const m = raw / p;
        return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
    }
    const numLabel = v => String(+v.toFixed(10)).replace('-', '−');

    // 눈금 목록 [{v, label}]
    function graphTicks(o, axis) {
        const mode = o[axis + 'tickMode'], min = o[axis + 'min'], max = o[axis + 'max'];
        if (mode === 'none') return [];
        if (mode === 'custom') {
            return String(o[axis + 'ticks'] || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean).map(s => {
                const m = /^([^:=]+)[:=](.*)$/.exec(s);
                const v = evalConst(m ? m[1] : s);
                return { v, label: m ? m[2].trim() : numLabel(v) };
            }).filter(t => finite(t.v) && t.v >= min - 1e-9 && t.v <= max + 1e-9);
        }
        const pxLen = axis === 'x' ? o.w : o.h;
        const step = o[axis + 'step'] > 0 ? o[axis + 'step'] : niceStep(max - min, Math.max(2, Math.floor(pxLen / (axis === 'x' ? 55 : 40))));
        const out = [];
        for (let k = Math.ceil(min / step - 1e-9); k * step <= max + 1e-9 && out.length < 200; k++) {
            const v = +(k * step).toFixed(10);
            out.push({ v, label: numLabel(v) });
        }
        return out;
    }

    function plotPoints(o, pl) {
        if (pl.kind === 'data') return parsePoints(pl.data);
        let fn;
        try { fn = compile(pl.expr); } catch (e) { return []; }
        const a = pl.from == null ? o.xmin : Math.max(o.xmin, pl.from), b = pl.to == null ? o.xmax : Math.min(o.xmax, pl.to);
        if (!(b > a)) return [];
        const n = Math.max(60, Math.round(o.w * 1.5)), pts = [];
        for (let i = 0; i <= n; i++) {
            const x = a + (b - a) * i / n;
            pts.push([x, fn(x)]);
        }
        return pts;
    }

    // 함수 그래프를 끊긴 곳(무한대·화면 밖 멀리)에서 나눈다
    function splitRuns(pts, ymin, ymax) {
        const runs = [];
        let cur = [];
        const span = ymax - ymin;
        for (const p of pts) {
            if (!finite(p[1]) || p[1] > ymax + span * 3 || p[1] < ymin - span * 3) {
                if (cur.length > 1) runs.push(cur);
                cur = [];
            } else cur.push(p);
        }
        if (cur.length > 1) runs.push(cur);
        return runs;
    }

    // 곡선 아래(가로축 y=0 과 곡선 사이) 넓이 칠하기용 점
    function shadePolygon(o, pl, a, b) {
        let pts;
        if (pl.kind === 'data') {
            const d = parsePoints(pl.data).sort((p, q) => p[0] - q[0]);
            if (d.length < 2) return [];
            const at = x => {
                for (let i = 0; i + 1 < d.length; i++) {
                    if (x >= d[i][0] && x <= d[i + 1][0]) {
                        const t = d[i + 1][0] === d[i][0] ? 0 : (x - d[i][0]) / (d[i + 1][0] - d[i][0]);
                        return d[i][1] + t * (d[i + 1][1] - d[i][1]);
                    }
                }
                return NaN;
            };
            pts = [[a, at(a)], ...d.filter(p => p[0] > a && p[0] < b), [b, at(b)]];
        } else {
            let fn;
            try { fn = compile(pl.expr); } catch (e) { return []; }
            pts = [];
            for (let i = 0; i <= 120; i++) { const x = a + (b - a) * i / 120; pts.push([x, fn(x)]); }
        }
        pts = pts.filter(p => finite(p[1])).map(p => [p[0], Math.min(o.ymax, Math.max(o.ymin, p[1]))]);
        if (pts.length < 2) return [];
        const base = Math.min(o.ymax, Math.max(o.ymin, 0));
        return [[pts[0][0], base], ...pts, [pts[pts.length - 1][0], base]];
    }

    function renderGraph(o, edit) {
        const X = v => o.x + (v - o.xmin) / (o.xmax - o.xmin) * o.w;
        const Y = v => o.y + o.h - (v - o.ymin) / (o.ymax - o.ymin) * o.h;
        const ax = { color: o.color, width: o.width };
        const size = o.size;
        const x0 = o.xmin <= 0 && o.xmax >= 0 ? 0 : o.xmin;   // 세로축 위치 (x 값)
        const y0 = o.ymin <= 0 && o.ymax >= 0 ? 0 : o.ymin;   // 가로축 위치 (y 값)
        const AX = X(x0), AY = Y(y0);
        const ext = o.arrows ? 16 : 0;
        const clip = 'fm-clip-' + o.id.replace(/[^A-Za-z0-9_-]/g, '');
        const xt = graphTicks(o, 'x'), yt = graphTicks(o, 'y');
        let s = '';
        if (edit) s += `<rect x="${f(o.x)}" y="${f(o.y)}" width="${f(o.w)}" height="${f(o.h)}" fill="transparent" class="hit-area"/>`;
        s += `<defs><clipPath id="${clip}"><rect x="${f(o.x - 1)}" y="${f(o.y - 1)}" width="${f(o.w + 2)}" height="${f(o.h + 2)}"/></clipPath></defs>`;

        // 모눈
        if (o.grid !== 'none') {
            const lines = [];
            const sub = o.grid === 'fine' ? 5 : 1;
            const gridVals = (ticks, min, max) => {
                const vs = ticks.map(t => t.v);
                if (sub === 1 || vs.length < 2) return vs;
                const st = (vs[1] - vs[0]) / sub, out = [];
                for (let v = vs[0] - Math.ceil((vs[0] - min) / st) * st; v <= max + 1e-9; v += st) out.push(v);
                return out;
            };
            for (const v of gridVals(xt, o.xmin, o.xmax)) if (v >= o.xmin - 1e-9 && v <= o.xmax + 1e-9) lines.push(`M${f(X(v))} ${f(o.y)} V${f(o.y + o.h)}`);
            for (const v of gridVals(yt, o.ymin, o.ymax)) if (v >= o.ymin - 1e-9 && v <= o.ymax + 1e-9) lines.push(`M${f(o.x)} ${f(Y(v))} H${f(o.x + o.w)}`);
            s += `<path d="${lines.join(' ')}" stroke="#b5b5b5" stroke-width="0.7" fill="none"/>`;
        }

        // 넓이 칠하기
        for (const sh of o.shades) {
            const pl = o.plots[Math.round(sh.plot) - 1];
            if (!pl) continue;
            const a = Math.max(o.xmin, Math.min(sh.from, sh.to)), b = Math.min(o.xmax, Math.max(sh.from, sh.to));
            if (!(b > a)) continue;
            const poly = shadePolygon(o, pl, a, b);
            if (poly.length) s += `<path d="${pathD(poly.map(p => [X(p[0]), Y(p[1])]))} Z" ${fillAttr(sh.fill)} stroke="none" clip-path="url(#${clip})"/>`;
        }

        // 축
        s += arrowPath([[o.x, AY], [o.x + o.w + ext, AY]], { ...ax, arrow: o.arrows ? 'end' : 'none' });
        s += arrowPath([[AX, o.y + o.h], [AX, o.y - ext]], { ...ax, arrow: o.arrows ? 'end' : 'none' });
        if (o.xlabel) s += richText(o.xlabel, o.x + o.w + ext + 5, AY + size * 0.35, { size, anchor: 'start', color: o.color });
        if (o.ylabel) s += richText(o.ylabel, AX, o.y - ext - 7, { size, anchor: 'middle', color: o.color });
        const atOrigin = x0 === 0 && y0 === 0;
        if (o.origin && atOrigin) s += richText(o.origin, AX - 5, AY + size + 1, { size, anchor: 'end', color: o.color });

        // 눈금
        const tk = [];
        for (const t of xt) {
            if (Math.abs(t.v - x0) < 1e-9 && atOrigin) continue;
            const px = X(t.v);
            tk.push(`M${f(px)} ${f(AY)} V${f(AY - 4)}`);
            if (o.tickLabels && t.label) s += richText(t.label, px, AY + size + 3, { size: size * 0.92, anchor: 'middle', color: o.color });
        }
        for (const t of yt) {
            if (Math.abs(t.v - y0) < 1e-9 && atOrigin) continue;
            const py = Y(t.v);
            tk.push(`M${f(AX)} ${f(py)} H${f(AX + 4)}`);
            if (o.tickLabels && t.label) s += richText(t.label, AX - 6, py + size * 0.33, { size: size * 0.92, anchor: 'end', color: o.color });
        }
        if (tk.length) s += `<path d="${tk.join(' ')}" stroke="${esc(o.color)}" stroke-width="${f(o.width)}" fill="none"/>`;

        // 표시한 점: 축까지 점선
        for (const m of o.marks) {
            const px = X(m.x), py = Y(m.y), g = [];
            if (m.guide === 'both' || m.guide === 'x') g.push(`M${f(px)} ${f(py)} V${f(AY)}`);
            if (m.guide === 'both' || m.guide === 'y') g.push(`M${f(px)} ${f(py)} H${f(AX)}`);
            if (g.length) s += `<path d="${g.join(' ')}" stroke="${esc(o.color)}" stroke-width="0.9" stroke-dasharray="3 3" fill="none"/>`;
        }

        // 그래프 선
        o.plots.forEach(pl => {
            const pts = plotPoints(o, pl);
            if (!pts.length) return;
            const st = { color: pl.color, width: pl.width, dash: pl.dash };
            let body = '';
            if (pl.style !== 'points') {
                for (const run of pl.kind === 'func' ? splitRuns(pts, o.ymin, o.ymax) : [pts]) {
                    const P = run.map(p => [X(p[0]), Y(p[1])]);
                    body += `<path d="${pl.style === 'smooth' ? smoothD(P, false) : pathD(P)}" fill="none" ${strokeAttr(st, 'stroke-linejoin="round"')}/>`;
                }
            }
            if (pl.style === 'points' || pl.style === 'both') {
                const src = pl.kind === 'data' ? pts : pts.filter((p, i) => i % Math.ceil(pts.length / 10) === 0);
                for (const p of src) if (finite(p[1])) body += `<circle cx="${f(X(p[0]))}" cy="${f(Y(p[1]))}" r="${f(1.6 + pl.width)}" fill="${esc(pl.color)}"/>`;
            }
            s += `<g clip-path="url(#${clip})">${body}</g>`;
            if (pl.label) {
                const last = [...pts].reverse().find(p => finite(p[1]) && p[1] >= o.ymin && p[1] <= o.ymax);
                if (last) s += richText(pl.label, X(last[0]) + 6, Y(last[1]) - 6, { size, anchor: 'start', color: pl.color });
            }
        });

        // 점과 이름
        const POS = { ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1], n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
        for (const m of o.marks) {
            const px = X(m.x), py = Y(m.y);
            if (m.dot) s += `<circle cx="${f(px)}" cy="${f(py)}" r="3" fill="${esc(o.color)}"/>`;
            if (m.label) {
                const [dx, dy] = POS[m.pos] || POS.ne;
                s += richText(m.label, px + dx * 7, py + dy * 7 + (dy > 0 ? size * 0.75 : dy === 0 ? size * 0.35 : 0),
                    { size, anchor: dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle', color: o.color });
            }
        }
        return s;
    }

    // ───────────────────────── 물체별 그리기 ─────────────────────────
    function hitPath(d) { return `<path d="${d}" class="hit" fill="none" stroke="transparent" stroke-width="12"/>`; }

    function renderObject(o, edit) {
        switch (o.type) {
            case 'line': {
                const pts = [[o.x1, o.y1], [o.x2, o.y2]];
                return arrowPath(pts, o) + (edit ? hitPath(pathD(pts)) : '');
            }
            case 'polyline': {
                const pts = o.points;
                let s;
                if (o.closed) s = `<path d="${o.smooth ? smoothD(pts, true) : pathD(pts) + ' Z'}" ${fillAttr(o.fill)} ${strokeAttr(o, 'stroke-linejoin="round"')}/>`;
                else s = arrowPath(pts, o, o.smooth);
                return s + (edit ? hitPath(o.smooth ? smoothD(pts, o.closed) : pathD(pts) + (o.closed ? ' Z' : '')) : '');
            }
            case 'wire': {
                const d = pathD(o.points);
                return `<path d="${d}" fill="none" stroke="${esc(o.color)}" stroke-width="${f(o.width)}" stroke-linejoin="miter" stroke-linecap="square"/>` + (edit ? hitPath(d) : '');
            }
            case 'rect': {
                const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
                let s = `<rect x="${f(o.x)}" y="${f(o.y)}" width="${f(o.w)}" height="${f(o.h)}"${o.r ? ` rx="${f(o.r)}"` : ''} ${fillAttr(o.fill)} ${strokeAttr(o)}${edit ? ' pointer-events="all"' : ''}/>`;
                if (o.label) s += richText(o.label, cx, cy, { size: o.size, anchor: 'middle', middle: true, color: o.fill === 'black' ? '#fff' : o.color });
                return o.rot ? `<g transform="rotate(${f(o.rot)} ${f(cx)} ${f(cy)})">${s}</g>` : s;
            }
            case 'ellipse': {
                let s = `<ellipse cx="${f(o.cx)}" cy="${f(o.cy)}" rx="${f(o.rx)}" ry="${f(o.ry)}" ${fillAttr(o.fill)} ${strokeAttr(o)}${edit ? ' pointer-events="all"' : ''}/>`;
                if (o.label) s += richText(o.label, o.cx, o.cy, { size: o.size, anchor: 'middle', middle: true, color: o.fill === 'black' ? '#fff' : o.color });
                return s;
            }
            case 'text': {
                let s = '';
                if (o.bg || o.box) {
                    const lines = String(o.text).split('\n');
                    const w = Math.max(...lines.map(l => textWidth(l, o.size))) + 8, h = lines.length * o.size * 1.25 + 4;
                    const left = o.anchor === 'start' ? o.x - 4 : o.anchor === 'end' ? o.x - w + 4 : o.x - w / 2;
                    s += `<rect x="${f(left)}" y="${f(o.y - o.size * 1.0)}" width="${f(w)}" height="${f(h)}" fill="${o.bg ? '#fff' : 'none'}" ${o.box ? `stroke="${esc(o.color)}" stroke-width="1"` : 'stroke="none"'}/>`;
                }
                return s + richText(o.text, o.x, o.y, { size: o.size, anchor: o.anchor, font: o.font, bold: o.bold, color: o.color });
            }
            case 'dot':
                return `<circle cx="${f(o.x)}" cy="${f(o.y)}" r="${f(o.r)}" fill="${o.hollow ? '#fff' : esc(o.color)}" stroke="${esc(o.color)}" stroke-width="${o.hollow ? 1.3 : 0}"/>` +
                    (edit ? `<circle cx="${f(o.x)}" cy="${f(o.y)}" r="8" fill="transparent" class="hit"/>` : '');
            case 'ground': {
                const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1;
                const ux = dx / L, uy = dy / L, sgn = o.side === 'above' ? -1 : 1;
                const nx = -uy * sgn, ny = ux * sgn;   // 빗금이 나가는 쪽
                const len = 9, hatch = [];
                for (let t = o.gap / 2; t < L; t += Math.max(3, o.gap)) {
                    const px = o.x1 + ux * t, py = o.y1 + uy * t;
                    // 45° 기울어진 짧은 선
                    hatch.push(`M${f(px)} ${f(py)} L${f(px + (nx - ux) * len * 0.75)} ${f(py + (ny - uy) * len * 0.75)}`);
                }
                return `<path d="M${f(o.x1)} ${f(o.y1)} L${f(o.x2)} ${f(o.y2)}" stroke="${esc(o.color)}" stroke-width="${f(o.width)}" fill="none"/>` +
                    `<path d="${hatch.join(' ')}" stroke="${esc(o.color)}" stroke-width="${f(Math.max(0.8, o.width * 0.7))}" fill="none"/>` +
                    (edit ? hitPath(`M${f(o.x1)} ${f(o.y1)} L${f(o.x2)} ${f(o.y2)}`) : '');
            }
            case 'spring': {
                const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1;
                const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
                const lead = Math.min(12, L * 0.1), body = L - 2 * lead, n = o.coils * 2;
                const pts = [[o.x1, o.y1], [o.x1 + ux * lead, o.y1 + uy * lead]];
                for (let i = 0; i < n; i++) {
                    const t = lead + body * (i + 0.5) / n, a = i % 2 ? -o.amp : o.amp;
                    pts.push([o.x1 + ux * t + nx * a, o.y1 + uy * t + ny * a]);
                }
                pts.push([o.x2 - ux * lead, o.y2 - uy * lead], [o.x2, o.y2]);
                return `<path d="${pathD(pts)}" fill="none" stroke="${esc(o.color)}" stroke-width="${f(o.width)}" stroke-linejoin="round"/>` + (edit ? hitPath(pathD(pts)) : '');
            }
            case 'comp':
                return renderComp(o) + (edit ? `<rect x="${f(o.x - o.len / 2)}" y="${f(o.y - 14)}" width="${f(o.len)}" height="28" fill="transparent" class="hit" transform="rotate(${f(o.rot)} ${f(o.x)} ${f(o.y)})"/>` : '');
            case 'lens': {
                const h = o.h / 2, t = Math.max(8, o.h * 0.09);
                let s;
                if (o.style === 'arrow') {
                    // 선 + 양 끝 화살촉 (볼록: 바깥, 오목: 안쪽)
                    const k = 9 + o.width * 2;
                    const tip = (y, dir) => o.kind === 'convex'
                        ? `M${f(o.x - k * 0.6)} ${f(y - dir * k)} L${f(o.x)} ${f(y)} L${f(o.x + k * 0.6)} ${f(y - dir * k)}`
                        : `M${f(o.x - k * 0.6)} ${f(y + dir * k)} L${f(o.x)} ${f(y)} L${f(o.x + k * 0.6)} ${f(y + dir * k)}`;
                    s = `<path d="M${f(o.x)} ${f(o.y - h)} V${f(o.y + h)} ${tip(o.y - h, -1)} ${tip(o.y + h, 1)}" fill="none" stroke="${esc(o.color)}" stroke-width="${f(o.width)}"/>`;
                } else if (o.kind === 'convex') {
                    const R = (h * h + t * t) / (2 * t);
                    s = `<path d="M${f(o.x)} ${f(o.y - h)} A${f(R)} ${f(R)} 0 0 1 ${f(o.x)} ${f(o.y + h)} A${f(R)} ${f(R)} 0 0 1 ${f(o.x)} ${f(o.y - h)} Z" ${fillAttr(o.fill)} stroke="${esc(o.color)}" stroke-width="${f(o.width)}"/>`;
                } else {
                    const e = t * 1.1, R = (h * h + e * e) / (2 * e);
                    s = `<path d="M${f(o.x - e)} ${f(o.y - h)} H${f(o.x + e)} A${f(R)} ${f(R)} 0 0 0 ${f(o.x + e)} ${f(o.y + h)} H${f(o.x - e)} A${f(R)} ${f(R)} 0 0 0 ${f(o.x - e)} ${f(o.y - h)} Z" ${fillAttr(o.fill)} stroke="${esc(o.color)}" stroke-width="${f(o.width)}"/>`;
                }
                return s + (edit ? `<rect x="${f(o.x - 10)}" y="${f(o.y - h)}" width="20" height="${f(o.h)}" fill="transparent" class="hit"/>` : '');
            }
            case 'mirror': {
                // 가로 0° 기준: 거울면은 세로선, 빗금은 오른쪽(뒤)
                const h = o.h / 2, back = [];
                let face;
                if (o.kind === 'plane') {
                    face = `M0 ${f(-h)} V${f(h)}`;
                    for (let y = -h + 4; y <= h; y += 8) back.push([0, y]);
                } else {
                    // 빛은 왼쪽에서 온다. 오목: 가장자리가 왼쪽으로 휨 / 볼록: 오른쪽으로 휨
                    const R = Math.max(o.radius, h + 1), cc = o.kind === 'concave';
                    const bend = y => (R - Math.sqrt(R * R - y * y)) * (cc ? -1 : 1);
                    face = `M${f(bend(h))} ${f(-h)} A${f(R)} ${f(R)} 0 0 ${cc ? 1 : 0} ${f(bend(h))} ${f(h)}`;
                    for (let y = -h + 4; y <= h; y += 8) back.push([bend(y), y]);
                }
                const hatch = back.map(([x, y]) => `M${f(x)} ${f(y)} l7 -7`).join(' ');
                const s = `<path d="${face}" fill="none" stroke="${esc(o.color)}" stroke-width="${f(o.width * 1.3)}"/><path d="${hatch}" fill="none" stroke="${esc(o.color)}" stroke-width="0.9"/>`;
                return `<g transform="translate(${f(o.x)} ${f(o.y)}) rotate(${f(o.rot)})">${s}${edit ? `<rect x="-8" y="${f(-h)}" width="18" height="${f(o.h)}" fill="transparent" class="hit"/>` : ''}</g>`;
            }
            case 'wave': {
                const n = Math.max(40, Math.round(o.length / 2)), up = [], dn = [];
                for (let i = 0; i <= n; i++) {
                    const s = o.length * i / n, v = Math.sin(2 * Math.PI * s / o.lambda + rad(o.phase));
                    up.push([o.x + s, o.y - o.amp * v]);
                    dn.push([o.x + s, o.y + o.amp * v]);
                }
                let s = '';
                if (o.axis) s += `<path d="M${f(o.x)} ${f(o.y)} H${f(o.x + o.length)}" stroke="${esc(o.color)}" stroke-width="0.9" stroke-dasharray="4 3" fill="none"/>`;
                s += `<path d="${pathD(up)}" fill="none" ${strokeAttr(o, 'stroke-linejoin="round"')}/>`;
                if (o.standing) s += `<path d="${pathD(dn)}" fill="none" ${strokeAttr({ ...o, dash: 'dashed' })}/>`;
                return s + (edit ? `<rect x="${f(o.x)}" y="${f(o.y - Math.abs(o.amp) - 4)}" width="${f(o.length)}" height="${f(2 * Math.abs(o.amp) + 8)}" fill="transparent" class="hit"/>` : '');
            }
            case 'angle': {
                const p = a => [o.x + o.r * Math.cos(rad(a)), o.y - o.r * Math.sin(rad(a))];
                let s;
                if (o.right) {
                    const k = o.r * 0.55, u = [Math.cos(rad(o.a1)), -Math.sin(rad(o.a1))], v = [Math.cos(rad(o.a2)), -Math.sin(rad(o.a2))];
                    const pts = [[o.x + u[0] * k, o.y + u[1] * k], [o.x + (u[0] + v[0]) * k, o.y + (u[1] + v[1]) * k], [o.x + v[0] * k, o.y + v[1] * k]];
                    s = `<path d="${pathD(pts)}" fill="none" stroke="${esc(o.color)}" stroke-width="${f(o.width)}"/>`;
                } else {
                    let sweep = ((o.a2 - o.a1) % 360 + 360) % 360;
                    const [ax1, ay1] = p(o.a1), [ax2, ay2] = p(o.a2);
                    s = `<path d="M${f(ax1)} ${f(ay1)} A${f(o.r)} ${f(o.r)} 0 ${sweep > 180 ? 1 : 0} 0 ${f(ax2)} ${f(ay2)}" fill="none" stroke="${esc(o.color)}" stroke-width="${f(o.width)}"/>`;
                }
                if (o.label) {
                    let sweep = ((o.a2 - o.a1) % 360 + 360) % 360;
                    const mid = o.a1 + sweep / 2, lr = o.r + 4 + o.size * 0.45;
                    s += richText(o.label, o.x + lr * Math.cos(rad(mid)), o.y - lr * Math.sin(rad(mid)), { size: o.size, anchor: 'middle', middle: true, color: o.color });
                }
                return s + (edit ? `<circle cx="${f(o.x)}" cy="${f(o.y)}" r="${f(o.r + 4)}" fill="transparent" class="hit"/>` : '');
            }
            case 'graph': return renderGraph(o, edit);
        }
        return '';
    }

    const HATCH_DEF = '<pattern id="fm-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect width="7" height="7" fill="#fff"/><path d="M0 0 V7" stroke="#000" stroke-width="1.1"/></pattern>';

    // 그림 안쪽 (<svg> 안에 들어갈 내용)
    function renderInner(scene, opt) {
        opt = opt || {};
        let s = `<defs>${HATCH_DEF}</defs>`;
        if (opt.background !== false) s += `<rect x="0" y="0" width="${scene.width}" height="${scene.height}" fill="#ffffff" class="fm-bg"/>`;
        s += `<g class="fm-content" font-family="${esc(FONTS[scene.font] || FONTS.serif)}">`;
        for (const o of scene.objects) {
            let body;
            try { body = renderObject(o, opt.edit); } catch (e) { body = ''; }
            s += `<g data-id="${esc(o.id)}">${body}</g>`;
        }
        return s + '</g>';
    }

    // 완성된 SVG 글. box = {x, y, w, h} 를 주면 그 부분만
    function renderSVG(scene, opt) {
        opt = opt || {};
        const b = opt.box || { x: 0, y: 0, w: scene.width, h: scene.height };
        const inner = renderInner(scene, { background: false });
        const bg = opt.transparent ? '' : `<rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" fill="#ffffff"/>`;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(b.w)}" height="${f(b.h)}" viewBox="${f(b.x)} ${f(b.y)} ${f(b.w)} ${f(b.h)}">${bg}${inner}</svg>`;
    }

    // ───────────────────────── 예시 그림 ─────────────────────────
    const EXAMPLES = {
        vt: {
            name: '속도–시간 그래프',
            scene: {
                width: 480, height: 320, objects: [
                    { type: 'graph', x: 70, y: 50, w: 340, h: 210, xmin: 0, xmax: 4.6, ymin: 0, ymax: 3,
                        xlabel: '시간', ylabel: '속도', xtickMode: 'custom', xticks: '1:*t*_0, 3:3*t*_0, 4:4*t*_0', ytickMode: 'custom', yticks: '2:*v*_0',
                        plots: [{ kind: 'data', data: '0,0 1,2 3,2 4,0', width: 2 }],
                        marks: [{ x: 1, y: 2, guide: 'x', dot: false }, { x: 3, y: 2, guide: 'x', dot: false }],
                        shades: [] },
                    { type: 'text', x: 240, y: 306, text: '그림 (가)', size: 16 }
                ]
            }
        },
        pv: {
            name: '압력–부피 그래프 (넓이)',
            scene: {
                width: 480, height: 320, objects: [
                    { type: 'graph', x: 70, y: 50, w: 340, h: 210, xmin: 0, xmax: 4, ymin: 0, ymax: 4,
                        xlabel: '*V*', ylabel: '*P*', xtickMode: 'custom', xticks: '1:*V*_0, 3:3*V*_0', ytickMode: 'custom', yticks: '1:*P*_0, 3:3*P*_0',
                        plots: [{ kind: 'func', expr: '3/x', from: 0.7, to: 4, width: 2, label: '' }],
                        marks: [{ x: 1, y: 3, label: 'A', pos: 'ne' }, { x: 3, y: 1, label: 'B', pos: 'ne' }],
                        shades: [{ plot: 1, from: 1, to: 3, fill: 'hatch' }] }
                ]
            }
        },
        force: {
            name: '수평면 위 물체의 힘',
            scene: {
                width: 520, height: 300, objects: [
                    { type: 'ground', x1: 60, y1: 200, x2: 460, y2: 200, side: 'below' },
                    { type: 'rect', x: 210, y: 140, w: 100, h: 60, label: 'A', fill: 'white' },
                    { type: 'line', x1: 310, y1: 170, x2: 420, y2: 170, arrow: 'end', width: 2 },
                    { type: 'text', x: 430, y: 176, text: '*F*', anchor: 'start' },
                    { type: 'line', x1: 260, y1: 200, x2: 260, y2: 270, arrow: 'end', width: 2 },
                    { type: 'text', x: 272, y: 268, text: '*mg*', anchor: 'start' },
                    { type: 'line', x1: 260, y1: 140, x2: 260, y2: 70, arrow: 'end', width: 2 },
                    { type: 'text', x: 272, y: 80, text: '*N*', anchor: 'start' },
                    { type: 'line', x1: 210, y1: 196, x2: 130, y2: 196, arrow: 'end', width: 2, dash: 'dashed' },
                    { type: 'text', x: 120, y: 186, text: '*f*', anchor: 'end' }
                ]
            }
        },
        circuit: {
            name: '직렬·병렬 회로',
            scene: {
                width: 480, height: 320, objects: [
                    { type: 'comp', kind: 'battery', x: 120, y: 260, rot: 0, len: 80, label: '*V*', labelSide: 'b' },
                    { type: 'comp', kind: 'switch', x: 300, y: 260, len: 80, label: 'S', labelSide: 'b' },
                    { type: 'comp', kind: 'resistor', x: 120, y: 60, len: 80, label: '*R*_1' },
                    { type: 'comp', kind: 'resistor', x: 300, y: 60, len: 80, label: '*R*_2' },
                    { type: 'comp', kind: 'ammeter', x: 400, y: 160, rot: 90, len: 80, labelSide: 'b' },
                    { type: 'comp', kind: 'bulb', x: 60, y: 160, rot: 90, len: 80, label: 'L', labelSide: 'a' },
                    { type: 'wire', points: [[160, 60], [260, 60]] },
                    { type: 'wire', points: [[340, 60], [400, 60], [400, 120]] },
                    { type: 'wire', points: [[400, 200], [400, 260], [340, 260]] },
                    { type: 'wire', points: [[260, 260], [160, 260]] },
                    { type: 'wire', points: [[80, 260], [60, 260], [60, 200]] },
                    { type: 'wire', points: [[60, 120], [60, 60], [80, 60]] }
                ]
            }
        },
        lens: {
            name: '볼록 렌즈와 상',
            scene: {
                width: 560, height: 300, objects: [
                    { type: 'line', x1: 30, y1: 160, x2: 530, y2: 160, width: 1, dash: 'dashed' },
                    { type: 'lens', kind: 'convex', x: 280, y: 160, h: 200 },
                    { type: 'dot', x: 200, y: 160 }, { type: 'text', x: 200, y: 182, text: 'F', size: 16 },
                    { type: 'dot', x: 360, y: 160 }, { type: 'text', x: 360, y: 182, text: 'F′', size: 16 },
                    { type: 'line', x1: 120, y1: 160, x2: 120, y2: 100, arrow: 'end', width: 2.5 },
                    { type: 'text', x: 120, y: 90, text: '물체', size: 15 },
                    { type: 'polyline', points: [[120, 100], [280, 100], [440, 220]], arrow: 'mid', width: 1.3 },
                    { type: 'polyline', points: [[120, 100], [440, 220]], arrow: 'mid', width: 1.3 },
                    { type: 'line', x1: 440, y1: 160, x2: 440, y2: 220, arrow: 'end', width: 2.5, dash: 'dashed' }
                ]
            }
        },
        wave: {
            name: '횡파 (파장·진폭)',
            scene: {
                width: 560, height: 260, objects: [
                    { type: 'wave', x: 60, y: 130, length: 440, lambda: 200, amp: 50, phase: 0, axis: true },
                    { type: 'line', x1: 110, y1: 50, x2: 310, y2: 50, arrow: 'both', width: 1.2 },
                    { type: 'text', x: 210, y: 42, text: '*λ*', size: 18 },
                    { type: 'line', x1: 110, y1: 56, x2: 110, y2: 78, width: 1, dash: 'dotted' },
                    { type: 'line', x1: 310, y1: 56, x2: 310, y2: 78, width: 1, dash: 'dotted' },
                    { type: 'line', x1: 520, y1: 130, x2: 520, y2: 80, arrow: 'both', width: 1.2 },
                    { type: 'text', x: 530, y: 110, text: '*A*', anchor: 'start' },
                    { type: 'line', x1: 400, y1: 220, x2: 480, y2: 220, arrow: 'end', width: 1.8 },
                    { type: 'text', x: 440, y: 245, text: '진행 방향', size: 14 }
                ]
            }
        }
    };

    return {
        compile, evalConst, parsePoints, parseRich, plainText, textWidth, richText, esc,
        DEFAULTS, TYPES, KINDS, ENUMS, FONTS, EXAMPLES,
        normalizeObject, normalizeScene, makeObject, newId,
        translate, terminals, handles, moveHandle, rotPt,
        graphTicks, niceStep, plotPoints, renderObject, renderInner, renderSVG
    };
});
