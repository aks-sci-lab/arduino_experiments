# 센서 기반 웹실험실

웹사이트: **https://aks-sci-lab.web.app**

**Bluetooth 지원 제어 보드 + Waveshare Pico-Environment-Sensor**와 Thonny/MicroPython을 사용합니다.
환경(VOC 포함)·가속도·조도·자외선 실험 페이지에서 BLE 데이터를 표시하고 기록합니다.
Pico에 `main.py`, `bme280.py`, `imu.py`, `extra_sensors.py` 네 파일을 저장하세요.
[설치·프로토콜·측정 단위 안내](firmware/pico2w-environment/README.md)를 확인하세요.

조도는 lux, 자외선은 UVS 원시 counts, VOC는 Sensirion 공식 알고리즘으로 브라우저에서 계산한 VOC Index(1~500)입니다.
VOC Index 100은 학습한 평소 수준이며 ppm 농도나 건강·안전 기준이 아닙니다. 자외선 원시 값도 UV Index로 해석하지 마세요.
Cloud에는 실험 요약만 저장하며 VOC Index와 원시 값은 CSV/로컬 회차로 보관합니다.

공식 Gas Index Algorithm v3.2.0의 고정소수점 C 코드는 `vendor/sensirion/`에 BSD-3-Clause 고지와 함께 보존합니다.
고정한 원본 커밋·파일 해시·빌드된 WebAssembly 해시는 `vendor/sensirion/SOURCE.json`에 기록합니다.
환경·VOC 통합 측정은 최신 `main.py`와 `extra_sensors.py`를 장치에 업로드해야 합니다.
통합 펌웨어는 같은 BME280 측정으로 SGP40을 보정하고 1초마다 환경·VOC 원시 데이터를 함께 보냅니다.
브라우저는 독립 WebAssembly 인스턴스로 매 입력을 처리하며, 선택한 1/2/5초 간격은 기록에만 적용합니다.
초기 60초와 알고리즘 초기화 중에는 Index를 표시하지 않습니다. 연결 해제·데이터 누락 시 학습을 초기화하며,
이전 SRAW 전용 회차는 Index로 자동 변환하지 않습니다.
이전 VOC 주소는 환경 모니터로 이동합니다. 기존 `voc_sensor_trials`는 유지하며
`projects/voc-lab.html?legacy=1` 보관 페이지에서 확인·CSV 내보내기가 가능합니다.
기존 환경 회차에서 VOC Index가 없는 구간은 빈칸으로 유지합니다.

수증기 분압은 Magnus 식의 액체 물 기준 포화수증기압에 상대습도/100을 곱한 값(kPa)입니다.
기존 상수 0.61094·17.625·243.04 및 단위 변환은 적절하여 유지합니다.
화면에는 포화수증기압과 혼동하지 않도록 '수증기 분압 (계산)'으로 표시하며,
-40~50°C를 벗어난 고온에서는 근사식 외삽임을 알립니다. 영하에서도 액체 물 기준이며 얼음 기준이 아닙니다.

가속도 200Hz는 장치 RAM에 10개 샘플(약 50ms)을 모아 BLE 묶음으로 전송합니다.
협상된 MTU에 따라 분할하고 웹에서 순번을 검증·재조립하며, 측정 중지 시 마지막 미완성 묶음도 전송 완료를 확인합니다.
25/50/100Hz는 기존 샘플별 전송을 유지합니다. 최신 `main.py`·`imu.py` 업로드가 필요합니다.
하드웨어 FIFO 수집은 아니며 BLE 전송 중 지연과 ±16g 범위 초과를 제거하지는 못합니다.
재빌드는 WebAssembly 대상 Clang으로 `node tools/build-voc-index.cjs` 또는 Zig 0.13.0으로
`node tools/build-voc-index.cjs --zig <zig 실행 파일>`을 실행합니다. `--reference`를 추가하면
동일한 공식 C 코드를 네이티브 실행 파일로 빌드하여 비교용 테스트 데이터를 생성합니다.

---

## 🔦 말루스 법칙 실험 (스마트폰 카메라)

`projects/malus-law.html` — 레이저를 편광판과 종이 스크린에 통과시키고, 스마트폰 카메라로 스크린 밝기를 편광판 각도별로 측정해 `I = I₀cos²θ` 를 검증합니다. (https 주소 필요)

- 카메라 실시간 측정(프레임 평균) 또는 **사진 불러오기**(iOS 등 노출 고정 미지원 기기용)
- 측정 영역(ROI) 선택, 채널(R/G/B/휘도) 선택, 감마 보정, 포화 경고, 배경(주변광) 제거
- `I = A·cos²(θ−θ₀)+B` 최소제곱 적합, R²·소광비·cos² 직선성 그래프, CSV 저장
- 계산 로직: `js/malus-math.js`, UI: `js/malus-law.js`
- 구글 스프레드시트: "표 복사"로 붙여넣기, 또는 본인 시트에 Apps Script 웹 앱을 배포하고 URL을 입력해 전송 (페이지 5번 카드 참고)
- 각자의 구글 계정으로 로그인해 본인 드라이브에 새 스프레드시트를 만들어 내보내기 (`js/malus-sheets.js`, drive.file 권한만 사용)

## ✏️ 문항 출제용 그림·그래프 (선생님용)

2026-10-30 별도 저장소 [`aks-sci-lab/figure-maker`](https://github.com/aks-sci-lab/figure-maker) 로 옮겼습니다. 새 주소: https://aks-sci-lab.github.io/figure-maker/
`projects/figure-maker.html` 은 예전 주소로 들어온 사람을 새 주소로 넘기는 페이지이며, 브라우저에 자동 저장된 그림도 주소 `#` 뒤에 담아 함께 넘깁니다.
