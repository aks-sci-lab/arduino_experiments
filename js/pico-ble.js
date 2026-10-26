(function (root) {
    'use strict';

    async function discover(device, serviceId, characteristicIds, onRetry, options = {}) {
        const checkCancelled = () => {
            if (options.isCancelled?.()) {
                const error = new Error('연결 준비가 취소되었습니다.');
                error.name = 'AbortError';
                throw error;
            }
        };
        if (device.gatt.connected) {
            device.gatt.disconnect();
            await new Promise(resolve => setTimeout(resolve, 750));
        }
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                checkCancelled();
                const server = await device.gatt.connect();
                checkCancelled();
                const service = await server.getPrimaryService(serviceId);
                const characteristics = [];
                for (const id of characteristicIds) {
                    characteristics.push(await service.getCharacteristic(id));
                }
                if (!device.gatt.connected) throw new Error('GATT connection lost during discovery');
                checkCancelled();
                if (options.prepare) await options.prepare(characteristics);
                checkCancelled();
                if (!device.gatt.connected) throw new Error('GATT connection lost during setup');
                return characteristics;
            } catch (error) {
                options.cleanup?.();
                const cancelled = error.name === 'AbortError' || options.isCancelled?.();
                if (cancelled && device.gatt.connected) device.gatt.disconnect();
                const transient = !cancelled
                    && (!device.gatt.connected || error.name === 'NetworkError');
                if (!transient || attempt === 3) throw error;
                if (device.gatt.connected) device.gatt.disconnect();
                console.warn('Pico GATT connection setup retry:', attempt, error);
                onRetry(attempt, error);
                await new Promise(resolve => setTimeout(resolve, attempt * 750));
            }
        }
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { discover };
    else root.PicoBLE = { discover };
})(typeof globalThis !== 'undefined' ? globalThis : this);
