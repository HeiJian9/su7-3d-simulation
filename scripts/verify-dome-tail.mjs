import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read('apps/web/public/models/su7-runtime.glb'),base=await io.readBinary(new Uint8Array(execFileSync('git',['show','697b314:apps/web/public/models/su7-runtime.glb'],{maxBuffer:20*1024*1024}))),nodes=doc.getRoot().listNodes(),mapping=JSON.parse(await readFile('docs/assets/vehicle-mapping.json','utf8'));
function signature(node){return createHash('sha256').update(JSON.stringify({world:node.getWorldMatrix(),parent:node.getParentNode()?.getName(),primitives:node.getMesh()?.listPrimitives().map(p=>({attributes:p.listSemantics().map(s=>[s,[...p.getAttribute(s).getArray()]]),indices:p.getIndices()?[...p.getIndices().getArray()]:null,material:p.getMaterial()?.getName(),targets:p.listTargets().map(t=>[...t.getAttribute('POSITION').getArray()])}))})).digest('hex');}
function triangles(node){return node.getMesh().listPrimitives().flatMap(p=>{const ids=p.getIndices()?.getArray()??Array.from({length:p.getAttribute('POSITION').getCount()},(_,i)=>i),records=[];for(let i=0;i<ids.length;i+=3){const face=[];for(let k=0;k<3;k++){const v=ids[i+k];face.push(['POSITION','NORMAL','TEXCOORD_0'].map(s=>{const a=p.getAttribute(s);return a?[...a.getArray().slice(v*a.getElementSize(),(v+1)*a.getElementSize())].map(x=>Math.round(x*1e6)):null;}));}records.push(JSON.stringify(face.sort()));}return records;}).sort();}
let unchanged=0;const ring=[];
for(const original of base.getRoot().listNodes()){
 if((mapping.frunk?.sourceNodes??[]).includes(original.getName()))continue;
 const node=nodes.find(n=>n.getName()===original.getName());assert.ok(node);
 if(mapping.materialRoles.tailRunning.nodes.includes(node.getName())){assert.deepEqual(triangles(node),triangles(original));assert.deepEqual(node.getWorldMatrix(),original.getWorldMatrix());assert.equal(node.getParentNode()?.getName(),original.getParentNode()?.getName());const count=node.getMesh().listPrimitives().filter(p=>p.getMaterial().getName()==='TAIL_RUNNING_RED').reduce((sum,p)=>sum+p.getIndices().getCount()/3,0);assert.equal(count,node.getName()==='Mesh21'?434:280);ring.push({node:node.getName(),triangles:count,sourceGeometryUnchanged:true});}
 else{assert.equal(signature(node),signature(original),original.getName());unchanged++;}
}
const fixtures=[];
for(const [position,cfg] of Object.entries(mapping.cabinLights)){
 assert.ok(nodes.find(n=>n.getName()===cfg.housing));assert.ok(nodes.find(n=>n.getName()===cfg.lens));assert.ok(cfg.direction[1]<-.98);assert.ok(Math.abs(cfg.position[0])<.002);assert.ok(cfg.roofHit[1]-cfg.position[1]>.018&&cfg.roofHit[1]-cfg.position[1]<.025);fixtures.push({position,...cfg});
}
assert.equal(nodes.length,base.getRoot().listNodes().length+4+(mapping.frunk?.newNodes.length??0));
const report={passed:true,baseline:'697b314',unmodifiedNodes:unchanged,nativeRing:ring,fixtures,newNodes:4,tailSamples:mapping.materialRoles.tailRunning.samples.length};await mkdir('docs/validation/dome-tail',{recursive:true});await writeFile('docs/validation/dome-tail/geometry.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,unchanged,newNodes:4,tailTriangles:714}));
