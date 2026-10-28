import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=[];for(const name of ['encoder.onnx','decoder.onnx','joiner.onnx','tokens.txt']){const bytes=await readFile(`assets/wake/${name}`);files.push({file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile('assets/wake/manifest.json',JSON.stringify({engine:'sherpa-onnx',version:'2.0.1',runtime:'local Node worker thread / WASM',model:'wenetspeech-3.3M-2024-01-01-int8',keyword:'小爱同学',files},null,2)+'\n');console.log('Verified local keyword model: '+files.reduce((s,f)=>s+f.bytes,0)+' bytes');
