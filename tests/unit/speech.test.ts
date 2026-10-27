import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerConfig, type AsrConfig, type TtsConfig } from '../../apps/server/src/speech/config';
import { synthesize, transcribe, validateAudio } from '../../apps/server/src/speech/providers';
import { encodeWav, newVad, stepVad } from '../../apps/web/src/audio/vad';
import { SpeechCoordinator, useSpeech, type RecorderPort, type PlayerPort } from '../../apps/web/src/speech';
import { corners, defaultVehicle as defaultWindows } from '../../packages/shared/src/vehicle';
import { manualWindow, useVehicle } from '../../apps/web/src/vehicle';

const asr: AsrConfig = { baseUrl: 'https://relay.example/v1beta', apiKey: 'unit-test-token', model: 'gemini-3.8-flash', protocol: 'gemini-native', auth: 'x-goog-api-key', formats: ['audio/wav'], timeoutMs: 1000 };
const tts: TtsConfig = { baseUrl: 'https://tts.example/v1', apiKey: 'unit-test-token', model: 'test-tts-model', voice: 'test-zh-voice', protocol: 'openai-speech', timeoutMs: 1000 };
async function audio() { const blob = encodeWav([new Float32Array(16000).fill(.1)], 16000); return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: 'audio/wav', durationMs: 1000, requestId: 'test-recording' }; }
describe('audio format and VAD safeguards', () => {
  it('encodes a real mono PCM WAV with consistent sample count', async () => {
    const input = await audio(); const view = new DataView(input.bytes.buffer);
    expect(view.getUint32(24,true)).toBe(16000);expect(view.getUint16(22,true)).toBe(1);expect(view.getUint32(40,true)).toBe(32000);
    expect(()=>validateAudio(input,['audio/wav'])).not.toThrow();
    expect(()=>validateAudio({...input,bytes:new Uint8Array()},['audio/wav'])).toThrow();
    expect(()=>validateAudio({...input,mimeType:'audio/webm'},['audio/webm'])).toThrow();
  });
  it('ends after actual speech and silence, rejects silence and isolated spikes', () => {
    const silence=newVad(0);expect(stepVad(silence,0,5000)).toBe('no-speech');
    const s=newVad(0);stepVad(s,.1,100);stepVad(s,0,140);stepVad(s,.1,200);expect(s.hasSpeech).toBe(false);
    for(const now of [240,280,320])stepVad(s,.1,now);
    expect(s.hasSpeech).toBe(true);expect(stepVad(s,0,1519)).toBe('continue');expect(stepVad(s,0,1520)).toBe('silence-end');
    expect(stepVad(s,.1,15000)).toBe('max-duration');
  });
});
describe('server protocol adapters (explicit test Mock, no external requests)', () => {
  it('reports only safe configuration metadata and enforces the required model', () => {
    const c=providerConfig({ASR_BASE_URL:asr.baseUrl,ASR_API_KEY:asr.apiKey,ASR_MODEL:'wrong-model',ASR_PROTOCOL:'gemini-native'});
    expect(c.asr).toBeNull();expect(c.health.asr.missing).toContain('ASR_MODEL');expect(JSON.stringify(c.health)).not.toContain(asr.apiKey);
  });
  it('uses actual audio bytes in native Gemini inlineData', async () => {
    const input=await audio();const fetcher=vi.fn(async()=>Response.json({candidates:[{content:{parts:[{text:'左前车窗打开一半'}]}}]}));
    const result=await transcribe(asr,input,undefined,fetcher as typeof fetch);
    const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    const body=JSON.parse(init.body as string);
    expect(url).toBe(`${asr.baseUrl}/models/gemini-3.8-flash:generateContent`);
    expect(body.contents[0].parts[1].inlineData.data).toBe(Buffer.from(input.bytes).toString('base64'));
    expect(result.text).toBe('左前车窗打开一半');expect(result.model).toBe('gemini-3.8-flash');
  });
  it('has a separate multimodal chat-audio adapter instead of a text-only request', async () => {
    const fetcher=vi.fn(async()=>Response.json({choices:[{message:{content:'右后窗关闭'}}]}));
    await transcribe({...asr,protocol:'openai-chat-audio',auth:'bearer'},await audio(),undefined,fetcher as typeof fetch);
    const init=(fetcher.mock.calls[0] as unknown as [string,RequestInit])[1],body=JSON.parse(init.body as string);
    expect(body.messages[1].content[0]).toMatchObject({type:'input_audio',input_audio:{format:'wav'}});
    expect(body.messages[1].content[0].input_audio.data.length).toBeGreaterThan(100);
  });
  it.each([[401,'AUTH_FAILED'],[403,'AUTH_FAILED'],[404,'MODEL_UNAVAILABLE'],[415,'AUDIO_FORMAT_UNSUPPORTED'],[429,'RATE_LIMITED'],[503,'UPSTREAM_ERROR']])('maps HTTP %s without reflecting credentials',async(status,code)=>{
    await expect(transcribe(asr,await audio(),undefined,(async()=>new Response('do not reflect '+asr.apiKey,{status:Number(status)})) as typeof fetch)).rejects.toMatchObject({code});
  });
  it('rejects unconfigured, empty and malformed results, timeout and cancellation',async()=>{
    const input=await audio();await expect(transcribe(null,input)).rejects.toMatchObject({code:'NOT_CONFIGURED'});
    await expect(transcribe(asr,input,undefined,(async()=>Response.json({candidates:[]})) as typeof fetch)).rejects.toMatchObject({code:'EMPTY_TRANSCRIPT'});
    await expect(transcribe(asr,input,undefined,(async()=>Response.json({candidates:[{content:{parts:'bad'}}]})) as typeof fetch)).rejects.toMatchObject({code:'INVALID_TRANSCRIPT'});
    const hanging:typeof fetch=async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('aborted'))));
    await expect(transcribe({...asr,timeoutMs:15},input,undefined,hanging)).rejects.toMatchObject({code:'TIMEOUT'});
    const abort=new AbortController();const pending=transcribe(asr,input,abort.signal,hanging);abort.abort();await expect(pending).rejects.toMatchObject({code:'CANCELLED'});
  });
  it('requests API TTS audio and rejects JSON disguised as a successful result',async()=>{
    const input=await audio(),fetcher=vi.fn(async()=>new Response(input.bytes,{headers:{'Content-Type':'audio/wav'}}));
    const result=await synthesize(tts,{text:'左前车窗已打开到一半。',requestId:'test-tts'},undefined,fetcher as typeof fetch);
    expect(result.contentType).toBe('audio/wav');expect(result.bytes.length).toBeGreaterThan(44);
    const body=JSON.parse((fetcher.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);expect(body).toMatchObject({model:'test-tts-model',voice:'test-zh-voice',response_format:'mp3'});
    await expect(synthesize(tts,{text:'测试',requestId:'invalid-tts'},undefined,(async()=>Response.json({ok:true})) as typeof fetch)).rejects.toMatchObject({code:'INVALID_TTS_AUDIO'});
  });
});
describe('voice orchestration race protection (explicit test Mock)',()=>{
  let callbacks:Parameters<RecorderPort['start']>[1];
  let coordinator:SpeechCoordinator;
  const recorder:RecorderPort={start:async(_formats,c)=>{callbacks=c;c.meter(.1,500,true);},stop:async()=>{},cancel:vi.fn()};
  const player:PlayerPort={play:vi.fn(async()=> 'ended' as const),stop:vi.fn()};
  beforeEach(()=>{
    useVehicle.setState({state:defaultWindows(),available:[...corners],context:{},epoch:0,executions:[],messages:[],preview:{}});
    const health=providerConfig({});health.health.mode='test-mock';health.health.asr.configured=true;health.health.tts.configured=true;
    useSpeech.setState({phase:'idle',health:health.health,lastFeedback:'',enabled:true,traces:[],errorCode:''});
  });
  afterEach(()=>coordinator?.destroy());
  it('drops a late transcript after a manual operation, even if transport ignores cancellation',async()=>{
    let resolve!: (value:Response)=>void;
    const fetcher:typeof fetch=async()=>new Promise(r=>{resolve=r;});
    coordinator=new SpeechCoordinator(recorder,player,fetcher);await coordinator.start();
    const input=await audio();callbacks.done({blob:new Blob([input.bytes],{type:'audio/wav'}),mimeType:'audio/wav',durationMs:1000,peakRms:.1,reason:'silence-end'});
    await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
    manualWindow(['rr'],.5);
    resolve(Response.json({text:'左前窗打开一半',requestId:'late-response',model:'gemini-3.8-flash',provider:'test-mock',durationMs:1,mock:true}));
    await new Promise(r=>setTimeout(r,20));
    expect(useVehicle.getState().state.windows.fl.openness).toBe(0);expect(useVehicle.getState().state.windows.rr.openness).toBe(.5);
  });
  it('speaks only after actual completion and preserves actions when TTS fails',async()=>{
    let calls=0;
    coordinator=new SpeechCoordinator(recorder,player,async()=>{calls++;return Response.json({code:'AUTH_FAILED',message:'测试 Mock：认证失败',retryable:false},{status:502});});
    const task=coordinator.text('左前窗开一半');
    expect(calls).toBe(0);expect(useSpeech.getState().phase).toBe('executing');
    useVehicle.getState().finish(useVehicle.getState().executions.at(-1)!.requestId,'completed');await task;
    expect(calls).toBe(1);expect(useVehicle.getState().state.windows.fl.openness).toBe(.5);expect(useSpeech.getState().phase).toBe('error');expect(useSpeech.getState().errorCode).toBe('AUTH_FAILED');
  });
  it('stops old playback and capture when beginning a new recording',async()=>{
    useSpeech.setState({phase:'speaking'});
    coordinator=new SpeechCoordinator(recorder,player);await coordinator.start();
    expect(player.stop).toHaveBeenCalled();expect(recorder.cancel).toHaveBeenCalled();expect(useSpeech.getState().phase).toBe('recording');
    coordinator.cancel();expect(useSpeech.getState().phase).toBe('idle');
  });
  it('rejects a transcript from a different configured model before changing the vehicle',async()=>{
    coordinator=new SpeechCoordinator(recorder,player,async(_url,init)=>Response.json({requestId:(init?.body as FormData).get('requestId'),text:'左前窗开一半',provider:'test-mock',model:'qwen3-asr-flash',durationMs:1,mock:true}));
    await coordinator.start();const input=await audio();callbacks.done({blob:new Blob([input.bytes],{type:'audio/wav'}),mimeType:'audio/wav',durationMs:1000,peakRms:.1,reason:'silence-end'});
    await vi.waitFor(()=>expect(useSpeech.getState().errorCode).toBe('MODEL_MISMATCH'));expect(useVehicle.getState().state.windows.fl.openness).toBe(0);
  });
  it('stops playback before capture and cancellation during the settling delay cannot acquire a microphone',async()=>{
    vi.useFakeTimers();
    try{
      const capture={start:vi.fn(async()=>{}),stop:async()=>{},cancel:vi.fn()};
      const playing={play:async()=> 'ended' as const,stop:vi.fn(()=>({wasPlaying:true,positionMs:220}))};
      coordinator=new SpeechCoordinator(capture,playing);useSpeech.setState({phase:'speaking'});
      const start=coordinator.start();expect(capture.start).not.toHaveBeenCalled();expect(useSpeech.getState().phase).toBe('requesting');
      coordinator.cancel();await vi.advanceTimersByTimeAsync(200);await start;
      expect(capture.start).not.toHaveBeenCalled();expect(useSpeech.getState().traces.some(t=>t.stage==='tts-stopped')).toBe(true);
    }finally{vi.useRealTimers();}
  });
  it('UI cancellation clears clarification without committing a vehicle operation',async()=>{
    coordinator=new SpeechCoordinator(recorder,player,async()=>new Response(new Uint8Array([1]),{headers:{'Content-Type':'audio/wav'}}));
    await coordinator.text('打开车窗');expect(useVehicle.getState().context.pending).toBeDefined();
    coordinator.cancelClarification();expect(useVehicle.getState().context.pending).toBeUndefined();expect(useVehicle.getState().state.revision).toBe(0);
  });
});
