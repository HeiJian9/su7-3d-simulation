import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const actual=async(p:Page)=>JSON.parse((await p.locator('canvas').getAttribute('data-cabin-main-lights'))!) as Array<{position:string;enabled:boolean;power:number;emission:number;direction:number[]}>;
const appearance=async(p:Page)=>JSON.parse((await p.locator('canvas').getAttribute('data-appearance'))!);
async function command(p:Page,text:string){await p.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill(text);await p.getByRole('button',{name:'发送',exact:false}).click();}
async function setup(p:Page){await p.goto('/');await expect(p.getByRole('button',{name:'全部打开',exact:true})).toBeEnabled();await p.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();await p.getByRole('button',{name:'灯光外观',exact:true}).click();await mkdir('docs/assets/dome-tail',{recursive:true});}
async function pixels(p:Page,buffer:Buffer){return p.evaluate(async s=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],{type:'image/png'}));const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let red=0,total=0;for(let i=0;i<data.length;i+=4){if(data[i]>data[i+1]*1.5&&data[i]>data[i+2]*1.5&&data[i]>25)red++;total+=(data[i]+data[i+1]+data[i+2])/3;}image.close();return {red,mean:total/(data.length/4)};},buffer.toString('base64'));}

test('native running ring is red by default, stays lit with indicators/headlights off and has independently switchable scatter',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);await page.getByRole('button',{name:'后方视角',exact:true}).click();await page.getByRole('button',{name:'柔光展厅',exact:true}).click();await page.getByRole('slider',{name:'空气散射强度',exact:true}).fill('80');
 const ring={alwaysOn:true,color:'ff1424',power:1.5};await expect.poll(async()=>(await appearance(page)).tailRunning).toEqual(ring);
 await page.getByRole('button',{name:'双闪',exact:true}).click();for(let i=0;i<8;i++){expect((await appearance(page)).tailRunning).toEqual(ring);await page.waitForTimeout(100);}
 await command(page,'关闭车灯');await expect.poll(async()=>(await appearance(page)).signals).toEqual({left:false,right:false});expect((await appearance(page)).tailRunning).toEqual(ring);
 const on=await pixels(page,await page.locator('canvas').screenshot({path:`docs/assets/dome-tail/ring-scatter-${info.project.name}.png`}));await page.getByRole('button',{name:'丁达尔光束',exact:true}).click();await page.waitForTimeout(200);const off=await pixels(page,await page.locator('canvas').screenshot());expect(on.red).toBeGreaterThan(off.red+100);expect((await appearance(page)).tailRunning).toEqual(ring);
 await command(page,'后备箱打开一半');await expect.poll(()=>page.locator('canvas').getAttribute('data-trunk-rear-openness').then(Number)).toBe(.5);await page.screenshot({path:`docs/assets/dome-tail/ring-trunk-${info.project.name}.png`});expect(errors).toEqual([]);await info.attach('running-ring',{body:JSON.stringify({on,off,ring,errors}),contentType:'application/json'});
});

test('two fitted downward lights share physical state across hotspots panel and rules; drag does not toggle',async({page},info)=>{
 await setup(page);await page.getByRole('button',{name:'柔光展厅',exact:true}).click();await expect.poll(async()=>(await actual(page)).map(l=>l.enabled)).toEqual([false,false]);const records=[];
 for(const [index,where] of ['前排','后排'].entries()){
  await page.getByRole('button',{name:where+'顶灯视角',exact:true}).click();const hotspot=page.getByRole('button',{name:'模型热点：'+where+'主灯',exact:true});await expect(hotspot).toBeVisible();const box=(await hotspot.boundingBox())!;
  await page.mouse.move(box.x+10,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+38,box.y+box.height/2,{steps:5});await page.mouse.up();expect((await actual(page))[index].enabled).toBe(false);
  await hotspot.click();await expect.poll(async()=>(await actual(page))[index].power).toBe(12);const a=await actual(page);expect(a[index].direction[1]).toBeLessThan(-.98);expect(a[index].emission).toBe(2.4);expect(a[1-index].enabled).toBe(false);records.push(a);await page.screenshot({path:`docs/assets/dome-tail/dome-${index}-${info.project.name}.png`});
  await page.getByRole('button',{name:where+'主灯开关',exact:true}).click();await expect.poll(async()=>(await actual(page))[index].enabled).toBe(false);
 }
 await page.getByRole('button',{name:'进入座舱',exact:true}).click();const off=await pixels(page,await page.locator('canvas').screenshot());await command(page,'打开所有顶灯');await expect.poll(async()=>(await actual(page)).every(l=>l.power===12)).toBe(true);const on=await pixels(page,await page.locator('canvas').screenshot({path:`docs/assets/dome-tail/seats-lit-${info.project.name}.png`}));expect(on.mean).toBeGreaterThan(off.mean+1);
 await command(page,'关闭所有顶灯');await expect.poll(async()=>(await actual(page)).every(l=>l.power===0&&l.emission===0)).toBe(true);await command(page,'打开顶灯');await expect(page.getByRole('group',{name:'请选择顶灯'})).toBeVisible();expect((await actual(page)).every(l=>!l.enabled)).toBe(true);
 await page.getByRole('group',{name:'请选择顶灯'}).getByRole('button',{name:'后排主灯',exact:true}).click();await expect.poll(async()=>(await actual(page)).map(l=>l.enabled)).toEqual([false,true]);await command(page,'不要打开前排主灯');expect((await actual(page))[0].enabled).toBe(false);await command(page,'关闭');await expect.poll(async()=>(await actual(page)).map(l=>l.enabled)).toEqual([false,false]);
 await info.attach('physical-dome-results',{body:JSON.stringify({records,off,on,final:await actual(page),realSpeech:false}),contentType:'application/json'});
});
