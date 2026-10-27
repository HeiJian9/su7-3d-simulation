import {test,expect,type Page} from '@playwright/test';
const pose=async(p:Page)=>JSON.parse((await p.locator('canvas').getAttribute('data-wipers'))!);
async function ready(p:Page){await p.goto('/');await expect(p.getByRole('button',{name:'全部打开',exact:true})).toBeEnabled();await p.getByRole('button',{name:'雨刷',exact:true}).click();await expect(p.getByRole('button',{name:'刮一下',exact:true})).toBeEnabled();}
async function text(p:Page,s:string){await p.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill(s);await p.getByRole('button',{name:'发送',exact:false}).click();}
test('I6 genuine twin wipers single sweep, continuous gears, phase change and stop parking',async({page},info)=>{
  await ready(page);await page.getByRole('button',{name:'刮一下',exact:true}).click();await expect.poll(()=>pose(page).then(p=>p.completedOnce)).toBe(1);expect((await pose(page)).fraction).toBe(0);
  const records=[];
  for(const [label,mode] of [['间歇雨刷','intermittent'],['低速雨刷','low'],['高速雨刷','high']] as const){await page.getByRole('button',{name:label,exact:true}).click();const start=(await pose(page)).cycles;await page.waitForTimeout(4200);const p=await pose(page);records.push({mode,cycles:p.cycles-start});}
  expect(records[2].cycles).toBeGreaterThan(records[1].cycles);expect(records[1].cycles).toBeGreaterThan(records[0].cycles);
  await page.getByRole('button',{name:'低速雨刷',exact:true}).click();await expect.poll(()=>pose(page).then(p=>p.fraction)).toBeGreaterThan(.2);const before=await pose(page);await page.getByRole('button',{name:'高速雨刷',exact:true}).click();const after=await pose(page);expect(Math.abs(after.fraction-before.fraction)).toBeLessThan(.65);
  await page.getByRole('button',{name:'关闭雨刷',exact:true}).click();await expect.poll(()=>pose(page).then(p=>p.parked&&p.fraction===0&&p.appliedMode==='off')).toBe(true);await page.waitForTimeout(300);expect((await pose(page)).fraction).toBe(0);
  await info.attach('actual-wiper-cadence',{body:JSON.stringify({records,before,after,park:await pose(page)},null,2),contentType:'application/json'});
});
test('I6 rules and labelled cabin entry work while camera and other components remain usable',async({page},info)=>{
  await ready(page);await text(page,'打开雨刷');await expect.poll(()=>pose(page).then(p=>p.requestedMode)).toBe('low');await text(page,'雨刷再快一点');await expect.poll(()=>pose(page).then(p=>p.requestedMode)).toBe('high');
  await text(page,'左前门打开一半，左前车窗打开一半，打开双闪');await expect.poll(()=>page.locator('canvas').getAttribute('data-door-fl-openness').then(Number)).toBe(.5);await expect.poll(()=>page.locator('canvas').getAttribute('data-window-fl-openness').then(Number)).toBe(.5);expect((await pose(page)).requestedMode).toBe('high');
  await page.getByRole('button',{name:'低速雨刷',exact:true}).click();await page.getByRole('button',{name:'前方视角',exact:true}).click();await page.waitForTimeout(120);await page.mouse.move(900,350);await page.mouse.wheel(0,-700);await page.waitForTimeout(180);
  const nearPeak=()=>expect.poll(()=>pose(page).then(p=>p.phase>.4&&p.phase<.45),{intervals:[20],timeout:8000}).toBe(true);
  await nearPeak();const exteriorBefore=await pose(page);await page.screenshot({path:`docs/assets/i4-i6/I6-exterior-sweep-${info.project.name}.png`});const exteriorAfter=await pose(page);expect(exteriorAfter.fraction).toBeGreaterThan(.8);
  await page.getByRole('button',{name:'进入座舱',exact:true}).click();await expect(page.getByRole('button',{name:'模型热点：雨刷按键',exact:true})).toBeVisible();await nearPeak();const cabinBefore=await pose(page);await page.screenshot({path:`docs/assets/i4-i6/I6-cabin-sweep-${info.project.name}.png`});const cabinAfter=await pose(page);expect(cabinAfter.fraction).toBeGreaterThan(.8);
  await info.attach('actual-screenshot-wiper-poses',{body:JSON.stringify({exteriorBefore,exteriorAfter,cabinBefore,cabinAfter},null,2),contentType:'application/json'});
  await page.getByRole('button',{name:'模型热点：雨刷按键',exact:true}).click();await expect.poll(()=>pose(page).then(p=>p.parked&&p.appliedMode==='off')).toBe(true);
  await text(page,'不要打开雨刷');expect((await pose(page)).requestedMode).toBe('off');
});
