import {it,expect} from 'vitest';
import express from 'express';
import {networkInterfaces} from 'node:os';
import {welcomeRoutes} from '../../apps/server/src/welcome';
it('shares actual trigger snapshots over SSE, rejects malformed actions and protects nonlocal pairing',async()=>{
 const app=express();app.use('/api/welcome',express.json(),welcomeRoutes());const server=app.listen(0,'0.0.0.0');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();if(!address||typeof address==='string')throw Error();const base=`http://127.0.0.1:${address.port}`;
 const abort=new AbortController();
 try{
  const pair=await(await fetch(base+'/api/welcome/pair')).json();expect(pair.token).toHaveLength(48);
  const sse=await fetch(base+'/api/welcome/events',{signal:abort.signal}),reader=sse.body!.getReader(),decoder=new TextDecoder();expect(decoder.decode((await reader.read()).value)).toContain('data:');
  const action={requestId:'retry-safe',action:'play'},post=()=>fetch(base+'/api/welcome/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action)});
  const first=await(await post()).json(),event=decoder.decode((await reader.read()).value);expect(event).toContain('retry-safe');expect((await(await post()).json()).sequence).toBe(first.sequence);
  expect((await fetch(base+'/api/welcome/action',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"script","requestId":"bad"}'})).status).toBe(400);
  expect((await fetch(base+'/api/welcome/state',{headers:{Origin:'https://unrelated.example'}})).status).toBe(403);
  const lan=Object.entries(networkInterfaces()).filter(([name])=>!/VPN|VMware|VMnet|Virtual/i.test(name)).flatMap(([,addresses])=>addresses??[]).find(a=>a.family==='IPv4'&&!a.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(a.address));
  if(lan){const host=`http://${lan.address}:${address.port}/api/welcome`;
   expect((await fetch(host+'/state')).status).toBe(403);expect((await fetch(host+'/pair',{headers:{Authorization:`Bearer ${pair.token}`}})).status).toBe(403);
   expect((await fetch(host+'/state',{headers:{Authorization:`Bearer ${pair.token}`}})).status).toBe(200);
  }
 }finally{abort.abort();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
