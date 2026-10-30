import {describe,it,expect} from 'vitest';
import {defaultVehicle,parseVehicleText,VehicleLedger} from '../../packages/shared/src/vehicle';
import {validateTool} from '../../packages/shared/src/capabilities';
import {validateCalls} from '../../apps/server/src/assistant';
import {targetScopeError} from '../../packages/shared/src/tool-policy';

describe('independent entry logo control',()=>{
 it('supports switch, brightness, context and compound speech without opening doors or rain',()=>{
  let state=defaultVehicle();const ledger=new VehicleLedger(),available=new Set(['welcomeLogo:doors']);
  for(const [i,text] of ['关闭Logo迎宾灯','迎宾投影亮度设为百分之四十','打开迎宾地毯灯','再暗一点','查询Logo迎宾灯亮度','关闭投影灯'].entries()){
   const parsed=parseVehicleText(text,{focus:{component:'welcomeLogo',targets:['doors'],updatedAt:Date.now()}});expect(parsed.kind,text).toBe('execute');if(parsed.kind!=='execute')throw Error();
   const result=ledger.apply(state,{requestId:`logo-${i}`,baseRevision:state.revision,origin:'voice',route:'rules',commands:parsed.commands},available);expect(result.ok).toBe(true);if(!result.ok)throw Error();state=result.state;
   if(i===1){expect(state.welcomeLogo.enabled).toBe(false);expect(state.welcomeLogo.brightness).toBe(.4);}
  }
  expect(state.welcomeLogo).toEqual({enabled:false,brightness:.3});expect(state.welcomeRain.enabled).toBe(false);expect(Object.values(state.doors).every(d=>d.openness===0)).toBe(true);
  expect(parseVehicleText('不要打开Logo迎宾灯').kind).toBe('noop');expect(parseVehicleText('打开Logo迎宾灯，同时打开空调').kind).toBe('unsupported');
 });
 it('uses registered strict tools and preserves tool IDs, bounds and complete validation',()=>{
  const action={component:'welcomeLogo',targets:['doors'],property:'brightness',operation:'set',value:.4};
  const call={id:'logo-brightness-call',type:'function' as const,function:{name:'vehicle_welcome_logo_brightness',arguments:JSON.stringify({actions:[action]})}};
  const plan=validateCalls([call],{requestId:'logo-tools',text:'Logo迎宾灯亮度设为40%',state:defaultVehicle(),actual:{},available:['welcomeLogo:doors'],context:{history:[]}});
  expect(plan.commands).toEqual([action]);expect(()=>validateTool(call.function.name,{actions:[{...action,value:1.1}]})).toThrow();expect(()=>validateTool(call.function.name,{actions:[{...action,targets:['front']}]})).toThrow();
  const ledger=new VehicleLedger(),s=defaultVehicle();expect(ledger.apply(s,{requestId:'atomic',baseRevision:0,origin:'voice',route:'llm',commands:[action,{...action,value:2}]},new Set(['welcomeLogo:doors'])).ok).toBe(false);expect(s.welcomeLogo.brightness).toBe(1);
 });
 it('rejects a guessed generic welcome light and permits a unique latest object',()=>{
  const c={component:'welcomeLogo' as const,targets:['doors' as const],property:'enabled' as const,operation:'set' as const,value:false};
  expect(targetScopeError('关闭迎宾灯',[c])).toContain('车前流星雨');expect(targetScopeError('关闭Logo迎宾灯',[c])).toBeUndefined();expect(targetScopeError('关闭迎宾灯',[c],{component:'welcomeLogo',targets:['doors']})).toBeUndefined();expect(targetScopeError('关闭迎宾灯',[c],{component:'welcomeRain',targets:['front']})).toBeDefined();
  expect(targetScopeError('关闭迎宾灯，同时把左前窗打开一半',[c,{component:'window',targets:['fl'],operation:'set',property:'openness',value:.5}],{component:'welcomeLogo',targets:['doors']})).toBeUndefined();
 });
});
