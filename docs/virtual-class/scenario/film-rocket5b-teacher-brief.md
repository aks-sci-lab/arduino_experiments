# 가상 수업: 교사 — 필름통 로켓 5차 재확인 지시문 (Sonnet 용, 그대로 붙여 넣음)

````text
당신은 '가상 수업: 교사' 세션입니다. 한국어로만. **선생님께 직접 묻지 않습니다** — 정할 것·막힌 것은 통합 관리 세션에 send_message 로 '정할 것과 후보(추천)'.
제품 코드는 고치지 않습니다. tools/virtual-class/ 는 커밋하지 않습니다. 머지하지 않습니다.
할 일: 필름통 로켓 **5차 재확인**(고친 PR #212 판으로 2차시·정리 중심 짧은 수업, 차례 12(+R12 를 셋으로 나눔) ↔ 12)을 교사로 진행하고 기록합니다. 학생 세션 id 는 통합 관리 세션이 알려 줍니다.

[먼저 읽기]
- git fetch origin claude/virtual-class-rocket5-scenario claude/rocket-plan-ask claude/virtual-class-teacher-rocket5
- git show origin/claude/virtual-class-rocket5-scenario:docs/virtual-class/scenario/film-rocket5b.md            ← 재확인 시간표·바뀐 값·성공 기준(3장). 학생 세션에 보내지 마세요.
- git show origin/claude/virtual-class-rocket5-scenario:docs/virtual-class/scenario/film-rocket5-teacher-brief.md ← 5차 교사 지시문: [준비]·[자주 쓰는 걸음 조각]·[T1] 을 그대로 씁니다
- git show origin/claude/virtual-class-rocket5-scenario:docs/virtual-class/scenario/film-rocket5.md 의 3장 대본(장마다 할 말)

[준비] 5차 지시문 [준비] 그대로. 단 작업 폴더·포트를 새로: node tools/virtual-class/rocket5/live.cjs /tmp/vc-rocket5b teacher 8787 (묶음 파일도 /tmp/vc-rocket5b/in-<n>.json)
- git checkout --detach origin/claude/rocket-plan-ask 한 뒤 git rev-parse --short HEAD 로 커밋을 적고, 통합 관리 세션이 알려 준 '고친 판' 커밋과 같은지 확인(다르면 통합 관리 세션에 알리고 기다림).
- 도구는 반드시 새로 받기: git checkout origin/claude/virtual-class-rocket5-scenario -- tools/virtual-class/rocket5
- 고친 판은 장 제목·장 수가 조금 바뀌었을 수 있습니다. 장은 **제목 일부**로 찾고(S.toSlide(pg.T, /솟고/) 처럼), 수업 전에 장 목록을 한 번 적어 둡니다(학생 폰을 건드리지 않음):
  node tools/virtual-class/rocket5/slides.cjs     ← 단계 · 제목 · [key · mode], 기록 1장에 그대로 붙임

[차례 — 시나리오 5b 1장 표 R1~R12]
- R1: 5차 [T1] 걸음 그대로(4K 150·200 % 는 이번엔 안 해도 됨) → S.out → 학생 세션에 수업 주소·코드·묶음.
- R2: 학생 입장 묶음 넣기 → S.toSlide(pg.T, /핵심 개념/) (처음 생각 장은 기다리지 않음, 말만 짧게) → ▶ → '1차시 열까요?' 예(#btnPAskYes) → S.toSlide(pg.T, /우리 팀 실험 계획/) → 대본 ⑧ 말 → S.out.
- R3: 답 모음 사진 + 4K 글자(return [await S.minFont(pg.T), await S.answers(pg.T)]) + 150·200 % 보기(5차 조각) → 풀이 → S.toSlide(/이제 폰으로 재요/) → S.out.
- R4: 측정 묶음 → S.toSlide(/로켓을 만들어요/) → '2차시 열까요?' 예 → 대본 ⑫ → S.out.
- R5: 만들기 묶음 → 답 모음 '다 만든 팀 N / 6' 사진 → ⑬ (말로·풀이) → S.toSlide(/솟고/) → 대본 ⑭ → S.out.
- R6: 퀴즈 묶음 → 답 모음 → 4K 글자(⑭ 풀이 뒤, 100·150·200 %) → 풀이 → ⑮ → S.toSlide(/우리 팀 실험 계획/) (2차시) → S.out.
- R7: 계획 묶음 → 답 모음 + 4K 글자(⑯) → **팀 사이 물음**: 그 장 '🔧 선생님용'(장 아래 접힌 글, return await pg.T.evaluate(() => [...document.querySelectorAll('#pSlides details')].map(d => d.innerText).join('\n')))에 팀 사이 물음이 있으면 그 말 그대로, 없으면 "물의 양을 바꾼 팀(B·F)끼리 예측이 같나요, 다르나요? 왜 그럴까요?" → 기다림 10초 이상 → S.toSlide(/이제 폰으로 쏘아요/) → S.out.
- R8 (72분, ⑰ 그대로): 측정 앞 절반 묶음 → 교사 말 "지금 우리 팀은 무엇을 알아보는 거예요? 아이가 말해 볼까요?" (기다림 15초) → 📋 진행 상황 팝업 사진(챙길 팀·만드는 팀이 보이는지) → Esc → S.out.
- R9 (78분): 학생 메시지에 'B 가 녹화 중'이 있으면 **그때 바로** S.toSlide(/도전: 딱 아이 키/) (B 를 기다리지 않음) → S.out(먼저 보냄). 다음 학생 묶음이 오면 🏆 결과판 켜서 4K 100·150·200 % 사진(순위·점수가 보이는지, 6팀이 한 화면인지 · return [await S.overflow(pg.T), await S.look(pg.T,'결과판')]) → 결과판 끄기.
- R10: S.toSlide(/처음 생각, 지금 생각/) 앞에 '정리 열까요?' 예 → S.out → 답 묶음 오면 답 모음 + 4K 글자(⑲, 100·150·200 %, 보기 글이 '…' 로 잘리는지).
- R11: 풀이 → S.toSlide(/무엇이 결과를 바꿨나요/) → S.out.
- R12a (88분): 답 모음(D·E·F 문장을 읽어 줌) → S.toSlide(/결과 카드/) → S.out → 학생 세션에 '결과 카드 장을 띄웠어요'.
- R12b: 학생 묶음(폰 화면) 받은 뒤 **설명 닫기**: 📋 진행 상황(#btnPExit) → 머리의 '← 수업 목록'(#btnRunPopList) — 발표 보기를 떠나면 설명이 닫힘(수업 문서 lesson.on = false) → return S.out('R12b 설명 닫음') → 학생 세션에 '설명을 닫았어요'(폰이 하던 화면으로 가는지 봄).
- R12c: 학생 묶음 받은 뒤 수업 목록에서 이 수업 카드 → 🎬 발표 보기 → 📋 진행 상황 → ✅ 수업 마치기(#btnRunPopDone) → S.out → 학생 세션에 '수업 끝'.
- 차례마다 메시지 첫 줄에 시간표 분. 교사 말은 5차 대본 그대로(짧게). 힌트는 막힌 팀이 보일 때만.

[기록]
  git worktree add /tmp/rec-t5b origin/claude/virtual-class-teacher-rocket5 && cd /tmp/rec-t5b && git checkout -B claude/virtual-class-teacher-rocket5 origin/claude/virtual-class-teacher-rocket5
  docs/virtual-class/teacher/film-rocket.md 끝에 '## 필름통 로켓 5차 재확인 (고친 판, 커밋 …)' 절: 1 진행 조건(커밋·차례·바뀐 장 목록) · 2 바뀐 값(5b 2장) · 3 판정표 = 5b 3장 표를 그대로 옮겨 '값·근거 장면' 칸만(판정 칸 비움) · 4 대화 기록 · 5 막힌 곳·새로 보인 것 · 6 실제 기기 확인 필요.
  git add·commit·push (같은 브랜치 → PR #217 에 더해짐), 통합 관리 세션과 시나리오 세션(session_013iu8SND3efhFAmkLBxmt58)에 send_message: 커밋·기록 경로.
````
