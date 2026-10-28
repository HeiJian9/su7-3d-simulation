import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {assistantInputSchema,assistantFinishSchema,assistantFeedbackSchema,toolCallSchema,type AssistantInput,type AssistantPlan,type IntentHealth,type ToolCall} from '../../../packages/shared/src/assistant.js';
import {registeredTools,validateTool} from '../../../packages/shared/src/capabilities.js';
import {VehicleLedger,commandKeys,type VehicleCommand} from '../../../packages/shared/src/vehicle.js';
import {targetScopeError,unsupportedRequestPart} from '../../../packages/shared/src/tool-policy.js';

export interface IntentConfig {baseUrl:string;apiKey:string;model:string;timeoutMs:number}
export function intentConfig(env:NodeJS.ProcessEnv){
 const missing:string[]=[];let url:URL|undefined;try{url=new URL(env.INTENT_BASE_URL??'');}catch{/* configured below */}
 if(!url||url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))missing.push('INTENT_BASE_URL');
 if(!env.INTENT_API_KEY?.trim())missing.push('INTENT_API_KEY');if(!env.INTENT_MODEL?.includes('deepseek'))missing.push('INTENT_MODEL');if(env.INTENT_PROTOCOL!=='openai-chat-tools')missing.push('INTENT_PROTOCOL');
 const config:IntentConfig|null=missing.length?null:{baseUrl:url!.toString().replace(/\/$/,''),apiKey:env.INTENT_API_KEY!,model:env.INTENT_MODEL!,timeoutMs:30000};
 const health:IntentHealth={configured:!!config,model:env.INTENT_MODEL??'',protocol:env.INTENT_PROTOCOL??'unconfigured',missing,probe:'not-verified'};return {config,health};
}
export class AssistantError extends Error{constructor(public code:string,message:string,public status=502){super(message);}}
type Message={role:string;content:string|null;tool_calls?:ToolCall[];tool_call_id?:string;reasoning_content?:string};
const system=`你是小米SU7演示的车载智能助手，使用中文理解自然语言与多轮上下文。你必须通过提供的function tools获取状态或控车。禁止生成JS、路径、未注册操作，禁止口头冒充执行。每轮返回控车tool_calls或一个assistant_reply。
严格依据能力表。无能力的功能返回unsupported，无法理解/转写不全返回not_understood，缺对象/参数且最新焦点不唯一返回clarify。取消/否定不执行。复杂复合指令必须整句都能理解且均支持，才提出全部动作；有一个不支持就整轮unsupported，不执行其余部分。不擅自选择替代功能。
参考最新state、actual、available和手动焦点。关闭车灯不影响常亮后行车灯（固定资产，无可调工具）。不要把车漆和氛围灯混淆。对象全体只有用户明确所有时才能选择全部。
0–100%映射0–1。三成=.3；一点/一些为0.1，雨刷为1档。设为10%=set .1；增加十个百分点=adjust .1。相对基于最新目标状态，离散雨刷只用整数调档。调暗不自动开灯。工具actions按用户语义顺序，重复对象的连续操作必须按顺序，所有调用先完整校验。
context.pending保存未完成意图，用户回答后补全。history是参考，最新车辆状态优先。用户要求查询也必须query工具，不能凭空回答。
工具结果回传后仅总结真实结果，一两句中文。你是亲切、体贴的座舱伙伴，说话自然、有一点生活气息；根据本轮具体动作换一种合适的表达，不要机械重复“指令已执行”，也不要每轮都喊主人、堆语气词或夸张撒娇。例如真实结果为车窗35%时可以说“左前窗开到35%啦，留一点微风刚刚好。”；多项操作合成一句简洁回复，关键对象、程度、颜色、档位不可漏报或编造。不要臆测天气、乘客感受或未执行功能。
能力介绍只概括车窗、车门、前后备箱、灯光、车漆、雨刷和查询／调整等类别，不逐一朗读工具列表，限70汉字；执行反馈尽量不超过80字。status未completed不能说已完成，失败说明故障；boundary说明上限或下限。不要朗读内部字段。`;
export async function requestAssistant(config:IntentConfig|null,messages:Message[],finish:boolean,signal?:AbortSignal,fetcher:typeof fetch=fetch){
 if(!config)throw new AssistantError('INTENT_NOT_CONFIGURED','智能助手尚未配置，请检查本机 INTENT 配置。',503);
 const timeout=AbortSignal.timeout(config.timeoutMs),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 try{
  const response=await fetcher(`${config.baseUrl}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,messages,tools:registeredTools(),tool_choice:finish?'none':'auto',stream:false,enable_thinking:false,temperature:finish?.55:0,max_tokens:finish?300:3000}),signal:combined});
  if(!response.ok){const code=response.status===401||response.status===403?'INTENT_AUTH_FAILED':response.status===429?'INTENT_RATE_LIMITED':response.status===400?'TOOL_PROTOCOL_REJECTED':response.status===404?'INTENT_MODEL_UNAVAILABLE':'INTENT_UPSTREAM_ERROR';throw new AssistantError(code,code==='INTENT_AUTH_FAILED'?'智能助手认证失败，请检查本机配置。':code==='TOOL_PROTOCOL_REJECTED'?'模型服务拒绝了工具调用协议，车辆未因此改变。':'智能助手服务暂时不可用，请稍后重试。');}
  const data=await response.json();const parsed=z.object({choices:z.array(z.object({finish_reason:z.string(),message:z.object({role:z.literal('assistant'),content:z.string().nullable().optional(),tool_calls:z.array(toolCallSchema).max(16).optional(),reasoning_content:z.string().optional()})})).min(1)}).safeParse(data);
  if(!parsed.success||parsed.data.choices[0].finish_reason==='length')throw new AssistantError('INVALID_MODEL_RESPONSE','模型回复不完整，车辆未因此改变。');
  return parsed.data.choices[0].message;
 }catch(error){if(error instanceof AssistantError)throw error;throw new AssistantError(signal?.aborted?'CANCELLED':timeout.aborted?'INTENT_TIMEOUT':'INTENT_NETWORK_ERROR',signal?.aborted?'本轮助手请求已取消。':timeout.aborted?'智能助手响应超时，请稍后重试。':'智能助手网络连接失败，请稍后重试。');}
}
export function validateCalls(calls:ToolCall[],input:AssistantInput){
 if(!calls.length||new Set(calls.map(c=>c.id)).size!==calls.length)throw new AssistantError('INVALID_TOOL_CALL','模型没有返回有效且唯一的工具调用。');
 const commands:VehicleCommand[]=[];let reply:AssistantPlan['reply'];
 try{for(const call of calls){const result=validateTool(call.function.name,JSON.parse(call.function.arguments));if(result.reply)reply=result.reply;else commands.push(...result.commands!);}}catch{throw new AssistantError('INVALID_TOOL_ARGUMENTS','模型工具名称或参数未通过校验，车辆未改变。');}
 if(reply&&calls.length!==1||commands.length>16)throw new AssistantError('INVALID_TOOL_BATCH','本轮动作不一致，车辆未改变。');
 const scopeText=input.context.pending?`${input.context.pending.text}；补充：${input.text}`:input.text;
 if(commands.length&&unsupportedRequestPart(scopeText))throw new AssistantError('UNSUPPORTED_REQUEST_PART','本轮包含尚未实现的功能，所有动作均未执行。',409);
 const scopeError=targetScopeError(scopeText,commands,input.context.focus);
 if(scopeError)throw new AssistantError('AMBIGUOUS_TARGET',scopeError,409);
 if(commands.length){const valid=new VehicleLedger().apply(input.state,{requestId:input.requestId,baseRevision:input.state.revision,origin:'text',route:'llm',commands},new Set(input.available));if(!valid.ok)throw new AssistantError(valid.code,valid.message,409);}
 return {commands,reply};
}
export function assistantRoutes(config:IntentConfig|null,fetcher:typeof fetch=fetch){
 const router=Router();const turns=new Map<string,{input:AssistantInput;messages:Message[];plan:AssistantPlan;created:number;finishFingerprint?:string;finishing?:Promise<unknown>}>();
 const requests=new Map<string,{fingerprint:string;promise:Promise<AssistantPlan>;created:number}>();
 const feedbacks=new Map<string,{fingerprint:string;promise:Promise<unknown>;created:number}>();
 const controller=(res:import('express').Response)=>{const c=new AbortController();res.on('close',()=>{if(!res.writableEnded)c.abort();});return c;};
 const fail=(res:import('express').Response,error:unknown)=>{const e=error instanceof AssistantError?error:new AssistantError('ASSISTANT_FAILED','智能助手请求失败，请重试。');if(!res.destroyed&&!res.headersSent)res.status(e.status).json({code:e.code,message:e.message,retryable:true});};
 router.post('/feedback',async(req,res)=>{try{
  const parsed=assistantFeedbackSchema.safeParse(req.body);if(!parsed.success)throw new AssistantError('INVALID_FEEDBACK_RECEIPT','完成结果格式无效。',400);
  const {input,commands,result}=parsed.data,scopeError=targetScopeError(input.text,commands,input.context.focus);
  if(unsupportedRequestPart(input.text))throw new AssistantError('UNSUPPORTED_REQUEST_PART','本轮包含尚未实现的功能，所有动作均未执行。',409);
  if(scopeError)throw new AssistantError('AMBIGUOUS_TARGET',scopeError,409);
  const predicted=new VehicleLedger().apply(input.state,{requestId:input.requestId,baseRevision:input.state.revision,origin:'text',route:'rules',commands},new Set(input.available));
  if(!predicted.ok||predicted.state.revision!==result.revision||JSON.stringify(predicted.execution.effects)!==JSON.stringify(result.effects)||predicted.execution.boundary!==result.boundary)throw new AssistantError('RESULT_STATE_MISMATCH','完成结果与命令不一致，不能生成成功反馈。',409);
  for(const [id,t]of feedbacks)if(Date.now()-t.created>120000)feedbacks.delete(id);while(feedbacks.size>128)feedbacks.delete(feedbacks.keys().next().value!);
  const fingerprint=JSON.stringify(parsed.data),old=feedbacks.get(input.requestId);if(old&&old.fingerprint!==fingerprint)throw new AssistantError('RESULT_CONFLICT','重复完成结果不一致。',409);
  const create=async()=>{const answer=await requestAssistant(config,[{role:'system',content:system+'\n本轮规则执行器已经完成以下动作。仅根据已校验的完成结果生成自然回复，不再提出或执行工具。'},{role:'user',content:JSON.stringify({text:input.text,commands,result})}],true,controller(res).signal,fetcher);
   if(answer.tool_calls?.length||!answer.content?.trim())throw new AssistantError('INVALID_FINAL_REPLY','动作已完成，助手反馈生成失败。');return {requestId:input.requestId,text:answer.content.slice(0,500),model:config!.model};};
  const promise=old?.promise??create();if(!old)feedbacks.set(input.requestId,{fingerprint,promise,created:Date.now()});res.set('Cache-Control','no-store').json(await promise);
 }catch(e){fail(res,e);}});
 router.post('/plan',async(req,res)=>{try{
  const parsed=assistantInputSchema.safeParse(req.body);if(!parsed.success)throw new AssistantError('INVALID_ASSISTANT_INPUT','助手请求格式无效，车辆未改变。',400);const input=parsed.data;
  for(const map of [turns,requests]){for(const [id,t]of map)if(Date.now()-t.created>120000)map.delete(id);while(map.size>128)map.delete(map.keys().next().value!);}
  const fingerprint=JSON.stringify(input),old=requests.get(input.requestId);if(old&&old.fingerprint!==fingerprint)throw new AssistantError('REQUEST_ID_CONFLICT','助手请求编号冲突。',409);
  const create=async()=>{const started=Date.now(),messages:Message[]=[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}];
   let assistant=await requestAssistant(config,messages,false,controller(res).signal,fetcher),calls=assistant.tool_calls??[],valid:ReturnType<typeof validateCalls>,validationRepairs=0;
   try{valid=validateCalls(calls,input);}catch(error){
    if(!(error instanceof AssistantError)||!['AMBIGUOUS_TARGET','UNSUPPORTED_REQUEST_PART'].includes(error.code))throw error;
    const replyKind=error.code==='UNSUPPORTED_REQUEST_PART'?'unsupported':'clarify';
    messages.push({...assistant,content:assistant.content??null},...calls.map(c=>({role:'tool',tool_call_id:c.id,content:JSON.stringify({status:'rejected',executed:false,code:error.code,message:error.message,instruction:replyKind==='unsupported'?'整句含不支持功能，所有动作均未执行。必须调用assistant_reply，kind=unsupported，不得提出其余部分动作。':'对象未明确，所有动作均未执行。必须调用assistant_reply，kind=clarify，简短追问，不得选全部。'})})));
    assistant=await requestAssistant(config,messages,false,controller(res).signal,fetcher);calls=assistant.tool_calls??[];valid=validateCalls(calls,input);validationRepairs=1;
    if(valid.commands.length||valid.reply?.kind!==replyKind)throw new AssistantError(error.code,error.message,409);
   }
   const plan:AssistantPlan={requestId:input.requestId,turnId:randomUUID(),model:config!.model,calls,...valid,validationRepairs,baseRevision:input.state.revision,durationMs:Date.now()-started};
   messages.push({...assistant,content:assistant.content??null});turns.set(plan.turnId,{input,messages,plan,created:Date.now()});return plan;};
  const promise=old?.promise??create();if(!old)requests.set(input.requestId,{fingerprint,promise,created:Date.now()});res.set('Cache-Control','no-store').json(await promise);
 }catch(e){fail(res,e);}});
 router.post('/finish',async(req,res)=>{try{
  const parsed=assistantFinishSchema.safeParse(req.body);if(!parsed.success)throw new AssistantError('INVALID_TOOL_RESULTS','工具结果格式无效。',400);const data=parsed.data,turn=turns.get(data.turnId);
  if(!turn||Date.now()-turn.created>120000||turn.plan.requestId!==data.requestId)throw new AssistantError('EXPIRED_TURN','本轮助手结果已过期。',409);
  if(data.results.length!==turn.plan.calls.length||data.results.some((r,i)=>r.tool_call_id!==turn.plan.calls[i].id))throw new AssistantError('TOOL_ID_MISMATCH','工具调用与结果编号不匹配。',409);
  if(turn.plan.commands.length){
   const predicted=new VehicleLedger().apply(turn.input.state,{requestId:turn.input.requestId,baseRevision:turn.input.state.revision,origin:'text',route:'llm',commands:turn.plan.commands},new Set(turn.input.available));
   if(!predicted.ok)throw new AssistantError('RESULT_VALIDATION_FAILED','工具结果无法核对。',409);
   for(const [i,result]of data.results.entries())if(result.status==='completed'){
    const own=validateTool(turn.plan.calls[i].function.name,JSON.parse(turn.plan.calls[i].function.arguments)).commands??[],keys=new Set(own.flatMap(commandKeys));
    const expected=predicted.execution.effects.filter(e=>keys.has(e.key));
    if(result.revision!==predicted.state.revision||JSON.stringify(expected)!==JSON.stringify(result.effects))throw new AssistantError('RESULT_STATE_MISMATCH','工具结果与本轮命令不一致，不能生成成功反馈。',409);
   }
  }
  const fingerprint=JSON.stringify(data.results);if(turn.finishFingerprint&&turn.finishFingerprint!==fingerprint)throw new AssistantError('RESULT_CONFLICT','重复工具结果不一致。',409);
  if(!turn.finishing){turn.finishFingerprint=fingerprint;const messages=[...turn.messages,...data.results.map(r=>({role:'tool',tool_call_id:r.tool_call_id,content:JSON.stringify(r)}))];turn.finishing=(async()=>{
   const answer=await requestAssistant(config,messages,true,controller(res).signal,fetcher);if(answer.tool_calls?.length||!answer.content?.trim())throw new AssistantError('INVALID_FINAL_REPLY','工具结果已保留，但助手反馈生成失败，请重试播报。');
   return {requestId:data.requestId,text:answer.content.slice(0,500),model:config!.model,toolCallIds:data.results.map(r=>r.tool_call_id)};
  })();}
  res.set('Cache-Control','no-store').json(await turn.finishing);
 }catch(e){fail(res,e);}});
 return router;
}
