import {useEffect,useMemo} from 'react';
import {useFrame} from '@react-three/fiber';
import {AdditiveBlending,Color,Group,HalfFloatType,Mesh,MeshDepthMaterial,ShaderMaterial,Vector2,WebGLRenderTarget} from 'three';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';

/** Depth-occluded, emitter-only bloom. Original indicators never enter the mask. */
export function WelcomeBloom({model}:{model:Group}){
 const resources=useMemo(()=>{
  const target=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:true}),depth=new MeshDepthMaterial();depth.colorWrite=false;
  const material=new ShaderMaterial({transparent:true,blending:AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{image:{value:target.texture},pixel:{value:new Vector2()}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`varying vec2 vUv;uniform sampler2D image;uniform vec2 pixel;
void main(){vec3 c=vec3(0.);for(int i=0;i<12;i++){float a=float(i)*.523599;vec2 d=vec2(cos(a),sin(a));c+=max(vec3(0.),texture2D(image,vUv+d*pixel*2.).rgb-.65)*.045;c+=max(vec3(0.),texture2D(image,vUv+d*pixel*5.).rgb-.65)*.018;}gl_FragColor=vec4(c*.18,1.);}`});
  return {target,depth,material,quad:new FullScreenQuad(material),size:new Vector2()};
 },[]);
 useEffect(()=>()=>{resources.target.dispose();resources.depth.dispose();resources.material.dispose();resources.quad.dispose();},[resources]);
 useFrame(({gl,scene,camera})=>{
  if(!model.getObjectByName('SU7_ROOT')?.userData.welcomeBloom)return;
  const {target,depth,material,quad,size}=resources;gl.getDrawingBufferSize(size);const w=Math.ceil(size.x/2),h=Math.ceil(size.y/2);if(target.width!==w||target.height!==h)target.setSize(w,h);material.uniforms.pixel.value.set(1/w,1/h);
  const background=scene.background,override=scene.overrideMaterial,autoClear=gl.autoClear,clearColor=gl.getClearColor(new Color()).clone(),clearAlpha=gl.getClearAlpha();
  const meshes:Array<{mesh:Mesh;visible:boolean;emitter:boolean;transparent:boolean}>=[];
  scene.traverse(o=>{if(o instanceof Mesh)meshes.push({mesh:o,visible:o.visible,emitter:o.userData.welcomeEmitter===true,transparent:(Array.isArray(o.material)?o.material:[o.material]).every(m=>m.transparent)});});
  try{
   scene.background=null;gl.setRenderTarget(target);gl.setClearColor('#000',0);gl.clear();gl.autoClear=false;
   // First capture opaque occlusion. Glass remains transmissive, as in the main scene.
   meshes.forEach(o=>{o.mesh.visible=o.visible&&!o.emitter&&!o.transparent;});scene.overrideMaterial=depth;gl.render(scene,camera);
   meshes.forEach(o=>{o.mesh.visible=o.visible&&o.emitter;});scene.overrideMaterial=null;gl.render(scene,camera);
   gl.setRenderTarget(null);quad.render(gl);
  }finally{meshes.forEach(o=>{o.mesh.visible=o.visible;});scene.background=background;scene.overrideMaterial=override;gl.autoClear=autoClear;gl.setClearColor(clearColor,clearAlpha);gl.setRenderTarget(null);}
 },2);
 return null;
}
