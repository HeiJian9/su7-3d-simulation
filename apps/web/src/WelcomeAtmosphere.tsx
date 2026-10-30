import {useEffect,useMemo} from 'react';
import {useFrame} from '@react-three/fiber';
import {AdditiveBlending,DepthTexture,DoubleSide,Group,HalfFloatType,Matrix4,Mesh,MeshDepthMaterial,ShaderMaterial,Vector2,Vector3,Vector4,WebGLRenderTarget} from 'three';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {useVehicle} from './vehicle';
import {rainLayout} from './welcomeOptics';
type Volume={origin:Vector3;target:Vector3;power:number;angle:number;range:number;cell:number};

/** Soft ray-marched shafts link the actual apertures and their ground footprints. */
export function WelcomeAtmosphere({model}:{model:Group}){
 const r=useMemo(()=>{
  const target=new WebGLRenderTarget(1,1,{depthBuffer:true});target.depthTexture=new DepthTexture(1,1);
  const fog=new WebGLRenderTarget(1,1,{depthBuffer:false,type:HalfFloatType});
  const composite=new ShaderMaterial({transparent:true,blending:AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{fog:{value:fog.texture}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 vUv;uniform sampler2D fog;void main(){gl_FragColor=texture2D(fog,vUv);}'});
  const depth=new MeshDepthMaterial({side:DoubleSide});depth.colorWrite=false;
  const material=new ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{depth:{value:target.depthTexture},rainAtlas:{value:null},inverseRoot:{value:new Matrix4()},inverseProjection:{value:new Matrix4()},cameraWorld:{value:new Matrix4()},eye:{value:new Vector3()},origins:{value:Array.from({length:12},()=>new Vector4())},directions:{value:Array.from({length:12},()=>new Vector4())},ranges:{value:new Float32Array(12)},cells:{value:new Float32Array(12)},gain:{value:0},time:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`varying vec2 vUv;uniform sampler2D depth,rainAtlas;uniform mat4 inverseRoot,inverseProjection,cameraWorld;uniform vec3 eye;uniform vec4 origins[12],directions[12];uniform float ranges[12],cells[12],gain,time;
void main(){float z=texture2D(depth,vUv).r;vec4 view=inverseProjection*vec4(vUv*2.-1.,z*2.-1.,1.);vec3 end=(cameraWorld*vec4(view.xyz/view.w,1.)).xyz;
 vec3 direction=normalize(end-eye);float distance=min(length(end-eye),24.),glow=0.;
 for(int i=0;i<12;i++){if(origins[i].w<.0001)continue;float range=ranges[i];vec3 center=origins[i].xyz+directions[i].xyz*range*.5,offset=center-eye;
 float radius=range*sqrt(.25+directions[i].w*directions[i].w),b=dot(offset,direction),discriminant=radius*radius-dot(offset,offset)+b*b;if(discriminant<=0.)continue;
 float near=max(0.,b-sqrt(discriminant)),far=min(distance,b+sqrt(discriminant));if(far<=near)continue;float stepSize=(far-near)/32.;
 float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
 for(int j=0;j<32;j++){vec3 p=eye+direction*(near+(float(j)+.15+.7*jitter)*stepSize),d=p-origins[i].xyz;float along=dot(d,directions[i].xyz);if(along<=.015||along>=range)continue;
 float radial=length(d-along*directions[i].xyz),coneRadius=max(.008,along*directions[i].w),soft=1.-smoothstep(.06,1.,radial/coneRadius);
 float field=1.,density=.085;
 if(cells[i]>=0.){
  vec3 ray=p-origins[i].xyz;if(ray.y>=-.0001)continue;
  float toFloor=(-.0145-origins[i].y)/ray.y;if(toFloor<1.)continue;
  vec3 ground=(inverseRoot*vec4(origins[i].xyz+ray*toFloor,1.)).xyz;
  vec2 uv=vec2(abs(ground.x)/${rainLayout.halfWidth.toFixed(1)},(-ground.z-${rainLayout.start.toFixed(1)})/${rainLayout.length.toFixed(1)});if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))continue;
  vec2 tile=vec2(mod(cells[i],4.),floor(cells[i]/4.));uv=clamp(uv,vec2(.004),vec2(.996));
  field=.08+.92*sqrt(texture2D(rainAtlas,(tile+uv)/vec2(4.,2.)).r);
  float mist=.85+.15*sin(p.x*6.+sin(p.z*3.+time*.23))*sin(p.y*7.-time*.15);
  field*=mist*smoothstep(.01,.12,along);density=.13;
 }
 glow+=soft*soft*field*origins[i].w*exp(-along*.13)*stepSize*density;}}
 gl_FragColor=vec4(vec3(.82,.9,1.)*glow*gain,1.);}`});
  return {target,fog,composite,compositeQuad:new FullScreenQuad(composite),depth,material,quad:new FullScreenQuad(material),size:new Vector2()};
 },[]);
 useEffect(()=>()=>{r.target.dispose();r.target.depthTexture?.dispose();r.fog.dispose();r.composite.dispose();r.compositeQuad.dispose();r.depth.dispose();r.material.dispose();r.quad.dispose();},[r]);
 useFrame(({gl,scene,camera})=>{
  const root=model.getObjectByName('SU7_ROOT')!,state=useVehicle.getState().state.scatter,sources=(root.userData.welcomeVolumes??[]) as Volume[];
  const active=state.enabled&&sources.some(s=>s.power>.0001);
  gl.domElement.setAttribute('data-welcome-fog',JSON.stringify({active,matrixSources:active?sources.filter(s=>s.cell>=0&&s.power>.0001).length:0,depthOccluded:true,airGeometry:false,patternAtlas:!!root.userData.welcomeRainAtlas}));
  if(!active)return;
  gl.getDrawingBufferSize(r.size);const w=Math.ceil(r.size.x/2),h=Math.ceil(r.size.y/2);if(r.target.width!==w||r.target.height!==h){r.target.setSize(w,h);r.fog.setSize(w,h);}
  const u=r.material.uniforms;u.inverseProjection.value.copy(camera.projectionMatrixInverse);u.cameraWorld.value.copy(camera.matrixWorld);u.eye.value.copy(camera.position);u.gain.value=.4+state.strength*1.6;u.rainAtlas.value=root.userData.welcomeRainAtlas;u.inverseRoot.value.copy(root.matrixWorld).invert();u.time.value=performance.now()/1000;
  sources.forEach((s,i)=>{u.origins.value[i].set(...s.origin.toArray(),s.power);const direction=s.target.clone().sub(s.origin).normalize();u.directions.value[i].set(...direction.toArray(),Math.tan(s.angle));u.ranges.value[i]=s.range;u.cells.value[i]=s.cell;});
  const override=scene.overrideMaterial,background=scene.background,autoClear=gl.autoClear;
  const transparent:Array<{mesh:Mesh;visible:boolean}>=[];scene.traverse(o=>{if(o instanceof Mesh&&(Array.isArray(o.material)?o.material:[o.material]).every(m=>m.transparent)){transparent.push({mesh:o,visible:o.visible});o.visible=false;}});
  try{scene.background=null;scene.overrideMaterial=r.depth;gl.setRenderTarget(r.target);gl.clear();gl.autoClear=false;gl.render(scene,camera);gl.setRenderTarget(r.fog);gl.clear();r.quad.render(gl);gl.setRenderTarget(null);r.compositeQuad.render(gl);}
  finally{scene.overrideMaterial=override;scene.background=background;gl.autoClear=autoClear;transparent.forEach(o=>{o.mesh.visible=o.visible;});gl.setRenderTarget(null);}
 },1.8);
 return null;
}
