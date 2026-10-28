import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {loadProjectEnv,providerConfig} from '../apps/server/src/speech/config.ts';
import {synthesize} from '../apps/server/src/speech/providers.ts';
loadProjectEnv(process.cwd());const config=providerConfig(),folder='.tools/i7-i9-audio';await mkdir(folder,{recursive:true});
const phrases=['小爱同学','小爱同学','打开左前车窗','我今天想去学校','小王同学','小爱同学，请打开车窗'];
const fixture=[];for(const [i,text]of phrases.entries()){
 const filename=`${folder}/wake-${i}.wav`;let bytes;try{bytes=await readFile(filename);}catch{const audio=await synthesize(config.tts,{requestId:`wake-fixture-${i}`,text});bytes=Buffer.from(audio.bytes);await writeFile(filename,bytes);}fixture.push({text,base64:bytes.toString('base64')});
}
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.DEMO_URL??'http://localhost:3000');
const report=await page.evaluate(async(fixtures)=>{
 const worker=new Worker('/audio/wake-worker.js');const events=[];worker.onmessage=e=>events.push(e.data);worker.onerror=e=>events.push({type:'fatal',message:e.message});worker.postMessage({type:'init'});
 const wait=async(test,ms=30000)=>{const start=performance.now();while(!test()){if(performance.now()-start>ms)throw Error(JSON.stringify(events));await new Promise(r=>setTimeout(r,20));}};
 await wait(()=>events.some(e=>e.type==='ready'||e.type==='error'||e.type==='fatal'));if(!events.some(e=>e.type==='ready'))return {events,passed:false};
 const outputs=[];for(const f of fixtures){
  worker.postMessage({type:'reset'});const ac=new OfflineAudioContext(1,16000,16000);const decoded=await ac.decodeAudioData(Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0)).buffer);const context=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000),source=context.createBufferSource();source.buffer=decoded;source.connect(context.destination);source.start();const pcm=(await context.startRendering()).getChannelData(0);
  const start=events.length;for(let at=0;at<pcm.length+16000;at+=1600){const samples=new Float32Array(1600);samples.set(pcm.subarray(at,Math.min(at+1600,pcm.length)));const count=events.filter(e=>e.type==='metrics').length;worker.postMessage({type:'samples',samples:samples.buffer},[samples.buffer]);await wait(()=>events.filter(e=>e.type==='metrics').length>count);}
  await wait(()=>events.slice(start).filter(e=>e.type==='metrics').length>=Math.ceil((pcm.length+16000)/1600));outputs.push({text:f.text,seconds:pcm.length/16000,keywords:events.slice(start).filter(e=>e.type==='keyword'),metrics:events.at(-1)});
 }
 worker.terminate();return {outputs,workerTerminated:true,passed:outputs.slice(0,2).every(r=>r.keywords.length===1)&&outputs.slice(2,5).every(r=>r.keywords.length===0)};
},fixture);
await browser.close();const result={at:new Date().toISOString(),mode:'real-local-kws-model+real-CosyVoice-fixed-input',human:false,errors,...report};await mkdir('docs/validation/i7-i9',{recursive:true});await writeFile('docs/validation/i7-i9/wake-fixed-audio.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(!report.passed||errors.length)process.exitCode=1;
