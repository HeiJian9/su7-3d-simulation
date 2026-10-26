import { z } from 'zod';
import { corners, cornerSchema, defaultWindows, parseWindowText, windowCommandSchema, windowLabels, type Corner, type WindowCommand } from './windows.js';
export { corners, windowLabels };
export type { Corner };
export const doorLabels: Record<Corner,string> = { fl:'左前车门',fr:'右前车门',rl:'左后车门',rr:'右后车门' };
export const wiperModes = ['off','intermittent','low','high'] as const;
export const colorSchema = z.string().regex(/^#[\da-fA-F]{6}$/);
function scalar<C extends string,T extends z.ZodType>(component:C, target:T) {
  const common={component:z.literal(component),targets:z.array(target).min(1).max(4),property:z.literal('openness')};
  return z.discriminatedUnion('operation',[
    z.object({...common,operation:z.literal('set'),value:z.number().min(0).max(1)}).strict(),
    z.object({...common,operation:z.literal('adjust'),value:z.number().min(-1).max(1)}).strict(),
    z.object({...common,operation:z.literal('query')}).strict(),
  ]);
}
function fixed<C extends string,T extends string,P extends string,V extends z.ZodType>(component:C,target:T,property:P,value:V) {
  const common={component:z.literal(component),targets:z.tuple([z.literal(target)]),property:z.literal(property)};
  return z.union([z.object({...common,operation:z.literal('set'),value}).strict(),z.object({...common,operation:z.literal('query')}).strict()]);
}
const ambientBrightness=z.object({component:z.literal('ambient'),targets:z.tuple([z.literal('cabin')]),property:z.literal('brightness'),operation:z.enum(['set','adjust']),value:z.number().min(-1).max(1)}).strict().refine(c=>c.operation==='adjust'||c.value>=0);
export const vehicleCommandSchema=z.union([
  windowCommandSchema,scalar('door',cornerSchema),scalar('trunk',z.literal('rear')),
  fixed('headlights','front','mode',z.enum(['off','low','high'])),fixed('turnSignal','vehicle','mode',z.enum(['off','left','right','hazard'])),
  fixed('paint','body','color',colorSchema),fixed('ambient','cabin','color',colorSchema),fixed('ambient','cabin','enabled',z.boolean()),ambientBrightness,
  fixed('wiper','front','mode',z.enum(wiperModes)),
  z.object({component:z.literal('wiper'),targets:z.tuple([z.literal('front')]),property:z.literal('mode'),operation:z.literal('adjust'),value:z.number().int().min(-3).max(3)}).strict(),
  z.object({component:z.literal('wiper'),targets:z.tuple([z.literal('front')]),operation:z.literal('trigger'),action:z.literal('swipe_once')}).strict(),
]);
export type VehicleCommand=z.infer<typeof vehicleCommandSchema>;
export const vehicleRequestSchema=z.object({requestId:z.string().min(1).max(128),baseRevision:z.number().int().nonnegative(),origin:z.enum(['manual','text','voice']),route:z.enum(['manual','rules']),commands:z.array(vehicleCommandSchema).min(1).max(16)}).strict().refine(r=>(r.origin==='manual')===(r.route==='manual'));
export type CommandRequest=z.infer<typeof vehicleRequestSchema>;
export const vehicleStateSchema=z.object({revision:z.number().int().nonnegative(),windows:z.record(cornerSchema,z.object({openness:z.number().min(0).max(1)})),doors:z.record(cornerSchema,z.object({openness:z.number().min(0).max(1)})),trunk:z.object({openness:z.number().min(0).max(1)}),lights:z.object({headlights:z.enum(['off','low','high']),turnSignal:z.enum(['off','left','right','hazard'])}),paint:z.object({color:colorSchema}),ambient:z.object({enabled:z.boolean(),color:colorSchema,brightness:z.number().min(0).max(1)}),wipers:z.object({mode:z.enum(wiperModes),onceSequence:z.number().int().nonnegative()})});
export type VehicleState=z.infer<typeof vehicleStateSchema>;
export function defaultVehicle():VehicleState{return {...defaultWindows(),doors:defaultWindows().windows,trunk:{openness:0},lights:{headlights:'off',turnSignal:'off'},paint:{color:'#e4e6e8'},ambient:{enabled:false,color:'#9867ff',brightness:.4},wipers:{mode:'off',onceSequence:0}};}
export type Value=number|string|boolean;
export interface Effect {key:string;value:Value}
export interface Execution {requestId:string;status:'accepted'|'animating'|'completed'|'superseded'|'failed';revision:number;origin:CommandRequest['origin'];route:CommandRequest['route'];targets:Corner[];values:Partial<Record<Corner,number>>;effects:Effect[];query:boolean;boundary:boolean;message:string}
export function commandKeys(c:VehicleCommand):string[]{return c.targets.map(t=>`${c.component}:${t}:${'property'in c?c.property:'swipe'}`);}
function read(s:VehicleState,c:VehicleCommand,t:string):Value {
  if(c.component==='window'||c.component==='door')return s[c.component==='window'?'windows':'doors'][t as Corner].openness;
  if(c.component==='trunk')return s.trunk.openness;
  if(c.component==='headlights')return s.lights.headlights;
  if(c.component==='turnSignal')return s.lights.turnSignal;
  if(c.component==='wiper')return c.operation==='trigger'?s.wipers.onceSequence:s.wipers.mode;
  if(c.component==='paint')return s.paint.color;
  return s.ambient[c.property];
}
function write(s:VehicleState,c:VehicleCommand,t:string,v:Value){
  if(c.component==='window'||c.component==='door')s[c.component==='window'?'windows':'doors'][t as Corner].openness=v as number;
  else if(c.component==='trunk')s.trunk.openness=v as number;
  else if(c.component==='headlights')s.lights.headlights=v as VehicleState['lights']['headlights'];
  else if(c.component==='turnSignal')s.lights.turnSignal=v as VehicleState['lights']['turnSignal'];
  else if(c.component==='wiper'){if(c.operation==='trigger')s.wipers.onceSequence=v as number;else s.wipers.mode=v as VehicleState['wipers']['mode'];}
  else if(c.component==='paint')s.paint.color=v as string;
  else if(c.property==='brightness')s.ambient.brightness=v as number;else if(c.property==='color')s.ambient.color=v as string;else s.ambient.enabled=v as boolean;
}
const labels:Record<string,string>={'trunk:rear':'后备箱','headlights:front':'前灯','turnSignal:vehicle':'转向灯','paint:body':'车漆','ambient:cabin':'氛围灯','wiper:front':'雨刷'};
export function effectLabel(key:string){const [component,target]=key.split(':');return component==='window'?windowLabels[target as Corner]:component==='door'?doorLabels[target as Corner]:labels[`${component}:${target}`]??key;}
export function describeEffects(effects:Effect[],query=false){return effects.map(({key,value})=>{
  const label=effectLabel(key);const property=key.split(':')[2];
  if(property==='openness')return `${label}${query?'目标开度为':value===0?'已关闭':value===1?'已完全打开':'已打开到 '}${(query||value!==0&&value!==1)?`${Math.round(Number(value)*100)}%`:''}`;
  if(property==='swipe')return '雨刷已完成一次刮刷并归位';
  if(property==='brightness')return `${label}亮度${query?'目标为':'已设为'} ${Math.round(Number(value)*100)}%`;
  if(property==='color')return `${label}颜色${query?'为':'已设为'} ${value}`;
  if(property==='enabled')return `${label}${value?'已开启':'已关闭'}`;
  const values:Record<string,string>={off:'关闭',low:key.startsWith('wiper')?'低速':'近光',high:key.startsWith('wiper')?'高速':'远光',intermittent:'间歇',left:'左转向',right:'右转向',hazard:'双闪'};
  return `${label}${query?'目标为':'已设为'}${values[String(value)]??value}`;
}).join('，')+'。';}
export class VehicleLedger {
  private requests=new Map<string,{fingerprint:string;execution:Execution}>();
  apply(state:VehicleState,input:unknown,available:ReadonlySet<string>):{ok:true;state:VehicleState;execution:Execution;duplicate:boolean}|{ok:false;code:string;message:string}{
    const parsed=vehicleRequestSchema.safeParse(input);if(!parsed.success)return {ok:false,code:'INVALID_COMMAND',message:'指令格式或数值无效，车辆未改变。'};
    const r=parsed.data,fingerprint=JSON.stringify(r),old=this.requests.get(r.requestId);
    if(old)return old.fingerprint===fingerprint?{ok:true,state,execution:old.execution,duplicate:true}:{ok:false,code:'REQUEST_ID_CONFLICT',message:'请求编号冲突，车辆未改变。'};
    if(r.baseRevision!==state.revision)return {ok:false,code:'STALE_REVISION',message:'车辆状态已改变，请重新发出指令。'};
    if(r.commands.some(c=>c.targets.some(t=>!available.has(`${c.component}:${t}`))))return {ok:false,code:'COMPONENT_UNAVAILABLE',message:'所需模型部件尚未就绪，车辆未改变。'};
    const next=structuredClone(state);let boundary=false;const effects=new Map<string,Value>();
    for(const c of r.commands)for(const t of new Set(c.targets)){
      const previous=read(next,c,t);let value=previous;
      if(c.operation==='trigger')value=Number(previous)+1;
      else if(c.operation==='set')value=c.value;
      else if(c.operation==='adjust'){
        const proposed=c.component==='wiper'?wiperModes.indexOf(previous as typeof wiperModes[number])+c.value:Number(previous)+c.value;
        const limit=c.component==='wiper'?3:1;const n=Math.round(Math.max(0,Math.min(limit,proposed))*10000)/10000;
        boundary ||= n!==proposed || n===Number(previous);value=c.component==='wiper'?wiperModes[n]:n;
      }
      if(c.operation!=='query')write(next,c,t,value);
      effects.set(`${c.component}:${t}:${'property'in c?c.property:'swipe'}`,value);
    }
    if(JSON.stringify(next)!==JSON.stringify(state))next.revision++;
    const list=[...effects].map(([key,value])=>({key,value}));const targets=corners.filter(c=>effects.has(`window:${c}:openness`));const query=r.commands.every(c=>c.operation==='query');
    const execution:Execution={requestId:r.requestId,status:query?'completed':'accepted',revision:next.revision,origin:r.origin,route:r.route,targets,values:Object.fromEntries(targets.map(c=>[c,next.windows[c].openness])),effects:list,query,boundary,message:describeEffects(list,query)+(boundary?'已到达调节边界。':'')};
    this.requests.set(r.requestId,{fingerprint,execution});if(this.requests.size>256)this.requests.delete(this.requests.keys().next().value!);
    return {ok:true,state:next,execution,duplicate:false};
  }
}
export interface VehicleContext {focus?:{component:VehicleCommand['component'];targets:string[];updatedAt:number};pending?:{commands:VehicleCommand[];component:'window'|'door';expiresAt:number}}
export type RuleResult={kind:'execute';commands:VehicleCommand[]}|{kind:'clarify';message:string;pending:NonNullable<VehicleContext['pending']>}|{kind:'noop'|'unsupported';message:string};
export function parseVehicleText(raw:string,context:VehicleContext={},now=Date.now()):RuleResult {
  const text=raw.trim().replace(/(左前|右前|左后|右后|前左|前右|后左|后右)方/g,'$1').replace(/(左前|右前|左后|右后)(?:那个)?[，,](?=开|关|升|降)/g,'$1');
  if(/^(取消|算了|不用了|停止操作|取消这条指令|取消刚才的指令)[。！!]?$/u.test(text))return {kind:'noop',message:'已取消待确认指令，车辆目标保持不变。'};
  const fresh=context.focus&&context.focus.targets.length===1&&now-context.focus.updatedAt<120000?context.focus:undefined;
  const pending=context.pending&&context.pending.expiresAt>now?context.pending:undefined;
  if(pending){
    const answer=parseWindowText(text.replace(/车门|门/g,'车窗'),{pending:{commands:pending.commands.filter(c=>c.targets.length===0).map(c=>({...c,component:'window',targets:[]}) as WindowCommand),expiresAt:pending.expiresAt}},now);
    if(answer.kind==='execute'&&/^(?:左前|右前|左后|右后|前左|前右|后左|后右|主驾|副驾|所有|全部|四个|四扇)/.test(text)&&!/(开|关|升|降|设)/.test(text))return {kind:'execute',commands:pending.commands.map(c=>({...c,targets:c.targets.length?c.targets:answer.targets}) as VehicleCommand)};
  }
  const clauses=text.split(/[，,；;]|然后|接着|并且|同时/).filter(c=>c.trim());const commands:VehicleCommand[]=[];let focus=fresh;let unresolved:VehicleContext['pending'];
  for(const clause of clauses){
    let component:VehicleCommand['component']|undefined=/车窗|窗户|窗|玻璃/.test(clause)?'window':/后备箱|尾箱|行李箱/.test(clause)?'trunk':/车门|门/.test(clause)?'door':/近光|远光|前灯|大灯/.test(clause)?'headlights':/转向|双闪/.test(clause)?'turnSignal':/氛围灯|灯带/.test(clause)?'ambient':/车身|车漆/.test(clause)?'paint':/雨刷|刮一下/.test(clause)?'wiper':focus?.component;
    // Existing I3 accepts directional shorthand without a noun.
    component ??= /左前|右前|左后|右后|主驾|副驾|开|关/.test(clause)?pending?.component??'window':undefined;
    if(component==='window'||component==='door'||component==='trunk'){
      const mapped=component==='door'?clause.replace(/车门|门/g,'车窗'):component==='trunk'?clause.replace(/后备箱|尾箱|行李箱/g,'左前车窗'):clause;
      const r=parseWindowText(mapped,{focus:focus?.component===component?{targets:focus.targets as Corner[],updatedAt:focus.updatedAt}:undefined},now);
      if(r.kind==='unsupported')return {kind:'unsupported',message:'规则未完整理解这条指令，车辆未改变。请明确部件、动作和比例；DeepSeek 兜底保留在 I7。'};
      if(r.kind==='noop')continue;
      const convert=(c:WindowCommand)=>({...c,component,targets:component==='trunk'?['rear']:c.targets}) as VehicleCommand;
      if(r.kind==='clarify'){
        const added=r.pending.commands.map(convert);commands.push(...added);unresolved={commands,component:component==='door'?'door':'window',expiresAt:now+120000};
      }else if(r.kind==='execute'){const added=r.commands.map(convert);commands.push(...added);focus={component,targets:added.at(-1)!.targets,updatedAt:now};}
    }else return {kind:'unsupported',message:'当前规则未完整覆盖这条表达，车辆未改变。DeepSeek 兜底保留在 I7。'};
  }
  if(unresolved)return {kind:'clarify',message:`需要调整哪一扇${unresolved.component==='door'?'车门':'车窗'}？请选择左前、右前、左后或右后。`,pending:{...unresolved,commands}};
  return commands.length?{kind:'execute',commands}:{kind:'noop',message:'已保留否定要求，车辆没有改变。'};
}
