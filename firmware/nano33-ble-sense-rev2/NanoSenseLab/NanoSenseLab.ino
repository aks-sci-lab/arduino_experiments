// 센서 기반 실험실 — Arduino Nano 33 BLE Sense Rev2 펌웨어
//
// 보드에 들어 있는 센서를 블루투스(BLE)로 웹 페이지에 보낸다.
//   - 가속도: BMI270  (라이브러리 기본값 ±4 g, 1초에 100번)
//   - 온도·습도: HS3003
//   - 기압: LPS22HB (kPa)
//
// 블루투스 이름은 칩 주소 끝 4자리로 자동으로 정해진다 (예: NanoSense-A3F1).
// 보드마다 이름을 손으로 바꿀 필요가 없다.
//
// 통신 약속(UUID, 명령, 값 모양)은 Pico 센서 보드 펌웨어
// (firmware/pico2w-environment/main.py)와 같게 맞췄다.
//   명령 (CMD 특성에 글자로 쓰기)
//     START:ENV            환경 값(온도·습도·기압) 보내기 시작
//     START:IMU            가속도 보내기 시작
//     STOP, STOP:ENV       멈추기
//     SET_SENSOR_RATE:ms   환경 값 간격 1000, 2000, 5000 ms (SET_ENV_RATE: 도 됨)
//     SET_IMU_RATE:hz      가속도 25, 50, 100 Hz (200 Hz 는 이 보드에서 안 됨)
//     GET_BOARD            보드 이름·칩 주소·펌웨어 버전 알려 주기
//     IDENTIFY             보드 LED 깜빡이기
//   환경 값 (TX 특성, JSON 한 줄, 20바이트씩 나눠 보냄)
//     {"type":"env","ts":밀리초,"seq":번호,"data":{"temp":°C,"humidity":%,"pressure":kPa}}
//   가속도 (ACCEL 특성, 측정 하나에 16바이트, 리틀 엔디언)
//     uint32 밀리초, float x, float y, float z (단위 g)

#include <ArduinoBLE.h>
#include <Arduino_BMI270_BMM150.h>
#include <Arduino_HS300x.h>
#include <Arduino_LPS22HB.h>

static const char *FIRMWARE_VERSION = "2026.11-nano-rev2";
static const char *SERVICE_UUID = "19b10000-e8f2-537e-4f6c-d104768a1214";
static const char *TX_UUID = "19b10001-e8f2-537e-4f6c-d104768a1214";
static const char *CMD_UUID = "19b10002-e8f2-537e-4f6c-d104768a1214";
static const char *ACCEL_UUID = "19b10004-e8f2-537e-4f6c-d104768a1214";

BLEService labService(SERVICE_UUID);
BLECharacteristic txCharacteristic(TX_UUID, BLENotify, 20);
BLECharacteristic cmdCharacteristic(CMD_UUID, BLEWrite | BLEWriteWithoutResponse, 64);
BLECharacteristic accelCharacteristic(ACCEL_UUID, BLENotify, 16);

enum Mode { MODE_ENV, MODE_IMU };
void startMode(Mode next);  // 아두이노 IDE 가 함수 원형을 enum 보다 앞에 두지 않도록 직접 적음

bool imuOk = false;
bool humidityOk = false;
bool pressureOk = false;
bool streaming = false;
Mode mode = MODE_ENV;
unsigned long envInterval = 1000;  // ms
int imuRate = 100;                 // Hz (BMI270 라이브러리 기본 출력 속도 100 Hz 에서 골라 씀)
int imuSkip = 0;                   // 100 Hz 중 몇 개를 건너뛸지
int imuSkipCount = 0;
unsigned long nextEnvAt = 0;
unsigned long messageSequence = 0; // JSON 메시지 번호 (환경 값·보드 정보 함께 늘어남)
unsigned long sentSamples = 0;
unsigned long nextStatusAt = 0;
int blinkToggles = 0;
unsigned long nextBlinkAt = 0;
bool wasConnected = false;
char deviceName[20] = "NanoSense-0000";
char chipId[18] = "";

// 명령은 BLE 이벤트 안에서 받아 두고 loop() 에서 차례로 처리한다 (최대 4개).
const int COMMAND_QUEUE = 4;
char commandQueue[COMMAND_QUEUE][65];
int commandHead = 0;
int commandCount = 0;

void sendText(const char *text) {
  // 기본 MTU(23)에서도 되도록 20바이트씩 나눠 보낸다. 한글이 중간에서 잘려도
  // 웹 페이지가 이어 붙여 읽는다.
  size_t length = strlen(text);
  for (size_t offset = 0; offset < length; offset += 20) {
    if (!BLE.connected()) return;
    size_t part = length - offset < 20 ? length - offset : 20;
    txCharacteristic.writeValue((const uint8_t *)text + offset, part);
    delay(8);
    BLE.poll();
  }
}

void sendError(const char *message) {
  char line[200];
  snprintf(line, sizeof(line), "{\"type\":\"error\",\"message\":\"%s\"}\n", message);
  sendText(line);
  Serial.print("[ERROR] ");
  Serial.println(message);
}

void sendBoard() {
  char line[220];
  snprintf(line, sizeof(line),
           "{\"type\":\"board\",\"ts\":%lu,\"seq\":%lu,\"data\":{\"name\":\"%s\",\"board\":null,"
           "\"id\":\"%s\",\"fw\":\"%s\",\"saved\":false,\"model\":\"nano33-ble-sense-rev2\"}}\n",
           millis(), messageSequence, deviceName, chipId, FIRMWARE_VERSION);
  messageSequence++;
  sendText(line);
}

void sendEnvironment() {
  if (!humidityOk || !pressureOk) {
    sendError(!humidityOk ? "온도·습도 센서(HS3003)를 찾지 못했습니다. 보드가 Rev2 인지 확인하세요."
                          : "기압 센서(LPS22HB)를 찾지 못했습니다. 보드를 다시 켜 보세요.");
    streaming = false;
    return;
  }
  float temperature = HS300x.readTemperature();
  float humidity = HS300x.readHumidity();
  float pressure = BARO.readPressure();  // 기본 단위 kPa
  if (isnan(temperature) || isnan(humidity) || isnan(pressure)) {
    sendError("센서 값을 읽지 못했습니다. 보드를 다시 켜 보세요.");
    streaming = false;
    return;
  }
  // 소수 출력은 String 으로 만든다 (보드에 따라 printf 의 %f 가 꺼져 있을 수 있음).
  String line = "{\"type\":\"env\",\"ts\":" + String(millis()) + ",\"seq\":" + String(messageSequence)
              + ",\"data\":{\"temp\":" + String(temperature, 2) + ",\"humidity\":" + String(humidity, 2)
              + ",\"pressure\":" + String(pressure, 3) + "}}\n";
  messageSequence++;
  sendText(line.c_str());
  sentSamples++;
}

void sendAcceleration() {
  float x, y, z;
  if (!IMU.accelerationAvailable()) return;
  if (!IMU.readAcceleration(x, y, z)) return;
  if (imuSkipCount > 0) {
    imuSkipCount--;
    return;
  }
  imuSkipCount = imuSkip;
  uint8_t packet[16];
  uint32_t now = millis();
  memcpy(packet, &now, 4);  // nRF52840 은 리틀 엔디언
  memcpy(packet + 4, &x, 4);
  memcpy(packet + 8, &y, 4);
  memcpy(packet + 12, &z, 4);
  accelCharacteristic.writeValue(packet, sizeof(packet));
  sentSamples++;
}

void startMode(Mode next) {
  if (next == MODE_IMU && !imuOk) {
    sendError("가속도 센서(BMI270)를 찾지 못했습니다. 보드가 Rev2 인지 확인하세요.");
    streaming = false;
    return;
  }
  mode = next;
  streaming = true;
  nextEnvAt = millis();
  imuSkipCount = 0;
  // 멈춰 있던 동안 쌓인 가속도 값은 버린다.
  float x, y, z;
  while (imuOk && IMU.accelerationAvailable()) IMU.readAcceleration(x, y, z);
}

bool startsWith(const char *text, const char *prefix) {
  return strncmp(text, prefix, strlen(prefix)) == 0;
}

void handleCommand(const char *command) {
  Serial.print("[CMD] ");
  Serial.println(command);
  if (strcmp(command, "START:ENV") == 0) {
    startMode(MODE_ENV);
  } else if (strcmp(command, "START:IMU") == 0) {
    startMode(MODE_IMU);
  } else if (strcmp(command, "STOP") == 0 || strcmp(command, "STOP:ENV") == 0) {
    streaming = false;
  } else if (startsWith(command, "SET_SENSOR_RATE:") || startsWith(command, "SET_ENV_RATE:")) {
    long value = atol(strchr(command, ':') + 1);
    if (value == 1000 || value == 2000 || value == 5000) {
      envInterval = value;
      if (nextEnvAt > millis() + envInterval) nextEnvAt = millis() + envInterval;
    } else {
      sendError("Rate must be 1000, 2000 or 5000 ms");
    }
  } else if (startsWith(command, "SET_IMU_RATE:")) {
    long value = atol(strchr(command, ':') + 1);
    if (value == 25 || value == 50 || value == 100) {
      imuRate = value;
      imuSkip = 100 / value - 1;
      imuSkipCount = 0;
    } else if (value == 200) {
      sendError("이 보드의 가속도는 1초에 100번까지만 측정합니다. 100 Hz 이하로 고르세요.");
    } else {
      sendError("IMU rate must be 25, 50 or 100 Hz");
    }
  } else if (strcmp(command, "GET_BOARD") == 0) {
    sendBoard();
  } else if (strcmp(command, "IDENTIFY") == 0) {
    blinkToggles = 20;
  } else if (startsWith(command, "SET_BOARD:") || strcmp(command, "CLEAR_BOARD") == 0) {
    sendError("이 보드의 이름은 칩 주소로 자동으로 정해져 바꿀 수 없습니다.");
  } else if (strcmp(command, "START:IMU_BATCH") == 0) {
    sendError("이 보드는 묶음 전송(200 Hz)을 지원하지 않습니다. START:IMU 를 쓰세요.");
  } else if (startsWith(command, "START:")) {
    sendError("이 보드에는 그 센서가 없습니다. 온도·습도·기압(ENV)과 가속도(IMU)만 됩니다.");
  } else {
    sendError("Unknown command");
  }
}

void onCommandWritten(BLEDevice central, BLECharacteristic characteristic) {
  if (commandCount >= COMMAND_QUEUE) {
    Serial.println("[BLE] Command queue full; command dropped");
    return;
  }
  char *slot = commandQueue[(commandHead + commandCount) % COMMAND_QUEUE];
  int length = characteristic.valueLength();
  if (length > 64) length = 64;
  memcpy(slot, characteristic.value(), length);
  slot[length] = '\0';
  // 뒤쪽 공백·줄바꿈 지우기
  while (length > 0 && isspace((unsigned char)slot[length - 1])) slot[--length] = '\0';
  commandCount++;
}

void onConnected(BLEDevice central) {
  streaming = false;
  commandCount = 0;
  blinkToggles = 6;
  Serial.print("[BLE] Connected: ");
  Serial.println(central.address());
}

void onDisconnected(BLEDevice central) {
  streaming = false;
  commandCount = 0;
  Serial.println("[BLE] Disconnected; advertising again");
}

void makeDeviceName() {
  // BLE.address() 는 "aa:bb:cc:dd:ee:ff" 모양이다. 끝 두 바이트(ee, ff)로 이름을 만든다.
  String address = BLE.address();
  address.toUpperCase();
  address.toCharArray(chipId, sizeof(chipId));
  String compact = address;
  compact.replace(":", "");
  String suffix = compact.length() >= 4 ? compact.substring(compact.length() - 4) : String("0000");
  snprintf(deviceName, sizeof(deviceName), "NanoSense-%s", suffix.c_str());
}

void setConnectedLed(bool on) {
  // 파란 LED 는 LOW 일 때 켜진다. 연결되어 있는 동안 켜 둔다.
  digitalWrite(LEDB, on ? LOW : HIGH);
}

void setup() {
  Serial.begin(115200);
  // USB 없이 보조배터리로도 동작하도록 시리얼 창을 기다리지 않는다 (최대 2초만 기다림).
  unsigned long waitUntil = millis() + 2000;
  while (!Serial && millis() < waitUntil) {}
  Serial.println("[BOOT] Nano 33 BLE Sense Rev2 lab firmware starting");

  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(LEDR, OUTPUT);
  pinMode(LEDG, OUTPUT);
  pinMode(LEDB, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);
  digitalWrite(LEDR, HIGH);
  digitalWrite(LEDG, HIGH);
  setConnectedLed(false);

  imuOk = IMU.begin();
  humidityOk = HS300x.begin();
  pressureOk = BARO.begin();
  Serial.print("[SENSOR] BMI270=");
  Serial.print(imuOk ? "OK" : "ERROR");
  Serial.print(" HS3003=");
  Serial.print(humidityOk ? "OK" : "ERROR");
  Serial.print(" LPS22HB=");
  Serial.println(pressureOk ? "OK" : "ERROR");
  if (imuOk) {
    Serial.print("[IMU] accelerometer sample rate = ");
    Serial.print(IMU.accelerationSampleRate());
    Serial.println(" Hz, range = +/-4 g (library default)");
  }

  if (!BLE.begin()) {
    Serial.println("[FATAL] Bluetooth start failed. Unplug and plug the board again.");
    // 빨간 LED 를 깜빡이며 멈춘다.
    while (true) {
      digitalWrite(LEDR, LOW);
      delay(200);
      digitalWrite(LEDR, HIGH);
      delay(200);
    }
  }
  makeDeviceName();
  BLE.setLocalName(deviceName);
  BLE.setDeviceName(deviceName);
  BLE.setAdvertisedService(labService);
  labService.addCharacteristic(txCharacteristic);
  labService.addCharacteristic(cmdCharacteristic);
  labService.addCharacteristic(accelCharacteristic);
  BLE.addService(labService);
  cmdCharacteristic.setEventHandler(BLEWritten, onCommandWritten);
  BLE.setEventHandler(BLEConnected, onConnected);
  BLE.setEventHandler(BLEDisconnected, onDisconnected);
  BLE.advertise();
  Serial.print("[BLE] Advertising: ");
  Serial.print(deviceName);
  Serial.println(" | Select this name in the webpage.");
}

void loop() {
  BLE.poll();
  unsigned long now = millis();
  bool connected = BLE.connected();
  if (connected != wasConnected) {
    wasConnected = connected;
    setConnectedLed(connected);
    if (!connected) streaming = false;
  }

  while (commandCount > 0) {
    char command[65];
    strcpy(command, commandQueue[commandHead]);
    commandHead = (commandHead + 1) % COMMAND_QUEUE;
    commandCount--;
    handleCommand(command);
  }

  if (blinkToggles > 0 && (long)(now - nextBlinkAt) >= 0) {
    // 연결 직후(또는 IDENTIFY 명령) 주황 LED 를 깜빡여 어느 보드인지 알려 준다.
    blinkToggles--;
    digitalWrite(LED_BUILTIN, (blinkToggles & 1) ? HIGH : LOW);
    nextBlinkAt = now + 150;
  }

  if (connected && streaming) {
    if (mode == MODE_IMU) {
      sendAcceleration();
    } else if ((long)(now - nextEnvAt) >= 0) {
      sendEnvironment();
      nextEnvAt += envInterval;
      if ((long)(nextEnvAt - now) <= 0) nextEnvAt = now + envInterval;
    }
  }

  if ((long)(now - nextStatusAt) >= 0) {
    nextStatusAt = now + 5000;
    Serial.print("[STATUS] uptime=");
    Serial.print(now / 1000);
    Serial.print("s name=");
    Serial.print(deviceName);
    Serial.print(" BLE=");
    Serial.print(connected ? "CONNECTED" : "ADVERTISING");
    Serial.print(" mode=");
    Serial.print(!streaming ? "IDLE" : (mode == MODE_IMU ? "IMU" : "ENV"));
    Serial.print(" sent=");
    Serial.println(sentSamples);
  }
}
