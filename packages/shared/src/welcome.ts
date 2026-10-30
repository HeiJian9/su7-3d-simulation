import {z} from 'zod';

export const welcomeDurationMs=4800;
export const welcomeActionSchema=z.object({requestId:z.string().min(1).max(80),action:z.enum(['play','lock','unlock','auto']),enabled:z.boolean().optional()}).strict().superRefine((v,c)=>{if(v.action==='auto'&&typeof v.enabled!=='boolean')c.addIssue({code:'custom',message:'enabled required'});});
export type WelcomeAction=z.infer<typeof welcomeActionSchema>;
export interface WelcomeEvent {id:string;sequence:number;startedAt:number;source:'manual'|'unlock'}
export interface WelcomeSnapshot {sessionId:string;serverTime:number;sequence:number;locked:boolean;auto:boolean;event:WelcomeEvent|null}
export class WelcomeController {
 private seen=new Set<string>();
 private state:WelcomeSnapshot={sessionId:crypto.randomUUID(),serverTime:0,sequence:0,locked:false,auto:true,event:null};
 snapshot(now=Date.now()):WelcomeSnapshot{return {...this.state,serverTime:now,event:this.state.event?{...this.state.event}:null};}
 apply(input:WelcomeAction,now=Date.now()){
  const action=welcomeActionSchema.parse(input);
  if(this.seen.has(action.requestId))return {changed:false,snapshot:this.snapshot(now)};
  this.seen.add(action.requestId);if(this.seen.size>256)this.seen.delete(this.seen.values().next().value!);
  const unlock=action.action==='unlock'&&this.state.locked;
  if(action.action==='lock')this.state.locked=true;
  if(action.action==='unlock')this.state.locked=false;
  if(action.action==='auto')this.state.auto=action.enabled!;
  this.state.sequence++;
  if(action.action==='play'||unlock&&this.state.auto)this.state.event={id:action.requestId,sequence:this.state.sequence,startedAt:now,source:unlock?'unlock':'manual'};
  return {changed:true,snapshot:this.snapshot(now)};
 }
}
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
/** Deterministic spatial scan: each physical pixel has a different onset and tail. */
export function meteorPower(elapsedMs:number,module:number,column:number,row:number){
 const t=elapsedMs/1000;if(t<0||elapsedMs>=welcomeDurationMs)return 0;
 const sweep=(start:number,reverse=false)=>{
  const delay=(reverse?3-module:module)*.16+(reverse?3-column:column)*.075+row*.09;
  const age=t-start-delay;
  return smooth(0,.08,age)*(1-smooth(.13,.65,age));
 };
 const stars=sweep(.10)+sweep(1.55,true);
 const finale=smooth(3.15,3.5,t)*(1-smooth(3.8,4.8,t));
 return Math.min(1,stars+finale*.6);
}
