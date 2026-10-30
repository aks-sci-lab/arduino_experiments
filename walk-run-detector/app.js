// 진입점: 화면 모듈을 이어 붙이고 로그인 상태를 관리한다.
import { $, state, emit } from './state.js';
import { initTabs, showTab, currentTab } from './tabs.js';
import { initJudge, renderModelLine } from './ui-judge.js';
import { initData } from './ui-data.js';
import { initExplore } from './ui-explore.js';
import { initTrain, loadClass } from './ui-train.js';
import { initCompare } from './ui-compare.js';
import { initAI } from './ui-ai.js';
import { initAdmin } from './ui-admin.js';
import { initEdit, loadSavedLayout, exitEdit } from './ui-edit.js';
import { initAccounts, signIn, signOut, loadAIConfig, authErrorMessage } from './accounts.js';

async function onAccountChange({ user, isAdmin, unavailable }) {
  const acc = state.account;
  acc.user = user;
  acc.isAdmin = isAdmin;
  acc.unavailable = !!unavailable;
  acc.aiConfig = null;
  acc.aiState = user ? 'loading' : 'signedOut';
  if (!user) state.cloudRecs = [];
  renderAccount();
  if (!user) return;
  if (!state.model) loadClass(true);
  const r = await loadAIConfig();
  if (acc.user?.uid !== user.uid) return; // 로딩 중 계정이 바뀌면 결과를 버린다
  acc.aiState = r.status;
  acc.aiConfig = r.status === 'ok' ? r.config : null;
  renderAccount();
}

function renderAccount() {
  const { user, isAdmin } = state.account;
  $('btn-login').hidden = !!user;
  $('btn-logout').hidden = !user;
  $('account-info').textContent = user ? `${user.displayName || user.email}${isAdmin ? ' · 관리자' : ''}` : '';
  $('tab-admin').hidden = !isAdmin;
  $('btn-class-publish').hidden = !isAdmin;
  $('btn-edit-mode').hidden = !isAdmin;
  if (!isAdmin) exitEdit(true);
  if (!isAdmin && currentTab() === 'admin') showTab('measure');
  emit('account');
}

function showLoginMessage(msg) {
  $('login-msg').textContent = msg || '';
  $('login-msg').hidden = !msg;
}

// 카카오톡·네이버·인스타 같은 앱 안의 브라우저에서는 구글이 로그인을 막는다 (QR/메신저 링크로 들어온 경우에 흔함)
const IN_APP = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|; wv\)/i;

async function onLogin() {
  showLoginMessage('');
  try {
    await signIn();
  } catch (e) {
    const msg = authErrorMessage(e);
    if (msg) showLoginMessage(msg);
  }
}

function init() {
  initEdit();          // 화면이 바뀌기 전에 원래 화면을 기록해 둔다
  initJudge();
  initData();
  initExplore();
  initTrain();
  initCompare();
  initAI();
  initAdmin();
  $('btn-login').addEventListener('click', onLogin);
  $('btn-logout').addEventListener('click', () => signOut());
  initTabs();
  renderModelLine();
  initAccounts(onAccountChange, e => showLoginMessage(authErrorMessage(e)));
  if (IN_APP.test(navigator.userAgent)) {
    showLoginMessage('앱 안의 브라우저에서는 구글 로그인이 막힙니다. 메뉴(⋮)에서 "다른 브라우저로 열기"로 Chrome 또는 Safari에서 열어 주세요.');
  }
  loadSavedLayout();
}

init();
