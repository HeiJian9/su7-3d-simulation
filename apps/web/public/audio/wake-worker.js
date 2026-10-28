/* global self, WebSocket, location */
// Audio goes only to the same-origin local Node service, never to a cloud KWS.
let socket,inFlight=false,queue=[];
function flush(){if(socket?.readyState===WebSocket.OPEN&&!inFlight&&queue.length){inFlight=true;socket.send(queue.shift());}}
self.onmessage=({data})=>{
 if(data.type==='init'){
  socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/wake`);socket.binaryType='arraybuffer';
  socket.onmessage=({data})=>{try{const result=JSON.parse(data);if(result.type==='metrics'){inFlight=false;flush();}self.postMessage(result);}catch{self.postMessage({type:'error',message:'唤醒服务响应无效。'});}};
  socket.onerror=()=>self.postMessage({type:'error',message:'本地唤醒服务连接失败，请关闭后重试。'});
  socket.onclose=event=>self.postMessage({type:'error',message:'本地唤醒服务已断开，请重试。',code:event.code,reason:event.reason});
 }else if(socket?.readyState===WebSocket.OPEN){
  if(data.type==='samples'){
   if(queue.length>100){self.postMessage({type:'error',message:'本地唤醒处理过慢，请关闭后重试。',code:'CLIENT_BACKPRESSURE'});socket.close();}
   else{queue.push(data.samples);flush();}
  }else if(data.type==='reset'){queue=[];socket.send(JSON.stringify({type:'reset'}));}
 }
};
