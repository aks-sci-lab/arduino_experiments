# 필름통 로켓 합동 가상 수업 5차 — 도구 (분량 조절 판, PR #212)

시나리오·성공 기준: `docs/virtual-class/scenario/film-rocket5.md`, 진행 지시문: `film-rocket5-teacher-brief.md`·`film-rocket5-student-brief.md` (같은 폴더).
열평형 도구(`tools/virtual-class/thermal/`, 브랜치 `claude/virtual-class-thermal-scenario`)를 로켓에 맞게 고친 것. 제품 코드는 고치지 않는다.

| 파일 | 하는 일 |
|---|---|
| `lib.cjs` | 공통 도우미: 가짜 저장소(`tests/fake-lab-store.cjs`) + 저장소 파일 서버 + Playwright(가짜 카메라). 교사 4K 화면(`S.teacher`), 팀 폰(`S.phone`), 입장(`S.enter`), 폰 화면 읽기(`S.scr`), 고르기(`S.pick`), 계획 ① → ②(`S.planStep`), ⏱(`S.stopwatch`), 🎥 세 곳(`S.launch`), 👀(`S.hand`), 끊김(`S.net`), 발표 보기(`S.title`·`S.next`·`S.toSlide`·`S.answers`·`S.overflow`·`S.minFont`), 차례 묶음(`S.out`·`S.in`) |
| `team.cjs` | 학생 세션용 '사람처럼 재기': `run1`(1차시 여러 번), `run2`(2차시), `challenge`(🎯), `glance`(여섯 폰 한 줄씩) — 화면 id 를 보고 보이는 단추만 누름 |
| `live.cjs` | 켜 두는 서버: `node tools/virtual-class/rocket5/live.cjs <작업 폴더> <teacher\|student> [포트]`, 걸음 = async 함수 몸통(`S`·`pg`·`VC`·`R`) |
| `smoke.cjs` | 지금 판에서 도구가 열리는지 (팀 수업 → 발표 → 폰 2대 → 계획 🔮 → ⏱ 3번 → 도전 → 🛠 → 퀴즈 → 🎥·👀). 맨 끝 `"ok": true` |
| `check-4k.cjs` | 설명 장 21장 × 3840×2160 배율 100·150·200 % 넘침·가장 작은 글자 |

다른 폴더의 판을 볼 때: `VC_REPO=<체크아웃 폴더> node tools/virtual-class/rocket5/smoke.cjs /tmp/vc-smoke` (그 폴더의 `tests/fake-lab-store.cjs`·페이지를 씀).
QR 그림은 `/home/user/vc-modules` 에 `qrcode-generator@1.4.4` 를 받아 두면 진짜로(없으면 회색 네모). 얼굴 가리기(MediaPipe)는 CDN 이 막혀 못 씀 → 도전 사진·영상은 안 감.
