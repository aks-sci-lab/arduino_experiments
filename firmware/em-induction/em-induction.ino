/*
 * 전자기 유도 실험용 전압·전류 센서 (ADS1115 기반)
 *
 * 배선 (Arduino Uno/Nano/ESP32 공통, I2C)
 *   ADS1115  VDD -> 5V(또는 3.3V)   GND -> GND
 *            SDA -> A4 (ESP32: GPIO21)   SCL -> A5 (ESP32: GPIO22)
 *            ADDR -> GND (주소 0x48)
 *   전압 센서: 코일 양 끝      -> A0(+), A1(-)   (코일 유도기전력, 차동 측정)
 *   전류 센서: 션트저항 양 끝  -> A2(+), A3(-)   (코일과 직렬로 연결한 저항)
 *
 * 출력(115200 baud, 한 줄에 한 샘플, CSV):
 *   t_ms,vcoil_uV,vshunt_uV
 * 웹앱(projects/em-induction.html)이 이 값을 받아 전압(mV)과 전류(mA)로 변환한다.
 *
 * 명령(시리얼로 수신):
 *   G0~G5  PGA 배율 선택 (0:±6.144V 1:±4.096V 2:±2.048V 3:±1.024V 4:±0.512V 5:±0.256V)
 *   S      현재 설정 출력
 */
#include <Wire.h>

const uint8_t ADS_ADDR = 0x48;
const uint8_t REG_CONV = 0x00;
const uint8_t REG_CONFIG = 0x01;

// PGA 설정값(CONFIG 비트 11:9)과 그에 대응하는 1 LSB 전압(µV)
const uint16_t PGA_BITS[6] = {0x0000, 0x0200, 0x0400, 0x0600, 0x0800, 0x0A00};
const float LSB_UV[6] = {187.5, 125.0, 62.5, 31.25, 15.625, 7.8125};

uint8_t pga = 5;  // 기본 ±0.256V : 코일 기전력(수 mV~수백 mV)에 적합

// 차동 입력 MUX 비트(14:12): 000 = A0-A1, 011 = A2-A3
const uint16_t MUX_COIL = 0x0000;
const uint16_t MUX_SHUNT = 0x3000;

void writeConfig(uint16_t mux) {
  // 단일 변환 시작(OS=1) | MUX | PGA | 단일샷 모드 | 475SPS | 비교기 비활성
  uint16_t cfg = 0x8000 | mux | PGA_BITS[pga] | 0x0100 | 0x0080 | 0x0003;
  Wire.beginTransmission(ADS_ADDR);
  Wire.write(REG_CONFIG);
  Wire.write(cfg >> 8);
  Wire.write(cfg & 0xFF);
  Wire.endTransmission();
}

bool conversionDone() {
  Wire.beginTransmission(ADS_ADDR);
  Wire.write(REG_CONFIG);
  Wire.endTransmission();
  Wire.requestFrom(ADS_ADDR, (uint8_t)2);
  if (Wire.available() < 2) return false;
  uint16_t v = (Wire.read() << 8) | Wire.read();
  return v & 0x8000;
}

int16_t readConversion() {
  Wire.beginTransmission(ADS_ADDR);
  Wire.write(REG_CONV);
  Wire.endTransmission();
  Wire.requestFrom(ADS_ADDR, (uint8_t)2);
  if (Wire.available() < 2) return 0;
  return (int16_t)((Wire.read() << 8) | Wire.read());
}

int16_t measure(uint16_t mux) {
  writeConfig(mux);
  uint32_t start = micros();
  while (!conversionDone()) {
    if (micros() - start > 5000) break;  // 통신 오류 시 멈춤 방지
  }
  return readConversion();
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  Wire.setClock(400000);
  Serial.println("# EM-INDUCTION READY");
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == 'G') {
      int n = Serial.parseInt();
      if (n >= 0 && n <= 5) pga = n;
    } else if (c == 'S') {
      Serial.print("# PGA=");
      Serial.print(pga);
      Serial.print(" LSB_uV=");
      Serial.println(LSB_UV[pga], 4);
    }
  }

  int16_t rawV = measure(MUX_COIL);
  int16_t rawI = measure(MUX_SHUNT);

  Serial.print(millis());
  Serial.print(',');
  Serial.print((long)(rawV * LSB_UV[pga]));
  Serial.print(',');
  Serial.println((long)(rawI * LSB_UV[pga]));
}
