import {useId,type CSSProperties} from 'react';

/** Shared presentation for percentage-based lighting controls. */
export function LightLevel({label,ariaLabel=label,value,disabled=false,onChange}:{label:string;ariaLabel?:string;value:number;disabled?:boolean;onChange:(value:number)=>void}){
 const id=useId(),percent=Math.round(value*100);
 return <div className="light-level" style={{'--level':`${percent}%`} as CSSProperties}>
  <label className="component-row" htmlFor={id}><span>{label}</span><output htmlFor={id} aria-hidden="true">{percent}<small>%</small></output></label>
  <input id={id} aria-label={ariaLabel} type="range" min="0" max="100" step="1" value={percent} disabled={disabled} onChange={e=>onChange(Number(e.target.value)/100)}/>
 </div>;
}
