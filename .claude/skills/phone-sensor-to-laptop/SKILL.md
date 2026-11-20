---
name: phone-sensor-to-laptop
description: 스마트폰 센서(가속도·회전 속도·카메라 밝기 등) 값을 폰 브라우저에서 모아 사이트 저장소(Firestore, js/lab-store.js)로 보내고, 노트북 화면이 QR·조 코드로 짝지어 바로 받아 분석하게 만드는 방법. 폰 측정 → 노트북 분석(이원화)을 잇는 실험 페이지를 새로 만들거나 고칠 때, ClassShare 의 📱 폰 연결·share.phoneCard·회차 골라 보내기, DeviceMotionEvent·Wake Lock·iOS 센서 권한, 원본 데이터 압축(27만 자), 가짜 저장소(tests/fake-lab-store.cjs)와 기기 흉내로 시험하기가 필요할 때 쓴다.
---

# 스마트폰 센서 → 사이트 저장소(Firestore) → 노트북

예전에는 선생님 구글 시트(Apps Script)를 거쳤지만 2026-11-18 부터 사이트 저장소(Firestore)로 바뀌었고, 2026-11-20 에 Apps Script 코드는 모두 지웠다. **실험 페이지는 저장소를 직접 부르지 않고 `ClassShare` 만 쓴다.** 기준 구현은 진자·말루스·스마트폰 가속도·심박수·퀀텀닷이다.

| 역할 | 기준 파일 |
|---|---|
| 조 공유·수업 참여·📱 폰 연결 공통 부품 | `js/class-share.js`, `css/class-share.css`, 사용법 `docs/class-share.md` |
| 저장소 (예전 Apps Script 요청을 같은 모양으로 Firestore 에) | `js/lab-store.js`, 규칙 `firestore.rules` |
| 실험 이름 목록 (둘 다 같게) | `js/class-cloud.js` 의 `EXPS`, `js/lab-store.js` 의 `GENERIC_EXPS` |
| 기기 판별 (폰·태블릿·노트북) | `js/lab-ui.js` 의 `LabUI.device()`·`deviceSwitch`, `css/lab-base.css` 의 `.hide-on-laptop` 등 |
| 폰 측정 화면 예 (센서·권한·화면 켜짐·보정) | `projects/pendulum-measure.html`, `js/pendulum-measure.js` |
| 원본 압축 예 | `js/pendulum-cloud.js` 의 `packSamples`, `js/heart-rate-raw.js` |
| 시험 | `tests/fake-lab-store.cjs`(가짜 저장소), `tests/class-share*.test.cjs`, `tests/lab-ui-device.test.cjs` |

## 전체 흐름

1. 노트북(`LabUI.device()` = 'laptop'): 측정 부분은 `hide-on-laptop` 으로 숨기고 5. 데이터 맨 위 `<div id="phone-card" class="show-on-laptop"></div>` + `share.phoneCard('#phone-card')` → '📱 폰으로 측정해 보내기' QR(`?role=phone&group=…&s=lab 공간`). 수업(`?c=`)이면 조·번호를 고른 뒤 나옴. QR 의 공간(`p…` 24자)은 그 노트북·폰만 쓰는 짝 공간이라 남이 맞히기 어렵다.
2. 폰(`?role=phone`): 조 코드·공간이 자동으로 들어감 → 측정 → 저장할 때마다 `share.saved()` → 띠 안의 회차 목록에 쌓임 → 체크해서 '📤 고른 회차 보내기'(같은 id 면 고쳐 씀). 한 번에 하나만 재는 실험은 `autoSendOnSave: true`.
3. 저장소: 익명 로그인(화면에 안 보임)으로 `labSpaces/{공간}/items` 에 한 줄(`expireAt` = +183일).
4. 노트북: onSnapshot 실시간으로 받아 `onIncoming` → '🆕 폰에서 새 측정 N개'(`onPhoneData`). 읽기 비용 없이 몇 초마다 불러도 된다.
5. 인터넷이 안 될 때를 위해 **CSV 저장·불러오기를 항상 같이** 둔다. QR 에는 원본을 담지 않는다(조 코드·공간만).
6. 태블릿은 측정·분석 둘 다, 추측이 틀리면 '이 기기 ▾'(`LabUI.deviceSwitch`) 또는 `?device=`.

학생 이름·학번·성별·이메일은 받지도 저장하지도 않는다. 조 코드·조·번호로만 구분한다.

## 페이지에 붙이기

```js
const share = ClassShare.init({
    exp: 'myexp',                       // EXPS·GENERIC_EXPS 에 함께 추가
    getItems: () => runs.map(toItem),   // 보낼 회차: { id, title, n, summary: {이름: 숫자}, data }
    onIncoming: items => { ... },       // 받은 회차는 내 기록과 따로 ('📥 노트북 AB12', '📱 폰 AB12')
    getStep: () => 현재단계, getPoints: () => 점수,
    phone: true,                        // 📱 폰 연결
    onPhoneData: n => { ... }
});
saveRun(run); share.saved();
```

- `summary` 이름은 1~30자(`|`·제어 문자 금지), 숫자 20개까지. 중요한 것 먼저(폰 목록 3개·교사 화면 4개만 보임).
- `data` 는 글자로 27만 자 정도까지. 넘으면 고르게 솎고 '솎음' 표시.

## 폰에서 센서 받기 (함정)

- `devicemotion`: `accelerationIncludingGravity`(m/s²)와 `rotationRate`(°/s). `rotationRate` 가 null 인 기기도 있으니 확인·안내.
- **샘플 간격이 일정하다고 가정하지 않는다.** 샘플마다 `e.timeStamp`(없으면 `performance.now()`)를 기록하고 실제 시각으로 계산.
- **아이폰 권한**: `DeviceMotionEvent.requestPermission()` 은 단추 처리 함수 안에서 **다른 await 보다 먼저**. 거절되면 '사파리를 완전히 닫았다 다시 열기'. https 에서만.
- **화면 켜짐**: `navigator.wakeLock.request('screen')`, `visibilitychange` 에서 다시 켜고, 측정 중 화면을 벗어나면 '기록이 빠졌을 수 있어요'.
- 시작 뒤 1.5초 안에 값이 없으면 센서 없는 기기로 보고 시뮬레이션을 권한다. **시뮬레이션 모드는 필수**, 시뮬레이션 조건을 바꾸면 실험 조건 칸도 같이 맞춘다.
- 카메라 실험은 노출·화이트밸런스·초점을 따로 고정(말루스 `lockExposure` 방식, 기기 범위에 맞춤).

## 원본 데이터 압축

- 채널마다 정수로 바꾸고(가속도 ×100, 회전 ×10, 시간 ms) **앞 값과의 차이**를 36진수로(`packSamples`). 넘치면 2개 중 1개 … 로 솎고 몇 개 중 1개인지 함께.
- 노트북은 필요할 때만 원본을 받아 되살린다(`raw`). 목록에는 원본을 넣지 않는다.

## 시험

- Node: `const { loadLabStore } = require('./fake-lab-store.cjs'); const app = loadLabStore(); await app.post(보낼 내용); await app.get({ action: 'list', exp, group })` — 저장·고쳐 쓰기·검사·받지 않은 항목 버림.
- 화면: `labServer(app)` 을 작은 http 서버로 띄우고 `ctx.route('**/js/pendulum-config.js', r => r.fulfill({ body: configJs(주소) }))`. 노트북(1280px, 터치 없음) → `#phone-card` QR 주소를 폰 컨텍스트(`devices['iPhone 13']` 또는 `?device=phone`)로 열기 → 시뮬레이션 → 보내기 → 노트북에 도착. 태블릿은 `devices['Galaxy Tab S4']`. 375px 가로 스크롤 없음·단추 44px.
- 규칙을 바꿨으면 Firestore 에뮬레이터로 `tests/firestore-rules*.test.cjs`.
- CDN 은 시험 환경에서 막히므로 Chart.js·qrcode-generator 는 가로채 넣는다.
- 실제 폰(iOS 권한 창, 기록 빈도, Wake Lock), 실제 Firestore·학교 망은 PR 에 '확인 못 함'으로 적는다.
