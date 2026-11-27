/* 🎬 발표 보기 설명 화면 — 발포비타민 필름통 로켓 (가족 행사, 초3~중2 + 부모님)
   형식은 js/lesson-slides.js 맨 위. 개념 문장은 js/film-rocket-math.js 의 DEF·CONCEPTS·QUIZ 와 같은 말.
   폰에서 먼저 고르는 문제(처음 생각·퀴즈)의 답은 ask → 다음 키에 reveal 로만 보인다.
   key = 폰 화면의 답(📘 정의, js/film-rocket.js 의 data-lesson-answer)과 짝 — 풀이를 열면 폰에서도 보임.
   🧒 쉬운 말은 js/film-rocket-math.js 의 EASY 와 같은 말 (tests/lesson-content.test.cjs 가 확인) */
(function () {
    'use strict';
    var SVG_ROCKET = '<svg viewBox="0 0 200 200" role="img" aria-label="필름통에 물과 발포비타민을 넣고 뚜껑을 닫는 그림">' +
        '<rect x="70" y="40" width="60" height="110" rx="8" fill="#eceff1" stroke="#455a64" stroke-width="4"/>' +
        '<rect x="64" y="146" width="72" height="16" rx="4" fill="#607d8b"/>' +
        '<rect x="74" y="100" width="52" height="46" fill="#90caf9"/>' +
        '<circle cx="90" cy="118" r="5" fill="#fff"/><circle cx="106" cy="108" r="4" fill="#fff"/><circle cx="112" cy="126" r="6" fill="#fff"/><circle cx="96" cy="88" r="5" fill="#fff" opacity=".8"/><circle cx="108" cy="70" r="6" fill="#fff" opacity=".7"/>' +
        '<rect x="88" y="128" width="24" height="12" rx="3" fill="#ffb74d"/>' +
        '<text x="100" y="190" text-anchor="middle" font-size="16" fill="#455a64">뚜껑 · 물 · 발포비타민</text>' +
        '<path d="M100 32 L100 6 M88 18 L100 6 L112 18" stroke="#e53935" stroke-width="5" fill="none"/></svg>';
    var SVG_PRESSURE = '<svg viewBox="0 0 200 200" role="img" aria-label="통 안의 기체 알갱이가 뚜껑을 미는 그림">' +
        '<rect x="50" y="50" width="100" height="120" rx="8" fill="#e3f2fd" stroke="#455a64" stroke-width="4"/>' +
        '<rect x="44" y="34" width="112" height="18" rx="4" fill="#ffb74d"/>' +
        '<g fill="#1e88e5"><circle cx="75" cy="80" r="7"/><circle cx="110" cy="70" r="7"/><circle cx="130" cy="100" r="7"/><circle cx="90" cy="110" r="7"/><circle cx="70" cy="140" r="7"/><circle cx="120" cy="140" r="7"/><circle cx="100" cy="90" r="7"/></g>' +
        '<g stroke="#e53935" stroke-width="4"><path d="M75 70 L75 56 M69 62 L75 56 L81 62"/><path d="M110 60 L110 56"/><path d="M125 64 L125 56 M119 62 L125 56 L131 62"/></g></svg>';
    var SVG_ACTION = '<svg viewBox="0 0 200 220" role="img" aria-label="거꾸로 세운 필름통이 물과 기체를 아래로 밀고 몸통은 위로 솟는 그림">' +
        '<rect x="70" y="40" width="60" height="100" rx="8" fill="#ef6c00"/><path d="M70 40 L100 8 L130 40 Z" fill="#c62828"/>' +
        '<rect x="62" y="140" width="76" height="12" rx="3" fill="#607d8b"/>' +
        '<g fill="#90caf9"><circle cx="85" cy="172" r="7"/><circle cx="110" cy="180" r="9"/><circle cx="95" cy="198" r="6"/><circle cx="120" cy="204" r="5"/></g>' +
        '<path d="M160 120 L160 40 M148 54 L160 40 L172 54" stroke="#2e7d32" stroke-width="6" fill="none"/><text x="160" y="140" text-anchor="middle" font-size="15" fill="#2e7d32">몸통 ↑</text>' +
        '<path d="M40 150 L40 205 M28 192 L40 205 L52 192" stroke="#1565c0" stroke-width="6" fill="none"/><text x="40" y="140" text-anchor="middle" font-size="15" fill="#1565c0">물·기체 ↓</text></svg>';

    /* '이렇게 재요'·'이렇게 찍고 재요' (2026-11-27 선생님 '직관적이지 않음' → 초3 가족이 프로젝터로 한눈에: 글 목록 대신 큰 그림, 낱말 최소,
       녹화/초시계는 작은 보조 줄, 예측은 '우리 팀 실험 계획' 장에서 이미 물어서 뺌). 두 안을 견주어 고름 → HOW 하나만 남김 */
    var HOW_V = (typeof window !== 'undefined' && window.ROCKET_HOW) || 'a';
    var CAN = function (x, lbl, fill) {   // 작은 필름통 (x: 왼쪽, lbl: ①/②)
        return '<g transform="translate(' + x + ' 0)"><rect x="0" y="28" width="34" height="52" rx="5" fill="#eceff1" stroke="#455a64" stroke-width="3"/>' +
            '<rect x="-3" y="20" width="40" height="10" rx="3" fill="#ffb74d"/><rect x="3" y="52" width="28" height="26" fill="' + fill + '"/>' +
            '</g>';
    };
    var SW = function (x, y) { return '<g transform="translate(' + x + ' ' + y + ')"><circle cx="0" cy="0" r="11" fill="#fff" stroke="#455a64" stroke-width="3"/><path d="M0 0 L0 -7 M0 0 L5 3" stroke="#e53935" stroke-width="2.5"/><rect x="-3" y="-17" width="6" height="5" fill="#455a64"/></g>'; };
    var STEP = function (n, ic, t) { return '<div class="ls-step"><span class="ls-step-n">' + n + '</span><span class="ls-step-ic" aria-hidden="true">' + ic + '</span><b class="ls-step-t">' + t + '</b></div>'; };
    var ARR = '<span class="ls-arr" aria-hidden="true">➜</span>';
    var SVG_SAME3 = '<svg viewBox="0 10 150 85" role="img" aria-label="같은 필름통을 3번 재는 그림">' + CAN(10, '①', '#90caf9') + SW(80, 40) + SW(108, 40) + SW(136, 40) +
        '<text x="108" y="80" text-anchor="middle" font-size="16" fill="#455a64">3번</text></svg>';
    var SVG_CHG3 = '<svg viewBox="0 10 150 85" role="img" aria-label="하나만 바꾼 필름통을 3번 재는 그림">' + CAN(10, '②', '#ef9a9a') + SW(80, 40) + SW(108, 40) + SW(136, 40) +
        '<text x="108" y="80" text-anchor="middle" font-size="16" fill="#455a64">3번</text></svg>';
    var SVG_BARS = '<svg viewBox="0 0 150 110" role="img" aria-label="①과 ②의 평균 막대를 견주는 그림"><rect x="10" y="96" width="130" height="3" fill="#90a4ae"/>' +
        '<rect x="30" y="34" width="34" height="62" rx="3" fill="#90caf9"/><rect x="86" y="54" width="34" height="42" rx="3" fill="#ef9a9a"/>' +
        '<text x="47" y="26" text-anchor="middle" font-size="16" font-weight="700" fill="#1565c0">①</text><text x="103" y="46" text-anchor="middle" font-size="16" font-weight="700" fill="#c62828">②</text></svg>';
    var HOW_T1 = {
        // 안 A: 그림 카드 3칸 흐름
        a: '<div class="ls-flow">' + STEP('①', SVG_SAME3, '그대로<br>3번 재요') + ARR + STEP('②', SVG_CHG3, '하나만 바꿔<br>3번 재요') + ARR + STEP('📊', SVG_BARS, '평균을<br>견줘요') + '</div>' +
           '<p class="ls-aside">⏱ 초시계 또는 🎥 녹화(‘펑’ 장면 고르기) · 🧒 평균 = 여러 번 잰 값을 모두 더해 잰 횟수로 나눈 값</p>',
        // 안 B: 채워 갈 결과 표 하나 (폰의 결과 비교 표와 같은 모양)
        b: '<table class="ls-fill"><thead><tr><th></th><th>1번</th><th>2번</th><th>3번</th><th>평균</th></tr></thead><tbody>' +
           '<tr><th>① 그대로</th><td>⏱</td><td>⏱</td><td>⏱</td><td class="ls-avg">?초</td></tr>' +
           '<tr><th>② 하나만 바꿔서</th><td>⏱</td><td>⏱</td><td>⏱</td><td class="ls-avg">?초</td></tr></tbody></table>' +
           '<p class="ls-bigq">①과 ②의 <b>평균</b>은 어떻게 다를까요?</p>' +
           '<p class="ls-aside">⏱ 초시계 또는 🎥 녹화(‘펑’ 장면 고르기) · 🧒 평균 = 여러 번 잰 값을 모두 더해 잰 횟수로 나눈 값</p>'
    };
    var KID = function (x, h) {   // 아이 (발끝 y=150, 키 h)
        var top = 150 - h;
        return '<circle cx="' + x + '" cy="' + (top + 10) + '" r="10" fill="#ffcc80"/><rect x="' + (x - 9) + '" y="' + (top + 20) + '" width="18" height="' + (h * 0.42) + '" rx="6" fill="#42a5f5"/>' +
            '<rect x="' + (x - 7) + '" y="' + (top + 20 + h * 0.42) + '" width="6" height="' + (h - 20 - h * 0.42) + '" fill="#1e88e5"/><rect x="' + (x + 1) + '" y="' + (top + 20 + h * 0.42) + '" width="6" height="' + (h - 20 - h * 0.42) + '" fill="#1e88e5"/>';
    };
    var SVG_STAND = '<svg viewBox="0 0 120 160" role="img" aria-label="아이가 발사대 바로 옆에 선 그림"><rect x="0" y="150" width="120" height="4" fill="#90a4ae"/>' +
        '<rect x="22" y="138" width="22" height="12" fill="#607d8b"/><rect x="28" y="100" width="10" height="38" rx="3" fill="#ef6c00"/><path d="M28 100 L33 88 L38 100 Z" fill="#c62828"/>' + KID(76, 80) + '</svg>';
    var SVG_FILM2 = '<svg viewBox="0 0 120 160" role="img" aria-label="부모님이 2~3 m 떨어져 폰을 세로로 들고 찍는 그림"><rect x="0" y="150" width="120" height="4" fill="#90a4ae"/>' +
        '<circle cx="84" cy="62" r="11" fill="#ffcc80"/><rect x="74" y="73" width="20" height="46" rx="6" fill="#7e57c2"/><rect x="76" y="119" width="7" height="31" fill="#5e35b1"/><rect x="85" y="119" width="7" height="31" fill="#5e35b1"/>' +
        '<rect x="54" y="66" width="13" height="22" rx="2" fill="#263238"/><rect x="56" y="69" width="9" height="15" fill="#80deea"/>' +
        '<path d="M8 140 L48 140" stroke="#455a64" stroke-width="2.5"/><path d="M8 134 L8 146 M48 134 L48 146" stroke="#455a64" stroke-width="2.5"/><text x="28" y="130" text-anchor="middle" font-size="14" font-weight="700" fill="#455a64">2~3 m</text></svg>';
    var SVG_TOP = '<svg viewBox="0 0 120 160" role="img" aria-label="로켓이 가장 높이 오른 장면"><rect x="0" y="150" width="120" height="4" fill="#90a4ae"/>' +
        '<path d="M40 140 Q46 70 52 30" stroke="#ffb74d" stroke-width="3" stroke-dasharray="5 4" fill="none"/>' +
        '<rect x="47" y="18" width="10" height="34" rx="3" fill="#ef6c00"/><path d="M47 18 L52 6 L57 18 Z" fill="#c62828"/>' + KID(88, 80) +
        '<text x="22" y="28" font-size="20" aria-hidden="true">⭐</text></svg>';
    var SVG_TAP = '<svg viewBox="0 0 120 160" role="img" aria-label="발끝, 정수리, 로켓 꼭대기 세 곳을 누르는 그림"><rect x="0" y="150" width="120" height="4" fill="#90a4ae"/>' +
        '<rect x="42" y="22" width="10" height="34" rx="3" fill="#ef6c00"/><path d="M42 22 L47 10 L52 22 Z" fill="#c62828"/>' + KID(86, 80) +
        '<g font-size="13" font-weight="700"><circle cx="86" cy="150" r="9" fill="#43a047"/><text x="86" y="155" text-anchor="middle" fill="#fff">1</text>' +
        '<circle cx="86" cy="70" r="9" fill="#1e88e5"/><text x="86" y="75" text-anchor="middle" fill="#fff">2</text>' +
        '<circle cx="47" cy="10" r="9" fill="#e53935"/><text x="47" y="15" text-anchor="middle" fill="#fff">3</text></g></svg>';
    var SVG_SCENE2 = '<svg viewBox="0 0 420 222" role="img" aria-label="아이가 발사대 옆에 서고, 부모님이 2~3 m 떨어져 세로로 찍고, 가장 높은 장면에서 발끝·정수리·로켓 꼭대기를 누르는 그림">' +
        '<rect x="0" y="180" width="420" height="5" fill="#90a4ae"/>' +
        '<rect x="70" y="168" width="26" height="12" fill="#607d8b"/><path d="M83 165 Q90 100 96 50" stroke="#ffb74d" stroke-width="3" stroke-dasharray="6 5" fill="none"/>' +
        '<rect x="90" y="30" width="12" height="40" rx="3" fill="#ef6c00"/><path d="M90 30 L96 16 L102 30 Z" fill="#c62828"/>' +
        '<g transform="translate(60 30)">' + KID(78, 80) + '</g>' +
        '<g font-size="15" font-weight="700"><circle cx="138" cy="180" r="11" fill="#43a047"/><text x="138" y="185" text-anchor="middle" fill="#fff">1</text>' +
        '<circle cx="138" cy="100" r="11" fill="#1e88e5"/><text x="138" y="105" text-anchor="middle" fill="#fff">2</text>' +
        '<circle cx="96" cy="16" r="11" fill="#e53935"/><text x="96" y="21" text-anchor="middle" fill="#fff">3</text></g>' +
        '<circle cx="348" cy="88" r="13" fill="#ffcc80"/><rect x="336" y="101" width="24" height="54" rx="7" fill="#7e57c2"/><rect x="338" y="155" width="8" height="25" fill="#5e35b1"/><rect x="350" y="155" width="8" height="25" fill="#5e35b1"/>' +
        '<rect x="312" y="90" width="16" height="28" rx="3" fill="#263238"/><rect x="314" y="93" width="12" height="20" fill="#80deea"/>' +
        '<path d="M312 104 L150 40 M312 104 L150 182" stroke="#b0bec5" stroke-width="2" stroke-dasharray="4 4"/>' +
        '<path d="M150 214 L330 214" stroke="#455a64" stroke-width="2.5"/><path d="M150 208 L150 220 M330 208 L330 220" stroke="#455a64" stroke-width="2.5"/>' +
        '<text x="240" y="205" text-anchor="middle" font-size="16" font-weight="700" fill="#455a64">2~3 m · 폰은 세로로</text></svg>';
    var HOW_T2 = {
        a: '<div class="ls-flow">' + STEP('1', SVG_STAND, '발사대<br>옆에 서요') + ARR + STEP('2', SVG_FILM2, '세로로<br>찍어요') + ARR + STEP('3', SVG_TOP, '가장 높은<br>장면') + ARR + STEP('4', SVG_TAP, '세 곳<br>눌러요') + '</div>' +
           '<p class="ls-aside">👆 ① 발끝 ② 정수리 ③ 로켓 꼭대기 → ‘아이 키의 ○%’</p>' +
           '<p class="ls-aside">📏 자 대신 <b>같은 장면 속 아이 키</b>와 견줘요 · 녹화가 안 되면 눈으로 높다·비슷·낮다</p>' +
           '<p class="ls-easy">🧒 쉬운 말 · % = 아이 키를 100 으로 볼 때 얼마만큼인지 · 정수리 = 머리 꼭대기</p>',
        b: '<div class="ls-scene">' + SVG_SCENE2 + '</div>' +
           '<p class="ls-bigq"><span class="ls-dot g">1</span> 발끝 <span class="ls-dot b">2</span> 정수리 <span class="ls-dot r">3</span> 로켓 꼭대기 → <b>아이 키의 ○%</b></p>' +
           '<p class="ls-aside">📏 자 대신 <b>같은 장면 속 아이 키</b>와 견줘요 · 녹화가 안 되면 눈으로 높다·비슷·낮다</p>' +
           '<p class="ls-easy">🧒 쉬운 말 · % = 아이 키를 100 으로 볼 때 얼마만큼인지 · 정수리 = 머리 꼭대기</p>'
    };

    // 🛠 로켓 만들기 (2026-11-27 '학생이 로켓을 만드는 과정도 있어야해'): 네 단계 그림 카드 — 폰은 차례 체크 + '다 만들었어요'
    var BODY = function (extra) {   // 뒤집어 세운 로켓 몸통 (뚜껑이 아래)
        return '<svg viewBox="0 0 120 140" role="img" aria-label="' + extra.label + '"><rect x="0" y="132" width="120" height="4" fill="#90a4ae"/>' +
            '<rect x="44" y="120" width="32" height="10" rx="2" fill="#ffb74d"/>' +   // 뚜껑 (아래)
            '<rect x="44" y="' + extra.top + '" width="32" height="' + (120 - extra.top) + '" rx="4" fill="' + extra.fill + '" stroke="#455a64" stroke-width="3"/>' +
            (extra.more || '') + '</svg>';
    };
    var FINS = '<path d="M44 92 L26 122 L44 116 Z" fill="#43a047"/><path d="M76 92 L94 122 L76 116 Z" fill="#43a047"/><path d="M58 98 L60 124 L62 98 Z" fill="#2e7d32"/>';
    var NOSE = '<path d="M44 38 L60 10 L76 38 Z" fill="#e53935"/>';
    var CLAY = '<circle cx="60" cy="48" r="7" fill="#8d6e63"/><circle cx="72" cy="50" r="5" fill="#8d6e63" opacity=".55"/><text x="96" y="54" font-size="14" fill="#5d4037">+?</text>';
    var SVG_B1 = BODY({ label: '색지를 말아 필름통에 붙여 몸통을 만든 그림', top: 38, fill: '#fff3e0' }).replace('</svg>', '<rect x="44" y="96" width="32" height="24" fill="#eceff1" opacity=".9"/><text x="60" y="80" text-anchor="middle" font-size="12" fill="#6d4c41">색지</text></svg>');
    var SVG_B2 = BODY({ label: '몸통 아래에 날개 세 장을 붙인 그림', top: 38, fill: '#fff3e0', more: FINS });
    var SVG_B3 = BODY({ label: '몸통 위에 원뿔 앞코를 씌운 그림', top: 38, fill: '#fff3e0', more: FINS + NOSE });
    var SVG_B4 = BODY({ label: '점토를 붙여 무게를 맞추는 그림', top: 38, fill: '#fff3e0', more: FINS + NOSE + CLAY });
    var BUILD_FLOW = '<div class="ls-flow">' + STEP('1', SVG_B1, '색지로<br>몸통') + ARR + STEP('2', SVG_B2, '날개<br>3장') + ARR + STEP('3', SVG_B3, '뾰족한<br>앞코') + ARR + STEP('4', SVG_B4, '점토로<br>무게') + '</div>' +
        '<p class="ls-aside">🧰 필름통(뚜껑이 아래로) · 색지 · 가위 · 투명테이프 · 점토·클립 (처음엔 0개)</p>';

    // '펑' 장면 (2026-11-21 비계 4): 물음 그림은 기체가 조금 있는 닫힌 통만, 풀이 그림은 세 칸 (조금 → 많이 + 미는 화살표 → 펑)
    var SVG_POP_ASK = '<svg viewBox="0 0 200 200" role="img" aria-label="뚜껑이 닫힌 필름통 안에 기체 알갱이가 조금 있는 그림">' +
        '<rect x="55" y="50" width="90" height="120" rx="8" fill="#e3f2fd" stroke="#455a64" stroke-width="4"/>' +
        '<rect x="48" y="34" width="104" height="18" rx="4" fill="#ffb74d"/>' +
        '<g fill="#1e88e5"><circle cx="80" cy="120" r="7"/><circle cx="115" cy="135" r="7"/><circle cx="100" cy="95" r="7"/></g>' +
        '<text x="100" y="192" text-anchor="middle" font-size="16" fill="#455a64">뚜껑은 꽉 끼워져 있어요</text></svg>';
    var SVG_POP = '<svg viewBox="0 0 300 200" role="img" aria-label="기체가 조금 있을 때, 많이 쌓여 뚜껑을 세게 밀 때, 뚜껑이 펑 열릴 때 세 장면">' +
        '<g><rect x="10" y="70" width="70" height="100" rx="6" fill="#e3f2fd" stroke="#455a64" stroke-width="3"/><rect x="5" y="58" width="80" height="14" rx="3" fill="#ffb74d"/>' +
        '<g fill="#1e88e5"><circle cx="30" cy="140" r="6"/><circle cx="60" cy="150" r="6"/><circle cx="45" cy="115" r="6"/></g>' +
        '<g stroke="#e53935" stroke-width="3"><path d="M45 104 L45 80"/></g><text x="45" y="192" text-anchor="middle" font-size="14" fill="#455a64">① 조금</text></g>' +
        '<g><rect x="115" y="70" width="70" height="100" rx="6" fill="#e3f2fd" stroke="#455a64" stroke-width="3"/><rect x="110" y="58" width="80" height="14" rx="3" fill="#ffb74d"/>' +
        '<g fill="#1e88e5"><circle cx="130" cy="90" r="6"/><circle cx="150" cy="85" r="6"/><circle cx="170" cy="92" r="6"/><circle cx="135" cy="115" r="6"/><circle cx="160" cy="112" r="6"/><circle cx="140" cy="140" r="6"/><circle cx="168" cy="138" r="6"/><circle cx="150" cy="160" r="6"/></g>' +
        '<g stroke="#e53935" stroke-width="4"><path d="M128 78 L128 62 M122 68 L128 62 L134 68"/><path d="M150 76 L150 60 M144 66 L150 60 L156 66"/><path d="M172 78 L172 62 M166 68 L172 62 L178 68"/></g>' +
        '<text x="150" y="192" text-anchor="middle" font-size="14" fill="#455a64">② 많이 → 세게 밀어요</text></g>' +
        '<g><rect x="220" y="70" width="70" height="100" rx="6" fill="#e3f2fd" stroke="#455a64" stroke-width="3"/><rect x="222" y="12" width="80" height="14" rx="3" fill="#ffb74d" transform="rotate(-18 262 19)"/>' +
        '<g fill="#1e88e5"><circle cx="240" cy="55" r="6"/><circle cx="262" cy="40" r="6"/><circle cx="280" cy="58" r="6"/><circle cx="250" cy="120" r="6"/><circle cx="272" cy="140" r="6"/></g>' +
        '<text x="255" y="192" text-anchor="middle" font-size="14" fill="#c62828">③ 펑!</text></g></svg>';

    // 공통 부품(js/lesson-slides.js)보다 먼저 불려도 되게: 없으면 대기열에 넣어 두고 부품이 가져감
    var LC = (typeof window !== 'undefined' && window.LessonContent) || (typeof LessonContent !== 'undefined' ? LessonContent : null);
    if (!LC) LC = window.LessonContent = { _wait: {}, add: function (k, d) { this._wait[k] = d; return d; } };
    LC.add('rocket', {
        title: '발포비타민 필름통 로켓',
        stages: {
            // 1 들어가기 (처음 생각 → 풀이 열기로 하나씩 수업 → 힘·가속도·압력 과학적 정의 한눈에 정리)
            think: [
                { kind: 'why', title: '오늘은 필름통 로켓을 쏘아 올려요 🚀',
                  body: '<p><b>1차시</b> ⏱ 뚜껑이 열리는 <b>시간</b> · <b>2차시</b> 🚀 로켓 만들고 <b>높이</b></p><p>📱 팀 이름으로 들어와 <b>처음 생각</b>을 골라요 (점수 없어요)</p>' +
                        '<p class="ls-easy">🧒 쉬운 말 · 1차시 = 첫 번째 시간</p>',
                  img: SVG_ROCKET,
                  note: '가족마다 폰 1대로 팀 이름을 정하고 들어오게 하세요(아래 띠의 📱 QR). 세 가지 말(힘·가속도·압력)의 처음 생각을 고른 뒤 하나씩 풀이로 과학적 정의를 배우고, 끝에 같은 문제를 다시 풀어 생각이 바뀐 것(✨)을 봐요.' },
                { kind: 'ask', title: '‘힘’은 무엇일까요?', key: 'force', mode: 'phone',
                  body: '<p>멈춰 있던 공을 <b>발로 차면</b> 어떻게 되나요? 찰흙을 <b>손으로 누르면</b>?</p>',
                  ask: '공과 찰흙에서 무엇이 바뀌었나요? 그렇게 바꾼 ‘원인’은 무엇일까요?',
                  reveal: '<p><b>힘</b> = 물체의 <b>모양</b>이나 <b>운동 상태</b>를 바꾸는 원인</p><p>공은 움직이기 시작했고(운동 상태), 찰흙은 모양이 바뀌었어요.</p><p class="ls-easy">🧒 쉬운 말 · 원인 = 왜 그렇게 됐는지의 까닭 · 운동 상태 = 움직이는 빠르기와 방향</p>',
                  note: '폰에서 ‘처음 생각’을 먼저 고르게 한 뒤(점수 없음) 넘겨서 풀이를 보여 주세요. “힘이 세다·빠졌다”처럼 물체가 가진 것으로 생각하는 아이가 많아요.' },
                { kind: 'ask', title: '‘가속도’는 무엇일까요?', key: 'accel', mode: 'phone',
                  body: '<p>자동차가 <b>시속 100 km 로 똑같이</b> 달리고 있어요.</p><p class="ls-easy">🧒 쉬운 말 · 시속 = 한 시간 동안 가는 거리</p>',
                  ask: '이 자동차에는 가속도가 있을까요, 없을까요? 언제 가속도가 생길까요?',
                  reveal: '<p><b>가속도</b> = 속도가 <b>변하는</b> 정도</p><p>같은 빠르기로 달리면 가속도는 0. <b>빠르기가 바뀔 때</b> 가속도가 있어요.</p><p class="ls-easy">🧒 쉬운 말 · 가속도 = 빨라지거나 느려지는 정도</p>',
                  note: '“빠를수록 가속도가 크다”는 생각을 흔들어 주는 장면이에요. 빠르기와 빠르기의 ‘변화’를 나눠 말해 주세요.' },
                { kind: 'ask', title: '‘압력’은 무엇일까요?', key: 'pressure', mode: 'phone',
                  body: '<p>같은 힘으로 <b>바늘 끝</b>과 <b>손바닥</b>을 풍선에 눌러요.</p>',
                  ask: '어느 쪽이 풍선을 더 쉽게 터뜨릴까요? 왜 그럴까요?',
                  reveal: '<p><b>압력</b> = 일정한 <b>넓이</b>에 작용하는 힘</p><p>같은 힘이라도 넓이가 좁은 바늘 끝은 압력이 커서 더 잘 들어가요.</p><p class="ls-easy">🧒 쉬운 말 · 일정한 넓이 = 똑같은 크기의 넓이</p>',
                  note: '“누르는 힘의 크기”와 압력을 헷갈리기 쉬워요. ‘넓이’라는 말을 꼭 짚어 주세요.' },
                // 정리 표 (선생님이 '들어가기에서 수업'하기로 한 장 — 80자 기준에서 뺌)
                { kind: 'concept', title: '📘 오늘의 핵심 개념: 힘 · 가속도 · 압력', mode: 'look', summary: true,
                  body: '<table class="ls-defs"><thead><tr><th>개념</th><th>과학적 정의</th><th>🧒 쉬운 말</th></tr></thead><tbody>' +
                        '<tr><th><b>힘</b></th><td>물체의 <b>모양</b>이나 <b>운동 상태</b>를 바꾸는 원인</td><td>원인 = 왜 그렇게 됐는지의 까닭<br>운동 상태 = 움직이는 빠르기와 방향</td></tr>' +
                        '<tr><th><b>가속도</b></th><td>속도가 <b>변하는</b> 정도</td><td>빨라지거나 느려지는 정도</td></tr>' +
                        '<tr><th><b>압력</b></th><td>일정한 <b>넓이</b>에 작용하는 힘</td><td>일정한 넓이 = 똑같은 크기의 넓이</td></tr>' +
                        '</tbody></table>' +
                        '<p>1차시에서는 <b>압력</b>, 2차시에서는 <b>힘과 가속도</b>로 로켓의 비밀을 밝혀 봐요!</p>',
                  note: '들어가기에서 세 가지 과학적 정의(쉬운 말 포함)를 한눈에 정리해 주세요. 다 정리한 뒤 ‘▶ 1차시 열기’로 넘어가면 돼요.' }
            ],
            // 2 1차시 열리는 시간 (32분, 6장)
            t1: [
                // '펑' 물음 두 장(기체 발생 + 그 순간)을 하나로 (2026-11-27 분량 조절)
                { kind: 'why', title: '뚜껑은 왜 ‘펑’ 하고 열릴까요?', key: 'gas', mode: 'phone',
                  body: '<p>닫힌 필름통에 물 + 발포비타민 → 잠시 뒤 <b>‘펑!’</b></p>',
                  img: SVG_POP_ASK,
                  ask: '통 안에 무엇이 쌓여 뚜껑을 밀까요? 언제 열릴까요?',
                  reveal: '<p><b>이산화 탄소</b>(기체)가 쌓여 <b>압력</b>이 커져요. 미는 힘이 <b>붙잡는 힘보다 커지면</b> ‘펑!’</p><p class="ls-easy">🧒 쉬운 말 · 이산화 탄소 = 발포비타민에서 나오는 거품 속 기체</p>',
                  revealImg: SVG_POP,   // 미는 화살표·펑 = 답 → 풀이 뒤에
                  note: '폰은 ‘기체 발생과 압력’ 퀴즈(팀 점수)예요. 다 푼 것을 띠(⏳)로 확인한 뒤 넘겨 풀이를 보여 주세요. 들어가기의 ‘압력 = 일정한 넓이에 작용하는 힘’을 떠올려 “같은 넓이를 더 세게 민다”와 “붙잡는 힘보다 커지면 열린다”를 이어 말하게 해 보세요.' },
                { kind: 'safety', title: '시작하기 전에 꼭 지켜요',
                  body: '<ul><li>🥽 <b>보안경</b>을 써요</li><li>🙅 필름통에서 <b>얼굴을 멀리</b></li><li>🏃 닫고 <b>바로 물러나요</b></li><li>✋ 안 열리면 <b>선생님</b>을 불러요</li></ul>',
                  note: '폰에서도 네 가지를 체크해야 다음으로 넘어가요. 보안경을 쓴 것을 눈으로 확인해 주세요. 안 열린 통은 들여다보거나 흔들지 않게 해 주세요.' },
                // 우리 팀 계획 + 🔮 예측 = 폰 응답 장 (2026-11-27 '질문 추가'): 폰은 '변인 통제' 퀴즈 → 바꿀 것 하나·① → ②·🔮 예측·까닭, 프로젝터에 팀 답 모음
                { kind: 'ask', title: '우리 팀 실험 계획 🔮', key: 'plan-t1', mode: 'phone', opens: ['control'],
                  body: '<p>바꿀 것 <b>하나</b>만 고르고 나머지는 똑같이 🔒</p><p class="ls-aside">물의 양 · 물의 온도 · 발포비타민 양 · 조각 크기</p>',
                  ask: '① → ② 로 바꾸면 시간이 길어질까요, 짧아질까요? 왜?',
                  reveal: '<p><b>변인 통제</b>: 하나만 바꿔야 결과가 달라진 <b>원인</b>을 알 수 있어요</p><p class="ls-easy">🧒 쉬운 말 · 변인 통제 = 한 가지만 바꾸고 나머지는 똑같이 하기</p>',
                  note: '폰은 ‘변인 통제’ 퀴즈(팀 점수) → ‘무엇을 바꿔 볼까요?’(바꿀 것 하나 · ① → ② · 🔮 예측 · 까닭)예요. 예측은 정답이 없어요 — 프로젝터에 모인 길어질·짧아질·비슷과 까닭을 두세 팀 말하게 한 뒤 풀이(변인 통제)를 여세요. 측정할 때는 예측을 다시 묻지 않아요.' },
                // 📱 측정 장 (2026-11-23 '폰은 응답만'): 이 장을 띄운 동안 팀 폰이 측정 화면 — '이렇게 재요'를 그림 흐름으로 이 장 안에 (2026-11-27)
                { kind: 'how', title: '📱 이제 폰으로 재요', key: 'do-t1', mode: 'phone',
                  body: HOW_T1[HOW_V] || HOW_T1.a,
                  note: '이 장을 띄워 둔 동안 팀 폰이 1차시 측정 화면이 돼요(안전 → 조건 → 재기 → 결과 비교). 다음 장으로 넘기면 측정 중이 아닌 팀은 👀 대기, 재는 중인 팀은 그 측정을 마친 뒤 바뀌어요. 손으로 누르는 초시계는 늦기 쉬워 녹화가 더 정확하다는 점도 견주어 볼 수 있어요.' },
                { kind: 'ask', title: '같은 조건인데 시간이 달라요!',
                  body: '<p>같은 물, 같은 발포비타민인데 1번은 12초, 2번은 15초.</p>',
                  ask: '왜 다르게 나왔을까요? 생각나는 까닭을 모두 말해 봐요.',
                  reveal: '<p>기체 생기는 빠르기 · 뚜껑 닫힘 · 양의 작은 차이 · 누르는 손 — 그래서 <b>여러 번 재서 평균</b>을 내요.</p>',
                  note: '폰의 ‘왜 달랐을까?’ 고르기와 이어져요. 팀마다 고른 까닭을 한두 팀 말하게 해 보세요.' },
                // 🎯 도전 장 (2026-11-23 가상 수업 4차): 이 장을 띄운 동안 팀 폰이 1차시 도전 화면
                { kind: 'how', title: '🎯 도전: 목표 시간에 맞춰 열기', key: 'ch-t1', mode: 'phone',
                  body: '<p>우리 <b>결과 표</b>를 보고 조건을 골라 목표 시간에 ‘펑!’</p>',
                  ask: '목표 시간에 가까운 조건은 무엇일까요? 압력으로 까닭을 말해요.',
                  note: '목표 시간·허용 오차는 팝업 ‘🔧 선생님용’의 예비 실험 값에서 정해요. 차이가 허용 범위 안이면 성공이에요.' }
            ],
            // 3 2차시 로켓 높이 (🛠 만들기 12분 2장 + 쏘아 올리기 25분 5장)
            t2: [
                // 🛠 로켓 만들기 (2026-11-27 새로): 폰은 네 단계 체크 + '다 만들었어요', 프로젝터에 '다 만든 팀 N / M'
                { kind: 'how', title: '🛠 로켓을 만들어요', key: 'build', mode: 'phone',
                  body: BUILD_FLOW,
                  note: '폰에서 네 단계를 하나씩 체크하고 ‘✅ 다 만들었어요’를 눌러요. 프로젝터에 다 만든 팀 수가 모여요. 몸통 종이는 필름통 뚜껑 쪽이 아래로 오게, 날개는 같은 간격으로 붙이게 도와주세요.' },
                { kind: 'ask', title: '날개와 앞코는 왜 달까요?', mode: 'look',
                  body: '<p>날아갈 때 <b>공기</b>가 앞을 막아요(<b>공기 저항</b>).</p>',
                  ask: '뾰족한 앞코와 꼬리 날개는 어떤 일을 할까요?',
                  reveal: '<p><b>앞코</b> — 공기를 갈라 <b>공기 저항</b>을 줄여요 · <b>날개</b> — <b>똑바로</b> 날게 해요</p><p class="ls-easy">🧒 쉬운 말 · 공기 저항 = 공기가 움직임을 막는 힘</p>',
                  note: '날개가 너무 무겁거나 크면 오히려 덜 올라갈 수 있어요. 2차시에서 날개 수를 바꿀 것으로 고른 팀이 까닭을 말할 때 연결해 주세요.' },
                // 쏘는 힘(작용 반작용) + 무게(질량) 물음을 하나로 (2026-11-27): 폰은 두 퀴즈를 차례로, 풀이를 열면 둘 다 열림
                { kind: 'why', title: '로켓은 왜 솟고, 무거우면 어떻게 될까요?', key: 'action', mode: 'phone', opens: ['mass'],
                  body: '<p>뒤집어 세운 필름통 → 뚜껑이 열리면 로켓이 <b>위로!</b></p>',
                  ask: '왜 위로 솟을까요? 점토를 붙여 무거우면?',
                  reveal: '<p>물·기체를 아래로 밀면 <b>반작용</b>으로 위로 솟아요. 무거우면(<b>질량</b>이 크면) <b>가속도가 작아져</b> 덜 올라요.</p><p class="ls-easy">🧒 쉬운 말 · 반작용 = 내가 밀면 나도 반대쪽으로 밀리는 것 · 질량 = 물체에 든 양, 무거울수록 커요</p>',
                  revealImg: SVG_ACTION,   // 아래로 밀고 위로 솟는 화살표 = 답 → 풀이 뒤에
                  note: '폰은 ‘작용 반작용’ → ‘질량과 가속도’ 퀴즈(팀 점수)를 차례로 풀어요. “공기가 빨아올린다”는 생각이 흔해요. 다 푼 뒤 풀이를 여세요.' },
                { kind: 'safety', title: '발사 전에 꼭 지켜요',
                  body: '<ul><li>🥽 <b>보안경</b>을 써요</li><li>🙅 로켓 <b>위로 얼굴</b>을 대지 않아요</li><li>🏃 세우고 <b>바로 물러나요</b></li><li>✋ 안 날면 <b>선생님</b>을 불러요</li></ul>',
                  note: '안 날아간 로켓에는 다가가지 않게 해 주세요.' },
                { kind: 'ask', title: '우리 팀 실험 계획 🔮', key: 'plan-t2', mode: 'phone',
                  body: '<p>바꿀 것 <b>하나</b>만 고르고 나머지는 똑같이 🔒</p><p class="ls-aside">몸체 무게(점토) · 물의 양 · 발포비타민 양 · 날개 수</p>',
                  ask: '① → ② 로 바꾸면 로켓이 높아질까요, 낮아질까요? 왜?',
                  note: '폰은 ‘무엇을 바꿔 볼까요?’(바꿀 것 하나 · ① → ② · 🔮 예측 · 까닭)예요. 정답이 없는 예측이에요 — 프로젝터에 모인 높아질·낮아질·비슷과 까닭을 두세 팀 말하게 해 보세요. 쏠 때는 예측을 다시 묻지 않아요.' },
                // 📱 측정 장: 2차시 발사·촬영·세 곳 누르기 — '이렇게 찍고 재요'와 '%로 재는 까닭'을 그림 흐름으로 이 장 안에
                { kind: 'how', title: '📱 이제 폰으로 쏘아요', key: 'do-t2', mode: 'phone',
                  body: HOW_T2[HOW_V] || HOW_T2.a,
                  note: '이 장을 띄워 둔 동안 팀 폰이 2차시 측정 화면이 돼요. 자를 들고 하늘까지 잴 수 없으니, 같은 장면·같은 거리에 있는 아이 키를 기준으로 견줘요. 아이 키(cm)는 폰에만 남고 선생님께는 %만 와요. 찍는 중인 팀은 장을 넘겨도 그 측정을 마친 뒤 바뀌어요.' },
                { kind: 'how', title: '🎯 도전: 딱 아이 키만큼!', key: 'ch-t2', mode: 'phone',
                  body: '<p>우리 <b>결과 표</b>를 보고 조건을 골라 <b>아이 키만큼</b> 쏘아 올려요.</p>',
                  ask: '목표보다 높이 올랐다면, 다음에는 무엇을 바꿔 볼까요?',
                  note: '목표 %·허용 오차는 팝업 ‘🔧 선생님용’의 예비 실험 값에서 정해요. 힘·가속도 개념으로 까닭을 말하게 해 주세요.' }
            ],
            // 4 정리
            end: [
                { kind: 'ask', title: '처음 생각, 지금 생각', key: 'end-think', mode: 'phone',
                  body: '<p>폰에서 처음에 골랐던 세 문제(힘·가속도·압력)를 <b>다시 풀어</b> 봐요.</p>',
                  ask: '오늘 실험을 하고 나서 생각이 바뀐 말이 있나요? 무엇 때문에 바뀌었나요?',
                  reveal: '<ul><li><b>힘</b> = 모양·운동 상태를 바꾸는 원인</li><li><b>가속도</b> = 속도가 변하는 정도</li><li><b>압력</b> = 일정한 넓이에 작용하는 힘</li></ul><p>바뀌어 맞게 된 생각에 ✨</p>',
                  note: '폰에서 다시 풀기를 마친 뒤 풀이를 보여 주세요(다시 풀기는 팀 점수). 풀이를 열면 가족 폰에도 처음 생각 → 지금 생각 비교와 세 개념 정의가 나와요.' },
                { kind: 'ask', title: '무엇이 결과를 바꿨나요?', key: 'end-cause', mode: 'phone',
                  body: '<p>우리 팀 <b>결과 비교 표</b>를 다시 봐요.</p>',
                  ask: '“○○를 바꿨더니 □□가 달라졌다. 왜냐하면 ….” 문장으로 말해 볼까요?',
                  reveal: '<p>예) “물을 <b>따뜻하게</b> 했더니 <b>더 빨리</b> 열렸다. 왜냐하면 기체가 빨리 쌓였기 때문이다.”</p><p>하나만 바꿔서 <b>원인</b>을 말할 수 있어요.</p>',
                  note: '폰 ‘✍️ 우리 팀 정리 문장’ 화면에서 결과(짧아졌어요·길어졌어요…)와 까닭을 고르게 한 뒤 넘기세요. 교사 결과판 💬 생각 열에 팀마다 모여요. 원인(바꾼 것) → 결과(잰 것) → 까닭(개념) 순서로 두세 팀 발표.' },
                { kind: 'how', title: '오늘의 결과 카드',
                  body: '<ol><li>폰에서 <b>결과 카드</b>를 만들어 저장해요 🖼</li><li>팀 점수 ⭐ 와 핵심 개념을 확인해요</li><li>필름통을 정리하고 바닥의 물을 닦아요</li></ol>',
                  note: '결과 카드에는 팀 점수와 오늘 배운 세 개념(힘·가속도·압력)이 함께 나와요. 사용한 발포비타민은 모아 버려 주세요.' }
            ]
        }
    });
})();
