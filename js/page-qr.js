/*
 * 페이지 QR 코드 단추
 * 화면 오른쪽 아래에 "📱 QR" 단추를 붙이고, 누르면 지금 페이지로 바로 들어오는
 * QR 코드를 크게 보여 준다. 학생은 스마트폰 카메라로 찍기만 하면 된다.
 * QR 그림은 jsdelivr 의 qrcode-generator 로 만들며, 단추를 누를 때 처음 한 번만 불러온다.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        root.PageQR = api;
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.install);
        else api.install();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    const LIB_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
    // 선생님용·개인 화면 주소는 학생에게 나눠 줄 주소로 바꾸거나 뺀다
    const PRIVATE_PARAMS = ['record', 'report'];

    // 학생에게 나눠 줄 주소: # 뒤는 빼고, 선생님 '고치기' 화면은 학생 화면 주소로 바꾼다
    function shareUrl(href) {
        const url = new URL(href);
        url.hash = '';
        const edit = url.searchParams.get('edit');
        if (edit !== null) {
            url.searchParams.delete('edit');
            if (edit && edit !== 'new') url.searchParams.set('id', edit);
        }
        PRIVATE_PARAMS.forEach(name => url.searchParams.delete(name));
        return url.toString();
    }

    let libPromise = null;
    function loadLib() {
        if (window.qrcode) return Promise.resolve(window.qrcode);
        if (!libPromise) {
            libPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = LIB_URL;
                script.onload = () => window.qrcode ? resolve(window.qrcode) : reject(new Error('QR 도구 없음'));
                script.onerror = () => { libPromise = null; reject(new Error('QR 도구를 불러오지 못했습니다')); };
                document.head.appendChild(script);
            });
        }
        return libPromise;
    }

    const CSS = `
button.pqr-btn{position:fixed;right:14px;bottom:14px;left:auto;top:auto;width:auto;margin:0;z-index:9998;border:none;border-radius:999px;padding:10px 14px;
 background:#1f6feb;color:#fff;font-size:15px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer}
.pqr-btn:hover{background:#1858c4}
.pqr-back{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px}
.pqr-box{background:#fff;color:#111;border-radius:14px;padding:18px;max-width:min(92vw,560px);width:100%;text-align:center;
 box-shadow:0 8px 30px rgba(0,0,0,.35);font-family:inherit}
.pqr-box h2{margin:0 0 4px;font-size:18px}
.pqr-box p{margin:4px 0;font-size:13px;color:#555}
.pqr-img{display:block;margin:12px auto;width:min(80vw,70vh,420px);height:auto;image-rendering:pixelated;background:#fff}
.pqr-url{font-family:monospace;font-size:12px;word-break:break-all;background:#f3f4f6;border-radius:6px;padding:6px 8px;margin:8px 0;color:#111}
.pqr-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:10px}
.pqr-row button{width:auto;margin:0;border:1px solid #ccc;background:#f8f8f8;color:#111;border-radius:8px;padding:8px 12px;font-size:14px;cursor:pointer}
.pqr-row button.pqr-main{background:#1f6feb;border-color:#1f6feb;color:#fff}
.pqr-box.pqr-big{max-width:96vw}
.pqr-box.pqr-big .pqr-img{width:min(92vw,80vh)}
@media print{.pqr-btn{display:none}}
`;

    function install() {
        if (document.querySelector('.pqr-btn')) return;
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pqr-btn';
        button.textContent = '📱 QR';
        button.title = '이 페이지로 바로 들어오는 QR 코드 보기';
        button.setAttribute('aria-label', '이 페이지 QR 코드 보기');
        button.addEventListener('click', open);
        document.body.appendChild(button);
    }

    async function open() {
        const link = shareUrl(location.href);
        const back = document.createElement('div');
        back.className = 'pqr-back';
        back.innerHTML = `
<div class="pqr-box" role="dialog" aria-modal="true" aria-label="이 페이지 QR 코드">
  <h2></h2>
  <p>스마트폰 카메라로 찍으면 이 페이지가 바로 열립니다.</p>
  <div class="pqr-slot"><p>QR 코드를 만드는 중…</p></div>
  <div class="pqr-url"></div>
  <div class="pqr-row">
    <button type="button" class="pqr-copy">🔗 주소 복사</button>
    <button type="button" class="pqr-bigger">🔍 크게 보기</button>
    <button type="button" class="pqr-main pqr-close">닫기</button>
  </div>
</div>`;
        back.querySelector('h2').textContent = document.title || '이 페이지';
        back.querySelector('.pqr-url').textContent = link;
        const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = event => { if (event.key === 'Escape') close(); };
        back.addEventListener('click', event => { if (event.target === back) close(); });
        back.querySelector('.pqr-close').addEventListener('click', close);
        back.querySelector('.pqr-bigger').addEventListener('click', event => {
            const box = back.querySelector('.pqr-box');
            box.classList.toggle('pqr-big');
            event.target.textContent = box.classList.contains('pqr-big') ? '🔎 작게 보기' : '🔍 크게 보기';
        });
        back.querySelector('.pqr-copy').addEventListener('click', async event => {
            try {
                await navigator.clipboard.writeText(link);
                event.target.textContent = '✅ 복사했어요';
            } catch (error) {
                event.target.textContent = '복사 안 됨 — 주소를 직접 고르세요';
            }
        });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(back);
        back.querySelector('.pqr-close').focus();

        const slot = back.querySelector('.pqr-slot');
        try {
            const qrcode = await loadLib();
            const qr = qrcode(0, 'M');
            qr.addData(link);
            qr.make();
            const img = document.createElement('img');
            img.className = 'pqr-img';
            img.alt = '이 페이지 QR 코드';
            img.src = qr.createDataURL(8, 4);
            slot.replaceChildren(img);
        } catch (error) {
            slot.innerHTML = '<p>QR 코드를 만들지 못했습니다. 인터넷 연결을 확인하거나 아래 주소를 나눠 주세요.</p>';
        }
    }

    return { shareUrl, install, open, LIB_URL };
});
