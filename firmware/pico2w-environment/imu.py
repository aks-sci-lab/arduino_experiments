"""Acceleration only, in g, for ICM-20948 or MPU-9250/9255 at 0x68."""

import struct
import time


class IMU:
    DRIVER_VERSION = "impact-200-v3"

    def __init__(self, i2c, address=0x68):
        self.i2c = i2c
        self.address = address
        self._write(0x7F, 0)
        identity = self._read(0x00, 1)[0]
        if identity == 0xEA:
            self.kind = "ICM-20948"
            self._write(0x06, 0x80)
            time.sleep_ms(100)
            self._write(0x7F, 0)
            self._write(0x06, 0x01)
            self._write(0x07, 0x00)
            self._write(0x7F, 0x20)
            self._write(0x14, 0x1F)  # +/-16g, enabled DLPF (configuration 3).
            self._write(0x7F, 0)
            self.data_register = 0x2D
        else:
            identity = self._read(0x75, 1)[0]
            if identity not in (0x71, 0x73):
                raise RuntimeError("Unsupported IMU chip ID: 0x%02x" % identity)
            self.kind = "MPU-9250" if identity == 0x71 else "MPU-9255"
            self._write(0x6B, 0x80)
            time.sleep_ms(100)
            self._write(0x6B, 0x01)
            self._write(0x6C, 0x00)
            self._write(0x1C, 0x18)  # +/-16g.
            self._write(0x1D, 0x03)
            self._write(0x1A, 0x03)
            self.data_register = 0x3B
        self.set_rate(100)
        time.sleep_ms(50)
        self.verify_range()

    def _read(self, register, length):
        return self.i2c.readfrom_mem(self.address, register, length)

    def _write(self, register, value):
        self.i2c.writeto_mem(self.address, register, bytes([value]))

    def set_rate(self, hz):
        if hz not in (25, 50, 100, 200):
            raise ValueError("IMU rate must be 25, 50, 100 or 200 Hz")
        if self.kind == "ICM-20948":
            # Sensor ODR is at least the requested BLE sampling rate.
            divider = int(1125 / hz) - 1
            self._write(0x7F, 0x20)
            try:
                self._write(0x10, divider >> 8)
                self._write(0x11, divider & 0xFF)
                self._write(0x14, 0x17 if hz == 200 else 0x1F)
                if self._read(0x14, 1)[0] != (0x17 if hz == 200 else 0x1F):
                    raise RuntimeError("IMU filter configuration verification failed")
            finally:
                self._write(0x7F, 0)
        else:
            self._write(0x19, int(1000 / hz) - 1)
            self._write(0x1D, 0x02 if hz == 200 else 0x03)
            if self._read(0x1D, 1)[0] != (0x02 if hz == 200 else 0x03):
                raise RuntimeError("IMU filter configuration verification failed")

    def verify_range(self):
        if self.kind == "ICM-20948":
            self._write(0x7F, 0x20)
            try:
                config = self._read(0x14, 1)[0]
            finally:
                self._write(0x7F, 0)
            mask = 0x06
        else:
            config = self._read(0x1C, 1)[0]
            mask = 0x18
        if config & mask != mask:
            raise RuntimeError(
                "IMU +/-16g verification failed: ACCEL_CONFIG=0x%02X" % config
            )
        self.range_config = config
        return config

    def read(self):
        return tuple(value / 2048.0 for value in struct.unpack(">hhh", self._read(self.data_register, 6)))
