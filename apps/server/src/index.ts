import express, { type ErrorRequestHandler } from 'express';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetSchema } from '../../../packages/shared/src/asset.js';
import { z } from 'zod';
import { loadProjectEnv, providerConfig } from './speech/config.js';
import { speechRoutes } from './speech/routes.js';

// The same entry works from src and the preserved tsc output hierarchy.
let root = path.dirname(fileURLToPath(import.meta.url));
while (!existsSync(path.join(root, 'package-lock.json'))) {
  const parent = path.dirname(root);
  if (parent === root) throw new Error('Cannot locate project root');
  root = parent;
}
const app = express();
loadProjectEnv(root);
const providers = providerConfig();
app.disable('x-powered-by');
app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ status: 'ok', increment: 'I2–I3-framework', version: '0.3.0', providers: {
    ...providers.health,
    intent: { configured: false, probe: 'pending-I7' },
  } });
});
app.use('/api/speech', express.json({ limit: '16kb' }), speechRoutes(providers));
app.get('/api/asset', async (_req, res) => {
  try {
    const manifest = assetSchema.parse(JSON.parse(await readFile(path.join(root, 'apps/web/public/models/asset-manifest.json'), 'utf8')));
    if (manifest.status === 'ready' && (!manifest.runtimeUrl || !existsSync(path.join(root, 'apps/web/public', manifest.runtimeUrl)))) {
      res.status(503).json({ code: 'ASSET_MISSING', message: '资产清单对应的 GLB 不存在，请重新导入。', retryable: true });
      return;
    }
    res.set('Cache-Control', 'no-store').json(manifest);
  } catch {
    res.status(503).json({ code: 'ASSET_MANIFEST_INVALID', message: '模型资产清单无法读取，请检查后重试。', retryable: true });
  }
});
const diagnosticSchema = z.object({
  exportedAt: z.string().max(50), increment: z.enum(['I0–I1', 'I2–I3-framework']), userAgent: z.string().max(500),
  asset: assetSchema.nullable(), loadMs: z.number().nonnegative().nullable(), mode: z.enum(['free', 'orbit']), gesture: z.string().max(200),
  microphone: z.object({ status: z.string().max(40), peakRms: z.number().nonnegative().max(1), samples: z.number().int().nonnegative(), durationMs: z.number().nonnegative(), message: z.string().max(500) }),
  samples: z.array(z.object({ fps: z.number().nonnegative(), calls: z.number().int().nonnegative(), triangles: z.number().nonnegative(), position: z.array(z.number()).length(3), rotation: z.array(z.number()).length(3), renderer: z.string().max(500), elapsed: z.number().nonnegative(), focused: z.boolean(), viewport: z.array(z.number()).length(2) })).max(360),
});
app.post('/api/diagnostics', express.json({ limit: '512kb' }), async (req, res) => {
  const parsed = diagnosticSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ code: 'INVALID_DIAGNOSTIC', message: '场景诊断格式错误。' }); return; }
  try {
    const folder = path.join(root, 'docs/validation');
    await mkdir(folder, { recursive: true });
    const filename = `scene-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await writeFile(path.join(folder, filename), JSON.stringify(parsed.data, null, 2) + '\n');
    res.json({ saved: `docs/validation/${filename}` });
  } catch {
    res.status(500).json({ code: 'DIAGNOSTIC_WRITE_FAILED', message: '本地报告写入失败，请检查目录权限。' });
  }
});
app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_IMPLEMENTED', message: '此接口不属于当前四窗与语音框架。', retryable: false }));
const webDist = path.join(root, 'apps/web/dist');
if (existsSync(webDist)) {
  // Original packages and Blender sources are never served.
  app.use(express.static(webDist, { setHeaders: (res, filename) => {
    if (filename.endsWith('.html') || filename.endsWith('asset-manifest.json')) res.setHeader('Cache-Control', 'no-store');
  } }));
  app.get('/{*splat}', (req, res) => {
    if (path.extname(req.path)) res.status(404).send('Resource not found');
    else res.sendFile(path.join(webDist, 'index.html'));
  });
}
const port = process.argv.includes('--dev') ? 3001 : Number(process.env.PORT ?? 3000);
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (!res.headersSent) res.status(error?.status === 413 ? 413 : 400).json({ code: 'INVALID_REQUEST', message: '请求内容或大小不符合接口要求。', retryable: false });
};
app.use(errorHandler);
const server = app.listen(port, '127.0.0.1', () => console.log(`SU7 I2–I3 framework: http://localhost:${port}`));
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
