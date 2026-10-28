import {describe,it,expect,vi,afterEach} from 'vitest';
import {intentConfig,requestAssistant,validateCalls} from '../../apps/server/src/assistant';
import {registeredTools,validateTool} from '../../packages/shared/src/capabilities';
import {defaultVehicle,VehicleLedger,type VehicleCommand} from '../../packages/shared/src/vehicle';
import {SpeechCoordinator,useSpeech} from '../../apps/web/src/speech';
import {useVehicle} from '../../apps/web/src/vehicle';
import {unsupportedRequestPart} from '../../packages/shared/src/tool-policy';
const cmd={component:'door',targets:['fl'],property:'openness',operation:'set',value:.5} as const;
const command={...cmd,targets:[...cmd.targets]} as VehicleCommand;
const call=(name='vehicle_doors',actions:unknown[]=[command],id='call-1')=>({id,type:'function' as const,function:{name,arguments:JSON.stringify({actions})}});
const input={requestId:'test-assistant',text:'左前门开一半',state:defaultVehicle(),actual:{},available:['door:fl'],context:{history:[]}};
const config={baseUrl:'https://unit.invalid/v1',apiKey:'unit-secret-do-not-reflect',model:'deepseek-test',timeoutMs:30};
describe('shared registered tool authority',()=>{
 it('keeps unsupported compound requests atomic while preserving negation',()=>{
  expect(unsupportedRequestPart('左前门开一半，再打开空调')).toBe('空调');
  expect(()=>validateCalls([call()],{...input,text:'左前门开一半，再打开空调'})).toThrow('尚未实现');
  expect(unsupportedRequestPart('别打开空调，左前门开一半')).toBeUndefined();expect(validateCalls([call()],{...input,text:'别打开空调，左前门开一半'}).commands).toHaveLength(1);
  expect(unsupportedRequestPart('雨刷加速一档')).toBeUndefined();
 });
 it('generates strict tools and rejects scripts, unknown fields, range violations and nonintegral wiper gears',()=>{
  const tools=registeredTools();expect(new Set(tools.map(t=>t.function.name)).size).toBe(tools.length);
  expect(()=>validateTool('eval',{code:'any'})).toThrow();expect(()=>validateTool('vehicle_doors',{actions:[{...command,path:'scene'}]})).toThrow();
  expect(()=>validateTool('vehicle_doors',{actions:[{...command,value:1.1}]})).toThrow();
  expect(()=>validateTool('vehicle_wiper_mode',{actions:[{component:'wiper',targets:['front'],property:'mode',operation:'adjust',value:.5}]})).toThrow();
 });
 it('validates the whole turn before any execution and refuses mixed clarification/action or repeated IDs',()=>{
  expect(()=>validateCalls([call(),call('vehicle_frunk',[{...command,component:'frunk',targets:['front']}],'call-2')],input)).toThrow();
  expect(input.state.doors.fl.openness).toBe(0);expect(()=>validateCalls([call(),call()],input)).toThrow();
  expect(()=>validateCalls([call(),{id:'reply',type:'function',function:{name:'assistant_reply',arguments:JSON.stringify({kind:'unsupported',message:'unsupported'})}}],input)).toThrow();
 });
 it('preserves sequential set/adjust/query semantics and clamps boundaries independently of animation timing',()=>{
  const actions=[command,{...command,operation:'adjust',value:.1},{...command,operation:'query',value:undefined},{...command,operation:'adjust',value:1}];delete actions[2].value;
  const valid=validateCalls([call('vehicle_doors',actions)],input);const ledger=new VehicleLedger();const request={requestId:'sequence',baseRevision:0,origin:'text',route:'llm',commands:valid.commands};const result=ledger.apply(input.state,request,new Set(input.available));
  expect(result.ok).toBe(true);if(!result.ok)throw Error();expect(result.state.doors.fl.openness).toBe(1);expect(result.execution.observations[2].effects[0].value).toBe(.6);expect(result.execution.boundary).toBe(true);
  expect(ledger.apply(result.state,request,new Set(input.available))).toMatchObject({ok:true,duplicate:true});
 });
 it('unifies headlight, cabin brightness, atmosphere and scene control with real domain values',()=>{
  const commands:VehicleCommand[]=[{component:'headlights',targets:['front'],property:'brightness',operation:'set',value:.4},{component:'cabinLight',targets:['front'],property:'brightness',operation:'adjust',value:-.2},{component:'scatter',targets:['scene'],property:'strength',operation:'set',value:.8},{component:'ambient',targets:['cabin'],property:'brightness',operation:'query'}];
  const result=new VehicleLedger().apply(defaultVehicle(),{requestId:'brightness',baseRevision:0,origin:'voice',route:'llm',commands},new Set(['headlights:front','cabinLight:front','scatter:scene','ambient:cabin']));
  expect(result.ok&&result.state).toMatchObject({lights:{brightness:.4,headlights:'off'},cabinBrightness:{front:.8,rear:1},scatter:{strength:.8}});
 });
 it('rejects model expansion of an ambiguous light or window to all targets, while a clarification answer completes the original intent',()=>{
  const cabin=call('vehicle_cabin_light_switch',[{component:'cabinLight',targets:['front','rear'],property:'enabled',operation:'set',value:true}]);
  expect(()=>validateCalls([cabin],{...input,text:'打开顶灯',available:['cabinLight:front','cabinLight:rear']})).toThrow('前排还是后排');
  const front=call('vehicle_cabin_light_switch',[{component:'cabinLight',targets:['front'],property:'enabled',operation:'set',value:true}]);
  expect(validateCalls([front],{...input,text:'前排',available:['cabinLight:front'],context:{history:[],pending:{text:'打开顶灯',question:'前排还是后排？',expiresAt:Date.now()+10000}}}).commands).toHaveLength(1);
  const allWindows=call('vehicle_windows',[{component:'window',targets:['fl','fr','rl','rr'],property:'openness',operation:'set',value:1}]);
  expect(()=>validateCalls([allWindows],{...input,text:'打开左前车窗，打开所有顶灯',available:['window:fl','window:fr','window:rl','window:rr']})).toThrow('哪一扇');
 });
});
describe('real protocol adapter using injected network evidence',()=>{
 it('uses tools without JSON-mode fallback and preserves returned IDs/index/reasoning envelope',async()=>{
  const fetcher=vi.fn(async()=>Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,reasoning_content:'opaque',tool_calls:[{...call(),index:0}]}}]}));
  const message=await requestAssistant(config,[{role:'user',content:'test'}],false,undefined,fetcher as typeof fetch);
  const body=JSON.parse((fetcher.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);expect(body.tools.length).toBeGreaterThan(15);expect(body.response_format).toBeUndefined();expect(message.tool_calls?.[0].id).toBe('call-1');expect(message.reasoning_content).toBe('opaque');
 });
 it.each([[401,'INTENT_AUTH_FAILED'],[400,'TOOL_PROTOCOL_REJECTED'],[429,'INTENT_RATE_LIMITED'],[503,'INTENT_UPSTREAM_ERROR']])('reports HTTP %s without reflecting upstream secrets',async(status,code)=>{
  await expect(requestAssistant(config,[],false,undefined,async()=>new Response(config.apiKey,{status:Number(status)}))).rejects.toMatchObject({code});
 });
 it('fails malformed, truncated, unconfigured and timed-out responses explicitly',async()=>{
  expect(intentConfig({}).health.configured).toBe(false);expect(JSON.stringify(intentConfig({INTENT_API_KEY:config.apiKey}).health)).not.toContain(config.apiKey);
  await expect(requestAssistant(null,[],false)).rejects.toMatchObject({code:'INTENT_NOT_CONFIGURED'});
  await expect(requestAssistant(config,[],false,undefined,async()=>Response.json({content:'done'}))).rejects.toMatchObject({code:'INVALID_MODEL_RESPONSE'});
  const hanging:typeof fetch=async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error())));
  await expect(requestAssistant(config,[],false,undefined,hanging)).rejects.toMatchObject({code:'INTENT_TIMEOUT'});
 });
});
describe('late assistant result is unable to mutate a newer vehicle',()=>{
 afterEach(()=>useSpeech.setState({routing:'auto'}));
 it('discards an old valid tool plan after manual ownership changes even if fetch ignores abort',async()=>{
  useVehicle.setState({state:defaultVehicle(),available:['fl'],capabilities:['door:fl'],context:{},executions:[],messages:[],epoch:0});useSpeech.setState({routing:'llm',enabled:false,phase:'idle'});
  let reply!:(response:Response)=>void,requestId='';const fetcher:typeof fetch=async(_url,init)=>{requestId=JSON.parse(init?.body as string).requestId;return new Promise(r=>reply=r);};
  const coordinator=new SpeechCoordinator({start:async()=>{},stop:async()=>{},cancel:()=>{}},{play:async()=>'ended',stop:()=>{}},fetcher);
  const task=coordinator.text('左前门开一半');await vi.waitFor(()=>expect(reply).toBeTypeOf('function'));useVehicle.getState().beginManual();
  reply(Response.json({requestId,turnId:'old',model:config.model,calls:[call()],commands:[command],baseRevision:0,durationMs:1}));await task;expect(useVehicle.getState().state.doors.fl.openness).toBe(0);expect(useVehicle.getState().executions).toHaveLength(0);coordinator.destroy();
 });
});
