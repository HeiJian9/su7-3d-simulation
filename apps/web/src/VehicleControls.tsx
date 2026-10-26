import {useEffect,useState} from 'react';
import {WindowPanel} from './WindowPanel';
import {MechanicalPanel} from './MechanicalPanel';
import {AppearancePanel} from './AppearancePanel';
import {useVehicle} from './vehicle';
export function VehicleControls(){
  const [tab,setTab]=useState('windows'),[open,setOpen]=useState(true);const selected=useVehicle(s=>s.selectedPart);
  useEffect(()=>{if(selected?.startsWith('door:')||selected?.startsWith('trunk:')){setTab('mechanical');setOpen(true);}else if(selected?.startsWith('window:')){setTab('windows');setOpen(true);}else if(selected){setTab('appearance');setOpen(true);}},[selected]);
  return <aside className={`vehicle-controls ${open?'expanded':''}`} aria-label="车辆控制面板"><div className="controls-top"><span>VEHICLE CONTROLS</span><button aria-label={open?'折叠车辆面板':'展开车辆面板'} onClick={()=>setOpen(!open)}>{open?'−':'+'}</button></div>{open&&<><nav aria-label="部件分类"><button aria-pressed={tab==='windows'} onClick={()=>setTab('windows')}>四窗</button><button aria-pressed={tab==='mechanical'} onClick={()=>setTab('mechanical')}>门与尾箱</button><button aria-pressed={tab==='appearance'} onClick={()=>setTab('appearance')}>灯光外观</button></nav><div className="controls-scroll">{tab==='windows'?<WindowPanel/>:tab==='mechanical'?<MechanicalPanel/>:<AppearancePanel/>}</div></>}</aside>;
}
