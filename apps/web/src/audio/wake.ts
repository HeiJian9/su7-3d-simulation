import {create} from 'zustand';
import {speechCoordinator,useSpeech} from '../speech';

export const useWake=create<{enabled:boolean;status:'off'|'loading'|'listening'|'paused'|'awake'|'error';message:string;detections:number;audioSeconds:number;decodeMs:number;rssBytes:number;rms:number;events:Array<{time:string;stage:string;detail:string}>}>(()=>({enabled:false,status:'off',message:'唤醒已关闭',detections:0,audioSeconds:0,decodeMs:0,rssBytes:0,rms:0,events:[]}));
export class WakeListener{
 private generation=0;private worker?:Worker;private stream?:MediaStream;private context?:AudioContext;private source?:MediaStreamAudioSourceNode;private worklet?:AudioWorkletNode;
 private unsubscribe?:()=>void;private resumeTimer?:ReturnType<typeof setTimeout>;private loadTimer?:ReturnType<typeof setTimeout>;private active=false;private samples:number[]=[];private busy=false;
 private visibility=()=>{if(!useWake.getState().enabled)return;if(document.hidden){this.releaseCapture();this.worker?.postMessage({type:'reset'});useWake.setState({status:'paused',message:'页面隐藏，唤醒已暂停'});}else if(!this.busy)void this.capture(this.generation);};
 constructor(){document.addEventListener('visibilitychange',this.visibility);window.addEventListener('pagehide',this.pagehide);}
 private pagehide=()=>this.disable();
 private record(stage:string,detail:string){useWake.setState(s=>({events:[...s.events.slice(-99),{time:new Date().toISOString(),stage,detail}]}));}
 async enable(){
  this.disable();const generation=this.generation;useWake.setState({enabled:true,status:'loading',message:'加载本地中文唤醒模型…'});
  this.worker=new Worker('/audio/wake-worker.js');this.loadTimer=setTimeout(()=>this.failure(generation,'本地唤醒服务加载超时，请重试。'),20000);
  this.worker.onerror=()=>this.failure(generation,'本地关键词引擎启动失败，请重试。');
  this.worker.onmessage=({data})=>{
   if(generation!==this.generation)return;
   if(data.type==='ready'){this.record('engine-ready','真实本地KWS模型已加载');clearTimeout(this.loadTimer);this.unsubscribe=useSpeech.subscribe(()=>this.sync(generation));this.sync(generation);}
   else if(data.type==='keyword'&&this.active&&this.canListen())void this.woken(generation);
   else if(data.type==='error'){this.record('error',`${data.code??''} ${data.reason??''} ${data.message}`);this.failure(generation,data.message);}
   else if(data.type==='metrics')useWake.setState({audioSeconds:data.audioSeconds,decodeMs:data.decodeMs,rssBytes:data.rssBytes});
  };
  this.worker.postMessage({type:'init'});this.record('enabled','用户主动开启本地关键词监听');
 }
 private canListen(){return !document.hidden&&['idle','clarifying','error'].includes(useSpeech.getState().phase);}
 private sync(generation:number){
  if(generation!==this.generation||!useWake.getState().enabled)return;
  if(!this.canListen()){
   clearTimeout(this.resumeTimer);this.resumeTimer=undefined;
   if(this.active||this.stream||this.context){this.releaseCapture();this.worker?.postMessage({type:'reset'});}
   if(useWake.getState().status!=='paused')useWake.setState({status:'paused',message:'指令或播报期间暂停唤醒'});
  }else if(!this.busy&&!this.active&&!this.resumeTimer){
   // Echo tail settling follows real playback completion. It never triggers a wake.
   this.resumeTimer=setTimeout(()=>{this.resumeTimer=undefined;if(generation===this.generation&&this.canListen())void this.capture(generation);},650);
  }
 }
 private async capture(generation:number){
  if(generation!==this.generation||!this.canListen()||this.active||this.busy)return;
  this.busy=true;
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   if(generation!==this.generation||!this.canListen()){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;const context=new AudioContext({sampleRate:16000});this.context=context;await context.resume();await context.audioWorklet.addModule('/audio/pcm-capture.worklet.js');
   if(generation!==this.generation||!this.canListen()||this.context!==context){stream.getTracks().forEach(t=>t.stop());if(context.state!=='closed')await context.close();return;}
   this.source=context.createMediaStreamSource(stream);this.worklet=new AudioWorkletNode(context,'su7-pcm-capture');
   this.worklet.port.onmessage=({data}:MessageEvent<Float32Array>)=>{
    if(!this.active||!this.canListen()||generation!==this.generation)return;
    // The AudioContext requests 16 kHz; explicitly resample if a device ignores it.
    const ratio=context.sampleRate/16000;for(let i=0;i<Math.floor(data.length/ratio);i++)this.samples.push(Math.max(-1,Math.min(1,data[Math.floor(i*ratio)])));
    if(this.samples.length>=1600){const chunk=Float32Array.from(this.samples);const rms=Math.sqrt(chunk.reduce((sum,n)=>sum+n*n,0)/chunk.length);useWake.setState({rms:Math.min(1,rms)});this.samples=[];this.worker?.postMessage({type:'samples',samples:chunk.buffer},[chunk.buffer]);}
   };
   this.source.connect(this.worklet);const mute=context.createGain();mute.gain.value=0;this.worklet.connect(mute).connect(context.destination);
   this.active=true;this.record('listening','关键词采集已连接；仅等待小爱同学');useWake.setState({status:'listening',message:'正在本地监听“小爱同学” · 唤醒后等提示再说指令'});
  }catch{if(generation===this.generation)this.failure(generation,'无法监听麦克风，请检查权限或设备后重试。');}
  finally{this.busy=false;if(generation===this.generation&&useWake.getState().enabled&&!this.active&&this.canListen())this.sync(generation);}
 }
 private async woken(generation:number){
  this.record('keyword-detected','真实本地KWS返回小爱同学');this.releaseCapture();useWake.setState(s=>({status:'awake',message:'我在，请等录音开始后说指令。',detections:s.detections+1}));
  this.worker?.postMessage({type:'reset'});
  // An audible cue is generated locally, with keyword capture already released.
  const cue=new AudioContext();const oscillator=cue.createOscillator(),gain=cue.createGain();oscillator.frequency.value=880;gain.gain.value=.06;oscillator.connect(gain).connect(cue.destination);oscillator.start();oscillator.stop(cue.currentTime+.1);
  await new Promise<void>(resolve=>{oscillator.onended=()=>{void cue.close();resolve();};});
  if(generation!==this.generation)return;
  await speechCoordinator().start('wake');
 }
 private failure(generation:number,message:string){if(generation!==this.generation)return;this.disable();useWake.setState({status:'error',message});}
 private releaseCapture(){this.active=false;this.samples=[];useWake.setState({rms:0});if(this.worklet){this.worklet.port.onmessage=null;this.worklet.disconnect();this.worklet=undefined;}this.source?.disconnect();this.source=undefined;this.stream?.getTracks().forEach(t=>t.stop());this.stream=undefined;if(this.context&&this.context.state!=='closed')void this.context.close();this.context=undefined;}
 disable(){this.record('disabled','关闭关键词采集与本地连接');this.generation++;clearTimeout(this.loadTimer);clearTimeout(this.resumeTimer);this.resumeTimer=undefined;this.unsubscribe?.();this.unsubscribe=undefined;this.releaseCapture();this.worker?.terminate();this.worker=undefined;useWake.setState({enabled:false,status:'off',message:'唤醒已关闭'});}
 destroy(){this.disable();document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('pagehide',this.pagehide);}
}
let listener:WakeListener|undefined;
export const wakeListener=()=>listener??=new WakeListener();

export function destroyWakeListener(){listener?.destroy();listener=undefined;}
