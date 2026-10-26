const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const VOCIndex = require('../js/voc-index.js');
const bytes = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'sensirion', 'voc-index.wasm'));
const packet = (seq, sraw = 25000, warmup = 0, ts = seq * 1000) =>
    ({ seq, ts, data: { sraw, warmup } });

test('official Wasm matches every native C reference output over five hours', async () => {
    const reference = require('./voc-reference.json');
    const processor = await VOCIndex.fromBytes(bytes);
    const inputs = reference.segments.flatMap(([value, count]) => Array(count).fill(value));
    for (let i = 0; i < inputs.length; i++) {
        const result = processor.process(packet(i, inputs[i]));
        assert.equal(result.index, reference.indexes[i] || null, `Sample ${i}`);
        assert.equal(result.interrupted, false);
        assert.equal(result.algorithm, VOCIndex.version);
    }
    assert.ok(reference.indexes[2119] > reference.indexes[1999]);
    assert.ok(reference.indexes[2739] < reference.indexes[2619]);
});

test('initial blackout and sensor warmup are missing values, never clean air scores', async () => {
    const processor = await VOCIndex.fromBytes(bytes);
    for (let seq = 0; seq < 60; seq++) {
        assert.equal(processor.process(packet(seq, 25000, 60 - seq)).index, null);
    }
    assert.ok(processor.process(packet(60)).index > 0);
});

test('reset, sequence gaps and timestamp discontinuities restart blackout', async () => {
    const processor = await VOCIndex.fromBytes(bytes);
    for (let seq = 0; seq < 70; seq++) processor.process(packet(seq));
    let result = processor.process(packet(71));
    assert.equal(result.interrupted, true);
    assert.equal(result.index, null);
    assert.ok(result.learningRemaining > 0);
    for (let seq = 72; seq < 140; seq++) processor.process(packet(seq));
    result = processor.process(packet(140, 25000, 0, 145000));
    assert.equal(result.interrupted, true);
    assert.equal(result.index, null);
    processor.reset();
    assert.equal(processor.process(packet(0)).index, null);
});

test('bounded scheduler jitter is accepted without inventing extra inputs', async () => {
    const processor = await VOCIndex.fromBytes(bytes);
    for (let seq = 0; seq < 100; seq++) {
        const result = processor.process(packet(seq, 25000, 0, seq * 1000 + (seq % 2) * 200));
        assert.equal(result.interrupted, false);
    }
});

test('independent instances do not share learned state', async () => {
    const first = await VOCIndex.fromBytes(bytes);
    const second = await VOCIndex.fromBytes(bytes);
    for (let seq = 0; seq < 100; seq++) first.process(packet(seq));
    assert.equal(second.process(packet(0)).index, null);
    assert.ok(first.process(packet(100)).index > 0);
});

test('rejects invalid raw values instead of reusing the last valid signal', async () => {
    const processor = await VOCIndex.fromBytes(bytes);
    for (const raw of [0, -1, 65000, 65535, NaN, 1.5, '25000']) {
        assert.throws(() => processor.process(packet(0, raw)), /SRAW/);
    }
});

test('distributed Wasm and unchanged upstream sources match pinned provenance', () => {
    const source = path.join(__dirname, '..', 'vendor', 'sensirion');
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'SOURCE.json'), 'utf8'));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), manifest.wasmSha256);
    for (const [filename, expected] of Object.entries(manifest.blobs)) {
        const file = fs.readFileSync(path.join(source, filename));
        assert.equal(crypto.createHash('sha1').update(`blob ${file.length}\0`).update(file).digest('hex'), expected);
    }
    assert.equal(manifest.commit, require('./voc-reference.json').upstreamCommit);
    assert.match(fs.readFileSync(path.join(source, 'NOTICE'), 'utf8'), /Copyright \(c\) 2022, Sensirion AG/);
    assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
});

test('browser loader reports HTTP errors and resolves Wasm relative to its own script', async () => {
    let requested;
    const context = vm.createContext({
        document: { currentScript: { src: 'https://example.org/js/voc-index.js?v=official-v1' } },
        URL, WebAssembly,
        fetch: async url => {
            requested = url;
            return { ok: false, status: 404 };
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'voc-index.js'), 'utf8'), context);
    await assert.rejects(context.VOCIndex.create(), /HTTP 404/);
    assert.equal(requested, 'https://example.org/vendor/sensirion/voc-index.wasm?v=3.2.0-1');
    context.fetch = async () => ({ ok: true, arrayBuffer: async () => bytes });
    const processor = await context.VOCIndex.create();
    assert.equal(processor.process(packet(0)).index, null);
    context.fetch = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]) });
    await assert.rejects(context.VOCIndex.create(), WebAssembly.CompileError);
});
