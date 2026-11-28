/* 교사 🎬 발표 보기 — '📱 지금 폰으로 답해요' 응답 장의 팀 답 모으기 (2026-11-23 선생님 "학생용 화면은 응답을 수집하기 위함", "화면을 보고 수업에 참여하고 응답할 때만 스마트폰")
   - 설명 장 가운데 mode: 'phone' 이고 key 가 있는 장 = 응답 장. 프로젝터에 그 물음의 팀 답이 실시간으로 모임
     · 고르기: 칸마다 팀 수·막대 (정답 표시는 풀이를 연 뒤에만)
     · 글: 팀 이름과 함께 (가족 행사라 팀 이름 OK)
     · 아직 못 낸 팀은 수만 ('아직 2팀')
   - 읽기: 교사만 읽는 classExport(그 수업의 팀 줄, 자료 JSON)를 응답 장을 띄운 동안에만 몇 초마다 — 규칙·저장소 그대로
   - 지금은 필름통 로켓(exp rocket)만: 팀 줄 자료 = js/film-rocket-math.js payload (think.first · quiz[key].picks · concl)
   - 받은 글은 가족이 쓴 것 → 모두 esc(). 브라우저·Node 공용 (시험 tests/class-teacher-answers.test.cjs) */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ClassTeacherAnswers = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function supports(exp) { return exp === 'rocket'; }
    /* classExport 줄 → 팀(조 번호)마다 가장 최근 자료 { jo: payload } */
    function payloads(rows, groups) {
        var joOf = {}, out = {}, at = {};
        (groups || []).forEach(function (g) { joOf[g.code] = g.jo; });
        (rows || []).forEach(function (r) {
            var jo = joOf[r.group]; if (jo == null) return;
            var d = r.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
            if (!d || typeof d !== 'object') return;
            var t = String(r.sentAt || r.timestamp || '');
            if (at[jo] == null || t >= at[jo]) { at[jo] = t; out[jo] = d; }
        });
        return out;
    }
    function choiceGroup(title, opts, pickOf, list) {
        var o = opts.map(function (x) { return { k: x.k, t: x.t, n: 0, ok: x.k === 'ok' }; });
        var answered = 0;
        list.forEach(function (p) {
            var k = pickOf(p); if (!k) return;
            answered++;
            o.forEach(function (x) { if (x.k === k) x.n++; });
        });
        return { title: title, options: o, answered: answered };
    }
    /* 응답 장 key 의 팀 답 모음
       teams: [{ jo, name }] (팀 수업), data: { jo: payload }, M: FilmRocketMath
       → { kind: 'choice'|'list', groups: [{ title, options: [{k,t,n,ok}], answered }], list: [{ name, text }], answered, total } 또는 null */
    function tally(exp, key, teams, data, M) {
        if (!supports(exp) || !M || !key) return null;
        teams = teams || []; data = data || {};
        var withP = teams.map(function (t) { return { name: t.name, p: data[t.jo] || null }; });
        var list = withP.map(function (x) { return x.p || {}; });
        var total = teams.length;
        var c = (M.CONCEPTS || []).filter(function (x) { return x.key === key; })[0];
        if (c) {   // 생각 열기: 처음 생각 (점수 없음)
            var g = choiceGroup('', c.opts, function (p) { return p.think && p.think.first && p.think.first[key]; }, list);
            return { kind: 'choice', groups: [g], answered: g.answered, total: total };
        }
        // 합친 장 (2026-11-27 분량 조절): 2차시 '로켓은 왜 솟고, 무거우면?' = 작용 반작용 + 질량 퀴즈 두 칸
        if (key === 'action' && M.QUIZ && M.QUIZ.mass) {
            var qs = ['action', 'mass'].map(function (k) {
                return choiceGroup(M.QUIZ[k].word || '', M.QUIZ[k].opts, function (p) { var z = p.quiz && p.quiz[k]; return z && z.picks && z.picks[0]; }, list);
            });
            var both = list.filter(function (p) { return ['action', 'mass'].every(function (k) { var z = p.quiz && p.quiz[k]; return z && z.picks && z.picks.length; }); }).length;
            return { kind: 'choice', groups: qs, answered: both, total: total };
        }
        // 🔮 우리 팀 실험 계획 (plan-t1·plan-t2): 예측 칸마다 팀 수·막대(정답 없음) + 팀마다 바꾼 것 ① → ② · 까닭
        var pm = /^plan-(t[12])$/.exec(key);
        if (pm) {
            var part = pm[1], G = M.GUESS[part], defs = part === 't1' ? M.vars1() : M.vars2();
            var gOpts = ['down', 'up', 'same'].map(function (k) { return { k: 'g-' + k, t: G[k] }; });
            // 바꿀 것별로 묶음 (2026-11-27 선생님이 고른 '팀이 고른 것으로'): 고른 팀이 있는 변인만, 변인 목록 순서
            var pickOf = function (p) { var x = p[part]; return x && x.changed && p.guess && p.guess[part] && p.guess[part].dir ? 'g-' + p.guess[part].dir : ''; };
            var gs = Object.keys(defs).map(function (vk) {
                var mine = list.filter(function (p) { return p[part] && p[part].changed === vk && pickOf(p); });
                return mine.length ? choiceGroup((defs[vk].short || defs[vk].name) + ' · ' + mine.length + '팀', gOpts, pickOf, mine) : null;
            }).filter(Boolean);
            var answered = gs.reduce(function (n, g) { return n + g.answered; }, 0);
            var items = [];
            withP.forEach(function (x) {
                var p = x.p, z = p && p[part], g = p && p.guess && p.guess[part]; if (!z || !z.changed || !g || !g.dir) return;
                var d = defs[z.changed], pl = z.plan;
                items.push({ name: x.name, text: (d ? (d.short || d.name) : z.changed) + (d && pl && pl.length === 2 ? ' ' + d.label(pl[0]) + ' → ' + d.label(pl[1]) : '') + ' · ' + (G[g.dir] || '') + (g.why ? ' · 왜냐하면 ' + g.why : '') });
            });
            return { kind: 'choice', groups: gs, list: items, answered: answered, total: total };
        }
        // 🛠 만들기: 다 만든 팀 수
        if (key === 'build') {
            var dn = list.filter(function (p) { return p.build && p.build.done; }).length;
            return { kind: 'done', groups: [], list: [], answered: dn, total: total };
        }
        var q = M.QUIZ && M.QUIZ[key];
        if (q) {   // 정의 퀴즈: 처음 고른 답
            var g2 = choiceGroup('', q.opts, function (p) { var z = p.quiz && p.quiz[key]; return z && z.picks && z.picks[0]; }, list);
            return { kind: 'choice', groups: [g2], answered: g2.answered, total: total };
        }
        if (key === 'end-think') {   // 정리: 같은 세 문제 다시 풀기
            var gs = (M.CONCEPTS || []).map(function (cc) {
                return choiceGroup(cc.word, cc.opts, function (p) { var z = p.quiz && p.quiz['end_' + cc.key]; return z && z.picks && z.picks[0]; }, list);
            });
            var a = list.filter(function (p) { return (M.CONCEPTS || []).every(function (cc) { var z = p.quiz && p.quiz['end_' + cc.key]; return z && z.picks && z.picks.length; }); }).length;
            return { kind: 'choice', groups: gs, answered: a, total: total };
        }
        if (key === 'end-cause') {   // 정리 문장: 팀 이름과 함께
            var out = [];
            withP.forEach(function (x) {
                var co = x.p && x.p.concl; if (!co) return;
                var parts = ['t1', 't2'].map(function (k) {
                    var r = co[k]; if (!r || !(r.dir || r.why)) return '';
                    var G = M.GUESS[k], d = x.p[k] && x.p[k].changed, defs = k === 't1' ? M.vars1() : M.vars2(), v = defs[d];
                    // 📏 그 팀 숫자를 같이 (숫자와 반대인 결과는 ⚠, 5b 중 3)
                    var ev = null; try { ev = M.evidence && x.p[k] && x.p[k].trials && x.p[k].trials.length ? M.evidence(k, x.p[k], x.p.setup) : null; } catch (e) { ev = null; }
                    var clash = ev && ((r.dir === 'up' && ev.dir === 'down') || (r.dir === 'down' && ev.dir === 'up'));
                    return (k === 't1' ? '1차시 ' : '2차시 ') + (v ? (v.short || v.name) + ' → ' : '') + (r.dir && G.word[r.dir] ? (clash ? '⚠ ' : '') + G.word[r.dir] : '') +
                        (ev && !ev.one ? ' (📏 ' + String(ev.short).split(': ').pop() + ')' : '') + (r.why ? ' · 왜냐하면 ' + r.why : '');
                }).filter(Boolean);
                if (parts.length) out.push({ name: x.name, text: parts.join(' / ') });
            });
            return { kind: 'list', groups: [], list: out, answered: out.length, total: total };
        }
        return null;
    }
    /* 그리기: revealed = 풀이를 열었으면 정답 칸 ✅ */
    function render(t, revealed) {
        if (!t) return '';
        if (t.kind === 'done') return '<p class="ls-ans-head ls-ans-done">🛠 다 만든 팀 <b>' + t.answered + '</b> / ' + t.total + (t.total > t.answered ? ' <span class="ls-ans-left">(아직 ' + (t.total - t.answered) + '팀)</span>' : t.total ? ' 🎉' : '') + '</p>';
        var head = '<p class="ls-ans-head">📱 <b>지금 폰으로 답해요</b> · 답한 팀 <b>' + t.answered + '</b> / ' + t.total +
            (t.total > t.answered ? ' <span class="ls-ans-left">(아직 ' + (t.total - t.answered) + '팀)</span>' : '') + '</p>';
        var body = '';
        if (t.kind === 'choice') {
            body = t.groups.map(function (g) {
                var max = Math.max.apply(null, [1].concat(g.options.map(function (o) { return o.n; })));
                return '<div class="ls-ans-g">' + (g.title ? '<p class="ls-ans-title">' + esc(g.title) + '</p>' : '') +
                    g.options.map(function (o) {
                        var ok = revealed && o.ok;
                        return '<div class="ls-bar' + (ok ? ' ok' : '') + '"><span class="ls-bar-t">' + (ok ? '✅ ' : '') + esc(o.t) + '</span>' +
                            '<span class="ls-bar-track"><span class="ls-bar-fill" style="width:' + Math.round(o.n / max * 100) + '%"></span></span><b class="ls-bar-n">' + o.n + '</b></div>';
                    }).join('') + '</div>';
            }).join('');
            if (t.groups.length > 1) body = '<div class="ls-ans-cols n' + t.groups.length + '">' + body + '</div>';
            // 계획 장: 막대 아래 팀마다 바꾼 것 · 예측 · 까닭
            if (t.list && t.list.length) body += '<ul class="ls-ans-list' + (t.list.length > 3 ? ' two' : '') + '">' + t.list.map(function (x) { return '<li><b>' + esc(x.name) + '</b> ' + esc(x.text) + '</li>'; }).join('') + '</ul>';
        } else {
            body = t.list.length ? '<ul class="ls-ans-list' + (t.list.length > 3 ? ' two' : '') + '">' + t.list.map(function (x) { return '<li><b>' + esc(x.name) + '</b> ' + esc(x.text) + '</li>'; }).join('') + '</ul>' : '';
        }
        return head + body;
    }
    return { supports: supports, payloads: payloads, tally: tally, render: render, esc: esc };
});
