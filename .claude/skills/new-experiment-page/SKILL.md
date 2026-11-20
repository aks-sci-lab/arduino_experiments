---
name: new-experiment-page
description: 센서 기반 실험실에 새 실험 페이지(또는 기존 실험을 새 방식으로 고치기)를 만들 때 쓰는 점검표와 순서. 7단계 보고서 화면, 폰 측정 · 노트북 분석 이원화(QR 카드·기기 판별), 조 공유(ClassShare·Firestore 저장소), 보고서 AI(ReportAI), 카메라 노출 고정, 개인정보, 메인 카드, 가짜 저장소·기기 흉내 시험까지 빠짐없이 붙이도록. "새 실험 만들어", "○○ 실험 페이지", "실험 추가" 같은 요청에 쓴다.
---

# 새 실험 페이지 만들기

`AGENTS.md` 의 'UI 규칙'·'작업 과정' 3번(공통 점검표)을 실제 코드로 옮기는 방법이다. **가장 최근에 모든 부품을 다 붙인 기준 구현은 탄소 양자점 실험**이다 — 모르면 이것을 그대로 본뜬다.

| 역할 | 기준 파일 |
|---|---|
| 페이지 뼈대(7단계·QR 카드·보고서 AI 자리·스크립트 순서) | `projects/quantum-dot.html` |
| 화면(조 공유·폰 연결·기기별 보이기·단계 탭) | `js/quantum-dot.js` (`ClassShare.init` 부분) |
| 계산(브라우저·Node 공용, 받은 자료 정리) | `js/quantum-dot-math.js` (`cleanSample`·`buildItems`·`applyIncoming`) |
| 화면 시험(가짜 저장소·가짜 카메라·기기 흉내) | `tests/quantum-dot-ui.test.cjs` |
| 노출 고정(노출·화이트밸런스·초점 따로) | `js/malus-law.js` 의 `fitCap`·`tryLock`·`lockExposure` |
| 블루투스 센서 실험이면 | `projects/ideal-gas.html`·`js/custom-lab-sensor.js` |

## 1. 먼저 정할 것 (모르면 사용자에게 한국어 선택 목록으로)

- 화면 방식: **실험 이름 있는 보고서 실험 = 7단계**(목적·이론·준비물·과정·데이터·결과·결론) / 센서 값만 보는 페이지 = 한 화면(`.dash`)
- 무엇으로 재나: **폰 센서·카메라 → 이원화**(노트북은 분석만) / 블루투스·USB 센서 → 노트북에서 측정
- 바꿔 볼 변인, 대상 학년, 받을 정보(**이름·학번·성별은 받지 않는다**, 체격 같은 것은 구간으로만)

## 2. 파일 만들기

- `projects/<이름>.html`, `js/<이름>.js`(화면), `js/<이름>-math.js`(계산, `module.exports` 와 `window` 둘 다), `css/<이름>.css`
- `<head>`: `<meta name="viewport">` 바로 다음에 `../css/lab-base.css` 와 `../js/lab-ui.js`(defer 없이), 그다음 `../css/class-share.css`, 페이지 CSS
- 색·글꼴은 `lab-base.css` 변수만(`var(--c-primary)` 등). 화면 글·주석은 한국어
- 7단계: `<nav class="steps">` + `<section class="step-panel" data-step="…">` + `LabUI.initSteps({ key, start, onShow })`. 긴 글은 부모 `data-subtabs` + 제목에 `data-subtab="이름"`
- 제목 아래 `<div id="device-switch"></div>` + `LabUI.deviceSwitch('#device-switch')`
- 스크립트 순서(본문 끝): `pendulum-config.js` → `pendulum-cloud.js` → **`lab-store.js`** → `class-cloud.js` → `class-share.js` → 계산 → 화면 → `report-ai.css`·`report-ai.js`

## 3. 폰 측정 · 노트북 분석 (폰 센서·카메라 실험만)

- 측정 부분(카메라·측정 단추·실시간 그래프)에 `class="hide-on-laptop"`
- 5. 데이터 맨 위 `<div id="phone-card" class="show-on-laptop"></div>`, 노트북일 때만 `share.phoneCard('#phone-card')`
- 폰(`?role=phone`)은 측정 + 회차 목록에서 골라 📤 보내기(공통 부품 기본), 태블릿은 둘 다
- 카메라를 쓰면 노출 고정은 말루스 방식 그대로(한꺼번에 걸지 말 것 — 갤럭시에서 `colorTemperature setting out of range` 로 통째 실패한 적 있음)

## 4. 조 공유 (모든 실험)

- `ClassShare.init({ exp, barMount, shareMount, getItems, onIncoming, getStep, getPoints, phone, onRole, onPhoneData, deleteItem, csvImport, ... })` 만 쓴다. **저장소(`LabStore`)를 페이지에서 직접 부르지 않는다**
- 새 실험 이름(exp, 영문 소문자)은 **두 곳에 함께**: `js/class-cloud.js` 의 `EXPS`(이름·아이콘·페이지·steps·`ready: true`) + `js/lab-store.js` 의 `GENERIC_EXPS`
- 받은 자료는 다른 기기·학생이 보낸 것이다: `cleanSample` 처럼 숫자는 숫자로, 글은 길이 제한, 화면에 넣을 때 `esc()`. 내 기록과 📥 받은 기록을 섞지 말고 따로 보관
- 큰 원본은 27만 자 안으로(넘으면 고르게 솎고 '솎음' 표시, `js/heart-rate-raw.js` 참고). 사진·영상은 보내지 않는다

## 5. 보고서 AI (7단계 실험)

- 7. 결론에 `<div id="report-ai"></div>`, `ReportAI.init({ exp, mount: '#report-ai', contextFrom: '결과 표·맞춤 결과 선택자' })` 또는 `getContext`
- 계산은 코드로 하고 AI 에게 맡기지 않는다(맥락으로 계산 결과 글만 넘김)

## 6. Firestore 에 새 칸을 만들 때만

- 모든 문서에 `expireAt`(+183일), `firestore.rules` 에 규칙(목록 조회 막기·크기·필드), `firestore.indexes.json` 에 `expireAt` 색인(**무료 요금제라 `ttl: false`**), `tools/firestore-cleanup.cjs` 의 목록에 추가
- 규칙 시험은 에뮬레이터로(아래 `pr-verify` 스킬 참고), PR 제목에 "(규칙 바뀜)"

## 7. 메인 카드·문서

- `index.html` 실험 목록에 고르기 카드 `<a class="pick-card" href="projects/…"><span class="ic">…</span><b>…</b><small>…</small></a>`
- `AGENTS.md`: 구조 표 한 줄 + 진행 기록 한 줄만(다른 세션과 충돌 줄이기)

## 8. 시험

- 계산: `tests/<이름>-math.test.cjs`(알려진 답이 나오는지 — 예: 가짜 스펙트럼 봉우리 450 nm ±5)
- 화면: `tests/<이름>-ui.test.cjs` — `loadLabStore()`(`tests/fake-lab-store.cjs`), `ctx.addInitScript(() => { window.LAB_STORE_FAKE_URL = 'https://script.google.com/macros/s/FAKE_LAB_STORE/exec'; })` 를 라우트보다 먼저, `script.google.com` 요청을 `await app.post/get` 으로 돌림
  - 노트북(터치 없는 1280px 창): 측정 단추 없음·QR 카드
  - 폰 `devices['iPhone 13']`: 2회 측정 → 1회 골라 보내기 → 노트북 🆕·표·결과
  - 태블릿 `devices['Galaxy Tab S4']`: 측정·분석 둘 다
  - 375px 가로 스크롤 없음, 단추 44px, 페이지 오류 없음
- 전체: `node --test tests/*.test.cjs` + `python3 -I -m unittest discover -s tests -p 'test_*.py'`
