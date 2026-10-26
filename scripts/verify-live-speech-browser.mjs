// Explicit live API smoke test with synthetic microphone input, never human-mic evidence.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const source=await readFile('.tools/provider-probe/tts.wav');
const rate=source.readUInt32LE(24),byteRate=source.readUInt32LE(28);
const wave=Buffer.concat([source,Buffer.alloc(byteRate*2)]);
wave.writeUInt32LE(wave.length-8,4);wave.writeUInt32LE(wave.length-44,40);
const input=path.resolve('.tools/provider-probe/browser-input.wav');await writeFile(input,wave);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${input}`]});
const page=await browser.newPage({permissions:['microphone'],viewport:{width:1920,height:1080}});
const report={at:new Date().toISOString(),mode:'real-api-with-synthesized-microphone',humanMicrophone:false,inputSampleRate:rate,passed:false,transcript:'',asrModel:'',ttsModel:'',poses:{},requests:[]};
page.on('response',response=>{if(response.url().includes('/api/speech/'))report.requests.push({endpoint:new URL(response.url()).pathname,status:response.status()});});
try{
  await page.goto('http://localhost:3000');
  const h=await(await page.request.get('http://localhost:3000/api/health')).json();report.asrModel=h.providers.asr.model;report.ttsModel=h.providers.tts.model;
  if(!h.providers.asr.configured||!h.providers.tts.configured)throw Error('Providers not configured');
  await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'开始录音',exact:true}).click();
  await expect(page.getByTestId('transcript')).toContainText('左前',{timeout:30000});
  await expect(page.locator('canvas')).toHaveAttribute('data-window-fl-openness','0.5000',{timeout:12000});
  await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪',{timeout:20000});
  report.transcript=await page.getByTestId('transcript').innerText();
  for(const c of ['fl','fr','rl','rr'])report.poses[c]=Number(await page.locator('canvas').getAttribute(`data-window-${c}-openness`));
  expect(report.requests).toEqual([{endpoint:'/api/speech/transcribe',status:200},{endpoint:'/api/speech/synthesize',status:200}]);
  expect(report.poses).toEqual({fl:.5,fr:0,rl:0,rr:0});
  await page.getByRole('button',{name:'调试记录',exact:false}).click();
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/diagnostics')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'保存场景诊断 JSON',exact:true}).click();expect((await saved).ok()).toBe(true);
  await page.getByRole('button',{name:'关闭调试记录',exact:true}).click();await page.getByRole('button',{name:'左方视角',exact:true}).click();
  await mkdir('docs/assets/aliyun',{recursive:true});await page.screenshot({path:'docs/assets/aliyun/real-api-synthesized-loop.png'});report.passed=true;
}catch(error){report.error=String(error.message).slice(0,500);process.exitCode=1;}
finally{await browser.close();await writeFile('docs/validation/aliyun/live-browser-synthesized.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
