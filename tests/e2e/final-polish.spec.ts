import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const visual=async(p:Page)=>JSON.parse((await p.locator('canvas').getAttribute('data-appearance'))!);
async function ready(p:Page){await p.goto('/');await expect(p.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await p.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();await mkdir('docs/assets/final-polish',{recursive:true});}

test('product layout keeps all main controls reachable and moves attribution and diagnostics into help',async({page},info)=>{
 await ready(page);
 const copy=await page.locator('body').innerText();
 for(const text of ['I7—I9','INTERACTION LAB','ASSET / 01','WEBGL 2','GLB','实际分件','调试记录'])expect(copy).not.toContain(text);
 for(const name of ['左前车窗开度','右前车窗开度','左后车窗开度','右后车窗开度'])await expect(page.getByRole('slider',{name,exact:true})).toBeInViewport();
 for(const name of ['开始录音','进入座舱','回到车辆','氛围空间'])await expect(page.getByRole('button',{name,exact:true})).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`docs/assets/final-polish/exterior-${info.project.name}.png`});
 await page.getByRole('button',{name:'操作帮助',exact:true}).click();await expect(page.getByRole('link',{name:'Xiaomi SU7 — Mona x Supercars'})).toBeVisible();await expect(page.getByRole('link',{name:'CC BY 4.0'})).toBeVisible();
 await page.getByRole('button',{name:'调试记录',exact:true}).click();await expect(page.getByRole('combobox',{name:'助手路由'})).toBeVisible();await expect(page.getByTestId('asset-status')).toContainText('ready');
 await page.getByRole('button',{name:'关闭调试记录',exact:true}).click();await expect(page.getByTestId('performance')).toHaveCount(0);
});

test('curated cabin palettes drive every emitter and light; front and rear views remain usable',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await ready(page);await page.getByRole('button',{name:'氛围空间',exact:true}).click();
 const records=[];const paint=(await visual(page)).paint;
 for(const [name,color,power] of [['冰川蓝','72c9ff',.65],['暖琥珀','ffc38a',.55],['暮光紫','ad87ff',.65]] as const){
  await page.getByRole('button',{name:`氛围配色：${name}`,exact:true}).click();await expect.poll(async()=>(await visual(page)).ambient.power).toBe(power);const state=await visual(page);
  expect(state.ambient.zones).toBe(33);expect(state.ambient.localLights).toHaveLength(16);expect(state.ambient.color).toBe(color);expect(state.ambient.localLights.every((l:{power:number})=>l.power>0)).toBe(true);expect(state.paint).toBe(paint);records.push({name,state:state.ambient});
 }
 await page.getByRole('button',{name:'氛围配色：冰川蓝',exact:true}).click();await page.getByRole('button',{name:'柔光展厅',exact:true}).click();await page.getByRole('button',{name:'全舱视角',exact:true}).click();await page.getByRole('button',{name:'氛围配色：冰川蓝',exact:true}).scrollIntoViewIfNeeded();await page.waitForTimeout(400);
 await page.screenshot({path:`docs/assets/final-polish/cabin-blue-${info.project.name}.png`});
 await page.getByRole('button',{name:'氛围配色：暖琥珀',exact:true}).click();await page.waitForTimeout(400);await page.screenshot({path:`docs/assets/final-polish/cabin-amber-${info.project.name}.png`});
 await page.getByRole('button',{name:'后排视角',exact:true}).click();await page.waitForTimeout(400);await page.screenshot({path:`docs/assets/final-polish/rear-amber-${info.project.name}.png`});
 await page.getByRole('slider',{name:'氛围灯亮度',exact:true}).fill('0');await expect.poll(async()=>(await visual(page)).ambient.localLights.every((l:{power:number})=>l.power===0)).toBe(true);expect((await visual(page)).ambient.emission.every((l:{power:number})=>l.power===0)).toBe(true);
 await page.getByRole('button',{name:'关闭氛围灯',exact:true}).click();expect(errors).toEqual([]);
 await info.attach('palette-renderer-results',{body:JSON.stringify({records,errors,realSpeech:false,source:'UI controls with actual GLB materials and runtime light sources'},null,2),contentType:'application/json'});
});
