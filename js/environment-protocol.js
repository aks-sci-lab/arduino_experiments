(function (root) {
    'use strict';

    function validateSample(packet) {
        if (!packet || packet.type !== 'env' || !packet.data) {
            throw new Error('환경 센서 데이터 형식이 올바르지 않습니다.');
        }
        const { temp, humidity, pressure } = packet.data;
        if (![temp, humidity, pressure, packet.ts, packet.seq].every(Number.isFinite)
            || temp < -40 || temp > 85 || humidity < 0 || humidity > 100
            || pressure < 30 || pressure > 110
            || !Number.isSafeInteger(packet.ts) || packet.ts < 0
            || !Number.isSafeInteger(packet.seq) || packet.seq < 0) {
            throw new Error('센서 값 또는 측정 시각이 범위를 벗어났습니다. 기압 단위는 kPa입니다.');
        }
        return packet;
    }

    class Receiver {
        constructor(onSample, onError, validator = validateSample) {
            this.onSample = onSample;
            this.onError = onError;
            this.validator = validator;
            this.reset();
        }

        reset() {
            this.buffer = '';
            this.decoder = new TextDecoder('utf-8', { fatal: true });
            this.lastTimestamp = -1;
            this.lastSequence = -1;
        }

        push(value) {
            try {
                this.buffer += this.decoder.decode(value, { stream: true });
                let newline;
                while ((newline = this.buffer.indexOf('\n')) !== -1) {
                    const line = this.buffer.slice(0, newline);
                    this.buffer = this.buffer.slice(newline + 1);
                    if (line.length > 1024) throw new Error('BLE 메시지가 너무 깁니다.');
                    if (!line.trim()) continue;
                    const packet = JSON.parse(line);
                    if (packet && packet.type === 'error' && typeof packet.message === 'string') {
                        throw new Error('Pico: ' + packet.message);
                    }
                    this.validator(packet);
                    if (packet.seq <= this.lastSequence || packet.ts < this.lastTimestamp) {
                        throw new Error('중복되거나 순서가 잘못된 측정 데이터입니다. Pico를 다시 연결하세요.');
                    }
                    this.lastSequence = packet.seq;
                    this.lastTimestamp = packet.ts;
                    this.onSample(packet);
                }
                if (this.buffer.length > 1024) throw new Error('BLE 메시지 종료 문자가 없습니다.');
            } catch (error) {
                this.buffer = '';
                this.decoder = new TextDecoder('utf-8', { fatal: true });
                this.onError(error);
            }
        }
    }

    const protocol = { Receiver, validateSample, version: 'multi-sensor-v2' };
    if (typeof module !== 'undefined' && module.exports) module.exports = protocol;
    else root.EnvironmentProtocol = protocol;
})(typeof globalThis !== 'undefined' ? globalThis : this);
