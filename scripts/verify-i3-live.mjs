// Explicit live ASR/TTS validation. The microphone source is synthetic; human evidence is separate.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { loadProjectEnv, providerConfig } from '../apps/server/src/speech/config.ts';
import { synthesize } from '../apps/server/src/speech/providers.ts';

loadProjectEnv(process.cwd());const config=providerConfig();
if(!config.asr||!config.tts)throw Error('ASR/TTS must be configured locally');
await mkdir('.tools/i3-final',{recursive:true});await mkdir('docs/validation/i3-final',{recursive:true});await mkdir('docs/assets/i3-final',{recursive:true});
const phrases=['打开车窗。','左后那个。','右前车窗打开一半。','关闭右后方车窗。'];const fixtures=[];
for(const [i,text] of phrases.entries()){
  const file=`.tools/i3-final/input-${i}.wav`;
  try{await access(file);}catch{const result=await synthesize(config.tts,{text,requestId:`i3-fixture-${crypto.randomUUID()}`});await writeFile(file,result.bytes);}
  const audio=await readFile(file),byteRate=audio.readUInt32LE(28);
  const wav=Buffer.concat([audio.subarray(0,44),Buffer.alloc(Math.round(byteRate*.4)),audio.subarray(44),Buffer.alloc(byteRate*2)]);
  wav.writeUInt32LE(wav.length-8,4);wav.writeUInt32LE(wav.length-44,40);fixtures.push(wav.toString('base64'));
}
const report={at:new Date().toISOString(),mode:'real-api-synthetic-audio',humanMicrophone:false,passed:false,asrModel:config.asr.model,ttsModel:config.tts.model,phrases,requests:[],events:[],poses:{},diagnostic:''};
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});
await page.addInitScript(fixtures=>{
  const events=[];window.__i3Events=events;let index=0;
  const play=HTMLMediaElement.prototype.play,pause=HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play=function(){this.addEventListener('playing',()=>events.push({kind:'playing',time:performance.now()}),{once:true});return play.call(this);};
  HTMLMediaElement.prototype.pause=function(){const wasPlaying=!this.paused&&!this.ended;pause.call(this);events.push({kind:'pause',wasPlaying,time:performance.now()});};
  navigator.mediaDevices.getUserMedia=async()=>{
    const n=index++;events.push({kind:'get-media',index:n,time:performance.now()});
    const ctx=new AudioContext();await ctx.resume();const dest=ctx.createMediaStreamDestination(),source=ctx.createBufferSource();
    source.buffer=fixtures[n]?await ctx.decodeAudioData(Uint8Array.from(atob(fixtures[n]),c=>c.charCodeAt(0)).buffer):ctx.createBuffer(1,ctx.sampleRate*6,ctx.sampleRate);
    source.connect(dest);source.start();
    for(const track of dest.stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{stop();events.push({kind:'track-ended',index:n,ended:track.readyState==='ended',time:performance.now()});source.disconnect();void ctx.close();};}
    return dest.stream;
  };
},fixtures);
page.on('response',r=>{if(r.url().includes('/api/speech/'))report.requests.push({endpoint:new URL(r.url()).pathname,status:r.status()});});
const mic=()=>page.getByRole('button',{name:'开始录音',exact:true});
const poses=async()=>{const value={};for(const c of ['fl','fr','rl','rr'])value[c]=Number(await page.locator('canvas').getAttribute(`data-window-${c}-openness`));return value;};
async function waitPlaying(n){await expect.poll(()=>page.evaluate(()=>window.__i3Events.filter(e=>e.kind==='playing').length)).toBe(n);await page.waitForTimeout(120);}
try{
  await page.goto('http://localhost:3000');await expect(mic()).toBeEnabled();
  // A bulk action must not make the following ambiguous utterance implicitly target all four.
  await page.getByRole('button',{name:'全部关闭',exact:true}).click();await mic().click();
  await expect(page.getByRole('group',{name:'请选择车窗'})).toBeVisible({timeout:20000});await waitPlaying(1);expect(await poses()).toEqual({fl:0,fr:0,rl:0,rr:0});
  await page.screenshot({path:'docs/assets/i3-final/live-clarification.png'});
  await mic().click();await expect.poll(async()=>(await poses()).rl,{timeout:20000}).toBe(1);await waitPlaying(2);
  await mic().click();await expect.poll(async()=>(await poses()).fr,{timeout:20000}).toBe(.5);
  await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪',{timeout:20000});
  // Reproduce the additional direction wording found in the user's physical-microphone log.
  await page.getByRole('button',{name:'完全打开右后车窗',exact:true}).click();await expect.poll(async()=>(await poses()).rr).toBe(1);
  await mic().click();await expect.poll(async()=>(await poses()).rr,{timeout:20000}).toBe(0);await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪',{timeout:20000});
  report.poses=await poses();expect(report.poses).toEqual({fl:0,fr:.5,rl:1,rr:0});
  await mic().click();await expect(page.getByTestId('speech-phase')).toContainText('正在录音');await page.getByRole('button',{name:'取消语音',exact:true}).click();
  report.events=await page.evaluate(()=>window.__i3Events);
  const realStops=report.events.filter(e=>e.kind==='pause'&&e.wasPlaying);expect(realStops).toHaveLength(2);
  for(const n of [1,2]){const capture=report.events.find(e=>e.kind==='get-media'&&e.index===n),stop=realStops[n-1];expect(capture.time-stop.time).toBeGreaterThanOrEqual(170);}
  expect(report.events.filter(e=>e.kind==='track-ended'&&e.ended)).toHaveLength(5);
  expect(report.requests.filter(r=>r.endpoint.endsWith('/transcribe'))).toHaveLength(4);expect(report.requests.every(r=>r.status===200)).toBe(true);
  await page.getByRole('button',{name:'操作帮助',exact:true}).click();await page.getByRole('button',{name:'调试记录',exact:false}).click();const saved=page.waitForResponse(r=>r.url().endsWith('/api/diagnostics')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'保存场景诊断 JSON',exact:true}).click();const response=await saved;expect(response.ok()).toBe(true);report.diagnostic=(await response.json()).saved;
  await page.getByRole('button',{name:'关闭调试记录',exact:true}).click();await page.screenshot({path:'docs/assets/i3-final/live-interruption-result.png'});report.passed=true;
}catch(error){report.error=String(error.message).slice(0,600);process.exitCode=1;}
finally{await browser.close();await writeFile('docs/validation/i3-final/live-advanced.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,poses:report.poses,requests:report.requests,diagnostic:report.diagnostic,error:report.error}));}
