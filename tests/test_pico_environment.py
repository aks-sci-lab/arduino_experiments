import importlib.util
import io
from contextlib import redirect_stdout
import json
from pathlib import Path
import struct
import sys
import types
import unittest
from unittest.mock import patch


FIRMWARE = Path(__file__).resolve().parents[1] / "firmware" / "pico2w-environment"


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, FIRMWARE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bme280 = load("bme280", "bme280.py")
imu_module = load("imu", "imu.py")
extra_module = load("extra_sensors", "extra_sensors.py")


class FakeI2C:
    def __init__(self):
        self.registers = {
            0xD0: b"\x60", 0xF3: b"\x00",
            0x88: struct.pack("<Hhh", 27504, 26435, -1000),
            0x8E: struct.pack("<Hhhhhhhhh", 36477, -10685, 3024, 2855, 140, -7, 15500, -14600, 6000),
            0xA1: b"\x00",
            0xE1: struct.pack("<hBBBBB", 32767, 0, 0, 0, 0, 0),
            0xF7: ((415148 << 4).to_bytes(3, "big")
                   + (519888 << 4).to_bytes(3, "big") + b"\x00\x64"),
        }
        self.writes = []

    def readfrom_mem(self, address, register, length):
        assert address == 0x76
        result = self.registers[register]
        assert len(result) == length
        return result

    def writeto_mem(self, address, register, data):
        self.writes.append((address, register, data))


class BME280Tests(unittest.TestCase):
    def setUp(self):
        self.sleep = patch.object(bme280.time, "sleep_ms", create=True)
        self.sleep.start()
        self.addCleanup(self.sleep.stop)

    def test_bosch_reference_temperature_pressure_and_forced_mode(self):
        bus = FakeI2C()
        sensor = bme280.BME280(bus)
        result = sensor.read()
        self.assertAlmostEqual(result["temp"], 25.08, places=2)
        self.assertAlmostEqual(result["pressure"], 100.653, places=3)
        self.assertTrue(0 <= result["humidity"] <= 100)
        self.assertIn((0x76, 0xF2, b"\x01"), bus.writes)
        self.assertIn((0x76, 0xF4, b"\x25"), bus.writes)

    def test_signed_packed_humidity_calibration(self):
        bus = FakeI2C()
        bus.registers[0xE1] = b"\x9c\xff\x03\xff\xfe\xff\xfe"
        sensor = bme280.BME280(bus)
        self.assertEqual(sensor.humidity_cal, (0, -100, 3, -2, -1, -2))

    def test_humidity_reference_and_clamping(self):
        sensor = bme280.BME280(FakeI2C())
        sensor.temperature_cal = (0, 5120, 0)
        sensor.humidity_cal = (0, 65536, 0, 0, 0, 0)
        self.assertEqual(sensor.compensate(245760, 415148, 50)["humidity"], 50)
        self.assertEqual(sensor.compensate(245760, 415148, 150)["humidity"], 100)

    def test_bad_sensor_calibration_timeout_and_disabled_read_fail(self):
        bus = FakeI2C()
        bus.registers[0xD0] = b"\x58"
        with self.assertRaisesRegex(RuntimeError, "chip ID"):
            bme280.BME280(bus)
        bus = FakeI2C()
        bus.registers[0x8E] = b"\x00\x00" + bus.registers[0x8E][2:]
        with self.assertRaisesRegex(RuntimeError, "calibration"):
            bme280.BME280(bus)
        bus = FakeI2C()
        bus.registers[0xF3] = b"\x01"
        with self.assertRaisesRegex(RuntimeError, "timed out"):
            bme280.BME280(bus)
        bus = FakeI2C()
        sensor = bme280.BME280(bus)
        bus.registers[0xF7] = b"\x80\x00\x00" + bus.registers[0xF7][3:]
        with self.assertRaisesRegex(RuntimeError, "disabled"):
            sensor.read()


class FakeBLE:
    def __init__(self):
        self.notifications = []
        self.value = b""

    def active(self, state):
        self.state = state

    def config(self, **kwargs):
        self.configuration = kwargs

    def gatts_register_services(self, services):
        self.services = services
        return ((1, 2, 3),)

    def gatts_set_buffer(self, handle, size):
        self.buffer_size = size

    def irq(self, callback):
        self.callback = callback

    def gap_advertise(self, interval, adv_data, resp_data):
        self.advertising = (adv_data, resp_data)

    def gatts_notify(self, connection, handle, payload):
        self.notifications.append(payload)

    def gatts_read(self, handle):
        return self.value

    def gap_disconnect(self, connection):
        self.callback(2, (connection, 0, b""))


class BLETests(unittest.TestCase):
    def setUp(self):
        bluetooth = types.SimpleNamespace(
            BLE=FakeBLE, UUID=lambda _: bytes(range(16)), FLAG_NOTIFY=16, FLAG_WRITE=8
        )
        modules = {
            "bluetooth": bluetooth,
            "machine": types.SimpleNamespace(unique_id=lambda: b"\x01\x02"),
            "micropython": types.SimpleNamespace(const=lambda value: value),
            "bme280": bme280,
            "imu": imu_module,
            "extra_sensors": extra_module,
        }
        with patch.dict(sys.modules, modules):
            self.firmware = load("pico_main", "main.py")
        self.sleep = patch.object(self.firmware.time, "sleep_ms", create=True)
        self.sleep.start()
        self.addCleanup(self.sleep.stop)
        self.peripheral = self.firmware.EnvironmentBLE()
        self.peripheral._irq(1, (7, 0, b""))

    def test_advertising_fits_and_frames_are_at_most_twenty_bytes(self):
        peripheral = self.peripheral
        self.assertEqual(peripheral.name, "PicoEnv-0102")
        for payload in peripheral.ble.advertising:
            self.assertLessEqual(len(payload), 31)
        self.assertIn(b"PicoEnv-0102", peripheral.ble.advertising[0])
        self.assertEqual(peripheral.ble.advertising[1], b"\x11\x07" + bytes(range(16)))
        packet = {"type": "env", "ts": 1000, "seq": 0,
                  "data": {"temp": 25.08, "humidity": 45.2, "pressure": 100.653}}
        peripheral.send(packet)
        self.assertTrue(all(len(chunk) <= 20 for chunk in peripheral.ble.notifications))
        payload = b"".join(peripheral.ble.notifications)
        self.assertTrue(payload.endswith(b"\n"))
        self.assertEqual(json.loads(payload), packet)

    def test_commands_queue_start_rate_stop_errors_and_disconnect(self):
        peripheral = self.peripheral
        for command in (b"START:ENV", b"SET_ENV_RATE:5000"):
            peripheral.ble.value = command
            peripheral._irq(3, (7, peripheral.cmd_handle))
        peripheral.process_commands()
        self.assertTrue(peripheral.streaming)
        self.assertEqual(peripheral.interval, 5000)
        peripheral.commands.extend([b"SET_ENV_RATE:0", b"BAD", b"\xff"])
        peripheral.process_commands()
        self.assertEqual(peripheral.interval, 5000)
        errors = b"".join(peripheral.ble.notifications).splitlines()
        self.assertEqual(len(errors), 3)
        self.assertTrue(all(json.loads(line)["type"] == "error" for line in errors))
        peripheral.commands.append(b"STOP:ENV")
        peripheral.process_commands()
        self.assertFalse(peripheral.streaming)
        peripheral._irq(2, (7, 0, b""))
        self.assertIsNone(peripheral.connection)
        self.assertTrue(peripheral.advertise_pending)

    def test_200hz_batches_wait_for_ten_samples_fragment_for_mtu_and_flush_tail(self):
        peripheral = self.peripheral
        peripheral.commands.extend([b"SET_IMU_RATE:200", b"START:IMU_BATCH"])
        peripheral.process_commands()
        for i in range(9):
            peripheral.send_acceleration(i * 5, (i, 0, 1))
        self.assertEqual(peripheral.ble.notifications, [])
        peripheral.send_acceleration(45, (9, 0, 1))
        self.assertEqual(len(peripheral.ble.notifications), 10)
        for i, payload in enumerate(peripheral.ble.notifications):
            self.assertEqual(len(payload), 20)
            self.assertEqual(struct.unpack("<HBB", payload[:4]), (0, i, 10))
            self.assertEqual(struct.unpack("<Ifff", payload[4:]), (i * 5, i, 0, 1))
        peripheral.ble.notifications.clear()
        peripheral._irq(21, (7, 247))
        for i in range(3):
            peripheral.send_acceleration(50 + i * 5, (i, 0, 1))
        peripheral.commands.append(b"STOP:IMU_BATCH")
        peripheral.process_commands()
        batch = peripheral.ble.notifications[0]
        self.assertEqual(len(batch), 52)
        self.assertEqual(struct.unpack("<HBB", batch[:4]), (1, 0, 3))
        self.assertEqual(struct.unpack("<Ifff", batch[-16:]), (60, 2, 0, 1))
        ack = b"".join(peripheral.ble.notifications[1:])
        self.assertEqual(json.loads(ack)["type"], "imu_stopped")
        self.assertEqual(peripheral.accel_count, 0)
        self.assertFalse(peripheral.streaming)
        peripheral.commands.extend([b"START:IMU_BATCH", b"SET_IMU_RATE:100"])
        peripheral.process_commands()
        self.assertEqual(peripheral.imu_interval, 5)
        self.assertIn(b"Stop buffered IMU", b"".join(peripheral.ble.notifications[1:]))

    def test_non_200hz_remains_unbuffered_and_disconnect_discards_stale_batch(self):
        peripheral = self.peripheral
        peripheral.commands.append(b"START:IMU_BATCH")
        peripheral.process_commands()
        self.assertFalse(peripheral.streaming)
        self.assertIn(b"requires 200 Hz", b"".join(peripheral.ble.notifications))
        peripheral.ble.notifications.clear()
        peripheral.commands.append(b"START:IMU")
        peripheral.process_commands()
        peripheral.send_acceleration(5, (1, 2, 3))
        self.assertEqual(len(peripheral.ble.notifications[0]), 16)
        peripheral.accel_count = 3
        peripheral._irq(2, (7, 0, b""))
        self.assertEqual(peripheral.accel_count, 0)

    def test_imu_commands_and_mode_switch(self):
        peripheral = self.peripheral
        peripheral.commands.extend([b"SET_IMU_RATE:50", b"START:IMU"])
        peripheral.process_commands()
        self.assertEqual(peripheral.mode, "imu")
        self.assertEqual(peripheral.imu_interval, 20)
        self.assertTrue(peripheral.streaming)
        peripheral.commands.append(b"SET_IMU_RATE:400")
        peripheral.process_commands()
        self.assertEqual(peripheral.imu_interval, 20)
        self.assertIn(b"IMU rate must", b"".join(peripheral.ble.notifications))
        peripheral.commands.extend([b"STOP", b"START:ENV"])
        peripheral.process_commands()
        self.assertEqual(peripheral.mode, "env")
        self.assertTrue(peripheral.streaming)

    def test_serial_monitor_status_and_command_logs(self):
        peripheral = self.peripheral
        output = io.StringIO()
        with redirect_stdout(output):
            peripheral.report_status(5000, True, False)
            peripheral.commands.append(b"START:IMU")
            peripheral.process_commands()
            peripheral.last_data = (1.0, -0.5, 0.25)
            peripheral.last_data_mode = "imu"
            peripheral.sent_samples = 42
            peripheral.report_status(10000, True, True)
            peripheral.mode = "env"
            peripheral.last_data = {"temp": 25, "humidity": 50, "pressure": 101.325}
            peripheral.last_data_mode = "env"
            peripheral.report_status(15000, True, True)
            peripheral._irq(2, (7, 0, b""))
            peripheral.report_status(20000, True, True)
        text = output.getvalue()
        self.assertIn("BLE=CONNECTED mode=IDLE BME280=OK IMU=ERROR sent=0", text)
        self.assertIn("[CMD] START:IMU", text)
        self.assertIn("mode=IMU BME280=OK IMU=OK sent=42", text)
        self.assertIn("[DATA] X=1.0000 Y=-0.5000 Z=0.2500 g", text)
        self.assertIn("pressure=101.325 kPa", text)
        self.assertIn("BLE=ADVERTISING mode=IDLE", text)

    def test_extra_sensor_commands_preserve_imu_rate_and_select_correct_mode(self):
        peripheral = self.peripheral
        for mode in ("LIGHT", "UV", "VOC", "ENV_VOC"):
            peripheral.commands.extend([b"SET_SENSOR_RATE:5000", ("START:" + mode).encode()])
            peripheral.process_commands()
            self.assertEqual(peripheral.mode, mode.lower())
            self.assertEqual(peripheral.interval, 5000)
            self.assertEqual(peripheral.imu_interval, 10)
            self.assertTrue(peripheral.streaming)
        peripheral.commands.append(b"STOP")
        peripheral.process_commands()
        self.assertFalse(peripheral.streaming)

    def test_main_routes_new_sensor_packets_and_keeps_voc_at_one_second(self):
        class Sensor:
            kind = "ICM-20948"
            DRIVER_VERSION = "test"
            range_config = 0x1F

            def __init__(self, data):
                self.data = data
                self.stopped = False
                self.read_count = 0
                self.compensation_samples = []

            def read(self, environment=None):
                self.read_count += 1
                if environment is not None:
                    self.compensation_samples.append(dict(environment))
                return self.data

            def set_rate(self, hz):
                pass

            def verify_range(self):
                return 0x1F

            def stop(self):
                self.stopped = True

        class I2C:
            def scan(self):
                return [0x29, 0x53, 0x59, 0x68, 0x76]

        values = {
            "light": {"lux": 12, "full": 100, "infrared": 15, "gain": 25},
            "uv": {"uvRaw": 123},
            "voc": {"sraw": 25000, "warmup": 60, "temp": 25, "humidity": 50},
            "env_voc": {"sraw": 25000, "warmup": 60, "temp": 25, "humidity": 50, "pressure": 101},
        }
        for mode, data in values.items():
            peripheral = self.firmware.EnvironmentBLE()
            peripheral._irq(1, (7, 0, b""))
            peripheral.commands.extend([b"SET_SENSOR_RATE:5000", ("START:" + mode.upper()).encode()])
            voc = Sensor(values["voc"])
            ticks = iter(range(0, 7100, 100))

            def clock():
                try:
                    return next(ticks)
                except StopIteration:
                    raise KeyboardInterrupt()

            environment = Sensor({"temp": 25, "humidity": 50, "pressure": 101})
            with patch.object(self.firmware.machine, "I2C", return_value=I2C(), create=True), \
                    patch.object(self.firmware.machine, "Pin", side_effect=lambda value: value, create=True), \
                    patch.object(self.firmware, "BME280", return_value=environment), \
                    patch.object(self.firmware, "IMU", return_value=Sensor((0, 0, 1))), \
                    patch.object(self.firmware, "TSL2591", return_value=Sensor(values["light"])), \
                    patch.object(self.firmware, "LTR390", return_value=Sensor(values["uv"])), \
                    patch.object(self.firmware, "SGP40", return_value=voc), \
                    patch.object(self.firmware, "EnvironmentBLE", return_value=peripheral), \
                    patch.object(self.firmware.time, "ticks_ms", side_effect=clock, create=True), \
                    patch.object(self.firmware.time, "ticks_diff", side_effect=lambda a, b: a - b, create=True), \
                    redirect_stdout(io.StringIO()):
                with self.assertRaises(KeyboardInterrupt):
                    self.firmware.main()
            packets = [json.loads(line) for line in b"".join(peripheral.ble.notifications).splitlines()]
            self.assertTrue(packets)
            self.assertTrue(all(packet["type"] == mode and packet["data"] == data for packet in packets))
            self.assertFalse(peripheral.ble.state)
            if mode in ("voc", "env_voc"):
                self.assertGreaterEqual(len(packets), 6)
                self.assertEqual(packets[1]["ts"] - packets[0]["ts"], 1000)
                self.assertTrue(voc.stopped)
                if mode == "env_voc":
                    self.assertEqual(environment.read_count, voc.read_count)
                    self.assertEqual(len(voc.compensation_samples), voc.read_count)
                    self.assertEqual(voc.compensation_samples[0], {"temp": 25, "humidity": 50, "pressure": 101})
            else:
                self.assertEqual(packets[1]["ts"] - packets[0]["ts"], 5000)


class IMUTests(unittest.TestCase):
    def setUp(self):
        self.sleep = patch.object(imu_module.time, "sleep_ms", create=True)
        self.sleep.start()
        self.addCleanup(self.sleep.stop)

    def bus(self, identity):
        class Bus:
            def __init__(self):
                self.bank = 0
                self.writes = []
                self.registers = {}

            def writeto_mem(self, address, register, data):
                assert address == 0x68
                self.writes.append((self.bank, register, data[0]))
                self.registers[(self.bank, register)] = data
                if register == 0x7F:
                    self.bank = data[0] >> 4

            def readfrom_mem(self, address, register, length):
                assert address == 0x68
                if register in (0x14, 0x1C, 0x1D):
                    return self.registers[(self.bank, register)]
                assert self.bank == 0
                if register == 0:
                    return bytes([0xEA if identity == 0xEA else 0])
                if register == 0x75:
                    return bytes([identity])
                assert register == (0x2D if identity == 0xEA else 0x3B)
                return struct.pack(">hhh", 16384, -8192, -32768)
        return Bus()

    def test_supported_chips_signed_acceleration_and_rates(self):
        for identity, name in ((0xEA, "ICM-20948"), (0x71, "MPU-9250"), (0x73, "MPU-9255")):
            bus = self.bus(identity)
            sensor = imu_module.IMU(bus)
            self.assertEqual(sensor.kind, name)
            self.assertEqual(sensor.verify_range(), 0x1F if identity == 0xEA else 0x18)
            self.assertEqual(sensor.read(), (8.0, -4.0, -16.0))
            if identity == 0xEA:
                self.assertIn((2, 0x14, 0x1F), bus.writes)
            else:
                self.assertIn((0, 0x1C, 0x18), bus.writes)
            for hz in (25, 50, 100, 200, 100):
                sensor.set_rate(hz)
                if identity == 0xEA:
                    self.assertIn((2, 0x11, int(1125 / hz) - 1), bus.writes)
                    self.assertEqual(bus.bank, 0)
                    self.assertEqual(bus.registers[(2, 0x14)], bytes([0x17 if hz == 200 else 0x1F]))
                else:
                    self.assertIn((0, 0x19, int(1000 / hz) - 1), bus.writes)
                    self.assertEqual(bus.registers[(0, 0x1D)], bytes([0x02 if hz == 200 else 0x03]))
                sensor.verify_range()
            with self.assertRaises(ValueError):
                sensor.set_rate(400)

    def test_unknown_chip_not_silently_accepted(self):
        with self.assertRaisesRegex(RuntimeError, "Unsupported IMU"):
            imu_module.IMU(self.bus(0x42))

    def test_filter_readback_failure_is_explicit_and_restores_icm_bank(self):
        for identity in (0xEA, 0x71):
            bus = self.bus(identity)
            sensor = imu_module.IMU(bus)
            original = bus.readfrom_mem

            def wrong_filter(address, register, length):
                if register == (0x14 if identity == 0xEA else 0x1D):
                    return b"\x00"
                return original(address, register, length)

            bus.readfrom_mem = wrong_filter
            with self.assertRaisesRegex(RuntimeError, "filter configuration"):
                sensor.set_rate(200)
            self.assertEqual(bus.bank, 0)

    def test_range_readback_rejects_two_g_and_restores_icm_bank(self):
        for identity in (0xEA, 0x71, 0x73):
            bus = self.bus(identity)
            sensor = imu_module.IMU(bus)
            key = (2, 0x14) if identity == 0xEA else (0, 0x1C)
            bus.registers[key] = b"\x19" if identity == 0xEA else b"\x00"
            with self.assertRaisesRegex(RuntimeError, "verification failed"):
                sensor.verify_range()
            self.assertEqual(bus.bank, 0)


if __name__ == "__main__":
    unittest.main()
