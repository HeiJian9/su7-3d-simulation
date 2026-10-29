import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('dashboard crown remains continuous and legible at low brightness and close viewpoints',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await mkdir('docs/assets/crown-profile',{recursive:true});await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();
 await page.getByRole('button',{name:'氛围空间',exact:true}).click();await page.getByRole('button',{name:'氛围配色：暮光紫',exact:true}).click();await page.getByRole('button',{name:'柔光展厅',exact:true}).click();
 const canvas=page.locator('canvas');const native=async()=>JSON.parse((await canvas.getAttribute('data-native-ambient'))!);
 await expect.poll(async()=>(await native()).routeCount).toBe(29);
 const crown=JSON.parse((await canvas.getAttribute('data-dashboard-profile'))!);expect(crown.width).toBe(.0048);expect(crown.nodes).toHaveLength(2);
 for(const value of [40,65]){
  await page.getByRole('slider',{name:'氛围灯亮度',exact:true}).fill(String(value));await expect.poll(async()=>(await native()).power).toBe(value/100);
  await page.screenshot({path:`docs/assets/crown-profile/front-${value}-${info.project.name}.png`});
 }
 // Move slightly closer using the existing camera control; do not inject a scene transform.
 const box=(await canvas.boundingBox())!;await page.mouse.move(box.x+box.width*.62,box.y+box.height*.44);await page.mouse.wheel(0,-100);await page.waitForTimeout(200);
 await page.screenshot({path:`docs/assets/crown-profile/close-${info.project.name}.png`});
 await page.getByRole('slider',{name:'氛围灯亮度',exact:true}).fill('0');await expect.poll(async()=>(await native()).emission).toBe(0);expect(errors).toEqual([]);
 await info.attach('crown-profile',{body:JSON.stringify({native:await native(),errors,realSpeech:false}),contentType:'application/json'});
});
