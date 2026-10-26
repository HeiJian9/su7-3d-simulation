/** Explicit, opt-in live API probe. Never prints credentials, upstream bodies or signed URLs. */
import { mkdir, writeFile } from 'node:fs/promises';
import { loadProjectEnv, providerConfig } from '../apps/server/src/speech/config';
import { SpeechServiceError, synthesize, transcribe } from '../apps/server/src/speech/providers';
import { parseWindowText } from '../packages/shared/src/windows';
import { completeWav } from '../apps/server/src/speech/wav';

loadProjectEnv(process.cwd());
const config=providerConfig();
const report:Record<string,unknown>={at:new Date().toISOString(),mode:'real-api-synthesized-speech',humanMicrophone:false,asrModel:config.health.asr.model,ttsModel:config.health.tts.model,voice:config.health.tts.voice,tts:{passed:false},asr:{passed:false},rules:{passed:false}};
try {
  if(!config.asr||!config.tts)throw new SpeechServiceError('NOT_CONFIGURED','请先补齐 .env 中的 ASR/TTS 配置。');
  const id=`probe-${crypto.randomUUID()}`,start=performance.now();
  const audio=await synthesize(config.tts,{text:'左前车窗打开一半。',requestId:id+'-tts'});
  const durationMs=completeWav(audio.bytes).durationMs;
  report.tts={passed:true,elapsedMs:Math.round(performance.now()-start),mime:audio.contentType,bytes:audio.bytes.length,durationMs};
  await mkdir('.tools/provider-probe',{recursive:true});await writeFile('.tools/provider-probe/tts.wav',audio.bytes);
  const transcript=await transcribe(config.asr,{bytes:audio.bytes,mimeType:'audio/wav',durationMs,requestId:id});
  report.asr={passed:true,text:transcript.text,elapsedMs:transcript.durationMs,provider:transcript.provider,model:transcript.model};
  const parsed=parseWindowText(transcript.text,{});
  report.rules={passed:parsed.kind==='execute'&&parsed.commands.some(c=>c.targets.includes('fl')&&c.operation==='set'&&c.value===.5),kind:parsed.kind};
} catch(error) {
  report.error=error instanceof SpeechServiceError?{code:error.code,message:error.message,retryable:error.retryable}:{code:'PROBE_FAILED',message:'真实语音探针未完成，请检查协议和模型配置。'};process.exitCode=1;
}
await mkdir('docs/validation/aliyun',{recursive:true});
await writeFile('docs/validation/aliyun/live-api-probe.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
