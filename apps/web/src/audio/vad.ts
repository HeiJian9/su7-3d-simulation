export interface VadState { started: number; hasSpeech: boolean; lastSpeech: number; voicedFrames: number; peak: number }
export type VadDecision = 'continue' | 'silence-end' | 'no-speech' | 'max-duration';
export const newVad = (started: number): VadState => ({ started, hasSpeech: false, lastSpeech: started, voicedFrames: 0, peak: 0 });
export function stepVad(state: VadState, rms: number, now: number, threshold = .012): VadDecision {
  state.peak = Math.max(state.peak, rms);
  if (rms >= threshold) {
    state.voicedFrames++; if (state.voicedFrames >= 3) state.hasSpeech = true;
    state.lastSpeech = now;
  } else state.voicedFrames = 0;
  if (now - state.started >= 15000) return state.hasSpeech ? 'max-duration' : 'no-speech';
  if (!state.hasSpeech && now - state.started >= 5000) return 'no-speech';
  if (state.hasSpeech && now - state.lastSpeech >= 1200) return 'silence-end';
  return 'continue';
}
export function encodeWav(chunks: Float32Array[], sourceRate: number, targetRate = 16000): Blob {
  const length = chunks.reduce((sum, c) => sum + c.length, 0);
  const samples = new Float32Array(length); let offset = 0;
  for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
  const count = Math.min(targetRate * 15, Math.floor(length * targetRate / sourceRate));
  const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
  const str = (at: number, text: string) => [...text].forEach((s, i) => view.setUint8(at + i, s.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, count * 2, true);
  const ratio = sourceRate / targetRate;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * ratio), end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let value = 0; for (let j = start; j < Math.min(end, samples.length); j++) value += samples[j];
    value = Math.max(-1, Math.min(1, value / (end - start)));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
