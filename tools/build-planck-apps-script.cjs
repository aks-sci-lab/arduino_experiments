// js/planck-math.js(사이트의 플랑크 상수 계산) → apps-script/planck-led/PlanckMath.html 로 옮겨 쓴다.
// Apps Script 웹앱은 사이트의 js 파일을 불러올 수 없어 같은 내용을 <script> 로 감싼 HTML 파일로 둔다.
// planck-math.js 를 고치면:  node tools/build-planck-apps-script.cjs   (시험이 두 파일이 같은지 확인함)
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
function build() {
    const src = fs.readFileSync(path.join(root, 'js', 'planck-math.js'), 'utf8');
    return '<!-- 자동 생성 파일: 고치지 말고 사이트의 js/planck-math.js 를 고친 뒤\n' +
        '     node tools/build-planck-apps-script.cjs 를 실행하세요. (window.PlanckMath) -->\n' +
        '<script>\n' + src.replace(/\s*$/, '\n') + '</script>\n';
}
module.exports = { build, target: path.join(root, 'apps-script', 'planck-led', 'PlanckMath.html') };
if (require.main === module) {
    fs.writeFileSync(module.exports.target, build());
    console.log('만듦: apps-script/planck-led/PlanckMath.html');
}
