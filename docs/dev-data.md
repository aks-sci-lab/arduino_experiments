# 개발 데이터 자동 수집 (심박수 개발용, 2026-11-17)

선생님 요청: "개발 단계에서는 심박수를 위한 측정 데이터를 깃허브로 바로 수집해서 개발에 사용하고, 개발이 끝났다고 이야기하면 자동 수집을 멈춰".
선생님 선택: **지금 공개 저장소에**(공개됨을 알고 선택), **선생님 본인 기기만**, **모든 측정 자동**.

> ⚠ 이 저장소는 **공개**입니다. 모인 측정(손가락 밝기 숫자, 심박수 결과, 손목 맥박, 기기 종류)은 누구나 볼 수 있습니다. 이름·사진·영상은 보내지 않습니다.

## 흐름

```
선생님 폰(관리 열쇠 있음) ─ 측정 끝 ─▶ 선생님 시트 devlog 탭 (Apps Script 10판 devSave)
                                              │  매시간
GitHub Actions dev-data-collect.yml ◀─ devExport ┘
   └▶ dev-data 브랜치: heart-rate/YYYY-MM-DD/<id>.csv · <id>.json · heart-rate/index.json · state.json
```

- **켜지는 기기**: `js/pendulum-config.js` 의 `devCollect: true` **그리고** 그 브라우저에 그 시트의 **관리 열쇠**가 있을 때만.
  관리 열쇠는 교사 화면(`projects/class-teacher.html`)이 시트를 처음 연결할 때 그 브라우저에 저장합니다. 학생 기기에는 없어 아무것도 보내지 않습니다.
- 켜진 기기는 페이지 맨 위에 **'🧪 개발 데이터 자동 수집 중 (선생님 기기)'** 띠가 나옵니다. '이 기기 끄기'로 그 기기만 멈춤, 다시 켜려면 주소 끝에 `?devcollect=on`.
- 못 보낸 측정은 그 기기에 쌓아 두었다가(30개까지) 다음 측정 때·1분마다 다시 보냅니다.
- 같은 측정에 손목 맥박을 나중에 넣으면 같은 id 로 다시 보내 고쳐 씁니다.
- 심박수 페이지는 **카메라로 잰 회차만** 보냅니다(시뮬레이션·CSV 불러오기는 빼고).
- 얼굴 심박 개발 페이지(`projects/face-hr-lab.html`, exp `facehr`)도 **카메라로 잰 측정만** 보냅니다(🧪 시뮬레이션·📂 불러온 파일은 빼고). 보내는 것: CSV(프레임별 이마·양 볼 RGB·움직임·밝기·노출 + 정답 손가락·심박계·손목, 27만 자를 넘으면 프레임을 고르게 솎음 `thin`), 방법×영역 결과표, 정답 경로·경로 시험 기록, 짧은 기기 정보. 요약: 정답 경로·시간·fps·정답 평균·POS·CHROM·GREEN 평균과 오차. ② 두 번째 폰 정답이 나중에 붙거나 손목 수를 고치면 같은 id(`fh-…`)로 다시 보냅니다. 영상은 보내지 않습니다
- `dev-data` 브랜치는 `main` 이 아니라서 사이트 배포와 상관없습니다. 쌓인 자료는 지우지 않습니다.

## 선생님이 한 번 할 일

1. 교사 화면 맨 위 **🔄 업데이트**(9판 → 10판). 권한은 그대로라 새 허용 창이 뜨지 않아요.
2. **심박수를 잴 폰에도 관리 열쇠 넣기**: 그 폰으로 교사 화면을 열어 시트를 연결하세요(관리 열쇠는 PC 교사 화면의 '관리 열쇠'에서 확인).
   폰으로 심박수 페이지를 열어 맨 위 🧪 띠가 보이면 준비 끝.
3. GitHub → 저장소 → **Settings → Secrets and variables → Actions → New repository secret** 에 두 개
   - `DEV_SHEET_URL`: 선생님 시트 웹 앱 주소(`https://script.google.com/macros/s/…/exec`)
   - `DEV_ADMIN_KEY`: 관리 열쇠
   **채팅에 붙여 넣지 마세요.** 이 두 값은 GitHub 설정 화면에만 넣습니다.
4. Actions → **Dev data collect** → Run workflow 로 한 번 돌려 보면 `dev-data` 브랜치가 생깁니다. 그다음은 매시간 17분에 저절로.

## 개발 세션이 쓰는 법

```html
<script src="../js/pendulum-config.js"></script>
<script src="../js/pendulum-cloud.js"></script>
<script src="../js/dev-collect.js"></script>
```

```js
// 측정 하나가 끝날 때 (선생님 기기가 아니면 아무것도 안 함)
if (window.DevCollect && DevCollect.active()) DevCollect.send('facehr', {
    id: 'fh-…',                       // 같은 측정은 같은 id (영어·숫자·-_ 6~40자) → 고쳐 씀
    measuredAt: run.at,               // ISO 시각 (폴더 날짜)
    summary: { '심박수': 72, '신뢰도': 0.8 },          // 이름 1~30자, 숫자 또는 짧은 글, 20개까지
    data: { csv: csvText, result: res, device: DevCollect.uaSummary(navigator.userAgent) }   // csv 글이 있으면 그대로 .csv 파일로
});
```

- 받는 실험(`exp`)은 서버 `DEV_EXPS`: `heartrate`, `facehr`. 더하려면 `apps-script/Code.gs` 판을 올리고 `node tools/build-apps-script-release.cjs`
- 폴더 이름은 `tools/dev-data-pull.cjs` 의 `FOLDERS`(heartrate → `heart-rate`, facehr → `face-hr`)
- 자료(`data`)는 27만 자까지. `data.csv` 가 없고 `data.raw` 가 `{ 열이름: [숫자…] }` 이면 그걸로 CSV 를 만듭니다
- 받은 자료 보기: `git fetch origin dev-data && git checkout dev-data` 또는 GitHub 에서 브랜치를 `dev-data` 로

## 멈추기 ("개발 끝")

선생님이 '개발 끝'이라고 하면 통합 관리 세션이 PR 하나를 올립니다:

1. `js/pendulum-config.js` 의 `devCollect: true` → **`false`** (모든 기기의 띠·전송이 멈춤)
2. `.github/workflows/dev-data-collect.yml` 의 `schedule:` 두 줄을 지움(손 실행만 남김). devCollect 가 false 면 손으로 돌려도 아무것도 하지 않음
3. 머지(선생님 "머지해") → 배포
4. 선생님이 원하면: GitHub Secrets 의 `DEV_SHEET_URL`·`DEV_ADMIN_KEY` 삭제, 시트의 `devlog` 탭 삭제

`dev-data` 브랜치와 쌓인 파일은 지우지 않습니다(지우려면 선생님이 GitHub Branches 화면에서).
