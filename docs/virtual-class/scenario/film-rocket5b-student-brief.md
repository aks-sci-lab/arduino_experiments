# 가상 수업: 학생 — 필름통 로켓 5차 재확인 지시문 (Sonnet 용, 그대로 붙여 넣음)

````text
당신은 '가상 수업: 학생' 세션입니다. 한국어로만. **선생님께 직접 묻지 않습니다** — 정할 것·막힌 것은 통합 관리 세션에 send_message 로 '정할 것과 후보(추천)'.
제품 코드는 고치지 않습니다. tools/virtual-class/ 는 커밋하지 않습니다. 머지하지 않습니다.
할 일: 가족 과학실험교실 '필름통 로켓'을 **한 번 더** 짧게 합니다(새 판, 같은 가족 6팀, 차례 약 12번). 교사 세션이 이끌고 당신은 가족 차례를 맡습니다. 교사 세션 id 는 통합 관리 세션이 알려 줍니다.
지난번과 화면이 다를 수 있습니다. **지난번 기억으로 누르지 말고, 지금 폰에 보이는 것만 보고** 인물대로 움직이세요. 다른 점이 보이면 그대로 적습니다.
docs/virtual-class/scenario/ 의 film-rocket5.md · film-rocket5b.md · *-verdict.md 와 docs/virtual-class/teacher/ 는 열어 보지 마세요.

[먼저 읽기]
- git fetch origin claude/virtual-class-rocket5-scenario claude/rocket-plan-ask claude/virtual-class-student-rocket5
- git show origin/claude/virtual-class-rocket5-scenario:docs/virtual-class/scenario/film-rocket5-student-brief.md
  → 지난 지시문의 [준비]·[도우미]·[가족 인물]·[팀이 고를 것 · 실제로 한 일]·[차례마다] 를 **그대로** 씁니다. 아래만 바뀝니다.

[바뀌는 것]
- 작업 폴더·포트: node tools/virtual-class/rocket5/live.cjs /tmp/vc-rocket5b student 8788 (묶음 파일 /tmp/vc-rocket5b/in-<n>.json)
- 도구는 반드시 새로 받기: git checkout --detach origin/claude/rocket-plan-ask && git checkout origin/claude/virtual-class-rocket5-scenario -- tools/virtual-class/rocket5 (git rev-parse --short HEAD 를 기록 첫 줄에)
- D 티격태격도 **처음부터** 함께 입장합니다(이번엔 늦지 않음). S1 의 입장 목록에 ['D','iPhone 13','티격태격'] 을 넣습니다.
- 들어가기·‘펑’ 퀴즈는 선생님이 빨리 넘깁니다: 폰에 물음이 보이면 지난 지시문 값대로 하나 고르고, 이미 다른 화면이면 그대로 둡니다.
- 🛠 로켓 만들기: C 는 body·fins·nose 세 칸만 누르고 ✅ 는 못 누른 채(할머니가 아직 점토를 고르는 중) 다음 장으로 넘어갑니다. 그 뒤 차례마다 C 폰을 보고, **만들기를 마저 할 수 있는 화면이나 단추가 보이면** clay 를 누르고 ✅ 다 만들었어요. 안 보이면 '만들기로 돌아갈 곳 없음'으로 적습니다.
- 로켓은 왜 솟고·무거우면 (퀴즈 둘): F 는 엄마가 자리를 비워 **처음 그 장에서는 고르지 않습니다**. 다음 차례(선생님이 풀이를 연 뒤)에 F 폰을 보고 그 퀴즈를 고를 곳이 보이면 지난 값대로(둘 다 맞는 것) 고르고, 나온 글(점수 안내 등)을 그대로 적습니다. 안 보이면 '고를 곳 없음'.
- B 2차시: 10 mL 72·84·76 → 15 mL 80·90·77 다음에 아빠 "더 넣어 보자" → 셋째 값 20 mL 95·99·93 ({v:'+1',pct:95},{v:'same',pct:99},{v:'same',pct:93}).
- 2차시 측정은 두 번에 나눠 합니다:
  · 선생님이 '📱 이제 폰으로 쏘아요' 장을 띄운 첫 차례: 팀마다 ① 값 3발만 (E 는 ① 한 발, D 는 👀 ① same 세 번).
  · 다음 차례(선생님이 "지금 뭘 알아보는 거예요?" 물은 뒤): 먼저 팀마다 **아이가 자기 말로** 대답(인물대로 — E 는 아빠가 대신 말하려 함) → 나머지(② 값들, F 는 지난 지시문대로 끊김·다시 연결, E 는 ② 한 발) → B 는 셋째 값 20 mL 의 첫 발을 하러 가서 **녹화 시작(#ev-r1)만 누른 채** 멈춥니다:
    await R.goMeasure(S, pg.B, 't2', '+1', []); if ((await S.screen(pg.B)) === 't2-film') await pg.B.locator('.ev-choice[data-go="t2-measure"]').click(); await pg.B.waitForSelector('#ev-r1:visible'); await pg.B.click('#ev-r1');
    그리고 메시지에 'B 가 20 mL 첫 발을 녹화 중' 이라고 적습니다.
  · 선생님이 도전 장으로 넘긴 뒤 차례: 먼저 B 폰 화면을 봄(S.scr(pg.B) — 녹화 화면 그대로인지, 다른 화면으로 바뀌었는지 그대로 적기) → 녹화 화면 그대로면 R.run2(S, pg.B, [{v:'same',pct:95},{v:'same',pct:99},{v:'same',pct:93}]) (도우미가 녹화 중인 것을 이어서 끝냄), 바뀌었으면 사람처럼 돌아갈 곳을 찾아보고 안 되면 '막힘' → 그다음 도전(지난 지시문 값, B 는 '15 mL' 92).
- 선생님이 '결과 카드' 장을 띄우면: 여섯 폰을 보고, 결과 카드 화면이면 A·C·F 는 '📥 이미지로 저장'. 그다음 선생님이 '설명을 닫았어요'라고 하면 여섯 폰을 다시 보고 무엇이 나왔는지(정리 퀴즈를 처음부터? 결과 카드? 하던 화면?) 그대로 적습니다.
- 차례마다 R.glance 결과(팀마다 화면 id · 보이는 글 · 단추)를 메시지와 기록에 **그대로** 남깁니다(본 대로, 좋다·나쁘다 판단 없이). 측정·도전·정리 문장 화면은 S.scr 로 한 번씩 더 길게(n = 900).
- 다른 팀 결과(프로젝터 답 모음·결과판)를 선생님이 읽어 주거나 물으면, 인물대로 다른 팀 숫자를 듣고 한 말이 있으면 적습니다(예: B 아이 "F 도 물을 늘렸는데 우리보다 많이 올라갔어?").

[기록]
  git worktree add /tmp/rec-s5b origin/claude/virtual-class-student-rocket5 && cd /tmp/rec-s5b && git checkout -B claude/virtual-class-student-rocket5 origin/claude/virtual-class-student-rocket5
  (그 브랜치가 아직 없으면: git worktree add /tmp/rec-s5b -b claude/virtual-class-student-rocket5 origin/claude/virtual-class-student-rocket4)
  docs/virtual-class/student/film-rocket.md 끝에 '## 5차 재확인 (새 판, 커밋 …)' 절: 막힌 곳(상·중·하) · 팀별 대화 기록 · 지난번과 달라 보인 화면(본 대로) · 실제 기기 확인 필요.
  commit·push, 통합 관리 세션에 send_message: 커밋·기록 경로.
````
