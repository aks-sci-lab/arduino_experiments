// 2차 PR 회귀 시험: 로켓(날개·앞코 장, WakeLock, 영상 확인 표시, 기본 브라우저 안내) · 양자점(시감도 안내, 몰비 노트, AI expGuide) · 메인 24인치/명암비/중첩/XSS
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RA = require('../js/report-ai.js');

const ROOT = path.join(__dirname, '..');

test('로켓: 2차시 날개·앞코 설명 장, WakeLock, 영상 확인 피드백, 기본 브라우저 안내', () => {
    const rocketSlides = fs.readFileSync(path.join(ROOT, 'js/lesson-content/rocket.js'), 'utf8');
    assert.match(rocketSlides, /날개와 앞코는 왜 달까요/);
    assert.match(rocketSlides, /공기 저항/);

    const rocketJs = fs.readFileSync(path.join(ROOT, 'js/film-rocket.js'), 'utf8');
    assert.match(rocketJs, /navigator\.wakeLock\.request\('screen'\)/);
    assert.match(rocketJs, /영상 끝까지 확인했어요/);
    assert.match(rocketJs, /일반 탭/);
});

test('양자점: 시감도 색 편향 안내, 몰비 교사용 노트, ReportAI qdot 전용 안내 및 temperature 통일', () => {
    const qdHtml = fs.readFileSync(path.join(ROOT, 'projects/quantum-dot.html'), 'utf8');
    assert.match(qdHtml, /초록 가중치가 파랑보다 약 10배/);

    const qdSlides = fs.readFileSync(path.join(ROOT, 'js/lesson-content/qdot.js'), 'utf8');
    assert.match(qdSlides, /몰비로는 약 1 : 3\.2/);
    assert.match(qdSlides, /초록 가중치가 파랑의 약 10배/);

    const p = RA.buildPrompt({ exp: 'qdot', section: 'conclusion', prompt: '결론 검토해 줘', attach: [] }, '탄소 양자점 형광');
    assert.match(p.system, /알갱이 크기를 직접 재지 않았으므로/);
    assert.match(p.system, /측정 사실이 아니라 가설/);
    assert.equal(JSON.parse(RA.chatRequest('claude', 'claude-sonnet-5-5', 'k', 'S', 'U').init.body).temperature, 0.4);
    assert.equal(JSON.parse(RA.chatRequest('gpt', 'gpt-6-luna', 'k', 'S', 'U').init.body).temperature, 0.4);
});

test('메인 화면: 24인치 5칸 2줄, 명암비, <main> 중첩 수정, escapeHtml 적용', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /@media \(min-width: 1700px\)[\s\S]{0,160}grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
    assert.match(html, /\.btn-google\s*\{\s*background-color:\s*var\(--c-primary\)/);
    assert.match(html, /<\/div><!-- \/homeLabs -->\s*<\/main>\s*<\/div>/);
    assert.match(html, /escapeHtml\(currentUser\.displayName \|\| currentUser\.email\)/);
    assert.match(html, /escapeHtml\(e\.message\)/);
    assert.doesNotMatch(html, /userInfo\.innerHTML = `👤 \$\{currentUser\.displayName/);
});
