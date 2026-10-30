import {z} from 'zod';
import {cornerSchema,windowCommandSchema} from './windows.js';

export {adjustmentSteps} from './tuning.js';
export const colorSchema=z.string().regex(/^#[\da-fA-F]{6}$/);
export const wiperModes=['off','intermittent','low','high'] as const;
function scalar<C extends string,T extends z.ZodType,P extends string>(component:C,target:T,property:P){
 const common={component:z.literal(component),targets:z.array(target).min(1).max(4),property:z.literal(property)};
 return z.discriminatedUnion('operation',[
  z.object({...common,operation:z.literal('set'),value:z.number().min(0).max(1)}).strict(),
  z.object({...common,operation:z.literal('adjust'),value:z.number().min(-1).max(1)}).strict(),
  z.object({...common,operation:z.literal('query')}).strict(),
 ]);
}
function fixed<C extends string,T extends z.ZodType,P extends string,V extends z.ZodType>(component:C,target:T,property:P,value:V){
 const common={component:z.literal(component),targets:z.array(target).min(1).max(4),property:z.literal(property)};
 return z.union([z.object({...common,operation:z.literal('set'),value}).strict(),z.object({...common,operation:z.literal('query')}).strict()]);
}
// This tuple is the command authority, tool schema source, and delivery inventory.
export const capabilityRegistry=[
 {name:'vehicle_windows',description:'四窗独立开度。fl左前/fr右前/rl左后/rr右后。openness为打开程度0–1；set绝对值，adjust相对百分点/100，query查询。',schema:windowCommandSchema},
 {name:'vehicle_doors',description:'四门独立开度，角标同车窗。0关闭，1全开；支持set/adjust/query。',schema:scalar('door',cornerSchema,'openness')},
 {name:'vehicle_trunk',description:'后备箱 rear 开度0–1；支持set/adjust/query。',schema:scalar('trunk',z.literal('rear'),'openness')},
 {name:'vehicle_frunk',description:'前备箱 front 开度0–1；支持set/adjust/query。',schema:scalar('frunk',z.literal('front'),'openness')},
 {name:'vehicle_headlight_mode',description:'前灯 front 模式off关闭/low近光/high远光；set/query。亮度用独立工具。',schema:fixed('headlights',z.literal('front'),'mode',z.enum(['off','low','high']))},
 {name:'vehicle_headlight_brightness',description:'前灯front实际灯面、光源和散射亮度0–1；set/adjust/query，关闭时设置亮度不会开灯。',schema:scalar('headlights',z.literal('front'),'brightness')},
 {name:'vehicle_turn_signals',description:'转向与双闪vehicle，模式off/left/right/hazard；set/query。',schema:fixed('turnSignal',z.literal('vehicle'),'mode',z.enum(['off','left','right','hazard']))},
 {name:'vehicle_cabin_light_switch',description:'前排front、后排rear主灯/顶灯独立开关enabled；set布尔值/query。',schema:fixed('cabinLight',z.enum(['front','rear']),'enabled',z.boolean())},
 {name:'vehicle_cabin_light_brightness',description:'前后排顶灯独立实际亮度0–1；set/adjust/query，front前排rear后排。',schema:scalar('cabinLight',z.enum(['front','rear']),'brightness')},
 {name:'vehicle_paint',description:'车身body车漆color六位HEX。set/query。与氛围灯颜色分开。',schema:fixed('paint',z.literal('body'),'color',colorSchema)},
 {name:'vehicle_ambient_switch',description:'车内cabin氛围灯enabled开关；set/query。',schema:fixed('ambient',z.literal('cabin'),'enabled',z.boolean())},
 {name:'vehicle_ambient_color',description:'车内cabin氛围灯color六位HEX；set/query，不改车漆。',schema:fixed('ambient',z.literal('cabin'),'color',colorSchema)},
 {name:'vehicle_ambient_brightness',description:'车内cabin氛围灯实际亮度0–1；set/adjust/query。',schema:scalar('ambient',z.literal('cabin'),'brightness')},
 {name:'vehicle_wiper_mode',description:'前雨刷front档位off停止归位/intermittent间歇/low低速/high高速；set/query；adjust整数-3至3，正值加档。',schema:z.union([fixed('wiper',z.literal('front'),'mode',z.enum(wiperModes)),z.object({component:z.literal('wiper'),targets:z.tuple([z.literal('front')]),property:z.literal('mode'),operation:z.literal('adjust'),value:z.number().int().min(-3).max(3)}).strict()])},
 {name:'vehicle_wiper_once',description:'前雨刷front一次刮刷trigger/swipe_once，执行后按当前档位继续或归位。',schema:z.object({component:z.literal('wiper'),targets:z.tuple([z.literal('front')]),operation:z.literal('trigger'),action:z.literal('swipe_once')}).strict()},
 {name:'vehicle_scatter_switch',description:'空气散射/丁达尔光束scene开关enabled；set/query。',schema:fixed('scatter',z.literal('scene'),'enabled',z.boolean())},
 {name:'vehicle_scatter_strength',description:'空气散射scene强度0–1；set/adjust/query。',schema:scalar('scatter',z.literal('scene'),'strength')},
 {name:'vehicle_observation',description:'展厅scene夜间观察night开关；set/query。',schema:fixed('observation',z.literal('scene'),'night',z.boolean())},
 {name:'vehicle_welcome_rain_switch',description:'车前迎宾流星雨大灯front持续开关enabled；set布尔值/query。开启后持续播放地面和空气流星，直到关闭，不改变近光远光。',schema:fixed('welcomeRain',z.literal('front'),'enabled',z.boolean())},
 {name:'vehicle_welcome_rain_brightness',description:'迎宾流星雨大灯front实际矩阵灯、地面投影、空气光条及散射亮度0–1；set绝对值/adjust相对百分点/100/query。关闭时调节亮度不会开灯。',schema:scalar('welcomeRain',z.literal('front'),'brightness')},
] as const;
export const vehicleCommandSchema=z.union(capabilityRegistry.map(c=>c.schema));
export type VehicleCommand=z.infer<typeof vehicleCommandSchema>;
export const assistantReplySchema=z.object({kind:z.enum(['clarify','unsupported','not_understood','noop','chat']),message:z.string().min(1).max(200)}).strict();
export function registeredTools(){return [...capabilityRegistry.map(c=>({type:'function' as const,function:{name:c.name,description:c.description+' actions按语义顺序排列；同一对象连续操作放同一actions，整轮先校验再执行。',parameters:z.toJSONSchema(z.object({actions:z.array(c.schema).min(1).max(16)}).strict(),{target:'draft-7'})}})),{type:'function' as const,function:{name:'assistant_reply',description:'不执行车辆动作的回复。对象或参数有歧义clarify；能力表没有的功能unsupported；没听清not_understood；取消或否定noop；车载助手交谈chat。与控车工具互斥，不得宣称执行成功。',parameters:z.toJSONSchema(assistantReplySchema,{target:'draft-7'})}}];}
export function validateTool(name:string,args:unknown){
 if(name==='assistant_reply')return {reply:assistantReplySchema.parse(args)};
 const entry=capabilityRegistry.find(c=>c.name===name);if(!entry)throw new Error('UNKNOWN_TOOL');
 return {commands:z.object({actions:z.array(entry.schema).min(1).max(16)}).strict().parse(args).actions};
}
