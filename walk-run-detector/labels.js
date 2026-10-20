// 라벨 목록: 기본(걷기·뛰기) + 학생이 추가한 라벨 + 학급 데이터에서 만난 라벨
// 라벨 id는 문자열이다. 기본 라벨은 'walk', 'run'이고, 추가한 라벨은 이름 자체가 id다.
// (학급 데이터에 라벨 이름이 그대로 실려 있어서 별도 동기화 없이도 서로 이해할 수 있다.)

export const BUILTIN = [
  { id: 'walk', name: '걷기' },
  { id: 'run', name: '뛰기' },
];
export const MAX_LABELS = 6;
export const MAX_NAME_LEN = 10;
const KEY = 'wr-custom-labels-v1';

let custom = [];
let seen = [];     // 데이터에서 발견했지만 목록에는 없던 라벨 (메모리에만 보관)

try {
  const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
  if (Array.isArray(raw)) custom = raw.filter(x => typeof x === 'string');
} catch { /* 저장소를 쓸 수 없으면 빈 목록 */ }

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(custom)); } catch { /* 무시 */ }
}

export const labelIds = () => [...BUILTIN.map(b => b.id), ...custom, ...seen.filter(s => !custom.includes(s))];

export function labelName(id) {
  return BUILTIN.find(b => b.id === id)?.name ?? id;
}

// 색 번호는 목록 순서로 정한다 (style.css의 --c0 ~ --c7)
export const labelIndex = id => Math.max(0, labelIds().indexOf(id));
export const labelColorVar = id => `--c${labelIndex(id) % 8}`;

// 기록에 쓰인 라벨을 목록에 반영한다.
export function observe(ids) {
  const known = new Set(labelIds());
  let changed = false;
  for (const id of ids) {
    if (typeof id === 'string' && id && !known.has(id)) {
      seen.push(id);
      known.add(id);
      changed = true;
    }
  }
  return changed;
}

// 반환: 오류 메시지 또는 null
export function validateNewLabel(raw) {
  const name = raw.trim();
  if (!name) return '라벨 이름을 입력하세요.';
  if (name.length > MAX_NAME_LEN) return `라벨 이름은 ${MAX_NAME_LEN}자 이하로 쓰세요.`;
  if (/[,/\\"<>]/.test(name)) return '라벨 이름에 , / \\ " < > 는 쓸 수 없습니다.';
  if (labelIds().length >= MAX_LABELS) return `라벨은 최대 ${MAX_LABELS}개까지 만들 수 있습니다.`;
  const taken = labelIds().some(id => id === name || labelName(id) === name);
  if (taken) return '이미 있는 라벨입니다.';
  return null;
}

export function addLabel(raw) {
  const err = validateNewLabel(raw);
  if (err) return err;
  custom.push(raw.trim());
  persist();
  return null;
}

export function removeLabel(id) {
  custom = custom.filter(x => x !== id);
  seen = seen.filter(x => x !== id);
  persist();
}

export const isBuiltin = id => BUILTIN.some(b => b.id === id);
export const isCustom = id => custom.includes(id);
