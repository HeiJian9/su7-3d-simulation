import { Router, type Response } from 'express';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { speechRequestId, synthesizeSchema } from '../../../../packages/shared/src/speech.js';
import { SpeechServiceError, synthesize, transcribe } from './providers.js';
import type { ProviderConfig } from './config.js';
import {audioTiming} from '../../../../packages/shared/src/audio-settings.js';

export function speechRoutes(config: ProviderConfig) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 4, fieldSize: 1024 } });
  const recordings = new Map<string, { signature: string; result: ReturnType<typeof transcribe>; created: number }>();
  const speech = new Map<string, { signature: string; result: ReturnType<typeof synthesize>; created: number }>();
  const controller = (res: Response) => { const abort = new AbortController(); res.on('close', () => { if (!res.writableEnded) abort.abort(); }); return abort; };
  const failure = (res: Response, error: unknown, requestId?: string) => {
    const known = error instanceof SpeechServiceError ? error : error instanceof multer.MulterError ? new SpeechServiceError('AUDIO_LIMIT', '录音文件过大或上传字段不正确。', 413) : new SpeechServiceError('SPEECH_FAILED', '语音请求失败，请重试。', 500, true);
    if (!res.headersSent && !res.destroyed) res.status(known.status).json({ code: known.code, message: known.message, retryable: known.retryable, requestId });
  };
  const prune = (cache: Map<string, { created: number }>) => { for (const [id, value] of cache) if (Date.now() - value.created > 120000) cache.delete(id); while (cache.size > 128) cache.delete(cache.keys().next().value!); };
  router.post('/transcribe', (req, res) => {
    upload.single('audio')(req, res, async (error) => {
      let id: string | undefined;
      try {
        if (error) throw error;
        const metadata = z.object({ requestId: speechRequestId, durationMs: z.coerce.number().positive().max(audioTiming.maxRecordingMs) }).safeParse(req.body);
        if (!metadata.success) throw new SpeechServiceError('INVALID_AUDIO_REQUEST', '录音请求编号或时长无效。', 400);
        id = metadata.data.requestId;
        const durationMs = metadata.data.durationMs;
        if (!req.file) throw new SpeechServiceError('EMPTY_AUDIO', '没有收到录音文件。', 400);
        prune(recordings);
        const signature = createHash('sha256').update(req.file.buffer).update(req.file.mimetype).update(String(durationMs)).digest('hex');
        const cached = recordings.get(id);
        if (cached && cached.signature !== signature) throw new SpeechServiceError('REQUEST_ID_CONFLICT', '同一请求编号携带了不同音频。', 409);
        const result = cached?.result ?? transcribe(config.asr, { bytes: req.file.buffer, mimeType: req.file.mimetype, durationMs, requestId: id }, controller(res).signal);
        if (!cached) recordings.set(id, { signature, result, created: Date.now() });
        res.set('Cache-Control', 'no-store').json(await result);
      } catch (err) { failure(res, err, id); }
    });
  });
  router.post('/synthesize', async (req, res) => {
    let id: string | undefined;
    try {
      const input = synthesizeSchema.safeParse(req.body);
      if (!input.success) throw new SpeechServiceError('INVALID_SPEECH_REQUEST', '播报内容或请求编号无效。', 400);
      id = input.data.requestId; prune(speech);
      const signature = createHash('sha256').update(input.data.text).digest('hex');
      const cached = speech.get(id);
      if (cached && cached.signature !== signature) throw new SpeechServiceError('REQUEST_ID_CONFLICT', '同一请求编号携带了不同播报内容。', 409);
      const promise = cached?.result ?? synthesize(config.tts, input.data, controller(res).signal);
      if (!cached) speech.set(id, { signature, result: promise, created: Date.now() });
      const audio = await promise;
      res.set({ 'Content-Type': audio.contentType, 'Cache-Control': 'no-store', 'X-Speech-Provider': audio.provider, 'X-Speech-Model': audio.model, 'X-Request-Id': id }).send(Buffer.from(audio.bytes));
    } catch (error) { failure(res, error, id); }
  });
  return router;
}
