import { test, expect, type Page } from '@playwright/test';
import { corners, windowLabels, type Corner } from '../../packages/shared/src/windows';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '全部打开', exact: true })).toBeEnabled();
}
const pose = (page: Page, corner: Corner) => page.locator('canvas').getAttribute(`data-window-${corner}-openness`).then(Number);
const targets = async (page: Page) => JSON.parse((await page.getByRole('complementary', { name: '四窗控制', exact: true }).getAttribute('data-window-targets'))!);
async function command(page: Page, value: string) {
  await page.getByRole('textbox', { name: '车辆文字指令', exact: true }).fill(value);
  await page.getByRole('button', { name: '发送', exact: false }).click();
}
test('each real window independently reaches 0, 50, 100 and continuous slider positions', async ({ page }, info) => {
  await ready(page);
  const records=[];
  for (const corner of corners) {
    await page.getByRole('button', { name: '全部关闭', exact: true }).click();
    for (const value of [0, .5, 1]) {
      const label=value===0?`关闭${windowLabels[corner]}`:value===.5?`${windowLabels[corner]}打开一半`:`完全打开${windowLabels[corner]}`;
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect.poll(()=>pose(page,corner)).toBe(value);
      for(const other of corners.filter(c=>c!==corner))await expect.poll(()=>pose(page,other)).toBe(0);
      records.push({corner,openness:value,position:await page.locator('canvas').getAttribute(`data-window-${corner}-position`),targets:await targets(page)});
    }
    const slider=page.getByRole('slider',{name:`${windowLabels[corner]}开度`,exact:true});
    await slider.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
    await expect.poll(()=>pose(page,corner)).toBe(.01);
  }
  await info.attach('actual-window-poses',{body:JSON.stringify(records,null,2),contentType:'application/json'});
});
test('text rules, ambiguity, relative operations, negation and unknown clauses share state', async ({ page }) => {
  await ready(page);await command(page,'左前窗开一半');await expect.poll(()=>pose(page,'fl')).toBe(.5);
  await command(page,'再关一点');await expect.poll(()=>pose(page,'fl')).toBe(.4);
  await page.getByRole('button',{name:'新对话',exact:true}).click();
  await command(page,'打开车窗');await expect(page.getByRole('group',{name:'请选择车窗'})).toBeVisible();
  expect((await targets(page)).rr.openness).toBe(0);
  await page.getByRole('group',{name:'请选择车窗'}).getByRole('button',{name:'左后车窗',exact:true}).click();
  await expect.poll(()=>pose(page,'rl')).toBe(1);
  await command(page,'不要打开左前车窗，右后窗开一半');await expect.poll(()=>pose(page,'rr')).toBe(.5);
  expect((await targets(page)).fl.openness).toBe(.4);
  const before=await targets(page);await command(page,'左前打开，顺便启动雨刷');
  await expect(page.getByTestId('console-feedback')).toContainText('智能助手尚未配置');expect(await targets(page)).toEqual(before);
  expect(JSON.parse((await page.locator('canvas').getAttribute('data-vehicle-state'))!).wipers.mode).toBe('off');
});
test('3D window selection works for open apertures; camera dragging never operates a window', async ({ page }) => {
  await ready(page);await page.getByRole('button',{name:'左方视角',exact:true}).click();
  await expect.poll(()=>page.locator('canvas').getAttribute('data-window-fl-hitpoint')).not.toBeNull();
  const rect=(await page.locator('canvas').boundingBox())!;
  const point=async()=>{const [x,y]=(await page.locator('canvas').getAttribute('data-window-fl-hitpoint'))!.split(',').map(Number);return {x:x+rect.x,y:y+rect.y};};
  let p=await point();await page.mouse.click(p.x,p.y);
  await expect(page.getByRole('button',{name:'左前车窗 FL',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'完全打开左前车窗',exact:true}).click();await expect.poll(()=>pose(page,'fl')).toBe(1);
  await page.getByRole('button',{name:'右后车窗 RR',exact:true}).click();
  p=await point();await page.mouse.click(p.x,p.y);await expect(page.getByRole('button',{name:'左前车窗 FL',exact:true})).toHaveAttribute('aria-pressed','true');
  const before=await targets(page);await page.getByRole('button',{name:'右后车窗 RR',exact:true}).click();p=await point();
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+150,p.y+15,{steps:12});await page.mouse.up();
  await expect(page.getByRole('button',{name:'右后车窗 RR',exact:true})).toHaveAttribute('aria-pressed','true');expect(await targets(page)).toEqual(before);
});
test('reverses an active animation and preserves a real intermediate pose', async ({ page }) => {
  await ready(page);await page.getByRole('button',{name:'完全打开左前车窗',exact:true}).click();
  await page.waitForTimeout(160);const middle=await pose(page,'fl');expect(middle).toBeGreaterThan(0);expect(middle).toBeLessThan(1);
  await page.getByRole('button',{name:'关闭左前车窗',exact:true}).click();await expect.poll(()=>pose(page,'fl')).toBe(0);
  for(const c of ['fr','rl','rr'] as const)expect(await pose(page,c)).toBe(0);
});
test('fixed-view actual openings at zero half and full',async({page},info)=>{
  await ready(page);
  for(const side of ['左','右']){
    await page.getByRole('button',{name:`${side}方视角`,exact:true}).click();
    await page.mouse.move(700,380);await page.mouse.wheel(0,-250);
    for(const [label,value] of [['所有车窗关闭',0],['所有车窗开一半',.5],['所有车窗打开',1]] as const){
      await command(page,label);for(const c of corners)await expect.poll(()=>pose(page,c)).toBe(value);
      await page.screenshot({path:`docs/assets/i4-i6/windows-${side}-${value*100}-${info.project.name}.png`});
    }
  }
});
