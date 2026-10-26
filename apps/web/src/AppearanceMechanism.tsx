import {useEffect,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Group,Mesh,MeshStandardMaterial,PointLight,SpotLight,Vector3,type Material} from 'three';
import mapping from './data/vehicle-mapping.json';
import {actualValues,completeExecutions,manualCommand,useVehicle} from './vehicle';
import {Hotspot} from './VehicleMechanism';
type Binding={materials:Map<string,MeshStandardMaterial>;spots:SpotLight[];ambientLights:PointLight[];protectedMaterials:Map<string,MeshStandardMaterial>;root:Group};
export function AppearanceMechanism({model}:{model:Group}){
  const {gl,camera}=useThree();const binding=useRef<Binding|null>(null),blink=useRef({mode:'off',time:0}),brightness=useRef(.4);const [cabin,setCabin]=useState(false);const interval=useRef(0);
  useEffect(()=>{
    const root=model.getObjectByName('SU7_ROOT') as Group,materials=new Map<string,MeshStandardMaterial>(),protectedMaterials=new Map<string,MeshStandardMaterial>(),restore:Array<{mesh:Mesh;material:Material|Material[]}>=[];
    const roles=mapping.materialRoles;const whitelist=new Set([roles.paint.material,roles.ambient.material,...Object.values(roles.turnSignals).map(r=>r.material),...Object.values(roles.headlights).flatMap(r=>[r.drlMaterial,...r.projectors.map(p=>p.material)])]);
    model.traverse(o=>{if(!(o instanceof Mesh))return;const original=o.material,list=Array.isArray(original)?original:[original];
      const next=list.map(m=>{if(!(m instanceof MeshStandardMaterial))return m;if(!whitelist.has(m.name)){protectedMaterials.set(m.name,m);return m;}let clone=materials.get(m.name);if(!clone){clone=m.clone();materials.set(m.name,clone);}return clone;});
      if(next.some((m,i)=>m!==list[i])){restore.push({mesh:o,material:original});o.material=Array.isArray(original)?next:next[0];}
    });
    const spots=Object.values(roles.headlights).map(cfg=>{const light=new SpotLight('#d9efff',0,22,.28,.5,2);light.position.fromArray(cfg.lightPosition).add(new Vector3(0,0,-.025));light.target.position.set(light.position.x,.025,-6);root.add(light,light.target);light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.bias=-.00015;return light;});
    const ambientLights=roles.ambient.lightPositions.map(p=>{const light=new PointLight('#9867ff',0,1.4,2);light.position.fromArray(p);root.add(light);return light;});
    binding.current={materials,spots,ambientLights,protectedMaterials,root};
    const required=[roles.paint.material,roles.ambient.material,...Object.values(roles.turnSignals).map(r=>r.material)];
    useVehicle.getState().registerCapabilities('appearance',required.every(m=>materials.has(m))?['paint:body','ambient:cabin','headlights:front','turnSignal:vehicle']:[]);
    return()=>{binding.current=null;useVehicle.getState().registerCapabilities('appearance',[]);for(const r of restore)r.mesh.material=r.material;materials.forEach(m=>m.dispose());for(const light of spots){light.target.removeFromParent();light.removeFromParent();light.dispose();}for(const light of ambientLights){light.removeFromParent();light.dispose();}};
  },[model]);
  useFrame((_,delta)=>{
    const b=binding.current;if(!b)return;const state=useVehicle.getState().state,roles=mapping.materialRoles;
    b.materials.get(roles.paint.material)!.color.set(state.paint.color);actualValues['paint:body:color']=state.paint.color;
    const high=state.lights.headlights==='high',on=state.lights.headlights!=='off';
    for(const cfg of Object.values(roles.headlights)){
      b.materials.get(cfg.drlMaterial)!.emissive.set('#d8f0ff');b.materials.get(cfg.drlMaterial)!.emissiveIntensity=on?high?5:2.5:0;
      for(const p of cfg.projectors){const mat=b.materials.get(p.material)!;mat.emissive.set('#d8f0ff');mat.emissiveIntensity=on&&(!p.highOnly||high)?high?10:4:0;}
    }
    b.spots.forEach(light=>{light.intensity=on?high?6500:1200:0;light.angle=high?.24:.42;light.distance=high?32:14;light.target.position.set(light.position.x,.025,high?-14:-5.3);});
    actualValues['headlights:front:mode']=state.lights.headlights;
    if(blink.current.mode!==state.lights.turnSignal)blink.current={mode:state.lights.turnSignal,time:0};else blink.current.time+=Math.min(delta,.1);
    const pulse=blink.current.time%.72<.36;const signals={left:pulse&&(state.lights.turnSignal==='left'||state.lights.turnSignal==='hazard'),right:pulse&&(state.lights.turnSignal==='right'||state.lights.turnSignal==='hazard')};
    for(const side of ['left','right'] as const){const mat=b.materials.get(roles.turnSignals[side].material)!;mat.emissive.set('#ff7409');mat.emissiveIntensity=signals[side]?6:0;mat.color.set(signals[side]?'#ff8a16':'#49200b');}
    actualValues['turnSignal:vehicle:mode']=state.lights.turnSignal;
    const target=state.ambient.brightness;brightness.current=Math.abs(brightness.current-target)<delta*1.5?target:brightness.current+Math.sign(target-brightness.current)*delta*1.5;
    const power=state.ambient.enabled?brightness.current:0,ambient=b.materials.get(roles.ambient.material)!;ambient.emissive.set(state.ambient.color);ambient.emissiveIntensity=power*3;ambient.color.set(power>0?state.ambient.color:'#08090c');
    b.ambientLights.forEach(light=>{light.color.set(state.ambient.color);light.intensity=power*.35;});
    actualValues['ambient:cabin:enabled']=state.ambient.enabled;actualValues['ambient:cabin:color']=state.ambient.color;actualValues['ambient:cabin:brightness']=brightness.current;
    completeExecutions();interval.current+=delta;
    if(interval.current>.10){interval.current=0;setCabin(camera.position.distanceTo(new Vector3(0,1,0).applyMatrix4(model.matrixWorld))<2.2);
      gl.domElement.setAttribute('data-appearance',JSON.stringify({headlights:state.lights.headlights,headlightPower:b.spots.map(l=>l.intensity),turnSignal:state.lights.turnSignal,signals,ambient:{power,color:ambient.emissive.getHexString(),brightness:brightness.current},paint:b.materials.get(roles.paint.material)!.color.getHexString(),protectedMaterials:[...b.protectedMaterials].map(([name,m])=>({name,color:m.color.getHexString(),roughness:m.roughness,metalness:m.metalness}))}));
    }
  });
  const root=model.getObjectByName('SU7_ROOT') as Group;
  return cabin&&root?<><Hotspot occlusion={false} model={model} parent={root} position={mapping.cockpitHotspots.lights} label="灯光按键" part="headlights:front" activate={()=>{const mode=useVehicle.getState().state.lights.headlights;manualCommand([{component:'headlights',targets:['front'],operation:'set',property:'mode',value:mode==='off'?'low':mode==='low'?'high':'off'}]);}}/><Hotspot occlusion={false} model={model} parent={root} position={mapping.cockpitHotspots.ambient} label="氛围灯" part="ambient:cabin" activate={()=>manualCommand([{component:'ambient',targets:['cabin'],operation:'set',property:'enabled',value:!useVehicle.getState().state.ambient.enabled}])}/></>:null;
}
