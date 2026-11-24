const r = L.in(L.dir + '/in-2.json');
// 학생이 바꿔 둔 lesson 은 교사 쪽 값으로: 교사 화면이 다음 조작 때 다시 씀
const T=P.T; await T.waitForTimeout(6000);
const box = async () => T.evaluate(() => { const e=[...document.querySelectorAll('*')].find(x=>/지금 폰으로 답해요/.test(x.textContent) && x.children.length>2 && x.offsetParent); return e? e.innerText.replace(/\n+/g,' | ').slice(0,420):null; });
const o={r:r.set};
o.gas = await box();
for (let k=0;k<3;k++){ await T.click('#btnPNext'); await T.waitForTimeout(900); }
await T.click('#btnPNext'); await T.waitForTimeout(900); // safety -> control
await T.click('#btnPNext'); await T.waitForTimeout(3500);
o.control = await box(); o.cShot = await S.shot(T,'control-답모음');
o.lesson = S.app.db.docs.get("labClasses/cuqatmrtg2qcey3c2fu3pff2").lesson;
return o;
