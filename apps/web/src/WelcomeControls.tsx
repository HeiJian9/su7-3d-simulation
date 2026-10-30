import {useState} from 'react';
import {useWelcome,welcomeAction} from './welcome';
import {manualCommand,useVehicle} from './vehicle';
import {useScene} from './store';
export function WelcomeControls(){
 const {snapshot,connected,error}=useWelcome(),[remote,setRemote]=useState('');
 const ready=useScene(s=>s.loaded),rain=useVehicle(s=>s.state.welcomeRain);
 const setRain=(enabled:boolean)=>manualCommand([{component:'welcomeRain',targets:['front'],operation:'set',property:'enabled',value:enabled}]);
 return <section className="welcome-controls"><div className="component-row"><strong>迎宾灯光</strong><span>{connected?'已连接':'连接中'}</span></div>
  <div className="mode-buttons"><button aria-pressed={rain.enabled} disabled={!connected||!ready} onClick={()=>setRain(!rain.enabled)}>{rain.enabled?'关闭流星雨':'流星雨迎宾'}</button><button disabled={!connected||!ready} onClick={()=>void welcomeAction(snapshot?.locked?'unlock':'lock')}>{snapshot?.locked?'解锁车辆':'锁定车辆'}</button></div>
  <div className="ambient-brightness"><label>流星雨亮度 <strong>{Math.round(rain.brightness*100)}%</strong><input aria-label="流星雨亮度" type="range" min="0" max="100" value={Math.round(rain.brightness*100)} disabled={!ready||!connected} onChange={e=>manualCommand([{component:'welcomeRain',targets:['front'],operation:'set',property:'brightness',value:Number(e.target.value)/100}])}/></label></div>
  <label><input type="checkbox" checked={snapshot?.auto??true} disabled={!connected} onChange={e=>void welcomeAction('auto',e.target.checked)}/> 解锁自动迎宾</label>
  <p>流星雨持续点亮，点击关闭。开门时，踏板旁亮起 mi 迎宾光晕。</p>
  <div className="mode-buttons"><button onClick={()=>useScene.getState().go('welcome')}>迎宾视角</button><button onClick={()=>useScene.getState().go('welcomeDetail')}>灯组细节</button><button onClick={()=>useScene.getState().go('puddle')}>投影视角</button></div>
  <button className="scene-light-toggle" onClick={()=>useScene.getState().go('welcomeAir')}>流星近景</button>
  <button className="scene-light-toggle" onClick={()=>useScene.getState().go('puddleSource')}>灯口视角</button>
  <button className="scene-light-toggle" onClick={()=>useScene.getState().go('puddleLeft')}>左侧投影视角</button>
  <button onClick={()=>{void fetch('/api/welcome/pair').then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>setRemote(`${location.origin}/remote?token=${encodeURIComponent(d.token)}`)).catch(()=>useWelcome.setState({error:'请从本机打开配对入口。'}));}}>连接遥控器</button>
  {remote&&<p><a href={remote} target="_blank" rel="noreferrer">打开独立遥控页面 ↗</a></p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
export function RemoteWelcome(){
 const {connected,snapshot,error}=useWelcome();
 return <main className="remote-welcome"><span>SU7 · 迎宾遥控</span><h1>光，迎接你的到来。</h1><p>{connected?'车辆服务已连接':'正在连接车辆服务…'}</p><button aria-pressed={!!snapshot?.rain} disabled={!connected} onClick={()=>void welcomeAction('rain',!snapshot?.rain)}>{snapshot?.rain?'关闭流星雨':'流星雨迎宾'}</button><button disabled={!connected} onClick={()=>void welcomeAction(snapshot?.locked?'unlock':'lock')}>{snapshot?.locked?'解锁车辆':'锁定车辆'}</button><label><input type="checkbox" checked={snapshot?.auto??true} onChange={e=>void welcomeAction('auto',e.target.checked)}/> 解锁自动迎宾</label>{error&&<p role="alert">{error}</p>}<p>流星雨保持开启；解锁自动迎宾播放一轮。</p></main>;
}
