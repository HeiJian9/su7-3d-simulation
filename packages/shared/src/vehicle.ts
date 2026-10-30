import { z } from 'zod';
import {adjustmentSteps} from './tuning.js';
import { corners, cornerSchema, defaultWindows, parseWindowText, windowLabels, type Corner, type WindowCommand } from './windows.js';
export { corners, windowLabels };
export type { Corner };
export const doorLabels: Record<Corner,string> = { fl:'左前车门',fr:'右前车门',rl:'左后车门',rr:'右后车门' };
export {colorSchema,wiperModes,vehicleCommandSchema,adjustmentSteps} from './capabilities.js';
import {vehicleCommandSchema,wiperModes,colorSchema,type VehicleCommand} from './capabilities.js';
export type {VehicleCommand};
export const vehicleRequestSchema=z.object({requestId:z.string().min(1).max(128),baseRevision:z.number().int().nonnegative(),origin:z.enum(['manual','text','voice']),route:z.enum(['manual','rules','llm']),commands:z.array(vehicleCommandSchema).min(1).max(16)}).strict().refine(r=>(r.origin==='manual')===(r.route==='manual'));
export type CommandRequest=z.infer<typeof vehicleRequestSchema>;
export const vehicleStateSchema=z.object({revision:z.number().int().nonnegative(),windows:z.record(cornerSchema,z.object({openness:z.number().min(0).max(1)})),doors:z.record(cornerSchema,z.object({openness:z.number().min(0).max(1)})),trunk:z.object({openness:z.number().min(0).max(1)}),frunk:z.object({openness:z.number().min(0).max(1)}),lights:z.object({headlights:z.enum(['off','low','high']),turnSignal:z.enum(['off','left','right','hazard']),brightness:z.number().min(0).max(1)}),cabinBrightness:z.object({front:z.number().min(0).max(1),rear:z.number().min(0).max(1)}),scatter:z.object({enabled:z.boolean(),strength:z.number().min(0).max(1)}),observation:z.object({night:z.boolean()}),welcomeRain:z.object({enabled:z.boolean(),brightness:z.number().min(0).max(1)}),cabinLights:z.object({front:z.boolean(),rear:z.boolean()}),paint:z.object({color:colorSchema}),ambient:z.object({enabled:z.boolean(),color:colorSchema,brightness:z.number().min(0).max(1)}),wipers:z.object({mode:z.enum(wiperModes),onceSequence:z.number().int().nonnegative()})});
export type VehicleState=z.infer<typeof vehicleStateSchema>;
export function defaultVehicle():VehicleState{return {...defaultWindows(),doors:defaultWindows().windows,trunk:{openness:0},frunk:{openness:0},lights:{headlights:'off',turnSignal:'off',brightness:1},cabinBrightness:{front:1,rear:1},scatter:{enabled:true,strength:.35},observation:{night:false},welcomeRain:{enabled:false,brightness:1},cabinLights:{front:false,rear:false},paint:{color:'#e4e6e8'},ambient:{enabled:false,color:'#9867ff',brightness:.4},wipers:{mode:'off',onceSequence:0}};}
export type Value=number|string|boolean;
export interface Effect {key:string;value:Value}
export interface Execution {requestId:string;status:'accepted'|'animating'|'completed'|'superseded'|'failed';revision:number;origin:CommandRequest['origin'];route:CommandRequest['route'];targets:Corner[];values:Partial<Record<Corner,number>>;effects:Effect[];observations:Array<{index:number;effects:Effect[]}>;query:boolean;boundary:boolean;message:string}
export function commandKeys(c:VehicleCommand):string[]{return c.targets.map(t=>`${c.component}:${t}:${'property'in c?c.property:'swipe'}`);}
function read(s:VehicleState,c:VehicleCommand,t:string):Value {
  if(c.component==='welcomeRain')return s.welcomeRain[c.property];
  if(c.component==='window'||c.component==='door')return s[c.component==='window'?'windows':'doors'][t as Corner].openness;
  if(c.component==='scatter')return s.scatter[c.property];
  if(c.component==='observation')return s.observation.night;
  if(c.component==='cabinLight')return c.property==='brightness'?s.cabinBrightness[t as 'front'|'rear']:s.cabinLights[t as 'front'|'rear'];
  if(c.component==='frunk')return s.frunk.openness;
  if(c.component==='trunk')return s.trunk.openness;
  if(c.component==='headlights')return c.property==='brightness'?s.lights.brightness:s.lights.headlights;
  if(c.component==='turnSignal')return s.lights.turnSignal;
  if(c.component==='wiper')return c.operation==='trigger'?s.wipers.onceSequence:s.wipers.mode;
  if(c.component==='paint')return s.paint.color;
  return s.ambient[c.property];
}
function write(s:VehicleState,c:VehicleCommand,t:string,v:Value){
  if(c.component==='welcomeRain'){if(c.property==='enabled')s.welcomeRain.enabled=v as boolean;else s.welcomeRain.brightness=v as number;}
  else if(c.component==='window'||c.component==='door')s[c.component==='window'?'windows':'doors'][t as Corner].openness=v as number;
  else if(c.component==='scatter'){if(c.property==='enabled')s.scatter.enabled=v as boolean;else s.scatter.strength=v as number;}
  else if(c.component==='observation')s.observation.night=v as boolean;
  else if(c.component==='cabinLight'){if(c.property==='brightness')s.cabinBrightness[t as 'front'|'rear']=v as number;else s.cabinLights[t as 'front'|'rear']=v as boolean;}
  else if(c.component==='frunk')s.frunk.openness=v as number;
  else if(c.component==='trunk')s.trunk.openness=v as number;
  else if(c.component==='headlights'){if(c.property==='brightness')s.lights.brightness=v as number;else s.lights.headlights=v as VehicleState['lights']['headlights'];}
  else if(c.component==='turnSignal')s.lights.turnSignal=v as VehicleState['lights']['turnSignal'];
  else if(c.component==='wiper'){if(c.operation==='trigger')s.wipers.onceSequence=v as number;else s.wipers.mode=v as VehicleState['wipers']['mode'];}
  else if(c.component==='paint')s.paint.color=v as string;
  else if(c.property==='brightness')s.ambient.brightness=v as number;else if(c.property==='color')s.ambient.color=v as string;else s.ambient.enabled=v as boolean;
}
const labels:Record<string,string>={'cabinLight:front':'前排主灯','cabinLight:rear':'后排主灯','frunk:front':'前备箱','trunk:rear':'后备箱','headlights:front':'前灯','turnSignal:vehicle':'转向灯','paint:body':'车漆','ambient:cabin':'氛围灯','wiper:front':'雨刷','scatter:scene':'空气散射','observation:scene':'夜间观察','welcomeRain:front':'流星雨大灯'};
export function effectLabel(key:string){const [component,target]=key.split(':');return component==='window'?windowLabels[target as Corner]:component==='door'?doorLabels[target as Corner]:labels[`${component}:${target}`]??key;}
export function describeEffects(effects:Effect[],query=false){return effects.map(({key,value})=>{
  const label=effectLabel(key);const property=key.split(':')[2];
  if(property==='openness')return `${label}${query?'目标开度为':value===0?'已关闭':value===1?'已完全打开':'已打开到 '}${(query||value!==0&&value!==1)?`${Math.round(Number(value)*100)}%`:''}`;
  if(property==='swipe')return '雨刷已完成一次刮刷并归位';
  if(property==='brightness'||property==='strength')return `${label}亮度${query?'目标为':'已设为'} ${Math.round(Number(value)*100)}%`;
  if(property==='color')return `${label}颜色${query?'为':'已设为'} ${paintPresets.find(p=>p.color===value)?.name??'自定义颜色'}`;
  if(property==='enabled'||property==='night')return `${label}${value?'已开启':'已关闭'}`;
  const values:Record<string,string>={off:'关闭',low:key.startsWith('wiper')?'低速':'近光',high:key.startsWith('wiper')?'高速':'远光',intermittent:'间歇',left:'左转向',right:'右转向',hazard:'双闪'};
  return `${label}${query?'目标为':'已设为'}${values[String(value)]??value}`;
}).join('，')+'。';}
export class VehicleLedger {
  private requests=new Map<string,{fingerprint:string;execution:Execution}>();
  apply(state:VehicleState,input:unknown,available:ReadonlySet<string>=new Set(corners.map(c=>`window:${c}`))):{ok:true;state:VehicleState;execution:Execution;duplicate:boolean}|{ok:false;code:string;message:string}{
    const parsed=vehicleRequestSchema.safeParse(input);if(!parsed.success)return {ok:false,code:'INVALID_COMMAND',message:'指令格式或数值无效，车辆未改变。'};
    const r=parsed.data,fingerprint=JSON.stringify(r),old=this.requests.get(r.requestId);
    if(old)return old.fingerprint===fingerprint?{ok:true,state,execution:old.execution,duplicate:true}:{ok:false,code:'REQUEST_ID_CONFLICT',message:'请求编号冲突，车辆未改变。'};
    if(r.baseRevision!==state.revision)return {ok:false,code:'STALE_REVISION',message:'车辆状态已改变，请重新发出指令。'};
    if(r.commands.some(c=>c.targets.some(t=>!available.has(`${c.component}:${t}`))))return {ok:false,code:'COMPONENT_UNAVAILABLE',message:'所需模型部件尚未就绪，车辆未改变。'};
    const next=structuredClone(state);let boundary=false;const effects=new Map<string,Value>();
    const observations:Execution['observations']=[];
    for(const [index,c] of r.commands.entries()){const observed:Effect[]=[];for(const t of new Set(c.targets)){
      const previous=read(next,c,t);let value=previous;
      if(c.operation==='trigger')value=Number(previous)+1;
      else if(c.operation==='set')value=c.value;
      else if(c.operation==='adjust'){
        const proposed=c.component==='wiper'?wiperModes.indexOf(previous as typeof wiperModes[number])+c.value:Number(previous)+c.value;
        const limit=c.component==='wiper'?3:1;const n=Math.round(Math.max(0,Math.min(limit,proposed))*10000)/10000;
        boundary ||= n!==proposed || n===Number(previous);value=c.component==='wiper'?wiperModes[n]:n;
      }
      if(c.operation!=='query')write(next,c,t,value);
      const key=`${c.component}:${t}:${'property'in c?c.property:'swipe'}`;effects.set(key,value);observed.push({key,value});
    }observations.push({index,effects:observed});}
    if(JSON.stringify(next)!==JSON.stringify(state))next.revision++;
    const list=[...effects].map(([key,value])=>({key,value}));const targets=corners.filter(c=>effects.has(`window:${c}:openness`));const query=r.commands.every(c=>c.operation==='query');
    let message=describeEffects(list,query)+(boundary?'已到达调节边界。':'');
    if(next.wipers.mode!=='off')message=message.replace('雨刷已完成一次刮刷并归位','雨刷已完成一次往复，继续当前档位');
    const execution:Execution={requestId:r.requestId,status:query?'completed':'accepted',revision:next.revision,origin:r.origin,route:r.route,targets,values:Object.fromEntries(targets.map(c=>[c,next.windows[c].openness])),effects:list,observations,query,boundary,message};
    this.requests.set(r.requestId,{fingerprint,execution});if(this.requests.size>256)this.requests.delete(this.requests.keys().next().value!);
    return {ok:true,state:next,execution,duplicate:false};
  }
}
export interface VehicleContext {assistantPending?:{text:string;question:string;expiresAt:number};focus?:{component:VehicleCommand['component'];targets:string[];updatedAt:number};pending?:{commands:VehicleCommand[];component:'window'|'door'|'cabinLight';expiresAt:number}}
export type RuleResult={kind:'execute';commands:VehicleCommand[]}|{kind:'clarify';message:string;pending:NonNullable<VehicleContext['pending']>}|{kind:'noop'|'unsupported';message:string};
export const paintPresets=[{name:'霞光紫',color:'#9867ff'},{name:'海湾蓝',color:'#4d80b4'},{name:'珍珠白',color:'#e4e6e8'},{name:'曜石黑',color:'#202932'},{name:'熔岩红',color:'#b13f47'},{name:'雅灰',color:'#a2a9b2'},{name:'海绿',color:'#4d8784'}];
const colorWords:Record<string,string>={紫:'#9867ff',蓝:'#4d80b4',白:'#e4e6e8',黑:'#202932',红:'#b13f47',灰:'#a2a9b2',绿:'#4d8784',黄:'#edbf53',橙:'#db8955'};
function percentText(text:string){const nums:Record<string,number>={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};return text.replace(/百分之([零一二两三四五六七八九十百\d.]+)/g,(_,n:string)=>{let value=Number(n);if(!Number.isFinite(value)){if(n==='一百'||n==='百')value=100;else if(n.includes('十')){const [a,b]=n.split('十');value=(a?nums[a]:1)*10+(b?nums[b]:0);}else value=nums[n];}return `${value}%`;});}
function accessory(clause:string,component:VehicleCommand['component'],focusedTargets:string[]=[]):VehicleCommand[]|null {
  let cleaned=percentText(clause).replace(/[\s。！!？?]/g,'').replace(/请|帮我|麻烦|把|将|吧|谢谢/g,'');
  if(component==='welcomeRain'){
    cleaned=cleaned.replace(/迎宾流星雨大灯|流星雨迎宾灯|流星雨大灯|流星雨灯光|流星雨灯|流星雨|迎宾大灯|迎宾灯/g,'');
    if(/^(打开|开启|开|关闭|关掉|关上|关)$/.test(cleaned))return [{component,targets:['front'],operation:'set',property:'enabled',value:!cleaned.includes('关')}];
    if(/^(查询|查看)?(开关|开关状态|状态)$/.test(cleaned))return [{component,targets:['front'],operation:'query',property:'enabled'}];
    if(/^(查询|查看)(亮度)$/.test(cleaned))return [{component,targets:['front'],operation:'query',property:'brightness'}];
    const percent=cleaned.match(/(\d+(?:\.\d+)?)%/);
    if(percent&&Number(percent[1])>100)return null;
    if(!/^(亮度|再|调|设为|设置为|调到|调为|增加|降低|减小|提高|亮|暗|一点|一些|到|为|\d|\.|%)+$/.test(cleaned))return null;
    const relative=/再|增加|降低|减小|提高|一点|一些/.test(cleaned);if(!percent&&!relative)return null;
    return [{component,targets:['front'],operation:relative?'adjust':'set',property:'brightness',value:(relative&&/暗|降低|减小/.test(cleaned)?-1:1)*(percent?Number(percent[1])/100:adjustmentSteps.brightness)}];
  }
  if(component==='cabinLight'){
    const targets:Array<'front'|'rear'>=/所有|全部|两盏|两个/.test(cleaned)?['front','rear']:/前排|前面|前方/.test(cleaned)?['front']:/后排|后面|后方/.test(cleaned)?['rear']:!(/主灯|顶灯|阅读灯|车内灯|车内照明灯/.test(cleaned))?focusedTargets.filter((t):t is 'front'|'rear'=>t==='front'||t==='rear'):[];
    cleaned=cleaned.replace(/所有|全部|两盏|两个|前排|前面|前方|后排|后面|后方|车内照明灯|车内主灯|车内灯|主灯|顶灯|阅读灯/g,'');
    if(!/^(打开|开启|开|关闭|关掉|关上|关)$/.test(cleaned))return null;
    return [{component,targets,operation:'set',property:'enabled',value:!cleaned.includes('关')}];
  }
  if(component==='headlights'){
    if(/^(关闭|关掉|关上)(所有)?车灯$/.test(cleaned))return [{component:'headlights',targets:['front'],operation:'set',property:'mode',value:'off'},{component:'turnSignal',targets:['vehicle'],operation:'set',property:'mode',value:'off'}];
    if(!/^(打开|开启|开|关闭|关掉|关上|关|切换到|切到|设为|调到)?(近光灯?|远光灯?|前灯|大灯)(打开|开启|关闭|关掉|关上)?$/.test(cleaned))return null;
    return [{component,targets:['front'],operation:'set',property:'mode',value:/关/.test(cleaned)?'off':/远光/.test(cleaned)?'high':'low'}];
  }
  if(component==='turnSignal'){
    if(!/^(打开|开启|开|关闭|关掉|关上|关|切换到|切到|设为)?(左转向灯?|右转向灯?|双闪灯?|转向灯)(打开|开启|关闭|关掉|关上)?$/.test(cleaned))return null;
    if(!/关|左|右|双闪/.test(cleaned))return null;
    return [{component,targets:['vehicle'],operation:'set',property:'mode',value:/关/.test(cleaned)?'off':/双闪/.test(cleaned)?'hazard':/左/.test(cleaned)?'left':'right'}];
  }
  if(component==='paint'||component==='ambient'){
    cleaned=cleaned.replace(component==='paint'?/车身|车漆|车身颜色/g:/氛围灯|灯带/g,'');
    const color=cleaned.match(/(?:#[\da-fA-F]{6}|[紫蓝白黑红灰绿黄橙]色)/);
    if(color){const left=cleaned.replace(color[0],'').replace(/颜色|换成|换为|改成|改为|设为|设置为|调成|变成|的/g,'');if(left)return null;
      const value=color[0].startsWith('#')?color[0].toLowerCase():colorWords[color[0][0]];
      return component==='paint'?[{component,targets:['body'],operation:'set',property:'color',value}]:[{component,targets:['cabin'],operation:'set',property:'color',value}];
    }
    if(component==='paint')return null;
    if(/^(打开|开启|开|关闭|关掉|关上|关)$/.test(cleaned))return [{component,targets:['cabin'],operation:'set',property:'enabled',value:!cleaned.includes('关')}];
    const percent=cleaned.match(/(\d+(?:\.\d+)?)%/);
    if(percent&&Number(percent[1])>100)return null;
    if(!/^(亮度|再|调|设为|设置为|调到|调为|增加|降低|减小|提高|亮|暗|一点|一些|到|为|\d|\.|%)+$/.test(cleaned))return null;
    const relative=/再|增加|降低|减小|提高|一点|一些/.test(cleaned);if(!percent&&!relative)return null;
    return [{component,targets:['cabin'],operation:relative?'adjust':'set',property:'brightness',value:(relative&&/暗|降低|减小/.test(cleaned)?-1:1)*(percent?Number(percent[1])/100:adjustmentSteps.brightness)}];
  }
  if(component==='wiper'){
    cleaned=cleaned.replace(/雨刮器|雨刷|雨刮/g,'');
    if(/^(刮一下|刮一次|一次刮刷)$/.test(cleaned))return [{component,targets:['front'],operation:'trigger',action:'swipe_once'}];
    if(/^(再|调|调整)?(快|慢)(一点|一些|一档)?$/.test(cleaned))return [{component,targets:['front'],operation:'adjust',property:'mode',value:(cleaned.includes('慢')?-1:1)*adjustmentSteps.wiper}];
    const gear=cleaned.match(/^(?:调到|调至|设为|设置为|调整到)?([零一二两三0-3])(?:档|挡)$/);
    if(gear){const index:Record<string,number>={零:0,一:1,二:2,两:2,三:3};return [{component,targets:['front'],operation:'set',property:'mode',value:wiperModes[index[gear[1]]??Number(gear[1])]}];}
    if(/^(打开|开启|开|关闭|关掉|关上|关|间歇|低速|高速|调到间歇|调到低速|调到高速)$/.test(cleaned))return [{component,targets:['front'],operation:'set',property:'mode',value:/关/.test(cleaned)?'off':/间歇/.test(cleaned)?'intermittent':/高速/.test(cleaned)?'high':'low'}];
    if(/^(查看|查询)?状态$/.test(cleaned))return [{component,targets:['front'],operation:'query',property:'mode'}];
  }
  return null;
}
export function parseVehicleText(raw:string,context:VehicleContext={},now=Date.now()):RuleResult {
  const text=raw.trim().replace(/前(?:背箱|辈箱|备厢)/g,'前备箱').replace(/前辈想(?=打开|开启|关闭|关上|开一半|关一点)/g,'前备箱').replace(/(左前|右前|左后|右后|前左|前右|后左|后右)方/g,'$1').replace(/(左前|右前|左后|右后)(?:那个)?[，,](?=开|关|升|降)/g,'$1');
  if(/^(取消|算了|不用了|停止操作|取消这条指令|取消刚才的指令)[。！!]?$/u.test(text))return {kind:'noop',message:'已取消待确认指令，车辆目标保持不变。'};
  const fresh=context.focus&&context.focus.targets.length===1&&now-context.focus.updatedAt<120000?context.focus:undefined;
  const pending=context.pending&&context.pending.expiresAt>now?context.pending:undefined;
  if(pending?.component==='cabinLight'){
    const reply=text.replace(/[。！!？?\s]/g,'');
    const targets:Array<'front'|'rear'>=/^(所有|全部|两盏|两个)(顶灯|主灯|阅读灯)?$/.test(reply)?['front','rear']:/^(前排|前面|前方)(那个|那盏|的|主灯|顶灯|阅读灯)?$/.test(reply)?['front']:/^(后排|后面|后方)(那个|那盏|的|主灯|顶灯|阅读灯)?$/.test(reply)?['rear']:[];
    if(targets.length)return {kind:'execute',commands:pending.commands.map(c=>c.component==='cabinLight'&&!c.targets.length?{...c,targets}:c)};
  }
  if(pending&&pending.component!=='cabinLight'){
    const answer=parseWindowText(text.replace(/车门|门/g,'车窗'),{pending:{commands:pending.commands.filter(c=>c.targets.length===0).map(c=>({...c,component:'window',targets:[]}) as WindowCommand),expiresAt:pending.expiresAt}},now);
    if(answer.kind==='execute'&&/^(?:左前|右前|左后|右后|前左|前右|后左|后右|主驾|副驾|所有|全部|四个|四扇)/.test(text)&&!/(开|关|升|降|设)/.test(text))return {kind:'execute',commands:pending.commands.map(c=>({...c,targets:c.targets.length?c.targets:answer.targets}) as VehicleCommand)};
  }
  const normalized=text.replace(/([紫蓝白黑红灰绿黄橙]色|#[0-9a-f]{6})(?=亮度)/gi,'$1，').replace(/((?:打开|开启|关闭)氛围灯)(?=亮度)/g,'$1，');
  const clauses=normalized.split(/[，,；;]|然后|接着|并且|同时/).filter(c=>c.trim());const commands:VehicleCommand[]=[];let focus=fresh;let unresolved:VehicleContext['pending'];
  for(const clause of clauses){
    if(/先不要|先别|不要|不需要|不用|不想|别/.test(clause)){
      const positive=parseVehicleText(clause.replace(/先不要|先别|不要|不需要|不用|不想|别/g,''),{focus},now);
      if(positive.kind==='unsupported'||positive.kind==='noop')return {kind:'unsupported',message:'否定子句未被完整理解，车辆未改变。请明确部件和动作。'};
      continue;
    }
    let component:VehicleCommand['component']|undefined=/流星雨|迎宾大灯|迎宾灯/.test(clause)?'welcomeRain':/前备箱|前舱盖|前机盖|引擎盖|机舱盖/.test(clause)?'frunk':/主灯|顶灯|阅读灯|车内照明灯|车内灯/.test(clause)?'cabinLight':/车窗|窗户|窗|玻璃/.test(clause)?'window':/后备箱|尾箱|行李箱/.test(clause)?'trunk':/车门|门/.test(clause)?'door':/近光|远光|前灯|大灯|车灯/.test(clause)?'headlights':/转向|双闪/.test(clause)?'turnSignal':/氛围灯|灯带/.test(clause)?'ambient':/车身|车漆/.test(clause)?'paint':/雨刷|雨刮|刮一下|刮一次/.test(clause)?'wiper':focus?.component;
    // Existing I3 accepts directional shorthand without a noun.
    component ??= /左前|右前|左后|右后|主驾|副驾|开|关/.test(clause)?pending?.component??focus?.component:undefined;
    if(component==='window'||component==='door'||component==='trunk'||component==='frunk'){
      const mapped=component==='door'?clause.replace(/车门|门/g,'车窗'):component==='frunk'?clause.replace(/前备箱|前舱盖|前机盖|引擎盖|机舱盖/g,'左前车窗'):component==='trunk'?clause.replace(/后备箱|尾箱|行李箱/g,'左前车窗'):clause;
      const r=parseWindowText(mapped,{focus:focus?.component===component?{targets:component==='frunk'?['fl']:focus.targets as Corner[],updatedAt:focus.updatedAt}:undefined},now);
      if(r.kind==='unsupported')return {kind:'unsupported',message:'规则未完整理解这条指令，车辆未改变。请明确部件、动作和比例；DeepSeek 兜底保留在 I7。'};
      if(r.kind==='noop')continue;
      const convert=(c:WindowCommand)=>({...c,component,targets:component==='frunk'?['front']:component==='trunk'?['rear']:c.targets}) as VehicleCommand;
      if(r.kind==='clarify'){
        const added=r.pending.commands.map(convert);commands.push(...added);unresolved={commands,component:component==='door'?'door':'window',expiresAt:now+120000};
      }else if(r.kind==='execute'){const added=r.commands.map(convert);commands.push(...added);focus={component,targets:added.at(-1)!.targets,updatedAt:now};}
    }else if(component){
      const added=accessory(clause,component,focus?.component===component?focus.targets:[]);if(!added)return {kind:'unsupported',message:'当前规则未完整覆盖这条表达，车辆未改变。请明确灯光模式、颜色或亮度；DeepSeek 兜底保留在 I7。'};
      commands.push(...added);if(component==='cabinLight'&&!added.at(-1)!.targets.length)unresolved={commands,component:'cabinLight',expiresAt:now+120000};else focus={component,targets:added.at(-1)!.targets,updatedAt:now};
    }else return {kind:'unsupported',message:'需要控制哪个部件？请明确车门、车窗、后备箱、近光／远光、转向灯、车漆或氛围灯。车辆未改变。'};
  }
  if(unresolved)return {kind:'clarify',message:unresolved.component==='cabinLight'?'需要开启或关闭前排还是后排主灯？也可以明确说所有顶灯。':`需要调整哪一扇${unresolved.component==='door'?'车门':'车窗'}？请选择左前、右前、左后或右后。`,pending:{...unresolved,commands}};
  return commands.length?{kind:'execute',commands}:{kind:'noop',message:'已保留否定要求，车辆没有改变。'};
}
