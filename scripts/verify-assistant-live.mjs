// Explicit real DeepSeek tools + actual browser renderer. Text input, not human speech.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const cases=[],add=(text,key,value)=>cases.push({text,expected:key?[[key,value]]:[]});
for(const [corner,label]of Object.entries({fl:'左前',fr:'右前',rl:'左后',rr:'右后'}))for(const [noun,component]of [['车窗','window'],['车门','door']]){
 add(`${label}${noun}打开百分之三十五`,`${component}:${corner}:openness`,.35);add('再开大一点',`${component}:${corner}:openness`,.45);add(`查询${label}${noun}开度`);add(`关闭${label}${noun}`,`${component}:${corner}:openness`,0);
}
for(const [name,component,target]of [['后备箱','trunk','rear'],['前备箱','frunk','front']]){add(`${name}开到三成`,`${component}:${target}:openness`,.3);add('再关小一点',`${component}:${target}:openness`,.2);add(`查询${name}开度`);add(`关闭${name}`,`${component}:${target}:openness`,0);}
add('打开近光灯','headlights:front:mode','low');add('前灯亮度设为百分之四十','headlights:front:brightness',.4);add('前灯再暗一点','headlights:front:brightness',.3);add('查询前灯亮度');add('打开远光灯','headlights:front:mode','high');add('查询前灯模式');add('关闭前灯','headlights:front:mode','off');
for(const [text,value]of [['打开左转向灯','left'],['打开右转向灯','right'],['打开双闪','hazard'],['查询转向灯模式',undefined],['关闭转向灯','off']])add(text,value?'turnSignal:vehicle:mode':undefined,value);
for(const [name,target]of [['前排','front'],['后排','rear']]){add(`打开${name}顶灯`,`cabinLight:${target}:enabled`,true);add(`${name}顶灯亮度设为百分之四十`,`cabinLight:${target}:brightness`,.4);add(`${name}顶灯再亮一点`,`cabinLight:${target}:brightness`,.5);add(`查询${name}顶灯亮度`);add(`查询${name}顶灯开关状态`);add(`关闭${name}顶灯`,`cabinLight:${target}:enabled`,false);}
add('打开氛围灯','ambient:cabin:enabled',true);add('换成蓝色');add('再暗一点','ambient:cabin:brightness',.3);add('氛围灯亮度设为百分之四十','ambient:cabin:brightness',.4);add('查询氛围灯亮度');add('查询氛围灯颜色');add('查询氛围灯开关');add('关闭氛围灯','ambient:cabin:enabled',false);
add('车漆换成#b13f47','paint:body:color','#b13f47');add('查询车漆颜色');
add('打开雨刷','wiper:front:mode','low');add('再快一档','wiper:front:mode','high');add('查询雨刷档位');add('再慢一档','wiper:front:mode','low');add('雨刷设为间歇档','wiper:front:mode','intermittent');add('雨刷刮一下','wiper:front:swipe',1);add('关掉','wiper:front:mode','off');
add('关闭丁达尔光束','scatter:scene:enabled',false);add('打开丁达尔光束','scatter:scene:enabled',true);add('空气散射强度设为百分之四十','scatter:scene:strength',.4);add('空气散射再增强一点','scatter:scene:strength',.5);add('查询空气散射强度');add('查询丁达尔光束开关');add('打开夜间观察','observation:scene:night',true);add('查询夜间观察状态');add('关闭夜间观察','observation:scene:night',false);
cases.push({text:'把左前窗开一半，同时把后备箱打开',expected:[['window:fl:openness',.5],['trunk:rear:openness',1]]});add('左前窗先开到百分之二十，然后再开大十个百分点','window:fl:openness',.3);
cases.push({text:'不要打开右后车门',noChange:true},{text:'打开左前车窗同时打开空调',kind:'unsupported',noChange:true},{text:'那个嗯啊',kind:'not_understood',noChange:true},{text:'打开顶灯',kind:'clarify',noChange:true},{text:'前排',expected:[['cabinLight:front:enabled',true]]},{text:'把灯调亮',expected:[['cabinLight:front:brightness',.1]],relativeExpected:true},{text:'取消',noChange:true});
if(process.env.CASE_RANGE){const [a,b]=process.env.CASE_RANGE.split(':').map(Number);cases.splice(b);cases.splice(0,a);}
if(process.env.CASE_FILTER){const re=new RegExp(process.env.CASE_FILTER);for(let i=cases.length-1;i>=0;i--)if(!re.test(cases[i].text))cases.splice(i,1);}
await mkdir('docs/validation/i7-i9',{recursive:true});await mkdir('docs/assets/i7-i9',{recursive:true});
const report={at:new Date().toISOString(),mode:'real-DeepSeek-function-calling+actual-WebGL-renderer-text-input',human:false,cases:[],errors:[],passed:false};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']}),page=await browser.newPage({viewport:{width:1920,height:1080}});
page.on('pageerror',e=>report.errors.push(e.message));let plans=[],receipts=[],finals=[];
page.on('response',async r=>{try{if(r.url().endsWith('/api/assistant/plan'))plans.push({http:r.status(),...await r.json()});if(r.url().endsWith('/api/assistant/finish'))finals.push({http:r.status(),...await r.json()});}catch{/* interrupted response */}});
page.on('request',r=>{if(r.url().endsWith('/api/assistant/finish'))receipts.push(r.postDataJSON());});
const actual=async()=>JSON.parse(await page.locator('canvas').getAttribute('data-vehicle-actual'));
try{
 await page.goto(process.env.DEMO_URL??'http://localhost:3000');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await page.getByRole('checkbox',{name:'语音反馈',exact:true}).uncheck();await page.getByRole('button',{name:'操作帮助',exact:true}).click();await page.getByRole('button',{name:'调试记录',exact:false}).click();await page.getByRole('combobox',{name:'助手路由'}).selectOption('llm');await page.getByRole('button',{name:'关闭调试记录',exact:true}).click();
 for(const [index,c]of cases.entries()){
  const before=await actual();plans=[];receipts=[];finals=[];const start=Date.now();const textbox=page.getByRole('textbox',{name:'车辆文字指令',exact:true});await textbox.fill(c.text);await page.getByRole('button',{name:'发送',exact:false}).click();
  if(c.text==='取消'){await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪');expect(await actual()).toEqual(before);report.cases.push({index,input:c.text,route:'rules-cancellation',passed:true,actual:await actual()});continue;}
  await expect.poll(()=>plans.length,{timeout:40000}).toBeGreaterThan(0);expect(plans[0].http,JSON.stringify(plans[0])).toBe(200);
  await expect.poll(()=>finals.length,{timeout:40000}).toBeGreaterThan(0);expect(finals[0].http,JSON.stringify(finals[0])).toBe(200);
  await expect(page.getByTestId('speech-phase')).toHaveText(/准备就绪|等待澄清/,{timeout:10000});
  for(const [key,value]of c.expected??[])await expect.poll(async()=>(await actual())[key]).toBe(c.relativeExpected?Math.min(1,Math.round((before[key]+value)*10000)/10000):value);
  const after=await actual();if(c.noChange)expect(after).toEqual(before);
  if(c.kind&&!c.optionalClarify)expect(plans[0].reply?.kind).toBe(c.kind);
  expect(receipts[0].results.map(r=>r.tool_call_id)).toEqual(plans[0].calls.map(c=>c.id));expect(receipts[0].results.every(r=>r.status==='completed')).toBe(true);
  const entry={index,input:c.text,plan:plans[0],receipts:receipts[0],final:finals[0],feedback:await page.getByTestId('console-feedback').innerText(),actual:after,appearance:JSON.parse(await page.locator('canvas').getAttribute('data-appearance')),cabin:JSON.parse(await page.locator('canvas').getAttribute('data-cabin-main-lights')),volume:JSON.parse(await page.locator('canvas').getAttribute('data-volume')),elapsedMs:Date.now()-start,passed:true};report.cases.push(entry);
  await writeFile('docs/validation/i7-i9/live-capability-progress.json',JSON.stringify(report,null,2)+'\n');console.log(`${index+1}/${cases.length} ${c.text} → ${plans[0].calls.map(c=>c.function.name).join(',')}`);
  if(index%15===0)await page.screenshot({path:`docs/assets/i7-i9/llm-${index}.png`});
 }
 report.passed=report.errors.length===0;
}catch(e){report.failedAttempt={input:cases[report.cases.length],plans,receipts,finals,actual:await actual()};report.error=String(e.message).slice(0,1000);process.exitCode=1;}
finally{await browser.close();await writeFile(`docs/validation/i7-i9/live-capabilities${process.env.CASE_RANGE?'-range-'+process.env.CASE_RANGE.replace(':','-'):process.env.CASE_FILTER?'-filtered':''}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,error:report.error,errors:report.errors}));}
