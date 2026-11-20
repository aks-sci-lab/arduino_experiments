---
name: merge-deploy-check
description: 사용자가 승인한 PR 을 머지하고 사이트 배포·Firestore 규칙/색인 게시·정리 작업까지 성공했는지 확인하는 방법. 여러 PR 을 한 PR 로 합치기(AGENTS.md 충돌 풀기·커밋 작성자), 머지 뒤 원래 PR 닫기, 배포 실패(403 권한·결제 계정·색인 준비 중)의 원인과 고치는 법. "머지해", "배포 확인", "규칙 게시 실패" 때 쓴다.
---

# 머지 · 배포 확인

**머지 = 배포**다. 사용자가 선택 목록에서 승인한 PR 만 머지한다(`AGENTS.md` 역할 분담·'작업 과정' 7~9번). 머지 전에는 `pr-verify` 스킬로 확인을 끝낸다.

## 1. 머지

- 머지할 때 **40자 전체 SHA** 를 `expectedHeadSha` 로 준다(짧은 SHA 는 거절, 추측한 SHA 는 409):
  `git fetch -q origin <브랜치> && git rev-parse origin/<브랜치>`
- 확인한 SHA 와 지금 PR 머리가 같은지 본 뒤 `mcp__github__merge_pull_request`(merge_method `merge`).
- 순서가 있는 PR(공통 바탕 → 그 위 PR)은 바탕부터.

## 2. 여러 PR 을 한 PR 로 합칠 때 (같은 파일만 겹칠 때)

- 각 PR 브랜치에 AGENTS.md 진행 기록만 겹치면 통합 관리 세션 브랜치에서 합친다:

```bash
# 충돌 표시 <<<<<<< … ======= … >>>>>>> 사이의 위·아래를 차례로 이어 붙이는 작은 도구 (진행 기록 줄 두 개 다 남김)
cat > <scratchpad>/union.py <<'EOF'
import re, sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
s = re.sub(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', lambda m: m.group(1) + m.group(2), s, flags=re.S)
open(p, 'w', encoding='utf-8').write(s)
EOF
git checkout -q -B <내 브랜치> origin/main
for b in <브랜치1> <브랜치2>; do
  git merge -q --no-edit origin/$b || {
    for f in $(git diff --name-only --diff-filter=U); do python3 <scratchpad>/union.py $f; git add $f; done
    git commit -q --no-edit; }
done
sort AGENTS.md | uniq -d | grep -v '^\s*$'   # 똑같은 줄이 두 번 들어갔는지
```

  AGENTS.md(진행 기록) 외 파일이 충돌하면 이 도구를 쓰지 말고 손으로 보거나 PR 세션에 돌려보낸다. 합친 결과에서 서로 다른 PR 이 같은 설정을 다르게 넣었는지(예: `firestore.indexes.json` 의 `ttl`) 꼭 다시 본다.
- 커밋 작성자는 저장소 기본값(`Claude <noreply@anthropic.com>`) 그대로 — `-c user.name=t` 같은 임시 이름을 쓰지 않는다.
- 합친 뒤 전체 시험을 다시 돌리고 PR 을 만든다(설명에 원래 PR 번호들을 `aks-sci-lab/arduino_experiments#번호` 로).
- 머지 뒤 원래 PR 들은 머지됨으로 바뀌지 않을 수 있다 → 커밋이 main 에 들어간 것을 `git merge-base --is-ancestor <sha> origin/main` 로 확인하고, **댓글(끝에 Claude Code 꼬리말) 달고 닫는다**.

## 3. 배포 확인

```bash
for i in $(seq 1 50); do s=$(gh run list --repo aks-sci-lab/arduino_experiments --limit 10 --json workflowName,headSha,status,conclusion \
  -q '.[]|select(.headSha[0:7]=="<머지 sha 7자>")|select(.workflowName!="pages-build-deployment")|.workflowName+" "+.status+" "+.conclusion'); \
  [ "$(echo "$s" | grep -c completed)" -ge 1 ] && ! echo "$s" | grep -qv completed && { echo "$s"; break; }; perl -e 'select(undef,undef,undef,8)'; done
```

- **Deploy to Firebase Hosting**: 사이트 배포. `pages-build-deployment`(GitHub Pages)는 취소돼도 상관없다.
- **Deploy Firestore rules**: `firestore.rules`·`firestore.indexes.json` 이 바뀌면 돈다. 로그에서 `released rules`·`deployed indexes` 확인:
  `gh run view <id> --repo aks-sci-lab/arduino_experiments --log | sed -E 's/\x1b\[[0-9;]*m//g' | grep -E "Error|released|deployed indexes|Deploy complete"`
- 손으로 다시 돌리기: `gh workflow run deploy-firestore-rules.yml --repo aks-sci-lab/arduino_experiments --ref main` (정리 작업은 `firestore-cleanup.yml`).
- 이 작업 환경에서는 사이트 주소(`aks-sci-lab.web.app`)에 직접 접속이 막혀 있다 — 배포 성공은 Actions 로 확인하고, 사용자에게 "직접 열어 보지는 못했다"고 말한다.

## 4. 자주 난 실패와 고치는 법

| 오류(로그) | 뜻 | 고치는 법 |
|---|---|---|
| `firebaserules.googleapis.com … 403 The caller does not have permission` | 배포 열쇠(서비스 계정)에 규칙 권한 없음 | 사용자가 구글 클라우드 IAM 에서 이름에 github-action 이 든 서비스 계정에 **Firebase 관리자** 역할 추가(2026-11-19 에 줌). 적용까지 1~2분 걸리니 기다렸다 다시 |
| `… has billing disabled` (fields/expireAt) | TTL 은 결제 계정(Blaze) 필요 | `firestore.indexes.json` 의 `ttl` 을 `false`. 6개월 삭제는 매일 정리 작업이 맡음 |
| 정리 작업 `requires a COLLECTION_GROUP_ASC index … not ready yet` | 색인 만드는 중 | 몇 분 뒤 정리 작업 다시 |
| 정리 작업 `requires … index` (not ready 아님) | 그 칸의 색인이 `firestore.indexes.json` 에 없음 | 색인 추가 PR |
| 학생 화면 '익명 로그인이 꺼져 있어요' | Firebase 익명 로그인 꺼짐 | 사용자가 콘솔 Authentication → 로그인 방법 → 익명 사용 |

## 5. 끝나면

- 사용자에게 한국어로: 머지·배포 결과, 바뀐 것(쉬운 말), 선생님이 실제 기기로 확인할 것.
- 관련 세션에 send_message: "머지됨·main 커밋 7자·다음 할 일" 또는 "끝, 쉬어도 됨". 같은 파일을 고치는 다른 세션에는 "시작 전에 최신 main 받기".
- `AGENTS.md` 진행 기록 한 줄(통합 관리 세션이 직접 한 일이면).
