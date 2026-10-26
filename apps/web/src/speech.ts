import { create } from 'zustand';
import { transcriptSchema, type SpeechHealth } from '../../../packages/shared/src/speech';
import { VoiceRecorder, type RecordedAudio } from './audio/recorder';
import { ApiAudioPlayer } from './audio/player';
import { useVehicle, waitForWindowExecution } from './vehicle';

export type SpeechPhase = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'resolving' | 'executing' | 'clarifying' | 'synthesizing' | 'speaking' | 'error';
interface SpeechState {
  phase: SpeechPhase;
  message: string;
  transcript: string;
  rms: number;
  durationMs: number;
  hasSpeech: boolean;
  errorCode: string;
  lastFeedback: string;
  enabled: boolean;
  health: SpeechHealth;
  traces: Array<{ requestId: string; time: string; stage: string; detail: string; mock: boolean }>;
}
const initialHealth: SpeechHealth = {
  mode: 'unconfigured',
  asr: { configured: false, model: 'gemini-3.8-flash', protocol: 'unconfigured', audioFormats: ['audio/webm','audio/wav'], missing: [], probe: 'not-verified' },
  tts: { configured: false, model: '', voice: '', protocol: 'unconfigured', missing: [], probe: 'not-verified' },
};
export const useSpeech = create<SpeechState>(() => ({ phase: 'idle', message: '点击开始，说完自动结束。', transcript: '', rms: 0, durationMs: 0, hasSpeech: false, errorCode: '', lastFeedback: '', enabled: true, health: initialHealth, traces: [] }));
export function configureSpeech(health: SpeechHealth) { useSpeech.setState({ health }); }
class SpeechFailure extends Error { constructor(public code: string, message: string) { super(message); } }
async function responseError(response: Response): Promise<never> {
  let error: { code?: string; message?: string } = {};
  try { error = await response.json(); } catch { /* Keep errors local and free of response bodies. */ }
  throw new SpeechFailure(error.code ?? 'SERVICE_ERROR', error.message ?? `语音服务暂不可用（HTTP ${response.status}）。`);
}
export interface RecorderPort { start(formats: string[], callbacks: Parameters<VoiceRecorder['start']>[1]): Promise<void>; stop(): Promise<void>; cancel(): void }
export interface PlayerPort { play(blob: Blob): Promise<'ended' | 'stopped'>; stop(): void }
export class SpeechCoordinator {
  private generation = 0;
  private request?: AbortController;
  private currentId = '';
  private transcribingGeneration = -1;
  private base = { revision: 0, epoch: 0 };
  private unsubscribe: () => void;
  constructor(private recorder: RecorderPort = new VoiceRecorder(), private player: PlayerPort = new ApiAudioPlayer(), private fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.unsubscribe = useVehicle.subscribe((state, previous) => { if (state.epoch !== previous.epoch && useSpeech.getState().phase !== 'idle') this.cancel('已优先处理新的手动或文字操作。'); });
  }
  destroy() { this.cancel(); this.unsubscribe(); }
  private trace(stage: string, detail: string) {
    useSpeech.setState((s) => ({ traces: [...s.traces.slice(-79), { requestId: this.currentId, time: new Date().toISOString(), stage, detail, mock: s.health.mode === 'test-mock' }] }));
  }
  private valid(generation: number) { return generation === this.generation; }
  cancel(message = '此次语音已取消；已接受的车窗动作不回滚。') {
    this.generation++; this.request?.abort(); this.request = undefined; this.recorder.cancel(); this.player.stop();
    useSpeech.setState({ phase: 'idle', message, rms: 0, errorCode: '', hasSpeech: false });
  }
  async start() {
    this.cancel('准备录音。');
    const generation = this.generation;
    this.currentId = crypto.randomUUID(); this.base = { revision: useVehicle.getState().state.revision, epoch: useVehicle.getState().epoch };
    useSpeech.setState({ phase: 'requesting', message: '等待麦克风权限…', transcript: '', durationMs: 0, errorCode: '' });
    this.trace('recording-request', '用户点击开始；已停止旧播报');
    await this.recorder.start(useSpeech.getState().health.asr.audioFormats, {
      meter: (rms, durationMs, hasSpeech) => { if (this.valid(generation)) useSpeech.setState({ phase: 'recording', message: hasSpeech ? '正在聆听，停顿后自动结束。' : '请说一句车窗指令。', rms, durationMs, hasSpeech }); },
      done: (audio) => { if (this.valid(generation)) void this.transcribe(audio, generation); },
      error: (error) => { if (this.valid(generation)) this.fail(error.code, error.message); },
    });
  }
  async stopRecording() { await this.recorder.stop(); }
  private fail(code: string, message: string) { useSpeech.setState({ phase: 'error', errorCode: code, message, rms: 0 }); this.trace('error', code); }
  private async transcribe(audio: RecordedAudio, generation: number) {
    if (!this.valid(generation) || this.transcribingGeneration === generation) return;
    this.transcribingGeneration = generation;
    const requestId = this.currentId;
    this.request = new AbortController();
    useSpeech.setState({ phase: 'transcribing', message: '麦克风已释放，正在转写…', rms: 0, durationMs: audio.durationMs });
    this.trace('transcribing', `${audio.mimeType}; ${audio.durationMs} ms; ${audio.reason}`);
    try {
      const form = new FormData(); form.append('audio', audio.blob, audio.mimeType === 'audio/wav' ? 'command.wav' : 'command.webm'); form.append('requestId', requestId); form.append('durationMs', String(audio.durationMs));
      const response = await this.fetcher('/api/speech/transcribe', { method: 'POST', body: form, signal: AbortSignal.any([this.request.signal, AbortSignal.timeout(23000)]) });
      if (!response.ok) await responseError(response);
      const transcript = transcriptSchema.parse(await response.json());
      if (!this.valid(generation)) return;
      if (transcript.requestId !== requestId) throw new SpeechFailure('REQUEST_ID_MISMATCH', '转写响应编号不匹配，已丢弃。');
      if (transcript.model !== useSpeech.getState().health.asr.model) throw new SpeechFailure('MODEL_MISMATCH', '转写响应模型与当前配置不一致，已丢弃。');
      useSpeech.setState({ phase: 'resolving', transcript: transcript.text, message: '转写完成，正在解析四窗规则…' });
      this.trace('rules', `${transcript.model}; ${transcript.durationMs} ms`);
      const result = useVehicle.getState().text(transcript.text, 'voice', { ...this.base, requestId });
      if (result.kind === 'stale') { this.fail('STALE_RESPONSE', result.message); return; }
      await this.feedback(result, generation);
    } catch (error) {
      if (!this.valid(generation)) return;
      this.fail(error instanceof SpeechFailure ? error.code : error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'TRANSCRIBE_FAILED', error instanceof SpeechFailure ? error.message : error instanceof Error && error.name === 'TimeoutError' ? '转写超时，请重试。' : '语音转写失败，请检查接口配置或重试。');
    }
  }
  async text(input: string) {
    this.cancel('正在处理文字指令。');
    const result = useVehicle.getState().text(input);
    const generation = this.generation;
    this.currentId = result.execution?.requestId ?? crypto.randomUUID();
    await this.feedback(result, generation);
  }
  private async feedback(result: ReturnType<ReturnType<typeof useVehicle.getState>['text']>, generation: number) {
    let message = result.message;
    if (result.execution) {
      useSpeech.setState({ phase: 'executing', message: '正在调整车窗…' });
      const execution = await waitForWindowExecution(result.execution);
      if (!this.valid(generation)) return;
      if (execution.status !== 'completed') { this.fail(execution.status.toUpperCase(), execution.message); return; }
      message = execution.message; this.trace('completed', `${execution.requestId}; revision ${execution.revision}`);
    }
    if (!this.valid(generation)) return;
    useSpeech.setState({ phase: result.kind === 'clarify' ? 'clarifying' : 'idle', message, lastFeedback: message });
    if (useSpeech.getState().enabled && useSpeech.getState().health.tts.configured) await this.speak(message, generation, result.kind === 'clarify');
  }
  async replay() { this.cancel('准备重播。'); const message = useSpeech.getState().lastFeedback || useVehicle.getState().feedback; this.currentId = crypto.randomUUID(); await this.speak(message, this.generation, !!useVehicle.getState().context.pending); }
  stopSpeaking() { this.cancel('播报已停止，车窗状态保持。'); }
  private async speak(text: string, generation: number, clarify: boolean) {
    this.player.stop(); this.request?.abort(); this.request = new AbortController();
    useSpeech.setState({ phase: 'synthesizing', message: '动作与文字已确认，正在生成语音…', lastFeedback: text });
    this.trace('tts-request', 'API TTS feedback');
    try {
      const response = await this.fetcher('/api/speech/synthesize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: `${this.currentId}-tts`, text }), signal: AbortSignal.any([this.request.signal, AbortSignal.timeout(13000)]) });
      if (!response.ok) await responseError(response);
      const blob = await response.blob();
      if (!this.valid(generation)) return;
      if (!blob.size || !blob.type.startsWith('audio/')) throw new SpeechFailure('INVALID_TTS_AUDIO', '播报接口没有返回有效音频。');
      useSpeech.setState({ phase: 'speaking', message: text });
      const ended = await this.player.play(blob);
      if (this.valid(generation) && ended === 'ended') { useSpeech.setState({ phase: clarify ? 'clarifying' : 'idle', message: text }); this.trace('tts-ended', 'API audio playback ended'); }
    } catch (error) {
      if (!this.valid(generation)) return;
      this.fail(error instanceof SpeechFailure ? error.code : 'TTS_FAILED', `${error instanceof SpeechFailure ? error.message : 'API 播报失败，可单独重播。'} 已完成的车窗动作与文字保留。`);
    }
  }
}
let active: SpeechCoordinator | undefined;
export function speechCoordinator() { return active ??= new SpeechCoordinator(); }
