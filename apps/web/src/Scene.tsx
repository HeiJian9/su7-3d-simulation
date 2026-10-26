import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { ACESFilmicToneMapping, Box3, Group, Mesh, Texture, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { AssetManifest } from '../../../packages/shared/src/asset';
import { CameraRig } from './CameraRig';
import { useScene } from './store';
import { WindowMechanism } from './WindowMechanism';

class WebGLErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="gpu-error" role="alert">WebGL 场景无法启动。请检查浏览器硬件加速，或刷新后重试。</div> : this.props.children; }
}

function RuntimeModel({ asset, attempt }: { asset: AssetManifest; attempt: number }) {
  const [model, setModel] = useState<Group | null>(null);
  useEffect(() => {
    let disposed = false;
    let scene: Group | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    const draco = new DRACOLoader().setDecoderPath('/decoders/draco/');
    const loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
    useScene.getState().patch({ loaded: false, progress: 0, loadError: null });
    const disposeScene = (group: Group) => {
      const textures = new Set<{ dispose: () => void }>();
      group.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) {
            if (value instanceof Texture) textures.add(value);
          }
          material.dispose();
        }
      });
      textures.forEach((texture) => texture.dispose());
    };
    const load = async () => {
      try {
        timer = setTimeout(() => abort.abort(), 25000);
        const response = await fetch(`${asset.runtimeUrl}?v=${asset.sha256}&attempt=${attempt}`, { signal: abort.signal });
        if (!response.ok) throw new Error(`模型文件读取失败（HTTP ${response.status}）`);
        const reader = response.body?.getReader();
        if (!reader) throw new Error('模型响应为空');
        const chunks: Uint8Array[] = [];
        let length = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value); length += value.length;
          if (!disposed) useScene.getState().patch({ progress: Math.min(95, Math.round(length / Math.max(asset.bytes, 1) * 95)) });
        }
        const buffer = new Uint8Array(length);
        let offset = 0;
        chunks.forEach((chunk) => { buffer.set(chunk, offset); offset += chunk.length; });
        if (buffer.byteLength !== asset.bytes) throw new Error('模型文件大小与资产记录不一致，请重新导入或重试。');
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))).map((v) => v.toString(16).padStart(2, '0')).join('');
        if (hash !== asset.sha256) throw new Error('模型 SHA-256 校验失败，请重新导入指定资产。');
        const gltf: GLTF = await loader.parseAsync(buffer.buffer, '/models/');
        scene = gltf.scene;
        if (disposed) { disposeScene(scene); return; }
        scene.rotation.y = asset.rotationY;
        scene.scale.setScalar(asset.scale);
        scene.updateMatrixWorld(true);
        const box = new Box3().setFromObject(scene);
        if (box.isEmpty()) throw new Error('GLB 中没有可观察的几何体');
        const center = box.getCenter(new Vector3());
        scene.position.add(new Vector3(-center.x, -box.min.y + 0.025, -center.z));
        let firstFrame = true;
        scene.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          object.castShadow = materials.some((m) => !m.transparent && m.opacity >= 1);
          object.receiveShadow = true;
          object.onAfterRender = () => {
            if (firstFrame) { firstFrame = false; useScene.getState().patch({ loadMs: Math.round(performance.now()) }); }
          };
        });
        setModel(scene);
        useScene.getState().patch({ loaded: true, progress: 100 });
      } catch (error) {
        if (!disposed) useScene.getState().patch({ loaded: false, loadError: error instanceof Error && error.name !== 'AbortError' ? error.message : '模型加载超时，请检查资产后重试。' });
      } finally { clearTimeout(timer); }
    };
    void load();
    return () => { disposed = true; abort.abort(); clearTimeout(timer); draco.dispose(); if (scene) disposeScene(scene); };
  }, [asset, attempt]);
  return model ? <><primitive object={model} dispose={null} /><WindowMechanism model={model} /></> : null;
}

function Diagnostics() {
  const { gl } = useThree();
  const sample = useRef({ frames: 0, time: 0, elapsed: 0 });
  const renderer = useRef('');
  useEffect(() => {
    gl.info.autoReset = false;
    const context = gl.getContext();
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    renderer.current = debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(context.getParameter(context.RENDERER));
    const canvas = gl.domElement;
    const lost = (event: Event) => { event.preventDefault(); useScene.getState().patch({ loadError: 'WebGL 上下文已丢失，请刷新页面恢复。' }); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl]);
  useFrame(({ camera }, delta) => {
    const calls = gl.info.render.calls;
    const triangles = gl.info.render.triangles;
    gl.info.reset();
    const s = sample.current;
    s.frames++; s.time += delta; s.elapsed += delta;
    if (s.time < 1) return;
    const round = (n: number) => Math.round(n * 1000) / 1000;
    useScene.getState().record({
      fps: Math.round(s.frames / s.time), calls, triangles,
      position: camera.position.toArray().map(round), rotation: camera.rotation.toArray().slice(0, 3).map((n) => round(Number(n))),
      renderer: renderer.current, elapsed: Math.round(s.elapsed), focused: document.hasFocus(), viewport: [innerWidth, innerHeight],
    });
    s.frames = 0; s.time = 0;
  }, -100);
  return null;
}

export function Scene({ asset, attempt }: { asset: AssetManifest | null; attempt: number }) {
  return <WebGLErrorBoundary><Canvas shadows dpr={[1, 1.5]} camera={{ position: [6.4, 3.15, -7.2], fov: 42, near: 0.01, far: 120 }}
    gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}>
    <color attach="background" args={['#0b1014']} />
    <fog attach="fog" args={['#0b1014', 16, 48]} />
    <hemisphereLight args={['#c4e1ec', '#253139', 0.7]} />
    <directionalLight position={[4, 7, -3]} intensity={2} color="#e6f2f6" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} />
    <directionalLight position={[-4, 3, 5]} intensity={1.2} color="#81c5be" />
    <Environment resolution={128} frames={1}>
      <Lightformer position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 3, 1]} intensity={4} />
      <Lightformer position={[-5, 3, 1]} rotation={[0, Math.PI / 2, 0]} scale={[8, 2, 1]} intensity={3} />
      <Lightformer position={[5, 2, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 1, 1]} intensity={2} color="#a0e2d6" />
    </Environment>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.015, 0]}>
      <planeGeometry args={[160, 160]} /><meshStandardMaterial color="#080e14" roughness={0.8} metalness={0.05} envMapIntensity={0.15} />
    </mesh>
    <gridHelper args={[36, 36, '#233a41', '#18282e']} position={[0, -0.008, 0]} material-transparent material-opacity={0.25} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}><ringGeometry args={[3.69, 3.7, 128]} /><meshBasicMaterial color="#37544f" transparent opacity={0.5} /></mesh>
    {asset?.status === 'ready' && <RuntimeModel asset={asset} attempt={attempt} />}
    <CameraRig /><Diagnostics />
  </Canvas></WebGLErrorBoundary>;
}
