import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {intentConfig,requestAssistant,validateCalls} from '../apps/server/src/assistant.js';
import {defaultVehicle,VehicleLedger} from '../packages/shared/src/vehicle.js';
const env=parseEnv(await readFile('.env','utf8')),config=intentConfig(env).config;
const input={requestId:'protocol-probe',text:'左前车窗打开百分之三十五',state:defaultVehicle(),actual:{},available:['window:fl'],context:{history:[]}};
const messages=[{role:'system',content:'You are a vehicle assistant. Use registered tools only, then summarize actual results in Chinese.'},{role:'user',content:JSON.stringify(input)}];
const started=Date.now(),message=await requestAssistant(config,messages,false);
const calls=message.tool_calls??[],valid=validateCalls(calls,input);
const result=new VehicleLedger().apply(input.state,{requestId:input.requestId,baseRevision:0,origin:'text',route:'llm',commands:valid.commands},new Set(input.available));
if(!result.ok)throw Error(result.code);
// Protocol probe has no renderer. Do not claim visual completion.
const toolResults=calls.map(c=>({role:'tool',tool_call_id:c.id,content:JSON.stringify({status:'accepted',effects:result.execution.effects,message:'工具参数和领域执行通过，渲染与动画尚未验证。'})}));
const final=await requestAssistant(config,[...messages,{...message,content:message.content??null},...toolResults],true);
await mkdir('docs/validation/i7-i9',{recursive:true});
const report={at:new Date().toISOString(),mode:'real-api-protocol-domain-only',platform:'Aliyun Bailian',model:config?.model,calls,commands:valid.commands,toolCallIds:toolResults.map(r=>r.tool_call_id),final:final.content,elapsedMs:Date.now()-started,rendered:false,human:false};
await writeFile('docs/validation/i7-i9/protocol-probe.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
