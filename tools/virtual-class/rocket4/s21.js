const T=P.T; const o={};
await T.click('#btnPExit'); await T.waitForTimeout(2000);
o.run = (await S.seen(T)).slice(0,1500); o.rShot = await S.shot(T,'진행화면-끝');
o.btn = (await S.buttons(T)).slice(0,40);
return o;
