import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const dir='docs/assets/physical-fixes';
async function ready(p:Page){await p.goto('/');await expect(p.getByRole('button',{name:'全部打开',exact:true})).toBeEnabled();await p.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();await mkdir(dir,{recursive:true});}
test('night displays remain legible and footwell illumination does not spill through the chassis',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await ready(page);
 await page.getByRole('button',{name:'氛围空间',exact:true}).click();await page.getByRole('button',{name:'柔光展厅',exact:true}).click();
 await page.screenshot({path:`${dir}/displays-night-${info.project.name}.png`});
 await page.getByRole('button',{name:'左方视角',exact:true}).click();
 const canvas=page.locator('canvas');const off=await canvas.screenshot();
 await page.getByRole('button',{name:'氛围配色：冰川蓝',exact:true}).click();await page.getByRole('slider',{name:'氛围灯亮度',exact:true}).fill('100');
 await expect.poll(async()=>JSON.parse((await canvas.getAttribute('data-appearance'))!).ambient.power).toBe(1);
 const state=JSON.parse((await canvas.getAttribute('data-appearance'))!);expect(state.ambient.localLights.filter((l:{castsShadow:boolean})=>l.castsShadow)).toHaveLength(4);
 const on=await canvas.screenshot();await page.screenshot({path:`${dir}/exterior-no-leak-${info.project.name}.png`});
 const change=await page.evaluate(async({a,b})=>{
  async function decode(s:string){const im=await createImageBitmap(new Blob([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],{type:'image/png'}));const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d')!;ctx.drawImage(im,0,0);im.close();return ctx.getImageData(0,0,c.width,c.height);}
  const off=await decode(a),on=await decode(b);let total=0,max=0,count=0;
  // The road below the chassis, away from UI and the red rear lamp.
  for(let y=Math.floor(on.height*.65);y<on.height*.83;y++)for(let x=Math.floor(on.width*.42);x<on.width*.62;x++){
   const i=(y*on.width+x)*4;const delta=Math.abs(on.data[i+2]-off.data[i+2]);total+=delta;max=Math.max(max,delta);count++;
  }return{meanBlueChange:total/count,maxBlueChange:max};
 },{a:off.toString('base64'),b:on.toString('base64')});
 expect(change.meanBlueChange).toBeLessThan(.5);expect(change.maxBlueChange).toBeLessThan(8);expect(errors).toEqual([]);
 await page.getByRole('button',{name:'全舱视角',exact:true}).click();await page.screenshot({path:`${dir}/cabin-lit-${info.project.name}.png`});
 await info.attach('road-light-occlusion',{body:JSON.stringify({change,ambient:state.ambient,errors}),contentType:'application/json'});
});
test('formed luggage liners stay visible through half and full opening without changing native panels',async({page},info)=>{
 await ready(page);await page.getByRole('button',{name:'门与尾箱',exact:true}).click();
 for(const [label,key] of [['前备箱','frunk-front'],['后备箱','trunk-rear']] as const){
  await page.getByRole('button',{name:`${label}视角`,exact:true}).click();
  for(const [preset,value] of [['关闭',0],['半开',.5],['全开',1]] as const){
   await page.getByRole('button',{name:label+preset,exact:true}).click();await expect.poll(()=>page.locator('canvas').getAttribute(`data-${key}-openness`).then(Number)).toBe(value);
   await page.screenshot({path:`${dir}/${key}-${value}-${info.project.name}.png`});
  }
 }
});
