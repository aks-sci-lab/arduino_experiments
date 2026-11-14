const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PageQR = require('../js/page-qr.js');

test('QR 주소는 # 뒤를 빼고 학생 화면 주소로 바꾼다', () => {
    const base = 'https://aks-sci-lab.web.app';
    assert.equal(PageQR.shareUrl(base + '/'), base + '/');
    assert.equal(PageQR.shareUrl(base + '/projects/planck-led.html#tab-data'), base + '/projects/planck-led.html');
    assert.equal(PageQR.shareUrl(base + '/projects/custom-lab.html?id=abc'), base + '/projects/custom-lab.html?id=abc');
    // 선생님 고치기 화면 → 같은 실험의 학생 화면
    assert.equal(PageQR.shareUrl(base + '/projects/custom-lab.html?edit=abc'), base + '/projects/custom-lab.html?id=abc');
    assert.equal(PageQR.shareUrl(base + '/projects/custom-lab.html?edit=new'), base + '/projects/custom-lab.html');
    // 개인 기록·보고서 주소는 나눠 주지 않는다
    assert.equal(PageQR.shareUrl(base + '/projects/custom-lab.html?record=r1'), base + '/projects/custom-lab.html');
    assert.equal(PageQR.shareUrl(base + '/projects/ideal-gas.html?report=r2'), base + '/projects/ideal-gas.html');
});

test('QR 도구는 버전을 고정한 jsdelivr 주소에서 불러온다', () => {
    assert.match(PageQR.LIB_URL, /^https:\/\/cdn\.jsdelivr\.net\/npm\/qrcode-generator@\d+\.\d+\.\d+\//);
});

test('메인과 실험 페이지에 QR 단추 스크립트가 들어 있다', () => {
    const root = path.join(__dirname, '..');
    const pages = ['index.html', 'walk-run-detector/index.html',
        ...fs.readdirSync(path.join(root, 'projects'))
            .filter(name => name.endsWith('.html') && !['figure-maker.html', 'board-setup.html'].includes(name))
            .map(name => 'projects/' + name)];
    for (const page of pages) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        assert.match(html, /<script src="(\.\.\/)?js\/page-qr\.js[^"]*"><\/script>/, page);
    }
});
