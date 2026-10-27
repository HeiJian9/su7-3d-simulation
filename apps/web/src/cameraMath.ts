import { Euler, Vector3 } from 'three';

export const presets = {
  overview: { position: [5.4, 2.65, -6.1], target: [0, 0.75, 0] },
  front: { position: [0, 1.7, -7.8], target: [0, 0.8, 0] },
  rear: { position: [0, 1.7, 7.8], target: [0, 0.8, 0] },
  left: { position: [-7.8, 1.7, 0], target: [0, 0.8, 0] },
  right: { position: [7.8, 1.7, 0], target: [0, 0.8, 0] },
  cabin: { position: [-0.4, 1.15, -0.05], target: [-0.3, 0.93, -1.6] },
  ambient: { position: [-.08, 1.05, -.35], target: [.78,.85,-.14] },
  roofFront: {position:[.22,1.04,.08],target:[0,1.29,-.27]},
  roofRear: {position:[.22,1.08,.35],target:[0,1.40,.8]},
  lighting: { position: [7, 5.5, -12], target: [0, .3, -4.5] },
} as const;

export function isCameraDrag(start: [number, number], end: [number, number], maxDistance = 0) {
  return Math.max(Math.hypot(end[0] - start[0], end[1] - start[1]), maxDistance) > 5;
}

/** Direction is normalized so diagonal movement is not faster. Q/E stay vertical. */
export function movement(keys: Set<string>, yaw: number, pitch: number, seconds: number, speed: number) {
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const up = Number(keys.has('KeyE')) - Number(keys.has('KeyQ'));
  const direction = new Vector3(right, 0, -forward).applyEuler(new Euler(pitch, yaw, 0, 'YXZ'));
  direction.y += up;
  return direction.normalize().multiplyScalar(Math.max(0, Math.min(seconds, 0.05)) * speed);
}
