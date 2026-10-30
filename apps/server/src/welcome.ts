import {Router,type Request,type Response} from 'express';
import {randomBytes} from 'node:crypto';
import {WelcomeController,welcomeActionSchema} from '../../../packages/shared/src/welcome.js';

/** Small event channel on the existing HTTP server, never a per-frame stream. */
export function welcomeRoutes(){
 const router=Router(),controller=new WelcomeController(),clients=new Set<Response>();
 const token=randomBytes(24).toString('hex');
 const local=(req:Request)=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'');
 router.use((req,res,next)=>{
  if(req.headers.origin){try{const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host&&!(['localhost','127.0.0.1'].includes(origin.hostname)&&local(req)))throw Error();}catch{res.status(403).json({code:'ORIGIN_REJECTED'});return;}}
  if(!local(req)&&req.headers.authorization!==`Bearer ${token}`&&req.query.token!==token){res.status(403).json({code:'PAIRING_REQUIRED'});return;}
  next();
 });
 router.get('/pair',(req,res)=>{if(!local(req)){res.sendStatus(403);return;}res.set('Cache-Control','no-store').json({token});});
 router.get('/state',(_req,res)=>res.set('Cache-Control','no-store').json(controller.snapshot()));
 router.get('/events',(req,res)=>{
  if(clients.size>=20){res.sendStatus(503);return;}
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
  const send=()=>res.write(`data: ${JSON.stringify(controller.snapshot())}\n\n`);
  send();clients.add(res);const timer=setInterval(()=>res.write(': heartbeat\n\n'),15000);timer.unref();
  req.on('close',()=>{clearInterval(timer);clients.delete(res);});
 });
 router.post('/action',(req,res)=>{
  const input=welcomeActionSchema.safeParse(req.body);if(!input.success){res.status(400).json({code:'INVALID_WELCOME_ACTION'});return;}
  const result=controller.apply(input.data);if(result.changed)for(const client of clients){if(client.writableLength>65536){client.end();clients.delete(client);}else client.write(`data: ${JSON.stringify(result.snapshot)}\n\n`);}
  res.set('Cache-Control','no-store').json(result.snapshot);
 });
 return router;
}
