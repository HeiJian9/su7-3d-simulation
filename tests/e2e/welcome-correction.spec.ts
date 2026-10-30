import {test,expect} from '@playwright/test';
import {testWave} from './global-setup';
test.beforeEach(async({request})=>{await request.post('/api/welcome/action',{data:{requestId:crypto.randomUUID(),action:'rain',enabled:false,brightness:1}});});

test('Mock speech uses registered rain tools, acknowledges real light state, speaks results and retains the camera',async({page},info)=>{
 test.setTimeout(90000);const transcripts=['打开流星雨大灯','流星雨亮度设为百分之四十','再暗一点','关闭流星雨'];let n=0,spoken=0;const receipts:unknown[]=[];
 await page.route('**/api/health',r=>r.fulfill({json:{providers:{mode:'test-mock',asr:{configured:true,model:'qwen3-asr-flash',protocol:'test-mock',audioFormats:['audio/wav'],missing:[]},tts:{configured:true,model:'cosyvoice-mock',voice:'mock',protocol:'test-mock',missing:[]},intent:{configured:true,model:'deepseek-mock',protocol:'test-mock',missing:[]}}}}));
 await page.route('**/api/speech/transcribe',r=>{const body=r.request().postDataBuffer()!.toString('latin1'),requestId=body.match(/name="requestId"\r\n\r\n([^\r\n]+)/)![1];return r.fulfill({json:{requestId,text:transcripts[n++],provider:'test-mock',model:'qwen3-asr-flash',durationMs:1}});});
 await page.route('**/api/assistant/plan',r=>{const input=r.request().postDataJSON(),brightness=/亮度|暗/.test(input.text),command={component:'welcomeRain',targets:['front'],property:brightness?'brightness':'enabled',operation:input.text.includes('再')?'adjust':'set',value:brightness?(input.text.includes('再')?-.1:.4):!input.text.includes('关')},name=brightness?'vehicle_welcome_rain_brightness':'vehicle_welcome_rain_switch';return r.fulfill({json:{requestId:input.requestId,turnId:`rain-${n}`,model:'deepseek-mock',baseRevision:input.state.revision,durationMs:1,calls:[{id:`call-${n}`,type:'function',function:{name,arguments:JSON.stringify({actions:[command]})}}],commands:[command]}});});
 await page.route('**/api/assistant/finish',async r=>{const body=r.request().postDataJSON();receipts.push(body);expect(body.results[0].tool_call_id).toBe(`call-${n}`);expect(body.results[0].status).toBe('completed');const state=await(await page.request.get('/api/welcome/state')).json();expect(!!state.rain).toBe(n<4);if(n===2||n===3)expect(state.brightness).toBe(n===2?.4:.3);await r.fulfill({json:{requestId:body.requestId,text:n===4?'流星雨已经关好啦。':'流星雨已按你的要求调好啦。'}});});
 await page.route('**/api/speech/synthesize',r=>{spoken++;return r.fulfill({body:testWave(.15,true),contentType:'audio/wav'});});
 await page.goto('/');await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled({timeout:25000});await page.getByRole('button',{name:'操作帮助',exact:true}).click();await page.getByRole('button',{name:'调试记录',exact:false}).click();await page.getByRole('combobox',{name:'助手路由'}).selectOption('llm');
 await expect(page.getByTestId('camera-position')).toHaveText(/5\.4, 2\.65, -6\.1/);const position=await page.getByTestId('camera-position').innerText();await page.getByRole('button',{name:'关闭调试记录',exact:true}).click();
 for(let i=1;i<=4;i++){await page.getByRole('button',{name:'开始录音',exact:true}).click();await expect.poll(()=>spoken,{timeout:16000}).toBe(i);await expect(page.getByTestId('speech-phase')).toHaveText('准备就绪');}
 await page.getByRole('button',{name:'操作帮助',exact:true}).click();await page.getByRole('button',{name:'调试记录',exact:false}).click();expect(await page.getByTestId('camera-position').innerText()).toBe(position);
 await info.attach('mock-speech-receipts',{body:JSON.stringify({transcripts,receipts,spoken,cameraUnchanged:true,human:false}),contentType:'application/json'});
});

test('rain control voices a real transport failure and does not retry forever or claim success',async({page})=>{
 let posts=0,spoken='';
 await page.route('**/api/health',r=>r.fulfill({json:{providers:{mode:'test-mock',asr:{configured:false,model:'qwen3-asr-flash',protocol:'test-mock',audioFormats:['audio/wav'],missing:[]},tts:{configured:true,model:'mock',voice:'mock',protocol:'test-mock',missing:[]},intent:{configured:false,model:'deepseek-mock',protocol:'test-mock',missing:[]}}}}));
 await page.route('**/api/speech/synthesize',r=>{spoken=r.request().postDataJSON().text;return r.fulfill({body:testWave(.15,true),contentType:'audio/wav'});});
 await page.goto('/');await expect(page.getByRole('button',{name:'全部打开',exact:true})).toBeEnabled({timeout:25000});
 await page.route('**/api/welcome/action',r=>{posts++;return r.fulfill({status:503,json:{code:'INJECTED_FAILURE'}});});await page.getByRole('button',{name:'灯光外观',exact:true}).click();await page.getByRole('textbox',{name:'车辆文字指令',exact:true}).fill('打开流星雨');await page.getByRole('button',{name:'发送',exact:false}).click();
 await expect.poll(()=>spoken).toContain('未确认');await expect(page.getByTestId('console-feedback')).toContainText('未确认');await expect(page.getByRole('button',{name:'流星雨迎宾',exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.getByTestId('speech-phase')).toHaveText('需要重试');expect(posts).toBe(1);expect(JSON.parse((await page.locator('canvas').getAttribute('data-welcome'))!).active).toBe(false);
});
