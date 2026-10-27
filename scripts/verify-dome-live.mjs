// Explicit real ASR + real TTS validation. Input speech is synthesized, never a human-microphone claim.
import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadProjectEnv,providerConfig} from '../apps/server/src/speech/config.ts';
import {synthesize} from '../apps/server/src/speech/providers.ts';
loadProjectEnv(process.cwd());const config=providerConfig();if(!config.asr||!config.tts)throw Error('Local ASR / TTS configuration missing');
const additional=false,stem='live-speech';
const cases=[
 {text:'打开前排主灯。',expected:[['cabinLight:front:enabled',true],['cabinLight:rear:enabled',false]]},
 {text:'关闭前排主灯。',expected:[['cabinLight:front:enabled',false]]},
 {text:'打开后排主灯。',expected:[['cabinLight:rear:enabled',true]]},
 {text:'关闭所有顶灯。',expected:[['cabinLight:front:enabled',false],['cabinLight:rear:enabled',false]]},
 {text:'打开顶灯。',clarify:true},
 {text:'后排那个。',expected:[['cabinLight:rear:enabled',true],['cabinLight:front:enabled',false]]},
];
await mkdir('.tools/i4-i6-audio',{recursive:true});await mkdir('docs/validation/dome-tail',{recursive:true});
const fixtures=[];
for(const c of cases){const file=`.tools/i4-i6-audio/${createHash('sha256').update(c.text).digest('hex').slice(0,16)}.wav`;try{await access(file);}catch{const result=await synthesize(config.tts,{text:c.text,requestId:crypto.randomUUID()});await writeFile(file,result.bytes);}
  const audio=await readFile(file),rate=audio.readUInt32LE(28),wav=Buffer.concat([audio.subarray(0,44),Buffer.alloc(Math.round(rate*.4)),audio.subarray(44),Buffer.alloc(rate*2)]);wav.writeUInt32LE(wav.length-8,4);wav.writeUInt32LE(wav.length-44,40);fixtures.push(wav.toString('base64'));
}
const report={at:new Date().toISOString(),mode:'real-api-synthetic-microphone-input',humanMicrophone:false,asr:config.asr.model,tts:config.tts.model,cases:[],requests:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']}),page=await browser.newPage({viewport:{width:1920,height:1080}});
await page.addInitScript(fixtures=>{
  let index=0;window.__vehicleLiveEvents=[];
  navigator.mediaDevices.getUserMedia=async()=>{const n=index++,ctx=new AudioContext();await ctx.resume();const dest=ctx.createMediaStreamDestination(),source=ctx.createBufferSource();source.buffer=await ctx.decodeAudioData(Uint8Array.from(atob(fixtures[n]),c=>c.charCodeAt(0)).buffer);source.connect(dest);source.start();
    for(const track of dest.stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{stop();window.__vehicleLiveEvents.push({input:n,ended:track.readyState==='ended'});source.disconnect();void ctx.close();};}return dest.stream;};
},fixtures);
page.on('response',r=>{if(r.url().includes('/api/speech/'))report.requests.push({path:new URL(r.url()).pathname,status:r.status()});});
try{
  await page.goto('http://localhost:3000');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await page.getByRole('button',{name:'新对话',exact:true}).click();
  for(const [index,c] of cases.entries()){
    await page.getByRole('button',{name:'开始录音',exact:true}).click();
    if(c.clarify){await expect(page.getByRole('group',{name:'请选择顶灯',exact:true})).toBeVisible({timeout:25000});await expect(page.getByTestId('speech-phase')).toHaveText('等待澄清',{timeout:25000});}
    else{for(const [key,value] of c.expected)await expect.poll(async()=>JSON.parse((await page.locator('canvas').getAttribute('data-vehicle-actual')))[key],{timeout:25000}).toBe(value);await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪',{timeout:25000});}
    report.cases.push({index,input:c.text,transcript:await page.getByTestId('transcript').innerText(),feedback:await page.getByTestId('console-feedback').innerText(),actual:JSON.parse((await page.locator('canvas').getAttribute('data-vehicle-actual')))});
    await writeFile(`docs/validation/dome-tail/${stem}-progress.json`,JSON.stringify(report,null,2)+'\n');
  }
  report.events=await page.evaluate(()=>window.__vehicleLiveEvents);expect(report.events).toHaveLength(cases.length);expect(report.events.every(e=>e.ended)).toBe(true);expect(report.requests.every(r=>r.status===200)).toBe(true);
  await page.getByRole('button',{name:'调试记录',exact:false}).click();const response=page.waitForResponse(r=>r.url().endsWith('/api/diagnostics')&&r.request().method()==='POST');await page.getByRole('button',{name:'保存场景诊断 JSON',exact:true}).click();const saved=await response;expect(saved.ok()).toBe(true);report.diagnostic=(await saved.json()).saved;
  await page.screenshot({path:`docs/assets/dome-tail/${additional?'live-additional':'live-all-capabilities'}.png`});report.passed=true;
}catch(e){report.error=String(e.message).slice(0,800);process.exitCode=1;}
finally{await browser.close();await writeFile(`docs/validation/dome-tail/${stem}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,requests:report.requests.length,diagnostic:report.diagnostic,error:report.error}));}
