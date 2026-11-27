// 필름통 로켓 합동 가상 수업 5차 — 켜 두는 서버 (교사·학생 세션 공용).
//   node tools/virtual-class/rocket5/live.cjs <작업 폴더> <teacher|student> [포트 8787]
// 걸음 보내기: 걸음은 async 함수 몸통(쓸 수 있는 이름: S, pg = S.pages, VC 도우미, R = team.cjs 측정 도우미). 마지막 return 값이 JSON 으로 돌아옴.
//   curl -s --data-binary @tools/virtual-class/rocket5/steps/t1.js http://127.0.0.1:8787/
//   curl -s --data-binary 'return await S.look(pg.T, "지금")' http://127.0.0.1:8787/
// 서버가 죽으면 같은 명령으로 다시 켠다 → 작업 폴더/state.json 의 저장소 문서를 되살림(화면은 걸음 00 으로 다시 엶).
'use strict';
const http = require('node:http'), path = require('node:path');
const VC = require('./lib.cjs'), R = require('./team.cjs');
(async () => {
    const dir = path.resolve(process.argv[2] || 'vc-rocket5'), role = process.argv[3] || 'teacher', port = Number(process.argv[4] || 8787);
    const S = await VC.start({ dir, role });
    const st = S.restore();
    console.log((role === 'teacher' ? '교사' : '학생') + ' 서버 http://127.0.0.1:' + port + '/  작업 폴더 ' + dir + (st ? '  (이어 하기: 문서 ' + Object.keys(st.docs).length + '개, 차례 ' + st.turn + ')' : ''));
    const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
    http.createServer((req, res) => {
        let body = ''; req.on('data', c => { body += c; });
        req.on('end', async () => {
            let out;
            try { out = { ok: true, value: await new AsyncFn('S', 'pg', 'VC', 'R', 'require', body)(S, S.pages, VC, R, require) }; S.save(); }
            catch (e) { out = { ok: false, error: String(e && e.stack || e).slice(0, 2000) }; }
            out.log = S.log.splice(0);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(out, null, 1));
        });
    }).listen(port, '127.0.0.1');
})();
