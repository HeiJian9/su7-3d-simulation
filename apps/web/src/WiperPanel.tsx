import {wiperModes} from '../../../packages/shared/src/vehicle';
import {manualCommand,useVehicle} from './vehicle';
export function WiperPanel(){
  const s=useVehicle(v=>v.state.wipers),actual=useVehicle(v=>v.actualParts),ready=useVehicle(v=>v.capabilities.includes('wiper:front'));
  return <div className="component-content wiper-panel"><section><div className="component-row"><strong>双雨刷</strong><output>{wiperModes.indexOf(s.mode)} 档</output></div><p>基于原车双雨刷 · 切档延续当前相位，关闭后完成回程归位。</p><div className="wiper-gears">{wiperModes.map((mode,i)=><button key={mode} disabled={!ready} aria-pressed={s.mode===mode} onClick={()=>manualCommand([{component:'wiper',targets:['front'],operation:'set',property:'mode',value:mode}])}><span aria-hidden="true">{i}</span>{['关闭雨刷','间歇雨刷','低速雨刷','高速雨刷'][i]}</button>)}</div><button className="once-wipe" disabled={!ready} onClick={()=>manualCommand([{component:'wiper',targets:['front'],operation:'trigger',action:'swipe_once'}])}>刮一下</button><p role="status">{s.mode==='off'&&actual['wiper:front:mode']!=='off'?'正在刮刷并归位…':s.mode==='off'?'已关闭，等待指令。':`已设为${['关闭','间歇','低速','高速'][wiperModes.indexOf(s.mode)]}。`}</p><p>试试：“雨刷调到二档”“雨刷再快一点”</p></section></div>;
}
