import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {AdditiveBlending,CircleGeometry,CylinderGeometry,DoubleSide,Group,InstancedBufferAttribute,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,MeshDepthMaterial,MeshStandardMaterial,PlaneGeometry,Quaternion,Scene,SpotLight,TorusGeometry,Vector3} from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import lenses from './data/welcome-lenses.json';
import mapping from './data/vehicle-mapping.json';
import {meteorPower,welcomeDurationMs,welcomePlayback} from '../../../packages/shared/src/welcome';
import {corners} from '../../../packages/shared/src/vehicle';
import {useWelcome} from './welcome';
import {actualValues,useVehicle} from './vehicle';
import {createWelcomeGobos,miTexture,rainSample,rainLayout} from './welcomeOptics';
/** New fixtures only. Original headlamps, indicators and door mechanisms are never replaced. */
export function WelcomeLights({model}:{model:Group}){
 const {gl}=useThree(),tick=useRef(0);
 const fixtures=useMemo(()=>{
  const root=model.getObjectByName('SU7_ROOT')!,group=new Group();group.name='WELCOME_MATRIX_ROOT';
  const matrices=lenses.lenses.map(cfg=>{
   const center=new Vector3(...cfg.center),n=new Vector3(...cfg.normal),u=new Vector3(...cfg.u),v=new Vector3(...cfg.v);
   const frame=new Matrix4().makeBasis(u,v,n),rotation=new Quaternion().setFromRotationMatrix(frame);
   const geometry=new RoundedBoxGeometry(.0054,.0047,.002,2,.0005),power=new InstancedBufferAttribute(new Float32Array(12),1);geometry.setAttribute('welcomePower',power);
   const material=new MeshStandardMaterial({color:'#12212a',emissive:'#d9efff',emissiveIntensity:16,metalness:.25,roughness:.24});
   material.name=`WELCOME_${cfg.side}_${cfg.module}`;
   material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float welcomePower; varying float vWelcomePower;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWelcomePower=welcomePower;');
    shader.fragmentShader='varying float vWelcomePower;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=vWelcomePower;');
   };material.customProgramCacheKey=()=> 'welcome-led-matrix-v1';
   const mesh=new InstancedMesh(geometry,material,12);mesh.name=material.name;mesh.userData.welcomeEmitter=true;
   for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const p=center.clone().addScaledVector(u,(col-1.5)*.007).addScaledVector(v,(row-1)*.0065).addScaledVector(n,.0015);
    mesh.setMatrixAt(row*4+col,new Matrix4().compose(p,rotation,new Vector3(1,1,1)));
   }
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
   const ringGeometry=new TorusGeometry(1,.045,6,40),ringMaterial=new MeshStandardMaterial({color:'#6a7d89',metalness:.8,roughness:.25});
   const ring=new Mesh(ringGeometry,ringMaterial);ring.name=`WELCOME_COLLIMATOR_${cfg.side}_${cfg.module}`;ring.position.copy(center).addScaledVector(n,.0004);ring.quaternion.copy(rotation);ring.scale.set(.018,.014,.004);group.add(ring);
   return {cfg,mesh,power,material,geometry,ringGeometry,ringMaterial};
  });
  // Four gobo maps plus the cabin's shadow maps exceed a common 16-sampler
  // limit. Isolate their real lighting/shadows, keeping the main scene intact.
  const projectionScene=new Scene(),depth=new MeshDepthMaterial({side:DoubleSide});depth.colorWrite=false;
  const occluderMaterial=new MeshBasicMaterial({colorWrite:false,depthWrite:false,side:DoubleSide}),occluders:Array<{source:Mesh;mesh:Mesh}>=[];
  model.traverse(o=>{if(o instanceof Mesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>!m.transparent)){
   const mesh=new Mesh(o.geometry,occluderMaterial);mesh.matrixAutoUpdate=false;mesh.castShadow=true;projectionScene.add(mesh);occluders.push({source:o,mesh});
  }});
  const groundGeometry=new PlaneGeometry(160,160),groundMaterial=new MeshStandardMaterial({color:'#fff',roughness:1,metalness:0,blending:AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4});
  const ground=new Mesh(groundGeometry,groundMaterial);ground.rotation.x=-Math.PI/2;ground.position.y=-.0145;ground.receiveShadow=true;projectionScene.add(ground);
  const logo=miTexture(),gobos=createWelcomeGobos(logo),housingGeometry=new CylinderGeometry(.010,.010,.007,16),housingMaterial=new MeshStandardMaterial({color:'#37444c',metalness:.7,roughness:.4}),lensGeometry=new CircleGeometry(.007,24);
  const projectors=corners.map((corner,index)=>{
   const cfg=mapping.doors[corner],door=model.getObjectByName(cfg.node)!,side=corner.endsWith('l')?-1:1;
   const source=new Vector3(...lenses.doorSources[corner]).sub(new Vector3(...cfg.hinge));
   const light=new SpotLight('#eef2f1',0,1.4,.70,.12,2);light.name=`WELCOME_LOGO_${corner}`;light.position.copy(source);light.target.position.copy(source).add(new Vector3(side*.14,-.45,0));
   light.map=gobos.targets[index].texture;light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.camera.near=.015;light.shadow.camera.up.set(0,0,1);light.shadow.bias=-.00002;light.shadow.normalBias=.0005;
   const housing=new Mesh(housingGeometry,housingMaterial);housing.name=`WELCOME_PROJECTOR_${corner}`;housing.position.copy(source).add(new Vector3(0,.004,0));
   const faceMaterial=new MeshStandardMaterial({color:'#c4e9ff',emissive:'#d5eeff',emissiveIntensity:0,side:DoubleSide,roughness:.25}),face=new Mesh(lensGeometry,faceMaterial);face.name=`WELCOME_PROJECTOR_LENS_${corner}`;face.position.copy(source);face.userData.welcomeEmitter=true;
   projectionScene.add(light,light.target);return {corner,door,light,housing,face,faceMaterial,source,side,power:0,center:new Vector3()};
  });
  const road=Object.entries(mapping.materialRoles.headlights).map(([side,cfg],i)=>{
   const light=new SpotLight('#d7ebff',0,18,.7,.15,2);light.name=`WELCOME_ROAD_RAIN_${side}`;light.map=gobos.targets[4+i].texture;light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.camera.near=.02;light.shadow.bias=-.00003;
   projectionScene.add(light,light.target);return {light,source:new Vector3(...cfg.lightPosition).add(new Vector3(0,0,-.025)),side:side==='left'?-1:1};
  });
  return {root,group,matrices,projectors,road,gobos,logo,lensGeometry,housingGeometry,housingMaterial,projectionScene,depth,occluders,occluderMaterial,groundGeometry,groundMaterial,elapsed:0,active:false};
 },[model]);
 useEffect(()=>{
  useVehicle.getState().registerCapabilities('welcome-logo',['welcomeLogo:doors']);
  fixtures.root.add(fixtures.group);for(const p of fixtures.projectors)p.door.add(p.housing,p.face);
  return()=>{
  useVehicle.getState().registerCapabilities('welcome-logo',[]);delete actualValues['welcomeLogo:doors:enabled'];delete actualValues['welcomeLogo:doors:brightness'];
  fixtures.group.removeFromParent();delete fixtures.root.userData.welcomeVolumes;delete fixtures.root.userData.welcomeBloom;delete fixtures.root.userData.welcomeRainAtlas;for(const m of fixtures.matrices){m.geometry.dispose();m.material.dispose();m.ringGeometry.dispose();m.ringMaterial.dispose();}
  for(const p of fixtures.projectors){p.light.removeFromParent();p.light.target.removeFromParent();p.housing.removeFromParent();p.face.removeFromParent();p.faceMaterial.dispose();p.light.dispose();}
  fixtures.road.forEach(p=>p.light.dispose());fixtures.gobos.dispose();fixtures.lensGeometry.dispose();
  fixtures.logo.dispose();fixtures.housingGeometry.dispose();fixtures.housingMaterial.dispose();
  fixtures.depth.dispose();fixtures.occluderMaterial.dispose();fixtures.groundGeometry.dispose();fixtures.groundMaterial.dispose();
 };},[fixtures]);
 useFrame((_,delta)=>{
  const welcome=useWelcome.getState(),playback=welcomePlayback(welcome.snapshot,Date.now()+welcome.offset),elapsed=playback.elapsedMs;
  const rainBrightness=welcome.snapshot?.brightness??1;
  const logo=useVehicle.getState().state.welcomeLogo;
  const active=playback.active,mode=useVehicle.getState().state.lights.headlights,brightness=useVehicle.getState().state.lights.brightness;
  fixtures.elapsed=active?elapsed:0;fixtures.active=active;
  const powers:number[][]=[];
  for(const m of fixtures.matrices){const a:number[]=[];for(let row=0;row<3;row++)for(let col=0;col<4;col++){
   const normal=mode==='off'||m.cfg.module>=2&&mode!=='high'?0:(mode==='high'?.30:.16)*brightness;
   const t=Math.max(0,Math.min(1,(elapsed-3800)/1000)),restore=t*t*(3-2*t);
   const p=active?(meteorPower(playback.phaseMs,m.cfg.module,col,row)+.06*playback.envelope)*rainBrightness+normal*(playback.persistent?1:restore):normal;m.power.setX(row*4+col,p);a.push(p);
  }m.power.needsUpdate=true;powers.push(a);}
  const projections=fixtures.projectors.map(p=>{
   const open=Number(actualValues[`door:${p.corner}:openness`]??0),t=Math.max(0,Math.min(1,(open-.04)/.26)),target=t*t*(3-2*t);
   const output=logo.enabled?target*logo.brightness:0;
   p.power+=(output-p.power)*(1-Math.exp(-Math.min(delta,.1)/.12));if(p.power<.0001)p.power=0;p.light.intensity=10*p.power;
   p.door.updateWorldMatrix(true,false);p.light.position.copy(p.source).applyMatrix4(p.door.matrixWorld);
   p.center.set(p.side*(1.12+.015*open),0,(p.corner.startsWith('f')?-.25:.74)+.015*open);
   p.light.target.position.copy(p.center).applyMatrix4(fixtures.root.matrixWorld);p.light.target.position.y=-.0145;
   p.light.shadow.camera.up.set(-p.side,0,0).transformDirection(fixtures.root.matrixWorld);p.light.updateMatrixWorld();p.light.target.updateMatrixWorld();
   const direction=p.light.target.position.clone().sub(p.light.position).normalize(),localDirection=direction.clone().transformDirection(new Matrix4().copy(p.door.matrixWorld).invert());
   p.face.quaternion.setFromUnitVectors(new Vector3(0,0,1),localDirection);p.faceMaterial.emissiveIntensity=p.power*8;
   const from=p.light.getWorldPosition(new Vector3()),toward=p.light.target.getWorldPosition(new Vector3()).sub(from),hit=from.clone().addScaledVector(toward,(-.015-from.y)/toward.y);
   return {corner:p.corner,power:p.power,targetPower:output,source:from.toArray(),ground:hit.toArray(),entry:p.center.toArray(),ndc:hit.clone().project(_.camera).toArray(),parent:p.door.name,gobo:!!p.light.map,castsShadow:p.light.castShadow,mark:'mi',style:'light-stencil',whiteBadge:false,sourceEmission:p.faceMaterial.emissiveIntensity};
  });
  if(projections.every(p=>Math.abs(p.power-p.targetPower)<.0001)){
   actualValues['welcomeLogo:doors:enabled']=logo.enabled;actualValues['welcomeLogo:doors:brightness']=logo.brightness;
  }
  const envelope=playback.envelope*rainBrightness;
  fixtures.root.userData.welcomeBloom=active||fixtures.projectors.some(p=>p.power>.0001);
  fixtures.road.forEach(p=>{p.light.position.copy(p.source).applyMatrix4(fixtures.root.matrixWorld);p.light.target.position.set(p.side*.5,0,-8).applyMatrix4(fixtures.root.matrixWorld);p.light.target.position.y=-.0145;p.light.intensity=envelope*140;p.light.updateMatrixWorld();p.light.target.updateMatrixWorld();});
  const fogSources=fixtures.matrices.map((m,index)=>{
   const values=powers[index],cell=values.indexOf(Math.max(...values));
   const cellMatrix=new Matrix4();m.mesh.getMatrixAt(cell,cellMatrix);m.mesh.updateWorldMatrix(true,false);
   const origin=new Vector3().setFromMatrixPosition(cellMatrix).applyMatrix4(m.mesh.matrixWorld);
   const target=new Vector3(m.cfg.side==='left'?-.5:.5,0,-8).applyMatrix4(fixtures.root.matrixWorld);target.y=-.0145;
   return {origin,target,power:envelope*1.45,angle:.52,range:15,cell:(m.cfg.side==='left'?0:4)+m.cfg.module,unit:cell};
  });
  fixtures.root.userData.welcomeRainAtlas=fixtures.gobos.hazeAtlas.texture;
  fixtures.root.userData.welcomeVolumes=[...fixtures.projectors.map(p=>({origin:p.light.position.clone(),target:p.light.target.position.clone(),power:p.power*6,angle:.40,range:p.light.position.distanceTo(p.light.target.position)+.06,cell:-1})),...fogSources];
  const samples=[-1,1].flatMap(side=>[0,6,7,12,14,18,21,24,28,30,35,36].map(i=>{const p=rainSample(elapsed,i,side,playback.persistent),ground=new Vector3(p.x,-.0145,p.z).applyMatrix4(fixtures.root.matrixWorld);return {side,position:ground.toArray(),ndc:ground.clone().project(_.camera).toArray(),power:p.power};}));
  gl.domElement.setAttribute('data-welcome-rain',JSON.stringify({active,airParticles:0,medium:'volumetric-fog',matrixBeams:active?fogSources.length:0,groundProjectors:active?2:0,layout:rainLayout,samples:active?samples:[],origins:active?fogSources.map(s=>({origin:s.origin.toArray(),cell:s.cell,unit:s.unit})):[]}));
  tick.current+=delta;if(tick.current>.05){tick.current=0;gl.domElement.setAttribute('data-welcome',JSON.stringify({active,persistent:playback.persistent,brightness:rainBrightness,envelope,eventId:playback.eventId,elapsedMs:active?elapsed:null,durationMs:playback.persistent?null:welcomeDurationMs,units:fixtures.matrices.reduce((n,m)=>n+m.mesh.count,0),powers,normalMode:mode,projections,originalGeometry:true}));}
 },.5);
 useFrame(({gl,scene,camera})=>{
  if(!fixtures.active&&!fixtures.projectors.some(p=>p.power>.0001))return;
  for(const o of fixtures.occluders){o.mesh.matrix.copy(o.source.matrixWorld);o.mesh.visible=o.source.visible;if(o.mesh.morphTargetInfluences&&o.source.morphTargetInfluences)o.mesh.morphTargetInfluences=[...o.source.morphTargetInfluences];}
  const override=scene.overrideMaterial,background=scene.background,autoClear=gl.autoClear;
  const transparent:Array<{mesh:Mesh;visible:boolean}>=[];scene.traverse(o=>{if(o instanceof Mesh&&(Array.isArray(o.material)?o.material:[o.material]).every(m=>m.transparent)){transparent.push({mesh:o,visible:o.visible});o.visible=false;}});
  try{
   gl.autoClear=false;
   [...fixtures.projectors,...fixtures.road].forEach((p,i)=>{
    p.light.shadow.updateMatrices(p.light);const u=fixtures.gobos.material.uniforms;
    u.inverseLight.value.copy(p.light.shadow.camera.matrixWorld).multiply(p.light.shadow.camera.projectionMatrixInverse);u.rootInverse.value.copy(fixtures.root.matrixWorld).invert();u.origin.value.copy(p.light.position);u.mode.value=i<4?0:1;u.side.value=p.side;u.time.value=fixtures.elapsed/1000;
    u.center.value.copy(i<4?fixtures.projectors[i].center:new Vector3());
    gl.setRenderTarget(fixtures.gobos.targets[i]);gl.clear();fixtures.gobos.quad.render(gl);
   });
   fixtures.gobos.material.uniforms.mode.value=2;gl.setRenderTarget(fixtures.gobos.hazeAtlas);gl.clear();fixtures.gobos.quad.render(gl);
   gl.setRenderTarget(null);gl.clearDepth();scene.background=null;scene.overrideMaterial=fixtures.depth;gl.render(scene,camera);
   scene.overrideMaterial=override;scene.background=background;transparent.forEach(o=>{o.mesh.visible=o.visible;});
   gl.render(fixtures.projectionScene,camera);
  }finally{scene.overrideMaterial=override;scene.background=background;gl.autoClear=autoClear;transparent.forEach(o=>{o.mesh.visible=o.visible;});}
 },1.5);
 return null;
}
