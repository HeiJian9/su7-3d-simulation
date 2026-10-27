import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read('apps/web/public/models/su7-runtime.glb');
const original=await io.readBinary(new Uint8Array(execFileSync('git',['show','9ee4d5f:apps/web/public/models/su7-runtime.glb'],{maxBuffer:20*1024*1024})));
const mapping=JSON.parse(await readFile('docs/assets/vehicle-mapping.json','utf8')),roles=mapping.materialRoles,nodes=doc.getRoot().listNodes();
const records=[];
for(const name of roles.removedProxyNodes)assert.ok(!nodes.some(n=>n.getName()===name),`Old tube/rod remains ${name}`);
function members(material){return nodes.flatMap(n=>(n.getMesh()?.listPrimitives()??[]).filter(p=>p.getMaterial()?.getName()===material).map(p=>({node:n.getName(),triangles:(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3})));}
function checkMaterial(name,source){
  const actual=doc.getRoot().listMaterials().find(m=>m.getName()===name),ref=original.getRoot().listMaterials().find(m=>m.getName()===source);
  assert.ok(actual&&ref);assert.deepEqual(actual.getBaseColorFactor(),ref.getBaseColorFactor(),'Unlit original colour preserved');assert.equal(actual.getRoughnessFactor(),ref.getRoughnessFactor());assert.equal(actual.getMetallicFactor(),ref.getMetallicFactor());assert.deepEqual(actual.getEmissiveFactor(),[0,0,0],'No permanently lit or brown proxy material');
}
for(const [side,cfg] of Object.entries(roles.headlights)){
  assert.equal(cfg.projectors.length,4);assert.deepEqual(cfg.drlNodes,[]);
  for(const p of cfg.projectors){const list=members(p.material);assert.deepEqual(list,[{node:'Mesh61',triangles:10}]);checkMaterial(p.material,'Mesh61Mtl');records.push({side,role:'native projector',material:p.material,members:list});}
}
for(const [side,cfg] of Object.entries(roles.turnSignals)){
  const [front,rear]=cfg.materials,frontNode=side==='left'?'Mesh73':'Mesh62';
  assert.deepEqual(members(front),[{node:frontNode,triangles:91}]);checkMaterial(front,'Mesh62Mtl');
  const source=side==='left'?'Mesh20':'Mesh19',parts=members(rear);assert.deepEqual(parts,[{node:source,triangles:6},{node:'TRUNK_'+source,triangles:8}]);checkMaterial(rear,'Mesh19Mtl');
  records.push({side,role:'native front diffuser',members:members(front)},{side,role:'native rear inner modules',members:parts});
}
for(const name of ['Mesh21','TRUNK_Mesh21'])assert.ok(nodes.find(n=>n.getName()===name).getMesh().listPrimitives().every(p=>!p.getMaterial().getName().startsWith('TURN_')),'C contour must retain its original material');
const report={passed:true,addedLampGeometry:false,removedProxyCount:roles.removedProxyNodes.length,projectors:8,records,unlitOriginalMaterialPreserved:true};
await mkdir('docs/validation/native-lamps',{recursive:true});await writeFile('docs/validation/native-lamps/native-membership.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
