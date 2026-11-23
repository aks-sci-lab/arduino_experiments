const T = P.T;
await S.tap(T, '구글 계정으로 로그인'); await T.waitForTimeout(800);
await S.tap(T, '새 수업'); await T.waitForTimeout(500);
await T.selectOption('#inExp', { label: '🚀 발포비타민 필름통 로켓 (가족 행사)' }).catch(e=>null);
await T.waitForTimeout(400);
return { shot: await S.shot(T, '새수업', true), b: await S.buttons(T), opts: await T.$$eval('#inExp option', o=>o.map(x=>x.textContent)).catch(()=>null) };
