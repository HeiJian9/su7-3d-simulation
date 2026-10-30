import {test,expect} from '@playwright/test';
import {testWave} from './global-setup';
import {mkdir} from 'node:fs/promises';
test.beforeEach(async({request})=>{await request.post('/api/welcome/action',{data:{requestId:crypto.randomUUID(),action:'rain',enabled:false,brightness:1}});});

test('welcome visibly projects moving ground rain and airborne trails outside the original headlamps',async({page},info)=>{
 test.setTimeout(60000);await mkdir('docs/assets/welcome-correction',{recursive:true});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();await page.getByRole('button',{name:'灯光外观',exact:true}).click();
 await page.getByRole('button',{name:'柔光展厅',exact:true}).click();await page.getByRole('button',{name:'迎宾视角',exact:true}).click();const canvas=page.locator('canvas'),off=await canvas.screenshot();
 await page.getByRole('button',{name:'流星雨迎宾',exact:true}).click();await expect.poll(()=>canvas.getAttribute('data-welcome-rain').then(s=>s&&JSON.parse(s).active)).toBe(true);await page.waitForTimeout(650);
 const first=JSON.parse((await canvas.getAttribute('data-welcome-rain'))!),on=await canvas.screenshot();expect(first.airParticles).toBe(84);expect(first.groundProjectors).toBe(2);
 await page.screenshot({path:`docs/assets/welcome-correction/road-rain-${info.project.name}.png`});await page.waitForTimeout(450);const second=JSON.parse((await canvas.getAttribute('data-welcome-rain'))!);expect(second.samples[0].position).not.toEqual(first.samples[0].position);
 const pixels=await page.evaluate(async({on,off})=>{
  const decode=async(s:string)=>{const b=await createImageBitmap(new Blob([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],{type:'image/png'}));const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d')!;x.drawImage(b,0,0);b.close();return x.getImageData(0,0,c.width,c.height);};const a=await decode(on),b=await decode(off);let bright=0;
  for(let y=0;y<a.height*.94;y++)for(let x=a.width*.25|0;x<a.width;x++){const i=(y*a.width+x)*4;if(a.data[i]+a.data[i+1]+a.data[i+2]-b.data[i]-b.data[i+1]-b.data[i+2]>100)bright++;}return bright;
 },{on:on.toString('base64'),off:off.toString('base64')});expect(pixels).toBeGreaterThan(200);
 await page.getByRole('button',{name:'流星近景',exact:true}).click();await page.screenshot({path:`docs/assets/welcome-correction/air-rain-${info.project.name}.png`});await expect.poll(()=>canvas.getAttribute('data-welcome').then(s=>s&&JSON.parse(s).elapsedMs),{timeout:7000}).toBeGreaterThan(4800);
 await page.getByRole('button',{name:'关闭流星雨',exact:true}).click();await expect.poll(()=>canvas.getAttribute('data-welcome-rain').then(s=>s&&JSON.parse(s).active)).toBe(false);
 expect(errors).toEqual([]);await info.attach('external-rain',{body:JSON.stringify({first,second,pixels,errors}),contentType:'application/json'});
});
test('mi badges are projected at the entry sill with an illuminated door-mounted aperture',async({page},info)=>{
 test.setTimeout(60000);await mkdir('docs/assets/welcome-correction',{recursive:true});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();await page.getByRole('button',{name:'灯光外观',exact:true}).click();await page.getByRole('button',{name:'投影视角',exact:true}).click();
 const input=page.getByRole('textbox',{name:'车辆文字指令',exact:true}),canvas=page.locator('canvas');await input.fill('四个车门全部打开');await page.getByRole('button',{name:'发送',exact:false}).click();
 await expect.poll(()=>canvas.getAttribute('data-welcome').then(s=>JSON.parse(s!).projections.every((p:{power:number})=>p.power>.99)),{timeout:8000}).toBe(true);
 const s=JSON.parse((await canvas.getAttribute('data-welcome'))!);for(const p of s.projections){expect(p.mark).toBe('mi');expect(p.sourceEmission).toBeGreaterThan(3);expect(Math.abs(p.entry[0])).toBeGreaterThan(1.1);expect(Math.abs(p.entry[0])).toBeLessThan(1.16);expect(p.entry[2]).toBeCloseTo(p.corner.startsWith('f')?-.235:.755,2);}
 await page.screenshot({path:`docs/assets/welcome-correction/mi-entry-day-${info.project.name}.png`});await page.getByRole('button',{name:'柔光展厅',exact:true}).click();await page.screenshot({path:`docs/assets/welcome-correction/mi-entry-night-${info.project.name}.png`});
 await page.getByRole('button',{name:'灯口视角',exact:true}).click();await page.screenshot({path:`docs/assets/welcome-correction/projector-aperture-${info.project.name}.png`});
 expect(errors).toEqual([]);await info.attach('mi-entry',{body:JSON.stringify(s.projections),contentType:'application/json'});
});

test('Mock speech uses registered rain tools, acknowledges real light state, speaks results and retains the camera',async({page},info)=>{
 test.setTimeout(90000);const transcripts=['打开流星雨大灯','流星雨亮度设为百分之四十','再暗一点','关闭流星雨'];let n=0,spoken=0;const receipts:unknown[]=[];
 await page.route('**/api/health',r=>r.fulfill({json:{providers:{mode:'test-mock',asr:{configured:true,model:'qwen3-asr-flash',protocol:'test-mock',audioFormats:['audio/wav'],missing:[]},tts:{configured:true,model:'cosyvoice-mock',voice:'mock',protocol:'test-mock',missing:[]},intent:{configured:true,model:'deepseek-mock',protocol:'test-mock',missing:[]}}}}));
 await page.route('**/api/speech/transcribe',r=>{const body=r.request().postDataBuffer()!.toString('latin1'),requestId=body.match(/name="requestId"\r\n\r\n([^\r\n]+)/)![1];return r.fulfill({json:{requestId,text:transcripts[n++],provider:'test-mock',model:'qwen3-asr-flash',durationMs:1}});});
 await page.route('**/api/assistant/plan',r=>{const input=r.request().postDataJSON(),brightness=/亮度|暗/.test(input.text),command={component:'welcomeRain',targets:['front'],property:brightness?'brightness':'enabled',operation:input.text.includes('再')?'adjust':'set',value:brightness?(input.text.includes('再')?-.1:.4):!input.text.includes('关')},name=brightness?'vehicle_welcome_rain_brightness':'vehicle_welcome_rain_switch';return r.fulfill({json:{requestId:input.requestId,turnId:`rain-${n}`,model:'deepseek-mock',baseRevision:input.state.revision,durationMs:1,calls:[{id:`call-${n}`,type:'function',function:{name,arguments:JSON.stringify({actions:[command]})}}],commands:[command]}});});
 await page.route('**/api/assistant/finish',async r=>{const body=r.request().postDataJSON();receipts.push(body);expect(body.results[0].tool_call_id).toBe(`call-${n}`);expect(body.results[0].status).toBe('completed');const state=await(await page.request.get('/api/welcome/state')).json();expect(!!state.rain).toBe(n<4);if(n===2||n===3)expect(state.brightness).toBe(n===2?.4:.3);await r.fulfill({json:{requestId:body.requestId,text:n===4?'流星雨已经关好啦。':'流星雨已按你的要求调好啦。'}});});
 await page.route('**/api/speech/synthesize',r=>{spoken++;return r.fulfill({body:testWave(.15,true),contentType:'audio/wav'});});
 await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('button',{name:'操作帮助',exact:true}).click();await page.getByRole('button',{name:'调试记录',exact:false}).click();await page.getByRole('combobox',{name:'助手路由'}).selectOption('llm');
 await expect(page.getByTestId('camera-position')).toHaveText(/5\.4, 2\.65, -6\.1/);const position=await page.getByTestId('camera-position').innerText();await page.getByRole('button',{name:'关闭调试记录',exact:true}).click();
 for(let i=1;i<=4;i++){await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect.poll(()=>spoken,{timeout:16000}).toBe(i);await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪');}
 await page.getByRole('button',{name:'操作帮助',exact:true}).click();await page.getByRole('button',{name:'调试记录',exact:false}).click();expect(await page.getByTestId('camera-position').innerText()).toBe(position);
 await info.attach('mock-speech-receipts',{body:JSON.stringify({transcripts,receipts,spoken,cameraUnchanged:true,human:false}),contentType:'application/json'});
});

test('rain control voices a real transport failure and does not retry forever or claim success',async({page})=>{
 let posts=0,spoken='';
 await page.route('**/api/health',r=>r.fulfill({json:{providers:{mode:'test-mock',asr:{configured:false,model:'qwen3-asr-flash',protocol:'test-mock',audioFormats:['audio/wav'],missing:[]},tts:{configured:true,model:'mock',voice:'mock',protocol:'test-mock',missing:[]},intent:{configured:false,model:'deepseek-mock',protocol:'test-mock',missing:[]}}}}));
 await page.route('**/api/speech/synthesize',r=>{spoken=r.request().postDataJSON().text;return r.fulfill({body:testWave(.15,true),contentType:'audio/wav'});});
 await page.goto('/');await expect(page.getByRole('button',{name:'全部打开',exact:true})).toBeEnabled({timeout:25000});
 await page.route('**/api/welcome/action',r=>{posts++;return r.fulfill({status:503,json:{code:'INJECTED_FAILURE'}});});await page.getByRole('button',{name:'灯光外观',exact:true}).click();await page.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill('打开流星雨');await page.getByRole('button',{name:'发送',exact:false}).click();
 await expect.poll(()=>spoken).toContain('未确认');await expect(page.getByTestId('console-feedback')).toContainText('未确认');await expect(page.getByRole('button',{name:'流星雨迎宾',exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.getByTestId('speech-phase')).toHaveText('需要重试');expect(posts).toBe(1);expect(JSON.parse((await page.locator('canvas').getAttribute('data-welcome'))!).active).toBe(false);
});
