import {it,expect} from 'vitest';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {BufferGeometry,Float32BufferAttribute,Matrix4,Vector3} from 'three';
import {MeshBVH} from 'three-mesh-bvh/src/index.js';
import profile from '../../apps/web/src/data/dashboard-profile.json';
import nativePaths from '../../apps/web/src/data/native-ambient-paths.json';

it('fits both wider crown halves to the real surface with an identical shared joint',async()=>{
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('apps/web/public/models/su7-runtime.glb'),nodes=doc.getRoot().listNodes();
 const source=nodes.find(n=>n.getName()===profile.source)!,primitive=source.getMesh()!.listPrimitives()[0];
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(primitive.getAttribute('POSITION')!.getArray()!,3));geometry.setIndex(Array.from(primitive.getIndices()!.getArray()!));geometry.applyMatrix4(new Matrix4().fromArray(source.getWorldMatrix()));
 const bvh=new MeshBVH(geometry);let maxClearance=0,maxVertex=0;let worst:unknown;
 expect(profile.width).toBe(.0048);expect(profile.meshes.reduce((n,m)=>n+m.sections,0)).toBe(585);
 const leftDoor=nativePaths.Mesh47.find(r=>r.name==='front-upper-left')!,rightDoor=nativePaths.Mesh34.find(r=>r.name==='front-upper-right')!;
 expect(new Vector3().fromArray(profile.meshes[0].centreline).distanceTo(new Vector3(...leftDoor.points[0]))).toBeLessThan(.00005);
 expect(new Vector3().fromArray(profile.meshes[1].centreline,profile.meshes[1].centreline.length-3).distanceTo(new Vector3(...rightDoor.points[0]))).toBeLessThan(.00005);
 const halves=profile.meshes.map(m=>{
  const matrix=new Matrix4().fromArray(nodes.find(n=>n.getName()===m.node)!.getWorldMatrix()),p=[];
  for(let i=0;i<m.positions.length;i+=3){const v=new Vector3().fromArray(m.positions,i).applyMatrix4(matrix);p.push(v);maxVertex=Math.max(maxVertex,bvh.closestPointToPoint(v)!.distance);}
  for(let i=0;i<m.indices.length;i+=3){const mid=p[m.indices[i]].clone().add(p[m.indices[i+1]]).add(p[m.indices[i+2]]).multiplyScalar(1/3);const distance=bvh.closestPointToPoint(mid)!.distance;if(distance>maxClearance){maxClearance=distance;worst={node:m.node,triangle:i/3,point:mid.toArray()};}}
  return p;
 });
 expect(maxVertex,'vertex clearance').toBeLessThan(.0015);expect(maxClearance,JSON.stringify(worst)).toBeLessThan(.0015);
 for(let side=0;side<profile.columns;side++)expect(halves[0][(profile.meshes[0].sections-1)*profile.columns+side].distanceTo(halves[1][side])).toBeLessThan(.000001);
 geometry.dispose();
});
