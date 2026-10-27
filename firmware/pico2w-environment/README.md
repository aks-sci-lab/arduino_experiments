# 센서 기반 웹실험실 (Thonny / MicroPython)

환경 실험 페이지: https://aks-sci-lab.web.app/projects/environment-lab.html

가속도 실험 페이지: https://aks-sci-lab.web.app/projects/accelerometer-lab.html

조도: https://aks-sci-lab.web.app/projects/light-lab.html

자외선: https://aks-sci-lab.web.app/projects/uv-lab.html

VOC Index는 환경 실험 페이지에 포함됩니다. 이전 VOC 회차 보관: https://aks-sci-lab.web.app/projects/voc-lab.html?legacy=1

## 하드웨어와 지원 범위

- **RP2350 기반 Bluetooth 지원 제어 보드**, Waveshare **Pico-Environment-Sensor**.
- 전원을 끈 상태에서 센서 보드의 Pico 헤더에 방향을 맞춰 결합합니다. 역방향으로 꽂지 마세요.
- 제조사 샘플 기준: **I2C0, SDA GP20 (물리 핀 26), SCL GP21 (물리 핀 27), BME280 주소 0x76**. 다른 일반 BME280 예제의 GP4/GP5 배선과 다릅니다.
- 환경 실험은 **BME280 온도·습도·기압과 SGP40 SRAW**를 함께 읽고 수증기 분압·VOC Index는 브라우저에서 계산합니다. 가속도 실험은 **IMU의 X/Y/Z 가속도**를 읽습니다. 별도 페이지에서 TSL2591 조도·LTR390 UVS 원시 카운트를 읽습니다. 자이로·자기장은 측정하지 않습니다.
- Wi-Fi SSID, 비밀번호, Firebase 키를 Pico에 넣지 않습니다. BLE로 가까운 컴퓨터/Android에 전송하며, 인터넷은 웹페이지와 Google 로그인/기록 제출에만 필요합니다.
- HTTPS 웹페이지에서 **PC/Android Chrome 또는 Edge**를 사용하세요. iPhone/iPad Safari, Firefox는 Web Bluetooth가 지원되지 않습니다. 컴퓨터에는 Bluetooth가 필요합니다.

## Thonny에서 업로드

1. 최신 Thonny를 설치합니다. 장치의 BOOTSEL 버튼을 누른 상태로 USB 데이터 케이블을 연결합니다.
2. [이 장치용 공식 MicroPython](https://micropython.org/download/RPI_PICO2_W/)에서 안정 버전 UF2를 받아 장치 드라이브로 복사합니다. 다른 보드용 또는 제조사 데모의 오래된 UF2를 사용하지 마세요.
3. Thonny의 **도구 → 옵션 → 인터프리터**에서 **MicroPython (Raspberry Pi Pico)** 및 장치의 USB 포트를 선택합니다.
4. 이 폴더의 `bme280.py`를 열어 **파일 → 다른 이름으로 저장 → Raspberry Pi Pico**의 루트에 `bme280.py`로 저장합니다.
5. `imu.py`, `extra_sensors.py`, `main.py`도 같은 방식으로 Pico 루트에 저장합니다. **네 파일 모두 필요**하며 기존 `main.py`는 교체하세요. 별도 라이브러리 설치는 필요 없습니다.
6. 실행(F5) 또는 전원을 다시 연결합니다. 셸에 I2C 주소 목록과 `[BLE] Advertising: PicoEnv-XXXX`가 표시됩니다.
7. 웹페이지에서 **Bluetooth 연결** → 동일한 `PicoEnv-XXXX` 선택 → 온도·습도·기압 표시 확인 → **측정 시작**을 누릅니다.

`main.py`는 전원이 들어오면 자동 실행됩니다. Thonny의 중지 버튼은 실행과 BLE를 멈추므로 웹 실험을 다시 하려면 F5 또는 전원 재연결이 필요합니다. 업로드 중에는 웹페이지에서 먼저 연결을 해제하세요.

## USB 시리얼 모니터로 동작 확인

가장 쉬운 방법은 **Thonny → 보기 → 셸**입니다. Pico 인터프리터/포트를 선택하고 `main.py`를 열어 F5를 누릅니다. 실행 중에도 로그가 나오므로 **중지 버튼을 누르지 마세요**.

일반 시리얼 터미널을 사용할 때는 Thonny를 먼저 닫아 USB 포트 점유를 해제하고, Pico의 COM 포트를 **115200 baud, 8N1, 흐름 제어 없음**으로 엽니다. USB CDC이므로 baud 값은 실제 전송 속도를 바꾸지 않습니다. 프로그램이 이미 실행 중이면 최대 5초 내 상태 로그가 표시됩니다. Ctrl+C는 프로그램과 BLE를 중지시킵니다. 그 경우 `>>>`에서 Ctrl+D로 소프트 리셋하여 `main.py`를 다시 실행합니다.

```text
[BOOT] Pico lab firmware starting
[BOOT] MicroPython: ...
[I2C] Initializing I2C0 SDA=GP20 SCL=GP21
I2C devices: ['0x29', '0x53', '0x59', '0x68', '0x76']
[SENSOR] BME280 OK at 0x76
[IMU] ICM-20948 driver=impact-200-v3 range=+/-16g VERIFIED ACCEL_CONFIG=0x1F scale=2048 LSB/g
[BLE] Initializing radio and GATT services
[BLE] Advertising: PicoEnv-XXXX | Select this name in the webpage.
[STATUS] uptime=5s name=PicoEnv-XXXX BLE=ADVERTISING mode=IDLE BME280=OK IMU=OK sent=0
```

주소 목록과 IMU 이름은 보드 리비전에 따라 다릅니다. 상태 로그는 **5초마다** 표시됩니다.

| 출력 | 의미 / 조치 |
|------|-------------|
| `[BOOT]`도 없고 상태 로그도 없음 | USB 데이터 케이블·COM 포트·인터프리터를 확인하고 main.py 실행 |
| `[FATAL] bluetooth module missing` | Pico **2 W** 전용 MicroPython UF2 설치 |
| `[FATAL] Upload ...` | 네 Python 파일을 Pico 루트에 저장 |
| `BME280=ERROR` / `IMU=ERROR` | 초기화 오류 로그 확인, 전원을 끄고 센서 방향·접촉 확인. 광고 자체는 계속할 수 있음 |
| `BLE=ADVERTISING` | Pico는 검색 대기 중. OS 설정의 페어링 창이 아니라 HTTPS 실험 페이지의 연결 버튼으로 검색 |
| `BLE=CONNECTED mode=IDLE` | 웹 연결됨, 아직 측정 안 함. 가속도 페이지의 측정 시작 클릭 |
| `[CMD] START:IMU` / `START:ENV_VOC` | 브라우저 명령 도착 |
| `mode=IMU` / `ENV`, `sent` 증가, `[DATA] ...` | 전송 API 호출이 성공한 샘플 수와 최근 값. 브라우저 수신까지 보장하지는 않음 |
| `[STOP]` / `[FATAL] Firmware stopped` | 프로그램 정지. 오류 해결 후 재실행 |

가속도 100 Hz에서 매 샘플을 출력하면 측정을 방해하므로 최근 값만 5초마다 출력합니다. `BME280=OK`/`IMU=OK`는 초기화 성공 여부이고, 측정 중 읽기 실패는 별도 오류 로그로 표시합니다.

## 데이터와 저장 흐름

Pico → BLE 알림 → 웹페이지의 조각 재조립/검증 → 실시간 표시 → 측정 시작 이후의 로그·그래프 → 회차 저장/CSV/클립보드/Cloud 제출.

```json
{"type":"env_voc","ts":12345,"seq":0,"data":{"temp":25.08,"humidity":45.2,"pressure":100.653,"sraw":25000,"warmup":60}}
```

- 각 JSON 메시지는 **줄바꿈 LF**로 끝나며, 기본 ATT MTU에서도 동작하도록 최대 20바이트 BLE 알림으로 분할됩니다.
- `ts`: Pico 부팅 후 경과 시간(ms), `seq`: 성공적으로 전송한 샘플 순번. 브라우저 시간축은 측정 시작 후 첫 샘플의 `ts`를 기준으로 합니다. 측정 도중 샘플링 속도를 바꿔도 시간축이 유지됩니다.
- `temp`: °C, `humidity`: %RH, `pressure`: **kPa** (Pa/1000). hPa 값을 그대로 보내지 않습니다.
- BLE UUID: 서비스 `19b10000-e8f2-537e-4f6c-d104768a1214`, 알림 `19b10001-e8f2-537e-4f6c-d104768a1214`, 쓰기 `19b10002-e8f2-537e-4f6c-d104768a1214`.
- 환경 브라우저 명령: `STOP`, `START:ENV_VOC`. 센서는 1초마다 수신하며 기록 간격 1/2/5초는 브라우저에서 선택합니다. 측정 시작/중지는 브라우저의 기록만 제어하고, 연결 중 실시간 센서 표시·VOC 학습은 계속됩니다. 이전 환경 전용 `START:ENV`, `STOP:ENV`, `SET_ENV_RATE:1000/2000/5000`도 펌웨어에서 계속 지원합니다.
- 수증기 분압(kPa)은 액체 물 기준 Magnus 포화압에 상대습도/100을 곱합니다. 상수 0.61094·17.625·243.04와 기존 계산을 유지하며, 25°C·50%RH에서 약 1.581kPa입니다. 영하에서도 얼음 기준이 아니고, 50°C 초과에서는 권장 근사 범위를 벗어난 외삽임을 알립니다.
- 센서 오류는 `{"type":"error","message":"..."}`로 전송하며 측정을 멈춥니다. 오류를 해결한 뒤 다시 연결하세요. 임의의 가짜 측정값으로 대체하지 않습니다.
- 로컬 회차는 기존 `env_sensor_trials` 저장 공간을 유지합니다. **Cloud DB 제출은 기존과 같이 회차 수·샘플 수 요약만 저장**하며 원시 측정값은 CSV 또는 로컬 회차로 보관하세요. 메인 페이지에서 Google 로그인 후 제출합니다.
- 이 BLE 연결은 암호화된 페어링/인증을 구현하지 않습니다. 민감한 데이터 전송이나 장거리 원격 측정용이 아닌 근거리 수업용입니다.

## 가속도계 실험

200Hz(목표 5ms 간격)를 선택할 수 있습니다. `impact-200-v3`의 `imu.py`와 최신 `main.py`를 장치에 덮어쓰고 재시작하세요.
200Hz에서는 ICM-20948 필터를 약 111Hz, MPU-9250/9255 필터를 약 99Hz로 설정하고 레지스터를 검증합니다.
25/50/100Hz는 기존 약 45~50Hz 필터를 유지합니다. 충격 반응 개선과 함께 잡음·앨리어싱 위험이 증가합니다.
웹페이지는 장치 타임스탬프로 평균 수신 Hz·목표 간격 이상 횟수·축별 15.9g 이상 포화 의심 개수를 표시합니다.
간격 이상은 누락 개수 확정값이 아니며, ±16g 초과 충격 또는 수 ms 최대값은 복원할 수 없습니다.
200Hz에서만 `START:IMU_BATCH`로 장치 RAM의 160바이트 버퍼에 원래 측정 시각과 축별 값을 10개 모은 뒤 약 50ms마다 전송합니다.
25/50/100Hz의 `START:IMU`는 기존 16바이트 샘플별 전송을 유지합니다.
BLE MTU는 최대 247로 설정하며 실제 협상된 MTU에 맞게 묶음을 분할합니다.
각 조각은 `<HBB`(uint16 묶음 순번, uint8 시작 샘플 번호, uint8 묶음 샘플 수) 헤더와 `<Ifff` 샘플들을 포함합니다.
기본 MTU 23에서는 20바이트 알림 10개, MTU 167 이상에서는 164바이트 알림 하나로 10개를 보낼 수 있습니다.
웹은 완성된 묶음만 반영하며 조각 순서 오류·누락은 명시적 오류로 처리하고 전체 묶음 누락 횟수를 별도로 표시합니다.
`STOP:IMU_BATCH`는 남은 1~9개도 보낸 후 JSON `imu_stopped` 확인을 전송합니다. 웹은 확인을 받은 뒤 기록을 종료하며 5초 내 확인이 없으면 불완전 가능성 오류를 표시합니다.
연결이 끊기면 남은 장치 버퍼는 폐기합니다. 새 측정에서 묶음 순번·웹 재조립 상태를 초기화합니다.
센서 하드웨어 FIFO/독립 수집 스레드 방식은 아니므로 묶음 전송 중에도 수집 지연이 발생할 수 있습니다.
실제 200Hz 유지 여부는 장치에서 확인해야 합니다. 최신 `main.py` 업로드 후 웹페이지를 새로고침하세요.

- 같은 GP20/GP21 I2C 버스의 **0x68** IMU를 사용합니다. 제품 설명은 ICM-20948, 일부 제조사 데모는 MPU-9250을 표시하므로 칩 ID로 ICM-20948 (`0xEA`) / MPU-9250 (`0x71`) / MPU-9255 (`0x73`)를 확인합니다. 다른 칩은 명시적 오류로 처리합니다.
- `PicoEnv-XXXX`에 연결해 **측정 시작**을 누릅니다. 환경 실험과 가속도 실험을 동시에 연결하지 마세요. 한 페이지에서 연결을 해제한 뒤 다른 페이지로 이동합니다.
- 최대 측정 범위는 **축별 ±16g**, 단위 **g**입니다. ICM-20948의 ACCEL_CONFIG는 `0x1F`, MPU-9250/9255의 ACCEL_CONFIG는 `0x18`로 설정하고 **2048 LSB/g**로 환산합니다. 기존 사용자는 **imu.py와 main.py를 교체**해야 합니다. 중력을 제거하지 않으므로 정지 상태의 Total은 약 1g입니다. 보드 축 방향은 장착 방향에 따라 달라집니다. 범위를 넓히면 작은 가속도의 분해능은 낮아집니다. 축별 범위를 넘는 충격은 포화되므로 정량 분석에 쓰지 마세요. Total은 세 축의 합성 크기여서 16g를 넘을 수 있습니다.
- `impact-200-v3` 드라이버는 초기화와 가속도 측정 시작 시 ACCEL_CONFIG를 **다시 읽어 범위 비트를 검증**합니다. 200Hz에서 ICM 설정은 0x17, 다른 속도는 0x1F이며 모두 ±16g입니다. MPU 범위는 0x18을 유지합니다. 필터 설정도 읽어서 검증합니다. 설정 실패 시 오류로 측정을 멈춥니다. 이전 main.py의 단순 `+/-16g` 출력만으로는 설정 성공을 확인할 수 없습니다. 새 파일을 장치에 저장하고 재시작해 `driver=impact-200-v3 ... VERIFIED` 로그를 확인하세요. Python 다운로드는 `no-store`로 제공하며 가속도 페이지의 다운로드 링크에는 버전 쿼리를 포함했습니다.
- 목표 속도는 **25/50/100/200 Hz**입니다. 기본 선택은 100Hz이고 200Hz는 충돌 비교용 선택입니다. 실제 전송 간격은 BLE 부하에 따라 달라지며 웹 시간축은 실제 Pico 시각을 사용합니다. ICM-20948 센서 내부 ODR은 요청 속도 이상으로 설정하고 요청 주기로 읽습니다.
- 명령은 `START:IMU`, `STOP`, `SET_IMU_RATE:25`, `SET_IMU_RATE:50`, `SET_IMU_RATE:100`입니다. 가속도 샘플은 전용 알림 UUID `19b10004-e8f2-537e-4f6c-d104768a1214`에서 **16바이트 `<Ifff`** (little-endian uint32 경과 ms + float32 X/Y/Z g)로 전송합니다. 기본 MTU에 맞게 한 알림당 한 샘플을 전송합니다.
- 오류는 기존 JSON 알림 UUID `19b10001-e8f2-537e-4f6c-d104768a1214`로 전송합니다. 가속도 페이지는 두 알림을 모두 구독합니다.
- 바이너리 시각은 uint32이므로 약 49.7일 후 래핑되며 브라우저는 래핑을 고려한 간격을 누적합니다. 측정 시작마다 첫 시각을 0초로 설정합니다.
- 기존 로컬 회차(`accelerometer_trials`), 회차별 시간 이동, 영역 편집, 다항식 피팅, CSV, Cloud 요약 제출을 유지합니다.

## 조도·자외선 실험과 환경 모니터의 VOC

같은 통합 main.py에서 **한 번에 한 센서 페이지**만 연결합니다. 별도 프로그램으로 교체할 필요는 없으나 처음 사용 시 extra_sensors.py 추가와 main.py 업데이트가 필요합니다.

| 페이지 | 센서 / 주소 | 출력 / 설정 |
|--------|-------------|-------------|
| 조도 | TSL2591 / 0x29 | lux, 광대역·IR 원시 counts, 이득. 100ms 적분, 25배 이득. 포화되면 1배로 낮춰 재측정하며 이후에는 1배 유지 |
| 자외선 | LTR390 / 0x53 | UVS 원시 counts. 20비트, 400ms 적분, 500ms 내부 갱신, 이득 3배 |
| VOC | SGP40 / 0x59 | SRAW 원시 신호, 안정화 남은 초, BME280 보정 온도·습도. 1초 주기 고정 |

- 조도 lux는 두 광학 채널과 TSL2591 환산 계수로 계산합니다. dark 값은 0 lux이며 ADC 포화 시 오류를 표시합니다. 절대값 정밀 교정은 수행하지 않았습니다. 이득이 바뀌면 원시 카운트를 그대로 비교하지 마세요.
- UV 원시 counts는 **UV Index, W/m²가 아닙니다**. gain/적분 시간과 광학 조건을 고정한 상대 비교용입니다. 포화 시 오류를 표시합니다.
- 웹페이지는 SRAW를 [Sensirion 공식 Gas Index Algorithm](https://github.com/Sensirion/gas-index-algorithm) v3.2.0 고정소수점 C 구현의 WebAssembly에 1초마다 입력하여 **VOC Index(1~500)**를 계산합니다. 100은 학습한 평소 VOC 수준이며, 높은 값은 상대적으로 VOC가 많은 방향입니다. **ppm 농도나 건강·안전 기준이 아닙니다**. 기본 학습 시정수는 12시간이며 처음 60초가 지났어도 기준은 계속 학습됩니다. CRC를 검사하며, 온도·습도 보정을 위해 BME280이 반드시 동작해야 합니다. BME280 오류 시 기본값으로 대체하지 않고 VOC 측정을 거부합니다.
- VOC 연결 직후부터 1초 주기로 읽고, 처음 60초와 알고리즘 초기화 구간에는 Index를 표시하지 않습니다. 준비 구간의 Index는 CSV에서 빈칸, 로컬 회차에서는 null이며 원시 신호·안정화 남은 초·보정 온습도·알고리즘 버전을 함께 저장합니다. 연결 해제/모드 변경 시 SGP40 히터를 끄고 다음 VOC 연결에서 안정화 시간을 다시 시작합니다.
- 알고리즘은 측정 기록 시작/중지와 관계없이 BLE 수신 동안 계속 학습합니다. 새 연결·재시도 시 초기화합니다. 순번 누락 또는 Pico 측정 시각 간격이 1초에서 250ms를 넘게 벗어나면 초기화 사실을 상태에 알리고 준비 구간을 다시 시작합니다. 누락된 입력을 복제·보간하지 않습니다. 이전 SRAW 전용 회차에는 기록 전 학습 이력이 없어 VOC Index를 자동 계산하지 않으며, CSV 원시 데이터만 유지합니다. 알고리즘 준비 실패·무효 SRAW는 명시적 센서 오류입니다.
- USB 로그는 추가 센서 초기화 결과와 현재 센서의 최근 데이터를 출력합니다.
- 통합 환경 페이지는 `START:ENV_VOC`로 환경·VOC를 1초마다 함께 읽습니다. 같은 BME280 값으로 SGP40을 보정하여 중복 측정을 피합니다. 최신 `main.py`와 `extra_sensors.py` 업로드·재시작이 필요합니다. JSON `type`은 `env_voc`, `data`는 `temp`, `humidity`, `pressure`, `sraw`, `warmup`입니다. 브라우저의 기록 간격은 1/2/5초이며 VOC 계산은 항상 1초입니다.
- 이전 `START:ENV`와 보관 페이지의 `START:VOC`는 계속 지원합니다. 명령은 `START:LIGHT`, `START:UV`, `START:VOC`, `SET_SENSOR_RATE:1000/2000/5000`, `STOP`입니다. VOC는 속도 명령과 관계없이 1초 주기로 읽습니다.
- JSON BLE 프레이밍은 기존과 동일합니다. `type`은 `light`/`uv`/`voc`, `data`는 각각 `{"lux":12.3,"full":100,"infrared":15,"gain":25}`, `{"uvRaw":100}`, `{"sraw":25000,"warmup":60,"temp":25,"humidity":50}`입니다.
- 환경·조도·자외선 페이지는 실시간 값·그래프·기록 시작/중지·CSV·로컬 회차 저장·Google 로그인 기반 Cloud 요약 제출을 제공합니다. Cloud에는 원시 값을 올리지 않습니다. 환경 CSV·클립보드·회차·그래프에 VOC Index를 포함하며 이전 환경 회차의 누락된 Index는 빈칸으로 유지합니다. 이전 VOC 주소는 환경 모니터로 이동하며 `?legacy=1` 보관 페이지에서는 기존 `voc_sensor_trials`를 내보낼 수 있습니다.
- 실시간 값과 측정 로그에는 조도(lux)·UVS 원시 counts·VOC Index 중 해당 페이지의 대표 지표만 표시합니다. 광학 채널·이득·VOC 원시 신호·보정 온습도는 화면에서 숨기되 CSV와 로컬 회차에 유지합니다. VOC 준비 안내는 기록 중에도 상태 메시지에 표시합니다.
- 유해가스, 용제, 강한 UV 광원을 사용하는 실험을 하지 마세요. 환기·일상 조명 등 안전한 조건에서 변화 비교로 활용하며 건강·안전 판단용이 아닙니다.

## 문제 해결

- `bluetooth` 모듈 없음: 보드가 Pico **2 W**인지, UF2가 **RPI_PICO2_W**용인지 확인합니다.
- I2C 목록에 `0x76` 없음/초기화 실패: 전원을 끄고 보드 방향·접촉·GP20/GP21 연결을 확인합니다.
- 장치 검색 안 됨: 위 USB 로그의 `BLE=ADVERTISING`을 확인합니다. PC/Android의 Bluetooth를 켜고 HTTPS Chrome/Edge에서 연결 버튼을 누릅니다. 다른 브라우저가 이미 연결했다면 먼저 해제합니다.
- 환경 페이지에서는 보이는데 가속도 페이지에서는 안 보임: 환경 페이지의 **연결 해제**를 누르고 `BLE=ADVERTISING`을 확인한 뒤 가속도 페이지에서 검색합니다. 이전 아두이노 검색 코드가 브라우저 캐시에 남았다면 **Ctrl+Shift+R**로 새로고침합니다. 가속도 페이지 준비 안내에 **BLE 검색 v2**가 보이면 수정된 페이지입니다. HTML/JS는 배포 이후 재검증하도록 Hosting 캐시 헤더를 설정했습니다.
- `GATT Server is disconnected. Cannot retrieve services`: 초기 연결의 서비스 검색 중 일시적인 끊김은 최대 두 번 재시도합니다. 실패가 계속되면 Pico 전원·거리·다른 페이지의 연결을 확인하세요. 측정 중 끊김은 자동으로 이어 기록하지 않고 현재 데이터를 보존하며 중지합니다.
- 새 연결을 시도하면 현재 페이지가 보유한 기존 연결·알림 구독을 먼저 정리하고 새 GATT 연결을 만듭니다. 측정 중이었다면 기록을 중지하고 데이터를 보존합니다. 다른 탭이나 다른 기기의 연결은 이 페이지에서 강제로 해제할 수 없으므로 해당 페이지에서 먼저 연결 해제하세요.
- 센서 페이지는 `pagehide` 이벤트(뒤로가기·페이지 이동·정상 탭 종료)에서 BLE를 해제하고 알림 구독을 정리합니다. 뒤로 돌아오면 새로 연결해야 합니다. 저장하지 않은 데이터는 페이지 폐기 시 사라질 수 있으므로 먼저 회차/CSV로 저장하세요. 브라우저 강제 종료나 OS 장애에서는 이벤트 실행을 보장할 수 없습니다.
- 조도·자외선·VOC 페이지의 연결 준비는 서비스 검색뿐 아니라 알림 등록·STOP·속도 설정·START 명령까지 포함해 일시적 GATT 끊김 시 최대 두 번 다시 수행합니다. 실패 시 해당 단계명을 표시합니다. Pico가 보내는 센서 오류나 페이지 이탈은 재시도하지 않습니다.
- 새 센서 페이지는 `multi-sensor-v2` BLE 수신 코드 버전을 확인합니다. 이전 환경 전용 수신 코드가 캐시에서 로드되면 연결 전에 새로고침 안내를 표시합니다. START 명령 완료 전에 센서 오류가 도착해 연결을 해제한 경우, 후속 GATT 오류가 아닌 최초 센서 오류를 표시합니다.
- 연결됨인데 표시 없음: 상태 메시지/Thonny 셸을 확인합니다. 센서 오류나 15초간 데이터 없음 시 기록이 중지됩니다. 원인을 해결하고 다시 연결합니다.
- Google 로그인 `auth/unauthorized-domain`: Firebase 프로젝트 `web-experiment-f9b24`의 Authentication 승인된 도메인에 `aks-sci-lab.web.app` 및 `aks-sci-lab.firebaseapp.com`을 추가합니다.

## 근거 자료

- [Waveshare 제품 설명](https://www.waveshare.com/pico-environment-sensor.htm)
- [제조사 위키](https://www.waveshare.com/wiki/Pico-Environment-Sensor) 및 [MicroPython 데모](https://files.waveshare.com/upload/f/f9/Pico-Environment-Sensor-code.7z)의 `BME280.py`/`test.py`에서 핀·주소 확인.
- [BME280 데이터시트](https://files.waveshare.com/upload/9/91/BME280_datasheet.pdf): 보정 계수 형식과 온도·기압·습도 보정 공식.

하드웨어 연결·실측·장시간 BLE 안정성은 실제 장치에서 확인해야 합니다. 소프트웨어 테스트는 센서 보정 계산과 BLE 메시지 재조립만 검증할 수 있습니다.

저장소 루트에서 소프트웨어 검증:

```powershell
py -m unittest discover -s tests -p test_pico_environment.py -v
node --test tests\*.test.cjs
```
