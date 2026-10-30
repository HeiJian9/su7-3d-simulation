import {useEffect} from 'react';
import {useFrame} from '@react-three/fiber';
import {actualValues,completeExecutions,manualCommand,useVehicle} from './vehicle';
import {useWelcome,welcomeAction} from './welcome';
import type {WelcomeSnapshot} from '../../../packages/shared/src/welcome';

/** One vehicle ledger for panel, voice and LLM; SSE acknowledges the actual light state. */
export function WelcomeVehicleBridge(){
 useEffect(()=>{
  let disposed=false,receiving=false,busy=false,generation=0,queue=Promise.resolve();
  const register=useVehicle.getState().registerCapabilities;register('welcome-rain',['welcomeRain:front']);
  const receive=(snapshot:WelcomeSnapshot|null)=>{
   if(!snapshot||disposed)return;
   const enabled=!!snapshot.rain,brightness=snapshot.brightness;
   actualValues['welcomeRain:front:enabled']=enabled;actualValues['welcomeRain:front:brightness']=brightness;
   const desired=useVehicle.getState().state.welcomeRain;
   if(busy||desired.enabled===enabled&&desired.brightness===brightness)return;
   receiving=true;
   try{manualCommand([{component:'welcomeRain',targets:['front'],operation:'set',property:'enabled',value:enabled},{component:'welcomeRain',targets:['front'],operation:'set',property:'brightness',value:brightness}]);}
   finally{receiving=false;}
  };
  const vehicleOff=useVehicle.subscribe((s,previous)=>{
   if(receiving||s.state.welcomeRain===previous.state.welcomeRain||s.state.welcomeRain.enabled===previous.state.welcomeRain.enabled&&s.state.welcomeRain.brightness===previous.state.welcomeRain.brightness)return;
   const desired={...s.state.welcomeRain},ticket=++generation;busy=true;
   queue=queue.then(async()=>{
    if(disposed||ticket!==generation)return;
    const result=await welcomeAction('rain',desired.enabled,desired.brightness);
    if(disposed||ticket!==generation)return;
    busy=false;
    if(!result){
     const store=useVehicle.getState();
     for(const e of store.executions)if(e.status==='animating'&&e.effects.some(v=>v.key.startsWith('welcomeRain:')))store.finish(e.requestId,'failed','迎宾服务连接失败，流星雨操作未确认。请检查连接后重试。');
     // Preserve the confirmed state after a failed request, without reporting success.
     receiving=true;
     try{useVehicle.setState(s=>({state:{...s.state,revision:s.state.revision+1,welcomeRain:{enabled:!!useWelcome.getState().snapshot?.rain,brightness:useWelcome.getState().snapshot?.brightness??1}}}));}
     finally{receiving=false;}
    }else receive(useWelcome.getState().snapshot);
   });
  });
  const remoteOff=useWelcome.subscribe((s,p)=>{if(s.snapshot!==p.snapshot)receive(s.snapshot);});
  receive(useWelcome.getState().snapshot);
  return()=>{disposed=true;vehicleOff();remoteOff();register('welcome-rain',[]);delete actualValues['welcomeRain:front:enabled'];delete actualValues['welcomeRain:front:brightness'];};
 },[]);
 useFrame(()=>completeExecutions(),.7);
 return null;
}
