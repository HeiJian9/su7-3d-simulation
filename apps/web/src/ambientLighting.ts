import {Box3,Data3DTexture,Float32BufferAttribute,Group,LinearFilter,Matrix4,Mesh,Object3D,RedFormat,UnsignedByteType,Vector3} from 'three';
import paths from './data/native-ambient-paths.json';
import dashboardProfile from './data/dashboard-profile.json';

export type AmbientRoute={name:string;points:number[][];radius:number;gain:number};
export const nativeRoutes:Record<string,AmbientRoute[]>=paths;
export function ambientParent(object:Object3D,root:Object3D){
 let parent:Object3D|null=object;
 while(parent&&parent!==root){if(/^DOOR_(FL|FR|RL|RR)_ROOT$/.test(parent.name))return parent;parent=parent.parent;}
 return root;
}
export function groupedAmbientRoutes(model:Group){
 const root=model.getObjectByName('SU7_ROOT')!,groups=new Map<Object3D,AmbientRoute[]>();
 for(const [name,routes]of Object.entries(nativeRoutes)){
  const parent=ambientParent(model.getObjectByName(name)!,root);
  groups.set(parent,[...(groups.get(parent)??[]),...routes]);
 }
 return groups;
}

/** Bake a smooth light field around the actual emitting edges. Sampling five
 * small volumes avoids tracing every individual segment at every march step. */
export function createCabinLightFields(model:Group){
 const root=model.getObjectByName('SU7_ROOT')!;model.updateMatrixWorld(true);
 const groups=groupedAmbientRoutes(model);
 // Dashboard diffusers retain their verified geometry; include their actual
 // surface samples in the same field, rather than estimated point positions.
 model.traverse(o=>{
  if(!(o instanceof Mesh)||!/^AMBIENT_DASH/.test(o.name))return;
  const fitted=dashboardProfile.meshes.find(m=>m.node===o.name);
  const p=fitted?new Float32BufferAttribute(fitted.centreline,3):o.geometry.getAttribute('position'),matrix=new Matrix4().copy(root.matrixWorld).invert().multiply(o.matrixWorld);
  const points:number[][]=[];const v=new Vector3();
  for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/40)))points.push(v.fromBufferAttribute(p,i).applyMatrix4(matrix).toArray());
  groups.get(root)!.push({name:o.name,points,radius:.003,gain:1});
 });
 const fields=[...groups].map(([parent,routes])=>{
  const fromRoot=new Matrix4().copy(parent.matrixWorld).invert().multiply(root.matrixWorld);
  const segments=routes.flatMap(r=>r.points.slice(1).map((p,i)=>{
   const a=new Vector3(...r.points[i]),b=new Vector3(...p);return {a,b,ab:b.clone().sub(a),gain:r.gain};
  })).filter(s=>s.ab.lengthSq()>1e-10);
  const bounds=new Box3();segments.forEach(s=>{bounds.expandByPoint(s.a);bounds.expandByPoint(s.b);});bounds.expandByScalar(.22);
  const resolution=[24,32,64],size=bounds.getSize(new Vector3()),data=new Uint8Array(resolution[0]*resolution[1]*resolution[2]);
  const p=new Vector3(),ap=new Vector3();let k=0,nonzero=0;
  for(let z=0;z<resolution[2];z++)for(let y=0;y<resolution[1];y++)for(let x=0;x<resolution[0];x++){
   p.set(bounds.min.x+(x+.5)/resolution[0]*size.x,bounds.min.y+(y+.5)/resolution[1]*size.y,bounds.min.z+(z+.5)/resolution[2]*size.z);
   // Cabin-side air only. These limits prevent an interior LED halo from
   // wrapping around the outer door skin, roof or through the floor.
   const inside=p.y>.34&&p.y<1.27&&p.z>-.98&&p.z<1.30&&(parent===root?Math.abs(p.x)<.74:parent.name.includes('_FL_')||parent.name.includes('_RL_')?p.x>-.745:p.x<.745);
   let value=0;
   if(inside)for(const s of segments){
    ap.subVectors(p,s.a);const t=Math.max(0,Math.min(1,ap.dot(s.ab)/s.ab.lengthSq()));
    const d=ap.addScaledVector(s.ab,-t).length();
    if(d<.22)value=Math.max(value,Math.exp(-d*d/.0144)*(1-Math.min(1,d/.22)**4)*s.gain);
   }
   data[k]=Math.round(Math.min(1,value)*255);if(data[k])nonzero++;k++;
  }
  // Keep grid coordinates in closed-root space. As a door moves, the sampling
  // matrix maps current world samples back into that door's original field.
  const texture=new Data3DTexture(data,...resolution as [number,number,number]);texture.format=RedFormat;texture.type=UnsignedByteType;
  texture.minFilter=texture.magFilter=LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true;
  return {parent,texture,bounds,fromRoot,routeCount:routes.length,nonzero};
 });
 return {fields,dispose(){fields.forEach(f=>f.texture.dispose());}};
}
