import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const json = async (file) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const required = [
  'README.md', 'THIRD_PARTY_NOTICES.md', 'licenses/Draco-APACHE-2.0.txt', 'licenses/SU7-CC-BY-4.0.txt',
  'assets/source/original/xiaomi-su7.zip', 'assets/source/blender/su7-enhanced.blend',
  'docs/assets/asset-audit.md', 'docs/assets/export-plan.md', 'docs/assets/nodes.csv', 'docs/assets/materials.csv',
  'docs/I0_I1_VALIDATION.md', 'docs/SESSION_LOG.md', 'docs/NEXT_ITERATION.md', 'docs/PROVIDER_TODO.md',
  'docs/assets/su7-exterior-Edge-1920x1080.png', 'docs/assets/su7-exterior-Edge-1366x768.png',
  'docs/assets/su7-cabin-Edge-1920x1080.png', 'docs/assets/su7-cabin-Edge-1366x768.png',
];
for (const file of required) assert((await stat(file)).size > 0, `Missing ${file}`);
const manifest = await json('apps/web/public/models/asset-manifest.json');
for (const file of ['apps/web/public/models/su7-runtime.glb', 'assets/derived/su7-runtime.glb', 'apps/web/dist/models/su7-runtime.glb']) {
  const bytes = await readFile(file);
  assert.equal(bytes.length, manifest.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
}
const source = await json('assets/source/source-record.json');
assert.equal(createHash('sha256').update(await readFile(source.original)).digest('hex'), source.originalSha256);
assert.equal(source.modelId, 'ca2cda599f5341068c992c9f44551bf9');
const blend = await json('docs/assets/blend-portability-check.json');
assert(blend.allTexturesPacked && blend.images.length === 15 && blend.meshes === 84 && blend.triangles === 92410);
const mic = (await json('docs/validation/scene-diagnostics-2026-10-26T09-52-59-971Z.json')).microphone;
assert(mic.status === 'signal-detected' && mic.samples >= 50 && mic.peakRms > 0.0005 && mic.durationMs >= 2800);
const perf = await json('docs/validation/scene-diagnostics-2026-10-26T09-59-16-015Z.json');
assert(perf.samples.length >= 120 && perf.samples.at(-1).elapsed >= 120);
const full = await json('docs/validation/playwright-results-full.json');
assert.equal(full.stats.expected, 9); assert.equal(full.stats.unexpected, 0); assert.equal(full.stats.skipped, 1);
const visual = await json('docs/validation/playwright-results-visual.json');
assert.equal(visual.stats.expected, 4); assert.equal(visual.stats.unexpected, 0);
const final = await json('docs/validation/playwright-results.json');
assert.equal(final.stats.expected, 2); assert.equal(final.stats.unexpected, 0);
const unit = await json('docs/validation/unit-tests.json');
assert(unit.success && unit.numPassedTests === 4);
const checklist = await readFile('docs/IMPLEMENTATION_CHECKLIST.md', 'utf8');
const first = checklist.slice(checklist.indexOf('## I0：'), checklist.indexOf('## I2：'));
assert.equal((first.match(/- \[x\]/g) ?? []).length, 15);
assert(!checklist.slice(checklist.indexOf('## I2：')).includes('- [x]'));
const health = await fetch('http://localhost:3000/api/health');
assert(health.ok && (await health.json()).version === '0.1.0');
const result = { checkedAt: new Date().toISOString(), status: 'pass', requiredArtifacts: required.length,
  runtimeSha256: manifest.sha256, originalSha256: source.originalSha256,
  fullBrowserPassed: full.stats.expected, skipped: full.stats.skipped, visualRechecks: visual.stats.expected,
  freeTraversalRechecks: final.stats.expected, unitPassed: unit.numPassedTests, liveUrl: 'http://localhost:3000',
  scope: 'I0–I1 only; no I2+ acceptance checked' };
await writeFile('docs/validation/delivery-audit.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
