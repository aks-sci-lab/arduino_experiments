#!/usr/bin/env node
/* 학기 끝 자동 삭제 (2026-11-18): expireAt 가 지난 문서를 지운다. GitHub Actions(firestore-cleanup.yml)가 매일 실행.
   Firestore TTL 정책을 켜 두면 Firestore 가 스스로 지우지만(최대 하루쯤 늦음), TTL 을 켜지 못했을 때를 위해 같은 일을 한 번 더 한다.
   대상(컬렉션 그룹): items·raw·progress·aiAsk·reports·aiDesk·teams(labSpaces·labClasses 아래), labClasses, labClassCodes, devlog
   환경 변수: FIREBASE_SERVICE_ACCOUNT(사이트 배포와 같은 서비스 계정 JSON). DRY_RUN=1 이면 세기만 */
'use strict';
const GROUPS = ['items', 'raw', 'progress', 'aiAsk', 'reports', 'aiDesk', 'teams', 'labClasses', 'labClassCodes', 'devlog'];

// db 는 firebase-admin 의 Firestore (시험에서는 같은 모양의 가짜)
async function cleanup(db, now, opts) {
    opts = opts || {};
    const out = {};
    for (const g of GROUPS) {
        let n = 0;
        for (let round = 0; round < 50; round++) {
            const snap = await db.collectionGroup(g).where('expireAt', '<', now).limit(400).get();
            if (snap.empty) break;
            if (!opts.dryRun) { const b = db.batch(); snap.docs.forEach(d => b.delete(d.ref)); await b.commit(); }
            n += snap.size;
            if (opts.dryRun || snap.size < 400) break;
        }
        out[g] = n;
    }
    return out;
}
module.exports = { cleanup, GROUPS };

if (require.main === module) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) { console.log('건너뜀: FIREBASE_SERVICE_ACCOUNT 가 없음'); process.exit(0); }
    const admin = require('firebase-admin');
    const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
    cleanup(app.firestore(), admin.firestore.Timestamp.now(), { dryRun: process.env.DRY_RUN === '1' }).then(r => {
        console.log((process.env.DRY_RUN === '1' ? '지울 것(세기만): ' : '지움: ') + JSON.stringify(r));
    }).catch(e => { console.error('실패: ' + String(e && e.message || e).slice(0, 300)); process.exit(1); });
}
