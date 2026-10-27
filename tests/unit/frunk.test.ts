import {describe,it,expect} from 'vitest';
import {defaultVehicle,parseVehicleText,VehicleLedger,vehicleCommandSchema} from '../../packages/shared/src/vehicle';
describe('native frunk authority',()=>{
 it.each([['打开前备箱',1],['前备箱开一半',.5],['关闭前舱盖',0],['引擎盖打开',1],['前辈想打开一半',.5]])('%s',(text,value)=>expect(parseVehicleText(text)).toMatchObject({kind:'execute',commands:[{component:'frunk',targets:['front'],operation:'set',value}]}));
 it('keeps front and rear independent, resolves focused relative moves, rejects incomplete commands and negation',()=>{
  expect(parseVehicleText('再关一点',{focus:{component:'frunk',targets:['front'],updatedAt:100}},200)).toMatchObject({kind:'execute',commands:[{component:'frunk',targets:['front'],operation:'adjust',value:-.1}]});expect(parseVehicleText('不要打开前备箱').kind).toBe('noop');expect(parseVehicleText('打开前备箱然后启动引擎').kind).toBe('unsupported');expect(vehicleCommandSchema.safeParse({component:'frunk',targets:['rear'],property:'openness',operation:'set',value:1}).success).toBe(false);
 });
 it('uses the shared ledger bounds, dedupe, version guard and capability check',()=>{
  const ledger=new VehicleLedger(),state=defaultVehicle(),available=new Set(['frunk:front','trunk:rear']);const r=parseVehicleText('前备箱开一半');if(r.kind!=='execute')throw Error();const request={requestId:'front-1',baseRevision:0,origin:'voice',route:'rules',commands:r.commands};const a=ledger.apply(state,request,available);if(!a.ok)throw Error();expect(a.state.frunk.openness).toBe(.5);expect(a.state.trunk.openness).toBe(0);expect(ledger.apply(a.state,request,available)).toMatchObject({ok:true,duplicate:true});const b=ledger.apply(a.state,{...request,requestId:'front-2',baseRevision:1,commands:[{component:'frunk',targets:['front'],operation:'adjust',property:'openness',value:-1}]},available);expect(b.ok&&b.state.frunk.openness).toBe(0);expect(ledger.apply(a.state,{...request,requestId:'old'},available)).toMatchObject({ok:false,code:'STALE_REVISION'});expect(new VehicleLedger().apply(state,request,new Set()).ok).toBe(false);
 });
});
