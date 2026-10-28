import {AmbientControls} from './AmbientControls';
import {paintPresets,type VehicleCommand} from '../../../packages/shared/src/vehicle';
import {manualCommand,useVehicle} from './vehicle';
import {useScene} from './store';
export function AppearancePanel(){
  const s=useVehicle(v=>v.state),ready=useVehicle(v=>v.capabilities.includes('paint:body'));
  const domeReady=useVehicle(v=>v.capabilities.includes('cabinLight:front')&&v.capabilities.includes('cabinLight:rear'));
  const haze=s.scatter.strength,hazeEnabled=s.scatter.enabled;
  const send=(c:VehicleCommand)=>manualCommand([c]);
  return <div className="component-content appearance-panel">
    <AmbientControls/>
    <section>
      <div className="component-row"><strong>车灯</strong></div>
      <p>切换光线环境，感受不同灯光效果。<button className="scene-light-toggle" onClick={()=>useScene.getState().go('lighting')}>照射视角</button></p>
      <div className="mode-buttons">{(['off','low','high'] as const).map((mode,i)=><button key={mode} disabled={!ready} aria-pressed={s.lights.headlights===mode} onClick={()=>send({component:'headlights',targets:['front'],operation:'set',property:'mode',value:mode})}>{['关闭前灯','近光灯','远光灯'][i]}</button>)}</div>
      <label className="component-row">前灯亮度<output>{Math.round(s.lights.brightness*100)}%</output></label><input aria-label="前灯亮度" type="range" min="0" max="100" value={Math.round(s.lights.brightness*100)} onChange={e=>send({component:'headlights',targets:['front'],operation:'set',property:'brightness',value:Number(e.target.value)/100})}/><div className="mode-buttons">{(['off','left','right','hazard'] as const).map((mode,i)=><button key={mode} disabled={!ready} aria-pressed={s.lights.turnSignal===mode} onClick={()=>send({component:'turnSignal',targets:['vehicle'],operation:'set',property:'mode',value:mode})}>{['关闭转向','左转向灯','右转向灯','双闪'][i]}</button>)}</div>
      <div className="component-row"><span>丁达尔光束</span><button className="scene-light-toggle" aria-label="丁达尔光束" aria-pressed={hazeEnabled} onClick={()=>send({component:'scatter',targets:['scene'],property:'enabled',operation:'set',value:!hazeEnabled})}>{hazeEnabled?'已开启':'已关闭'}</button></div>
      <label className="component-row" htmlFor="light-haze">空气散射<output>{Math.round(haze*100)}%</output></label>
      <input id="light-haze" aria-label="空气散射强度" type="range" min="0" max="100" value={Math.round(haze*100)} disabled={!hazeEnabled} onChange={e=>send({component:'scatter',targets:['scene'],property:'strength',operation:'set',value:Number(e.target.value)/100})}/>
    </section>
    <section>
      <div className="component-row"><strong>车内主灯</strong></div>
      <div className="mode-buttons">{(['front','rear'] as const).map((target,i)=><button key={target} disabled={!domeReady} aria-label={`${i===0?'前排':'后排'}主灯开关`} aria-pressed={s.cabinLights[target]} onClick={()=>send({component:'cabinLight',targets:[target],property:'enabled',operation:'set',value:!s.cabinLights[target]})}>{i===0?'前排':'后排'} · {s.cabinLights[target]?'开':'关'}</button>)}</div>
      {(['front','rear'] as const).map((target,i)=><label key={target}>{i===0?'前排':'后排'}顶灯亮度 · {Math.round(s.cabinBrightness[target]*100)}%<input aria-label={`${i===0?'前排':'后排'}顶灯亮度`} type="range" min="0" max="100" value={Math.round(s.cabinBrightness[target]*100)} onChange={e=>send({component:'cabinLight',targets:[target],property:'brightness',operation:'set',value:Number(e.target.value)/100})}/></label>)}<div className="mode-buttons"><button onClick={()=>useScene.getState().go('roofFront')}>前排顶灯视角</button><button onClick={()=>useScene.getState().go('roofRear')}>后排顶灯视角</button></div>
      <p>前后排独立照明，也可通过语音调节。</p>
    </section>
    <section>
      <div className="component-row"><strong>车漆</strong><label className="color-picker">自定义<input type="color" aria-label="自定义车漆颜色" value={s.paint.color} onChange={e=>send({component:'paint',targets:['body'],operation:'set',property:'color',value:e.target.value})}/></label></div>
      <div className="paint-swatches">{paintPresets.map(p=><button aria-label={`车漆：${p.name}`} key={p.color} title={p.name} aria-pressed={s.paint.color===p.color} style={{backgroundColor:p.color}} onClick={()=>send({component:'paint',targets:['body'],operation:'set',property:'color',value:p.color})}/>)}</div>

    </section>

  </div>;
}
