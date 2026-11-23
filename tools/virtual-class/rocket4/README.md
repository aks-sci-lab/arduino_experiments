# 필름통 로켓 합동 가상 수업 4차 — 교사 쪽 걸음 (2026-11-23)

`node tools/virtual-class/teacher-live.cjs <작업 폴더> <포트>` 를 켜 두고, 이 폴더의 걸음을 차례로 보낸다:
`curl -s --data-binary @tools/virtual-class/rocket4/s1.js http://127.0.0.1:<포트>/`

- s1~s4: 메인 → 교사 → 로그인 → 새 수업(5팀) → 큰 QR → 🎬 발표 보기 (3840×2160, 배율 100%)
- s5: force 물음 장 · s9: 학생 묶음 `in-1.json` 넣고 force·accel·pressure 답 모음 보기
- s10·s11: 생각 열기 끝 → 1차시 열기 → `L.out` (s6 150% 창은 lesson 을 첫 장으로 되돌리는 것을 보여 줘서 뺌)
- s13~s16: 학생 묶음 `in-2.json` → gas·control 답 모음, do-t1, 7번 장, 🏆 결과판, 🧩 모아 보기 → 2차시 열기
- s17·s19: `in-3.json` → action·mass, 2차시 결과판 → 정리 열기
- s20~s22: `in-4.json`·`in-4b.json` → end-think·end-cause 답 모음, 결과판, 진행 화면, 수업 마치기
- 학생 묶음은 브랜치 `claude/virtual-class-student-rocket4` 의 `docs/virtual-class/student/rocket4-turns/` 에 있다(작업 폴더에 `in-<n>.json` 으로 받아 둔다).
- 걸음 안의 수업 공간 id(`cuqatmrtg2qcey3c2fu3pff2`)는 이번 수업 것이라 다시 돌리면 바꾼다.
