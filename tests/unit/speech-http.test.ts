import express from 'express';
import type { Server } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { speechRoutes } from '../../apps/server/src/speech/routes';
import { providerConfig } from '../../apps/server/src/speech/config';
import { testWave } from '../e2e/global-setup';

const servers: Server[]=[];
async function listen(app:ReturnType<typeof express>){
  const server=app.listen(0,'127.0.0.1');servers.push(server);
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();if(!address||typeof address==='string')throw Error('No local test port');
  return `http://127.0.0.1:${address.port}`;
}
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))));});
function recording(id:string,bytes=testWave(1,true)){
  const form=new FormData();form.append('requestId',id);form.append('durationMs','1000');form.append('audio',new Blob([new Uint8Array(bytes)],{type:'audio/wav'}),'command.wav');return form;
}
it('local HTTP test Mock: multipart audio, protocol payload, deduplication, conflict and binary TTS',async()=>{
  let asrCalls=0,ttsCalls=0;
  const relay=express();relay.use(express.json({limit:'6mb'}));
  relay.post('/v1beta/models/gemini-3.8-flash:generateContent',(req,res)=>{
    asrCalls++;expect(req.headers['x-goog-api-key']).toBe('local-test-only');
    expect(req.body.contents[0].parts[1].inlineData.data).toBe(testWave(1,true).toString('base64'));
    res.json({candidates:[{content:{parts:[{text:'左前窗开一半'}]}}]});
  });
  relay.post('/v1/audio/speech',(req,res)=>{ttsCalls++;expect(req.body.voice).toBe('mock-zh');res.type('audio/wav').send(testWave(.1,true));});
  const upstream=await listen(relay);
  const config=providerConfig({ASR_BASE_URL:upstream+'/v1beta',ASR_PROTOCOL:'gemini-native',ASR_MODEL:'gemini-3.8-flash',ASR_API_KEY:'local-test-only',TTS_BASE_URL:upstream+'/v1',TTS_PROTOCOL:'openai-speech',TTS_MODEL:'mock-tts',TTS_VOICE:'mock-zh',TTS_API_KEY:'local-test-only'});
  const app=express();app.use(express.json());app.use(speechRoutes(config));const base=await listen(app);
  for(let i=0;i<2;i++){
    const response=await fetch(base+'/transcribe',{method:'POST',body:recording('same')});expect(response.status).toBe(200);expect((await response.json()).text).toBe('左前窗开一半');
  }
  expect(asrCalls).toBe(1);
  expect((await fetch(base+'/transcribe',{method:'POST',body:recording('same',testWave(.5,true))})).status).toBe(409);
  for(let i=0;i<2;i++){
    const response=await fetch(base+'/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:'same-tts',text:'左前窗已打开一半。'})});expect(response.headers.get('content-type')).toContain('audio/wav');expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(44);
  }
  expect(ttsCalls).toBe(1);
  expect((await fetch(base+'/transcribe',{method:'POST',body:recording('bad',Buffer.from('bad audio'))})).status).toBe(415);
  expect(asrCalls).toBe(1);
});
it('unconfigured HTTP routes and malformed requests return explicit errors without any provider call',async()=>{
  const app=express();app.use(express.json());app.use(speechRoutes(providerConfig({})));const base=await listen(app);
  const response=await fetch(base+'/transcribe',{method:'POST',body:recording('unconfigured')});expect(response.status).toBe(503);expect((await response.json()).code).toBe('NOT_CONFIGURED');
  const missing=await fetch(base+'/transcribe',{method:'POST',body:new FormData()});expect(missing.status).toBe(400);
  const bad=await fetch(base+'/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"requestId":"x","text":""}'});expect(bad.status).toBe(400);
});
