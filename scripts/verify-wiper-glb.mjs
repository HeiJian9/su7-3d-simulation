// Inspect actual exported POSITION + morph delta accessors, independent of UI state.
import {readFile,writeFile} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {Matrix4,Quaternion,Triangle,Vector3} from 'three';
import assert from 'node:assert/strict';
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('apps/web/public/models/su7-runtime.glb');
const mapping=JSON.parse(await readFile('docs/assets/vehicle-mapping.json','utf8')),nodes=doc.getRoot().listNodes();
const g=nodes.find(n=>n.getName()==='Mesh69'),matrix=new Matrix4().fromArray(g.getWorldMatrix()),triangles=[];
for(const p of g.getMesh().listPrimitives()){
  const positions=p.getAttribute('POSITION').getArray(),indices=p.getIndices().getArray();
  const at=i=>new Vector3().fromArray(positions,i*3).applyMatrix4(matrix);
  for(let i=0;i<indices.length;i+=3){const points=[at(indices[i]),at(indices[i+1]),at(indices[i+2])];if(points.every(v=>v.z<-.2)){const triangle=new Triangle(...points),normal=triangle.getNormal(new Vector3());if(normal.y<0)normal.negate();triangles.push({triangle,normal});}}
}
const closest=new Vector3(),nearest=new Vector3(),normal=new Vector3(),q=new Quaternion();let min=Infinity,max=-Infinity,pointsChecked=0;const records=[];
for(const [side,cfg] of Object.entries(mapping.wipers.assemblies)){
  const root=nodes.find(n=>n.getName()===cfg.node),node=nodes.find(n=>n.getName()===cfg.mesh);assert.deepEqual(root.getScale(),[1,1,1]);
  assert.deepEqual(node.getMesh().getExtras().targetNames,cfg.morphTargets);
  const localMatrix=new Matrix4().fromArray(node.getWorldMatrix()),pivot=new Vector3().fromArray(cfg.pivot),axis=new Vector3().fromArray(cfg.axis).normalize();let localMin=Infinity,localMax=-Infinity;
  for(const p of node.getMesh().listPrimitives()){
    const base=p.getAttribute('POSITION').getArray(),targets=p.listTargets().map(t=>t.getAttribute('POSITION').getArray());assert.equal(targets.length,8);
    for(let sample=0;sample<=100;sample++){
      const fraction=sample/100,scaled=fraction*8,lo=Math.floor(scaled),hi=Math.min(8,lo+1),t=scaled-lo;q.setFromAxisAngle(axis,cfg.maxAngle*fraction);
      for(let i=0;i<base.length;i+=3){
        const v=new Vector3().fromArray(base,i);for(let j=0;j<3;j++)v.setComponent(j,v.getComponent(j)+(lo?targets[lo-1][i+j]*(1-t):0)+(hi?targets[hi-1][i+j]*t:0));
        v.applyMatrix4(localMatrix).sub(pivot).applyQuaternion(q).add(pivot);let distance=Infinity;
        for(const item of triangles){item.triangle.closestPointToPoint(v,closest);const d=closest.distanceToSquared(v);if(d<distance){distance=d;nearest.copy(closest);normal.copy(item.normal);}}
        const signed=v.sub(nearest).dot(normal);localMin=Math.min(localMin,signed);localMax=Math.max(localMax,signed);pointsChecked++;
      }
    }
  }
  min=Math.min(min,localMin);max=Math.max(max,localMax);records.push({side,samples:101,minGlassClearanceMeters:localMin,maxGlassClearanceMeters:localMax});
}
const report={source:'actual runtime GLB accessors and morph targets',pointsChecked,minGlassClearanceMeters:min,maxGlassClearanceMeters:max,records,passed:min>.001&&max<.03};
await writeFile('docs/assets/i6-runtime-wiper-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));assert.ok(report.passed);
