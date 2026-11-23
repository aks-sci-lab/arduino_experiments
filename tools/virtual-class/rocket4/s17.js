const r = L.in(L.dir + '/in-3.json'); const T=P.T; await T.waitForTimeout(6000);
const box = async () => T.evaluate(() => { const e=[...document.querySelectorAll('*')].find(x=>/지금 폰으로 답해요/.test(x.textContent) && x.children.length>2 && x.offsetParent); return e? e.innerText.replace(/\n+/g,' | ').match(/답한 팀.*?🔧/)?.[0]:null; });
const o={r:r.set}; o.action = await box();
await T.click('#btnPNext'); await T.waitForTimeout(800); await T.click('#btnPNext'); await T.waitForTimeout(3500); o.mass = await box();
for (let k=0;k<6;k++){ await T.click('#btnPNext'); await T.waitForTimeout(700); }
o.at = (await S.seen(T)).slice(0,80);
await T.click('#btnPBoard'); await T.waitForTimeout(3000);
o.board = (await S.seen(T)).slice(0,2200); o.bShot = await S.shot(T,'결과판-2차시');
return o;
