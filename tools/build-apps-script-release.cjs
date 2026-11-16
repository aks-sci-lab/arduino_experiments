// apps-script/release.json 만들기: 선생님 스크립트가 스스로 업데이트할 때 받는 공식 코드의 판 번호와 확인 값(SHA-256)
//   node tools/build-apps-script-release.cjs        → 다시 만들기
//   시험(tests/apps-script-update.test.cjs)이 release.json 이 Code.gs·appsscript.json 과 맞는지 확인한다
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DIR = path.join(__dirname, '..', 'apps-script');
const target = path.join(DIR, 'release.json');

function build() {
    const code = fs.readFileSync(path.join(DIR, 'Code.gs'));
    const man = fs.readFileSync(path.join(DIR, 'appsscript.json'));
    const m = /\bvar VERSION = (\d+);/.exec(code.toString('utf8'));
    if (!m) throw new Error('Code.gs 에서 VERSION 을 찾지 못함');
    const sha = b => crypto.createHash('sha256').update(b).digest('hex');
    return JSON.stringify({
        version: Number(m[1]),
        files: {
            Code: { sha256: sha(code), size: code.length },
            appsscript: { sha256: sha(man), size: man.length }
        }
    }, null, 2) + '\n';
}

if (require.main === module) {
    fs.writeFileSync(target, build());
    console.log('apps-script/release.json 을 만들었습니다:\n' + build());
}
module.exports = { build, target };
