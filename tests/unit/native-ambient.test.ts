import {beforeAll,describe,expect,it} from 'vitest';
import {NodeIO,type Node} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial,Vector3} from 'three';
import {bindNativeAmbient} from '../../apps/web/src/nativeAmbient';
import paths from '../../apps/web/src/data/native-ambient-paths.json';

// Load actual shipped geometry and hierarchy, without needing a DOM to decode textures.
let model:Group;
beforeAll(async()=>{
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('apps/web/public/models/su7-runtime.glb');
 const build=(node:Node):Group|Mesh=>{
  const primitive=node.getMesh()?.listPrimitives()[0];let object:Group|Mesh;
  if(primitive){
   const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(primitive.getAttribute('POSITION')!.getArray()!,3));
   if(primitive.getIndices())geometry.setIndex(Array.from(primitive.getIndices()!.getArray()!));
   object=new Mesh(geometry,new MeshStandardMaterial());
  }else object=new Group();
  object.name=node.getName();object.position.fromArray(node.getTranslation());object.quaternion.fromArray(node.getRotation());object.scale.fromArray(node.getScale());
  for(const child of node.listChildren())object.add(build(child));return object;
 };
 model=new Group();for(const node of doc.getRoot().listScenes()[0].listChildren())model.add(build(node));model.updateMatrixWorld(true);
});

describe('native ambient trim on actual runtime asset',()=>{
 it('restores all front and rear zones on original trim faces, matches opposite sides and does not move or duplicate geometry',()=>{
  const original=new Map<Mesh,{geometry:BufferGeometry;material:Mesh['material'];visible:boolean}>();
  model.traverse(o=>{if(o instanceof Mesh)original.set(o,{geometry:o.geometry,material:o.material,visible:o.visible});});
  const b=bindNativeAmbient(model);
  expect(b.zones).toHaveLength(10);expect(b.replaced).toHaveLength(21);expect(b.routeCount).toBe(27);
  for(const {node,vertices} of b.zones){
   expect(vertices).toBeGreaterThan(0);const mesh=model.getObjectByName(node) as Mesh;
   const g=mesh.geometry,p=g.getAttribute('position');
   expect(Array.from(p.array)).toEqual(Array.from(original.get(mesh)!.geometry.getAttribute('position').array));
   expect(g.index?.array).toEqual(original.get(mesh)!.geometry.index?.array);
   const idx=g.index,edges:Array<[Vector3,Vector3]>=[];
   const at=(i:number)=>new Vector3().fromBufferAttribute(p,idx?idx.getX(i):i).applyMatrix4(mesh.matrixWorld);
   for(let i=0;i<(idx?.count??p.count);i+=3){
    for(let j=0;j<3;j++)edges.push([at(i+j),at(i+(j+1)%3)]);
   }
   for(const route of paths[node as keyof typeof paths]){
   const path=route.points.map(p=>new Vector3(...p));
   for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];expect(a.distanceTo(b)).toBeGreaterThan(.001);
    expect(edges.some(([u,v])=>(u.distanceTo(a)<.00002&&v.distanceTo(b)<.00002)||(u.distanceTo(b)<.00002&&v.distanceTo(a)<.00002)),`${node}/${route.name}: path segment ${i} must be an original triangle edge`).toBe(true);
   }
   }
  }
  for(const [left,right] of [['Mesh43','Mesh30'],['Mesh47','Mesh34'],['Mesh40','Mesh27'],['Mesh49','Mesh36'],['Mesh53','Mesh53'],['Mesh59','Mesh59']]){
   const a=paths[left as keyof typeof paths].flatMap(r=>r.points.map(p=>new Vector3(...p))),b=paths[right as keyof typeof paths].flatMap(r=>r.points.map(p=>new Vector3(...p)));
   for(const p of a){const mirrored=new Vector3(-p.x,p.y,p.z);expect(Math.min(...b.map(q=>q.distanceTo(mirrored))),`${left}/${right}: ${p.toArray()}`).toBeLessThan(.0002);}
  }
  for(const name of b.replaced)expect(model.getObjectByName(name)!.visible).toBe(false);
  expect(model.getObjectByName('AMBIENT_DASH_CROWN_LEFT')?.visible??true).toBe(true);
  // Door trim remains under its animated door parent, never attached to glass.
  for(const name of ['Mesh43','Mesh30','Mesh47','Mesh34','Mesh40','Mesh27']){
   let parent=model.getObjectByName(name)!.parent;while(parent&&!parent.name.startsWith('DOOR_'))parent=parent.parent;
   expect(parent?.name).toMatch(/^DOOR_(FL|FR|RL|RR)_ROOT$/);
  }
  b.dispose();for(const [mesh,before]of original){expect(mesh.geometry).toBe(before.geometry);expect(mesh.material).toBe(before.material);expect(mesh.visible).toBe(before.visible);}
 });
});
