import {describe,it,expect} from 'vitest';
import {Matrix4,Ray,Triangle,Vector2,Vector3} from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {WelcomeController,meteorPower,welcomeActionSchema,welcomeDurationMs,welcomePlayback} from '../../packages/shared/src/welcome';
import {defaultVehicle,parseVehicleText,VehicleLedger} from '../../packages/shared/src/vehicle';
import {rainCount,rainSample} from '../../apps/web/src/welcomeOptics';
import data from '../../apps/web/src/data/welcome-lenses.json';
describe('welcome event semantics and original lens fit',()=>{
 it('keeps manual rain and brightness across reconnects until explicitly disabled',()=>{
  const c=new WelcomeController();c.apply({requestId:'start',action:'rain',enabled:true,brightness:.4},100);
  expect(welcomePlayback(c.snapshot(60100),60100)).toMatchObject({active:true,persistent:true,envelope:1});
  c.apply({requestId:'dim',action:'rain',enabled:true,brightness:.3},90000);
  expect(c.snapshot().rain?.startedAt).toBe(100);expect(c.snapshot().brightness).toBe(.3);
  c.apply({requestId:'stop',action:'rain',enabled:false},91000);expect(welcomePlayback(c.snapshot(),92000).active).toBe(false);
  c.apply({requestId:'l',action:'lock'},93000);c.apply({requestId:'u',action:'unlock'},94000);
  expect(welcomePlayback(c.snapshot(),94500)).toMatchObject({active:true,persistent:false});expect(welcomePlayback(c.snapshot(),100000).active).toBe(false);
  expect(welcomeActionSchema.safeParse({requestId:'bad',action:'rain',enabled:true,brightness:1.1}).success).toBe(false);
 });
 it('routes spoken rain switch, percent, context, queries and multi-actions through the ledger',()=>{
  let state=defaultVehicle();const ledger=new VehicleLedger(),available=new Set(['welcomeRain:front','window:fl']);
  for(const [i,text]of ['打开流星雨大灯','流星雨亮度设为百分之四十','再暗一点','查询流星雨亮度','关闭流星雨','打开流星雨，同时左前车窗开一半'].entries()){
   const plan=parseVehicleText(text,{focus:{component:'welcomeRain',targets:['front'],updatedAt:Date.now()}});expect(plan.kind,text).toBe('execute');
   if(plan.kind!=='execute')throw Error();const result=ledger.apply(state,{requestId:String(i),baseRevision:state.revision,origin:'voice',route:'rules',commands:plan.commands},available);
   expect(result.ok).toBe(true);if(!result.ok)throw Error();state=result.state;
   if(i===2||i===3)expect(state.welcomeRain.brightness).toBe(.3);if(i===4)expect(state.welcomeRain.enabled).toBe(false);
  }
  expect(state.welcomeRain.enabled).toBe(true);expect(state.windows.fl.openness).toBe(.5);
 });
 it('spreads rain lanes independently and keeps looping particles bounded after a long run',()=>{
  for(const t of [0,100,1000,5000,3600000])for(let i=0;i<rainCount;i++){
   const l=rainSample(t,i,-1,true),r=rainSample(t,i,1,true);expect(l.x).toBe(-r.x);expect(l.z).toBe(r.z);expect(r.z).toBeGreaterThanOrEqual(-14.5);expect(r.z).toBeLessThanOrEqual(-2.7);expect(r.power).toBeGreaterThanOrEqual(0);expect(r.power).toBeLessThanOrEqual(1);
  }
  expect(rainSample(6000,3,1).power).toBe(0);expect(rainSample(6000,3,1,true).power).toBeGreaterThan(0);
  const field=Array.from({length:rainCount},(_,i)=>rainSample(1000,i,1));
  expect(new Set(field.map(p=>p.x)).size).toBeGreaterThan(34);
  expect(field.some(p=>Math.abs(p.x)<.05&&p.power>.1)).toBe(true);
  expect(Math.min(...field.map(p=>p.z))).toBeLessThan(-14);
 });
 it('resets the exhibition on a new main document while preserving ordered dedupe',()=>{
  const c=new WelcomeController();c.apply({requestId:'start',action:'rain',enabled:true,brightness:.3},100);c.apply({requestId:'lock',action:'lock'},200);c.apply({requestId:'auto',action:'auto',enabled:false},300);
  const before=c.snapshot(),reset=c.apply({requestId:'new-document',action:'reset'},400);
  expect(reset.snapshot).toMatchObject({sessionId:before.sessionId,sequence:before.sequence+1,locked:false,auto:true,brightness:1,rain:null,event:null});
  expect(c.apply({requestId:'new-document',action:'reset'},500).changed).toBe(false);expect(welcomePlayback(reset.snapshot,500).active).toBe(false);
 });
 it('plays once for unlock transitions, respects auto preference and deduplicates remote retries',()=>{
  const c=new WelcomeController();c.apply({requestId:'l',action:'lock'},100);
  const a=c.apply({requestId:'u',action:'unlock'},200);expect(a.snapshot.event).toMatchObject({id:'u',startedAt:200,source:'unlock'});
  expect(c.apply({requestId:'u',action:'unlock'},400).changed).toBe(false);
  expect(c.apply({requestId:'u2',action:'unlock'},500).snapshot.event?.id).toBe('u');
  c.apply({requestId:'off',action:'auto',enabled:false},600);c.apply({requestId:'l2',action:'lock'},700);
  expect(c.apply({requestId:'u3',action:'unlock'},800).snapshot.event?.id).toBe('u');
  expect(c.apply({requestId:'m',action:'play'},900).snapshot.event?.startedAt).toBe(900);
  expect(welcomeActionSchema.safeParse({requestId:'x',action:'eval',script:'1'}).success).toBe(false);
 });
 it('has smooth spatially staggered pulses and ends without changing normal headlight state',()=>{
  expect(meteorPower(100,0,0,0)).toBe(0);expect(meteorPower(140,0,0,0)).toBeGreaterThan(0);
  expect(meteorPower(140,1,0,0)).toBe(0);expect(meteorPower(welcomeDurationMs,0,0,0)).toBe(0);
  for(let t=0;t<=welcomeDurationMs;t+=10)for(let m=0;m<4;m++)for(let r=0;r<3;r++)for(let c=0;c<4;c++){
   const p=meteorPower(t,m,c,r);expect(p).toBeGreaterThanOrEqual(0);expect(p).toBeLessThanOrEqual(1);
   expect(Math.abs(p-meteorPower(t+1,m,c,r))).toBeLessThan(.025);
  }
 });
 it('fits all 96 tile footprints inside the actual original eight projector face polygons',()=>{
  expect(data.lenses).toHaveLength(8);
  for(const l of data.lenses){
   const center=new Vector3(...l.center),u=new Vector3(...l.u),v=new Vector3(...l.v);
   const plane=(p:number[])=>{const q=new Vector3(...p).sub(center);return new Vector3(q.dot(u),q.dot(v),0);};
   const triangles=l.triangles.map(t=>new Triangle(...t.map(plane) as [Vector3,Vector3,Vector3]));
   for(let row=0;row<3;row++)for(let col=0;col<4;col++)for(const x of [-.0027,.0027])for(const y of [-.00235,.00235]){
    const p=new Vector2((col-1.5)*.007+x,(row-1)*.0065+y);
    expect(triangles.some(t=>t.containsPoint(new Vector3(p.x,p.y,0))),`${l.material}/${row}/${col}`).toBe(true);
   }
  }
 });
 it('keeps new optical faces behind the original headlamp enclosure surface',async()=>{
  const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('apps/web/public/models/su7-runtime.glb');
  const node=doc.getRoot().listNodes().find(n=>n.getName()==='Mesh70')!,matrix=new Matrix4().fromArray(node.getWorldMatrix()),triangles:Triangle[]=[];
  for(const primitive of node.getMesh()!.listPrimitives()){
   const p=primitive.getAttribute('POSITION')!,points=Array.from({length:p.getCount()},(_,i)=>new Vector3().fromArray(p.getArray()!,i*3).applyMatrix4(matrix)),indices=primitive.getIndices()?.getArray()??points.map((_,i)=>i);
   for(let i=0;i<indices.length;i+=3)triangles.push(new Triangle(points[indices[i]],points[indices[i+1]],points[indices[i+2]]));
  }
  for(const l of data.lenses)for(let row=0;row<3;row++)for(let col=0;col<4;col++)for(const x of [-.0027,.0027])for(const y of [-.00235,.00235]){
   const normal=new Vector3(...l.normal),center=new Vector3(...l.center).addScaledVector(new Vector3(...l.u),(col-1.5)*.007+x).addScaledVector(new Vector3(...l.v),(row-1)*.0065+y).addScaledVector(normal,.0025);
   const ray=new Ray(center,normal),distances=triangles.map(t=>ray.intersectTriangle(t.a,t.b,t.c,false,new Vector3())).filter((p):p is Vector3=>!!p).map(p=>p.distanceTo(center));
   expect(Math.min(...distances),l.material).toBeGreaterThan(.001);expect(Math.min(...distances),l.material).toBeLessThan(.4);
  }
 });
});
