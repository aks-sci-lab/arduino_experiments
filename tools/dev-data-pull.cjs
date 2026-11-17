#!/usr/bin/env node
/* 개발 데이터 가져오기 (GitHub Actions dev-data-collect.yml 이 매시간 실행, 손으로도 됨)
   선생님 시트의 Apps Script(10판) devExport 를 관리 열쇠로 불러, 지난번 뒤에 쌓인 측정을 파일로 저장한다.
     <폴더>/YYYY-MM-DD/<id>.csv   원본(밝기 등) — 페이지의 'CSV 내려받기' 와 같은 모양
     <폴더>/YYYY-MM-DD/<id>.json  결과·기기 정보 등 나머지
     <폴더>/index.json            측정 목록(요약)
     state.json                   마지막으로 받은 시각(since)
   환경 변수: DEV_SHEET_URL(웹 앱 주소), DEV_ADMIN_KEY(관리 열쇠), DEV_OUT(저장할 폴더, 기본 현재 폴더)
   열쇠는 화면·기록에 찍지 않는다. 사용법: docs/dev-data.md */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const FOLDERS = { heartrate: 'heart-rate', facehr: 'face-hr' };
const safeId = s => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || 'item';
// 한국 시각 날짜 (폴더 이름)
const kstDate = ms => new Date((isFinite(ms) ? ms : Date.now()) + 9 * 3600 * 1000).toISOString().slice(0, 10);

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; } }
function writeFile(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }

// data.raw = { t: [...], R: [...] } (같은 길이의 열) 이면 CSV 로
function rawToCsv(raw) {
    if (!raw || typeof raw !== 'object') return '';
    const keys = Object.keys(raw).filter(k => Array.isArray(raw[k]));
    if (!keys.length) return '';
    const n = Math.max(...keys.map(k => raw[k].length));
    const cell = v => (v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
    const lines = [keys.join(',')];
    for (let i = 0; i < n; i++) lines.push(keys.map(k => cell(raw[k][i])).join(','));
    return lines.join('\n') + '\n';
}

// 받은 줄 하나 → 파일들, index 항목
function saveItem(out, it) {
    const folder = FOLDERS[it.exp] || safeId(it.exp);
    const id = safeId(it.id);
    const ms = Date.parse(it.measuredAt) || Date.parse(it.timestamp);
    const day = kstDate(ms);
    let data = it.data;
    if (typeof data === 'string') { try { data = data ? JSON.parse(data) : {}; } catch (e) { data = { text: data }; } }
    if (!data || typeof data !== 'object') data = {};
    const csv = typeof data.csv === 'string' ? data.csv : rawToCsv(data.raw);
    const rest = Object.assign({}, data); delete rest.csv;
    if (csv && typeof data.csv !== 'string') delete rest.raw;   // raw 로 만든 CSV 가 있으면 JSON 에는 겹쳐 두지 않음
    const base = path.join(folder, day, id);
    if (csv) writeFile(path.join(out, base + '.csv'), csv.endsWith('\n') ? csv : csv + '\n');
    writeFile(path.join(out, base + '.json'), JSON.stringify({ id: it.id, exp: it.exp, measuredAt: it.measuredAt, savedAt: it.timestamp, device: it.device, summary: it.summary || {}, data: rest }, null, 2) + '\n');
    return { folder, entry: { id: it.id, exp: it.exp, measuredAt: it.measuredAt, savedAt: it.timestamp, device: it.device, summary: it.summary || {},
        csv: csv ? base.split(path.sep).join('/') + '.csv' : null, json: base.split(path.sep).join('/') + '.json' } };
}

async function postJson(fetchFn, url, body) {
    const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) { throw new Error('서버 응답이 JSON 이 아닙니다 (HTTP ' + r.status + '): ' + text.slice(0, 120)); }
}

async function pull(o) {
    const out = o.out || '.', fetchFn = o.fetch || fetch;
    if (!o.url || !o.key) return { skipped: true, reason: 'DEV_SHEET_URL 또는 DEV_ADMIN_KEY 가 없음' };
    const stateFile = path.join(out, 'state.json');
    const state = readJson(stateFile, { since: '' });
    const indexes = {};
    let since = state.since || '', got = 0;
    for (let round = 0; round < 50; round++) {
        const r = await postJson(fetchFn, o.url, { action: 'devExport', key: o.key, since });
        if (!r || !r.ok) throw new Error('devExport 실패: ' + ((r && r.error) || '알 수 없음'));
        for (const it of r.items || []) {
            const { folder, entry } = saveItem(out, it);
            const idx = indexes[folder] || (indexes[folder] = readJson(path.join(out, folder, 'index.json'), { items: [] }));
            if (!Array.isArray(idx.items)) idx.items = [];
            idx.items = idx.items.filter(x => !(x.id === entry.id && x.exp === entry.exp)).concat([entry]);
            if (it.timestamp > since) since = it.timestamp;
            got++;
        }
        if (!r.more || !(r.items || []).length) break;
    }
    const now = new Date().toISOString();
    for (const folder of Object.keys(indexes)) {
        const idx = indexes[folder];
        idx.items.sort((a, b) => String(a.measuredAt).localeCompare(String(b.measuredAt)));
        idx.updated = now; idx.count = idx.items.length;
        writeFile(path.join(out, folder, 'index.json'), JSON.stringify(idx, null, 2) + '\n');
    }
    // 새 것이 있을 때만 적는다 (없을 때마다 커밋이 생기지 않게)
    if (got) writeFile(stateFile, JSON.stringify({ since, lastRun: now, lastGot: got, total: (state.total || 0) + got }, null, 2) + '\n');
    return { got, since };
}

module.exports = { pull, saveItem, rawToCsv, kstDate };

if (require.main === module) {
    pull({ url: process.env.DEV_SHEET_URL, key: process.env.DEV_ADMIN_KEY, out: process.env.DEV_OUT || '.' }).then(r => {
        if (r.skipped) console.log('건너뜀: ' + r.reason);
        else console.log('새 측정 ' + r.got + '개 (마지막 ' + (r.since || '없음') + ')');
        if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'got=' + (r.got || 0) + '\n');
    }).catch(e => {
        // 열쇠가 문구에 섞이지 않게
        const msg = String(e && e.message || e).split(String(process.env.DEV_ADMIN_KEY || '\u0000')).join('***');
        console.error('실패: ' + msg); process.exit(1);
    });
}
