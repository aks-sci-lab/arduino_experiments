# 작업 안내 (AI 코딩 도구 공용)

이 파일은 GitHub Copilot, Claude Code 등 이 저장소에서 일하는 모든 AI가 먼저 읽는 공통 안내입니다.
중요한 결정은 여기에 적어 다음 작업자가 이어받을 수 있게 합니다.

## 프로젝트

**문항 출제용 그림·그래프 도구**: 선생님이 시험 문항에 넣을 흑백 그림(그래프·도형·회로·광학·파동)을 그려 PNG·SVG 로 내보내는 브라우저 앱.
사용자(교사)는 코딩 초보이므로, 설명은 쉬운 한국어로 하고 용어는 풀어서 쓴다.

- 2026-10-30 `aks-sci-lab/arduino_experiments`(과학 수업 웹 실험실)의 `projects/figure-maker.html` 에서 옮겨 온 **별개의 프로젝트**다 (사용자 지정). 예전 커밋 기록은 가져오지 않았다. 예전 주소는 실험실 저장소에 넘김 페이지만 남긴다.
- 배포: GitHub Pages (https://aks-sci-lab.github.io/figure-maker/), `main` 에 머지되면 `.github/workflows/pages.yml` 이 시험 후 배포.

## 구조

| 경로 | 내용 |
|---|---|
| `index.html` | 화면 |
| `js/figure-model.js` | 그림 자료·식 계산·SVG (Node 에서도 시험) |
| `js/figure-maker.js` | 화면·그리기 조작, 자동 저장(localStorage `figure-maker-*`) |
| `js/figure-ai.js` | AI 그리기 (Claude, 선생님 본인 API 키) |
| `js/figure-ai-local.js` | AI 그리기 (내 PC 의 LM Studio) |
| `js/figure-ai-prompt.js` | Claude·LM Studio 가 같이 쓰는 그림 규칙 |
| `css/figure-maker.css` | 스타일 |
| `tests/` | `node --test tests/*.test.cjs` |

## 규칙

- 빌드 도구 없음: 순수 HTML/CSS/JavaScript. 외부 라이브러리는 CDN(jsdelivr)만, 버전 고정.
- 화면 문구와 주석은 한국어.
- AI 는 선생님 본인의 Claude API 키로 브라우저에서 Anthropic 에 바로 요청한다 (키는 선택 시 그 브라우저 localStorage 에만). 사이트에 키를 넣거나 서버를 두지 않는다. SDK 는 jsdelivr `@anthropic-ai/sdk@0.133.0/+esm` 로 버전 고정.
- 내 PC 의 LM Studio(OpenAI 호환, 기본 `http://127.0.0.1:1234`)도 쓸 수 있다 (사용자 PC: Ryzen 7 8845HS·24GB, Gemma 4 12B). Gemma 를 위해 규칙을 system 이 아닌 첫 사용자 글에 넣고, JSON 스키마(`response_format`)를 거절하면 빼고 다시, 깨진 JSON 은 한 번 고쳐 쓰게 한다.
- 비밀값(API 키)은 커밋하지 않는다.

## 역할 분담 (사용자 지정)

| 담당 | 하는 일 | 하지 않는 일 |
|---|---|---|
| **Claude Code / GitHub Copilot** | 브랜치에서 수정 → 테스트 → PR. 상대 도구의 PR 은 설명·댓글까지 읽고 검토 | 사용자 승인 없는 `main` 머지 |
| **사용자** | 최종 승인 (머지 = 배포) | |

- PR 설명에는 원래 요구사항, 바꾼 내용, 실행한 테스트, 확인하지 못한 것을 적는다. 검토자는 이것을 그대로 믿지 말고 직접 확인한다.

## 대화 분리: 개발 대화 / 머지 대화 (사용자 결정 2026-10-30)

머지·배포를 기다리는 동안 개발이 멈추지 않도록, Claude Code·GitHub Copilot 모두 대화(채팅)를 두 종류로 나눠 쓴다. 사용자가 첫 말로 어느 쪽인지 알려 준다. 알려 주지 않았으면 개발 대화로 본다.

| 대화 | 하는 일 | 하지 않는 일 |
|---|---|---|
| **개발 대화** | 브랜치에서 수정 → 테스트 → PR 생성, 검토 의견 반영 | `main` 머지(= 배포) |
| **머지 대화** | PR 확인(테스트·충돌·PR 설명 검토) → 사용자 승인 후 머지 → 배포 확인 | 코드 수정 (PR 댓글로 돌려줌), 사용자 승인 없는 머지 |

- 인계는 **PR 설명**으로 한다. 같은 브랜치를 두 대화가 동시에 고치지 않는다.

## 진행 기록

- 2026-10-28: 문항 출제용 그림·그래프 도구 (실험실 저장소 PR #47·#48: 그래프·도형·회로 13종·렌즈·거울·파동, PNG·SVG·작업 파일, AI 그리기 Claude·LM Studio) — Claude Code
- 2026-10-30: `arduino_experiments` 에서 이 저장소로 독립, GitHub Pages 배포 — Claude Code
