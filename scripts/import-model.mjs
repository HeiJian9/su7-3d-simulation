import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const modelId = 'ca2cda599f5341068c992c9f44551bf9';
if (!args.includes('--file') || value('--confirm-source') !== modelId) {
  throw new Error(`Use --file <official ZIP> --confirm-source ${modelId}; verify the source before importing.`);
}
const incoming = path.resolve(value('--file'));
const original = path.join(root, 'assets/source/original', path.basename(incoming));
await mkdir(path.dirname(original), { recursive: true });
if (incoming !== original) await copyFile(incoming, original);
const sourceBytes = await readFile(original);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const extracted = path.join(root, 'assets/source/extracted');
const extract = spawnSync('python', [path.join(root, 'scripts/extract-model.py'), original, extracted], { encoding: 'utf8' });
if (extract.status !== 0) throw new Error(extract.stderr || extract.stdout);
const install = JSON.parse((await readFile(path.join(root, '.tools/blender-install.json'), 'utf8')).replace(/^\uFEFF/, ''));
const blender = spawnSync(install.executable, ['--background', '--factory-startup', '--python', path.join(root, 'scripts/prepare_su7.py')], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
await mkdir(path.join(root, 'docs/validation'), { recursive: true });
await writeFile(path.join(root, 'docs/validation/blender-export.log'), `${blender.stdout}\n${blender.stderr}`);
if (blender.status !== 0 || !blender.stdout.includes('SU7_EXPORT_COMPLETE')) throw new Error('Blender export failed, see docs/validation/blender-export.log');
const runtime = await readFile(path.join(root, 'apps/web/public/models/su7-runtime.glb'));
if (runtime.readUInt32LE(0) !== 0x46546c67 || runtime.readUInt32LE(4) !== 2) throw new Error('Invalid GLB');
const manifestPath = path.join(root, 'apps/web/public/models/asset-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
Object.assign(manifest, { status: 'ready', runtimeUrl: '/models/su7-runtime.glb', bytes: runtime.length, sha256: sha256(runtime), rotationY: 0, scale: 1, message: '指定原包导入的 SU7；I0–I1 仅观察，无部件动画。' });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const sourceRecord = { modelId, sourceUrl: manifest.sourceUrl, author: manifest.author, license: manifest.license, licenseUrl: manifest.licenseUrl,
  acquisition: 'User downloaded from the official Sketchfab download entry and placed the ZIP in original/ after the login handoff.',
  original: path.relative(root, original), originalBytes: sourceBytes.length, originalSha256: sha256(sourceBytes),
  importedAt: new Date().toISOString(), blender: install, runtimeSha256: manifest.sha256,
  modifications: ['OBJ/MTL import with all 84 groups', 'Uniform meter scale, Y-up / front -Z', 'PBR material adaptation; original diffuse color retained', 'Packed textures and self-contained GLB; no component animation'],
};
await writeFile(path.join(root, 'assets/source/source-record.json'), JSON.stringify(sourceRecord, null, 2) + '\n');
await copyFile(path.join(root, 'apps/web/public/models/su7-runtime.glb'), path.join(root, 'assets/derived/su7-runtime.glb'));
await mkdir(path.join(root, 'assets/source/textures'), { recursive: true });
for (const filename of await readdir(extracted)) {
  if (/\.(png|jpg|jpeg)$/i.test(filename)) await copyFile(path.join(extracted, filename), path.join(root, 'assets/source/textures', filename));
}
await mkdir(path.join(root, 'apps/web/public/decoders/draco'), { recursive: true });
for (const file of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
  await copyFile(path.join(root, 'node_modules/three/examples/jsm/libs/draco/gltf', file), path.join(root, 'apps/web/public/decoders/draco', file));
}
console.log(JSON.stringify({ originalSha256: sourceRecord.originalSha256, runtimeSha256: manifest.sha256, bytes: runtime.length, status: manifest.status }, null, 2));
