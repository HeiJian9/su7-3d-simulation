import {corners,doorLabels,type Corner} from '../../../packages/shared/src/vehicle';
import {manualCommand,useVehicle} from './vehicle';
export function MechanicalPanel(){
  const state=useVehicle(s=>s.state),capabilities=useVehicle(s=>s.capabilities),selected=useVehicle(s=>s.selectedPart);
  function change(corner:Corner|'rear',value:number){manualCommand(corner==='rear'?[{component:'trunk',targets:['rear'],operation:'set',property:'openness',value}]:[{component:'door',targets:[corner],operation:'set',property:'openness',value}]);}
  return <details className="component-panel" open><summary><span>DOORS & TRUNK</span>四门与后备箱</summary><div className="component-content">{[...corners,'rear' as const].map(c=>{
    const label=c==='rear'?'后备箱':doorLabels[c],key=c==='rear'?'trunk:rear':`door:${c}`,value=c==='rear'?state.trunk.openness:state.doors[c].openness;
    return <section key={c} className={selected===key?'selected':''}><div className="component-row"><button className="part-select" onClick={()=>useVehicle.getState().selectPart(key)}>{label}</button><output data-testid={`mechanical-target-${c}`}>{Math.round(value*100)}%</output></div><input aria-label={`${label}开度`} type="range" min="0" max="100" step="1" disabled={!capabilities.includes(key)} value={Math.round(value*100)} onChange={e=>change(c,Number(e.target.value)/100)}/><div className="part-presets">{([0,.5,1] as const).map(v=><button key={v} aria-label={`${label}${v===0?'关闭':v===1?'全开':'半开'}`} onClick={()=>change(c,v)}>{v===0?'关闭':v===1?'全开':'半开'}</button>)}</div></section>;
  })}<p>标注热点随实际门体移动 · 拖动镜头不会触发操作</p></div></details>;
}
