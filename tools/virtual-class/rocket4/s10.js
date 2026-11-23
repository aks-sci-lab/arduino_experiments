const T=P.T; const o={};
await T.click('#btnPNext'); await T.waitForTimeout(1200);
await T.click('#btnPNext'); await T.waitForTimeout(1200);
o.think4 = (await S.seen(T)).slice(0,300);
await T.click('#btnPOpen'); await T.waitForTimeout(1500);
o.afterOpen = (await S.seen(T)).slice(0,600); o.shot = await S.shot(T,'1차시열기');
o.doc = JSON.parse(JSON.stringify(S.app.db.docs.get("labClasses/cuqatmrtg2qcey3c2fu3pff2")));
return o;
