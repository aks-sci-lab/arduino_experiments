/* 스마트폰 진자 — 선생님 설정 (한 번만)
   선생님 구글 시트에 apps-script/Code.gs 를 웹 앱으로 배포한 뒤, 받은 주소를 아래 '' 사이에 넣는다.
   예: appsScriptUrl: 'https://script.google.com/macros/s/AKfycb……/exec'
   비워 두면 학생 화면에 "선생님 설정 필요"가 나오고, CSV 파일로 주고받는 방법만 쓸 수 있다.
   안내: projects/pendulum-setup.html (통합 관리 세션 대화에 주소를 알려 주면 대신 넣어 준다)
   선생님마다 자기 시트를 쓰려면: 설정 화면에서 로그인 → 주소 붙여 넣기 → "우리 반 링크"(…?s=스크립트ID).
   링크로 연 노트북은 그 시트를 쓰고, 여기 appsScriptUrl 은 링크 없이 열었을 때의 기본 시트다. */
window.PENDULUM_CONFIG = {
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxX-2giNNmH-2loNRX3UDzJqWKYXnFT2zjfWMXFgsXjfpU_JBlQ2DA6DSK1pQyJunjI/exec',   // 2026-11-14 선생님 시트(연결 시험: 버전 1 확인)
    pollSeconds: 5,         // 노트북 분석 화면이 새 측정을 확인하는 간격(초)
    // 코드가 든 템플릿 시트의 '사본 만들기' 주소 (https://docs.google.com/spreadsheets/d/…/copy).
    // 넣으면 선생님 설정 화면에 "템플릿 시트 사본 만들기" 단추가 나와 코드 붙여 넣기를 건너뛴다. 만드는 법: 설정 화면 맨 아래
    templateCopyUrl: ''
};
