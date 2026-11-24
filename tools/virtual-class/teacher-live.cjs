// 합동 가상 수업(교사 쪽) — 교사 세션과 학생 세션이 차례를 주고받으며 한 수업을 함께 진행하기 위한 도구.
// 두 세션은 다른 컴퓨터라 가짜 저장소를 함께 쓸 수 없으므로, **저장소 문서 묶음을 메시지로 주고받아** 두 쪽 수업 상태를 같게 맞춘다.
//
//   node tools/virtual-class/teacher-live.cjs <작업 폴더> [포트]     ← 켜 두는 서버 (teacher-repl 과 같은 방식: POST 로 S·P·L 을 쓰는 async 함수 몸통)
//     · 작업 폴더/state.json 에 저장소 문서와 교사 화면 주소를 걸음마다 저장 → 서버가 죽어도 다시 켜면 이어감(교사는 가짜 구글 로그인 teacher-1)
//   L.out(메모)        지난번 내보낸 뒤 바뀐 문서 묶음을 작업 폴더/out-<n>.json 에 쓰고 그 글자를 돌려줌 (학생 세션에 보낼 것)
//   L.in(파일 또는 객체) 학생 세션이 보낸 묶음을 저장소에 넣음 → 교사 화면은 몇 초 안에 스스로 다시 읽음
//   L.all()            저장소 문서 전부를 묶음으로
//
// 문서 묶음 모양 (두 세션이 같은 모양을 씀):
//   { "v": 1, "from": "teacher" | "student", "turn": 3, "note": "…",
//     "set": { "<문서 경로>": { …내용… } },      경로는 js/lab-store.js 의 Firestore 경로 그대로 (labClasses/<공간>, labClasses/<공간>/progress/<uid>, labSpaces/<공간>/items/<id> …)
//     "del": [ "<지운 문서 경로>" ],
//     "cut": [ "<자료 본문을 줄인 문서 경로>" ] }   큰 원본(data)을 줄여 보냈으면 여기에 적음 (요약 값은 그대로)
//   날짜 값은 { "$date": "2026-11-20T15:00:00.000Z" } 로 적는다.
'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const VC = require('./teacher-lib.cjs');
const enc = v => v instanceof Date ? { $date: v.toISOString() } : Array.isArray(v) ? v.map(enc) : v && typeof v === 'object' ? Object.keys(v).reduce((o, k) => { o[k] = enc(v[k]); return o; }, {}) : v;
const dec = v => Array.isArray(v) ? v.map(dec) : v && typeof v === 'object' ? (typeof v.$date === 'string' && Object.keys(v).length === 1 ? new Date(v.$date) : Object.keys(v).reduce((o, k) => { o[k] = dec(v[k]); return o; }, {})) : v;

(async () => {
    const dir = process.argv[2] || path.join(process.cwd(), 'vc-live'); fs.mkdirSync(dir, { recursive: true });
    const stateFile = path.join(dir, 'state.json');
    const S = await VC.start({ shots: path.join(dir, 'shots') });
    const docs = S.app.db.docs; let sent = {}, turn = 0;
    const snap = () => { const o = {}; docs.forEach((d, p) => { o[p] = JSON.stringify(enc(d)); }); return o; };
    const L = S.live = {
        dir,
        all() { const set = {}; docs.forEach((d, p) => { set[p] = enc(d); }); return { v: 1, from: 'teacher', turn, set, del: [] }; },
        // 지난번 내보낸(또는 받은) 뒤 바뀐 것만
        out(note, opt) {
            const now = snap(), set = {}, del = [], cut = [];
            for (const p of Object.keys(now)) if (now[p] !== sent[p] && (!opt || !opt.skip || !opt.skip.test(p))) { const d = JSON.parse(now[p]);
                if (opt && opt.maxData && typeof d.data === 'string' && d.data.length > opt.maxData) { d.data = d.data.slice(0, opt.maxData); cut.push(p); } set[p] = d; }
            for (const p of Object.keys(sent)) if (!(p in now)) del.push(p);
            sent = now; turn++;
            const b = { v: 1, from: 'teacher', turn, note: note || '', set, del }; if (cut.length) b.cut = cut;
            const f = path.join(dir, 'out-' + turn + '.json'), txt = JSON.stringify(b); fs.writeFileSync(f, txt);
            return { file: f, bytes: Buffer.byteLength(txt), paths: Object.keys(set), del };
        },
        in(src) {
            const b = typeof src === 'string' ? JSON.parse(fs.readFileSync(src, 'utf8')) : src; const got = [];
            for (const p of Object.keys(b.set || {})) { docs.set(p, dec(b.set[p])); got.push(p); }
            for (const p of b.del || []) docs.delete(p);
            sent = snap();   // 받은 것은 다시 내보내지 않음
            return { from: b.from, turn: b.turn, set: got.length, del: (b.del || []).length, paths: got };
        },
        save() { fs.writeFileSync(stateFile, JSON.stringify({ docs: L.all().set, sent, turn, url: S.pages.T ? S.pages.T.url().replace(S.ROOT, '') : '', vp: S.pages.T ? S.pages.T.viewportSize() : null })); }
    };
    // 이어 하기: 저장된 문서·교사 화면
    if (fs.existsSync(stateFile)) {
        const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        for (const p of Object.keys(st.docs || {})) docs.set(p, dec(st.docs[p])); sent = st.sent || {}; turn = st.turn || 0;
        if (st.url) { const T = await S.teacher(st.vp || { width: 1920, height: 1080 });
            await T.context().addInitScript(() => { try { localStorage.setItem('lab-store:fake-user', JSON.stringify({ uid: 'teacher-1', google: true, teacher: true })); } catch (e) { /* 무시 */ } });
            await T.goto(S.ROOT + st.url); await T.waitForTimeout(1500); }
        console.log('이어 하기: 문서 ' + docs.size + '개, 차례 ' + turn + ', 교사 화면 ' + (st.url || '(없음)'));
    }
    const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
    const srv = http.createServer((req, res) => {
        let b = ''; req.on('data', c => { b += c; });
        req.on('end', async () => {
            let out;
            try { out = await new AsyncFn('S', 'P', 'L', 'require', b)(S, S.pages, L, require); } catch (e) { out = { error: String(e && e.stack || e).slice(0, 1500) }; }
            try { L.save(); } catch (e) { /* 무시 */ }
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(typeof out === 'string' ? out : JSON.stringify(out === undefined ? null : out, null, 1));
        });
    });
    srv.listen(Number(process.argv[3]) || 0, '127.0.0.1', () => console.log('PORT ' + srv.address().port));
})();
