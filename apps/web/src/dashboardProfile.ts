import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial} from 'three';
import profile from './data/dashboard-profile.json';

/** Retain the fitted native route, with a consistent diffuser cross-section. */
export function bindDashboardProfile(model:Group){
 const materials:MeshStandardMaterial[]=[],restore:Array<()=>void>=[];
 for(const cfg of profile.meshes){
  const mesh=model.getObjectByName(cfg.node) as Mesh;
  const originalGeometry=mesh.geometry,originalMaterial=mesh.material;
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(cfg.positions,3));geometry.setIndex(cfg.indices);geometry.computeVertexNormals();mesh.geometry=geometry;
  const clones=(Array.isArray(originalMaterial)?originalMaterial:[originalMaterial]).map(m=>{
   if(!(m instanceof MeshStandardMaterial))return m;
   const clone=m.clone();clone.name='DASHBOARD_PROFILE_LED';materials.push(clone);return clone;
  });
  mesh.material=Array.isArray(originalMaterial)?clones:clones[0];
  restore.push(()=>{mesh.geometry=originalGeometry;mesh.material=originalMaterial;geometry.dispose();});
 }
 return {materials,profile,dispose(){restore.reverse().forEach(fn=>fn());materials.forEach(m=>m.dispose());}};
}
