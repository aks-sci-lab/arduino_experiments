// 열평형 실험 + 블루투스 센서 해석 도구 연동 통합 UI 시험 (Playwright, 가짜 저장소)
//  ① ble-explorer 에서 해석 완료된 센서 2종 저장·공용 등록 (하나는 '열평형' 체크, 하나는 '온도 대시보드'만 체크)
//  ② 학생 노트북(로그인 없음, 빈 localStorage)에서 열평형 실험 접속 → 센서 A·B 목록에 '열평형' 체크 센서 + 라즈베리파이 피코 환경 센서 표시 (미체크 센서 제외)
//  ③ 7단계 변인 카드(①→② 게이트) · 시뮬레이션 측정 · 회차 저장 · 6. 결과(중3 기본 표 + 고2 심화 τ·반감기·R²)
//  ④ 가설연역(flow:'hd') 수업 + 교사 발표 보기 프로젝터 슬라이드 4K 넘침 없음 확인
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { loadLabStore, labServer, configJs } = require('./fake-lab-store.cjs');
let chromium = null; try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const REPO = path.join(__dirname, '..');
const CHART_STUB = 'window.Chart = class Chart { constructor(c, cfg) { this.data = (cfg && cfg.data) || { datasets: [] }; this.options = (cfg && cfg.options) || { scales: { y: { title: {} } } }; } update() {} destroy() {} resize() {} };';
const QR = 'window.qrcode=function(){return{addData(){},make(){},createSvgTag(){return "<svg data-fake=1 viewBox=\\"0 0 10 10\\"><rect width=10 height=10 /></svg>"}}};';

test('해석 도구 체크 등록 → 열평형 무선 센서 호출 + 중3 기본/고2 심화 + 가설연역·4K 발표 보기', { skip: !chromium && 'playwright 없음', timeout: 240000 }, async () => {
    const app = loadLabStore(), api = labServer(app);
    const stat = http.createServer((req, res) => {
        const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        fs.readFile(p, (e, d) => {
            if (e) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' });
            res.end(d);
        });
    });
    await new Promise(r => api.listen(0, r));
    await new Promise(r => stat.listen(0, r));
    const API = 'http://127.0.0.1:' + api.address().port + '/exec';
    const ROOT = 'http://127.0.0.1:' + stat.address().port + '/';
    const browser = await chromium.launch(), errors = [];

    const newCtx = async (opt, name, teacher) => {
        const c = await browser.newContext(opt);
        await c.route('**/js/pendulum-config.js', r => r.fulfill({ contentType: 'text/javascript', body: configJs(API, { pollSeconds: 3 }) }));
        await c.route(/cdn\.jsdelivr|cdnjs/, r => {
            const u = r.request().url();
            r.fulfill({ contentType: 'text/javascript', body: /qrcode/.test(u) ? QR : /chart/i.test(u) ? CHART_STUB : '' });
        });
        await c.route(/gstatic/, r => r.abort());
        if (teacher) await c.addInitScript(() => localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })));
        const pg = await c.newPage();
        pg.on('pageerror', e => errors.push(name + ': ' + e.message));
        pg.on('dialog', d => d.accept());
        return pg;
    };

    try {
        // ① 교사: 블루투스 센서 해석 도구에서 완료된 규칙을 이름으로 저장 + '열평형 실험' 체크 → 공용 등록
        const T = await newCtx({ viewport: { width: 1280, height: 900 } }, 'T-exp', true);
        await T.goto(ROOT + 'projects/ble-explorer.html');
        await T.waitForSelector('#bxTabs');
        // 규칙 JSON 불러오기 대신 드래프트로 필드 하나 세팅 후 ④ 저장 탭 조작
        await T.evaluate(() => {
            localStorage.setItem('ble-explorer:draft:v1', JSON.stringify({
                rules: { '00002a6e-0000-1000-8000-00805f9b34fb': [{ name: '온도', offset: 0, format: 'int16le', scale: 0.01, add: 0, unit: '°C', mask: '' }] },
                charService: { '00002a6e-0000-1000-8000-00805f9b34fb': '0000181a-0000-1000-8000-00805f9b34fb' },
                initCommands: [],
                experiments: [],
                meta: { deviceName: 'MyTemp', maker: 'Test', model: 'T1', firmware: '1.0' },
                name: '우리학교 무선 온도계',
                notes: '교실 검증 완료'
            }));
        });
        await T.reload();
        await T.click('#bxTabs button[data-tab="save"]');
        await T.waitForSelector('#ruleExps input[data-exp="thermal"]');
        await T.check('#ruleExps input[data-exp="thermal"]');
        await T.click('#btnPublishRule');
        await T.waitForFunction(() => /수업 공용 도구로 등록했어요/.test(document.getElementById('ruleMsg').textContent), null, { timeout: 15000 });
        assert.match(await T.textContent('#cloudRules'), /우리학교 무선 온도계[\s\S]*열평형 실험/);

        // 다른 센서('대시보드 전용')는 tempdash 만 체크해 공용 등록 → 열평형에서는 안 나와야 함
        await T.fill('#sensorName', '대시보드 전용 온도계');
        await T.uncheck('#ruleExps input[data-exp="thermal"]');
        await T.check('#ruleExps input[data-exp="tempdash"]');
        await T.click('#btnPublishRule');
        await T.waitForFunction(() => /대시보드 전용 온도계/.test(document.getElementById('cloudRules').textContent), null, { timeout: 15000 });

        // ② 학생 노트북(완전히 새 브라우저 컨텍스트, 로그인 없음, 빈 localStorage)에서 열평형 실험 접속
        const S = await newCtx({ viewport: { width: 1366, height: 900 } }, 'Student', false);
        await S.goto(ROOT + 'projects/thermal-equilibrium.html');
        await S.waitForSelector('nav.steps button[data-step="data"]');
        // 4. 과정에서 변인 카드(①→② + 예상) 채워야 5. 데이터로 진행 가능
        await S.click('nav.steps button[data-step="procedure"]');
        await S.waitForSelector('.rai-inline.rai-vc:not([hidden])');
        const vc = S.locator('.rai-inline.rai-vc:not([hidden])').first();
        await vc.locator('input[data-vc="change"]').first().check();
        await vc.locator('input[data-vc="val1"]').fill('100 g : 100 g');
        await vc.locator('input[data-vc="val2"]').fill('50 g : 150 g');
        await vc.locator('input[data-vc="predict"]').first().check();
        await S.click('nav.steps button[data-step="data"]');
        await S.waitForSelector('#selSensorA');
        await S.waitForFunction(() => [...document.querySelectorAll('#selSensorA option')].some(o => /우리학교 무선 온도계/.test(o.textContent)), null, { timeout: 15000 });

        const optsA = await S.$$eval('#selSensorA option', els => els.map(e => e.textContent));
        const optsB = await S.$$eval('#selSensorB option', els => els.map(e => e.textContent));
        assert.deepEqual(optsA, optsB, '센서 A·B 목록이 동일');
        assert.ok(optsA.some(t => /우리학교 무선 온도계/.test(t)), '체크된 해석 완료 센서 표시: ' + optsA);
        assert.ok(optsA.some(t => /라즈베리파이 피코 환경 센서/.test(t)), '라즈베리파이 피코 환경 센서 표시: ' + optsA);
        assert.ok(!optsA.some(t => /대시보드 전용 온도계/.test(t)), '열평형 미체크 센서는 제외: ' + optsA);

        // ③ 시뮬레이션으로 측정(15배속) → 회차 저장 → 6. 결과 중3 기본 표 + 고2 심화 분석 확인
        await S.selectOption('#simSpeed', '15');
        await S.click('#btnSimToggle');
        await S.click('#btnRec');
        await S.waitForFunction(() => Number(document.getElementById('stCount').textContent) >= 8, null, { timeout: 15000 });
        await S.click('#btnSaveRun');
        await S.waitForFunction(() => /1회차/.test(document.getElementById('runsCnt').textContent), null, { timeout: 10000 });

        await S.click('nav.steps button[data-step="result"]');
        await S.waitForSelector('#resTbody tr');
        const resTxt = await S.textContent('#resTbody');
        assert.match(resTxt, /100g : 물 100g/, '중3 기본 결과 표 표시');
        assert.match(resTxt, /42\.50/, '이론 열평형 온도(42.50°C) 계산');
        await S.click('#advPanel summary');
        const advTxt = await S.textContent('#advTbody');
        assert.match(advTxt, /419 \/ 419/, '고2 심화 열용량 표시');

        // ④ 가설연역(flow:'hd') 수업 + 교사 🎬 발표 보기 (4K 3840×2160 넘침 검사)
        const cls = await app.post({ action: 'createClass', ban: 3, nStudents: 4, groupSize: 2, exp: 'thermal', flow: 'hd', stage: 1 });
        await S.goto(ROOT + 'projects/thermal-equilibrium.html?c=' + cls.classCode + '&s=' + cls.space);
        await S.waitForFunction(() => /문제 인식/.test(document.querySelector('nav.steps').textContent), null, { timeout: 15000 });
        assert.match(await S.textContent('nav.steps'), /문제 인식[\s\S]*가설 설정[\s\S]*탐구 설계[\s\S]*탐구 수행[\s\S]*자료 해석[\s\S]*결론 도출/);

        const P = await newCtx({ viewport: { width: 1920, height: 1080 } }, 'T-present', true);
        await P.goto(ROOT + 'projects/class-teacher.html#class=' + cls.space + '&view=present');
        await P.waitForSelector('#presentPane.ls-on #pSlides .ls-slide', { timeout: 15000 });
        assert.match(await P.textContent('#pSlides .ls-title'), /두 물이 만나면/);

        for (const [w, h] of [[3840, 2160], [1920, 1080]]) {
            await P.setViewportSize({ width: w, height: h });
            const bad = await P.evaluate(() => {
                const def = LessonContent.get('thermal'), box = document.getElementById('pSlides'), out = [];
                Object.keys(def.stages).forEach(k => def.stages[k].forEach((sl, i) => {
                    box.innerHTML = LessonSlides.render(sl, true, { i, n: def.stages[k].length, stageName: k });
                    LessonSlides.fit(box);
                    const el = box.querySelector('.ls-slide'), fs = parseFloat(getComputedStyle(el).fontSize);
                    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) out.push(k + i + ' 넘침');
                    if (fs < innerHeight * 0.02) out.push(k + i + ' 글자 ' + fs.toFixed(1) + 'px');
                }));
                return out;
            });
            assert.deepEqual(bad, [], '열평형 슬라이드 ' + w + '×' + h);
        }
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        api.close();
        stat.close();
    }
});
