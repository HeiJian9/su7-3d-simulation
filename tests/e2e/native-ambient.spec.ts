import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('native cabin trim follows original surfaces, dims and moves with both rear doors',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await mkdir('docs/assets/native-ambient',{recursive:true});await page.goto('/');
 await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await page.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();
 await page.getByRole('button',{name:'氛围空间',exact:true}).click();await page.getByRole('button',{name:'氛围配色：极光青',exact:true}).click();
 const canvas=page.locator('canvas');const native=async()=>JSON.parse((await canvas.getAttribute('data-native-ambient'))!);
 await expect.poll(async()=>(await native()).zones.length).toBe(10);
 expect((await native()).routeCount).toBe(29);
 expect((await native()).replaced).toHaveLength(21);
 for(const level of [100,40,0,65]){
  await page.getByRole('slider',{name:'氛围灯亮度',exact:true}).fill(String(level));await expect.poll(async()=>(await native()).power).toBe(level/100);
  expect((await native()).emission).toBeCloseTo(level/100*1.8);
  await page.screenshot({path:`docs/assets/native-ambient/front-${level}-${info.project.name}.png`});
 }
 await page.getByRole('button',{name:'后排视角',exact:true}).click();await page.waitForTimeout(300);
 await page.screenshot({path:`docs/assets/native-ambient/rear-${info.project.name}.png`});
 for(const text of ['左后门打开一半','右后门打开一半']){
  await page.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill(text);await page.getByRole('button',{name:'发送',exact:false}).click();
  await expect.poll(()=>canvas.getAttribute(`data-door-${text.startsWith('左')?'rl':'rr'}-openness`).then(Number)).toBe(.5);
 }
 await page.screenshot({path:`docs/assets/native-ambient/rear-doors-open-${info.project.name}.png`});
 await page.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill('关闭所有车门');await page.getByRole('button',{name:'发送',exact:false}).click();
 await expect.poll(()=>canvas.getAttribute('data-door-rr-openness').then(Number)).toBe(0);
 await page.getByRole('button',{name:'全舱视角',exact:true}).click();
 const box=(await canvas.boundingBox())!;const x=box.x+box.width*.60,y=box.y+box.height*.45;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+150,{steps:15});await page.mouse.up();
 await page.screenshot({path:`docs/assets/native-ambient/console-${info.project.name}.png`});
 await page.getByRole('button',{name:'前方视角',exact:true}).click();
 await page.mouse.move(x,y);await page.mouse.wheel(0,-1100);await page.waitForTimeout(600);await page.mouse.down();await page.mouse.move(x,y+120,{steps:16});await page.mouse.up();await page.waitForTimeout(500);
 await page.screenshot({path:`docs/assets/native-ambient/top-${info.project.name}.png`});
 expect(errors).toEqual([]);await info.attach('native-surfaces',{body:JSON.stringify(await native()),contentType:'application/json'});
});
