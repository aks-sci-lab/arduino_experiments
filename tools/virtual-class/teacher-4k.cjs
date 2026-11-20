// 가상 수업(교사 역할) — 4K 프로젝터(3840×2160)에서 교사 화면 재기 (선생님: "프로젝터는 4k야")
//   node tools/virtual-class/teacher-4k.cjs [그림 폴더]
// 윈도우 화면 배율을 모르므로 세 가지: 100%(CSS 3840×2160) · 150%(2560×1440) · 200%(1920×1080). 참고로 작은 노트북 1280×720 도.
// 재는 것: 큰 QR 화면(QR·수업 코드·'다음' 단추가 한 화면에 들어오는지, QR 한 변 / 화면 높이), 진행 화면, 🏆 결과판 크게 보기(로켓),
//   🎬 발표 보기(틀 크기 / 화면, 본문 글자 높이 / 화면 높이, 글이 틀 아래로 잘리는지), Alt+B 크게 보기 뒤 같은 값.
// 글자 크기는 '화면 높이에 대한 비율(%)'로 적는다 — 프로젝터에서는 화소 수가 아니라 이 비율이 읽힘을 정한다. (참고: PPT 본문 24pt 는 슬라이드 높이의 약 4.4%)
'use strict';
const path = require('node:path');
const VC = require('./teacher-lib.cjs');
const SCALES = [['4K 100%', 3840, 2160], ['4K 150%', 2560, 1440], ['4K 200%', 1920, 1080], ['노트북 1280×720', 1280, 720]];
const pct = (a, b) => (a / b * 100).toFixed(1) + '%';

(async () => {
    const S = await VC.start({ shots: process.argv[2] || path.join(process.cwd(), 'vc-shots', '4k') });
    const rows = [];
    try {
        const T = await S.teacher({ width: 1920, height: 1080 });
        await T.goto(S.ROOT + 'projects/class-teacher.html'); await S.tap(T, '구글 계정으로 로그인');
        const make = async exp => { await T.goto(S.ROOT + 'projects/class-teacher.html'); await T.waitForTimeout(500); await S.tap(T, '새 수업 만들기'); await T.selectOption('#inExp', exp); await S.tap(T, '수업 만들기', 'last'); await T.waitForTimeout(600); return T.url(); };
        const mainFont = fr => fr.evaluate(() => { const m = {}; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
            while ((t = w.nextNode())) { const s = t.nodeValue.trim(), p = t.parentElement; if (!s || !p || !p.offsetParent) continue; const r = p.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue; const f = Math.round(parseFloat(getComputedStyle(p).fontSize)); m[f] = (m[f] || 0) + s.length; }
            return Number(Object.keys(m).sort((a, b) => m[b] - m[a])[0]); });
        for (const exp of ['rocket', 'qdot']) {
            const url = await make(exp);
            if (exp === 'rocket') for (const n of ['별빛가족', '달님 탐험대', '로켓왕']) { const p = await S.phone('F' + n); await p.goto(S.local(await T.getAttribute('#outLink', 'href'))); await p.waitForSelector('[data-screen="enter"]'); await p.waitForFunction(() => !/연결하는 중/.test(document.getElementById('ev-enter-msg').textContent)); await p.fill('#ev-name', n); await p.click('#ev-start'); await p.waitForTimeout(600); }
            for (const [name, w, h] of SCALES) {
                await T.setViewportSize({ width: w, height: h }); await T.goto(url.replace(/&view=\w+/, '')); await T.reload(); await T.waitForSelector('#classOut:not([hidden])'); await T.waitForTimeout(600);
                const q = await T.evaluate(() => { const b = id => document.getElementById(id).getBoundingClientRect(); const qr = b('qr'), code = b('outCode'), nx = b('btnToRun'); return { qr: Math.round(qr.height), qrBottom: Math.round(qr.bottom), codeBottom: Math.round(code.bottom), codeFont: Math.round(parseFloat(getComputedStyle(document.getElementById('outCode')).fontSize)), nextBottom: Math.round(nx.bottom), pageW: Math.round(document.querySelector('#classOut').getBoundingClientRect().width) }; });
                if (exp === 'rocket') await S.shot(T, '큰QR-' + name.replace(/[ %×]/g, ''));
                const r = { 실험: exp, 화면: name, '큰 QR: QR 한 변': q.qr + 'px (' + pct(q.qr, h) + ')', '수업 코드 글자': q.codeFont + 'px (' + pct(q.codeFont, h) + ')', '한 화면에 들어옴(QR/코드/다음)': [q.qrBottom, q.codeBottom, q.nextBottom].map(v => v <= h ? '○' : '✕').join(' '), '내용 폭 / 화면 폭': pct(q.pageW, w) };
                await S.tap(T, '진행 보기'); await T.waitForTimeout(800); await T.evaluate(() => scrollTo(0, 0));
                const run = await T.evaluate(() => { const c = document.getElementById('stageCard').getBoundingClientRect(); const qi = document.getElementById('cornerQrImg'); const qb = qi && qi.offsetParent ? qi.getBoundingClientRect() : null; const big = [...document.querySelectorAll('#stageCard *')].map(e => parseFloat(getComputedStyle(e).fontSize)).sort((a, b) => b - a)[0]; return { w: Math.round(c.width), right: Math.round(c.right), qr: qb ? Math.round(qb.width) : 0, big: Math.round(big), body: Math.round(parseFloat(getComputedStyle(document.body).fontSize)) }; });
                r['진행 화면: 내용 폭 / 화면 폭'] = pct(run.w, w); r['오른쪽 위 QR'] = run.qr + 'px (' + pct(run.qr, h) + ')'; r['열린 단계 큰 글씨'] = run.big + 'px (' + pct(run.big, h) + ')'; r['보통 글자'] = run.body + 'px (' + pct(run.body, h) + ')';
                if (exp === 'rocket') { await S.shot(T, '진행-' + name.replace(/[ %×]/g, ''));
                    await S.tap(T, '크게 보기'); await T.waitForTimeout(400); const b = await T.evaluate(() => { const t = document.querySelector('#boardBigBody td, #boardBigBody th'); const tb = document.querySelector('#boardBigBody table') || document.getElementById('boardBigBody'); return { f: Math.round(parseFloat(getComputedStyle(t).fontSize)), w: Math.round(tb.getBoundingClientRect().width), h: Math.round(tb.getBoundingClientRect().height) }; });
                    r['결과판 크게: 글자'] = b.f + 'px (' + pct(b.f, h) + ')'; r['결과판 표 폭·높이 / 화면'] = pct(b.w, w) + ' · ' + pct(b.h, h) + ' (3팀)'; await S.shot(T, '결과판크게-' + name.replace(/[ %×]/g, '')); await S.tap(T, '닫기'); }
                await S.tap(T, '발표 보기'); await T.waitForTimeout(1800); const fr = T.frames()[1];
                if (exp === 'qdot') { await T.keyboard.press('ArrowRight'); await T.waitForTimeout(400); await T.keyboard.press('Enter'); await T.waitForTimeout(3000); }   // 2 이론(글이 많은 단계)에서 잼
                const pres = async tag => { const f = await T.evaluate(() => { const b = document.querySelector('iframe').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; }); const mf = await mainFont(fr); const io = await fr.evaluate(() => ({ page: document.documentElement.scrollHeight, view: innerHeight, contentW: Math.round((document.querySelector('.step-panel:not([hidden]), .ev-app, #ev-app') || document.body).getBoundingClientRect().width), vw: innerWidth }));
                    const zoom = await T.evaluate(() => { const z = parseFloat(getComputedStyle(document.documentElement).zoom || 1) || 1; return z; });
                    r[tag + ': 틀 / 화면'] = pct(f.w * zoom, w) + ' × ' + pct(f.h * zoom, h); r[tag + ': 본문 글자'] = mf + 'px' + (zoom !== 1 ? '×' + zoom : '') + ' (' + pct(mf * zoom, h) + ')'; r[tag + ': 내용 폭 / 틀 폭'] = pct(io.contentW, io.vw); r[tag + ': 글 잘림(전체/보이는)'] = io.page > io.view + 8 ? '✂ ' + io.page + '/' + io.view : '없음'; };
                await pres('발표'); await S.shot(T, exp + '-발표-' + name.replace(/[ %×]/g, ''));
                await T.keyboard.press('Alt+b'); await T.waitForTimeout(500); await pres('발표+Alt+B'); await S.shot(T, exp + '-발표AltB-' + name.replace(/[ %×]/g, '')); await T.keyboard.press('Alt+b'); await T.waitForTimeout(300);
                if (exp === 'qdot') { await S.tap(T, '진행 화면으로'); await S.tap(T, '하나 되돌리기'); await T.waitForTimeout(800); }
                rows.push(r);
            }
        }
        console.log(JSON.stringify(rows, null, 1));
    } finally { await S.close(); }
})().catch(e => { console.error(e); process.exit(1); });
