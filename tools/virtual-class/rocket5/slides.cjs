// 지금 판의 로켓 설명 장 목록 (단계 · 제목 · key · mode) — 학생 폰을 건드리지 않고 파일만 읽음
//   node tools/virtual-class/rocket5/slides.cjs   (저장소 맨 위에서, VC_REPO 가 있으면 그 폴더)
'use strict';
const path = require('node:path'), fs = require('node:fs'), vm = require('node:vm');
const REPO = process.env.VC_REPO || path.join(__dirname, '..', '..', '..');
const { LessonContent } = require(path.join(REPO, 'js', 'lesson-slides.js'));
const box = { LessonContent }; box.window = box;
vm.runInNewContext(fs.readFileSync(path.join(REPO, 'js', 'lesson-content', 'rocket.js'), 'utf8'), box);
const d = LessonContent.get('rocket'); let n = 0;
for (const k of Object.keys(d.stages)) for (const s of d.stages[k]) console.log(String(++n).padStart(2), k.padEnd(6), s.title + (s.key ? '  [' + s.key + (s.mode ? ' · ' + s.mode : '') + ']' : (s.mode ? '  [· ' + s.mode + ']' : '')));
