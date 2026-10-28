import type {VehicleCommand} from './vehicle.js';
// A model may interpret semantics, but it may not invent a target or expand an
// ambiguous singular instruction to all parts. This guard is shared by both ends.
export function targetScopeError(text:string,commands:VehicleCommand[],focus?:{component:string;targets:string[]}):string|undefined{
 const directions:Record<string,RegExp>={fl:/左前|前左|主驾/,fr:/右前|前右|副驾/,rl:/左后|后左/,rr:/右后|后右/};
 for(const command of commands){
  if(command.component==='window'||command.component==='door'||command.component==='cabinLight'){
   const noun=command.component==='window'?'(?:车窗|窗户|窗|玻璃)':command.component==='door'?'(?:车门|门)':'(?:顶灯|主灯|阅读灯)';
   const explicitAll=new RegExp(`(?:所有|全部)(?:的)?${noun}|${noun}[^，；。]{0,3}(?:都|全)|(?:四个|四扇|四门|四窗)[^，；。]{0,3}${noun}`).test(text)
    ||command.component==='cabinLight'&&/前后排|两盏|两排/.test(text)
    ||/^(?:全部|所有|都)(?:打开|关闭|关掉|开|关|要)?[。！!?？]?$/.test(text.trim())&&focus?.component===command.component;
   if(explicitAll)continue;
   const explicit=command.component==='cabinLight'?Object.entries({front:/前排|前顶灯|前方主灯/,rear:/后排|后顶灯|后方主灯/}).filter(([,re])=>re.test(text)).map(([t])=>t):Object.entries(directions).filter(([,re])=>re.test(text)).map(([t])=>t);
   const allowed=explicit.length?explicit:focus?.component===command.component&&focus.targets.length===1?focus.targets:[];
   if(command.targets.some(t=>!allowed.includes(t)))return command.component==='cabinLight'?'你想调整前排还是后排顶灯？':`你想调整哪一扇${command.component==='door'?'车门':'车窗'}？`;
  }
 }
 // Pure pronouns and relative adjustments must keep the latest unique object.
 if(/^(?:再(?:开大|关小|暗|亮|快|慢).*|关掉|换成(?:蓝|红|绿|紫|白|黑|黄|橙)色)[。！!?？]?$/.test(text.trim())){
  if(!focus||focus.targets.length!==1)return '你想调整哪个部件？';
  if(commands.some(c=>c.component!==focus.component||c.targets.some(t=>!focus.targets.includes(t))))return '你想调整哪个部件？';
 }
 return undefined;
}
