// ✏ 화면 편집 모드 (교사 전용): 오타 수정, 문구 숨기기, 블록·탭 순서 바꾸기
// 편집 내용은 Firebase(walkRunLayout/current)에 저장되어 모든 사용자 화면에 똑같이 적용된다.
//
// 설계 요점
// - 편집할 수 있는 것은 "문구(굵게·기울임 정도의 서식만)", "숨김", "형제 요소 사이의 순서"뿐이다. 스크립트·속성은 넣을 수 없다.
// - 요소는 "태그 + 클래스 + 원래 문구"의 해시로 식별한다. 코드가 업데이트되어 구조가 조금 바뀌어도 문구가 같으면 편집이 유지되고,
//   대상이 사라진 편집은 조용히 무시된다.
// - JS가 내용을 바꾸는 요소(id가 있는 상태 문구, 결과 표 등)는 편집 대상이 아니다.

import { $, state, readLocal, writeLocal } from './state.js';
import { loadLayout, saveLayout, firebaseReady } from './accounts.js';

const CACHE_KEY = 'wr-layout-v1';
const MAX_JSON = 150000;

// ---------- 서식 정리: 허용한 태그만 남긴다 ----------
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'CODE', 'SMALL', 'BR']);

export function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out = document.createElement('div');
  const walk = (node, into) => {
    for (const n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) {
        into.appendChild(document.createTextNode(n.textContent));
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(n.tagName)) continue;
        if (ALLOWED.has(n.tagName)) {
          const el = document.createElement(n.tagName.toLowerCase());
          walk(n, el);
          into.appendChild(el);
        } else {
          walk(n, into);   // 허용하지 않는 태그는 벗기고 안의 글자만 남긴다
        }
      }
    }
  };
  walk(doc.body, out);
  return out.innerHTML;
}

// ---------- 요소 식별 ----------
const BLOCK_PARENTS = '.card, .subpanel, .stats, .btn-row, .form-grid, nav.tabs, .subtabs, details';
const NO_CONTROLS = 'input, select, textarea, canvas, table, button, details, img, a, label';
const TEXT_SELECTORS = 'p, h1, h2, h3, h4, summary, li, legend, .notice, footer, .stat .k, .stat .u, .tabs > button, .subtabs > button';

const info = new Map();        // el → { eid, text, block, html(원본), parentEid }
const byEid = new Map();       // eid → el
const origOrder = new Map();   // parentEid → [원래 순서의 자식 el]
const parentEls = new Map();   // parentEid → parent el
const counters = new Map();

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function makeEid(el) {
  const base = `${el.tagName}|${[...el.classList].filter(c => !c.startsWith('wr-')).join('.')}|${el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)}`;
  const n = (counters.get(base) ?? 0) + 1;
  counters.set(base, n);
  return `${hash(base)}.${n}`;
}

const isTextEditable = el => el.matches(TEXT_SELECTORS)
  && (!el.id || el.matches('.tabs > button, .subtabs > button'))
  && !el.querySelector(NO_CONTROLS);

const isBlock = el => {
  const p = el.parentElement;
  return !!p && p.matches(BLOCK_PARENTS) && !el.matches('.subtabs, .subpanel, summary') && !el.closest('#edit-bar');
};

function scan() {
  const scope = [...document.querySelectorAll('header h1, nav.tabs > button, main *, footer')];
  for (const el of scope) {
    if (el.closest('.account, #edit-bar, dialog')) continue;
    const text = isTextEditable(el);
    const block = isBlock(el);
    if (!text && !block) continue;
    const eid = makeEid(el);
    const rec = { eid, text, block, html: text ? el.innerHTML : null, parentEid: null };
    info.set(el, rec);
    byEid.set(eid, el);
    el.dataset.eid = eid;
  }
  // 블록의 부모와 원래 순서를 기록한다.
  for (const [el, rec] of info) {
    if (!rec.block) continue;
    const parent = el.parentElement;
    let pe = info.get(parent)?.eid;
    if (!pe) {
      pe = parent.id ? `#${parent.id}`
        : parent.dataset.sub ? `sp:${parent.dataset.group}.${parent.dataset.sub}`
          : `${hash(parent.tagName + '|' + parent.className + '|' + (parent.firstElementChild?.textContent || '').slice(0, 40))}.p${[...parent.parentElement.children].indexOf(parent)}`;
    }
    rec.parentEid = pe;
    parentEls.set(pe, parent);
    if (!origOrder.has(pe)) origOrder.set(pe, []);
    origOrder.get(pe).push(el);
  }
}

// ---------- 편집 내용 적용 ----------
let saved = emptyLayout();     // 저장된(공개 중인) 편집 내용
let draft = null;              // 편집 중인 내용

function emptyLayout() { return { text: {}, hidden: [], order: {} }; }

function normalize(raw) {
  const out = emptyLayout();
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw.text || {})) if (typeof v === 'string') out.text[k] = sanitize(v);
    out.hidden = (Array.isArray(raw.hidden) ? raw.hidden : []).filter(x => typeof x === 'string');
    for (const [k, v] of Object.entries(raw.order || {})) if (Array.isArray(v)) out.order[k] = v.filter(x => typeof x === 'string');
  }
  return out;
}

function apply(layout) {
  // 1) 원래대로
  for (const [el, rec] of info) {
    if (rec.text && el.innerHTML !== rec.html) el.innerHTML = rec.html;
    el.classList.remove('wr-hidden');
  }
  for (const [pe, children] of origOrder) {
    const parent = parentEls.get(pe);
    const tracked = new Set(children);
    const now = [...parent.children].filter(c => tracked.has(c));
    if (now.every((c, i) => c === children[i])) continue;   // 이미 원래 순서면 건드리지 않는다
    for (const c of children) parent.appendChild(c);
    for (const c of [...parent.children]) if (!tracked.has(c)) parent.appendChild(c);
  }
  // 2) 편집 적용
  for (const [eid, html] of Object.entries(layout.text)) {
    const el = byEid.get(eid);
    if (el && info.get(el).text) el.innerHTML = html;
  }
  for (const eid of layout.hidden) byEid.get(eid)?.classList.add('wr-hidden');
  for (const [pe, list] of Object.entries(layout.order)) {
    const parent = parentEls.get(pe);
    if (!parent) continue;
    for (const eid of list) {
      const el = byEid.get(eid);
      if (el && el.parentElement === parent) parent.appendChild(el);
    }
  }
  // 순서를 바꾼 부모에서, 편집 대상이 아닌 자식(JS가 나중에 만든 것)은 맨 뒤로 보낸다.
  for (const pe of Object.keys(layout.order)) {
    const parent = parentEls.get(pe);
    if (!parent) continue;
    const tracked = new Set(origOrder.get(pe) || []);
    for (const c of [...parent.children]) if (!tracked.has(c)) parent.appendChild(c);
  }
}

// ---------- 불러오기 · 저장 ----------
function parseJson(json) {
  try { return normalize(JSON.parse(json)); } catch { return emptyLayout(); }
}

function useLayout(json) {
  saved = parseJson(json);
  apply(saved);
}

export async function loadSavedLayout() {
  if (!firebaseReady()) return;
  try {
    const json = await loadLayout();
    writeLocal(CACHE_KEY, json ?? '');
    useLayout(json ?? '');
  } catch { /* 불러오지 못하면 캐시(또는 원래 화면)를 그대로 쓴다 */ }
}

// ---------- 편집 모드 UI ----------
let editing = false;
let selected = null;

const labelOf = el => (el.textContent.replace(/\s+/g, ' ').trim().slice(0, 28) || el.tagName.toLowerCase());

function editableOf(target) {
  for (let el = target; el && el !== document.body; el = el.parentElement) if (info.has(el)) return el;
  return null;
}

function select(el) {
  selected?.classList.remove('wr-selected');
  selected = el;
  el?.classList.add('wr-selected');
  renderToolbar();
}

function renderToolbar() {
  const rec = selected && info.get(selected);
  $('eb-selected').textContent = rec ? `선택: ${labelOf(selected)}` : '바꿀 문구나 블록을 누르세요';
  $('eb-text').disabled = !rec?.text;
  $('eb-parent').disabled = !(selected && editableOf(selected.parentElement));
  const hidden = rec && draft.hidden.includes(rec.eid);
  $('eb-hide').disabled = !rec?.block;
  $('eb-hide').textContent = hidden ? '👁 다시 보이기' : '🙈 숨기기';
  const sibs = rec?.block ? trackedSiblings(selected) : [];
  const i = sibs.indexOf(selected);
  $('eb-up').disabled = !(rec?.block && i > 0);
  $('eb-down').disabled = !(rec?.block && i >= 0 && i < sibs.length - 1);
  const touched = rec && (rec.eid in draft.text || hidden || (rec.parentEid && draft.order[rec.parentEid]?.includes(rec.eid)));
  $('eb-undo').disabled = !touched;
  $('eb-count').textContent = `편집 ${Object.keys(draft.text).length + draft.hidden.length + Object.keys(draft.order).length}건`;
}

function trackedSiblings(el) {
  return [...el.parentElement.children].filter(c => info.get(c)?.block);
}

function refresh() {
  apply(draft);
  renderToolbar();
}

// 비활성(disabled) 버튼은 클릭을 받지 못하므로(편집 중에는 CSS로 클릭이 부모에게 넘어가게 함),
// 클릭 위치와 겹치는 가장 작은 편집 대상을 직접 찾는다.
function pick(e) {
  let best = null;
  let bestArea = Infinity;
  for (const el of e.target.querySelectorAll('[data-eid]')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue;
    if (r.width * r.height < bestArea) { best = el; bestArea = r.width * r.height; }
  }
  return best ?? editableOf(e.target);
}

function onCapture(e) {
  if (!editing) return;
  if (e.target.closest('#edit-bar, #edit-dialog, .account')) return;
  const el = pick(e);
  const nav = e.target.closest('.tabs > button, .subtabs > button, summary');
  if (!nav) { e.preventDefault(); e.stopPropagation(); }   // 편집 중에는 버튼·입력이 동작하지 않는다 (탭 이동과 접기/펼치기는 허용)
  if (el) select(el);
}

function openTextDialog() {
  const rec = selected && info.get(selected);
  if (!rec?.text) return;
  const current = sanitize(selected.innerHTML);
  $('ed-text').value = current;
  $('ed-warn').hidden = !/<(?!\/?(b|strong|i|em|u|code|small|br)\b)/i.test(selected.innerHTML);
  $('edit-dialog').showModal();
  $('ed-text').focus();
}

function commitText() {
  const rec = info.get(selected);
  const html = sanitize($('ed-text').value);
  if (html === rec.html) delete draft.text[rec.eid];
  else draft.text[rec.eid] = html;
  $('edit-dialog').close();
  refresh();
}

function toggleHide() {
  const rec = info.get(selected);
  const i = draft.hidden.indexOf(rec.eid);
  if (i >= 0) draft.hidden.splice(i, 1);
  else draft.hidden.push(rec.eid);
  refresh();
}

function move(delta) {
  const rec = info.get(selected);
  const sibs = trackedSiblings(selected);
  const i = sibs.indexOf(selected);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= sibs.length) return;
  const eids = sibs.map(s => info.get(s).eid);
  [eids[i], eids[j]] = [eids[j], eids[i]];
  draft.order[rec.parentEid] = eids;
  refresh();
}

function undoOne() {
  const rec = info.get(selected);
  delete draft.text[rec.eid];
  draft.hidden = draft.hidden.filter(x => x !== rec.eid);
  // 순서는 같은 부모 전체가 한 묶음이라, 이 항목만 되돌리려면 그 부모의 순서 편집을 지운다.
  if (rec.parentEid && draft.order[rec.parentEid]?.includes(rec.eid)) delete draft.order[rec.parentEid];
  refresh();
}

function resetAll() {
  if (!confirm('모든 화면 편집(문구·숨김·순서)을 지우고 원래 화면으로 되돌릴까요? "저장"을 눌러야 학생 화면에 반영됩니다.')) return;
  draft = emptyLayout();
  refresh();
}

async function saveAndExit() {
  const json = JSON.stringify(draft);
  if (json.length > MAX_JSON) return setHint('편집 내용이 너무 큽니다. 일부를 되돌려 주세요.');
  $('eb-save').disabled = true;
  setHint('저장 중…');
  try {
    await saveLayout(json, state.account.user?.email);
    saved = normalize(draft);
    writeLocal(CACHE_KEY, json);
    exitEdit(false);
  } catch (e) {
    setHint('저장 실패: ' + (e.code === 'permission-denied' ? '권한이 없습니다. Firestore 규칙을 배포했는지 확인하세요.' : e.message));
  } finally {
    $('eb-save').disabled = false;
  }
}

const setHint = msg => { $('eb-hint').textContent = msg; };

export function enterEdit() {
  if (editing || !state.account.isAdmin) return;
  if (state.mode) { alert('측정이나 기록 중에는 편집할 수 없습니다. 먼저 정지하세요.'); return; }
  editing = true;
  draft = normalize(JSON.parse(JSON.stringify(saved)));
  document.body.classList.add('wr-editing');
  $('edit-bar').hidden = false;
  setHint('문구·블록을 눌러 선택하세요. 탭은 눌러서 이동할 수 있습니다.');
  $('btn-edit-mode').textContent = '✏ 편집 중';
  select(null);
}

export function exitEdit(revert = true) {
  if (!editing) return;
  editing = false;
  select(null);
  if (revert) apply(saved);
  document.body.classList.remove('wr-editing');
  $('edit-bar').hidden = true;
  $('btn-edit-mode').textContent = '✏ 화면 편집';
}

export const isEditing = () => editing;

export function initEdit() {
  scan();
  // 저장된 편집을 캐시에서 먼저 적용해 깜박임을 줄인다.
  const cached = readLocal(CACHE_KEY);
  if (cached) useLayout(cached);

  document.addEventListener('click', onCapture, true);
  $('btn-edit-mode').addEventListener('click', () => (editing ? exitEdit(true) : enterEdit()));
  $('eb-parent').addEventListener('click', () => { const p = selected && editableOf(selected.parentElement); if (p) select(p); });
  $('eb-text').addEventListener('click', openTextDialog);
  $('eb-hide').addEventListener('click', toggleHide);
  $('eb-up').addEventListener('click', () => move(-1));
  $('eb-down').addEventListener('click', () => move(1));
  $('eb-undo').addEventListener('click', undoOne);
  $('eb-reset').addEventListener('click', resetAll);
  $('eb-save').addEventListener('click', saveAndExit);
  $('eb-cancel').addEventListener('click', () => exitEdit(true));
  $('ed-ok').addEventListener('click', commitText);
  $('ed-cancel').addEventListener('click', () => $('edit-dialog').close());
}
