import {useEffect,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Group,Mesh,MeshStandardMaterial,SpotLight,Vector3,type Material} from 'three';
import mapping from './data/vehicle-mapping.json';
import {actualValues,completeExecutions,manualCommand,useVehicle} from './vehicle';
import {Hotspot} from './VehicleMechanism';
const positions=['front','rear'] as const;
export function CabinMainLights({model}:{model:Group}){
 const {gl,camera}=useThree(),binding=useRef<Array<{position:typeof positions[number];material:MeshStandardMaterial;light:SpotLight}>>([]),tick=useRef(0);const [inside,setInside]=useState(false);
 useEffect(()=>{
  const root=model.getObjectByName('SU7_ROOT')!,restore:Array<{mesh:Mesh;material:Material|Material[]}>=[],items:typeof binding.current=[];
  for(const position of positions){const cfg=mapping.cabinLights[position];let material:MeshStandardMaterial|undefined;
   model.getObjectByName(cfg.lens)?.traverse(o=>{if(!(o instanceof Mesh)||!(o.material instanceof MeshStandardMaterial))return;restore.push({mesh:o,material:o.material});material=o.material.clone();o.material=material;});
   if(!material)continue;
   const light=new SpotLight(cfg.color,0,cfg.distance,cfg.angle,.65,2);light.position.fromArray(cfg.position);light.target.position.copy(light.position).add(new Vector3().fromArray(cfg.direction));light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.bias=-.0001;root.add(light,light.target);items.push({position,material,light});
  }
  binding.current=items;root.userData.domeLights=items.map(i=>i.light);useVehicle.getState().registerCapabilities('cabinMainLights',items.map(i=>`cabinLight:${i.position}`));
  return()=>{delete root.userData.domeLights;for(const r of restore)r.mesh.material=r.material;for(const i of items){i.material.dispose();i.light.target.removeFromParent();i.light.removeFromParent();i.light.dispose();delete actualValues[`cabinLight:${i.position}:enabled`];}binding.current=[];useVehicle.getState().registerCapabilities('cabinMainLights',[]);};
 },[model]);
 useFrame((_,delta)=>{const state=useVehicle.getState().state;
  for(const i of binding.current){const on=state.cabinLights[i.position],cfg=mapping.cabinLights[i.position];i.material.color.set(on?cfg.color:'#aaa69a');i.material.emissive.set(cfg.color);i.material.emissiveIntensity=on?2.4:0;i.light.intensity=on?cfg.intensity:0;actualValues[`cabinLight:${i.position}:enabled`]=on;}
  completeExecutions();tick.current+=delta;if(tick.current>.1){tick.current=0;setInside(camera.position.distanceTo(new Vector3(0,1,0).applyMatrix4(model.matrixWorld))<2.2);gl.domElement.setAttribute('data-cabin-main-lights',JSON.stringify(binding.current.map(i=>({position:i.position,enabled:state.cabinLights[i.position],power:i.light.intensity,emission:i.material.emissiveIntensity,origin:i.light.position.toArray(),direction:i.light.target.position.clone().sub(i.light.position).normalize().toArray(),castsShadow:i.light.castShadow}))));}
 });
 const root=model.getObjectByName('SU7_ROOT') as Group;
 return inside&&root?<>{positions.map(position=><Hotspot key={position} model={model} parent={root} position={mapping.cabinLights[position].hotspot} label={position==='front'?'前排主灯':'后排主灯'} part={`cabinLight:${position}`} occlusion={false} activate={()=>manualCommand([{component:'cabinLight',targets:[position],property:'enabled',operation:'set',value:!useVehicle.getState().state.cabinLights[position]}])}/>)}</>:null;
}
