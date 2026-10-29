import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {PerspectiveCamera,Vector3} from 'three';
const appearance=async(p:Page)=>JSON.parse((await p.locator('canvas').getAttribute('data-appearance'))!);
const volume=async(p:Page)=>JSON.parse((await p.locator('canvas').getAttribute('data-volume'))!);
async function command(p:Page,text:string){await p.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill(text);await p.getByRole('button',{name:'发送',exact:false}).click();}
async function ready(p:Page){await p.goto('/');await expect(p.getByRole('button',{name:'全部打开',exact:true})).toBeEnabled({timeout:25000});await p.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();await p.getByRole('button',{name:'灯光外观',exact:true}).click();await mkdir('docs/assets/cabin-lighting',{recursive:true});}

test('fitted cabin zones share actual brightness and colour, follow doors, and extinguish completely',async({page},info)=>{
 await ready(page);await page.getByRole('button',{name:'门板视角',exact:true}).click();
 const records=[];await command(page,'打开氛围灯');
 for(const percent of [0,50,100]){
  await command(page,`氛围灯亮度设为百分之${percent}`);await expect.poll(async()=>(await appearance(page)).ambient.power).toBe(percent/100);
  const a=(await appearance(page)).ambient;expect(a.zones).toBe(33);expect(a.localLights).toHaveLength(16);expect(a.emission.every((e:{power:number})=>percent===0?e.power===0:e.power>0)).toBe(true);records.push(a);
  await page.screenshot({path:`docs/assets/cabin-lighting/door-${percent}-${info.project.name}.png`});
 }
 await command(page,'氛围灯换成蓝色，亮度设为百分之四十');await expect.poll(async()=>(await appearance(page)).ambient.color).toBe('4d80b4');
 const before=(await appearance(page)).ambient.localLights;await command(page,'右前门打开一半');await expect.poll(()=>page.locator('canvas').getAttribute('data-door-fr-openness').then(Number)).toBe(.5);
 const after=(await appearance(page)).ambient.localLights;const index=before.findIndex((l:{parent:string})=>l.parent==='DOOR_FR_ROOT');
 expect(Math.hypot(...after[index].position.map((v:number,i:number)=>v-before[index].position[i]))).toBeGreaterThan(.1);
 for(let i=0;i<before.length;i++)if(before[i].parent!=='DOOR_FR_ROOT')expect(after[i].position).toEqual(before[i].position);
 await page.screenshot({path:`docs/assets/cabin-lighting/door-open-${info.project.name}.png`});
 await command(page,'关闭右前门');await page.getByRole('button',{name:'关闭氛围灯',exact:true}).click();await expect.poll(async()=>(await appearance(page)).ambient.emission.every((m:{power:number})=>m.power===0)).toBe(true);
 expect((await appearance(page)).ambient.localLights.every((l:{power:number})=>l.power===0)).toBe(true);
 await info.attach('actual-cabin-zone-states',{body:JSON.stringify({records,before,after,sourceProof:'docs/validation/cabin-lighting/geometry.json',realSpeech:false},null,2),contentType:'application/json'});
});

test('depth-clipped Tyndall volume changes rendered air, has adjustable strength, and preserves the independent running lamp with headlights off',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await ready(page);await page.getByRole('button',{name:'柔光展厅',exact:true}).click();await page.getByRole('button',{name:'照射视角',exact:true}).click();
 await page.getByRole('button',{name:'远光灯',exact:true}).click();await page.getByRole('slider',{name:'空气散射强度',exact:true}).fill('80');await expect.poll(async()=>(await volume(page)).density).toBe(.8);
 const canvas=page.locator('canvas');await expect.poll(async()=>(await volume(page)).active).toBe(true);await page.waitForTimeout(200);
 const on=await canvas.screenshot({path:`docs/assets/cabin-lighting/volume-on-${info.project.name}.png`});
 await page.getByRole('button',{name:'丁达尔光束',exact:true}).click();await expect.poll(async()=>(await volume(page)).active).toBe(false);
 const off=await canvas.screenshot({path:`docs/assets/cabin-lighting/volume-off-${info.project.name}.png`});
 const bounds=(await canvas.boundingBox())!,camera=new PerspectiveCamera(42,bounds.width/bounds.height,.01,120);camera.position.set(7,5.5,-12);camera.lookAt(0,.3,-4.5);camera.updateMatrixWorld();
 const roof=new Vector3(0,1.28,.2).project(camera),roofPixel=[Math.round((roof.x*.5+.5)*bounds.width),Math.round((-.5*roof.y+.5)*bounds.height)];
 const diff=await page.evaluate(async({on,off,roof})=>{
  async function pixels(s:string){const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],{type:'image/png'}));const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();return ctx.getImageData(0,0,c.width,c.height);}
  const a=await pixels(on),b=await pixels(off);let bright=0,roofSum=0,roofSamples=0;
  for(let i=0;i<a.data.length;i+=4){const delta=(a.data[i]+a.data[i+1]+a.data[i+2]-b.data[i]-b.data[i+1]-b.data[i+2])/3;if(delta>5)bright++;const x=i/4%a.width,y=Math.floor(i/4/a.width);if(Math.abs(x-roof[0])<6&&Math.abs(y-roof[1])<6){roofSum+=Math.abs(delta);roofSamples++;}}
  return {brighterPixels:bright,roofMeanDifference:roofSum/roofSamples,pixels:a.width*a.height};
 },{on:on.toString('base64'),off:off.toString('base64'),roof:roofPixel});
 expect(diff.brighterPixels).toBeGreaterThan(diff.pixels*.008);expect(diff.roofMeanDifference).toBeLessThan(3);
 await page.getByRole('button',{name:'丁达尔光束',exact:true}).click();await page.getByRole('button',{name:'关闭前灯',exact:true}).click();await expect.poll(async()=>{const v=await volume(page);return {enabled:v.enabled,active:v.active,mode:v.mode};}).toEqual({enabled:true,active:true,mode:'off'});expect((await volume(page)).sceneDepthOcclusion).toBe(true);
 expect(errors).toEqual([]);await info.attach('actual-volume-image-comparison',{body:JSON.stringify({diff,roofPixel,errors,state:await volume(page),realSpeech:false},null,2),contentType:'application/json'});
});
