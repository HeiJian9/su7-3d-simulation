import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const volume=async(p:Page)=>JSON.parse((await p.locator('canvas').getAttribute('data-volume'))!);
async function command(p:Page,text:string){await p.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill(text);await p.getByRole('button',{name:'发送',exact:false}).click();}
async function pixels(p:Page,buffer:Buffer){return p.evaluate(async(s)=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],{type:'image/png'}));const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);let yellow=0,light=0;for(let i=0;i<data.length;i+=4){if(data[i]>35&&data[i+1]>20&&data[i]>data[i+2]*1.8&&data[i+1]>data[i+2]*1.5)yellow++;light+=(data[i]+data[i+1]+data[i+2])/3;}bitmap.close();const sky=Array.from(data.slice((Math.floor(canvas.height*.15)*canvas.width+Math.floor(canvas.width*.5))*4,(Math.floor(canvas.height*.15)*canvas.width+Math.floor(canvas.width*.5))*4+3));return {yellow,mean:light/(data.length/4),sky};},buffer.toString('base64'));}
async function setup(p:Page){await p.goto('/');await expect(p.getByRole('button',{name:'全部打开',exact:true})).toBeEnabled();await p.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();await p.getByRole('button',{name:'灯光外观',exact:true}).click();await p.getByRole('button',{name:'柔光展厅',exact:true}).click();await mkdir('docs/assets/lighting-followup',{recursive:true});}

test('front and rear signal air scattering follows actual blink, side selection, trunk and master switch',async({page},info)=>{
 await setup(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.getByRole('slider',{name:'空气散射强度',exact:true}).fill('65');
 const records=[];
 for(const mode of ['左转向灯','右转向灯','双闪']){
  await page.getByRole('button',{name:mode,exact:true}).click();let lit=false,dark=false;
  for(let i=0;i<12;i++){const v=await volume(page);if(v.signalSources.length===6){const on=v.signals.left||v.signals.right;lit||=on;dark||=!on;expect(v.active).toBe(on);for(const source of v.signalSources)expect(source.power).toBe(v.signals[source.side]?1:0);if(mode==='左转向灯')expect(v.signals.right).toBe(false);if(mode==='右转向灯')expect(v.signals.left).toBe(false);}await page.waitForTimeout(80);}
  expect(lit&&dark).toBe(true);records.push(await volume(page));
 }
 const imageStats=[];
 for(const view of ['前','后']){
  await page.getByRole('button',{name:view+'方视角',exact:true}).click();
  // Capture several actual flashing frames and retain the brightest one.
  const sample=async(suffix:string)=>{let best={yellow:-1,mean:0,sky:[] as number[]};for(let i=0;i<5;i++){await expect.poll(async()=>{const v=await volume(page);return v.signals.left;},{intervals:[20]}).toBe(true);const image=await page.locator('canvas').screenshot();const stats=await pixels(page,image);if(stats.yellow>best.yellow){best=stats;await info.attach(`${view}-${suffix}`,{body:image,contentType:'image/png'});}await page.waitForTimeout(85);}return best;};
  const on=await sample('scatter-on');await page.getByRole('button',{name:'丁达尔光束',exact:true}).click();await expect.poll(async()=>(await volume(page)).active).toBe(false);const off=await sample('scatter-off');expect(on.yellow).toBeGreaterThan(off.yellow+150);expect(on.sky).toEqual(off.sky);imageStats.push({view,on,off});await page.getByRole('button',{name:'丁达尔光束',exact:true}).click();
 }
 const before=(await volume(page)).signalSources;await command(page,'后备箱打开一半');await expect.poll(()=>page.locator('canvas').getAttribute('data-trunk-rear-openness').then(Number)).toBe(.5);await page.waitForTimeout(400);const after=(await volume(page)).signalSources;
 expect(after.filter((s:{position:number[]},i:number)=>Math.hypot(...s.position.map((v,j)=>v-before[i].position[j]))>.1)).toHaveLength(2);
 await command(page,'关闭转向灯');await expect.poll(async()=>(await volume(page)).active).toBe(false);expect(errors).toEqual([]);await info.attach('signal-scattering',{body:JSON.stringify({records,imageStats,errors,before,after,realSpeech:false}),contentType:'application/json'});
});

test('cabin illumination and local scattering follow colour, brightness and off state',async({page},info)=>{
 await setup(page);await page.getByRole('button',{name:'进入座舱',exact:true}).click();await page.getByRole('slider',{name:'空气散射强度',exact:true}).fill('80');const canvas=page.locator('canvas');const off=await pixels(page,await canvas.screenshot());
 await command(page,'氛围灯换成紫色，亮度设为百分之一百');await command(page,'打开氛围灯');await expect.poll(async()=>(await volume(page)).cabinPower).toBe(1);await expect.poll(async()=>(await volume(page)).active).toBe(true);await page.waitForTimeout(300);
 const onImage=await canvas.screenshot({path:`docs/assets/lighting-followup/cabin-on-${info.project.name}.png`}),on=await pixels(page,onImage);
 await page.getByRole('button',{name:'丁达尔光束',exact:true}).click();await expect.poll(async()=>(await volume(page)).active).toBe(false);const noScatter=await pixels(page,await canvas.screenshot());expect(on.mean).toBeGreaterThan(noScatter.mean+.03);expect(noScatter.mean).toBeGreaterThan(off.mean+2);
 await page.getByRole('button',{name:'丁达尔光束',exact:true}).click();await command(page,'氛围灯亮度设为百分之零');await expect.poll(async()=>(await volume(page)).cabinPower).toBe(0);await expect.poll(async()=>(await volume(page)).active).toBe(false);
 await info.attach('cabin-scattering',{body:JSON.stringify({off,on,noScatter,state:await volume(page),realSpeech:false}),contentType:'application/json'});
});
