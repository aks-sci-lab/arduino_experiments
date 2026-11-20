// 합동 수업 ① 필름통 로켓(고친 판) — 학생(가족) 쪽 차례. 교사 세션 문서 묶음을 넣고 가족 폰을 움직인 뒤 바뀐 문서 묶음을 내놓는다.
//   VC_REPO=<고친 판 폴더> VC_NPM=… node tools/virtual-class/student-live-rocket.cjs <상태 폴더> <차례> [교사 묶음.json]
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { openLive } = require('./student-live.cjs');
const CODE = '1-5411', SP = 'labClasses/cixem6przhsi57h2j9suc5cc', PAGE = 'projects/film-rocket.html?c=1-5411&s=cixem6przhsi57h2j9suc5cc';
(async () => {
    const [dir, turnArg, bundleFile] = process.argv.slice(2), turn = +turnArg;
    const live = await openLive(dir), W = live.W, out = [];
    const note = (k, v) => out.push([k, v]);
    const quiet = () => {};   // 걷기 기록은 남기지 않음(필요한 것만 적음)
    const teacher = () => { if (bundleFile) live.apply(JSON.parse(fs.readFileSync(bundleFile, 'utf8'))); };
    const stageOf = () => W.app.db.docs.get(SP).stage, setStage = n => { W.app.db.docs.get(SP).stage = n; };
    const top = async pg => (await W.text(pg)).split('\n').filter(l => !/^(생각 열기|1차시|2차시|정리|🔒.*)$/.test(l)).slice(0, 9).join(' / ').slice(0, 420);
    const name = pg => pg.getByPlaceholder('예: 별빛 가족').locator('visible=true').first();
    const enter = async (pg, team) => { await name(pg).fill(team); await W.tap(pg, '시작하기'); await pg.waitForTimeout(1500); };
    const T = {
        1: async () => {   // 0~6분: 입장 · 생각 열기
            teacher();
            const A = await live.student('A별빛', 'phone'); await A.goto(W.ROOT + PAGE); await A.waitForTimeout(1200); await enter(A, '별빛가족');
            const B = await live.student('B달님', 'phone'); await B.goto(W.ROOT + PAGE); await B.waitForTimeout(1200); await enter(B, '별빛가족');
            note('B 같은 이름', (await W.text(B)).split('\n').find(l => /같은 이름/.test(l))); await enter(B, '달님 탐험대');
            const C = await live.student('C로켓왕', 'Pixel 7'); await C.goto(W.ROOT + PAGE); await C.waitForTimeout(1200); await enter(C, '로켓왕👑');
            const E = await live.student('E코드', 'phone'); await E.goto(W.ROOT + 'index.html'); await W.tap(E, '학생'); await E.getByPlaceholder('2-4821').fill('15411'); await W.tap(E, '들어가기'); await E.waitForTimeout(800);
            note('E 줄표 없이', { 주소: E.url().replace(W.ROOT, '').slice(0, 40), 글: (await W.text(E)).split('\n').find(l => /모양|찾지/.test(l)) || '' });
            if (/index/.test(E.url())) { await E.getByPlaceholder('2-4821').fill(CODE); await W.tap(E, '들어가기'); await E.waitForTimeout(1500); }
            await enter(E, '우리집 최고');
            await W.stroll(A, 'A', 14, 2, /돌아가기/, quiet); await W.stroll(C, 'C', 14, 0, /돌아가기/, quiet);   // A·C: 세 문제 다 풀고 기다림
            await W.stroll(E, 'E', 5, 1, /돌아가기/, quiet);                                                          // E: 두 문제쯤
            await W.stroll(B, 'B', 2, 0, /돌아가기/, quiet);                                                          // B: 느림(첫 문제 읽는 중)
            for (const [n, pg] of Object.entries(W.pages)) note(n, await top(pg));
            await W.shot(A, 'A 기다리는 화면'); await A.waitForTimeout(4000);
        },
        2: async () => {   // 9~35분: 1차시 열림 → A 끝까지, C 끊김, D 늦게, E 조건 고르기, B 초시계 앞
            setStage(1);
            const A = await live.student('A별빛', 'phone'), B = await live.student('B달님', 'phone'), C = await live.student('C로켓왕', 'Pixel 7'), E = await live.student('E코드', 'phone');
            setStage(2); await A.waitForTimeout(6000);
            for (const [n, pg] of Object.entries(W.pages)) note('1차시 열린 순간 ' + n, await top(pg));
            await W.shot(B, 'B 하는 중에 1차시 열림');
            const log = (k, v) => { if (/^A1 /.test(k)) note(k, typeof v === 'string' ? v : { 글: v.글.slice(0, 330), 단추: v.단추 }); };
            const sw = async (pg, sec) => {   // 초시계 한 번: (방법 고르기가 나오면 초시계) → 시작 → sec 초 → 펑 → 기록
                if (await pg.getByText('초시계로 재기').locator('visible=true').count()) await W.tap(pg, '초시계로 재기');
                await W.tap(pg, '시작 (뚜껑'); await pg.waitForTimeout(sec * 1000); await W.tap(pg, /펑! \(멈춤\)|펑!/); await pg.waitForTimeout(400);
                if (await pg.getByText('이 시간으로 기록').locator('visible=true').count()) await W.tap(pg, '이 시간으로 기록'); await pg.waitForTimeout(500);
            };
            // A: 첫 측정까지 걷고(기록 남김), 초시계 3번 → 조건 바꿔 3번 → 그래프 → 왜 → 도전
            await W.stroll(A, 'A1', 16, 0, /초시계로 재기|시작 \(뚜껑/, log); await sw(A, 2.0);
            note('A 첫 결과 화면', { 글: (await top(A)), 단추: (await W.buttons(A)).slice(4) });
            for (let i = 0; i < 2; i++) { const t0 = Date.now(); await W.tap(A, /한 번 더/); const n0 = out.length; await W.stroll(A, 'A반복', 4, 0, /초시계로 재기|시작 \(뚜껑/, (k, v) => { if (!i) note('A 반복 때 지나는 화면 ' + k, typeof v === 'string' ? v : v.글.slice(0, 120)); }); await sw(A, 2.2 + i * 0.3); }
            note('A 3번 잰 뒤', await top(A));
            await W.tap(A, /바꿔서 재기/); await A.waitForTimeout(400); await W.tap(A, '+'); await A.waitForTimeout(300);
            note('A 값 바꾼 뒤 횟수 글', (await W.text(A)).split('\n').find(l => /번 쟀어요|번째/.test(l)) || '');
            await W.stroll(A, 'A조건2', 5, 0, /초시계로 재기|시작 \(뚜껑/, quiet); await sw(A, 3.2);
            await W.tap(A, '그래프 보기'); await A.waitForTimeout(800); await W.shot(A, 'A 그래프'); note('A 그래프 화면 단추', (await W.buttons(A)).slice(4));
            await W.tap(A, '왜 달랐을까'); await W.stroll(A, 'A왜', 10, 0, /도전하기/, quiet); await W.tap(A, '도전하기'); await W.stroll(A, 'A도전', 6, 0, /초시계로 재기|시작 \(뚜껑/, quiet); await sw(A, 3.0);
            note('A 도전 결과', { 글: await top(A), 단추: (await W.buttons(A)).slice(4) });
            await W.tap(A, /2차시로/).catch(() => {}); await A.waitForTimeout(600); note('A 2차시 눌러 봄(잠김)', { 글: await top(A), 단추: (await W.buttons(A)).slice(4) });
            // A: 기다리다 '더 재기' — 1차시로 돌아가면 어디로?
            await W.tap(A, /돌아가기|이어서|더 재기/).catch(e => note('A 돌아가기', e.message)); await A.waitForTimeout(600); note('A 1차시로 돌아간 화면', { 글: await top(A), 단추: (await W.buttons(A)).slice(4) });
            // C: 두 번 잰 뒤 와이파이 끊김 → 한 번 더 → 새로고침
            await W.stroll(C, 'C1', 16, 1, /초시계로 재기|시작 \(뚜껑/, quiet); await sw(C, 1.8); await W.tap(C, /한 번 더/); await W.stroll(C, 'C2', 4, 0, /초시계로 재기|시작 \(뚜껑/, quiet); await sw(C, 2.1);
            W.offline['C로켓왕'] = true; await W.tap(C, /한 번 더/); await W.stroll(C, 'C3', 4, 0, /초시계로 재기|시작 \(뚜껑/, quiet); await sw(C, 2.4); await C.waitForTimeout(2500);
            note('C 끊긴 채 기록', await top(C)); await C.reload(); await C.waitForTimeout(2500); note('C 끊긴 채 새로고침', (await W.text(C)).split('\n').slice(0, 12).join(' / '));
            // D: 20분쯤 QR 로 입장
            const D = await live.student('D번개', 'phone'); await D.goto(W.ROOT + PAGE); await D.waitForTimeout(1200); await enter(D, '늦은 번개팀'); note('D 늦게 입장한 첫 화면', { 글: await top(D), 단추: (await W.buttons(D)).slice(4) }); await W.shot(D, 'D 늦게 입장');
            await W.stroll(D, 'D', 3, 0, /돌아가기/, quiet);
            // E: 생각 열기 마저 하고 1차시 조건 고르기까지
            await W.stroll(E, 'E', 12, 0, /물의 양 바꾸기/, quiet); note('E', await top(E));
            // B: 생각 열기 마저 → 1차시 → 초시계 앞(다음 차례에 시작을 누른 채로 2차시가 열림)
            await W.stroll(B, 'B', 24, 0, /초시계로 재기|시작 \(뚜껑/, quiet); note('B', { 글: await top(B), 단추: (await W.buttons(B)).slice(4) });
            await A.waitForTimeout(3000);
        },
        3: async () => {   // 35분: B 가 초시계를 재는 중에 2차시 열림 → 20초 뒤 되돌림 → 50분까지
            setStage(2); W.offline['C로켓왕'] = true;
            const A = await live.student('A별빛', 'phone'), B = await live.student('B달님', 'phone'), C = await live.student('C로켓왕', 'Pixel 7'), D = await live.student('D번개', 'phone'), E = await live.student('E코드', 'phone');
            const all = async tag => { for (const [n, pg] of Object.entries(W.pages)) note(tag + ' ' + n, (await top(pg)).slice(0, 300)); };
            await all('다시 연 화면');
            await W.stroll(B, 'B', 5, 0, /초시계로 재기|시작 \(뚜껑/, quiet);   // (다시 연 화면은 조건 화면이라 초시계까지 다시 감)
            if (await B.getByText('초시계로 재기').locator('visible=true').count()) await W.tap(B, '초시계로 재기'); await W.tap(B, '시작 (뚜껑'); await B.waitForTimeout(3000);
            setStage(3); await A.waitForTimeout(9000); await all('(가) 2차시 열림 9초 뒤'); await W.shot(B, 'B 초시계 중 2차시 열림'); await W.shot(A, 'A 2차시 열림');
            await A.waitForTimeout(11000); setStage(2); await A.waitForTimeout(9000); await all('(나) 되돌림 9초 뒤'); await W.shot(A, 'A 되돌린 뒤');
            note('A 되돌린 뒤 단추', (await W.buttons(A)).slice(0, 12));
            // B: 펑 → 기록
            await W.tap(B, /펑/); await B.waitForTimeout(400); if (await B.getByText('이 시간으로 기록').locator('visible=true').count()) await W.tap(B, '이 시간으로 기록'); await B.waitForTimeout(800); note('B 측정 마무리', await top(B));
            const sw = async (pg, sec) => { if (await pg.getByText('초시계로 재기').locator('visible=true').count()) await W.tap(pg, '초시계로 재기'); await W.tap(pg, '시작 (뚜껑'); await pg.waitForTimeout(sec * 1000); await W.tap(pg, /펑/); await pg.waitForTimeout(400); if (await pg.getByText('이 시간으로 기록').locator('visible=true').count()) await W.tap(pg, '이 시간으로 기록'); await pg.waitForTimeout(500); };
            // 50분까지
            await W.stroll(D, 'D', 14, 0, /안전 확인/, quiet); note('D', await top(D));
            await W.stroll(E, 'E', 8, 0, /초시계로 재기|시작 \(뚜껑/, quiet); await sw(E, 2.5); note('E 첫 측정', await top(E));
            try { if (!(await A.getByText('다시 도전').locator('visible=true').count())) { await W.tap(A, '1차시'); await A.waitForTimeout(500); note('A 1차시 탭 누른 화면', await top(A)); }
                await W.tap(A, '다시 도전'); await W.stroll(A, 'A', 6, 0, /초시계로 재기|시작 \(뚜껑/, quiet); await sw(A, 4); note('A 다시 도전', await top(A)); } catch (e) { note('A 다시 도전에서 막힘', String(e.message).split('\n')[0]); note('A 화면', { 글: await top(A), 단추: (await W.buttons(A)).slice(0, 12) }); }
            note('C 끊긴 채', await top(C));
            await A.waitForTimeout(3000);
        },
        4: async () => {   // 52~85분: 2차시가 제대로 열림
            setStage(2); W.offline['C로켓왕'] = true;
            const A = await live.student('A별빛', 'phone'), B = await live.student('B달님', 'phone'), C = await live.student('C로켓왕', 'Pixel 7'), D = await live.student('D번개', 'phone'), E = await live.student('E코드', 'phone');
            setStage(3); await A.waitForTimeout(7000);
            for (const [n, pg] of Object.entries(W.pages)) note('2차시 열림 ' + n, (await top(pg)).slice(0, 230));
            // C: 다시 연결
            W.offline['C로켓왕'] = false; const t0 = Date.now(); let ok = null;
            while (Date.now() - t0 < 60000) { await C.waitForTimeout(3000); if (!/폰에 저장됨/.test(await top(C))) { ok = Math.round((Date.now() - t0) / 1000); break; } }
            note('C 다시 연결 뒤', { 보내기까지_초: ok, 화면: (await top(C)).slice(0, 260), 탭: (await W.buttons(C)).slice(0, 4), 저장소_측정수: (W.app.items('rocket').find(d => d.title === '로켓왕👑') || {}).summary });
            const toT2 = async (pg, pick) => { if (await pg.getByText(/2차시로/).locator('visible=true').count()) await W.tap(pg, /2차시로/); else await W.tap(pg, /^2차시$/); await pg.waitForTimeout(600); await W.stroll(pg, 't2', 22, pick || 0, /영상으로 재기/, quiet); };
            // A: 영상으로 세 곳 누르기 → 기록 → 한 번 더(눈으로) → 그래프 → 도전(눈으로) → 정리로
            await toT2(A, 0); await W.tap(A, '영상으로 재기'); await A.waitForTimeout(1000); await W.tap(A, '녹화 시작'); await A.waitForTimeout(2500); await W.tap(A, '녹화 끝'); await A.waitForTimeout(2000);
            note('A 영상 연 위치', (await W.text(A)).split('\n').find(l => /^영상 \d|^⏱/.test(l)) || '');
            await W.tap(A, '이 장면이 가장 높아요'); await A.waitForTimeout(800);
            const pic = A.locator('canvas').locator('visible=true').first(), bx = await pic.boundingBox();
            for (const [fx, fy] of [[0.3, 0.95], [0.3, 0.5], [0.6, 0.42]]) { await A.touchscreen.tap(bx.x + bx.width * fx, bx.y + bx.height * fy); await A.waitForTimeout(500); }
            note('A 세 점 뒤', (await top(A)).slice(0, 260)); await W.tap(A, '이 결과 기록'); await A.waitForTimeout(600);
            await W.tap(A, '바꿔서 다시 발사'); await W.tap(A, '+'); await W.stroll(A, 'A', 6, 0, /눈으로 보고 고르기/, quiet); await W.tap(A, '눈으로 보고 고르기'); await W.tap(A, '아이 키와 비슷'); await A.waitForTimeout(500);
            note('A 두 번 쏜 뒤', { 글: (await top(A)).slice(0, 260), 단추: (await W.buttons(A)).slice(4) });
            await W.tap(A, '그래프 보기'); await A.waitForTimeout(700); await W.tap(A, /도전: 딱/); await W.tap(A, '도전하기'); await W.stroll(A, 'A도전', 6, 0, /눈으로 보고 고르기/, quiet); await W.tap(A, '눈으로 보고 고르기'); await W.tap(A, '아이 키와 비슷'); await A.waitForTimeout(600);
            note('A 2차시 도전 결과', { 글: (await top(A)).slice(0, 300), 단추: (await W.buttons(A)).slice(4) });
            await W.tap(A, /정리로/).catch(e => note('A 정리로', e.message)); await A.waitForTimeout(600); note('A 2차시 끝낸 뒤 서 있는 화면', { 글: (await top(A)).slice(0, 260), 단추: (await W.buttons(A)).slice(4) });
            // B: 2차시 눈으로 한 번
            await toT2(B, 0); await W.tap(B, '눈으로 보고 고르기'); await W.tap(B, '아이 키보다 높다'); await B.waitForTimeout(500); note('B 2차시 한 번', (await top(B)).slice(0, 220));
            // D: 1차시를 한 번만 재고(초시계) 2차시로
            await W.stroll(D, 'D', 16, 0, /초시계로 재기|시작 \(뚜껑/, quiet); if (await D.getByText('초시계로 재기').locator('visible=true').count()) await W.tap(D, '초시계로 재기'); await W.tap(D, '시작 (뚜껑'); await D.waitForTimeout(2200); await W.tap(D, /펑/); await D.waitForTimeout(400); if (await D.getByText('이 시간으로 기록').locator('visible=true').count()) await W.tap(D, '이 시간으로 기록'); await D.waitForTimeout(500);
            note('D 1차시 한 번 잰 뒤(2차시로 가는 길이 보이나)', { 글: (await top(D)).slice(0, 220), 단추: (await W.buttons(D)).slice(0, 12) });
            await W.tap(D, /^2차시$/); await D.waitForTimeout(600); await W.stroll(D, 'D2', 5, 0, /영상으로 재기/, quiet); note('D 2차시', (await top(D)).slice(0, 200));
            // E: 2차시 촬영 안내까지 와서 '눈으로 보고 고르기' 화면(발사를 기다리는 중)에 멈춤
            await toT2(E, 0); await W.tap(E, '눈으로 보고 고르기'); await E.waitForTimeout(500); note('E (85분, 발사 보고 고르려는 중)', (await top(E)).slice(0, 260));
            await A.waitForTimeout(3000);
        }
        // TURNS
    };
    try { await T[turn](); } catch (e) { note('막힘', String(e.message).split('\n')[0]); }
    out.push(['알림 창', W.dialogs.splice(0)], ['오류', W.errors.splice(0)]);
    const bundle = await live.close(turn, '학생 차례 ' + turn);
    fs.writeFileSync(path.join(dir, 'out-' + turn + '.json'), JSON.stringify(bundle));
    console.log(JSON.stringify(out, null, 1)); console.log('묶음 글자 수', JSON.stringify(bundle).length, Object.keys(bundle.set));
})();
