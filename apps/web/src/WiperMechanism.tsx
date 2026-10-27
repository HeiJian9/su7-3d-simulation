import {useEffect,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Group,Mesh,Vector3} from 'three';
import {WiperMotion} from '../../../packages/shared/src/wipers';
import mapping from './data/vehicle-mapping.json';
import {actualValues,completeExecutions,manualCommand,useVehicle} from './vehicle';
import {Hotspot} from './VehicleMechanism';
interface Binding {node:Group;mesh:Mesh;axis:Vector3;angle:number;targets:number[]}
export function WiperMechanism({model}:{model:Group}){
  const {gl,camera}=useThree(),bindings=useRef<Binding[]>([]),motion=useRef(new WiperMotion()),timer=useRef(0);const [cabin,setCabin]=useState(false);
  useEffect(()=>{
    const items:Binding[]=[];
    for(const cfg of Object.values(mapping.wipers.assemblies)){
      const node=model.getObjectByName(cfg.node) as Group|undefined,mesh=model.getObjectByName(cfg.mesh) as Mesh|undefined;
      if(!node||!mesh?.isMesh||!mesh.morphTargetDictionary||!mesh.morphTargetInfluences)continue;
      const targets=cfg.morphTargets.map(name=>mesh.morphTargetDictionary![name]);if(targets.some(i=>i===undefined))continue;
      items.push({node,mesh,targets,axis:new Vector3().fromArray(cfg.axis).normalize(),angle:cfg.maxAngle});
    }
    bindings.current=items;motion.current=new WiperMotion();useVehicle.getState().registerCapabilities('wiper',items.length===2?['wiper:front']:[]);
    return()=>{bindings.current=[];for(const b of items){b.node.quaternion.identity();b.mesh.morphTargetInfluences!.fill(0);}useVehicle.getState().registerCapabilities('wiper',[]);};
  },[model]);
  useFrame((_,delta)=>{
    if(bindings.current.length!==2)return;const s=useVehicle.getState().state,pose=motion.current.step(delta,s.wipers.mode,s.wipers.onceSequence);
    for(const b of bindings.current){b.node.quaternion.setFromAxisAngle(b.axis,b.angle*pose.fraction);const weights=b.mesh.morphTargetInfluences!;weights.fill(0);const x=pose.fraction*8,lo=Math.floor(x),hi=Math.min(8,lo+1),t=x-lo;if(lo>0)weights[b.targets[lo-1]]+=1-t;if(hi>0)weights[b.targets[hi-1]]+=t;}
    actualValues['wiper:front:mode']=pose.appliedMode;actualValues['wiper:front:swipe']=pose.completedOnce;completeExecutions();
    gl.domElement.setAttribute('data-wipers',JSON.stringify({...pose,requestedMode:s.wipers.mode,requestedOnce:s.wipers.onceSequence,angles:bindings.current.map(b=>b.angle*pose.fraction)}));
    timer.current+=delta;if(timer.current>.12){timer.current=0;setCabin(camera.position.distanceTo(new Vector3(0,1,0).applyMatrix4(model.matrixWorld))<2.2);}
  });
  const root=model.getObjectByName('SU7_ROOT') as Group;
  return cabin&&root?<Hotspot occlusion={false} model={model} parent={root} position={mapping.cockpitHotspots.wiper} label="雨刷按键" part="wiper:front" activate={()=>{const mode=useVehicle.getState().state.wipers.mode;manualCommand([{component:'wiper',targets:['front'],operation:'set',property:'mode',value:mode==='off'?'low':'off'}]);}}/>:null;
}
