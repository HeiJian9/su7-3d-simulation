import {useEffect,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Group,Matrix4,Mesh,MeshStandardMaterial,PointLight,SpotLight,Vector3,type Material} from 'three';
import mapping from './data/vehicle-mapping.json';
import {actualValues,completeExecutions,manualCommand,useVehicle} from './vehicle';
import {Hotspot} from './VehicleMechanism';
import {bindNativeAmbient} from './nativeAmbient';
import {groupedAmbientRoutes} from './ambientLighting';
type Binding={materials:Map<string,MeshStandardMaterial>;offColors:Map<string,string>;spots:SpotLight[];ambientLights:Array<PointLight|SpotLight>;protectedMaterials:Map<string,MeshStandardMaterial>;root:Group};
export function AppearanceMechanism({model}:{model:Group}){
  const {gl,camera}=useThree();const native=useRef<ReturnType<typeof bindNativeAmbient>|null>(null);const binding=useRef<Binding|null>(null),blink=useRef({mode:'off',time:0}),brightness=useRef(.4);const [cabin,setCabin]=useState(false);const interval=useRef(0);
  useEffect(()=>{
    const root=model.getObjectByName('SU7_ROOT') as Group,materials=new Map<string,MeshStandardMaterial>(),protectedMaterials=new Map<string,MeshStandardMaterial>(),restore:Array<{mesh:Mesh;material:Material|Material[]}>=[];
    const roles=mapping.materialRoles;const whitelist=new Set([roles.paint.material,roles.tailRunning.material,...roles.ambient.materials,...Object.values(roles.turnSignals).flatMap(r=>r.materials),...Object.values(roles.headlights).flatMap(r=>r.projectors.map(p=>p.material))]);
    model.traverse(o=>{if(!(o instanceof Mesh))return;const original=o.material,list=Array.isArray(original)?original:[original];
      const next=list.map(m=>{if(!(m instanceof MeshStandardMaterial))return m;if(!whitelist.has(m.name)){protectedMaterials.set(m.name,m);return m;}let clone=materials.get(m.name);if(!clone){clone=m.clone();materials.set(m.name,clone);}return clone;});
      if(next.some((m,i)=>m!==list[i])){restore.push({mesh:o,material:original});o.material=Array.isArray(original)?next:next[0];}
    });
    const spots=Object.values(roles.headlights).map(cfg=>{const light=new SpotLight('#d9efff',0,22,.28,.5,2);light.position.fromArray(cfg.lightPosition).add(new Vector3(0,0,-.025));light.target.position.set(light.position.x,.025,-6);root.add(light,light.target);light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.bias=-.00015;return light;});
    model.updateMatrixWorld(true);const routeGroups=groupedAmbientRoutes(model);const doorLightIndex=new Map<string,number>();
    const ambientLights=roles.ambient.lights.map((cfg,index)=>{
      const occluded='occludedFootwell' in cfg&&cfg.occludedFootwell;
      const light=occluded?new SpotLight('#9867ff',0,cfg.distance,1.12,.85,2):new PointLight('#9867ff',0,cfg.distance,2);
      light.position.fromArray(cfg.position);light.userData.gain=cfg.gain;
      const parent=root.getObjectByName(cfg.parent)??root;parent.add(light);
      if(!occluded&&cfg.parent.startsWith('DOOR_')){
        const lower=(doorLightIndex.get(cfg.parent)??0)>0;doorLightIndex.set(cfg.parent,1);
        const routes=routeGroups.get(parent)??[];
        const route=routes.find(r=>r.name.startsWith(lower?(cfg.parent.includes('_F')?'front-handle-':'rear-armrest-'):(cfg.parent.includes('_F')?'front-inlay-upper-':'rear-inlay-')))!;
        const center=route.points.reduce((p,q)=>p.add(new Vector3(...q)),new Vector3()).multiplyScalar(1/route.points.length);
        center.x+=cfg.parent.includes('_FL_')||cfg.parent.includes('_RL_')?.10:-.10;center.y+=lower?.025:-.025;
        const toParent=new Matrix4().copy(parent.matrixWorld).invert().multiply(root.matrixWorld);light.position.copy(center.applyMatrix4(toParent));
        light.distance=lower?.60:.70;light.userData.gain=lower?.07:.09;light.userData.route=route.name;
      }else if(index===7||index===15){light.position.set(0,index===7?.78:.73,index===7?-.4:.27);light.distance=.60;light.userData.gain=.08;light.userData.route='centre-box';}
      if(light instanceof SpotLight){light.target.position.copy(light.position).add(new Vector3(0,-1,0));parent.add(light.target);light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.camera.near=.015;light.shadow.bias=-.00002;light.shadow.normalBias=.001;}
      return light;
    });
    native.current=bindNativeAmbient(model);
    binding.current={materials,offColors:new Map([...materials].map(([name,material])=>[name,material.color.getHexString()])),spots,ambientLights,protectedMaterials,root};
    const required=[roles.paint.material,roles.tailRunning.material,...roles.ambient.materials,...Object.values(roles.turnSignals).flatMap(r=>r.materials),...Object.values(roles.headlights).flatMap(r=>r.projectors.map(p=>p.material))];
    useVehicle.getState().registerCapabilities('appearance',required.every(m=>materials.has(m))?['paint:body','ambient:cabin','headlights:front','turnSignal:vehicle']:[]);
    return()=>{native.current?.dispose();native.current=null;binding.current=null;useVehicle.getState().registerCapabilities('appearance',[]);for(const r of restore)r.mesh.material=r.material;materials.forEach(m=>m.dispose());for(const light of spots){light.target.removeFromParent();light.removeFromParent();light.dispose();}for(const light of ambientLights){if(light instanceof SpotLight)light.target.removeFromParent();light.removeFromParent();light.dispose();}};
  },[model]);
  useFrame((_,delta)=>{
    const b=binding.current;if(!b)return;const state=useVehicle.getState().state,roles=mapping.materialRoles;
    b.materials.get(roles.paint.material)!.color.set(state.paint.color);actualValues['paint:body:color']=state.paint.color;
    const high=state.lights.headlights==='high',on=state.lights.headlights!=='off';
    for(const cfg of Object.values(roles.headlights)){
      for(const p of cfg.projectors){const mat=b.materials.get(p.material)!;mat.emissive.set('#d8f0ff');mat.emissiveIntensity=on&&(!p.highOnly||high)?(high?10:4)*state.lights.brightness:0;}
    }
    b.spots.forEach(light=>{light.intensity=on?(high?6500:1200)*state.lights.brightness:0;light.angle=high?.24:.42;light.distance=high?32:14;light.target.position.set(light.position.x,.025,high?-14:-5.3);});
    actualValues['headlights:front:mode']=state.lights.headlights;actualValues['headlights:front:brightness']=state.lights.brightness;
    const tail=b.materials.get(roles.tailRunning.material)!;tail.color.set('#8a0710');tail.emissive.set(roles.tailRunning.color);tail.emissiveIntensity=roles.tailRunning.intensity;
    if(blink.current.mode!==state.lights.turnSignal)blink.current={mode:state.lights.turnSignal,time:0};else blink.current.time+=Math.min(delta,.1);
    const pulse=blink.current.time%.72<.36;const signals={left:pulse&&(state.lights.turnSignal==='left'||state.lights.turnSignal==='hazard'),right:pulse&&(state.lights.turnSignal==='right'||state.lights.turnSignal==='hazard')};
    // The volume pass consumes this very frame's pulse; no second blink clock.
    b.root.userData.turnSignalPulse=signals;
    for(const side of ['left','right'] as const)for(const name of roles.turnSignals[side].materials){const mat=b.materials.get(name)!;mat.emissive.set('#ffd000');mat.emissiveIntensity=signals[side]?2.2:0;mat.color.set(signals[side]?'#ffd000':`#${b.offColors.get(name)!}`);}
    actualValues['turnSignal:vehicle:mode']=state.lights.turnSignal;
    const target=state.ambient.brightness;brightness.current=Math.abs(brightness.current-target)<delta*1.5?target:brightness.current+Math.sign(target-brightness.current)*delta*1.5;
    const power=state.ambient.enabled?brightness.current:0,ambient=b.materials.get(roles.ambient.material)!;
    native.current?.materials.forEach(m=>{m.emissive.set(state.ambient.color);m.emissiveIntensity=power*1.8;});
    for(const name of roles.ambient.materials){const mat=b.materials.get(name)!;mat.emissive.set(state.ambient.color);mat.emissiveIntensity=power*(name===roles.ambient.washMaterial ? 1.05 : 1.2);mat.color.set(power>0?state.ambient.color:'#08090c');}
    b.ambientLights.forEach(light=>{light.color.set(state.ambient.color);light.intensity=power*Number(light.userData.gain)*2.4;});
    b.root.userData.ambientScatter={power,color:ambient.emissive,lights:b.ambientLights};
    actualValues['ambient:cabin:enabled']=state.ambient.enabled;actualValues['ambient:cabin:color']=state.ambient.color;actualValues['ambient:cabin:brightness']=brightness.current;
    completeExecutions();interval.current+=delta;
    if(interval.current>.10){interval.current=0;setCabin(camera.position.distanceTo(new Vector3(0,1,0).applyMatrix4(model.matrixWorld))<2.2);
      gl.domElement.setAttribute('data-native-ambient',JSON.stringify({zones:native.current?.zones,routeCount:native.current?.routeCount,replaced:native.current?.replaced,originalSurfaces:true,power,emission:power*1.8}));
      gl.domElement.setAttribute('data-appearance',JSON.stringify({tailRunning:{alwaysOn:true,color:tail.emissive.getHexString(),power:tail.emissiveIntensity},headlights:state.lights.headlights,headlightPower:b.spots.map(l=>l.intensity),turnSignal:state.lights.turnSignal,signals,nativeLamps:{projectors:Object.fromEntries(Object.entries(roles.headlights).map(([side,cfg])=>[side,cfg.projectors.map(p=>({node:p.node,material:p.material,power:b.materials.get(p.material)!.emissiveIntensity}))])),signals:Object.fromEntries(Object.entries(roles.turnSignals).map(([side,cfg])=>[side,cfg.materials.map(name=>({material:name,power:b.materials.get(name)!.emissiveIntensity,color:b.materials.get(name)!.color.getHexString(),offColor:b.offColors.get(name)!}))]))},ambient:{power,color:ambient.emissive.getHexString(),brightness:brightness.current,zones:roles.ambient.nodes.length-(native.current?.replaced.length??0)+(native.current?.routeCount??0),nativeZones:native.current?.zones.length??0,emission:roles.ambient.materials.map(name=>({name,power:b.materials.get(name)!.emissiveIntensity})),localLights:b.ambientLights.map(l=>({parent:l.parent?.name,power:l.intensity,castsShadow:l.castShadow,kind:l.type,position:l.getWorldPosition(new Vector3()).toArray()}))},paint:b.materials.get(roles.paint.material)!.color.getHexString(),protectedMaterials:[...b.protectedMaterials].map(([name,m])=>({name,color:m.color.getHexString(),roughness:m.roughness,metalness:m.metalness}))}));
    }
  });
  const root=model.getObjectByName('SU7_ROOT') as Group;
  return cabin&&root?<><Hotspot occlusion={false} model={model} parent={root} position={mapping.cockpitHotspots.lights} label="灯光按键" part="headlights:front" activate={()=>{const mode=useVehicle.getState().state.lights.headlights;manualCommand([{component:'headlights',targets:['front'],operation:'set',property:'mode',value:mode==='off'?'low':mode==='low'?'high':'off'}]);}}/><Hotspot occlusion={false} model={model} parent={root} position={mapping.cockpitHotspots.ambient} label="氛围灯" part="ambient:cabin" activate={()=>manualCommand([{component:'ambient',targets:['cabin'],operation:'set',property:'enabled',value:!useVehicle.getState().state.ambient.enabled}])}/></>:null;
}
