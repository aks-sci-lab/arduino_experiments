# 배포 안내 (aks-sci-lab.web.app)

> ⚠️ PC 에서 `firebase deploy` 로 직접 배포하지 마세요. 배포는 항상 GitHub `main` 에서 자동으로 합니다.
> 직접 올리면 `main` 에 없는 내용이 사이트에만 남아, 다음 자동 배포 때 사라집니다.

## 평소 흐름

1. AI(Claude Code)가 브랜치에서 작업하고 PR(변경 요청)을 만든다.
2. PR을 확인하고 **Merge** 버튼을 누르면 `main` 에 반영된다.
3. `main` 에 반영되면 GitHub Actions가 자동으로 https://aks-sci-lab.web.app 에 배포한다.
   - 진행 상황: 저장소의 **Actions** 탭 → "Deploy to Firebase Hosting"

## 처음 한 번만: 배포 키 등록

자동 배포가 사이트에 올리려면 Firebase 배포 키가 필요합니다. 키가 없으면 배포 단계는 건너뜁니다(빨간 실패는 뜨지 않음).

### 방법 A: Firebase CLI 사용 (가장 쉬움, PC 필요)

```bash
npm install -g firebase-tools
firebase login
cd sensor-lab
firebase init hosting:github
```

질문이 나오면 저장소는 `aks-sci-lab/sensor-lab` 를 입력하고, 워크플로 파일 생성 질문에는 **No**를 선택합니다(이미 있음).
이 명령이 키를 만들어 GitHub Secrets 에 자동으로 등록합니다. 등록된 이름이 `FIREBASE_SERVICE_ACCOUNT_...` 처럼 다르면
`.github/workflows/deploy-hosting.yml` 의 `FIREBASE_SERVICE_ACCOUNT` 를 그 이름으로 바꾸세요.

### 방법 B: 웹에서 직접

1. [Firebase 콘솔](https://console.firebase.google.com) → 사이트가 있는 프로젝트 → ⚙ **프로젝트 설정** → **서비스 계정** → **새 비공개 키 생성** (JSON 파일 다운로드)
2. GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: 다운로드한 JSON 파일 내용 전체
3. 사이트가 `web-experiment-f9b24` 가 아닌 다른 Firebase 프로젝트에 있다면, 같은 화면의 **Variables** 탭에서
   `FIREBASE_PROJECT_ID` = 그 프로젝트 ID 를 추가합니다.
4. Actions 탭 → "Deploy to Firebase Hosting" → **Run workflow** 로 첫 배포를 실행합니다.

> JSON 키는 사이트 관리 권한이 있는 비밀번호와 같습니다. 채팅, 코드, 커밋에 붙여넣지 마세요.

## Firestore 보안 규칙

**2026-11-14 부터 자동입니다.** `firestore.rules` 가 바뀐 PR 이 `main` 에 머지되면 GitHub Actions 의
"Deploy Firestore rules"(`.github/workflows/deploy-firestore-rules.yml`)가 사이트 배포와 같은 키(`FIREBASE_SERVICE_ACCOUNT`)로 규칙을 게시합니다.
- 진행 상황: 저장소 **Actions** 탭 → "Deploy Firestore rules". 손으로 다시 게시하려면 같은 화면의 **Run workflow**.
- 게시 결과는 Firebase 콘솔 → Firestore Database → **규칙** 탭 왼쪽 기록에도 시각과 함께 남습니다.

### 처음 한 번: 권한 오류가 나면 (약 2분)

키(서비스 계정)에 규칙을 바꿀 권한이 없으면 Actions 에 `403`·`PERMISSION_DENIED`·`firebaserules` 오류가 납니다.
1. https://console.cloud.google.com/iam-admin/iam?project=web-experiment-f9b24 를 엽니다.
2. 사이트 배포에 쓰는 서비스 계정 줄(이름에 `github-action` 또는 `firebase-adminsdk` 가 들어 있음)의 ✏️ 를 누릅니다.
3. **다른 역할 추가** → `Firebase Rules 관리자`(Firebase Rules Admin) → 저장.
4. Actions 탭 → "Deploy Firestore rules" → **Run workflow** 로 다시 실행합니다.

### 자동 게시가 안 될 때 (예비 방법)

Firebase 콘솔 → 프로젝트 `web-experiment-f9b24` → Firestore Database → **규칙** 탭에 `firestore.rules` 내용을 통째로 붙여 넣고 **게시**를 누릅니다.

## 수업 연결 저장소 (2026-11-18, Apps Script 대신 Firestore)

수업 연결·조 공유·폰→노트북 전송은 `js/lab-store.js` 가 Firestore 에 저장합니다. 콘솔에서 **한 번만** 할 일:

1. **익명 로그인 켜기**: Firebase 콘솔 → Authentication → 로그인 방법(Sign-in method) → **익명(Anonymous)** → 사용 설정 → 저장. (학생이 로그인 화면 없이 쓰는 데 필요. 꺼져 있으면 학생 화면에 '익명 로그인이 꺼져 있어요' 가 나옵니다)
2. **구글 로그인**: 이미 켜져 있음(메인 화면 사이트 관리 로그인과 같음). 교사 화면도 같은 구글 로그인을 씁니다.
3. **승인된 도메인**: Authentication → 설정 → 승인된 도메인에 `aks-sci-lab.web.app` 이 있는지 확인(보통 이미 있음).
4. **규칙**: `firestore.rules` 가 머지되면 자동 게시(위 'Firestore 보안 규칙').

### 학기 끝 자동 삭제 (TTL)

모든 수업 자료 문서에 `expireAt`(만든 날 + 183일)이 붙습니다. 두 가지가 지웁니다.

- **TTL 정책**(Firestore 가 스스로 지움, 하루쯤 늦을 수 있음): `firestore.indexes.json` 이 머지되면 "Deploy Firestore rules" 가 함께 게시합니다.
  권한 오류(`datastore.indexes`)가 나면 서비스 계정에 **Cloud Datastore 색인 관리자(Cloud Datastore Index Admin)** 역할을 더하거나, 콘솔에서 직접:
  Firestore Database → **TTL** 탭 → 정책 만들기 → 컬렉션 그룹 `items`, 타임스탬프 필드 `expireAt` → 만들기.
  같은 방법으로 `raw`, `progress`, `labClasses`, `labClassCodes`, `devlog` 도 (모두 필드는 `expireAt`).
- **정리 작업**(`.github/workflows/firestore-cleanup.yml`, 매일 새벽): TTL 을 못 켰어도 같은 키(`FIREBASE_SERVICE_ACCOUNT`)로 `expireAt` 가 지난 문서를 지웁니다. Actions 탭에서 손으로 돌릴 수도 있어요. 이 작업은 `expireAt` 색인(위 파일)이 있어야 동작합니다.

### 비용

Spark(무료) 한도: 하루 쓰기 2만·읽기 5만. 30명 한 반 50분 수업에 쓰기 약 1,000번·읽기 약 2,500번(자세히: `docs/class-teacher-guide.md`).
학생 화면은 같은 조의 새 측정을 실시간 듣기로 받아, 몇 초마다 확인해도 읽기 횟수가 늘지 않습니다.
