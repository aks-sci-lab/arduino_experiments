# 작업 안내 (AI 코딩 도구 공용)

이 파일은 이 저장소에서 일하는 모든 AI 대화가 먼저 읽는 공통 안내입니다. **2026-11-11 부터 Claude Code 로만 작업합니다** (사용자 결정, GitHub Copilot 은 쓰지 않음).
여러 대화가 번갈아 작업하므로, 중요한 결정은 여기에 적어 다음 작업자가 이어받을 수 있게 합니다.

## 프로젝트

**센서 기반 실험실** — 중·고등학교 과학 수업용 웹 실험실. 학생이 스마트폰/PC 브라우저로 접속해 센서·카메라로 실험하고 결과를 분석·제출한다.
사용자(교사)는 코딩 초보이므로, 설명은 쉬운 한국어로 하고 용어는 풀어서 쓴다.

- 서비스 주소: https://aks-sci-lab.web.app (Firebase Hosting)
- GitHub 저장소: `aks-sci-lab/sensor-lab` (2026-11-03 사용자 지정, 예전 이름 `arduino_experiments`. GitHub 은 예전 주소를 새 주소로 자동으로 넘겨 준다)
- Firebase 프로젝트(로그인·DB): `web-experiment-f9b24`

## 구조

| 경로 | 내용 |
|---|---|
| `index.html` | 메인 페이지: 구글 로그인, 교사/학생 역할, 실험 목록, 기록 조회 |
| `projects/*.html` | 실험 페이지 (가속도계, 환경 센서, 자유낙하, 스마트폰 가속도, 말루스 법칙, LED 플랑크 상수, 이상기체 상태 방정식, 전자기 유도) |
| `projects/custom-lab.html` | 선생님이 만든 실험 한 페이지로 세 가지 화면: `?id=` 학생 화면(안내·측정값 표·그래프·질문·제출), `?edit=new\|id` 선생님 만들기·고치기, `?record=` 제출 내용 보기. `js/custom-lab.js` 화면, `js/custom-lab-math.js` 계산·검사·센서 기능 목록(시험 있음), `js/custom-lab-sensor.js` Pico 센서 보드 블루투스 연결(기존 `pico-ble.js`·`environment-protocol.js`·`sensor-definitions.js`·`accelerometer-protocol.js`·`voc-index.js` 를 그대로 씀). 설정은 Firestore `customExperiments`, 제출은 `experiments`(`tab: 'custom-lab'`) |
| `projects/pendulum-report.html`, `projects/pendulum-setup.html`, `apps-script/Code.gs` | 스마트폰 진자 2·3단계: 노트북 분석 화면(7단계 탭, 조 코드 → QR → 구글 시트에서 몇 초마다 새 측정 가져와 표 자동 추가, CSV 불러오기·직접 넣기, T²–L 최소제곱으로 g·d·오차율). 서버는 선생님 구글 시트의 Apps Script(`apps-script/Code.gs`, 시트 `measurements`), 주소는 `js/pendulum-config.js`(비면 CSV 방법만), 조 코드·원본 줄이기·요청은 `js/pendulum-cloud.js`(시험 `tests/pendulum-cloud.test.cjs`, 가짜 Apps Script `tests/fake-apps-script.cjs`), 선생님 1회 설정 `projects/pendulum-setup.html`(`js/pendulum-setup.js`, 구글 로그인 → 주소 저장 Firestore `pendulumTeachers/{uid}` → 우리 반 링크 `pendulum-report.html?s=스크립트ID`)·`docs/pendulum-teacher-setup.md`. 선생님마다 자기 시트: 링크의 `?s=` > 노트북에 기억한 것 > `pendulum-config.js` 기본, 폰은 QR 의 `&s=` 만 따름 |
| `projects/pendulum-report.html`, `projects/pendulum-setup.html`, `apps-script/Code.gs` | 스마트폰 진자 2·3단계: 노트북 분석 화면(7단계 탭, 조 코드 → QR → 구글 시트에서 몇 초마다 새 측정 가져와 표 자동 추가, CSV 불러오기·직접 넣기, T²–L 최소제곱으로 g·d·오차율). 서버는 선생님 구글 시트의 Apps Script(`apps-script/Code.gs`, 시트 `measurements`), 주소는 `js/pendulum-config.js`(비면 CSV 방법만), 조 코드·원본 줄이기·요청은 `js/pendulum-cloud.js`(시험 `tests/pendulum-cloud.test.cjs`, 가짜 Apps Script `tests/fake-apps-script.cjs`), 선생님 1회 설정 `projects/pendulum-setup.html`·`docs/pendulum-teacher-setup.md` |
| `projects/class-teacher.html` | **수업 연결(교사·학생 로그인 없이)**: ① 선생님 시트 연결(웹 앱 주소 → 연결 시험 4판 이상 → 이 브라우저 기억) ② 수업 만들기(반·학생 수·조별 인원 → 조 고르게 나누기 → 수업 코드 `반-4자리`·조 코드 `반-조-같은 4자리`·QR `실험페이지?c=수업코드&s=스크립트ID`·교사 열쇠) ③ 진행 보기(10초마다, 조별 카드·학생 자세히·5분 쉬면 💤). `js/class-teacher.js` 화면, `js/class-cloud.js` 조 나누기·링크·요약·요청(시험 `tests/class-cloud.test.cjs`), 서버 `apps-script/Code.gs` 4판(`classes`·`progress` 시트, `createClass`·`joinInfo`·`heartbeat`·`classStatus`, 열쇠는 SHA-256 해시만·POST 본문으로만). 5판부터 맨 위 띠로 **서버 스스로 업데이트**(사이트의 `apps-script/release.json` 과 판 비교 → 🔄 업데이트·↩ 되돌리기, 관리 열쇠는 시트마다 하나, 해시만 스크립트 속성에). 매니페스트 `apps-script/appsscript.json`, `release.json` 은 `node tools/build-apps-script-release.cjs` 로 만들고 시험 `tests/apps-script-update.test.cjs` 가 맞는지 확인 학생 쪽은 실험 페이지의 `?c=` → '🏫 수업 참여' 띠(지금은 플랑크), 메인 화면 '교사로 시작/학생으로 시작'. 안내 `docs/class-teacher-guide.md` |
| `js/server-maker.js` | 교사 화면 **'🛠 내 서버 만들기'**: 구글 로그인(Google Identity Services 토큰 방식, 비밀번호 없이, 권한 `drive.file`·`script.projects`·`script.deployments`) 한 번으로 선생님 드라이브에 '센서 실험실 서버' 시트 → 시트에 붙은 Apps Script → 사이트 공식 코드(release.json 해시 확인) → 버전 → 웹 앱 배포 → 새 탭에서 선생님이 권한 허용 → 연결·관리 열쇠. 단계마다 기억해 중간 실패 뒤 이어서. 클라이언트 ID 는 `js/pendulum-config.js` 의 `googleClientId`(비면 손으로 만들기 안내만). 시험 `tests/server-maker.test.cjs` |
| `js/class-share.js` | **수업 참여 · 조 공유 공통 부품** (모든 실험 페이지용, `css/class-share.css`, 사용법 `docs/class-share.md`): `?c=` 면 '🏫 수업 참여' 띠(조·번호 → 조 코드), `shareMount` 면 '👥 조 공유' 칸(보내기·불러오기·자동·CSV 대체), 하트비트. 실험 페이지는 `ClassShare.init({ exp, getItems, onIncoming, getStep, getPoints })`. 서버는 `apps-script/Code.gs` 6판 공용 `submissions` 시트(플랑크·진자는 전용 시트). 실험 이름·페이지·`ready` 는 `js/class-cloud.js` 의 `EXPS`(서버 `GENERIC_EXPS` 와 같게). 시험 `tests/class-share.test.cjs`. 붙인 곳: 플랑크(조 공유+띠), 진자 노트북·폰(띠) |
| `apps-script/planck-led/` | LED 플랑크 상수 실험의 **Google Apps Script 웹앱** (선생님 과제 제출용, 사이트와 별개로 선생님 구글 시트에 붙여 배포). `Code.gs` 서버(제출 검사·'제출' 시트 저장·교사 암호 = 스크립트 속성 `TEACHER_PASSWORD`), `Index.html` 학생, `Teacher.html` 선생님(`?page=teacher`, 조별 표·V₀–f·h·CSV), `PlanckMath.html` 은 `js/planck-math.js` 로 자동 생성(`node tools/build-planck-apps-script.cjs`), 설치 안내 `README.md`, 과제용 `보고서.md`, 내려받기 `apps-script/planck-led-appsscript.zip`(같은 도구로 생성). 시험 `tests/planck-apps-script*.test.cjs`(가짜 Apps Script `tests/fake-planck-apps-script.cjs`) |
| `projects/pendulum-measure.html` | 스마트폰 진자 1단계: 측정 앱(명세서 `docs/pendulum-spec.md`). 폰 센서(DeviceMotionEvent) 가속도·회전 속도, 아이폰 권한·화면 켜짐 유지·3초 보정, 0 통과로 주기 T(가속도는 통과 두 번 = 한 주기), FFT 비교, 시뮬레이션, CSV. `js/pendulum-math.js` 계산(브라우저·Node 공용, 시험 `tests/pendulum-math.test.cjs`, 2단계용 T²–L 직선·CSV 읽기 포함), `js/pendulum-measure.js` 화면, `css/pendulum.css`. 측정 화면은 주소에 `?group=조코드` 가 있으면 '💻 노트북으로 보내기' |
| `projects/heart-rate.html` | 스마트폰 카메라 심박수 **한 화면 측정 페이지**(`.dash`: 상태 띠 → 심박수·박동 간격·품질·노출 카드 → 실시간 맥파 → 회차·손목 15초×4·CSV 접기 → 자세히·시뮬레이션·안내 접기). 뒤 카메라를 손가락으로 덮고 프레임마다 가운데 영역 R·G·밝기 평균과 노출 값(exposureTime·iso)만 기록(영상은 저장·전송 안 함). 노출: 지원 확인 → manual 잠금 → 1.5초 동안 getSettings 값이 안 바뀌는지 확인 → 🔒 고정됨(그대로) / 고정 안 됨(sRGB→선형 후 노출로 나눠 보정, 노출 값 어긋남·크기는 자료에서 맞춤) / 노출 값 없음(보정 불가 경고). 계산 `js/heart-rate-math.js`(보간 → 2초 이동평균 빼기 → 0.6~3.5 Hz → FFT·자기상관·봉우리 → 신뢰도, 시험 `tests/heart-rate-math.test.cjs`), 화면 `js/heart-rate.js`, 시험 `tests/heart-rate-ui.test.cjs`(가짜 카메라 세 경우). 7단계·운동 전후 회복은 브랜치 `claude/heart-rate-full` 에 보관(다음 단계). **📱 측정은 폰, 분석은 노트북**: 노트북의 '📱 폰으로 측정하기' QR → `heart-rate.html?role=phone&group=…`(폰은 카메라·측정·안전 확인만, 결과 숨김, 한 번 재기·숨 참기 회차를 쌓아 골라 보내기) → 원본 frames 를 `js/heart-rate-raw.js`(kind `raw`, 시각 ms 차이·0.01 단위 차이·같은 값 묶음, 27만 자 넘으면 솎고 표시, 시험 `tests/heart-rate-raw.test.cjs`)로 담아 선생님 시트 → 노트북(숨 참기 탐구·데이터 가공 실험실)이 받아 계산. 💻 노트북·PC(`LabUI.device` 'laptop', 폰 역할 아님)는 측정 부분(`.hr-measure`)을 숨기고 '📱 폰으로 측정해 보내기' 카드(`share.phoneCard`), 태블릿·폰은 측정. 시험 `tests/heart-rate-phone-ui.test.cjs`(노트북·Pixel 7 폰·Galaxy Tab S4·iPhone 13) |
| `projects/heart-rate.html` | 스마트폰 카메라 심박수(7단계 탭, 수업 주제 '운동 전후 심박수와 회복'): 뒤 카메라를 손가락으로 덮고 프레임마다 가운데 영역 R·G·밝기 평균과 노출 값(exposureTime·iso)만 기록(영상은 저장·전송 안 함), 손가락을 덮고 3초 자동 노출 뒤 `exposureMode:'manual'` 로 잠금(안 되면 '노출 고정 안 됨' 표시), 플래시 선택, 15/30/60초, 시뮬레이션, 원본 CSV(phyphox CSV 도 읽음), 손목 15초 ×4 비교. 계산 `js/heart-rate-math.js`(보간 → 2초 이동평균 빼기 → 0.6~3.5 Hz → FFT·자기상관·봉우리(최소 간격 0.6×주기) → 신뢰도·노출 출렁임 경고, 시험 `tests/heart-rate-math.test.cjs`), 화면 `js/heart-rate.js`, 조 공유 자료 `js/heart-rate-share.js`(원본 포함), `ClassShare`(exp `heartrate`, 📱 폰 연결·회차 골라 보내기), 결과 단계 회복 그래프. 시험 `tests/heart-rate-ui.test.cjs`(가짜 카메라). **서버 `GENERIC_EXPS` 에 `heartrate` 추가 필요**(`class-cloud.js` 의 `needServer: 9`) |
| `projects/data-lab.html` | **데이터 가공 실험실**(1부, 설계서 `docs/data-processing-class-design.md`, 고등학교 융합): 심박수 원본(손가락 카메라 R·G·밝기·노출)을 단계 탭 0 원천·1 수집·2 점검·정제·3 변환·4 걸러 내기·5 특징 뽑기·6 결과·검증으로, 단계마다 전 → 후 그래프·바꿔 볼 설정(영역 크기, 보는 구간, 자를 구간·자동 제안, 채널·노출 보정, 이동평균·범위, 봉우리 최소 간격·최종 방법), 맨 위에 늘 최종 심박수(기본 설정과 비교), 단계마다 '무엇을 골랐고 왜' 한 줄 → 6단계 기록 모음(복사·인쇄)·손목 15초×4 비교. 자료: 예시(선생님 실측 4회차 `data/heart-rate/` = `tests/fixtures/heart-rate/` 복사본, 문제 있는 가짜 자료 3개는 `makeExample` 시뮬레이션) 또는 내 CSV(`HeartRateMath.parseCsv`). 계산 `js/data-lab-math.js`(heart-rate-math 함수를 단계별로 다시 씀, 고치지 않음, 시험 `tests/data-lab-math.test.cjs`), 화면 `js/data-lab.js`·`css/data-lab.css`, 시험 `tests/data-lab-ui.test.cjs`. 이름·학번 없음, 영상 없음, 내 CSV 는 서버로 보내지 않음. '📱 폰으로 재고 여기서 분석하기' 접기(`ClassShare` exp `heartrate`, 폰 페이지 `heart-rate.html`)로 폰이 보낸 원본(kind `raw`)이 자료 목록 '📱 폰에서 받은 측정'에 들어옴(🆕 알림) |
| `projects/face-hr-lab.html` | **🛠 얼굴 심박(rPPG) 개발 페이지 (선생님 전용, 메인 목록에 없음·noindex, 메인 '🔐 사이트 관리' 접기에 링크)**: 폰 앞 카메라 → MediaPipe 얼굴 랜드마크(jsdelivr `@mediapipe/tasks-vision@0.10.14`, 모델은 사이트에 직접 둔 `vendor/mediapipe/face_landmarker.task`(Apache-2.0, 출처·해시는 같은 폴더 README), 못 쓰면 안내 타원)로 이마·양 볼 피부색 화소 평균 → GREEN·CHROM·POS, 10초 창 심박. 정답 경로 자동 선택 ① 같은 폰 뒤 카메라 동시 ② 두 번째 폰(`ClassShare` 📱 폰 연결, exp `heartrate` 의 `kind: 'facegt'` 자료, 시계는 n=0 '시계 맞추기' 줄로 서버 왕복 + 곡선 맞추기) ③ 블루투스 심박계(0x180D/0x2A37) ④ 손목 15초×4. 영상은 저장·전송 안 함. 계산 `js/face-hr-math.js`(시험 `tests/face-hr-math.test.cjs`), 화면 `js/face-hr-lab.js`, 시험 `tests/face-hr-ui.test.cjs`(가짜 얼굴·손가락 영상) |
| `projects/quantum-dot.html` | **탄소 양자점 형광 실험**(7단계, 고등학교 물리·화학): 구연산+요소 전자레인지 가열 → 자외선 형광. 바꿀 것 가열 시간·재료 비율. 폰 측정(`?role=phone`·폰·태블릿): ① 시료 정보 ② 형광 색(측정 영역 R·G·B → 색상 → 대표 파장 '추정') ③ 간이 분광기(사진 속 띠를 따라 고른 선 → 화소별 밝기, 형광등 436·546·611/레이저 532·650 으로 화소→파장 직선 맞춤, 이 기기에 기억 `quantum-dot-cal-v1`, 봉우리·반치폭) ④ 저장 → 회차 골라 보내기. 찍을 때마다 `getSettings()` 노출 시간·ISO·색온도·🔒 고정 여부(말루스와 같은 따로 걸기 `lockExposure`), EV₁₀₀·lux(조리개 N 기본 1.8)·보정 밝기 = 선형 밝기 ÷ (t × ISO/100). 노트북은 QR 카드·분석만: 시료 표·가열 시간/비율 → λ·E·보정 밝기·반치폭 그래프(최소제곱 직선)·분광 곡선 겹쳐 보기·CSV 내려받기/불러오기. 사진·영상은 안 보냄. 계산 `js/quantum-dot-math.js`(시험 `tests/quantum-dot-math.test.cjs`), 화면 `js/quantum-dot.js`·`css/quantum-dot.css`, 시험 `tests/quantum-dot-ui.test.cjs`. 조 공유 exp `qdot`(서버 11판 필요, `class-cloud.js` `needServer: 11` → 교사 화면 안내) |
| `projects/figure-maker.html` | 문항 그림 도구 넘김 페이지만 남김 (도구는 `aks-sci-lab/figure-maker` 로 독립, 2026-10-30). 자동 저장된 그림을 `#move=` 로 넘김 |
| `js/`, `css/` | 실험 페이지용 스크립트·스타일 (`malus-*.js`: 말루스 법칙 실험 — `malus-math.js` 계산, `malus-tutorial.js` 접해보기 탭, `malus-law.js` 측정·분석·설정, `malus-sheets.js` 구글 시트(선택), `malus-share.js` 조 공유 자료, `planck-*.js`: LED 플랑크 상수 실험, `ideal-gas*.js`: 이상기체 실험) |
| `projects/ble-explorer.html` | **시판 블루투스 센서 해석 도구 (개발용, noindex, 메인 '🔐 사이트 관리' 안 링크만)**: 탭 ①연결(Web Bluetooth `acceptAllDevices` + 표준 서비스·직접 넣은 UUID 를 `optionalServices` 로, 서비스·특성 나무, 기기 정보 자동 읽기) ②기록(알림·읽기, 16진수·바이트별 10진수, 같은 길이끼리 바뀌는 바이트 강조, 쓰기는 확인 칸 뒤) ③해석(필드: 자리·형식·배율·더할 값·단위·비트 마스크, 참값 맞추기 → 모든 자리·형식 직선 맞춤 후보 순위, 값·그래프) ④저장(규칙 JSON `sensor-lab-ble-decoder`·이 브라우저, 기록 CSV·JSON `sensor-lab-ble-log`) ⑤도움말·법적 주의. 계산 `js/ble-decode.js`(시험 `tests/ble-decode.test.cjs`), 화면 `js/ble-explorer.js`·`css/ble-explorer.css`, 화면 시험 `tests/ble-explorer-ui.test.cjs`(가짜 센서) |
| `firmware/em-induction/` | 전자기 유도 실험용 아두이노 펌웨어 (ADS1115 로 코일 전압·션트 전압, USB 시리얼 115200, 웹 시리얼은 PC 크롬·엣지만) |
| `firmware/pico2w-environment/` | Pico 센서 보드용 MicroPython 펌웨어와 Thonny 설치 안내. INA219/INA226 전류·전압 모듈(`START:IV`, 플랑크 상수 실험)도 같은 펌웨어로 |
| `firmware/nano33-ble-sense-rev2/` | 아두이노 Nano 33 BLE Sense Rev2 펌웨어(`NanoSenseLab/NanoSenseLab.ino`, 가속도 BMI270·온습도 HS3003·기압 LPS22HB, 이름은 칩 주소로 `NanoSense-XXXX`, 블루투스 약속은 Pico 와 같음)와 아두이노 IDE 설치 안내. 페이지는 `projects/arduino-nano-lab.html`(`js/arduino-nano-lab.js` 화면, `js/nano-sense.js` 약속·CSV, 시험 있음) |
| `tests/`, `tools/`, `vendor/sensirion/` | 센서 테스트, VOC 알고리즘 재빌드 도구, 제조사 원본·라이선스·WebAssembly |
| `walk-run-detector/` | 걷기·뛰기 판정 머신러닝 수업 앱 (자체 README 참고) |
| `pass/` | 예전 조퇴증·외출증 공유 링크를 새 주소(aks-sci-lab.github.io/teacher-desk/)로 넘기는 페이지만 남김 |
| `firestore.rules` | Firestore 보안 규칙 |
| `.claude/skills/` | Claude Code 대화가 이 저장소에서 쓰는 작업 방법(스킬). `phone-sensor-to-apps-script`: 스마트폰 센서 → 구글 Apps Script → 노트북(QR·조 코드) 방법 (진자 실험 기준) |

새 실험을 추가하면 `index.html` 의 `프로젝트 목록` 에 링크를 넣는다. 표에 값을 넣고 그래프를 보는 단순한 실험은 코드 없이 메인 페이지의 "➕ 새 실험 만들기"(교사용 모드)로 만든다.

## 규칙

- 빌드 도구 없음: 순수 HTML/CSS/JavaScript. 외부 라이브러리는 CDN(jsdelivr, gstatic)만 쓴다. **예외: 구글 로그인 도구 `https://accounts.google.com/gsi/client`**(교사 화면 '🛠 내 서버 만들기'의 토큰 방식 로그인, 2026-11-16 사용자 결정)
- 카메라·센서는 https 에서만 동작한다.
- 화면 문구와 주석은 한국어. 스마트폰 화면 폭을 기본으로 생각한다.
- Firebase 설정값은 기존 파일(`js/phone-accel-cloud.js` 등)의 것을 그대로 쓴다. 로그인 세션은 같은 사이트 안에서 공유된다.
- 비밀값(API 키 파일 `key.txt`, 서비스 계정 JSON)은 커밋하지 않는다.

## UI 규칙 (2026-11-14 사용자 결정, UI 통일성 대화)

모든 페이지가 같은 모양을 쓰도록 한 규칙이다. 새 페이지를 만들거나 고칠 때 따른다.

- **공통 파일을 가장 먼저 불러온다**: `<meta name="viewport">` 바로 다음에 `css/lab-base.css` 와 `js/lab-ui.js` (defer 없이). 페이지 CSS 는 그 뒤에 덧씌운다.
- **색·글꼴·간격은 `lab-base.css` 의 변수만 쓴다**: 주 색 `var(--c-primary)`(#1565c0), 성공 `--c-success`, 삭제 `--c-danger`, 내려받기 `--c-info`, 보조 `--c-secondary`, 글꼴 `var(--font)`. 흰 글자가 잘 읽히도록(대비 4.5:1 이상) 예전 #007bff·#28a745·#17a2b8 보다 진하게 정했다. 새 색을 페이지에 직접 쓰지 않는다 (그림 SVG·그래프 선 색은 예외).
- **크게 보기**: 어느 페이지에서나 **Alt+B**(맥 Option+B)로 화면 전체를 1.35배로 키우고 끈다(교실 프로젝터용). 켠 상태는 브라우저에 기억된다. 페이지에서 Alt+B 를 다른 일에 쓰지 않는다.
- **두 가지 화면 방식**
  - **단계형** — 실험 이름이 있는 실험(플랑크 상수, 이상기체, 말루스, 전자기 유도, 자유낙하): 보고서 순서 **7단계 탭**(목적·이론·준비물·과정·데이터·결과·결론)으로 진행한다. 플랑크 상수 페이지의 번호 탭(상단 고정, 휴대폰 4+3 두 줄)이 기준이다. 공통 부품: `<nav class="steps">` + `<section class="step-panel" data-step="…">` + `LabUI.initSteps({ key, onShow })` (`css/lab-base.css`·`js/lab-ui.js`, 본 단계 ✓, 주소 `#step-5` 로 바로 열기, 화살표 키). 말루스·전자기 유도·자유낙하가 이 부품을 쓴다. 플랑크·이상기체는 같은 모양의 자체 탭(`.tabs`)을 쓰며 나중에 옮긴다. 폭은 `--w-step`(860px).
  - **한 화면형** — 실험 이름 없이 센서 값을 보는 페이지(환경, 가속도계, Nano, 스마트폰 가속도): 위에서부터 연결·상태 → 큰 숫자 → 그래프 → 기록·회차·CSV(접기) → 펌웨어 안내(접기). 폭은 `--w-dash`(1200px). 공통 부품: `main.dash` > `.dash-bar`(연결·상태 띠, PC 에서는 위에 고정) · `.dash-grid`(`.dash-readouts`의 `.dash-card` 큰 숫자 + `.dash-chart`, 900px 이상이면 숫자 왼쪽·그래프 오른쪽) · `.dash-more`(접기). 환경·가속도계·Nano·스마트폰 가속도가 이 부품을 쓴다.
  - **선생님이 만든 실험**: 만들기 화면의 '학생 화면 방식'에서 한 화면(기본)/7단계를 고른다 (설정 `layout`, 7단계일 때 이론·준비물·과정 글 `stepTexts`). 7단계면 실험 안내 글 = 1 목적, 센서·표 = 5 데이터, 그래프 = 6 결과, 질문·제출 = 7 결론으로 자동 배치. 제출 내용 보기는 늘 한 화면.
- 조도·자외선·VOC 는 환경 센서 페이지 하나에서 고른다 (`environment-lab.html` 위의 '측정할 센서', `?sensor=light`·`?sensor=uv`). 예전 `light-lab.html`·`uv-lab.html` 은 넘김 페이지, `voc-lab.html?legacy=1` 은 예전 VOC 회차 보관용. 조도·자외선 화면은 `js/sensor-lab.js`, 온도·습도·기압·VOC 화면은 페이지 안 스크립트가 맡는다.
- **길게 스크롤하지 않기** (2026-11-14 사용자 결정 "스크롤해서 화면 전환하는 것은 지양, 필요하면 탭이나 레이아웃"): 한 화면에서 할 일이 길어지면 페이지 안 작은 탭으로 나눈다. 공통 부품 `<nav class="subtabs">` + `.tab-panel[data-tab]` + `LabUI.initTabs(nav, { key, start })`(진자 측정·메인 화면). 제목으로 나뉜 긴 글(이론·과정)은 부모에 `data-subtabs`, 탭을 시작할 제목(또는 카드)에 `data-subtab="이름"` 만 붙이면 `lab-ui.js` 가 자동으로 탭과 '다음' 단추를 만든다(플랑크·이상기체·말루스·전자기 유도). 측정 중 계속 눌러야 하는 단추는 탭 위의 띠(`.dash-bar`)에 둔다.
- **고르기 카드 = 사용자가 고른 기준 모양** (2026-11-14, 메인 화면 휴대폰 카드를 보고 "제일 깔끔해"): 그림이 위에 크게, 그 아래 굵은 파란 제목, 회색 한 줄 설명, 넉넉한 여백·둥근 테두리. 실험·센서·종류를 고르는 화면은 모두 이 모양을 쓴다. 카드 목록은 `.pick-grid` > `a.pick-card`(`<span class="ic">`·`<b>`·`<small>`, 링크가 둘이면 `div.pick-card` + `.pick-links`), 휴대폰 2칸·넓은 화면 폭에 맞춰 여러 칸. 페이지 위 바꾸기 단추 줄은 `.seg.pick`(환경 센서 고르기, 자유낙하 실험 종류, Nano 가속도/환경).
- 한 화면형의 숫자 카드(`.dash-card`)가 4개면 휴대폰에서 2×2 로 놓인다(혼자 남는 줄 없이).
- **폰 측정 · 노트북 분석 이원화** (2026-11-17 사용자 결정 "스마트폰으로 측정하는 보고서 작성 실험은 전부 측정은 스마트폰, 분석은 노트북", "태블릿은 둘 다 실행 가능하게, 노트북은 완전히 나눔", "노트북으로 측정하는 실험은 외부 블루투스 센서를 이용하는 경우밖에 없어"): 폰 센서·카메라로 재는 실험(말루스·자유낙하·진자·심박수 숨 참기·데이터 가공 실험실·스마트폰 가속도)은 **노트북·PC 에서는 측정 기능 없이 분석만**(5. 데이터 맨 위 '📱 폰으로 측정해 보내기' QR → 폰 → 고른 회차가 노트북에 도착), **폰은 측정**, **태블릿은 둘 다**. 블루투스·USB 센서 실험(환경·가속도계 보드·Nano·플랑크·이상기체·전자기 유도)은 지금처럼 노트북에서 측정. 기기 종류는 공통 `LabUI.device()`(`js/lab-ui.js`: 터치 주 입력 + 짧은 변 600 미만 = 폰, 이상 = 태블릿, 아니면 노트북, 아이패드 포함), `<html class="device-phone|device-tablet|device-laptop">` 와 `css/lab-base.css` 의 `.hide-on-laptop`·`.show-on-laptop`·`.hide-on-phone`·`.show-on-phone`, 추측이 틀리면 `LabUI.deviceSwitch(자리)`('이 기기: ▾', 이 브라우저에 기억) 또는 주소 `?device=phone|tablet|laptop`. 시험은 Playwright `devices['iPhone 13']`·`['Galaxy Tab S4']` 또는 `?device=` 로 기기를 정한다(터치 없는 375px 창은 노트북). 시험 `tests/lab-ui-device.test.cjs`
- 휴대폰 폭(375px)에서 가로 스크롤이 생기지 않아야 하고, 버튼·고르기 칸은 높이 44px 이상(표 안의 작은 버튼은 예외).

## 배포 상태 (2026-10-26)

- 10월 6일 라이브 사이트에만 있던 센서 작업은 PR #30 으로 `main` 에 복구했다. 이제 `main` 이 라이브 사이트의 내용을 모두 포함한다.
- 자동 배포(push 트리거)를 다시 켰다. 단, 저장소 Secret `FIREBASE_SERVICE_ACCOUNT` 가 등록되기 전까지는 배포 단계를 건너뛴다.
- **PC 에서 `firebase deploy` 로 직접 배포하지 않는다.** `main` 에 없는 내용이 다시 라이브에만 남는 문제가 생긴다. 배포는 항상 `main` 에서 한다.
- 확인된 값: Hosting site `aks-sci-lab`, Firebase 프로젝트 `web-experiment-f9b24`.

## 역할 분담 (사용자 지정, 2026-11-11 Claude Code 전용으로 바꿈)

| 담당 | 하는 일 | 하지 않는 일 |
|---|---|---|
| **Claude Code: 구현** | 브랜치에서 수정 → 테스트 → PR 생성. 검토에서 돌아온 문제를 같은 PR 에서 고친다 | 사용자 승인 없는 `main` 머지·배포, PC 에서 `firebase deploy` |
| **Claude Code: 검토·머지** (머지 대화 또는 통합 관리 세션) | 머지 전에 원래 요구사항과 기존 기능을 직접 확인(시험 실행, 충돌, 전체 페이지 열기). 사용자가 "머지해" 라고 한 PR 을 머지하고 배포 결과를 확인 | 사용자 승인 없는 머지·배포 |
| **사용자** | 최종 승인 (머지·배포 결정), GitHub 설정에서만 되는 일(저장소 이름, 브랜치 삭제, Firebase 규칙 게시) | |

- 머지는 `main` 자동 배포로 이어지므로, **머지 = 배포**로 보고 사용자 승인 없이 하지 않는다.
- PR 설명에는 원래 요구사항, 바꾼 내용, 실행한 테스트, 확인하지 못한 것을 적는다. 검토자는 이것을 그대로 믿지 말고 직접 확인한다.
- 만든 대화가 자기 PR 을 그대로 머지하는 경우에도, 머지 직전에 최신 `main` 과 합친 상태로 시험을 다시 돌린다. 큰 변경은 다른 대화(머지 대화)가 확인하는 편이 안전하다.
- 예전 기록의 "Copilot" 은 2026-11-10 까지의 방식이다. `.github/copilot-instructions.md` 는 혹시 Copilot 을 다시 쓸 때를 위해 남겨 두되, 이 파일(`AGENTS.md`)이 우선한다.

## 대화 분리: 개발 대화 / 머지 대화 (사용자 결정 2026-10-30)

머지·배포를 기다리는 동안 개발이 멈추지 않도록, 대화(채팅)를 두 종류로 나눠 쓴다. 사용자가 첫 말로 어느 쪽인지 알려 준다. 알려 주지 않았으면 개발 대화로 보고, 머지 요청이 오면 머지 대화를 따로 여는 게 좋은지 한 번 알려 준다.

| 대화 | 하는 일 | 하지 않는 일 |
|---|---|---|
| **개발 대화** | 브랜치에서 수정 → 테스트 → PR 생성, 검토 의견 반영, 다음 작업 | `main` 머지, 배포 |
| **머지 대화** | PR 확인(테스트·충돌·PR 설명 검토) → 사용자 승인 후 머지 → 배포 확인. 버전 번호 겹침은 머지 직전에 큰 쪽 +1 로 정리 | 코드 수정 (고칠 게 있으면 PR 댓글로 개발 대화에 돌려줌), 사용자 승인 없는 머지 |

- 두 대화는 서로의 기억을 공유하지 않는다. 인계는 **PR 설명**(요구사항·바꾼 내용·테스트·미검증)으로 한다.
- 같은 브랜치·같은 폴더를 두 대화가 동시에 고치지 않는다. 머지 대화는 GitHub 에서 PR 만 다룬다.
- 머지는 여전히 사용자가 "머지해" 라고 직접 말한 PR 에 대해서만 한다 (머지 = 배포).
- **한 대화는 한 저장소만 다룬다.** 실험실(`sensor-lab`)·업무 데스크(`teacher-desk`)·문항 그림 도구(`figure-maker`) 일을 한 대화에 섞지 않는다. 다른 저장소 일이 생기면 그 프로젝트의 대화에 PR 설명이나 메시지로 넘긴다 (사용자 결정 2026-10-30).

## 사용자에게 결정 묻기 (2026-11-17 사용자 지정)

- 사용자가 정해야 할 것이 있으면 **글로 길게 묻지 말고 고를 수 있는 목록으로** 묻는다(Claude Code 의 선택 질문 도구, 한 번에 1~4개, 항목마다 짧은 설명, 추천 항목은 맨 앞에 '(추천)'). 하위 세션도 같다 — 사용자에게 직접 물을 때 목록으로, 통합 관리 세션에 넘길 때는 '정할 것'과 후보를 적어 넘긴다.

## 작업 흐름과 배포

1. `main` 에 직접 커밋하지 않고 브랜치에서 작업한 뒤 PR 을 만든다. 머지는 위 역할 분담에 따라 사용자 승인 후에만 한다.
2. PR 이 `main` 에 머지되면 `.github/workflows/deploy-hosting.yml` 이 aks-sci-lab.web.app 에 자동 배포한다.
3. `firestore.rules` 를 바꾼 PR 이 머지되면 `.github/workflows/deploy-firestore-rules.yml` 이 규칙을 자동으로 게시한다(2026-11-14 부터, 사용자 요청). PR 설명에는 "(규칙 바뀜)"을 적고, 머지 뒤 Actions 의 "Deploy Firestore rules" 가 성공했는지 확인한다. 실패하면 `docs/DEPLOY.md` 의 권한 안내.

자세한 배포 설정: `docs/DEPLOY.md`

## 통합 관리 (2026-11-03)

- 대화(세션)와 GitHub 브랜치·PR 의 짝, 대화 없이 GitHub 에만 남은 것, 정리할 브랜치는 `docs/MANAGEMENT.md` 에서 관리한다 (사용자 지정 "통합 관리 세션").
- 모든 세션은 통합 관리 세션의 하위 세션이다 (사용자 지정 2026-11-04). 부모 세션은 바꿀 수 없어 태그로 나눈다: `통합관리` + `통합관리:실험실`·`통합관리:펌웨어`·`통합관리:그림도구`·`통합관리:업무데스크`·`통합관리:교육과정`·`통합관리:기타`.
- 새 대화를 시작하면 위 태그를 붙이고, 새 대화나 PR 이 생기면 그 표에 한 줄 적는다.
- 통합 관리 세션은 "한 대화는 한 저장소" 규칙의 예외로, 다른 저장소의 대화도 **목록으로만** 본다. 다른 저장소의 코드는 고치지 않는다.
- Claude Code 대화는 자기 작업 브랜치 외에는 push·삭제 권한이 없다. **브랜치 삭제는 사용자가 GitHub 웹(Branches 화면의 🗑)에서 한다.** 저장소 Settings → General 의 "Automatically delete head branches" 를 켜 두면 PR 이 머지될 때 그 브랜치가 자동으로 지워져 이 일이 거의 없어진다. 지울 목록은 `docs/MANAGEMENT.md` 와 이슈에 적는다.

## 저장소 이름 바꾸기 (2026-11-03, 사용자 지정)

프로젝트 이름은 **센서 기반 실험실**, GitHub 저장소 이름은 `sensor-lab` 이다 (GitHub 저장소 이름에는 한글을 쓸 수 없음). 문서·화면 이름은 PR 로 바꿨고, 저장소 이름 자체는 GitHub 설정에서 사람이 바꾼다.

1. GitHub → `aks-sci-lab/arduino_experiments` → Settings → General → Repository name 에 `sensor-lab` 입력 → Rename
2. 바꾼 뒤 확인할 것
   - 사이트(https://aks-sci-lab.web.app)·Firebase 는 영향 없음. 자동 배포는 `main` push 로 그대로 동작
   - 예전 GitHub 주소(저장소·git clone·Releases `desk-latest` 내려받기)는 GitHub 이 새 주소로 자동으로 넘겨 준다. 단, 나중에 누가 `arduino_experiments` 라는 새 저장소를 만들면 넘김이 끊기므로 그 이름은 다시 쓰지 않는다
   - **GitHub Pages 주소는 넘겨 주지 않는다**: `aks-sci-lab.github.io/arduino_experiments/` → `aks-sci-lab.github.io/sensor-lab/` 로 바뀐다. 수업에서는 web.app 주소를 쓴다
   - PC 에 내려받은 폴더는 그대로 써도 되고, 원하면 `git remote set-url origin https://github.com/aks-sci-lab/sensor-lab.git`
   - Claude Code 새 대화에서는 저장소를 `sensor-lab` 으로 고른다

## 교사 업무 데스크 (2026-10-27 독립)

- 교사 업무 데스크는 **이 저장소와 별개의 프로젝트**다 (사용자 지정). 코드·시험·윈도우 ZIP 배포·공유 페이지는 모두 **`aks-sci-lab/teacher-desk`** 에서 관리한다. 이 저장소에서 업무 데스크 일을 하지 않는다.
- 이 저장소에 남긴 것: `pass/` 넘김 페이지(예전 QR 링크용), Releases `desk-latest`(0.3.0 — 설치된 `update-desk.bat` 은 새 저장소를 먼저, 없으면 여기를 받음). 둘 다 지우지 않는다.

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
- 2026-10-26: 말루스 실험 탐구 중심 개편(탭: 접해보기[예측·측정 계획·의심 기준] / 측정하기[계획표] / 분석하기[모델 비교·잔차·정규화 전후 비교·결론] / 설정[학습·빠른 모드]) PR — Claude Code
- 2026-10-26: 교사 업무 데스크(`teacher-desk/`, `pass/`) — 조퇴증·외출증(인쇄·QR 공유), 업무 수신함(쿨메신저·에듀파인 hwp/hwpx/pdf, 날짜·마감 추출·분류·요약·문서번호 연결), 9·12·15시 예약 수집, 달력·.ics, 오늘 대시보드·검색, 텔레그램 알림·명령, 화면 배치 모드 PR — Claude Code
  - 확인 필요: 쿨메신저 저장 형식(진단 결과 대기), 학교 조퇴증 실제 양식과 차이, 학교 PC 에서 Python 설치·실행 가능 여부
- 2026-10-27: 업무 데스크 윈도우용 ZIP(Python 설치 불필요, embeddable 3.12 + pypdf, 바탕화면 바로 가기), 윈도우 자동 시험(들어 있는 Python 으로 시험 38개·start-desk.bat·화면 열림·바로 가기), `.bat` CP949 한글 깨짐 수정. 사용자의 직접 지시로 Claude Code 가 PR #34 머지·배포 — Claude Code
- 2026-10-27: 쿨메신저 이름 입력 연동(`desk/coolmsg.py`, 연결 확인 화면), 업데이트 도구(`update-desk.bat`), 윈도우 시험에 업데이트 확인 추가 — Claude Code
  - 확인 필요: 실제 쿨메신저 `.udb` 구조 (SQLite 가 아니거나 암호화되어 있으면 연결 확인 결과로 다시 구현)
- 2026-10-27: LED 플랑크 상수 실험(`projects/planck-led.html`) — 가변저항 1개(10 kΩ 또는 1 kΩ 중 선택, 사용자 지정)를 분압기로 쓰는 회로, 건전지·가변저항별 안전 한계(가운데~− 다리 저항) 계산, 멀티미터 연결 안내, 문턱 전압 기준 선택(전류: 직선 연장/기준 전류, 빛: 눈 관찰 평균), V₀–f 최소제곱법(원점 통과 선택, 계산 과정 표시)으로 h 계산, CSV·표 복사. 사용자의 직접 지시(Copilot 크레딧 소진)로 Claude Code 가 PR #37 머지·배포 — Claude Code
  - 확인 필요: 실제 LED·멀티미터로 수업에서 측정해 본 결과(LED 파장 기본값이 학교 LED 와 맞는지)
- 2026-10-27: 플랑크 상수 실험을 탭 화면(원리·회로·LED·측정·결과)으로 바꾸고, 새로고침해도 기록 전 입력값·LED 이름 입력이 남도록 저장, 저장 불가(사생활 보호 모드) 경고, 같은 브라우저의 다른 창과 기록 동기화. 사용자의 직접 지시로 Claude Code 가 머지·배포 — Claude Code
- 2026-10-27: 0.3.0 — 검색 범위 확대(본문·요약·문서번호·분류·메모·학생 명단, 여러 낱말 AND), 브리핑 이름, 쿨메신저 파일 경로 직접 지정·📂 찾아보기, 학사일정 가져오기(파일·붙여넣기·나이스). 사용자의 직접 지시로 Claude Code 가 PR #36 머지·배포 — Claude Code
  - 확인 필요: 나이스 Open API 실제 응답(가짜 서버로만 시험), 실제 학교 학사일정 파일 양식, 윈도우 찾아보기 창(자동 시험 불가)
- 2026-10-27: 플랑크 상수 실험에 LED 앞 고정 저항(기본 330 Ω, 사용자 제안) 추가 — 끝까지 돌려도 안전한지 계산, 저항이 없거나 작을 때만 안전 한계 표시 안내, 직류 전원 장치는 쓰지 않기로 함(사용자 결정). 사용자의 직접 지시로 Claude Code 가 머지·배포 — Claude Code
- 2026-10-27: 교사 업무 데스크를 `aks-sci-lab/teacher-desk` 로 독립(사용자 지정, 예전 커밋 기록은 옮기지 않음). 이 저장소에서 `teacher-desk/`·업무 데스크 워크플로 제거, `pass/` 는 새 주소로 넘기는 페이지만 — Claude Code
- 2026-10-27: 플랑크 상수 실험 — 멀티미터에 악어클립이 없어 전류를 고정 저항 전압으로 계산(I = V_R ÷ R, 기본값, 전류계 직접 입력도 선택 가능), 미니 브레드보드(전원 줄 없음, 사용자 지정) 배치도와 탐침 대는 법 안내. 사용자의 직접 지시로 Claude Code 가 머지·배포 — Claude Code
- 2026-10-27: 플랑크 상수 실험을 보고서 순서 탭 7개(목적·이론·준비물·과정·데이터·결과·결론)로 재구성(사용자 지정, 고2 대상, 보고서는 손으로 작성, 2인 1조·멀티미터 2대). 이론 보강(에너지띠·p–n 접합·최소제곱법), 본 실험=전류 기준(직선 연장)·비교 실험=빛 기준, 결론 탭에 기준별 h 요약(원점 통과 포함)·분석 질문·점검 목록. 설정값 계산·기준 전류·전류계 직접은 "선생님용"으로 접음. 사용자의 직접 지시로 Claude Code 가 머지·배포 — Claude Code
- 2026-10-28: 플랑크 상수 실험 — 건전지 전압을 1~24 V 안에서 자유롭게 입력(사용자 지정, 3·4.5·6·9 V 빠른 선택), 준비물 탭에 바로 보이게 옮기고 준비물 표·회로도·안전 요약에 반영. 예전 '실제 전압' 값은 건전지 전압으로 옮김. 사용자의 직접 지시로 Claude Code 가 머지·배포 — Claude Code
- 2026-10-28: 플랑크 상수 실험 I–V 그래프 세로축 조절(사용자 요청) — 자동(측정값에 맞춤, 예전 1 mA 최소 제한 없앰)·직접 정하기(최소·최대)·로그 눈금, 선택값 저장. 사용자의 직접 지시로 Claude Code 가 머지·배포 — Claude Code
- 2026-10-28: 이상기체 상태 방정식 검증 실험(`projects/ideal-gas.html`, 사용자 요청) — 플랑크 실험처럼 보고서 순서 탭 7개(목표·이론·준비물·과정·데이터·결과·결론 및 검토). 감압 용기 속 피코 환경 센서(BME280, `START:ENV` 로 VOC 히터 끔)를 블루투스로 연결: 실험 1 보일 법칙(주사기 눈금 V + 센서 P·T, 감압/복귀, V–1/P 최소제곱·숨은 부피), 실험 2 샤를·게이뤼삭 법칙(약 70 kPa 밀폐 후 데우고 식히며 자동 기록, P–t 직선 연장으로 절대 영도·표준오차), 종합 PV/T·몰수. 가설·결과 정리·결론·검토 질문 5개를 페이지에서 쓰고 `experiments` 컬렉션에 보고서로 제출(규칙 변경 없음), 메인 기록 목록에 '보고서 보기'(`?report=문서id`), 인쇄·PDF 저장. 센서 없으면 직접 입력. 사용자의 직접 지시로 Claude Code 가 PR #46 머지·배포 — Claude Code
  - 확인 필요: 실제 감압 용기·주사기로 측정(피스톤 마찰, 펌프질 뒤 온도 회복 시간, 30 kPa 아래에서 펌웨어가 멈춤), 용기 안 보조배터리 전원·블루투스 수신, 실제 Firebase 제출·선생님 보고서 보기(시험 환경에서 Firebase 접속 차단)
- 2026-10-28: 문항 출제용 그림·그래프 도구(`projects/figure-maker.html`, 사용자 요청, 실험실 사이트에 두기로 함) — 그래프(식·점, 문자 눈금, 점선, 넓이 빗금, 모눈)·도형·화살표·글자(첨자·기울임)·빗금 바닥·용수철·각도, 회로 소자 13종(도선이 끝에 붙음), 렌즈·거울·파동. PNG 복사·저장(2~4배)·SVG, 작업 파일 저장·열기, 자동 저장, 실행 취소. AI 그리기(Claude, 글·사진 → 고칠 수 있는 그림 자료, 새로/고치기/더하기). 사용자의 직접 지시로 Claude Code 가 PR #47 머지·배포 — Claude Code
  - 확인 필요: 실제 API 키로 AI 그림 품질·시간(시험은 가짜 응답), jsdelivr `+esm` 로 SDK 불러오기(시험 환경에서 CDN 차단), 한글(HWP)에 PNG 붙여 넣기, 학교 PC 브라우저의 그림 복사 지원
- 2026-10-28: 문항 그림 도구 AI 그리기에 LM Studio(내 PC 로컬 LLM) 추가 (사용자 요청: 8845HS·24GB 에서 Gemma 4 12B). 연결 확인·모델 목록(Gemma 자동 선택), 스트리밍으로 받은 글자 수 표시, 사진은 image_url, 대화 길이·CORS·사진 미지원 오류 안내. 그림 생성 모델(Stable Diffusion 등)은 시험 그림에 맞지 않아 쓰지 않기로 함. 사용자의 직접 지시로 Claude Code 가 PR #48 머지·배포 — Claude Code
  - 확인 필요: 실제 Gemma 4 12B 의 그림 자료 품질·시간, https 사이트에서 127.0.0.1 접속(브라우저의 로컬 네트워크 허용 창), LM Studio 의 json_schema 지원 여부
- 2026-10-30: 무결성 검증(시험 123+23개, 전체 페이지 열기, 센서 원본 지문값·링크·비밀값·DB 규칙 컬렉션·배포 기록 확인) 후 정리 — Chart.js 를 4.6.1 로 버전 고정(7개 페이지), 동작하지 않던 펌웨어 업로더(`uploader.html`, avrbro 가 브라우저용이 아니고 펌웨어 주소가 빈칸, 링크 없음)와 빈 파일(`새 텍스트 문서.txt` 2개, `css/style.html`) 삭제 — Claude Code
- 2026-10-30: 저장소 정리(사용자 지정) — 날씨 데모(`app.py`·`run.bat`·`run.command`, README 날씨 설명)는 `aks-sci-lab/weather-app` 에 같은 내용이 있어 이 저장소에서 제거, 실수로 올라간 빈 파일 `projects/새 텍스트 문서.txt` 제거 — Claude Code
- 2026-10-30: 문항 출제용 그림·그래프 도구를 `aks-sci-lab/figure-maker` 로 독립(사용자 지정, GitHub Pages). 이 저장소에서는 `js/figure-*.js`·`css/figure-maker.css`·`tests/figure-*` 제거, `projects/figure-maker.html` 은 새 주소로 넘기는 페이지(자동 저장 그림 함께 넘김, API 키는 옮기지 않음) — Claude Code
- 2026-11-03: 통합 관리 세션 지정, 세션·브랜치·PR 현황표(`docs/MANAGEMENT.md`) 작성 — Claude Code
- 2026-11-03: 열린 PR 5개(#33 말루스 탭 개편, #42 걷기·뛰기 링크, #49 문서 정리·날씨 데모 제거, #50 그림 도구 독립, #51 Chart.js 고정·업로더 제거)를 한 PR 에 모아 AGENTS.md 충돌 해결, 시험(JS 109개·Python 23개)·전체 13페이지 열기 확인 후 사용자의 직접 지시로 머지·배포 — Claude Code
- 2026-11-03: 전자기 유도 전압·전류 측정(`projects/em-induction.html`, `firmware/em-induction/`, 원래 10-22 브랜치 `claude/stoic-archimedes-48nbsd`, 사용자 지시로 PR) — 아두이노 + ADS1115 차동 측정(코일 A0−A1, 10 Ω 션트 A2−A3), 웹 시리얼 연결·시뮬레이션, 영점 보정, 봉우리·렌츠 순서·∫ε dt·ΔΦ, CSV. 최신 main 으로 옮기며 펌웨어 I2C 바이트 읽기 순서 고정, 시뮬레이션 파형을 설명대로(들어갈 때 +, 나올 때 더 큰 −) 수정 — Claude Code
  - 확인 필요: 실제 ADS1115·코일·자석 측정, 아두이노 IDE 컴파일(시험 환경에 없음), 닫힌 회로에서 '코일 전압'은 기전력이 아니라 단자 전압(= 기전력 − 코일 저항×I = 션트 전압)이라 화면 이름·설명을 맞출지
- 2026-11-03: 프로젝트 이름을 '센서 기반 실험실'(GitHub `sensor-lab`, 사용자 지정)로 통일 — 메인 제목·탭 이름·README·펌웨어 안내·문서, 저장소 이름 바꾸는 방법 정리. 저장소 이름은 사용자가 GitHub 설정에서 바꿈 — Claude Code
- 2026-11-04: 모든 세션을 통합 관리 세션의 하위 세션으로 재분류(사용자 지정) — 태그 `통합관리:실험실·그림도구·업무데스크·기타` 를 24개 세션에 붙이고 `docs/MANAGEMENT.md` 를 계층 목록으로 — Claude Code
- 2026-11-10: 웹앱에서 실험 추가(사용자 요청, "선생님이 실험을 직접 만들기" 선택) **(규칙 배포 필요)** — 메인 페이지 교사용 모드의 "➕ 새 실험 만들기"로 제목·안내 글·측정값 표의 열(최대 8)·그래프 기본 축·맞춤(없음/비례/일차)·생각해 볼 질문(최대 5)·공개 여부를 정하면 학생용 페이지가 생김(`projects/custom-lab.html`). 학생: 표 입력·스프레드시트 붙여넣기·그래프·맞춤 결과·CSV·표 복사·자동 저장·제출, 선생님: 대시보드에서 '제출 내용 보기', 설정 파일(JSON) 저장·불러오기. Firestore `customExperiments` 규칙 추가. 메인 기록 목록은 학생이 넣은 글을 HTML 로 실행하지 않게 바꿈 — Claude Code
  - 확인 필요: 실제 Firebase(시험은 규칙을 흉내 낸 가짜 Firebase), **규칙 배포 전에는 만들기·목록이 동작하지 않음**(학생 화면에는 영향 없음), 한글 이름 CSV 내려받기 파일 이름(시험 브라우저에서는 'download' 로 나옴), 학교 PC 브라우저의 표 복사
- 2026-11-10: 선생님이 만든 실험에서 우리 센서 보드를 기능별로 골라 그래프로 보기(사용자 요청) — 만들기 화면에서 센서 기능 하나(환경 온도·습도·기압 / 조도 / 자외선 / 공기질 VOC Index / 가속도)와 그 안의 측정값을 고르면, 학생 화면에 센서 연결·지금 값·측정값별 시간 그래프·측정 주기·기록 시작/중지·센서 CSV·"지금 값을 표에 넣기"(같은 이름의 열)가 생기고 기록이 제출에 포함됨(1500점 넘으면 고르게 줄임). 펌웨어는 바꾸지 않음(보드가 한 번에 한 기능만 측정하므로 기능은 하나만 고름). 규칙 변경 없음 — Claude Code
  - 확인 필요: 실제 센서 보드 연결(시험은 펌웨어 명령을 흉내 낸 가짜 블루투스), 실제 VOC Index 값이 나올 때까지의 화면(시험은 준비 중 표시까지만), 가속도 1초에 100번에서 휴대폰 그래프 속도
- 2026-11-10: 펌웨어 개발 세션("펌웨어 개발: 공용 센서 펌웨어")을 통합 관리 세션의 하위 세션으로 만들고 현황 점검만 맡김(사용자 지정, 목표: 펌웨어 하나로 모든 웹앱 실험). 새로 생긴 교육과정 관리·업무 데스크·기타 세션 15개에 태그 추가 — Claude Code
- 2026-11-10: 펌웨어 방향 결정(사용자) — **Pico 환경 센서 펌웨어 하나로 진행, 아두이노(Nano 33 BLE Sense)용은 만들지 않음.** 블루투스 이름을 보드 번호와 짝짓는 방법은 펌웨어 세션이 점검 중 — Claude Code
- 2026-11-10: 펌웨어 초기 설정 최소화 방향 승인(사용자) — 설치는 파일 하나, 이름은 자동(`PicoEnv-XXXX`)이고 번호는 선생님 화면에서 블루투스로 정해 보드에 저장(`PicoEnv-07`, BOOTSEL 단추를 누른 동안만), 연결 시 LED. 번호표 파일 방식은 쓰지 않음. 펌웨어 세션이 구현해 PR 로 올림(머지 안 함) — Claude Code
- 2026-11-10: 펌웨어 세션이 PR #57 올림 — Pico 펌웨어 안정성(예상 밖 오류에도 유지, 5번 연달아 나면 재시작), 보드 번호(`board.json` → `PicoEnv-07`, 명령 `GET_BOARD`·`SET_BOARD:NN`·`CLEAR_BOARD`·`IDENTIFY`, 번호 변경은 BOOTSEL 단추를 누른 동안만), 연결 시 LED, 선생님용 `projects/board-setup.html`. 설치 파일 하나로 묶기는 계획만(README). 통합 관리 세션은 메인 페이지 교사용 모드에 "센서 보드 번호 정하기" 링크 추가(PR #56) — 이 링크는 PR #57 이 머지되어야 열림 — Claude Code
  - 확인 필요: 실제 보드에서 BOOTSEL 읽기·LED·`board.json` 쓰기·이름 바뀐 뒤 브라우저의 옛 이름 기억 (PR #57 설명에 확인 순서)
- 2026-11-10: 사용자의 직접 지시("그렇게 머지해")로 PR #57(펌웨어) → PR #56(실험 만들기·센서 그래프·이름·세션 문서) 순서로 머지, 합친 상태에서 시험(JS 135개·Python 45개)·전체 16페이지 열기 확인, 두 번 모두 배포 성공. **남은 일: Firestore 규칙 배포, 보드에 새 펌웨어 올리기, 저장소 이름 바꾸기** — Claude Code
- 2026-11-16: Nano 33 BLE Sense 페이지에 수업 참여·조 공유(`ClassShare`, exp `nano`, 공용 `submissions`) — 측정 시작→중지 한 번을 '회차'로 두고(이 브라우저에 저장, 공유·저장 때 1500점으로 줄임), 회차 목록에 내 기록과 📥 불러온 값을 나눠 보이고 회차별 그래프·CSV, 요약(평균·최대 크기, 시간 / 평균 온도·습도·기압)은 교사 진행 보기에, 하트비트 단계 `live`·`record`. `class-cloud.js` `ready: true`. 시험: `tests/nano-share-ui.test.cjs`(가짜 Apps Script 로 교사 수업 만들기 → 같은 조 학생 2명 보내기·자동 불러오기 → 진행 보기, 375px·44px). 통합 관리 세션 요청, 서버 변경 없음 — Claude Code
- 2026-11-11: **Claude Code 로만 작업하기로 함(사용자 결정).** 역할 분담에서 GitHub Copilot 을 빼고 검토·머지도 Claude Code(머지 대화·통합 관리 세션)가 사용자 승인 후 맡음. 브랜치 삭제는 사용자가 GitHub 웹에서(자동 삭제 설정 권장) — Claude Code
- 2026-11-13: **결정 변경(사용자): 아두이노 Nano 33 BLE Sense Rev2 용 페이지·펌웨어도 만든다** (11-10 의 "아두이노용은 만들지 않음"을 바꿈, Pico 펌웨어·기존 페이지는 그대로). `firmware/nano33-ble-sense-rev2/`(가속도 ±16 g(사용자 지정, 라이브러리로 켠 뒤 범위 레지스터를 직접 바꿈)·최대 100 Hz, 온습도·기압, 이름은 칩 주소로 자동 `NanoSense-XXXX`, UUID·명령·값 모양은 Pico 와 같음) + `projects/arduino-nano-lab.html`(가속도/환경 탭, 지금 값, 시간 그래프, 측정 시작·중지, CSV, 끊김·15초 안내). 통합 관리 세션이 만든 하위 세션이 PR 로 올림(머지 안 함) — Claude Code
  - 확인 필요: 실제 보드 업로드·연결(시험은 펌웨어를 흉내 낸 가짜 블루투스), 아두이노 IDE 컴파일(시험 환경에서 arduino-cli 내려받기가 막혀 g++ 문법 검사만), ±16 g 설정이 실제로 되는지(시리얼 모니터 `+/-16 g VERIFIED`, 보드 정보의 '±16 g 확인됨', 가만히 두면 |a| ≈ 1 g), 100 Hz 알림이 끊기지 않는지, 보드 열로 인한 온도 차이
- 2026-11-13: PR #59(Nano 33 BLE Sense Rev2 페이지·펌웨어) 머지·배포. 2026-11-14 에 사이트의 `projects/arduino-nano-lab.html` 이 `main` 과 같은 것을 확인 — Claude Code
- 2026-11-14: 현황 문서 정리 — `docs/MANAGEMENT.md` 에 PR #59 머지 반영, 지울 브랜치에 `claude/nano33-ble-sense-lab` 추가, 사용자 결정 목록 번호·지난 항목(PR #56 머지 여부) 정리, 진행 기록 날짜 순서 맞춤 — Claude Code
- 2026-11-14: UI 통일성 1단계(사용자 결정: 실험 이름 있는 실험은 7단계, 센서 측정은 한 화면, 색 진하게, 조도·자외선·VOC 합치기, 크게 보기 단축키) — 공통 파일 `css/lab-base.css`(색·글꼴·간격 변수, 버튼 높이 44px, 키보드 위치 표시)·`js/lab-ui.js`(Alt+B 크게 보기)를 15개 페이지에 연결, 주요 색·글꼴을 변수로 바꿈, 가속도계 페이지가 휴대폰에서 두 칸으로 찌그러지던 문제 수정, `AGENTS.md` 에 UI 규칙 — Claude Code
- 2026-11-14: 조도·자외선 페이지를 환경 센서 페이지에 합침(사용자 결정) — 맨 위 '측정할 센서' 고르기(환경/조도/자외선, 공통 `.seg` 단추 묶음), 주소 `?sensor=light|uv` 면 조도·자외선 화면만 남기고 `js/sensor-lab.js` 가 맡음(저장해 둔 회차 그대로), 예전 주소는 넘김, 메인 목록 한 줄로 — Claude Code
- 2026-11-14: UI 통일성 3단계 — 공통 7단계 탭 부품(`.steps`·`LabUI.initSteps`)을 만들고 말루스(4탭: 접해보기·측정·분석·설정 → 7단계, 설정은 과정 단계의 접기), 전자기 유도(3탭 → 7단계, 결과 단계에 마지막 기록 그래프·봉우리·∫ε dt 표시, 결론 단계에 분석 질문), 자유낙하(자유낙하/2차원 운동 고르기는 1단계 위 `.seg`, 결과 단계에 측정값 표·최소제곱 맞춤선·g·vₓ, 데이터 단계에 "기준 길이 재기"로 mm/px 구하기)를 7단계로 바꿈. 목적·이론·준비물·결론 글은 새로 씀 — Claude Code
  - 확인 필요: 실제 카메라(말루스)·아두이노(전자기 유도)·동영상(자유낙하)으로 끝까지 해 보기, 새로 쓴 이론·결론 글의 수업 수준, 전자기 유도 화면의 "코일 전압 ε" 이름(단자 전압이라는 설명만 2·7단계에 넣음)
- 2026-11-14: UI 통일성 4단계 — 선생님이 만든 실험에 '학생 화면 방식'(한 화면/7단계) 고르기와 2 이론·3 준비물·4 과정 글 칸 추가. 7단계면 학생 화면의 카드를 보고서 순서 탭으로 나눠 담음(공통 `.steps`·`LabUI.initSteps`, 빈 단계는 안내 문구). 예전 실험은 한 화면 그대로, 규칙 변경 없음(추가 칸은 기존 규칙으로 저장됨) — Claude Code
  - 확인 필요: 실제 Firebase 에서 선생님 만들기 화면으로 7단계 실험을 저장·다시 열기(시험은 이 기기에 저장된 설정으로 학생 화면만 확인)
- 2026-11-14: UI 통일성 5단계 — 센서 측정 페이지(환경·조도·자외선, 가속도계, Nano, 스마트폰 가속도)를 한 화면 배치로(공통 `.dash` 부품): 연결·상태 띠 → 큰 숫자 → 그래프 → 기록 표·회차·Cloud 제출(접기) → 준비 안내(접기). 가속도계에 X·Y·Z·|a| 지금 값 카드 추가, Nano 의 가속도/환경 고르기는 `.seg` 모양, 스마트폰 가속도에 메인으로 가기 링크. 이 페이지들은 `css/style.css` 를 더 쓰지 않음 — Claude Code
  - 확인 필요: 실제 보드·휴대폰 센서로 측정할 때 숫자 카드·그래프 갱신, 휴대폰에서 Nano 페이지는 단추 줄이 길어 그래프가 첫 화면 아래쪽에 걸침
- 2026-11-14: LED 플랑크 상수 실험에 블루투스 전류·전압 센서 연동(사용자 요청, INA219 로 먼저 해 보고 부족하면 INA226) — 기존 Pico 펌웨어에 `CurrentMonitor`(INA219, INA226 은 제조사 번호로 자동 인식, 0.1 Ω 션트)와 `START:IV`·`SET_SENSOR_RATE:200/500` 추가(파일 4개 그대로, 모듈 없으면 다른 실험 영향 없음). 회로는 고정 저항을 모듈 앞에 두어 버스 전압 = LED 전압. 플랑크 페이지 데이터 탭에 '측정 도구: 멀티미터 / 블루투스 센서', 실시간 V·I, '이 점 기록'(1초 평균, `PlanckMath.averageSensor`), CSV 에 source 열, 과정 탭에 배선 안내. 연결은 `CustomLabSensor`(mode `iv`)를 그대로 써서 선생님이 만든 실험에서도 '전류·전압' 센서를 고를 수 있음 — Claude Code
  - 확인 필요: 실제 INA219·INA226 모듈과 보드(시험은 가짜 I2C·가짜 블루투스), Waveshare 환경 센서 보드에서 GP20·GP21 에 선을 꽂을 자리, 0.1 mA 근처 값의 흔들림
- 2026-11-14: **다른 계정의 작업을 이어받음**(사용자 지시, 인계 메모 `docs/HANDOVER-2026-11-14.md`). 사용자 "모든 작업 니가 진행해"로 PR #64(인계 메모·진자 명세서) → #62(UI 통일성 1~5단계) 머지, #61(플랑크 블루투스 전류·전압 센서)은 #62 와의 `AGENTS.md` 충돌을 풀고 `qr.html` 의 조도·자외선 항목을 환경 페이지 주소(`?sensor=light|uv`, 예전 주소도 받음)로 맞춰 통합 관리 세션 PR 로 머지. 합친 상태 시험 JS 150·Python 52 통과, 전체 페이지 열기 확인. `claude/page-qr-button` 은 쓰지 않음(#63 과 겹침). 실험별 하위 세션을 다시 만듦 — Claude Code
- 2026-11-14: 스마트폰 진자 1단계 — 측정 앱(`projects/pendulum-measure.html`): 첫 화면 안전 안내, 실험 조건(조 번호·L·진폭·비고, 이름 없음), 폰 센서 가속도·회전 속도를 샘플마다 실제 시각과 함께 기록, 아이폰 권한 요청, 화면 켜짐 유지(미지원 안내), 3초 가만히 두기 보정(중력 축·부호). 주기: 이동평균(자동 = 오르내림 시간의 0.4배) → 평균 빼기 → 아래→위 0 통과 선형 보간(잡음 방지 문턱) → 간격 = T, 가속도는 한 주기에 최대 두 번이라 통과 두 번 = 한 주기, 25% 넘게 튀는 주기 빼기, 주기 수(기본 10)·처음 건너뛰기, FFT 비교·불일치 경고. 그래프 2개(툴팁, 0 통과 주황 점)·주기 표·데이터 표, 시뮬레이션(L·진폭·잡음·기록 빈도·간격 흔들림), CSV(조건·주기·원본, 2단계가 다시 읽음). 시험: L = 1 m → 2.006 s 1% 이내, 가속도 축도 같은 T, L 0.5~1.1 m + d 0.08 m → g ≈ 9.8·d 복원 — Claude Code
  - 확인 필요: 실제 아이폰(사파리 권한 창)·안드로이드(크롬) 센서 수집과 기록 빈도, 화면 켜짐 유지, 실제 진자에서 축 방향(회전 속도 α 가 흔들림 축인지, 가속도 y 가 줄 방향인지), 가속도로 계산할 때 진폭 5° 정도의 작은 변화가 실제 폰 잡음보다 큰지
- 2026-11-14: 스마트폰 진자 2·3단계(사용자 지시 "B진행해": 노트북 QR → 폰 측정 → 노트북에 자동 추가) — 노트북 분석 화면(`projects/pendulum-report.html`, 7단계 탭, 이번에는 5 데이터·6 결과 위주): 반·조로 조 코드(`반-조-4자리`) 만들기·다른 노트북에서 같은 코드로 연결, 측정 화면 QR(`pendulum-measure.html?group=…`, 크게 보기·주소 복사), Apps Script 에서 5초마다 새 측정 가져와 표(L, T, 표준편차, T², 주기 수, 자료)에 자동 추가·연결 상태 표시(기다리는 중/새 측정/연결 안 됨, 실패가 이어지면 15초), 줄 빼기, 원본 CSV 받기, CSV 끌어다 놓기·직접 넣기, 표 CSV, T²–L 그래프·최소제곱 직선·g ± 불확도·d·오차율(기준값 바꿀 수 있음)·계산 과정. 측정 화면은 `?group=` 이면 조 번호를 채우고 '💻 노트북으로 보내기'(같은 측정을 다시 보내면 같은 줄 고침, 실패하면 CSV 안내). `apps-script/Code.gs`(시트 자동 생성, 단순 요청 POST·GET, 조 코드·크기·숫자 범위 검사, 수식 막기, 받지 않은 항목은 저장 안 함, 조당 200개), `js/pendulum-config.js`(주소 비어 있음), 선생님 설정 화면·문서 — Claude Code
  - 확인 필요: 실제 Apps Script 배포와 응답(시험은 Code.gs 를 Node 에서 가짜 시트로 돌리고, POST 뒤 302 넘김까지 흉내 냄), 학교 망에서 script.google.com 접속, 여러 조가 동시에 쓸 때 속도(Apps Script 하루·동시 실행 한도), 실제 폰으로 QR 찍기, **`js/pendulum-config.js` 에 선생님 웹 앱 주소 넣기(넣기 전에는 CSV 방법만 동작)**
- 2026-11-14: 스킬 `phone-sensor-to-apps-script` 저장(사용자 요청 "스마트폰 센서를 구글스크립트로 전송하는 방법 스킬로 저장") — 진자 실험(PR #67·#68)의 센서 받기·iOS 권한·화면 켜짐, 미리보기 요청 없는 단순 요청, Apps Script doGet/doPost·검사·수식 주입 막기·잠금, 셀 한도에 맞춘 압축, QR·조 코드 노트북 화면, 선생님 설정, 가짜 Apps Script 시험 방법 — Claude Code
- 2026-11-14: 진자 자동 공유 켬 — 선생님이 구글 시트에 Apps Script 를 배포하고 연결 시험(버전 1) 성공, 통합 관리 세션이 웹 앱 주소를 `js/pendulum-config.js` 에 넣음(사용자가 글자로 준 주소) — Claude Code
  - 확인 필요: 실제 폰에서 보내기 → 노트북 표 자동 추가, 학교 망에서 script.google.com 접속
- 2026-11-14: UI 스크롤 줄이기(사용자 지시 "스크롤해서 화면 전환하는 것은 지양") — 공통 작은 탭(`.subtabs`·`LabUI.initTabs`·`LabUI.autoSubtabs`), 진자 측정 4탭(준비·측정·주기·자료, 측정 단추 띠 고정), 메인 화면 실험 카드·'실험 목록/기록' 탭, 플랑크·이상기체·말루스·전자기 유도의 이론·과정 단계를 제목별 탭으로, 7단계 탭 단추 44px, 휴대폰 숫자 카드 작게, 긴 낱말 줄바꿈(진자 설정 가로 스크롤), `qr.html` 공통 파일 연결, 걷기·뛰기 로그인 단추 44px. 사용자 의견으로 고르기 카드(`.pick-grid`·`.pick-card`·`.seg.pick`)를 기준 모양으로 정해 메인·환경·자유낙하·Nano 에 적용, 진자 측정·분석을 한 카드로, 메인 로그인 단추 한국어 — Claude Code
- 2026-11-14: **결정(사용자): 진자 저장은 Apps Script 유지**(사용자가 Apps Script 웹앱 수업을 듣는 중), 나중에 필요하면 Firestore. 그리고 "구글 로그인해서 사용자별로 설정, 설정 방법은 최대한 간소화" → 선생님마다 자기 시트 **(규칙 배포 필요)**: 설정 화면(`projects/pendulum-setup.html`, `js/pendulum-setup.js`)에 사이트 구글 로그인, 웹 앱 주소 붙여 넣기 → 연결 시험 → Firestore `pendulumTeachers/{uid}`(`scriptId`·`updatedAt`, 본인만) 저장 → "우리 반 링크" `pendulum-report.html?s=스크립트ID`·QR. 노트북은 `?s=` 를 기억하고 폰 QR 에 `&s=` 를 넣음(학생은 Firestore 를 읽지 않음), 폰은 링크의 `s` 만 따름, `s` 가 없으면 `js/pendulum-config.js` 기본 시트. 주소는 `script.google.com` 웹 앱 모양으로만 다시 만듦. 템플릿 시트 '사본 만들기'(`templateCopyUrl`, 비어 있음)로 코드 붙여 넣기를 건너뛰는 안내 — Claude Code
  - 확인 필요: 실제 Firebase 로그인·저장(시험은 가짜 Firebase, 규칙은 Firestore 에뮬레이터로 12가지 확인), **규칙 게시**(사용자 Firestore 는 11-11 에 새로 만들어 기존 `customExperiments` 규칙과 함께 게시 필요), 템플릿 시트 사본에 스크립트가 함께 복사되는지와 사본 쪽 첫 배포·권한 승인, 학교 Workspace 계정 웹 앱(`/a/macros/학교도메인/s/…`) 주소를 일반 `/macros/s/…` 로 바꿔 불러도 되는지
- 2026-11-14: LED 플랑크 상수 실험 Apps Script 웹앱(`apps-script/planck-led/`, 선생님 과제 제출용, 총괄 세션 요청) — 학생: 조·이름, 전류 기준(고정 저항 전압/전류계)·빛 기준 측정값 입력 → I–V 그래프·V₀·V₀–f 직선·h·오차 → `google.script.run` 으로 시트에 LED 하나당 한 줄 제출(제출 시각·제출 번호·측정값 JSON). 선생님: `?page=teacher` + 교사 암호(스크립트 속성)로 조별 요약·조 h(직선)·학생 h 평균·그래프·CSV, V₀ 는 측정값으로 다시 계산. 계산은 `js/planck-math.js` 를 그대로 옮김(자동 생성·같은지 시험). 사이트 파일은 바꾸지 않음 — Claude Code
  - 내려받기 묶음 `apps-script/planck-led-appsscript.zip`(편집기 파일 이름 그대로 + 과제용 `보고서.md`, 같은 도구로 생성·시험이 최신 확인), 교사 암호 잠금 완화(10번 틀리면 5분, 맞으면 횟수 초기화, 스프레드시트 주인 계정은 잠겨도 들어감)
  - 확인 필요: 실제 Apps Script 배포·승인 화면·`google.script.run` 오류 문구 모양, Apps Script 화면 틀(iframe)에서 CSV 내려받기, 주인 확인(`Session.getActiveUser`)이 '모든 사용자' 배포에서 주인에게 메일을 돌려주는지, clasp 안내
- 2026-11-14: LED 플랑크 상수 조 공유(사용자 요청 "주기 측정처럼 학생이 노트북에 입력한 값을 교사에게 전송하거나 다른 노트북에 보내기") — 데이터 단계 맨 위 '👥 조 공유': 반·조 → 조 코드, '📤 선생님께 보내기'(이 노트북이 잰 LED 하나 = 선생님 시트 `planck` 탭 한 줄, 다시 보내면 고쳐 씀), 같은 조 코드를 넣은 다른 노트북이 몇 초마다(또는 '📥 불러오기') 받아 표에 합침(📥 표시, 내 기록과 따로 보관), 안 되면 CSV 다운로드 → '📂 CSV 불러오기'. 서버는 진자와 같은 `apps-script/Code.gs`(3판, `exp: 'planck'`), 주소 규칙도 진자와 같음(`?s=` > 기억 > `pendulum-config.js`). `js/planck-cloud.js`, 시험 `tests/planck-cloud.test.cjs` — Claude Code
  - 확인 필요: **선생님이 Apps Script 에 새 Code.gs 를 붙여 넣고 새 버전으로 다시 배포해야 동작**, 실제 Apps Script·학교 망(시험은 가짜 시트), 여러 조가 동시에 5초마다 불러올 때 Apps Script 한도
- 2026-11-16: 수업 연결 1단계(선생님 결정 "교사·학생 모두 구글 로그인 없이", 통합 관리 세션 전달) — 메인 화면 맨 위 '교사로 시작 / 학생으로 시작'(고르기 카드, 학생은 수업 코드 → 실험 페이지), 구글 로그인은 '🔐 사이트 관리 (선생님)' 접기로 옮김. 교사 화면 `projects/class-teacher.html`(시트 연결·수업 만들기·진행 보기). 플랑크 페이지 `?c=` 면 '🏫 수업 참여' 띠: 조·번호 고르기(이름 없음, 이 브라우저 기억) → 조 공유 조 코드 자동·자동 불러오기, 단계 바꿀 때·보낼 때·1분마다 신호. `apps-script/Code.gs` 4판(진자·플랑크 동작 그대로), `tests/fake-apps-script.cjs` 에 `Utilities`(해시·UUID)와 두 부분 날짜(`2-4821`) 변환 추가. 2단계(AI 보고서 도움)·3단계(초안)는 만들지 않음 — Claude Code
  - 확인 필요: **선생님이 Apps Script 에 새 Code.gs(4판)를 붙여 넣고 새 버전으로 다시 배포해야 동작**, 실제 Apps Script 의 `Utilities.computeDigest`·`getUuid`(시험은 가짜), 한 반 30명이 1분마다 신호 + 교사 10초마다 볼 때 Apps Script 동시 실행·하루 한도, 학교 망, 실제 QR 찍기
- 2026-11-14: Firestore 규칙 자동 게시(사용자 요청 "클로드 코드에서 파이어베이스까지 관리") — `firestore.rules` 가 바뀐 채 `main` 에 머지되면 GitHub Actions 가 사이트 배포 키로 `firebase deploy --only firestore:rules`. 손 실행(Run workflow)도 됨. 로그인 설정(OAuth 클라이언트 보안 비밀번호)처럼 콘솔에서만 되는 일은 여전히 사용자가 함 — Claude Code
  - 확인 필요: 배포 키(서비스 계정)에 규칙 권한이 있는지(없으면 `Firebase Rules 관리자` 역할 추가, `docs/DEPLOY.md`), 첫 실행 결과
- 2026-11-16: Apps Script 스스로 업데이트(5판, 선생님 승인 "진행해", 통합 관리 세션 전달) — 교사 화면 맨 위 띠가 시트의 판(ping)과 사이트 공식 판(`apps-script/release.json`)을 비교해 "🆕 새 서버 버전이 있어요 (5판 → 6판) 🔄 업데이트" / 4판 이하면 "🛠 손으로 한 번" 안내(📋 Code.gs·appsscript.json 복사) / 최신이면 ↩ 되돌리기만. 서버는 고정 주소 `https://aks-sci-lab.web.app/apps-script/` 에서만 release.json·Code.gs·appsscript.json 을 받아 SHA-256·판 번호·크기·권한(scope) 증가 여부를 확인하고 Apps Script API(`ScriptApp.getOAuthToken`)로 content → versions → 같은 배포(deployments) 순서로 바꿈, 이전 배포 버전은 스크립트 속성에 기억해 되돌리기. 관리 열쇠(`claimAdmin`, 처음 연결한 교사 화면이 만들어 그 브라우저에 저장, 해시만 `ADMIN_KEY_HASH`). `apps-script/appsscript.json`(V8·서울·웹 앱 USER_DEPLOYING/ANYONE_ANONYMOUS·권한 4개), `firebase.json` 에 `apps-script/**` no-cache, 진자 설정 화면·안내 문서에 매니페스트·API 켜기 단계. `tests/fake-apps-script.cjs` 에 가짜 `UrlFetchApp`·`ScriptApp`·`PropertiesService` — Claude Code
  - 확인 필요: **선생님 1회: Apps Script API 켜기 + 5판 Code.gs·appsscript.json 손으로 붙여 넣기·새 버전 배포·권한 허용**, 실제 Google Apps Script API 응답(시험은 가짜), `ScriptApp.getService().getUrl()` 이 실제로 지금 웹 앱 배포 ID 를 돌려주는지(웹 앱 배포가 여러 개면 찾지 못하고 손으로 안내), 개인 구글 계정에서 script.projects·script.deployments 권한 허용 화면, 배포 직후 사이트 캐시
- 2026-11-16: 모든 실험 조 코드 방식의 공통 기반(선생님 지시 "나머지 실험들도 조 코드 방식으로", 통합 관리 세션 전달) — `apps-script/Code.gs` 6판: 공용 저장 `submissions` 시트(`exp` 허용 목록 idealgas·accel·env·light·uv·phoneaccel·malus·eminduction·freefall·nano·`custom:<id>`, 같은 실험·조·id 면 고쳐 씀, 자료 45,000자×6칸, 요약 숫자 20개, 글자 앞 `'`, 조당 200줄), 수업은 모든 실험으로 만들 수 있고 진행 보기에 실험별 제출 요약(플랑크 LED·h, 진자 L·T, 공용 summary). 공통 부품 `js/class-share.js`·`css/class-share.css`(수업 참여 띠·조 공유 칸·하트비트)로 플랑크를 옮김(전용 시트용 send·pull 을 끼움, 예전 수업 참여 기억 `planck-class:v1` 도 읽음), 진자 노트북(`pendulum-report.html`)·폰(`pendulum-measure.html`)에 `?c=` 띠. 교사 화면 실험 고르기 전체 목록(+선생님이 만든 실험 번호, 아직 안 붙인 페이지는 '준비 중' 안내). 사용법 `docs/class-share.md`. 각 실험 페이지 전환은 실험별 세션이 이 부품으로 — Claude Code
  - 확인 필요: **선생님 교사 화면에서 🔄 업데이트(5판 → 6판)** 또는 5판 전이면 손으로, 실제 Apps Script, 각 실험 페이지는 아직 부품을 붙이지 않음(`ready: false`)
- 2026-11-16: 교사 화면 '🛠 내 서버 만들기'(선생님 결정: 설정할 때만 구글 로그인, 수업 중에는 지금처럼 로그인 없이) — `js/server-maker.js`: Google Identity Services 토큰 방식(`accounts.google.com/gsi/client`, CDN 규칙의 예외로 적음, Firebase 로그인은 쓰지 않음)으로 토큰 → Sheets API 로 시트 → Apps Script API 로 시트에 붙은 프로젝트·공식 코드(해시 확인)·버전·웹 앱 배포 → 새 탭 권한 허용 → ping 될 때까지 기다림 → 관리 열쇠 → 연결. 오류는 쉬운 말(Apps Script API 꺼짐·클라우드 API 꺼짐·팝업 막힘·권한 거절·로그인 만료), 단계 기억으로 이어서 하기(이미 만든 시트 다시 씀). `js/pendulum-config.js` 에 `googleClientId: ''`(비면 손으로 만들기 안내). 안내 `docs/class-teacher-guide.md` 에 사이트 관리자 구글 클라우드 등록 — Claude Code
  - 확인 필요: **사이트 관리자 1회 구글 클라우드 등록(Sheets API·Apps Script API 켜기, OAuth 동의 화면 권한 3개, 승인된 자바스크립트 원본 https://aks-sci-lab.web.app, 클라이언트 ID 를 `googleClientId` 에)**, 실제 Google(시험은 가짜 로그인·가짜 API), 동의 화면이 '테스트' 상태면 테스트 사용자로 넣은 계정만 됨, 새 웹 앱 첫 실행 권한 허용 화면
- 2026-11-16: 공통 부품 고침 3가지(실험별 세션 의견, 통합 관리 세션 전달) — ① 조 코드를 넣은 직후 첫 불러오기 중에 📤 를 누르면 조용히 무시되던 것: 불러오기가 끝날 때까지 기다렸다 이어서 보내고 '불러오는 중이라 끝나면 바로 보낼게요' 안내, 보내는 중 다시 누르면 안내, 보내는 동안 자동 불러오기 미룸·결과 글을 덮지 않음(`js/class-share.js`) ② `apps-script/Code.gs` 7판: 요약(summary) 이름에 °·%·한글 등 아무 글자(1~30자, `|`·제어 문자만 막음) ③ 교사 화면에서 선생님이 만든 실험 번호를 넣으면 Firestore(로그인 없이)로 공개 여부 확인 → 비공개면 '사이트 관리에서 공개로' 안내·만들 때 한 번 더 확인(`ClassCloud.checkCustom`) — Claude Code
  - 확인 필요: **선생님 교사 화면 🔄 업데이트(6판 → 7판)**, 실제 Firestore REST 응답(비공개 문서는 403, 없는 번호도 403 으로 같게 보임)

- 2026-11-16: 전자기 유도 실험에 조 코드 공유(선생님 지시 "나머지 실험들도 조 코드 방식으로", 통합 관리 세션 전달) — `projects/em-induction.html` 에 `ClassShare`(exp `eminduction`): `?c=` 수업 참여 띠, 5. 데이터 맨 위 👥 조 공유, 6. 결과에 📤 보내기. 저장한 측정 하나 = 시트 한 줄(요약 최대 +ε·최대 −ε·∫ε dt·ΔΦ·최대 |I|·N, 자료는 600점으로 줄인 파형 — 봉우리는 남김, `js/em-induction-share.js`). 받은 측정은 비교 표에 📥 파란 줄로 따로(내 측정과 섞지 않음), 📈 로 아무 측정의 그래프·분석 보기, 이 페이지 CSV 불러오기. 예전 저장 측정에는 id 를 붙여 그대로 씀. 이 페이지는 Firebase 제출이 없었음. 서버 변경 없음 — Claude Code
  - 확인 필요: 실제 아두이노 측정값으로 주고받기(시험은 시뮬레이션), 진짜 Apps Script(시험은 가짜 서버)
- 2026-11-16: 선생님이 만든 실험을 조 코드 방식으로(통합 관리 세션 지시, 선생님 요청 "나머지 실험들도 조 코드 방식으로") — 학생 화면(`?id=`)에 `ClassShare`(exp `custom:<id>`): `?c=` 수업 참여 띠, 조 공유(보내기·자동 불러오기·CSV 불러오기·불러온 값 지우기), 하트비트(한 화면 `live`/7단계 단계, 점 수 = 표 행 + 센서 점). 보내는 것: 표·센서 기록(1500점까지 솎음)·질문 답 세 줄(이름·학번 없음). 받은 값은 '📥 불러온 값'에 기기별로 따로, 그래프·맞춤에 함께. 학생 구글 로그인 제출은 없앰(예전 `?record=` 보기와 선생님 만들기 `?edit=` 로그인은 그대로). `class-cloud.js` custom `ready: true`. 규칙·서버 변경 없음 — Claude Code
  - 확인 필요: 실제 선생님 Apps Script·학교 인터넷(시험은 가짜 Apps Script), 공개하지 않은 실험은 학생이 설정을 못 읽어 수업에 쓸 수 없음(공개 필요), 실제 Firebase 에서 공개 실험 설정 읽기(시험은 이 기기 저장값)
- 2026-11-16: 말루스 법칙 실험을 조 코드 방식으로(선생님 지시 "나머지 실험들도 조 코드 방식으로", 통합 관리 세션이 나눠 맡김) — `ClassShare` 연결(`?c=` 수업 참여 띠, 5. 데이터 맨 위 조 공유, 하트비트: 단계·내 점 수), 회차 하나 = 시트 한 줄(`js/malus-share.js`, 요약 점·cos² R²·θ₀·결측·A), 받은 값은 '📥 노트북 AB12 · 1회차'로 내 기록과 따로 두고 6. 결과 표·그래프·정규화·CSV(source 열)에 합침. 7. 결론은 '📤 선생님께 보내기'가 기본, 구글 로그인 '내 구글 시트로 내보내기'·표 복사·웹 앱 URL 은 '다른 내보내기(선택)' 접기로. `EXPS.malus.ready = true`. 서버는 고치지 않음 — Claude Code
  - 확인 필요: 실제 선생님 시트(시험은 가짜 Apps Script), 실제 카메라로 잰 두 노트북의 채널·감마가 다를 때 결과 해석
- 2026-11-16: 이상기체 실험을 조 코드 방식으로(선생님 지시 "나머지 실험들도 조 코드 방식으로") — `ClassShare` 를 붙여 `?c=` 수업 참여 띠·5단계 맨 위 👥 조 공유(실험 1·2 를 한 줄씩 보내기, 같은 조 노트북 값은 '📥 노트북 XXXX'로 표·그래프(속 빈 점)·결과에 합침, 이 페이지 CSV 불러오기)·하트비트. 학생 화면의 구글 로그인 보고서 제출을 없애고 '📤 측정값 선생님께 보내기 + 🖨️ 인쇄(PDF)'로, 예전 보고서 보기(`?report=`)는 그 주소일 때만 Firebase 를 불러와 그대로. `class-cloud.js` 의 `idealgas` ready. 서버 변경 없음 — Claude Code
  - 확인 필요: 실제 선생님 시트(시험은 가짜 Apps Script), 쓴 글(결론·검토)은 서버로 보내지 않음(인쇄로 냄), 여러 노트북이 서로 다른 주사기로 잰 실험 1 을 합치면 PV 가 달라 변동이 커짐(같은 장치 값만 합치도록 안내 필요할 수 있음)
- 2026-11-16: 환경 센서·조도·자외선 페이지를 조 코드 방식으로(선생님 지시 "나머지 실험들도 조 코드 방식으로", 통합 관리 세션 전달) — `environment-lab.html`(exp `env`)·`?sensor=light|uv`(exp `light`·`uv`)에 `ClassShare`(`?c=` 수업 참여 띠, '🗂 회차 저장·👥 조 공유' 접기 안 조 공유 칸, 하트비트 단계 live·record·more·점 수). 저장한 회차 + 현재 측정을 한 줄씩 보내고(열 이름 + 숫자 배열, 2000점까지 고르게, 요약 시간·평균), 같은 조 다른 노트북 회차는 '📥 노트북 AB12 · 이름'으로 목록·그래프에 겹침, CSV 저장 파일 불러오기. 구글 로그인 'Cloud 제출'과 Firebase 는 학생 화면(환경·조도·자외선·예전 VOC 보관 페이지)에서 없앰. 센서 고르기 단추에 `c`·`s` 를 이어 붙임. 공용 `js/environment-share.js`, 시험 `tests/environment-share.test.cjs`(가짜 시트 + Playwright 375px) — Claude Code
  - 확인 필요: 실제 센서 보드로 측정하면서 보내기(시험은 저장해 둔 회차로), 실제 선생님 시트·학교 인터넷, 교사 화면 ③ 진행 보기 화면 자체(시험은 서버 classStatus 응답을 `ClassCloud.summarize` 로 확인)
- 2026-11-16: 가속도계·스마트폰 가속도·자유낙하에 조 코드 공유(사용자 지시 "나머지 실험들도 조 코드 방식으로", `ClassShare`, exp `accel`·`phoneaccel`·`freefall`) — 구글 로그인 'Cloud DB 제출' 단추를 없애고 👥 조 공유로(회차·기록·자유낙하 결과를 선생님 시트로 보내고 같은 조 기기에서 📥 불러와 내 기록과 따로 표·그래프에 겹쳐 봄, 자유낙하는 6. 결과에 '조 결과 모아 보기'·g 평균), `?c=` 수업 참여 띠·하트비트, 도우미 `js/accelerometer-share.js`·`js/phone-accel-share.js`, 스마트폰 마지막 기록은 기기에 남김. 서버 Code.gs 변경 없음 — Claude Code
  - 확인 필요: 실제 Pico 보드·휴대폰 센서·자유낙하 동영상으로 보내기까지, 진짜 Apps Script(시험은 가짜 서버), 학교 인터넷에서 200 Hz 긴 회차(27만 자 넘으면 고르게 솎아 보냄)
- 2026-11-16: `apps-script/Code.gs` 8판 — 실제 첫 🔄 업데이트에서 "사이트의 release.json 을 읽지 못했습니다" 만 나와 진짜 원인(권한 등)이 가려지던 것: 업데이트·되돌리기·사이트 파일 받기 오류에 원래 문구를 그대로 붙이고, 권한 문제로 보이면(permission·권한·Authorization·script.external_request) '배포 관리 → 새 버전 → 권한 허용' 안내를 덧붙임. JSON 이 아닌 글을 받으면 앞부분도 보여 줌. 교사 화면은 그 문구를 그대로 보이고 손으로 하는 법을 펼침 — Claude Code
  - 확인 필요: 선생님 시트에서 7판(손으로) → 8판 🔄 업데이트가 실제로 되는지, 실패하면 화면의 원래 문구
- 2026-11-16: 공통 부품에 '📱 폰 연결'(선생님 지시 "스마트폰 센서로 하는 실험은 전부 진자처럼 폰과 노트북 연결", 통합 관리 세션 전달) — `ClassShare.init({ phone: true|{page}, onRole, onPhoneData })` + `share.saved()`: 노트북 조 공유 칸·수업 띠에 '📱 폰으로 측정하기' QR(`?role=phone&group=…&s=…`, 수업이면 `&c&jo&num`), 폰은 조·자리 자동·'📱 노트북과 연결됨' 띠·조 공유 접기·저장 때 자동 보내기(실패하면 다시 보내기)·따로 저장(`:phone`)·기기 번호 `p…`(다른 화면에 '📱 폰'), 노트북은 자동 불러오기·'🆕 폰에서 새 측정 N개', 교사 진행 보기에 '📱 측정 중'(하트비트 단계 `phone-…`). 조 코드 칸에서 단추를 누를 때 같은 코드가 다시 정해지며 안내 글이 지워져 화면이 움직여 단추를 놓치던 것도 고침. 서버 변경 없음. 각 실험 페이지(폰 가속도·말루스·자유낙하)는 실험 세션이 `docs/class-share.md` '📱 폰 연결' 대로 — Claude Code
  - 이어서(선생님 요구 "다회 측정은 폰에서 여러 회 잰 뒤 보낼 데이터를 고르게"): 폰은 기본으로 저장 때마다 띠 안의 **회차 목록**(시각·점 수·요약, 이 폰에 저장)에 쌓고 체크 → '📤 고른 회차 보내기'(전체 선택·해제, ✅ 보냄·✏️ 바뀜, 못 보낸 것만 체크가 남아 다시, 같은 id 로 고쳐 씀, 메모는 제목 뒤에, 🗑 지우면 시트에서도 뺌). '한 번에 하나' 실험은 `autoSendOnSave: true`. 진자 측정은 전용 시트라 다음 단계
  - 확인 필요: 실제 폰으로 QR 찍기·학교 와이파이, 아이폰 사파리에서 같은 주소로 센서 권한·카메라
- 2026-11-16: 말루스 법칙 📱 폰 연결(선생님 지시 "스마트폰 센서 실험은 진자처럼 폰과 노트북 연결" + "폰에서 여러 회 잰 뒤 보낼 회차 고르기", 공통 부품 PR #94 위) — 노트북 조 공유 칸 '📱 폰으로 측정하기' QR → 폰(같은 페이지 `?role=phone`)은 카메라·측정(5. 데이터)만 보이고 기록은 `malus-law-v1:phone` 에 따로, 측정·새 회차·결측·삭제 때 `share.saved()` → 폰 회차 목록에서 골라 보내기, 🗑 는 그 회차 점을 지움. 노트북은 자동 불러오기로 '🆕 폰에서 새 회차 N개' 알림, 6. 결과 표에 '📱 폰 AB12 · 2회차'. 점마다 측정 시각(`t`)을 남겨 회차 목록에 시각 표시. 서버는 고치지 않음 — Claude Code
  - 확인 필요: 실제 폰 카메라(시험은 크롬 가짜 카메라)로 레이저 밝기, 폰 화면에서 측정 계획(4. 과정)을 볼 수 없어 기본 계획(0~180°, 15°)으로 잼
- 2026-11-16: 스마트폰 가속도·자유낙하에 📱 폰 연결(선생님 지시 "스마트폰 센서 실험은 진자처럼 폰과 노트북 연결" + "다회 측정은 폰에서 여러 회 잰 뒤 보낼 데이터 고르기", 공통 부품 PR #94 위) — 스마트폰 가속도: '▶ 시작 → ■ 중지' 한 번 = 회차(구간 자르기는 그 회차를 고침, 기기에 남음, 예전 마지막 기록은 '1회'로 옮김), 노트북은 📱 폰 기록을 🆕 로 받아 그래프에 겹치고 📈 보기로 크게 띄워 구간 고르기. 자유낙하: 영상 하나 × 종류 = 회차(찍은 점·기준 길이·FPS 만 보냄, 영상은 셀 한도로 못 보냄), 폰은 바로 5. 데이터, 노트북은 '조 결과 모아 보기'의 📈 보기로 받은 회차의 그래프·g. 폰에서 손가락으로 누르면 점이 두 번 들어가 프레임을 건너뛰던 문제 수정. 요약 숫자 순서를 중요한 것 먼저(폰 목록 3개·교사 4개). Code.gs 변경 없음 — Claude Code
  - 확인 필요: 실제 아이폰·안드로이드에서 QR 찍기·센서 허용·영상 찍기, 폰에서 영상 프레임 추출(최대 150장×800px, 메모리)·손가락 점 찍기 정밀도, 학교 와이파이
- 2026-11-17: 서버 9판(통합 관리 세션 요청) — 새 실험 '스마트폰 카메라 심박수'(exp `heartrate`)를 `apps-script/Code.gs` 공용 저장 허용 목록(`GENERIC_EXPS`, 수업 `CLASS_EXPS` 도 함께)에 추가, `release.json` 다시 만듦. 매니페스트(권한) 그대로라 교사 화면 🔄 업데이트로 새 권한 창 없이 됨 — Claude Code
- 2026-11-17: 시판 블루투스 센서 해석 도구(`projects/ble-explorer.html`, 선생님 요청 "센서 신호 역변환을 위한 개발 사이트", 통합 관리 세션 전달) — 산 무선 센서의 바이트를 기록하고 해석 규칙(디코더)을 찾아 JSON 으로 저장하는 개발용 페이지. 참값 맞추기 도우미가 모든 자리·형식(int8~float32, LE·BE)에 대해 참값과 직선 맞춤(r²·배율·더할 값, 깔끔한 배율 표시)으로 후보를 순위. 메인 실험 목록에는 넣지 않음. 서버·규칙 변경 없음 — Claude Code
  - 확인 필요: 실제 시판 센서(시험은 가짜 센서), 값이 암호화되었거나 연결에 앱 인증이 필요한 센서는 해석 못 할 수 있음, Web Bluetooth 가 막아 둔 서비스(blocklist), 실험 페이지에서 규칙 파일로 센서 읽기는 다음 단계
- 2026-11-17: 스마트폰 카메라 심박수 한 화면 측정 페이지(`projects/heart-rate.html`, 선생님 요청 "카메라 휘도로 심박수", "그냥 심박수만 측정하는 페이지 먼저", "노출 고정 확인 → 되면 그대로, 안 되면 노출값 기준 정규화") — 노출 잠금 확인(1.5초), 고정 안 되면 선형 밝기 ÷ 노출(노출 값이 사진과 몇 ms 어긋나도 30% 출렁임이면 맥파만큼 남아, ±0.5초 안에서 2 ms 간격으로 어긋남과 크기 β 를 맞춤), 0.6~3.5 Hz(40회 안 잘림), FFT·자기상관·봉우리·신뢰도, 품질 🟢🟡🔴, 플래시(60초·열 경고), 손목 15초×4, 원본 CSV(t_s,R,G,Y,Y_corr,exposureTime,iso,locked)·phyphox CSV 읽기, 시뮬레이션, 메인 카드. 운동 전후 회복·7단계·조 공유·📱 폰 연결은 다음 PR(`claude/heart-rate-full` 보관) — Claude Code
  - 확인 필요: 실제 폰에서 노출 잠금이 되는지(기종별), 고정 안 되는 폰에서 노출 값이 프레임마다 읽히는지·보정이 맞는지, 아이폰 사파리, 실제 심박 정확도(선생님이 자료를 모아 개선)
- 2026-11-17: 개발 데이터 자동 수집(선생님 요청 "개발 단계에서는 심박수 측정 데이터를 깃허브로 바로 수집, 개발 끝이면 멈춤", 공개 저장소·선생님 기기만·모든 측정 자동, 통합 관리 세션 전달) — 서버 10판 `devlog` 시트·`devSave`·`devExport`(관리 열쇠 필요, exp heartrate·facehr), `js/dev-collect.js`(`devCollect: true` + 관리 열쇠가 있는 기기만 🧪 띠·자동 전송·실패 때 쌓아 두기·이 기기 끄기, 교사 화면 관리 열쇠 칸의 QR `heart-rate.html?s=…#devkey=…` 로 폰에 열쇠 넣기), 심박수 페이지는 카메라로 잰 회차마다(손목 맥박 넣으면 다시), GitHub Actions `dev-data-collect.yml` 매시간 → `dev-data` 브랜치(`tools/dev-data-pull.cjs`). 멈추는 법 `docs/dev-data.md` — Claude Code
  - 확인 필요: **선생님: 교사 화면 🔄 10판, 폰에 QR 로 열쇠, GitHub Secrets `DEV_SHEET_URL`·`DEV_ADMIN_KEY`**, 실제 Apps Script·Actions 실행(시험은 가짜 서버·가짜 fetch), 공개 저장소에 건강 데이터(이름 없음)가 올라감
- 2026-11-17: 스마트폰 카메라 심박수(`projects/heart-rate.html`, 선생님 요청 "카메라 휘도로 심박수", "셔터 속도를 고정하고 계산", 통합 관리 세션 전달) — 7단계, 노출 고정(손가락 덮고 3초 뒤 manual 잠금, 프레임마다 노출 값 기록, 노출이 심박 빠르기로 출렁이면 경고: 선생님 phyphox 자료에서 셔터가 분당 40회로 출렁임), 0.6~3.5 Hz 대역(40회 안 잘림), FFT·자기상관·봉우리 세 방법과 신뢰도, 품질 🟢🟡🔴, 플래시(60초·열 경고), 손목 맥박 비교, 원본 CSV·phyphox CSV 읽기, 시뮬레이션, 조 공유·📱 폰 연결(회차 골라 보내기, 원본도 시트로), 회복 그래프. `class-cloud.js` EXPS 에 `heartrate`(`needServer: 9`, 교사 화면에 '서버 9판 필요'), 메인 카드 추가. 서버 Code.gs 는 고치지 않음 — Claude Code
  - 확인 필요: **서버 `GENERIC_EXPS` 에 `heartrate` 추가(9판) 전에는 보내기·수업 만들기가 막힘**, 실제 폰에서 노출 고정이 되는지(기종별, 시험은 가짜 카메라), 아이폰 사파리, 실제 심박 정확도(선생님이 자료를 모아 개선 예정), 플래시 켠 채 측정, 학교 와이파이
- 2026-11-17: 얼굴 심박(rPPG) 선생님 전용 개발 페이지(`projects/face-hr-lab.html`, 통합 관리 세션 전달, 선생님 요청 "전면·후면 카메라를 동시에 써서 얼굴 휘도 변화로 심박수 추정") — 손가락 측정(PR #99 `js/heart-rate-math.js`)과 분리, 계산은 `js/face-hr-math.js`(GREEN·CHROM·POS, 영역별·합침, 정답 비교 MAE·RMSE·±5·r·움직임 구간, 곡선 맞추기 지연, 노출 정규화, 0x2A37 해석, CSV·JSON). 서버 변경 없음(두 번째 폰은 9판의 heartrate 필요) — Claude Code
  - 확인 필요: 실제 기종(갤럭시 Z 플립6)에서 앞·뒤 동시 카메라, 실제 얼굴 정확도, MediaPipe 가 폰에서 몇 fps, 시트 timestamp 의 밀리초 정밀도(시계 맞추기), 학생 얼굴은 수업 전 학교 개인정보 지침 확인
- 2026-11-17: 심박수 어두울 때 절반으로 잡히던 문제(선생님 실측: 갤럭시 Z 플립6, 어두우면 실제의 절반) — ① 어두운 색 채널 빼기: 평균 12 아래·밝기 단계 4가지 미만·평평한 채널은 고르지 않음(가짜 카메라 시험에서 초록이 늘 7 인데 계산 잡음이 뾰족한 봉우리로 잡혀 37회 ← 실제 72) ② 두 배 후보 검사(`doubleCheck`): 2X 가 바닥 잡음보다 뚜렷하고 그 간격으로 박동이 고르고, X 와 박자가 묶여 있지 않거나 X 쪽이 배음 없는 사인파면 2X 로(중복맥파 진짜 X 는 묶임 ≥ 0.9 라 그대로, 노출이 X 로 출렁이면 바꾸지 않음) ③ 밝기 판정(`lightCheck`): 손가락 빨강·맥파 크기 AC/DC·노출(33 ms 이상 + ISO 1600 이상)·손가락 대기 전 방 밝기 → 🌙 어두움/아주 어두움, 측정 전 안내, 신뢰도 낮춤, CSV `light` 열과 # 밝기 판정·AC/DC·장면 줄 — Claude Code
  - 확인 필요: 선생님 폰의 실제 어두운 회차 CSV 로 원인 확인(채널 문제인지 절반 흔들림인지), 밝기 판정 기준값(시뮬레이션으로 정한 첫 값)
- 2026-11-17: 심박수 선생님 실측 두 가지 더(같은 PR) — ① '노출 잠금하는 순간 어두워짐': 잠그기 전 밝기를 기억하고 잠근 뒤 0.3초마다 셔터(최대 1/30초)·ISO 로 ±10% 맞춤(닫힌 고리, single-shot 있으면 먼저), 못 맞추면 자동 노출 + 보정, '노출 잠금 끄기' 선택, 잠금 과정(전·직후·맞춘 뒤 밝기·셔터·ISO)을 회차·CSV 머리말에 ② '그래프는 80회로 깨끗한데 노출 보정 결과 39회·🔴 덮어 주세요': `analyzeRun` 이 보정 전·후를 둘 다 계산해 믿을 만한 쪽(폰의 노출 값이 엉터리면 보정이 40회 가짜를 만듦 — main 은 이 흉내 신호에서 40회·98%), 두 배 후보 검사에 넓은 대역 봉우리 간격 검사, 덮임 판정 완화(빨강 > 12·빨강 ≥ 1.25×초록, 1.1~1.25 는 🟡, 맥파가 뚜렷하면 🔴 대신 🟡)·근거 숫자 기록 — Claude Code
  - 확인 필요: 실제 갤럭시 Z 플립6 에서 밝기 맞추기가 되는지(getSettings 가 manual 뒤에는 실제 값을 주는지), single-shot 지원 여부
- 2026-11-17: 심박수 선생님 실측 원본 4회차(`tests/fixtures/heart-rate/`, 갤럭시 Z 플립6, ISO 27 로 잠겨 빨강 평균 2~10)로 회귀 시험 — main 은 r5·r6 을 37 로 절반(보정 신호를 -ln 할 때 바닥 0.5 에 걸려 평평해짐), 이제 r3 75.5·r5 77(손가락 떨어진 15.5초 뒤 자름)·r6 78.9·r7 78.7. 고친 것: 어두운 채널은 절대 문턱 대신 '가장 밝은 채널의 0.2 배'·0.01 단위 단계 수로, 노출 값이 1% 안 바뀌면 보정 안 함('steady'), 덮임 판정은 빨강/초록 비율로(빨강 > 1), 아주 어두워도 맥파가 뚜렷하면 🟡, 잠금 때 ISO 하한 100·빨강 60~180 을 목표로 밝기 맞추기, 실시간 그래프에 계산이 찾은 봉우리 점과 '최근 10초' 추정(큰 숫자와 같은 계산), 개발 수집 기록에 보정 전·후 각 FFT·자기상관·봉우리·노출 출렁임 빠르기·두 배 검사·잠금 과정·장면 — Claude Code
- 2026-11-17: 얼굴 심박 개발 페이지에 개발 데이터 자동 수집(`DevCollect.send('facehr', …)`, 통합 관리 세션 전달) — 카메라로 잰 측정이 끝날 때(시뮬레이션·불러온 파일 제외) CSV(프레임별 영역 RGB·움직임·노출 + 정답)·방법별 결과·정답 경로·기기 정보, 정답이 나중에 붙거나 손목 수를 고치면 같은 id 로 고쳐 씀. 손목 15초 세기 단추를 측정 중 띠에도 둠(측정 중에는 ① 준비 탭이 안 보여 누를 수 없던 것) — Claude Code
- 2026-11-17: 심박수 페이지에 '🫁 숨 참기 탐구' 모드(설계서 `docs/data-processing-class-design.md` 2부, 선생님 승인 "진행해") — 맨 위 고르기(심박수 재기/숨 참기 탐구), 안전 확인 셋(앉음·관찰자·몸 상태)을 체크해야 시작, 안정 60초 → 숨 참기 30/60초(큰 카운트다운, ■ 숨 참기 멈춤 = 누른 때 기록·바로 회복) → 회복 60초를 끊지 않고 기록(카메라·노출 잠금은 `js/heart-rate.js` 의 `__hrCore` 를 그대로), 연속 곡선(10초 창·1초씩, 손가락이 떨어진 초를 품은 창·신뢰도 낮은 창은 뺌)과 숨 참기 구간 표시, 자동 지표(안정 평균·숨 참기 마지막 10초·변화율·가장 낮은 값과 시각·회복 시간 ±5%·참은 초), 선택 항목(운동 습관·키·몸무게 구간, 성별 없음)·수업 분석 동의, 회차 저장·CSV(한 줄 = 1초)·30초/60초 비교 그래프, 조 공유는 exp `heartrate` 의 `kind: 'breath'`(동의한 회차만, 요약 변화율·참은 초·안정 평균·회복 시간), 개발 수집은 선생님 기기만. 계산 `js/heart-rate-breath.js`(시험 `tests/heart-rate-breath.test.cjs`), 화면 `js/heart-rate-breath-ui.js`(시험 `tests/heart-rate-breath-ui.test.cjs`, `#breath-scale=0.2` 로 짧게). `js/heart-rate-math.js` 는 고치지 않음. `class-cloud.js` EXPS 에 `heartrate` — Claude Code
  - 확인 필요: 실제 폰으로 2분 30초~3분 이어서 잴 때 손가락 힘·움직임으로 신호가 나빠지는 정도, 회복 판정(±5%·5초 이어서) 기준이 실제 자료에 맞는지, 학교 개인정보 지침(건강 정보·체격 구간)
- 2026-11-17: 데이터 가공 실험실 1부(`projects/data-lab.html`, 선생님 승인 "진행해", 통합 관리 세션 전달) — 심박수 원본 → 결과 7단계 탭(0 원천~6 결과·검증), 단계마다 전·후 그래프와 설정, 바꾸면 아래 단계·맨 위 최종 심박수 바로 다시 계산, 단계 기록 → 기록 모음(복사·인쇄), 손목 맥박 오차. 예시: 선생님 실측 4회차(기본 설정 75.5·77·78.9·80.2, 심박수 페이지 ±3) + 가짜 자료(아주 어두움·손가락 떨어짐/빈칸·노출 출렁임). 같은 원본이 자르기를 끄면 37, 최소 간격 1초면 약 40 으로 바뀌는 것을 직접 봄. `heart-rate-math.js` 는 고치지 않음, 메인 카드 추가, 서버·규칙 변경 없음 — Claude Code
  - 확인 필요: 학생 폰(저사양)에서 설정 바꿀 때 속도(노출 보정 자료는 계산이 무거움), 인쇄 모양(브라우저별), 수업에서 쓸 단계 기록 문구 수준
- 2026-11-17: 폰 측정 · 노트북 분석 이원화의 공통 바탕(사용자 결정) — `LabUI.device()`·`setDevice`·`deviceSwitch`, `<html class="device-…">`, `.hide-on-laptop` 등 CSS, 노트북 화면의 '📱 폰으로 측정해 보내기' 카드 `share.phoneCard(자리)`(조 코드 없으면 저절로, `js/class-share.js`), UI 규칙·`docs/class-share.md` 에 이원화 규칙. 각 실험 페이지 적용은 실험 세션이 — Claude Code
- 2026-11-17: 심박수 '측정은 스마트폰, 분석은 노트북'(선생님 지시, 통합 관리 세션 전달) — 데이터 가공 실험실·심박수 숨 참기 탐구(노트북)에 '📱 폰으로 측정하기' QR, 폰(`?role=phone`)은 카메라·노출 잠금·실시간 맥파·측정(한 번 재기·숨 참기, 안전 확인·멈춤은 폰)만 하고 계산 결과·회차 목록·선택 항목은 숨김, 잰 회차는 위 띠의 회차 목록에 쌓여 골라 보냄(📤 고른 회차 보내기). 보내는 자료는 원본 frames(`js/heart-rate-raw.js`, kind `raw`, 3분·30장/초가 약 7만 자, 27만 자 넘으면 고르게 솎고 '솎음' 표시), 요약은 대략 심박수(한 번 재기)·참은 초(숨 참기)만. 노트북은 받은 원본으로 직접 계산: 데이터 가공 실험실은 자료 목록 '📱 폰 AB12 · 1회차 (시각)' → 0~6 단계, 숨 참기 탐구는 곡선·지표·비교·선택 항목·동의·CSV·보내기(동의는 노트북에서, 동의한 결과만 kind `breath` 로). 기기별(PR #113 바탕 `LabUI.device`): 💻 노트북·PC 는 심박수 페이지의 측정 부분(카메라·측정 단추·실시간 맥파·숨 참기 시작)을 숨기고 '📱 폰으로 측정해 보내기' 카드(`share.phoneCard`), 📟 태블릿·QR 없이 연 📱 폰은 지금처럼 측정+결과, 데이터 가공 실험실은 폰이 아니면 카드를 바로 보임('이 기기 ▾' 로 고침). 개발 수집은 선생님 기기만 그대로. `heart-rate-math.js`·서버 Code.gs 변경 없음 — Claude Code
  - 확인 필요: 실제 폰·학교 와이파이로 3분 숨 참기 원본 보내기(시험은 가짜 카메라·가짜 Apps Script, 0.2 배로 줄인 회차), 폰 회차 목록에 원본을 여러 개 쌓을 때 폰 저장 공간(한 번 재기 최근 회차·숨 참기 10회차까지), 실제 Apps Script 의 6칸 나눠 담기 속도
- 2026-11-17: 말루스 법칙 폰 측정 · 노트북 분석 이원화(선생님 결정, 공통 바탕 PR #113 위) — 노트북·PC 는 카메라 준비·측정 카드를 숨기고(`hide-on-laptop`) 5. 데이터 맨 위 '📱 폰으로 측정해 보내기' 카드(`share.phoneCard`, 노트북일 때만 만듦), 폰(`?role=phone`)은 지금처럼 측정·회차 골라 보내기, QR 없이 연 폰과 태블릿은 측정·분석 둘 다. 제목 아래 '이 기기' 고르기. 시트가 없을 때를 위해 이 페이지 CSV 를 '📂 CSV 불러오기'로 다시 읽음(`MalusShare.parseCsv`, 이 기기가 잰 줄만) — Claude Code
  - 확인 필요: 실제 폰·태블릿·노트북에서 기기 추측(터치 노트북은 태블릿으로 보일 수 있음 → '이 기기'로 고침)
- 2026-11-17: 진자에 폰 측정 · 노트북 분석 이원화 적용(사용자 결정, 공통 바탕 PR #113 위) — 노트북·PC 로 `pendulum-measure.html` 을 열면 측정 대신 '💻 노트북에서는 잴 수 없어요' + 📊 분석 화면 링크(`s`·`c` 이어 붙임), '🧪 연습용 시뮬레이션'을 누르면 화면을 펼치되 측정 시작·보내기 단추는 숨김. 폰으로 `pendulum-report.html` 을 열면 '📱 이 화면은 노트북용이에요' + 측정 화면 링크 + '그래도 여기서 보기'(이 탭 동안 기억). 태블릿은 둘 다 그대로. 두 화면 제목 옆에 `LabUI.deviceSwitch`. 시험 `tests/pendulum-device.test.cjs`, Code.gs 는 그대로 — Claude Code

- 2026-11-17: 스마트폰 가속도·자유낙하에 폰 측정 · 노트북 분석 이원화(사용자 결정, 공통 바탕 PR #113 위) — 💻 노트북·PC 는 측정(센서 시작·중지 / 영상 열기·점 찍기·다중섬광 합성)을 숨기고 '📱 폰으로 측정해 보내기' QR 카드(스마트폰 가속도는 상태 띠 아래, 자유낙하는 5. 데이터 맨 위), 폰에서 온 회차는 저절로 그래프(자유낙하는 표·6. 결과·g)로. 📱 폰은 측정·회차 골라 보내기(QR 로 연 화면 `?role=phone` 은 터치 없는 브라우저여도 폰 화면, 불러온 기록 목록은 숨김), 📟 태블릿은 둘 다, 제목 아래 '이 기기' 고르기(노트북에서 영상 파일로 점 찍기를 하려면 태블릿으로) — Claude Code
- 2026-11-17: 이원화 PR 3개(#115 말루스, #116 진자, #117 스마트폰 가속도·자유낙하)를 통합 관리 세션이 한 PR 로 합침(`AGENTS.md` 진행 기록 충돌만), 공통 `share.phoneCard` 고침(가속도·자유낙하 세션 의견): 카드가 안 보이면(태블릿·숨은 단계) 조 코드를 저절로 만들지 않고, 보이게 되면(단계 탭 열기·`이 기기` 바꿈, ResizeObserver·`lab-device`) 그때 그림. 합친 상태 JS 360·Python 52, 노트북·폰·태블릿 × 5페이지 확인 — Claude Code
- 2026-11-18: 말루스 🔒 노출 고정 오류 고침(선생님 실측 "노출 고정 실패: colorTemperature setting out of range") — 노출·화이트밸런스·초점을 한 번에 걸던 것을 따로따로 걸고(한 가지가 안 되어도 나머지는 고정), 값은 기기 범위·단계에 맞추고, 값을 넣어 안 되면 모드(manual)만 다시 걸어 봄. 노출만 되면 "노출은 고정했어요 · 안 된 것: …" 안내(측정해도 됨). 시험 `tests/malus-lock.test.cjs`(가짜 카메라 기능: 색온도 범위 밖·화이트밸런스 미지원) — Claude Code
- 2026-11-18: 탄소 양자점 형광 실험(`projects/quantum-dot.html`, 선생님 요청 "퀀텀닷 용액 만들기 실험", 통합 관리 세션 전달: 탄소 양자점·폰 카메라+간이 분광기+카메라 설정값·가열 시간과 재료 비율·고등학교) — 7단계(이론에 양자점·띠 틈·E = hc/λ·형광·스토크스 이동·가열 시간, 탄소 양자점은 크기–색이 딱 맞지 않는 한계, 안전), 폰 측정(형광 색 → 파장 추정, 분광기 보정·봉우리·반치폭, 노출·ISO·색온도·EV·lux·보정 밝기, 🔒 노출 고정은 말루스 방식) → 회차 골라 보내기 → 노트북 표·그래프·분광 곡선·CSV. 서버 `apps-script/Code.gs` 11판(`GENERIC_EXPS` 에 `qdot`), 교사 화면은 실험의 `needServer` 보다 시트 판이 낮으면 안내. 메인 카드 — Claude Code
  - 확인 필요: **선생님 교사 화면 🔄 11판 업데이트**, 실제 시료·자외선 손전등·회절 격자 상자로 측정(시험은 가짜 카메라·가짜 스펙트럼 그림), 기종별 노출 값·잠금, 색상 → 파장 표가 실제 형광 색과 맞는지, 실제 형광등 사진에서 자동 짝짓기(가장 밝은 3개)가 맞는지
