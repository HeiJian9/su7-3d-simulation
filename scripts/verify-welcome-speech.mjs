// Real services with synthetic microphone inputs. No transcript is injected.
import {chromium,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {loadProjectEnv,providerConfig} from '../apps/server/src/speech/config.ts';
import {synthesize} from '../apps/server/src/speech/providers.ts';
loadProjectEnv(process.cwd());const config=providerConfig();await mkdir('.tools/welcome-audio',{recursive:true});await mkdir('docs/validation/welcome-correction',{recursive:true});
const cases=[
 {text:'打开流星雨大灯。',expected:[['welcomeRain:front:enabled',true]]},
 {text:'流星雨亮度设为百分之四十。',expected:[['welcomeRain:front:brightness',.4]]},
 {text:'再暗一点。',expected:[['welcomeRain:front:brightness',.3]]},
 {text:'查询流星雨亮度。',expected:[['welcomeRain:front:brightness',.3]]},
 {text:'查询流星雨开关。',expected:[['welcomeRain:front:enabled',true]]},
 {text:'关闭流星雨。',expected:[['welcomeRain:front:enabled',false]]},
];
const fixtures=[];for(const c of cases){const file=`.tools/welcome-audio/${createHash('sha256').update(c.text).digest('hex').slice(0,16)}.wav`;let b;try{b=await readFile(file);}catch{b=Buffer.from((await synthesize(config.tts,{text:c.text,requestId:crypto.randomUUID()})).bytes);await writeFile(file,b);}const rate=b.readUInt32LE(28),wav=Buffer.concat([b.subarray(0,44),Buffer.alloc(Math.round(rate*.4)),b.subarray(44),Buffer.alloc(rate*2)]);wav.writeUInt32LE(wav.length-8,4);wav.writeUInt32LE(wav.length-44,40);fixtures.push(wav.toString('base64'));}
const report={at:new Date().toISOString(),mode:'real-Qwen-ASR+DeepSeek-tools+actual-renderer+CosyVoice-with-synthetic-microphone',human:false,cases:[],requests:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']}),page=await browser.newPage({viewport:{width:1920,height:1080}});let plans=[],finishes=[],receipts=[];
await page.addInitScript(fixtures=>{
 let index=0;window.__speechEvidence={streams:[],plays:[]};const originalPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){const entry={started:Date.now(),ended:false};window.__speechEvidence.plays.push(entry);this.addEventListener('ended',()=>{entry.ended=true;entry.finished=Date.now();},{once:true});return originalPlay.call(this);};
 navigator.mediaDevices.getUserMedia=async()=>{const id=index++,context=new AudioContext();await context.resume();const destination=context.createMediaStreamDestination(),source=context.createBufferSource();source.buffer=await context.decodeAudioData(Uint8Array.from(atob(fixtures[id]),c=>c.charCodeAt(0)).buffer);source.connect(destination);source.start();const record={id,ended:false};window.__speechEvidence.streams.push(record);for(const t of destination.stream.getTracks()){const stop=t.stop.bind(t);t.stop=()=>{stop();record.ended=t.readyState==='ended';source.disconnect();void context.close();};}return destination.stream;};
},fixtures);
page.on('response',async r=>{if(r.url().includes('/api/speech/')||r.url().includes('/api/assistant/')){const row={path:new URL(r.url()).pathname,status:r.status()};report.requests.push(row);try{if(r.url().endsWith('/plan'))plans.push(await r.json());if(r.url().endsWith('/finish'))finishes.push(await r.json());}catch{/* interrupted */}}});
page.on('request',r=>{if(r.url().endsWith('/api/assistant/finish'))receipts.push(r.postDataJSON());});
const actual=async()=>JSON.parse(await page.locator('canvas').getAttribute('data-vehicle-actual'));
try{
 await page.goto(process.env.DEMO_URL??'http://localhost:3000');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('button',{name:'操作帮助',exact:true}).click();await page.getByRole('button',{name:'调试记录',exact:false}).click();await page.getByRole('combobox',{name:'助手路由'}).selectOption('llm');await page.getByRole('button',{name:'关闭调试记录',exact:true}).click();
 for(const [index,c]of cases.entries()){
  plans=[];finishes=[];receipts=[];const before=await actual(),started=Date.now(),playCount=await page.evaluate(()=>window.__speechEvidence.plays.length);await page.getByRole('button',{name:'开始录音',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__speechEvidence.plays.length),{timeout:60000}).toBeGreaterThan(playCount);await expect.poll(()=>page.evaluate(()=>window.__speechEvidence.plays.at(-1)?.ended),{timeout:30000}).toBe(true);
  expect(receipts[0].results.map(r=>r.tool_call_id)).toEqual(plans[0].calls.map(c=>c.id));expect(receipts[0].results.every(r=>r.status==='completed')).toBe(true);
  const after=await actual();for(const [key,value]of c.expected??[])expect(after[key]).toBe(value);if(c.noChange)expect(after).toEqual(before);
  if(c.color){const value=after[c.color[0]],r=parseInt(value.slice(1,3),16),g=parseInt(value.slice(3,5),16),b=parseInt(value.slice(5,7),16);expect(c.color[1]==='blue'?b>r&&b>g:r>g&&r>b).toBe(true);}
  const feedback=await page.getByTestId('console-feedback').innerText();if(c.kind==='unsupported')expect(feedback).toBe('暂不支持该功能。');if(c.kind==='not_understood')expect(feedback).toBe('我没听清，请再说一遍。');
  if(c.kind!=='not_understood'){expect(plans).toHaveLength(1);expect(finishes).toHaveLength(1);expect(plans[0].calls.length).toBeGreaterThan(0);}
  report.cases.push({index,input:c.text,transcript:await page.getByTestId('transcript').innerText().catch(()=>''),feedback,plans,receipts,finishes,actual:after,welcome:JSON.parse(await page.locator('canvas').getAttribute('data-welcome')),elapsedMs:Date.now()-started,passed:true});await writeFile('docs/validation/welcome-correction/live-speech-progress.json',JSON.stringify(report,null,2)+'\n');console.log(`${index+1}/${cases.length} ${c.text}`);
 }
 report.resources=await page.evaluate(()=>window.__speechEvidence);expect(report.resources.streams.every(s=>s.ended)).toBe(true);expect(report.resources.plays.every(p=>p.ended)).toBe(true);
 await page.getByRole('button',{name:'操作帮助',exact:true}).click();await page.getByRole('button',{name:'调试记录',exact:false}).click();const saved=page.waitForResponse(r=>r.url().endsWith('/api/diagnostics')&&r.request().method()==='POST');await page.getByRole('button',{name:'保存场景诊断 JSON',exact:true}).click();const response=await saved;expect(response.ok()).toBe(true);report.diagnostic=(await response.json()).saved;await page.screenshot({path:'docs/assets/welcome-correction/live-speech-all.png'});report.passed=true;
}catch(error){report.error=String(error.message).slice(0,2000);report.failed={plans,finishes,actual:await actual(),feedback:await page.getByTestId('console-feedback').innerText()};process.exitCode=1;}
finally{await browser.close();await writeFile('docs/validation/welcome-correction/live-speech.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,error:report.error}));}
