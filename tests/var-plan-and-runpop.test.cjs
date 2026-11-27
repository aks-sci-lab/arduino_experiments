// 회귀 시험: ② 7단계 변인 카드 ① → ② 읽기·쓰기·검사(예전 저장 포함) ③ 모아 보기 [바꿀 값] 표시·esc — 계산·그리기 함수 단위 시험
// 화면으로 하는 확인은 다른 시험이 맡음(2026-11-27 글자 확인을 옮김):
//  ① 진행 상황 팝업: '진행 화면으로 가기' 없음·✅ 수업 마치기·⚙ 설정·수업 목록을 실제로 눌러 봄 → tests/class-runpop-layout-ui.test.cjs, tests/class-present-first-ui.test.cjs
//  ② 변인 카드 화면: ①=② 이면 경고·다음 단계 막힘, 다르면 열림, 저장 → 새로고침해도 그대로 → tests/vars-gate-ui.test.cjs
//  ①→② 로켓: 같은 값이면 [다음] 꺼짐·② 로 재러 가기 → tests/film-rocket-scaffold2-ui.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const RA = require('../js/report-ai.js');
const G = require('../js/class-teacher-gather.js');


test('7단계 변인 카드: ① → ② 파싱·직렬화·varsReady 검사 (예전 저장 하위 호환)', () => {
    const cfg = {
        vars: [{ key: 'heat', name: '가열 시간' }, { key: 'water', name: '물의 양' }],
        choose: ['heat'],
        measure: '봉우리 파장',
        predict: [{ key: 'up', label: '길어진다' }, { key: 'down', label: '짧아진다' }]
    };
    // ①·② 없으면 통과 못 함, 같아도 통과 못 함, 서로 달라야 통과
    assert.equal(RA.varsReady({ change: 'heat', predict: 'up', val1: '', val2: '' }), false);
    assert.equal(RA.varsReady({ change: 'heat', predict: 'up', val1: '60초', val2: '' }), false);
    assert.equal(RA.varsReady({ change: 'heat', predict: 'up', val1: '60초', val2: '60초' }), false);
    assert.equal(RA.varsReady({ change: 'heat', predict: 'up', val1: '60초', val2: '180초' }), true);

    const text = RA.serializeVars({ change: 'heat', val1: '60초', val2: '180초', predict: 'up', reason: '커져서' }, cfg);
    assert.match(text, /^\[바꿀 것\] 가열 시간\n\[바꿀 값\] 60초 → 180초\n\[재는 것\] 봉우리 파장\n\[같게 둘 것\] 물의 양\n\[예상\] 길어진다\n\[까닭\] 커져서$/);

    const parsed = RA.parseVars(text, cfg);
    assert.equal(parsed.change, 'heat');
    assert.equal(parsed.val1, '60초');
    assert.equal(parsed.val2, '180초');
    assert.equal(parsed.predict, 'up');

    // [바꿀 값] 없는 예전 보고서도 안전하게 파싱
    const legacy = RA.parseVars('[바꿀 것] 가열 시간\n[예상] 길어진다', cfg);
    assert.equal(legacy.change, 'heat');
    assert.equal(legacy.val1, '');
    assert.equal(legacy.val2, '');
    assert.equal(legacy.predict, 'up');
});

test('모아 보기: [바꿀 값] 있으면 조 옆에 표시하고, esc 처리', () => {
    const status = { groups: [{ jo: 1, code: '1-1-1111' }], submissions: [] };
    const reports = [{
        group: '1-1-1111', jo: 1, updatedAt: '2026-11-23T01:00:00Z',
        sections: { design: '[바꿀 것] 가열 시간\n[바꿀 값] 60초 → <180초>\n[예상] 길어진다' }
    }];
    const g = G.gather(status, reports, 'qdot');
    assert.equal(g.rows[0].plan, '60초 → <180초>');
    const html = G.boardHtml(g, 'predict');
    assert.match(html, /60초 → &lt;180초&gt;/);
    assert.doesNotMatch(html, /<180초>/);
});
