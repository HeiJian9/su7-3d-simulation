import {test,expect} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {Box3,Matrix4,Vector3} from 'three';

test('dashboard crown remains continuous and legible at low brightness and close viewpoints',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await mkdir('docs/assets/native-crown',{recursive:true});await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();
 await page.getByRole('button',{name:'氛围空间',exact:true}).click();await page.getByRole('button',{name:'氛围配色：暮光紫',exact:true}).click();await page.getByRole('button',{name:'柔光展厅',exact:true}).click();
 const canvas=page.locator('canvas');const native=async()=>JSON.parse((await canvas.getAttribute('data-native-ambient'))!);
 await expect.poll(async()=>(await native()).routeCount).toBe(31);
 const binding=await native();expect(binding.zones.find((z:{node:string})=>z.node==='Mesh54').routes).toEqual(['dashboard-crown-left','dashboard-crown-right']);
 expect(binding.replaced).toContain('AMBIENT_DASH_CROWN_LEFT');expect(binding.replaced).toContain('AMBIENT_DASH_CROWN_RIGHT');
 expect(await canvas.getAttribute('data-dashboard-profile')).toBeNull();
 for(const value of [40,65]){
  await page.getByRole('slider',{name:'氛围灯亮度',exact:true}).fill(String(value));await expect.poll(async()=>(await native()).power).toBe(value/100);
  await page.screenshot({path:`docs/assets/native-crown/front-${value}-${info.project.name}.png`});
 }
 // Move slightly closer using the existing camera control; do not inject a scene transform.
 const box=(await canvas.boundingBox())!;await page.mouse.move(box.x+box.width*.62,box.y+box.height*.44);await page.mouse.wheel(0,-100);await page.waitForTimeout(200);
 await page.screenshot({path:`docs/assets/native-crown/close-${info.project.name}.png`});
 await page.getByRole('slider',{name:'氛围灯亮度',exact:true}).fill('0');await expect.poll(async()=>(await native()).emission).toBe(0);expect(errors).toEqual([]);
 await page.screenshot({path:`docs/assets/native-crown/off-${info.project.name}.png`});
 await info.attach('native-crown',{body:JSON.stringify({native:await native(),errors,realSpeech:false}),contentType:'application/json'});
});

test('both dashboard to door joints meet smoothly in macro views',async({page},info)=>{
 await mkdir('docs/assets/native-crown',{recursive:true});
 const nativePaths=JSON.parse(await readFile('apps/web/src/data/native-ambient-paths.json','utf8')) as Record<string,Array<{points:Array<[number,number,number]>}>>;
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('apps/web/public/models/su7-runtime.glb'),bounds=new Box3();
 for(const node of doc.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()??[]){
  const p=primitive.getAttribute('POSITION')!,matrix=new Matrix4().fromArray(node.getWorldMatrix());for(let i=0;i<p.getCount();i++)bounds.expandByPoint(new Vector3().fromArray(p.getArray()!,i*3).applyMatrix4(matrix));
 }
 const shift=bounds.getCenter(new Vector3()).multiplyScalar(-1);shift.y=-bounds.min.y+.025;
 await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();
 await page.getByRole('button',{name:'氛围空间',exact:true}).click();await page.getByRole('button',{name:'氛围配色：暮光紫',exact:true}).click();await page.getByRole('slider',{name:'氛围灯亮度',exact:true}).fill('40');
 const canvas=page.locator('canvas');
 for(const [side,path]of [['left',nativePaths.Mesh47[0]],['right',nativePaths.Mesh34[0]]] as const){
  await page.getByRole('button',{name:'全舱视角',exact:true}).click();
  const target=new Vector3(...path.points[0]).add(shift),eye=new Vector3(0,1.22,.32),direction=target.clone().sub(eye),yaw=Math.atan2(-direction.x,-direction.z),pitch=Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
  const box=(await canvas.boundingBox())!,x=box.x+box.width*.60,y=box.y+box.height*.45;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-yaw/.003,y-(pitch-Math.atan2(-.36,1))/.003,{steps:12});await page.mouse.up();
  let move=direction.length()-.20;while(move>.0001){const step=Math.min(.30,move);await page.mouse.wheel(0,-step/.0025);await page.waitForTimeout(30);move-=step;}
  await page.screenshot({path:`docs/assets/native-crown/${side}-macro-${info.project.name}.png`});
 }
});
