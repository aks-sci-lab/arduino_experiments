---
name: phone-sensor-to-apps-script
description: 스마트폰 센서(가속도·회전 속도 등) 값을 브라우저에서 모아 구글 Apps Script 웹 앱으로 보내 선생님 구글 시트에 저장하고, 노트북 화면이 QR·조 코드로 짝지어 몇 초 안에 받아 보게 만드는 방법. 서버 비용 없이 폰 측정 → 노트북 분석을 잇는 실험 페이지를 새로 만들거나 고칠 때, DeviceMotionEvent·Wake Lock·iOS 센서 권한, Apps Script doGet/doPost, 미리보기 요청(CORS preflight) 피하기, 셀 크기 제한에 맞춘 원본 데이터 압축, 가짜 Apps Script 로 시험하기가 필요할 때 쓴다.
---

# 스마트폰 센서 → 구글 Apps Script → 노트북

센서 기반 실험실의 스마트폰 진자 실험(2026-11-14, PR #67·#68)에서 쓴 방법이다. 실제 코드가 기준 구현이니 새 실험도 이것을 본떠 만든다.

| 역할 | 기준 파일 |
|---|---|
| 폰 측정 화면(센서·권한·화면 켜짐·보정·보내기) | `projects/pendulum-measure.html`, `js/pendulum-measure.js` |
| 서버 주고받기·조 코드·압축 (브라우저/Node 공용) | `js/pendulum-cloud.js` |
| 서버 주소 한 곳 | `js/pendulum-config.js` (`appsScriptUrl`, `pollSeconds`) |
| 노트북 화면(조 코드·QR·몇 초마다 가져오기·CSV) | `projects/pendulum-report.html`, `js/pendulum-report.js` |
| 선생님 시트에 붙이는 서버 | `apps-script/Code.gs` |
| 선생님 1회 설정 안내 | `projects/pendulum-setup.html`, `docs/pendulum-teacher-setup.md` |
| 시험 | `tests/pendulum-cloud.test.cjs`, `tests/fake-apps-script.cjs` |

## 전체 흐름

1. 노트북: 반·조 → **조 코드**(`반-조-4자리`, 예 `2-3-4821`) 만들기 → QR 로 `측정페이지.html?group=조코드` 를 크게 보여 줌.
2. 폰: QR 로 열면 조 코드가 채워짐 → 측정·계산 → "노트북으로 보내기" (POST).
3. Apps Script: 조 코드·값을 검사해 시트에 한 줄 저장(같은 측정 id 면 고쳐 씀).
4. 노트북: `pollSeconds`(5초)마다 `GET ?action=list&group=…` 로 가져와 표에 자동 추가.
5. 서버가 안 될 때를 위해 **CSV 저장·불러오기를 항상 같이** 둔다. QR 에는 원본 데이터를 담지 않는다(조 코드·주소만).

학생 이름·학번·이메일은 받지도 저장하지도 않는다. 조 코드로만 구분한다.

## 폰에서 센서 받기 (함정)

- `window.addEventListener('devicemotion', …)`: `accelerationIncludingGravity`(x,y,z, m/s²)와 `rotationRate`(alpha,beta,gamma, °/s). `rotationRate` 가 null 인 기기도 있으니 확인하고 안내한다.
- **샘플 간격이 일정하다고 가정하지 않는다.** 매 샘플에 `e.timeStamp`(없으면 `performance.now()`)를 기록하고, 계산은 실제 시각으로 한다(0 통과는 선형 보간).
- **아이폰 권한**: `DeviceMotionEvent.requestPermission()` 은 사용자가 단추를 누른 바로 그 처리 함수 안에서, **다른 await 보다 먼저** 부른다. 거절되면 "사파리를 완전히 닫았다 다시 열기" 안내. https 에서만 된다.
- **화면 켜짐 유지**: `navigator.wakeLock.request('screen')`. 미지원이면 안내. 다른 앱에 갔다 오면 풀리므로 `visibilitychange` 에서 다시 켜고, 측정 중 화면을 벗어나면 "기록이 빠졌을 수 있어요" 경고.
- 시작 뒤 1.5초 안에 값이 하나도 없으면 "센서가 없는 기기(PC)"로 보고 시뮬레이션을 권한다.
- 측정 전 3초 "가만히 두기"로 중력 방향 축을 찾는다(안드로이드·iOS 부호 차이 대응).
- **시뮬레이션 모드는 필수**(폰 없이 개발·시험). 시뮬레이션 조건(예: 줄 길이)을 바꾸면 **실험 조건 칸도 같이 맞춘다**. 따로 두면 조건과 결과가 어긋난 채로 보내진다(실제로 생긴 버그).
- 보내기 전에 조건과 결과가 이론상 크게 어긋나면(예: L 과 T) `confirm` 으로 확인받는다.

## 브라우저 → Apps Script 요청 (CORS)

- **미리보기 요청(preflight)이 생기지 않게 "단순 요청"만 쓴다.** Apps Script 웹 앱은 OPTIONS 에 답하지 못한다.
  - 저장: `fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' })`. `application/json` 이나 사용자 헤더를 쓰면 안 된다.
  - 읽기: `GET url?action=list&group=…&_=시각`(캐시 피하기), `redirect: 'follow'`.
- 웹 앱은 `script.googleusercontent.com` 으로 302 넘김을 하므로 `redirect: 'follow'` 가 필요하고, 응답은 `res.text()` 후 `JSON.parse`.
- 응답이 JSON 이 아니고 `<html` 이면 배포의 **액세스가 "모든 사용자"가 아닌 것**(로그인 화면이 옴) → 그 원인을 그대로 한국어로 보여 준다.
- 요청마다 시간 제한(읽기 15초, 저장 30초)과 실패 시 "CSV 로 저장해 노트북에서 불러오세요" 안내. 주소가 비어 있으면 "선생님 설정 필요".
- https 사이트에서 `script.google.com` 호출은 학교 망에서 막힐 수 있다 → CSV 대체 경로가 필요한 이유.

## Apps Script 서버 (`Code.gs`)

- `doGet(e)`: `e.parameter.action` 으로 `ping` / `list` / `raw`. `doPost(e)`: `JSON.parse(e.postData.contents)` 후 `action: 'save'`.
- 응답은 `ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)`, 실패도 `{ ok: false, error: '한국어 문장' }` 로 돌려준다(예외를 밖으로 던지지 않음).
- 시트는 첫 요청 때 자동 생성(머리글 + 첫 줄 고정). 열 이름은 한 곳(`SHEETS`)에 둔다.
- 입력 검사: 조 코드 정규식, 측정 id 정규식, 숫자 범위, 본문 크기(`MAX_BODY`), 조당 줄 수 한도.
- **수식 주입 막기**: 글자 값이 `= + - @` 로 시작하면 앞에 `'` 를 붙인다.
- 같은 id 를 다시 보내면 새 줄이 아니라 고쳐 쓴다(재전송 안전). 쓰기는 `LockService.getScriptLock().waitLock(20000)` 안에서.
- 배포: 배포 → 새 배포 → 유형 "웹 앱" → **실행: 나**, **액세스: 모든 사용자** → 웹 앱 URL(`…/exec`). 코드를 고친 뒤에는 배포 관리 → 연필 → 버전 "새 버전" 으로 다시 배포해야 적용된다(주소는 그대로).
- 비밀값(AI API 키 등)은 Script Properties 에만 둔다. 브라우저 코드에 넣지 않는다.

## 원본 데이터 압축 (셀 한도)

구글 시트 셀 한 칸은 50,000자까지라 45,000자 × 최대 6칸(`rawData`, `rawData2`~`6`)에 나눠 담는다.
- 채널마다 정수로 바꾸고(가속도 ×100, 회전 ×10, 시간은 ms) **앞 값과의 차이**를 **36진수**로 적어 쉼표로 잇는다(`P1|개수|step|t|ax|…`).
- 그래도 넘치면 2개 중 1개, 4개 중 1개 … 로 솎아 내고, 몇 개 중 1개인지(`rawInfo`)를 함께 저장한다.
- 노트북은 필요할 때만 `GET ?action=raw` 로 받아 되살린다(`unpackSamples`). 목록에는 원본을 넣지 않는다.

## 노트북 화면

- 조 코드 만들기 또는 기존 조 코드 입력, QR(기존 `qr.html` 과 같은 `qrcode-generator@1.4.4`), "주소 복사"·"QR 크게".
- 연결 상태를 쉬운 말로: 기다리는 중 / 🆕 새 측정 들어옴 / 서버에 연결 안 됨(마지막 확인 시각).
- 서버 목록과 이 브라우저에 있던 줄을 id 로 합친다(`mergeItems`). 잘못 잰 줄은 "쓰기" 체크를 꺼서 계산에서 뺀다.
- CSV 끌어다 놓기·여러 파일, 직접 넣기. 계산(최소제곱, g, 오차율)은 모두 코드로 하고 계산 과정을 숫자로 보여 준다.

## 선생님 설정 (1회, 약 15분)

화면 안내(`pendulum-setup.html`)에 단계별로: 시트 만들기 → 확장 프로그램 → Apps Script → 📋 코드 복사·붙여 넣기 → 웹 앱 배포("액세스 승인 → 고급 → 안전하지 않음으로 이동 → 허용" 경고 설명 포함) → 주소 붙여 넣고 **연결 시험**(`?action=ping`) → `js/pendulum-config.js` 의 `appsScriptUrl` 에 주소(사용자가 어려우면 통합 관리 세션이 PR 로 대신 넣음, 머지 = 배포).

## 시험

- 서버 쪽: `tests/fake-apps-script.cjs` 가 `SpreadsheetApp`·`ContentService`·`LockService` 를 흉내 내 `Code.gs` 를 Node `vm` 에서 그대로 실행한다(`loadCodeGs()` → `get(params)`, `post(body)`). 저장·고쳐 쓰기·검사·한도·수식 주입을 시험한다.
- 화면 흐름: 이 가짜를 작은 HTTP 서버로 띄우고(`Access-Control-Allow-Origin: *`), Playwright 에서 `pendulum-config.js` 요청을 가로채 그 주소로 바꾼다. 노트북 페이지(1280px)에서 조 코드 → QR 주소를 폰 컨텍스트(`devices['Pixel 7']`)로 열기 → 시뮬레이션 → 보내기 → 노트북 표 자동 추가 → 결과 순서로 확인하고, 서버를 끈 채 CSV 흐름도 확인한다.
- 시험 환경에서는 CDN 이 막히므로 Chart.js·qrcode-generator 는 npm 에서 받은 같은 판 파일로 가로채 넣는다.
- 실제 폰(iOS 권한 창, 안드로이드 기록 빈도, Wake Lock), 실제 Apps Script 배포·학교 망은 시험 환경에서 확인할 수 없으니 PR 에 "확인 못 함"으로 적는다.
