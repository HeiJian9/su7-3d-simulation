import {readFile,writeFile} from 'node:fs/promises';
import {loadProjectEnv,providerConfig} from '../apps/server/src/speech/config.ts';
import {transcribe} from '../apps/server/src/speech/providers.ts';
loadProjectEnv(process.cwd());const config=providerConfig(),source=await readFile('.tools/i7-i9-audio/wake-cycle-1.wav'),rate=source.readUInt32LE(28),durationMs=20000;
const lead=rate*12,tail=Math.max(0,rate*20-lead-(source.length-44)),wave=Buffer.concat([source.subarray(0,44),Buffer.alloc(lead),source.subarray(44),Buffer.alloc(tail)]);wave.writeUInt32LE(wave.length-8,4);wave.writeUInt32LE(wave.length-44,40);
const result=await transcribe(config.asr,{bytes:wave,mimeType:'audio/wav',durationMs,requestId:crypto.randomUUID()});
const report={at:new Date().toISOString(),mode:'real-ASR-API+padded-fixed-synthetic-input',human:false,durationMs,initialSilenceMs:12000,model:result.model,transcript:result.text,passed:/左前|35/.test(result.text)};await writeFile('docs/validation/i7-i9/long-recording-api.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
