import {create} from 'zustand';
import {useEffect} from 'react';
import type {WelcomeAction,WelcomeSnapshot} from '../../../packages/shared/src/welcome';

interface WelcomeStore {snapshot:WelcomeSnapshot|null;offset:number;connected:boolean;error:string;apply:(snapshot:WelcomeSnapshot)=>void}
export const useWelcome=create<WelcomeStore>((set,get)=>({snapshot:null,offset:0,connected:false,error:'',apply:s=>{
 if(get().snapshot?.sessionId===s.sessionId&&s.sequence<get().snapshot!.sequence)return;
 set({snapshot:s,offset:s.serverTime-Date.now(),connected:true,error:''});
}}));
const token=()=>new URLSearchParams(location.search).get('token');
export function useWelcomeConnection(){
 useEffect(()=>{
  let disposed=false;
  const events=new EventSource(`/api/welcome/events${token()?`?token=${encodeURIComponent(token()!)}`:''}`);
  events.onmessage=e=>{if(disposed)return;try{useWelcome.getState().apply(JSON.parse(e.data));}catch{useWelcome.setState({error:'迎宾状态读取失败'});}};
  events.onerror=()=>{if(!disposed)useWelcome.setState({connected:false,error:'迎宾服务连接中断，正在重连'});};
  return()=>{disposed=true;events.onmessage=events.onerror=null;events.close();useWelcome.setState({connected:false});};
 },[]);
}
export async function welcomeAction(action:WelcomeAction['action'],enabled?:boolean,brightness?:number){
 try{
  // The lightweight paired remote also works on private-LAN HTTP, where
  // randomUUID is unavailable. getRandomValues remains available there.
  const requestId=typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  const response=await fetch('/api/welcome/action',{method:'POST',headers:{'Content-Type':'application/json',...(token()?{Authorization:`Bearer ${token()}`}:{})},body:JSON.stringify({requestId,action,...(enabled===undefined?{}:{enabled}),...(brightness===undefined?{}:{brightness})}),signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw Error();const snapshot:WelcomeSnapshot=await response.json();useWelcome.getState().apply(snapshot);return snapshot;
 }catch{useWelcome.setState({error:'迎宾操作未确认，请检查连接后重试。'});return null;}
}
