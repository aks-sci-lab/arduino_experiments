# 통합 관리 현황

이 문서는 **통합 관리 세션**(Claude Code 대화 "통합 관리 세션", 2026-11-03 지정)이 관리한다.
모든 세션(대화)과 GitHub 의 브랜치·PR 을 한곳에서 보고, 어느 쪽에도 짝이 없는 일을 놓치지 않기 위한 표다.

- **A. 세션 목록**: 지금 있는 대화와 각 대화가 맡은 일
- **B. 세션 없이 GitHub 에만 있는 것**: 맡은 대화가 없거나 끝난(보관된) 브랜치·PR
- **C. 정리해도 되는 브랜치**: 내용이 이미 `main` 에 다 들어간 브랜치

기준 시점: 2026-11-03. 열린 PR 5개(#33·#42·#49·#50·#51)는 사용자 지시("모든 PR 진행해")로 통합 관리 세션이 한 PR 에 모아 충돌을 풀고 머지했다.
머지·삭제는 사용자 승인 후에만 한다. 이 대화는 자기 브랜치 외에는 push·삭제 권한이 없으므로, 브랜치 삭제 같은 GitHub 작업은 이슈로 남겨 GitHub Copilot 이 수행한다 (`AGENTS.md` 역할 분담).

---

## A. 세션 목록

### A-1. 이 저장소(arduino_experiments)

| 세션 | 상태 | 연결된 GitHub | 남은 일 |
|---|---|---|---|
| 통합 관리 세션 (이 대화) | 진행 중 | `claude/quirky-heisenberg-fdz1qp` | 이 문서 관리 |
| 무결성 검증 | 끝남 | PR #51 머지 (2026-11-03) | 없음 |
| 개발: 문항 그림 도구 (figure-maker) | 사용자 답 대기 | PR #50 머지 (2026-11-03) | 2단계 시작 여부 (`aks-sci-lab/figure-maker` 저장소에서) |
| 머지 전용: 문항 그림 도구 | 끝남 | (figure-maker 저장소 PR #1 머지 완료) | 없음 |
| 말루스의 법칙 실험 설계 | 끝남 | PR #33 머지 (2026-11-03) | 수업에서 탭 화면 확인 |
| 전자기 유도 센서 측정 웹앱 | 끝남 | `claude/stoic-archimedes-48nbsd` (PR 없음) | 실제 ADS1115 센서 시험, PR 만들지 결정 (65 커밋 뒤처짐) |
| 스마트폰 가속도 센서 웹앱 | 끝남 | PR #42 머지 (2026-11-03) | 없음 |
| 이상기체 상태방정식 검증 실험 | 끝남 | PR #46 머지·배포 완료 | 실제 장비 측정 |
| LED 플랑크 상수 측정 웹앱 | 끝남 | PR #37~#45 머지·배포 완료 | 초록 LED 재측정 |
| 코드 최적화 및 무결성 검증 | 끝남 | — | 없음 |

### A-2. 다른 저장소·저장소 없는 세션 (참고용, 여기서 작업하지 않음)

| 세션 | 대상 | 상태 |
|---|---|---|
| 총괄: 업무 데스크 (요청 배분·조율) | `aks-sci-lab/teacher-desk` | 끝남 |
| 머지 전용: teacher-desk | teacher-desk | #69 검토 끝, 총괄 승인 대기 |
| 앱 기반·설정·배포·품질 / 수신함·수집 / 출결·증 발급 / 브라우저 확장·외부 연동 / 일정·시간표·주간 계획 / 텔레그램 (teacher-desk) | teacher-desk | 검토 대기 |
| AI (teacher-desk) | teacher-desk | 사용자 답 대기 ("다시 시도" 대상 확인) |
| 서술형 평가 자동 채점 통합 (2개) | 별도 프로젝트 | 1개는 "진행할까요?" 답 대기 |
| 표 내용 작성 | 저장소 없음 | 끝남 |

teacher-desk 는 별개 프로젝트이므로 그쪽 총괄 세션이 관리한다. 이 문서는 목록만 둔다.

---

## B. 세션 없이 GitHub 에만 있는 것

맡은 대화가 보관(archive)되었거나 처음부터 대화 밖(Copilot·GitHub 웹)에서 만들어진 것.

| 브랜치 / PR | main 보다 앞섬 | 내용 | 비고 |
|---|---|---|---|
| `handoff/figure-maker-new-repo` | 1 | 그림 도구를 새 저장소로 옮길 때 쓴 넘김용 브랜치 | 그림 도구가 새 저장소로 옮겨졌고 PR #50 도 머지되어 삭제 후보 (C 참고) |

`stoic-archimedes`(전자기 유도)는 A-1 의 세션이 맡고 있다. PR #49 는 2026-11-03 머지되었다.

---

## C. 정리해도 되는 브랜치 (내용이 모두 main 에 있음)

머지가 끝나 지워도 되는 브랜치 (사용자 승인 후 Copilot 이 삭제):

- `claude/gifted-keller-w81hco` (PR #51), `claude/jolly-brown-sggwyd` (PR #49), `claude/figure-maker-move` (PR #50), `ccr-d5d43435-sy4j52` (PR #42), `claude/malus-inquiry-tabs` (PR #33), `handoff/figure-maker-new-repo`
- 통합 PR 의 브랜치 `claude/quirky-heisenberg-fdz1qp` 는 통합 관리 세션이 계속 쓰므로 남긴다.

지난 정리:


- 2026-11-03 정리 완료: 내용이 모두 main 에 있던 브랜치 9개를 사용자 승인으로 삭제 (이슈 #52, GitHub Copilot 수행, 통합 관리 세션에서 확인).
  `aks-sci-lab-restore-live-sensor-work`, `ccr-ac50da94-kx64gv`, `claude/keen-mccarthy-i86emx`, `claude/lucid-pasteur-bjiyj4`, `claude/modest-shannon-47w7u0`, `claude/malus-view-stability`, `lany0665-hash-motion-analysis`, `lany0665-hash-weather-stargazing-feature`, `lany0665-hash-web-page-optimization`
- 필요하면 GitHub 브랜치 화면의 "Restore" 로 되살릴 수 있다.

---

## 결정이 필요한 것 (사용자)

1. 전자기 유도(`stoic-archimedes`)를 PR 로 올릴지, 보류할지
2. C 의 머지 끝난 브랜치 6개 삭제 여부

## 관리 방법

- 새 대화를 만들거나 대화가 끝나면 A 표를 고친다.
- PR 이 머지되면 해당 브랜치를 C 로 옮긴다.
- 대화 없이 남은 브랜치가 생기면 B 에 적는다.
