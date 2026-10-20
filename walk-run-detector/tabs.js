// 큰 탭(상단)과 하위 탭(각 화면 안)
import { $, state, emit } from './state.js';

export const TABS = ['measure', 'data', 'explore', 'train', 'compare', 'ai', 'theory', 'admin'];

export function showTab(name) {
  if (!TABS.includes(name)) name = 'measure';
  if (name === 'admin' && !state.account.isAdmin) name = 'measure';
  for (const t of TABS) {
    const selected = t === name;
    $('tab-' + t).setAttribute('aria-selected', String(selected));
    $('tab-' + t).tabIndex = selected ? 0 : -1;
    $('panel-' + t).hidden = !selected;
  }
  try { history.replaceState(null, '', '#' + name); } catch { /* 무시 */ }
  $('tab-' + name).scrollIntoView({ inline: 'center', block: 'nearest' });
  emit('tab', name);
}

export const currentTab = () => TABS.find(t => !$('panel-' + t).hidden);

export function showSub(group, sub) {
  for (const b of document.querySelectorAll(`.subtabs[data-group="${group}"] button`)) {
    b.setAttribute('aria-selected', String(b.dataset.sub === sub));
  }
  for (const p of document.querySelectorAll(`.subpanel[data-group="${group}"]`)) p.hidden = p.dataset.sub !== sub;
  emit('subtab', { group, sub });
}

export const currentSub = group => document.querySelector(`.subtabs[data-group="${group}"] button[aria-selected="true"]`)?.dataset.sub;

// 보이는 탭 사이를 방향키로 이동
function arrowKeys(container, tabs, select) {
  container.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const visible = tabs().filter(b => !b.hidden);
    const cur = visible.findIndex(b => b.getAttribute('aria-selected') === 'true');
    const next = visible[(cur + (e.key === 'ArrowRight' ? 1 : visible.length - 1)) % visible.length];
    select(next);
    next.focus();
  });
}

export function initTabs() {
  for (const t of TABS) $('tab-' + t).addEventListener('click', () => showTab(t));
  const nav = $('tab-measure').parentElement;
  arrowKeys(nav, () => [...nav.querySelectorAll('[role=tab]')], b => showTab(b.id.replace('tab-', '')));
  for (const bar of document.querySelectorAll('.subtabs')) {
    const group = bar.dataset.group;
    for (const b of bar.querySelectorAll('button')) b.addEventListener('click', () => showSub(group, b.dataset.sub));
    arrowKeys(bar, () => [...bar.querySelectorAll('button')], b => showSub(group, b.dataset.sub));
  }
  showTab(location.hash.slice(1));
}
