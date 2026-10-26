(function (root) {
    'use strict';

    class Receiver {
        constructor() { this.reset(); }
        reset() {
            this.previous = null;
            this.elapsedMs = 0;
            this.batchSequence = null;
            this.lastBatchSequence = null;
            this.batchCount = 0;
            this.batchOffset = 0;
            this.batchBytes = new Uint8Array(160);
            this.droppedBatches = 0;
        }
        readBatch(view) {
            if (!(view instanceof DataView) || view.byteLength < 20 || (view.byteLength - 4) % 16 !== 0) {
                throw new Error('버퍼 가속도 조각 형식이 올바르지 않습니다. 최신 main.py를 확인하세요.');
            }
            const sequence = view.getUint16(0, true);
            const offset = view.getUint8(2);
            const count = view.getUint8(3);
            const length = (view.byteLength - 4) / 16;
            if (count < 1 || count > 10 || offset + length > count) {
                throw new Error('버퍼 가속도 묶음 크기가 올바르지 않습니다.');
            }
            if (offset === 0) {
                if (this.batchSequence !== null) {
                    throw new Error('버퍼 가속도 묶음이 누락되었습니다. 측정을 중지하고 다시 연결하세요.');
                }
                if (this.lastBatchSequence !== null) {
                    const difference = (sequence - this.lastBatchSequence) & 0xFFFF;
                    if (difference === 0 || difference > 32768) throw new Error('버퍼 묶음 순서가 올바르지 않습니다.');
                    this.droppedBatches += difference - 1;
                }
                this.batchSequence = sequence;
                this.batchCount = count;
                this.batchOffset = 0;
            }
            if (sequence !== this.batchSequence || count !== this.batchCount || offset !== this.batchOffset) {
                throw new Error('버퍼 가속도 조각이 누락되거나 순서가 잘못되었습니다.');
            }
            this.batchBytes.set(new Uint8Array(view.buffer, view.byteOffset + 4, view.byteLength - 4), offset * 16);
            this.batchOffset += length;
            if (this.batchOffset !== count) return [];
            const samples = this.read(new DataView(this.batchBytes.buffer, 0, count * 16));
            this.lastBatchSequence = sequence;
            this.batchSequence = null;
            this.batchOffset = 0;
            return samples;
        }
        read(view) {
            if (!(view instanceof DataView) || view.byteLength === 0 || view.byteLength % 16 !== 0) {
                throw new Error('Pico 가속도 패킷은 16바이트의 배수여야 합니다.');
            }
            const samples = [];
            let previous = this.previous;
            let elapsedMs = this.elapsedMs;
            for (let offset = 0; offset < view.byteLength; offset += 16) {
                const timestamp = view.getUint32(offset, true);
                const x = view.getFloat32(offset + 4, true);
                const y = view.getFloat32(offset + 8, true);
                const z = view.getFloat32(offset + 12, true);
                if (![x, y, z].every(value => Number.isFinite(value) && Math.abs(value) <= 16)) {
                    throw new Error('가속도 값이 유효하지 않습니다. 단위는 g, 축별 범위는 ±16g입니다.');
                }
                if (previous !== null) {
                    const delta = (timestamp - previous) >>> 0;
                    if (delta === 0 || delta > 15000) throw new Error('측정 시각이 중복되거나 역순입니다. 다시 연결하세요.');
                    elapsedMs += delta;
                }
                previous = timestamp;
                samples.push({ timestamp, time: elapsedMs / 1000, x, y, z, total: Math.hypot(x, y, z) });
            }
            this.previous = previous;
            this.elapsedMs = elapsedMs;
            return samples;
        }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { Receiver };
    else root.AccelerometerProtocol = { Receiver };
})(typeof globalThis !== 'undefined' ? globalThis : this);
