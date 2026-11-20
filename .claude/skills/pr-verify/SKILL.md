---
name: pr-verify
description: 하위 세션이 올린 PR 을 머지 전에 통합 관리 세션이 직접 확인하는 방법. PR 설명을 믿지 않고 최신 main 과 합친 상태로 전체 시험, Firestore 규칙 에뮬레이터 시험, 보안 점검(남의 자료 읽기·요금 새는 길·비밀값·받은 글 실행), 노트북·폰·태블릿 화면 확인까지. "PR 확인해", "검증해", "머지해도 돼?" 전에 쓴다.
---

# PR 검증

`AGENTS.md` '작업 과정' 6번(확인)의 실제 순서다. 결과는 사용자에게 **한국어로**, 머지 여부는 **선택 목록으로** 묻는다.

## 1. 가져오기 (작업 폴더를 따로)

```bash
R=$(gh api repos/aks-sci-lab/arduino_experiments/pulls/<번호> -q '.head.ref+" "+.head.sha'); B=${R% *}
git fetch -q origin main $B
git merge-base --is-ancestor origin/main origin/$B && echo "main 포함"   # 아니면 아래처럼 합쳐서 시험
rm -rf ../wt-pr && git worktree add -q ../wt-pr origin/$B
git diff --stat origin/main...origin/$B | tail -30
```

- main 을 포함하지 않으면 작업 폴더에서 `git merge --no-edit origin/main` 해 본다. `AGENTS.md` 진행 기록 충돌은 두 줄 다 남기면 된다(충돌 표시 사이를 위·아래 순서로 이어 붙이기). 다른 파일 충돌은 PR 세션에 돌려보낸다.
- 끝나면 `git worktree remove --force ../wt-pr; git worktree prune`.

## 2. 시험

```bash
cd ../wt-pr && timeout 590 node --test tests/*.test.cjs 2>&1 | grep -E "^# (tests|pass|fail|skipped)|^not ok"
python3 -I -m unittest discover -s tests -p 'test_*.py' 2>&1 | grep -E "^Ran|^OK|FAILED"
```

- 전체가 2분을 넘으므로 백그라운드로 돌리거나 `timeout` 을 넉넉히.
- **한꺼번에 돌릴 때만 시간 초과가 나는 화면 시험**: `tests/face-hr-ui.test.cjs`, `tests/heart-rate-phone-ui.test.cjs`. 실패하면 그 파일만 다시 돌려 통과하는지 보고, 보고할 때 그렇게 적는다. 다른 시험이 실패하면 진짜 문제로 본다.
- **규칙(`firestore.rules`)이 바뀌었으면 에뮬레이터로** — 평소 전체 시험에서는 `FIRESTORE_EMULATOR_HOST` 가 없어 건너뛴다:

```bash
E=<scratchpad>/emu; mkdir -p $E && cd $E && [ -f package.json ] || npm init -y >/dev/null
npm i --silent @firebase/rules-unit-testing@3 firebase@10 firebase-tools@13.29.1   # 한 번만 (자바는 이미 있음)
cd <작업 폴더> && NODE_PATH=$E/node_modules $E/node_modules/.bin/firebase emulators:exec --only firestore --project demo-x \
  "NODE_PATH=$E/node_modules node --test tests/firestore-rules*.test.cjs tests/report-ai-rules.test.cjs"
```

  - `NODE_PATH` 를 바꾼 채 **전체** 시험을 돌리면 Playwright 를 못 찾아 화면 시험이 건너뛰어진다 — 규칙 시험 파일만 이렇게 돌린다.
  - 의심 가는 길은 직접 작은 시험(`tests/zz-probe.test.cjs`, 끝나면 지움)으로 확인: `RUT.initializeTestEnvironment` → `withSecurityRulesDisabled` 로 문서 넣기 → `authenticatedContext('stranger', { firebase: { sign_in_provider: 'anonymous' } })` 로 읽기·목록이 거절되는지.

## 3. 보안 점검 (꼭)

- **남의 자료**: 학생(익명)이 다른 수업·다른 조·다른 선생님 자료를 get·list 할 수 있나. 짧은 코드(수업 코드 `반-4자리` ≈ 99만 개, 조 코드)는 스크립트로 훑을 수 있다 — 짧은 코드로 긴 공간 id 를 알려 주는 문서는 **기간 제한을 규칙에서**(클라이언트 검사만으로는 안 됨, 예: `labClassCodes` 의 `joinUntil`).
- **요금 새는 길**: 선생님 키·서버 비용을 쓰는 기능(보고서 AI 등)은 한도를 무엇으로 세는지. 학생이 바꿀 수 있는 값(조 코드·uid)으로만 세면 우회된다 — 수업의 실제 조 목록 확인·수업 전체 상한·기기별 상한.
- **비밀값**: `git diff origin/main...HEAD | grep -nE "sk-|AIza|BEGIN PRIVATE|key.txt"`. `AIzaSyCYVme6…` 는 원래 공개인 Firebase 웹 설정값(기존 `js/phone-accel-cloud.js` 와 같으면 괜찮음). API 키·서비스 계정은 절대 커밋·Firestore 에 넣지 않는다.
- **받은 글 실행**: 다른 기기에서 온 값을 `innerHTML` 로 넣는 곳이 `esc()`·숫자 변환(`cleanSample` 같은 정리)을 거치는지.
- **개인정보**: 이름·학번·성별을 받지 않는지, `firestore.rules` 안 선생님 이메일을 PR 설명·글에 옮기지 않는지.

## 4. 화면 (노트북·폰·태블릿)

- 작업 폴더에서 `python3 -m http.server <포트>` 를 띄우고 Playwright 로 연다. 외부 CDN(Chart.js·QR)은 막히거나 느릴 수 있으니 라우트로 막고(`r.abort()`) 페이지가 오류 없이 뜨는지 본다. 필요하면 npm 으로 받은 파일로 대신 채운다.
- 기기: 노트북 `{ viewport: { width: 1280, height: 900 } }`, 폰 `devices['iPhone 13']`, 태블릿 `devices['Galaxy Tab S4']`, 또는 주소 `?device=`.
- 볼 것: 노트북에 측정 단추가 없는지·QR 카드, 폰에 측정 단추, 태블릿 둘 다, `document.documentElement.scrollWidth > innerWidth`(가로 스크롤), `pageerror` 없음. 7단계 실험은 1단계로 열고 5단계를 눌러도 QR 이 나오는지.
- 사용자에게 보여 줄 캡처는 `SendUserFile` 로(폰 하나·노트북 하나면 충분).

## 5. 결과 정리

- 고칠 것이 있으면 **PR 세션에 send_message** 로: 문제(재현 방법·확인한 결과), 고칠 것 번호 목록, 추가할 시험. 같은 PR 에 push 해 달라고.
- 문제가 없으면 사용자에게: 확인한 것(숫자로), 확인 못 한 것(실제 기기·실제 키 등), 머지하면 바로 바뀌는 점·선생님이 먼저 할 일(예: 콘솔 설정) → 선택 목록으로 머지 여쭙기. 머지는 `merge-deploy-check` 스킬.
