const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('메인 화면에 복구한 센서 링크와 말루스 링크를 함께 유지한다', () => {
    const html = read('index.html');
    for (const page of [
        'accelerometer-lab', 'environment-lab', 'light-lab', 'uv-lab',
        'free-fall', 'phone-accelerometer', 'malus-law'
    ]) {
        assert.ok(html.includes(`href="projects/${page}.html"`), page);
    }
    assert.ok(fs.existsSync(path.join(root, 'walk-run-detector', 'index.html')));
});

test('센서 페이지의 로컬 스크립트·스타일·펌웨어 링크가 모두 존재한다', () => {
    for (const page of ['accelerometer-lab', 'environment-lab', 'light-lab', 'uv-lab', 'voc-lab']) {
        const relative = `projects/${page}.html`;
        for (const match of read(relative).matchAll(/\b(?:src|href)="([^"]+)"/g)) {
            const link = match[1];
            if (/^(?:[a-z]+:|\/\/|#)/i.test(link)) continue;
            const resource = decodeURIComponent(link.split(/[?#]/)[0]);
            if (!resource) continue;
            assert.ok(fs.existsSync(path.resolve(root, 'projects', resource)), `${relative}: ${link}`);
        }
    }
});

test('라이브의 캐시 방지·WebAssembly 형식과 테스트 파일 배포 제외를 유지한다', () => {
    const hosting = JSON.parse(read('firebase.json')).hosting;
    assert.equal(hosting.site, 'aks-sci-lab');
    assert.equal(hosting.public, '.');
    for (const source of ['**/*.html', '/', '**/*.js', '**/*.py', '**/*.wasm']) {
        const header = hosting.headers.find(entry => entry.source === source);
        assert.ok(header, source);
        const cache = header.headers.find(entry => entry.key === 'Cache-Control');
        assert.equal(cache.value, source === '**/*.py'
            ? 'no-store, max-age=0' : 'no-cache, max-age=0, must-revalidate');
    }
    assert.ok(hosting.headers.find(entry => entry.source === '**/*.wasm').headers
        .some(entry => entry.key === 'Content-Type' && entry.value === 'application/wasm'));
    for (const ignored of [
        'firestore.rules', '**/.*', '**/.*/**', '**/node_modules/**', '**/*.txt',
        'tests/**', 'tools/**', 'vendor/**/*.c', 'vendor/**/*.h', '**/__pycache__/**', '**/*.pyc'
    ]) assert.ok(hosting.ignore.includes(ignored), ignored);
});
