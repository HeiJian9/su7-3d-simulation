import {test,expect,type Page} from '@playwright/test';
import {corners,doorLabels} from '../../packages/shared/src/vehicle';
const pose=(p:Page,part:string)=>p.locator('canvas').getAttribute(`data-${part.replaceAll(':','-')}-openness`).then(Number);
async function ready(page:Page){await page.goto('/');await expect(page.getByRole('button',{name:'全部打开',exact:true})).toBeEnabled();await page.getByRole('button',{name:'门与尾箱',exact:true}).click();}
async function text(p:Page,s:string){await p.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill(s);await p.getByRole('button',{name:'发送',exact:false}).click();}
test('I4 four independent original doors and trunk reach zero half full, reverse and stay isolated',async({page},info)=>{
  test.setTimeout(90000);await ready(page);const records=[];
  for(const c of [...corners,'rear' as const]){
    const label=c==='rear'?'后备箱':doorLabels[c],part=c==='rear'?'trunk:rear':`door:${c}`;
    for(const [suffix,value] of [['关闭',0],['半开',.5],['全开',1]] as const){await page.getByRole('button',{name:label+suffix,exact:true}).click();await expect.poll(()=>pose(page,part)).toBe(value);records.push({part,value,matrix:await page.locator('canvas').getAttribute(`data-${part.replace(':','-')}-matrix`)});}
    await page.getByRole('button',{name:label+'关闭',exact:true}).click();await expect.poll(()=>pose(page,part)).toBe(0);
    for(const other of corners)expect(await pose(page,`door:${other}`)).toBe(0);
  }
  await page.getByRole('button',{name:'左前车门全开',exact:true}).click();await page.waitForTimeout(180);const mid=await pose(page,'door:fl');expect(mid).toBeGreaterThan(0);expect(mid).toBeLessThan(1);
  await page.getByRole('button',{name:'左前车门关闭',exact:true}).click();await expect.poll(()=>pose(page,'door:fl')).toBe(0);
  await info.attach('mechanical-actual-poses',{body:JSON.stringify({records,reversal:mid},null,2),contentType:'application/json'});
});
test('I4 every window keeps its local travel at all three door angles; rules and clarify use the same state',async({page},info)=>{
  test.setTimeout(100000);await ready(page);const records=[];
  for(const c of corners)for(const door of [0,.5,1]){
    await text(page,`${doorLabels[c]}开到${door*100}%`);await expect.poll(()=>pose(page,`door:${c}`)).toBe(door);
    for(const win of [0,.5,1]){await text(page,`${doorLabels[c].replace('门','窗')}开到${win*100}%`);await expect.poll(()=>pose(page,`window:${c}`)).toBe(win);expect(await pose(page,`door:${c}`)).toBe(door);records.push({c,door,win,localPosition:await page.locator('canvas').getAttribute(`data-window-${c}-position`)});}
    if(door===1){await text(page,`${doorLabels[c]}关闭`);await expect.poll(()=>pose(page,`door:${c}`)).toBe(0);}
  }
  await page.getByRole('button',{name:'新对话',exact:true}).click();await text(page,'打开车门');await expect(page.getByRole('group',{name:'请选择车门',exact:true})).toBeVisible();await page.getByRole('group',{name:'请选择车门',exact:true}).getByRole('button',{name:'左后车门',exact:true}).click();await expect.poll(()=>pose(page,'door:rl')).toBe(1);
  await text(page,'再关一点');await expect.poll(()=>pose(page,'door:rl')).toBe(.9);await text(page,'不要打开右后门');expect(await pose(page,'door:rr')).toBe(0);
  await info.attach('door-window-local-frame-combinations',{body:JSON.stringify(records,null,2),contentType:'application/json'});
});
test('I4 labelled model hotspots act on real parts; canvas drag cannot activate a part',async({page},info)=>{
  await ready(page);await page.getByRole('button',{name:'折叠车辆面板',exact:true}).click();await page.getByRole('button',{name:'左方视角',exact:true}).click();
  const hotspot=page.getByRole('button',{name:'模型热点：左前车门',exact:true});await expect(hotspot).toBeVisible();await page.screenshot({path:`docs/assets/i4-i6/I4-door-closed-${info.project.name}.png`});await hotspot.click();await expect.poll(()=>pose(page,'door:fl')).toBe(1);
  await page.screenshot({path:`docs/assets/i4-i6/I4-door-open-${info.project.name}.png`});
  await page.getByRole('button',{name:'左前车门关闭',exact:true}).click();await expect.poll(()=>pose(page,'door:fl')).toBe(0);
  const canvas=(await page.locator('canvas').boundingBox())!;await page.mouse.move(canvas.x+canvas.width*.55,canvas.y+canvas.height*.50);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.66,canvas.y+canvas.height*.55,{steps:12});await page.mouse.up();expect(await pose(page,'door:fl')).toBe(0);
  await page.getByRole('button',{name:'后方视角',exact:true}).click();await page.getByRole('button',{name:'折叠车辆面板',exact:true}).click();await page.screenshot({path:`docs/assets/i4-i6/I4-trunk-closed-${info.project.name}.png`});
  for(const [phrase,value] of [['后备箱打开一半',.5],['后备箱完全打开',1]] as const){await text(page,phrase);await expect.poll(()=>pose(page,'trunk:rear')).toBe(value);await page.screenshot({path:`docs/assets/i4-i6/I4-trunk-${value===1?'full':'half'}-${info.project.name}.png`});}
  await text(page,'所有车门打开一半');for(const c of corners)await expect.poll(()=>pose(page,`door:${c}`)).toBe(.5);
  for(const side of ['左','右']){await page.getByRole('button',{name:`${side}方视角`,exact:true}).click();await page.screenshot({path:`docs/assets/i4-i6/I4-all-doors-half-${side}-${info.project.name}.png`});}
});
