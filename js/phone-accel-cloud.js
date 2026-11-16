// 2026-11-16: 스마트폰 가속도 페이지는 이 파일을 더 불러오지 않는다 (구글 로그인 제출 → 조 공유 js/phone-accel-share.js).
// Firebase 설정값의 기준 파일로 AGENTS.md 가 가리키므로 지우지 않고 남겨 둔다.
// Firebase Cloud DB submission for the phone accelerometer experiment.
// Reuses the same Firebase project as index.html; if a student is already
// signed in with Google on the main page, that auth session is shared here
// (same-origin, same Firebase project), so no separate login UI is needed.
document.addEventListener('DOMContentLoaded', () => {
    const firebaseConfig = {
        projectId: "web-experiment-f9b24",
        appId: "1:718758606428:web:e11ed8d0b64a471ee65899",
        storageBucket: "web-experiment-f9b24.firebasestorage.app",
        apiKey: "AIzaSyCYVme6ZP-iyspRmHTtuUSsKXe7K_D0vJQ",
        authDomain: "web-experiment-f9b24.firebaseapp.com",
        messagingSenderId: "718758606428"
    };

    let auth = null, db = null, currentUser = null;
    try {
        if (typeof firebase !== 'undefined') {
            firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
            db = firebase.firestore();
            auth.onAuthStateChanged(user => { currentUser = user; });
        }
    } catch (e) {
        console.error('Firebase init error', e);
    }

    const btnCloudSubmit = document.getElementById('btn-cloud-submit');
    if (!btnCloudSubmit) return;

    btnCloudSubmit.addEventListener('click', async () => {
        if (!auth || !currentUser) {
            alert('실험 데이터를 제출하려면 메인 페이지(index.html)에서 구글 로그인이 필요합니다.');
            return;
        }
        const api = window.__phoneAccel;
        const samples = api ? api.getSamples() : [];
        if (!samples || samples.length === 0) {
            alert('제출할 측정 데이터가 없습니다. 먼저 실험을 진행하세요.');
            return;
        }

        const range = api.getRange();
        try {
            btnCloudSubmit.disabled = true;
            btnCloudSubmit.textContent = '제출 중...';

            // Compact sample list (time in ms, 3-axis acceleration in g) for reference.
            const accelSamples = samples.map(s => ({
                t: Math.round(s.rel),
                ax: Number(s.ax.toFixed(4)),
                ay: Number(s.ay.toFixed(4)),
                az: Number(s.az.toFixed(4))
            }));

            const doc = {
                userId: currentUser.uid,
                userEmail: currentUser.email,
                experimentName: '스마트폰 가속도 센서 실험',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                tab: 'phone-accelerometer',
                trialsCount: 1,
                dataSummary: `샘플 ${samples.length}개 / 구간 ${range.rangeMs.toFixed(0)}ms`,
                accelSamples,
                // Required by current firestore.rules schema (kept for compatibility; unused here).
                weatherSample: {},
                stargazingSample: []
            };
            await db.collection('experiments').add(doc);
            alert('✅ Cloud DB에 성공적으로 제출되었습니다!');
        } catch (e) {
            alert('❌ 제출 실패: ' + e.message);
        } finally {
            btnCloudSubmit.disabled = false;
            btnCloudSubmit.textContent = '☁️ Cloud DB에 제출';
        }
    });
});
