# 데이터 가공 실험실 예시 자료 (심박수 원본)

- `projects/data-lab.html` 의 '예시 자료'가 이 폴더의 CSV 를 불러온다.
- 파일은 `tests/fixtures/heart-rate/` 와 **같은 내용**(선생님 실측 4회차, 갤럭시 Z 플립6, 2026-11-17, 이름 없음). 사이트 배포에서 `tests/**` 는 빠지므로 여기에 복사해 둔다. 시험 `tests/data-lab-math.test.cjs` 가 두 곳이 같은지 확인한다.
- 문제 있는 예시(아주 어두움·손가락 떨어짐·노출 출렁임)는 파일 없이 `js/data-lab-math.js` 의 `makeExample` 이 시뮬레이션으로 만든다.
