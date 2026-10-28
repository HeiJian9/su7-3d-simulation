// Real services with synthetic microphone inputs. No transcript is injected.
import {chromium,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {loadProjectEnv,providerConfig} from '../apps/server/src/speech/config.ts';
import {synthesize} from '../apps/server/src/speech/providers.ts';
loadProjectEnv(process.cwd());const config=providerConfig();await mkdir('.tools/i7-i9-audio',{recursive:true});
const cases=[
 {text:'左前车窗打开百分之三十五，右前车窗打开百分之四十五，左后车窗打开一半，右后车窗打开一半。',expected:[['window:fl:openness',.35],['window:fr:openness',.45],['window:rl:openness',.5],['window:rr:openness',.5]]},
 {text:'四个车门打开一半。',expected:['fl','fr','rl','rr'].map(t=>[`door:${t}:openness`,.5])},
 {text:'前备箱开到三成，同时后备箱开一半。',expected:[['frunk:front:openness',.3],['trunk:rear:openness',.5]]},
 {text:'打开近光灯，前灯亮度设为百分之四十。',expected:[['headlights:front:mode','low'],['headlights:front:brightness',.4]]},
 {text:'打开左转向灯。',expected:[['turnSignal:vehicle:mode','left']]},
 {text:'打开右转向灯。',expected:[['turnSignal:vehicle:mode','right']]},
 {text:'打开双闪。',expected:[['turnSignal:vehicle:mode','hazard']]},
 {text:'打开前后排顶灯，亮度都设为百分之四十。',expected:[['cabinLight:front:enabled',true],['cabinLight:rear:enabled',true],['cabinLight:front:brightness',.4],['cabinLight:rear:brightness',.4]]},
 {text:'打开氛围灯。',expected:[['ambient:cabin:enabled',true]]},
 {text:'换成蓝色。',color:['ambient:cabin:color','blue']},
 {text:'再暗一点。',expected:[['ambient:cabin:brightness',.3]]},
 {text:'车漆换成红色。',color:['paint:body:color','red']},
 {text:'打开雨刷。',expected:[['wiper:front:mode','low']]},
 {text:'再快一档。',expected:[['wiper:front:mode','high']]},
 {text:'关掉。',expected:[['wiper:front:mode','off']]},
 {text:'雨刷刮一下。',expected:[['wiper:front:swipe',1]]},
 {text:'打开空调。',kind:'unsupported',noChange:true},
 {text:'那个，嗯啊。',kind:'not_understood',noChange:true},
];
const fixtures=[];for(const c of cases){const file=`.tools/i7-i9-audio/${createHash('sha256').update(c.text).digest('hex').slice(0,16)}.wav`;let b;try{b=await readFile(file);}catch{b=Buffer.from((await synthesize(config.tts,{text:c.text,requestId:crypto.randomUUID()})).bytes);await writeFile(file,b);}const rate=b.readUInt32LE(28),wav=Buffer.concat([b.subarray(0,44),Buffer.alloc(Math.round(rate*.4)),b.subarray(44),Buffer.alloc(rate*2)]);wav.writeUInt32LE(wav.length-8,4);wav.writeUInt32LE(wav.length-44,40);fixtures.push(wav.toString('base64'));}
const report={at:new Date().toISOString(),mode:'real-Qwen-ASR+DeepSeek-tools+actual-renderer+CosyVoice-with-synthetic-microphone',human:false,cases:[],requests:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']}),page=await browser.newPage({viewport:{width:1920,height:1080}});let plans=[],finishes=[];
await page.addInitScript(fixtures=>{
 let index=0;window.__speechEvidence={streams:[],plays:[]};const originalPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){const entry={started:Date.now(),ended:false};window.__speechEvidence.plays.push(entry);this.addEventListener('ended',()=>{entry.ended=true;entry.finished=Date.now();},{once:true});return originalPlay.call(this);};
 navigator.mediaDevices.getUserMedia=async()=>{const id=index++,context=new AudioContext();await context.resume();const destination=context.createMediaStreamDestination(),source=context.createBufferSource();source.buffer=await context.decodeAudioData(Uint8Array.from(atob(fixtures[id]),c=>c.charCodeAt(0)).buffer);source.connect(destination);source.start();const record={id,ended:false};window.__speechEvidence.streams.push(record);for(const t of destination.stream.getTracks()){const stop=t.stop.bind(t);t.stop=()=>{stop();record.ended=t.readyState==='ended';source.disconnect();void context.close();};}return destination.stream;};
},fixtures);
page.on('response',async r=>{if(r.url().includes('/api/speech/')||r.url().includes('/api/assistant/')){const row={path:new URL(r.url()).pathname,status:r.status()};report.requests.push(row);try{if(r.url().endsWith('/plan'))plans.push(await r.json());if(r.url().endsWith('/finish'))finishes.push(await r.json());}catch{/* interrupted */}}});
const actual=async()=>JSON.parse(await page.locator('canvas').getAttribute('data-vehicle-actual'));
try{
 await page.goto(process.env.DEMO_URL??'http://localhost:3000');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await page.getByRole('button',{name:'调试记录',exact:false}).click();await page.getByRole('combobox',{name:'助手路由'}).selectOption('llm');await page.getByRole('button',{name:'关闭调试记录',exact:true}).click();
 for(const [index,c]of cases.entries()){
  plans=[];finishes=[];const before=await actual(),started=Date.now(),playCount=await page.evaluate(()=>window.__speechEvidence.plays.length);await page.getByRole('button',{name:'开始录音',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__speechEvidence.plays.length),{timeout:60000}).toBeGreaterThan(playCount);await expect.poll(()=>page.evaluate(()=>window.__speechEvidence.plays.at(-1)?.ended),{timeout:30000}).toBe(true);
  const after=await actual();for(const [key,value]of c.expected??[])expect(after[key]).toBe(value);if(c.noChange)expect(after).toEqual(before);
  if(c.color){const value=after[c.color[0]],r=parseInt(value.slice(1,3),16),g=parseInt(value.slice(3,5),16),b=parseInt(value.slice(5,7),16);expect(c.color[1]==='blue'?b>r&&b>g:r>g&&r>b).toBe(true);}
  const feedback=await page.getByTestId('console-feedback').innerText();if(c.kind==='unsupported')expect(feedback).toBe('暂不支持该功能。');if(c.kind==='not_understood')expect(feedback).toBe('我没听清，请再说一遍。');
  if(c.kind!=='not_understood'){expect(plans).toHaveLength(1);expect(finishes).toHaveLength(1);expect(plans[0].calls.length).toBeGreaterThan(0);}
  report.cases.push({index,input:c.text,transcript:await page.getByTestId('transcript').innerText().catch(()=>''),feedback,plans,finishes,actual:after,elapsedMs:Date.now()-started,passed:true});await writeFile('docs/validation/i7-i9/live-speech-progress.json',JSON.stringify(report,null,2)+'\n');console.log(`${index+1}/${cases.length} ${c.text}`);
 }
 report.resources=await page.evaluate(()=>window.__speechEvidence);expect(report.resources.streams.every(s=>s.ended)).toBe(true);expect(report.resources.plays.every(p=>p.ended)).toBe(true);
 await page.getByRole('button',{name:'调试记录',exact:false}).click();const saved=page.waitForResponse(r=>r.url().endsWith('/api/diagnostics')&&r.request().method()==='POST');await page.getByRole('button',{name:'保存场景诊断 JSON',exact:true}).click();const response=await saved;expect(response.ok()).toBe(true);report.diagnostic=(await response.json()).saved;await page.screenshot({path:'docs/assets/i7-i9/live-speech-all.png'});report.passed=true;
}catch(error){report.error=String(error.message).slice(0,2000);report.failed={plans,finishes,actual:await actual(),feedback:await page.getByTestId('console-feedback').innerText()};process.exitCode=1;}
finally{await browser.close();await writeFile('docs/validation/i7-i9/live-speech.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,error:report.error}));}
