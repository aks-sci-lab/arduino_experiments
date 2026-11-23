const T = P.T;
await T.click('#btnPNext'); await T.waitForTimeout(1500);
return { shot: await S.shot(T, '발표-force-물음'), seen: (await S.seen(T)).slice(0, 1500) };
