export interface PlaybackStop { wasPlaying: boolean; positionMs: number }
export class ApiAudioPlayer {
  private audio?: HTMLAudioElement;
  private url?: string;
  private settle?: (value: 'ended' | 'stopped') => void;
  async play(blob: Blob): Promise<'ended' | 'stopped'> {
    this.stop();
    const url = URL.createObjectURL(blob), audio = new Audio(url);
    this.url = url; this.audio = audio;
    return new Promise((resolve, reject) => {
      const cleanup = () => { URL.revokeObjectURL(url); if (this.audio === audio) { this.audio = undefined; this.url = undefined; this.settle = undefined; } };
      this.settle = (value) => { cleanup(); resolve(value); };
      audio.onended = () => { cleanup(); resolve('ended'); };
      audio.onerror = () => { cleanup(); reject(new Error('API 音频无法解码或播放，请点击重播。')); };
      void audio.play().catch(() => { cleanup(); reject(new Error('浏览器未能播放 API 音频，请点击重播。')); });
    });
  }
  stop(): PlaybackStop {
    const result = { wasPlaying: !!this.audio && !this.audio.paused && !this.audio.ended, positionMs: Math.round((this.audio?.currentTime ?? 0) * 1000) };
    this.audio?.pause();
    if (this.audio) { this.audio.onended = null; this.audio.onerror = null; this.audio.removeAttribute('src'); this.audio.load(); }
    if (this.url) URL.revokeObjectURL(this.url);
    this.settle?.('stopped'); this.audio = undefined; this.url = undefined; this.settle = undefined;
    return result;
  }
}
