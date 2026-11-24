const T=P.T; const o={};
await T.keyboard.press('Enter'); await T.waitForTimeout(2500);
o.seen = (await S.seen(T)).slice(0,700); o.shot = await S.shot(T,'1차시-gas');
const d=S.app.db.docs.get("labClasses/cuqatmrtg2qcey3c2fu3pff2"); o.stage=d.stage; o.lesson=d.lesson;
o.out = L.out('교사 차례 2: 1차시 열기');
return o;
