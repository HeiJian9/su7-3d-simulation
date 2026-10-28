import {corners,doorLabels,type Corner} from '../../../packages/shared/src/vehicle';
import {useScene} from './store';
import {manualCommand,useVehicle} from './vehicle';
export function MechanicalPanel(){
  const state=useVehicle(s=>s.state),capabilities=useVehicle(s=>s.capabilities),selected=useVehicle(s=>s.selectedPart);
  function change(corner:Corner|'rear'|'front',value:number){manualCommand(corner==='front'?[{component:'frunk',targets:['front'],operation:'set',property:'openness',value}]:corner==='rear'?[{component:'trunk',targets:['rear'],operation:'set',property:'openness',value}]:[{component:'door',targets:[corner],operation:'set',property:'openness',value}]);}
  return <details className="component-panel" open><summary><span>DOORS & TRUNK</span>四门与前后备箱</summary><div className="component-content">{[...corners,'front' as const,'rear' as const].map(c=>{
    const label=c==='front'?'前备箱':c==='rear'?'后备箱':doorLabels[c],key=c==='front'?'frunk:front':c==='rear'?'trunk:rear':`door:${c}`,value=c==='front'?state.frunk.openness:c==='rear'?state.trunk.openness:state.doors[c].openness;
    return <section key={c} className={selected===key?'selected':''}><div className="component-row"><button className="part-select" onClick={()=>useVehicle.getState().selectPart(key)}>{label}</button><output data-testid={`mechanical-target-${c}`}>{Math.round(value*100)}%</output></div><input aria-label={`${label}开度`} type="range" min="0" max="100" step="1" disabled={!capabilities.includes(key)} value={Math.round(value*100)} onChange={e=>change(c,Number(e.target.value)/100)}/><div className="part-presets">{([0,.5,1] as const).map(v=><button key={v} aria-label={`${label}${v===0?'关闭':v===1?'全开':'半开'}`} onClick={()=>change(c,v)}>{v===0?'关闭':v===1?'全开':'半开'}</button>)}</div></section>;
  })}<button className="scene-light-toggle" onClick={()=>useScene.getState().go('frunk')}>前备箱视角</button><button className="scene-light-toggle" onClick={()=>useScene.getState().go('cargo')}>后备箱视角</button><p>轻点车身标记，也可控制车门与备箱。</p></div></details>;
}
