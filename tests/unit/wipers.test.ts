import {describe,it,expect} from 'vitest';
import {WiperMotion} from '../../packages/shared/src/wipers';
import {parseVehicleText,VehicleLedger,defaultVehicle} from '../../packages/shared/src/vehicle';
describe('time-based wiper motion',()=>{
  it('finishes a complete single sweep, parks, and does not repeat a completed sequence',()=>{
    const w=new WiperMotion();let p=w.step(.35,'off',1);expect(p.fraction).toBeGreaterThan(.4);expect(p.parked).toBe(false);expect(p.completedOnce).toBe(0);
    p=w.step(1.05,'off',1);expect(p.fraction).toBe(0);expect(p.parked).toBe(true);expect(p.completedOnce).toBe(1);expect(w.step(5,'off',1).cycles).toBe(1);
  });
  it('keeps pose during gear changes, then returns smoothly before acknowledging off',()=>{
    const w=new WiperMotion(),a=w.step(.3,'low',0),b=w.step(0,'high',0);expect(b.fraction).toBe(a.fraction);const c=w.step(.05,'off',0);expect(c.parked).toBe(false);expect(c.appliedMode).not.toBe('off');
    const end=w.step(1,'off',0);expect(end.parked).toBe(true);expect(end.fraction).toBe(0);expect(end.appliedMode).toBe('off');
  });
  it('has distinct cadence and deterministic results at different frame rates',()=>{
    const run=(mode:'low'|'high'|'intermittent',hz:number)=>{const w=new WiperMotion();for(let i=0;i<6*hz;i++)w.step(1/hz,mode,0);return w;};
    expect(run('high',60).cycles).toBeGreaterThan(run('low',60).cycles);expect(run('low',60).cycles).toBeGreaterThan(run('intermittent',60).cycles);
    expect(run('low',30).phase).toBeCloseTo(run('low',120).phase,8);
  });
  it('coalesces a newer once request into a subsequent complete sweep',()=>{
    const w=new WiperMotion();w.step(.3,'off',1);expect(w.step(1.1,'off',2).completedOnce).toBe(1);expect(w.step(1.4,'off',2).completedOnce).toBe(2);
  });
});
describe('wiper commands through the common validator',()=>{
  it.each([['打开雨刷','set','low'],['雨刷调到二档','set','low'],['雨刷调到三挡','set','high'],['雨刷调到零档','set','off'],['雨刷再快一点','adjust',1],['雨刷再慢一点','adjust',-1],['关闭雨刷','set','off']])('%s',(text,operation,value)=>{const r=parseVehicleText(text);expect(r.kind==='execute'&&r.commands[0]).toMatchObject({component:'wiper',operation,value});});
  it('deduplicates a trigger, clamps relative gears and rejects negative or unknown intent',()=>{
    expect(parseVehicleText('不要打开雨刷').kind).toBe('noop');expect(parseVehicleText('雨刷调到四档').kind).toBe('unsupported');expect(parseVehicleText('打开雨刷，启动发动机').kind).toBe('unsupported');
    const p=parseVehicleText('刮一下');if(p.kind!=='execute')throw Error();const request={requestId:'once',baseRevision:0,origin:'voice',route:'rules',commands:p.commands};const ledger=new VehicleLedger(),a=ledger.apply(defaultVehicle(),request,new Set(['wiper:front']));if(!a.ok)throw Error();expect(a.state.wipers.onceSequence).toBe(1);const b=ledger.apply(a.state,request,new Set(['wiper:front']));expect(b.ok&&b.state.wipers.onceSequence).toBe(1);
  });
});
