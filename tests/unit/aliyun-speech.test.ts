import { expect, it, vi } from 'vitest';
import { aliyunAudioUrl, synthesize, transcribe } from '../../apps/server/src/speech/providers';
import { providerConfig, type AsrConfig, type TtsConfig } from '../../apps/server/src/speech/config';
import { testWave } from '../e2e/global-setup';
import { completeWav } from '../../apps/server/src/speech/wav';
const asr:AsrConfig={baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',apiKey:'local-test-only',model:'qwen3-asr-flash',protocol:'dashscope-asr',auth:'bearer',formats:['audio/wav'],timeoutMs:1000};
const tts:TtsConfig={baseUrl:'https://dashscope.aliyuncs.com/api/v1',apiKey:'local-test-only',model:'cosyvoice-v3-flash',voice:'longanyang',protocol:'dashscope-cosyvoice',timeoutMs:1000};
it('Qwen sends an actual WAV Data URL with ASR options and no Gemini role prompt',async()=>{
  const bytes=testWave(1,true);const fetcher=vi.fn(async()=>Response.json({choices:[{message:{content:'左前车窗打开一半'}}]}));
  const result=await transcribe(asr,{bytes,mimeType:'audio/wav',durationMs:1000,requestId:'test-qwen'},undefined,fetcher as typeof fetch);
  const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];const body=JSON.parse(init.body as string);
  expect(url).toBe(asr.baseUrl+'/chat/completions');expect(body.messages).toHaveLength(1);expect(body.messages[0].content[0].input_audio.data).toBe('data:audio/wav;base64,'+bytes.toString('base64'));expect(body.asr_options).toEqual({language:'zh',enable_itn:true});expect(result.model).toBe('qwen3-asr-flash');
});
it('CosyVoice downloads only completed OSS audio and never sends its credential to the download host',async()=>{
  const fetcher=vi.fn(async(url:unknown)=>String(url).includes('/SpeechSynthesizer')?Response.json({output:{finish_reason:'stop',audio:{url:'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/pre/test.wav?signature=test'}}}):new Response(testWave(.3,true),{headers:{'Content-Type':'audio/wav'}}));
  const audio=await synthesize(tts,{text:'左前车窗已打开到一半。',requestId:'test-cosyvoice'},undefined,fetcher as typeof fetch);
  expect(audio.bytes.length).toBeGreaterThan(44);
  const first=(fetcher.mock.calls[0] as unknown as [string,RequestInit])[1];expect(JSON.parse(first.body as string)).toEqual({model:'cosyvoice-v3-flash',input:{text:'左前车窗已打开到一半。',voice:'longanyang',format:'wav',sample_rate:24000}});
  const [url,init]=fetcher.mock.calls[1] as unknown as [string,RequestInit];expect(url).toMatch(/^https:/);expect(init.headers).toBeUndefined();
});
it('rejects mismatched model/protocol, WebM for Qwen, invalid completion and unsafe download hosts',async()=>{
  const env={ASR_BASE_URL:asr.baseUrl,ASR_API_KEY:asr.apiKey,ASR_PROTOCOL:asr.protocol,ASR_MODEL:asr.model};
  expect(providerConfig(env).asr?.formats).toEqual(['audio/wav']);expect(providerConfig({...env,ASR_MODEL:'gemini-3.8-flash'}).asr).toBeNull();expect(providerConfig({...env,ASR_AUDIO_FORMATS:'audio/webm'}).asr).toBeNull();
  for(const url of ['https://localhost/private','http://127.0.0.1/','https://oss-cn-beijing.aliyuncs.com.evil.example/a.wav','https://user:secret@dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.wav'])expect(()=>aliyunAudioUrl(url)).toThrow();
  await expect(synthesize(tts,{text:'测试',requestId:'invalid'},undefined,(async()=>Response.json({output:{finish_reason:null,audio:{url:'https://example.com'}}})) as typeof fetch)).rejects.toMatchObject({code:'INVALID_TTS_AUDIO'});
});
it('repairs real-provider WAV size placeholders from actual bytes and derives duration',()=>{
  const bytes=testWave(2,true);bytes.writeUInt32LE(0x7fffffbf,4);bytes.writeUInt32LE(0x7fffff9b,40);
  const result=completeWav(bytes);expect(result.durationMs).toBe(2000);const data=Buffer.from(result.bytes);expect(data.readUInt32LE(4)).toBe(data.length-8);expect(data.readUInt32LE(40)).toBe(data.length-44);
});
