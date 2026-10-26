import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import type { SpeechHealth } from '../../../../packages/shared/src/speech.js';

export interface AsrConfig { baseUrl: string; apiKey: string; model: 'gemini-3.8-flash' | 'qwen3-asr-flash'; protocol: 'gemini-native' | 'openai-chat-audio' | 'dashscope-asr'; auth: 'x-goog-api-key' | 'bearer'; formats: string[]; timeoutMs: number }
export interface TtsConfig { baseUrl: string; apiKey: string; model: string; voice: string; protocol: 'openai-speech' | 'dashscope-cosyvoice'; timeoutMs: number }
export interface ProviderConfig { asr: AsrConfig | null; tts: TtsConfig | null; health: SpeechHealth }
const baseUrl = (value: string | undefined) => {
  try { const url = new URL(value ?? ''); return !url.username && !url.password && !url.search && !url.hash && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) ? url.toString().replace(/\/$/, '') : ''; } catch { return ''; }
};
export function loadProjectEnv(root: string) {
  const file = path.join(root, '.env');
  if (existsSync(file)) { try { loadEnvFile(file); } catch { throw new Error('本地 .env 无法读取，请检查格式与文件权限。'); } }
}
export function providerConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  const asrMissing: string[] = [], ttsMissing: string[] = [];
  const asrUrl = baseUrl(env.ASR_BASE_URL), ttsUrl = baseUrl(env.TTS_BASE_URL);
  if (!asrUrl) asrMissing.push('ASR_BASE_URL');
  if (!env.ASR_API_KEY?.trim()) asrMissing.push('ASR_API_KEY');
  const protocols = ['gemini-native','openai-chat-audio','dashscope-asr'];
  if (!protocols.includes(env.ASR_PROTOCOL ?? '')) asrMissing.push('ASR_PROTOCOL');
  if (env.ASR_MODEL !== (env.ASR_PROTOCOL === 'dashscope-asr' ? 'qwen3-asr-flash' : 'gemini-3.8-flash')) asrMissing.push('ASR_MODEL');
  const formats = (env.ASR_AUDIO_FORMATS?.trim() || (env.ASR_PROTOCOL === 'gemini-native' || !env.ASR_PROTOCOL ? 'audio/webm,audio/wav' : 'audio/wav')).split(',').map((s) => s.trim()).filter((s) => ['audio/wav','audio/webm'].includes(s));
  if (!formats.length) asrMissing.push('ASR_AUDIO_FORMATS');
  if (env.ASR_PROTOCOL === 'dashscope-asr' && formats.some((f)=>f!=='audio/wav')) asrMissing.push('ASR_AUDIO_FORMATS');
  if (!ttsUrl) ttsMissing.push('TTS_BASE_URL');
  if (!env.TTS_API_KEY?.trim()) ttsMissing.push('TTS_API_KEY');
  for (const field of ['TTS_MODEL','TTS_VOICE'] as const) if (!env[field]?.trim()) ttsMissing.push(field);
  if (!['openai-speech','dashscope-cosyvoice'].includes(env.TTS_PROTOCOL ?? '')) ttsMissing.push('TTS_PROTOCOL');
  if (env.TTS_PROTOCOL === 'dashscope-cosyvoice' && !['cosyvoice-v3.5-plus','cosyvoice-v3.5-flash','cosyvoice-v3-plus','cosyvoice-v3-flash','cosyvoice-v2'].includes(env.TTS_MODEL ?? '')) ttsMissing.push('TTS_MODEL');
  const asr = asrMissing.length ? null : { baseUrl: asrUrl, apiKey: env.ASR_API_KEY!, model: env.ASR_MODEL as AsrConfig['model'], protocol: env.ASR_PROTOCOL as AsrConfig['protocol'], auth: env.ASR_AUTH_HEADER === 'bearer' || env.ASR_PROTOCOL !== 'gemini-native' ? 'bearer' as const : 'x-goog-api-key' as const, formats, timeoutMs: 20000 };
  const tts = ttsMissing.length ? null : { baseUrl: ttsUrl, apiKey: env.TTS_API_KEY!, model: env.TTS_MODEL!, voice: env.TTS_VOICE!, protocol: env.TTS_PROTOCOL as TtsConfig['protocol'], timeoutMs: 10000 };
  return { asr, tts, health: {
    mode: asr && tts ? 'configured-unverified' : 'unconfigured',
    asr: { configured: !!asr, model: env.ASR_MODEL === 'qwen3-asr-flash' ? env.ASR_MODEL : 'gemini-3.8-flash', protocol: env.ASR_PROTOCOL && protocols.includes(env.ASR_PROTOCOL) ? env.ASR_PROTOCOL : 'unconfigured', audioFormats: formats.length ? formats : ['audio/wav'], missing: asrMissing, probe: 'not-verified' },
    tts: { configured: !!tts, model: env.TTS_MODEL && env.TTS_MODEL.length < 100 ? env.TTS_MODEL : '', voice: env.TTS_VOICE && env.TTS_VOICE.length < 100 ? env.TTS_VOICE : '', protocol: ['openai-speech','dashscope-cosyvoice'].includes(env.TTS_PROTOCOL ?? '') ? env.TTS_PROTOCOL! : 'unconfigured', missing: ttsMissing, probe: 'not-verified' },
  } };
}
