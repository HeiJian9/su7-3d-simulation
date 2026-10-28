/** Explicit live TTS sample, using local server-only credentials. */
import {mkdir,writeFile} from 'node:fs/promises';
import {loadProjectEnv,providerConfig} from '../apps/server/src/speech/config';
import {synthesize} from '../apps/server/src/speech/providers';
import {completeWav} from '../apps/server/src/speech/wav';
loadProjectEnv(process.cwd());const c=providerConfig();
const text='氛围灯换成蓝色啦，亮度调到四成。左前窗也开到一半了，留一点微风刚刚好。';
const audio=await synthesize(c.tts,{requestId:crypto.randomUUID(),text});
await mkdir('docs/assets/trim-dialogue',{recursive:true});await mkdir('docs/validation/trim-dialogue',{recursive:true});
await writeFile('docs/assets/trim-dialogue/longanhuan-sample.wav',audio.bytes);
const report={at:new Date().toISOString(),human:false,mode:'real-CosyVoice-API',voice:c.health.tts.voice,model:c.health.tts.model,text,bytes:audio.bytes.length,durationMs:completeWav(audio.bytes).durationMs,passed:true};
await writeFile('docs/validation/trim-dialogue/voice-sample.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
