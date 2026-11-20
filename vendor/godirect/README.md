# Vernier Go Direct 공개 연결 도구 (godirect-js)

선생님이 산 **Vernier Go Direct®** 무선 센서를 선생님이 만든 실험(`projects/custom-lab.html`)에서 블루투스로 쓰기 위한, 버니어가 공개한 JavaScript 도구다.

- 파일: `godirect.min.umd.js` (76,287 바이트, 전역 이름 `godirect`)
- SHA-256: `f4ed6c4785d9bfdf3f22c5ecf14af91460fcbd9db7ea380a0dc9a79ae9e2547d`
- 원본: npm `@vernier/godirect@1.8.3` 의 `dist/godirect.min.umd.js` (https://registry.npmjs.org/@vernier/godirect/-/godirect-1.8.3.tgz, 2026-11-20 받음). 소스: https://github.com/VernierST/godirect-js
- 라이선스: **BSD 3-Clause** (Copyright (c) 2019, Vernier Software & Technology). 원문은 같은 폴더의 `LICENSE`. 다시 배포할 때 저작권 표시·라이선스 원문을 함께 둬야 하고, 버니어 이름으로 우리 사이트를 홍보·보증하는 데 쓰면 안 된다 (화면에는 "Vernier Go Direct 센서" 라는 제품 이름만 설명으로 쓰고 로고·상표 그림은 쓰지 않는다).
- 버니어 안내: 버니어 제품은 교육용이며 의료·산업 측정용이 아니다.
- 쓰는 곳: `js/vernier-godirect.js` 가 버니어 센서를 고른 실험에서만 이 파일을 불러온다.

사이트에 직접 둔 까닭: 외부 주소를 늘리지 않고, 판이 몰래 바뀌지 않게(버전 고정), 학교 망에서 CDN 이 막혀도 동작하게.
새 판으로 바꿀 때는 파일·위 SHA-256·`LICENSE` 를 함께 고치고 `tests/vernier-godirect.test.cjs` 를 돌린다.
