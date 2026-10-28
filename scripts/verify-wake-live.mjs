// A synthetic microphone fixture; this is not a human wake-word acceptance.
import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {providerConfig,loadProjectEnv} from '../apps/server/src/speech/config.ts';
import {synthesize} from '../apps/server/src/speech/providers.ts';
loadProjectEnv(process.cwd());const config=providerConfig();await mkdir('.tools/i7-i9-audio',{recursive:true});
const phrases=['小爱同学','左前车窗打开百分之三十五','今天的天气很好'];const fixtures=[];
for(const [i,text]of phrases.entries()){
 const file=`.tools/i7-i9-audio/wake-cycle-${i}.wav`;let bytes;try{bytes=await readFile(file);}catch{bytes=Buffer.from((await synthesize(config.tts,{requestId:`wake-cycle-${i}`,text})).bytes);await writeFile(file,bytes);}
 const rate=bytes.readUInt32LE(28),padded=Buffer.concat([bytes.subarray(0,44),Buffer.alloc(Math.round(rate*.5)),bytes.subarray(44),Buffer.alloc(rate*2)]);padded.writeUInt32LE(padded.length-8,4);padded.writeUInt32LE(padded.length-44,40);fixtures.push(padded.toString('base64'));
}
const report={at:new Date().toISOString(),mode:'real-KWS+real-Qwen-ASR+real-DeepSeek-tools+actual-renderer+real-CosyVoice-with-synthetic-microphone',human:false,inputs:phrases,requests:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']}),page=await browser.newPage({viewport:{width:1920,height:1080}});
await page.addInitScript(fixtures=>{
 let index=0;window.__wakeStreams=[];
 navigator.mediaDevices.getUserMedia=async()=>{
  const id=index++,context=new AudioContext();await context.resume();const destination=context.createMediaStreamDestination(),source=context.createBufferSource();source.buffer=await context.decodeAudioData(Uint8Array.from(atob(fixtures[Math.min(id,2)]),c=>c.charCodeAt(0)).buffer);source.connect(destination);source.start();
  const record={id,created:Date.now(),ended:false};window.__wakeStreams.push(record);for(const track of destination.stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{stop();record.ended=track.readyState==='ended';record.stopped=Date.now();source.disconnect();void context.close();};}return destination.stream;
 };
},fixtures);
page.on('response',async r=>{if(r.url().includes('/api/assistant/')||r.url().includes('/api/speech/')){const record={path:new URL(r.url()).pathname,status:r.status()};if(r.url().endsWith('/plan')||r.url().endsWith('/finish'))try{record.body=await r.json();}catch{/* canceled */}report.requests.push(record);}});
try{
 await page.goto(process.env.DEMO_URL??'http://localhost:3000');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await page.getByRole('button',{name:'操作帮助',exact:true}).click();await page.getByRole('button',{name:'调试记录',exact:false}).click();await page.getByRole('combobox',{name:'助手路由'}).selectOption('llm');await page.getByRole('button',{name:'关闭调试记录',exact:true}).click();
 await page.getByRole('checkbox',{name:'小爱同学唤醒',exact:true}).check();await expect(page.getByTestId('wake-status')).toContainText('正在监听',{timeout:25000});
 await expect(page.getByTestId('transcript')).toContainText(/百分之三十五|35%/,{timeout:30000});await expect.poll(()=>page.locator('canvas').getAttribute('data-window-fl-openness').then(Number),{timeout:30000}).toBe(.35);
 await expect(page.getByTestId('speech-phase')).toHaveText('正在播报',{timeout:30000});report.duringSpeech=await page.evaluate(()=>window.__wakeStreams);expect(report.duringSpeech.every(s=>s.ended)).toBe(true);
 await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪',{timeout:30000});await expect(page.getByTestId('wake-status')).toContainText('正在监听',{timeout:10000});await page.waitForTimeout(7000);
 report.streams=await page.evaluate(()=>window.__wakeStreams);expect(report.streams).toHaveLength(3);expect(report.requests.filter(r=>r.path.endsWith('/transcribe'))).toHaveLength(1);expect(report.requests.filter(r=>r.path.endsWith('/plan'))).toHaveLength(1);expect(report.requests.every(r=>r.status===200)).toBe(true);
 await page.getByRole('checkbox',{name:'小爱同学唤醒',exact:true}).uncheck();await expect(page.getByTestId('wake-status')).toContainText('已关闭');await expect.poll(()=>page.evaluate(()=>window.__wakeStreams.every(s=>s.ended))).toBe(true);
 await expect.poll(async()=>page.request.get((process.env.DEMO_URL??'http://localhost:3000')+'/api/wake/status').then(r=>r.json()).then(j=>j.connections)).toBe(0);
 report.resourcesReleased={allTracksEnded:await page.evaluate(()=>window.__wakeStreams.every(s=>s.ended)),streams:await page.evaluate(()=>window.__wakeStreams),connections:(await page.request.get((process.env.DEMO_URL??'http://localhost:3000')+'/api/wake/status').then(r=>r.json())).connections};report.feedback=await page.getByTestId('console-feedback').innerText();report.actual=JSON.parse(await page.locator('canvas').getAttribute('data-vehicle-actual'));await page.screenshot({path:'docs/assets/i7-i9/wake-live-fixed.png'});report.passed=true;
}catch(error){report.error=String(error.message).slice(0,1500);report.streams=await page.evaluate(()=>window.__wakeStreams);process.exitCode=1;}
finally{await browser.close();await writeFile('docs/validation/i7-i9/wake-cycle-fixed-audio.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,requests:report.requests.length,streams:report.streams,error:report.error}));}
