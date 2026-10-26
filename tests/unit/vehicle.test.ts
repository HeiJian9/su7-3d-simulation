import {describe,it,expect} from 'vitest';
import {VehicleLedger,defaultVehicle,parseVehicleText,corners,vehicleRequestSchema,type VehicleCommand,type VehicleContext} from '../../packages/shared/src/vehicle';
const available=new Set(['trunk:rear',...corners.flatMap(c=>[`door:${c}`,`window:${c}`])]);
const request=(commands:VehicleCommand[],id='one',revision=0)=>({requestId:id,baseRevision:revision,origin:'text',route:'rules',commands});
describe('shared vehicle authority',()=>{
  it('atomically combines windows doors and trunk, using target-based relatives and request dedupe',()=>{
    const ledger=new VehicleLedger(),cmd:VehicleCommand[]=[{component:'door',targets:['fl'],operation:'set',property:'openness',value:.5},{component:'window',targets:['fl'],operation:'set',property:'openness',value:1},{component:'trunk',targets:['rear'],operation:'adjust',property:'openness',value:.1}];
    const result=ledger.apply(defaultVehicle(),request(cmd),available);if(!result.ok)throw Error();
    expect(result.state.doors.fl.openness).toBe(.5);expect(result.state.windows.fl.openness).toBe(1);expect(result.state.trunk.openness).toBe(.1);expect(result.state.revision).toBe(1);
    const retry=ledger.apply(result.state,request(cmd),available);expect(retry.ok&&retry.state.trunk.openness).toBe(.1);
    expect(result.execution.effects).toHaveLength(3);
    expect(ledger.apply(result.state,request(cmd,'stale'),available).ok).toBe(false);
  });
  it('rejects unknown properties, unavailable components and an invalid member without partial changes',()=>{
    const state=defaultVehicle(),ledger=new VehicleLedger();
    const good={component:'door',targets:['fl'],operation:'set',property:'openness',value:.5};
    expect(vehicleRequestSchema.safeParse(request([good,{...good,targets:['rear']} ] as VehicleCommand[])).success).toBe(false);
    expect(ledger.apply(state,request([good] as VehicleCommand[]),new Set()).ok).toBe(false);expect(state.doors.fl.openness).toBe(0);
  });
});
describe('I4 complete rules',()=>{
  it.each([['打开左前门','door','fl',1],['右后门开一半','door','rr',.5],['打开后备箱','trunk','rear',1],['后备箱再关一点','trunk','rear',-.1]])('%s',(text,component,target,value)=>{
    const r=parseVehicleText(text);expect(r.kind).toBe('execute');if(r.kind==='execute')expect(r.commands[0]).toMatchObject({component,targets:[target],value});
  });
  it('clarifies only the ambiguous door and preserves window/door focus isolation',()=>{
    const r=parseVehicleText('打开车门',{},100);if(r.kind!=='clarify')throw Error();
    const context:VehicleContext={pending:r.pending};const answer=parseVehicleText('左后那个',context,200);expect(answer.kind==='execute'&&answer.commands[0]).toMatchObject({component:'door',targets:['rl'],value:1});
    const button=parseVehicleText('左前车门',context,200);expect(button.kind).toBe('execute');
    const focus:VehicleContext={focus:{component:'door',targets:['fr'],updatedAt:100}};
    expect(parseVehicleText('再关一点',focus,200)).toMatchObject({kind:'execute',commands:[{component:'door',targets:['fr'],value:-.1}]});
    expect(parseVehicleText('打开车窗',focus,200).kind).toBe('clarify');
    expect(parseVehicleText('不要打开左前门').kind).toBe('noop');expect(parseVehicleText('打开左前门，然后启动引擎').kind).toBe('unsupported');
  });
});
