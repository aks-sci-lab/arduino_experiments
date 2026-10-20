// 센서(또는 시뮬레이션) 표본 수집기. 측정 탭과 데이터 탭이 하나를 번갈아 쓴다.
import { makeSimSignal } from './analysis.js';

const SIM_HZ = 60;
const WATCHDOG_MS = 2000;

// onSample({ t(ms, 시작 후), ax, ay, az, m }), onError(message)
export function createSampler({ onSample, onError }) {
  let running = false;
  let source = null;
  let t0 = 0;
  let simTimer = null;
  let watchdog = null;
  let gotEvent = false;
  let wakeLock = null;

  function handleMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null) return;
    gotEvent = true;
    onSample({ t: performance.now() - t0, ax: a.x, ay: a.y, az: a.z, m: Math.hypot(a.x, a.y, a.z) });
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* 지원하지 않으면 무시 */ }
  }

  async function startSensor() {
    if (typeof DeviceMotionEvent === 'undefined') {
      onError('이 브라우저에서는 가속도 센서(DeviceMotionEvent)를 사용할 수 없습니다. 시뮬레이션을 사용해 보세요.');
      return false;
    }
    if (!window.isSecureContext) {
      onError('센서는 HTTPS 주소에서만 동작합니다. https:// 로 시작하는 주소로 접속하세요.');
      return false;
    }
    // iOS 13+ 는 사용자 동작(클릭) 안에서 권한 요청이 필요하다.
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== 'granted') {
          onError('센서 권한이 거부되었습니다. Safari 설정에서 "동작 및 방향" 접근을 허용한 뒤 다시 시도하세요.');
          return false;
        }
      } catch (e) {
        onError('센서 권한 요청에 실패했습니다: ' + e.message);
        return false;
      }
    }
    t0 = performance.now();
    gotEvent = false;
    window.addEventListener('devicemotion', handleMotion);
    watchdog = setTimeout(() => {
      if (!gotEvent) onError('센서 데이터가 들어오지 않습니다. 스마트폰에서 접속했는지, 브라우저가 센서를 지원하는지 확인하세요. PC라면 시뮬레이션을 사용하세요.');
    }, WATCHDOG_MS);
    requestWakeLock();
    return true;
  }

  function startSim(kind) {
    t0 = performance.now();
    const sig = makeSimSignal(kind);
    simTimer = setInterval(() => {
      const t = performance.now() - t0;
      const m = Math.max(0, sig(t / 1000));
      onSample({ t, ax: 0, ay: m, az: 0, m });
    }, 1000 / SIM_HZ);
    return true;
  }

  return {
    get running() { return running; },
    get source() { return source; },
    // src: 'sensor' | 'walk' | 'run' (시뮬레이션 종류)
    async start(src) {
      this.stop();
      const ok = src === 'sensor' ? await startSensor() : startSim(src);
      if (ok) {
        running = true;
        source = src;
      }
      return ok;
    },
    stop() {
      if (!running && !simTimer) return;
      running = false;
      window.removeEventListener('devicemotion', handleMotion);
      clearInterval(simTimer);
      simTimer = null;
      clearTimeout(watchdog);
      wakeLock?.release().catch(() => {});
      wakeLock = null;
    },
  };
}

