import { z } from 'zod';

export const MODEL_ID = 'ca2cda599f5341068c992c9f44551bf9';
export const MODEL_URL = `https://sketchfab.com/3d-models/xiaomi-su7-${MODEL_ID}`;
export const assetSchema = z.object({
  modelId: z.literal(MODEL_ID),
  status: z.enum(['missing', 'ready']),
  title: z.literal('Xiaomi SU7'),
  author: z.literal('Mona x Supercars'),
  sourceUrl: z.literal(MODEL_URL),
  license: z.literal('CC BY 4.0'),
  licenseUrl: z.literal('https://creativecommons.org/licenses/by/4.0/'),
  runtimeUrl: z.string().startsWith('/models/').endsWith('.glb').nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  bytes: z.number().int().nonnegative(),
  // Root normalization is recorded, never guessed silently in the viewer.
  rotationY: z.number(),
  scale: z.number().positive(),
  message: z.string(),
}).superRefine((asset, context) => {
  if (asset.status === 'ready' && (!asset.runtimeUrl || !asset.sha256 || asset.bytes === 0)) {
    context.addIssue({ code: 'custom', message: 'Ready assets require a runtime URL, SHA-256 and nonzero length.' });
  }
});
export type AssetManifest = z.infer<typeof assetSchema>;
