const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/figure-model.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` ${a} vs ${b}`);

test('compile: 사칙연산·거듭제곱·우선순위', () => {
    near(M.compile('1+2*3')(0), 7, 1e-12);
    near(M.compile('2^3^2')(0), 512, 1e-12);          // 오른쪽부터
    near(M.compile('-x^2')(3), -9, 1e-12);            // -(x^2)
    near(M.compile('(1+2)*(3-1)/4')(0), 1.5, 1e-12);
    near(M.compile('1e-3*2')(0), 0.002, 1e-15);
});

test('compile: 곱셈 생략·함수·상수·변수 t', () => {
    near(M.compile('2x+1')(3), 7, 1e-12);
    near(M.compile('3/x')(2), 1.5, 1e-12);
    near(M.compile('2sin(x)')(Math.PI / 2), 2, 1e-12);
    near(M.compile('x(x+1)')(2), 6, 1e-12);
    near(M.compile('(x+1)(x-1)')(3), 8, 1e-12);
    near(M.compile('sqrt(x)+abs(-2)')(9), 5, 1e-12);
    near(M.compile('pi')(0), Math.PI, 1e-12);
    near(M.compile('e^x')(1), Math.E, 1e-12);
    near(M.compile('5t^2')(2), 20, 1e-12);
    near(M.compile('max(x, 2)')(1), 2, 1e-12);
    near(M.compile('4×x÷2')(3), 6, 1e-12);
});

test('compile: 잘못된 식은 한국어 오류', () => {
    assert.throws(() => M.compile(''), /비어/);
    assert.throws(() => M.compile('2+'), /덜 끝/);
    assert.throws(() => M.compile('y+1'), /알 수 없/);
    assert.throws(() => M.compile('(x+1'), /\)/);
    assert.throws(() => M.compile('x$'), /알 수 없는 글자/);
    assert.ok(Number.isNaN(M.evalConst('z')));
    near(M.evalConst('pi/2'), Math.PI / 2, 1e-12);
});

test('parsePoints: 쉼표·공백·세미콜론 섞어도 둘씩 묶음', () => {
    assert.deepEqual(M.parsePoints('0,0 2,4; 4,4\n6, -1.5'), [[0, 0], [2, 4], [4, 4], [6, -1.5]]);
    assert.deepEqual(M.parsePoints('1,2 3'), [[1, 2]]);
});

test('parseRich: 아래·위첨자, 기울임, 그리스 문자', () => {
    assert.deepEqual(M.parseRich('v_0'), [{ t: 'v', lv: 0, it: false }, { t: '0', lv: -1, it: false }]);
    assert.deepEqual(M.parseRich('*v*_{max}'), [{ t: 'v', lv: 0, it: true }, { t: 'max', lv: -1, it: false }]);
    assert.deepEqual(M.parseRich('10^{-3} m'), [{ t: '10', lv: 0, it: false }, { t: '-3', lv: 1, it: false }, { t: ' m', lv: 0, it: false }]);
    assert.equal(M.plainText('\\theta = 30\\deg'), 'θ = 30°');
    assert.equal(M.plainText('a\\_b'), 'a_b');
    assert.equal(M.plainText('*m*_A'), 'mA');
});

test('richText: 첨자는 작은 글자로 내려가고 다시 기준선으로 돌아옴', () => {
    const s = M.richText('*v*_0 = 2', 10, 20, { size: 20 });
    assert.match(s, /font-style="italic"/);
    assert.match(s, /dy="5\.6" font-size="14"/);
    assert.match(s, /dy="-5\.6"/);
    assert.ok(!s.includes('<script'));
    assert.match(M.richText('<b>', 0, 0, {}), /&lt;b&gt;/);
});

test('normalizeScene: 모르는 종류는 버리고 값은 정리, id 중복은 새로', () => {
    const sc = M.normalizeScene({
        width: 99999, height: 'abc',
        objects: [
            { type: 'line', id: 'a', x1: '10', y1: 0, x2: 50, y2: 0, arrow: 'weird', width: 100, onclick: 'alert(1)' },
            { type: 'script', x: 1 },
            { type: 'arrow', id: 'a', x1: 0, y1: 0, x2: 1, y2: 1 },
            { type: 'circle', cx: 5, cy: 5, r: 7 },
            { type: 'comp', kind: 'rocket', x: 0, y: 0, cells: 99 },
            { type: 'polyline', points: [[0, 0], ['x', 1], [5, 5]] },
            { type: 'graph', xmin: 5, xmax: 1, plots: [{ kind: 'data', data: [[0, 0], [1, 2]] }, { kind: 'func', expr: 'x^2', from: '', to: '3' }], marks: 'bad' },
            { type: 'text', text: 'A', color: 'url(javascript:x)' }
        ]
    });
    assert.equal(sc.width, 3000);
    assert.equal(sc.height, 420);
    assert.equal(sc.objects.length, 7);
    const [line, arrow, circ, comp, poly, graph, text] = sc.objects;
    assert.equal(line.x1, 10);
    assert.equal(line.arrow, 'none');
    assert.equal(line.width, 12);
    assert.ok(!('onclick' in line));
    assert.equal(arrow.type, 'line');
    assert.equal(arrow.arrow, 'end');
    assert.notEqual(arrow.id, 'a');
    assert.equal(circ.type, 'ellipse');
    assert.equal(circ.rx, 7);
    assert.equal(comp.kind, 'resistor');
    assert.equal(comp.cells, 6);
    assert.deepEqual(poly.points, [[0, 0], [5, 5]]);
    assert.equal(graph.xmax, 6);
    assert.equal(graph.plots[0].data, '0,0 1,2');
    assert.equal(graph.plots[1].from, null);
    assert.equal(graph.plots[1].to, 3);
    assert.deepEqual(graph.marks, []);
    assert.equal(text.color, '#000000');
    // 빠진 참/거짓 칸은 기본값 (그래프 눈금 글자·축 화살표는 켜짐)
    assert.equal(graph.tickLabels, true);
    assert.equal(graph.arrows, true);
    assert.equal(M.normalizeObject({ type: 'graph', arrows: false }).arrows, false);
});

test('회로 소자 이름: 가로는 위·아래, 세로는 왼쪽·오른쪽', () => {
    const at = o => { const m = /<text x="([\d.]+)" y="([\d.]+)"([^>]*)>/.exec(M.renderObject(o)); const a = /text-anchor="(\w+)"/.exec(m[3]); return [+m[1], +m[2], a ? a[1] : 'start']; };
    const h = at(M.makeObject('comp', { x: 100, y: 100, label: 'R' }));
    assert.ok(h[1] < 100 && h[2] === 'middle', String(h));
    const v = at(M.makeObject('comp', { x: 100, y: 100, rot: 90, label: 'L' }));
    assert.ok(v[0] < 100 && v[2] === 'end', String(v));
    const vb = at(M.makeObject('comp', { x: 100, y: 100, rot: 270, label: 'L', labelSide: 'b' }));
    assert.ok(vb[0] > 100 && vb[2] === 'start', String(vb));
});

test('translate·terminals·moveHandle', () => {
    const r = M.makeObject('comp', { x: 100, y: 50, len: 80, rot: 90 });
    const [a, b] = M.terminals(r);
    near(a[0], 100, 1e-9); near(a[1], 10, 1e-9);
    near(b[0], 100, 1e-9); near(b[1], 90, 1e-9);
    const w = M.makeObject('wire', { points: [[0, 0], [10, 0]] });
    M.translate(w, 5, -5);
    assert.deepEqual(w.points, [[5, -5], [15, -5]]);
    const g = M.makeObject('graph', { x: 10, y: 10 });
    M.moveHandle(g, 'se', 210, 160);
    assert.equal(g.w, 200);
    assert.equal(g.h, 150);
    const ang = M.makeObject('angle', { x: 0, y: 0 });
    M.moveHandle(ang, 'a2', 0, -30);   // 화면 위쪽 = 90°
    assert.equal(ang.a2, 90);
    assert.equal(ang.r, 30);
});

test('graphTicks: 자동 간격, 직접 적은 눈금(식 값 가능)', () => {
    const g = M.makeObject('graph', { xmin: 0, xmax: 10, w: 320, ymin: -1, ymax: 1, h: 200 });
    assert.deepEqual(M.graphTicks(g, 'x').map(t => t.v), [0, 2, 4, 6, 8, 10]);
    assert.deepEqual(M.graphTicks(g, 'y').map(t => t.v), [-1, -0.5, 0, 0.5, 1]);
    assert.equal(M.graphTicks(g, 'y')[0].label, '−1');
    g.xtickMode = 'custom';
    g.xticks = '1:*t*_0, 2:2*t*_0, pi:π, 99:밖';
    assert.deepEqual(M.graphTicks(g, 'x').map(t => [t.v, t.label]), [[1, '*t*_0'], [2, '2*t*_0'], [Math.PI, 'π']]);
    g.xtickMode = 'none';
    assert.deepEqual(M.graphTicks(g, 'x'), []);
    g.xtickMode = 'auto'; g.xstep = 2.5;
    assert.deepEqual(M.graphTicks(g, 'x').map(t => t.v), [0, 2.5, 5, 7.5, 10]);
});

test('plotPoints: 구간 제한, 데이터 점', () => {
    const g = M.makeObject('graph', { xmin: 0, xmax: 10, w: 100 });
    const pts = M.plotPoints(g, { kind: 'func', expr: '2x', from: 2, to: 4 });
    near(pts[0][0], 2, 1e-12); near(pts[pts.length - 1][0], 4, 1e-12); near(pts[pts.length - 1][1], 8, 1e-12);
    assert.deepEqual(M.plotPoints(g, { kind: 'data', data: '0,0 1,1' }), [[0, 0], [1, 1]]);
    assert.deepEqual(M.plotPoints(g, { kind: 'func', expr: '2+' }), []);
});

test('모든 종류·예시 그림이 오류 없이 SVG 가 됨', () => {
    for (const type of M.TYPES) {
        const o = M.makeObject(type, { x: 100, y: 100 });
        for (const edit of [false, true]) {
            const s = M.renderObject(o, edit);
            assert.equal(typeof s, 'string');
            assert.ok(s.length > 20, type);
            assert.ok(!/NaN|undefined/.test(s), `${type}: ${s.slice(0, 200)}`);
        }
    }
    for (const kind of M.KINDS.comp) {
        const s = M.renderObject(M.makeObject('comp', { kind, label: '*R*', rot: 90 }));
        assert.ok(!/NaN|undefined/.test(s), kind);
    }
    for (const kind of M.KINDS.mirror) assert.ok(!/NaN/.test(M.renderObject(M.makeObject('mirror', { kind }))), kind);
    for (const [k, ex] of Object.entries(M.EXAMPLES)) {
        const sc = M.normalizeScene(JSON.parse(JSON.stringify(ex.scene)));
        assert.ok(sc.objects.length > 0, k);
        const svg = M.renderSVG(sc);
        assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
        assert.ok(!/NaN|undefined/.test(svg), k);
        assert.ok(!svg.includes('class="hit'), '내보내기에는 선택용 투명 영역이 없어야 함');
    }
});

test('renderSVG: 잘라낸 범위와 투명 배경', () => {
    const sc = M.normalizeScene({ width: 200, height: 100, objects: [{ type: 'dot', x: 50, y: 50 }] });
    const s = M.renderSVG(sc, { box: { x: 40, y: 40, w: 20, h: 20 }, transparent: true });
    assert.match(s, /viewBox="40 40 20 20"/);
    assert.match(s, /width="20" height="20"/);
    assert.ok(!s.includes('fill="#ffffff"/><defs>'));
});

test('그래프: 넓이 칠하기·모눈·눈금 글자가 들어감', () => {
    const sc = M.normalizeScene(JSON.parse(JSON.stringify(M.EXAMPLES.pv.scene)));
    sc.objects[0].grid = 'fine';
    const s = M.renderSVG(sc);
    assert.match(s, /url\(#fm-hatch\)/);
    assert.match(s, /stroke="#b5b5b5"/);
    assert.match(s, /clip-path="url\(#fm-clip-/);
    assert.match(s, />V<\/tspan>/);
});

test('페이지 연결: 스크립트, AI 는 jsdelivr 의 버전 고정 SDK', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const f of ['"js/figure-model.js"', '"js/figure-maker.js"', '"css/figure-maker.css"']) assert.ok(html.includes(f), f);
    assert.ok(!html.includes('../'), '저장소 밖을 가리키는 경로가 없어야 함');
    const maker = fs.readFileSync(path.join(root, 'js', 'figure-maker.js'), 'utf8');
    assert.ok(maker.includes("new URL('js/' + name, location.href)"), 'AI 모듈 경로');
    const ai = fs.readFileSync(path.join(root, 'js', 'figure-ai.js'), 'utf8');
    const imports = [...ai.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]);
    assert.deepEqual(imports, ['https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm', './figure-ai-prompt.js']);
    const local = fs.readFileSync(path.join(root, 'js', 'figure-ai-local.js'), 'utf8');
    assert.deepEqual([...local.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]), ['./figure-ai-prompt.js']);
    assert.match(ai, /dangerouslyAllowBrowser: true/);
    assert.ok(!/sk-ant-[A-Za-z0-9]/.test(ai + html), 'API 키를 파일에 넣지 않음');
});

test('예전 주소에서 넘어온 그림: 한글 포함 왕복, 잘못된 값은 무시', () => {
    const json = JSON.stringify(M.normalizeScene({ objects: [{ type: 'text', x: 10, y: 20, text: '속력 v_0 ✏️' }] }));
    const hash = M.encodeMoved(json);
    assert.match(hash, /^#move=[A-Za-z0-9_-]+$/);
    assert.equal(M.decodeMoved(hash), json);
    assert.equal(M.decodeMoved(''), null);
    assert.equal(M.decodeMoved('#move=@@'), null);
    assert.equal(M.decodeMoved(M.encodeMoved('{"a":1}')), null);       // 그림 자료가 아님
    assert.equal(M.decodeMoved(M.encodeMoved('깨진 JSON')), null);
});
