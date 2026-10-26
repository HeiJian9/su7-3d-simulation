/** CosyVoice can return streaming-size placeholders in a complete PCM WAV. */
export function completeWav(input: Uint8Array) {
  const bytes = Buffer.from(input);
  if(bytes.length < 44 || bytes.toString('ascii',0,4)!=='RIFF' || bytes.toString('ascii',8,12)!=='WAVE')throw Error('Invalid WAV');
  let byteRate=0,dataSize=0;
  for(let offset=12;offset+8<=bytes.length;){
    const id=bytes.toString('ascii',offset,offset+4),declared=bytes.readUInt32LE(offset+4),available=bytes.length-offset-8;
    if(id==='fmt '&&declared>=16&&available>=16)byteRate=bytes.readUInt32LE(offset+16);
    if(id==='data') {dataSize=Math.min(declared,available);bytes.writeUInt32LE(dataSize,offset+4);break;}
    if(declared>available)throw Error('Invalid WAV chunk');offset+=8+declared+(declared%2);
  }
  if(!byteRate||!dataSize)throw Error('Empty WAV');
  bytes.writeUInt32LE(bytes.length-8,4);
  return {bytes:new Uint8Array(bytes),durationMs:Math.round(dataSize/byteRate*1000)};
}
