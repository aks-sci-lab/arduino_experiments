/* 사이트 공통 설정 (예전 이름 그대로: 진자 실험에서 시작해 여러 페이지가 불러옴)
   2026-11-20: Apps Script 시트 주소(appsScriptUrl)·템플릿 시트·'내 서버 만들기' 클라이언트 ID 를 지움.
   수업 연결·조 공유·폰→노트북 저장은 사이트 저장소(Firestore, js/lab-store.js)로만 한다. */
window.PENDULUM_CONFIG = {
    pollSeconds: 5,         // 노트북 분석 화면이 새 측정을 확인하는 간격(초) — 실시간 듣기가 먼저 알려 주고, 이것은 예비
    // 개발 데이터 자동 수집 (2026-11-17 선생님 결정: 개발 중에만, 공개 저장소의 dev-data 브랜치로). 사이트 관리 교사 구글 로그인 기기에서만 동작.
    // 개발이 끝나면 false 로 (docs/dev-data.md)
    devCollect: true
};
