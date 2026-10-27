import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Box3,Color,DepthTexture,Group,HalfFloatType,Matrix4,Mesh,MeshStandardMaterial,ShaderMaterial,Vector2,Vector3,WebGLRenderTarget,type PointLight,type SpotLight} from 'three';
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
uniform float headlightsOn;
uniform vec3 signalOrigins[6];
uniform vec3 signalDirections[6];
uniform float signalPowers[6];
uniform vec3 cabinOrigins[8];
uniform float cabinPowers[8];
uniform vec3 cabinColor;
uniform vec3 tailOrigins[32];
uniform int tailCount;
uniform vec3 tailMin;
uniform vec3 tailMax;
uniform vec3 domeOrigins[2];
uniform vec3 domeDirections[2];
uniform float domePowers[2];
uniform vec3 boundsMin;
uniform vec3 boundsMax;
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
float signalField(vec3 p,vec3 origin,vec3 direction){
  vec3 q=p-origin;float along=dot(q,direction);
  float radial=length(q-direction*along)/(.07+max(along,0.)*.45);
  return (1.-smoothstep(.35,1.,radial))*smoothstep(0.,.08,along)
    *(1.-smoothstep(.65,1.3,along))/(1.+along*along*2.);
}
float domeField(vec3 p,vec3 origin,vec3 direction){
  vec3 q=p-origin;float along=dot(q,direction);
  float distance=length(q),radius=.075+max(along,0.)*2.0;
  float side=length(q-direction*along)/radius;
  return smoothstep(-.02,.10,along)*(1.-smoothstep(.15,1.,side))
    *(1.-smoothstep(.75,1.55,distance))/(1.+distance*distance*2.);
}
void main(){
  vec3 base=texture2D(tScene,vUv).rgb;
  float depth=texture2D(tDepth,vUv).x;
  vec4 end=cameraWorld*inverseProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);end/=end.w;
  vec3 localEnd=(rootInverse*end).xyz;
  vec3 ray=normalize(localEnd-eye);
  float stop=min(length(localEnd-eye),22.);
  vec3 a=(boundsMin-eye)/(ray+vec3(.000001));
  vec3 b=(boundsMax-eye)/(ray+vec3(.000001));
  vec3 lo=min(a,b),hi=max(a,b);
  float begin=max(0.,max(lo.x,max(lo.y,lo.z)));
  stop=min(stop,min(hi.x,min(hi.y,hi.z)));
  vec3 scatter=vec3(0.);
  if(stop>begin){
    float stepLength=(stop-begin)/96.;
    float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
    for(int i=0;i<96;i++){
      float t=begin+(float(i)+jitter)*stepLength;vec3 p=eye+ray*t;
      vec3 light=vec3(0.);
      if(headlightsOn>.5)light+=vec3(.72,.86,1.)*(field(p,lamps[0],ray)+field(p,lamps[1],ray))*mix(.65,1.15,highBeam);
      for(int j=0;j<6;j++)if(signalPowers[j]>.0)
        light+=vec3(1.,.63,.0)*signalPowers[j]*signalField(p,signalOrigins[j],signalDirections[j])*1.4;
      if(all(greaterThan(p,tailMin))&&all(lessThan(p,tailMax))){
        float red=0.;
        for(int j=0;j<32;j++){if(j>=tailCount)break;
          float d=length((p-tailOrigins[j])/vec3(.14,.075,.18));
          red=max(red,1.-smoothstep(.05,1.,d));
        }
        light+=vec3(1.,.007,.013)*red*.8;
      }
      for(int j=0;j<2;j++)if(domePowers[j]>.0)
        light+=vec3(1.,.89,.70)*domePowers[j]*domeField(p,domeOrigins[j],domeDirections[j])*.22;
      // Only localized cabin air around the concealed lights, not a fog overlay.
      if(abs(p.x)<.79&&p.y>.32&&p.y<1.32&&p.z>-.9&&p.z<1.25){
        for(int j=0;j<8;j++)if(cabinPowers[j]>.0){
          float d=length(p-cabinOrigins[j]);
          light+=cabinColor*cabinPowers[j]*(1.-smoothstep(.03,.48,d))*.22;
        }
      }
      scatter+=light*density*stepLength*exp(-density*t*.12);
    }
  }
  // Three's solid scene background bypasses tone mapping in the direct path.
  // Preserve that rule here too, so blinking never darkens the whole sky.
  gl_FragColor=vec4((depth>=1.?vec3(0.):base)+scatter,1.);
  #include <tonemapping_fragment>
  if(depth>=1.)gl_FragColor.rgb+=base;
  #include <colorspace_fragment>
}`;

export function VolumetricLights({model}:{model:Group}){
  const tick=useRef(0);
  const resources=useMemo(()=>{
    const target=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:true,samples:4});
    target.depthTexture=new DepthTexture(1,1);
    const root=model.getObjectByName('SU7_ROOT')!;model.updateWorldMatrix(true,true);
    const inverse=new Matrix4().copy(root.matrixWorld).invert();
    const sources:Array<{mesh:Mesh;center:Vector3;direction:Vector3;side:'left'|'right';rear:boolean}>=[];
    model.traverse(object=>{
      if(!(object instanceof Mesh))return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(let slot=0;slot<materials.length;slot++){
        const material=materials[slot];if(!(material instanceof MeshStandardMaterial)||!/^TURN_(LEFT|RIGHT).*AMBER$/.test(material.name))continue;
        const geometry=object.geometry,position=geometry.getAttribute('position'),index=geometry.index,box=new Box3();
        const groups=geometry.groups.length?geometry.groups.filter((g:{materialIndex?:number})=>g.materialIndex===slot):[{start:0,count:index?.count??position.count}];
        for(const group of groups)for(let i=group.start;i<group.start+group.count;i++)box.expandByPoint(new Vector3().fromBufferAttribute(position,index?index.getX(i):i));
        if(box.isEmpty())continue;
        const center=box.getCenter(new Vector3()),local=center.clone().applyMatrix4(object.matrixWorld).applyMatrix4(inverse),rear=local.z>0,side=material.name.includes('LEFT')?'left':'right';
        const direction=new Vector3(side==='left'?-.18:.18,0,rear?1:-1).normalize().transformDirection(root.matrixWorld).transformDirection(object.matrixWorld.clone().invert());
        sources.push({mesh:object,center,direction,side,rear});
      }
    });
    const vectors=(count:number)=>Array.from({length:count},()=>new Vector3());
    const material=new ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{tScene:{value:target.texture},tDepth:{value:target.depthTexture},inverseProjection:{value:new Matrix4()},cameraWorld:{value:new Matrix4()},rootInverse:{value:new Matrix4()},eye:{value:new Vector3()},lamps:{value:Object.values(mapping.materialRoles.headlights).map(c=>new Vector3().fromArray(c.lightPosition).add(new Vector3(0,0,-.025)))},density:{value:.15},highBeam:{value:0},headlightsOn:{value:0},signalOrigins:{value:vectors(6)},signalDirections:{value:vectors(6)},signalPowers:{value:Array(6).fill(0)},cabinOrigins:{value:vectors(8)},cabinPowers:{value:Array(8).fill(0)},cabinColor:{value:new Color()},boundsMin:{value:new Vector3()},boundsMax:{value:new Vector3()}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader});
    Object.assign(material.uniforms,{tailOrigins:{value:vectors(32)},tailCount:{value:mapping.materialRoles.tailRunning.samples.length},tailMin:{value:new Vector3()},tailMax:{value:new Vector3()},domeOrigins:{value:vectors(2)},domeDirections:{value:vectors(2)},domePowers:{value:[0,0]}});
    const tailSources=mapping.materialRoles.tailRunning.samples.map(s=>({node:model.getObjectByName(s.node)!,position:new Vector3().fromArray(s.position)}));
    return {target,material,quad:new FullScreenQuad(material),size:new Vector2(),sources,tailSources,tailBounds:new Box3()};
  },[model]);
  useEffect(()=>()=>{resources.target.dispose();resources.target.depthTexture?.dispose();resources.material.dispose();resources.quad.dispose();},[resources]);
  useFrame(({gl,scene,camera},delta)=>{
    const {hazeEnabled,haze}=useScene.getState(),state=useVehicle.getState().state,mode=state.lights.headlights;
    const root=model.getObjectByName('SU7_ROOT')!;
    const signals=(root.userData.turnSignalPulse??{left:false,right:false}) as {left:boolean;right:boolean};
    const cabin=root.userData.ambientScatter as {power:number;color:Color;lights:PointLight[]}|undefined;
    const domeLights=(root.userData.domeLights??[]) as SpotLight[];
    // Startup running lamp stays red independently of front lights / indicators.
    const active=hazeEnabled&&haze>0;
    if(active){
      const {target,material,quad,size}=resources;gl.getDrawingBufferSize(size);
      if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
      root.updateWorldMatrix(true,true);camera.updateMatrixWorld();
      material.uniforms.rootInverse.value.copy(root.matrixWorld).invert();
      material.uniforms.cameraWorld.value.copy(camera.matrixWorld);
      material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      material.uniforms.eye.value.copy(camera.position).applyMatrix4(material.uniforms.rootInverse.value);
      material.uniforms.density.value=haze*.45;material.uniforms.highBeam.value=mode==='high'?1:0;
      const u=material.uniforms;u.headlightsOn.value=mode==='off'?0:1;
      u.boundsMin.value.set(-5,0,mode==='off'?-4.5:-15);u.boundsMax.value.set(5,3,5);
      resources.sources.forEach((source,i)=>{
        u.signalOrigins.value[i].copy(source.center).applyMatrix4(source.mesh.matrixWorld).applyMatrix4(u.rootInverse.value);
        u.signalDirections.value[i].copy(source.direction).transformDirection(source.mesh.matrixWorld).transformDirection(u.rootInverse.value);
        u.signalPowers.value[i]=signals[source.side]?1:0;
      });
      if(cabin){u.cabinColor.value.copy(cabin.color);cabin.lights.forEach((light,i)=>{light.getWorldPosition(u.cabinOrigins.value[i]).applyMatrix4(u.rootInverse.value);u.cabinPowers.value[i]=light.intensity;});}
      resources.tailBounds.makeEmpty();resources.tailSources.forEach((s,i)=>{const point=u.tailOrigins.value[i].copy(s.position).applyMatrix4(s.node.matrixWorld).applyMatrix4(u.rootInverse.value);resources.tailBounds.expandByPoint(point);});resources.tailBounds.expandByVector(new Vector3(.14,.075,.18));u.tailMin.value.copy(resources.tailBounds.min);u.tailMax.value.copy(resources.tailBounds.max);
      domeLights.forEach((light,i)=>{light.getWorldPosition(u.domeOrigins.value[i]).applyMatrix4(u.rootInverse.value);light.target.getWorldPosition(u.domeDirections.value[i]).applyMatrix4(u.rootInverse.value).sub(u.domeOrigins.value[i]).normalize();u.domePowers.value[i]=light.intensity/12;});
      gl.setRenderTarget(target);gl.render(scene,camera);gl.setRenderTarget(null);quad.render(gl);
    }else{gl.setRenderTarget(null);gl.render(scene,camera);}
    tick.current+=delta;if(tick.current>.10){tick.current=0;gl.domElement.setAttribute('data-volume',JSON.stringify({enabled:hazeEnabled,active,density:haze,mode,signals,cabinPower:cabin?.power??0,tailRunning:true,tailSamples:resources.tailSources.length,domePowers:domeLights.map(l=>active?l.intensity/12:0),signalSources:resources.sources.map((s,i)=>({side:s.side,rear:s.rear,position:resources.material.uniforms.signalOrigins.value[i].toArray(),power:active&&signals[s.side]?1:0})),sceneDepthOcclusion:true,samples:96,visibleConeGeometry:false}));}
  },1);
  return null;
}
