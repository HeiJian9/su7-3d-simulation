import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const url=process.env.DEMO_URL??'http://localhost:3000';
const report={at:new Date().toISOString(),mode:'real-DeepSeek-assistant-chat+real-CosyVoice-playback',human:false,passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']}),page=await browser.newPage();
try{
 await page.goto(url);await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await page.getByRole('button',{name:'操作帮助',exact:true}).click();await page.getByRole('button',{name:'调试记录',exact:false}).click();await page.getByRole('combobox',{name:'助手路由'}).selectOption('llm');await page.getByRole('button',{name:'关闭调试记录',exact:true}).click();
 const completed=page.waitForResponse(r=>r.url().endsWith('/api/assistant/finish'));await page.getByRole('textbox',{name:'车辆文字指令'}).fill('你有什么功能？');await page.getByRole('button',{name:'发送',exact:false}).click();const final=await completed;expect(final.ok()).toBe(true);report.reply=(await final.json()).text;expect(report.reply.length).toBeLessThanOrEqual(90);await expect(page.getByTestId('speech-phase')).toHaveText('正在播报',{timeout:35000});await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪',{timeout:60000});
 report.currentState=JSON.parse(await page.locator('canvas').getAttribute('data-vehicle-state'));expect(report.currentState.revision).toBe(0);
 const diagnostic=JSON.parse(await readFile('docs/validation/scene-diagnostics-2026-10-28T05-39-11-376Z.json','utf8'));const old=diagnostic.voice.traces.filter(t=>t.stage==='assistant-feedback').at(-1).detail;
 const started=Date.now();const response=await page.request.post(url+'/api/speech/synthesize',{data:{requestId:crypto.randomUUID(),text:old},timeout:30000});expect(response.ok()).toBe(true);const bytes=await response.body();report.longReply={characters:old.length,elapsedMs:Date.now()-started,bytes:bytes.length,contentType:response.headers()['content-type']};
 report.longReply.playback=await page.evaluate(async({base64,type})=>{const blob=new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type}),url=URL.createObjectURL(blob),audio=new Audio(url);try{return await new Promise((resolve,reject)=>{audio.onended=()=>resolve({ended:true,durationSeconds:audio.duration});audio.onerror=()=>reject(Error('Audio playback failed'));audio.play().catch(reject);});}finally{URL.revokeObjectURL(url);}},{base64:bytes.toString('base64'),type:report.longReply.contentType});
 report.passed=true;
}catch(error){report.error=String(error.message).slice(0,1200);process.exitCode=1;}
finally{await browser.close();await writeFile('docs/validation/i7-i9/assistant-chat-tts.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
