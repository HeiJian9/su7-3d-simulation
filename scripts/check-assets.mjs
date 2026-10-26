import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const manifest = JSON.parse(await readFile('apps/web/public/models/asset-manifest.json', 'utf8'));
if (manifest.status !== 'ready') throw new Error('Designated SU7 is not imported; asset acceptance cannot pass.');
const bytes = await readFile(`apps/web/public${manifest.runtimeUrl}`);
const digest = createHash('sha256').update(bytes).digest('hex');
if (manifest.sha256 !== digest || bytes.length !== manifest.bytes) throw new Error('Runtime manifest hash/length mismatch');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(`apps/web/public${manifest.runtimeUrl}`);
const root = doc.getRoot();
const report = { sha256: digest, bytes: bytes.length, nodes: root.listNodes().length, meshes: root.listMeshes().length,
  materials: root.listMaterials().length, textures: root.listTextures().map((t) => ({ name: t.getName(), size: t.getSize(), bytes: t.getImage()?.byteLength })),
  animations: root.listAnimations().length,
  triangles: root.listMeshes().flatMap((mesh) => mesh.listPrimitives()).reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 3, 0),
  extensions: root.listExtensionsUsed().map((e) => e.extensionName),
};
if (report.meshes !== 84 || report.triangles !== 92410) throw new Error('Unexpected geometry, compare with the selected original package.');
await writeFile(root.listNodes().some(n=>n.getName()==='WINDOW_FL_ROOT') ? 'docs/assets/i2-runtime-check.json' : 'docs/assets/runtime-check.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
