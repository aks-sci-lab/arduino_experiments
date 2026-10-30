# ✏️ 문항 출제용 그림·그래프 (선생님용)

시험 문항에 넣을 흑백 그림을 그려 PNG·SVG 로 내보내는 브라우저 도구입니다. 설치 없이 쓰고, 그림은 서버로 보내지 않습니다.

- 주소: https://aks-sci-lab.github.io/figure-maker/
- 2026-10-30 `aks-sci-lab/arduino_experiments`(과학 수업 웹 실험실)에서 독립했습니다. 예전 주소(aks-sci-lab.web.app/projects/figure-maker.html)는 이 주소로 안내합니다.

- 그래프: 식(`y = 2x+1`, `3/x`, `sin(x)`)·점 이어 그리기, 문자 눈금(`1:*t*_0`), 축까지 점선, 선 아래 넓이 빗금, 모눈
- 도형: 선·화살표·꺾은선·사각형(기울이기)·원·글자(`v_0`, `x^2`, `*v*` 기울임)·점·각도·빗금 바닥·용수철
- 회로도: 저항·전지·전구·스위치·전류계·전압계·LED·축전기 등, 도선이 소자 끝에 자동으로 붙음
- 광학·파동: 볼록·오목 렌즈, 평면·오목·볼록 거울, 사인 파동·정상파
- AI 그리기: 글이나 손그림·문항 사진을 주면 Claude 가 그림 자료(JSON)를 만들어 넣음 → 보통 그림처럼 고칠 수 있음. 선생님 본인의 Claude API 키가 필요하고, 브라우저에서 Anthropic 으로 바로 보냄
- AI 그리기 (내 PC): LM Studio 의 로컬 모델(예: Gemma)로도 그림. 요금 없고 내용이 PC 밖으로 나가지 않음. LM Studio 에서 Context Length 16384 이상, 서버의 Enable CORS 켜기 (`js/figure-ai-local.js`)
- 내보내기: PNG 복사(한글·워드에 바로 붙여 넣기)·PNG 저장(2~4배)·SVG 저장, 작업 파일(.json) 저장·열기, 브라우저에 자동 저장
- 계산·그리기: `js/figure-model.js`, 화면: `js/figure-maker.js`, AI: `js/figure-ai.js`·`js/figure-ai-local.js` (규칙은 `js/figure-ai-prompt.js` 하나를 같이 씀)

## 시험

```
node --test tests/*.test.cjs
```

## 내 컴퓨터에서 열기

`index.html` 을 바로 열면 AI 모듈을 불러오지 못할 수 있으니, 이 폴더에서 `python -m http.server 8000` 을 실행하고 http://localhost:8000 으로 엽니다.
