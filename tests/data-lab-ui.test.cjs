// 데이터 가공 실험실 화면 (projects/data-lab.html), Playwright
//  예시 불러오기 → 설정을 바꾸면 최종 값이 바뀜 → 단계 기록 → 기록 모음, 내 CSV 불러오기, 375px 가로 스크롤 없음·단추 44px
const http = require('http'), path = require('path'), fs = require('fs'), os = require('os');
const REPO = path.join(__dirname, '..');
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* 없으면 건너뜀 */ }
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/heart-rate-math.js');

const stat = http.createServer((req, res) => {
    const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    fs.readFile(p, (e, d) => {
        if (e) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'text/plain') + '; charset=utf-8' }); res.end(d);
    });
});

test('데이터 가공 실험실 화면', { skip: !chromium && 'playwright 없음', timeout: 90000 }, async () => {
    await new Promise(r => stat.listen(0, r));
    const url = `http://localhost:${stat.address().port}/projects/data-lab.html`;
    const browser = await chromium.launch();
    try {
        const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', e => errs.push(e.message));
        await page.goto(url);
        const final = async () => Number((await page.textContent('#final')).replace(/[^\d.]/g, ''));
        await page.waitForFunction(() => /\d/.test(document.getElementById('final').textContent));
        // 처음 자료: 선생님 실측 2 (손가락 떨어짐) → 77 ± 3
        assert.equal(await page.inputValue('#src'), 'r5');
        assert.ok(Math.abs(await final() - 77) <= 3, '처음 ' + await final());

        // 0 원천: 영역을 줄이면 잡음 숫자가 바뀜
        const f0 = await page.textContent('#f0');
        await page.fill('#roi', '10');
        await page.dispatchEvent('#roi', 'input');
        assert.match(await page.textContent('#roi-v'), /10%/);
        assert.notEqual(await page.textContent('#f0'), f0);
        await page.fill('[data-note="s0"]', '영역 10% 는 흔들림이 커서 50% 로 하겠다');

        // 2 점검·정제: 자동 자르기 끄면 최종 값이 절반쯤으로 바뀌고, 위 띠가 '기본 설정이면' 을 알려 줌
        await page.click('nav.steps button[data-step="s2"]');
        assert.match(await page.textContent('#p2'), /손가락이 떨어진/);
        await page.uncheck('#autocut');
        await page.waitForFunction(() => Number(document.getElementById('final').textContent) < 50);
        assert.match(await page.textContent('#final-sub'), /기본 설정이면/);
        assert.ok(await page.$eval('.dl-final', el => el.classList.contains('changed')));
        await page.fill('[data-note="s2"]', '자르지 않으면 37회로 틀려서 자동 제안대로 잘랐다');
        await page.check('#autocut');
        await page.waitForFunction(() => Number(document.getElementById('final').textContent) > 70);

        // 5 특징: 최소 간격 1초 → 결과 바뀜, 그래프가 그려짐
        await page.click('nav.steps button[data-step="s5"]');
        await page.selectOption('#gap', '1');
        await page.waitForFunction(() => Number(document.getElementById('final').textContent) < 50);
        assert.match(await page.textContent('#f5'), /봉우리 \d+개/);
        const drawn = await page.$eval('#c5a', cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
        assert.ok(drawn > 500, '그래프 ' + drawn);
        await page.selectOption('#gap', '');

        // 3 변환: 노출 출렁임 예시에서 보정을 끄면 가짜 42회
        await page.selectOption('#src', 'expo');
        await page.waitForFunction(() => Math.abs(Number(document.getElementById('final').textContent) - 72) <= 3);
        await page.click('nav.steps button[data-step="s3"]');
        assert.match(await page.textContent('#f3'), /보정함/);
        await page.selectOption('#expo', 'off');
        await page.waitForFunction(() => Math.abs(Number(document.getElementById('final').textContent) - 42) <= 3);
        await page.selectOption('#expo', 'auto');

        // 아주 어두운 예시: 가공으로 고칠 수 없다는 안내 (그 예시일 때만)
        await page.selectOption('#src', 'dark');
        await page.waitForFunction(() => /다시 재야/.test(document.getElementById('src-note').textContent));
        await page.click('nav.steps button[data-step="s6"]');
        assert.match(await page.textContent('#r6'), /가공으로는 고칠 수 없으니 다시 재야/);
        await page.selectOption('#src', 'expo');
        await page.waitForFunction(() => Math.abs(Number(document.getElementById('final').textContent) - 72) <= 3);
        assert.doesNotMatch(await page.textContent('#r6'), /다시 재야/);

        // 6 결과: 손목 맥박 → 오차, 기록 모음에 단계 기록이 모임
        await page.click('nav.steps button[data-step="s6"]');
        for (const [i, v] of [18, 18, 18, 18].entries()) await page.locator('.w').nth(i).fill(String(v));
        await page.waitForFunction(() => /손목 맥박 72/.test(document.getElementById('w6').textContent));
        assert.match(await page.textContent('#r6'), /정한 심박수: 72/);
        const sheet = await page.textContent('#sheet');
        assert.match(sheet, /자르지 않으면 37회로 틀려서/);
        assert.match(sheet, /영역 10%/);
        assert.match(sheet, /노출 보정 자동/);
        await page.click('#copy');
        await page.waitForFunction(() => document.getElementById('copy-msg').textContent.length > 0);

        // 휴대폰 폭: 가로 스크롤 없음, 단추·고르기 칸 44px 이상
        for (const s of ['s0', 's1', 's2', 's3', 's4', 's5', 's6']) {
            await page.click(`nav.steps button[data-step="${s}"]`);
            const sw = await page.evaluate(() => document.documentElement.scrollWidth);
            assert.ok(sw <= 375, `${s} 가로 ${sw}`);
            const small = await page.$$eval('button, select, input[type=number], input[type=text], label.btn', els => els.filter(e => e.offsetParent && e.getBoundingClientRect().height < 44).map(e => e.id || e.textContent.trim()));
            assert.deepEqual(small, [], s + ' 작은 단추');
        }

        // 새로 열어도 기록·설정이 남음
        await page.reload();
        await page.waitForFunction(() => /\d/.test(document.getElementById('final').textContent));
        assert.equal(await page.inputValue('#src'), 'expo');
        assert.equal(await page.inputValue('[data-note="s2"]'), '자르지 않으면 37회로 틀려서 자동 제안대로 잘랐다');

        // 내 측정 CSV (심박수 페이지 원본 CSV 형식) 불러오기
        const sim = H.simulate({ bpm: 90, dur: 20, seed: 4 });
        const file = path.join(os.tmpdir(), 'data-lab-test.csv');
        fs.writeFileSync(file, H.toCsv(sim, { '실험': '스마트폰 카메라 심박수', locked: false }));
        await page.setInputFiles('#file', file);
        await page.waitForFunction(() => document.getElementById('src').value.startsWith('csv:'));
        await page.waitForFunction(() => Math.abs(Number(document.getElementById('final').textContent) - 90) <= 3);
        assert.match(await page.textContent('#src-note'), /data-lab-test\.csv/);
        // 잘못된 파일은 안내
        fs.writeFileSync(file, 'a,b\n1,2\n');
        await page.setInputFiles('#file', file);
        await page.waitForFunction(() => !document.getElementById('msg').hidden);
        assert.match(await page.textContent('#msg'), /CSV 를 읽지 못했어요/);
        fs.unlinkSync(file);

        assert.deepEqual(errs, []);
    } finally {
        await browser.close();
        stat.close();
    }
});
