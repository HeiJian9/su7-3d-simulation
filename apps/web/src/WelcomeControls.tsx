import {useState} from 'react';
import {useWelcome,welcomeAction} from './welcome';
import {useScene} from './store';
export function WelcomeControls(){
 const {snapshot,connected,error}=useWelcome(),[remote,setRemote]=useState('');
 const ready=useScene(s=>s.loaded);
 return <section className="welcome-controls"><div className="component-row"><strong>迎宾灯光</strong><span>{connected?'已连接':'连接中'}</span></div>
  <div className="mode-buttons"><button disabled={!connected||!ready} onClick={()=>void welcomeAction('play')}>流星雨迎宾</button><button disabled={!connected||!ready} onClick={()=>void welcomeAction(snapshot?.locked?'unlock':'lock')}>{snapshot?.locked?'解锁车辆':'锁定车辆'}</button></div>
  <label><input type="checkbox" checked={snapshot?.auto??true} disabled={!connected} onChange={e=>void welcomeAction('auto',e.target.checked)}/> 解锁自动迎宾</label>
  <p>开门时，对应车门下方亮起 SU7 迎宾投影。</p>
  <div className="mode-buttons"><button onClick={()=>useScene.getState().go('welcome')}>迎宾视角</button><button onClick={()=>useScene.getState().go('welcomeDetail')}>灯组细节</button><button onClick={()=>useScene.getState().go('puddle')}>投影视角</button></div>
  <button className="scene-light-toggle" onClick={()=>useScene.getState().go('puddleLeft')}>左侧投影视角</button>
  <button onClick={()=>{void fetch('/api/welcome/pair').then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>setRemote(`${location.origin}/remote?token=${encodeURIComponent(d.token)}`)).catch(()=>useWelcome.setState({error:'请从本机打开配对入口。'}));}}>连接遥控器</button>
  {remote&&<p><a href={remote} target="_blank" rel="noreferrer">打开独立遥控页面 ↗</a></p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
export function RemoteWelcome(){
 const {connected,snapshot,error}=useWelcome();
 return <main className="remote-welcome"><span>SU7 · 迎宾遥控</span><h1>光，迎接你的到来。</h1><p>{connected?'车辆服务已连接':'正在连接车辆服务…'}</p><button disabled={!connected} onClick={()=>void welcomeAction('play')}>流星雨迎宾</button><button disabled={!connected} onClick={()=>void welcomeAction(snapshot?.locked?'unlock':'lock')}>{snapshot?.locked?'解锁车辆':'锁定车辆'}</button><label><input type="checkbox" checked={snapshot?.auto??true} onChange={e=>void welcomeAction('auto',e.target.checked)}/> 解锁自动迎宾</label>{error&&<p role="alert">{error}</p>}<p>遥控器发送一次触发事件，车辆页面独立播放灯光。</p></main>;
}
