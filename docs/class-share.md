# 수업 참여 · 조 공유 공통 부품 사용법 (`js/class-share.js`)

교사·학생 모두 **구글 로그인 없이**, 조 코드로 측정값을 같은 조 노트북과 선생님 시트에 나누는 부품입니다(2026-11-16, 서버 `apps-script/Code.gs` 6판).
실험 페이지마다 이 문서만 보고 붙이면 됩니다. 기준 예: 플랑크 상수(`js/planck-led.js` 의 `initShare`), 진자(`js/pendulum-report.js`·`js/pendulum-measure.js`, 띠만).

## 하는 일

| 부분 | 나오는 때 | 내용 |
|---|---|---|
| 🏫 수업 참여 띠 | 주소에 `?c=수업코드` 가 있을 때만 | 선생님 시트에서 수업을 찾아 **조·번호**(이름 없음)를 고름 → 그 조의 조 코드를 정함. 다른 실험 수업이면 그 실험 페이지로 가는 링크 |
| 👥 조 공유 칸 | `shareMount` 를 줄 때 | 반·조 → 조 코드, 📤 선생님께 보내기, 📥 불러오기(몇 초마다 자동), (있으면) 📂 CSV 불러오기·불러온 값 지우기, 실패 때 CSV 안내 |
| 하트비트 | 수업에 참여했을 때 | 단계를 바꿀 때·보낼 때·1분마다 '보고 있는 단계·잰 점 수·보냄 여부'를 선생님 시트(`progress`)에 → 교사 화면 ③ 진행 보기 |

어느 시트로 보낼지는 진자·플랑크와 같습니다: 링크의 `?s=스크립트ID` > 이 브라우저가 기억한 시트 > `js/pendulum-config.js` 기본.
학생 이름·학번·이메일은 받지 않습니다. 글자 값은 서버가 앞에 `'` 를 붙여 저장합니다(조 코드가 날짜로 바뀌지 않게).

## 붙이는 법 (4단계)

### 1. 파일 불러오기

```html
<link rel="stylesheet" href="../css/class-share.css">
…
<script src="../js/pendulum-config.js"></script>
<script src="../js/pendulum-cloud.js"></script>
<script src="../js/class-cloud.js"></script>
<script src="../js/class-share.js"></script>
<script src="../js/내-실험.js"></script>
```

### 2. 넣을 자리

```html
<h1>…</h1>
<div id="class-bar-mount"></div>          <!-- 수업 참여 띠 (없으면 첫 h1 바로 뒤에 저절로) -->
…
<section … data-step="data">
  <div id="share-mount"></div>            <!-- 조 공유 칸 (데이터 단계 맨 위 권장) -->
```

### 3. 부르기

```js
const share = ClassShare.init({
    exp: 'idealgas',                       // 아래 '실험 이름' 표
    barMount: '#class-bar-mount',
    shareMount: '#share-mount',
    csvHint: '6. 결과 → CSV 저장',          // 실패할 때 안내할 대체 방법
    // 이 노트북이 직접 잰 것 (불러온 것은 넣지 않기!) — 측정 한 묶음 = 시트 한 줄
    getItems: () => runs.map(r => ({
        id: r.id,                           // 이 노트북 안에서 겹치지 않는 영어·숫자 (서버 id = 노트북 번호 + 이 값)
        title: r.name,                      // 교사 화면·시트에 보일 이름 (예: '보일 1회')
        n: r.points.length,                 // 점 수 (0 이면 '지움'으로 보고 다른 노트북·교사 요약에서 빠짐)
        summary: { k: r.k, R2: r.r2 },      // 바로 볼 숫자 몇 개 (이름 20개까지, 숫자 또는 40자 글). 이름은 1~30자 아무 글자('온도(°C)'·'습도(%)' 가능), '|' 만 안 됨 (서버 7판부터, 6판은 영어·숫자·한글·공백·.()-_ 만)
        data: { points: r.points }          // 다른 노트북이 그대로 합칠 자료 (JSON, 27만 자까지)
    })),
    // 같은 조 다른 노트북이 보낸 것. 내 기록과 따로 보관하고(출처별로 바꿔 쓰기), 바뀌었으면 true
    onIncoming: items => {                  // items: [{ id, device, from: '노트북 AB12', title, n, summary, data, sentAt }]
        let changed = false;
        for (const it of items) changed = mergeFrom(it.device, it.id, it.data) || changed;
        if (changed) redraw();
        return changed;
    },
    getStep: () => currentStep,             // 'purpose' … 'conclusion' (7단계) 또는 'live' 등
    getPoints: () => myPointCount(),
    pollWhen: () => currentStep === 'data' || currentStep === 'result',   // 자동 불러오기를 할 때 (없으면 늘)
    incomingCount: () => importedCount(),   // (선택) 있으면 '불러온 값 지우기' 단추
    clearIncoming: () => clearImported(),
    csvImport: async files => ({ html: '✅ …', error: false })   // (선택) 있으면 '📂 CSV 불러오기' 단추
});
```

- 보내기를 누를 때 불러오기가 돌고 있으면(조 코드를 넣은 직후 등) 끝날 때까지 기다렸다 이어서 보냅니다(7판과 함께 고친 부품). 보내는 동안 자동 불러오기는 미룹니다
- 선생님이 만든 실험(`custom:<id>`)은 **공개된 실험만** 학생이 열 수 있습니다. 교사 화면이 번호를 넣을 때 공개 여부를 확인해 알려 줍니다
- 7단계 페이지: `LabUI.initSteps({ onShow: step => { currentStep = step; share.stepChanged(); } })`
- 결과 단계 등 다른 곳에 보내기 단추를 하나 더 두려면 `share.send('#상태를-보일-요소')`, `sendButtons: ['#그-단추']` 로 보내는 동안 막기
- 자기 실험만의 조 코드 칸이 이미 있으면(진자처럼) `shareMount` 없이 `onGroup: code => 내조코드로연결(code)` 만 주면 띠만 붙습니다
- 조 상태를 페이지 저장과 같이 두려면 `store: { load: () => state.share, save: o => { state.share = o; save(); } }` (기본은 `localStorage['class-share:<exp>']`)
- 전용 시트를 쓰는 실험(플랑크)은 `send(ctx)`·`pull(ctx)` 를 직접 주면 됩니다. 보통은 필요 없음

### 4. 준비 끝 표시

`js/class-cloud.js` 의 `EXPS` 에서 그 실험의 `ready` 를 `true` 로 바꿉니다. 그러면 교사 화면의 실험 고르기에서 '(페이지 연결 준비 중)' 이 사라집니다.
시험: 그 실험의 `getItems`/`onIncoming` 을 Node 에서 시험하고, Playwright 로 노트북 두 대(같은 조 코드) → 보내기 → 다른 쪽 표에 합쳐짐, 375px 가로 스크롤 없음·단추 44px 을 확인합니다(가짜 서버: `tests/fake-apps-script.cjs` 의 `loadCodeGs()` 를 작은 HTTP 서버로 띄우고 `pendulum-config.js` 요청을 가로채 그 주소로).

## 📱 폰 연결 (스마트폰으로 재는 실험: 폰 가속도·말루스·자유낙하 등)

진자처럼 **노트북이 QR 을 보여 주고 → 폰이 찍어 측정 → 저장하면 노트북에 저절로** 들어오게 합니다. 서버 변경 없음(같은 공용 저장·목록).

```js
const share = ClassShare.init({
    exp: 'phoneaccel', shareMount: '#share-mount', barMount: '#class-bar-mount',
    phone: true,                              // 또는 { page: 'projects/폰용-페이지.html' } (기본은 같은 페이지)
    onRole: role => {                         // 'phone' | 'laptop' — 폰이면 측정 화면만, 노트북이면 분석 화면 등
        document.body.classList.toggle('is-phone', role === 'phone');
    },
    onPhoneData: n => { /* (선택) 노트북: 폰에서 새 측정 n개가 들어옴 — 표 탭으로 옮기기 등 */ },
    deleteItem: id => { /* (선택) 폰 회차 목록의 🗑: 그 회차를 실험 기록에서 지우기 (없으면 🗑 단추 없음) */ },
    autoSendOnSave: false,                    // (선택) true 면 폰이 저장할 때마다 바로 보냄 ('한 번에 하나'가 자연스러운 실험)
    getItems, onIncoming, getStep, getPoints   // 위와 같음
});
// 측정 하나를 저장할 때마다 (폰: 회차 목록에 쌓임 / autoSendOnSave 면 바로 보냄, 노트북: 아무것도 안 함)
saveRun(run); share.saved();
```

- **노트북**: 조 공유 칸(수업이면 수업 참여 띠에도)에 **📱 폰으로 측정하기** → 큰 QR·주소 복사. 주소 = 폰 페이지 + `?role=phone&group=조코드&s=시트ID`(수업이면 `&c=…&jo=…&num=…`, 이름 없음). 열면 자동 불러오기가 켜지고, 폰 측정이 들어오면 "🆕 폰에서 새 측정 N개" (QR 창에도)
- **폰**(`role=phone`): 조 코드·수업 자리를 묻지 않음, 맨 위에 '📱 노트북과 연결됨 · 조 …' 띠, 조 공유 칸은 접힘.
- **폰 회차 고르기(기본)**: `share.saved()` 때마다 띠 안의 **회차 목록**(`getItems()` 의 항목마다: 제목·시각(항목에 `at` 이 있으면 그것)·점 수·요약 숫자 3개)에 쌓이고 새 회차는 체크된 상태. 각 회차 체크 → **📤 고른 회차 보내기 (N개)**, ☑ 전체 선택·☐ 전체 해제. 보낸 회차는 '✅ 보냄'(체크가 풀림), 보낸 뒤 내용이 바뀌면 '✏️ 바뀜', 못 보낸 회차는 체크가 남아 다시 누르면 그것만 다시. 다시 보내면 같은 id 로 고쳐 씀. 메모 칸(30자)은 제목 뒤에 ' · 메모' 로 붙어 보냄. 🗑(`deleteItem` 을 줄 때)로 지우면, 이미 보낸 회차는 시트에서도 빠짐. 고르기 상태는 이 폰에 저장(새로고침해도 남음, 회차 자체는 실험이 저장). 안 고른 회차는 시트에 그대로 둠
- `autoSendOnSave: true`(또는 폰에만 `phoneAutoSend: true`) 면 예전처럼 저장할 때마다 전부 보냄(실패하면 📤 다시 보내기·CSV 안내). 직접 고른 것만 보내려면 `share.sendPicked()`, 고르기 상태는 `share.runs()`
- 자기 `send(ctx)` 를 주는 실험(전용 시트)은 `ctx.only`(고른 실험 id 배열, 없으면 전부)를 따르면 됩니다 폰 저장은 노트북 화면과 따로(`class-share:<exp>:phone`), 기기 번호는 `p…` → 다른 화면에 '📱 폰 AB12' 로 보임
- **하트비트**: 폰은 측정·보내기 때만, 단계 앞에 `phone-` → 교사 진행 보기에 '📱 측정 중'
- 같은 기기로 노트북과 폰을 모두 쓰면 둘이 따로 기억합니다(시험할 때 편함)
- `share.role()`·`share.isPhone()`·`share.openPhone()`·`share.phoneLink()` 도 있음

## 실험 이름 (`exp`)

| exp | 실험 | 페이지 | 서버 저장 |
|---|---|---|---|
| `planck` | LED 플랑크 상수 | `projects/planck-led.html` | 전용 `planck` 시트 (붙임 완료) |
| `pendulum` | 스마트폰 진자 | `pendulum-report.html`(노트북)·`pendulum-measure.html`(폰) | 전용 `measurements` 시트 (띠 붙임 완료) |
| `idealgas` | 이상기체 | `projects/ideal-gas.html` | 공용 `submissions` (붙임 완료: 실험 1·2 한 줄씩, `js/ideal-gas-share.js`) |
| `eminduction` | 전자기 유도 | `projects/em-induction.html` | 공용 (붙임 완료: 저장한 측정 하나 = 한 줄, 요약 봉우리·∫ε dt·ΔΦ + 줄인 파형) |
| `malus` | 말루스 법칙 | `projects/malus-law.html` | 공용 (붙임 완료, `js/malus-share.js`) |
| `freefall` | 자유낙하 | `projects/free-fall.html` | 공용 (붙임 완료) |
| `env` · `light` · `uv` | 환경 센서 · 조도 · 자외선 | `projects/environment-lab.html`(`?sensor=light|uv`) | 공용 |
| `accel` | 가속도계 | `projects/accelerometer-lab.html` | 공용 (붙임 완료) |
| `nano` | Nano 33 BLE Sense | `projects/arduino-nano-lab.html` | 공용 |
| `phoneaccel` | 스마트폰 가속도 | `projects/phone-accelerometer.html` | 공용 (붙임 완료) |
| `custom:<실험 id>` | 선생님이 만든 실험 | `projects/custom-lab.html?id=…` | 공용 |

새 실험 이름을 더하려면 **서버(`apps-script/Code.gs` 의 `GENERIC_EXPS`)와 `js/class-cloud.js` 의 `EXPS` 를 같이** 고칩니다(시험 `tests/class-share.test.cjs` 가 둘이 같은지 확인). 서버를 고치면 `VERSION` 을 올리고 `node tools/build-apps-script-release.cjs` → 선생님은 교사 화면의 🔄 업데이트.

## 서버 요청 (참고)

- 저장: `POST { action: 'save', exp, id, group, device, title, n, summary, data, sentAt }` (Content-Type `text/plain`, 미리보기 요청 없음) → `submissions` 시트 한 줄, 같은 `exp`·조·`id` 면 고쳐 씀, 조당 200줄
- 목록: `GET ?action=list&exp=…&group=…` → `{ items: [{ id, device, title, n, summary, data, sentAt, timestamp }] }`
- 하트비트·진행 보기는 수업 연결(`docs/class-teacher-guide.md`)과 같음. 교사 화면은 실험마다 '제출: N개 (제목들) · summary 앞 4개' 로 보여 줌
