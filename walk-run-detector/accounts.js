// Firebase 로그인 · 관리자 확인 · AI 설정(Firestore) 저장/불러오기
// 메인 페이지(index.html)와 같은 Firebase 프로젝트를 쓰므로 같은 구글 계정·교사 권한을 그대로 사용한다.

const firebaseConfig = {
  projectId: 'web-experiment-f9b24',
  appId: '1:718758606428:web:e11ed8d0b64a471ee65899',
  storageBucket: 'web-experiment-f9b24.firebasestorage.app',
  apiKey: 'AIzaSyCYVme6ZP-iyspRmHTtuUSsKXe7K_D0vJQ',
  authDomain: 'web-experiment-f9b24.firebaseapp.com',
  messagingSenderId: '718758606428',
};

// index.html의 checkIsTeacher와 같은 기준
const OWNER_EMAIL = 'lany0665@gmail.com';
const CONFIG_DOC = ['appConfig', 'walkRunAI'];

let auth = null;
let db = null;

export function firebaseReady() {
  return auth !== null;
}

// onChange({ user, isAdmin }) 가 로그인 상태가 바뀔 때마다 호출된다.
export function initAccounts(onChange) {
  if (typeof firebase === 'undefined') {
    onChange({ user: null, isAdmin: false, unavailable: true });
    return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
  } catch (e) {
    console.error('Firebase init error', e);
    onChange({ user: null, isAdmin: false, unavailable: true });
    return;
  }
  auth.onAuthStateChanged(async user => {
    onChange({ user, isAdmin: user ? await checkIsAdmin(user) : false });
  });
}

async function checkIsAdmin(user) {
  if (user.email === OWNER_EMAIL) return true;
  try {
    const doc = await db.collection('roles').doc(user.uid).get();
    return doc.exists && doc.data().isTeacher === true;
  } catch {
    return false;
  }
}

export async function signIn() {
  if (!auth) throw new Error('Firebase를 불러오지 못했습니다. 인터넷 연결을 확인하세요.');
  await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
}

export function signOut() {
  return auth?.signOut();
}

// 반환: { status: 'ok', config } | { status: 'unset' } | { status: 'denied' } | { status: 'error', error }
export async function loadAIConfig() {
  try {
    const doc = await db.collection(CONFIG_DOC[0]).doc(CONFIG_DOC[1]).get();
    if (!doc.exists) return { status: 'unset' };
    const data = doc.data();
    if (!data.apiKey || !data.model) return { status: 'unset' };
    return { status: 'ok', config: data };
  } catch (e) {
    if (e.code === 'permission-denied') return { status: 'denied' };
    return { status: 'error', error: e };
  }
}

export async function saveAIConfig({ apiKey, model, allowStudents, updatedBy }) {
  await db.collection(CONFIG_DOC[0]).doc(CONFIG_DOC[1]).set({
    provider: 'gemini',
    apiKey,
    model,
    allowStudents: !!allowStudents,
    updatedBy,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

export async function deleteAIConfig() {
  await db.collection(CONFIG_DOC[0]).doc(CONFIG_DOC[1]).delete();
}
