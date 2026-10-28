import {test,expect,type Page} from '@playwright/test';
import {testWave} from './global-setup';
const command=(value=.5)=>({component:'window',targets:['fl'],property:'openness',operation:'set',value});
async function ready(page:Page){
 await page.route('**/api/health',r=>r.fulfill({json:{providers:{mode:'test-mock',asr:{configured:true,model:'qwen3-asr-flash',protocol:'test-mock',audioFormats:['audio/wav'],missing:[],probe:'test-mock'},tts:{configured:true,model:'mock-tts',voice:'mock',protocol:'test-mock',missing:[],probe:'test-mock'},intent:{configured:true,model:'deepseek-mock',protocol:'test-mock',missing:[],probe:'test-mock'}}}}));
 await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await page.getByRole('button',{name:'调试记录',exact:false}).click();await page.getByRole('combobox',{name:'助手路由'}).selectOption('llm');await page.getByRole('button',{name:'关闭调试记录',exact:true}).click();
}
async function send(page:Page,text:string){await page.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill(text);await page.getByRole('button',{name:'发送',exact:false}).click();}
const pose=(page:Page)=>page.locator('canvas').getAttribute('data-window-fl-openness').then(Number);
test('Mock protocol: real renderer completion precedes corresponding tool receipts, then actual audio playback',async({page})=>{
 let tts=0,finished=0;
 await page.route('**/api/assistant/plan',r=>{const input=r.request().postDataJSON();return r.fulfill({json:{requestId:input.requestId,turnId:'mock-turn',model:'deepseek-mock',baseRevision:input.state.revision,durationMs:1,calls:[{id:'call-mock-1',type:'function',function:{name:'vehicle_windows',arguments:JSON.stringify({actions:[command()]})}}],commands:[command()]}});});
 await page.route('**/api/assistant/finish',async r=>{finished++;expect(await pose(page)).toBe(.5);const body=r.request().postDataJSON();expect(body.results).toMatchObject([{tool_call_id:'call-mock-1',status:'completed',effects:[{key:'window:fl:openness',value:.5}]}]);await r.fulfill({json:{requestId:body.requestId,text:'左前车窗已打开到50%。'}});});
 await page.route('**/api/speech/synthesize',async r=>{tts++;expect(finished).toBe(1);expect(await pose(page)).toBe(.5);await r.fulfill({body:testWave(.2,true),contentType:'audio/wav'});});
 await ready(page);await send(page,'帮我把左前玻璃放下一半');await expect.poll(()=>tts).toBe(1);await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪');expect(await pose(page)).toBe(.5);
});
test('Mock model failure is voiced as service failure; late model reply after manual preemption does nothing',async({page})=>{
 let spoken='';await page.route('**/api/speech/synthesize',r=>{spoken=r.request().postDataJSON().text;return r.fulfill({body:testWave(.2,true),contentType:'audio/wav'});});
 await page.route('**/api/assistant/plan',r=>r.fulfill({status:502,json:{code:'INTENT_AUTH_FAILED',message:'智能助手认证失败，请检查本机配置。'}}));
 await ready(page);await send(page,'请打开左前窗');await expect.poll(()=>spoken).toContain('认证失败');expect(await pose(page)).toBe(0);await expect(page.getByTestId('speech-phase')).toHaveText('需要重试');
 let release!:(()=>Promise<void>);await page.unroute('**/api/assistant/plan');await page.route('**/api/assistant/plan',async r=>{const input=r.request().postDataJSON();await new Promise<void>(resolve=>{release=async()=>{try{await r.fulfill({json:{requestId:input.requestId,turnId:'late',model:'deepseek-mock',baseRevision:input.state.revision,durationMs:1,calls:[{id:'late',type:'function',function:{name:'vehicle_windows',arguments:JSON.stringify({actions:[command(1)]})}}],commands:[command(1)]}});}catch{/* browser aborted it */}resolve();};});});
 await send(page,'把左前窗完全打开');await expect.poll(()=>!!release).toBe(true);await page.getByRole('button',{name:'全部关闭',exact:true}).click();await release();await page.waitForTimeout(300);expect(await pose(page)).toBe(0);
});
test('Mock unsupported and unintelligible are separate voiced outcomes with no vehicle mutation',async({page})=>{
 const spoken:string[]=[];await page.route('**/api/speech/synthesize',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({body:testWave(.2,true),contentType:'audio/wav'});});
 await page.route('**/api/assistant/plan',r=>{const input=r.request().postDataJSON(),reply={kind:input.text.includes('空调')?'unsupported':'not_understood',message:'not an execution'};return r.fulfill({json:{requestId:input.requestId,turnId:'no-action',model:'deepseek-mock',baseRevision:input.state.revision,durationMs:1,calls:[{id:'reply',type:'function',function:{name:'assistant_reply',arguments:JSON.stringify(reply)}}],commands:[],reply}});});
 await page.route('**/api/assistant/finish',r=>r.fulfill({json:{requestId:r.request().postDataJSON().requestId,text:'untrusted model text'}}));
 await ready(page);await send(page,'打开空调');await expect.poll(()=>spoken.at(-1)).toBe('暂不支持该功能。');await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪');await send(page,'嗯啊');await expect.poll(()=>spoken.at(-1)).toBe('我没听清，请再说一遍。');expect(await pose(page)).toBe(0);
});
test('new shared brightness values change actual light sources and scattering independently',async({page},info)=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await page.getByRole('button',{name:'灯光外观',exact:true}).click();await page.getByRole('button',{name:'近光灯',exact:true}).click();
 await page.getByRole('slider',{name:'前灯亮度',exact:true}).fill('40');const appearance=async()=>JSON.parse(await page.locator('canvas').getAttribute('data-appearance'));
 await expect.poll(async()=>(await appearance()).headlightPower).toEqual([480,480]);
 await page.getByRole('button',{name:'前排主灯开关',exact:true}).click();await page.getByRole('slider',{name:'前排顶灯亮度',exact:true}).fill('40');const dome=async()=>JSON.parse(await page.locator('canvas').getAttribute('data-cabin-main-lights'));
 await expect.poll(async()=>(await dome())[0].emission).toBe(.96);expect((await dome())[1].power).toBe(0);
 await page.screenshot({path:`docs/assets/i7-i9/brightness-${info.project.name}.png`});
});
test('fine light brightness changes actual rendered pixels at fixed exterior and cabin cameras',async({page},info)=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await page.getByRole('button',{name:'灯光外观',exact:true}).click();await page.getByRole('button',{name:'柔光展厅',exact:true}).click();
 const differences=[];
 for(const target of ['front','cabin']){
  if(target==='front'){await page.getByRole('button',{name:'照射视角',exact:true}).click();await page.getByRole('button',{name:'近光灯',exact:true}).click();}
  else{await page.getByRole('button',{name:'关闭前灯',exact:true}).click();await page.getByRole('button',{name:'前排顶灯视角',exact:true}).click();await page.getByRole('button',{name:'前排主灯开关',exact:true}).click();}
  const slider=page.getByRole('slider',{name:target==='front'?'前灯亮度':'前排顶灯亮度',exact:true});await slider.fill('15');await page.waitForTimeout(300);const dim=await page.locator('canvas').screenshot({path:`docs/assets/i7-i9/${target}-dim-${info.project.name}.png`});await slider.fill('85');await page.waitForTimeout(300);const bright=await page.locator('canvas').screenshot({path:`docs/assets/i7-i9/${target}-bright-${info.project.name}.png`});
  const diff=await page.evaluate(async({dim,bright})=>{
   async function decode(base64:string){const b=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'}));const canvas=document.createElement('canvas');canvas.width=b.width;canvas.height=b.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(b,0,0);b.close();return ctx.getImageData(0,0,canvas.width,canvas.height);}
   const a=await decode(dim),b=await decode(bright);let changed=0,total=0;for(let i=0;i<a.data.length;i+=4){const d=(b.data[i]+b.data[i+1]+b.data[i+2]-a.data[i]-a.data[i+1]-a.data[i+2])/3;if(d>5)changed++;total+=Math.abs(d);}return {changed,meanDifference:total/(a.width*a.height)};
  },{dim:dim.toString('base64'),bright:bright.toString('base64')});expect(diff.changed).toBeGreaterThan(100);differences.push({target,...diff});
 }
 await info.attach('actual-brightness-pixel-differences',{body:JSON.stringify(differences),contentType:'application/json'});
});
