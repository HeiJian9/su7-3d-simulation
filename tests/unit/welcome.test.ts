import {describe,it,expect} from 'vitest';
import {Matrix4,Ray,Triangle,Vector2,Vector3} from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {WelcomeController,meteorPower,welcomeActionSchema,welcomeDurationMs} from '../../packages/shared/src/welcome';
import data from '../../apps/web/src/data/welcome-lenses.json';
describe('welcome event semantics and original lens fit',()=>{
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
