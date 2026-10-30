import {useEffect,useMemo} from 'react';
import {useFrame} from '@react-three/fiber';
import {AdditiveBlending,DepthTexture,DoubleSide,Group,Matrix4,Mesh,MeshDepthMaterial,ShaderMaterial,Vector2,Vector3,Vector4,WebGLRenderTarget} from 'three';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {useVehicle} from './vehicle';
type Volume={origin:Vector3;target:Vector3;power:number;angle:number;range:number};

/** Soft ray-marched shafts link the actual apertures and their ground footprints. */
export function WelcomeAtmosphere({model}:{model:Group}){
 const r=useMemo(()=>{
  const target=new WebGLRenderTarget(1,1,{depthBuffer:true});target.depthTexture=new DepthTexture(1,1);
  const depth=new MeshDepthMaterial({side:DoubleSide});depth.colorWrite=false;
  const material=new ShaderMaterial({transparent:true,blending:AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{depth:{value:target.depthTexture},inverseProjection:{value:new Matrix4()},cameraWorld:{value:new Matrix4()},eye:{value:new Vector3()},origins:{value:Array.from({length:6},()=>new Vector4())},directions:{value:Array.from({length:6},()=>new Vector4())},ranges:{value:new Float32Array(6)},gain:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`varying vec2 vUv;uniform sampler2D depth;uniform mat4 inverseProjection,cameraWorld;uniform vec3 eye;uniform vec4 origins[6],directions[6];uniform float ranges[6],gain;
void main(){float z=texture2D(depth,vUv).r;vec4 view=inverseProjection*vec4(vUv*2.-1.,z*2.-1.,1.);vec3 end=(cameraWorld*vec4(view.xyz/view.w,1.)).xyz;
 vec3 direction=normalize(end-eye);float distance=min(length(end-eye),14.),glow=0.;
 for(int i=0;i<6;i++){if(origins[i].w<.0001)continue;float range=ranges[i];vec3 center=origins[i].xyz+directions[i].xyz*range*.5,offset=center-eye;
 float radius=range*sqrt(.25+directions[i].w*directions[i].w),b=dot(offset,direction),discriminant=radius*radius-dot(offset,offset)+b*b;if(discriminant<=0.)continue;
 float near=max(0.,b-sqrt(discriminant)),far=min(distance,b+sqrt(discriminant));if(far<=near)continue;float stepSize=(far-near)/16.;
 for(int j=0;j<16;j++){vec3 p=eye+direction*(near+(float(j)+.5)*stepSize),d=p-origins[i].xyz;float along=dot(d,directions[i].xyz);if(along<=.015||along>=range)continue;
 float radial=length(d-along*directions[i].xyz),coneRadius=max(.008,along*directions[i].w),soft=1.-smoothstep(.06,1.,radial/coneRadius);
 glow+=soft*soft*origins[i].w*exp(-along*.3)*stepSize*.085;}}
 gl_FragColor=vec4(vec3(.68,.84,1.)*glow*gain,1.);}`});
  return {target,depth,material,quad:new FullScreenQuad(material),size:new Vector2()};
 },[]);
 useEffect(()=>()=>{r.target.dispose();r.target.depthTexture?.dispose();r.depth.dispose();r.material.dispose();r.quad.dispose();},[r]);
 useFrame(({gl,scene,camera})=>{
  const state=useVehicle.getState().state.scatter,sources=(model.getObjectByName('SU7_ROOT')?.userData.welcomeVolumes??[]) as Volume[];
  if(!state.enabled||!sources.some(s=>s.power>.0001))return;
  gl.getDrawingBufferSize(r.size);const w=Math.ceil(r.size.x/2),h=Math.ceil(r.size.y/2);if(r.target.width!==w||r.target.height!==h)r.target.setSize(w,h);
  const u=r.material.uniforms;u.inverseProjection.value.copy(camera.projectionMatrixInverse);u.cameraWorld.value.copy(camera.matrixWorld);u.eye.value.copy(camera.position);u.gain.value=.4+state.strength*1.6;
  sources.forEach((s,i)=>{u.origins.value[i].set(...s.origin.toArray(),s.power);const direction=s.target.clone().sub(s.origin).normalize();u.directions.value[i].set(...direction.toArray(),Math.tan(s.angle));u.ranges.value[i]=s.range;});
  const override=scene.overrideMaterial,background=scene.background,autoClear=gl.autoClear;
  const transparent:Array<{mesh:Mesh;visible:boolean}>=[];scene.traverse(o=>{if(o instanceof Mesh&&(Array.isArray(o.material)?o.material:[o.material]).every(m=>m.transparent)){transparent.push({mesh:o,visible:o.visible});o.visible=false;}});
  try{scene.background=null;scene.overrideMaterial=r.depth;gl.setRenderTarget(r.target);gl.clear();gl.autoClear=false;gl.render(scene,camera);gl.setRenderTarget(null);r.quad.render(gl);}
  finally{scene.overrideMaterial=override;scene.background=background;gl.autoClear=autoClear;transparent.forEach(o=>{o.mesh.visible=o.visible;});gl.setRenderTarget(null);}
 },1.8);
 return null;
}
