"""Waveshare Pico-Environment-Sensor, MicroPython BLE."""

import sys
print("[BOOT] Pico lab firmware starting")
print("[BOOT] MicroPython:", sys.version)
try:
    import bluetooth
except ImportError:
    print("[FATAL] bluetooth module missing. Install RPI_PICO2_W MicroPython UF2.")
    raise
import json
import machine
import struct
import time
from micropython import const
try:
    from bme280 import BME280
    from imu import IMU
    from extra_sensors import TSL2591, LTR390, SGP40
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
        suffix = "".join("%02X" % b for b in machine.unique_id()[-2:])
        self.name = "PicoEnv-" + suffix
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
        self.advertise()

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
            elif command in ("START:LIGHT", "START:UV", "START:VOC"):
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
                if value in ("1000", "2000", "5000"):
                    self.interval = int(value)
                else:
                    self.send({"type": "error", "message": "Rate must be 1000, 2000 or 5000 ms"})
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
    ):
        try:
            sensors[mode] = create()
            print("[SENSOR]", mode.upper(), "OK")
        except (OSError, RuntimeError) as error:
            sensors[mode] = None
            sensor_errors[mode] = mode.upper() + " init failed: " + str(error)
            print("[SENSOR]", sensor_errors[mode])

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
                peripheral.process_commands()
                if voc_active and (peripheral.mode not in ("voc", "env_voc") or not peripheral.streaming):
                    voc_active = False
                    sensors["voc"].stop()
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
            except OSError as error:
                print("BLE transport error:", error)
                peripheral.streaming = False
                if peripheral.connection is not None:
                    peripheral.ble.gap_disconnect(peripheral.connection)
            if uptime >= next_status:
                peripheral.report_status(uptime, sensor is not None, imu is not None)
                next_status = uptime + 5000
            time.sleep_ms(1)
    finally:
        peripheral.ble.active(False)
        if voc_active:
            sensors["voc"].stop()
        print("[STOP] BLE stopped. Run main.py again or reconnect power to advertise.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("[STOP] Program interrupted from USB/Thonny.")
    except Exception as error:
        print("[FATAL] Firmware stopped; Bluetooth search is unavailable.")
        sys.print_exception(error)
        raise
