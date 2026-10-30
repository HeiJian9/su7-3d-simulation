import {useState} from 'react';
import {useWelcome,welcomeAction} from './welcome';
import {manualCommand,useVehicle} from './vehicle';
import {useScene} from './store';
import {LightLevel} from './LightLevel';
export function WelcomeControls(){
 const {snapshot,connected,error}=useWelcome(),[remote,setRemote]=useState('');
 const ready=useScene(s=>s.loaded),rain=useVehicle(s=>s.state.welcomeRain),logo=useVehicle(s=>s.state.welcomeLogo);
 const setRain=(enabled:boolean)=>manualCommand([{component:'welcomeRain',targets:['front'],operation:'set',property:'enabled',value:enabled}]);
 return <section className="welcome-controls" aria-label="迎宾灯光设置">
  <div className="component-row appearance-section-heading"><strong>迎宾灯光</strong><span className="lighting-connection" data-connected={connected}>{connected?'已连接':'连接中'}</span></div>
  <div className="lighting-control-block">
   <div className="component-row"><span>流星雨大灯</span><button className="part-toggle" aria-label={rain.enabled?'关闭流星雨':'流星雨迎宾'} aria-pressed={rain.enabled} disabled={!connected||!ready} onClick={()=>setRain(!rain.enabled)}>{rain.enabled?'关闭':'开启'}</button></div>
   <LightLevel label="流星雨亮度" value={rain.brightness} disabled={!ready||!connected} onChange={value=>manualCommand([{component:'welcomeRain',targets:['front'],operation:'set',property:'brightness',value}])}/>
  </div>
  <div className="lighting-control-block">
   <div className="component-row"><span>车门 Logo 投影</span><button className="part-toggle" aria-label={logo.enabled?'关闭迎宾投影':'开启迎宾投影'} aria-pressed={logo.enabled} disabled={!ready} onClick={()=>manualCommand([{component:'welcomeLogo',targets:['doors'],operation:'set',property:'enabled',value:!logo.enabled}])}>{logo.enabled?'关闭':'开启'}</button></div>
   <p className="lighting-hint">随开门点亮，关门熄灭。</p>
   <LightLevel label="投影亮度" ariaLabel="迎宾投影亮度" value={logo.brightness} disabled={!ready} onChange={value=>manualCommand([{component:'welcomeLogo',targets:['doors'],operation:'set',property:'brightness',value}])}/>
  </div>
  <div className="lighting-control-block">
   <label className="appearance-switch"><span>解锁迎宾</span><span className="appearance-switch-track"><input type="checkbox" aria-label="解锁时播放迎宾动画" checked={snapshot?.auto??true} disabled={!connected} onChange={e=>void welcomeAction('auto',e.target.checked)}/><i aria-hidden="true"/></span></label>
   <div className="welcome-lock-row"><p className="lighting-hint">{rain.enabled?'关闭流星雨后，解锁可体验单次迎宾。':'锁定后解锁，播放约5秒。'}</p><button className="part-toggle" disabled={!connected||!ready} onClick={()=>void welcomeAction(snapshot?.locked?'unlock':'lock')}>{snapshot?.locked?'解锁车辆':'锁定车辆'}</button></div>
  </div>
  <details className="appearance-disclosure"><summary>视角与遥控</summary>
   <div className="appearance-view-grid"><button onClick={()=>useScene.getState().go('welcome')}>迎宾视角</button><button onClick={()=>useScene.getState().go('welcomeDetail')}>灯组细节</button><button onClick={()=>useScene.getState().go('puddle')}>投影视角</button><button onClick={()=>useScene.getState().go('welcomeAir')}>流星近景</button><button onClick={()=>useScene.getState().go('puddleSource')}>灯口视角</button><button onClick={()=>useScene.getState().go('puddleLeft')}>左侧投影视角</button></div>
   <button className="appearance-remote-button" onClick={()=>{void fetch('/api/welcome/pair').then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>setRemote(`${location.origin}/remote?token=${encodeURIComponent(d.token)}`)).catch(()=>useWelcome.setState({error:'请从本机打开配对入口。'}));}}>连接遥控器 <span aria-hidden="true">↗</span></button>
   {remote&&<a className="appearance-remote-link" href={remote} target="_blank" rel="noreferrer">打开独立遥控页面 <span aria-hidden="true">↗</span></a>}
  </details>{error&&<p className="lighting-error" role="alert">{error}</p>}
 </section>;
}
export function RemoteWelcome(){
 const {connected,snapshot,error}=useWelcome();
 return <main className="remote-welcome"><span>SU7 · 迎宾遥控</span><h1>光，迎接你的到来。</h1><p>{connected?'车辆服务已连接':'正在连接车辆服务…'}</p><button aria-pressed={!!snapshot?.rain} disabled={!connected} onClick={()=>void welcomeAction('rain',!snapshot?.rain)}>{snapshot?.rain?'关闭流星雨':'流星雨迎宾'}</button><button disabled={!connected} onClick={()=>void welcomeAction(snapshot?.locked?'unlock':'lock')}>{snapshot?.locked?'解锁车辆':'锁定车辆'}</button><label><input type="checkbox" checked={snapshot?.auto??true} onChange={e=>void welcomeAction('auto',e.target.checked)}/> 解锁自动迎宾</label>{error&&<p role="alert">{error}</p>}<p>流星雨保持开启；解锁自动迎宾播放一轮。</p></main>;
}
