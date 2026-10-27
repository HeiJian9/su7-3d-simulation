import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {DepthTexture,Group,HalfFloatType,Matrix4,ShaderMaterial,Vector2,Vector3,WebGLRenderTarget} from 'three';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {useScene} from './store';
import {useVehicle} from './vehicle';
import mapping from './data/vehicle-mapping.json';

// Integrate scattering only between the camera and the actual scene depth.
// This is a volume integral through soft cones, with no visible cone mesh.
const fragmentShader=`
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform mat4 rootInverse;
uniform vec3 eye;
uniform vec3 lamps[2];
uniform float density;
uniform float highBeam;
varying vec2 vUv;
float field(vec3 p,vec3 lamp,vec3 ray){
  vec3 direction=normalize(vec3(lamp.x,.025,mix(-5.3,-14.,highBeam))-lamp);
  vec3 q=p-lamp;float along=dot(q,direction);
  float radius=.09+max(along,0.)*mix(.30,.19,highBeam);
  float radial=length(q-direction*along)/radius;
  float edge=1.-smoothstep(.62,1.,radial);
  float ends=smoothstep(0.,.2,along)*(1.-smoothstep(mix(5.,10.,highBeam),mix(7.,12.,highBeam),along));
  float phase=.35+1.4*pow(max(dot(direction,-ray),0.),5.);
  return edge*ends*phase*smoothstep(.0,.06,p.y)/(1.+along*along*.12);
}
void main(){
  vec3 base=texture2D(tScene,vUv).rgb;
  float depth=texture2D(tDepth,vUv).x;
  vec4 end=cameraWorld*inverseProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);end/=end.w;
  vec3 localEnd=(rootInverse*end).xyz;
  vec3 ray=normalize(localEnd-eye);
  float stop=min(length(localEnd-eye),22.);
  // Restrict work to the air in front of this car; no cabin-wide mist overlay.
  vec3 a=(vec3(-5.,.0,-15.)-eye)/(ray+vec3(.000001));
  vec3 b=(vec3(5.,3.,-2.12)-eye)/(ray+vec3(.000001));
  vec3 lo=min(a,b),hi=max(a,b);
  float begin=max(0.,max(lo.x,max(lo.y,lo.z)));
  stop=min(stop,min(hi.x,min(hi.y,hi.z)));
  vec3 scatter=vec3(0.);
  if(stop>begin){
    float stepLength=(stop-begin)/64.;
    float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
    for(int i=0;i<64;i++){
      float t=begin+(float(i)+jitter)*stepLength;vec3 p=eye+ray*t;
      float light=field(p,lamps[0],ray)+field(p,lamps[1],ray);
      scatter+=vec3(.72,.86,1.)*light*density*mix(.65,1.15,highBeam)*stepLength*exp(-density*t*.12);
    }
  }
  gl_FragColor=vec4(base+scatter,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function VolumetricLights({model}:{model:Group}){
  const tick=useRef(0);
  const resources=useMemo(()=>{
    const target=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:true,samples:4});
    target.depthTexture=new DepthTexture(1,1);
    const material=new ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{tScene:{value:target.texture},tDepth:{value:target.depthTexture},inverseProjection:{value:new Matrix4()},cameraWorld:{value:new Matrix4()},rootInverse:{value:new Matrix4()},eye:{value:new Vector3()},lamps:{value:Object.values(mapping.materialRoles.headlights).map(c=>new Vector3().fromArray(c.lightPosition).add(new Vector3(0,0,-.025)))},density:{value:.15},highBeam:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader});
    return {target,material,quad:new FullScreenQuad(material),size:new Vector2()};
  },[]);
  useEffect(()=>()=>{resources.target.dispose();resources.target.depthTexture?.dispose();resources.material.dispose();resources.quad.dispose();},[resources]);
  useFrame(({gl,scene,camera},delta)=>{
    const {hazeEnabled,haze}=useScene.getState(),mode=useVehicle.getState().state.lights.headlights;
    const active=hazeEnabled&&haze>0&&mode!=='off';
    if(active){
      const {target,material,quad,size}=resources;gl.getDrawingBufferSize(size);
      if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
      const root=model.getObjectByName('SU7_ROOT')!;root.updateWorldMatrix(true,false);camera.updateMatrixWorld();
      material.uniforms.rootInverse.value.copy(root.matrixWorld).invert();
      material.uniforms.cameraWorld.value.copy(camera.matrixWorld);
      material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      material.uniforms.eye.value.copy(camera.position).applyMatrix4(material.uniforms.rootInverse.value);
      material.uniforms.density.value=haze*.45;material.uniforms.highBeam.value=mode==='high'?1:0;
      gl.setRenderTarget(target);gl.render(scene,camera);gl.setRenderTarget(null);quad.render(gl);
    }else{gl.setRenderTarget(null);gl.render(scene,camera);}
    tick.current+=delta;if(tick.current>.15){tick.current=0;gl.domElement.setAttribute('data-volume',JSON.stringify({enabled:hazeEnabled,active,density:haze,mode,sceneDepthOcclusion:true,samples:64,visibleConeGeometry:false}));}
  },1);
  return null;
}
