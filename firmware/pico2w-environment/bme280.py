"""BME280 forced-mode measurements in degrees C, percent RH and kPa."""

import struct
import time


def signed(value, bits):
    return value - (1 << bits) if value & (1 << (bits - 1)) else value


class BME280:
    def __init__(self, i2c, address=0x76):
        self.i2c = i2c
        self.address = address
        if self._read(0xD0, 1)[0] != 0x60:
            raise RuntimeError("BME280 chip ID mismatch at 0x%02x" % address)
        self._write(0xE0, 0xB6)
        time.sleep_ms(10)
        self._wait_ready(0x01)
        self.temperature_cal = struct.unpack("<Hhh", self._read(0x88, 6))
        self.pressure_cal = struct.unpack("<Hhhhhhhhh", self._read(0x8E, 18))
        h = self._read(0xE1, 7)
        self.humidity_cal = (
            self._read(0xA1, 1)[0],
            struct.unpack("<h", h[:2])[0],
            h[2],
            signed((h[3] << 4) | (h[4] & 0x0F), 12),
            signed((h[5] << 4) | (h[4] >> 4), 12),
            signed(h[6], 8),
        )
        if self.pressure_cal[0] == 0:
            raise RuntimeError("BME280 pressure calibration is invalid")
        self._write(0xF2, 0x01)
        self._write(0xF5, 0x00)

    def _read(self, register, length):
        return self.i2c.readfrom_mem(self.address, register, length)

    def _write(self, register, value):
        self.i2c.writeto_mem(self.address, register, bytes([value]))

    def _wait_ready(self, mask):
        for _ in range(100):
            if not self._read(0xF3, 1)[0] & mask:
                return
            time.sleep_ms(2)
        raise RuntimeError("BME280 measurement timed out")

    def read(self):
        self._write(0xF4, 0x25)  # Temperature/pressure x1, forced mode.
        time.sleep_ms(10)
        self._wait_ready(0x08)
        raw = self._read(0xF7, 8)
        adc_p = (raw[0] << 12) | (raw[1] << 4) | (raw[2] >> 4)
        adc_t = (raw[3] << 12) | (raw[4] << 4) | (raw[5] >> 4)
        adc_h = (raw[6] << 8) | raw[7]
        if adc_p == 0x80000 or adc_t == 0x80000 or adc_h == 0x8000:
            raise RuntimeError("BME280 returned a disabled measurement")
        return self.compensate(adc_t, adc_p, adc_h)

    def compensate(self, adc_t, adc_p, adc_h):
        t1, t2, t3 = self.temperature_cal
        v1 = (adc_t / 16384.0 - t1 / 1024.0) * t2
        v2 = (adc_t / 131072.0 - t1 / 8192.0) ** 2 * t3
        fine = v1 + v2
        temperature = fine / 5120.0

        p1, p2, p3, p4, p5, p6, p7, p8, p9 = self.pressure_cal
        v1 = fine / 2.0 - 64000.0
        v2 = v1 * v1 * p6 / 32768.0
        v2 += v1 * p5 * 2.0
        v2 = v2 / 4.0 + p4 * 65536.0
        v1 = (p3 * v1 * v1 / 524288.0 + p2 * v1) / 524288.0
        v1 = (1.0 + v1 / 32768.0) * p1
        if v1 == 0:
            raise RuntimeError("BME280 pressure compensation division by zero")
        pressure = (1048576.0 - adc_p - v2 / 4096.0) * 6250.0 / v1
        v1 = p9 * pressure * pressure / 2147483648.0
        v2 = pressure * p8 / 32768.0
        pressure += (v1 + v2 + p7) / 16.0

        h1, h2, h3, h4, h5, h6 = self.humidity_cal
        humidity = fine - 76800.0
        humidity = (adc_h - (h4 * 64.0 + h5 / 16384.0 * humidity)) * (
            h2 / 65536.0 * (
                1.0 + h6 / 67108864.0 * humidity
                * (1.0 + h3 / 67108864.0 * humidity)
            )
        )
        humidity *= 1.0 - h1 * humidity / 524288.0
        humidity = min(100.0, max(0.0, humidity))
        pressure_kpa = pressure / 1000.0
        if not (-40 <= temperature <= 85 and 30 <= pressure_kpa <= 110):
            raise RuntimeError("BME280 reading outside its specified range")
        return {
            "temp": round(temperature, 2),
            "humidity": round(humidity, 2),
            "pressure": round(pressure_kpa, 3),
        }
