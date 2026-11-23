/* 발포비타민 필름통 로켓 (가족 행사) — 계산·문항·요약 (브라우저·Node 공용, 시험 tests/film-rocket-math.test.cjs)
   화면은 js/film-rocket.js. 이름·학번은 없고, 아이 키(cm)는 폰에만 두고 보내지 않는다(%만). 영상도 폰에만. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.FilmRocketMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ---------- 선생님 예비 실험 값 (교사 화면에서 정함, 없으면 이 기본값) ----------
    var DEFAULT_SETUP = {
        waterMin: 5, waterMax: 20, waterStep: 5, waterBase: 10,       // 물의 양 (mL)
        tabletMin: 1, tabletMax: 4, tabletBase: 2,                    // 발포비타민 양 (¼ 알 단위: 2 = ½ 알)
        tempMin: 10, tempMax: 40, tempStep: 10, tempBase: 20,         // 물의 온도 (°C)
        pieces: 'whole,half,quarter,powder', pieceBase: 'whole',      // 조각 크기
        targetTime: 15, tolTime: 2, repeats: 3,                       // 1차시 도전 목표(초)·'맞췄다' 허용 오차(초)·같은 조건 반복 횟수
        targetPct: 100, tolPct: 10                                    // 2차시 목표(아이 키의 %)·허용 오차(%)
    };
    function num(v, d) { var n = Number(v); return v === '' || v == null || !isFinite(n) ? d : n; }
    function mergeSetup(s) {
        s = s || {};
        var o = {};
        Object.keys(DEFAULT_SETUP).forEach(function (k) { o[k] = k === 'pieces' || k === 'pieceBase' ? (s[k] ? String(s[k]) : DEFAULT_SETUP[k]) : num(s[k], DEFAULT_SETUP[k]); });
        if (o.waterMax < o.waterMin) o.waterMax = o.waterMin;
        if (o.tabletMax < o.tabletMin) o.tabletMax = o.tabletMin;
        if (o.tempMax < o.tempMin) o.tempMax = o.tempMin;
        o.waterBase = clamp(o.waterBase, o.waterMin, o.waterMax);
        o.tabletBase = clamp(o.tabletBase, o.tabletMin, o.tabletMax);
        o.tempBase = clamp(o.tempBase, o.tempMin, o.tempMax);
        var ps = o.pieces.split(',').filter(function (x) { return PIECES[x]; });
        o.pieces = (ps.length ? ps : ['whole']).join(',');
        if (o.pieces.split(',').indexOf(o.pieceBase) < 0) o.pieceBase = o.pieces.split(',')[0];
        o.repeats = Math.max(1, Math.min(10, Math.round(o.repeats)));
        return o;
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    // ---------- 바꿀 수 있는 조건 ----------
    var PIECES = { whole: '한 덩어리', half: '2조각', quarter: '4조각', powder: '가루' };
    var PIECE_ORDER = ['whole', 'half', 'quarter', 'powder'];
    var NOSES = { point: '뾰족한 앞코', round: '둥근 앞코', none: '앞코 없음' };
    var NOSE_ORDER = ['none', 'round', 'point'];
    function tabletLabel(q) {
        q = Math.round(Number(q));
        var whole = Math.floor(q / 4), part = q % 4, f = ['', '¼', '½', '¾'][part];
        return (whole ? whole + (f ? ' ' + f : '') : f || '0') + ' 알';
    }
    /* 조건 정의: key → { name(쉬운 말), unit, kind: 'num'|'cat', 값 목록 } (setup 으로 범위를 정함) */
    function vars1(setup) {
        var s = mergeSetup(setup);
        return {
            water: { name: '물의 양', unit: 'mL', values: range(s.waterMin, s.waterMax, s.waterStep), base: s.waterBase, label: function (v) { return v + ' mL'; } },
            temp: { name: '물의 온도', unit: '°C', values: range(s.tempMin, s.tempMax, s.tempStep), base: s.tempBase, label: function (v) { return v + ' °C'; } },
            tablet: { name: '발포비타민 양', unit: '알', values: range(s.tabletMin, s.tabletMax, 1), base: s.tabletBase, label: tabletLabel },
            piece: { name: '조각 크기', unit: '', cat: true, values: PIECE_ORDER.filter(function (k) { return s.pieces.split(',').indexOf(k) >= 0; }), base: s.pieceBase, label: function (v) { return PIECES[v] || v; } }
        };
    }
    function vars2(setup) {
        var s = mergeSetup(setup), v1 = vars1(s);
        return {
            mass: { name: '몸체 무게 (점토·클립 개수)', short: '몸체 무게', unit: '개', values: range(0, 10, 1), base: 0, label: function (v) { return v + '개'; } },
            water: v1.water, tablet: v1.tablet,
            fins: { name: '날개 수', unit: '장', values: [0, 2, 3, 4], base: 3, label: function (v) { return v + '장'; } },
            nose: { name: '앞코 모양', unit: '', cat: true, values: NOSE_ORDER.slice(), base: 'point', label: function (v) { return NOSES[v] || v; } }
        };
    }
    function range(lo, hi, step) {
        var out = [], st = Math.max(0.01, Number(step) || 1);
        for (var v = lo, k = 0; v <= hi + 1e-9 && k < 200; v = Math.round((v + st) * 100) / 100, k++) out.push(v);
        return out.length ? out : [lo];
    }
    // +/− 단추: 값 목록에서 한 칸 옮기기
    function stepIn(values, v, dir) {
        var i = values.indexOf(v);
        if (i < 0) { i = 0; for (var k = 0; k < values.length; k++) if (typeof v === 'number' && values[k] <= v) i = k; }
        return values[clamp(i + (dir > 0 ? 1 : dir < 0 ? -1 : 0), 0, values.length - 1)];
    }
    // 그래프 가로축 값 (고르기형 조건은 순서 번호)
    function axisValue(def, v) { return def.cat ? def.values.indexOf(v) : Number(v); }

    // ---------- 계산 ----------
    function mean(a) { a = (a || []).filter(function (x) { return isFinite(x); }); return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : NaN; }
    function sd(a) {
        a = (a || []).filter(function (x) { return isFinite(x); });
        if (a.length < 2) return 0;
        var m = mean(a); return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1));
    }
    function round(v, d) { var p = Math.pow(10, d == null ? 1 : d); return Math.round(v * p) / p; }
    /* 같은 조건 반복 → 조건 값마다 평균: trials [{ value, y }] → [{ value, n, mean, sd, ys }] (값 순서대로) */
    function byValue(trials, def) {
        var map = {}, order = [];
        (trials || []).forEach(function (t) {
            if (!isFinite(t.y)) return;
            var k = String(t.value);
            if (!map[k]) { map[k] = { value: t.value, ys: [] }; order.push(k); }
            map[k].ys.push(Number(t.y));
        });
        var out = order.map(function (k) { var g = map[k]; return { value: g.value, n: g.ys.length, mean: mean(g.ys), sd: sd(g.ys), ys: g.ys }; });
        if (def) out.sort(function (a, b) { return axisValue(def, a.value) - axisValue(def, b.value); });
        return out;
    }
    /* 목표와 차이: diff = 실제 − 목표, ok = |diff| ≤ 허용 오차 */
    function targetDiff(actual, target, tol) {
        var a = Number(actual), t = Number(target);
        if (!isFinite(a) || !isFinite(t)) return null;
        var d = a - t;
        return { diff: d, abs: Math.abs(d), ok: Math.abs(d) <= (Number(tol) || 0) + 1e-9 };
    }
    /* 영상 위 세 점 → 아이 키의 몇 % 높이까지 올랐나 (화면 위쪽이 y 작음, 폰을 세로로 세워 찍음)
       foot: 아이 발끝, head: 아이 정수리, top: 로켓 꼭대기 (같은 장면). 발끝 높이를 0 으로 본다 */
    function heightPct(foot, head, top) {
        if (!foot || !head || !top) return { error: '세 곳을 모두 눌러 주세요.' };
        var kid = foot.y - head.y;
        if (!(kid > 5)) return { error: '아이 정수리가 발끝보다 위에 있어야 해요. 순서대로 다시 눌러 주세요 (① 발끝 ② 정수리 ③ 로켓 꼭대기).' };
        var h = foot.y - top.y;
        var pct = h / kid * 100;
        if (pct < -20) return { error: '로켓 꼭대기가 발끝보다 아래예요. 로켓이 가장 높이 오른 장면을 골라 다시 눌러 주세요.' };
        return { pct: round(Math.max(0, pct), 0), raw: pct };
    }
    function cmFrom(pct, childCm) { var c = Number(childCm); return c > 0 && isFinite(pct) ? round(c * pct / 100, 0) : null; }
    // 손 입력 (영상 없이): 아이 키보다 높다/비슷/낮다 → 그래프용 대략 값 (화면에 '눈으로' 표시)
    var HAND = { high: { label: '아이 키보다 높다', pct: 120 }, same: { label: '아이 키와 비슷', pct: 100 }, low: { label: '아이 키보다 낮다', pct: 70 } };
    function handPct(k) { return HAND[k] ? HAND[k].pct : NaN; }

    // ---------- 생각 열기 · 정의 퀴즈 (과학 원리 문구는 운영계획서와 같게) ----------
    var DEF = {
        force: '힘 = 물체의 모양이나 운동 상태를 바꾸는 원인',
        accel: '가속도 = 속도가 변하는 정도',
        pressure: '압력 = 일정한 넓이에 작용하는 힘',
        gas: '발포비타민이 물과 반응해 생긴 이산화 탄소가 닫힌 필름통 안에 쌓여 압력이 커지고, 뚜껑을 미는 힘이 충분히 커지면 뚜껑이 열린다',
        control: '물의 양, 물의 온도, 발포비타민의 양, 조각 크기 중 한 가지만 바꾸고 나머지는 같게 한다',
        action: '뒤집어 세운 필름통의 뚜껑이 열리며 물과 기체를 아래로 밀어내면, 그 반작용으로 몸통이 위로 솟는다',
        design: '질량이 작을수록 가속도가 커지는 점을 이용해 물과 발포비타민의 양, 몸체 무게, 날개 모양을 조절한다'
    };
    // 생각 열기 (처음 생각 = 점수 없음, 정리 때 다시 풀면 퀴즈 점수). common: 흔한 생각
    var CONCEPTS = [
        { key: 'force', word: '힘', q: '‘힘’은 무엇일까요?', def: DEF.force,
          ex: '멈춰 있던 공을 차면 움직이고(운동 상태), 찰흙을 누르면 모양이 바뀌어요. 이렇게 바꾸는 원인이 힘이에요.',
          opts: [{ k: 'have', t: '물체가 가지고 있는 것 (힘이 세다, 힘이 빠졌다)', common: true }, { k: 'fast', t: '세게 움직이는 것', common: true }, { k: 'ok', t: '물체의 모양이나 움직임을 바꾸는 원인' }] },
        { key: 'accel', word: '가속도', q: '‘가속도’는 무엇일까요?', def: DEF.accel,
          ex: '아주 빨라도 같은 빠르기로 달리면 가속도는 0이에요. 출발하거나 멈출 때처럼 빠르기가 바뀔 때 가속도가 있어요.',
          opts: [{ k: 'fast', t: '빠른 정도 (빠를수록 가속도가 크다)', common: true }, { k: 'ok', t: '속도가 변하는 정도' }, { k: 'dist', t: '움직인 거리' }] },
        { key: 'pressure', word: '압력', q: '‘압력’은 무엇일까요?', def: DEF.pressure,
          ex: '같은 힘으로 눌러도 넓이가 좁은 바늘 끝이 손바닥보다 더 잘 들어가요. 힘을 넓이로 나누어 생각해요.',
          opts: [{ k: 'push', t: '누르는 힘의 크기', common: true }, { k: 'ok', t: '일정한 넓이에 작용하는 힘' }, { k: 'air', t: '공기의 무게' }] }
    ];
    // 중간 정의 퀴즈 (점수): 처음 맞히면 10점, 두 번째 5점, 그 뒤 0점
    var QUIZ = {
        gas: { q: '필름통 안에서 압력이 커지는 까닭은?', def: DEF.gas, word: '기체 발생과 압력',
               opts: [{ k: 'ok', t: '이산화 탄소가 닫힌 통 안에 쌓여서' }, { k: 'heavy', t: '물이 무거워져서' }, { k: 'cold', t: '뚜껑이 차가워져서' }] },
        pressure: { q: '압력이란?', def: DEF.pressure, word: '압력',
               opts: [{ k: 'push', t: '누르는 힘의 크기' }, { k: 'ok', t: '일정한 넓이에 작용하는 힘' }, { k: 'air', t: '공기의 무게' }] },
        control: { q: '한 가지만 바꾸고 나머지는 같게 하는(변인 통제) 까닭은?', def: DEF.control, word: '변인 통제',
               opts: [{ k: 'fast', t: '실험을 빨리 끝내려고' }, { k: 'ok', t: '무엇 때문에 결과가 달라졌는지 알려고' }, { k: 'many', t: '여러 가지를 한꺼번에 바꿔야 더 정확해서' }] },
        action: { q: '로켓(필름통)이 위로 솟는 까닭은?', def: DEF.action, word: '작용 반작용',
               opts: [{ k: 'suck', t: '공기가 로켓을 위로 빨아올려서' }, { k: 'ok', t: '물과 기체를 아래로 밀어내고, 그 반작용으로 몸통이 위로 솟아서' }, { k: 'light', t: '발포비타민이 가벼워서' }] },
        mass: { q: '같은 힘으로 밀 때, 로켓을 더 무겁게 하면?', def: DEF.design, word: '질량과 가속도',
               opts: [{ k: 'ok', t: '가속도가 작아져서 덜 높이 올라요' }, { k: 'more', t: '가속도가 커져서 더 높이 올라요' }, { k: 'same', t: '아무 차이가 없어요' }] }
    };
    // late: 설명 화면을 쓴 반에서 그 장 풀이가 이미 열린 뒤 처음 고른 퀴즈 → 맞혀도 5점까지 (2026-11-21)
    function quizPoints(tries, correct, late) { var p = !correct ? 0 : tries <= 1 ? 10 : tries === 2 ? 5 : 0; return late ? Math.min(p, 5) : p; }
    /* 퀴즈 기록 { key: { tries, correct, picks } } → { points, correct, total } */
    function score(quiz) {
        var o = { points: 0, correct: 0, total: 0 };
        Object.keys(quiz || {}).forEach(function (k) {
            var q = quiz[k]; if (!q) return;
            o.total++;
            if (q.correct) { o.correct++; o.points += quizPoints(q.tries, true, q.late); }
        });
        return o;
    }
    // 처음 생각 → 정리 때 생각: 바뀌어 맞게 된 것 ✨
    function conceptChanges(first, last) {
        return CONCEPTS.map(function (c) {
            var a = first && first[c.key], b = last && last[c.key];
            return { key: c.key, word: c.word, first: a || '', last: b || '', firstOk: a === 'ok', lastOk: b === 'ok', changed: !!a && !!b && a !== b, sparkle: !!a && a !== 'ok' && b === 'ok' };
        });
    }
    function optText(list, k) { var o = (list || []).filter(function (x) { return x.k === k; })[0]; return o ? o.t : ''; }

    /* 초3 쉬운 말 (2026-11-21 선생님 "초3 쉬운 말 한 줄"): 폰 화면과 발표 보기 설명 장(js/lesson-content/rocket.js)에 같은 말로
       KEY_WORDS: 정의(📘)마다 함께 보일 쉬운 말 */
    var EASY = {
        '원인': '왜 그렇게 됐는지의 까닭',
        '운동 상태': '움직이는 빠르기와 방향',
        '시속': '한 시간 동안 가는 거리',
        '가속도': '빨라지거나 느려지는 정도',
        '일정한 넓이': '똑같은 크기의 넓이',
        '이산화 탄소': '발포비타민에서 나오는 거품 속 기체',
        '변인 통제': '한 가지만 바꾸고 나머지는 똑같이 하기',
        '평균': '여러 번 잰 값을 모두 더해 잰 횟수로 나눈 값',
        '반작용': '내가 밀면 나도 반대쪽으로 밀리는 것',
        '질량': '물체에 든 양, 무거울수록 커요',
        '%': '아이 키를 100 으로 볼 때 얼마만큼인지',
        '정수리': '머리 꼭대기',
        '1차시': '첫 번째 시간'
    };
    var KEY_WORDS = { force: ['원인', '운동 상태'], accel: ['가속도'], pressure: ['일정한 넓이'], gas: ['이산화 탄소'], control: ['변인 통제'], action: ['반작용'], mass: ['질량'] };
    function easyLine(words) {
        return (words || []).filter(function (w) { return EASY[w]; }).map(function (w) { return w + ' = ' + EASY[w]; }).join(' · ');
    }

    /* 예측·정리 문장 (2026-11-21 선생님 '예측·정리 문장 적는 칸'): 행사형이라 고르기 먼저, 까닭은 짧은 칸(40자, 안 써도 됨)
       dir: up(늘어남)·down(줄어듦)·same(비슷) — 1차시는 열리는 시간, 2차시는 높이 */
    var GUESS = {
        t1: { what: '열리는 시간이', up: '길어질 것 같아요', down: '짧아질 것 같아요', same: '비슷할 것 같아요', upDone: '길어졌어요', downDone: '짧아졌어요', sameDone: '비슷했어요', word: { up: '길어짐', down: '짧아짐', same: '비슷' } },
        t2: { what: '높이가', up: '높아질 것 같아요', down: '낮아질 것 같아요', same: '비슷할 것 같아요', upDone: '높아졌어요', downDone: '낮아졌어요', sameDone: '비슷했어요', word: { up: '높아짐', down: '낮아짐', same: '비슷' } }
    };
    // 정리 '왜냐하면' 고르기 (직접 쓰기도 됨) — 2026-11-21 비계 4: 팀이 고른 변인에 맞춘 보기 (잠긴 변인 이야기는 넣지 않음)
    //   _ = 변인을 모를 때. 보기마다 40자 안 (cleanShort)
    var BECAUSE = {
        t1: {
            _: ['기체(거품)가 더 빨리 생겨서', '기체가 더 많이 생겨서', '뚜껑을 미는 힘(압력)이 달라서', '잘 모르겠어요'],
            water: ['통 안 빈 공간(기체가 모일 자리)이 달라져서', '물이 많아 발포비타민이 천천히 퍼져서', '기체가 모이는 자리가 좁아 압력이 빨리 커져서', '잘 모르겠어요'],
            temp: ['따뜻하면 기체(거품)가 더 빨리 생겨서', '차가우면 반응이 느려져서', '기체가 빨리 쌓여 압력이 빨리 커져서', '잘 모르겠어요'],
            tablet: ['기체가 더 많이 생겨서', '기체가 빨리 쌓여 압력이 빨리 커져서', '물에 다 녹지 않아서', '잘 모르겠어요'],
            piece: ['조각이 작으면 물에 닿는 면이 넓어 빨리 녹아서', '기체(거품)가 더 빨리 생겨서', '기체가 빨리 쌓여 압력이 빨리 커져서', '잘 모르겠어요']
        },
        t2: {
            _: ['무거워서 덜 빨라져서(질량)', '아래로 미는 힘이 세져서', '공기에 덜 막혀서', '잘 모르겠어요'],
            mass: ['무거우면 덜 빨라져서(질량)', '가벼우면 같은 힘으로 더 빨라져서', '무게가 달라도 미는 힘은 같아서', '잘 모르겠어요'],
            water: ['통 안 빈 공간(기체가 모일 자리)이 달라져서', '물이 많아 아래로 뿜는 양이 달라져서', '물이 많아 로켓이 무거워져서(질량)', '잘 모르겠어요'],
            tablet: ['기체가 더 많이 생겨 세게 밀어서', '기체가 빨리 쌓여 압력이 커져서', '물에 다 녹지 않아서', '잘 모르겠어요'],
            fins: ['날개가 공기에 막혀서(공기 저항)', '날개가 있어 똑바로 날아가서', '날개 무게가 달라져서(질량)', '잘 모르겠어요'],
            nose: ['공기에 덜 막혀서(공기 저항)', '똑바로 날아가서', '앞코 무게가 달라져서(질량)', '잘 모르겠어요']
        }
    };
    function becauseFor(part, k) { var b = BECAUSE[part] || BECAUSE.t1; return (b[k] || b._).slice(); }
    // 🔮 예측 까닭 칸의 보기 글 (차시·변인에 맞게)
    var WHY_EG = {
        t1: { _: '예: 따뜻하면 거품이 빨리 나서', water: '예: 물이 많으면 기체 자리가 좁아서', temp: '예: 따뜻하면 거품이 빨리 나서', tablet: '예: 많이 넣으면 기체가 많이 생겨서', piece: '예: 작은 조각이 빨리 녹아서' },
        t2: { _: '예: 무거우면 덜 올라가서', mass: '예: 무거우면 덜 올라가서', water: '예: 물이 많으면 세게 뿜어서', tablet: '예: 기체가 많으면 세게 밀어서', fins: '예: 날개가 많으면 공기에 막혀서', nose: '예: 뾰족하면 공기에 덜 막혀서' }
    };
    function whyExample(part, k) { var w = WHY_EG[part] || WHY_EG.t1; return w[k] || w._; }
    // 🔎 우리 팀 물음 (바꿀 것을 고르면 측정·결과·정리 화면 위에)
    var QUESTION = {
        t1: { water: '물을 많이 넣으면 뚜껑이 열리는 시간은 어떻게 될까?', temp: '물을 따뜻하게 하면 뚜껑이 더 빨리 열릴까?', tablet: '발포비타민을 더 넣으면 뚜껑이 더 빨리 열릴까?', piece: '조각을 작게 하면 뚜껑이 더 빨리 열릴까?' },
        t2: { mass: '몸체를 무겁게 하면 로켓 높이는 어떻게 될까?', water: '물을 많이 넣으면 로켓이 더 높이 올라갈까?', tablet: '발포비타민을 더 넣으면 로켓이 더 높이 올라갈까?', fins: '날개 수를 바꾸면 로켓 높이는 어떻게 될까?', nose: '앞코 모양을 바꾸면 로켓 높이는 어떻게 될까?' }
    };
    function teamQuestion(part, k) { return (QUESTION[part] && QUESTION[part][k]) || ''; }
    /* 📏 우리 숫자 (정리 문장의 증거): 바꾼 조건의 값마다 평균 → { labels, means, text, short }
       part 't1' 은 열리는 시간(초), 't2' 는 아이 키의 %. 한 가지 값뿐이면 one: true, 같은 조건 반복이 하나도 없으면 norep: true */
    function evidence(part, p, setup) {
        var defs = part === 't2' ? vars2(setup) : vars1(setup), d = p && defs[p.changed];
        if (!d) return null;
        var rows = byValue(((p && p.trials) || []).filter(function (t) { return d.values.indexOf(t.value) >= 0; }).map(function (t) { return { value: t.value, y: part === 't2' ? t.pct : t.y }; }), d);
        if (!rows.length) return null;
        var unit = function (m) { return part === 't2' ? Math.round(m) + '%' : round(m, 1) + '초'; };
        var labels = rows.map(function (r) { return d.label(r.value); }), means = rows.map(function (r) { return unit(r.mean); });
        var name = d.short || d.name, first = rows[0], last = rows[rows.length - 1];
        var one = rows.length < 2;
        var text = one ? name + '을(를) ' + labels[0] + ' 로 했더니 평균 ' + means[0]
            : name + '을(를) ' + labels.join(' → ') + ' 로 바꿨더니 평균 ' + means.join(' → ');
        // 선생님 결과판용 (40자 안): 처음·끝 값만
        var short = one ? name + ' ' + labels[0] + ': ' + means[0] : name + ' ' + d.label(first.value) + '→' + d.label(last.value) + ': ' + unit(first.mean) + '→' + unit(last.mean);
        // 값은 두 가지 넘는데 같은 조건 반복이 하나도 없으면 흔들림을 몰라 아직 말할 수 없음 (2026-11-23 가상 수업 4차: 2차시를 값마다 1발씩만 쏴도 결론이 열림)
        var norep = !one && !rows.some(function (r) { return r.n >= 2; });
        return { one: one, norep: norep, labels: labels, means: means, text: text, short: cleanShort(short), rows: rows };
    }
    /* 반복 흔들림: 같은 조건 반복의 가장 작은 값~가장 큰 값. 처음·끝 값의 범위가 겹치면 '흔들림 안' */
    function spread(rows) {
        rows = (rows || []).map(function (r) { var ys = r.ys || []; return { value: r.value, n: ys.length, lo: Math.min.apply(null, ys), hi: Math.max.apply(null, ys) }; });
        var rep = rows.some(function (r) { return r.n >= 2; });
        if (rows.length < 2 || !rep) return { rows: rows, rep: rep, verdict: '' };
        var a = rows[0], b = rows[rows.length - 1];
        return { rows: rows, rep: rep, verdict: a.lo <= b.hi && b.lo <= a.hi ? 'overlap' : 'clear' };
    }
    function cleanShort(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40); }

    // 예측과 왜 달랐을까? (고르기형)
    var WHY = [
        { k: 'speed', t: '기체가 생각보다 빨리(또는 늦게) 생겼어요', fb: '물의 온도·조각 크기가 반응 빠르기를 바꿔요. 따뜻할수록, 조각이 작을수록 기체가 빨리 생겨요.' },
        { k: 'lid', t: '뚜껑이 꽉(또는 헐겁게) 닫혔어요', fb: '뚜껑을 미는 힘이 얼마나 커져야 열리는지가 달라져요. 닫는 방법도 같게 하면 좋아요.' },
        { k: 'amount', t: '물이나 발포비타민 양이 조금 달랐어요', fb: '계량스푼·스포이트로 같은 양을 맞추면 결과가 더 고르게 나와요.' },
        { k: 'hand', t: '시간을 재는 손이 늦었어요', fb: '녹화로 재고 영상에서 ‘펑’ 장면을 고르면 손보다 정확해요.' },
        { k: 'right', t: '예측이 거의 맞았어요!', fb: '그래프를 보고 다음 조건의 시간도 예측해 보세요.' }
    ];

    // 재 본 값의 가짓수 (같은 조건 반복은 하나로): '한 가지 바꿔 한 번 더' — 2 가지 이상이어야 그래프·도전으로
    function valueKinds(trials) { var seen = {}; (trials || []).forEach(function (t) { if (t && t.value != null && isFinite(t.y != null ? t.y : t.pct)) seen[String(t.value)] = 1; }); return Object.keys(seen).length; }
    /* 선생님께 보낼 요약 (아이 키 cm·영상은 보내지 않음) */
    function summary(st, setup) {
        var s = mergeSetup(setup), sc = score(st.quiz);
        var t1 = (st.t1 && st.t1.trials) || [], t2 = (st.t2 && st.t2.trials) || [];
        var ch1 = (st.t1 && st.t1.challenge) || [], ch2 = (st.t2 && st.t2.challenge) || [];
        var best = function (list) { var b = null; list.forEach(function (c) { if (isFinite(c.diff) && (!b || Math.abs(c.diff) < Math.abs(b.diff))) b = c; }); return b; };
        var b1 = best(ch1), b2 = best(ch2);
        var ch = conceptChanges(st.think && st.think.first, st.think && st.think.last);
        var out = { '팀 점수': sc.points, '퀴즈 맞힘': sc.correct, '열림 측정 수': t1.length + ch1.length };
        if (b1) { out['시간 도전 차이(초)'] = round(b1.diff, 1); out['시간 도전 성공'] = Math.abs(b1.diff) <= s.tolTime + 1e-9 ? 1 : 0; }
        out['로켓 발사 수'] = t2.length + ch2.length;
        // 바꾼 조건의 값 가짓수 (1 이하 = 아직 한 가지 값으로만 잼 → 교사 발표 화면 '값 안 바꾼 팀')
        out['1차시 값 가짓수'] = valueKinds(t1); out['2차시 값 가짓수'] = valueKinds(t2);
        // 예측·정리 문장 (교사 결과판 '💬 생각'): 짧은 글만, 40자까지
        ['t1', 't2'].forEach(function (k, i) {
            var p = st[k] || {}, G = GUESS[k], n = (i + 1) + '차시';
            // 예측 = '짧아짐(까닭)' 한 칸 (요약 칸은 20개까지)
            if (p.guess && G.word[p.guess.dir]) out[n + ' 예측'] = cleanShort(G.word[p.guess.dir] + (p.guess.why ? '(' + p.guess.why + ')' : ''));
            var c = st.concl && st.concl[k], ev = p.changed && p.trials && p.trials.length ? evidence(k, p, s) : null;
            // 한 가지 값만 잰 차시는 결과를 말할 수 없음 (결과 없는 결론 막기)
            if (ev && (ev.one || ev.norep)) out[n + ' 결과'] = '아직 말할 수 없음';
            else {
                if (c && G.word[c.dir]) out[n + ' 결과'] = G.word[c.dir];
                if (c && c.why) out[n + ' 까닭'] = cleanShort(c.why);
            }
            // 📏 증거: 바꾼 것과 우리 숫자 (예: '물의 온도 30 °C→50 °C: 14.2초→9.8초')
            if (ev) out[n + ' 증거'] = ev.short;
        });
        // 🎯 도전 장면 (교사 결과판 📷 ▶): 차시마다 한 글자 — v 사진+영상 · p 사진만 · x 얼굴 가리기를 못 해 안 보냄 · - 없음
        // (2026-11-23 '결과판에서 최고 높이는 필요 없어' → 그 칸 대신. 요약 칸은 20개까지)
        var md = st.media || {}, mc = function (k) { return /^[vpx]$/.test(md[k] || '') ? md[k] : '-'; };
        if (md.t1 || md.t2) out['도전 장면'] = mc('t1') + mc('t2');
        if (b2) { out['높이 도전 차이(%)'] = Math.round(b2.diff); out['높이 도전 성공'] = Math.abs(b2.diff) <= s.tolPct + 1e-9 ? 1 : 0; }
        out['생각 바뀜 ✨'] = ch.filter(function (c) { return c.sparkle; }).length;
        return out;
    }
    // 보낼 자료 (교사 JSON 내려받기용, 숫자·고른 것만)
    function payload(st) {
        var t1 = st.t1 || {}, t2 = st.t2 || {};
        var pick = function (list, keys) { return (list || []).map(function (x) { var o = {}; keys.forEach(function (k) { if (x[k] !== undefined) o[k] = x[k]; }); return o; }); };
        return {
            v: 1, stage: st.stage || '',
            think: { first: (st.think && st.think.first) || {}, last: (st.think && st.think.last) || {} },
            quiz: st.quiz || {},
            t1: { changed: t1.changed || '', base: t1.base || {}, trials: pick(t1.trials, ['value', 'predict', 'y', 'method', 'at']), why: t1.why || '', challenge: pick(t1.challenge, ['value', 'predict', 'y', 'diff', 'ok', 'method', 'at']) },
            t2: { changed: t2.changed || '', base: t2.base || {}, trials: pick(t2.trials, ['value', 'pct', 'method', 'hand', 'at']), challenge: pick(t2.challenge, ['value', 'pct', 'diff', 'ok', 'method', 'hand', 'at']) },
            guess: { t1: t1.guess || null, t2: t2.guess || null }, concl: st.concl || {}
        };
    }

    return {
        DEFAULT_SETUP: DEFAULT_SETUP, mergeSetup: mergeSetup, valueKinds: valueKinds, EASY: EASY, KEY_WORDS: KEY_WORDS, easyLine: easyLine, GUESS: GUESS, BECAUSE: BECAUSE, becauseFor: becauseFor, whyExample: whyExample, teamQuestion: teamQuestion, evidence: evidence, spread: spread, cleanShort: cleanShort, PIECES: PIECES, NOSES: NOSES, tabletLabel: tabletLabel, vars1: vars1, vars2: vars2,
        range: range, stepIn: stepIn, axisValue: axisValue, mean: mean, sd: sd, round: round, byValue: byValue, targetDiff: targetDiff,
        heightPct: heightPct, cmFrom: cmFrom, HAND: HAND, handPct: handPct,
        DEF: DEF, CONCEPTS: CONCEPTS, QUIZ: QUIZ, quizPoints: quizPoints, score: score, conceptChanges: conceptChanges, optText: optText, WHY: WHY,
        summary: summary, payload: payload
    };
});
