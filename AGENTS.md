# 작업 안내 (AI 코딩 도구 공용)

이 파일은 GitHub Copilot, Claude Code 등 이 저장소에서 일하는 모든 AI가 먼저 읽는 공통 안내입니다.
여러 도구가 번갈아 작업하므로, 중요한 결정은 여기에 적어 다음 작업자가 이어받을 수 있게 합니다.

## 프로젝트

중·고등학교 과학 수업용 **웹 실험실**. 학생이 스마트폰/PC 브라우저로 접속해 센서·카메라로 실험하고 결과를 분석·제출한다.
사용자(교사)는 코딩 초보이므로, 설명은 쉬운 한국어로 하고 용어는 풀어서 쓴다.

- 서비스 주소: https://aks-sci-lab.web.app (Firebase Hosting)
- Firebase 프로젝트(로그인·DB): `web-experiment-f9b24`

## 구조

| 경로 | 내용 |
|---|---|
| `index.html` | 메인 페이지: 구글 로그인, 교사/학생 역할, 실험 목록, 기록 조회 |
| `projects/*.html` | 실험 페이지 (가속도계, 환경 센서, 자유낙하, 스마트폰 가속도, 말루스 법칙) |
| `js/`, `css/` | 실험 페이지용 스크립트·스타일 (`malus-*.js`: 말루스 법칙 실험) |
| `firmware/pico2w-environment/` | Pico 센서 보드용 MicroPython 펌웨어와 Thonny 설치 안내 |
| `tests/`, `tools/`, `vendor/sensirion/` | 센서 테스트, VOC 알고리즘 재빌드 도구, 제조사 원본·라이선스·WebAssembly |
| `walk-run-detector/` | 걷기·뛰기 판정 머신러닝 수업 앱 (자체 README 참고) |
| `uploader.html` | 아두이노 펌웨어 업로더 |
| `app.py` | 날씨 API 로컬 서버 (Firebase Hosting 에는 배포되지 않음) |
| `firestore.rules` | Firestore 보안 규칙 |

새 실험을 추가하면 `index.html` 의 `프로젝트 목록` 에 링크를 넣는다.

## 규칙

- 빌드 도구 없음: 순수 HTML/CSS/JavaScript. 외부 라이브러리는 CDN(jsdelivr, gstatic)만 쓴다.
- 카메라·센서는 https 에서만 동작한다.
- 화면 문구와 주석은 한국어. 스마트폰 화면 폭을 기본으로 생각한다.
- Firebase 설정값은 기존 파일(`js/phone-accel-cloud.js` 등)의 것을 그대로 쓴다. 로그인 세션은 같은 사이트 안에서 공유된다.
- 비밀값(API 키 파일 `key.txt`, 서비스 계정 JSON)은 커밋하지 않는다.

## 배포 상태 (2026-10-26)

- 10월 6일 라이브 사이트에만 있던 센서 작업은 PR #30 으로 `main` 에 복구했다. 이제 `main` 이 라이브 사이트의 내용을 모두 포함한다.
- 자동 배포(push 트리거)를 다시 켰다. 단, 저장소 Secret `FIREBASE_SERVICE_ACCOUNT` 가 등록되기 전까지는 배포 단계를 건너뛴다.
- **PC 에서 `firebase deploy` 로 직접 배포하지 않는다.** `main` 에 없는 내용이 다시 라이브에만 남는 문제가 생긴다. 배포는 항상 `main` 에서 한다.
- 확인된 값: Hosting site `aks-sci-lab`, Firebase 프로젝트 `web-experiment-f9b24`.

## 작업 흐름과 배포

1. `main` 에 직접 커밋하지 않고 브랜치에서 작업한 뒤 PR 을 만든다.
2. PR 이 `main` 에 머지되면 `.github/workflows/deploy-hosting.yml` 이 aks-sci-lab.web.app 에 자동 배포한다.
3. `firestore.rules` 를 바꾸면 PR 설명과 커밋 메시지에 "(규칙 배포 필요)"를 적는다. 규칙은 자동 배포되지 않는다.

자세한 배포 설정: `docs/DEPLOY.md`

## 진행 기록

다른 도구가 이어받을 수 있게, 큰 작업을 마치면 한 줄씩 추가한다.

- 2026-09: 메인 페이지 로그인·교사/학생 모드, 스마트폰 가속도 실험(구간 선택·Cloud DB 제출) — Copilot
- 2026-10-19~21: 걷기·뛰기 판정기(`walk-run-detector/`) — Claude Code
- 2026-10-26: 말루스 법칙 실험(`projects/malus-law.html`, 카메라 밝기 측정·cos² 적합·내 구글 시트 내보내기), Firebase Hosting 자동 배포 설정 — Claude Code
  - 확인 필요: 내 시트 내보내기는 Google Sheets API 가 Firebase 프로젝트에서 켜져 있어야 동작
- 2026-10-26: 10월 6일 라이브 센서 작업(Pico 펌웨어·BLE·±16g·200Hz 묶음 전송·환경/VOC·조도·자외선·테스트·캐시 설정)을 최신 main과 합쳐 복구 PR 준비, 말루스·걷기/뛰기 유지 및 라이브 파일 대조 완료, 배포하지 않음 — Copilot
- 2026-10-26: PR #30 검토(테스트 73+23개 통과, 보호 파일 무변경, 전체 페이지 로드 확인) 후 머지, Hosting 자동 배포 재개 — Claude Code
- 2026-10-26: 말루스 실험 개선(측정 영역 선 굵게, 확대 보기, 측정 전 대기·빛 위치 자동 추적·영역 넘침/카메라 이동 경고, Enter 키 기록) PR — Claude Code
