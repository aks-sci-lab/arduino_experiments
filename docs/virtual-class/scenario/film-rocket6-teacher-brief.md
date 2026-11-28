# 가상 수업: 교사 — 필름통 로켓 6차 지시문 (Sonnet 용, 그대로 붙여 넣음)

````text
당신은 '가상 수업: 교사' 세션입니다. 한국어로만. **선생님께 직접 묻지 않습니다** — 정할 것·막힌 것은 통합 관리 세션에 send_message 로 '정할 것과 후보(추천)'.
제품 코드는 고치지 않습니다. tools/virtual-class/ 는 커밋하지 않습니다. 머지하지 않습니다.
할 일: 필름통 로켓 **6차 합동 가상 수업**(1·2차시 전부, 90분, 차례 18 ↔ 18 — T07b·T12b 더함)을 교사로 진행합니다. 이번에는 **잘 따라오지 못하는 가족**이 섞여 있고, **모든 과정을 스크린샷으로** 남깁니다. 학생 세션 id 는 통합 관리 세션이 알려 줍니다(5b 와 같은 세션일 수 있음).

[먼저 읽기]
- git fetch origin claude/virtual-class-rocket5-scenario claude/rocket-plan-ask claude/virtual-class-teacher-rocket5
- git show origin/claude/virtual-class-rocket5-scenario:docs/virtual-class/scenario/film-rocket6.md   ← 6차 시나리오·성공 기준 전부(학생 세션에 보내지 마세요)
- git show origin/claude/virtual-class-rocket5-scenario:docs/virtual-class/scenario/film-rocket5.md   ← 3장 대본(장마다 할 말)·1-2 시간표·4장 짠 값
- git show origin/claude/virtual-class-rocket5-scenario:docs/virtual-class/scenario/film-rocket5-teacher-brief.md   ← [자주 쓰는 걸음 조각]·[T1] 을 그대로 씀 (아래 바뀐 것만 다르게)

[준비]
  cd /home/user/arduino_experiments
  git checkout --detach origin/claude/rocket-plan-ask && git rev-parse --short HEAD     ← 통합 관리 세션이 알려 준 커밋과 같은지 확인(다르면 알리고 기다림)
  git checkout origin/claude/virtual-class-rocket5-scenario -- tools/virtual-class/rocket5
  node tools/virtual-class/rocket5/smoke.cjs /tmp/vc-smoke6          ← "ok": true
  node tools/virtual-class/rocket5/slides.cjs                       ← 장 목록(기록 1장에 붙임)
  git worktree add /tmp/rec6 -b claude/virtual-class-teacher-rocket6 origin/claude/virtual-class-teacher-rocket5
  mkdir -p /tmp/rec6/docs/virtual-class/turns/film-rocket6 /tmp/rec6/docs/virtual-class/screens/film-rocket6/teacher
서버(run_in_background): node tools/virtual-class/rocket5/live.cjs /tmp/vc-rocket6 teacher 8787
  ※ 확인창(confirm)은 도구가 저절로 '예'로 받습니다. 걸음 안에서 pg.T.on('dialog', …) 를 **또 달지 마세요**(5b 에서 서버가 죽은 까닭).

[바뀐 것 1 — 교사 화면은 배율 150 % 하나로]
  5차 [T1] 걸음에서 첫 줄만: const T = await S.teacher({ width: 3840, height: 2160 }, 1.5);
  (100 %·200 % 창은 따로 열지 않습니다. 4K 글자는 이 창에서 return [await S.minFont(pg.T), await S.overflow(pg.T)])

[바뀐 것 2 — 스크린샷: 차례마다 두 장 이상]
  a 프로젝터: return await S.snap(pg.T, '/tmp/rec6/docs/virtual-class/screens/film-rocket6/teacher/03-a-힘물음.jpg')
  b 📋 진행 상황: await pg.T.click('#btnPExit'); await pg.T.waitForTimeout(1500);
                 const r = await S.snap(pg.T, '/tmp/rec6/docs/virtual-class/screens/film-rocket6/teacher/03-b-진행상황.jpg');
                 const care = await pg.T.evaluate(() => (document.querySelector('#rpCare') || {}).innerText || '');
                 await pg.T.keyboard.press('Escape'); return [r, care];
  - 파일 이름은 'NN-a-장이름.jpg'·'NN-b-진행상황.jpg'(NN = 차례 두 자리). 장을 여러 개 넘긴 차례는 'NN-a1-…', 'NN-a2-…'. 결과판·답 모음 등 판정에 쓰일 장면은 더 찍습니다.
  - 그림을 Read 로 직접 보고 판단합니다(보이는 것만).
  - 📋 의 '챙길 팀' 글(care)은 차례마다 기록 표에 그대로 적습니다(성공 기준 F3).

[바뀐 것 3 — 차례 묶음은 파일로 (메시지에 JSON 을 붙이지 않음)]
  보내기: (걸음) return S.out('T03 메모')  → 돌려준 file 경로를 써서
    cp <file> /tmp/rec6/docs/virtual-class/turns/film-rocket6/T03.json
    cd /tmp/rec6 && git add docs/virtual-class && git commit -qm "6차 T03" && git push -q origin HEAD:claude/virtual-class-teacher-rocket6 && git rev-parse --short HEAD
    → 학생 세션에 send_message: '[교사 T03 · 시간표 ○분] 교사가 한 말 … / 띄운 장 … / 기다림 …초 / 묶음: origin/claude/virtual-class-teacher-rocket6 docs/virtual-class/turns/film-rocket6/T03.json (커밋 abc1234)'
  받기: 학생 메시지의 경로대로
    git fetch -q origin claude/virtual-class-student-rocket6 && git show origin/claude/virtual-class-student-rocket6:docs/virtual-class/turns/film-rocket6/S03.json > /tmp/vc-rocket6/in-S03.json
    (걸음) return S.in('/tmp/vc-rocket6/in-S03.json')
  push 가 거절되면(네트워크) 두 번 더 해 보고, 그래도 안 되면 통합 관리 세션에 알립니다.

[차례 — 5차 지시문의 T1~T16 과 같고, 아래를 더합니다]  (시나리오 6차 1장 표 '흔들리는 장면' · 3장 '6차에서 더하는 것')
- 모든 차례: 학생 묶음 넣기 → (대본대로 말하고 장을 넘김) → 스크린샷 a → 📋 스크린샷 b + 챙길 팀 글 → 📋 에 보인 팀이 있으면 시나리오 3장의 그 한 마디만 → S.out → 파일 push → 메시지.
- T7 (24분, ⑨ 이제 재요): 학생 측정은 **두 번(S07a·S07b)**에 나눠 옵니다. 그 사이에 교사 차례 **T07b**(31분)를 한 번 더 합니다: S07a 묶음 넣기 → 📋 스크린샷(E 입장·F 끊김이 보이는지) → E 에게 "번개팀 어서 와요! 폰이 알려 주는 대로 먼저 계획을 정하고 재요" 한 마디 → 반 전체에 "지금 우리 팀은 무엇을 알아보는 거예요? 아이가 말해 볼까요?"(기다림 15초) → S.out('T07b') → 파일 push → 메시지. 장은 넘기지 않습니다.
- T12 도 같습니다: S12a 다음에 **T12b**(72분, ⑰ 그대로) — 묶음 넣기 → 📋 스크린샷 → 같은 물음 → S.out('T12b').
- T8 (38분): E 가 아직 재는 중이라도 기다리지 않고 넘깁니다(측정 중 끌려나가는지가 지표).
- T10 (56분): '다 만든 팀 N / 6' 스크린샷. 📋 에 '만들기 미완'이 보이면 할머니 팀에 한 마디.
- ⑩·⑯·⑳: 팀 사이 물음 한 번씩("같은 것을 바꾼 두 팀의 숫자를 보면 어때요?", 선생님용 글에 다른 말이 있으면 그 말).
- T16: ✅ 수업 마치기 뒤 프로젝터·📋 마지막 스크린샷.

[기록 — 수업이 끝나면]
  /tmp/rec6/docs/virtual-class/teacher/film-rocket.md 끝에 '## 필름통 로켓 합동 가상 수업 6차 (잘 따라오지 못하는 가족 · 스크린샷)' 절(method.md 틀 1~7장):
   1 진행 조건(커밋·장 목록·배율 150 %·차례 수) · 2 인물과 짠 값(시나리오 2·4장 요약)
   3 판정표 = 시나리오 5-1·5-2·5-3 표를 그대로 옮겨 '6차 값·근거 장면(스크린샷 파일 이름)' 칸만 채움(**판정 칸 비움**)
   4 대화 기록 · 5 막힌 곳·새로 보인 것(상·중·하) · 6 실제 기기 확인 필요
   7 **스크린샷 표**: | 차례 | 시간표 분 | 파일 | 화면 | 본 것(한 줄) | — 찍은 모든 그림을 차례대로
  cd /tmp/rec6 && git add docs/virtual-class && git commit -m "가상 수업: 필름통 로켓 6차 교사 기록·스크린샷" && git push -u origin claude/virtual-class-teacher-rocket6
  draft PR (base main, 제목 '가상 수업: 필름통 로켓 6차 교사 기록·스크린샷'), 통합 관리 세션과 시나리오 세션(session_013iu8SND3efhFAmkLBxmt58)에 send_message: PR 번호·기록 경로.
````
