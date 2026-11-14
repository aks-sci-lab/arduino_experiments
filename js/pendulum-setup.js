/* 스마트폰 진자 — 선생님 설정 화면 (projects/pendulum-setup.html)
   - 구글 로그인(사이트의 Firebase 로그인 그대로) → 내 웹 앱 주소를 내 계정에 저장
     Firestore pendulumTeachers/{uid} = { scriptId, updatedAt } (본인만 읽고 씀, firestore.rules)
   - 연결 시험(ping)에 성공하면 "우리 반 링크" = pendulum-report.html?s=<스크립트 ID> 와 QR
   - 학생 쪽은 Firestore 를 읽지 않는다: 링크에 든 ID 로 바로 그 시트에 보낸다 (js/pendulum-cloud.js resolveServer) */
(function () {
    'use strict';
    var PC = window.PendulumCloud, CONFIG = window.PENDULUM_CONFIG || {};
    var $ = function (id) { return document.getElementById(id); };
    var FIREBASE_CONFIG = {
        projectId: 'web-experiment-f9b24',
        appId: '1:718758606428:web:e11ed8d0b64a471ee65899',
        storageBucket: 'web-experiment-f9b24.firebasestorage.app',
        apiKey: 'AIzaSyCYVme6ZP-iyspRmHTtuUSsKXe7K_D0vJQ',
        authDomain: 'web-experiment-f9b24.firebaseapp.com',
        messagingSenderId: '718758606428'
    };
    var auth = null, db = null, user = null, savedId = null;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    // ---------- 우리 반 링크 ----------
    function classLink(id) { return new URL('pendulum-report.html?s=' + encodeURIComponent(id), location.href).href; }
    function showLink(id, saved) {
        var url = classLink(id);
        $('linkCard').hidden = false;
        $('classLink').href = url; $('classLink').textContent = url;
        $('btnOpenReport').href = url + '#step-5';
        $('linkSheet').textContent = id.slice(0, 6) + '…' + id.slice(-4);
        $('linkSaved').textContent = saved ? '· 내 계정에 저장됨' : (user ? '' : '· 로그인하지 않아 저장되지 않음 (링크를 따로 적어 두세요)');
        $('sheetLink').href = PC.urlFromScriptId(id) + '?action=ping'; $('sheetLink').hidden = false;
        if (typeof window.qrcode === 'function') {
            var qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
            $('linkQr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
        } else $('linkQr').textContent = '';
    }

    // ---------- 로그인·저장 ----------
    function initFirebase() {
        if (typeof firebase === 'undefined') {
            $('authMsg').textContent = '로그인 도구를 불러오지 못했어요(인터넷 확인). 로그인 없이도 3번에서 연결 시험과 링크 만들기는 돼요.';
            $('btnLogin').disabled = true;
            return;
        }
        try {
            if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
            auth = firebase.auth(); db = firebase.firestore();
        } catch (e) { $('authMsg').textContent = '로그인 준비 오류: ' + e.message; return; }
        auth.onAuthStateChanged(function (u) {
            user = u;
            renderAuth();
            if (u) loadSaved();
        });
    }
    function renderAuth() {
        var box = $('authBox');
        if (user) {
            box.innerHTML = '<span>👤 <b>' + esc(user.displayName || user.email || '로그인됨') + '</b></span> <button id="btnLogout" type="button">로그아웃</button>';
            $('btnLogout').addEventListener('click', function () { auth.signOut(); savedId = null; $('linkCard').hidden = true; });
        } else {
            box.innerHTML = '<button id="btnLogin" class="btn-primary" type="button">G 구글로 로그인</button>';
            $('btnLogin').addEventListener('click', login);
            $('authMsg').textContent = '';
        }
    }
    function login() {
        if (!auth) return;
        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(function (err) {
            $('authMsg').textContent = '로그인하지 못했어요: ' + err.message;
        });
    }
    function docRef() { return db.collection('pendulumTeachers').doc(user.uid); }
    async function loadSaved() {
        $('authMsg').textContent = '저장된 설정을 불러오는 중…';
        try {
            var snap = await docRef().get();
            var id = snap.exists ? snap.data().scriptId : null;
            if (PC.isScriptId(id)) {
                savedId = id;
                $('url').value = PC.urlFromScriptId(id);
                showLink(id, true);
                $('authMsg').textContent = '✅ 저장된 내 시트를 불러왔어요.';
            } else {
                $('authMsg').textContent = '아직 저장된 시트가 없어요. 아래 1~3번을 따라 해 주세요.';
            }
        } catch (e) {
            $('authMsg').textContent = '저장된 설정을 읽지 못했어요(' + (e.code || e.message) + '). 사이트 관리자가 Firestore 규칙을 게시했는지 확인하세요. 3번은 그대로 할 수 있어요.';
        }
    }

    async function testAndSave() {
        var id = PC.scriptIdFromUrl($('url').value);
        var msg = $('saveMsg');
        if (!id) { msg.textContent = '❌ 주소는 https://script.google.com/macros/s/…/exec 모양이어야 해요. 배포 화면의 "웹 앱 URL"을 그대로 복사해 붙여 넣으세요.'; return; }
        $('btnSave').disabled = true;
        msg.textContent = '⏳ 연결 시험 중…';
        var url = PC.urlFromScriptId(id);
        var res = await fetch(url + '?action=ping', { redirect: 'follow' })
            .then(function (r) { return r.text(); }).then(PC.parseResponse)
            .catch(function (e) { return { ok: false, error: '연결하지 못했어요 (' + (e && e.message || e) + '). "액세스: 모든 사용자"로 배포했는지 확인하세요.' }; });
        if (!res.ok) { $('btnSave').disabled = false; msg.textContent = '❌ ' + res.error; return; }
        var saved = false;
        if (user && db) {
            try {
                await docRef().set({ scriptId: id, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                saved = true; savedId = id;
                $('authMsg').textContent = '✅ 내 시트가 계정에 저장되어 있어요.';
            } catch (e) {
                msg.textContent = '✅ 연결됨. 하지만 계정에 저장하지 못했어요(' + (e.code || e.message) + '). 아래 링크는 그대로 쓸 수 있어요.';
            }
        }
        $('btnSave').disabled = false;
        if (saved || !user) msg.textContent = '✅ 연결됨 (버전 ' + res.version + ')' + (saved ? ' · 내 계정에 저장했어요.' : ' · 로그인하면 계정에 저장돼요.');
        showLink(id, saved);
        $('linkCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---------- 시작 ----------
    function init() {
        if (CONFIG.templateCopyUrl && /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/copy/.test(CONFIG.templateCopyUrl)) {
            $('tplBox').hidden = false;
            $('btnTemplate').href = CONFIG.templateCopyUrl;
        } else {
            $('pasteBox').open = true;
            $('pasteSummary').textContent = '코드 붙여 넣어 만들기';
        }
        var codeText = '';
        fetch('../apps-script/Code.gs').then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
            .then(function (t) { codeText = t; $('code').textContent = t; })
            .catch(function () { $('code').textContent = '코드를 불러오지 못했어요. 저장소의 apps-script/Code.gs 파일을 열어 복사하세요.'; });
        $('btnCopyCode').addEventListener('click', async function () {
            if (!codeText) return;
            try { await navigator.clipboard.writeText(codeText); $('btnCopyCode').textContent = '✅ 복사했어요'; }
            catch (e) { $('code').closest('details').open = true; alert('복사가 막혀 있어요. 펼쳐진 코드를 직접 선택해 복사하세요.'); }
            setTimeout(function () { $('btnCopyCode').textContent = '📋 코드 복사'; }, 1500);
        });
        $('btnSave').addEventListener('click', testAndSave);
        $('url').addEventListener('keydown', function (e) { if (e.key === 'Enter') testAndSave(); });
        $('btnCopyLink').addEventListener('click', async function () {
            var url = $('classLink').href;
            try { await navigator.clipboard.writeText(url); $('btnCopyLink').textContent = '✅ 복사함'; }
            catch (e) { prompt('아래 링크를 복사하세요.', url); }
            setTimeout(function () { $('btnCopyLink').textContent = '🔗 링크 복사'; }, 1500);
        });
        $('btnLogin').addEventListener('click', login);
        initFirebase();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
