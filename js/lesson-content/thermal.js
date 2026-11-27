// 열평형 실험(큰 비커 · 작은 비커) — 프로젝터(대형 TV) 수업 설명 장 (js/lesson-slides.js)
// 7단계와 가설연역 6단계(flow 'hd') 모두 자동 지원. 수준: 중3 기본 + [고2 심화] 선택 장
(function (root, factory) {
    var data = factory();
    if (typeof module === 'object' && module.exports) module.exports = data;
    if (root) {
        var LC = root.LessonContent || (root.LessonContent = { _wait: {}, add: function (k, v) { this._wait[k] = v; } });
        LC.add(data.key, data.lesson);
    }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : null, function () {
    'use strict';

    var SVG_BEAKER = '<svg viewBox="0 0 260 190" role="img" aria-label="찬물이 든 큰 비커 안에 뜨거운 물이 든 작은 비커와 두 무선 온도 센서가 들어 있는 그림">' +
        '<rect x="35" y="45" width="190" height="120" rx="10" fill="#e3f2fd" stroke="#1565c0" stroke-width="4"/>' +
        '<rect x="39" y="88" width="182" height="73" rx="6" fill="#bbdefb"/>' +
        '<rect x="85" y="64" width="90" height="92" rx="8" fill="#ffebee" stroke="#c62828" stroke-width="3.5"/>' +
        '<rect x="89" y="96" width="82" height="56" rx="5" fill="#ffcdd2"/>' +
        '<path d="M85 124 L56 124 M64 117 L56 124 L64 131" stroke="#ef6c00" stroke-width="4" fill="none"/>' +
        '<path d="M175 124 L204 124 M196 117 L204 124 L196 131" stroke="#ef6c00" stroke-width="4" fill="none"/>' +
        '<line x1="125" y1="22" x2="125" y2="112" stroke="#c62828" stroke-width="4"/>' +
        '<rect x="100" y="6" width="50" height="20" rx="5" fill="#c62828"/><text x="125" y="20" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">센서 A</text>' +
        '<line x1="205" y1="22" x2="205" y2="112" stroke="#1565c0" stroke-width="4"/>' +
        '<rect x="180" y="6" width="50" height="20" rx="5" fill="#1565c0"/><text x="205" y="20" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">센서 B</text>' +
        '<text x="130" y="182" text-anchor="middle" font-size="13" fill="#455a64">큰 비커(T₂) 안의 작은 비커(T₁)</text></svg>';

    var SVG_CURVE = '<svg viewBox="0 0 260 180" role="img" aria-label="뜨거운 물 온도는 내려오고 찬물 온도는 올라가 한 온도에서 만나는 열평형 곡선">' +
        '<line x1="34" y1="150" x2="246" y2="150" stroke="#455a64" stroke-width="2.5"/>' +
        '<line x1="34" y1="20" x2="34" y2="150" stroke="#455a64" stroke-width="2.5"/>' +
        '<line x1="34" y1="86" x2="242" y2="86" stroke="#2e7d32" stroke-width="2" stroke-dasharray="6 4"/>' +
        '<path d="M36 32 Q95 78 240 85" fill="none" stroke="#c62828" stroke-width="4"/>' +
        '<path d="M36 138 Q95 94 240 87" fill="none" stroke="#1565c0" stroke-width="4"/>' +
        '<text x="58" y="34" font-size="12" font-weight="700" fill="#c62828">뜨거운 물 T₁</text>' +
        '<text x="58" y="142" font-size="12" font-weight="700" fill="#1565c0">찬물 T₂</text>' +
        '<text x="168" y="76" font-size="12" font-weight="700" fill="#2e7d32">열평형 온도</text>' +
        '<text x="234" y="168" text-anchor="end" font-size="12" fill="#455a64">시간 (s)</text></svg>';

    var lesson = {
        title: '열평형 실험 (큰 비커 · 작은 비커)',
        stages: {
            purpose: [
                { kind: 'ask', title: '👀 먼저 보기: 두 물이 만나면?', mode: 'phone',
                    body: '<p>찬물이 담긴 <b>큰 비커</b> 안에 뜨거운 물이 담긴 <b>작은 비커</b>를 넣고, 두 무선 온도 센서로 온도를 동시에 잽니다.</p>',
                    img: SVG_BEAKER,
                    ask: '시간이 지나면 두 물의 온도는 어떻게 변할까요? 만나는 온도는 무엇에 따라 달라질까요?',
                    reveal: '<p>조에서 떠오른 생각을 <b>우리 생각</b> 칸에 한두 줄로 먼저 적어요.</p><ul><li>두 온도는 어디서 만날까? (딱 중간? 한쪽에 치우칠까?)</li><li>처음에는 빠르게 변할까, 일정한 빠르기로 변할까?</li></ul>',
                    note: '정답을 먼저 말하지 말고, 학생 노트북의 "우리 생각" 칸에 적게 한 뒤 두세 조 생각을 들어 보세요.' },
                { kind: 'ask', title: '🎯 오늘 알아낼 것 (중3 기본 · 고2 심화)', key: 'th-purpose',
                    ask: '우리 생각을 확인하려면 이 실험에서 무엇을 재고, 무엇과 비교해야 할까요?',
                    note: '풀이를 열면 학생 노트북 1. 목적의 "🎯 실험 목적 보기"가 열립니다. 두세 조 생각을 들은 뒤 여세요.',
                    reveal: '<ol><li><b>[중3]</b> 온도가 다른 두 물체가 만날 때 <b>열의 이동 방향</b>과 <b>열평형 상태</b> 확인하기</li><li><b>[중3]</b> 질량비·온도 차이를 바꾸며 <b>실측 열평형 온도</b>와 <b>이론값(Q_잃 = Q_얻)</b> 비교하기</li><li><b>[중3~고2]</b> 실측값과 이론값의 차이(<b>열손실</b>)를 데이터로 설명하기</li><li><b>[고2 심화]</b> 비커 <b>열용량 보정</b>, <b>열전달 속도</b>, 온도 차 <b>지수 감쇠(시상수 τ)</b> 분석하기</li></ol>' },
                { kind: 'how', title: '🗺 오늘 수업 순서',
                    body: '<ol><li><b>개념 · 가설</b> — 열평형·열량 보존 정리 → 변인·예상(① → ②) 정하기</li><li><b>실시간 측정 (노트북)</b> — 무선 온도 센서 2대(A 작은 비커 · B 큰 비커) 연결</li><li><b>결과 비교</b> — ① vs ② 회차 열평형 온도·열량·열손실률 비교</li><li><b>결론 · 판정</b> — 데이터를 근거로 가설 판정 및 오차 개선</li></ol>' }
            ],
            theory: [
                { kind: 'ask', title: '🔥 열은 어느 쪽으로 이동할까?', key: 'th-eq',
                    body: '<p>온도가 높은 물체는 <b>입자 운동이 활발</b>하고, 온도가 낮은 물체는 입자 운동이 덜 활발합니다.</p>',
                    img: SVG_BEAKER,
                    ask: '뜨거운 물과 찬물이 비커 벽을 사이에 두고 만나면 에너지는 어느 쪽으로 이동하며, 언제 멈출까요?',
                    reveal: '<p>열은 늘 <b>온도가 높은 곳 → 낮은 곳</b>으로 이동합니다.</p><p>두 물체의 <b>온도가 같아져 더 이상 알짜 열 이동이 없는 상태</b>를 <b>열평형</b>, 그때의 온도를 <b>열평형 온도</b>라고 해요.</p>',
                    note: '중3 핵심 개념. "차가운 기운이 뜨거운 쪽으로 간다"는 오개념을 짚어 주세요.' },
                { kind: 'ask', title: '⚖️ 열량 보존과 이론 열평형 온도', key: 'th-q',
                    body: '<p class="formula">Q = c · m · ΔT</p><p>외부 열손실이 없다면 <b>잃은 열량 = 얻은 열량</b>입니다.</p>',
                    ask: '작은 비커 뜨거운 물 50 g (60 °C)과 큰 비커 찬물 150 g (20 °C)이 만나면, 열평형 온도는 40 °C보다 높을까요, 낮을까요?',
                    reveal: '<p class="formula">T_이론 = (c₁ m₁ T₁,₀ + c₂ m₂ T₂,₀) / (c₁ m₁ + c₂ m₂)</p><p>50×60 + 150×20 을 200으로 나누면 <b>30 °C</b>! 질량이 큰 찬물 쪽에 훨씬 가까워요.</p>',
                    note: '손가락으로 "40 °C보다 높다/같다/낮다"를 먼저 표시하게 한 뒤 풀이를 열어 주세요.' },
                { kind: 'ask', title: '🌡️ 실제 열평형 온도가 이론값보다 낮다면?', key: 'th-loss',
                    body: '<p>실제 교실 실험에서는 <b>실측 열평형 온도</b>가 <b>이론값(T_이론)</b>과 조금 다르게 나오는 경우가 많습니다.</p>',
                    ask: '뜨거운 물이 잃은 열량(Q_잃)이 찬물이 얻은 열량(Q_얻)보다 크게 나왔다면, 사라진 열은 어디로 갔을까요?',
                    reveal: '<ul><li><b>주변 공기</b>로 열이 빠져나감 (특히 바깥쪽 큰 비커가 뜨거울 때 커짐)</li><li><b>유리 비커 자체</b>를 데우는 데 열이 쓰임</li><li>열린 수면에서 물이 <b>증발</b>하며 열을 빼앗김</li></ul>',
                    note: '결론 단계에서 "측정 실수"라고 쓰지 않고 열손실률(%) 숫자와 연결해 설명하도록 안내하세요.' },
                { kind: 'concept', title: '🔬 [고2 심화] 열용량 보정 · 열전달 속도 · 지수 감쇠', key: 'th-adv',
                    body: '<p class="formula">C = c·m,   T_보정 = (C₁T₁,₀ + C₂T₂,₀ + C_비커 T_실온) / (C₁ + C₂ + C_비커)</p>' +
                          '<p class="formula">|T₁(t) − T₂(t)| ≈ ΔT₀ · e^(−t / τ),   t₁/₂ = τ ln 2</p>' +
                          '<ul><li>열전달률은 <b>온도 차(T₁ − T₂)에 비례</b> → 처음엔 빠르고 갈수록 완만</li><li><b>시상수 τ</b>가 작을수록 열평형에 빨리 도달</li></ul>',
                    note: '중3 기본 수업에서는 수업 자료 편집기에서 이 장을 숨기거나 바로 넘어가도 됩니다. 고2 심화 반에서는 6-3 심화 표의 τ·반감기·R²와 연결해 주세요.' }
            ],
            materials: [
                { kind: 'safety', title: '⚠️ 안전 먼저 지켜요',
                    body: '<ul><li>뜨거운 물은 <b>60~75 °C</b> 권장 (펄펄 끓는 물 금지 · 화상·유리 파손 주의)</li><li>뜨거운 비커는 <b>내열 장갑·집게</b>로 쟁반 위에서 이동</li><li><b>무선 센서 본체는 물에 넣지 않기</b> — 탐침(프로브) 끝부분만 담그기</li><li>심화 액체(식용유·에탄올)는 화기 엄금 · 바닥 엎지름 즉시 닦기</li></ul>' },
                { kind: 'why', title: '🧰 준비물과 무선 온도 센서 2대',
                    body: '<ul><li><b>큰 비커</b>(400~500 mL) · <b>작은 비커</b>(100~200 mL)</li><li><b>무선 온도 센서 2대</b>: 센서 A(작은 비커) · 센서 B(큰 비커)</li><li>센서 목록: 해석 도구에서 등록한 무선 센서 + <b>라즈베리파이 피코 환경 센서</b></li><li>눈금실린더·전자저울, 노트북(크롬·엣지)</li></ul>',
                    note: '무선 센서 2대의 이름을 미리 스티커로 표시(A·B)해 두면 학생 노트북에서 헷갈리지 않고 바로 연결할 수 있어요.' }
            ],
            procedure: [
                { kind: 'vars', title: '⚖️ 우리 조 변인 통제 (① → ②)', mode: 'phone',
                    vars: {
                        change: '하나만: 물의 질량비 · 처음 온도 차 · 뜨거운 물 위치(안/밖) · [심화] 비커 재질/단열 · 액체 종류',
                        keep: ['고르지 않은 나머지 조건', '센서 담그는 깊이 (바닥·벽에 닿지 않게)', '기록 간격 (예: 1초)'],
                        measure: '작은 비커 온도 T₁(t), 큰 비커 온도 T₂(t), 열평형 온도 및 도달 시간',
                        predict: '① 조건에서 ② 조건으로 바꾸면 열평형 온도나 도달 시간은 어떻게 달라질까요?'
                    },
                    note: '노트북 4. 과정의 변인 카드에서 바꿀 것 하나와 ①→② 값, 예상을 먼저 정해야 5. 데이터로 넘어갑니다.' },
                { kind: 'how', title: '🛠 노트북에서 무선 센서 2대로 재기',
                    body: '<ol><li><b>5-1 조건</b>: 작은 비커·큰 비커 액체와 질량(g) 입력</li><li><b>5-2 연결</b>: 🔴 센서 A(작은 비커) · 🔵 센서 B(큰 비커) 각각 선택 후 블루투스 연결</li><li>큰 비커에 물을 붓고, 작은 비커를 안에 넣은 뒤 탐침 2개 담그기</li><li><b>▶ 측정 시작</b> → 두 곡선이 만나 <b>⚖️ 열평형 도달</b> 확인 → <b>💾 이 회차 저장</b></li><li>정해 둔 <b>② 조건</b>으로 한 번 더 측정해 저장!</li></ol>' }
            ],
            data: [
                { kind: 'ask', title: '📈 실시간 그래프 읽기',
                    body: '<p>두 온도 곡선(빨강 T₁, 파랑 T₂)이 실시간으로 그려지며, 초록 점선으로 <b>이론 열평형 온도</b>가 표시됩니다.</p>',
                    img: SVG_CURVE,
                    ask: '그래프의 처음 기울기(가파름)와 뒤쪽 기울기(완만함)는 왜 다를까요?',
                    reveal: '<p>처음에는 두 물의 <b>온도 차가 커서</b> 열이 빠르게 이동하고, 시간이 지나 온도 차가 줄어들수록 <b>열이동 속도가 느려져</b> 곡선이 완만해집니다.</p>',
                    note: '센서 두 대의 초기 온도가 안정된 직후 ▶ 측정 시작을 누르게 안내하세요.' }
            ],
            result: [
                { kind: 'ask', title: '📊 실측 열평형 vs 이론 열평형 비교',
                    body: '<p>6-1 표에서 우리 조의 <b>① 조건</b>과 <b>② 조건</b> 결과를 나란히 비교해 봅니다.</p>',
                    ask: '질량비(또는 변인)를 바꿨을 때 열평형 온도는 예상대로 변했나요? Q_잃과 Q_얻의 차이(열손실률)는 얼마인가요?',
                    reveal: '<p>실측값과 이론값 차이를 <b>열손실률(%)</b>과 함께 숫자로 읽고, 6-2 겹쳐 보기 그래프에서 두 회차의 모양 차이를 확인합니다.</p>' },
                { kind: 'ask', title: '↕ 차이가 흔들림보다 큰가?', key: 'th-spread',
                    body: '<p>같은 조건으로 두 번 재도 값이 조금씩 달라요.</p>',
                    ask: '①과 ②의 차이가 반복할 때 흔들린 만큼보다 작다면, 조건 때문에 달라졌다고 말할 수 있을까요?',
                    reveal: '<p>차이가 흔들림보다 작으면 <b>아직 말할 수 없어요</b>. 6-1 아래 ↕ 반복 범위를 보고, 반복이 없으면 같은 조건으로 한 번 더 재요.</p>',
                    note: '조마다 "차이"와 "흔들림" 두 숫자를 먼저 말하게 한 뒤 풀이를 여세요. 특히 뚜껑·재질처럼 차이가 작은 조건을 고른 조.' },
                { kind: 'concept', title: '🔬 [고2 심화] 시상수 τ · 반감기 · 비커 보정 해석',
                    body: '<ul><li>6-3 <b>🔬 고2 심화 분석</b>을 펼치면 초기 기울기(°C/min), 지수 감쇠 <b>시상수 τ(초)</b>, <b>반감기 t₁/₂(초)</b>, <b>R²</b>가 자동 계산됩니다.</li><li>유리 비커 vs 금속 컵, 열림 vs 뚜껑 조건의 τ를 비교하면 <b>열전달 속도</b> 차이를 정량적으로 말할 수 있습니다.</li></ul>',
                    note: '중3 수업에서는 이 장을 생략해도 됩니다.' }
            ],
            conclusion: [
                { kind: 'how', title: '✍️ 결론 · 가설 판정 쓰기',
                    body: '<ol><li><b>주장(가설 판정)</b> — 처음 예상/가설이 지지되었는지, 기각되었는지 분명하게</li><li><b>증거(숫자)</b> — ①·② 회차의 열평형 온도, 이론값, Q_잃·Q_얻, 열손실률(심화: τ·dT/dt)을 인용</li><li><b>추론 · 오차 개선</b> — 열손실의 원인을 데이터와 연결하고, 줄이는 방법을 구체적으로 제안</li></ol>' }
            ]
        }
    };

    return { key: 'thermal', lesson: lesson };
});
