import { test, expect, type Page, type Route } from '@playwright/test';
import { testWave } from './global-setup';

declare global { interface Window { __su7TestTracks?: MediaStreamTrack[] } }
async function instrument(page:Page){
  await page.addInitScript(()=>{
    const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(c)=>{const stream=await original(c);window.__su7TestTracks??=[];window.__su7TestTracks.push(...stream.getTracks());return stream;};
  });
}
const health={status:'ok',version:'0.3.0',providers:{mode:'test-mock',asr:{configured:true,model:'gemini-3.8-flash',protocol:'test-mock',audioFormats:['audio/wav'],missing:[],probe:'test-mock'},tts:{configured:true,model:'test-mock-tts',voice:'test-mock-zh',protocol:'test-mock',missing:[],probe:'test-mock'}}};
async function ready(page:Page,tts=true,formats=['audio/wav']){
  await instrument(page);await page.route('**/api/health',r=>r.fulfill({json:{...health,providers:{...health.providers,asr:{...health.providers.asr,audioFormats:formats},tts:{...health.providers.tts,configured:tts}}}}));
  await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();await expect(page.getByTestId('speech-mode')).toContainText('测试 Mock');
}
function requestId(route:Route){const body=route.request().postDataBuffer()!.toString('latin1');return body.match(/name="requestId"\r\n\r\n([^\r\n]+)/)![1];}
async function transcript(route:Route,text:string){await route.fulfill({json:{requestId:requestId(route),text,provider:'test-mock',model:'gemini-3.8-flash',durationMs:5,mock:true}});}
const pose=(page:Page,c='fl')=>page.locator('canvas').getAttribute(`data-window-${c}-openness`).then(Number);
const tracksStopped=async(page:Page)=>page.evaluate(()=>window.__su7TestTracks?.every(t=>t.readyState==='ended')??false);

test('Mock-only microphone VAD → transcript → real geometry → API audio playback',async({page},info)=>{
  let asr=0,tts=0;
  await page.route('**/api/speech/transcribe',async route=>{asr++;expect(route.request().postDataBuffer()!.length).toBeGreaterThan(1000);await transcript(route,'左前车窗打开一半');});
  await page.route('**/api/speech/synthesize',async route=>{tts++;expect(await pose(page)).toBe(.5);await route.fulfill({body:testWave(.35,true),contentType:'audio/wav'});});
  await ready(page);await page.getByRole('button',{name:'开始录音',exact:true}).click();
  await expect(page.getByTestId('transcript')).toContainText('左前车窗打开一半',{timeout:12000});await expect.poll(()=>pose(page)).toBe(.5);
  await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪');await expect.poll(()=>tracksStopped(page)).toBe(true);
  expect(asr).toBe(1);expect(tts).toBe(1);for(const c of ['fr','rl','rr'])expect(await pose(page,c)).toBe(0);
  await page.screenshot({path:`docs/assets/i4-i6/speech-MOCK-${info.project.name}.png`});
});
test('Mock clarification chooses one window and new recording stops old API playback',async({page})=>{
  let count=0;
  await page.route('**/api/speech/transcribe',async r=>transcript(r,++count===1?'打开车窗':'左后那个'));
  await page.route('**/api/speech/synthesize',r=>r.fulfill({body:testWave(5,true),contentType:'audio/wav'}));
  await ready(page);await page.getByRole('button',{name:'开始录音',exact:true}).click();
  await expect(page.getByRole('group',{name:'请选择车窗'})).toBeVisible({timeout:12000});
  await expect(page.getByTestId('speech-phase')).toHaveText('正在播报');for(const c of ['fl','fr','rl','rr'])expect(await pose(page,c)).toBe(0);
  await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect(page.getByTestId('speech-phase')).toContainText('正在录音');
  await expect.poll(()=>pose(page,'rl'),{timeout:12000}).toBe(1);expect(await pose(page,'fl')).toBe(0);
  await page.getByRole('button',{name:'停止播报',exact:true}).click();await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪');await expect.poll(()=>tracksStopped(page)).toBe(true);
});
test('Mock late ASR reply cannot override even an unchanged manual target',async({page})=>{
  let waiting:Route|undefined;
  await page.route('**/api/speech/transcribe',async route=>{waiting=route;});
  await ready(page,false);await page.getByRole('button',{name:'开始录音',exact:true}).click();
  await expect.poll(()=>!!waiting,{timeout:12000}).toBe(true);await expect.poll(()=>tracksStopped(page)).toBe(true);
  await page.getByRole('button',{name:'全部关闭',exact:true}).click();
  if(waiting)await transcript(waiting,'左前车窗打开');
  await page.waitForTimeout(500);expect(await pose(page)).toBe(0);await expect(page.getByTestId('speech-message')).toContainText('优先处理');
});
test('cancelling actual browser capture releases tracks and sends no audio',async({page})=>{
  let sent=0;await page.route('**/api/speech/transcribe',async route=>{sent++;await transcript(route,'左前窗打开');});
  await ready(page,false);await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect(page.getByTestId('speech-phase')).toContainText('正在录音');
  await page.getByRole('button',{name:'取消语音',exact:true}).click();await expect.poll(()=>tracksStopped(page)).toBe(true);expect(sent).toBe(0);expect(await pose(page)).toBe(0);
});
test('manual recording finish works before the silence timeout',async({page})=>{
  await page.route('**/api/speech/transcribe',r=>transcript(r,'右前窗开一半'));
  await ready(page,false);await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect(page.getByTestId('speech-message')).toContainText('正在聆听');
  await page.waitForTimeout(200);await page.getByRole('button',{name:'结束录音',exact:true}).click();await expect.poll(()=>pose(page,'fr')).toBe(.5);await expect.poll(()=>tracksStopped(page)).toBe(true);
});
test('Mock TTS failure preserves actual action and supports a separate replay',async({page})=>{
  await page.route('**/api/speech/transcribe',r=>transcript(r,'左前窗开一半'));
  let attempts=0;await page.route('**/api/speech/synthesize',r=>++attempts===1?r.fulfill({status:502,json:{code:'AUTH_FAILED',message:'测试 Mock：TTS 认证失败',retryable:false}}):r.fulfill({body:testWave(.2,true),contentType:'audio/wav'}));
  await ready(page);await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect(page.getByTestId('speech-message')).toContainText('车窗动作与文字保留',{timeout:12000});expect(await pose(page)).toBe(.5);
  await page.getByRole('button',{name:'重播',exact:true}).click();await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪');expect(attempts).toBe(2);expect(await pose(page)).toBe(.5);
});
for(const [name,code] of [['权限拒绝','NotAllowedError'],['无设备','NotFoundError']] as const){
  test(`Mock microphone error: ${name}; manual control survives`,async({page})=>{
    await page.addInitScript(error=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('explicit test Mock',error);};},code);
    await ready(page,false);await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect(page.getByTestId('speech-phase')).toHaveText('需要重试');
    await page.getByRole('button',{name:'左前车窗打开一半',exact:true}).click();await expect.poll(()=>pose(page)).toBe(.5);
  });
}
test('Mock silence never uploads audio',async({page})=>{
  await page.addInitScript(()=>{AnalyserNode.prototype.getFloatTimeDomainData=function(array:Float32Array<ArrayBuffer>){array.fill(0);};});
  let sent=0;await page.route('**/api/speech/transcribe',r=>{sent++;return transcript(r,'左前窗打开');});await ready(page,false);
  await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect(page.getByTestId('speech-message')).toContainText('没有检测到有效语音',{timeout:10000});expect(sent).toBe(0);await expect.poll(()=>tracksStopped(page)).toBe(true);
});
for(const [status,code,message] of [[401,'AUTH_FAILED','认证失败'],[429,'RATE_LIMITED','请求过于频繁'],[504,'TIMEOUT','响应超时'],[415,'AUDIO_FORMAT_UNSUPPORTED','格式不兼容']] as const){
  test(`Mock ASR error ${status}: manual path remains usable`,async({page})=>{
    await page.route('**/api/speech/transcribe',r=>r.fulfill({status,json:{code,message:`测试 Mock：${message}`,retryable:status!==401}}));
    await ready(page,false);await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect(page.getByTestId('speech-message')).toContainText(message,{timeout:12000});expect(await pose(page)).toBe(0);
    await page.getByRole('button',{name:'左前车窗打开一半',exact:true}).click();await expect.poll(()=>pose(page)).toBe(.5);
  });
}
test('unconfigured local server: WebM recording reaches explicit 503 and manual controls recover',async({page})=>{
  await instrument(page);await page.goto('/');await expect(page.getByTestId('speech-mode')).toContainText('待配置');
  let mime='';await page.route('**/api/speech/transcribe',async route=>{mime=route.request().postDataBuffer()!.toString('latin1').includes('audio/webm')?'audio/webm':'unknown';await route.continue();});
  await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect(page.getByTestId('speech-message')).toContainText('尚未配置',{timeout:12000});expect(mime).toBe('audio/webm');
  await expect.poll(()=>tracksStopped(page)).toBe(true);await page.getByRole('button',{name:'左前车窗打开一半',exact:true}).click();await expect.poll(()=>pose(page)).toBe(.5);
});
test('Mock clarification cancellation clears pending intent after a bulk action',async({page},info)=>{
  await ready(page,false);await page.getByRole('button',{name:'全部关闭',exact:true}).click();
  const input=page.getByRole('textbox',{name:'车窗文字指令'});await input.fill('打开车窗');await input.press('Enter');
  await expect(page.getByRole('group',{name:'请选择车窗'})).toBeVisible();for(const c of ['fl','fr','rl','rr'])expect(await pose(page,c)).toBe(0);
  await expect(page.getByRole('button',{name:'完全打开右后车窗',exact:true})).toBeInViewport({ratio:1});
  await page.screenshot({path:`docs/assets/i4-i6/clarification-panel-${info.project.name}.png`});
  await page.getByRole('button',{name:'取消这条指令',exact:true}).click();await expect(page.getByRole('group',{name:'请选择车窗'})).toHaveCount(0);
  await input.fill('左后那个');await input.press('Enter');await expect(page.getByTestId('console-feedback')).toContainText('未改变');for(const c of ['fl','fr','rl','rr'])expect(await pose(page,c)).toBe(0);
});
test('Mock cancelling native WebM finalization permits immediate re-record without uploading old audio',async({page})=>{
  await page.addInitScript(()=>{const stop=MediaRecorder.prototype.stop;MediaRecorder.prototype.stop=function(){const handler=this.onstop;this.onstop=e=>setTimeout(()=>handler?.call(this,e),300);return stop.call(this);};});
  let sent=0;await page.route('**/api/speech/transcribe',r=>{sent++;return transcript(r,'右后窗开一半');});
  await ready(page,false,['audio/webm']);
  await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect(page.getByTestId('speech-message')).toContainText('正在聆听');
  await page.getByRole('button',{name:'结束录音',exact:true}).click();await page.getByRole('button',{name:'取消语音',exact:true}).click();
  await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect.poll(()=>pose(page,'rr'),{timeout:15000}).toBe(.5);
  expect(sent).toBe(1);await expect.poll(()=>tracksStopped(page)).toBe(true);expect(await pose(page,'fl')).toBe(0);
});
for(const mode of ['network','invalid-json'] as const){test(`Mock ${mode} failure is explicit and manual recovery remains available`,async({page})=>{
  await page.route('**/api/speech/transcribe',r=>mode==='network'?r.abort('internetdisconnected'):r.fulfill({contentType:'application/json',body:'{bad-json'}));await ready(page,false);
  await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect(page.getByTestId('speech-phase')).toHaveText('需要重试',{timeout:12000});expect(await pose(page)).toBe(0);
  await page.getByRole('button',{name:'左前车窗打开一半',exact:true}).click();await expect.poll(()=>pose(page)).toBe(.5);
});}
test('direction wording from human logs and explicit all-window clarification share actual state',async({page})=>{
  await ready(page,false);const input=page.getByRole('textbox',{name:'车窗文字指令'});
  for(const [text,value] of [['打开右后方的车窗',1],['关闭右后方车窗',0]] as const){await input.fill(text);await input.press('Enter');await expect.poll(()=>pose(page,'rr')).toBe(value);}
  await page.getByRole('button',{name:'新对话',exact:true}).click();await input.fill('打开车窗');await input.press('Enter');await expect(page.getByRole('group',{name:'请选择车窗'})).toBeVisible();
  await input.fill('所有车窗');await input.press('Enter');for(const c of ['fl','fr','rl','rr'])await expect.poll(()=>pose(page,c)).toBe(1);
});
