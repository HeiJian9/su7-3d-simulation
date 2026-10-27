import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Euler, MOUSE, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { isCameraDrag, movement, presets } from './cameraMath';
import { useScene } from './store';

const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const editing = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"]');

export function CameraRig() {
  const { camera, gl } = useThree();
  const mode = useScene((s) => s.mode);
  const request = useScene((s) => s.request);
  const panTool = useScene((s) => s.panTool);
  const controls = useRef<OrbitControls | null>(null);
  const keys = useRef(new Set<string>());
  const orientation = useRef(new Euler(0, 0, 0, 'YXZ'));
  const temp = useRef(new Vector3());

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'SU7 三维场景，点击后使用键盘移动');
    const perspective = camera as PerspectiveCamera;
    perspective.near = 0.01;
    perspective.far = 120;
    perspective.updateProjectionMatrix();
    let orbit: OrbitControls | null = null;
    if (mode === 'orbit') {
      orbit = new OrbitControls(camera, canvas);
      orbit.target.set(0, 0.85, 0);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.09;
      orbit.minDistance = 0.08;
      orbit.maxDistance = 24;
      orbit.maxPolarAngle = Math.PI * 0.495;
      orbit.update();
      controls.current = orbit;
    }
    orientation.current.setFromQuaternion(camera.quaternion, 'YXZ');
    let drag: { id: number; button: number; x: number; y: number; start: [number, number]; distance: number } | null = null;
    const down = (event: PointerEvent) => {
      canvas.focus({ preventScroll: true });
      if (event.button !== 0 && event.button !== 2) return;
      drag = { id: event.pointerId, button: event.button, x: event.clientX, y: event.clientY, start: [event.clientX, event.clientY], distance: 0 };
      if (mode === 'free') canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag.distance = Math.max(drag.distance, Math.hypot(event.clientX - drag.start[0], event.clientY - drag.start[1]));
      if (mode === 'free') {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (drag.button === 0) {
          orientation.current.y -= dx * 0.003;
          orientation.current.x = Math.max(-1.5, Math.min(1.5, orientation.current.x - dy * 0.003));
          camera.quaternion.setFromEuler(orientation.current);
        } else {
          camera.position.addScaledVector(temp.current.setFromMatrixColumn(camera.matrix, 0), -dx * 0.003);
          camera.position.y += dy * 0.003;
        }
      }
      drag.x = event.clientX;
      drag.y = event.clientY;
    };
    const up = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dragged = isCameraDrag(drag.start, [event.clientX, event.clientY], drag.distance);
      useScene.getState().patch({ gesture: dragged ? '相机拖动（已抑制部件点击）' : '场景点击（I1 无部件动作）' });
      if (!dragged && drag.button === 0 && !useScene.getState().panTool) canvas.dispatchEvent(new CustomEvent('su7:scene-click', { detail: { clientX: event.clientX, clientY: event.clientY } }));
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      drag = null;
    };
    const cancel = () => { drag = null; keys.current.clear(); };
    const wheel = (event: WheelEvent) => {
      if (mode !== 'free') return;
      event.preventDefault();
      camera.getWorldDirection(temp.current);
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
      camera.position.addScaledVector(temp.current, -Math.sign(pixels) * Math.min(Math.abs(pixels) * 0.0025, 0.65));
    };
    const keydown = (event: KeyboardEvent) => {
      if (editing(event.target) || document.activeElement !== canvas) return;
      if (event.code === 'KeyR') { useScene.getState().go('overview'); event.preventDefault(); }
      if (mode === 'free' && movementKeys.has(event.code)) { keys.current.add(event.code); event.preventDefault(); }
    };
    const keyup = (event: KeyboardEvent) => { keys.current.delete(event.code); };
    const contextmenu = (event: Event) => event.preventDefault();
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', contextmenu);
    canvas.addEventListener('blur', cancel);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      orbit?.dispose(); controls.current = null; cancel();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', contextmenu);
      canvas.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, [camera, gl, mode, request]);

  useEffect(() => {
    const preset = presets[useScene.getState().view];
    camera.position.set(preset.position[0], preset.position[1], preset.position[2]);
    camera.lookAt(new Vector3(...preset.target));
    (camera as PerspectiveCamera).zoom = 1;
    (camera as PerspectiveCamera).fov = ['cabin','ambient'].includes(useScene.getState().view) ? 68 : 42;
    camera.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.set(preset.target[0], preset.target[1], preset.target[2]);
      // Reset OrbitControls' damping state as well as the camera transform.
      controls.current.saveState();
      controls.current.reset();
      controls.current.update();
    }
    orientation.current.setFromQuaternion(camera.quaternion, 'YXZ');
    keys.current.clear();
  }, [camera, request]);

  useEffect(() => {
    if (controls.current) controls.current.mouseButtons.LEFT = panTool ? MOUSE.PAN : MOUSE.ROTATE;
  }, [panTool, mode, request]);

  useFrame((_, delta) => {
    controls.current?.update(delta);
    if (mode === 'free' && keys.current.size) {
      camera.position.add(movement(keys.current, orientation.current.y, orientation.current.x, delta, useScene.getState().speed));
    }
    camera.position.clamp(new Vector3(-25, -2, -25), new Vector3(25, 15, 25));
  });
  return null;
}
