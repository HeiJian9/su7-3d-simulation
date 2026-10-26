import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const runtime='apps/web/public/models/su7-runtime.glb';
const mapping=JSON.parse(await readFile('apps/web/public/models/window-mapping.json','utf8'));
await mkdir('apps/web/src/data',{recursive:true});
await copyFile('apps/web/public/models/window-mapping.json','apps/web/src/data/window-mapping.json');
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(runtime);
const nodes=doc.getRoot().listNodes();
for(const [corner,window] of Object.entries(mapping.windows)) {
  const node=nodes.find(n=>n.getName()===window.node);
  if(!node || !nodes.find(n=>n.getName()===window.glass)) throw Error(`Missing ${corner}`);
  if(node.getTranslation().some((v,i)=>Math.abs(v-window.closedTranslation[i])>.00001))throw Error(`Unexpected ${corner} local frame: ${node.getTranslation()}`);
}
const bytes=await readFile(runtime),sha256=createHash('sha256').update(bytes).digest('hex');
const file='apps/web/public/models/asset-manifest.json',manifest=JSON.parse(await readFile(file,'utf8'));
Object.assign(manifest,{sha256,bytes:bytes.length,message:'指定 SU7 · I2 四窗真实几何升降；语音接口待配置。'});
await writeFile(file,JSON.stringify(manifest,null,2)+'\n');
await copyFile(runtime,'assets/derived/su7-runtime.glb');
const sourceFile='assets/source/source-record.json',source=JSON.parse(await readFile(sourceFile,'utf8'));
source.runtimeSha256=sha256;source.enhancedAt=new Date().toISOString();source.assetIncrement='I2';
source.windowMapping='docs/assets/window-mapping.json';
source.modifications=[...source.modifications.filter(x=>!x.startsWith('I2:')),'I2: semantic four-window roots from original source glass; local translation into doors, no glass scaling or opacity animation; adjacent static glazing retained'];
await writeFile(sourceFile,JSON.stringify(source,null,2)+'\n');
console.log(JSON.stringify({sha256,bytes:bytes.length,nodes:nodes.length,meshCount:doc.getRoot().listMeshes().length,windows:4}));
