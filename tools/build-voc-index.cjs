const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const source = path.join(root, 'vendor', 'sensirion');
const upstreamCommit = '2ef9f13d225e8a0dedd3ff42dd229af4dbb1aae4';
const blobs = {
    'sensirion_gas_index_algorithm.c': 'acb510e81fb1713eefccbd97ee0038b5f900a390',
    'sensirion_gas_index_algorithm.h': '8d9c192e6b403c0bdcf1c16f921ec38ac1cf1128',
    LICENSE: 'ff20c41dfa2a1145b9caf1435f2b89e2e5bdec43'
};
for (const [filename, expected] of Object.entries(blobs)) {
    const bytes = fs.readFileSync(path.join(source, filename));
    const hash = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (hash !== expected) throw new Error(`Upstream source mismatch: ${filename}`);
}
const zig = process.argv[2] === '--zig';
const compiler = zig ? path.resolve(process.argv[3]) : (process.env.CLANG || 'clang');
const prefix = zig ? ['cc'] : [];
const common = ['-std=c99', '-O2', '-fwrapv', '-Wno-parentheses-equality', '-I', source,
    path.join(source, 'sensirion_gas_index_algorithm.c')];
const wasm = path.join(source, 'voc-index.wasm');
execFileSync(compiler, [...prefix, ...common, `--target=${zig ? 'wasm32-freestanding' : 'wasm32-unknown-unknown'}`, '-nostdlib', '-ffreestanding',
    '-Wl,--no-entry', '-Wl,--export=voc_reset', '-Wl,--export=voc_process', '-Wl,--strip-all',
    path.join(__dirname, 'voc-index-wasm.c'), '-o', wasm], { stdio: 'inherit' });
const moduleInfo = new WebAssembly.Module(fs.readFileSync(wasm));
if (WebAssembly.Module.imports(moduleInfo).length) throw new Error('Wasm must have no host imports');
fs.writeFileSync(path.join(source, 'SOURCE.json'), JSON.stringify({
    upstream: 'https://github.com/Sensirion/gas-index-algorithm',
    commit: upstreamCommit, version: '3.2.0', implementation: 'fixed-point',
    samplingIntervalSeconds: 1, blobs,
    wasmSha256: crypto.createHash('sha256').update(fs.readFileSync(wasm)).digest('hex')
}, null, 2) + '\n');
const sourceText = fs.readFileSync(path.join(source, 'sensirion_gas_index_algorithm.c'), 'utf8');
fs.writeFileSync(path.join(source, 'NOTICE'), sourceText.slice(0, sourceText.indexOf('*/') + 2) + '\n');

if (process.argv.includes('--reference')) {
    const build = path.join(root, '.voc-build');
    fs.mkdirSync(build, { recursive: true });
    const executable = path.join(build, process.platform === 'win32' ? 'voc-reference.exe' : 'voc-reference');
    execFileSync(compiler, [...prefix, ...common, path.join(root, 'tests', 'voc-reference.c'),
        '-o', executable], { stdio: 'inherit' });
    const segments = [[25000, 2000], [23000, 120], [25000, 500], [27000, 120],
        [25000, 15000], [21000, 120], [25000, 1000], [64000, 100], [1000, 100]];
    const inputs = segments.flatMap(([value, count]) => Array(count).fill(value));
    const output = execFileSync(executable, { input: inputs.join('\n') + '\n' }).toString();
    const indexes = output.trim().split('\n').map(Number);
    if (indexes.length !== inputs.length) throw new Error('Reference output length mismatch');
    fs.writeFileSync(path.join(root, 'tests', 'voc-reference.json'),
        JSON.stringify({ upstreamCommit, segments, indexes }) + '\n');
}
console.log('Built official Sensirion VOC algorithm:', wasm);
