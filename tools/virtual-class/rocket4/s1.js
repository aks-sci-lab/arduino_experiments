const T = await S.teacher({ width: 3840, height: 2160 });
await T.goto(S.ROOT + 'index.html'); await T.waitForTimeout(600);
await S.tap(T, '교사'); await S.tap(T, '수업 진행 화면'); await T.waitForTimeout(500);
const b = await S.buttons(T);
return { url: T.url(), shot: await S.shot(T, '내수업'), b, seen: (await S.seen(T)).slice(0, 1500) };
