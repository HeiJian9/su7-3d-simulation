import {useEffect,useRef,useState} from 'react';
import {createPortal,useFrame,useThree} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import {Group} from 'three';
import mapping from './data/vehicle-mapping.json';
import {actualValues,completeExecutions,manualCommand,useVehicle} from './vehicle';
import {corners,doorLabels,type Corner} from '../../../packages/shared/src/vehicle';
interface Binding {key:string;node:Group;angle:number;axis:'x'|'y';value:number}
export function Hotspot({model,parent,position,label,part,activate,occlusion=true}:{model:Group;parent:Group;position:number[];label:string;part:string;activate:()=>void;occlusion?:boolean}){
  const selected=useVehicle(s=>s.selectedPart===part);const modelRef=useRef(model);
  const down=useRef({x:0,y:0});
  return createPortal(<group position={position as [number,number,number]}><Html center occlude={occlusion?[modelRef]:false} zIndexRange={[2,0]}><button className={`model-hotspot ${selected?'selected':''}`} aria-label={`模型热点：${label}`} data-part={part} onPointerDown={e=>{e.stopPropagation();down.current={x:e.clientX,y:e.clientY};}} onClick={e=>{e.stopPropagation();if(e.detail!==0&&Math.hypot(e.clientX-down.current.x,e.clientY-down.current.y)>5)return;useVehicle.getState().selectPart(part);activate();}}>{label}<span>↗</span></button></Html></group>,parent);
}
export function VehicleMechanism({model}:{model:Group}){
  const {gl}=useThree();const bindings=useRef<Binding[]>([]);const [hotspots,setHotspots]=useState<Array<{parent:Group;position:number[];label:string;part:string;corner?:Corner}>>([]);
  useEffect(()=>{
    const items:Binding[]=[],points:typeof hotspots=[];
    for(const c of corners){const cfg=mapping.doors[c],node=model.getObjectByName(cfg.node) as Group|undefined;if(!node)continue;
      items.push({key:`door:${c}:openness`,node,angle:cfg.maxAngle,axis:'y',value:0});points.push({parent:node,position:cfg.hotspot.map((v,i)=>v-cfg.hinge[i]),label:doorLabels[c],part:`door:${c}`,corner:c});
    }
    const cfg=mapping.trunk,node=model.getObjectByName(cfg.node) as Group|undefined;
    if(node){items.push({key:'trunk:rear:openness',node,angle:cfg.maxAngle,axis:'x',value:0});points.push({parent:node,position:cfg.hotspot.map((v,i)=>v-cfg.hinge[i]),label:'后备箱',part:'trunk:rear'});}
    bindings.current=items;setHotspots(points);useVehicle.getState().registerCapabilities('mechanical',items.map(b=>b.key.split(':').slice(0,2).join(':')));
    return()=>{for(const b of items){b.node.rotation[b.axis]=0;delete actualValues[b.key];}bindings.current=[];useVehicle.getState().registerCapabilities('mechanical',[]);};
  },[model]);
  useFrame((_,delta)=>{
    const store=useVehicle.getState();
    for(const b of bindings.current){const [,corner]=b.key.split(':');const target=b.key.startsWith('door:')?store.state.doors[corner as Corner].openness:store.state.trunk.openness;
      const step=Math.min(delta,.05)*.8;b.value=Math.abs(target-b.value)<=step?target:b.value+Math.sign(target-b.value)*step;b.node.rotation[b.axis]=b.angle*b.value;
      actualValues[b.key]=b.value;gl.domElement.setAttribute(`data-${b.key.replaceAll(':','-')}`,b.value.toFixed(4));
      b.node.updateMatrixWorld(true);
      gl.domElement.setAttribute(`data-${b.key.split(':').slice(0,2).join('-')}-matrix`,b.node.matrixWorld.toArray().map(v=>v.toFixed(6)).join(','));
    }
    gl.domElement.setAttribute('data-vehicle-actual',JSON.stringify(actualValues));gl.domElement.setAttribute('data-vehicle-state',JSON.stringify(store.state));completeExecutions();
  },-2);
  return <>{hotspots.map(h=><Hotspot key={h.part} model={model} {...h} activate={()=>{const state=useVehicle.getState().state;const value=h.corner?state.doors[h.corner].openness:state.trunk.openness;manualCommand(h.corner?[{component:'door',targets:[h.corner],operation:'set',property:'openness',value:value>.01?0:1}]:[{component:'trunk',targets:['rear'],operation:'set',property:'openness',value:value>.01?0:1}]);}}/>)}</>;
}
