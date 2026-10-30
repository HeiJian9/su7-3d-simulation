// Read-only survey of the shipped original projector faces. No model rewrite.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {Matrix4,Ray,Vector3} from 'three';
import {writeFile} from 'node:fs/promises';
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('apps/web/public/models/su7-runtime.glb');
const node=doc.getRoot().listNodes().find(n=>n.getName()==='Mesh61'),matrix=new Matrix4().fromArray(node.getWorldMatrix());
const lenses=node.getMesh().listPrimitives().map(p=>{
 const points=Array.from({length:p.getAttribute('POSITION').getCount()},(_,i)=>new Vector3().fromArray(p.getAttribute('POSITION').getArray(),i*3).applyMatrix4(matrix));
 const unique=[...new Map(points.map(p=>[p.toArray().map(n=>n.toFixed(6)).join(','),p])).values()];
 const indices=p.getIndices()?.getArray()??points.map((_,i)=>i),normal=new Vector3();
 for(let i=0;i<indices.length;i+=3){const [a,b,c]=[points[indices[i]],points[indices[i+1]],points[indices[i+2]]];normal.add(b.clone().sub(a).cross(c.clone().sub(a)));}
 normal.normalize();if(normal.z>0)normal.negate();
 const center=unique.reduce((v,p)=>v.add(p),new Vector3()).multiplyScalar(1/unique.length);
 const u=new Vector3(-1,0,0).projectOnPlane(normal).normalize(),v=normal.clone().cross(u).normalize();
 return {material:p.getMaterial().getName(),side:center.x<0?'left':'right',module:Number(p.getMaterial().getName().split('_').at(-1)),center:center.toArray(),normal:normal.toArray(),u:u.toArray(),v:v.toArray(),boundary:unique.map(p=>p.toArray()),triangles:Array.from({length:indices.length/3},(_,i)=>Array.from(indices.slice(i*3,i*3+3),j=>points[j].toArray()))};
});
const doorSources={};
for(const corner of ['fl','fr','rl','rr']){
 const x=corner.endsWith('l')?-.925:.925,z=corner.startsWith('f')?-.27:.8,door=`DOOR_${corner.toUpperCase()}_ROOT`;
 const ray=new Ray(new Vector3(x,0,z),new Vector3(0,1,0)),hits=[];
 for(const n of doc.getRoot().listNodes()){
  let parent=n;while(parent&&parent.getName()!==door)parent=parent.getParentNode();if(!parent)continue;
  for(const p of n.getMesh()?.listPrimitives()??[]){
   const position=p.getAttribute('POSITION'),m=new Matrix4().fromArray(n.getWorldMatrix()),points=Array.from({length:position.getCount()},(_,i)=>new Vector3().fromArray(position.getArray(),i*3).applyMatrix4(m));
   const indices=p.getIndices()?.getArray()??points.map((_,i)=>i);
   for(let i=0;i<indices.length;i+=3){const hit=ray.intersectTriangle(points[indices[i]],points[indices[i+1]],points[indices[i+2]],false,new Vector3());if(hit&&hit.y>.15&&hit.y<.45)hits.push(hit.y);}
  }
 }
 if(!hits.length)throw Error(`No original underside surface at ${corner}`);
 doorSources[corner]=[x,Math.min(...hits)-.004,z];
}
await writeFile('apps/web/src/data/welcome-lenses.json',JSON.stringify({source:'Mesh61',cellsPerModule:12,lenses,doorSources},null,2)+'\n');
console.log(JSON.stringify({lenses:lenses.length,cells:lenses.length*12,sourceUnmodified:true}));
