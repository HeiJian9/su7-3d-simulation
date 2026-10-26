import { describe, expect, it } from 'vitest';
import { isCameraDrag, movement } from '../../apps/web/src/cameraMath';
import { assetSchema } from '../../packages/shared/src/asset';
import { readFileSync } from 'node:fs';

describe('camera interaction boundaries', () => {
  it('suppresses selection even when a drag returns to its starting point', () => {
    expect(isCameraDrag([100, 100], [100, 100], 60)).toBe(true);
    expect(isCameraDrag([100, 100], [103, 104])).toBe(false);
    expect(isCameraDrag([100, 100], [106, 100])).toBe(true);
  });
  it('normalizes diagonals and caps time jumps after tab suspension', () => {
    const forward = movement(new Set(['KeyW']), 0, 0, 0.04, 2);
    const diagonal = movement(new Set(['KeyW', 'KeyD']), 0, 0, 0.04, 2);
    expect(forward.length()).toBeCloseTo(diagonal.length());
    expect(movement(new Set(['KeyW']), 0, 0, 5, 2).length()).toBeCloseTo(0.1);
  });
  it('moves in the look direction and supports vertical movement', () => {
    expect(movement(new Set(['KeyW']), Math.PI / 2, 0, 0.05, 1).x).toBeLessThan(0);
    expect(movement(new Set(['KeyE']), 0, 0, 0.05, 1).y).toBeCloseTo(0.05);
    expect(movement(new Set(['KeyQ']), 0, 0, 0.05, 1).y).toBeCloseTo(-0.05);
  });
});
describe('actual asset contract', () => {
  it('requires the selected model id and valid runtime hash', () => {
    const manifest: unknown = JSON.parse(readFileSync('apps/web/public/models/asset-manifest.json', 'utf8'));
    expect(assetSchema.safeParse(manifest).success).toBe(true);
    expect(assetSchema.safeParse({ ...(manifest as object), modelId: 'another-car' }).success).toBe(false);
  });
});
