// LED 플랑크 상수 Apps Script 웹앱(apps-script/planck-led/) 만들기 도구
//  1) js/planck-math.js(사이트의 플랑크 상수 계산) → apps-script/planck-led/PlanckMath.html
//     Apps Script 웹앱은 사이트의 js 파일을 불러올 수 없어 같은 내용을 <script> 로 감싼 HTML 파일로 둔다.
//  2) 폴더 전체 → apps-script/planck-led-appsscript.zip (선생님이 내려받아 쓰는 묶음, 파일 이름 = Apps Script 편집기 파일 이름)
// planck-led 폴더의 파일이나 js/planck-math.js 를 고치면:  node tools/build-planck-apps-script.cjs
// (시험이 두 결과물이 최신인지 확인함. ZIP 은 날짜를 고정해 같은 내용이면 늘 같은 바이트가 나온다)
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const DIR = path.join(root, 'apps-script', 'planck-led');
const ZIP = path.join(root, 'apps-script', 'planck-led-appsscript.zip');
const ZIP_FOLDER = 'planck-led-appsscript/';
// ZIP 에 넣는 파일 (순서 = 붙여 넣는 순서)
const ZIP_FILES = ['README.md', '보고서.md', 'Code.gs', 'Index.html', 'Teacher.html', 'Common.html', 'PlanckMath.html', 'appsscript.json'];

function build() {
    const src = fs.readFileSync(path.join(root, 'js', 'planck-math.js'), 'utf8');
    return '<!-- 자동 생성 파일: 고치지 말고 사이트의 js/planck-math.js 를 고친 뒤\n' +
        '     node tools/build-planck-apps-script.cjs 를 실행하세요. (window.PlanckMath) -->\n' +
        '<script>\n' + src.replace(/\s*$/, '\n') + '</script>\n';
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

// 간단한 ZIP 만들기 (deflate, 한글 파일 이름은 UTF-8 표시, 날짜 2026-01-01 고정)
function makeZip(entries) {
    const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
    const locals = [], centrals = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBuf = Buffer.from(name, 'utf8');
        const comp = zlib.deflateRawSync(data, { level: 9 });
        const crc = crc32(data);
        const head = Buffer.alloc(30);
        head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
        head.writeUInt16LE(DOS_TIME, 10); head.writeUInt16LE(DOS_DATE, 12); head.writeUInt32LE(crc, 14);
        head.writeUInt32LE(comp.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
        locals.push(head, nameBuf, comp);
        const cen = Buffer.alloc(46);
        cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
        cen.writeUInt16LE(DOS_TIME, 12); cen.writeUInt16LE(DOS_DATE, 14); cen.writeUInt32LE(crc, 16);
        cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nameBuf.length, 28);
        cen.writeUInt32LE(offset, 42);
        centrals.push(cen, nameBuf);
        offset += 30 + nameBuf.length + comp.length;
    }
    const cdir = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cdir.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, cdir, end]);
}

// PlanckMath.html 은 파일이 아니라 build() 결과로 넣어, 생성 전에도 ZIP 이 최신 계산을 담게 한다
function buildZip() {
    return makeZip(ZIP_FILES.map(name => ({
        name: ZIP_FOLDER + name,
        data: name === 'PlanckMath.html' ? Buffer.from(build(), 'utf8') : fs.readFileSync(path.join(DIR, name))
    })));
}

module.exports = { build, buildZip, target: path.join(DIR, 'PlanckMath.html'), zipTarget: ZIP, ZIP_FILES, ZIP_FOLDER };
if (require.main === module) {
    fs.writeFileSync(module.exports.target, build());
    fs.writeFileSync(ZIP, buildZip());
    console.log('만듦: apps-script/planck-led/PlanckMath.html, apps-script/planck-led-appsscript.zip');
}
