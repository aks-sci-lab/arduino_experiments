// 시판 블루투스 센서 자동 역추적 · AI 보조 해석 (브라우저·Node 공용, 시험 tests/ble-ai-auto.test.cjs)
// 1) API 키 없이도 동작하는 로컬 자동 분석(포장 감지 + 참값/근사값 기반 후보 탐색)
// 2) 선생님 개인 API 키(Gemini·Claude·GPT, js/report-ai.js 활용)로 패킷 구조·필드·시작 명령을 추론하고
//    결과를 반드시 로컬 코드(BleDecode)로 전수 검증한다.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./ble-decode.js'));
    } else {
        root.BleAiAuto = factory(root.BleDecode);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (B) {
    'use strict';

    function printableAscii(bytes) {
        const b = B.toBytes(bytes);
        if (!b.length) return '';
        if (!Array.from(b).every(x => x === 9 || x === 10 || x === 13 || (x >= 32 && x < 127))) return '';
        let out = '';
        for (let i = 0; i < b.length; i++) out += String.fromCharCode(b[i]);
        return out.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    }

    // ---------- 1. API 키 없이 동작하는 로컬 자동 분석 ----------
    // rawPackets: Uint8Array[]
    // opts: { approxValue?: number, truths?: [{bytes, truth}], name?: string, unit?: string, sensorName?: string }
    function guessFieldsLocally(rawPackets, opts) {
        opts = opts || {};
        const rawList = (rawPackets || []).map(B.toBytes).filter(b => b.length > 0);
        if (!rawList.length) {
            return { ok: false, error: '분석할 패킷이 아직 없어요. 먼저 센서를 연결해 데이터를 몇 개 받아 주세요.' };
        }

        const det = B.detectFraming(rawList);
        const preprocess = det
            ? { type: det.type, prefix: det.prefix, suffix: det.suffix, checksum: det.checksum }
            : { type: 'none', prefix: '', suffix: '', checksum: 'none' };

        const unpacked = rawList.map(p => B.preprocessPacket(p, preprocess)).filter(b => b && b.length > 0);
        if (!unpacked.length) {
            return { ok: false, error: '감지된 포장 풀기로 패킷을 풀지 못했어요.' };
        }

        const fieldName = String(opts.name || '측정값').slice(0, 40);
        const fieldUnit = String(opts.unit || '').slice(0, 20);
        const sensorName = String(opts.sensorName || '').slice(0, 60);

        // A) 텍스트·CSV 숫자면 이미 float32le 배열로 풀렸으므로 바로 필드 제안
        if (preprocess.type === 'ascii-number') {
            const cols = Math.max(1, Math.floor(unpacked[0].length / 4));
            const fields = [];
            for (let i = 0; i < cols; i++) {
                fields.push({
                    name: cols === 1 ? fieldName : (fieldName + (i + 1)),
                    offset: i * 4, format: 'float32le', scale: 1, add: 0, unit: i === 0 ? fieldUnit : '', mask: ''
                });
            }
            return {
                ok: true,
                proposal: {
                    summary: '텍스트·CSV 숫자를 자동으로 뽑아 ' + cols + '개 채널(float32 LE)로 해석했어요.',
                    confidence: 'high',
                    sensorName,
                    preprocess,
                    fields,
                    initCommands: [],
                    nextStep: '센서 값을 실제로 바꿔 보며 숫자가 따라 변하는지 확인하세요.'
                }
            };
        }

        // B) 참값이 3개 이상이면 기존 최소제곱 후보 탐색으로 1위 선택
        const truths = (opts.truths || []).filter(t => t && Number.isFinite(Number(t.truth)) && t.bytes);
        if (truths.length >= 3) {
            // truths 에 원본이 들어왔으면 전처리 적용
            const tSamples = truths.map(t => {
                const ub = preprocess.type !== 'none' ? (B.preprocessPacket(t.bytes, preprocess) || B.toBytes(t.bytes)) : B.toBytes(t.bytes);
                return { bytes: ub, truth: Number(t.truth) };
            });
            const fit = B.findCandidates(tSamples, { limit: 5 });
            if (fit.ok && fit.candidates.length) {
                const top = fit.candidates[0];
                const field = B.candidateToField(top, fieldName, fieldUnit);
                const conf = top.r2 >= 0.999 ? 'high' : top.r2 >= 0.98 ? 'medium' : 'low';
                return {
                    ok: true,
                    proposal: {
                        summary: (det ? det.reason + '를 풀고, ' : '') + '참값 ' + truths.length + '개로 맞춘 결과 ' +
                            field.offset + '번 자리 ' + field.format + ' (배율 ' + field.scale + ', r²=' + top.r2.toFixed(5) + ')가 1위예요.',
                        confidence: conf,
                        sensorName,
                        preprocess,
                        fields: [field],
                        initCommands: [],
                        nextStep: '다른 구간 값으로도 검증한 뒤 규칙을 저장하세요.'
                    }
                };
            }
        }

        // C) 근사값 힌트(예: 지금 약 25°C)가 있으면 바뀌는 바이트 주변의 표준 형식을 스캔
        const approx = (opts.approxValue !== undefined && opts.approxValue !== '' && opts.approxValue !== null)
            ? Number(opts.approxValue) : NaN;
        const groups = B.changingBytes(unpacked);
        const dom = groups[0];
        const sameLen = unpacked.filter(b => b.length === dom.length);
        const changingIdx = dom.changing.map((c, i) => (c ? i : -1)).filter(i => i >= 0);

        if (Number.isFinite(approx)) {
            const tol = Math.max(5, Math.abs(approx) * 0.35);
            const formatScales = [
                { id: 'float32le', scales: [1], prio: 4 },
                { id: 'float32be', scales: [1], prio: 3 },
                { id: 'int16le', scales: [1, 0.1, 0.01, 0.001, 0.5], prio: 3 },
                { id: 'uint16le', scales: [1, 0.1, 0.01, 0.001, 0.5], prio: 2.5 },
                { id: 'int16be', scales: [1, 0.1, 0.01, 0.001], prio: 2 },
                { id: 'uint16be', scales: [1, 0.1, 0.01, 0.001], prio: 1.8 },
                { id: 'int32le', scales: [1, 0.01, 0.001, 0.0001], prio: 1.5 },
                { id: 'int8', scales: [1, 0.5], prio: 1 },
                { id: 'uint8', scales: [1, 0.5, 0.1], prio: 1 }
            ];
            const hits = [];
            for (const fs of formatScales) {
                const size = B.FORMAT_BY_ID[fs.id].size;
                for (let off = 0; off + size <= dom.length; off++) {
                    // 여러 패킷이 있으면 최소한 한 바이트는 바뀌는 구간과 겹쳐야 함 (끝 체크섬 바이트 단독은 제외)
                    const overlaps = [];
                    for (let k = off; k < off + size; k++) if (dom.changing[k]) overlaps.push(k);
                    if (sameLen.length >= 2 && !overlaps.length) continue;
                    if (preprocess.checksum !== 'none' && off + size > dom.length - 1) continue;

                    for (const scale of fs.scales) {
                        const vals = [];
                        let bad = false;
                        for (let i = 0; i < sameLen.length; i++) {
                            const raw = B.readRaw(sameLen[i], off, fs.id);
                            if (raw === null || !Number.isFinite(raw)) { bad = true; break; }
                            const v = raw * scale;
                            if (!Number.isFinite(v) || Math.abs(v) > 1e9) { bad = true; break; }
                            vals.push(v);
                        }
                        if (bad || !vals.length) continue;
                        const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
                        const last = vals[vals.length - 1];
                        const diff = Math.abs(last - approx);
                        if (diff > tol) continue;
                        // 비정상 급변(노이즈/체크섬 오탐) 제외
                        let maxJump = 0;
                        for (let i = 1; i < vals.length; i++) maxJump = Math.max(maxJump, Math.abs(vals[i] - vals[i - 1]));
                        if (sameLen.length >= 3 && maxJump > Math.max(15, Math.abs(approx) * 1.5)) continue;
                        const relErr = diff / Math.max(1, Math.abs(approx));
                        const score = fs.prio * 10 - relErr * 25 + (scale === 1 ? 4 : 0) + (max > min ? 3 : 0) - off * 0.05;
                        hits.push({ offset: off, format: fs.id, scale, score, min, max, last, relErr });
                    }
                }
            }
            hits.sort((a, b) => b.score - a.score);
            if (hits.length) {
                const top = hits[0];
                const field = { name: fieldName, offset: top.offset, format: top.format, scale: top.scale, add: 0, unit: fieldUnit, mask: '' };
                const conf = top.relErr < 0.08 && top.max > top.min ? 'high' : 'medium';
                return {
                    ok: true,
                    proposal: {
                        summary: (det ? det.reason + '를 풀고, ' : '') + '입력한 근사값(' + approx + (fieldUnit ? ' ' + fieldUnit : '') + ')과 가장 가까운 ' +
                            top.offset + '번 자리 ' + top.format + (top.scale !== 1 ? ' × ' + top.scale : '') + ' 을 찾았어요 (최근값 ' + Number(top.last.toPrecision(5)) + ').',
                        confidence: conf,
                        sensorName,
                        preprocess,
                        fields: [field],
                        initCommands: [],
                        nextStep: '센서 값을 실제로 올리거나 내려 보며(예: 손으로 쥐기) 값이 예상대로 변하는지 확인하세요.'
                    },
                    alternatives: hits.slice(1, 5)
                };
            }
        }

        // D) 근사값도 참값도 없지만 포장이 감지된 경우 포장 정보만이라도 제안
        if (det) {
            return {
                ok: true,
                proposal: {
                    summary: '포장 형식(' + det.reason + ')을 자동 감지했어요. 풀린 ' + dom.length + '바이트 중 바뀌는 자리는 [' +
                        (changingIdx.join(', ') || '없음') + ']입니다. 대략적인 현재 값(예: 25)을 넣거나 🤖 AI 자동 분석을 누르면 필드까지 바로 찾아 줍니다.',
                    confidence: 'low',
                    sensorName,
                    preprocess,
                    fields: [],
                    initCommands: [],
                    nextStep: '현재 대략 값(예: 방 온도 25)을 입력하고 다시 누르거나, AI 자동 분석을 실행해 보세요.'
                }
            };
        }

        return {
            ok: false,
            error: '참값 3개나 대략적인 현재 값(예: 25)을 넣거나, 🤖 AI 자동 분석을 사용해 주세요. (바뀌는 자리: ' + (changingIdx.join(', ') || '없음') + ')'
        };
    }

    // ---------- 2. 외부 AI 프롬프트 생성 ----------
    function buildAiPrompt(ctx) {
        ctx = ctx || {};
        const formatIds = B.FORMATS.map(f => f.id).join(', ');
        const system = [
            '너는 중·고등학교 과학실 시판 BLE(블루투스) 센서의 패킷 구조를 해석해 주는 임베디드 통신 전문가다.',
            '목적: 학교가 구입한 실물 센서를 수업용 웹앱에서 쓸 수 있도록(상호 운용) 사용자가 캡처한 패킷을 분석해 해석 규칙 JSON 을 제안한다.',
            '원칙:',
            '1. 반드시 사용자가 제공한 패킷·서비스·힌트 근거로만 추론한다. 확인되지 않은 비공개 제조사 소스코드를 지어내지 않는다.',
            '2. 아래 JSON 형식 하나만 ```json ... ``` 코드 블록으로 반환한다 (코드 블록 밖에 긴 설명을 쓰지 않는다).',
            '3. preprocess.type 은 "none", "base64", "ascii-hex", "ascii-number" 중 하나만 쓴다.',
            '4. preprocess.checksum 은 "none", "sum8", "xor8" 중 하나만 쓴다. (sum8 = 앞 바이트 전체 합 & 0xFF == 끝 바이트)',
            '5. fields[].format 은 반드시 다음 중 하나만 쓴다: ' + formatIds,
            '6. offset 은 preprocess 를 적용한 뒤 풀린 바이트의 0부터 시작하는 인덱스다.',
            '7. 패킷이 아예 없다면 initCommands 에 시도해 볼 만한 안전한 조회/시작 명령을 제안하되, 확신이 없으면 confidence 를 "low" 로 두고 nextStep 에 필요한 확인을 적는다.',
            '8. summary 와 nextStep 은 코딩 초보 교사도 이해할 수 있는 쉬운 한국어로 짧게 쓴다.',
            '',
            '출력 JSON 스키마:',
            '```json',
            '{',
            '  "summary": "쉬운 한국어 설명 (1~3문장)",',
            '  "confidence": "high | medium | low",',
            '  "sensorName": "추천 센서 이름 (예: ScienceCube 온도 센서)",',
            '  "preprocess": { "type": "none", "prefix": "", "suffix": "", "checksum": "none" },',
            '  "fields": [',
            '    { "name": "온도", "offset": 4, "format": "float32le", "scale": 1, "add": 0, "unit": "°C", "mask": "" }',
            '  ],',
            '  "initCommands": [',
            '    { "characteristic": "특성UUID", "mode": "hex 또는 ascii", "payload": "01 00", "delayMs": 200, "label": "측정 시작" }',
            '  ],',
            '  "nextStep": "교사가 확인할 다음 단계 한 줄"',
            '}',
            '```'
        ].join('\n');

        const lines = [];
        lines.push('[기기 정보]');
        lines.push('- 이름: ' + (ctx.deviceName || '(알 수 없음)'));
        if (ctx.maker) lines.push('- 제조사: ' + ctx.maker);
        if (ctx.model) lines.push('- 모델: ' + ctx.model);
        if (ctx.firmware) lines.push('- 펌웨어: ' + ctx.firmware);
        if (ctx.serviceUuid || ctx.charUuid) {
            lines.push('- 분석 대상 서비스: ' + (ctx.serviceUuid || '(미지정)'));
            lines.push('- 분석 대상 특성: ' + (ctx.charUuid || '(미지정)'));
        }

        if (Array.isArray(ctx.services) && ctx.services.length) {
            lines.push('\n[열린 서비스·특성 목록]');
            ctx.services.slice(0, 12).forEach(s => {
                const chars = (s.chars || []).map(c => c.uuid + '(' + (c.props || []).join(',') + ')').join(', ');
                lines.push('- ' + s.uuid + ': ' + (chars || '(특성 없음)'));
            });
        }

        lines.push('\n[교사 힌트]');
        lines.push(ctx.hint ? String(ctx.hint).slice(0, 600) : '(힌트 없음)');
        if (ctx.approxValue !== undefined && ctx.approxValue !== '' && Number.isFinite(Number(ctx.approxValue))) {
            lines.push('- 대략적인 현재 측정값: ' + ctx.approxValue + (ctx.unit ? ' ' + ctx.unit : ''));
        }

        const rawList = (ctx.rawPackets || []).slice(-15);
        lines.push('\n[캡처된 원본 패킷 (최근 ' + rawList.length + '개)]');
        if (!rawList.length) {
            lines.push('(수신된 패킷 없음 — 시작 명령이 필요할 수 있음)');
        } else {
            rawList.forEach((p, idx) => {
                const b = B.toBytes(p.bytes || p);
                const t = p.t !== undefined ? Number(p.t).toFixed(2) + 's ' : ('#' + (idx + 1) + ' ');
                const asc = printableAscii(b);
                lines.push(t + '(' + b.length + 'B) HEX=' + B.toHex(b) + (asc ? ' | ASCII="' + asc + '"' : ''));
            });
        }

        const det = ctx.detectedFraming || (rawList.length ? B.detectFraming(rawList.map(p => p.bytes || p)) : null);
        if (det) {
            lines.push('\n[로컬 포장 자동 감지 결과]');
            lines.push('- ' + det.reason + ' (type=' + det.type + ', prefix=' + JSON.stringify(det.prefix) + ', suffix=' + JSON.stringify(det.suffix) + ', checksum=' + det.checksum + ')');
            const unpacked = rawList.map(p => B.preprocessPacket(p.bytes || p, det)).filter(Boolean);
            if (unpacked.length) {
                const chg = B.changingBytes(unpacked)[0];
                const pos = chg ? chg.changing.map((c, i) => (c ? i : -1)).filter(i => i >= 0) : [];
                lines.push('- 풀린 바이트(' + unpacked[0].length + 'B) 바뀌는 자리: [' + pos.join(', ') + ']');
                unpacked.slice(-8).forEach((u, i) => lines.push('  풀림#' + (i + 1) + ': ' + B.toHex(u)));
            }
        } else if (rawList.length >= 2) {
            const chg = B.changingBytes(rawList.map(p => p.bytes || p))[0];
            if (chg) {
                const pos = chg.changing.map((c, i) => (c ? i : -1)).filter(i => i >= 0);
                lines.push('\n[원본 바이트 바뀌는 자리 (' + chg.length + 'B)] [' + pos.join(', ') + ']');
            }
        }

        if (Array.isArray(ctx.truths) && ctx.truths.length) {
            lines.push('\n[교사가 기록한 참값]');
            ctx.truths.slice(-10).forEach((tr, i) => {
                lines.push('- #' + (i + 1) + ' 참값=' + tr.truth + ' | 바이트=' + B.toHex(tr.bytes));
            });
        }

        if (ctx.previousFeedback) {
            lines.push('\n[이전 제안을 로컬 코드로 검증한 피드백 — 이 문제를 고쳐서 다시 제안해 주세요]');
            lines.push(String(ctx.previousFeedback).slice(0, 1000));
        }

        return { system, user: lines.join('\n') };
    }

    // ---------- 3. AI 응답 JSON 추출·정규화 ----------
    function extractJsonBlock(text) {
        const s = String(text || '').trim();
        if (!s) return null;
        const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
        const body = fence ? fence[1].trim() : s;
        try { return JSON.parse(body); } catch (e) { /* 부분 JSON 재시도 */ }
        const start = body.indexOf('{');
        const end = body.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try { return JSON.parse(body.slice(start, end + 1)); } catch (e) { return null; }
        }
        return null;
    }

    function parseAiProposal(text) {
        const obj = extractJsonBlock(text);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            return { ok: false, error: 'AI 답에서 해석 규칙 JSON 을 읽지 못했어요. 다시 시도해 보세요.', rawText: String(text || '') };
        }
        const pre = B.normalizePreprocess(obj.preprocess);
        const fields = Array.isArray(obj.fields) ? obj.fields.map((f, i) => {
            const out = {
                name: String((f && f.name) || ('값' + (i + 1))).slice(0, 40),
                offset: Math.max(0, Math.round(Number(f && f.offset) || 0)),
                format: String((f && f.format) || ''),
                scale: f && f.scale !== undefined && f.scale !== '' ? Number(f.scale) : 1,
                add: f && f.add !== undefined && f.add !== '' ? Number(f.add) : 0,
                unit: String((f && f.unit) || '').slice(0, 20),
                mask: f && f.mask !== undefined && f.mask !== null ? String(f.mask).slice(0, 20) : ''
            };
            if (f && f.match && typeof f.match === 'object') out.match = { offset: Number(f.match.offset), value: Number(f.match.value) };
            return out;
        }) : [];
        const initCommands = Array.isArray(obj.initCommands) ? obj.initCommands.filter(c => c && c.characteristic && c.payload).map(c => ({
            service: String(c.service || ''),
            characteristic: String(c.characteristic || ''),
            mode: c.mode === 'ascii' ? 'ascii' : 'hex',
            payload: String(c.payload || '').slice(0, 200),
            delayMs: Math.max(0, Math.min(10000, Math.round(Number(c.delayMs) || 200))),
            label: String(c.label || '').slice(0, 40)
        })) : [];
        const rateCommand = (obj.rateCommand && typeof obj.rateCommand === 'object' && obj.rateCommand.characteristic && (obj.rateCommand.template || (obj.rateCommand.map && Object.keys(obj.rateCommand.map).length)))
            ? Object.assign({}, obj.rateCommand) : null;
        const pollCommand = (obj.pollCommand && typeof obj.pollCommand === 'object' && obj.pollCommand.characteristic && obj.pollCommand.payload)
            ? Object.assign({}, obj.pollCommand) : null;
        const conf = ['high', 'medium', 'low'].includes(obj.confidence) ? obj.confidence : 'medium';
        return {
            ok: true,
            proposal: {
                summary: String(obj.summary || 'AI 해석 제안').slice(0, 500),
                confidence: conf,
                sensorName: String(obj.sensorName || '').slice(0, 60),
                preprocess: pre,
                fields,
                initCommands,
                rateCommand,
                pollCommand,
                nextStep: String(obj.nextStep || '').slice(0, 300)
            }
        };
    }

    // ---------- 4. 로컬 코드로 AI 제안 전수 검증 ----------
    function verifyProposal(proposal, rawPackets, opts) {
        opts = opts || {};
        const warnings = [];
        const charUuid = B.normUuid(opts.charUuid) || '0000fff1-0000-1000-8000-00805f9b34fb';
        const serviceUuid = B.normUuid(opts.serviceUuid) || '';
        const meta = opts.deviceMeta || {};
        const pre = B.normalizePreprocess(proposal && proposal.preprocess);
        const charEntry = {
            service: serviceUuid,
            characteristic: charUuid,
            mode: 'notify',
            fields: (proposal && proposal.fields) || []
        };
        if (pre.type !== 'none') charEntry.preprocess = pre;

        const rawDecoder = {
            schema: B.SCHEMA,
            version: 1,
            name: (proposal && proposal.sensorName) || meta.deviceName || '자동 해석 센서',
            device: {
                namePrefix: meta.deviceName || '',
                maker: meta.maker || '',
                model: meta.model || '',
                firmware: meta.firmware || ''
            },
            characteristics: [charEntry],
            notes: (proposal && proposal.summary) || ''
        };
        if (proposal && Array.isArray(proposal.initCommands) && proposal.initCommands.length) {
            rawDecoder.initCommands = proposal.initCommands;
        }
        if (proposal && proposal.rateCommand) {
            rawDecoder.rateCommand = proposal.rateCommand;
        }
        if (proposal && proposal.pollCommand) {
            rawDecoder.pollCommand = proposal.pollCommand;
        }

        const check = B.validateDecoder(rawDecoder);
        if (!check.ok) {
            return {
                valid: false,
                errors: check.errors,
                warnings,
                totalFrames: (rawPackets || []).length,
                okFrames: 0,
                fieldStats: [],
                decoder: null,
                feedbackForRetry: '규칙 형식 오류: ' + check.errors.join('; ')
            };
        }

        const decoder = check.decoder;
        const chRule = decoder.characteristics[0];
        const rawList = (rawPackets || []).map(p => B.toBytes(p.bytes || p)).filter(b => b.length > 0);
        const unpacked = [];
        for (let i = 0; i < rawList.length; i++) {
            const u = B.preprocessPacket(rawList[i], chRule.preprocess);
            if (u && u.length) unpacked.push(u);
        }
        if (rawList.length > 0 && unpacked.length === 0) {
            warnings.push('포장 풀기 설정이 캡처된 패킷과 맞지 않아 0개만 통과했어요.');
        } else if (rawList.length > 0 && unpacked.length < rawList.length) {
            warnings.push('패킷 ' + rawList.length + '개 중 ' + unpacked.length + '개만 통과했어요 (나머지 ' + (rawList.length - unpacked.length) + '개는 형식·체크섬 불일치).');
        }

        const fieldStats = chRule.fields.map(f => {
            const vals = [];
            for (let i = 0; i < unpacked.length; i++) {
                const v = B.readField(unpacked[i], f);
                if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
            }
            const min = vals.length ? Math.min.apply(null, vals) : null;
            const max = vals.length ? Math.max.apply(null, vals) : null;
            const first = vals.length ? vals[0] : null;
            const last = vals.length ? vals[vals.length - 1] : null;
            const changing = vals.length >= 2 && max !== min;
            if (unpacked.length > 0 && vals.length === 0) {
                warnings.push('"' + f.name + '" 필드(offset ' + f.offset + ', ' + f.format + ')가 패킷 길이를 벗어나거나 유효한 숫자를 읽지 못했어요.');
            }
            return { name: f.name, unit: f.unit, offset: f.offset, format: f.format, count: vals.length, min, max, first, last, changing };
        });

        let truthRmse = null;
        const truths = (opts.truths || []).filter(t => t && Number.isFinite(Number(t.truth)) && t.bytes);
        if (truths.length >= 1 && chRule.fields.length >= 1) {
            const f0 = chRule.fields[0];
            let sq = 0, cnt = 0;
            truths.forEach(t => {
                const ub = chRule.preprocess ? (B.preprocessPacket(t.bytes, chRule.preprocess) || B.toBytes(t.bytes)) : B.toBytes(t.bytes);
                const v = B.readField(ub, f0);
                if (typeof v === 'number' && Number.isFinite(v)) {
                    const e = v - Number(t.truth);
                    sq += e * e;
                    cnt++;
                }
            });
            if (cnt > 0) {
                truthRmse = Math.sqrt(sq / cnt);
                if (truthRmse > 2) warnings.push('참값과 평균 오차(RMSE)가 ' + truthRmse.toFixed(3) + ' 로 다소 큽니다.');
            }
        }

        const hasDecoded = fieldStats.some(s => s.count > 0);
        const valid = Boolean(
            check.ok &&
            (rawList.length === 0 || (unpacked.length > 0 && (chRule.fields.length === 0 || hasDecoded)))
        );

        const fb = [];
        fb.push('통과 패킷: ' + unpacked.length + '/' + rawList.length);
        fieldStats.forEach(s => {
            fb.push(s.name + '(off=' + s.offset + ', ' + s.format + '): ' + (s.count ? (Number(s.min.toPrecision(6)) + ' ~ ' + Number(s.max.toPrecision(6)) + (s.unit ? ' ' + s.unit : '')) : '읽기 실패'));
        });
        if (truthRmse !== null) fb.push('참값 RMSE=' + truthRmse.toFixed(4));
        if (warnings.length) fb.push('경고: ' + warnings.join(' / '));

        return {
            valid,
            errors: [],
            warnings,
            totalFrames: rawList.length,
            okFrames: unpacked.length,
            fieldStats,
            truthRmse,
            decoder,
            feedbackForRetry: fb.join('\n')
        };
    }

    return {
        guessFieldsLocally,
        buildAiPrompt,
        extractJsonBlock,
        parseAiProposal,
        verifyProposal
    };
});
