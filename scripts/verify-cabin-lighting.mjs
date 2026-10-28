import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {BufferGeometry,Float32BufferAttribute,Line3,Matrix4,Vector3} from 'three';
import {MeshBVH} from 'three-mesh-bvh/src/index.js';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read('apps/web/public/models/su7-runtime.glb');
const original=await io.readBinary(new Uint8Array(execFileSync('git',['show','16cb5b9:apps/web/public/models/su7-runtime.glb'],{maxBuffer:20*1024*1024})));
const audit=JSON.parse(await readFile('docs/assets/cabin-lighting-audit.json','utf8')),mapping=JSON.parse(await readFile('docs/assets/vehicle-mapping.json','utf8')),nodes=doc.getRoot().listNodes();
function positions(node){const matrix=new Matrix4().fromArray(node.getWorldMatrix());return node.getMesh().listPrimitives().flatMap(p=>{const a=p.getAttribute('POSITION').getArray(),idx=p.getIndices()?.getArray();return Array.from({length:idx?.length??a.length/3},(_,i)=>new Vector3().fromArray(a,(idx?idx[i]:i)*3).applyMatrix4(matrix));});}
const trees=new Map();function tree(name){if(!trees.has(name)){const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions(nodes.find(n=>n.getName()===name)).flatMap(p=>p.toArray()),3));trees.set(name,new MeshBVH(g));}return trees.get(name);}
const records=[];
for(const r of audit.records){
 const node=nodes.find(n=>n.getName()===r.node);assert.ok(node);assert.equal(node.getParentNode().getName(),r.parent);
 const pts=positions(node),bvh=tree(r.source);let vertexMax=0,centroidMax=0;
 for(const p of pts)vertexMax=Math.max(vertexMax,bvh.closestPointToPoint(p,{}).distance);
 for(let i=0;i<pts.length;i+=3){const p=pts[i].clone().add(pts[i+1]).add(pts[i+2]).multiplyScalar(1/3);centroidMax=Math.max(centroidMax,bvh.closestPointToPoint(p,{}).distance);}
 assert.ok(vertexMax<.0015,`Floating vertex ${r.node}: ${vertexMax}`);assert.ok(centroidMax<.0015,`Floating connector ${r.node}: ${centroidMax}`);
 let edgeDeviation=null;
 if(r.trimEdgePath){
  const path=r.trimEdgePath.map(p=>new Vector3().fromArray(p)),segments=path.slice(1).map((p,i)=>new Line3(path[i],p));
  edgeDeviation=Math.max(...pts.map(p=>Math.min(...segments.map(s=>s.closestPointToPoint(p,true,new Vector3()).distanceTo(p)))));
  assert.ok(edgeDeviation<.0016,`Misaligned trim ${r.node}: ${edgeDeviation}`);
  assert.equal(r.trimmedGapFaces,0,`Broken trim ${r.node}`);
  if(r.routeRevision==='continuous_native_edge_v2'){
   const adjacency=new Map(),key=p=>p.toArray().map(v=>Math.round(v*1e6)).join(',');
   for(let i=0;i<pts.length;i+=3){const vs=pts.slice(i,i+3).map(key);for(const a of vs){if(!adjacency.has(a))adjacency.set(a,new Set());for(const b of vs)adjacency.get(a).add(b);}}
   const seen=new Set(),queue=[adjacency.keys().next().value];while(queue.length){const a=queue.pop();if(seen.has(a))continue;seen.add(a);queue.push(...adjacency.get(a));}
   assert.equal(seen.size,adjacency.size,`Disconnected crown ${r.node}`);
  }
 }
 records.push({node:r.node,source:r.source,parent:r.parent,triangles:pts.length/3,maxVertexClearanceMm:vertexMax*1000,maxTriangleCenterClearanceMm:centroidMax*1000,trimmedGapFaces:r.trimmedGapFaces,maxNativeEdgeDeviationMm:edgeDeviation===null?null:edgeDeviation*1000});
}
function signature(node){return createHash('sha256').update(JSON.stringify({world:node.getWorldMatrix(),parent:node.getParentNode()?.getName(),primitives:node.getMesh()?.listPrimitives().map(p=>({attributes:p.listSemantics().map(s=>[s,[...p.getAttribute(s).getArray()]]),indices:p.getIndices()?[...p.getIndices().getArray()]:null,material:p.getMaterial()?.getName(),targets:p.listTargets().map(t=>[...t.getAttribute('POSITION').getArray()])}))})).digest('hex');}
const unchanged=original.getRoot().listNodes().filter(n=>!audit.oldNodesReplaced.includes(n.getName())&&!(mapping.enclosureRepair?.modifiedNodes??[]).includes(n.getName())&&!(mapping.frunk?.sourceNodes??[]).includes(n.getName())&&!(mapping.materialRoles.tailRunning?.nodes??[]).includes(n.getName()));for(const n of unchanged)assert.equal(signature(nodes.find(v=>v.getName()===n.getName())),signature(n),'Source car changed: '+n.getName());
assert.equal(records.length,audit.designRevision==='layered_cabin_v1'?25:12);assert.equal(mapping.materialRoles.ambient.lights.length,audit.designRevision==='layered_cabin_v1'?16:8);
let additiveNodesPreserved=0;
if(audit.additiveBaseline){const baseline=await io.readBinary(new Uint8Array(execFileSync('git',['show',audit.additiveBaseline+':apps/web/public/models/su7-runtime.glb'],{maxBuffer:20*1024*1024})));for(const n of baseline.getRoot().listNodes()){if((mapping.enclosureRepair?.modifiedNodes??[]).includes(n.getName()))continue;assert.equal(signature(nodes.find(v=>v.getName()===n.getName())),signature(n),'Additive baseline changed: '+n.getName());additiveNodesPreserved++;}}
const result={passed:true,reference:'16cb5b9',actualExportedGlb:true,sourceNodesUnchanged:unchanged.length,ribbons:records.length,shortRangeLights:mapping.materialRoles.ambient.lights.length,additiveNodesPreserved,records};
if(mapping.dashTrimRepair){const left=audit.records.find(r=>r.node==='AMBIENT_DASH_CROWN_LEFT'),right=audit.records.find(r=>r.node==='AMBIENT_DASH_CROWN_RIGHT');assert.deepEqual(left.trimEdgePath.at(-1),right.trimEdgePath[0],'Dashboard crown must join at the same native vertex');}
const reportDir=mapping.dashTrimRepair?'docs/validation/trim-dialogue':mapping.enclosureRepair?'docs/validation/physical-fixes':audit.designRevision?'docs/validation/final-polish':'docs/validation/cabin-lighting';await mkdir(reportDir,{recursive:true});await writeFile(reportDir+'/geometry.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
