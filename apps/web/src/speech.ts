import { create } from 'zustand';
import { transcriptSchema, type SpeechHealth } from '../../../packages/shared/src/speech';
import { VoiceRecorder, type RecordedAudio } from './audio/recorder';
import { ApiAudioPlayer, type PlaybackStop } from './audio/player';
import { useVehicle, waitForVehicleExecution } from './vehicle';
import {parseVehicleText,VehicleLedger,commandKeys} from '../../../packages/shared/src/vehicle';
import {assistantPlanSchema, type ToolCall, type AssistantInput} from '../../../packages/shared/src/assistant';
import {validateTool} from '../../../packages/shared/src/capabilities';
import {targetScopeError,unsupportedRequestPart} from '../../../packages/shared/src/tool-policy';

export type SpeechPhase = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'resolving' | 'executing' | 'clarifying' | 'synthesizing' | 'speaking' | 'error';
interface SpeechState {
  routing: 'auto'|'llm';
  phase: SpeechPhase;
  message: string;
  transcript: string;
  rms: number;
  durationMs: number;
  hasSpeech: boolean;
  errorCode: string;
  lastFeedback: string;
  enabled: boolean;
  health: SpeechHealth;
  traces: Array<{ requestId: string; time: string; stage: string; detail: string; mock: boolean }>;
}
const initialHealth: SpeechHealth = {
  mode: 'unconfigured',
  asr: { configured: false, model: 'gemini-3.8-flash', protocol: 'unconfigured', audioFormats: ['audio/webm','audio/wav'], missing: [], probe: 'not-verified' },
  tts: { configured: false, model: '', voice: '', protocol: 'unconfigured', missing: [], probe: 'not-verified' },
};
export const useSpeech = create<SpeechState>(() => ({ routing:'auto', phase: 'idle', message: '点击开始，说完自动结束。', transcript: '', rms: 0, durationMs: 0, hasSpeech: false, errorCode: '', lastFeedback: '', enabled: true, health: initialHealth, traces: [] }));
export function configureSpeech(health: SpeechHealth) { useSpeech.setState({ health }); }
class SpeechFailure extends Error { constructor(public code: string, message: string) { super(message); } }
async function responseError(response: Response): Promise<never> {
  let error: { code?: string; message?: string } = {};
  try { error = await response.json(); } catch { /* Keep errors local and free of response bodies. */ }
  throw new SpeechFailure(error.code ?? 'SERVICE_ERROR', error.message ?? `语音服务暂不可用（HTTP ${response.status}）。`);
}
export interface RecorderPort { start(formats: string[], callbacks: Parameters<VoiceRecorder['start']>[1]): Promise<void>; stop(): Promise<void>; cancel(): void }
export interface PlayerPort { play(blob: Blob): Promise<'ended' | 'stopped'>; stop(): PlaybackStop | void }
export class SpeechCoordinator {
  private generation = 0;
  private request?: AbortController;
  private currentId = '';
  private transcribingGeneration = -1;
  private base = { revision: 0, epoch: 0 };
  private ruleFeedback?: {input:AssistantInput;commands:import('../../../packages/shared/src/vehicle').VehicleCommand[]};
  private unsubscribe: () => void;
  constructor(private recorder: RecorderPort = new VoiceRecorder(), private player: PlayerPort = new ApiAudioPlayer(), private fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.unsubscribe = useVehicle.subscribe((state, previous) => { if (state.epoch !== previous.epoch && useSpeech.getState().phase !== 'idle') this.cancel('已优先处理新的手动或文字操作。'); });
  }
  destroy() { this.cancel(); this.unsubscribe(); }
  private trace(stage: string, detail: string, requestId = this.currentId) {
    useSpeech.setState((s) => ({ traces: [...s.traces.slice(-399), { requestId, time: new Date().toISOString(), stage, detail: detail.slice(0,2000), mock: s.health.mode === 'test-mock' }] }));
  }
  private valid(generation: number) { return generation === this.generation; }
  cancel(message = '此次语音已取消；已接受的车辆动作不回滚。') {
    const phase=useSpeech.getState().phase;
    this.generation++; this.request?.abort(); this.request = undefined; this.ruleFeedback=undefined; this.recorder.cancel(); const playback=this.player.stop();
    if(playback?.wasPlaying)this.trace('tts-stopped',`paused; position ${playback.positionMs} ms`);
    if(!['idle','error'].includes(phase))this.trace('cancelled',`${phase}; ${message}`);
    useSpeech.setState({ phase: 'idle', message, rms: 0, errorCode: '', hasSpeech: false });
    return playback;
  }
  async start(source:'click'|'wake'='click') {
    const playback=this.cancel('准备录音。');
    const generation = this.generation;
    this.currentId = crypto.randomUUID(); this.base = { revision: useVehicle.getState().state.revision, epoch: useVehicle.getState().epoch };
    const requestId=this.currentId;
    useSpeech.setState({ phase: 'requesting', message: playback?.wasPlaying ? '已停止播报，正在准备麦克风…' : '等待麦克风权限…', transcript: '', durationMs: 0, errorCode: '' });
    this.trace('recording-request',source==='wake'?'真实本地关键词唤醒':'用户点击开始');
    if(playback?.wasPlaying){await new Promise(resolve=>setTimeout(resolve,180));if(!this.valid(generation))return;}
    this.trace('capture-starting','旧音频已停止；请求音频输入');
    await this.recorder.start(useSpeech.getState().health.asr.audioFormats, {
      meter: (rms, durationMs, hasSpeech) => { if (this.valid(generation)) useSpeech.setState({ phase: 'recording', message: hasSpeech ? '正在聆听，停顿后自动结束。' : '请说出指令，开口前可准备15秒。', rms, durationMs, hasSpeech }); },
      done: (audio) => { if (this.valid(generation)) void this.transcribe(audio, generation); },
      error: (error) => { if (this.valid(generation)) void this.notifyFailure(error.code, ['NO_SPEECH','EMPTY_AUDIO'].includes(error.code)?'我没听清，请再说一遍。':error.message,generation); },
      released: (tracks,allEnded) => this.trace('microphone-released',`${tracks} tracks; all ended: ${allEnded}`,requestId),
    });
  }
  async stopRecording() { await this.recorder.stop(); }
  private fail(code: string, message: string) { useSpeech.setState({ phase: 'error', errorCode: code, message, rms: 0 }); this.trace('error', code); }
  private async notifyFailure(code:string,message:string,generation:number){
    this.fail(code,message);useVehicle.getState().say(message);useSpeech.setState({lastFeedback:message});
    if(useSpeech.getState().enabled&&useSpeech.getState().health.tts.configured){useSpeech.setState({errorCode:''});await this.speak(message,generation,false);if(this.valid(generation)&&!useSpeech.getState().errorCode)this.fail(code,message);}
  }
  private async transcribe(audio: RecordedAudio, generation: number) {
    if (!this.valid(generation) || this.transcribingGeneration === generation) return;
    this.transcribingGeneration = generation;
    const requestId = this.currentId;
    this.request = new AbortController();
    useSpeech.setState({ phase: 'transcribing', message: '正在识别你的话…', rms: 0, durationMs: audio.durationMs });
    this.trace('transcribing', `${audio.mimeType}; ${audio.durationMs} ms; ${audio.reason}`);
    try {
      const form = new FormData(); form.append('audio', audio.blob, audio.mimeType === 'audio/wav' ? 'command.wav' : 'command.webm'); form.append('requestId', requestId); form.append('durationMs', String(audio.durationMs));
      const response = await this.fetcher('/api/speech/transcribe', { method: 'POST', body: form, signal: AbortSignal.any([this.request.signal, AbortSignal.timeout(23000)]) });
      if (!response.ok) await responseError(response);
      const transcript = transcriptSchema.parse(await response.json());
      if (!this.valid(generation)) return;
      if (transcript.requestId !== requestId) throw new SpeechFailure('REQUEST_ID_MISMATCH', '转写响应编号不匹配，已丢弃。');
      if (transcript.model !== useSpeech.getState().health.asr.model) throw new SpeechFailure('MODEL_MISMATCH', '转写响应模型与当前配置不一致，已丢弃。');
      useSpeech.setState({ phase: 'resolving', transcript: transcript.text, message: '正在理解你的意思…' });
      this.trace('transcript',transcript.text);
      this.trace('asr-completed', `${transcript.model}; ${transcript.durationMs} ms`);
      const result = await this.resolve(transcript.text,'voice',generation,{...this.base,requestId});
      if(!this.valid(generation))return;
      if (result.kind === 'stale') { this.fail('STALE_RESPONSE', result.message); return; }
      await this.feedback(result, generation);
    } catch (error) {
      if (!this.valid(generation)) return;
      await this.notifyFailure(error instanceof SpeechFailure ? error.code : error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'TRANSCRIBE_FAILED', error instanceof SpeechFailure ? error.code==='EMPTY_TRANSCRIPT'?'我没听清，请再说一遍。':error.message : error instanceof Error && error.name === 'TimeoutError' ? '转写超时，请重试。' : '语音转写失败，请检查接口配置或重试。',generation);
    }
  }
  async text(input: string) {
    this.cancel('正在处理文字指令。');
    const generation = this.generation;
    this.currentId=crypto.randomUUID();
    try{const result=await this.resolve(input,'text',generation);if(this.valid(generation))await this.feedback(result,generation);}catch(error){if(this.valid(generation))await this.notifyFailure(error instanceof SpeechFailure?error.code:'ASSISTANT_FAILED',error instanceof SpeechFailure?error.message:'智能助手服务暂时不可用，请稍后重试。',generation);}
  }
  private async resolve(input:string,origin:'text'|'voice',generation:number,guard?:{revision:number;epoch:number;requestId:string}):Promise<ReturnType<ReturnType<typeof useVehicle.getState>['text']>>{
    const store=useVehicle.getState(),rules=parseVehicleText(input,store.context);
    const cancellation=/^(取消|算了|不用了|停止操作|取消这条指令|取消刚才的指令)[。！!]?$/u.test(input.trim());
    if(cancellation||(useSpeech.getState().routing==='auto'&&rules.kind!=='unsupported'&&!store.context.assistantPending)){
      const before=structuredClone(store.state),context=structuredClone(store.context),history=store.messages.slice(-8).map(m=>({input:m.input,output:m.output}));
      this.trace('route','rules');const result=store.text(input,origin,guard);
      if(result.execution){
        if(rules.kind==='execute'&&useSpeech.getState().health.intent?.configured)this.ruleFeedback={input:{requestId:result.execution.requestId,text:input,state:before,actual:{...store.actualParts},available:[...new Set([...store.available.map(c=>`window:${c}`),...store.capabilities])],context:{focus:context.focus,history}},commands:rules.commands};
        useSpeech.setState({phase:'executing',message:'正在调整车辆部件…'});
      }return result;
    }
    if(origin==='text')store.beginManual();
    const current=useVehicle.getState(),base=guard??{revision:current.state.revision,epoch:current.epoch,requestId:this.currentId};
    const fresh=()=>this.valid(generation)&&useVehicle.getState().state.revision===base.revision&&useVehicle.getState().epoch===base.epoch;
    if(!fresh())return {kind:'stale',message:'车辆状态已改变，旧助手请求已丢弃。'};
    const focus=current.context.focus&&Date.now()-current.context.focus.updatedAt<120000?current.context.focus:undefined;
    const pending=store.context.assistantPending&&store.context.assistantPending.expiresAt>Date.now()?store.context.assistantPending:undefined;
    this.request=new AbortController();const signal=this.request.signal;
    useSpeech.setState({phase:'resolving',message:'正在理解你的意思…'});this.trace('route','llm / real function calling');
    const response=await this.fetcher('/api/assistant/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:base.requestId,text:input,state:current.state,actual:current.actualParts,available:[...new Set([...current.available.map(c=>`window:${c}`),...current.capabilities])],context:{focus,pending,history:current.messages.slice(-8).map(m=>({input:m.input,output:m.output}))}}),signal:AbortSignal.any([signal,AbortSignal.timeout(35000)])});
    if(!response.ok)await responseError(response);const plan=assistantPlanSchema.parse(await response.json());
    if(!fresh())return {kind:'stale',message:'车辆状态已改变，旧模型回复已丢弃。'};
    if(plan.requestId!==base.requestId||plan.baseRevision!==base.revision)throw new SpeechFailure('REQUEST_ID_MISMATCH','模型响应编号或版本不一致，车辆未改变。');
    // Independently validate all calls in the browser before any mutation.
    const commands=plan.calls.flatMap(c=>validateTool(c.function.name,JSON.parse(c.function.arguments)).commands??[]);
    if(JSON.stringify(commands)!==JSON.stringify(plan.commands)||new Set(plan.calls.map(c=>c.id)).size!==plan.calls.length)throw new SpeechFailure('INVALID_TOOLS','工具调用未通过浏览器校验，车辆未改变。');
    const scopeError=targetScopeError(pending?`${pending.text}；补充：${input}`:input,commands,current.context.focus);if(scopeError)throw new SpeechFailure('AMBIGUOUS_TARGET',scopeError);
    if(commands.length&&unsupportedRequestPart(pending?`${pending.text}；补充：${input}`:input))throw new SpeechFailure('UNSUPPORTED_REQUEST_PART','本轮包含尚未实现的功能，所有动作均未执行。');
    for(const c of plan.calls)this.trace('tool-call',JSON.stringify(c));
    let message:string,kind:string,execution:ReturnType<ReturnType<typeof useVehicle.getState>['submit']>|undefined;
    if(plan.commands.length){
      const check=new VehicleLedger().apply(current.state,{requestId:base.requestId,baseRevision:base.revision,origin,route:'llm',commands},new Set([...current.available.map(c=>`window:${c}`),...current.capabilities]));
      if(!check.ok)throw new SpeechFailure(check.code,check.message);
      execution=useVehicle.getState().submit({requestId:base.requestId,baseRevision:base.revision,origin,route:'llm',commands});
      if(!execution)throw new SpeechFailure('EXECUTION_FAILED',useVehicle.getState().feedback);
      useSpeech.setState({phase:'executing',message:'正在调整车辆…'});execution=await waitForVehicleExecution(execution);
      if(!this.valid(generation))return {kind:'stale',message:'本轮助手已取消。'};
      message=execution.message;kind=execution.status==='completed'?'execute':'failed';
    }else{
      const reply=validateTool(plan.calls[0].function.name,JSON.parse(plan.calls[0].function.arguments)).reply;
      if(!reply||JSON.stringify(reply)!==JSON.stringify(plan.reply))throw new SpeechFailure('INVALID_REPLY','助手回复与工具不一致。');
      kind=reply.kind;message=kind==='unsupported'?'暂不支持该功能。':kind==='not_understood'?'我没听清，请再说一遍。':kind==='noop'?'已取消或保留否定要求，车辆未改变。':reply.message;
      useVehicle.setState(s=>({context:{focus:s.context.focus,...(kind==='clarify'?{assistantPending:{text:pending?`${pending.text}；补充：${input}`:input,question:message,expiresAt:Date.now()+120000}}:{})}}));
    }
    const result={kind,message,execution:execution??undefined};
    useVehicle.setState(s=>({feedback:message,messages:[...s.messages.slice(-19),{id:base.requestId,input,output:message,origin,status:kind}]}));
    const appliedRevision=useVehicle.getState().state.revision,appliedEpoch=useVehicle.getState().epoch;
    let observationIndex=0;
    const receipts=plan.calls.map((call:ToolCall)=>{const own=validateTool(call.function.name,JSON.parse(call.function.arguments)).commands??[],keys=new Set(own.flatMap(commandKeys)),start=observationIndex;observationIndex+=own.length;return {tool_call_id:call.id,status:execution?.status==='completed'||!execution?'completed':execution.status==='superseded'?'superseded':'failed',message,revision:appliedRevision,effects:execution?.effects.filter(e=>keys.has(e.key))??[],observations:execution?.observations.slice(start,observationIndex)??[]};});
    for(const receipt of receipts)this.trace('tool-result',JSON.stringify(receipt));
    const finish=await this.fetcher('/api/assistant/finish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({turnId:plan.turnId,requestId:base.requestId,results:receipts}),signal:AbortSignal.any([signal,AbortSignal.timeout(35000)])});
    if(!finish.ok)await responseError(finish);const answer=await finish.json() as {requestId:string;text:string};
    if(!this.valid(generation)||useVehicle.getState().state.revision!==appliedRevision||useVehicle.getState().epoch!==appliedEpoch)return {kind:'stale',message:'车辆状态已改变，旧助手反馈已丢弃。'};
    if(answer.requestId!==base.requestId||typeof answer.text!=='string')throw new SpeechFailure('INVALID_FINAL_REPLY','助手反馈响应无效。');
    this.trace('assistant-feedback',answer.text);
    // Execution status and capability failure wording remain authoritative.
    if(!['unsupported','not_understood','noop'].includes(kind)&&kind!=='failed'){result.message=answer.text;useVehicle.getState().say(answer.text);useVehicle.setState(s=>({messages:s.messages.map(m=>m.id===base.requestId?{...m,output:answer.text}:m)}));}
    return result;
  }
  private async feedback(result: ReturnType<ReturnType<typeof useVehicle.getState>['text']>, generation: number) {
    let message = result.message;
    if (result.execution) {
      useSpeech.setState({ phase: 'executing', message: '正在调整车辆部件…' });
      const execution = await waitForVehicleExecution(result.execution);
      if (!this.valid(generation)) return;
      if (execution.status !== 'completed') { await this.notifyFailure(execution.status.toUpperCase(), execution.message, generation); return; }
      message = execution.route==='llm'?result.message:execution.message; this.trace('completed', `${execution.requestId}; revision ${execution.revision}; ${JSON.stringify(execution.effects)}`);
      const wording=this.ruleFeedback;
      if(execution.route==='rules'&&wording?.input.requestId===execution.requestId){
        const revision=useVehicle.getState().state.revision,epoch=useVehicle.getState().epoch;
        this.request=new AbortController();useSpeech.setState({phase:'resolving',message:'正在准备回复…'});
        try{
          const response=await this.fetcher('/api/assistant/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...wording,result:{status:'completed',revision:execution.revision,effects:execution.effects,boundary:execution.boundary}}),signal:AbortSignal.any([this.request.signal,AbortSignal.timeout(12000)])});
          if(!response.ok)await responseError(response);const answer=await response.json() as {requestId:string;text:string};
          if(!this.valid(generation)||useVehicle.getState().state.revision!==revision||useVehicle.getState().epoch!==epoch)return;
          if(answer.requestId!==execution.requestId||typeof answer.text!=='string'||!answer.text.trim()||answer.text.length>500)throw new SpeechFailure('INVALID_FINAL_REPLY','助手回复格式无效。');
          message=answer.text;this.trace('assistant-feedback',message);useVehicle.getState().say(message);useVehicle.setState(s=>({messages:s.messages.map(m=>m.id===execution.requestId?{...m,output:message}:m)}));
        }catch{if(!this.valid(generation)||useVehicle.getState().state.revision!==revision||useVehicle.getState().epoch!==epoch)return;this.trace('feedback-fallback','动作已确认完成；自然回复服务未返回，使用真实执行结果播报。');}
        this.ruleFeedback=undefined;
      }
    }
    if (!this.valid(generation)) return;
    useSpeech.setState({ phase: result.kind === 'clarify' ? 'clarifying' : 'idle', message, lastFeedback: message });
    if(result.kind==='clarify')this.trace('clarifying',message);
    else if(!result.execution)this.trace('no-action',message);
    if (useSpeech.getState().enabled && useSpeech.getState().health.tts.configured) await this.speak(message, generation, result.kind === 'clarify');
  }
  async replay() { this.cancel('准备重播。'); const message = useSpeech.getState().lastFeedback || useVehicle.getState().feedback; this.currentId = crypto.randomUUID(); await this.speak(message, this.generation, !!useVehicle.getState().context.pending); }
  stopSpeaking() { this.cancel('播报已停止，车辆状态保持。'); }
  cancelClarification() {
    this.cancel('已取消待确认指令，车辆目标保持不变。');
    useVehicle.getState().beginManual();useVehicle.getState().say('已取消待确认指令，车辆目标保持不变。');
    this.trace('clarification-cancelled','用户取消追问；未提交车辆动作');
  }
  private async speak(text: string, generation: number, clarify: boolean) {
    this.player.stop(); this.request?.abort(); this.request = new AbortController();
    useSpeech.setState({ phase: 'synthesizing', message: '动作与文字已确认，正在生成语音…', lastFeedback: text });
    this.trace('tts-request', 'API TTS feedback');
    try {
      const response = await this.fetcher('/api/speech/synthesize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: `${this.currentId}-tts`, text }), signal: AbortSignal.any([this.request.signal, AbortSignal.timeout(30000)]) });
      if (!response.ok) await responseError(response);
      const blob = await response.blob();
      if (!this.valid(generation)) return;
      if (!blob.size || !blob.type.startsWith('audio/')) throw new SpeechFailure('INVALID_TTS_AUDIO', '播报接口没有返回有效音频。');
      useSpeech.setState({ phase: 'speaking', message: text });
      this.trace('tts-started','正在播放实际 API 音频');
      const ended = await this.player.play(blob);
      if (this.valid(generation) && ended === 'ended') { useSpeech.setState({ phase: clarify && useVehicle.getState().context.pending ? 'clarifying' : 'idle', message: text }); this.trace('tts-ended', 'API audio playback ended'); }
    } catch (error) {
      if (!this.valid(generation)) return;
      this.fail(error instanceof SpeechFailure ? error.code : 'TTS_FAILED', `${error instanceof SpeechFailure ? error.message : 'API 播报失败，可单独重播。'} 已完成的车辆动作与文字保留。`);
    }
  }
}
let active: SpeechCoordinator | undefined;
export function speechCoordinator() { return active ??= new SpeechCoordinator(); }
