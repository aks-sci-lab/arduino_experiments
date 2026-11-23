// 가상 수업을 '화면을 보고 한 걸음씩' 진행하기 위한 작은 도구.
//   node tools/virtual-class/teacher-repl.cjs <그림 폴더> [포트]      (켜 두고)
//   curl -s --data-binary @step.js http://127.0.0.1:<포트>/           (한 걸음: S·P(화면들) 을 쓰는 async 함수 몸통, return 값이 답)
// 화면을 찍어 보고 다음 행동을 정하는 식으로 쓴다. 끝난 흐름은 teacher-<실험>.cjs 로 옮겨 다시 돌릴 수 있게 한다.
'use strict';
const http = require('node:http');
const VC = require('./teacher-lib.cjs');
(async () => {
    const S = await VC.start({ shots: process.argv[2] });
    const P = S.pages, AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
    const srv = http.createServer((req, res) => {
        let b = ''; req.on('data', c => { b += c; });
        req.on('end', async () => {
            let out;
            try { out = await new AsyncFn('S', 'P', 'require', b)(S, P, require); } catch (e) { out = { error: String(e && e.stack || e).slice(0, 1500) }; }
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(typeof out === 'string' ? out : JSON.stringify(out === undefined ? null : out, null, 1));
        });
    });
    srv.listen(Number(process.argv[3]) || 0, '127.0.0.1', () => console.log('PORT ' + srv.address().port));
})();
