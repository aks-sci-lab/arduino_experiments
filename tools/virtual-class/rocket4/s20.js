L.in(L.dir+'/in-4.json'); L.in(L.dir+'/in-4b.json'); const T=P.T; await T.waitForTimeout(6000);
const box = async () => T.evaluate(() => { const e=[...document.querySelectorAll('*')].find(x=>/지금 폰으로 답해요/.test(x.textContent) && x.children.length>2 && x.offsetParent); return e? e.innerText.replace(/\n+/g,' | ').match(/답한 팀.*?🔧/)?.[0]:null; });
const o={}; o.endThink = await box();
await T.click('#btnPNext'); await T.waitForTimeout(800); await T.click('#btnPNext'); await T.waitForTimeout(3500);
o.endCause = await box(); o.ecShot = await S.shot(T,'end-cause-답모음');
await T.click('#btnPBoard'); await T.waitForTimeout(3000);
o.board = (await S.seen(T)).slice(0,3000); o.bShot = await S.shot(T,'결과판-끝');
return o;
