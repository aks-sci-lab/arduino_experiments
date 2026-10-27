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
| `teacher-desk/` | 교사 업무 데스크: 학교 PC 에서 도는 로컬 업무 앱 (조퇴증·외출증, 쿨메신저·에듀파인 수신함, 텔레그램). Hosting 에 배포되지 않음 (자체 README 참고) |
| `pass/` | 조퇴증·외출증 학생 공유 페이지 (공개 배포, 내용은 주소 `#` 뒤에만 있음) |
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

## 역할 분담 (사용자 지정, 2026-10-26)

| 담당 | 하는 일 | 하지 않는 일 |
|---|---|---|
| **Claude Code: 구현** | 브랜치에서 수정 → 테스트 → PR 생성. 검토에서 돌아온 문제를 같은 PR 에서 고친다 | `main` 머지, 사이트 배포 (`firebase deploy`, Actions 수동 실행 포함) |
| **GitHub Copilot: 검토·배포** | 원래 요구사항과 기존 기능을 독립적으로 확인하고, 문제는 PR 댓글로 작성자에게 돌려준다. 사용자 승인 후 머지·배포를 맡는다 | 사용자 승인 없는 머지·배포 |
| **사용자** | 최종 승인 (머지·배포 결정) | |

- 머지는 `main` 자동 배포로 이어지므로, **머지 = 배포**로 보고 사용자 승인 없이 하지 않는다.
- PR 설명에는 원래 요구사항, 바꾼 내용, 실행한 테스트, 확인하지 못한 것을 적는다. 검토자는 이것을 그대로 믿지 말고 직접 확인한다.

## 작업 흐름과 배포

1. `main` 에 직접 커밋하지 않고 브랜치에서 작업한 뒤 PR 을 만든다. 머지는 위 역할 분담에 따라 사용자 승인 후에만 한다.
2. PR 이 `main` 에 머지되면 `.github/workflows/deploy-hosting.yml` 이 aks-sci-lab.web.app 에 자동 배포한다.
3. `firestore.rules` 를 바꾸면 PR 설명과 커밋 메시지에 "(규칙 배포 필요)"를 적는다. 규칙은 자동 배포되지 않는다.

자세한 배포 설정: `docs/DEPLOY.md`

## 교사 업무 데스크 설계 결정 (2026-10-26)

- **로컬 우선**: 학생 이름·조퇴 사유·공문은 클라우드(Firestore)에 두지 않고 학교 PC 의 SQLite(`teacher-desk/data/desk.db`)에만 저장한다. 서버는 `127.0.0.1` 전용, 토큰·Host·Origin 검사.
- 브라우저는 PC 파일(쿨메신저 폴더, 에듀파인 저장 폴더)을 읽을 수 없으므로 Python 로컬 서버가 읽는다. 표준 라이브러리만 쓰고, PDF 만 선택 설치(`pypdf`). hwp 는 `desk/cfb.py` 로 직접 읽는다.
- 분석은 AI 없이 규칙 기반(`desk/extract.py`). AI 요약은 학교 정보보안 지침 확인 후에만 추가한다.
- 텔레그램은 롱 폴링(학교 PC 를 외부에 공개하지 않음), 연결 코드를 보낸 계정 하나만. 학생 이름·사유는 보내지 않는다.
- 학생 공유는 `pass/` 정적 페이지 + 주소 `#` 데이터 (서버 저장 없음). 이 저장소에 둔 이유: 기존 Hosting 자동 배포를 그대로 쓰기 위함. `teacher-desk/` 는 `firebase.json` ignore 로 배포 제외.
- 쿨메신저 쪽지: `%LOCALAPPDATA%\CoolMessenger\Memo\<이름>.udb` (사용자 확인, 2026-10-27). 설정에는 이름만 넣는다. `.udb` 내부 구조는 미확인이라 `desk/coolmsg.py` 가 SQLite 로 보고 표·열을 자동 인식한다 (복사본을 읽기 전용으로 열고, rowid 로 새 쪽지만). 실제 구조가 다르면 사용자가 보내 주는 '연결 확인 → 파일 구조'로 규칙을 고친다.
- 쿨메신저 `.udb` 경로를 직접 지정(`coolmessenger_path`)하면 이름보다 우선. 경로 칸의 📂 찾아보기는 `desk/picker.py` 가 PowerShell 윈도우 대화 상자로 띄운다 (설치 없는 Python 에는 tkinter 없음).
- 학사일정(`desk/schoolcal.py`): 학교마다 양식이 달라 양식을 고정하지 않고 **읽기 → 미리보기에서 고치기 → 저장**. 엑셀은 달력표(월×일, 전치·병합 칸=기간)/목록(날짜 열+행사 열)/글 순서로 자동 판별, 연도 없는 날짜는 학년도 규칙(3~12월=학년도, 1~2월=다음 해). 가장 범용적인 길은 나이스 Open API(`desk/neis.py`, 인증키 필요). 저장은 source='school' 항목 하나 + 일정, 같은 학년도는 바꿔치기. 분류 '학사' 추가.
- 메뉴 이름: '오늘' → '브리핑' (사용자 지정, 2026-10-27). 뷰 id 는 `today` 그대로.
- 업데이트: `teacher-desk/update-desk.bat` 이 Releases `desk-latest` 를 받아 `data/`·`config.json` 을 빼고 덮어쓴다. `.bat` 두 개는 `tools/make_bats.py` 로 만든다.
- 화면은 VS Code 형태(① 활동 막대 ② 목록 패널 ③ 탭 ④ 작업 영역 ⑤ 하단 패널 ⑥ 상태 표시줄). 사용자가 🧩 화면 배치 모드에서 "배치 설명 복사"로 보내 주는 번호를 기준으로 레이아웃을 고친다.
- 시험: `cd teacher-desk && python -m unittest discover -s tests -t .`, `node --test tests/pass-codec.test.cjs`
- **배포 형태 (사용자 지정, 2026-10-27)**: Python 으로 개발하고, 선생님에게는 Python 이 들어 있는 윈도우용 ZIP(설치 불필요)을 배포한다. `teacher-desk/tools/build_portable.py` 가 python.org embeddable Python 3.12 + pypdf 를 넣어 묶고, `.github/workflows/desk-portable.yml` 이 윈도우에서 만들고 시험한 뒤 `main` 반영 시 Releases `desk-latest` 에 올린다. `.bat` 는 CP949.

## 진행 기록

다른 도구가 이어받을 수 있게, 큰 작업을 마치면 한 줄씩 추가한다.

- 2026-09: 메인 페이지 로그인·교사/학생 모드, 스마트폰 가속도 실험(구간 선택·Cloud DB 제출) — Copilot
- 2026-10-19~21: 걷기·뛰기 판정기(`walk-run-detector/`) — Claude Code
- 2026-10-26: 말루스 법칙 실험(`projects/malus-law.html`, 카메라 밝기 측정·cos² 적합·내 구글 시트 내보내기), Firebase Hosting 자동 배포 설정 — Claude Code
  - 확인 필요: 내 시트 내보내기는 Google Sheets API 가 Firebase 프로젝트에서 켜져 있어야 동작
- 2026-10-26: 10월 6일 라이브 센서 작업(Pico 펌웨어·BLE·±16g·200Hz 묶음 전송·환경/VOC·조도·자외선·테스트·캐시 설정)을 최신 main과 합쳐 복구 PR 준비, 말루스·걷기/뛰기 유지 및 라이브 파일 대조 완료, 배포하지 않음 — Copilot
- 2026-10-26: PR #30 검토(테스트 73+23개 통과, 보호 파일 무변경, 전체 페이지 로드 확인) 후 머지, Hosting 자동 배포 재개 — Claude Code
- 2026-10-26: 말루스 실험 개선(측정 영역 선 굵게, 확대 보기, 측정 전 대기·빛 위치 자동 추적·영역 넘침/카메라 이동 경고, Enter 키 기록) PR — Claude Code
- 2026-10-26: 말루스 실험 회차별 정규화(회차마다 따로 적합해 (I−B)/A, 결측치 표시·자동 결측, 회차 색 구분 그래프, CSV·시트에 회차/정규화/결측 열) PR — Claude Code
- 2026-10-26: 교사 업무 데스크(`teacher-desk/`, `pass/`) — 조퇴증·외출증(인쇄·QR 공유), 업무 수신함(쿨메신저·에듀파인 hwp/hwpx/pdf, 날짜·마감 추출·분류·요약·문서번호 연결), 9·12·15시 예약 수집, 달력·.ics, 오늘 대시보드·검색, 텔레그램 알림·명령, 화면 배치 모드 PR — Claude Code
  - 확인 필요: 쿨메신저 저장 형식(진단 결과 대기), 학교 조퇴증 실제 양식과 차이, 학교 PC 에서 Python 설치·실행 가능 여부
- 2026-10-27: 업무 데스크 윈도우용 ZIP(Python 설치 불필요, embeddable 3.12 + pypdf, 바탕화면 바로 가기), 윈도우 자동 시험(들어 있는 Python 으로 시험 38개·start-desk.bat·화면 열림·바로 가기), `.bat` CP949 한글 깨짐 수정. 사용자의 직접 지시로 Claude Code 가 PR #34 머지·배포 — Claude Code
- 2026-10-27: 쿨메신저 이름 입력 연동(`desk/coolmsg.py`, 연결 확인 화면), 업데이트 도구(`update-desk.bat`), 윈도우 시험에 업데이트 확인 추가 — Claude Code
  - 확인 필요: 실제 쿨메신저 `.udb` 구조 (SQLite 가 아니거나 암호화되어 있으면 연결 확인 결과로 다시 구현)
- 2026-10-27: 0.3.0 — 검색 범위 확대(본문·요약·문서번호·분류·메모·학생 명단, 여러 낱말 AND), 브리핑 이름, 쿨메신저 파일 경로 직접 지정·📂 찾아보기, 학사일정 가져오기(파일·붙여넣기·나이스) — Claude Code
  - 확인 필요: 나이스 Open API 실제 응답(가짜 서버로만 시험), 실제 학교 학사일정 파일 양식, 윈도우 찾아보기 창(자동 시험 불가)
