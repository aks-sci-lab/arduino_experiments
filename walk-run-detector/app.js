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
import { initAccounts, signIn, signOut, loadAIConfig } from './accounts.js';

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

async function onLogin() {
  try {
    await signIn();
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    alert('로그인에 실패했습니다: ' + (e.message || e));
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
  initAccounts(onAccountChange);
  loadSavedLayout();
}

init();
