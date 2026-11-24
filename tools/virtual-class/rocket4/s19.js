const T=P.T; const o={};
await T.click('#btnPBoard'); await T.waitForTimeout(800);
await T.click('#btnPOpen'); await T.waitForTimeout(800); await T.keyboard.press('Enter'); await T.waitForTimeout(2500);
o.end = (await S.seen(T)).slice(0,700); o.shot = await S.shot(T,'정리-end-think');
const d=S.app.db.docs.get("labClasses/cuqatmrtg2qcey3c2fu3pff2"); o.stage=d.stage; o.lesson=d.lesson;
o.out = L.out('교사 차례 4: 정리 열기');
return o;
