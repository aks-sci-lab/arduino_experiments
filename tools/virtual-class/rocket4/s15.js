const T=P.T; const o={};
await T.click('#btnPGather'); await T.waitForTimeout(3000);
o.g = (await S.seen(T)).slice(0,1500); o.gShot = await S.shot(T,'모아보기-1차시');
return o;
