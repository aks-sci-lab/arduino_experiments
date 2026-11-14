"""Waveshare Pico-Environment-Sensor, MicroPython BLE."""

import sys
print("[BOOT] Pico lab firmware starting")
print("[BOOT] MicroPython:", sys.version)
try:
    import bluetooth
except ImportError:
    print("[FATAL] bluetooth module missing. Install RPI_PICO2_W MicroPython UF2.")
    raise
import gc
import json
import machine
import os
import struct
import time
from micropython import const
try:
    from bme280 import BME280
    from imu import IMU
    from extra_sensors import TSL2591, LTR390, SGP40, CurrentMonitor
except ImportError:
    print("[FATAL] Upload bme280.py, imu.py, extra_sensors.py and main.py to the Pico root.")
    raise

IRQ_CONNECT = const(1)
IRQ_DISCONNECT = const(2)
IRQ_WRITE = const(3)
IRQ_MTU = const(21)
SERVICE = bluetooth.UUID("19b10000-e8f2-537e-4f6c-d104768a1214")
TX = bluetooth.UUID("19b10001-e8f2-537e-4f6c-d104768a1214")
CMD = bluetooth.UUID("19b10002-e8f2-537e-4f6c-d104768a1214")
ACCEL = bluetooth.UUID("19b10004-e8f2-537e-4f6c-d104768a1214")
FIRMWARE_VERSION = "2026.11-iv"
# 보드 번호를 적어 두는 작은 설정 파일. 없거나 깨졌으면 자동 이름(PicoEnv-XXXX)을 쓴다.
BOARD_FILE = "board.json"
MAX_CONSECUTIVE_FAILURES = 5


def load_board(path=None):
    """설정 파일의 보드 번호(1~99)를 돌려준다. 읽을 수 없으면 None."""
    try:
        with open(path or BOARD_FILE) as file:
            value = json.load(file)["board"]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 99:
        return value
    return None


def save_board(number, path=None):
    """번호를 저장한다. number 가 None 이면 설정 파일을 지운다."""
    path = path or BOARD_FILE
    if number is None:
        try:
            os.remove(path)
        except OSError:
            pass
        return
    temporary = path + ".tmp"
    with open(temporary, "w") as file:
        file.write(json.dumps({"board": number}))
    try:
        os.remove(path)
    except OSError:
        pass
    os.rename(temporary, path)


def bootsel_pressed():
    """BOOTSEL 단추가 눌려 있으면 True, 아니면 False, 읽을 수 없으면 None."""
    try:
        import rp2
        return bool(rp2.bootsel_button())
    except (ImportError, AttributeError):
        return None


def log_exception(error):
    printer = getattr(sys, "print_exception", None)
    if printer:
        printer(error)
    else:
        print(repr(error))


class EnvironmentBLE:
    def __init__(self):
        self.ble = bluetooth.BLE()
        self.ble.active(True)
        self.ble.config(mtu=247)
        self.connection = None
        self.streaming = False
        self.interval = 1000
        self.imu_interval = 10
        self.mode = "env"
        self.revision = 0
        self.commands = []
        self.advertise_pending = False
        self.connection_log_pending = False
        self.sent_samples = 0
        self.last_data = None
        self.last_data_mode = None
        self.accel_batch = bytearray(160)
        self.accel_count = 0
        self.accel_batch_sequence = 0
        self.accel_buffered = False
        self.mtu = 23
        self.reschedule = False
        self.blink_toggles = 0
        self.reply_sequence = 0
        unique = machine.unique_id()
        self.chip_id = "".join("%02X" % b for b in unique)
        self.auto_name = "PicoEnv-" + "".join("%02X" % b for b in unique[-2:])
        self.board = load_board()
        self.name = self.board_name()
        ((self.tx_handle, self.cmd_handle, self.accel_handle),) = self.ble.gatts_register_services((
            (SERVICE, (
                (TX, bluetooth.FLAG_NOTIFY),
                (CMD, bluetooth.FLAG_WRITE),
                (ACCEL, bluetooth.FLAG_NOTIFY),
            )),
        ))
        self.ble.gatts_set_buffer(self.accel_handle, 164)
        self.ble.gatts_set_buffer(self.cmd_handle, 128)
        self.ble.irq(self._irq)
        self.apply_gap_name()
        self.advertise()

    def board_name(self):
        return "PicoEnv-%02d" % self.board if self.board else self.auto_name

    def apply_gap_name(self):
        # 연결 뒤 브라우저가 읽는 장치 이름도 광고 이름과 같게 맞춘다.
        try:
            self.ble.config(gap_name=self.name)
        except (ValueError, OSError, TypeError):
            pass

    def send_board(self, saved=False):
        self.reply_sequence += 1
        self.send({"type": "board", "ts": self.reply_sequence, "seq": self.reply_sequence,
                   "data": {"name": self.name, "board": self.board, "id": self.chip_id,
                            "fw": FIRMWARE_VERSION, "saved": saved}})

    def change_board(self, number):
        pressed = bootsel_pressed()
        if pressed is None:
            self.send({"type": "error", "message":
                       "이 보드의 MicroPython 은 BOOTSEL 단추를 읽지 못해 번호를 바꿀 수 없습니다. 최신 MicroPython 을 설치하세요."})
            return
        if not pressed:
            self.send({"type": "error", "message":
                       "보드의 BOOTSEL 단추를 누르고 있는 동안에만 번호를 바꿀 수 있습니다. 단추를 누른 채로 다시 저장하세요."})
            return
        try:
            save_board(number)
        except OSError as error:
            self.send({"type": "error", "message": "보드 번호를 저장하지 못했습니다: " + str(error)})
            return
        self.board = number
        self.name = self.board_name()
        self.apply_gap_name()
        self.blink_toggles = 12
        print("[BOARD] Name is now", self.name, "(advertised after this connection ends)")
        self.send_board(True)

    def advertise(self):
        flags = b"\x02\x01\x06"
        service = b"\x11\x07" + bytes(SERVICE)
        name = self.name.encode()
        name_field = struct.pack("BB", len(name) + 1, 0x09) + name
        self.ble.gap_advertise(100000, adv_data=flags + name_field, resp_data=service)
        print("[BLE] Advertising:", self.name, "| Select this name in the webpage.")

    def _irq(self, event, data):
        if event == IRQ_CONNECT:
            self.mtu = 23
            self.accel_count = 0
            self.connection = data[0]
            self.connection_log_pending = True
            self.streaming = False
            self.commands.clear()
            self.blink_toggles = 6
        elif event == IRQ_DISCONNECT:
            self.accel_count = 0
            self.connection = None
            self.connection_log_pending = True
            self.streaming = False
            self.commands.clear()
            self.advertise_pending = True
        elif event == IRQ_MTU and data[0] == self.connection:
            self.mtu = data[1]
        elif event == IRQ_WRITE and data[1] == self.cmd_handle:
            command = self.ble.gatts_read(self.cmd_handle)
            if len(self.commands) < 8:
                self.commands.append(command)
            else:
                print("BLE command queue overflow; disconnecting client")
                self.ble.gap_disconnect(data[0])

    def send(self, packet):
        payload = (json.dumps(packet) + "\n").encode()
        connection = self.connection
        # 20 bytes also works with the default ATT MTU of 23.
        for offset in range(0, len(payload), 20):
            if connection is None or self.connection != connection:
                return
            self.ble.gatts_notify(connection, self.tx_handle, payload[offset:offset + 20])
            time.sleep_ms(10)

    def flush_acceleration(self):
        count = self.accel_count
        self.accel_count = 0
        connection = self.connection
        if not count or connection is None:
            return
        sequence = self.accel_batch_sequence
        self.accel_batch_sequence = (sequence + 1) & 0xFFFF
        samples_per_fragment = max(1, min(10, (self.mtu - 7) // 16))
        for offset in range(0, count, samples_per_fragment):
            if self.connection != connection:
                return
            end = min(count, offset + samples_per_fragment)
            payload = struct.pack("<HBB", sequence, offset, count)
            payload += self.accel_batch[offset * 16:end * 16]
            self.ble.gatts_notify(connection, self.accel_handle, payload)

    def send_acceleration(self, uptime, data):
        if self.accel_buffered:
            struct.pack_into("<Ifff", self.accel_batch, self.accel_count * 16,
                             uptime & 0xFFFFFFFF, *data)
            self.accel_count += 1
            if self.accel_count == 10:
                self.flush_acceleration()
        else:
            self.ble.gatts_notify(self.connection, self.accel_handle,
                                 struct.pack("<Ifff", uptime & 0xFFFFFFFF, *data))

    def process_commands(self):
        while self.commands:
            raw = self.commands.pop(0)
            try:
                command = raw.decode().strip()
            except UnicodeError:
                self.send({"type": "error", "message": "Command must be UTF-8"})
                continue
            print("[CMD]", command)
            if command in ("START:ENV", "START:ENV_VOC"):
                self.mode = "env_voc" if command == "START:ENV_VOC" else "env"
                self.streaming = True
                self.revision += 1
            elif command in ("START:IMU", "START:IMU_BATCH"):
                if command == "START:IMU_BATCH" and self.imu_interval != 5:
                    self.send({"type": "error", "message": "Buffered IMU requires 200 Hz"})
                    continue
                self.accel_count = 0
                self.accel_batch_sequence = 0
                self.accel_buffered = command == "START:IMU_BATCH"
                self.mode = "imu"
                self.streaming = True
                self.revision += 1
            elif command in ("START:LIGHT", "START:UV", "START:VOC", "START:IV"):
                self.mode = command.split(":")[1].lower()
                self.streaming = True
                self.revision += 1
            elif command in ("STOP:ENV", "STOP", "STOP:IMU_BATCH"):
                if self.mode == "imu" and self.accel_buffered:
                    self.flush_acceleration()
                self.streaming = False
                if command == "STOP:IMU_BATCH":
                    self.send({"type": "imu_stopped", "ts": 0, "seq": 0})
            elif command.startswith(("SET_ENV_RATE:", "SET_SENSOR_RATE:")):
                value = command.split(":", 1)[1]
                if value in ("200", "500", "1000", "2000", "5000"):
                    self.interval = int(value)
                    self.reschedule = True
                else:
                    self.send({"type": "error", "message": "Rate must be 200, 500, 1000, 2000 or 5000 ms"})
            elif command.startswith("SET_IMU_RATE:"):
                value = command.split(":", 1)[1]
                if value in ("25", "50", "100", "200"):
                    if self.streaming and self.mode == "imu" and self.accel_buffered and value != "200":
                        self.send({"type": "error", "message": "Stop buffered IMU before changing rate"})
                        continue
                    self.imu_interval = 1000 // int(value)
                    self.revision += 1
                else:
                    self.send({"type": "error", "message": "IMU rate must be 25, 50, 100 or 200 Hz"})
            elif command == "GET_BOARD":
                self.send_board()
            elif command == "IDENTIFY":
                self.blink_toggles = 20
            elif command == "CLEAR_BOARD":
                self.change_board(None)
            elif command.startswith("SET_BOARD:"):
                value = command.split(":", 1)[1]
                if value.isdigit() and len(value) <= 2 and 1 <= int(value) <= 99:
                    self.change_board(int(value))
                else:
                    self.send({"type": "error", "message": "보드 번호는 1부터 99까지의 숫자여야 합니다."})
            else:
                self.send({"type": "error", "message": "Unknown command"})

    def report_status(self, uptime, sensor_ok, imu_ok):
        connection = "CONNECTED" if self.connection is not None else "ADVERTISING"
        measurement = self.mode.upper() if self.streaming else "IDLE"
        print("[STATUS] uptime=%ds name=%s BLE=%s mode=%s BME280=%s IMU=%s sent=%d"
              % (uptime // 1000, self.name, connection, measurement,
                 "OK" if sensor_ok else "ERROR", "OK" if imu_ok else "ERROR",
                 self.sent_samples))
        if self.streaming and self.last_data is not None and self.last_data_mode == self.mode:
            if self.mode == "env":
                print("[DATA] temp=%.2f C humidity=%.2f %% pressure=%.3f kPa"
                      % (self.last_data["temp"], self.last_data["humidity"], self.last_data["pressure"]))
            elif self.mode == "imu":
                print("[DATA] X=%.4f Y=%.4f Z=%.4f g" % self.last_data)
            else:
                print("[DATA]", self.mode.upper(), self.last_data)


def main():
    print("[I2C] Initializing I2C0 SDA=GP20 SCL=GP21")
    i2c = machine.I2C(0, sda=machine.Pin(20), scl=machine.Pin(21), freq=400000)
    print("I2C devices:", [hex(address) for address in i2c.scan()])
    sensor = None
    sensor_error = None
    try:
        sensor = BME280(i2c, address=0x76)
        print("[SENSOR] BME280 OK at 0x76")
    except (OSError, RuntimeError) as error:
        sensor_error = "BME280 init failed; check GP20/GP21 and board orientation: " + str(error)
        print(sensor_error)

    imu = None
    imu_error = None
    try:
        imu = IMU(i2c)
        print("[IMU] %s driver=%s range=+/-16g VERIFIED ACCEL_CONFIG=0x%02X scale=2048 LSB/g"
              % (imu.kind, imu.DRIVER_VERSION, imu.range_config))
    except (OSError, RuntimeError) as error:
        imu_error = "IMU init failed at 0x68: " + str(error)
        print(imu_error)

    sensors = {"env": sensor, "imu": imu}
    sensor_errors = {"env": sensor_error, "imu": imu_error}
    for mode, create in (
        ("light", lambda: TSL2591(i2c)),
        ("uv", lambda: LTR390(i2c)),
        ("voc", lambda: SGP40(i2c, sensor)),
        ("iv", lambda: CurrentMonitor(i2c)),
    ):
        try:
            sensors[mode] = create()
            print("[SENSOR]", mode.upper(), "OK")
        except (OSError, RuntimeError) as error:
            sensors[mode] = None
            sensor_errors[mode] = mode.upper() + " init failed: " + str(error)
            print("[SENSOR]", sensor_errors[mode])

    try:
        led = machine.Pin("LED", machine.Pin.OUT)
        led.value(0)
    except (ValueError, TypeError, OSError, AttributeError) as error:
        led = None
        print("[LED] Board LED unavailable:", error)

    print("[BLE] Initializing radio and GATT services")
    peripheral = EnvironmentBLE()
    print("[READY] Keep this program running. Do not press Thonny Stop.")
    print("[READY] Open the HTTPS lab in Chrome/Edge and click Bluetooth connect.")
    previous = time.ticks_ms()
    uptime = 0
    next_sample = 0
    sequence = 0
    revision = -1
    next_status = 0
    next_blink = 0
    failures = 0
    voc_active = False
    try:
        while True:
            now = time.ticks_ms()
            uptime += time.ticks_diff(now, previous)
            previous = now
            try:
                if peripheral.connection_log_pending:
                    peripheral.connection_log_pending = False
                    print("[BLE] Connected handle=%d" % peripheral.connection
                          if peripheral.connection is not None else "[BLE] Disconnected; restarting advertising")
                if peripheral.advertise_pending:
                    peripheral.advertise_pending = False
                    peripheral.advertise()
                if led is not None and peripheral.blink_toggles and uptime >= next_blink:
                    # 연결 직후(또는 IDENTIFY 명령) LED 를 깜빡여 어느 보드인지 알려 준다.
                    peripheral.blink_toggles -= 1
                    led.value(peripheral.blink_toggles & 1)
                    next_blink = uptime + 150
                peripheral.process_commands()
                if peripheral.reschedule:
                    # 측정 간격을 바꾸면 이미 잡힌 긴 대기를 기다리지 않고 바로 적용한다.
                    peripheral.reschedule = False
                    next_sample = min(next_sample, uptime + peripheral.interval)
                if voc_active and (peripheral.mode not in ("voc", "env_voc") or not peripheral.streaming):
                    voc_active = False
                    try:
                        sensors["voc"].stop()
                    except (OSError, RuntimeError) as error:
                        print("[SENSOR] VOC heater stop failed:", error)
                if revision != peripheral.revision:
                    revision = peripheral.revision
                    next_sample = uptime
                    if peripheral.mode != "imu":
                        peripheral.accel_count = 0
                    if peripheral.mode == "imu" and imu is not None:
                        try:
                            imu.set_rate(1000 // peripheral.imu_interval)
                            config = imu.verify_range()
                            print("[IMU] +/-16g VERIFIED ACCEL_CONFIG=0x%02X" % config)
                        except (OSError, RuntimeError) as error:
                            peripheral.send({"type": "error", "message": "IMU rate setup failed: " + str(error)})
                            peripheral.streaming = False
                if peripheral.streaming and uptime >= next_sample:
                    selected_mode = "env" if peripheral.mode == "env_voc" else peripheral.mode
                    selected = sensors[selected_mode]
                    if selected is None:
                        peripheral.send({"type": "error", "message": sensor_errors[selected_mode]})
                        peripheral.streaming = False
                    elif peripheral.mode == "env_voc" and sensors["voc"] is None:
                        peripheral.send({"type": "error", "message": sensor_errors["voc"]})
                        peripheral.streaming = False
                    else:
                        try:
                            if peripheral.mode in ("voc", "env_voc"):
                                voc_active = True
                            data = selected.read()
                            if peripheral.mode == "env_voc":
                                data.update(sensors["voc"].read(data))
                        except (OSError, RuntimeError) as error:
                            message = peripheral.mode + " read failed: " + str(error)
                            print(message)
                            peripheral.send({"type": "error", "message": message})
                            peripheral.streaming = False
                        else:
                            if peripheral.mode != "imu":
                                peripheral.send({"type": peripheral.mode, "ts": uptime, "seq": sequence, "data": data})
                                sequence += 1
                            elif peripheral.connection is not None:
                                peripheral.send_acceleration(uptime, data)
                            if peripheral.connection is not None:
                                peripheral.sent_samples += 1
                                peripheral.last_data = data
                                peripheral.last_data_mode = peripheral.mode
                    interval = (peripheral.imu_interval if peripheral.mode == "imu" else
                                1000 if peripheral.mode in ("voc", "env_voc") else peripheral.interval)
                    next_sample += interval
                    if next_sample <= uptime:
                        next_sample = uptime + interval
                failures = 0
            except OSError as error:
                print("[BLE] transport error:", error)
                peripheral.streaming = False
                if peripheral.connection is not None:
                    try:
                        peripheral.ble.gap_disconnect(peripheral.connection)
                    except OSError:
                        pass
            except Exception as error:
                # 예상하지 못한 오류로 펌웨어가 멈추지 않게 한다. 측정만 멈추고 계속 돈다.
                failures += 1
                peripheral.streaming = False
                gc.collect()
                print("[ERROR] Unexpected firmware error (%d/%d)" % (failures, MAX_CONSECUTIVE_FAILURES))
                log_exception(error)
                if failures >= MAX_CONSECUTIVE_FAILURES:
                    print("[RESTART] Too many errors in a row; restarting the board in 2 s.")
                    time.sleep_ms(2000)
                    machine.reset()
                try:
                    peripheral.send({"type": "error", "message": "Firmware error: " + repr(error)})
                except Exception:
                    pass
            if uptime >= next_status:
                peripheral.report_status(uptime, sensor is not None, imu is not None)
                next_status = uptime + 5000
            time.sleep_ms(1)
    finally:
        peripheral.ble.active(False)
        if voc_active:
            try:
                sensors["voc"].stop()
            except (OSError, RuntimeError):
                pass
        if led is not None:
            try:
                led.value(0)
            except OSError:
                pass
        print("[STOP] BLE stopped. Run main.py again or reconnect power to advertise.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("[STOP] Program interrupted from USB/Thonny.")
    except Exception as error:
        print("[FATAL] Firmware stopped; Bluetooth search is unavailable.")
        log_exception(error)
        raise
