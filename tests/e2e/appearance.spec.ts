import {test,expect,type Page} from '@playwright/test';
async function ready(page:Page){await page.goto('/');await expect(page.getByRole('button',{name:'全部打开',exact:true})).toBeEnabled();await page.getByRole('button',{name:'灯光外观',exact:true}).click();}
const actual=async(p:Page)=>JSON.parse((await p.locator('canvas').getAttribute('data-appearance'))!);
async function command(page:Page,s:string){await page.getByRole('textbox',{name:'车窗文字指令',exact:true}).fill(s);await page.getByRole('button',{name:'发送',exact:false}).click();}
test('I5 paint whitelist preserves non-paint materials, seven presets and a custom color',async({page},info)=>{
  await ready(page);await expect.poll(()=>actual(page).then(a=>a.paint)).toBe('e4e6e8');const before=(await actual(page)).protectedMaterials;
  for(const name of ['霞光紫','海湾蓝','珍珠白','曜石黑','熔岩红','雅灰','海绿']){await page.getByRole('button',{name:`车漆：${name}`,exact:true}).click();await expect.poll(()=>actual(page).then(a=>a.protectedMaterials)).toEqual(before);}
  await command(page,'车身换成蓝色');await expect.poll(()=>actual(page).then(a=>a.paint)).toBe('4d80b4');await page.screenshot({path:`docs/assets/i4-i6/I5-blue-paint-${info.project.name}.png`});
  await page.getByLabel('自定义车漆颜色',{exact:true}).fill('#cb8651');await expect.poll(()=>actual(page).then(a=>a.paint)).toBe('cb8651');expect((await actual(page)).protectedMaterials).toEqual(before);
  await info.attach('protected-materials-before-after',{body:JSON.stringify({before,after:(await actual(page)).protectedMaterials},null,2),contentType:'application/json'});
});
test('I5 actual lights, floor illumination powers, blink cadence and exclusive side/hazard modes',async({page},info)=>{
  await ready(page);await page.getByRole('button',{name:'柔光展厅',exact:true}).click();await page.getByRole('button',{name:'照射视角',exact:true}).click();const records=[];
  for(const [label,mode,power] of [['关闭前灯','off',0],['近光灯','low',1200],['远光灯','high',6500]] as const){await page.getByRole('button',{name:label,exact:true}).click();await expect.poll(()=>actual(page).then(a=>a.headlightPower[0])).toBe(power);await page.screenshot({path:`docs/assets/i4-i6/I5-lamp-${mode}-${info.project.name}.png`});records.push(await actual(page));}
  await command(page,'打开左转向灯');let seenOn=false,seenOff=false;for(let i=0;i<12;i++){const a=await actual(page);seenOn ||= a.signals.left;seenOff ||= !a.signals.left;expect(a.signals.right).toBe(false);await page.waitForTimeout(100);}expect(seenOn&&seenOff).toBe(true);
  await command(page,'打开双闪');await expect.poll(()=>actual(page).then(a=>a.turnSignal)).toBe('hazard');for(let i=0;i<8;i++){const a=await actual(page);expect(a.signals.left).toBe(a.signals.right);await page.waitForTimeout(100);}
  await command(page,'打开右转向灯');await expect.poll(()=>actual(page).then(a=>a.turnSignal)).toBe('right');for(let i=0;i<6;i++){expect((await actual(page)).signals.left).toBe(false);await page.waitForTimeout(100);}
  await command(page,'关闭车灯');await expect.poll(()=>actual(page).then(a=>[a.headlights,a.turnSignal])).toEqual(['off','off']);await info.attach('actual-light-modes',{body:JSON.stringify(records,null,2),contentType:'application/json'});
});
test('I5 cabin physical strips change color and brightness; actual cockpit hotspots toggle lamps',async({page},info)=>{
  await ready(page);await page.getByRole('button',{name:'进入座舱',exact:true}).click();await page.getByRole('button',{name:'打开氛围灯',exact:true}).click();await command(page,'氛围灯换成紫色，亮度设为百分之四十');await expect.poll(()=>actual(page).then(a=>a.ambient.power)).toBe(.4);
  await page.screenshot({path:`docs/assets/i4-i6/I5-cabin-purple40-${info.project.name}.png`});
  await command(page,'氛围灯再亮一点');await expect.poll(()=>actual(page).then(a=>a.ambient.power)).toBe(.5);await command(page,'氛围灯换成蓝色，亮度设为百分之百');await expect.poll(()=>actual(page).then(a=>a.ambient.power)).toBe(1);await page.screenshot({path:`docs/assets/i4-i6/I5-cabin-blue100-${info.project.name}.png`});
  const ambient=page.getByRole('button',{name:'模型热点：氛围灯',exact:true});await expect(ambient).toBeVisible();await ambient.click();await expect.poll(()=>actual(page).then(a=>a.ambient.power)).toBe(0);
  const lights=page.getByRole('button',{name:'模型热点：灯光按键',exact:true});await expect(lights).toBeVisible();await lights.click();await expect.poll(()=>actual(page).then(a=>a.headlights)).toBe('low');
  await command(page,'不要打开双闪');expect((await actual(page)).turnSignal).toBe('off');
});
