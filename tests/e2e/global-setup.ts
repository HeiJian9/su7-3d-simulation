import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function testWave(seconds = 3.7, alwaysTone = false): Buffer {
  const rate=16000,count=Math.round(rate*seconds),buffer=Buffer.alloc(44+count*2);
  buffer.write('RIFF',0);buffer.writeUInt32LE(36+count*2,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++){const time=i/rate;const tone=alwaysTone || (time>.3&&time<1.5);buffer.writeInt16LE(tone?Math.round(Math.sin(i/rate*2*Math.PI*440)*8000):0,44+i*2);}
  return buffer;
}
export default async function setup(){const folder=path.resolve('.tools/test-fixtures');await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'mock-microphone.wav'),testWave());}
