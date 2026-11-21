// 탄소 양자점 수업 설명 장(js/lesson-content/qdot.js)의 내용 검사 — 모양 검사는 공통 시험 tests/lesson-content.test.cjs 가 함
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STEPS = ['purpose', 'theory', 'materials', 'procedure', 'data', 'result', 'conclusion'];
const plain = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('양자점 설명 장: 7단계 4~8장 · 물음 먼저 · 변인 통제 · 개념 풀이 · 하는 방법', () => {
    const { key, lesson } = require('../js/lesson-content/qdot.js');
    assert.equal(key, 'qdot');
    assert.deepEqual(Object.keys(lesson.stages), STEPS, '7단계 키 그대로(가설연역은 같은 키를 묶어 씀)');
    const kinds = new Set();
    for (const st of STEPS) {
        const cards = lesson.stages[st];
        assert.ok(cards.length >= 4 && cards.length <= 8, st + ' 장 수 ' + cards.length);
        cards.forEach((c, i) => {
            kinds.add(c.kind);
            // 4K 한 장에 한 가지: 본문은 짧게
            assert.ok(plain(c.body).length <= 360, st + (i + 1) + ' 본문 ' + plain(c.body).length + '자');
            assert.doesNotMatch([c.body, c.reveal].join(' '), /https?:\/\/|<table/i, st + (i + 1) + ' 외부 주소·표 없음(그리는 틀에 표 모양이 없음)');
            if (c.img) assert.ok(fs.existsSync(path.join(__dirname, '..', c.img.replace(/^\//, ''))), st + (i + 1) + ' 그림 파일');
        });
    }
    // 넣을 설명 네 가지(변인 통제·왜 하는지·개념 풀이·하는 방법) + 안전
    ['vars', 'why', 'concept', 'how', 'safety'].forEach(k => assert.ok(kinds.has(k), k + ' 장이 있음'));
    // 1 목적 첫 장 = 물음(답보다 먼저)
    const first = lesson.stages.purpose[0];
    assert.equal(first.kind, 'ask');
    assert.match(first.ask, /무엇이 다른가요\? 왜/);
    // 변인 통제: 가열 시간·재료 비율 실험 각각, '두 가지가 함께 바뀌면?' 물음 → 풀이
    const vars = lesson.stages.procedure.filter(c => c.kind === 'vars');
    assert.equal(vars.length, 2);
    assert.match(vars[0].vars.change, /가열 시간/); assert.match(vars[1].vars.change, /요소/);
    vars.forEach(v => { assert.ok(v.vars.predict); ['희석', '빛', '노출'].forEach(w => assert.ok(v.vars.keep.some(k => k.includes(w)), w)); });
    assert.ok(lesson.stages.procedure.some(c => /두 가지가 함께/.test(c.title) && c.ask && c.reveal));
    // 개념 풀이: 2 이론과 같은 말
    const theory = lesson.stages.theory.map(c => plain(c.body + ' ' + (c.reveal || ''))).join(' ');
    ['양자', '띠 틈', '1240', '스토크스', '노출'].forEach(w => assert.match(theory, new RegExp(w)));
    assert.match(lesson.stages.data.map(c => plain(c.body)).join(' '), /반치폭/);
    assert.match(lesson.stages.result.map(c => plain(c.body + c.reveal)).join(' '), /보정 밝기/);
});

// 답 가리기 약속: 장의 key = 학생 화면 data-lesson-answer (설명 화면을 쓴 수업은 교사가 그 장 풀이를 열 때까지 js/class-share.js 가 가림)
// 2026-11-21 합동 가상 수업 2차 뒤: 띠 틈 장 나누기 · 식마다 '말로 한 줄' · 답이 보이는 물음 바꾸기
test('양자점 설명 장: 띠 틈 두 장(낱말 둘씩·계단 물음 먼저) · 이론 식마다 말로 한 줄 · 화면에 답이 있는 물음 바꿈', () => {
    const { lesson } = require('../js/lesson-content/qdot.js');
    const th = lesson.stages.theory;
    const a = th.findIndex(c => /원자가띠/.test(c.title)), b = th.findIndex(c => /띠 틈/.test(c.title) && /광자/.test(c.title));
    assert.ok(a >= 0 && b === a + 1, '원자가띠·전도띠 장 다음에 띠 틈·광자 장');
    assert.equal(th[a].kind, 'ask'); assert.match(th[a].body + th[a].ask, /계단|층/, '아는 장면으로 먼저 묻기');
    const words = ['원자가띠', '전도띠', '띠 틈', '광자'];
    [th[a], th[b]].forEach(c => assert.ok(words.filter(w => new RegExp('<b>' + w).test(c.body)).length <= 2, c.title + ': 새 낱말 둘까지'));
    assert.match(th[a].body, /<b>원자가띠<\/b>/); assert.match(th[a].body, /<b>전도띠<\/b>/);
    assert.match(th[b].body, /<b>띠 틈<\/b>/); assert.match(th[b].body, /<b>광자<\/b>/);
    // 식(<p class="formula">)마다 바로 뒤에 '💬 말로' 한 줄
    let n = 0;
    for (const st of Object.keys(lesson.stages)) lesson.stages[st].forEach(c => [c.body, c.reveal].forEach(h => {
        const parts = String(h || '').split('<p class="formula">').slice(1);
        parts.forEach(p => { n++; assert.match(p.split('</p>')[1] || '', /^\s*<p>💬 말로/, st + ' ' + c.title + ': 식 다음 말로 한 줄'); });
    }));
    assert.ok(n >= 5, '식 ' + n + '개');
    th.forEach(c => assert.doesNotMatch([c.body, c.reveal].join(' '), /<b>E\s*[=∝≈]/, c.title + ': 이론 식은 formula 모양으로'));
    // '띠 틈이 클수록 → 파장이 짧다' 는 qd-energy 풀이에서 (앞 장이 답을 미리 주지 않음)
    assert.match(th.find(c => c.key === 'qd-energy').reveal, /에너지 틈이 클수록 → 나오는 빛의 파장이 짧아요/);
    assert.doesNotMatch(th[b].body, /짧|길/, '띠 틈 장은 방향을 말하지 않음');
    // 학생 화면에 답이 보이는 물음은 바꿈: 준비물 목록의 '간이 분광기', 변인 카드 제목 '바꿀 것은 하나만'
    const m2 = lesson.stages.materials.find(c => /사진만으로는/.test(c.title));
    assert.doesNotMatch(m2.ask, /무엇이 필요할까/); assert.match(m2.ask, /왜/);
    const p0 = lesson.stages.procedure[0];
    assert.doesNotMatch(p0.ask, /바꿀 것 하나/); assert.match(p0.ask, /무슨 일이/);
    // 이론은 8장까지 (한계 장은 6 결과의 문헌 장 앞으로)
    assert.ok(th.length <= 8);
    const res = lesson.stages.result, li = res.findIndex(c => /한계/.test(c.title));
    assert.ok(li >= 0 && res[li + 1].key === 'qd-heat-dir', '한계 → 문헌 장');
});

test('양자점 설명 장: 답 가리기 key ↔ 학생 화면 data-lesson-answer, 가열 시간 방향은 결과 뒤로', () => {
    const { lesson } = require('../js/lesson-content/qdot.js');
    const html = fs.readFileSync(path.join(__dirname, '..', 'projects', 'quantum-dot.html'), 'utf8');
    const pageKeys = new Set([...html.matchAll(/data-lesson-answer="([a-z0-9-]+)"/g)].map(m => m[1]));
    const slideKeys = new Map();
    for (const st of STEPS) lesson.stages[st].forEach(c => { if (c.key) { assert.match(c.key, /^[a-z0-9-]+$/); assert.ok(c.ask && c.reveal, c.key + ' 은 물음 → 풀이 장'); slideKeys.set(c.key, st); } });
    assert.deepEqual([...pageKeys].sort(), [...slideKeys.keys()].sort(), '학생 화면 가림 표시와 장의 key 가 짝');
    // 가열 시간에 따른 색의 방향은 예상(4 과정) 뒤, 결과(6)에서
    assert.equal(slideKeys.get('qd-heat-dir'), 'result');
    for (const st of ['purpose', 'theory', 'materials', 'procedure', 'data'])
        lesson.stages[st].forEach(c => assert.doesNotMatch(plain([c.body, c.reveal, c.ask].join(' ')), /초록 쪽|파란 형광/, st + ' ' + c.title + ': 방향을 미리 주지 않음'));
    // 가린 자리의 data-lesson-stage = 그 key 장이 있는 단계 (가린 자리 글 '🔒 ○ 단계 설명 뒤에 열려요')
    for (const m of html.matchAll(/data-lesson-answer="([a-z0-9-]+)"(?: data-lesson-stage="([a-z]+)")?/g)) assert.equal(m[2], slideKeys.get(m[1]), m[1] + ' 의 data-lesson-stage');
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'quantum-dot.css'), 'utf8');
    new Set(slideKeys.values()).forEach(st => { assert.ok(css.includes('[data-lesson-stage="' + st + '"].cs-ans-hide::after'), st + ' 가림 문구'); assert.ok(css.includes('html.flow-hd [data-lesson-answer][data-lesson-stage="' + st + '"]'), st + ' 가설연역 가림 문구'); });
    // 1 목적의 접힌 '실험 목적' 글도 가림 (purpose 의 '무엇을 재야 할까?' 답)
    assert.equal(slideKeys.get('qd-measure'), 'purpose');
    assert.match(html, /<h2>1\. 실험 목적<\/h2>\s*<ol class="text-list" data-lesson-answer="qd-measure"/);
    const heat = /<li data-lesson-answer="qd-heat-dir" data-lesson-stage="result"><b>가열이 길어지면/.test(html);
    assert.ok(heat, '학생 화면 2-4 의 가열 시간 경향도 가림 대상');
    // 증거가 예상·주장과 반대라면 → 풀이
    assert.ok(lesson.stages.conclusion.some(c => /반대/.test(c.title) && c.ask && /증거/.test(plain(c.reveal))));
});

// 🎬 발표 보기(교사 화면)에서 40장을 풀이까지 모두 그려 4K 배율 100·150·200% 에서 넘치지 않고 글자가 너무 작아지지 않는지
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
test('양자점 설명 장: 4K(3840×2160 배율 100·150·200%) 넘침 없음 · 글자 줄임 없음에 가까움', { skip: !chromium && 'playwright 없음', timeout: 180000 }, async () => {
    const http = require('node:http');
    const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
    const REPO = path.join(__dirname, '..');
    const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg viewBox=\\"0 0 10 10\\"></svg>"}}};';
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d); });
    });
    await new Promise(r => api.listen(0, r)); await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec', ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch();
    try {
        const q = await app.post({ action: 'createClass', ban: 2, nStudents: 4, groupSize: 2, exp: 'qdot', stage: 1 });
        const c = await browser.newContext({ viewport: { width: 3840, height: 2160 } });
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(r.request().url()) ? QR : '' }));
        await c.route(/gstatic/, r => r.abort());
        await c.addInitScript(() => localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })));
        const T = await c.newPage(), errors = [];
        T.on('pageerror', e => errors.push(e.message));
        await T.goto(ROOT + 'projects/class-teacher.html#class=' + q.space + '&view=present');
        await T.waitForFunction(() => document.querySelector('#presentPane.ls-on .ls-slide'), null, { timeout: 20000 });
        assert.match(await T.textContent('#pSlides .ls-title'), /먼저 보기/, '1 목적 첫 장 = 먼저 보기 물음');
        assert.equal(await T.locator('#pSlides .ls-reveal').count(), 0, '풀이는 아직 없음');
        assert.equal(await T.locator('#pSlides img[src*="qdot-look.svg"]').count(), 1, '현상 그림');
        for (const [w, h] of [[3840, 2160], [2560, 1440], [1920, 1080]]) {
            await T.setViewportSize({ width: w, height: h });
            const r = await T.evaluate(() => {
                const d = LessonContent.get('qdot'), box = document.getElementById('pSlides'), bad = [];
                let n = 0, min = 1;
                Object.keys(d.stages).forEach(k => d.stages[k].forEach((sl, i) => [false, true].forEach(rev => {
                    if (rev && !sl.reveal) return;
                    n++;
                    box.innerHTML = LessonSlides.render(sl, rev, { i, n: d.stages[k].length, stageName: k });
                    const s = LessonSlides.fit(box), el = box.querySelector('.ls-slide');
                    min = Math.min(min, s);
                    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) bad.push(k + (i + 1) + (rev ? '풀이' : '') + ' 넘침');
                    if (s < 0.85) bad.push(k + (i + 1) + (rev ? '풀이' : '') + ' 글자 ' + s + '배로 줄어듦');
                })));
                return { n, min, bad };
            });
            assert.equal(r.n, 62, '40장 + 풀이 22장');
            assert.deepEqual(r.bad, [], w + '×' + h + ' (가장 작은 배율 ' + r.min + ')');
        }
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); api.close(); stat.close();
    }
});
