// 합동 수업(교사 세션과 차례 주고받기) 도우미 — 차례 사이에 수업 상태를 파일로 이어 간다.
//   const live = await openLive(dir);            // dir: 상태 폴더(가짜 저장소 문서 db.json, 학생별 브라우저 저장 storage-*.json, 주소)
//   live.apply(bundle)                           // 교사가 보낸 문서 묶음 넣기 { v, from, turn, set: { 경로: 내용 }, del: [경로] }  날짜는 {"$date": ISO}
//   const S = await live.student('1조노트북', 'laptop')   // 지난 차례의 브라우저 저장(조·번호·익명 자리)을 이어서, 지난 주소를 다시 엶
//   const bundle = await live.close(turn, note)  // 이번 차례에 바뀐 문서 묶음(큰 자료 본문은 줄이고 cut 에 적음) + 상태 저장
// 문서 묶음 모양은 교사 세션(tools/virtual-class/teacher-live.cjs)과 맞춘 것.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { startWorld } = require('./student-lib.cjs');
const enc = v => v instanceof Date ? { $date: v.toISOString() } : Array.isArray(v) ? v.map(enc) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) : v;
const dec = v => Array.isArray(v) ? v.map(dec) : v && typeof v === 'object' ? (typeof v.$date === 'string' && Object.keys(v).length === 1 ? new Date(v.$date) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dec(x)]))) : v;
const CUT = 1500;   // 이보다 긴 글자 칸(자료 본문)은 줄여 보냄

async function openLive(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const W = await startWorld({ shots: path.join(dir, 'shots'), ports: [47712, 47711] });
    const dbFile = path.join(dir, 'db.json'), urlFile = path.join(dir, 'urls.json');
    const docs = W.app.db.docs;
    if (fs.existsSync(dbFile)) for (const [p, d] of Object.entries(JSON.parse(fs.readFileSync(dbFile, 'utf8')))) docs.set(p, dec(d));
    const urls = fs.existsSync(urlFile) ? JSON.parse(fs.readFileSync(urlFile, 'utf8')) : {};
    const snap = () => { const o = {}; docs.forEach((d, p) => { o[p] = JSON.stringify(enc(d)); }); return o; };
    let before = snap();
    const live = { W, urls };
    live.apply = b => { for (const [p, d] of Object.entries(b.set || {})) docs.set(p, dec(d)); for (const p of b.del || []) docs.delete(p); before = snap(); };
    live.student = async (name, device) => {
        const f = path.join(dir, 'storage-' + name + '.json');
        const pg = await W.student(name, device, fs.existsSync(f) ? { storageState: f } : {});
        pg.vcFile = f;
        if (urls[name]) { await pg.goto(urls[name]); await pg.waitForTimeout(2000); }
        return pg;
    };
    live.close = async (turn, note) => {
        for (const [name, pg] of Object.entries(W.pages)) { if (!pg.vcFile || pg.isClosed()) continue; urls[name] = pg.url(); await pg.context().storageState({ path: pg.vcFile }); }
        const after = snap(), set = {}, del = [], cut = [];
        for (const [p, j] of Object.entries(after)) if (before[p] !== j) {
            const d = JSON.parse(j);
            for (const k of Object.keys(d)) if (typeof d[k] === 'string' && d[k].length > CUT) { d[k] = d[k].slice(0, 200) + '…(줄임, 원래 ' + d[k].length + '자)'; if (!cut.includes(p)) cut.push(p); }
            set[p] = d;
        }
        for (const p of Object.keys(before)) if (!(p in after)) del.push(p);
        fs.writeFileSync(dbFile, JSON.stringify(Object.fromEntries(Object.entries(after).map(([p, j]) => [p, JSON.parse(j)]))));
        fs.writeFileSync(urlFile, JSON.stringify(urls));
        await W.close();
        return { v: 1, from: 'student', turn, note: note || '', set, del, cut };
    };
    return live;
}
module.exports = { openLive, enc, dec };
