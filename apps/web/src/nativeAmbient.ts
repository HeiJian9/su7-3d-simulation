import {Float32BufferAttribute,Group,Matrix4,Mesh,MeshStandardMaterial,Vector3,Vector4} from 'three';
import paths from './data/native-ambient-paths.json';
import {ambientParent,groupedAmbientRoutes,type AmbientRoute} from './ambientLighting';

const MAX_SEGMENTS=96;
/** Illuminate original cabin faces along their trim edges, without offset geometry. */
export function bindNativeAmbient(model:Group){
 const materials:MeshStandardMaterial[]=[],cleanup:Array<()=>void>=[],zones:Array<{node:string;vertices:number;routes:string[]}>=[],replaced:string[]=[];
 model.updateMatrixWorld(true);
 const root=model.getObjectByName('SU7_ROOT')!;
 const inverse=new Matrix4().copy(root.matrixWorld).invert();
 const groups=groupedAmbientRoutes(model),washSurfaces=new Set(['Mesh49','Mesh36','Mesh41','Mesh28','Mesh53','Mesh59']);
 model.traverse(o=>{
  if(!(o instanceof Mesh))return;
  // These added diffusers are replaced by illumination on existing trim faces.
  // The crown uses the visible Mesh54 trim, never an elevated Mesh53 overlay.
  if(/^AMBIENT_(DASH_CROWN_|DOOR_|HANDLE_|INLAY_|SPEAKER_|CONSOLE_|TUNNEL_|REAR_CONSOLE)/.test(o.name)){
   const visible=o.visible;o.visible=false;replaced.push(o.name);cleanup.push(()=>{o.visible=visible;});return;
  }
  const routes:AmbientRoute[]=paths[o.name as keyof typeof paths]??[];
  const washes=washSurfaces.has(o.name)?(groups.get(ambientParent(o,root))??[]).filter(r=>!routes.some(core=>core.name===r.name)):[];
  if(!routes.length&&!washes.length)return;
  const makeSegments=(list:AmbientRoute[])=>list.flatMap(r=>r.points.slice(1).map((p,i)=>({a:new Vector3(...r.points[i]),b:new Vector3(...p),radius:r.radius,gain:r.gain,fill:r.fill??.22})));
  const core=makeSegments(routes),segments=[...core,...makeSegments(washes)];
  if(segments.length>MAX_SEGMENTS)throw Error(`Too many native ambient segments: ${o.name}`);
  const starts=Array.from({length:MAX_SEGMENTS},(_,i)=>{const s=segments[i];return s?new Vector4(...s.a.toArray(),s.radius):new Vector4();});
  const ends=Array.from({length:MAX_SEGMENTS},(_,i)=>{const s=segments[i];return s?new Vector4(...s.b.toArray(),s.gain):new Vector4();});
  const fills=Float32Array.from({length:MAX_SEGMENTS},(_,i)=>segments[i]?.fill??.22);
  const originalGeometry=o.geometry,originalMaterial=o.material;
  const geometry=originalGeometry.clone(),position=geometry.getAttribute('position'),weights=new Float32Array(position.count),trimPositions=new Float32Array(position.count*3);
  const world=new Matrix4().multiplyMatrices(inverse,o.matrixWorld),p=new Vector3(),ab=new Vector3(),ap=new Vector3();let lit=0;
  for(let i=0;i<position.count;i++){
   p.fromBufferAttribute(position,i).applyMatrix4(world);p.toArray(trimPositions,i*3);
   // Large cabin meshes contain unrelated surfaces. Skip the fine fragment mask
   // for triangles whose vertices are all far from the luminous edges.
   const enabled=segments.some(s=>{ab.subVectors(s.b,s.a);ap.subVectors(p,s.a);const t=Math.max(0,Math.min(1,ap.dot(ab)/ab.lengthSq()));return ap.addScaledVector(ab,-t).length()<.25;});
   weights[i]=enabled?1:0;if(enabled)lit++;
  }
  geometry.setAttribute('nativeAmbient',new Float32BufferAttribute(weights,1));
  geometry.setAttribute('nativeTrimPosition',new Float32BufferAttribute(trimPositions,3));o.geometry=geometry;
  const clones=(Array.isArray(originalMaterial)?originalMaterial:[originalMaterial]).map(m=>{
   if(!(m instanceof MeshStandardMaterial))return m;
   const clone=m.clone();clone.name=`NATIVE_AMBIENT_${o.name}`;
   clone.onBeforeCompile=shader=>{
    shader.uniforms.uTrimA={value:starts};shader.uniforms.uTrimB={value:ends};shader.uniforms.uTrimCount={value:segments.length};
    shader.uniforms.uTrimFill={value:fills};
    shader.uniforms.uTrimCoreCount={value:core.length};shader.uniforms.uTrimWash={value:washSurfaces.has(o.name)?(ambientParent(o,root)===root?.03:.045):0};
    shader.vertexShader='attribute float nativeAmbient; varying float vNativeAmbient; attribute vec3 nativeTrimPosition; varying vec3 vNativeTrimPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvNativeAmbient=nativeAmbient;vNativeTrimPosition=nativeTrimPosition;');
    shader.fragmentShader=`varying float vNativeAmbient; varying vec3 vNativeTrimPosition;
uniform vec4 uTrimA[${MAX_SEGMENTS}];uniform vec4 uTrimB[${MAX_SEGMENTS}];uniform float uTrimFill[${MAX_SEGMENTS}];uniform int uTrimCount;uniform int uTrimCoreCount;uniform float uTrimWash;
float trimEdgeDistance(vec3 p,vec3 a,vec3 b){vec3 ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/max(dot(ab,ab),0.00000001),0.0,1.0));}
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
float trimGlow=0.0;float trimWash=0.0;
if(vNativeAmbient>0.001){for(int i=0;i<${MAX_SEGMENTS};i++){if(i>=uTrimCount)break;
float d=trimEdgeDistance(vNativeTrimPosition,uTrimA[i].xyz,uTrimB[i].xyz);
if(i<uTrimCoreCount)trimGlow=max(trimGlow,(1.0-smoothstep(uTrimA[i].w*uTrimFill[i],uTrimA[i].w,d))*uTrimB[i].w);
trimWash=max(trimWash,exp(-d*d/0.0144)*(1.0-smoothstep(0.14,0.24,d))*uTrimB[i].w);}}
totalEmissiveRadiance *= vec3(trimGlow)+trimWash*uTrimWash*sqrt(max(diffuseColor.rgb,vec3(.03)));`);
   };
   // Uniform paths let all doors share the shader for their original material.
   clone.customProgramCacheKey=()=> 'native-ambient-trim-v5';materials.push(clone);return clone;
  });
  o.material=Array.isArray(originalMaterial)?clones:clones[0];if(routes.length)zones.push({node:o.name,vertices:lit,routes:routes.map(r=>r.name)});
  cleanup.push(()=>{o.geometry=originalGeometry;o.material=originalMaterial;geometry.dispose();});
 });
 return {materials,zones,replaced,routeCount:zones.reduce((n,z)=>n+z.routes.length,0),dispose(){cleanup.reverse().forEach(f=>f());materials.forEach(m=>m.dispose());}};
}
