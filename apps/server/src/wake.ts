import {WebSocketServer} from 'ws';
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import type {Server} from 'node:http';
export function attachWake(server:Server,root:string){
 const sockets=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
 const recent:Array<{at:string;reason:string;frames:number;peak:number}>=[];
 server.on('upgrade',(request,socket,head)=>{
  let origin:URL|undefined;try{origin=new URL(request.headers.origin??'');}catch{/* require browser origin */}
  if(request.url!=='/api/wake'||!origin||origin.host!==request.headers.host||!['localhost','127.0.0.1'].includes(origin.hostname)||sockets.clients.size>=2){socket.destroy();return;}
  sockets.handleUpgrade(request,socket,head,ws=>sockets.emit('connection',ws));
 });
 sockets.on('connection',ws=>{
  const worker=new Worker(path.join(root,'scripts/wake-worker.mjs'),{workerData:{root}});let pending=0,frames=0,peak=0,reason='CLIENT_CLOSED';
  const reject=(code:string)=>{reason=code;ws.close(1008,code);};
  worker.on('message',message=>{if(message.type==='metrics')pending=Math.max(0,pending-1);if(ws.readyState===ws.OPEN)ws.send(JSON.stringify(message));});
  worker.on('error',()=>{reason='WORKER_ERROR';if(ws.readyState===ws.OPEN){ws.send(JSON.stringify({type:'error',message:'本地中文唤醒模型不可用，请检查安装和模型文件。',code:'WORKER_ERROR'}));ws.close();}});
  ws.on('message',(bytes,binary)=>{
   if(!binary){if(bytes.toString()==='{"type":"reset"}')worker.postMessage({type:'reset'});else reject('INVALID_CONTROL');return;}
   const b=Buffer.isBuffer(bytes)?bytes:Buffer.concat(bytes as Buffer[]);if(!b.length||b.length%4||b.length>16384){reject('INVALID_FRAME');return;}if(pending>20){reject('SERVER_BACKPRESSURE');return;}
   const samples=new Float32Array(Uint8Array.from(b).buffer);if(samples.some(n=>!Number.isFinite(n)||Math.abs(n)>1)){reject('INVALID_SAMPLE');return;}
   frames++;for(const n of samples)peak=Math.max(peak,Math.abs(n));pending++;worker.postMessage({type:'samples',samples:samples.buffer},[samples.buffer]);
  });
  let released=false;const release=()=>{if(released)return;released=true;recent.push({at:new Date().toISOString(),reason,frames,peak});while(recent.length>12)recent.shift();void worker.terminate();};ws.on('close',release);ws.on('error',release);
 });
 server.on('close',()=>{for(const ws of sockets.clients)ws.terminate();sockets.close();});
 return Object.assign(sockets,{diagnostics:()=>recent});
}
