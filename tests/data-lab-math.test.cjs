// 데이터 가공 실험실 계산 (js/data-lab-math.js): 단계별 계산·선생님 실측 4회차·문제 있는 예시
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const H = require('../js/heart-rate-math.js');
const D = require('../js/data-lab-math.js');

const FIX = path.join(__dirname, 'fixtures', 'heart-rate');
const load = r => H.parseCsv(fs.readFileSync(path.join(FIX, `zflip6-2026-11-17-${r}.csv`), 'utf8'));
const lockOf = p => /true/.test(p.meta.locked || '') ? 'csv-locked' : 'unlocked';

test('사이트에 둔 예시 파일(data/heart-rate)이 시험 자료와 같음', () => {
    D.EXAMPLES.filter(e => e.file).forEach(e => {
        const a = fs.readFileSync(path.join(FIX, e.file)), b = fs.readFileSync(path.join(__dirname, '..', 'data', 'heart-rate', e.file));
        assert.ok(a.equals(b), e.file);
    });
});

// 기본 설정이면 heart-rate-math 의 analyzeRun(심박수 페이지)과 ±3 안: r3 75.5 · r5 77 · r6 78.9 · r7 78.7
test('기본 설정: 실측 4회차가 심박수 페이지 계산과 ±3 안', () => {
    const want = { r3: 75.5, r5: 77, r6: 78.9, r7: 78.7 };
    Object.keys(want).forEach(r => {
        const p = load(r), o = D.run(p.frames, {}, { lock: lockOf(p) });
        const a = H.analyzeRun(lockOf(p), p.frames);
        assert.ok(Math.abs(o.final.bpm - want[r]) <= 3, `${r}: ${o.final.bpm} (기대 ${want[r]})`);
        assert.ok(Math.abs(o.final.bpm - a.bpm) <= 3, `${r}: ${o.final.bpm} ↔ 심박수 페이지 ${a.bpm}`);
        assert.ok(Math.abs(o.s5.bpmFFT - want[r]) <= 3, `${r} 주파수 분석 ${o.s5.bpmFFT}`);
        assert.ok(o.s6.agreePct < 5, `${r} 두 방법 차이 ${o.s6.agreePct}%`);
    });
});

test('2 점검·정제: r5 는 손가락 떨어진 곳(15.5초쯤)을 찾아 자르고, 자르지 않으면 절반쯤(37)으로 틀림', () => {
    const p = load('r5');
    const o = D.run(p.frames, {}, { lock: lockOf(p) });
    const lift = o.s2.problems.find(x => x.kind === 'lift');
    assert.ok(lift && lift.at > 14 && lift.at < 17, '떨어진 곳 ' + (lift && lift.at));
    assert.ok(o.s2.keep[1] > 14 && o.s2.keep[1] < 17);
    assert.ok(o.s2.kept.length < p.frames.length);
    const raw = D.run(p.frames, { autoCut: false }, { lock: lockOf(p) });
    assert.equal(raw.s2.kept.length, p.frames.length);
    assert.ok(raw.final.bpm < 45, '자르지 않으면 ' + raw.final.bpm);
    // 손으로 구간을 정하면 그대로
    const hand = D.run(p.frames, { autoCut: false, keep: [2, 12] }, { lock: lockOf(p) });
    assert.deepEqual(hand.s2.keep, [2, 12]);
    assert.ok(Math.abs(hand.final.bpm - 77) <= 4, '2~12초 ' + hand.final.bpm);
});

test('1 수집: 사진 수·길이·초당 장 수·간격', () => {
    const p = load('r3'), s = D.collect(p.frames, [0, 2]);
    assert.equal(s.n, p.frames.length);
    assert.ok(s.dur > 29 && s.dur < 31);
    assert.ok(s.fps > 25 && s.fps < 35, 'fps ' + s.fps);
    assert.ok(s.dtMed > 25 && s.dtMed < 40);
    assert.ok(s.dtMax >= s.dtMed && s.dtMin <= s.dtMed);
    assert.deepEqual(s.view, [0, 2]);
    assert.equal(s.gaps.length, p.frames.length - 1);
});

test('3 변환: 채널 고르기·보간 30칸/초, 4 거르기 설정, 5 최소 간격이 결과를 바꿈', () => {
    const p = load('r6'), lk = { lock: lockOf(p) };
    const o = D.run(p.frames, {}, lk);
    assert.equal(o.s3.ch, 'r');                        // 초록은 너무 어두워 자동에서 빠짐
    assert.ok(o.s3.auto.scores.g.skip);
    assert.ok(Math.abs(o.s3.nAfter - Math.floor(o.s2.keep[1] * 30)) <= 2);
    assert.equal(D.run(p.frames, { channel: 'g' }, lk).s3.ch, 'g');
    // 범위 최대를 70 회/분으로 하면 진짜 심박(78)이 잘려 결과가 크게 달라짐
    const narrow = D.run(p.frames, { band: [36, 70] }, lk);
    assert.deepEqual(narrow.s4.bandBpm, [36, 70]);
    assert.ok(Math.abs(narrow.final.bpm - 78) > 10, '범위 36~70: ' + narrow.final.bpm);
    // 이동평균 길이
    assert.equal(D.run(p.frames, { trendSec: 0 }, lk).s4.win, 0);
    assert.equal(o.s4.win, 2);
    // 최소 간격을 1초로 늘리면 박동을 건너뛰어 절반 가까이
    const wide = D.run(p.frames, { minGap: 1 }, lk);
    assert.equal(wide.s5.minGap, 1);
    assert.ok(wide.s5.bpmPeaks < 50, '최소 간격 1초: ' + wide.s5.bpmPeaks);
    assert.ok(wide.s5.nPeaks < o.s5.nPeaks);
    // 최종 방법을 주파수 분석으로
    const f = D.run(p.frames, { minGap: 1, method: 'fft' }, lk);
    assert.equal(f.final.used, 'fft');
    assert.ok(Math.abs(f.final.bpm - 78) <= 3);
});

test('문제 있는 가짜 예시: 노출 출렁임은 보정을 끄면 가짜 42회, 손가락 떨어짐·빈칸은 찾아 냄, 어두움은 틀림', () => {
    const expo = D.makeExample('expo');
    const on = D.run(expo, {}), off = D.run(expo, { exposure: 'off' });
    assert.ok(on.s3.corrected);
    assert.ok(Math.abs(on.final.bpm - 72) <= 3, '보정 ' + on.final.bpm);
    assert.ok(Math.abs(off.final.bpm - 42) <= 3, '보정 끔 ' + off.final.bpm);

    const lift = D.makeExample('lift'), lo = D.run(lift, {});
    const kinds = lo.s2.problems.map(x => x.kind);
    ['missing', 'hole', 'lift'].forEach(k => assert.ok(kinds.includes(k), k + ' ' + kinds));
    assert.ok(Math.abs(lo.final.bpm - 84) <= 3, '정제 ' + lo.final.bpm);
    assert.ok(Math.abs(D.run(lift, { autoCut: false }).final.bpm - 84) > 10, '정제 안 하면 크게 틀림');

    const dark = D.run(D.makeExample('dark'), {});
    assert.ok(dark.final.bpm != null && Math.abs(dark.final.bpm - 68) > 10, '아주 어두우면 틀림: ' + dark.final.bpm);
    // 같은 예시는 늘 같은 자료
    assert.deepEqual(D.makeExample('dark').slice(0, 5), D.makeExample('dark').slice(0, 5));
});

test('0 원천: 영역이 작을수록 평균의 잡음이 커짐', () => {
    const small = D.sourceDemo(10), big = D.sourceDemo(100);
    assert.ok(small.noise > 3 * big.noise, `${small.noise} vs ${big.noise}`);
    assert.ok(small.snr < big.snr);
    assert.equal(small.series.length, 90);
    assert.equal(big.avg.n, big.W * big.H);
    assert.equal(small.phoneNumbers, 1920 * 1080 * 3);
});

test('6 결과: 손목 맥박 15초×4 → 회/분과 오차, 기록 모음 글', () => {
    const w = D.wristBpm([19, 20, '', 21]);
    assert.equal(w.bpm, 80); assert.equal(w.n, 3);
    assert.equal(D.wristBpm(['', '']), null);
    const p = load('r7'), o = D.run(p.frames, {}, { lock: lockOf(p), wrist: [20, 20, 20, 20] });
    assert.equal(o.s6.wrist.bpm, 80);
    assert.equal(o.s6.error, +(o.final.bpm - 80).toFixed(1));
    const txt = D.notesText('예시', [{ step: '2', name: '점검·정제', setting: '자동', note: '손가락이 떨어져서' }, { step: '3', name: '변환', setting: '빨강', note: '' }]);
    assert.match(txt, /\[2\] 점검·정제/); assert.match(txt, /이유: 손가락이 떨어져서/); assert.match(txt, /\(적지 않음\)/);
});

test('자료가 너무 적거나 다 잘라도 멈추지 않음', () => {
    const p = load('r3');
    const o = D.run(p.frames, { autoCut: false, keep: [5, 5.2] });
    assert.equal(o.final.bpm, null); assert.ok(o.error);
    assert.equal(D.run([], {}).final.bpm, null);
});
