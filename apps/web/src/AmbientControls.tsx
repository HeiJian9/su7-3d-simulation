import type {CSSProperties} from 'react';
import {manualCommand,useVehicle} from './vehicle';
import {useScene} from './store';

export const ambientPalettes = [
  {name:'冰川蓝',color:'#72c9ff',brightness:.65},
  {name:'极光青',color:'#78e4cc',brightness:.62},
  {name:'暮光紫',color:'#ad87ff',brightness:.65},
  {name:'玫瑰霞',color:'#ff8cac',brightness:.58},
  {name:'暖琥珀',color:'#ffc38a',brightness:.55},
  {name:'月光白',color:'#dae9ff',brightness:.50},
] as const;

export function AmbientControls(){
  const night=useVehicle(s=>s.state.observation.night);
  const ambient=useVehicle(s=>s.state.ambient),ready=useVehicle(s=>s.capabilities.includes('ambient:cabin'));
  const send=(property:'enabled'|'color'|'brightness',value:boolean|string|number)=>{
    if(property==='enabled')manualCommand([{component:'ambient',targets:['cabin'],operation:'set',property,value:value as boolean}]);
    else if(property==='color')manualCommand([{component:'ambient',targets:['cabin'],operation:'set',property,value:value as string}]);
    else manualCommand([{component:'ambient',targets:['cabin'],operation:'set',property,value:value as number}]);
  };
  const style={'--ambient-color':ambient.color,'--ambient-level':ambient.enabled?ambient.brightness:0} as CSSProperties;
  return <section className="ambient-design" aria-label="环绕氛围设置">
    <div className="component-row"><strong>环绕氛围</strong><button disabled={!ready} className="part-toggle" aria-pressed={ambient.enabled} onClick={()=>send('enabled',!ambient.enabled)}>{ambient.enabled?'关闭氛围灯':'打开氛围灯'}</button></div>
    <div className="ambient-diagram" style={style} aria-hidden="true">
      <svg viewBox="0 0 180 150" fill="none">
        <path className="shell" d="M56 8Q90-2 124 8Q143 15 145 38L151 108Q148 137 130 144H50Q32 137 29 108L35 38Q37 15 56 8Z"/>
        <path className="shell" d="M51 30Q90 12 129 30L135 47H45Z"/>
        <rect className="seat" x="48" y="60" width="29" height="33" rx="9"/><rect className="seat" x="103" y="60" width="29" height="33" rx="9"/>
        <path className="seat" d="M49 112Q90 104 131 112V130H49Z"/>
        <rect className="light-wash" x="46" y="46" width="32" height="16" rx="8"/><rect className="light-wash" x="102" y="46" width="32" height="16" rx="8"/>
        <rect className="light-wash" x="47" y="94" width="31" height="15" rx="7"/><rect className="light-wash" x="102" y="94" width="31" height="15" rx="7"/>
        <path className="light-path" d="M43 43Q90 33 137 43M40 49L38 85M39 95L42 121M140 49L142 85M141 95L138 121M83 49V100Q90 105 97 100V49"/>
        <path className="light-path" d="M45 59L44 78M45 100L47 117M135 59L136 78M135 100L133 117" strokeWidth=".8"/>
      </svg>
    </div>
    <div className="ambient-diagram-caption"><span>全舱联动</span><button className="scene-light-toggle" aria-pressed={night} onClick={()=>manualCommand([{component:'observation',targets:['scene'],property:'night',operation:'set',value:!night}])}>{night?'夜间观察':'柔光展厅'}</button></div>
    <div className="ambient-presets" aria-label="氛围配色">{ambientPalettes.map(p=><button key={p.name} disabled={!ready} aria-label={`氛围配色：${p.name}`} aria-pressed={ambient.color.toLowerCase()===p.color&&ambient.enabled} style={{'--swatch':p.color} as CSSProperties} onClick={()=>manualCommand([
      {component:'ambient',targets:['cabin'],operation:'set',property:'enabled',value:true},
      {component:'ambient',targets:['cabin'],operation:'set',property:'color',value:p.color},
      {component:'ambient',targets:['cabin'],operation:'set',property:'brightness',value:p.brightness},
    ])}><i/>{p.name}</button>)}</div>
    <label className="color-picker">自定义色调<input disabled={!ready} type="color" aria-label="氛围灯颜色" value={ambient.color} onChange={e=>send('color',e.target.value)}/></label>
    <label className="component-row" htmlFor="ambient-brightness">灯光亮度<output>{Math.round(ambient.brightness*100)}%</output></label>
    <input disabled={!ready} id="ambient-brightness" aria-label="氛围灯亮度" type="range" min="0" max="100" value={Math.round(ambient.brightness*100)} onChange={e=>send('brightness',Number(e.target.value)/100)}/>
    <p>仪表台 · 四门饰板 · 中央通道 · 前后脚窝</p>
    <div className="mode-buttons"><button onClick={()=>useScene.getState().go('lounge')}>全舱视角</button><button onClick={()=>useScene.getState().go('ambient')}>门板视角</button><button onClick={()=>useScene.getState().go('rearCabin')}>后排视角</button></div>
  </section>;
}
