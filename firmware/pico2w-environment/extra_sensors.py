"""TSL2591 lux, LTR390 UV counts, SGP40 humidity-compensated SRAW, INA219/INA226 current and voltage."""

import struct
import time


class TSL2591:
    def __init__(self, i2c):
        self.i2c = i2c
        self.address = 0x29
        if self._read(0x12, 1)[0] != 0x50:
            raise RuntimeError("TSL2591 chip ID mismatch")
        self.gain = 25
        self._write(0x00, 0x00)
        self._write(0x01, 0x10)  # 25x gain, 100 ms integration.

    def _write(self, register, value):
        self.i2c.writeto_mem(self.address, 0xA0 | register, bytes([value]))

    def _read(self, register, length):
        return self.i2c.readfrom_mem(self.address, 0xA0 | register, length)

    def _channels(self):
        self._write(0x00, 0x03)
        try:
            time.sleep_ms(120)
            if not self._read(0x13, 1)[0] & 0x01:
                raise RuntimeError("TSL2591 measurement not ready")
            return struct.unpack("<HH", self._read(0x14, 4))
        finally:
            self._write(0x00, 0x00)

    def read(self):
        full, infrared = self._channels()
        if max(full, infrared) >= 36863 and self.gain == 25:
            self.gain = 1
            self._write(0x01, 0x00)
            full, infrared = self._channels()
        if max(full, infrared) >= 36863:
            raise RuntimeError("TSL2591 saturated; reduce illumination")
        cpl = 100.0 * self.gain / 408.0
        lux = max(0.0, (full - 1.64 * infrared) / cpl,
                  (0.59 * full - 0.86 * infrared) / cpl)
        return {"lux": round(lux, 3), "full": full, "infrared": infrared, "gain": self.gain}


class LTR390:
    def __init__(self, i2c):
        self.i2c = i2c
        self.address = 0x53
        if self._read(0x06, 1)[0] & 0xF0 != 0xB0:
            raise RuntimeError("LTR390 chip ID mismatch")
        self._write(0x00, 0x00)
        self._write(0x04, 0x04)  # 20-bit, 400 ms integration, 500 ms period.
        self._write(0x05, 0x01)  # Gain 3x, fixed for comparisons.
        self._write(0x00, 0x0A)  # UVS enabled.

    def _write(self, register, value):
        self.i2c.writeto_mem(self.address, register, bytes([value]))

    def _read(self, register, length):
        return self.i2c.readfrom_mem(self.address, register, length)

    def read(self):
        for _ in range(60):
            if self._read(0x07, 1)[0] & 0x08:
                break
            time.sleep_ms(10)
        else:
            raise RuntimeError("LTR390 measurement timed out")
        raw = self._read(0x10, 3)
        count = raw[0] | (raw[1] << 8) | (raw[2] << 16)
        if count >= 0xFFFFF:
            raise RuntimeError("LTR390 saturated; reduce UV illumination")
        return {"uvRaw": count}


def crc8(data):
    crc = 0xFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SGP40:
    def __init__(self, i2c, environment):
        if environment is None:
            raise RuntimeError("SGP40 requires a working BME280 for humidity compensation")
        self.i2c = i2c
        self.environment = environment
        self.address = 0x59
        self.started_at = None
        self.i2c.writeto(self.address, b"\x28\x0E")
        time.sleep_ms(320)
        if self._word() != 0xD400:
            raise RuntimeError("SGP40 self-test failed")
        self.stop()

    def _word(self):
        data = self.i2c.readfrom(self.address, 3)
        if crc8(data[:2]) != data[2]:
            raise RuntimeError("SGP40 response CRC mismatch")
        return (data[0] << 8) | data[1]

    def stop(self):
        self.i2c.writeto(self.address, b"\x36\x15")
        self.started_at = None

    def read(self, environment=None):
        if environment is None:
            environment = self.environment.read()
        rh = struct.pack(">H", round(environment["humidity"] * 65535 / 100))
        temp = struct.pack(">H", round((environment["temp"] + 45) * 65535 / 175))
        self.i2c.writeto(self.address, b"\x26\x0F" + rh + bytes([crc8(rh)]) + temp + bytes([crc8(temp)]))
        time.sleep_ms(30)
        raw = self._word()
        now = time.ticks_ms()
        if self.started_at is None:
            self.started_at = now
        warmup = max(0, 60 - time.ticks_diff(now, self.started_at) // 1000)
        return {
            "sraw": raw, "warmup": warmup,
            "temp": environment["temp"], "humidity": environment["humidity"],
        }


class CurrentMonitor:
    """INA219 또는 INA226 전류·전압 모듈 (I2C 주소 0x40, 모듈의 전류 측정 저항 0.1 Ω).

    회로: ... → 고정 저항 → VIN+ → VIN- → LED(+) → LED(-) → 건전지 -, 모듈 GND 도 건전지 - 에.
    이렇게 꽂으면 버스 전압(VIN- 와 GND 사이)이 곧 LED 전압이고, VIN+ 와 VIN- 사이의
    작은 저항(션트)에 걸린 전압으로 LED 에 흐르는 전류를 계산한다.
    INA226 은 제조사 번호 레지스터(0xFE = 0x5449)로 알아본다. 없으면 INA219 로 본다.
    INA226 모듈은 VBUS 핀을 VIN- 에 이어야 LED 전압이 나온다.
    """

    SHUNT_OHM = 0.1

    def __init__(self, i2c, address=0x40):
        self.i2c = i2c
        self.address = address
        self.kind = "INA226" if self._is_ina226() else "INA219"
        if self.kind == "INA226":
            # 평균 64번, 변환 시간 1.1 ms, 션트·버스 연속 측정 (한 값에 약 0.14 초)
            config = 0x4727
            self.shunt_lsb = 0.0000025   # 2.5 µV
            self.bus_lsb = 0.00125       # 1.25 mV
        else:
            # 버스 16 V 범위, 션트 ±40 mV(0.1 Ω 에서 ±400 mA), 12비트 64번 평균, 연속 측정
            config = 0x0777
            self.shunt_lsb = 0.00001     # 10 µV
            self.bus_lsb = 0.004         # 4 mV
        self._write(0x00, config)
        if self._read(0x00) != config:
            raise RuntimeError(self.kind + " configuration check failed")

    def _is_ina226(self):
        try:
            return self._read(0xFE) == 0x5449
        except OSError:
            return False

    def _write(self, register, value):
        self.i2c.writeto_mem(self.address, register, bytes([(value >> 8) & 0xFF, value & 0xFF]))

    def _read(self, register):
        data = self.i2c.readfrom_mem(self.address, register, 2)
        return (data[0] << 8) | data[1]

    def read(self):
        raw_shunt = self._read(0x01)
        if raw_shunt & 0x8000:
            raw_shunt -= 0x10000
        raw_bus = self._read(0x02)
        if self.kind == "INA219":
            if raw_bus & 0x01:
                raise RuntimeError("INA219 overflow; current is too large for the 0.1 ohm shunt")
            raw_bus >>= 3
        shunt_v = raw_shunt * self.shunt_lsb
        return {
            "voltage": round(raw_bus * self.bus_lsb, 4),
            "current": round(shunt_v / self.SHUNT_OHM * 1000, 4),
            "shunt": round(shunt_v * 1000, 4),
            "chip": self.kind,
        }
