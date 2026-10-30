import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {AdditiveBlending,CanvasTexture,CylinderGeometry,Group,InstancedBufferAttribute,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,MeshDepthMaterial,MeshStandardMaterial,PlaneGeometry,Quaternion,Scene,SpotLight,TorusGeometry,Vector3} from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import lenses from './data/welcome-lenses.json';
import mapping from './data/vehicle-mapping.json';
import {meteorPower,welcomeDurationMs} from '../../../packages/shared/src/welcome';
import {corners} from '../../../packages/shared/src/vehicle';
import {useWelcome} from './welcome';
import {actualValues,useVehicle} from './vehicle';

function logoTexture(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d')!;
 c.fillStyle='#000';c.fillRect(0,0,512,512);c.fillStyle='#fff';c.textAlign='center';
 c.font='italic bold 146px Bahnschrift, sans-serif';c.fillText('SU7',256,270);
 c.fillRect(122,303,268,3);c.font='24px Bahnschrift, sans-serif';c.fillText('X I A O M I',256,348);
 const texture=new CanvasTexture(canvas);texture.anisotropy=4;return texture;
}
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
  const projectionScene=new Scene(),depth=new MeshDepthMaterial();depth.colorWrite=false;
  const occluderMaterial=new MeshBasicMaterial({colorWrite:false,depthWrite:false}),occluders:Array<{source:Mesh;mesh:Mesh}>=[];
  model.traverse(o=>{if(o instanceof Mesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>!m.transparent)){
   const mesh=new Mesh(o.geometry,occluderMaterial);mesh.matrixAutoUpdate=false;mesh.castShadow=true;projectionScene.add(mesh);occluders.push({source:o,mesh});
  }});
  const groundGeometry=new PlaneGeometry(160,160),groundMaterial=new MeshStandardMaterial({color:'#fff',roughness:1,metalness:0,blending:AdditiveBlending,depthWrite:false});
  const ground=new Mesh(groundGeometry,groundMaterial);ground.rotation.x=-Math.PI/2;ground.position.y=-.0145;ground.receiveShadow=true;projectionScene.add(ground);
  const logo=logoTexture(),housingGeometry=new CylinderGeometry(.009,.009,.007,16),housingMaterial=new MeshStandardMaterial({color:'#151b21',metalness:.7,roughness:.4});
  const projectors=corners.map(corner=>{
   const cfg=mapping.doors[corner],door=model.getObjectByName(cfg.node)!,side=corner.endsWith('l')?-1:1;
   const source=new Vector3(...lenses.doorSources[corner]).sub(new Vector3(...cfg.hinge));
   const light=new SpotLight('#edf6ff',0,1.4,.70,.12,2);light.name=`WELCOME_LOGO_${corner}`;light.position.copy(source);light.target.position.copy(source).add(new Vector3(side*.14,-.45,0));
   light.map=logo;light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.camera.near=.015;light.shadow.camera.up.set(0,0,1);light.shadow.bias=-.00002;light.shadow.normalBias=.0005;
   const housing=new Mesh(housingGeometry,housingMaterial);housing.name=`WELCOME_PROJECTOR_${corner}`;housing.position.copy(source).add(new Vector3(0,.004,0));
   const target=source.clone().add(new Vector3(side*.14,-.45,0));
   projectionScene.add(light,light.target);return {corner,door,light,housing,source,target,side,power:0};
  });
  return {root,group,matrices,projectors,logo,housingGeometry,housingMaterial,projectionScene,depth,occluders,occluderMaterial,groundGeometry,groundMaterial};
 },[model]);
 useEffect(()=>{
  fixtures.root.add(fixtures.group);for(const p of fixtures.projectors)p.door.add(p.housing);
  return()=>{
  fixtures.group.removeFromParent();for(const m of fixtures.matrices){m.geometry.dispose();m.material.dispose();m.ringGeometry.dispose();m.ringMaterial.dispose();}
  for(const p of fixtures.projectors){p.light.removeFromParent();p.light.target.removeFromParent();p.housing.removeFromParent();p.light.dispose();}
  fixtures.logo.dispose();fixtures.housingGeometry.dispose();fixtures.housingMaterial.dispose();
  fixtures.depth.dispose();fixtures.occluderMaterial.dispose();fixtures.groundGeometry.dispose();fixtures.groundMaterial.dispose();
 };},[fixtures]);
 useFrame((_,delta)=>{
  const welcome=useWelcome.getState(),event=welcome.snapshot?.event,elapsed=event?Date.now()+welcome.offset-event.startedAt:Infinity;
  const active=elapsed>=0&&elapsed<welcomeDurationMs,mode=useVehicle.getState().state.lights.headlights,brightness=useVehicle.getState().state.lights.brightness;
  const powers:number[][]=[];
  for(const m of fixtures.matrices){const a:number[]=[];for(let row=0;row<3;row++)for(let col=0;col<4;col++){
   const normal=mode==='off'||m.cfg.module>=2&&mode!=='high'?0:(mode==='high'?.30:.16)*brightness;
   const t=Math.max(0,Math.min(1,(elapsed-3800)/1000)),restore=t*t*(3-2*t);
   const p=active?meteorPower(elapsed,m.cfg.module,col,row)+normal*restore:normal;m.power.setX(row*4+col,p);a.push(p);
  }m.power.needsUpdate=true;powers.push(a);}
  fixtures.root.userData.welcomeBloom=active;
  const projections=fixtures.projectors.map(p=>{
   const open=Number(actualValues[`door:${p.corner}:openness`]??0),t=Math.max(0,Math.min(1,(open-.04)/.26)),target=t*t*(3-2*t);
   p.power+=(target-p.power)*(1-Math.exp(-Math.min(delta,.1)/.12));if(p.power<.0001)p.power=0;p.light.intensity=10*p.power;
   p.door.updateWorldMatrix(true,false);p.light.position.copy(p.source).applyMatrix4(p.door.matrixWorld);p.light.target.position.copy(p.target).applyMatrix4(p.door.matrixWorld);p.light.shadow.camera.up.set(-p.side,0,0).transformDirection(p.door.matrixWorld);p.light.updateMatrixWorld();p.light.target.updateMatrixWorld();
   const from=p.light.getWorldPosition(new Vector3()),toward=p.light.target.getWorldPosition(new Vector3()).sub(from),hit=from.clone().addScaledVector(toward,(-.015-from.y)/toward.y);
   return {corner:p.corner,power:p.power,source:from.toArray(),ground:hit.toArray(),ndc:hit.clone().project(_.camera).toArray(),parent:p.door.name,gobo:!!p.light.map,castsShadow:p.light.castShadow};
  });
  tick.current+=delta;if(tick.current>.05){tick.current=0;gl.domElement.setAttribute('data-welcome',JSON.stringify({active,eventId:event?.id,elapsedMs:active?elapsed:null,durationMs:welcomeDurationMs,units:fixtures.matrices.reduce((n,m)=>n+m.mesh.count,0),powers,normalMode:mode,projections,originalGeometry:true}));}
 },.5);
 useFrame(({gl,scene,camera})=>{
  if(!fixtures.projectors.some(p=>p.power>.0001))return;
  for(const o of fixtures.occluders){o.mesh.matrix.copy(o.source.matrixWorld);o.mesh.visible=o.source.visible;if(o.mesh.morphTargetInfluences&&o.source.morphTargetInfluences)o.mesh.morphTargetInfluences=[...o.source.morphTargetInfluences];}
  const override=scene.overrideMaterial,background=scene.background,autoClear=gl.autoClear;
  const transparent:Array<{mesh:Mesh;visible:boolean}>=[];scene.traverse(o=>{if(o instanceof Mesh&&(Array.isArray(o.material)?o.material:[o.material]).every(m=>m.transparent)){transparent.push({mesh:o,visible:o.visible});o.visible=false;}});
  try{
   gl.autoClear=false;gl.setRenderTarget(null);gl.clearDepth();scene.background=null;scene.overrideMaterial=fixtures.depth;gl.render(scene,camera);
   scene.overrideMaterial=override;scene.background=background;transparent.forEach(o=>{o.mesh.visible=o.visible;});
   gl.render(fixtures.projectionScene,camera);
  }finally{scene.overrideMaterial=override;scene.background=background;gl.autoClear=autoClear;transparent.forEach(o=>{o.mesh.visible=o.visible;});}
 },1.5);
 return null;
}
