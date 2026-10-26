// 말루스 법칙 실험 결과를 사용자 본인의 구글 드라이브에 새 스프레드시트로 내보낸다.
// 메인 페이지와 같은 Firebase 프로젝트의 구글 로그인을 사용하며, drive.file 권한만 요청하므로
// 이 앱이 만든 파일 외에는 접근하지 않는다.
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-gs-oauth');
    if (!btn) return;
    const status = document.getElementById('gs-oauth-status');
    const link = document.getElementById('gs-oauth-link');

    const firebaseConfig = {
        projectId: "web-experiment-f9b24",
        appId: "1:718758606428:web:e11ed8d0b64a471ee65899",
        storageBucket: "web-experiment-f9b24.firebasestorage.app",
        apiKey: "AIzaSyCYVme6ZP-iyspRmHTtuUSsKXe7K_D0vJQ",
        authDomain: "web-experiment-f9b24.firebaseapp.com",
        messagingSenderId: "718758606428"
    };

    let auth = null;
    try {
        if (typeof firebase !== 'undefined') {
            if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
        }
    } catch (e) { console.error('Firebase init error', e); }

    async function getToken() {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/drive.file');
        // 이미 로그인된 경우 같은 계정으로 권한만 다시 받는다(계정이 바뀌지 않음).
        const result = auth.currentUser
            ? await auth.currentUser.reauthenticateWithPopup(provider)
            : await auth.signInWithPopup(provider);
        return result.credential.accessToken;
    }

    async function api(token, url, opts) {
        const r = await fetch(url, Object.assign({}, opts, {
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
        }));
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            const msg = (j.error && j.error.message) || r.statusText;
            const err = new Error(msg);
            err.status = r.status;
            throw err;
        }
        return j;
    }

    btn.addEventListener('click', async () => {
        const m = window.__malus;
        const rows = m ? m.rows() : [];
        if (!rows.length) { status.textContent = '내보낼 측정 데이터가 없습니다.'; return; }
        if (!auth) { status.textContent = '구글 로그인을 불러오지 못했습니다. 네트워크를 확인하세요.'; return; }
        btn.disabled = true;
        link.hidden = true;
        try {
            status.textContent = '구글 로그인 중…';
            const token = await getToken();
            status.textContent = '내 드라이브에 시트 만드는 중…';
            const name = (rows[0][1] || '').trim();
            const title = '말루스 법칙 실험' + (name ? ' - ' + name : '') + ' (' + new Date().toLocaleDateString('ko-KR') + ')';
            const sheet = await api(token, 'https://sheets.googleapis.com/v4/spreadsheets', {
                method: 'POST', body: JSON.stringify({ properties: { title } })
            });
            await api(token, 'https://sheets.googleapis.com/v4/spreadsheets/' + sheet.spreadsheetId +
                '/values/A1?valueInputOption=USER_ENTERED', {
                method: 'PUT', body: JSON.stringify({ values: [m.header].concat(rows) })
            });
            status.textContent = rows.length + '행을 내 구글 드라이브에 저장했습니다.';
            link.href = sheet.spreadsheetUrl;
            link.hidden = false;
        } catch (e) {
            if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
                status.textContent = '로그인이 취소되었습니다.';
            } else if (e.code === 'auth/popup-blocked') {
                status.textContent = '팝업이 차단되었습니다. 팝업을 허용하고 다시 눌러 주세요.';
            } else if (e.code === 'auth/user-mismatch') {
                status.textContent = '메인 페이지에 로그인한 계정과 같은 계정을 선택하세요.';
            } else if (e.status === 403) {
                status.textContent = '권한 오류: ' + e.message + ' (관리자가 Google Sheets API를 활성화해야 할 수 있습니다. 아래 "표 복사"를 이용하세요.)';
            } else {
                status.textContent = '내보내기 실패: ' + (e.message || e);
            }
        } finally {
            btn.disabled = false;
        }
    });
});
