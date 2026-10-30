import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import path from 'node:path';
import express from 'express';
import {welcomeRoutes} from '../../apps/server/src/welcome';
test('real remote events animate independent pixels, preserve indicators and project four door gobos',async({page,context},info)=>{
 test.setTimeout(90000);await mkdir('docs/assets/welcome',{recursive:true});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();
 await page.getByRole('button',{name:'灯光外观',exact:true}).click();
 await expect(page.getByRole('button',{name:'流星雨迎宾',exact:true})).toBeEnabled();
 const canvas=page.locator('canvas'),read=async(attr='data-welcome')=>JSON.parse((await canvas.getAttribute(attr))!);
 await expect.poll(async()=>(await read()).units).toBe(96);
 await page.getByRole('button',{name:'灯组细节',exact:true}).click();await page.getByRole('button',{name:'柔光展厅',exact:true}).click();
 await page.getByRole('button',{name:'打开双闪',exact:false}).count().then(async n=>{if(n)await page.getByRole('button',{name:'打开双闪',exact:false}).click();else await page.getByRole('button',{name:'双闪',exact:true}).click();});
 const before=await read('data-appearance');
 const remote=await context.newPage();await remote.goto('/remote');await expect(remote.getByRole('button',{name:'流星雨迎宾',exact:true})).toBeEnabled();
 await remote.getByRole('button',{name:'流星雨迎宾',exact:true}).click();await expect.poll(async()=>(await read()).active).toBe(true);
 const frames=[];for(let i=0;i<8;i++){frames.push(await read());if(i===1||i===4)await page.screenshot({path:`docs/assets/welcome/matrix-scan-${i}-${info.project.name}.png`});await page.waitForTimeout(130);}
 expect(frames.some(f=>new Set(f.powers[0].map((p:number)=>p.toFixed(2))).size>2)).toBe(true);
 for(const f of frames)for(let m=0;m<4;m++)expect(f.powers[m]).toEqual(f.powers[m+4]);
 await page.screenshot({path:`docs/assets/welcome/meteor-${info.project.name}.png`});
 await page.getByRole('button',{name:'灯组细节',exact:true}).click();await page.waitForTimeout(1700);await page.screenshot({path:`docs/assets/welcome/matrix-detail-${info.project.name}.png`});
 await expect.poll(async()=>(await read()).active,{timeout:7000}).toBe(false);
 const after=await read('data-appearance');expect(after.headlights).toBe(before.headlights);expect(after.turnSignal).toBe('hazard');
 await remote.getByRole('button',{name:'锁定车辆',exact:true}).click();await remote.getByRole('button',{name:'解锁车辆',exact:true}).click();await expect.poll(async()=>(await read()).active).toBe(true);
 await page.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill('四个车门全部打开');await page.getByRole('button',{name:'发送',exact:false}).click();
 await expect.poll(async()=>(await read()).projections.every((p:{power:number})=>p.power>.99),{timeout:8000}).toBe(true);
 const open=await read();for(const p of open.projections){expect(p.ground[1]).toBeCloseTo(-.015,5);expect(p.gobo&&p.castsShadow).toBe(true);expect(Math.abs(p.ground[0])).toBeGreaterThan(.95);}
 await page.getByRole('button',{name:'投影视角',exact:true}).click();
 await page.screenshot({path:`docs/assets/welcome/door-logos-${info.project.name}.png`});
 await page.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill('关闭所有车门');await page.getByRole('button',{name:'发送',exact:false}).click();
 await expect.poll(async()=>(await read()).projections.every((p:{power:number})=>p.power===0),{timeout:8000}).toBe(true);
 expect(errors).toEqual([]);await info.attach('welcome-rendered',{body:JSON.stringify({frames,open,after,errors,realApi:false}),contentType:'application/json'});await remote.close();
});

test('each door projects visible ground pixels independently and the footprint follows its real hinge',async({page},info)=>{
 test.setTimeout(90000);await mkdir('docs/assets/welcome',{recursive:true});await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();
 await page.getByRole('button',{name:'灯光外观',exact:true}).click();await page.getByRole('button',{name:'柔光展厅',exact:true}).click();
 const canvas=page.locator('canvas'),read=async()=>JSON.parse((await canvas.getAttribute('data-welcome'))!);
 const command=async(text:string)=>{await page.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill(text);await page.getByRole('button',{name:'发送',exact:false}).click();};
 for(const [corner,label]of [['fl','左前'],['rl','左后'],['fr','右前'],['rr','右后']]){
  await page.getByRole('button',{name:corner.endsWith('l')?'左侧投影视角':'投影视角',exact:true}).click();
  await command(`${label}门打开一半`);await expect.poll(()=>canvas.getAttribute(`data-door-${corner}-openness`).then(Number)).toBe(.5);
  await expect.poll(async()=>(await read()).projections.find((p:{corner:string})=>p.corner===corner).power).toBeGreaterThan(.99);
  const half=(await read()).projections.find((p:{corner:string})=>p.corner===corner).ground;
  await command(`${label}门全部打开`);await expect.poll(()=>canvas.getAttribute(`data-door-${corner}-openness`).then(Number)).toBe(1);
  const state=await read(),p=state.projections.find((p:{corner:string})=>p.corner===corner);expect(p.ground).not.toEqual(half);
  expect(state.projections.filter((q:{corner:string})=>q.corner!==corner).every((q:{power:number})=>q.power===0)).toBe(true);
  const on=await canvas.screenshot();await page.screenshot({path:`docs/assets/welcome/logo-${corner}-${info.project.name}.png`});
  await command(`${label}门关闭`);await expect.poll(async()=>(await read()).projections.every((q:{power:number})=>q.power===0),{timeout:8000}).toBe(true);
  const off=await canvas.screenshot();
  const pixels=await page.evaluate(async({on,off,ndc})=>{
   const decode=async(data:string)=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'}));const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);image.close();return ctx.getImageData(0,0,c.width,c.height);};
   const a=await decode(on),b=await decode(off),cx=(ndc[0]+1)*a.width/2,cy=(1-ndc[1])*a.height/2;let bright=0;
   for(let y=Math.max(0,Math.floor(cy-60));y<Math.min(a.height,cy+60);y++)for(let x=Math.max(0,Math.floor(cx-90));x<Math.min(a.width,cx+90);x++){const i=(y*a.width+x)*4;if(Math.min(a.data[i],a.data[i+1],a.data[i+2])>100&&(a.data[i]+a.data[i+1]+a.data[i+2]-b.data[i]-b.data[i+1]-b.data[i+2])>100)bright++;}return bright;
  },{on:on.toString('base64'),off:off.toString('base64'),ndc:p.ndc});
  expect(pixels,`${corner} must visibly illuminate the ground`).toBeGreaterThan(35);
  await info.attach(`logo-${corner}`,{body:JSON.stringify({half,full:p.ground,pixels}),contentType:'application/json'});
 }
});

test('normal low/high beams survive welcome, mid-animation controls and expired event reconnects',async({page,context})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();await page.getByRole('button',{name:'灯光外观',exact:true}).click();
 const canvas=page.locator('canvas'),read=async(attr:string)=>JSON.parse((await canvas.getAttribute(attr))!);
 await page.getByRole('button',{name:'近光灯',exact:true}).click();
 await expect.poll(async()=>Object.values((await read('data-appearance')).nativeLamps.projectors).flat().map(p=>p.power)).toEqual([4,4,0,0,4,4,0,0]);
 await page.getByRole('button',{name:'流星雨迎宾',exact:true}).click();await expect.poll(async()=>(await read('data-welcome')).active).toBe(true);
 await page.getByRole('button',{name:'远光灯',exact:true}).click();await expect.poll(async()=>Object.values((await read('data-appearance')).nativeLamps.projectors).flat().map(p=>p.power)).toEqual(Array(8).fill(10));
 await expect.poll(async()=>(await read('data-welcome')).active,{timeout:6500}).toBe(false);expect((await read('data-welcome')).powers.flat()).toEqual(Array(96).fill(.3));
 // Joining after completion must not replay a stale event on the new renderer.
 const late=await context.newPage();await late.goto('/');await expect(late.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await expect.poll(()=>late.locator('canvas').getAttribute('data-welcome').then(s=>s&&JSON.parse(s).active)).toBe(false);await late.close();
});

test('paired remote works on actual private-address HTTP without secure-context crypto',async({browser})=>{
 const lan=Object.entries(networkInterfaces()).filter(([name])=>!/VPN|VMware|VMnet|Virtual/i.test(name)).flatMap(([,addresses])=>addresses??[]).find(a=>a.family==='IPv4'&&!a.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(a.address));test.skip(!lan,'No private interface available');
 const app=express();app.use('/api/welcome',express.json(),welcomeRoutes());app.use(express.static(path.resolve('apps/web/dist')));app.get('/remote',(_req,res)=>res.sendFile(path.resolve('apps/web/dist/index.html')));
 const server=app.listen(0,'0.0.0.0');await new Promise<void>(r=>server.once('listening',r));const address=server.address();if(!address||typeof address==='string')throw Error();
 const base=`http://${lan!.address}:${address.port}`,pair=await(await fetch(`http://127.0.0.1:${address.port}/api/welcome/pair`)).json();
 const directBrowser=await browser.browserType().launch({channel:'msedge',headless:true,args:['--no-proxy-server']});const context=await directBrowser.newContext();
 try{
  const page=await context.newPage();await page.goto(`${base}/remote?token=${pair.token}`);expect(await page.evaluate(()=>isSecureContext)).toBe(false);
  await expect(page.getByRole('button',{name:'流星雨迎宾',exact:true})).toBeEnabled();await page.getByRole('button',{name:'流星雨迎宾',exact:true}).click();
  const state=async()=>await(await fetch(`${base}/api/welcome/state`,{headers:{Authorization:`Bearer ${pair.token}`}})).json();
  await expect.poll(async()=>(await state()).event?.source).toBe('manual');expect((await state()).event.id).toHaveLength(32);
 }finally{await context.close();await directBrowser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
