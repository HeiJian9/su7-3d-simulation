import express from 'express';
import type {Server} from 'node:http';
import {afterEach,expect,it} from 'vitest';
import {assistantRoutes} from '../../apps/server/src/assistant';
import {defaultVehicle} from '../../packages/shared/src/vehicle';
const servers:Server[]=[];
async function serve(fetcher:typeof fetch){const app=express();app.use(express.json());app.use(assistantRoutes({baseUrl:'https://mock.invalid',apiKey:'mock-secret',model:'deepseek-mock',timeoutMs:1000},fetcher));const server=app.listen(0,'127.0.0.1');servers.push(server);await new Promise<void>(r=>server.once('listening',r));const a=server.address();if(!a||typeof a==='string')throw Error();return async(path:string,body:unknown)=>fetch(`http://127.0.0.1:${a.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>((r,j)=>s.close(e=>e?j(e):r()))));});
const tool=(name:string,args:unknown,id:string)=>({id,index:0,type:'function',function:{name,arguments:JSON.stringify(args)}});
const model=(calls:unknown[])=>Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:calls}}]});
const command={component:'window',targets:['fl'],property:'openness',operation:'set',value:.35};
const input={requestId:'http-1',text:'左前车窗打开百分之三十五',state:defaultVehicle(),actual:{},available:['window:fl'],context:{history:[]}};
it('Mock HTTP: plan dedupe, request conflict, complete result correlation and one final model call',async()=>{
 let requests=0;const post=await serve(async(_url,init)=>{requests++;const body=JSON.parse(init!.body as string);if(body.tool_choice==='none'){expect(body.messages.at(-1)).toMatchObject({role:'tool',tool_call_id:'call-http'});expect(JSON.parse(body.messages.at(-1).content)).toMatchObject({status:'completed',effects:[{key:'window:fl:openness',value:.35}]});return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:'左前车窗已打开到35%。'}}]});}return model([tool('vehicle_windows',{actions:[command]},'call-http')]);});
 const plan=await post('/plan',input).then(r=>r.json());expect((await post('/plan',input).then(r=>r.json())).turnId).toBe(plan.turnId);expect(requests).toBe(1);expect((await post('/plan',{...input,text:'other'})).status).toBe(409);
 const receipt={tool_call_id:'call-http',status:'completed',message:'actual browser completed',revision:1,effects:[{key:'window:fl:openness',value:.35}],observations:[]};
 expect((await post('/finish',{turnId:plan.turnId,requestId:input.requestId,results:[{...receipt,tool_call_id:'wrong'}]})).status).toBe(409);
 expect((await post('/finish',{turnId:plan.turnId,requestId:input.requestId,results:[{...receipt,effects:[]}]})).status).toBe(409);
 const result={turnId:plan.turnId,requestId:input.requestId,results:[receipt]};expect((await post('/finish',result)).status).toBe(200);expect((await post('/finish',result)).status).toBe(200);expect(requests).toBe(2);
});
it('Mock HTTP: ambiguous target calls are rejected without execution and repaired into a real clarification tool call',async()=>{
 let requests=0;const post=await serve(async(_url,init)=>{requests++;const body=JSON.parse(init!.body as string);if(requests===1)return model([tool('vehicle_cabin_light_switch',{actions:[{component:'cabinLight',targets:['front','rear'],property:'enabled',operation:'set',value:true}]},'bad-target')]);
  expect(JSON.parse(body.messages.at(-1).content)).toMatchObject({status:'rejected',executed:false,code:'AMBIGUOUS_TARGET'});
  return model([tool('assistant_reply',{kind:'clarify',message:'前排还是后排顶灯？'},'clarification')]);});
 const response=await post('/plan',{...input,text:'打开顶灯',available:['cabinLight:front','cabinLight:rear']});expect(response.status).toBe(200);const plan=await response.json();expect(plan.commands).toEqual([]);expect(plan.validationRepairs).toBe(1);expect(plan.calls[0].id).toBe('clarification');expect(plan.reply.kind).toBe('clarify');expect(input.state.cabinLights).toEqual({front:false,rear:false});
});
