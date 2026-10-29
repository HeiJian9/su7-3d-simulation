import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('front inlay upper edges and current line fields share intensity, colour and door motion',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await mkdir('docs/assets/line-lighting',{recursive:true});await page.goto('/');
 await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();
 await page.getByRole('button',{name:'氛围空间',exact:true}).click();await page.getByRole('button',{name:'氛围配色：暮光紫',exact:true}).click();await page.getByRole('button',{name:'柔光展厅',exact:true}).click();
 const canvas=page.locator('canvas'),read=async(name:string)=>JSON.parse((await canvas.getAttribute(name))!);
 await expect.poll(async()=>(await read('data-native-ambient')).routeCount).toBe(31);
 const native=await read('data-native-ambient');for(const suffix of ['left','right'])expect(native.zones.flatMap((z:{routes:string[]})=>z.routes)).toContain('front-inlay-upper-'+suffix);
 await expect.poll(async()=>(await read('data-volume')).cabinFields.reduce((n:number,f:{routes:number})=>n+f.routes,0)).toBe(33);
 await page.screenshot({path:`docs/assets/line-lighting/front-night-${info.project.name}.png`});
 await page.getByRole('button',{name:'门板视角',exact:true}).click();
 const screenshots:Buffer[]=[];
 for(const density of [0,35,80]){
  await page.getByRole('slider',{name:'空气散射强度',exact:true}).fill(String(density));await expect.poll(async()=>(await read('data-volume')).density).toBe(density/100);
  screenshots.push(await canvas.screenshot({path:`docs/assets/line-lighting/side-scatter-${density}-${info.project.name}.png`}));
 }
 const diff=await page.evaluate(async(images)=>{
  const decoded=await Promise.all(images.map(async s=>{const b=await createImageBitmap(new Blob([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],{type:'image/png'}));const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const ctx=c.getContext('2d')!;ctx.drawImage(b,0,0);b.close();return ctx.getImageData(0,0,c.width,c.height);}));
  const out=[];for(const d of decoded.slice(1)){let sum=0,brighter=0,n=0;const a=decoded[0];for(let y=0;y<a.height*.83;y++)for(let x=Math.floor(a.width*.32);x<a.width*.91;x++){const i=(y*a.width+x)*4,delta=(d.data[i]+d.data[i+1]+d.data[i+2]-a.data[i]-a.data[i+1]-a.data[i+2])/3;sum+=delta;if(delta>.5)brighter++;n++;}out.push({mean:sum/n,brighter});}return out;
 },screenshots.map(s=>s.toString('base64')));
 expect(diff[0].brighter).toBeGreaterThan(100);expect(diff[1].mean).toBeGreaterThan(diff[0].mean);
 const before=await read('data-volume');
 await page.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill('右前门开一半');await page.getByRole('button',{name:'发送',exact:false}).click();
 await expect.poll(()=>canvas.getAttribute('data-door-fr-openness').then(Number)).toBe(.5);
 const after=await read('data-volume');for(let i=0;i<before.cabinFields.length;i++){const a=before.cabinFields[i],b=after.cabinFields[i];if(a.parent==='DOOR_FR_ROOT')expect(b.matrix).not.toEqual(a.matrix);else expect(b.matrix).toEqual(a.matrix);}
 await page.getByRole('slider',{name:'氛围灯亮度',exact:true}).fill('0');await expect.poll(async()=>(await read('data-volume')).cabinPower).toBe(0);
 await page.getByRole('slider',{name:'氛围灯亮度',exact:true}).fill('65');await expect.poll(async()=>(await read('data-volume')).cabinPower).toBe(.65);
 await page.getByRole('button',{name:'后排视角',exact:true}).click();await page.getByRole('slider',{name:'空气散射强度',exact:true}).fill('35');await page.screenshot({path:`docs/assets/line-lighting/rear-night-${info.project.name}.png`});
 await page.getByRole('button',{name:'关闭氛围灯',exact:true}).click();await expect.poll(async()=>(await read('data-volume')).cabinPower).toBe(0);
 expect(errors).toEqual([]);await info.attach('line-field-evidence',{body:JSON.stringify({native,diff,before,after,errors,realSpeech:false}),contentType:'application/json'});
});
