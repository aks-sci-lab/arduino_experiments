const T=P.T; await T.evaluate(()=>scrollTo(0,0)); await T.click('#btnDone'); await T.waitForTimeout(1500);
const d=S.app.db.docs.get("labClasses/cuqatmrtg2qcey3c2fu3pff2");
return { done:d.done, seen:(await S.seen(T)).slice(0,400), log: S.log.slice(-8) };
