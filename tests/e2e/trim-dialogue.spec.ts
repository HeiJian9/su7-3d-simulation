import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {testWave} from './global-setup';
test('dashboard crown follows continuous native trim at cabin and windshield viewpoints',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await mkdir('docs/assets/trim-dialogue',{recursive:true});await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await page.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();
 await page.getByRole('button',{name:'氛围空间',exact:true}).click();await page.getByRole('button',{name:'氛围配色：暮光紫',exact:true}).click();await page.getByRole('slider',{name:'氛围灯亮度',exact:true}).fill('100');
 await expect.poll(()=>page.locator('canvas').getAttribute('data-appearance').then(s=>JSON.parse(s!).ambient.power)).toBe(1);
 await page.screenshot({path:`docs/assets/trim-dialogue/dashboard-${info.project.name}.png`});
 // Orbit from the nose toward the windshield, reproducing the reported view.
 await page.getByRole('button',{name:'前方视角',exact:true}).click();
 const canvas=page.locator('canvas'),box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+box.width*.65,box.y+box.height*.48);await page.mouse.wheel(0,-1100);await page.waitForTimeout(600);
 await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.48+120,{steps:16});await page.mouse.up();await page.waitForTimeout(500);
 await page.screenshot({path:`docs/assets/trim-dialogue/windshield-${info.project.name}.png`});expect(errors).toEqual([]);
});
test('browser independently refuses a partial plan that silently omitted an unsupported operation',async({page})=>{
 const command={component:'window',targets:['fl'],property:'openness',operation:'set',value:1};let spoken='',finishes=0;
 await page.route('**/api/health',r=>r.fulfill({json:{providers:{mode:'test-mock',asr:{configured:true,model:'qwen3-asr-flash',protocol:'test-mock',audioFormats:['audio/wav'],missing:[],probe:'mock'},tts:{configured:true,model:'mock-tts',voice:'mock',protocol:'test-mock',missing:[],probe:'mock'},intent:{configured:true,model:'deepseek-mock',protocol:'test-mock',missing:[],probe:'mock'}}}}));
 await page.route('**/api/assistant/plan',r=>{const input=r.request().postDataJSON();return r.fulfill({json:{requestId:input.requestId,turnId:'partial',model:'deepseek-mock',baseRevision:input.state.revision,durationMs:1,calls:[{id:'partial',type:'function',function:{name:'vehicle_windows',arguments:JSON.stringify({actions:[command]})}}],commands:[command]}});});
 await page.route('**/api/assistant/finish',r=>{finishes++;return r.fulfill({json:{}});});
 await page.route('**/api/speech/synthesize',r=>{spoken=r.request().postDataJSON().text;return r.fulfill({body:testWave(.2,true),contentType:'audio/wav'});});
 await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await page.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill('把左前车窗打开，再打开空调');await page.getByRole('button',{name:'发送',exact:false}).click();
 await expect.poll(()=>spoken).toContain('所有动作均未执行');expect(Number(await page.locator('canvas').getAttribute('data-window-fl-openness'))).toBe(0);expect(finishes).toBe(0);
});
