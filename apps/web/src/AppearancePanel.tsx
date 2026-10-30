import {AmbientControls} from './AmbientControls';
import {paintPresets,type VehicleCommand} from '../../../packages/shared/src/vehicle';
import {manualCommand,useVehicle} from './vehicle';
import {useScene} from './store';
import {WelcomeControls} from './WelcomeControls';
import {LightLevel} from './LightLevel';
export function AppearancePanel(){
  const s=useVehicle(v=>v.state),ready=useVehicle(v=>v.capabilities.includes('paint:body'));
  const domeReady=useVehicle(v=>v.capabilities.includes('cabinLight:front')&&v.capabilities.includes('cabinLight:rear'));
  const haze=s.scatter.strength,hazeEnabled=s.scatter.enabled;
  const send=(c:VehicleCommand)=>manualCommand([c]);
  return <div className="component-content appearance-panel">
    <WelcomeControls/>
    <AmbientControls/>
    <section>
      <div className="component-row"><strong>车灯</strong><button className="scene-light-toggle" onClick={()=>useScene.getState().go('lighting')}>照射视角</button></div>
      <div className="mode-buttons">{(['off','low','high'] as const).map((mode,i)=><button key={mode} disabled={!ready} aria-pressed={s.lights.headlights===mode} onClick={()=>send({component:'headlights',targets:['front'],operation:'set',property:'mode',value:mode})}>{['关闭前灯','近光灯','远光灯'][i]}</button>)}</div>
      <LightLevel label="前灯亮度" value={s.lights.brightness} disabled={!ready} onChange={value=>send({component:'headlights',targets:['front'],operation:'set',property:'brightness',value})}/><div className="mode-buttons">{(['off','left','right','hazard'] as const).map((mode,i)=><button key={mode} disabled={!ready} aria-pressed={s.lights.turnSignal===mode} onClick={()=>send({component:'turnSignal',targets:['vehicle'],operation:'set',property:'mode',value:mode})}>{['关闭转向','左转向灯','右转向灯','双闪'][i]}</button>)}</div>
      <div className="component-row"><span>丁达尔光束</span><button className="scene-light-toggle" aria-label="丁达尔光束" aria-pressed={hazeEnabled} onClick={()=>send({component:'scatter',targets:['scene'],property:'enabled',operation:'set',value:!hazeEnabled})}>{hazeEnabled?'已开启':'已关闭'}</button></div>
      <LightLevel label="空气散射" ariaLabel="空气散射强度" value={haze} disabled={!hazeEnabled} onChange={value=>send({component:'scatter',targets:['scene'],property:'strength',operation:'set',value})}/>
    </section>
    <section>
      <div className="component-row"><strong>车内主灯</strong></div>
      {(['front','rear'] as const).map((target,i)=><div className="lighting-control-block" key={target}><div className="component-row"><span>{i===0?'前排':'后排'}顶灯</span><button className="part-toggle" disabled={!domeReady} aria-label={`${i===0?'前排':'后排'}主灯开关`} aria-pressed={s.cabinLights[target]} onClick={()=>send({component:'cabinLight',targets:[target],property:'enabled',operation:'set',value:!s.cabinLights[target]})}>{s.cabinLights[target]?'关闭':'开启'}</button></div><LightLevel label="亮度" ariaLabel={`${i===0?'前排':'后排'}顶灯亮度`} value={s.cabinBrightness[target]} disabled={!domeReady} onChange={value=>send({component:'cabinLight',targets:[target],property:'brightness',operation:'set',value})}/></div>)}<div className="mode-buttons"><button onClick={()=>useScene.getState().go('roofFront')}>前排顶灯视角</button><button onClick={()=>useScene.getState().go('roofRear')}>后排顶灯视角</button></div>
    </section>
    <section>
      <div className="component-row"><strong>车漆</strong><label className="color-picker">自定义<input type="color" aria-label="自定义车漆颜色" value={s.paint.color} onChange={e=>send({component:'paint',targets:['body'],operation:'set',property:'color',value:e.target.value})}/></label></div>
      <div className="paint-swatches">{paintPresets.map(p=><button aria-label={`车漆：${p.name}`} key={p.color} title={p.name} aria-pressed={s.paint.color===p.color} style={{backgroundColor:p.color}} onClick={()=>send({component:'paint',targets:['body'],operation:'set',property:'color',value:p.color})}/>)}</div>

    </section>

  </div>;
}
