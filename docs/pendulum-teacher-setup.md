# 스마트폰 진자 — 선생님 설정 (한 번만)

학생 폰의 측정값이 선생님 **구글 시트**에 저장되고, 같은 조 노트북 분석 화면에 자동으로 나타나게 하는 설정입니다.
화면으로 보면서 따라 하려면 사이트의 **https://aks-sci-lab.web.app/projects/pendulum-setup.html** 을 여세요 (코드 복사 단추·연결 시험 칸이 있음).

학생은 로그인하지 않고, 이름·학번·이메일은 저장하지 않습니다. 조 코드(예: `2-3-4821`, 반-조-숫자 4개)로만 구분합니다.

## 순서

1. **구글 시트 만들기**: 학교 구글 계정으로 https://sheets.new → 이름 정하기 (예: "진자 실험")
2. **Apps Script 열기**: 시트 메뉴 `확장 프로그램` → `Apps Script`
3. **코드 붙여 넣기**: `Code.gs` 의 글을 모두 지우고, 저장소의 [`apps-script/Code.gs`](../apps-script/Code.gs) 내용을 붙여 넣은 뒤 저장
4. **웹 앱으로 배포**: `배포` → `새 배포` → 유형 `웹 앱`
   - 다음 사용자 인증 정보로 실행: **나**
   - 액세스 권한이 있는 사용자: **모든 사용자** (학생이 로그인 없이 보내려면 꼭 이것)
   - `배포` → 액세스 승인 → 내 계정 → "고급" → "(안전하지 않음)으로 이동" → `허용` (내가 만든 코드라서 나오는 경고)
5. **웹 앱 URL 복사**: `https://script.google.com/macros/s/…/exec`
6. **연결 시험**: 설정 화면(`pendulum-setup.html`)에 주소를 넣고 `연결 시험` → "연결됨"
7. **사이트에 주소 넣기**: [`js/pendulum-config.js`](../js/pendulum-config.js) 의 `appsScriptUrl: ''` 따옴표 사이에 주소를 넣고 PR → 머지(배포).
   어렵다면 **Claude 대화(통합 관리 세션)에 주소를 알려 주면 대신 넣고 PR 을 만들어 줍니다.**

## 알아 두기

- 시트에 `measurements` 탭이 자동으로 생깁니다. 열: `timestamp, groupCode, L, amplitude, sensorAxis, nPeriods, T_mean, T_std, rawData, note` (명세서 4절) + `id, kind, source, T_sem, rate, device, measuredAt, rawInfo, rawData2~6`.
- 원본 센서 데이터는 글자 수를 줄여(정수로 바꾼 뒤 앞 값과의 차이를 36진수로) `rawData` 칸에 담고, 길면 `rawData2~6` 에 나눠 담습니다 (한 칸 45,000자). 그래도 넘치면 점을 고르게 줄이고 `rawInfo` 에 적습니다.
- 같은 측정을 폰에서 다시 보내면(계산 설정을 바꾼 뒤) 새 줄이 아니라 **같은 줄이 고쳐집니다**.
- 한 조에 측정은 200개까지 받습니다.
- 코드를 고치면 `배포` → `배포 관리` → 연필 → 버전 `새 버전` → `배포` 로 해야 적용됩니다 (주소는 그대로).
- 학교 인터넷에서 `script.google.com` 이 막혀 있으면 자동 연결이 안 됩니다. 그때는 폰에서 **CSV 저장** → 노트북 분석 화면에서 **CSV 불러오기**.
- 4단계(보고서·AI)에서 쓸 `reports`·`ai_logs`·`quiz` 탭 모양은 코드에 정해 두었고, Apps Script 편집기에서 `setupSheets` 를 한 번 실행하면 미리 만들어집니다 (안 해도 됨).
