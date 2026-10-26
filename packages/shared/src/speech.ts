import { z } from 'zod';
export const speechRequestId = z.string().min(1).max(128);
export const transcriptSchema = z.object({ requestId: speechRequestId, text: z.string().min(1).max(2000), provider: z.string(), model: z.literal('gemini-3.8-flash'), durationMs: z.number().nonnegative(), mock: z.boolean().optional() });
export const synthesizeSchema = z.object({ requestId: speechRequestId, text: z.string().trim().min(1).max(500) }).strict();
export const speechErrorSchema = z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), requestId: z.string().optional() });
export interface SpeechHealth {
  asr: { configured: boolean; model: string; protocol: string; audioFormats: string[]; missing: string[]; probe: string };
  tts: { configured: boolean; model: string; voice: string; protocol: string; missing: string[]; probe: string };
  mode: 'unconfigured' | 'configured-unverified' | 'test-mock';
}
