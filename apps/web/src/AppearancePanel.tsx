import {paintPresets,type VehicleCommand} from '../../../packages/shared/src/vehicle';
import {manualCommand,useVehicle} from './vehicle';
import {useScene} from './store';
export function AppearancePanel(){
  const s=useVehicle(v=>v.state),ready=useVehicle(v=>v.capabilities.includes('paint:body'));
  const night=useScene(v=>v.night),haze=useScene(v=>v.haze),hazeEnabled=useScene(v=>v.hazeEnabled);
  const send=(c:VehicleCommand)=>manualCommand([c]);
  return <div className="component-content appearance-panel">
    <section>
      <div className="component-row"><strong>车灯</strong><button className="scene-light-toggle" aria-pressed={night} onClick={()=>useScene.getState().setNight(!night)}>{night?'夜间观察':'柔光展厅'}</button></div>
      <p>切换夜间观察，比较近远光与空气中的光束。<button className="scene-light-toggle" onClick={()=>useScene.getState().go('lighting')}>照射视角</button></p>
      <div className="mode-buttons">{(['off','low','high'] as const).map((mode,i)=><button key={mode} disabled={!ready} aria-pressed={s.lights.headlights===mode} onClick={()=>send({component:'headlights',targets:['front'],operation:'set',property:'mode',value:mode})}>{['关闭前灯','近光灯','远光灯'][i]}</button>)}</div>
      <div className="mode-buttons">{(['off','left','right','hazard'] as const).map((mode,i)=><button key={mode} disabled={!ready} aria-pressed={s.lights.turnSignal===mode} onClick={()=>send({component:'turnSignal',targets:['vehicle'],operation:'set',property:'mode',value:mode})}>{['关闭转向','左转向灯','右转向灯','双闪'][i]}</button>)}</div>
      <div className="component-row"><span>丁达尔光束</span><button className="scene-light-toggle" aria-label="丁达尔光束" aria-pressed={hazeEnabled} onClick={()=>useScene.getState().setHazeEnabled(!hazeEnabled)}>{hazeEnabled?'已开启':'已关闭'}</button></div>
      <label className="component-row" htmlFor="light-haze">空气散射<output>{Math.round(haze*100)}%</output></label>
      <input id="light-haze" aria-label="空气散射强度" type="range" min="0" max="100" value={Math.round(haze*100)} disabled={!hazeEnabled} onChange={e=>useScene.getState().setHaze(Number(e.target.value)/100)}/>
    </section>
    <section>
      <div className="component-row"><strong>车漆</strong><label className="color-picker">自定义<input type="color" aria-label="自定义车漆颜色" value={s.paint.color} onChange={e=>send({component:'paint',targets:['body'],operation:'set',property:'color',value:e.target.value})}/></label></div>
      <div className="paint-swatches">{paintPresets.map(p=><button aria-label={`车漆：${p.name}`} key={p.color} title={p.name} aria-pressed={s.paint.color===p.color} style={{backgroundColor:p.color}} onClick={()=>send({component:'paint',targets:['body'],operation:'set',property:'color',value:p.color})}/>)}</div>
      <p>只控制车身漆面，保留金属度与粗糙度。</p>
    </section>
    <section>
      <div className="component-row"><strong>氛围灯</strong><button className="part-toggle" aria-pressed={s.ambient.enabled} onClick={()=>send({component:'ambient',targets:['cabin'],operation:'set',property:'enabled',value:!s.ambient.enabled})}>{s.ambient.enabled?'关闭氛围灯':'打开氛围灯'}</button></div>
      <label className="color-picker">灯光颜色<input type="color" aria-label="氛围灯颜色" value={s.ambient.color} onChange={e=>send({component:'ambient',targets:['cabin'],operation:'set',property:'color',value:e.target.value})}/></label>
      <label className="component-row" htmlFor="ambient-brightness">亮度<output>{Math.round(s.ambient.brightness*100)}%</output></label>
      <input id="ambient-brightness" aria-label="氛围灯亮度" type="range" min="0" max="100" value={Math.round(s.ambient.brightness*100)} onChange={e=>send({component:'ambient',targets:['cabin'],operation:'set',property:'brightness',value:Number(e.target.value)/100})}/>
      <p>门板嵌边、把手、中控与脚窝联动。<button className="scene-light-toggle" onClick={()=>useScene.getState().go('ambient')}>门板视角</button></p>
    </section>
  </div>;
}
