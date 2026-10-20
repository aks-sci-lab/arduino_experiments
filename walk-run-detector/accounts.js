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

export async function saveAIConfig({ apiKey, model, allowStudents, dailyLimit, updatedBy }) {
  await db.collection(CONFIG_DOC[0]).doc(CONFIG_DOC[1]).set({
    provider: 'gemini',
    apiKey,
    model,
    allowStudents: !!allowStudents,
    dailyLimit: Math.max(0, Math.floor(Number(dailyLimit) || 0)),
    updatedBy,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

export async function deleteAIConfig() {
  await db.collection(CONFIG_DOC[0]).doc(CONFIG_DOC[1]).delete();
}

// ---------- 학습 데이터 · 반 모델 (로그인한 사용자만 접근, firestore.rules 참고) ----------

const DATA_COLLECTION = 'walkRunData';
const MODEL_DOC = ['walkRunModel', 'current'];
const CLOUD_LIMIT = 400;

export async function uploadRecording(rec) {
  const ref = await db.collection(DATA_COLLECTION).add({
    userId: auth.currentUser.uid,
    label: rec.label,
    hz: rec.hz,
    m: rec.m,
    source: rec.source,
    evalSet: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

// 최근 기록부터 최대 CLOUD_LIMIT개
export async function loadCloudRecordings() {
  const snap = await db.collection(DATA_COLLECTION).orderBy('createdAt', 'desc').limit(CLOUD_LIMIT).get();
  return snap.docs.map(d => {
    const v = d.data();
    return {
      id: 'c_' + d.id,
      cloudId: d.id,
      label: v.label,
      source: 'cloud',
      hz: v.hz,
      m: v.m,
      userId: v.userId,
      evalSet: v.evalSet === true,
      createdAt: v.createdAt?.toMillis?.() ?? 0,
    };
  });
}

export function deleteCloudRecording(cloudId) {
  return db.collection(DATA_COLLECTION).doc(cloudId).delete();
}

export function currentUid() {
  return auth?.currentUser?.uid ?? null;
}

// Firestore는 배열 안의 배열을 허용하지 않으므로 모델은 JSON 문자열로 저장한다.
export async function publishModel(model, updatedBy) {
  const json = JSON.stringify(model);
  if (json.length > 900000) throw new Error('모델이 너무 큽니다. 로지스틱 회귀를 사용하거나 데이터를 줄이세요.');
  await db.collection(MODEL_DOC[0]).doc(MODEL_DOC[1]).set({
    json,
    type: model.type,
    testAccuracy: model.metrics?.test?.accuracy ?? null,
    updatedBy,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

export async function loadClassModel() {
  const doc = await db.collection(MODEL_DOC[0]).doc(MODEL_DOC[1]).get();
  if (!doc.exists) return null;
  return JSON.parse(doc.data().json);
}

// 교사만: 이 기록을 "평가용"으로 지정한다. 평가용 기록은 학생의 학습에서 빠지고 조별 모델 비교에만 쓰인다.
export function setEvalSet(cloudId, value) {
  return db.collection(DATA_COLLECTION).doc(cloudId).update({ evalSet: !!value });
}

// ---------- 조별 모델 비교 ----------
// 학생 한 명당 모델 하나(문서 id = uid). 같은 조 학생들은 같은 조 이름을 쓴다.
const GROUP_COLLECTION = 'walkRunGroupModels';

export async function publishGroupModel(group, model) {
  const json = JSON.stringify(model);
  if (json.length > 900000) throw new Error('모델이 너무 큽니다. 로지스틱 회귀를 쓰거나 데이터를 줄이세요.');
  await db.collection(GROUP_COLLECTION).doc(auth.currentUser.uid).set({
    group,
    json,
    type: model.type,
    labels: model.labels,
    nRecordings: model.nRecordings ?? 0,
    testAccuracy: model.metrics?.test?.accuracy ?? null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

export async function loadGroupModels() {
  const snap = await db.collection(GROUP_COLLECTION).orderBy('updatedAt', 'desc').limit(60).get();
  return snap.docs.map(d => {
    const v = d.data();
    return { uid: d.id, group: v.group, model: JSON.parse(v.json), testAccuracy: v.testAccuracy, updatedAt: v.updatedAt?.toMillis?.() ?? 0 };
  });
}

export function deleteGroupModel(uid) {
  return db.collection(GROUP_COLLECTION).doc(uid).delete();
}
