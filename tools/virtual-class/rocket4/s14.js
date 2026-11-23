const T=P.T; const o={};
for (let k=0;k<4;k++){ await T.click('#btnPNext'); await T.waitForTimeout(900); }
await T.waitForTimeout(3000);
o.do = (await S.seen(T)).slice(0,900); o.doShot = await S.shot(T,'do-t1-측정장');
await T.click('#btnPNext'); await T.waitForTimeout(1500);
o.s7 = (await S.seen(T)).slice(0,600); o.s7Shot = await S.shot(T,'같은조건-다른시간');
await T.click('#btnPBoard'); await T.waitForTimeout(3000);
o.board = (await S.seen(T)).slice(0,2500); o.bShot = await S.shot(T,'결과판-1차시');
return o;
