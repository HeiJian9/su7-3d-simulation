import { encodeWav, newVad, stepVad, type VadDecision } from './vad';

export class RecordingError extends Error { constructor(public code: string, message: string) { super(message); } }
export interface RecordedAudio { blob: Blob; mimeType: string; durationMs: number; reason: VadDecision | 'manual'; peakRms: number }
export interface RecorderCallbacks { meter: (rms: number, elapsedMs: number, speech: boolean) => void; done: (audio: RecordedAudio) => void; error: (error: RecordingError) => void }
export class VoiceRecorder {
  private stream?: MediaStream;
  private context?: AudioContext;
  private recorder?: MediaRecorder;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private worklet?: AudioWorkletNode;
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private stopping = false;
  private chunks: Blob[] = [];
  private pcm: Float32Array[] = [];
  private vad = newVad(0);
  private callbacks?: RecorderCallbacks;
  private mimeType = 'audio/webm';
  async start(formats: string[], callbacks: RecorderCallbacks) {
    this.cancel(); const generation = this.generation; this.callbacks = callbacks; this.stopping = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new RecordingError('MIC_UNAVAILABLE', '浏览器不支持麦克风，请使用本机 Chrome 或 Edge。');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (generation !== this.generation) { stream.getTracks().forEach((t) => t.stop()); return; }
      this.stream = stream; this.context = new AudioContext(); await this.context.resume();
      if (generation !== this.generation) return;
      this.source = this.context.createMediaStreamSource(stream); this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 1024; this.source.connect(this.analyser);
      this.chunks = []; this.pcm = [];
      const webm = formats.includes('audio/webm') && typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus');
      if (webm) {
        this.mimeType = 'audio/webm';
        this.recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        this.recorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data); };
        this.recorder.onerror = () => { if (generation === this.generation) { this.cancel(); callbacks.error(new RecordingError('RECORDING_FAILED', '录音器发生错误，请重试。')); } };
        this.recorder.start(200);
      } else {
        if (!formats.includes('audio/wav')) throw new RecordingError('AUDIO_FORMAT_UNSUPPORTED', '浏览器和服务端没有共同支持的录音格式。');
        this.mimeType = 'audio/wav'; await this.context.audioWorklet.addModule('/audio/pcm-capture.worklet.js');
        if (generation !== this.generation) return;
        this.worklet = new AudioWorkletNode(this.context, 'su7-pcm-capture');
        this.worklet.port.onmessage = (event: MessageEvent<Float32Array>) => { if (generation === this.generation && !this.stopping) this.pcm.push(event.data); };
        this.source.connect(this.worklet);
        const mute = this.context.createGain(); mute.gain.value = 0; this.worklet.connect(mute).connect(this.context.destination);
      }
      this.vad = newVad(performance.now());
      const values = new Float32Array(this.analyser.fftSize);
      this.timer = setInterval(() => {
        if (generation !== this.generation || this.stopping || !this.analyser) return;
        this.analyser.getFloatTimeDomainData(values);
        const rms = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
        const now = performance.now(), decision = stepVad(this.vad, rms, now);
        callbacks.meter(rms, now - this.vad.started, this.vad.hasSpeech);
        if (decision !== 'continue') void this.stop(decision);
      }, 40);
    } catch (error) {
      if (generation !== this.generation) return;
      this.cancel();
      const name = error instanceof Error ? error.name : '';
      callbacks.error(error instanceof RecordingError ? error : new RecordingError(name === 'NotAllowedError' ? 'MIC_PERMISSION_DENIED' : name === 'NotFoundError' ? 'MIC_NOT_FOUND' : name === 'NotReadableError' ? 'MIC_BUSY' : 'RECORDING_FAILED', name === 'NotAllowedError' ? '麦克风权限被拒绝。允许本机页面使用麦克风后可重试。' : name === 'NotFoundError' ? '没有找到可用的麦克风。手动和文字控制可继续使用。' : name === 'NotReadableError' ? '麦克风正在被其他程序占用或无法读取。' : '录音初始化失败，请重试。'));
    }
  }
  async stop(reason: VadDecision | 'manual' = 'manual') {
    if (this.stopping || !this.stream) return;
    this.stopping = true; clearInterval(this.timer);
    const generation = this.generation, callbacks = this.callbacks;
    const durationMs = Math.min(15000, Math.max(1, Math.round(performance.now() - this.vad.started)));
    let blob: Blob;
    try {
      if (this.recorder?.state === 'recording') {
        const recorder = this.recorder;
        await new Promise<void>((resolve) => { recorder.onstop = () => resolve(); recorder.stop(); });
        blob = new Blob(this.chunks, { type: this.mimeType });
      } else blob = encodeWav(this.pcm, this.context?.sampleRate ?? 48000);
      const valid = this.vad.hasSpeech && this.vad.peak >= .012 && durationMs >= 250 && blob.size >= 60;
      const peakRms = this.vad.peak;
      await this.release();
      if (generation !== this.generation) return;
      if (!valid || reason === 'no-speech') callbacks?.error(new RecordingError('EMPTY_AUDIO', '没有检测到有效语音，未提交转写。请点击后说一句话。'));
      else callbacks?.done({ blob, mimeType: this.mimeType, durationMs, reason, peakRms });
    } catch {
      await this.release(); if (generation === this.generation) callbacks?.error(new RecordingError('RECORDING_FAILED', '录音结束失败，请重新录音。'));
    }
  }
  cancel() {
    this.generation++; this.stopping = true; clearInterval(this.timer);
    if (this.recorder?.state === 'recording') { this.recorder.ondataavailable = null; this.recorder.onstop = null; this.recorder.stop(); }
    void this.release();
  }
  private async release() {
    clearInterval(this.timer); this.source?.disconnect(); this.worklet?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = undefined;
    const context = this.context; this.context = undefined;
    this.recorder = undefined; this.source = undefined; this.worklet = undefined; this.analyser = undefined;
    if (context && context.state !== 'closed') await context.close();
  }
}
