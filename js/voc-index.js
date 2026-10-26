(function (root) {
    'use strict';
    const wasmUrl = typeof document !== 'undefined'
        ? new URL('../vendor/sensirion/voc-index.wasm?v=3.2.0-1', document.currentScript.src).href : null;
    const version = 'sensirion-fixed-3.2.0';

    class Processor {
        constructor(instance) {
            this.algorithm = instance.exports;
            this.reset();
        }

        reset() {
            this.algorithm.voc_reset();
            this.lastTimestamp = null;
            this.lastSequence = null;
            this.count = 0;
        }

        process(packet) {
            const { sraw } = packet.data;
            if (!Number.isInteger(sraw) || sraw <= 0 || sraw >= 65000) {
                throw new Error('VOC Index 계산에 유효하지 않은 SRAW입니다.');
            }
            // Missing measurements cannot be replaced by repeated or interpolated raw values.
            const interrupted = this.lastTimestamp !== null
                && (packet.seq !== this.lastSequence + 1
                    || Math.abs(packet.ts - this.lastTimestamp - 1000) > 250);
            if (interrupted) this.reset();
            this.lastTimestamp = packet.ts;
            this.lastSequence = packet.seq;
            this.count++;
            const index = this.algorithm.voc_process(sraw);
            if (!Number.isInteger(index) || index < 0 || index > 500) {
                throw new Error('제조사 알고리즘이 유효하지 않은 VOC Index를 반환했습니다.');
            }
            return {
                index: index === 0 || packet.data.warmup > 0 ? null : index,
                learningRemaining: Math.max(0, 47 - this.count),
                interrupted, algorithm: version
            };
        }
    }

    async function fromBytes(bytes) {
        const { instance } = await WebAssembly.instantiate(bytes);
        return new Processor(instance);
    }

    async function create() {
        const response = await fetch(wasmUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`VOC 알고리즘 다운로드 실패 (HTTP ${response.status})`);
        return fromBytes(await response.arrayBuffer());
    }

    const api = { create, fromBytes, version };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.VOCIndex = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
