import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),sherpa=require('sherpa-onnx');
const file=name=>path.join(workerData.root,'assets/wake',name);
const kws=sherpa.createKws({featConfig:{samplingRate:16000,featureDim:80},modelConfig:{transducer:{encoder:file('encoder.onnx'),decoder:file('decoder.onnx'),joiner:file('joiner.onnx')},tokens:file('tokens.txt'),numThreads:1,provider:'cpu',debug:0,modelType:'',modelingUnit:'cjkchar',bpeVocab:''},maxActivePaths:4,numTrailingBlanks:1,keywordsScore:1.5,keywordsThreshold:.55,keywords:'x iǎo ài t óng x ué :1.5 #0.55 @小爱同学\n'});
if(!kws.handle)throw Error('KWS initialization failed');let stream=kws.createStream(),audioSamples=0,decodeMs=0;
parentPort.postMessage({type:'ready'});
parentPort.on('message',data=>{
 try{
  if(data.type==='reset'){stream.free();stream=kws.createStream();return;}
  const samples=new Float32Array(data.samples),started=performance.now();audioSamples+=samples.length;stream.acceptWaveform(16000,samples);
  while(kws.isReady(stream)){kws.decode(stream);const result=kws.getResult(stream);if(result.keyword==='小爱同学'){kws.reset(stream);parentPort.postMessage({type:'keyword',keyword:result.keyword,atSample:audioSamples});break;}}
  decodeMs+=performance.now()-started;parentPort.postMessage({type:'metrics',audioSeconds:audioSamples/16000,decodeMs,rssBytes:process.memoryUsage().rss});
 }catch{parentPort.postMessage({type:'error',message:'本地关键词引擎识别失败，请关闭后重试。'});}
});
