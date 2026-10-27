import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
const mapping=JSON.parse(readFileSync(new URL('../../apps/web/src/data/vehicle-mapping.json',import.meta.url),'utf8')) as {trunk:{maxAngle:number}};

const pose=(page:Page)=>page.locator('canvas').getAttribute('data-trunk-rear-openness').then(Number);
async function command(page:Page,text:string){await page.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill(text);await page.getByRole('button',{name:'发送',exact:false}).click();}

test('corrected complete trunk lid: fixed rear close-ups, actual angles, hotspot and interruption',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await mkdir('docs/assets/trunk-correction',{recursive:true});
  await page.goto('/');await expect(page.getByRole('button',{name:'全部打开',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'后方视角',exact:true}).click();
  await page.getByRole('button',{name:'折叠车辆面板',exact:true}).click();
  await page.getByRole('button',{name:'自由观察',exact:true}).click();
  const box=(await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x+box.width*.55,box.y+box.height*.45);
  for(let i=0;i<4;i++){await page.mouse.wheel(0,-260);await page.waitForTimeout(80);}
  const records=[];
  for(const [text,value,label] of [['后备箱关闭',0,'closed'],['后备箱打开一半',.5,'half'],['后备箱完全打开',1,'full']] as const){
    await command(page,text);await expect.poll(()=>pose(page)).toBe(value);
    const matrix=(await page.locator('canvas').getAttribute('data-trunk-rear-matrix'))!.split(',').map(Number);
    expect(matrix[5]).toBeCloseTo(Math.cos(mapping.trunk.maxAngle*value),5);
    expect(matrix[6]).toBeCloseTo(Math.sin(mapping.trunk.maxAngle*value),5);
    records.push({value,matrix});
    await page.screenshot({path:`docs/assets/trunk-correction/browser-${label}-${info.project.name}.png`});
  }
  // A closer look into the actual cargo opening, without replacing model data.
  await page.mouse.move(box.x+box.width*.55,box.y+box.height*.45);await page.mouse.wheel(0,-150);await page.waitForTimeout(150);
  await page.screenshot({path:`docs/assets/trunk-correction/browser-cargo-${info.project.name}.png`});
  await command(page,'后备箱关闭');await expect.poll(()=>pose(page)).toBe(0);
  await page.getByRole('button',{name:'后方视角',exact:true}).click();
  const hotspot=page.getByRole('button',{name:'模型热点：后备箱',exact:true});await expect(hotspot).toBeVisible();
  await hotspot.click();await expect.poll(()=>pose(page)).toBe(1);
  await command(page,'后备箱关闭');await expect.poll(()=>pose(page)).toBe(0);
  await command(page,'后备箱完全打开');await page.waitForTimeout(180);const intermediate=await pose(page);expect(intermediate).toBeGreaterThan(0);expect(intermediate).toBeLessThan(1);
  await command(page,'后备箱关闭');await expect.poll(()=>pose(page)).toBe(0);
  await page.mouse.move(box.x+box.width*.55,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.47,{steps:10});await page.mouse.up();expect(await pose(page)).toBe(0);
  expect(errors).toEqual([]);
  await info.attach('corrected-trunk-runtime-poses',{body:JSON.stringify({records,intermediate,errors,geometryProof:'docs/validation/trunk-correction/geometry.json',microphoneTest:false},null,2),contentType:'application/json'});
});
