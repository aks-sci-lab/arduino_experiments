import importlib.util
from pathlib import Path
import struct
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "extra_sensors", Path(__file__).resolve().parents[1] / "firmware" / "pico2w-environment" / "extra_sensors.py"
)
sensors = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sensors)


class Bus:
    def __init__(self):
        self.registers = {
            (0x29, 0xB2): b"\x50", (0x29, 0xB3): b"\x01",
            (0x29, 0xB4): struct.pack("<HH", 1000, 100),
            (0x53, 0x06): b"\xB2", (0x53, 0x07): b"\x08",
            (0x53, 0x10): b"\x03\x02\x01",
        }
        self.writes = []
        self.words = [0xD400, 25000]
        self.bad_crc = False

    def readfrom_mem(self, address, register, length):
        result = self.registers[(address, register)]
        if callable(result):
            result = result()
        assert len(result) == length
        return result

    def writeto_mem(self, address, register, data):
        self.writes.append((address, register, data))

    def writeto(self, address, data):
        assert address == 0x59
        self.writes.append(data)

    def readfrom(self, address, length):
        assert address == 0x59 and length == 3
        word = struct.pack(">H", self.words.pop(0))
        return word + bytes([sensors.crc8(word) ^ (1 if self.bad_crc else 0)])


class ExtraSensorTests(unittest.TestCase):
    def setUp(self):
        self.patches = [
            patch.object(sensors.time, "sleep_ms", create=True),
            patch.object(sensors.time, "ticks_ms", return_value=0, create=True),
            patch.object(sensors.time, "ticks_diff", side_effect=lambda a, b: a - b, create=True),
        ]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def test_light_units_darkness_and_power_off(self):
        bus = Bus()
        light = sensors.TSL2591(bus)
        reading = light.read()
        self.assertAlmostEqual(reading["lux"], (1000 - 1.64 * 100) * 408 / 2500, places=3)
        self.assertEqual(reading["gain"], 25)
        self.assertEqual(bus.writes[-1], (0x29, 0xA0, b"\x00"))
        bus.registers[(0x29, 0xB4)] = b"\x00" * 4
        self.assertEqual(light.read()["lux"], 0)

    def test_light_auto_gain_and_explicit_saturation(self):
        bus = Bus()
        channels = [struct.pack("<HH", 36863, 100), struct.pack("<HH", 1000, 100)]
        bus.registers[(0x29, 0xB4)] = lambda: channels.pop(0)
        light = sensors.TSL2591(bus)
        self.assertEqual(light.read()["gain"], 1)
        self.assertIn((0x29, 0xA1, b"\x00"), bus.writes)
        bus.registers[(0x29, 0xB4)] = struct.pack("<HH", 36863, 100)
        with self.assertRaisesRegex(RuntimeError, "saturated"):
            light.read()
        self.assertEqual(bus.writes[-1], (0x29, 0xA0, b"\x00"))

    def test_uv_20bit_counts_gain_and_readiness(self):
        bus = Bus()
        uv = sensors.LTR390(bus)
        self.assertIn((0x53, 0x04, b"\x04"), bus.writes)
        self.assertIn((0x53, 0x05, b"\x01"), bus.writes)
        self.assertEqual(uv.read(), {"uvRaw": 0x010203})
        bus.registers[(0x53, 0x10)] = b"\xFF\xFF\x0F"
        with self.assertRaisesRegex(RuntimeError, "saturated"):
            uv.read()
        bus.registers[(0x53, 0x07)] = b"\x00"
        with self.assertRaisesRegex(RuntimeError, "timed out"):
            uv.read()

    def test_optical_identity_and_not_ready_errors(self):
        bus = Bus()
        bus.registers[(0x29, 0xB2)] = b"\x00"
        with self.assertRaisesRegex(RuntimeError, "chip ID"):
            sensors.TSL2591(bus)
        bus.registers[(0x53, 0x06)] = b"\x00"
        with self.assertRaisesRegex(RuntimeError, "chip ID"):
            sensors.LTR390(bus)
        bus = Bus()
        light = sensors.TSL2591(bus)
        bus.registers[(0x29, 0xB3)] = b"\x00"
        with self.assertRaisesRegex(RuntimeError, "not ready"):
            light.read()
        self.assertEqual(bus.writes[-1], (0x29, 0xA0, b"\x00"))

    def environment(self):
        class Environment:
            def read(self):
                return {"temp": 25, "humidity": 50}
        return Environment()

    def test_crc_reference_and_voc_compensation_warmup_heater_stop(self):
        self.assertEqual(sensors.crc8(b"\xBE\xEF"), 0x92)
        self.assertEqual(sensors.crc8(b"\x80\x00"), 0xA2)
        bus = Bus()
        voc = sensors.SGP40(bus, self.environment())
        reading = voc.read()
        self.assertEqual(reading, {"sraw": 25000, "warmup": 60, "temp": 25, "humidity": 50})
        self.assertIn(b"\x26\x0F\x80\x00\xA2\x66\x66\x93", bus.writes)
        bus.words.append(24000)
        sensors.time.ticks_ms.return_value = 61000
        self.assertEqual(voc.read()["warmup"], 0)
        voc.stop()
        self.assertEqual(bus.writes[-1], b"\x36\x15")
        self.assertIsNone(voc.started_at)

    def test_voc_missing_bme_self_test_and_crc_failures(self):
        with self.assertRaisesRegex(RuntimeError, "working BME280"):
            sensors.SGP40(Bus(), None)
        bus = Bus()
        bus.words = [0x4B00]
        with self.assertRaisesRegex(RuntimeError, "self-test"):
            sensors.SGP40(bus, self.environment())
        bus = Bus()
        bus.bad_crc = True
        with self.assertRaisesRegex(RuntimeError, "CRC"):
            sensors.SGP40(bus, self.environment())
        bus = Bus()
        voc = sensors.SGP40(bus, self.environment())
        bus.bad_crc = True
        with self.assertRaisesRegex(RuntimeError, "CRC"):
            voc.read()

    def test_voc_reuses_the_exact_environment_sample_without_reading_bme_twice(self):
        environment = self.environment()
        environment.read = lambda: self.fail("BME280 must not be read again")
        bus = Bus()
        voc = sensors.SGP40(bus, environment)
        values = {"temp": 25, "humidity": 50, "pressure": 101.325}
        result = voc.read(values)
        self.assertEqual(result["temp"], values["temp"])
        self.assertEqual(result["humidity"], values["humidity"])
        self.assertEqual(values, {"temp": 25, "humidity": 50, "pressure": 101.325})
        self.assertIn(b"\x26\x0F\x80\x00\xA2\x66\x66\x93", bus.writes)


if __name__ == "__main__":
    unittest.main()
