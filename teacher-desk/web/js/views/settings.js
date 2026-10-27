// ⚙ 설정: 학교·학급, 수집 폴더·시각, 텔레그램, 공유 페이지
import { api } from '../api.js';
import { el, clear, toast, guarded } from '../ui.js';
import { registerView, openTab, findTab, on, toggleLayoutMode } from '../shell.js';
import { store, loadState, saveSettings } from '../store.js';

function textField(key, label, hint, attrs = {}) {
    const input = el('input', { type: 'text', value: store.settings[key] ?? '', ...attrs });
    input.dataset.key = key;
    return el('label.field', el('span', label), input, hint && el('span.hint', hint));
}

function section(title, ...children) {
    return el('section.card', { style: 'margin-bottom: 16px' }, el('h3', title), children);
}

function collectForm(pane) {
    const out = {};
    for (const input of pane.querySelectorAll('[data-key]')) {
        out[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.value;
    }
    return out;
}

function renderSettings(pane, tab) {
    const s = store.settings;
    const st = store.state || {};
    const tg = st.telegram || {};
    const detail = el('select', { dataset: { key: 'telegram_detail' } },
        [['counts', '개수만 (가장 안전)'], ['titles', '제목까지 (기본)'], ['summary', '요약까지']]
            .map(([v, l]) => el('option', { value: v, selected: s.telegram_detail === v }, l)));
    const token = el('input', { type: 'password', placeholder: s.telegram_token_set ? '설정됨 (바꿀 때만 입력)' : 'BotFather 가 준 토큰', autocomplete: 'off' });
    const diagBox = el('div');

    const save = guarded(async () => {
        const change = collectForm(pane);
        change.collect_times = change.collect_times.split(',').map(t => t.trim()).filter(Boolean);
        if (token.value.trim()) change.telegram_token = token.value.trim();
        await saveSettings(change);
        await loadState();
        toast('설정을 저장했습니다');
        tab.rerender();
    });
    const tgAction = action => guarded(async () => {
        await api.post('/api/telegram', { action });
        await loadState();
        if (action === 'test') toast('시험 알림을 보냈습니다');
        tab.rerender();
    });
    const diagnose = source => guarded(async () => {
        const r = await api.get(`/api/diagnose?source=${source}`);
        clear(diagBox,
            el('p.small', '아래 결과에는 메시지 내용이 없고 파일 이름·형식만 있습니다. 쿨메신저 전용 읽기 기능을 만들 때 이 결과를 Claude Code 에게 전달하세요.'),
            el('button.btn.small', { onclick: guarded(async () => { await navigator.clipboard.writeText(JSON.stringify(r, null, 2)); toast('진단 결과를 복사했습니다'); }) }, '📋 결과 복사'),
            el('pre.text', JSON.stringify(r, null, 2)));
    });

    pane.append(
        el('h1', '설정'),
        el('p.sub', `업무 데스크 ${st.version || ''} · 모든 자료는 이 PC 의 teacher-desk/data 폴더에만 저장됩니다.`),
        section('🏫 학교·학급 (조퇴증·외출증에 인쇄)',
            el('div.grid2',
                textField('school_name', '학교 이름', null, { placeholder: '예: ○○고등학교' }),
                textField('teacher_name', '담임 이름'),
                textField('grade', '학년', null, { placeholder: '2' }),
                textField('class_no', '반', null, { placeholder: '3' }))),
        section('🔄 자동 수집',
            textField('edufine_folder', '에듀파인 공문 저장 폴더', '에듀파인에서 공문을 저장하는 폴더. 예: C:\\Users\\선생님\\Documents\\공문'),
            el('div.row', el('button.btn.small', { onclick: diagnose('edufine') }, '폴더 확인')),
            textField('coolmessenger_folder', '쿨메신저 저장 폴더', '쿨메신저가 메시지·받은 파일을 저장하는 폴더'),
            el('div.row', el('button.btn.small', { onclick: diagnose('cool') }, '🩺 쿨메신저 폴더 진단')),
            diagBox,
            el('label.field', el('span', '수집 시각'),
                el('input', { type: 'text', value: (s.collect_times || []).join(', '), dataset: { key: 'collect_times' } }),
                el('span.hint', '쉼표로 구분. 예: 09:00, 12:00, 15:00 — 업무 데스크가 켜져 있어야 합니다. 놓친 시각은 켜진 뒤 한 번 수집합니다.')),
            el('p.small.muted', `PDF 읽기: ${st.pdf_ready ? '준비됨' : '꺼짐 — 명령 프롬프트에서  pip install pypdf  실행 후 다시 시작'}`)),
        section('📱 텔레그램',
            el('ol.small', { style: 'margin: 0 0 12px; padding-left: 1.2em' },
                el('li', '텔레그램에서 @BotFather 를 찾아 /newbot 으로 봇을 만들고 토큰을 받습니다.'),
                el('li', '아래에 토큰을 넣고 저장합니다.'),
                el('li', '만든 봇에게 연결 코드를 보내면 선생님 계정만 연결됩니다.')),
            el('label.field', el('span', '봇 토큰'), token),
            el('p', '상태: ', el('b', tg.status || '-'),
                tg.linked ? ' · ✅ 연결됨' : (s.telegram_token_set ? ` · 봇에게 보낼 연결 코드: ` : ''),
                !tg.linked && s.telegram_token_set ? el('code', { style: 'font-size: 1.3em; font-weight: 800' }, `/start ${tg.pair_code}`) : null),
            el('label.field', el('span', '알림에 담을 내용'), detail,
                el('span.hint', '학생 이름·조퇴 사유는 어느 경우에도 보내지 않습니다. 공문 내용이 텔레그램 서버를 거치는 것이 걱정되면 "개수만"을 고르세요.')),
            el('div.row',
                tg.linked && el('button.btn.small', { onclick: tgAction('test') }, '🔔 시험 알림'),
                tg.linked && el('button.btn.small.danger', { onclick: tgAction('unpair') }, '연결 끊기'),
                !tg.linked && s.telegram_token_set && el('button.btn.small', { onclick: tgAction('renew') }, '코드 새로 만들기'))),
        section('🔗 학생 공유 페이지',
            textField('pass_page_url', '공유 페이지 주소', '조퇴증·외출증 QR 이 가리키는 주소 (저장소의 pass/ 폴더가 배포된 곳)')),
        section('🧩 화면 배치',
            el('p.small', '목록 패널 위치·글자 크기·색상을 바꾸고, 바꾸고 싶은 곳을 번호로 Claude Code 에게 전달할 수 있습니다.'),
            el('button.btn', { onclick: toggleLayoutMode }, '🧩 화면 배치 모드 열기')),
        el('div.row', { style: 'position: sticky; bottom: 0; background: var(--surface); padding: 10px 0' },
            el('button.btn.primary', { onclick: save }, '💾 설정 저장')));
}

export function openSettings() {
    openTab({ id: 'settings', title: '⚙ 설정', render: renderSettings });
}

registerView({
    id: 'settings', icon: '⚙', label: '설정', bottom: true,
    renderSide(body) {
        body.append(el('ul.list',
            el('li', { onclick: openSettings }, el('span.ttl', '⚙ 설정 열기')),
            el('li', { onclick: toggleLayoutMode }, el('span.ttl', '🧩 화면 배치 모드'))));
    },
    open: openSettings,
});

on('state', () => {
    // 텔레그램 연결 상태가 바뀌면 설정 화면을 새로 그림 (입력 중일 때는 건드리지 않음)
    const tab = findTab('settings');
    if (tab && !tab.pane.contains(document.activeElement)) {
        const linked = tab.pane.dataset.linked;
        const now = String(!!store.state.telegram.linked) + store.state.telegram.status;
        if (linked !== undefined && linked !== now) tab.rerender();
        tab.pane.dataset.linked = now;
    }
});
