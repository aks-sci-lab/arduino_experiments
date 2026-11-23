# MediaPipe 얼굴 랜드마크 모델 (얼굴 심박 개발 페이지용)

- 파일: `face_landmarker.task` (3,758,596 바이트)
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- 원본: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task (2026-11-17 받음)
- 라이선스: Apache License 2.0 (Google MediaPipe, https://github.com/google-ai-edge/mediapipe , 모델 카드 참고)
- 쓰는 곳: `js/face-hr-lab.js` 의 `MP_MODEL` (사이트 안 주소 `../vendor/mediapipe/face_landmarker.task`)

선생님 결정(2026-11-17): 외부 주소(storage.googleapis.com)를 늘리지 않고, 학교 망에서 막혀도 동작하도록 모델 파일을 사이트에 직접 둔다.
새 판으로 바꿀 때는 파일과 위 SHA-256 을 함께 고친다.

# MediaPipe 얼굴 찾기 모델 (필름통 로켓 도전 장면 얼굴 가리기, 2026-11-23)

- 파일: `blaze_face_short_range.tflite` (229,746 바이트)
- SHA-256: `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f`
- 원본: https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite (2026-11-23 받음)
- 라이선스: Apache License 2.0 (Google MediaPipe)
- 쓰는 곳: `js/film-rocket-face.js` 의 `MODEL` — 팀 폰이 녹화하는 캔버스에 얼굴을 찾아 캐릭터로 덮는다. 얼굴 찾기를 못 쓰면 도전 장면을 보내지 않는다
