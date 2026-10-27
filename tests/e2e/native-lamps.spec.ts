import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
type Appearance={headlightPower:number[];turnSignal:string;signals:{left:boolean;right:boolean};nativeLamps:{projectors:Record<'left'|'right',Array<{node:string;material:string;power:number}>>;signals:Record<'left'|'right',Array<{material:string;power:number;color:string;offColor:string}>>}};
const actual=async(page:Page)=>JSON.parse((await page.locator('canvas').getAttribute('data-appearance'))!) as Appearance;
async function command(page:Page,text:string){await page.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill(text);await page.getByRole('button',{name:'发送',exact:false}).click();}
async function view(page:Page,name:string){
  await page.getByRole('button',{name:name+'方视角',exact:true}).click();await page.getByRole('button',{name:'自由观察',exact:true}).click();const box=(await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x+box.width*.55,box.y+box.height*.45);for(let i=0;i<6;i++){await page.mouse.wheel(0,-260);await page.waitForTimeout(60);}
  await page.mouse.down();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.45+55,{steps:8});await page.mouse.up();
}
test('native projector and inner rear modules emit yellow, restore original colours and follow the real trunk',async({page},info)=>{
  await mkdir('docs/assets/native-lamps',{recursive:true});await page.goto('/');await expect(page.getByRole('button',{name:'全部打开',exact:true})).toBeEnabled();await page.getByRole('button',{name:'灯光外观',exact:true}).click();
  const records=[];
  for(const [label,power,beam] of [['关闭前灯',0,0],['近光灯',4,1200],['远光灯',10,6500]] as const){
    await page.getByRole('button',{name:label,exact:true}).click();await expect.poll(async()=>{const a=await actual(page);return Object.values(a.nativeLamps.projectors).flat().every(p=>p.power===power);}).toBe(true);
    const a=await actual(page);expect(a.headlightPower).toEqual([beam,beam]);for(const caps of Object.values(a.nativeLamps.projectors)){expect(caps).toHaveLength(4);expect(caps.every(p=>p.node==='Mesh61')).toBe(true);}records.push(a);
  }
  await page.getByRole('button',{name:'近光灯',exact:true}).click();await page.getByRole('button',{name:'折叠车辆面板',exact:true}).click();await view(page,'前');await page.screenshot({path:`docs/assets/native-lamps/front-low-${info.project.name}.png`});
  await command(page,'关闭车灯');await command(page,'打开右转向灯');await expect.poll(async()=>(await actual(page)).signals.right).toBe(true);await page.screenshot({path:`docs/assets/native-lamps/front-turn-${info.project.name}.png`});
  let on=false,off=false;
  for(let i=0;i<10;i++){const a=await actual(page);expect(a.nativeLamps.signals.left.every(m=>m.power===0)).toBe(true);for(const m of Object.values(a.nativeLamps.signals).flat())expect(m.color).toBe(m.power>0?'ffd000':m.offColor);on ||= a.nativeLamps.signals.right.every(m=>m.power>0);off ||= a.nativeLamps.signals.right.every(m=>m.power===0);await page.waitForTimeout(100);}expect(on&&off).toBe(true);
  await view(page,'后');await command(page,'关闭转向灯');await command(page,'打开右转向灯');await expect.poll(async()=>(await actual(page)).signals.right).toBe(true);await page.screenshot({path:`docs/assets/native-lamps/rear-right-${info.project.name}.png`});
  await command(page,'打开双闪');await expect.poll(async()=>{const a=await actual(page);return a.signals.left&&a.signals.right;}).toBe(true);await page.screenshot({path:`docs/assets/native-lamps/rear-hazard-${info.project.name}.png`});
  await command(page,'后备箱打开一半');await expect.poll(()=>page.locator('canvas').getAttribute('data-trunk-rear-openness').then(Number)).toBe(.5);await command(page,'关闭转向灯');await command(page,'打开双闪');await expect.poll(async()=>{const a=await actual(page);return a.signals.left&&a.signals.right;}).toBe(true);await page.screenshot({path:`docs/assets/native-lamps/rear-open-${info.project.name}.png`});
  await command(page,'关闭车灯');await expect.poll(async()=>Object.values((await actual(page)).nativeLamps.signals).flat().every(m=>m.power===0&&m.color===m.offColor)).toBe(true);records.push(await actual(page));
  await info.attach('native-source-material-execution',{body:JSON.stringify({records,on,off,sourceGeometry:'docs/validation/native-lamps/native-membership.json',microphoneTest:false},null,2),contentType:'application/json'});
});
