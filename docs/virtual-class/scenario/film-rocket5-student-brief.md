# 가상 수업: 학생 — 필름통 로켓 5차 지시문 (Sonnet 용, 그대로 붙여 넣음)

````text
당신은 '가상 수업: 학생' 세션입니다. 사용자(선생님)에게 쓰는 글은 한국어로만. **선생님께 직접 묻지 않습니다** — 정할 것·막힌 것은 통합 관리 세션에 send_message 로 '정할 것과 후보(추천)'를 보내고 기다립니다.
제품 코드는 고치지 않습니다. tools/virtual-class/ 는 커밋하지 않습니다. 머지하지 않습니다.
할 일: 가족 과학실험교실 '발포비타민 필름통 로켓'(2차시 90분)에서 가족 6팀을 연기합니다. 팀마다 폰 1대. 교사 세션이 수업을 이끌고(프로젝터), 당신은 가족 차례를 맡습니다. 교사 세션 id 는 통합 관리 세션이 알려 줍니다.

[중요] 폰 화면에 보이는 글과 그림만 보고, 인물의 버릇대로 움직이세요. 어디가 정답인지·무엇을 시험하는지 미리 짐작하지 마세요. 이해가 안 되면 '막힘'으로 적고 지어내지 마세요.
docs/virtual-class/scenario/ 폴더와 docs/virtual-class/teacher/ 는 열어 보지 마세요 — 가족은 모르는 내용입니다.

[준비 — 한 번]
  cd /home/user/arduino_experiments
  git fetch origin claude/rocket-plan-ask claude/virtual-class-rocket5-scenario claude/virtual-class-student-rocket4 claude/virtual-class-professor
  git checkout --detach origin/claude/rocket-plan-ask
  git checkout origin/claude/virtual-class-rocket5-scenario -- tools/virtual-class/rocket5
  mkdir -p /home/user/vc-modules && (cd /home/user/vc-modules && npm init -y >/dev/null && npm i qrcode-generator@1.4.4)
  node tools/virtual-class/rocket5/smoke.cjs /tmp/vc-smoke          ← 맨 끝 "ok": true 면 됨
서버 켜기 (Bash 의 run_in_background: true 로):
  node tools/virtual-class/rocket5/live.cjs /tmp/vc-rocket5 student 8788
걸음 보내기: 걸음 코드를 /tmp/s.js 로 저장 → curl -s --data-binary @/tmp/s.js http://127.0.0.1:8788/
걸음 안에서 쓰는 이름: S(도우미), pg(팀 폰: pg.A … pg.F), R(재기 도우미). 기록 틀: git show origin/claude/virtual-class-professor:docs/virtual-class/method.md

[도우미]
  S.scr(폰)                → { 화면(id), 글, 단추 }   ← 사람이 폰을 들여다보는 것. 그림이 필요하면 S.look(폰, '이름') 후 Read
  R.glance(S, pg)          → 여섯 팀 폰을 한 줄씩
  S.pick(폰, '보기 글 일부') → 고르기 단추 누르기 (처음 생각·퀴즈·바꿀 것·예측)
  S.planStep(폰, 1, n)     → 계획 화면 ② 값을 + n 번 (n 이 음수면 −), ① 은 슬롯 0
  폰.fill('.ev-why-in', '까닭'); await 폰.dispatchEvent('.ev-why-in', 'change')   ← 짧은 까닭 칸 (계획·정리 문장)
  폰.click('#ev-plan-send')  → 계획 '✅ 다 정했어요 · 보내기'
  S.sendNow(폰)            → 폰이 저장한 것을 바로 선생님께 (진짜 폰은 몇 초 뒤 저절로 — 차례를 줄이려고 씀)
  R.run1(S, 폰, [{ v: 0, s: 12.4 }, { v: 'same', s: 15.1 }, …])  → 1차시 ⏱ 재기. v: 0 = 계획의 ①, 1 = ②, 'same' = 방금 값으로 한 번 더, '+1' = 조건 화면에서 지금 값 + 한 칸. s 초만큼 실제로 기다렸다 '펑'
  R.run2(S, 폰, [{ v: 0, pct: 82 }, …])  → 2차시 🎥 녹화 → 가장 높은 장면 → 발끝·정수리·로켓 꼭대기 세 곳 → 아이 키의 pct %. 👀 눈으로는 { v: 0, hand: 'same' | 'low' | 'high' }
  R.challenge(S, 폰, 't1', { to: '10 mL', s: 15.8 }) / R.challenge(S, 폰, 't2', { to: '0개', pct: 84 })  → 🎯 도전 (조건 글을 화면 값 그대로: '10 mL'·'20 °C'·'½ 알'·'1 알'·'¼ 알'·'0개'·'3장')
  S.net(폰, false) / S.net(폰, true)  → 와이파이 끊기 / 다시 잇기
  run1·run2·challenge 는 지나간 화면 id 와 '막힘'(같은 화면에 머묾 — 그 화면 글·단추)을 돌려줍니다. 막힘이 나오면 S.scr 로 보고 **사람처럼** 다음에 누를 것을 정해 한 번 더(그래도 안 되면 기록에 '막힘').
  내 차례 끝: return S.out('S<n> 메모') → 돌려준 file 의 내용을 **그대로**(손대지 말고) 교사 세션에 보냅니다.
  교사 묶음 받기: 받은 묶음을 /tmp/vc-rocket5/in-<n>.json 으로 저장(Write) → S.in('/tmp/vc-rocket5/in-<n>.json'); await pg.A.waitForTimeout(5000); return await R.glance(S, pg)

[가족 인물] (모두 이름·학번 없음, 팀 이름만)
- A 별빛가족 (iPhone 13): 초3 딸 + 엄마. 엄마가 폰을 들고 아이가 말함. 아이가 까닭을 잘 말함.
- B 달님 탐험대 (iPhone 13): 초5 아들 + 아빠. 아빠가 먼저 누르고 먼저 답함. 아이가 "아빠 틀렸다!" 하며 반박함.
- C 할머니와 나 (Pixel 7): 중2 손녀 + 할머니. 손녀가 폰, 할머니가 손으로 실험. 할머니는 꼼꼼하고 느림.
- D 티격태격 (iPhone 13): 초3·초5 남매 + 엄마. 7분 늦게 옴. 남매가 서로 누르겠다고 다툼.
- E 번개팀 (Pixel 7): 중1 아들 + 아빠. 아빠가 폰을 쥐고 화면 글을 읽지 않고 보이는 단추를 다 눌러 봄, 아이 대신 답함, "한 번이면 됐지" 하며 서두름.
- F 하늘 탐험대 (iPhone 13): 초4 쌍둥이 + 엄마. 차분함.
초3(A 아이·D 동생)은 '가속도'·'변인' 같은 낱말을 모릅니다 — 화면에 🧒 쉬운 말이 있으면 그걸 읽고 알게 됩니다(그렇게 적기).

[팀이 고를 것 · 실제로 한 일]  (교사가 그 장을 띄웠을 때만 합니다. 폰에 그 화면이 안 나오면 '안 나옴'으로 적고 하지 않습니다)
- 힘(처음 생각): A '세게 움직이는 것' · B '원인'(아빠가 아이보다 먼저) · C '가지고 있는 것' · E '원인'(아빠) · F '세게 움직이는 것' · D 아직 없음
- 가속도: A '빠른 정도' · B '속도가 변하는 정도' · C '빠른 정도' · D(막 들어옴) '움직인 거리' · E '빠른 정도' · F '빠른 정도'
- 압력: A '공기의 무게' · B '누르는 힘의 크기' · C '누르는 힘의 크기' · D '공기의 무게' · E '일정한 넓이' · F '누르는 힘의 크기'
- ‘펑’ 퀴즈: A '뚜껑이 차가워져서'(아이 "차가워서 쪼그라들어서!") · B '이산화 탄소'(아빠) · C '이산화 탄소' · D '이산화 탄소' · E '물이 무거워져서' · F 는 엄마가 화장실에 가서 **풀이가 열린 뒤에** '이산화 탄소'
- 1차시 계획 (먼저 '변인 통제' 퀴즈가 나오면: A·B·F '무엇 때문에' · C '여러 가지를 한꺼번에' · D·E '빨리 끝내려고' — 한 번만 고름):
  A 물의 양, ② = 20 mL (S.planStep(pg.A, 1, 1)), 🔮 '길어질', 까닭 "물이 많으면 무거워서"
  B 물의 온도, ② = 30 °C (그대로), 🔮 '짧아질', 까닭 "따뜻하면 빨리 녹아서"
  C 발포비타민 양, ② = 1 알 (+1), 🔮 '짧아질', 까닭 "많이 넣으면 거품이 많아서"
  D 조각 크기, ② = 가루 (+2), 🔮 '짧아질', 까닭 안 씀(남매가 싸우다 그냥 보냄)
  E 물의 온도, ② = 10 °C (−2), 🔮 아빠가 첫 보기를 아무 생각 없이 누름, 까닭 안 씀
  F 발포비타민 양, ② = ¼ 알 (−2), 🔮 '길어질', 까닭 "조금 넣으면 기체가 적어서"
  (② 값이 화면에서 위와 다르게 보이면 + / − 로 맞추고, 못 맞추면 '막힘')
- 1차시 잰 값 (초, ⏱ 초시계 — ① 3번 다음 ② 3번):
  A ① 12.4 15.1 13.2 → ② 18.3 21.0 19.4
  B ① 14.2 16.1 15.0 → ② 13.4 15.6 14.1 → 아빠 "40도도 해 보자" → 40 °C ('+1') 9.1 10.2 9.4
  C ① 15.3 13.1 16.0 → ② 8.2 9.0 8.4
  D ① 14.1 15.3 13.4 → ② 7.2 8.1 7.5
  E ① 15.0 12.2 16.1 → ② 17.3 14.0 18.1
  F ① 14.0 15.2 13.1 → ② 22.4 24.0 21.3
  예) R.run1(S, pg.A, [{v:0,s:12.4},{v:'same',s:15.1},{v:'same',s:13.2},{v:1,s:18.3},{v:'same',s:21.0},{v:'same',s:19.4}])
  B 의 셋째 값: … {v:'+1',s:9.1},{v:'same',s:10.2},{v:'same',s:9.4}
  ※ 측정 걸음은 몇 분 걸립니다 — Bash 를 부를 때 timeout 600000 으로. curl 이 끊기면 서버는 계속 돌므로 1분 뒤 R.glance 로 어디까지 했는지 보고 남은 것만 다시.
  여섯 팀을 한 걸음에서 함께: const out = await Promise.all(['A','B','C','D','E','F'].map(async k => [k, await R.run1(S, pg[k], PLAN[k])])); return out;
  다 잰 뒤 결과 화면에서 '📊 결과 비교 보기'를 누르는 팀은 A·B·C·F(E·D 는 안 누름): await pg.A.locator('[data-go="t1-graph"]:visible').click() 뒤 S.scr 로 표·문구를 읽음 (2차시도 같게 t2-graph)
- 1차시 도전 (목표 15초): A '10 mL' 15.8 · B '20 °C' 14.6 · C '1 알' 8.6("빨리 펑 하는 게 재밌어서") · D 안 함 · E '10 °C' 19.0 · F '½ 알' 14.4
- 🛠 로켓 만들기 (2차시 처음, 12분): 화면 네 단계를 실제로 다 만든 때(시간표 분): B 52 · A 53 · F 54 · D 55 · C 58(할머니가 날개 간격을 맞추느라) · E 는 46분에 아빠가 네 칸을 한꺼번에 누르고 '✅ 다 만들었어요'(날개는 아직 안 붙임, 아이가 "아빠 아직 날개 안 했어!")
  한 칸 누르기: await pg.A.click('[data-build="body"]')  (body · fins · nose · clay), 다 하면 await pg.A.click('#ev-build-done')
  교사 차례 T9 다음(=S9)은 44~56분: C 는 세 칸만(clay 빼고) 누른 채로 보내고, S10 에서 마저(58분).
- 로켓은 왜 솟고·무거우면 (퀴즈 둘 차례로): A·C·F 둘 다 맞는 것('물과 기체를 아래로 밀어내고…' → '가속도가 작아져서…') · B 아빠 '빨아올려서' → 아이가 둘째를 맞힘 · D '발포비타민이 가벼워서' → '가속도가 커져서' · E '빨아올려서' → '아무 차이가 없어요'
- 2차시 계획: A 몸체 무게 ② 2개(+1) '낮아질' "무거우면 덜 빨라져서" · B 물의 양 ② 15 mL(그대로) '높아질' "물이 많으면 세게 밀어서" · C 발포비타민 양 ② 1 알(+1) '높아질' "거품이 많으면 세게 밀어서" · D 날개 수 ② 0장(−3) '높아질' "날개가 없으면 가벼워서" · E 몸체 무게 ② 1개(그대로) '낮아질' 까닭 안 씀 · F 물의 양 ② 20 mL(+1) '높아질' 까닭 안 씀
- 2차시 잰 값 (아이 키의 %, 🎥 녹화 — D 만 👀 눈으로):
  A ① 82 86 79 → ② 55 60 52
  B ① 72 84 76 → ② 80 90 77
  C ① 60 65 58 → ② 98 105 95   ※ 할머니가 1 알로 바꿀 때 "잘 녹게" 하며 물도 한 스푼 더 넣었음(화면 칸은 안 바꿈, 손녀는 봤지만 중요하다고 생각 안 함)
  D 동생이 녹화를 두 번 망쳐 👀: ① same same same → ② low low same
  E 아빠 "한 번이면 됐지": ① 85 → ② 75 (같은 조건 반복 안 함)
  F ① 70 74 68 → ② 88 92 → (와이파이 끊김: await S.net(pg.F,false)) → ② 셋째 85 → 끊긴 채 2분(await pg.F.waitForTimeout(120000)) → R.glance 로 F 화면 보기 → await S.net(pg.F,true) → 8초 뒤 S.sendNow(pg.F) → F 화면 다시 보기
  예) R.run2(S, pg.D, [{v:0,hand:'same'},{v:'same',hand:'same'},{v:'same',hand:'same'},{v:1,hand:'low'},{v:'same',hand:'low'},{v:'same',hand:'same'}])
- 2차시 도전 (목표 아이 키의 100 %): A '0개' 84 · B '15 mL' 92 · C '1 알' 101 · D '3장' 👀 same · E 안 함(아빠가 '정리로' 쪽을 누르려 함 — 화면에 그런 단추가 있으면 누르고 무엇이 나왔는지 적기) · F '20 mL' 95
- 다시 풀기(정리, 점수 있음): A·B·F 셋 다 맞는 보기 · C 힘·가속도 맞음, 압력 '누르는 힘의 크기' 그대로 · D 힘·압력 맞음, 가속도 '움직인 거리' 그대로 · E 아빠가 셋 다 첫 보기
- 정리 문장 ('✍️ 우리 팀 정리 문장' — 1차시·2차시 칸이 따로 나오면 둘 다): 결과는 팀이 잰 숫자를 보고 고르고, '왜냐하면'은 보기 중 팀 말과 가장 가까운 것(없으면 직접 쓰기 칸에 아래 말):
  A 1차시 "물이 많아 기체가 모일 자리가 줄어서"(보기에 있으면 그것) / 2차시 "무거우면 가속도가 작아서"
  B 1차시는 20 °C 와 30 °C 를 견줘 보고 고름 / 2차시 "물이 많으면 세게 밀어서"
  C 1차시 "기체가 많이 생겨서" / 2차시 "기체가 많아서"
  D 1차시 "가루가 빨리 녹아서" / 2차시는 동생이 아무거나
  E 1차시 아무거나 / 2차시는 화면대로(무엇이 나왔는지 그대로 적기)
  F 1차시 "기체가 적게 생겨서" / 2차시 결과만 고르고 까닭은 안 씀
  누르기: const box = pg.A.locator('[data-concl="t1"]'); await box.locator('[data-dir="up"]').click(); await box.locator('[data-why]').filter({ hasText: '기체' }).first().click();  (up = 길어졌어요/높아졌어요, down = 짧아졌어요/낮아졌어요, same = 비슷했어요) → 맞는 보기가 없으면 await box.locator('.ev-why-in').fill('팀 말'); await box.locator('.ev-why-in').dispatchEvent('change') → 다 하면 await pg.A.click('#ev-concl-send')
- 결과 카드: 화면이 나오면 '📥 이미지로 저장' 한 번(A·C·F), 나머지는 보기만.

[차례마다 — 교사 메시지(교사가 한 말·띄운 장·기다림·묶음)를 받으면]
1. 묶음을 넣고 R.glance 로 여섯 폰을 봅니다(사람이 폰을 봄). 교사 말에 가족이 소리 내어 한 말을 정합니다(누가 까닭을 말했나 · 반박이 있었나 · 화면을 읽었나 · 아이가 했나 어른이 했나).
2. 위 [팀이 고를 것]에서 지금 장에 맞는 것만 합니다. 교사가 물으면(예: "몇 초부터 몇 초까지?", "차이가 흔들림보다 큰가요?") **폰에 보이는 것만 보고** 인물대로 대답을 정합니다 — 폰에 숫자가 안 보이면 '폰에 안 보여요'라고 대답합니다.
3. return S.out('S<n> 메모') → 교사 세션에 send_message: 맨 위 '[학생 S<n> · 시간표 ○분]' + 팀마다 한 줄(한 말·한 일·막힌 곳·폰 화면이 무엇이었나) + 묶음 내용 그대로.
4. 측정 차례(1차시·2차시)에서 run 이 실제로 오래 걸리면(몇 분) 그대로 두고, 메시지에 '측정이 시간표 안에 다 들어갔음/○분 늦어짐'을 적습니다(측정 장 하나 = 1차시 14분, 2차시 11분으로 셈).
5. 교사 메시지가 올 때까지 기다립니다(sleep·폴링 하지 않기 — 메시지가 오면 깨어납니다).

[S1 — 교사 T1 메시지를 받으면]  묶음을 /tmp/vc-rocket5/in-1.json 으로 저장한 뒤 /tmp/s.js:
  S.in('/tmp/vc-rocket5/in-1.json');
  const link = '<교사가 보낸 수업 주소>';
  const out = {};
  for (const [k, dev, name] of [['A', 'iPhone 13', '별빛가족'], ['B', 'iPhone 13', '달님 탐험대'], ['C', 'Pixel 7', '할머니와 나'], ['E', 'Pixel 7', '번개팀'], ['F', 'iPhone 13', '하늘 탐험대']]) {
    const P = await S.phone(k, dev); out[k] = await S.enter(P, link, name);
  }
  out.가로스크롤 = [await S.hscroll(pg.A), await S.hscroll(pg.C)];
  return out;
D 는 S3(교사가 가속도 장을 띄운 뒤)에서: const P = await S.phone('D', 'iPhone 13'); return await S.enter(P, '<수업 주소>', '티격태격');

[기록 — 수업이 끝나면]
  git worktree add /tmp/rec-s -b claude/virtual-class-student-rocket5 origin/claude/virtual-class-student-rocket4
  /tmp/rec-s/docs/virtual-class/student/film-rocket.md 끝에 '## 5차 (2026-11-27) — 가족 6팀' 절(method.md 틀):
   막힌 곳(상·중·하, 장면·화면 id·폰 글 그대로) · 팀별 대화 기록(분·팀·장·까닭을 말한 사람·반박·화면을 읽었나) · 인물이 화면에서 헷갈린 글 ·
   교사 세션이 물어 온 지표가 있으면 '학생 쪽에서 본 값'만(판정은 하지 않음) · 실제 기기 확인 필요(진짜 카메라·와이파이·젖은 손 등)
  cd /tmp/rec-s && git add docs/virtual-class/student/film-rocket.md && git commit -m "가상 수업: 필름통 로켓 5차 학생(가족) 기록" && git push -u origin claude/virtual-class-student-rocket5
  draft PR (base main, 제목 '가상 수업: 필름통 로켓 5차 학생 기록'), 통합 관리 세션에 send_message 로 PR 번호.
````
