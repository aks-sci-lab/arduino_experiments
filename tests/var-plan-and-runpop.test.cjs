// 회귀 시험: ① 교사 진행 상황 팝업에서 진행 화면으로 빠지지 않고 목록·마치기·설정 바로 조작 ② 7단계 변인 카드 ① → ② 입력·저장·검사 ③ 모아 보기 [바꿀 값] 표시
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RA = require('../js/report-ai.js');
const G = require('../js/class-teacher-gather.js');

const REPO = path.join(__dirname, '..');

test('교사 진행 상황 팝업: 진행 화면으로 가기 단추 제거 · 목록/마치기/설정 단추 포함', () => {
    const html = fs.readFileSync(path.join(REPO, 'projects/class-teacher.html'), 'utf8');
    const js = fs.readFileSync(path.join(REPO, 'js/class-teacher.js'), 'utf8');
    assert.doesNotMatch(html, /id="btnRunPopGo"/, 'HTML 에 btnRunPopGo 없음');
    assert.doesNotMatch(js, /btnRunPopGo/, 'JS 에 btnRunPopGo 없음');
    for (const id of ['btnRunPopList', 'btnRunPopDone', 'btnRunPopSet', 'btnRunPopClose', 'runPopMsg']) {
        assert.match(html, new RegExp('id="' + id + '"'), 'HTML 에 ' + id);
    }
});

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
