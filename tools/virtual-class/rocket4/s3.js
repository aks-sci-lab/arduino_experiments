const T = P.T;
await T.fill('#inTeams', '5');
await S.tap(T, '✨ 수업 만들기'); await T.waitForTimeout(900);
const link = await T.getAttribute('#outLink', 'href').catch(()=>null);
return { url: T.url().replace(S.ROOT,''), link, shot: await S.shot(T, '큰QR-4K100'), b: await S.buttons(T), seen: (await S.seen(T)).slice(0, 1200) };
