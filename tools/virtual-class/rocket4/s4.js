const T = P.T;
await S.tap(T, '다음 → 🎬 발표 보기'); await T.waitForTimeout(2500);
return { url: T.url().replace(S.ROOT,''), shot: await S.shot(T, '발표-첫장-4K100'), b: await S.buttons(T), seen: (await S.seen(T)).slice(0, 1500), doc: S.app.db.docs.get([...S.app.db.docs.keys()].find(k=>/^labClasses\/[^/]+$/.test(k))) };
